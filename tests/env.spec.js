// SPEC-023: the test environment — the browser draws with the WebGL backend the config chose (GPU locally, SwiftShader
// on CI / PW_GPU=0 / after a fallback), and the run is at below-normal priority unless PW_NICE=0.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const os = require("os");
const { glBackend, rendererInPage, isSoftware } = require("./test-env");

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
