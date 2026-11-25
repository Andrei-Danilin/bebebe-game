// Tiny static server for the game, the tests and the scripts (Node built-ins only).
// Serves the repo root on http://localhost:$PORT (default 8123) with the MIME types the PWA needs.
//   node scripts/serve.js        → then open http://localhost:8123/
// Tests may also require() it: makeServer({ override, root }) where override(urlPath) returns a body
// (string) or { status, body } to serve instead of the file, or null; root (default: the repo root) is the folder served.
// SPEC-011 AC 8b: startServer({ root }) → { base, close } listens on a free port — scripts/balance.js and scripts/perf.js
// open the game over http with it.
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
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function makeServer({ override = null, root = ROOT } = {}) {
  root = path.resolve(root);
  return http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch (e) { rel = "/"; }
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(root, path.normalize(rel));
    // never leave the served root
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end("forbidden"); return; }
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

// Starts a server on a free port; base = its URL with a trailing slash
function startServer(opts = {}) {
  const server = makeServer(opts);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, () => resolve({
      server, base: `http://localhost:${server.address().port}/`,
      close: () => new Promise(done => { server.close(() => done()); server.closeAllConnections(); })
    }));
  });
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 8123;
  makeServer().listen(PORT, () => console.log(`bebebe-game: http://localhost:${PORT}/`));
}

module.exports = { makeServer, startServer };
