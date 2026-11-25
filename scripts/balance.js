// SPEC-008 AC 12–13: the balance report. Node drives Chromium in sim mode (?sim=1: no drawing, no sound; the game is
// stepped in batches) and plays every level of every world with the autopilot, then writes
//   reports/balance.json — every run (with its coins events), the settings and the targets;
//   reports/balance.md   — per level, per world, the targets red/green.
// SPEC-009 adds the economy: two more passes (replays of a few levels; every 5th level with all upgrades maxed) and the
// pace targets of CFG.BALANCE.ECONOMY, in an "Economy" section (balance.json: economy, replayRuns, upgradeRuns); SPEC-026: + the pace
// at today's prices (levels per pack in the Park, levels per upgrade level), economy.pace.
// Settings and targets live in CFG.BALANCE (index.html). Not part of `npm test`: `npm run balance` (~30 s).
// tests/balance.spec.js requires runLevel() for the CI sample, and the page is opened with the tests' openSim(), so the
// report and the tests play a level the same way. SPEC-011 AC 8b: over http, from its own server (scripts/serve.js startServer).
/* global window */   // runLevel() runs in the page (page.evaluate)
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "reports");

// Runs IN THE PAGE (page.evaluate): one level, 1 player + 4 bots, the autopilot in `style`, seeded. `progress` is a save
// to start from (SPEC-009: e.g. maxed upgrades); without it — fresh progress (empty inventory: nothing bought).
// Returns plain data only.
function runLevel({ world, n, style, seed, progress = null }) {
  const b = window.__bb, B = b.CFG.BALANCE;
  b.setProgress(progress);
  b.autopilot(true, style); b.seedRandom(seed);
  b.world = world; b.level = n; b.startGame(1);
  const res = b.simRun(B.TIME_LIMIT, B.SIM_DT);
  const ev = b.events, lr = b.lastReward;
  const count = (type, f = () => true) => ev.filter(e => e.type === type && f(e)).length;
  const coins = ev.filter(e => e.type === "coins").map(({ t, reason, amount }) => ({ t, reason, amount }));
  let maxGap = 0, last = 0;                             // the longest stretch of game time without any event (stuck?)
  for (const e of ev) { maxGap = Math.max(maxGap, e.t - last); last = e.t; }
  maxGap = Math.max(maxGap, res.time - last);
  const out = {
    world, n, type: b.levelType(world, n), style, seed, win: res.win, ended: res.ended, time: res.time,
    target: b.fastTarget(world, n),                     // SPEC-016: by the world's difficulty index, as the game's third star
    hugs: count("hug"), playerHugs: count("hug", e => e.kind === "player"), pushes: count("push"), falls: count("down"), playerFalls: count("down", e => e.kind === "player"),
    rescues: count("rescued"), rests: count("rest"), kits: count("kit"), kisses: count("kiss"), bonusStars: count("star"),
    items: count("item"), slips: count("slip"), thrownOut: count("thrownOut"),
    stars: res.win && lr ? lr.stars : 0, coins: coins.reduce((s, c) => s + c.amount, 0), parts: res.win && lr ? lr.parts : [],
    coinsEvents: coins, events: ev.length, logFull: ev.length >= b.CFG.EVENT_LOG_MAX, maxGap
  };
  b.autopilot(false); b.seedRandom(); b.mode = "home";
  return out;
}

// A fixed seed per (world, level, k): the same report on every machine. ws = the world's WORLD_SEED (SPEC-016: keyed by
// the name, so Park/School/Beach/Winter keep the seeds they had as places 0–3 in the list)
const seedOf = (ws, n, k) => 100003 * ws + 1009 * n + 7 * k + 1;

// ---------- statistics ----------
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const ranks = a => {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
};
function spearman(x, y) {
  const rx = ranks(x), ry = ranks(y), mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

// A run's time for the statistics: its win time; a run that did not win counts as the time limit
const runTime = (r, limit) => (r.win ? r.time : limit);

// Per-level and per-world numbers and the AC 13 targets (each { name, value, want, ok, detail })
function analyse(runs, B, worlds, perWorld) {
  const limit = B.TIME_LIMIT, careful = runs.filter(r => r.style === "careful"), reckless = runs.filter(r => r.style === "reckless");
  const levels = [];
  for (const w of worlds) for (let n = 1; n <= perWorld; n++) {
    const rs = careful.filter(r => r.world === w && r.n === n);
    if (!rs.length) continue;
    const parts = {};
    for (const r of rs) for (const p of r.parts) parts[p.reason] = (parts[p.reason] || 0) + p.amount / rs.length;
    const falls = rs.reduce((s, r) => s + r.falls, 0), rescues = rs.reduce((s, r) => s + r.rescues, 0);
    levels.push({
      world: w, n, type: rs[0].type, target: rs[0].target, runs: rs.length, wins: rs.filter(r => r.win).length,
      time: median(rs.map(r => runTime(r, limit))), winTimes: rs.filter(r => r.win).map(r => r.time),
      hugs: mean(rs.map(r => r.hugs)), playerHugs: mean(rs.map(r => r.playerHugs)), pushes: mean(rs.map(r => r.pushes)),
      falls: mean(rs.map(r => r.falls)), rescueRate: falls ? rescues / falls : null, rests: median(rs.map(r => r.rests)),
      stars: mean(rs.map(r => r.stars)), coins: mean(rs.map(r => r.coins)), parts, bonusStars: mean(rs.map(r => r.bonusStars))
    });
  }
  const of = (w, a, z) => levels.filter(l => l.world === w && l.n >= a && l.n <= z);
  const blockTime = (w, a, z) => median(careful.filter(r => r.world === w && r.n >= a && r.n <= z).map(r => runTime(r, limit)));
  const targets = [];
  const add = (name, value, want, ok, detail = "") => targets.push({ name, value, want, ok, detail });
  // 1. careful wins every level in ≥ WIN_SEEDS of SEEDS
  const lost = levels.filter(l => l.wins < B.WIN_SEEDS);
  add(`careful wins every level in ≥ ${B.WIN_SEEDS} of ${B.SEEDS} seeds within ${limit} s`, `${levels.length - lost.length}/${levels.length} levels`,
    `${levels.length}/${levels.length}`, lost.length === 0, lost.map(l => `${l.world} ${l.n} (${l.wins}/${l.runs})`).join(", "));
  // 2. per world: the trend of the median time goes up, and the maze block is the slowest block
  for (const w of worlds) {
    // SPEC-029: a world may have its own target (TREND_RHO_WORLD)
    const ls = of(w, 1, perWorld), rho = spearman(ls.map(l => l.n), ls.map(l => l.time)), want = (B.TREND_RHO_WORLD || {})[w] ?? B.TREND_RHO;
    add(`${w}: median time grows with the level (Spearman ρ)`, rho.toFixed(2), `≥ ${want}`, rho >= want);
  }
  for (const w of worlds) {
    const blocks = {};
    for (const l of of(w, 1, perWorld)) (blocks[l.type] = blocks[l.type] || []).push(...careful.filter(r => r.world === w && r.n === l.n).map(r => runTime(r, limit)));
    const med = Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, median(v)]));
    const maze = blockTime(w, B.MAZE[0], B.MAZE[1]), slowest = Object.entries(med).sort((a, b) => b[1] - a[1])[0];
    add(`${w}: the maze block (${B.MAZE[0]}–${B.MAZE[1]}) is the slowest block`, `maze ${fmt(maze)} s`, `slowest (now: ${slowest[0]} ${fmt(slowest[1])} s)`,
      maze >= Math.max(...Object.values(med)), Object.entries(med).map(([k, v]) => `${k} ${fmt(v)}`).join(", "));
  }
  // 3. Park early levels: 3 stars reachable (median time ≤ the fast-star time)
  const early = of(worlds[0], B.EARLY[0], B.EARLY[1]), slowEarly = early.filter(l => l.time > l.target);
  add(`${worlds[0]} ${B.EARLY[0]}–${B.EARLY[1]}: median time ≤ the level's fast-star time`, early.map(l => `${l.n}: ${fmt(l.time)}/${l.target}`).join(", "),
    "each ≤ target", slowEarly.length === 0, slowEarly.map(l => `${worlds[0]} ${l.n}`).join(", "));
  // 4. the last world's maze is much slower than the first world's start
  const parkEarly = blockTime(worlds[0], B.EARLY[0], B.EARLY[1]), lateMaze = blockTime(worlds.at(-1), B.MAZE[0], B.MAZE[1]);
  add(`${worlds.at(-1)} ${B.MAZE[0]}–${B.MAZE[1]} median ≥ ${B.LATE_VS_EARLY} × ${worlds[0]} ${B.EARLY[0]}–${B.EARLY[1]}`,
    `${fmt(lateMaze)} s vs ${fmt(parkEarly)} s (× ${(lateMaze / parkEarly).toFixed(2)})`, `≥ × ${B.LATE_VS_EARLY}`, lateMaze >= B.LATE_VS_EARLY * parkEarly);
  // 5. rescue rate and rests
  const falls = careful.reduce((s, r) => s + r.falls, 0), rescues = careful.reduce((s, r) => s + r.rescues, 0), rate = falls ? rescues / falls : 0;
  add("rescue rate (rescued / falls, all Little Ones)", `${pct(rate)} (${rescues}/${falls})`, `${pct(B.RESCUE_RATE[0])}–${pct(B.RESCUE_RATE[1])}`,
    rate >= B.RESCUE_RATE[0] && rate <= B.RESCUE_RATE[1], worlds.map(w => { const rs = careful.filter(r => r.world === w), f = rs.reduce((s, r) => s + r.falls, 0); return `${w} ${pct(f ? rs.reduce((s, r) => s + r.rescues, 0) / f : 0)}`; }).join(", "));
  const restful = levels.filter(l => l.rests > B.RESTS_MAX);
  add(`median rests per level ≤ ${B.RESTS_MAX}`, `${levels.length - restful.length}/${levels.length} levels`, "every level", restful.length === 0,
    restful.map(l => `${l.world} ${l.n} (${l.rests})`).join(", "));
  // 6. sneaking must pay: reckless wins less often or slower than careful on the same levels
  const keys = new Set(reckless.map(r => `${r.world}:${r.n}`)), same = careful.filter(r => keys.has(`${r.world}:${r.n}`));
  const rw = reckless.filter(r => r.win).length / (reckless.length || 1), cw = same.filter(r => r.win).length / (same.length || 1);
  const rt = median(reckless.map(r => runTime(r, limit))), ct = median(same.map(r => runTime(r, limit)));
  add(`reckless wins less often or slower than careful (every ${B.RECKLESS_EVERY}th level)`,
    `reckless ${pct(rw)} wins, median ${fmt(rt)} s; careful ${pct(cw)}, ${fmt(ct)} s`, "reckless fewer wins or slower", rw < cw || rt > ct,
    `player falls per run: reckless ${fmt(mean(reckless.map(r => r.playerFalls)), 1)}, careful ${fmt(mean(same.map(r => r.playerFalls)), 1)}; ` +
    `all falls: reckless ${fmt(mean(reckless.map(r => r.falls)), 1)}, careful ${fmt(mean(same.map(r => r.falls)), 1)}`);
  // 7. the measurements are whole: no run filled its event log (its counts would be short)
  const full = runs.filter(r => r.logFull);
  add("no run's event log is full (CFG.EVENT_LOG_MAX)", `${full.length} of ${runs.length} runs`, "0", full.length === 0,
    full.map(r => `${r.world} ${r.n} ${r.style}`).join(", "));
  return { levels, targets };
}
// ---------- SPEC-009 AC 7–8: the economy ----------
// The extra passes, built from the first pass: a replay of each E.REPLAY level (seed 0) with that level already won at the
// stars its seed-0 run got; every E.UPG_EVERY-th level and the E.UPG_EXTRA levels (seed 0) with every upgrade maxed.
function economyPlan(runs, B, worlds, perWorld, upgradeKeys, seeds) {
  const E = B.ECONOMY, replay = [], upgrades = [];
  for (const [w, a, z] of E.REPLAY) for (let n = a; n <= z; n++) {
    const seed = seedOf(seeds[w], n, 0), first = runs.find(r => r.style === "careful" && r.world === w && r.n === n && r.seed === seed);
    if (!first || !first.win) continue;                // a level its first run did not win has nothing to replay
    replay.push({ world: w, n, style: "careful", seed, progress: { worlds: { [w]: { unlocked: Math.min(perWorld, n + 1), stars: { [n]: first.stars }, won: { [n]: true } } } } });
  }
  const maxed = Object.fromEntries(upgradeKeys), [xw, xa, xz] = E.UPG_EXTRA;
  for (const w of worlds) for (let n = 1; n <= perWorld; n++) {
    if (n % E.UPG_EVERY !== 0 && !(w === xw && n >= xa && n <= xz)) continue;
    upgrades.push({ world: w, n, style: "careful", seed: seedOf(seeds[w], n, 0), progress: { upgrades: maxed } });
  }
  return { replay, upgrades };
}
// Income per level (the median of its careful runs' coins) and the pace targets; prices = { cheapest, mega, top, upgrades }
function analyseEconomy(runs, replayRuns, upgradeRuns, B, worlds, perWorld, prices) {
  const E = B.ECONOMY, limit = B.TIME_LIMIT, careful = runs.filter(r => r.style === "careful"), c = prices.cheapest;
  const sum = a => a.reduce((x, y) => x + y, 0);
  const income = (w, n) => median(careful.filter(r => r.world === w && r.n === n).map(r => r.coins));
  const perLevel = Object.fromEntries(worlds.map(w => [w, Array.from({ length: perWorld }, (_, i) => income(w, i + 1))]));
  const streak = w => { let m = Infinity; for (let i = 0; i + E.STREAK <= perWorld; i++) m = Math.min(m, sum(perLevel[w].slice(i, i + E.STREAK))); return m; };
  const worldRows = worlds.map(w => ({ world: w, total: sum(perLevel[w]), median: median(perLevel[w]), streak: streak(w), perLevel: perLevel[w] }));
  const targets = [], add = (name, value, want, ok, detail = "") => targets.push({ name, value, want, ok, detail });
  // 1. Park: a cheap pack almost every level and savings for the rest
  // SPEC-026: a fractional pack count (1.6 × 20) — round away float noise, so 32 ≥ 32.000000000000004 holds
  const coins = v => Number(v.toFixed(6)), park = worldRows[0], lo = coins(E.PARK_PACKS[0] * c), hi = coins(E.PARK_PACKS[1] * c);
  add(`${worlds[0]}: median first-win income per level (${E.PARK_PACKS[0]}–${E.PARK_PACKS[1]} × the cheapest pack, ${c})`, fmt(park.median, 1), `${lo}–${hi}`,
    park.median >= lo && park.median <= hi, park.perLevel.map((v, i) => `${i + 1}: ${fmt(v)}`).join(", "));
  // 2. any STREAK first wins in a row buy mega mittens + STREAK_PACKS cheap packs, in every world
  const sMin = prices.mega + E.STREAK_PACKS * c;
  add(`any ${E.STREAK} first wins in a row ≥ mega mittens + ${E.STREAK_PACKS} cheapest packs, every world`,
    worldRows.map(r => `${r.world} ${fmt(r.streak)}`).join(", "), `≥ ${sMin}`, worldRows.every(r => r.streak >= sMin));
  // 3. a world's first wins buy the most special outfit item + WORLD_PACKS cheap packs
  const wMin = prices.top + E.WORLD_PACKS * c;
  add(`each world's first-win income ≥ a ${prices.top}-coin item + ${E.WORLD_PACKS} cheapest packs`,
    worldRows.map(r => `${r.world} ${fmt(r.total)}`).join(", "), `≥ ${wMin}`, worldRows.every(r => r.total >= wMin));
  // 4. all upgrades take at most UPGRADE_SHARE of the first UPGRADE_WORLDS worlds' income
  const early = sum(worldRows.slice(0, E.UPGRADE_WORLDS).map(r => r.total));
  add(`all upgrades (${prices.upgrades}) ≤ ${pct(E.UPGRADE_SHARE)} of the first ${E.UPGRADE_WORLDS * perWorld} levels' income`,
    `${prices.upgrades} vs ${fmt(early)} (${pct(prices.upgrades / early)})`, `≤ ${pct(E.UPGRADE_SHARE)}`, prices.upgrades <= coins(E.UPGRADE_SHARE * early));
  // 5. replaying pays less per game-minute than playing on (the same levels and seeds)
  const pairs = replayRuns.map(r => ({ replay: r, first: careful.find(q => q.world === r.world && q.n === r.n && q.seed === r.seed) })).filter(x => x.first);
  const perMin = rs => { const t = sum(rs.map(r => runTime(r, limit))); return t ? sum(rs.map(r => r.coins)) / (t / 60) : 0; };
  const rMin = perMin(pairs.map(x => x.replay)), fMin = perMin(pairs.map(x => x.first));
  add(`replay income per game-minute ≤ ${pct(E.REPLAY_SHARE)} of first-win income (${E.REPLAY.map(([w, a, z]) => `${w} ${a}–${z}`).join(", ")}, 1 seed)`,
    `${fmt(rMin, 1)} vs ${fmt(fMin, 1)} coins/min (${pct(fMin ? rMin / fMin : 0)})`, `≤ ${pct(E.REPLAY_SHARE)}`, rMin <= E.REPLAY_SHARE * fMin);
  const notLess = pairs.filter(x => x.replay.win && x.first.win && x.replay.coins >= x.first.coins);
  add("a replay pays less than the first win (kids' rule), every replay level", `${pairs.length - notLess.length}/${pairs.length}`, `${pairs.length}/${pairs.length}`,
    notLess.length === 0, notLess.map(x => `${x.replay.world} ${x.replay.n}: ${x.replay.coins} ≥ ${x.first.coins}`).join(", "));
  // 6. AC 8: with every upgrade maxed the last levels stay a challenge
  const [xw, xa, xz] = E.UPG_EXTRA;
  const upPairs = upgradeRuns.map(r => ({ up: r, base: careful.find(q => q.world === r.world && q.n === r.n && q.seed === r.seed) })).filter(x => x.base);
  const extra = upPairs.filter(x => x.up.world === xw && x.up.n >= xa && x.up.n <= xz);
  const upT = median(extra.map(x => runTime(x.up, limit))), baseT = median(extra.map(x => runTime(x.base, limit)));
  add(`${xw} ${xa}–${xz} with every upgrade maxed: median time ≥ ${pct(E.UPG_TIME)} of the time without (1 seed)`,
    `${fmt(upT)} s vs ${fmt(baseT)} s (${pct(baseT ? upT / baseT : 0)})`, `≥ ${pct(E.UPG_TIME)}`, extra.length > 0 && upT >= E.UPG_TIME * baseT,
    `wins with upgrades ${upgradeRuns.filter(r => r.win).length}/${upgradeRuns.length}`);
  // SPEC-026: the pace at today's prices (no target): how many levels' median first-win income one pack costs in the Park,
  // and one upgrade level in the first UPGRADE_WORLDS worlds (where the upgrades are bought)
  const earlyMedian = median(worldRows.slice(0, E.UPGRADE_WORLDS).flatMap(r => r.perLevel));
  const per = (price, inc) => (inc ? price / inc : null);
  const pace = {
    parkMedian: park.median, earlyMedian,
    packs: (prices.packs || []).map(q => ({ k: q.k, price: q.price, levels: per(q.price, park.median) })),
    upgrades: (prices.upgradeLevels || []).map((price, i) => ({ level: i + 1, price, levels: per(price, earlyMedian) })),
    allUpgrades: { price: prices.upgrades, levels: per(prices.upgrades, earlyMedian) }
  };
  return {
    prices, targets, worlds: worldRows, pace,
    replay: pairs.map(x => ({ world: x.replay.world, n: x.replay.n, firstCoins: x.first.coins, replayCoins: x.replay.coins,
      firstTime: runTime(x.first, limit), replayTime: runTime(x.replay, limit), parts: x.replay.parts })),
    upgrades: upPairs.map(x => ({ world: x.up.world, n: x.up.n, win: x.up.win, time: runTime(x.up, limit), baseWin: x.base.win, baseTime: runTime(x.base, limit) }))
  };
}
const fmt = (v, d = 0) => (v === null || v === undefined ? "—" : Number(v).toFixed(d));
const pct = v => `${Math.round(v * 100)} %`;
const TREND = " .:-=+*#%@";
const trend = (ls, max) => ls.map(l => TREND[Math.min(TREND.length - 1, Math.round((l.time / max) * (TREND.length - 1)))]).join("");

function markdown(rep) {
  const { settings: B, levels, targets, worlds, runs } = rep, L = [];
  const greens = targets.filter(t => t.ok).length, maxT = Math.max(...levels.map(l => l.time));
  L.push("# Balance report", "",
    `Generated by \`npm run balance\` (\`scripts/balance.js\`) on ${rep.generated} in ${rep.durationSec} s. ` +
    `Every level of every world, ${B.SEEDS} seeds × the \`careful\` autopilot, 1 player + 4 bots, from fresh progress (nothing bought), ` +
    `game-time limit ${B.TIME_LIMIT} s, sim step ${fmt(B.SIM_DT, 4)} s; \`reckless\`: 1 seed, every ${B.RECKLESS_EVERY}th level. ` +
    `Times are game seconds: the median of a level's runs, a run that did not win counts as ${B.TIME_LIMIT} s. ` +
    `Targets and settings: \`CFG.BALANCE\` in \`index.html\`; raw runs: \`reports/balance.json\`.`, "",
    `## Targets — ${greens} green, ${targets.length - greens} red`, "", "| Target | Value | Want | Result | Detail |", "|---|---|---|---|---|");
  for (const t of targets) L.push(`| ${t.name} | ${t.value} | ${t.want} | ${t.ok ? "🟢 green" : "🔴 red"} | ${t.detail} |`);
  L.push("", "## Worlds", "", `Trend: median time per level 1→${rep.perWorld}, \`${TREND}\` from fast to ${fmt(maxT)} s.`, "",
    `| World | Wins | Median time | Hugs (player) | Pushes | Falls | Rescue rate | Rests | Stars | Coins | Bonus stars | Trend 1→${rep.perWorld} |`, "|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const w of worlds) {
    const ls = levels.filter(l => l.world === w), rs = runs.filter(r => r.world === w && r.style === "careful");
    const f = rs.reduce((s, r) => s + r.falls, 0), rr = f ? rs.reduce((s, r) => s + r.rescues, 0) / f : 0;
    L.push(`| ${w} | ${rs.filter(r => r.win).length}/${rs.length} | ${fmt(median(ls.map(l => l.time)))} | ${fmt(mean(ls.map(l => l.hugs)), 1)} (${fmt(mean(ls.map(l => l.playerHugs)), 1)}) | ` +
      `${fmt(mean(ls.map(l => l.pushes)), 1)} | ${fmt(mean(ls.map(l => l.falls)), 1)} | ${pct(rr)} | ${fmt(mean(ls.map(l => l.rests)), 1)} | ${fmt(mean(ls.map(l => l.stars)), 1)} | ` +
      `${fmt(mean(ls.map(l => l.coins)), 1)} | ${fmt(mean(ls.map(l => l.bonusStars)), 1)} | \`${trend(ls, maxT)}\` |`);
  }
  L.push("", "## Levels", "", "Per level, means over its runs (rests: median). Coins = all coins earned in the level (reward + bonus stars); parts = the mean reward parts of the wins.");
  for (const w of worlds) {
    L.push("", `### ${w}`, "", "| Level | Type | Wins | Median time | Fast-star time | Hugs (player) | Pushes | Falls | Rescue rate | Rests | Stars | Coins | Parts | Bonus stars |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const l of levels.filter(q => q.world === w)) {
      const parts = Object.entries(l.parts).map(([k, v]) => `${k} ${fmt(v, 1)}`).join(" · ");
      L.push(`| ${l.n} | ${l.type} | ${l.wins}/${l.runs} | ${fmt(l.time)} | ${l.target} | ${fmt(l.hugs, 1)} (${fmt(l.playerHugs, 1)}) | ${fmt(l.pushes, 1)} | ${fmt(l.falls, 1)} | ` +
        `${l.rescueRate === null ? "—" : pct(l.rescueRate)} | ${fmt(l.rests, 1)} | ${fmt(l.stars, 1)} | ${fmt(l.coins, 1)} | ${parts} | ${fmt(l.bonusStars, 1)} |`);
    }
  }
  const ec = rep.economy;
  if (ec) {
    const eg = ec.targets.filter(t => t.ok).length;
    L.push("", `## Economy — ${eg} green, ${ec.targets.length - eg} red`, "",
      "SPEC-009 pace targets (`CFG.BALANCE.ECONOMY`). First playthrough = the careful runs above (fresh progress: every win is a first win). " +
      "A run's income = the sum of its coins events (reward lines + bonus stars); a level's income = the median over its seeds. " +
      "A run that did not win earns only its bonus-star coins (the sim never leaves a level, so no hugs line is paid) and counts the time limit; " +
      "replays are played only for levels whose seed-0 run won. " +
      `Prices: cheapest pack ${ec.prices.cheapest}, mega mittens ${ec.prices.mega}, top wardrobe tier ${ec.prices.top}, all upgrades ${ec.prices.upgrades}.` +
        (ec.prices.wardrobe ? ` Wardrobe (SPEC-027): ${ec.prices.wardrobe.items} items, ${ec.prices.wardrobe.paid} paid, all paid items together ${ec.prices.wardrobe.total} coins.` : ""), "",
      "| Target | Value | Want | Result | Detail |", "|---|---|---|---|---|");
    for (const t of ec.targets) L.push(`| ${t.name} | ${t.value} | ${t.want} | ${t.ok ? "🟢 green" : "🔴 red"} | ${t.detail} |`);
    if (ec.pace) {
      const P = ec.pace;
      L.push("", "### Pace at today's prices (SPEC-026)", "",
        `Levels of median first-win income one purchase costs. Packs: in ${worlds[0]} (median ${fmt(P.parkMedian, 1)} coins per level). ` +
        `Upgrades: in the first ${B.ECONOMY.UPGRADE_WORLDS} worlds (${worlds.slice(0, B.ECONOMY.UPGRADE_WORLDS).join(", ")}; median ${fmt(P.earlyMedian, 1)} coins per level).`, "",
        "| Purchase | Price | Levels per purchase |", "|---|---|---|");
      for (const q of P.packs) L.push(`| pack: ${q.k} (${worlds[0]}) | ${q.price} | ${fmt(q.levels, 1)} |`);
      for (const q of P.upgrades) L.push(`| upgrade level ${q.level} | ${q.price} | ${fmt(q.levels, 1)} |`);
      L.push(`| every upgrade to the top | ${P.allUpgrades.price} | ${fmt(P.allUpgrades.levels, 1)} |`);
    }
    L.push("", "### First-win income per world", "", `| World | Total | Median per level | Lowest ${B.ECONOMY.STREAK} in a row | Per level 1→${rep.perWorld} |`, "|---|---|---|---|---|");
    for (const r of ec.worlds) L.push(`| ${r.world} | ${fmt(r.total)} | ${fmt(r.median, 1)} | ${fmt(r.streak)} | ${r.perLevel.map(v => fmt(v)).join(" ")} |`);
    L.push("", "### Replays (1 seed, the level already won at the first run's stars)", "", "| Level | First win: coins, time | Replay: coins, time | Replay parts |", "|---|---|---|---|");
    for (const r of ec.replay) L.push(`| ${r.world} ${r.n} | ${r.firstCoins}, ${fmt(r.firstTime)} s | ${r.replayCoins}, ${fmt(r.replayTime)} s | ${r.parts.map(q => `${q.reason} ${q.amount}`).join(" · ")} |`);
    L.push("", "### Every upgrade maxed (1 seed)", "", "| Level | Without upgrades: win, time | With all upgrades: win, time |", "|---|---|---|");
    for (const r of ec.upgrades) L.push(`| ${r.world} ${r.n} | ${r.baseWin ? "won" : "—"}, ${fmt(r.baseTime)} s | ${r.win ? "won" : "—"}, ${fmt(r.time)} s |`);
  }
  L.push("", "## Reckless vs careful", "", "| Level | Reckless: win, time, falls (player) | Careful (same seed): win, time, falls (player) |", "|---|---|---|");
  for (const r of runs.filter(q => q.style === "reckless")) {
    const c = runs.find(q => q.style === "careful" && q.world === r.world && q.n === r.n && q.seed === r.seed);
    const row = x => (x ? `${x.win ? "won" : "—"}, ${fmt(runTime(x, B.TIME_LIMIT))} s, ${x.falls} (${x.playerFalls})` : "—");
    L.push(`| ${r.world} ${r.n} | ${row(r)} | ${row(c)} |`);
  }
  return L.join("\n") + "\n";
}

async function main() {
  const t0 = Date.now();
  const { chromium } = require("@playwright/test");
  const { openSim } = require("../tests/helpers.js");
  const { startServer } = require("./serve.js");
  // SPEC-023: below-normal priority (PW_NICE=0: off), inherited by the browser; sim mode draws nothing, so SwiftShader stays
  const { lowerPriority, SWIFTSHADER_ARGS, niceArgs } = require("../tests/test-env.js");
  lowerPriority();
  const site = await startServer();                     // the repo root on a free port
  const browser = await chromium.launch({
    args: [...SWIFTSHADER_ARGS, ...niceArgs()],
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  try {
    const page = await browser.newPage({ serviceWorkers: "block" });   // like the tests: no service worker
    const errors = await openSim(page, { base: site.base });   // like the tests: over http, three.js from node_modules, strict rng guard
    const { B, worlds, seeds, perWorld, prices, upgradeKeys } = await page.evaluate(() => {
      const b = window.__bb, U = b.UPGRADES;
      return { B: JSON.parse(JSON.stringify(b.CFG.BALANCE)), worlds: b.WORLDS, seeds: { ...b.WORLD_SEED }, perWorld: b.levelsPerWorld(),
        // SPEC-009: the prices the pace targets are measured in, and the top level of each upgrade
        prices: { cheapest: Math.min(...b.shopCards().map(c => c.price)), mega: b.GLOVES.mega.price, top: Math.max(...b.WARDROBE_TIERS),
          upgrades: Object.values(U).reduce((s, u) => s + u.prices.reduce((x, y) => x + y, 0), 0),
          // SPEC-026: the pace lines — every shop pack, and the price of each upgrade level (the first upgrade's list)
          packs: b.shopCards().map(c => ({ k: c.k, price: c.price })), upgradeLevels: [...Object.values(U)[0].prices],
          // SPEC-027: the whole wardrobe (hats, jackets, pants, Big One looks): how many items, how many cost coins, all of them together
          wardrobe: (() => { const W = b.wardrobe(), all = ["hat", "jacket", "pants", "big"].flatMap(k => W[k]), paid = all.filter(q => q.price > 0);
            return { items: all.length, paid: paid.length, total: paid.reduce((a, q) => a + q.price, 0) }; })() },
        upgradeKeys: Object.entries(U).map(([k, u]) => [k, u.prices.length]) };
    });
    const plan = [];
    worlds.forEach(w => {
      for (let n = 1; n <= perWorld; n++) {
        for (let k = 0; k < B.SEEDS; k++) plan.push({ world: w, n, style: "careful", seed: seedOf(seeds[w], n, k) });
        if (n % B.RECKLESS_EVERY === 0) plan.push({ world: w, n, style: "reckless", seed: seedOf(seeds[w], n, 0) });
      }
    });
    const runs = [];
    for (const [i, job] of plan.entries()) {
      runs.push(await page.evaluate(runLevel, job));
      if ((i + 1) % 40 === 0) process.stdout.write(`  ${i + 1}/${plan.length} runs, ${Math.round((Date.now() - t0) / 1000)} s\n`);
    }
    // SPEC-009: the replay pass and the maxed-upgrades pass
    const extra = economyPlan(runs, B, worlds, perWorld, upgradeKeys, seeds), replayRuns = [], upgradeRuns = [];
    for (const job of extra.replay) replayRuns.push({ ...(await page.evaluate(runLevel, job)), pass: "replay" });
    for (const job of extra.upgrades) upgradeRuns.push({ ...(await page.evaluate(runLevel, job)), pass: "upgrades" });
    if (errors.length) throw new Error("page errors:\n" + errors.join("\n"));
    const { levels, targets } = analyse(runs, B, worlds, perWorld);
    const economy = analyseEconomy(runs, replayRuns, upgradeRuns, B, worlds, perWorld, prices);
    const rep = { generated: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", durationSec: Math.round((Date.now() - t0) / 1000),
      settings: B, worlds, perWorld, targets, economy, levels, runs, replayRuns, upgradeRuns };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    // one run per line: small diffs when a spec changes a number
    const { runs: all, replayRuns: rr, upgradeRuns: ur, ...head } = rep;
    const lines = (name, list) => ` "${name}": [\n` + list.map(r => JSON.stringify(r)).join(",\n") + "\n ]";
    const json = JSON.stringify(head, null, 1).replace(/\n}$/, ",\n") + [lines("runs", all), lines("replayRuns", rr), lines("upgradeRuns", ur)].join(",\n") + "\n}\n";
    fs.writeFileSync(path.join(OUT_DIR, "balance.json"), json);
    fs.writeFileSync(path.join(OUT_DIR, "balance.md"), markdown(rep));
    const red = targets.filter(t => !t.ok);
    console.log(`balance: ${runs.length} runs in ${rep.durationSec} s → reports/balance.md, reports/balance.json`);
    console.log(`targets: ${targets.length - red.length} green, ${red.length} red${red.length ? ":\n  - " + red.map(t => `${t.name}: ${t.value}`).join("\n  - ") : ""}`);
    const ered = economy.targets.filter(q => !q.ok);
    console.log(`economy: ${economy.targets.length - ered.length} green, ${ered.length} red${ered.length ? ":\n  - " + ered.map(q => `${q.name}: ${q.value}`).join("\n  - ") : ""}`);
  } finally { await browser.close(); await site.close(); }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { runLevel, analyse, analyseEconomy, economyPlan, spearman, median };
