// SPEC-011 AC 3b: the core's one port to the client.
import { noGameRng } from "./util.js";

// SPEC-011 AC 3b: the one port from the core to the client. The core calls hooks.<name>(…); the client registers the real
// functions with setHooks({ … }) before the first game (Phase B: the inline client; Phase C: src/client/main.js). Without a
// client (Node, the server of SPEC-012/013) every hook is a no-op. A hook is client code: it runs under noGameRng (it must not
// draw the gameplay rng()), except onPracticeWin — it starts the next practice game, whose buildGame draws rng() on purpose.
// SPEC-012 turns sfx, burst, pop, shake, save and inputFor into events and input slots. tests/modules.spec.js lists them.
const HOOK_DEFAULTS = Object.freeze({
  sfx: name => {},                          // a sound: SFX[name]
  burst: (x, y, kind, color, n) => {},      // particles at a world point
  pop: (x, y, text, color, meaning) => {},  // a flying text (the core gives the text, in the current language)
  shake: v => {},                           // camera shake: set to v
  fx: dt => {},                             // the client's effects step inside update(): flying texts, particles, shake
  banner: dt => {},                         // the level banner's clock (it runs while the level plays)
  save: () => {},                           // write progress to storage (economy.js saves only through this)
  rebuild: () => {},                        // rebuild the 3D scene for the game buildGame just built
  onWin: reward => {},                      // a level was won (G.phase "won") and paid: the client shows the win screen
  onPracticeWin: () => {},                  // a practice game was won: the next tutorial step
  inputFor: l => ({ x: 0, y: 0 })           // player l's device input (held keys, Shift = tiptoe; touch sticks; gamepads), shaped
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
