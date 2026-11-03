// poi-harbor kit — ISO container geometry with real corrugation (trapezoid profile, crisp folds), corner posts +
// castings, rails, door end with lock rods / handles / hinges, floor + underside members. Non-indexed, flat normals,
// UVs into the 2048² per-colour atlas (see containers-tex.ts ATLAS). Local frame: length +X, width Z, height +Y from
// the ground plane, doors at +X. Every vertex also carries `wallUv` (x along the side in its reading direction, y up,
// flag 1 on the two long side walls) — the container shader stamps BANANA CO. decals from it (containers.ts).
import * as THREE from "three";
import { CONTAINER_DIMS, type ContainerSize } from "../../../../../shared/pois/harbor-kit";
import { ATLAS, PROFILE, SIDE_PERIODS, type Region } from "./containers-tex";

type V3 = [number, number, number];

/** tiny non-indexed geometry builder (positions/normals/uvs), flat shaded */
export class GB {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; wall: number[] = [];
  /** while set, quads get side-wall decal coordinates: "A" = +Z side (reads along +X), "B" = −Z side (reads along −X) */
  wallMode: "A" | "B" | null = null;
  /** the LOD box's flat sides (wallUv.z 3/4 instead of 1/2: the shader's corrugation fix-up stays off) */
  flatWall = false;
  /** added to wallUv.z (10 on 20 ft boxes: the shader needs the corrugation period) */
  sizeTag = 0;
  /** quad a→b→c→d (counter-clockwise seen from the normal side); uvs per corner */
  quad(a: V3, b: V3, c: V3, d: V3, ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number], n?: V3) {
    if (!n) {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nx = ab[1] * ac[2] - ab[2] * ac[1], ny = ab[2] * ac[0] - ab[0] * ac[2], nz = ab[0] * ac[1] - ab[1] * ac[0];
      const l = Math.hypot(nx, ny, nz) || 1; n = [nx / l, ny / l, nz / l];
    }
    for (const [p, t] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]] as Array<[V3, [number, number]]>) {
      this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(t[0], t[1]);
      if (this.wallMode === "A") this.wall.push(p[0], p[1], (this.flatWall ? 3 : 1) + this.sizeTag); else if (this.wallMode === "B") this.wall.push(-p[0], p[1], (this.flatWall ? 4 : 2) + this.sizeTag); else this.wall.push(0, 0, 0);
    }
  }
  /** axis-aligned box; every face is mapped (stretched) into `r`, or per-face via fn(nx,ny,nz) */
  box(min: V3, max: V3, r: Region | ((n: V3) => Region)) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const R = (n: V3) => (typeof r === "function" ? r(n) : r);
    const U = (rg: Region, s: number, t: number): [number, number] => [(rg.x + s * rg.w) / ATLAS.size, 1 - (rg.y + (1 - t) * rg.h) / ATLAS.size];
    let g: Region;
    g = R([0, 0, 1]); this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], U(g, 0, 0), U(g, 1, 0), U(g, 1, 1), U(g, 0, 1), [0, 0, 1]);
    g = R([0, 0, -1]); this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], U(g, 0, 0), U(g, 1, 0), U(g, 1, 1), U(g, 0, 1), [0, 0, -1]);
    g = R([1, 0, 0]); this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], U(g, 0, 0), U(g, 1, 0), U(g, 1, 1), U(g, 0, 1), [1, 0, 0]);
    g = R([-1, 0, 0]); this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], U(g, 0, 0), U(g, 1, 0), U(g, 1, 1), U(g, 0, 1), [-1, 0, 0]);
    g = R([0, 1, 0]); this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], U(g, 0, 0), U(g, 1, 0), U(g, 1, 1), U(g, 0, 1), [0, 1, 0]);
    g = R([0, -1, 0]); this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], U(g, 0, 0), U(g, 1, 0), U(g, 1, 1), U(g, 0, 1), [0, -1, 0]);
  }
  /** cylinder between two points, `seg` sides, no caps; mapped into r */
  cyl(a: V3, b: V3, radius: number, seg: number, r: Region) {
    const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], len = Math.hypot(ax, ay, az) || 1;
    const d: V3 = [ax / len, ay / len, az / len];
    const ref: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t1: V3 = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]];
    const l1 = Math.hypot(...t1); t1[0] /= l1; t1[1] /= l1; t1[2] /= l1;
    const t2: V3 = [d[1] * t1[2] - d[2] * t1[1], d[2] * t1[0] - d[0] * t1[2], d[0] * t1[1] - d[1] * t1[0]];
    const P = (i: number, at: V3): V3 => { const th = (i / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); return [at[0] + (t1[0] * c + t2[0] * s) * radius, at[1] + (t1[1] * c + t2[1] * s) * radius, at[2] + (t1[2] * c + t2[2] * s) * radius]; };
    const N = (i: number): V3 => { const th = (i / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); return [t1[0] * c + t2[0] * s, t1[1] * c + t2[1] * s, t1[2] * c + t2[2] * s]; };
    const uv = (s: number, t: number): [number, number] => [(r.x + s * r.w) / ATLAS.size, 1 - (r.y + (1 - t) * r.h) / ATLAS.size];
    for (let i = 0; i < seg; i++) {
      const p0 = P(i, a), p1 = P(i + 1, a), p2 = P(i + 1, b), p3 = P(i, b);
      const n0 = N(i), n1 = N(i + 1);
      // smooth-ish: average normal per quad is fine at r=2cm
      const n: V3 = [(n0[0] + n1[0]) / 2, (n0[1] + n1[1]) / 2, (n0[2] + n1[2]) / 2];
      this.quad(p0, p1, p2, p3, uv(i / seg, 0), uv((i + 1) / seg, 0), uv((i + 1) / seg, 1), uv(i / seg, 1), n);
    }
  }
  /**
   * Corrugated panel. origin + u·U + v·V + n(u)·N, u∈[0,len], v∈[0,h]. Profile: ridge 0 / valley −depth, trapezoid
   * with `periods` over len (ridge 28 %, flank 20 %, valley 32 %, flank 20 %). UV: u→region x, v→region y (bottom→top),
   * scaled so that u/len covers `uvSpan` of the region width starting at uvStart (0..1).
   */
  corrugated(origin: V3, U: V3, V: V3, N: V3, len: number, h: number, depth: number, periods: number, r: Region, uvStart = 0, uvSpan = 1, vStart = 0, vSpan = 1) {
    const P = len / periods;
    const folds: Array<[number, number]> = [];
    for (let i = 0; i < periods; i++) {
      const x = i * P;
      folds.push([x, 0], [x + PROFILE.C1 * P, 0], [x + PROFILE.F1 * P, -depth], [x + PROFILE.V1 * P, -depth]);
    }
    folds.push([len, 0]);
    const pt = (u: number, v: number, n: number): V3 => [origin[0] + U[0] * u + V[0] * v + N[0] * n, origin[1] + U[1] * u + V[1] * v + N[1] * n, origin[2] + U[2] * u + V[2] * v + N[2] * n];
    const uv = (u: number, v: number): [number, number] => [(r.x + (uvStart + uvSpan * (u / len)) * r.w) / ATLAS.size, 1 - (r.y + (1 - (vStart + vSpan * (v / h))) * r.h) / ATLAS.size];
    for (let i = 0; i < folds.length - 1; i++) {
      const [u0, n0] = folds[i], [u1, n1] = folds[i + 1];
      const a = pt(u0, 0, n0), b = pt(u1, 0, n1), c = pt(u1, h, n1), d = pt(u0, h, n0);
      // orient so the face normal agrees with N
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const nx = ab[1] * ad[2] - ab[2] * ad[1], ny = ab[2] * ad[0] - ab[0] * ad[2], nz = ab[0] * ad[1] - ab[1] * ad[0];
      if (nx * N[0] + ny * N[1] + nz * N[2] >= 0) this.quad(a, b, c, d, uv(u0, 0), uv(u1, 0), uv(u1, h), uv(u0, h));
      else this.quad(b, a, d, c, uv(u1, 0), uv(u0, 0), uv(u0, h), uv(u1, h));
    }
  }
  /** ONE quad origin → origin + len·U + h·V mapped to the sub-rectangle [u0,u1]×[v0,v1] of region r (v bottom→top) */
  rect(origin: V3, U: V3, V: V3, len: number, h: number, r: Region, u0 = 0, u1 = 1, v0 = 0, v1 = 1) {
    const pt = (u: number, v: number): V3 => [origin[0] + U[0] * u + V[0] * v, origin[1] + U[1] * u + V[1] * v, origin[2] + U[2] * u + V[2] * v];
    const uv = (s: number, t: number): [number, number] => [(r.x + s * r.w) / ATLAS.size, 1 - (r.y + (1 - t) * r.h) / ATLAS.size];
    this.quad(pt(0, 0), pt(len, 0), pt(len, h), pt(0, h), uv(u0, v0), uv(u1, v0), uv(u1, v1), uv(u0, v1));
  }
  /** flat quad in the same parametrisation (u along U, v along V) */
  flat(origin: V3, U: V3, V: V3, N: V3, len: number, h: number, r: Region, uvStart = 0, uvSpan = 1) {
    this.corrugated(origin, U, V, N, len, h, 0, 1, r, uvStart, uvSpan);
  }
  transform(m: THREE.Matrix4) {
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < this.pos.length; i += 3) {
      v.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]).applyMatrix4(m); this.pos[i] = v.x; this.pos[i + 1] = v.y; this.pos[i + 2] = v.z;
      v.set(this.nor[i], this.nor[i + 1], this.nor[i + 2]).applyMatrix3(nm).normalize(); this.nor[i] = v.x; this.nor[i + 1] = v.y; this.nor[i + 2] = v.z;
    }
    return this;
  }
  append(o: GB) { this.pos.push(...o.pos); this.nor.push(...o.nor); this.uv.push(...o.uv); this.wall.push(...o.wall); return this; }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("wallUv", new THREE.Float32BufferAttribute(this.wall, 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

export const POST = 0.16, TOP_RAIL_H = 0.17, BOT_RAIL_H = 0.23, SIDE_DEPTH = 0.06, END_DEPTH = 0.035, ROOF_DEPTH = 0.025;
export { PROFILE };
/** the long walls' ridge plane sits this far inside the rails' outer face (rails only 7 mm proud read as a thin flat
 *  band; this gives a chunky square rail with a shadow line under it) */
export const SIDE_INSET = 0.032;
export const sidePeriods = (size: ContainerSize) => (size === 40 ? SIDE_PERIODS : SIDE_PERIODS / 2);
/** side-wall corrugation period (m) and the wall's start offset (the shader's fold phase) */
export const sidePeriod = (size: ContainerSize) => { const [a, b] = sideRange(size); return (b - a) / sidePeriods(size); };
/** the side-wall panel u-range in local x */
export const sideRange = (size: ContainerSize) => { const L = CONTAINER_DIMS[size].L; return [-L / 2 + POST, L / 2 - POST] as [number, number]; };

/** the door leaf, built at its hinge (u toward the free edge, v up, n outward), including hardware */
function doorLeaf(size: ContainerSize, hingeSide: 1 | -1, region: Region, uvStart: number, uvSpan: number): GB {
  const { H, W } = CONTAINER_DIMS[size];
  const g = new GB();
  const w = (W - 2 * POST) / 2, h = H - BOT_RAIL_H - TOP_RAIL_H - 0.04;  // leaf height
  const y0 = BOT_RAIL_H + 0.02;
  // local axes: u = +Z·hingeSide (toward the free edge), v = +Y, n = +X
  const U: V3 = [0, 0, hingeSide], V: V3 = [0, 1, 0], N: V3 = [1, 0, 0];
  const at = (u: number, v: number, n: number): V3 => [n, y0 + v, u * hingeSide];
  const uvR = (s0: number, s1: number, t0: number, t1: number): Region => ({ x: region.x + (uvStart + uvSpan * s0) * region.w, y: region.y + (1 - t1) * region.h, w: (s1 - s0) * uvSpan * region.w, h: (t1 - t0) * region.h });
  // frame border (0.07 wide, 0.05 thick) + recessed corrugated panel
  const b = 0.07, T = 0.05;
  const bx = (u0: number, u1: number, v0: number, v1: number) => {
    const p0 = at(Math.min(u0, u1), v0, 0), p1 = at(Math.max(u0, u1), v1, T);
    g.box([Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])], uvR(u0 / w, u1 / w, v0 / h, v1 / h));
  };
  bx(0, b, 0, h); bx(w - b, w, 0, h); bx(b, w - b, 0, b); bx(b, w - b, h - b, h);
  g.corrugated(at(b, b, T - 0.005), U, V, N, w - 2 * b, h - 2 * b, 0.03, 4, region, uvStart + uvSpan * (b / w), uvSpan * ((w - 2 * b) / w), b / h, (h - 2 * b) / h);
  // back face of the leaf (seen when open): the same corrugated steel sheet, painted, gasket border (the doorIn region
  // holds both leaves side by side)
  g.corrugated(at(0, 0, -0.002), U, V, [-1, 0, 0], w, h, 0.025, 4, ATLAS.doorIn, hingeSide > 0 ? 0.5 : 0, 0.5);
  // inner stiffeners: two horizontal channels across the leaf (catch the light when the door hangs open)
  for (const sv of [0.3, 0.7]) {
    const p0 = at(0.05, sv * h - 0.05, -0.07), p1 = at(w - 0.05, sv * h + 0.05, -0.002);
    g.box([Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])], uvR(0.05, 0.95, sv - 0.03, sv + 0.03));
  }
  // hardware: lock rods, brackets, handles, keepers, hinges (dark steel region)
  const hw = ATLAS.hardware;
  for (const ru of [0.36 * w, 0.72 * w]) {
    g.cyl(at(ru, 0.06, T + 0.05), at(ru, h - 0.06, T + 0.05), 0.02, 8, hw);
    for (const bv of [0.16, 0.5, 0.84]) {
      const p0 = at(ru - 0.035, bv * h - 0.04, T), p1 = at(ru + 0.035, bv * h + 0.04, T + 0.085);
      g.box([Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])], hw);
    }
    // handle: a bar toward the free edge at chest height
    const h0 = at(ru - 0.02, 0.44 * h - 0.025, T + 0.06), h1 = at(ru + 0.3, 0.44 * h + 0.025, T + 0.1);
    g.box([Math.min(h0[0], h1[0]), Math.min(h0[1], h1[1]), Math.min(h0[2], h1[2])], [Math.max(h0[0], h1[0]), Math.max(h0[1], h1[1]), Math.max(h0[2], h1[2])], hw);
    // keepers top/bottom
    for (const kv of [-0.02, h - 0.1]) {
      const k0 = at(ru - 0.045, kv, T), k1 = at(ru + 0.045, kv + 0.12, T + 0.1);
      g.box([Math.min(k0[0], k1[0]), Math.min(k0[1], k1[1]), Math.min(k0[2], k1[2])], [Math.max(k0[0], k1[0]), Math.max(k0[1], k1[1]), Math.max(k0[2], k1[2])], hw);
    }
  }
  for (const hv of [0.12, 0.4, 0.68, 0.93]) {
    const p0 = at(-0.03, hv * h - 0.07, 0.01), p1 = at(0.07, hv * h + 0.07, T + 0.03);
    g.box([Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])], hw);
  }
  return g;
}

/**
 * Full container geometry. `open`: doors flung open (leaf angles in radians, hinge side +Z leaf first).
 */
export function containerGeometry(size: ContainerSize, open: false | [number, number] = false, enter = false): THREE.BufferGeometry {
  const { L, W, H } = CONTAINER_DIMS[size];
  const g = new GB();
  g.sizeTag = size === 20 ? 10 : 0;
  const [sx0, sx1] = sideRange(size), slen = sx1 - sx0, per = sidePeriods(size);
  const sideSpan = size === 40 ? 1 : 0.5; // 20 ft uses half the side region (same texel density)
  const wallY0 = BOT_RAIL_H, wallH = H - TOP_RAIL_H - BOT_RAIL_H;
  // side walls (+Z = side A, −Z = side B). Ridge plane just inside the posts' outer face.
  const zr = W / 2 - SIDE_INSET;
  g.wallMode = "A";
  g.corrugated([sx0, wallY0, zr], [1, 0, 0], [0, 1, 0], [0, 0, 1], slen, wallH, SIDE_DEPTH, per, ATLAS.sideA, 0, sideSpan);
  g.wallMode = "B";
  g.corrugated([sx1, wallY0, -zr], [-1, 0, 0], [0, 1, 0], [0, 0, -1], slen, wallH, SIDE_DEPTH, per, ATLAS.sideB, 0, sideSpan);
  g.wallMode = null;
  // front end (−X), vertical ribs across the width
  const ew = W - 2 * POST;
  g.corrugated([-L / 2 + 0.012, wallY0, ew / 2], [0, 0, -1], [0, 1, 0], [-1, 0, 0], ew, wallH, END_DEPTH, 7, ATLAS.endF);
  // roof: transverse ribs, same pitch as the sides
  // (the sheet tucks 1 cm under the 13 cm top side rails — stopping short of them leaves a slot in the roof)
  const rw = W - 2 * 0.13 + 0.02;
  g.corrugated([sx0, H - 0.02, -rw / 2], [1, 0, 0], [0, 0, 1], [0, 1, 0], slen, rw, ROOF_DEPTH, per, ATLAS.roof, 0, sideSpan);
  // floor (plywood) + underside plate + cross members
  g.flat([sx0, BOT_RAIL_H, W / 2 - 0.08], [1, 0, 0], [0, 0, -1], [0, 1, 0], slen, W - 0.16, ATLAS.floor, 0, sideSpan);
  g.flat([sx0, 0.05, -W / 2 + 0.08], [1, 0, 0], [0, 0, 1], [0, -1, 0], slen, W - 0.16, ATLAS.under, 0, sideSpan);
  const nCross = size === 40 ? 9 : 5;
  for (let i = 0; i < nCross; i++) {
    const x = sx0 + 0.3 + (slen - 0.6) * (i / (nCross - 1));
    g.box([x - 0.03, 0.05, -W / 2 + 0.1], [x + 0.03, BOT_RAIL_H - 0.02, W / 2 - 0.1], ATLAS.cross);
  }
  // frame: corner posts, castings, rails. Castings stand 12 mm proud of every face (they carry the box) and are painted
  // with it (oval apertures in the atlas); the rails are chunky square sections flush with the castings' inner line.
  const postR = ATLAS.post, railR = ATLAS.railTop, brailR = ATLAS.railBot, castR = ATLAS.casting;
  // (chunky castings, 2.5 cm proud, so the corner blocks read at 20 m)
  const CX = 0.22, CY = 0.16, CZ = 0.19, PR = 0.025;
  for (const sxp of [-1, 1]) for (const szp of [-1, 1]) {
    const x0 = sxp * (L / 2) - (sxp > 0 ? POST : 0), z0 = szp * (W / 2) - (szp > 0 ? POST : 0);
    g.box([x0, CY, z0], [x0 + POST, H - CY, z0 + POST], postR);
    const cxA = sxp > 0 ? L / 2 - CX : -L / 2 - PR, cxB = sxp > 0 ? L / 2 + PR : -L / 2 + CX;
    const czA = szp > 0 ? W / 2 - CZ : -W / 2 - PR, czB = szp > 0 ? W / 2 + PR : -W / 2 + CZ;
    g.box([cxA, 0, czA], [cxB, CY, czB], castR);
    g.box([cxA, H - CY, czA], [cxB, H + PR, czB], castR);
  }
  for (const szp of [-1, 1]) {
    // top side rail: a 17 cm square tube; bottom side rail: a deep C-section (fork pockets in the atlas)
    const zi = szp > 0 ? [W / 2 - 0.13, W / 2] : [-W / 2, -W / 2 + 0.13];
    g.box([sx0 + CX - POST, H - TOP_RAIL_H, zi[0]], [sx1 - CX + POST, H - 0.004, zi[1]], railR);
    const zb = szp > 0 ? [W / 2 - 0.15, W / 2] : [-W / 2, -W / 2 + 0.15];
    g.box([sx0 + CX - POST, 0.03, zb[0]], [sx1 - CX + POST, BOT_RAIL_H, zb[1]], brailR);
  }
  for (const sxp of [-1, 1]) {
    const xi = sxp > 0 ? [L / 2 - 0.13, L / 2] : [-L / 2, -L / 2 + 0.13];
    g.box([xi[0], H - TOP_RAIL_H, -W / 2 + CZ], [xi[1], H - 0.004, W / 2 - CZ], railR);
    g.box([xi[0], 0.03, -W / 2 + CZ], [xi[1], BOT_RAIL_H, W / 2 - CZ], brailR);
  }
  // doors: leaf A hinged at +Z, leaf B hinged at −Z; both live in the endD region (A on the left half seen from +X)
  const leafA = doorLeaf(size, -1, ATLAS.endD, 0.5, 0.5);   // hinge at +Z, free edge toward −Z
  const leafB = doorLeaf(size, 1, ATLAS.endD, 0, 0.5);      // hinge at −Z, free edge toward +Z
  const hingeZ = W / 2 - POST;
  const placeLeaf = (leaf: GB, hz: number, angle: number) => {
    const m = new THREE.Matrix4().makeTranslation(L / 2 - 0.06, 0, hz).multiply(new THREE.Matrix4().makeRotationY(angle));
    g.append(leaf.transform(m));
  };
  // opening: leaf A (hinge +Z) swings outward with a NEGATIVE yaw, leaf B with a POSITIVE yaw
  placeLeaf(leafA, hingeZ, open ? -open[0] : 0);
  placeLeaf(leafB, -hingeZ, open ? open[1] : 0);
  if (open) {
    // every open box, the spill ones too (open interiors would otherwise read as flat black voids):
    // a painted liner on the inside of both walls, the front end and the ceiling (front-facing, so it is lit like a room
    // instead of the dimmed back faces)
    const zi = W / 2 - SIDE_INSET - SIDE_DEPTH - 0.012, yi0 = BOT_RAIL_H, yi1 = H - TOP_RAIL_H - 0.03, seg = 2.2;
    const x0i = -L / 2 + 0.06, x1i = L / 2 - 0.1, n = Math.max(1, Math.round((x1i - x0i) / seg)), sl = (x1i - x0i) / n;
    for (let i = 0; i < n; i++) {
      const xa = x0i + i * sl;
      g.rect([xa, yi0, -zi], [1, 0, 0], [0, 1, 0], sl, yi1 - yi0, ATLAS.endF);            // −Z wall, facing +Z (inward)
      g.rect([xa + sl, yi0, zi], [-1, 0, 0], [0, 1, 0], sl, yi1 - yi0, ATLAS.endF);       // +Z wall, facing −Z
      g.rect([xa, yi1, -zi], [1, 0, 0], [0, 0, 1], sl, 2 * zi, ATLAS.endF);               // ceiling, facing down
    }
    g.rect([x0i + 0.02, yi0, zi], [0, 0, -1], [0, 1, 0], 2 * zi, yi1 - yi0, ATLAS.endF);   // the closed end, facing +X
  }
  if (open && enter) {
    // a few carton stacks + a pallet at the back of the enterable box
    const x0i = -L / 2 + 0.06;
    const cw = 0.5, ch = 0.3, cd = 0.4, rnd = (i: number) => { const v = Math.sin(i * 12.9898 + size) * 43758.5453; return v - Math.floor(v); };
    // (a cargo WALL — two rows of cartons stacked to the ceiling, 4 across; its collider is one solid block)
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
      const tall = 7;
      for (let l = 0; l < tall; l++) {
        const k = row * 40 + col * 8 + l, j = (rnd(k) - 0.5) * 0.06;
        const xc = x0i + 0.3 + row * (cd + 0.03), zc = -W / 2 + 0.38 + col * (cw + 0.06) + j, yc = BOT_RAIL_H + ch / 2 + l * (ch + 0.005);
        g.box([xc - cd / 2, yc - ch / 2, zc - cw / 2], [xc + cd / 2, yc + ch / 2, zc + cw / 2], ATLAS.carton);
      }
    }
  } else if (open) {
    // cargo seen through the open doors: banana cartons stacked five high on the plywood floor, the front rows
    // tumbled (the doors burst open under their weight), a dark gap behind
    const cw = 0.5, ch = 0.3, cd = 0.4, x0 = L / 2 - 0.35, rnd = (i: number) => { const v = Math.sin(i * 12.9898 + size) * 43758.5453; return v - Math.floor(v); };
    for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) {
      const tall = row < 2 ? 5 - (col % 2) - row * 2 : 6 - (col === 1 ? 1 : 0);
      for (let l = 0; l < tall; l++) {
        const k = row * 40 + col * 8 + l, j = (rnd(k) - 0.5) * 0.06, lean = row < 2 && l === tall - 1 ? 0.12 : 0;
        const xc = x0 - 0.3 - row * (cd + 0.02) - (row < 2 ? 0.05 : 0), zc = -W / 2 + 0.28 + col * (cw + 0.06) + j, yc = BOT_RAIL_H + ch / 2 + l * (ch + 0.005);
        if (row === 0 && l > 2) continue;
        if (yc > H - TOP_RAIL_H - 0.2) continue;
        g.box([xc - cd / 2 + lean, yc - ch / 2, zc - cw / 2], [xc + cd / 2 + lean, yc + ch / 2, zc + cw / 2], ATLAS.carton);
      }
    }
  }
  return g.build();
}

/**
 * LOD box (~30 tris): the silhouette + the frame read (posts, top/bottom rails as their own atlas strips) + painted
 * walls/roof/ends. Side strips carry wallUv so the decal stamps survive. `open`: +X end shows the dark interior and
 * two door leaves swung open (single quads, double-sided material).
 */
export function containerLodGeometry(size: ContainerSize, open: false | [number, number] = false): THREE.BufferGeometry {
  const { L, W, H } = CONTAINER_DIMS[size];
  const g = new GB();
  g.flatWall = true;
  g.sizeTag = size === 20 ? 10 : 0;
  const span = size === 40 ? 1 : 0.5, x0 = -L / 2, x1 = L / 2, z = W / 2;
  const side = (s: 1 | -1) => {
    // s=+1: +Z face, reads along +X; s=-1: −Z face, reads along −X
    const U: V3 = [s, 0, 0], V: V3 = [0, 1, 0], o = (x: number, y: number): V3 => [s > 0 ? x : -x, y, s * z];
    const reg = s > 0 ? ATLAS.sideA : ATLAS.sideB;
    g.rect(o(x0, 0), U, V, POST, H, ATLAS.post);
    g.rect(o(x1 - POST, 0), U, V, POST, H, ATLAS.post);
    g.wallMode = s > 0 ? "A" : "B";
    g.rect(o(x0 + POST, 0), U, V, L - 2 * POST, BOT_RAIL_H, ATLAS.railBot, 0, span);
    g.rect(o(x0 + POST, BOT_RAIL_H), U, V, L - 2 * POST, H - BOT_RAIL_H - TOP_RAIL_H, reg, 0, span);
    g.rect(o(x0 + POST, H - TOP_RAIL_H), U, V, L - 2 * POST, TOP_RAIL_H, ATLAS.railTop, 0, span);
    g.wallMode = null;
  };
  side(1); side(-1);
  g.rect([x0, H, z], [1, 0, 0], [0, 0, -1], L, W, ATLAS.roof, 0, span);
  g.rect([x0, 0, -z], [1, 0, 0], [0, 0, 1], L, W, ATLAS.under, 0, span);
  g.rect([x0, 0, -z], [0, 0, 1], [0, 1, 0], W, H, ATLAS.endF);
  if (!open) {
    // the door end mapped EXACTLY like the full model's two leaves (each leaf from its hinge at the outer edge to the
    // centre seam: leaf B (−Z) = region s 0…0.5, leaf A (+Z) = s 0.5…1), framed by the corner posts + end rails, so the
    // painted hardware lines up with the geometry and reads on the ~30-tri box
    const lw = W / 2 - POST, ly0 = BOT_RAIL_H + 0.02, lh = H - BOT_RAIL_H - TOP_RAIL_H - 0.04;
    g.rect([x1, ly0, 0], [0, 0, -1], [0, 1, 0], lw, lh, ATLAS.endD, 0.5, 0);                  // leaf B: centre → hinge (−Z)
    g.rect([x1, ly0, z - POST], [0, 0, -1], [0, 1, 0], lw, lh, ATLAS.endD, 0.5, 1);          // leaf A: hinge (+Z) → centre
    for (const zz of [z, -z + POST]) g.rect([x1, 0, zz], [0, 0, -1], [0, 1, 0], POST, H, ATLAS.post);
    g.rect([x1, H - TOP_RAIL_H - 0.02, z - POST], [0, 0, -1], [0, 1, 0], W - 2 * POST, TOP_RAIL_H + 0.02, ATLAS.railTop, 0, 0.2);
    g.rect([x1, 0, z - POST], [0, 0, -1], [0, 1, 0], W - 2 * POST, ly0, ATLAS.railBot, 0, 0.2);
  }
  else {
    g.rect([x1 - 0.05, 0.05, z - 0.1], [0, 0, -1], [0, 1, 0], W - 0.2, H - 0.1, ATLAS.inside);
    // leaves hinged at ±Z, swung by the given angles (A at +Z first)
    const leaf = (hz: number, ang: number, freeDir: 1 | -1, half: 0 | 0.5) => {
      const w = W / 2 - 0.02, hx = x1, a = ang;
      const ux = Math.sin(a) * -freeDir * -1, uz = Math.cos(a) * freeDir;
      const Uv: V3 = [ux, 0, uz], o: V3 = [hx, 0.1, hz];
      g.rect(o, Uv, [0, 1, 0], w, H - 0.2, ATLAS.endD, half, half + 0.5);
    };
    leaf(z, -open[0], -1, 0.5);
    leaf(-z, open[1], 1, 0);
  }
  return g.build();
}

/**
 * MID level (the LOD box alone reads as a flat printed wall at 20–40 m): the full model's corrugated long walls
 * (real rib silhouettes + shading at the stack edges), chunky posts, rails and corner castings as boxes, and the LOD
 * box's painted roof / ends / door leaves — ≈ 1 k tris (full model ≈ 2.4 k, box 36).
 */
export function containerMidGeometry(size: ContainerSize, open: false | [number, number] = false): THREE.BufferGeometry {
  const { L, W, H } = CONTAINER_DIMS[size];
  const g = new GB();
  g.sizeTag = size === 20 ? 10 : 0;
  const [sx0, sx1] = sideRange(size), slen = sx1 - sx0, per = sidePeriods(size), span = size === 40 ? 1 : 0.5;
  const wallY0 = BOT_RAIL_H, wallH = H - TOP_RAIL_H - BOT_RAIL_H, zr = W / 2 - SIDE_INSET;
  g.wallMode = "A";
  g.corrugated([sx0, wallY0, zr], [1, 0, 0], [0, 1, 0], [0, 0, 1], slen, wallH, SIDE_DEPTH, per, ATLAS.sideA, 0, span);
  g.wallMode = "B";
  g.corrugated([sx1, wallY0, -zr], [-1, 0, 0], [0, 1, 0], [0, 0, -1], slen, wallH, SIDE_DEPTH, per, ATLAS.sideB, 0, span);
  g.wallMode = null;
  // roof (painted ribs), underside, front end (painted corrugation) as single quads
  g.rect([-L / 2, H - 0.02, W / 2], [1, 0, 0], [0, 0, -1], L, W, ATLAS.roof, 0, span);
  g.rect([-L / 2, 0.03, -W / 2], [1, 0, 0], [0, 0, 1], L, W, ATLAS.under, 0, span);
  g.rect([-L / 2 + 0.012, 0, -W / 2], [0, 0, 1], [0, 1, 0], W, H, ATLAS.endF);
  // frame: posts, top/bottom rails (all four sides), corner castings — boxes
  const CX = 0.22, CY = 0.16, CZ = 0.19, PR = 0.025;
  for (const sxp of [-1, 1]) for (const szp of [-1, 1]) {
    const x0 = sxp * (L / 2) - (sxp > 0 ? POST : 0), z0 = szp * (W / 2) - (szp > 0 ? POST : 0);
    g.box([x0, CY, z0], [x0 + POST, H - CY, z0 + POST], ATLAS.post);
    const cxA = sxp > 0 ? L / 2 - CX : -L / 2 - PR, cxB = sxp > 0 ? L / 2 + PR : -L / 2 + CX;
    const czA = szp > 0 ? W / 2 - CZ : -W / 2 - PR, czB = szp > 0 ? W / 2 + PR : -W / 2 + CZ;
    g.box([cxA, 0, czA], [cxB, CY, czB], ATLAS.casting);
    g.box([cxA, H - CY, czA], [cxB, H + PR, czB], ATLAS.casting);
  }
  for (const szp of [-1, 1]) {
    const zi = szp > 0 ? [W / 2 - 0.13, W / 2] : [-W / 2, -W / 2 + 0.13];
    g.box([sx0 + CX - POST, H - TOP_RAIL_H, zi[0]], [sx1 - CX + POST, H - 0.004, zi[1]], ATLAS.railTop);
    const zb = szp > 0 ? [W / 2 - 0.15, W / 2] : [-W / 2, -W / 2 + 0.15];
    g.box([sx0 + CX - POST, 0.03, zb[0]], [sx1 - CX + POST, BOT_RAIL_H, zb[1]], ATLAS.railBot);
  }
  const x1 = L / 2;
  if (!open) {
    // door end: the LOD box's two painted leaves (hardware painted in), end rails as boxes
    const lw = W / 2 - POST, ly0 = BOT_RAIL_H + 0.02, lh = H - BOT_RAIL_H - TOP_RAIL_H - 0.04;
    g.rect([x1 - 0.02, ly0, 0], [0, 0, -1], [0, 1, 0], lw, lh, ATLAS.endD, 0.5, 0);
    g.rect([x1 - 0.02, ly0, W / 2 - POST], [0, 0, -1], [0, 1, 0], lw, lh, ATLAS.endD, 0.5, 1);
    g.box([x1 - 0.13, H - TOP_RAIL_H, -W / 2 + CZ], [x1, H - 0.004, W / 2 - CZ], ATLAS.railTop);
    g.box([x1 - 0.13, 0.03, -W / 2 + CZ], [x1, BOT_RAIL_H, W / 2 - CZ], ATLAS.railBot);
  } else {
    g.rect([x1 - 0.05, 0.05, W / 2 - 0.1], [0, 0, -1], [0, 1, 0], W - 0.2, H - 0.1, ATLAS.inside);
    const leaf = (hz: number, ang: number, freeDir: 1 | -1, half: 0 | 0.5) => {
      const w = W / 2 - 0.02;
      const Uv: V3 = [Math.sin(ang) * freeDir, 0, Math.cos(ang) * freeDir];
      g.rect([x1, 0.1, hz], Uv, [0, 1, 0], w, H - 0.2, ATLAS.endD, half, half + 0.5);
    };
    leaf(W / 2, -open[0], -1, 0.5);
    leaf(-W / 2, open[1], 1, 0);
  }
  { const xi = [-L / 2, -L / 2 + 0.13]; g.box([xi[0], H - TOP_RAIL_H, -W / 2 + CZ], [xi[1], H - 0.004, W / 2 - CZ], ATLAS.railTop); g.box([xi[0], 0.03, -W / 2 + CZ], [xi[1], BOT_RAIL_H, W / 2 - CZ], ATLAS.railBot); }
  return g.build();
}

/**
 * Decal strip: a corrugated section of side A (+Z) covering local x∈[x0,x1], y∈[y0,y1], 4 mm proud, UV 0..1.
 * Used for painted text / logos so they sit exactly on the ridges and valleys. For side B, instance it with a 180°
 * yaw about the container centre.
 */
export function decalGeometry(size: ContainerSize, x0: number, x1: number, y0: number, y1: number): THREE.BufferGeometry {
  const { W } = CONTAINER_DIMS[size];
  const [sx0, sx1] = sideRange(size), slen = sx1 - sx0, per = sidePeriods(size), P = slen / per;
  const g = new GB();
  // build fold list across the range in the wall parametrisation (u from sx0)
  const { C1, F1, V1 } = PROFILE;
  const profile = (u: number) => { const f = ((u % P) + P) % P; const t = f / P; return t < C1 ? 0 : t < F1 ? -SIDE_DEPTH * ((t - C1) / (F1 - C1)) : t < V1 ? -SIDE_DEPTH : -SIDE_DEPTH * (1 - (t - V1) / (1 - V1)); };
  const us: number[] = [x0 - sx0];
  for (let i = 0; i <= per; i++) for (const f of [0, C1, F1, V1]) { const u = i * P + f * P; if (u > x0 - sx0 && u < x1 - sx0) us.push(u); }
  us.push(x1 - sx0); us.sort((a, b) => a - b);
  const zr = W / 2 - SIDE_INSET + 0.004;
  const fake: Region = { x: 0, y: 0, w: ATLAS.size, h: ATLAS.size };
  for (let i = 0; i < us.length - 1; i++) {
    const u0 = us[i], u1 = us[i + 1];
    if (u1 - u0 < 1e-4) continue;
    const n0 = profile(u0 + 1e-5), n1 = profile(u1 - 1e-5);
    const a: V3 = [sx0 + u0, y0, zr + n0], b: V3 = [sx0 + u1, y0, zr + n1], c: V3 = [sx0 + u1, y1, zr + n1], d: V3 = [sx0 + u0, y1, zr + n0];
    const s0 = (u0 - (x0 - sx0)) / (x1 - x0), s1 = (u1 - (x0 - sx0)) / (x1 - x0);
    const uv = (s: number, t: number): [number, number] => [(fake.x + s * fake.w) / ATLAS.size, 1 - (fake.y + (1 - t) * fake.h) / ATLAS.size];
    g.quad(a, b, c, d, uv(s0, 0), uv(s1, 0), uv(s1, 1), uv(s0, 1));
  }
  return g.build();
}
