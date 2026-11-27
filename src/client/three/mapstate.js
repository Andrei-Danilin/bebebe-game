// SPEC-039 (from three/map3d.js): the 3D group of the built map and the animated waves — the map builder (map3d.js) fills them and the
// houses and themes (three/houses.js, three/themes.js, which map3d.js calls) add their meshes to them, so they sit below all three. Client module.
export let mapGroup = null;
export const waves = [];
export function setMapGroup(g) { mapGroup = g; }
