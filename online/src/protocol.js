// SPEC-013 AC 4: protocol v1 — what the Room accepts from a client. Every incoming text is parsed here and nothing else reads it:
// types and ranges are checked, the input vector is clamped to length 1, unknown fields are dropped (the result holds only the
// fields of the message type), a text over CFG.ONLINE.MAX_MSG bytes is refused. Pure (no Workers API), so Node tests import it.
import { CFG, GLOVES, UPGRADES, WORLDS, levelsPerWorld, upgTop } from "../../src/core/config.js";
import { HAIRS, HATS, JACKETS, PANTS } from "../../src/core/wardrobe.js";

export const PROTOCOL = 1;
export const PLATFORMS = Object.freeze(["web", "ios", "android"]);
export const ENTITLEMENTS = Object.freeze(["free", "full"]);
export const PHASES = Object.freeze(["lobby", "play", "result"]);
// why a world is open or closed on the owner's map (progress-rules.js worldOpen: start, previous, bonus, played, locked; SPEC-045: purchase)
export const MAP_REASONS = Object.freeze(["start", "previous", "bonus", "played", "locked", "purchase"]);
export const NAME_PARTS = 16;               // I18N.onlineAdj / I18N.onlineAnimal: 16 each (SPEC-013 AC 10)
const MAX_SEQ = 2 ** 31 - 1;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const VERSION_RE = /^[\w.+-]{1,32}$/;

// helpers: each returns the normalised value, or `undefined` for a wrong type / out of range (the caller refuses the message)
const plain = v => !!v && typeof v === "object" && !Array.isArray(v);
const whole = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const finite = v => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const flag = (v, dflt = false) => (v === undefined ? dflt : typeof v === "boolean" ? v : undefined);
const oneOf = (v, list) => (list.includes(v) ? v : undefined);
// a count in a gear field: the shop's maximum clamps it (a trusted client may not be honest; SPEC-013 AC 11)
const count = (v, max) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : undefined);

// the input vector: any direction, never longer than 1 (a client that sends (3, 4) moves like (0.6, 0.8))
export function clampVector(mx, my) {
  const len = Math.hypot(mx, my);
  return len > 1 ? { mx: mx / len, my: my / len } : { mx, my };
}

function look(v) {
  if (!plain(v)) return undefined;
  const hair = whole(v.hair, 0, HAIRS.length - 1), hat = whole(v.hat, 0, HATS.length - 1);
  const jacket = whole(v.jacket, 0, JACKETS.length - 1), pants = whole(v.pants, 0, PANTS.length - 1);
  return [hair, hat, jacket, pants].includes(undefined) ? undefined : { hair, hat, jacket, pants };
}
function upgrades(v) {
  if (v === undefined) return Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0]));
  if (!plain(v)) return undefined;
  const out = {};
  for (const k of Object.keys(UPGRADES)) {
    const n = v[k] === undefined ? 0 : count(v[k], upgTop(k));
    if (n === undefined) return undefined;
    out[k] = n;
  }
  return out;
}
// the owner's map, compact (SPEC-013 AC 12): per world { open, reason, unlocked, won (a bit mask of the won levels: bit n-1), stars (a string, one
// digit 0…STARS_PER_LEVEL per level) }; unknown worlds and fields are dropped. Six worlds fit in about 400 bytes
function worlds(v) {
  if (!plain(v)) return undefined;
  const out = {}, levels = levelsPerWorld();
  for (const w of WORLDS) {
    if (v[w] === undefined) continue;
    const q = v[w];
    if (!plain(q)) return undefined;
    const open = flag(q.open), reason = oneOf(q.reason, MAP_REASONS), unlocked = whole(q.unlocked, 1, levels), won = whole(q.won, 0, 2 ** levels - 1);
    const stars = typeof q.stars === "string" && q.stars.length <= levels && new RegExp(`^[0-${CFG.STARS_PER_LEVEL}]*$`).test(q.stars) ? q.stars : undefined;
    if ([open, reason, unlocked, won, stars].includes(undefined)) return undefined;
    out[w] = { open, reason, unlocked, won, stars };
  }
  return out;
}

// one normaliser per client message type: (raw object) → the message's own fields, or undefined when refused. `type` is added by the caller
const NORMALISE = {
  hello(m) {
    if (m.protocol !== PROTOCOL) return undefined;
    const clientVersion = typeof m.clientVersion === "string" && VERSION_RE.test(m.clientVersion) ? m.clientVersion : undefined;
    const platform = oneOf(m.platform, PLATFORMS), entitlement = oneOf(m.entitlement, ENTITLEMENTS);
    const token = m.token === undefined ? undefined : typeof m.token === "string" && TOKEN_RE.test(m.token) ? m.token : null;
    if ([clientVersion, platform, entitlement].includes(undefined) || token === null) return undefined;
    return token === undefined ? { protocol: PROTOCOL, clientVersion, platform, entitlement } : { protocol: PROTOCOL, clientVersion, platform, entitlement, token };
  },
  setLook(m) { const l = look(m.look); return l && { look: l }; },
  setName(m) {
    const adj = whole(m.adj, 0, NAME_PARTS - 1), animal = whole(m.animal, 0, NAME_PARTS - 1);
    return adj === undefined || animal === undefined ? undefined : { adj, animal };
  },
  setGear(m) {
    const glove = m.glove === undefined || m.glove === null ? "none" : oneOf(m.glove, ["none", ...Object.keys(GLOVES)]);
    const gloveCharges = m.gloveCharges === undefined ? 0 : count(m.gloveCharges, CFG.SAVE_MAX_CHARGES);
    const kisses = m.kisses === undefined ? 0 : count(m.kisses, CFG.SAVE_MAX_CHARGES), kits = m.kits === undefined ? 0 : count(m.kits, CFG.SAVE_MAX_CHARGES);
    const up = upgrades(m.upgrades);
    return [glove, gloveCharges, kisses, kits, up].includes(undefined) ? undefined : { glove, gloveCharges, kisses, kits, upgrades: up };
  },
  setProgress(m) { const w = worlds(m.worlds); return w && { worlds: w }; },
  setLevel(m) {
    const world = oneOf(m.world, WORLDS), n = whole(m.n, 1, levelsPerWorld());
    return world === undefined || n === undefined ? undefined : { world, n };
  },
  lock(m) { return typeof m.on === "boolean" ? { on: m.on } : undefined; },
  remove(m) { const slot = whole(m.slot, 0, CFG.ONLINE.MAX_LITTLES - 1); return slot === undefined ? undefined : { slot }; },
  start() { return {}; },
  input(m) {
    const seq = whole(m.seq, 0, MAX_SEQ), mx = finite(m.mx), my = finite(m.my);
    const kiss = flag(m.kiss), kit = flag(m.kit), tiptoe = flag(m.tiptoe);
    if ([seq, mx, my, kiss, kit, tiptoe].includes(undefined)) return undefined;
    return { seq, ...clampVector(mx, my), kiss, kit, tiptoe };
  },
  leave() { return {}; },
  ping(m) {
    const t = m.t === undefined ? undefined : whole(m.t, 0, Number.MAX_SAFE_INTEGER);
    return m.t !== undefined && t === undefined ? undefined : t === undefined ? {} : { t };
  }
};
export const CLIENT_TYPES = Object.freeze(Object.keys(NORMALISE));
// messages only the room owner may send (SPEC-013 AC 4)
export const OWNER_TYPES = Object.freeze(["setProgress", "setLevel", "lock", "remove", "start"]);

const bytes = text => new TextEncoder().encode(text).length;

/**
 * Parse and validate one client text. `ok: true` → { msg } with `type` and only that type's fields; `ok: false` → { error } = the code of the
 * `error` message to answer ("tooBig", "badJson", "badMessage", "unknownType") or "updateRequired" (a hello of another protocol version).
 * @param {unknown} text @param {{ MAX_MSG: number }} [cfg]
 * @returns {{ ok: true, msg: any } | { ok: false, error: string }}
 */
export function parseClientMessage(text, cfg = CFG.ONLINE) {
  if (typeof text !== "string") return { ok: false, error: "badMessage" };       // a binary frame is never part of protocol v1
  if (text.length > cfg.MAX_MSG || bytes(text) > cfg.MAX_MSG) return { ok: false, error: "tooBig" };
  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: "badJson" }; }
  if (!plain(raw) || typeof raw.type !== "string") return { ok: false, error: "badMessage" };
  if (!Object.hasOwn(NORMALISE, raw.type)) return { ok: false, error: "unknownType" };
  if (raw.type === "hello" && typeof raw.protocol === "number" && raw.protocol !== PROTOCOL) return { ok: false, error: "updateRequired" };
  const fields = NORMALISE[raw.type](raw);
  return fields === undefined ? { ok: false, error: "badMessage" } : { ok: true, msg: { type: raw.type, ...fields } };
}

export const errorMsg = code => ({ type: "error", code });
