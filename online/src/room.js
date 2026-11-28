// SPEC-013 AC 1-6: the Room Durable Object — one per room code. Step 1 (create / join / lobby): `create` (RPC, refuses a live room), the WebSocket
// Hibernation API (`ctx.acceptWebSocket`, `webSocketMessage` / `webSocketClose`), the hello → welcome handshake, five kid slots, the lobby
// choices (look, name, gear), ownership, per-socket message rate. Later steps add the simulation, rejoin by token, alarms and owner controls.
// Memory vs storage: the lobby ({ code, owner, slots (names, looks, gear), world, n, locked, … }) is written to storage on every change and
// survives hibernation and eviction (AC 6); the session token lives only in the socket's attachment (AC 5: never stored, never a device id).
import { DurableObject } from "cloudflare:workers";
import { CFG } from "../../src/core/config.js";
import { MessageRate } from "./limits.js";
import { log } from "./log.js";
import { OWNER_TYPES, PROTOCOL, errorMsg, parseClientMessage } from "./protocol.js";
import { refusedSocket } from "./refuse.js";

// a random session token: 24 crypto bytes in URL-safe base64 (32 characters)
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}
const send = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch { /* the socket is gone: its close handler cleans up */ } };
const att = ws => ws.deserializeAttachment() ?? { slot: null };

export class Room extends DurableObject {
  /** @param {DurableObjectState} ctx @param {any} env */
  constructor(ctx, env) {
    super(ctx, env);
    this.lobby = null;                  // null = no such room (never created, or closed)
    this.rates = new WeakMap();         // socket → MessageRate (memory only; a hibernated Room starts a fresh second)
    this.closing = new WeakSet();       // sockets this Room has closed: further messages from them are ignored
    ctx.blockConcurrencyWhile(async () => { this.lobby = (await ctx.storage.get("lobby")) ?? null; });
  }

  // POST /rooms asks for this code: false when the room is already live
  async create(code) {
    if (this.lobby) return false;
    this.lobby = { code, owner: null, slots: Array(CFG.ONLINE.MAX_LITTLES).fill(null), world: "park", n: 1, locked: false, phase: "lobby", map: null, seq: 0 };
    await this.save();
    log("room_created");
    return true;
  }
  save() { return this.ctx.storage.put("lobby", this.lobby); }

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
    if (OWNER_TYPES.includes(msg.type) && me.slot !== this.lobby.owner) return send(ws, errorMsg("notOwner"));
    const mine = this.lobby.slots[me.slot];
    if (!mine) return send(ws, errorMsg("needHello"));
    switch (msg.type) {
      case "setLook": mine.look = msg.look; break;
      case "setName": mine.name = { adj: msg.adj, animal: msg.animal }; break;
      case "setGear": { const { type, ...gear } = msg; mine.gear = gear; break; }
      case "setProgress": this.lobby.map = msg.worlds; break;   // what the owner can play (AC 12); the Room picks levels from it in a later step
      case "leave": return this.drop(ws, "leave");
      default: return;   // setLevel, lock, remove, start (owner controls, simulation) and input arrive with the later steps
    }
    await this.save();
    this.broadcast();
  }

  async hello(ws, me, msg) {
    const L = this.lobby;
    if (me.slot !== null) return send(ws, errorMsg("badMessage"));   // a second hello on the same socket
    if (L.locked) return this.refuse(ws, "roomLocked");
    const slot = L.slots.findIndex(s => s === null);
    if (slot < 0) return this.refuse(ws, "roomFull");
    L.slots[slot] = { name: null, look: null, gear: null, entitlement: msg.entitlement, joined: ++L.seq };
    if (L.owner === null) L.owner = slot;
    const token = randomToken();
    ws.serializeAttachment({ slot, token });
    await this.save();
    send(ws, { type: "welcome", token, slot });
    this.broadcast();
    log("player_joined", { slot });
  }

  // a player left on purpose or the socket dropped: the slot is a bot again; ownership goes to the longest-connected player. Idempotent
  drop(ws, why) {
    const me = att(ws);
    this.closing.add(ws);
    if (why === "leave") { try { ws.close(1000, "leave"); } catch { /* already closed */ } }
    if (me.slot === null) return;
    ws.serializeAttachment({ slot: null });
    const L = this.lobby;
    if (!L || !L.slots[me.slot]) return;
    L.slots[me.slot] = null;
    if (L.owner === me.slot) {
      let best = null;
      L.slots.forEach((s, i) => { if (s && (best === null || s.joined < L.slots[best].joined)) best = i; });
      L.owner = best;
    }
    return this.save().then(() => { this.broadcast(); log("player_left", { slot: me.slot }); });
  }

  // the same roomState to everybody in a slot: slots hold names and looks only, never tokens or entitlements
  broadcast() {
    const L = this.lobby;
    const msg = { type: "roomState", code: L.code, owner: L.owner, world: L.world, n: L.n, phase: L.phase, locked: L.locked, map: L.map,
      slots: L.slots.map(s => (s ? { kind: "human", name: s.name, look: s.look, connected: true } : { kind: "bot" })) };
    for (const ws of this.ctx.getWebSockets()) if (att(ws).slot !== null) send(ws, msg);
  }

  async webSocketClose(ws) {
    try { ws.close(1000, "bye"); } catch { /* already closed */ }
    await this.drop(ws, "close");
  }
  async webSocketError(ws) { await this.drop(ws, "error"); }
}
