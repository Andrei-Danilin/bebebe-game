// SPEC-039: the calls a low module makes UP the stack, bound by main.js at the start (boot() wires them first): a wardrobe change
// re-dresses the game on screen (flow.js redress) and a change of the names, outfits or progress queues the save (save.js queueSave,
// which itself reads the names and the outfits). Without them outfits.js would import flow.js and progress.js would import save.js, and
// both import them back. A port not wired throws, naming itself. Client module.
const unwired = name => () => { throw new Error("port " + name + " is not wired (main.js: setPorts)"); };
export const ports = { redress: unwired("redress"), queueSave: unwired("queueSave"), openFullCard: unwired("openFullCard") };
export function setPorts(p) {
  for (const [k, f] of Object.entries(p)) {
    if (!Object.hasOwn(ports, k) || typeof f !== "function") throw new Error("setPorts: unknown port or not a function: " + k);
    ports[k] = f;
  }
}
