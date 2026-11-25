// SPEC-025 AC 1 / 1b: `npm run vendor:three` — re-creates vendor/three/ from the three.js version pinned in package.json.
// The npm package has no minified build (r187), so the two build files are fetched minified from jsDelivr (its Terser
// minification of the npm files three.module.js / three.core.js, licence headers kept) and stored under the original names (the
// minified module imports "./three.core.js"); the MIT licence is copied from node_modules/three. Then npm run precache writes the
// new hashes (import map, sw.js THREE_VERSION / PRECACHE_THREE). A dev tool (Node 18+ fetch); the game never fetches anything.
//   node scripts/vendor-three.js
const fs = require("fs");
const path = require("path");
const { run } = require("./precache.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "vendor", "three");
const FILES = [["three.module.min.js", "three.module.js"], ["three.core.min.js", "three.core.js"]];

async function main() {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).devDependencies.three;
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error(`package.json: three must be pinned exactly (got ${version})`);
  const installed = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", "three", "package.json"), "utf8")).version;
  if (installed !== version) throw new Error(`node_modules/three is ${installed}, package.json pins ${version}: run npm install first`);
  const got = {};
  for (const [from, to] of FILES) {
    const url = `https://cdn.jsdelivr.net/npm/three@${version}/build/${from}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("@license")) throw new Error(`${url}: no licence header`);
    got[to] = text;
  }
  if (!/from\s*"\.\/three\.core\.js"/.test(got["three.module.js"])) throw new Error("the minified module does not import ./three.core.js");
  const rev = (got["three.core.js"].match(/\bREVISION\s*=\s*"(\d+)"/) || [])[1];
  if (rev !== version.split(".")[1]) throw new Error(`REVISION ${rev} does not match three ${version}`);
  fs.mkdirSync(OUT, { recursive: true });
  for (const [to, text] of Object.entries(got)) fs.writeFileSync(path.join(OUT, to), text);
  fs.copyFileSync(path.join(ROOT, "node_modules", "three", "LICENSE"), path.join(OUT, "LICENSE"));
  fs.writeFileSync(path.join(OUT, "package.json"), "{ \"type\": \"module\" }\n");
  const r = run();
  console.log(`vendor:three: three ${version} (r${rev}) → vendor/three/; precache: ${r.stale.length ? "wrote " + r.stale.join(", ") : "up to date"}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
