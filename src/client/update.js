// SPEC-038 AC 5: the "new version is ready" hint. A service worker that took over a page that was already controlled (or one
// waiting) is only a newer version than the page when its modules differ: index.html is network-first, so the first online launch
// after a deploy already runs the new modules and the new worker then installs under it. The worker is asked for its SRC_HASH
// ({ type: "VERSION" } on a MessageChannel) and the note shows when it differs from the page's <meta name="src-hash">
// (updateReady(); ui/home.js draws it). A tap (applyUpdate) lets the waiting worker take over and reloads. Nothing is lost: the
// save is on the device and is written before the reload. A resumed app asks for a fresh sw.js (registration.update()). Client module.

import { LOOK } from "./look.js";
import { flushSaves } from "./save.js";

// the hint's state (this module only); checks = how many version answers came (for the tests)
const st = { ready: false, reg: null, applying: false, seen: false, checks: 0 };
export const updateReady = () => st.ready;
export const updateChecks = () => st.checks;

// the page's own module set; null when the shell has no meta (then any other worker counts as a new version)
const pageHash = () => { const m = document.querySelector('meta[name="src-hash"]'); return m ? m.getAttribute("content") : null; };
// asks `worker` for its SRC_HASH; a different one = a new version for this page (no answer within the wait: nothing shown)
function check(worker) {
  if (!worker || !worker.postMessage || typeof MessageChannel === "undefined") return;
  const ch = new MessageChannel(), timer = setTimeout(() => { ch.port1.onmessage = null; }, LOOK.UPDATE_NOTE.wait * 1000);
  ch.port1.onmessage = e => {
    clearTimeout(timer);
    st.checks++;
    if (e.data && e.data.srcHash !== pageHash()) st.ready = true;
  };
  try { worker.postMessage({ type: "VERSION" }, [ch.port2]); } catch (e) { clearTimeout(timer); }
}

// called once by main.js with the registration the service worker's register() gave
export function initUpdates(registration) {
  const reg = st.reg = registration, sw = navigator.serviceWorker;
  st.seen = !!(sw && sw.controller);                                // a page that already has a worker: later changes are updates
  if (reg.waiting) check(reg.waiting);                              // a new version installed earlier, waiting for this page to close
  if (reg.addEventListener) reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    if (w && w.addEventListener) w.addEventListener("statechange", () => { if (w.state === "installed" && sw && sw.controller) check(w); });
  });
  // a worker took over (skipWaiting + claim). The first change on a page with no worker is the first install claiming it, not an update
  if (sw) sw.addEventListener("controllerchange", () => {
    if (!st.seen) { st.seen = true; return; }
    if (!st.applying) check(sw.controller);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && reg.update) Promise.resolve(reg.update()).catch(() => { /* offline: the next time */ });
  });
}

// the tap: the waiting worker takes over (SKIP_WAITING), then the page reloads — on controllerchange, or after LOOK.UPDATE_NOTE.wait s;
// no waiting worker (it already took over): reload at once
export function applyUpdate() {
  if (st.applying) return;
  st.applying = true;
  flushSaves();
  const reload = () => location.reload();
  const w = st.reg && st.reg.waiting;
  if (!w) { reload(); return; }
  let done = false;
  const once = () => { if (!done) { done = true; reload(); } };
  navigator.serviceWorker.addEventListener("controllerchange", once);
  setTimeout(once, LOOK.UPDATE_NOTE.wait * 1000);
  try { w.postMessage({ type: "SKIP_WAITING" }); } catch (e) { once(); }
}
