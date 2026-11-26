// SPEC-034 AC 1 / 2: one game step everywhere. CFG.STEP is 1/60 s; the headless core, simRun, the autopilot, the balance runs and the
// bench take it from there (no second step number: CFG.BALANCE.SIM_DT is gone); the accumulator of live play (frameSteps) is pure.
// Plain Node.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CFG, frameSteps } from "../../src/core/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith(".js") || e.name.endsWith(".mjs") ? [path.join(d, e.name)] : []);

test("the step numbers", () => {
  assert.equal(CFG.STEP, 1 / 60);
  assert.equal(CFG.MAX_FRAME, 0.25);
  assert.equal(CFG.MAX_STEPS, 8);
});

test("no other game-step dt: SIM_DT is gone and no 1/30 is a step in src/ and scripts/", () => {
  const gone = ["SIM", "DT"].join("_");   // built, not written out: the scan below skips this file anyway, but a grep for the old name stays clean
  const bad = [];
  for (const f of [...files("src"), ...files("scripts"), ...files("tests/core")]) {
    if (f.endsWith("step.test.mjs")) continue;
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (text.includes(gone)) bad.push(`${f}: ${gone}`);
    if (/\b1\s*\/\s*30\b|0\.0333/.test(text)) bad.push(`${f}: 1/30`);
  }
  assert.equal(CFG.BALANCE[gone], undefined);
  assert.deepEqual(bad, []);
});

test("frameSteps: the accumulator", () => {
  const S = CFG.STEP;
  // 60 Hz: one step a frame; 30 Hz: two; 120 Hz: one every other frame; 20 Hz: three
  assert.deepEqual(frameSteps(0, 1 / 60), { n: 1, acc: 0 });
  assert.deepEqual(frameSteps(0, 1 / 30), { n: 2, acc: 0 });
  assert.equal(frameSteps(0, 0.05).n, 3);
  let a = 0, total = 0;
  for (let i = 0; i < 240; i++) { const r = frameSteps(a, 1 / 120); a = r.acc; total += r.n; }   // 2 s
  assert.equal(total, 120);
  for (let i = 0, t2 = 0; i < 2880; i++) { const r = frameSteps(i ? a : 0, 1 / 144); a = r.acc; t2 += r.n; if (i === 2879) assert.equal(t2, 1200, "20 s at 144 Hz = 1200 steps"); }
  // the remainder stays, below one step
  const r = frameSteps(0, 1.5 * S);
  assert.equal(r.n, 1);
  assert.ok(Math.abs(r.acc - 0.5 * S) < 1e-12);
  // a long frame counts as MAX_FRAME, at most MAX_STEPS steps run, the rest is dropped (acc stays below a step)
  assert.deepEqual(frameSteps(0, 0.25).n, CFG.MAX_STEPS);
  assert.equal(frameSteps(0, 30).n, CFG.MAX_STEPS);
  assert.ok(frameSteps(0, 30).acc < S);
  // nothing negative or odd in: no steps
  assert.deepEqual(frameSteps(0, -1), { n: 0, acc: 0 });
  assert.deepEqual(frameSteps(0, 0), { n: 0, acc: 0 });
});
