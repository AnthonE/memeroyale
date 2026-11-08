// Kong body parts — procedural, sculpted to the target art (char-03 hero, char-05 back, drop-05 glider, char-02 lobby):
//   chocolate fur laid as ORDERED overlapping shingle clumps (a row lattice per body surface, every clump conformed to
//   the surface it grows from: dark crevice at the root → lit rounded tip), cream face mask + huge grinning muzzle with
//   individual teeth, heavy dark fur brows, spiky crown tuft, gold hoops, cream pec/abs plate, banana-peel knuckle wraps
//   with splayed flaps, brick-red torn cargo shorts with a knotted rope drawstring, chunky yellow high-top sneakers,
//   small BANANA CO. pack.
// Every part is ONE indexed BufferGeometry in its BONE'S local space (kong-rig.ts rest skeleton), keyed by
// (bone, material) for instancing (kong.ts). Vertex colours carry the hand-painted values + AO baked in the rest pose
// (analytic sphere occluders — crevices between clumps, under the brow / chin / arms); small canvas maps add strands,
// weave, speckles, panels and stencils. Right limbs are built once and mirrored.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { base, canvas, grain, heightToNormal, rng, speckles, stencil, tex, type Rng } from "./paint";
import { BONES, type BoneName } from "./kong-rig";

export type MatKey = "fur" | "hair" | "skin" | "detail" | "gold" | "shorts" | "peel" | "sneaker" | "pack" | "rubber" | "min"
  /** the Blender-built kong (kong-asset.ts) */
  | "kbody" | "khead" | "kgear" | "kshoe" | "keye" | "kmin";
export interface PartGeo { bone: BoneName; mat: MatKey; geo: THREE.BufferGeometry }
export interface KongParts { parts: PartGeo[]; tris: number; petals: number }

type C3 = [number, number, number];
type P3 = [number, number, number];
const V3 = THREE.Vector3;
type V = THREE.Vector3;
const PI = Math.PI, TAU_ = Math.PI * 2;
const v3 = (p: P3) => new V3(p[0], p[1], p[2]);
const hexC = (h: string): C3 => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const mix = (a: C3, b: C3, t: number): C3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: C3, k: number | C3): C3 => (typeof k === "number" ? [a[0] * k, a[1] * k, a[2] * k] : [a[0] * k[0], a[1] * k[1], a[2] * k[2]]);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// part scales (built at design size, scaled about the bone joint): head, fists, sneakers
// (at 1x the head reads too big and buried in the shoulder mane, the fists as giant peach mitts → head 0.85x + raised and
// forward on the rig, fists 0.86x with cream knuckles)
const HS = 0.86, FS = 1.02, SS = 1.36;
/** the sneaker is scaled about the ankle joint: lift it so the sole stays on the ground (sole at -0.13 design, ankle 0.15 m up) */
const SS_LIFT = 0.13 * SS - 0.1495;
const scl = (p: P3, k: number): P3 => [p[0] * k, p[1] * k, p[2] * k];

// ------------------------------------------------------------------------------------------------ palette (linear)
const PAL = {
  crev: hexC("#2e170a"), furBase: hexC("#4a2a14"), furMid: hexC("#6b3f1f"), furTip: hexC("#8f5c31"), brow: hexC("#26130a"), browTop: hexC("#4a2a16"),
  skin: hexC("#ecc48e"), skinShade: hexC("#cf9960"), lip: hexC("#ad7447"), earIn: hexC("#c08552"), nose: hexC("#d19c68"),
  white: hexC("#fbf8f0"), mouth: hexC("#2a0c07"), mouthIn: hexC("#4a1810"), iris: hexC("#5c2e10"), irisRim: hexC("#241006"), pupil: hexC("#0c0503"), eyeWhite: hexC("#f6f0e2"),
  rope: hexC("#dcc79c"), sole: hexC("#e9d6ad"), soleDark: hexC("#c4b08a"), stripe: hexC("#7a4a22"), lace: hexC("#f7f2e6"), starC: hexC("#f8f3e6"),
  strap: hexC("#6b4520"), eyelet: hexC("#9a968c"), button: hexC("#3a2414"), nail: hexC("#f3d6aa"), knuckle: hexC("#f3dbb0"),
};
const furPal = (v: number): C3 => (v < 0.2 ? mix(PAL.crev, PAL.furBase, v / 0.2) : v < 0.58 ? mix(PAL.furBase, PAL.furMid, (v - 0.2) / 0.38) : mix(PAL.furMid, PAL.furTip, (v - 0.58) / 0.42));
// AO tints (colour multiplier at full occlusion): warm-dark fur crevices, SSS-like warm skin shade, neutral cloth
const AO_FUR: C3 = [0.34, 0.22, 0.15], AO_SKIN: C3 = [0.62, 0.34, 0.22], AO_CLOTH: C3 = [0.34, 0.26, 0.24], AO_NEUTRAL: C3 = [0.36, 0.32, 0.28];

// ------------------------------------------------------------------------------------------------ mesh builder
const _a = new V3(), _b = new V3(), _c = new V3();
interface GV { p: V; c: C3; u?: number; v?: number; hint?: V; k?: number }
type OutRef = V | ((p: V) => V);

/** indexed mesh accumulator (position / normal / uv / colour) */
class MB {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  /** fur slots: the alpha-strand clump accumulator (material "hair") the petals go into; the solid body stays on "fur" */
  hair?: MB;
  constructor(public aoTint: C3 = AO_NEUTRAL, public aoK = 1) {}
  get count() { return this.pos.length / 3; }
  vert(p: V, n: V, u: number, v: number, c: C3) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v); this.col.push(c[0], c[1], c[2]);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  /** parametric grid (nu+1)×(nv+1); normals by finite differences, oriented by `out`, optionally blended toward `hint` */
  grid(nu: number, nv: number, f: (i: number, j: number) => GV, o: { wrapU?: boolean; out?: OutRef } = {}) {
    const W = nu + 1, g: GV[] = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) g.push(f(i, j));
    const at = (i: number, j: number) => {
      if (o.wrapU) { if (i < 0) i += nu; else if (i > nu) i -= nu; } else i = i < 0 ? 0 : i > nu ? nu : i;
      j = j < 0 ? 0 : j > nv ? nv : j;
      return g[j * W + i].p;
    };
    const ns: V[] = [];
    let vote = 0;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      _a.subVectors(at(i + 1, j), at(i - 1, j)); _b.subVectors(at(i, j + 1), at(i, j - 1));
      const n = new V3().crossVectors(_a, _b);
      if (o.out) { const ref = typeof o.out === "function" ? o.out(g[j * W + i].p) : o.out; vote += Math.sign(n.dot(ref)); }
      ns.push(n);
    }
    const flip = vote < 0, base = this.count;
    for (let k = 0; k < g.length; k++) {
      const q = g[k], n = ns[k];
      if (flip) n.negate();
      const l = n.length();
      if (l < 1e-14) n.copy(q.hint ?? (o.out ? (typeof o.out === "function" ? o.out(q.p) : o.out) : _c.set(0, 1, 0))).normalize(); else n.divideScalar(l);
      if (q.hint && q.k) n.multiplyScalar(1 - q.k).addScaledVector(q.hint, q.k).normalize();
      this.vert(q.p, n, q.u ?? 0, q.v ?? 0, q.c);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (!flip) { this.tri(a, b, d); this.tri(a, d, c); } else { this.tri(a, d, b); this.tri(a, c, d); }
    }
  }
  /** import a three geometry (transformed); colour = constant or fn(p, n); uv scaled */
  geo(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, c: C3 | ((p: V, n: V) => C3), uvS: [number, number] = [1, 1], uvFn?: (p: V, n: V, u: number, v: number) => [number, number]) {
    const G = m ? g.clone().applyMatrix4(m) : g;
    if (!G.attributes.normal) G.computeVertexNormals();
    const flip = m ? m.determinant() < 0 : false;
    const P = G.attributes.position, N = G.attributes.normal, T = G.attributes.uv;
    const base = this.count, p = new V3(), n = new V3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P as THREE.BufferAttribute, i); n.fromBufferAttribute(N as THREE.BufferAttribute, i).normalize();
      let u = T ? T.getX(i) * uvS[0] : 0, v = T ? T.getY(i) * uvS[1] : 0;
      if (uvFn) [u, v] = uvFn(p, n, u, v);
      this.vert(p, n, u, v, typeof c === "function" ? c(p, n) : c);
    }
    const ix = G.index ? G.index.array : null, cnt = ix ? ix.length : P.count;
    for (let t = 0; t < cnt; t += 3) {
      const a = base + (ix ? ix[t] : t), b = base + (ix ? ix[t + 1] : t + 1), d = base + (ix ? ix[t + 2] : t + 2);
      if (flip) this.tri(a, d, b); else this.tri(a, b, d);
    }
    if (m) G.dispose();
    g.dispose();
  }
  mirrored() {
    const o = new MB(this.aoTint, this.aoK);
    o.pos = this.pos.map((x, i) => (i % 3 === 0 ? -x : x)); o.nor = this.nor.map((x, i) => (i % 3 === 0 ? -x : x));
    o.uv = this.uv.slice(); o.col = this.col.slice();
    for (let t = 0; t < this.idx.length; t += 3) o.idx.push(this.idx[t], this.idx[t + 2], this.idx[t + 1]);
    return o;
  }
  get tris() { return this.idx.length / 3; }
  flatUV(from = 0, to = this.count, u = 0.75, v = 0.5) { for (let i = from; i < to; i++) { this.uv[i * 2] = u; this.uv[i * 2 + 1] = v; } }
  scale(k: number) { for (let i = 0; i < this.pos.length; i++) this.pos[i] *= k; return this; }
  lift(dy: number) { for (let i = 1; i < this.pos.length; i += 3) this.pos[i] += dy; return this; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
const TRS = (p: P3, e: P3 = [0, 0, 0], s: P3 = [1, 1, 1]) => new THREE.Matrix4().compose(v3(p), new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2])), v3(s));
/** basis matrix: local x/y/z → given axes, at p, scaled */
const BASIS = (p: V, x: V, y: V, z: V, s: P3 = [1, 1, 1]) => new THREE.Matrix4().makeBasis(x.clone().multiplyScalar(s[0]), y.clone().multiplyScalar(s[1]), z.clone().multiplyScalar(s[2])).setPosition(p);
/** frame with z along `n`, y as close to `up` as possible */
function frameZ(n: V, up: V = new V3(0, 1, 0)) {
  const z = n.clone().normalize();
  let x = new V3().crossVectors(up, z); if (x.lengthSq() < 1e-6) x = new V3().crossVectors(new V3(1, 0, 0), z);
  x.normalize(); const y = new V3().crossVectors(z, x).normalize();
  return { x, y, z };
}

// ------------------------------------------------------------------------------------------------ surfaces
interface Hit { p: V; n: V }
const hit = (): Hit => ({ p: new V3(), n: new V3() });
interface Surf { proj(q: V, h: Hit): Hit }
class Ell implements Surf {
  constructor(public c: V, public r: V) {}
  proj(q: V, h: Hit) {
    const x = (q.x - this.c.x) / this.r.x, y = (q.y - this.c.y) / this.r.y, z = (q.z - this.c.z) / this.r.z;
    let l = Math.hypot(x, y, z); if (l < 1e-9) l = 1;
    h.p.set(this.c.x + (x / l) * this.r.x, this.c.y + (y / l) * this.r.y, this.c.z + (z / l) * this.r.z);
    h.n.set(x / l / this.r.x, y / l / this.r.y, z / l / this.r.z).normalize();
    return h;
  }
  dir(d: V, h: Hit) { return this.proj(_c.copy(this.c).add(d), h); }
}
/** sphere-swept tapered capsule a→b with radius ra→rb (+ a mid bulge); arc-length param from the A pole */
class Cap implements Surf {
  ax: V; len: number; b1: V; b2: V;
  private d = new V3(); private ct = new V3(); private rd = new V3(); private q = new V3(); private pp = new V3();
  constructor(public a: V, public b: V, public ra: number, public rb: number, public bulge = 0, public bulgeAt = 0.45) {
    this.ax = b.clone().sub(a); this.len = this.ax.length(); this.ax.normalize();
    this.b1 = new V3().crossVectors(this.ax, Math.abs(this.ax.z) < 0.9 ? new V3(0, 0, 1) : new V3(1, 0, 0)).normalize();
    this.b2 = new V3().crossVectors(this.ax, this.b1).normalize();
  }
  rad(t: number) { const k = clamp(t); return this.ra + (this.rb - this.ra) * k + this.bulge * Math.pow(Math.sin(PI * Math.pow(k, Math.log(0.5) / Math.log(this.bulgeAt))), 1.2); }
  proj(q: V, h: Hit) {
    const t = clamp(this.d.subVectors(q, this.a).dot(this.ax) / this.len);
    this.ct.copy(this.a).addScaledVector(this.ax, t * this.len);
    this.rd.subVectors(q, this.ct); let l = this.rd.length(); if (l < 1e-9) { this.rd.copy(this.b1); l = 1; }
    this.rd.divideScalar(l);
    h.p.copy(this.ct).addScaledVector(this.rd, this.rad(t));
    if (t > 0.001 && t < 0.999) { const dr = (this.rad(t + 0.01) - this.rad(t - 0.01)) / (0.02 * this.len); h.n.copy(this.rd).addScaledVector(this.ax, -dr).normalize(); } else h.n.copy(this.rd);
    return h;
  }
  get capA() { return this.ra * PI / 2; }
  get total() { return this.capA + this.len + this.rb * PI / 2; }
  at(s: number, phi: number, h: Hit) {
    this.pp.copy(this.b1).multiplyScalar(Math.cos(phi)).addScaledVector(this.b2, Math.sin(phi));
    const cA = this.capA;
    if (s < cA) { const al = Math.max(0.02, s / this.ra); this.q.copy(this.a).addScaledVector(this.ax, -this.ra * Math.cos(al)).addScaledVector(this.pp, this.ra * Math.sin(al)); }
    else if (s < cA + this.len) { const d = s - cA; this.q.copy(this.a).addScaledVector(this.ax, d).addScaledVector(this.pp, this.rad(d / this.len)); }
    else { const be = Math.min(PI / 2 - 0.02, (s - cA - this.len) / this.rb); this.q.copy(this.b).addScaledVector(this.ax, this.rb * Math.sin(be)).addScaledVector(this.pp, this.rb * Math.cos(be)); }
    return this.proj(this.q, h);
  }
  axisDist(p: V) { const t = clamp(this.d.subVectors(p, this.a).dot(this.ax) / this.len); return p.distanceTo(this.ct.copy(this.a).addScaledVector(this.ax, t * this.len)); }
}

// ------------------------------------------------------------------------------------------------ fur lattice + clumps
interface Root { p: V; n: V; f: V; k: number }
/** rows along the capsule (arc length s0→s1 from the A pole), alternating half-offset columns around */
function capRoots(S: Cap, row: number, col: number, s0: number, s1: number, rnd: Rng, keep?: (p: V, n: V) => boolean, phase = 0): Root[] {
  const out: Root[] = [], h = hit(), h2 = hit(), nR = Math.max(1, Math.round((s1 - s0) / row));
  for (let i = 0; i < nR; i++) {
    const s = s0 + ((i + 0.5) * (s1 - s0)) / nR;
    S.at(s, 0, h);
    const nC = Math.max(4, Math.round((2 * PI * S.axisDist(h.p)) / col));
    for (let j = 0; j < nC; j++) {
      const phi = phase + ((j + (i % 2) * 0.5 + (rnd() - 0.5) * 0.28) / nC) * 2 * PI;
      const sj = s + (rnd() - 0.5) * row * 0.3;
      S.at(sj, phi, h); S.at(sj + 0.012, phi, h2);
      if (keep && !keep(h.p, h.n)) continue;
      const f = h2.p.clone().sub(h.p); f.addScaledVector(h.n, -f.dot(h.n)).normalize();
      out.push({ p: h.p.clone(), n: h.n.clone(), f, k: 1 });
    }
  }
  return out;
}
/** rows = latitude bands around `pole` (θ0→θ1), alternating offsets; flow = away from the pole */
function ellRoots(S: Ell, pole: V, row: number, col: number, th0: number, th1: number, rnd: Rng, keep?: (p: V, n: V) => boolean, phase = 0): Root[] {
  const out: Root[] = [], h = hit(), h2 = hit(), P = pole.clone().normalize();
  const B1 = new V3().crossVectors(P, Math.abs(P.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize(), B2 = new V3().crossVectors(P, B1);
  const R = (S.r.x + S.r.y + S.r.z) / 3, nR = Math.max(1, Math.round(((th1 - th0) * R) / row));
  const dir = (th: number, ph: number, o: V) => o.copy(P).multiplyScalar(Math.cos(th)).addScaledVector(B1, Math.sin(th) * Math.cos(ph)).addScaledVector(B2, Math.sin(th) * Math.sin(ph));
  const d = new V3();
  for (let i = 0; i < nR; i++) {
    const th = th0 + ((i + 0.5) * (th1 - th0)) / nR, nC = Math.max(3, Math.round((2 * PI * Math.sin(th) * R) / col));
    for (let j = 0; j < nC; j++) {
      const ph = phase + ((j + (i % 2) * 0.5 + (rnd() - 0.5) * 0.28) / nC) * 2 * PI;
      const tj = th + (rnd() - 0.5) * 0.3 * ((th1 - th0) / nR);
      S.dir(dir(tj, ph, d), h); S.dir(dir(tj + 0.02, ph, d), h2);
      if (keep && !keep(h.p, h.n)) continue;
      const f = h2.p.clone().sub(h.p); f.addScaledVector(h.n, -f.dot(h.n)).normalize();
      out.push({ p: h.p.clone(), n: h.n.clone(), f, k: 1 });
    }
  }
  return out;
}
interface PetalSpec { L: number; W: number; T: number; lift: number; nu: number; nv: number; bottom: boolean; pal: (v: number) => C3; elev?: number; narrow?: number; split?: number; smooth?: number }
let PETALS = 0;
/** one sculpted clump: flat rounded petal laid on the surface along the flow, root buried, tip lifted */
function petal(mb: MB, S: Surf, rt: Root, o: PetalSpec, tint: C3) {
  PETALS++;
  const side = new V3().crossVectors(rt.n, rt.f).normalize();
  const L = o.L * rt.k, W = o.W * rt.k, T = o.T * rt.k, lift = o.lift * rt.k;
  const h = hit(), q = new V3();
  const wexp = o.narrow ?? 0.55;
  // split tips (flat single-point petals read as a pinecone / artichoke): a blunt tip cut into two strand
  // prongs — the columns at u = ±0.5 run full length, the centre and the edges are shorter
  const split = o.split ?? 0;
  const wp = split ? (v: number) => Math.pow(Math.max(0, Math.sin(PI * (0.13 + 0.7 * v))), wexp) : (v: number) => Math.pow(Math.max(0, Math.sin(PI * (0.13 + 0.87 * v))), wexp);
  const lenK = (u: number) => (split ? 1 - split * (0.5 + 0.5 * Math.cos(2 * PI * u)) : 1);
  const th = (u: number, v: number) => T * Math.sqrt(Math.max(0, 1 - u * u)) * (0.6 + 0.4 * v) * (1 - Math.pow(v, 4));
  const lf = (v: number) => -0.5 * T + lift * Math.pow(v, 1.6);
  // elevated (spike) clumps are rigid in the root frame (crown tuft); the rest conform to the body surface
  const el = o.elev ?? 0, dirE = rt.f.clone().multiplyScalar(Math.cos(el)).addScaledVector(rt.n, Math.sin(el)), nE = rt.n.clone().multiplyScalar(Math.cos(el)).addScaledVector(rt.f, -Math.sin(el));
  const at = (u: number, v: number, top: boolean): Hit => {
    const hh = lf(v) + (top ? th(u, v) : -0.3 * th(u, v));
    if (el) {
      const r = hit(); r.p.copy(rt.p).addScaledVector(dirE, v * L * lenK(u)).addScaledVector(side, u * W * 0.5 * wp(v)).addScaledVector(nE, hh - 0.012 * v * v); r.n.copy(nE); return r;
    }
    q.copy(rt.p).addScaledVector(rt.f, v * L * lenK(u)).addScaledVector(side, u * W * 0.5 * wp(v));
    S.proj(q, h);
    return { p: h.p.clone().addScaledVector(h.n, hh), n: h.n.clone() };
  };
  mb.grid(o.nu, o.nv, (i, j) => {
    const u = -1 + (2 * i) / o.nu, v = j / o.nv, r = at(u, v, true);
    const edge = 1 - 0.16 * Math.pow(Math.abs(u), 2.2);
    return { p: r.p, c: mul(o.pal(v), mul(tint, edge)), u: 0.5 + 0.5 * u, v, hint: r.n, k: o.smooth ?? 0.42 };
  }, { out: rt.n });
  if (o.bottom) {
    const nb = rt.n.clone().negate();
    mb.grid(1, o.nv, (i, j) => { const u = -1 + 2 * i, v = j / o.nv, r = at(u, v, false); return { p: r.p, c: mul(PAL.crev, 0.8), u: 0.5 + 0.5 * u, v, hint: nb, k: 0.3 }; }, { out: nb });
  }
}

// ------------------------------------------------------------------------------------------------ rest skeleton + volumes
const REST = {} as Record<BoneName, V>;
{
  const get = (b: BoneName): V => REST[b] ?? (REST[b] = (BONES[b].parent ? get(BONES[b].parent!).clone() : new V3()).add(v3(BONES[b].offset)));
  for (const b of Object.keys(BONES) as BoneName[]) get(b);
}
interface Vol { id: string; bone: BoneName; c?: V; r?: V; a?: V; b?: V; ra?: number; rb?: number; cyl?: boolean }
const VOLS: Vol[] = [];
const OCC: Array<{ c: V; r: number }> = [];
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3();
function volDist(v: Vol, p: V) {
  if (v.c) return Math.hypot((p.x - v.c.x) / v.r!.x, (p.y - v.c.y) / v.r!.y, (p.z - v.c.z) / v.r!.z);
  const ab = _v1.subVectors(v.b!, v.a!), l2 = ab.lengthSq();
  let t = _v2.subVectors(p, v.a!).dot(ab) / l2;
  if (v.cyl && (t < 0 || t > 1)) return 9;
  t = clamp(t);
  return p.distanceTo(_v3.copy(v.a!).addScaledVector(ab, t)) / (v.ra! + (v.rb! - v.ra!) * t);
}
/** register a volume (bone-local); R-bone volumes are mirrored to L; each also becomes AO occluder spheres */
function vol(id: string, bone: BoneName, shape: { c: P3; r: P3 } | { a: P3; b: P3; ra: number; rb: number; cyl?: boolean }, occ = 1) {
  const sides: Array<[string, BoneName, number]> = [[id, bone, 1]];
  if (bone.endsWith("R")) sides.push([id + "L", bone.replace(/R$/, "L") as BoneName, -1]);
  for (const [vid, b, sx] of sides) {
    const o = REST[b], m = (p: P3) => new V3(p[0] * sx, p[1], p[2]).add(o);
    if ("c" in shape) {
      const v: Vol = { id: vid, bone: b, c: m(shape.c), r: v3(shape.r) }; VOLS.push(v);
      if (occ) OCC.push({ c: v.c!, r: ((shape.r[0] + shape.r[1] + shape.r[2]) / 3) * 0.92 * occ });
    } else {
      const v: Vol = { id: vid, bone: b, a: m(shape.a), b: m(shape.b), ra: shape.ra, rb: shape.rb, cyl: shape.cyl }; VOLS.push(v);
      if (occ) for (const t of [0.12, 0.5, 0.88]) OCC.push({ c: v.a!.clone().lerp(v.b!, t), r: lerp(shape.ra, shape.rb, t) * 0.9 * occ });
    }
  }
}
function occ(bone: BoneName, c: P3, r: number) {
  OCC.push({ c: v3(c).add(REST[bone]), r });
  if (bone.endsWith("R")) OCC.push({ c: new V3(-c[0], c[1], c[2]).add(REST[bone.replace(/R$/, "L") as BoneName]), r });
  else if (c[0] !== 0) OCC.push({ c: new V3(-c[0], c[1], c[2]).add(REST[bone]), r });
}
/** petal-root filter: drop clumps buried inside another body volume (rest pose) */
function culler(bone: BoneName, own: string[]) {
  const o = REST[bone], w = new V3();
  return (p: V) => {
    w.copy(p).add(o);
    for (const v of VOLS) {
      if (own.includes(v.id)) continue;
      if (volDist(v, w) < (v.bone === bone ? 0.95 : 0.84)) return false;
    }
    return true;
  };
}
function bakeAO(mb: MB, bone: BoneName) {
  const o = REST[bone], p = new V3(), n = new V3(), d = new V3(), t = mb.aoTint;
  for (let i = 0; i < mb.count; i++) {
    p.set(mb.pos[i * 3] + o.x, mb.pos[i * 3 + 1] + o.y, mb.pos[i * 3 + 2] + o.z); n.set(mb.nor[i * 3], mb.nor[i * 3 + 1], mb.nor[i * 3 + 2]);
    let vis = 1;
    for (const s of OCC) {
      d.subVectors(s.c, p); const l2 = d.lengthSq(); if (l2 < 1e-8) continue;
      const l = Math.sqrt(l2), cs = n.dot(d) / l; if (cs <= 0) continue;
      vis *= 1 - cs * Math.min(1, (s.r * s.r) / l2) * 0.8 * mb.aoK;
    }
    vis *= 0.86 + 0.14 * (0.5 + 0.5 * n.y);
    vis = Math.max(0.22, vis);
    for (let k = 0; k < 3; k++) mb.col[i * 3 + k] *= vis + (1 - vis) * t[k];
  }
}

// ------------------------------------------------------------------------------------------------ shape table
// bone-local shapes (metres). Rest pose: feet at y=0, facing -Z, +X = the kong's right.
const HEAD = {
  skull: { c: [0, 0.21, 0.01] as P3, r: [0.205, 0.215, 0.205] as P3 },
  // broad muzzle: the grin spans almost its full width
  muzzle: { c: [0, 0.102, -0.182] as P3, r: [0.222, 0.148, 0.162] as P3 },
  chin: { c: [0, 0.03, -0.2] as P3, r: [0.15, 0.072, 0.108] as P3 },
  mask: { c: [0.074, 0.262, -0.128] as P3, r: [0.1, 0.088, 0.086] as P3 },
  // (eye whites +12 %: the target art's eyes are big round whites under the brow, the iris keeps its size)
  eye: { c: [0.072, 0.259, -0.178] as P3, r: [0.064, 0.069, 0.053] as P3 },
  ear: [0.206, 0.232, 0.0] as P3,
};
const CHEST = {
  mass: { c: [0, 0.12, 0.05] as P3, r: [0.40, 0.31, 0.29] as P3 },
  trap: { c: [0, 0.31, 0.11] as P3, r: [0.31, 0.175, 0.2] as P3 },
  plate: { c: [0, 0.12, -0.105] as P3, r: [0.37, 0.265, 0.195] as P3 },
  pec: { c: [0.158, 0.172, -0.232] as P3, r: [0.195, 0.132, 0.092] as P3 },
  throat: { c: [0, 0.305, -0.155] as P3, r: [0.14, 0.10, 0.10] as P3 },
};
const SPINE = { fur: { c: [0, 0.06, 0.05] as P3, r: [0.35, 0.22, 0.26] as P3 }, belly: { c: [0, 0.07, -0.12] as P3, r: [0.285, 0.22, 0.162] as P3 } };
const ARM = { ra: 0.195, rb: 0.14, bulge: 0.014 };
const FORE = { ra: 0.135, rb: 0.142 };
const THIGH = { ra: 0.19, rb: 0.15 };
const CALF = { ra: 0.15, rb: 0.1, bulge: 0.03, end: [0, -0.25, 0.012] as P3 };
const SHORT_LEG = { top: 0.06, hem: 0.37, r: 0.212 };

const sv = (s: { c: P3; r: P3 }, k: number) => ({ c: scl(s.c, k), r: scl(s.r, k) });
vol("skull", "head", sv(HEAD.skull, HS)); vol("muzzle", "head", sv(HEAD.muzzle, HS)); vol("chin", "head", sv(HEAD.chin, HS), 0.7);
vol("mass", "chest", CHEST.mass); vol("trap", "chest", CHEST.trap); vol("plate", "chest", CHEST.plate, 0.6); vol("pecR", "chest", CHEST.pec, 0.5);
vol("pecL", "chest", { c: [-CHEST.pec.c[0], CHEST.pec.c[1], CHEST.pec.c[2]], r: CHEST.pec.r }, 0.5); vol("throat", "chest", CHEST.throat, 0.5);
vol("spine", "spine", SPINE.fur); vol("belly", "spine", SPINE.belly, 0.6);
vol("pelvis", "hips", { c: [0, -0.04, 0.01], r: [0.36, 0.2, 0.29] });
vol("arm", "shoulderR", { a: [0.02, 0, 0], b: BONES.elbowR.offset, ra: ARM.ra, rb: ARM.rb });
vol("fore", "elbowR", { a: [0, 0, 0], b: BONES.wristR.offset, ra: FORE.ra, rb: FORE.rb + 0.02 });
vol("fist", "wristR", sv({ c: [0, -0.1, -0.02], r: [0.105, 0.1, 0.105] }, FS));
vol("thigh", "hipR", { a: [0, 0, 0], b: BONES.kneeR.offset, ra: THIGH.ra, rb: THIGH.rb });
vol("legtube", "hipR", { a: [0.012, SHORT_LEG.top, 0], b: [0.012 + 0.057 * SHORT_LEG.hem, -SHORT_LEG.hem, -0.057 * SHORT_LEG.hem], ra: SHORT_LEG.r + 0.005, rb: SHORT_LEG.r, cyl: true }, 0.6);
vol("calf", "kneeR", { a: [0, 0, 0], b: CALF.end, ra: CALF.ra, rb: CALF.rb });
vol("shoe", "ankleR", { c: [0, -0.02 * SS + SS_LIFT, -0.07 * SS], r: [0.1 * SS, 0.14 * SS, 0.22 * SS] });
vol("pack", "chest", { c: [0, 0.03, 0.39], r: [0.16, 0.18, 0.08] }, 0.6);
// extra AO: brows over the eyes, nose over the lip, cheeks, ears, fingers
occ("head", scl([0.075, 0.30, -0.23], HS), 0.035 * HS); occ("head", scl([0.02, 0.27, -0.23], HS), 0.03 * HS); occ("head", scl([0, 0.205, -0.272], HS), 0.035 * HS);
occ("head", scl([0.2, 0.232, 0.0], HS), 0.045 * HS); occ("wristR", scl([0, -0.14, -0.06], FS), 0.06 * FS);

// ------------------------------------------------------------------------------------------------ build helpers
interface Q { hi: boolean; seg: number; ps: number; nu: number; nv: number; bottom: boolean }
const QHI: Q = { hi: true, seg: 18, ps: 1, nu: 4, nv: 4, bottom: true };
const QLO: Q = { hi: false, seg: 8, ps: 1.9, nu: 2, nv: 2, bottom: false };
interface FurSpec { L: number; W: number; T: number; lift: number }
function furClumps(body: MB, S: Surf, roots: Root[], sp: FurSpec, q: Q, rnd: Rng, extra: Partial<PetalSpec> = {}) {
  const mb = body.hair ?? body;
  // varied, flame-tipped clumps (not a uniform scale lattice): size 0.78–1.2, flow jitter ±16°, value jitter, and ~14 %
  // longer lifted TUFTS that break the silhouette
  for (const rt of roots) {
    rt.k *= 0.78 + rnd() * 0.42;
    rt.f.applyAxisAngle(rt.n, (rnd() - 0.5) * 0.55);
    const tuft = rnd() < (q.hi ? 0.14 : 0.1), hue = (rnd() - 0.5) * 0.1, val = 0.86 + rnd() * 0.26;
    petal(mb, S, rt, {
      L: sp.L * q.ps * (tuft ? 1.3 : 1) * 1.18, W: sp.W * q.ps * (tuft ? 0.92 : 1) * 1.1, T: sp.T * (q.hi ? 1 : 1.2), lift: sp.lift * (q.hi ? 1 : 1.3) * (tuft ? 2.3 : 0.8 + rnd() * 0.45),
      nu: q.nu, nv: q.nv, bottom: q.bottom, pal: furPal, narrow: 0.42 + rnd() * 0.22, split: q.hi && !tuft ? 0.06 + rnd() * 0.06 : 0,
      // so the lo tier isn't faceted fur, the 2×2-segment lo petals take the BODY's smooth normal (a soft fur mass
      // shaded like the hi sculpt at crowd distances) — the petal outline + vertex colour carry the clump detail
      smooth: q.hi ? 0.42 : 0.82, ...extra,
    }, [val * (1 + hue), val, val * (1 - hue)]);
  }
}
const spacing = (sp: FurSpec, q: Q) => ({ row: sp.L * 0.56 * q.ps, col: sp.W * 0.72 * q.ps });
function ellMesh(mb: MB, c: P3, r: P3, seg: number, colr: C3 | ((p: V, n: V) => C3), e: P3 = [0, 0, 0], uvS: [number, number] = [1, 1], box = 1) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
  if (box !== 1) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setXYZ(i, Math.sign(P.getX(i)) * Math.pow(Math.abs(P.getX(i)), box), Math.sign(P.getY(i)) * Math.pow(Math.abs(P.getY(i)), box), Math.sign(P.getZ(i)) * Math.pow(Math.abs(P.getZ(i)), box)); g.computeVertexNormals(); }
  mb.geo(g, TRS(c, e, r), colr, uvS);
}
function capMesh(mb: MB, S: Cap, seg: number, rings: number, colr: C3, uvS: [number, number] = [6, 6]) {
  const h = hit(), T = S.total;
  mb.grid(seg, rings, (i, j) => { S.at((j / rings) * T, (i / seg) * 2 * PI, h); return { p: h.p.clone(), c: colr, u: (i / seg) * uvS[0], v: (j / rings) * uvS[1], hint: h.n.clone(), k: 0.6 }; }, { wrapU: true, out: (p) => S.proj(p, hit()).n });
}
/** swept tube through pts with radius fn; section can be flattened (sx across `up`-side, sy along up) and squarish (pw) */
function tube(mb: MB, pts: V[], rad: (t: number) => number, segs: number, colr: C3 | ((t: number, a: number) => C3), o: { up?: V | ((t: number) => V); sx?: number; sy?: number; pw?: number; uv?: (t: number, a: number) => [number, number]; caps?: boolean } = {}) {
  const n = pts.length, sx = o.sx ?? 1, sy = o.sy ?? 1, pw = o.pw ?? 2;
  const frames = pts.map((p, k) => {
    const t = pts[Math.min(n - 1, k + 1)].clone().sub(pts[Math.max(0, k - 1)]).normalize();
    const upv = typeof o.up === "function" ? o.up(k / (n - 1)) : o.up ?? new V3(0, 1, 0);
    let b = new V3().crossVectors(t, upv); if (b.lengthSq() < 1e-8) b = new V3().crossVectors(t, new V3(1, 0, 0));
    b.normalize(); const nn = new V3().crossVectors(b, t).normalize();
    return { t, n: nn, b };
  });
  const ex = 2 / pw;
  mb.grid(segs, n - 1, (i, j) => {
    const a = (i / segs) * 2 * PI, ca = Math.cos(a), sa = Math.sin(a);
    const cx = Math.sign(ca) * Math.pow(Math.abs(ca), ex), cy = Math.sign(sa) * Math.pow(Math.abs(sa), ex);
    const f = frames[j], r = rad(j / (n - 1));
    const p = pts[j].clone().addScaledVector(f.n, cy * r * sy).addScaledVector(f.b, cx * r * sx);
    const uv = o.uv ? o.uv(j / (n - 1), i / segs) : [i / segs, j / (n - 1)];
    return { p, c: typeof colr === "function" ? colr(j / (n - 1), i / segs) : colr, u: uv[0], v: uv[1] };
  }, { wrapU: true, out: (p) => { let best = 0, bd = 1e9; for (let k = 0; k < n; k++) { const d = pts[k].distanceToSquared(p); if (d < bd) { bd = d; best = k; } } return p.clone().sub(pts[best]); } });
  if (o.caps) for (const k of [0, n - 1]) { const r = rad(k / (n - 1)); ellMesh(mb, [pts[k].x, pts[k].y, pts[k].z], [r * Math.min(sx, sy), r * Math.min(sx, sy), r * Math.min(sx, sy)], 8, typeof colr === "function" ? colr(k / (n - 1), 0) : colr); }
}
const catmull = (ctrl: V[], n: number) => new THREE.CatmullRomCurve3(ctrl, false, "centripetal").getPoints(n);
/** tiny stitch dashes along a polyline lying on a surface (normals given per point) */
function dashes(mb: MB, pts: V[], nrm: V[], colr: C3, dash = 0.012, gap = 0.008, w = 0.0035, lift = 0.0018) {
  let acc = 0, on = true;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], seg = a.distanceTo(b); let s = 0;
    while (s < seg) {
      const lim = (on ? dash : gap) - acc, step = Math.min(lim, seg - s);
      if (on) {
        const p0 = a.clone().lerp(b, s / seg), p1 = a.clone().lerp(b, (s + step) / seg), nn = nrm[k].clone().lerp(nrm[k + 1], s / seg).normalize();
        const t = p1.clone().sub(p0).normalize(), side = new V3().crossVectors(nn, t).normalize().multiplyScalar(w / 2);
        const q0 = p0.clone().addScaledVector(nn, lift), q1 = p1.clone().addScaledVector(nn, lift);
        const i0 = mb.vert(q0.clone().sub(side), nn, 0.5, 0.5, colr), i1 = mb.vert(q0.clone().add(side), nn, 0.5, 0.5, colr), i2 = mb.vert(q1.clone().add(side), nn, 0.5, 0.5, colr), i3 = mb.vert(q1.clone().sub(side), nn, 0.5, 0.5, colr);
        // winding so the dash faces along nn
        const fn = new V3().crossVectors(q0.clone().add(side).sub(q0.clone().sub(side)), q1.clone().add(side).sub(q0.clone().sub(side)));
        if (fn.dot(nn) >= 0) { mb.tri(i0, i1, i2); mb.tri(i0, i2, i3); } else { mb.tri(i0, i2, i1); mb.tri(i0, i3, i2); }
      }
      s += step; acc += step;
      if (acc >= (on ? dash : gap) - 1e-6) { acc = 0; on = !on; }
    }
  }
}

// ------------------------------------------------------------------------------------------------ textures
export interface KongMaterials { mats: Record<Exclude<MatKey, "kbody" | "khead" | "kgear" | "kshoe" | "keye" | "kmin">, THREE.Material>; dispose(): void }
function furMaps() {
  // petal strands (canvas bottom = root v=0, top = tip v=1): a soft root→tip value ramp (lit rounded tips), a dozen broad
  // soft strand locks that converge to the two tip prongs (u ≈ 0.25 / 0.75), fine hair lines on top, no outline
  // (a hard edge gradient + 300 thin lines read as wood grain)
  const S = 256, r = rng(71), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  const g0 = c.createLinearGradient(0, S, 0, 0); g0.addColorStop(0, "#b8b8b8"); g0.addColorStop(0.55, "#dcdcdc"); g0.addColorStop(1, "#f4f0ea");
  c.fillStyle = g0; c.fillRect(0, 0, S, S); hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  const lock = (x0: number, tipX: number, w: number, light: boolean, a: number) => {
    const y0 = S * (1.05 + r() * 0.1), y1 = S * (0.02 + r() * 0.12), cx = (x0 + tipX) / 2 + (r() - 0.5) * S * 0.08;
    for (const [ctx, col, k] of [[c, light ? `rgba(255,244,228,${a})` : `rgba(30,14,4,${a})`, 1], [hc, light ? `rgba(255,255,255,${a * 1.6})` : `rgba(0,0,0,${a * 1.6})`, 1]] as const) {
      ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineWidth = w * k;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, S * 0.5, tipX, y1); ctx.stroke();
    }
  };
  for (let k = 0; k < 14; k++) { const x0 = S * (0.1 + r() * 0.8), tip = S * (x0 < S / 2 ? 0.22 + r() * 0.08 : 0.7 + r() * 0.08); lock(x0, tip, 10 + r() * 14, r() < 0.5, 0.06 + r() * 0.07); }
  for (let k = 0; k < 90; k++) { const x0 = S * (0.05 + r() * 0.9), tip = S * (x0 < S / 2 ? 0.2 + r() * 0.12 : 0.68 + r() * 0.12); lock(x0, tip, 1 + r() * 2, r() < 0.4, 0.05 + r() * 0.1); }
  // parting between the two prongs (height groove down the centre of the upper half)
  const g3 = hc.createLinearGradient(S * 0.42, 0, S * 0.58, 0); g3.addColorStop(0, "rgba(0,0,0,0)"); g3.addColorStop(0.5, "rgba(0,0,0,0.22)"); g3.addColorStop(1, "rgba(0,0,0,0)");
  hc.fillStyle = g3; hc.fillRect(0, 0, S, S * 0.55);
  return { map: tex(el), normal: tex(heightToNormal(hel, 2.2), { srgb: false }) };
}
/** clump strands (canvas bottom = root v 0, top = tip v 1): opaque body up to ~40 %, then ~70 tapered strands of random
 *  length converging toward the tip — alpha carries the ragged strand ends (alphaTest), RGB is filled everywhere (the lo
 *  tier ignores alpha) with a root → tip value ramp + light / dark locks; the height map ridges every strand */
function hairMaps() {
  const W = 256, H = 512, r = rng(72), [el, c] = canvas(W, H), [ael, ac] = canvas(W, H), [hel, hc] = canvas(W, H);
  const Y = (v: number) => (1 - v) * H;
  const g0 = c.createLinearGradient(0, H, 0, 0); g0.addColorStop(0, "#a8a8a8"); g0.addColorStop(0.5, "#d6d6d6"); g0.addColorStop(1, "#f2eee8");
  c.fillStyle = g0; c.fillRect(0, 0, W, H);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, W, H);
  ac.fillStyle = "#000"; ac.fillRect(0, 0, W, H);
  // solid body of the clump, its top edge wavy
  ac.fillStyle = "#fff"; ac.beginPath(); ac.moveTo(0, H);
  for (let i = 0; i <= 16; i++) ac.lineTo((i / 16) * W, Y(0.36 + 0.06 * r()));
  ac.lineTo(W, H); ac.closePath(); ac.fill();
  const strand = (x0: number, v0: number, x1: number, v1: number, w: number, light: number) => {
    const cx = (x0 + x1) / 2 + (r() - 0.5) * W * 0.06;
    const path = (ctx: CanvasRenderingContext2D, ww: number) => {
      // tapered: a filled sliver from the root width to a point
      ctx.beginPath(); ctx.moveTo(x0 - ww / 2, Y(v0)); ctx.quadraticCurveTo(cx - ww * 0.3, Y((v0 + v1) / 2), x1, Y(v1)); ctx.quadraticCurveTo(cx + ww * 0.3, Y((v0 + v1) / 2), x0 + ww / 2, Y(v0)); ctx.closePath(); ctx.fill();
    };
    ac.fillStyle = "#fff"; path(ac, w);
    c.fillStyle = light > 0 ? `rgba(255,246,232,${0.1 + 0.14 * light})` : `rgba(40,20,8,${0.08 - 0.12 * light})`; path(c, w * 0.8);
    hc.fillStyle = `rgba(255,255,255,${0.35 + 0.2 * r()})`; path(hc, w * 0.55);
  };
  for (let k = 0; k < 74; k++) {
    const x0 = W * (0.04 + r() * 0.92), len = 0.62 + r() * 0.36, v1 = Math.min(0.995, 0.34 + len * 0.7);
    const x1 = x0 + (W * 0.5 - x0) * (0.35 + r() * 0.3) + (r() - 0.5) * W * 0.08;
    strand(x0, 0.28 + r() * 0.1, x1, v1, 7 + r() * 11, r() * 2 - 1);
  }
  // fine hair lines over everything (colour + height)
  for (let k = 0; k < 120; k++) { const x0 = r() * W, x1 = x0 + (W * 0.5 - x0) * 0.4; c.strokeStyle = r() < 0.5 ? "rgba(255,244,228,0.08)" : "rgba(30,14,4,0.08)"; c.lineWidth = 1 + r(); c.beginPath(); c.moveTo(x0, H); c.lineTo(x1, Y(0.4 + r() * 0.55)); c.stroke(); }
  // alpha → the colour canvas's alpha channel
  const img = c.getImageData(0, 0, W, H), am = ac.getImageData(0, 0, W, H).data;
  for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = am[i];
  c.putImageData(img, 0, 0);
  return { map: tex(el), normal: tex(heightToNormal(hel, 2.4), { srgb: false }) };
}
/** tiling painted skin mottle (not flat unpainted peach plastic): soft warm blotches, a few rosy + darker freckle
 *  spots, faint pores — multiplied over the vertex colour, values ~0.86–1.06 */
function skinMottle() {
  const S = 256, r = rng(83), [el, c] = canvas(S, S);
  c.fillStyle = "#fcfcfc"; c.fillRect(0, 0, S, S);
  const blob = (x: number, y: number, rad: number, col: string) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2); } };
  for (let i = 0; i < 40; i++) blob(r() * S, r() * S, 30 + r() * 50, r() < 0.5 ? "rgba(225,160,130,0.07)" : "rgba(255,240,220,0.09)");
  for (let i = 0; i < 1200; i++) { c.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(140,70,40,0.035)"; c.fillRect(r() * S, r() * S, 1.5, 1.5); }
  return tex(el, { repeat: [3, 3] });
}
function skinNormal() {
  const S = 256, r = rng(81), [el, c] = canvas(S, S);
  c.fillStyle = "#808080"; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { const x = r() * S, y = r() * S, s = 0.8 + r() * 2.4; c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.2 * r()})` : `rgba(0,0,0,${0.2 * r()})`; c.beginPath(); c.arc(x, y, s, 0, PI * 2); c.fill(); }
  return tex(heightToNormal(el, 1.2), { srgb: false });
}
function shortsMaps() {
  const S = 512, r = rng(91), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#a63a22", r, 0.1, 50);
  // twill weave: diagonal ribs
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let k = -S; k < S * 2; k += 5) {
    c.strokeStyle = "rgba(60,10,0,0.07)"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(k, 0); c.lineTo(k + S, S); c.stroke();
    hc.strokeStyle = "rgba(255,255,255,0.35)"; hc.lineWidth = 2; hc.beginPath(); hc.moveTo(k, 0); hc.lineTo(k + S, S); hc.stroke();
  }
  // faded / worn patches + grime
  for (let i = 0; i < 26; i++) { const x = r() * S, y = r() * S, rad = 30 + r() * 110, g = c.createRadialGradient(x, y, 0, x, y, rad); const l = r() < 0.55; g.addColorStop(0, l ? "rgba(235,140,100,0.12)" : "rgba(70,12,4,0.14)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  grain(c, S, S, r, 0.06, 5000);
  return { map: tex(el), normal: tex(heightToNormal(hel, 1.4), { srgb: false }) };
}
function peelMaps() {
  // atlas: left half = outer ripe skin, right half = pale fibrous inner peel. Canvas x = across a strip (u), canvas y =
  // ALONG it (v; the wraps' strips run round the arm, the tips root → point). No round dots: the ripe skin
  // carries fibres + a few long bruise STREAKS along the fibres, sparse fine sugar spots, soft value bands, a brown
  // bruised tip end (v ≈ 0) and a faint green end (v ≈ 1). 1024² so it stays crisp at 4K close-ups.
  const W = 1024, H = 1024, r = rng(22), [el, c] = canvas(W, H), [hel, hc] = canvas(W, H);
  c.save(); c.beginPath(); c.rect(0, 0, W / 2, H); c.clip();
  // (the target art's wraps measure hue 40 on screen; #f5d21a rendered 44 — a deeper ripe gold)
  base(c, W / 2, H, "#f4c218", r, 0.06, 30);
  // soft lengthwise value bands (a peel's facets)
  for (let i = 0; i < 7; i++) { const x = r() * W / 2, w = 20 + r() * 50, g = c.createLinearGradient(x - w, 0, x + w, 0); const l = r() < 0.5; g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, l ? "rgba(255,240,150,0.16)" : "rgba(190,140,10,0.12)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(x - w, 0, w * 2, H); }
  for (let i = 0; i < 70; i++) { const x = r() * W / 2; c.strokeStyle = `rgba(${r() < 0.5 ? "176,128,8" : "255,238,150"},${0.03 + r() * 0.05})`; c.lineWidth = 1 + r() * 3; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + (r() - 0.5) * 18, H * 0.3, x + (r() - 0.5) * 18, H * 0.7, x + (r() - 0.5) * 24, H); c.stroke(); }
  // bruise streaks: long soft brown smears along the fibres, a darker core line in some
  for (let i = 0; i < 16; i++) {
    const x = r() * W / 2, y = r() * H, len = 50 + r() * 190, w = 3 + r() * 8;
    c.save(); c.translate(x, y); c.scale(1, len / w);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w); g.addColorStop(0, `rgba(118,70,16,${0.35 + r() * 0.3})`); g.addColorStop(1, "rgba(118,70,16,0)");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, w, 0, PI * 2); c.fill(); c.restore();
    if (r() < 0.5) { c.strokeStyle = "rgba(84,48,12,0.55)"; c.lineWidth = 1.2 + r(); c.beginPath(); c.moveTo(x, y - len * 0.4); c.lineTo(x + (r() - 0.5) * 6, y + len * 0.4); c.stroke(); }
  }
  // a few soft bruise patches + sparse fine sugar spots (no polka dots)
  for (let i = 0; i < 5; i++) { const x = r() * W / 2, y = r() * H, rad = 12 + r() * 22; c.save(); c.translate(x, y); c.scale(0.6, 1.4); const g = c.createRadialGradient(0, 0, 0, 0, 0, rad); g.addColorStop(0, "rgba(128,80,18,0.34)"); g.addColorStop(1, "rgba(128,80,18,0)"); c.fillStyle = g; c.fillRect(-rad, -rad, rad * 2, rad * 2); c.restore(); }
  speckles(c, W / 2, H, r, 70, "rgba(92,52,12,0.7)", 0.0045);
  speckles(c, W / 2, H, r, 90, "rgba(92,52,12,0.4)", 0.0025);
  // ends: brown bruised tip (bottom of the canvas = v 0) + a hint of green at the stem end (top)
  const ge = c.createLinearGradient(0, 0, 0, H); ge.addColorStop(0, "rgba(110,140,24,0.26)"); ge.addColorStop(0.06, "rgba(0,0,0,0)"); ge.addColorStop(0.86, "rgba(0,0,0,0)"); ge.addColorStop(0.95, "rgba(120,74,20,0.5)"); ge.addColorStop(1, "rgba(70,40,12,0.9)"); c.fillStyle = ge; c.fillRect(0, 0, W / 2, H);
  c.restore();
  c.fillStyle = "#f7ecc8"; c.fillRect(W / 2, 0, W / 2, H);
  for (let i = 0; i < 120; i++) { const x = W / 2 + r() * W / 2; c.strokeStyle = `rgba(205,175,105,${0.1 + r() * 0.18})`; c.lineWidth = 1 + r() * 4; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (r() - 0.5) * 16, H); c.stroke(); }
  const gi = c.createLinearGradient(0, 0, 0, H); gi.addColorStop(0.9, "rgba(0,0,0,0)"); gi.addColorStop(1, "rgba(120,80,30,0.55)"); c.fillStyle = gi; c.fillRect(W / 2, 0, W / 2, H);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) { const x = r() * W; hc.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.2})`; hc.lineWidth = 2 + r() * 6; hc.beginPath(); hc.moveTo(x, 0); hc.lineTo(x + (r() - 0.5) * 20, H); hc.stroke(); }
  // lengthwise facet ridges on the outer skin
  for (let i = 0; i < 5; i++) { const x = (0.08 + i * 0.1) * W; const g = hc.createLinearGradient(x - 18, 0, x + 18, 0); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)"); hc.fillStyle = g; hc.fillRect(x - 18, 0, 36, H); }
  return { map: tex(el), normal: tex(heightToNormal(hel, 1.5), { srgb: false }) };
}
// sneaker upper atlas: u = around the section (0 inner sole edge → .5 top → 1 outer sole edge), v = heel(0) → toe(1)
const TOE_V = (u: number) => 0.7 + 0.06 * Math.sin(PI * u);
function sneakerMaps() {
  const S = 1024, r = rng(23), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  const X = (u: number) => u * S, Y = (v: number) => (1 - v) * S;   // canvas y is flipped (flipY)
  base(c, S, S, "#f5c81a", r, 0.08, 50);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  // toe cap slightly paler + heel counter slightly deeper
  c.fillStyle = "rgba(255,236,150,0.18)"; c.beginPath(); c.moveTo(0, Y(1)); for (let i = 0; i <= 40; i++) { const u = i / 40; c.lineTo(X(u), Y(TOE_V(u))); } c.lineTo(S, Y(1)); c.closePath(); c.fill();
  // grime toward the sole edges
  for (const [u0, u1] of [[0, 0.1], [1, 0.9]]) { const g = c.createLinearGradient(X(u0), 0, X(u1), 0); g.addColorStop(0, "rgba(120,80,10,0.22)"); g.addColorStop(1, "rgba(120,80,10,0)"); c.fillStyle = g; c.fillRect(Math.min(X(u0), X(u1)), 0, Math.abs(X(u1) - X(u0)), S); }
  const line = (pts: Array<[number, number]>, stitch = true) => {
    for (const [ctx, st, w] of [[c, "rgba(120,70,5,0.85)", 6], [hc, "rgba(0,0,0,0.75)", 9]] as const) {
      ctx.strokeStyle = st; ctx.lineWidth = w; ctx.setLineDash([]); ctx.beginPath(); pts.forEach(([u, v], i) => (i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v)))); ctx.stroke();
    }
    // raised panel edge highlight on the height map (one side of the groove)
    hc.strokeStyle = "rgba(255,255,255,0.55)"; hc.lineWidth = 10; hc.beginPath(); pts.forEach(([u, v], i) => (i ? hc.lineTo(X(u) + 4, Y(v) + 4) : hc.moveTo(X(u) + 4, Y(v) + 4))); hc.stroke();
    if (stitch) { c.strokeStyle = "rgba(95,55,5,0.85)"; c.lineWidth = 3.5; c.setLineDash([10, 7]); c.beginPath(); pts.forEach(([u, v], i) => (i ? c.lineTo(X(u) - 9, Y(v) - 9) : c.moveTo(X(u) - 9, Y(v) - 9))); c.stroke(); c.setLineDash([]); }
  };
  const curve = (f: (t: number) => [number, number], n = 40) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
  line(curve((t) => [0.02 + 0.96 * t, TOE_V(0.02 + 0.96 * t)]));                                   // toe cap
  for (const u of [0.37, 0.63]) line(curve((t) => [u, 0.3 + t * (TOE_V(u) - 0.3)]));                // eyestay edges
  for (const s of [0, 1]) line(curve((t) => { const u = 0.03 + 0.27 * t; return [s ? 1 - u : u, 0.42 - 0.38 * Math.pow(t, 0.8)]; }));   // heel counter
  for (const u of [0.31, 0.69]) line(curve((t) => [u, t * 0.33]), false);                           // collar padding
  for (const s of [0, 1]) line(curve((t) => { const u = 0.04 + 0.26 * t; return [s ? 1 - u : u, 0.55 + 0.02 * t]; }));  // quarter seam
  // banana speckles: dense on the toe box, sparse elsewhere
  c.fillStyle = "rgba(96,58,14,0.8)";
  for (let i = 0; i < 90; i++) { const u = 0.12 + r() * 0.76, v = TOE_V(u) + 0.02 + r() * (0.99 - TOE_V(u) - 0.03), s = 3 + r() * 6; c.beginPath(); c.ellipse(X(u), Y(v), s, s * (0.7 + r() * 0.4), r() * PI, 0, PI * 2); c.fill(); }
  c.fillStyle = "rgba(96,58,14,0.55)";
  for (let i = 0; i < 40; i++) { const u = r(), v = r() * 0.7, s = 2 + r() * 4; c.beginPath(); c.arc(X(u), Y(v), s, 0, PI * 2); c.fill(); }
  grain(c, S, S, r, 0.05, 6000);
  // leather crease grain on the height map
  for (let i = 0; i < 3000; i++) { hc.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"; hc.fillRect(r() * S, r() * S, 2, 2); }
  return { map: tex(el), normal: tex(heightToNormal(hel, 2.2), { srgb: false }) };
}
function rubberMaps() {
  // left half: sole tread (grooves), right half: plain white (sole walls, laces, rope, star take vertex colours)
  const S = 256, [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, S, S); hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  c.fillStyle = "#d7ccb0"; c.fillRect(0, 0, S / 2, S);
  for (let y = 6; y < S; y += 14) { c.fillStyle = "rgba(90,70,40,0.45)"; c.fillRect(8, y, S / 2 - 16, 5); hc.fillStyle = "rgba(0,0,0,0.7)"; hc.fillRect(8, y, S / 2 - 16, 5); }
  return { map: tex(el), normal: tex(heightToNormal(hel, 2), { srgb: false }) };
}
function packMap() {
  const S = 1024, r = rng(24), [el, c] = canvas(S, S);
  base(c, S, S, "#eec433", r, 0.1, 40);
  for (let y = 0; y < S; y += 6) { c.fillStyle = "rgba(0,0,0,0.05)"; c.fillRect(0, y, S, 2); }
  c.strokeStyle = "rgba(90,55,15,0.6)"; c.lineWidth = 5; c.setLineDash([16, 12]); c.strokeRect(60, 60, S - 120, S - 120); c.setLineDash([]);
  // crisp brown stencil: banana glyph + BANANA / CO.
  c.save(); c.translate(S * 0.5, S * 0.28); c.scale(0.8, 0.8); c.rotate(-0.35); c.fillStyle = "#4a2a10";
  c.beginPath(); c.moveTo(-150, -20); c.quadraticCurveTo(0, 110, 150, -20); c.quadraticCurveTo(0, 40, -150, -20); c.fill();
  c.fillRect(140, -44, 22, 30); c.restore();
  stencil(c, "THE", S * 0.5, S * 0.5, 176, "#4a2a10", { font: "Impact, Haettenschweiler, 'Arial Black', sans-serif" });
  stencil(c, "FEED", S * 0.5, S * 0.66, 160, "#4a2a10", { font: "Impact, Haettenschweiler, 'Arial Black', sans-serif" });
  // stencil bridges (gaps) for the painted-stencil look
  c.fillStyle = "#eec433"; for (let i = 0; i < 6; i++) c.fillRect(S * (0.2 + i * 0.12), S * 0.44, 6, 110);
  grain(c, S, S, r, 0.07, 9000);
  return tex(el);
}

export function createKongMaterials(): KongMaterials {
  const hm = hairMaps(), fm = furMaps(), sm = shortsMaps(), pm = peelMaps(), km = sneakerMaps(), rm = rubberMaps(), skinN = skinNormal(), pack = packMap(), mott = skinMottle();
  const fur = new THREE.MeshPhysicalMaterial({ color: "#ffffff", map: fm.map, normalMap: fm.normal, normalScale: new THREE.Vector2(0.65, 0.65), roughness: 0.74, metalness: 0, vertexColors: true, sheen: 0.4, sheenColor: new THREE.Color("#9a6a3c"), sheenRoughness: 0.55 });
  // fur clumps: the same fur look, the tip broken into alpha-tested strands (layers below show through the gaps)
  const hair = new THREE.MeshPhysicalMaterial({ color: "#ffffff", map: hm.map, normalMap: hm.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.82, metalness: 0, vertexColors: true, sheen: 0.18, sheenColor: new THREE.Color("#9a6a3c"), sheenRoughness: 0.55, alphaTest: 0.5, side: THREE.DoubleSide });
  const skin = new THREE.MeshPhysicalMaterial({ color: "#ffffff", map: mott, roughness: 0.5, vertexColors: true, normalMap: skinN, normalScale: new THREE.Vector2(0.18, 0.18), sheen: 0.22, sheenColor: new THREE.Color("#e8a868"), sheenRoughness: 0.6 });
  const detail = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.2, vertexColors: true });
  const gold = new THREE.MeshStandardMaterial({ color: "#f1bd45", metalness: 0.75, roughness: 0.28, emissive: new THREE.Color("#4a2e00"), emissiveIntensity: 0.6 });
  const shorts = new THREE.MeshStandardMaterial({ color: "#ffffff", map: sm.map, normalMap: sm.normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });
  const peel = new THREE.MeshStandardMaterial({ color: "#ffffff", map: pm.map, normalMap: pm.normal, normalScale: new THREE.Vector2(0.22, 0.22), roughness: 0.38, vertexColors: true, envMapIntensity: 0.65 });
  // (pale tan high-tops otherwise — a glossy yellow at roughness 0.35 mirrors the blue sky over its whole surface; the target art
  // keep them ripe yellow in shade too: satin finish, less env, a more saturated albedo)
  const sneaker = new THREE.MeshStandardMaterial({ color: "#ffffff", map: km.map, normalMap: km.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.5, vertexColors: true, envMapIntensity: 0.55 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#ffffff", map: rm.map, normalMap: rm.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.62, vertexColors: true, envMapIntensity: 0.75, emissive: new THREE.Color("#2b1c0a"), emissiveIntensity: 0.5 });
  const packM = new THREE.MeshStandardMaterial({ color: "#ffffff", map: pack, roughness: 0.8, vertexColors: true });
  // far LOD (buildKongMin): plain vertex-coloured volumes, no maps
  const min = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.78, vertexColors: true });
  const mats: KongMaterials["mats"] = { fur, hair, skin, detail, gold, shorts, peel, sneaker, pack: packM, rubber, min };
  const texs = [hm.map, hm.normal, fm.map, fm.normal, sm.map, sm.normal, pm.map, pm.normal, km.map, km.normal, rm.map, rm.normal, skinN, pack, mott];
  return { mats, dispose() { for (const m of Object.values(mats)) m.dispose(); for (const t of texs) t.dispose(); } };
}

// ================================================================================================ parts
type Out = Map<string, { bone: BoneName; mat: MatKey; mb: MB }>;
function slot(out: Out, bone: BoneName, mat: MatKey, tint: C3 = AO_NEUTRAL, aoK = 1) {
  const k = `${bone}|${mat}`;
  if (!out.has(k)) {
    const mb = new MB(tint, aoK);
    out.set(k, { bone, mat, mb });
    if (mat === "fur") { mb.hair = new MB(tint, aoK); out.set(`${bone}|hair`, { bone, mat: "hair", mb: mb.hair }); }
  }
  return out.get(k)!.mb;
}

// ---------------------------------------------------------------------------------------------- head
function buildHead(out: Out, q: Q) {
  const fur = slot(out, "head", "fur", AO_FUR), skin = slot(out, "head", "skin", AO_SKIN), det = slot(out, "head", "detail", AO_NEUTRAL, 0.6), gold = slot(out, "head", "gold");
  const rnd = rng(101), seg = q.seg;
  const skull = new Ell(v3(HEAD.skull.c), v3(HEAD.skull.r));
  ellMesh(fur, HEAD.skull.c, HEAD.skull.r, Math.max(q.hi ? 10 : 7, seg - 6), PAL.crev, [0, 0, 0], [6, 4]);
  const earC = v3(HEAD.ear);
  const faceKeep = (p: V) => !(p.z < -0.03 && Math.abs(p.x) < 0.172 && p.y < 0.345 && p.y > -0.1) && p.distanceTo(new V3(Math.sign(p.x) * earC.x, earC.y, earC.z)) > 0.055;
  const cull = culler("head", ["skull"]);
  const HF: FurSpec = { L: 0.1, W: 0.08, T: 0.013, lift: 0.016 }, sp = spacing(HF, q);
  furClumps(fur, skull, ellRoots(skull, new V3(0, 0.52, -0.86), sp.row, sp.col, 0.1, 2.5, rnd, (p) => faceKeep(p) && cull(p)), HF, q, rnd);
  // crown tuft: spiky clumps pointing up/back (mini mohawk)
  const tuft: Array<[P3, number, number, number]> = [[[0, 0.93, -0.36], 0.13, 1.0, 0], [[0, 1, -0.08], 0.16, 0.95, 0], [[0, 0.97, 0.22], 0.15, 0.8, 0], [[0, 0.86, 0.5], 0.12, 0.6, 0], [[0.36, 0.9, -0.2], 0.11, 0.85, 0.35], [[-0.36, 0.9, -0.2], 0.11, 0.85, -0.35], [[0.33, 0.9, 0.18], 0.12, 0.75, 0.3], [[-0.33, 0.9, 0.18], 0.12, 0.75, -0.3], [[0.16, 0.97, 0.05], 0.14, 0.9, 0.15], [[-0.16, 0.97, 0.05], 0.14, 0.9, -0.15]];
  const h = hit();
  for (const [d, L, elev, yaw] of q.hi ? tuft : tuft.slice(0, 5)) {
    skull.dir(v3(d).normalize(), h);
    const f = new V3(Math.sin(yaw) * 0.6, 0, 1).addScaledVector(h.n, -new V3(Math.sin(yaw) * 0.6, 0, 1).dot(h.n)).normalize();
    petal(fur.hair!, skull, { p: h.p.clone().addScaledVector(h.n, -0.01), n: h.n.clone(), f, k: 1 }, { L: L * (q.hi ? 1 : 1.2), W: 0.062, T: 0.018, lift: 0.0, nu: q.nu, nv: q.hi ? 5 : 2, bottom: q.bottom, pal: furPal, elev, narrow: 0.9 }, [1.05, 1.02, 1]);
  }
  // face: two merged eye lobes (mask) + broad muzzle + chin + smile cheeks, all tan skin with warm shading
  const skinC = (p: V, n: V): C3 => mix(PAL.skin, PAL.skinShade, clamp(0.28 - n.y * 0.45 + (p.z > -0.12 ? 0.3 : 0) + Math.max(0, -n.y) * 0.25));
  for (const s of [-1, 1]) ellMesh(skin, [s * HEAD.mask.c[0], HEAD.mask.c[1], HEAD.mask.c[2]], HEAD.mask.r, seg, skinC, [0, 0, s * 0.16]);
  ellMesh(skin, [0, 0.232, -0.17], [0.07, 0.07, 0.07], seg - 6, skinC);                   // bridge between the lobes
  ellMesh(skin, HEAD.muzzle.c, HEAD.muzzle.r, q.hi ? seg + 4 : 10, skinC, [0, 0, 0], [4, 4]);
  ellMesh(skin, HEAD.chin.c, HEAD.chin.r, seg, skinC);
  for (const s of [-1, 1]) ellMesh(skin, [s * 0.172, 0.158, -0.205], [0.062, 0.056, 0.058], q.hi ? 14 : 8, skinC);   // smile cheeks
  // nose: wide flat button on top of the muzzle, two nostrils
  ellMesh(skin, [0, 0.212, -0.29], [0.072, 0.036, 0.04], q.hi ? 16 : 8, (p, n) => mix(PAL.nose, PAL.skinShade, clamp(0.3 - n.y * 0.5)));
  if (q.hi) for (const s of [-1, 1]) det.geo(new THREE.SphereGeometry(1, 8, 5), TRS([s * 0.029, 0.201, -0.322], [0.6, 0, s * 0.35], [0.017, 0.011, 0.01]), PAL.mouth);
  // ears: cream C with an inner bowl + rim, gold hoop through the lobe
  for (const s of [-1, 1]) {
    ellMesh(skin, [s * HEAD.ear[0], HEAD.ear[1], HEAD.ear[2]], [0.024, 0.058, 0.05], q.hi ? 14 : 6, mul(PAL.skin, 0.97), [0, -s * 0.35, s * 0.12]);
    if (q.hi) ellMesh(skin, [s * (HEAD.ear[0] + 0.014), HEAD.ear[1] - 0.002, HEAD.ear[2] - 0.006], [0.01, 0.038, 0.03], 10, mix(PAL.earIn, PAL.skin, 0.25), [0, -s * 0.35, s * 0.12]);
    if (q.hi) skin.geo(new THREE.TorusGeometry(0.044, 0.01, 8, 18, PI * 1.55), BASIS(new V3(s * (HEAD.ear[0] + 0.013), HEAD.ear[1], HEAD.ear[2] - 0.002), new V3(0, 0, s), new V3(0, 1, 0), new V3(s, 0, 0).applyAxisAngle(new V3(0, 1, 0), -s * 0.35)).multiply(new THREE.Matrix4().makeRotationZ(-PI * 0.28)), mul(PAL.skin, 0.96));
    gold.geo(new THREE.TorusGeometry(0.027, 0.0085, q.hi ? 10 : 5, q.hi ? 24 : 10), BASIS(new V3(s * 0.228, 0.168, -0.004), new V3(0, 0, 1).applyAxisAngle(new V3(0, 1, 0), s * 0.35), new V3(0, 1, 0), new V3(s, 0, 0).applyAxisAngle(new V3(0, 1, 0), s * 0.35)), [1, 1, 1]);
  }
  // eyes: big glossy whites (+30 %), dark-brown iris with a rim, pupil, catch-light; gaze forward, a touch outward
  for (const s of [-1, 1]) {
    const ec = new V3(s * HEAD.eye.c[0], HEAD.eye.c[1], HEAD.eye.c[2]);
    ellMesh(det, [ec.x, ec.y, ec.z], HEAD.eye.r, q.hi ? 16 : 7, (_p, n) => mix(PAL.eyeWhite, mul(PAL.eyeWhite, 0.8), clamp(n.y * 0.8 + 0.1)));
    const d = new V3(s * 0.08, -0.02, -1).normalize(), F = frameZ(d);
    const onEye = (dd: V, off: number) => new V3(ec.x + dd.x * (HEAD.eye.r[0] + off), ec.y + dd.y * (HEAD.eye.r[1] + off), ec.z + dd.z * (HEAD.eye.r[2] + off));
    det.geo(new THREE.SphereGeometry(1, q.hi ? 18 : 6, q.hi ? 10 : 4), BASIS(onEye(d, -0.007), F.x, F.y, F.z, [0.031, 0.033, 0.01]), (p) => { const r = Math.hypot(p.x - onEye(d, 0).x, p.y - onEye(d, 0).y); return mix(PAL.iris, PAL.irisRim, clamp((r - 0.02) / 0.01)); });
    det.geo(new THREE.SphereGeometry(1, q.hi ? 10 : 4, q.hi ? 6 : 3), BASIS(onEye(d, -0.0026), F.x, F.y, F.z, [0.015, 0.016, 0.006]), PAL.pupil);
    if (q.hi) { const hd = d.clone().addScaledVector(F.x, -s * 0.14).addScaledVector(F.y, 0.22).normalize(); det.geo(new THREE.SphereGeometry(1, 8, 5), BASIS(onEye(hd, 0.0004), F.x, F.y, F.z, [0.009, 0.009, 0.003]), [1.6, 1.6, 1.6]); }
    // upper lid: a skin fold over the top of the eyeball (reads as the angry squint under the brow)
    if (q.hi) {
      const lid: V[] = [];
      for (let i = 0; i <= 12; i++) { const a = lerp(0.35, PI - 0.35, i / 12), dd = new V3(Math.cos(a) * s * 0.95, 0.42 + Math.sin(a) * 0.5, -0.8).normalize(); lid.push(onEye(dd, 0.0035)); }
      tube(skin, lid, (t) => 0.0085 * Math.pow(Math.sin(PI * t), 0.6) + 0.002, 8, mix(PAL.skin, PAL.skinShade, 0.35), { up: new V3(0, 1, 0) });
    }
  }
  // brows: heavy dark fur ridges SEATED into the mask (their back half buried), inner ends low = confident scowl
  for (const s of [-1, 1]) {
    const ctrl = [new V3(s * 0.012, 0.268, -0.236), new V3(s * 0.05, 0.29, -0.238), new V3(s * 0.095, 0.308, -0.222), new V3(s * 0.138, 0.312, -0.19), new V3(s * 0.165, 0.298, -0.152)];
    const pts = catmull(ctrl, q.hi ? 18 : 6);
    tube(fur, pts, (t) => 0.03 * Math.pow(Math.sin(PI * (0.14 + 0.86 * t)), 0.5) + 0.006, q.hi ? 12 : 6, (_t, a) => mix(PAL.brow, PAL.browTop, clamp(Math.sin(a * 2 * PI) * 0.8 + 0.25)), { up: new V3(0, 1, -0.45).normalize(), sx: 1.05, sy: 0.72, pw: 2.2, uv: (t, a) => [a, t] });
  }
  // HUGE grin: a wide crescent whose corners climb into the cheeks; ONE upper tooth strip (faint separations),
  // dark mouth below it, thick lip rolls
  const MZ = HEAD.muzzle, XC = 0.188;
  const topY = (x: number) => 0.122 + 0.046 * Math.pow(Math.abs(x) / XC, 2.2), botY = (x: number) => 0.056 + 0.104 * Math.pow(Math.abs(x) / XC, 2.3);
  const onMuz = (x: number, y: number, off: number): Hit => {
    const u = x / MZ.r[0], w = (y - MZ.c[1]) / MZ.r[1], sq = Math.sqrt(Math.max(0.0025, 1 - u * u - w * w));
    const n = new V3(u / MZ.r[0], w / MZ.r[1], -sq / MZ.r[2]).normalize();
    return { p: new V3(x, y, MZ.c[2] - MZ.r[2] * sq).addScaledVector(n, off), n };
  };
  const NM = q.hi ? 36 : 14;
  det.grid(NM, 2, (i, j) => { const x = -XC + (2 * XC * i) / NM, y = lerp(botY(x) - 0.004, topY(x) + 0.002, j / 2), r = onMuz(x, y, 0.0012); return { p: r.p, c: j === 1 ? PAL.mouthIn : PAL.mouth, u: 0.5, v: 0.5 }; }, { out: new V3(0, 0, -1) });
  {
    const X0 = XC - 0.024, NT = q.hi ? 72 : 24, NV = q.hi ? 4 : 2, gap = 12;
    const toothB = (x: number) => lerp(topY(x), botY(x), 0.84);
    det.grid(NT, NV, (i, j) => {
      const u = i / NT, v = j / NV, x = lerp(-X0, X0, u), y = lerp(topY(x) + 0.001, toothB(x), v);
      const sepK = q.hi ? Math.abs(((u * NT) % (NT / gap)) - NT / gap / 2) / (NT / gap / 2) : 0;   // 0 at a tooth centre, 1 at a separation
      const groove = q.hi ? Math.pow(clamp((sepK - 0.78) / 0.22), 1.5) : 0;
      const pil = Math.sqrt(Math.max(0, 1 - Math.pow(2 * v - 1, 6))) * (1 - 0.35 * Math.pow(Math.abs(2 * u - 1), 4));
      const r = onMuz(x, y, 0.003 + 0.004 * pil - 0.0022 * groove);
      return { p: r.p, c: mul(PAL.white, (v < 0.25 ? 0.84 : 0.97) * (1 - 0.14 * groove) * (0.9 + 0.1 * pil)), u: 0.5, v: 0.5, hint: r.n, k: 0.3 };
    }, { out: new V3(0, 0, -1) });
  }
  {
    const lip = (yf: (x: number) => number, dy: number, rr: number, colr: C3, x0: number) => {
      const pts: V[] = [];
      for (let i = 0; i <= (q.hi ? 30 : 10); i++) { const x = -x0 + (2 * x0 * i) / (q.hi ? 30 : 10); pts.push(onMuz(x, yf(x) + dy, rr * 0.5).p); }
      tube(skin, pts, (t) => rr * (0.45 + 0.55 * Math.pow(Math.sin(PI * t), 0.35)), q.hi ? 6 : 5, colr, { up: new V3(0, 1, 0) });
    };
    lip(topY, 0.006, 0.011, mix(PAL.skin, PAL.lip, 0.45), XC + 0.006);
    lip(botY, -0.008, 0.015, mix(PAL.skin, PAL.lip, 0.35), XC);
  }
}

// ---------------------------------------------------------------------------------------------- torso
function buildTorso(out: Out, q: Q) {
  const seg = q.seg, rnd = rng(111);
  // chest: fur mass + trap hump, cream plate (pecs), throat
  {
    const fur = slot(out, "chest", "fur", AO_FUR), skin = slot(out, "chest", "skin", AO_SKIN);
    ellMesh(fur, CHEST.mass.c, CHEST.mass.r, Math.max(q.hi ? 10 : 7, seg - 6), PAL.crev, [0, 0, 0], [8, 6]);
    ellMesh(fur, CHEST.trap.c, CHEST.trap.r, Math.max(q.hi ? 10 : 7, seg - 6), PAL.crev, [0, 0, 0], [8, 6]);
    const mass = new Ell(v3(CHEST.mass.c), v3(CHEST.mass.r)), trap = new Ell(v3(CHEST.trap.c), v3(CHEST.trap.r));
    const BF: FurSpec = { L: 0.16, W: 0.11, T: 0.018, lift: 0.02 }, sp = spacing(BF, q);
    const front = (p: V) => !(p.z < -0.02 && Math.abs(p.x) < 0.335 && p.y < 0.4);
    furClumps(fur, mass, ellRoots(mass, new V3(0, 1, 0.15), sp.row, sp.col, 0.05, 2.75, rnd, (p) => front(p) && culler("chest", ["mass"])(p)), BF, q, rnd);
    const TF: FurSpec = { L: 0.15, W: 0.105, T: 0.017, lift: 0.02 }, sp2 = spacing(TF, q);
    furClumps(fur, trap, ellRoots(trap, new V3(0, 1, -0.55), sp2.row, sp2.col, 0.05, 2.2, rnd, (p) => p.z > -0.05 && culler("chest", ["trap"])(p)), TF, q, rnd);
    const skinC = (_p: V, n: V): C3 => mix(PAL.skin, PAL.skinShade, clamp(0.25 - n.y * 0.35 - n.z * 0.1));
    ellMesh(skin, CHEST.plate.c, CHEST.plate.r, seg, skinC);
    for (const s of [-1, 1]) {
      ellMesh(skin, [s * CHEST.pec.c[0], CHEST.pec.c[1], CHEST.pec.c[2]], CHEST.pec.r, seg, skinC, [-0.14, s * 0.12, -s * 0.1], [1, 1], 0.72);
      if (q.hi) ellMesh(skin, [s * 0.15, 0.134, -0.265], [0.011, 0.01, 0.005], 8, mix(PAL.skin, PAL.skinShade, 0.7), [0, s * 0.3, 0]);
    }
    ellMesh(skin, CHEST.throat.c, CHEST.throat.r, q.hi ? 14 : 6, skinC);
    // BANANA CO. pack + straps
    const pack = slot(out, "chest", "pack", AO_CLOTH), rub = slot(out, "chest", "rubber", AO_CLOTH), gold = slot(out, "chest", "gold");
    const PW = 0.3, PH = 0.34, PC: P3 = [0, 0.03, 0.39];
    pack.geo(new RoundedBoxGeometry(PW, PH, 0.13, q.hi ? 3 : 1, 0.035), TRS(PC), [1, 1, 1], [1, 1], (p, n) => (n.z > 0.55 ? [(p.x - PC[0]) / PW + 0.5, (p.y - PC[1]) / PH + 0.5] : [0.03, 0.03]));
    pack.geo(new RoundedBoxGeometry(PW + 0.01, 0.085, 0.15, q.hi ? 2 : 1, 0.03), TRS([0, 0.185, 0.395], [0.12, 0, 0]), [0.9, 0.86, 0.78], [1, 1], () => [0.03, 0.03]);
    if (q.hi) {
      pack.geo(new RoundedBoxGeometry(0.2, 0.06, 0.036, 2, 0.016), TRS([0, -0.112, 0.462]), [0.92, 0.88, 0.8], [1, 1], () => [0.04, 0.04]);
      rub.geo(new RoundedBoxGeometry(0.035, 0.12, 0.012, 2, 0.005), TRS([0, 0.13, 0.461], [0.08, 0, 0]), PAL.strap);
      gold.geo(new RoundedBoxGeometry(0.045, 0.035, 0.012, 2, 0.004), TRS([0, 0.075, 0.467]), [1, 1, 1]);
    }
    const shell = new Ell(v3(CHEST.mass.c), v3(CHEST.mass.r).multiplyScalar(1.1)), shellT = new Ell(v3(CHEST.trap.c), v3(CHEST.trap.r).multiplyScalar(1.13));
    for (const s of [-1, 1]) {
      const ctrl = [new V3(s * 0.1, 0.16, 0.37), new V3(s * 0.15, 0.36, 0.27), new V3(s * 0.19, 0.44, 0.1), new V3(s * 0.22, 0.41, -0.06), new V3(s * 0.25, 0.3, -0.16)];
      const pts = catmull(ctrl, q.hi ? 18 : 6).map((p, i, a) => {
        if (i < 2) return p;
        const a1 = shell.proj(p, hit()), a2 = shellT.proj(p, hit());
        const d1 = a1.p.distanceTo(v3(CHEST.mass.c)), d2 = a2.p.distanceTo(v3(CHEST.mass.c));
        return (d2 > d1 && i < a.length - 3 ? a2 : a1).p.clone();
      });
      tube(rub, pts, () => 0.012, 8, PAL.strap, { up: (t) => pts[Math.round(t * (pts.length - 1))].clone().sub(v3(CHEST.mass.c)).normalize(), sx: 2.2, sy: 0.55, pw: 3 });
    }
  }
  // spine: belly plate + abs, lower back / flank fur
  {
    const fur = slot(out, "spine", "fur", AO_FUR), skin = slot(out, "spine", "skin", AO_SKIN);
    ellMesh(fur, SPINE.fur.c, SPINE.fur.r, Math.max(q.hi ? 10 : 7, seg - 6), PAL.crev, [0, 0, 0], [8, 6]);
    const sf = new Ell(v3(SPINE.fur.c), v3(SPINE.fur.r));
    const LF: FurSpec = { L: 0.18, W: 0.14, T: 0.02, lift: 0.03 }, sp = spacing(LF, q);
    furClumps(fur, sf, ellRoots(sf, new V3(0, 1, 0.1), sp.row, sp.col, 0.4, 2.5, rnd, (p) => !(p.z < -0.02 && Math.abs(p.x) < 0.27) && culler("spine", ["spine"])(p)), LF, q, rnd);
    // belly with the 6-pack SCULPTED into the surface (linea alba + 2 transverse grooves, rounded pads, soft flanks)
    const B = SPINE.belly, NU = q.hi ? 30 : 12, NV = q.hi ? 22 : 9;
    const abs = (x: number, y: number) => {
      const ax = Math.abs(x);
      const col = clamp(ax / 0.022) * (1 - clamp((ax - 0.1) / 0.06));
      const yy = (y - 0.015) / 0.082, rowT = 0.5 - 0.5 * Math.cos(2 * PI * clamp(yy, 0, 2.5));
      const fade = clamp((y + 0.03) / 0.04) * (1 - clamp((y - 0.215) / 0.03));
      return (q.hi ? 0.016 : 0.01) * Math.pow(col, 0.7) * (0.35 + 0.65 * Math.pow(rowT, 0.6)) * fade;
    };
    const bellyAt = (u: number, v: number) => {
      // u: -1..1 around the front (±100°), v: 0 bottom .. 1 top
      const th = u * 1.75, ph = lerp(-1.25, 1.3, v);
      const n0 = new V3(Math.sin(th) * Math.cos(ph), Math.sin(ph), -Math.cos(th) * Math.cos(ph));
      const p = new V3(B.c[0] + n0.x * B.r[0], B.c[1] + n0.y * B.r[1], B.c[2] + n0.z * B.r[2]);
      const n = new V3(n0.x / B.r[0], n0.y / B.r[1], n0.z / B.r[2]).normalize();
      return p.addScaledVector(n, abs(p.x, p.y) * Math.max(0, -n.z));
    };
    skin.grid(NU, NV, (i, j) => { const p = bellyAt(-1 + (2 * i) / NU, j / NV); const nn = p.clone().sub(v3(B.c)); return { p, c: mix(PAL.skin, PAL.skinShade, clamp(0.3 - nn.y * 2.2 + Math.abs(nn.x) * 0.9)), u: 0.5, v: 0.5 }; }, { out: (p) => p.clone().sub(v3(B.c)) });
  }
}

// ---------------------------------------------------------------------------------------------- shorts (hips) + legs
function pelvisAt(a: number, y: number): Hit {
  // superellipse rings; a: 0 = +x (right), π/2 = front (-z)
  const R: Array<[number, number, number, number]> = [[0.15, 0.325, 0.25, 0.262], [0.1, 0.338, 0.256, 0.272], [0.04, 0.352, 0.264, 0.292], [-0.03, 0.368, 0.266, 0.306], [-0.1, 0.366, 0.258, 0.294], [-0.15, 0.31, 0.228, 0.254], [-0.19, 0.19, 0.155, 0.172], [-0.212, 0.03, 0.03, 0.03]];
  let k = 0; while (k < R.length - 2 && y < R[k + 1][0]) k++;
  const t = clamp((R[k][0] - y) / (R[k][0] - R[k + 1][0])), s = t * t * (3 - 2 * t);
  const rx = lerp(R[k][1], R[k + 1][1], s), rf = lerp(R[k][2], R[k + 1][2], s), rb = lerp(R[k][3], R[k + 1][3], s);
  const ex = 2 / 2.3, ca = Math.cos(a), sa = Math.sin(a);
  const x = rx * Math.sign(ca) * Math.pow(Math.abs(ca), ex), z = -(sa > 0 ? rf : rb) * Math.sign(sa) * Math.pow(Math.abs(sa), ex);
  const p = new V3(x, y, z - 0.0);
  const n = new V3(x / (rx * rx), 0, z / (Math.pow(sa > 0 ? rf : rb, 2))).normalize();
  if (y < -0.15) n.y = (0.6 * (y + 0.15)) / 0.06;
  return { p, n: n.normalize() };
}
function buildShorts(out: Out, q: Q) {
  const sh = slot(out, "hips", "shorts", AO_CLOTH), rub = slot(out, "hips", "rubber", AO_CLOTH), det = slot(out, "hips", "detail");
  const NA = q.hi ? 32 : 12, NY = q.hi ? 12 : 6, Y0 = 0.15, Y1 = -0.212;
  sh.grid(NA, NY, (i, j) => { const a = (i / NA) * 2 * PI, y = lerp(Y0, Y1, Math.pow(j / NY, 0.9)), h = pelvisAt(a, y); return { p: h.p, c: [1, 1, 1], u: (i / NA) * 5, v: y * 4, hint: h.n, k: 0.3 }; }, { wrapU: true, out: (p) => new V3(p.x, (p.y + 0.05) * 0.5, p.z) });
  // waistband (darker, proud of the belly) + belt loops
  const wb = (a: number, y: number, off: number) => { const h = pelvisAt(a, y); return { p: h.p.addScaledVector(h.n, off + (Math.sin(a) > 0 ? 0.012 : 0) * Math.pow(Math.sin(a), 2)), n: h.n }; };
  const WB: Array<[number, number]> = [[0.094, 0.004], [0.101, 0.014], [0.14, 0.014], [0.148, 0.004]];
  sh.grid(NA, 3, (i, j) => { const a = (i / NA) * 2 * PI, [y, off] = WB[j], h = wb(a, y, off); return { p: h.p, c: [0.6, 0.55, 0.55], u: (i / NA) * 5, v: y * 4 }; }, { wrapU: true, out: (p) => new V3(p.x, 0, p.z) });
  if (q.hi) {
    for (const a of [0.45, 1.5, 2.65, -0.45, -1.5, -2.65]) {
      const h = wb(a, 0.12, 0.02), F = frameZ(h.n);
      sh.geo(new RoundedBoxGeometry(0.024, 0.056, 0.01, 2, 0.004), BASIS(h.p, F.x, F.y, F.z), [0.58, 0.52, 0.52], [0.2, 0.2]);
    }
    // back pockets (patch, stitched top band) + fly seam + waistband stitches
    for (const s of [-1, 1]) {
      const h = pelvisAt(-PI / 2 + s * 0.5, -0.03), F = frameZ(h.n);
      sh.geo(new RoundedBoxGeometry(0.15, 0.135, 0.02, 2, 0.008), BASIS(h.p.clone().addScaledVector(h.n, 0.004), F.x, F.y, F.z), [0.86, 0.82, 0.82], [0.4, 0.4]);
      const c0 = h.p.clone().addScaledVector(h.n, 0.0145), ex = F.x.clone().multiplyScalar(0.062), ey = F.y.clone().multiplyScalar(0.052);
      dashes(sh, [c0.clone().sub(ex).add(ey), c0.clone().add(ex).add(ey)], [h.n, h.n], [0.35, 0.18, 0.15], 0.01, 0.007);
      dashes(sh, [c0.clone().sub(ex).add(ey), c0.clone().sub(ex).sub(ey), c0.clone().add(ex).sub(ey), c0.clone().add(ex).add(ey)], [h.n, h.n, h.n, h.n], [0.35, 0.18, 0.15], 0.01, 0.007);
    }
    const fly: V[] = [], flyN: V[] = [];
    for (let i = 0; i <= 10; i++) { const y = lerp(0.09, -0.13, i / 10), h = pelvisAt(PI / 2 + 0.07 * Math.sin((i / 10) * PI), y); fly.push(h.p); flyN.push(h.n); }
    dashes(sh, fly, flyN, [0.4, 0.2, 0.16]);
    for (const [y, off] of [[0.1, 0.015], [0.139, 0.015]] as const) { const pts: V[] = [], nn: V[] = []; for (let i = 0; i <= 60; i++) { const h = wb((i / 60) * 2 * PI, y, off); pts.push(h.p); nn.push(h.n); } dashes(sh, pts, nn, [0.3, 0.14, 0.12], 0.011, 0.007, 0.003); }
  }
  // rope drawstring: chunky knot + two dangling knotted ends
  const kn = wb(PI / 2, 0.118, 0.018).p;
  const ropeC = (t: number, a: number): C3 => mul(PAL.rope, 0.8 + 0.2 * Math.cos(3 * a * 2 * PI - t * 38));
  for (const [ax, rot] of ([[new V3(1, 0.3, 0), 0.4], [new V3(0.2, 1, 0.1), -0.5], [new V3(-0.6, 0.4, 0.5), 1.1]] as const).slice(0, q.hi ? 3 : 1)) {
    rub.geo(new THREE.TorusGeometry(0.017, 0.0095, 8, q.hi ? 16 : 8), BASIS(kn, new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)).multiply(new THREE.Matrix4().makeRotationAxis(ax.clone().normalize(), rot)), PAL.rope, [0.5, 0.5], () => [0.75, 0.5]);
  }
  for (const s of [-1, 1]) {
    const ctrl = [kn.clone(), kn.clone().add(new V3(s * 0.016, -0.03, -0.012)), new V3(s * 0.03, 0.0, 0), new V3(s * 0.04, -0.075, 0), new V3(s * 0.047, -0.115, 0)];
    for (let i = 2; i < ctrl.length; i++) { const h = pelvisAt(PI / 2 - s * 0.12 * i / 4, ctrl[i].y); ctrl[i].x = s * (0.03 + 0.009 * i); ctrl[i].z = h.p.z - 0.017; }
    const pts = catmull(ctrl, q.hi ? 18 : 6);
    tube(rub, pts, () => 0.0092, q.hi ? 8 : 5, ropeC, { up: new V3(0, 0, -1), uv: () => [0.75, 0.5] });
    const e = pts[pts.length - 1];
    if (q.hi) rub.geo(new THREE.SphereGeometry(0.0155, 10, 8), TRS([e.x, e.y, e.z], [0, 0, 0], [1, 1.1, 1]), mul(PAL.rope, 0.92), [1, 1], () => [0.75, 0.5]);
    if (q.hi) rub.geo(new THREE.CylinderGeometry(0.009, 0.013, 0.026, 8, 1, false), TRS([e.x, e.y - 0.024, e.z]), mul(PAL.rope, 1.05), [1, 1], () => [0.75, 0.5]);
  }
  void det;
}
/** short leg tube (on the thigh bone): baggy, ragged torn hem, cargo pocket with flap + button, hem stitching */
function buildLegTube(out: Out, q: Q) {
  const sh = slot(out, "hipR", "shorts", AO_CLOTH), det = slot(out, "hipR", "detail");
  const ax = v3(BONES.kneeR.offset).normalize(), rnd = rng(141);
  const b1 = new V3(1, 0, 0).addScaledVector(ax, -ax.x).normalize(), b2 = new V3().crossVectors(ax, b1).normalize();   // b1 ≈ outward (+x), b2 ≈ front/back
  const C = (d: number) => new V3(0.012, 0, 0).addScaledVector(ax, d);
  const LR = SHORT_LEG.r, NA = q.hi ? 56 : 16, rings: Array<[number, number]> = [[-SHORT_LEG.top, LR - 0.012], [0.03, LR - 0.004], [0.15, LR], [0.27, LR - 0.006], [SHORT_LEG.hem, LR - 0.01]];
  // ragged hem: triangular tears of varying length
  const teeth = q.hi ? 13 : 0, jag = Array.from({ length: teeth }, () => 0.015 + rnd() * 0.035), jOff = rnd();
  const tear = (a: number) => { if (!teeth) return 0; const f = ((a / (2 * PI)) * teeth + jOff) % 1, k = Math.floor(((a / (2 * PI)) * teeth + jOff) % teeth); return jag[k] * (1 - Math.abs(2 * f - 1)); };
  const radial = (a: number) => b1.clone().multiplyScalar(Math.cos(a)).addScaledVector(b2, Math.sin(a));
  sh.grid(NA, rings.length - 1, (i, j) => {
    const a = (i / NA) * 2 * PI, [d, r] = rings[j], last = j === rings.length - 1, tr = last ? tear(a) : 0;
    const p = C(d + tr).addScaledVector(radial(a), r + tr * 0.25);
    return { p, c: last ? [0.82, 0.78, 0.78] : [1, 1, 1], u: (i / NA) * 3.2, v: -(d + tr) * 4 };
  }, { wrapU: true, out: (p) => { const t = p.clone().sub(C(0)); return t.addScaledVector(ax, -t.dot(ax)); } });
  if (q.hi) {
    // hem stitch line
    const pts: V[] = [], nn: V[] = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * 2 * PI, rd = radial(a); pts.push(C(SHORT_LEG.hem - 0.028).addScaledVector(rd, LR - 0.0095)); nn.push(rd); }
    dashes(sh, pts, nn, [0.36, 0.18, 0.15], 0.012, 0.008);
    // outer side seam
    const sp: V[] = [], sn: V[] = [];
    for (let i = 0; i <= 8; i++) { const d = lerp(-0.02, SHORT_LEG.hem - 0.03, i / 8), rd = radial(-0.35); sp.push(C(d).addScaledVector(rd, LR - 0.006)); sn.push(rd); }
    dashes(sh, sp, sn, [0.36, 0.18, 0.15]);
  }
  // cargo pocket (outer side) + flap + button
  const pa = 0.1, rd = radial(pa), up = ax.clone().negate(), tg = new V3().crossVectors(rd, up).normalize();
  const pc = C(0.18).addScaledVector(rd, LR + 0.008), fc = C(0.095).addScaledVector(rd, LR + 0.016);
  sh.geo(new RoundedBoxGeometry(0.15, 0.16, 0.03, q.hi ? 2 : 1, 0.01), BASIS(pc, tg, up, rd), [0.92, 0.88, 0.88], [0.4, 0.4]);
  sh.geo(new RoundedBoxGeometry(0.162, 0.058, 0.036, q.hi ? 2 : 1, 0.012), BASIS(fc, tg, up.clone().applyAxisAngle(tg, 0.12), rd.clone().applyAxisAngle(tg, 0.12)), [0.7, 0.64, 0.64], [0.4, 0.4]);
  if (q.hi) det.geo(new THREE.CylinderGeometry(0.011, 0.011, 0.007, 12), BASIS(fc.clone().addScaledVector(rd, 0.02).addScaledVector(up, -0.012), tg, rd, up), PAL.button);
  if (q.hi) {
    const c0 = pc.clone().addScaledVector(rd, 0.0155), ex = tg.clone().multiplyScalar(0.064), ey = up.clone().multiplyScalar(0.068);
    dashes(sh, [c0.clone().sub(ex).add(ey), c0.clone().sub(ex).sub(ey), c0.clone().add(ex).sub(ey), c0.clone().add(ex).add(ey)], [rd, rd, rd, rd], [0.36, 0.18, 0.15], 0.01, 0.007);
  }
}
function buildLegs(out: Out, q: Q) {
  const rnd = rng(151);
  // thigh fur: only the part below the hem shows (flared tufts poking out) + the knee
  {
    const fur = slot(out, "hipR", "fur", AO_FUR), k = v3(BONES.kneeR.offset);
    const S = new Cap(new V3(0, 0, 0), k, THIGH.ra, THIGH.rb);
    capMesh(fur, S, q.hi ? 12 : 7, q.hi ? 9 : 5, PAL.crev);
    const TF: FurSpec = { L: 0.14, W: 0.11, T: 0.017, lift: 0.036 }, sp = spacing(TF, q);
    furClumps(fur, S, capRoots(S, sp.row, sp.col, S.capA + S.len * 0.66, S.total - S.rb * 0.4, rnd, culler("hipR", ["thigh", "legtube"])), TF, q, rnd);
  }
  {
    const fur = slot(out, "kneeR", "fur", AO_FUR);
    const S = new Cap(new V3(0, 0, 0), v3(CALF.end), CALF.ra, CALF.rb, CALF.bulge, 0.35);
    capMesh(fur, S, q.hi ? 12 : 7, q.hi ? 9 : 5, PAL.crev);
    const CF: FurSpec = { L: 0.135, W: 0.105, T: 0.017, lift: 0.026 }, sp = spacing(CF, q);
    furClumps(fur, S, capRoots(S, sp.row, sp.col, 0.04, S.capA + S.len * 0.6, rnd, culler("kneeR", ["calf"])), CF, q, rnd);
  }
}

// ---------------------------------------------------------------------------------------------- arms
function buildArms(out: Out, q: Q) {
  const rnd = rng(131);
  {
    const fur = slot(out, "shoulderR", "fur", AO_FUR);
    const S = new Cap(new V3(0.02, 0, 0), v3(BONES.elbowR.offset), ARM.ra, ARM.rb, ARM.bulge, 0.4);
    capMesh(fur, S, q.hi ? 14 : 8, q.hi ? 10 : 6, PAL.crev);
    const AF: FurSpec = { L: 0.16, W: 0.105, T: 0.018, lift: 0.024 }, sp = spacing(AF, q);
    furClumps(fur, S, capRoots(S, sp.row, sp.col, 0.015, S.capA + S.len * 0.99, rnd, culler("shoulderR", ["arm"])), AF, q, rnd);
  }
  const W = v3(BONES.wristR.offset);
  {
    const fur = slot(out, "elbowR", "fur", AO_FUR);
    // the capsule ends ~2 cm past the wrist joint (its end cap must not bulge out between the wraps and the fist)
    const S = new Cap(new V3(0, 0, 0), W.clone().multiplyScalar(1 - (FORE.rb - 0.02) / W.length()), FORE.ra, FORE.rb, 0.008, 0.6);
    capMesh(fur, S, q.hi ? 12 : 7, q.hi ? 9 : 5, PAL.crev);
    const FF: FurSpec = { L: 0.12, W: 0.085, T: 0.015, lift: 0.02 }, sp = spacing(FF, q);
    // fur only on the upper forearm: clumps flow down the arm, their tips tuck under the top wrap band
    furClumps(fur, S, capRoots(S, sp.row, sp.col, S.capA * 0.5, S.capA + S.len * 0.34, rnd, culler("elbowR", ["fore"])), FF, q, rnd);
    // banana-peel knuckle wraps. Target art: 3 THIN peel strips wound round the lower forearm + wrist, each a ribbon
    // that spirals once round the arm, its start tucked under and its end tapering to a pointed peel tip that lifts
    // off; the middle strip rides over its neighbours' edges (dark creases between them); a crown of 4 pointed peel
    // tips flares back toward the elbow from the top strip and 3 shorter ones splay over the back of the hand from
    // the bottom strip (yellow outside, pale cream inside, brown tips + bruise streaks along the fibres)
    const peel = slot(out, "elbowR", "peel", AO_NEUTRAL, 0.3);
    const ax = W.clone().normalize(), b1 = new V3().crossVectors(ax, new V3(0, 0, 1)).normalize(), b2 = new V3().crossVectors(ax, b1).normalize();
    // radial(a): a = 0 inward (−x), π/2 front (−z), π outward (+x), 3π/2 back — the tips end on the outer-front side
    const radial = (a: number) => b1.clone().multiplyScalar(Math.cos(a)).addScaledVector(b2, Math.sin(a));
    const len = W.length();
    // sleeve radius: the forearm capsule, but never thinner than a gentle taper to the wrist (the peel bridges the capsule's
    // end cap and the top of the fist instead of following it in)
    const R = (t: number) => { const a = t * len, cap = a <= S.len ? S.rad(a / S.len) : Math.sqrt(Math.max(0.0004, S.rb * S.rb - Math.pow(a - S.len, 2))); const tt = clamp((t - 0.55) / 0.5); return Math.max(cap, lerp(0.146, 0.1, tt * tt)); };
    // [centre t, half width (m), thickness, axial pitch per turn, gap, end angle, tip lift]
    // (target-art crop: three FAT rolled rings — round-profile, ~3 cm thick, dark creases between them — not flat tape)
    const bands: Array<[number, number, number, number, number, number, number]> = [
      [0.95, 0.042, 0.022, 0.016, 0.004, PI * 0.72, 0.035],     // wrist ring (under B's lower edge)
      [0.8, 0.047, 0.025, -0.02, 0.014, PI * 0.95, 0.04],       // middle ring, on top of both neighbours
      [0.65, 0.042, 0.022, 0.018, 0.004, PI * 0.55, 0.035],     // top ring (under B's upper edge)
    ];
    const NA = q.hi ? 44 : 16, NB2 = q.hi ? 8 : 4, OV = 0.95;
    const bw = rng(177);
    for (const [tc, hh, th, pitch, gap0, aEnd, lift] of bands) {
      const span = 2 * PI + OV, a0 = aEnd - span, tipS = 1 - 0.75 / span, bu = 0.12 + bw() * 0.2, wob = bw() * TAU_;
      // U (wrapped) = round the strip's cross-section, V = along the strip
      peel.grid(NB2, NA, (i, j) => {
        // (b runs clockwise so the raw grid normals point out of the strip — no orientation vote on a thin closed section)
        const s = j / NA, a = a0 + s * span, b = -(i / NB2) * 2 * PI, cb = Math.cos(b), sb = Math.sin(b);
        const ex = 2 / 2.7, cx = Math.sign(cb) * Math.pow(Math.abs(cb), ex), cy = Math.sign(sb) * Math.pow(Math.abs(sb), ex);
        // tucked-under start (narrow, flush) → full strip → pointed tip that lifts off the arm
        const kt = s > tipS ? (s - tipS) / (1 - tipS) : 0;
        const taper = Math.min(Math.sin(PI * 0.5 * clamp(s / 0.07)), Math.pow(Math.max(0, 1 - kt), 0.75));
        const w = hh * (0.15 + 0.85 * taper), thk = th * (0.35 + 0.65 * taper);
        const along = (tc * len) + cy * w + pitch * (s - 0.5) + 0.006 * Math.sin(2 * a + wob) + kt * kt * 0.02 * Math.sign(pitch);
        const rin = R(along / len) + gap0 + th * 1.05 * s + lift * Math.pow(kt, 1.7);
        const p = ax.clone().multiplyScalar(along).addScaledVector(radial(a), rin + thk * (0.5 + 0.5 * cx));
        // creases: strip edges + the underside darker; brown toward the tip
        const edge = 1 - 0.42 * Math.pow(Math.abs(cy), 3) - (cx < -0.2 ? 0.25 : 0);
        return { p, c: [edge, edge, edge], u: bu + 0.11 * cy, v: s < tipS ? 0.88 - 0.72 * (s / tipS) : 0.16 - 0.14 * kt };
      }, { wrapU: true });
    }
    // pale inner-peel lining where the wrist strip meets the fist: a shallow cone from the sleeve's lower edge down onto
    // the back of the hand, so the sleeve never shows a dark hole around the wrist
    {
      const NR = q.hi ? 20 : 10, t1 = 1.0, r1 = R(t1) + 0.006, rIn = 0.07;
      peel.grid(NR, 2, (i, j) => { const a = (i / NR) * 2 * PI, k = j / 2, along = lerp(t1 * len, t1 * len + 0.035, k), p = ax.clone().multiplyScalar(along).addScaledVector(radial(a), lerp(r1, rIn, k)); return { p, c: mul([0.78, 0.62, 0.3], 1 - 0.45 * k), u: 0.25, v: 0.5 }; }, { wrapU: true, out: ax });
    }
    // pointed peel tips: [t of the root, flare direction (−1 = back toward the elbow, +1 = over the hand), count, length]
    // (fewer, broader tips: 5 + 3 thin ones read as a spiky hedgehog)
    const crowns: Array<[number, number, number, number, number]> = [[0.6, -1, 4, 0.135, 0.62], [1.0, 1, 2, 0.08, 0.95]];
    for (const [t0, dirK, n, L0, flare0] of crowns) {
      for (let k = 0; k < n; k++) {
        const a0 = (dirK < 0 ? PI * 0.35 : PI * 0.6) + (k / n) * 2 * PI * (dirK < 0 ? 0.92 : 0.55) + (rnd() - 0.5) * 0.35;
        const Lf = L0 * (0.85 + rnd() * 0.3) * (q.hi ? 1 : 1.05), Wf = 0.085 + rnd() * 0.02, curl = 0.45 + rnd() * 0.35, th0 = flare0 + rnd() * 0.2;
        const base = ax.clone().multiplyScalar(t0 * len), up = ax.clone().multiplyScalar(dirK), rd = radial(a0), tg = new V3().crossVectors(ax, rd).normalize();
        const r0 = R(t0) + 0.022;
        const NU = q.hi ? 4 : 2, NV = q.hi ? 7 : 3;
        const cl: V[] = [base.clone().addScaledVector(rd, r0)];
        for (let j = 1; j <= NV; j++) { const v = j / NV, a = th0 + curl * Math.pow(v, 2), dL = Lf / NV; cl.push(cl[j - 1].clone().addScaledVector(up, Math.cos(a) * dL).addScaledVector(rd, Math.sin(a) * dL)); }
        const at = (u: number, j: number, side: number) => {
          const v = j / NV, a = th0 + curl * Math.pow(v, 2);
          const nrm = rd.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, -Math.sin(a));
          // a peel segment: broad root (wrapped round the arm), straight sides, pointed tip
          const w = Wf * 0.5 * (v < 0.45 ? 1 : Math.pow(Math.max(0, 1 - (v - 0.45) / 0.55), 0.8)) * (1 - 0.1 * v);
          const cup = 0.008 * (1 - u * u) * (0.4 + v);
          const thick = 0.0045 * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.6 * v);
          const ang = (u * w) / Math.max(0.05, r0), wrapK = Math.max(0, 1 - v * 1.6);
          const lateral = tg.clone().multiplyScalar(Math.sin(ang) * r0 * wrapK + u * w * (1 - wrapK)).addScaledVector(rd, (Math.cos(ang) - 1) * r0 * wrapK);
          return cl[j].clone().add(lateral).addScaledVector(nrm, cup + side * thick);
        };
        const vv = (j: number) => 0.34 - 0.32 * (j / NV);
        peel.grid(NU, NV, (i, j) => { const u = -1 + (2 * i) / NU; return { p: at(u, j, 1), c: [1, 1, 1], u: 0.25 + u * 0.12, v: vv(j) }; }, { out: rd });
        peel.grid(NU, NV, (i, j) => { const u = -1 + (2 * i) / NU; return { p: at(u, j, -1), c: [0.97, 0.95, 0.9], u: 0.75 + u * 0.12, v: vv(j) }; }, { out: rd.clone().negate() });
      }
    }
  }
  // fist: palm block, knuckle ridge, 4 fat curled fingers (3 phalanges each, knuckle bulges + creases), thumb over the front
  {
    const skin = slot(out, "wristR", "skin", AO_SKIN);
    const skinC = (_p: V, n: V): C3 => mix(PAL.skin, PAL.skinShade, clamp(0.22 - n.y * 0.35 + Math.abs(n.x) * 0.12));
    ellMesh(skin, [0, -0.074, 0.008], [0.104, 0.09, 0.09], q.hi ? 14 : 10, skinC);
    ellMesh(skin, [0, -0.103, -0.048], [0.1, 0.038, 0.04], q.hi ? 14 : 8, (p, n) => mix(PAL.knuckle, PAL.skinShade, clamp(0.12 - n.y * 0.3)));
    const R = [0.028, 0.03, 0.029, 0.025];
    for (let i = 0; i < (q.hi ? 4 : 0); i++) {
      const x = -0.066 + i * 0.044, r = R[i], dy = i === 3 ? 0.008 : 0;
      const pts = catmull([new V3(x, -0.098 + dy, -0.07), new V3(x * 1.01, -0.152 + dy, -0.086), new V3(x * 0.99, -0.186 + dy, -0.048), new V3(x * 0.97, -0.182 + dy, -0.006), new V3(x * 0.96, -0.16 + dy, 0.02)], q.hi ? 10 : 5);
      // joint bulges at PIP (t≈.3) + DIP (t≈.62), creases just past them
      const rr = (t: number) => r * (1 + 0.1 * Math.exp(-Math.pow((t - 0.3) / 0.07, 2)) + 0.07 * Math.exp(-Math.pow((t - 0.62) / 0.07, 2)) - 0.07 * Math.exp(-Math.pow((t - 0.42) / 0.04, 2)) - 0.06 * Math.exp(-Math.pow((t - 0.74) / 0.04, 2)));
      // cream over the knuckles (t 0.1–0.35, the finger backs facing out), warm tan into the curl + creases
      const cc = (t: number): C3 => mix(mix(PAL.knuckle, PAL.skin, clamp((t - 0.25) / 0.2)), PAL.skinShade, 0.08 + 0.45 * (Math.exp(-Math.pow((t - 0.42) / 0.04, 2)) + Math.exp(-Math.pow((t - 0.74) / 0.04, 2))) + 0.15 * t);
      tube(skin, pts, rr, q.hi ? 9 : 6, cc, { caps: true, up: new V3(1, 0, 0) });
      if (q.hi) ellMesh(skin, [x, -0.1 + dy, -0.08], [0.023, 0.018, 0.016], 8, PAL.knuckle);
    }
    if (!q.hi) ellMesh(skin, [0, -0.152, -0.04], [0.104, 0.052, 0.062], 8, skinC);
    // thumb: from the palm's inner side, wrapped across the front of the index + middle fingers
    const tp = catmull([new V3(-0.092, -0.04, -0.016), new V3(-0.098, -0.092, -0.066), new V3(-0.062, -0.13, -0.106), new V3(-0.018, -0.136, -0.108)], q.hi ? 12 : 4);
    if (q.hi) tube(skin, tp, (t) => 0.031 - 0.005 * t + 0.003 * Math.exp(-Math.pow((t - 0.55) / 0.1, 2)), 10, (t) => mix(PAL.skin, PAL.skinShade, 0.1 * t), { caps: true, up: new V3(0, 0, -1) });
    if (q.hi) ellMesh(skin, [-0.022, -0.128, -0.126], [0.016, 0.011, 0.006], 8, PAL.nail, [0.3, 0, 0]);
  }
}

// ---------------------------------------------------------------------------------------------- sneaker
const SN = { yb: -0.082, zH: 0.135, zT: -0.3, ground: -0.13, p: 2.8 };
const SN_H: Array<[number, number]> = [[0.135, 0.104], [0.11, 0.121], [0.06, 0.126], [0.01, 0.12], [-0.03, 0.1], [-0.08, 0.06], [-0.13, 0.02], [-0.18, -0.006], [-0.225, -0.02], [-0.25, -0.028]];
function footHW(z: number) {
  const zc = (SN.zH + SN.zT) / 2, b = (SN.zH - SN.zT) / 2, k = clamp(Math.abs(z - zc) / b);
  const a = z < zc ? 0.097 : 0.097 - 0.013 * clamp(((z - zc) / b) * 1.2);
  const e = z < zc ? 2.8 : 4.2;
  return a * Math.pow(Math.max(0, 1 - Math.pow(k, e)), 1 / e);
}
function snTop(z: number) {
  if (z <= -0.25) { const k = clamp((-0.25 - z) / 0.05); return SN.yb + (-0.028 - SN.yb) * Math.sqrt(Math.max(0, 1 - k * k)); }
  let i = 0; while (i < SN_H.length - 2 && z < SN_H[i + 1][0]) i++;
  const [z0, h0] = SN_H[i], [z1, h1] = SN_H[i + 1], t = clamp((z0 - z) / (z0 - z1));
  const m0 = i > 0 ? (SN_H[i + 1][1] - SN_H[i - 1][1]) / 2 : h1 - h0, m1 = i + 2 < SN_H.length ? (SN_H[i + 2][1] - h0) / 2 : h1 - h0;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * h0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * h1 + (t3 - t2) * m1;
}
const collarHW = (z: number) => 0.097 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(z - 0.016) / 0.114, 3)), 1 / 3);
function snHW(z: number, s: number) { const b = Math.max(0.001, footHW(z) - 0.005), t = Math.max(b, collarHW(z)); return b + (t - b) * Math.pow(clamp(s), 1.5); }
function snPoint(t: number, u: number): V {
  const z = SN.zH + (SN.zT - SN.zH) * t, H = snTop(z), be = PI * u, cb = Math.cos(be), sb = Math.sin(be), ex = 2 / SN.p;
  const s = Math.pow(Math.abs(sb), ex);
  return new V3(t < 1e-6 || t > 1 - 1e-6 ? 0 : -Math.sign(cb) * Math.pow(Math.abs(cb), ex) * snHW(z, s), SN.yb + (H - SN.yb) * s, z);
}
function snInside(p: V) {
  if (p.z > SN.zH || p.z < SN.zT) return false;
  const H = snTop(p.z), s = (p.y - SN.yb) / (H - SN.yb);
  if (s < 0 || s > 1) return false;
  return Math.pow(Math.abs(p.x) / snHW(p.z, s), SN.p) + Math.pow(s, SN.p) <= 1;
}
/** cast from an interior point along d to the upper's surface; normal by the numerical gradient */
function snCast(c: V, d: V): Hit {
  let lo = 0, hi = 0.35;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (snInside(c.clone().addScaledVector(d, m))) lo = m; else hi = m; }
  const p = c.clone().addScaledVector(d, lo), e = 0.002, n = new V3();
  for (let k = 0; k < 3; k++) { const o = new V3(); o.setComponent(k, e); n.setComponent(k, (snInside(p.clone().add(o)) ? 0 : 1) - (snInside(p.clone().sub(o)) ? 0 : 1)); }
  if (n.lengthSq() < 1e-9) n.copy(d);
  // refine the normal with a wider stencil (the inside test is binary)
  const ring: V[] = []; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const tt = frameZ(n); ring.push(snCastQuick(c, p.clone().addScaledVector(tt.x, dx * 0.006).addScaledVector(tt.y, dy * 0.006).sub(c).normalize())); }
  const nn = new V3().crossVectors(ring[0].clone().sub(ring[1]), ring[2].clone().sub(ring[3]));
  if (nn.dot(d) < 0) nn.negate();
  return { p, n: nn.lengthSq() > 1e-12 ? nn.normalize() : n.normalize() };
}
function snCastQuick(c: V, d: V) { let lo = 0, hi = 0.35; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (snInside(c.clone().addScaledVector(d, m))) lo = m; else hi = m; } return c.clone().addScaledVector(d, lo); }

function buildSneaker(out: Out, q: Q) {
  const up = slot(out, "ankleR", "sneaker", AO_NEUTRAL, 0.5), rub = slot(out, "ankleR", "rubber", AO_NEUTRAL, 0.8), det = slot(out, "ankleR", "detail"), gold = slot(out, "ankleR", "gold");
  // upper: one loft heel → toe (high-top collar + fat rounded toe box)
  const NR = q.hi ? 24 : 10, NS = q.hi ? 18 : 10;
  up.grid(NS, NR, (i, j) => { const t = 0.5 - 0.5 * Math.cos(PI * (j / NR)), p = snPoint(t, i / NS); return { p, c: [1, 1, 1], u: i / NS, v: t }; }, { out: (p) => new V3(p.x, p.y - SN.yb - 0.01, (p.z + 0.08) * 0.3) });
  // sole: thick cream rubber loft around the footprint (rounded edges, thin brown stripe, toe bumper) + tread bottom
  const M = q.hi ? 36 : 12, zc = (SN.zH + SN.zT) / 2, bL = (SN.zH - SN.zT) / 2;
  const outline = Array.from({ length: M + 1 }, (_, k) => { const ps = (k / M) * 2 * PI, z = zc - bL * Math.cos(ps), s = Math.sin(ps); return { x: Math.sign(s) * (footHW(z) + 0.004) * (Math.abs(s) < 1e-6 ? 0 : 1), z, ps }; });
  const onrm = outline.map((_, k) => { const a = outline[(k + M - 1) % M], b = outline[(k + 1) % M]; return new V3(b.z - a.z, 0, -(b.x - a.x)).normalize(); });
  const ytop = (ps: number) => -0.078 + 0.03 * Math.pow(Math.max(0, Math.cos(ps)), 8);
  const LV: Array<[(ps: number) => number, number, C3]> = q.hi
    ? [[() => -0.13, 0.011, PAL.soleDark], [() => -0.1272, 0.0035, PAL.soleDark], [() => -0.121, 0, PAL.sole], [() => -0.1012, 0, PAL.sole], [() => -0.1012, -0.0006, PAL.stripe], [() => -0.0962, -0.0006, PAL.stripe], [() => -0.0962, 0, PAL.sole], [(ps) => ytop(ps) - 0.007, 0, PAL.sole], [ytop, 0.007, PAL.sole]]
    : [[() => -0.13, 0.008, PAL.soleDark], [() => -0.122, 0, PAL.sole], [(ps) => ytop(ps) - 0.004, 0, PAL.sole], [ytop, 0.006, PAL.sole]];
  const nrmOut = (k: number) => onrm[k % M];
  rub.grid(M, LV.length - 1, (i, j) => { const o = outline[i], [yf, ins, colr] = LV[j], n = nrmOut(i); return { p: new V3(o.x - n.x * ins, yf(o.ps), o.z - n.z * ins), c: colr, u: 0.75, v: 0.5 }; }, { wrapU: true, out: (p) => new V3(p.x, 0, (p.z - zc) * 0.5) });
  // tread bottom (fan) — rubber map left half
  rub.flatUV();
  const cIdx = rub.vert(new V3(0, -0.13, zc), new V3(0, -1, 0), 0.25, 0.5, PAL.soleDark), ins0 = LV[0][1];
  const ring = outline.slice(0, M).map((o, k) => { const n = nrmOut(k), x = o.x - n.x * ins0, z = o.z - n.z * ins0; return rub.vert(new V3(x, -0.13, z), new V3(0, -1, 0), 0.25 + (x / 0.2) * 0.45, (z - SN.zT) / (SN.zH - SN.zT), PAL.soleDark); });
  for (let k = 0; k < M; k++) rub.tri(cIdx, ring[k], ring[(k + 1) % M]);
  const treadEnd = rub.count;
  if (!q.hi) { buildSneakerLo(up, rub); rub.flatUV(treadEnd); return; }
  // tongue: padded slab up the lace line, poking above the collar
  const tpts: V[] = [], tn: V[] = [];
  for (let k = 0; k <= 10; k++) { const z = lerp(-0.15, -0.035, k / 10), h = snCast(new V3(0, SN.yb + 0.02, z), new V3(0, 1, 0)); tpts.push(h.p.clone().addScaledVector(h.n, 0.004)); tn.push(h.n); }
  const tTop = tpts[tpts.length - 1].clone().add(new V3(0, 0.028, -0.004)), tTop2 = tTop.clone().add(new V3(0, 0.012, -0.008));
  tpts.push(tTop, tTop2); tn.push(new V3(0, 0.3, -1).normalize(), new V3(0, 0.3, -1).normalize());
  tube(up, tpts, (t) => (t > 0.9 ? 1 - (t - 0.9) * 4 : 1), 12, [1, 0.96, 0.86], { up: (t) => tn[Math.round(t * (tn.length - 1))], sx: 0.036, sy: 0.009, pw: 3.2, uv: () => [0.5, 0.2] });
  // eyelets + criss-cross chunky laces
  const NE = 5;
  const eyes: Hit[][] = [[], []];
  for (let k = 0; k < NE; k++) {
    const z = lerp(-0.145, -0.04, k / (NE - 1));
    for (const [si, s] of [[0, -1], [1, 1]] as const) { const h = snCast(new V3(s * 0.02, SN.yb + 0.03, z), new V3(s * 0.62, 1, 0).normalize()); eyes[si].push(h); const F = frameZ(h.n, new V3(0, 0, -1)); det.geo(new THREE.TorusGeometry(0.0085, 0.0028, 4, 8), BASIS(h.p.clone().addScaledVector(h.n, 0.0015), F.x, F.y, F.z), PAL.eyelet); }
  }
  const lace = (a: Hit, b: Hit) => {
    const m = a.p.clone().lerp(b.p, 0.5), mh = snCast(new V3(0, SN.yb + 0.02, m.z), new V3(0, 1, 0));
    const mid = mh.p.clone().addScaledVector(mh.n, 0.024);
    const pts = catmull([a.p.clone().addScaledVector(a.n, 0.003), a.p.clone().lerp(mid, 0.5).addScaledVector(mh.n, 0.008), mid, b.p.clone().lerp(mid, 0.5).addScaledVector(mh.n, 0.008), b.p.clone().addScaledVector(b.n, 0.003)], 8);
    // fat flat laces (thin ones are unreadable at 1440p)
    tube(rub, pts, (t) => 0.0052 + 0.0012 * Math.sin(PI * t), 5, PAL.lace, { up: mh.n, sx: 2.1, sy: 1, pw: 2.6, uv: () => [0.75, 0.5] });
  };
  for (let k = 0; k < NE - 1; k++) { lace(eyes[0][k], eyes[1][k + 1]); lace(eyes[1][k], eyes[0][k + 1]); }
  lace(eyes[0][0], eyes[1][0]);
  // ankle strap across the high top + buckle on the outer side
  const ys = 0.072, cS = new V3(0, ys, 0.03), spts: V[] = [], sn: V[] = [];
  for (let k = 0; k <= 26; k++) {
    const ph = lerp(-1.95, 1.95, k / 26), d = new V3(Math.sin(ph), 0, -Math.cos(ph)), h = snCast(cS, d);
    const over = Math.max(0, 1 - Math.abs(ph) / 0.5) * 0.024;
    spts.push(h.p.clone().addScaledVector(h.n, 0.004 + over)); sn.push(h.n);
  }
  tube(up, spts, () => 1, 8, (t) => [0.97, 0.94, 0.9].map((c) => c * (0.95 + 0.05 * Math.sin(PI * t))) as C3, { up: (t) => sn[Math.round(t * 26)], sx: 0.018, sy: 0.0042, pw: 5, uv: (t) => [0.5, 0.15 + t * 0.1] });
  {
    const k = 23, p = spts[k], n = sn[k], F = frameZ(n);
    for (const [ox, oy, w, h] of [[0, 0.019, 0.042, 0.007], [0, -0.019, 0.042, 0.007], [0.018, 0, 0.007, 0.045], [-0.018, 0, 0.007, 0.045]] as const)
      gold.geo(new RoundedBoxGeometry(w, h, 0.008, 1, 0.0025), BASIS(p.clone().addScaledVector(F.x, ox).addScaledVector(F.y, oy).addScaledVector(n, 0.004), F.x, F.y, F.z), [1, 1, 1]);
    gold.geo(new RoundedBoxGeometry(0.004, 0.036, 0.006, 1, 0.0015), BASIS(p.clone().addScaledVector(n, 0.007), F.x, F.y, F.z), [1, 1, 1]);
  }
  // heel tab
  {
    const h = snCast(new V3(0, 0.1, 0.03), new V3(0, 0.15, 1).normalize()), F = frameZ(h.n);
    up.geo(new RoundedBoxGeometry(0.044, 0.06, 0.014, 2, 0.006), BASIS(h.p.clone().addScaledVector(h.n, 0.004).add(new V3(0, 0.024, 0)), F.x, F.y, F.z), [1, 0.97, 0.9], [1, 1], () => [0.5, 0.12]);
  }
  // white star on BOTH ankle sides (like the classic high-top's ankle patch: whichever side the camera sees, it reads)
  for (const sx of [1, -1]) {
    const h = snCast(new V3(0, 0.012, 0.0), new V3(sx, 0, 0)), F = frameZ(h.n);
    const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = PI / 2 + (i * PI) / 5, r = i % 2 === 0 ? 0.033 : 0.0145; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.0025, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 1 });
    rub.geo(g, BASIS(h.p.clone().addScaledVector(h.n, -0.0005), F.x, F.y, F.z), PAL.starC, [1, 1], () => [0.75, 0.5]);
  }
  rub.flatUV(treadEnd);
}
function buildSneakerLo(up: MB, rub: MB) {
  // tongue hint + two lace bars
  for (const z of [-0.12, -0.07]) {
    const a = snCast(new V3(-0.02, SN.yb + 0.03, z), new V3(-0.6, 1, 0).normalize()), b = snCast(new V3(0.02, SN.yb + 0.03, z), new V3(0.6, 1, 0).normalize());
    tube(rub, [a.p, a.p.clone().lerp(b.p, 0.5).add(new V3(0, 0.012, 0)), b.p], () => 0.005, 4, PAL.lace, { sx: 2, uv: () => [0.75, 0.5] });
  }
  void up;
}

// ================================================================================================ assembly
export function buildKongParts(detail: "hi" | "lo" = "hi"): KongParts {
  const q = detail === "hi" ? QHI : QLO;
  PETALS = 0;
  const out: Out = new Map();
  buildHead(out, q);
  buildTorso(out, q);
  buildShorts(out, q);
  buildLegTube(out, q);
  buildLegs(out, q);
  buildArms(out, q);
  buildSneaker(out, q);
  const parts: PartGeo[] = [];
  let tris = 0;
  for (const { bone, mat, mb } of out.values()) {
    if (!mb.count) continue;
    if (mat === "rubber" && bone !== "ankleR") mb.flatUV();
    if (bone === "head") mb.scale(HS); else if (bone === "wristR") mb.scale(FS); else if (bone === "ankleR") mb.scale(SS).lift(SS_LIFT);
    bakeAO(mb, bone);
    parts.push({ bone, mat, geo: mb.build() }); tris += mb.tris;
    if (bone.endsWith("R")) { const m = mb.mirrored(); parts.push({ bone: bone.replace(/R$/, "L") as BoneName, mat, geo: m.build() }); tris += m.tris; }
  }
  return { parts, tris: Math.round(tris), petals: PETALS * (1 + 0) };
}

// ================================================================================================ far LOD
/** ~1.5k-tri kong for 40–200 m (one vertex-coloured material): the same volumes as the hi/lo body, no fur petals */
export function buildKongMin(): KongParts {
  const out: Out = new Map();
  // (distant pilots read as black blocks — the far body carries the lit-tip value, not the crevice mix)
  const FUR = mix(PAL.furMid, PAL.furTip, 0.4), SKIN = PAL.skin, RED = hexC("#a63a22"), YEL = hexC("#f4d01c"), PEEL = hexC("#f4d024");
  const skinC = (_p: V, n: V): C3 => mix(PAL.skin, PAL.skinShade, clamp(0.3 - n.y * 0.4));
  const E = (bone: BoneName, c: P3, r: P3, colr: C3 | ((p: V, n: V) => C3), seg = 8, e: P3 = [0, 0, 0]) => ellMesh(slot(out, bone, "min", AO_NEUTRAL, 0.8), c, r, seg, colr, e);
  const C = (bone: BoneName, S: Cap, colr: C3, seg = 7, rings = 5) => capMesh(slot(out, bone, "min", AO_NEUTRAL, 0.8), S, seg, rings, colr);
  // head (built at design size, scaled by HS like the hi head)
  E("head", HEAD.skull.c, HEAD.skull.r, FUR, 9);
  E("head", HEAD.muzzle.c, HEAD.muzzle.r, skinC, 9);
  E("head", HEAD.chin.c, HEAD.chin.r, skinC, 7);
  for (const s of [-1, 1]) {
    E("head", [s * HEAD.mask.c[0], HEAD.mask.c[1], HEAD.mask.c[2]], HEAD.mask.r, SKIN, 6);
    E("head", [s * HEAD.ear[0], HEAD.ear[1], HEAD.ear[2]], [0.024, 0.054, 0.046], SKIN, 6);
    E("head", [s * 0.085, 0.308, -0.215], [0.075, 0.024, 0.032], PAL.brow, 6, [0, 0, s * 0.28]);
  }
  E("head", [0, 0.108, -0.322], [0.155, 0.032, 0.03], PAL.white, 8);
  E("head", [0, 0.07, -0.318], [0.12, 0.018, 0.024], PAL.mouth, 6);
  for (const s of [-1, 1]) { E("head", [s * HEAD.eye.c[0], HEAD.eye.c[1], HEAD.eye.c[2] - 0.004], HEAD.eye.r, PAL.eyeWhite, 6); E("head", [s * (HEAD.eye.c[0] + 0.004), HEAD.eye.c[1] - 0.004, HEAD.eye.c[2] - 0.05], [0.026, 0.028, 0.01], PAL.iris, 5); }
  // torso
  E("chest", CHEST.mass.c, CHEST.mass.r, FUR, 10);
  E("chest", CHEST.trap.c, CHEST.trap.r, FUR, 8);
  E("chest", CHEST.plate.c, CHEST.plate.r, skinC, 9);
  E("chest", [0, 0.03, 0.39], [0.16, 0.18, 0.08], hexC("#eec433"), 6);
  E("spine", SPINE.fur.c, SPINE.fur.r, FUR, 9);
  E("spine", SPINE.belly.c, SPINE.belly.r, skinC, 8);
  // shorts + legs
  E("hips", [0, -0.03, 0.01], [0.36, 0.2, 0.29], RED, 10);
  C("hipR", new Cap(new V3(0.012, 0.05, 0), new V3(0.012 + 0.057 * SHORT_LEG.hem, -SHORT_LEG.hem, -0.057 * SHORT_LEG.hem), SHORT_LEG.r, SHORT_LEG.r - 0.01), RED, 8, 4);
  C("kneeR", new Cap(new V3(0, 0.02, 0), v3(CALF.end), CALF.ra, CALF.rb), FUR, 7, 4);
  E("ankleR", [0, -0.03, -0.075], [0.105, 0.085, 0.215], YEL, 8);
  E("ankleR", [0, -0.11, -0.08], [0.11, 0.028, 0.225], PAL.sole, 8);
  // arms
  C("shoulderR", new Cap(new V3(0.02, 0, 0), v3(BONES.elbowR.offset), ARM.ra, ARM.rb), FUR, 8, 5);
  C("elbowR", new Cap(new V3(0, 0, 0), v3(BONES.wristR.offset), FORE.ra, FORE.rb), FUR, 7, 4);
  { const W = v3(BONES.wristR.offset); E("elbowR", [W.x * 0.82, W.y * 0.82, W.z * 0.82], [FORE.rb + 0.03, 0.07, FORE.rb + 0.03], PEEL, 8); }
  E("wristR", [0, -0.1, -0.02], [0.105, 0.1, 0.105], skinC, 8);
  const parts: PartGeo[] = [];
  let tris = 0;
  for (const { bone, mat, mb } of out.values()) {
    if (bone === "head") mb.scale(HS); else if (bone === "wristR") mb.scale(FS); else if (bone === "ankleR") mb.scale(SS).lift(SS_LIFT);
    bakeAO(mb, bone);
    parts.push({ bone, mat, geo: mb.build() }); tris += mb.tris;
    if (bone.endsWith("R")) { const m = mb.mirrored(); parts.push({ bone: bone.replace(/R$/, "L") as BoneName, mat, geo: m.build() }); tris += m.tris; }
  }
  return { parts, tris: Math.round(tris), petals: 0 };
}
