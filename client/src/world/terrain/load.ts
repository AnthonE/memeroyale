// How the client obtains the heightfield: the baked file public/assets/terrain/island.bin (baked
// offline; v3 = gzip + content hash, ~1.3 MB). decodeTerrainFile() verifies the
// hash; generateTerrain() on the server returns bit-identical data while the file is fresh.
// Compare `terrainData().hash` with the server's `td.hash` at join.
// Falls back to generating in-thread if the file is missing (dev only — slower, but identical).
import { Terrain } from "../../../../shared/world/terrain";
import { decodeTerrainFile, generateTerrain, type TerrainData } from "../../../../shared/world/terrain-gen";
import { applyPoiRockKeeps } from "../../../../shared/world/rock-keeps";
import { assetUrl } from "../../engine/assets";
import { startTerrainJobs } from "./jobs";

let data: TerrainData | null = null;
/** the full baked record (heights + biome + coast distance + path mask + content hash) — renderer, colliders, join check */
export function terrainData(): TerrainData {
  if (!data) throw new Error("terrain data not loaded yet");
  return data;
}

export async function loadTerrain(): Promise<Terrain> {
  try {
    const r = await fetch(assetUrl("assets/terrain/island.bin"), { cache: "no-cache" });
    if (!r.ok) throw new Error(`island.bin ${r.status}`);
    data = decodeTerrainFile(await r.arrayBuffer());
  } catch (e) {
    console.warn("[terrain] baked file unavailable, generating in-thread:", e);
    data = generateTerrain();
  }
  applyPoiRockKeeps(data);   // rock keep-outs = the LIVE POI clearings (shared/world/rock-keeps.ts), not the file's snapshot
  try { startTerrainJobs(data); } catch (e) { console.warn("[terrain] jobs not started:", e); }   // workers from boot
  return new Terrain(data.heights, data.biome);
}
