// BANANA TEMPLE — the pyramid (tiers + the projecting portal − the DUNGEON carved on one grid: the golden vault's nave +
// aisles + niche, the offering halls, the back passage, the galleries, the shrine under the head, doors on every level,
// windows, stairwells; relief panels, cornices + glyph friezes that stop at every opening), the arched portal with its
// carved medallion, the colossal gorilla head, the golden banana idol, four ENTERABLE carved towers (a door, a switchback
// stair to every storey and the roof, floors, windows, merlons; walkable rope bridges between the roofs), flush ivy, and
// the legendary vault (dark, fire-lit, seated guardians, strapped gold chest, coin hoards). Built in the temple's LOCAL
// frame (the module puts it in a Group at TEMPLE_C rotated 180°) from shared/pois/jungle-layout (TEMPLE) — the drawn walls
// are the exposed faces of the very cells the server colliders are merged from.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { TEMPLE, TEMPLE_C, mulberry, templeDress, towerPlan, towerSections, towerBridge, templeDungeon, templeRooms, templeOuterStairs, templeLedgeBlocks, templeHeadCollar, carve, stairSteps, type AABB, type Stair } from "../../../../../shared/pois/jungle-layout";
import { block, merge, staticMesh, rope, drum, place, boxUVs, tint, type Geo, bevelBox } from "../_kit/jungle-geo";
import { stoneMaterial, pbr, ropeTex, interiorPatch, heroStoneMaterial, softSpriteTex, type InteriorZone, type InteriorBox } from "../_kit/jungle-mat";
import { goldMaterial, glowShellMaterial, bananaHand, bananaMaterial } from "../_kit/jungle-gold";
import { flameCard, fireBowl, bannerTex, bannerGeo } from "../_kit/jungle-fx";
import { hero } from "../_kit/jungle-hero";
import { puffCloud } from "../_kit/jungle-water";
import { ropeBridge, newBuckets, woodMaterials, woodMeshes } from "../_kit/jungle-wood";
import { buildHangingVines, creeperTex, sharpenAlpha, type VineSpot } from "../_kit/jungle-vines";
import { carveFaces } from "../_kit/jungle-carve";
import { buildVaultCave } from "./vault-cave";

export interface TempleMats { stone: THREE.MeshStandardMaterial; frieze: THREE.MeshStandardMaterial; wood: THREE.MeshStandardMaterial; rope: THREE.MeshStandardMaterial; gold: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; floor: THREE.MeshStandardMaterial; zone: InteriorZone; vault: InteriorZone }
const T = TEMPLE, C = TEMPLE_C;
/** local → world (the 180° frame) */
const W = (x: number, y: number, z: number) => new THREE.Vector3(C.x - x, C.y + y, C.z - z);
/** puffCloud positions are WORLD space (its shader ignores the model matrix): convert from the local frame; the cloud can
 *  live in any group (visibility follows the group) */
function addPuff(root: THREE.Object3D, p: [number, number, number], o: Parameters<typeof puffCloud>[1]) { root.add(puffCloud(W(p[0], p[1], p[2]), o)); }
/** a local AABB → world min / max (the 180° frame swaps x and z), grown by `m` */
function worldBox(b: AABB, m = 0.12): { min: THREE.Vector3; max: THREE.Vector3 } {
  return { min: new THREE.Vector3(C.x - b[3] - m, C.y + b[1] - m, C.z - b[5] - m), max: new THREE.Vector3(C.x - b[0] + m, C.y + b[4] + m, C.z - b[2] + m) };
}

/** the vault's own AABB (world) — visibility switching (index.ts) */
export function vaultZone(): InteriorZone {
  const ch = T.chamber, fy = ch.y0;
  const a = W(ch.x0 - 0.8, fy - 0.6, ch.z0 - 0.8), b = W(ch.x1 + 0.8, ch.y1 + 2.5, T.door.z + 0.3);
  return { min: new THREE.Vector3(Math.min(a.x, b.x), a.y, Math.min(a.z, b.z)), max: new THREE.Vector3(Math.max(a.x, b.x), b.y, Math.max(a.z, b.z)),
    axis: new THREE.Vector3(0, 0, 1), door: C.z - T.door.z - 0.4, ramp: 2.4, dark: 0.025, lamps: [], lampColor: new THREE.Color(1, 0.8, 0.5) };   // warm fire, but yellow enough that the gold reads GOLD (0.6/0.24 turned it orange)
}
/** the whole temple interior as one lighting zone: every carved room (vault, halls, galleries, shrine, passages, tower
 *  storeys) is dark inside (sky + sun scaled down, ramped across the doorways), lit by warm fire "lamps" (torches, fire
 *  bowls, the shaft on the chest, the idol). No real lights. */
export function templeZone(): InteriorZone {
  const ch = T.chamber, az = T.altar.z, fy = ch.y0, R = templeRooms(), D = templeDungeon();
  const boxes: InteriorBox[] = [];
  const room = (b: AABB, dark: number) => boxes.push({ ...worldBox(b), dark });
  for (const k of ["nave", "niche", "aisleW", "aisleE"] as const) room(R[k], 0.025);
  for (const k of ["hallW", "hallE", "back", "galW", "galE", "shrine", "exit"] as const) room(R[k], 0.045);
  // doorways: light fades from the outer face inward (axis in WORLD space: local −x → world +x, local −z → world +z)
  { const b = worldBox(R.corridor); boxes.push({ ...b, dark: 0.025, axis: new THREE.Vector3(0, 0, 1), ramp: [C.z - T.portal.z0 + 0.3, C.z + 29 - 0.3] }); }
  for (const d of D.doors.slice(4)) { const side = d[0] < 0 ? -1 : 1, outer = side < 0 ? d[0] : d[3], inner = side < 0 ? d[3] : d[0];
    // local +x outward (side +1) → world −x outward → inward axis world +x; local −x outward → inward world −x
    const ax = new THREE.Vector3(side, 0, 0), wo = C.x - outer, wi = C.x - inner;
    boxes.push({ ...worldBox(d, 0.05), dark: 0.08, axis: ax, ramp: [wo * side, wi * side] }); }
  for (const d of D.stairs) void d;
  const lamps: Array<[number, number, number, number]> = [
    [-3.55, fy + 2.4, az + 13.4, 13.0], [3.55, fy + 2.4, az + 13.4, 13.0],                                // guardian fire bowls
    [-(ch.x1 - 0.6), fy + 3.4, az + 5, 3.4], [ch.x1 - 0.6, fy + 3.4, az + 5, 3.4], [-(ch.x1 - 0.6), fy + 3.4, az + 18, 2.6], [ch.x1 - 0.6, fy + 3.4, az + 18, 2.6], // aisle torches
    [0, fy + 4.4, az - 0.6, 14.0], [0, fy + 1.2, az + 2.6, 5.0], [0, fy + 0.8, az + 8.5, 3.0],               // chest in the shaft + its pool + the aisle
    [-2.7, fy + 2.9, az + 1.4, 6.0], [2.7, fy + 2.9, az + 1.4, 6.0],                                        // dais fire bowls
    [0, T.door.sill + 1.9, T.door.z - 1.5, 3.2],                                                            // the idol in the corridor
  ];
  // offering halls, back passage, galleries, shrine, exit: wall torches
  // the halls' braziers + the galleries' sconces + the shrine's braziers (dungeon.ts) are the light: warm pools,
  // dark between them
  for (const p of templeDress()) if (p.k === "brazier") lamps.push([p.x, p.y + p.h + 0.25, p.z, p.room === "temple-shrine" ? 5.5 : 5.0]); else if (p.k === "sconce") lamps.push([p.x - Math.sign(p.x) * 0.3, p.y + 0.5, p.z, 3.2]);
  for (const sx of [-1, 1]) lamps.push([sx * 8.9, 6.8, -43, 1.6], [sx * 11.4, 18.8, -37.5, 2.2]);
  lamps.push([0, 6.4, -55.2, 2.2], [0, 18.6, -51.2, 3.4], [0, 23.6, -50, 2.4]);
  // tower storeys: dim (windows), one torch per storey
  T.towers.forEach((t) => { const P = towerPlan(t); P.storeys.forEach((s) => { boxes.push({ ...worldBox([t.x - s.hi, s.y0, t.z - s.hi, t.x + s.hi, s.y1 - 0.35, t.z + s.hi]), dark: 0.3 }); lamps.push([t.x - s.hi + 0.25, s.y0 + 2.4, t.z + 0.9, 1.6]); }); });
  const L = lamps.map(([x, y, z, s]) => { const p = W(x, y, z); return new THREE.Vector4(p.x, p.y, p.z, s); });
  return { min: new THREE.Vector3(), max: new THREE.Vector3(), axis: new THREE.Vector3(0, 0, 1), door: 0, ramp: 1, dark: 0.05, boxes, lamps: L, lampColor: new THREE.Color(1.0, 0.58, 0.22).multiplyScalar(0.62), falloff: 0.75 };
}

export function templeMaterials(ctx: WorldCtx): TempleMats {
  const moss = pbr(ctx, "moss"), zone = templeZone();
  // cream-grey sandstone (~#b9b3a0 lit, cool blue-grey shade with a green bounce), moss on every up-facing
  // surface, the 2K block sheet + the tiling stone-grain detail normal near the camera. UV variants: the blocks carry
  // m/4.2 UVs → scale 0.8 = a 3.4 m tile (courses ≈ 0.68 m); the friezes carry explicit band UVs → scale 1
  const cool = { liftTop: "#aebfd8", liftBottom: "#9fb08c" };
  const stone = stoneMaterial(pbr(ctx, "temple-blocks"), { scale: 0.8, moss: 0.85, mossCover: 0.62, mossColor: "#7cbd3c", vertexColors: true, variation: 0.42, color: "#ffffff", lift: 0.2, ...cool, detail: 0.7 }, moss);
  stone.color.setRGB(1.06, 1.08, 1.1);
  const frieze = stoneMaterial(pbr(ctx, "glyph-frieze"), { scale: 1, moss: 0.35, mossCover: 0.4, mossColor: "#79b83a", vertexColors: true, variation: 0.25, lift: 0.2, ...cool, detail: 0.6 }, moss);
  frieze.color.setRGB(1.08, 1.1, 1.12);
  const wood = stoneMaterial(pbr(ctx, "planks"), { scale: 1.2, vertexColors: true, variation: 0.2 });
  const rope = new THREE.MeshStandardMaterial({ map: ropeTex(), roughness: 0.9, vertexColors: true });
  const gold = goldMaterial(ctx.renderer);
  const dark = new THREE.MeshStandardMaterial({ color: "#0a0906", roughness: 1 });
  const floor = stoneMaterial(pbr(ctx, "flagstone"), { scale: 6, moss: 0.15, vertexColors: true, variation: 0.25, color: "#efe4cc", detail: 0.6 }, moss);
  for (const m of [stone, frieze, floor, wood]) interiorPatch(m, zone, "temple");
  return { stone, frieze, wood, rope, gold, dark, floor, zone, vault: vaultZone() };
}

/** glyph frieze strip along a horizontal edge (explicit UVs: exactly one glyph row shows — faces or meander) */
export function frieze(x0: number, z0: number, x1: number, z1: number, y: number, h: number, depth: number, row: "faces" | "meander", outward: [number, number]): Geo {
  const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const g = bevelBox(len, h, depth, 0.03);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
  // bands of the 2K glyph sheet: faces 0.735–0.968, meander 0.515–0.683, bananas 0.315–0.465
  const v0 = row === "faces" ? 0.735 : 0.515, v1 = row === "faces" ? 0.968 : 0.683;
  for (let i = 0; i < uv.count; i++) {
    const nz = Math.abs(nor.getZ(i)), nx = Math.abs(nor.getX(i));
    if (nz > 0.7 || nx > 0.7) { const along = nz > 0.7 ? pos.getX(i) + len / 2 : pos.getZ(i) + depth / 2; uv.setXY(i, along / 3.6, v0 + (v1 - v0) * (pos.getY(i) / h + 0.5)); }
    else uv.setXY(i, pos.getX(i) / 3.6, 0.3 + pos.getZ(i) / 3.6);
  }
  place(g, (x0 + x1) / 2 + outward[0] * depth * 0.5, y, (z0 + z1) / 2 + outward[1] * depth * 0.5, yaw);
  tint(g, "#e8dcc4", 0.05);
  return g;
}
/** split a span [a, b] around the gaps [g0, g1] */
export function spans(a: number, b: number, gaps: Array<[number, number]>): Array<[number, number]> {
  let out: Array<[number, number]> = [[a, b]];
  for (const [g0, g1] of gaps) out = out.flatMap(([s, e]) => (g1 <= s || g0 >= e ? [[s, e]] : [[s, g0], [g1, e]].filter(([p, q]) => q - p > 0.6)) as Array<[number, number]>);
  return out;
}

/** cornice row of protruding blocks along an edge (with `ruin` gaps and jitter) — it OVERHANGS the face below (never on
 *  the walkable ledge: the ledge is exactly its collider) */
function cornice(rnd: () => number, x0: number, z0: number, x1: number, z1: number, y: number, outward: [number, number], ruin: number, size = 1.2, depth = 0.9, over = 0.4): Geo[] {
  const out: Geo[] = [], len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / size)), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const yaw = Math.atan2(-uz, ux);
  for (let i = 0; i < n; i++) {
    if (rnd() < ruin) continue;
    const t = (i + 0.5) / n, bx = x0 + ux * len * t + outward[0] * over, bz = z0 + uz * len * t + outward[1] * over;
    const jitter = (rnd() - 0.5) * 0.06, h = 0.5 + rnd() * 0.1;
    out.push(block(len / n * 0.96, h, depth, bx, y - h / 2 - 0.02 + jitter, bz, yaw + (rnd() - 0.5) * 0.04, { bevel: 0.07, uvScale: 4.2, tint: rnd() < 0.5 ? "#f0e8d8" : "#d9d2c2", var: 0.06 }));
  }
  return out;
}
/** a straight stair as bevelled blocks: exactly its collider steps (shared stairSteps) */
function stairGeo(s: Stair, tintHex = "#e6dfd0", bevel = 0.05): Geo[] {
  const rnd = mulberry(Math.round(s.x * 13 + s.z * 7 + s.y)), out: Geo[] = [];
  for (const b of stairSteps(s)) out.push(block(b[3] - b[0], b[4] - b[1], b[5] - b[2], (b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, 0, { bevel, uvScale: 4.2, tint: rnd() < 0.5 ? tintHex : "#d9d1bf", var: 0.05 }));
  return out;
}
const aabbGeo = (b: AABB, o: Parameters<typeof block>[7] = {}) => block(b[3] - b[0], b[4] - b[1], b[5] - b[2], (b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, 0, { bevel: 0.06, uvScale: 4.2, ...o });

const PORTAL = { hw: T.portal.hw, top: T.portal.top, z0: T.portal.z0, z1: T.portal.z1 };

export function buildPyramid(ctx: WorldCtx, mats: TempleMats, root: THREE.Group) {
  const rnd = mulberry(77), stone: Geo[] = [], friezes: Geo[] = [], inner: Geo[] = [];
  const cx = T.pyr.cx, cz = T.pyr.cz, D = templeDungeon();
  // the massing: the exposed faces of the carved cells (exterior = sunlit blocks, interior = the dungeon's walls, floors
  // and ceilings) — exactly the collider surfaces
  const F = carveFaces(carve(D.solids, D.voids), { skip: D.renderSkip, uvScale: 4.2, tintExt: "#fbf6ea", tintInt: "#e9dcc4" });
  if (F.exterior) stone.push(F.exterior);
  if (F.interior) inner.push(F.interior);
  const openings = [...D.doors, ...D.windows], outer = templeOuterStairs();
  /** openings (doors / windows) and stairs that touch the face x = xf (side faces) or z = zf (front / back) at height y0..y1 */
  const gapsX = (xf: number, y0: number, y1: number): Array<[number, number]> => [
    ...openings.filter((o) => o[0] <= xf + 0.05 && o[3] >= xf - 0.05 && o[1] < y1 && o[4] > y0).map((o) => [o[2] - 0.5, o[5] + 0.5] as [number, number]),
    ...outer.map((s) => stairSteps(s)).filter((st) => st.some((b) => Math.abs(b[0] - xf) < 0.05 || Math.abs(b[3] - xf) < 0.05) && st.some((b) => b[1] < y1 && b[4] > y0)).map((st) => [Math.min(...st.map((b) => b[2])) - 0.3, Math.max(...st.map((b) => b[5])) + 0.3] as [number, number])];
  const gapsZ = (zf: number, y0: number, y1: number): Array<[number, number]> => openings.filter((o) => o[2] <= zf + 0.05 && o[5] >= zf - 0.05 && o[1] < y1 && o[4] > y0).map((o) => [o[0] - 0.6, o[3] + 0.6] as [number, number]);
  const portalGap: [number, number] = [-PORTAL.hw - 0.3, PORTAL.hw + 0.3], stairGap: [number, number] = [-T.stair.width / 2 - 0.4, T.stair.width / 2 + 0.4];
  T.tiers.forEach((t, i) => {
    if (i >= 5) return;
    const y0 = t.y0, h = t.h, W2 = t.half * 2, x0 = cx - t.half, x1 = cx + t.half, z0 = cz - t.half, z1 = cz + t.half, yt = y0 + h;
    // cornice rows + friezes on all four faces — skipping the portal, the stair head, every door / window and the stairs
    const ruin = 0.04 + i * 0.03, fy = y0 + h * 0.5, fh = Math.min(0.95, h * 0.24), row = i % 2 ? "meander" : "faces";
    const frontGaps = [...(i === 0 ? [stairGap] : i <= 2 ? [portalGap] : []), ...gapsZ(z1, fy - fh / 2, fy + fh / 2)];
    const fGap = (xf: number) => gapsX(xf, fy - fh / 2 - 0.2, fy + fh / 2);
    for (const [a, b] of spans(x0, x1, i <= 2 && i > 0 ? [portalGap] : i === 0 ? [stairGap] : [])) stone.push(...cornice(rnd, a, z1, b, z1, yt, [0, 1], ruin));
    for (const [a, b] of spans(x0, x1, frontGaps)) friezes.push(frieze(a, z1, b, z1, fy, fh, 0.14, row, [0, 1]));
    stone.push(...cornice(rnd, x1, z1, x1, z0, yt, [1, 0], ruin), ...cornice(rnd, x1, z0, x0, z0, yt, [0, -1], ruin), ...cornice(rnd, x0, z0, x0, z1, yt, [-1, 0], ruin));
    for (const [a, b] of spans(z0, z1, fGap(x1))) friezes.push(frieze(x1, b, x1, a, fy, fh, 0.14, row, [1, 0]));
    for (const [a, b] of spans(z0, z1, fGap(x0))) friezes.push(frieze(x0, a, x0, b, fy, fh, 0.14, row, [-1, 0]));
    friezes.push(frieze(x1, z0, x0, z0, fy, fh, 0.14, row, [0, -1]));
    // corner quoins: a column of proud bevelled blocks on each vertical edge (the tier's corners read as cut stone)
    for (const [qx, qz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) for (let y = y0; y < yt - 0.3; y += 0.7) { const bh = Math.min(0.66, yt - y - 0.02); stone.push(block(0.9, bh, 0.9, qx + (qx < cx ? 0.3 : -0.3), y + bh / 2, qz + (qz < cz ? 0.3 : -0.3), 0, { bevel: 0.08, uvScale: 4.2, tint: rnd() < 0.5 ? "#f2eadb" : "#ddd4c0", var: 0.06 })); }
    // relief: carved glyph panels + shallow pilasters between them on the front face (a busy façade)
    if (i >= 1 && i <= 4) {
      const nP = Math.floor(W2 / 4.2), win = gapsZ(z1, y0, yt);
      for (let k = 0; k < nP; k++) {
        const px = x0 + (k + 0.5) * W2 / nP; if (Math.abs(px - cx) < PORTAL.hw + 1.4 && i <= 2) continue;
        const pp = px + W2 / nP / 2, near = (x: number, m: number) => win.some(([a, b]) => x > a - m && x < b + m);
        if (rnd() < 0.25 || near(px, 1.1)) continue;
        const ph = h * (0.36 + rnd() * 0.12), py = y0 + h * 0.22 + ph / 2;
        const g = block(2.1, ph, 0.22, px, py, z1 + 0.1, 0, { bevel: 0.05, uvScale: 1, tint: "#e6dcc6" }); boxUVs(g, 2.2); friezes.push(g);
        if (!near(pp, 0.5) && Math.abs(pp - x1) > 0.8) stone.push(block(0.8, h * 0.92, 0.5, pp, y0 + h * 0.46, z1 + 0.0, 0, { bevel: 0.08, uvScale: 4.2, tint: rnd() < 0.5 ? "#f2eadb" : "#e0d7c4" }));
      }
    }
  });
  // tumbled blocks on the ledges (collide: templeLedgeBlocks)
  for (const b of templeLedgeBlocks()) stone.push(aabbGeo(b, { bevel: 0.08, tint: rnd() < 0.5 ? "#d8d1c0" : "#cfc7b2", var: 0.06 }));
  // grand stair (the façade) + the exterior climbing stairs on the E / W faces + every interior stair
  for (let i = 0; i < T.stair.steps; i++) { const h = T.stair.rise * (i + 1); stone.push(block(T.stair.width, h, T.stair.tread + 0.03, cx, h / 2, T.stair.z0 - i * T.stair.tread - T.stair.tread / 2, 0, { bevel: 0.05, uvScale: 4.2, tint: rnd() < 0.5 ? "#e6dfd0" : "#d9d1bf", var: 0.05 })); }
  for (const sx of [-1, 1]) { S(1.5, 1.6, 1.5, sx * (T.stair.width / 2 + 0.6), 4 + 0.8, T.stair.z0 - T.stair.steps * T.stair.tread + 0.4, { tint: "#efe6d4" }); const g = block(1.2, 0.9, 0.12, sx * (T.stair.width / 2 + 0.6), 4.8, T.stair.z0 - T.stair.steps * T.stair.tread + 1.17, 0, { bevel: 0.03, uvScale: 1 }); boxUVs(g, 1.2); friezes.push(g); }
  for (const s of outer) stone.push(...stairGeo(s));
  for (const s of D.stairs) inner.push(...stairGeo(s, "#ddd2bb", 0.04));
  // door + window surrounds on the outer face: a lintel block over each opening + jamb strips (≤ 0.24 m proud)
  const faceHalf = (y: number) => (T.tiers.find((t) => y >= t.y0 - 0.01 && y < t.y0 + t.h) ?? T.tiers[1]).half;
  for (const o of [...D.doors.slice(4), ...D.windows]) {
    const sideX = Math.abs(o[3] - o[0]) > Math.abs(o[5] - o[2]) + 0.5, half = faceHalf(o[1]);
    if (sideX) { const sg = o[0] < 0 ? -1 : 1, xf = sg * (half + 0.1), zc = (o[2] + o[5]) / 2, ow = o[5] - o[2];
      stone.push(block(0.24, 0.5, ow + 0.9, xf, o[4] + 0.25, zc, 0, { bevel: 0.05, uvScale: 4.2, tint: "#efe5d0" }));
      for (const sz of [-1, 1]) stone.push(block(0.2, o[4] - o[1], 0.3, xf, (o[1] + o[4]) / 2, zc + sz * (ow / 2 + 0.15), 0, { bevel: 0.04, uvScale: 4.2, tint: "#e2d8c2" })); }
    else { const zf = cz + half + 0.1, xc = (o[0] + o[3]) / 2, ow = o[3] - o[0];
      stone.push(block(ow + 0.9, 0.5, 0.24, xc, o[4] + 0.25, zf, 0, { bevel: 0.05, uvScale: 4.2, tint: "#efe5d0" }));
      stone.push(block(ow + 0.5, 0.18, 0.3, xc, o[1] - 0.09, zf + 0.03, 0, { bevel: 0.04, uvScale: 4.2, tint: "#d9cfb8" })); }
  }
  root.add(staticMesh(merge(stone), mats.stone, "temple-stone")!, staticMesh(merge(friezes), mats.frieze, "temple-frieze")!, staticMesh(merge(inner), mats.stone, "temple-interior")!);
  function S(w: number, h: number, d: number, x: number, y: number, z: number, o: Parameters<typeof block>[7] = {}) { stone.push(block(w, h, d, x, y, z, 0, { bevel: 0.22, uvScale: 4.2, tint: "#fbf6ea", var: 0.04, ...o })); }
  void ctx;
}

/** the door portal: a projecting block mass with an ARCHED opening (its flat top is a balcony one step below the tier-2
 *  ledge), stepped jambs, voussoir ring, a carved medallion, a cornice parapet, moss + creepers over it */
export function buildPortal(ctx: WorldCtx, mats: TempleMats, root: THREE.Group) {
  const rnd = mulberry(303), stone: Geo[] = [], friezes: Geo[] = [];
  const dw = T.door.w, dh = T.door.h, sill = T.door.sill, zf = PORTAL.z0, depth = PORTAL.z0 - PORTAL.z1, hw = PORTAL.hw;
  // the mass: a shape with an arched hole, extruded back into the tier
  const sh = new THREE.Shape(); sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, PORTAL.top - sill); sh.lineTo(-hw, PORTAL.top - sill); sh.lineTo(-hw, 0);
  const r = dw / 2, spring = dh - r, hole = new THREE.Path(); hole.moveTo(-r, 0); hole.lineTo(-r, spring); hole.absarc(0, spring, r, Math.PI, 0, true); hole.lineTo(r, 0); hole.lineTo(-r, 0);
  sh.holes.push(hole);
  const mass = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 18 });
  mass.translate(0, sill, zf - depth); boxUVs(mass, 4.2); tint(mass, "#f3ebdb"); stone.push(mass);
  // stepped jambs: two proud orders around the arch (their boxes collide: templePortalJambs)
  for (const [inset, proud, tn] of [[0.0, 0.35, "#efe6d4"], [0.75, 0.62, "#e3d9c5"]] as Array<[number, number, string]>) {
    const ro = r + 0.55 + inset, n = 11;
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const hgt = spring / 4; S(0.7, hgt * 0.96, proud * 0.5 + 0.25, sx * (r + 0.35 + inset), sill + hgt * (k + 0.5), zf + (proud * 0.5 + 0.25) / 2, tn); }
    for (let k = 0; k < n; k++) { // voussoirs
      const a = Math.PI * (k + 0.5) / n, bx = Math.cos(a) * ro, by = sill + spring + Math.sin(a) * ro;
      const g = block(0.72, 0.62, 0.5 + proud * 0.3, bx, by, zf + proud * 0.5, 0, { bevel: 0.06, uvScale: 4.2, tint: rnd() < 0.5 ? tn : "#ddd3be", rz: a - Math.PI / 2 }); stone.push(g);
    }
  }
  // keystone
  S(1.0, 1.1, 0.9, 0, sill + spring + r + 0.95, zf + 0.5, "#f2e9d6");
  // the medallion: carved disc + ring + two scroll blocks, below the head's sight line
  const my = sill + dh + 1.85;
  { const disc = new THREE.CylinderGeometry(1.55, 1.55, 0.4, 32); disc.rotateX(Math.PI / 2); place(disc, 0, my, zf + 0.2); boxUVs(disc, 3.2); tint(disc, "#efe6d2"); friezes.push(disc);
    const ring = place(new THREE.TorusGeometry(1.62, 0.2, 8, 36), 0, my, zf + 0.37); boxUVs(ring, 4.2); tint(ring, "#e6dfd0"); stone.push(ring);
    for (const sx of [-1, 1]) { const g = block(1.2, 1.3, 0.35, sx * 2.35, my - 0.25, zf + 0.17, 0, { bevel: 0.06, uvScale: 1 }); boxUVs(g, 1.6); friezes.push(g); } }
  // cornice parapet on the balcony's front edge (collides)
  for (let k = 0; k < 8; k++) S(hw * 2 / 8 * 0.96, 0.6, 1.0, -hw + (k + 0.5) * hw * 2 / 8, PORTAL.top + 0.3, zf + 0.3, rnd() < 0.5 ? "#f0e8d8" : "#d9d2c2");
  function S(w: number, h: number, d: number, x: number, y: number, z: number, tn: string) { stone.push(block(w, h, d, x, y, z, 0, { bevel: 0.08, uvScale: 4.2, tint: tn, var: 0.05 })); }
  root.add(staticMesh(merge(stone), mats.stone, "temple-portal")!, staticMesh(merge(friezes), mats.frieze, "temple-portal-frieze")!);
  // creepers cascading over the portal edges (flush to the face)
  const vines: VineSpot[] = [];
  for (const sx of [-1, 1]) vines.push({ x: sx * (hw - 0.8), y: PORTAL.top + 0.4, z: zf + 0.05, w: 2.2, len: 6.5 + rnd() * 3, ry: 0 });
  vines.push({ x: -r - 1.1, y: sill + dh + 0.6, z: zf + 0.6, w: 1.4, len: 4.5, ry: 0 }, { x: r + 1.2, y: sill + dh + 0.3, z: zf + 0.6, w: 1.4, len: 5.2, ry: 0 });
  buildHangingVines(ctx, root, vines, 1, { oneSided: true, push: 0.08, out: 0.12 });
  // the corridor is dark (interior zone) — a black veil a few metres in kills any residual sky light
  // (opaque from outside so the lit vault never shows through the doorway; fades out as the camera walks in)
  const vm = new THREE.MeshBasicMaterial({ color: "#020201", transparent: true, opacity: 1, depthWrite: true, side: THREE.DoubleSide });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(T.corridor.hw * 2 + 1.2, 9), vm);
  veil.position.set(0, sill + 4.5, T.chamber.z1 + 0.4); veil.name = "door-dark"; veil.renderOrder = 1; veil.userData.castShadow = false; root.add(veil);
  const wz = C.z - (T.chamber.z1 + 0.4), wx = C.x;
  veil.onBeforeRender = (_r, _s, cam) => { const d = wz - cam.position.z, lateral = Math.abs(cam.position.x - wx); const o = Math.min(1, Math.max(0, (d - 2) / 7)) * (lateral < 12 ? 1 : 1); vm.opacity = o; vm.depthWrite = o > 0.98; veil.visible = o > 0.01; };
}

/** four ENTERABLE carved towers: shell − storeys (exposed faces of the carved cells), corner pilasters, recessed glyph
 *  panels, cornices, window + door surrounds, the switchback stair inside (flights, landings), roof merlons + a broken
 *  planted crown, walkable rope bridges between the roofs, tasselled rope lines */
export function buildTowers(ctx: WorldCtx, mats: TempleMats, root: THREE.Group): THREE.Vector3[] {
  const rnd = mulberry(31), stone: Geo[] = [], friezes: Geo[] = [], ropes: Geo[] = [], inner: Geo[] = [];
  const tops: THREE.Vector3[] = [];
  for (const tw of T.towers) {
    const x = tw.x, z = tw.z, P = towerPlan(tw);
    const F = carveFaces(carve(P.solids, P.voids), { uvScale: 4.2, tintExt: "#ece5d4", tintInt: "#ddd1ba" });
    if (F.exterior) stone.push(F.exterior);
    if (F.interior) inner.push(F.interior);
    const opens = [P.door, ...P.windows];
    P.sections.forEach(([y, yt, w], si) => {
      const h = yt - y, last = si === P.sections.length - 1, x0 = x - w / 2, x1 = x + w / 2, z0 = z - w / 2, z1 = z + w / 2;
      // corner pilasters (0.12 m proud)
      for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) stone.push(block(0.9, h, 0.9, px + (px < x ? 0.33 : -0.33), y + h / 2, pz + (pz < z ? 0.33 : -0.33), 0, { bevel: 0.1, uvScale: 4.2, tint: rnd() < 0.5 ? "#efe7d6" : "#dcd4c0", var: 0.05 }));
      // a recessed-look glyph panel on each face, clear of the openings
      for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const cxp = x + nx * (w / 2 + 0.06), czp = z + nz * (w / 2 + 0.06), yaw = nx ? Math.PI / 2 : 0, pw = w - 2.2, py0 = y + h * 0.12, py1 = y + h * 0.46;
        const blocked = opens.some((o) => o[1] < py1 && o[4] > py0 && (nx ? Math.abs((nx > 0 ? o[3] : o[0]) - (x + nx * w / 2)) < 0.8 : Math.abs((nz > 0 ? o[5] : o[2]) - (z + nz * w / 2)) < 0.8));
        if (!blocked) { const g = block(pw, py1 - py0, 0.12, cxp, (py0 + py1) / 2, czp, yaw, { bevel: 0.03, uvScale: 1 }); boxUVs(g, 2.4); friezes.push(g); }
      }
      const ruin = last ? 0.25 + tw.ruin * 0.4 : 0.04;
      stone.push(...cornice(rnd, x0, z1, x1, z1, yt, [0, 1], ruin, 1.0, 0.6, 0.25), ...cornice(rnd, x1, z1, x1, z0, yt, [1, 0], ruin, 1.0, 0.6, 0.25), ...cornice(rnd, x1, z0, x0, z0, yt, [0, -1], ruin, 1.0, 0.6, 0.25), ...cornice(rnd, x0, z0, x0, z1, yt, [-1, 0], ruin, 1.0, 0.6, 0.25));
    });
    // opening surrounds on the outer face: a lintel + a sill (≤ 0.2 m proud)
    for (const o of opens) {
      const ocx = (o[0] + o[3]) / 2 - x, ocz = (o[2] + o[5]) / 2 - z, zFace = Math.abs(ocz) > Math.abs(ocx);
      const half = (P.sections.find(([a0, a1]) => o[1] >= a0 - 0.01 && o[1] < a1) ?? P.sections[0])[2] / 2;
      if (zFace) { const zf = z + Math.sign(ocz) * (half + 0.1), xc = (o[0] + o[3]) / 2, ow = o[3] - o[0];
        stone.push(block(ow + 0.6, 0.36, 0.2, xc, o[4] + 0.18, zf, 0, { bevel: 0.04, uvScale: 4.2, tint: "#efe5d0" }));
        if (o[1] > 1.2) stone.push(block(ow + 0.3, 0.14, 0.24, xc, o[1] - 0.07, zf, 0, { bevel: 0.03, uvScale: 4.2, tint: "#d9cfb8" })); }
      else { const xf = x + Math.sign(ocx) * (half + 0.1), zc = (o[2] + o[5]) / 2, ow = o[5] - o[2];
        stone.push(block(0.2, 0.36, ow + 0.6, xf, o[4] + 0.18, zc, 0, { bevel: 0.04, uvScale: 4.2, tint: "#efe5d0" }));
        stone.push(block(0.24, 0.14, ow + 0.3, xf, o[1] - 0.07, zc, 0, { bevel: 0.03, uvScale: 4.2, tint: "#d9cfb8" })); }
    }
    // the switchback stair inside, landings, the entry steps, the roof merlons
    for (const f of P.flights) inner.push(...stairGeo(f, "#ddd2bb", 0.04));
    for (const b of P.landings) inner.push(aabbGeo(b, { bevel: 0.04, tint: "#d8cdb6" }));
    stone.push(...stairGeo(P.entry, "#e2d9c6"));
    for (const b of P.merlons) stone.push(aabbGeo(b, { bevel: 0.1, tint: rnd() < 0.5 ? "#e6dece" : "#d2c9b4", var: 0.07 }));
    // tumbled crown stones lying on the roof edge's cornice line (visual, small, never on the walk)
    tops.push(new THREE.Vector3(x, tw.h, z));
  }
  // walkable rope bridges between tower roofs (wood kit, local frame)
  const B = newBuckets();
  for (let k = 0; k < T.bridges.length; k++) {
    const { A, B: Bt, sag, a0, a1, ux, uz } = towerBridge(k);
    const a = new THREE.Vector3(A.x + ux * a0, A.h, A.z + uz * a0), b = new THREE.Vector3(A.x + ux * a1, Bt.h, A.z + uz * a1);
    ropeBridge(a, b, { sag, width: 1.7, seed: 40 + k, missing: 0.04 }, B);
  }
  const wm = woodMaterials(pbr(ctx, "planks"));
  for (const m of woodMeshes(B, wm, "temple-bridge")) root.add(m);
  // decorative rope lines with hanging tassels above the bridges
  for (const [ia, ib, up, sag] of T.ropes) {
    const A = tops[ia].clone().add(new THREE.Vector3(0, up, 0)), Bp = tops[ib].clone().add(new THREE.Vector3(0, up * 0.8, 0));
    ropes.push(rope(A, Bp, sag, 0.07));
    for (let i = 1; i < 9; i++) { const t = i / 9, p = new THREE.Vector3().lerpVectors(A, Bp, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)); ropes.push(rope(p, p.clone().add(new THREE.Vector3(0.05, -0.8 - rnd() * 0.9, 0.05)), 0.02, 0.045, 4)); }
    for (const P of [A, Bp]) ropes.push(rope(P, P.clone().add(new THREE.Vector3(0, -up - 0.3, 0)), 0.05, 0.06, 6));
  }
  // tower torches (one per storey, the zone's lamps) — a stone sconce + a flame
  const sconces: Geo[] = [];
  for (const tw of T.towers) for (const s of towerPlan(tw).storeys) { const lx = tw.x - s.hi + 0.12, ly = s.y0 + 2.2, lz = tw.z + 0.9;
    sconces.push(block(0.24, 0.3, 0.4, lx, ly, lz, 0, { bevel: 0.04, uvScale: 4.2, tint: "#cfc7b2" }));
    root.add(flameCard(new THREE.Vector3(lx + 0.14, ly + 0.15, lz), 0.26, 0.46, tw.x + s.y0, 1.3)); }
  inner.push(...sconces);
  root.add(staticMesh(merge(stone), mats.stone, "temple-towers")!, staticMesh(merge(friezes), mats.frieze, "temple-tower-friezes")!, staticMesh(merge(ropes), mats.rope, "temple-ropes", false)!, staticMesh(merge(inner), mats.stone, "temple-tower-interior")!);
  return tops;
}

export async function buildHead(ctx: WorldCtx, mats: TempleMats, root: THREE.Group) {
  const H = T.head;
  // the processed mesh's native front is +X → yaw −π/2 puts the face on +z local (the façade)
  // carved sandstone: crisp ~2 m blocks (world triplanar, moss on the crest) × the mesh's baked shading (eyes, brow, cavities)
  const hm = new Map<THREE.Texture | null, THREE.MeshStandardMaterial>();
  // ONE mesh at every distance: the 40k-triangle head is cheap, and a 9k LOD swapped in at 140 m — the engine fades a
  // switch as a scale fade, so the 27 m landmark would visibly shrink and regrow on every approach / fly-in
  const h = await hero(ctx, "gorilla-head", T.pyr.cx, H.y, T.pyr.cz, { height: H.height, yaw: -Math.PI / 2, name: "temple-head", material: (bm) => { let m = hm.get(bm.map); if (!m) {
    // CARVED sandstone (never a world-projected brick grid): plain weathered stone at 5 m, large-scale tone drift, the
    // baked shading as cavity AO (brow, eye sockets, nostrils, lips), moss on the crown / brow tops, 8 deliberate joints on
    // the back + sides of the head only
    m = heroStoneMaterial(pbr(ctx, "boulder"), bm.map, { scale: 5, bakeMix: 0.95, bakeGain: 2.7, moss: 0.9, mossCover: 0.55, mossColor: "#7cbd3c", variation: 0.32, lift: 0.24, liftTop: "#aebfd8", liftBottom: "#a4b08e", detail: 0.6,
      seams: [0.2, 0.34, 0.47, 0.58, 0.69, 0.79, 0.88, 0.95], seamFront: -0.05 }, pbr(ctx, "moss"));
    m.color.setRGB(1.12, 1.08, 0.98); hm.set(bm.map, m); } return m; } });
  root.add(h);
  // a collar of big blocks round the base: the head sits IN the top tier (shoulders), not on it (shared list = colliders)
  const rnd = mulberry(1718), blocks: Geo[] = [];
  for (const [w, hh, d, x, y, z, yaw] of templeHeadCollar()) blocks.push(block(w, hh, d, x, y, z, yaw, { bevel: 0.14, uvScale: 4.2, tint: rnd() < 0.5 ? "#f2eadb" : "#dcd3bf", var: 0.05 }));
  root.add(staticMesh(merge(blocks), mats.stone, "temple-head-collar")!);
}

/** the golden banana idol just inside the door: a fat crescent banana (tips up) on a gold pedestal on a carved stone block */
export function buildIdol(ctx: WorldCtx, mats: TempleMats, root: THREE.Group) {
  const x = T.pyr.cx, y = T.door.sill, z = T.door.z - 1.5;
  const stone: Geo[] = [block(1.5, 1.05, 1.3, x, y + 0.525, z, 0, { bevel: 0.07, uvScale: 4.2, tint: "#e8dfcc" })];
  const fr = block(1.3, 0.42, 0.06, x, y + 0.55, z + 0.66, 0, { bevel: 0.02, uvScale: 1 }); boxUVs(fr, 1.2);
  const gold: Geo[] = [drum(0.62, 0.16, x, y + 1.05, z, 24), drum(0.46, 0.22, x, y + 1.21, z, 24), drum(0.3, 0.2, x, y + 1.43, z, 20), place(new THREE.TorusGeometry(0.5, 0.06, 8, 28), x, y + 1.24, z, 0, 1, Math.PI / 2)];
  const ban = crescentBanana(2.3, 0.42, x, y + 1.6, z, 1.45);
  gold.push(ban.clone());
  root.add(staticMesh(merge(stone), mats.stone, "temple-idol-plinth")!, staticMesh(fr, mats.frieze, "temple-idol-glyph")!);
  // saturated gold (own warm contrasty env) — the glow is a separate additive fresnel shell + a soft halo, never emissive
  root.add(staticMesh(merge(gold), goldMaterial(ctx.renderer, { roughness: 0.2, env: 1.25 }), "temple-idol")!);
  { const sh = ban; const p = sh.attributes.position as THREE.BufferAttribute, n = sh.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * 0.07, p.getY(i) + n.getY(i) * 0.07, p.getZ(i) + n.getZ(i) * 0.07);
    const shell = new THREE.Mesh(sh, glowShellMaterial("#ffae2a", 1.5)); shell.name = "temple-idol-glow"; shell.renderOrder = 5; shell.userData.castShadow = false; root.add(shell); }
  addPuff(root, [x, y + 2.0, z + 0.25], { count: 4, color: "#ffb540", size: [3.2, 4.4], opacity: 0.22, rise: 0, drift: 0.04, spread: [0.25, 0.25, 0.1], life: 6, additive: true, power: 2.4 });
  addPuff(root, [x, y + 1.9, z + 0.3], { count: 14, color: "#ffe6a0", size: [0.03, 0.07], opacity: 0.9, rise: 0.15, drift: 0.3, spread: [1.0, 1.2, 0.6], life: 8, additive: true, power: 3 });
}
/** a crescent banana standing on its belly, tips up: an arc tube thick in the middle, tapering to a stem + a tip */
export function crescentBanana(span: number, r: number, x: number, y: number, z: number, arc = 1.25): Geo {
  const R = span / 2 / Math.sin(arc), pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) { const a = -arc + 2 * arc * i / 16; pts.push(new THREE.Vector3(Math.sin(a) * R, R - Math.cos(a) * R, 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 40, r, 14, false);
  const pos = g.attributes.position as THREE.BufferAttribute, P = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { // taper + five subtle ridges (banana facets)
    const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)); let best = 0, bd = 1e9;
    for (let k = 0; k <= 40; k++) { curve.getPoint(k / 40, P); const d = P.distanceToSquared(p); if (d < bd) { bd = d; best = k / 40; } }
    curve.getPoint(best, P); const off = p.clone().sub(P), ang = Math.atan2(off.z, off.y);
    const k = (0.28 + 0.72 * Math.pow(Math.sin(Math.PI * best), 0.55)) * (1 + 0.045 * Math.cos(ang * 5));
    p.copy(P).addScaledVector(off, k); pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals(); g.translate(x, y, z); tint(g, "#ffffff");
  return g;
}

/** the legendary vault: flagstone floor with a carved medallion, stepped dais + gorilla-face altar, the strapped golden
 *  banana chest under a shaft of light, seated guardians holding fire bowls, totem pillars with red banners, wall torches,
 *  gold coin hoards + stacks, bananas, creepers + ferns. Lit only by its own fire/shaft (interior zone lamps). */
export async function buildVault(ctx: WorldCtx, mats: TempleMats, parent: THREE.Group): Promise<THREE.Group> {
  const root = new THREE.Group(); root.name = "vault"; parent.add(root);
  const rnd = mulberry(909), stone: Geo[] = [], goldG: Geo[] = [], friezes: Geo[] = [], banG: Geo[] = [];
  const cx = T.pyr.cx, fy = T.chamber.y0, az = T.altar.z, ch = T.chamber;
  // floor + a flush concentric medallion of carved slabs
  const floor = place(new THREE.PlaneGeometry(ch.x1 - ch.x0 + 1.2, T.door.z - ch.z0 + 1.0, 8, 16), cx, fy + 0.03, (ch.z0 + T.door.z) / 2, 0, 1, -Math.PI / 2);
  boxUVs(floor, 1); tint(floor, "#e7dcc4");
  root.add(staticMesh(floor, mats.floor, "vault-floor", false)!);
  // dais: 3 steps + altar block with a carved face band
  for (let i = 0; i < 3; i++) stone.push(block(9 - i * 0.9, 0.4, 7 - i * 0.9, cx, fy + 0.2 + i * 0.4, az + 0.5, 0, { bevel: 0.05, uvScale: 4.2, tint: "#d8cfb8" }));
  stone.push(block(3.4, 1.1, 2.6, cx, fy + 1.2 + 0.55, az - 1, 0, { bevel: 0.08, uvScale: 4.2, tint: "#ddd4bc" }));
  friezes.push(frieze(cx - 1.7, az + 0.3, cx + 1.7, az + 0.3, fy + 1.75, 0.85, 0.12, "faces", [0, 1]));
  // the chest (a big ornate gold chest): body + a proud lid slab, framed front panels, three straps, corner caps,
  // two lock plates, a round medallion, rivets, feet — and a FAT crescent banana lying on top as the lid handle
  const chy = fy + 2.3, gz = az - 1, CW = 2.9, CH = 1.35, CD = 1.8;
  goldG.push(block(CW, CH * 0.72, CD, cx, chy + CH * 0.36, gz, 0, { bevel: 0.06, uvScale: 1 }));
  goldG.push(block(CW + 0.12, CH * 0.3, CD + 0.12, cx, chy + CH * 0.85, gz, 0, { bevel: 0.07, uvScale: 1, tint: "#fff4dc" }));
  for (const sx of [-1, 0, 1]) goldG.push(block(0.2, CH + 0.08, CD + 0.1, cx + sx * CW * 0.34, chy + CH / 2, gz, 0, { bevel: 0.035, uvScale: 1, tint: "#d09418" }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) goldG.push(block(0.26, CH + 0.12, 0.26, cx + sx * (CW / 2), chy + CH / 2, gz + sz * (CD / 2), 0, { bevel: 0.05, uvScale: 1, tint: "#e0a622" }));
  for (const sx of [-1, 1]) { goldG.push(block(0.62, 0.42, 0.06, cx + sx * CW * 0.17, chy + CH * 0.42, gz + CD / 2 + 0.03, 0, { bevel: 0.03, uvScale: 1, tint: "#c68a14" })); goldG.push(block(0.2, 0.26, 0.1, cx + sx * CW * 0.17, chy + CH * 0.38, gz + CD / 2 + 0.07, 0, { bevel: 0.03, uvScale: 1, tint: "#a87412" }));
    goldG.push(block(0.72, 0.5, 0.05, cx + sx * CW * 0.34 + sx * 0.5, chy + CH * 0.36, gz + CD / 2 + 0.02, 0, { bevel: 0.03, uvScale: 1, tint: "#f0b830" })); }
  goldG.push(place(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 24), cx, chy + CH * 0.5, gz + CD / 2 + 0.05, 0, 1, Math.PI / 2), place(new THREE.TorusGeometry(0.34, 0.05, 8, 24), cx, chy + CH * 0.5, gz + CD / 2 + 0.09, 0, 1, 0), place(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 16), cx, chy + CH * 0.5, gz + CD / 2 + 0.12, 0, 1, Math.PI / 2));
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) goldG.push(place(new THREE.SphereGeometry(0.035, 6, 4), cx + sx * (CW / 2 - 0.06), chy + 0.12 + i * 0.14, gz + CD / 2 + 0.1, 0, 1, 0));
  for (const [fx, fz] of [[-1.25, -0.72], [1.25, -0.72], [-1.25, 0.72], [1.25, 0.72]]) goldG.push(drum(0.16, 0.18, cx + fx, chy - 0.08, gz + fz, 10));
  { const bn = crescentBanana(3.7, 0.62, 0, 0, 0, 1.3); bn.translate(cx, chy + CH + 0.02, gz); goldG.push(bn); }
  // coin HEAPS: a merged gold dome per heap (so it reads as a solid pile) + instanced coins covering its top and spilling
  // round its foot; plus stacks and strays along the aisle
  const coinG = roundCoin(0.13, 0.04, 24), coinM: THREE.Matrix4[] = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), heaps: Geo[] = [];
  const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
  const heap = (mx: number, mz: number, R: number, Hh: number, n: number, baseY = fy) => {
    const hAt = (d: number) => Hh * Math.pow(Math.max(0, 1 - (d / R) ** 2), 0.85);
    const dome = new THREE.CircleGeometry(R, 28, 0, Math.PI * 2).rotateX(-Math.PI / 2), dp = dome.attributes.position as THREE.BufferAttribute;
    // the dome's rim is lobed (k(a)): the coins sit on the SAME surface (none float over / sink into it)
    const lobe = (a: number) => 1 + 0.08 * Math.sin(a * 3 + mx);
    for (let i = 0; i < dp.count; i++) { const x = dp.getX(i), z = dp.getZ(i), d = Math.hypot(x, z), a = Math.atan2(z, x); dp.setXYZ(i, mx + x * lobe(a), baseY + hAt(d) - 0.03, mz + z); }
    dome.computeVertexNormals(); heaps.push(dome);
    for (let i = 0; i < n; i++) { const a = rnd() * 6.28, dr = Math.pow(rnd(), 0.7) * R * 1.05, d = dr * lobe(a), y = dr <= R ? hAt(dr) - 0.03 + 0.02 : 0.02;
      const slope = Hh * 2 * d / (R * R) * 0.9; nrm.set(Math.cos(a) * slope, 1, Math.sin(a) * slope).normalize();
      Q.setFromUnitVectors(up, nrm); Q.multiply(new THREE.Quaternion().setFromEuler(E.set((rnd() - 0.5) * 0.9, rnd() * 6.28, (rnd() - 0.5) * 0.9)));
      V.set(mx + Math.cos(a) * d, baseY + y, mz + Math.sin(a) * d); coinM.push(M.compose(V, Q, S1).clone()); }
  };
  for (const [hx, hz, hr, hh, hb] of T.heaps) heap(hx, hz, hr, hh, Math.round(hr * hr * 105), fy + hb);
  for (let k = 0; k < 18; k++) { const sx = (rnd() < 0.5 ? -1 : 1) * (2.0 + rnd() * 2.6), sz = az + 2 + rnd() * 17, n = 3 + Math.floor(rnd() * 12); for (let i = 0; i < n; i++) { E.set(0, rnd() * 6.28, 0); Q.setFromEuler(E); V.set(cx + sx + (rnd() - 0.5) * 0.02, fy + 0.021 + i * 0.043, sz); coinM.push(M.compose(V, Q, S1).clone()); } }
  // strays lie FLAT on the floor (a tilted disc on a flat floor floats on its rim or sinks)
  for (let i = 0; i < 110; i++) { E.set(0, rnd() * 6.28, 0); Q.setFromEuler(E); V.set(cx + (rnd() - 0.5) * 9, fy + 0.021, az + 2 + Math.pow(rnd(), 0.7) * 18); coinM.push(M.compose(V, Q, S1).clone()); }
  // gold indoors: its own warm env (kept), never the sun (the vault is under 20 m of stone)
  // the tone curve washes bright gold to peach: a deeper base + less env keeps it saturated metallic GOLD with crisp highlights
  const goldM = interiorPatch(goldMaterial(ctx.renderer, { roughness: 0.18, env: 0.75, color: "#f8c62a", unique: true }), mats.zone, "vault", { keepIndirect: true }), coinMat = interiorPatch(goldMaterial(ctx.renderer, { roughness: 0.15, env: 0.8, color: "#f7c41e", unique: true }), mats.zone, "vault", { keepIndirect: true });
  const coins = new THREE.InstancedMesh(coinG, coinMat, coinM.length); coinM.forEach((m, i) => coins.setMatrixAt(i, m)); coins.instanceMatrix.needsUpdate = true; coins.computeBoundingSphere();
  coins.castShadow = false; coins.receiveShadow = true; coins.name = "vault-coins"; coins.userData.castShadow = false; root.add(coins);
  root.add(staticMesh(merge(heaps), interiorPatch(goldMaterial(ctx.renderer, { roughness: 0.26, env: 0.65, color: "#ecb81c", unique: true }), mats.zone, "vault", { keepIndirect: true }), "vault-heaps", false)!);
  // bananas: hands on the heaps and a few loose ones on the floor
  for (let i = 0; i < 9; i++) banG.push(bananaHand(3 + (i % 3), 0.3, cx + (rnd() - 0.5) * 9, fy + 0.12, az + 3 + rnd() * 16, rnd() * 6.28, 0.3 + rnd() * 0.4, 400 + i));
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) banG.push(bananaHand(4, 0.32, cx + sx * (3.7 + rnd() * 0.5), fy + 0.62 + rnd() * 0.1, az + 16 + rnd() * 0.6, rnd() * 6.28, 0.35, 450 + i + sx * 5));
  // wall torches: stone sconces + a gold cup + a real flame card
  for (const sx of [-1, 1]) for (const tz of [az + 5, az + 18]) { const tx = cx + sx * (ch.x1 - 0.45); stone.push(block(0.5, 0.35, 0.6, tx, fy + 3.0, tz, 0, { bevel: 0.05, uvScale: 4.2, tint: "#cfc7b2" })); goldG.push(drum(0.16, 0.22, tx - sx * 0.05, fy + 3.2, tz, 10));
    root.add(flameCard(new THREE.Vector3(tx - sx * 0.05, fy + 3.4, tz), 0.38, 0.66, tz + sx, 0.6)); }
  root.add(staticMesh(merge(stone), mats.stone, "vault-stone")!, staticMesh(merge(friezes), mats.frieze, "vault-frieze")!);
  root.add(staticMesh(merge(goldG), goldM, "vault-gold")!);
  const banMat = bananaMaterial().clone(); interiorPatch(banMat, mats.zone, "vault");
  root.add(staticMesh(merge(banG), banMat, "vault-bananas")!);
  // guardians (seated, holding fire bowls) + totem pillars with banners — carved warm sandstone (no block grid), interior-lit
  let guardMat: THREE.MeshStandardMaterial | undefined;
  const carved = (bm: THREE.MeshStandardMaterial) => (guardMat ??= (() => { const m = heroStoneMaterial(pbr(ctx, "boulder"), bm.map, { scale: 1.8, bakeMix: 0.95, bakeGain: 2.6, moss: 0.3, mossCover: 0.3, mossColor: "#6fae2f", variation: 0.25, lift: 0.05, detail: 0.7 }, pbr(ctx, "moss")); m.color.setRGB(0.98, 0.8, 0.6); return interiorPatch(m, mats.zone, "vault"); })());
  const bowls: Geo[] = [];
  // the carved heroes (guardians, totems, the seated gorilla) from the shared list their colliders come from
  for (const [id, hx, dz, H, yaw, b] of T.vaultHeroes) root.add(await hero(ctx, id, cx + hx, fy + b, az + dz, { height: H, yaw, name: id === "totem" ? "vault-totem" : "vault-guardian", material: carved }));
  for (const sx of [-1, 1]) {
    // the fire bowl the guardian holds out over the aisle: carved bowl, glowing ember bed, a big flame, sparks
    const bx = cx + sx * 3.55, bz = az + 13.4, by = fy + 1.62;
    const fb = fireBowl(new THREE.Vector3(bx, by, bz), 0.5); bowls.push(fb.bowl); root.add(fb.embers);
    root.add(flameCard(new THREE.Vector3(bx, by - 0.02, bz), 0.7, 1.05, sx * 3.1, 0.6), flameCard(new THREE.Vector3(bx + 0.12, by - 0.02, bz - 0.1), 0.45, 0.7, sx * 5.7, 0.55));
    addPuff(root, [bx, by + 0.9, bz], { count: 14, color: "#ffb040", size: [0.03, 0.07], opacity: 1, rise: 2.2, drift: 0.25, spread: [0.25, 0.3, 0.25], life: 1.6, additive: true, power: 2.5 });
    addPuff(root, [bx, by + 0.4, bz], { count: 4, color: "#ff8a2a", size: [1.6, 2.4], opacity: 0.16, rise: 0, drift: 0.02, spread: [0.1, 0.1, 0.1], life: 3, additive: true, power: 2.2 });
    // folded banners (painted emblem + fringe) on gold rods, high on the side walls
    const { cloth, rod } = bannerGeo(1.3, 3.1), bx2 = cx + sx * (T.nave + 0.02), bz2 = az + 9.8, byT = ch.y1 - 0.35;
    const bmat = new THREE.MeshStandardMaterial({ map: bannerTex(), alphaTest: 0.5, roughness: 0.92, side: THREE.DoubleSide }); interiorPatch(bmat, mats.zone, "vault");
    const cm = new THREE.Mesh(cloth, bmat); cm.position.set(bx2 - sx * 0.12, byT, bz2); cm.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2; cm.name = "vault-banner"; root.add(cm);
    const rd = rod.clone(); rd.rotateY(Math.PI / 2); rd.translate(bx2 - sx * 0.14, byT + 0.02, bz2); root.add(staticMesh(rd, goldM, "vault-banner-rod", false)!);
  }
  // the dais: two carved fire-bowl pedestals flanking the chest + the seated gorilla behind it
  for (const sx of [-1, 1]) { const px = cx + sx * 2.7, pz = az + 1.4;
    bowls.push(block(0.8, 1.2, 0.8, px, fy + 1.2 + 0.6, pz, 0, { bevel: 0.06, uvScale: 4.2, tint: "#d6ccb4" }), block(1.0, 0.25, 1.0, px, fy + 1.2 + 1.3, pz, 0, { bevel: 0.05, uvScale: 4.2, tint: "#e2d8c0" }));
    const fb = fireBowl(new THREE.Vector3(px, fy + 2.95, pz), 0.42); bowls.push(fb.bowl); root.add(fb.embers);
    root.add(flameCard(new THREE.Vector3(px, fy + 2.93, pz), 0.55, 0.85, sx * 7.3, 0.6)); }
  root.add(staticMesh(merge(bowls), mats.stone, "vault-bowls")!);
  // light shaft from the ceiling hole onto the chest: a soft additive cone + a hot pool on the chest + dust motes
  const hole = new THREE.Vector3(cx + 0.6, ch.y1 + 0.2, gz + 0.8), foot = new THREE.Vector3(cx, chy + 0.6, gz);
  root.add(lightShaft(hole, foot, 1.1, 2.3));
  addPuff(root, [cx, fy + 4.8, gz + 0.8], { count: 110, color: "#ffe2a0", size: [0.035, 0.09], opacity: 0.95, rise: 0.1, drift: 0.22, spread: [1.6, 3.4, 1.6], life: 10, additive: true, power: 3 });
  { // the ceiling opening: a warm-lit shaft mouth with hanging roots, never a flat white disc
    const cg = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: softSpriteTex(0.1, 1.8), color: new THREE.Color(1.3, 1.05, 0.7), toneMapped: false, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); cg.position.set(hole.x, ch.y1 - 0.05, hole.z); cg.userData.castShadow = false; cg.renderOrder = 6; root.add(cg);
    const wall: Geo[] = [], wf: Geo[] = [];
    for (const sx of [-1, 1]) {
      // the nave arcade: square pillars carrying the low aisle ceiling (collide: TEMPLE.vaultPillars), carved capitals
      for (const pz of T.vaultPillars) { wall.push(block(0.9, T.aisleTop - fy - 0.5, 0.9, cx + sx * T.nave, (fy + T.aisleTop - 0.5) / 2, pz, 0, { bevel: 0.08, uvScale: 4.2, tint: "#e2d6bf" }), block(1.1, 0.5, 1.1, cx + sx * T.nave, T.aisleTop - 0.25, pz, 0, { bevel: 0.1, uvScale: 4.2, tint: "#d8ccb3" }));
        const g = block(0.7, 2.2, 0.08, cx + sx * (T.nave - 0.49), fy + 2.6, pz, Math.PI / 2, { bevel: 0.02, uvScale: 1 }); boxUVs(g, 1.4); wf.push(g); }
      // a carved band along the clerestory (the nave wall above the aisles) + the lintel line over the arcade
      wf.push(frieze(cx + sx * T.nave, ch.z0 + 0.2, cx + sx * T.nave, T.chamber.z1, T.aisleTop + 1.2, 0.7, 0.1, "meander", [-sx, 0]));
      // carved gorilla-face band at eye height + a meander dado low on the walls (carved walls, not bare brick)
      wf.push(frieze(cx + sx * ch.x1, az - 2, cx + sx * ch.x1, T.chamber.z1, fy + 3.1, 1.15, 0.14, "faces", [-sx, 0]));
      wf.push(frieze(cx + sx * ch.x1, az - 2, cx + sx * ch.x1, T.chamber.z1, fy + 0.55, 0.6, 0.12, "meander", [-sx, 0]));
    }
    root.add(staticMesh(merge(wall), mats.stone, "vault-pilasters")!, staticMesh(merge(wf), mats.frieze, "vault-wall-glyphs")!); }
  const holeG = block(2.2, 0.3, 2.2, hole.x, hole.y + 0.16, hole.z, 0, { bevel: 0.02, uvScale: 1, tint: "#111008" });
  root.add(staticMesh(holeG, mats.dark, "vault-hole", false)!);
  // creepers from the ceiling edges + along the walls
  const vines: VineSpot[] = [];
  // the hall is draped: creeper curtains down both walls, root/vine tangles hanging from the ceiling (clear of the
  // aisle's sight line to the chest), a heavy curtain framing the shaft
  for (let k = 0; k < 16; k++) { const sx = k % 2 ? -1 : 1; vines.push({ x: cx + sx * (ch.x1 - 0.05), y: T.aisleTop - 0.1, z: az - 3 + rnd() * 21, w: 1.2 + rnd() * 1.2, len: 1.8 + rnd() * 2.6, ry: sx < 0 ? Math.PI / 2 : -Math.PI / 2 }); }
  for (let k = 0; k < 14; k++) { const sx = k % 2 ? -1 : 1; vines.push({ x: cx + sx * (T.nave + 0.02), y: ch.y1 - 0.05, z: az - 2 + rnd() * 19, w: 1.4 + rnd() * 1.2, len: 2.2 + rnd() * 2.6, ry: sx < 0 ? -Math.PI / 2 : Math.PI / 2 }); }
  for (let k = 0; k < 8; k++) { const sx = k % 2 ? -1 : 1; vines.push({ x: cx + sx * (T.nave + 0.35), y: T.aisleTop - 0.05, z: az - 2 + rnd() * 19, w: 1.0 + rnd(), len: 1.2 + rnd() * 1.8, ry: rnd() * 6.28 }); }
  vines.push({ x: cx, y: T.niche.top - 0.05, z: az - 3.4, w: 6, len: 2.6, ry: 0 }, { x: cx - 1.9, y: ch.y1, z: az - 0.2, w: 1.6, len: 2.6, ry: 0.4 }, { x: cx + 2.2, y: ch.y1, z: az + 0.6, w: 1.5, len: 3.0, ry: -0.5 });
  buildHangingVines(ctx, root, vines, 1, { oneSided: true, push: 0.06, out: 0.15, color: "#b8d88e" });
  root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (o.name === "jungle-vines" && m) interiorPatch(m, mats.zone, "vault"); });
  // the cave: rock skin over the upper walls + broken ceiling, roots, fallen slabs (vault-cave.ts)
  await ctx.yield();
  buildVaultCave(ctx, mats, root);
  return root;
}

/** a round gold coin (24 segments): flat faces with a raised rim + a bevel ring (catches the light), lying in the xz plane */
function roundCoin(r: number, t: number, seg: number): THREE.BufferGeometry {
  const h = t / 2, pts = [[0, h * 0.72], [r * 0.8, h * 0.72], [r * 0.9, h], [r, h * 0.25], [r, -h * 0.6], [0, -h]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, seg); g.computeVertexNormals(); return g;
}
/** a soft volumetric light shaft: a cone whose opacity fades toward its silhouette (view-angle falloff) and toward both
 *  ends, additive, + a hot pool of light at the foot */
export function lightShaft(top: THREE.Vector3, foot: THREE.Vector3, r0: number, r1: number): THREE.Group {
  const g = new THREE.Group(), len = top.distanceTo(foot);
  const geo = new THREE.CylinderGeometry(r0, r1, len, 32, 10, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color("#ffd690") }, uLen: { value: len } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vT; void main(){ vT = position.y / ${len.toFixed(3)} + 0.5; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying float vT; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.8); float e = smoothstep(0.0, 0.2, vT) * (1.0 - smoothstep(0.88, 1.0, vT)); gl_FragColor = vec4(uCol * f * e * 0.3, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.position.copy(top).add(foot).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize()); m.renderOrder = 6; m.userData.castShadow = false; m.name = "vault-shaft";
  const inner = m.clone(); inner.scale.set(0.5, 1, 0.5);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(r1 * 1.15, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffd690", transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  spot.position.copy(foot).add(new THREE.Vector3(0, 0.02, 0)); spot.renderOrder = 6;
  g.add(m, inner, spot); g.name = "vault-shaft";
  return g;
}

/** ivy: leaf cards lying FLAT on the tier faces just under each cornice (anchored — nothing floats), plus creeper
 *  curtains hanging over the tier edges */
export function buildIvy(ctx: WorldCtx, root: THREE.Group, leafTex: THREE.Texture) {
  const rnd = mulberry(555), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const pts: THREE.Matrix4[] = [], cols: THREE.Color[] = [];
  const greens = [new THREE.Color("#c8e79c"), new THREE.Color("#afd585"), new THREE.Color("#9cc676")];
  // ivy grows in CLUMPS under the cornices: a few clump centres per face, each a spray of round leaf cards thinning out
  // as they creep down (never a uniform band / rectangle)
  const face = (x0: number, x1: number, zf: number, ytop: number, drop: number, clumps: number, facing: number) => {
    for (let c = 0; c < clumps; c++) {
      const cxp = x0 + rnd() * (x1 - x0), gi = Math.floor(rnd() * 3), big = rnd() < 0.35, nC = big ? 18 + Math.floor(rnd() * 18) : 6 + Math.floor(rnd() * 9), spread = big ? 1.8 + rnd() * 2.2 : 0.8 + rnd() * 1.6, depth = drop * (0.3 + rnd() * 0.7);
      for (let i = 0; i < nC; i++) {
        const t = Math.pow(rnd(), 1.6), x = cxp + (rnd() - 0.5) * spread * 2 * (1 - t * 0.6), yy = ytop - 0.05 - t * depth;
        if (Math.abs(x) < PORTAL.hw + 0.5 && ytop < PORTAL.top + 1 && facing === 0) continue;
        if (x < x0 || x > x1) continue;
        e.set(0, facing, rnd() * 6.28); q.setFromEuler(e); const sc = (0.6 + rnd() * 0.8) * (1 - t * 0.4); s.set(sc, sc, sc); p.set(x, yy, zf + rnd() * 0.02);
        pts.push(m.compose(p, q, s).clone()); cols.push(greens[rnd() < 0.8 ? gi : (gi + 1) % 3].clone().multiplyScalar(0.9 + rnd() * 0.2));
      }
    }
  };
  T.tiers.slice(0, 5).forEach((t, i) => {
    const cx = T.pyr.cx, cz = T.pyr.cz, y = t.y0 + t.h, x0 = cx - t.half + 1, x1 = cx + t.half - 1, z1 = cz + t.half + 0.03;
    face(x0, x1, z1, y - 0.1, t.h * 0.95, 6 + i * 2, 0);
  });
  for (const tw of T.towers) for (const k of [0.45, 0.72, 0.95]) face(tw.x - tw.w * 0.44, tw.x + tw.w * 0.44, tw.z + tw.w * 0.45 + 0.05, tw.h * k, tw.h * 0.28, 3, 0);
  const geo = new THREE.PlaneGeometry(1.1, 1.1);
  const mat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, color: "#ffffff", polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  sharpenAlpha(mat);
  const inst = new THREE.InstancedMesh(geo, mat, pts.length);
  pts.forEach((mm, i) => { inst.setMatrixAt(i, mm); inst.setColorAt(i, cols[i]); }); inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true; inst.computeBoundingSphere();
  inst.castShadow = false; inst.receiveShadow = true; inst.name = "temple-ivy"; inst.userData.castShadow = false;
  root.add(inst);
  // creeper curtains over the tier edges (front + sides) and down the towers
  const vines: VineSpot[] = [];
  T.tiers.slice(0, 5).forEach((t, i) => {
    const cx = T.pyr.cx, cz = T.pyr.cz, y = t.y0 + t.h + 0.35, z1 = cz + t.half + 0.3;
    for (let k = 0; k < 6 + i * 2; k++) { const x = cx - t.half + 2 + rnd() * (t.half * 2 - 4); if (Math.abs(x) < PORTAL.hw + 0.6 && i <= 2) continue; if (i === 0 && Math.abs(x) < T.stair.width / 2 + 1) continue; vines.push({ x, y, z: z1, w: 2.2 + rnd() * 3.2, len: t.h * (0.5 + rnd() * 0.8), ry: 0 }); }
    for (const sx of [-1, 1]) if (rnd() < 0.7) vines.push({ x: cx + sx * (t.half + 0.3), y, z: cz + (rnd() - 0.2) * t.half, w: 1.8 + rnd() * 1.6, len: t.h * (0.35 + rnd() * 0.55), ry: sx * Math.PI / 2 });
  });
  // tower creepers drape over a section's set-back ledge, flush on the face below it, clear of the centred
  // door / windows (not mid-wall, 0.15–0.4 m proud of the narrower upper sections: sheets hanging from nothing)
  for (const tw of T.towers) { const secs = towerSections(tw);
    for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) { if (rnd() < 0.25) continue;
      const [y0, y1, w] = secs[Math.floor(rnd() * 3)], hw = w / 2 + 0.02, off = (rnd() < 0.5 ? -1 : 1) * (1.15 + rnd() * 0.3);   // the kit draws a 1.4–4 m card: kept on the face
      vines.push({ x: tw.x + nx * hw + (nz ? off : 0), y: y1 - 0.2, z: tw.z + nz * hw + (nx ? off : 0), w: 1.4, len: (y1 - y0) * (0.35 + rnd() * 0.3), ry: nx ? nx * Math.PI / 2 : nz < 0 ? Math.PI : 0 }); } }
  buildHangingVines(ctx, root, vines, 1, { oneSided: true, push: 0.05, out: 0.15 });
  void creeperTex;
}
