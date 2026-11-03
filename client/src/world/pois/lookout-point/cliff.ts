// LOOKOUT POINT cliff: the W sea-cliff face as one continuous wall of tall columnar rock prisms (grey-brown columnar
// basalt, bevelled facets, joint grooves, moss on the ledges; tops flush with the plateau under a turf cap that rolls
// over the lip), ivy curtains hanging from the rim, fallen columns + boulders at the foot, and the switchback stair
// hung in its notch (stone treads on solid undersides, corbelled landings, white rails, landing lamps).
// Layout (columns, stair, fence) = shared/pois/lookout-point.ts ← lookout-baked.json.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import * as L from "../../../../../shared/pois/lookout-point";
import { rng, toWorld, F } from "../../../../../shared/pois/coast-kit";
import { Batch, M, rbox, box, mat } from "../_kit/coast-kit";
import { rockBlock } from "../peel-strip/hero-props";
import * as P from "../_kit/coast-props";
import * as TX from "../_kit/coast-tex";
import { Biome } from "../../../../../shared/world/map";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
// the cliff: big smooth grey VERTICAL SLABS with rounded edges, dark crevices and a few fracture lines. The slab texture
// (cliff-slab: grey sculpted slabs, world-scale 10 m tile), tall segments (7–15 m, not 2.6–5 m courses), smooth-shaded
// rounded corners with a gentle bulge, vertex colour ≤ 1 and near neutral (the texture carries the colour).
const ROCK = new THREE.Color(0.84, 0.9, 1.0), MOSS = new THREE.Color(0.42, 0.55, 0.24), WET = 0.66;
const SLAB_TILE = 10;
/** ground players stand on: terrain or a cliff cap */
export const groundAt = (ctx: WorldCtx, x: number, z: number) => Math.max(ctx.terrain.height(x, z), L.capAt(x, z));

let turfMat: THREE.MeshStandardMaterial | null = null, ivyMat: THREE.MeshStandardMaterial | null = null;
/** turf for the cliff caps: the terrain's own grass layer (same texture + tile + tint as the island lawn) */
export async function cliffMaterials(ctx: WorldCtx) {
  const [map, nrm] = await Promise.all([
    ctx.assets.texture("assets/terrain/tex3/grass/diff.webp"),
    ctx.assets.texture("assets/terrain/tex3/grass/nor.webp", { srgb: false }),
  ]);
  turfMat = new THREE.MeshStandardMaterial({ map, normalMap: nrm, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 1, vertexColors: true, color: new THREE.Color(0.66, 0.66, 0.36), side: THREE.DoubleSide });
  turfMat.name = "coast:turf";
  const iv = TX.ivy();
  ivyMat = new THREE.MeshStandardMaterial({ map: iv.map, normalMap: iv.normalMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true });
  ivyMat.name = "coast:ivy";
}

// ------------------------------------------------------------------------------------------------ column of blocks
/** the column's cross-section (column-local XZ, counter-clockwise from above): back-left → left side → rounded outer
 *  corner → the outer face (a soft crease) → rounded corner → right side → back-right */
function section(c: L.Column, r: () => number): Array<[number, number]> {
  const hw = c.w / 2, zo = c.zout, zi = c.zin, notch = !!(c as L.Column & { notch?: number }).notch;
  const R0 = Math.min(hw * 0.45, notch ? 0.35 : 0.5 + r() * 0.6);
  const s: Array<[number, number]> = [[-hw, zi], [-hw, zo - R0 - 0.4]];
  for (let k = 0; k <= 5; k++) { const a = Math.PI - (k / 5) * (Math.PI / 2); s.push([-hw + R0 + Math.cos(a) * R0, zo - R0 + Math.sin(a) * R0]); }
  // the outer face: two soft creases (the face reads as two or three slabs, not one flat plank)
  if (!notch) for (const f of [-0.3, 0.3]) s.push([f * hw + (r() - 0.5) * 0.35, zo + 0.02 + (r() - 0.5) * 0.28]);
  for (let k = 0; k <= 5; k++) { const a = Math.PI / 2 - (k / 5) * (Math.PI / 2); s.push([hw - R0 + Math.cos(a) * R0, zo - R0 + Math.sin(a) * R0]); }
  s.push([hw, zo - R0 - 0.4], [hw, zi]);
  return s;
}
/** 2D outward vertex normals of a closed CCW polygon (XZ) */
function secNormals(s: Array<[number, number]>): Array<[number, number]> {
  const n = s.length, out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = s[(i - 1 + n) % n], b = s[i], c = s[(i + 1) % n];
    // edge (dx, dz) → outward (−dz, dx) for this winding (left side runs +z: outward −x; the face runs +x: outward +z)
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    let nx = -(e1[1] / l1 + e2[1] / l2), nz = e1[0] / l1 + e2[0] / l2; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    out.push([nx, nz]);
  }
  return out;
}

/**
 * One rock pillar in column-local space (+Z out of the face): 2–5 TALL segments (7–15 m) of smooth-shaded stone with
 * rounded outer corners, a gentle bulge and a rolled edge at each joint (an occasional horizontal fracture, not
 * masonry courses), jittered in/out per segment. UVs are world-scale (u = arc length along the section, v = world y,
 * SLAB_TILE m per repeat) so the slab texture never stretches. Vertex colours: near-neutral per segment, wet + darker
 * toward the foot, shade under the rolled joints, moss on ledges.
 */
function columnGeo(c: L.Column) {
  const r = rng(c.seed), base = section(c, r), bn = secNormals(base), n = base.length;
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]));
  const u0 = r() * SLAB_TILE, colTint = 0.9 + r() * 0.12;
  const tops = [c.y1];
  for (let y = c.y1; y - c.y0 > 3;) { y = Math.max(c.y0, y - (7 + r() * 8)); if (y - c.y0 < 4.5) y = c.y0; tops.push(y); }
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], segTint: THREE.Color[] = [], vSeg: number[] = [];
  let topRing: Array<[number, number]> = base;
  for (let s = 0; s + 1 < tops.length; s++) {
    const yb1 = tops[s], yb0 = tops[s + 1], first = s === 0, last = s + 2 === tops.length, H = yb1 - yb0;
    const dx = (r() - 0.5) * 0.3, dz = first ? 0 : (r() - 0.5) * 0.55, lean = first ? 0 : (r() - 0.5) * 0.02;
    const tint = new THREE.Color().copy(ROCK).multiplyScalar(colTint * (0.9 + r() * 0.14));
    if (r() < 0.35) tint.multiply(new THREE.Color(1.02, 0.99, 0.95)); else if (r() < 0.3) tint.multiply(new THREE.Color(0.96, 0.99, 1.02));
    segTint.push(tint);
    const bv = Math.min(H * 0.12, 0.45 + r() * 0.3);
    // ring levels [y, inset] (positive inset = into the rock): rolled lower edge, bulging body, rolled upper edge
    const lv: Array<[number, number]> = [];
    if (last) lv.push([yb0, 0]); else lv.push([yb0, bv * 0.95], [yb0 + bv * 0.3, bv * 0.4], [yb0 + bv, 0.05]);
    const nb = Math.max(2, Math.round((H - 2 * bv) / 2.2)), bulge = 0.1 + r() * 0.22, ph = r() * 6;
    for (let k = 1; k < nb; k++) { const t = k / nb; lv.push([yb0 + bv + (H - 2 * bv) * t, -bulge * Math.sin(Math.PI * t) + 0.07 * Math.sin(ph + t * 7)]); }
    if (first) lv.push([yb1 - 0.7, 0.03], [yb1 - 0.22, 0.14], [yb1, 0.34]); // the lip rolls back under the turf
    else lv.push([yb1 - bv, 0.05], [yb1 - bv * 0.3, bv * 0.4], [yb1, bv * 0.95]);
    const v0 = pos.length / 3;
    // every jitter / bulge / lean is clamped to
    // ≤ 0.22 m outside the column's collider box (|x| ≤ w/2, z ≤ zout) — the face keeps its relief inward
    const hwC = c.w / 2 + 0.22, zC = c.zout + 0.22;
    const ring = (y: number, ins: number) => base.map(([x, z], k): [number, number, number] => {
      const outer = z > c.zin + 0.5, w = outer ? 1 : 0.25;
      const px = x + (outer ? dx : 0) - bn[k][0] * ins * w, pz = z + (outer ? dz + lean * (y - yb0) : 0) - bn[k][1] * ins * w;
      return [Math.max(-hwC, Math.min(hwC, px)), y, Math.min(zC, pz)];
    });
    let T: Array<[number, number, number]> = [];
    for (const [y, ins] of lv) {
      T = ring(y, ins);
      for (let k = 0; k < n; k++) { pos.push(...T[k]); uv.push(u0 + acc[k] / SLAB_TILE, y / SLAB_TILE); vSeg.push(s); }
    }
    for (let j = 0; j + 1 < lv.length; j++) for (let k = 0; k + 1 < n; k++) {
      const a = v0 + j * n + k, b = a + 1, cc = a + n, d = cc + 1;
      idx.push(a, b, d, a, d, cc);
    }
    // cap (a ledge where the segment above is set back; the column top under the turf)
    const cx = T.reduce((q, p) => q + p[0], 0) / n, cz = T.reduce((q, p) => q + p[2], 0) / n, vc = pos.length / 3;
    pos.push(cx, yb1, cz); uv.push(u0, 0); vSeg.push(s);
    const cap0 = pos.length / 3;
    for (let k = 0; k < n; k++) { pos.push(...T[k]); uv.push(u0 + T[k][0] / SLAB_TILE, T[k][2] / SLAB_TILE); vSeg.push(s); }
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n, A = T[k], B = T[k1];
      // wind the fan so it faces up
      const ny = (B[0] - cx) * (A[2] - cz) - (B[2] - cz) * (A[0] - cx);
      if (ny >= 0) idx.push(vc, cap0 + k1, cap0 + k); else idx.push(vc, cap0 + k, cap0 + k1);
    }
    if (first) topRing = T.map((p) => [p[0], p[2]] as [number, number]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal, col = new Float32Array(pos.length), tmp = new THREE.Color();
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1], ny = nrm.getY(i);
    const foot = Math.min(1, Math.max(0, (y - c.y0 - 1.5) / 7));
    tmp.copy(segTint[vSeg[i]]).multiplyScalar(WET + (1 - WET) * foot);
    if (ny < -0.3) tmp.multiplyScalar(0.72);                              // under a rolled joint: shade
    else if (ny > 0.35) tmp.lerp(MOSS, Math.min(0.8, (ny - 0.35) * 1.4)); // ledges: moss
    col[i * 3] = Math.min(1, tmp.r); col[i * 3 + 1] = Math.min(1, tmp.g); col[i * 3 + 2] = Math.min(1, tmp.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return { g, topRing, topY: c.y1 };
}

/** a turf cap over the column top whose outer edge ROLLS over the lip (3-step bevel) and hangs a ragged fringe, column-local */
function turfGeo(c: L.Column, ring: Array<[number, number]>, y: number, seed: number) {
  const r = rng(seed), pos: number[] = [], col: number[] = [], uv: number[] = [];
  const zc = (c.zin + c.zout) / 2;
  const add = (x: number, yy: number, z: number, k = 1) => { pos.push(x, yy, z); col.push(k, k, k); uv.push(0, 0); };
  const orient = (hint: number[]) => {
    const n = pos.length, A = pos.slice(n - 9, n - 6), B = pos.slice(n - 6, n - 3), C = pos.slice(n - 3);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { pos.splice(n - 6, 6, ...C, ...B); }
  };
  const sn = secNormals(ring);
  // top fan (turf over the whole cap, 5 cm proud)
  const R = ring.map(([x, z]) => [x, z] as [number, number]);
  for (let i = 0; i < R.length; i++) { const i1 = (i + 1) % R.length; add(0, y + 0.05, zc); add(R[i1][0], y + 0.05, R[i1][1]); add(R[i][0], y + 0.05, R[i][1]); orient([0, 1, 0]); }
  // the roll over the outer edge: out 0.18 → 0.3 → 0.28 m while dropping 0.08 → 0.3 → ragged 0.5–1.2 m
  // a thin grass lip (a 0.45–1.2 m green fringe reads as a cake layer): rolls 0.2 m over the rounded
  // rock lip, hangs 0.15–0.5 m in tufts (0.05 m between them)
  const prof: Array<[number, number, number]> = [[0, 0.05, 1], [0.16, -0.05, 0.9], [0.24, -0.2, 0.72], [0.2, -0.4, 0.5]];
  const hang = R.map(() => (r() < 0.45 ? 0.08 : 0.15 + r() * 0.35));
  for (let i = 0; i < R.length - 1; i++) {
    const [x0, z0] = R[i], [x1, z1] = R[i + 1];
    if (z0 < c.zout - 1.4 && z1 < c.zout - 1.4) continue;
    const hint = [(sn[i][0] + sn[i + 1][0]), 0, (sn[i][1] + sn[i + 1][1])];
    for (let k = 0; k + 1 < prof.length; k++) {
      const [o0, d0, k0] = prof[k], [o1, d1b, k1] = prof[k + 1];
      const d1a = k + 2 === prof.length ? -hang[i] : d1b, d1c = k + 2 === prof.length ? -hang[i + 1] : d1b;
      const P = (x: number, z: number, n: [number, number], o: number) => [x + n[0] * o, z + n[1] * o];
      const a0 = P(x0, z0, sn[i], o0), b0 = P(x1, z1, sn[i + 1], o0), a1 = P(x0, z0, sn[i], o1), b1 = P(x1, z1, sn[i + 1], o1);
      add(a0[0], y + d0, a0[1], k0); add(b0[0], y + d0, b0[1], k0); add(b1[0], y + d1c, b1[1], k1); orient(hint);
      add(a0[0], y + d0, a0[1], k0); add(b1[0], y + d1c, b1[1], k1); add(a1[0], y + d1a, a1[1], k1); orient(hint);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** an ivy curtain: a tapered, slightly curved card hanging from the lip (column-local, top at y, face at z); the lower
 *  end narrows to the few strands the texture has there (no wide see-through sheet) */
function ivyGeo(x: number, y: number, z: number, w: number, h: number, seed: number) {
  const r = rng(seed), g = new THREE.PlaneGeometry(w, h, 4, 6);
  g.translate(0, -h / 2, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i), xx = p.getX(i), t = Math.max(0, -yy / h), taper = 1 - 0.55 * t * t;
    p.setX(i, xx * taper + Math.sin(t * 3 + seed) * 0.15 * t);
    p.setZ(i, 0.16 + Math.sin((xx / w) * Math.PI) * 0.12 + (r() - 0.5) * 0.06 + t * 0.12);
    uv.setX(i, uv.getX(i) * (w / 3) * taper + (seed % 7) * 0.13);
    // the card's top 40 % samples the texture's dense mat (v 1 → 0.62), the rest the strands
    uv.setY(i, 1 - Math.pow(t, 1.4) * 0.75);
  }
  g.translate(x, y + 0.35, z);
  g.computeVertexNormals();
  return g;
}

export function buildCliff(b: Batch, bNear: Batch, ctx: WorldCtx) {
  const ledges: Array<[number, number, number]> = [], rimPts: Array<[number, number, number]> = [];
  /** points ON the lip edge + the outward yaw: plants that hang over the drop (a leafy lip) */
  const hangPts: Array<[number, number, number, number]> = [];
  const r = rng(31);
  for (const [ci, c] of L.COLUMNS.entries()) {
    const f = M(c.x, 0, c.z, 0, c.yaw, 0);
    const { g, topRing, topY } = columnGeo(c);
    b.add(g, "gSlab", { m: f, uv: "keep" });
    // a dark back plate filling the crevice between this column and its neighbours (nothing behind a joint shows)
    const pd = 0.5, pz = c.zout - 0.75;
    b.add(box(c.w + 0.5, Math.max(1, topY - c.y0 - 0.4), pd), "gSlab", { m: mul(f, M(0, c.y0 + (topY - c.y0 - 0.4) / 2, pz)), uv: "local", tile: SLAB_TILE, color: new THREE.Color(0.42, 0.41, 0.4) });
    // neighbouring columns' turf caps overlap at one height (z-fight on the lawn by the lip): each cap 3 mm apart
    b.add(turfGeo(c, topRing, topY + (ci % 3) * 0.003, c.seed + 5), turfMat!, { m: f, uv: "box", tile: 3.2, shadow: false });
    // ivy: one tapered curtain on ~1 in 3 columns (not over the stair notch)
    const notch = !!(c as L.Column & { notch?: number }).notch;
    if (!notch && r() < 0.2) {
      const w = 1.4 + r() * 1.6, h = 2 + r() * 3.2, x = (r() - 0.5) * (c.w - w);
      b.add(ivyGeo(x, topY, c.zout, w, h, c.seed + 1), ivyMat!, { m: f, uv: "keep", color: new THREE.Color().setHSL(0.26 + r() * 0.04, 0.42, 0.6 + r() * 0.1), shadow: false });
    }
    // ledge plants on the lower columns + rim tufts
    const top = new THREE.Vector3(0, topY, (c.zin + c.zout) / 2 + (c.zout - c.zin) * 0.3).applyMatrix4(f);
    if (topY < L.TOP - 1) ledges.push([top.x, topY, top.z]);
    for (let k = 0; k < 3; k++) { const p = new THREE.Vector3((r() - 0.5) * c.w * 0.85, topY, c.zout - 0.35 - r() * 1.4).applyMatrix4(f); rimPts.push([p.x, topY, p.z]); }
    if (!notch && topY > L.TOP - 6) for (let k = 0; k < 2; k++) { const p = new THREE.Vector3((k - 0.5) * c.w * 0.5 + (r() - 0.5) * 1.2, topY, c.zout - 0.15).applyMatrix4(f); hangPts.push([p.x, topY, p.z, c.yaw]); }
  }
  // fallen blocks + boulders at the foot (the same grey stone)
  // fallen blocks plugging beach pockets (shared LK_FILL boxes, drawn exactly)
  for (const [x, y, z, w, h, d, yaw] of L.LK_FILL) rockBlock(b, M(x, y, z, 0, yaw, 0), w, h, d, Math.round(x * 3), { color: 0x8f8a84 });
  for (const [x, y, z, s, seed] of L.BAKED.boulders as Array<[number, number, number, number, number]>) {
    const rr = rng(seed), g = P.roundBoulderGeo(seed, s, s * (0.55 + rr() * 0.3), s * 0.85, 2);
    const cc = new Float32Array(g.attributes.position.count * 3), n = g.attributes.normal, tint = new THREE.Color().copy(ROCK).multiplyScalar(0.85 + rr() * 0.15);
    for (let i = 0; i < cc.length / 3; i++) { const t = tint.clone(); if (n.getY(i) > 0.55) t.lerp(MOSS, 0.4); const low = Math.max(0, -g.attributes.position.getY(i) / s); t.multiplyScalar(1 - 0.35 * low); cc[i * 3] = t.r; cc[i * 3 + 1] = t.g; cc[i * 3 + 2] = t.b; }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3));
    b.add(g, "gSlab", { m: M(x, y - s * 0.25, z, (rr() - 0.5) * 0.3, rr() * 6, (rr() - 0.5) * 0.3), uv: "box", tile: 6 });
  }
  void bNear; void ctx;
  return { ledges, rimPts, hangPts };
}

/**
 * A grass skin over the terrain's steep banks along the lip (where a column cap sits 1–3 m below the lawn the
 * terrain splats the bank as brown forest-floor litter — a "dirt scar" in the view camera's frame). Cells in the lip
 * band that are steep, high and not covered by a cap get the plateau turf 6 cm over the terrain. Visual only.
 */
export function lipDrape(b: Batch, ctx: WorldCtx, skip: (x: number, z: number) => boolean = () => false) {
  // also the plateau's Jungle-biome cells (the terrain paints them as bare forest-floor litter; the open
  // headland would show brown fields) — the whole plateau top inside the POI reads as one lawn
  const T = ctx.terrain, S = 1.5, X0 = -705, X1 = -545, Z0 = 395, Z1 = 580, nx = Math.round((X1 - X0) / S), nz = Math.round((Z1 - Z0) / S);
  const keep = new Uint8Array(nx * nz), nrm = [0, 1, 0];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + (i + 0.5) * S, z = Z0 + (j + 0.5) * S, h = T.height(x, z);
    if (h < L.TOP - 9 || L.capAt(x, z) >= h - 0.3) continue;
    if (Math.hypot(x - L.PAD.x, z - L.PAD.z) > 104 || skip(x, z)) continue;
    T.normal(x, z, nrm);
    if (nrm[1] > 0.9 && T.biomeAt(x, z) !== Biome.Jungle) continue;
    keep[j * nx + i] = 1;
  }
  // grow the mask one cell so the skin's edge tucks under the lawn / caps
  const grown = keep.slice();
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) if (!keep[j * nx + i] && (keep[j * nx + i - 1] || keep[j * nx + i + 1] || keep[(j - 1) * nx + i] || keep[(j + 1) * nx + i])) grown[j * nx + i] = 1;
  const vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1), pos: number[] = [], col: number[] = [], idx: number[] = [], r = rng(909);
  const v = (i: number, j: number) => {
    const k = j * (nx + 1) + i;
    if (vid[k] < 0) { const x = X0 + i * S, z = Z0 + j * S; vid[k] = pos.length / 3; pos.push(x, groundAt(ctx, x, z) + 0.06, z); const t = 0.86 + r() * 0.14; col.push(t, t, t); }
    return vid[k];
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (grown[j * nx + i]) { const a = v(i, j), b2 = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1); idx.push(a, c, b2, b2, c, d); }
  if (!idx.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  b.add(g, turfMat!, { uv: "box", tile: 3.2, shadow: false });
}

/**
 * The terrain area's sandstone cliff tiers around the headland (tan course-block boxes that would clash
 * with the grey face at both ends) get a skin of the SAME grey stacked-block stone
 * as our columns: a chamfered block shell 0.18 m proud of each tier's bounds, sliced into 3–4.5 m courses, moss on
 * the up-faces, a turf cap on capped tiers. Visual only (the terrain's own colliders stay authoritative; the shell is
 * within 0.2 m of them). Reads the terrain's published instance list (ctx.shared "terrainRocks").
 */
export function cladTerrainRocks(b: Batch, ctx: WorldCtx) {
  type Rk = { kind: string; x: number; y: number; z: number; yaw: number; sx: number; sy: number; sz: number; tilt: number; cap?: number };
  const rocks = ctx.shared.get("terrainRocks") as Rk[] | undefined;
  const caps: Array<[number, number, number]> = [];
  if (!rocks) return caps;
  const r = rng(515), C = [-632, 470], up = new THREE.Vector3();
  for (const rk of rocks) {
    if (rk.kind !== "block" || Math.hypot(rk.x - C[0], rk.z - C[1]) > 155 || rk.y + rk.sy / 2 < 2.5) continue;
    const h = rk.sy, n = Math.max(1, Math.round(h / 3.8)), top = rk.y + h / 2, tint0 = new THREE.Color().copy(ROCK).multiplyScalar(0.88 + r() * 0.12);
    for (let k = 0; k < n; k++) {
      const y0 = rk.y - h / 2 + (k * h) / n, hh = h / n + (k === n - 1 ? 0.03 : 0.02), last = k === n - 1;
      const jx = (r() - 0.5) * 0.3, jz = (r() - 0.5) * 0.3;
      const g = rbox(rk.sx + 0.36 + jx, hh, rk.sz + 0.36 + jz, Math.min(0.32, hh * 0.18));
      const nrm = g.attributes.normal, cc = new Float32Array(nrm.count * 3), t = tint0.clone().multiplyScalar(0.9 + r() * 0.14);
      const foot = Math.min(1, Math.max(0, (y0 - 1) / 6));
      for (let i = 0; i < nrm.count; i++) {
        up.fromBufferAttribute(nrm, i);
        const c2 = t.clone().multiplyScalar(WET + (1 - WET) * foot);
        if (up.y < -0.3) c2.multiplyScalar(0.62); else if (up.y > 0.5 && !last) c2.lerp(MOSS, 0.55);
        cc[i * 3] = c2.r; cc[i * 3 + 1] = c2.g; cc[i * 3 + 2] = c2.b;
      }
      g.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3));
      b.add(g, "gSlab", { m: M(rk.x, y0 + hh / 2 - 0.01, rk.z, rk.tilt, rk.yaw, 0, 1, 1, 1, "XYZ"), uv: "local", tile: SLAB_TILE });
    }
    if (rk.cap && top > 6) {
      const tg = new THREE.PlaneGeometry(rk.sx + 0.5, rk.sz + 0.5); tg.rotateX(-Math.PI / 2);
      b.add(tg, turfMat!, { m: M(rk.x, top + 0.06, rk.z, 0, rk.yaw, 0), uv: "box", tile: 3.2, shadow: false });
      caps.push([rk.x, top + 0.05, rk.z]);
    }
  }
  return caps;
}

// ------------------------------------------------------------------------------------------------ stair
/**
 * The cliff stair (never a concrete fire escape): individual dressed-stone treads (each tread a chunky
 * bevelled slab on its own riser block, jittered + tinted) on two slim stone stringers, landings cut from the cliff
 * rock (a chamfered rock block with flagstones on top, a rock corbel under it), white post-and-rail on the open side,
 * warm lamps set in stone niches, ferns / grass on the landings (returned as plant points).
 */
export function buildStair(b: Batch, bMid: Batch, glows: Array<{ p: THREE.Vector3; size: number }>) {
  const zf = L.ZONE_F, z1 = L.STAIR_Z1, z0 = L.STAIR_Z0;
  b.setFrame(zf.x, 0, zf.z, zf.yaw); bMid.setFrame(zf.x, 0, zf.z, zf.yaw);
  const STONE = new THREE.Color(0.9, 0.95, 1.0), RAIL = 0xf4f1ea, r = rng(77);
  const rails: Array<[THREE.Vector3, THREE.Vector3]> = [];
  const plants: Array<[number, number, number]> = [];
  const runs = [...L.FLIGHTS, ...(L.EXIT ? [L.EXIT] : [])];
  for (const f of runs) {
    const along = !(f as L.Run & { axis?: string }).axis;
    const t = L.treads(f), dir = Math.sign(along ? f.x1 - f.x0 : f.z1 - f.z0), W = along ? f.z1 - f.z0 : f.x1 - f.x0;
    const wc = along ? (f.z0 + f.z1) / 2 : (f.x0 + f.x1) / 2;
    for (const [i, [x, top]] of t.list.entries()) {
      const tint = STONE.clone().multiplyScalar(0.86 + r() * 0.16);
      const jx = (r() - 0.5) * 0.03, jy = (r() - 0.5) * 0.012, yaw = (r() - 0.5) * 0.03;
      // tread slab (8 cm nosing over the riser) + riser block down to the tread below
      const slab = rbox(t.run + 0.08, 0.2, W - 0.04, 0.04), riser = rbox(t.run - 0.02, t.rise + 0.16, W - 0.2, 0.02);
      const m = along ? M(x + jx - dir * 0.04, top - 0.1 + jy, wc, 0, yaw, 0) : M(wc, top - 0.1 + jy, x + jx - dir * 0.04, 0, Math.PI / 2 + yaw, 0);
      b.add(slab, "gBoulder", { m, uv: "local", tile: 1.3, color: tint, aoY: top - 0.16, aoRange: 0.14, aoMin: 0.72 });
      b.add(riser, "gBoulder", { m: mul(m, M(dir * 0.02, -0.1 - (t.rise + 0.16) / 2, 0)), uv: "local", tile: 1.3, color: tint.clone().multiplyScalar(0.82) });
      if (i % 9 === 4 && r() < 0.6) plants.push([...(toWorld(L.ZONE_F, along ? x : wc + (r() - 0.5) * W * 0.6, top, along ? f.z1 - 0.2 : x) as [number, number, number])]);
    }
    // two slim stone stringers under the tread ends, following the pitch
    const len = Math.abs(along ? f.x1 - f.x0 : f.z1 - f.z0), drop = f.y0 - f.y1, ang = Math.atan2(drop, len), sl = Math.hypot(len, drop);
    const mid = along ? (f.x0 + f.x1) / 2 : (f.z0 + f.z1) / 2;
    for (const e of [-1, 1]) {
      const o = wc + e * (W / 2 - 0.13);
      const m = along ? M(mid, (f.y0 + f.y1) / 2 - 0.5, o, 0, 0, dir < 0 ? ang : -ang, 1, 1, 1, "XYZ") : M(o, (f.y0 + f.y1) / 2 - 0.5, mid, dir < 0 ? -ang : ang, 0, 0, 1, 1, 1, "XYZ");
      b.add(along ? rbox(sl + 0.3, 0.42, 0.24, 0.04) : rbox(0.24, 0.42, sl + 0.3, 0.04), "gBoulder", { m, uv: "local", tile: 1.6, color: STONE.clone().multiplyScalar(0.78) });
    }
    if (along) {
      const outerEdge = f.z1 >= z1 - 0.01, sz = outerEdge ? f.z1 - 0.08 : f.z1 + 0.06;
      if (outerEdge) rails.push([new THREE.Vector3(f.x0, f.y0 + 0.02, sz), new THREE.Vector3(f.x1, f.y1 + 0.02, sz)]);
      else { const k = 1.1 / len; rails.push([new THREE.Vector3(f.x0 + dir * 1.1, f.y0 + 0.02 - drop * k, sz), new THREE.Vector3(f.x1 - dir * 1.1, f.y1 + 0.02 + drop * k, sz)]); }
    } else for (const e of [-1, 1]) rails.push([new THREE.Vector3(wc + e * (W / 2 - 0.08), f.y0 + 0.02, f.z0), new THREE.Vector3(wc + e * (W / 2 - 0.08), f.y1 + 0.02, f.z1)]);
  }
  for (const [i, l] of L.LANDINGS.entries()) {
    const xm = (l.x0 + l.x1) / 2, zm = (l.z0 + l.z1) / 2, lw = l.x1 - l.x0 + 0.2, ld = l.z1 - l.z0 + 0.2;
    // a rock-cut ledge — a faceted rock mass under the flags that grows out
    // of the face in three tapering, staggered courses (no straight box edges, no bracket)
    const rc = new THREE.Color().copy(ROCK).multiplyScalar(0.9 + r() * 0.1);
    rockBlock(b, M(xm, l.y - 1.15, zm, 0, (r() - 0.5) * 0.06, 0), lw + 0.35, 1.1, ld + 0.25, 300 + i * 7, { color: rc });
    // (the lower courses hug the face, clear of the flight under the landing)
    rockBlock(b, M(xm + (r() - 0.5) * 0.4, l.y - 2.5, l.z0 + ld * 0.2, 0, (r() - 0.5) * 0.3, 0), lw * 0.8, 1.45, ld * 0.42, 301 + i * 7, { color: rc.clone().multiplyScalar(0.92) });
    rockBlock(b, M(xm + (r() - 0.5) * 0.6, l.y - 3.8, l.z0 + ld * 0.1, 0, (r() - 0.5) * 0.4, 0), lw * 0.5, 1.4, ld * 0.22, 302 + i * 7, { color: rc.clone().multiplyScalar(0.85) });
    for (let a = 0; a < 2; a++) for (let c2 = 0; c2 < 3; c2++) {
      const fx = l.x0 + (a + 0.5) * (l.x1 - l.x0) / 2, fz = l.z0 + (c2 + 0.5) * (l.z1 - l.z0) / 3;
      b.add(rbox((l.x1 - l.x0) / 2 - 0.05, 0.1, (l.z1 - l.z0) / 3 - 0.05, 0.025), "gBoulder", { m: M(fx, l.y - 0.04, fz, 0, (r() - 0.5) * 0.04, 0), uv: "local", tile: 1.3, color: STONE.clone().multiplyScalar(0.84 + r() * 0.14) });
    }
    const xe = l.x0 < 0 ? l.x0 + 0.1 : l.x1 - 0.1, cz = z1 - 0.08;
    rails.push([new THREE.Vector3(l.x0, l.y, cz), new THREE.Vector3(l.x1, l.y, cz)]);
    rails.push([new THREE.Vector3(xe, l.y, z0 + 0.1), new THREE.Vector3(xe, l.y, cz)]);
    // a warm lamp in a stone niche on the back wall at every landing but the top one
    if (i > 0) {
      b.add(rbox(0.7, 0.9, 0.3, 0.06), "gBoulder", { m: M(xm, l.y + 2.3, z0 - 0.05), uv: "local", tile: 1.3, color: 0x6a6660 });
      b.add(rbox(0.9, 0.12, 0.42, 0.03), "gBoulder", { m: M(xm, l.y + 1.83, z0 + 0.08), uv: "local", tile: 1.3, color: STONE });
      const lp = P.wallLamp(bMid, M(xm, l.y + 2.2, z0 - 0.2, 0, 0, 0));
      glows.push({ p: lp.clone().applyMatrix4(bMid.frame), size: 1.2 });
    }
    if (r() < 0.8) plants.push([...(toWorld(L.ZONE_F, l.x0 < 0 ? l.x0 + 0.5 : l.x1 - 0.5, l.y, z0 + 0.5) as [number, number, number])]);
  }
  // white rails: posts every ~1.4 m + top + mid rail following the pitch
  for (const [a, c] of rails) {
    const d = c.clone().sub(a), n = Math.max(1, Math.round(Math.hypot(d.x, d.z) / 1.4));
    for (let k = 0; k <= n; k++) { const p = a.clone().lerp(c, k / n); bMid.add(rbox(0.08, 1.1, 0.08, 0.02), "pmetal", { m: M(p.x, p.y + 0.55, p.z), color: RAIL, lod: 1 }); }
    for (const hh of [1.08, 0.58]) P.strut(bMid, [a.x, a.y + hh, a.z], [c.x, c.y + hh, c.z], hh > 1 ? 0.04 : 0.025, RAIL, new THREE.Matrix4(), "pmetal");
  }
  b.setFrame(0, 0, 0, 0); bMid.setFrame(0, 0, 0, 0);
  return plants;
}

void F; void mat; void mul;
