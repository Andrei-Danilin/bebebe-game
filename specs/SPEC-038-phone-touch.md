# SPEC-038 — Phone and touch robustness: second finger, rotation, tablets in portrait, fullscreen button, "new version" hint

Status: ready
Complexity: M
Branch: SPEC-038-phone-touch
Decided by: Andrei (2026-11-26): do the phone and touch items from the release review and the backlog. Layout details and texts: Claude.

## Description
Small things that make the game feel broken on real devices:
1. **Second finger stops the hero.** When a child rests a second finger on the screen and lifts it, the hero stops, even though the first finger is still on the stick (RR-73).
2. **Rotation and resize:**
   - the buttons under the "turn your device" overlay can still be tapped on tablets;
   - turning to portrait during play does not pause;
   - a burst of resize events re-allocates both canvases many times (RR-72).
3. **Tablets and large windows in portrait** (iPadOS split windows, Android large screens that ignore the orientation lock) get the rotate wall. They should play letterboxed instead; the wall stays for phones (RR-38).
4. **The fullscreen button shows on iPhone Safari**, where the Fullscreen API does not exist and the button does nothing (RR-34).
5. **"New version" hint.** In the installed app a new version arrives only on the next launch. When an update is ready, show a small hint "A new version is ready — tap to update" (backlog, SPEC-001).
6. **Offline sprites test.** The offline test should check every sprite is cached, and the service worker should re-add any missing sprite on the next online start (RR-39).

## Context
(Pre-flight against master; match names.)
- Touch and sticks: `src/client/input.js`; phone UI in `src/client/ui/phone.js`.
- Rotation and resize: `src/client/screen.js` (`fit()`, `PHONE`, the rotate overlay); pause in `src/client/flow.js` / `lifecycle.js`.
- Fullscreen: the `ui_fullscreen` buttons in `ui/hud.js` and `ui/phone.js` (`STANDALONE` check today).
- Service worker: `sw.js` (precache, `SW_VERSION`), registration in `src/client/`; `__bb.artInfo`.
- Tests: `tests/phone.spec.js`, `tests/pwa.spec.js`, `tests/offline.spec.js`, `tests/lifecycle.spec.js`.

## Acceptance criteria
1. **Second finger (RR-73).** Each player's stick keeps a stack of its active pointers: lifting any finger other than the newest keeps the stick on the newest; lifting the newest falls back to the previous one. Lifting all fingers stops the hero. The 👣 / 💋 / 🩹 / pause buttons keep their own touches and never take over the stick. Test with synthetic pointer events.
2. **Rotation (RR-72):**
   - while the rotate overlay shows, no control under it reacts (any touch device, tablets too);
   - turning to portrait during a level pauses the game; turning back shows the pause menu (no auto-resume);
   - `fit()` runs at most once per animation frame however many resize events arrive (test: 20 resize events in one frame → one canvas reallocation).
3. **Tablets in portrait (RR-38):**
   - on a touch device whose short side is over `PHONE_MAX_SHORT_SIDE` (tablet), or a desktop window taller than wide, the game plays letterboxed in portrait (the landscape canvas centred with paper margins), with no rotate wall;
   - phones keep the wall.
   - Test at 820×1180 (iPad portrait) and 390×844 (phone portrait).
4. **Fullscreen button (RR-34).** It is hidden when neither `document.fullscreenEnabled` nor `document.webkitFullscreenEnabled` is true, and when running as an installed app (`STANDALONE`), on every screen where it appears. Test with the API stubbed off.
5. **"New version" hint:**
   - when the service worker has a new version installed and waiting, the home screen shows a small paper note "A new version is ready — tap to update" / "Hay una versión nueva — tocá para actualizar" / "Tem uma versão nova — toque para atualizar" / "Готова новая версия — нажми, чтобы обновить";
   - tapping it activates the waiting worker and reloads;
   - never shown in a level; nothing is lost (the save is on the device);
   - in the installed app and in the browser alike.
   - Test with a stubbed `registration.waiting`.
6. **Offline sprites (RR-39).** `tests/offline.spec.js` asserts `__bb.artInfo.ok === __bb.artInfo.total` offline after install. The service worker, on an online start, re-fetches any precached sprite missing from its cache.
7. **Docs:**
   - `docs/architecture.md`: pointer stack, `fit()` throttle, portrait letterbox, update hint;
   - `README.md`: tablets in portrait;
   - `docs/reviews/release-readiness.md`: RR-34, RR-38, RR-39, RR-72, RR-73 done;
   - `specs/BACKLOG.md`: strike the "update available" line.

## Implementation steps (TDD: failing test first in each)
1. Pointer stack.
2. Rotation: overlay blocks input, pause, `fit()` throttle.
3. Portrait letterbox for tablets and tall windows.
4. Fullscreen button.
5. Update hint.
6. Offline sprites.
7. Phone screenshots (667×375, iPad portrait 820×1180, the update note); docs.
