// SPEC-042: Football field — sprinklers: 2–3 sprinklers on a 20 s cycle: the spray hides kids and keeps Dad out (AC 6). Step 1 is the stub: it places nothing and does nothing, so the framework runs; the trick itself lands in its own step.
// The hooks it will use are in kit.js (place / validate / init / step / bigStep) and the effect fields of G.trick.fx. Core module.
import { NO_HOOKS } from "./kit.js";

export const sprinklers = Object.freeze({ name: "sprinklers", ...NO_HOOKS });
