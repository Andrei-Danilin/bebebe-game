// SPEC-025 AC 9: the vendored three.js (vendor/three/, imported as the bare name "three" through the import map) ships no
// types, so `npm run typecheck` sees it as `any` (jsconfig.json "paths"). Nothing here ships or runs.
declare module "three";
