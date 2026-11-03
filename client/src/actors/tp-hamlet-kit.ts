// Geometry kit for the char-05 thatched hamlet (tp-hamlet.ts). Everything is built in the hamlet's LOCAL frame
// (+X = camera-right, −Z = away from the camera, y = world height) and collected into per-material `Bin`s that merge
// into one static mesh each. Timber pieces are built with their LENGTH along the primitive's Y so the grain texture
// (along V) always follows the wood. Layered thatch is real geometry: overlapping wedge-shaped tiers with ragged butt
// edges (gable roofs + cones), so the roofs read as bundled straw courses from any angle.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { boxGeo, chamferBoxGeo, cylGeo } from "../world/pois/_kit/town-geo";

export type V3 = THREE.Vector3;
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);

/** deterministic PRNG shared by the builders (reseed per build for stable layouts) */
let seedState = 1;
export function reseed(s: number) { seedState = s >>> 0 || 1; }
export function rnd(): number {
  seedState = (seedState + 0x6d2b79f5) >>> 0; let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const jit = (a: number) => (rnd() * 2 - 1) * a;

// ------------------------------------------------------------------------------------------------ colours
export const C = {
  wood: "#917557", woodDark: "#6f5943", woodGrey: "#8c8272", woodWarm: "#9a7550", plank: "#a08467",
  red: "#b8412f", redDark: "#7e2a1f", yellow: "#eab522", blue: "#3f74c2", teal: "#2ea4a2", green: "#9fbf3a",
  window: "#17110c", rope: "#ffffff", straw: "#ffffff",
};

// ------------------------------------------------------------------------------------------------ merge bins
/** collects geometry for ONE material; vertex colours multiply (existing colour attr × tint) */
export class Bin {
  private geos: THREE.BufferGeometry[] = [];
  tris = 0;
  constructor(readonly name: string, readonly material: THREE.Material, readonly shadows = true, readonly uv = true) {}
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4 | null, color: THREE.ColorRepresentation = 0xffffff) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count, c = new THREE.Color(color), src = g.attributes.color as THREE.BufferAttribute | undefined;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r * (src ? src.getX(i) : 1); arr[i * 3 + 1] = c.g * (src ? src.getY(i) : 1); arr[i * 3 + 2] = c.b * (src ? src.getZ(i) : 1);
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    if (!this.uv) g.deleteAttribute("uv"); else if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    this.tris += n / 3;
    this.geos.push(g);
  }
  build(post?: (g: THREE.BufferGeometry) => void): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    this.geos = [];
    if (!merged) return null;
    post?.(merged);
    merged.computeBoundingSphere(); merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.name = this.name; mesh.castShadow = this.shadows; mesh.receiveShadow = true;
    return mesh;
  }
}

export interface HBins { timber: Bin; paint: Bin; thatch: Bin; rope: Bin; rock: Bin; fruit: Bin; cloth: Bin; decal: Bin }

// ------------------------------------------------------------------------------------------------ placement
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** matrix that maps a Y-aligned primitive (centred) onto the segment a→b; its X axis stays level (horizontal) */
export function spanMatrix(a: V3, b: V3, roll = 0): THREE.Matrix4 {
  _y.subVectors(b, a).normalize();
  if (Math.abs(_y.y) > 0.999) _x.set(Math.cos(roll), 0, -Math.sin(roll));
  else { _x.crossVectors(UP, _y).normalize(); if (roll) _x.applyAxisAngle(_y, roll); }
  _z.crossVectors(_x, _y).normalize();
  return new THREE.Matrix4().makeBasis(_x, _y, _z).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
/** local TRS matrix (yaw about Y) */
export function at(x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(sx, sy, sz));
}
export const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => a.clone().multiply(b);

// ------------------------------------------------------------------------------------------------ timber primitives
/** squared beam from a to b: `across` = horizontal thickness, `vert` = the other (≈vertical) thickness */
export function beam(bin: Bin, a: V3, b: V3, across: number, vert: number, color: THREE.ColorRepresentation = C.wood, bevel = 0.018, roll = 0) {
  const len = a.distanceTo(b);
  // thin members are plain boxes (12 vs 44 tris): the hamlet is only seen from 40–70 m, where a 2 cm bevel is sub-pixel
  // (bevelled, the timber cost 60k tris incl. the shadow pass)
  const g = Math.min(across, vert) < 0.18 ? boxGeo(across, len, vert, [rnd() * 3, rnd() * 3]) : chamferBoxGeo(across, len, vert, bevel, [rnd() * 3, rnd() * 3]);
  bin.add(g, spanMatrix(a, b, roll), tone(color, 0.1));
}
/** round log (slight taper) from a to b */
export function log(bin: Bin, a: V3, b: V3, r: number, color: THREE.ColorRepresentation = C.wood, seg = 9, taper = 0.9) {
  const len = a.distanceTo(b);
  // the hamlet is only ever seen from 40–70 m (char-05): 5–7 sided logs read round there (rounder, the timber cost 60k tris)
  const g = cylGeo(r * taper, r, len, Math.max(5, Math.round(seg * 0.7)));
  const uv = g.attributes.uv as THREE.BufferAttribute, du = rnd() * 3, dv = rnd() * 3;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
  bin.add(g, spanMatrix(a, b, rnd() * 6), tone(color, 0.1));
}
/** a colour with ±var brightness jitter */
export function tone(c: THREE.ColorRepresentation, v: number): THREE.Color { return new THREE.Color(c).multiplyScalar(1 + jit(v)); }

const ringCache = new Map<string, THREE.BufferGeometry>();
function ringGeo(R: number, t: number): THREE.BufferGeometry {
  const k = `${R.toFixed(3)}|${t.toFixed(3)}`;
  let g = ringCache.get(k);
  if (!g) { g = new THREE.TorusGeometry(R, t, 3, 7).rotateX(Math.PI / 2); ringCache.set(k, g); }
  return g;
}
/** rope lashing: a coiled band around a post/log of radius r at p (axis dir), with raised end turns */
export function lashing(rope: Bin, p: V3, dir: V3, r: number, h = 0.17) {
  const d = dir.clone().normalize();
  const a = p.clone().addScaledVector(d, -h / 2), b = p.clone().addScaledVector(d, h / 2);
  const R = r + 0.02;
  const g = cylGeo(R, R, h, 5, true, 1);
  const uv = g.attributes.uv as THREE.BufferAttribute, du = rnd();
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + du);
  rope.add(g, spanMatrix(a, b), tone(C.rope, 0.08));
  // one raised end turn (the top), not two (two cost 53k rope tris)
  rope.add(ringGeo(R + 0.004, 0.022), spanMatrix(b.clone().addScaledVector(d, -0.01), b.clone().addScaledVector(d, 0.01)), tone(C.rope, 0.06));
}
/** painted band on a log (e.g. the teal marker paint on some posts) */
export function paintBand(timber: Bin, a: V3, b: V3, r: number, color: THREE.ColorRepresentation) {
  timber.add(cylGeo(r + 0.009, r + 0.012, a.distanceTo(b), 10, true), spanMatrix(a, b), tone(color, 0.05));
}
/** sagging rope from a to b */
export function ropeLine(rope: Bin, a: V3, b: V3, sag = 0.1, r = 0.018) {
  const pts: V3[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0))); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 7, r, 3, false);
  const uv = g.attributes.uv as THREE.BufferAttribute, len = curve.getLength();
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.06, uv.getX(i) * len);
  rope.add(g, null, tone(C.rope, 0.05));
}

// ------------------------------------------------------------------------------------------------ decks / walkways
export interface DeckOpts {
  /** ground height sampler (local x,z → world y) */
  ground: (x: number, z: number) => number;
  railL?: boolean; railR?: boolean;          // railing on the left / right of a→b
  posts?: boolean;                           // stilts down to the ground (default true)
  braceL?: boolean; braceR?: boolean;        // X-bracing between stilts on that side
  step?: number;                             // stilt station spacing (m)
  teal?: number;                             // probability a stilt carries a teal paint band
  postR?: number;
  startPost?: boolean; endPost?: boolean;    // stations at the very ends (default true)
  plankW?: number;
  railH?: number;
}
/**
 * Plank boardwalk / platform between centre-line points a→b (deck TOP at a.y — a and b share y), width W. Planks run
 * ACROSS the walk, on two stringers, on cross bearers at each stilt station; log stilts (extending up as railing posts on
 * railed sides), rope lashings at every joint, X-braces + mid girts on chosen sides, post-and-rail railings.
 */
export function deckStrip(B: HBins, a: V3, b: V3, W: number, o: DeckOpts) {
  const y = a.y, dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z), L = dir.length(); dir.normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);            // right of a→b
  const P = (s: number, t: number, yy: number) => new THREE.Vector3(a.x + dir.x * s + perp.x * t, yy, a.z + dir.z * s + perp.z * t);
  const pw = o.plankW ?? 0.24, gap = 0.022, pt = 0.055;
  // planks
  const n = Math.max(1, Math.floor((L + gap) / (pw + gap)));
  const s0 = (L - (n * (pw + gap) - gap)) / 2;
  for (let i = 0; i < n; i++) {
    const s = s0 + i * (pw + gap) + pw / 2 + jit(0.008), ext = W / 2 + 0.04 + rnd() * 0.08, off = jit(0.05);
    const yaw = jit(0.012);
    const c = P(s, off, y - pt / 2 + jit(0.006));
    const e = perp.clone().applyAxisAngle(UP, yaw);
    beam(B.timber, c.clone().addScaledVector(e, -ext), c.clone().addScaledVector(e, ext), pw, pt, rnd() < 0.15 ? C.woodGrey : C.plank, 0.012);
  }
  // stringers
  const st = 0.2;
  for (const t of [-W / 2 + 0.14, W / 2 - 0.14]) beam(B.timber, P(-0.05, t, y - pt - st / 2), P(L + 0.05, t, y - pt - st / 2), 0.12, st, C.woodDark);
  // stations
  const step = o.step ?? 2.2, ns = Math.max(1, Math.round(L / step));
  const postR = o.postR ?? 0.13, railH = o.railH ?? 1.0;
  const bearerY = y - pt - st - 0.09;
  const stations: number[] = [];
  for (let i = 0; i <= ns; i++) {
    if (i === 0 && o.startPost === false) continue;
    if (i === ns && o.endPost === false) continue;
    stations.push(Math.min(L - 0.12, Math.max(0.12, (L * i) / ns)));
  }
  const postTop = (side: number) => (side < 0 ? o.railL : o.railR) ? y + railH + 0.12 : bearerY - 0.02;
  const stilts: Array<{ s: number; side: number; base: number; top: number }> = [];
  for (const s of stations) {
    beam(B.timber, P(s, -W / 2 - 0.22, bearerY), P(s, W / 2 + 0.22, bearerY), 0.14, 0.18, C.woodDark);
    for (const side of [-1, 1]) {
      const t = side * (W / 2 + 0.02 + postR * 0.6);
      const p0 = P(s, t, 0), gy = o.ground(p0.x, p0.z);
      const hasPost = o.posts !== false && y - gy > 0.4;
      const railed = side < 0 ? o.railL : o.railR;
      if (!hasPost && !railed) continue;
      const base = hasPost ? gy - 0.3 : y - 0.25, top = postTop(side);
      log(B.timber, P(s, t, base), P(s, t, top), postR, rnd() < 0.3 ? C.woodGrey : C.woodDark);
      lashing(B.rope, P(s, t, bearerY), UP, postR * 0.95);
      if (railed) { lashing(B.rope, P(s, t, y + railH - 0.05), UP, postR * 0.9, 0.14); lashing(B.rope, P(s, t, y + 0.5), UP, postR * 0.92, 0.12); }
      if (hasPost && (o.teal ?? 0) > rnd()) paintBand(B.timber, P(s, t, gy + 0.35 + rnd() * 0.3), P(s, t, gy + 1.3 + rnd() * 0.6), postR * 0.97, C.teal);
      if (hasPost) stilts.push({ s, side, base: gy, top });
    }
  }
  // braces + girts between consecutive stilts on a side
  for (const side of [-1, 1]) {
    if (!(side < 0 ? o.braceL : o.braceR)) continue;
    const list = stilts.filter((q) => q.side === side).sort((p, q) => p.s - q.s);
    const t = side * (W / 2 + 0.02 + postR * 0.6) + side * (postR + 0.05);
    for (let i = 0; i + 1 < list.length; i++) {
      const A = list[i], Bq = list[i + 1];
      const lo = Math.max(A.base, Bq.base) + 0.45, hi = bearerY - 0.15;
      if (hi - lo < 1.1) continue;
      beam(B.timber, P(A.s, t, lo), P(Bq.s, t, hi), 0.09, 0.1, C.woodDark, 0.014);
      beam(B.timber, P(A.s, t, hi), P(Bq.s, t, lo), 0.09, 0.1, C.woodDark, 0.014);
      const mid = (lo + hi) / 2;
      beam(B.timber, P(A.s - 0.1, t + side * 0.07, mid), P(Bq.s + 0.1, t + side * 0.07, mid), 0.08, 0.1, C.wood, 0.014);
    }
  }
  // railings (top rail + mid rail between stations)
  for (const side of [-1, 1]) {
    if (!(side < 0 ? o.railL : o.railR)) continue;
    const t = side * (W / 2 + 0.02 + postR * 0.6) - side * (postR + 0.03);
    const s0r = stations[0] - 0.05, s1r = stations[stations.length - 1] + 0.05;
    beam(B.timber, P(s0r, t, y + railH), P(s1r, t, y + railH), 0.08, 0.09, C.wood, 0.02);
    beam(B.timber, P(s0r, t, y + 0.5), P(s1r, t, y + 0.5), 0.06, 0.07, C.wood, 0.015);
  }
}

/** timber stair flight from `top` (tread top at the upper deck) down to `bottom` (ground/landing), width W */
export function stairFlight(B: HBins, top: V3, bottom: V3, W: number, o: { railL?: boolean; railR?: boolean; ground?: (x: number, z: number) => number } = {}) {
  const d = new THREE.Vector3(bottom.x - top.x, 0, bottom.z - top.z), run = d.length(); d.normalize();
  const perp = new THREE.Vector3(-d.z, 0, d.x), drop = top.y - bottom.y;
  const n = Math.max(2, Math.round(drop / 0.22)), rise = drop / n, tread = run / n;
  const P = (s: number, t: number, yy: number) => new THREE.Vector3(top.x + d.x * s + perp.x * t, yy, top.z + d.z * s + perp.z * t);
  // stringers (sloped)
  for (const side of [-1, 1]) {
    const t = side * (W / 2 - 0.04);
    beam(B.timber, P(-0.15, t, top.y - 0.12), P(run + 0.1, t, bottom.y - 0.12), 0.08, 0.26, C.woodDark, 0.02);
  }
  // treads
  for (let i = 0; i < n - 1; i++) {
    const yy = top.y - rise * (i + 1) - 0.025, s = tread * (i + 1);
    const e = perp.clone().applyAxisAngle(UP, jit(0.02)), c = P(s + jit(0.01), jit(0.03), yy);
    beam(B.timber, c.clone().addScaledVector(e, -(W / 2 + 0.06)), c.clone().addScaledVector(e, W / 2 + 0.06), Math.min(0.3, tread + 0.04), 0.05, rnd() < 0.2 ? C.woodGrey : C.plank, 0.012);
  }
  // rails
  for (const side of [-1, 1]) {
    if (!(side < 0 ? o.railL : o.railR)) continue;
    const t = side * (W / 2 + 0.05);
    const sts = [0.15, run / 2, run - 0.1];
    for (const s of sts) {
      const ty = top.y - (s / run) * drop;
      const gy = o.ground ? Math.min(ty - 0.2, o.ground(P(s, t, 0).x, P(s, t, 0).z)) : ty - 0.35;
      log(B.timber, P(s, t, gy - 0.1), P(s, t, ty + 1.0), 0.06, C.woodDark);
      lashing(B.rope, P(s, t, ty + 0.9), UP, 0.06, 0.1);
    }
    beam(B.timber, P(0.1, t, top.y + 0.95), P(run - 0.05, t, bottom.y + 0.95), 0.07, 0.08, C.wood, 0.02);
  }
}

/** ladder from p0 (bottom) to p1 (top), rails spaced 0.5 m across `across` (unit, horizontal) */
export function ladder(B: HBins, p0: V3, p1: V3, across: V3) {
  const w = 0.26;
  for (const s of [-1, 1]) log(B.timber, p0.clone().addScaledVector(across, s * w), p1.clone().addScaledVector(across, s * w), 0.045, C.woodDark, 6);
  const L = p0.distanceTo(p1), n = Math.floor(L / 0.32);
  for (let i = 1; i <= n; i++) {
    const c = p0.clone().lerp(p1, i / (n + 0.5));
    log(B.timber, c.clone().addScaledVector(across, -w - 0.05), c.clone().addScaledVector(across, w + 0.05), 0.03, C.wood, 6);
  }
}

// ------------------------------------------------------------------------------------------------ walls
export interface Opening { u0: number; u1: number; v0: number; v1: number; door?: boolean }
/**
 * Plank wall in a wall frame (x along the wall −len/2…len/2, y up 0…h, z = outward), boards from the painted
 * clapboard texture (continuous across the pieces), with window/door openings: timber frames, sills, dark interior,
 * mullions, plank doors.
 */
export function wall(B: HBins, M: THREE.Matrix4, len: number, h: number, t: number, openings: Opening[], color: THREE.ColorRepresentation) {
  const col = tone(color, 0.05);
  const piece = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
    B.paint.add(chamferBoxGeo(x1 - x0, y1 - y0, t, 0.012, [x0 + len / 2, y0]), mul(M, at((x0 + x1) / 2, (y0 + y1) / 2, 0)), col);
  };
  const ops = [...openings].sort((p, q) => p.u0 - q.u0);
  let x = -len / 2;
  for (const op of ops) {
    piece(x, op.u0, 0, h);
    piece(op.u0, op.u1, 0, op.v0);
    piece(op.u0, op.u1, op.v1, h);
    x = op.u1;
    // frame
    const f = 0.08, fz = t / 2 + 0.02;
    const L = (px: number, py: number, pz = 0) => new THREE.Vector3(px, py, pz).applyMatrix4(M);
    beam(B.timber, L(op.u0 - f / 2, op.v0 - f, fz), L(op.u0 - f / 2, op.v1 + f, fz), f, 0.06, C.woodDark, 0.012);
    beam(B.timber, L(op.u1 + f / 2, op.v0 - f, fz), L(op.u1 + f / 2, op.v1 + f, fz), f, 0.06, C.woodDark, 0.012);
    beam(B.timber, L(op.u0 - f, op.v1 + f / 2, fz), L(op.u1 + f, op.v1 + f / 2, fz), 0.06, f, C.woodDark, 0.012);
    if (!op.door) {
      beam(B.timber, L(op.u0 - f - 0.05, op.v0 - f / 2, fz + 0.03), L(op.u1 + f + 0.05, op.v0 - f / 2, fz + 0.03), 0.14, 0.07, C.woodDark, 0.015); // sill
      // dark interior + mullion cross
      B.timber.add(chamferBoxGeo(op.u1 - op.u0 + 0.02, op.v1 - op.v0 + 0.02, 0.04, 0.005), mul(M, at((op.u0 + op.u1) / 2, (op.v0 + op.v1) / 2, -t / 2 + 0.03)), C.window);
      beam(B.timber, L((op.u0 + op.u1) / 2, op.v0, fz - 0.02), L((op.u0 + op.u1) / 2, op.v1, fz - 0.02), 0.045, 0.04, C.woodDark, 0.008);
      beam(B.timber, L(op.u0, (op.v0 + op.v1) / 2, fz - 0.02), L(op.u1, (op.v0 + op.v1) / 2, fz - 0.02), 0.04, 0.045, C.woodDark, 0.008);
    } else {
      // recessed plank door (vertical boards via the clapboard texture, dark stain) + Z brace
      B.paint.add(chamferBoxGeo(op.u1 - op.u0 + 0.02, op.v1 - op.v0, 0.05, 0.01, [0.3, 0]), mul(M, at((op.u0 + op.u1) / 2, (op.v0 + op.v1) / 2, -0.02)), C.redDark);
      beam(B.timber, L(op.u0 + 0.08, op.v0 + 0.35, 0.03), L(op.u1 - 0.08, op.v0 + 0.35, 0.03), 0.05, 0.1, C.woodDark, 0.01);
      beam(B.timber, L(op.u0 + 0.08, op.v1 - 0.35, 0.03), L(op.u1 - 0.08, op.v1 - 0.35, 0.03), 0.05, 0.1, C.woodDark, 0.01);
      beam(B.timber, L(op.u0 + 0.1, op.v0 + 0.4, 0.035), L(op.u1 - 0.1, op.v1 - 0.4, 0.035), 0.05, 0.09, C.woodDark, 0.01);
    }
  }
  piece(x, len / 2, 0, h);
}

// ------------------------------------------------------------------------------------------------ thatch
/** 1D value noise (deterministic by seed), 0..1 */
function n1(x: number, seed: number): number {
  const h = (i: number) => { let v = Math.imul((i | 0) ^ Math.imul(seed, 374761393), 668265263); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  return h(i) + (h(i + 1) - h(i)) * s;
}
/** ragged butt-edge offset along an edge coordinate x (metres): clumps + individual long straws */
const ragged = (x: number, seed: number, amp: number) => (n1(x * 3.1, seed) - 0.5) * amp * 1.2 + (n1(x * 11.7, seed + 9) - 0.5) * amp * 0.8 + (n1(x * 29, seed + 3) > 0.8 ? amp * 0.5 : 0);

interface TierSurf {
  /** plane point for (q, x): q = slant distance from the top edge, x = coordinate along the courses */
  plane: (q: number, x: number) => V3;
  /** outward normal of the plane at (q, x) */
  normal: (q: number, x: number) => V3;
  x0: number; x1: number; nx: number;
  /** wrap (closed ring along x) */
  closed?: boolean;
}
/**
 * One thatch tier (wedge course): top surface from qa (thin) to the ragged butt edge qb(x) (thickness T(x)), the butt
 * face down to the plane, and (open strips) verge faces at both x ends. Vertex colours carry AO: dark where the tier
 * tucks under the course above, bright toward the butt, darker butt faces.
 */
function thatchTier(bin: Bin, M: THREE.Matrix4 | null, S: TierSurf, qa: number, qb: number, T: number, seed: number, first: boolean) {
  const rows = 4, cols = S.nx;
  const pos: number[] = [], uv: number[] = [], colr: number[] = [], idx: number[] = [];
  const edgeQ: number[] = [], edgeT: number[] = [];
  for (let c = 0; c <= cols; c++) {
    const x = S.x0 + (S.x1 - S.x0) * (c / cols);
    const xs = S.closed && c === cols ? S.x0 : x;             // seamless ring: last column = first
    edgeQ.push(qb + ragged(xs * 1.0 + seed, seed, 0.13));
    edgeT.push(T * (0.75 + 0.5 * n1(xs * 2.3 + 5, seed + 1)));
  }
  const vert = (q: number, x: number, lift: number, u: number, v: number, ao: number) => {
    const p = S.plane(q, x).addScaledVector(S.normal(q, x), lift);
    pos.push(p.x, p.y, p.z); uv.push(u, v); colr.push(ao, ao, ao);
  };
  // top surface grid
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const x = S.x0 + (S.x1 - S.x0) * (c / cols), tq = r / rows;
    const q = qa + (edgeQ[c] - qa) * tq;
    const bulge = Math.sin(tq * Math.PI) * 0.035;
    const lift = (first ? 0.06 : 0.025) + (edgeT[c] - 0.025) * Math.pow(tq, 0.8) + bulge;
    const ao = 0.5 + 0.5 * THREE.MathUtils.smoothstep(tq, 0.0, 0.55);
    vert(q, x, lift, x, q + seed * 0.37, ao);
  }
  const W = cols + 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const a = r * W + c; idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1); }
  // butt face (from the top surface's lower edge down to just under the plane)
  const b0 = pos.length / 3;
  for (let c = 0; c <= cols; c++) {
    const x = S.x0 + (S.x1 - S.x0) * (c / cols), q = edgeQ[c];
    const top = edgeT[c] + 0.025;
    vert(q, x, top, x, 0.05 + seed, 0.72);
    vert(q + 0.02, x, -0.01, x, 0, 0.42);
  }
  for (let c = 0; c < cols; c++) { const a = b0 + c * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  // verge end caps (open strips only)
  if (!S.closed) for (const end of [0, cols]) {
    const x = S.x0 + (S.x1 - S.x0) * (end / cols), e0 = pos.length / 3;
    for (let r = 0; r <= rows; r++) {
      const tq = r / rows, q = qa + (edgeQ[end] - qa) * tq;
      const lift = (first ? 0.06 : 0.025) + (edgeT[end] - 0.025) * Math.pow(tq, 0.8) + Math.sin(tq * Math.PI) * 0.035;
      vert(q, x, lift, q, lift, 0.7); vert(q, x, -0.01, q, 0, 0.5);
    }
    for (let r = 0; r < rows; r++) { const a = e0 + r * 2; if (end === 0) idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); else idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  bin.add(g, M, tone(C.straw, 0.06));
}
export interface GableRoof { len: number; span: number; rise: number; eave: number; gable: number; tiers: number; T?: number; seed?: number }
/**
 * Layered thatch gable roof in a hut frame: ridge along X at y = rise (wall top = 0), eaves on ±Z. Tiers overlap
 * down the slope with thick ragged butt edges; an underside plane (dark) for the view from below; a bundled straw
 * ridge roll. Returns the plane helper (so callers can hang trim / poles on the verge).
 */
export function gableThatch(B: HBins, M: THREE.Matrix4, o: GableRoof) {
  const half = o.span / 2, pitch = o.rise / half, run = half + o.eave, sl = Math.hypot(1, pitch), Q = run * sl;
  const cs = 1 / sl, sn = pitch / sl, T = o.T ?? 0.2, seed = o.seed ?? 1;
  const x0 = -o.len / 2 - o.gable, x1 = o.len / 2 + o.gable, nx = Math.max(6, Math.ceil((x1 - x0) / 0.16));
  for (const side of [-1, 1]) {
    const S: TierSurf = {
      plane: (q, x) => new THREE.Vector3(x, o.rise - q * sn, side * q * cs),
      normal: () => new THREE.Vector3(0, cs, side * sn),
      x0: side > 0 ? x0 : x1, x1: side > 0 ? x1 : x0, nx,
    };
    for (let k = 0; k < o.tiers; k++) {
      const qa = k === 0 ? -0.05 : (Q * k) / o.tiers - 0.28, qb = (Q * (k + 1)) / o.tiers + (k === o.tiers - 1 ? 0.05 : 0);
      thatchTier(B.thatch, M, S, qa, qb, T * (k === o.tiers - 1 ? 1.25 : 1), seed * 13 + k * 7 + (side > 0 ? 0 : 50), k === 0);
    }
    // underside (soffit): the plane seen from below the eaves
    const g = new THREE.PlaneGeometry(x1 - x0, Q, 1, 1);
    g.translate((x0 + x1) / 2, -Q / 2, 0);                         // y ∈ [-Q, 0] → map to q = -y
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), q = -pos.getY(i);
      const p = S.plane(q, x).addScaledVector(S.normal(q, x), -0.015);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    if (nrm.getY(0) > 0) { g.index!.array.reverse(); g.computeVertexNormals(); }
    const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0), uv.getY(i) * Q);
    const cc = new Float32Array(pos.count * 3).fill(0.3); g.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    B.thatch.add(g, M, tone(C.straw, 0.02));
  }
  // ridge roll: a fat straw bundle along the ridge, bound with rope every ~0.7 m
  const rr = 0.2 + T * 0.4;
  const rg = cylGeo(rr, rr, x1 - x0 + 0.1, 12, false, 1);
  rg.rotateZ(Math.PI / 2);
  B.thatch.add(rg, mul(M, at(0, o.rise + T * 0.55, 0)), tone("#e8dcc0", 0.03));
  const nb = Math.max(2, Math.round((x1 - x0) / 0.75));
  for (let i = 0; i <= nb; i++) {
    const x = x0 + 0.1 + ((x1 - x0 - 0.2) * i) / nb;
    const c = new THREE.Vector3(x, o.rise + T * 0.55, 0).applyMatrix4(M), dx = new THREE.Vector3(1, 0, 0).transformDirection(M);
    lashing(B.rope, c, dx, rr, 0.09);
  }
  return {
    /** point on the roof surface (local hut frame) at slant q from the ridge on side ±1, x along the ridge */
    surf: (side: number, q: number, x: number, lift = T + 0.05) => new THREE.Vector3(x, o.rise - q * sn, side * q * cs).add(new THREE.Vector3(0, cs, side * sn).multiplyScalar(lift)),
    Q, x0, x1, sn, cs,
  };
}

export interface ConeRoof { r: number; h: number; tiers: number; T?: number; seed?: number; flare?: number; seg?: number }
/**
 * Layered round thatch roof (cone with a slight flared skirt): apex at y = h, eave radius r at y = 0 (in M's frame).
 * Tiers are closed rings with ragged butt edges; underside cone for the view from below; a straw top-knot + finial.
 */
export function coneThatch(B: HBins, M: THREE.Matrix4, o: ConeRoof) {
  const T = o.T ?? 0.2, seed = o.seed ?? 3, seg = o.seg ?? 30, flare = o.flare ?? 0.35;
  // generatrix t ∈ [0,1] apex → eave: r = R·t, y = h·(1−t) + kick (the outer skirt flattens = flared bell)
  const kick = (t: number) => flare * o.h * 1.5 * Math.max(0, t - 0.62) ** 2;
  const dkick = (t: number) => flare * o.h * 3 * Math.max(0, t - 0.62);
  const Q = Math.hypot(o.r, o.h);
  const S: TierSurf = {
    plane: (q, a) => { const t = Math.max(0, q / Q); return new THREE.Vector3(Math.cos(a) * o.r * t, o.h * (1 - t) + kick(t), Math.sin(a) * o.r * t); },
    normal: (q, a) => { const t = Math.max(0, q / Q); const nr = o.h - dkick(t), ny = o.r, l = Math.hypot(nr, ny); return new THREE.Vector3(Math.cos(a) * nr / l, ny / l, Math.sin(a) * nr / l); },
    x0: 0, x1: Math.PI * 2, nx: seg, closed: true,
  };
  for (let k = 0; k < o.tiers; k++) {
    const qa = k === 0 ? 0 : (Q * k) / o.tiers - 0.3, qb = (Q * (k + 1)) / o.tiers + (k === o.tiers - 1 ? 0.06 : 0);
    thatchTierRing(B.thatch, M, S, qa, qb, T * (k === o.tiers - 1 ? 1.3 : 1), seed * 11 + k * 5, k === 0, o.r);
  }
  // underside: the same generatrix just under the tiers, facing inward/down
  {
    const rows = 6, pos: number[] = [], idx: number[] = [], colr: number[] = [], uv: number[] = [];
    const qEnd = Q + 0.06;
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= seg; c++) {
      const a = (c / seg) * Math.PI * 2, q = (qEnd * r) / rows, p = S.plane(q, a).addScaledVector(S.normal(q, a), -0.02);
      pos.push(p.x, p.y, p.z); uv.push(a * 2, q); colr.push(0.3, 0.3, 0.3);
    }
    const W = seg + 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < seg; c++) { const a = r * W + c; idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1); }
    const ug = new THREE.BufferGeometry();
    ug.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); ug.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    ug.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3)); ug.setIndex(idx); ug.computeVertexNormals();
    B.thatch.add(ug, M, tone(C.straw, 0.02));
  }
  // top knot + finial
  const knot = new THREE.SphereGeometry(0.28, 10, 6); knot.scale(1, 0.8, 1);
  B.thatch.add(knot, mul(M, at(0, o.h + T * 0.9, 0)), tone("#ead9b0", 0.02));
  B.timber.add(cylGeo(0.05, 0.07, 0.7, 7), mul(M, at(0, o.h + T + 0.45, 0)), C.woodDark);
  B.timber.add(new THREE.SphereGeometry(0.09, 8, 6), mul(M, at(0, o.h + T + 0.82, 0)), C.woodDark);
}
/** ring tier: x = angle (radians), u = arc metres */
function thatchTierRing(bin: Bin, M: THREE.Matrix4, S: TierSurf, qa: number, qb: number, T: number, seed: number, first: boolean, R: number) {
  void R;
  const rows = 4, cols = S.nx;
  const pos: number[] = [], uv: number[] = [], colr: number[] = [], idx: number[] = [];
  const eq: number[] = [], et: number[] = [];
  for (let c = 0; c <= cols; c++) {
    const a = (c % cols) / cols * Math.PI * 2, xm = a * 2.2;
    eq.push(qb + ragged(xm + seed, seed, 0.14));
    et.push(T * (0.75 + 0.5 * n1(xm * 2.1 + 3, seed + 1)));
  }
  const put = (q: number, a: number, lift: number, u: number, v: number, ao: number) => {
    const p = S.plane(q, a).addScaledVector(S.normal(q, a), lift);
    pos.push(p.x, p.y, p.z); uv.push(u, v); colr.push(ao, ao, ao);
  };
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const a = (c / cols) * Math.PI * 2, tq = r / rows, q = qa + (eq[c] - qa) * tq;
    const lift = (first ? 0.06 : 0.025) + (et[c] - 0.025) * Math.pow(tq, 0.8) + Math.sin(tq * Math.PI) * 0.035;
    const pp = S.plane(q, a);
    put(q, a, lift, a * Math.max(0.3, Math.hypot(pp.x, pp.z)), q + seed * 0.3, 0.5 + 0.5 * THREE.MathUtils.smoothstep(tq, 0, 0.55));
  }
  const W = cols + 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const a = r * W + c; idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W); }
  const b0 = pos.length / 3;
  for (let c = 0; c <= cols; c++) {
    const a = (c / cols) * Math.PI * 2;
    const rr = Math.hypot(S.plane(eq[c], a).x, S.plane(eq[c], a).z);
    put(eq[c], a, et[c] + 0.025, a * rr, seed, 0.72); put(eq[c] + 0.02, a, -0.01, a * rr, 0, 0.42);
  }
  for (let c = 0; c < cols; c++) { const a = b0 + c * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  bin.add(g, M, tone(C.straw, 0.05));
}

// ------------------------------------------------------------------------------------------------ AO bake
export interface Occluder { x: number; z: number; yaw: number; hx: number; hz: number; y: number; k?: number }
/**
 * Bake ambient occlusion into a merged geometry's vertex colours (local frame): ground contact darkening, sky blocked
 * by decks / roofs above (edge-distance vs height), and downward-facing faces (only bounce light reaches them).
 */
export function bakeAO(g: THREE.BufferGeometry, ground: (x: number, z: number) => number, occ: Occluder[], o: { groundK?: number; groundH?: number; downK?: number } = {}) {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, col = g.attributes.color as THREE.BufferAttribute;
  const gk = o.groundK ?? 0.55, gh = o.groundH ?? 0.9, dk = o.downK ?? 0.4;
  const cs = occ.map((q) => [Math.cos(q.yaw), Math.sin(q.yaw)]);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let k = 1;
    const dy = y - ground(x, z);
    if (dy < gh) k *= gk + (1 - gk) * THREE.MathUtils.smoothstep(dy, -0.1, gh);
    for (let j = 0; j < occ.length; j++) {
      const q = occ[j]; const h = q.y - y; if (h <= 0.05) continue;
      const dx = x - q.x, dz = z - q.z, lx = dx * cs[j][0] - dz * cs[j][1], lz = dx * cs[j][1] + dz * cs[j][0];
      const edge = Math.min(q.hx - Math.abs(lx), q.hz - Math.abs(lz));      // >0 inside the footprint
      const cover = THREE.MathUtils.smoothstep(edge / Math.max(0.35, h * 0.7), -0.6, 1.0);
      k *= 1 - (q.k ?? 0.45) * cover;
    }
    const ny = nor.getY(i);
    if (ny < -0.2) k *= 1 - dk * Math.min(1, (-ny - 0.2) / 0.6);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
}
