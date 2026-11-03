// CPU texture painter for the lobby islet: procedural per-pixel painting into colour / height / roughness /
// metalness / AO buffers, then packed into three CanvasTextures (sRGB colour+alpha, tangent-space normal, ORM).
// Regions are painted in METRES so geometry can map real-world sizes onto them without stretching.
import * as THREE from "three";

// ------------------------------------------------------------------------------------------------ noise
const PERM = new Uint8Array(512);
{
  let s = 1337;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const hash = (x: number, y: number) => PERM[(PERM[x & 255] + y) & 511] / 255;
const fade = (t: number) => t * t * (3 - 2 * t);

/** value noise in [0,1]; `per` makes it tile with that period (lattice units) */
export function vnoise(x: number, y: number, per = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), tx = fade(x - xi), ty = fade(y - yi);
  let x0 = xi, y0 = yi, x1 = xi + 1, y1 = yi + 1;
  if (per > 0) { x0 = ((x0 % per) + per) % per; x1 = ((x1 % per) + per) % per; y0 = ((y0 % per) + per) % per; y1 = ((y1 % per) + per) % per; }
  const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
export function fbm(x: number, y: number, oct = 4, per = 0): number {
  let s = 0, amp = 0.5, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f + i * 17.3, y * f - i * 9.1, per ? per * f : 0); n += amp; amp *= 0.5; f *= 2; }
  return s / n;
}
/** cellular (worley) distance to the nearest feature point, ~[0,1] */
export function cell(x: number, y: number, per = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    let cx = xi + i, cy = yi + j;
    const hx = per ? ((cx % per) + per) % per : cx, hy = per ? ((cy % per) + per) % per : cy;
    const px = cx + hash(hx, hy + 91), py = cy + hash(hx + 57, hy);
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sstep = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ------------------------------------------------------------------------------------------------ sheet
/** a painted rectangle of the sheet: pixel rect + the metres it spans along u (x) and v (up) */
export interface Region { x: number; y: number; w: number; h: number; mu: number; mv: number }
/** UV rect of a region (texture v is up; canvas y is down — CanvasTexture flips) */
export interface UVRect { u0: number; v0: number; u1: number; v1: number; mu: number; mv: number }

export interface Px { r: number; g: number; b: number; a: number; h: number; ro: number; me: number; ao: number }

export class Sheet {
  readonly col: Uint8ClampedArray;
  readonly hgt: Float32Array;
  readonly orm: Uint8ClampedArray; // r = ao, g = rough, b = metal, a = 255
  constructor(readonly size = 2048) {
    this.col = new Uint8ClampedArray(size * size * 4);
    this.hgt = new Float32Array(size * size).fill(0.5);
    this.orm = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) { this.orm[i * 4] = 255; this.orm[i * 4 + 1] = 200; this.orm[i * 4 + 3] = 255; this.col[i * 4 + 3] = 255; }
  }

  uv(r: Region, inset = 2): UVRect { return Sheet.uvOf(this.size, r, inset); }
  static uvOf(S: number, r: Region, inset = 2): UVRect {
    return { u0: (r.x + inset) / S, u1: (r.x + r.w - inset) / S, v0: 1 - (r.y + r.h - inset) / S, v1: 1 - (r.y + inset) / S, mu: r.mu * (r.w - 2 * inset) / r.w, mv: r.mv * (r.h - 2 * inset) / r.h };
  }

  /** paint every pixel of `r` (+ `pad` px of gutter so mips don't bleed): fn(a, b, px) with a,b in metres (b up) */
  paint(r: Region, fn: (a: number, b: number, p: Px) => void, pad = 6) {
    const S = this.size, p: Px = { r: 0.5, g: 0.5, b: 0.5, a: 1, h: 0.5, ro: 0.8, me: 0, ao: 1 };
    const x0 = Math.max(0, r.x - pad), x1 = Math.min(S, r.x + r.w + pad), y0 = Math.max(0, r.y - pad), y1 = Math.min(S, r.y + r.h + pad);
    const su = r.mu / r.w, sv = r.mv / r.h;
    for (let y = y0; y < y1; y++) {
      const b = (r.y + r.h - y - 0.5) * sv;
      for (let x = x0; x < x1; x++) {
        const a = (x - r.x + 0.5) * su;
        p.r = p.g = p.b = 0.5; p.a = 1; p.h = 0.5; p.ro = 0.8; p.me = 0; p.ao = 1;
        fn(a, b, p);
        const i = y * S + x, k = i * 4;
        this.col[k] = p.r * 255; this.col[k + 1] = p.g * 255; this.col[k + 2] = p.b * 255; this.col[k + 3] = p.a * 255;
        this.hgt[i] = p.h;
        this.orm[k] = p.ao * 255; this.orm[k + 1] = p.ro * 255; this.orm[k + 2] = p.me * 255;
      }
    }
  }

  /** stamp text (or any canvas drawing) as a mask into a region; `apply(mask 0..1, a, b, px-index)` edits buffers */
  stamp(r: Region, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, apply: (m: number, a: number, b: number, i: number) => void) {
    const c = document.createElement("canvas");
    c.width = r.w; c.height = r.h;
    const g = c.getContext("2d")!;
    g.fillStyle = "#000"; g.fillRect(0, 0, r.w, r.h);
    draw(g, r.w, r.h);
    const d = g.getImageData(0, 0, r.w, r.h).data;
    const su = r.mu / r.w, sv = r.mv / r.h;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const m = d[(y * r.w + x) * 4] / 255;
      if (m <= 0.001) continue;
      apply(m, (x + 0.5) * su, (r.h - y - 0.5) * sv, (r.y + y) * this.size + r.x + x);
    }
  }
  setCol(i: number, rgb: [number, number, number], t: number) {
    const k = i * 4;
    this.col[k] += (rgb[0] * 255 - this.col[k]) * t; this.col[k + 1] += (rgb[1] * 255 - this.col[k + 1]) * t; this.col[k + 2] += (rgb[2] * 255 - this.col[k + 2]) * t;
  }

  /** pack into textures. normalStrength ~ how many px of height 1.0 spans */
  textures(normalStrength = 6, aniso = 8): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; ormMap: THREE.CanvasTexture } {
    const S = this.size;
    const mk = (data: Uint8ClampedArray, srgb: boolean) => {
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      c.getContext("2d")!.putImageData(new ImageData(data as unknown as Uint8ClampedArray<ArrayBuffer>, S, S), 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = aniso;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    };
    // normals from height (central differences); canvas y is down, texture v is up → ny sign flips
    const nrm = new Uint8ClampedArray(S * S * 4), h = this.hgt;
    for (let y = 0; y < S; y++) {
      const ym = y > 0 ? y - 1 : y, yp = y < S - 1 ? y + 1 : y;
      for (let x = 0; x < S; x++) {
        const xm = x > 0 ? x - 1 : x, xp = x < S - 1 ? x + 1 : x;
        const dx = (h[y * S + xp] - h[y * S + xm]) * normalStrength, dy = (h[yp * S + x] - h[ym * S + x]) * normalStrength;
        const nx = -dx, ny = dy, l = Math.hypot(nx, ny, 1);
        const k = (y * S + x) * 4;
        nrm[k] = (nx / l * 0.5 + 0.5) * 255; nrm[k + 1] = (ny / l * 0.5 + 0.5) * 255; nrm[k + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[k + 3] = 255;
      }
    }
    return { map: mk(this.col, true), normalMap: mk(nrm, false), ormMap: mk(this.orm, false) };
  }
}
