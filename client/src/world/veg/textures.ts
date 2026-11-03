// Canvas-painted foliage textures (albedo + alpha, some normal maps). Everything is painted in code so the plants
// match the target art's "big sculpted leaf clumps" look exactly and nothing is downloaded. Each painter is seeded and
// deterministic. Textures are cached per key.
import * as THREE from "three";
import { mulberry32 } from "../../../../shared/world/noise";

type Ctx = CanvasRenderingContext2D;
const cache = new Map<string, THREE.CanvasTexture>();

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: false })!;
  return [c, ctx];
}

export function toTexture(c: HTMLCanvasElement, o: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = o.aniso ?? 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const cached = (key: string, make: () => THREE.CanvasTexture) => {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
};

// ---------- colour helpers
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;

/** tapered leaf polygon from p0 toward dir, with a droop (perpendicular curve), width w at the base, pointed tip */
function leafPath(ctx: Ctx, x0: number, y0: number, dx: number, dy: number, len: number, w: number, droop: number, widest = 0.4) {
  const px = -dy, py = dx; // perpendicular
  const tipx = x0 + dx * len + px * droop * len, tipy = y0 + dy * len + py * droop * len;
  const mx = x0 + dx * len * widest + px * droop * len * widest * 0.5, my = y0 + dy * len * widest + py * droop * len * widest * 0.5;
  ctx.beginPath();
  ctx.moveTo(x0 - px * w * 0.25, y0 - py * w * 0.25);
  ctx.quadraticCurveTo(mx - px * w * 0.5, my - py * w * 0.5, tipx, tipy);
  ctx.quadraticCurveTo(mx + px * w * 0.5, my + py * w * 0.5, x0 + px * w * 0.25, y0 + py * w * 0.25);
  ctx.closePath();
  return [tipx, tipy, mx, my] as const;
}


// =====================================================================================================================
// LEAF CLUMP — 512², a rounded mass of big clean broadleaves, alpha outside. Used for jungle canopies, bushes,
// mangroves. `leafScale` in px, `hue` centre.
export function leafClumpTexture(seed = 1, o: { hue?: number; leafLen?: number; count?: number; sat?: number; light?: number; round?: boolean; edgeContrast?: number } = {}): THREE.CanvasTexture {
  return cached(`clump:${seed}:${JSON.stringify(o)}`, () => {
    const W = 512;
    const [c, ctx] = canvas(W, W);
    const rnd = mulberry32(seed * 31337 + 5);
    const hue = o.hue ?? 100, leafLen = o.leafLen ?? 96, count = o.count ?? 64, sat = o.sat ?? 0.58, light = o.light ?? 0.38, ec = o.edgeContrast ?? 0.3;
    ctx.clearRect(0, 0, W, W);
    // sculpted mass: leaves fill a rounded blob; the silhouette shows individual leaves, the interior is a soft
    // low-contrast leaf pattern (shape/volume comes from the mesh normals, not from painted lines)
    const leaves: Array<{ x: number; y: number; a: number; l: number; w: number; d: number }> = [];
    for (let i = 0; i < count; i++) {
      const r = (W / 2 - leafLen * 0.5) * Math.pow(rnd(), 0.55);
      const th = rnd() * Math.PI * 2;
      const x = W / 2 + Math.cos(th) * r, y = W / 2 + Math.sin(th) * r;
      const a = th + (rnd() - 0.5) * 1.2;
      const l = leafLen * (0.75 + rnd() * 0.5), w = l * (o.round ? 0.6 : 0.46) * (0.85 + rnd() * 0.3);
      leaves.push({ x, y, a, l, w, d: r });
    }
    leaves.sort((p, q) => q.d - p.d); // outer first, centre on top
    for (const L of leaves) {
      const dx = Math.cos(L.a), dy = Math.sin(L.a);
      const depth = 1 - L.d / (W / 2); // 1 at the centre
      const hj = (rnd() - 0.5) * 10;
      const li = light + depth * 0.06 + (rnd() - 0.5) * 0.07;
      const [tx, ty] = leafPath(ctx, L.x - dx * L.l * 0.5, L.y - dy * L.l * 0.5, dx, dy, L.l, L.w, 0, 0.45);
      const g = ctx.createLinearGradient(L.x - dx * L.l * 0.5, L.y - dy * L.l * 0.5, tx, ty);
      g.addColorStop(0, hsl(hue + hj - 4, sat, li - 0.05));
      g.addColorStop(1, hsl(hue + hj + 4, sat + 0.06, li + 0.06));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = hsl(hue, 0.5, 0.2, ec * (0.4 + 0.6 * (1 - depth))); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L.x - dx * L.l * 0.42, L.y - dy * L.l * 0.42); ctx.lineTo(tx - dx * 5, ty - dy * 5);
      ctx.strokeStyle = hsl(hue - 12, 0.5, 0.62, 0.22); ctx.lineWidth = 1.6; ctx.stroke();
    }
    // soft interior occlusion toward the centre-bottom (alpha preserved)
    ctx.globalCompositeOperation = "source-atop";
    const occ = ctx.createRadialGradient(W * 0.5, W * 0.62, W * 0.05, W * 0.5, W * 0.55, W * 0.55);
    occ.addColorStop(0, "rgba(0,20,0,0.22)"); occ.addColorStop(0.6, "rgba(0,20,0,0.06)"); occ.addColorStop(1, "rgba(0,20,0,0)");
    ctx.fillStyle = occ; ctx.fillRect(0, 0, W, W);
    ctx.globalCompositeOperation = "source-over";
    return toTexture(c);
  });
}









/** bamboo cane tile: yellow-green with one node band per tile (v = 0.5). */
export function bambooTexture(seed = 1): THREE.CanvasTexture {
  return cached(`bamboo:${seed}`, () => {
    const W = 128, H = 256;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 3 + 12);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, hsl(70, 0.5, 0.42)); g.addColorStop(0.3, hsl(66, 0.6, 0.58)); g.addColorStop(0.55, hsl(68, 0.55, 0.5)); g.addColorStop(1, hsl(72, 0.5, 0.38));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { ctx.strokeStyle = hsl(70, 0.4, 0.3, 0.12 + rnd() * 0.1); ctx.lineWidth = 1; const x = rnd() * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    // node band at v = 0.5 → y = 128
    const y = 128;
    const ng = ctx.createLinearGradient(0, y - 10, 0, y + 10);
    ng.addColorStop(0, hsl(70, 0.5, 0.5, 0)); ng.addColorStop(0.35, hsl(72, 0.55, 0.66, 0.9)); ng.addColorStop(0.5, hsl(60, 0.45, 0.25, 0.95)); ng.addColorStop(0.7, hsl(65, 0.5, 0.45, 0.6)); ng.addColorStop(1, hsl(70, 0.5, 0.5, 0));
    ctx.fillStyle = ng; ctx.fillRect(0, y - 10, W, 20);
    return toTexture(c, { repeat: true, aniso: 8 });
  });
}






/** flat colour texture (for stems etc.) */
export function flatTexture(color: string): THREE.CanvasTexture {
  return cached(`flat:${color}`, () => { const [c, ctx] = canvas(4, 4); ctx.fillStyle = color; ctx.fillRect(0, 0, 4, 4); return toTexture(c, { repeat: true }); });
}


// debug hook: node tools (playwright) read the painted canvases through window.__vegTex
(globalThis as unknown as { __vegTex?: Map<string, THREE.CanvasTexture> }).__vegTex = cache;
