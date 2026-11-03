// Detail-cell worker: generates grass / fern / flower / ground-cover cells off the main thread (zero-hitch streaming
// while sprinting). Init once with the terrain arrays, clearings, rocks and the path mask; then {cx, cz} → GenCell
// (matrix / colour blocks transferred, not copied).
import { Terrain } from "../../../../shared/world/terrain";
import { RockIndex, setSpawnMask, type Clearing } from "../../../../shared/world/veg-scatter";
import type { RockInstance } from "../../../../shared/world/terrain-gen";
import { DetailGen, CanopyGrid } from "./detail-gen";

let gen: DetailGen | null = null;

interface InitMsg { type: "init"; heights: Float32Array; biome: Uint8Array; clearings: Clearing[]; rocks?: RockInstance[]; path?: Uint8Array; pathRes?: number; canopy?: Float32Array; mask?: ArrayBuffer | null }
interface CellMsg { type: "cell"; cx: number; cz: number }

self.onmessage = (e: MessageEvent<InitMsg | CellMsg>) => {
  const m = e.data;
  if (m.type === "init") {
    const t = new Terrain(m.heights, m.biome);
    setSpawnMask(m.mask ?? null);
    gen = new DetailGen(t, m.clearings, { rocks: m.rocks ? new RockIndex(m.rocks) : undefined, path: m.path, pathRes: m.pathRes }, m.canopy ? new CanopyGrid(m.canopy) : undefined);
    return;
  }
  if (!gen) return;
  const c = gen.cell(m.cx, m.cz);
  const transfer: Transferable[] = [];
  for (const b of c.blocks) transfer.push(b.mats.buffer, b.cols.buffer);
  (self as unknown as Worker).postMessage(c, transfer);
};
