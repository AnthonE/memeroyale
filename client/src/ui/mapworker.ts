// Worker: paints the island map off the main thread (OffscreenCanvas) and ships it back as an ImageBitmap.
import { paintMap, type MapPaintInput } from "./mappaint";
import { Terrain } from "../../../shared/world/terrain";
import { scatterVegetation } from "../../../shared/world/veg-scatter";
import { allClearings, allColliders } from "../../../shared/pois/index";

const ctx = self as unknown as { onmessage: ((e: MessageEvent<MapPaintInput>) => void) | null; postMessage(m: unknown, t?: Transferable[]): void };
ctx.onmessage = (e) => {
  const t0 = performance.now();
  try {
    const inp = e.data;
    const t = new Terrain(inp.heights, inp.biome);
    let veg: ReturnType<typeof scatterVegetation> = [];
    try { veg = scatterVegetation(t, allClearings()); } catch { /* veg scatter unavailable → canopy-less map */ }
    let boxes: ReturnType<typeof allColliders> = [];
    try { boxes = allColliders(); } catch { /* no POI data */ }
    const c = paintMap(inp, (w, h) => new OffscreenCanvas(w, h), veg, boxes) as OffscreenCanvas;
    const bmp = c.transferToImageBitmap();
    ctx.postMessage({ ok: true, bmp, ms: Math.round(performance.now() - t0), veg: veg.length, boxes: boxes.length }, [bmp]);
  } catch (err) {
    ctx.postMessage({ ok: false, error: String(err) });
  }
};
