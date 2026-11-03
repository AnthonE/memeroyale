// Canvas painting helpers for the actors area (kong skin/cloth/sneaker maps, plane livery, glider peel…).
// Everything with text, logos, speckles or wear is painted here in code — never baked by a model generator.
import * as THREE from "three";

export type Rng = () => number;
/** deterministic mulberry32 */
export function rng(seed: number): Rng {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement("canvas");
  el.width = w; el.height = h;
  return [el, el.getContext("2d")!];
}

export function tex(el: HTMLCanvasElement, o: { srgb?: boolean; repeat?: [number, number]; aniso?: number; flipY?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  t.anisotropy = o.aniso ?? 8;
  if (o.flipY !== undefined) t.flipY = o.flipY;
  t.needsUpdate = true;
  return t;
}

/** fill + soft blotchy value variation (hand-painted feel) */
export function base(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, r: Rng, blotch = 0.08, n = 60) {
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = (0.08 + r() * 0.25) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const l = r() < 0.5;
    g.addColorStop(0, l ? `rgba(255,255,255,${blotch * r()})` : `rgba(0,0,0,${blotch * r()})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/** banana speckles / bruise spots */
export function speckles(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng, n: number, color = "rgba(92,58,20,0.75)", size = 0.012) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, s = (0.4 + r() * 1.2) * size * w;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * (0.6 + r() * 0.6), r() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
}

/** grunge noise overlay (fine) */
export function grain(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng, amount = 0.06, n = 4000) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, s = 1 + r() * 2;
    ctx.fillStyle = r() < 0.5 ? `rgba(255,255,255,${amount * r()})` : `rgba(0,0,0,${amount * r()})`;
    ctx.fillRect(x, y, s, s);
  }
}

export function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r0: number, color: string, rot = -Math.PI / 2) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr = i % 2 === 0 ? r0 : r0 * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

export function stencil(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, o: { align?: CanvasTextAlign; rot?: number; weight?: number; font?: string; stroke?: string } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot ?? 0);
  ctx.font = `${o.weight ?? 900} ${size}px ${o.font ?? "Helvetica, Arial, sans-serif"}`;
  ctx.textAlign = o.align ?? "center"; ctx.textBaseline = "middle";
  if (o.stroke) { ctx.lineWidth = size * 0.12; ctx.strokeStyle = o.stroke; ctx.strokeText(text, 0, 0); }
  ctx.fillStyle = color; ctx.fillText(text, 0, 0); ctx.restore();
}

/** stitched seam line */
export function seam(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color = "rgba(40,10,5,0.55)", w = 2, dash: [number, number] = [6, 5]) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
}

/** height → tangent-space normal map (Sobel). `strength` in pixels of slope. */
export function heightToNormal(height: HTMLCanvasElement, strength = 2, wrap = true): HTMLCanvasElement {
  const w = height.width, h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  const [out, octx] = canvas(w, h);
  const img = octx.createImageData(w, h);
  const H = (x: number, y: number) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); }
    return src[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255; img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l) * 0.5 * 255 + 127; img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}


