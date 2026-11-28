// SPEC-013 AC 3: the Room's game — the headless core (src/core) made from the lobby, fed with the clients' inputs, and read back as the compact
// snapshots the clients draw from. No Workers API here (the core runs in Node too), so Node tests import it. The Room (room.js) owns the timer.
// Compactness (snapshot size): positions are rounded to a tenth of a pixel, every key is short, and only what a client draws is sent — the level
// itself is not (a client builds it from world + n with its own core, the same deterministic generator) and neither are the world trick's
// pieces (static: the same generator); the trick's moving state is a later step's decision (measure it first).
import { CFG, FULL, WORLDS, createGame, freshProgress, levelResult, levelsPerWorld, setSlotKind, step, withGame, worldOpen } from "../../src/core/index.js";

export const slotName = i => "p" + (i + 1);
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

// the game of a lobby: the five Little One slots in order, a human in each slot a human holds (a dropped one's slot is a bot while he is away),
// a bot in every other; the shared stock is the humans' own gear added up for now (per-kid spending is step 5's)
export function makeGame(lobby, { seed, auto = false } = {}) {
  const stock = { shared: true, kisses: 0, kits: 0, gloves: { mittens: 0, mega: 0 } };
  const slots = lobby.slots.map((s, i) => {
    const human = !!s && s.awayUntil === null;
    if (!human) return { slot: slotName(i), kind: "bot", ...(s ? { look: s.look, name: nameOf(s) } : {}) };
    const g = s.gear ?? {};
    stock.kisses += g.kisses ?? 0;
    stock.kits += g.kits ?? 0;
    if (g.glove && g.glove !== "none") stock.gloves[g.glove] += g.gloveCharges ?? 0;
    return { slot: slotName(i), kind: "player", look: s.look, name: nameOf(s), glove: g.glove === "none" ? null : g.glove ?? null, gloveCharges: g.gloveCharges ?? 0,
      kisses: g.kisses ?? 0, kits: g.kits ?? 0, upgrades: g.upgrades ?? {} };
  });
  const game = createGame({ world: lobby.world, n: lobby.n, seed, mode: "online-a", slots, stock });
  if (auto) game.autoOn = true;   // tests only (TEST_AUTO): the core's autopilot plays the human slots
  return game;
}
const nameOf = s => (s.name ? `${s.name.adj}.${s.name.animal}` : null);   // the picked name's indices; each client words it in its own language

// a slot changes hands in a running game
export const humanJoined = (game, i, s) => withGame(game, () => setSlotKind(game, i, "player", { look: s.look, name: nameOf(s), upgrades: s.gear?.upgrades }));
export const humanGone = (game, i) => withGame(game, () => setSlotKind(game, i, "bot"));

// an `input` message (already validated and clamped by protocol.js) → the slot's controls: the stick is the latest, the 💋 / 🩹 presses stay
// set until a step consumes them (a flag fires once at the start of the step)
export function applyInput(game, i, msg) {
  const inp = game.inputs[slotName(i)];
  if (!inp) return false;
  inp.mx = msg.mx; inp.my = msg.my; inp.tiptoe = msg.tiptoe;
  inp.kiss ||= msg.kiss; inp.kit ||= msg.kit;
  return true;
}

export const stepGame = (game, dt = CFG.STEP) => step(game, dt);
export const isOver = game => game.phase === "won";

// ---------- snapshots ----------
const little = l => ({ i: l.id, x: r1(l.x), y: r1(l.y), d: r2(l.dir), st: l.state, k: l.kind === "player" ? 1 : 0, mv: l.moving ? 1 : 0, sp: r2(l.speedFrac), w: r1(l.walk),
  dn: r1(l.downTimer), rs: r2(l.rescue), dz: r1(l.dizzy), ha: r2(l.hugAnim), iv: l.invuln > 0 ? 1 : 0, fx: [r1(l.fx.boots), r1(l.fx.cloak), r1(l.fx.shield)] });
const big = b => ({ x: r1(b.x), y: r1(b.y), d: r2(b.dir), hp: b.hp, mhp: b.maxHp, st: b.state, mv: b.moving ? 1 : 0, w: r1(b.walk), stun: r1(b.stun), slip: r1(b.slip), sk: b.slipKind,
  bl: r1(b.blush), kd: b.kind ? 1 : 0, fl: r1(b.flash) });
const item = it => ({ id: it.id, k: it.kind, x: r1(it.x), y: r1(it.y), t: r1(it.t), lf: r1(it.life) });
const star = s => ({ id: s.id, x: r1(s.x), y: r1(s.y), t: r1(s.t), lf: r1(s.life) });
const kiss = k => ({ id: k.id, o: k.owner, x: r1(k.x), y: r1(k.y), dx: r2(k.dx), dy: r2(k.dy) });
const shot = s => ({ id: s.id, k: s.kind, x: r1(s.x), y: r1(s.y), dx: r2(s.dx), dy: r2(s.dy), by: s.by });

// the effect queue since the last snapshot, as the events a client plays: sfx names, pop keys (an I18N key and its arguments, never text), bursts,
// waves, hints and the economy events a client applies (coins, spent). At most MAX_EVENTS per snapshot (the rest is dropped and counted in `lost`)
const MAX_EVENTS = 24;
const KEEP = new Set(["sfx", "pop", "burst", "wave", "shake", "mood", "hint"]);
export function drainEvents(game) {
  const fx = game.fx ? game.fx.splice(0) : [], out = [];
  for (const e of fx) {
    if (KEEP.has(e.type)) out.push({ ...e, ...("x" in e ? { x: r1(e.x), y: r1(e.y) } : {}) });
    else if (e.type === "game" && (e.e.type === "coins" || e.e.type === "spent")) { const { t, ...rest } = e.e; out.push({ type: "game", e: rest }); }
  }
  return out.length > MAX_EVENTS ? { events: out.slice(0, MAX_EVENTS), lost: out.length - MAX_EVENTS } : { events: out, lost: 0 };
}

/** the common part of a snapshot (the Room adds each client's ackSeq) */
export function snapshotOf(game, tick, events, lost = 0) {
  const s = game.stats;
  return { type: "snapshot", tick, littles: game.littles.map(little), big: big(game.big), items: game.items.map(item), stars: game.bonusStars.map(star),
    kisses: game.kisses.map(kiss), shots: game.shots.map(shot),
    hud: { t: r1(s.time), hugs: s.hugs, hp: game.big.hp, mhp: game.big.maxHp, ph: game.phase, ks: game.stock.kisses, kt: game.stock.kits },
    events, ...(lost ? { lost } : {}) };
}

// the placeholder result of step 2 (step 5 computes the reward): the level's facts and the slot's own counts
export function resultOf(game, i) {
  const r = withGame(game, () => levelResult(game.phase === "won"));
  const { perSlot, ...level } = r;
  return { type: "result", slot: i, ...level, mine: perSlot[slotName(i)] ?? null };
}

// ---------- the owner's level choice (AC 12) ----------
// the owner's compact map (setProgress: per world { open, reason, unlocked, won (bit mask), stars (digits) }) as the core's progress, so the core's own
// rule decides what is open — never the map's word alone
export function progressOfMap(map) {
  const p = freshProgress(), levels = levelsPerWorld();
  for (const w of WORLDS) {
    const m = map?.[w];
    if (!m) continue;
    const wp = p.worlds[w];
    wp.unlocked = m.unlocked;
    for (let n = 1; n <= levels; n++) {
      if (m.won & (1 << (n - 1))) wp.won[n] = true;
      const st = Number(m.stars[n - 1]);
      if (st > 0) { wp.stars[n] = st; wp.won[n] = true; }
    }
  }
  return p;
}
// may the room play level n of a world? The map must call the world open and the level unlocked, and the core must agree for the HOST's entitlement
// (a free host has only the free worlds when the Full game is enforced; a joiner's entitlement never enters). No map yet: a fresh progress (the Park).
export function levelOpen(map, world, n, entitlement = FULL) {
  if (!WORLDS.includes(world) || !Number.isInteger(n) || n < 1 || n > levelsPerWorld()) return false;
  const claim = map?.[world];
  if (claim && !claim.open) return false;
  if (n > (claim ? claim.unlocked : 1)) return false;
  return worldOpen(world, progressOfMap(map), entitlement).open;
}
