# SPEC-047 — Sound and music: real sounds, jingles and music in place of the synth beeps

Status: ready
Complexity: L
Branch: SPEC-047-sound-music
Decided by:
- **Andrei (2026-11-27):**
  - the sounds, jingles and music in `audio/src/` are the ones to use; Andrei and the kids made them from the project's audio brief;
  - **`theme`** plays in the menu, on the level map and in the **Park**; the song **`theme_song`** plays in the **ending** "How it all ended" and on the thanks card;
  - the other worlds' tracks are covers of the theme (same melody);
  - the WAV masters stay in the repository folder `audio/wav/`, which is **gitignored**; `audio/src/` holds MP3 320 kbps copies that are committed.
- Everything else: Claude (spec author). The kids may change volumes and which sound plays where after listening.

## Description
Today every sound is a synth beep (`SFX` in `src/client/sound.js`, 14 beeps) and there is no music. After this spec:
- every game event plays a real cartoon sound;
- the result screens have short jingles (win, lose, boss, a world opening);
- the menu, map and every world have music that changes smoothly between screens and is quieter during play;
- separate **Music** and **Sounds** switches are on the home screen;
- the game stays small: sounds and the theme load at once, a world's track loads the first time that world is played, and everything works offline afterwards;
- a missing or broken file never breaks the game: that sound falls back to its synth beep.

## Goal
- Kids hear what happens without looking: a hug, a push, Dad hearing them, a friend helped up, a banana slip.
- Music never covers the gameplay sounds; nothing is sudden or scary (players are 6–10).
- Pages stay fast: audio loaded at start ≤ `AUDIO.PRECACHE_MAX` (3.5 MB); memory stays inside SPEC-040's budget.

## Context
- `audio/src/*.mp3` (49 files, committed with this spec, MP3 320 kbps, 48 kHz stereo) and `audio/src/SOURCES.md` (which tool made each file).
- `audio/wav/` (gitignored): the same files as WAV masters on Andrei's machine. The pipeline reads `audio/src/`, never `audio/wav/`.
- Code today:
  - `src/client/sound.js`: `initAudio` (first gesture), `suspendAudio` (background, SPEC-025 AC 14), `SFX` beeps, `soundOn()` (counts requests for the sim test);
  - the core emits `{ type: "sfx", name }` effect events (SPEC-012), played by `fx.js` (`SFX[e.name]()`);
  - names used today: `push`, `hug`, `rescue`, `out`, `alert`, `item`, `shield`, `star`, `kiss`, `mwah`, `thrown`, `slip`, `win`, `lose`;
  - the shop and wardrobe call `SFX.item()` after a buy and `SFX.out()` when coins are short;
  - `ui.muted` and the home-screen 🔊/🔇 button (`toggleSound`, key M).
- The art pipeline is the model for this one: `npm run assets`, a config file (`scripts/assets.json`), generated files committed under `assets/`.
- Measured on 2026-11-27 (Claude, from the WAV masters):
  - no real clipping (`slip` 8 samples, `buy` 1);
  - some sounds are quiet (`coin`, `dizzy`, `out`, `run_steps`, `tiptoe_steps`, `hug_mega`);
  - `hug` and `push` have about 1 s of trailing silence, and the jingles up to 1 s;
  - `rescue_loop` clicks at its seam;
  - most music tracks end with a fade-out (last second 12–17 dB below the track);
  - music lengths are 64–117 s.

## Out of scope
- Making new sounds; changing gameplay.
- Online-specific audio (SPEC-013 plays the same events from snapshots).
- A volume slider (only on/off switches here).

## Acceptance criteria
### Pipeline (`npm run audio`)
1. **The tool:**
   - `scripts/audio.js` (Node, ffmpeg from PATH; a clear message if ffmpeg is missing) reads `audio/src/*.mp3` and the config `scripts/audio.json`;
   - it writes `assets/audio/<name>.mp3` and `assets/audio/manifest.json`, with entries `{ name, kind, file, dur, bytes, loop, srcHash }`;
   - `srcHash` is the hash of the source file plus its config entry;
   - generated files are committed, so CI never needs ffmpeg;
   - re-running with unchanged inputs changes nothing.
2. **Kinds** (in `scripts/audio.json`, one entry per file; `gain` in dB per file for tuning after listening, default 0):
   - **`sfx`** (one-shots):
     - mono;
     - leading and trailing silence under −50 dBFS trimmed, keeping 10 ms before and 30 ms after, with a 20 ms fade-out;
     - peak-normalised to −3 dBFS, then `gain`;
     - 96 kbps, 44.1 kHz.
   - **`loop`** (`rescue_loop`, `run_steps`, `tiptoe_steps`, `dizzy`, `danger_tick`):
     - mono, not trimmed;
     - a 50 ms equal-power crossfade baked from the tail into the head, so the seam has no click;
     - peak −3 dBFS, then `gain`;
     - 96 kbps.
   - **`jingle`** (`win`, `lose`, `boss_sting`, `world_open`):
     - stereo, silence trimmed;
     - anything longer than `AUDIO.JINGLE_MAX` (5 s) is cut, with a 0.5 s fade-out;
     - peak −2 dBFS;
     - 112 kbps.
   - **`music`** (`theme`, `world_field`, `world_city`, `world_school`, `world_beach`, `world_winter`, `boss`, `story`):
     - stereo;
     - **the ending fade is cut:** in the last 20 s, the first point where the 1 s RMS falls 6 dB under the track's median RMS and stays under it;
     - two-pass `loudnorm` to −18 LUFS integrated, true peak −1.5 dBTP;
     - 112 kbps, 44.1 kHz.
   - **`song`** (`theme_song`): like `music`, but nothing is cut (it plays once, to the end).
3. **Report:** `npm run audio` prints a table: name, kind, length before and after, peak, RMS, bytes. It warns about:
   - a sound longer than 2.5 s;
   - a music track whose cut removed more than 15 s;
   - a file in `audio/src/` with no config entry, and a config entry with no file.

### The audio engine (client)
4. **Structure:** `src/client/audio/`:
   - `engine.js`: buses master → music and sfx, each with a gain;
   - `sfx.js`: buffers, playing, polyphony;
   - `music.js`: tracks, crossfades, ducking;
   - `src/client/sound.js` keeps `initAudio` / `suspendAudio` and the synth beeps as the fallback.
   Nothing plays in `simMode` (the sim test still counts requests).
5. **Sound effects:**
   - decoded `AudioBuffer`s, loaded after the first gesture (sfx first, then the jingles);
   - at most `AUDIO.MAX_VOICES` (8) at once, the oldest stopped first; the same sound doesn't start twice within `AUDIO.RETRIGGER` (0.05 s);
   - the coin count on the win screen is limited to one `coin` per 0.06 s;
   - a sound that isn't loaded yet, failed to load or failed to decode plays its synth beep (or nothing, if it has none);
   - short loops use `loop = true`, with `loopStart` / `loopEnd` set past the decoder's padding (samples under −60 dBFS at the ends), so a looped buffer has no gap.
6. **Music:**
   - **streamed:** two `HTMLAudioElement`s per track through a `MediaElementAudioSourceNode`, playing alternately with an `AUDIO.LOOP_XFADE` (2 s) equal-power overlap at the loop point, so MP3 padding never makes a gap and no whole track is decoded into memory;
   - between screens the old track fades out and the new one fades in over `AUDIO.SCREEN_XFADE` (1 s); the same track continues across screens without restarting (menu → map → Park level);
   - **music bus levels:** menus `AUDIO.MUSIC_MENU` (0.7), during play `AUDIO.MUSIC_PLAY` (0.35), on pause `AUDIO.MUSIC_PAUSE` (0.25);
   - during a jingle the music dips to 0.1 and comes back over 0.5 s;
   - master gain `AUDIO.MASTER` (0.8).
7. **Which track plays where:**
   | Screen | Track |
   |---|---|
   | home, level map, character, grown-ups, language | `theme` |
   | a level in the Park | `theme` |
   | a level in Field / City / School / Beach / Winter | `world_field` / `world_city` / `world_school` / `world_beach` / `world_winter` |
   | level 20 of any world | `boss` |
   | How to play, tutorial pictures and both practice games, Story chapters, "How it began" | `story` |
   | "How it all ended" and the thanks card | `theme_song`, once, to the end; then `theme` |
   | win / lose screens | the level's track, dipped under the jingle |

   A world's track not yet cached plays `theme` until it has loaded, then crossfades. Offline and never cached, it stays on `theme`.
8. **Which sound plays when** (the core emits `{ type: "sfx", name }`; add missing events in the core, headless, so online play gets them too):
   | Event | Sound |
   |---|---|
   | hug (1 heart) / hug with mittens (power ≥ 2) | `hug` / `hug_mega` |
   | Dad pushes a kid / the grumpiest dad's wide push | `push` (+ `growl` on every 3rd push of a level) / `wide_push` |
   | the pushed kid sits down | `fall`, 0.25 s after the push |
   | a friend is helped up / while a helper stands by | `rescue` / `rescue_loop` (only while a player is helping) |
   | a kid goes home to rest (old `out`) | `out` |
   | Dad sees a kid / Dad hears steps and turns | `alert` / `heard` |
   | Dad becomes kind (0 hearts) | `kind`, before the `win` jingle |
   | picking up boots / cloak / shield / banana | `boots` / `cloak` / `pickup` / `pickup` |
   | the shield stops a push | `shield` |
   | Dad slips on a banana / lies there | `slip` / `dizzy` (loop while he lies) |
   | a kiss thrown / a kiss hits | `kiss` / `kiss_hit` |
   | a rescue kit used | `kit` |
   | a bonus star picked up | `star` |
   | thrown out of Dad's house / ticking inside it | `thrown_out` / `danger_tick` (loop, only for a player inside) |
   | a player running near Dad / tiptoeing near Dad | `run_steps` / `tiptoe_steps` (loops, only for the local players, only within `HEAR_RADIUS`) |
   | win / lose (time out or everyone resting) | `win` / `lose` jingles |
   | win screen: each star / each coin counted | `star_1`, `star_2`, `star_3` / `coin` |
   | a button / back or close / a comic or tutorial page, or a tab | `tap` / `back` / `page` |
   | bought something (shop, wardrobe, upgrades) / not enough coins or locked | `buy` / `nope` (the shop's `SFX.out()` → `nope`, `SFX.item()` → `buy`) |
   | a level unlocks on the map / a new world opens | `unlock` / `world_open` |
   | the card before a boss | `boss_sting` |

   Sounds of bots and Dad play at `AUDIO.OTHERS` (0.7) of the local players' own sounds (`hug`, `kiss`, `kit`, `star`, `pickup`).
9. **The switches:**
   - the home screen gets two buttons in the corner, **🎵 Music** and **🔊 Sounds**, replacing the single 🔊/🔇. They use the art icons where they exist (`ui_sound_on` / `ui_sound_off`; for music, an emoji until art comes) and are crossed out when off;
   - key M toggles sounds, N toggles music; both are also on the grown-ups page;
   - saved in the save as `settings.music` / `settings.sfx` (default on); an old `muted: true` becomes both off.
10. **The phone and the background:**
    - on iPhone all game audio follows the silent switch: `navigator.audioSession.type = "ambient"` where it exists;
    - background or a call pauses the music elements and suspends the context (SPEC-025 AC 14); the first gesture resumes both;
    - a hidden tab never starts music.

### Offline and size
11. **The service worker:**
    - it precaches all `sfx`, `loop` and `jingle` files plus `theme` and `story` (`AUDIO.PRECACHE`);
    - a world's track and `boss` and `theme_song` are cached on first play (a runtime cache with the site version in its name, cleaned on update);
    - the online origin is still never cached.
12. **Budgets (test):**
    - precached audio ≤ `AUDIO.PRECACHE_MAX` (3.5 MB);
    - every `sfx` / `loop` ≤ 60 KB, every jingle ≤ 120 KB, every music track ≤ 1.8 MB;
    - all of `assets/audio/` ≤ 13 MB;
    - SPEC-040's memory check still passes with music playing (no music `AudioBuffer` at all).

### Tests
13. **Node** (`tests/audio/*.test.mjs`, no ffmpeg needed):
    - the manifest is fresh: every `srcHash` matches `audio/src/` + `scripts/audio.json`;
    - every file is listed and exists, and kinds match the config;
    - the budgets of AC 12;
    - every event name of AC 8 that the core emits has a manifest entry or a synth fallback.
14. **Pipeline** (runs where ffmpeg exists, skipped otherwise):
    - a generated tone with silence and an ending fade comes out trimmed and cut at the right place;
    - a loop's baked seam has no sample jump over 0.05;
    - `loudnorm` lands within ±1 LU of −18.
15. **Playwright** (with a debug hook `__bb.audio` = `{ log, track, levels }`, where `log` holds the last 50 plays as `{ name, at }`):
    - the events of AC 8 play their sounds (driven through the core and debug hooks);
    - menu → map → a Park level keeps `theme` without a restart; a Field level plays `world_field`; level 20 plays `boss`; Story plays `story`; the ending plays `theme_song` once, then `theme`;
    - the music level is lower in play than in menus;
    - the switches persist across a reload; with sounds off nothing is logged as played; with music off no track plays;
    - nothing plays and no context exists before the first gesture;
    - a 404 for `hug.mp3` plays the synth `hug` beep instead;
    - an `OfflineAudioContext` loop of `rescue_loop` has no gap over 5 ms at the seam;
    - offline after a first visit, sfx and `theme` play; a world track played once before also plays offline.
16. **The listening check (Andrei, on a phone, middle volume; not a merge stop):**
    - the run's final report lists every sound with its new length and level;
    - Andrei and the kids say which are too loud, quiet or long; `gain` values are tuned in a follow-up commit;
    - check `growl`, `kiss`, `kiss_hit` and `kind` for any words.

### Docs
17. **Docs to update:**
    - `docs/audio.md` (new): the pipeline, kinds, the AC 7 and AC 8 tables, how to add or replace a sound (WAV in `audio/wav/`, export an MP3 320 into `audio/src/`, add a config line, `npm run audio`);
    - `docs/game-design.md`: a short "Sound and music" section;
    - `THIRD_PARTY_LICENSES.md`: the audio sources per `audio/src/SOURCES.md` (Suno, paid plan; sound effects tool, paid plan);
    - `README.md`: `npm run audio` needs ffmpeg;
    - `CLAUDE.md`: WAV masters in `audio/wav/` (gitignored, never committed), MP3 sources in `audio/src/`, generated files in `assets/audio/`.

## Implementation steps (TDD: failing test first in each)
1. `scripts/audio.json` and `scripts/audio.js` with the kinds; pipeline tests; generate `assets/audio/`; node manifest and budget tests.
2. The engine and sfx with the fallback; event mapping (add missing core events); Playwright event tests.
3. Music: streaming, loop crossfade, screen crossfades, ducking, jingles; Playwright music tests.
4. Switches, save migration, iPhone audio session, background handling.
5. Service worker precache and runtime cache; offline tests; budgets.
6. Docs; the listening report; reviews; merge.

## Numbers
| Key | Value |
|---|---|
| `AUDIO.MASTER` / `MUSIC_MENU` / `MUSIC_PLAY` / `MUSIC_PAUSE` | 0.8 / 0.7 / 0.35 / 0.25 |
| `AUDIO.OTHERS` | 0.7 |
| `AUDIO.SCREEN_XFADE` / `LOOP_XFADE` | 1 s / 2 s |
| `AUDIO.MAX_VOICES` / `RETRIGGER` | 8 / 0.05 s |
| `AUDIO.JINGLE_MAX` | 5 s |
| `AUDIO.PRECACHE_MAX` | 3.5 MB |
| music loudness | −18 LUFS, true peak −1.5 dBTP |

## Texts
| Key | en | es | pt | ru |
|---|---|---|---|---|
| `musicOn` / `musicOff` | Music: on / Music: off | Música: sí / Música: no | Música: ligada / Música: desligada | Музыка: вкл / Музыка: выкл |
| `soundsOn` / `soundsOff` | Sounds: on / Sounds: off | Sonidos: sí / Sonidos: no | Sons: ligados / Sons: desligados | Звуки: вкл / Звуки: выкл |
