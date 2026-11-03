// poi-town: hero longboat (Stilt Town, Coconut Cove):
// a chunky stylized clinker/plank hull, red or yellow paint with cream + teal stripes, green thwarts,
// tall bow post with a red ribbon, oars in rowlocks, long-tail outboard, tyres/fenders, cargo (barrel, crate, sack).
// Origin at the keel centre at the water line, +x = bow. Length ~5.6 m, beam ~1.6 m.
//
// How it is built: a real lofted hull — 31 stations from the transom to a raked stem, each section a round-bilge
// superellipse that sharpens to a V at the bow; the outside is one band per strake, every band standing proud of the
// one below by a lap (the dark ledge = the plank line), double-walled (painted inner skin), with a swept gunwale cap,
// one swept keel → stem → bow-post timber, ribs, risers, thwarts, sole boards and stern sheets. Colours are baked per
// vertex in boat space (wet band, algae, sun-bleached tops, interior AO) and handed to the merged GeoBins.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { TownBins, BinName } from "./town-materials";
import { col, cylGeo, latheGeo, tubeGeo } from "./town-geo";

export type LongboatCargo = "barrel" | "crate" | "sack" | "rope" | "lantern" | "tub";
export interface LongboatOpts {
  /** hull paint + stripe colours */
  hull: string; stripe: string; lower?: string;
  motor?: boolean; oars?: boolean; ribbon?: boolean;
  len?: number;
  /** interior paint (default: the hull colour, a little muted) */
  inner?: string;
  /** thwart paint (default seat green) */
  seat?: string;
  /** stripe height as a fraction of the hull depth: ~0.05 = a pinstripe (default), ~0.12 = a full strake */
  stripeH?: number;
  /** "longtail" = Thai long-shaft engine on a stern mount (default), "outboard" = small clamp-on */
  motorKind?: "longtail" | "outboard";
  /** yaw of the long-tail shaft off the centreline (rad, default 0.18) */
  tailYaw?: number;
  /** cargo in the boat (default: picked by rng) */
  cargo?: LongboatCargo[];
  /** fenders hung over the sides (default 3) */
  fenders?: number;
  /** world point the bow line runs to (e.g. a pile); default = a slack line dropping into the water */
  moorTo?: THREE.Vector3;
}

type V3 = THREE.Vector3;
type Tint = (p: V3, n: V3, c: THREE.Color) => void;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), ZAX = V(0, 0, 1);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- mesh builder
/** indexed triangle builder with explicit normals; every triangle is wound to agree with its vertex normals */
class GB {
  p: number[] = []; n: number[] = []; t: number[] = []; i: number[] = [];
  v(p: V3, n: V3, u = 0, w = 0): number {
    const l = n.length() || 1;
    this.p.push(p.x, p.y, p.z); this.n.push(n.x / l, n.y / l, n.z / l); this.t.push(u, w);
    return this.p.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) {
    const P = this.p, N = this.n;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
    const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    const d = fx * (N[a * 3] + N[b * 3] + N[c * 3]) + fy * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + fz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
    if (d < 0) this.i.push(a, c, b); else this.i.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number) { this.tri(a, b, c); this.tri(a, c, d); }
  /** rows P[i][j] (i along the length, j across); uv = metres along i / along j */
  grid(P: V3[][], N: V3[][]) {
    const ni = P.length, nj = P[0].length, base = this.p.length / 3;
    const uAcc = new Array(nj).fill(0);
    for (let i = 0; i < ni; i++) {
      let w = 0;
      for (let j = 0; j < nj; j++) {
        if (i > 0) uAcc[j] += P[i][j].distanceTo(P[i - 1][j]);
        if (j > 0) w += P[i][j].distanceTo(P[i][j - 1]);
        this.v(P[i][j], N[i][j], uAcc[j], w);
      }
    }
    for (let i = 0; i < ni - 1; i++) for (let j = 0; j < nj - 1; j++) {
      const a = base + i * nj + j, b = base + (i + 1) * nj + j;
      this.quad(a, b, b + 1, a + 1);
    }
  }
  geo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.t, 2));
    g.setIndex(this.i);
    return g;
  }
}

/** profile segment for sweeps: endpoints (a, b) + normals in the (A, B) frame plane; a hard edge = two segments */
interface Seg { a: [number, number]; b: [number, number]; na: [number, number]; nb: [number, number] }
/** rectangle profile w (along A) × h (along B) centred at (cx, cy) with rounded (smooth-normal) chamfers */
function bevelRect(w: number, h: number, bv: number, cx = 0, cy = 0): Seg[] {
  const x = w / 2, y = h / 2, c = Math.min(bv, x * 0.9, y * 0.9);
  const P: Array<[number, number]> = [[x - c, -y], [x, -y + c], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c], [-x + c, -y]].map(([a, b]) => [a + cx, b + cy] as [number, number]);
  const F: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  if (c < 1e-4) return [{ a: P[1], b: P[2], na: F[1], nb: F[1] }, { a: P[3], b: P[4], na: F[2], nb: F[2] }, { a: P[5], b: P[6], na: F[3], nb: F[3] }, { a: P[7], b: P[0], na: F[0], nb: F[0] }];
  return [
    { a: P[0], b: P[1], na: F[0], nb: F[1] }, { a: P[1], b: P[2], na: F[1], nb: F[1] },
    { a: P[2], b: P[3], na: F[1], nb: F[2] }, { a: P[3], b: P[4], na: F[2], nb: F[2] },
    { a: P[4], b: P[5], na: F[2], nb: F[3] }, { a: P[5], b: P[6], na: F[3], nb: F[3] },
    { a: P[6], b: P[7], na: F[3], nb: F[0] }, { a: P[7], b: P[0], na: F[0], nb: F[0] },
  ];
}
/** sweep a profile along a path with explicit frames (A, B ⟂ tangent). caps close both ends (flat). */
function sweep(gb: GB, path: V3[], A: V3[], B: V3[], segs: Seg[], o: { caps?: boolean; sA?: number[]; sB?: number[]; uScale?: number } = {}) {
  const n = path.length, uS = o.uScale ?? 1;
  const arc = [0]; for (let i = 1; i < n; i++) arc.push(arc[i - 1] + path[i].distanceTo(path[i - 1]));
  const pt = (i: number, q: [number, number]) => path[i].clone().addScaledVector(A[i], q[0] * (o.sA?.[i] ?? 1)).addScaledVector(B[i], q[1] * (o.sB?.[i] ?? 1));
  const nr = (i: number, q: [number, number]) => A[i].clone().multiplyScalar(q[0]).addScaledVector(B[i], q[1]);
  let per = 0;
  for (const s of segs) {
    const l = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    if (l < 1e-5) { per += l; continue; }
    let prevA = -1, prevB = -1;
    for (let i = 0; i < n; i++) {
      const ia = gb.v(pt(i, s.a), nr(i, s.na), arc[i] * uS, per), ib = gb.v(pt(i, s.b), nr(i, s.nb), arc[i] * uS, per + l);
      if (i > 0) gb.quad(prevA, ia, ib, prevB);
      prevA = ia; prevB = ib;
    }
    per += l;
  }
  if (o.caps) for (const end of [0, n - 1]) {
    const t = end === 0 ? path[0].clone().sub(path[1]).normalize() : path[n - 1].clone().sub(path[n - 2]).normalize();
    const ring = segs.map((s) => pt(end, s.a));
    const c = ring.reduce((a, b) => a.add(b), V()).multiplyScalar(1 / ring.length);
    const ic = gb.v(c, t, 0, 0), ids = ring.map((p) => gb.v(p, t, p.x - c.x, p.y - c.y));
    for (let k = 0; k < ids.length; k++) gb.tri(ic, ids[k], ids[(k + 1) % ids.length]);
  }
}
/** frames for a path: A = `side` made ⟂ to the tangent, B = T × A flipped toward `upHint` */
function frames(path: V3[], side: (i: number) => V3, upHint: V3 = UP): { A: V3[]; B: V3[] } {
  const A: V3[] = [], B: V3[] = [];
  for (let i = 0; i < path.length; i++) {
    const t = path[Math.min(path.length - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize();
    const a = side(i).clone(); a.addScaledVector(t, -a.dot(t)).normalize();
    const b = t.clone().cross(a).normalize(); if (b.dot(upHint) < 0) b.negate();
    A.push(a); B.push(b);
  }
  return { A, B };
}
/** straight bevelled bar from a to b: width w (along `side`), height h (along the up-ish axis) */
function bar(gb: GB, a: V3, b: V3, w: number, h: number, bv: number, side: V3 = ZAX, upHint: V3 = UP) {
  const path = [a, b], f = frames(path, () => side, upHint);
  sweep(gb, path, f.A, f.B, bevelRect(w, h, bv), { caps: true });
}
/** basis matrix: local +y along `dir` starting at `at`, local +z as close to `face` as possible */
function alongM(at: V3, dir: V3, face: V3 = UP): THREE.Matrix4 {
  const y = dir.clone().normalize();
  let z = face.clone().addScaledVector(y, -face.dot(y));
  if (z.lengthSq() < 1e-6) z = V(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  const x = y.clone().cross(z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(at);
}
const TM = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), V(sx, sy, sz));

/** squeeze a primitive's metre UVs so the plank texture reads as one long board (no seams across small parts) */
function grain(g: THREE.BufferGeometry, su = 0.15, sv = 0.12): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * sv + 0.3, uv.getX(i) * su + 0.05);
  return g;
}

// ---------------------------------------------------------------- painter (per-vertex colour in boat space)
const _c = new THREE.Color(), _p = V(), _n = V();
class Painter {
  tris = 0; stats: Record<string, number> = {}; private lastMark = 0; private label = "start";
  mark(label: string) { this.stats[this.label] = (this.stats[this.label] ?? 0) + this.tris - this.lastMark; this.lastMark = this.tris; this.label = label; }
  constructor(private bins: TownBins, private at: THREE.Matrix4) {}
  add(bin: BinName, g: THREE.BufferGeometry, local: THREE.Matrix4 | null, base: THREE.ColorRepresentation, tint?: Tint) {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    if (local) ng.applyMatrix4(local);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "uv"].includes(k)) ng.deleteAttribute(k);
    const pos = ng.attributes.position as THREE.BufferAttribute, nor = ng.attributes.normal as THREE.BufferAttribute;
    const cnt = pos.count, rgb = new Float32Array(cnt * 3), b = new THREE.Color(base);
    for (let i = 0; i < cnt; i++) {
      _c.copy(b);
      if (tint) { _p.fromBufferAttribute(pos, i); _n.fromBufferAttribute(nor, i); tint(_p, _n, _c); }
      rgb[i * 3] = _c.r; rgb[i * 3 + 1] = _c.g; rgb[i * 3 + 2] = _c.b;
    }
    // GeoBin walks the (non-indexed) vertices in order: hand it the baked colour of each one
    let k = 0;
    this.bins[bin].add(ng, this.at, 0xffffff, (_x, _y, _z, _b, out) => { if (k < cnt) out.setRGB(rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]); k++; });
    this.tris += cnt / 3;
    ng.dispose();
    g.dispose();
  }
  gb(bin: BinName, gb: GB, base: THREE.ColorRepresentation, tint?: Tint) { if (gb.i.length) this.add(bin, gb.geo(), null, base, tint); }
}

// ---------------------------------------------------------------- hull lines
function hullLines(L: number) {
  const HB = 0.82, KY = -0.25, RAKE = 0.62, XS = -L / 2 + 0.08, XB = L / 2 - RAKE;
  const xb = (u: number) => XS + (XB - XS) * u;
  /** stem rake (bow sections lean forward at the top) + transom rake (top aft) */
  const rk = (u: number) => (u > 0.5 ? RAKE * ((u - 0.5) / 0.5) ** 2 : 0) - (u < 0.16 ? 0.09 * ((0.16 - u) / 0.16) ** 2 : 0);
  /** sheer: low amidships, rising gently aft and strongly to the bow */
  const ys = (u: number) => (u < 0.4 ? 0.58 + 0.2 * ((0.4 - u) / 0.4) ** 2 : 0.58 + 0.52 * ((u - 0.4) / 0.6) ** 2.2);
  /** keel: slight rocker aft, forefoot lifting into the stem */
  const yk = (u: number) => KY + 0.07 * Math.max(0, (0.22 - u) / 0.22) ** 2 + 0.12 * Math.max(0, (u - 0.7) / 0.3) ** 2;
  /** half-beam at the sheer */
  const hb = (u: number) => (u <= 0.42 ? HB * (1 - 0.22 * ((0.42 - u) / 0.42) ** 2) : HB * Math.max(0, 1 - ((u - 0.42) / 0.58) ** 1.9) ** 0.72);
  /** section exponent: round bilge amidships → V at the bow */
  const ex = (u: number) => 0.72 + 1.1 * sstep(0.55, 1, u);
  const zp = (h: number, e: number) => Math.max(0, 1 - Math.pow(1 - h, 2 / e)) ** (e / 2);
  /** surface point: u 0 (transom) → 1 (stem), h 0 (keel) → 1 (sheer), s = side (+1 starboard/+z, −1 port) */
  const P = (u: number, h: number, s: number): V3 => {
    u = clamp01(u); h = clamp01(h);
    return V(xb(u) + rk(u) * Math.pow(h, 0.7), yk(u) + (ys(u) - yk(u)) * h, s * hb(u) * zp(h, ex(u)) * (0.84 + 0.16 * h));
  };
  /** outward unit normal */
  const N = (u: number, h: number, s: number): V3 => {
    const d = 0.004;
    const tu = P(Math.min(1, u + d), h, s).sub(P(Math.max(0, u - d), h, s));
    const th = P(u, Math.min(1, h + d), s).sub(P(u, Math.max(0, h - d), s));
    const n = tu.cross(th).multiplyScalar(s);
    return n.lengthSq() < 1e-14 ? V(0, 0, s) : n.normalize();
  };
  /** unit tangent up the girth */
  const TH = (u: number, h: number, s: number): V3 => P(u, Math.min(1, h + 0.004), s).sub(P(u, Math.max(0, h - 0.004), s)).normalize();
  const hAt = (u: number, y: number) => clamp01((y - yk(u)) / (ys(u) - yk(u)));
  return { L, HB, KY, XS, XB, RAKE, xb, rk, ys, yk, hb, P, N, TH, hAt };
}

// ---------------------------------------------------------------- the boat
export function addLongboat(bins: TownBins, at: THREE.Matrix4, o: LongboatOpts, rng: () => number): void {
  const pt = new Painter(bins, at);
  pt.mark("hull");
  const H = hullLines(o.len ?? 5.6);
  const T = 0.035, LAP = 0.022, FLOOR = 0.07, TY = 0.34;
  const hullC = col(o.hull), stripeC = col(o.stripe), lowerC = col(o.lower ?? "#1f8a8a");
  const innerC = o.inner ? col(o.inner) : col(o.hull).lerp(col("#b98b58"), 0.08).multiplyScalar(0.94);
  const capC = col(o.hull).multiplyScalar(1.08);
  const seatC = col(o.seat ?? "#5f9f68");
  const ALGAE = col("#4d5a33"), ROPE = "#c9a066";

  // stations (denser toward the bow where the lines turn fast)
  const NU = 30, US: number[] = [];
  for (let i = 0; i <= NU; i++) US.push(1 - Math.pow(1 - i / NU, 1.4));

  // paint weathering in boat space: smooth mottling, sun-bleached tops, grime at the ends, wet band, algae below
  const weather: Tint = (p, n, c) => {
    c.multiplyScalar(0.95 + 0.07 * Math.sin(p.x * 2.3 + p.y * 5.1) * Math.sin(p.x * 0.7 - p.z * 3.3 + 1.7));
    if (n.y > 0.4) c.multiplyScalar(1 + 0.12 * (n.y - 0.4));
    c.multiplyScalar(1 - 0.08 * sstep(H.L / 2 - 0.9, H.L / 2, Math.abs(p.x)) * sstep(0.35, 0.0, p.y));
    c.multiplyScalar(1 - 0.34 * sstep(0.13, -0.02, p.y));
    if (p.y < -0.01) c.lerp(ALGAE, 0.35 * sstep(-0.01, -0.14, p.y));
  };
  const innerAO: Tint = (p, n, c) => {
    c.multiplyScalar(0.7 + 0.3 * sstep(FLOOR, FLOOR + 0.42, p.y));
    if (n.y > 0.5) c.multiplyScalar(1.08);
  };
  const plainAO: Tint = (p, n, c) => { c.multiplyScalar(0.8 + 0.2 * sstep(FLOOR, FLOOR + 0.4, p.y)); if (n.y > 0.6) c.multiplyScalar(1.1); };

  // ---- strake edges (fractions of the hull depth): garboard, lower (teal) strakes, stripe, two top strakes
  const top0 = 0.8, sT = top0 - Math.max(0.02, o.stripeH ?? 0.05);
  const edges = [0, 0.13];
  const nLow = Math.max(3, Math.round((sT - 0.13) / 0.105));
  for (let k = 1; k <= nLow; k++) edges.push(0.13 + (sT - 0.13) * k / nLow);
  edges.push(top0, 0.9, 1);
  const bandOf = (k: number) => (k <= nLow ? lowerC : k === nLow + 1 ? stripeC : hullC);
  const lapAt = (h: number) => { for (let k = 1; k < edges.length - 1; k++) if (h < edges[k + 1]) return h < edges[k] ? 0 : LAP * (1 - (h - edges[k]) / (edges[k + 1] - edges[k])); return 0; };

  // ---- outer skin: one lapped band per strake + its ledge (the plank line)
  for (const s of [-1, 1]) for (let k = 0; k < edges.length - 1; k++) {
    const h0 = edges[k], h1 = edges[k + 1];
    const face = new GB(), lip = new GB();
    const rows = h1 - h0 > 0.12 ? [0, 0.5, 1] : [0, 1];
    const Pf: V3[][] = [], Nf: V3[][] = [], Pl: V3[][] = [], Nl: V3[][] = [];
    for (const u of US) {
      const rp: V3[] = [], rn: V3[] = [];
      for (const t of rows) {
        const h = h0 + (h1 - h0) * t, n = H.N(u, h, s);
        rp.push(H.P(u, h, s).addScaledVector(n, k === 0 ? 0 : LAP * (1 - t))); rn.push(n);
      }
      Pf.push(rp); Nf.push(rn);
      if (k > 0) {
        const n = H.N(u, h0, s), ln = H.TH(u, h0, s).negate().addScaledVector(n, 0.25).normalize(), p0 = H.P(u, h0, s);
        Pl.push([p0.clone().addScaledVector(n, -0.002), p0.clone().addScaledVector(n, LAP)]); Nl.push([ln, ln]);
      }
    }
    face.grid(Pf, Nf);
    if (k > 0) lip.grid(Pl, Nl);
    const band = bandOf(k).clone().multiplyScalar(0.96 + rng() * 0.08);
    pt.gb("plastic", face, band, weather);
    pt.gb("plastic", lip, band.clone().multiplyScalar(0.3), weather);
  }

  pt.mark("transom");
  // ---- transom: the strakes run round it (same bands + ledges), inner face, cap
  {
    /** transom outward normal (aft, tilted with the rake) */
    const aft = (h: number) => { const d = H.P(0, Math.min(1, h + 0.01), 0).sub(H.P(0, Math.max(0, h - 0.01), 0)); const n = V(-d.y, d.x, 0).normalize(); return n.x > 0 ? n.negate() : n; };
    const COLS = 5;
    for (let k = 0; k < edges.length - 1; k++) {
      const h0 = edges[k], h1 = edges[k + 1], face = new GB(), lip = new GB();
      const Pf: V3[][] = [], Nf: V3[][] = [], Pl: V3[][] = [], Nl: V3[][] = [];
      for (let c = 0; c <= COLS; c++) {
        const f = -1 + 2 * c / COLS, rp: V3[] = [], rn: V3[] = [];
        for (const t of [0, 1]) {
          const h = h0 + (h1 - h0) * t, n = aft(h), e = H.P(0, h, 1);
          rp.push(V(e.x, e.y, e.z * f).addScaledVector(n, k === 0 ? 0 : LAP * (1 - t))); rn.push(n);
        }
        Pf.push(rp); Nf.push(rn);
        if (k > 0) { const n = aft(h0), e = H.P(0, h0, 1), p0 = V(e.x, e.y, e.z * f), ln = V(0, -1, 0); Pl.push([p0.clone(), p0.clone().addScaledVector(n, LAP)]); Nl.push([ln, ln]); }
      }
      face.grid(Pf, Nf);
      if (k > 0) lip.grid(Pl, Nl);
      const band = bandOf(k);
      pt.gb("plastic", face, band, weather);
      pt.gb("plastic", lip, band.clone().multiplyScalar(0.3), weather);
    }
    // inner face
    const inner = new GB(), Pi: V3[][] = [], Ni: V3[][] = [];
    const hf = H.hAt(0, FLOOR - 0.03);
    for (let c = 0; c <= COLS; c++) {
      const f = -1 + 2 * c / COLS, rp: V3[] = [], rn: V3[] = [];
      for (let r = 0; r <= 4; r++) {
        const h = hf + (1 - hf) * r / 4, n = aft(h), e = H.P(0, h, 1);
        rp.push(V(e.x, e.y, (Math.abs(e.z) - T) * f).addScaledVector(n, -T)); rn.push(n.clone().negate());
      }
      Pi.push(rp); Ni.push(rn);
    }
    inner.grid(Pi, Ni);
    pt.gb("plastic", inner, innerC, innerAO);
    // cap across the transom top
    const cap = new GB(), a = H.P(0, 1, -1), b = H.P(0, 1, 1), n1 = aft(1);
    const path = [a.clone().addScaledVector(n1, -T / 2).add(V(0, 0.012, 0)), b.clone().addScaledVector(n1, -T / 2).add(V(0, 0.012, 0))];
    path[0].z -= 0.03; path[1].z += 0.03;
    const fr = frames(path, () => n1, UP);
    sweep(cap, path, fr.A, fr.B, bevelRect(T + 0.06, 0.06, 0.02), { caps: true });
    pt.gb("plastic", cap, capC, weather);
    // corner posts: natural timber down each transom corner, covering the plank ends
    const cp = new GB();
    for (const s of [-1, 1]) {
      const path: V3[] = [], side: V3[] = [];
      for (const h of [0.04, 0.3, 0.6, 0.85, 1]) { const n = H.N(0, h, s); path.push(H.P(0, h, s).addScaledVector(n, 0.004).addScaledVector(aft(h), 0.006)); side.push(n); }
      path[path.length - 1].y += 0.03;
      const fr = frames(path, (i) => side[i], V(-1, 0, 0));
      sweep(cp, path, fr.A, fr.B, bevelRect(0.05, 0.055, 0.014), { caps: true, uScale: 0.3 });
    }
    pt.gb("wood", cp, "#b3804e", weather);
  }

  pt.mark("inner");
  // ---- inner skin (double wall), from just under the sole up to the sheer
  for (const s of [-1, 1]) {
    const g = new GB(), Pi: V3[][] = [], Ni: V3[][] = [];
    for (const u of US) {
      const hf = H.hAt(u, FLOOR - 0.03), rp: V3[] = [], rn: V3[] = [];
      for (let r = 0; r <= 6; r++) {
        const h = hf + (1 - hf) * r / 6, n = H.N(u, h, s), p = H.P(u, h, s).addScaledVector(n, -T);
        if (s * p.z < 0.003) p.z = s * 0.003;
        rp.push(p); rn.push(n.clone().negate());
      }
      Pi.push(rp); Ni.push(rn);
    }
    g.grid(Pi, Ni);
    pt.gb("plastic", g, innerC, innerAO);
  }

  pt.mark("cap");
  // ---- gunwale caps: rounded rail straddling the top of the double wall
  for (const s of [-1, 1]) {
    const g = new GB(), path: V3[] = [], side: V3[] = [];
    for (const u of US) { const n = H.N(u, 1, s); path.push(H.P(u, 1, s).addScaledVector(n, -T / 2 + 0.006)); side.push(n); }
    path[0].addScaledVector(V(-1, 0, 0), 0.02);
    const fr = frames(path, (i) => side[i], UP);
    sweep(g, path, fr.A, fr.B, bevelRect(T + 0.06, 0.065, 0.024, 0, 0.006), { caps: true });
    pt.gb("plastic", g, capC, weather);
  }

  pt.mark("keel");
  // ---- keel → stem → bow post: one timber
  const postTop = V(), postDir = V();
  {
    const g = new GB(), path: V3[] = [], sB: number[] = [], sA: number[] = [];
    for (const u of [0, 0.08, 0.16, 0.26, 0.36, 0.46, 0.56, 0.66, 0.74, 0.81, 0.87, 0.92, 0.96, 0.985, 1]) { path.push(H.P(u, 0, 0)); sA.push(1); sB.push(1); }
    for (const h of [0.03, 0.08, 0.15, 0.25, 0.38, 0.52, 0.68, 0.84, 1]) { path.push(H.P(1, h, 0)); sA.push(1 + 0.15 * h); sB.push(1 + 0.2 * h); }
    postDir.copy(H.P(1, 1, 0)).sub(H.P(1, 0.9, 0)).normalize();
    postTop.copy(H.P(1, 1, 0)).addScaledVector(postDir, 0.55);
    path.push(H.P(1, 1, 0).addScaledVector(postDir, 0.2)); sA.push(1.3); sB.push(1.35);
    path.push(postTop.clone()); sA.push(1.3); sB.push(1.35);
    const A: V3[] = [], B: V3[] = [];
    for (let i = 0; i < path.length; i++) {
      const t = path[Math.min(path.length - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize();
      A.push(ZAX.clone()); B.push(V(-t.y, t.x, 0).normalize());
    }
    sweep(g, path, A, B, bevelRect(0.12, 0.13, 0.026, 0, -0.035), { caps: true, sA, sB, uScale: 0.3 });
    // post head block (squared, a touch proud) + the transom-end knee of the keel
    const fwd = V(-postDir.y, postDir.x, 0).negate();
    const hp = [postTop.clone().addScaledVector(postDir, -0.03), postTop.clone().addScaledVector(postDir, 0.06)];
    const fr = frames(hp, () => ZAX, fwd.clone().negate());
    sweep(g, hp, fr.A, fr.B, bevelRect(0.2, 0.22, 0.035, 0, -0.045), { caps: true, uScale: 0.3 });
    pt.gb("wood", g, "#b3804e", (p, n, c) => { c.multiplyScalar(1 - 0.4 * sstep(0.12, -0.05, p.y)); if (n.y > 0.5) c.multiplyScalar(1.15); });
  }

  pt.mark("sole");
  // ---- sole (floor boards) — sits above the water line so the lagoon never shows inside the hull
  {
    const g = new GB(), Pf: V3[][] = [], Nf: V3[][] = [];
    for (const u of US) {
      if (u > 0.93) break;
      const h = H.hAt(u, FLOOR), rp: V3[] = [];
      for (const s of [-1, 0, 1]) {
        if (s === 0) { rp.push(V(H.P(u, h, 1).x, FLOOR, 0)); continue; }
        const n = H.N(u, h, s), p = H.P(u, h, s).addScaledVector(n, -T + 0.012);
        p.y = FLOOR; if (s * p.z < 0.004) p.z = s * 0.004;
        rp.push(p);
      }
      Pf.push(rp); Nf.push([UP, UP, UP]);
    }
    g.grid(Pf, Nf);
    // metre UVs along x / z so the plank texture runs fore-aft
    const pos = g.p, uv = g.t;
    for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] * 0.9; uv[i * 2 + 1] = pos[i * 3 + 2] + 0.5; }
    pt.gb("wood", g, "#e8d2b0", (p, n, c) => c.multiplyScalar(0.82 + 0.18 * sstep(0.7, 0.1, Math.abs(p.z))));
  }

  pt.mark("ribs");
  // ---- ribs (frames) on the inner skin, risers under the thwarts
  {
    const g = new GB();
    for (const u of [0.14, 0.24, 0.35, 0.44, 0.6, 0.68, 0.84]) for (const s of [-1, 1]) {
      const hf = H.hAt(u, FLOOR), path: V3[] = [], side: V3[] = [];
      for (const t of [0, 0.35, 0.7, 1]) { const h = hf + (0.965 - hf) * t, n = H.N(u, h, s); path.push(H.P(u, h, s).addScaledVector(n, -T - 0.013)); side.push(n); }
      const A = path.map(() => V(1, 0, 0)), B = path.map((_, i) => side[i].clone().negate());
      sweep(g, path, A, B, bevelRect(0.05, 0.028, 0.008), { uScale: 0.3 });
    }
    // risers: a batten along each side at thwart height
    for (const s of [-1, 1]) {
      const path: V3[] = [], side: V3[] = [];
      for (const u of US) {
        if (u < 0.1 || u > 0.86) continue;
        const y = TY - 0.045, h = H.hAt(u, y), n = H.N(u, h, s);
        const p = H.P(u, h, s).addScaledVector(n, -T - 0.024); p.y = y; path.push(p); side.push(n);
      }
      const fr = frames(path, (i) => side[i], UP);
      sweep(g, path, fr.A, fr.B, bevelRect(0.05, 0.045, 0.01), { caps: true });
    }
    pt.gb("wood", g, "#d9a870", plainAO);
  }

  pt.mark("thwarts");
  // ---- thwarts (seats), a mid-post under each, stern sheets, bow deck
  const thwarts = [0.28, 0.52, 0.75];
  const halfIn = (u: number, y: number) => { const h = H.hAt(u, y), n = H.N(u, h, 1); return H.P(u, h, 1).addScaledVector(n, -T).z; };
  {
    const g = new GB(), gw = new GB();
    for (const u of thwarts) {
      const x = H.P(u, H.hAt(u, TY), 1).x, zw = halfIn(u, TY) + 0.015;
      bar(g, V(x, TY, -zw), V(x, TY, zw), 0.26, 0.05, 0.016, V(1, 0, 0));
      bar(gw, V(x, FLOOR, 0), V(x, TY - 0.025, 0), 0.07, 0.07, 0.01, V(1, 0, 0), V(0, 0, 1));
    }
    pt.gb("plastic", g, seatC, (p, n, c) => { if (n.y > 0.5) c.multiplyScalar(1.1); else c.multiplyScalar(0.8); c.multiplyScalar(0.95 + 0.1 * Math.sin(p.z * 9 + p.x)); });
    // stern sheets: slatted deck across the stern, painted like the interior
    const x0 = H.xb(0) + 0.06, x1 = H.P(0.13, 0.5, 1).x;
    for (let i = 0; i < 5; i++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / 5, u = clamp01((x - H.XS) / (H.XB - H.XS)), zw = halfIn(u, TY + 0.02) + 0.01;
      bar(gw, V(x, TY + 0.02, -zw), V(x, TY + 0.02, zw), (x1 - x0) / 5 - 0.02, 0.035, 0.008, V(1, 0, 0));
    }
    pt.gb("woodDark", gw, "#f0dcc0", plainAO);
    // bow deck (breasthook): follows the sheer over the last metre of the bow
    const bd = new GB(), Pb: V3[][] = [], Nb: V3[][] = [];
    for (const u of [0.84, 0.88, 0.92, 0.96, 1]) {
      const r: V3[] = [];
      for (const s of [-1, 1]) { const n = H.N(u, 0.985, s), p = H.P(u, 0.985, s).addScaledVector(n, -T + 0.01); p.y -= 0.03; r.push(p); }
      Pb.push(r); Nb.push([UP, UP]);
    }
    bd.grid(Pb, Nb);
    pt.gb("wood", bd, "#caa27a", plainAO);
  }

  pt.mark("rowlocks");
  // ---- rowlocks (bronze forks) at the middle thwart, rope grommets at the others
  const capTop = (u: number, s: number) => { const n = H.N(u, 1, s); return H.P(u, 1, s).addScaledVector(n, -T / 2 + 0.006).add(V(0, 0.04, 0)); };
  {
    for (const s of [-1, 1]) {
      const c = capTop(thwarts[1] - 0.02, s);
      const fork = new THREE.TorusGeometry(0.05, 0.011, 5, 8, Math.PI);
      pt.add("metal", fork, TM(c.x, c.y + 0.055, c.z, 0, 0, Math.PI), "#8a6a3a");
      pt.add("metal", cylGeo(0.016, 0.016, 0.06, 6), TM(c.x, c.y + 0.01, c.z), "#8a6a3a");
      for (const u of [thwarts[0] - 0.04, thwarts[2] - 0.03]) {
        const q = capTop(u, s), n = H.N(u, 1, s);
        pt.add("rope", new THREE.TorusGeometry(0.06, 0.013, 4, 10), TM(q.x + n.x * 0.004, q.y - 0.005, q.z + n.z * 0.004, 0, Math.PI / 2, 0), "#d08a3a", (p, _nn, cc) => { if (p.y < q.y - 0.05) cc.multiplyScalar(0.7); });
      }
    }
  }

  pt.mark("oars");
  // ---- oars: one lying across the boat over the far gunwale, one stowed along the thwarts
  if (o.oars ?? true) {
    const oar = (a: V3, b: V3, len = 2.5) => {
      const dir = b.clone().sub(a).normalize(), m = alongM(a, dir, UP);
      const shaft = len * 0.66;
      pt.add("wood", grain(cylGeo(0.021, 0.021, 0.14, 8)), m.clone().multiply(TM(0, 0.07, 0)), "#9c7650");
      pt.add("wood", grain(cylGeo(0.027, 0.031, shaft - 0.14, 8)), m.clone().multiply(TM(0, 0.14 + (shaft - 0.14) / 2, 0)), "#f4dcb4");
      const blade = latheGeo([[0.0, 0], [0.03, 0.02], [0.06, 0.12], [0.075, 0.42], [0.066, 0.56], [0.035, 0.62], [0, 0.63]], 10);
      pt.add("wood", grain(blade), m.clone().multiply(TM(0, shaft - 0.08, 0, 0, 0, 0, 1, (len - shaft + 0.08) / 0.63, 0.24)), "#f4dcb4", (p, n, c) => c.multiplyScalar(n.y > 0.3 ? 1.08 : 0.9));
    };
    const s1 = rng() < 0.5 ? 1 : -1;
    // across: handle end on the sole near one side, loom over the opposite gunwale aft, blade out over the water
    const hA = V(H.P(thwarts[2], 0.5, 1).x, TY + 0.055, s1 * 0.3), gA = capTop(0.34, -s1).add(V(0, 0.03, 0));
    oar(hA, hA.clone().add(gA.clone().sub(hA).normalize().multiplyScalar(2.5)));
    // stowed: resting on the thwarts along the other side
    const hB = V(H.P(0.72, 0.5, 1).x, TY + 0.055, -s1 * 0.4), bB = V(H.P(0.28, 0.5, 1).x - 0.3, TY + 0.09, -s1 * 0.5);
    oar(hB, bB);
  }

  pt.mark("fenders");
  // ---- fenders over the sides (canvas cylinders, a bulb, a tyre) on rope over the cap
  {
    const kinds: Array<[string, string]> = [["bulb", "#27324a"], ["cyl", "#c2a47a"], ["cyl", "#555b62"], ["tyre", "#1f2124"], ["cyl", "#2b3448"]];
    const nF = o.fenders ?? 3;
    const slots: Array<[number, number]> = [[0.72, 1], [0.44, 1], [0.16, 1], [0.58, -1], [0.3, -1]];
    for (let i = 0; i < Math.min(nF, slots.length); i++) {
      const [u, s] = slots[i], [kind, c] = kinds[i];
      const yc = kind === "tyre" ? 0.2 : 0.16, r = kind === "tyre" ? 0.075 : 0.085;
      const h = H.hAt(u, yc), n = H.N(u, h, s);
      const centre = H.P(u, h, s).addScaledVector(n, lapAt(h) + r + 0.01);
      const top = H.P(u, 1, s), nt = H.N(u, 1, s);
      const ropeTop = top.clone().addScaledVector(nt, 0.045).add(V(0, 0.03, 0));
      const axis = ropeTop.clone().sub(centre).normalize().lerp(UP, 0.55).normalize();
      let attach = centre.clone().addScaledVector(axis, 0.16);
      if (kind === "cyl") {
        const g = latheGeo([[0, -0.16], [0.045, -0.155], [0.075, -0.13], [0.085, -0.09], [0.085, 0.09], [0.075, 0.13], [0.045, 0.155], [0, 0.16]], 12);
        pt.add(c === "#c2a47a" ? "fabric" : "plastic", g, alongM(centre, axis, n), c, (p, nn, cc) => { cc.multiplyScalar(0.8 + 0.3 * clamp01(nn.y + 0.5)); if (p.y < 0.02) cc.multiplyScalar(0.75); });
      } else if (kind === "bulb") {
        const g = new THREE.SphereGeometry(0.12, 10, 8); g.scale(1, 1.25, 1);
        pt.add("plastic", g, alongM(centre, axis, n), c, (p, nn, cc) => cc.multiplyScalar(0.85 + 0.25 * clamp01(nn.y)));
        attach = centre.clone().addScaledVector(axis, 0.15);
      } else {
        const g = new THREE.TorusGeometry(0.16, 0.065, 7, 14);
        const up = UP.clone().addScaledVector(n, -n.y).normalize();
        pt.add("fabric", g, new THREE.Matrix4().makeBasis(up.clone().cross(n).normalize(), up, n).setPosition(centre.clone().addScaledVector(n, -0.01)), c);
        attach = centre.clone().add(V(0, 0.2, 0));
      }
      const inside = top.clone().addScaledVector(nt, -T - 0.02).add(V(0, 0.035, 0));
      const over = top.clone().addScaledVector(nt, 0.01).add(V(0, 0.07, 0));
      pt.add("rope", tubeGeo([inside, over, ropeTop, attach], 0.011, 4, false, 10), null, ROPE);
    }
  }

  pt.mark("motor");
  // ---- motor
  if (o.motor ?? true) {
    const kind = o.motorKind ?? "longtail";
    const g = new GB(), m = new GB();
    if (kind === "longtail") {
      const u = 0.07, x = H.P(u, 1, 1).x, yb = H.ys(u) + 0.05, zw = H.hb(u) + 0.05;
      bar(g, V(x, yb, -zw), V(x, yb, zw), 0.3, 0.07, 0.015, V(1, 0, 0));                      // mount board
      pt.gb("woodDark", g, "#a88762", plainAO);
      const yaw = o.tailYaw ?? 0.18;
      const E = V(x - 0.05, yb + 0.05, 0);                                                        // pivot top
      pt.add("metal", cylGeo(0.05, 0.06, 0.1, 10), TM(E.x, E.y + 0.01, E.z), "#3a3d40");
      const base = TM(E.x, E.y, E.z, 0, yaw, 0);
      const eng = (lx: number, ly: number, lz: number) => V(lx, ly, lz).applyMatrix4(base);
      pt.add("metal", new RoundedBoxGeometry(0.44, 0.16, 0.3, 1, 0.03), base.clone().multiply(TM(-0.04, 0.12, 0)), "#34383c");
      const cowl = new RoundedBoxGeometry(0.52, 0.34, 0.38, 2, 0.07);
      pt.add("plastic", cowl, base.clone().multiply(TM(-0.04, 0.37, 0)), "#b8452f", (p, n, c) => {
        c.multiplyScalar(0.85 + 0.2 * clamp01(n.y));
        const r = Math.sin(p.x * 23 + p.z * 17) * Math.sin(p.y * 31 - p.z * 7);
        if (r > 0.55) c.lerp(col("#5a2e1c"), 0.55);
        if (p.y < E.y + 0.26) c.multiplyScalar(0.7);
      });
      bar(m, eng(-0.2, 0.56, -0.08), eng(-0.2, 0.56, 0.08), 0.03, 0.03, 0.008, V(1, 0, 0).applyAxisAngle(UP, yaw)); // lift handle
      // long tail: shaft aft and down into the water, coupling, prop
      const tilt = 0.36, dir = V(-Math.cos(tilt), -Math.sin(tilt), 0).applyAxisAngle(UP, yaw);
      const S = eng(-0.28, 0.1, 0), len = 2.9, Eend = S.clone().addScaledVector(dir, len);
      pt.add("plastic", cylGeo(0.027, 0.027, len, 8), alongM(S.clone().addScaledVector(dir, len / 2), dir), "#aeb3b3", (p, n, c) => { c.multiplyScalar(0.8 + 0.3 * clamp01(n.y)); if (p.y < 0.03) c.multiplyScalar(0.6); });
      pt.add("plastic", cylGeo(0.048, 0.048, 0.2, 8), alongM(S.clone().addScaledVector(dir, 0.22), dir), "#8a4a2c");
      pt.add("plastic", cylGeo(0.042, 0.042, 0.12, 8), alongM(S.clone().addScaledVector(dir, len - 0.35), dir), "#8a4a2c");
      pt.add("metal", cylGeo(0.042, 0.03, 0.14, 8), alongM(Eend, dir), "#6d7276");
      for (let b = 0; b < 3; b++) {
        const a = b * Math.PI * 2 / 3 + 0.4;
        const side = V(0, Math.cos(a), Math.sin(a)).applyAxisAngle(ZAX, -tilt).applyAxisAngle(UP, yaw);
        bar(m, Eend.clone().addScaledVector(side, 0.03), Eend.clone().addScaledVector(side, 0.17), 0.07, 0.012, 0.004, dir, side.clone().cross(dir));
      }
      // tiller: the shaft's forward extension, rubber grip
      const tdir = V(1, 0.12, 0).applyAxisAngle(UP, yaw).normalize(), T0 = eng(0.2, 0.2, 0);
      pt.add("plastic", cylGeo(0.022, 0.022, 0.5, 8), alongM(T0.clone().addScaledVector(tdir, 0.25), tdir), "#aeb3b3");
      pt.add("plastic", cylGeo(0.03, 0.03, 0.18, 8), alongM(T0.clone().addScaledVector(tdir, 0.46), tdir), "#1d1f22");
      pt.gb("metal", m, "#50555a");
    } else {
      const top = H.P(0, 1, 0), x = top.x - 0.12;
      bar(g, V(x + 0.06, top.y - 0.05, 0), V(x - 0.02, top.y + 0.08, 0), 0.16, 0.08, 0.01, ZAX);     // clamp bracket
      pt.gb("metal", g, "#3a3d40");
      pt.add("plastic", new RoundedBoxGeometry(0.34, 0.3, 0.28, 2, 0.07), TM(x - 0.1, top.y + 0.26, 0), "#2a2d31", (p, n, c) => c.multiplyScalar(0.8 + 0.3 * clamp01(n.y)));
      pt.add("plastic", new RoundedBoxGeometry(0.36, 0.05, 0.3, 1, 0.02), TM(x - 0.1, top.y + 0.12, 0), "#d9d4c8");
      bar(m, V(x - 0.12, top.y + 0.1, 0), V(x - 0.12, -0.24, 0), 0.07, 0.12, 0.02, ZAX, V(-1, 0, 0));
      bar(m, V(x - 0.01, -0.12, 0), V(x - 0.27, -0.12, 0), 0.16, 0.015, 0.005, ZAX);
      const pc = V(x - 0.2, -0.21, 0), dir = V(-1, 0, 0);
      pt.add("metal", cylGeo(0.035, 0.025, 0.12, 8), alongM(pc, dir), "#6d7276");
      for (let b = 0; b < 3; b++) { const a = b * Math.PI * 2 / 3 + 0.3, sd = V(0, Math.cos(a), Math.sin(a)); bar(m, pc.clone().addScaledVector(sd, 0.03), pc.clone().addScaledVector(sd, 0.13), 0.06, 0.01, 0.003, dir, sd.clone().cross(dir)); }
      pt.gb("metal", m, "#50555a");
      pt.add("metal", cylGeo(0.02, 0.02, 0.5, 6), alongM(V(x + 0.02, top.y + 0.3, 0), V(1, 0.1, 0.05)).multiply(TM(0, 0.25, 0)), "#3a3d40");
    }
  }

  pt.mark("cargo");
  // ---- cargo
  const cargo: LongboatCargo[] = o.cargo ?? (rng() < 0.5 ? ["crate", "sack", "rope", "lantern"] : ["barrel", "sack", "rope", "tub"]);
  const onFloor = (u: number) => H.P(u, H.hAt(u, FLOOR), 1).x;
  for (const c of cargo) {
    if (c === "barrel") {
      const x = onFloor(0.63), prof: Array<[number, number]> = [[0, 0], [0.24, 0], [0.25, 0.02], [0.25, 0.16], [0.265, 0.18], [0.25, 0.2], [0.26, 0.37], [0.275, 0.39], [0.26, 0.41], [0.25, 0.58], [0.265, 0.6], [0.25, 0.62], [0.25, 0.74], [0.23, 0.76], [0.2, 0.745], [0, 0.745]];
      const bx = x, bz = 0.12 * (rng() < 0.5 ? 1 : -1);
      pt.add("plastic", latheGeo(prof, 14), TM(bx, FLOOR, bz, 0, rng() * 6, 0), "#2aa69c", (p, n, c2) => {
        const y = p.y - FLOOR, hoop = [0.18, 0.39, 0.6].some((hy) => Math.abs(y - hy) < 0.025);
        if (hoop) c2.multiplyScalar(0.72);
        const a = Math.atan2(p.z - bz, p.x - bx), streak = Math.sin(a * 5 + 1.3) * Math.sin(a * 3);
        if (streak > 0.6 && y < 0.6) c2.lerp(col("#7a4a2a"), 0.35 * (streak - 0.6) / 0.4);
        if (n.y > 0.5) c2.multiplyScalar(1.1); if (y < 0.08) c2.multiplyScalar(0.75);
      });
    } else if (c === "crate") {
      const x = onFloor(0.4), g = new GB(), cw = 0.56, ch = 0.36, cd = 0.42, yaw = 0.25, z0 = -0.18;
      const R = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, FLOOR, z0), L = (a: number, b: number, cc: number) => V(a, b, cc).applyMatrix4(R);
      const ax = V(1, 0, 0).applyAxisAngle(UP, yaw), az = V(0, 0, 1).applyAxisAngle(UP, yaw);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(g, L(sx * (cw / 2 - 0.025), 0, sz * (cd / 2 - 0.025)), L(sx * (cw / 2 - 0.025), ch, sz * (cd / 2 - 0.025)), 0.05, 0.05, 0.008, ax, az);
      for (const sy of [0.09, 0.27]) {
        for (const sz of [-1, 1]) bar(g, L(-cw / 2 + 0.02, sy, sz * (cd / 2 - 0.012)), L(cw / 2 - 0.02, sy, sz * (cd / 2 - 0.012)), 0.018, 0.13, 0.005, az);
        for (const sx of [-1, 1]) bar(g, L(sx * (cw / 2 - 0.012), sy, -cd / 2 + 0.02), L(sx * (cw / 2 - 0.012), sy, cd / 2 - 0.02), 0.018, 0.13, 0.005, ax);
      }
      for (const sz of [-0.13, 0, 0.13]) bar(g, L(-cw / 2 + 0.01, ch - 0.012, sz), L(cw / 2 - 0.01, ch - 0.012, sz), 0.12, 0.022, 0.006, az);
      pt.gb("wood", g, "#f3dcb4", (p, n, cc) => { cc.multiplyScalar(0.75 + 0.3 * sstep(FLOOR, FLOOR + 0.36, p.y)); });
      pt.add("woodDark", new THREE.BoxGeometry(cw - 0.06, ch - 0.04, cd - 0.06), R.clone().multiply(TM(0, ch / 2, 0)), "#6b5238");
    } else if (c === "sack") {
      // a lathe along +y (bottom → gathered neck → tuft), laid on its side and slumped flat
      const g = latheGeo([[0, 0], [0.15, 0.02], [0.2, 0.1], [0.21, 0.26], [0.18, 0.4], [0.1, 0.5], [0.05, 0.54], [0.06, 0.6], [0.075, 0.66], [0, 0.68]], 10);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = 1 + 0.07 * Math.sin(y * 19 + x * 11) * Math.cos(z * 13);
        pos.setXYZ(i, x * k, y, z < 0 ? z * 0.55 : z * k * 1.1);   // flat underside
      }
      g.computeVertexNormals();
      const u = cargo.includes("barrel") ? 0.4 : 0.63, sz = cargo.includes("barrel") ? 0.22 : 0.2, x = onFloor(u);
      pt.add("fabric", g, TM(x - 0.3, FLOOR + 0.1, sz, 0, 0.35, -Math.PI / 2 + 0.12).multiply(TM(0, 0, 0, Math.PI / 2, 0, 0)), "#c9a878", (p, n, cc) => cc.multiplyScalar(0.7 + 0.38 * clamp01(n.y + 0.35)));
    } else if (c === "rope") {
      const onDeck = !cargo.includes("barrel"), x = onDeck ? H.xb(0) + 0.3 : onFloor(0.4), y0 = onDeck ? TY + 0.038 : FLOOR, z0 = onDeck ? 0.28 : -0.3;
      for (let i = 0; i < 3; i++) pt.add("rope", new THREE.TorusGeometry([0.17, 0.15, 0.16][i], 0.026, 5, 14), TM(x + i * 0.012, y0 + 0.026 + i * 0.045, z0 - i * 0.01, Math.PI / 2 + 0.05 * i, 0, 0), ROPE, (p, n, cc) => cc.multiplyScalar(0.8 + 0.25 * clamp01(n.y)));
      pt.add("rope", tubeGeo([V(x + 0.16, y0 + 0.12, z0), V(x + 0.3, y0 + 0.05, z0 + 0.1), V(x + 0.45, y0 + 0.02, z0 + 0.05)], 0.024, 5, false, 8), null, ROPE);
    } else if (c === "lantern") {
      const u = 0.05, x = H.P(u, 0.5, 1).x + 0.12, y = TY + 0.04, z = -0.3;
      pt.add("metal", cylGeo(0.075, 0.08, 0.04, 10), TM(x, y + 0.02, z), "#2b2f33");
      pt.add("glass", latheGeo([[0.05, 0], [0.068, 0.05], [0.07, 0.1], [0.055, 0.16], [0.035, 0.18]], 10), TM(x, y + 0.04, z), "#ffe2a0");
      pt.add("bulb", new THREE.SphereGeometry(0.022, 6, 5), TM(x, y + 0.1, z), "#fff2c0");
      pt.add("metal", cylGeo(0.03, 0.07, 0.06, 10), TM(x, y + 0.24, z), "#2b2f33");
      pt.add("metal", new THREE.TorusGeometry(0.07, 0.006, 4, 10, Math.PI), TM(x, y + 0.27, z), "#2b2f33");
      for (let i = 0; i < 3; i++) { const a = i * 2.09; pt.add("metal", cylGeo(0.005, 0.005, 0.18, 4), TM(x + Math.cos(a) * 0.075, y + 0.13, z + Math.sin(a) * 0.075), "#2b2f33"); }
    } else if (c === "tub") {
      // wooden bucket hung outboard on the gunwale
      const u = 0.6, s = cargo.includes("barrel") ? 1 : -1, h = H.hAt(u, 0.2), n = H.N(u, h, s);
      const cpos = H.P(u, h, s).addScaledVector(n, 0.26);
      const prof: Array<[number, number]> = [[0, 0], [0.2, 0], [0.24, 0.3], [0.2, 0.3], [0.17, 0.035], [0, 0.035]];
      const m = alongM(cpos, UP, n);
      pt.add("wood", latheGeo(prof, 14), m, "#d8b48a", (p, nn, cc) => { cc.multiplyScalar(0.75 + 0.3 * clamp01(nn.y + 0.4)); if (p.y < 0.05) cc.multiplyScalar(0.7); });
      for (const hy of [0.08, 0.24]) pt.add("metal", new THREE.TorusGeometry(0.2 + hy * 0.13, 0.009, 4, 16), m.clone().multiply(TM(0, hy, 0, Math.PI / 2, 0, 0)), "#3a3530");
      const top = H.P(u, 1, s);
      pt.add("rope", tubeGeo([top.clone().addScaledVector(n, -0.04).add(V(0, 0.04, 0)), top.clone().addScaledVector(n, 0.05).add(V(0, 0.05, 0)), cpos.clone().addScaledVector(n, 0.2).add(V(0, 0.3, 0))], 0.012, 4, false, 8), null, ROPE);
    }
  }

  pt.mark("ribbon");
  // ---- bow ribbon: wrap + knot round the post head, two long tails hanging in front of the stem
  if (o.ribbon ?? true) {
    const fwd = V(-postDir.y, postDir.x, 0).negate();      // out of the stem face
    const wc = postTop.clone().addScaledVector(postDir, -0.15), g = new GB();
    // the wrap: a fat cloth band round the squared post head
    const wp = [wc.clone().addScaledVector(postDir, -0.09), wc.clone().addScaledVector(postDir, 0.09)];
    const wf = frames(wp, () => ZAX, fwd.clone().negate());
    sweep(g, wp, wf.A, wf.B, bevelRect(0.2, 0.23, 0.06, 0, -0.045), { caps: true });
    const knot = wc.clone().addScaledVector(fwd, 0.1).addScaledVector(postDir, -0.02);
    for (const s of [-1, 1]) {
      const lobe = new THREE.SphereGeometry(0.075, 8, 6); lobe.scale(0.8, 0.65, 1.5);
      pt.add("fabric", lobe, TM(knot.x + 0.02, knot.y + 0.01, knot.z + s * 0.085, 0, 0, s * 0.45), "#e0402f", (p, n, c) => c.multiplyScalar(0.8 + 0.3 * clamp01(n.y)));
    }
    for (const [dz, len, sway] of [[-0.04, 1.05, 0.07], [0.045, 0.86, -0.06]] as Array<[number, number, number]>) {
      const path: V3[] = [], sA: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        path.push(knot.clone().add(V(0.06 * t + 0.025 * Math.sin(t * 6), -len * t, dz + sway * Math.sin(t * 3.1))));
        sA.push(i === 12 ? 0.15 : 1 - 0.15 * t);
      }
      const fr = frames(path, (i) => ZAX.clone().applyAxisAngle(UP, 0.45 * Math.sin(i * 0.6 + dz * 40)), fwd);
      sweep(g, path, fr.A, fr.B, bevelRect(0.12, 0.014, 0.005), { sA });
    }
    pt.gb("fabric", g, "#d6362b", (p, n, c) => { c.multiplyScalar(0.78 + 0.3 * clamp01(n.y + n.x * 0.5 + 0.3)); if (p.y < 0.1) c.multiplyScalar(0.8); });
  }

  pt.mark("eye");
  // ---- bow eye + mooring line
  {
    const eye = H.P(1, 0.5, 0), fwd = V(-postDir.y, postDir.x, 0).negate();
    eye.addScaledVector(fwd, 0.08);
    pt.add("metal", new THREE.TorusGeometry(0.035, 0.01, 5, 10), alongM(eye, UP, fwd), "#6f757a");
    const pts = o.moorTo
      ? (() => { const w = o.moorTo.clone().applyMatrix4(at.clone().invert()); const out: V3[] = []; for (let i = 0; i <= 10; i++) { const t = i / 10; out.push(eye.clone().lerp(w, t).add(V(0, -0.35 * 4 * t * (1 - t), 0))); } return out; })()
      : [eye.clone(), eye.clone().add(V(0.25, -0.12, 0.04)), eye.clone().add(V(0.55, -0.3, 0.12)), eye.clone().add(V(0.9, -0.55, 0.2))];
    pt.add("rope", tubeGeo(pts, 0.016, 5, false, pts.length * 2), null, ROPE, (p, n, c) => { if (p.y < 0.02) c.multiplyScalar(0.6); });
  }

  pt.mark("chips");
  // ---- paint chips: small bare-wood / primer flecks near the waterline, on ledges and at the stem
  {
    const cols = ["#b08a5e", "#e2d8c0", "#8a6a48"];
    const chips: Array<{ gb: GB; c: string }> = cols.map((c) => ({ gb: new GB(), c }));
    for (let i = 0; i < 24; i++) {
      const s = rng() < 0.5 ? 1 : -1, u = i < 8 ? 0.86 + rng() * 0.12 : 0.04 + rng() * 0.9;
      const hw = H.hAt(u, 0.02);
      const h = i % 4 === 0 ? edges[1 + Math.floor(rng() * (edges.length - 2))] + 0.012 : hw + rng() * 0.2;
      const n = H.N(u, h, s), c0 = H.P(u, h, s).addScaledVector(n, lapAt(h) + 0.004);
      const e1 = H.P(Math.min(1, u + 0.01), h, s).sub(H.P(Math.max(0, u - 0.01), h, s)).normalize(), e2 = n.clone().cross(e1).normalize();
      const k = chips[Math.floor(rng() * chips.length)].gb, r = 0.014 + rng() * 0.026;
      const ic = k.v(c0, n);
      const ring: number[] = [];
      for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2, rr = r * (0.6 + 0.6 * rng()); ring.push(k.v(c0.clone().addScaledVector(e1, Math.cos(a) * rr * 2.1).addScaledVector(e2, Math.sin(a) * rr), n)); }
      for (let j = 0; j < 6; j++) k.tri(ic, ring[j], ring[(j + 1) % 6]);
    }
    for (const ch of chips) pt.gb("plastic", ch.gb, ch.c, weather);
  }
  pt.mark("end");
  lastTris = pt.tris; lastStats = pt.stats;
}
/** triangle count of the most recent addLongboat call (dev stat) */
export let lastTris = 0;
/** triangles per part of the most recent addLongboat call (dev stat) */
export let lastStats: Record<string, number> = {};
