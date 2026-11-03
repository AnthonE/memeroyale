// RIPE PEAK — visuals, all built from the BAKED resolved layout (shared/pois/ripe-peak.ts `layout`), the same data the
// server colliders come from: the rim plateau (black-rock ring road + jointed edge blocks) with the grey-brown totem crown,
// the ragged terraced fan (mossy bench tops, bench walls of big jointed lava-rock blocks, cheeked zig-zag flights), lava-rock
// outcrops over the flank, lava seams (HDR melt + orange glow skirts + pools), the crater (lava pool + crust + rubble), the
// smoke plume, the lookout crag (jointed-block butte, spiral stair, foreground totems, BANANA CO. crate, lava fissure).
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { PEAK, PEAK_C, summitAt, summitCraterR, peakSurface, type PeakResolved, type Flight, type Bench, type PeakRock } from "../../../../../shared/pois/jungle-layout";
import { block, merge, staticMesh, rock, drum, boxUVs, tint, crateMesh, noise3, place, type Geo } from "../_kit/jungle-geo";
import { stoneMaterial, pbr, crateTex, mulberry, heroStoneMaterial } from "../_kit/jungle-mat";
import { heroLOD } from "../_kit/jungle-hero";
import { bananaHand, bananaMaterial } from "../_kit/jungle-gold";
import { puffCloud } from "../_kit/jungle-water";
import { lavaMeltMaterial, lavaGlowMaterial, lavaRibbon } from "../_kit/jungle-lava";
import { rockProtos, rockInstances } from "../_kit/jungle-rocks";
import { TRAIL_DIMS } from "../../../../../shared/pois/jungle-layout";
import { buildHangingVines, type VineSpot } from "../_kit/jungle-vines";
import type { LodItem } from "../_kit/jungle-lod";

export interface PeakMats { rock: THREE.MeshStandardMaterial; wall: THREE.MeshStandardMaterial; bench: THREE.MeshStandardMaterial; stair: THREE.MeshStandardMaterial; rubble: THREE.MeshStandardMaterial; plateau: THREE.MeshStandardMaterial; melt: THREE.Material; glow: THREE.Material }
const C = PEAK_C;
const pol = (a: number, r: number): [number, number] => [C.x + Math.cos(a) * r, C.z + Math.sin(a) * r];

export function peakMaterials(ctx: WorldCtx): PeakMats {
  const moss = pbr(ctx, "moss"), lava = pbr(ctx, "lava-rock");
  // jointed dark lava rock (charcoal with warm chocolate undertones, warm-lit faces, moss on the ledges)
  const rock = stoneMaterial(lava, { scale: 6.5, triplanar: true, vertexColors: true, variation: 0.3, moss: 0.75, mossCover: 0.4, mossColor: "#7aa832", color: "#ffffff", normalScale: 1.15, lift: 0.5, liftTop: "#c4cfdc", liftBottom: "#9a9a9a", roughness: 0.92, detail: 0.7 }, moss);
  rock.color.setRGB(0.86, 0.88, 0.97);   // charcoal-grey with a faint warm undertone, never red-brown stumps
  // bench tops: dark volcanic soil + rock, broken moss patches (never a lime stripe — the planting carries the green)
  const bench = stoneMaterial(lava, { scale: 4.5, triplanar: true, vertexColors: true, variation: 0.45, moss: 0.8, mossCover: 0.38, mossColor: "#5e8c2c", normalScale: 1.0, lift: 0.4, detail: 0.6 }, moss);
  bench.color.setRGB(1.05, 0.95, 0.88);
  const plateau = stoneMaterial(lava, { scale: 5.0, triplanar: true, vertexColors: true, variation: 0.4, moss: 0.8, mossCover: 0.35, mossColor: "#7aa832", normalScale: 1.1, lift: 0.45, detail: 0.6 }, moss);
  plateau.color.setRGB(1.15, 1.05, 0.98);
  const stair = stoneMaterial(lava, { scale: 2.6, triplanar: true, vertexColors: true, variation: 0.25, moss: 0.35, mossCover: 0.3, mossColor: "#7aa336", normalScale: 1.1, lift: 0.5, detail: 0.8 }, moss);
  stair.color.setRGB(1.7, 1.55, 1.4);
  const rubble = stoneMaterial(lava, { scale: 2.4, triplanar: true, vertexColors: true, variation: 0.4, moss: 0.4, mossColor: "#6f9a2c", normalScale: 1.3, lift: 0.5, detail: 0.6 }, moss);
  rubble.color.setRGB(1.3, 1.15, 1.05);
  // the bench walls read as COLUMNAR BASALT: the same lava rock + vertical column joints along
  // every steep face (dark seams every ~1.3 m, per-column tone, a lit bevel beside each seam, staggered cross joints)
  const wall = stoneMaterial(lava, { scale: 6.5, triplanar: true, vertexColors: true, variation: 0.3, moss: 0.75, mossCover: 0.4, mossColor: "#7aa832", color: "#ffffff", normalScale: 1.15, lift: 0.5, liftTop: "#c4cfdc", liftBottom: "#9a9a9a", roughness: 0.92, detail: 0.7 }, moss);
  wall.color.setRGB(0.9, 0.9, 0.97); basaltColumns(wall);
  return { rock, wall, bench, stair, rubble, plateau, melt: lavaMeltMaterial(), glow: lavaGlowMaterial() };
}

/** stair treads: each step a stone block from its top down to below the previous nosing (a saw-tooth ramp; the solid support
 *  under it is hidden by the cheek rocks + the bench wall) */
export function flightGeo(f: Flight, rnd: () => number, tintHex = "#e6d8c8"): Geo[] {
  const out: Geo[] = [], dx = Math.cos(f.yaw), dz = -Math.sin(f.yaw);
  for (let i = 0; i < f.steps; i++) {
    // a CARVED flight: every step solid down to its collider's base (no saw-tooth underside), a rounded nosing lip
    const along = i * f.tread + f.tread / 2, top = f.y + f.rise * (i + 1), bot = f.base === null ? top - 0.55 : Math.min(f.base, top - 0.3);
    const hgt = top - bot, x = f.x + dx * along, z = f.z + dz * along;
    out.push(block(f.tread + 0.02, hgt, f.width, x, (top + bot) / 2, z, f.yaw, { bevel: Math.min(0.06, hgt / 4), uvScale: 1, tint: rnd() < 0.5 ? tintHex : "#d6c6b4", var: 0.05 }));
    out.push(block(0.12, 0.1, f.width - 0.08, x - dx * (f.tread / 2 - 0.02), top - 0.05, z - dz * (f.tread / 2 - 0.02), f.yaw, { bevel: 0.04, uvScale: 1, tint: "#efe2d0" }));
  }
  return out;
}

function benchTop(b: Bench, seed: number): Geo {
  const n = b.a.length, nr = 4, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j <= nr; j++) {
    const ri = b.rin[i] - 0.6, ro = b.rout[i] - 1.0, r = ri + (ro - ri) * j / nr, [x, z] = pol(b.a[i], r);
    pos.push(x, b.y + 0.05 + 0.16 * noise3(x * 0.35, seed, z * 0.35) + 0.07 * noise3(x * 1.3, seed + 3, z * 1.3) - (j === 0 ? 0.25 : 0), z);
  }
  for (let i = 0; i + 1 < n; i++) for (let j = 0; j < nr; j++) { const a = i * (nr + 1) + j, c = a + nr + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  if ((g.attributes.normal as THREE.BufferAttribute).getY(0) < 0) { const ix = g.index!.array as Uint32Array; for (let t = 0; t < ix.length; t += 3) { const s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; } g.computeVertexNormals(); }
  boxUVs(g, 1); tint(g, "#ffffff", 0.04); return g;
}

/** every resolved rock placement → instanced sculpted lava rock (two LODs per 72 m cell, hi casts) */
export function buildRocks(mats: PeakMats, root: THREE.Group, R: PeakResolved, lods: LodItem[]): THREE.InstancedMesh[] {
  const wall = R.rocks.filter((r) => r.kind === 0 || r.kind === 2), out = R.rocks.filter((r) => r.kind === 1), crag = R.rocks.filter((r) => r.kind === 3);
  const pl = (list: PeakRock[]) => list.map((r) => ({ x: r.x, y: r.y, z: r.z, sx: r.sx, sy: r.sy, sz: r.sz, ry: r.ry, proto: r.seed }));
  // ONE level per field, nothing switches: the cleft families are faceted polyhedra (≈ 50 triangles at EVERY res),
  // so hi / mid / far sets would be the same rocks — switches at 40 / 150 m only scale-fade identical geometry
  // (the bench walls "breathe") and drop the rocks' shadows past 40 m.
  // 3 623 rocks ≈ 170k triangles in ≤ 96 cell draws (128 m cells); a cell casts only while the camera is within 90 m of it
  // toggling castShadow is not a visibility switch — nothing fades or pops in colour
  const casters: THREE.InstancedMesh[] = [];
  const one = (list: PeakRock[], fam: "cleft" | "cleftout", name: string, mat: THREE.Material) => { const g = rockInstances(rockProtos(fam, 6, 7), pl(list), mat, name, undefined, { cell: 128, cast: true }); root.add(g); for (const c of g.children) casters.push(c as THREE.InstancedMesh); };
  one(wall, "cleft", "peak-rocks", mats.wall);
  one(out, "cleftout", "peak-outcrops", mats.rock);
  one(crag, "cleft", "peak-crag-blocks", mats.rock);
  void lods;
  return casters;
}

/** the terraced fan: bench tops + flights (treads) + landing slabs + rubble + creepers */
export function buildFan(ctx: WorldCtx, mats: PeakMats, root: THREE.Group, R: PeakResolved) {
  const rnd = mulberry(606), tops: Geo[] = [], steps: Geo[] = [], rubble: Geo[] = [];
  for (const b of R.benches) {
    if (b.a.length < 2) continue;
    tops.push(benchTop(b, b.k * 13 + 1));
    // rubble + fallen blocks on every bench top (clear of the stair strip on the axis)
    const L = (b.a[b.a.length - 1] - b.a[0]) * b.rout[Math.floor(b.a.length / 2)];
    for (let i = 0; i < Math.round(L / 3.2); i++) {
      const j = Math.floor(rnd() * (b.a.length - 1)), depth = b.rout[j] - b.rin[j], rr = b.rin[j] + 0.6 + rnd() * Math.max(0.5, depth - 2.2), [x, z] = pol(b.a[j], rr);
      if (Math.abs(b.a[j] - PEAK.fan.c) * rr < 4.5) continue;
      const sz = rnd() < 0.2 ? 0.8 + rnd() * 0.7 : 0.25 + rnd() * 0.45;
      rubble.push(rock(sz, sz * 0.62, sz * (0.8 + rnd() * 0.4), { seed: 700 + i + b.k * 31, angular: true, tint: rnd() < 0.5 ? "#8f7c6c" : "#a08a78" }).applyMatrix4(new THREE.Matrix4().makeRotationY(rnd() * 6).setPosition(x, b.y + sz * 0.12, z)));
    }
  }
  for (const f of R.flights) steps.push(...flightGeo(f, rnd));
  for (const sl of R.slabs) { const y0 = Math.max(sl.base, sl.y - 1.2); steps.push(block(sl.hx * 2, sl.y - y0, sl.hz * 2, sl.x, (sl.y + y0) / 2, sl.z, sl.yaw, { bevel: 0.09, uvScale: 1, tint: "#dccbb8", var: 0.05 })); }
  // rock shoulders filling the slot between a flight and its wall (layout fills; they collide): dark lava blocks, flush with
  // the lower tread of each pair, drawn 3 m deep (the rest is buried in the flight's support / the wall)
  const shoulders: Geo[] = [];
  for (const sl of R.fills ?? []) { const y0 = Math.max(sl.base, sl.y - 3); shoulders.push(block(sl.hx * 2 + 0.04, sl.y - y0, sl.hz * 2, sl.x, (sl.y + y0) / 2, sl.z, sl.yaw + (rnd() - 0.5) * 0.02, { bevel: 0.12, uvScale: 1, tint: rnd() < 0.5 ? "#8f7c6c" : "#a08a78", var: 0.08 })); }
  if (shoulders.length) root.add(staticMesh(merge(shoulders), mats.rubble, "peak-fan-shoulders")!);
  // creepers hanging over the bench fronts (not over the stair strip on the axis): short, clumped, a few per bench
  const vines: VineSpot[] = [];
  for (const b of R.benches) for (let j = 1; j + 1 < b.a.length; j += 2) {
    const a = b.a[j], ro = b.rout[j]; if (Math.abs(a - PEAK.fan.c) * ro < 9 || rnd() < 0.55) continue;
    const [x, z] = pol(a, ro + 0.25); vines.push({ x, y: b.y + 0.4, z, w: 1.6 + rnd() * 2.2, len: (b.y - b.y1) * (0.25 + rnd() * 0.45), ry: Math.PI / 2 - a });
  }
  buildHangingVines(ctx, root, vines, 1, { oneSided: true, push: 0.3, out: 0.3 });
  root.add(staticMesh(merge(tops), mats.bench, "peak-fan-benches")!, staticMesh(merge(steps), mats.stair, "peak-fan-stairs")!, staticMesh(merge(rubble), mats.rubble, "peak-fan-rubble")!);
}

/** the rim plateau: a black-rock ring road on the crest (noisy top, mossy patches) */
export function buildRim(mats: PeakMats, root: THREE.Group, R: PeakResolved) {
  const P = R.rim, n = P.a.length, nr = 5, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) { const k = i % n, a = i === n ? P.a[0] + Math.PI * 2 : P.a[k];
    for (let j = 0; j <= nr; j++) { const r = P.rin[k] + 0.4 + (P.rout[k] - P.rin[k] - 0.8) * j / nr, [x, z] = pol(a, r); pos.push(x, P.y[k] + 0.04 + 0.14 * noise3(x * 0.3, 7, z * 0.3) + 0.06 * noise3(x * 1.4, 9, z * 1.4) - (j === 0 || j === nr ? 0.2 : 0), z); } }
  for (let i = 0; i < n; i++) for (let j = 0; j < nr; j++) { const a = i * (nr + 1) + j, c = a + nr + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  let up = 0; const nrm = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < nrm.count; i += 5) up += nrm.getY(i);
  if (up < 0) { const ix = g.index!.array as Uint32Array; for (let t = 0; t < ix.length; t += 3) { const s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; } g.computeVertexNormals(); }
  boxUVs(g, 1); tint(g, "#ffffff", 0.03);
  root.add(staticMesh(g, mats.plateau, "peak-rim-plateau")!);
}

/** crest totems (grey-brown carved stone, no red cracks) on low carved plinths; foreground totems on the crag */
export async function buildTotems(ctx: WorldCtx, mats: PeakMats, root: THREE.Group, R: PeakResolved) {
  const plinths: Geo[] = [], rnd = mulberry(4321), cache = new Map<THREE.Texture | null, THREE.MeshStandardMaterial>();
  const stone = (bm: THREE.MeshStandardMaterial) => { let m = cache.get(bm.map); if (!m) { m = heroStoneMaterial(pbr(ctx, "boulder"), bm.map, { scale: 3.2, bakeMix: 0.95, moss: 0.45, mossCover: 0.4, mossColor: "#79a836", variation: 0.25, lift: 0.4, liftTop: "#c6d4e4", liftBottom: "#b09a82", detail: 0.6 }, pbr(ctx, "moss")); m.color.setRGB(0.78, 0.7, 0.62); cache.set(bm.map, m); } return m; };
  for (const t of R.totems) {
    if (t.plinth) {
      const [pr, y0, y1] = t.plinth;
      // carved two-step cap on the lava-block bastion (the blocks come from the layout rocks)
      plinths.push(drum(pr * 0.98, 0.55, t.x, y1 - 1.05, t.z, 14, { tint: "#bca690", uvScale: 1 }));
      plinths.push(drum(pr * 0.86, 0.5, t.x, y1 - 0.5, t.z, 14, { tint: "#d0bca6", uvScale: 1 }));
      for (let k = 0; k < 4; k++) { const a = rnd() * 6.28, d = pr * 0.9 + rnd() * 1.2, sz = 0.35 + rnd() * 0.5; rubble(plinths, t.x + Math.cos(a) * d, y1 - 0.9, t.z + Math.sin(a) * d, sz, 900 + k + Math.round(t.x)); }
    }
    // the 12k → 2.5k swap at 250 m and INSTANT (noCull: the engine fades a switch by scale — an 18 m totem would shrink
    // and regrow); at 250 m the two meshes share the silhouette
    const lod = await heroLOD(ctx, "totem", t.x, t.y - 0.05, t.z, { height: t.h, yaw: t.yaw, name: "peak-totem", lodDist: 250, material: stone });
    lod.userData.noCull = true; root.add(lod);
  }
  root.add(staticMesh(merge(plinths), mats.stair, "peak-plinths")!);
}
function rubble(out: Geo[], x: number, gy: number, z: number, sz: number, seed: number) {
  out.push(rock(sz, sz * 0.7, sz, { seed, angular: true, tint: "#9c8674" }).applyMatrix4(new THREE.Matrix4().makeRotationY(seed * 1.7).setPosition(x, gy + sz * 0.2, z)));
}

/** lava seams: HDR melt ribbon + a 2× wider orange glow skirt on the rock either side + a pool at the foot of each seam */
export function buildLava(ctx: WorldCtx, mats: PeakMats, root: THREE.Group, R: PeakResolved) {
  const h = (x: number, z: number) => ctx.terrain.height(x, z);
  const melt: Geo[] = [], glow: Geo[] = [];
  const surf = (x: number, z: number) => peakSurface(R, h, x, z);
  for (const s of R.seams) {
    const pts = s.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), g = s.fan ? surf : h;   // fan seams run over the benches + fall off each wall
    melt.push(lavaRibbon(pts, s.w, g, 0.18, 1));
    glow.push(lavaRibbon(pts, (s.w + 5) * 1.7, g, 0.5, 0));
    const end = pts[pts.length - 1], pr = s.w * 1.5;
    const pool = new THREE.CircleGeometry(pr, 24).rotateX(-Math.PI / 2);
    const pp = pool.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pp.count; i++) { const x = pp.getX(i) + end.x, z = pp.getZ(i) + end.z; pp.setXYZ(i, x, h(x, z) + 0.2, z); }
    radialUV(pool, pr); pool.computeVertexNormals(); melt.push(pool);
  }
  const mm = new THREE.Mesh(merge(melt)!, mats.melt); mm.name = "peak-lava"; mm.receiveShadow = false; mm.castShadow = false; mm.userData.castShadow = false; mm.userData.farShadow = false;
  const gm = new THREE.Mesh(merge(glow)!, mats.glow); gm.name = "peak-lava-glow"; gm.renderOrder = 2; gm.castShadow = false; gm.userData.castShadow = false; gm.userData.farShadow = false;
  root.add(mm, gm);
}

/** pool uv: x = 0.5 + 0.5·(radius / R) (the melt shader's "across" → hot centre, crusted rim), y = metres round */
function radialUV(g: THREE.BufferGeometry, R: number) {
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); uv.setXY(i, 0.5 + 0.5 * Math.min(1, r / R), Math.atan2(z, x) * R); }
}
/** the SUMMIT cinder cone (a dark, finely fluted cone behind the totem crown with a smoking crater): one lathe
 *  mesh from a skirt tucked under the plateau's inner edge up to a rounded lip, the crater's inner wall down to a crusted,
 *  dimly glowing vent. Shape = shared summitAt / summitCraterR (the colliders use the same functions). */
export function buildSummit(ctx: WorldCtx, root: THREE.Group, R: PeakResolved) {
  const S = R.summit, NA = 200, pos: number[] = [], col: number[] = [], idx: number[] = [];
  // profile samples (t along the flank, then lip + crater wall + floor)
  const tS: number[] = []; for (let i = 0; i <= 4; i++) tS.push(-0.12 + i * 0.03); for (let i = 1; i <= 40; i++) tS.push(i / 40);
  const nWall = 10, prof = tS.length + 2 + nWall + 2;
  const ph = Array.from({ length: 7 }, (_, i) => i * 1.7 + 0.3), rnd = mulberry(5151);
  const ridgeAmp = Array.from({ length: NA }, () => 1.1 + rnd() * 1.2);   // bold ridges + deep gullies: never a smooth fluted cone
  const fl = (a: number, t: number) => { // fluting: fine sharp ridges + a few deep gullies, fading to the lip and the foot
    const k = Math.sin(Math.PI * Math.min(1, Math.max(0, t)) ** 0.8) ** 0.7;
    const r1 = 1 - Math.abs(Math.sin(a * 23 + ph[0] + 0.6 * Math.sin(a * 3 + t * 2))), r2 = 1 - Math.abs(Math.sin(a * 41 + ph[1] + 0.9 * Math.sin(a * 5 - t * 3)));
    const g = Math.max(0, Math.sin(a * 7 + ph[2] + 0.5 * Math.sin(a * 2 + t * 1.5)) - 0.45) * 2.4, g2 = Math.max(0, Math.sin(a * 13 + ph[3] - t * 2) - 0.7) * 3;
    return k * (1.3 * r1 * r1 + 0.6 * r2 * r2 - 2.6 * g * g - 1.2 * g2 * g2 + 0.7 * noise3(Math.cos(a) * 6, t * 5, Math.sin(a) * 6));
  };
  const c = new THREE.Color();
  for (let i = 0; i <= NA; i++) {
    const a = (i % NA) / NA * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
    const push = (r: number, y: number, shade: number, warm = 0) => { pos.push(PEAK_C.x + cx * r, y, PEAK_C.z + sz * r); c.setRGB(shade * (1 + warm * 0.25), shade * (1 + warm * 0.05), shade * (1 - warm * 0.2)); col.push(c.r, c.g, c.b); };
    for (const t of tS) {
      const [r, y] = summitAt(R, a, t), d = t < 0 ? 0 : fl(a, t) * ridgeAmp[i % NA] * 0.9;
      push(r + d, y + (t > 0 && t < 1 ? 0.25 * noise3(cx * 9, y * 0.08, sz * 9) : 0), 0.74 + 0.16 * Math.max(-1.5, Math.min(1, d)) + 0.22 * Math.max(0, t - 0.8) / 0.2, t > 0.85 ? (t - 0.85) * 3 : 0);
    }
    // the lip (rounded, lighter weathered rim) + the crater's inner wall (sooty, darker down) + the vent floor
    // a RIDGED, broken rim: jagged crests and notches round the lip (lighter weathered stone on the crests)
    { const jag = 1.4 * Math.max(0, noise3(cx * 4.2, 3.1, sz * 4.2)) + 0.9 * Math.abs(Math.sin(a * 9 + ph[4])) - 0.6 * Math.max(0, Math.sin(a * 3 + ph[5]) - 0.7) * 4;
      push(S.r1 - 0.6, S.y1 + 0.5 + jag, 1.1 + jag * 0.08, 0.6); push(S.r1 - 1.8, S.y1 - 0.2 + jag * 0.5, 0.92, 0.3); }
    for (let k = 1; k <= nWall; k++) { const y = S.y1 - 0.8 - (S.y1 - 0.8 - S.floor) * k / nWall, rr = summitCraterR(R, y) + 0.35 * noise3(cx * 7, y * 0.5, sz * 7); push(rr, y, 0.55 - 0.25 * k / nWall, -0.2); }
    push(S.rf * 0.55, S.floor - 0.05, 0.3); push(0.01, S.floor - 0.1, 0.28);
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j + 1 < prof; j++) { const a0 = i * prof + j, b0 = (i + 1) * prof + j; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  { let up = 0; const nr = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < NA; i += 7) up += nr.getY(i * prof + 20); // outward = up on the flank
    if (up < 0) { const ix = g.index!.array as Uint32Array; for (let t = 0; t < ix.length; t += 3) { const q = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = q; } g.computeVertexNormals(); } }
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  // dark cinder (warm charcoal-brown), fine grain, faint moss only low on ledges, lifted shade (it is a landmark from afar)
  const m = stoneMaterial(pbr(ctx, "boulder"), { scale: 9, triplanar: true, vertexColors: true, variation: 0.35, moss: 0.3, mossCover: 0.25, mossColor: "#6f9a36", normalScale: 1.3, lift: 0.4, liftTop: "#b8c6dc", liftBottom: "#a89484", roughness: 0.95, detail: 0.5 }, pbr(ctx, "moss"));
  m.color.setRGB(0.42, 0.36, 0.33);
  const mesh = staticMesh(g, m, "peak-summit")!; mesh.castShadow = true; root.add(mesh);
  // the vent: a crusted, dimly glowing lava plug on the crater floor
  const vent = new THREE.CircleGeometry(S.rf * 0.75, 32).rotateX(-Math.PI / 2); radialUV(vent, S.rf * 0.75); vent.translate(PEAK_C.x, S.floor + 0.08, PEAK_C.z);
  const vm = new THREE.Mesh(vent, lavaMeltMaterial({ crust: 0.8 })); vm.name = "peak-summit-vent"; vm.userData.castShadow = false; vm.userData.farShadow = false; root.add(vm);
}

/** thin white smoke from the summit crater (a wisp: a narrow column that leans and widens up high) */
export function buildSmoke(root: THREE.Group, R: PeakResolved) {
  const x = R.apex[0], z = R.apex[2], y = R.summit.floor;
  // a THICK column: a dense lit core from the vent + a billowing upper plume that leans downwind
  root.add(puffCloud(new THREE.Vector3(x, y + 26, z), { count: 70, color: "#fbf9f5", size: [9, 20], opacity: 0.82, rise: 14, drift: 1.6, spread: [3.5, 16, 3.5], life: 12, power: 1.1, lit: true, grow: 1.8, dir: [0.08, 1, 0.03] }));
  root.add(puffCloud(new THREE.Vector3(x + 12, y + 85, z + 5), { count: 40, color: "#f6f4f0", size: [18, 36], opacity: 0.55, rise: 6, drift: 7, spread: [9, 18, 7], life: 22, power: 1.3, lit: true, grow: 1.6, dir: [0.5, 1, 0.2] }));

}

/** the lookout crag: jointed blocks (buildRocks, kind 3) + mossy top slabs + the spiral stair treads + landings, foreground
 *  dressing (crate of bananas, rubble, a glowing fissure) */
export function buildCrag(ctx: WorldCtx, mats: PeakMats, root: THREE.Group, R: PeakResolved) {
  const cg = R.crag, rnd = mulberry(4444), slab: Geo[] = [], rocks: Geo[] = [], steps: Geo[] = [];
  const L = cg.ledge;
  // mossy top: an irregular cluster of flat slabs (not a disc): the plateau + the ledge
  const topSlabs = (cx: number, cz: number, rr: number, y: number, n: number, keep: (x: number, z: number) => boolean) => {
    for (let k = 0; k < n; k++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * (rr - 1.8), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (!keep(x, z)) continue;
      const w = 2.6 + rnd() * 2.4, dd = 2.2 + rnd() * 2.0, th = 0.5 + rnd() * 0.3; slab.push(block(w, th, dd, x, y - th / 2 + (rnd() - 0.5) * 0.12, z, rnd() * 6.28, { bevel: 0.14, uvScale: 1, tint: rnd() < 0.5 ? "#d9c3ac" : "#c8b29c", var: 0.06, rx: (rnd() - 0.5) * 0.05, rz: (rnd() - 0.5) * 0.05 })); }
    // the base under the slabs: an irregular, faceted rock pad (never a round disc)
    { const n = 13, base = new THREE.CylinderGeometry(1, 1, 0.9, n, 1), p = base.attributes.position as THREE.BufferAttribute, jr = Array.from({ length: n + 1 }, () => 0.78 + rnd() * 0.24);
      for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = Math.round(((a / (Math.PI * 2)) + 1) % 1 * n) % n, l = Math.hypot(p.getX(i), p.getZ(i)); if (l < 1e-3) continue; const r = (rr - 0.4) * jr[k]; p.setXYZ(i, p.getX(i) / l * r, p.getY(i) + (p.getY(i) > 0 ? (rnd() - 0.5) * 0.25 : 0), p.getZ(i) / l * r); }
      const f = base.toNonIndexed(); f.computeVertexNormals(); f.translate(cx, y - 0.58, cz); boxUVs(f, 1); tint(f, "#b59f89"); slab.push(f); base.dispose(); }
  };
  topSlabs(cg.x, cg.z, cg.rTop, cg.top, 26, () => true);
  topSlabs(L.x, L.z, L.r, L.y, 18, (x, z) => Math.hypot(x - cg.x, z - cg.z) > cg.rTop - 0.5);
  // skirt of big fallen blocks round the foot
  for (let k = 0; k < 26; k++) { const a = rnd() * 6.28, d = cg.rBase + 1 + rnd() * 6, x = cg.x + Math.cos(a) * d, z = cg.z + Math.sin(a) * d, sz = 1.2 + rnd() * 2.2; rocks.push(rock(sz, sz * 0.8, sz, { seed: 1000 + k, angular: true, tint: "#8c7666" }).applyMatrix4(new THREE.Matrix4().makeRotationY(rnd() * 6).setPosition(x, ctx.terrain.height(x, z) + sz * 0.15, z))); }
  // creepers down some tier faces (clumped, not over the stair side), rubble on the tier rings, plateau + ledge rubble
  { const vs: VineSpot[] = [], back = Math.atan2(cg.z - C.z, cg.x - C.x);
    cg.tiers.forEach(([rr, yTop], i) => {
      const n = Math.round(rr * 6.28 / 6);
      for (let k = 0; k < n; k++) { const a = (k + rnd() * 0.5) / n * 6.283; if (Math.abs(Math.atan2(Math.sin(a - back), Math.cos(a - back))) < 0.9) continue; if (rnd() < 0.45) continue;
        vs.push({ x: cg.x + Math.cos(a) * (rr + 0.3), y: yTop + 0.3, z: cg.z + Math.sin(a) * (rr + 0.3), w: 1.6 + rnd() * 2.2, len: 3 + rnd() * (i === 0 ? 10 : 7), ry: Math.PI / 2 - a }); }
      if (i < cg.tiers.length - 1) for (let k = 0; k < 10; k++) { const a = rnd() * 6.28, d = cg.tiers[i + 1][0] + 0.8 + rnd() * (rr - cg.tiers[i + 1][0] - 1.6), sz = 0.4 + rnd() * 0.8; rocks.push(rock(sz, sz * 0.7, sz, { seed: 1300 + k + i * 20, angular: true, tint: "#8c7866" }).applyMatrix4(new THREE.Matrix4().makeRotationY(rnd() * 6).setPosition(cg.x + Math.cos(a) * d, yTop + sz * 0.1, cg.z + Math.sin(a) * d))); }
    });
    buildHangingVines(ctx, root, vs, 1, { oneSided: true, push: 0.3, out: 0.3 }); }
  for (let k = 0; k < 14; k++) { const a = rnd() * 6.28, d = 2 + rnd() * (cg.rTop - 3), sz = 0.3 + rnd() * 0.6; rocks.push(rock(sz, sz * 0.7, sz, { seed: 1100 + k, angular: true, tint: "#94806e" }).applyMatrix4(new THREE.Matrix4().makeRotationY(rnd() * 6).setPosition(cg.x + Math.cos(a) * d, cg.top + sz * 0.12, cg.z + Math.sin(a) * d))); }
  for (let k = 0; k < 14; k++) { const a = rnd() * 6.28, d = 1.5 + rnd() * (L.r - 2.5), sz = 0.4 + rnd() * 0.9; rocks.push(rock(sz, sz * 0.7, sz, { seed: 1200 + k, angular: true, tint: "#8c7866" }).applyMatrix4(new THREE.Matrix4().makeRotationY(rnd() * 6).setPosition(L.x + Math.cos(a) * d, L.y + sz * 0.12, L.z + Math.sin(a) * d))); }
  for (const f of cg.flights) steps.push(...flightGeo(f, rnd, "#d9c7b4"));
  root.add(staticMesh(merge(slab), mats.bench, "peak-crag-top")!, staticMesh(merge(rocks), mats.rubble, "peak-crag-rocks")!, staticMesh(merge(steps), mats.stair, "peak-crag-steps")!);
  // crate of bananas
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex(), roughness: 0.82 });
  root.add(crateMesh(1.1, crateMat, R.crate[0], R.crate[1], R.crate[2], R.crate[3]));
  const bn: Geo[] = []; for (let k = 0; k < 2; k++) bn.push(bananaHand(4, 0.36, R.crate[0] + (k - 0.5) * 0.3, R.crate[1] + 0.93 + k * 0.06, R.crate[2] + (rnd() - 0.5) * 0.3, R.crate[3] + 0.4 + k * 1.1, 0.2 + k * 0.15, 77 + k));
  root.add(staticMesh(merge(bn), bananaMaterial(), "peak-bananas")!);
  // a glowing fissure across the ledge (a foreground lava seam)
  { const toCone = Math.atan2(C.z - cg.z, C.x - cg.x), a = toCone + 0.35, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12 - 0.5, d = t * (L.r * 1.9), w = 0.9 * Math.sin(t * 9.3) + 0.4 * Math.sin(t * 23.0); pts.push(new THREE.Vector3(L.x + Math.cos(a) * d - Math.sin(a) * w, L.y + 0.03, L.z + Math.sin(a) * d + Math.cos(a) * w)); }
    const fl = new THREE.Mesh(lavaRibbon(pts, 0.9, () => L.y + 0.02, 0.02, 1), mats.melt); fl.name = "peak-crag-fissure"; fl.userData.castShadow = false; root.add(fl);
    const gl = new THREE.Mesh(lavaRibbon(pts, 7, () => L.y + 0.02, 0.04, 0), mats.glow); gl.name = "peak-crag-fissure-glow"; gl.renderOrder = 2; gl.userData.castShadow = false; root.add(gl); }
}

/** columnar-basalt joints on the steep faces of a stone material (needs stoneMaterial's vJWorldPos / vJWorldNormal) */
function basaltColumns(m: THREE.MeshStandardMaterial) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      { vec3 bn = normalize(vJWorldNormal); float side = 1.0 - smoothstep(0.42, 0.72, abs(bn.y));
        if (side > 0.01) {
          vec2 tg = normalize(vec2(-bn.z, bn.x) + vec2(1e-4));
          float u = dot(vJWorldPos.xz, tg) / 1.3, ci = floor(u), fu = fract(u);
          float h1 = fract(sin(ci * 12.9898 + 4.1) * 43758.5453), h2 = fract(sin(ci * 78.233 + 1.7) * 24634.6345);
          float seam = smoothstep(0.0, 0.06, fu) * smoothstep(1.0, 0.94, fu);
          float cy = fract((vJWorldPos.y + h1 * 5.0) / (2.4 + h2 * 2.2)), cross = smoothstep(0.0, 0.035, cy) * smoothstep(1.0, 0.975, cy);
          float bevel = smoothstep(0.06, 0.12, fu) * (1.0 - smoothstep(0.12, 0.26, fu));
          float facet = mix(0.86, 1.08, smoothstep(0.2, 0.8, fu)) * (0.82 + 0.3 * h1);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(facet * mix(0.28, 1.0, seam * cross) + bevel * 0.22), side);
        } }`);
  };
  m.customProgramCacheKey = () => `${prevKey ? prevKey() : ""}|basalt`;
  m.needsUpdate = true;
}

/** the approach trails: carved stone treads (a bevelled slab with a lighter worn nosing) on a rough lava-rock
 *  footing down to the ground — exactly their colliders (shared trailBoxes) */
export function buildTrails(mats: PeakMats, root: THREE.Group, R: PeakResolved): LodItem[] {
  // the trails are not ONE merged mesh cut at 230 m from the centre of ALL trails (−390, 139, −391; 237 m radius):
  // standing at a trail's foot you are 236 m from that centre, so the 48 m stilted flight would pop in 15 m in front
  // of you. Instead: per 96 m cell, the bevelled hi treads/footings within TRAIL_HI_M of the cell's box, and
  // everywhere else a plain-box lo copy (same steps, 12-tri boxes, ~26k tris for all 1092 steps) that is RESIDENT —
  // the trails never appear or vanish, they only gain bevels.
  const rnd = mulberry(8181), T = TRAIL_DIMS, CELL = 96;
  const cells = new Map<string, { treads: Geo[]; footing: Geo[]; loT: Geo[]; loF: Geo[]; box: THREE.Box3 }>();
  const plain = (w: number, h: number, d: number, x: number, y: number, z: number, ry: number, hex: string) => {
    const g = new THREE.BoxGeometry(w, h, d); g.deleteAttribute("uv"); return tint(boxUVs(place(g, x, y, z, ry), 1), hex, 0.05);
  };
  for (const trail of R.trails ?? []) for (const s of trail) {
    const key = `${Math.floor(s.x / CELL)},${Math.floor(s.z / CELL)}`;
    let c = cells.get(key); if (!c) cells.set(key, c = { treads: [], footing: [], loT: [], loF: [], box: new THREE.Box3() });
    const th = Math.min(0.32, s.y - s.base), dx = Math.cos(s.yaw), dz = -Math.sin(s.yaw), tHex = rnd() < 0.5 ? "#e6d8c8" : "#d6c6b4";
    c.treads.push(block(T.len, th, T.width, s.x, s.y - th / 2, s.z, s.yaw + (rnd() - 0.5) * 0.02, { bevel: 0.06, uvScale: 1, tint: tHex, var: 0.05 }));
    c.treads.push(block(0.1, 0.08, T.width - 0.1, s.x + dx * (T.len / 2 - 0.05), s.y - 0.04, s.z + dz * (T.len / 2 - 0.05), s.yaw, { bevel: 0.03, uvScale: 1, tint: "#efe2d0" }));
    c.loT.push(plain(T.len, th, T.width, s.x, s.y - th / 2, s.z, s.yaw, tHex));
    if (s.y - th - s.base > 0.05) { const fHex = rnd() < 0.5 ? "#8f7c6c" : "#a08a78";
      c.footing.push(block(T.len, s.y - th - s.base, T.width, s.x, (s.y - th + s.base) / 2, s.z, s.yaw, { bevel: 0.1, uvScale: 1, tint: fHex, var: 0.08 }));
      c.loF.push(plain(T.len, s.y - th - s.base, T.width, s.x, (s.y - th + s.base) / 2, s.z, s.yaw, fHex)); }
    c.box.expandByPoint(new THREE.Vector3(s.x - 1.2, s.base, s.z - 1.2)).expandByPoint(new THREE.Vector3(s.x + 1.2, s.y, s.z + 1.2));
  }
  const lods: LodItem[] = [];
  for (const [key, c] of cells) {
    const hi = new THREE.Group(), lo = new THREE.Group(); hi.name = `peak-trail-hi-${key}`; lo.name = `peak-trail-lo-${key}`;
    for (const m of [staticMesh(merge(c.treads), mats.stair, "peak-trail-treads"), staticMesh(merge(c.footing), mats.rubble, "peak-trail-footing")]) if (m) hi.add(m);
    for (const m of [staticMesh(merge(c.loT), mats.stair, "peak-trail-lo-treads"), staticMesh(merge(c.loF), mats.rubble, "peak-trail-lo-footing")]) if (m) lo.add(m);
    root.add(hi, lo);
    const box = c.box;
    lods.push({ o: hi, test: (cam) => box.distanceToPoint(cam) < TRAIL_HI_M }, { o: lo, test: (cam) => box.distanceToPoint(cam) >= TRAIL_HI_M });
  }
  return lods;
}
/** the trails' bevelled hi cells show within this distance of the cell (the lo copy is the same steps, unbevelled) */
const TRAIL_HI_M = 140;
