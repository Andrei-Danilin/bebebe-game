// SPEC-011 AC 3b: the core's one port to the client.
import { noGameRng } from "./util.js";

// SPEC-011 AC 3b: the one port from the core to the client. The core calls hooks.<name>(…); the client registers the real
// functions with setHooks({ … }) before the first game (Phase B: the inline client; Phase C: src/client/main.js). Without a
// client (Node, the server of SPEC-012/013) every hook is a no-op. A hook is client code: it runs under noGameRng (it must not
// draw the gameplay rng()), except onPracticeWin — it starts the next practice game, whose buildGame draws rng() on purpose.
// SPEC-012: effects are events in G.fx (AC 5: the client drains them) and controls are input slots G.inputs (AC 3); what is left
// is what the client still has to do at that moment. tests/modules.spec.js lists them.
const HOOK_DEFAULTS = Object.freeze({
  save: () => {},                           // write progress to storage (economy.js saves only through this; SPEC-012 step 5: events)
  rebuild: () => {},                        // rebuild the 3D scene for the game buildGame just built
  onWin: reward => {},                      // a level was won (G.phase "won") and paid: the client shows the win screen
  onPracticeWin: () => {}                   // a practice game was won: the next tutorial step
});
const HOOKS_REENTER = Object.freeze(["onPracticeWin"]);   // they hand control back to the core: no rng guard
const hookImpl = { ...HOOK_DEFAULTS };
export function setHooks(h) {
  for (const [k, f] of Object.entries(h)) {
    if (!Object.hasOwn(HOOK_DEFAULTS, k) || typeof f !== "function") throw new Error(`setHooks: unknown hook or not a function: ${k}`);
    hookImpl[k] = f;
  }
}
export const hooks = Object.freeze(Object.fromEntries(Object.keys(HOOK_DEFAULTS).map(k => [k, HOOKS_REENTER.includes(k)
  ? (...a) => hookImpl[k](...a)
  : (...a) => noGameRng("hook:" + k, () => hookImpl[k](...a))])));
