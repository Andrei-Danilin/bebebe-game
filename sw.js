// Service worker of BeBeBe Atrapar: the installed app keeps working offline after the first open.
// Bump SW_VERSION when PRECACHE, the three.js version, an icon's content or a cache strategy changes
// (a change to index.html alone needs no bump: it is network-first). The art sprites (assets/) are listed by npm run assets
// below, with a hash of their bytes; the cache is named SW_VERSION + "-" + ASSETS_HASH, so a redrawn sprite gives a new cache
// (the old one is deleted on activate) without a SW_VERSION bump.
const SW_VERSION = "bebebe-v3";
const CACHE_PREFIX = "bebebe-";          // all Pages projects of the account share one origin: touch only our caches
const NET_TIMEOUT_MS = 4000;             // weak signal: after this long, a cached copy wins over a slow network
const THREE_BASE = "https://cdn.jsdelivr.net/npm/three@0.187.0/build/";
const PRECACHE_LOCAL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icons/icon.svg", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png",
  // SPEC-011: the game's ES modules (phase B stopgap; npm run precache writes this list with content hashes, AC 9)
  "./src/client/art-names.js", "./src/client/look.js", "./src/core/config.js", "./src/core/hooks.js",
  "./src/core/util.js", "./src/core/wardrobe.js", "./src/i18n.js", "./src/story.js"
];
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
const CACHE = SW_VERSION + "-" + ASSETS_HASH;
const PRECACHE_THREE = [THREE_BASE + "three.module.js", THREE_BASE + "three.core.js"];
const SCOPE_ROOT = new URL("./", self.location).href;
const MATCH = { ignoreSearch: true, ignoreVary: true };

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE_LOCAL.map(u => new Request(u, { cache: "reload" })));   // the game itself: all or nothing
    await cache.addAll(PRECACHE_THREE.map(u => new Request(u, { mode: "cors" })));
    // the art: one by one, a missing sprite never blocks the install (the game draws it with code)
    await Promise.all(PRECACHE_ASSETS.map(u => cache.add(new Request(u, { cache: "no-cache" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX) && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Keeps a copy of a good response (same-origin or CORS only, never opaque or errors) without delaying the page.
function remember(event, request, response) {
  if (response.ok && (response.type === "basic" || response.type === "cors")) {
    const copy = response.clone();
    const saved = caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
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
  } else if (url.href.startsWith(THREE_BASE) || (local && (url.pathname.includes("/icons/") || url.pathname.includes("/assets/")))) {
    event.respondWith(cacheFirst(event, req));
  } else {
    event.respondWith(networkFirst(event, req, null));       // everything else: network, cache as fallback
  }
});
