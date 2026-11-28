// SPEC-013 AC 1-6: the Room Durable Object — one per room code. It holds the lobby (five kid slots, the owner, the choices), runs the game while a level
// is played, and sleeps otherwise (WebSocket Hibernation API: `ctx.acceptWebSocket`, `webSocketMessage` / `webSocketClose`; no timer in the lobby).
//   lobby    { code, owner, slots, world, n, locked, phase, map, seq, lastAction, emptySince, ownerKeyHash }, written to storage on every change (AC 6) and
//            restored after a restart or an eviction. A slot is null (a bot plays it) or { name, look, gear, entitlement, joined, tokenHash, awayUntil }:
//            awayUntil null = the kid is connected; a number = he dropped and the slot waits for his token until then (REJOIN_TIME), a bot plays it.
//   tokens   the session token a kid gets in `welcome` lives in his socket's attachment and in his client; the Room stores only its SHA-256 (tokenHash),
//            deleted when the slot is freed, so a rejoin survives an eviction. Never a device id, never on the device (RR-56).
//   play     `start` (owner) makes the core game from the lobby (sim.js) and steps it at CFG.STEP from a timer; `input` drives the kid's slot; a snapshot goes
//            out at CFG.ONLINE.SNAP_HZ; at the end a `result` per kid and the Room is a lobby again (timer stopped, it may hibernate).
//   alarms   one Durable Object alarm at the earliest of: a dropped slot's expiry, EMPTY_ROOM_TTL after the last kid left, IDLE_ROOM_TTL after the last action
//            (lobby only); the Room then frees the slot or closes (storage deleted, the code is free again).
import { DurableObject } from "cloudflare:workers";
import { CFG } from "../../src/core/config.js";
import { MessageRate, sha256Hex } from "./limits.js";
import { log } from "./log.js";
import { OWNER_TYPES, PROTOCOL, errorMsg, parseClientMessage } from "./protocol.js";
import { refusedSocket } from "./refuse.js";
import { applyInput, drainEvents, humanGone, humanJoined, isOver, makeGame, resultOf, snapshotOf, stepGame } from "./sim.js";

const TIMER_MS = 16;                 // the game timer's period; the steps are counted from the elapsed time, so a late timer catches up (up to MAX_CATCHUP steps)
const MAX_CATCHUP = 8;
const SNAP_EVERY = Math.max(1, Math.round(1 / CFG.STEP / CFG.ONLINE.SNAP_HZ));   // steps per snapshot: 60 / 20 = 3
const ALARM_SLACK_MS = 50;           // an alarm may run a hair before the time it was set for

// a random string of crypto bytes in URL-safe base64 (24 bytes = 32 characters): tokens, owner keys
function randomString() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}
const send = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch { /* the socket is gone: its close handler cleans up */ } };
const att = ws => ws.deserializeAttachment() ?? { slot: null };
// the times (seconds), from CFG; a test server (TEST_HOOKS=1, never set in wrangler.toml) may shorten them and speed the game up
function timing(env) {
  const o = CFG.ONLINE, t = env.TEST_HOOKS === "1", num = (v, dflt) => (t && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : dflt);
  return { rejoin: num(env.TEST_REJOIN_TIME, o.REJOIN_TIME), empty: num(env.TEST_EMPTY_TTL, o.EMPTY_ROOM_TTL), idle: num(env.TEST_IDLE_TTL, o.IDLE_ROOM_TTL),
    speed: num(env.TEST_SPEED, 1), auto: t && env.TEST_AUTO === "1" };
}

export class Room extends DurableObject {
  /** @param {DurableObjectState} ctx @param {any} env */
  constructor(ctx, env) {
    super(ctx, env);
    this.t = timing(env);
    this.lobby = null;                  // null = no such room (never created, or closed)
    this.rates = new WeakMap();         // socket → MessageRate (memory only; a hibernated Room starts a fresh second)
    this.closing = new WeakSet();       // sockets this Room has closed: further messages from them are ignored
    this.game = null;                   // the running level (memory only: a restart ends it, AC 6)
    this.loop = null; this.last = 0; this.acc = 0; this.tick = 0;
    this.ack = [];                      // per slot: the last input seq applied (0 = none; clients count from 1)
    this.metrics = { steps: 0, slow: 0 };
    ctx.blockConcurrencyWhile(async () => {
      this.lobby = (await ctx.storage.get("lobby")) ?? null;
      if (this.lobby) await this.reconcile();
    });
  }

  // ---------- storage, alarms ----------
  save() { return this.ctx.storage.put("lobby", this.lobby); }
  connected() { return this.lobby.slots.filter(s => s && s.awayUntil === null).length; }
  // a restart or an eviction: the slots follow the sockets that are really there (a kid whose socket is gone waits for his token), and a level that was
  // in progress is over — everybody is in the lobby again (AC 6)
  async reconcile() {
    const L = this.lobby, now = Date.now(), live = new Set(this.ctx.getWebSockets().map(ws => att(ws).slot).filter(s => s !== null));
    let changed = false;
    L.slots.forEach((s, i) => {
      if (!s) return;
      if (live.has(i) && s.awayUntil !== null) { s.awayUntil = null; changed = true; }
      else if (!live.has(i) && s.awayUntil === null) { s.awayUntil = now + this.t.rejoin * 1000; changed = true; }
    });
    if (L.phase !== "lobby") { L.phase = "lobby"; L.lastAction = now; changed = true; }
    if (this.connected() === 0 && !L.emptySince) { L.emptySince = now; changed = true; }
    if (changed) { await this.save(); this.broadcast(); }
    await this.schedule();
  }
  async schedule() {
    const L = this.lobby, T = this.t;
    if (!L) return this.ctx.storage.deleteAlarm();
    let at = Infinity;
    for (const s of L.slots) if (s && s.awayUntil !== null) at = Math.min(at, s.awayUntil);
    if (this.connected() === 0 && L.emptySince) at = Math.min(at, L.emptySince + T.empty * 1000);
    if (L.phase !== "play") at = Math.min(at, L.lastAction + T.idle * 1000);
    return at === Infinity ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(at);
  }
  // a lobby change: persist, re-plan the alarm, tell everybody
  async changed() { await this.save(); await this.schedule(); this.broadcast(); }
  touch() { this.lobby.lastAction = Date.now(); }

  async alarm() {
    const L = this.lobby;
    if (!L) return;
    const now = Date.now() + ALARM_SLACK_MS;
    let freed = false;
    L.slots.forEach((s, i) => { if (s && s.awayUntil !== null && s.awayUntil <= now) { this.freeSlot(i); freed = true; } });
    if (this.connected() === 0 && L.emptySince && now >= L.emptySince + this.t.empty * 1000) return this.closeRoom("empty");
    if (L.phase !== "play" && now >= L.lastAction + this.t.idle * 1000) return this.closeRoom("idle");
    if (freed) await this.changed(); else await this.schedule();
  }
  async closeRoom(why) {
    this.stopLoop();
    this.game = null;
    for (const ws of this.ctx.getWebSockets()) { send(ws, errorMsg("roomClosed")); this.closing.add(ws); try { ws.close(1000, "closed"); } catch { /* already closed */ } }
    this.lobby = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    log("room_closed", { idle: why === "idle" ? 1 : 0 });
  }

  // ---------- creating, joining ----------
  // POST /rooms asks for this code: the creator's one-time ownerKey, or null when the room is already live. Only the hello that presents the key
  // becomes the owner (SPEC-013 step 2: a stranger who guesses the code first cannot take the room)
  async create(code) {
    if (this.lobby) return null;
    const ownerKey = randomString(), now = Date.now();
    this.lobby = { code, owner: null, slots: Array(CFG.ONLINE.MAX_LITTLES).fill(null), world: "park", n: 1, locked: false, phase: "lobby", map: null, seq: 0,
      lastAction: now, emptySince: now, ownerKeyHash: await sha256Hex(ownerKey) };
    await this.save();
    await this.schedule();
    log("room_created");
    return ownerKey;
  }

  // GET /ws?room=CODE after the Worker's checks: accept the socket (hibernating); an unknown code gets its error at once on a plain socket
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected a WebSocket", { status: 426 });
    if (!this.lobby) return refusedSocket("roomNotFound");
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ slot: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  refuse(ws, code, closeCode = 1008) {
    send(ws, errorMsg(code));
    this.closing.add(ws);
    try { ws.close(closeCode, code); } catch { /* already closed */ }
  }

  async hello(ws, me, msg) {
    if (me.slot !== null) return send(ws, errorMsg("badMessage"));   // a second hello on the same socket
    // everything that waits (hashing) comes first; from the slot choice to the first storage write there is no await, so two joins at once never share a slot
    const hash = msg.token ? await sha256Hex(msg.token) : null, fresh = randomString();
    const freshHash = await sha256Hex(fresh), keyHash = msg.ownerKey ? await sha256Hex(msg.ownerKey) : null;
    const L = this.lobby;
    if (!L) return this.refuse(ws, "roomNotFound");
    let slot = hash ? L.slots.findIndex(s => s && s.tokenHash === hash) : -1, token = msg.token;
    if (slot >= 0) {                                                  // the same kid back, within REJOIN_TIME (or from a second tab: the old socket goes)
      for (const other of this.ctx.getWebSockets()) if (other !== ws && att(other).slot === slot) { other.serializeAttachment({ slot: null }); this.closing.add(other); try { other.close(1000, "replaced"); } catch { /* gone */ } }
      L.slots[slot].awayUntil = null;
      log("player_rejoined", { slot });
    } else {
      if (L.locked) return this.refuse(ws, "roomLocked");
      slot = L.slots.findIndex(s => s === null);
      if (slot < 0) return this.refuse(ws, "roomFull");
      token = fresh;
      L.slots[slot] = { name: null, look: null, gear: null, entitlement: msg.entitlement, joined: ++L.seq, tokenHash: freshHash, awayUntil: null };
      if (keyHash && keyHash === L.ownerKeyHash) { L.owner = slot; L.ownerKeyHash = null; }       // the creator
      else if (L.owner === null && L.ownerKeyHash === null) L.owner = slot;                            // the creator is gone and nobody else owns the room
      log("player_joined", { slot });
    }
    L.emptySince = null;
    this.touch();
    ws.serializeAttachment({ slot, token });
    if (this.game) { this.ack[slot] = 0; humanJoined(this.game, slot, L.slots[slot]); }   // joining during play takes a bot's slot
    await this.save();
    await this.schedule();
    send(ws, { type: "welcome", token, slot });
    this.broadcast();
  }

  // a slot becomes a bot for good (the kid left, or his waiting time ran out): his token is forgotten, ownership moves on
  freeSlot(i) {
    const L = this.lobby;
    L.slots[i] = null;
    if (L.owner === i) this.passOwner();
  }
  // ownership to the longest-connected kid (the one who joined first among those connected); nobody connected → nobody (the next to join, or the
  // returning owner for a dropped one — see drop, which keeps a dropped owner when no other kid is there)
  passOwner() {
    const L = this.lobby;
    let best = null;
    L.slots.forEach((s, i) => { if (s && s.awayUntil === null && (best === null || s.joined < L.slots[best].joined)) best = i; });
    L.owner = best;
  }

  // a kid left on purpose or his socket dropped: a bot plays his slot at once; on purpose, the slot is free (and so is his token); dropped, it waits
  // REJOIN_TIME for the token. Idempotent per socket
  async drop(ws, why) {
    const me = att(ws);
    this.closing.add(ws);
    if (why === "leave") { try { ws.close(1000, "leave"); } catch { /* already closed */ } }
    const L = this.lobby;
    if (me.slot === null || !L || !L.slots[me.slot]) return;
    ws.serializeAttachment({ slot: null });
    const i = me.slot;
    if (this.game) humanGone(this.game, i);
    if (why === "leave") this.freeSlot(i);
    else {
      L.slots[i].awayUntil = Date.now() + this.t.rejoin * 1000;
      if (L.owner === i) { const was = L.owner; this.passOwner(); if (L.owner === null) L.owner = was; }   // nobody else here: he is the owner again when he is back
    }
    if (this.connected() === 0) {
      L.emptySince = Date.now();
      if (this.game) this.endPlay(false);                           // nobody is left to play
    }
    this.touch();
    log("player_left", { slot: i, leave: why === "leave" ? 1 : 0 });
    await this.changed();
  }

  // ---------- messages ----------
  async webSocketMessage(ws, message) {
    if (this.closing.has(ws)) return;
    let rate = this.rates.get(ws);
    if (!rate) this.rates.set(ws, rate = new MessageRate());
    if (!rate.hit()) { log("msg_rate_close"); this.closing.add(ws); ws.close(1008, "rate"); return; }
    const parsed = parseClientMessage(message);
    if (!parsed.ok) {
      if (parsed.error === "updateRequired") { send(ws, { type: "updateRequired", protocol: PROTOCOL }); this.closing.add(ws); ws.close(1008, "updateRequired"); }
      else if (parsed.error === "tooBig") { this.refuse(ws, "tooBig", 1009); log("msg_too_big"); }
      else send(ws, errorMsg(parsed.error));
      return;
    }
    const msg = parsed.msg, me = att(ws);
    if (msg.type === "ping") return send(ws, { type: "pong", ...(msg.t === undefined ? {} : { t: msg.t }) });
    if (!this.lobby) return this.refuse(ws, "roomNotFound");
    if (msg.type === "hello") return this.hello(ws, me, msg);
    if (me.slot === null) return send(ws, errorMsg("needHello"));
    const L = this.lobby, mine = L.slots[me.slot];
    if (!mine) return send(ws, errorMsg("needHello"));
    if (OWNER_TYPES.includes(msg.type) && me.slot !== L.owner) return send(ws, errorMsg("notOwner"));
    switch (msg.type) {
      case "input":
        if (this.game && msg.seq > (this.ack[me.slot] ?? 0) && applyInput(this.game, me.slot, msg)) this.ack[me.slot] = msg.seq;
        return;
      case "setLook": mine.look = msg.look; break;
      case "setName": mine.name = { adj: msg.adj, animal: msg.animal }; break;
      case "setGear": { const { type, ...gear } = msg; mine.gear = gear; break; }
      case "setProgress": L.map = msg.worlds; break;   // what the owner can play (AC 12); the Room picks levels from it in a later step
      case "leave": return this.drop(ws, "leave");
      case "start": return this.startPlay(ws);
      default: return;   // setLevel, lock, remove (owner controls) arrive with step 3
    }
    this.touch();
    if (this.game && (msg.type === "setLook" || msg.type === "setName")) humanJoined(this.game, me.slot, mine);   // the game carries the look and name
    await this.changed();
  }

  // ---------- play ----------
  async startPlay(ws) {
    const L = this.lobby;
    if (L.phase !== "lobby" || this.game) return send(ws, errorMsg("badPhase"));
    try { this.game = makeGame(L, { seed: crypto.getRandomValues(new Uint32Array(1))[0], auto: this.t.auto }); }
    catch { log("start_failed"); this.game = null; return send(ws, errorMsg("startFailed")); }
    this.tick = 0; this.acc = 0; this.ack = Array(L.slots.length).fill(0); this.metrics = { steps: 0, slow: 0 };
    L.phase = "play";
    this.touch();
    await this.changed();
    this.startLoop();
    log("level_start");
  }
  startLoop() {
    this.stopLoop();
    this.last = Date.now();
    this.loop = setInterval(() => { try { this.onTimer(); } catch { log("sim_error"); this.endPlay(false).catch(() => {}); } }, TIMER_MS);
  }
  stopLoop() { if (this.loop !== null) { clearInterval(this.loop); this.loop = null; } }
  // the timer: the game's clock is the elapsed real time (× TEST_SPEED in tests) in whole steps of CFG.STEP; a backlog beyond MAX_CATCHUP steps is dropped
  onTimer() {
    if (!this.game) return this.stopLoop();
    const now = Date.now();
    this.acc += Math.min((now - this.last) / 1000, 0.25) * this.t.speed;
    this.last = now;
    for (let n = 0; this.acc >= CFG.STEP && this.game; n++) {
      if (n >= MAX_CATCHUP * Math.max(1, this.t.speed)) { this.acc = 0; break; }
      this.acc -= CFG.STEP;
      const t0 = performance.now();
      stepGame(this.game);
      this.metrics.steps++;
      if (performance.now() - t0 > CFG.ONLINE.SLOW_STEP_MS) this.metrics.slow++;   // a step over 8 ms is counted (the clock only moves between events in Workers, so this is best-effort there)
      this.tick++;
      if (isOver(this.game)) { this.endPlay(true).catch(() => log("sim_error")); return; }
      if (this.tick % SNAP_EVERY === 0) this.sendSnapshots();
    }
  }
  sendSnapshots(game = this.game) {
    const { events, lost } = drainEvents(game), { type, tick, ...rest } = snapshotOf(game, this.tick, events, lost);
    for (const ws of this.ctx.getWebSockets()) {
      const a = att(ws);
      if (a.slot !== null) send(ws, { type, tick, ackSeq: this.ack[a.slot] ?? 0, ...rest });
    }
  }
  // the level is over (won) or nobody is left: a last snapshot, a result for each kid who is here, the timer off, the lobby again
  async endPlay(won) {
    const game = this.game, L = this.lobby;
    if (!game) return;
    this.stopLoop();
    this.game = null;
    if (won && L) {
      this.sendSnapshots(game);
      this.ctx.getWebSockets().forEach(ws => { const a = att(ws); if (a.slot !== null) send(ws, resultOf(game, a.slot)); });
    }
    log("level_end", { won: won ? 1 : 0, ticks: this.tick, steps: this.metrics.steps, slow_steps: this.metrics.slow });
    if (!L) return;
    L.phase = "lobby";
    this.touch();
    await this.changed();
  }

  broadcast() {
    for (const ws of this.ctx.getWebSockets()) this.sendState(ws);
  }
  // the roomState: slots hold names and looks only — never tokens, hashes or entitlements
  sendState(ws) {
    const L = this.lobby;
    if (!L || att(ws).slot === null) return;
    send(ws, { type: "roomState", code: L.code, owner: L.owner, world: L.world, n: L.n, phase: L.phase, locked: L.locked, map: L.map,
      slots: L.slots.map(s => (s ? { kind: "human", name: s.name, look: s.look, connected: s.awayUntil === null } : { kind: "bot" })) });
  }

  async webSocketClose(ws) {
    try { ws.close(1000, "bye"); } catch { /* already closed */ }
    await this.drop(ws, "close");
  }
  async webSocketError(ws) { await this.drop(ws, "error"); }
}
