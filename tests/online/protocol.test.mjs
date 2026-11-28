// SPEC-013 AC 4 / 2 / 8 (the pure parts, no server): protocol validation, room codes, the Origin check and the counters.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG, WORLDS, levelsPerWorld } from "../../src/core/config.js";
import { CLIENT_TYPES, OWNER_TYPES, PHASES, PROTOCOL, clampVector, parseClientMessage } from "../../online/src/protocol.js";
import { MessageRate, SlidingLimit, dayKey, ipKey, normaliseCode, originAllowed, randomCode, validCode } from "../../online/src/limits.js";

const parse = m => parseClientMessage(typeof m === "string" ? m : JSON.stringify(m));
const ok = m => { const r = parse(m); assert.equal(r.ok, true, JSON.stringify(r)); return r.msg; };
const bad = (m, error = "badMessage") => assert.deepEqual(parse(m), { ok: false, error });
const HELLO = { type: "hello", protocol: 1, clientVersion: "1.0.0", platform: "web", entitlement: "free" };

test("CFG.ONLINE holds the spec's numbers", () => {
  const o = CFG.ONLINE;
  assert.equal(o.CODE_LEN, 5);
  assert.equal(o.CODE_ALPHABET, "ABCDEFGHJKMNPQRSTUVWXYZ23456789");
  assert.deepEqual([o.MAX_LITTLES, o.SNAP_HZ, o.INTERP_MS, o.MAX_MSG, o.MAX_MSG_RATE], [5, 20, 100, 2048, 60]);
  assert.deepEqual([o.REJOIN_TIME, o.EMPTY_ROOM_TTL, o.IDLE_ROOM_TTL, o.ROOMS_PER_IP_MIN, o.JOINS_PER_IP_MIN], [60, 120, 900, 5, 20]);
  assert.ok(o.ORIGINS.includes("http://localhost:*") && o.ORIGINS.includes("capacitor://localhost") && o.ORIGINS.includes("https://localhost"));
  assert.deepEqual(Object.keys(o.SERVERS), ["local", "staging", "prod"]);
  assert.equal(o.SERVERS.local, "ws://localhost:8787");
});

test("every client message type of AC 4 has a validator, and only the owner ones are owner-only", () => {
  assert.deepEqual([...CLIENT_TYPES].sort(), ["hello", "input", "leave", "lock", "ping", "remove", "setGear", "setLevel", "setLook", "setName", "setProgress", "start"].sort());
  assert.deepEqual([...OWNER_TYPES].sort(), ["lock", "remove", "setLevel", "setProgress", "start"]);
  assert.equal(PROTOCOL, 1);
  assert.deepEqual([...PHASES], ["lobby", "play"], "no result phase: the Room is a lobby again once the result is sent");
});

test("hello: valid, token optional, unknown fields dropped", () => {
  assert.deepEqual(ok(HELLO), { type: "hello", protocol: 1, clientVersion: "1.0.0", platform: "web", entitlement: "free" });
  const token = "A".repeat(32);
  assert.equal(ok({ ...HELLO, token, extra: "x", platform: "ios", entitlement: "full" }).token, token);
  assert.equal(ok({ ...HELLO, ownerKey: token }).ownerKey, token, "the creator's one-time key");
  bad({ ...HELLO, ownerKey: "short" });
  assert.deepEqual(Object.keys(ok({ ...HELLO, extra: 1, name: "Ann", deviceId: "d" })).sort(), ["clientVersion", "entitlement", "platform", "protocol", "type"]);
  for (const patch of [{ platform: "tv" }, { entitlement: "gold" }, { clientVersion: 1 }, { clientVersion: "" }, { token: "short" }, { token: 7 }, { token: "!".repeat(32) }, { protocol: undefined }, { protocol: "1" }])
    bad({ ...HELLO, ...patch });
});

test("an unknown protocol version answers updateRequired", () => {
  bad({ ...HELLO, protocol: 2 }, "updateRequired");
  bad({ ...HELLO, protocol: 0 }, "updateRequired");
  bad({ ...HELLO, protocol: 99, platform: "tv" }, "updateRequired");   // before any other check: an old client may send a shape we do not know
});

test("size, JSON and shape limits", () => {
  assert.equal(CFG.ONLINE.MAX_MSG, 2048);
  bad("x".repeat(2049), "tooBig");
  bad(JSON.stringify({ type: "ping", pad: "x".repeat(2100) }), "tooBig");
  assert.equal(parse(JSON.stringify({ type: "ping", pad: "x".repeat(2000) })).ok, true, "just under the limit is fine");
  bad("é".repeat(1100), "tooBig");                                  // 2200 bytes, 1100 characters: the limit is in bytes
  bad("{not json", "badJson");
  bad("", "badJson");
  for (const v of ["[]", "null", "7", "\"ping\"", "{}", "{\"type\":5}"]) bad(v);
  bad({ type: "teleport" }, "unknownType");
  bad({ type: "constructor" }, "unknownType");
  bad({ type: "__proto__" }, "unknownType");
  assert.deepEqual(parseClientMessage(new ArrayBuffer(4)), { ok: false, error: "badMessage" }, "a binary frame");
});

test("setName: indices 0..15 only (names are picked, never typed)", () => {
  assert.deepEqual(ok({ type: "setName", adj: 0, animal: 15, extra: 1 }), { type: "setName", adj: 0, animal: 15 });
  for (const m of [{ adj: 16, animal: 0 }, { adj: -1, animal: 0 }, { adj: 1.5, animal: 0 }, { adj: "3", animal: 0 }, { adj: 0 }, { animal: 0 }, { adj: 0, animal: null }, { adj: "Fast", animal: "Penguin" }])
    bad({ type: "setName", ...m });
});

test("setLook: the four outfit indices inside their lists", () => {
  const look = { hair: 1, hat: 4, jacket: 2, pants: 3 };
  assert.deepEqual(ok({ type: "setLook", look: { ...look, cape: 9 } }), { type: "setLook", look });
  for (const patch of [{ hair: 99 }, { hat: -1 }, { jacket: 1.2 }, { pants: "0" }, { hair: undefined }]) bad({ type: "setLook", look: { ...look, ...patch } });
  bad({ type: "setLook" });
  bad({ type: "setLook", look: [1, 2, 3, 4] });
});

test("setGear: types checked, counts clamped to the shop maximums", () => {
  const big = ok({ type: "setGear", glove: "mega", gloveCharges: 1e12, kisses: 99999, kits: -5, upgrades: { fastFeet: 99, longItems: 2, quickHelp: -1, bogus: 3 }, extra: 1 });
  assert.deepEqual(big, { type: "setGear", glove: "mega", gloveCharges: CFG.SAVE_MAX_CHARGES, kisses: CFG.SAVE_MAX_CHARGES, kits: 0, upgrades: { fastFeet: 3, longItems: 2, quickHelp: 0 } });
  assert.deepEqual(ok({ type: "setGear" }), { type: "setGear", glove: "none", gloveCharges: 0, kisses: 0, kits: 0, upgrades: { fastFeet: 0, longItems: 0, quickHelp: 0 } });
  for (const m of [{ glove: "rocket" }, { glove: 5 }, { kisses: "3" }, { kits: null }, { gloveCharges: {} }, { upgrades: [] }, { upgrades: { fastFeet: "1" } }]) bad({ type: "setGear", ...m });
});

test("input: the vector is clamped to length 1, the rest is typed", () => {
  const m = ok({ type: "input", seq: 7, mx: 3, my: 4, kiss: true, hax: "x" });
  assert.deepEqual(m, { type: "input", seq: 7, mx: 0.6, my: 0.8, kiss: true, kit: false, tiptoe: false });
  const far = ok({ type: "input", seq: 0, mx: -50, my: 50 });
  assert.equal(Math.hypot(far.mx, far.my).toFixed(9), "1.000000000");
  assert.deepEqual(ok({ type: "input", seq: 1, mx: 0.3, my: -0.4 }), { type: "input", seq: 1, mx: 0.3, my: -0.4, kiss: false, kit: false, tiptoe: false }, "short vectors stay as they are");
  assert.deepEqual(clampVector(0, 0), { mx: 0, my: 0 });
  for (const patch of [{ seq: -1 }, { seq: 1.5 }, { seq: 2 ** 31 }, { seq: "1" }, { mx: "0" }, { my: null }, { kiss: 1 }, { kit: "yes" }, { tiptoe: null }, { mx: undefined }])
    bad({ type: "input", seq: 1, mx: 0, my: 0, ...patch });
  bad("{\"type\":\"input\",\"seq\":1,\"mx\":1e999,\"my\":0}");   // a JSON number that overflows is Infinity
});

test("owner messages: setLevel, lock, remove, start, setProgress", () => {
  assert.deepEqual(ok({ type: "setLevel", world: "city", n: 20, x: 1 }), { type: "setLevel", world: "city", n: 20 });
  for (const m of [{ world: "moon", n: 1 }, { world: "park", n: 0 }, { world: "park", n: levelsPerWorld() + 1 }, { world: "park", n: 1.5 }, { world: 1, n: 1 }, { world: "park" }]) bad({ type: "setLevel", ...m });
  assert.deepEqual(ok({ type: "lock", on: true }), { type: "lock", on: true });
  bad({ type: "lock", on: 1 });
  bad({ type: "lock" });
  assert.deepEqual(ok({ type: "remove", slot: 4 }), { type: "remove", slot: 4 });
  for (const slot of [5, -1, 1.5, "2", null]) bad({ type: "remove", slot });
  assert.deepEqual(ok({ type: "start", extra: 1 }), { type: "start" });
  assert.deepEqual(ok({ type: "leave" }), { type: "leave" });

  const world = { open: true, reason: "previous", unlocked: 5, won: 0b1111, stars: "3213" };
  const msg = ok({ type: "setProgress", worlds: { park: { ...world, junk: 1 }, city: { ...world, open: false, reason: "purchase" }, moon: world } });
  assert.deepEqual(Object.keys(msg.worlds).sort(), ["city", "park"], "unknown worlds are dropped");
  assert.deepEqual(msg.worlds.park, world, "unknown fields are dropped");
  for (const patch of [{ open: 1 }, { reason: "gift" }, { unlocked: 0 }, { unlocked: 21 }, { won: -1 }, { won: 2 ** 20 }, { stars: "4" }, { stars: "x" }, { stars: "3".repeat(21) }, { stars: [3] }])
    bad({ type: "setProgress", worlds: { park: { ...world, ...patch } } });
  bad({ type: "setProgress", worlds: [] });
  bad({ type: "setProgress", worlds: { park: 1 } });
  const all = Object.fromEntries(WORLDS.map(w => [w, { open: true, reason: "played", unlocked: levelsPerWorld(), won: 2 ** levelsPerWorld() - 1, stars: "3".repeat(levelsPerWorld()) }]));
  assert.ok(JSON.stringify({ type: "setProgress", worlds: all }).length < CFG.ONLINE.MAX_MSG, "a full map fits MAX_MSG");
  assert.equal(parse({ type: "setProgress", worlds: all }).ok, true);
});

test("ping may carry a number back", () => {
  assert.deepEqual(ok({ type: "ping" }), { type: "ping" });
  assert.deepEqual(ok({ type: "ping", t: 123456 }), { type: "ping", t: 123456 });
  bad({ type: "ping", t: "now" });
  bad({ type: "ping", t: -1 });
});

test("room codes: the alphabet, the length, no bias, typed text is normalised", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const code = randomCode();
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    assert.equal(validCode(code), true);
    for (const c of code) seen.add(c);
  }
  assert.equal(seen.size, CFG.ONLINE.CODE_ALPHABET.length, "every character of the alphabet turns up");
  for (const c of "IL10O") assert.equal(CFG.ONLINE.CODE_ALPHABET.includes(c), false, `${c} is not in the alphabet`);
  assert.equal(normaliseCode(" k7qx2 "), "K7QX2");
  assert.equal(normaliseCode(null), "");
  for (const v of ["K7QX", "K7QX22", "K7Q10", "k7qx2", "", "K7 X2", null, 12345]) assert.equal(validCode(v), false, String(v));
  // rejection sampling: bytes at or above the cut are skipped, so a stream of 255s still gives a valid code from the next bytes
  let calls = 0;
  const code = randomCode(CFG.ONLINE, n => (++calls === 1 ? new Uint8Array(n).fill(255) : new Uint8Array(n).fill(0)));
  assert.equal(code, "AAAAA");
});

test("Origin: the Pages origin, localhost on any port, the Capacitor origins", () => {
  for (const o of ["https://andrei-danilin.github.io", "http://localhost:5173", "http://localhost:8123", "http://localhost", "capacitor://localhost", "https://localhost"])
    assert.equal(originAllowed(o), true, o);
  for (const o of ["https://evil.example", "http://evil.localhost:3000", "http://localhost.evil.example:80", "https://andrei-danilin.github.io.evil.example", "http://andrei-danilin.github.io",
    "https://other.github.io", "capacitor://evil", "null", "", "http://localhost:99999x", "http://localhost/path", "https://localhost:8443/x"])
    assert.equal(originAllowed(o), false, o);
  assert.equal(originAllowed(null), false);
  assert.equal(originAllowed("http://127.0.0.1:8787"), false, "only localhost, as the spec says");
});

test("SlidingLimit and MessageRate count in memory", () => {
  const l = new SlidingLimit(3, 60_000);
  assert.deepEqual([0, 10, 20, 30].map(t => l.hit(t)), [true, true, true, false]);
  assert.equal(l.hit(59_999), false);
  assert.equal(l.hit(60_001), true, "the first hit left the window");
  const r = new MessageRate(60);
  let allowed = 0;
  for (let i = 0; i < 100; i++) if (r.hit(5000 + i)) allowed++;
  assert.equal(allowed, 60, "60 in one second, the rest refused");
  assert.equal(r.hit(6001), true, "a new second starts fresh");
});

test("the IP key is a salted hash that rotates daily and never holds the address", async () => {
  const t = Date.UTC(2026, 10, 28, 12), next = t + 86_400_000;
  const a = await ipKey("203.0.113.9", "salt", t);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await ipKey("203.0.113.9", "salt", t + 3_600_000), "same day, same key");
  assert.notEqual(a, await ipKey("203.0.113.9", "salt", next), "a new day, a new key");
  assert.notEqual(a, await ipKey("203.0.113.9", "other", t), "another salt, another key");
  assert.notEqual(a, await ipKey("203.0.113.10", "salt", t));
  assert.ok(!a.includes("203"), "no address in the key");
  assert.equal(dayKey(t), "2026-11-28");
});
