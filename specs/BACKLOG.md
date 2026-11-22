# Backlog — ideas and open points (not specs yet)

One line each: what, where it came from. The spec author turns a line into a spec when Andrei and the kids want it.

- Option: gloves bought once and kept forever instead of charges (Claude's choice in the shop; kids may prefer permanent).
- Offline 3D: ship three.js in the repo (then the game needs a tiny local server instead of double-click).
- Progress shared between devices (needs a server-side save; today it is per browser).
- More items: trampoline, snowballs (winter), water pistol (beach) — Claude's suggestions, not asked yet.
- Hug visibility when the Big One faces the camera (the Little One on his shoulders is partly hidden).
- The lose screen code is unreachable since "no game over" — remove it or reuse it for a "Give up" button.
- `index.html` is ~2,500 lines: consider splitting into modules (needs a decision: it breaks "opens by double-click" from file://).
- Progress between Safari and the installed iPhone app (separate storage on iOS) — out of scope in SPEC-001.
- `navigator.storage.persist()` once, so iOS is less likely to clear the home-screen app's progress when the phone is low on space (SPEC-001 architect review).
- An "update available" hint in the installed app (today a new version shows on the next launch, because `index.html` is network-first) — SPEC-001 run.
