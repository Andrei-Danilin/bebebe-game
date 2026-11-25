// SPEC-025 AC 3b: the storage backends of the save module (save.js) — the only code in src/ that touches localStorage.
// A backend is { get(key), set(key, value), remove(key), keys(), sync } and every method returns a Promise that never rejects:
// get → the stored text, null when the key is absent, undefined when it could not be read; set / remove → true when it worked;
// keys → the stored bebebe-* keys. Writes are applied in call order: a `sync` backend does each write inside the call (the save
// module calls it directly), any other backend gets its writes chained by the save module (each set after the previous one
// answered). The default backend is localStorage: synchronous (a flush on hide is complete before the page can be killed),
// every error caught (no storage, private mode, quota: set → false). A native backend (store app) is a later release spec.
// Client module.

const ok = v => Promise.resolve(v);
export const localBackend = {
  sync: true,
  get(key) { try { return ok(localStorage.getItem(key)); } catch (e) { return ok(undefined); } },
  set(key, value) { try { localStorage.setItem(key, value); return ok(true); } catch (e) { return ok(false); } },
  remove(key) { try { localStorage.removeItem(key); return ok(true); } catch (e) { return ok(false); } },
  keys() { try { return ok(Object.keys(localStorage).filter(k => k.startsWith("bebebe-"))); } catch (e) { return ok([]); } }
};
// a backend from elsewhere (the tests' window.__bbSaveBackend: an async in-memory store) — every method wrapped, so a throw or a
// rejection is a failed read (undefined) or write (false) like the default backend's; not sync unless it says so
export function wrapBackend(b) {
  const safe = (fn, fail) => (...a) => { try { return Promise.resolve(fn(...a)).catch(() => fail); } catch (e) { return ok(fail); } };
  return {
    sync: b.sync === true,
    get: safe(k => Promise.resolve(b.get(k)).then(v => (typeof v === "string" ? v : v === null || v === undefined ? null : undefined)), undefined),
    set: safe((k, v) => Promise.resolve(b.set(k, v)).then(r => r !== false), false),
    remove: safe(k => Promise.resolve(b.remove(k)).then(r => r !== false), false),
    keys: safe(() => (typeof b.keys === "function" ? b.keys() : []), [])
  };
}
