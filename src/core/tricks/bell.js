// SPEC-042: School — bell: every 30 s the bell: Dad looks all around, any kid who runs is spotted (AC 8). Step 1 is the stub: it places nothing and does nothing, so the framework runs; the trick itself lands in its own step.
// The hooks it will use are in kit.js (place / validate / init / step / bigStep) and the effect fields of G.trick.fx. Core module.
import { NO_HOOKS } from "./kit.js";

export const bell = Object.freeze({ name: "bell", ...NO_HOOKS });
