// WRECK BAY — the galleon visuals. Everything is built in the SHIP FRAME (shared/pois/wreck-bay.ts: x toward the bow,
// y up, z across, shore = −z) and placed with SHIPM (= the collider transform), so the rendered decks, walls, stairs
// and cabins ARE the collider pieces. On top of the pieces: the lofted hull shell (openings cut exactly at the collider
// openings), wales, rail caps, deck planking with hatches, beams, masts, yards, tattered sails, rigging, lanterns, the
// stern gallery, the golden banana figurehead, cannons and cargo.
import * as THREE from "three";
import { M, col, cylGeo, latheGeo, tubeGeo, catenary, noise3, type ColorFn } from "../_kit/town-geo";
import type { TownBins } from "../_kit/town-materials";
import { addBarrel } from "../_kit/town-props";
import { pirateCrate, cask, CRATE_TONES } from "./props";
import { SHIP, RHO, PITCH, SH, LV, HULL, MASTS, NEST, SLAB, RAIL, PIECES, FALLEN_YARD, DECKS, QGAL, HULL_OPS, hb, sheer, sheerV, DECK_X0, deckSkirts, deckEdge, sternEnd, bowEnd, type WPiece, type Deck } from "../../../../../shared/pois/wreck-bay";

export const SHIPM = new THREE.Matrix4().compose(new THREE.Vector3(SHIP.x, SHIP.y, SHIP.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(RHO, SHIP.yaw, PITCH, "YXZ")), new THREE.Vector3(1, 1, 1));
/** ship-frame placement matrix */
export const L = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => SHIPM.clone().multiply(M(x, y, z, yaw, pitch, roll, sx, sy, sz));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(SHIPM);

export interface ShipBins { main: TownBins; near: TownBins; fine: TownBins; lod1: TownBins }

// ------------------------------------------------------------------------------------------------ palette
const GOLD = "#e6b23a", GILT = "#dca23a", HULLC = "#a8764c", WALE = "#d4a23c", RAILC = "#5e3f28", DECKC = "#c9a27a", LINING = "#b98a60";
const PANEL = "#c79a6a", IRON = "#3a3634", TIMBER = "#9a7450", SAIL = "#f7cf4e";
const soft = (c: string, k = 0.45, bright = 1.0) => new THREE.Color(1, 1, 1).lerp(new THREE.Color(c), k).multiplyScalar(bright);

const OCHRE = new THREE.Color("#e0a860"), ALGAE = new THREE.Color("#4f5a2c"), WET = new THREE.Color("#3a2c20"), BARN = new THREE.Color("#b8b0a0");
/** hull weathering in WORLD coords: wet/algae band at the waterline, barnacle flecks below, per-strake tone, grime */
const hullFn = (): ColorFn => (x, y, z, b, o) => {
  const strake = Math.floor((y + 10) / 0.31);
  const tone = 0.86 + 0.22 * (Math.sin(strake * 12.9898) * 43758.5453 % 1 + 1) % 1 * 0.9;
  const n = noise3(x * 0.35, y * 0.8, z * 0.35), n2 = noise3(x * 2.2, y * 1.7, z * 2.2);
  o.multiplyScalar(tone * (0.9 + 0.2 * n));
  if (y < 0.35) {
    const k = Math.min(1, (0.35 - y) / 0.6);
    o.lerp(y < -0.2 ? ALGAE : WET, 0.55 + 0.35 * k);
    if (y < -0.1 && n2 > 0.66) o.lerp(BARN, 0.6);
  } else if (y < 1.1) o.lerp(ALGAE, 0.35 * (1 - (y - 0.35) / 0.75) * (0.6 + 0.8 * n));
  // weathered natural timber (no painted stripes): sun-bleached upper works, a darker tarred band above the wale
  else if (y > LV.gun + 0.3 && y < LV.main - 0.55) o.lerp(OCHRE, 0.08 + 0.1 * n);
  else if (y > LV.main + 0.4) o.multiplyScalar(0.9 + 0.08 * n);
  // salt / grime streaks running down from the ports
  if (n2 > 0.72 && y > 1) o.multiplyScalar(0.82);
};

// ------------------------------------------------------------------------------------------------ hull shell
function stationsAndRows(fine: boolean, withOps: boolean) {
  const xs = new Set<number>();
  const step = fine ? 0.5 : 1.5;
  for (let x = HULL.stern; x <= HULL.bow + 1e-3; x += step) xs.add(+x.toFixed(3));
  xs.add(HULL.bow);
  // the castle steps: a station on each side of the step so the shell's top edge drops vertically there (the sheer is
  // stepped at the castle fronts and a smooth curve everywhere else — the shell's top verts follow it exactly)
  for (const x of [HULL.poopFront, HULL.qdFront, HULL.fcAft]) { xs.add(x); xs.add(+(x - 0.002).toFixed(3)); }
  if (withOps) for (const o of HULL_OPS) { xs.add(+o.x0.toFixed(3)); xs.add(+o.x1.toFixed(3)); }
  const ys = new Set<number>();
  const ystep = fine ? 0.34 : 1.0;
  for (let y = LV.keel; y <= LV.poop + RAIL + 1e-3; y += ystep) ys.add(+y.toFixed(3));
  for (const y of [0, LV.hold, LV.gun, LV.main, LV.main + RAIL, LV.qd + RAIL, LV.poop + RAIL]) ys.add(+y.toFixed(3));
  // rows through the sheer sweeps (bow over the forecastle rail, stern over the poop rail)
  for (let k = 1; k <= 7; k++) { ys.add(+(LV.fc + RAIL + k * 0.2).toFixed(3)); ys.add(+(LV.poop + RAIL + k * 0.14).toFixed(3)); }
  if (fine) for (let y = LV.keel; y < LV.hold; y += 0.17) ys.add(+y.toFixed(3)); // the round bilge
  if (withOps) for (const o of HULL_OPS) { ys.add(+o.y0.toFixed(3)); ys.add(+o.y1.toFixed(3)); }
  return { X: [...xs].sort((a, b) => a - b), Y: [...ys].sort((a, b) => a - b) };
}
/** the hull side shell (both sides) + the lower transom cap, as ship-frame geometry */
export function hullShellGeo(fine: boolean, withOps: boolean, capTo: number, off = 0): THREE.BufferGeometry {
  const { X, Y } = stationsAndRows(fine, withOps);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const nX = X.length, nY = Y.length;
  // the top edge: every vertex above the sheer is pulled down onto it (a smooth sweep, no per-cell staircase); a cell
  // whose lower edge is already on / above the sheer at both columns is empty
  const topAt = (x: number) => sheerV(x);
  const skip = (side: number, xc: number, yc: number, i: number, j: number) => {
    if (Y[j] >= topAt(X[i]) - 1e-3 && Y[j] >= topAt(X[i + 1]) - 1e-3) return true;
    if (!withOps) return false;
    for (const o of HULL_OPS) if (o.side === side && xc > o.x0 && xc < o.x1 && yc > o.y0 && yc < o.y1) return true;
    return false;
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j < nY; j++) for (let i = 0; i < nX; i++) {
      const y = Math.min(Y[j], topAt(X[i])), x = Math.min(bowEnd(y), Math.max(sternEnd(y), X[i]));
      const w = hb(x, y);
      pos.push(x, y, side * (w + (w > 0.01 ? off : 0)));
      uv.push(x, y + (6 - w) * 0.2);
    }
    for (let j = 0; j < nY - 1; j++) for (let i = 0; i < nX - 1; i++) {
      const xc = (X[i] + X[i + 1]) / 2, yc = (Y[j] + Y[j + 1]) / 2;
      if (skip(side, xc, yc, i, j)) continue;
      const a = base + j * nX + i, b = a + 1, c = a + nX + 1, d = a + nX;
      if (side > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
  }
  // the transom cap (flat, facing −x) from the keel up to `capTo`
  {
    const base = pos.length / 3;
    const rows = Y.filter((y) => y <= capTo + 1e-3);
    for (const y of rows) { const x = sternEnd(y), w = hb(x + 1e-3, y); pos.push(x - 0.005, y, -w, x - 0.005, y, w); uv.push(-w, y, w, y); }
    for (let j = 0; j < rows.length - 1; j++) { const a = base + j * 2, b = a + 1, c = a + 3, d = a + 2; idx.push(a, b, c, a, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** the wale profile: (height fraction, fraction of `off` proud) — a rounded bead with a flat-ish crown */
const PROF: Array<[number, number]> = [[0, 0], [0.04, 0.55], [0.18, 0.88], [0.4, 1], [0.6, 1], [0.82, 0.88], [0.96, 0.55], [1, 0]];
/** a raised band hugging the hull between y0..y1 (wales / gunwale strakes), `off` proud of the shell, both sides */
function bandGeo(y0: number, y1: number, off: number, xa: number, xb: number, cut: (side: number, x: number) => boolean, rise: (x: number) => number = () => 0): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const X: number[] = [];
  for (let x = xa; x < xb; x += 0.5) X.push(x);
  X.push(xb);
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (const x of X) {
      const dy = rise(x);
      // a half-round moulding (carved relief that catches the light), PROF verts per station from the bottom to the top
      for (const [t, o] of PROF) {
        const yy = y0 + dy + (y1 - y0) * t, w = hb(x, yy);
        pos.push(x, yy, side * (w + off * o));
        uv.push(x, t * (y1 - y0) + o * off);
      }
    }
    const P = PROF.length;
    for (let i = 0; i < X.length - 1; i++) {
      if (cut(side, (X[i] + X[i + 1]) / 2)) continue;
      for (let f = 0; f < P - 1; f++) {
        const a = base + i * P + f, b = a + P, c = b + 1, d = a + 1;
        if (side > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const inOpening = (side: number, x: number, y: number, kinds: string[]) => HULL_OPS.some((o) => o.side === side && kinds.includes(o.kind) && x > o.x0 - 0.1 && x < o.x1 + 0.1 && y > o.y0 - 0.05 && y < o.y1 + 0.05);

// ------------------------------------------------------------------------------------------------ decks
/** the waterway skirt boards (shared deckSkirts): sloped planks from under the deck edge up into the wall face */
function skirtGeo(d: Deck): THREE.BufferGeometry | null {
  const pos: number[] = [], uv: number[] = [];
  for (const { sd, pts } of deckSkirts(d)) for (let i = 0; i < pts.length - 1; i++) {
    const [xa, ea, fa] = pts[i], [xb, eb, fb] = pts[i + 1];
    const A = [xa, d.y - 0.03, sd * (ea - 0.04)], B = [xb, d.y - 0.03, sd * (eb - 0.04)], C = [xb, d.y + 0.5, sd * (fb + 0.04)], D = [xa, d.y + 0.5, sd * (fa + 0.04)];
    // inboard-facing (+ the back face: the skirt is seen from the deck only, but the listed frame tilts it)
    const quad = (p: number[][]) => { pos.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]); uv.push(xa, 0, xb, 0, xb, 0.5, xa, 0, xb, 0.5, xa, 0.5); };
    if (sd > 0) { quad([A, B, C, D]); quad([A, D, C, B]); } else { quad([A, D, C, B]); quad([A, B, C, D]); }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function deckGeo(d: Deck, up: boolean, inset = 0.18): THREE.BufferGeometry {
  const y = d.y;
  const xs: number[] = [];
  for (let x = DECK_X0[d.id] ?? d.x0; x < d.x1; x += 0.5) xs.push(x);
  xs.push(d.x1);
  const w = (x: number) => (inset === 0.18 ? deckEdge(d, x) : Math.max(0.05, hb(x, y - 0.15) - inset));
  const sgn = up ? -1 : 1; // shape y = −z for the top face (rotateX(−π/2)), +z for the ceiling (rotateX(+π/2))
  const s = new THREE.Shape();
  xs.forEach((x, i) => (i ? s.lineTo(x, sgn * w(x)) : s.moveTo(x, sgn * w(x))));
  for (let i = xs.length - 1; i >= 0; i--) s.lineTo(xs[i], -sgn * w(xs[i]));
  s.closePath();
  for (const h of d.holes) {
    const p = new THREE.Path();
    p.moveTo(h.x0, sgn * h.z0); p.lineTo(h.x1, sgn * h.z0); p.lineTo(h.x1, sgn * h.z1); p.lineTo(h.x0, sgn * h.z1); p.closePath();
    s.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(s, 1);
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  g.translate(0, up ? y : y - SLAB, 0);
  // ShapeGeometry UVs are the shape coords: u = x along the ship (the planks run fore–aft)
  return g;
}

// ------------------------------------------------------------------------------------------------ masts, sails, rigging
function rope(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, r: number, sag = 0, c = "#6e5536") {
  if (sag < 0.02) {
    const len = a.distanceTo(b);
    const g = cylGeo(r, r, len, 4, true);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    bins.rope.add(g, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), col(c));
    return;
  }
  bins.rope.add(tubeGeo(catenary(a, b, sag, 8), r, 4, false, 10), null, col(c));
}
/** a tattered square sail hanging from a yard: grid with billow (+x) + droop; UV into the sail atlas half `v` */
function sailGeo(w: number, h: number, billow: number, variant: 0 | 1, seed: number): THREE.BufferGeometry {
  const nx = 10, ny = 8;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / ny; // v = 0 at the yard (top)
    const z = (u - 0.5) * w * (1 - 0.12 * v);
    const y = -v * h;
    const bl = billow * Math.sin(u * Math.PI) * Math.sin(Math.min(1, v * 1.15) * Math.PI * 0.85);
    const wob = 0.12 * Math.sin(u * 9 + seed + v * 5) * v;
    pos.push(bl + wob, y, z);
    uv.push(variant * 0.5 + u * 0.5, 1 - v);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 2, d = a + nx + 1; idx.push(a, d, c, a, c, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** yards: [height, half length, sail drop] per mast (the main course yard has fallen onto the deck).
 *  `fwd`: the yard hangs this far forward of the mast (the main course clears the spiral stair + nest around it).
 *  Every sail's foot stays ≥ 2.3 m over the deck under it (no clipping kongs). */
const YARDS: Record<string, Array<{ y: number; half: number; drop: number; sail: boolean; v: 0 | 1; fwd?: number }>> = {
  fore: [{ y: 18.6, half: 9.0, drop: 5.8, sail: true, v: 0 }, { y: 25.6, half: 7.4, drop: 6.8, sail: true, v: 1 }],
  main: [{ y: 20.5, half: 9.4, drop: 8.6, sail: true, v: 0, fwd: 2.2 }, { y: 31.0, half: 7.6, drop: 6.9, sail: true, v: 1 }],
  mizzen: [{ y: 21.0, half: 6.4, drop: 7.2, sail: true, v: 1 }],
};

function addMasts(B: ShipBins, rng: () => number) {
  const m = B.main, nb = B.near;
  for (const ms of MASTS) {
    const yb = LV.hold, h = ms.top - yb;
    const mastC = soft(TIMBER, 0.55, 0.95);
    m.wood.add(cylGeo(ms.r * 0.62, ms.r, h, 12), L(ms.x, yb + h / 2, 0), mastC);
    // iron hoops + a mast cap + truck
    for (let y = LV.main + 1.2; y < ms.top - 1; y += 1.6) nb.metal.add(cylGeo(ms.r * (1.03 - 0.38 * (y - yb) / h) + 0.02, ms.r * (1.03 - 0.38 * (y - yb) / h) + 0.02, 0.1, 12), L(ms.x, y, 0), col(IRON));
    m.wood.add(cylGeo(ms.r * 0.75, ms.r * 0.75, 0.3, 10), L(ms.x, ms.top + 0.15, 0), col("#6a4a30"));
    // mast partners at the main deck (wedges ring)
    nb.wood.add(cylGeo(ms.r * 1.45, ms.r * 1.6, 0.22, 12), L(ms.x, (ms.id === "fore" ? LV.fc : ms.id === "mizzen" ? LV.qd : LV.main) + 0.11, 0), col("#7a5a3a"));
    // yards + sails
    for (const yd of YARDS[ms.id]) {
      const yx = ms.x + (yd.fwd ?? ms.r + 0.25);
      m.wood.add(cylGeo(0.13, 0.22, yd.half, 8), L(yx, yd.y, yd.half / 2, 0, Math.PI / 2, 0), mastC);
      m.wood.add(cylGeo(0.22, 0.13, yd.half, 8), L(yx, yd.y, -yd.half / 2, 0, Math.PI / 2, 0), mastC);
      if (yd.fwd) for (const s of [1, -1]) rope(nb, V(yx, yd.y + 0.1, s * 1.2), V(ms.x, yd.y + 3.2, 0), 0.03);
      // yard slings + lifts
      rope(nb, V(ms.x + ms.r, yd.y + 0.3, 0), V(ms.x, Math.min(ms.top - 0.4, yd.y + 3), 0), 0.035);
      for (const s of [1, -1]) rope(nb, V(ms.x + ms.r + 0.25, yd.y, s * yd.half * 0.95), V(ms.x, Math.min(ms.top - 0.3, yd.y + 3.5), 0), 0.02);
      if (yd.sail) {
        const tint = soft(SAIL, 0.9, 1.0).lerp(new THREE.Color("#e8d7a0"), rng() * 0.25);
        m.fabric.add(sailGeo(yd.half * 1.85, yd.drop, 0.9 + rng() * 0.4 + yd.drop * 0.05, yd.v, rng() * 10), L(yx + 0.2, yd.y - 0.1, 0), tint);
        // lod1: a flat quad (the far sail)
        B.lod1.fabric.box(0.05, yd.drop * 0.85, yd.half * 1.7, L(yx + 0.45, yd.y - yd.drop * 0.45, 0), tint);
        // sheets: from the clews down to the rails
        for (const s of [1, -1]) {
          const clew = V(yx + 0.2, yd.y - yd.drop * 0.95, s * yd.half * 0.8);
          const to = V(ms.x + (ms.id === "fore" ? -2.5 : 2.5), sheer(ms.x) + 0.1, s * (hb(ms.x, sheer(ms.x)) - 0.2));
          rope(nb, clew, to, 0.018, 0.3);
        }
      }
    }
    // lod1 mast
    B.lod1.wood.add(cylGeo(ms.r * 0.62, ms.r, ms.top - LV.main, 6), L(ms.x, (LV.main + ms.top) / 2, 0), mastC);
    for (const yd of YARDS[ms.id]) B.lod1.wood.box(0.3, 0.3, yd.half * 2, L(ms.x + (yd.fwd ?? ms.r + 0.25), yd.y, 0), mastC);
  }
  // the fallen main course yard: lying diagonally across the waist, one end on the bulwark (cover + story)
  {
    const a = new THREE.Vector3(...FALLEN_YARD.a), b = new THREE.Vector3(...FALLEN_YARD.b);
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.wood.add(cylGeo(0.2, 0.14, len, 8), SHIPM.clone().multiply(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1))), soft(TIMBER, 0.55, 0.9));
    // its sail, still bent to the yard's inboard half, draped over the deck in folds: a heightfield resting ON the deck
    // (every vertex ≥ 4 cm above it), rising to the yard along its bound edge — clear of the main hatch, the mast and
    // the spiral (it starts where the yard passes x < 0.6)
    {
      const nu = 16, nv = 7, t0 = 0.52, t1 = 0.98, across = 1.7;
      const pz2 = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize(); // toward the hatch side (−z)
      if (pz2.z > 0) pz2.negate();
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv, t = t0 + (t1 - t0) * u;
        const onYard = a.clone().lerp(b, t);
        const p = onYard.clone().add(pz2.clone().multiplyScalar(v * across * (0.85 + 0.15 * Math.sin(u * 7.1))));
        const fold = 0.06 + 0.16 * Math.abs(Math.sin(u * Math.PI * 3.3 + v * 1.7)) * (0.4 + 0.6 * v) + 0.05 * Math.sin(v * 9 + u * 4);
        const lift = (onYard.y - 0.18 - LV.main) * Math.pow(1 - v, 3);
        pos.push(p.x, LV.main + Math.max(0.04, fold) + Math.max(0, lift), p.z);
        uv.push(u * 0.5, 0.35 + v * 0.45);
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const q = j * (nu + 1) + i; idx.push(q, q + nu + 1, q + 1, q + 1, q + nu + 1, q + nu + 2); }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); sg.setIndex(idx); sg.computeVertexNormals();
      m.fabric.add(sg, SHIPM, soft(SAIL, 0.8, 0.92));
    }
  }
  // bowsprit + jib boom
  {
    const x0 = 15.2, y0 = LV.fc + 0.4, ang = 0.42;
    const len = HULL.bowsprit;
    m.wood.add(cylGeo(0.14, 0.3, len, 10), L(x0 + Math.cos(ang) * len / 2, y0 + Math.sin(ang) * len / 2, 0, 0, 0, -(Math.PI / 2 - ang)), soft(TIMBER, 0.55, 0.9));
    B.lod1.wood.box(len, 0.35, 0.35, L(x0 + Math.cos(ang) * len / 2, y0 + Math.sin(ang) * len / 2, 0, 0, 0, ang), soft(TIMBER, 0.55, 0.9));
    const tip = new THREE.Vector3(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, 0);
    // stays: fore truck → bowsprit tip; main truck → fore truck; mizzen → main
    const fore = MASTS[0], main = MASTS[1], miz = MASTS[2];
    rope(nb, V(fore.x, fore.top - 0.5, 0), V(tip.x, tip.y, 0), 0.04, 0.2);
    rope(nb, V(fore.x, 22.5, 0), V(tip.x - 3, tip.y - 1.2, 0), 0.035, 0.3);
    rope(nb, V(main.x, main.top - 0.6, 0), V(fore.x, fore.top - 0.8, 0), 0.04, 0.4);
    rope(nb, V(main.x, NEST.y + 2.9, 0), V(fore.x, 19.2, 0), 0.04, 0.4);
    rope(nb, V(miz.x, miz.top - 0.4, 0), V(main.x, NEST.y + 1.5, 0), 0.035, 0.3);
    // the hanging chain from the bowsprit to the bow (bobstay chain) — chunky links as a tube
    rope(nb, V(tip.x - 1.2, tip.y - 0.5, 0), V(17.2, 3.2, 0), 0.07, 0.9, "#3a3430");
    // the beakhead: a pointed grating platform + curved head rails running forward of the stem under the bowsprit
    {
      const bx = bowEnd(LV.main - 0.5), by = LV.main - 0.4;
      const shp = new THREE.Shape(); shp.moveTo(0, -1.4); shp.lineTo(3.2, -0.25); shp.lineTo(3.6, 0); shp.lineTo(3.2, 0.25); shp.lineTo(0, 1.4); shp.closePath();
      const bg = new THREE.ExtrudeGeometry(shp, { depth: 0.22, bevelEnabled: false }); bg.rotateX(-Math.PI / 2); bg.translate(0, 0, 0);
      m.woodDark.add(bg, L(bx - 0.6, by, 0), soft(DECKC, 0.5, 0.85));
      for (const s of [1, -1]) {
        const pts = [new THREE.Vector3(bx - 1.5, LV.fc + 0.2, s * 1.6), new THREE.Vector3(bx + 0.4, by + 1.2, s * 1.1), new THREE.Vector3(bx + 2.4, by + 0.6, s * 0.45), new THREE.Vector3(bx + 3.0, by + 0.25, 0)].map((p) => p.applyMatrix4(SHIPM));
        m.wood.add(tubeGeo(pts, 0.1, 6, false, 14), null, soft(WALE, 0.85, 1.1));
      }
    }
    // (the figurehead + beakhead carving: carving.ts)
  }
  // shrouds + ratlines: from the channels (outside the hull at the sheer) up to the mast heads / the nest rim
  for (const ms of MASTS) {
    const topY = ms.id === "main" ? NEST.y : ms.id === "fore" ? 23.5 : 19.0;
    const topR = ms.id === "main" ? NEST.rOut - 0.15 : 0.9;
    const chanY = sheer(ms.x) - 0.35;
    for (const s of [1, -1]) {
      const n = 4, pts: Array<[THREE.Vector3, THREE.Vector3]> = [];
      for (let i = 0; i < n; i++) {
        const dx = -1.4 + i * 0.95;
        const w = hb(ms.x + dx, chanY) + 0.45;
        const a = new THREE.Vector3(ms.x + dx, chanY, s * w), b = new THREE.Vector3(ms.x + dx * 0.25, topY, s * topR);
        pts.push([a, b]);
        rope(nb, V(a.x, a.y, a.z), V(b.x, b.y, b.z), 0.035);
      }
      // deadeyes + the channel board
      m.wood.box(4.2, 0.12, 0.5, L(ms.x - 0.0, chanY, s * (hb(ms.x, chanY) + 0.25)), col(RAILC));
      // ratlines (every 0.42 m) between the outer shrouds
      const [a0, b0] = pts[0], [a1, b1] = pts[n - 1];
      const steps = Math.floor((topY - chanY) / 0.42);
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const p = a0.clone().lerp(b0, t), q = a1.clone().lerp(b1, t);
        rope(nb, V(p.x, p.y, p.z), V(q.x, q.y, q.z), 0.014);
      }
      // backstays from the mast top down to the rail behind
      rope(nb, V(ms.x, ms.top - 1, 0), V(ms.x - 4.5, sheer(ms.x - 4.5) - 0.3, s * (hb(ms.x - 4.5, sheer(ms.x - 4.5)) + 0.3)), 0.03, 0.3);
    }
    if (ms.id === "main") for (let i = 0; i < 6; i++) {
      // topmast shrouds from the nest rim to the masthead
      const a = (i / 6) * Math.PI * 2 + 0.3;
      rope(nb, V(ms.x + Math.cos(a) * (NEST.rOut - 0.1), NEST.y + RAIL, Math.sin(a) * (NEST.rOut - 0.1)), V(ms.x, ms.top - 1.2, 0), 0.025);
    }
  }
}

// ------------------------------------------------------------------------------------------------ props (ship frame)
/** a ship's lantern (hanging from `at`, origin = the top ring): iron cap + base, four bars, a warm glowing core */
export function lantern(bins: TownBins, at: THREE.Matrix4) {
  const iron = col("#2b2622");
  bins.metal.add(cylGeo(0.02, 0.02, 0.18, 5), at.clone().multiply(M(0, -0.09, 0)), iron);
  bins.metal.add(cylGeo(0.05, 0.15, 0.1, 8), at.clone().multiply(M(0, -0.22, 0)), iron);
  for (let i = 0; i < 4; i++) bins.metal.box(0.025, 0.3, 0.025, at.clone().multiply(M(Math.cos(i * Math.PI / 2 + 0.78) * 0.11, -0.42, Math.sin(i * Math.PI / 2 + 0.78) * 0.11)), iron);
  bins.metal.add(cylGeo(0.14, 0.12, 0.06, 8), at.clone().multiply(M(0, -0.6, 0)), iron);
  bins.bulb.add(cylGeo(0.085, 0.085, 0.26, 8), at.clone().multiply(M(0, -0.42, 0)), col("#ffc86a"));
}
function cannon(bins: TownBins, m: THREE.Matrix4, outboard: number, rng: () => number) {
  // carriage (cheeks, axles, wheels) + an iron barrel pointing along local ±z
  const wood = soft("#8a5a34", 0.6, 0.9), iron = col(IRON);
  for (const s of [-1, 1]) bins.wood.box(0.12, 0.48, 1.3, m.clone().multiply(M(s * 0.3, 0.4, -outboard * 0.1)), wood);
  bins.wood.box(0.6, 0.12, 1.2, m.clone().multiply(M(0, 0.24, -outboard * 0.1)), wood);
  for (const zz of [-0.45, 0.45]) {
    bins.wood.add(cylGeo(0.05, 0.05, 0.85, 6), m.clone().multiply(M(0, 0.2, zz - outboard * 0.1, 0, 0, Math.PI / 2)), wood);
    for (const s of [-1, 1]) bins.wood.add(cylGeo(0.2, 0.2, 0.1, 12), m.clone().multiply(M(s * 0.42, 0.2, zz - outboard * 0.1, 0, 0, Math.PI / 2)), soft("#6a4428", 0.6, 0.85));
  }
  const prof: Array<[number, number]> = [[0, 0], [0.2, 0], [0.24, 0.08], [0.22, 0.2], [0.2, 0.25], [0.19, 1.3], [0.17, 1.35], [0.16, 1.9], [0.19, 1.95], [0.19, 2.05], [0.12, 2.06], [0.1, 2.0], [0, 2.0]];
  bins.metal.add(latheGeo(prof, 14), m.clone().multiply(M(0, 0.62, -outboard * 1.05, 0, outboard * Math.PI / 2, 0)), iron, (x, y, z, b, o) => { if (noise3(x * 5, y * 5, z * 5) > 0.6) o.lerp(new THREE.Color("#6a3a22"), 0.4); });
  bins.metal.add(new THREE.SphereGeometry(0.1, 8, 6), m.clone().multiply(M(0, 0.62, -outboard * 1.12)), iron);
  void rng;
}
function barrelsIn(bins: TownBins, m: THREE.Matrix4, hx: number, hy: number, hz: number, rng: () => number) {
  // upright coopered casks filling the footprint (props.ts: bulging staves, iron hoops, a board head, a bung)
  const nx = Math.max(1, Math.round(hx * 2 / 0.64)), nz = Math.max(1, Math.round(hz * 2 / 0.64));
  const r = Math.min(hx / nx, hz / nz) * 0.96;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = -hx + (i + 0.5) * (hx * 2 / nx), z = -hz + (k + 0.5) * (hz * 2 / nz);
    cask(bins, m.clone().multiply(M(x, -hy, z, rng() * 6)), r, hy * 2, rng, ["#8a5a32", "#7a4e2c", "#96683e"][Math.floor(rng() * 3)]);
  }
}
/** a floor-to-deck-head cargo stack (hold / gun deck): two tiers of big sea crates, a top tier of small crates + a
 *  lashed barrel packed up to the deck beams, and a rope cargo net thrown over the long faces — reads as stowed cargo,
 *  not a wall of tiles (the collider is the whole box: the visual fills it within a few cm) */
function cargoStack(bins: TownBins, fine: TownBins, m: THREE.Matrix4, hx: number, hy: number, hz: number, rng: () => number) {
  const H = hy * 2, t1 = Math.min(1.05, H * 0.37), t2 = Math.min(1.0, H * 0.35), t3 = H - t1 - t2;
  const w = () => CRATE_TONES[Math.floor(rng() * 4)];
  // hand-built plank crates (props.ts: chamfered frame, iron corner brackets, rope handles, painted marks)
  pirateCrate(bins, m.clone().multiply(M(0, -hy, 0, (rng() - 0.5) * 0.03)), hx * 2 - 0.1, t1, hz * 2 - 0.1, rng, w());
  const long = hx >= hz, n2 = 2;
  for (let i = 0; i < n2; i++) {
    const u = -1 + (2 * i + 1) / n2, sx = long ? hx * 2 / n2 - 0.12 : hx * 2 - 0.12, sz = long ? hz * 2 - 0.12 : hz * 2 / n2 - 0.12;
    pirateCrate(bins, m.clone().multiply(M(long ? u * hx * 0.98 : (rng() - 0.5) * 0.04, -hy + t1, long ? (rng() - 0.5) * 0.04 : u * hz * 0.98, (rng() - 0.5) * 0.08)), sx, t2, sz, rng, w(), rng() < 0.5);
  }
  // top tier: a small crate + a barrel on its side, packed to the beams
  const cw = long ? hx : hx * 2 - 0.1, cd = long ? hz * 2 - 0.1 : hz;
  pirateCrate(bins, m.clone().multiply(M(long ? -hx / 2 : 0, -hy + t1 + t2, long ? 0 : -hz / 2, (rng() - 0.5) * 0.1)), cw - 0.12, t3, cd - 0.12, rng, w());
  // a barrel on its side (axis along the stack's long side), scaled to the tier left over
  const sr = Math.min(1, (t3 - 0.02) / 0.64), sl = Math.min(1, ((long ? hx : hz) - 0.08) / 0.88);
  addBarrel(bins, m.clone().multiply(M(long ? hx / 2 : 0, -hy + t1 + t2 + t3 / 2, long ? 0 : hz / 2, long ? 0 : Math.PI / 2, 0, Math.PI / 2)).multiply(M(0, -0.44 * sl, 0, 0, 0, 0, sr, sl, sr)), "#7a5232", false);
  // the cargo net over both long faces (a rope grid from the top down to 1.3 m above the floor) + lashings
  const faces = long ? [{ ax: "x" as const, s: rng() < 0.5 ? 1 : -1 }] : [{ ax: "z" as const, s: rng() < 0.5 ? 1 : -1 }];
  const rc = col("#b89f6c");
  for (const f of faces) {
    const L2 = f.ax === "x" ? hx : hz, off = (f.ax === "x" ? hz : hx) + 0.025;
    const top = hy - 0.02, bot = -hy + 1.3;
    for (let u = -L2 + 0.15; u <= L2 - 0.1; u += 0.34) {
      const at = f.ax === "x" ? M(u, (top + bot) / 2, f.s * off) : M(f.s * off, (top + bot) / 2, u);
      fine.rope.box(0.03, top - bot, 0.03, m.clone().multiply(at), rc);
    }
    for (let y = bot; y <= top; y += 0.34) {
      const at = f.ax === "x" ? M(0, y, f.s * off) : M(f.s * off, y, 0);
      fine.rope.box(f.ax === "x" ? L2 * 2 : 0.03, 0.03, f.ax === "x" ? 0.03 : L2 * 2, m.clone().multiply(at), rc);
    }
  }
}
function cratesIn(bins: TownBins, m: THREE.Matrix4, hx: number, hy: number, hz: number, rng: () => number, fine?: TownBins) {
  if (fine && hy * 2 > 2.0) { cargoStack(bins, fine, m, hx, hy, hz, rng); return; }
  const n = Math.max(1, Math.round((hy * 2) / 0.62));
  const h = (hy * 2) / n;
  for (let i = 0; i < n; i++) {
    pirateCrate(bins, m.clone().multiply(M((rng() - 0.5) * 0.02, -hy + i * h, (rng() - 0.5) * 0.02, (rng() - 0.5) * 0.04)), hx * 2 - 0.04, h, hz * 2 - 0.04, rng, CRATE_TONES[Math.floor(rng() * 4)], i === n - 1);
  }
}
export function sacksIn(bins: TownBins, m: THREE.Matrix4, hx: number, hy: number, hz: number, rng: () => number) {
  const n = Math.max(2, Math.round(hx * 2 / 0.6));
  for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
    const g = new THREE.SphereGeometry(0.34, 10, 7); g.scale(1, 0.62 * hy / 0.4, 0.8);
    bins.fabric.add(g, m.clone().multiply(M(-hx + (i + 0.5) * (hx * 2 / n), -hy + 0.2 + k * 0.28, (k - 0.5) * hz * 0.8, rng())), soft("#c8b088", 0.7, 0.95));
  }
}

/** draw one ship-frame piece */
function drawShipPiece(B0: ShipBins, p: WPiece, rng: () => number) {
  const [cx, cy, cz] = p.c, [hx, hy, hz] = p.h;
  // below the main deck, cargo / crates / casks take the lantern-fill variants (they read at 10 m in the hold)
  const below = cy < LV.main - 0.3 && (p.k === "crates" || p.k === "barrels" || p.k === "sacks" || p.k === "shotbox");
  const B: ShipBins = below ? { ...B0, near: { ...B0.fine, wood: B0.fine.tin, woodDark: B0.fine.paving }, main: { ...B0.main, wood: B0.main.tin, woodDark: B0.main.paving } } : B0;   // (inside the hull: the fine bins)
  const m = L(cx, cy, cz, p.yaw ?? 0);
  const uvo = (): [number, number] => [rng() * 3, rng() * 3];
  switch (p.k) {
    case "floor": case "bilge": case "mast": case "qgal": case "sweep": case "srail": return; // (sweep: a smooth band in buildShip; srail: carving.ts)
    case "lining": {
      // inner planking: a 0.1 m board on the inboard face (the outer face is the lofted shell)
      const inb = cz > 0 ? -1 : 1;
      const lz = (hz - 0.05) * inb * Math.sign(Math.cos(p.yaw ?? 0)) ;
      // the board runs 0.35 m down through the deck under it (no crack at the deck / lining junction to see the sea through)
      B.near.inner.box(hx * 2 + 0.04, hy * 2 + 0.35, 0.1, m.clone().multiply(M(0, -0.175, lz)), soft(LINING, 0.5, 0.95), [cx - hx, cy - hy - 0.35]);
      // top cap where the lining ends under the rail
      return;
    }
    case "transom": B.main.clapboard.box(hx * 2, hy * 2, hz * 2, m, soft(HULLC, 0.6, 0.92), [cz - hx, cy - hy], hullFn()); return;
    case "panel": {
      B.main.trim.box(hx * 2, hy * 2, hz * 2, m, soft(PANEL, 0.55, 1.0), [cz - hx, cy - hy]);
      // framing posts at both ends
      for (const s of [-1, 1]) if (hx > 0.3) B.near.wood.box(0.14, hy * 2, hz * 2 + 0.06, m.clone().multiply(M(s * (hx - 0.07), 0, 0)), soft("#7a5232", 0.6, 0.9));
      return;
    }
    case "rail": {
      // breastwork rail: balusters + top rail + a bottom board
      B.main.wood.box(hx * 2, 0.12, hz * 2 + 0.1, m.clone().multiply(M(0, hy - 0.06, 0)), soft(RAILC, 0.6, 1.0));
      B.main.wood.box(hx * 2, 0.22, hz * 2, m.clone().multiply(M(0, -hy + 0.11, 0)), soft(RAILC, 0.6, 1.0));
      const n = Math.max(1, Math.round(hx * 2 / 0.32));
      for (let i = 0; i < n; i++) B.near.wood.add(latheGeo([[0, 0], [0.05, 0], [0.07, 0.15], [0.045, 0.35], [0.07, 0.55], [0.05, hy * 2 - 0.34], [0, hy * 2 - 0.34]], 6), m.clone().multiply(M(-hx + (i + 0.5) * (hx * 2 / n), -hy + 0.22, 0)), soft("#8a5a34", 0.6, 1.0));
      return;
    }
    case "stair": {
      B.main.woodDark.box(hx * 2, hy * 2, hz * 2, m, soft(DECKC, 0.4, 0.92), uvo());
      B.near.wood.box(hx * 2 + 0.03, 0.05, hz * 2, m.clone().multiply(M(0.015, hy - 0.025, 0)), soft("#6a4a30", 0.6, 0.95));
      return;
    }
    case "coaming": B.main.wood.box(hx * 2, hy * 2, hz * 2, m, soft(RAILC, 0.6, 1.0)); return;
    case "peg": {
      B.main.woodDark.box(hx * 2, hy * 2, hz * 2, m, soft(DECKC, 0.45, 0.9), uvo());
      // a knee bracket under each tread into the mast
      B.near.wood.box(0.5, 0.1, 0.08, m.clone().multiply(M(-hx + 0.3, -0.18, 0, 0, 0, 0.5)), soft("#6a4a30", 0.6, 0.9));
      return;
    }
    case "spiralrail": {
      // a stanchion at the tread's outer end + two rope runs (the rope sags between stanchions)
      B.near.wood.box(0.06, hy * 2, 0.06, m.clone().multiply(M(0, 0, -hz + 0.03)), soft("#6a4a30", 0.6, 0.9));
      for (const dy of [hy - 0.05, 0]) B.near.rope.box(0.03, 0.03, hz * 2, m.clone().multiply(M(0, dy, 0)), col("#b89f6c"));
      return;
    }
    case "nest": B.main.woodDark.box(hx * 2, hy * 2, hz * 2, m, soft(DECKC, 0.4, 0.95), uvo()); return;
    case "nestrail": {
      B.main.wood.box(0.1, 0.1, hz * 2, m.clone().multiply(M(0, hy - 0.05, 0)), soft(RAILC, 0.6, 1.0));
      B.main.wood.box(0.08, 0.08, hz * 2, m.clone().multiply(M(0, 0, 0)), soft(RAILC, 0.6, 1.0));
      for (const s of [-1, 1]) B.main.wood.box(0.09, hy * 2, 0.09, m.clone().multiply(M(0, 0, s * (hz - 0.05))), soft(RAILC, 0.6, 0.95));
      // a sailcloth screen lashed to the lower rail (a crow's-nest basket)
      B.near.louvre.box(0.04, hy * 1.1, hz * 2, m.clone().multiply(M(0.02, -hy * 0.35, 0)), soft("#d8b060", 0.7, 0.9));
      return;
    }
    case "cannon": case "deckgun": {
      const out = Math.sign(cz) || 1;
      cannon(B.near, L(cx, cy - hy, cz, p.yaw ?? 0), out, rng);
      return;
    }
    case "shotbox": {
      // a shot locker: plank box with iron corner straps, a pyramid of cannonballs on its lid, a rammer leaning on it
      B.near.wood.box(hx * 2, hy * 2, hz * 2, m, soft("#8a5a34", 0.6, 0.92), uvo());
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.near.metal.box(0.05, hy * 2 + 0.01, 0.05, m.clone().multiply(M(sx * (hx - 0.02), 0, sz * (hz - 0.02))), col(IRON));
      const ball = new THREE.SphereGeometry(0.085, 8, 6);
      for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) B.fine.metal.add(ball, m.clone().multiply(M((i - 1) * 0.17, hy + 0.085, (k - 1) * 0.17)), col("#2a2624"));
      for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) B.fine.metal.add(ball, m.clone().multiply(M((i - 0.5) * 0.17, hy + 0.23, (k - 0.5) * 0.17)), col("#2a2624"));
      B.fine.metal.add(ball, m.clone().multiply(M(0, hy + 0.37, 0)), col("#2a2624"));
      B.near.wood.add(cylGeo(0.025, 0.025, 1.9, 5), m.clone().multiply(M(hx + 0.08, 0.5, 0, 0, 0, -0.35)), soft("#9a7450", 0.6, 0.9));
      return;
    }
    case "keg": barrelsIn(B.near, m, hx, hy, hz, rng); return;
    case "barrels": barrelsIn(B.near, m, hx, hy, hz, rng); return;
    case "crates": cratesIn(B.near, m, hx, hy, hz, rng, B.fine); return;
    case "sacks": sacksIn(B.fine, m, hx, hy, hz, rng); return;
    case "stanchion": B.near.wood.box(hx * 2, hy * 2, hz * 2, m, soft("#7a5232", 0.6, 0.9)); return;
    case "table": {
      B.near.trim.box(hx * 2, 0.08, hz * 2, m.clone().multiply(M(0, hy - 0.04, 0)), soft("#a0703f", 0.6, 1.0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.near.wood.box(0.09, hy * 2 - 0.08, 0.09, m.clone().multiply(M(sx * (hx - 0.1), -0.04, sz * (hz - 0.1))), soft("#6a4428", 0.6, 0.9));
      // a chart, a candle, a bottle
      B.fine.louvre.box(0.8, 0.01, 0.55, m.clone().multiply(M(0.1, hy + 0.005, 0, 0.3)), soft("#efe0b8", 0.8, 1.0));
      B.fine.bulb.add(cylGeo(0.035, 0.035, 0.14, 6), m.clone().multiply(M(-hx * 0.6, hy + 0.07, hz * 0.4)), col("#fff2c0"));
      B.fine.glass.add(cylGeo(0.05, 0.07, 0.3, 8), m.clone().multiply(M(hx * 0.5, hy + 0.15, -hz * 0.3)), col("#3a6a3a"));
      return;
    }
    case "bunk": {
      B.near.trim.box(hx * 2, hy * 2 - 0.2, hz * 2, m.clone().multiply(M(0, -0.1, 0)), soft("#8a5a34", 0.6, 0.9));
      B.near.louvre.box(hx * 2 - 0.1, 0.18, hz * 2 - 0.1, m.clone().multiply(M(0, hy - 0.1, 0)), soft("#c83a2a", 0.6, 0.9));
      return;
    }
    case "shelf": {
      B.near.trim.box(hx * 2, hy * 2, hz * 2, m, soft("#8a5a34", 0.6, 0.85));
      for (let i = 0; i < 4; i++) B.fine.glass.add(cylGeo(0.05, 0.06, 0.26, 7), m.clone().multiply(M(hx + 0.02, -hy + 0.4 + i * 0.45, (rng() - 0.5) * hz * 1.4)), col(["#3a6a3a", "#6a3a2a", "#3a4a6a"][i % 3]));
      return;
    }
    case "flue": B.near.metal.add(cylGeo(0.13, 0.13, hy * 2, 8), m, col("#2a2624")); return;
    case "stove": {
      B.near.metal.box(hx * 2, hy * 2, hz * 2, m, col("#2a2624"));
      B.fine.bulb.box(0.4, 0.2, 0.02, m.clone().multiply(M(hx + 0.01, -hy * 0.3, 0, Math.PI / 2)), col("#ff9a3a"));
      return;
    }
    case "capstan": {
      B.near.wood.add(latheGeo([[0, 0], [0.55, 0], [0.4, 0.12], [0.3, 0.5], [0.36, 0.9], [0.5, 1.0], [0.5, 1.1], [0, 1.1]], 14), m.clone().multiply(M(0, -hy, 0)), soft("#8a5a34", 0.6, 0.95));
      for (let i = 0; i < 6; i++) B.near.wood.box(1.9, 0.08, 0.08, m.clone().multiply(M(0, hy - 0.05, 0, i * Math.PI / 6)), soft("#7a5232", 0.6, 0.9));
      return;
    }
    case "wheel": {
      B.near.wood.box(0.35, hy * 1.1, 0.5, m.clone().multiply(M(0, -hy * 0.45, 0)), soft("#7a5232", 0.6, 0.9));
      B.near.wood.add(new THREE.TorusGeometry(0.62, 0.05, 6, 20), m.clone().multiply(M(0.12, hy * 0.3, 0, Math.PI / 2)), soft("#8a5a34", 0.6, 1.0));
      for (let i = 0; i < 8; i++) B.near.wood.box(0.04, 1.5, 0.04, m.clone().multiply(M(0.12, hy * 0.3, 0, 0, i * Math.PI / 8, 0).multiply(M(0, 0, 0, Math.PI / 2, 0, 0)).multiply(M(0, 0, 0, 0, 0, 0))), soft("#8a5a34", 0.6, 1.0));
      return;
    }
    default: B.near.wood.box(hx * 2, hy * 2, hz * 2, m, col("#8a6a44"));
  }
}

// ------------------------------------------------------------------------------------------------ the ship
export async function buildShip(B: ShipBins, rng: () => number, yieldTask: () => Promise<void> = async () => {}): Promise<{ glows: THREE.Vector3[]; pools: Array<[number, number, number, number]> }> {
  const glows: THREE.Vector3[] = [];
  const pools: Array<[number, number, number, number]> = [];
  const m = B.main, nb = B.near, fb = B.fine;
  // hull shell (outer) — exact openings; the castles' fronts / transom above the gun deck come from the pieces
  m.clapboard.add(hullShellGeo(true, true, LV.gun), SHIPM, soft(HULLC, 0.62, 0.98), hullFn());
  // wales: gold-painted bands (below the gun ports, at the gun deck, under the main rail, castle rails)
  const noGap = (side: number, x: number) => inOpening(side, x, LV.main + 0.3, ["gap"]) ;
  const noBreach = (side: number, x: number) => inOpening(side, x, 1.6, ["breach"]);
  m.metal.add(bandGeo(1.55, 1.95, 0.12, -17.7, 16.4, noBreach), SHIPM, col(GILT));
  m.metal.add(bandGeo(LV.gun - 0.3, LV.gun + 0.15, 0.13, -17.8, 17.0, () => false), SHIPM, col(GILT));
  // the main wale sweeps UP toward the bow and the stern (the galleon's sheer line), a dark sheer strake above it
  const sheerRise = (x: number) => 1.1 * Math.pow(Math.abs(x - 1) / 18, 2.2);
  m.metal.add(bandGeo(LV.main - 0.7, LV.main - 0.3, 0.12, -17.9, 17.6, noGap, sheerRise), SHIPM, col(GILT));
  m.wood.add(bandGeo(LV.main - 0.3, LV.main - 0.1, 0.05, -17.9, 17.6, noGap, sheerRise), SHIPM, col("#3a2616"));
  m.metal.add(bandGeo(LV.qd - 0.12, LV.qd + 0.22, 0.1, -17.95, HULL.qdFront, () => false), SHIPM, col(GILT));
  m.metal.add(bandGeo(LV.fc - 0.12, LV.fc + 0.22, 0.1, HULL.fcAft, 17.6, () => false), SHIPM, col(GILT));
  m.metal.add(bandGeo(LV.poop - 0.12, LV.poop + 0.22, 0.1, -17.95, HULL.poopFront, () => false), SHIPM, col(GILT));
  // a dark lower-hull band (tar) from the keel to the waterline
  // rail caps along the sheer
  {
    const X: number[] = [];
    for (let x = HULL.stern; x < 17.6; x += 0.5) X.push(x);
    for (const s of [1, -1]) for (let i = 0; i < X.length - 1; i++) {
      const x0 = X[i], x1 = X[i + 1], xc = (x0 + x1) / 2, y = sheerV(xc);
      if (inOpening(s, xc, y - 0.2, ["gap"])) continue;
      // along the sweeps the cap follows the slope (no staircase); at a castle step both ends differ by a storey → flat
      const ya = sheerV(x0 + 1e-3), yb = sheerV(x1 - 1e-3), dy = Math.abs(yb - ya) < 0.6 ? yb - ya : 0;
      const w0 = hb(x0, y), w1 = hb(x1, y), run = Math.hypot(x1 - x0, w1 - w0), len = Math.hypot(run, dy);
      const yaw = Math.atan2(-(s * (w1 - w0)), x1 - x0);
      m.wood.box(len + 0.04, 0.14, 0.44, L(xc, (dy ? (ya + yb) / 2 : y) - 0.04, s * ((w0 + w1) / 2 - 0.1), yaw, 0, Math.atan2(dy, run)), soft(RAILC, 0.65, 1.0));   // (top 3 cm over the wall collider: stand-on parity)
    }
    // the sweep bulwarks' inner planking (bow + stern above the castle rails): one smooth band per side, 0.32 m inboard
    // of the shell (= the collider walls' inner face), from 0.3 m below the castle rail up to the sheer
    for (const [xa, xb] of [[13.0, 17.3], [HULL.stern + 0.05, -16.0]] as Array<[number, number]>) {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const XS: number[] = []; for (let x = xa; x < xb - 1e-3; x += 0.25) XS.push(x); XS.push(xb);
      for (const s of [1, -1]) {
        const base = pos.length / 3;
        for (const x of XS) {
          const yb = sheer(x) - 0.3, yt = sheerV(x) + 0.02;
          pos.push(x, yb, s * (hb(x, yb) - 0.33), x, yt, s * (hb(x, yt) - 0.33));
          uv.push(x, yb, x, yt);
        }
        for (let i = 0; i < XS.length - 1; i++) { const a = base + i * 2, b = a + 2, c = a + 3, d = a + 1; if (s < 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      nb.inner.add(g, SHIPM, soft(LINING, 0.5, 0.95));
    }
    // transom top cap
    m.wood.box(0.44, 0.14, 2 * hb(HULL.stern + 0.2, LV.poop + RAIL) + 0.1, L(HULL.stern + 0.1, LV.poop + RAIL + sheerRise(HULL.stern) + 0.07, 0), soft(RAILC, 0.65, 1.0));
    // castle step ends (vertical posts where the sheer steps)
    for (const x of [HULL.poopFront, HULL.qdFront, HULL.fcAft]) for (const s of [1, -1]) {
      const y0 = Math.min(sheer(x - 0.01), sheer(x + 0.01)), y1 = Math.max(sheer(x - 0.01), sheer(x + 0.01));
      m.wood.box(0.3, y1 - y0 + 0.14, 0.44, L(x, (y0 + y1) / 2 + 0.07, s * (hb(x, y1) - 0.1)), soft(RAILC, 0.65, 1.0));
    }
  }
  // opening frames (gun ports with open red lids, windows with glass + mullions, the breach with torn planks)
  for (const o of HULL_OPS) {
    const xc = (o.x0 + o.x1) / 2, yc = (o.y0 + o.y1) / 2, w = o.x1 - o.x0, h = o.y1 - o.y0;
    const zs = o.side * (hb(xc, yc) - 0.14);
    const at = (dx: number, dy: number, dz = 0, yaw = 0, pitch = 0, roll = 0) => L(xc + dx, yc + dy, zs + o.side * dz, yaw, pitch, roll);
    if (o.kind === "port" || o.kind === "window") {
      const fr = soft(o.kind === "port" ? "#5a3a24" : RAILC, 0.65, 1.0), d = 0.46;
      nb.wood.box(w + 0.2, 0.1, d, at(0, h / 2 + 0.05), fr); nb.wood.box(w + 0.2, 0.1, d, at(0, -h / 2 - 0.05), fr);
      nb.wood.box(0.1, h, d, at(w / 2 + 0.05, 0), fr); nb.wood.box(0.1, h, d, at(-w / 2 - 0.05, 0), fr);
      if (o.kind === "port") {
        // lid hinged at the top, propped open ~70°, red inside
        nb.wood.box(w + 0.1, 0.08, h + 0.08, L(xc, o.y1 + 0.05, o.side * (hb(xc, o.y1) + 0.12), 0, -o.side * 1.2, 0).multiply(M(0, 0, o.side * (h / 2))), col("#7a2a1e"));
      } else {
        nb.wood.box(0.06, h, 0.08, at(0, 0, -0.02), fr); nb.wood.box(w, 0.06, 0.08, at(0, 0, -0.02), fr);
      }
    } else if (o.kind === "breach") {
      // splintered plank ends around the hole
      for (let y = o.y0; y < o.y1; y += 0.3) for (const e of [0, 1]) {
        const len = 0.2 + rng() * 0.9, x = e ? o.x1 + len / 2 - 0.2 : o.x0 - len / 2 + 0.2;
        m.clapboard.box(len, 0.26, 0.1, L(x + (e ? -1 : 1) * rng() * 0.3, y + 0.15, o.side * (hb(x, y) - 0.02), (rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.25), soft(HULLC, 0.62, 0.8), [rng() * 3, rng() * 3], hullFn());
      }
      for (let i = 0; i < 5; i++) {
        const x = o.x0 + rng() * w, len = 0.8 + rng() * 1.5;
        m.clapboard.box(len, 0.24, 0.08, L(x, o.y1 - 0.1 - rng() * 0.2, o.side * (hb(x, o.y1) + 0.05), (rng() - 0.5) * 0.6, 0, -0.5 - rng() * 0.8), soft(HULLC, 0.62, 0.8), [rng() * 3, rng() * 3]);
      }
      // ribs showing through
      for (let x = o.x0 + 0.5; x < o.x1 - 0.2; x += 0.9) m.wood.box(0.2, h + 0.3, 0.3, L(x, yc, o.side * (hb(x, yc) - 0.25)), soft("#6a4428", 0.6, 0.8));
    }
  }
  // stern gallery: carved frame + balcony rail under the great cabin windows + stern lanterns
  {
    const x = HULL.stern - 0.05, w = hb(HULL.stern + 0.2, LV.main + 1);
    nb.wood.box(0.2, 0.3, 2 * w, L(x - 0.1, LV.main + 0.75, 0), soft(WALE, 0.8, 1.0));
    nb.wood.box(0.2, 0.25, 2 * w, L(x - 0.1, LV.main + 2.25, 0), soft(WALE, 0.8, 1.0));
    nb.wood.box(0.2, 0.25, 2 * w * 0.9, L(x - 0.1, LV.qd + 2.05, 0), soft(WALE, 0.8, 1.0));
    for (const u of [-3.2, -1.1, 1.1, 3.2]) {
      nb.wood.box(0.08, 1.0, 0.06, L(x + 0.1, LV.main + 1.5, u), col(RAILC)); nb.wood.box(0.08, 0.06, 1.1, L(x + 0.1, LV.main + 1.5, u), col(RAILC));
      for (const e of [-1, 1]) nb.wood.box(0.3, 1.2, 0.12, L(x - 0.05, LV.main + 1.5, u + e * 0.61), soft(WALE, 0.8, 1.05));
      nb.wood.box(0.3, 0.12, 1.34, L(x - 0.05, LV.main + 2.08, u), soft(WALE, 0.8, 1.05));
    }
    for (const u of [-2.2, 0, 2.2]) { nb.wood.box(0.08, 0.8, 0.06, L(x + 0.1, LV.qd + 1.4, u), col(RAILC)); for (const e of [-1, 1]) nb.wood.box(0.3, 1.0, 0.12, L(x - 0.05, LV.qd + 1.4, u + e * 0.56), soft(WALE, 0.8, 1.05)); }
    // the gallery walk (visual trim, 0.5 m) + balusters
    nb.wood.box(0.7, 0.1, 2 * w - 0.4, L(x - 0.35, LV.main - 0.1, 0), soft(RAILC, 0.6, 0.95));
    for (let z = -w + 0.4; z <= w - 0.4; z += 0.35) nb.wood.box(0.06, 0.8, 0.06, L(x - 0.62, LV.main + 0.35, z), soft(WALE, 0.7, 0.9));
    nb.wood.box(0.12, 0.08, 2 * w - 0.4, L(x - 0.62, LV.main + 0.78, 0), soft(RAILC, 0.6, 0.95));
    // three stern lanterns
    for (const [u, yy] of [[0, LV.poop + RAIL + 0.3], [-3.2, LV.poop + RAIL + 0.1], [3.2, LV.poop + RAIL + 0.1]] as Array<[number, number]>) {
      nb.metal.add(cylGeo(0.03, 0.03, 0.9, 5), L(x + 0.3, yy + 0.45, u), col(IRON));
      nb.metal.add(latheGeo([[0, 0], [0.18, 0], [0.26, 0.2], [0.26, 0.55], [0.14, 0.75], [0.05, 0.85], [0, 0.85]], 8), L(x + 0.3, yy + 0.9, u), col("#b88a2a"));
      nb.bulb.add(new THREE.SphereGeometry(0.16, 8, 6), L(x + 0.3, yy + 1.28, u), col("#ffd27a"));
      glows.push(V(x + 0.3, yy + 1.28, u));
    }
  }
  // ---- hull storytelling (both sides, visual only on a solid hull — nothing that reads as an opening): holes patched
  // with boards nailed across, planks sprung off the frames, barnacle crusts at the waterline, a quarter gallery on each
  // stern corner, the carved banana crest over the stern windows
  {
    const patch = (side: number, x: number, y: number, n: number) => {
      const z = side * (hb(x, y) + 0.03);
      // the dark hole behind the boards (reads as damage, but the boards cover it — no false opening)
      nb.woodDark.add(new THREE.CircleGeometry(0.55, 7), L(x, y, z + side * 0.005, side > 0 ? 0 : Math.PI).multiply(M(0, 0, 0, 0, 0, 0, 1.2, 0.8, 1)), col("#1e140c"));
      for (let k = 0; k < n; k++) {
        const ang = (rng() - 0.5) * 0.7 + (k % 2 ? 0.35 : -0.25);
        nb.clapboard.box(1.5 + rng() * 0.3, 0.22, 0.06, L(x + (k - (n - 1) / 2) * 0.12, y + (k - (n - 1) / 2) * 0.24, z + side * (0.04 + k * 0.012), 0, 0, ang), soft("#b08a5a", 0.6, 0.9 + rng() * 0.2), [rng() * 3, rng() * 3]);
        for (const e of [-0.6, 0.6]) nb.metal.add(cylGeo(0.022, 0.022, 0.02, 5), L(x + e * Math.cos(ang) + (k - (n - 1) / 2) * 0.12, y + e * Math.sin(ang) + (k - (n - 1) / 2) * 0.24, z + side * (0.08 + k * 0.012), 0, Math.PI / 2, 0), col("#2a2420"));
      }
    };
    patch(SH, 8.2, 2.3, 3); patch(SH, -12.2, 3.0, 2); patch(-SH, 4.5, 2.6, 3); patch(SH, 12.8, 6.4, 2);
    // sprung planks: a strake torn loose, its end curling off the frames
    for (const [side, x0, y, len] of [[SH, -1.0, 1.35, 3.2], [-SH, -8.5, 2.1, 2.6], [SH, 13.2, 3.4, 2.2]] as Array<[number, number, number, number]>) {
      const zc = side * (hb(x0 + len / 2, y) + 0.08);
      nb.clapboard.box(len, 0.26, 0.07, L(x0 + len / 2, y, zc, side * 0.12, 0, (rng() - 0.5) * 0.08), soft(HULLC, 0.62, 0.85), [rng() * 3, rng() * 3], hullFn());
      nb.clapboard.box(0.9, 0.26, 0.07, L(x0 + len + 0.35, y + 0.08, side * (hb(x0 + len, y) + 0.3), side * 0.5, 0, 0.1), soft(HULLC, 0.62, 0.8), [rng() * 3, rng() * 3], hullFn());
    }
    // barnacle crusts along the waterline (world y ≈ 0 … −0.5 → the ship-frame height varies with the list + trim)
    const bar = new THREE.IcosahedronGeometry(0.07, 0);
    for (let i = 0; i < 260; i++) {
      const side = rng() < 0.5 ? 1 : -1, x = -16 + rng() * 31;
      for (let yy = LV.keel + 0.2; yy < LV.gun; yy += 0.1) {
        const w = V(x, yy, side * hb(x, yy));
        if (w.y > -0.05 + rng() * 0.25) {
          const y2 = yy - rng() * 0.45;
          nb.rock.add(bar, L(x, y2, side * (hb(x, y2) + 0.02), rng() * 6, rng() * 6, 0, 0.6 + rng() * 1.3, 0.5 + rng() * 0.6, 0.6 + rng() * 1.3), soft("#d8d0bc", 0.6, 0.8 + rng() * 0.25));
          break;
        }
      }
    }
    // quarter galleries: enclosed stern balconies bulging off both quarters of the great cabin (gold-framed windows,
    // a domed roof) — the carved-stern silhouette
    for (const side of [1, -1]) {
      const { x0, x1, y0, y1, out } = QGAL;
      const w = hb((x0 + x1) / 2, (y0 + y1) / 2);
      const zc = side * (w + out / 2 - 0.05);
      m.clapboard.box(x1 - x0, y1 - y0, out, L((x0 + x1) / 2, (y0 + y1) / 2, zc), soft(HULLC, 0.62, 0.95), [0, 0], hullFn());
      m.metal.box(x1 - x0 + 0.12, 0.16, out + 0.1, L((x0 + x1) / 2, y0, zc), col(GILT));
      m.metal.box(x1 - x0 + 0.12, 0.14, out + 0.1, L((x0 + x1) / 2, y1, zc), col(GILT));
      const dome = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      m.wood.add(dome, L((x0 + x1) / 2, y1 + 0.05, zc, 0, 0, 0, (x1 - x0) / 2 + 0.05, 0.55, out / 2 + 0.08), soft("#5a3a24", 0.6, 0.95));
      m.metal.add(new THREE.SphereGeometry(0.12, 8, 6), L((x0 + x1) / 2, y1 + 0.66, zc), col(GILT));
      // an under-gallery finial (the carved drop below it)
      m.metal.add(new THREE.ConeGeometry(0.35, 0.9, 8), L((x0 + x1) / 2, y0 - 0.45, zc, 0, 0, Math.PI), col(GILT));
      for (const xw of [x0 + 0.47, x1 - 0.47]) {
        const zf = side * (w + out - 0.03);
        nb.glass.box(0.56, 0.8, 0.03, L(xw, (y0 + y1) / 2 + 0.1, zf), col("#ffd88a"));
        nb.wood.box(0.7, 0.08, 0.06, L(xw, (y0 + y1) / 2 + 0.54, zf + side * 0.02), col(GOLD));
        nb.wood.box(0.7, 0.08, 0.06, L(xw, (y0 + y1) / 2 - 0.34, zf + side * 0.02), col(GOLD));
        nb.wood.box(0.05, 0.8, 0.06, L(xw, (y0 + y1) / 2 + 0.1, zf + side * 0.02), col(GOLD));
      }
    }
    // the stern crest: a carved shield with a golden banana over the stern-gallery windows (transom top)
    {
      const x = HULL.stern - 0.12, y = LV.poop - 0.35;
      const sh = new THREE.Shape(); sh.moveTo(-1.3, 0.9); sh.lineTo(1.3, 0.9); sh.quadraticCurveTo(1.35, -0.4, 0, -1.1); sh.quadraticCurveTo(-1.35, -0.4, -1.3, 0.9);
      const cg = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 });
      m.metal.add(cg, L(x - 0.05, y, 0, -Math.PI / 2), col("#c88a22"));
      const bp = [new THREE.Vector3(x - 0.3, y - 0.55, -0.55), new THREE.Vector3(x - 0.36, y - 0.1, -0.2), new THREE.Vector3(x - 0.36, y + 0.3, 0.25), new THREE.Vector3(x - 0.3, y + 0.55, 0.6)].map((p) => p.applyMatrix4(SHIPM));
      m.plastic.add(tubeGeo(bp, 0.17, 10, false, 12), null, col("#ffd23a"));
      for (const s2 of [1, -1]) m.metal.add(tubeGeo([new THREE.Vector3(x - 0.1, y + 0.9, s2 * 1.3), new THREE.Vector3(x - 0.25, y + 1.3, s2 * 2.2), new THREE.Vector3(x - 0.1, y + 0.8, s2 * 3.0)].map((p) => p.applyMatrix4(SHIPM)), 0.09, 6, false, 10), null, col(GILT));
    }
  }
  await yieldTask();
  // decks: planking (top), ceilings (under), fascia at the castle edges, beams, gratings over the hatches' edges
  for (const d of DECKS) {
    (d.id === "hold" || d.id === "gun" ? m.paving : m.woodDark).add(deckGeo(d, true), SHIPM, soft(DECKC, 0.5, 1.0), (x, y, z, b, o) => { const n = noise3(x * 0.4, y, z * 0.4); o.multiplyScalar(0.88 + 0.2 * n); });
    if (d.id !== "hold") nb.stripes.add(deckGeo(d, false), SHIPM, soft(PANEL, 0.5, 0.72));
    { const sk = skirtGeo(d); if (sk) nb.inner.add(sk, SHIPM, soft(LINING, 0.5, 0.85)); }
    // beams under the deck (across the beam, every 1.5 m), skipping hatches
    if (d.id !== "hold") for (let x = d.x0 + 0.8; x < d.x1 - 0.4; x += 1.5) {
      if (d.holes.some((h) => x > h.x0 - 0.1 && x < h.x1 + 0.1)) continue;
      const w = hb(x, d.y - 0.4) - 0.3;
      if (w < 0.5) continue;
      nb.tin.box(0.18, 0.16, 2 * w, L(x, d.y - SLAB - 0.08, 0), soft("#6a4a30", 0.6, 0.85));
    }
  }
  // castle deck edges (fascia boards over the slab edge) + a moulding
  for (const [x, y] of [[HULL.qdFront, LV.qd], [HULL.poopFront, LV.poop], [HULL.fcAft, LV.fc]] as Array<[number, number]>) {
    const w = hb(x, y - 0.1) - 0.05;
    m.wood.box(0.12, SLAB + 0.1, 2 * w, L(x + (x === HULL.fcAft ? -0.06 : 0.06), y - SLAB / 2, 0), soft(WALE, 0.75, 0.95));
  }
  // hatch gratings as trim around the openings (the collider coamings are pieces)
  // pieces (walls, stairs, rails, furniture, the spiral + nest)
  await yieldTask();
  { let t = performance.now();
    for (const p of PIECES) if (p.f === "ship" && p.col < 2) { drawShipPiece(B, p, rng); if (performance.now() - t > 30) { await yieldTask(); t = performance.now(); } } }
  await yieldTask();
  await yieldTask();
  // masts, yards, sails, rigging, bowsprit, figurehead
  addMasts(B, rng);
  await yieldTask();
  // deck dressing: lanterns, rope coils, buckets, a hanging net, the ship's bell, an anchor at the bow
  {
    // every lantern also throws a warm pool on the deck under it (lightPools: the kit's dst·(1 + light) blend)
    const lamp = (x: number, y: number, z: number) => {
      lantern(nb, L(x, y + 0.6, z)); glows.push(V(x, y + 0.18, z));
      const floor = Math.max(...[LV.hold, LV.gun, LV.main, LV.qd, LV.poop].filter((f) => f < y - 0.4));
      pools.push([x, floor, z, Math.min(3.6, 1.6 + (y - floor) * 0.9)]);
    };
    lamp(HULL.qdFront + 0.3, LV.qd - SLAB - 0.55, 1.4);
    lamp(-12.6, LV.qd - SLAB - 0.55, -1.0);
    lamp(-15.2, LV.poop - SLAB - 0.55, 0.6);
    lamp(11.8, LV.fc - SLAB - 0.55, 0.5);
    lamp(-6.0, LV.main - SLAB - 0.5, 1.0);
    lamp(7.0, LV.main - SLAB - 0.5, -0.8);
    lamp(-2.5, LV.gun - SLAB - 0.5, 0.0);
    lamp(9.5, LV.gun - SLAB - 0.5, 0.0);
    // the hold: lanterns hung from the gun-deck beams (the waist + both crew berths) — cover readable at 10 m
    lamp(-12.0, LV.gun - SLAB - 0.5, 1.2);
    lamp(-4.2, LV.gun - SLAB - 0.5, -0.9);
    lamp(2.8, LV.gun - SLAB - 0.5, 1.0);
    lamp(10.0, LV.gun - SLAB - 0.5, -0.6);
    // the cargo waist reads dark otherwise — three more over the stacks and the breach
    lamp(-6.6, LV.gun - SLAB - 0.5, -1.5);
    lamp(0.4, LV.gun - SLAB - 0.5, 1.6);
    lamp(5.2, LV.gun - SLAB - 0.5, -1.2);
    lamp(-9.0, LV.main - SLAB - 0.5, 1.4);
    // the gun deck between the cannons — three more lanterns along it
    lamp(-13.5, LV.main - SLAB - 0.5, -0.8);
    lamp(1.5, LV.main - SLAB - 0.5, 1.2);
    lamp(12.5, LV.main - SLAB - 0.5, -0.5);
    // the flooded corner of the hold: a horizontal (world) water sheet in the low, aft shore-side corner of the waist —
    // the listed, stern-down floor dips under it, so the depth test draws the pool exactly where the floor is lowest
    {
      const x0 = -8.3, x1 = -3.2, zs = SH * (hb(-5.5, LV.hold + 0.1) - 0.36), zi = SH * 1.2;
      const cs = [V(x0, LV.hold, zs), V(x1, LV.hold, zs), V(x1, LV.hold, zi), V(x0, LV.hold, zi)];
      const low = Math.min(...cs.map((c) => c.y)), wy = low + 0.2;
      const g = new THREE.BufferGeometry().setFromPoints(cs.map((c) => new THREE.Vector3(c.x, wy, c.z)));
      g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      nb.metal.add(g, null, col("#15302c")); // tinted metal = a glossy dark pool that reflects the lanterns, not the sky
    }
    // the great cabin's hero dressing (a captain's quarters: red runner, candle chandelier, a treasure heap)
    {
      const y = LV.main, x0 = -16.9, x1 = -10.95;
      nb.louvre.box(x1 - x0, 0.016, 1.15, L((x0 + x1) / 2, y + 0.01, 0), col("#8e1d1a"));
      for (const e of [-0.5, 0.5]) nb.louvre.box(x1 - x0 - 0.1, 0.018, 0.06, L((x0 + x1) / 2, y + 0.012, e), col("#d8a838"));
      for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.2) nb.louvre.box(0.3, 0.018, 0.3, L(x, y + 0.012, 0, Math.PI / 4), col("#d8a838"));
      // chandelier: a wrought ring on three chains, six candles with flames (emissive), hung under the deck beams
      const cx = -14.8, cyy = LV.qd - SLAB - 0.72;
      nb.metal.add(new THREE.TorusGeometry(0.46, 0.035, 6, 20), L(cx, cyy, 0, 0, Math.PI / 2, 0), col("#3a3028"));
      nb.metal.add(new THREE.TorusGeometry(0.2, 0.025, 5, 14), L(cx, cyy + 0.18, 0, 0, Math.PI / 2, 0), col("#3a3028"));
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; rope(nb, V(cx + Math.cos(a) * 0.44, cyy, Math.sin(a) * 0.44), V(cx, LV.qd - SLAB - 0.02, 0), 0.012, 0, "#2a2420"); }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3, px = cx + Math.cos(a) * 0.46, pz = Math.sin(a) * 0.46;
        nb.metal.add(cylGeo(0.05, 0.035, 0.05, 8), L(px, cyy + 0.04, pz), col("#b88a2a"));
        fb.bulb.add(cylGeo(0.028, 0.028, 0.16, 6), L(px, cyy + 0.14, pz), col("#fff2d0"));
        fb.bulb.add(new THREE.ConeGeometry(0.022, 0.07, 6), L(px, cyy + 0.26, pz), col("#ffb040"));
      }
      glows.push(V(cx, cyy + 0.2, 0));
      // a heap of plunder in the stern corner: gold, a spilled goblet, gems
      const heap = new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); heap.scale(1.1, 0.5, 0.9);
      nb.plastic.add(heap, L(-16.1, y + 0.01, -2.2), col("#ffc830"), (px, py, pz, b, o) => { if (noise3(px * 11, py * 11, pz * 11) > 0.52) o.multiplyScalar(1.4); });
      nb.bronze.add(latheGeo([[0, 0], [0.07, 0], [0.02, 0.04], [0.02, 0.14], [0.08, 0.2], [0.09, 0.3], [0, 0.26]], 10), L(-15.5, y + 0.02, -1.7, 0, 0, 1.4), col("#d8a838"));
      for (const [gx, gz, gc] of [[-16.0, -2.0, "#e8304a"], [-16.3, -2.4, "#30a8e8"], [-15.9, -2.5, "#40d060"]] as Array<[number, number, string]>) fb.glass.add(new THREE.OctahedronGeometry(0.06), L(gx, y + 0.3, gz), col(gc));
      for (let k = 0; k < 26; k++) fb.plastic.add(cylGeo(0.05, 0.05, 0.014, 8), L(-16.1 + (rng() - 0.3) * 1.8, y + 0.01, -2.2 + (rng() - 0.5) * 1.6, rng() * 6, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3), col("#ffd040"));
    }
    // spilled cargo in the hold waist: a split sack of coins by the stair foot, loose coins across the planks
    {
      const heap = new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); heap.scale(1.2, 0.35, 0.9);
      nb.plastic.add(heap, L(0.2, LV.hold + 0.01, SH * 2.4), col("#ffc830"), (x, y, z, b, o) => { if (noise3(x * 11, y * 11, z * 11) > 0.52) o.multiplyScalar(1.4); });
      for (let k = 0; k < 30; k++) fb.plastic.add(cylGeo(0.05, 0.05, 0.014, 8), L(0.2 + (rng() - 0.5) * 2.4, LV.hold + 0.01, SH * (2.4 + (rng() - 0.5) * 1.6), rng() * 6, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3), col("#ffd040"));
    }
    // rope coils on the main deck (flat tori)
    for (const [x, z] of [[-2.8, SH * 4.3], [4.2, -SH * 4.2], [10.4, SH * 3.9], [-11.5, -SH * 3.9]] as Array<[number, number]>) {
      const y = x < HULL.qdFront ? LV.qd : x > HULL.fcAft ? LV.fc : LV.main;
      for (let k = 0; k < 3; k++) fb.rope.add(new THREE.TorusGeometry(0.34 - k * 0.07, 0.035, 5, 16), L(x, y + 0.04 + k * 0.06, z, 0, Math.PI / 2, 0), col("#b89f6c"));
    }
    // the ship's bell on the forecastle rail
    nb.bronze.add(latheGeo([[0, 0.34], [0.12, 0.33], [0.16, 0.2], [0.2, 0], [0, 0]], 12), L(HULL.fcAft + 0.3, LV.fc + RAIL + 0.3, 0), col("#b88a2a"));
    // anchor hanging at the bow (shore side)
    const ax = 13.6, az = SH * (hb(13.6, LV.main) + 0.35);
    nb.metal.box(0.14, 2.4, 0.14, L(ax, LV.main - 1.2, az), col(IRON));
    nb.metal.add(new THREE.TorusGeometry(0.75, 0.08, 6, 14, Math.PI), L(ax, LV.main - 2.35, az, 0, 0, Math.PI), col(IRON));
    nb.metal.box(1.2, 0.1, 0.1, L(ax, LV.main + 0.0, az), col(IRON));
    rope(nb, V(ax, LV.main + 0.1, az), V(ax - 1.5, LV.main + RAIL, SH * (hb(12, LV.main) - 0.1)), 0.05, 0.2, "#3a3430");
  }
  // ---------------------------------------------------------------- LOD1: a coarse closed hull + deck slabs + castle fronts
  {
    const lb = B.lod1;
    lb.clapboard.add(hullShellGeo(false, false, LV.poop + RAIL), SHIPM, soft(HULLC, 0.62, 0.9), hullFn());
    for (const d of DECKS) if (d.id !== "hold" && d.id !== "gun") {
      const xm = (d.x0 + d.x1) / 2, w = hb(xm, d.y - 0.2) - 0.25;
      lb.woodDark.box(d.x1 - d.x0, 0.2, 2 * w, L(xm, d.y - 0.2, 0), soft(DECKC, 0.5, 0.9));
    }
    const fw = (x: number, y: number) => 2 * (hb(x, y) - 0.1);
    lb.clapboard.box(0.3, LV.qd - LV.main, fw(HULL.qdFront, LV.main + 1), L(HULL.qdFront - 0.15, (LV.main + LV.qd) / 2, 0), soft(PANEL, 0.5, 0.85));
    lb.clapboard.box(0.3, LV.poop - LV.qd, fw(HULL.poopFront, LV.qd + 1), L(HULL.poopFront - 0.15, (LV.qd + LV.poop) / 2, 0), soft(PANEL, 0.5, 0.85));
    lb.clapboard.box(0.3, LV.fc - LV.main, fw(HULL.fcAft, LV.main + 1), L(HULL.fcAft + 0.15, (LV.main + LV.fc) / 2, 0), soft(PANEL, 0.5, 0.85));
  }
  return { glows, pools };
}

/** the far proxy of the ship (TownLod proxy: hull box + masts + sail boards) */
export function shipProxy(proxyGeo: (g: THREE.BufferGeometry, m: THREE.Matrix4 | null, c: string) => void) {
  proxyGeo(hullShellGeo(false, false, LV.poop + RAIL), SHIPM, "#8a5a38");
  for (const ms of MASTS) {
    proxyGeo(new THREE.CylinderGeometry(ms.r * 0.6, ms.r, ms.top - LV.main, 5), L(ms.x, (LV.main + ms.top) / 2, 0), "#6a4a30");
    // the sails are the landmark from the plane: full size, bright banana yellow, thick enough to hold a pixel edge-on
    // (from the plane at ~600 m the ship is ~30 px — the proxy sails are 1.35× oversize and 1.1 m thick, a
    //  readable billow from above; a red pennant on each truck; a surf ring outlines the hull on the turquoise)
    for (const yd of YARDS[ms.id]) if (yd.sail) proxyGeo(new THREE.BoxGeometry(1.1, yd.drop * 1.3, yd.half * 1.9 * 1.35), L(ms.x + (yd.fwd ?? ms.r + 0.25) + 0.9, yd.y - yd.drop * 0.62, 0), "#ffd024");
    proxyGeo(new THREE.BoxGeometry(0.3, 2.2, 4.2), L(ms.x - 0.2, ms.top + 1.0, ms.id === "main" ? -2.2 : -1.6), "#d8281c");
  }
  // the surf ring: a flat white band around the waterline (world-horizontal, an ellipse along the keel)
  {
    const pos: number[] = [], idx: number[] = [], N = 40, c = Math.cos(SHIP.yaw), s = Math.sin(SHIP.yaw);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      for (const [rx, rz] of [[20.5, 7.2], [23.5, 9.6]]) {
        const lx = Math.cos(a) * rx, lz = Math.sin(a) * rz;
        pos.push(SHIP.x + lx * c + lz * s, 0.25, SHIP.z - lx * s + lz * c);
      }
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if ((g.attributes.normal as THREE.BufferAttribute).getY(0) < 0) g.setIndex(idx.map((_, k) => idx[k - (k % 3) + [0, 2, 1][k % 3]]));
    g.computeVertexNormals();
    proxyGeo(g, null, "#f2f8f6");
  }
}

// ------------------------------------------------------------------------------------------------ below-deck light
/** warm light pools on the decks under the lanterns (multiplicative dst·(1 + light), the interiors kit's blend: planks
 *  stay planks, a dark deck gets a warm pool) + soft dusty light shafts slanting in through the gun ports and the hold
 *  ports. Two meshes (one draw each), ship frame. */
export function belowDeckLight(pools: Array<[number, number, number, number]>): THREE.Group {
  const grp = new THREE.Group(); grp.name = "wreckbay:below-light";
  {
    const pos: number[] = [], colr: number[] = [], idx: number[] = [], N = 24;
    for (const [x, y, z, r] of pools) {
      const b = pos.length / 3;
      pos.push(x, y + 0.025, z); colr.push(0.9, 0.6, 0.28);
      for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; for (const [f, k] of [[0.5, 0.55], [1, 0]] as Array<[number, number]>) { pos.push(x + Math.cos(a) * r * f, y + 0.025, z + Math.sin(a) * r * f); colr.push(0.9 * k, 0.6 * k, 0.28 * k); } }
      for (let i = 0; i < N; i++) { const a = b + 1 + i * 2; idx.push(b, a + 2, a, a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx);
    g.applyMatrix4(SHIPM); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ name: "wb:pool-light", vertexColors: true, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }));
    m.name = "wreckbay:pools-light"; m.renderOrder = 2; m.userData.castShadow = false; m.userData.farShadow = false;
    grp.add(m);
  }
  {
    const pos: number[] = [], colr: number[] = [], idx: number[] = [];
    // each shaft = two crossed soft strips through its axis (bright core, black edges, fading along its length): a
    // dusty beam with no hard silhouette from any side
    for (const o of HULL_OPS) {
      if (o.kind !== "port") continue;
      const s = o.side, len = 3.0, dir = new THREE.Vector3(0.22, -0.5, -s).normalize();
      const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2, z0 = s * (hb(cx, cy) - 0.3), hw = (o.x1 - o.x0) / 2 - 0.05, hh = (o.y1 - o.y0) / 2 - 0.05;
      const I = [0.07, 0.058, 0.036];
      for (const [ax, ay] of [[1, 0], [0, 1]] as Array<[number, number]>) {
        const b = pos.length / 3;
        for (const [t, k, fade] of [[0, 1, 1], [len * 0.5, 1.3, 0.55], [len, 1.6, 0]] as Array<[number, number, number]>) {
          for (const e of [-1, 0, 1]) {
            pos.push(cx + dir.x * t + ax * e * hw * k, cy + dir.y * t + ay * e * hh * k, z0 + dir.z * t);
            const w = e === 0 ? fade : 0; colr.push(I[0] * w, I[1] * w, I[2] * w);
          }
        }
        for (let r2 = 0; r2 < 2; r2++) for (let c2 = 0; c2 < 2; c2++) { const q = b + r2 * 3 + c2; idx.push(q, q + 1, q + 4, q, q + 4, q + 3); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx);
    g.applyMatrix4(SHIPM); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ name: "wb:shaft-beam", vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.name = "wreckbay:shafts-beam"; m.renderOrder = 3; m.userData.castShadow = false; m.userData.farShadow = false;
    grp.add(m);
  }
  return grp;
}
