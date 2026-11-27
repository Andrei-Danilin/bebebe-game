// SPEC-038 AC 5: the "new version is ready" hint. A service worker that is waiting (or has just taken over a page that was
// already controlled) is a newer version than the one this page runs: the home screen shows a small note (ui/home.js reads
// updateReady()); a tap (applyUpdate) lets the waiting worker take over and reloads. Nothing is lost: the save is on the device
// and is written before the reload. A resumed app asks for a fresh sw.js (registration.update()). Client module.

import { LOOK } from "./look.js";
import { flushSaves } from "./save.js";

let ready = false, reg = null, hadController = false, applying = false;
export const updateReady = () => ready;

// called once by main.js with the registration the service worker's register() gave
export function watchUpdates(registration) {
  reg = registration;
  const sw = navigator.serviceWorker;
  hadController = !!(sw && sw.controller);
  if (reg.waiting) ready = true;                                   // a new version installed earlier, waiting for this page to close
  if (reg.addEventListener) reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    if (w && w.addEventListener) w.addEventListener("statechange", () => { if (w.state === "installed" && hadController) ready = true; });
  });
  // a worker that took over a page that already had one (skipWaiting + claim): this page still runs the old modules
  if (sw) sw.addEventListener("controllerchange", () => { if (hadController && !applying) ready = true; });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && reg.update) Promise.resolve(reg.update()).catch(() => { /* offline: the next time */ });
  });
}

// the tap: the waiting worker takes over (SKIP_WAITING), then the page reloads — on controllerchange, or after LOOK.UPDATE_NOTE.wait s;
// no waiting worker (it already took over): reload at once
export function applyUpdate() {
  if (applying) return;
  applying = true;
  flushSaves();
  const reload = () => location.reload();
  const w = reg && reg.waiting;
  if (!w) { reload(); return; }
  let done = false;
  const once = () => { if (!done) { done = true; reload(); } };
  navigator.serviceWorker.addEventListener("controllerchange", once);
  setTimeout(once, LOOK.UPDATE_NOTE.wait * 1000);
  try { w.postMessage({ type: "SKIP_WAITING" }); } catch (e) { once(); }
}
