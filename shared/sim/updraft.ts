// THE VOLCANO UPDRAFT: the summit crater of
// Ripe Peak vents a column of hot air. Walk, jump, fall or glide into it and it throws you up to redeploy height with the
// glider open — glide anywhere on the island from there (a redeploy). It also
// means nobody is stuck in the crater any more: dropping into the bowl throws you back out instead of trapping you.
// Pure deterministic math on the baked summit (shared/pois/jungle-baked.json): the server and every client prediction
// lift the same kong the same way (shared/sim/player.ts stepAir / stepPlayer). No allocations.
import { layout } from "../pois/ripe-peak";
import { PEAK_C } from "../pois/jungle-layout";

const S = layout.summit;
export const UPDRAFT = {
  /** the vent (the summit crater's axis) */
  x: PEAK_C.x, z: PEAK_C.z,
  /** crater floor / lip (y) */
  floor: S.floor, lip: S.y1,
  /** the column tops out here (≈ 260 m over the lip, ≈ 560 m above the sea — the redeploy height over most of the island) */
  top: S.y1 + 245,
  /** the column's radius: at the crater floor (the vent — the floor's outer ring, where the crater chest sits, stays
   *  standable), at the lip, and above it */
  rFloor: 4.6, rLip: 13, rAbove: 15,
  /** lift: target climb speed (m/s) in the core, the soft edge (m), the fade band under the top (m) */
  v: 44, edge: 3, fade: 45,
  /** the kick a kong standing / walking into the vent gets (m/s up) */
  kick: 16,
};

/** column radius at height y */
export function updraftR(y: number): number {
  const U = UPDRAFT;
  if (y <= U.floor) return U.rFloor;
  if (y <= U.lip) return U.rFloor + (U.rLip - U.rFloor) * ((y - U.floor) / (U.lip - U.floor));
  return U.rLip + (U.rAbove - U.rLip) * Math.min(1, (y - U.lip) / 40);
}

/** lift 0..1 at a body whose FEET are at (x, y, z): 1 in the core, a soft radial edge, fading out under the top */
export function updraftLift(x: number, y: number, z: number): number {
  const U = UPDRAFT;
  if (y < U.floor - 1.5 || y > U.top) return 0;
  const dx = x - U.x, dz = z - U.z, d2 = dx * dx + dz * dz, rr = updraftR(y) + U.edge;
  if (d2 > rr * rr) return 0;
  const d = Math.sqrt(d2), r = updraftR(y);
  const radial = d <= r ? 1 : 1 - (d - r) / U.edge;
  const vert = Math.min(1, (U.top - y) / U.fade);
  return radial * vert;
}

/** inside the vent's column at all (the trigger for a kong on foot): within the core radius, under the top */
export function inUpdraft(x: number, y: number, z: number): boolean {
  const U = UPDRAFT;
  if (y < U.floor - 1.5 || y > U.top - U.fade) return false;
  const dx = x - U.x, dz = z - U.z, r = updraftR(y);
  return dx * dx + dz * dz <= r * r;
}
