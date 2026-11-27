// SPEC-042: City — truck: a slow ice-cream truck on a closed loop of open lanes blocks Dad's sight (AC 7). Step 1 is the stub: it places nothing and does nothing, so the framework runs; the trick itself lands in its own step.
// The hooks it will use are in kit.js (place / validate / init / step / bigStep) and the effect fields of G.trick.fx. Core module.
import { NO_HOOKS } from "./kit.js";

export const truck = Object.freeze({ name: "truck", ...NO_HOOKS });
