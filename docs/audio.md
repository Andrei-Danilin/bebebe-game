# Sound and music (SPEC-047)

Every game event plays a real cartoon sound; the result screens have jingles; the menus, the map and every world have music. The sounds
and the tracks were made by Andrei and the kids (`audio/src/SOURCES.md`); the mapping — which sound plays when, the levels, the crossfades —
is Claude's, and the kids may change it after listening (`gain` below, `LOOK.AUDIO`). A missing or broken file never breaks the game: that
sound plays its old synth beep (or nothing, if it has none).

## Where the files are

| Folder | What | In git |
|---|---|---|
| `audio/wav/` | the WAV masters, on Andrei's machine only | **never** (gitignored) |
| `audio/src/` | MP3 320 kbps copies of the masters, 48 kHz stereo, + `SOURCES.md` (which tool made each file) | yes; the pipeline reads these, never `audio/wav/`, never writes there |
| `scripts/audio.json` | one entry per source: `name`, `kind`, `gain` (dB, default 0) | yes |
| `assets/audio/` | the game's files (`<name>.mp3`) + `manifest.json` `{ files: [{ name, kind, file, dur, bytes, loop, srcHash }] }` | yes (CI never needs ffmpeg) |
| `sw.js` | the block `// audio:start … // audio:end`: `AUDIO_HASH`, `TRACKS_HASH`, `PRECACHE_AUDIO` | yes, written by `npm run audio` |

## The pipeline: `npm run audio`

`scripts/audio.js` needs **ffmpeg on PATH** (it says so and stops when it is missing). It decodes each source (f32 PCM at 44.1 kHz), does the analysis
in Node (silence, peaks, RMS, the ending fade) and encodes with a fixed ffmpeg setup (no metadata, no ID3, bitexact), so a re-run changes no byte: a
source whose `srcHash` (source bytes + its config entry + the processing version + for a jingle `AUDIO.JINGLE_MAX`) is unchanged is skipped. It writes
`assets/audio/*.mp3`, `manifest.json` and the sw.js audio block, prints a table (name, kind, length before and after, peak, RMS, LUFS for music,
size) and warns about a sound longer than 2.5 s, a music cut of more than 15 s, a file with no config entry and an entry with no file.
`--force` makes everything again.

| Kind | Files | What it does | Encoded |
|---|---|---|---|
| `sfx` | the one-shots | mono; silence under −50 dBFS trimmed (10 ms kept before, 30 ms after), 20 ms fade-out; peak −3 dBFS + `gain` | 96 kbps, 44.1 kHz |
| `loop` | `rescue_loop`, `run_steps`, `tiptoe_steps`, `dizzy`, `danger_tick` | mono, not trimmed; a 50 ms equal-power crossfade of the tail into the head is baked in (no click at the seam); peak −3 dBFS + `gain` | 96 kbps |
| `jingle` | `win`, `lose`, `boss_sting`, `world_open` | stereo, silence trimmed; longer than `AUDIO.JINGLE_MAX` (5 s) is cut with a 0.5 s fade-out; peak −2 dBFS + `gain` | 112 kbps |
| `music` | `theme`, `world_field`, `world_city`, `world_school`, `world_beach`, `world_winter`, `boss`, `story` | stereo; **the ending fade is cut** (in the last 20 s, the first point where the 1 s RMS falls 6 dB under the track's median and stays under); two-pass `loudnorm` to −18 LUFS (+ `gain`), true peak −1.5 dBTP | 112 kbps, 44.1 kHz |
| `song` | `theme_song` | like `music`, nothing is cut (it plays once, to the end) | 112 kbps |

Measured on the shipped MP3s the music is −18.4 LUFS (ffmpeg's loudnorm reads 0.4 LU under its target; the test allows ±1 LU).

Budgets (`LOOK.AUDIO`, tested in `tests/audio/manifest.test.mjs`): a sound or loop ≤ 60 KB, a jingle ≤ 120 KB, a music track ≤ 1.8 MB, all of
`assets/audio/` ≤ 13 MB (now 10.4 MB), what the service worker precaches ≤ `AUDIO.PRECACHE_MAX` 3.5 MB (now 2.9 MB). `assets/audio/` is not counted in the art budget.

### Add or replace a sound

1. Make the WAV and keep it in `audio/wav/` (gitignored — never `git add` it).
2. Export an MP3 320 kbps into `audio/src/<name>.mp3` (a replaced sound: the same name).
3. A new one: a line in `scripts/audio.json` (`{ "name": "…", "kind": "sfx", "gain": 0 }`); a new name also needs its place in the game (an `emit("sfx", { name })` in the core
   or a `playSound("name")` in the client, and a row in the tables below). `npm run audio` fails the node tests if a source has no entry.
4. `npm run audio` (ffmpeg on PATH). Look at the table and the warnings.
5. Commit `audio/src/`, `scripts/audio.json`, `assets/audio/` and `sw.js` together. `npm run test:core` (it runs `tests/audio/`) fails on a stale manifest or sw.js block, a budget or an
   event name with no file and no beep.

### Tuning with `gain`

`gain` is dB per file in `scripts/audio.json`, default 0. For sounds, loops and jingles it moves the peak target (−3 / −2 dBFS + `gain`; the tool warns when a
gain pushes a peak over −0.1 dBFS); for music and the song it moves the loudness target (−18 LUFS + `gain`). Change it after listening, run `npm run audio`
(only that file is made again) and commit. The bus levels (`MASTER`, `MUSIC_MENU`, `MUSIC_PLAY`, `MUSIC_PAUSE`, `OTHERS`, the dip) are in `LOOK.AUDIO`
(`src/client/look.js`, `docs/game-design.md` numbers).

## The engine (`src/client/audio/`)

- `engine.js`: the one `AudioContext` (made on the first gesture; nothing exists before) and its buses master (`MASTER` 0.8) → music bus + sfx bus. On iPhone
  `navigator.audioSession.type = "ambient"` is set when the engine starts, so the silent switch mutes the game.
- `sfx.js`: the sounds, loops and jingles are decoded `AudioBuffer`s, loaded after the first gesture (manifest → sounds and loops → jingles). At most `AUDIO.MAX_VOICES` (8) one-shots at
  once (the oldest voice that has STARTED is stopped, its log entry marked `stolen`; a scheduled voice — the win screen's stars and coins — does not count until it starts and is never stolen), the same sound not twice within `AUDIO.RETRIGGER` (0.05 s; the coin: one per 0.06 s). A sound that is not loaded (yet), failed to load or to decode
  asks its beep from `sound.js` (`SYNTH_OF`; none for the new sounds without an old beep). A sound from a slot that is not on this device — a bot, **Dad**, a friend online — plays at `AUDIO.OTHERS` (0.7; the spec read literally: check with the kids): the core puts the actor's `slot` on the event (a Little One's slot, `"big"` for Dad) and the client (`sound.js` `isOther`) decides from its own player slots; Dad's dizzy loop is at `OTHERS` too (`LOOK.AUDIO.OTHER_LOOPS`). A sound that starts later than its event (the fall after a push) has its delay in `LOOK.AUDIO.DELAY` (by name). A loop buffer's ends under
  −60 dBFS (the decoder's padding) stay outside `loopStart` / `loopEnd`, so a looped buffer has no gap. Nothing plays in sim mode; the requests are counted for the sim test.
- `music.js`: music is **streamed, never decoded**: a track is two `HTMLAudioElement`s through `MediaElementSource`s (taken from a **pool** of `AUDIO.POOL` elements and reused for every track; only `src` changes). iOS plays only elements a gesture has started, and counts only a release (pointerup, touchend, a key), not the touch: so **every** gesture calls `unlockMusic`, which plays each element not yet unlocked once — the free ones with an empty file, the standby of a playing track muted — and a refused one is tried again at the next gesture; B starts under A's last `AUDIO.LOOP_XFADE` (2 s) and the two cross over
  equal-power (the loop point is the manifest `dur`). Screens crossfade over `AUDIO.SCREEN_XFADE` (1 s); the same track goes on across screens. A track not loaded yet (or failed, or
  offline and never cached) plays `theme`; a failed track is loaded again after `AUDIO.MUSIC_RETRY` s (or the next time that world is entered); a world with no track in the manifest plays `theme` and asks for no file. A `play()` that the browser refuses (iOS outside a gesture) never leaves the music stopped: every gesture plays again what should be playing (`nudgeMusic`), a refused loop crossfade is taken back (the track goes on, the other element is tried again), a context `interrupted` by a call pauses the music and the next gesture resumes it. Bus: `MUSIC_MENU` 0.7 in menus, `MUSIC_PLAY` 0.35 in play, `MUSIC_PAUSE` 0.25 in pause; it dips to 0.1 under a jingle and returns over 0.5 s.
- `sound.js` is the single entry point: flow, fx, main and debug use the audio only through the names it exports. It keeps `initAudio` / `suspendAudio`, the synth beeps (only the fallback now), `playSound(name, { delay, gain, other, tag })`, `isOther(slot)`, `clickSound`, `winCountSounds` and `audioTick()` — **the one owner of the per-frame work** (main.js calls it every frame: `musicTick`, and `setLoops(wantedLoops(localSlots))` in play, none outside it; a failure is logged once and never stops the frame).

### Which track plays where (Andrei's decision for `theme`, `theme_song` and the covers; the rest Claude's)

| Screen | Track |
|---|---|
| home, level map, level card, character, grown-ups, language | `theme` |
| a level in the Park | `theme` |
| a level in Field / City / School / Beach / Winter | `world_field` / `world_city` / `world_school` / `world_beach` / `world_winter` |
| level 20 of any world | `boss` |
| How to play, the tutorial pictures and both practice games, Story chapters, "How it began", the cards before a boss or a bonus world | `story` |
| "How it all ended" and the thanks card | `theme_song`, once, to the end; then `theme` (a new visit plays it again) |
| win / lose screens | the level's track, dipped under the jingle |

### Which sound plays when (Claude's mapping; the core emits `{ type: "sfx", name, slot? }` in `g.fx`, so online play gets the same events)

| Event | Sound | Where |
|---|---|---|
| hug (1 heart) / with mittens (power ≥ 2) | `hug` / `hug_mega` | core (`rules.js`; `slot` = the hugger's) |
| Dad pushes a kid / the grumpiest dad's wide push | `push` (+ `growl` on every 3rd push of a level, `CFG.SFX_GROWL_EVERY`) / `wide_push` | core |
| the pushed kid sits down | `fall` (the pushed kid's slot), 0.25 s after the push (`LOOK.AUDIO.DELAY.fall`, applied by the client) | core |
| a friend is helped up | `rescue` | core |
| while a player helps one who lies | `rescue_loop` (loop) | core query `wantedLoops` |
| a kid goes home to rest | `out` | core |
| Dad sees a kid / hears steps and turns | `alert` / `heard` | core |
| Dad becomes kind (0 hearts), before the win jingle | `kind` | core |
| boots / cloak / shield picked up | `boots` / `cloak` / `pickup` | core (`slot` = the kid's) |
| the shield stops a push | `shield` | core |
| Dad slips on a banana (or a melon) / lies there | `slip` / `dizzy` (loop) | core / `wantedLoops` |
| a kiss thrown / a kiss hits | `kiss` / `kiss_hit` | core |
| a rescue kit used | `kit` | core |
| a bonus star picked up | `star` | core |
| thrown out of Dad's house / a player inside it | `thrown_out` / `danger_tick` (loop) | core / `wantedLoops` |
| a player running / tiptoeing within `HEAR_RADIUS` of Dad | `run_steps` / `tiptoe_steps` (loops) | `wantedLoops` |
| win | `win` jingle | core |
| lose | `lose` jingle — the game has no loss today (the lose screen is only opened by tests), `setMode("lose")` plays it | client |
| the win screen: each star / each coin | `star_1`…`star_3` / `coin` — **in sound only**: the screen shows the numbers at once, so `winCountSounds` schedules them after `AUDIO.WIN_COUNT.start` 0.9 s, a star every 0.45 s, then a coin every 0.07 s (at most 12); leaving the screen cancels the rest | client |
| a button / back or close / a comic page, a tab, a chapter | `tap` / `back` / `page` (`clickSound`; Enter and the pad's A on a menu button also `tap`) | client |
| bought / not enough coins or a locked level | `buy` / `nope` | client |
| a level opens on the map / a new world opens | `unlock` / `world_open` | client |
| the card before a boss | `boss_sting` | client |

Sounds with no file keep their synth beeps: `munch`, `kick`, `bonk`, `whee`, `freeze`, and the tricks' `bell`, `sprinkler`, `truck`, `wave`, `crunch`, `splash` (SPEC-042 / 043).
A banana is never picked up by a kid (only Dad slips on it), so the banana `pickup` of the spec has no source.

**The loop protocol.** Loops are not events but a pure query of the game state, `wantedLoops(localSlots?)` in `src/core/soundloops.js` (no rng, nothing written; `[]` outside play):
`rescue_loop` — a *player* (not a bot) stands by a kid who lies; `dizzy` — Dad lies; `danger_tick` — a player is inside Dad's house; `run_steps` / `tiptoe_steps` — a player runs / tiptoes
within `HEAR_RADIUS` of Dad. `sound.js` `audioTick` asks it every frame (the players of this device as `localSlots`) and `sfx.js` `setLoops(names)` starts the loops that came and stops the ones that went (a fade of 50 ms); `audioTick` stops them
all outside play. Loops are not counted in the 8 voices.

## Switches, save, background

- **Music** and **Sounds** switches: the 🎵 and 🔊 buttons in the corner of the home screen (`home:music`, `home:sound`; the sound one has art icons, the music one is an emoji button
  until the kids draw one, crossed out when off), keys `N` (music) and `M` (sounds), and two buttons on the grown-ups page (texts `musicOn` / `musicOff` / `soundsOn` / `soundsOff`).
  The music switch stops the track (it fades out and the elements are let go); the sounds switch stops sounds and loops.
- **Save:** `bebebe-save` gets `settings: { music, sfx }` (default on; written only once a switch is touched). A device setting like `quality`: the parents' code does not carry it, a restore keeps
  this device's. An old save with `muted: true` and no `settings` turns both off (its `muted` is written back unchanged); settings written by a later version keep their other keys.
- **Background or a call:** `suspendAudio` pauses the music elements and suspends the context; the first gesture plays both again. A hidden tab never starts music.

## Offline (`sw.js`, SPEC-039's naming: the build and the content, never the semver)

- `bebebe-b<SW_BUILD>-audio-<AUDIO_HASH>`: `assets/audio/manifest.json` + every sound, loop and jingle + `theme` and `story` (`AUDIO.PRECACHE_KINDS`, `AUDIO.PRECACHE_MUSIC`), cached at install, one by one.
  `AUDIO_HASH` is the hash of the whole manifest text: a changed sound makes installed apps fetch the audio again, a code deploy does not.
- `bebebe-b<SW_BUILD>-tracks-<TRACKS_HASH>`: the other tracks (a world's music, `boss`, `theme_song`), made on first use. A track that is not cached is fetched **whole**, stored whole (a 200; a 206 is
  never stored) and the page's `Range` request is answered with a correct 206 slice cut from the whole file. Offline and never played: the fetch fails and the game stays on `theme`.
- Both are kept like the sprites' (the last two). The online origin is still never cached.

## For the tests

`__bb.audio` = `{ log, track, music, levels, loaded, failed, loops, voices, settings, musicPaused, loopRegion, seekMusic }` (`docs/architecture.md`). Tests: `tests/audio/*.test.mjs` (Node, in `npm run test:core`:
the manifest and sw.js block are fresh, budgets, event names, the pipeline's DSP and, where ffmpeg exists, encode / loudnorm / a whole build), `tests/core/sfx-events.test.mjs` (the core's events and loops),
and Playwright: `audio.spec.js` (engine, sounds), `music.spec.js`, `switches.spec.js`, `audio-offline.spec.js`, `perf.spec.js` (no music AudioBuffer).
