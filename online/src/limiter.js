// SPEC-013 AC 8: the per-IP limits. One Limiter Durable Object per salted daily hash of an IP (worker.js names it); it counts rooms
// created and join attempts per minute in memory only — nothing is written to storage, so an evicted Limiter simply starts at zero.
import { DurableObject } from "cloudflare:workers";
import { CFG } from "../../src/core/config.js";
import { SlidingLimit } from "./limits.js";

const MINUTE = 60_000;

export class Limiter extends DurableObject {
  rooms = new SlidingLimit(CFG.ONLINE.ROOMS_PER_IP_MIN, MINUTE);
  joins = new SlidingLimit(CFG.ONLINE.JOINS_PER_IP_MIN, MINUTE);
  /** @param {"room" | "join"} kind @returns {boolean} true when this attempt is within the limit (and counted) */
  hit(kind) { return (kind === "room" ? this.rooms : this.joins).hit(); }
}
