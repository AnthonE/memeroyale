// The water's CPU bakes, off the main thread (the module built in 2.9-7 s on the main thread):
//   "tex"    the procedural foam / noise / caustic-net layers (texbake.ts)
//   "fields" the per-world fields: 3 distance transforms over the 1201² heightfield, the lagoon shelter rays, blurs
//   "beach"  the biome-01-beach view camera solved on the live terrain (+ the veg scatter replay) — that view only
// Every result goes back as transferable typed arrays. index.ts starts this at build and holds readiness until it is done.
import { bakeFieldData } from "./fieldbake";
import { waterTexData } from "./texbake";

type Msg =
  | { kind: "tex"; id: number; size: number }
  | { kind: "fields"; id: number; heights: Float32Array; biome: Uint8Array; res: number; cell: number; half: number }
  | { kind: "beach"; id: number; heights: Float32Array; biome: Uint8Array };

const post = (m: unknown, t: Transferable[] = []) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(m, t);

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.kind === "tex") {
      const t0 = performance.now();
      const data = waterTexData(m.size);
      post({ id: m.id, data, ms: performance.now() - t0 }, [data.buffer]);
    } else if (m.kind === "fields") {
      const fd = bakeFieldData(m.heights, m.biome, m.res, m.cell, m.half);
      post({ id: m.id, fd }, [fd.data.buffer, fd.d2.buffer, fd.d3.buffer, fd.shore.buffer, fd.spray.buffer]);
    } else if (m.kind === "beach") {
      const t0 = performance.now();
      const { Terrain } = await import("../../../../shared/world/terrain");
      const { solveBeachView } = await import("./beachcam");
      const v = await solveBeachView(new Terrain(m.heights, m.biome));
      post({ id: m.id, view: v, ms: performance.now() - t0 });
    }
  } catch (err) {
    post({ id: m.id, error: String(err) });
  }
};
