// Service worker of BeBeBe Atrapar: the installed app keeps working offline after the first open.
// Bump SW_VERSION when PRECACHE, the three.js version, an icon's content or a cache strategy changes
// (a change to index.html alone needs no bump: it is network-first).
const SW_VERSION = "bebebe-v1";
const CACHE_PREFIX = "bebebe-";          // all Pages projects of the account share one origin: touch only our caches
const NET_TIMEOUT_MS = 4000;             // weak signal: after this long, a cached copy wins over a slow network
const THREE_BASE = "https://cdn.jsdelivr.net/npm/three@0.187.0/build/";
const PRECACHE_LOCAL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icons/icon.svg", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png"
];
const PRECACHE_THREE = [THREE_BASE + "three.module.js", THREE_BASE + "three.core.js"];
const SCOPE_ROOT = new URL("./", self.location).href;
const MATCH = { ignoreSearch: true, ignoreVary: true };

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SW_VERSION);
    await cache.addAll(PRECACHE_LOCAL.map(u => new Request(u, { cache: "reload" })));
    await cache.addAll(PRECACHE_THREE.map(u => new Request(u, { mode: "cors" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX) && n !== SW_VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Keeps a copy of a good response (same-origin or CORS only, never opaque or errors) without delaying the page.
function remember(event, request, response) {
  if (response.ok && (response.type === "basic" || response.type === "cors")) {
    const copy = response.clone();
    const saved = caches.open(SW_VERSION).then(c => c.put(request, copy)).catch(() => {});
    try { event.waitUntil(saved); } catch (e) { /* the event is already over (cache answered first): saving goes on anyway */ }
  }
  return response;
}

async function networkFirst(event, request, fallbackUrl) {
  const fromCache = async () => (await caches.match(request, MATCH)) || (fallbackUrl ? await caches.match(fallbackUrl) : undefined);
  const network = fetch(request).then(res => remember(event, request, res));
  network.catch(() => {});                                   // a late failure after the cache answered is fine
  let timer;
  const slow = new Promise(resolve => { timer = setTimeout(resolve, NET_TIMEOUT_MS, "slow"); });
  try {
    const first = await Promise.race([network, slow]);
    if (first !== "slow") return first.ok ? first : ((await fromCache()) || first);   // 404/503: the cached game is better
    return (await fromCache()) || await network;
  } catch (e) {
    const hit = await fromCache();
    if (hit) return hit;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFirst(event, request) {
  const hit = await caches.match(request, { ignoreVary: true });
  return hit || remember(event, request, await fetch(request));
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const local = url.origin === self.location.origin;
  const path = url.href.split(/[?#]/)[0];
  const atRoot = path === SCOPE_ROOT || path === SCOPE_ROOT + "index.html";
  if (req.mode === "navigate" || atRoot) {
    // a new version of the game shows up as soon as the phone is online
    event.respondWith(networkFirst(event, req, atRoot ? SCOPE_ROOT : null));
  } else if (url.href.startsWith(THREE_BASE) || (local && url.pathname.includes("/icons/"))) {
    event.respondWith(cacheFirst(event, req));
  } else {
    event.respondWith(networkFirst(event, req, null));       // everything else: network, cache as fallback
  }
});
