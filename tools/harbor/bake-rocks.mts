// Bake the sculpted rocks of Peel Harbor (pier / riprap boulders) and The Wreck (reef +
// beach boulders, the headland's cliff rocks): their placements (y settled on the terrain) and colliders VOXELISED from
// the very triangles the client draws (rockProtos), so what you see is what stops you and your bullets.
// Columns of CELL m: every vertical line through a cell centre is cut against each rock's triangles → solid intervals,
// joined across rocks (gaps < GAP filled: no sealed pockets under overhangs), the lowest one taken down into the ground;
// then runs of cells with the same top (±TOL) merge into boxes.  Writes shared/pois/harbor-rocks-baked.json.
//   npx tsx tools/harbor/bake-rocks.mts [--check]
import fs from "node:fs";
import * as THREE from "three";
import { rockProtos } from "../../client/src/world/pois/_kit/jungle-rocks.ts";
import { Terrain } from "../../shared/world/terrain";
import { decodeTerrainFile } from "../../shared/world/terrain-gen";
import type { RockBake, RockSet } from "../../shared/pois/harbor-kit";

const FILE = new URL("../../shared/pois/harbor-rocks-baked.json", import.meta.url);
const GAP = 2.4;
const t0 = performance.now();
const buf = fs.readFileSync(new URL("../../public/assets/terrain/island.bin", import.meta.url));
const td = decodeTerrainFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const terrain = new Terrain(td.heights, td.biome);
const H = await import("../../shared/pois/peel-harbor.ts");
const W = await import("../../shared/pois/the-wreck.ts");

type Tri = Float64Array; // 9 numbers
/** solid intervals [y0, y1] of every rock along the vertical line (x, z) */
function columnIntervals(tris: Tri[][], x: number, z: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const rock of tris) {
    const ys: number[] = [];
    for (const t of rock) {
      const ax = t[0], az = t[2], bx = t[3], bz = t[5], cx = t[6], cz = t[8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      ys.push(l1 * t[1] + l2 * t[4] + l3 * t[7]);
    }
    if (ys.length < 2) continue;
    ys.sort((a, b) => a - b);
    // (duplicates from shared edges: drop near-equal neighbours, then pair entry / exit)
    const u: number[] = []; for (const y of ys) if (!u.length || y - u[u.length - 1] > 1e-6) u.push(y);
    if (u.length % 2) u.splice(Math.floor(u.length / 2), 1);
    for (let i = 0; i + 1 < u.length; i += 2) out.push([u[i], u[i + 1]]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const m: Array<[number, number]> = [];
  for (const iv of out) { const l = m[m.length - 1]; if (l && iv[0] <= l[1] + GAP) l[1] = Math.max(l[1], iv[1]); else m.push([iv[0], iv[1]]); }
  return m;
}

/** voxelise the sets → boxes in the placements' frame; ground(x, z) = the terrain under a frame point (columns go 1.5 m below it) */
function bake(sets: Record<string, RockSet>, ground: (x: number, z: number) => number, minR = 0, CELL = 0.4, TOL = 0.1, CLOSE = 0): number[][] {
  // world triangles per rock, binned on a CELL grid by their xz bbox
  const tris: Tri[][] = [];
  const bins = new Map<number, number[]>(), key = (i: number, j: number) => i * 65536 + j;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  for (const set of Object.values(sets)) {
    const protos = rockProtos(set.fam, set.n, set.res);
    for (const p of set.pl) {
      if (Math.max(p.sx, p.sz) < minR) continue;
      e.set(p.rx, p.ry, p.rz); q.setFromEuler(e); m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx, p.sy, p.sz));
      const g = protos[p.proto % protos.length], pos = g.attributes.position, idx = g.index;
      const nT = idx ? idx.count / 3 : pos.count / 3, list: Tri[] = [];
      let rx0 = Infinity, rx1 = -Infinity, rz0 = Infinity, rz1 = -Infinity;
      for (let k = 0; k < nT; k++) {
        const t = new Float64Array(9);
        for (let c = 0; c < 3; c++) { const vi = idx ? idx.getX(k * 3 + c) : k * 3 + c; v.fromBufferAttribute(pos, vi).applyMatrix4(m); t[c * 3] = v.x; t[c * 3 + 1] = v.y; t[c * 3 + 2] = v.z; }
        list.push(t);
        rx0 = Math.min(rx0, t[0], t[3], t[6]); rx1 = Math.max(rx1, t[0], t[3], t[6]); rz0 = Math.min(rz0, t[2], t[5], t[8]); rz1 = Math.max(rz1, t[2], t[5], t[8]);
      }
      const r = tris.length; tris.push(list);
      for (let i = Math.floor(rx0 / CELL); i <= Math.floor(rx1 / CELL); i++) for (let j = Math.floor(rz0 / CELL); j <= Math.floor(rz1 / CELL); j++) { const k = key(i + 32768, j + 32768); let a = bins.get(k); if (!a) bins.set(k, a = []); a.push(r); }
      x0 = Math.min(x0, rx0); x1 = Math.max(x1, rx1); z0 = Math.min(z0, rz0); z1 = Math.max(z1, rz1);
    }
  }
  // per cell: the joined intervals, the lowest one down into the ground
  const I0 = Math.floor(x0 / CELL), I1 = Math.floor(x1 / CELL), J0 = Math.floor(z0 / CELL), J1 = Math.floor(z1 / CELL);
  const cells = new Map<number, Array<[number, number]>>();
  for (let i = I0; i <= I1; i++) for (let j = J0; j <= J1; j++) {
    const rocks = bins.get(key(i + 32768, j + 32768)); if (!rocks) continue;
    const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL;
    const iv = columnIntervals(rocks.map((r) => tris[r]), cx, cz);
    if (!iv.length) continue;
    const g = ground(cx, cz) - 1.5;
    if (iv[0][1] <= g + 1.5) iv.shift(); // a rock wholly under the ground there
    if (!iv.length) continue;
    iv[0][0] = Math.min(iv[0][0], g);
    cells.set(key(i + 32768, j + 32768), iv);
  }
  // CLOSE > 0 (a cliff): one solid column per cell (every gap filled — no ledge pockets inside the rock) and a grey-scale
  // CLOSING of the top heightfield over ±CLOSE cells — every pit narrower than the kernel fills to its rim, so a kong
  // who lands on the rock is never in a hole it cannot jump out of
  if (CLOSE > 0) {
    for (const [, iv] of cells) { const a = iv[0]; a[1] = iv[iv.length - 1][1]; iv.length = 1; }
    const top = (i: number, j: number) => cells.get(key(i + 32768, j + 32768))?.[0][1] ?? -Infinity;
    const NI = I1 - I0 + 1 + 2 * CLOSE, NJ = J1 - J0 + 1 + 2 * CLOSE, dil = new Float64Array(NI * NJ).fill(-Infinity);
    for (let a = 0; a < NI; a++) for (let b = 0; b < NJ; b++) {
      const i = I0 - CLOSE + a, j = J0 - CLOSE + b; let m = -Infinity;
      for (let u = -CLOSE; u <= CLOSE; u++) for (let v = -CLOSE; v <= CLOSE; v++) { const t = top(i + u, j + v); if (t > m) m = t; }
      dil[a * NJ + b] = m;
    }
    const D = (i: number, j: number) => { const a = i - (I0 - CLOSE), b = j - (J0 - CLOSE); return a < 0 || b < 0 || a >= NI || b >= NJ ? -Infinity : dil[a * NJ + b]; };
    for (let i = I0; i <= I1; i++) for (let j = J0; j <= J1; j++) {
      let m = Infinity;
      for (let u = -CLOSE; u <= CLOSE && m > -Infinity; u++) for (let v = -CLOSE; v <= CLOSE; v++) m = Math.min(m, D(i + u, j + v));
      if (!(m > -Infinity)) continue;
      const k0 = key(i + 32768, j + 32768), iv = cells.get(k0);
      if (iv) { if (m > iv[0][1]) iv[0][1] = m; continue; }
      // an empty cell the closing covers (a crevice / pocket of open ground walled in by rock) becomes rock too
      const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL, gg = ground(cx, cz);
      if (m > gg + 2.0) cells.set(k0, [[gg - 1.5, m]]);
    }
  }
  // merge: runs along x of cells with the same top (±TOL, both ends of the run) and a similar bottom → one box per run
  // (each interval of a column is merged on its own; a run's top = its mean, bottom = its lowest)
  const boxes: number[][] = [];
  const used = new Set<string>();
  for (let j = J0; j <= J1; j++) for (let i = I0; i <= I1; i++) {
    const iv = cells.get(key(i + 32768, j + 32768)); if (!iv) continue;
    iv.forEach((a, n) => {
      const id = `${i},${j},${n}`; if (used.has(id)) return; used.add(id);
      let lo = a[1], hi = a[1], bot = a[0], sum = a[1], cnt = 1, k = i + 1;
      for (; k <= I1; k++) {
        const nv = cells.get(key(k + 32768, j + 32768)); if (!nv) break;
        const b = nv.findIndex((c, nn) => !used.has(`${k},${j},${nn}`) && Math.max(hi, c[1]) - Math.min(lo, c[1]) <= 2 * TOL && Math.abs(c[0] - a[0]) < 3);
        if (b < 0) break;
        used.add(`${k},${j},${b}`); const c = nv[b]; lo = Math.min(lo, c[1]); hi = Math.max(hi, c[1]); bot = Math.min(bot, c[0]); sum += c[1]; cnt++;
      }
      const top = sum / cnt, xa = i * CELL, xb = k * CELL, za = j * CELL, zb = za + CELL;
      boxes.push([(xa + xb) / 2, (bot + top) / 2, (za + zb) / 2, (xb - xa) / 2, (top - bot) / 2, (zb - za) / 2]);
    });
  }
  // second pass: stack identical x-runs along z
  boxes.sort((p, q) => p[0] - q[0] || p[3] - q[3] || p[2] - q[2]);
  const out: number[][] = [];
  for (const b of boxes) {
    const l = out[out.length - 1];
    if (l && Math.abs(l[0] - b[0]) < 1e-6 && Math.abs(l[3] - b[3]) < 1e-6 && Math.abs(l[2] + l[5] - (b[2] - b[5])) < 1e-6 && Math.abs(l[1] + l[4] - (b[1] + b[4])) <= TOL && Math.abs(l[1] - l[4] - (b[1] - b[4])) < 3) {
      const top = Math.max(l[1] + l[4], b[1] + b[4]) * 0.5 + Math.min(l[1] + l[4], b[1] + b[4]) * 0.5, bot = Math.min(l[1] - l[4], b[1] - b[4]);
      const za = l[2] - l[5], zb = b[2] + b[5];
      l[1] = (top + bot) / 2; l[4] = (top - bot) / 2; l[2] = (za + zb) / 2; l[5] = (zb - za) / 2;
    } else out.push([...b]);
  }
  return out.map((b) => b.map((x) => Math.round(x * 1000) / 1000));
}

const res: Record<string, RockBake> = {};
{
  const sets = H.rockSets((lx, lz) => { const [x, z] = H.toWorld(lx, lz); return terrain.height(x, z); });
  const ground = (lx: number, lz: number) => { const [x, z] = H.toWorld(lx, lz); return terrain.height(x, z); };
  // (the headland's granite domes — outside the POI circle, scenery you can climb on — on a 1 m grid: ~10 k m² of rock)
  const { hills, ...near } = sets;
  res["peel-harbor"] = { sig: H.ROCK_SIG, sets, boxes: [...bake(near, ground, 0.45), ...bake({ hills }, ground, 0.45, 1.5, 0.4)] };
}
{
  const sets = W.rockSets();
  const g = (x: number, z: number) => Math.min(W.groundY(x, z), terrain.height(x, z)), { cliff, ...boulders } = sets;
  res["the-wreck"] = { sig: W.ROCK_SIG, sets, boxes: [...bake(boulders, g, 0.45, 0.4, 0.1, 2), ...bake({ cliff }, g, 0.45, 0.4, 0.1, 3)] };
}
const round = (o: unknown): unknown => JSON.parse(JSON.stringify(o, (_k, x) => (typeof x === "number" ? Math.round(x * 1000) / 1000 : x)));
const text = JSON.stringify(round(res));
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";
  console.log(cur === text ? "up to date" : "STALE — run without --check");
  process.exit(cur === text ? 0 : 1);
}
fs.writeFileSync(FILE, text);
for (const [k, b] of Object.entries(res)) console.log(k, Object.values(b.sets).reduce((a, s) => a + s.pl.length, 0), "rocks →", b.boxes.length, "boxes");
console.log(`wrote ${FILE.pathname} (${(text.length / 1024).toFixed(0)} kB) in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
