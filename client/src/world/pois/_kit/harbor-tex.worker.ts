// poi-harbor kit — paints the harbor's tile textures off the main thread (OffscreenCanvas) and returns them as
// ImageBitmaps, pre-flipped for WebGL (ImageBitmap uploads ignore flipY). See harbor-materials harborMatsAsync().
import { servePool } from "../../../engine/worker-pool";
import { paintTexGroups } from "./harbor-materials";
import { paintCtGroups } from "./containers-tex";
import { paintFine } from "../peel-harbor/apron-fine";
async function pack(cvs: Record<string, HTMLCanvasElement>) {
  const out: Record<string, ImageBitmap> = {}, transfer: Transferable[] = [];
  for (const [k, c] of Object.entries(cvs)) {
    const bm = await createImageBitmap(c as unknown as OffscreenCanvas, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
    out[k] = bm; transfer.push(bm);
  }
  return { result: out, transfer };
}
/** the mean colour of a canvas (sRGB 0..1) — harbor-geo averageAlbedo's palette colour, so the main thread never reads a
 *  1024² ImageBitmap back to average it (≈ 5–10 ms each) */
function mean(c: HTMLCanvasElement): [number, number, number] {
  const o = new OffscreenCanvas(4, 4), g = o.getContext("2d")!;
  g.drawImage(c as unknown as OffscreenCanvas, 0, 0, 4, 4);
  const d = g.getImageData(0, 0, 4, 4).data; let r = 0, gg = 0, b = 0;
  for (let i = 0; i < 16; i++) { r += d[i * 4]; gg += d[i * 4 + 1]; b += d[i * 4 + 2]; }
  return [r / 16 / 255, gg / 16 / 255, b / 16 / 255];
}
servePool({
  paint: (groups: string[]) => pack(paintTexGroups(groups)),
  // the same + every map's mean colour: { bm: name → bitmap, means: name → [r, g, b] }
  paintMeans: async (groups: string[]) => { const cvs = paintTexGroups(groups), means: Record<string, [number, number, number]> = {}; for (const [k, c] of Object.entries(cvs)) means[k] = mean(c); const p = await pack(cvs); return { result: { bm: p.result, means }, transfer: p.transfer }; },
  paintCt: (groups: string[]) => pack(paintCtGroups(groups)),
  // (Peel Harbor's 1024² slab detail tile — two RGBA byte arrays, transferred)
  fine: () => { const r = paintFine(); return { result: r, transfer: [r.pk.buffer, r.nk.buffer] }; },
});
