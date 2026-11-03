// ZIPLINES (Canopy Line) — server-authoritative, client-predicted rides on the POI cables.
//
// The cables are the exact parabolas the client draws: shared/pois/canopy-line.ts `LAYOUT.zips` (lerp(a, b, t) with
// `sag` metres of dip at mid-span, zipY). A rider hangs ZIP_HANG metres below the cable (feet), so the sim position IS
// the drawn one.
//
// Rules:
//   • attach: press E (USE) on foot within ATTACH_R of a pole, standing on its deck → you ride away from that pole
//   • ride:   speed along the cable follows its slope (gravity + air drag), clamped to [VMIN, VMAX]; VMIN is the trolley
//             motor, so every line also rides uphill (the valley → lodge return lines)
//   • detach: SPACE (jump off with a hop, keeps the ride's momentum — the glider opens over a big drop as usual), E again
//             (let go, no hop), or automatically 0.7 m before the far pole (you drop onto its deck)
//   • hands:  ONE-HANDED FIRE is allowed while riding (hip-fire only: no scope, the weapon sim runs as on foot) —
//             fights on the line; reloads and heals keep working
//   • collisions: none while riding — every cable is laid so the hanging rider clears terrain and every collider
//             (checked by a capsule sweep along every line)
//
// STATELESS beyond the Player fields the netcode already carries (x/y/z, vx/vy/vz, st): the cable is recovered from the
// position every tick (nearest cable; poles never share a point) and the ride direction from the horizontal velocity.
// The server's snapshot (f64 self state) therefore restores a ride exactly and the client replays it bit-identically.
import { LAYOUT, ZIP_HANG, zipY } from "../pois/canopy-line";
import { GRAVITY, JUMP_V } from "./const";

/** PS.Zip (shared/sim/player.ts) — kept numeric here so this module never imports player.ts (no cycle) */
export const ZIP_ST = 6;
export const ZIP = {
  /** trolley motor floor / top speed (m/s) */
  VMIN: 6.5, VMAX: 25,
  /** quadratic drag: terminal speed on a 30° line ≈ sqrt(g·sin30 / DRAG) */
  DRAG: 0.02,
  /** horizontal reach to a pole to grab its trolley (m); vertical window of the feet relative to the pole's deck */
  ATTACH_R: 2.4, ATTACH_DY: [-0.6, 1.4] as const,
  /** the ride starts / ends this many metres (horizontal) out from each pole */
  END_M: 0.7,
  /** jump-off hop (fraction of JUMP_V) */
  HOP: 0.75,
};

export interface ZipLine {
  id: string;
  ax: number; ay: number; az: number; bx: number; by: number; bz: number; sag: number;
  /** the decks the poles stand on */
  ya: number; yb: number;
  dx: number; dz: number; L2: number; Lh: number;
  /** ride range in t */
  t0: number; t1: number;
}
export const ZIP_LINES: ZipLine[] = LAYOUT.zips.map((z) => {
  const dx = z.b[0] - z.a[0], dz = z.b[2] - z.a[2], L2 = dx * dx + dz * dz, Lh = Math.sqrt(L2);
  return { id: z.id, ax: z.a[0], ay: z.a[1], az: z.a[2], bx: z.b[0], by: z.b[1], bz: z.b[2], sag: z.sag, ya: z.ya, yb: z.yb, dx, dz, L2, Lh, t0: ZIP.END_M / Lh, t1: 1 - ZIP.END_M / Lh };
});

/** the subset of Player the ride touches (structural: no import of player.ts) */
export interface ZipRider {
  st: number; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  grounded: boolean; crouch: boolean; sprint: boolean; slope: boolean; swim: boolean; scoped: boolean;
  coyote: number; jumpBuf: number; airT: number; fallV: number;
}
const cableY = (L: ZipLine, t: number) => L.ay + (L.by - L.ay) * t - 4 * L.sag * t * (1 - t);
/** d(cable y)/dt */
const cableDY = (L: ZipLine, t: number) => (L.by - L.ay) - 4 * L.sag * (1 - 2 * t);
void zipY;

/** the pole a player on foot could grab: nearest end within reach (returns line index * 2 + end) or -1 */
export function zipNear(x: number, y: number, z: number): number {
  let best = -1, bd = ZIP.ATTACH_R * ZIP.ATTACH_R;
  for (let i = 0; i < ZIP_LINES.length; i++) {
    const L = ZIP_LINES[i];
    for (let e = 0; e < 2; e++) {
      const px = e ? L.bx : L.ax, pz = e ? L.bz : L.az, deck = e ? L.yb : L.ya;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      const dy = y - deck;
      if (d < bd && dy > ZIP.ATTACH_DY[0] && dy < ZIP.ATTACH_DY[1]) { bd = d; best = i * 2 + e; }
    }
  }
  return best;
}

function place(p: ZipRider, L: ZipLine, t: number) {
  p.x = L.ax + L.dx * t; p.z = L.az + L.dz * t; p.y = cableY(L, t) - ZIP_HANG;
}
function toFoot(p: ZipRider) {
  p.st = 0; p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.airT = 0; p.fallV = Math.min(0, p.vy);
}

/** on foot, E pressed: grab the nearest trolley. Mutates p into the ride state; false = nothing in reach. */
export function zipAttach(p: ZipRider): boolean {
  if (p.st !== 0 || p.swim) return false;
  const k = zipNear(p.x, p.y, p.z);
  if (k < 0) return false;
  const L = ZIP_LINES[k >> 1], fromB = (k & 1) === 1;
  const t = fromB ? L.t1 : L.t0, s = fromB ? -1 : 1;
  place(p, L, t);
  const ty = cableDY(L, t), tl = Math.sqrt(L.L2 + ty * ty);
  p.vx = s * L.dx / tl * ZIP.VMIN; p.vz = s * L.dz / tl * ZIP.VMIN; p.vy = s * ty / tl * ZIP.VMIN;
  p.st = ZIP_ST; p.grounded = false; p.crouch = false; p.sprint = false; p.slope = false; p.scoped = false;
  p.coyote = 0; p.jumpBuf = 0; p.airT = 0; p.fallV = 0;
  return true;
}

/** the cable the rider hangs on (nearest to the hanging point), its t; -1 when none is within 0.5 m */
function lineOf(p: ZipRider): { i: number; t: number } {
  let bi = -1, bt = 0, bd = 0.25;
  const hy = p.y + ZIP_HANG;
  for (let i = 0; i < ZIP_LINES.length; i++) {
    const L = ZIP_LINES[i];
    let t = ((p.x - L.ax) * L.dx + (p.z - L.az) * L.dz) / L.L2;
    if (t < -0.01 || t > 1.01) continue;
    t = Math.min(1, Math.max(0, t));
    const ex = L.ax + L.dx * t - p.x, ez = L.az + L.dz * t - p.z, ey = cableY(L, t) - hy;
    const d = ex * ex + ez * ez + ey * ey;
    if (d < bd) { bd = d; bi = i; bt = t; }
  }
  return { i: bi, t: bt };
}

/** one tick of a ride. `pressed` = buttons newly down this tick (JUMP = hop off, USE = let go). */
export function stepZip(p: ZipRider, pressed: number, dt: number, JUMP: number, USE: number): void {
  const { i, t } = lineOf(p);
  if (i < 0) { toFoot(p); return; }
  const L = ZIP_LINES[i];
  const ty = cableDY(L, t), tl = Math.sqrt(L.L2 + ty * ty);
  const s = p.vx * L.dx + p.vz * L.dz >= 0 ? 1 : -1;
  if (pressed & JUMP) { toFoot(p); p.vy = Math.max(0, p.vy) + JUMP_V * ZIP.HOP; return; }
  if (pressed & USE) { toFoot(p); p.vy = Math.min(0, p.vy); return; }
  // speed along the cable: gravity's component along the ride direction, quadratic drag, motor floor
  let v = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
  const uy = s * ty / tl;
  v += (-GRAVITY * uy - ZIP.DRAG * v * v) * dt;
  if (v < ZIP.VMIN) v = ZIP.VMIN; else if (v > ZIP.VMAX) v = ZIP.VMAX;
  let tn = t + s * v * dt / tl;
  const end = s > 0 ? tn >= L.t1 : tn <= L.t0;
  if (end) tn = s > 0 ? L.t1 : L.t0;
  place(p, L, tn);
  const ty2 = cableDY(L, tn), tl2 = Math.sqrt(L.L2 + ty2 * ty2);
  p.vx = s * v * L.dx / tl2; p.vz = s * v * L.dz / tl2; p.vy = s * v * ty2 / tl2;
  if (end) {
    // arrive: drop onto the deck with a little of the momentum (no fling over the far rail)
    toFoot(p); p.vx *= 0.25; p.vz *= 0.25; p.vy = Math.min(0, p.vy) * 0.25;
  }
}

