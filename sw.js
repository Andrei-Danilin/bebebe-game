// Service worker of BeBeBe Atrapar: the installed app keeps working offline after the first open.
// Bump SW_VERSION when PRECACHE or a cache strategy changes (index.html alone needs no bump: network-first).
const SW_VERSION = "bebebe-v1";
const THREE_BASE = "https://cdn.jsdelivr.net/npm/three@0.187.0/build/";
const PRECACHE_LOCAL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icons/icon.svg", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png"
];
const PRECACHE_THREE = [THREE_BASE + "three.module.js", THREE_BASE + "three.core.js"];
const SCOPE_ROOT = new URL("./", self.location).href;

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
    await Promise.all(names.filter(n => n !== SW_VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Keep a good response for later (same-origin or CORS only, never opaque or errors).
async function remember(request, response) {
  if (response && response.ok && (response.type === "basic" || response.type === "cors")) {
    const cache = await caches.open(SW_VERSION);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    return await remember(request, await fetch(request));
  } catch (e) {
    const hit = await caches.match(request, { ignoreSearch: true, ignoreVary: true })
      || (fallbackUrl && await caches.match(fallbackUrl));
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreVary: true });
  return hit || remember(request, await fetch(request));
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const local = url.origin === self.location.origin;
  if (req.mode === "navigate" || (local && url.pathname.endsWith("/index.html"))) {
    // a new version of the game shows up as soon as the phone is online
    const atRoot = url.href.split(/[?#]/)[0] === SCOPE_ROOT || url.pathname.endsWith("/index.html");
    event.respondWith(networkFirst(req, atRoot ? SCOPE_ROOT : null));
  } else if (url.href.startsWith(THREE_BASE) || (local && url.pathname.includes("/icons/"))) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req, null));             // everything else: network, cache as fallback
  }
});
