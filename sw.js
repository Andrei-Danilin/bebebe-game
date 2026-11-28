// Service worker of BeBeBe Atrapar: the installed app keeps working offline after the first open.
// SPEC-011 AC 9: three caches, so a code deploy re-downloads no sprites and a sprite-only deploy no code (an install finds the
// complete src cache of its SRC_HASH and keeps it):
//   bebebe-b<SW_BUILD>-src-<SRC_HASH>     the shell (index.html, manifest, icons) + the game's ES modules, written only at install
//                                   (plus the shell rule below); complete when its "installed" marker is there;
//   bebebe-b<SW_BUILD>-assets-<ASSETS_HASH>  the art sprites (assets/, listed by npm run assets);
//   bebebe-b<SW_BUILD>-audio-<AUDIO_HASH>    SPEC-047: the sounds, loops, jingles and the music of the menus (assets/audio/, listed by npm run audio:
//                                   every sound + theme + story + manifest.json), written at install, one by one;
//   bebebe-b<SW_BUILD>-tracks-<TRACKS_HASH>  SPEC-047: the other tracks (a world's music, boss, theme_song), stored whole the first time they play;
// SPEC-039: the two names carry the build counter and the content hash, never the game's semver: a release (SW_VERSION changes, the
// files do not) finds both caches complete and downloads nothing but index.html and this worker.
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
const SW_BUILD = 13;
const SW_STRATEGY = "3d1b3b7316";
const SW_VERSION = "bebebe-1.0.0-dev-b13";
const SRC_HASH = "4e9b0200de";
const PRECACHE_LOCAL = [
  "./", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512-maskable.png",
  "./icons/icon-512.png", "./icons/icon.svg", "./index.html", "./manifest.webmanifest"
];
const PRECACHE_SRC = [
  "./src/client/adaptive.js?v=5487878407", "./src/client/art-names.js?v=53a55ace1a",
  "./src/client/art.js?v=49ea34aa3b", "./src/client/audio/engine.js?v=f0713c3094",
  "./src/client/audio/music.js?v=bdf6f33945", "./src/client/audio/sfx.js?v=6073da3a31",
  "./src/client/back.js?v=2bbaab7f17", "./src/client/cadence.js?v=6fc971a515", "./src/client/debug.js?v=6af1038680",
  "./src/client/devices.js?v=892965ff6f", "./src/client/errors.js?v=7b215fb847", "./src/client/flow.js?v=36a035466c",
  "./src/client/fx.js?v=3bceabb270", "./src/client/input.js?v=0d1c1d6f7d", "./src/client/lifecycle.js?v=42d6c088ba",
  "./src/client/look.js?v=972228b68e", "./src/client/main.js?v=ce3efc8448", "./src/client/names.js?v=dff85cded6",
  "./src/client/outfits.js?v=892a6a1d6e", "./src/client/perf.js?v=2462f1b4ae", "./src/client/ports.js?v=4285602733",
  "./src/client/preview-data.js?v=89f11bb2ea", "./src/client/progress.js?v=38515d7fe6",
  "./src/client/quality.js?v=1fa1c771b3", "./src/client/reset.js?v=30ccdd527d", "./src/client/save.js?v=21615d74c2",
  "./src/client/screen-art.js?v=429205bdcf", "./src/client/screen.js?v=576f0ce0af",
  "./src/client/shop.js?v=df2d3c5976", "./src/client/sound.js?v=051468fce6", "./src/client/state.js?v=40bafb3017",
  "./src/client/storage.js?v=686b11f06c", "./src/client/three/batch.js?v=72814fddc1",
  "./src/client/three/bosses.js?v=7814dfb8d4", "./src/client/three/camera.js?v=cd37d1af9d",
  "./src/client/three/characters.js?v=cdf38dba20", "./src/client/three/housekit.js?v=c97a1bd9fd",
  "./src/client/three/houses-worlds.js?v=43e7dca263", "./src/client/three/houses.js?v=5d21b8a0b2",
  "./src/client/three/look3d.js?v=137477ce46", "./src/client/three/map3d.js?v=2a90b55a5b",
  "./src/client/three/mapstate.js?v=df23bf049c", "./src/client/three/materials.js?v=b97d638913",
  "./src/client/three/pools.js?v=a68f4e4b14", "./src/client/three/previews.js?v=230afb25d5",
  "./src/client/three/setup.js?v=3cb458f3c6", "./src/client/three/sync.js?v=5fb10ceeef",
  "./src/client/three/themes.js?v=4b130c3f66", "./src/client/three/tier.js?v=0819009bb3",
  "./src/client/three/tricks3d.js?v=de4707be70", "./src/client/three/worlditems3d.js?v=835df12333",
  "./src/client/tutorial-data.js?v=d7936119e6", "./src/client/tutorial.js?v=d366f16b03",
  "./src/client/ui/artdraw.js?v=33befe7bde", "./src/client/ui/buttons.js?v=67b41b2f83",
  "./src/client/ui/canvas.js?v=697f7d0db5", "./src/client/ui/character/items.js?v=2ff7462142",
  "./src/client/ui/character/progress.js?v=46b61d937e", "./src/client/ui/character/tabs.js?v=bd6c90ad68",
  "./src/client/ui/character/upgrades.js?v=5358a5860d", "./src/client/ui/character/wardrobe.js?v=83a8b8206a",
  "./src/client/ui/draw.js?v=bf0f14335f", "./src/client/ui/grownups.js?v=6ebdf23b79",
  "./src/client/ui/home.js?v=943aa709ec", "./src/client/ui/hud.js?v=70f6bf225f",
  "./src/client/ui/lang.js?v=568a4dc213", "./src/client/ui/layout.js?v=3b896f397d",
  "./src/client/ui/level-preview.js?v=698fb9c64c", "./src/client/ui/map.js?v=defbdd0b3e",
  "./src/client/ui/measure.js?v=7c174e9035", "./src/client/ui/menu.js?v=5cdc85b5f1",
  "./src/client/ui/minimap.js?v=e900bbfee9", "./src/client/ui/paper.js?v=c25342da07",
  "./src/client/ui/phone.js?v=b0a8ca849b", "./src/client/ui/screens.js?v=e98bfff809",
  "./src/client/ui/story.js?v=75064c20fa", "./src/client/ui/text.js?v=fe5b98f9e4",
  "./src/client/ui/tip.js?v=e481814678", "./src/client/ui/win.js?v=f1b1933411", "./src/client/update.js?v=e702121a73",
  "./src/client/warm.js?v=6a2d57b991", "./src/core/active.js?v=70aa836ebd", "./src/core/autopilot.js?v=6895dd7bfd",
  "./src/core/big.js?v=608f5e2f6f", "./src/core/bots.js?v=32defc7e5b", "./src/core/config.js?v=4c133730b0",
  "./src/core/difficulty.js?v=72aff2bd1e", "./src/core/economy.js?v=e3d6023dec", "./src/core/events.js?v=ad8c019d6e",
  "./src/core/game.js?v=0d95287186", "./src/core/grid.js?v=a38c7b977b", "./src/core/hearing.js?v=f5acc0f0ca",
  "./src/core/hooks.js?v=5ceea54c61", "./src/core/index.js?v=0efe704e7d", "./src/core/kindwalk.js?v=71745973b0",
  "./src/core/level/build.js?v=3d663d2628", "./src/core/level/generate.js?v=455b2ff4e4",
  "./src/core/level/layouts.js?v=07d6472d8e", "./src/core/level/load.js?v=d7e6940cc5",
  "./src/core/level/report.js?v=a2d244a0ab", "./src/core/level/validate.js?v=5137b0bd7a",
  "./src/core/mood.js?v=65a5548f9d", "./src/core/path.js?v=3b439f4444", "./src/core/practice.js?v=807c98cf2e",
  "./src/core/progress-rules.js?v=7c34b4f903", "./src/core/rules.js?v=ca1bb0b29f",
  "./src/core/soundloops.js?v=e0783ba66c", "./src/core/tricks/aware.js?v=d70aa68ca3",
  "./src/core/tricks/bell.js?v=d44f4fab96", "./src/core/tricks/footprints.js?v=0a24914236",
  "./src/core/tricks/index.js?v=bd87555130", "./src/core/tricks/kit.js?v=d7fcfb99ab",
  "./src/core/tricks/puddles.js?v=18cc245880", "./src/core/tricks/query.js?v=f5070ac764",
  "./src/core/tricks/sprinklers.js?v=d0d67dc091", "./src/core/tricks/truck.js?v=6da8d905c4",
  "./src/core/tricks/waves.js?v=2bc3aa5809", "./src/core/util.js?v=b56133239e", "./src/core/vision.js?v=17866d5575",
  "./src/core/wardrobe.js?v=011be2182f", "./src/core/world.js?v=7ffe232fac", "./src/core/worlditems.js?v=247983d670",
  "./src/i18n.js?v=f50020a150", "./src/story.js?v=d4c2c3d810"
];
const THREE_VERSION = "r187";
const PRECACHE_THREE = [
  "./vendor/three/three.core.js?v=60880f0fd0", "./vendor/three/three.module.js?v=49bfc58c40"
];
// precache:end
// SPEC-020: written by npm run assets (scripts/assets.js) — do not edit by hand
// assets:start
const ASSETS_HASH = "068e87308196";
const PRECACHE_ASSETS = [
  "./assets/main_tile.webp", "./assets/menu_bg.webp", "./assets/map_bg_park.webp", "./assets/map_bg_field.webp",
  "./assets/map_bg_city.webp", "./assets/map_bg_school.webp", "./assets/map_bg_beach.webp",
  "./assets/map_bg_winter.webp", "./assets/story_start.webp", "./assets/tutorial_a.webp", "./assets/howto_card.webp",
  "./assets/tutorial_b.webp", "./assets/tutorial_c.webp", "./assets/story_park.webp", "./assets/story_field.webp",
  "./assets/story_city.webp", "./assets/story_school.webp", "./assets/story_beach.webp", "./assets/story_winter.webp",
  "./assets/story_end.webp", "./assets/story_win.webp", "./assets/logo.webp", "./assets/icon_shield.webp",
  "./assets/icon_bandaid.webp", "./assets/icon_cupcake.webp", "./assets/icon_angry_heart.webp",
  "./assets/icon_pause.webp", "./assets/icon_sound.webp", "./assets/btn_green.webp", "./assets/btn_pink.webp",
  "./assets/btn_orange.webp", "./assets/btn_grey.webp", "./assets/round_play.webp", "./assets/round_pause.webp",
  "./assets/round_sound.webp", "./assets/round_restart.webp", "./assets/cloud_heart_full.webp",
  "./assets/cloud_heart_half.webp", "./assets/cloud_heart_fading.webp", "./assets/cloud_heart_empty.webp",
  "./assets/coin_badge.webp", "./assets/ribbon_star.webp", "./assets/house_messy.webp", "./assets/house_kids.webp",
  "./assets/house_park_kids.webp", "./assets/house_field_kids.webp", "./assets/house_city_kids.webp",
  "./assets/house_school_kids.webp", "./assets/house_park_dad.webp", "./assets/house_field_dad.webp",
  "./assets/house_city_dad.webp", "./assets/house_school_dad.webp", "./assets/house_beach_kids.webp",
  "./assets/house_winter_kids.webp", "./assets/house_beach_dad.webp", "./assets/house_winter_dad.webp",
  "./assets/stop_empty.webp", "./assets/stop_current.webp", "./assets/stop_locked.webp", "./assets/stop_boss.webp",
  "./assets/star_gold.webp", "./assets/star_empty.webp", "./assets/stamp_done.webp", "./assets/padlock.webp",
  "./assets/world_park.webp", "./assets/world_field.webp", "./assets/world_city.webp", "./assets/world_school.webp",
  "./assets/world_beach.webp", "./assets/world_winter.webp", "./assets/ui_play.webp", "./assets/ui_back.webp",
  "./assets/ui_home.webp", "./assets/ui_story.webp", "./assets/ui_bag.webp", "./assets/ui_gear.webp",
  "./assets/ui_sound_on.webp", "./assets/ui_sound_off.webp", "./assets/ui_fullscreen.webp", "./assets/ui_globe.webp",
  "./assets/ui_coin.webp", "./assets/ui_gift.webp", "./assets/ui_puddle.webp", "./assets/ui_sprinkler.webp",
  "./assets/ui_truck.webp", "./assets/ui_bell.webp", "./assets/ui_wave.webp", "./assets/item_football.webp",
  "./assets/item_paperplane.webp", "./assets/ui_snowprints.webp", "./assets/item_watermelon.webp",
  "./assets/item_snowball.webp", "./assets/tips_main.webp", "./assets/tips_bonus.webp", "./assets/shop_fast_feet.webp",
  "./assets/shop_long_items.webp", "./assets/shop_quick_help.webp", "./assets/shop_wardrobe.webp",
  "./assets/shop_items.webp", "./assets/shop_upgrades.webp", "./assets/hat_cap.webp", "./assets/hat_beanie.webp",
  "./assets/hat_crown.webp", "./assets/hat_bow.webp", "./assets/hat_flower.webp", "./assets/hat_ears.webp",
  "./assets/hat_headband.webp", "./assets/hat_tophat.webp", "./assets/hat_viking.webp", "./assets/hat_pirate.webp",
  "./assets/hat_glasses.webp", "./assets/jacket_blue_zip.webp", "./assets/jacket_hoodie.webp",
  "./assets/jacket_stripes.webp", "./assets/jacket_red_zip.webp", "./assets/jacket_cape.webp",
  "./assets/jacket_trench.webp", "./assets/pants_shorts.webp", "./assets/pants_jeans.webp",
  "./assets/pants_striped.webp", "./assets/pants_overalls.webp", "./assets/pants_joggers.webp",
  "./assets/fx_burst_yellow.webp", "./assets/fx_burst_red.webp", "./assets/fx_burst_pink.webp",
  "./assets/fx_steam_left.webp", "./assets/fx_steam_right.webp", "./assets/fx_storm_cloud.webp",
  "./assets/fx_stink.webp", "./assets/fx_dizzy.webp", "./assets/fx_hearts.webp", "./assets/fx_speed.webp",
  "./assets/fx_dust.webp", "./assets/fx_sparkle.webp", "./assets/fx_bandaid.webp", "./assets/fx_confetti.webp",
  "./assets/phone_kiss.webp", "./assets/phone_kit.webp", "./assets/phone_stick_base.webp", "./assets/phone_pause.webp",
  "./assets/phone_stick_knob.webp", "./assets/menu_play.webp", "./assets/menu_story.webp",
  "./assets/menu_character.webp", "./assets/tab_progress.webp", "./assets/jacket_tshirt.webp",
  "./assets/jacket_orange_stripes.webp", "./assets/jacket_purple_zip.webp", "./assets/jacket_pink_hoodie.webp",
  "./assets/jacket_teal_zip.webp", "./assets/jacket_hero_cape.webp", "./assets/jacket_ninja.webp",
  "./assets/jacket_sailor.webp", "./assets/jacket_raincoat.webp", "./assets/hat_ninja.webp",
  "./assets/pants_black.webp", "./assets/pants_red.webp", "./assets/pants_green.webp",
  "./assets/pants_pink_shorts.webp", "./assets/pants_purple.webp", "./assets/ui_friends.webp", "./assets/ui_dice.webp",
  "./assets/ui_question.webp", "./assets/ui_pencil.webp", "./assets/ui_pack.webp", "./assets/ui_ear.webp",
  "./assets/ui_map.webp", "./assets/ui_check.webp", "./assets/ui_cross.webp", "./assets/ui_hug.webp",
  "./assets/ui_sleep.webp", "./assets/ui_alert.webp", "./assets/ui_flag.webp", "./assets/ui_eyes.webp",
  "./assets/ui_timer.webp", "./assets/ui_tiptoe.webp", "./assets/item_boots.webp", "./assets/item_cape.webp",
  "./assets/item_banana.webp", "./assets/item_mittens.webp", "./assets/item_mega_mittens.webp",
  "./assets/item_kiss.webp", "./assets/item_star.webp", "./assets/item_coin.webp", "./assets/heart_full.webp",
  "./assets/heart_half.webp", "./assets/heart_empty.webp"
];
// assets:end
// SPEC-047: written by npm run audio (scripts/audio.js) — do not edit by hand
// audio:start
const AUDIO_HASH = "b39d5f091b10";
const TRACKS_HASH = "e0fe325a3773";
const PRECACHE_AUDIO = [
  "./assets/audio/manifest.json", "./assets/audio/alert.mp3", "./assets/audio/back.mp3", "./assets/audio/boots.mp3",
  "./assets/audio/boss_sting.mp3", "./assets/audio/buy.mp3", "./assets/audio/cloak.mp3", "./assets/audio/coin.mp3",
  "./assets/audio/danger_tick.mp3", "./assets/audio/dizzy.mp3", "./assets/audio/fall.mp3", "./assets/audio/growl.mp3",
  "./assets/audio/heard.mp3", "./assets/audio/hug.mp3", "./assets/audio/hug_mega.mp3", "./assets/audio/kind.mp3",
  "./assets/audio/kiss.mp3", "./assets/audio/kiss_hit.mp3", "./assets/audio/kit.mp3", "./assets/audio/lose.mp3",
  "./assets/audio/nope.mp3", "./assets/audio/out.mp3", "./assets/audio/page.mp3", "./assets/audio/pickup.mp3",
  "./assets/audio/push.mp3", "./assets/audio/rescue.mp3", "./assets/audio/rescue_loop.mp3",
  "./assets/audio/run_steps.mp3", "./assets/audio/shield.mp3", "./assets/audio/slip.mp3", "./assets/audio/star.mp3",
  "./assets/audio/star_1.mp3", "./assets/audio/star_2.mp3", "./assets/audio/star_3.mp3", "./assets/audio/story.mp3",
  "./assets/audio/tap.mp3", "./assets/audio/theme.mp3", "./assets/audio/thrown_out.mp3",
  "./assets/audio/tiptoe_steps.mp3", "./assets/audio/unlock.mp3", "./assets/audio/wide_push.mp3",
  "./assets/audio/win.mp3", "./assets/audio/world_open.mp3"
];
// audio:end
const srcCacheName = hash => CACHE_PREFIX + "b" + SW_BUILD + "-src-" + hash;   // SPEC-039: no semver in the name
const CACHE_SRC = srcCacheName(SRC_HASH);
const CACHE_ASSETS = CACHE_PREFIX + "b" + SW_BUILD + "-assets-" + ASSETS_HASH;
const CACHE_AUDIO = CACHE_PREFIX + "b" + SW_BUILD + "-audio-" + AUDIO_HASH;       // SPEC-047: named by the content, like the sprites: a changed sound is fetched again, the code is not
const CACHE_TRACKS = CACHE_PREFIX + "b" + SW_BUILD + "-tracks-" + TRACKS_HASH;
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
    // the sounds: one by one, a missing file never blocks the install (it plays its beep; the music stays on what is there)
    const audio = await caches.open(CACHE_AUDIO);
    await Promise.all(PRECACHE_AUDIO.map(async u => { if (!(await audio.match(u))) await audio.add(new Request(u, { cache: "no-cache" })).catch(() => {}); }));
    await self.skipWaiting();
  })());
});

// SPEC-038 AC 5: the page's "new version" note: a waiting worker takes over when the page asks (it also skips waiting on its own
// at the end of its install; this is for a worker that was left waiting)
self.addEventListener("message", event => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  // the page asks which module set this worker is (the hint shows only for another one than the page runs)
  else if (type === "VERSION" && event.ports && event.ports[0]) event.ports[0].postMessage({ srcHash: SRC_HASH, version: SW_VERSION });
});

// the kind of one of our caches ("src", "assets", "three") or null (an old name: deleted)
const kindOf = name => (/-src-[^-]+$/.test(name) ? "src" : /-assets-[^-]+$/.test(name) ? "assets" : /-audio-[^-]+$/.test(name) ? "audio" : /-tracks-[^-]+$/.test(name) ? "tracks" : name.startsWith(CACHE_PREFIX + "three-") ? "three" : null);
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const mine = [CACHE_SRC, CACHE_ASSETS, CACHE_AUDIO, CACHE_TRACKS, CACHE_THREE];
    const names = (await caches.keys()).filter(n => n.startsWith(CACHE_PREFIX) && !mine.includes(n));   // in creation order
    const keep = new Set();
    // the previous src cache kept is a complete one (with its marker): an unfinished install's cache is useless to an old page
    const complete = [];
    for (const n of names.filter(x => kindOf(x) === "src")) if (await isComplete(n)) complete.push(n);
    complete.slice(-(KEEP - 1)).forEach(n => keep.add(n));
    names.filter(n => kindOf(n) === "assets").slice(-(KEEP - 1)).forEach(n => keep.add(n));
    for (const kind of ["audio", "tracks"]) names.filter(n => kindOf(n) === kind).slice(-(KEEP - 1)).forEach(n => keep.add(n));   // SPEC-047
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
      const hash = srcHashOf(await copy.clone().text()), name = hash && srcCacheName(hash);
      if (name && await isComplete(name)) await (await caches.open(name)).put(request, copy);
    })().catch(() => {});
    try { event.waitUntil(saved); } catch (e) { /* saving goes on anyway */ }
  }
  return response;
}

// SPEC-038 AC 6 (RR-39): on an online start (a navigation the network answered) every precached sprite missing from this version's
// sprite cache (evicted by the browser, or one the install could not fetch) is fetched again, one after the other: a miss never
// blocks anything, one pass runs at a time, and a sprite the server does not have (404) is asked for once per worker lifetime
let repairing = false;
const gone = new Set();
function repairArt(event) {
  if (repairing) return;
  repairing = true;
  const done = (async () => {
    const art = await caches.open(CACHE_ASSETS);
    const have = new Set((await art.keys()).map(r => r.url));
    const missing = PRECACHE_ASSETS.filter(u => !have.has(new URL(u, self.location).href) && !gone.has(u));
    for (const u of missing) {
      try { await art.add(new Request(u, { cache: "no-cache" })); } catch (e) { gone.add(u); }
    }
  })().catch(() => {}).finally(() => { repairing = false; });
  try { event.waitUntil(done); } catch (e) { /* the event is over: the pass goes on anyway */ }
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

// SPEC-047: the sounds and the music. A cached sound (the install's, or a track stored when it first played) answers from the cache; a range request
// (a media element asks for bytes=0- and for every seek) gets a correct 206 slice of the whole cached file. A track that is not cached is fetched WHOLE
// (never as the piece the element asked for), stored whole (a 206 is never stored), and the element's range is cut from it; offline that fetch fails and
// the element reports an error (the game stays on theme). Nothing but our own origin is ever cached.
const rangeOf = (header, size) => {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!m || (!m[1] && !m[2])) return null;                     // not a single range: the whole file answers
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])), end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return { start, end };
};
async function sliceOf(res, header) {
  const bytes = await res.clone().arrayBuffer(), size = bytes.byteLength, r = rangeOf(header, size);
  if (!r) return res;
  if (r.start > r.end || r.start >= size) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  return new Response(bytes.slice(r.start, r.end + 1), { status: 206, headers: {
    "Content-Type": res.headers.get("Content-Type") || "audio/mpeg", "Content-Length": String(r.end - r.start + 1),
    "Content-Range": "bytes " + r.start + "-" + r.end + "/" + size, "Accept-Ranges": "bytes" } });
}
// the whole-file fetches of tracks not cached yet, by URL: the requests that come together (the element's bytes=0-, the standby's, a seek) share one download.
// `cache: "no-cache"` asks the server (not the HTTP cache), so an old copy of a track never goes into this version's cache
const audioFlights = new Map();
function wholeTrack(event, key) {
  let flight = audioFlights.get(key);
  if (!flight) {
    flight = fetch(key, { cache: "no-cache" }).then(async res => {
      if (res.ok && res.status === 200 && res.type === "basic") await caches.open(CACHE_TRACKS).then(c => c.put(key, res.clone())).catch(() => {});
      return res;
    }).finally(() => audioFlights.delete(key));
    audioFlights.set(key, flight);
    try { event.waitUntil(flight.catch(() => {})); } catch (e) { /* the event is over: the download goes on anyway */ }
  }
  return flight;
}
async function audioFetch(event, req) {
  const key = req.url, range = req.headers.get("range");
  let hit = await (await caches.open(CACHE_AUDIO)).match(key, MATCH);
  if (!hit && await caches.has(CACHE_TRACKS)) hit = await (await caches.open(CACHE_TRACKS)).match(key, MATCH);
  if (hit) return range ? sliceOf(hit, range) : hit;
  const res = (await wholeTrack(event, key)).clone();          // the whole file, whatever the page asked for
  return range && res.status === 200 ? sliceOf(res, range) : res;
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
    const save = (ev, rq, res) => { if (res.ok) repairArt(ev); return atRoot ? rememberShell(ev, rq, res) : res; };   // SPEC-038 AC 6: online → missing sprites back
    event.respondWith(networkFirst(event, req, fallback, save, () => cachedShell(req, fallback)));
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
  } else if (local && url.pathname.includes("/assets/audio/")) {
    event.respondWith(audioFetch(event, req));                  // SPEC-047: before the sprites' rule below
  } else if (local && url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(event, req, CACHE_ASSETS));
  } else if (local && url.pathname.includes("/icons/")) {
    event.respondWith(cacheFirst(event, req, null));
  } else {
    // everything else (the manifest, an unversioned file): network, our caches as the fallback; nothing written
    event.respondWith(networkFirst(event, req, null, null, () => caches.match(req, MATCH)));
  }
});
