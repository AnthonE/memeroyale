// The veg build must not hold the main thread: the island-wide deterministic scatter (shared/world/
// veg-scatter.ts scatterVegetation, ~0.8–1.5 s) runs here while the main thread builds the species / pools and keeps
// rendering the loading screen. Same code, same inputs → the same list the server replays for its trunk colliders.
import { Terrain } from "../../../../shared/world/terrain";
import { scatterVegetation, setSpawnMask, RockIndex, type Clearing, type VegInstance } from "../../../../shared/world/veg-scatter";
import type { RockInstance } from "../../../../shared/world/terrain-gen";

interface Msg { heights: Float32Array; biome: Uint8Array; clearings: Clearing[]; rocks?: RockInstance[]; mask?: ArrayBuffer | null }

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  const t0 = performance.now();
  try {
    const t = new Terrain(m.heights, m.biome);
    setSpawnMask(m.mask ?? null);
    const list: VegInstance[] = scatterVegetation(t, m.clearings, undefined, m.rocks ? new RockIndex(m.rocks) : undefined);
    (self as unknown as Worker).postMessage({ ok: true, list, ms: performance.now() - t0 });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
