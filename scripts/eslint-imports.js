// SPEC-011 AC 11b: a tiny local ESLint plugin instead of eslint-plugin-import (no extra dependencies): rule "imports" reports
// - a relative import whose file does not exist (unresolved), and
// - a named / default import the target module does not export (missing named import),
// - a bare specifier that the import map does not name (BARE: today only "three").
// The target is parsed with espree (ESLint's own parser). A target with `export * from` may re-export anything: its names
// are not checked. Used by eslint.config.js for src/** (and the extracted inline module).
const fs = require("fs");
const path = require("path");
const espree = require(require.resolve("espree", { paths: [path.dirname(require.resolve("eslint"))] }));

const BARE = ["three"];          // the import map in index.html (AC 1b)
const cache = new Map();         // file → { mtime, names: Set | null (anything) }

function exportsOf(file) {
  const mtime = fs.statSync(file).mtimeMs, hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.names;
  const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "module" });
  let names = new Set();
  const id = n => n.type === "Identifier" ? n.name : n.value;       // `export { a as "b" }` → "b"
  const pattern = p => {
    if (!p) return;
    if (p.type === "Identifier") names.add(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach(q => pattern(q.type === "RestElement" ? q.argument : q.value));
    else if (p.type === "ArrayPattern") p.elements.forEach(e => pattern(e && e.type === "RestElement" ? e.argument : e));
    else if (p.type === "AssignmentPattern") pattern(p.left);
  };
  for (const n of ast.body) {
    if (n.type === "ExportDefaultDeclaration") names.add("default");
    else if (n.type === "ExportAllDeclaration") { if (n.exported) names.add(id(n.exported)); else { names = null; break; } }
    else if (n.type === "ExportNamedDeclaration") {
      const d = n.declaration;
      if (d && d.declarations) d.declarations.forEach(v => pattern(v.id));
      else if (d && d.id) names.add(d.id.name);
      for (const s of n.specifiers) names.add(id(s.exported));
    }
  }
  cache.set(file, { mtime, names });
  return names;
}

const rule = {
  meta: { type: "problem", docs: { description: "relative imports resolve and their named imports exist; bare imports are in the import map" }, schema: [] },
  create(context) {
    const here = path.dirname(context.filename || context.getFilename());
    const check = (node, specifiers) => {
      const src = node.source && node.source.value;
      if (typeof src !== "string") return;
      if (!src.startsWith("./") && !src.startsWith("../")) {
        if (!BARE.includes(src)) context.report({ node: node.source, message: `"${src}" is not in the import map (only ${BARE.join(", ")})` });
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

module.exports = { meta: { name: "bebebe-local" }, rules: { imports: rule } };
