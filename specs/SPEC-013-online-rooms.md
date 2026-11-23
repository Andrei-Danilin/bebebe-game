# SPEC-013 — Online play: server, private rooms, Little Ones vs the AI Big One (mode A)

Status: ready
Complexity: L
Branch: SPEC-013-online-rooms
Decided by: Andrei and the kids (2026-11-22): kids in different apartments play together, each on their own device (phone, tablet, PC); a server computes the game; it is designed from the start for many players because the game will go to Google Play and the App Store. Andrei accepted Claude's defaults: private rooms by code only, no chat, the room creator chooses mode/place/level. Everything else (protocol, numbers, names, screens, texts): Claude (spec author). The kids may change the "kids may change" rules.

## Description
A new menu item **Online**. One kid taps "Create room" and gets a short code (e.g. `K7QX2`) and a "Share" link; friends tap "Join" and type the code or open the link. In the lobby everybody sees the five Little One slots (kids and bots), picks an outfit, and the room creator picks the world and the level and taps "Start". They play together against the AI Big One; empty slots are bots. If somebody's internet drops, a bot takes their place and they get it back when they reconnect. After the level everybody returns to the lobby; each kid's coins and stars go into their own save.

## Goal
- Up to 5 kids on separate devices in different homes play one level smoothly (own hero moves without delay, others move smoothly).
- The server computes everything (`src/core/`), many rooms per process; nobody can break a room by leaving.
- Single-player and local two-player games are unchanged and still work offline.
- Child safety: no chat, no free text from other players, no strangers matched.

## Context
- After SPEC-012: `createGame({ world, n, seed, mode, slots })`, `useGame`, `step`, `g.inputs[slot]`, `g.events` (gameplay + `sfx`/`burst`/`pop`/`shake`/`banner`), `result`, `spent`; client `drainEvents()`, `progress.js` applies results through the ledger (SPEC-009).
- Worlds and levels `(world, n)`; `progress.worlds[w].unlocked`; one player per phone (`PHONE`), joystick + 💋 + 🩹 buttons (SPEC-004/005/007); names typed locally in `bebebe-names` (SPEC-003); outfits in `bebebe-outfits`, paid wardrobe (SPEC-009).
- Name input overlay pattern (`openNameInput`) exists for typing on phones.
- Node on Andrei's machine: 24; tests: Playwright (`webServer` = `scripts/serve.js`) and `node --test`.

## Out of scope
- Deployment, Azure, CI/CD for the server, load test (SPEC-014) — here the server runs locally (`npm run server`) and in tests.
- The human Big One (SPEC-015).
- QR code (needs an encoder library — BACKLOG), emotes, chat, public matchmaking, friends lists, accounts and cloud saves (BACKLOG).
- App store builds (Capacitor) — later; nothing here may block them (server address from config, relative paths).

## Acceptance criteria
### Server
1. `server/` (own `package.json`, `type: module`, Node ≥ 20, one runtime dependency `ws`, pinned) imports `../src/core/` directly. `npm run server` (root script) starts it on `PORT` (default 8787): HTTP `/health` → `{ ok, rooms, players, protocol }`, WebSocket on `/ws`. → `tests/server/health.test.mjs`
2. **Rooms:** `createRoom` → a room with a code of `CFG.ONLINE.CODE_LEN` (5) characters from `CFG.ONLINE.CODE_ALPHABET` (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, no 0/O/1/I/L); unique among live rooms. Max `CFG.ONLINE.MAX_LITTLES` (5) humans in mode A. The creator is the **owner**. Join a full or unknown room → `error { code: "roomFull" | "roomNotFound" }`. → `tests/server/rooms.test.mjs`
3. **Simulation:** each playing room runs `step` at `CFG.ONLINE.TICK_HZ` (30) with a fixed dt and sends `snapshot` at `CFG.ONLINE.SNAP_HZ` (20): `{ tick, ackSeq (per client), littles, big, items, stars, kisses, hud, events }` (events since the last snapshot; `pop` keys, not text). One process holds many rooms; a slow room never blocks others for more than one tick (each tick loop measures and the server logs ticks over 15 ms). → `tests/server/sim.test.mjs` "20 rooms tick at 30 Hz"
4. **Protocol v1 (JSON):** client → `hello { protocol: 1, clientVersion, deviceId, token? }`, `createRoom`, `joinRoom { code }`, `setLook { look, name }`, `setGear { glove, gloveCharges, kisses, kits, upgrades }`, `setLevel { world, n }` (owner), `start` (owner), `input { seq, mx, my, kiss, kit }`, `leave`, `ping`; server → `welcome { token }`, `updateRequired`, `roomState { code, owner, slots, world, n, phase: "lobby" | "play" | "result" }`, `snapshot`, `result`, `error`, `pong`. Unknown `protocol` → `updateRequired`. Every message ≤ `CFG.ONLINE.MAX_MSG` (2048 bytes) and validated (types, ranges, vector clamped to length 1, unknown fields dropped); more than `CFG.ONLINE.MAX_MSG_RATE` (60) messages per second → the connection is closed. → `tests/server/protocol.test.mjs`
5. **Leaving and reconnecting:** a dropped or leaving player's slot is taken over by a bot at once (same look and name); with the same `token` within `CFG.ONLINE.REJOIN_TIME` (60 s) the player gets the slot back. The owner leaving passes ownership to the longest-connected player; the game goes on. A room with no humans is deleted after `CFG.ONLINE.EMPTY_ROOM_TTL` (120 s); a room in the lobby with no action for `CFG.ONLINE.IDLE_ROOM_TTL` (900 s) is closed. Joining during play takes a bot's slot. → `tests/server/rooms.test.mjs` "drop, bot takes over, rejoin", "owner migration"
6. **Safety:** the server checks `Origin` against `CFG.ONLINE.ORIGINS` (the Pages site, localhost; app-store origins added later), allows at most `CFG.ONLINE.ROOMS_PER_IP_MIN` (5) new rooms and `CFG.ONLINE.JOINS_PER_IP_MIN` (20) join attempts per IP per minute, keeps IPs only in memory for these counters, logs no IPs and no names. → `tests/server/protocol.test.mjs` "join attempts are limited"

### Names, looks, gear, rewards
7. **Online names are picked, not typed** (Claude's decision, kids may change): a name is `{ adj, animal }` indices into `I18N.onlineAdj` / `I18N.onlineAnimal` (16 each), so every client shows it in its own language ("Fast Penguin" / "Pingüino Rápido" / "Быстрый Пингвин"). The lobby has 🎲 and ◀ ▶ for both parts; the choice is saved in `bebebe-names.online`. Typed local names are never sent. The server accepts only valid indices. → `tests/online.spec.js` "online names are picked and shown in each language"
8. Looks: each player sends the outfit he has (incl. paid wardrobe items from SPEC-009); gear: his own gloves/charges, kisses, kits and upgrades from his own save. The server **trusts** these values (no accounts yet — BACKLOG "server-side progress") but clamps them to the shop's maximums. Bots wear random outfits as today.
9. **Level choice:** the owner picks any world and level **he** has unlocked (world cards + level selector, as in the menu). **Rewards** (`result`): every client applies its `perSlot` part through its own ledger and save: coins always; stars and the next level's unlock only if that level is already unlocked in **his** save (Claude's decision). Spent kisses/kits (`spent`) are taken from his own save as they happen. → `tests/online.spec.js` "a guest earns coins but unlocks nothing new"

### Client
10. **Menu → Online** (desktop and phone layouts, keyboard/gamepad/touch): "Create room", "Join" (code typed in the name-input overlay, upper-cased, alphabet-filtered) and a link `…/?room=CODE` that opens the join directly. **Lobby:** big code, "Share" (Web Share API, else copy to clipboard with a "Copied!" pop), five Little One slots (name, outfit preview, 👑 owner, 🤖 bot, 📶 reconnecting), the owner's world/level picker and "Start", "Leave". Everything in en/es/ru; phone texts not below `PHONE_TEXT` sizes. → `tests/online.spec.js` "create, share, join, start" (3 browser contexts against a local server)
11. **Smooth play:** the own hero is **predicted** with the core's movement code and reconciled with `ackSeq` (correction eased, never a jump over 1 cell unless the server teleported him, e.g. thrown out of the Big One's house); other characters are drawn `CFG.ONLINE.INTERP_MS` (100) behind with interpolation between snapshots. Pushes, hugs, rescues, items, kisses are only what the server says. `?lag=<ms>` adds artificial latency both ways (debug); a small ping badge in the online HUD. → `tests/online.spec.js` "with 150 ms lag the own hero moves without jumps" (prediction error after reconciliation < 8 logic px, measured over 10 s of walking)
12. **One device = one player** online (also on PC). The phone camera, mini-map, edge arrows, 💋 and 🩹 buttons work as in single play; in the HUD the team chips show online names.
13. **Server unreachable** (no internet, server down, `updateRequired`): a clear screen in en/es/ru with "Back to menu"; single play unaffected. Server address: `CFG.ONLINE.SERVERS = { local: "ws://localhost:8787/ws", staging: "", prod: "" }`, chosen by `?server=local|staging|prod|<wss-url>`, default `prod` on Pages and `local` on localhost (SPEC-014 fills the URLs). → `tests/online.spec.js` "server down shows a message"
14. The service worker never caches `/ws` or the server origin; the offline app shows the "server unreachable" screen for Online.

### Tests and tools
15. `playwright.config.js` starts the game server as a second `webServer` (`npm run server`, `PORT` 8787, `/health`). `tests/server/*.test.mjs` run with `node --test` (WebSocket clients from `ws`), added to `npm run test:core` → renamed `npm run test:node`, run in `pages.yml`. A tiny `scripts/fake-clients.js` (N rooms × M clients driven by the SPEC-008 autopilot logic on the client side) is used by the sim test and later by SPEC-014's load test.

## Implementation steps
1. Server skeleton, `/health`, rooms, codes, protocol validation, limits — Node tests first (AC 1, 2, 4, 6).
2. Simulation loop with `createGame` per room, snapshots, events (AC 3); leave/rejoin/owner (AC 5).
3. Client online module (`src/client/online/`: `net.js` socket + protocol, `predict.js`, `interp.js`, `lobby.js` screens): menu item, create/join/link, lobby (AC 10), names (AC 7), gear/looks (AC 8).
4. Online play: render from snapshots, prediction/interpolation, lag param, ping (AC 11, 12); level choice and rewards (AC 9).
5. Errors and offline (AC 13, 14); Playwright multi-context tests; `fake-clients.js` (AC 15).
6. Docs; whole suite + node tests; reviews (code + architect); merge, push, close.

## Numbers and texts
| CFG / I18N key | value | en | es | ru |
|---|---|---|---|---|
| `CFG.ONLINE.CODE_LEN` / `CODE_ALPHABET` | 5 / `ABCDEFGHJKMNPQRSTUVWXYZ23456789` | | | |
| `CFG.ONLINE.MAX_LITTLES` | 5 | | | |
| `CFG.ONLINE.TICK_HZ` / `SNAP_HZ` / `INTERP_MS` | 30 / 20 / 100 | | | |
| `CFG.ONLINE.MAX_MSG` / `MAX_MSG_RATE` | 2048 / 60 | | | |
| `CFG.ONLINE.REJOIN_TIME` / `EMPTY_ROOM_TTL` / `IDLE_ROOM_TTL` | 60 / 120 / 900 s | | | |
| `CFG.ONLINE.ROOMS_PER_IP_MIN` / `JOINS_PER_IP_MIN` | 5 / 20 | | | |
| `online` | | Online | Online | Онлайн |
| `createRoom` | | Create room | Crear sala | Создать комнату |
| `joinRoom` | | Join | Unirse | Войти |
| `roomCode` | | Room code | Código de sala | Код комнаты |
| `share` | | Share | Compartir | Поделиться |
| `copied` | | Copied! | ¡Copiado! | Скопировано! |
| `startOnline` | | Start | Empezar | Старт |
| `leaveRoom` | | Leave | Salir | Выйти |
| `waitOwner` | | Waiting for {name} to start… | Esperando que {name} empiece… | Ждём, когда {name} начнёт… |
| `slotBot` | | Bot | Bot | Бот |
| `reconnecting` | | Reconnecting… | Reconectando… | Переподключаемся… |
| `roomNotFound` | | No room with this code | No hay ninguna sala con ese código | Комнаты с таким кодом нет |
| `roomFull` | | The room is full | La sala está llena | В комнате нет мест |
| `serverDown` | | Can't reach the game server. Check the internet and try again. | No se puede conectar al servidor. Fijate si tenés internet y probá de nuevo. | Не получается связаться с сервером. Проверь интернет и попробуй ещё раз. |
| `updateRequired` | | Update the game to play online | Actualizá el juego para jugar online | Обнови игру, чтобы играть онлайн |
| `onlineAdj` (16) | | Fast, Brave, Sneaky, Happy, Tiny, Jolly, Quiet, Lucky, Smiley, Fluffy, Clever, Bouncy, Sleepy, Funny, Shiny, Nimble | Rápido, Valiente, Sigiloso, Feliz, Chiquito, Alegre, Silencioso, Suertudo, Risueño, Peludo, Astuto, Saltarín, Dormilón, Gracioso, Brillante, Ágil | Быстрый, Смелый, Хитрый, Весёлый, Крошечный, Озорной, Тихий, Везучий, Улыбчивый, Пушистый, Умный, Прыгучий, Сонный, Смешной, Блестящий, Ловкий |
| `onlineAnimal` (16) | | Penguin, Fox, Bear Cub, Owl, Hedgehog, Bunny, Dolphin, Kitten, Puppy, Raccoon, Hamster, Lion Cub, Duckling, Beaver, Tiger Cub, Parrot | Pingüino, Zorro, Osito, Búho, Erizo, Conejo, Delfín, Gatito, Perrito, Mapache, Hámster, Leoncito, Patito, Castor, Tigrecito, Loro | Пингвин, Лис, Медвежонок, Филин, Ёжик, Кролик, Дельфин, Котёнок, Щенок, Енот, Хомяк, Львёнок, Утёнок, Бобёр, Тигрёнок, Попугай |

Name order per language: en "Adj Animal", es "Animal Adj", ru "Adj Animal". Every animal is masculine in es and ru, so every adjective agrees with every animal (keep it so when the lists change).

## Docs to update
`game-design.md` (new section "Онлайн": modes, rooms, names, rewards, who decided what), `architecture.md` (server, protocol, room lifecycle, client online modules, prediction/interpolation), `CLAUDE.md` (commands `server`, `test:node`; server tests; hard rule: no chat/free text between players), `README.md` (how to play online, how to run the server locally).
