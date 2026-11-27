# SPEC-014 — Online server on Cloudflare: staging and prod, CI/CD, privacy, load test, costs

Status: ready
Blocked: needs Andrei's Cloudflare account and an API token as GitHub secrets (step 1 below); the run stops at step 1 and asks if they are missing.
Complexity: M
Branch: SPEC-014-online-deploy
Decided by: Andrei (2026-11-26): Cloudflare Durable Objects instead of Azure; start on the Free plan, switch to Workers Paid ($5/month) when the free limits are near. Everything else: Claude (spec author). This replaces the earlier Azure version of SPEC-014.

## Description
After this spec the kids can play online from different apartments:
- SPEC-013's Worker and `Room` Durable Object run on Cloudflare in two environments, **staging** and **prod**;
- the site on GitHub Pages (and later the apps) connects to prod;
- every merge to `master` that touches the online code updates staging; a version tag updates prod.

## Goal
- `wss://` reachable from the Pages site and from phones on mobile data; deploys need no manual steps.
- We know how many rooms fit in the free limits and what more costs.
- Privacy: no IPs, names or tokens logged; no third-party analytics (RR-57).

## Context
- After SPEC-013: `online/` (Worker, `Room`, `Limiter`), `wrangler.toml`, `npm run online:dev`, `CFG.ONLINE.SERVERS` / `ORIGINS`, `scripts/fake-clients.js`, node tests.
- Workflows: `tests.yml`, `pages.yml`, `balance.yml`. Repo `github.com/Andrei-Danilin/bebebe-game` (public); site `https://andrei-danilin.github.io/bebebe-game/`.
- Cloudflare limits and prices (check at run time):
  - Free plan Durable Objects (SQLite backend) have daily limits on requests and duration;
  - WebSocket messages are billed at a 20:1 ratio;
  - Workers Paid is $5/month per account with included usage.

## Out of scope
- A custom domain (D-5, later); the app-store builds (origins already allowed by SPEC-013).
- Server-side purchase checks.

## Acceptance criteria
1. **Environments:** `wrangler.toml` has `[env.staging]` and `[env.production]`, with Workers `bebebe-online-staging` and `bebebe-online` on `workers.dev`, their own Durable Object namespaces and migrations, and `ORIGINS` per environment (staging also allows localhost).
2. **Workflow `online.yml`:**
   - on push to `master` touching `online/**`, `src/core/**`, `src/i18n.js`: run the online node tests → `wrangler deploy --env staging` → smoke (`/health` ok; `scripts/fake-clients.js` plays one short room to the end);
   - on tag `v*`: deploy the same commit to production, then smoke.
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
   - `docs/architecture.md`: deployment and environments;
   - `docs/server-capacity.md`, `docs/server-privacy.md` (new);
   - `CLAUDE.md`: the online workflow, tags for prod, never commit tokens;
   - `README.md`: online play and how prod is released;
   - `docs/reviews/release-readiness.md`: RR-57 done.

## Implementation steps
1. **Andrei, once (the run prints these and waits):**
   - create a Cloudflare account (free) if needed;
   - create an API token: template "Edit Cloudflare Workers", limited to this account;
   - add the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. `wrangler.toml` environments; first manual `wrangler deploy --env staging` from the run; smoke.
3. `online.yml`; URLs and origins; push → staging deploy green.
4. Deploy restart handling test, logs and privacy doc, metrics, protocol gate.
5. Load test and capacity doc; tag `v0.1.0` → prod; play once from two networks (Wi-Fi and phone mobile data).
6. Docs; reviews; merge.

## Numbers and texts
| Key | Value / en | es | pt | ru |
|---|---|---|---|---|
| Free → Paid switch | > 70% of a free daily limit for 3 days | | | |
| protocol grace | 30 days | | | |
| `serverRestart` | The server is updating, back in a moment | El servidor se está actualizando, ya volvemos | O servidor está atualizando, já voltamos | Сервер обновляется, сейчас вернёмся |
