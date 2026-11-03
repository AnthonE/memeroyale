// Geometry helpers for procedural plants: ribbons (leaves/fronds) and tubes (trunks/stems) along curves, plus the
// custom per-vertex attributes every foliage geometry carries:
//   color  (vec3)  — AO / tint multiplier
//   aBend  (float) — 0 rigid … 1 flutters freely in the wind (frond tips, leaf edges)
//   aPhase (float) — per-part random phase so leaves don't flutter in unison
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export interface Frame { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; n: THREE.Vector3; d: number }

const UP = new THREE.Vector3(0, 1, 0);

/**
 * sample a Catmull-Rom curve through `pts` into `segs+1` frames (point, tangent, side, normal, arc length).
 * The side vector starts horizontal (UP × tangent) and is then PARALLEL-TRANSPORTED along the curve (rotation-
 * minimising): tubes never twist their texture on near-vertical stems, leaf tips that droop past vertical never flip.
 */
export function curveFrames(pts: THREE.Vector3[], segs: number, tension = 0.5): Frame[] {
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", tension);
  const out: Frame[] = [];
  let d = 0;
  let prev: THREE.Vector3 | null = null;
  let sPrev: THREE.Vector3 | null = null;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPoint(u);
    const t = curve.getTangent(u).normalize();
    if (prev) d += p.distanceTo(prev);
    prev = p;
    let s: THREE.Vector3;
    if (!sPrev) {
      s = new THREE.Vector3().crossVectors(UP, t);
      if (s.lengthSq() < 1e-6) s.set(1, 0, 0).sub(t.clone().multiplyScalar(t.x));
    } else s = sPrev.clone().sub(t.clone().multiplyScalar(sPrev.dot(t)));
    if (s.lengthSq() < 1e-10) s = new THREE.Vector3().crossVectors(UP, t);
    s.normalize();
    sPrev = s;
    const n = new THREE.Vector3().crossVectors(t, s).normalize();
    out.push({ p, t, s, n, d });
  }
  return out;
}

export interface RibbonOpts {
  /** half-width at t (0..1 along the curve) */
  width: (t: number) => number;
  /** V-fold: edges drop by fold * halfwidth (0 flat, 0.5 strong V). May vary along t */
  fold?: (t: number) => number;
  /** cross segments (2 = flat quad strip, 4 = curled) */
  across?: number;
  /** curl the edges up (+) or down (−) as a fraction of halfwidth (edge lift ∝ |x|²) */
  curl?: (t: number) => number;
  /** twist (radians) along the length */
  twist?: (t: number) => number;
  /** uv rect [u0, v0, u1, v1] of the texture this strip maps to (u across, v along) */
  uv?: [number, number, number, number];
  bend?: (t: number) => number;
  color?: (t: number, u: number) => [number, number, number];
  phase?: number;
  /** flip the normal side (default: normal = frame.n, i.e. "up" of the leaf) */
  flip?: boolean;
}

/** strip of quads along the frames, across the side vector; leaf/frond/blade */
export function ribbon(frames: Frame[], o: RibbonOpts): THREE.BufferGeometry {
  const across = o.across ?? 2, uv = o.uv ?? [0, 0, 1, 1];
  const n = frames.length;
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], col: number[] = [], bend: number[] = [], phase: number[] = [], idx: number[] = [];
  const tmpS = new THREE.Vector3(), tmpN = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), f = frames[i];
    const hw = o.width(t), fold = o.fold?.(t) ?? 0, curl = o.curl?.(t) ?? 0, tw = o.twist?.(t) ?? 0;
    // twisted side/normal
    tmpS.copy(f.s).multiplyScalar(Math.cos(tw)).addScaledVector(f.n, Math.sin(tw));
    tmpN.copy(f.n).multiplyScalar(Math.cos(tw)).addScaledVector(f.s, -Math.sin(tw));
    for (let a = 0; a <= across; a++) {
      const u = a / across, x = u * 2 - 1;
      const lift = -fold * Math.abs(x) * hw + curl * x * x * hw;
      pos.push(f.p.x + tmpS.x * x * hw + tmpN.x * lift, f.p.y + tmpS.y * x * hw + tmpN.y * lift, f.p.z + tmpS.z * x * hw + tmpN.z * lift);
      nor.push(tmpN.x, tmpN.y, tmpN.z);
      uvs.push(uv[0] + (uv[2] - uv[0]) * u, uv[1] + (uv[3] - uv[1]) * t);
      const c = o.color?.(t, u) ?? [1, 1, 1];
      col.push(c[0], c[1], c[2]);
      bend.push(o.bend?.(t) ?? 0);
      phase.push(o.phase ?? 0);
    }
  }
  const stride = across + 1;
  for (let i = 0; i < n - 1; i++) for (let a = 0; a < across; a++) {
    const k = i * stride + a;
    if (o.flip) idx.push(k, k + stride, k + 1, k + 1, k + stride, k + stride + 1);
    else idx.push(k, k + 1, k + stride, k + 1, k + stride + 1, k + stride);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aBend", new THREE.Float32BufferAttribute(bend, 1));
  g.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
  g.setIndex(idx);
  if (o.fold || o.curl) g.computeVertexNormals();
  if (o.flip) { const na = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < na.count; i++) na.setXYZ(i, -na.getX(i), -na.getY(i), -na.getZ(i)); }
  return g;
}

export interface TubeOpts {
  /** radius at (t along, angle around) */
  radius: (t: number, ang: number) => number;
  radial?: number;
  /** v texture coordinate at t (default: arc length) */
  v?: (t: number, d: number) => number;
  /** u repeats around */
  uRepeat?: number;
  bend?: (t: number) => number;
  color?: (t: number, ang: number) => [number, number, number];
  phase?: number;
  capTop?: boolean;
}

/** tube along frames with a radius profile (trunks, stems, canes, roots) */
export function tube(frames: Frame[], o: TubeOpts): THREE.BufferGeometry {
  const radial = o.radial ?? 12, uRep = o.uRepeat ?? 1;
  const n = frames.length;
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], col: number[] = [], bend: number[] = [], phase: number[] = [], idx: number[] = [];
  const dir = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), f = frames[i];
    for (let a = 0; a <= radial; a++) {
      const ang = (a / radial) * Math.PI * 2;
      const r = o.radius(t, ang);
      dir.copy(f.s).multiplyScalar(Math.cos(ang)).addScaledVector(f.n, Math.sin(ang));
      pos.push(f.p.x + dir.x * r, f.p.y + dir.y * r, f.p.z + dir.z * r);
      nor.push(dir.x, dir.y, dir.z);
      uvs.push((a / radial) * uRep, o.v ? o.v(t, f.d) : f.d);
      const c = o.color?.(t, ang) ?? [1, 1, 1];
      col.push(c[0], c[1], c[2]);
      bend.push(o.bend?.(t) ?? 0);
      phase.push(o.phase ?? 0);
    }
  }
  // winding: counter-clockwise seen from OUTSIDE (the reverse order makes every tube inside-out: with a
  // single-sided bark material the renderer drew the trunk's FAR inner wall, whose world position sits in the trunk's
  // own sun shadow → trunks read dark red-brown whenever the sun was behind the camera, and the depth buffer held the
  // far wall). The frames' handedness (n = t × s) makes dir(ang) turn clockwise around t, hence this order.
  const stride = radial + 1;
  for (let i = 0; i < n - 1; i++) for (let a = 0; a < radial; a++) {
    const k = i * stride + a;
    idx.push(k, k + 1, k + stride, k + 1, k + stride + 1, k + stride);
  }
  if (o.capTop) {
    const f = frames[n - 1];
    const ci = pos.length / 3;
    pos.push(f.p.x, f.p.y, f.p.z); nor.push(f.t.x, f.t.y, f.t.z); uvs.push(0.5, f.d); col.push(1, 1, 1); bend.push(o.bend?.(1) ?? 0); phase.push(o.phase ?? 0);
    for (let a = 0; a < radial; a++) { const k = (n - 1) * stride + a; idx.push(k, k + 1, ci); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aBend", new THREE.Float32BufferAttribute(bend, 1));
  g.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** give any three.js geometry the foliage attribute set (color / aBend / aPhase) so it can be merged with ribbons & tubes */
export function finalize(g: THREE.BufferGeometry, o: { color?: [number, number, number] | ((i: number, p: THREE.Vector3) => [number, number, number]); bend?: number | ((i: number, p: THREE.Vector3) => number); phase?: number } = {}): THREE.BufferGeometry {
  if (g.index && g.attributes.position.count !== g.index.count) { /* keep indexed */ }
  const n = g.attributes.position.count;
  const p = new THREE.Vector3();
  if (!g.attributes.color) {
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, i);
      const c = typeof o.color === "function" ? o.color(i, p) : (o.color ?? [1, 1, 1]);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  if (!g.attributes.aBend) {
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, i);
      b[i] = typeof o.bend === "function" ? o.bend(i, p) : (o.bend ?? 0);
    }
    g.setAttribute("aBend", new THREE.BufferAttribute(b, 1));
  }
  if (!g.attributes.aPhase) g.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(n).fill(o.phase ?? 0), 1));
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color", "aBend", "aPhase"].includes(k)) g.deleteAttribute(k);
  return g;
}

/** merge geometries (all must carry the foliage attribute set) into one; drops groups */
export function mergeAll(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let list = gs.filter((g) => g.attributes.position.count > 0);
  if (!list.length) return new THREE.BufferGeometry();
  if (list.some((g) => !g.index)) list = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const m = mergeGeometries(list, false);
  if (!m) throw new Error("veg: merge failed (attribute mismatch)");
  m.computeBoundingSphere();
  m.computeBoundingBox();
  return m;
}


export const M = {
  from(pos: THREE.Vector3 | [number, number, number], yaw = 0, scale = 1, pitch = 0, roll = 0): THREE.Matrix4 {
    const p = Array.isArray(pos) ? new THREE.Vector3(...pos) : pos;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
    return new THREE.Matrix4().compose(p, q, new THREE.Vector3(scale, scale, scale));
  },
};

/** a single vertical quad card (used for leaves cards): width w, height h, pivot at the bottom centre, facing +Z */
export function card(w: number, h: number, o: { uv?: [number, number, number, number]; bend?: (v: number) => number; color?: [number, number, number]; phase?: number; segsY?: number } = {}): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 1, o.segsY ?? 2);
  g.translate(0, h / 2, 0);
  const uv = o.uv ?? [0, 0, 1, 1];
  const ua = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < ua.count; i++) ua.setXY(i, uv[0] + (uv[2] - uv[0]) * ua.getX(i), uv[1] + (uv[3] - uv[1]) * ua.getY(i));
  return finalize(g, { color: o.color, bend: (i, p) => o.bend?.(p.y / h) ?? 0, phase: o.phase });
}

export interface Card {
  /** card centre (object space) */
  c: THREE.Vector3;
  size: number;
  /** facing direction of the fixed (non-billboard) card + base of the bent normal */
  n: THREE.Vector3;
  /** AO / tint multiplier */
  col: [number, number, number];
  bend: number;
  phase: number;
  /** extra spherical bend of the corner normals (0 = flat card, 1 = strongly domed) */
  dome?: number;
  /** aspect w/h (default 1) */
  aspect?: number;
  /** two-card atlas half (0 = sprays, 1 = dense clump) — aAtlas */
  atlas?: number;
}


/** points evenly spread on a unit sphere (Fibonacci), optionally only those with y > minY */
export function fibSphere(n: number, minY = -1, jitter = 0, rnd?: () => number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    if (y < minY) continue;
    const rr = Math.sqrt(1 - y * y), th = i * 2.39996323;
    const v = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
    if (jitter && rnd) v.add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(jitter)).normalize();
    out.push(v);
  }
  return out;
}
