// Service worker of BeBeBe Atrapar: the installed app keeps working offline after the first open.
// SPEC-011 AC 9: three caches, so a code deploy re-downloads no sprites and a sprite-only deploy no code (an install finds the
// complete src cache of its SRC_HASH and keeps it):
//   <SW_VERSION>-src-<SRC_HASH>     the shell (index.html, manifest, icons) + the game's ES modules, written only at install
//                                   (plus the shell rule below); complete when its "installed" marker is there;
//   <SW_VERSION>-assets-<ASSETS_HASH>  the art sprites (assets/, listed by npm run assets);
//   bebebe-three-<THREE_VERSION>    the vendored three.js (vendor/three/, SPEC-025 AC 1), by its version: a code deploy
//                                   never downloads it again.
// The module URLs are versioned (./src/…/x.js?v=<hash of its bytes>: the import map of index.html, written by npm run precache
// with SRC_HASH and the lists below), so a shell only ever asks for its own module versions; they are served cache-first.
// An unversioned module URL is never answered from a cache (network only; Phase C, the review of Phase B).
// index.html stays network-first: an online launch gets the new version at once. A network-fetched shell is stored only into
// the complete src cache of its own SRC_HASH (its <meta name="src-hash">); if there is none yet (the new worker has not
// finished installing), it is shown but not cached — so the cached shell always has its modules.
// A module change needs no SW_VERSION bump: rerun npm run precache (SRC_HASH changes; also THREE_VERSION and the versioned
// vendor URLs when vendor/three/ changes). SPEC-025 AC 12: SW_VERSION is derived, never bumped by hand — npm run precache writes
// it as bebebe-<package.json version>-b<SW_BUILD>, and SW_BUILD goes up by itself when this file's cache strategy (everything
// outside the generated blocks) or a cached shell file (an icon, the manifest) changes. Old caches: the
// last 2 of each kind stay (a page of the previous version may still be open), older ones are deleted on activate.
// SPEC-025 AC 1: nothing is fetched from another host — three.js is vendored and served from this origin like the rest.
const CACHE_PREFIX = "bebebe-";          // all Pages projects of the account share one origin: touch only our caches
const NET_TIMEOUT_MS = 4000;             // weak signal: after this long, a cached copy wins over a slow network
// SPEC-011: written by npm run precache (scripts/precache.js) — do not edit by hand
// precache:start
const SW_BUILD = 7;
const SW_STRATEGY = "463855aec6";
const SW_VERSION = "bebebe-1.0.0-dev-b7";
const SRC_HASH = "06a879dc79";
const PRECACHE_LOCAL = [
  "./", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512-maskable.png",
  "./icons/icon-512.png", "./icons/icon.svg", "./index.html", "./manifest.webmanifest"
];
const PRECACHE_SRC = [
  "./src/client/art-names.js?v=7228f7f839", "./src/client/art.js?v=00f3229cf4", "./src/client/debug.js?v=f0f0a2bac8",
  "./src/client/errors.js?v=d36934cb61", "./src/client/flow.js?v=86fbc5a5b1", "./src/client/fx.js?v=73f397efb4",
  "./src/client/input.js?v=4f52e8309e", "./src/client/lifecycle.js?v=3a42079abe", "./src/client/look.js?v=c8031e12d0",
  "./src/client/main.js?v=3cd19acf5a", "./src/client/names.js?v=dff85cded6", "./src/client/outfits.js?v=8564eaee23",
  "./src/client/perf.js?v=1b8537ee9d", "./src/client/progress.js?v=0713011f0e", "./src/client/save.js?v=a9593dae93",
  "./src/client/screen.js?v=94ffe40171", "./src/client/shop.js?v=ebde4ad6de", "./src/client/sound.js?v=57a594910c",
  "./src/client/state.js?v=ff60e51534", "./src/client/storage.js?v=686b11f06c",
  "./src/client/three/bosses.js?v=7814dfb8d4", "./src/client/three/camera.js?v=39a889ad56",
  "./src/client/three/characters.js?v=87a7d8775e", "./src/client/three/houses.js?v=c9bc94bc94",
  "./src/client/three/look3d.js?v=1dd4e9b9af", "./src/client/three/map3d.js?v=c3fed1392a",
  "./src/client/three/materials.js?v=430d5adc38", "./src/client/three/previews.js?v=0cdeff7116",
  "./src/client/three/setup.js?v=f20369215b", "./src/client/three/sync.js?v=4461a2e27a",
  "./src/client/three/themes.js?v=6f17def67f", "./src/client/tutorial.js?v=acce35fa62",
  "./src/client/ui/character/items.js?v=0580594792", "./src/client/ui/character/progress.js?v=33eab7a02a",
  "./src/client/ui/character/tabs.js?v=6d32ab672c", "./src/client/ui/character/upgrades.js?v=ee922fce9f",
  "./src/client/ui/character/wardrobe.js?v=815e77221d", "./src/client/ui/draw.js?v=bef8092eb6",
  "./src/client/ui/grownups.js?v=91d8fff16a", "./src/client/ui/home.js?v=5df7db0c9e",
  "./src/client/ui/hud.js?v=33c5fb55d9", "./src/client/ui/map.js?v=4634784c68", "./src/client/ui/menu.js?v=df7bd8b63c",
  "./src/client/ui/minimap.js?v=afd7cc3057", "./src/client/ui/phone.js?v=e22828e53e",
  "./src/client/ui/screens.js?v=e1bed2f499", "./src/client/ui/story.js?v=978a3b81ca",
  "./src/client/ui/text.js?v=e96306db7a", "./src/client/ui/win.js?v=9b3f336da5", "./src/core/active.js?v=70aa836ebd",
  "./src/core/autopilot.js?v=528edb53f9", "./src/core/big.js?v=745c03a759", "./src/core/bots.js?v=fc04a520e3",
  "./src/core/config.js?v=6f327714ee", "./src/core/difficulty.js?v=72aff2bd1e", "./src/core/economy.js?v=6c6ac20714",
  "./src/core/game.js?v=a99ba230de", "./src/core/hearing.js?v=3b691efd0b", "./src/core/hooks.js?v=5ceea54c61",
  "./src/core/index.js?v=2ac6418608", "./src/core/level/build.js?v=fc9509a62b",
  "./src/core/level/generate.js?v=455b2ff4e4", "./src/core/level/layouts.js?v=07d6472d8e",
  "./src/core/level/validate.js?v=3f3743eb46", "./src/core/mood.js?v=8dcad43e22", "./src/core/path.js?v=b05dfc5c4e",
  "./src/core/practice.js?v=44fe1505f4", "./src/core/progress-rules.js?v=a9deff0bda",
  "./src/core/rules.js?v=c4f51cf496", "./src/core/util.js?v=c7e01b9d3a", "./src/core/wardrobe.js?v=011be2182f",
  "./src/core/world.js?v=68fa838aaf", "./src/i18n.js?v=c52fd1f201", "./src/story.js?v=31072db672",
  "./src/version.js?v=6d0844555e"
];
const THREE_VERSION = "r187";
const PRECACHE_THREE = [
  "./vendor/three/three.core.js?v=60880f0fd0", "./vendor/three/three.module.js?v=49bfc58c40"
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
const CACHE_THREE = CACHE_PREFIX + "three-" + THREE_VERSION;
const SCOPE_ROOT = new URL("./", self.location).href;
const INSTALLED = new URL("./__installed__", self.location).href;   // the marker of a complete src cache
const MATCH = { ignoreSearch: true, ignoreVary: true };
const KEEP = 2;                          // caches of each kind kept: this version and the one before

const srcHashOf = html => (html.match(/<meta name="src-hash" content="([^"]+)">/) || [])[1] || null;
const isComplete = async name => (await caches.has(name)) && !!(await (await caches.open(name)).match(INSTALLED));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    // the shell first, before anything is written: both its URLs must be the shell of these modules (a deploy in between, or
    // a half-deployed site → no install; the active version and its caches stay as they are)
    const shellUrls = ["./", "./index.html"];
    const shells = await Promise.all(shellUrls.map(u => fetch(new Request(u, { cache: "reload" }))));
    const texts = await Promise.all(shells.map(r => (r.ok ? r.clone().text() : "")));
    if (texts.some(t => srcHashOf(t) !== SRC_HASH)) throw new Error("the shell is not the one of these modules");
    // the game itself: all or nothing. A complete cache of this SRC_HASH already there (a sprite-only or three.js deploy) is
    // kept and only gets the fresh shell (same SRC_HASH): no code is downloaded again
    const existed = await caches.has(CACHE_SRC), complete = await isComplete(CACHE_SRC);
    const src = await caches.open(CACHE_SRC);
    if (!complete) {
      try {
        await src.addAll([...PRECACHE_LOCAL.filter(u => !shellUrls.includes(u)), ...PRECACHE_SRC].map(u => new Request(u, { cache: "reload" })));
      } catch (e) {
        if (!existed) await caches.delete(CACHE_SRC);     // only a cache this install made (never a complete one)
        throw e;
      }
    }
    await Promise.all(shellUrls.map((u, i) => src.put(u, shells[i])));
    if (!complete) await src.put(INSTALLED, new Response("1"));
    // three.js: only what this version's cache does not have yet; anything else in it (an older URL) goes
    const three = await caches.open(CACHE_THREE);
    const missing = [];
    for (const u of PRECACHE_THREE) if (!(await three.match(u))) missing.push(u);
    await three.addAll(missing.map(u => new Request(u, { cache: "reload" })));
    const want = new Set(PRECACHE_THREE.map(u => new URL(u, self.location).href));
    for (const r of await three.keys()) if (!want.has(r.url)) await three.delete(r);
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
    // the previous src cache kept is a complete one (with its marker): an unfinished install's cache is useless to an old page
    const complete = [];
    for (const n of names.filter(x => kindOf(x) === "src")) if (await isComplete(n)) complete.push(n);
    complete.slice(-(KEEP - 1)).forEach(n => keep.add(n));
    names.filter(n => kindOf(n) === "assets").slice(-(KEEP - 1)).forEach(n => keep.add(n));
    // three.js: only the vendored caches (bebebe-three-r<REVISION>, SPEC-025) are kept; the old jsDelivr one goes
    names.filter(n => kindOf(n) === "three" && n.startsWith(CACHE_PREFIX + "three-r")).slice(-(KEEP - 1)).forEach(n => keep.add(n));
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
  } else if (local && url.pathname.includes("/src/")) {
    // an unversioned module URL (no ?v=; the shell never asks for one): the network only — never a cached copy of some other
    // version (no ignoreSearch fallback across caches), so a page cannot mix module versions
    return;
  } else if (local && url.pathname.includes("/vendor/")) {
    // the vendored three.js (versioned URLs from the import map): cache-first from the cache the install filled; never written
    // at runtime (a URL the install did not cache comes from the network)
    event.respondWith(cacheFirst(event, req, null));
  } else if (local && url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(event, req, CACHE_ASSETS));
  } else if (local && url.pathname.includes("/icons/")) {
    event.respondWith(cacheFirst(event, req, null));
  } else {
    // everything else (the manifest, an unversioned file): network, our caches as the fallback; nothing written
    event.respondWith(networkFirst(event, req, null, null, () => caches.match(req, MATCH)));
  }
});
