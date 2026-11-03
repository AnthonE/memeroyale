// Geometry kit for the lobby islet: production primitives with bevels and METRE-based UVs mapped into atlas
// regions, plus a Batch that bakes transforms + vertex tints and merges everything per material (few draw calls).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { UVRect } from "./paint";

export type Vec3 = [number, number, number];

// ------------------------------------------------------------------------------------------------ helpers
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** matrix from position, euler (XYZ order unless given), uniform or per-axis scale */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s: number | Vec3 = 1, order: THREE.EulerOrder = "YXZ"): THREE.Matrix4 {
  _e.set(rx, ry, rz, order); _q.setFromEuler(_e);
  if (typeof s === "number") _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
export const mul = (...ms: THREE.Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), new THREE.Matrix4());

/** map metre-space uv (u in [0..mu], v in [0..mv] ideally) into an atlas rect; shrinks if it would overflow */
function toRect(uv: Float32Array, r: UVRect, off: [number, number] = [0, 0], fit: "none" | "u" | "v" | "both" = "none") {
  let maxU = 0, maxV = 0, minU = Infinity, minV = Infinity;
  for (let i = 0; i < uv.length; i += 2) { maxU = Math.max(maxU, uv[i]); maxV = Math.max(maxV, uv[i + 1]); minU = Math.min(minU, uv[i]); minV = Math.min(minV, uv[i + 1]); }
  const spanU = maxU - minU, spanV = maxV - minV;
  const su = fit === "u" || fit === "both" || spanU > r.mu ? r.mu / Math.max(1e-6, spanU) : 1;
  const sv = fit === "v" || fit === "both" || spanV > r.mv ? r.mv / Math.max(1e-6, spanV) : 1;
  const ou = Math.max(0, Math.min(off[0], r.mu - spanU * su)), ov = Math.max(0, Math.min(off[1], r.mv - spanV * sv));
  for (let i = 0; i < uv.length; i += 2) {
    const u = (uv[i] - minU) * su + ou, v = (uv[i + 1] - minV) * sv + ov;
    uv[i] = r.u0 + (u / r.mu) * (r.u1 - r.u0);
    uv[i + 1] = r.v0 + (v / r.mv) * (r.v1 - r.v0);
  }
}

function geo(pos: number[], nor: number[], uv: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------------------------------------ chamfer box
export interface BoxOpt {
  /** axis the texture's u (grain) runs along */
  grain?: 0 | 1 | 2;
  rect: UVRect;
  /** rect for faces whose normal is the grain axis (end grain); default = rect */
  end?: UVRect;
  off?: [number, number];
  /** skip faces: bitmask over [+x,-x,+y,-y,+z,-z] */
  skip?: number;
  /** (u axis, v axis) for the end faces (default: the next two axes) */
  endAxes?: [number, number];
  /** flip u on the ±X / ±Z side faces whose natural u runs right-to-left, so stencils read on all four sides */
  readable?: boolean;
}
/**
 * Box with chamfered edges whose vertex normals are the adjacent face normals ("weighted normals"), so the
 * chamfer shades like a rounded bevel and catches a crisp highlight. 44 triangles.
 */
export function cbox(sx: number, sy: number, sz: number, e: number, o: BoxOpt): THREE.BufferGeometry {
  const h = [sx / 2, sy / 2, sz / 2];
  e = Math.min(e, h[0] * 0.45, h[1] * 0.45, h[2] * 0.45);
  const G = o.grain ?? 0;
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const uvSide: number[] = [], uvEnd: number[] = [], isEnd: boolean[] = [];
  const axesFor = (n: number): [number, number] => {
    if (n !== G) { const other = 3 - n - G; return [G, other]; }
    return o.endAxes ?? [(n + 1) % 3, (n + 2) % 3];
  };
  const vert = (p: number[], n: number, s: number) => {
    pos.push(p[0], p[1], p[2]);
    const nv = [0, 0, 0]; nv[n] = s; nor.push(nv[0], nv[1], nv[2]);
    const [ua, va] = axesFor(n);
    const flip = o.readable && va === 1 && ((n === 0 && ua === 2 && s > 0) || (n === 2 && ua === 0 && s < 0));
    const u = flip ? h[ua] - p[ua] : p[ua] + h[ua], v = p[va] + h[va];
    if (n === G) { uvEnd.push(u, v); uvSide.push(NaN, NaN); isEnd.push(true); } else { uvSide.push(u, v); uvEnd.push(NaN, NaN); isEnd.push(false); }
    return pos.length / 3 - 1;
  };
  const tri = (a: number, b: number, c: number) => {
    // orient by the summed vertex normals
    const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const N = (i: number) => new THREE.Vector3(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
    const fn = P(b).sub(P(a)).cross(P(c).sub(P(a)));
    if (fn.dot(N(a).add(N(b)).add(N(c))) < 0) idx.push(a, c, b); else idx.push(a, b, c);
  };
  const quad = (a: number, b: number, c: number, d: number) => { tri(a, b, c); tri(a, c, d); };
  // faces
  for (let n = 0; n < 3; n++) for (const s of [1, -1]) {
    const bit = n * 2 + (s > 0 ? 0 : 1);
    if (o.skip && o.skip & (1 << bit)) continue;
    const p1 = (n + 1) % 3, p2 = (n + 2) % 3;
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const p = [0, 0, 0]; p[n] = s * h[n]; p[p1] = a * (h[p1] - e); p[p2] = b * (h[p2] - e); return vert(p, n, s); });
    quad(c[0], c[1], c[2], c[3]);
  }
  // edge chamfers
  for (let n1 = 0; n1 < 3; n1++) for (let n2 = n1 + 1; n2 < 3; n2++) {
    const t = 3 - n1 - n2;
    for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
      const q: number[] = [];
      for (const st of [-1, 1]) {
        const pa = [0, 0, 0]; pa[n1] = s1 * h[n1]; pa[n2] = s2 * (h[n2] - e); pa[t] = st * (h[t] - e);
        const pb = [0, 0, 0]; pb[n1] = s1 * (h[n1] - e); pb[n2] = s2 * h[n2]; pb[t] = st * (h[t] - e);
        q.push(vert(pa, n1, s1), vert(pb, n2, s2));
      }
      quad(q[0], q[1], q[3], q[2]);
    }
  }
  // corners
  for (const sx_ of [1, -1]) for (const sy_ of [1, -1]) for (const sz_ of [1, -1]) {
    const S = [sx_, sy_, sz_];
    const vs = [0, 1, 2].map((n) => { const p = [0, 0, 0]; for (let k = 0; k < 3; k++) p[k] = S[k] * (h[k] - (k === n ? 0 : e)); return vert(p, n, S[n]); });
    tri(vs[0], vs[1], vs[2]);
  }
  // uvs: side + end groups mapped separately
  const uv = new Float32Array(isEnd.length * 2);
  const side = new Float32Array(uvSide.filter((_, i) => !isEnd[i >> 1]));
  const end = new Float32Array(uvEnd.filter((_, i) => isEnd[i >> 1]));
  if (side.length) toRect(side, o.rect, o.off);
  if (end.length) toRect(end, o.end ?? o.rect, o.off);
  let si = 0, ei = 0;
  for (let i = 0; i < isEnd.length; i++) {
    if (isEnd[i]) { uv[i * 2] = end[ei++]; uv[i * 2 + 1] = end[ei++]; } else { uv[i * 2] = side[si++]; uv[i * 2 + 1] = side[si++]; }
  }
  return geo(pos, nor, Array.from(uv), idx);
}

// ------------------------------------------------------------------------------------------------ lathe / cylinder
export interface LatheOpt {
  rect: UVRect;
  /** 'around' → u = circumference metres (v = profile length); 'along' → u = profile length (grain along the axis) */
  u?: "around" | "along";
  off?: [number, number];
  fit?: "none" | "u" | "v" | "both";
  /** cap discs mapped into this rect (fit, or real metres with capMetres) */
  cap?: UVRect;
  capMetres?: boolean;
  phase?: number;
  /** sweep angle (default a full turn) — build long circumferences in arcs so atlas regions never squeeze */
  arc?: number;
}
/**
 * Revolve a profile [r, y][] (bottom → top) around +Y. Vertices are duplicated at sharp profile corners so bevels
 * read crisp. Optional flat caps at the ends when the profile's first/last r > 0.
 */
export function lathe(profile: Array<[number, number]>, seg: number, o: LatheOpt, smoothAngle = 0.6): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], idx: number[] = [];
  // profile normals per segment, vertex split at corners
  const segN: Array<[number, number]> = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    const dx = r1 - r0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    segN.push([dy / l, -dx / l]);
  }
  type PV = { r: number; y: number; nr: number; ny: number; s: number };
  const rings: PV[][] = []; // each "strip" of profile verts, split at corners
  let arc = 0;
  let strip: PV[] = [];
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    if (i > 0) arc += Math.hypot(r - profile[i - 1][0], y - profile[i - 1][1]);
    const nPrev = i > 0 ? segN[i - 1] : null, nNext = i < segN.length ? segN[i] : null;
    if (nPrev && nNext) {
      const ang = Math.acos(Math.max(-1, Math.min(1, nPrev[0] * nNext[0] + nPrev[1] * nNext[1])));
      if (ang > smoothAngle) {
        strip.push({ r, y, nr: nPrev[0], ny: nPrev[1], s: arc });
        rings.push(strip); strip = [{ r, y, nr: nNext[0], ny: nNext[1], s: arc }];
        continue;
      }
      const nr = nPrev[0] + nNext[0], ny = nPrev[1] + nNext[1], l = Math.hypot(nr, ny) || 1;
      strip.push({ r, y, nr: nr / l, ny: ny / l, s: arc });
    } else {
      const n = (nPrev ?? nNext)!;
      strip.push({ r, y, nr: n[0], ny: n[1], s: arc });
    }
  }
  rings.push(strip);
  const rMax = Math.max(...profile.map((p) => p[0]));
  const sweep = o.arc ?? Math.PI * 2;
  const circ = sweep * rMax;
  const ph = o.phase ?? 0;
  const sideUV: number[] = [];
  for (const st of rings) {
    const base = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * sweep + ph, c = Math.cos(th), s = Math.sin(th);
      for (const v of st) {
        pos.push(v.r * s, v.y, v.r * c);
        nor.push(v.nr * s, v.ny, v.nr * c);
        const around = (j / seg) * circ;
        if ((o.u ?? "around") === "around") sideUV.push(around, v.s); else sideUV.push(v.s, around);
      }
    }
    const n = st.length;
    for (let j = 0; j < seg; j++) for (let i = 0; i < n - 1; i++) {
      const a = base + j * n + i, b = base + (j + 1) * n + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const su = new Float32Array(sideUV);
  toRect(su, o.rect, o.off, o.fit);
  uvs.push(...su);
  // caps
  const capUV: number[] = [];
  const capStart = pos.length / 3;
  const addCap = (r: number, y: number, up: boolean) => {
    const c0 = pos.length / 3;
    pos.push(0, y, 0); nor.push(0, up ? 1 : -1, 0); capUV.push(rMax, rMax);
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2 + ph;
      pos.push(r * Math.sin(th), y, r * Math.cos(th)); nor.push(0, up ? 1 : -1, 0);
      capUV.push(rMax + r * Math.sin(th), rMax + r * Math.cos(th));
    }
    for (let j = 0; j < seg; j++) { if (up) idx.push(c0, c0 + 1 + j, c0 + 2 + j); else idx.push(c0, c0 + 2 + j, c0 + 1 + j); }
  };
  const first = profile[0], last = profile[profile.length - 1];
  if (o.cap) {
    if (first[0] > 1e-4) addCap(first[0], first[1], false);
    if (last[0] > 1e-4) addCap(last[0], last[1], true);
  }
  if (capUV.length) {
    const cu = new Float32Array(capUV);
    toRect(cu, o.cap!, o.capMetres ? [o.off?.[0] ?? 0, o.off?.[1] ?? 0] : [0, 0], o.capMetres ? "none" : "both");
    uvs.push(...cu);
  }
  void capStart;
  return geo(pos, nor, uvs, idx);
}

/** bevelled cylinder (radius r, height h, bottom at y=0) */
export function cyl(rb: number, rt: number, h: number, seg: number, bevel: number, o: LatheOpt): THREE.BufferGeometry {
  const b = Math.min(bevel, h * 0.3, Math.min(rb, rt) * 0.4);
  const prof: Array<[number, number]> = b > 0
    ? [[rb - b, 0], [rb - b * 0.3, b * 0.1], [rb, b], [rt, h - b], [rt - b * 0.3, h - b * 0.1], [rt - b, h]]
    : [[rb, 0], [rt, h]];
  return lathe(prof, seg, o, 0.9);
}

// ------------------------------------------------------------------------------------------------ tube
export interface TubeOpt {
  rect: UVRect;
  /** u = along metres, v = around; circumference mapped to `aroundM` metres of the rect (default: real circumference) */
  aroundM?: number;
  /** scale along-metres (e.g. rope texture scaled to rope thickness) */
  alongScale?: number;
  off?: [number, number];
  caps?: boolean;
}
/** tube along a curve with a radius function r(t); frames from the curve's Frenet frames (or a fixed up vector) */
export function tube(curve: THREE.Curve<THREE.Vector3>, segs: number, radius: number | ((t: number) => number), radial: number, o: TubeOpt, up?: THREE.Vector3): THREE.BufferGeometry {
  const rf = typeof radius === "number" ? () => radius : radius;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  let frames: { tangents: THREE.Vector3[]; normals: THREE.Vector3[]; binormals: THREE.Vector3[] } | null = null;
  if (!up) frames = curve.computeFrenetFrames(segs, false);
  const len = curve.getLength();
  const as = o.alongScale ?? 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    if (frames) { N.copy(frames.normals[i]); B.copy(frames.binormals[i]); }
    else { curve.getTangentAt(t, T); B.crossVectors(T, up!).normalize(); if (B.lengthSq() < 1e-6) B.set(1, 0, 0); N.crossVectors(B, T).normalize(); }
    const r = rf(t);
    const circ = Math.PI * 2 * r, am = o.aroundM ?? circ;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nx = c * N.x + s * B.x, ny = c * N.y + s * B.y, nz = c * N.z + s * B.z;
      pos.push(P.x + r * nx, P.y + r * ny, P.z + r * nz);
      nor.push(nx, ny, nz);
      uv.push(t * len * as, (j / radial) * am);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const u = new Float32Array(uv);
  toRect(u, o.rect, o.off);
  const g = geo(pos, nor, Array.from(u), idx);
  if (o.caps) {
    // small end caps (flat) — reuse the first/last ring
    const add = (ring: number, sign: number) => {
      const base = ring * (radial + 1);
      const c = new THREE.Vector3(); curve.getPointAt(ring === 0 ? 0 : 1, c);
      const tg = new THREE.Vector3(); curve.getTangentAt(ring === 0 ? 0 : 1, tg).multiplyScalar(sign);
      const P2 = g.attributes.position.array as Float32Array;
      const extraPos: number[] = [c.x, c.y, c.z], extraNor: number[] = [tg.x, tg.y, tg.z], extraUV: number[] = [(u[base * 2] + u[base * 2 + 2]) / 2, u[base * 2 + 1]];
      for (let j = 0; j <= radial; j++) { const k = (base + j) * 3; extraPos.push(P2[k], P2[k + 1], P2[k + 2]); extraNor.push(tg.x, tg.y, tg.z); extraUV.push(u[(base + j) * 2], u[(base + j) * 2 + 1]); }
      return { extraPos, extraNor, extraUV };
    };
    const parts = [add(0, -1), add(segs, 1)];
    const allPos = Array.from(g.attributes.position.array), allNor = Array.from(g.attributes.normal.array), allUV = Array.from(g.attributes.uv.array), allIdx = Array.from(g.index!.array);
    parts.forEach((pp, k) => {
      const c0 = allPos.length / 3;
      allPos.push(...pp.extraPos); allNor.push(...pp.extraNor); allUV.push(...pp.extraUV);
      for (let j = 0; j < radial; j++) { if (k === 0) allIdx.push(c0, c0 + 2 + j, c0 + 1 + j); else allIdx.push(c0, c0 + 1 + j, c0 + 2 + j); }
    });
    return geo(allPos, allNor, allUV, allIdx);
  }
  return g;
}

// ------------------------------------------------------------------------------------------------ grid / quad
/** flat grid in XY (w × h, bottom-left at 0,0) with metre uvs; `bend(x, y, out)` displaces vertices (normals recomputed) */
export function grid(w: number, h: number, nx: number, ny: number, rect: UVRect, bend?: (x: number, y: number, out: THREE.Vector3) => void, off: [number, number] = [0, 0], fit: "none" | "u" | "v" | "both" = "none"): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const v = new THREE.Vector3();
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = (i / nx) * w, y = (j / ny) * h;
    v.set(x, y, 0);
    if (bend) bend(x, y, v);
    pos.push(v.x, v.y, v.z);
    uv.push(x, y);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const u = new Float32Array(uv);
  toRect(u, rect, off, fit);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(Array.from(u), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** remap an existing geometry's 0..1 uvs into a rect (optionally scaling to metres first) */
export function remapUV(g: THREE.BufferGeometry, rect: UVRect, mu = rect.mu, mv = rect.mv) {
  const uv = g.attributes.uv.array as Float32Array;
  for (let i = 0; i < uv.length; i += 2) { uv[i] *= mu; uv[i + 1] *= mv; }
  toRect(uv, rect, [0, 0], "none");
  g.attributes.uv.needsUpdate = true;
  return g;
}

// ------------------------------------------------------------------------------------------------ batch
export type Tint = string | number | [number, number, number];
const _c = new THREE.Color();
export class Batch {
  readonly lists = new Map<string, THREE.BufferGeometry[]>();
  tris = 0;
  add(key: string, g: THREE.BufferGeometry, m?: THREE.Matrix4 | null, tint: Tint = "#ffffff", boost = 1): this {
    if (!g.index) { const n = g.attributes.position.count; g.setIndex(Array.from({ length: n }, (_, i) => i)); }
    // an existing vertex colour (baked AO etc.) is kept and multiplied by the tint
    const pre = g.attributes.color as THREE.BufferAttribute | undefined;
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    if (Array.isArray(tint)) _c.setRGB(tint[0], tint[1], tint[2]); else _c.set(tint as THREE.ColorRepresentation);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const pr = pre ? pre.getX(i) : 1, pg = pre ? pre.getY(i) : 1, pb = pre ? pre.getZ(i) : 1;
      col[i * 3] = _c.r * boost * pr; col[i * 3 + 1] = _c.g * boost * pg; col[i * 3 + 2] = _c.b * boost * pb;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    let l = this.lists.get(key);
    if (!l) this.lists.set(key, (l = []));
    l.push(g);
    this.tris += g.index!.count / 3;
    return this;
  }
  meshes(mats: Record<string, THREE.Material>, name = "lobby"): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const key of [...this.lists.keys()]) this.mergeKey(key, mats, name, out);
    this.lists.clear();
    return out;
  }
  /** the same merge, yielding between material batches (time-sliced build) */
  async meshesAsync(mats: Record<string, THREE.Material>, name: string, yieldFn: () => Promise<void>): Promise<THREE.Mesh[]> {
    const out: THREE.Mesh[] = [];
    for (const key of [...this.lists.keys()]) { await yieldFn(); this.mergeKey(key, mats, name, out); }
    this.lists.clear();
    return out;
  }
  private mergeKey(key: string, mats: Record<string, THREE.Material>, name: string, out: THREE.Mesh[]) {
    const list = this.lists.get(key)!;
    {
      if (!list.length) return;
      const merged = mergeGeometries(list, false);
      if (!merged) { console.warn("lobby: merge failed for", key); return; }
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mats[key]);
      mesh.name = `${name}:${key}`;
      mesh.castShadow = key !== "glow" && key !== "decal";
      mesh.receiveShadow = key !== "glow";
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      out.push(mesh);
      for (const g of list) g.dispose();
    }
  }
}
