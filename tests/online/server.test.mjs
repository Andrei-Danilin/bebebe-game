// SPEC-013 step 1 (AC 1, 2, 4, 8): the real Worker under `wrangler dev --local` — /health, POST /rooms, joining (roomNotFound, roomFull), the
// wire-level validation answers, the message-rate close, the Origin check, the per-IP limits and the log spy. One server for the whole file
// (tests/online/harness.mjs starts it on a free port and kills it in `after`). Each test uses its own fake client IP (?_ip=, a test-only hook).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { CFG } from "../../src/core/config.js";
import { HELLO, connect, issuedTokens as tokens, join, newRoom, post, sleep, startServer } from "./harness.mjs";

let server;
before(async () => { server = await startServer(); }, { timeout: 120_000 });
after(async () => { await server?.stop(); });

const ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
const usedIps = new Set();  // every fake IP the tests used
const ip = n => { const v = `10.1.${n >> 8}.${n & 255}`; usedIps.add(v); return v; };

test("GET /health answers { ok, protocol }", async () => {
  const r = await fetch(`${server.http}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, protocol: 1 });
});

test("unknown routes and wrong methods are refused", async () => {
  assert.equal((await fetch(`${server.http}/nothing`)).status, 404);
  assert.equal((await fetch(`${server.http}/rooms`)).status, 404, "GET /rooms is not a route");
  assert.equal((await fetch(`${server.http}/ws?room=ABCDE`)).status, 426, "/ws without an upgrade");
});

test("POST /rooms gives a code of the alphabet, and a different one each time", async () => {
  const a = await newRoom(server, ip(1)), b = await newRoom(server, ip(1));
  assert.match(a, ALPHABET);
  assert.match(b, ALPHABET);
  assert.notEqual(a, b);
});

test("POST /rooms retries when the Room is live (up to 5 codes) and gives up after that", async () => {
  const who = ip(2);
  const first = await post(server, "/rooms", { ip: who, query: "_codes=QQQQQ" });
  assert.deepEqual(await first.json(), { code: "QQQQQ" });
  const again = await post(server, "/rooms", { ip: who, query: "_codes=QQQQQ,QQQQQ,RRRRR" });
  assert.deepEqual(await again.json(), { code: "RRRRR" }, "QQQQQ is live, the third try is free");
  const none = await post(server, "/rooms", { ip: who, query: "_codes=QQQQQ" });
  assert.equal(none.status, 503, "five live codes in a row");
  assert.deepEqual(await none.json(), { error: "busy" });
});

test("joining an unknown, malformed or never-created code → roomNotFound", async () => {
  for (const code of ["ZZZZZ", "ABC", "ABCDEFG", "AB1DE"]) {
    const c = connect(server, code, { ip: ip(3) });
    await c.opened;
    const err = await c.recv("error");
    assert.deepEqual(err, { type: "error", code: "roomNotFound" }, code);
    assert.equal((await c.closed).code, 1008);
  }
  // a hello to an unknown room never works either
  const c = connect(server, "YYYYY", { ip: ip(3) });
  await c.opened;
  c.send(HELLO);
  assert.equal((await c.recv("error")).code, "roomNotFound");
});

test("hello → welcome { token, slot } + roomState; a lower-case code works; the token is random per session", async () => {
  const code = await newRoom(server, ip(4));
  const a = await join(server, code.toLowerCase(), { ip: ip(4) });
  assert.equal(a.welcome.slot, 0);
  assert.match(a.welcome.token, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(a.state.code, code);
  assert.equal(a.state.owner, 0, "the first one in owns the room");
  assert.equal(a.state.phase, "lobby");
  assert.equal(a.state.locked, false);
  assert.equal(a.state.world, "park");
  assert.equal(a.state.n, 1);
  assert.equal(a.state.map, null);
  assert.equal(a.state.slots.length, CFG.ONLINE.MAX_LITTLES);
  assert.deepEqual(a.state.slots.map(s => s.kind), ["human", "bot", "bot", "bot", "bot"]);
  const b = await join(server, code, { ip: ip(4) });
  assert.equal(b.welcome.slot, 1);
  assert.notEqual(a.welcome.token, b.welcome.token);
  const seen = await a.c.recv("roomState");
  assert.deepEqual(seen.slots.map(s => s.kind), ["human", "human", "bot", "bot", "bot"], "the first one sees the second arrive");
  assert.equal(seen.owner, 0);
  // no token or entitlement ever travels in a roomState
  assert.ok(!JSON.stringify([a.state, b.state, seen]).includes(a.welcome.token));
  assert.ok(!JSON.stringify(seen).includes("entitlement"));
  a.c.close(); b.c.close();
});

test("the 6th join → roomFull; a freed slot is taken again", async () => {
  const code = await newRoom(server, ip(5));
  const kids = [];
  for (let i = 0; i < CFG.ONLINE.MAX_LITTLES; i++) kids.push(await join(server, code, { ip: ip(5) }));
  assert.deepEqual(kids.map(k => k.welcome.slot), [0, 1, 2, 3, 4]);
  const sixth = connect(server, code, { ip: ip(5) });
  await sixth.opened;
  sixth.send(HELLO);
  assert.deepEqual(await sixth.recv("error"), { type: "error", code: "roomFull" });
  assert.equal((await sixth.closed).code, 1008);
  // one leaves; the next one gets his slot
  kids[2].c.send({ type: "leave" });
  assert.equal((await kids[2].c.closed).code, 1000);
  const seen = await kids[0].c.recv("roomState");
  let state = seen;
  while (state.slots[2].kind !== "bot") state = await kids[0].c.recv("roomState");
  assert.equal(state.slots[2].kind, "bot", "the leaver's slot is a bot at once");
  const again = await join(server, code, { ip: ip(5) });
  assert.equal(again.welcome.slot, 2);
  for (const k of [...kids, again]) k.c.close();
});

test("the owner leaving passes ownership to the longest-connected player", async () => {
  const code = await newRoom(server, ip(6));
  const a = await join(server, code, { ip: ip(6) }), b = await join(server, code, { ip: ip(6) }), d = await join(server, code, { ip: ip(6) });
  assert.equal(a.state.owner, 0);
  a.c.close();                                   // a socket drop, not a "leave"
  let s = await b.c.recv("roomState");
  while (s.owner !== 1) s = await b.c.recv("roomState");
  assert.equal(s.owner, 1, "slot 1 joined before slot 2");
  assert.equal(s.slots[0].kind, "bot");
  b.c.send({ type: "leave" });
  await b.c.closed;
  s = await d.c.recv("roomState");
  while (s.owner !== 2) s = await d.c.recv("roomState");
  assert.equal(s.owner, 2);
  d.c.close();
});

test("setName, setLook and setGear change the lobby; a bad value is refused and changes nothing", async () => {
  const code = await newRoom(server, ip(7));
  const { c } = await join(server, code, { ip: ip(7) });
  c.send({ type: "setName", adj: 3, animal: 9 });
  let s = await c.recv("roomState");
  assert.deepEqual(s.slots[0].name, { adj: 3, animal: 9 });
  c.send({ type: "setLook", look: { hair: 1, hat: 2, jacket: 3, pants: 4 }, evil: "x" });
  s = await c.recv("roomState");
  assert.deepEqual(s.slots[0].look, { hair: 1, hat: 2, jacket: 3, pants: 4 });
  c.send({ type: "setGear", glove: "mega", gloveCharges: 3, kisses: 5, kits: 1 });
  s = await c.recv("roomState");
  assert.ok(!("gear" in s.slots[0]), "gear is for the game, not for the lobby screen");
  c.send({ type: "setName", adj: 99, animal: 0 });
  assert.deepEqual(await c.recv("error"), { type: "error", code: "badMessage" });
  c.send({ type: "setName", adj: "Fast", animal: "Penguin" });
  assert.equal((await c.recv("error")).code, "badMessage", "a typed name is never accepted");
  c.send({ type: "ping", t: 5 });
  assert.deepEqual(await c.recv("pong"), { type: "pong", t: 5 });
  assert.deepEqual(c.inbox, [], "the refused messages changed nothing: no roomState followed");
  c.close();
});

test("the owner's setProgress becomes roomState.map; others get notOwner", async () => {
  const code = await newRoom(server, ip(8));
  const a = await join(server, code, { ip: ip(8) }), b = await join(server, code, { ip: ip(8) });
  await a.c.recv("roomState");
  const park = { open: true, reason: "start", unlocked: 3, won: 3, stars: "31" };
  b.c.send({ type: "setProgress", worlds: { park } });
  assert.deepEqual(await b.c.recv("error"), { type: "error", code: "notOwner" });
  a.c.send({ type: "setProgress", worlds: { park, moon: park } });
  assert.deepEqual((await b.c.recv("roomState")).map, { park });
  assert.deepEqual((await a.c.recv("roomState")).map, { park });
  for (const t of ["setLevel", "lock", "remove", "start"]) {
    b.c.send(t === "setLevel" ? { type: t, world: "park", n: 1 } : t === "lock" ? { type: t, on: true } : t === "remove" ? { type: t, slot: 0 } : { type: t });
    assert.equal((await b.c.recv("error")).code, "notOwner", t);
  }
  a.c.close(); b.c.close();
});

test("the wire answers of protocol validation (AC 4)", async () => {
  const code = await newRoom(server, ip(9));
  // before hello only ping is allowed
  let c = connect(server, code, { ip: ip(9) });
  await c.opened;
  c.send({ type: "setName", adj: 1, animal: 1 });
  assert.deepEqual(await c.recv("error"), { type: "error", code: "needHello" });
  c.send({ type: "ping" });
  assert.deepEqual(await c.recv("pong"), { type: "pong" });
  c.send("{not json");
  assert.equal((await c.recv("error")).code, "badJson");
  c.send({ type: "teleport" });
  assert.equal((await c.recv("error")).code, "unknownType");
  c.send([1, 2]);
  assert.equal((await c.recv("error")).code, "badMessage");
  c.send({ ...HELLO, platform: "tv" });
  assert.equal((await c.recv("error")).code, "badMessage");
  c.send({ ...HELLO, token: "short" });
  assert.equal((await c.recv("error")).code, "badMessage");
  c.send(new Uint8Array([1, 2, 3]));
  assert.equal((await c.recv("error")).code, "badMessage", "a binary frame");
  // a valid hello still works after all that; a second hello does not
  c.send({ ...HELLO, evil: 1 });
  tokens.push((await c.recv("welcome")).token);
  c.send(HELLO);
  assert.equal((await c.recv("error")).code, "badMessage", "hello twice");
  // an input message is accepted silently (there is no game yet), a wild vector too
  c.send({ type: "input", seq: 1, mx: 30, my: 40, kiss: true });
  c.send({ type: "input", seq: 2, mx: "x", my: 0 });
  assert.equal((await c.recv("error")).code, "badMessage");
  // oversize: tooBig and the socket is closed
  c.send(JSON.stringify({ type: "ping", pad: "x".repeat(CFG.ONLINE.MAX_MSG + 1) }));
  assert.equal((await c.recv("error")).code, "tooBig");
  assert.equal((await c.closed).code, 1009);

  // an unknown protocol version → updateRequired, then closed
  c = connect(server, code, { ip: ip(9) });
  await c.opened;
  c.send({ ...HELLO, protocol: 2 });
  assert.deepEqual(await c.recv("updateRequired"), { type: "updateRequired", protocol: 1 });
  assert.equal((await c.closed).code, 1008);
});

test("more than MAX_MSG_RATE messages in a second close the socket", async () => {
  const code = await newRoom(server, ip(10));
  const c = connect(server, code, { ip: ip(10) });
  await c.opened;
  for (let i = 0; i < CFG.ONLINE.MAX_MSG_RATE * 2; i++) c.send({ type: "ping", t: i });
  const closed = await c.closed;
  assert.equal(closed.code, 1008);
  assert.equal(closed.reason, "rate");
  const pongs = c.inbox.filter(m => m.type === "pong").length;
  assert.ok(pongs <= CFG.ONLINE.MAX_MSG_RATE, `${pongs} pongs: nothing past the limit is answered`);
  // a calm client is never closed: 20 pings spread over time
  const calm = connect(server, code, { ip: ip(10) });
  await calm.opened;
  for (let i = 0; i < 20; i++) { calm.send({ type: "ping" }); await sleep(30); }
  for (let i = 0; i < 20; i++) await calm.recv("pong");
  calm.close();
});

test("Origin: refused for a stranger, allowed for the game's origins, CORS headers for those", async () => {
  const evil = { Origin: "https://evil.example" };
  for (const [method, p] of [["POST", "/rooms"], ["GET", "/health"], ["GET", "/ws?room=ABCDE"], ["OPTIONS", "/rooms"]]) {
    const r = await fetch(`${server.http}${p}${p.includes("?") ? "&" : "?"}_ip=${ip(11)}`, { method, headers: evil });
    assert.equal(r.status, 403, `${method} ${p}`);
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  }
  for (const origin of ["http://localhost:5173", "http://localhost:8123", "capacitor://localhost", "https://localhost", "https://andrei-danilin.github.io"]) {
    const r = await fetch(`${server.http}/rooms?_ip=${ip(11)}`, { method: "POST", headers: { Origin: origin } });
    assert.equal(r.status, 200, origin);
    assert.equal(r.headers.get("access-control-allow-origin"), origin);
    assert.match((await r.json()).code, ALPHABET);
  }
  const pre = await fetch(`${server.http}/rooms`, { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-methods"), /POST/);
  // the WebSocket upgrade: a page of another site cannot open one
  const code = await newRoom(server, ip(16));
  const bad = connect(server, code, { ip: ip(11), headers: { Origin: "https://evil.example" } });
  await assert.rejects(bad.opened);
  const good = connect(server, code, { ip: ip(11), headers: { Origin: "http://localhost:5173" } });
  await good.opened;
  good.send(HELLO);
  tokens.push((await good.recv("welcome")).token);
  good.close();
});

test("limits: at most ROOMS_PER_IP_MIN rooms per minute per client", async () => {
  const who = ip(12), other = ip(13);
  for (let i = 0; i < CFG.ONLINE.ROOMS_PER_IP_MIN; i++) assert.equal((await post(server, "/rooms", { ip: who })).status, 200, `room ${i + 1}`);
  const r = await post(server, "/rooms", { ip: who });
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: "rateLimited" });
  assert.equal((await post(server, "/rooms", { ip: other })).status, 200, "another client is not affected");
});

test("limits: at most JOINS_PER_IP_MIN join attempts per minute per client, then rateLimited", async () => {
  const who = ip(14);
  for (let i = 0; i < CFG.ONLINE.JOINS_PER_IP_MIN; i++) {
    const c = connect(server, "ZZZZZ", { ip: who });
    await c.opened;
    assert.equal((await c.recv("error")).code, "roomNotFound", `attempt ${i + 1} is let through`);
  }
  const c = connect(server, "ZZZZZ", { ip: who });
  await c.opened;
  assert.deepEqual(await c.recv("error"), { type: "error", code: "rateLimited" });
  assert.equal((await c.closed).code, 1008);
  const fine = connect(server, "ZZZZZ", { ip: ip(15) });
  await fine.opened;
  assert.equal((await fine.recv("error")).code, "roomNotFound", "another client is not affected");
});

test("log spy: no IP, token or code in anything the server printed (AC 8)", async () => {
  await sleep(300);
  // wrangler's own banner names the address it listens on; that is the server's, not a client's
  const out = server.logs().replaceAll(server.http, "<server>").replaceAll(server.ws, "<server>");
  assert.match(out, /"ev":"room_created"/, "the server logs its events (the spy is not blind)");
  assert.match(out, /"ev":"origin_refused"/);
  assert.match(out, /"ev":"msg_rate_close"/);
  assert.match(out, /"ev":"rate_limited_rooms"/);
  assert.match(out, /"ev":"rate_limited_joins"/);
  assert.match(out, /"ev":"player_joined"/);
  assert.ok(tokens.length >= 10, `${tokens.length} tokens were issued`);
  for (const t of tokens) assert.ok(!out.includes(t), "a session token is in the log");
  for (const v of usedIps) assert.ok(!out.includes(v), `the IP ${v} is in the log`);
  for (const v of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) assert.ok(!out.includes(v), `${v} (a client address) is in the log`);
  for (const code of ["QQQQQ", "RRRRR", "ZZZZZ", "YYYYY"]) assert.ok(!out.replace(/GET \/ws\?[^\n]*|POST \/rooms\?[^\n]*/g, "").includes(code), `room code ${code} in a log line`);
  assert.ok(!/entitlement|clientVersion|"adj"|"animal"/.test(out), "no client data in the log");
});
