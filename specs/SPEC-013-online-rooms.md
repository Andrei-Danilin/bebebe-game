# SPEC-013 — Online play on Cloudflare Durable Objects: private rooms, kids vs the AI Dad (mode A)

Status: ready
Complexity: L
Branch: SPEC-013-online-rooms
Decided by:
- **Andrei and the kids (2026-11-22):** kids in different apartments play together on their own devices; designed for many players; private rooms by code only, no chat; the room creator chooses the world and level.
- **Andrei (2026-11-26):**
  - the server runs on **Cloudflare Durable Objects** (one Durable Object per room), replacing the earlier Node + Azure plan;
  - the first version is the web game as it is, but the design must work for the Android and iPhone apps later;
  - only the room creator needs the Full game (SPEC-045); friends join free.
- **Andrei and the kids (2026-11-27):**
  - one online mode: friends join the room creator and play through **his** levels together; only his progress (stars, opened levels and worlds) changes;
  - guests get no stars or unlocks, even when the level is open in their own save (replaces the earlier rule);
  - the friends' coin bonus and the creator's coin share are SPEC-046;
  - rooms stay private, by code only.

Protocol, numbers, names, screens, texts: Claude (spec author). The kids may change the rules marked "kids may change".

## Description
A new menu item **Online**:
- one kid taps **Create room** and gets a short code (e.g. `K7QX2`);
- friends tap **Join** and type the code (or open the link a grown-up shares);
- in the lobby everybody sees the five kid slots (players and bots) and picks a look; the room creator picks the world and level and taps **Start**;
- they play together against the AI Dad; empty slots are bots;
- if somebody's internet drops, a bot takes their place until they reconnect;
- after the level everybody returns to the lobby; the room creator's stars and unlocks go into his save, and each kid's coins into his own (SPEC-046 adds the friends' bonus and the creator's share).

**Architecture:**
- a Cloudflare **Worker** (`online/`) routes `/ws?room=CODE` to a **Durable Object `Room`** named by the code;
- the Room runs the headless core (`src/core/`, SPEC-012) at the fixed step (SPEC-034), keeps the lobby state in its storage, and talks WebSocket to the clients;
- the lobby uses the **WebSocket Hibernation API**, so idle rooms cost nothing.

## Goal
- Up to 5 kids on separate devices in different homes play one level smoothly: your own hero moves without delay, the others move smoothly.
- The server computes everything; nobody can break a room by leaving; many rooms run at once with no server to maintain.
- Single-player and local two-player games are unchanged and still work offline.
- **Child safety:**
  - no chat, no free text from others, no strangers matched;
  - no persistent device identifier (RR-56);
  - sharing a link only behind the parents' gate (RR-55);
  - the room creator can lock the room and remove a player (RR-63).
- **Ready for the apps:** server URL and allowed origins from config, including the Capacitor origins; nothing web-only in the protocol.

## Context
- After SPEC-012: `createGame({ world, n, seed, mode, slots })`, `step`, `g.inputs[slot]`, `g.events`, `result`, `spent`; client `drainEvents()`; `progress.js` applies results through the ledger (SPEC-009).
- After SPEC-034: fixed `STEP` 1/60; after SPEC-045: `entitlement()` and `hasFull()`.
- Phone controls (joystick, 💋, 🩹, 👣); names typed locally (`bebebe-names`); outfits and the paid wardrobe (SPEC-009/027); the grown-ups page and gate (SPEC-025).
- Cloudflare:
  - Workers + Durable Objects (SQLite storage backend, available on the Free plan with daily limits; the Workers Paid plan from $5/month removes them);
  - WebSocket Hibernation;
  - `wrangler dev` runs locally with no account (Miniflare).
- Release-review items for online: RR-55, RR-56, RR-57 (SPEC-014), RR-63.

## Out of scope
- Deploying to Cloudflare, CI/CD, load test: SPEC-014 (here everything runs locally with `wrangler dev` and in tests).
- A player as Dad: SPEC-015.
- QR codes, emotes, chat, public matchmaking, friends lists, accounts, cloud saves.
- Store purchase checks (SPEC-045's later store spec). Here `entitlement` is trusted, and enforcement is off in the beta.

## Acceptance criteria
### Server (Worker + Durable Object)
1. **`online/` package:**
   - own `package.json`, `wrangler.toml` with the `Room` Durable Object binding (SQLite backend) and a migration;
   - `src/worker.js` (routes), `src/room.js` (the `Room` class), `src/protocol.js` (validation), `src/limits.js`;
   - it imports `../src/core/` directly and bundles it with wrangler; `src/core` must stay free of DOM and Node-only APIs (guard test).
   - `npm run online:dev` starts `wrangler dev --local` on port 8787.
   - Routes: `GET /health` → `{ ok, protocol }`; `GET /ws?room=CODE` (WebSocket upgrade) → the `Room` named `CODE`; `POST /rooms` → a new code.
2. **Room codes:**
   - `POST /rooms` picks a random code of `CFG.ONLINE.CODE_LEN` (5) from `CFG.ONLINE.CODE_ALPHABET` (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), asks that Room to `create` (it refuses if already live), retries up to 5 times, and answers `{ code }`;
   - joining an unknown or closed code → `error { code: "roomNotFound" }`;
   - a full room → `roomFull`;
   - a locked room (AC 9) → `roomLocked`.
3. **Simulation:**
   - while a level is playing, the Room keeps one game (`createGame`) and steps it at `STEP` from a timer (the Room is awake only during play);
   - it sends `snapshot` at `CFG.ONLINE.SNAP_HZ` (20): `{ tick, ackSeq (per client), littles, big, items, stars, kisses, hud, events }` (events since the last snapshot; pop keys, not text);
   - in the lobby and the result screen there is no timer: the Room hibernates between messages;
   - a step that takes more than 8 ms is counted (metric).
4. **Protocol v1 (JSON, ≤ `CFG.ONLINE.MAX_MSG` 2048 bytes, validated: types, ranges, the input vector clamped to length 1, unknown fields dropped):**
   - client → server: `hello { protocol: 1, clientVersion, platform: "web"|"ios"|"android", entitlement: "free"|"full", token? }`, `setLook`, `setName { adj, animal }`, `setGear { glove, gloveCharges, kisses, kits, upgrades }`, `setProgress { worlds }` (owner), `setLevel { world, n }` (owner), `lock { on }` (owner), `remove { slot }` (owner), `start` (owner), `input { seq, mx, my, kiss, kit, tiptoe }`, `leave`, `ping`;
   - server → client: `welcome { token, slot }`, `updateRequired`, `roomState { code, owner, slots, world, n, phase: "lobby"|"play"|"result", locked, map }`, `snapshot`, `result`, `removed`, `error`, `pong`;
   - an unknown `protocol` → `updateRequired`;
   - more than `CFG.ONLINE.MAX_MSG_RATE` (60) messages/s → the socket is closed.
5. **Leaving and reconnecting:**
   - a dropped or leaving player's slot is taken over by a bot at once (same look and name);
   - with the same `token` within `CFG.ONLINE.REJOIN_TIME` (60 s) the player gets the slot back;
   - the owner leaving passes ownership to the longest-connected player;
   - a room with no humans is closed after `CFG.ONLINE.EMPTY_ROOM_TTL` (120 s, a Durable Object alarm), a lobby with no action after `CFG.ONLINE.IDLE_ROOM_TTL` (900 s);
   - joining during play takes a bot's slot.
   - The token is random per session, kept only in the Room's memory and the client's memory, **never stored on the device and never a device identifier** (RR-56).
6. **Lobby state in storage:** the Room writes `{ code, owner, slots (names, looks), world, n, locked }` to its storage on every lobby change. After a deploy or an eviction, the Room restores the lobby and clients reconnect with their token (AC 13). A level in progress at that moment ends and everybody is back in the lobby (coins earned so far are applied as for leaving a level).
7. **Hosting needs the Full game:**
   - `POST /rooms` and `create` accept only clients whose `hello.entitlement` is `full` when `CFG.MONETIZATION.enforce` is true (off in the beta: everybody can host);
   - joining never needs it;
   - the host's choice decides the world, so a free guest can play any world in a host's room.
   - The server trusts `entitlement` for now; a store receipt check is a later spec.
8. **Safety and privacy:**
   - the Worker checks `Origin` against `CFG.ONLINE.ORIGINS`: the Pages origin, `http://localhost:*`, and for the apps later `capacitor://localhost` and `https://localhost`;
   - rate limits per client IP: at most `CFG.ONLINE.ROOMS_PER_IP_MIN` (5) rooms and `CFG.ONLINE.JOINS_PER_IP_MIN` (20) join attempts per minute, counted in memory by a small `Limiter` Durable Object keyed by a salted hash of the IP that rotates daily, with nothing stored;
   - no IPs, names or tokens in any log (test with a log spy).

### Owner controls (RR-63)
9. **The owner can:**
   - **lock** the room: no new joins, existing players can still rejoin with their token;
   - **remove** a player: their slot becomes a bot, they see "You left the room" and can't rejoin that room with the same token.
   Both show in the lobby (owner only) and work in four languages.

### Names, looks, gear, rewards
10. **Online names are picked, not typed** (Claude, kids may change):
    - a name is `{ adj, animal }` indices into `I18N.onlineAdj` / `I18N.onlineAnimal` (16 each), so every client shows it in its own language ("Fast Penguin" / "Pingüino Rápido" / "Pinguim Rápido" / "Быстрый Пингвин");
    - 🎲 and ◀ ▶ for both parts; saved in the save as `online.name`;
    - typed local names are never sent; the server accepts only valid indices.
11. **Looks and gear:** each player sends the outfit he has (paid wardrobe items included) and his own gloves, charges, kisses, kits and upgrades. The server trusts them, clamped to the shop maximums.
12. **Level choice and rewards** (Andrei and the kids, 2026-11-27: one mode, play through the owner's game):
    - the owner sends `setProgress { worlds }` when he becomes owner and after every result: per world its open state and reason (SPEC-045 "purchase" included), `unlocked`, `won` and `stars`, in a compact form that fits `MAX_MSG`. The Room keeps it with the lobby state and sends it to everybody as `roomState.map`; the owner picks any level open on that map (the Room refuses others);
    - at the result the Room computes the reward with the core's `computeReward(ownerProgress, result)` (headless) and sends `result` per slot. If SPEC-012's result has single-player stats, add per-slot hugs and picked-up star coins;
    - the owner gets the level's coins, his own hugs and `world` (stars and the next level's unlock), applied to his save as in single play;
    - every other kid gets only the coins for his own hugs and the stars he picked up — **no stars or unlocks, even when the level is open in his own save**;
    - SPEC-046 adds the friends' bonus and the owner's coin share on top of this;
    - spent kisses and kits are taken from his own save as they happen.

### Client
13. **Screens:** Menu → **Online** (desktop and phone; keyboard, gamepad, touch):
    - **Create room**; **Join** with the code typed in the name-input overlay (upper-cased, alphabet-filtered);
    - the link `…/?room=CODE` opens the join directly;
    - **Lobby:** the big code; five kid slots (name, look preview, 👑 owner, 🤖 bot, 📶 reconnecting); the owner's world/level picker, Lock and Remove, and Start; Leave.
    - **Share** (Web Share / copy link) is **behind the parents' gate** (RR-55); the child reads the big code aloud.
    - Auto-reconnect with backoff (1, 2, 4, 8 s) using the session token; "Reconnecting…" banner.
    - All texts in en / es / pt / ru; phone texts not below `PHONE_TEXT` sizes.
14. **Smooth play:**
    - your own hero is predicted with the core's movement code and reconciled with `ackSeq` (correction eased, never a jump over 1 cell unless the server teleported him);
    - other characters are drawn `CFG.ONLINE.INTERP_MS` (100) behind, interpolated between snapshots;
    - pushes, hugs, rescues, items and kisses are only what the server says;
    - `?lag=<ms>` adds artificial latency (debug); a ping badge in the online HUD.
15. **One device = one player online** (also on PC). Camera, mini-map, arrows and the phone buttons work as in single play; the team chips show online names.
16. **Server unreachable** (offline, server down, `updateRequired`): a clear screen with "Back to menu"; single play unaffected.
    - Server address `CFG.ONLINE.SERVERS = { local: "ws://localhost:8787", staging: "", prod: "" }`, chosen by `?server=local|staging|prod` (debug), default `prod` on the site and in the apps, `local` on localhost (SPEC-014 fills the URLs).
    - The service worker never caches the online origin.

### Tests and tools
17. **Tests:**
    - `tests/online/*.test.mjs` with `node --test` against `wrangler dev --local` (or Miniflare's API): codes, protocol validation, limits, drop/bot/rejoin, owner migration, lock/remove, lobby restore after a Room restart, hosting with enforce on;
    - `tests/online.spec.js` (Playwright, 3 browser contexts): create, join, start, play, result;
    - "with 150 ms lag the own hero moves without jumps" (prediction error after reconciliation < 8 logic px over 10 s);
    - "server down shows a message".
    - `scripts/fake-clients.js` (N rooms × M clients driven by the autopilot) for SPEC-014's load test.
18. **Docs:**
    - `docs/architecture.md`: Worker, Room, protocol, prediction;
    - `docs/game-design.md`: online rules;
    - `README.md`: how to run online locally;
    - `docs/reviews/release-readiness.md`: RR-55, RR-56, RR-63 done.

## Implementation steps (TDD: failing test first in each)
1. `online/` skeleton, wrangler config, `/health`, `POST /rooms`, `Room` create/join, protocol validation, limits (node tests).
2. Simulation in the Room, snapshots, events; leave/rejoin/owner; lobby storage and restore; alarms.
3. Owner controls; hosting entitlement.
4. Client online module (`src/client/online/`: `net.js`, `predict.js`, `interp.js`, `lobby.js`): menu, create/join/link, lobby, names, gear and looks, gated Share.
5. Online play: render from snapshots, prediction, interpolation, lag, ping; level choice and rewards.
6. Errors and offline; Playwright multi-context tests; `fake-clients.js`.
7. Docs; reviews; merge.

## Numbers and texts
| Key | Value / en | es | pt | ru |
|---|---|---|---|---|
| `CODE_LEN` / `CODE_ALPHABET` | 5 / `ABCDEFGHJKMNPQRSTUVWXYZ23456789` | | | |
| `MAX_LITTLES` | 5 | | | |
| `SNAP_HZ` / `INTERP_MS` | 20 / 100 | | | |
| `MAX_MSG` / `MAX_MSG_RATE` | 2048 / 60 | | | |
| `REJOIN_TIME` / `EMPTY_ROOM_TTL` / `IDLE_ROOM_TTL` | 60 / 120 / 900 s | | | |
| `ROOMS_PER_IP_MIN` / `JOINS_PER_IP_MIN` | 5 / 20 | | | |
| `online` | Online | Online | Online | Онлайн |
| `createRoom` | Create room | Crear sala | Criar sala | Создать комнату |
| `joinRoom` | Join | Unirse | Entrar | Войти |
| `roomCode` | Room code | Código de sala | Código da sala | Код комнаты |
| `lockRoom` / `unlockRoom` | Lock room / Unlock room | Cerrar sala / Abrir sala | Trancar sala / Abrir sala | Закрыть комнату / Открыть комнату |
| `removePlayer` | Remove | Sacar | Tirar | Убрать |
| `waitOwner` | Waiting for {name} to start… | Esperando que {name} empiece… | Esperando {name} começar… | Ждём, когда {name} начнёт… |
| `reconnecting` | Reconnecting… | Reconectando… | Reconectando… | Переподключаемся… |
| `removedFromRoom` | You left the room | Saliste de la sala | Você saiu da sala | Ты вышел из комнаты |
