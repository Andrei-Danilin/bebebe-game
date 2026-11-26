// SPEC-023: the test environment — the browser draws with the WebGL backend the config chose (GPU locally, SwiftShader
// on CI / PW_GPU=0 / after a fallback), and the run is at below-normal priority unless PW_NICE=0.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const os = require("os");
const fs = require("fs");
const path = require("path");
const { glBackend, rendererInPage, isSoftware } = require("./test-env");
const { ciFont, DIR } = require("./ci-font");
const { openGame } = require("./helpers");

test("the WebGL renderer matches the chosen backend", { tag: "@fast" }, async ({ page }) => {
  const backend = glBackend();
  const renderer = await page.evaluate(rendererInPage);
  test.info().annotations.push({ type: "renderer", description: `${backend}: ${renderer}` });
  expect(renderer, "a WebGL context comes up").not.toBe("");
  if (backend === "swiftshader") expect(renderer).toMatch(/swiftshader/i);
  else expect(isSoftware(renderer), `hardware renderer expected, got "${renderer}"`).toBe(false);
});

// The worker is started by the runner after the global setup lowered it, so it inherits below normal. With PW_NICE=0
// nothing is changed (the priority is whatever the shell had, e.g. `start /belownormal claude`), so nothing to check.
test("the test worker runs at below-normal priority unless PW_NICE=0", async () => {
  test.skip(process.env.PW_NICE === "0", "PW_NICE=0: priority left as it is");
  expect(os.getPriority(0)).toBe(os.constants.priority.PRIORITY_BELOW_NORMAL);
});

// Windows: every process of this worker's browser (browser, renderers, utility; the GPU work runs in the browser process,
// see niceArgs in test-env.js) is "Below normal". The tree is found from this worker's pid through ParentProcessId.
test("the browser's processes run at below-normal priority (Windows)", async ({ page }) => {
  test.skip(process.platform !== "win32" || process.env.PW_NICE === "0" || !!process.env.CI, "Windows, PW_NICE on, local only");
  await page.evaluate(rendererInPage);                       // make sure the GPU side is up
  const { execFileSync } = require("child_process");
  // Win32_Process.Priority = the base priority of the process's class: 4 idle, 6 below normal, 8 normal, 10 above normal, 13 high
  const ps = "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Priority,Name | ForEach-Object { '{0} {1} {2} {3}' -f $_.ProcessId, $_.ParentProcessId, $_.Priority, $_.Name }";
  const rows = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" })
    .split(/\r?\n/).map(l => l.trim().split(" ")).filter(r => r.length >= 4).map(([pid, ppid, prio, name]) => ({ pid: +pid, ppid: +ppid, prio: +prio, name }));
  const mine = new Set([process.pid]);
  for (let grew = true; grew;) { grew = false; for (const r of rows) if (!mine.has(r.pid) && mine.has(r.ppid)) { mine.add(r.pid); grew = true; } }
  const browsers = rows.filter(r => mine.has(r.pid) && /chrom|msedge/i.test(r.name));
  expect(browsers.length, "the worker's browser processes are found").toBeGreaterThan(0);
  expect(browsers.filter(r => r.prio !== 6).map(r => `${r.name} ${r.pid}: base priority ${r.prio} (6 = below normal)`)).toEqual([]);
});

// ---------- SPEC-033 AC 14 (D-3): PW_FONT=ci — the local browser draws with the font CI draws with (DejaVu Sans, tests/fonts) ----------
// DejaVu Sans Bold at 20 px: "Hello World 0123456789" is 277.0 px wide (Segoe UI: 242.8, Arial: 265.8 — measured on a Windows machine)
test("PW_FONT=ci: the game's canvas and DOM text use DejaVu Sans, not the machine's fonts", async ({ page }) => {
  test.skip(!ciFont, "only with PW_FONT=ci");
  await openGame(page, { sim: true });
  const r = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    const w = font => { ctx.font = font; return ctx.measureText("Hello World 0123456789").width; };
    return { stack: w('800 20px system-ui, "Segoe UI", sans-serif'), rounded: w('900 20px "Arial Rounded MT Bold", Arial, sans-serif'), arial: w("800 20px Arial"),
      dom: getComputedStyle(document.body).fontFamily, loaded: document.fonts.check("20px BBCI") };
  });
  expect(r.stack, "the usual stack").toBeCloseTo(277, 0);
  expect(r.rounded, "the title stack").toBeCloseTo(277, 0);
  expect(r.arial, "Arial is swapped too").toBeCloseTo(277, 0);
  expect(r.dom, "the DOM").toMatch(/BBCI/);
  expect(r.loaded).toBe(true);
});
test("PW_FONT=ci: off by default; the font folder is test-only (not in the site, not precached) and carries its licence", { tag: "@fast" }, async () => {
  const { SITE, SITE_LATER, PAGES_ONLY } = require("../scripts/site");
  expect(ciFont, "PW_FONT=ci is on only when asked").toBe(process.env.PW_FONT === "ci");
  const all = [...SITE, ...SITE_LATER, ...PAGES_ONLY];
  expect(all.filter(f => /^tests|fonts/.test(f)), "no tests/ or fonts in the site list").toEqual([]);
  const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  expect(sw, "sw.js (the precache) never names the test fonts").not.toMatch(/tests\/fonts|DejaVu/);
  expect(fs.readdirSync(DIR).sort(), "the font files and their licence").toEqual(["AUTHORS", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "LICENSE"]);
  expect(fs.readFileSync(path.join(DIR, "LICENSE"), "utf8")).toMatch(/Bitstream Vera Fonts Copyright[\s\S]*Permission is hereby granted, free of charge/);
});
