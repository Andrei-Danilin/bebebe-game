// SPEC-013 step 2 (AC 5): leaving, rejoining and the Room closing itself — on a test server with the waiting times shortened (TEST_REJOIN_TIME 2 s, TEST_EMPTY_TTL 3 s,
// TEST_IDLE_TTL 5 s; the Room reads them only with TEST_HOOKS=1; the real ones are CFG.ONLINE.REJOIN_TIME 60, EMPTY_ROOM_TTL 120, IDLE_ROOM_TTL 900).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { HELLO, connect, drain, join, newRoom, post, sleep, startServer, until } from "./harness.mjs";

let server;
before(async () => { server = await startServer({ vars: { TEST_REJOIN_TIME: "2", TEST_EMPTY_TTL: "3", TEST_IDLE_TTL: "5" } }); }, { timeout: 120_000 });
after(async () => { await server?.stop(); });

let n = 1;
const ip = () => `10.4.0.${n++}`;
const notFound = async (code, who) => {
  const c = connect(server, code, { ip: who });
  await c.opened;
  return (await c.recv("error")).code;
};

test("a dropped kid's slot waits REJOIN_TIME for his token, then is free and the token is forgotten", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who });
  b.c.close();
  const waiting = await until(a.c, "roomState", m => m.slots[1].connected === false);
  assert.deepEqual([waiting.slots[1].kind, waiting.owner], ["human", 0], "he is still in the lobby, marked as reconnecting");
  const free = await until(a.c, "roomState", m => m.slots[1].kind === "bot", 6000);
  assert.equal(free.slots[1].kind, "bot", "his time ran out: the slot is a bot's");
  const late = connect(server, code, { ip: who });
  await late.opened;
  late.send({ ...HELLO, token: b.welcome.token });
  const w = await late.recv("welcome");
  assert.notEqual(w.token, b.welcome.token, "the old token is no longer his: he is a new kid");
  a.c.close(); late.close();
});

test("a kid back with his token inside REJOIN_TIME has his slot, and the timer does not free it later", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who });
  b.c.send({ type: "setName", adj: 6, animal: 6 });
  await until(a.c, "roomState", m => m.slots[1].name?.adj === 6);
  b.c.close();
  await until(a.c, "roomState", m => m.slots[1].connected === false);
  const back = connect(server, code, { ip: who });
  await back.opened;
  back.send({ ...HELLO, token: b.welcome.token });
  assert.deepEqual(await back.recv("welcome").then(w => [w.slot, w.token]), [1, b.welcome.token]);
  await sleep(3000);                                                  // past the old deadline
  const s = await until(a.c, "roomState", m => m.slots[1].connected === true);
  assert.deepEqual([s.slots[1].kind, s.slots[1].name], ["human", { adj: 6, animal: 6 }]);
  a.c.close(); back.close();
});

test("the owner dropping passes ownership to the longest-connected kid; back with his token he is a kid again", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who }), c = await join(server, code, { ip: who });
  a.c.close();
  assert.equal((await until(b.c, "roomState", m => m.owner === 1)).owner, 1, "slot 1 joined before slot 2");
  const back = connect(server, code, { ip: who });
  await back.opened;
  back.send({ ...HELLO, token: a.welcome.token });
  await back.recv("welcome");
  const s = await until(b.c, "roomState", m => m.slots[0].connected === true);
  assert.equal(s.owner, 1, "ownership stays with the new owner");
  // the others leave for good: ownership comes back to the kid who is still here
  b.c.send({ type: "leave" }); c.c.send({ type: "leave" });
  await until(back, "roomState", m => m.owner === 0);
  back.close();
});

test("an empty room closes (EMPTY_ROOM_TTL) and its code can be made again", async () => {
  const who = ip(), code = await newRoom(server, who);
  await sleep(4500);
  assert.equal(await notFound(code, who), "roomNotFound");
  const again = await post(server, "/rooms", { ip: who, query: `_codes=${code}` });
  assert.equal((await again.json()).code, code, "the same code is made again: the closed room kept nothing");
});

test("everybody left: the room closes after EMPTY_ROOM_TTL, not before", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who });
  a.c.send({ type: "leave" });
  await a.c.closed;
  await sleep(1200);
  const probe = await join(server, code, { ip: who, guest: true });   // still there (and he is a first kid again)
  assert.equal(probe.welcome.slot, 0);
  probe.c.send({ type: "leave" });
  await probe.c.closed;
  await sleep(4500);
  assert.equal(await notFound(code, who), "roomNotFound");
});

test("a lobby with no action closes after IDLE_ROOM_TTL; an action starts the time again", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who });
  await sleep(3000);
  a.c.send({ type: "setName", adj: 1, animal: 1 });
  await until(a.c, "roomState", m => m.slots[0].name !== null);
  a.c.send({ type: "ping" });
  await sleep(3000);                                                  // 6 s after the join, 3 s after the name
  assert.deepEqual(drain(a.c, "error"), [], "still open");
  const closed = await a.c.recv("error", 6000);
  assert.deepEqual(closed, { type: "error", code: "roomClosed" });
  assert.equal((await a.c.closed).code, 1000);
  assert.equal(await notFound(code, who), "roomNotFound");
});

test("a level in progress is not idle", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who });
  a.c.send({ type: "start" });
  await until(a.c, "roomState", m => m.phase === "play");
  await sleep(6500);                                                  // longer than IDLE_ROOM_TTL
  drain(a.c, "snapshot");
  const s = await a.c.recv("snapshot");
  assert.equal(s.hud.ph, "play");
  assert.deepEqual(drain(a.c, "error"), []);
  a.c.close();
});
