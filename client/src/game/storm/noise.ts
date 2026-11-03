// Tileable procedural noise, baked once into a 256x256 RGBA DataTexture at startup.
// R: soft fbm  G: second fbm (different seed, used for flicker/top jitter)  B: ridged (bolt paths, streaks)
// A: billow |2n-1| fbm — the cauliflower channel every cloud shader leans on.
import * as THREE from "three";

const SIZE = 256;

function hash(ix: number, iy: number, seed: number): number {
  let n = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2654435761)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** tileable value noise, lattice `period` cells across the unit square */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const fx = x * period, fy = y * period;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
  const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  const x0 = ((ix % period) + period) % period, x1 = (x0 + 1) % period;
  const y0 = ((iy % period) + period) % period, y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

type Shaper = (n: number) => number;
function fbm(x: number, y: number, basePeriod: number, seed: number, octaves: number, shape: Shaper): number {
  let sum = 0, amp = 1, tot = 0, p = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += shape(valueNoise(x, y, p, seed + o * 101)) * amp;
    tot += amp;
    amp *= 0.55;
    p *= 2;
  }
  return sum / tot;
}

export function createNoiseTexture(): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const soft: Shaper = (n) => n;
  const ridge: Shaper = (n) => 1 - Math.abs(2 * n - 1);
  const billow: Shaper = (n) => Math.abs(2 * n - 1);
  const chan = [
    { period: 4, seed: 11, oct: 5, shape: soft },
    { period: 6, seed: 23, oct: 5, shape: soft },
    { period: 5, seed: 37, oct: 4, shape: ridge },
    { period: 4, seed: 53, oct: 5, shape: billow },
  ];
  for (let c = 0; c < 4; c++) {
    const { period, seed, oct, shape } = chan[c];
    let mn = 1e9, mx = -1e9;
    const tmp = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const v = fbm(x / SIZE, y / SIZE, period, seed, oct, shape);
        tmp[y * SIZE + x] = v;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    const inv = 1 / (mx - mn);
    for (let i = 0; i < SIZE * SIZE; i++) data[i * 4 + c] = Math.round(((tmp[i] - mn) * inv) * 255);
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
