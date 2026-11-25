// SPEC-025 phase 2 (AC 3, 3b, 3c, 3d, 4, 4b, 5, 6b, 6c): the save module — the one owner of storage. It talks to storage only
// through a backend (storage.js: Promises; the default is localStorage). One key, bebebe-save = { version, progress, outfits (by
// item id), names, lang, migrated (the fingerprints of the old keys), persist, …unknown fields kept }.
// - loadSave() (awaited by main.js's boot before the first level): a storage probe; the old keys (bebebe-progress, -outfits,
//   -names, -lang) migrate once, in order (raw reads → key-presence facts → build, write, read back → the fingerprints in the
//   record); the old keys are never written or deleted (only "Erase all data", grown-ups page); an old key whose fingerprint
//   changed (an old tab or build wrote it) is merged again: best stars, the higher unlocked, owned items and seen scenes joined,
//   coins and stock from bebebe-save. A save from a newer version is played and written back with its version and every field it
//   had (a known field failing this version's schema: unchanged; the default only in memory). Fields are only ever added.
// - Copies: bebebe-save-backup (the previous write), -session (the save as loaded at the start of a session on an earlier day,
//   at most every CFG.SAVE_SESSION_DAYS), snapshots -before-migration / -before-reset / -before-import; a save that fails to parse
//   or validate is kept unchanged in -broken (never overwritten while one is there) and the newest valid copy is loaded
//   (saveRecovered; with none, the old keys, else a fresh game: freshStart); one-time gifts (adoptWorn) never run after that.
// - Writes: queueSave() keeps the last pending write per key and flushes on a microtask, on hide and pagehide (lifecycle.js);
//   a failed write or probe → the game plays from memory and the menu shows noSave once.
// - The parents' code (base64url(JSON) + checksum, with version), restoring a copy, the reset snapshot and undo, erase all.
// Client module.

import { G } from "../core/active.js";
import { CFG, levelsPerWorld, WORLDS } from "../core/config.js";
import { progress, setProgress } from "../core/economy.js";
import { badProgressFields, loadProgress, worldProgress } from "../core/progress-rules.js";
import { BIG_SKINS, HATS, JACKETS, PANTS, SLOTS } from "../core/wardrobe.js";
import { detectLang, HTML_LANG, lang, LANGS, setCurrentLang } from "../i18n.js";
import { SEEN_IDS } from "../story.js";
import { adoptErrorLog } from "./errors.js";
import { namesFrom, noNames, setNamesTyped, typedNames } from "./names.js";
import { adoptWorn, cloneSkins, fitOutfitsToOwned, loadOutfits, outfitsFromIds, outfitsToIds, setSkinKeep, setSkinSel, skinKeep } from "./outfits.js";
import { localBackend, wrapBackend } from "./storage.js";

// SPEC-025 AC 9: the save schema (JSDoc for `npm run typecheck`; the checks themselves: validSave, loadProgress). Fields are only
// ever added; unknown fields are kept (AC 3), so the object is open.
/** @import { Progress } from "../core/progress-rules.js" */
/**
 * @typedef {{ hair?: string, hat?: string, jacket?: string, pants?: string, [slot: string]: any }} OutfitIds   one Little One's outfit by item id (AC 3c)
 * @typedef {{ version: number, progress: Progress,
 *   outfits: { p1: OutfitIds, p2: OutfitIds, big: string }, names: { p1: string, p2: string, big: string, bots: string[] },
 *   lang: string, migrated: Record<string, string | null>, persist?: { asked: boolean, granted: boolean }, [field: string]: any }} Save   bebebe-save
 */
export const SAVE_VERSION = 1;              // the shape of bebebe-save (a schema id, not a tunable number)
export const SAVE_KEYS = Object.freeze({ save: "bebebe-save", backup: "bebebe-save-backup", broken: "bebebe-save-broken", session: "bebebe-save-session",
  migration: "bebebe-save-before-migration", reset: "bebebe-save-before-reset", reset2: "bebebe-save-before-reset-2", import: "bebebe-save-before-import", restore: "bebebe-save-before-restore", errors: "bebebe-errors", probe: "bebebe-probe" });
export const OLD_KEYS = Object.freeze(["bebebe-progress", "bebebe-outfits", "bebebe-names", "bebebe-lang"]);
export const COPY_NAMES = Object.freeze(["backup", "session", "migration", "reset", "reset2", "import", "restore"]);   // backup → session → snapshots (newest first)
const KNOWN_TOP = ["version", "progress", "outfits", "names", "lang", "migrated", "persist"];
const OWN_LISTS = { hats: HATS, jackets: JACKETS, pants: PANTS, big: BIG_SKINS };
const WORLD_FIELDS = ["unlocked", "stars", "won"];

let backend = localBackend;
let loaded = false, loading = false, erased = false, flushQueued = false;
let lastText = null;                       // the save text last written or loaded — the backup of the next write
let lastWrite = Promise.resolve(true);     // the backend's answer to the last write (the start awaits it before the read-back)
const pending = new Map();                 // key → text: only the last write per key waits
let held = emptyHeld();                    // parts of the stored save written back unchanged (unknown fields, a newer version's shapes)
let future = false, futureVersion = SAVE_VERSION;
let migrated = {};                         // old key → the fingerprint of its raw value at the last migration (null = absent)
let persist = null;                        // { asked, granted } — navigator.storage.persist() (AC 5)
let errCache = null;                       // the stored error log (read by loadSave)
// what the grown-ups page and the tests read: storage failed (noSave), the notes due / shown, the copies stored
// saveOff (review fix): the probe failed or the stored save could not be read — this session never writes bebebe-save or a copy
// (a nearly full storage could take a fresh save over the real one)
export const saveInfo = { noSave: false, notes: [], shown: [], copies: {}, recovered: null, saveOff: false };

const plainObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const parse = t => { if (typeof t !== "string") return undefined; try { return JSON.parse(t); } catch (e) { return undefined; } };
// FNV-1a of a raw stored text (null → null): the fingerprint of an old key, the checksum of a code
export function fingerprint(t) {
  if (typeof t !== "string") return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
// the root of a save: a plain object with a whole version ≥ 1 and a progress object (else broken)
export const validSave = s => plainObj(s) && Number.isInteger(s.version) && s.version >= 1 && plainObj(s.progress);
const TOP_VALID = { version: v => Number.isInteger(v) && v >= 1, progress: plainObj, outfits: plainObj, names: plainObj, lang: v => LANGS.includes(v), migrated: plainObj, persist: plainObj };
const navLangs = () => (navigator.languages && navigator.languages.length ? [...navigator.languages] : [navigator.language]);
function applyLang(l) { setCurrentLang(l); document.documentElement.lang = HTML_LANG[l] || l; }
function emptyHeld() { return { top: {}, progress: {}, worlds: {}, worldFields: {}, worldOver: {}, owned: {}, ownedKeys: {}, upgrades: {}, seen: {}, outfits: [] }; }
// AC 3: what a stored progress has that this version does not know (worlds, world fields, ids, keys) — kept and written back;
// in a newer version's save also its known fields that fail this version's schema (unchanged)
function holdProgress(h, pv, fut) {
  if (!plainObj(pv)) return;
  if (plainObj(pv.worlds)) for (const [w, v] of Object.entries(pv.worlds)) {
    if (!WORLDS.includes(w)) h.worlds[w] = v;
    else if (plainObj(v)) {
      const extra = Object.fromEntries(Object.entries(v).filter(([k]) => !WORLD_FIELDS.includes(k)));
      if (Object.keys(extra).length) h.worldFields[w] = extra;
      // review fix (AC 3): a newer version's levels past this build's last one — unlocked, stars and won entries out of range,
      // written back unchanged (this build cannot play those levels; unlocked only while this build has not changed it)
      if (fut) {
        const max = levelsPerWorld(), over = { stars: {}, won: {} }, beyond = o => (plainObj(o) ? Object.fromEntries(Object.entries(o).filter(([n]) => Number(n) > max)) : {});
        over.stars = beyond(v.stars); over.won = beyond(v.won);
        if (Number(v.unlocked) > max) { over.unlocked = v.unlocked; over.unlockedLoaded = max; }
        if (Object.keys(over.stars).length || Object.keys(over.won).length || "unlocked" in over) h.worldOver[w] = over;
      }
    }
  }
  if (plainObj(pv.owned)) for (const [k, v] of Object.entries(pv.owned)) {
    if (!OWN_LISTS[k]) h.ownedKeys[k] = v;
    else if (Array.isArray(v)) h.owned[k] = v.filter(id => !OWN_LISTS[k].some(q => q.id === id));
  }
  if (plainObj(pv.upgrades)) for (const [k, v] of Object.entries(pv.upgrades)) if (!(k in progress.upgrades)) h.upgrades[k] = v;
  if (plainObj(pv.seen)) for (const [k, v] of Object.entries(pv.seen)) if (!SEEN_IDS.includes(k)) h.seen[k] = v;
  if (fut) for (const k of badProgressFields(pv)) h.progress[k] = pv[k];
}
function holdSave(s) {
  const h = emptyHeld(), fut = s.version > SAVE_VERSION;
  for (const k of Object.keys(s)) if (!KNOWN_TOP.includes(k) || (fut && !TOP_VALID[k](s[k]))) h.top[k] = s[k];
  holdProgress(h, s.progress, fut);
  // an outfit id this version does not know: the slot shows its default and keeps the stored id while it stays on that default
  const o = outfitsFromIds(s.outfits);
  if (plainObj(s.outfits)) for (const pk of ["p1", "p2"]) if (plainObj(s.outfits[pk])) for (const k of Object.keys(SLOTS)) {
    const id = s.outfits[pk][k];
    if (typeof id === "string" && !SLOTS[k].some(q => q.id === id)) h.outfits.push({ pk, k, id, idx: o[pk][k] });
  }
  if (plainObj(s.outfits) && typeof s.outfits.big === "string" && !BIG_SKINS.some(q => q.id === s.outfits.big)) h.outfits.push({ pk: "big", id: s.outfits.big, idx: o.big });
  return h;
}

// ---------- the save object (what is written) ----------
/** @returns {Save} */
function saveObject() {
  const p = JSON.parse(JSON.stringify(progress));
  p.worlds = { ...held.worlds, ...p.worlds };
  for (const [w, f] of Object.entries(held.worldFields)) if (p.worlds[w]) p.worlds[w] = { ...f, ...p.worlds[w] };
  for (const [w, o] of Object.entries(held.worldOver)) if (p.worlds[w]) {
    const q = p.worlds[w];
    q.stars = { ...q.stars, ...o.stars }; q.won = { ...q.won, ...o.won };
    if ("unlocked" in o && q.unlocked === o.unlockedLoaded) q.unlocked = o.unlocked;
  }
  if (plainObj(p.owned)) {
    for (const [k, ids] of Object.entries(held.owned)) if (Array.isArray(p.owned[k])) p.owned[k] = [...p.owned[k], ...ids.filter(id => !p.owned[k].includes(id))];
    p.owned = { ...held.ownedKeys, ...p.owned };
  }
  p.upgrades = { ...held.upgrades, ...p.upgrades };
  p.seen = { ...held.seen, ...p.seen };
  Object.assign(p, held.progress);
  const outfits = outfitsToIds(skinKeep);
  for (const q of held.outfits) {
    if (q.pk === "big") { if (skinKeep.big === q.idx) outfits.big = q.id; } else if (skinKeep[q.pk][q.k] === q.idx) outfits[q.pk][q.k] = q.id;
  }
  const out = /** @type {Save} */ ({ ...held.top, version: future ? futureVersion : SAVE_VERSION, progress: p, outfits, names: typedNames(), lang, migrated: { ...migrated } });
  if (persist) out.persist = { ...persist };
  if (future) for (const k of KNOWN_TOP) if (Object.hasOwn(held.top, k)) out[k] = held.top[k];
  return out;
}
const wrapCopy = text => `{"at":${Date.now()},"save":${text}}`;
function storageFailed() {
  if (saveInfo.noSave) return;
  saveInfo.noSave = true;
  noteDue("noSave");
}
function noteDue(key) { if (!saveInfo.notes.includes(key) && !saveInfo.shown.includes(key)) saveInfo.notes.push(key); }
// review fix: writes are applied in call order — a sync backend writes inside the call, any other one after the previous write
// answered; with saveOff (a failed probe or an unreadable save at the start) nothing of the save or its copies is written
function write(key, text) {
  if (erased || (saveInfo.saveOff && key.startsWith(SAVE_KEYS.save))) return Promise.resolve(false);
  if (key in COPY_KEY_NAME) saveInfo.copies[COPY_KEY_NAME[key]] = true;
  const go = () => backend.set(key, text).then(ok => { if (!ok) storageFailed(); return ok; });
  lastWrite = backend.sync ? go() : lastWrite.then(go);
  return lastWrite;
}
const COPY_KEY_NAME = Object.fromEntries(COPY_NAMES.map(n => [SAVE_KEYS[n], n]));
function remove(key) { if (saveInfo.saveOff && key.startsWith(SAVE_KEYS.save)) return Promise.resolve(false); if (key in COPY_KEY_NAME) saveInfo.copies[COPY_KEY_NAME[key]] = false; return backend.remove(key); }
function writeMain(text) {
  // written even when unchanged (storage may have been cleared behind the game's back); the backup only when it differs
  if (lastText !== null && text !== lastText) write(SAVE_KEYS.backup, wrapCopy(lastText));
  write(SAVE_KEYS.save, text).then(ok => { if (ok) lastText = text; });   // review fix: only a stored text is the next backup
}

// ---------- the write queue (AC 3b) ----------
// every change of progress, outfits, names or language: the whole save, written on the next microtask (several changes of one
// task are one write); nothing before loadSave has applied the stored save, nothing after "Erase all data"
export function queueSave() {
  if (!loaded || loading || erased) return;
  pending.set(SAVE_KEYS.save, JSON.stringify(saveObject()));
  if (!flushQueued) { flushQueued = true; queueMicrotask(() => { flushQueued = false; flushSaves(); }); }
}
// writes every pending key now (the localStorage backend is synchronous: done when this returns) — also on hide and pagehide
export function flushSaves() {
  if (erased) { pending.clear(); return; }
  for (const [k, v] of [...pending]) { pending.delete(k); if (k === SAVE_KEYS.save) writeMain(v); else write(k, v); }
}

// ---------- the error log (bebebe-errors, written by errors.js through here) ----------
export const readErrorLog = () => (errCache ? errCache.map(e => ({ ...e })) : []);
const parseLog = t => { const v = parse(t); return Array.isArray(v) ? v.filter(plainObj) : []; };
export function mergeLogs(a, b) {
  const same = (x, y) => x.message === y.message && x.stack === y.stack && x.level === y.level && x.mode === y.mode;
  return [...a, ...b.filter(e => !a.some(x => same(x, e)))].slice(-CFG.ERROR_LOG_MAX);
}
export function writeErrorLog(list) {
  if (erased) return;
  if (loaded) {
    errCache = list.map(e => ({ ...e }));
    pending.set(SAVE_KEYS.errors, JSON.stringify(list));
    flushSaves();                          // an error may be followed by a dead page: written at once (errors.js throttles repeats)
    return;
  }
  // before loadSave (a failed start): joined with what is stored, so the log of earlier sessions stays
  backend.get(SAVE_KEYS.errors).then(t => backend.set(SAVE_KEYS.errors, JSON.stringify(mergeLogs(parseLog(t), list))));
}

// ---------- loading ----------
async function probe() {
  const t = String(Date.now());
  if (!(await backend.set(SAVE_KEYS.probe, t))) return false;
  const back = await backend.get(SAVE_KEYS.probe);
  await backend.remove(SAVE_KEYS.probe);
  return back === t;
}
// a stored save → the game (progress cleaned by the core's schema, outfits by id, names, language); never throws
function useSave(s) {
  future = s.version > SAVE_VERSION; futureVersion = s.version;
  held = holdSave(s);
  migrated = plainObj(s.migrated) ? { ...s.migrated } : {};
  persist = plainObj(s.persist) ? { ...s.persist } : null;
  setProgress(s.progress);
  const o = outfitsFromIds(s.outfits);
  setSkinSel(o); setSkinKeep(cloneSkins(o));
  setNamesTyped(namesFrom(s.names) || noNames());
  applyLang(LANGS.includes(s.lang) ? s.lang : detectLang(null, navLangs(), true));
  fitOutfitsToOwned();                     // a copy or a code may wear what its progress does not own: the slot's default
}
// AC 3: the old keys → the game, in order: the key-presence facts first (a first launch picks the browser's language; a save without
// owned adopts what is worn — gifts, only on a real migration; a flat save moves into the Park; outfits v < 2 with big 0 → Dad)
function migrateOld(old, gifts) {
  const pv = parse(old["bebebe-progress"]) ?? null, hadOwned = plainObj(pv) && "owned" in pv, played = old["bebebe-progress"] !== null;
  future = false; futureVersion = SAVE_VERSION; persist = null;
  held = emptyHeld();
  setProgress(pv);
  holdProgress(held, pv, false);
  const o = loadOutfits(parse(old["bebebe-outfits"]) ?? null);
  setSkinSel(o); setSkinKeep(cloneSkins(o));
  setNamesTyped(namesFrom(parse(old["bebebe-names"])) || noNames());
  applyLang(detectLang(old["bebebe-lang"], navLangs(), played));
  if (gifts && !hadOwned) adoptWorn(); else fitOutfitsToOwned();
  migrated = Object.fromEntries(OLD_KEYS.map(k => [k, fingerprint(old[k])]));
}
// AC 3: an old key written after the migration (an old tab or an old cached build) is merged again: the best stars of each level,
// the higher unlocked, the union of owned items and seen scenes; coins and stock stay bebebe-save's. → something changed
function mergeStale(old) {
  const changed = OLD_KEYS.filter(k => (Object.hasOwn(migrated, k) ? migrated[k] !== fingerprint(old[k]) : old[k] !== null));
  if (!changed.length) return false;
  if (lastText !== null) write(SAVE_KEYS.migration, wrapCopy(lastText));   // the one-off snapshot before a migration
  if (changed.includes("bebebe-progress")) {
    const o = loadProgress(parse(old["bebebe-progress"]) ?? null);
    for (const w of WORLDS) {
      const a = progress.worlds[w], b = o.worlds[w];
      a.unlocked = Math.max(a.unlocked, b.unlocked);
      for (const [n, st] of Object.entries(b.stars)) a.stars[n] = Math.max(a.stars[n] || 0, st);
      for (const n of Object.keys(b.won)) a.won[n] = true;
    }
    for (const k of Object.keys(OWN_LISTS)) for (const id of o.owned[k]) if (!progress.owned[k].includes(id)) progress.owned[k].push(id);
    for (const k of Object.keys(progress.seen)) if (o.seen[k] === true) progress.seen[k] = true;
  }
  for (const k of changed) migrated[k] = fingerprint(old[k]);
  return true;
}
// the copies that hold a valid save, in the order a broken save is recovered from: backup, session, then snapshots newest first
function validCopies(raw) {
  const list = COPY_NAMES.map(name => ({ name, c: parse(raw[SAVE_KEYS[name]]) }))
    .filter(({ c }) => plainObj(c) && validSave(c.save)).map(({ name, c }) => ({ name, at: Number(c.at) || 0, save: c.save }));
  const head = list.filter(q => q.name === "backup" || q.name === "session"), snaps = list.filter(q => !head.includes(q)).sort((a, b) => b.at - a.at);
  return [...head, ...snaps];
}
const dayOf = ms => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / 86400000);
// The session copy, the rule: it is replaced only when the copy stored is from an earlier local day (CFG.SAVE_SESSION_DAYS or more
// days ago) — then it becomes the save as loaded at this start. Every later start of the same day keeps it, so a bug that breaks
// the save during the day (later sessions included) never reaches it: it is always the first start of a day
function rotateSession(sessionText, text) {
  const c = parse(sessionText), now = Date.now();
  if (plainObj(c) && Number.isFinite(c.at) && dayOf(now) - dayOf(c.at) < CFG.SAVE_SESSION_DAYS) return;
  write(SAVE_KEYS.session, `{"at":${now},"save":${text}}`);
}
// AC 3b: the game boots with `await loadSave()` before the first level is built (it replaced SPEC-011's initSaves): the stored save,
// recovered or migrated, applied to the game; the menu opens on the last world and its newest level
export async function loadSave() {
  if (window.__bbSaveBackend) backend = wrapBackend(window.__bbSaveBackend);   // the tests' async in-memory store (AC 3b)
  loading = true;
  saveInfo.noSave = false;
  const ok = await probe();
  // review fix: the stored keys are read even when the probe failed (a nearly full storage refuses a new key but would take a
  // fresh save over the real one); a failed probe or an unreadable save → no save writes this session, play from memory (noSave)
  const keys = [...Object.values(SAVE_KEYS).filter(k => k !== SAVE_KEYS.probe), ...OLD_KEYS];
  const got = await Promise.all(keys.map(k => backend.get(k)));
  const raw = Object.fromEntries(keys.map((k, i) => [k, got[i] === undefined ? null : got[i]]));
  saveInfo.saveOff = !ok || got[keys.indexOf(SAVE_KEYS.save)] === undefined;
  if (saveInfo.saveOff) storageFailed();
  for (const n of COPY_NAMES) saveInfo.copies[n] = raw[SAVE_KEYS[n]] !== null;
  errCache = parseLog(raw[SAVE_KEYS.errors]);
  const old = Object.fromEntries(OLD_KEYS.map(k => [k, raw[k]]));
  const stored = raw[SAVE_KEYS.save], s = parse(stored);
  let dirty = true;
  if (stored === null) migrateOld(old, true);                // no bebebe-save yet: the one migration (or a first launch)
  else if (validSave(s)) {
    useSave(s); lastText = stored;
    dirty = mergeStale(old);
    rotateSession(raw[SAVE_KEYS.session], stored);
  } else {
    // AC 4: broken — kept unchanged before anything is written, then the newest valid copy (no gifts after a failed load)
    if (raw[SAVE_KEYS.broken] === null) write(SAVE_KEYS.broken, stored);
    const copy = validCopies(raw)[0];
    if (copy) { useSave(copy.save); mergeStale(old); saveInfo.recovered = copy.name; noteDue("saveRecovered"); }
    else if (OLD_KEYS.some(k => old[k] !== null)) { migrateOld(old, false); saveInfo.recovered = "old"; noteDue("saveRecovered"); }
    else { migrateOld(old, false); saveInfo.recovered = "fresh"; noteDue("freshStart"); }
  }
  loading = false; loaded = true;
  try { adoptErrorLog(errCache); } catch (e) { /* the log never stops the start */ }
  G.world = progress.lastWorld;
  G.level = worldProgress().unlocked;                         // меню открывается на последнем мире, на его новом уровне
  if (dirty && !saveInfo.saveOff) {
    queueSave(); flushSaves();
    await lastWrite;
    // AC 3 (3): written, read back and validated — the migration record counts only when this worked
    if ((await backend.get(SAVE_KEYS.save)) !== lastText) storageFailed();
  }
  if (!saveInfo.saveOff) requestPersist();
}

// ---------- AC 5: persistent storage, asked once and only where it never prompts ----------
// Firefox / Gecko shows a permission doorhanger for persist() — skipped there; already persisted → kept without asking
export const promptsForPersist = ua => /Firefox\/|\bGecko\/\d/.test(ua);
function requestPersist() {
  try {
    const st = navigator.storage;
    if (!st || typeof st.persist !== "function" || (persist && persist.asked) || promptsForPersist(navigator.userAgent)) return;
    const done = granted => { persist = { asked: true, granted: !!granted }; queueSave(); };
    const ask = () => st.persist().then(done, () => { /* refused: nothing to keep */ });
    if (typeof st.persisted === "function") st.persisted().then(p => (p ? done(true) : ask()), () => { /* no answer */ });
    else ask();
  } catch (e) { /* no storage manager */ }
}
export const persistState = () => (persist ? { ...persist } : null);

// ---------- copies for the grown-ups page (AC 4, 6b) ----------
// the stored copies that hold a valid save: [{ name, at, stars, coins }] in the recovery order
export async function listCopies() {
  const raw = {};
  for (const n of COPY_NAMES) raw[SAVE_KEYS[n]] = await backend.get(SAVE_KEYS[n]);
  return validCopies(raw).map(({ name, at, save }) => {
    const p = loadProgress(save.progress);
    return { name, at, coins: p.coins, stars: Object.values(p.worlds).reduce((a, w) => a + Object.values(w.stars).reduce((x, y) => x + y, 0), 0) };
  });
}
// the save of a copy (or null)
async function copySave(name) {
  const c = parse(await backend.get(SAVE_KEYS[name]));
  return plainObj(c) && validSave(c.save) ? c.save : null;
}
// a whole save replaces the game's (restore, undo, import): this device's migration record and persist answer stay
function replaceWith(s) {
  const keepMigrated = migrated, keepPersist = persist;
  loading = true;
  useSave(s);
  loading = false;
  migrated = keepMigrated; persist = keepPersist;
}
// a grown-up restored or reset: the broken copy is no longer needed
const clearBroken = () => remove(SAVE_KEYS.broken);
// restoreCopy (AC 4): → true when the copy was valid and is the save now (the save before it becomes the backup)
// review fix: the save before a restore is kept first as bebebe-save-before-restore (the page can restore it back)
export async function restoreCopy(name) {
  const s = await copySave(name);
  if (!s) return false;
  flushSaves();
  write(SAVE_KEYS.restore, wrapCopy(JSON.stringify(saveObject())));
  replaceWith(s); clearBroken();
  if (name === "reset") await remove(SAVE_KEYS.reset);       // undoReset: the progress is back, the copy is used
  queueSave(); flushSaves();
  return true;
}
// what a save holds, to compare two copies: the stars, the owned items, the coins
function holding(save) {
  const p = loadProgress(save && save.progress);
  return [Object.values(p.worlds).reduce((a, w) => a + Object.values(w.stars).reduce((x, y) => x + y, 0), 0), Object.values(p.owned).reduce((a, l) => a + l.length, 0), p.coins];
}
// a holds less than b: fewer stars, or as many and fewer owned items, or as many of both and fewer coins (Claude's order)
const holdsLess = (a, b) => { const x = holding(a), y = holding(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
// AC 6b: before a reset wipes the progress, the save as it is now is kept. Review fix: two reset copies — bebebe-save-before-reset
// (undo) and -before-reset-2. The save of this reset is always kept; of the older reset copies the one that holds more stays with
// it (the weakest of the three goes); of the pair, the one that holds more is before-reset (undo), the other -2. Both are listed
// under Restore a copy
export async function snapshotBeforeReset() {
  flushSaves();
  const now = saveObject(), text = JSON.stringify(now);
  clearBroken();
  const olds = (await Promise.all([copyText("reset"), copyText("reset2")])).filter(Boolean);
  const other = olds.sort((a, b) => (holdsLess(a.save, b.save) ? 1 : holdsLess(b.save, a.save) ? -1 : 0))[0];
  if (!other) return write(SAVE_KEYS.reset, wrapCopy(text));
  const [first, second] = holdsLess(now, other.save) ? [other.text, wrapCopy(text)] : [wrapCopy(text), other.text];
  write(SAVE_KEYS.reset, first);
  return write(SAVE_KEYS.reset2, second);
}
// a copy's stored text and its save (or null)
async function copyText(name) {
  const t = await backend.get(SAVE_KEYS[name]), c = parse(t);
  return plainObj(c) && validSave(c.save) ? { text: t, save: c.save } : null;
}
// a reset (fresh progress): what the stored progress held for newer versions goes too; the migration record stays (AC 6b)
export function forgetHeldProgress() { const top = held.top; held = emptyHeld(); held.top = top; }
// AC 6b: "Erase all data on this device" — every bebebe-* key, the old keys included (the one exception); nothing is written after
export async function eraseAll() {
  erased = true; pending.clear();
  await lastWrite;                         // review fix: the writes already started finish first (call order), then everything goes
  const keys = new Set([...(await backend.keys()), ...Object.values(SAVE_KEYS), ...OLD_KEYS, "bebebe-place", "bebebe-skins"]);
  await Promise.all([...keys].map(k => backend.remove(k)));
}

// ---------- AC 6c: the parents' code ----------
// "BB1." + base64url(UTF-8 JSON of the save, without this device's migration record) + "." + its checksum; the JSON carries version
const b64url = s => { let bin = ""; for (const c of new TextEncoder().encode(s)) bin += String.fromCharCode(c); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = s => { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };
export function saveCode() {
  flushSaves();
  const s = saveObject();
  delete s.migrated; delete s.persist;
  const json = JSON.stringify(s);
  return `BB1.${b64url(json)}.${fingerprint(json)}`;
}
// a pasted code → { ok: true, save } or { ok: false, error: "codeBad" | "codeTooNew" } (spaces and line breaks ignored)
export function readCode(code) {
  const parts = String(code || "").replace(/\s+/g, "").split(".");
  if (parts.length !== 3 || parts[0] !== "BB1") return { ok: false, error: "codeBad" };
  let json;
  try { json = unb64url(parts[1]); } catch (e) { return { ok: false, error: "codeBad" }; }
  if (fingerprint(json) !== parts[2]) return { ok: false, error: "codeBad" };
  const s = parse(json);
  if (!validSave(s)) return { ok: false, error: "codeBad" };
  if (s.version > SAVE_VERSION) return { ok: false, error: "codeTooNew" };
  return { ok: true, save: s };
}
// import: a snapshot first (undo through restoreCopy("import")), then the code's save through the normal schema
export function importSave(s) {
  flushSaves();
  write(SAVE_KEYS.import, wrapCopy(JSON.stringify(saveObject())));
  replaceWith(s); clearBroken();
  queueSave(); flushSaves();
}

// for the tests (__bb.save): outfits by id → indexes, or (toIds) indexes → ids
export const outfitsOf = (v, toIds = false) => (toIds ? outfitsToIds(v) : outfitsFromIds(v));
// for the tests (__bb.save.info): the save module's state as plain data
export const saveState = () => ({ version: SAVE_VERSION, loaded, noSave: saveInfo.noSave, notes: [...saveInfo.notes], shown: [...saveInfo.shown],
  copies: { ...saveInfo.copies }, recovered: saveInfo.recovered, future, persist: persistState(), pending: pending.size, erased, saveOff: saveInfo.saveOff });
// the next note due (and it is shown now: once per session) or null — the grown-ups module shows it in the menus
export function takeNote() {
  const n = saveInfo.notes.shift();
  if (!n) return null;
  saveInfo.shown.push(n);
  return n;
}
