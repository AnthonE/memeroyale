// Geometry primitives for the weapons area: banana lofts, profile sweeps, lathes with fillets, ropes, extrusions.
// Everything returns an indexed BufferGeometry with position/normal/uv so the PartBuilder can merge it.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export type V3 = [number, number, number];
const TAU = Math.PI * 2;

/** 1-D Catmull-Rom over evenly spaced stations, t in [0,1] */
export function catmull1(stations: number[], t: number): number {
  const n = stations.length - 1;
  const x = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(x), n - 1), f = x - i;
  const p0 = stations[Math.max(i - 1, 0)], p1 = stations[i], p2 = stations[Math.min(i + 1, n)], p3 = stations[Math.min(i + 2, n)];
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

/** builds an indexed grid surface: rows × cols of positions, optional closed around cols */
export function gridGeometry(rows: number, cols: number, at: (i: number, j: number, out: THREE.Vector3) => void, closedCols: boolean, uvScale: [number, number] = [1, 1]): THREE.BufferGeometry {
  const cc = closedCols ? cols : cols;
  const pos = new Float32Array(rows * (cc + (closedCols ? 1 : 0)) * 3);
  const uv = new Float32Array(rows * (cc + (closedCols ? 1 : 0)) * 2);
  const w = cc + (closedCols ? 1 : 0);
  const v = new THREE.Vector3();
  for (let i = 0; i < rows; i++) for (let j = 0; j < w; j++) {
    at(i, j % cc, v);
    const k = i * w + j;
    pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
    uv[k * 2] = (i / (rows - 1)) * uvScale[0]; uv[k * 2 + 1] = (j / (w - 1)) * uvScale[1];
  }
  const idx: number[] = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < w - 1; j++) {
    const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
    // rows run along the curve tangent T, columns rotate N→B (right-handed): a→b→c winds OUTWARD (T×B = -N would be
    // the inward order). Getting this wrong lit every banana from the inside.
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closedCols) weldSeamNormals(g, rows, w);
  return g;
}

/** average normals of the first and last column so a closed sweep has no lighting seam */
function weldSeamNormals(g: THREE.BufferGeometry, rows: number, w: number) {
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < rows; i++) {
    const a = i * w, b = i * w + w - 1;
    const nx = n.getX(a) + n.getX(b), ny = n.getY(a) + n.getY(b), nz = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(a, nx / l, ny / l, nz / l); n.setXYZ(b, nx / l, ny / l, nz / l);
  }
}

export interface BananaOpts {
  /** straight-line length stem→tip */
  length: number;
  /** max radius (corner radius of the faceted section) */
  radius: number;
  /** total bend in radians (both ends curl up toward +Y) */
  bend?: number;
  /** radius profile stations stem→tip (fractions of radius) */
  profile?: number[];
  /** legacy round section: ridge count / depth (used when facets = 0) */
  ridges?: number;
  ridgeDepth?: number;
  /** faceted section: number of flat faces (a real banana has 5) and corner rounding 0 (sharp) … 1 (round) */
  facets?: number;
  round?: number;
  radial?: number;
  along?: number;
  /** squash factor for the cross-section (x = in-plane, y = out-of-plane) */
  squash?: number;
}

export const BANANA_PROFILE = [0.34, 0.62, 0.84, 0.95, 1, 1, 0.98, 0.9, 0.76, 0.52, 0.2];

const polarCache = new Map<string, Float32Array>();
/** polar radius table (1024 steps over 2π) of a rounded regular polygon: corner radius 1, a FACE centred at θ = 0 */
export function roundedPolyPolar(n: number, round: number): Float32Array {
  const key = `${n}:${round.toFixed(3)}`;
  const hit = polarCache.get(key);
  if (hit) return hit;
  const rho = Math.min(0.999, Math.max(0.001, round)), c = 1 - rho;
  const pts: Array<[number, number]> = [];
  const xy: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const phi = (k / n) * TAU + Math.PI / n;
    for (let s = 0; s <= 24; s++) {
      const a = phi - Math.PI / n + (s / 24) * (TAU / n);
      xy.push([c * Math.cos(phi) + rho * Math.cos(a), c * Math.sin(phi) + rho * Math.sin(a)]);
    }
  }
  // densify: the straight edges between corner arcs must be sampled too (polar interpolation of a chord is not flat)
  for (let i = 0; i < xy.length; i++) {
    const [x0, y0] = xy[i], [x1, y1] = xy[(i + 1) % xy.length];
    for (let s = 0; s < 16; s++) { const f = s / 16, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f; pts.push([Math.atan2(y, x), Math.hypot(x, y)]); }
  }
  pts.sort((p, q) => p[0] - q[0]);
  const N = 1024, tab = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let th = (i / N) * TAU; if (th > Math.PI) th -= TAU;
    // find bracketing samples (wrap)
    let j = pts.findIndex((p) => p[0] >= th);
    if (j < 0) j = 0;
    const b = pts[j], a = pts[(j - 1 + pts.length) % pts.length];
    let a0 = a[0], b0 = b[0];
    if (b0 < a0) b0 += TAU;
    let t0 = th; if (t0 < a0) t0 += TAU;
    const f = b0 - a0 > 1e-6 ? (t0 - a0) / (b0 - a0) : 0;
    tab[i] = a[1] + (b[1] - a[1]) * Math.min(1, Math.max(0, f));
  }
  polarCache.set(key, tab);
  return tab;
}
export function polarAt(tab: Float32Array, th: number): number {
  const N = tab.length;
  let u = (th / TAU) % 1; if (u < 0) u += 1;
  const x = u * N, i = Math.floor(x) % N, f = x - Math.floor(x);
  return tab[i] * (1 - f) + tab[(i + 1) % N] * f;
}

/** a banana lying along +X from x=0 (stem end) to x=length (tip), bulging down and curling up at the ends. A flat
 *  FACE on top (5 faces with rounded ridges by default — the target art's cel shading lives on those facets). */
export function bananaGeometry(o: BananaOpts): THREE.BufferGeometry {
  const { length, radius, bend = 0.55, profile = BANANA_PROFILE, ridges = 5, ridgeDepth = 0.11, facets = 5, round = 0.42, along = 44, squash = 1 } = o;
  const radial = o.radial ?? (facets > 0 ? 40 : 28);
  const R = bend > 1e-4 ? length / (2 * Math.sin(bend / 2)) : 1e9;
  const p = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(0, 0, 1);
  const tab = facets > 0 ? roundedPolyPolar(facets, round) : null;
  const g = gridGeometry(along + 1, radial, (i, j, out) => {
    const t = i / along;
    const a = -bend / 2 + bend * t;
    if (bend > 1e-4) p.set(R * (Math.sin(a) + Math.sin(bend / 2)), R * (Math.cos(a) - Math.cos(bend / 2)) * -1, 0);
    else p.set(length * t, 0, 0);
    N.set(-Math.sin(a), Math.cos(a), 0);
    const th = (j / radial) * TAU;
    const f = tab ? polarAt(tab, th) : 1 - ridgeDepth * Math.pow(0.5 - 0.5 * Math.cos(ridges * th), 0.7);
    const rr = radius * catmull1(profile, t) * f;
    out.copy(p).addScaledVector(N, rr * Math.cos(th)).addScaledVector(B, rr * Math.sin(th) * squash);
  }, true, [length * 4, 1]);
  return g;
}

/** centre line sample of a banana at t (0 stem → 1 tip): centre, tangent (toward the tip) and local radius */
export function bananaAt(o: BananaOpts, t: number): { center: THREE.Vector3; dir: THREE.Vector3; radius: number } {
  const { length, radius, bend = 0.55, profile = BANANA_PROFILE } = o;
  const R = bend > 1e-4 ? length / (2 * Math.sin(bend / 2)) : 1e9;
  const a = -bend / 2 + bend * t;
  const c = bend > 1e-4 ? new THREE.Vector3(R * (Math.sin(a) + Math.sin(bend / 2)), -R * (Math.cos(a) - Math.cos(bend / 2)), 0) : new THREE.Vector3(length * t, 0, 0);
  const d = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
  return { center: c, dir: d, radius: radius * catmull1(profile, t) };
}

/** end of a banana: centre + OUTWARD direction + radius (for stems, muzzle discs) */
export function bananaEnd(o: BananaOpts, atTip: boolean): { center: THREE.Vector3; dir: THREE.Vector3; radius: number } {
  const e = bananaAt(o, atTip ? 1 : 0);
  if (!atTip) e.dir.negate();
  return e;
}




/** lathe from a [radius, y] profile (y up), with smooth normals across the seam */
export function lathe(points: Array<[number, number]>, seg = 24, phiStart = 0, phiLength = TAU): THREE.BufferGeometry {
  // LatheGeometry's winding assumes the profile climbs in y; a descending profile would face inward
  const pts = points[0][1] > points[points.length - 1][1] ? points.slice().reverse() : points;
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.00001), y)), seg, phiStart, phiLength);
  return g;
}

/** cylinder along +Y with filleted rims: radius r, height h, fillet f. Centred at origin. Optional top/bottom radii. */
export function filletCyl(r: number, h: number, f: number, seg = 24, rTop = r, rBot = r, fSeg = 4): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [];
  const y0 = -h / 2, y1 = h / 2;
  pts.push([0, y0]);
  pts.push([rBot - f, y0]);
  for (let k = 1; k <= fSeg; k++) { const a = (k / fSeg) * (Math.PI / 2); pts.push([rBot - f + f * Math.sin(a), y0 + f - f * Math.cos(a)]); }
  pts.push([rTop, y1 - f]);
  for (let k = 1; k <= fSeg; k++) { const a = (k / fSeg) * (Math.PI / 2); pts.push([rTop - f + f * Math.cos(a), y1 - f + f * Math.sin(a)]); }
  pts.push([0, y1]);
  return lathe(pts, seg);
}

/** hollow ring (tube section) along +Y: outer r, inner ri, height h, fillet f on the outer rims */
export function ringGeo(r: number, ri: number, h: number, f = 0, seg = 32): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [];
  const y0 = -h / 2, y1 = h / 2;
  pts.push([ri, y0]);
  if (f > 0) {
    pts.push([r - f, y0]);
    for (let k = 1; k <= 3; k++) { const a = (k / 3) * (Math.PI / 2); pts.push([r - f + f * Math.sin(a), y0 + f - f * Math.cos(a)]); }
    pts.push([r, y1 - f]);
    for (let k = 1; k <= 3; k++) { const a = (k / 3) * (Math.PI / 2); pts.push([r - f + f * Math.cos(a), y1 - f + f * Math.sin(a)]); }
  } else { pts.push([r, y0]); pts.push([r, y1]); }
  pts.push([ri, y1]);
  pts.push([ri, y0 + (y1 - y0) * 0.001]); // close the loop: inner wall (faces the axis)
  return lathe(pts, seg);
}

/** a disc (flat, facing +Y) with a small edge fillet */
export function disc(r: number, h: number, f = 0, seg = 32): THREE.BufferGeometry { return filletCyl(r, h, Math.min(f, h / 2, r / 2), seg); }

export function rbox(w: number, h: number, d: number, r: number, seg = 3): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
}

/** rope along points: a tube with UVs scaled so a twisted-strand normal map repeats every `pitch` metres */
export function rope(points: THREE.Vector3[], radius: number, closed = false, pitch = 0.035, radial = 8, seg?: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal", 0.5);
  const len = curve.getLength();
  const n = seg ?? Math.max(8, Math.round(len / (radius * 0.9)));
  const g = new THREE.TubeGeometry(curve, n, radius, radial, closed);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / pitch), uv.getY(i));
  return g;
}

/** extrude a 2-D outline (x right, y up) along +Z, centred on z=0, with a bevel */
export function extrude(points: Array<[number, number]>, depth: number, bevel = 0, curveSeg = 8, bevelSeg = 2): THREE.BufferGeometry {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, curveSegments: curveSeg });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g;
}

/** extrude a smooth closed spline through the given points */
export function extrudeSmooth(points: Array<[number, number]>, depth: number, bevel = 0, samples = 48, bevelSeg = 2, holes: Array<Array<[number, number]>> = []): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, "centripetal");
  const s = new THREE.Shape(curve.getPoints(samples).slice(0, -1).map((p) => new THREE.Vector2(p.x, p.y)));
  for (const h of holes) {
    const hc = new THREE.CatmullRomCurve3(h.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, "centripetal");
    s.holes.push(new THREE.Path(hc.getPoints(Math.max(12, samples >> 1)).slice(0, -1).map((p) => new THREE.Vector2(p.x, p.y))));
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, curveSegments: 4 });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g;
}

/** merge helper that tolerates empty lists */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const ok = list.filter((g) => g.attributes.position && g.attributes.position.count > 0);
  if (!ok.length) return null;
  return mergeGeometries(ok, false);
}

/** weld + smooth normals within an angle threshold (degrees) — for extrusions and lathes with hard seams */
export function smooth(g: THREE.BufferGeometry, angleDeg = 60): THREE.BufferGeometry {
  const w = mergeVertices(g.index ? g.toNonIndexed() : g, 1e-5);
  w.computeVertexNormals();
  // partial smoothing: blend original face normals toward the welded smooth normals where the crease is soft
  const src = g.index ? g.toNonIndexed() : g;
  const n0 = src.attributes.normal as THREE.BufferAttribute;
  const p0 = src.attributes.position as THREE.BufferAttribute;
  const p1 = w.attributes.position as THREE.BufferAttribute, n1 = w.attributes.normal as THREE.BufferAttribute;
  const map = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
  for (let i = 0; i < p1.count; i++) map.set(key(p1.getX(i), p1.getY(i), p1.getZ(i)), i);
  const cos = Math.cos((angleDeg * Math.PI) / 180);
  const out = new Float32Array(p0.count * 3);
  for (let i = 0; i < p0.count; i++) {
    const j = map.get(key(p0.getX(i), p0.getY(i), p0.getZ(i)));
    const ax = n0.getX(i), ay = n0.getY(i), az = n0.getZ(i);
    if (j === undefined) { out[i * 3] = ax; out[i * 3 + 1] = ay; out[i * 3 + 2] = az; continue; }
    const bx = n1.getX(j), by = n1.getY(j), bz = n1.getZ(j);
    if (ax * bx + ay * by + az * bz > cos) { out[i * 3] = bx; out[i * 3 + 1] = by; out[i * 3 + 2] = bz; }
    else { out[i * 3] = ax; out[i * 3 + 1] = ay; out[i * 3 + 2] = az; }
  }
  src.setAttribute("normal", new THREE.BufferAttribute(out, 3));
  return src;
}

/** 4x4 from position / euler / scale (Y-up) */
export function tf(p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: number | V3 = 1): THREE.Matrix4 {
  const sc = typeof s === "number" ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), sc);
}

/** matrix that maps +Y to `dir` at `pos` (for cylinders/lathes used as axles) */
export function alignY(pos: THREE.Vector3 | V3, dir: THREE.Vector3 | V3, s: number | V3 = 1, roll = 0): THREE.Matrix4 {
  const p = pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(...pos);
  const d = (dir instanceof THREE.Vector3 ? dir.clone() : new THREE.Vector3(...dir)).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  const sc = typeof s === "number" ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(p, q, sc);
}

