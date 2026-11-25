// SPEC-012 AC 8: how fast the core steps games side by side (the server of SPEC-013 runs many rooms in one Node process).
// 100 games (1 autopilot player + 4 bots, levels spread over the worlds) stepped in turn at CFG.BALANCE.SIM_DT (30 steps per
// game-second) for 60 game-seconds; prints ms per game step (median, p95). Not a test gate: the numbers go into
// docs/architecture.md. Target (spec): p95 ≤ 1 ms per game step.
//   npm run bench:core  [-- --games 100 --seconds 60]
const path = require("path");
const { pathToFileURL } = require("url");

const arg = (name, def) => { const i = process.argv.indexOf("--" + name); return i > 0 ? Number(process.argv[i + 1]) : def; };

async function main() {
  const core = await import(pathToFileURL(path.join(__dirname, "..", "src", "core", "index.js")).href);
  const { CFG, WORLDS, autopilot, createGame, levelsPerWorld, setProgress, step, withGame } = core;
  const GAMES = arg("games", 100), SECONDS = arg("seconds", 60), DT = CFG.BALANCE.SIM_DT, STEPS = Math.round(SECONDS / DT);
  setProgress(null);
  const t0 = performance.now();
  const games = Array.from({ length: GAMES }, (_, i) => {
    const g = createGame({ world: WORLDS[i % WORLDS.length], n: 1 + (i * 7) % levelsPerWorld(), seed: 1000 + i, fx: false, slots: [{ slot: "p1", kind: "player" }] });
    withGame(g, () => autopilot(true, "careful"));
    return g;
  });
  const build = performance.now() - t0, times = [];
  for (let s = 0; s < STEPS; s++) for (const g of games) {
    if (g.phase === "won") continue;                       // a won room is closed: nothing to step
    const a = performance.now();
    step(g, DT);
    times.push(performance.now() - a);
  }
  times.sort((x, y) => x - y);
  const q = p => times[Math.min(times.length - 1, Math.floor(p * times.length))];
  const won = games.filter(g => g.phase === "won").length;
  console.log(`bench:core — ${GAMES} games × ${SECONDS} game-s at ${Math.round(1 / DT)} steps/s: ${times.length} game steps, ${won} games won`);
  console.log(`build ${(build / GAMES).toFixed(1)} ms per game; ms per game step: median ${q(0.5).toFixed(3)}, p95 ${q(0.95).toFixed(3)}, max ${times.at(-1).toFixed(2)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
