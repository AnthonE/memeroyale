// Hitscan hit-testing, shared by the authoritative server (lag-compensated) and the client (predicted hits). Both sides
// run THESE functions on bit-identical numbers (quantised snapshot poses == the server's rewind history), so what the
// shooter saw hit is what the server rules a hit. Zero allocations (results go into preallocated registers).
import { BULLET_RANGE, CROUCH_H, HITBOX, PLAYER_H, WATER_LEVEL } from "./const";
import { PF_CROUCH, PF_HITTABLE, spreadOffset } from "./player";
import { makeHit, surfaceIndex, type StaticWorld } from "./world";

export { PF_CROUCH, PF_HITTABLE };
/** a pose jump larger than this between two samples is a teleport (respawn, plane exit): never interpolate across it */
export const TELEPORT_M = 15;

/** target register layout: [x, y, z, h, yaw] per slot; h = 0 → absent. The yaw (facing) orients the hitbox: the kong's
 * head sits forward of its trunk and it is wider across the arms than it is deep (const.ts HITBOX). */
export const TARGET_STRIDE = 5;
const TAU = Math.PI * 2;
/** the snapshot's yaw quantisation (shared/net/proto.ts yawEnc / yawDec, u16 per turn) — applied on BOTH sides so the
 * server's history yaw (raw float) and the client's snapshot yaw give bit-identical hitboxes */
const qyaw = (a: number) => { const u = Math.round((a / TAU) * 65536) & 0xffff; let r = (u / 65536) * TAU; if (r > Math.PI) r -= TAU; return r; };
/** facing of a blended pose, exactly like the client draws it (shortest-arc lerp between the two samples) */
export function blendYaw(a: number, b: number, f: number): number {
  const ya = qyaw(a), yb = qyaw(b);
  let d = yb - ya; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return ya + d * f;
}

/** blend two samples exactly like the client renders them: linear position, discrete flags from the nearer sample.
 * Writes [x, y, z, hitbox height] (height 0 = not hittable, position still valid for drawing). */
export function blendPose(ax: number, ay: number, az: number, af: number, bx: number, by: number, bz: number, bf: number, f: number, out: Float64Array, o: number) {
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const near = f < 0.5;
  const fl = near ? af : bf;
  if (ex * ex + ey * ey + ez * ez > TELEPORT_M * TELEPORT_M) {
    if (near) { out[o] = ax; out[o + 1] = ay; out[o + 2] = az; } else { out[o] = bx; out[o + 1] = by; out[o + 2] = bz; }
  } else { out[o] = ax + ex * f; out[o + 1] = ay + ey * f; out[o + 2] = az + ez * f; }
  out[o + 3] = !(fl & PF_HITTABLE) ? 0 : fl & PF_CROUCH ? CROUCH_H : PLAYER_H;
}
/** interpolation fraction as it travels in an input (u16): both sides blend with exactly this value */
export const qf16 = (f: number) => Math.round((f < 0 ? 0 : f > 1 ? 1 : f) * 65535) / 65535;

/** direction of pellet k of shot `shot` (deterministic spread), unit vector into out[0..2] */
const SP = new Float64Array(2);
export function shotDir(pid: number, shot: number, k: number, spreadDeg: number, yaw: number, pitch: number, out: Float64Array) {
  spreadOffset(pid, shot, k, spreadDeg, SP);
  const y = yaw + SP[0], pt = pitch + SP[1], cp = Math.cos(pt);
  out[0] = -Math.sin(y) * cp; out[1] = Math.sin(pt); out[2] = -Math.cos(y) * cp;
}

export interface ShotResult { t: number; victim: number; zone: number; worldHit: boolean; surf: number;
  /** the cover wall the shot stopped on, −1 = none */ cover: number }
export const makeShotResult = (): ShotResult => ({ t: 0, victim: -1, zone: 0, worldHit: false, surf: 0, cover: -1 });
const HIT = makeHit();
const WATER_SURF = surfaceIndex("water");

/** swimming: a round fired from above the sea stops at the water surface (a splash there) —
 *  the part of a swimmer under the surface is in cover, a diver is out of reach. Open water only (the sea bed under the
 *  surface point, like the swim rule); the world hit is nearer when the round meets a dock / hull first. −1 = no water. */
export function waterT(world: StaticWorld, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  if (dy >= -1e-6 || oy <= WATER_LEVEL) return -1;
  const t = (WATER_LEVEL - oy) / dy;
  if (t >= maxT) return -1;
  return world.ground(ox + dx * t, oz + dz * t) < WATER_LEVEL - 0.05 ? t : -1;
}

/** ray (unit dir) vs the static world and every target slot; nearest wins. zone 1 = head. */
export function traceShot(world: StaticWorld, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, targets: Float64Array, n: number, out: ShotResult): ShotResult {
  world.raycast(ox, oy, oz, dx, dy, dz, BULLET_RANGE, HIT, true);
  let bestT = HIT.hit ? HIT.t : BULLET_RANGE, victim = -1, zone = 0;
  const wt = waterT(world, ox, oy, oz, dx, dy, dz, bestT), wet = wt >= 0;
  if (wet) bestT = wt;
  for (let i = 0; i < n; i++) {
    const o = i * TARGET_STRIDE, h = targets[o + 3]; if (h <= 0) continue;
    const t = rayCapsule(ox, oy, oz, dx, dy, dz, targets[o], targets[o + 1], targets[o + 2], h, bestT, targets[o + 4]);
    if (t >= 0 && t < bestT) { bestT = t; victim = i; zone = HEADZ; }
  }
  out.t = bestT; out.victim = victim; out.zone = zone; out.worldHit = victim < 0 && (wet || HIT.hit); out.surf = wet ? WATER_SURF : HIT.hit ? HIT.surf : 0; out.cover = victim < 0 && HIT.hit && !wet ? HIT.cover : -1;
  return out;
}

/** ray vs the kong hitbox (const.ts HITBOX) of a target standing at (cx, cy, cz) with height h facing `yaw`: a head
 * sphere forward of the trunk + elliptic cylinders (legs, the trunk with the hanging arms, the shoulders), all in the
 * target's local frame. Returns t (metres along the unit dir) or -1; sets HEADZ = 1 when the head wins. */
let HEADZ = 0;
export const lastZone = () => HEADZ;
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, h: number, maxT: number, yaw = 0): number {
  HEADZ = 0;
  const wx = ox - cx, wz = oz - cz;
  const dd = dx * dx + dz * dz;
  // broad phase: closest XZ approach of the (clamped) ray to the axis (every part lies within 1.1 m of it)
  if (dd > 1e-12) {
    let t = -(wx * dx + wz * dz) / dd; if (t < 0) t = 0; else if (t > maxT) t = maxT;
    const px = wx + dx * t, pz = wz + dz * t;
    if (px * px + pz * pz > 1.21) return -1;
  }
  // into the target's frame: rotate by -yaw (forward (-sin yaw, -cos yaw) → -z)
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const lx = wx * c - wz * s, lz = wx * s + wz * c, ldx = dx * c - dz * s, ldz = dx * s + dz * c, ly = oy - cy;
  const B = HITBOX, cr = h < PLAYER_H - 0.01;
  const hd = B.head;
  const th = raySphere(lx, ly, lz, ldx, dy, ldz, 0, hy(hd.y, cr), hd.z, hd.r, maxT);
  let tb = -1;
  for (const P of B.parts) {
    const a = P[4], bz = P[5];
    const t = rayCyl((lx - P[2]) / a, ly, (lz - P[3]) / bz, ldx / a, dy, ldz / bz, 1, hy(P[0], cr), hy(P[1], cr), maxT);
    if (t >= 0 && (tb < 0 || t < tb)) tb = t;
  }
  if (th >= 0 && (tb < 0 || th <= tb + B.headBias)) { HEADZ = 1; return th; }
  return tb;
}
/** a standing hitbox height → the crouched one (HITBOX.crouch) */
function hy(y: number, crouched: boolean): number { if (!crouched) return y; const K = HITBOX.crouch; return y > K[0] ? y - K[1] : y * K[2]; }
/** ray (origin relative to the axis foot: lx, ly, lz; any-length dir) vs a vertical cylinder of radius r between heights
 * y0..y1 above the foot; entry t (or 0 when inside) or -1 */
function rayCyl(lx: number, ly: number, lz: number, dx: number, dy: number, dz: number, r: number, y0: number, y1: number, maxT: number): number {
  const dd = dx * dx + dz * dz, c = lx * lx + lz * lz - r * r;
  let tin = -Infinity, tout = Infinity;
  if (dd > 1e-12) {
    const b = 2 * (dx * lx + dz * lz), disc = b * b - 4 * dd * c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc); tin = (-b - s) / (2 * dd); tout = (-b + s) / (2 * dd);
  } else if (c > 0) return -1;
  if (Math.abs(dy) < 1e-12) { if (ly < y0 || ly > y1) return -1; }
  else { let s0 = (y0 - ly) / dy, s1 = (y1 - ly) / dy; if (s0 > s1) { const k = s0; s0 = s1; s1 = k; } if (s0 > tin) tin = s0; if (s1 < tout) tout = s1; }
  if (tin <= tout && tout >= 0) { const t = tin > 0 ? tin : 0; if (t < maxT) return t; }
  return -1;
}
function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, sx: number, sy: number, sz: number, r: number, maxT: number): number {
  const lx = ox - sx, ly = oy - sy, lz = oz - sz;
  const a = dx * dx + dy * dy + dz * dz, b = 2 * (lx * dx + ly * dy + lz * dz), c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - 4 * a * c; if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t < maxT ? t : -1;
}
