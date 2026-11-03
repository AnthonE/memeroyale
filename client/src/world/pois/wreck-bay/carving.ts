// WRECK BAY — the galleon's carved work: what makes a pirate galleon read as
// hand-carved instead of a plank box. All in the SHIP FRAME (L = SHIPM · M), visual only except the stair balustrades,
// whose colliders are the shared "srail" pieces (drawn here at exactly those faces).
//  - relief balustrades on the inboard face of every bulwark (waist, quarterdeck, poop, forecastle): plinth, turned
//    balusters on a dark recess, a top rail, square newels with gilded caps — within 0.12 m of the collider face
//  - stair balustrades (srail pieces): a cut-string skirt per step, two turned balusters per tread, a sloped handrail,
//    newel posts with gilded finials
//  - the carved, gilded stern: pilasters with capitals between the great-cabin windows, arched window heads with
//    keystones, C-scrolls, a gilded rope moulding round the transom
//  - the beakhead: turned balusters under the head rails, gilded trailboards with volutes on the cutwater, and a carved
//    gilded figurehead (a crowned kong holding a banana aloft) on the stem
import * as THREE from "three";
import { M, col, latheGeo, tubeGeo } from "../_kit/town-geo";
import { LV, HULL, PIECES, HULL_OPS, hb, sheerV, bowEnd, type WPiece } from "../../../../../shared/pois/wreck-bay";
import { SHIPM, L, type ShipBins } from "./ship";

const GILT = "#e0a83a", GILT_DK = "#a87424", RAILC = "#5e3f28", RECESS = "#2a1a10", POSTC = "#6e4a2e";
const soft = (c: string, k = 0.45, bright = 1.0) => new THREE.Color(1, 1, 1).lerp(new THREE.Color(c), k).multiplyScalar(bright);

/** a unit-height turned baluster (vase + rings), scaled in y by the caller */
function balusterGeo(r = 0.065): THREE.BufferGeometry {
  return latheGeo([[0, 0], [r * 1.25, 0], [r * 0.8, 0.09], [r * 1.35, 0.36], [r * 0.6, 0.66], [r * 1.0, 0.8], [r * 0.75, 0.88], [r * 1.25, 0.95], [r * 1.25, 1.0], [0, 1.0]], 6);
}
const BAL = balusterGeo(), BAL_S = balusterGeo(0.05);

const opening = (side: number, x: number, y0: number, y1: number) => HULL_OPS.some((o) => o.side === side && x > o.x0 - 0.15 && x < o.x1 + 0.15 && y1 > o.y0 && y0 < o.y1);

// ------------------------------------------------------------------------------------------------ bulwark balustrades
/** runs: [x0, x1, deck y, skip ranges (stairs against the bulwark: [x0, x1, side | 0 = both])] */
const RUNS: Array<[number, number, number, Array<[number, number, number]>]> = [
  [HULL.qdFront + 0.25, HULL.fcAft - 0.25, LV.main, [[-7.35, -4.1, 0], [6.1, 9.35, 0]]],
  [HULL.poopFront + 0.2, HULL.qdFront - 0.2, LV.qd, [[-12.9, -9.6, 1]]],
  [HULL.stern + 0.6, HULL.poopFront - 0.2, LV.poop, []],
  [HULL.fcAft + 0.2, 16.4, LV.fc, []],
];
function bulwarks(B: ShipBins) {
  const n = B.near, f = B.fine;
  for (const [xa, xb, dy, skip] of RUNS) for (const s of [1, -1]) {
    const blocked = (x: number) => skip.some(([a, b, sd]) => x > a && x < b && (sd === 0 || sd === s));
    // bays of ~0.5 m between which the face may curve (each bay its own yaw)
    const step = 0.5;
    for (let x = xa; x < xb - 1e-3; x += step) {
      const x2 = Math.min(xb, x + step), xm = (x + x2) / 2;
      const top = sheerV(xm) - 0.25, h = top - dy;
      if (h < 0.5 || blocked(xm) || opening(s, xm, dy, top)) continue;
      const za = s * (hb(x, dy + h / 2) - 0.33), zb = s * (hb(x2, dy + h / 2) - 0.33), zm = (za + zb) / 2;
      const len = Math.hypot(x2 - x, zb - za), yaw = Math.atan2(-(zb - za), x2 - x);
      const inb = -s; // toward the centreline
      const at = (dx: number, y: number, dz: number) => L(xm + dx, y, zm + inb * dz, yaw);
      // dark recess behind the balusters, plinth, top rail (each 0.5 m bay: the curve is followed piecewise)
      f.woodDark.box(len + 0.01, h - 0.2, 0.012, at(0, dy + 0.1 + (h - 0.2) / 2, 0.006), col(RECESS));
      n.wood.bbox(len + 0.02, 0.17, 0.11, at(0, dy + 0.085, 0.045), soft(RAILC, 0.6, 1.0), 0.02);
      n.wood.bbox(len + 0.02, 0.1, 0.12, at(0, top - 0.05, 0.05), soft(RAILC, 0.6, 1.05), 0.02);
      // balusters (2–3 per bay) on the plinth, under the top rail
      const nb = Math.max(1, Math.round(len / 0.19));
      for (let i = 0; i < nb; i++) {
        const u = -len / 2 + (i + 0.5) * (len / nb);
        f.wood.add(BAL, at(u, dy + 0.17, 0.055).multiply(M(0, 0, 0, 0, 0, 0, 1, h - 0.27, 1)), soft("#8a5a34", 0.6, 1.0));
      }
    }
    // square newels every ~2 m with gilded caps (stop the long run reading as one fence)
    for (let x = xa; x <= xb + 1e-3; x += 2.0) {
      const top = sheerV(x) - 0.25, h = top - dy;
      if (h < 0.5 || blocked(x) || opening(s, x, dy, top)) continue;
      const z = s * (hb(x, dy + h / 2) - 0.33 - 0.07);
      n.wood.bbox(0.16, h, 0.14, L(x, dy + h / 2, z), soft(POSTC, 0.6, 1.0), 0.025);
      n.metal.bbox(0.2, 0.06, 0.18, L(x, dy + 0.2, z), col(GILT), 0.015);
      n.metal.bbox(0.2, 0.06, 0.18, L(x, top - 0.14, z), col(GILT), 0.015);
    }
  }
}

// ------------------------------------------------------------------------------------------------ stair balustrades
function stairRails(B: ShipBins) {
  const n = B.near, f = B.fine;
  const groups = new Map<string, WPiece[]>();
  for (const p of PIECES) if (p.f === "ship" && p.k === "srail") { const k = `${p.c[2].toFixed(2)}|${(p.yaw ?? 0).toFixed(2)}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(p); }
  for (const g of groups.values()) {
    const dx = Math.cos(g[0].yaw ?? 0) >= 0 ? 1 : -1;
    g.sort((a, b) => (a.c[0] - b.c[0]) * dx);
    const z = g[0].c[2], yb = g[0].c[1] - g[0].h[1];
    const tread = (p: WPiece) => p.c[1] + p.h[1] - 0.95;
    const rail: THREE.Vector3[] = [];
    for (const p of g) {
      const t = tread(p);
      // cut-string skirt: the collider cell from the deck to the tread (+2 cm), a gilded nosing line
      n.wood.bbox(0.3, t + 0.02 - yb, 0.1, L(p.c[0], (yb + t + 0.02) / 2, z), soft(RAILC, 0.6, 1.0), 0.015);
      f.metal.box(0.3, 0.03, 0.11, L(p.c[0], t - 0.04, z), col(GILT_DK));
      for (const e of [-0.075, 0.075]) f.wood.add(BAL_S, L(p.c[0] + e, t + 0.02, z, 0, 0, 0, 1, 0.82, 1), soft("#8a5a34", 0.6, 1.0));
      rail.push(new THREE.Vector3(p.c[0], t + 0.9, z));
    }
    // handrail: through the treads, run out half a step at both ends
    const a = rail[0], b = rail[rail.length - 1], d = b.clone().sub(a).multiplyScalar(0.5 / Math.max(1, rail.length - 1));
    const pts = [a.clone().sub(d), ...rail, b.clone().add(d)].map((v) => v.applyMatrix4(SHIPM));
    n.wood.add(tubeGeo(pts, 0.05, 6, false, rail.length * 2), null, soft(RAILC, 0.65, 1.05));
    // newels: bottom + top, with a gilded ball finial
    for (const p of [g[0], g[g.length - 1]]) {
      const t = tread(p), h = 1.12;
      n.wood.bbox(0.14, h + (t - yb), 0.14, L(p.c[0], yb + (h + t - yb) / 2, z), soft(POSTC, 0.6, 1.0), 0.02);
      n.metal.add(new THREE.SphereGeometry(0.085, 10, 7), L(p.c[0], t + h + 0.07, z), col(GILT));
      n.metal.bbox(0.18, 0.05, 0.18, L(p.c[0], t + h - 0.02, z), col(GILT), 0.012);
    }
  }
}

// ------------------------------------------------------------------------------------------------ the carved stern
function stern(B: ShipBins) {
  const n = B.near, m = B.main, x = HULL.stern - 0.14;
  // gilded pilasters between / beside the great-cabin windows (main level) and the upper cabin (QD level)
  for (const [y0, y1, us] of [[LV.main + 0.55, LV.qd - 0.15, [-4.25, -2.15, 0, 2.15, 4.25]], [LV.qd + 0.6, LV.poop - 0.2, [-3.3, -1.1, 1.1, 3.3]]] as Array<[number, number, number[]]>) {
    for (const u of us) {
      if (Math.abs(u) > hb(HULL.stern + 0.3, (y0 + y1) / 2) - 0.3) continue;
      m.metal.bbox(0.1, y1 - y0, 0.22, L(x, (y0 + y1) / 2, u), col(GILT), 0.02);
      m.metal.bbox(0.16, 0.14, 0.34, L(x - 0.03, y1 - 0.07, u), col(GILT), 0.03); // capital
      m.metal.bbox(0.16, 0.12, 0.32, L(x - 0.03, y0 + 0.06, u), col(GILT), 0.03); // base
      // fluting: two dark grooves
      for (const e of [-0.05, 0.05]) n.woodDark.box(0.02, y1 - y0 - 0.4, 0.025, L(x - 0.05, (y0 + y1) / 2, u + e), col(GILT_DK));
    }
  }
  // arched window heads with keystones over the great-cabin windows
  for (const u of [-3.2, -1.1, 1.1, 3.2]) {
    const arc = new THREE.TorusGeometry(0.62, 0.065, 6, 14, Math.PI);
    m.metal.add(arc, L(x - 0.05, LV.main + 2.15, u, Math.PI / 2), col(GILT));
    m.metal.bbox(0.12, 0.26, 0.18, L(x - 0.06, LV.main + 2.78, u), col(GILT), 0.02);
  }
  // C-scrolls flanking the crest + under the taffrail
  for (const s of [1, -1]) {
    for (const [u, y, r] of [[1.75, LV.poop - 0.2, 0.32], [3.3, LV.poop + 0.35, 0.26], [4.0, LV.qd + 0.25, 0.24]] as Array<[number, number, number]>) {
      if (u > hb(HULL.stern + 0.3, y) - 0.25) continue;
      m.metal.add(new THREE.TorusGeometry(r, 0.055, 6, 14, Math.PI * 1.5), L(x - 0.06, y, s * u, Math.PI / 2, 0, s > 0 ? 0 : Math.PI), col(GILT));
      m.metal.add(new THREE.SphereGeometry(0.08, 8, 6), L(x - 0.06, y - r, s * u), col(GILT));
    }
  }
  // gilded rope moulding round the transom (up both stern posts and across the taffrail / counter)
  const edge: THREE.Vector3[] = [];
  for (let y = LV.gun + 0.4; y <= LV.poop + 0.9; y += 0.5) edge.push(new THREE.Vector3(x + 0.02, y, hb(HULL.stern + 0.15, y) - 0.06));
  for (const s of [1, -1]) m.metal.add(tubeGeo(edge.map((v) => new THREE.Vector3(v.x, v.y, s * v.z).applyMatrix4(SHIPM)), 0.06, 6, false, edge.length * 2), null, col(GILT));
  m.metal.box(0.12, 0.12, 2 * hb(HULL.stern + 0.15, LV.gun + 0.4), L(x, LV.gun + 0.4, 0), col(GILT));
}

// ------------------------------------------------------------------------------------------------ the beakhead
function beakhead(B: ShipBins) {
  const n = B.near, m = B.main;
  const bx = bowEnd(LV.main - 0.5), by = LV.main - 0.4;
  // the head rails (as drawn in addMasts) → turned balusters standing on the grating under them
  for (const s of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(bx - 1.5, LV.fc + 0.2, s * 1.6), new THREE.Vector3(bx + 0.4, by + 1.2, s * 1.1), new THREE.Vector3(bx + 2.4, by + 0.6, s * 0.45), new THREE.Vector3(bx + 3.0, by + 0.25, 0)]);
    for (let t = 0.3; t < 0.86; t += 0.06) {
      const p = curve.getPoint(t), h = p.y - (by + 0.22) - 0.08;
      if (h < 0.18) continue;
      n.wood.add(BAL_S, L(p.x, by + 0.22, p.z, 0, 0, 0, 1, h, 1), soft("#8a5a34", 0.6, 1.05));
    }
  }
  // trailboards: gilded carved boards along both sides of the cutwater, ending in a volute
  for (const s of [1, -1]) {
    const pts = [new THREE.Vector3(bx - 1.2, by - 1.6, s * 0.42), new THREE.Vector3(bx + 0.2, by - 1.0, s * 0.36), new THREE.Vector3(bx + 1.6, by - 0.35, s * 0.26), new THREE.Vector3(bx + 2.5, by + 0.05, s * 0.18)];
    m.metal.add(tubeGeo(pts.map((v) => v.applyMatrix4(SHIPM)), 0.09, 6, false, 16), null, col(GILT));
    m.metal.add(tubeGeo(pts.map((v) => new THREE.Vector3(v.x - 0.1, v.y - 0.35, v.z).applyMatrix4(SHIPM)), 0.06, 6, false, 16), null, col(GILT));
    m.metal.add(new THREE.TorusGeometry(0.28, 0.07, 6, 14, Math.PI * 1.6), L(bx - 1.3, by - 1.85, s * 0.44, 0, 0, 0), col(GILT));
  }
  figurehead(B);
}

/** the figurehead: a crowned, gilded kong leaning out along the stem, holding a banana aloft */
function figurehead(B: ShipBins) {
  const m = B.main, n = B.near;
  // origin on the stem under the bowsprit, the figure's up axis leaning 40° forward
  const base = new THREE.Vector3(bowEnd(LV.main) - 0.35, LV.main - 0.2, 0);
  const F = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => SHIPM.clone().multiply(M(base.x, base.y, base.z, 0, 0, -0.7)).multiply(M(x, y, z, yaw, pitch, roll, sx, sy, sz));
  const gilt = col(GILT), dark = col("#3a2414");
  // draped body flowing into the stem (a scroll at the foot)
  m.metal.add(latheGeo([[0, 0], [0.36, 0], [0.46, 0.25], [0.42, 0.7], [0.34, 1.1], [0.42, 1.38], [0.3, 1.55], [0.14, 1.66], [0, 1.68]], 12), F(0, 0, 0, 0, 0, 0, 1, 1, 0.85), gilt);
  m.metal.add(new THREE.TorusGeometry(0.34, 0.08, 6, 14, Math.PI * 1.7), F(-0.1, -0.05, 0, Math.PI / 2), gilt);
  // drapery folds
  for (const zz of [-0.24, 0, 0.24]) m.metal.add(tubeGeo([new THREE.Vector3(0.38, 0.1, zz), new THREE.Vector3(0.43, 0.6, zz * 1.05), new THREE.Vector3(0.36, 1.05, zz * 0.9)], 0.045, 5, false, 8), F(0, 0, 0), gilt);
  // head: skull + muzzle + brow + ears, painted eyes
  m.metal.add(new THREE.SphereGeometry(0.34, 14, 10), F(0.04, 1.98, 0, 0, 0, 0, 1, 1.05, 0.95), gilt);
  m.metal.add(new THREE.SphereGeometry(0.21, 12, 8), F(0.27, 1.86, 0, 0, 0, 0, 1, 0.78, 1.15), gilt);
  m.metal.add(new THREE.CapsuleGeometry(0.07, 0.36, 4, 8), F(0.26, 2.08, 0, 0, Math.PI / 2, 0), gilt);
  for (const s of [1, -1]) {
    m.metal.add(new THREE.SphereGeometry(0.11, 8, 6), F(0.0, 2.0, s * 0.34, 0, 0, 0, 0.6, 1, 1), gilt);
    n.woodDark.add(new THREE.SphereGeometry(0.045, 8, 6), F(0.31, 2.0, s * 0.12), dark);
  }
  // crown: a band + five points with balls
  m.metal.add(latheGeo([[0.2, 0], [0.24, 0], [0.26, 0.14], [0.22, 0.14], [0.2, 0.02]], 14), F(0.02, 2.25, 0), gilt);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; m.metal.add(new THREE.ConeGeometry(0.05, 0.18, 6), F(0.02 + Math.cos(a) * 0.23, 2.47, Math.sin(a) * 0.23), gilt); m.metal.add(new THREE.SphereGeometry(0.035, 6, 5), F(0.02 + Math.cos(a) * 0.23, 2.57, Math.sin(a) * 0.23), col("#d8402a")); }
  // arms: from the shoulders forward + up to the hands that hold the banana aloft
  for (const s of [1, -1]) {
    const arm = [new THREE.Vector3(0.05, 1.5, s * 0.36), new THREE.Vector3(0.35, 1.75, s * 0.42), new THREE.Vector3(0.6, 2.2, s * 0.3), new THREE.Vector3(0.62, 2.55, s * 0.18)];
    m.metal.add(tubeGeo(arm, 0.085, 7, false, 10), F(0, 0, 0), gilt);
    m.metal.add(new THREE.SphereGeometry(0.11, 8, 6), F(0.62, 2.6, s * 0.17), gilt);
  }
  // the banana: a bright painted crescent between the hands
  const ban = [new THREE.Vector3(0.45, 2.85, -0.5), new THREE.Vector3(0.62, 2.72, -0.15), new THREE.Vector3(0.66, 2.72, 0.18), new THREE.Vector3(0.52, 2.86, 0.5)];
  m.plastic.add(tubeGeo(ban, 0.12, 10, false, 14), F(0, 0, 0), col("#f6c81e"));
  for (const e of [0, 3]) m.plastic.add(new THREE.SphereGeometry(0.06, 6, 5), F(ban[e].x, ban[e].y, ban[e].z), col("#5a3a1e"));
}

/** every carved piece (call once from buildShip) */
export function addCarving(B: ShipBins) {
  bulwarks(B);
  stairRails(B);
  stern(B);
  beakhead(B);
}
