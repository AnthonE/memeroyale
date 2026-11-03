// Static collision for the authoritative sim. Terrain is the heightfield; everything built on top of it is boxes.
// An oriented box: centre, half-extents, yaw (radians, about +Y). Walls, floors, stairs-as-steps, ramps-as-thin-
// tilted-boxes (pitch), containers, crates, rocks… Visual meshes should be DERIVED from the same layout data so
// what you see is what you collide with. `surf` feeds footsteps / impacts. `noShoot` = players collide, bullets pass
// (foliage). `noWalk` = bullets hit, players pass (rarely needed).
export type Surface = "wood" | "metal" | "concrete" | "stone" | "sand" | "grass" | "water" | "foliage" | "glass" | "fabric";

export interface Box {
  c: [number, number, number];
  h: [number, number, number];
  yaw?: number;
  pitch?: number;
  surf?: Surface;
  noShoot?: boolean;
  noWalk?: boolean;
  /** a tuk-tuk drives through it (fences, hedges, crop stems): vehicles skip it, kongs and bullets do not */
  noDrive?: boolean;
  /** part of a TREE (palm / jungle-tree trunk, its roots, bamboo — shared/world/veg-scatter.ts): the trunk's
   *  axis (x, z) here. A tuk-tuk catching a tree off the nose slides off instead of stopping dead (shared/sim/vehicle.ts
   *  moveIn: the angle is taken from this axis, not from a box face); walls and rocks keep their grip */
  round?: [number, number];
}
