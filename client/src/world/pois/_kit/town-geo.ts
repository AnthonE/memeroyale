// poi-town geometry helpers: metre-UV primitives, a per-material merge bin (vertex-colour tinted), instancing helper.
import * as THREE from "three";
import type { Coplanar } from "./coplanar";

const _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _e = new THREE.Euler();
export const M = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 => {
  _e.set(pitch, yaw, roll, "YXZ"); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
};
export const col = (c: string | THREE.Color | number, k = 1): THREE.Color => new THREE.Color(c).multiplyScalar(k);

// ================================================================================================ detail mode (perf)
/** 1 = full detail; 0 = LOW detail — the far copy of a prop (TownLod `lo` tier): chamfered boxes become plain boxes,
 *  round things lose ~2/3 of their segments, pieces smaller than ~5 cm are dropped, individual fruit is not emitted
 *  (the heap mound carries it). Kits need no changes: build the same prop twice, the second time inside `lowDetail`. */
let DETAIL = 1;
/** 1 full · 0.5 medium (buildings seen from > ~15 m: plain boxes, ~60 % segments, no parts under 3 cm) · 0 low */
export const detail = () => DETAIL;
export function lowDetail<T>(fn: () => T): T { const d = DETAIL; DETAIL = 0; try { return fn(); } finally { DETAIL = d; } }
export function mediumDetail<T>(fn: () => T): T { const d = DETAIL; DETAIL = Math.min(d, 0.5); try { return fn(); } finally { DETAIL = d; } }
/** segment count for round geometry at the current detail */
export const segs = (n: number, min = 5) => DETAIL >= 1 ? n : DETAIL > 0 ? Math.max(min, Math.round(n * 0.6)) : Math.max(min, Math.round(n / 3));
/** pieces smaller than this (bounding radius, m) are dropped at the current detail */
const tinyR = () => DETAIL >= 1 ? 0 : DETAIL > 0 ? 0.03 : 0.05;

/** BoxGeometry whose UVs are in metres (u along width/depth, v along height) with a random tile offset */
export function boxGeo(w: number, h: number, d: number, uvOff: [number, number] = [0, 0], metres = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = dims[f];
    for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, (uv.getX(k) * fw + uvOff[0]) / metres, (uv.getY(k) * fh + uvOff[1]) / metres); }
  }
  g.userData.coBox = true;   // a box: GeoBin registers it with the coplanar resolver (_kit/coplanar.ts)
  return g;
}
/** CHAMFERED box (44 tris): every edge cut at 45° by `c` metres with smoothed edge normals, so edges catch a soft
 *  highlight like a real bevel (the #1 cue that separates stylized-AAA from "programmer art"). Metre UVs (box
 *  projection per face). Use for anything chunky: crates, posts, beams, sills, blocks, furniture, tanks' stands. */
export function chamferBoxGeo(w: number, h: number, d: number, c = 0.03, uvOff: [number, number] = [0, 0], metres = 1): THREE.BufferGeometry {
  if (DETAIL < 1) return boxGeo(w, h, d, uvOff, metres);
  c = Math.max(0.0005, Math.min(c, w * 0.45, h * 0.45, d * 0.45));
  const hx = w / 2, hy = h / 2, hz = d / 2;
  // three points per corner: on the X, Y and Z faces
  const P = (face: 0 | 1 | 2, sx: number, sy: number, sz: number): [number, number, number] =>
    face === 0 ? [sx * hx, sy * (hy - c), sz * (hz - c)] : face === 1 ? [sx * (hx - c), sy * hy, sz * (hz - c)] : [sx * (hx - c), sy * (hy - c), sz * hz];
  // INDEXED: 24 unique vertices (3 face normals × 8 corners) shared by the 44 triangles
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const cornerId = (sx: number, sy: number, sz: number) => ((sx > 0 ? 1 : 0) | (sy > 0 ? 2 : 0) | (sz > 0 ? 4 : 0));
  for (let fi = 0; fi < 3; fi++) for (let k = 0; k < 8; k++) {
    const face = fi as 0 | 1 | 2, sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1, sz = k & 4 ? 1 : -1;
    const p = P(face, sx, sy, sz);
    const n: [number, number, number] = face === 0 ? [sx, 0, 0] : face === 1 ? [0, sy, 0] : [0, 0, sz];
    const u = face === 0 ? -sx * p[2] : face === 1 ? p[0] : sz * p[0];
    const v = face === 1 ? -sy * p[2] : p[1];
    pos.push(...p); nor.push(...n);
    uv.push((u + (face === 1 ? hx : face === 0 ? hz : hx) + uvOff[0]) / metres, (v + (face === 1 ? hz : hy) + uvOff[1]) / metres);
  }
  const V = (face: number, sx: number, sy: number, sz: number) => face * 8 + cornerId(sx, sy, sz);
  const tri = (a: number, b: number, c: number) => {
    // orient outward: triangle normal must agree with the centroid direction
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az, vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = ax + pos[b * 3] + pos[c * 3], my = ay + pos[b * 3 + 1] + pos[c * 3 + 1], mz = az + pos[b * 3 + 2] + pos[c * 3 + 2];
    if (nx * mx + ny * my + nz * mz >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  const quad = (a: number, b: number, c: number, d: number) => { tri(a, b, c); tri(a, c, d); };
  const S = [-1, 1];
  // main faces
  for (const s of S) {
    quad(V(0, s, -1, -1), V(0, s, 1, -1), V(0, s, 1, 1), V(0, s, -1, 1));
    quad(V(1, -1, s, -1), V(1, 1, s, -1), V(1, 1, s, 1), V(1, -1, s, 1));
    quad(V(2, -1, -1, s), V(2, 1, -1, s), V(2, 1, 1, s), V(2, -1, 1, s));
  }
  // edge strips
  for (const a of S) for (const b of S) {
    quad(V(0, a, b, -1), V(0, a, b, 1), V(1, a, b, 1), V(1, a, b, -1)); // X–Y edges (along z)
    quad(V(0, a, -1, b), V(0, a, 1, b), V(2, a, 1, b), V(2, a, -1, b)); // X–Z edges (along y)
    quad(V(1, -1, a, b), V(1, 1, a, b), V(2, 1, a, b), V(2, -1, a, b)); // Y–Z edges (along x)
  }
  // corner triangles
  for (const sx of S) for (const sy of S) for (const sz of S) tri(V(0, sx, sy, sz), V(1, sx, sy, sz), V(2, sx, sy, sz));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.coBox = true;
  return g;
}
/** replace a geometry's UVs with world-metre box projection (dominant normal axis) — for lathes / custom shapes */
export function boxProjectUV(g: THREE.BufferGeometry, metres = 1, off: [number, number] = [0, 0]): THREE.BufferGeometry {
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = pos.getX(i); v = pos.getZ(i); } else if (ax >= az) { u = pos.getZ(i); v = pos.getY(i); } else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = (u + off[0]) / metres; uv[i * 2 + 1] = (v + off[1]) / metres;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
/** cylinder with metre UVs (u = circumference, v = height) */
export function cylGeo(rTop: number, rBot: number, h: number, seg = 24, open = false, metres = 1): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs(seg), 1, open);
  const uv = g.attributes.uv as THREE.BufferAttribute, circ = Math.PI * (rTop + rBot);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / metres, uv.getY(i) * h / metres);
  return g;
}
/** lathe from a profile [[r,y],...] with metre UVs */
export function latheGeo(profile: Array<[number, number]>, seg = 32, metres = 1): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs(seg));
  // arc length along the profile for v
  const arc: number[] = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const j = i % pts.length;
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    uv.setXY(i, uv.getX(i) * 2 * Math.PI * Math.max(r, 0.05) / metres, arc[j] / metres);
  }
  g.computeVertexNormals();
  return g;
}
/** plane in XZ (facing +Y) with metre UVs */
export function slabGeo(w: number, d: number, metres = 1, seg = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d, seg, seg);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / metres, uv.getY(i) * d / metres);
  return g;
}
/** flat disc in XZ (facing +Y) with world-metre UVs */
export function discGeo(r: number, seg = 64, metres = 1): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / metres, pos.getZ(i) / metres);
  return g;
}
/** flat polygon in XZ (facing +Y) from a closed outline, world-metre UVs */
export function polyGeo(pts: Array<[number, number]>, y: number, metres = 1): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / metres, pos.getZ(i) / metres);
  return g;
}
/** offset a closed XZ polygon outward (d > 0) using averaged edge normals (fine for smooth outlines) */
export function offsetPoly(pts: Array<[number, number]>, d: number): Array<[number, number]> {
  const n = pts.length, out: Array<[number, number]> = [];
  // orientation: positive signed area (in x,z) → normals to the right of travel point OUTWARD
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], c = pts[i], q = pts[(i + 1) % n];
    const e1 = [c[0] - p[0], c[1] - p[1]], e2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    const n1 = [e1[1] / l1 * sgn, -e1[0] / l1 * sgn], n2 = [e2[1] / l2 * sgn, -e2[0] / l2 * sgn];
    let nx = n1[0] + n2[0], nz = n1[1] + n2[1]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const k = 1 / Math.max(0.5, nx * n1[0] + nz * n1[1]);
    out.push([c[0] + nx * d * k, c[1] + nz * d * k]);
  }
  return out;
}
/** vertical band along a closed XZ outline from y0 to y1; `inward` flips the faces to look toward the polygon centre. UV = (arc, y) metres */
export function bandGeo(pts: Array<[number, number]>, y0: number, y1: number, inward = false, metres = 1): THREE.BufferGeometry {
  const n = pts.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let arc = 0;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    if (i > 0) { const q = pts[(i - 1) % n]; arc += Math.hypot(p[0] - q[0], p[1] - q[1]); }
    pos.push(p[0], y0, p[1], p[0], y1, p[1]);
    uv.push(arc / metres, y0 / metres, arc / metres, y1 / metres);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; if (inward) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** flat strip between two closed outlines (same point count) at height y, facing +Y. UV metres */
export function stripGeo(inner: Array<[number, number]>, outer: Array<[number, number]>, y: number, metres = 1): THREE.BufferGeometry {
  const n = inner.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) { const a = inner[i % n], b = outer[i % n]; pos.push(a[0], y, a[1], b[0], y, b[1]); uv.push(a[0] / metres, a[1] / metres, b[0] / metres, b[1] / metres); }
  // orientation depends on the polygon winding; emit both windings' correct one by checking area
  let area = 0; for (let i = 0; i < n; i++) { const a = inner[i], b = inner[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  for (let i = 0; i < n; i++) { const a = i * 2; if (area < 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // make sure the strip faces up
  const nor = g.attributes.normal as THREE.BufferAttribute;
  if (nor.getY(0) < 0) { const arr = Array.from(g.getIndex()!.array); for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t; } g.setIndex(arr); g.computeVertexNormals(); }
  return g;
}
/** annular sector outline (closed) centred (cx,cz): radii r0..r1, angles a0..a1 (three.js xz: x = cos, z = sin) */
export function sectorPoly(cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, seg = 24): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; out.push([cx + Math.cos(a) * r1, cz + Math.sin(a) * r1]); }
  if (r0 > 0.01) for (let i = seg; i >= 0; i--) { const a = a0 + (a1 - a0) * i / seg; out.push([cx + Math.cos(a) * r0, cz + Math.sin(a) * r0]); }
  else out.push([cx, cz]);
  return out;
}
/** vertical quad facing +Z, metre UVs */
export function quadGeo(w: number, h: number, metres = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / metres, uv.getY(i) * h / metres);
  return g;
}
/** extruded polygon (points in XZ) from y0 to y1, UVs = world metres (top: xz, sides: along/height) */
export function prismGeo(pts: Array<[number, number]>, y0: number, y1: number, metres = 1): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  // rebuild uvs: top/bottom use xz, sides use (arc, y)
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i);
    if (Math.abs(ny) > 0.5) uv.setXY(i, pos.getX(i) / metres, pos.getZ(i) / metres);
    else uv.setXY(i, (pos.getX(i) * nor.getZ(i) - pos.getZ(i) * nor.getX(i)) / metres, pos.getY(i) / metres);
  }
  return g;
}
/** CORRUGATED sheet in the XZ plane facing +Y: ribs run along Z (length l), profile across X (width w). Real rib
 *  geometry (4 segments per rib) so eaves show the wavy silhouette. UV = metres (u across, v along). */
export function corrugatedGeo(w: number, l: number, pitch = 0.076, amp = 0.018, seg = 4): THREE.BufferGeometry {
  const n = Math.max(2, Math.round(w / pitch) * seg);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = -w / 2 + w * i / n, ph = (x / pitch) * Math.PI * 2;
    const y = amp * Math.sin(ph), dy = amp * Math.cos(ph) * Math.PI * 2 / pitch;
    const nl = Math.hypot(dy, 1);
    for (const z of [-l / 2, l / 2]) { pos.push(x, y, z); nor.push(-dy / nl, 1 / nl, 0); uv.push(x + w / 2, z + l / 2); }
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/** cheap smooth 3D value noise in [0,1] (for rust / grime / moss colour functions) */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const h = (a: number, b: number, c: number) => { let t = (a * 374761393 + b * 668265263 + c * 1274126177) | 0; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf), sz = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), sx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), sx), sy),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), sx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), sx), sy), sz);
}
/** rust / wear blotches on painted metal: lerps toward `rust` where fbm noise exceeds 1 - amount */
export const rustFn = (amount = 0.25, rust = "#8a4a26", scale = 1.3, seed = 0): ColorFn => {
  const rc = new THREE.Color(rust);
  return (x, y, z, b, o) => {
    const n = 0.65 * noise3(x * scale + seed, y * scale, z * scale) + 0.35 * noise3(x * scale * 3.1, y * scale * 3.1 + seed, z * scale * 3.1);
    const k = Math.min(1, Math.max(0, (n - (1 - amount)) / 0.12));
    if (k > 0) o.lerp(rc, k * 0.85);
  };
};
/** tube along points */
export function tubeGeo(points: THREE.Vector3[], r: number, seg = 6, closed = false, tubular?: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, "catmullrom", 0.3);
  const tub = tubular ?? Math.max(4, points.length * 4);
  const k = DETAIL >= 1 ? 1 : DETAIL > 0 ? 0.65 : 0.5;
  return new THREE.TubeGeometry(curve, Math.max(3, Math.round(tub * k)), r, Math.max(3, Math.round(seg * k)), closed);
}
/** catenary between two points with sag (metres) */
export function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, n = 12): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0))); }
  return out;
}

export type ColorFn = (x: number, y: number, z: number, base: THREE.Color, out: THREE.Color) => void;

/** growable Float32 buffer */
class FBuf {
  // starts EMPTY (TownLod keeps ~24 bins per tier per building; a 4 KB head start per buffer would be ~100 MB)
  a = new Float32Array(0); n = 0;
  need(k: number) { if (this.n + k > this.a.length) { let m = Math.max(1024, this.a.length * 2); while (m < this.n + k) m *= 2; const b = new Float32Array(m); b.set(this.a.subarray(0, this.n)); this.a = b; } }
  view() { return this.a.slice(0, this.n); }
}
/** growable Uint32 index buffer */
class IBuf {
  a = new Uint32Array(0); n = 0;
  need(k: number) { if (this.n + k > this.a.length) { let m = Math.max(1024, this.a.length * 2); while (m < this.n + k) m *= 2; const b = new Uint32Array(m); b.set(this.a.subarray(0, this.n)); this.a = b; } }
  view() { return this.a.slice(0, this.n); }
}
const _nm = new THREE.Matrix3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _base = new THREE.Color(), _tmp = new THREE.Color();
/** unit box, INDEXED (24 verts = 4 per face, 36 indices): the template for the fast `box` path */
const UBOX = (() => { const g = new THREE.BoxGeometry(1, 1, 1); return { p: g.attributes.position.array as Float32Array, n: g.attributes.normal.array as Float32Array, uv: g.attributes.uv.array as Float32Array, i: Array.from(g.index!.array as ArrayLike<number>) }; })();

/** collects geometry per material; vertex-colour tint per piece; builds ONE merged INDEXED mesh (perf: non-indexed bins
 *  cost 3 vertex-shader runs per triangle; indexed boxes run 24 instead of 36 per box and smooth
 *  shapes ~1/5). Pieces are transformed and appended straight into flat arrays (no per-piece BufferGeometry kept). */
export class GeoBin {
  private P = new FBuf(); private N = new FBuf(); private U = new FBuf(); private C = new FBuf(); private I = new IBuf();
  private pieces = 0;
  castShadow = true; receiveShadow = true;
  /** keep tiny pieces in low detail (bulbs: they glow, so even sub-pixel ones sparkle) */
  keepTiny = false;
  /** the coplanar resolver this bin's boxes register with (set by TownLod per tier) and their draw-set tag */
  co: Coplanar | null = null; coTag = 0;
  private readonly coPos = () => this.P.a;
  constructor(readonly name: string, readonly material: THREE.Material) {}
  /** add a geometry (indexed or not) transformed by `matrix`; its own `color` attribute multiplies the tint. Colours are
   *  computed per source VERTEX and the source index is kept (offset), so colours can never misalign. */
  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4 | null, color: THREE.Color | string | number = 0xffffff, fn?: ColorFn) {
    if (DETAIL < 1 && !this.keepTiny) {
      // low / medium detail: drop pieces under ~5 / 3 cm (nails, screws, hinges, bolts, knobs…) — sub-pixel from afar
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const r = geo.boundingSphere!.radius * (matrix ? matrix.getMaxScaleOnAxis() : 1);
      if (r < tinyR()) return;
    }
    let g = geo;
    if (!g.attributes.normal) { g = g.clone(); g.computeVertexNormals(); }
    const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute | undefined, src = g.getAttribute("color") as THREE.BufferAttribute | undefined;
    const idx = g.index, vc = pos.count, ic = idx ? idx.count : vc;
    if (matrix) _nm.getNormalMatrix(matrix);
    // a mirroring matrix flips the winding: swap two indices per triangle so faces stay front-facing
    const flip = !!matrix && matrix.determinant() < 0;
    _base.set(color);
    const P = this.P, N = this.N, U = this.U, C = this.C, I = this.I, base = P.n / 3;
    P.need(vc * 3); N.need(vc * 3); U.need(vc * 2); C.need(vc * 3); I.need(ic);
    for (let v = 0; v < vc; v++) {
      _v.fromBufferAttribute(pos, v); _n.fromBufferAttribute(nor, v);
      if (matrix) { _v.applyMatrix4(matrix); _n.applyMatrix3(_nm).normalize(); }
      P.a[P.n++] = _v.x; P.a[P.n++] = _v.y; P.a[P.n++] = _v.z;
      N.a[N.n++] = Number.isFinite(_n.x) ? _n.x : 0; N.a[N.n++] = Number.isFinite(_n.y) ? _n.y : 1; N.a[N.n++] = Number.isFinite(_n.z) ? _n.z : 0;
      if (uv) { U.a[U.n++] = uv.getX(v); U.a[U.n++] = uv.getY(v); } else { U.a[U.n++] = 0; U.a[U.n++] = 0; }
      if (src) _tmp.setRGB(_base.r * src.getX(v), _base.g * src.getY(v), _base.b * src.getZ(v)); else _tmp.copy(_base);
      if (fn) fn(_v.x, _v.y, _v.z, _base, _tmp);
      C.a[C.n++] = Number.isFinite(_tmp.r) ? _tmp.r : _base.r; C.a[C.n++] = Number.isFinite(_tmp.g) ? _tmp.g : _base.g; C.a[C.n++] = Number.isFinite(_tmp.b) ? _tmp.b : _base.b;
    }
    for (let i = 0; i + 2 < ic; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      I.a[I.n++] = base + a;
      if (flip) { I.a[I.n++] = base + c; I.a[I.n++] = base + b; } else { I.a[I.n++] = base + b; I.a[I.n++] = base + c; }
    }
    this.pieces++;
    if (this.co && geo.userData.coBox) this.co.addGeometry(g as never, matrix ? matrix.elements : null, this.coTag, this.coPos, base, vc);
  }
  /** fast path: metre-UV box (same UVs as boxGeo) written straight from a unit template (indexed, 24 verts) */
  box(w: number, h: number, d: number, matrix: THREE.Matrix4, color: THREE.Color | string | number = 0xffffff, uvOff: [number, number] = [0, 0], fn?: ColorFn) {
    if (DETAIL < 1 && !this.keepTiny && Math.hypot(w, h, d) * 0.5 * matrix.getMaxScaleOnAxis() < tinyR()) return;
    const dims: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    _nm.getNormalMatrix(matrix); _base.set(color);
    const P = this.P, N = this.N, U = this.U, C = this.C, I = this.I, T = UBOX, base = P.n / 3;
    const flip = matrix.determinant() < 0;
    P.need(72); N.need(72); U.need(48); C.need(72); I.need(36);
    for (let i = 0; i < 24; i++) {
      _v.set(T.p[i * 3] * w, T.p[i * 3 + 1] * h, T.p[i * 3 + 2] * d).applyMatrix4(matrix);
      _n.set(T.n[i * 3], T.n[i * 3 + 1], T.n[i * 3 + 2]).applyMatrix3(_nm).normalize();
      const [fw, fh] = dims[(i / 4) | 0];
      P.a[P.n++] = _v.x; P.a[P.n++] = _v.y; P.a[P.n++] = _v.z;
      N.a[N.n++] = _n.x; N.a[N.n++] = _n.y; N.a[N.n++] = _n.z;
      U.a[U.n++] = T.uv[i * 2] * fw + uvOff[0]; U.a[U.n++] = T.uv[i * 2 + 1] * fh + uvOff[1];
      _tmp.copy(_base);
      if (fn) fn(_v.x, _v.y, _v.z, _base, _tmp);
      C.a[C.n++] = _tmp.r; C.a[C.n++] = _tmp.g; C.a[C.n++] = _tmp.b;
    }
    for (let i = 0; i < 36; i += 3) {
      I.a[I.n++] = base + T.i[i];
      if (flip) { I.a[I.n++] = base + T.i[i + 2]; I.a[I.n++] = base + T.i[i + 1]; } else { I.a[I.n++] = base + T.i[i + 1]; I.a[I.n++] = base + T.i[i + 2]; }
    }
    this.pieces++;
    if (this.co) this.co.addMatrix(w, h, d, matrix.elements, this.coTag, this.coPos, base, 24);
  }
  /** chamfered (bevelled) box — `c` = bevel size in metres (default 3 cm, clamped to 45% of the smallest side) */
  bbox(w: number, h: number, d: number, matrix: THREE.Matrix4, color: THREE.Color | string | number = 0xffffff, c = 0.03, fn?: ColorFn, uvOff: [number, number] = [0, 0]) {
    if (DETAIL < 1) { this.box(w, h, d, matrix, color, uvOff, fn); return; }
    this.add(chamferBoxGeo(w, h, d, c, uvOff), matrix, color, fn);
  }
  get count() { return this.pieces; }
  /** vertices collected so far */
  get vertexCount() { return this.P.n / 3; }
  /** triangles collected so far */
  get triCount() { return this.I.n / 3; }
  /** the collected pieces as ONE indexed geometry (position, normal, uv, color) and reset the bin; null when empty */
  buildGeometry(): THREE.BufferGeometry | null {
    if (!this.pieces || !this.P.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.P.view(), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(this.N.view(), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(this.U.view(), 2));
    g.setAttribute("color", new THREE.BufferAttribute(this.C.view(), 3));
    g.setIndex(new THREE.BufferAttribute(this.I.view(), 1));
    this.P = new FBuf(); this.N = new FBuf(); this.U = new FBuf(); this.C = new FBuf(); this.I = new IBuf(); this.pieces = 0;
    g.computeBoundingSphere();
    return g;
  }
  build(): THREE.Mesh | null {
    const g = this.buildGeometry();
    if (!g) return null;
    const mesh = new THREE.Mesh(g, this.material);
    mesh.name = this.name;
    mesh.castShadow = this.castShadow; mesh.receiveShadow = this.receiveShadow;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

/** instanced prop with optional per-instance colour */
export function instanced(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colors?: Array<THREE.Color | string | number>, shadows = true): THREE.InstancedMesh | null {
  if (!mats.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  im.name = name;
  for (let i = 0; i < mats.length; i++) im.setMatrixAt(i, mats[i]);
  if (colors) { const c = new THREE.Color(); for (let i = 0; i < mats.length; i++) im.setColorAt(i, c.set(colors[i % colors.length])); }
  im.castShadow = shadows; im.receiveShadow = shadows;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

/** ground-contact darkening: vertices within `h` metres above groundY get darker (fake AO / dirt) */
export const groundAO = (groundY: number, h = 1.1, k = 0.72): ColorFn => (x, y, z, base, out) => {
  const t = Math.min(1, Math.max(0, (y - groundY) / h));
  out.multiplyScalar(k + (1 - k) * (t * t * (3 - 2 * t)));
};
/** darken the top band (under eaves) */
export const eaveAO = (topY: number, h = 0.8, k = 0.8): ColorFn => (x, y, z, base, out) => {
  const t = Math.min(1, Math.max(0, (topY - y) / h));
  out.multiplyScalar(k + (1 - k) * t);
};
export const combine = (...fns: ColorFn[]): ColorFn => (x, y, z, b, o) => { for (const f of fns) f(x, y, z, b, o); };
export const jitter = (rng: () => number, amt = 0.06): ColorFn => { const k = 1 + (rng() - 0.5) * 2 * amt; return (x, y, z, b, o) => { o.multiplyScalar(k); }; };

// ---------- leafy clump: N folded leaf cards radiating over a
// unit hemisphere, darker toward the core (baked AO in the vertex colour). Cached variants; scale with the matrix.
const clumps = new Map<string, THREE.BufferGeometry>();
export function leafClumpGeo(v = 0, n = 26, flat = 1): THREE.BufferGeometry {
  if (DETAIL < 1) n = DETAIL > 0 ? Math.max(8, Math.round(n * 0.7)) : Math.max(6, Math.round(n / 3));
  const key = `${v}.${n}.${flat}`;
  let g = clumps.get(key);
  if (g) return g;
  let s = (v * 2654435761 + 12345) >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pos: number[] = [], colr: number[] = [];
  const P = [[0, 0, 0], [-0.5, 0.16, 0.42], [0, 0.02, 1], [0.5, 0.16, 0.42]];
  const X = new THREE.Vector3(), Yv = new THREE.Vector3(), Z = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, el = Math.asin(Math.min(1, rnd() * 1.1 - 0.15)), r0 = 0.15 + rnd() * 0.35;
    Z.set(Math.cos(a) * Math.cos(el), Math.sin(el) * flat, Math.sin(a) * Math.cos(el)).normalize();
    c.copy(Z).multiplyScalar(r0);
    X.set(0, 1, 0).cross(Z); if (X.lengthSq() < 1e-4) X.set(1, 0, 0); X.normalize();
    Yv.copy(Z).cross(X).normalize();
    const roll = (rnd() - 0.5) * 1.2; X.applyAxisAngle(Z, roll); Yv.applyAxisAngle(Z, roll);
    const len = 0.55 + rnd() * 0.4, wid = len * (0.45 + rnd() * 0.2);
    const pts = P.map(([px, py, pz]) => q.set(0, 0, 0).addScaledVector(X, px * wid).addScaledVector(Yv, py * wid).addScaledVector(Z, pz * len).add(c).clone());
    for (const [ia, ib, ic] of [[0, 1, 2], [0, 2, 3]]) for (const k of [ia, ib, ic]) {
      const p = pts[k]; pos.push(p.x, p.y, p.z);
      const d = Math.min(1, p.length()), k2 = 0.55 + 0.45 * d * (0.85 + 0.3 * Math.max(0, p.y));
      colr.push(k2, k2, k2);
    }
  }
  g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.computeVertexNormals();
  // bend normals outward (a rounded clump catches light like a shrub, not like flat cards)
  const nor = g.attributes.normal as THREE.BufferAttribute, pp = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < nor.count; i++) { q.set(pp.getX(i), pp.getY(i) + 0.3, pp.getZ(i)).normalize(); c.set(nor.getX(i), nor.getY(i), nor.getZ(i)); if (c.dot(q) < 0) c.negate(); c.lerp(q, 0.6).normalize(); nor.setXYZ(i, c.x, c.y, c.z); }
  clumps.set(key, g);
  return g;
}
