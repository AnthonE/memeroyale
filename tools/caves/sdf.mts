// COCO CAVES — the rock signed-distance field shared by the bake (bake-rock.mts) and its light workers.
// The collider boxes (shared/pois/coco-caves.ts ROCKS) are unioned with a smooth-min whose radius depends on where the
// point is: TIGHT (k 0.3 m, ±0.09 m displacement) where a kong can touch the rock — within 3.5 m above the terrain,
// above any deck / stair / building floor, on the plateau top, on "tight" rocks (boulders, ledges, plinth, bed) — and
// LOOSE (k 2.2 m, ±0.75 m chiselled displacement + strata) on high walls, the vault and the outer cliffs.
import * as C from "../../shared/pois/coco-caves";

export interface R { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; c: number; s: number; r: number; tight: boolean; flat: boolean; boulder?: boolean; sculpt?: boolean }
export const rocks: R[] = C.ROCKS.map((b) => {
  const tight = !!b.tight;
  // (boulder edges 0.1–0.18 m — a 0.3 m rounding dropped their top edge rows 0.2–0.5 m below the collider; the cap +
  //  skirts give the silhouette)
  const r = b.tag === "boulder" ? Math.min(0.18, Math.max(0.1, Math.min(b.h[0], b.h[2]) * 0.3)) : tight ? 0.05 : Math.min(0.55, Math.min(b.h[0], b.h[1], b.h[2]) * 0.4);
  // (the pool bed / beach / island plates sit 0.15 m under their collider top — the client's sand skin is the
  //  drawn floor there; the rock must never poke through it at the plate steps)
  const dy = b.tag === "bed" ? 0.15 : 0;
  return { cx: b.c[0], cy: b.c[1] - dy, cz: b.c[2], hx: b.h[0], hy: b.h[1], hz: b.h[2], c: Math.cos(b.yaw), s: Math.sin(b.yaw), r, tight, flat: b.tag === "plinth" || b.tag === "bed" || b.tag === "lip", boulder: b.tag === "boulder", sculpt: !!b.sculpt };
});
/** the bake bounds (world): everything rocky lives inside */
export const BOUNDS = (() => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = -1e9;
  for (const b of rocks) { const e = Math.hypot(b.hx, b.hz) + 1; x0 = Math.min(x0, b.cx - e); x1 = Math.max(x1, b.cx + e); z0 = Math.min(z0, b.cz - e); z1 = Math.max(z1, b.cz + e); y1 = Math.max(y1, b.cy + b.hy + 1.5); }
  let y0 = 1e9; for (let x = Math.floor(x0); x <= x1; x += 2) for (let z = Math.floor(z0); z <= z1; z += 2) y0 = Math.min(y0, C.groundAt(x, z));
  return { x0: Math.floor(x0), x1: Math.ceil(x1), z0: Math.floor(z0), z1: Math.ceil(z1), y0: Math.floor(y0 - 3), y1: Math.ceil(y1) };
})();
// ---- spatial hash (xz cells) of rocks
const CELL = 4, KMAX = 2.4;
const gx0 = BOUNDS.x0 - 8, gz0 = BOUNDS.z0 - 8, gnx = Math.ceil((BOUNDS.x1 - gx0 + 8) / CELL), gnz = Math.ceil((BOUNDS.z1 - gz0 + 8) / CELL);
const cells: number[][] = Array.from({ length: gnx * gnz }, () => []);
rocks.forEach((b, i) => {
  const e = Math.abs(b.c) * b.hx + Math.abs(b.s) * b.hz + KMAX + 1.2, f = Math.abs(b.s) * b.hx + Math.abs(b.c) * b.hz + KMAX + 1.2;
  for (let ix = Math.floor((b.cx - e - gx0) / CELL); ix <= Math.floor((b.cx + e - gx0) / CELL); ix++)
    for (let iz = Math.floor((b.cz - f - gz0) / CELL); iz <= Math.floor((b.cz + f - gz0) / CELL); iz++)
      if (ix >= 0 && iz >= 0 && ix < gnx && iz < gnz) cells[iz * gnx + ix].push(i);
});
const cellOf = (x: number, z: number) => { const ix = Math.floor((x - gx0) / CELL), iz = Math.floor((z - gz0) / CELL); return ix < 0 || iz < 0 || ix >= gnx || iz >= gnz ? null : cells[iz * gnx + ix]; };
// (the DRAWN surface skips the sculpted rocks — boulder clusters + plateau outcrops are modelled by the client,
//  coco-caves/sculpt.ts; occlusion, the reach field and the top map still see them)
const vcells = cells.map((l) => l.filter((i) => !rocks[i].sculpt));
const vcellOf = (x: number, z: number) => { const ix = Math.floor((x - gx0) / CELL), iz = Math.floor((z - gz0) / CELL); return ix < 0 || iz < 0 || ix >= gnx || iz >= gnz ? null : vcells[iz * gnx + ix]; };

export function boxD(b: R, x: number, y: number, z: number, r = b.r): number {
  const dx = x - b.cx, dz = z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c, ly = y - b.cy;
  const qx = Math.abs(lx) - (b.hx - r), qy = Math.abs(ly) - (b.hy - r), qz = Math.abs(lz) - (b.hz - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function smin(a: number, b: number, k: number) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// ---- noise (3D gradient, hashed lattice)
const perm = new Uint8Array(512); { let s = 1234567; const p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h: number, x: number, y: number, z: number) { const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); }
export function noise(x: number, y: number, z: number) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255; x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z), A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z, B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u), l(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
    l(l(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u), l(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}

// ---- walkable-surface mask (1 m voxels): 1 where a kong can stand / touch above a deck, stair, floor or roof deck
const MX0 = BOUNDS.x0, MZ0 = BOUNDS.z0, MY0 = BOUNDS.y0, MNX = BOUNDS.x1 - BOUNDS.x0 + 1, MNZ = BOUNDS.z1 - BOUNDS.z0 + 1, MNY = BOUNDS.y1 - BOUNDS.y0 + 1;
const mask = new Uint8Array(MNX * MNY * MNZ);
function markRect(cx: number, cz: number, hx: number, hz: number, yaw: number, y0: number, y1: number, pad = 1.3) {
  const c = Math.cos(yaw), s = Math.sin(yaw), ex = Math.abs(c) * (hx + pad) + Math.abs(s) * (hz + pad), ez = Math.abs(s) * (hx + pad) + Math.abs(c) * (hz + pad);
  for (let x = Math.floor(cx - ex); x <= Math.ceil(cx + ex); x++) for (let z = Math.floor(cz - ez); z <= Math.ceil(cz + ez); z++) {
    const dx = x - cx, dz = z - cz, lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) > hx + pad || Math.abs(lz) > hz + pad) continue;
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) { const i = x - MX0, j = y - MY0, k = z - MZ0; if (i >= 0 && j >= 0 && k >= 0 && i < MNX && j < MNY && k < MNZ) mask[(k * MNY + j) * MNX + i] = 1; }
  }
}
for (const d of C.TIMBER.decks) markRect(d.x, d.z, d.w / 2, d.d / 2, d.yaw, d.y - 0.6, d.y + 3.6);
for (const s of C.TIMBER.stairs) for (const st of C.stairSteps(s)) markRect(st.box.c[0], st.box.c[2], st.box.h[0], st.box.h[2], st.box.yaw ?? 0, st.top - 0.6, st.top + 3.4);
for (const h of C.HUTS) for (let f = 0; f <= h.floors; f++) markRect(h.x, h.z, h.w / 2, h.d / 2, h.yaw, h.y + f * h.fh - 0.6, h.y + f * h.fh + 3.6, 1.6);
// top map (1 m): the highest rock-box top over each column — its top surface is walkable wherever a kong can land
const topMap = new Float32Array(MNX * MNZ).fill(-1e9);
for (const b of rocks) {
  const e = Math.abs(b.c) * b.hx + Math.abs(b.s) * b.hz, f = Math.abs(b.s) * b.hx + Math.abs(b.c) * b.hz;
  for (let x = Math.floor(b.cx - e); x <= Math.ceil(b.cx + e); x++) for (let z = Math.floor(b.cz - f); z <= Math.ceil(b.cz + f); z++) {
    const dx = x - b.cx, dz = z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) > b.hx + 0.5 || Math.abs(lz) > b.hz + 0.5) continue;
    const i = x - MX0, k = z - MZ0; if (i >= 0 && k >= 0 && i < MNX && k < MNZ) topMap[k * MNX + i] = Math.max(topMap[k * MNX + i], b.cy + b.hy);
  }
}
const topMapAt = (x: number, z: number) => { const i = Math.round(x) - MX0, k = Math.round(z) - MZ0; return i >= 0 && k >= 0 && i < MNX && k < MNZ ? topMap[k * MNX + i] : -1e9; };
const maskAt = (x: number, y: number, z: number) => { const i = Math.round(x) - MX0, j = Math.round(y) - MY0, k = Math.round(z) - MZ0; return i >= 0 && j >= 0 && k >= 0 && i < MNX && j < MNY && k < MNZ ? mask[(k * MNY + j) * MNX + i] : 0; };
// ---- reach field: every standable level — the terrain and every rock-box top a kong fits on (the plateau,
// shoulders, ledges, boulders, the pool bed) — makes the rock within 4 m around it and from 1 m under to 2.6 m over it
// TIGHT. "3.5 m over the terrain" + the highest top per column alone left the outer shoulders, the lower tiers and the
// walls rising from them loose (k 2.2, ±0.75 m): 246 collider mismatches (invisible walls, walk-through fillets,
// floors 0.3–0.66 m off). Binary core → blurred twice (1 m taps) → trilinear: 1 = fully tight.
const inRockPt = (x: number, y: number, z: number) => { const l = cellOf(x, z); if (l) for (const i of l) if (boxD(rocks[i], x, y, z, 0) < 0) return true; return false; };
const reachF = (() => {
  const core = new Float32Array(MNX * MNY * MNZ);
  // (tight up to 2.6 m over a level: collision probes run at 1.2 / 1.7 m and a kong's head at 1.75 m; above that
  //  the outer cliffs over the shoulders may take their ribs and bays)
  const RH = 4, Y0 = 1, Y1 = 2.6;
  const mark = (cx: number, cz: number, L: number) => {
    for (let x = cx - RH; x <= cx + RH; x++) for (let z = cz - RH; z <= cz + RH; z++) {
      if ((x - cx) ** 2 + (z - cz) ** 2 > RH * RH + 0.5) continue;
      const i = x - MX0, k = z - MZ0; if (i < 0 || k < 0 || i >= MNX || k >= MNZ) continue;
      for (let y = Math.floor(L - Y0); y <= Math.ceil(L + Y1); y++) { const j = y - MY0; if (j >= 0 && j < MNY) core[(k * MNY + j) * MNX + i] = 1; }
    }
  };
  for (let x = MX0; x < MX0 + MNX; x++) for (let z = MZ0; z < MZ0 + MNZ; z++) {
    const g = C.groundAt(x, z), lv = [g], list = cellOf(x, z) ?? [];
    for (const i of list) { const b = rocks[i]; const dx = x - b.cx, dz = z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz && b.cy + b.hy > g - 0.05) lv.push(b.cy + b.hy); }
    for (const L of lv) if (!inRockPt(x, L + 0.3, z) && !inRockPt(x, L + 1.0, z) && !inRockPt(x, L + 1.7, z)) mark(x, z, L);
  }
  // two separable 3-tap box blurs
  let a = core, b = new Float32Array(core.length);
  const idx = (i: number, j: number, k: number) => (k * MNY + j) * MNX + i;
  for (let pass = 0; pass < 2; pass++) for (const ax of [0, 1, 2]) {
    for (let k = 0; k < MNZ; k++) for (let j = 0; j < MNY; j++) for (let i = 0; i < MNX; i++) {
      let sum = 0, n = 0;
      for (let o = -1; o <= 1; o++) { const ii = ax === 0 ? i + o : i, jj = ax === 1 ? j + o : j, kk = ax === 2 ? k + o : k; if (ii < 0 || jj < 0 || kk < 0 || ii >= MNX || jj >= MNY || kk >= MNZ) continue; sum += a[idx(ii, jj, kk)]; n++; }
      b[idx(i, j, k)] = sum / n;
    }
    const t = a; a = b; b = t;
  }
  return a;
})();
/** 0..1 reach tightness at a point (trilinear) */
export function reachAt(x: number, y: number, z: number): number {
  const fx = x - MX0, fy = y - MY0, fz = z - MZ0, i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
  if (i < 0 || j < 0 || k < 0 || i >= MNX - 1 || j >= MNY - 1 || k >= MNZ - 1) return 0;
  const tx = fx - i, ty = fy - j, tz = fz - k, I = (a: number, b: number, c: number) => reachF[((k + c) * MNY + (j + b)) * MNX + (i + a)];
  const l = (p: number, q: number, t: number) => p + (q - p) * t;
  return l(l(l(I(0, 0, 0), I(1, 0, 0), tx), l(I(0, 1, 0), I(1, 1, 0), tx), ty), l(l(I(0, 0, 1), I(1, 0, 1), tx), l(I(0, 1, 1), I(1, 1, 1), tx), ty), tz);
}
const ss = (a: number, b: number, t: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

/** 0 = tight (touchable), 1 = loose (out of reach) */
export function looseness(x: number, y: number, z: number, nearTight: boolean): number {
  if (nearTight || maskAt(x, y, z)) return 0;
  const g = C.groundAt(x, z), t = topMapAt(x, z);
  return Math.min(ss(3.3, 5.2, y - g), 1 - ss(-2.0, -0.8, y - t), 1 - Math.min(1, reachAt(x, y, z) * 2));
}

// ---- cellular (Worley F1/F2) for the chiselled plates: each cell bulges as a gently domed plate, creases between cells
function hash3(i: number, j: number, k: number) { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function plates(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z); let f1 = 9, f2 = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cx = ix + a, cy = iy + b, cz = iz + c;
    const px = cx + hash3(cx, cy, cz), py = cy + hash3(cy + 7, cz, cx), pz = cz + hash3(cz + 13, cx, cy);
    const d = Math.hypot(px - x, (py - y) * 1.6, pz - z);   // squashed in y: plates read as strata-ish slabs
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return Math.min(1, (f2 - f1) * 1.4);   // 0 on a crease, → 1 in a plate's middle
}
/** 0 = tight (collider-exact), 1 = loose — the bake's dual contouring runs only where this is tight (on the
 *  loose vault / high walls the QEF folds thin creased plates into back-facing slivers = sky leaks) */
export function looseAt(x: number, y: number, z: number): number {
  const list = vcellOf(x, z); if (!list || !list.length) return 1;
  let dmin = 1e9, tightNear = false;
  for (const i of list) { const d = boxD(rocks[i], x, y, z); if (d < dmin) { dmin = d; tightNear = rocks[i].tight; } }
  return looseness(x, y, z, tightNear && dmin < 1.2);
}
/** the visual rock SDF (displaced) */
export function sdf(x: number, y: number, z: number): number {
  const list = vcellOf(x, z); if (!list || !list.length) return 3.5;
  // nearest rock decides tight/loose (plus the masks)
  let dmin = 1e9, tightNear = false, flatNear = false, boulderNear = false;
  const ds: number[] = [];
  for (const i of list) { const d = boxD(rocks[i], x, y, z); ds.push(d); if (d < dmin) { dmin = d; tightNear = rocks[i].tight; flatNear = rocks[i].flat; boulderNear = !!rocks[i].boulder; } }
  if (dmin > 4) return dmin;
  const w = looseness(x, y, z, tightNear && dmin < 1.2);
  const k = 0.3 + 1.9 * w;
  // box edges round with r only where loose (tight: ≤ 0.12 m — a lattice spot 0.1 m from a ledge edge read a
  // 0.2 m floor mismatch under the 0.55 m rounding)
  // (a 0.14 m round + 7 cm chisel creases on boulders let rays clipping a box corner pass outside the rounded
  //  rock: invisible walls. Kept sharp: the boulders' shape comes from the crowned clusters)
  if (w < 0.999) { let q = 0; for (const i of list) { const b = rocks[i]; if (b.r > 0.05) ds[q] = boxD(b, x, y, z, 0.05 + (b.r - 0.05) * w); q++; } }
  let d = 1e9; for (const di of ds) d = d === 1e9 ? di : smin(d, di, k);
  if (Math.abs(d) < 2.2) {
    // (half the tight noise on box TOPS — coplanar plateau tops bulge k/4 from the smooth union, + the noise they read
    //  0.16 m over the collider; the faces keep theirs)
    const onTop = Math.abs(topMapAt(x, z) - y) < 0.35;
    const amp = (flatNear && dmin < 0.8 ? 0.025 : onTop ? 0.03 : 0.06) + 0.69 * w;
    let n = noise(x * 0.16, y * 0.21, z * 0.16) * 0.62 + noise(x * 0.47 + 17, y * 0.52, z * 0.47) * 0.28 + noise(x * 1.3, y * 1.3 + 5, z * 1.3) * 0.1;
    // strata on the loose faces: soft horizontal bands, broken by noise
    n += w * 0.25 * Math.sin(y * 1.9 + noise(x * 0.08, y * 0.05, z * 0.08) * 5);
    d -= amp * n * 1.1;
    // chiselled plates (faceted cave walls): 2.6 m cells, domed, creased — loose faces only
    if (w > 0.02) d -= w * 0.55 * (plates(x / 2.6, y / 2.6, z / 2.6) - 0.45);
    void boulderNear;
    // the OUTER cliffs get big, slow bulges and bays (±1.6 m at ~14 m) and a second 5 m layer, so the massif's
    // silhouette breaks up instead of reading as a flat stepped table from the air; never inside the hall's outline (no leaks)
    // (+ ridged VERTICAL ribs and gullies (±1.1 m, 6 m apart, stretched 6× in y) — the outer faces read as a
    //  fluted sea cliff instead of flat slabs; out of reach only, so the colliders never disagree with them)
    if (w > 0.3) { const out = ss(-4, -10, C.hallDist(x, z)) * ss(1.0, 3.0, topMapAt(x, z) - y); if (out > 0) { const rib = 1 - 2 * Math.abs(noise(x * 0.17 + 5.3, y * 0.028, z * 0.17 - 2.2)); d -= out * w * (1.6 * noise(x * 0.07 + 3.1, y * 0.05, z * 0.07 - 1.7) + 0.6 * noise(x * 0.2, y * 0.16 + 9, z * 0.2) + 1.5 * (rib - 0.35)); } }
  }
  return d;
}
/** undisplaced, sharp union of rocks + terrain (light marching / AO) */
export function sdfOcc(x: number, y: number, z: number, withTerrain = true): number {
  let d = withTerrain ? (y - C.groundAt(x, z)) * 0.7 : 1e9;
  const list = cellOf(x, z);
  if (list && list.length) { for (const i of list) d = Math.min(d, boxD(rocks[i], x, y, z)); } else d = Math.min(d, 3.5);
  return d;
}
