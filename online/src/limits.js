// SPEC-013 AC 2 / 8: room codes, the Origin check, and the counters behind the limits (per-IP in the Limiter, per-socket in the Room).
// Pure (no Workers API), so Node tests import it. Nothing here is stored: every counter lives in memory and dies with its object.
import { CFG } from "../../src/core/config.js";

// ---------- room codes ----------
// random code: CODE_LEN characters of CODE_ALPHABET, each from a crypto byte with rejection (no modulo bias)
export function randomCode(cfg = CFG.ONLINE, getRandomValues = n => crypto.getRandomValues(new Uint8Array(n))) {
  const a = cfg.CODE_ALPHABET, limit = 256 - (256 % a.length);
  let out = "";
  while (out.length < cfg.CODE_LEN) for (const b of getRandomValues(cfg.CODE_LEN * 2)) if (b < limit && out.length < cfg.CODE_LEN) out += a[b % a.length];
  return out;
}
// what a player typed (or a link carried) → the code to look for: upper-cased, spaces dropped
export const normaliseCode = v => (typeof v === "string" ? v.trim().toUpperCase() : "");
export function validCode(code, cfg = CFG.ONLINE) {
  return typeof code === "string" && code.length === cfg.CODE_LEN && [...code].every(c => cfg.CODE_ALPHABET.includes(c));
}

// ---------- Origin ----------
// an allowed origin is written in full ("https://host"); `:*` in place of the port allows any port ("http://localhost:*" also allows no port)
export function originAllowed(origin, list = CFG.ONLINE.ORIGINS) {
  if (typeof origin !== "string") return false;
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/:?#]+)(?::(\d{1,5}))?$/i.exec(origin);
  if (!m) return false;
  return list.some(entry => {
    if (entry === origin) return true;
    const w = /^(.*):\*$/.exec(entry);
    return !!w && w[1].toLowerCase() === `${m[1]}://${m[2]}`.toLowerCase();
  });
}

// ---------- counters ----------
// at most `limit` hits in any `windowMs`: true when this hit is allowed (and counted)
export class SlidingLimit {
  /** @param {number} limit @param {number} windowMs */
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.stamps = []; }
  hit(now = Date.now()) {
    const from = now - this.windowMs;
    while (this.stamps.length && this.stamps[0] <= from) this.stamps.shift();
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(now);
    return true;
  }
}
// messages per second of one socket: a fixed one-second window; true while the socket is within MAX_MSG_RATE
export class MessageRate {
  /** @param {number} max */
  constructor(max = CFG.ONLINE.MAX_MSG_RATE) { this.max = max; this.start = 0; this.n = 0; }
  hit(now = Date.now()) {
    if (now - this.start >= 1000) { this.start = now; this.n = 0; }
    return ++this.n <= this.max;
  }
}

// ---------- the IP key ----------
// the Limiter is named by a salted hash of the client IP that changes every UTC day: the same child gets a new name each day, and the
// address itself is never stored or logged (SPEC-013 AC 8, RR-56)
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export async function ipKey(ip, salt, now = Date.now()) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${dayKey(now)}|${ip}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
