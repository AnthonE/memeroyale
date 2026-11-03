// Painted textures for the char-05 thatched hamlet (tp-hamlet.ts): weathered TIMBER (logs / beams / planks, grain along
// V), golden STRAW for the layered thatch (fibres along V = down the slope), rope COIL wraps for the lashings, the red
// FLAG cloth and the "BANANA CO." stencil. Tileable sets are generated on typed arrays (albedo + normal + roughness),
// the flag / stencil are canvas-painted. Geometry UVs are in metres; each set's repeat carries its tile size.
import * as THREE from "three";

type F = Float32Array;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function prng(seed: number): () => number {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** tileable value noise on a cx × cy lattice (wraps), smooth-step interpolated, 0..1 */
function vnoise(w: number, h: number, cx: number, cy: number, seed: number): F {
  const r = prng(seed), L = new Float32Array(cx * cy);
  for (let i = 0; i < L.length; i++) L[i] = r();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / h * cy, j0 = Math.floor(fy), ty = fy - j0, sy = ty * ty * (3 - 2 * ty), j1 = (j0 + 1) % cy, jj = j0 % cy;
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / w * cx, i0 = Math.floor(fx), tx = fx - i0, sx = tx * tx * (3 - 2 * tx), i1 = (i0 + 1) % cx, ii = i0 % cx;
      const a = L[jj * cx + ii], b = L[jj * cx + i1], c = L[j1 * cx + ii], d = L[j1 * cx + i1];
      out[y * w + x] = mix(mix(a, b, sx), mix(c, d, sx), sy);
    }
  }
  return out;
}
/** tileable fbm (octaves double the lattice), normalised to ~0..1 */
function fbm(w: number, h: number, cx: number, cy: number, oct: number, seed: number, gain = 0.5): F {
  const out = new Float32Array(w * h);
  let amp = 1, sum = 0;
  for (let o = 0; o < oct; o++) {
    const n = vnoise(w, h, cx << o, cy << o, seed * 31 + o * 7);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    sum += amp; amp *= gain;
  }
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < out.length; i++) { out[i] /= sum; lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) * k;
  return out;
}

function dataTex(data: Uint8Array, w: number, h: number, srgb: boolean, tileU: number, tileV: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8; t.flipY = false; t.needsUpdate = true;
  t.repeat.set(1 / tileU, 1 / tileV);
  return t;
}
/** normal map (OpenGL, +G = +V) from a wrapped height field */
function normalFrom(hf: F, w: number, h: number, k: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x + w - 1) % w, xr = (x + 1) % w, yu = (y + h - 1) % h, yd = (y + 1) % h;
    const dx = (hf[y * w + xr] - hf[y * w + xl]) * k, dy = (hf[yd * w + x] - hf[yu * w + x]) * k;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out[i] = (0.5 - dx / l * 0.5) * 255; out[i + 1] = (0.5 - dy / l * 0.5) * 255; out[i + 2] = (0.5 + 0.5 / l) * 255; out[i + 3] = 255;
  }
  return out;
}

export interface HamletTexSet { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }

function pack(w: number, h: number, alb: F /* rgb interleaved */, hf: F, rough: F, ao: F, nk: number, tileU: number, tileV: number): HamletTexSet {
  const A = new Uint8Array(w * h * 4), R = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = ao[i];
    A[i * 4] = clamp01(alb[i * 3] * a) * 255; A[i * 4 + 1] = clamp01(alb[i * 3 + 1] * a) * 255; A[i * 4 + 2] = clamp01(alb[i * 3 + 2] * a) * 255; A[i * 4 + 3] = 255;
    R[i * 4] = 255; R[i * 4 + 1] = clamp01(rough[i]) * 255; R[i * 4 + 2] = 0; R[i * 4 + 3] = 255;
  }
  return { map: dataTex(A, w, h, true, tileU, tileV), normalMap: dataTex(normalFrom(hf, w, h, nk), w, h, false, tileU, tileV), roughnessMap: dataTex(R, w, h, false, tileU, tileV) };
}

// ------------------------------------------------------------------------------------------------ timber
/**
 * Weathered timber (posts, beams, planks, rails): grain along V, 1 m × 2 m tile. Light warm NEUTRAL (callers tint with
 * vertex colours toward #5a3b22…#7a5433): long wavy grain lines, fibre streaks, seasoning checks (dark cracks), knots,
 * grey sun-bleached patches and a few worn bright edges. Roughness 0.7–0.95.
 */
let timberCache: HamletTexSet | null = null;
export function timberSet(): HamletTexSet {
  if (timberCache) return timberCache;
  const w = 256, h = 512, N = w * h, TU = 1, TV = 2;
  const streak = fbm(w, h, 48, 2, 3, 11, 0.55), fine = fbm(w, h, 128, 4, 2, 12), warp = fbm(w, h, 6, 3, 3, 13);
  const bleach = fbm(w, h, 3, 4, 3, 14), blot = fbm(w, h, 8, 10, 3, 15);
  const alb = new Float32Array(N * 3), hf = new Float32Array(N), ro = new Float32Array(N), ao = new Float32Array(N).fill(1);
  const r = prng(16);
  // seasoning checks: long thin cracks along V
  const cracks: Array<{ u: number; v0: number; len: number; wob: number; wd: number }> = [];
  for (let i = 0; i < 16; i++) cracks.push({ u: r(), v0: r(), len: 0.12 + r() * 0.4, wob: r() * 10, wd: 0.6 + r() * 1.4 });
  const knots: Array<{ u: number; v: number; ru: number; rv: number }> = [];
  for (let i = 0; i < 5; i++) knots.push({ u: r(), v: r(), ru: 0.025 + r() * 0.03, rv: 0.04 + r() * 0.05 });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, u = x / w, v = y / h;
    // grain lines: rings sliced lengthwise → wavy lines along V
    let gu = u * 22 + (warp[i] - 0.5) * 3.2;
    // knots bend the grain around them
    let kn = 0;
    for (const k of knots) {
      let du = u - k.u; du -= Math.round(du); let dv = v - k.v; dv -= Math.round(dv);
      const d = Math.hypot(du / k.ru, dv / k.rv);
      if (d < 3) { gu += Math.sign(du || 1) * Math.exp(-d * 1.2) * 2.4; }
      kn = Math.max(kn, 1 - sstep(0.6, 1.0, d));
    }
    const ring = 0.5 + 0.5 * Math.sin(gu * Math.PI * 2);
    const line = Math.pow(1 - ring, 6);                 // thin dark latewood lines
    let crack = 0;
    for (const c of cracks) {
      let dv = v - c.v0; dv -= Math.floor(dv); if (dv > c.len) continue;
      const t = dv / c.len, cu = c.u + Math.sin(t * 6 + c.wob) * 0.006;
      let du = u - cu; du -= Math.round(du);
      const width = c.wd * (1 - Math.abs(t - 0.5) * 1.6) / w;
      if (width > 0) crack = Math.max(crack, 1 - sstep(width * 0.3, width * 1.6, Math.abs(du)));
    }
    const s = streak[i], f = fine[i], b = sstep(0.45, 0.85, bleach[i]);
    // warm light wood → grey bleached
    let R = 0.9, G = 0.76, B = 0.6;
    const lum = 0.8 + 0.2 * s + 0.07 * (f - 0.5) - 0.2 * line - 0.12 * (blot[i] > 0.7 ? (blot[i] - 0.7) / 0.3 : 0);
    R = mix(R, 0.78, b * 0.7); G = mix(G, 0.74, b * 0.7); B = mix(B, 0.68, b * 0.7);
    const kd = 1 - kn * 0.45, cd = 1 - crack * 0.72;
    alb[i * 3] = R * lum * kd * cd; alb[i * 3 + 1] = G * lum * kd * cd; alb[i * 3 + 2] = B * lum * kd * cd;
    hf[i] = 0.55 * s + 0.25 * f - 0.35 * line - 1.4 * crack + 0.3 * kn;
    ro[i] = 0.78 + 0.12 * (1 - s) + 0.1 * crack - 0.08 * b;
    ao[i] = 1 - crack * 0.35;
  }
  timberCache = pack(w, h, alb, hf, ro, ao, 5, TU, TV);
  return timberCache;
}

// ------------------------------------------------------------------------------------------------ straw
/**
 * Golden thatch straw: fibres along V (down the slope), 1 m tile. COLOURED (lit #d9b25a-ish, dark strands #8a6a2c,
 * grey weathered bundles, pale highlight strands) — callers multiply vertex AO/tone only. The tier courses come from
 * real geometry (tp-hamlet-kit thatch builders), so the texture carries no course bands.
 */
let strawCache: HamletTexSet | null = null;
export function strawSet(): HamletTexSet {
  if (strawCache) return strawCache;
  const w = 512, h = 512, N = w * h, T = 1;
  const fib = fbm(w, h, 180, 3, 2, 21, 0.6), fib2 = fbm(w, h, 90, 2, 2, 22, 0.6), bundle = fbm(w, h, 20, 2, 2, 23);
  const grey = fbm(w, h, 5, 3, 3, 24), fine = fbm(w, h, 256, 8, 1, 25), tips = fbm(w, h, 60, 6, 2, 26);
  const alb = new Float32Array(N * 3), hf = new Float32Array(N), ro = new Float32Array(N), ao = new Float32Array(N).fill(1);
  for (let i = 0; i < N; i++) {
    const f = fib[i], f2 = fib2[i], b = bundle[i];
    const dark = sstep(0.32, 0.12, f) * 0.85, hi = sstep(0.7, 0.92, f2);
    const g = sstep(0.62, 0.82, grey[i]);
    let R = 0.95, G = 0.8, B = 0.46;
    R = mix(R, 0.62, dark); G = mix(G, 0.46, dark); B = mix(B, 0.22, dark);
    R = mix(R, 1.0, hi * 0.6); G = mix(G, 0.93, hi * 0.6); B = mix(B, 0.66, hi * 0.6);
    R = mix(R, 0.78, g * 0.55); G = mix(G, 0.72, g * 0.55); B = mix(B, 0.58, g * 0.55);
    const lum = 0.78 + 0.26 * b + 0.06 * (fine[i] - 0.5) + 0.05 * (tips[i] - 0.5);
    alb[i * 3] = R * lum; alb[i * 3 + 1] = G * lum; alb[i * 3 + 2] = B * lum;
    hf[i] = 0.6 * f + 0.3 * f2 + 0.5 * b;
    ro[i] = 0.82 + 0.12 * (1 - f);
    ao[i] = 0.82 + 0.18 * sstep(0.1, 0.5, f);
  }
  strawCache = pack(w, h, alb, hf, ro, ao, 3.2, T, T);
  return strawCache;
}

// ------------------------------------------------------------------------------------------------ rope coil
/** rope wrapped around a post: tight turns across V (7 per 0.25 m) with the three-strand twist, beige #cdb48a. tile 0.25 m */
let coilCache: HamletTexSet | null = null;
export function coilSet(): HamletTexSet {
  if (coilCache) return coilCache;
  const w = 128, h = 128, N = w * h, T = 0.25, turns = 7;
  const fine = fbm(w, h, 32, 32, 2, 31), tone = fbm(w, h, 4, 4, 2, 32);
  const alb = new Float32Array(N * 3), hf = new Float32Array(N), ro = new Float32Array(N), ao = new Float32Array(N).fill(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, u = x / w, v = y / h;
    const t = v * turns + u * 0.25;                         // slight helix
    const ph = t - Math.floor(t);
    const turn = Math.sin(ph * Math.PI);                     // rounded cross-section of each turn
    const st = (t * 3 + u * 9) % 1;                          // strand twist
    const strand = 0.5 + 0.5 * Math.sin((st) * Math.PI * 2);
    const hgt = turn * (0.75 + 0.25 * strand);
    const lum = (0.55 + 0.45 * hgt) * (0.9 + 0.12 * (fine[i] - 0.5)) * (0.92 + 0.14 * tone[i]);
    alb[i * 3] = 0.86 * lum; alb[i * 3 + 1] = 0.74 * lum; alb[i * 3 + 2] = 0.54 * lum;
    hf[i] = hgt; ro[i] = 0.9; ao[i] = 0.6 + 0.4 * turn;
  }
  coilCache = pack(w, h, alb, hf, ro, ao, 4.5, T, T);
  return coilCache;
}

// ------------------------------------------------------------------------------------------------ canvas: flag + stencil
function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** red painted cloth flag, hoist on the LEFT (u=0), frayed + split fly end on the right, faint banana-crest emblem */
export function flagTex(): THREE.CanvasTexture {
  return canvasTex(512, 384, (g) => {
    const W = 512, H = 384, r = prng(41);
    g.clearRect(0, 0, W, H);
    // cloth outline with a split, frayed fly end
    g.beginPath(); g.moveTo(0, 6); g.lineTo(W * 0.86, 10);
    for (let y = 10; y < H * 0.46; y += 6) g.lineTo(W * (0.86 + r() * 0.1), y);
    g.lineTo(W * 0.66, H * 0.55);                              // split notch
    for (let y = H * 0.62; y < H - 8; y += 6) g.lineTo(W * (0.84 + r() * 0.12), y);
    g.lineTo(0, H - 4); g.closePath();
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, "#d4412c"); grd.addColorStop(0.55, "#c63a28"); grd.addColorStop(1, "#a82e22");
    g.fillStyle = grd; g.fill();
    g.save(); g.clip();
    // sun-faded patches + weave
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,${150 + r() * 60},${110 + r() * 50},${0.05 + r() * 0.07})`; g.beginPath(); g.ellipse(r() * W, r() * H, 30 + r() * 90, 20 + r() * 60, r() * 3, 0, 7); g.fill(); }
    g.globalAlpha = 0.08; g.fillStyle = "#3a0c06";
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, H);
    g.globalAlpha = 1;
    // stitched hem at the hoist + top
    g.strokeStyle = "rgba(90,20,10,0.55)"; g.lineWidth = 5; g.beginPath(); g.moveTo(26, 0); g.lineTo(26, H); g.stroke();
    g.setLineDash([9, 7]); g.lineWidth = 2; g.strokeStyle = "rgba(255,210,170,0.35)"; g.beginPath(); g.moveTo(34, 0); g.lineTo(34, H); g.stroke(); g.setLineDash([]);
    // faint emblem: a banana crescent in a ring (painted, worn)
    g.globalAlpha = 0.34; g.strokeStyle = "#ffd9a8"; g.lineWidth = 10; g.beginPath(); g.arc(W * 0.4, H * 0.5, 78, 0, 7); g.stroke();
    g.fillStyle = "#ffd070"; g.beginPath(); g.arc(W * 0.4, H * 0.5, 56, 0.35 * Math.PI, 1.45 * Math.PI); g.arc(W * 0.4 + 20, H * 0.5 - 8, 50, 1.4 * Math.PI, 0.4 * Math.PI, true); g.closePath(); g.fill();
    g.globalAlpha = 1;
    // grime toward the fly end, darker bottom
    const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(40,6,2,0.28)");
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    g.restore();
    // loose threads at the fly end
    g.strokeStyle = "rgba(200,60,40,0.9)"; g.lineWidth = 2;
    for (let i = 0; i < 22; i++) { const y = 14 + r() * (H - 28); if (Math.abs(y - H * 0.55) < 24) continue; const x = W * (0.84 + r() * 0.06); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12 + r() * 26, y + (r() - 0.5) * 10); g.stroke(); }
  });
}

/** "BANANA CO." stencil + banana mark on transparent (dark brown paint, worn) — decal for the yellow crate */
export function stencilTex(label = "BANANA CO."): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    const W = 512, H = 256, r = prng(51);
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(58,34,12,0.92)"; g.strokeStyle = "rgba(58,34,12,0.92)";
    g.lineWidth = 7; g.strokeRect(20, 20, W - 40, H - 40);
    g.font = "900 72px Helvetica, Arial"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(label, W / 2 + 30, H / 2 + 4);
    // banana mark
    g.beginPath(); g.arc(78, H / 2 - 4, 38, 0.3 * Math.PI, 1.3 * Math.PI); g.arc(92, H / 2 - 14, 34, 1.25 * Math.PI, 0.35 * Math.PI, true); g.closePath(); g.fill();
    // stencil bridges + wear: punch holes with destination-out
    g.globalCompositeOperation = "destination-out";
    for (let x = 60; x < W; x += 43) g.fillRect(x, H / 2 - 40, 3, 80);
    for (let i = 0; i < 240; i++) { g.globalAlpha = 0.25 + r() * 0.6; g.beginPath(); g.arc(r() * W, r() * H, 1 + r() * 5, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  });
}

/** tile sizes (metres) — for callers that need them */
export const TILE = { timber: [1, 2] as const, straw: 1, coil: 0.25 };
