# Changelog

All notable changes to BeBeBe Atrapar are written down here, in plain words. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).
The version is `package.json` `version` (shown on the "For grown-ups" page); how a release is made and rolled back:
[docs/release.md](docs/release.md). Every spec adds its line under **Unreleased** when it closes.

## [Unreleased]

### Added

- The game works offline from the very first launch, shows a calm "Oops" card instead of freezing, keeps
  safer saves with backups, and has a "For grown-ups" page with the progress code and the game's version (SPEC-025).
- Code checks on every push: ESLint over the game, the scripts and the tests, Prettier for the configs and docs, and type
  checks from JSDoc comments (`npm run lint`, `npm run typecheck`) (SPEC-025).
- A game version (`1.0.0-dev`) on the "For grown-ups" page and in the error log; the offline cache version follows it by
  itself, so no update is ever stuck on an old cache (SPEC-025).
- This changelog, a release guide with a rollback plan, Dependabot for the tools, and a rule that `master` can't be
  force-pushed or deleted (SPEC-025).
- Kids' feedback, round 2: a 👣 tiptoe button on touch screens and a Dad who doesn't hear every step, a new How to play
  page with Pictures and Practice, comic words written inside the drawn bubbles, a language screen on the very first
  launch, "Character" on the win and lose screens, and our own drawn icons instead of emoji (SPEC-032).
- A "How to play" card after the first comic, one big picture in the "How it began" story, softer words about falling
  down, "Get for 🪙" instead of "Buy", "Reset progress" moved behind the grown-ups question, a roomier win title, and
  "Leave the game?" when Back is pressed on the home screen (SPEC-033).

### Changed

- The game now runs in fixed 1/60 s steps, so it plays the same on every screen, a slow phone or a fast tablet (SPEC-034).
- The texts now talk about Dad and the kids: the How to play rules, the lose title ("Dad is still grumpy…") and the
  wardrobe column ("Grumpy dad") no longer say "the Big One" (SPEC-035).
- The kids' rule: while a friend is helping a fallen kid up, that kid's "go home" timer stops (a green ring shows it), and
  it goes on from where it stopped if the friend runs away (SPEC-036).
- Dad no longer stands frozen when his way is blocked: he picks a new place he can reach and walks around a fallen kid;
  a new check plays every level to make sure he never stalls again (SPEC-037).
- Phones and tablets: a second finger no longer stops the hero, turning the phone upright pauses the game, tablets
  play in portrait, the fullscreen button hides where it can't work, and the app says when a new version is ready (SPEC-038).
- Faster, steadier checks behind the scenes: each push is tested in under 10 minutes (was 21–25), a release no longer makes
  the installed app download the whole game again, and the code has no import loops (SPEC-039).
- Lighter on weak phones and tablets: pictures load per screen (a quarter of the memory at start), the 3D draws far fewer
  pieces and only when it can be seen, a new world starts without a stutter, and the picture quality steps down by itself
  on slow devices (Auto / High / Medium / Low on the grown-ups page) (SPEC-040).
- A richer Upgrades page (bigger pictures, level pips, the effect now → next, a MAX ribbon), a little map of the level on
  every level card (with the boss on level 20), and the ninja band and overalls straps now look right (SPEC-041).
- Every world has its own trick: splashy puddles in the Park, sprinklers in the Field, an ice-cream truck to hide behind
  in the City, a school bell that makes everyone freeze, waves on the Beach and footprints in the Winter snow, with a
  "New here!" card the first time and a ? button on the level card (SPEC-042).

## [1.0.0-dev] - what is in the game today

The first written-down state of the game, made by Andrei and his kids from their scenario and drawings.

### The game

- The team of Little Ones (1–2 players and bots, five in all) against the Big One — Dad. Sneak up behind him and hug
  him to take a heart; if he sees you, he pushes you and your leg breaks, and a friend helps you up. There is no game
  over.
- Dad hears you running near him (an 👂 and a ❓ over his head); tiptoe and he hears nothing.
- Your house is safe; Dad's house is not for you. Bushes hide you. Golden bonus stars give coins.
- Items on the map (boots, a cloak, a shield, bananas…), air kisses that make Dad blush, rescue kits, mittens and mega
  mittens for stronger hugs.
- Dad's anger is his hearts: a red face and steam at first, then hearts, then "Dad is kind again!" and he walks home.

### Worlds and levels

- Six worlds of 20 levels each, opening one after another: Park, Football field, City, School, then the bonus Beach
  and Winter. Every level is made fresh from a seed, with its own layout (meadow, maze, village, river, rooms, arena).
- A boss on level 20 of the Park, the Football field and the City, and the grumpiest dad at the end of School.
- Stars for each level (win, fast, nobody rested) and a level map with a winding path, locks and a bouncing next level.

### Story and tutorial

- The comic "How it began" on the very first launch, a picture before each boss, "How it ended" and a thank-you card;
  every scene can be watched again in Story.
- A short tutorial with two practice games that change nothing in your progress; ▶ Practice plays it again.

### Character and shop

- Coins from every level; a shop with items, upgrades and a wardrobe of hats, jackets, pants and looks for Dad.
- Names for the players, Dad and the bots.

### Everywhere

- English, Spanish (Argentina), Portuguese (Brazil) and Russian.
- Keyboard, gamepad and touch; a phone layout with a stick, a mini-map and a camera that follows you.
- Drawn art for menus, items and the comic (every picture has a code-drawn fallback); a cartoon 3D look.
- Works offline as an installed app (PWA); nothing is loaded from the internet and nothing is sent anywhere.
- Safe saves: one versioned save with backups, automatic recovery, a parents' progress code to move to a new device,
  undo for a reset, and "Erase all data" behind a grown-ups question.
- A calm "Oops" card instead of a frozen screen, the game pauses when the app is hidden, and it survives a lost
  graphics context.
