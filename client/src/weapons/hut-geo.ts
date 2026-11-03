// Geometry kit for the stilt-hut set: merge bins (one draw call per material, per-piece vertex tint), world-scaled
// UVs (texture density is constant across boards, logs, crates), peeled logs with end-grain caps, bevelled boards,
// bamboo culms with node bulges, rope lashings. Everything returns indexed position/normal/uv geometry.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { rng } from "./lib/mats";

export type V3 = [number, number, number];
const TAU = Math.PI * 2;
const _c = new THREE.Color();

/** collects geometry for ONE material; build() merges it into a single mesh */
export class Bin {
  private list: THREE.BufferGeometry[] = [];
  constructor(readonly material: THREE.Material, readonly name: string, readonly shadows: { cast: boolean; receive: boolean } = { cast: true, receive: true }) {}
  add(g: THREE.BufferGeometry, m?: THREE.Matrix4, tint: THREE.ColorRepresentation = 0xffffff): this {
    let geo = g.index ? g.clone() : mergeVertices(g.clone(), 1e-6);
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.index) geo = mergeVertices(geo, 1e-6);
    geo.clearGroups();
    if (m) geo.applyMatrix4(m);
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    _c.set(tint);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.list.push(geo);
    return this;
  }
  get count() { return this.list.length; }
  build(): THREE.Mesh | null {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false);
    if (!g) return null;
    g.computeBoundingSphere(); g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.name = this.name; mesh.castShadow = this.shadows.cast; mesh.receiveShadow = this.shadows.receive;
    mesh.userData.castShadow = this.shadows.cast;
    this.list.length = 0;
    return mesh;
  }
}

/** world-metre UVs for a box-ish geometry: grain (u) along `long` axis; per-face planar projection. `off` shifts
 *  the pattern per piece so neighbours never repeat. */
export function uvBox(g: THREE.BufferGeometry, long: "x" | "y" | "z", scale = 1, off: [number, number] = [0, 0]): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  const ax = { x: 0, y: 1, z: 2 } as const;
  const L = ax[long];
  for (let i = 0; i < p.count; i++) {
    const P = [p.getX(i), p.getY(i), p.getZ(i)], N = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))];
    const dom = N[0] > N[1] ? (N[0] > N[2] ? 0 : 2) : (N[1] > N[2] ? 1 : 2);
    let u: number, v: number;
    if (dom === L) { const o = [0, 1, 2].filter((k) => k !== L); u = P[o[0]]; v = P[o[1]]; }
    else { const o = [0, 1, 2].find((k) => k !== L && k !== dom)!; u = P[L]; v = P[o] + (dom === 0 ? 0.37 : dom === 1 ? 0.71 : 0.13); }
    uv[i * 2] = u * scale + off[0]; uv[i * 2 + 1] = v * scale + off[1];
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** bevelled board w×h×d centred, grain along its longest axis, world UVs */
export function board(w: number, h: number, d: number, bevel = 0.012, seed = 1): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(bevel, w / 2.05, h / 2.05, d / 2.05));
  const long = w >= h && w >= d ? "x" : h >= d ? "y" : "z";
  const r = rng(seed);
  return uvBox(g, long, 1, [r() * 4, r() * 4]);
}

/** peeled log from a to b: slightly irregular radius, lengthwise grain (u along length in metres, v around).
 *  Returns side + the two end caps (end-grain disc UVs 0..1) separately. */
export function logGeo(a: V3, b: V3, r0: number, o: { seg?: number; wobble?: number; seed?: number; taper?: number; caps?: boolean } = {}): { side: THREE.BufferGeometry; caps: THREE.BufferGeometry | null } {
  const { seg = 18, wobble = 0.06, seed = 1, taper = 0.06, caps = true } = o;
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const rows = Math.max(3, Math.ceil(len / 0.25) + 1);
  const r = rng(seed);
  const ph = [r() * 6, r() * 6, r() * 6], su = r() * 5, sv = r();
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const rad = (t: number, th: number) => r0 * (1 - taper * t) * (1 + wobble * (0.5 * Math.sin(th * 3 + ph[0] + t * 2) + 0.3 * Math.sin(th * 5 + ph[1]) + 0.4 * Math.sin(t * 7 + ph[2])));
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * TAU, rr = rad(t, th);
      pos.push(rr * Math.cos(th), t * len, rr * Math.sin(th));
      uv.push(t * len + su, (j / seg) * TAU * r0 * 1.2 + sv);
    }
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < seg; j++) {
    const k = i * (seg + 1) + j;
    idx.push(k, k + seg + 1, k + 1, k + 1, k + seg + 1, k + seg + 2);
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  side.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  side.setIndex(idx); side.computeVertexNormals();
  // weld the seam normals
  const nn = side.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < rows; i++) { const k0 = i * (seg + 1), k1 = k0 + seg; const x = nn.getX(k0) + nn.getX(k1), y = nn.getY(k0) + nn.getY(k1), z = nn.getZ(k0) + nn.getZ(k1), l = Math.hypot(x, y, z) || 1; nn.setXYZ(k0, x / l, y / l, z / l); nn.setXYZ(k1, x / l, y / l, z / l); }
  let capG: THREE.BufferGeometry | null = null;
  if (caps) {
    const cp: number[] = [], cu: number[] = [], ci: number[] = [];
    for (const end of [0, 1]) {
      const base = cp.length / 3, y = end * len;
      cp.push(0, y, 0); cu.push(0.5, 0.5);
      for (let j = 0; j <= seg; j++) { const th = (j / seg) * TAU, rr = rad(end, th) * 0.995; cp.push(rr * Math.cos(th), y, rr * Math.sin(th)); cu.push(0.5 + 0.5 * Math.cos(th) * 0.98, 0.5 + 0.5 * Math.sin(th) * 0.98); }
      for (let j = 0; j < seg; j++) { if (end) ci.push(base, base + j + 2, base + j + 1); else ci.push(base, base + j + 1, base + j + 2); }
    }
    capG = new THREE.BufferGeometry();
    capG.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
    capG.setAttribute("uv", new THREE.Float32BufferAttribute(cu, 2));
    capG.setIndex(ci); capG.computeVertexNormals();
  }
  const m = alignTo(A, B);
  side.applyMatrix4(m); capG?.applyMatrix4(m);
  return { side, caps: capG };
}

/** matrix mapping +Y (0..len) onto the segment a→b */
export function alignTo(A: THREE.Vector3, B: THREE.Vector3, roll = 0): THREE.Matrix4 {
  const d = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  return new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1));
}

/** bamboo culm a→b with node bulges every `node` m; UV v = internode index (texture tile = one internode) */
export function bambooGeo(a: V3, b: V3, r: number, node = 0.42, seg = 14, seed = 1): THREE.BufferGeometry {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const rr = rng(seed), off = rr() * node;
  // profile samples: dense near nodes
  const ys: number[] = [0];
  for (let y = off; y < len; y += node) { for (const d of [-0.03, -0.012, 0, 0.012, 0.03]) { const yy = y + d; if (yy > 0 && yy < len) ys.push(yy); } }
  ys.push(len); ys.sort((p, q) => p - q);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    // distance to the nearest node → ring bulge
    const k = Math.round((y - off) / node), dn = Math.abs(y - (off + k * node));
    const bulge = dn < 0.03 ? 1 + 0.07 * Math.cos((dn / 0.03) * Math.PI * 0.5) : 1;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * TAU;
      pos.push(r * bulge * Math.cos(th), y, r * bulge * Math.sin(th));
      uv.push(j / seg * 2, (y - off) / node + 0.5);
    }
  }
  for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < seg; j++) { const k = i * (seg + 1) + j; idx.push(k, k + seg + 1, k + 1, k + 1, k + seg + 1, k + seg + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.applyMatrix4(alignTo(A, B));
  return g;
}

/** rope lashing: a few tight helical wraps around a cylinder axis (centre c, axis dir, radius r) */
export function lashing(c: V3, dir: V3, r: number, turns = 4, rope = 0.016, pitch = 0.034): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = turns * 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n, th = t * turns * TAU;
    pts.push(new THREE.Vector3((r + rope * 0.7) * Math.cos(th), (t - 0.5) * turns * pitch, (r + rope * 0.7) * Math.sin(th)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, n * 2, rope, 7, false);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const L = curve.getLength();
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (L / 0.035), uv.getY(i));
  const C = new THREE.Vector3(...c), D = new THREE.Vector3(...dir).normalize();
  g.applyMatrix4(new THREE.Matrix4().compose(C, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), D), new THREE.Vector3(1, 1, 1)));
  return g;
}

/** tube rope along points (u scaled so the strand normal map repeats every 3.5 cm) */
export function ropeTube(points: THREE.Vector3[], radius: number, closed = false, radial = 7): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal", 0.5);
  const len = curve.getLength();
  const g = new THREE.TubeGeometry(curve, Math.max(8, Math.round(len / (radius * 1.2))), radius, radial, closed);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 0.035), uv.getY(i));
  return g;
}

export function tf(p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: number | V3 = 1): THREE.Matrix4 {
  const sc = typeof s === "number" ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), sc);
}

/** planar top-down UVs in metres (sand, water beds, decks) */
export function uvPlanarY(g: THREE.BufferGeometry, scale = 1): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * scale; uv[i * 2 + 1] = p.getZ(i) * scale; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
