// SPEC-042: Winter — footprints: running kids leave prints in the snow, Dad follows the fresh ones (AC 10). Step 1 is the stub: it places nothing and does nothing, so the framework runs; the trick itself lands in its own step.
// The hooks it will use are in kit.js (place / validate / init / step / bigStep) and the effect fields of G.trick.fx. Core module.
import { NO_HOOKS } from "./kit.js";

export const footprints = Object.freeze({ name: "footprints", ...NO_HOOKS });
