// poi-coast painted signage: "BANANA CO." lettering etc. rendered on a canvas (never baked by image gen), one cached
// material per (text, colours, font) so decals merge into the Batch like any other surface.
import * as THREE from "three";
import { Batch } from "./coast-kit";

const mats = new Map<string, THREE.MeshStandardMaterial>();

export interface SignStyle { fg?: string; bg?: string | null; font?: number; outline?: string; family?: string; stencil?: boolean }

export function signMaterial(text: string, aspect: number, o: SignStyle = {}): THREE.MeshStandardMaterial {
  const key = `${text}|${aspect.toFixed(2)}|${o.fg}|${o.bg}|${o.font}|${o.outline}|${o.stencil}`;
  let m = mats.get(key);
  if (m) return m;
  const H = 128, W = Math.min(2048, Math.max(128, Math.round(H * aspect / 64) * 64));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, W, H); }
  const fam = o.family ?? "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
  let size = H * 0.78;
  g.font = `${o.font ?? 900} ${size}px ${fam}`;
  const tw = g.measureText(text).width;
  if (tw > W * 0.92) { size *= (W * 0.92) / tw; g.font = `${o.font ?? 900} ${size}px ${fam}`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  if (o.outline) { g.lineWidth = size * 0.1; g.strokeStyle = o.outline; g.strokeText(text, W / 2, H * 0.54); }
  g.fillStyle = o.fg ?? "#1d1a14";
  g.fillText(text, W / 2, H * 0.54);
  if (o.stencil) {
    // worn stencil: knock out speckles so it reads as sprayed paint on wood/metal
    const img = g.getImageData(0, 0, W, H), d = img.data;
    let s = 1234567;
    for (let i = 0; i < d.length; i += 4) { s = (s * 16807) % 2147483647; if (d[i + 3] > 0 && (s & 1023) < 90) d[i + 3] *= 0.2; }
    g.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  m = new THREE.MeshStandardMaterial({ map: t, transparent: !o.bg, alphaTest: o.bg ? 0 : 0.3, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  m.name = "coast:sign:" + text;
  mats.set(key, m);
  return m;
}

// ---- GPU share (a material per sign = a draw per sign, ~22 draws at the poi-10 view): ONE shared
// atlas canvas (2048², rows of 128 px) and ONE material for every coast sign; a sign that does not fit falls back to
// its own material
const ATLAS = 2048, ROW = 128;
let atlas: { c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mat: THREE.MeshStandardMaterial; x: number; y: number; slots: Map<string, [number, number, number, number]> } | null = null;
function atlasSlot(text: string, aspect: number, o: SignStyle): [number, number, number, number] | null {
  if (typeof document === "undefined") return null;
  if (!atlas) {
    const c = document.createElement("canvas"); c.width = c.height = ATLAS;
    const g = c.getContext("2d")!;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: false, alphaTest: 0.3, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    mat.name = "coast:signs";
    atlas = { c, g, tex, mat, x: 0, y: 0, slots: new Map() };
  }
  const key = `${text}|${aspect.toFixed(2)}|${o.fg}|${o.bg}|${o.font}|${o.outline}|${o.stencil}`;
  const hit = atlas.slots.get(key); if (hit) return hit;
  const W = Math.min(ATLAS, Math.max(64, Math.round(ROW * aspect / 16) * 16)), H = ROW;
  if (atlas.x + W > ATLAS) { atlas.x = 0; atlas.y += H; }
  if (atlas.y + H > ATLAS) return null;
  const x0 = atlas.x, y0 = atlas.y, g = atlas.g;
  g.save(); g.beginPath(); g.rect(x0, y0, W, H); g.clip();
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(x0, y0, W, H); }
  const fam = o.family ?? "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
  let size = H * 0.78; g.font = `${o.font ?? 900} ${size}px ${fam}`;
  const tw = g.measureText(text).width; if (tw > W * 0.92) { size *= (W * 0.92) / tw; g.font = `${o.font ?? 900} ${size}px ${fam}`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  if (o.outline) { g.lineWidth = size * 0.1; g.strokeStyle = o.outline; g.strokeText(text, x0 + W / 2, y0 + H * 0.54); }
  g.fillStyle = o.fg ?? "#1d1a14"; g.fillText(text, x0 + W / 2, y0 + H * 0.54);
  if (o.stencil) { const img = g.getImageData(x0, y0, W, H), d = img.data; let s = 1234567; for (let i = 0; i < d.length; i += 4) { s = (s * 16807) % 2147483647; if (d[i + 3] > 0 && (s & 1023) < 90) d[i + 3] *= 0.2; } g.putImageData(img, x0, y0); }
  g.restore();
  atlas.x += W + 4; atlas.tex.needsUpdate = true;
  // UV rect (flipY texture: v = 1 − y)
  const slot: [number, number, number, number] = [x0 / ATLAS, 1 - (y0 + H) / ATLAS, (x0 + W) / ATLAS, 1 - y0 / ATLAS];
  atlas.slots.set(key, slot);
  return slot;
}

/** a flat text plate (w×h metres) facing local +Z at matrix m (frame space) */
export function textDecal(b: Batch, text: string, w: number, h: number, m: THREE.Matrix4, o: SignStyle = {}) {
  const g = new THREE.PlaneGeometry(w, h);
  const slot = atlasSlot(text, w / h, o);
  if (!slot) { b.add(g, signMaterial(text, w / h, o), { m, uv: "keep", shadow: false }); return; }
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, slot[0] + uv.getX(i) * (slot[2] - slot[0]), slot[1] + uv.getY(i) * (slot[3] - slot[1]));
  b.add(g, atlas!.mat, { m, uv: "keep", shadow: false });
}
