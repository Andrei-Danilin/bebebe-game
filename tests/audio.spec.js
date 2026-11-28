// SPEC-047 AC 4 / 5 / 8 / 15 (step 2): the audio engine and the sounds. A rendered page (the engine needs a real AudioContext): the sounds
// load after the first gesture (assets/audio, manifest.json), every event of the core plays its sound (__bb.audio.log = the last 50 plays
// { name, at, n }), a sound whose file is missing or broken plays its beep, nothing plays with the sounds off, the loops follow the game.
// The rules that EMIT the events are checked headless in tests/core/sfx-events.test.mjs; the files' budgets and the manifest in tests/audio/.
const { test, expect } = require("./pw");
const fs = require("fs");
const path = require("path");
const { openGame, openSim, setupHug, step, ROOT } = require("./helpers");

const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "audio", "manifest.json"), "utf8")).files;
const LOADED = MANIFEST.filter(f => ["sfx", "loop", "jingle"].includes(f.kind)).map(f => f.name);      // what the engine loads (music is streamed: step 3)
const ONE_SHOTS = MANIFEST.filter(f => f.kind === "sfx").map(f => f.name);

// a tap: the first gesture — the audio context starts; then wait for the files (every one loaded or failed)
async function gesture(page) {
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => { const a = window.__bb.audioContext(); return !!a && a.state === "running"; });
}
async function ready(page, count = LOADED.length) {
  await gesture(page);
  await page.waitForFunction(n => window.__bb.audio.loaded.length + window.__bb.audio.failed.length >= n, count, { timeout: 30_000 });
}
const mark = page => page.evaluate(() => { const l = window.__bb.audio.log; return l.length ? l[l.length - 1].n : 0; });
const since = (page, n) => page.evaluate(n0 => window.__bb.audio.log.filter(e => e.n > n0), n);
const wait = page => page.waitForTimeout(90);                    // the same sound twice within RETRIGGER (0.05 s of context time) is one
// a level in play with a calm Big One far from the kid: nothing of the game itself makes a sound
async function calm(page, players = 1) {
  await page.evaluate(n => {
    const b = window.__bb;
    b.startGame(n);
    Object.assign(b.big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, blush: 0, x: 900, y: 600, dir: 0 });
    b.littles.forEach((l, i) => Object.assign(l, i === 0 ? { x: 300, y: 300, state: "ok", invuln: 0, hugCd: 0 } : { state: "rest", restTimer: 999, x: 200, y: 200 }));
  }, players);
}
// effect events pushed into the game's queue and drained by one step (the client's half: every sfx event plays)
const emit = (page, events) => page.evaluate(list => { const b = window.__bb; for (const e of list) b.game.fx.push({ type: "sfx", ...(typeof e === "string" ? { name: e } : e) }); b.update(b.CFG.STEP); }, events);

test("no audio context and no request for a file before the first gesture; the first gesture starts the engine and loads the sounds", async ({ page }) => {
  const requests = [];
  page.on("request", r => { if (r.url().includes("/assets/audio/")) requests.push(r.url()); });
  await openGame(page);
  await calm(page);
  await setupHug(page);
  await step(page, 0.05);                                      // a hug: its sound is asked for, nobody can play it yet
  expect(await page.evaluate(() => [window.__bb.audioContext(), window.__bb.audio.levels, window.__bb.audio.log, window.__bb.audio.loaded, window.__bb.sim().sounds > 0])).toEqual([null, null, [], [], true]);
  expect(requests, "no audio file is asked for before a gesture").toEqual([]);
  await ready(page);
  expect(await page.evaluate(() => window.__bb.audio.failed)).toEqual([]);
  expect(await page.evaluate(() => window.__bb.audio.loaded)).toEqual([...LOADED].sort());
  await page.waitForFunction(() => Math.abs(window.__bb.audio.levels.music - 0.35) < 0.002, null, { timeout: 10_000 });   // the bus moves to the play level over LEVEL_RAMP s
  const lv = await page.evaluate(() => window.__bb.audio.levels);                                     // gains are 32-bit floats
  expect([lv.master, lv.music, lv.sfx], "master → music (0.35: this page is in play, music.spec has the menu level) + sfx").toEqual([expect.closeTo(0.8, 5), expect.closeTo(0.35, 5), 1]);
  expect(requests.some(u => u.endsWith("/manifest.json"))).toBe(true);
});

test("every event of the core plays its sound (the file, not the beep); a bot's sound is quieter; a delayed one comes later", async ({ page }) => {
  await openGame(page);
  await ready(page);
  await calm(page);
  const n0 = await mark(page);
  await emit(page, [...ONE_SHOTS.slice(0, 1)]);                // the first step: the calm game plays nothing else
  expect((await since(page, n0)).map(e => e.name)).toEqual(ONE_SHOTS.slice(0, 1));
  await wait(page);
  const n1 = await mark(page);
  await emit(page, ONE_SHOTS.slice(1));
  const plays = await since(page, n1);
  expect(plays.map(e => e.name), "every one-shot of assets/audio, in the order of the events").toEqual(ONE_SHOTS.slice(1));
  expect(plays.filter(e => e.synth), "none fell back to a beep").toEqual([]);
  expect(await page.evaluate(() => window.__bb.audio.voices), "at most AUDIO.MAX_VOICES at once").toBeLessThanOrEqual(8);
  // a bot's sound is marked (it plays at AUDIO.OTHERS), a delayed one starts later
  await wait(page);
  const n2 = await mark(page);
  await emit(page, [{ name: "hug", other: true }, { name: "fall", delay: 0.25 }]);
  const [hug, fall] = await since(page, n2);
  expect([hug.name, hug.other, fall.name]).toEqual(["hug", true, "fall"]);
  expect(fall.at - hug.at, "the fall comes 0.25 s after").toBeCloseTo(0.25, 1);
});

test("the same sound is not started twice within RETRIGGER, the coin once per 0.06 s, and a 9th voice stops the oldest", async ({ page }) => {
  await openGame(page);
  await ready(page);
  await calm(page);
  const n0 = await mark(page);
  await emit(page, ["tap", "tap", "tap"]);
  expect((await since(page, n0)).map(e => e.name), "three taps at once: one").toEqual(["tap"]);
  await wait(page);
  const n1 = await mark(page);
  await emit(page, [{ name: "coin", delay: 0 }, { name: "coin", delay: 0.03 }, { name: "coin", delay: 0.07 }, { name: "coin", delay: 0.1 }, { name: "coin", delay: 0.14 }]);
  const coins = await since(page, n1);
  expect(coins.map(e => e.name)).toEqual(["coin", "coin", "coin"]);
  for (let i = 1; i < coins.length; i++) expect(coins[i].at - coins[i - 1].at, "one coin per 0.06 s").toBeGreaterThanOrEqual(0.06 - 1e-6);
  await wait(page);
  const n2 = await mark(page);
  await emit(page, ["hug", "push", "kiss", "star", "alert", "rescue", "boots", "cloak", "shield", "slip", "out", "back"]);
  expect((await since(page, n2)).length).toBe(12);
  expect(await page.evaluate(() => window.__bb.audio.voices), "the oldest were stopped: 8 at most").toBeLessThanOrEqual(8);
});

test("the game's own events play: a hug, a push (and the fall after it), a kit, a kiss, boots, a star; the kind walk plays kind, then the win jingle, then the count", async ({ page }) => {
  await openGame(page);
  await ready(page);
  // a hug
  await calm(page);
  let n = await mark(page);
  await setupHug(page);
  await step(page, 1 / 30);
  expect((await since(page, n)).map(e => e.name)).toEqual(["hug"]);
  // a push: Dad catches the kid in front of him
  await wait(page); await calm(page);
  n = await mark(page);
  await page.evaluate(() => {
    const b = window.__bb;
    Object.assign(b.big, { x: 500, y: 320, dir: 0, state: "look", timer: 999, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, hugCd: 0 });
    Object.assign(b.littles[0], { x: 500 + 36, y: 320, state: "ok", invuln: 0, hugCd: 0 });
    b.littles[0].fx.shield = 0; b.littles[0].fx.cloak = 0;
  });
  await step(page, 0.1);
  const pushed = await since(page, n);
  expect(pushed.map(e => e.name).sort(), "alert, push and the fall").toEqual(["alert", "fall", "push"]);
  expect(pushed.find(e => e.name === "fall").at - pushed.find(e => e.name === "push").at).toBeCloseTo(0.25, 1);
  // a rescue kit and a kiss
  await wait(page); await calm(page);
  n = await mark(page);
  await page.evaluate(() => { const b = window.__bb; b.progress.inv.rescues = 1; b.progress.inv.kisses = 2; b.littles[0].state = "down"; b.littles[0].downTimer = 60; b.useRescueKit(0); });
  await wait(page);
  await page.evaluate(() => { window.__bb.littles[0].kissCd = 0; window.__bb.throwKiss(0); });
  expect((await since(page, n)).map(e => e.name)).toEqual(["kit", "kiss"]);
  // boots and a bonus star
  await wait(page);
  n = await mark(page);
  await page.evaluate(() => { const b = window.__bb, l = b.littles[0]; b.items.length = 0; b.items.push({ id: 90, kind: "boots", x: l.x, y: l.y, t: 0, life: 99 }); b.spawnStar(l.x, l.y); });
  await step(page, 0.1);
  expect((await since(page, n)).map(e => e.name).sort()).toEqual(["boots", "star"]);
  // the last heart: hug, then Dad turns kind, walks home, the win jingle, the stars and coins counted, then the map opens the next level (unlock)
  await wait(page); await calm(page);
  n = await mark(page);
  await page.evaluate(() => { window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, 0.1);
  await page.evaluate(() => { const b = window.__bb, dt = b.CFG.STEP; for (let i = 0; i < 60 * 20 && b.mode === "play"; i++) b.update(dt); });
  expect(await page.evaluate(() => window.__bb.mode)).toBe("win");
  const names = (await since(page, n)).map(e => e.name);
  expect(names.slice(0, 2), "the last hug, then Dad turns kind").toEqual(["hug", "kind"]);
  expect(names, "the win jingle").toContain("win");
  expect(names.indexOf("kind"), "kind comes before the win jingle").toBeLessThan(names.indexOf("win"));
  expect(names, "the stars are counted once each, then the coins").toEqual(expect.arrayContaining(["star_1", "coin"]));
  const count = await since(page, n);
  expect(count.filter(e => e.name === "coin").length, "at most AUDIO.WIN_COUNT.coinMax").toBeLessThanOrEqual(12);
  expect(count.find(e => e.name === "star_1").at, "the count starts after the jingle starts").toBeGreaterThan(count.find(e => e.name === "win").at + 0.5);
  await page.evaluate(() => window.__bb.toMap());
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  expect((await since(page, n)).map(e => e.name), "a new level on the map").toContain("unlock");
});

test("with the sounds off nothing is logged as played, and the requests are still counted; with them on again the sounds come back", async ({ page }) => {
  await openGame(page);
  await ready(page);
  await calm(page);
  await page.evaluate(() => window.__bb.toHome());
  const n = await mark(page);
  await page.evaluate(() => window.__bb.tapButton("home:sound"));            // off
  expect(await page.evaluate(() => window.__bb.muted)).toBe(true);
  const n1 = await mark(page), s0 = await page.evaluate(() => window.__bb.sim().sounds);
  expect(n1 - n, "only the tap on the switch itself, made before it turned the sounds off").toBeLessThanOrEqual(1);
  await wait(page);
  await emit(page, ["hug", "push", "kiss"]);
  expect(await since(page, n1), "nothing played").toEqual([]);
  expect(await page.evaluate(() => window.__bb.sim().sounds), "the requests are counted").toBeGreaterThan(s0);
  await page.evaluate(() => window.__bb.tapButton("home:sound"));            // on
  await wait(page);
  await emit(page, ["hug"]);
  expect((await since(page, n1)).map(e => e.name)).toEqual(["hug"]);
});

test("a file that is missing (404) or broken plays the synth beep of that sound; one with no beep plays nothing", async ({ page }) => {
  await page.route("**/assets/audio/hug.mp3", r => r.fulfill({ status: 404, body: "no" }));
  await page.route("**/assets/audio/fall.mp3", r => r.fulfill({ status: 404, body: "no" }));
  await page.route("**/assets/audio/kit.mp3", r => r.fulfill({ status: 200, contentType: "audio/mpeg", body: "this is not an mp3" }));
  await openGame(page);
  await ready(page);
  expect(await page.evaluate(() => window.__bb.audio.failed)).toEqual(["fall", "hug", "kit"]);
  await calm(page);
  const n = await mark(page);
  await emit(page, ["hug", "kit", "fall", "push"]);
  expect(await since(page, n), "the beeps of hug and kit (as rescue), the file of push; fall has no beep").toEqual([
    expect.objectContaining({ name: "hug", synth: true }), expect.objectContaining({ name: "kit", synth: true }), expect.objectContaining({ name: "push" })]);
  expect((await since(page, n)).find(e => e.name === "push").synth).toBeUndefined();
});

test("a sound that is not loaded yet plays its beep (the files are slow)", async ({ page }) => {
  await page.route("**/assets/audio/hug.mp3", async r => { await new Promise(res => setTimeout(res, 1500)); await r.continue(); });
  await openGame(page);
  await gesture(page);
  await calm(page);
  const n = await mark(page);
  await emit(page, ["hug"]);
  expect(await since(page, n), "the file is on its way: the beep").toEqual([expect.objectContaining({ name: "hug", synth: true })]);
  await page.waitForFunction(() => window.__bb.audio.loaded.includes("hug"), null, { timeout: 30_000 });
  await wait(page);
  const n1 = await mark(page);
  await emit(page, ["hug"]);
  expect((await since(page, n1))[0].synth, "now the file").toBeUndefined();
});

test("loops follow the game: rescue_loop only while a player helps, dizzy while Dad lies, danger_tick inside his house, the steps near Dad; all stop outside play", async ({ page }) => {
  await openGame(page);
  await ready(page);
  await calm(page, 2);
  const loops = () => page.evaluate(() => window.__bb.audio.loops);
  expect(await loops()).toEqual([]);
  // player 2 stands by player 1, who lies
  await page.evaluate(() => { const b = window.__bb, [a, h] = b.littles; Object.assign(a, { state: "down", downTimer: 99, x: 300, y: 300 }); Object.assign(h, { state: "ok", x: 320, y: 300, invuln: 5 }); b.update(b.CFG.STEP); });
  expect(await loops()).toEqual(["rescue_loop"]);
  expect((await page.evaluate(() => window.__bb.audio.log)).filter(e => e.loop).map(e => e.name)).toEqual(["rescue_loop"]);
  await page.evaluate(() => { const b = window.__bb; b.littles[1].x = 700; b.update(b.CFG.STEP); });
  expect(await loops(), "the helper walked away").toEqual([]);
  // Dad lies
  await page.evaluate(() => { const b = window.__bb; b.big.slip = 3; b.update(b.CFG.STEP); });
  expect(await loops()).toEqual(["dizzy"]);
  // the pause stops everything
  await page.evaluate(() => { window.__bb.mode = "pause"; });
  await expect.poll(loops).toEqual([]);
  await page.evaluate(() => { window.__bb.mode = "play"; });
  await page.evaluate(() => { const b = window.__bb; b.update(b.CFG.STEP); });
  expect(await loops(), "back in play: Dad still lies").toEqual(["dizzy"]);
  // a kid running near Dad (D), a kid tiptoeing near Dad (Shift + D), and standing still: no steps
  await page.evaluate(() => {
    const b = window.__bb, g = b.grid, free = (x, y) => !g.seeSolid(x, y) && !b.inSafe({ x, y }) && !b.inDanger({ x, y });
    for (let cy = 5; cy < g.ROWS - 5; cy++) for (let cx = 5; cx < g.COLS - 5; cx++) {
      const p = { x: (cx + 0.5) * g.CELL, y: (cy + 0.5) * g.CELL };
      let ok = true;
      for (let k = 0; k < 16 && ok; k++) for (const r of [40, 90, 150]) ok = ok && free(p.x + Math.cos(k * Math.PI / 8) * r, p.y + Math.sin(k * Math.PI / 8) * r);
      if (!ok) continue;
      b.big.slip = 0;
      Object.assign(b.big, { x: p.x + 120, y: p.y, dir: 0, state: "look", timer: 9999, stun: 0, blush: 0, noPush: 0, pushCd: 0, hugCd: 0, noise: 0, hearCd: 99 });
      Object.assign(b.littles[0], { state: "ok", x: p.x, y: p.y, kx: 0, ky: 0, invuln: 0 });
      return;
    }
    throw new Error("no open spot");
  });
  const steps = async () => (await loops()).filter(n => n.endsWith("_steps"));
  const go = () => page.evaluate(() => { const b = window.__bb; b.big.noise = 0; b.big.hearCd = 99; for (let i = 0; i < 4; i++) b.update(b.CFG.STEP); });
  expect(await steps(), "standing still").toEqual([]);
  await page.keyboard.down("KeyD");
  await go();
  expect(await steps(), "running").toEqual(["run_steps"]);
  await page.keyboard.down("ShiftLeft");
  await go();
  expect(await steps(), "tiptoeing").toEqual(["tiptoe_steps"]);
  await page.keyboard.up("ShiftLeft"); await page.keyboard.up("KeyD");
  await go();
  expect(await steps(), "stopped").toEqual([]);
});

test("an OfflineAudioContext loop of rescue_loop has no gap over 5 ms at the seam", async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    const rate = 44100, ctx = new OfflineAudioContext(1, rate * 10, rate);
    const buf = await ctx.decodeAudioData(await (await fetch("assets/audio/rescue_loop.mp3")).arrayBuffer());
    const [a, b] = window.__bb.audio.loopRegion(buf);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true; src.loopStart = a; src.loopEnd = b;
    src.connect(ctx.destination); src.start(0, a);
    const out = (await ctx.startRendering()).getChannelData(0), len = b - a, worst = [];
    for (const k of [1, 2]) {                                  // the 1st and 2nd seam: the longest run of near-silence in ±40 ms around it
      let run = 0, best = 0;
      for (let i = Math.round((k * len - 0.04) * rate); i < Math.round((k * len + 0.04) * rate); i++) { run = Math.abs(out[i]) < 0.002 ? run + 1 : 0; best = Math.max(best, run); }
      worst.push(best / rate * 1000);
    }
    return { a, b, dur: buf.duration, worst };
  });
  const entry = MANIFEST.find(f => f.name === "rescue_loop");
  expect(r.b - r.a, "the region is the sound without the decoder's padding").toBeGreaterThan(entry.dur - 0.1);
  expect(r.b - r.a).toBeLessThanOrEqual(r.dur);
  for (const ms of r.worst) expect(ms, `longest near-silence at a seam (${r.worst.map(x => x.toFixed(2))} ms)`).toBeLessThanOrEqual(5);
});

test("sim mode plays nothing and no context exists; the requests are not counted", async ({ page }) => {
  await openSim(page);
  await page.evaluate(() => { const b = window.__bb; b.startGame(1); });
  const s0 = await page.evaluate(() => window.__bb.sim().sounds);
  await emit(page, ["hug", "push", "win"]);
  await page.mouse.click(5, 5);
  expect(await page.evaluate(s => [window.__bb.audioContext(), window.__bb.audio.log, window.__bb.audio.loops, window.__bb.audio.levels, window.__bb.sim().sounds === s], s0)).toEqual([null, [], [], null, true]);
});

test("the interface sounds: tap, back, page, buy, nope, unlock-less locked level, the boss card", async ({ page }) => {
  await openGame(page);
  await ready(page);
  await page.evaluate(() => window.__bb.toHome());
  await wait(page);
  const names = async fn => { const n = await mark(page); await page.evaluate(fn); await wait(page); return (await since(page, n)).map(e => e.name); };
  expect(await names(() => window.__bb.tapButton("home:lang")), "a button").toEqual(["tap"]);
  await page.evaluate(() => window.__bb.toHome());
  await page.evaluate(() => window.__bb.openMap());
  await wait(page);
  expect(await names(() => window.__bb.goBack()), "back (Escape, B, the back button)").toEqual(["back"]);
  await page.evaluate(() => window.__bb.openStory());
  await wait(page);
  expect(await names(() => window.__bb.tapButton("story:next")), "a page").toEqual(["page"]);
  await page.evaluate(() => window.__bb.toHome());
  // the shop: not enough coins → nope; enough → buy
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 0; b.progress.inv.kisses = 0; });
  expect(await names(() => window.__bb.buyKisses()), "not enough coins").toEqual(["nope"]);
  expect(await names(() => { window.__bb.progress.coins = 500; window.__bb.buyKisses(); }), "bought").toEqual(["buy"]);
  // a locked level on the map
  await page.evaluate(() => { window.__bb.openMap(); });
  await wait(page);
  expect(await names(() => window.__bb.chooseStop(15)), "a locked level").toEqual(["nope"]);
  // the card before the boss
  expect(await names(() => window.__bb.openScene("boss_park", null, { mark: false })), "the boss card").toEqual(["boss_sting"]);
});
