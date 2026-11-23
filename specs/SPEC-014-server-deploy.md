# SPEC-014 — Game server in the cloud: Azure, staging/prod, CI/CD, limits, load test

Status: ready
Blocked: needs Andrei's Azure subscription and a one-time `az login` + GitHub OIDC setup (step 1 below); the run stops at step 1 and asks if they are missing.
Complexity: M
Branch: SPEC-014-server-deploy
Decided by: Andrei (2026-11-22): a server is needed, the game will be published for everybody, design for many players. Andrei accepted Claude's defaults: Azure (he knows it), region closest to Buenos Aires, staging and prod. Everything else (Container Apps, Bicep, OIDC, numbers): Claude (spec author).

## Description
After this spec the kids can play online from different apartments: the game server from SPEC-013 runs in Azure, the site on GitHub Pages connects to it, every merge to `master` updates the staging server and a version tag updates the production server.

## Goal
- `wss://` server reachable from the Pages site and from phones on mobile internet; restarts and new versions do not need Andrei.
- We know how many rooms one server instance holds, and the path to more instances is written down.
- Players' privacy: no IPs or names in logs, no third-party analytics.

## Context
- After SPEC-013: `server/` (Node, `ws`), `/health`, `/ws`, `CFG.ONLINE.SERVERS` with empty `staging`/`prod`, `CFG.ONLINE.ORIGINS`, `scripts/fake-clients.js`, `npm run test:node`.
- `pages.yml`: tests → Pages deploy on push to `master`; remote `github.com/Andrei-Danilin/bebebe-game` (public), Pages URL `https://andrei-danilin.github.io/bebebe-game/`.
- Players are in Buenos Aires: the nearest Azure region is Brazil South (São Paulo).

## Out of scope
- Several instances / regions, Redis room directory (documented as the next step only).
- Custom domain, app-store origins (added when the apps exist), accounts.

## Acceptance criteria
1. `server/Dockerfile` (Node LTS slim, non-root user, copies `server/` + `src/core/` + `src/i18n.js` only, `HEALTHCHECK` on `/health`). `docker build` + `docker run` locally pass `/health` and one fake-client game. → `tests/server/docker.test.mjs` (skipped when Docker is absent; CI has it)
2. `infra/main.bicep`: resource group, Log Analytics, Container Apps environment, container app `bebebe-server-<env>` in **Brazil South**, ingress external HTTPS with WebSocket, min replicas 1 / max 1 (one instance until the room directory exists — rooms live in memory), CPU/memory 0.5 / 1 GiB, env `NODE_ENV`, `ORIGINS`, `PORT`. Images in GitHub Container Registry (`ghcr.io/andrei-danilin/bebebe-server`). Two environments: `staging`, `prod`.
3. **Workflow `server.yml`:** on push to `master` touching `server/**`, `src/core/**`, `src/i18n.js`, `infra/**`: `npm run test:node` → build + push image tagged with the commit → deploy to **staging** → smoke (`/health` ok, one fake-client game finishes). On tag `v*`: deploy the same image to **prod** + smoke. Azure login by **OIDC** (federated credential, no secrets in the repo; `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` as repository variables).
4. `CFG.ONLINE.SERVERS.staging` / `prod` filled with the two `wss://…/ws` URLs; Pages uses `prod`; `?server=staging` for testing. `CFG.ONLINE.ORIGINS` = the Pages origin (+ localhost on staging only).
5. **Graceful deploys:** on `SIGTERM` the server stops accepting new rooms, sends `serverRestart` to clients in lobbies, lets running levels finish up to 120 s, then exits; the client shows "The server is updating, try again in a minute" (en/es/ru) instead of a crash. → `tests/server/shutdown.test.mjs`
6. **Metrics and logs:** `/metrics` (text): rooms by phase, players, ticks over 15 ms, tick p95, messages/s, protocol errors, rejected joins; structured JSON logs (room created/closed with code hash, never IP or name). No third-party analytics SDK anywhere.
7. **Load test:** `npm run load -- --url <wss> --rooms 200 --players 5` (fake clients) against staging (or locally in Docker): report ticks p95, CPU, memory, bandwidth per room into `docs/server-capacity.md`, plus the instance size recommendation. Target: 200 rooms × 5 players with tick p95 < 10 ms on the chosen size; if not met, the doc says how many rooms fit and the result goes to the final report (not a merge stop).
8. **Scale-out path** written in `docs/server-capacity.md`: room code → instance (prefix or Redis directory), sticky routing, more replicas, a second region; when to do it (rooms > 70 % of measured capacity).
9. **Protocol gate:** `protocol` bumps when messages change; prod keeps accepting the previous protocol for 30 days after a bump (documented rule; app-store users update slowly) — or answers `updateRequired`. A test checks `updateRequired` for an unknown version.

## Implementation steps
1. **Andrei, once (the run prints these steps and waits):** `az login`; create the app registration with a federated credential for `repo:Andrei-Danilin/bebebe-game:ref:refs/heads/master` and `:ref:refs/tags/v*`; give it Contributor on the resource group; set the three repository variables; enable GHCR package write for Actions.
2. Dockerfile + local Docker test (AC 1).
3. Bicep (AC 2), first manual deploy of staging with `az deployment group create`; smoke.
4. `server.yml` (AC 3); URLs and origins (AC 4); push → staging deploy green.
5. Graceful shutdown (AC 5), metrics/logs (AC 6), protocol gate (AC 9).
6. Load test and capacity doc (AC 7, 8); tag `v0.1.0` → prod; play once from two networks (Wi-Fi + phone mobile data).
7. Docs; reviews; merge, push, close.

## Numbers and texts
| CFG / I18N key | value | en | es | ru |
|---|---|---|---|---|
| region / size | Brazil South, 0.5 vCPU / 1 GiB, 1 replica | | | |
| drain time | 120 s | | | |
| `serverRestart` | | The server is updating, try again in a minute | El servidor se está actualizando, probá de nuevo en un minuto | Сервер обновляется, попробуй через минуту |

## Docs to update
`architecture.md` (deployment, environments, metrics), `docs/server-capacity.md` (new), `CLAUDE.md` (server workflow, tags for prod, never commit secrets), `README.md` (online play URL, how prod is released).
