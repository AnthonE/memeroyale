// Procedural, perfectly tileable water textures — the pure data half (no three.js: runs in the bake worker). No downloads, no seams.
//   foam  (512²) — R: LACE, the cellular foam network (strands around bubble holes, thick/thin, broken)
//                  G: density fbm (drives where the lace fills in first — threshold-dissolve control)
//                  B: fine bubbles / specks        A: streaks (stretched along u — backwash / trailing foam)
//   noise (256²) — RGBA: four independent fbm fields (reef patches, breakup, phase variation, slicks)
//   caustic net  — R: crisp thin bright lines on the borders of domain-warped Worley cells (8 cells per tile → ~1 m
//                  cells at the shader's 7.5 m scale); G: the same at 60 % line width (far / deeper); B: distance to
//                  the lines (for screen-aware line widths). The shader warps it
//                  by the live ripple slopes so it wobbles with the surface, and mixes it with the physical caustics.
// The ripples and caustics are NOT here: they are simulated live on the GPU (wavetile.ts).


function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** tileable gradient noise, u/v in [0,1), period P lattice cells */
function gnoise(u: number, v: number, P: number, seed: number): number {
  const x = u * P, y = v * P;
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const g = (cx: number, cy: number, dx: number, dy: number) => {
    const a = hash(((cx % P) + P) % P, ((cy % P) + P) % P, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const sx = fade(fx), sy = fade(fy);
  const n0 = lerp(g(ix, iy, fx, fy), g(ix + 1, iy, fx - 1, fy), sx);
  const n1 = lerp(g(ix, iy + 1, fx, fy - 1), g(ix + 1, iy + 1, fx - 1, fy - 1), sx);
  return lerp(n0, n1, sy) * 1.4; // ~[-1, 1]
}
function fbm(u: number, v: number, P: number, oct: number, seed: number, gain = 0.5): number {
  let a = 1, s = 0, n = 0, p = P;
  for (let o = 0; o < oct; o++) { s += a * gnoise(u, v, p, seed + o * 17); n += a; a *= gain; p *= 2; }
  return s / n;
}
/** tileable Worley: [F1, F2] distances in cell units */
function worley(u: number, v: number, P: number, seed: number): [number, number] {
  u -= Math.floor(u); v -= Math.floor(v);
  const x = u * P, y = v * P, ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, wx = ((cx % P) + P) % P, wy = ((cy % P) + P) % P;
    const px = cx + 0.15 + 0.7 * hash(wx, wy, seed), py = cy + 0.15 + 0.7 * hash(wx, wy, seed + 99);
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}

/** the 3 layers (foam, noise, caustic net) as one RGBA8 array, size² × 3 */
export function waterTexData(size = 512): Uint8Array {
  // ---- foam
  const foam = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    // domain warp: organic, not a cell grid
    const wu = u + 0.045 * fbm(u, v, 3, 3, 41), wv = v + 0.045 * fbm(u, v, 3, 3, 42);
    // two cell sizes of bubble "rafts": strands live on the cell borders (F2 - F1 small)
    const [a1, a2] = worley(wu, wv, 7, 21);
    const [b1, b2] = worley(wu + 0.37, wv + 0.11, 15, 45);
    const [c1, c2] = worley(wu + 0.61, wv + 0.83, 31, 77);
    const thick = 0.5 + 0.5 * fbm(u, v, 6, 3, 505);          // strand width varies along the network
    const eA = 1 - sstep(0.02, 0.10 + 0.10 * thick, a2 - a1);
    const eB = 1 - sstep(0.02, 0.09 + 0.12 * thick, b2 - b1);
    const eC = 1 - sstep(0.03, 0.14, c2 - c1);
    // holes: the interior of big cells stays open (dark water), small cells fill in
    const holeA = sstep(0.18, 0.42, a1);
    let lace = Math.max(eA, eB * 0.85, eC * 0.55 * (1 - holeA * 0.5));
    lace = lace * (0.75 + 0.25 * sstep(-0.3, 0.4, fbm(u, v, 12, 2, 606)));
    // fill: dense foam patches where the density field is high (solid white with a few holes)
    const dens = 0.5 + 0.5 * fbm(u, v, 4, 4, 202);
    const fill = sstep(0.62, 0.85, dens) * (0.6 + 0.4 * (1 - holeA));
    lace = clamp01(Math.max(lace, fill));
    const [d1] = worley(u, v, 48, 303);
    const bubbles = sstep(0.32, 0.12, d1) * sstep(0.35, 0.65, 0.5 + 0.5 * fbm(u, v, 8, 2, 707));
    const streak = 0.5 + 0.5 * fbm(u * 1, v * 7, 2, 4, 404);
    const k = (y * size + x) * 4;
    foam[k] = Math.round(lace * 255);
    foam[k + 1] = Math.round(clamp01(dens) * 255);
    foam[k + 2] = Math.round(clamp01(bubbles) * 255);
    foam[k + 3] = Math.round(clamp01(sstep(0.45, 0.8, streak)) * 255);
  }
  // ---- noise (256): four fbm fields
  const ns = 256, noise = new Uint8Array(ns * ns * 4);
  for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
    const u = x / ns, v = y / ns, k = (y * ns + x) * 4;
    noise[k] = Math.round((0.5 + 0.5 * fbm(u, v, 3, 5, 701)) * 255);
    noise[k + 1] = Math.round((0.5 + 0.5 * fbm(u, v, 5, 4, 702)) * 255);
    noise[k + 2] = Math.round((0.5 + 0.5 * fbm(u, v, 8, 3, 703)) * 255);
    noise[k + 3] = Math.round((0.5 + 0.5 * fbm(u, v, 2, 5, 704)) * 255);
  }
  // upsample the noise to the foam size (bilinear, wrapping) and stack both as layers of one array texture
  const arr = new Uint8Array(size * size * 4 * 3);
  arr.set(foam, 0);
  const off = size * size * 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * ns - 0.5, fy = (y / size) * ns - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const w = (i: number) => ((i % ns) + ns) % ns;
    for (let c = 0; c < 4; c++) {
      const a = noise[(w(y0) * ns + w(x0)) * 4 + c], b = noise[(w(y0) * ns + w(x0 + 1)) * 4 + c];
      const d = noise[(w(y0 + 1) * ns + w(x0)) * 4 + c], e = noise[(w(y0 + 1) * ns + w(x0 + 1)) * 4 + c];
      arr[off + (y * size + x) * 4 + c] = Math.round(lerp(lerp(a, b, tx), lerp(d, e, tx), ty));
    }
  }
  // ---- caustic net
  const off2 = size * size * 4 * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const wu = u + 0.018 * fbm(u, v, 4, 3, 911), wv = v + 0.018 * fbm(u, v, 4, 3, 912);
    const [f1, f2] = worley(wu, wv, 8, 913);
    const e = f2 - f1;                                   // 0 on the cell border
    const w = 0.035 + 0.03 * (0.5 + 0.5 * fbm(u, v, 6, 2, 914)); // line width varies along the net
    const k = off2 + (y * size + x) * 4;
    arr[k] = Math.round(clamp01(1 - sstep(w * 0.35, w, e)) * 255);
    arr[k + 1] = Math.round(clamp01(1 - sstep(w * 0.2, w * 0.6, e)) * 255);
    // B: distance to the net line (F2 − F1, cell units, ×4 → 0.25 cells = 1.0) minus the local half-width: the shader
    //    draws the lines at a screen-aware width from it (they stay ≥ ~1 px out to the mid shallows)
    arr[k + 2] = Math.round(clamp01((e - w * 0.5) * 4) * 255); arr[k + 3] = 255;
  }
  return arr;
}
