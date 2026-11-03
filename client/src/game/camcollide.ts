// Third-person camera collision: the victory, spectate and death cameras
// never sit inside a wall. Uses the SAME static world as the sim (heightfield + every POI / rock / trunk box), so what
// stops a bullet stops the camera. No allocations per call.
import { makeHit, type StaticWorld } from "../../../shared/sim/world";

const H = makeHit();
/** sphere-cast approximation: the centre ray + 4 rays offset by `r` perpendicular to the segment. Returns the free
 * distance from (ox, oy, oz) toward (tx, ty, tz) (≤ the full length), already backed off by `r`. */
export function camCast(world: StaticWorld, ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, r = 0.3): number {
  const dx = tx - ox, dy = ty - oy, dz = tz - oz, L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return 0;
  // a perpendicular basis
  const ux = dx / L, uy = dy / L, uz = dz / L;
  let px = -uz, py = 0, pz = ux; let pl = Math.hypot(px, pz);
  if (pl < 1e-3) { px = 1; pz = 0; pl = 1; }
  px /= pl; pz /= pl;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
  let best = L;
  for (let k = 0; k < 5; k++) {
    const s = k === 0 ? 0 : r, a = (k - 1) * Math.PI / 2;
    const cx = k === 0 ? 0 : Math.cos(a) * s, cy = k === 0 ? 0 : Math.sin(a) * s;
    const sx = ox + px * cx + qx * cy, sy = oy + py * cx + qy * cy, sz = oz + pz * cx + qz * cy;
    world.raycast(sx, sy, sz, dx, dy, dz, 1, H, true);
    if (H.hit && H.t * L < best) best = H.t * L;
    world.raycast(sx, sy, sz, dx, dy, dz, 1, H, false);
    if (H.hit && H.t * L < best) best = H.t * L;
  }
  return best >= L ? L : Math.max(0, best - r);
}

/** free horizontal distance around a standing kong at (x, y, z): the minimum over `n` directions at knee and head
 * height (capped at `max`), plus the open sky above (≥ 4 m) — 0 when anything is inside `min` */
export function ringClearance(world: StaticWorld, x: number, y: number, z: number, max = 6, n = 16, stopBelow = 0): number {
  world.raycast(x, y + 1.0, z, 0, 1, 0, 4, H, true);
  if (H.hit) return 0;
  let m = max;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    for (const hy of HY) {
      world.raycast(x, y + hy, z, dx, 0, dz, max, H, true);
      if (H.hit && H.t < m) m = H.t;
      world.raycast(x, y + hy, z, dx, 0, dz, max, H, false);
      if (H.hit && H.t < m) m = H.t;
      if (m < stopBelow) return m;
    }
  }
  return m;
}
const HY = [0.5, 1.6, 2.6];

/** the walkable floor under (x, z) near height y (box tops and terrain), or NaN */
export function floorAt(world: StaticWorld, x: number, y: number, z: number, up = 3, down = 8): number {
  world.raycast(x, y + up, z, 0, -1, 0, up + down, H, false);
  return H.hit && H.ny > 0.7 ? H.y : NaN;
}

/**
 * The emote spot for the victory shot: the kong's own spot when it has ≥ `need` m of clear ring (and open sky), else the
 * nearest spot within 60 m that has — floor from the static world (a roof or a street, never inside a box), above the
 * sea, `ok(x, z)` true (biome filter). Returns [x, y, z] or null.
 */
export function findOpenSpot(world: StaticWorld, x: number, y: number, z: number, need = 4, ok: (x: number, z: number) => boolean = () => true): [number, number, number] | null {
  if (y > 0.2 && ok(x, z) && ringClearance(world, x, y, z, need + 0.5, 16, need) >= need) return [x, y, z];
  for (let r = 2; r <= 60; r += 2) {
    const n = Math.max(8, Math.round(r * 1.6));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
      const fy = floorAt(world, sx, y, sz);
      if (!(fy > 0.3) || Math.abs(fy - y) > 12 || !ok(sx, sz)) continue;
      if (ringClearance(world, sx, fy, sz, need + 0.5, 16, need) >= need) return [sx, fy, sz];
    }
  }
  return null;
}
