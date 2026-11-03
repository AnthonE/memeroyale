// Painted top-down island map shared by the minimap and the full-screen map. The canvas exists immediately (open
// sea colour); the painting (mappaint.ts) runs in a worker and lands ~0.5 s later — `version` bumps so the HUD
// redraws. In view-camera stills a readiness hold keeps the capture waiting for the finished map.
import type { CreateMapImage, MapImage } from "./api";
import { DEEP_SEA_CSS, paintMap, type MapPaintInput } from "./mappaint";
import { terrainData } from "../world/terrain/load";
import { uiAsset } from "./styles";
import { FALLS } from "../../../shared/pois/jungle-falls";

export interface PaintedMap extends MapImage {
  /** increments when the painting lands */
  version: number;
  ready: Promise<void>;
  seaCss: string;
}

let shared: PaintedMap | null = null;

export const createMapImage: CreateMapImage = (terrain, sizePx): PaintedMap => {
  // one painting per page (HUD re-creation in harnesses reuses it)
  if (shared && shared.sizePx === sizePx && shared.half === terrain.half) return shared;
  const half = terrain.half;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = sizePx;
  const g = canvas.getContext("2d")!;
  g.fillStyle = DEEP_SEA_CSS;
  g.fillRect(0, 0, sizePx, sizePx);
  const s = sizePx / (half * 2);
  let extra: { coast: Int8Array | null; path: Uint8Array | null } = { coast: null, path: null };
  try { const d = terrainData(); extra = { coast: d.coast, path: d.path }; } catch { /* sampler-only terrain */ }
  const inp: MapPaintInput = { heights: terrain.heights, biome: terrain.biome, coast: extra.coast, path: extra.path, sizePx };

  const kr = (globalThis as unknown as { __kr?: { engine?: { hold?: (l: string) => () => void } } }).__kr;
  const release = kr?.engine?.hold?.("ui:map") ?? (() => {});
  const map: PaintedMap = {
    canvas, sizePx, half, version: 0, seaCss: DEEP_SEA_CSS, ready: Promise.resolve(),
    toPx(x: number, z: number): [number, number] { return [(x + half) * s, (z + half) * s]; },
    toWorld(pxx: number, pyy: number): [number, number] { return [pxx / s - half, pyy / s - half]; },
  };
  // the map is a RENDER of the real island (every POI's
  // buildings, the jungle, reefs and the game's own sun, shadows and clouds, straight down) — the procedural painting
  // below is only the fallback while it downloads / if it is missing. Whichever lands last never overwrites the render.
  let rendered = false;
  const land = (src: CanvasImageSource, isRender = false) => {
    if (rendered && !isRender) return;
    if (isRender) rendered = true;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(src, 0, 0, sizePx, sizePx); map.version++;
  };
  /** the Mist Falls plunge pool and its river, which the top-down bake shows as a dry beige bed (the
   * river water is not drawn from 6 km up): painted blue over the render from poi-jungle's own centreline */
  const paintWater = () => {
    const P = (x: number, z: number): [number, number] => [(x + half) * s, (z + half) * s];
    const pts = FALLS.river.map(([x, z]) => P(x, z));
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    const stroke = (w: number, c: string) => { g.strokeStyle = c; g.lineWidth = w * s; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.stroke(); };
    stroke(17, "rgba(226,214,168,0.9)"); stroke(12, "#2a8fc4"); stroke(5, "rgba(120,214,240,0.75)");
    const [px, py] = P(FALLS.pool.x, FALLS.pool.z);
    g.fillStyle = "rgba(226,214,168,0.9)"; g.beginPath(); g.ellipse(px, py, (FALLS.pool.rx + 3) * s, (FALLS.pool.rz + 3) * s, 0, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(px, py, 0, px, py, FALLS.pool.rz * s);
    gr.addColorStop(0, "#1c6fa8"); gr.addColorStop(1, "#3cb6dc");
    g.fillStyle = gr; g.beginPath(); g.ellipse(px, py, FALLS.pool.rx * s, FALLS.pool.rz * s, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  const renderReady = new Promise<void>((resolve) => {
    if (typeof Image === "undefined") { resolve(); return; }
    const img = new Image(); img.decoding = "async";
    img.onload = () => {
      land(img, true);
      // the open sea beyond the rendered square: the render's own edge colour (no seam at the map's border)
      try {
        const c = document.createElement("canvas"); c.width = c.height = 8; const cg = c.getContext("2d")!;
        // all four borders, not just the top: the east edge of the render is a different blue
        let r = 0, gg = 0, b = 0, n = 0;
        for (const [sx, sy, sw, sh] of [[0, 0, img.width, 16], [0, img.height - 16, img.width, 16], [0, 0, 16, img.height], [img.width - 16, 0, 16, img.height]]) {
          cg.clearRect(0, 0, 8, 8); cg.drawImage(img, sx, sy, sw, sh, 0, 0, 8, 8); const d = cg.getImageData(0, 0, 8, 8).data;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
        }
        map.seaCss = `rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`;
        // …and the render's borders melt into that sea over 7 % of the map (no straight seam where the square ends)
        const f = sizePx * 0.07, rgb = map.seaCss.slice(4, -1);
        for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, f, 0, 0, 0, f, sizePx], [sizePx, 0, sizePx - f, 0, sizePx - f, 0, f, sizePx], [0, 0, 0, f, 0, 0, sizePx, f], [0, sizePx, 0, sizePx - f, 0, sizePx - f, sizePx, f]]) {
          const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
          g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
        }
        paintWater();
        map.version++;
      } catch { /* keep the painted sea colour */ }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = uiAsset("map-render.webp");
  });
  const mainThread = async () => {
    const [{ scatterVegetation }, { allClearings, allColliders }, { Terrain }] = await Promise.all([
      import("../../../shared/world/veg-scatter"), import("../../../shared/pois/index"), import("../../../shared/world/terrain"),
    ]);
    const t = new Terrain(terrain.heights, terrain.biome);
    land(paintMap(inp, (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }, scatterVegetation(t, allClearings()), allColliders()) as HTMLCanvasElement);
  };
  map.ready = new Promise<void>((resolve) => {
    const done = () => { void renderReady.then(() => { release(); resolve(); }); };
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") { mainThread().catch((e) => console.warn("[ui] map paint failed", e)).finally(done); return; }
    try {
      const w = new Worker(new URL("./mapworker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ ok: boolean; bmp?: ImageBitmap; error?: string; ms?: number }>) => {
        if (e.data.ok && e.data.bmp) { land(e.data.bmp); e.data.bmp.close(); (globalThis as unknown as { __krMapMs?: number }).__krMapMs = e.data.ms; done(); }
        else { console.warn("[ui] map worker failed, painting on the main thread:", e.data.error); mainThread().catch(() => {}).finally(done); }
        w.terminate();
      };
      w.onerror = (ev) => { console.warn("[ui] map worker error", ev.message); w.terminate(); mainThread().catch(() => {}).finally(done); };
      w.postMessage(inp);
    } catch { mainThread().catch(() => {}).finally(done); }
  });
  shared = map;
  return map;
};
