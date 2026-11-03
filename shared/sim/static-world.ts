// ONE recipe for the static collision world, used by the Node server, the browser (prediction + offline host),
// tools/netlab and tools/sim-smoke: heightfield + every POI box + vegetation trunks + terrain rocks (stacks, boulders,
// crags — terrainColliders). Client and server MUST build it from the same TerrainData bytes
// (public/assets/terrain/island.bin) AND the same POI / veg / rock code, or prediction and hit-reg disagree: `hash`
// fingerprints the WHOLE static world (terrain hash + every box on a ~1 cm irrational grid), the server sends it in "welcome" and
// a client with another world refuses to play ("GAME UPDATED — RELOAD").
import { Terrain } from "../world/terrain";
import { terrainColliders, type TerrainData } from "../world/terrain-gen";
import { allColliders } from "../pois/index";
import type { Box } from "../world/colliders";
import { vegStatic } from "./veg-colliders";
import { StaticWorld } from "./world";
import { applyPoiRockKeeps } from "../world/rock-keeps";
import { buildRoads } from "./roads";
import { buildClimbs } from "./climb-build";
import type { Climb } from "./climb";
import { exitColliders } from "../world/exits";   // cliff-stair exits out of low ground

export async function buildStaticWorld(terrain: Terrain, td: TerrainData): Promise<{ world: StaticWorld; boxes: Box[]; hash: number; climbs: Climb[] }> {
  applyPoiRockKeeps(td);   // traverse: rock keep-outs = the live POI clearings (never a stale island.bin snapshot)
  const veg = await vegStatic(terrain, td);
  const boxes = allColliders().concat(veg.boxes, terrainColliders(td), exitColliders(terrain));
  // ladders + climbable trees: their perches collide, so they join the boxes (and the hash)
  const cb = buildClimbs(terrain, veg.plants, boxes);
  for (const b of cb.boxes) boxes.push(b);
  const world = new StaticWorld(terrain, boxes);
  world.roads = buildRoads(terrain);
  world.climbs = cb.climbs;
  return { world, boxes, hash: worldHash(td.hash ?? 0, boxes), climbs: cb.climbs };
}

/** FNV-1a over the terrain hash + every box (centre, half extents, yaw, pitch on a ~1 cm / ~1 mrad grid, surface, flags),
 * in build order. Two worlds with the same hash collide identically (to a centimetre).
 * The grid is IRRATIONAL (step 1.047 cm, offset 0.318): the colliders come from decimal constants (28.3465 m …), and a
 * decimal grid (round(v*1000)) puts exactly those values on a rounding boundary — Node, Chromium and WebKit disagree
 * on the last bit of Math.sin/cos/atan2/pow, so ONE box out of 185 k landed 1 mm apart and every browser was refused.
 * On this grid a 1-ulp difference flips a cell with probability ~1e-11 per value. */
export function worldHash(terrainHash: number, boxes: Box[]): number {
  let h = 0x811c9dc5 ^ (terrainHash >>> 0);
  const mix = (v: number) => { h ^= v & 0xffff; h = Math.imul(h, 0x01000193); h ^= (v >>> 16) & 0xffff; h = Math.imul(h, 0x01000193); };
  const q = (v: number) => Math.floor(v * HASH_SCALE + HASH_OFFSET) | 0;
  mix(boxes.length);
  for (const b of boxes) {
    mix(q(b.c[0])); mix(q(b.c[1])); mix(q(b.c[2])); mix(q(b.h[0])); mix(q(b.h[1])); mix(q(b.h[2]));
    mix(q(b.yaw ?? 0)); mix(q(b.pitch ?? 0));
    let s = 0; if (b.surf) for (let i = 0; i < b.surf.length; i++) s = (s * 31 + b.surf.charCodeAt(i)) | 0;
    mix(s ^ (b.noShoot ? 0x100000 : 0) ^ (b.noWalk ? 0x200000 : 0) ^ (b.noDrive ? 0x400000 : 0) ^ (b.round ? 0x800000 : 0));
    if (b.round) { mix(q(b.round[0])); mix(q(b.round[1])); }
  }
  return h >>> 0;
}
/** cells per metre (1/0.01047 m) and the cell offset — both irrational so decimal-authored values sit mid-cell */
export const HASH_SCALE = 100 / Math.PI * 3, HASH_OFFSET = 1 / Math.PI;
