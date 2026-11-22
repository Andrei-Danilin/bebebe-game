// Tiny static server for the PWA tests (Node built-ins only).
// Serves the repo root on http://localhost:$PORT (default 8123) with the MIME types the PWA needs.
//   node scripts/serve.js        → then open http://localhost:8123/
// Tests may also require() it: makeServer({ override }) where override(urlPath) returns a body
// (string) or { status, body } to serve instead of the file, or null.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function makeServer({ override = null } = {}) {
  return http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch (e) { rel = "/"; }
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(ROOT, path.normalize(rel));
    // never leave the repo root
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end("forbidden"); return; }
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    const o = override ? override(rel) : null;
    if (o != null) {
      const { status = 200, body = "" } = typeof o === "string" ? { body: o } : o;
      res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Cache-Control": "no-cache" });
      if (req.method === "HEAD") { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 8123;
  makeServer().listen(PORT, () => console.log(`bebebe-game: http://localhost:${PORT}/`));
}

module.exports = { makeServer };
