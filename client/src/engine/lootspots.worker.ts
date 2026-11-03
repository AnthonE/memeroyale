// LOOT SPOTS OFF THE MAIN THREAD (target: PRACTICE → in match ≤ 3 s): the canonical loot spots + the bots'
// indoor nav graph are a pure function of the static world (shared/sim/loot-spots.ts — 2-3 s of probes). This worker
// builds the static world from the same baked island file with the same recipe as the page / the server
// (shared/sim/static-world.ts), runs lootSpots() and posts the set with the world hash; the page adopts it only when
// the hash equals its own world's (engine/lootspots.ts), else the in-thread idle build runs.
import { decodeTerrainFile } from "../../../shared/world/terrain-gen";
import { Terrain } from "../../../shared/world/terrain";
import { buildStaticWorld } from "../../../shared/sim/static-world";
import { lootSpots } from "../../../shared/sim/loot-spots";

self.onmessage = async (ev: MessageEvent<{ url: string }>) => {
  try {
    const t0 = performance.now();
    const r = await fetch(ev.data.url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`island.bin ${r.status}`);
    const td = decodeTerrainFile(await r.arrayBuffer());
    const terrain = new Terrain(td.heights, td.biome);
    const { world, hash } = await buildStaticWorld(terrain, td);
    const t1 = performance.now();
    const set = lootSpots(world);
    (self as unknown as Worker).postMessage({ ok: true, hash, set, worldMs: Math.round(t1 - t0), spotsMs: Math.round(performance.now() - t1) });
  } catch (e) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(e instanceof Error ? e.stack || e.message : e) });
  }
};
