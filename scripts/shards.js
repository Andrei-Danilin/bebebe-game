// SPEC-039 AC 1: the shard plan of the Tests workflow. Playwright's own `--shard x/y` splits by test COUNT (contiguous in file
// order), so one shard got the slow story / phone / menu tests (20 min) while another got the quick ones (10 min). Here the tests
// are packed by their measured time instead: tests/shards/times.json (seconds per test, from CI) → tests/shards/plan.json (which
// file or tests go to which shard); a shard runs `npx playwright test --test-list <its list>` (node scripts/shards.js list <n>).
//   node scripts/shards.js                  make the plan from the times and the tests as they are now (npm run shards; npm run shards:check only checks)
//   node scripts/shards.js --check          the plan runs every test exactly once (a test file added or a test renamed → red)
//   node scripts/shards.js list <n>         the test list of shard n (the lines `--test-list` reads)
//   node scripts/shards.js --ran <merged.json>   a CI run's merged JSON report holds every test of the suite once (the `report` job)
//   node scripts/shards.js times <report.jsonl …>   fold the test times of unzipped blob reports of a CI run into times.json (tests no longer in the suite are dropped)
//                                           (the Tests workflow's blob-report-<n> artifacts: `gh run download <id>`, unzip each)
// How the plan packs: a file small enough stays whole (so its shared page starts once and a test added to it is covered without
// touching the plan); a file longer than a shard's half is cut into contiguous pieces (the tests of a piece are listed one by one);
// then the pieces and files are packed longest-first into the least loaded shard. Nothing is deleted or weakened: every test runs
// in exactly one shard (tests/tooling.spec.js and the `report` job of tests.yml check it).
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "tests", "shards");
const PLAN = path.join(DIR, "plan.json"), TIMES = path.join(DIR, "times.json");
const SHARDS = 10;
const SEP = " › ";            // Playwright's test list separator between the file and the titles
const NEW_TEST_SECONDS = 2;        // a test with no measured time yet

// every test of the suite in Playwright's own order: { key: "file › titles", file, titles }
function listTests() {
  const out = execFileSync(process.execPath, [path.join(ROOT, "node_modules", "@playwright", "test", "cli.js"), "test", "--list", "--reporter=json"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
  const tests = [];
  const walk = (suite, file, titles) => {
    for (const spec of suite.specs || []) tests.push({ file, titles: [...titles, spec.title] });
    for (const s of suite.suites || []) walk(s, file, [...titles, s.title]);
  };
  for (const s of JSON.parse(out).suites) walk(s, s.file, []);
  for (const t of tests) {
    if ([t.file, ...t.titles].some(x => x.includes(SEP.trim()))) throw new Error(`shards: "${t.titles.join(" / ")}" contains the list separator`);
    t.key = [t.file, ...t.titles].join(SEP);
  }
  return tests;
}
const readJson = f => JSON.parse(fs.readFileSync(f, "utf8"));
const loadTimes = () => (fs.existsSync(TIMES) ? readJson(TIMES) : {});

// the plan: { shards, entries: [ [ [file] | [file, ...titles], … ] per shard ] } — an entry names a whole file or one test
function makePlan(tests, times, n = SHARDS) {
  const known = Object.values(times).filter(x => x > 0).sort((a, b) => a - b);
  const fallback = known.length ? Math.max(NEW_TEST_SECONDS, known[Math.floor(known.length / 2)]) : NEW_TEST_SECONDS;
  const weight = t => times[t.key] ?? fallback;
  const byFile = new Map();
  for (const t of tests) byFile.set(t.file, [...(byFile.get(t.file) || []), t]);
  const total = tests.reduce((s, t) => s + weight(t), 0), target = total / n;
  const items = [];                                       // { w, entries }
  for (const [file, list] of byFile) {
    const w = list.reduce((s, t) => s + weight(t), 0);
    if (w <= target * 0.6) { items.push({ w, entries: [[file]] }); continue; }
    const pieces = Math.ceil(w / (target * 0.5)), per = w / pieces;
    let cur = { w: 0, entries: [] };
    for (const t of list) {
      cur.entries.push([file, ...t.titles]); cur.w += weight(t);
      if (cur.w >= per && items.filter(x => x.file === file).length + 1 < pieces) { items.push({ ...cur, file }); cur = { w: 0, entries: [] }; }
    }
    if (cur.entries.length) items.push({ ...cur, file });
  }
  items.sort((a, b) => b.w - a.w || String(a.entries[0]).localeCompare(String(b.entries[0])));
  const bins = Array.from({ length: n }, () => ({ w: 0, entries: [] }));
  for (const it of items) { const b = bins.reduce((m, x) => (x.w < m.w ? x : m)); b.w += it.w; b.entries.push(...it.entries); }
  for (const b of bins) b.entries.sort((x, y) => x.join(SEP).localeCompare(y.join(SEP)));
  return { plan: { shards: n, entries: bins.map(b => b.entries) }, seconds: bins.map(b => Math.round(b.w)) };
}

// Playwright's `--test-list` rule: the same file and the listed titles a prefix of the test's title path
const matches = (entry, t) => entry[0] === t.file && entry.length - 1 <= t.titles.length && entry.slice(1).every((x, i) => x === t.titles[i]);
function check(plan, tests) {
  const problems = [];
  const unused = new Set(plan.entries.flatMap((e, i) => e.map((x, j) => `${i}/${j}`)));
  for (const t of tests) {
    const hits = [];
    plan.entries.forEach((list, i) => list.forEach((e, j) => { if (matches(e, t)) { hits.push(i + 1); unused.delete(`${i}/${j}`); } }));
    if (hits.length === 0) problems.push(`not in any shard: ${t.key}`);
    else if (hits.length > 1) problems.push(`in shards ${hits.join(", ")}: ${t.key}`);
  }
  for (const k of unused) { const [i, j] = k.split("/").map(Number); problems.push(`shard ${i + 1} lists a test that does not exist: ${plan.entries[i][j].join(SEP)}`); }
  return problems;
}
// a merged JSON report (playwright merge-reports --reporter=json): each test of the suite has exactly one result, and nothing else ran
function ranOnce(report, tests) {
  const seen = new Map();
  const walk = (suite, file, titles) => {
    for (const spec of suite.specs || []) {
      const key = [file, ...titles, spec.title].join(SEP);
      seen.set(key, (seen.get(key) || 0) + spec.tests.reduce((n, t) => n + t.results.length, 0));
    }
    for (const s of suite.suites || []) walk(s, file, [...titles, s.title]);
  };
  for (const s of report.suites) walk(s, s.file, []);
  const problems = [];
  for (const t of tests) {
    const n = seen.get(t.key) || 0;
    if (n !== 1) problems.push(`${n === 0 ? "did not run" : "ran " + n + " times"}: ${t.key}`);
  }
  for (const k of seen.keys()) if (!tests.some(t => t.key === k)) problems.push(`ran but is not in the suite: ${k}`);
  return problems;
}
const listOf = (plan, n) => plan.entries[n - 1].map(e => e.join(SEP)).join("\n") + "\n";

// times.json: fold the durations of finished tests of unzipped blob reports (report.jsonl) in; the last measure wins
function foldTimes(files) {
  const times = loadTimes();
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)), names = {}, seconds = {};
    const walk = (s, file, titles) => {
      for (const e of s.entries || []) {
        if (e.testId) names[e.testId] = [file, ...titles, e.title].join(SEP);
        else walk(e, file, [...titles, e.title]);
      }
    };
    for (const e of lines) {
      if (e.method === "onProject") for (const s of e.params.project.suites) walk(s, s.title, []);
      if (e.method === "onTestEnd" && e.params.result.status !== "skipped") seconds[e.params.test.testId] = (seconds[e.params.test.testId] || 0) + e.params.result.duration / 1000;
    }
    for (const [id, s] of Object.entries(seconds)) if (names[id]) times[names[id]] = Math.round(s * 10) / 10;
  }
  return Object.fromEntries(Object.entries(times).sort(([a], [b]) => a.localeCompare(b)));
}
const dump = o => JSON.stringify(o, null, 1) + "\n";
// the plan: one line per entry (a readable diff when a test moves)
const dumpPlan = p => `{\n "shards": ${p.shards},\n "entries": [\n${p.entries.map(list => "  [\n" + list.map(e => "   " + JSON.stringify(e)).join(",\n") + "\n  ]").join(",\n")}\n ]\n}\n`;

module.exports = { SHARDS, SEP, PLAN, TIMES, listTests, makePlan, check, ranOnce, listOf, matches, loadTimes };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "list") {
    const plan = readJson(PLAN), n = Number(rest[0]);
    if (!Number.isInteger(n) || n < 1 || n > plan.shards) { console.error(`shards: list <1…${plan.shards}>`); process.exit(2); }
    process.stdout.write(listOf(plan, n));
  } else if (cmd === "times") {
    fs.mkdirSync(DIR, { recursive: true });
    const live = new Set(listTests().map(x => x.key)), t = Object.fromEntries(Object.entries(foldTimes(rest)).filter(([k]) => live.has(k)));
    fs.writeFileSync(TIMES, dump(t));
    console.log(`shards: ${Object.keys(t).length} test times written`);
  } else if (cmd === "--ran") {
    const problems = ranOnce(JSON.parse(fs.readFileSync(rest[0], "utf8")), listTests());
    if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
    console.log("shards: every test ran exactly once");
  } else if (cmd === "--check") {
    const problems = check(readJson(PLAN), listTests());
    if (problems.length) { console.error(problems.join("\n") + "\nshards: run npm run shards"); process.exit(1); }
    console.log("shards: every test is in exactly one shard");
  } else {
    fs.mkdirSync(DIR, { recursive: true });
    const tests = listTests(), { plan, seconds } = makePlan(tests, loadTimes());
    const problems = check(plan, tests);
    if (problems.length) throw new Error(problems.join("\n"));
    fs.writeFileSync(PLAN, dumpPlan(plan));
    console.log(`shards: ${tests.length} tests in ${plan.shards} shards; expected seconds per shard: ${seconds.join(" ")}`);
  }
}
