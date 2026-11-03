// Bakes the lobby layout's ground heights (the GY block in shared/pois/lobby-islet.ts) from the terrain file the
// client and server load (public/assets/terrain/island.bin). Run after the terrain area reshapes the islet:
//   node --import tsx client/src/world/pois/lobby-islet/bake.mts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Terrain } from "../../../../../shared/world/terrain";
import { decodeTerrainFile } from "../../../../../shared/world/terrain-gen";
import { LOBBY, reduceGround } from "../../../../../shared/pois/lobby-islet";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const buf = readFileSync(path.join(root, "public/assets/terrain/island.bin"));
const data = decodeTerrainFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
const t = new Terrain(data.heights, data.biome);
const h = (x: number, z: number) => t.height(x, z);

const lines: string[] = [];
for (const it of LOBBY) {
  if (it.gy !== undefined || it.kind === "stool" || it.kind === "dock" || it.kind === "post" || it.kind === "runway") continue;
  lines.push(`  ${JSON.stringify(it.id)}: ${reduceGround(it, h).toFixed(3)},`);
}
const file = path.join(root, "shared/pois/lobby-islet.ts");
const src = readFileSync(file, "utf8");
const block = `// <GY>\nconst GY: Record<string, number> = {\n${lines.join("\n")}\n};\n// </GY>`;
const out = src.replace(/\/\/ <GY>[\s\S]*?\/\/ <\/GY>/, block);
if (out === src && !src.includes(block)) throw new Error("GY markers not found");
writeFileSync(file, out);
console.log(`baked ${lines.length} ground heights into shared/pois/lobby-islet.ts`);
