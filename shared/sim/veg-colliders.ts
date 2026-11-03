// Tree-trunk colliders derived from the deterministic vegetation scatter (same seed → same trunks on server + client).
// The boxes come from veg-scatter and follow the drawn trunks (leaning palms, buttresses, bamboo, logs) within
// ~0.1 m, for exactly the plants the client draws (the same rock filter the renderer applies). One vertical box per
// plant would leave ~70 % of the rendered trunk volume without a box.
import type { Terrain } from "../world/terrain";
import type { TerrainData } from "../world/terrain-gen";
import type { Box } from "../world/colliders";
import { allClearings } from "../pois/index";

/** the trunk boxes AND the drawn plants (the climbable trees are picked from them) */
export async function vegStatic(terrain: Terrain, td: TerrainData): Promise<{ boxes: Box[]; plants: import("../world/veg-scatter").VegInstance[] }> {
  try {
    const veg = await import("../world/veg-scatter");
    await veg.loadSpawnMask();
    const cl = (allClearings() as unknown[]).filter((c): c is import("../world/veg-scatter").Clearing => !!c && typeof c === "object" && "x" in c);
    return veg.vegStaticPlants(terrain, td, cl);
  } catch (e) { console.error("veg-colliders: failed", e); return { boxes: [], plants: [] }; }
}

export async function vegTrunkColliders(terrain: Terrain, td?: TerrainData): Promise<Box[]> {
  try {
    const veg = await import("../world/veg-scatter");
    // (the drawn-water / drawn-cover spawn mask — the client scatter loads the same file: same trunks)
    await veg.loadSpawnMask();
    const cl = (allClearings() as unknown[]).filter((c): c is import("../world/veg-scatter").Clearing => !!c && typeof c === "object" && "x" in c);
    if (td) return veg.vegStaticColliders(terrain, td, cl);
    console.warn("veg-colliders: no TerrainData — trunks buried in rocks are not filtered (client/server may differ)");
    return veg.vegTrunkColliders(veg.scatterVegetation(terrain, cl));
  } catch (e) { console.error("veg-colliders: failed", e); return []; }
}
