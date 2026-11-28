// SPEC-013 step 3 (AC 7): hosting needs the Full game when CFG.MONETIZATION.enforce — a test server turns enforcement on (TEST_HOOKS=1 + TEST_ENFORCE=1; the shipped
// value is off in the beta). Joining never needs it, and the room's worlds follow the HOST's entitlement, never a joiner's.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { levelsPerWorld } from "../../src/core/config.js";
import { HELLO, connect, join, newRoom, post, startServer, takeOwnerKey, until } from "./harness.mjs";

let server;
before(async () => { server = await startServer({ vars: { TEST_ENFORCE: "1" } }); }, { timeout: 120_000 });
after(async () => { await server?.stop(); });

let n = 1;
const ip = () => `10.6.0.${n++}`;
const L = levelsPerWorld();
const world = (open, reason, unlocked, won = 0, stars = "") => ({ open, reason, unlocked, won, stars });
// the progress of a kid who finished the Park: the Field is open by the progress; only the purchase can close it
const parkDone = world(true, "start", L, 2 ** L - 1, "3".repeat(L));
const withField = open => ({ park: parkDone, field: world(open, open ? "previous" : "purchase", 3, 3, "") });

test("POST /rooms: only the Full game can create a room; no body, a free creator or garbage cannot", async () => {
  const who = ip();
  for (const body of [undefined, { entitlement: "free" }, { entitlement: "gold" }, {}, "not json", "x".repeat(300)]) {
    const r = await post(server, "/rooms", { ip: who, body });
    assert.equal(r.status, 403, JSON.stringify(body)?.slice(0, 30));
    assert.deepEqual(await r.json(), { error: "needFull" });
  }
  const r = await post(server, "/rooms", { ip: who, body: { entitlement: "full" } });
  assert.equal(r.status, 200);
  const { code, ownerKey } = await r.json();
  assert.match(code, /^[A-Z2-9]{5}$/);
  assert.match(ownerKey, /^[A-Za-z0-9_-]{32}$/);
  assert.match(server.logs(), /"ev":"host_refused"/);
});

test("the creator's hello must say Full too: a free hello with the owner key is refused and the key stays", async () => {
  const who = ip(), code = await newRoom(server, who, "full");
  const key = takeOwnerKey(code);
  const liar = connect(server, code, { ip: who });
  await liar.opened;
  liar.send({ ...HELLO, entitlement: "free", ownerKey: key });
  assert.deepEqual(await liar.recv("error"), { type: "error", code: "needFull" });
  assert.equal((await liar.closed).code, 1008);
  const real = connect(server, code, { ip: who });                       // the key was not spent
  await real.opened;
  real.send({ ...HELLO, entitlement: "full", ownerKey: key });
  await real.recv("welcome");
  assert.equal((await real.recv("roomState")).owner, 0);
  real.close();
});

test("a free kid joins a Full host's room and plays the world the host picks; the host's entitlement decides, not the joiner's", async () => {
  const who = ip(), code = await newRoom(server, who, "full");
  const host = await join(server, code, { ip: who, hello: { entitlement: "full" } });
  const guest = await join(server, code, { ip: who, hello: { entitlement: "free" } });
  assert.deepEqual([host.state.owner, guest.welcome.slot], [0, 1], "joining needs nothing");
  host.c.send({ type: "setProgress", worlds: withField(true) });
  host.c.send({ type: "setLevel", world: "field", n: 3 });
  await until(guest.c, "roomState", m => m.world === "field" && m.n === 3);
  host.c.send({ type: "start" });
  await until(guest.c, "roomState", m => m.phase === "play");
  const s = await until(host.c, "snapshot", m => m.littles[1].k === 1);
  assert.deepEqual(s.littles.map(l => l.k), [1, 1, 0, 0, 0], "the free kid plays the Field");
  // the free joiner cannot make himself host's equal: his setLevel is refused as notOwner, his map is ignored
  guest.c.send({ type: "setLevel", world: "park", n: 1 });
  assert.equal((await guest.c.recv("error")).code, "notOwner");
  host.c.close(); guest.c.close();
});

test("ownership passing to a free kid: the room's worlds follow the new host's entitlement (the purchase locks the Field)", async () => {
  const who = ip(), code = await newRoom(server, who, "full");
  const host = await join(server, code, { ip: who, hello: { entitlement: "full" } });
  const kid = await join(server, code, { ip: who, hello: { entitlement: "free" } });
  host.c.send({ type: "leave" });
  await until(kid.c, "roomState", m => m.owner === 1);
  // a free host: the map he sends says the Field is open by his progress, but the core closes it for a free host
  kid.c.send({ type: "setProgress", worlds: withField(true) });
  await until(kid.c, "roomState", m => m.map?.field);
  kid.c.send({ type: "setLevel", world: "field", n: 2 });
  assert.deepEqual(await kid.c.recv("error"), { type: "error", code: "levelLocked" });
  kid.c.send({ type: "setLevel", world: "park", n: 5 });
  const s = await until(kid.c, "roomState", m => m.world === "park" && m.n === 5);
  assert.equal(s.n, 5, "the Park is free for everybody");
  kid.c.close();
});
