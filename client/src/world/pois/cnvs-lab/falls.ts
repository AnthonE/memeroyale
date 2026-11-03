// CNVS LAB — the waterfall backdrop: three free-fall sheets off the NW plateau lip (≈56 m)
// where its face looks at the compound, dropping ~22 m to pad level into a shallow pool, with spray + drifting mist.
// Reuses the poi-jungle water kit (fallsSheet / fallsMaterial / poolSurface / puffCloud). Outside the fence, visual only.
// Each sheet's launch speed is fitted at build time so the arc clears the terrain face by ≥ 0.6 m all the way down.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { WorldCtx } from "../../../engine/engine";
import { bindWaterTime, fallsMaterial, fallsSheet, puffCloud, poolSurface, waterMaterial } from "../_kit/jungle-water";
import { MASSIF_FALLS, MASSIF_POOLS, CX, CZ, G } from "../../../../../shared/pois/cnvs-lab";

export interface FallSpec { x: number; z: number; w: number; dir: [number, number]; seed: number }
/** world lip points on the plateau edge (sampled from the terrain) + outflow direction */
export const FALL_LIPS: FallSpec[] = [
  { x: 79.0, z: -554.5, w: 9.5, dir: [0.9, 0.44], seed: 3 },
  { x: 75.0, z: -546.5, w: 4.2, dir: [0.8, 0.6], seed: 9 },
  { x: 88.6, z: -569.0, w: 4.6, dir: [1, 0.1], seed: 5 },
];
export const POOL = { x: 96.5, z: -551.5, rx: 9, rz: 11 };

const named = <T extends THREE.Object3D>(n: string, o: T): T => { o.name = n; return o; };
export async function buildFalls(ctx: WorldCtx, root: THREE.Object3D) {
  bindWaterTime(ctx);
  const T = ctx.terrain;
  const fMat = fallsMaterial(), veil = fallsMaterial(0.45); void veil;
  let minG = Infinity;
  for (let a = 0; a < 16; a++) minG = Math.min(minG, T.height(POOL.x + Math.cos(a) * 4, POOL.z + Math.sin(a) * 4));
  const level = minG + 0.3;
  let built = 0;
  for (const f of FALL_LIPS) {
    await ctx.yield();
    const dir = new THREE.Vector3(f.dir[0], 0, f.dir[1]).normalize();
    const topY = T.height(f.x - dir.x * 1.5, f.z - dir.z * 1.5) + 0.2;
    // fit v0: smallest speed whose ballistic arc stays ≥ 0.6 m off the face until it is within 1 m of the foot level
    const bottom = Math.max(level, T.height(f.x + dir.x * 16, f.z + dir.z * 16));
    // (the terrain smooths the NW plateau into a slope — a lip with < 4 m of drop is no
    // waterfall (and its ballistic fit goes NaN): skip it; the lab's own massif cascade carries the falls then)
    if (topY - bottom < 4) continue;
    built++;
    let v0 = 3;
    for (; v0 < 12; v0 += 0.25) {
      let ok = true;
      for (let t = 0.05; t < 4; t += 0.05) {
        const y = topY - 1.6 * t - 4.9 * t * t; if (y < bottom + 1) break;
        const x = f.x + dir.x * (0.9 + v0 * t), z = f.z + dir.z * (0.9 + v0 * t);
        if (T.height(x, z) > y - 0.6) { ok = false; break; }
      }
      if (ok) break;
    }
    const main = fallsSheet(new THREE.Vector3(f.x, topY, f.z), bottom, f.w, dir, fMat, { v0, seed: f.seed, spread: 0.4, lip: 0.5 });
    main.mesh.name = "lab:falls-water"; root.add(main.mesh);
    const big = f.w > 4;
    if (!big) continue;
    // (perf: one veil + one set of spray / foam / mist per big fall — the two small ones share the big one's mist)
    const vl = fallsSheet(new THREE.Vector3(f.x - dir.x * 0.3, topY, f.z - dir.z * 0.3), bottom, f.w * 1.2, dir, veil, { v0: v0 * 0.9, seed: f.seed + 20, spread: 0.7, cols: 8 });
    vl.mesh.name = "lab:falls-water-veil"; root.add(vl.mesh);
    await ctx.yield();
    const imp = main.impact;
    root.add(named("lab:falls-puff", puffCloud(new THREE.Vector3(imp.x, bottom + 0.8, imp.z), { count: 60, color: "#ffffff", size: [0.3, 0.9], opacity: 0.85, rise: 4, drift: 1.6, spread: [f.w * 0.5, 0.6, f.w * 0.5], life: 1.4, lit: true, power: 1.6, grow: 0.3 })));
    root.add(named("lab:falls-puff", puffCloud(new THREE.Vector3(imp.x, bottom + 0.4, imp.z), { count: 22, color: "#f6fbff", size: [0.9, 1.8], opacity: 0.55, rise: 0.6, drift: 1.2, spread: [f.w * 0.6, 0.15, f.w * 0.6], life: 1.8, lit: true, power: 1.3 })));
  }
  await ctx.yield();
  // one drifting mist bank across all three plunge points
  if (built) root.add(named("lab:falls-puff", puffCloud(new THREE.Vector3(POOL.x - 1, POOL.z > 0 ? 0 : 0, POOL.z).setY(35.5), { count: 34, color: "#f3f9ff", size: [5, 11], opacity: 0.2, rise: 3, drift: 2.5, spread: [8, 3, 12], life: 7, power: 1.5, lit: true })));
  // the west massif's falls: 2-3 slender, continuous sheets straight down the plumb walls under the
  // lips (shared MASSIF_FALLS: off the crown shoulders, ~24 m) into a misty plunge pool per rock (MASSIF_POOLS); each
  // fall has a thin wider veil behind it, an impact spray, and every pool a low drifting mist bank + foam rings
  { const lvl = G + 0.25, sheets: THREE.BufferGeometry[] = [];
    const pw = waterMaterial({ clarity: 0.75, foamScale: 1.35, alpha0: 0.55, glow: 0.35, shallow: "#5fa58e", mid: "#2f6f68", deep: "#163c3f", impacts: MASSIF_FALLS.slice(0, 4).map((f) => [CX + f.u + f.dir[0] * 1.6, CZ + f.v + f.dir[1] * 1.6, 2.2] as [number, number, number]) });
    for (const [i, f] of MASSIF_FALLS.entries()) {
      await ctx.yield();
      const dir = new THREE.Vector3(f.dir[0], 0, f.dir[1]).normalize();
      const sh = fallsSheet(new THREE.Vector3(CX + f.u, f.top - 0.15, CZ + f.v), f.bottom, f.w, dir, fMat, { v0: 1.1, seed: 30 + i, spread: 0.22, lip: 0.08, back: 0.9, segs: 40 });
      sheets.push(sh.mesh.geometry);
      // (no second veil sheet per fall — a full-height transparent layer doubled the falls' overdraw)
      root.add(named("lab:falls-puff", puffCloud(new THREE.Vector3(sh.impact.x, f.bottom + 0.5, sh.impact.z), { count: 22, color: "#ffffff", size: [0.35, 0.85], opacity: 0.8, rise: 2.8, drift: 1.3, spread: [f.w * 0.5, 0.45, f.w * 0.5], life: 1.2, lit: true, power: 1.6, grow: 0.3 })));
    }
    // (the sheets share one material → one draw; the pools too)
    if (sheets.length) { const g = mergeGeometries(sheets, false); if (g) { const m = new THREE.Mesh(g, fMat); m.name = "lab:falls-water"; m.renderOrder = 3; m.castShadow = false; m.matrixAutoUpdate = false; root.add(m); } }
    const pools: THREE.BufferGeometry[] = [];
    // each plunge pool SITS in the ground: a BASIN depth profile (dark, deep in the middle where the falls land,
    // shallow at the banks — one flat 0.75 m depth reads as a uniform turquoise disc), a dark wet silt bed under it
    // (no grass through the shallows), and a rim of wet, moss-topped boulders round the bank + larger rocks at the
    // foot of the falls
    const inPool = (x: number, z: number, skip: number) => MASSIF_POOLS.some((Q, k) => k !== skip && Math.hypot((x - CX - Q.u) / Q.rx, (z - CZ - Q.v) / Q.rz) < 1.02);
    const basin = (x: number, z: number) => { let d = 1; for (const Q of MASSIF_POOLS) d = Math.min(d, Math.hypot((x - CX - Q.u) / Q.rx, (z - CZ - Q.v) / Q.rz)); return lvl - 0.12 - 2.6 * (1 - d * d); };
    { const rocks: THREE.BufferGeometry[] = [], beds: THREE.BufferGeometry[] = [];
      let seed = 7331; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      const moss = new THREE.Color("#4d6a33"), wet = new THREE.Color("#3a3c38"), dry = new THREE.Color("#6b6a62"), tmp = new THREE.Color();
      const rock = (x: number, z: number, s: number, sy: number, sink: number) => {
        const g0 = new THREE.IcosahedronGeometry(1, 2); g0.deleteAttribute("uv"); g0.deleteAttribute("normal");
        let g = mergeVertices(g0);   // (indexed: smooth water-worn boulders, not cut gems)
        const P = g.attributes.position as THREE.BufferAttribute, k = rnd() * 100;
        for (let i = 0; i < P.count; i++) { const vx = P.getX(i), vy = P.getY(i), vz = P.getZ(i); const n = 1 + 0.18 * Math.sin(vx * 3.1 + k) * Math.cos(vz * 2.7 + k * 0.7) + 0.1 * Math.sin(vy * 4.3 + k); P.setXYZ(i, vx * n, vy * n, vz * n); }
        g.computeVertexNormals();
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, T.height(x, z) + s * sy * (0.55 - sink), z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * 6.28, (rnd() - 0.5) * 0.3)), new THREE.Vector3(s * (0.9 + rnd() * 0.3), s * sy, s * (0.9 + rnd() * 0.3)));
        g.applyMatrix4(m);
        const N = g.attributes.normal as THREE.BufferAttribute, Pw = g.attributes.position as THREE.BufferAttribute, C = new Float32Array(P.count * 3);
        for (let i = 0; i < P.count; i++) {
          const up = N.getY(i), hy = Pw.getY(i) - lvl;
          tmp.copy(hy < 0.25 ? wet : dry).lerp(moss, Math.max(0, Math.min(1, (up - 0.45) * 2.2)) * (hy > 0.05 ? 1 : 0.3)).multiplyScalar(0.85 + rnd() * 0.25);
          C[i * 3] = tmp.r; C[i * 3 + 1] = tmp.g; C[i * 3 + 2] = tmp.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(C, 3));
        g = g.toNonIndexed(); rocks.push(g);
      };
      MASSIF_POOLS.forEach((Q, qi) => {
        const cx = CX + Q.u, cz = CZ + Q.v, per = Math.PI * (3 * (Q.rx + Q.rz) - Math.sqrt((3 * Q.rx + Q.rz) * (Q.rx + 3 * Q.rz))), n = Math.round(per / 0.8);
        for (let i = 0; i < n; i++) {
          const a = (i + rnd() * 0.5) / n * Math.PI * 2, rr = 1.0 + rnd() * 0.1, x = cx + Math.cos(a) * Q.rx * rr, z = cz + Math.sin(a) * Q.rz * rr;
          if (inPool(x, z, qi) || rnd() < 0.12) continue;   // (gaps: a bank, not a wall)
          // (the bank under the falls is a pile of big wet boulders; the front bank low stones)
          const back = Math.max(0, ...MASSIF_FALLS.filter((f) => f.pool === qi).map((f) => -(Math.cos(a) * f.dir[0] + Math.sin(a) * f.dir[1])));
          rock(x, z, 0.3 + rnd() * 0.35 + back * (0.45 + rnd() * 0.4), 0.62 + back * 0.2, 0.05);
          if (rnd() < 0.35) rock(x + Math.cos(a) * 0.6, z + Math.sin(a) * 0.6, 0.25 + rnd() * 0.25, 0.6, 0.1);
        }
        // the silt bed: an ellipse a little wider than the water, on the ground, dark and wet
        const bg = new THREE.CircleGeometry(1, 40); bg.rotateX(-Math.PI / 2);
        const B = bg.attributes.position as THREE.BufferAttribute, C = new Float32Array(B.count * 3);
        for (let i = 0; i < B.count; i++) { const x = cx + B.getX(i) * (Q.rx + 0.35), z = cz + B.getZ(i) * (Q.rz + 0.35), r = Math.hypot(B.getX(i), B.getZ(i)); B.setXYZ(i, x, T.height(x, z) + 0.035, z); tmp.set("#1e2a24").lerp(new THREE.Color("#3b3a2c"), r * r); C[i * 3] = tmp.r; C[i * 3 + 1] = tmp.g; C[i * 3 + 2] = tmp.b; }
        bg.setAttribute("color", new THREE.BufferAttribute(C, 3)); bg.deleteAttribute("uv"); beds.push(bg);
      });
      // boulders at the foot of every fall (the water lands among them — foam round them)
      for (const f of MASSIF_FALLS) for (let k = 0; k < 3; k++) { const s = 0.7 + rnd() * 0.6, o = (k - 1) * (f.w * 0.6 + 0.4); rock(CX + f.u + f.dir[0] * (0.9 + rnd() * 0.8) - f.dir[1] * o, CZ + f.v + f.dir[1] * (0.9 + rnd() * 0.8) + f.dir[0] * o, s, 0.7, 0.25); }
      const rg = mergeGeometries(rocks, false), bgm = mergeGeometries(beds, false);
      if (rg) { const m = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, name: "lab:pool-rocks" })); m.name = "lab:pool-rocks"; m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); }
      if (bgm) { const m = new THREE.Mesh(bgm, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, name: "lab:pool-bed", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.name = "lab:pool-bed"; m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); }
    }
    for (const P of MASSIF_POOLS) {
      await ctx.yield();
      pools.push(poolSurface(CX + P.u, CZ + P.v, P.rx, P.rz, lvl, basin, pw, { seg: 40, foamAt: (x, z) => Math.max(0, ...MASSIF_FALLS.map((f) => 1 - Math.hypot(x - (CX + f.u + f.dir[0] * 1.5), z - (CZ + f.v + f.dir[1] * 1.5)) / 3.8)) }).geometry);
      if (P === MASSIF_POOLS[0]) root.add(named("lab:falls-puff", puffCloud(new THREE.Vector3(CX + P.u, G + 1.0, CZ + P.v), { count: 8, color: "#f3f9ff", size: [1.8, 3.2], opacity: 0.22, rise: 1.2, drift: 1.4, spread: [P.rx * 0.6, 0.6, P.rz * 0.6], life: 5, power: 1.4, lit: true })));
    }
    if (pools.length) { const g = mergeGeometries(pools, false); if (g) { const m = new THREE.Mesh(g, pw); m.name = "jungle-water"; m.renderOrder = 2; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; root.add(m); } }
  }
  await ctx.yield();
  const wMat = waterMaterial({ clarity: 0.9, foamScale: 1.1, alpha0: 0.35, glow: 0.5 });
  if (built) root.add(poolSurface(POOL.x, POOL.z, POOL.rx, POOL.rz, level, (x, z) => T.height(x, z) - 0.6, wMat, { seg: 64, foamAt: (x, z) => Math.max(0, 1 - Math.min(...FALL_LIPS.map((f) => Math.hypot(x - f.x - 12 * f.dir[0], z - f.z - 12 * f.dir[1]))) / 6) }));
  return { level };
}
