// One entry point for the six guns: oneshot's models (guns/glb.ts), loaded once by loadGuns and cloned for each use.
// Anchors (gunFit) need no model; everything that shows a gun awaits loadGuns first (weapons/index.ts).
import * as THREE from "three";
import type { WeaponId } from "../../../../shared/world/map";
import type { GunSpec } from "./types";
import { gunFit, loadGunModels } from "./glb";

export { gunFit };
let loaded: Map<WeaponId, GunSpec> | null = null;

/** load every gun's model (once; later calls return the same promise) */
export function loadGuns(load: (path: string) => Promise<{ scene: THREE.Object3D }>): Promise<void> {
  return loadGunModels(load).then((m) => { loaded = m; });
}
/** whether loadGuns has finished */
export const gunsReady = () => loaded !== null;

/** the master (do not add it to a scene twice — use gunInstance). Throws before loadGuns has finished. */
export function gunSpec(id: WeaponId): GunSpec {
  const s = loaded?.get(id);
  if (!s) throw new Error(`gun ${id}: models not loaded yet (await loadGuns first)`);
  return s;
}

/** a fresh scene-graph instance sharing geometry + materials with the master; pivots re-resolved by name */
export function gunInstance(id: WeaponId): { root: THREE.Group; spec: GunSpec; pivots: Record<string, THREE.Object3D>; meshes: THREE.Mesh[] } {
  const spec = gunSpec(id);
  const root = spec.root.clone(true) as THREE.Group;
  const pivots: Record<string, THREE.Object3D> = {};
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Group).isGroup && o !== root && o.name) pivots[o.name.split("/").pop()!] = o;
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return { root, spec, pivots, meshes };
}

export const GUN_ORDER: WeaponId[] = ["pistol", "smg", "ar", "shotgun", "sniper", "rocket"];
