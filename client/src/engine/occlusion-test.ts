// Conservative terrain-occlusion test shared by the engine's POI occlusion cull (engine/occlusion.ts)
// and an offline estimate. A POI is OCCLUDED only if every sight line from the eye to a grid of
// points covering the top AND the sides of its bounding cylinder passes below the terrain somewhere between (with a
// safety margin): i.e. a hill or ridge hides all of it. Anything else (partly visible, over the horizon line, sea
// between) counts as visible.
export interface OccluderBox { x: number; z: number; r: number; bottom: number; top: number }

const MARGIN = 2;        // m (+ 1 % of the distance): how far the terrain must rise above a sight line to block it
const STEPS = 48;

/** true when the terrain hides every sample point of `b` from the eye */
export function poiOccluded(height: (x: number, z: number) => number, ex: number, ey: number, ez: number, b: OccluderBox): boolean {
  const dx = b.x - ex, dz = b.z - ez, d = Math.hypot(dx, dz) || 1;
  // sample points: the cylinder's silhouette seen from the eye — near / far / left / right rims at the top, the
  // left / right rims at mid height, and the centre top
  const ux = dx / d, uz = dz / d, sx = -uz, sz = ux;
  const mid = (b.top + b.bottom) * 0.5;
  const pts: Array<[number, number, number]> = [
    [b.x, b.top, b.z],
    [b.x - ux * b.r, b.top, b.z - uz * b.r], [b.x + ux * b.r, b.top, b.z + uz * b.r],
    [b.x + sx * b.r, b.top, b.z + sz * b.r], [b.x - sx * b.r, b.top, b.z - sz * b.r],
    [b.x + sx * b.r, mid, b.z + sz * b.r], [b.x - sx * b.r, mid, b.z - sz * b.r],
    [b.x + sx * b.r * 0.5, b.top, b.z + sz * b.r * 0.5], [b.x - sx * b.r * 0.5, b.top, b.z - sz * b.r * 0.5],
  ];
  for (const [px, py, pz] of pts) if (!rayBlocked(height, ex, ey, ez, px, py, pz)) return false;
  return true;
}

function rayBlocked(height: (x: number, z: number) => number, ex: number, ey: number, ez: number, px: number, py: number, pz: number): boolean {
  // march the ray, skipping the first 8 m (the ground under the eye) and the last stretch inside the POI's own radius
  const len = Math.hypot(px - ex, pz - ez);
  if (len < 30) return false;
  for (let i = 1; i < STEPS; i++) {
    const t = i / STEPS;
    if (t * len < 8) continue;
    const x = ex + (px - ex) * t, z = ez + (pz - ez) * t, y = ey + (py - ey) * t;
    // the rendered terrain LOD far away can sit a little below the full-resolution heightfield: 2 m + 1 % of the range
    if (height(x, z) > y + MARGIN + t * len * 0.01) return true;
  }
  return false;
}
