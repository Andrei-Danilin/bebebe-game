// SPEC-013 AC 1 / 2 / 8: the Worker — the only public door. Routes: GET /health, POST /rooms, GET /ws?room=CODE (WebSocket upgrade → the Room
// named by the code). Every request first passes the Origin check (CFG.ONLINE.ORIGINS) and, for rooms and joins, the per-IP limit kept by the
// Limiter Durable Object (named by a salted daily hash of the IP; nothing stored). Nothing here logs an IP, a name or a token (log.js).
import { CFG } from "../../src/core/config.js";
import { canHost } from "../../src/core/progress-rules.js";
import { Limiter } from "./limiter.js";
import { ipKey, normaliseCode, originAllowed, randomCode, validCode } from "./limits.js";
import { log } from "./log.js";
import { ENTITLEMENTS, PROTOCOL } from "./protocol.js";
import { refusedSocket } from "./refuse.js";
import { Room } from "./room.js";

export { Limiter, Room };

const ROOM_TRIES = 5;           // POST /rooms: codes tried before giving up (a code is refused when its Room is live)
const DEV_SALT = "bebebe-dev-salt";   // SPEC-014 sets the real one as the IP_SALT secret; the hash is only a daily-rotating bucket name

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

// CORS for the allowed origin (the web game on Pages calls POST /rooms from its own origin)
function cors(origin) {
  return origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" } : {};
}

// the client's IP for the limiter only: Cloudflare's header. A test server (TEST_HOOKS=1, never set in wrangler.toml) may name one with ?_ip=
function clientIp(request, url, env) {
  if (env.TEST_HOOKS === "1" && url.searchParams.has("_ip")) return url.searchParams.get("_ip");
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
async function allowed(env, request, url, kind) {
  const key = await ipKey(clientIp(request, url, env), env.IP_SALT ?? DEV_SALT);
  return env.LIMITER.get(env.LIMITER.idFromName(key)).hit(kind);
}

// the creator's entitlement from the POST body ({ "entitlement": "free" | "full" }); anything else, or no body, is undefined
async function bodyEntitlement(request) {
  try {
    const text = await request.text();
    if (text.length > 256) return undefined;
    const e = JSON.parse(text)?.entitlement;
    return ENTITLEMENTS.includes(e) ? e : undefined;
  } catch { return undefined; }
}

// → { code, ownerKey } (the key is shown to the creator once: the hello that presents it becomes the owner), or null after ROOM_TRIES live codes
async function createRoom(env, url) {
  const forced = env.TEST_HOOKS === "1" ? (url.searchParams.get("_codes") ?? "").split(",").filter(Boolean) : [];   // tests: the codes to try, in order
  for (let i = 0; i < ROOM_TRIES; i++) {
    const code = forced.length ? forced[Math.min(i, forced.length - 1)] : randomCode();
    const ownerKey = await env.ROOM.get(env.ROOM.idFromName(code)).create(code);
    if (ownerKey) return { code, ownerKey };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get("Origin");
    // a browser always sends Origin on a cross-origin request or an upgrade; a request without one (a native client, curl) is not a page of another site
    if (origin !== null && !originAllowed(origin, CFG.ONLINE.ORIGINS)) { log("origin_refused"); return json({ error: "originRefused" }, 403); }
    const headers = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, protocol: PROTOCOL }, 200, headers);

    if (url.pathname === "/rooms" && request.method === "POST") {
      // AC 7: hosting needs the Full game when CFG.MONETIZATION.enforce (off in the beta). POST /rooms has no hello, so the body says { entitlement }; the creator's
      // first hello says it again (room.js). Trusted for now: a store receipt check is a later spec
      const mon = env.TEST_HOOKS === "1" && env.TEST_ENFORCE === "1" ? { ...CFG.MONETIZATION, enforce: true } : CFG.MONETIZATION;
      if (!canHost(await bodyEntitlement(request), mon)) { log("host_refused"); return json({ error: "needFull" }, 403, headers); }
      if (!(await allowed(env, request, url, "room"))) { log("rate_limited_rooms"); return json({ error: "rateLimited" }, 429, headers); }
      const room = await createRoom(env, url);
      return room ? json(room, 200, headers) : json({ error: "busy" }, 503, headers);
    }

    if (url.pathname === "/ws" && request.method === "GET") {
      if (request.headers.get("Upgrade") !== "websocket") return json({ error: "upgradeRequired" }, 426, headers);
      if (!(await allowed(env, request, url, "join"))) { log("rate_limited_joins"); return refusedSocket("rateLimited"); }
      const code = normaliseCode(url.searchParams.get("room"));
      if (!validCode(code)) return refusedSocket("roomNotFound");
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
    }

    return json({ error: "notFound" }, 404, headers);
  }
};
