// CNVS LAB texture worker: paints the requested sets (paint.ts, OffscreenCanvas) and posts them back as vertically
// flipped ImageBitmaps (transferred) — the main thread wraps them as flipY=false textures, identical to CanvasTextures.
import { LAB_PAINT } from "./paint";

self.onmessage = async (e: MessageEvent<{ names: string[] }>) => {
  for (const name of e.data.names) {
    try {
      const set = LAB_PAINT[name]();
      const out: Record<string, ImageBitmap | [number, number]> = { metres: set.metres };
      const bufs: ImageBitmap[] = [];
      for (const k of ["map", "normalMap", "emissiveMap"] as const) {
        const c = set[k]; if (!c) continue;
        const bm = await createImageBitmap(c as OffscreenCanvas, { imageOrientation: "flipY", premultiplyAlpha: "none" });
        out[k] = bm; bufs.push(bm);
      }
      (self as unknown as Worker).postMessage({ name, set: out }, bufs);
    } catch (err) {
      (self as unknown as Worker).postMessage({ name, error: String(err) });
    }
  }
};
