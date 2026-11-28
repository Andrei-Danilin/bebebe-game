// SPEC-045: the one place that knows whether this device has the Full game (Andrei, 2026-11-26: the Park is free, one purchase opens
// the other worlds, the bonus worlds and hosting online rooms; friends with the free version only join). Groundwork only: nothing here
// sells anything, shows a price or links out — the store purchase comes with the app packaging spec.
// - entitlement() → "full" | "free"; hasFull(); setEntitlement(value, source) writes the save's `entitlement: { value, source, at }`
//   (source: "store" | "test"; "beta" is only what the web beta reports, never stored) through save.js. No field (an old save) = free.
// - CFG.MONETIZATION.enforce false (the web beta): everyone has the Full game, source "beta" — nothing is locked. true: the stored record
//   decides. `?full=0|1` (CFG.MONETIZATION.debugParam; a release build turns it off) forces free (and enforces) / full for this page.
// - isOpenNow / worldOpenNow: the core's worldOpen with this device's entitlement ("purchase" reason for a locked world).
// - The online seam (SPEC-013 puts helloFields() into its hello message; the host check is canHost()).
// Client module.
import { CFG } from "../core/config.js";
import { progress } from "../core/economy.js";
import { canHost as rulesCanHost, effectiveEntitlement, FULL, isOpen, worldOpen } from "../core/progress-rules.js";
import { entitlementField, setEntitlementField } from "./save.js";

export const ENTITLEMENT_SOURCES = Object.freeze(["beta", "store", "test"]);
const STORED_SOURCES = ["store", "test"];
let forced = /** @type {"full" | "free" | null} */ (null);   // ?full=0|1 of this page (only while CFG.MONETIZATION.debugParam is on)
const debugOn = () => !!CFG.MONETIZATION.debugParam;

// called once by main.js
export function initEntitlement() {
  forced = null;
  try {
    if (!debugOn()) return;
    const q = new URLSearchParams(location.search).get("full");
    if (q === "1") forced = "full"; else if (q === "0") forced = "free";
  } catch (e) { /* no address: no override */ }
}
// the rules are the core's (effectiveEntitlement: enforce off → full; a stored "store" record, or a "test" one while debugParam is on); this module adds only the state:
// the page's ?full override and the save's record. `test` is the debug door: a build that enforces (the app) turns debugParam off, and with it the test source
/** @returns {{ value: "full" | "free", source: string | null, at: number | null }} */
export function entitlementInfo() {
  if (forced && debugOn()) return { value: forced, source: "test", at: null };
  if (!CFG.MONETIZATION.enforce) return { value: FULL, source: "beta", at: null };
  const f = entitlementField();
  if (effectiveEntitlement(f) === FULL && f) return { value: FULL, source: f.source, at: Number.isFinite(f.at) ? f.at : null };
  return { value: "free", source: null, at: null };   // no field, an unknown value or source, a beta record, a test record outside debug: free
}
export const entitlement = () => entitlementInfo().value;
export const hasFull = () => entitlement() === FULL;
// a purchase (or, in debug, a test's grant) → saved; false for an unknown value or source, or the "test" source while debugParam is off. The stored value "free" is allowed (a revoked or test record)
export function setEntitlement(value, source) {
  if ((value !== "full" && value !== "free") || !STORED_SOURCES.includes(source) || (source === "test" && !debugOn())) return false;
  setEntitlementField(value, source, Date.now());
  return true;
}
// the worlds as this device sees them: the core's rules + the purchase lock
export const worldOpenNow = (w, p = progress) => worldOpen(w, p, entitlement());
export const isOpenNow = (w, p = progress) => isOpen(w, p, entitlement());
// the online seam: what the hello message carries (unverified in the beta: a server host check needs a store proof, never this field alone); creating a room
// needs the Full game when enforced (the core's canHost; joining never asks). A ?full override decides for this page
export const helloFields = () => ({ entitlement: entitlement() });
export const canHost = () => (forced && debugOn() ? forced === FULL : rulesCanHost(entitlement(), CFG.MONETIZATION));
