// SPEC-039 (from three/sync.js): the 3D meshes of the items on the ground, the flying world items (SPEC-043), the bonus stars and the flying kisses — one group and one id → mesh
// map each, emptied when a game is rebuilt (three/characters.js) and filled each frame (three/sync.js). Held here so the builder and the
// sync need not import each other. Client module.
import * as THREE from "three";
import { disposeTree } from "./materials.js";
import { scene } from "./setup.js";

export let itemGroup = new THREE.Group();
export const itemMeshes = new Map();
export function clearItemMeshes() { scene.remove(itemGroup); disposeTree(itemGroup); itemGroup = new THREE.Group(); scene.add(itemGroup); itemMeshes.clear(); }
export let shotGroup = new THREE.Group();
export const shotMeshes = new Map();
export function clearShotMeshes() { scene.remove(shotGroup); disposeTree(shotGroup); shotGroup = new THREE.Group(); scene.add(shotGroup); shotMeshes.clear(); }
export let starGroup = new THREE.Group();
export const starMeshes = new Map();
export function clearStarMeshes() { scene.remove(starGroup); disposeTree(starGroup); starGroup = new THREE.Group(); scene.add(starGroup); starMeshes.clear(); }
export let kissGroup = new THREE.Group();
export const kissMeshes = new Map();
export function clearKissMeshes() { scene.remove(kissGroup); disposeTree(kissGroup); kissGroup = new THREE.Group(); scene.add(kissGroup); kissMeshes.clear(); }
