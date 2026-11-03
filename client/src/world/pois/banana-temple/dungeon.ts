// banana-temple — the DUNGEON's architecture + dressing for the offering halls, galleries, shrine and the tower
// storeys (not single-texture brick boxes). Every room gets a worn flagstone floor (its own material), a carved
// meander dado, bays of carved pilasters with capitals and dark timber lintels, braziers with animated fire (their light
// is the interior zone's lamps — temple.ts templeZone), rubble and fallen column drums as cover, carved guardian idols on
// plinths, the shrine's colonnade + stepped altar dais, and root / creeper curtains from the ceilings. The solid pieces
// come from the SAME list their colliders do (shared templeDress()), the kit's furniture keeps clear of them.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { TEMPLE, mulberry, templeDress, templeRooms, towerPlan, type AABB, type DressPiece } from "../../../../../shared/pois/jungle-layout";
import { block, merge, staticMesh, place, boxUVs, tint, rock, type Geo } from "../_kit/jungle-geo";
import { heroStoneMaterial, pbr, interiorPatch } from "../_kit/jungle-mat";
import { flameCard, fireBowl } from "../_kit/jungle-fx";
import { hero } from "../_kit/jungle-hero";
import { buildHangingVines, type VineSpot } from "../_kit/jungle-vines";
import { frieze, spans, lightShaft, type TempleMats } from "./temple";

const T = TEMPLE;
const TONES = ["#e4dac4", "#d8cdb5", "#cdc2a8", "#dfd3ba"];

/** a fallen fluted column drum lying on its side: an octagonal prism with a FLAT top facet (its collider top) */
function drumGeo(p: DressPiece): Geo {
  const long = Math.max(p.w, p.d), alongX = p.w >= p.d, R = p.h / 2 / Math.cos(Math.PI / 8);
  const g = new THREE.CylinderGeometry(R, R, long, 8, 1);
  g.rotateY(Math.PI / 8);                                   // a facet on top once laid down
  if (alongX) g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
  const ng = g.toNonIndexed(); g.dispose();
  ng.rotateY(p.yaw); ng.translate(p.x, p.y + p.h / 2, p.z); ng.computeVertexNormals(); boxUVs(ng, 4.2); tint(ng, "#d6cbb2", 0.05);
  return ng;
}

export async function buildDungeon(ctx: WorldCtx, mats: TempleMats, root: THREE.Group): Promise<THREE.Group> {
  const g = new THREE.Group(); g.name = "temple-dungeon"; root.add(g);
  const rnd = mulberry(8080), stone: Geo[] = [], glyph: Geo[] = [], wood: Geo[] = [], floor: Geo[] = [], rubble: Geo[] = [], roots: Geo[] = [];
  const tone = () => TONES[Math.floor(rnd() * TONES.length)];
  const D = templeDress(), R = templeRooms();
  const flames: Array<[THREE.Vector3, number, number]> = [];

  for (const p of D) {
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    if (p.k === "pilaster") {
      // base, shaft, a carved glyph panel on the room face, a projecting capital under the ceiling
      const face = Math.sign(p.x) * (Math.abs(p.x) > 12 ? -1 : 1);   // outward wall pilasters face −sign(x), inner ones +sign(x)
      stone.push(block(p.w + 0.06, 0.35, p.d + 0.12, p.x + face * 0.03, p.y + 0.175, p.z, 0, { bevel: 0.05, uvScale: 4.2, tint: "#cfc4aa" }));
      stone.push(block(p.w, p.h - 0.8, p.d, p.x, p.y + 0.35 + (p.h - 0.8) / 2, p.z, 0, { bevel: 0.07, uvScale: 4.2, tint: tone(), var: 0.05 }));
      stone.push(block(p.w + 0.2, 0.45, p.d + 0.24, p.x + face * 0.1, p.y + p.h - 0.225, p.z, 0, { bevel: 0.08, uvScale: 4.2, tint: "#e2d6bc" }));
      const gp = block(0.05, Math.min(2.2, p.h - 1.8), p.d * 0.7, p.x + face * (p.w / 2 + 0.02), p.y + 0.35 + (p.h - 0.8) * 0.5, p.z, 0, { bevel: 0.015, uvScale: 1 }); boxUVs(gp, 1.4); glyph.push(gp);
    } else if (p.k === "beam") {
      // a dark timber lintel with an adzed look (two stacked members), stone corbels at the walls
      wood.push(block(p.w, p.h * 0.62, p.d, p.x, p.y + p.h * 0.69, p.z, 0, { bevel: 0.05, uvScale: 1.2, tint: "#7a5536", var: 0.08 }));
      wood.push(block(p.w - 0.3, p.h * 0.4, p.d * 0.8, p.x, p.y + p.h * 0.2, p.z, 0, { bevel: 0.04, uvScale: 1.2, tint: "#6a4a2f", var: 0.08 }));
    } else if (p.k === "brazier") {
      // carved pedestal (tapered: base slab, shaft, cap) + a stone fire bowl with embers and an animated flame
      // (the collider reaches the bowl's rim: p.h = rim height)
      const ped = p.h - 0.3;
      stone.push(block(p.w, 0.22, p.d, p.x, p.y + 0.11, p.z, p.yaw, { bevel: 0.05, uvScale: 4.2, tint: "#cbbfa4" }));
      stone.push(block(p.w * 0.66, ped - 0.42, p.d * 0.66, p.x, p.y + 0.22 + (ped - 0.42) / 2, p.z, p.yaw + 0.785, { bevel: 0.05, uvScale: 4.2, tint: tone() }));
      stone.push(block(p.w, 0.2, p.d, p.x, p.y + ped - 0.1, p.z, p.yaw, { bevel: 0.05, uvScale: 4.2, tint: "#ddd0b5" }));
      const fb = fireBowl(new THREE.Vector3(p.x, p.y + p.h - 0.08, p.z), 0.36); stone.push(fb.bowl); g.add(fb.embers);
      flames.push([new THREE.Vector3(p.x, p.y + p.h - 0.1, p.z), 0.46, 0.8]);
    } else if (p.k === "sconce") {
      const out = -Math.sign(p.x);
      stone.push(block(0.3, 0.42, 0.5, p.x, p.y, p.z, 0, { bevel: 0.05, uvScale: 4.2, tint: "#cfc4aa" }));
      const fb = fireBowl(new THREE.Vector3(p.x + out * 0.18, p.y + 0.3, p.z), 0.2); stone.push(fb.bowl); g.add(fb.embers);
      flames.push([new THREE.Vector3(p.x + out * 0.18, p.y + 0.28, p.z), 0.28, 0.5]);
    } else if (p.k === "rubble") {
      // a collapsed heap: one big block filling the collider (its top IS the collider top), a slab leaning on it, chips
      stone.push(block(p.w, p.h, p.d, p.x, p.y + p.h / 2, p.z, p.yaw + (rnd() - 0.5) * 0.04, { bevel: 0.12, uvScale: 4.2, tint: "#bdb198", var: 0.08 }));
      stone.push(block(p.w * 0.75, p.h * 0.45, p.d * 0.6, p.x + (rnd() - 0.5) * 0.2, p.y + p.h + 0.0 - p.h * 0.225 + 0.01, p.z + (rnd() - 0.5) * 0.2, p.yaw + 0.4, { bevel: 0.1, uvScale: 4.2, tint: tone(), rz: 0.04 }));
      for (let q = 0; q < 6; q++) { const a = rnd() * 6.28, d = Math.max(p.w, p.d) * 0.55 + rnd() * 0.45, sz = 0.12 + rnd() * 0.16; rubble.push(rock(sz * 1.3, sz * 0.7, sz, { seed: p.seed * 7 + q, angular: true, tint: "#b0a48a" }).applyMatrix4(new THREE.Matrix4().makeRotationY(rnd() * 6).setPosition(p.x + Math.cos(a) * d, p.y + sz * 0.3, p.z + Math.sin(a) * d))); }
    } else if (p.k === "step") {
      stone.push(block(p.w, p.h, p.d, p.x, p.y + p.h / 2, p.z, p.yaw + (rnd() - 0.5) * 0.05, { bevel: 0.09, uvScale: 4.2, tint: "#c3b79d", var: 0.08 }));
    } else if (p.k === "drum") {
      stone.push(drumGeo(p));
      for (let q = 0; q < 3; q++) { const a = rnd() * 6.28, sz = 0.1 + rnd() * 0.12; rubble.push(rock(sz * 1.2, sz * 0.7, sz, { seed: p.seed * 11 + q, angular: true, tint: "#b0a48a" }).applyMatrix4(new THREE.Matrix4().makeTranslation(p.x + Math.cos(a) * 1.0, p.y + sz * 0.3, p.z + Math.sin(a) * 1.0))); }
    } else if (p.k === "plinth" || p.k === "dais" || p.k === "altar") {
      const t = p.k === "altar" ? "#e6dcc4" : "#d3c8ae";
      stone.push(block(p.w, p.h, p.d, p.x, p.y + p.h / 2, p.z, p.yaw, { bevel: p.k === "dais" ? 0.05 : 0.07, uvScale: 4.2, tint: t, var: 0.05 }));
      if (p.k !== "dais") { const gp = block(p.w * 0.8, p.h * 0.62, 0.05, p.x + s * (p.d / 2 + 0.02) * Math.sign(p.z + 44), p.y + p.h / 2, p.z - c * (p.d / 2 + 0.02) * Math.sign(p.z + 44), p.yaw, { bevel: 0.015, uvScale: 1 }); boxUVs(gp, 1.2); glyph.push(gp); }
      if (p.k === "dais") for (const sx of [-1, 1]) stone.push(block(0.5, p.h + 0.25, 0.5, p.x + sx * (p.w / 2 - 0.25), p.y + (p.h + 0.25) / 2, p.z + p.d / 2 - 0.25, 0, { bevel: 0.05, uvScale: 4.2, tint: "#e2d6bc" }));
    } else if (p.k === "column") {
      stone.push(block(p.w + 0.24, 0.3, p.d + 0.24, p.x, p.y + 0.15, p.z, 0, { bevel: 0.05, uvScale: 4.2, tint: "#cfc4aa" }));
      stone.push(block(p.w, p.h - 0.85, p.d, p.x, p.y + 0.3 + (p.h - 0.85) / 2, p.z, 0.0, { bevel: 0.12, uvScale: 4.2, tint: tone(), var: 0.05 }));
      stone.push(block(p.w + 0.36, 0.55, p.d + 0.36, p.x, p.y + p.h - 0.275, p.z, 0, { bevel: 0.1, uvScale: 4.2, tint: "#e2d6bc" }));
      for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const gp = block(fz ? p.w * 0.66 : 0.05, 1.9, fx ? p.d * 0.66 : 0.05, p.x + fx * (p.w / 2 + 0.02), p.y + 1.9, p.z + fz * (p.d / 2 + 0.02), 0, { bevel: 0.015, uvScale: 1 }); boxUVs(gp, 1.3); glyph.push(gp); }
    }
  }
  await ctx.yield();
  // the guardian idols (carved warm sandstone, interior-lit)
  let guardMat: THREE.MeshStandardMaterial | undefined;
  const carved = (bm: THREE.MeshStandardMaterial) => (guardMat ??= (() => { const m = heroStoneMaterial(pbr(ctx, "boulder"), bm.map, { scale: 1.8, bakeMix: 0.95, bakeGain: 2.6, moss: 0.45, mossCover: 0.35, mossColor: "#6fae2f", variation: 0.25, lift: 0.05, detail: 0.7 }, pbr(ctx, "moss")); m.color.setRGB(0.95, 0.82, 0.64); return interiorPatch(m, mats.zone, "dng"); })());
  for (const p of D) if (p.k === "statue") g.add(await hero(ctx, "guardian", p.x, p.y, p.z, { height: p.h, yaw: p.yaw, name: "dungeon-idol", material: carved }));
  await ctx.yield();

  // flagstone floors (their own worn material, not the wall blocks) + a carved meander dado round every hall / gallery /
  // the shrine, skipping the doors, the stairs and the wells
  const rooms: Array<[string, AABB, AABB[]]> = [
    ["hall-w", R.hallW, [[-11.4, 0, -54, -9, 0, -45.7]]], ["hall-e", R.hallE, [[9, 0, -54, 11.4, 0, -45.7]]], ["back", R.back, []],
    ["gal-w", R.galW, [[-11.4, 0, -54, -9, 0, -45.7], [-12, 0, -43.5, -9.6, 0, -35.2]]], ["gal-e", R.galE, [[9, 0, -54, 11.4, 0, -45.7], [9.6, 0, -43.5, 12, 0, -35.2]]],
    ["shrine", R.shrine, [[-1.4, 0, -45.3, 1.4, 0, -37], [-12, 0, -43.5, -9.6, 0, -35.2], [9.6, 0, -43.5, 12, 0, -35.2]]],
  ];
  for (const [, b, holes] of rooms) {
    for (let x = b[0]; x < b[3] - 0.01; x += 1.2) for (let z = b[2]; z < b[5] - 0.01; z += 1.2) {
      const x1 = Math.min(b[3], x + 1.2), z1 = Math.min(b[5], z + 1.2), cx = (x + x1) / 2, cz = (z + z1) / 2;
      if (holes.some((h) => cx > h[0] - 0.05 && cx < h[3] + 0.05 && cz > h[2] - 0.05 && cz < h[5] + 0.05)) continue;
      const q = place(new THREE.PlaneGeometry(x1 - x, z1 - z), cx, b[1] + 0.012, cz, 0, 1, -Math.PI / 2); boxUVs(q, 1); tint(q, rnd() < 0.15 ? "#c9bea6" : "#ffffff", 0.06); floor.push(q);
    }
    // dado: along every wall of the room, gaps at the doors / openings (the dungeon doors are the shared door voids)
    const doors = (axis: "x" | "z", v: number): Array<[number, number]> => [...doorList(), ...holes].filter((d) => (axis === "x" ? d[0] - 0.1 <= v && d[3] + 0.1 >= v : d[2] - 0.1 <= v && d[5] + 0.1 >= v) && (d[1] === 0 || (d[1] < b[1] + 1 && d[4] > b[1]))).map((d) => (axis === "x" ? [d[2] - 0.2, d[5] + 0.2] : [d[0] - 0.2, d[3] + 0.2]) as [number, number]);
    for (const xw of [b[0], b[3]]) for (const [a0, a1] of spans(b[2], b[5], doors("x", xw))) glyph.push(frieze(xw, a0, xw, a1, b[1] + 0.42, 0.62, 0.06, "meander", [xw === b[0] ? 1 : -1, 0]));
    for (const zw of [b[2], b[5]]) for (const [a0, a1] of spans(b[0], b[3], doors("z", zw))) glyph.push(frieze(a0, zw, a1, zw, b[1] + 0.42, 0.62, 0.06, "meander", [0, zw === b[2] ? 1 : -1]));
  }
  await ctx.yield();
  // roots + creepers: tangles hanging from the ceilings along the walls (soft: you walk through roots), thicker in the shrine
  const vines: VineSpot[] = [];
  const hang = (b: AABB, n: number) => { for (let k = 0; k < n; k++) { const side = Math.floor(rnd() * 2), alongZ = b[5] - b[2] > b[3] - b[0];
    if (alongZ) { const x = side ? b[3] - 0.05 : b[0] + 0.05; vines.push({ x, y: b[4] - 0.05, z: b[2] + 1 + rnd() * (b[5] - b[2] - 2), w: 1.0 + rnd() * 1.4, len: 1.4 + rnd() * 2.2, ry: side ? -Math.PI / 2 : Math.PI / 2 }); }
    else { const z = side ? b[5] - 0.05 : b[2] + 0.05; vines.push({ x: b[0] + 1 + rnd() * (b[3] - b[0] - 2), y: b[4] - 0.05, z, w: 1.0 + rnd() * 1.4, len: 1.4 + rnd() * 2.2, ry: side ? Math.PI : 0 }); } } };
  hang(R.hallW, 9); hang(R.hallE, 9); hang(R.galW, 6); hang(R.galE, 6); hang(R.shrine, 14); hang(R.back, 3);
  for (const tw of T.towers) for (const st of towerPlan(tw).storeys) if (rnd() < 0.7) vines.push({ x: tw.x - st.hi + 0.05, y: st.y1 - 0.4, z: tw.z + (rnd() - 0.5) * st.hi, w: 1.2, len: 1.2 + rnd() * 1.4, ry: Math.PI / 2 });
  buildHangingVines(ctx, g, vines, 1, { oneSided: true, push: 0.05, out: 0.12, color: "#a9c77e" });
  // gnarled roots breaking through the ceilings (tubes, tapering, hanging 1.2–2.6 m) — named as vines: soft for parity
  const rootTangle = (x: number, y: number, z: number, n: number) => roots.push(...rootTangles(rnd, x, y, z, n, 1.2, 2.6));
  for (const [x, z, n] of [[-12.8, -37, 4], [-14.2, -52, 5], [12.6, -44, 4], [14, -56, 3], [-5, -38.5, 6], [6.5, -47, 6], [-8.5, -42, 5], [2.5, -35.5, 4], [-10, -50.2, 4], [11, -39, 3]] as Array<[number, number, number]>) {
    const room = [R.hallW, R.hallE, R.galW, R.galE, R.shrine].find((b) => x > b[0] && x < b[3] && z > b[2] && z < b[5]); if (room) rootTangle(x, room[4], z, n);
  }

  await ctx.yield();
  const wm = mats.wood, rm = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.92 }); interiorPatch(rm, mats.zone, "dngr");
  g.add(...[staticMesh(merge(stone), mats.stone, "dungeon-stone"), staticMesh(merge(glyph), mats.frieze, "dungeon-glyphs", false), staticMesh(merge(wood), wm, "dungeon-beams"),
    staticMesh(merge(floor), mats.floor, "dungeon-floor", false), staticMesh(merge(rubble), mats.stone, "dungeon-rubble", false), staticMesh(merge(roots), rm, "dungeon-root-vines", false)].filter((m): m is THREE.Mesh => !!m));
  const fl = g.getObjectByName("dungeon-floor") as THREE.Mesh | undefined;
  if (fl) { const fm = (fl.material as THREE.MeshStandardMaterial); fm.polygonOffset = true; fm.polygonOffsetFactor = -1; fm.polygonOffsetUnits = -2; }
  for (const [pos, w, h] of flames) g.add(flameCard(pos, w, h, pos.x * 3.1 + pos.z, 0.62));
  // the shrine: two shafts of daylight from the façade windows across the floor (dust in the light)
  for (const sx of [-1, 1]) g.add(lightShaft(new THREE.Vector3(sx * 5.3, 17.75, -33.7), new THREE.Vector3(sx * 4.6, 16.05, -38.6), 0.45, 1.05));
  g.traverse((o) => { if (o.name === "jungle-vines") { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; interiorPatch(m, mats.zone, "dngv"); } });
  return g;
}

/** the dungeon's door voids (shared templeDungeon doors) — the dado breaks there */
let _doors: AABB[] | null = null;
function doorList(): AABB[] {
  if (_doors) return _doors;
  // (kept local to avoid a second carve: the same numbers as templeDungeon().doors)
  _doors = [[-8.5, 4, -39.6, -5.9, 7.4, -37.2], [5.9, 4, -39.6, 8.5, 7.4, -37.2], [-19.6, 4, -45.2, -15.5, 7.4, -42.8], [15.5, 4, -45.2, 19.6, 7.4, -42.8],
    [-16.6, 10, -45.2, -13.1, 13.2, -42.8], [13.1, 10, -45.2, 16.6, 13.2, -42.8], [-13.8, 16, -45.2, -11.9, 19.2, -42.8], [11.9, 16, -45.2, 13.8, 19.2, -42.8],
    [-8.4, 4, -58, -8.4, 8, -54.6], [8.4, 4, -58, 8.4, 8, -54.6],
    [-16.6, 11.2, -38.7, -13.1, 12.5, -37.3], [13.1, 11.2, -38.7, 16.6, 12.5, -37.3], [-16.6, 11.2, -51.7, -13.1, 12.5, -50.3], [13.1, 11.2, -51.7, 16.6, 12.5, -50.3],
    [-6.1, 17.1, -33.6, -4.5, 18.3, -30.3], [4.5, 17.1, -33.6, 6.1, 18.3, -30.3]];
  return _doors;
}

/** gnarled roots hanging from a ceiling point: n tapering tubes (lengths lenMin…lenMax), bark-brown vertex colours */
export function rootTangles(rnd: () => number, x: number, y: number, z: number, n: number, lenMin: number, lenMax: number, r0 = 0.07): Geo[] {
  const out: Geo[] = [];
  for (let k = 0; k < n; k++) {
    const pts: THREE.Vector3[] = [], len = lenMin + rnd() * (lenMax - lenMin), a = rnd() * 6.28; let px = x + (rnd() - 0.5) * 0.8, pz = z + (rnd() - 0.5) * 0.8;
    for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new THREE.Vector3(px, y + 0.05 - t * len, pz)); px += Math.cos(a + i) * 0.12; pz += Math.sin(a + i * 1.3) * 0.12; }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, r0 + rnd() * r0 * 0.7, 5, false), tp = tg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) { const t = Math.min(1, Math.max(0, (y - tp.getY(i)) / len)), c = pts[Math.min(5, Math.round(t * 5))]; tp.setX(i, c.x + (tp.getX(i) - c.x) * (1 - 0.8 * t)); tp.setZ(i, c.z + (tp.getZ(i) - c.z) * (1 - 0.8 * t)); }
    tg.computeVertexNormals(); boxUVs(tg, 1); tint(tg, rnd() < 0.5 ? "#5a3f28" : "#6b4c30", 0.08); out.push(tg);
  }
  return out;
}
