// WHERE THE TUK-TUKS PARK. BANANA CO. runs its three-wheeled taxis out of a handful of ranks — the town, the harbour,
// the airstrip, the plantation, the cove, the lab — not out of every POI: finding one is a reason to land there.
// Each rank is an anchor (metres east / south of its POI's centre); the tuk-tuk parks on the nearest level, open spot
// to it — on the paving or a dirt road when there is one about, nose down the road (shared/sim/vehicle.ts findParking:
// the open sky over it, both collision circles clear, room to pull out), so a POI whose layout moves keeps its taxi. Deterministic and built once per world.
import { POIS, type PoiId } from "../world/map";
import * as islet from "../pois/lobby-islet";
import { sw } from "../pois/peel-strip";
import { RANGE_LINE_X, RANGE_YAW_DOWNRANGE } from "./range";
import { ROAD_PULL, findParking } from "./vehicle";
import type { StaticWorld } from "./world";

export interface TukSpot { x: number; z: number; yaw: number; poi: number; /** VKind (default the tuk-tuk) */ kind?: number }
/** [POI, metres east, metres south, heading hint (rad), road pull (m; default ROAD_PULL — 0 = right here: a town square
 * or a farm yard whose paving is the POI's own, not the terrain's)] */
export const TUK_RANKS: ReadonlyArray<readonly [PoiId, number, number, number, number?]> = [
  // Harbour Road out past the market's ring road (a ring-road spot has one way out, between stalls); the second
  // square, by Banana Avenue
  ["mango-market", 80, -100, 0, 0], ["mango-market", -10, 27, 2.66, 0],
  // the harbour's land-side road and the quay's open apron (the container yard and the lorry apron are boxed in by
  // container stacks and fences, no way out at all)
  ["peel-harbor", 0, -90, 0, 0], ["peel-harbor", 80, 10, 0, 0],
  ["peel-strip", -40, 26, 0], ["peel-strip", 60, -24, 3.1],
  // the packing house's yard, nose down the farm road; out on the road between the banana rows
  ["the-plantation", -8, -4, 1.11, 0], ["the-plantation", -60, -30, 2, 0],
  ["coconut-cove", -6, -6, 0],
  ["cnvs-lab", 0, 40, 0],
  ["banana-temple", 20, 60, 1, 0],
];
/** how many of the ranks have a tuk-tuk waiting in one match (which ones: the match seed) */
export const TUK_FLEET = 9;

const CACHE = new WeakMap<StaticWorld, { ranks: TukSpot[]; islet: TukSpot[]; range: TukSpot[] }>();
const OUT = new Float64Array(3);
function build(world: StaticWorld) {
  let c = CACHE.get(world);
  if (c) return c;
  const taken: Array<[number, number]> = [];
  const park = (x: number, z: number, hint: number, poi: number, reach: number, into: TukSpot[], pull = 0) => {
    if (!findParking(world, x, z, reach, hint, OUT, taken, pull)) return;
    into.push({ x: OUT[0], z: OUT[1], yaw: OUT[2], poi }); taken.push([OUT[0], OUT[1]]);
  };
  c = { ranks: [], islet: [], range: [] };
  for (const [id, dx, dz, hint, pull = ROAD_PULL] of TUK_RANKS) { const i = POIS.findIndex((p) => p.id === id), P = POIS[i]; park(P.x + dx, P.z + dz, hint, i, 45, c.ranks, pull); }
  // the warm-up islet: two to play with while the plane is fuelled
  const li = POIS.findIndex((p) => p.id === "lobby-islet");
  for (const [lx, d] of [[-16, 24], [15, 30]]) { const [x, z] = islet.toWorld(lx, d); park(x, z, islet.worldYaw(0), li, 18, c.islet); }
  // the firing range: beside the rack, nose down the runway
  const ps = POIS.findIndex((p) => p.id === "peel-strip");
  for (const lz of [-14, 16]) { const [x, , z] = sw(RANGE_LINE_X - 3, lz); park(x, z, RANGE_YAW_DOWNRANGE, ps, 14, c.range); }
  CACHE.set(world, c);
  return c;
}
/** this match's taxis: TUK_FLEET of the ranks, picked by the seed — every rank POI keeps at least one (a POI with two
 * ranks may be down to one this match) */
export function fleetSpots(world: StaticWorld, seed: number): TukSpot[] {
  const all = build(world).ranks.slice();
  let h = (seed ^ 0x9e3779b9) >>> 0;
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  while (all.length > TUK_FLEET) {
    const spare = all.filter((s) => all.filter((q) => q.poi === s.poi).length > 1);
    if (!spare.length) break;
    all.splice(all.indexOf(spare[Math.floor(rnd() * spare.length)]), 1);
  }
  return all;
}
export const isletSpots = (world: StaticWorld): TukSpot[] => build(world).islet;
export const rangeSpots = (world: StaticWorld): TukSpot[] => build(world).range;
/** every rank (map icons, tools) */
export const allRanks = (world: StaticWorld): TukSpot[] => build(world).ranks;
