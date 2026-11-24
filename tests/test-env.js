// SPEC-023: the test machine's environment — which WebGL backend the test browser uses, and the runner's priority.
// Used by playwright.config.js, tests/global-setup.js, tests/env.spec.js and scripts/balance.js.
//
// GL backend (PW_GPU): on CI (process.env.CI) always SwiftShader, exactly as before SPEC-023. Locally hardware GL:
//   Windows --use-gl=angle --use-angle=d3d11, macOS --use-angle=metal, Linux --use-angle=gl.
//   Measured on Windows 11 (Intel UHD, Playwright 1.65 headless shell): without flags the headless shell picks
//   SwiftShader; "--use-gl=angle --use-angle=d3d11" alone gives "ANGLE (Intel, … Direct3D11 …, D3D11)"; --enable-gpu,
//   --ignore-gpu-blocklist and the full "chromium" channel change nothing, so they are not passed.
//   PW_GPU=0 forces SwiftShader, PW_GPU=1 forces the GPU (no fallback), unset/"auto" = the rule above. In auto mode the
//   global setup probes the GPU once; if no hardware WebGL context comes up, it sets PW_GL=swiftshader (workers re-read
//   the config with that env) and prints one line.
// Priority (PW_NICE): below normal unless PW_NICE=0; child processes (workers, browsers) inherit it on Windows, except
//   Chrome's GPU process (see niceArgs). Below normal gives way to every normal program: fine with the GPU, but SwiftShader
//   (all CPU cores) on a machine busy with other work starved into timeouts — PW_GPU=0 runs there want PW_NICE=0.
const os = require("os");

const SWIFTSHADER_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const GPU_ANGLE = { win32: "d3d11", darwin: "metal" };
const gpuArgs = () => ["--use-gl=angle", `--use-angle=${GPU_ANGLE[process.platform] || "gl"}`];

// "gpu" | "swiftshader". PW_GL is the resolved backend after the global setup's probe (set only on fallback).
function glBackend(env = process.env) {
  if (env.PW_GL === "gpu" || env.PW_GL === "swiftshader") return env.PW_GL;
  if (env.PW_GPU === "0") return "swiftshader";
  if (env.PW_GPU === "1") return "gpu";
  return env.CI ? "swiftshader" : "gpu";
}
const glArgs = (backend = glBackend()) => (backend === "gpu" ? gpuArgs() : SWIFTSHADER_ARGS);
// Chrome on Windows raises its GPU process to "Above normal" whatever the parent's priority (measured: the browser,
// renderer and utility processes inherit "Below normal", the GPU process does not; --disable-gpu-sandbox,
// --disable-features=GpuProcessHighPriorityWin change nothing). --in-process-gpu runs the GPU work (hardware or
// SwiftShader) inside the browser process, which inherits "Below normal". Only locally on Windows with PW_NICE on.
const niceArgs = (env = process.env) => (process.platform === "win32" && env.PW_NICE !== "0" && !env.CI ? ["--in-process-gpu"] : []);
// every flag the test browser gets
const browserArgs = (backend = glBackend(), env = process.env) => [...glArgs(backend), ...niceArgs(env)];
// auto mode = PW_GPU unset (or "auto"): only then may the GPU fall back to SwiftShader
const gpuAuto = (env = process.env) => !env.PW_GPU || env.PW_GPU === "auto";

// Runs in the page: the WebGL renderer string, or "" when no WebGL context comes up.
function rendererInPage() {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return "";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}
// a software renderer: SwiftShader, or Windows' "Microsoft Basic Render Driver", or llvmpipe on Linux
const isSoftware = r => /swiftshader|basic render|llvmpipe|softpipe/i.test(r);

// Below-normal priority for this process (and so for everything it starts). Returns true when it was lowered.
function lowerPriority(env = process.env) {
  if (env.PW_NICE === "0") return false;
  try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); return true; } catch (e) { return false; }
}

module.exports = { SWIFTSHADER_ARGS, gpuArgs, glBackend, glArgs, niceArgs, browserArgs, gpuAuto, rendererInPage, isSoftware, lowerPriority };
