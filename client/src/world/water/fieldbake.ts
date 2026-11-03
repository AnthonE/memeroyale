// The per-world water fields as plain typed arrays — NO three.js, NO DOM: runs in the bake worker (bake.worker.ts) off the
// main thread (the bake was 2.5-4 s of main-thread work) and, as a fallback, on the main thread.
// Layout (see fields.ts for what the shader does with each channel):
//   data  (RGBA half floats) R = terrain height, G = signed shore distance, B = shore steepness, A = slope
//   d2    (RGBA8)            RG = shore normal, B = calm (< .5) / coral (> .5), A = feathered depth / 40 m
//   shore (Float32)          the signed shore distance (the CPU sampler: WaterApi.shoreDistanceAt, the run-up lift)
import { Biome, POIS, WORLD } from "../../../../shared/world/map";
import { WAVES } from "./waves";

/** Felzenszwalb 1D squared distance transform (in place on f, length n) */
function edt1d(f: Float32Array, n: number, d: Float32Array, v: Int32Array, z: Float32Array) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
/** squared euclidean distance (in cells) from every cell to the nearest cell where mask is true */
function edt2d(mask: Uint8Array, res: number): Float32Array {
  const INF = 1e12, g = new Float32Array(res * res);
  for (let i = 0; i < res * res; i++) g[i] = mask[i] ? 0 : INF;
  const f = new Float32Array(res), d = new Float32Array(res), v = new Int32Array(res), z = new Float32Array(res + 1);
  for (let j = 0; j < res; j++) { // columns
    for (let i = 0; i < res; i++) f[i] = g[i * res + j];
    edt1d(f, res, d, v, z);
    for (let i = 0; i < res; i++) g[i * res + j] = d[i];
  }
  for (let i = 0; i < res; i++) { // rows
    for (let j = 0; j < res; j++) f[j] = g[i * res + j];
    edt1d(f, res, d, v, z);
    for (let j = 0; j < res; j++) g[i * res + j] = d[j];
  }
  return g;
}

/** float → IEEE half (round to nearest), no three.js */
const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
export function toHalf(val: number): number {
  _f32[0] = val;
  const x = _u32[0], sign = (x >>> 16) & 0x8000;
  let e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (e >= 31) return sign | 0x7c00;
  if (e <= 0) {
    if (e < -10) return sign;
    m = (m | 0x800000) >> (1 - e);
    return sign | ((m + 0x1000) >> 13);
  }
  const h = sign | (e << 10) | (m >> 13);
  return (m & 0x1000) ? h + 1 : h;
}

export interface FieldData { data: Uint16Array; d2: Uint8Array; /** RGBA16F: shore-smoothed height, its slope, the smooth shore normal (x, z; toward open water) */ d3: Uint16Array; shore: Float32Array; ms: number; /** spray spawn candidates on steep windward coast: [x, z, nx, nz]… (spray.ts) */ spray: Float32Array }

export function bakeFieldData(H: Float32Array, biome: Uint8Array, res: number, cell: number, half: number): FieldData {
  const t0 = performance.now();
  const n = res * res;
  const sampleX = (j: number) => -half + j * cell, sampleZ = (i: number) => -half + i * cell;
  const land = new Uint8Array(n), water = new Uint8Array(n), lagoon = new Uint8Array(n);
  // lagoon = Biome.Lagoon cells, or (if the generator does not tag them) water inside the lagoon POIs' circles
  const lagoonPois = POIS.filter((p) => p.id === "stilt-town" || p.id === "the-murk");
  for (let i = 0; i < n; i++) {
    land[i] = H[i] >= WORLD.SEA_LEVEL ? 1 : 0;
    water[i] = land[i] ? 0 : 1;
    let lag = biome[i] === Biome.Lagoon ? 1 : 0;
    if (!lag && water[i]) {
      const x = sampleX(i % res), z = sampleZ(Math.floor(i / res));
      for (const p of lagoonPois) if (Math.hypot(x - p.x, z - p.z) < p.r + 40) { lag = 1; break; }
    }
    lagoon[i] = lag;
  }
  const dLand = edt2d(land, res), dWater = edt2d(water, res), dLag = edt2d(lagoon, res);
  const shore = new Float32Array(n), calm = new Float32Array(n), slope = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    shore[i] = (land[i] ? -Math.sqrt(dWater[i]) : Math.sqrt(dLand[i])) * cell;
    const lag = Math.sqrt(dLag[i]) * cell; // metres to the nearest lagoon cell
    const t = 1 - Math.min(1, lag / 70); // 1 inside, fades over 70 m
    calm[i] = t * t * (3 - 2 * t);
    const r = Math.floor(i / res), c = i % res;
    const c0 = Math.max(0, c - 1), c1 = Math.min(res - 1, c + 1), r0 = Math.max(0, r - 1), r1 = Math.min(res - 1, r + 1);
    const dx = (H[r * res + c1] - H[r * res + c0]) / ((c1 - c0) * cell), dz = (H[r1 * res + c] - H[r0 * res + c]) / ((r1 - r0) * cell);
    slope[i] = Math.min(2, Math.hypot(dx, dz));
  }
  // SHELTER: lagoon-tagged water is only calm where the open-ocean swell cannot reach it (share of 16 rays, ≤ 480 m, that
  // reach deep water without crossing land). 8 m grid, only inside the calm region.
  {
    const G = 4, gr = Math.ceil(res / G) + 1, exp = new Float32Array(gr * gr).fill(-1);
    const NR = 16, STEP = 6 / cell, MAXS = Math.round(480 / 6);
    const dirs = Array.from({ length: NR }, (_, k) => [Math.cos((k / NR) * Math.PI * 2), Math.sin((k / NR) * Math.PI * 2)]);
    const hAt = (r: number, c: number) => H[Math.min(res - 1, Math.max(0, Math.round(r))) * res + Math.min(res - 1, Math.max(0, Math.round(c)))];
    const expAt = (gi: number, gj: number) => {
      const k = gi * gr + gj;
      if (exp[k] >= 0) return exp[k];
      const r0 = gi * G, c0 = gj * G;
      let open = 0;
      for (const [dc, dr] of dirs) {
        for (let s = 1; s <= MAXS; s++) {
          const rr = r0 + dr * STEP * s, cc = c0 + dc * STEP * s;
          if (rr < 0 || cc < 0 || rr > res - 1 || cc > res - 1) { open++; break; }
          const h = hAt(rr, cc);
          if (h >= 0) break;
          if (h < -7) { open++; break; }
        }
      }
      return (exp[k] = open / NR);
    };
    for (let i = 0; i < n; i++) {
      if (calm[i] < 0.001) continue;
      const r = Math.floor(i / res), c = i % res, fr = r / G, fc = c / G;
      const gi = Math.min(gr - 2, Math.floor(fr)), gj = Math.min(gr - 2, Math.floor(fc)), tr = fr - gi, tc = fc - gj;
      const e = (expAt(gi, gj) * (1 - tc) + expAt(gi, gj + 1) * tc) * (1 - tr) + (expAt(gi + 1, gj) * (1 - tc) + expAt(gi + 1, gj + 1) * tc) * tr;
      const sh = 1 - Math.min(1, Math.max(0, (e - 0.12) / 0.2));
      calm[i] *= sh * sh * (3 - 2 * sh);
    }
  }
  // field2: shore normal (gradient of the shore distance, lightly smoothed)
  const d2 = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / res), c = i % res;
    let gx = 0, gz = 0;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = Math.min(res - 1, Math.max(0, r + dr)), cc = Math.min(res - 1, Math.max(0, c + dc));
      const w = dc * Math.exp(-(dr * dr + dc * dc) / 4), wz = dr * Math.exp(-(dr * dr + dc * dc) / 4);
      gx += shore[rr * res + cc] * w; gz += shore[rr * res + cc] * wz;
    }
    const l = Math.hypot(gx, gz) || 1;
    d2[i * 4] = Math.round((gx / l * 0.5 + 0.5) * 255); d2[i * 4 + 1] = Math.round((gz / l * 0.5 + 0.5) * 255);
  }
  // coral anomaly + feathered depth (separable box blurs, 2 passes each ≈ gaussian) → field2.b, field2.a
  const blur = (src: Float32Array, r: number) => {
    const a = Float32Array.from(src), b = new Float32Array(n);
    for (let pass = 0; pass < 2; pass++) {
      for (let row = 0; row < res; row++) { // horizontal
        let acc = 0; const o = row * res;
        for (let c = -r; c <= r; c++) acc += a[o + Math.min(res - 1, Math.max(0, c))];
        for (let c = 0; c < res; c++) { b[o + c] = acc / (2 * r + 1); acc += a[o + Math.min(res - 1, c + r + 1)] - a[o + Math.max(0, c - r)]; }
      }
      for (let c = 0; c < res; c++) { // vertical
        let acc = 0;
        for (let rr = -r; rr <= r; rr++) acc += b[Math.min(res - 1, Math.max(0, rr)) * res + c];
        for (let rr = 0; rr < res; rr++) { a[rr * res + c] = acc / (2 * r + 1); acc += b[Math.min(res - 1, rr + r + 1) * res + c] - b[Math.max(0, rr - r) * res + c]; }
      }
    }
    return a;
  };
  const depthC = new Float32Array(n);
  for (let i = 0; i < n; i++) depthC[i] = Math.min(40, Math.max(0, -H[i]));
  const hB = blur(H, Math.max(1, Math.round(5 / cell))), dB = blur(depthC, Math.max(1, Math.round(6 / cell)));
  for (let i = 0; i < n; i++) {
    const anom = H[i] - hB[i], dep = -H[i];
    const inBand = Math.min(1, Math.max(0, (dep - 1.0) / 1.5)) * Math.min(1, Math.max(0, (18 - dep) / 5));
    const cor = Math.min(1, Math.max(0, (anom - 0.25) / 0.9)) * inBand;
    d2[i * 4 + 2] = Math.round((calm[i] > 0.01 ? 0.5 - 0.5 * calm[i] : 0.5 + 0.5 * cor) * 255);
    d2[i * 4 + 3] = Math.round(Math.min(1, dB[i] / 40) * 255);
  }
  // shore steepness: slope of the LAND cells right at the waterline (sand beaches at 40 %), max-filtered over ±5 cells
  const R = 5, st = new Float32Array(n), st2 = new Float32Array(n);
  for (let i = 0; i < n; i++) st[i] = shore[i] <= 0.5 && shore[i] >= -4 ? slope[i] * (biome[i] === Biome.Beach ? 0.4 : 1) : 0;
  for (let r = 0; r < res; r++) for (let c = 0; c < res; c++) {
    let m = 0; for (let k = Math.max(0, c - R); k <= Math.min(res - 1, c + R); k++) m = Math.max(m, st[r * res + k]);
    st2[r * res + c] = m;
  }
  for (let c = 0; c < res; c++) for (let r = 0; r < res; r++) {
    let m = 0; for (let k = Math.max(0, r - R); k <= Math.min(res - 1, r + R); k++) m = Math.max(m, st2[k * res + c]);
    st[r * res + c] = m;
  }
  // SPRAY candidates: water 1.5-4 m off a steep coast (cliff foot, headland), > 1 m deep, facing the swell
  const spray: number[] = [];
  const WDx = WAVES[0].dir[0], WDz = WAVES[0].dir[1];
  for (let i = 0; i < n; i += 1) {
    const sd = shore[i];
    // (+ the lee faces and the shallower cliff feet — spray should burst at every stack and cliff
    // foot; at eye level the flat surge band is a few px tall, the vertical spray is what reads)
    if (sd < 1.5 || sd > 4 || st[i] < 0.9 || H[i] > -0.5) continue;
    const nx = d2[i * 4] / 255 * 2 - 1, nz = d2[i * 4 + 1] / 255 * 2 - 1, nl = Math.hypot(nx, nz) || 1;
    if ((nx / nl) * -WDx + (nz / nl) * -WDz < -0.5) continue;
    spray.push(sampleX(i % res), sampleZ(Math.floor(i / res)), nx / nl, nz / nl);
  }
  // the SWASH height: the terrain near the shoreline is terraced in 10-20 cm steps over 2 m (the generator's beach
  // rows: the waterline jumps 2 m every 7-14 m along the coast — a notched shore line from 20 m up). The live
  // waterline, the wet sand and the swash foam read this smoothed copy (σ ≈ 4 m, within ~12 m of the shore, fading to the
  // raw height by 25 m) + its own slope; the raw height stays for the depth colour and the film's vertex hug
  const hS = blur(H, Math.max(1, Math.round(3 / cell)));
  const d3 = new Uint16Array(n * 4), hm = new Float32Array(n);
  // + a smooth, high-precision shore normal (field2's 8-bit normal, × |xz| ~ 1 km, made the along-shore coordinate jump
  // metres between texels: foam gaps / lace drew straight-edged triangles along the waterline)
  const sB = blur(shore, Math.max(1, Math.round(4 / cell)));
  for (let i = 0; i < n; i++) { const w = 1 - Math.min(1, Math.max(0, (Math.abs(shore[i]) - 12) / 13)); hm[i] = H[i] + (hS[i] - H[i]) * w; }
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / res), c = i % res;
    const c0 = Math.max(0, c - 1), c1 = Math.min(res - 1, c + 1), r0 = Math.max(0, r - 1), r1 = Math.min(res - 1, r + 1);
    const dx = (hm[r * res + c1] - hm[r * res + c0]) / ((c1 - c0) * cell), dz = (hm[r1 * res + c] - hm[r0 * res + c]) / ((r1 - r0) * cell);
    const sx = sB[r * res + c1] - sB[r * res + c0], sz = sB[r1 * res + c] - sB[r0 * res + c], sl = Math.hypot(sx, sz) || 1;
    d3[i * 4] = toHalf(hm[i]); d3[i * 4 + 1] = toHalf(Math.min(2, Math.hypot(dx, dz))); d3[i * 4 + 2] = toHalf(sx / sl); d3[i * 4 + 3] = toHalf(sz / sl);
  }
  const data = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = toHalf(H[i]); data[i * 4 + 1] = toHalf(shore[i]); data[i * 4 + 2] = toHalf(st[i]); data[i * 4 + 3] = toHalf(slope[i]);
  }
  return { data, d2, d3, shore, spray: new Float32Array(spray), ms: performance.now() - t0 };
}
