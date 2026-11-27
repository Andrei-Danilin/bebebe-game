// SPEC-042: Park — puddles: 3–5 puddles on free ground; a kid who runs through one is heard from far (AC 5). Step 1 is the stub: it places nothing and does nothing, so the framework runs; the trick itself lands in its own step.
// The hooks it will use are in kit.js (place / validate / init / step / bigStep) and the effect fields of G.trick.fx. Core module.
import { NO_HOOKS } from "./kit.js";

export const puddles = Object.freeze({ name: "puddles", ...NO_HOOKS });
