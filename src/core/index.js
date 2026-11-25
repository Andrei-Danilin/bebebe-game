// SPEC-011 AC 4: the public surface of the core — every core module, for Node (SPEC-012/013's server) and the Node import test.
// The core imports only src/core/**, src/i18n.js and src/story.js; it never touches the DOM, storage or three.js.
export * from "./config.js";
export * from "./util.js";
export * from "./hooks.js";
export * from "./world.js";
export * from "./wardrobe.js";
export * from "./level/layouts.js";
export * from "./level/generate.js";
export * from "./level/build.js";
export * from "./level/validate.js";
export * from "./path.js";
export * from "./difficulty.js";
export * from "./game.js";
export * from "./rules.js";
export * from "./bots.js";
export * from "./big.js";
export * from "./mood.js";
export * from "./hearing.js";
export * from "./autopilot.js";
export * from "./practice.js";
export * from "./economy.js";
export * from "./progress-rules.js";
