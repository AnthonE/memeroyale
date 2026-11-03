// PEEL STRIP (poi-coast) — small tropical airstrip on the W plateau: cracked runway toward the volcano, enterable
// control tower + spotter deck, enterable barrel-roof hangar with the BANANA CO. plane, lean-to shed, fuel drums,
// windsock, crashed transport in the grass at the far end. Layout + colliders: shared/pois/peel-strip.ts.
import * as THREE from "three";
import type { WorldModule } from "../../module";
import type { WorldCtx } from "../../../engine/engine";
import type { VegApi, PlantKind } from "../../veg/api";
import * as S from "../../../../../shared/pois/peel-strip";
import { rng, toWorld } from "../../../../../shared/pois/coast-kit";
import { Batch, buildLayered, glowPoints, loadCoastTextures, CoastLod, NOCULL, M, box, cyl, rbox } from "../_kit/coast-kit";
import { buildTower, buildSpotter } from "./tower";
import { buildHangar } from "./hangar";
import { buildField, crackLines } from "./field";
import { buildCover, buildHangarCover, buildNewRails, buildTerminal } from "./dress";
import { plantFlora, SOLID_KINDS } from "./coast-dress";
import { buildInteriors } from "../_kit/interior";
import { buildCrash } from "./crash";

// view camera: the spotter deck stands in line with the tower's front (S.SPOT); the camera at its back-left corner
// looks 8° right of the runway axis, down to the apron: the tower's door face + logo fill the left quarter, the hangar
// door + plane three-quarter mid-left, the runway recedes upper right to the crash, the deck rail crosses lower left
const CAM = S.sw(S.SPOT.x + 1.7, S.SPOT.z - 1.4), TGT = S.sw(S.SPOT.x + 67, S.SPOT.z + 4.5);

/** strip-local point inside the hangar block (+ shed + taxiway), in hangar-local terms */
function inHangar(x: number, z: number, m = 0) {
  const w = S.sw(x, z), f = S.HGR.frame, dx = w[0] - f.x, dz = w[2] - f.z, c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
  const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  return lx > -S.HGR.L / 2 - 3 - m && lx < S.TAXI.x1 + m && lz > -S.HGR.W / 2 - 3 - m && lz < S.SHED.z1 + 2 + m;
}

function dressVeg(ctx: WorldCtx) {
  const veg = ctx.shared.get("veg") as VegApi | undefined;
  if (!veg) return;
  const T = ctx.terrain, r = rng(4242);
  const mat = (p: number[], s: number, yaw = r() * 6.28) =>
    new THREE.Matrix4().compose(new THREE.Vector3(p[0], T.height(p[0], p[2]) - 0.05, p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));
  // collidable kinds (palms, trees, logs) come ONLY from the shared FLORA (their trunks collide) — see plantFlora
  // nothing grows inside a building footprint or a cover prop (hand-placed lists could otherwise put a
  // monstera + ferns on the hangar floor)
  const inTerm = (x: number, z: number) => { const w = S.sw(x, z), f = S.TERM.frame, dx = w[0] - f.x, dz = w[2] - f.z, c = Math.cos(f.yaw), sn = Math.sin(f.yaw), lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) < S.TERM.hx + 1 && lz > -S.TERM.hz - 1 && lz < S.TERM.hz + 3; };
  const inTower = (x: number, z: number) => { const w = S.sw(x, z), f = S.TWR.frame; return Math.hypot(w[0] - f.x, w[2] - f.z) < S.TWR.S + S.TWR.balc + 1.6; };
  const blockedAt = (x: number, z: number) => inHangar(x, z, 0.5) || inTerm(x, z) || inTower(x, z) || S.COVER.some(([, cx, cz]) => Math.hypot(x - cx, z - cz) < 2.6);
  const add = (kind: PlantKind, pts: Array<[number, number, number]>) => { if (!SOLID_KINDS.has(kind)) veg.plant(kind, pts.filter(([x, z]) => !blockedAt(x, z)).map(([x, z, s]) => mat(S.sw(x, z), s))); };
  const addH = (kind: PlantKind, pts: Array<[number, number, number]>) => veg.plant(kind, pts.filter(([x, z]) => !((x > -S.HGR.L / 2 - 0.3 && x < S.HGR.L / 2 + 0.3 && Math.abs(z) < S.HGR.W / 2 + 0.3) || (x > S.SHED.x0 - 0.3 && x < S.SHED.x1 + 0.3 && z < S.SHED.z1 + 0.3))).map(([x, z, s]) => mat(toWorld(S.HGR.frame, x, 0, z), s)));
  const L = S.RWY.len;
  // (the framing palms are in the shared FLORA hand list — collidable; add() drops solid kinds)
  // the right foreground: big banana plants + monstera + a leaning palm right beside the spotter deck
  add("banana-plant", [[2.5, 11.4, 1.5], [6.5, 12.2, 1.4], [10, 11.2, 1.45], [-1, 12.6, 1.35], [13.5, 12.4, 1.3], [-4.5, 13.5, 1.3]]);
  add("monstera", [[4.2, 10.6, 1.4], [8.2, 10.5, 1.3], [0.5, 10.8, 1.2], [11.8, 10.4, 1.2]]);
  add("fern", [[1.8, 10.2, 1.2], [5.8, 10.1, 1.1], [9.2, 10.0, 1.1], [-2, 10.4, 1.1]]);
  // the spotter deck's right foreground (a big palm + bananas + monstera below the deck's right rail),
  // SPOT-relative
  const sp = (pts: Array<[number, number, number]>) => pts.map(([dx, dz, s]) => [S.SPOT.x + dx, S.SPOT.z + dz, s] as [number, number, number]);
  // (12–20 m ahead of the deck: nearer ones stay under the frame from the 12 m eye)
  add("banana-plant", sp([[13, 3.2, 1.8], [16.4, 5.0, 1.75], [19.4, 2.6, 1.6], [21.5, 5.2, 1.5], [11.2, 5.4, 1.5]]));
  // (no foreground palm: from this deck the frame's right edge is over the runway — one there blocks the strip)
  add("monstera", sp([[12.4, 1.6, 1.6], [17.6, 1.8, 1.5], [15.2, 3.6, 1.5], [20.6, 4.0, 1.4], [23, 2.4, 1.3]]));
  add("fern", sp([[14.6, 0.8, 1.3], [18.8, 5.8, 1.2], [22.4, 1.2, 1.2], [10.6, 2.6, 1.1], [16, 7.4, 1.1]]));
  add("banana-plant", [[14, 14.5, 1.3], [18.5, 15.5, 1.2], [23, 14.2, 1.35], [28, 15.5, 1.15], [11, 17, 1.2], [42, 15, 1.1], [56, 14.5, 1.2], [74, 15.2, 1.1],
    [90, 14.6, 1.15], [120, 15, 1.1], [L - 6, 15.5, 1.1], [L + 10, -20, 1.0], [L + 30, -12, 1.1], [12, -34, 1.0], [22, -42, 1.1], [-14, -24, 1.0], [-18, 4, 1.05]]);
  add("monstera", [[16, 13.2, 1.3], [20.5, 13.4, 1.2], [26, 13.5, 1.1], [33, 13.8, 1.2], [60, 13.4, 1.0], [L + 12, -12, 1.0], [L + 30, -6, 1.1], [-6, -30, 1.0], [34, -36, 1.0]]);
  add("fern", [[12.5, 13, 1.1], [17, 12.8, 1.0], [24, 12.9, 1.0], [30, 13, 1.1], [38, 13.2, 1.0], [-4, -28, 1.0], [8, -30, 1.0], [L + 12, -2, 1.0], [L + 6, -16, 1.1], [L + 24, 4, 0.9], [L + 34, -2, 1.0], [26, -30, 0.9], [30, -34, 1.0]]);
  add("bush", [[46, 20, 1.1], [86, 22, 1.0], [118, 21, 1.1], [L + 2, 20, 1.1], [L - 6, -22, 1.2], [L + 50, 4, 1.2], [4, -40, 1.1], [60, -52, 1.2], [-22, -18, 1.0], [106, -30, 1.1]]);
  add("flowers", [[15, 12.6, 1.0], [22, 12.5, 1.0], [-2, -27, 1.0], [L + 10, -24, 1.0], [12, -24, 0.9], [20, -27, 0.9]]);
  // the crash is being swallowed by the jungle: bushes, monstera, ferns + grass round the fuselage pieces
  { const c = S.CRASH, cc = Math.cos(c[2]), sn = Math.sin(c[2]), K = S.CRASH_SCALE;
    const cw = (lx: number, lz: number): [number, number] => [c[0] + (lx * cc + lz * sn) * K, c[1] + (-lx * sn + lz * cc) * K];
    const around = (kind: PlantKind, pts: Array<[number, number, number]>) => veg.plant(kind, pts.map(([lx, lz, sc]) => { const [x, z] = cw(lx, lz); return mat([x, 0, z], sc); }));
    // (the veg "vine" kind hangs from tree canopies — over the crash it drew ropes across the sky: bushes + monstera instead)
    around("bush", [[2.5, 2.4, 0.9], [-6.5, 5.2, 1.0], [-10.5, 1.2, 0.8], [0.5, -5.2, 0.9]]);
    around("monstera", [[5.2, -1.8, 1.0], [-9, 3.4, 0.9], [-3, 6.2, 1.0]]);
    around("fern", [[1, 1.8, 1.1], [4, -1.7, 1.0], [-5, 5, 1.0], [-8.4, 1.6, 1.1], [3, -6.5, 1.0], [0, 7, 1.0], [6.5, 1, 0.9]]);
    around("grass", Array.from({ length: 24 }, (_, i) => [-12 + (i % 8) * 3 + r() * 1.5, -6 + Math.floor(i / 8) * 6 + r() * 2, 0.9 + r() * 0.4] as [number, number, number]));
  }
  // hangar surroundings (hangar-local): ferns + monstera along the mural wall, bush by the shed, grass at the eaves
  addH("fern", [[-3, 11.2, 1.0], [2, 11.0, 0.9], [6, 11.3, 1.0], [-13.5, 12, 1.0], [13.8, 9.2, 0.9], [13.8, -9.5, 1.0]]);
  addH("monstera", [[-14, 15.5, 1.1], [5.5, 11.6, 0.9]]);
  addH("grass", Array.from({ length: 30 }, (_, i) => [-12 + i * 0.85, 10.6 + (i % 3) * 0.2, 0.7 + (i % 4) * 0.12] as [number, number, number]));
  // weeds growing IN the crack lines (field.ts crackLines — the same polylines the dark crack strips follow), denser
  // and taller toward the neglected far end
  const weeds: Array<[number, number, number]> = [];
  for (const line of crackLines()) for (let i = 0; i < line.length; i++) {
    const [x, z] = line[i];
    if (r() > 0.3 + 0.6 * (x / L)) continue;
    weeds.push([x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.2, 0.6 + r() * 0.5 + 0.3 * (x / L)]);
  }
  add("grass", weeds);
  add("flowers", weeds.filter((_, i) => i % 9 === 0).map(([x, z]) => [x + 0.3, z, 0.6] as [number, number, number]));
  addH("grass", Array.from({ length: 14 }, () => [S.TAXI.x0 + r() * (S.TAXI.x1 - S.TAXI.x0), S.TAXI.z0 + r() * (S.TAXI.z1 - S.TAXI.z0), 0.18 + r() * 0.14] as [number, number, number]));
  // the lawns between the buildings: tufts, flowers, a few low bushes (long + lush grass, not mown)
  const lawn: Array<[number, number, number]> = [], lawnFl: Array<[number, number, number]> = [];
  for (let i = 0; i < 700; i++) {
    const x = -20 + r() * 80, z = -45 + r() * 34;
    if (inHangar(x, z) || Math.hypot(x - S.SPOT.x, z - S.SPOT.z) < 4 || (z > -12 && x > -24)) continue;
    (r() < 0.85 ? lawn : lawnFl).push([x, z, 0.7 + r() * 0.5]);
  }
  add("grass", lawn); add("flowers", lawnFl);
  // jungle belt round the airfield (the pad itself is open grass; dense palm jungle on every side)
  const inKeep = (x: number, z: number) =>
    (x > -26 && x < L + 8 && Math.abs(z) < S.RWY.half + 12) ||      // runway + shoulders + the right-side grove strip
    (x > -34 && x < 12 && z > -38 && z < 16) ||                      // tower, apron, spotter + stair
    (x > S.SPOT.x - S.SPOT.half - 0.5 * S.SPOT.stairN - 4 && x < S.SPOT.x + 4 && z > S.SPOT.stairZ - 3 && z < S.SPOT.z + 4) ||
    (x > -6 && x < 70 && z > -48 && z < -9) ||                       // tower → hangar lawns (the camera's sight lines)
    inHangar(x, z, 4) ||
    (x > L - 4 && x < L + 48 && z > -26 && z < 18);                  // crash (1.5×) + its boulders
  // understorey only (trees come from the shared, collidable FLORA — add() drops palm / tree
  // picks here), and ~40 % thinner: clean, readable ground round the airfield
  const belt: Record<"bush" | "banana-plant" | "fern" | "monstera", Array<[number, number, number]>> = { bush: [], "banana-plant": [], fern: [], monstera: [] };
  for (let i = 0; i < 520; i++) {
    const x = -60 + r() * (L + 140), side = r();
    const z = side < 0.5 ? -(S.RWY.half + 40 + Math.pow(r(), 0.8) * 60) : side < 0.85 ? S.RWY.half + 22 + Math.pow(r(), 0.8) * 60 : -60 + r() * 120;
    const xx = side >= 0.85 ? L + 30 + r() * 70 : x;
    if (inKeep(xx, z)) continue;
    const p = S.sw(xx, z);
    if (Math.hypot(p[0] - S.PAD.x, p[2] - S.PAD.z) > 215) continue;
    const k = r(), s = 0.85 + r() * 0.4;
    if (k < 0.42) belt.bush.push([xx, z, s]); else if (k < 0.6) belt["banana-plant"].push([xx, z, s]); else if (k < 0.85) belt.fern.push([xx, z, s]); else belt.monstera.push([xx, z, s]);
  }
  for (const [k, pts] of Object.entries(belt)) add(k as PlantKind, pts);
  // grassy shoulders
  const verge: Array<[number, number, number]> = [];
  for (let i = 0; i < 260; i++) { const s = r() < 0.5 ? -1 : 1; verge.push([r() * L, s * (S.RWY.half + 1.2 + r() * 2.5), 0.5 + r() * 0.5]); }
  add("grass", verge);
}

const mod: WorldModule = {
  id: "poi:peel-strip",
  views: {
    "poi-10-peel-strip": { pos: [CAM[0], S.PAD.y + S.SPOT.y + 2.0, CAM[2]], target: [TGT[0], S.PAD.y + 1.6, TGT[2]], fov: 56 },
  },
  async build(ctx) {
    await loadCoastTextures(ctx, ["asphalt", "corrugated", "corr-painted", "planks-grey", "concrete-panels", "dirt-road", "crate-wood", "boulder", "cliff-slab"]);
    const glows: THREE.Vector3[] = [];
    // ONE structure batch for tower + deck + hangar + field (one draw per material), + mid / near prop batches
    const b = new Batch(), bMid = new Batch({ lod: 1 }), bNear = new Batch({ lod: 2 });
    buildTower(b, bNear, glows);
    buildSpotter(b);
    buildHangar(b, bNear, glows);
    buildField(b, bMid, ctx.terrain, glows);
    await ctx.yield();
    buildTerminal(b, bMid, bNear, glows);
    buildHangarCover(b, bNear);
    buildNewRails(b);
    await ctx.yield();
    buildCover(bMid, bNear, ctx.terrain);
    buildCrash(bMid, bNear, ctx.terrain);
    await ctx.yield();
    const proxy = farProxy();
    const groups = [buildLayered("peel-strip", [b, bMid, bNear], { farShadow: false })];
    const gp = glowPoints(glows.map((p) => ({ p, size: 1.1 })), { opacity: 0.18 });
    ctx.scene.add(...groups, gp, proxy);
    const c = S.sw(S.RWY.len / 2, -10);
    const lod = new CoastLod({ center: [c[0], S.PAD.y, c[2]], radius: 90, proxy });
    for (const g of groups) lod.add(g);
    lod.add(gp, 1).attach(ctx);
    plantFlora(ctx.shared.get("veg") as VegApi | undefined, S.FLORA, ctx.scene);
    dressVeg(ctx);
    await ctx.yield();
    // the terminal hall + flight office, the hangar store, the lean-to workshop (shared interiors kit)
    // maxDist 80 m (at 42 m the terminal / hangar rooms grew in through the glass on the runway)
    await buildInteriors(ctx, S.INTERIOR_ROOMS, { name: "peel-strip:interiors", maxDist: NOCULL ? 1e6 : 80 });
  },
};

/** far proxy (≤ 1.5k tris, one vertex-coloured draw): runway slab, tower shaft + cab + roof, hangar block + barrel roof */
function farProxy() {
  const b = new Batch(), st = S.STRIP;
  b.setFrame(st.x, st.y, st.z, st.yaw);
  b.add(box(S.RWY.len, 0.1, S.RWY.half * 2), "plain", { m: M(S.RWY.len / 2, 0.08, 0), color: 0x55544f });
  b.setFrame(0, 0, 0, 0);
  const tf = S.TWR.frame, T = S.TWR;
  b.setFrame(tf.x, tf.y, tf.z, tf.yaw);
  b.add(box(T.S * 2, T.cab, T.S * 2), "plain", { m: M(0, T.cab / 2, 0), color: 0xe8dcc0 });
  b.add(box(T.cabS * 2 + 0.8, T.roof0 - T.cab, T.cabS * 2 + 0.8), "plain", { m: M(0, (T.roof0 + T.cab) / 2, 0), color: 0x6a8a9a });
  b.add(rbox(T.cabS * 2 + 2, T.roofT, T.cabS * 2 + 2, 0.1), "plain", { m: M(0, T.roof0 + T.roofT / 2, 0), color: 0xf0bd22 });
  b.add(box((T.S + T.balc) * 2, 0.4, (T.S + T.balc) * 2), "plain", { m: M(0, T.cab - 0.2, 0), color: 0xf0bd22 });
  b.setFrame(0, 0, 0, 0);
  const hf = S.HGR.frame, H = S.HGR;
  b.setFrame(hf.x, hf.y, hf.z, hf.yaw);
  b.add(box(H.L, H.HW, H.W), "plain", { m: M(0, H.HW / 2, 0), color: 0xd8d2c6 });
  const arch = cyl(S.HGR_R, S.HGR_R, H.L + 1, 16, false); arch.rotateZ(Math.PI / 2);
  b.add(arch, "plain", { m: M(0, H.HW - (S.HGR_R - H.AR), 0, 0, 0, 0, 1, 1, (H.W / 2 + H.over) / S.HGR_R), color: 0x9c9890 });
  b.setFrame(0, 0, 0, 0);
  const g = b.build("peel-strip:proxy", { farShadow: true });
  g.traverse((o) => { o.userData.farShadow = "force"; o.userData.castShadow = true; });
  return g;
}
export default mod;
