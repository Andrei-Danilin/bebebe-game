// SPEC-013 step 3 (AC 9, AC 12's level choice): the owner's controls under `wrangler dev --local` — setLevel against the owner's map (checked by the core with the
// host's entitlement), lock, remove (and the ban of the removed kid's token), and the refusals for everybody else.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { CFG, levelsPerWorld } from "../../src/core/config.js";
import { HELLO, connect, drain, join, newRoom, sleep, startServer, until } from "./harness.mjs";

let server;
before(async () => { server = await startServer(); }, { timeout: 120_000 });
after(async () => { await server?.stop(); });

let n = 1;
const ip = () => `10.5.0.${n++}`;
const L = levelsPerWorld();
// the owner's compact map: the Park finished, the Field open up to level `fieldUnlocked`, the rest as the core would say
const world = (open, reason, unlocked, won = 0, stars = "") => ({ open, reason, unlocked, won, stars });
const park = world(true, "start", L, 2 ** L - 1, "3".repeat(L));
const map = (fieldUnlocked = 5) => ({ park, field: world(true, "previous", fieldUnlocked, 2 ** (fieldUnlocked - 1) - 1, ""), city: world(false, "locked", 1) });
const send = (c, m) => c.send(m);

test("setLevel: open levels of the owner's map are accepted, locked ones are not; start plays the chosen level", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who });
  // no map yet: only what a fresh save has (the Park, level 1)
  send(a.c, { type: "setLevel", world: "park", n: 1 });
  send(a.c, { type: "setLevel", world: "park", n: 2 });
  assert.deepEqual(await a.c.recv("error"), { type: "error", code: "levelLocked" });
  send(a.c, { type: "setLevel", world: "field", n: 1 });
  assert.equal((await a.c.recv("error")).code, "levelLocked", "the Field is closed on a fresh save");
  // the owner's map arrives
  send(a.c, { type: "setProgress", worlds: map(5) });
  send(a.c, { type: "setLevel", world: "field", n: 5 });
  const s = await until(b.c, "roomState", m => m.world === "field");
  assert.deepEqual([s.world, s.n], ["field", 5], "everybody sees the choice");
  send(a.c, { type: "setLevel", world: "field", n: 6 });
  assert.equal((await until(a.c, "error", () => true)).code, "levelLocked", "level 6 of the Field is not unlocked yet");
  send(a.c, { type: "setLevel", world: "city", n: 1 });
  assert.equal((await a.c.recv("error")).code, "levelLocked", "a world the map calls locked");
  send(a.c, { type: "setLevel", world: "beach", n: 1 });
  assert.equal((await a.c.recv("error")).code, "levelLocked", "a world missing from the map is a fresh one: locked");
  // a map that calls the Beach open with no progress in it (the main worlds are not done): the core decides, and it says closed
  send(a.c, { type: "setProgress", worlds: { ...map(5), beach: world(true, "bonus", 1, 0, "") } });
  await until(a.c, "roomState", m => m.map?.beach);
  send(a.c, { type: "setLevel", world: "beach", n: 1 });
  assert.equal((await a.c.recv("error")).code, "levelLocked", "the core says the Beach is closed for this progress");
  // a world the owner's map shows locked by the purchase
  send(a.c, { type: "setProgress", worlds: { ...map(5), field: world(false, "purchase", 5, 15, "") } });
  await until(a.c, "roomState", m => m.map?.field?.reason === "purchase");
  send(a.c, { type: "setLevel", world: "field", n: 2 });
  assert.equal((await a.c.recv("error")).code, "levelLocked", "closed by the purchase");
  // the guest cannot choose
  send(b.c, { type: "setLevel", world: "park", n: 1 });
  assert.deepEqual(await b.c.recv("error"), { type: "error", code: "notOwner" });
  // back to an open Field: start plays that level
  send(a.c, { type: "setProgress", worlds: map(5) });
  send(a.c, { type: "setLevel", world: "field", n: 3 });
  await until(a.c, "roomState", m => m.world === "field" && m.n === 3);
  send(a.c, { type: "start" });
  const play = await until(b.c, "roomState", m => m.phase === "play");
  assert.deepEqual([play.world, play.n], ["field", 3]);
  assert.ok((await b.c.recv("snapshot")).tick > 0, "the level runs");
  // not while playing
  send(a.c, { type: "setLevel", world: "park", n: 1 });
  assert.equal((await until(a.c, "error", () => true)).code, "badPhase");
  a.c.close(); b.c.close();
});

test("start refuses a level the map no longer allows", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who });
  send(a.c, { type: "setProgress", worlds: map(5) });
  send(a.c, { type: "setLevel", world: "field", n: 4 });
  await until(a.c, "roomState", m => m.n === 4);
  send(a.c, { type: "setProgress", worlds: { park } });                 // a new map: the Field is gone from it
  await until(a.c, "roomState", m => !m.map.field);
  send(a.c, { type: "start" });
  assert.deepEqual(await a.c.recv("error"), { type: "error", code: "levelLocked" });
  a.c.close();
});

test("lock: no new joins (roomLocked), the kids who are in rejoin with their token; unlock opens it again", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who });
  send(b.c, { type: "lock", on: true });
  assert.deepEqual(await b.c.recv("error"), { type: "error", code: "notOwner" });
  send(a.c, { type: "lock", on: true });
  assert.equal((await until(b.c, "roomState", m => m.locked)).locked, true, "everybody sees it");
  const late = connect(server, code, { ip: who });
  await late.opened;
  late.send(HELLO);
  assert.deepEqual(await late.recv("error"), { type: "error", code: "roomLocked" });
  assert.equal((await late.closed).code, 1008);
  b.c.close();                                                           // a kid drops and comes back with his token: allowed
  await until(a.c, "roomState", m => m.slots[1].connected === false);
  const back = connect(server, code, { ip: who });
  await back.opened;
  back.send({ ...HELLO, token: b.welcome.token });
  assert.deepEqual(await back.recv("welcome").then(w => [w.slot, w.token]), [1, b.welcome.token]);
  const stranger = connect(server, code, { ip: who });                   // a token nobody holds does not open a locked room
  await stranger.opened;
  stranger.send({ ...HELLO, token: "y".repeat(32) });
  assert.equal((await stranger.recv("error")).code, "roomLocked");
  send(a.c, { type: "lock", on: false });
  await until(a.c, "roomState", m => !m.locked);
  const open = await join(server, code, { ip: who });
  assert.equal(open.welcome.slot, 2);
  a.c.close(); back.close(); open.c.close();
});

test("remove: the kid gets `removed` and is out, his slot is a bot, his token cannot come back; the owner cannot remove himself", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who }), c = await join(server, code, { ip: who });
  send(b.c, { type: "remove", slot: 2 });
  assert.deepEqual(await b.c.recv("error"), { type: "error", code: "notOwner" });
  send(a.c, { type: "remove", slot: 0 });
  assert.deepEqual(await a.c.recv("error"), { type: "error", code: "badSlot" }, "not himself");
  send(a.c, { type: "remove", slot: 4 });
  assert.equal((await a.c.recv("error")).code, "badSlot", "not an empty slot");
  send(a.c, { type: "remove", slot: 1 });
  assert.deepEqual(await b.c.recv("removed"), { type: "removed" });
  assert.equal((await b.c.closed).code, 1000);
  const s = await until(a.c, "roomState", m => m.slots[1].kind === "bot");
  assert.deepEqual(s.slots.map(x => x.kind), ["human", "bot", "human", "bot", "bot"]);
  assert.equal(s.owner, 0);
  // his token is banned for this room: the hello is answered with `removed`, not with a seat
  const again = connect(server, code, { ip: who });
  await again.opened;
  again.send({ ...HELLO, token: b.welcome.token });
  assert.deepEqual(await again.recv("removed"), { type: "removed" });
  assert.equal((await again.closed).code, 1000);
  assert.deepEqual(drain(again, "welcome"), []);
  // a new kid takes the freed slot
  const fresh = await join(server, code, { ip: who });
  assert.equal(fresh.welcome.slot, 1);
  // a kid who dropped (no socket) can be removed too: he cannot come back either
  c.c.close();
  await until(a.c, "roomState", m => m.slots[2].connected === false);
  send(a.c, { type: "remove", slot: 2 });
  await until(a.c, "roomState", m => m.slots[2].kind === "bot");
  const lost = connect(server, code, { ip: who });
  await lost.opened;
  lost.send({ ...HELLO, token: c.welcome.token });
  assert.equal((await lost.recv("removed")).type, "removed");
  a.c.close(); fresh.c.close();
});

test("remove during a level: a bot plays the slot at once", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who });
  send(a.c, { type: "start" });
  await until(a.c, "snapshot", m => m.littles[1].k === 1);
  send(a.c, { type: "remove", slot: 1 });
  await b.c.recv("removed");
  const s = await until(a.c, "snapshot", m => m.littles[1].k === 0);
  assert.equal(s.littles[0].k, 1);
  a.c.close();
});

test("a free kid can host while the Full game is not enforced (the beta): everybody can", async () => {
  const who = ip(), code = await newRoom(server, who, "free");
  const a = await join(server, code, { ip: who, hello: { entitlement: "free" } });
  assert.equal(a.state.owner, 0);
  assert.equal(CFG.MONETIZATION.enforce, false);
  a.c.close();
  await sleep(50);
});
