// Service worker of BeBeBe Atrapar: the installed app keeps working offline after the first open.
// SPEC-011 AC 9: three caches, so a code deploy re-downloads no sprites and a sprite change no code:
//   <SW_VERSION>-src-<SRC_HASH>     the shell (index.html, manifest, icons) + the game's ES modules, written only at install
//                                   (plus the shell rule below); complete when its "installed" marker is there;
//   <SW_VERSION>-assets-<ASSETS_HASH>  the art sprites (assets/, listed by npm run assets);
//   bebebe-three-<version>          three.js from jsDelivr, by its version.
// The module URLs are versioned (./src/…/x.js?v=<hash of its bytes>: the import map of index.html, written by npm run precache
// with SRC_HASH and the lists below), so a shell only ever asks for its own module versions; they are served cache-first.
// index.html stays network-first: an online launch gets the new version at once. A network-fetched shell is stored only into
// the complete src cache of its own SRC_HASH (its <meta name="src-hash">); if there is none yet (the new worker has not
// finished installing), it is shown but not cached — so the cached shell always has its modules.
// A module change needs no SW_VERSION bump: rerun npm run precache (SRC_HASH changes). Bump SW_VERSION when a cache strategy,
// the three.js version (THREE_BASE = the import map's) or an icon's content changes. Old caches: the last 2 of each kind stay
// (a page of the previous version may still be open), older ones are deleted on activate.
const SW_VERSION = "bebebe-v4";
const CACHE_PREFIX = "bebebe-";          // all Pages projects of the account share one origin: touch only our caches
const NET_TIMEOUT_MS = 4000;             // weak signal: after this long, a cached copy wins over a slow network
const THREE_BASE = "https://cdn.jsdelivr.net/npm/three@0.187.0/build/";
// SPEC-011: written by npm run precache (scripts/precache.js) — do not edit by hand
// precache:start
const SRC_HASH = "a0c02b2d3f";
const PRECACHE_LOCAL = [
  "./", "./index.html", "./manifest.webmanifest", "./icons/apple-touch-icon.png", "./icons/icon-192.png",
  "./icons/icon-512-maskable.png", "./icons/icon-512.png", "./icons/icon.svg"
];
const PRECACHE_SRC = [
  "./src/client/art-names.js?v=7228f7f839", "./src/client/look.js?v=6b3f0ae3e3",
  "./src/core/autopilot.js?v=f62807a252", "./src/core/big.js?v=f5caddcc69", "./src/core/bots.js?v=3816176aa9",
  "./src/core/config.js?v=3409a82f50", "./src/core/difficulty.js?v=d289c6f89d", "./src/core/economy.js?v=56dc2c8d89",
  "./src/core/game.js?v=4b759de4d9", "./src/core/hearing.js?v=d3484b3404", "./src/core/hooks.js?v=3d83dff9cc",
  "./src/core/index.js?v=1c5be51a5b", "./src/core/level/build.js?v=d67a9b12cd",
  "./src/core/level/generate.js?v=455b2ff4e4", "./src/core/level/layouts.js?v=35c82d01f0",
  "./src/core/level/validate.js?v=e551cb4d78", "./src/core/mood.js?v=811aaf8d08", "./src/core/path.js?v=8d09ea0e2c",
  "./src/core/practice.js?v=a172d7c821", "./src/core/progress-rules.js?v=a8243540b6",
  "./src/core/rules.js?v=92957f5252", "./src/core/util.js?v=966b25e5de", "./src/core/wardrobe.js?v=d41ca5a53d",
  "./src/core/world.js?v=1e0b79fedf", "./src/i18n.js?v=a28c8e3da4", "./src/story.js?v=31072db672"
];
// precache:end
// SPEC-020: written by npm run assets (scripts/assets.js) — do not edit by hand
// assets:start
const ASSETS_HASH = "df50cb2e11c5";
const PRECACHE_ASSETS = [
  "./assets/main_tile.webp", "./assets/menu_bg.webp", "./assets/map_bg_park.webp", "./assets/map_bg_field.webp",
  "./assets/map_bg_city.webp", "./assets/map_bg_school.webp", "./assets/map_bg_beach.webp",
  "./assets/map_bg_winter.webp", "./assets/story_start.webp", "./assets/tutorial_a.webp", "./assets/tutorial_b.webp",
  "./assets/tutorial_c.webp", "./assets/story_park.webp", "./assets/story_field.webp", "./assets/story_city.webp",
  "./assets/story_school.webp", "./assets/story_beach.webp", "./assets/story_winter.webp", "./assets/story_end.webp",
  "./assets/story_win.webp", "./assets/logo.webp", "./assets/icon_shield.webp", "./assets/icon_bandaid.webp",
  "./assets/icon_cupcake.webp", "./assets/icon_angry_heart.webp", "./assets/icon_pause.webp",
  "./assets/icon_sound.webp", "./assets/btn_green.webp", "./assets/btn_pink.webp", "./assets/btn_orange.webp",
  "./assets/btn_grey.webp", "./assets/round_play.webp", "./assets/round_pause.webp", "./assets/round_sound.webp",
  "./assets/round_restart.webp", "./assets/cloud_heart_full.webp", "./assets/cloud_heart_half.webp",
  "./assets/cloud_heart_fading.webp", "./assets/cloud_heart_empty.webp", "./assets/coin_badge.webp",
  "./assets/ribbon_star.webp", "./assets/house_messy.webp", "./assets/house_kids.webp", "./assets/stop_empty.webp",
  "./assets/stop_current.webp", "./assets/stop_locked.webp", "./assets/stop_boss.webp", "./assets/star_gold.webp",
  "./assets/star_empty.webp", "./assets/stamp_done.webp", "./assets/padlock.webp", "./assets/world_park.webp",
  "./assets/world_field.webp", "./assets/world_city.webp", "./assets/world_school.webp", "./assets/world_beach.webp",
  "./assets/world_winter.webp", "./assets/ui_play.webp", "./assets/ui_back.webp", "./assets/ui_home.webp",
  "./assets/ui_story.webp", "./assets/ui_bag.webp", "./assets/ui_gear.webp", "./assets/ui_sound_on.webp",
  "./assets/ui_sound_off.webp", "./assets/ui_fullscreen.webp", "./assets/ui_globe.webp", "./assets/ui_coin.webp",
  "./assets/ui_gift.webp", "./assets/shop_fast_feet.webp", "./assets/shop_long_items.webp",
  "./assets/shop_quick_help.webp", "./assets/shop_wardrobe.webp", "./assets/shop_items.webp",
  "./assets/shop_upgrades.webp", "./assets/hat_cap.webp", "./assets/hat_beanie.webp", "./assets/hat_crown.webp",
  "./assets/hat_bow.webp", "./assets/hat_flower.webp", "./assets/hat_ears.webp", "./assets/hat_headband.webp",
  "./assets/hat_tophat.webp", "./assets/hat_viking.webp", "./assets/hat_pirate.webp", "./assets/hat_glasses.webp",
  "./assets/jacket_blue_zip.webp", "./assets/jacket_hoodie.webp", "./assets/jacket_stripes.webp",
  "./assets/jacket_red_zip.webp", "./assets/jacket_cape.webp", "./assets/jacket_trench.webp",
  "./assets/pants_shorts.webp", "./assets/pants_jeans.webp", "./assets/pants_striped.webp",
  "./assets/pants_overalls.webp", "./assets/pants_joggers.webp", "./assets/fx_burst_yellow.webp",
  "./assets/fx_burst_red.webp", "./assets/fx_burst_pink.webp", "./assets/fx_steam_left.webp",
  "./assets/fx_steam_right.webp", "./assets/fx_storm_cloud.webp", "./assets/fx_stink.webp", "./assets/fx_dizzy.webp",
  "./assets/fx_hearts.webp", "./assets/fx_speed.webp", "./assets/fx_dust.webp", "./assets/fx_sparkle.webp",
  "./assets/fx_bandaid.webp", "./assets/fx_confetti.webp", "./assets/phone_kiss.webp", "./assets/phone_kit.webp",
  "./assets/phone_stick_base.webp", "./assets/phone_pause.webp", "./assets/phone_stick_knob.webp",
  "./assets/menu_play.webp", "./assets/menu_story.webp", "./assets/menu_character.webp", "./assets/tab_progress.webp",
  "./assets/jacket_tshirt.webp", "./assets/jacket_orange_stripes.webp", "./assets/jacket_purple_zip.webp",
  "./assets/jacket_pink_hoodie.webp", "./assets/jacket_teal_zip.webp", "./assets/jacket_hero_cape.webp",
  "./assets/jacket_ninja.webp", "./assets/jacket_sailor.webp", "./assets/jacket_raincoat.webp",
  "./assets/hat_ninja.webp", "./assets/pants_black.webp", "./assets/pants_red.webp", "./assets/pants_green.webp",
  "./assets/pants_pink_shorts.webp", "./assets/pants_purple.webp", "./assets/ui_friends.webp", "./assets/ui_dice.webp",
  "./assets/ui_question.webp", "./assets/ui_pencil.webp", "./assets/ui_pack.webp", "./assets/ui_ear.webp",
  "./assets/ui_map.webp", "./assets/ui_check.webp", "./assets/ui_cross.webp", "./assets/item_boots.webp",
  "./assets/item_cape.webp", "./assets/item_banana.webp", "./assets/item_mittens.webp",
  "./assets/item_mega_mittens.webp", "./assets/item_kiss.webp", "./assets/item_star.webp", "./assets/item_coin.webp",
  "./assets/heart_full.webp", "./assets/heart_half.webp", "./assets/heart_empty.webp"
];
// assets:end
const CACHE_SRC = SW_VERSION + "-src-" + SRC_HASH;
const CACHE_ASSETS = SW_VERSION + "-assets-" + ASSETS_HASH;
const CACHE_THREE = CACHE_PREFIX + "three-" + (THREE_BASE.match(/three@([^/]+)\//) || [])[1];
const PRECACHE_THREE = [THREE_BASE + "three.module.js", THREE_BASE + "three.core.js"];
const SCOPE_ROOT = new URL("./", self.location).href;
const INSTALLED = new URL("./__installed__", self.location).href;   // the marker of a complete src cache
const MATCH = { ignoreSearch: true, ignoreVary: true };
const KEEP = 2;                          // caches of each kind kept: this version and the one before

const srcHashOf = html => (html.match(/<meta name="src-hash" content="([^"]+)">/) || [])[1] || null;
const isComplete = async name => (await caches.has(name)) && !!(await (await caches.open(name)).match(INSTALLED));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    // the game itself: all or nothing, and the shell must be the one of these modules (a deploy in between → no install)
    const src = await caches.open(CACHE_SRC);
    await src.addAll([...PRECACHE_LOCAL, ...PRECACHE_SRC].map(u => new Request(u, { cache: "reload" })));
    const shell = await src.match(SCOPE_ROOT);
    if (!shell || srcHashOf(await shell.text()) !== SRC_HASH) { await caches.delete(CACHE_SRC); throw new Error("the shell is not the one of these modules"); }
    await src.put(INSTALLED, new Response("1"));
    // three.js: only what this version's cache does not have yet
    const three = await caches.open(CACHE_THREE);
    const missing = [];
    for (const u of PRECACHE_THREE) if (!(await three.match(u))) missing.push(u);
    await three.addAll(missing.map(u => new Request(u, { mode: "cors" })));
    // the art: one by one, a missing sprite never blocks the install (the game draws it with code)
    const art = await caches.open(CACHE_ASSETS);
    await Promise.all(PRECACHE_ASSETS.map(async u => { if (!(await art.match(u))) await art.add(new Request(u, { cache: "no-cache" })).catch(() => {}); }));
    await self.skipWaiting();
  })());
});

// the kind of one of our caches ("src", "assets", "three") or null (an old name: deleted)
const kindOf = name => (/-src-[^-]+$/.test(name) ? "src" : /-assets-[^-]+$/.test(name) ? "assets" : name.startsWith(CACHE_PREFIX + "three-") ? "three" : null);
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const mine = [CACHE_SRC, CACHE_ASSETS, CACHE_THREE];
    const names = (await caches.keys()).filter(n => n.startsWith(CACHE_PREFIX) && !mine.includes(n));   // in creation order
    const keep = new Set();
    for (const kind of ["src", "assets", "three"]) names.filter(n => kindOf(n) === kind).slice(-(KEEP - 1)).forEach(n => keep.add(n));
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Keeps a copy of a good response (same-origin or CORS only, never opaque or errors) in `cacheName`, without delaying the page.
function remember(event, cacheName, request, response) {
  if (response.ok && (response.type === "basic" || response.type === "cors")) {
    const copy = response.clone();
    const saved = caches.open(cacheName).then(c => c.put(request, copy)).catch(() => {});
    try { event.waitUntil(saved); } catch (e) { /* the event is already over (cache answered first): saving goes on anyway */ }
  }
  return response;
}
// The shell rule: a network-fetched index.html goes only into the complete src cache of its own SRC_HASH
function rememberShell(event, request, response) {
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    const saved = (async () => {
      const hash = srcHashOf(await copy.clone().text()), name = hash && SW_VERSION + "-src-" + hash;
      if (name && await isComplete(name)) await (await caches.open(name)).put(request, copy);
    })().catch(() => {});
    try { event.waitUntil(saved); } catch (e) { /* saving goes on anyway */ }
  }
  return response;
}

// the cached shell: this worker's own version first (its modules are there), then any other copy
async function cachedShell(request, fallbackUrl) {
  const own = await caches.open(CACHE_SRC);
  return (await own.match(request, MATCH)) || (fallbackUrl ? await own.match(fallbackUrl) : undefined)
    || (await caches.match(request, MATCH)) || (fallbackUrl ? await caches.match(fallbackUrl) : undefined);
}

async function networkFirst(event, request, fallbackUrl, save, fromCache) {
  const network = fetch(request).then(res => (save ? save(event, request, res) : res));
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

async function cacheFirst(event, request, cacheName, match = { ignoreVary: true }) {
  const hit = await caches.match(request, match);
  if (hit) return hit;
  const res = await fetch(request);
  return cacheName ? remember(event, cacheName, request, res) : res;
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
    const fallback = atRoot ? SCOPE_ROOT : null;
    event.respondWith(networkFirst(event, req, fallback, atRoot ? rememberShell : null, () => cachedShell(req, fallback)));
  } else if (local && url.pathname.includes("/src/") && url.searchParams.has("v")) {
    // a versioned module: the exact URL (its hash) from any of our caches, else the network — never written at runtime
    event.respondWith(cacheFirst(event, req, null, { ignoreVary: true }));
  } else if (url.href.startsWith(THREE_BASE)) {
    event.respondWith(cacheFirst(event, req, CACHE_THREE));
  } else if (local && url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(event, req, CACHE_ASSETS));
  } else if (local && url.pathname.includes("/icons/")) {
    event.respondWith(cacheFirst(event, req, null));
  } else {
    // everything else (the manifest, an unversioned file): network, our caches as the fallback; nothing written
    event.respondWith(networkFirst(event, req, null, null, () => caches.match(req, MATCH)));
  }
});
