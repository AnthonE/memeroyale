// Bake the island: node --import tsx tools/terrain/bake.mts [--no-erosion] [--preview-only] [--check]
// Writes public/assets/terrain/island.bin (client + server load it) and a top-down preview PNG. --out FILE writes there instead.
//   --check   do not write: exit 1 when generateTerrain() differs from the committed island.bin (stale bake = the server
//             and the client would disagree on the ground, biomes and every veg trunk collider).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { generateTerrain, encodeTerrainFile, terrainRocks, decodeTerrainFile, terrainRockColliders, terrainHash, type RockKeep } from "../../shared/world/terrain-gen";
import { POIS, WORLD } from "../../shared/world/map";
import { Terrain } from "../../shared/world/terrain";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const outOpt = (() => { const i = argv.indexOf("--out"); return i >= 0 ? path.resolve(argv[i + 1]) : null; })();
const t0 = performance.now();
const t = generateTerrain({ erosion: !argv.includes("--no-erosion") });
// (file v5) rock keep-outs = every POI clearing, stored in island.bin as a SNAPSHOT for tools that decode the
// file directly. The game never uses the snapshot: the server, the prediction worker and the renderer
// apply the LIVE clearings (shared/world/rock-keeps.ts) right after decoding — so a POI editing a clearing can no
// longer make island.bin stale. Same rules (r + 20 m, Lookout Point left out) in poiRockKeeps().
t.keep = (await import("../../shared/world/rock-keeps")).poiRockKeeps();
t.hash = terrainHash(t);
console.log("generate ms", Math.round(performance.now() - t0), "res", t.res, "hash", t.hash!.toString(16));
if (argv.includes("--check")) {
  const file = outOpt ?? path.join(root, "public/assets/terrain/island.bin");
  let fileHash = "missing";
  let fileKeep = "";
  try { const b = fs.readFileSync(file); const d = decodeTerrainFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); fileHash = d.hash!.toString(16); fileKeep = JSON.stringify(d.keep ?? []); } catch (e) { fileHash = String((e as Error).message); }
  if (fileHash !== t.hash!.toString(16)) { console.error(`STALE: island.bin hash ${fileHash} != generateTerrain() ${t.hash!.toString(16)} — re-bake`); process.exit(1); }
  // the rock keep-outs (POI clearings) are not in the terrain hash — compare them as stored
  const back = decodeTerrainFile(encodeTerrainFile(t));
  // the game applies the live clearings, so an old snapshot only affects tools that decode the file by hand: note
  if (fileKeep !== JSON.stringify(back.keep ?? [])) console.log("note: island.bin's keep-out snapshot is older than the POI clearings (the game uses the live ones; re-bake to refresh tools)");
  console.log("island.bin is up to date"); process.exit(0);
}

// ---- stats + pad promise check
let max = -1e9, min = 1e9, land = 0;
for (let k = 0; k < t.heights.length; k++) { const h = t.heights[k]; if (h > max) max = h; if (h < min) min = h; if (h >= 0) land++; }
console.log(`h range ${min.toFixed(1)}..${max.toFixed(1)} m, land ${(land * WORLD.CELL * WORLD.CELL / 1e6).toFixed(2)} km²`);
const terr = new Terrain(t.heights, t.biome);
for (const p of POIS) {
  if (p.padY === null) continue;
  let worst = 0;
  for (let a = 0; a < 24; a++) for (let r = 0; r <= p.pad * 0.9; r += p.pad * 0.15) {
    const hh = terr.height(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
    if (hh < 0) continue; // pads are land-only promises (the harbor pad runs out over its own inlet)
    const d = Math.abs(hh - p.padY);
    if (d > worst) worst = d;
  }
  if (worst > 0.05) console.log(`PAD WARNING ${p.id}: max dev ${worst.toFixed(2)} m from padY ${p.padY}`);
}
const rocks = terrainRocks(t);
const byKind: Record<string, number> = {};
for (const r of rocks) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log("rocks", rocks.length, byKind, "colliders", terrainRockColliders(rocks).length);

if (!argv.includes("--preview-only")) {
  const buf = encodeTerrainFile(t);
  const outFile = outOpt ?? path.join(root, "public/assets/terrain/island.bin");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(buf));
  const back = decodeTerrainFile(buf);
  let err = 0, bd = 0; for (let k = 0; k < back.heights.length; k++) { err = Math.max(err, Math.abs(back.heights[k] - t.heights[k])); if (back.biome[k] !== t.biome[k] || back.path[k] !== t.path[k] || back.coast[k] !== t.coast[k]) bd++; }
  if (err !== 0 || bd !== 0 || back.hash !== t.hash) { console.error("ROUNDTRIP MISMATCH", err, bd); process.exit(1); }
  console.log("wrote island.bin", (buf.byteLength / 1e6).toFixed(2), "MB, roundtrip exact, hash", back.hash!.toString(16));
}

// ---- shaded preview (top-down, north up, biome colours × sun shading)
const R = t.res, S = 1200, px = Buffer.alloc(S * S * 3);
const col = [[18, 60, 130], [46, 175, 190], [242, 228, 190], [126, 186, 72], [44, 112, 42], [138, 128, 116], [46, 38, 36], [204, 166, 106], [176, 132, 74], [176, 176, 176], [90, 150, 130]];
const sun = [-0.5, 0.7, -0.5];
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = Math.min(R - 2, Math.floor(y / S * R)), j = Math.min(R - 2, Math.floor(x / S * R)), k = i * R + j, h = t.heights[k];
  const nx = -(t.heights[k + 1] - t.heights[k]) / WORLD.CELL, nz = -(t.heights[k + R] - t.heights[k]) / WORLD.CELL;
  const l = Math.hypot(nx, 1, nz);
  const ndl = Math.max(0, (nx / l) * sun[0] + (1 / l) * sun[1] + (nz / l) * sun[2]);
  let c = col[t.biome[k]];
  if (t.path[k] > 100) c = col[7];
  const shade = h > 0 ? 0.45 + 0.75 * ndl : 0.75 + 0.35 * Math.max(0, 1 + h / 60);
  const o = (y * S + x) * 3;
  px[o] = Math.min(255, c[0] * shade); px[o + 1] = Math.min(255, c[1] * shade); px[o + 2] = Math.min(255, c[2] * shade);
  if (h < 0 && h > -0.5) { px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; }
}
// rocks as dots
for (const r of rocks) {
  const x = Math.round((r.x + WORLD.HALF) / (2 * WORLD.HALF) * S), y = Math.round((r.z + WORLD.HALF) / (2 * WORLD.HALF) * S);
  if (x < 0 || y < 0 || x >= S || y >= S) continue;
  const o = (y * S + x) * 3; px[o] = r.kind === "crag" ? 40 : 230; px[o + 1] = r.kind === "block" ? 60 : r.kind === "slab" ? 140 : 230; px[o + 2] = r.kind === "boulder" ? 255 : 60;
}
const prev = outOpt ? outOpt.replace(/\.bin$/, "-preview.png") : path.join(root, "shots/wip/terrain/bake-preview.png");
fs.mkdirSync(path.dirname(prev), { recursive: true });
await sharp(px, { raw: { width: S, height: S, channels: 3 } }).png().toFile(prev);
console.log("preview", prev);
