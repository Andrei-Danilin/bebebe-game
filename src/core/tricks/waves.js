// SPEC-042: Beach — waves: every 20 s a wave rolls up the beach: kids slow down, Dad stays out (AC 9). Step 1 is the stub: it places nothing and does nothing, so the framework runs; the trick itself lands in its own step.
// The hooks it will use are in kit.js (place / validate / init / step / bigStep) and the effect fields of G.trick.fx. Core module.
import { NO_HOOKS } from "./kit.js";

export const waves = Object.freeze({ name: "waves", ...NO_HOOKS });
