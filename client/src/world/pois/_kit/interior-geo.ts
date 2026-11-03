// interiors — geometry accumulator for the furnishing kit: every piece is appended (already transformed) into one
// buffer per material family, so a whole building's furniture is a handful of draw calls. Chamfered boxes carry the
// toy-like bevel; their chamfer faces get a lighter "worn edge" vertex colour (painted edge wear for free).
import * as THREE from "three";

export type MatKey = "wood" | "paint" | "fabric" | "metal" | "stone" | "leaf" | "glow" | "glass" | "goods" | "art" | "rug" | "sign"
  | "plaster" | "wl-block" | "ceil" | "fl-planks" | "fl-boards" | "fl-tiles" | "fl-checker" | "fl-concrete" | "fl-stone" | "fl-deck" | "fx" | "fxwin"
  | "cloth" | "hazard" | "screen" | "fxwash" | "neon" | "shadow" | "fire";

/** growable float buffer (a number[] + push was the kit's hot path in a Mango Market profile) */
class FBuf {
  a = new Float32Array(4096); n = 0;
  reserve(k: number) { if (this.n + k > this.a.length) { let m = this.a.length * 2; while (m < this.n + k) m *= 2; const b = new Float32Array(m); b.set(this.a.subarray(0, this.n)); this.a = b; } }
  view() { return this.a.subarray(0, this.n); }
}
class Acc {
  p = new FBuf(); n = new FBuf(); uv = new FBuf(); c = new FBuf(); ao = new FBuf(); lamp = new FBuf();
  tris = 0;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** chamfered box (flat shaded, non-indexed), b = chamfer */
export function chamfer(w: number, h: number, d: number, b: number): THREE.BufferGeometry {
  b = Math.max(0, Math.min(b, w * 0.45, h * 0.45, d * 0.45));
  const key = `c${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${b.toFixed(3)}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry;
  if (b < 1e-3) g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  else {
    type V = [number, number, number];
    const X = w / 2, Y = h / 2, Z = d / 2, pos: number[] = [];
    const tri = (a: V, c: V, e: V) => pos.push(...a, ...c, ...e);
    const quad = (a: V, c: V, e: V, f: V) => { tri(a, c, e); tri(a, e, f); };
    quad([-X + b, -Y + b, Z], [X - b, -Y + b, Z], [X - b, Y - b, Z], [-X + b, Y - b, Z]);
    quad([X - b, -Y + b, -Z], [-X + b, -Y + b, -Z], [-X + b, Y - b, -Z], [X - b, Y - b, -Z]);
    quad([X, -Y + b, Z - b], [X, -Y + b, -Z + b], [X, Y - b, -Z + b], [X, Y - b, Z - b]);
    quad([-X, -Y + b, -Z + b], [-X, -Y + b, Z - b], [-X, Y - b, Z - b], [-X, Y - b, -Z + b]);
    quad([-X + b, Y, Z - b], [X - b, Y, Z - b], [X - b, Y, -Z + b], [-X + b, Y, -Z + b]);
    quad([-X + b, -Y, -Z + b], [X - b, -Y, -Z + b], [X - b, -Y, Z - b], [-X + b, -Y, Z - b]);
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) quad([-X + b, sy * Y, sz * (Z - b)], [X - b, sy * Y, sz * (Z - b)], [X - b, sy * (Y - b), sz * Z], [-X + b, sy * (Y - b), sz * Z]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) quad([sx * (X - b), -Y + b, sz * Z], [sx * X, -Y + b, sz * (Z - b)], [sx * X, Y - b, sz * (Z - b)], [sx * (X - b), Y - b, sz * Z]);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) quad([sx * X, sy * (Y - b), -Z + b], [sx * X, sy * (Y - b), Z - b], [sx * (X - b), sy * Y, Z - b], [sx * (X - b), sy * Y, -Z + b]);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) tri([sx * X, sy * (Y - b), sz * (Z - b)], [sx * (X - b), sy * Y, sz * (Z - b)], [sx * (X - b), sy * (Y - b), sz * Z]);
    for (let i = 0; i < pos.length; i += 9) {
      const ax = pos[i], ay = pos[i + 1], az = pos[i + 2], bx = pos[i + 3] - ax, by = pos[i + 4] - ay, bz = pos[i + 5] - az, cx = pos[i + 6] - ax, cy = pos[i + 7] - ay, cz = pos[i + 8] - az;
      const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
      if (nx * (ax + bx / 3 + cx / 3) + ny * (ay + by / 3 + cy / 3) + nz * (az + bz / 3 + cz / 3) < 0) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
    }
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
  }
  geoCache.set(key, g);
  return g;
}
function cached(key: string, make: () => THREE.BufferGeometry) { let g = geoCache.get(key); if (!g) { g = make(); if (g.index) g = g.toNonIndexed(); geoCache.set(key, g); } return g; }
export const cylGeo = (rt: number, rb: number, h: number, seg = 12, open = false) => cached(`y${rt.toFixed(3)}|${rb.toFixed(3)}|${h.toFixed(3)}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const sphGeo = (r: number, detail = 1) => cached(`s${r.toFixed(3)}|${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
export const torusGeo = (R: number, r: number, seg = 16) => cached(`t${R.toFixed(3)}|${r.toFixed(3)}|${seg}`, () => new THREE.TorusGeometry(R, r, 6, seg));
export const boxGeo = (w: number, h: number, d: number) => cached(`b${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`, () => new THREE.BoxGeometry(w, h, d));
/** a plane (facing +z, centred) tessellated to ~`cell` m quads — room shell faces (only the visible side) */
export const tessPlaneGeo = (w: number, h: number, cell = 0.5) => {
  const sx = Math.max(1, Math.min(40, Math.round(w / cell))), sy = Math.max(1, Math.min(40, Math.round(h / cell)));
  return cached(`tp${w.toFixed(3)}|${h.toFixed(3)}|${sx}|${sy}`, () => new THREE.PlaneGeometry(w, h, sx, sy));
};
/** a banana: a torus arc (R 0.1, tube 0.021, 1.5 rad), re-centred on the arc's middle, lying in XY */
export const bananaGeo = () => cached("banana", () => { const g = new THREE.TorusGeometry(0.1, 0.027, 5, 7, 1.55); g.translate(-0.1 * Math.cos(0.775), -0.1 * Math.sin(0.775), 0); return g; });
export const planeGeo = () => cached("plane", () => new THREE.PlaneGeometry(1, 1));

export interface PushOpts {
  /** "box": uvs from the local position by face normal (metres × uvScale); "geo": keep the geometry's uvs; "rect": map the geo's uv into [u0,v0,u1,v1] */
  uv?: "box" | "geo" | "rect" | "wall";
  /** "wall": uv = (local x + uvOff[0], local y + uvOff[1]) × uvScale on every face — continuous across split wall pieces */
  uvOff?: [number, number];
  uvScale?: number;
  rect?: [number, number, number, number];
  /** worn edges: chamfer faces get the colour lifted toward `edge` by this amount (0..1). Default 0.35 */
  wear?: number;
  edge?: THREE.Color;
  /** darken faces pointing down (cheap contact AO) — default 0.25 */
  under?: number;
  /** vertical gradient: bottom of the piece darkened by this (0..1) */
  grime?: number;
}

const _m3 = new THREE.Matrix3(), _rq = new THREE.Matrix3(), _c = new THREE.Color(), _m2 = new THREE.Matrix4();
const WHITE = new THREE.Color(1, 1, 1);

/** per-vertex light in the ROOM frame: (x, y, z, nx, ny, nz) → out[0] local occlusion 0..1, out[1] sky visibility 0..1,
 *  out[2..4] baked lamp irradiance (linear RGB, the room's emissive fixtures) */
export type AoFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, out: number[]) => void;

export class IBuilder {
  bins = new Map<MatKey, Acc>();
  /** item → group transform (set per item by the caller) */
  base = new THREE.Matrix4();
  /** group → room frame (for `ao`) */
  toRoom = new THREE.Matrix4();
  /** per-vertex occlusion (null = none: 1, 1) */
  ao: AoFn | null = null;
  /** sky term sign: −1 = forced (always applied), +1 = only when atmos' interior volume is off */
  skyForce = false;
  private tmp = new THREE.Matrix4();
  private tq = new THREE.Quaternion();
  private te = new THREE.Euler();
  private aoOut: number[] = [1, 1, 0, 0, 0];
  /** dry run: drawers execute (lights are collected) but nothing is stored */
  dry = false;
  tris = 0;

  acc(k: MatKey) { let a = this.bins.get(k); if (!a) { a = new Acc(); this.bins.set(k, a); } return a; }

  /** append a geometry transformed by base · local */
  push(key: MatKey, g: THREE.BufferGeometry, local: THREE.Matrix4 | null, color: THREE.ColorRepresentation, o: PushOpts = {}) {
    if (this.dry) return;
    const a = this.acc(key);
    const m = local ? this.tmp.multiplyMatrices(this.base, local) : this.tmp.copy(this.base);
    _m3.getNormalMatrix(m);
    const P = g.getAttribute("position") as THREE.BufferAttribute, N = g.getAttribute("normal") as THREE.BufferAttribute, UV = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
    const pa = P.array as Float32Array, na = N.array as Float32Array, ua = UV ? (UV.array as Float32Array) : null;
    const col = color instanceof THREE.Color ? color : _c.set(color);
    const br = col.r, bg = col.g, bb = col.b;
    const wear = o.wear ?? 0.35, under = o.under ?? 0.25, edge = o.edge ?? WHITE, s = o.uvScale ?? 1, mode = o.uv ?? (UV ? "geo" : "box");
    const off = o.uvOff ?? [0, 0], rect = o.rect;
    const cnt = P.count;
    let ymin = Infinity, ymax = -Infinity;
    if (o.grime) for (let i = 0; i < cnt; i++) { const y = pa[i * 3 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    const e = m.elements, q = _m3.elements;
    const ao = this.ao;
    const r = ao ? _m2.multiplyMatrices(this.toRoom, m).elements : null;
    const rq = ao ? _rq.getNormalMatrix(_m2).elements : null;
    a.p.reserve(cnt * 3); a.n.reserve(cnt * 3); a.uv.reserve(cnt * 2); a.c.reserve(cnt * 3); a.ao.reserve(cnt * 2); a.lamp.reserve(cnt * 3);
    const Pp = a.p.a, Pn = a.n.a, Pu = a.uv.a, Pc = a.c.a, Pa = a.ao.a, Pl = a.lamp.a;
    let ip = a.p.n, iu = a.uv.n, ia = a.ao.n;
    const sgn = this.skyForce ? -1 : 1, out = this.aoOut;
    for (let i = 0; i < cnt; i++) {
      const lx = pa[i * 3], ly = pa[i * 3 + 1], lz = pa[i * 3 + 2];
      const nx = na[i * 3], ny = na[i * 3 + 1], nz = na[i * 3 + 2];
      Pp[ip] = e[0] * lx + e[4] * ly + e[8] * lz + e[12]; Pp[ip + 1] = e[1] * lx + e[5] * ly + e[9] * lz + e[13]; Pp[ip + 2] = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
      let tx = q[0] * nx + q[3] * ny + q[6] * nz, ty = q[1] * nx + q[4] * ny + q[7] * nz, tz = q[2] * nx + q[5] * ny + q[8] * nz;
      const il = 1 / (Math.hypot(tx, ty, tz) || 1); tx *= il; ty *= il; tz *= il;
      Pn[ip] = tx; Pn[ip + 1] = ty; Pn[ip + 2] = tz;
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      let u = 0, v = 0;
      if (mode === "wall") { u = (lx + off[0]) * s; v = (ly + off[1]) * s; }
      else if (mode === "box") {
        if (ax >= ay && ax >= az) { u = lz * s * (nx < 0 ? -1 : 1); v = ly * s; }
        else if (ay >= az) { u = lx * s; v = lz * s; }
        else { u = lx * s; v = ly * s; }
      } else if (mode === "rect" && ua && rect) { u = rect[0] + ua[i * 2] * (rect[2] - rect[0]); v = rect[1] + ua[i * 2 + 1] * (rect[3] - rect[1]); }
      else if (ua) { u = ua[i * 2] * s; v = ua[i * 2 + 1] * s; }
      Pu[iu] = u; Pu[iu + 1] = v; iu += 2;
      let cr = br, cg = bg, cb = bb;
      const mx = ax > ay ? (ax > az ? ax : az) : (ay > az ? ay : az);
      if (mx < 0.985 && wear > 0) { cr += (edge.r - cr) * wear; cg += (edge.g - cg) * wear; cb += (edge.b - cb) * wear; }   // chamfer = worn edge
      if (ny < -0.5) { const f = 1 - under; cr *= f; cg *= f; cb *= f; }                                                    // underside
      if (o.grime && ymax > ymin) { const t = (ly - ymin) / (ymax - ymin), f = 1 - o.grime * (1 - Math.min(1, t * 3)); cr *= f; cg *= f; cb *= f; }
      Pc[ip] = cr; Pc[ip + 1] = cg; Pc[ip + 2] = cb;
      if (ao && r && rq) {
        const rx = r[0] * lx + r[4] * ly + r[8] * lz + r[12], ry = r[1] * lx + r[5] * ly + r[9] * lz + r[13], rz = r[2] * lx + r[6] * ly + r[10] * lz + r[14];
        const qx = rq[0] * nx + rq[3] * ny + rq[6] * nz, qy = rq[1] * nx + rq[4] * ny + rq[7] * nz, qz = rq[2] * nx + rq[5] * ny + rq[8] * nz;
        ao(rx, ry, rz, qx, qy, qz, out);
        Pa[ia] = out[0]; Pa[ia + 1] = sgn * Math.max(out[1], 0.001);
        Pl[ip] = out[2]; Pl[ip + 1] = out[3]; Pl[ip + 2] = out[4];
      } else { Pa[ia] = 1; Pa[ia + 1] = 1; Pl[ip] = 0; Pl[ip + 1] = 0; Pl[ip + 2] = 0; }
      ia += 2; ip += 3;
    }
    a.p.n = ip; a.n.n = ip; a.c.n = ip; a.lamp.n = ip; a.uv.n = iu; a.ao.n = ia;
    a.tris += cnt / 3; this.tris += cnt / 3;
  }

  /** local transform helper: translate + euler (y, x, z order) + scale */
  M(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
    this.te.set(rx, ry, rz, "YXZ"); this.tq.setFromEuler(this.te);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.tq, new THREE.Vector3(sx, sy, sz));
  }
  /** chamfered box, BASE at y (x, z centre) */
  box(key: MatKey, x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, o: PushOpts & { b?: number; ry?: number; rx?: number; rz?: number } = {}) {
    const b = o.b ?? Math.min(0.03, Math.min(w, h, d) * 0.22);
    this.push(key, chamfer(w, h, d, b), this.M(x, y + h / 2, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0), color, o);
  }
  /** centred box (no base offset) */
  cbox(key: MatKey, x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, o: PushOpts & { b?: number; ry?: number; rx?: number; rz?: number } = {}) {
    const b = o.b ?? Math.min(0.03, Math.min(w, h, d) * 0.22);
    this.push(key, chamfer(w, h, d, b), this.M(x, y, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0), color, o);
  }
  /** cylinder: upright → BASE at y; tipped over (rx / rz set) → CENTRED at y */
  cyl(key: MatKey, x: number, y: number, z: number, rt: number, rb: number, h: number, color: THREE.ColorRepresentation, o: PushOpts & { seg?: number; rx?: number; rz?: number; ry?: number; sx?: number; sz?: number } = {}) {
    const tipped = !!(o.rx || o.rz);
    this.push(key, cylGeo(rt, rb, h, o.seg ?? 12), this.M(x, tipped ? y : y + h / 2, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0, o.sx ?? 1, 1, o.sz ?? 1), color, { uv: "box", wear: 0, ...o });
  }
  /** a cylinder between two points */
  rod(key: MatKey, a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.ColorRepresentation, seg = 6, o: PushOpts = {}) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.push(key, cylGeo(r, r, len, seg, true), m, color, { uv: "box", wear: 0, ...o });
  }
  sphere(key: MatKey, x: number, y: number, z: number, r: number, color: THREE.ColorRepresentation, o: PushOpts & { sx?: number; sy?: number; sz?: number; detail?: number; ry?: number } = {}) {
    this.push(key, sphGeo(r, o.detail ?? 1), this.M(x, y, z, o.ry ?? 0, 0, 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1), color, { uv: "box", wear: 0, ...o });
  }
  /** flat quad facing +z (local), centred */
  quad(key: MatKey, x: number, y: number, z: number, w: number, h: number, color: THREE.ColorRepresentation, o: PushOpts & { ry?: number; rx?: number } = {}) {
    this.push(key, planeGeo(), this.M(x, y, z, o.ry ?? 0, o.rx ?? 0, 0, w, h, 1), color, { uv: o.rect ? "rect" : "geo", wear: 0, under: 0, ...o });
  }

  /** build the merged meshes (one per material key present) */
  meshes(mats: (k: MatKey) => THREE.Material, name: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [k, a] of this.bins) {
      if (!a.p.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(a.p.a.slice(0, a.p.n), 3));
      g.setAttribute("normal", new THREE.BufferAttribute(a.n.a.slice(0, a.n.n), 3));
      g.setAttribute("uv", new THREE.BufferAttribute(a.uv.a.slice(0, a.uv.n), 2));
      g.setAttribute("color", new THREE.BufferAttribute(a.c.a.slice(0, a.c.n), 3));
      g.setAttribute("kao", new THREE.BufferAttribute(a.ao.a.slice(0, a.ao.n), 2));
      g.setAttribute("klamp", new THREE.BufferAttribute(a.lamp.a.slice(0, a.lamp.n), 3));
      g.computeBoundingBox(); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mats(k));
      mesh.name = `${name}:${k}`;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      out.push(mesh);
    }
    return out;
  }
}
