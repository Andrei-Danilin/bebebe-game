# SPEC-045 — "Full game" groundwork: the Park is free, one purchase opens the rest (switched off in the web beta)

Status: ready
Complexity: M
Branch: SPEC-045-full-game
Decided by: Andrei (2026-11-26):
- **The model:** the Park is free; one purchase **"Full game"** opens all worlds, the bonus worlds and online room hosting.
- **Price:** $2.99. The store price itself is set in the stores at release.
- **Online:** only the room creator needs the Full game; friends with the free version join by code and play any world the host picks.
- **The web version:** everything free now (beta); after the apps are out, the web becomes a demo (Park + tutorial + joining rooms), and buying happens only in the apps.

Screens, texts and the gate flow: Claude.

## Description
This spec builds the **groundwork only**:
- one place that knows whether this device has the Full game (`entitlement`);
- the locks it drives;
- the grown-ups page section that will hold the purchase;
- a switch `CFG.MONETIZATION.enforce`, **off** in the web beta (everything open, as today).

The real store purchase (Apple In-App Purchase / Google Play Billing through Capacitor, receipt checks, Restore) comes with the app packaging spec. Nothing here sells anything, collects anything or links out.

## Goal
When the apps arrive, turning on the Full game is a config switch plus the store plugin, not a redesign. The web beta stays fully free.

## Context
(Pre-flight against master; match names.)
- `worldOpen(world, p)` (SPEC-030) with reasons `start` / `previous` / `bonus` / `played` / `locked`: the hook for a new reason.
- Grown-ups page `src/client/ui/grownups.js` behind the gate (SPEC-025: gate, reset, undo, erase all, save code); saves `src/client/save.js` (one versioned save, backup, migrations).
- Kids-category rules: purchases only behind a parental gate; no links out without the gate; no third-party SDKs (`docs/reviews/release-readiness.md`, publishing plan).
- `NATIVE` / `STANDALONE` detection (SPEC-025, RR-35).

## Out of scope
- The store plugin, receipts, Restore Purchases against a store, prices in the UI.
- Any server check (online enforcement waits for SPEC-013/014 plus the store spec).
- Ads, coin packs or subscriptions: never.

## Acceptance criteria
1. **Entitlement model:**
   - `src/client/entitlement.js` exposes `entitlement()` → `"full"` or `"free"`, `hasFull()`, `setEntitlement(value, source)`;
   - it is stored in the save as `entitlement: { value, source, at }`, where `source` ∈ `beta`, `store`, `test`;
   - old saves load as `free`;
   - the save migration test covers it.
2. **Switch:**
   - `CFG.MONETIZATION = { enforce: false, freeWorlds: ["park"], product: "full_game" }`;
   - while `enforce` is false, `hasFull()` is true for everyone (source `beta`), so **nothing changes in the web beta**;
   - tests run both ways (a test config with `enforce: true`).
3. **Locks when enforced and free:**
   - `worldOpen` returns `{ open: false, reason: "purchase" }` for every world not in `freeWorlds` (main and bonus), even if progress would open it;
   - progress keeps counting, so buying later opens what was earned;
   - the map tab and the Progress row show a small **gift / star badge** instead of the padlock, and tapping it opens the "Full game" card (AC 5), not a toast.
4. **Online seam** (for SPEC-013): `entitlement()` is sent in `hello` as `entitlement: "free" | "full"` (unverified in the beta); creating a room needs `hasFull()` when enforced; joining never does.
5. **"Full game" card (behind the gate):**
   - a child who taps a locked world sees a friendly card: a picture of the other worlds (the world icons), "More worlds are waiting! Ask a grown-up." and one button **For grown-ups** that opens the parental gate;
   - behind the gate, the grown-ups page has a **Full game** section: what it opens (all worlds, bonus worlds, hosting online games), "One purchase, no ads, no subscriptions", and buttons **Get the full game** and **Restore purchase**;
   - in the web beta and in this spec both buttons are disabled with "Available in the app soon";
   - the copy is in four languages (Claude); no price is shown until the store spec;
   - nothing outside the gate ever shows a price or a buy button.
6. **Debug and tests:**
   - `?full=0|1` (debug only, ignored in release builds) and `__bb.entitlement`;
   - tests (enforce on): Park open; Field locked with reason `purchase` after Park 20 is won; buying (test source) opens Field and everything earned; the card and the gate flow; nothing changes with enforce off.
7. **Docs:**
   - `docs/game-design.md` (the model, as decided);
   - `docs/architecture.md` (`entitlement.js`, `CFG.MONETIZATION`);
   - `specs/BACKLOG.md`: "store purchase, Restore, receipt check — app packaging spec".

## Implementation steps (TDD: failing test first in each)
1. Entitlement model and save migration.
2. `CFG.MONETIZATION` and `worldOpen` reason `purchase`; badges.
3. The child card and the grown-ups section (disabled buttons).
4. Online seam in the hello message (constant until SPEC-013).
5. Tests both ways; screenshots (the card, the grown-ups section at 667×375); docs.
