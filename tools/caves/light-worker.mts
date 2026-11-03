// COCO CAVES light-volume worker: computes z-slices of the baked light volume (see bake-rock.mts).
import { parentPort, workerData } from "node:worker_threads";
import { sdfOcc } from "./sdf.mts";
import * as C from "../../shared/pois/coco-caves";

const { V, k0, k1, lamps, dirs, escapeY, xz } = workerData as {
  V: { x0: number; y0: number; z0: number; nx: number; ny: number; nz: number; res: number };
  k0: number; k1: number; lamps: Array<{ x: number; y: number; z: number; r: number; g: number; b: number; power: number; range: number }>;
  dirs: number[][]; escapeY: number; xz: [number, number, number, number];
};
const occ = (x: number, y: number, z: number) => sdfOcc(x, y, z, true);
const [SX, SY, SZ] = C.SUN_DIR;

let seed = 1;
function sky(px: number, py: number, pz: number): number {
  let vis = 0;
  seed = (Math.imul(Math.floor(px * 73 + py * 19 + pz * 131), 2654435761) >>> 0);
  const rot = (seed % 6283) / 1000, cr = Math.cos(rot), sr = Math.sin(rot);
  for (const d0 of dirs) {
    const d = [d0[0] * cr - d0[2] * sr, d0[1], d0[0] * sr + d0[2] * cr];
    let t = 0.25, ok = 1;
    for (let it = 0; it < 160; it++) {
      const x = px + d[0] * t, y = py + d[1] * t, z = pz + d[2] * t;
      if (y > escapeY || x < xz[0] || x > xz[2] || z < xz[1] || z > xz[3]) break;
      const h = occ(x, y, z);
      if (h < 0.04) { ok = 0; break; }
      t += Math.max(0.2, h * 0.9);
      if (t > 140) break;
    }
    vis += ok;
  }
  return vis / dirs.length;
}
function sun(px: number, py: number, pz: number): number {
  let res = 1, t = 0.3;
  for (let it = 0; it < 200; it++) {
    const x = px + SX * t, y = py + SY * t, z = pz + SZ * t;
    if (y > escapeY) break;
    const h = occ(x, y, z);
    if (h < 0.02) return 0;
    res = Math.min(res, 10 * h / t);
    t += Math.max(0.15, h * 0.9);
  }
  return Math.max(0, Math.min(1, res));
}
function lampVis(px: number, py: number, pz: number, L: { x: number; y: number; z: number }, dist: number): number {
  const dx = (L.x - px) / dist, dy = (L.y - py) / dist, dz = (L.z - pz) / dist;
  let res = 1, t = 0.3;
  while (t < dist - 0.4) {
    const h = occ(px + dx * t, py + dy * t, pz + dz * t);
    if (h < 0.02) return 0;
    res = Math.min(res, 6 * h / t);
    t += Math.max(0.12, h * 0.9);
  }
  return Math.max(0, Math.min(1, res));
}

const plane = V.nx * V.ny;
const rgba = new Uint8Array((k1 - k0) * plane * 4), sunv = new Uint8Array((k1 - k0) * plane);
for (let k = k0; k < k1; k++) for (let j = 0; j < V.ny; j++) for (let i = 0; i < V.nx; i++) {
  const x = V.x0 + i * V.res, y = V.y0 + j * V.res, z = V.z0 + k * V.res, o = (k - k0) * plane + j * V.nx + i;
  if (occ(x, y, z) < 0.0) continue;       // inside rock / under the ground: black (the shader samples 0.7 m off the surface)
  const s = sky(x, y, z);
  let r = 0, g = 0, b = 0;
  for (const L of lamps) {
    const dx = L.x - x, dy = L.y - y, dz = L.z - z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > L.range * L.range) continue;
    const d = Math.sqrt(d2), v = lampVis(x, y, z, L, d); if (v <= 0) continue;
    const e = L.power * v / (2 + d2);
    r += L.r * e; g += L.g * e; b += L.b * e;
  }
  const enc = (e: number) => Math.round(Math.sqrt(Math.min(1, e / 12)) * 255);
  rgba[o * 4] = enc(r); rgba[o * 4 + 1] = enc(g); rgba[o * 4 + 2] = enc(b); rgba[o * 4 + 3] = Math.round(s * 255);
  sunv[o] = Math.round(sun(x, y, z) * 255);
}
parentPort!.postMessage({ k0, k1, rgba, sunv }, [rgba.buffer, sunv.buffer]);
