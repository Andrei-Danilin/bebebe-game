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
import { isOpen, worldOpen } from "../core/progress-rules.js";
import { entitlementField, setEntitlementField } from "./save.js";

export const ENTITLEMENT_SOURCES = Object.freeze(["beta", "store", "test"]);
const STORED_SOURCES = ["store", "test"];
let forced = /** @type {"full" | "free" | null} */ (null);   // ?full=0|1 of this page

// called once by main.js
export function initEntitlement() {
  forced = null;
  try {
    if (!CFG.MONETIZATION.debugParam) return;
    const q = new URLSearchParams(location.search).get("full");
    if (q === "1") forced = "full"; else if (q === "0") forced = "free";
  } catch (e) { /* no address: no override */ }
}
/** @returns {{ value: "full" | "free", source: string | null, at: number | null }} */
export function entitlementInfo() {
  if (forced) return { value: forced, source: "test", at: null };
  if (!CFG.MONETIZATION.enforce) return { value: "full", source: "beta", at: null };
  const f = entitlementField();
  if (f && f.value === "full" && STORED_SOURCES.includes(f.source)) return { value: "full", source: f.source, at: Number.isFinite(f.at) ? f.at : null };
  return { value: "free", source: null, at: null };   // no field, an unknown value or a beta record: free
}
export const entitlement = () => entitlementInfo().value;
export const hasFull = () => entitlement() === "full";
// a purchase (or a test's grant) → saved; false for an unknown value or source. The stored value "free" is allowed (a revoked or test record)
export function setEntitlement(value, source) {
  if ((value !== "full" && value !== "free") || !STORED_SOURCES.includes(source)) return false;
  setEntitlementField(value, source, Date.now());
  return true;
}
// the worlds as this device sees them: the core's rules + the purchase lock
export const worldOpenNow = (w, p = progress) => worldOpen(w, p, entitlement());
export const isOpenNow = (w, p = progress) => isOpen(w, p, entitlement());
// the online seam: what the hello message carries (unverified in the beta); creating a room needs the Full game (joining never does)
export const helloFields = () => ({ entitlement: entitlement() });
export const canHost = () => hasFull();
