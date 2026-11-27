# SPEC-014 — Online server and the site on Cloudflare: staging and prod, one release train, the site move, privacy, load test, costs

Status: ready
Blocked: needs Andrei's Cloudflare account and an API token as GitHub secrets (step 1 below); the run stops at step 1 and asks if they are missing.
Complexity: L (was M; the site move was added on 2026-11-27)
Branch: SPEC-014-online-deploy
Decided by: Andrei (2026-11-26): Cloudflare Durable Objects instead of Azure; start on the Free plan, switch to Workers Paid ($5/month) when the free limits are near. Everything else: Claude (spec author). This replaces the earlier Azure version of SPEC-014.
- **Andrei (2026-11-27):** the site moves from GitHub Pages to Cloudflare in this spec, so the repository can become private (GitHub Free has Pages only in public repositories); the repository is "All rights reserved" (`LICENSE`, committed on master). Andrei changes the repository's visibility himself after the farewell window (AC 14).
- **Claude (2026-11-27):** one release train for the server and the site (AC 2), so the live site never runs a client newer than the prod server.

## Description
After this spec the kids can play online from different apartments:
- SPEC-013's Worker and `Room` Durable Object run on Cloudflare in two environments, **staging** and **prod**;
- the site moves from GitHub Pages to Cloudflare (free static hosting) and, like the apps later, connects to prod;
- every merge to `master` deploys in one train: the server (staging → smoke → prod, when the online code changed), then the site;
- the old GitHub Pages address hands the kids' saves over to the new one, so nobody loses progress, and then the repository can become private.

## Goal
- `wss://` reachable from the Pages site and from phones on mobile data; deploys need no manual steps.
- We know how many rooms fit in the free limits and what more costs.
- Privacy: no IPs, names or tokens logged; no third-party analytics (RR-57).
- The site lives on Cloudflare, the kids' progress moves over, and making the repository private breaks nothing.

## Context
- After SPEC-013: `online/` (Worker, `Room`, `Limiter`), `wrangler.toml`, `npm run online:dev`, `CFG.ONLINE.SERVERS` / `ORIGINS`, `scripts/fake-clients.js`, node tests.
- Workflows: `tests.yml`, `pages.yml`, `balance.yml`. Repo `github.com/Andrei-Danilin/bebebe-game` (public now; Andrei makes it private after this spec, AC 14); site `https://andrei-danilin.github.io/bebebe-game/` until this spec.
- GitHub Free (check at run time): Pages only in public repositories; standard Actions runners free in public repositories, 2,000 minutes a month in private ones.
- Cloudflare static assets on Workers (check at run time): requests to static assets are free and unlimited on every plan; the Free plan allows 20,000 files per Worker version and 25 MiB per file.
- Saves are per browser origin (`localStorage`, SPEC-025): a new address starts empty unless the saves are handed over.
- Cloudflare limits and prices (check at run time):
  - Free plan Durable Objects (SQLite backend) have daily limits on requests and duration;
  - WebSocket messages are billed at a 20:1 ratio;
  - Workers Paid is $5/month per account with included usage.

## Out of scope
- A custom domain (D-5, later): when it comes, the site and online Workers only need a custom-domain entry and an `ORIGINS` line;
- the app-store builds (origins already allowed by SPEC-013);
- changing the repository's visibility (Andrei does it, AC 14).
- Server-side purchase checks.

## Acceptance criteria
1. **Environments:** `wrangler.toml` has `[env.staging]` and `[env.production]`, with Workers `bebebe-online-staging` and `bebebe-online` on `workers.dev`, their own Durable Object namespaces and migrations, and `ORIGINS` per environment (staging also allows localhost).
2. **One release train (`pages.yml` becomes `release.yml`):**
   - it keeps today's shape: resolve the commit once → tests → build → deploy → live check, and the `ref` input for rollbacks;
   - on push to `master`: the tests; if the commit touches `online/**`, `src/core/**` or `src/i18n.js`: the online node tests → `wrangler deploy --env staging` → smoke (`/health` ok; `scripts/fake-clients.js` plays one short room to the end) → `wrangler deploy --env production` → the same smoke; then the site deploy (AC 10) and its live check. The site never goes live before the prod server it needs;
   - `workflow_dispatch` with `ref` (a tag) redeploys that commit's server and site: the rollback (`docs/release.md`);
   - version tags `v*` mark releases and are what rollbacks use; a tag alone deploys nothing.
   - Auth: repository secrets `CLOUDFLARE_API_TOKEN` (a token scoped to Workers Scripts and Durable Objects edit for this account only) and `CLOUDFLARE_ACCOUNT_ID`; nothing secret in the repo.
3. **URLs:** `CFG.ONLINE.SERVERS.staging` / `prod` hold the two `wss://…/ws` URLs; the site uses `prod`; `?server=staging` for testing.
4. **Deploys don't break kids:**
   - a deploy restarts Rooms; the client shows "The server is updating, back in a moment" (four languages), reconnects with its token, and the lobby is restored (SPEC-013 AC 6);
   - a test against `wrangler dev` restarts the Room mid-lobby and mid-level.
5. **Privacy and logs (RR-57):**
   - Workers Logs for production are off, or limited to counts (rooms created/closed, errors by code) with no IPs, names, tokens or codes;
   - the client is never given any third-party script;
   - `docs/server-privacy.md` states what the server keeps (room state in memory and Durable Object storage until the room closes, nothing else), where it runs (Cloudflare, nearest location), retention, and Cloudflare as processor.
   - Text for the future privacy policy (D-13).
6. **Metrics:** `GET /metrics` (staging, or a secret header in prod) returns `{ roomsLive, playersLive, roomsCreatedToday, slowSteps, protocolErrors, rejectedJoins }` from a tiny `Stats` Durable Object updated by Rooms (counts only).
7. **Load test:**
   - `npm run load -- --url <wss> --rooms 50 --players 5 --minutes 5` (fake clients) against staging;
   - report step p95, dropped snapshots, and the request / duration usage from the Cloudflare dashboard API into `docs/server-capacity.md`.
   - Also there: how many room-hours per day fit the Free plan, the cost per 1,000 room-hours on Workers Paid, and when to switch (usage > 70% of the free daily limit for 3 days).
   - Not a merge stop: numbers go to the final report.
8. **Protocol gate:** prod keeps accepting the previous `protocol` for 30 days after a bump (app-store users update slowly), else `updateRequired`. A test checks `updateRequired` for an unknown version.
9. **Docs:**
   - `docs/architecture.md`: deployment, environments, the site Worker;
   - `docs/server-capacity.md`, `docs/server-privacy.md` (new);
   - `docs/release.md`: the release train, rollback by tag, the save move and the farewell window, the CI-minutes estimate (AC 15);
   - `CLAUDE.md`: the release workflow, the new site URL, never commit tokens;
   - `README.md`: the new site URL, online play, how releases go out, and a line "All rights reserved, see `LICENSE`";
   - `package.json`: `"license": "UNLICENSED"` (npm's word for "not open source");
   - `docs/reviews/release-readiness.md`: RR-57 done.

### The site on Cloudflare (Andrei, 2026-11-27)
10. **The site Worker:**
    - an assets-only Worker `bebebe-game` (its own `wrangler.site.toml`) with `assets.directory` = the `npm run site` output and **no Worker script**, so every request is a free static request;
    - address `https://bebebe-game.<account-subdomain>.workers.dev/`, held in one place (`scripts/site-url.js` or config) and used by the live check, the docs and the farewell build;
    - a `_headers` file: `index.html`, `sw.js`, `version.txt` and `manifest.webmanifest` get `Cache-Control: no-cache`;
    - the site works at the root and at a sub-path: a test fails on an absolute `/bebebe-game/` path in the site files (today's files already use relative paths).
11. **Live check and smoke:**
    - as today: the deployed `version.txt` must equal the commit sha (two attempts, then fail);
    - then a Playwright smoke against the live URL: the menu opens, a practice level starts, and the second load works offline (service worker).
12. **Origins:** `CFG.ONLINE.ORIGINS` (prod and staging) gets the new site origin. The GitHub Pages origin stays until the farewell window ends (AC 14); removing it is a follow-up commit, listed in the final report.
13. **Moving the kids' saves.** Saves live in the browser per address, so the old site's progress doesn't appear on the new one by itself.
    - **The farewell build** (`npm run site -- --farewell`) is the last thing GitHub Pages serves:
      - a page in the game's style, "The game has moved! / Tap to continue", in four languages;
      - it reads the local saves (progress, settings, names, language), packs them as JSON → base64url into the URL **fragment** (`#move=…`, never sent to any server) and opens the new address;
      - its service worker replaces the old one, clears the old caches and unregisters, so an installed old app opens the farewell page and not a frozen old game;
      - for an installed app it also says "Open the new link and add the game to your home screen again".
    - **The new site**, when it loads with `#move=`:
      - validates the data with the save loaders (they never throw), capped at `MOVE_MAX` (64 KB);
      - if it has no progress of its own, imports the data; otherwise shows a choice behind the grown-ups gate, "Keep this one / Use the moved one", with each one's stars and coins;
      - then removes the fragment from the address bar (`history.replaceState`).
    - **Tests:**
      - Playwright with two origins (two local ports) moves a save with stars, coins, wardrobe items and the language;
      - a broken or oversized fragment is ignored with no crash and no data change.
14. **The farewell window:**
    - after the new site is live and green, `release.yml` deploys the farewell build to GitHub Pages once, and then the Pages deploy job is removed;
    - the old address should stay up at least `FAREWELL_DAYS` (14), so every family device opens it once. After that Andrei makes the repository private (on GitHub Free a private repository has no Pages); he can do it earlier with GitHub Pro for the window;
    - the run never changes the repository's visibility. It lists this step, with the earliest date, in the final report.
15. **CI minutes for a private repository** (2,000 a month on GitHub Free):
    - measure the minutes per spec-branch push and per `master` merge from the run timings (`gh api`);
    - write a monthly estimate at the current pace to `docs/release.md`;
    - if it is over 1,500, propose cuts in the report (for example, the Playwright shards only on `master` merges and on a spec branch's last push). Don't make the cuts here.

## Implementation steps
1. **Andrei, once (the run prints these and waits):**
   - create a Cloudflare account (free) if needed;
   - create an API token: template "Edit Cloudflare Workers", limited to this account;
   - choose the account's `workers.dev` subdomain (it becomes part of the site address, e.g. `bebebe` → `bebebe-game.bebebe.workers.dev`);
   - add the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. `wrangler.toml` environments; first manual `wrangler deploy --env staging` from the run; smoke.
3. `release.yml` (the train); URLs and origins; push → staging and prod deploys green.
4. The site Worker, `_headers`, the relative-path test, the live check and smoke on `workers.dev`.
5. The save move: the farewell build and the import, with the two-origin tests.
6. Deploy restart handling test, logs and privacy doc, metrics, protocol gate.
7. Load test and capacity doc; tag `v0.1.0`; play once from two networks (Wi-Fi and phone mobile data) on the new site.
8. The farewell build to GitHub Pages; remove the Pages job; the CI-minutes estimate.
9. Docs; reviews; merge.

## Numbers and texts
| Key | Value / en | es | pt | ru |
|---|---|---|---|---|
| Free → Paid switch | > 70% of a free daily limit for 3 days | | | |
| protocol grace | 30 days | | | |
| `FAREWELL_DAYS` / `MOVE_MAX` | 14 / 64 KB | | | |
| `siteMoved` | The game has moved! | ¡El juego se mudó! | O jogo mudou de endereço! | Игра переехала! |
| `tapContinue` | Tap to continue | Toca para continuar | Toque para continuar | Нажми, чтобы продолжить |
| `reinstallHint` | Open the new link and add the game to your home screen again | Abre el nuevo enlace y vuelve a agregar el juego a tu pantalla de inicio | Abra o novo link e adicione o jogo de novo à tela inicial | Открой новую ссылку и снова добавь игру на главный экран |
| `moveTitle` | Which progress do we keep? | ¿Qué progreso guardamos? | Qual progresso vamos manter? | Какой прогресс оставим? |
| `keepThis` / `useMoved` | Keep this one / Use the moved one | Quedarme con este / Usar el que llegó | Ficar com este / Usar o que veio | Оставить этот / Взять перенесённый |
| `serverRestart` | The server is updating, back in a moment | El servidor se está actualizando, ya volvemos | O servidor está atualizando, já voltamos | Сервер обновляется, сейчас вернёмся |
