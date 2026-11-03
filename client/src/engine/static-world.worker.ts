// Builds the static collision world's boxes OFF the main thread: the same recipe the server and the
// in-thread path use (shared/sim/static-world.ts buildStaticWorld), fed the same baked terrain file. Posts back the
// boxes (structured clone) + the world hash; the page makes the StaticWorld grid from them (engine/static-world.ts).
import { decodeTerrainFile } from "../../../shared/world/terrain-gen";
import { Terrain } from "../../../shared/world/terrain";
import { buildStaticWorld } from "../../../shared/sim/static-world";

self.onmessage = async (ev: MessageEvent<{ url: string }>) => {
  try {
    const t0 = performance.now();
    const r = await fetch(ev.data.url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`island.bin ${r.status}`);
    const td = decodeTerrainFile(await r.arrayBuffer());
    const terrain = new Terrain(td.heights, td.biome);
    const { boxes, hash, climbs } = await buildStaticWorld(terrain, td);
    (self as unknown as Worker).postMessage({ ok: true, boxes, hash, climbs, terrainHash: td.hash, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(e instanceof Error ? e.stack || e.message : e) });
  }
};
