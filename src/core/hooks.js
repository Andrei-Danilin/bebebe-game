// SPEC-011 AC 3b: the core's one port to the client.
import { noGameRng } from "./util.js";

// SPEC-011 AC 3b: the one port from the core to the client. The core calls hooks.<name>(…); the client registers the real
// functions with setHooks({ … }) before the first game (Phase B: the inline client; Phase C: src/client/main.js). Without a
// client (Node, the server of SPEC-012/013) every hook is a no-op. A hook is client code: it runs under noGameRng (it must not
// draw the gameplay rng()). SPEC-012: effects are events in G.fx (AC 5), controls are input slots G.inputs (AC 3), the economy,
// the win and the practice win are events the client applies (AC 6, 10); what is left must happen inside the core's call. tests/modules.spec.js lists them.
const HOOK_DEFAULTS = Object.freeze({
  rebuild: () => {}                         // rebuild the 3D scene now, inside buildGame, for the game just built (its map and characters)
});
const hookImpl = { ...HOOK_DEFAULTS };
export function setHooks(h) {
  for (const [k, f] of Object.entries(h)) {
    if (!Object.hasOwn(HOOK_DEFAULTS, k) || typeof f !== "function") throw new Error(`setHooks: unknown hook or not a function: ${k}`);
    hookImpl[k] = f;
  }
}
export const hooks = Object.freeze(Object.fromEntries(Object.keys(HOOK_DEFAULTS).map(k => [k, (...a) => noGameRng("hook:" + k, () => hookImpl[k](...a))])));
