// SPEC-013 step 2 (AC 3, 5, 6): a level in the Room — start, snapshots at about SNAP_HZ, inputs and ackSeq, joining and leaving during play, and the lobby
// restored after the whole server restarts. Real Worker under `wrangler dev --local` (tests/online/harness.mjs).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { CFG } from "../../src/core/config.js";
import { HELLO, connect, drain, join, newRoom, sleep, startServer, until } from "./harness.mjs";

let server;
before(async () => { server = await startServer(); }, { timeout: 120_000 });
after(async () => { await server?.stop(); });

let n = 100;
const ip = () => `10.2.${n >> 8}.${n++ & 255}`;

test("start (owner): the room plays, snapshots come at about SNAP_HZ with growing ticks", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who });
  assert.equal(a.state.owner, 0);
  b.c.send({ type: "start" });
  assert.deepEqual(await b.c.recv("error"), { type: "error", code: "notOwner" });
  a.c.send({ type: "start" });
  const st = await until(a.c, "roomState", m => m.phase === "play");
  assert.deepEqual([st.world, st.n, st.phase], ["park", 1, "play"]);
  drain(a.c, "snapshot");
  await sleep(3000);
  const snaps = drain(a.c, "snapshot");
  const hz = snaps.length / 3;
  assert.ok(hz > 14 && hz < 26, `${snaps.length} snapshots in 3 s = ${hz.toFixed(1)} Hz`);
  const ticks = snaps.map(s => s.tick);
  assert.ok(ticks.every((t, i) => i === 0 || t > ticks[i - 1]), "ticks grow");
  assert.ok(ticks.every((t, i) => i === 0 || (t - ticks[i - 1]) % 3 === 0), "a snapshot every third 1/60 s step");
  const span = ticks.at(-1) - ticks[0], real = snaps.length - 1;
  assert.ok(span / real >= 3 && span / real < 4.5, `${span} ticks over ${real} snapshots: the game runs at about 60 steps/s`);
  const s = snaps.at(-1);
  assert.equal(s.littles.length, 5);
  assert.deepEqual(s.littles.map(l => l.k), [1, 1, 0, 0, 0], "two kids and three bots");
  assert.deepEqual([s.hud.ph, typeof s.big.x, s.ackSeq], ["play", "number", 0]);
  assert.ok(Math.max(...snaps.map(x => JSON.stringify(x).length)) < CFG.ONLINE.MAX_MSG, "a snapshot fits MAX_MSG");
  assert.ok(snaps.every(x => Array.isArray(x.events) && x.events.every(e => typeof e.type === "string")));
  // a second start is refused while a level plays; the guest sees the same game
  a.c.send({ type: "start" });
  assert.equal((await a.c.recv("error")).code, "badPhase");
  assert.ok(b.c.inbox.some(m => m.type === "snapshot"), "the guest gets the snapshots too");
  a.c.close(); b.c.close();
});

test("input moves my kid and ackSeq follows; a stale seq is ignored; the vector is clamped", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who });
  a.c.send({ type: "input", seq: 1, mx: 1, my: 0, kiss: false, kit: false, tiptoe: false });   // not playing yet: ignored
  a.c.send({ type: "start" });
  await until(a.c, "roomState", m => m.phase === "play");
  const first = await a.c.recv("snapshot");
  assert.equal(first.ackSeq, 0);
  drain(a.c, "snapshot");
  const x0 = first.littles[0].x;
  for (let seq = 1; seq <= 30; seq++) {
    a.c.send({ type: "input", seq, mx: 30, my: 40, kiss: false, kit: false, tiptoe: false });   // a wild vector: clamped to length 1 (0.6, 0.8)
    await sleep(33);
  }
  a.c.send({ type: "input", seq: 5, mx: -1, my: 0, kiss: false, kit: false, tiptoe: false });   // an old seq: ignored
  await sleep(300);
  const snaps = drain(a.c, "snapshot");
  const acks = snaps.map(s => s.ackSeq);
  assert.ok(acks.every((v, i) => i === 0 || v >= acks[i - 1]), "ackSeq never goes back");
  assert.equal(acks.at(-1), 30, "the last input applied is acknowledged");
  const last = snaps.at(-1).littles[0];
  const moved = Math.hypot(last.x - x0, last.y - first.littles[0].y);
  const secs = (snaps.at(-1).tick - first.tick) / 60;
  assert.ok(moved > 20, `the kid walked ${moved.toFixed(0)} px`);
  assert.ok(moved <= CFG.PLAYER_SPEED * (secs + 0.3) * 1.25, `and no faster than full speed (${moved.toFixed(0)} px in ${secs.toFixed(1)} s)`);
  assert.equal(last.mv, 1);
  a.c.close();
});

test("joining during play takes a bot's slot; a kid leaving or dropping gives it back to a bot at once", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who });
  a.c.send({ type: "start" });
  await until(a.c, "roomState", m => m.phase === "play");
  assert.deepEqual((await a.c.recv("snapshot")).littles.map(l => l.k), [1, 0, 0, 0, 0]);
  const b = await join(server, code, { ip: who });
  assert.equal(b.welcome.slot, 1, "a bot's slot");
  assert.equal(b.state.phase, "play");
  let s = await until(a.c, "snapshot", m => m.littles[1].k === 1);
  assert.deepEqual(s.littles.map(l => l.k), [1, 1, 0, 0, 0]);
  b.c.send({ type: "leave" });
  await b.c.closed;
  s = await until(a.c, "snapshot", m => m.littles[1].k === 0);
  assert.equal(s.littles[1].k, 0, "a bot again at once");
  const c = await join(server, code, { ip: who });
  assert.equal(c.welcome.slot, 1);
  await until(a.c, "snapshot", m => m.littles[1].k === 1);
  c.c.close();                                                       // a dropped socket: the slot waits for the token, a bot plays it
  await until(a.c, "snapshot", m => m.littles[1].k === 0);
  const rs = await until(a.c, "roomState", m => m.slots[1].connected === false);
  assert.deepEqual([rs.slots[1].kind, rs.slots[1].connected], ["human", false]);
  a.c.close();
});

test("the same token takes the slot back; the level goes on with the kid in it", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who });
  b.c.send({ type: "setName", adj: 4, animal: 5 });
  await until(a.c, "roomState", m => m.slots[1].name?.adj === 4);
  a.c.send({ type: "start" });
  await until(a.c, "roomState", m => m.phase === "play");
  b.c.close();
  await until(a.c, "snapshot", m => m.littles[1].k === 0);
  const back = connect(server, code, { ip: who });
  await back.opened;
  back.send({ ...HELLO, token: b.welcome.token });
  const w = await back.recv("welcome");
  assert.deepEqual([w.slot, w.token], [1, b.welcome.token], "his slot and the same token");
  const rs = await until(back, "roomState", m => m.slots[1].connected === true);
  assert.deepEqual(rs.slots[1].name, { adj: 4, animal: 5 }, "his name is still there");
  assert.equal(rs.phase, "play");
  await until(a.c, "snapshot", m => m.littles[1].k === 1);
  // a token nobody holds is just a new kid
  const stranger = connect(server, code, { ip: who });
  await stranger.opened;
  stranger.send({ ...HELLO, token: "z".repeat(32) });
  const w2 = await stranger.recv("welcome");
  assert.notEqual(w2.token, "z".repeat(32));
  assert.equal(w2.slot, 2);
  a.c.close(); back.close(); stranger.close();
});

test("nobody left in a level: it ends at once, the timer stops, the kid finds a lobby when he is back", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who });
  a.c.send({ type: "start" });
  await until(a.c, "roomState", m => m.phase === "play");
  a.c.close();
  await sleep(500);
  const back = connect(server, code, { ip: who });
  await back.opened;
  back.send({ ...HELLO, token: a.welcome.token });
  await back.recv("welcome");
  assert.equal((await back.recv("roomState")).phase, "lobby");
  await sleep(400);
  assert.deepEqual(drain(back, "snapshot"), [], "no timer runs in the lobby");
  back.close();
});

test("only the creator's key makes the owner: a stranger who joins first is a guest", async () => {
  const who = ip(), code = await newRoom(server, who);
  const guest = await join(server, code, { ip: who, guest: true });
  assert.deepEqual([guest.welcome.slot, guest.state.owner], [0, null], "nobody owns the room yet");
  guest.c.send({ type: "start" });
  assert.equal((await guest.c.recv("error")).code, "notOwner");
  const creator = await join(server, code, { ip: who });                // presents the ownerKey from POST /rooms
  assert.equal(creator.welcome.slot, 1);
  assert.equal(creator.state.owner, 1);
  const again = await join(server, code, { ip: who, hello: { ownerKey: "q".repeat(32) } });   // a made-up key does nothing
  assert.equal(again.state.owner, 1);
  guest.c.close(); creator.c.close(); again.c.close();
});

test("the lobby survives the whole server restarting; a level in progress ends; the kids come back with their tokens", async () => {
  const who = ip(), code = await newRoom(server, who);
  const a = await join(server, code, { ip: who }), b = await join(server, code, { ip: who });
  a.c.send({ type: "setName", adj: 2, animal: 3 });
  a.c.send({ type: "setLook", look: { hair: 2, hat: 3, jacket: 4, pants: 5 } });
  b.c.send({ type: "setName", adj: 7, animal: 8 });
  a.c.send({ type: "setProgress", worlds: { park: { open: true, reason: "start", unlocked: 2, won: 1, stars: "3" } } });
  await until(b.c, "roomState", m => m.slots[0].look?.hat === 3 && m.map?.park?.unlocked === 2 && m.slots[1].name?.adj === 7);
  a.c.send({ type: "start" });
  await until(a.c, "roomState", m => m.phase === "play");
  await a.c.recv("snapshot");
  await server.restart();                                            // the process dies and starts again over the same storage
  await Promise.all([a.c.closed, b.c.closed]);
  const back = connect(server, code, { ip: who });
  await back.opened;
  back.send({ ...HELLO, token: a.welcome.token });
  const w = await back.recv("welcome");
  assert.deepEqual([w.slot, w.token], [0, a.welcome.token]);
  const rs = await until(back, "roomState", () => true);
  assert.equal(rs.phase, "lobby", "the level that was playing is over");
  assert.equal(rs.owner, 0, "the owner is still the owner");
  assert.deepEqual(rs.slots[0].name, { adj: 2, animal: 3 });
  assert.deepEqual(rs.slots[0].look, { hair: 2, hat: 3, jacket: 4, pants: 5 });
  assert.deepEqual(rs.slots[1].name, { adj: 7, animal: 8 });
  assert.equal(rs.slots[1].connected, false, "his friend has not come back yet: his slot waits");
  assert.equal(rs.map.park.unlocked, 2, "the owner's map is kept with the lobby");
  const back2 = connect(server, code, { ip: who });
  await back2.opened;
  back2.send({ ...HELLO, token: b.welcome.token });
  assert.equal((await back2.recv("welcome")).slot, 1);
  await until(back, "roomState", m => m.slots[1].connected === true);
  // and the room works: a new level starts
  back.send({ type: "start" });
  await until(back2, "roomState", m => m.phase === "play");
  assert.equal((await back2.recv("snapshot")).littles[1].k, 1);
  back.close(); back2.close();
});
