// Sea-cliff SKINS (from a 180 m glide the W coast reads as a continuous eroded wall, not rows of
// tan cubes): every steep sea cliff (shared cliffSkins(): chains of rays from the coastline inland, 1 m apart) is wrapped
// in ONE continuous sculpted rock surface — the wall's own profile re-read along every ray, carved into world-aligned
// COURSES of JOINTED BLOCKS (per-block inset + tilt, rounded block edges, ~10 m eroded bulges, a wave-cut notch), a
// rounded lip that curls over the edge and tucks under the plateau turf, and a talus skirt into the sand / sea. The
// terrain's own steep face is pushed back behind it in the terrain vertex shader (data.ts skin mask, render only);
// collision stays the heightfield (the skin keeps within about ±0.7 m of it).
//
// Cost: built once at load (~0.2 M verts HI in 400 m tiles, ~15 k LO), ≤ ~10 draws; HI tiles within 320 m.
import * as THREE from "three";
import { Simplex2, mulberry32 } from "../../../../shared/world/noise";
import { cliffSkins, type SkinChain, type SkinSample, type TerrainData } from "../../../../shared/world/terrain-gen";
import type { Terrain } from "../../../../shared/world/terrain";

const PROUD = 0.75;          // m the uncarved skin stands in front of the ground surface
const TILE = 160;
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bevel = (d: number, r: number) => (d >= r ? 0 : r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))));
const hash = (a: number, b: number, c: number) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** world-y bedding: course index + fraction at height y (courses 1.3–3.1 m, shared by every chain → strata line up
 * across a bay) */
const COURSES: number[] = (() => { const r = mulberry32(8181), out = [-6]; while (out[out.length - 1] < 90) out.push(out[out.length - 1] + 1.3 + 1.8 * r()); return out; })();
function courseOf(y: number) {
  let lo = 0, hi = COURSES.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (COURSES[m] <= y) lo = m; else hi = m - 1; }
  return { k: lo, y0: COURSES[lo], y1: COURSES[lo + 1] };
}

interface Col { ox: number; oz: number; nx: number; nz: number; s: number; d0: number; d1: number; h0: number; h1: number }

/** sculpt one chain at one LOD into flat arrays (world space) */
function sculptChain(ch: SkinChain, ci: number, T: Terrain, lod: 0 | 1 | 2, out: { pos: number[]; idx: number[]; tint: number[]; depth: number[]; curv: number[] }, range?: [number, number]) {
  const nz2 = new Simplex2(4000 + ci);
  // lod 0 = HI (0.6 × 0.5 m, rounded block edges), 2 = MID (1.2 × 1.0 m, edges), 1 = far (2.4 × 2.0 m)
  const dsCol = lod === 0 ? 0.6 : lod === 2 ? 1.2 : 2.4, dyRow = lod === 0 ? 0.5 : lod === 2 ? 1.0 : 2.0;
  // columns: the chain resampled every dsCol along the coastline origins (samples are 1 m apart)
  const P = ch.pts, cols: Col[] = [];
  for (let a = 0; a + 1 < P.length; a++) {
    const A = P[a], B = P[a + 1], L = Math.hypot(B.ox - A.ox, B.oz - A.oz) || 1;
    for (let u = 0; u < L; u += dsCol) {
      const f = u / L, lerp = (k: keyof SkinSample) => A[k] + (B[k] - A[k]) * f;
      let nx = lerp("nx"), nzz = lerp("nz"); const nl = Math.hypot(nx, nzz) || 1; nx /= nl; nzz /= nl;
      cols.push({ ox: lerp("ox"), oz: lerp("oz"), nx, nz: nzz, s: (cols.length ? cols[cols.length - 1].s + dsCol : 0), d0: lerp("d0"), d1: lerp("d1"), h0: lerp("h0"), h1: lerp("h1") });
    }
  }
  const last = P[P.length - 1]; cols.push({ ...last, s: (cols.length ? cols[cols.length - 1].s + dsCol : 0) });
  const Ls = cols[cols.length - 1].s;
  // common row heights for the WHOLE chain (rows must line up column to column, also across tile pieces): from the lowest
  // foot to the highest lip
  const yBot = Math.min(...cols.map((c) => Math.min(c.h0, 0))) - 1.6, yTop = Math.max(...cols.map((c) => c.h1));
  // a piece of the chain (tile split): keep the columns in [range) of arc length, + one overlap column (no crack)
  if (range) { const a = cols.findIndex((c) => c.s >= range[0]), b = cols.findIndex((c) => c.s > range[1]); cols.splice(b < 0 ? cols.length : Math.min(cols.length, b + 1)); cols.splice(0, Math.max(0, a)); }
  if (cols.length < 3) return;
  // joints per course along the chain (staggered per course)
  const jointCache = new Map<number, { js: number[]; inset: number[]; tilt: number[]; tone: number[] }>();
  const joints = (k: number) => {
    let J = jointCache.get(k); if (J) return J;
    J = { js: [], inset: [], tilt: [], tone: [] };
    let s = -hash(k, ci, 1) * 5;
    while (s < Ls + 6) { J.js.push(s); J.inset.push(1.3 * Math.pow(hash(k, J.js.length, ci * 7 + 3), 1.3)); J.tilt.push((hash(k, J.js.length, ci + 11) - 0.5) * 0.4); J.tone.push(0.84 + 0.3 * hash(k, J.js.length, ci + 29)); s += (ch.dark ? 1.2 + 1.0 * hash(k, J.js.length, ci + 5) : 2.4 + 3.6 * hash(k, J.js.length, ci + 5)); }
    jointCache.set(k, J); return J;
  };
  const blockAt = (k: number, s: number) => {
    const J = joints(k); let b = 0; while (b + 1 < J.js.length && J.js[b + 1] <= s) b++;
    return { J, b, s0: J.js[b], s1: J.js[Math.min(J.js.length - 1, b + 1)] };
  };
  const bev = lod === 1 ? 0 : 0.42, blend = lod === 0 ? 0.22 : lod === 2 ? 0.5 : 0.8;
  const info = [1, 0];
  /** carve depth (m, ≥ 0) at chain position s, height y */
  const carve = (s: number, y: number): number => {
    const C0 = courseOf(y), k = C0.k, th = C0.y1 - C0.y0;
    const B = blockAt(k, s), len = Math.max(0.5, B.s1 - B.s0), sl = (s - B.s0) / len, hl = (y - C0.y0) / th;
    // + a course-wide set-back (most courses flush, some 0.6–1.2 m back): the course above a set-back one overhangs it and
    // the protruding course's top is a flat LEDGE the material paints as turf — the target art's planted ledges
    const courseBack = (kk: number) => { const hc = hash(kk, 77, 5); return hc < 0.62 ? 0 : 0.6 + 0.6 * (hc - 0.62) / 0.38; };
    const I = (J: typeof B.J, b: number, a: number, h: number) => J.inset[b] + J.tilt[b] * (a - 0.5) * (ch.dark ? 0.3 : 1) + 0.25 * Math.abs(J.tilt[b]) + (h - 0.5) * 0.08 + courseBack(J === B.J ? k : (J === blockAt(k + 1, s).J ? k + 1 : k - 1));
    let v = I(B.J, B.b, sl, hl);
    const dsE0 = s - B.s0, dsE1 = B.s1 - s, dyE0 = y - C0.y0, dyE1 = C0.y1 - y;
    if (dsE1 < blend && B.b + 1 < B.J.js.length) v += (I(B.J, B.b + 1, 0, hl) - v) * 0.5 * sstep(blend, 0, dsE1);
    if (dsE0 < blend && B.b > 0) v += (I(B.J, B.b - 1, 1, hl) - v) * 0.5 * sstep(blend, 0, dsE0);
    if (dyE1 < blend) { const B2 = blockAt(k + 1, s); v += (I(B2.J, B2.b, (s - B2.s0) / Math.max(0.5, B2.s1 - B2.s0), 0) - v) * 0.5 * sstep(blend, 0, dyE1); }
    if (dyE0 < blend) { const B2 = blockAt(k - 1, s); v += (I(B2.J, B2.b, (s - B2.s0) / Math.max(0.5, B2.s1 - B2.s0), 1) - v) * 0.5 * sstep(blend, 0, dyE0); }
    const g = bev > 0 ? Math.max(bevel(Math.max(0, dsE0), bev), bevel(Math.max(0, dsE1), bev), bevel(Math.max(0, dyE0), bev * 0.9), bevel(Math.max(0, dyE1), bev * 1.1)) : 0;
    const e = 0.75 * sstep(0.3, 0.85, 0.5 + 0.5 * nz2.noise(s / 10.5 + 3.3, y / 13));
    const notch = 0.45 * sstep(2.4, 0.5, y) * sstep(-1.5, 0.2, y);
    info[0] = B.J.tone[B.b]; info[1] = bev > 0 ? g / bev : 0;
    return Math.min(2.4, v + g + e + notch);
  };
  // per column: the ground profile along its ray (running max), then rows up the wall + a lip that curls onto the plateau
  const rowsOf = (c: Col) => {
    const d0 = c.d0 - 3, d1 = c.d1 + 4, st = lod === 0 ? 0.25 : 0.5;
    const pts: Array<[number, number]> = []; let mx = -1e9;
    for (let d = d0; d <= d1 + 1e-6; d += st) { mx = Math.max(mx, T.height(c.ox + c.nx * d, c.oz + c.nz * d)); pts.push([d, mx]); }
    const dAt = (y: number) => { for (let q = 0; q < pts.length; q++) if (pts[q][1] >= y) { if (q === 0) return pts[0][0]; const [da, ya] = pts[q - 1], [db, yb] = pts[q]; return da + (db - da) * (y - ya) / Math.max(1e-3, yb - ya); } return pts[pts.length - 1][0]; };
    return { dAt, gAt: (d: number) => T.height(c.ox + c.nx * d, c.oz + c.nz * d) };
  };
  const nRow = Math.max(2, Math.ceil((yTop - yBot) / dyRow));
  const LIP = 4;                                             // extra rows: the rounded lip curling onto the plateau
  const base = out.pos.length / 3, W = cols.length, R = nRow + 1 + LIP;
  for (const c of cols) {
    const { dAt, gAt } = rowsOf(c);
    // chain ends: the skin sinks behind the ground over the last 8 m (the terrain's push-back fades with it — data.ts)
    const endK = sstep(0, 8, c.s) * sstep(0, 8, Ls - c.s);
    const hLip = c.h1, dLip = dAt(hLip - 0.05);
    for (let r = 0; r <= nRow; r++) {
      // rows above this column's own lip collapse onto the lip (a shorter wall here), rows below its foot hug the talus
      let y = yBot + (yTop - yBot) * r / nRow;
      const over = y > hLip - 0.6;
      if (over) y = hLip - 0.6 + (y - (hLip - 0.6)) * 0.02;
      const d = y < c.h0 ? c.d0 - (c.h0 - y) * 0.35 : dAt(y);
      const cv = carve(c.s, y);
      // the carve fades out in the talus (it is under water / sand there) and toward the lip roll
      const k = sstep(Math.min(c.h0, 0) - 1.2, Math.min(c.h0, 0) + 0.6, y) * (1 - 0.6 * sstep(hLip - 2.6, hLip - 0.6, y));
      const off = endK * (-PROUD * k + cv * k) + (1 - endK) * 0.6;
      out.pos.push(c.ox + c.nx * (d + off), y, c.oz + c.nz * (d + off));
      out.tint.push(info[0]); out.depth.push(Math.max(0, hLip - y)); out.curv.push(-info[1] * k);
    }
    // the lip: quarter-roll over the edge, then two rows tucked 0.2 m under the plateau surface
    for (let q = 1; q <= LIP; q++) {
      const f = q / LIP, a = f * Math.PI / 2;
      const dd = dLip - PROUD * 0.4 * (1 - f) + (0.6 + 2.2 * f) * Math.sin(a);
      const y = q < LIP ? hLip - 0.6 + 0.85 * Math.sin(a) : gAt(dLip + 2.8) - 0.25;
      // (never above the plateau surface: the turf is the lip seen from the top, the skin tucks under it)
      out.pos.push(c.ox + c.nx * dd, Math.min(y, gAt(dd) - 0.1), c.oz + c.nz * dd);
      out.tint.push(1.0); out.depth.push(0); out.curv.push(0.3 * (1 - f));
    }
  }
  // winding: faces must look seaward (−n). Decided over the WHOLE chain (area-weighted face normals · the column's inland
  // direction) — a single test quad could be degenerate where rows collapse onto a low lip
  const i0 = out.idx.length;
  for (let i = 0; i + 1 < W; i++) for (let r = 0; r + 1 < R; r++) {
    const a = base + i * R + r, b = a + R, c2 = a + 1, d = b + 1;
    out.idx.push(a, c2, b, b, c2, d);
  }
  let facing = 0;
  const pp = out.pos;
  for (let q = i0; q < out.idx.length; q += 3) {
    const A = out.idx[q] * 3, B = out.idx[q + 1] * 3, Cc = out.idx[q + 2] * 3;
    const ux = pp[B] - pp[A], uy = pp[B + 1] - pp[A + 1], uz = pp[B + 2] - pp[A + 2];
    const vx = pp[Cc] - pp[A], vy = pp[Cc + 1] - pp[A + 1], vz = pp[Cc + 2] - pp[A + 2];
    const fx = uy * vz - uz * vy, fz = ux * vy - uy * vx, col = cols[Math.min(W - 1, Math.floor((out.idx[q] - base) / R))];
    facing += fx * col.nx + fz * col.nz;
  }
  if (facing > 0) for (let q = i0; q < out.idx.length; q += 3) { const t = out.idx[q + 1]; out.idx[q + 1] = out.idx[q + 2]; out.idx[q + 2] = t; }
}

/** cliff-skin tier distances (m from the tile's bounding sphere): HI < SKIN_HI < MID < SKIN_MID < LO */
export const SKIN_HI = 90, SKIN_MID = 420;
export interface SkinHandle { group: THREE.Group; update(cam: THREE.Vector3): void; chains: SkinChain[] }

/** build every skin tile (HI + LO) with the given materials (tan sandstone / black basalt) */
export function buildCliffSkins(t: TerrainData, T: Terrain, mats: { tan: THREE.Material[]; dark: THREE.Material[] }, lodv = false): SkinHandle {
  const chains = cliffSkins(t);
  const group = new THREE.Group(); group.name = "terrain-cliffskins";
  type Acc = { pos: number[]; idx: number[]; tint: number[]; depth: number[]; curv: number[] };
  const tiles = new Map<string, { hi: Acc; mid: Acc; lo: Acc; dark: boolean }>();
  const acc = (): Acc => ({ pos: [], idx: [], tint: [], depth: [], curv: [] });
  chains.forEach((ch, ci) => {
    // split the chain into ~TILE m pieces along its arc (each piece → the tile of its middle sample)
    const n = ch.pts.length, pieces = Math.max(1, Math.round(n / TILE));
    for (let pc = 0; pc < pieces; pc++) {
      const a = Math.floor(n * pc / pieces), b = Math.floor(n * (pc + 1) / pieces), mid = ch.pts[Math.min(n - 1, (a + b) >> 1)];
      const fx = mid.ox + mid.nx * mid.d0, fz = mid.oz + mid.nz * mid.d0;
      const key = `${Math.floor(fx / TILE)}:${Math.floor(fz / TILE)}:${ch.dark ? 1 : 0}`;
      let tl = tiles.get(key);
      if (!tl) { tl = { hi: acc(), mid: acc(), lo: acc(), dark: ch.dark }; tiles.set(key, tl); }
      const range: [number, number] = [a, b];   // arc length ≈ sample index (samples are 1 m apart)
      sculptChain(ch, ci, T, 0, tl.hi, range); sculptChain(ch, ci, T, 2, tl.mid, range); sculptChain(ch, ci, T, 1, tl.lo, range);
    }
  });
  const meshes: Array<{ hi: THREE.Mesh; mid: THREE.Mesh; lo: THREE.Mesh }> = [];
  const mk = (a: Acc, mat: THREE.Material, name: string, centre?: THREE.Sphere) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(a.pos, 3));
    g.setAttribute("aTint", new THREE.Float32BufferAttribute(a.tint, 1));
    g.setAttribute("aDepth", new THREE.Float32BufferAttribute(a.depth, 1));
    g.setAttribute("aCurv", new THREE.Float32BufferAttribute(a.curv, 1));
    g.setIndex(a.idx);
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    // every tier of a tile weighs its dither by the HI tile's bounding sphere (one attribute, constant)
    if (lodv) { const c = centre ?? g.boundingSphere!, n = a.pos.length / 3, arr = new Float32Array(n * 4); for (let i = 0; i < n; i++) arr.set([c.center.x, c.center.y, c.center.z, c.radius], i * 4); g.setAttribute("aSkinC", new THREE.BufferAttribute(arr, 4)); }
    const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = false; m.receiveShadow = true;
    m.userData.castShadow = false; m.userData.farShadow = false; m.matrixAutoUpdate = false;
    group.add(m); return m;
  };
  for (const [key, tl] of tiles) {
    if (!tl.hi.idx.length) continue;
    const mat = tl.dark ? mats.dark : mats.tan;
    const hi = mk(tl.hi, mat[0], `cliffskin-hi-${key}`);
    meshes.push({ hi, mid: mk(tl.mid, mat[1], `cliffskin-mid-${key}`, hi.geometry.boundingSphere!), lo: mk(tl.lo, mat[2], `cliffskin-lo-${key}`, hi.geometry.boundingSphere!) });
  }
  const update = (cam: THREE.Vector3) => {
    if (lodv) {
      // distance only (no altitude switch), each tier drawn over its dithered band
      for (const { hi, mid, lo } of meshes) {
        const bs = hi.geometry.boundingSphere!, c = cam.distanceTo(bs.center), d = Math.max(0, c - bs.radius), far = c + bs.radius;
        // a tier is drawn while ANY part of its tile can be inside its dithered band: the far side of a
        // 130 m tile lies up to 2 r beyond its nearest point — hiding the LO tile once its NEAREST point entered the MID
        // range punched its far side out (the drop: a 66 m cliff-skin tile vanishing at 490 m)
        hi.visible = d < SKIN_HI + 20; mid.visible = far > SKIN_HI && d < SKIN_MID + 60; lo.visible = far > SKIN_MID;
        hi.castShadow = hi.userData.castShadow = d < 40;
      }
      return;
    }
    for (const { hi, mid, lo } of meshes) {
      const bs = hi.geometry.boundingSphere!, d = Math.max(0, cam.distanceTo(bs.center) - bs.radius);
      const ground = cam.y < 300;
      hi.visible = ground && d < 90; mid.visible = ground && d >= 90 && d < 420; lo.visible = !hi.visible && !mid.visible;
      hi.castShadow = hi.userData.castShadow = hi.visible && d < 40;
    }
  };
  return { group, update, chains };
}
