// SPEC-013 step 2 (AC 3): a level to its end — the core's autopilot plays the kids on a test server whose game clock runs 10 times faster (TEST_AUTO, TEST_SPEED:
// the Room reads them only with TEST_HOOKS=1). At the end every kid gets a `result` (a placeholder until step 5), the Room is a lobby again and the timer stops.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { drain, join, newRoom, sleep, startServer, until } from "./harness.mjs";

let server;
before(async () => { server = await startServer({ vars: { TEST_AUTO: "1", TEST_SPEED: "10" } }); }, { timeout: 120_000 });
after(async () => { await server?.stop(); });

test("the level ends with a result per kid, then the lobby; the timer stops; a new level can start", async () => {
  const ip = "10.3.0.1", code = await newRoom(server, ip);
  const a = await join(server, code, { ip }), b = await join(server, code, { ip });
  a.c.send({ type: "start" });
  const ra = await a.c.recv("result", 30_000), rb = await b.c.recv("result", 30_000);
  assert.deepEqual([ra.slot, rb.slot], [0, 1], "each kid gets his own slot's result");
  for (const r of [ra, rb]) {
    assert.deepEqual([r.win, r.world, r.n], [true, "park", 1]);
    assert.ok(r.time > 3 && r.stats.hugs >= 3, `${r.time.toFixed(1)} s, ${r.stats.hugs} hugs`);
    assert.ok(r.mine && typeof r.mine.hugs === "number", "his own counts");
  }
  assert.ok(ra.mine.hugs + rb.mine.hugs <= ra.stats.hugs);
  // the last snapshot says the level is won, then the room is a lobby again
  const lobby = await until(a.c, "roomState", m => m.phase === "lobby");
  assert.equal(lobby.owner, 0);
  assert.equal(drain(a.c, "snapshot").at(-1).hud.ph, "won");
  drain(a.c, "snapshot");
  await sleep(700);
  assert.deepEqual(drain(a.c, "snapshot"), [], "the timer stopped: no snapshot in the lobby");
  // the log counts the level and its slow steps, numbers only
  const out = server.logs();
  assert.match(out, /"ev":"level_end","won":1,"ticks":\d+,"steps":\d+,"slow_steps":\d+/);
  // and again
  a.c.send({ type: "start" });
  assert.equal((await until(b.c, "roomState", m => m.phase === "play")).phase, "play");
  assert.ok((await b.c.recv("snapshot")).tick > 0);
  assert.equal((await a.c.recv("result", 30_000)).win, true);
  a.c.close(); b.c.close();
});
