// SPEC-008 AC 11: writes the numbers section of docs/game-design.md from the code (Node, no browser).
// Reads the source of the objects in OBJECTS from index.html, evaluates each object literal on its own and writes one
// table row per top-level key — value and a one-line meaning taken from the source comment — between
// <!-- numbers:start --> and <!-- numbers:end -->.
//   npm run docs:numbers            rewrite the section
//   node scripts/docs-numbers.js --check   exit 1 if the section is out of date
// tests/invariants.spec.js requires this file (render, section, sectionKeys) and fails when the section is stale.
const fs = require("fs");
const path = require("path");

// The objects in the table. A later spec adds its own (SPEC-009: REWARD, UPGRADES, WARDROBE_TIERS).
const OBJECTS = ["CFG", "GLOVES", "KISSES", "RESCUE_KIT"];
const START = "<!-- numbers:start -->", END = "<!-- numbers:end -->";
const MEANING_MAX = 200;
const SMALL_OBJECT = 5;   // keys — an object this small may share one comment above it

const ROOT = path.resolve(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const DOC = path.join(ROOT, "docs", "game-design.md");

// Scans JS source from `from` (an opening { or [) and returns { end, keys }: the index after the matching bracket and the
// top-level keys as { name, at } (offsets) — for an array, its elements, named by index. Strings, template literals and
// comments are skipped; nested braces, brackets and parens only change the depth.
function scanObject(src, from) {
  const keys = [], isArray = src[from] === "[";
  let depth = 0, i = from, lastSig = "";
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { i = src.indexOf("\n", i); if (i < 0) i = src.length; continue; }
    if (c === "/" && d === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      i++; lastSig = c; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (depth === 1 && isArray && (lastSig === "[" || lastSig === ",") && c !== "]") keys.push({ name: String(keys.length), at: i });
    else if (depth === 1 && !isArray && (lastSig === "{" || lastSig === ",")) {
      const m = /^(get\s+)?([A-Za-z_$][\w$]*)\s*(\(\s*\)\s*\{|:)/.exec(src.slice(i, i + 80));
      if (m) keys.push({ name: m[2], at: i });
    }
    if ("{[(".includes(c)) depth++;
    else if ("}])".includes(c)) { depth--; if (depth === 0) return { end: i + 1, keys }; }
    lastSig = c; i++;
  }
  throw new Error("unbalanced object");
}

// The text of `[export] const NAME = { … }` (or `= [ … ]`) and its top-level keys (array: element indexes).
function readObject(src, name) {
  const m = new RegExp(String.raw`(?:^|\n)[ \t]*(?:export\s+)?const ${name}\s*=\s*([{[])`).exec(src);
  if (!m) throw new Error(`${name} not found in the source`);
  const open = m.index + m[0].length - 1, { end, keys } = scanObject(src, open);
  return { text: src.slice(open, end), offset: open, keys };
}

// The comment of a key: the // comment at the end of its line, or the comment-only lines right above it.
function meaningAt(src, at) {
  const ls = src.lastIndexOf("\n", at) + 1, le = src.indexOf("\n", at), line = src.slice(ls, le < 0 ? src.length : le);
  const trailing = commentOf(line);
  let text = trailing;
  if (!text) {
    const above = [];
    for (let e = ls - 1; e > 0;) {
      const s = src.lastIndexOf("\n", e - 1) + 1, l = src.slice(s, e).trim();
      if (!l.startsWith("//")) break;
      above.unshift(l.replace(/^\/\/\s?/, ""));
      e = s - 1;
    }
    text = above.join(" ");
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > MEANING_MAX ? text.slice(0, MEANING_MAX - 1).trimEnd() + "…" : text;
}
// The // comment of one line of code (not inside a string).
function commentOf(line) {
  for (let i = 0, q = ""; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = ""; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "/" && line[i + 1] === "/") return line.slice(i + 2).trim();
  }
  return "";
}

const fmtNum = v => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6))));
function fmtValue(v) {
  if (typeof v === "number") return fmtNum(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(fmtValue).join(", ")}]`;
  if (v && typeof v === "object") return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${fmtValue(x)}`).join(", ")} }`;
  return String(v);
}
// The value as written in the source (after the colon), for numbers given as an expression (Math.PI / 4, 1 / 30)
function sourceValue(objText, key) {
  const m = new RegExp(`(?:^|[\\s,{])${key}\\s*:\\s*([^,\\n]+?)\\s*(?:,|\\n|\\/\\/|$)`).exec(objText);
  return m ? m[1].trim() : "";
}
const cell = s => String(s).replace(/\|/g, "\\|");

const lf = s => s.replace(/\r\n/g, "\n");
function rows(src, objects = OBJECTS) {
  src = lf(src);
  const out = [];
  for (const name of objects) {
    const o = readObject(src, name), obj = new Function(`return (${o.text});`)();
    for (const { name: k, at } of o.keys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      let value;
      if (desc.get) value = `${fmtValue(obj[k])} (derived)`;
      else if (typeof desc.value === "function") value = "`" + desc.value.toString().replace(/\s+/g, " ") + "`";
      else {
        value = fmtValue(desc.value);
        const raw = typeof desc.value === "number" ? sourceValue(o.text, k) : "";
        if (raw && /[A-Za-z*/+]/.test(raw) && raw !== value) value += ` (${raw})`;
      }
      // no comment of its own: in a small object (the shop ones) the object's comment says it; CFG keys need their own
      const meaning = meaningAt(src, at) || (o.keys.length <= SMALL_OBJECT ? meaningAt(src, o.offset) : "");
      out.push(`| ${name} | \`${k}\` | ${cell(value)} | ${cell(meaning)} |`);
    }
  }
  return out;
}

// The section between the markers (including the line breaks next to them), generated from the index.html source.
function render(src) {
  return ["",
    "Генерируется из `index.html` командой `npm run docs:numbers` — руками не править (тест `tests/invariants.spec.js` следит). " +
    "Объекты: " + OBJECTS.map(o => "`" + o + "`").join(", ") + ". «derived» — вычисляется из других чисел; функция показана формулой; " +
    "вложенный объект — одной строкой.",
    "",
    "| Объект | Ключ | Значение | Что это (комментарий в коде) |",
    "|---|---|---|---|",
    ...rows(src),
    ""].join("\n");
}
// The current section of the doc text, or null without markers.
function section(doc) {
  doc = lf(doc);
  const a = doc.indexOf(START), b = doc.indexOf(END);
  return a < 0 || b < a ? null : doc.slice(a + START.length, b);
}
// [object, key] of every row of the section (to check that each one exists in the code).
function sectionKeys(doc) {
  const s = section(doc) || "";
  return [...s.matchAll(/^\| (\w+) \| `(\w+)` \|/gm)].map(m => [m[1], m[2]]);
}

if (require.main === module) {
  const src = fs.readFileSync(INDEX, "utf8"), raw = fs.readFileSync(DOC, "utf8"), eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const doc = lf(raw), cur = section(doc);
  if (cur === null) { console.error(`docs/game-design.md has no ${START} … ${END} markers`); process.exit(1); }
  const next = render(src);
  if (process.argv.includes("--check")) {
    if (cur !== next) { console.error("docs/game-design.md numbers are out of date: run npm run docs:numbers"); process.exit(1); }
    console.log("docs numbers up to date");
  } else if (cur === next) console.log("docs numbers already up to date");
  else {
    const a = doc.indexOf(START) + START.length, b = doc.indexOf(END);
    fs.writeFileSync(DOC, (doc.slice(0, a) + next + doc.slice(b)).replace(/\n/g, eol));   // keeps the file's line ends
    console.log(`docs/game-design.md: ${next.split("\n").filter(l => l.startsWith("| ") && !l.startsWith("| Объект")).length} rows written`);
  }
}

// The value of one object of the source (e.g. CFG) — for Node scripts and tests that need the numbers without a browser
const readValue = (src, name) => new Function(`return (${readObject(lf(src), name).text});`)();

module.exports = { render, rows, section, sectionKeys, readValue, OBJECTS };
