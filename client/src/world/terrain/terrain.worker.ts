// Terrain build OFF the main thread (in-thread the build took 4.0 s in three single long tasks — the layer
// texture read, buildTerrainGpuData and terrainRocks). Two jobs, posted by client/src/world/terrain/index.ts:
//   "tex":  fetch the 12 × 3 layer images, decode (createImageBitmap), read back (OffscreenCanvas) and compose the two
//           RGBA layer arrays exactly as textures.ts loadLayerArrays does → transferred back
//   "band": fetch + decode island.bin (the same bytes the page decoded — the hash is checked): the per-sample splat
//           rules for rows [i0, i1) (data.ts computeGpuRows) → band arrays transferred (4 bands run in parallel)
//   "finish": decodes the file while the bands run, then gets the bands (transferred through the page, no copy):
//           finishGpuArrays → the two packed arrays transferred
//   "rocks": the same file + the page's rock keep-outs → terrainRocks (cloned)
// The page falls back to its in-thread path when anything here fails.
import { decodeTerrainFile, lavaChannels, terrainRocks, type RockKeep } from "../../../../shared/world/terrain-gen";
import { computeGpuRows, finishGpuArrays } from "./data";

type Band = { i0: number; i1: number; data: Uint8Array; info: Uint8Array; W: Float32Array[] };
type Msg = { kind: "tex"; urls: string[][]; ao: number[]; size: number } | { kind: "rocks"; url: string; keep: RockKeep[] | undefined }
  | { kind: "band"; url: string; i0: number; i1: number } | { kind: "finish"; url: string } | { kind: "bands"; bands: Band[] };
let finishTd: Promise<ReturnType<typeof decodeTerrainFile>> | null = null;
async function load(url: string) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`island.bin ${r.status}`);
  return decodeTerrainFile(await r.arrayBuffer());
}
const post = (m: unknown, tr: Transferable[] = []) => (self as unknown as Worker).postMessage(m, tr);

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const m = ev.data, t0 = performance.now();
  try {
    if (m.kind === "tex") {
      const n = m.urls.length, px = m.size * m.size * 4;
      const alb = new Uint8Array(px * n), nor = new Uint8Array(px * n);
      const cv = new OffscreenCanvas(m.size, m.size), g = cv.getContext("2d", { willReadFrequently: true })!;
      // fetch + decode every image at once (createImageBitmap decodes in parallel), then read back one by one
      const bms = await Promise.all(m.urls.map((u) => Promise.all(u.map(async (url) => {
        const r = await fetch(url); if (!r.ok) throw new Error(`image ${url} ${r.status}`); return createImageBitmap(await r.blob());
      }))));
      const read = (bm: ImageBitmap) => { g.clearRect(0, 0, m.size, m.size); g.drawImage(bm, 0, 0, m.size, m.size); bm.close(); return g.getImageData(0, 0, m.size, m.size).data; };
      for (let li = 0; li < n; li++) {
        const [db, nb, ab] = bms[li];
        const dd = read(db), ad = read(ab), aoK = m.ao[li];
        const oa = alb.subarray(li * px, (li + 1) * px);
        for (let i = 0; i < px; i += 4) {
          const ao = 1 - aoK + aoK * (ad[i] / 255);
          oa[i] = dd[i] * ao; oa[i + 1] = dd[i + 1] * ao; oa[i + 2] = dd[i + 2] * ao; oa[i + 3] = ad[i + 2];   // a = height
        }
        const nd = read(nb), on = nor.subarray(li * px, (li + 1) * px);
        for (let i = 0; i < px; i += 4) { on[i] = nd[i]; on[i + 1] = nd[i + 1]; on[i + 2] = nd[i + 2]; on[i + 3] = ad[i + 1]; } // a = roughness
      }
      post({ ok: true, kind: "tex", alb, nor, ms: Math.round(performance.now() - t0) }, [alb.buffer, nor.buffer]);
    } else if (m.kind === "rocks") {
      const td = await load(m.url); td.keep = m.keep;
      const rocks = terrainRocks(td); post({ ok: true, kind: "rocks", hash: td.hash, rocks, ms: Math.round(performance.now() - t0) });
    } else if (m.kind === "band") {
      const td = await load(m.url);
      const r = computeGpuRows(td, lavaChannels(td), m.i0, m.i1);
      post({ ok: true, kind: "band", hash: td.hash, i0: m.i0, i1: m.i1, data: r.data, info: r.info, W: r.W, ms: Math.round(performance.now() - t0) }, [r.data.buffer, r.info.buffer, ...r.W.map((a) => a.buffer)]);
    } else if (m.kind === "finish") {
      finishTd = load(m.url); await finishTd;   // decode now, wait for the bands
    } else if (m.kind === "bands") {
      const td = await finishTd!; const res = td.res, N = res * res;
      const data = new Uint8Array(N * 4), info = new Uint8Array(N * 4), W = Array.from({ length: 12 }, () => new Float32Array(N));
      for (const b of m.bands) { data.set(b.data, b.i0 * res * 4); info.set(b.info, b.i0 * res * 4); for (let q = 0; q < 12; q++) W[q].set(b.W[q], b.i0 * res); }
      const a = finishGpuArrays(td, data, info, W);
      post({ ok: true, kind: "gpu", hash: td.hash, dat: a.dat, w: a.w, res: a.res, ms: Math.round(performance.now() - t0) }, [a.dat.buffer, a.w.buffer]);
    }
  } catch (e) {
    post({ ok: false, kind: m.kind, error: String(e instanceof Error ? e.stack || e.message : e) });
  }
};
