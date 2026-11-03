// BANANA CO. crate geometry (target-art sheets loot-01, loot-02, loot-03). Every part is real bevelled geometry (chamfered boards with
// gaps, L-profile corner guards, chunky rounded lid caps, square-section bars, slot screws, a 3-ply twisted rope through
// two eyelets, wooden skids) merged into ONE geometry per LOD whose UVs point into the crate atlas (chest-tex.ts) and
// whose vertex colours carry the rarity tint of the metal trim. One material → one draw (instanced per rarity).
// Local space: origin = ground centre, +Y up, +Z front (stencil), +X right (rope handle). Lid pivots at the back hinge.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BOARDS as BOARDS0, boardsFor, REG, ROPE_TURNS, regionUV, type CrateStyle, type Rect } from "./chest-tex";
import { rng } from "./lib/mats";
import { bananaGeometry } from "./lib/geo";

export interface CrateShape { w: number; d: number; hBody: number; hLid: number; seam: number; skid: number; tall: boolean }
/** loot-01: a chunky near-cube, ~1.04 × 1.0 m; the lid is a QUARTER of the height (target-art near corner, full res: cap 390 px /
 *  seam 30 / body 1180) */
export const CUBE: CrateShape = { w: 1.04, d: 1.0, hBody: 0.68, hLid: 0.2, seam: 0.04, skid: 0.06, tall: false };
/** loot-03: taller than wide (0.9 × 1.1 m) */
export const TALL: CrateShape = { w: 0.8, d: 0.8, hBody: 0.84, hLid: 0.2, seam: 0.04, skid: 0.07, tall: true };
/** loot-03 frame: corner cube size, bar section, how far the frame stands proud of the boards, chamfers */
const TB = { cs: 0.22, bs: 0.13, o: 0.035, cc: 0.045, bc: 0.026 };

export interface CrateGeo {
  closed: THREE.BufferGeometry; far: THREE.BufferGeometry;
  /** impostor LOD (≥ 50 m): painted body panels + a lid box + the emissive seam ring, ~150 tris */
  imp: THREE.BufferGeometry;
  /** soft additive glow band(s) hugging the seam(s) (v = 0 bottom … 1 top of the band) */
  seamGlow: THREE.BufferGeometry;
  body: THREE.BufferGeometry; lid: THREE.BufferGeometry; hinge: THREE.Vector3; shape: CrateShape; tris: number;
  /** opened crates only: straw + a few bananas left inside (merged into the opened batch geometry) */
  leftovers: THREE.BufferGeometry | null;
}

// ------------------------------------------------------------------------------------------------ part bin
type UvFn = (g: THREE.BufferGeometry) => void;
class Bin {
  parts: THREE.BufferGeometry[] = [];
  private c = new THREE.Color();
  add(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, tint: THREE.ColorRepresentation, uv: UvFn, uvBefore = false): this {
    let geo = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (uvBefore) uv(geo);
    if (m) { geo.applyMatrix4(m); if (m.determinant() < 0) flipWinding(geo); }
    if (!uvBefore) uv(geo);
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    this.c.set(tint);
    for (let i = 0; i < n; i++) { col[i * 3] = this.c.r; col[i * 3 + 1] = this.c.g; col[i * 3 + 2] = this.c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.parts.push(geo);
    return this;
  }
  merge(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
function flipWinding(g: THREE.BufferGeometry) {
  // non-indexed: swap the 2nd and 3rd vertex of every triangle for every attribute
  for (const a of Object.values(g.attributes) as THREE.BufferAttribute[]) {
    const s = a.itemSize, arr = a.array as Float32Array;
    for (let t = 0; t < a.count; t += 3) for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k; const v = arr[i1]; arr[i1] = arr[i2]; arr[i2] = v; }
  }
}

// ------------------------------------------------------------------------------------------------ UV mappers
/** every vertex → one point of a region (flat colour parts: screws' shanks, seam, interior) */
const uvAt = (reg: Rect, s = 0.5, t = 0.5): UvFn => (g) => {
  const [u, v] = regionUV(reg, s, t, 2), n = g.attributes.position.count, a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; }
  g.setAttribute("uv", new THREE.BufferAttribute(a, 2));
};
/** planar projection: s/t from world axes, normalised by the given ranges */
const uvPlanar = (reg: Rect, sAxis: THREE.Vector3, s0: number, s1: number, tAxis: THREE.Vector3, t0: number, t1: number): UvFn => (g) => {
  const p = g.attributes.position as THREE.BufferAttribute, n = p.count, a = new Float32Array(n * 2), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    const [u, w] = regionUV(reg, (v.dot(sAxis) - s0) / (s1 - s0), (v.dot(tAxis) - t0) / (t1 - t0));
    a[i * 2] = u; a[i * 2 + 1] = w;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(a, 2));
};
/** box projection by dominant normal, each projection normalised to the part's own bounds (painted-metal trims) */
const uvBox = (reg: Rect, seed = 0): UvFn => (g) => {
  g.computeBoundingBox();
  const bb = g.boundingBox!, sz = bb.getSize(new THREE.Vector3());
  const p = g.attributes.position as THREE.BufferAttribute, nn = g.attributes.normal as THREE.BufferAttribute, a = new Float32Array(p.count * 2);
  const off = (seed * 0.37) % 0.5;
  const L = Math.max(sz.x, sz.y, sz.z, 1e-4);
  for (let i = 0; i < p.count; i++) {
    const x = (p.getX(i) - bb.min.x) / L, y = (p.getY(i) - bb.min.y) / L, z = (p.getZ(i) - bb.min.z) / L;
    const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i));
    let s: number, t: number;
    if (ax >= ay && ax >= az) { s = z; t = y; } else if (ay >= az) { s = x; t = z; } else { s = x; t = y; }
    const [u, v] = regionUV(reg, off + s * 0.5, t);
    a[i * 2] = u; a[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(a, 2));
};
/** board-local mapping: the geometry's local X = board length, Y = board width → a painted board rect (px) */
const uvBoard = (reg: Rect, b: Rect, len: number, wid: number): UvFn => (g) => {
  const p = g.attributes.position as THREE.BufferAttribute, a = new Float32Array(p.count * 2);
  const [x0, y0, w, h] = reg;
  for (let i = 0; i < p.count; i++) {
    const s = p.getX(i) / len + 0.5, t = p.getY(i) / wid + 0.5;
    const sub: Rect = [x0 + b[0] * w, y0 + (1 - b[3]) * h, (b[2] - b[0]) * w, (b[3] - b[1]) * h];
    const [u, v] = regionUV(sub, s, t, 4);
    a[i * 2] = u; a[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(a, 2));
};

// ------------------------------------------------------------------------------------------------ primitives
/** chamfered box (flat facets: crisp highlight lines on every edge), centred */
export function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  c = Math.min(c, w * 0.45, h * 0.45, d * 0.45);
  const X = w / 2, Y = h / 2, Z = d / 2;
  const pos: number[] = [];
  const quad = (a: number[], b: number[], cc: number[], dd: number[]) => pos.push(...a, ...b, ...cc, ...a, ...cc, ...dd);
  const tri = (a: number[], b: number[], cc: number[]) => pos.push(...a, ...b, ...cc);
  // 6 main faces
  quad([-X + c, -Y + c, Z], [X - c, -Y + c, Z], [X - c, Y - c, Z], [-X + c, Y - c, Z]);
  quad([X - c, -Y + c, -Z], [-X + c, -Y + c, -Z], [-X + c, Y - c, -Z], [X - c, Y - c, -Z]);
  quad([X, -Y + c, Z - c], [X, -Y + c, -Z + c], [X, Y - c, -Z + c], [X, Y - c, Z - c]);
  quad([-X, -Y + c, -Z + c], [-X, -Y + c, Z - c], [-X, Y - c, Z - c], [-X, Y - c, -Z + c]);
  quad([-X + c, Y, Z - c], [X - c, Y, Z - c], [X - c, Y, -Z + c], [-X + c, Y, -Z + c]);
  quad([-X + c, -Y, -Z + c], [X - c, -Y, -Z + c], [X - c, -Y, Z - c], [-X + c, -Y, Z - c]);
  // 12 edge chamfers
  for (const sy of [1, -1]) for (const sz of [1, -1]) { // edges along X
    const a = [-X + c, sy * Y, sz * (Z - c)], b = [X - c, sy * Y, sz * (Z - c)], e = [X - c, sy * (Y - c), sz * Z], f = [-X + c, sy * (Y - c), sz * Z];
    if (sy * sz > 0) quad(f, e, b, a); else quad(a, b, e, f);
  }
  for (const sx of [1, -1]) for (const sz of [1, -1]) { // edges along Y
    const a = [sx * X, -Y + c, sz * (Z - c)], b = [sx * X, Y - c, sz * (Z - c)], e = [sx * (X - c), Y - c, sz * Z], f = [sx * (X - c), -Y + c, sz * Z];
    if (sx * sz > 0) quad(a, b, e, f); else quad(f, e, b, a);
  }
  for (const sx of [1, -1]) for (const sy of [1, -1]) { // edges along Z
    const a = [sx * X, sy * (Y - c), -Z + c], b = [sx * X, sy * (Y - c), Z - c], e = [sx * (X - c), sy * Y, Z - c], f = [sx * (X - c), sy * Y, -Z + c];
    if (sx * sy > 0) quad(f, e, b, a); else quad(a, b, e, f);
  }
  // 8 corner triangles
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const a = [sx * X, sy * (Y - c), sz * (Z - c)], b = [sx * (X - c), sy * Y, sz * (Z - c)], e = [sx * (X - c), sy * (Y - c), sz * Z];
    if (sx * sy * sz > 0) tri(a, b, e); else tri(a, e, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  fixOutward(g);
  return g;
}
/** make every triangle face away from the centroid (convex solids) — guards the hand-wound tables above */
function fixOutward(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  let flipped = false;
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (n.dot(m) < 0) { p.setXYZ(t + 1, c.x, c.y, c.z); p.setXYZ(t + 2, b.x, b.y, b.z); flipped = true; }
  }
  if (flipped) g.computeVertexNormals();
}
const rbox = (w: number, h: number, d: number, r: number, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));

/** slot screw head (not a proud 8-sided nub): a FLAT round head sunk into the plate — a thin countersink lip
 *  then a nearly flat face (the painted slot carries the detail), 20 segments; UV planar from its axis */
function screwGeo(r: number): THREE.BufferGeometry {
  // bottom → top so LatheGeometry winds outward; starts below the plate surface (y < 0) so it reads recessed
  const prof: Array<[number, number]> = [[r * 1.12, -0.004], [r * 1.06, 0.0005], [r * 0.96, r * 0.08], [r * 0.7, r * 0.13], [0.0001, r * 0.15]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 20);
  const p = g.attributes.position as THREE.BufferAttribute, a = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const [u, v] = regionUV(REG.screw, p.getX(i) / (2 * r) + 0.5, -p.getZ(i) / (2 * r) + 0.5, 1); a[i * 2] = u; a[i * 2 + 1] = v; }
  g.setAttribute("uv", new THREE.BufferAttribute(a, 2));
  return g;
}
function alignY(pos: THREE.Vector3, dir: THREE.Vector3, roll = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  return new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
}
const T = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

/** twisted rope (a lobed 12-sided tube read crumpled and spiky): three SMOOTH helical
 *  strands (12 × `along` each, smooth normals) laid round the centre line, touching — the real construction of a 3-ply
 *  rope, so silhouette, shading and the dark contact grooves all come from geometry. Each strand's v runs round the
 *  strand with v = 0.5 facing OUT from the rope (the painted rope cell is lit there and darkens toward the contact
 *  grooves at v = 0 / 1); u = along the rope. `turns` = full twists of a strand over the rope length. */
function plyRope(curve: THREE.Curve<THREE.Vector3>, R: number, along = 140, radial = 12, turns = 4.5): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(along, false);
  // parallel-transported frame (Frenet flips at inflections → a kinked strand)
  const Ns = [frames.normals[0].clone()], Bs = [frames.binormals[0].clone()];
  for (let i = 1; i <= along; i++) {
    const t = frames.tangents[i], n = Ns[i - 1].clone().addScaledVector(t, -Ns[i - 1].dot(t)).normalize();
    Ns.push(n); Bs.push(new THREE.Vector3().crossVectors(t, n).normalize());
  }
  const a = R * 0.45, rs = R * 0.6;
  const P = new THREE.Vector3(), O = new THREE.Vector3(), C = new THREE.Vector3(), Cn = new THREE.Vector3(), Ts = new THREE.Vector3(), W = new THREE.Vector3(), Op = new THREE.Vector3();
  const parts: THREE.BufferGeometry[] = [];
  const centre = (i: number, ph: number, out: THREE.Vector3, o: THREE.Vector3) => {
    curve.getPointAt(Math.min(1, i / along), P);
    const k = Math.min(along, i), phi = ph + (Math.PI * 2 * turns * i) / along;
    o.copy(Ns[k]).multiplyScalar(Math.cos(phi)).addScaledVector(Bs[k], Math.sin(phi));
    return out.copy(P).addScaledVector(o, a);
  };
  for (let st = 0; st < 3; st++) {
    const ph = (st / 3) * Math.PI * 2;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= along; i++) {
      centre(i, ph, C, O);
      // strand tangent by finite difference (helix + curve)
      centre(Math.min(along, i + 1), ph, Cn, Op); const Cp = centre(Math.max(0, i - 1), ph, new THREE.Vector3(), new THREE.Vector3());
      Ts.subVectors(Cn, Cp).normalize();
      Op.copy(O).addScaledVector(Ts, -O.dot(Ts)).normalize();   // outward, ⟂ strand
      W.crossVectors(Ts, Op).normalize();
      for (let j = 0; j <= radial; j++) {
        const th = (j / radial) * Math.PI * 2;                  // th = 0 → OUT from the rope
        const x = C.x + (Op.x * Math.cos(th) + W.x * Math.sin(th)) * rs, y = C.y + (Op.y * Math.cos(th) + W.y * Math.sin(th)) * rs, z = C.z + (Op.z * Math.cos(th) + W.z * Math.sin(th)) * rs;
        pos.push(x, y, z);
        const [u, v] = regionUV(REG.rope, i / along, ((j / radial) + 0.5) % 1.0001, 3);
        uv.push(u, v);
      }
    }
    for (let i = 0; i < along; i++) for (let j = 0; j < radial; j++) {
      const p0 = i * (radial + 1) + j, p1 = p0 + radial + 1;
      idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // outward check (winding): the first vertex's normal must point away from its strand centre
    const n0 = new THREE.Vector3().fromBufferAttribute(g.attributes.normal as THREE.BufferAttribute, radial + 2), p0 = new THREE.Vector3().fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, radial + 2);
    centre(1, ph, C, O);
    if (n0.dot(p0.sub(C)) < 0) { const ix = g.index!.array as Uint32Array | Uint16Array; for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; } g.computeVertexNormals(); }
    parts.push(g);
  }
  return mergeGeometries(parts, false)!;
}

/** L-profile corner guard (two plates + rounded outer corner), extruded along Y, bevelled. Local: a = inward along the
 *  front face, b = inward along the side face; the crate occupies a,b ≥ 0. */
function guardGeo(P: number, Tk: number, H: number, rc: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const e = 0.004;
  s.moveTo(P, -Tk);
  s.lineTo(P, e);
  s.lineTo(e, e);
  s.lineTo(e, P);
  s.lineTo(-Tk, P);
  s.lineTo(-Tk, -Tk + rc);
  s.absarc(-Tk + rc, -Tk + rc, rc, Math.PI, Math.PI * 1.5, false);
  s.lineTo(P, -Tk);
  const bv = 0.009;
  const g = new THREE.ExtrudeGeometry(s, { depth: H - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv * 0.9, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, bv);
  // shape plane (a, b) + extrusion z → (a, z, b) so the extrusion runs along +Y
  const out = g.index ? g.toNonIndexed() : g;
  // mirror basis (det −1): normals come out right from the normal matrix, the winding must be flipped by hand
  out.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
  flipWinding(out);
  return out;
}

// ------------------------------------------------------------------------------------------------ builder
export interface Tint { band: string; gold: boolean; seam: string; cap?: string }

export function buildCrate(shape: CrateShape, tint: Tint, style: CrateStyle): CrateGeo {
  const { w, d, hBody, hLid, seam, skid } = shape;
  const BOARDS = style === "supply" ? boardsFor(style) : BOARDS0;
  const r = rng(shape.tall ? 11 : 7);
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const yB0 = skid, yB1 = skid + hBody, yL0 = yB1 + seam, yL1 = yL0 + hLid;
  const bandReg = tint.gold ? REG.gold : REG.band;
  const trim = style === "supply" ? "#f6cc1e" : tint.band;          // supply crate: yellow rim, brown caps
  const cap = style === "supply" ? (tint.cap ?? "#6b4636") : tint.band;
  const body = new Bin(), lid = new Bin(), far = new Bin(), imp = new Bin();
  const Tk = shape.tall ? 0.05 : 0.046;         // metal proud of the boards
  const P = shape.tall ? 0.1 : 0.17;            // guard plate width (per face)
  const bt = 0.034;                              // board thickness
  // ---- core: an open-top box (dark outside through the board gaps, painted inner boards inside) + floor
  {
    const cw = w - 0.05, cd = d - 0.05, ch = hBody - 0.01;
    const inner = new THREE.BoxGeometry(cw, ch, cd).toNonIndexed();
    // keep the 4 walls + bottom, drop the top (+Y, the 3rd face pair in BoxGeometry order: px, nx, py, ny, pz, nz)
    const keep = (geo: THREE.BufferGeometry, faces: number[]) => { const out = new THREE.BufferGeometry(); for (const k of ["position", "normal"]) { const a = geo.attributes[k] as THREE.BufferAttribute, arr: number[] = []; for (const f of faces) for (let v = 0; v < 6; v++) for (let c = 0; c < 3; c++) arr.push(a.getComponent(f * 6 + v, c)); out.setAttribute(k, new THREE.Float32BufferAttribute(arr, 3)); } return out; };
    const outer = keep(inner, [0, 1, 3, 4, 5]);
    body.add(outer, T(0, yB0 + ch / 2, 0), "#ffffff", uvAt(REG.dark, 0.5, 0.5));
    const walls = keep(inner, [0, 1, 3, 4, 5]); flipWinding(walls);
    const nn = walls.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
    body.add(walls, T(0, yB0 + ch / 2, 0), "#ffffff", uvBox(REG.inner));
    // interior floor glow (emissive gradient cell): only seen when the lid is open
    body.add(new THREE.PlaneGeometry(cw * 0.96, cd * 0.96), T(0, yB0 + 0.05, 0, -Math.PI / 2), "#ffffff", uvPlanar(REG.glow, X, -cw / 2, cw / 2, Z, -cd / 2, cd / 2));
  }
  // ---- boards on the four body faces: planar-mapped into the face regions (the painted board layout matches)
  const faceBoards = (reg: Rect, layout: Rect[], center: THREE.Vector3, sAx: THREE.Vector3, nAx: THREE.Vector3, fw: number, fy0: number, fh: number, bin: Bin) => {
    for (const [u0, v0, u1, v1] of layout) {
      // supply (loot-02): painted boards butt tight (the target art's thin plank lines, not deep drawer gaps)
      const gap = style === "supply" ? 0.0015 : 0.004;
      const bw = (u1 - u0) * fw - gap, bh = (v1 - v0) * fh - gap;
      const g = chamferBox(bw, bh, bt, style === "supply" ? 0.005 : 0.011);
      const cs = (u0 + u1) / 2 * fw - fw / 2, cy = fy0 + (v0 + v1) / 2 * fh;
      const jitter = (r() - 0.5) * 0.004;
      const pos = center.clone().addScaledVector(sAx, cs).setY(cy).addScaledVector(nAx, -bt / 2 + jitter);
      const m = new THREE.Matrix4().makeBasis(sAx, Y, nAx).setPosition(pos);
      m.multiply(new THREE.Matrix4().makeRotationZ((r() - 0.5) * 0.006));
      const planar = uvPlanar(reg, sAx, center.dot(sAx) - fw / 2, center.dot(sAx) + fw / 2, Y, fy0, fy0 + fh);
      bin.add(g, m, "#ffffff", (geo) => {
        planar(geo);
        // the board's INNER face (seen when the lid is open) samples the plain inner boards, not the face decals
        const nn = geo.attributes.normal as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute, p = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < nn.count; i++) if (nn.getX(i) * nAx.x + nn.getY(i) * nAx.y + nn.getZ(i) * nAx.z < -0.5) {
          const [u, v] = regionUV(REG.inner, (p.getX(i) * sAx.x + p.getZ(i) * sAx.z - (center.dot(sAx) - fw / 2)) / fw, (p.getY(i) - fy0) / fh);
          uv.setXY(i, u, v);
        }
      });
    }
  };
  const faces: Array<{ reg: Rect; layout: Rect[]; c: THREE.Vector3; s: THREE.Vector3; n: THREE.Vector3; fw: number }> = [
    { reg: REG.front, layout: BOARDS.front, c: new THREE.Vector3(0, 0, d / 2), s: X.clone(), n: Z.clone(), fw: w },
    // legendary lineup crate: the +X face carries the gold medallion → plain planks (the top region: no stencil under it)
    { reg: shape.tall && tint.gold ? REG.top : REG.side, layout: shape.tall && tint.gold ? BOARDS.top : BOARDS.side, c: new THREE.Vector3(w / 2, 0, 0), s: Z.clone().negate(), n: X.clone(), fw: d },
    { reg: shape.tall ? REG.side : REG.side2, layout: shape.tall ? BOARDS.side : BOARDS.side2, c: new THREE.Vector3(0, 0, -d / 2), s: X.clone().negate(), n: Z.clone().negate(), fw: w },
    { reg: shape.tall || style !== "classic" ? REG.side2 : REG.side, layout: shape.tall || style !== "classic" ? BOARDS.side2 : BOARDS.side, c: new THREE.Vector3(-w / 2, 0, 0), s: Z.clone(), n: X.clone().negate(), fw: d },
  ];
  for (const f of faces) faceBoards(f.reg, f.layout, f.c, f.s, f.n, f.fw, yB0 + 0.004, hBody - 0.008, body);
  // far LOD: one flat panel per face with the same painted boards
  for (const f of faces) {
    const g = new THREE.PlaneGeometry(f.fw, hBody);
    const m = new THREE.Matrix4().makeBasis(f.s, Y, f.n).setPosition(f.c.clone().setY(yB0 + hBody / 2));
    far.add(g, m, "#ffffff", uvPlanar(f.reg, f.s, f.c.dot(f.s) - f.fw / 2, f.c.dot(f.s) + f.fw / 2, Y, yB0, yB1));
    // impostor: the same painted panel pushed out to the metal's plane (it IS the crate's silhouette at range)
    imp.add(g, m.clone().setPosition(f.c.clone().setY(yB0 + hBody / 2).addScaledVector(f.n, 0.03)), "#ffffff", uvPlanar(f.reg, f.s, f.c.dot(f.s) - f.fw / 2, f.c.dot(f.s) + f.fw / 2, Y, yB0, yB1));
  }
  // impostor corner posts (4 slim boxes in the trim colour, full body height)
  for (const sx of [1, -1]) for (const sz of [1, -1]) imp.add(new THREE.BoxGeometry(0.16, hBody + 0.01, 0.16), T(sx * (w / 2 - 0.05), yB0 + hBody / 2, sz * (d / 2 - 0.05)), style === "supply" ? "#f6cc1e" : tint.band, uvAt(tint.gold ? REG.gold : REG.band, 0.3, 0.5));
  far.add(new THREE.BoxGeometry(w - 0.03, hBody, d - 0.03), T(0, yB0 + hBody / 2, 0), "#ffffff", uvAt(REG.dark));
  // ---- skids / plinth: four dark runners set back under the body
  for (const [sx, sz, lw, ld] of [[0, 1, w - 0.12, 0.09], [0, -1, w - 0.12, 0.09], [1, 0, 0.09, d - 0.12], [-1, 0, 0.09, d - 0.12]] as Array<[number, number, number, number]>) {
    const g = chamferBox(lw, skid + 0.01, ld, 0.012);
    const m = T(sx * (w / 2 - 0.08), (skid + 0.01) / 2, sz * (d / 2 - 0.08));
    body.add(g, m, "#ffffff", uvBoard(REG.dark, [0, 0, 1, 1], lw, skid + 0.01), true);
    far.add(g, m, "#ffffff", uvAt(REG.dark));
  }
  // ---- body corner guards (L plates) + inner strips + screws (supply crate: brown caps top & bottom instead)
  const screw = screwGeo(shape.tall ? 0.022 : 0.03);
  const addScrew = (bin: Bin, p: THREE.Vector3, n: THREE.Vector3) => bin.add(screw, alignY(p, n, r() * 3), "#e8ecf0", (g) => g, true);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const corner = new THREE.Vector3(sx * w / 2, 0, sz * d / 2);
    const A = new THREE.Vector3(-sx, 0, 0), B = new THREE.Vector3(0, 0, -sz);
    const basis = new THREE.Matrix4().makeBasis(A, Y, B);
    const mk = (y0: number, h: number, pw: number) => { const m = basis.clone().setPosition(corner.clone().setY(y0)); return { g: guardGeo(pw, Tk, h, 0.03), m }; };
    if (shape.tall) continue; // tall (loot-03): a frame of square bars + cube corners instead (below)
    if (style === "supply") {
      // chunky brown L caps at the bottom and top of each body corner
      // smaller caps (target art: ~0.2 of the face width, a bit taller than wide) — the 0.2 m caps read as a second tier
      for (const [y0, h] of [[yB0 - 0.01, 0.17], [yB1 - 0.16, 0.17]] as Array<[number, number]>) {
        const { g, m } = mk(y0, h, 0.155);
        body.add(g, m, cap, uvBox(bandReg, sx + sz * 3));
        for (const [ax, other] of [[A, B], [B, A]] as Array<[THREE.Vector3, THREE.Vector3]>) {
          const out = other.clone().negate();
          addScrew(body, corner.clone().setY(y0 + h / 2).addScaledVector(ax, 0.085).addScaledVector(out, Tk + 0.001), out);
        }
      }
    } else {
      const { g, m } = mk(yB0 - 0.006, hBody + 0.012, P);
      body.add(g, m, trim, uvBox(bandReg, sx * 2 + sz));
      far.add(chamferBox(P + Tk, hBody, P + Tk, 0.02), T(sx * (w / 2 - P / 2 + Tk / 2), yB0 + hBody / 2, sz * (d / 2 - P / 2 + Tk / 2)), trim, uvBox(bandReg));
      // inner strips (the target art's narrow second plate beside each guard), one per face
      if (!shape.tall) for (const [ax, other] of [[A, B], [B, A]] as Array<[THREE.Vector3, THREE.Vector3]>) {
        const sw = 0.048;
        const g2 = chamferBox(sw, hBody - 0.02, Tk * 0.7, 0.01);
        const along = ax.clone(), out = other.clone().negate();
        const pos = corner.clone().setY(yB0 + hBody / 2).addScaledVector(along, P + 0.012 + sw / 2).addScaledVector(out, Tk * 0.35);
        const m2 = new THREE.Matrix4().makeBasis(along.clone().multiplyScalar(1), Y, out.clone()).setPosition(pos);
        if (m2.determinant() < 0) m2.makeBasis(along.clone().negate(), Y, out.clone()).setPosition(pos);
        body.add(g2, m2, trim, uvBox(bandReg, 5));
      }
      // screws: two per plate face (top + bottom), centred on the plate
      for (const [ax, other] of [[A, B], [B, A]] as Array<[THREE.Vector3, THREE.Vector3]>) {
        const out = other.clone().negate();
        // the extrude bevel grows the plate by ~8 mm (screws at the plate's own surface sat buried under it): the screws
        // sit on the plate's outer face at both band ends
        for (const yy of [yB0 + 0.075, yB1 - 0.075]) addScrew(body, corner.clone().setY(yy).addScaledVector(ax, P * 0.46).addScaledVector(out, Tk + 0.0092), out);
      }
    }
  }
  // supply crate: a yellow rim band around the top of the body + a latch + side handle
  if (style === "supply") {
    for (const [sx, sz, lw, ld] of [[0, 1, w + 0.02, 0.05], [0, -1, w + 0.02, 0.05], [1, 0, 0.05, d + 0.02], [-1, 0, 0.05, d + 0.02]] as Array<[number, number, number, number]>) {
      body.add(rbox(lw, 0.07, ld, 0.02, 2), T(sx * (w / 2 + 0.006), yB1 - 0.035, sz * (d / 2 + 0.006)), trim, uvBox(REG.band, sx + sz));
    }
    // front latch (yellow hasp with a slot)
    body.add(rbox(0.16, 0.12, 0.05, 0.02, 2), T(0, yB1 - 0.05, d / 2 + 0.03), trim, uvBox(REG.band, 3));
    body.add(chamferBox(0.08, 0.03, 0.02, 0.005), T(0, yB1 - 0.05, d / 2 + 0.06), "#3a2616", uvAt(REG.dark));
    // left-face handle: a yellow U bracket
    const hs = new THREE.Shape(); hs.moveTo(-0.13, 0); hs.lineTo(-0.13, -0.1); hs.lineTo(0.13, -0.1); hs.lineTo(0.13, 0); hs.lineTo(0.1, 0); hs.lineTo(0.1, -0.07); hs.lineTo(-0.1, -0.07); hs.lineTo(-0.1, 0); hs.lineTo(-0.13, 0);
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.05, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
    body.add(hg, new THREE.Matrix4().makeBasis(Z, Y, X.clone().negate()).setPosition(new THREE.Vector3(-w / 2 - 0.004, yB1 - 0.08, 0)), trim, uvBox(REG.band, 7));
  }
  // ---- glowing seam (a thin hot line, not a 16 cm fog band): a 1.8 cm emissive ring in the lid gap, 1.4 cm
  // proud of the boards between the corner posts, plus (cube crates) an emissive L filling the gap between each body post
  // and the lid cap above it, flush with the metal — the line runs unbroken round the crate like the target art's
  // (a flat 2.6 cm strip read as a pale cream plastic band): the seam is a rounded
  // BEAD (pill section) whose UV v runs bottom → top of the bead, so the atlas' emissive seam cell paints a HOT core line
  // with saturated coloured lips (the tone curve bleaches the core toward white-yellow, the lips stay lemon) and the
  // post bloom does the soft falloff onto the metal
  // loot-03 (tall): fatter, prouder neon lines (the target art's two white-hot bars per face read from across the sheet)
  const SEAM_H = shape.tall ? 0.042 : 0.03, SEAM_OUT = shape.tall ? 0.02 : 0.012;
  const SEAM_LOW = 0.152;
  /** v = height within [y0, y0 + h] (the bead's emissive profile) at a fixed u of the seam cell */
  const uvSeam = (y0: number, h: number): UvFn => (g) => {
    const p = g.attributes.position as THREE.BufferAttribute, a = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const [u, v] = regionUV(REG.seam, 0.5, (p.getY(i) - y0) / h, 3); a[i * 2] = u; a[i * 2 + 1] = v; }
    g.setAttribute("uv", new THREE.BufferAttribute(a, 2));
  };
  {
    const bev = SEAM_H * 0.42;
    const sw = w + 2 * SEAM_OUT - 2 * bev, sd = d + 2 * SEAM_OUT - 2 * bev, rr = 0.024, th = 0.03;
    const s = new THREE.Shape();
    s.moveTo(-sw / 2 + rr, -sd / 2); s.lineTo(sw / 2 - rr, -sd / 2); s.absarc(sw / 2 - rr, -sd / 2 + rr, rr, -Math.PI / 2, 0, false);
    s.lineTo(sw / 2, sd / 2 - rr); s.absarc(sw / 2 - rr, sd / 2 - rr, rr, 0, Math.PI / 2, false);
    s.lineTo(-sw / 2 + rr, sd / 2); s.absarc(-sw / 2 + rr, sd / 2 - rr, rr, Math.PI / 2, Math.PI, false);
    s.lineTo(-sw / 2, -sd / 2 + rr); s.absarc(-sw / 2 + rr, -sd / 2 + rr, rr, Math.PI, Math.PI * 1.5, false);
    const hole = new THREE.Path(); const iw = sw - 2 * th, id = sd - 2 * th;
    hole.moveTo(-iw / 2, -id / 2); hole.lineTo(-iw / 2, id / 2); hole.lineTo(iw / 2, id / 2); hole.lineTo(iw / 2, -id / 2); hole.lineTo(-iw / 2, -id / 2);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: SEAM_H - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 4 });
    g.translate(0, 0, bev);
    g.rotateX(-Math.PI / 2);
    const ys = [yB1 + (seam - SEAM_H) / 2];
    if (shape.tall) ys.push(SEAM_LOW);
    // the seam's ALBEDO is dark (its colour comes from the emissive core, never from lit white paint turning cream)
    const seamA = "#" + new THREE.Color(tint.seam).multiplyScalar(0.3).getHexString();
    if (style !== "supply") for (const y of ys) { body.add(g, T(0, y, 0), seamA, uvSeam(y, SEAM_H)); far.add(g, T(0, y, 0), tint.seam, uvSeam(y, SEAM_H)); imp.add(g, T(0, y, 0), tint.seam, uvSeam(y, SEAM_H)); }
    if (style === "classic") for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const gL = guardGeo(P - 0.004, Tk - 0.005, SEAM_H, 0.03);
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(-sx, 0, 0), Y, new THREE.Vector3(0, 0, -sz)).setPosition(new THREE.Vector3(sx * w / 2, ys[0], sz * d / 2));
      body.add(gL, m, seamA, uvSeam(ys[0], SEAM_H));
    }
  }
  // ---- rope handle (loot-01 right face): two square yellow lugs whose holes run ALONG the face (the target art's handle
  // lugs), a thick (r 4 cm) 3-ply rope threaded through both — its ends poke out of the lugs' outer sides — hanging
  // between them as a round U loop that sits a little off the boards
  if (!shape.tall && style === "classic") {
    // (target-art crop: two small rounded-square lugs high on the face, a FAT 3-ply rope leaving each lug down-and-out and
    // hanging between them as a deep ROUND loop that bulges wider than the lugs — ~12 strand bumps, no knots showing):
    // each lug is a rounded-square block whose round through-hole is aimed along the rope; the rope's ends stop inside
    // the lugs; the loop is one cubic Bézier between the two lug exits (long tangents → a round U, not a V)
    const ey = yB0 + hBody * 0.8, ez = 0.19, xf = w / 2, RR = 0.034, eyL = 0.085;
    const xo = xf + 0.052;                                        // rope axis depth (through the lug holes)
    const tilt = 0.32;                                           // hole axis: down and slightly OUT from vertical
    const dirOut = (sz: number) => new THREE.Vector3(0, -Math.cos(tilt), sz * Math.sin(tilt)).normalize();
    {
      // the lug: a SOLID rounded-square block sitting square on the boards (target art: flat yellow cubes, the rope going into
      // their lower inner corner); a dark ring marks the mouth the rope disappears into
      // (the rope must not enter the side of a solid cube): each lug is a chunky rounded-square RING whose
      // hole the rope passes through (axis along the rope), on a small mounting plate screwed to the boards
      for (const sz of [1, -1]) {
        const ring = new THREE.TorusGeometry(RR + 0.021, 0.017, 10, 20);
        const ax = dirOut(sz), q = new THREE.Quaternion().setFromUnitVectors(Z, ax);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(xo, ey, sz * ez), q, new THREE.Vector3(1, 1, 1));
        body.add(ring, m, trim, uvBox(bandReg, sz + 9));
        body.add(rbox(0.016, 0.1, 0.1, 0.006, 2), T(xf + 0.008, ey, sz * ez), trim, uvBox(bandReg, sz + 11));
      }
    }
    // centre line: from inside lug +Z (the end hidden in the hole) out of its lower mouth, a round loop under the lugs, up
    // into lug −Z
    const P = (sz: number, k: number) => new THREE.Vector3(xo, ey, sz * ez).addScaledVector(dirOut(sz), k);
    const tan = 0.3;
    const path = new THREE.CurvePath<THREE.Vector3>();
    const e1 = P(1, eyL / 2 + 0.006), e2 = P(-1, eyL / 2 + 0.006);
    path.add(new THREE.LineCurve3(P(1, -eyL * 0.3), e1));
    const c1 = e1.clone().addScaledVector(dirOut(1), tan), c2 = e2.clone().addScaledVector(dirOut(-1), tan);
    c1.x -= 0.012; c2.x -= 0.012;                                // the bottom of the loop sags toward the boards
    path.add(new THREE.CubicBezierCurve3(e1, c1, c2, e2));
    path.add(new THREE.LineCurve3(e2, P(-1, -eyL * 0.3)));
    body.add(plyRope(path, RR, 200, 14, ROPE_TURNS), null, "#ffffff", (g) => g, true);
  }
  // supply crate (loot-02): the round kong medallion on the front face, right of centre, with a yellow bezel
  if (style === "supply") {
    const mr = 0.15;
    const mg = new THREE.CylinderGeometry(mr, mr, 0.02, 40);
    const p = mg.attributes.position as THREE.BufferAttribute, a = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const [u, v] = regionUV(REG.kong, p.getX(i) / (2 * mr) + 0.5, -p.getZ(i) / (2 * mr) + 0.5, 2); a[i * 2] = u; a[i * 2 + 1] = v; }
    mg.setAttribute("uv", new THREE.BufferAttribute(a, 2));
    const my = yB0 + hBody * 0.44, mx = w * 0.14;
    body.add(mg, T(mx, my, d / 2 + 0.012, Math.PI / 2, 0, 0), "#ffffff", (g) => g, true);
    body.add(new THREE.TorusGeometry(mr, 0.018, 8, 44), T(mx, my, d / 2 + 0.02), "#f6cc1e", uvBox(REG.band, 6));
  }
  // ---- tall crate (loot-03): a frame of CRISP chamfered square bars on all 12 edges + chunky bevelled cube blocks on the
  // 8 corners (not thin inflated tubing); legendary: gold studs on every
  // cube face + a gold banana medallion centred on the +X face
  if (shape.tall) {
    const { cs, bs, o, cc, bc } = TB;
    const ex = w / 2 + o, ez = d / 2 + o;                      // outer frame extent
    const cyB = cs / 2, cyT = yL1 + 0.02 - cs / 2;              // bottom / top cube centres
    const yTopBar = yL1 + 0.02 - bs / 2, yBotBar = bs / 2 + 0.01;
    const stud = new THREE.SphereGeometry(0.017, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const cx = sx * (ex - cs / 2), cz = sz * (ez - cs / 2);
      body.add(chamferBox(cs, cs, cs, cc), T(cx, cyB, cz), tint.band, uvBox(bandReg, sx * 3 + sz));
      far.add(chamferBox(cs, cs, cs, cc), T(cx, cyB, cz), tint.band, uvBox(bandReg));
      lid.add(chamferBox(cs, cs, cs, cc), T(cx, cyT, cz), tint.band, uvBox(bandReg, sx * 5 + sz));
      far.add(chamferBox(cs, cs, cs, cc), T(cx, cyT, cz), tint.band, uvBox(bandReg));
      // vertical bar between the bottom cube and the seam (the lid's cube takes over above it)
      const vx = sx * (ex - bs / 2 - 0.02), vz = sz * (ez - bs / 2 - 0.02), vh = yB1 - cs;
      body.add(chamferBox(bs, vh, bs, bc), T(vx, cs + vh / 2, vz), tint.band, uvBox(bandReg, sx * 7 + sz));
      far.add(chamferBox(bs, vh, bs, bc), T(vx, cs + vh / 2, vz), tint.band, uvBox(bandReg));
      // a joint collar half-way up every post (the target art's segmented corner posts)
      body.add(chamferBox(bs * 1.22, bs * 0.9, bs * 1.22, bc * 1.2), T(vx, cs + vh * 0.52, vz), tint.band, uvBox(bandReg, sx * 11 + sz));
      if (tint.gold) for (const [n, t] of [[new THREE.Vector3(sx, 0, 0), new THREE.Vector3(0, 0, 1)], [new THREE.Vector3(0, 0, sz), new THREE.Vector3(1, 0, 0)]] as Array<[THREE.Vector3, THREE.Vector3]>) {
        for (const cy of [cyB, cyT]) for (const k of [-1, 1]) {
          const p = new THREE.Vector3(cx, cy, cz).addScaledVector(n, cs / 2).addScaledVector(t, k * cs * 0.24).addScaledVector(new THREE.Vector3(0, 1, 0), k * 0);
          (cy === cyT ? lid : body).add(stud, alignY(p, n), tint.band, uvBox(REG.gold, 2), true);
        }
      }
    }
    // horizontal bars: bottom ring (body) + top ring (lid) along the 4 edges between the cubes
    for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>) {
      const along = sx === 0 ? 2 * ex - 2 * cs + 0.02 : 2 * ez - 2 * cs + 0.02;
      const [lw, ld] = sx === 0 ? [along, bs] : [bs, along];
      const px = sx * (ex - bs / 2 - 0.01), pz = sz * (ez - bs / 2 - 0.01);
      body.add(chamferBox(lw, bs, ld, bc), T(px, yBotBar, pz), tint.band, uvBox(bandReg, sx + sz));
      far.add(chamferBox(lw, bs, ld, bc), T(px, yBotBar, pz), tint.band, uvBox(bandReg));
      lid.add(chamferBox(lw, bs, ld, bc), T(px, yTopBar, pz), tint.band, uvBox(bandReg, sx - sz + 3));
      far.add(chamferBox(lw, bs, ld, bc), T(px, yTopBar, pz), tint.band, uvBox(bandReg));
    }
    if (tint.gold) {
      // a RAISED gold banana medallion (a flat one read as a dark porthole) — a solid
      // domed gold boss in a fat gold ring, with a three-banana bunch standing proud of it in relief (all polished gold)
      const mr = 0.2, my = yB0 + hBody * 0.5;
      const boss = new THREE.CylinderGeometry(mr * 0.94, mr, 0.036, 48, 1);
      { const p = boss.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { const rr = Math.hypot(p.getX(i), p.getZ(i)) / mr; p.setY(i, p.getY(i) + 0.012 * (1 - rr * rr)); } boss.computeVertexNormals(); }
      body.add(boss, T(w / 2 + 0.018, my, 0, 0, 0, -Math.PI / 2), tint.band, uvBox(REG.gold, 5));
      body.add(new THREE.TorusGeometry(mr, 0.028, 14, 56), T(w / 2 + 0.036, my, 0, 0, Math.PI / 2, 0), tint.band, uvBox(REG.gold, 4));
      // the bunch: three fat bananas fanned from a shared stem (upper left) — in the face plane (+X out)
      for (let k = 0; k < 3; k++) {
        const bg = bananaGeometry({ length: 0.2, radius: 0.028, bend: 1.0, facets: 5, round: 0.35, along: 20, radial: 16, squash: 0.7 });
        const ang = -0.5 + k * 0.42;
        // banana authored along +X (stem at 0), bellies −Y: lay it in the ZY face plane, pushed out along +X
        const m = new THREE.Matrix4().makeRotationX(0).premultiply(new THREE.Matrix4().makeRotationZ(0))
          .premultiply(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)))
          .premultiply(new THREE.Matrix4().makeRotationX(ang))
          .premultiply(new THREE.Matrix4().makeTranslation(w / 2 + 0.064, my + 0.1, 0.075));
        body.add(bg, m, "#c98a0e", uvBox(REG.gold, 6 + k)); // a deeper gold so the relief reads on the boss
      }
      body.add(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 12), T(w / 2 + 0.06, my + 0.11, 0.09, 0, 0, 0.6), tint.band, uvBox(REG.gold, 9));
      far.add(boss, T(w / 2 + 0.018, my, 0, 0, 0, -Math.PI / 2), tint.band, uvBox(REG.gold));
    }
  }

  // ================================================================================================ LID
  const lb = bt + 0.012;
  {
    // core
    lid.add(new THREE.BoxGeometry(w - 0.06, hLid - 0.03, d - 0.06), T(0, yL0 + (hLid - 0.03) / 2, 0), "#ffffff", uvAt(REG.dark));
    // underside (seen when open): inner boards
    // (the target art's open lid glows inside: the emissive glow cell, warm gradient)
    // plain inner planks (a flat glow panel read peach and banded); the burst light paints it
    lid.add(new THREE.PlaneGeometry(w - 0.02, d - 0.02), T(0, yL0 - 0.003, 0, Math.PI / 2), "#ffffff", uvPlanar(style === "supply" ? REG.top : REG.inner, Z, -d / 2, d / 2, X, -w / 2, w / 2));
    // top boards (planks along X), planar into the top region
    const topY = yL1 - lb / 2;
    for (const [, v0, , v1] of BOARDS.top) {
      const bd = (v1 - v0) * d - 0.006, cz = d / 2 - (v0 + v1) / 2 * d;
      const g = chamferBox(w - 0.004, lb, bd, 0.012);
      lid.add(g, T(0, topY + (r() - 0.5) * 0.004, cz), "#ffffff", uvPlanar(REG.top, X, -w / 2, w / 2, Z.clone().negate(), -d / 2, d / 2));
    }
    far.add(new THREE.BoxGeometry(w, hLid, d), T(0, yL0 + hLid / 2, 0), "#ffffff", uvPlanar(REG.top, X, -w / 2, w / 2, Z.clone().negate(), -d / 2, d / 2));
    {
      // impostor lid: the planked top (planar) + four sides in the trim colour
      const lt = new THREE.PlaneGeometry(w + 0.04, d + 0.04).rotateX(-Math.PI / 2);
      imp.add(lt, T(0, yL1, 0), "#ffffff", uvPlanar(REG.top, X, -w / 2, w / 2, Z.clone().negate(), -d / 2, d / 2));
      const ls = new THREE.BoxGeometry(w + 0.06, hLid, d + 0.06).toNonIndexed();
      imp.add(ls, T(0, yL0 + hLid / 2, 0), style === "supply" ? "#c8b690" : cap, uvAt(style === "supply" ? REG.top : (tint.gold ? REG.gold : REG.band), 0.4, 0.5));
    }
    // lid side boards: front/back = three VERTICAL boards, left/right = two horizontal boards (board-local mapping)
    const sides: Array<{ c: THREE.Vector3; s: THREE.Vector3; n: THREE.Vector3; fw: number; vertical: boolean }> = [
      { c: new THREE.Vector3(0, 0, d / 2), s: X, n: Z, fw: w, vertical: true },
      { c: new THREE.Vector3(0, 0, -d / 2), s: X.clone().negate(), n: Z.clone().negate(), fw: w, vertical: true },
      { c: new THREE.Vector3(w / 2, 0, 0), s: Z.clone().negate(), n: X, fw: d, vertical: false },
      { c: new THREE.Vector3(-w / 2, 0, 0), s: Z, n: X.clone().negate(), fw: d, vertical: false },
    ];
    const h0 = yL0 + 0.004, hh = hLid - lb - 0.006;
    let k = 0;
    for (const sd of sides) {
      const n = sd.vertical ? 3 : (shape.tall ? 1 : 2);
      for (let i = 0; i < n; i++) {
        const along = sd.vertical ? sd.fw / n : sd.fw, across = sd.vertical ? hh : hh / n;
        const cs = sd.vertical ? -sd.fw / 2 + (i + 0.5) * along : 0, cy = sd.vertical ? h0 + hh / 2 : h0 + (i + 0.5) * across;
        const len = sd.vertical ? across : along, wid = sd.vertical ? along : across;
        const g = chamferBox(len - 0.005, wid - 0.005, bt, 0.01);
        // board-local X = length: vertical boards stand up
        const sAx = sd.s.clone(), up = Y.clone();
        const m = sd.vertical ? new THREE.Matrix4().makeBasis(up, sAx.clone().negate(), sd.n) : new THREE.Matrix4().makeBasis(sAx, up, sd.n);
        if (m.determinant() < 0) (sd.vertical ? m.makeBasis(up, sAx, sd.n) : m.makeBasis(sAx.clone().negate(), up, sd.n));
        m.setPosition(sd.c.clone().addScaledVector(sd.s, cs).setY(cy).addScaledVector(sd.n, -bt / 2 + (r() - 0.5) * 0.004));
        // lineup crates carry a stencil on every side region → their lid boards sample the plain top rows instead
        const pb = shape.tall ? BOARDS.top[(k++ % 2) * 2] : BOARDS.side[(k++ * 2) % BOARDS.side.length];
        lid.add(g, m, "#ffffff", uvBoard(shape.tall ? REG.top : REG.side, pb, len, wid), true);
      }
    }
    // ---- metal on the lid
    const capS = shape.tall ? 0.15 : 0.25, capH = hLid + 0.025;
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      if (shape.tall) continue;
      const cx = sx * (w / 2 - capS / 2 + Tk), cz = sz * (d / 2 - capS / 2 + Tk), cy = yL0 + capH / 2 - 0.002;
      if (style === "supply") {
        const g = guardGeo(0.2, Tk, capH, 0.03);
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(-sx, 0, 0), Y, new THREE.Vector3(0, 0, -sz)).setPosition(new THREE.Vector3(sx * w / 2, yL0 - 0.002, sz * d / 2));
        lid.add(g, m, cap, uvBox(bandReg, sx + 2 * sz));
      } else {
        // the target art's caps are heavily ROUNDED chunky cubes (corner radius ≈ 15 % of the cap), not chamfered blocks
        lid.add(rbox(capS, capH, capS, 0.042, 4), T(cx, cy, cz), trim, uvBox(bandReg, sx * 5 + sz));
        far.add(chamferBox(capS, capH, capS, 0.04), T(cx, cy, cz), trim, uvBox(bandReg));
      }
      if (!shape.tall || tint.gold) {
        addScrew(lid, new THREE.Vector3(sx * (w / 2 + Tk + (style === "supply" ? 0 : 0.001)), yL0 + capH * 0.42, sz * (d / 2 - capS * 0.42)), new THREE.Vector3(sx, 0, 0));
        addScrew(lid, new THREE.Vector3(sx * (w / 2 - capS * 0.42), yL0 + capH * 0.42, sz * (d / 2 + Tk + 0.001)), new THREE.Vector3(0, 0, sz));
      }
    }
    if (style === "supply") {
      // yellow inner rim + a raised medallion boss on top
      for (const [sx, sz, lw, ld] of [[0, 1, w, 0.05], [0, -1, w, 0.05], [1, 0, 0.05, d], [-1, 0, 0.05, d]] as Array<[number, number, number, number]>)
        lid.add(rbox(lw, 0.06, ld, 0.02, 2), T(sx * (w / 2 + 0.004), yL0 + 0.03, sz * (d / 2 + 0.004)), trim, uvBox(REG.band, sx - sz));
      lid.add(rbox(0.3, 0.05, 0.3, 0.03, 2), T(0, yL1 + 0.01, 0), trim, uvBox(REG.band, 2));
      const mg = new THREE.CylinderGeometry(0.11, 0.11, 0.02, 32);
      const p = mg.attributes.position as THREE.BufferAttribute, a = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { const [u, v] = regionUV(REG.medal, p.getX(i) / 0.22 + 0.5, -p.getZ(i) / 0.22 + 0.5, 2); a[i * 2] = u; a[i * 2 + 1] = v; }
      mg.setAttribute("uv", new THREE.BufferAttribute(a, 2));
      lid.add(mg, T(0, yL1 + 0.04, 0), "#ffffff", (g) => g, true);
    } else if (!shape.tall) {
      // square-section bars along the left/right top edges between the caps, and a centre strap front→back with end caps
      const bw = 0.11, bh = 0.07, blen = d - 2 * capS + 0.02;
      for (const sx of [1, -1]) {
        lid.add(rbox(bw, bh, blen, 0.022, 3), T(sx * (w / 2 - bw / 2 + Tk * 0.6), yL1 + bh / 2 - 0.028, 0), trim, uvBox(bandReg, sx + 11));
        far.add(chamferBox(bw, bh, blen, 0.015), T(sx * (w / 2 - bw / 2 + Tk * 0.6), yL1 + bh / 2 - 0.028, 0), trim, uvBox(bandReg));
      }
      lid.add(rbox(0.15, 0.055, d + 0.02, 0.02, 3), T(0, yL1 + 0.012, 0), trim, uvBox(bandReg, 13));
      far.add(chamferBox(0.15, 0.055, d, 0.015), T(0, yL1 + 0.012, 0), trim, uvBox(bandReg));
      for (const sz of [1, -1]) {
        lid.add(rbox(0.21, capH + 0.02, 0.1, 0.034, 4), T(0, yL0 + capH / 2 + 0.008, sz * (d / 2 + Tk * 0.4)), trim, uvBox(bandReg, sz + 17));
        if (sz > 0) for (const sx of [1, -1]) addScrew(lid, new THREE.Vector3(sx * 0.055, yL0 + capH * 0.36, d / 2 + Tk * 0.4 + 0.05 + 0.001), Z);
      }
    }
  }
  // ---- seam glow halo: a ±3 cm vertical ribbon that follows the crate's REAL outline at the seam — just outside the seam
  // ring between the posts and just outside the metal across every corner post (cube crates), so the whole line glows
  const glowParts: THREE.BufferGeometry[] = [];
  {
    const ys = [yB1 + seam * 0.5]; if (shape.tall) ys.push(SEAM_LOW + SEAM_H / 2);
    // ±1.8 cm: stays inside the 4 cm lid gap (never over the plank faces)
    const H2 = shape.tall ? 0.03 : 0.018, e = SEAM_OUT + 0.004;
    const ring: Array<[number, number]> = [];
    if (style === "classic") {
      // quarter outline (front-right corner), then rotated ×4: board run → out to the post → round its corner → back in
      const post = Tk + 0.004, rc = 0.03;
      const q: Array<[number, number]> = [[0, d / 2 + e], [w / 2 - P - 0.01, d / 2 + e], [w / 2 - P - 0.01, d / 2 + post]];
      for (let k = 0; k <= 4; k++) { const a = Math.PI / 2 - (k / 4) * (Math.PI / 2); q.push([w / 2 + post - rc + Math.cos(a) * rc, d / 2 + post - rc + Math.sin(a) * rc]); }
      q.push([w / 2 + post, d / 2 - P - 0.01], [w / 2 + e, d / 2 - P - 0.01], [w / 2 + e, 0]);
      // mirror into the 4 quadrants (x, z signs) keeping a continuous loop: (+,+) → (+,−) → (−,−) → (−,+)
      const quad = (sx: number, sz: number, rev: boolean) => { const pts = q.map(([x, z]) => [x * sx, z * sz] as [number, number]); return rev ? pts.reverse() : pts; };
      ring.push(...quad(1, 1, false), ...quad(1, -1, true).slice(1), ...quad(-1, -1, false).slice(1), ...quad(-1, 1, true).slice(1));
    } else {
      const hw = w / 2 + e, hd = d / 2 + e, rr = 0.03;
      for (let k = 0; k < 4; k++) {
        const cx = (k === 0 || k === 3 ? 1 : -1) * (hw - rr), cz = (k < 2 ? 1 : -1) * (hd - rr), a0 = k * Math.PI / 2;
        for (let qq = 0; qq <= 4; qq++) { const a = a0 + (qq / 4) * (Math.PI / 2); ring.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); }
      }
      ring.push(ring[0]);
    }
    for (const yc of ys) {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      ring.forEach(([x, z], i) => { for (const v of [0, 1]) { pos.push(x, yc + (v - 0.5) * 2 * H2, z); uv.push(i / ring.length, v); } });
      for (let i = 0; i < ring.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); gg.setIndex(idx); gg.computeVertexNormals();
      glowParts.push(gg);
    }
  }
  const seamGlow = mergeGeometries(glowParts, false)!; seamGlow.computeBoundingSphere();
  // ---- leftovers (an opened crate must not look empty): the packing straw + a few bananas that stay in
  // an opened crate (the loot itself pops out as floor loot) — atlas UVs (straw = the rope cell, bananas = the painted
  // band cell tinted banana-yellow) so it merges into the opened geometry: still ONE material / ONE draw
  const left = new Bin();
  if (style !== "supply") {
    // the straw bed rides up to ~7 cm under the rim (from eye level a bed 17 cm down is invisible: the opened
    // crate looks empty) with five bananas lolling on it, two of them over the rim
    const cw = w - 0.09, cd = d - 0.09, fy = yB1 - 0.075;
    const sg = new THREE.PlaneGeometry(cw, cd, 14, 14).rotateX(-Math.PI / 2);
    const sp = sg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), z = sp.getZ(i), e = Math.min(1, Math.min(cw / 2 - Math.abs(x), cd / 2 - Math.abs(z)) / 0.1); sp.setY(i, fy + e * (0.02 + 0.03 * Math.sin(x * 17 + 1) * Math.cos(z * 13) + 0.015 * Math.sin(x * 41 + z * 29))); }
    sg.computeVertexNormals();
    left.add(sg, null, "#f2dcaa", uvPlanar(REG.rope, X, -cw / 2, cw / 2, Z, -cd / 2, cd / 2));
    const bn = bananaGeometry({ length: 0.34, radius: 0.052, bend: 0.9, facets: 5, round: 0.3, along: 18, radial: 15 });
    for (const [x, z, ry, rl] of [[-0.18, 0.08, 0.5, 0.25], [0.05, -0.12, -0.35, -0.2], [0.14, 0.14, 2.4, 0.3], [-0.3, -0.25, 1.4, 0.45], [0.3, -0.05, -1.9, 0.35]] as Array<[number, number, number, number]>) {
      left.add(bn, T(x, fy + 0.035, z, rl, ry, 0).multiply(new THREE.Matrix4().makeTranslation(-0.17, 0, 0)), "#ffdc3a", uvAt(REG.band, 0.4, 0.5));
    }
  }
  const leftovers = left.parts.length ? left.merge() : null;
  const hinge = new THREE.Vector3(0, yL0, -d / 2 - Tk);
  const bodyG = body.merge();
  const lidG = lid.merge();
  const closed = mergeGeometries([bodyG, lidG], false)!;
  closed.computeBoundingSphere(); closed.computeBoundingBox();
  const lidLocal = lidG.clone(); lidLocal.translate(-hinge.x, -hinge.y, -hinge.z); lidLocal.computeBoundingSphere();
  const farG = far.merge();
  const impG = imp.merge();
  const tris = closed.attributes.position.count / 3;
  return { closed, far: farG, imp: impG, seamGlow, body: bodyG, lid: lidLocal, hinge, shape, tris, leftovers };
}
