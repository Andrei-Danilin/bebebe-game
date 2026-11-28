// SPEC-013: the test harness of tests/online — starts the real Worker with `wrangler dev --local` (Miniflare + workerd, no Cloudflare account)
// on a free port, waits for /health, and gives the tests a small WebSocket client. Not a test file (the runner globs *.test.mjs).
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ONLINE = path.join(ROOT, "online");
const WRANGLER = path.join(ONLINE, "node_modules", "wrangler", "bin", "wrangler.js");

const freePort = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Start the Worker. `vars` are extra --var values (TEST_HOOKS=1 is always on: ?_ip= and ?_codes= in the tests).
 * Returns { http, ws, logs() (everything wrangler printed), stop() }.
 */
export async function startServer({ vars = {} } = {}) {
  if (!existsSync(WRANGLER)) throw new Error("online/node_modules is missing: run `npm ci --prefix online`");
  const [port, inspector] = [await freePort(), await freePort()];
  const state = mkdtempSync(path.join(tmpdir(), "bebebe-online-"));   // a fresh Durable Object state per server: no room survives from an earlier run
  const args = [WRANGLER, "dev", "--local", "--port", String(port), "--inspector-port", String(inspector), "--persist-to", state];
  for (const [k, v] of Object.entries({ TEST_HOOKS: "1", ...vars })) args.push("--var", `${k}:${v}`);
  let out = "";
  const child = spawn(process.execPath, args, {
    cwd: ONLINE, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32",
    env: { ...process.env, NO_COLOR: "1", WRANGLER_SEND_METRICS: "false", CI: "1" }
  });
  child.stdout.on("data", d => { out += d; });
  child.stderr.on("data", d => { out += d; });
  let exited = false;
  child.on("exit", () => { exited = true; });
  const stop = async () => {
    if (!exited) {
      try {
        if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else process.kill(-child.pid, "SIGKILL");
      } catch { /* already gone */ }
    }
    await sleep(200);
    try { rmSync(state, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a locked temp dir is not a test failure */ }
  };
  const http = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (exited) { await stop(); throw new Error(`wrangler exited early:\n${out}`); }
    try { if ((await fetch(`${http}/health`)).ok) break; } catch { /* not listening yet */ }
    if (Date.now() > deadline) { await stop(); throw new Error(`wrangler did not start in 90 s:\n${out}`); }
    await sleep(300);
  }
  return { http, ws: `ws://127.0.0.1:${port}`, logs: () => out, stop };
}

export const post = (server, p, { ip, headers = {}, query = "" } = {}) =>
  fetch(`${server.http}${p}?${ip ? `_ip=${ip}&` : ""}${query}`, { method: "POST", headers });

/** POST /rooms → the code (the room is created) */
export async function newRoom(server, ip) {
  const r = await post(server, "/rooms", { ip });
  if (r.status !== 200) throw new Error(`POST /rooms ${r.status}`);
  return (await r.json()).code;
}

/**
 * A WebSocket client: send(obj | text), recv(type?, ms) → the next message (of that type), closed → { code, reason }.
 * Messages are kept in order; recv takes the first unread match.
 */
export function connect(server, room, { ip, headers } = {}) {
  const url = `${server.ws}/ws?room=${room}${ip ? `&_ip=${ip}` : ""}`;
  const ws = headers ? new WebSocket(url, { headers }) : new WebSocket(url);
  const inbox = [], waiters = [];
  const c = {
    ws, inbox,
    opened: new Promise((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = e => reject(new Error(`socket error ${e.message ?? ""}`)); }),
    closed: new Promise(resolve => { ws.onclose = e => resolve({ code: e.code, reason: e.reason }); }),
    send: m => ws.send(typeof m === "string" ? m : JSON.stringify(m)),
    recv(type, ms = 8000) {
      const take = () => { const i = inbox.findIndex(m => !type || m.type === type); return i < 0 ? null : inbox.splice(i, 1)[0]; };
      const got = take();
      if (got) return Promise.resolve(got);
      return new Promise((resolve, reject) => {
        const w = { try: () => { const m = take(); if (m) { clearTimeout(w.t); waiters.splice(waiters.indexOf(w), 1); resolve(m); } } };
        w.t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`no "${type ?? "message"}" in ${ms} ms (inbox: ${JSON.stringify(inbox)})`)); }, ms);
        waiters.push(w);
      });
    },
    close: () => { try { ws.close(); } catch { /* closed */ } }
  };
  ws.onmessage = e => { inbox.push(JSON.parse(e.data)); for (const w of [...waiters]) w.try(); };
  c.closed.catch(() => {});
  return c;
}
export const issuedTokens = [];   // every session token a test was given (the log spy looks for them)
export const HELLO = { type: "hello", protocol: 1, clientVersion: "1.0.0", platform: "web", entitlement: "full" };

/** connect and say hello → { c, welcome, state } */
export async function join(server, room, { ip, hello = {} } = {}) {
  const c = connect(server, room, { ip });
  await c.opened;
  c.send({ ...HELLO, ...hello });
  const welcome = await c.recv("welcome");
  issuedTokens.push(welcome.token);
  const state = await c.recv("roomState");
  return { c, welcome, state };
}
