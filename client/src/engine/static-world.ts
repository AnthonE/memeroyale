// The static collision world for prediction / the offline host, built in a Web Worker that the boot starts at t = 0
// (it cost 1.8-2 s of main thread at the start of the game stage). Same recipe as the server
// (shared/sim/static-world.ts); the worker's terrain hash must equal the page's, else the page builds in-thread.
import type { Terrain } from "../../../shared/world/terrain";
import type { TerrainData } from "../../../shared/world/terrain-gen";
import type { Box } from "../../../shared/world/colliders";
import { StaticWorld } from "../../../shared/sim/world";
import type { Climb } from "../../../shared/sim/climb";
import { buildRoads } from "../../../shared/sim/roads";
import { assetUrl } from "./assets";

interface WorkerResult { ok: boolean; boxes?: Box[]; hash?: number; climbs?: Climb[]; terrainHash?: number; ms?: number; error?: string }
let job: Promise<WorkerResult> | null = null;

/** start the worker (idempotent). Call as early as possible. */
export function startStaticWorld() {
  if (job) return;
  job = new Promise<WorkerResult>((resolve) => {
    try {
      const w = new Worker(new URL("./static-world.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (ev: MessageEvent<WorkerResult>) => { resolve(ev.data); w.terminate(); };
      w.onerror = (e) => { resolve({ ok: false, error: String(e.message || e) }); w.terminate(); };
      w.postMessage({ url: new URL(assetUrl("assets/terrain/island.bin"), location.href).href });
    } catch (e) { resolve({ ok: false, error: String(e) }); }
  });
}

/** the static world: the worker's result when it matches this page's terrain, else built in-thread */
export async function staticWorld(terrain: Terrain, td: TerrainData): Promise<{ world: StaticWorld; boxes: Box[]; hash: number }> {
  const kr = (globalThis as unknown as { __kr?: Record<string, unknown> }).__kr;
  const r = job ? await job : null;
  job = null;   // (the settled promise held the worker's ~490 k collider objects for the whole session)
  if (r?.ok && r.boxes && r.hash !== undefined && (td.hash === undefined || r.terrainHash === td.hash)) {
    const t0 = performance.now();
    const world = new StaticWorld(terrain, r.boxes);
    world.climbs = r.climbs ?? [];
    // (the paved ground the terrain's biome map does not know — ~4 ms: without it the driver's prediction and the offline
    // host drove the runway and the town's streets on grass grip while the server drove them as road)
    world.roads = buildRoads(terrain);
    if (kr) kr.staticWorld = { worker: true, workerMs: r.ms, gridMs: Math.round(performance.now() - t0), boxes: r.boxes.length };
    return { world, boxes: r.boxes, hash: r.hash };
  }
  if (r && !r.ok) console.warn("[static-world] worker failed, building in-thread:", r.error);
  const { buildStaticWorld } = await import("../../../shared/sim/static-world");
  const t0 = performance.now();
  const out = await buildStaticWorld(terrain, td);
  if (kr) kr.staticWorld = { worker: false, ms: Math.round(performance.now() - t0), boxes: out.boxes.length };
  return out;
}
