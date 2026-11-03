// THE PLANTATION yard: dirt roads (feathered terrain-hugging ribbons with tyre ruts + pebbles), the timber water
// tower (splayed braced trestle, stave tank with hoops, red conical corrugated roof, BANANA CO. badge), worker
// cottages (plank walls, red / yellow corrugated roofs, porch), tractor + banana trailer, roadside BANANA CO. crates,
// floodlight pole, fence along the road, heliconia clumps. Layout: shared/pois/the-plantation.ts.
import * as THREE from "three";
import type { Terrain } from "../../../../../shared/world/terrain";
import * as S from "../../../../../shared/pois/the-plantation";
import { rng } from "../../../../../shared/pois/coast-kit";
import { Batch, M, box, rbox, cyl, sph, lathe, addPieces, frameGeo, rectShape, shapeGeo, gableGeo, blobShadow, decal } from "../_kit/coast-kit";
import * as P from "../_kit/coast-props";
import { wheel } from "../_kit/coast-vehicles";
import { pickup, tractor, trailer } from "../_kit/coast-vehicles";
import { textDecal } from "../_kit/coast-sign";
import * as TX from "../_kit/coast-tex";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);

// ------------------------------------------------------------------------------------------------ roads
/** smooth a polyline with Catmull-Rom and resample every `step` metres */
function smooth(pts: Array<[number, number]>, step = 1.5): Array<[number, number]> {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal", 0.5);
  const n = Math.max(2, Math.ceil(c.getLength() / step));
  return c.getSpacedPoints(n).map((v) => [v.x, v.z] as [number, number]);
}

/** feathered ground ribbon along a polyline: rgba vertex colour (alpha fades at the edges, noisy width) */
function groundRibbon(T: Terrain, pts: Array<[number, number]>, hw: number, o: { lift?: number; across?: number; tile?: number; feather?: number; wob?: number; seed?: number; offset?: number; alpha?: number } = {}) {
  const across = o.across ?? 8, lift = o.lift ?? 0.05, tile = o.tile ?? hw * 2, fea = o.feather ?? 0.3, wob = o.wob ?? 0.12, seed = o.seed ?? 1, off = o.offset ?? 0, A = o.alpha ?? 1;
  const rows = pts.length, cols = across + 1;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), col = new Float32Array(rows * cols * 4);
  let dist = 0;
  for (let i = 0; i < rows; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(rows - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const wl = hw * (1 + wob * Math.sin(dist * 0.21 + seed) + wob * 0.6 * Math.sin(dist * 0.57 + seed * 3.1));
    const wr = hw * (1 + wob * Math.sin(dist * 0.19 + seed * 1.7) + wob * 0.6 * Math.sin(dist * 0.63 + seed * 2.3));
    for (let j = 0; j < cols; j++) {
      const s = j / across * 2 - 1; // -1..1
      const w = s < 0 ? wl : wr;
      const x = pts[i][0] + nx * (s * w + off), z = pts[i][1] + nz * (s * w + off);
      const k = i * cols + j;
      pos[k * 3] = x; pos[k * 3 + 1] = T.height(x, z) + lift; pos[k * 3 + 2] = z;
      uv[k * 2] = (s * w + hw) / tile; uv[k * 2 + 1] = dist / tile;
      const e = 1 - Math.abs(s), al = Math.min(1, e / fea);
      col[k * 4] = col[k * 4 + 1] = col[k * 4 + 2] = 1; col[k * 4 + 3] = al * al * (3 - 2 * al) * A;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) { const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal;
  if (n.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

let roadMat: THREE.MeshStandardMaterial | null = null, yardMat: THREE.MeshStandardMaterial | null = null;
let roadOpaque: THREE.MeshStandardMaterial | null = null, yardOpaque: THREE.MeshStandardMaterial | null = null;
/** each ground decal = an OPAQUE interior (depth-writing: the tile GPU's hidden-surface removal then skips the
 *  terrain under it — a blended decal pays for both) + a thin blended rim for the soft / grassy edge */
function groundMats() {
  if (roadMat) return;
  const rs = TX.plRoad(), ys = TX.plYard();
  const dm = (set: typeof rs, name: string, blended: boolean) => {
    // perf: the rims are ALPHA-TESTED (crisp grass-blade edge) instead of blended — blended rims cost ~0.25 ms at the
    // poi-07 view (the road fills the lower third of the frame)
    const m = new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96, alphaTest: blended ? 0.5 : 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    m.name = name; return m;
  };
  roadMat = dm(rs, "coast:plRoad", true); yardMat = dm(ys, "coast:plYard", true);
  roadOpaque = dm(rs, "coast:plRoadIn", false); yardOpaque = dm(ys, "coast:plYardIn", false);
  // the opaque interiors sit IN FRONT of every blended rim (depth offset) so where two roads / the yard overlap, one
  // road's grassy rim never paints a green seam across the other's surface
  for (const m of [roadOpaque!, yardOpaque!]) { m.polygonOffsetFactor = -5; m.polygonOffsetUnits = -10; }
}
/** split an indexed grid geometry (rows × cols vertices) into interior quads (inner(i, j) true) and the rest */
function splitGrid(g: THREE.BufferGeometry, rows: number, cols: number, inner: (i: number, j: number) => boolean) {
  const a: number[] = [], b: number[] = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const p = i * cols + j, q = p + 1, r = p + cols, t = r + 1;
    (inner(i, j) ? a : b).push(p, q, r, q, t, r);
  }
  // keep the faces pointing up (the source grids use either winding)
  const P = g.attributes.position, up = (ix: number[]) => {
    if (ix.length < 3) return ix;
    const v = (k: number) => new THREE.Vector3().fromBufferAttribute(P, ix[k]);
    const n = v(1).sub(v(0)).cross(v(2).sub(v(0)));
    if (n.y < 0) for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
    return ix;
  };
  const ga = g.clone(), gb = g.clone();
  ga.setIndex(up(a)); gb.setIndex(up(b));
  return [ga, gb];
}

/** orange compacted-dirt roads: ONE terrain-hugging ribbon per road with the painted rut texture running along it
 *  (4 m per repeat), soft jagged grass-fringed edges in the texture; a few real stones on the shoulders */
export function buildRoads(b: Batch, T: Terrain) {
  groundMats();
  const r = rng(515);
  for (const [ri, road] of S.ROADS.entries()) {
    const pts = smooth(road.pts, 1.2), W = road.hw * 2 + 2.6;
    const g = groundRibbon(T, pts, W / 2, { lift: 0.06, across: 12, tile: 8, feather: 0.001, wob: 0.05, seed: ri * 7 + 2 });
    // u across 0..1 over the full ribbon, v = metres / 4
    const uv = g.attributes.uv as THREE.BufferAttribute, cols = 13;
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      for (let j = 0; j < cols; j++) uv.setXY(i * cols + j, j / (cols - 1), dist / 8);
    }
    // interior columns 3..9 of 12 are fully opaque in the texture (its alpha edge lives in the outer 25 %)
    const [gin, grim] = splitGrid(g, pts.length, cols, (_i, j) => j >= 3 && j < 9);
    b.add(gin, roadOpaque!, { uv: "keep", shadow: false });
    b.add(grim, roadMat!, { uv: "keep", shadow: false });
    // stones on the shoulders (real meshes, a few)
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc < 3.2) continue;
      acc = 0;
      const [x0, z0] = pts[i], [x1, z1] = pts[i - 1], tl = Math.hypot(x0 - x1, z0 - z1) || 1, nx = -(z0 - z1) / tl, nz = (x0 - x1) / tl;
      const side = r() < 0.5 ? -1 : 1, off = side * road.hw * (0.75 + r() * 0.4), x = x0 + nx * off, z = z0 + nz * off, sz = 0.08 + Math.pow(r(), 2) * 0.2;
      b.add(P.boulderGeo(1000 + i + ri * 999, sz * 1.3, sz * 0.6, sz), "gBoulder", { m: M(x, T.height(x, z) + sz * 0.2, z, 0, r() * 6, 0), tile: 1, color: r() < 0.5 ? 0xd8b89a : 0xbfb3a4, shadow: false, lod: 2 });
    }
  }
}

let soilIn: THREE.MeshStandardMaterial | null = null, soilRim: THREE.MeshStandardMaterial | null = null;
/** leaf-litter soil under the banana rows along the hero road: the
 *  soil-litter set (dark soil, dry banana leaves, seedlings) at 3 m per repeat on a terrain-hugging ribbon each side of
 *  road R1W, opaque inside (no overdraw cost) with a feathered outer rim into the terrain's farmland */
export function buildRowSoil(b: Batch, T: Terrain, set: { map: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture }) {
  if (!soilIn) {
    const mk = (blend: boolean) => { const m = new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, vertexColors: true, transparent: blend, depthWrite: !blend, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }); m.name = blend ? "coast:soilRim" : "coast:soil"; return m; };
    soilIn = mk(false); soilRim = mk(true);
  }
  const road = S.ROADS[0];
  for (const side of [-1, 1]) {
    const pts: Array<[number, number]> = [];
    for (let t = 6; t <= 78; t += 2) pts.push(S.roadPt(t, side * (road.hw + 0.2 + 6.6)));
    const g = groundRibbon(T, pts, 6.6, { lift: 0.035, across: 10, tile: 3, feather: 0.001, wob: 0.03, seed: 50 + side });
    const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute, col = g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
      // the ribbon's +normal side (s → +1, j = 10) points NNE: the outer (field) edge is j = 10 on the left ribbon, j = 0 on the right
      const j = i % 11, outer = side < 0 ? j >= 9 : j <= 1, a = outer ? (side < 0 ? (10 - j) / 2 : j / 2) : 1;
      col.setXYZW(i, 1.0, 0.98, 0.86, a); // a touch lighter (darker reads as a red-brown mulch)
    }
    const [gin, grim] = splitGrid(g, pts.length, 11, (_i, j) => (side < 0 ? j < 8 : j >= 2));
    b.add(gin, soilIn!, { uv: "keep", shadow: false });
    b.add(grim, soilRim!, { uv: "keep", shadow: false });
  }
}

/** the compacted-dirt yard in front of the packing house (one bespoke painted decal, barn frame) */
export function buildYardGround(b: Batch, T: Terrain) {
  groundMats();
  const f = S.BARN.frame, X0 = -30, X1 = 16, Z0 = -2, Z1 = 22, nx = 46, nz = 24;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const lx = X0 + (X1 - X0) * i / nx, lz = Z0 + (Z1 - Z0) * j / nz;
    const x = f.x + lx * c + lz * sn, z = f.z - lx * sn + lz * c;
    pos.push(x, T.height(x, z) + 0.09, z); uv.push(i / nx, 1 - j / nz);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, bb = a + 1, cc = a + nx + 1, d = cc + 1; idx.push(a, cc, bb, bb, cc, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // the decal's mask is solid inside x −22…+10, z +2…+17 (its noisy edge lives outside that)
  const [gin, grim] = splitGrid(g, nz + 1, nx + 1, (i, j) => { const lx = X0 + (X1 - X0) * (j + 0.5) / nx, lz = Z0 + (Z1 - Z0) * (i + 0.5) / nz; return (lx > -22 && lx < 10 && lz > 2 && lz < 6) || (lx > -12 && lx < 10 && lz > 2 && lz < 17); });
  b.add(gin, yardOpaque!, { uv: "keep", shadow: false });
  b.add(grim, yardMat!, { uv: "keep", shadow: false });
}

// ------------------------------------------------------------------------------------------------ water tower
export function buildWaterTower(b: Batch, glows: THREE.Vector3[]) {
  const W = S.WTOWER, s = W.legSpread, top = W.legH, TIMBER = 0xc49a68, TIMBER_D = 0xa47e56; // natural light timber (not dark red-brown)
  b.setFrame(W.x, S.PAD.y, W.z, W.yaw);
  // concrete footings
  for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(rbox(0.9, 0.5, 0.9, 0.06), "gConcrete", { m: M(a * (s + 0.35), 0.15, c * (s + 0.35)), tile: 2, color: 0xb6b0a6 });
  // splayed legs (feet wider than the head) — posts from footing to deck
  const foot = s + 0.35, head = s - 0.05;
  const legs: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [a, c] of legs) P.strut(b, [a * foot, 0.35, c * foot], [a * head, top - 0.3, c * head], 0.2, TIMBER, new THREE.Matrix4(), "wood");
  const at = (a: number, c: number, y: number) => { const t = (y - 0.35) / (top - 0.65), k = foot + (head - foot) * t; return [a * k, y, c * k]; };
  // girts + X braces on every face at two levels
  const faces: Array<[[number, number], [number, number]]> = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
  const levels = [0.6, top * 0.48, top - 0.55];
  for (const [p, q] of faces) {
    for (const y of levels) P.strut(b, at(p[0], p[1], y), at(q[0], q[1], y), 0.1, TIMBER_D, new THREE.Matrix4(), "wood");
    for (let l = 0; l < levels.length - 1; l++) {
      P.strut(b, at(p[0], p[1], levels[l]), at(q[0], q[1], levels[l + 1]), 0.08, TIMBER_D, new THREE.Matrix4(), "wood");
      P.strut(b, at(q[0], q[1], levels[l]), at(p[0], p[1], levels[l + 1]), 0.08, TIMBER_D, new THREE.Matrix4(), "wood");
    }
  }
  // bolts at the brace crossings
  for (const [p, q] of faces) for (let l = 0; l < 2; l++) {
    const y = (levels[l] + levels[l + 1]) / 2, a = at(p[0], p[1], y), c = at(q[0], q[1], y);
    b.add(sph(0.06, 6, 4), "steel", { m: M((a[0] + c[0]) / 2, y, (a[2] + c[2]) / 2), color: 0x3a3632 });
  }
  // deck: joists + plank deck + railing
  const D = s + S.WT_DECK;
  for (const z of [-D + 0.2, 0, D - 0.2]) b.add(box(D * 2, 0.22, 0.16), "wood", { m: M(0, top - 0.36, z), tile: 1.5, color: TIMBER_D });
  b.add(rbox(D * 2, 0.14, D * 2, 0.03), "deck", { m: M(0, top - 0.18, 0), tile: 1.6, color: 0xb88c62 });
  // (the −x side leaves the gap where the new stair lands, S.WT_STAIR zTop … zEnd)
  for (const [x0, z0, x1, z1] of [[-D, -D, D, -D], [D, -D, D, D], [D, D, -D, D], [-D, D, -D, S.WT_STAIR.zTop]]) P.railing(b, x0, z0, x1, z1, top - 0.1, { h: 0.95, spacing: 1.1, mat: "wood", color: 0x7a5234, thick: 0.07, bars: 2 });
  // ladder up the +Z/+X leg face
  // (no decorative ladder: the timber stair on the −x face is the way up) + knee braces under
  // the widened deck
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lp = at(sx, sz, top - 1.7), e = at(sx, sz, top - 0.4);
    P.strut(b, lp, [sx * (D - 0.15), top - 0.4, e[2]], 0.07, TIMBER_D, new THREE.Matrix4(), "wood");
    P.strut(b, lp, [e[0], top - 0.4, sz * (D - 0.15)], 0.07, TIMBER_D, new THREE.Matrix4(), "wood");
  }
  // tank: stave barrel (slight belly), hoops, chime ring, floor
  const R = W.tankR, H = W.tankH, ty = top - 0.1;
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([R * (1 + 0.04 * Math.sin(Math.PI * t)), t * H]); }
  b.add(lathe(prof, { segs: 40, tile: 2.2, vTile: 2.2 }), "gStaves", { m: M(0, ty, 0), uv: "keep", color: 0xe6c49a, aoY: ty, aoRange: 1.2, aoMin: 0.62 });
  b.add(cyl(R - 0.05, R - 0.05, 0.2, 40), "wood", { m: M(0, ty + 0.1, 0), color: TIMBER_D });
  for (const t of [0.1, 0.32, 0.55, 0.78, 0.94]) {
    const rr = R * (1 + 0.04 * Math.sin(Math.PI * t)) + 0.03;
    b.add(new THREE.TorusGeometry(rr, 0.045, 6, 64).rotateX(Math.PI / 2), "pmetal", { m: M(0, ty + t * H, 0), uv: "local", tile: 1, color: 0x3d3834 });
  }
  // round BANANA CO. badge on the tank, facing the camera road (local +Z rotated toward -X)
  {
    const a = -Math.PI * 0.62, rr = R * 1.04 + 0.08, bm = M(Math.cos(a) * rr, ty + H * 0.52, Math.sin(a) * rr, 0, Math.PI / 2 - a, 0);
    b.add(cyl(0.95, 0.95, 0.08, 36).rotateX(Math.PI / 2), "pmetal", { m: bm, uv: "local", color: 0x2b2418 });
    decal(b, "badge", 1.85, 1.85, mul(bm, M(0, 0, 0.045)));
  }
  // conical corrugated roof (red), overhang, eave trim, finial + little vent
  const cy = ty + H;
  b.add(cyl(R + 0.08, R + 0.08, 0.18, 40), "wood", { m: M(0, cy + 0.09, 0), color: 0x5a3a26 });
  const cone = lathe([[R + 0.55, 0], [R + 0.5, 0.1], [0.12, 1.9], [0.02, 2.0]], { segs: 48, tile: 1.4, vTile: 1.4 });
  b.add(cone, "gCorrPaint", { m: M(0, cy + 0.12, 0), uv: "keep", color: 0xc8483a });
  // close the underside of the overhang (else a sky-blue slit shows under the rim)
  const soffit = new THREE.RingGeometry(R - 0.1, R + 0.56, 48, 1); soffit.rotateX(Math.PI / 2);
  b.add(soffit, "wood", { m: M(0, cy + 0.1, 0), uv: "local", tile: 1.5, color: 0x5a3a26 });
  b.add(new THREE.TorusGeometry(R + 0.53, 0.05, 5, 64).rotateX(Math.PI / 2), "pmetal", { m: M(0, cy + 0.12, 0), uv: "local", color: 0x8e2a22 });
  b.add(cyl(0.05, 0.1, 0.6, 8), "pmetal", { m: M(0, cy + 2.35, 0), color: 0x3a3632 });
  b.add(sph(0.12, 10, 8), "gloss", { m: M(0, cy + 2.7, 0), color: 0xe0b52a });
  // pipe down from the tank to the ground + valve
  b.add(cyl(0.12, 0.12, ty - 0.3, 10), "pmetal", { m: M(-0.6, (ty - 0.3) / 2 + 0.3, 0.4), uv: "local", color: 0x4c5a4e });
  b.add(new THREE.TorusGeometry(0.2, 0.04, 5, 12), "gloss", { m: M(-0.6, 1.2, 0.62, 0, 0, 0), uv: "local", color: 0xc0392b });
  b.setFrame(0, 0, 0, 0);
  void glows;
}

// ------------------------------------------------------------------------------------------------ worker cottage
const ROOFS = [0xc64a3a, 0xe3b52a];
export function buildCottage(b: Batch, bNear: Batch, f: { x: number; y: number; z: number; yaw: number }, roofIdx: number, seed: number, glows: THREE.Vector3[]) {
  const C = S.COT, hw = C.w / 2, hd = C.d / 2, fl = 0.45, eave = fl + C.h, rise = hd * Math.tan(C.pitch), r = rng(seed);
  const wallCol = [0xf1e6d2, 0xe8dcc4, 0xd9e2d8][seed % 3];
  b.setFrame(f.x, f.y, f.z, f.yaw); bNear.setFrame(f.x, f.y, f.z, f.yaw);
  addPieces(b, S.COT_LOCAL, {
    "ct:floor": { mat: "gPlanksH", color: 0x9c8a74, tile: 2 },
    "ct:wall": { mat: "gSiding", color: wallCol, tile: 2.4, ao: true },
    "ct:roof": { mat: "gCorrPaint", skip: true },
    "ct:gable": { mat: "gSiding", skip: true },
    "ct:step": { mat: "deck", color: 0x9c7a56, tile: 1.4, round: 0.02 },
    "ct:ceil": { mat: "wood", skip: true },
  }, 0);
  // stilts / plinth posts under the floor
  for (const x of [-hw, 0, hw]) for (const z of [-hd, hd]) b.add(rbox(0.3, 0.5, 0.3, 0.04), "gConcrete", { m: M(x, 0.1, z), tile: 1, color: 0xa39c90 });
  // gables
  for (const sx of [-1, 1]) b.add(gableGeo(C.d, rise, 0.2), "gSiding", { m: M(sx * (hw - 0.1), eave, 0, 0, Math.PI / 2, 0), uv: "local", tile: 2.4, color: wallCol });
  // corner boards + eave fascia
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(rbox(0.16, C.h + 0.1, 0.16, 0.02), "wood", { m: M(sx * hw, fl + C.h / 2, sz * hd), color: 0x7a5a3c });
  // corrugated roof (two slopes) with rafter tails + barge boards + ridge cap
  const run = hd + 0.55, len = run / Math.cos(C.pitch) + 0.05, cy = eave + (hd - run / 2) * Math.tan(C.pitch);
  for (const s of [-1, 1]) {
    const rm = M(0, cy + 0.14, s * run / 2, s * C.pitch, 0, 0);
    b.add(box(C.w + 0.9, 0.06, len), "gCorrPaint", { m: rm, uv: "local", tile: 2.2, color: ROOFS[roofIdx % 2] });
    b.add(box(C.w + 0.8, 0.12, len - 0.1), "wood", { m: mul(rm, M(0, -0.1, 0)), color: 0x4a3626 });
    for (let x = -hw; x <= hw + 0.01; x += 0.9) b.add(box(0.09, 0.14, 0.5), "wood", { m: mul(rm, M(x, -0.16, s * (len / 2 - 0.2))), color: 0x5a4030 });
    for (const e of [-1, 1]) b.add(rbox(0.1, 0.24, len + 0.05, 0.02), "wood", { m: mul(rm, M(e * (hw + 0.45), -0.02, 0)), color: 0xf0ead8 });
  }
  const ridge = cyl(0.12, 0.12, C.w + 0.95, 8); ridge.rotateZ(Math.PI / 2);
  b.add(ridge, "gCorrPaint", { m: M(0, eave + rise + 0.2, 0), uv: "local", tile: 2, color: new THREE.Color(ROOFS[roofIdx % 2]).multiplyScalar(0.8) });
  // doors + windows from the collider openings (front: door at doorX + window; back: window; left: small window)
  const front = (u: number) => M(-hw + u, fl, hd);
  const dm = front(hw + C.doorX);
  b.add(frameGeo(1.2, 2.35, 0.12, 0.26, false), "wood", { m: dm, uv: "local", tile: 1, color: 0xf0ead8 });
  // (the open leaf is drawn on its collider — S.COT_LOCAL "ct:leaf")
  for (const p of S.COT_LOCAL) if (p.k === "ct:leaf") {
    const lm = M(p.c[0], p.c[1], p.c[2], 0, p.yaw ?? 0, 0);
    b.add(rbox(p.h[0] * 2, p.h[1] * 2, 0.06, 0.02), "wood", { m: lm, color: [0x3f6f8a, 0x6a8f4a, 0xa5462f][seed % 3] });
    for (const py of [-0.5, 0.5]) bNear.add(rbox(p.h[0] * 1.4, p.h[1] * 0.6, 0.03, 0.01), "wood", { m: mul(lm, M(0, py * p.h[1], 0.035)), color: new THREE.Color([0x3f6f8a, 0x6a8f4a, 0xa5462f][seed % 3]).multiplyScalar(0.85) });
  }
  const win = (m0: THREE.Matrix4, w: number, h: number) => {
    b.add(frameGeo(w, h, 0.1, 0.26, false), "wood", { m: m0, uv: "local", tile: 1, color: 0xf0ead8 });
    b.add(shapeGeo(rectShape(w, h)), "glass", { m: mul(m0, M(0, 0, -0.04)), uv: "keep", shadow: false });
    // (no mullion cross — the pane breaks and you vault through)
    b.add(rbox(w + 0.3, 0.08, 0.26, 0.02), "wood", { m: mul(m0, M(0, -0.06, 0.1)), color: 0xf0ead8 });
    // shutters
    for (const sx of [-1, 1]) b.add(rbox(w * 0.5, h + 0.05, 0.05, 0.015), "wood", { m: mul(m0, M(sx * (w * 0.75 + 0.1), h / 2, 0.14)), color: [0x3f6f8a, 0x6a8f4a, 0xa5462f][(seed + 1) % 3] });
  };
  win(mul(front(1.3), M(0, 0.9, 0)), 1.1, 1.0);
  win(mul(M(-hw + C.w / 2, fl + 0.9, -hd, 0, Math.PI, 0), M()), 1.1, 1.0);
  win(mul(M(-hw, fl + 1.0, 0, 0, -Math.PI / 2, 0), M()), 0.9, 0.9);
  // porch: shed awning over the door on two posts + a bench, bucket, crate
  const pz = hd + 1.6;
  for (const x of [C.doorX - 1.3, C.doorX + 1.3]) b.add(rbox(0.12, 2.5, 0.12, 0.02), "wood", { m: M(x, 1.25, pz), color: 0x7a5a3c });
  b.add(box(3.1, 0.05, 1.9), "gCorrPaint", { m: M(C.doorX, 2.62, hd + 0.8, -0.18, 0, 0), uv: "local", tile: 2, color: ROOFS[(roofIdx + 1) % 2] });
  b.add(rbox(3.0, 0.12, 0.1, 0.02), "wood", { m: M(C.doorX, 2.45, pz), color: 0x7a5a3c });
  P.bench(bNear, M(-1.4, 0.45, hd + 0.55, 0, 0, 0));
  r(); r(); // (keeps the random stream: no loose porch crate + barrel — the cottage's rain barrel + woodshed are dress.ts)
  // washing line to a post
  bNear.add(cyl(0.05, 0.06, 2.2, 6), "wood", { m: M(hw + 3.2, 1.1, -hd + 0.5), color: 0x7a5a3c });
  const line = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(hw, 2.1, -hd + 0.5), new THREE.Vector3(hw + 1.6, 1.95, -hd + 0.5), new THREE.Vector3(hw + 3.2, 2.15, -hd + 0.5)]), 8, 0.012, 3);
  bNear.add(line, "steel", { uv: "keep", color: 0x555555 });
  for (let k = 0; k < 3; k++) bNear.add(box(0.5, 0.6, 0.02), "fabric", { m: M(hw + 0.7 + k * 0.9, 1.68, -hd + 0.5, 0, 0, (r() - 0.5) * 0.1), color: [0xf2f0ea, 0x5b8fc8, 0xe8c040][k] });
  // wall lamp by the door
  glows.push(P.wallLamp(b, M(C.doorX + 0.95, fl + 2.1, hd)).applyMatrix4(b.frame));
  b.setFrame(0, 0, 0, 0); bNear.setFrame(0, 0, 0, 0);
}

// ------------------------------------------------------------------------------------------------ heliconia
/** lobster-claw heliconia: 2–4 upright stems with zig-zag red bracts + a few paddle leaves (world matrix) */
export function heliconia(b: Batch, m: THREE.Matrix4, seed: number) {
  const r = rng(seed), stems = 2 + Math.floor(r() * 3);
  const bract = new THREE.ConeGeometry(0.07, 0.34, 5); bract.rotateZ(Math.PI / 2 - 0.4); bract.translate(0.14, 0, 0);
  for (let s = 0; s < stems; s++) {
    const a = r() * 6.28, lean = 0.1 + r() * 0.15, h = 1.1 + r() * 0.7;
    const sm = mul(m, M(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18, Math.sin(a) * lean, 0, -Math.cos(a) * lean));
    b.add(cyl(0.02, 0.03, h, 5), "plain", { m: mul(sm, M(0, h / 2, 0)), uv: "local", color: 0x3e6a2a });
    const nb = 5 + Math.floor(r() * 4);
    for (let k = 0; k < nb; k++) {
      const y = h + k * 0.075, side = k % 2 ? 1 : -1;
      b.add(bract, "plain", { m: mul(sm, M(0, y, 0, 0, side > 0 ? 0 : Math.PI, 0, 1 - k * 0.06)), uv: "local", color: k === nb - 1 ? 0xe8c040 : 0xd8262a });
    }
    b.add(cyl(0.015, 0.02, nb * 0.075 + 0.1, 4), "plain", { m: mul(sm, M(0, h + nb * 0.035, 0)), uv: "local", color: 0xb82a22 });
    // leaf
    const lg = new THREE.PlaneGeometry(0.28, 0.9, 1, 4); lg.translate(0, 0.45, 0);
    const p = lg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * Math.sin(Math.PI * Math.min(1, y / 0.9 + 0.05))); p.setZ(i, y * y * 0.35); }
    lg.computeVertexNormals();
    b.add(lg, "plain", { m: mul(sm, M(0, h * 0.35, 0, -0.5, r() * 6, 0)), uv: "keep", color: 0x3f7a30 });
  }
}

// ------------------------------------------------------------------------------------------------ yard assembly
export function buildYard(b: Batch, bMid: Batch, bNear: Batch, T: Terrain, glows: THREE.Vector3[]) {
  buildWaterTower(b, glows);
  for (const [i, c] of S.COTTAGES.entries()) buildCottage(b, bNear, c.f, c.roof, 11 + i, glows);
  // tractor + trailer on the road side (the trailer heaped ABOVE its sides with green bunches)
  const [tx, tz, tyaw] = S.TRACTOR;
  const tm = M(tx, T.height(tx, tz), tz, 0, tyaw, 0);
  tractor(bMid, tm);
  trailer(bMid, mul(tm, M(-4.2, 0, 0, 0, 0.06, 0)), 17);
  blobShadow(bMid, T, tx - Math.cos(tyaw) * 1.8, tz + Math.sin(tyaw) * 1.8, 9.5, 3.4, tyaw, undefined, 0.9);
  // contact AO: a soft dark skirt round the packing house's foot + under its porch
  { const f = S.BARN.frame, c = Math.cos(f.yaw), sn = Math.sin(f.yaw), lx = -5, lz = -12.5;
    blobShadow(bMid, T, f.x + lx * c + lz * sn, f.z - lx * sn + lz * c, 25.5, 29.5, f.yaw, S.PAD.y + 0.03, 0.75);
    const px = 1.5, pz = 3.5; blobShadow(bMid, T, f.x + px * c + pz * sn, f.z - px * sn + pz * c, 14, 6, f.yaw, S.PAD.y + 0.03, 0.6); }
  for (const c of S.COTTAGES) blobShadow(bMid, T, c.f.x, c.f.z, S.COT.w + 1.4, S.COT.d + 1.4, c.f.yaw, S.PAD.y + 0.03, 0.55);
  // yard dressing (barn frame): a teal farm pickup with crates in the bed, stacked pallets, a wheelbarrow of bunches,
  // glossy puddles in the ruts, sacks by the dock
  {
    const f = S.BARN.frame, bw = (lx: number, lz: number) => { const c = Math.cos(f.yaw), sn = Math.sin(f.yaw); return [f.x + lx * c + lz * sn, f.z - lx * sn + lz * c]; };
    const [px, pz, pyaw] = S.YARD_PICKUP, pw = bw(px, pz);
    pickup(bMid, M(pw[0], T.height(pw[0], pw[1]), pw[1], 0, f.yaw + pyaw, 0), 0x2f7f86);
    blobShadow(bMid, T, pw[0], pw[1], 5.6, 2.8, f.yaw + pyaw, undefined, 1);
    for (const [x, z, yaw, n] of S.YARD_PALLETS) {
      const w = bw(x, z), gy = T.height(w[0], w[1]);
      for (let k = 0; k < n; k++) P.pallet(bMid, M(w[0], gy + k * 0.145, w[1], 0, f.yaw + yaw + (k % 2) * 0.05, 0));
      blobShadow(bMid, T, w[0], w[1], 1.9, 1.7, f.yaw + yaw);
    }
    const wbx = bw(2.4, 9.5), wy = T.height(wbx[0], wbx[1]), wm = M(wbx[0], wy, wbx[1], 0, f.yaw + 0.6, 0);
    bMid.add(rbox(1.1, 0.35, 0.7, 0.08), "gloss", { m: mul(wm, M(0, 0.62, 0, 0, 0, -0.08)), color: 0x3f7f3a });
    for (const s2 of [-1, 1]) { bMid.add(cyl(0.025, 0.025, 1.5, 6).rotateZ(Math.PI / 2 - 0.12), "steel", { m: mul(wm, M(-0.35, 0.55, s2 * 0.3)), uv: "local", color: 0x333333 }); bMid.add(box(0.05, 0.4, 0.05), "steel", { m: mul(wm, M(-0.55, 0.22, s2 * 0.28)), color: 0x333333 }); }
    wheel(bMid, mul(wm, M(0.55, 0.2, 0)), 0.2, 0.09, { rim: 0xd8d8d8, hub: false });
    P.bananaHeap(bMid, mul(wm, M(0, 0.78, 0)), 0.9, 0.55, 5, 777, 0.15);
    for (const [x, z, rx, rz] of S.YARD_PUDDLES) {
      const w = bw(x, z), g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2); g.scale(rx, 1, rz);
      const pp = g.attributes.position; for (let i = 0; i < pp.count; i++) { const a = Math.atan2(pp.getZ(i), pp.getX(i)); const k = 1 + 0.18 * Math.sin(a * 3 + x) + 0.1 * Math.sin(a * 7); if (i) { pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); } }
      bMid.add(g, "darkGlass", { m: M(w[0], T.height(w[0], w[1]) + 0.1, w[1], 0, f.yaw, 0), uv: "keep", color: 0x6f5a44, shadow: false });
    }
    for (let k = 0; k < 4; k++) { const w = bw(5.5 + k * 0.55, 6.2 + (k % 2) * 0.4); P.sack(bMid, M(w[0], T.height(w[0], w[1]), w[1], 0, k, 0), k % 2 ? 0xcdb993 : 0xb9a47c); }
  }
  // big BANANA CO. crates on the verge
  for (const [i, [x, z, yaw]] of S.ROADSIDE_CRATES.entries()) {
    const y = T.height(x, z);
    if (i < 2) {
      P.pallet(bMid, M(x, y, z, 0, yaw, 0));
      P.crate(bMid, mul(M(x, y + 0.14, z, 0, yaw, 0), M(0, 0, 0, 0, 0, 0, 1.5)), { full: true, seed: 300 + i });
      blobShadow(bMid, T, x, z, 2.6, 1.8, yaw);
    } else P.crate(bMid, mul(M(x, y + 0.14 + 1.2, z, 0, yaw + 0.1, 0), M(0, 0, 0, 0, 0, 0, 1.5)), { full: true, seed: 330 });
  }
  // the harvest crates along the field roads (shared FIELD_CRATES — the collider is the roadside crate's box)
  for (const [i, [x, z, yaw]] of S.FIELD_CRATES.entries()) {
    const y = T.height(x, z);
    P.pallet(bMid, M(x, y, z, 0, yaw, 0));
    P.crate(bMid, mul(M(x, y + 0.14, z, 0, yaw, 0), M(0, 0, 0, 0, 0, 0, 1.5)), { full: true, seed: 340 + i });
    blobShadow(bMid, T, x, z, 2.6, 1.8, yaw);
  }
  // floodlight pole beside the barn yard (4 heads, unlit by day)
  const [fx, fz] = S.FLOOD;
  for (const p of P.floodPole(bMid, M(fx, T.height(fx, fz), fz, 0, S.BARN.frame.yaw - Math.PI / 2, 0), 11)) glows.push(p);
  // post-and-rail fence along the hero road's LEFT verge (R1W, the left foreground posts), broken at the
  // tractor, + a stretch on the right beyond the crates
  for (const [a, c, sd] of [[2, 12.5, -1], [20.5, 44, -1], [16, 40, 1]] as Array<[number, number, number]>) {
    const pts: Array<[number, number]> = [];
    for (let t = a; t <= c; t += 2.6) pts.push(S.roadPt(t, sd * (S.ROADS[0].hw + 2.4)));
    P.railFence(bMid, pts, { terrain: T, color: 0x8a6444, mat: "wood", h: 1.1, spacing: 2.6, rails: 2 });
  }
  void box; void textDecal;
}
