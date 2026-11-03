// Light-count balancer. three.js bakes the NUMBER of visible point lights into every lit shader program, so a light
// appearing or disappearing (a chest bursting open adds one from the weapons kit's pool; POIs may hide theirs by
// distance) recompiles ~300 programs — measured 17-19 s frames at match start when the islet's chests opened.
// This keeps the visible point-light count CONSTANT: for every tracked light that is not currently drawn, one of our
// intensity-0 stand-ins (far below the world, range 1 m) is shown instead. Zero recompiles, O(lights) per frame.
import * as THREE from "three";

/** the weapons kit's chest light pool size (client/src/weapons/chest.ts grabLight) */
const CHEST_POOL = 4;

export interface LightBalancer {
  /** register a point light that may come and go (e.g. the chest light found under a chest that just opened) */
  track(root: THREE.Object3D): void;
  /** call once per frame, after everything that can add/remove lights ran and before the frame renders */
  update(): void;
  readonly target: number;
}

/** reserve: extra stand-ins for point lights that join later (perf: streamed POIs, tracked via engine.onPointLight) */
export function createLightBalancer(scene: THREE.Scene, reserve = 0): LightBalancer {
  const known: THREE.PointLight[] = [];
  const has = new Set<THREE.Light>();
  const add = (l: THREE.PointLight) => { if (!has.has(l) && !l.castShadow) { has.add(l); known.push(l); } };
  // every point light the world built (POI fires / braziers), found once at boot
  scene.traverse((o) => { if ((o as THREE.PointLight).isPointLight && !o.userData.krDummy) add(o as THREE.PointLight); });
  // (perf) the engine's light reserve (engine.lightReserve: stand-ins made BEFORE the world built, so every program the
  // boot compiled while the modules were building already has the final light count) is adopted first
  const dummies: THREE.PointLight[] = [];
  scene.traverse((o) => { if ((o as THREE.PointLight).isPointLight && o.userData.krReserve) dummies.push(o as THREE.PointLight); });
  const target = Math.max(known.length + CHEST_POOL + reserve, dummies.length);
  const group = new THREE.Group(); group.name = "light-balancer";
  for (let i = dummies.length; i < target; i++) {
    const d = new THREE.PointLight(0x000000, 0, 1, 2); d.position.set(0, -5000, 0); d.userData.krDummy = true; d.castShadow = false;
    dummies.push(d); group.add(d);
  }
  scene.add(group);
  const drawn = (o: THREE.Object3D | null): boolean => { let n = o; while (n) { if (!n.visible) return false; if (n === scene) return true; n = n.parent; } return false; };
  let lastShown = -1;
  return {
    target,
    track(root: THREE.Object3D) { root.traverse((o) => { if ((o as THREE.PointLight).isPointLight && !o.userData.krDummy) add(o as THREE.PointLight); }); },
    update() {
      let on = 0;
      for (const l of known) if (drawn(l)) on++;
      const show = Math.max(0, target - on);
      if (on > target) (globalThis as unknown as { __kr?: Record<string, unknown> }).__kr && (((globalThis as unknown as { __kr: Record<string, unknown> }).__kr).lightOverflow = on - target); // (perf: a recompile of every lit program)
      if (show === lastShown) return;
      lastShown = show;
      for (let i = 0; i < dummies.length; i++) dummies[i].visible = i < show;
    },
  };
}
