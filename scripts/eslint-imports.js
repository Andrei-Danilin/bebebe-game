// SPEC-011 AC 11b: a tiny local ESLint plugin instead of eslint-plugin-import (no extra dependencies): rule "imports" reports
// - a relative import whose file does not exist (unresolved),
// - a named / default import the target module does not export (missing named import; `export * from` is followed, with
//   a visited set against cycles),
// - a bare specifier that the import map of index.html does not name (a key ending in "/" matches as a prefix).
// The target is parsed with espree (ESLint's own parser). Used by eslint.config.js for src/** and the extracted inline module.
const fs = require("fs");
const path = require("path");
const espree = require(require.resolve("espree", { paths: [path.dirname(require.resolve("eslint"))] }));

const INDEX = path.resolve(__dirname, "..", "index.html");
const cache = new Map();         // file → { mtime, own: Set, stars: [file], bad: [message] }

// the keys of the <script type="importmap"> in index.html (AC 1b)
let mapCache = null;
function importMapKeys() {
  const mtime = fs.existsSync(INDEX) ? fs.statSync(INDEX).mtimeMs : 0;
  if (mapCache && mapCache.mtime === mtime) return mapCache.keys;
  let keys = [];
  if (mtime) {
    const m = fs.readFileSync(INDEX, "utf8").match(/<script type="importmap">([\s\S]*?)<\/script>/);
    if (m) keys = Object.keys(JSON.parse(m[1]).imports || {});
  }
  mapCache = { mtime, keys };
  return keys;
}
const inImportMap = src => importMapKeys().some(k => (k.endsWith("/") ? src.startsWith(k) : src === k));

// one module's own exports and the files it re-exports with `export * from`
function parseModule(file) {
  const mtime = fs.statSync(file).mtimeMs, hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit;
  const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "module" });
  const own = new Set(), stars = [], bad = [];
  const id = n => (n.type === "Identifier" ? n.name : n.value);      // `export { a as "b" }` → "b"
  const pattern = p => {
    if (!p) return;
    if (p.type === "Identifier") own.add(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach(q => pattern(q.type === "RestElement" ? q.argument : q.value));
    else if (p.type === "ArrayPattern") p.elements.forEach(e => pattern(e && e.type === "RestElement" ? e.argument : e));
    else if (p.type === "AssignmentPattern") pattern(p.left);
  };
  for (const n of ast.body) {
    if (n.type === "ExportDefaultDeclaration") own.add("default");
    else if (n.type === "ExportAllDeclaration") {
      if (n.exported) own.add(id(n.exported));                        // export * as ns from "…"
      else if (/^\.\.?\//.test(n.source.value)) stars.push(path.resolve(path.dirname(file), n.source.value));
      else bad.push(n.source.value);                                   // export * from a bare name: names unknown
    } else if (n.type === "ExportNamedDeclaration") {
      const d = n.declaration;
      if (d && d.declarations) d.declarations.forEach(v => pattern(v.id));
      else if (d && d.id) own.add(d.id.name);
      for (const s of n.specifiers) own.add(id(s.exported));
    }
  }
  const out = { mtime, own, stars, bad };
  cache.set(file, out);
  return out;
}
// every name a module exports, following `export * from` (which never re-exports "default"); null = cannot tell
function exportsOf(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const m = parseModule(file);
  if (m.bad.length) return null;
  const names = new Set(m.own);
  for (const f of m.stars) {
    if (!fs.existsSync(f)) return null;
    const more = exportsOf(f, seen);
    if (!more) return null;
    for (const n of more) if (n !== "default") names.add(n);
  }
  return names;
}

const rule = {
  meta: { type: "problem", docs: { description: "relative imports resolve and their named imports exist; bare imports are in the import map" }, schema: [] },
  create(context) {
    const here = path.dirname(context.filename);
    const check = (node, specifiers) => {
      const src = node.source && node.source.value;
      if (typeof src !== "string") return;
      // SPEC-011 AC 9: a module version (?v=<hash>) lives only in the import map (npm run precache), never in an import
      if (/[?#]/.test(src)) { context.report({ node: node.source, message: `"${src}": no query or hash in an import — versions are the import map's (npm run precache)` }); return; }
      if (!src.startsWith("./") && !src.startsWith("../")) {
        if (!inImportMap(src)) context.report({ node: node.source, message: `"${src}" is not in the import map of index.html (${importMapKeys().join(", ") || "none"})` });
        return;
      }
      const file = path.resolve(here, src);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { context.report({ node: node.source, message: `unresolved import "${src}"` }); return; }
      let names;
      try { names = exportsOf(file); } catch (e) { context.report({ node: node.source, message: `cannot parse "${src}": ${e.message}` }); return; }
      if (!names) return;
      for (const s of specifiers) {
        const name = s.type === "ImportDefaultSpecifier" ? "default" : s.type === "ImportSpecifier" ? (s.imported.name ?? s.imported.value)
          : s.type === "ExportSpecifier" ? (s.local.name ?? s.local.value) : null;
        if (name && !names.has(name)) context.report({ node: s, message: `"${src}" does not export "${name}"` });
      }
    };
    return {
      ImportDeclaration: n => check(n, n.specifiers),
      ExportNamedDeclaration: n => { if (n.source) check(n, n.specifiers); },
      ExportAllDeclaration: n => check(n, []),
      ImportExpression: n => { if (n.source.type === "Literal") check({ source: n.source }, []); }
    };
  }
};

module.exports = { meta: { name: "bebebe-local" }, rules: { imports: rule }, importMapKeys };
