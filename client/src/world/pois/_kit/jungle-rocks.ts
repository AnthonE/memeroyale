// poi-jungle kit — SCULPTED stylized rocks. Each prototype is a signed-distance "chiselled boulder" (a superellipsoid
// cut by a handful of random planes with a smooth max → big clean facets with softly rounded edges, plus low-frequency
// lumps) extracted with naive surface nets and gradient normals. This gives the stylized "chunky sculpted
// rock" read (flat planes, crisp-but-bevelled edges) instead of doughy noise blobs. Prototypes are cached per family and
// placed with InstancedMesh (one draw per prototype) under the triplanar jungle stone material (moss on tops, wet low).
import * as THREE from "three";
import { mulberry } from "./jungle-mat";
import { noise3 } from "./jungle-geo";

export interface SculptOpts {
  /** grid resolution along the longest axis (24 = far/small, 36 = default, 48 = hero) */
  res?: number;
  /** number of planar cuts (facets) */
  cuts?: number;
  /** smooth-max radius of the cut edges (0.02 = crisp, 0.12 = soft) */
  round?: number;
  /** superellipsoid exponent (2 = ellipsoid, 3–4 = boxy) */
  boxy?: number;
  /** half extents before cuts */
  ext?: [number, number, number];
  /** low-frequency lump amplitude */
  lump?: number;
  /** flatten the base at this y (in unit space); null = round bottom */
  base?: number | null;
  /** horizontal layering (0..1) — sedimentary ledges for cliff blocks */
  strata?: number;
  /** bias cuts toward vertical faces (cliff blocks) */
  sideCuts?: number;
  /** cut-plane offset from the centre as a fraction of the extent along its normal: [min, random range] (default [0.62, 0.3];
   *  lower = the planes dominate → an angular, cleaved polyhedron instead of a rounded block with shaved corners) */
  cutOff?: [number, number];
  /** a few small secondary chips (cuts near the surface) for broken edges */
  chips?: number;
  /** re-fit the finished rock to its nominal box (x/z half extents = fit·ext, y from base·ext to fit·ext): deep-cut rocks
   *  shrink, this keeps them filling the placement box like the other families */
  fit?: number;
  /** build the rock as the exact CONVEX POLYHEDRON of its cut planes (box ∩ half-spaces): crisp flat facets, ~40–70
   *  triangles, identical at every LOD (no surface-nets blobbing at low resolution) */
  poly?: boolean;
}

const smax = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

/** build one sculpted rock (unit-ish: fits roughly in [-1,1]^3 scaled by ext) */
function rockCuts(seed: number, o: SculptOpts) {
  const rnd = mulberry(seed * 7919 + 13);
  const ext = o.ext ?? [1, 0.72 + rnd() * 0.2, 0.85 + rnd() * 0.15];
  const nCuts = o.cuts ?? 7, side = o.sideCuts ?? 0.5;
  const cuts: Array<[number, number, number, number]> = [];
  for (let i = 0; i < nCuts; i++) {
    // random direction; `side` pushes normals toward the horizontal plane (vertical faces)
    const a = rnd() * Math.PI * 2;
    let y = rnd() * 2 - 1; y *= 1 - side * 0.8; if (i === 0) y = 0.9 + rnd() * 0.1; // one near-top facet (flat-ish crown)
    const r = Math.sqrt(Math.max(0, 1 - y * y)), nx = Math.cos(a) * r, nz = Math.sin(a) * r;
    // offset: how far the plane sits from the centre along its normal (relative to the ellipsoid extent in that direction)
    const e = Math.sqrt((nx * ext[0]) ** 2 + (y * ext[1]) ** 2 + (nz * ext[2]) ** 2);
    const [o0, o1] = o.cutOff ?? [0.62, 0.3];
    cuts.push([nx, y, nz, e * (o0 + rnd() * o1)]);
  }
  const oc = (o.cutOff ?? [0.62, 0.3])[0];
  for (let i = 0; i < (o.chips ?? 0); i++) { // chips: small bevels knocked off random edges/corners (just inside the corners)
    const a = rnd() * Math.PI * 2, y = (rnd() * 2 - 1) * 0.8, r = Math.sqrt(Math.max(0, 1 - y * y)), nx = Math.cos(a) * r, nz = Math.sin(a) * r;
    const e = Math.sqrt((nx * ext[0]) ** 2 + (y * ext[1]) ** 2 + (nz * ext[2]) ** 2);
    cuts.push([nx, y, nz, e * (oc + 0.16 + rnd() * 0.1)]);
  }
  return { rnd, ext, cuts };
}

export function sculptRock(seed: number, o: SculptOpts = {}): THREE.BufferGeometry {
  if (o.poly) return polyRock(seed, o);
  const { rnd, ext, cuts } = rockCuts(seed, o);
  const boxy = o.boxy ?? 2.6, round = o.round ?? 0.07, lump = o.lump ?? 0.06, base = o.base === undefined ? -0.55 : o.base, strata = o.strata ?? 0;
  const ox = rnd() * 50, oy = rnd() * 50, oz = rnd() * 50;
  const sdf = (x: number, y: number, z: number) => {
    const q = (Math.abs(x / ext[0]) ** boxy + Math.abs(y / ext[1]) ** boxy + Math.abs(z / ext[2]) ** boxy) ** (1 / boxy);
    let d = (q - 1) * Math.min(ext[0], ext[1], ext[2]);
    for (const c of cuts) d = smax(d, x * c[0] + y * c[1] + z * c[2] - c[3], round);
    if (base !== null) d = smax(d, -y + base * ext[1], round * 0.6);
    d += lump * noise3(x * 1.1 + ox, y * 1.1 + oy, z * 1.1 + oz) + lump * 0.35 * noise3(x * 2.6 + oz, y * 2.6 + ox, z * 2.6 + oy);
    if (strata > 0) d += strata * 0.035 * Math.max(0, Math.sin(y * 9 + noise3(x * 0.7, 3, z * 0.7) * 2.0)) ;
    return d;
  };
  const g = surfaceNets(sdf, [-ext[0] * 1.25, -ext[1] * 1.25, -ext[2] * 1.25], [ext[0] * 1.25, ext[1] * 1.25, ext[2] * 1.25], o.res ?? 36);
  if (o.fit) fitRock(g, ext, base, o.fit);
  return g;
}

/** re-fit a finished rock to its nominal box: x/z half extents = f·ext, y from base·ext to f·ext (normals follow) */
function fitRock(g: THREE.BufferGeometry, ext: [number, number, number], base: number | null, f: number) {
  g.computeBoundingBox();
  {
    const b = g.boundingBox!, y0 = base === null ? -f * ext[1] : base * ext[1];
    const sx = 2 * f * ext[0] / (b.max.x - b.min.x), sy = (f * ext[1] - y0) / (b.max.y - b.min.y), sz = 2 * f * ext[2] / (b.max.z - b.min.z);
    const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, (p.getX(i) - cx) * sx, y0 + (p.getY(i) - b.min.y) * sy, (p.getZ(i) - cz) * sz);
      const nx = n.getX(i) / sx, ny = n.getY(i) / sy, nz = n.getZ(i) / sz, l = Math.hypot(nx, ny, nz) || 1; n.setXYZ(i, nx / l, ny / l, nz / l);
    }
    g.computeBoundingBox(); g.computeBoundingSphere();
  }
}

/** the rock as the convex polyhedron box ∩ {n·p ≤ d} of its cut planes (+ the flat base): exact flat facets, fan-triangulated,
 *  per-face tint (lit crowns, darker undersides, ±8 % per facet) */
function polyRock(seed: number, o: SculptOpts): THREE.BufferGeometry {
  const { ext, cuts } = rockCuts(seed, o), base = o.base === undefined ? -0.55 : o.base;
  type V3 = [number, number, number];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const order = (pts: V3[], n: V3): V3[] => { // CCW seen from +n, deduped
    const c: V3 = [0, 0, 0]; for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; }
    const u0: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = [u0[1] * n[2] - u0[2] * n[1], u0[2] * n[0] - u0[0] * n[2], u0[0] * n[1] - u0[1] * n[0]] as V3, ul = Math.hypot(...u); u[0] /= ul; u[1] /= ul; u[2] /= ul;
    const v: V3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const out = pts.map((p) => ({ p, a: Math.atan2(dot([p[0] - c[0], p[1] - c[1], p[2] - c[2]], v), dot([p[0] - c[0], p[1] - c[1], p[2] - c[2]], u)) })).sort((a, b) => a.a - b.a).map((q) => q.p);
    return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-4; });
  };
  const B: V3 = [ext[0] * 1.05, ext[1] * 1.05, ext[2] * 1.05];
  let faces: Array<{ n: V3; pts: V3[] }> = [];
  for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]] as Array<[number, number]>) {
    const n: V3 = [0, 0, 0]; n[ax] = sg; const pts: V3[] = [];
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) { const p: V3 = [0, 0, 0]; p[ax] = sg * B[ax]; p[(ax + 1) % 3] = s1 * B[(ax + 1) % 3]; p[(ax + 2) % 3] = s2 * B[(ax + 2) % 3]; pts.push(p); }
    faces.push({ n, pts: order(pts, n) });
  }
  const planes: Array<[V3, number]> = cuts.map((c) => [[c[0], c[1], c[2]], c[3]]);
  if (base !== null) planes.push([[0, -1, 0], -base * ext[1]]);
  for (const [n, d] of planes) {
    const next: typeof faces = [], cap: V3[] = [];
    for (const f of faces) {
      const res: V3[] = [];
      for (let i = 0; i < f.pts.length; i++) {
        const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length], da = dot(n, a) - d, db = dot(n, b) - d;
        if (da <= 0) res.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db), p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; res.push(p); cap.push(p); }
      }
      if (res.length >= 3) next.push({ n: f.n, pts: res });
    }
    if (cap.length >= 3) { const o2 = order(cap, n); if (o2.length >= 3) next.push({ n, pts: o2 }); }
    if (next.length >= 4) faces = next;
  }
  const rnd = mulberry(seed * 31 + 7), pos: number[] = [], col: number[] = [];
  for (const f of faces) {
    const k = (f.n[1] > 0.6 ? 1.08 : f.n[1] < -0.4 ? 0.7 : 0.95) * (0.92 + rnd() * 0.16);
    for (let i = 1; i + 1 < f.pts.length; i++) for (const p of [f.pts[0], f.pts[i], f.pts[i + 1]]) {
      pos.push(p[0], p[1], p[2]);
      const lo = 0.78 + 0.22 * Math.min(1, Math.max(0, (p[1] / ext[1] + 1) / 1.4));   // darker toward the foot
      col.push(k * lo, k * lo, k * lo * 1.01);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  if (o.fit) fitRock(g, ext, base, o.fit);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** naive surface nets over a box; normals from the SDF gradient */
export function surfaceNets(f: (x: number, y: number, z: number) => number, lo: [number, number, number], hi: [number, number, number], res: number): THREE.BufferGeometry {
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), h = span / res;
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  const I = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[I(i, j, k)] = f(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const v = V[I(i + corner[c][0], j + corner[c][1], k + corner[c][2])]; cv[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t; sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t; sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t; n++;
    }
    cellVert[I(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { // x edges
    const a = V[I(i, j, k)], b = V[I(i + 1, j, k)]; if ((a < 0) === (b < 0)) continue;
    quad(cellVert[I(i, j - 1, k - 1)], cellVert[I(i, j, k - 1)], cellVert[I(i, j, k)], cellVert[I(i, j - 1, k)], !(a < 0));
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { // y edges
    const a = V[I(i, j, k)], b = V[I(i, j + 1, k)]; if ((a < 0) === (b < 0)) continue;
    quad(cellVert[I(i - 1, j, k - 1)], cellVert[I(i - 1, j, k)], cellVert[I(i, j, k)], cellVert[I(i, j, k - 1)], !(a < 0));
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { // z edges
    const a = V[I(i, j, k)], b = V[I(i, j, k + 1)]; if ((a < 0) === (b < 0)) continue;
    quad(cellVert[I(i - 1, j - 1, k)], cellVert[I(i, j - 1, k)], cellVert[I(i, j, k)], cellVert[I(i - 1, j, k)], !(a < 0));
  }
  const P = new Float32Array(pos), N = new Float32Array(pos.length), e = h * 0.5;
  for (let v = 0; v < P.length; v += 3) {
    const x = P[v], y = P[v + 1], z = P[v + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
    N[v] = gx; N[v + 1] = gy; N[v + 2] = gz;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  g.setIndex(idx);
  // winding check: make faces point along the gradient
  fixWinding(g);
  cavityColors(g, lo[1], hi[1]);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** per-vertex "cavity" tint: convex edges brighter (worn highlights), creases darker (AO), darker toward the base */
function cavityColors(g: THREE.BufferGeometry, y0: number, y1: number) {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, idx = g.index!.array;
  const cnt = p.count, acc = new Float32Array(cnt * 3), deg = new Float32Array(cnt);
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = idx[t + k], b = idx[t + (k + 1) % 3];
    acc[a * 3] += p.getX(b); acc[a * 3 + 1] += p.getY(b); acc[a * 3 + 2] += p.getZ(b); deg[a]++;
    acc[b * 3] += p.getX(a); acc[b * 3 + 1] += p.getY(a); acc[b * 3 + 2] += p.getZ(a); deg[b]++;
  }
  const raw = new Float32Array(cnt);
  let el = 0, en = 0;
  for (let t = 0; t < idx.length; t += 9) { const a = idx[t], b = idx[t + 1]; el += Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b), p.getZ(a) - p.getZ(b)); en++; }
  el = el / Math.max(1, en);
  for (let i = 0; i < cnt; i++) {
    if (!deg[i]) continue;
    const lx = acc[i * 3] / deg[i] - p.getX(i), ly = acc[i * 3 + 1] / deg[i] - p.getY(i), lz = acc[i * 3 + 2] / deg[i] - p.getZ(i);
    raw[i] = -(lx * n.getX(i) + ly * n.getY(i) + lz * n.getZ(i)) / el; // + convex, − concave
  }
  // two smoothing passes over the ring so the tint reads as soft wear, not noise
  let cur = raw;
  for (let pass = 0; pass < 2; pass++) {
    const nx = new Float32Array(cnt), nd = new Float32Array(cnt);
    for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; nx[a] += cur[b]; nd[a]++; nx[b] += cur[a]; nd[b]++; }
    const out = new Float32Array(cnt); for (let i = 0; i < cnt; i++) out[i] = nd[i] ? (cur[i] * 0.4 + 0.6 * nx[i] / nd[i]) : cur[i];
    cur = out;
  }
  const col = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const c = Math.max(-1, Math.min(1, cur[i] * 5));
    const v = (p.getY(i) - y0) / (y1 - y0), base = 0.72 + 0.28 * Math.min(1, v * 1.6);
    const k = (c > 0 ? 1 + c * 0.42 : 1 + c * 0.38) * base;
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k * (c > 0 ? 0.98 : 1.02);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

function fixWinding(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, idx = g.index!.array as unknown as number[];
  let agree = 0, total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3 * 7) {
    a.fromBufferAttribute(p, idx[t]); b.fromBufferAttribute(p, idx[t + 1]); c.fromBufferAttribute(p, idx[t + 2]);
    fn.subVectors(b, a).cross(c.sub(a)); vn.fromBufferAttribute(n, idx[t]);
    if (fn.dot(vn) > 0) agree++; total++;
  }
  if (agree < total / 2) { const arr = g.index!.array as Uint32Array | Uint16Array; for (let t = 0; t < arr.length; t += 3) { const s = arr[t + 1]; arr[t + 1] = arr[t + 2]; arr[t + 2] = s; } g.index!.needsUpdate = true; }
}

// ---------------------------------------------------------------- families + placement
export type RockFamily = "boulder" | "cliff" | "slab" | "pebble" | "basalt" | "slate" | "lava" | "lavaout" | "cleft" | "cleftout";
const FAMILY: Record<RockFamily, (i: number) => SculptOpts> = {
  // river/pool boulders: rounded, few soft facets
  boulder: (i) => ({ cuts: 5, round: 0.16, boxy: 2.2, lump: 0.05, base: -0.45, sideCuts: 0.3, ext: [1, 0.66 + (i % 3) * 0.08, 0.86] }),
  // cliff blocks: boxy, many crisp vertical facets, slight strata
  cliff: (i) => ({ cuts: 9, round: 0.06, boxy: 3.2, lump: 0.05, base: -0.8, sideCuts: 0.75, strata: 0.6, ext: [1, 0.85 + (i % 2) * 0.2, 0.8] }),
  // flat slabs / ledges
  slab: (i) => ({ cuts: 7, round: 0.05, boxy: 3.5, lump: 0.03, base: -0.6, sideCuts: 0.8, ext: [1, 0.34 + (i % 3) * 0.06, 0.9] }),
  pebble: (i) => ({ res: 18, cuts: 4, round: 0.2, boxy: 2.0, lump: 0.05, base: -0.4, sideCuts: 0.2, ext: [1, 0.6 + (i % 2) * 0.1, 0.8] }),
  // columnar basalt chunks: hexagon-ish prisms (6 vertical cuts) with a tilted top
  basalt: (i) => ({ cuts: 8, round: 0.035, boxy: 4, lump: 0.025, base: -0.9, sideCuts: 0.92, ext: [0.8, 1, 0.8 - (i % 2) * 0.1] }),
  // poi-jungle falls gorge (wet slate-blue walls): big rounded blocks with a flattish mossy crown and a few
  // broad soft facets — they stack and overlap into a continuous wall
  slate: (i) => ({ cuts: 6, round: 0.13, boxy: 2.9, lump: 0.045, base: -0.75, sideCuts: 0.55, ext: [1, 0.74 + (i % 3) * 0.07, 0.9] }),
  // ripe peak (jointed lava-rock terraces): boxy blocks, many crisp mostly-vertical facets, a flat-ish crown,
  // faint strata — they stretch tall (bench walls) without reading as columns
  lava: (i) => ({ cuts: 10, round: 0.045, boxy: 3.1, lump: 0.05, base: -0.92, sideCuts: 0.72, strata: 0.3, ext: [1, 0.92 + (i % 2) * 0.06, 0.86] }),
  // free-standing lava outcrops: chunkier, more tilted facets
  lavaout: (i) => ({ cuts: 9, round: 0.06, boxy: 2.6, lump: 0.07, base: -0.7, sideCuts: 0.45, ext: [1, 0.8 + (i % 3) * 0.08, 0.9] }),
  // ripe peak (chunky CLEAVED lava rock): an ellipsoid core cut deep by many planes → a crisp angular
  // polyhedron of big flat facets (bevelled a touch), a flat-ish crown, chipped edges — never a pillow / potato
  cleft: (i) => ({ cuts: 12, round: 0.028, boxy: 2.2, lump: 0.018, base: -0.92, sideCuts: 0.78, cutOff: [0.5, 0.26], chips: 4, strata: 0.15, fit: 0.9, poly: true, ext: [1, 0.92 + (i % 2) * 0.06, 0.82] }),
  cleftout: (i) => ({ cuts: 11, round: 0.03, boxy: 2.0, lump: 0.02, base: -0.72, sideCuts: 0.5, cutOff: [0.48, 0.28], chips: 5, fit: 0.9, poly: true, ext: [1, 0.78 + (i % 3) * 0.08, 0.88] }),
};
const protoCache = new Map<string, THREE.BufferGeometry[]>();
/** N cached prototypes of a family */
export function rockProtos(family: RockFamily, n = 6, res?: number): THREE.BufferGeometry[] {
  const key = `${family}|${n}|${res ?? 0}`;
  let list = protoCache.get(key);
  if (!list) {
    list = [];
    for (let i = 0; i < n; i++) { const o = FAMILY[family](i); if (res) o.res = res; list.push(sculptRock(1000 * (Object.keys(FAMILY).indexOf(family) + 1) + i, o)); }
    protoCache.set(key, list);
  }
  return list;
}

export interface RockPlacement { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; rx?: number; rz?: number; proto?: number }
/** instanced rocks: one InstancedMesh per prototype used (per spatial cell when `cell` is given, so off-screen cells are
 *  frustum-culled); `cast` false = no cascade shadows (the static far map still bakes them via userData.farShadow) */
export function rockInstances(protos: THREE.BufferGeometry[], placements: RockPlacement[], mat: THREE.Material, name: string, rnd = mulberry(5), o: { cell?: number; cast?: boolean } = {}): THREE.Group {
  const grp = new THREE.Group(); grp.name = name;
  const buckets = new Map<string, THREE.Matrix4[]>();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const r of placements) {
    const k = (r.proto ?? Math.floor(rnd() * protos.length)) % protos.length;
    const cellKey = o.cell ? `${Math.floor(r.x / o.cell)},${Math.floor(r.z / o.cell)}` : "";
    e.set(r.rx ?? 0, r.ry, r.rz ?? 0); q.setFromEuler(e); p.set(r.x, r.y, r.z); s.set(r.sx, r.sy, r.sz);
    const key = `${k}|${cellKey}`; let list = buckets.get(key); if (!list) buckets.set(key, (list = []));
    list.push(m.compose(p, q, s).clone());
  }
  for (const [key, list] of buckets) {
    const k = +key.split("|")[0];
    const im = new THREE.InstancedMesh(protos[k], mat, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox();
    im.castShadow = o.cast !== false; im.receiveShadow = true; im.name = o.cell ? `${name}-${key}` : `${name}-${k}`;
    if (o.cast === false) { im.userData.castShadow = false; im.userData.farShadow = true; }
    grp.add(im);
  }
  return grp;
}

/** THREE-level LOD for a rock field: hi (hero close-ups, casts), mid, far — each its own per-cell instanced set (the far set
 *  uses big cells: few draws); returns the objects + the distance-switch items (near/far radii per level) */
export function rockLOD3(fam: RockFamily, n: number, placements: RockPlacement[], mat: THREE.Material, name: string,
  o: { res?: [number, number, number]; split?: [number, number]; cell?: number; farCell?: number; cast?: boolean; farMax?: number; /** finite minimum horizon for low geometry supporting persistent authored vegetation */ supportMax?: number; /** rocks smaller than this (max half extent, m) are left out of the far set */ farMinSize?: number } = {}) {
  const [rh, rm, rf] = o.res ?? [16, 8, 5], [s1, s2] = o.split ?? [45, 160];
  const hi = rockInstances(rockProtos(fam, n, rh), placements, mat, name, undefined, { cell: o.cell ?? 64, cast: o.cast ?? true });
  // the mid set casts when the field casts (else the rocks' shadows vanish with the hi set at its split)
  const mid = rockInstances(rockProtos(fam, n, rm), placements, mat, name + "-mid", undefined, { cell: o.cell ?? 64, cast: o.cast ?? true });
  const far = rockInstances(rockProtos(fam, n, rf), placements.filter((p) => Math.max(p.sx, p.sy, p.sz) >= (o.farMinSize ?? 0)), mat, name + "-far", undefined, { cell: o.farCell ?? 200, cast: false });
  // Support retention extends only the existing lowest geometry, without new prototypes or cascade casters.
  const supportMax = o.supportMax ?? 0;
  far.userData.rockSupportMax = supportMax;
  // ONE decision per FAR cell: every level's objects switch on the distance to the centre of the far cell that contains
  // them (mixed cell sizes deciding separately left holes: a small cell > s2 away inside a big cell < s2 away showed neither)
  const FC = o.farCell ?? 200, ctr = new Map<string, THREE.Vector3>();
  const centerOf = (c: THREE.Object3D) => { const im = c as THREE.InstancedMesh; if (!im.boundingBox) im.computeBoundingBox(); const b = im.boundingBox!.getCenter(new THREE.Vector3());
    const k = `${Math.floor(b.x / FC)},${Math.floor(b.z / FC)}`; let v = ctr.get(k); if (!v) ctr.set(k, (v = new THREE.Vector3((Math.floor(b.x / FC) + 0.5) * FC, b.y, (Math.floor(b.z / FC) + 0.5) * FC))); return v; };
  const lods: Array<{ o: THREE.Object3D; near?: number; far?: number; center?: THREE.Vector3 }> = [];
  for (const c of far.children) lods.push({ o: c, near: s2, far: Math.max(o.farMax ?? Infinity, supportMax), center: centerOf(c) });
  for (const c of hi.children) lods.push({ o: c, far: s1, center: centerOf(c) });
  for (const c of mid.children) lods.push({ o: c, near: s1, far: s2, center: centerOf(c) });
  return { groups: [hi, mid, far], lods };
}
