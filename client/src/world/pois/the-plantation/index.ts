// THE PLANTATION (poi-coast) — endless neat rows of banana plants with blue fruit bags, the big red timber packing
// house (enterable: loft, balcony, conveyor ramp), BANANA CO. crates, yellow tractor + trailer, the timber water tower,
// worker cottages, dirt roads. Layout + colliders: shared/pois/the-plantation.ts (visuals derive from the same data).
import * as THREE from "three";
import type { WorldModule } from "../../module";
import type { WorldCtx } from "../../../engine/engine";
import type { VegApi, PlantKind } from "../../veg/api";
import * as S from "../../../../../shared/pois/the-plantation";
import { rng } from "../../../../../shared/pois/coast-kit";
import { Batch, buildLayered, glowPoints, loadCoastTextures, CoastLod, NOCULL, box, cyl, lathe, gableGeo, texSet } from "../_kit/coast-kit";
const soilSet = (_ctx: WorldCtx) => texSet("soil-litter");
import { buildBarn } from "./barn";
import { buildRoads, buildRowSoil, buildYard, buildYardGround, heliconia } from "./yard";
import { BananaField } from "./rows";
import { M } from "../_kit/coast-kit";
import { inFrameRect } from "../../../../../shared/pois/coast-kit";
import { buildAccess, buildBarnCover, buildFarmhouse } from "./dress";
import { plantFlora, SOLID_KINDS } from "../peel-strip/coast-dress";
import { buildInteriors } from "../_kit/interior";

// view camera: on the west road R1, 55 m from the packing house's front gable, eye ~2.4 m: banana rows crowd both
// verges, the tractor + banana trailer on the left verge, BANANA CO. crates on the right, the road leading to the
// house (conveyor rising across its front, dock + deck), the water tower right, the midday sun behind-left
const CAM: [number, number, number] = [S.VIEW_SPOT[0], 5.8, S.VIEW_SPOT[1]];
const TGT: [number, number, number] = (() => { const f = S.BARN.frame, c = Math.cos(f.yaw), sn = Math.sin(f.yaw), lx = -3, lz = 4; return [f.x + lx * c + lz * sn, 4.0, f.z - lx * sn + lz * c]; })();

function dressVeg(ctx: WorldCtx, b: Batch) {
  const veg = ctx.shared.get("veg") as VegApi | undefined;
  const T = ctx.terrain, r = rng(6161);
  const mat = (x: number, z: number, s: number, yaw = r() * 6.28) => new THREE.Matrix4().compose(new THREE.Vector3(x, T.height(x, z) - 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));
  const lists: Partial<Record<PlantKind, THREE.Matrix4[]>> = {};
  // collidable kinds only via the shared FLORA (trunk colliders); nothing grows inside / against a building
  const inBuilding = (x: number, z: number) => inFrameRect(S.FARM.frame, x, z, -S.FARM.hx, S.FARM.hx, -S.FARM.hz, S.FARM.hz + S.FARM.porch, 0.8)
    || S.COTTAGES.some((c) => inFrameRect(c.f, x, z, -S.COT.w / 2, S.COT.w / 2 + 1.6, -S.COT.d / 2, S.COT.d / 2 + 1.0, 0.6))
    || inFrameRect(S.BARN.frame, x, z, S.BARN.lean.x0, S.BARN.main.x1 + 2.4, -S.BARN.len, 7, 0.6);
  const add = (k: PlantKind, m: THREE.Matrix4) => { if (SOLID_KINDS.has(k) || inBuilding(m.elements[12], m.elements[14])) return; (lists[k] ??= []).push(m); };
  // road verges: ferns, monstera, grass, heliconia clumps
  for (const [ri, road] of S.ROADS.entries()) {
    for (let i = 0; i + 1 < road.pts.length; i++) {
      const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1], L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
      for (let d = 0; d < L; d += 2.2) {
        for (const s of [-1, 1]) {
          const off = s * (road.hw + 1.4 + r() * 1.6), x = ax + tx * d - tz * off, z = az + tz * d + tx * off;
          if (S.roadDist(x, z) < 0.6) continue;
          // not on the packing-house yard decal (x −26…14, z −1…16 in the barn frame)
          { const f = S.BARN.frame, dx = x - f.x, dz = z - f.z, c = Math.cos(f.yaw), sn = Math.sin(f.yaw), lx = dx * c - dz * sn, lz = dx * sn + dz * c; if ((lx > -27 && lx < 15 && lz > -2 && lz < 9) || (lx > -18 && lx < 15 && lz > -2 && lz < 21)) continue; }
          if (!S.plantable(x, z) && S.roadDist(x, z) > 3) continue;
          const k = r();
          if (k < 0.34) add("fern", mat(x, z, 0.8 + r() * 0.5));
          else if (k < 0.5) add("monstera", mat(x, z, 0.7 + r() * 0.5));
          else if (k < 0.64 && ri !== 1) heliconia(b, M(x, T.height(x, z), z, 0, r() * 6, 0), 800 + i * 50 + Math.round(d));
          else add("grass", mat(x, z, 0.6 + r() * 0.5));
        }
      }
    }
  }
  // understory in the rows round the hero road (no bare stems or blurry soil; the field shows
  // no bare ground): low groundcover + ferns + grass tufts beside the plants within ~80 m of the camera spot
  {
    const [vx, vz] = S.VIEW_SPOT;
    for (const [x, z] of S.bananaSpots()) {
      const d = Math.hypot(x - vx, z - vz);
      if (d > 80) continue;
      const n = d < 35 ? 3 : 2;
      for (let q = 0; q < n; q++) {
        const a = r() * 6.28, rr = 0.7 + r() * 1.1, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        if (S.roadDist(px, pz) < 0.4) continue;
        const k = r();
        add(k < 0.42 ? "fern" : k < 0.62 ? "monstera" : k < 0.82 ? "grass" : "groundcover", mat(px, pz, (k < 0.62 ? 0.9 : 1.0) + r() * 0.45));
      }
    }
  }
  // no bare mulch in front of the camera: a 1.1 m grid over the verges within 42 m of the camera spot gets a low
  // plant wherever no banana stands within 1.3 m (ferns, monstera, grass; heliconia near the road) — the
  // foreground is all leaves
  {
    const [vx, vz] = S.VIEW_SPOT, spots = S.bananaSpots().filter(([x, z]) => Math.hypot(x - vx, z - vz) < 48);
    for (let gx = vx - 42; gx <= vx + 42; gx += 1.1) for (let gz = vz - 42; gz <= vz + 42; gz += 1.1) {
      const x = gx + (r() - 0.5) * 0.8, z = gz + (r() - 0.5) * 0.8, d = Math.hypot(x - vx, z - vz);
      if (d > 42) continue;
      const rd = S.roadDist(x, z);
      if (rd < 0.5 || rd > 9 || !S.plantable(x, z) && !(rd < 1.6)) continue;
      if (spots.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 1.7)) continue;
      const k = r();
      if (rd < 2.4 && k < 0.12) heliconia(b, M(x, T.height(x, z), z, 0, r() * 6, 0), 3000 + Math.round(gx * 7 + gz * 13));
      else add(k < 0.45 ? "fern" : k < 0.66 ? "monstera" : k < 0.9 ? "grass" : "groundcover", mat(x, z, 0.85 + r() * 0.5));
    }
  }
  // tall palm windbreak ringing the plantation (outside the rows) + a few by the cottages / barn — none in the
  // view camera's sight cone behind the packing house (the far field + hills read beyond it, for depth)
  const [vx0, vz0] = S.VIEW_SPOT, viewAz = Math.atan2(S.BARN.frame.x - vx0, S.BARN.frame.z - vz0);
  for (let k = 0; k < 90; k++) {
    const a = r() * Math.PI * 2, d = S.PAD.r + 8 + r() * 30, x = S.PAD.x + Math.cos(a) * d, z = S.PAD.z + Math.sin(a) * d;
    let da = Math.atan2(x - vx0, z - vz0) - viewAz; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const pk = r() < 0.8 ? "palm" : "palm-leaning", sc = 1.0 + r() * 0.3;
    if (Math.abs(da) < 0.55) continue;
    add(pk, mat(x, z, sc));
  }
  for (const c of S.COTTAGES) for (let k = 0; k < 2; k++) {
    const a = r() * 6.28, x = c.f.x + Math.cos(a) * (6 + r() * 2), z = c.f.z + Math.sin(a) * (6 + r() * 2);
    add("palm", mat(x, z, 0.9 + r() * 0.3));
    add("bush", mat(x + 1.5, z - 1, 0.9));
  }
  if (!veg) return;
  for (const [k, ms] of Object.entries(lists)) veg.plant(k as PlantKind, ms!);
}

/** far proxy (≤ 2k tris, one vertex-coloured draw): packing house block + lean-to + roofs, water tower, cottages */
function farProxy() {
  const b = new Batch(), B = S.BARN, f = B.frame, Mn = B.main, Ln = B.lean, rise = S.barnRise();
  b.setFrame(f.x, f.y, f.z, f.yaw);
  b.add(box(Mn.x1 - Mn.x0, Mn.eave, B.len), "plain", { m: M(0, Mn.eave / 2, -B.len / 2), color: 0xa8302a });
  const rg = gableGeo(Mn.x1 - Mn.x0 + 1.4, rise + 0.6, B.len + 0.8);
  b.add(rg, "plain", { m: M(0, Mn.eave - 0.3, -B.len / 2), uv: "local", color: 0x9fb2c6 });
  b.add(box(Mn.x0 - Ln.x0, Ln.hi, B.len), "plain", { m: M((Ln.x0 + Mn.x0) / 2, Ln.hi / 2, -B.len / 2), color: 0xa02c26 });
  b.add(box(Mn.x0 - Ln.x0 + 1, 0.3, B.len + 1), "plain", { m: M((Ln.x0 + Mn.x0) / 2, (Ln.hi + Ln.lo) / 2, -B.len / 2, 0, 0, Math.atan2(Ln.hi - Ln.lo, Mn.x0 - Ln.x0)), color: 0x9fb2c6 });
  b.setFrame(0, 0, 0, 0);
  const W = S.WTOWER;
  b.add(box(W.legSpread * 2, W.legH, W.legSpread * 2), "plain", { m: M(W.x, S.PAD.y + W.legH / 2, W.z, 0, W.yaw, 0), color: 0x6a4428 });
  b.add(cyl(W.tankR, W.tankR, W.tankH, 12), "plain", { m: M(W.x, S.PAD.y + W.legH + W.tankH / 2, W.z), color: 0xc49a6a });
  b.add(lathe([[W.tankR + 0.5, 0], [0.05, 2.0]], { segs: 12 }), "plain", { m: M(W.x, S.PAD.y + W.legH + W.tankH, W.z), uv: "keep", color: 0xc8483a });
  for (const c of S.COTTAGES) {
    b.setFrame(c.f.x, c.f.y, c.f.z, c.f.yaw);
    b.add(box(S.COT.w, S.COT.h + 0.45, S.COT.d), "plain", { m: M(0, (S.COT.h + 0.45) / 2, 0), color: 0xe8dcc4 });
    const cg = gableGeo(S.COT.d + 1, S.COT.d / 2 * Math.tan(S.COT.pitch) + 0.2, S.COT.w + 0.9); cg.rotateY(Math.PI / 2);
    b.add(cg, "plain", { m: M(0, S.COT.h + 0.45, 0), uv: "local", color: c.roof ? 0xe3b52a : 0xc64a3a });
  }
  b.setFrame(0, 0, 0, 0);
  const g = b.build("plantation:proxy", { farShadow: true });
  g.traverse((o) => { o.userData.farShadow = "force"; o.userData.castShadow = true; });
  return g;
}

const mod: WorldModule = {
  id: "poi:the-plantation",
  views: {
    "poi-07-the-plantation": { pos: CAM, target: TGT, fov: 50, rel: true },
  },
  async build(ctx) {
    // every set the plantation's own meshes use (without "corrugated", the barn built alone throws)
    await loadCoastTextures(ctx, ["roof-tiles", "barn-red", "corr-painted", "corrugated", "concrete-panels", "crate-wood", "dirt-road", "staves", "lap-siding", "planks-grey", "boulder", "soil-litter", "cliff-slab"]);
    const [leafTex, leafN] = await Promise.all([
      ctx.assets.texture("assets/pois/coast/tex/leaf-banana.webp", { repeat: false }),
      ctx.assets.texture("assets/pois/coast/tex/leaf-banana_n.jpg", { srgb: false, repeat: false }),
    ]);
    const glows: THREE.Vector3[] = [];
    const bb = new Batch(), bMid = new Batch({ lod: 1 }), bNear = new Batch({ lod: 2 }), bIn = new Batch({ lod: 2 });
    buildBarn(bb, bMid, bNear, glows, bIn);
    await ctx.yield();
    buildYard(bb, bMid, bNear, ctx.terrain, glows);
    await ctx.yield();
    buildRoads(bb, ctx.terrain);
    buildYardGround(bb, ctx.terrain);
    await ctx.yield();
    buildRowSoil(bb, ctx.terrain, soilSet(ctx));
    await ctx.yield();
    buildFarmhouse(bb, bMid, bNear, glows);
    buildBarnCover(bb, bIn);
    buildAccess(bb, bMid, bNear);
    await ctx.yield();
    plantFlora(ctx.shared.get("veg") as VegApi | undefined, S.FLORA, ctx.scene);
    dressVeg(ctx, bNear);
    await ctx.yield();
    const proxy = farProxy();
    const groups = [buildLayered("plantation", [bb, bMid, bNear], { farShadow: false })];
    const gp = glowPoints(glows.map((p) => ({ p, size: 1.1 })), { opacity: 0.18 });
    ctx.scene.add(...groups, gp, proxy);
    const lod = new CoastLod({ center: [S.BARN.frame.x - 12, S.PAD.y, S.BARN.frame.z - 20], radius: 70, proxy });
    for (const g of groups) lod.add(g);
    lod.add(gp, 1).attach(ctx);
    // the packing-line interior (≈ 60 k tris of fruit, tables, tanks) only within ~30 m of the house (drawn from
    // everywhere the POI is in range, it costs too much)
    const inner = buildLayered("plantation:interior", [bIn], { farShadow: false });
    ctx.scene.add(inner);
    const bc = (() => { const f = S.BARN.frame, c = Math.cos(f.yaw), sn = Math.sin(f.yaw), lx = -5, lz = -13; return [f.x + lx * c + lz * sn, S.PAD.y + 3, f.z - lx * sn + lz * c] as [number, number, number]; })();
    // the packing-line interior shows from 50 m of the barn (at 31 m it grew in right in front of the
    // big door while you crossed the yard)
    new CoastLod({ center: bc, radius: 15, near: 35, mid: 35 }).add(inner).attach(ctx);
    await ctx.yield();
    const field = new BananaField(S.bananaSpots(), leafTex, leafN);
    await ctx.yield();
    field.ground((x, z) => ctx.terrain.height(x, z));
    BananaField.attach(ctx, field);
    await ctx.yield();
    // the five cottages + the farmhouse's ground floor and bedrooms (shared interiors kit)
    // maxDist 80 m past the rooms' sphere (at 42 m every cottage / farmhouse room grew in at once ~110 m out, through
    // the windows)
    await buildInteriors(ctx, S.INTERIOR_ROOMS, { name: "plantation:interiors", maxDist: NOCULL ? 1e6 : 80 });
  },
};
export default mod;
