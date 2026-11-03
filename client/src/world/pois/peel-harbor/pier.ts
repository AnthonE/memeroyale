// PEEL HARBOR — the wooden pier at the quay's SE corner (plank deck on round timber piles, T-head, mooring
// posts, rope, tyre fenders, a ladder into the water, steps up to the apron) + mossy coast rocks around its foot and
// along the south riprap + a little moored work boat. Layout: PIER + ROCKS in shared/pois/peel-harbor.ts.
import * as THREE from "three";
import { rockInstances, rockProtos } from "../_kit/jungle-rocks";
import { pbr, stoneMaterial } from "../_kit/jungle-mat";
import { PIER, ROCKS, ROCK_BAKE, ROCK_SIG, pierSteps, rockSets } from "../../../../../shared/pois/peel-harbor";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { Builder, hash, trs, type V3, mergeCasters, mergeInstanced } from "../_kit/harbor-geo";
import { paint, type HarborMats } from "../_kit/harbor-materials";
import type { WorldCtx } from "../../../engine/engine";
import { foam, groundAt, type Part } from "./parts";

// ------------------------------------------------------------------------------------------------ rocks
/** chunky rounded boulder: displaced icosphere, flattened base; returns rock + moss-cap geometries (unit radius) */
export function boulderGeo(seed: number, moss: number): { rock: THREE.BufferGeometry; moss: THREE.BufferGeometry | null } {
  const ico = new THREE.IcosahedronGeometry(1, 3);
  ico.deleteAttribute("normal"); ico.deleteAttribute("uv");
  const g = mergeVertices(ico);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const f = (x: number, y: number, z: number) => Math.sin(x * 1.7 + seed) * Math.cos(z * 1.9 - seed * 0.7) + 0.5 * Math.sin(y * 3.1 + x * 2.3 + seed * 1.3) + 0.25 * Math.sin(z * 5.3 - y * 4.1 + seed);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + 0.16 * f(v.x, v.y, v.z);
    v.multiplyScalar(d);
    v.x *= 1 + 0.25 * hash(seed, 1); v.z *= 1 + 0.2 * hash(seed, 2); v.y *= 0.72 + 0.2 * hash(seed, 3);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.3;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const rock = g.toNonIndexed(); // keeps the smooth (indexed) normals — rounded, sculpted read
  const rn = rock.attributes.normal as THREE.BufferAttribute;
  let mossG: THREE.BufferGeometry | null = null;
  if (moss > 0.05) {
    const rp = rock.attributes.position as THREE.BufferAttribute, mp: number[] = [], mn: number[] = [];
    const thr = 0.75 - moss * 0.6;
    for (let t = 0; t < rp.count; t += 3) {
      const ny = (rn.getY(t) + rn.getY(t + 1) + rn.getY(t + 2)) / 3;
      if (ny < thr + (hash(seed, t) - 0.5) * 0.25) continue;
      for (let k = 0; k < 3; k++) { mp.push(rp.getX(t + k) + rn.getX(t + k) * 0.03, rp.getY(t + k) + rn.getY(t + k) * 0.03, rp.getZ(t + k) + rn.getZ(t + k) * 0.03); mn.push(rn.getX(t + k), rn.getY(t + k), rn.getZ(t + k)); }
    }
    if (mp.length) { mossG = new THREE.BufferGeometry(); mossG.setAttribute("position", new THREE.Float32BufferAttribute(mp, 3)); mossG.setAttribute("normal", new THREE.Float32BufferAttribute(mn, 3)); }
  }
  return { rock, moss: mossG };
}

/** mossy boulders at harbor-local positions; `ground(x,z)` gives the terrain under a local point (defaults to the
 *  world terrain when the rocks are world-space, e.g. the wreck) */
export function rocksInto(b: Builder, m: HarborMats, ctx: WorldCtx, rocks: Array<{ x: number; z: number; r: number; moss: number; y?: number }>, ground?: (x: number, z: number) => number, foamAt?: (x: number, z: number, r: number) => void) {
  const water = ctx.shared.get("water") as { registerFoamCircle?: (x: number, z: number, r: number, s?: number) => void } | undefined;
  rocks.forEach((k, i) => {
    const gy = k.y ?? (ground ? ground(k.x, k.z) : ctx.terrain.height(k.x, k.z));
    const { rock, moss } = boulderGeo(i * 3.7 + k.x * 0.01, k.moss);
    const mm = trs([k.x, gy + k.r * 0.18, k.z], hash(k.x, k.z) * 6.28, (hash(i, 5) - 0.5) * 0.3, (hash(i, 6) - 0.5) * 0.3, [k.r, k.r, k.r]);
    b.add(m.rock, rock, mm, true, 0.5);
    if (moss) b.add(m.moss, moss, mm, true, 0.5);
    if (gy < 0.4) { if (foamAt) foamAt(k.x, k.z, k.r * 1.25); else water?.registerFoamCircle?.(k.x, k.z, k.r * 1.25, 0.8); }
  });
}

// ------------------------------------------------------------------------------------------------ boat
function workBoat(b: Builder, m: HarborMats, x: number, z: number, yaw: number) {
  const base = trs([x, 0.15, z], yaw);
  const hull = paint("#e9e6de", { rough: 0.45, name: "boat-white" }), stripe = paint("#2f67b5", { name: "boat-blue" });
  const prof: Array<[number, number]> = [[0.001, -3.4], [0.55, -3.0], [1.0, -2.0], [1.2, -0.5], [1.2, 1.8], [1.05, 3.0], [0.001, 3.1]];
  b.lathe(hull, prof, 16, base.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 1, 0.55)), 0, Math.PI);
  b.lathe(stripe, [[1.22, -2.4], [1.22, 2.6]], 16, base.clone().multiply(trs([0, 0.05, 0])).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 1, 0.12)), Math.PI * 0.02, Math.PI * 0.96);
  const add = (mt: THREE.Material, c: V3, s: V3, bevel = 0.05) => b.box(mt, [0, 0, 0], s, { bevel, m: base.clone().multiply(trs(c)) });
  add(m.wood, [0, 0.02, 0], [2.1, 0.06, 5.6], 0.02);
  add(hull, [0, 0.75, -0.6], [1.5, 1.3, 1.6], 0.12);
  add(m.windowDark, [0, 1.05, 0.21], [1.3, 0.5, 0.04], 0.01);
  add(stripe, [0, 1.45, -0.6], [1.7, 0.1, 1.9], 0.03);
  add(m.rubber, [0, 0.3, 2.9], [0.9, 0.35, 0.3], 0.1);
  for (const s of [-1, 1]) add(m.rubber, [s * 1.2, 0.2, 0], [0.18, 0.28, 3.6], 0.08);
}

// ------------------------------------------------------------------------------------------------ pier
export const part: Part = {
  id: "pier",
  async build({ ctx, mats, group, lod }) {
    const b = new Builder(true);
    const P = PIER, dy = P.deckY, wood = mats.wood;
    const pileMat = paint("#6e5236", { rough: 0.85, name: "pile-wood" });
    // chunky toy-scale timber (squared piles, fat planks, cap beams, X-bracing): planks 0.12 thick on
    // stringers, fascia boards on the edges, square chamfered piles capped by cross beams, X braces between pile pairs
    const deck = (x0: number, x1: number, z0: number, z1: number, along: "x" | "z") => {
      const n = along === "z" ? Math.round((z1 - z0) / 0.32) : Math.round((x1 - x0) / 0.32);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, j = hash(x0, z0, i);
        if (along === "z") b.box(wood, [(x0 + x1) / 2 + (j - 0.5) * 0.06, dy - 0.06 + (j - 0.5) * 0.02, z0 + (z1 - z0) * t], [x1 - x0 + 0.1 + (j - 0.5) * 0.25, 0.12, 0.28], { bevel: 0.025, rotY: (j - 0.5) * 0.02 });
        else b.box(wood, [x0 + (x1 - x0) * t, dy - 0.06 + (j - 0.5) * 0.02, (z0 + z1) / 2 + (j - 0.5) * 0.06], [0.28, 0.12, z1 - z0 + 0.1 + (j - 0.5) * 0.25], { bevel: 0.025, rotY: (j - 0.5) * 0.02 });
      }
      const js = along === "z" ? [x0 + 0.35, (x0 + x1) / 2, x1 - 0.35] : [z0 + 0.35, (z0 + z1) / 2, z1 - 0.35];
      for (const q of js) {
        if (along === "z") b.box(pileMat, [q, dy - 0.3, (z0 + z1) / 2], [0.24, 0.36, z1 - z0], { bevel: 0.03 });
        else b.box(pileMat, [(x0 + x1) / 2, dy - 0.3, q], [x1 - x0, 0.36, 0.24], { bevel: 0.03 });
      }
      // fascia boards on the two long edges
      for (const e of along === "z" ? [x0, x1] : [z0, z1]) {
        if (along === "z") b.box(pileMat, [e, dy - 0.25, (z0 + z1) / 2], [0.1, 0.34, z1 - z0 + 0.1], { bevel: 0.02 });
        else b.box(pileMat, [(x0 + x1) / 2, dy - 0.25, e], [x1 - x0 + 0.1, 0.34, 0.1], { bevel: 0.02 });
      }
    };
    const hw = P.width / 2;
    deck(P.x0 + 1.4, P.head.x0, P.z - hw, P.z + hw, "x");
    deck(P.head.x0, P.head.x1, P.head.z0, P.head.z1, "z");
    const pile = (x: number, z: number, top = dy - 0.45) => {
      const gy = Math.min(groundAt(ctx, x, z), 0) - 0.5;
      b.box(pileMat, [x, (gy + top) / 2, z], [0.42, top - gy, 0.42], { bevel: 0.05 });
      b.box(mats.algae, [x, (gy + 0.35) / 2, z], [0.45, 0.35 - gy, 0.45], { bevel: 0.05 });
      b.box(mats.steel, [x, top - 0.25, z], [0.46, 0.08, 0.46]);
    };
    const bents: Array<[number, number, number]> = [];   // (x | z, a, b): pile pairs for caps + X braces
    for (let x = P.x0 + 3; x < P.head.x0; x += 3.2) { for (const sz of [-1, 1]) pile(x, P.z + sz * (hw - 0.25)); bents.push([x, P.z - hw + 0.25, P.z + hw - 0.25]); }
    for (let z = P.head.z0 + 0.3; z <= P.head.z1; z += 3.4) for (const x of [P.head.x0 + 0.3, P.head.x1 - 0.3]) pile(x, z);
    // cap beams across each bent + X bracing between the pair (walkway) and along the head's sides
    for (const [x, za, zb] of bents) {
      b.box(pileMat, [x, dy - 0.62, (za + zb) / 2], [0.36, 0.32, zb - za + 0.7], { bevel: 0.04 });
      b.beam(pileMat, [x, 0.3, za], [x, dy - 0.8, zb], 0.14, 0.26);
      b.beam(pileMat, [x, 0.3, zb], [x, dy - 0.8, za], 0.14, 0.26);
    }
    for (let i = 0; i < bents.length - 1; i += 2) for (const sz of [-1, 1]) {
      const z = P.z + sz * (hw - 0.25), xa = bents[i][0], xb = bents[i + 1][0];
      b.beam(pileMat, [xa, 0.3, z], [xb, dy - 0.8, z], 0.26, 0.14);
    }
    for (const x of [P.head.x0 + 0.3, P.head.x1 - 0.3]) {
      b.box(pileMat, [x, dy - 0.62, (P.head.z0 + P.head.z1) / 2], [0.36, 0.32, P.head.z1 - P.head.z0 + 0.4], { bevel: 0.04 });
      for (let z = P.head.z0 + 0.3; z + 3.4 <= P.head.z1 + 0.1; z += 3.4) { b.beam(pileMat, [x, 0.3, z], [x, dy - 0.8, z + 3.4], 0.14, 0.26); b.beam(pileMat, [x, 0.3, z + 3.4], [x, dy - 0.8, z], 0.14, 0.26); }
    }
    // mooring posts at the head corners + along the walkway (squared with iron caps), yellow bollards, rope coils
    for (const [x, z] of [[P.head.x1 - 0.3, P.head.z0 + 0.3], [P.head.x1 - 0.3, P.head.z1 - 0.3], [P.x0 + 9.4, P.z - hw + 0.2], [P.x0 + 15.8, P.z + hw - 0.2]] as Array<[number, number]>) {
      b.box(pileMat, [x, dy + 0.55, z], [0.4, 1.2, 0.4], { bevel: 0.05 });
      b.box(mats.steel, [x, dy + 1.18, z], [0.46, 0.08, 0.46]);
      for (let k = 0; k < 3; k++) b.add(mats.rope, new THREE.TorusGeometry(0.3, 0.05, 6, 14).rotateX(Math.PI / 2 + (k - 1) * 0.2), trs([x, dy + 0.55 + k * 0.1, z]));
    }
    for (const z of [P.head.z0 + 3, P.head.z1 - 3]) b.lathe(mats.yellowPaint, [[0.001, 0], [0.3, 0], [0.18, 0.08], [0.16, 0.4], [0.26, 0.5], [0.001, 0.56]], 12, new THREE.Matrix4().makeTranslation(P.head.x1 - 0.6, dy, z));
    for (let k = 0; k < 4; k++) b.add(mats.rope, new THREE.TorusGeometry(0.34 - k * 0.04, 0.05, 6, 18).rotateX(Math.PI / 2), trs([P.head.x0 + 1.2, dy + 0.05 + k * 0.07, P.head.z1 - 3]));
    // rope rail along the walkway's +z side (the headland side) on squared posts
    const rp: V3[] = [];
    for (let x = P.x0 + 1.6; x < P.head.x0; x += 3.2) { b.box(pileMat, [x, dy + 0.5, P.z + hw - 0.15], [0.16, 1.0, 0.16], { bevel: 0.02 }); rp.push([x, dy + 0.95, P.z + hw - 0.15]); }
    for (let i = 0; i < rp.length - 1; i++) b.tube(mats.rope, [rp[i], [(rp[i][0] + rp[i + 1][0]) / 2, rp[i][1] - 0.2, rp[i][2]], rp[i + 1]], 0.04, 5, { samples: 8, tension: 0.5 });
    // (no ladders into the water — neither would be climbable: a
    // water stair climbs its seaward face, QUAY_STAIRS / access.ts) tyre fenders on the rest of the seaward face
    for (let z = P.head.z0 + 2; z < 457.5; z += 4) b.add(mats.rubber, new THREE.TorusGeometry(0.42, 0.17, 8, 16).rotateY(Math.PI / 2), trs([P.head.x1 + 0.22, dy - 0.9, z]));
    // steps from the apron down to the pier deck
    for (const s2 of pierSteps()) b.box(mats.concrete, [s2.x, (s2.y0 + s2.y1) / 2, s2.z], [s2.w, s2.y1 - s2.y0, s2.d], { bevel: 0.03 });
    // moored work boat alongside the head
    workBoat(b, mats, P.head.x1 - 4, P.head.z0 - 2.4, Math.PI / 2 + 0.1);
    const pierG = await b.buildAsync("pier", { palette: (m) => !/^wood|^pier/.test(m.name) }, () => ctx.yield());
    group.add(pierG);
    mergeCasters(pierG, { c1: false });
    lod.add(pierG, { show: 420 });
    // rocks (headland spit + riprap) on the real terrain
    // sculpted, chiselled boulders (poi-jungle's rock kit + triplanar stone): big mossy boulders at the pier
    // foot + grey riprap along the diagonal quay; wet + dark at the waterline, moss on top
    const F = foam(ctx);
    const stone = stoneMaterial(pbr(ctx, "boulder"), { triplanar: true, scale: 4, moss: 0.6, mossColor: "#4f8a2a", wetY: -0.2, wetFade: 0.5, variation: 0.5, lift: 0.18, color: "#bdb4a6" }, pbr(ctx, "moss"));
    // (one placement list for the drawn rocks AND their colliders — shared rockSets)
    for (const k of ROCKS) { const gy = k.y ?? groundAt(ctx, k.x, k.z); if (gy < 0.4) F.circle(k.x, k.z, k.r * 1.25, 0.8); }
    const sets = ROCK_BAKE?.sig === ROCK_SIG ? ROCK_BAKE.sets : rockSets((lx, lz) => groundAt(ctx, lx, lz));
    const rocks = rockInstances(rockProtos(sets.big.fam, sets.big.n, sets.big.res), sets.big.pl, stone, "harbor-rocks");
    const small = rockInstances(rockProtos(sets.small.fam, sets.small.n, sets.small.res), sets.small.pl, stone, "harbor-rocks-small");
    small.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.userData.castShadow = false; } });
    // static: every boulder baked into one mesh per material (casting big ones + non-casting small ones = 2 draws)
    const casting = mergeInstanced(rocks, "harbor-rocks"), still = mergeInstanced(small, "harbor-rocks-small");
    casting.add(...still.children);
    // (cascade 0 only — the far map has them)
    casting.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.c1Shadow = false; });
    group.add(casting);
    // (no far edge — with one, on High the boulders dissolve in at 300–324 m on the fly-in, 157 px; one merged mesh per
    // material, 2 draws, resident like the rest of the harbor's landmarks)
    lod.add(casting, { shadow: 70 });
    // the granite domes on the west headland — pale weathered granite with moss in the cracks, the
    // backdrop of the yard; one merged mesh, seen from the whole map (no LOD: ≈ 30 k tris, 1–2 draws)
    if (sets.hills?.pl.length) {
      const granite = stoneMaterial(pbr(ctx, "boulder"), { triplanar: true, scale: 9, moss: 0.45, mossColor: "#5d9a34", wetY: -50, wetFade: 1, variation: 0.6, lift: 0.32, color: "#cfc8bd" }, pbr(ctx, "moss"));
      const hills = mergeInstanced(rockInstances(rockProtos(sets.hills.fam, sets.hills.n, sets.hills.res), sets.hills.pl, granite, "harbor-hill-rocks"), "harbor-hill-rocks");
      // (no cascade shadows — 150–600 m from the yard; the static far shadow map bakes them)
      hills.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.userData.castShadow = false; o.userData.farShadow = true; } });
      group.add(hills);
    }
    for (let z = P.head.z0; z <= P.head.z1; z += 3.4) F.circle(P.head.x1, z, 0.6, 0.5);
    for (let x = P.x0 + 3; x < P.head.x0; x += 3.2) { F.circle(x, P.z - hw, 0.5, 0.4); F.circle(x, P.z + hw, 0.5, 0.4); }
  },
};
