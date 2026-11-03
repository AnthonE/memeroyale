// COCO CAVES rock + light bake. Reads the shared layout (shared/pois/coco-caves.ts), writes:
//   public/assets/pois/caves/rock.bin   — the massif as ONE smooth surface: surface nets over the displaced SDF of the
//                                          collider boxes (tools/caves/sdf.mts), 0.6 m voxels, chunked (Uint16 positions
//                                          over the bounds, Int8 normals, Uint8 baked AO, Uint16 indices per chunk) +
//                                          a 1.6 m far-LOD mesh
//   public/assets/pois/caves/light.bin  — a 1 m light volume over the caves: RGB = occluded lamp light (crystals,
//                                          lanterns, lava, the sun-patch bounce), A = sky visibility (cosine-weighted,
//                                          rocks + terrain occlude), + an R8 volume of soft sun visibility (midday preset)
// Both carry the layout hash; the client warns (never errors) when the bake is stale.
//   node --import tsx tools/caves/bake-rock.mts [--no-light] [--no-dc] [--res 0.6] [--workers N]
import * as fs from "node:fs";
import * as path from "node:path";
import { Worker } from "node:worker_threads";
import * as C from "../../shared/pois/coco-caves";
import { sdf, BOUNDS, looseAt } from "./sdf.mts";

const argv = process.argv.slice(2);
const RES = Number(argv[argv.indexOf("--res") + 1] || 0) || 0.6;
const OUT = path.resolve(new URL(".", import.meta.url).pathname, "../../public/assets/pois/caves");
fs.mkdirSync(OUT, { recursive: true });
export const LAYOUT_HASH = C.bakeHash();
const t0 = Date.now();

const LAM = 0.03, GE = 0.04;
function surfaceNets(res: number, withAO: boolean, dc = false) {
  const cp: number[] = [];
  const B = BOUNDS, nx = Math.ceil((B.x1 - B.x0) / res) + 1, ny = Math.ceil((B.y1 - B.y0) / res) + 1, nz = Math.ceil((B.z1 - B.z0) / res) + 1;
  const F = new Float32Array(nx * ny * nz), I = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = B.x0 + i * res, z = B.z0 + k * res, g = C.groundAt(x, z);
    for (let j = 0; j < ny; j++) {
      const y = B.y0 + j * res;
      F[I(i, j, k)] = y < g - 2.5 ? -1 : sdf(x, y, z);    // deep under the ground nothing is ever seen
    }
  }
  console.log(`  field ${nx}×${ny}×${nz} @${res} m in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), V = (i: number, j: number, k: number) => (k * (ny - 1) + j) * (nx - 1) + i;
  const P: number[] = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let pos = 0, neg = 0;
    for (let c = 0; c < 8; c++) { v[c] = F[I(i + cx[c], j + cy[c], k + cz[c])]; if (v[c] > 0) pos++; else neg++; }
    if (!pos || !neg) continue;
    let sx = 0, sy = 0, sz = 0, n = 0; cp.length = 0;
    for (const [a, b] of E) { if ((v[a] > 0) === (v[b] > 0)) continue; const t = v[a] / (v[a] - v[b]); const ex = cx[a] + (cx[b] - cx[a]) * t, ey = cy[a] + (cy[b] - cy[a]) * t, ez = cz[a] + (cz[b] - cz[a]) * t; sx += ex; sy += ey; sz += ez; n++; cp.push(ex, ey, ez); }
    vid[V(i, j, k)] = P.length / 3;
    const mx = B.x0 + (i + sx / n) * res, my = B.y0 + (j + sy / n) * res, mz = B.z0 + (k + sz / n) * res;
    if (!dc || looseAt(mx, my, mz) > 0.25) { P.push(mx, my, mz); continue; }
    // dual contouring (QEF on the crossing planes, weak pull to the mass point): box edges and corners stay SHARP
    // instead of the 0.3–0.6 m surface-nets chamfer — lattice spots near a ledge edge read the collider's top, small
    // boulders keep their size (no floor mismatch / invisible wall at edges)
    let a00 = LAM, a01 = 0, a02 = 0, a11 = LAM, a12 = 0, a22 = LAM, b0 = LAM * mx, b1 = LAM * my, b2 = LAM * mz;
    for (let q = 0; q < cp.length; q += 3) {
      const px = B.x0 + (i + cp[q]) * res, py = B.y0 + (j + cp[q + 1]) * res, pz = B.z0 + (k + cp[q + 2]) * res;
      if (py < C.groundAt(px, pz) - 2.3) continue;   // clamped (deep) field: no real plane
      let gx = sdf(px + GE, py, pz) - sdf(px - GE, py, pz), gy = sdf(px, py + GE, pz) - sdf(px, py - GE, pz), gz = sdf(px, py, pz + GE) - sdf(px, py, pz - GE);
      const l = Math.hypot(gx, gy, gz); if (!(l > 1e-6)) continue; gx /= l; gy /= l; gz /= l;
      const d = gx * px + gy * py + gz * pz;
      a00 += gx * gx; a01 += gx * gy; a02 += gx * gz; a11 += gy * gy; a12 += gy * gz; a22 += gz * gz; b0 += gx * d; b1 += gy * d; b2 += gz * d;
    }
    const c00 = a11 * a22 - a12 * a12, c01 = a02 * a12 - a01 * a22, c02 = a01 * a12 - a02 * a11, det = a00 * c00 + a01 * c01 + a02 * c02;
    let qx = mx, qy = my, qz = mz;
    if (Math.abs(det) > 1e-9) {
      const c11 = a00 * a22 - a02 * a02, c12 = a01 * a02 - a00 * a12, c22 = a00 * a11 - a01 * a01;
      qx = (c00 * b0 + c01 * b1 + c02 * b2) / det; qy = (c01 * b0 + c11 * b1 + c12 * b2) / det; qz = (c02 * b0 + c12 * b1 + c22 * b2) / det;
    }
    // stay inside the cell (+10 %)
    const lo = (o: number, q: number) => Math.min(o + res * 1.1, Math.max(o - res * 0.1, q));
    P.push(lo(B.x0 + i * res, qx), lo(B.y0 + j * res, qy), lo(B.z0 + k * res, qz));
  }
  const T: number[] = [];
  // every quad is wound from ITS OWN geometry (the dual quad's normal must point along the sign-changing edge,
  // toward the outside sample) and split along its shorter diagonal. Re-winding single triangles against the vertex
  // normals instead flips odd triangles to back faces on creased / folded plates: blue sky slivers through the vault.
  const quad = (a: number, b: number, c: number, d: number, axis: 0 | 1 | 2, outNeg: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // cull quads fully under the terrain
    let under = 0; for (const q of [a, b, c, d]) if (P[q * 3 + 1] < C.groundAt(P[q * 3], P[q * 3 + 2]) - 0.35) under++;
    if (under === 4) return;
    const px = (q: number, k: number) => P[q * 3 + k];
    const e1 = [px(c, 0) - px(a, 0), px(c, 1) - px(a, 1), px(c, 2) - px(a, 2)], e2 = [px(d, 0) - px(b, 0), px(d, 1) - px(b, 1), px(d, 2) - px(b, 2)];
    const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if ((nrm[axis] < 0) !== outNeg) { const t = b; b = d; d = t; }
    const ac = Math.hypot(e1[0], e1[1], e1[2]), bd = Math.hypot(e2[0], e2[1], e2[2]);
    if (ac <= bd) T.push(a, b, c, a, c, d); else T.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = F[I(i, j, k)] > 0;
    if (s0 !== (F[I(i + 1, j, k)] > 0)) quad(vid[V(i, j - 1, k - 1)], vid[V(i, j, k - 1)], vid[V(i, j, k)], vid[V(i, j - 1, k)], 0, s0);
    if (s0 !== (F[I(i, j + 1, k)] > 0)) quad(vid[V(i - 1, j, k - 1)], vid[V(i - 1, j, k)], vid[V(i, j, k)], vid[V(i, j, k - 1)], 1, s0);
    if (s0 !== (F[I(i, j, k + 1)] > 0)) quad(vid[V(i - 1, j - 1, k)], vid[V(i, j - 1, k)], vid[V(i, j, k)], vid[V(i - 1, j, k)], 2, s0);
  }
  // normals from the field gradient; baked AO (field + terrain)
  const nv = P.length / 3, N = new Float32Array(nv * 3), AO = new Float32Array(nv).fill(1), e = 0.22;
  const f = (x: number, y: number, z: number) => Math.min(sdf(x, y, z), (y - C.groundAt(x, z)) * 0.8 + 0.35);
  for (let q = 0; q < nv; q++) {
    const x = P[q * 3], y = P[q * 3 + 1], z = P[q * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
    N[q * 3] = gx; N[q * 3 + 1] = gy; N[q * 3 + 2] = gz;
    if (withAO) {
      let occ = 0, sca = 1;
      for (let s = 1; s <= 5; s++) { const h = 0.3 * s + 0.05 * s * s; occ += (h - f(x + gx * h, y + gy * h, z + gz * h)) * sca; sca *= 0.62; }
      AO[q] = Math.max(0.12, Math.min(1, 1 - 0.55 * occ));
    }
  }
  // diagnostic: faces whose winding disagrees with the field gradient (only counted, never flipped)
  let disagree = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    const ax = N[a * 3] + N[b * 3] + N[c * 3], ay = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], az = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * ax + fy * ay + fz * az < 0) disagree++;
  }
  if (disagree) console.log(`  (${disagree} faces disagree with the gradient normal — kept, wound from the geometry)`);
  console.log(`  surface: ${nv} verts, ${T.length / 3} tris (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return { P, N, AO, T };
}

/** split into xz chunks, re-index, quantize */
function pack(m: ReturnType<typeof surfaceNets>, cxn: number, czn: number) {
  const B = BOUNDS, W = B.x1 - B.x0, D = B.z1 - B.z0, H = B.y1 - B.y0;
  const buckets: number[][] = Array.from({ length: cxn * czn }, () => []);
  for (let t = 0; t < m.T.length; t += 3) {
    const a = m.T[t], b = m.T[t + 1], c = m.T[t + 2];
    const x = (m.P[a * 3] + m.P[b * 3] + m.P[c * 3]) / 3, z = (m.P[a * 3 + 2] + m.P[b * 3 + 2] + m.P[c * 3 + 2]) / 3;
    const ix = Math.min(cxn - 1, Math.floor((x - B.x0) / W * cxn)), iz = Math.min(czn - 1, Math.floor((z - B.z0) / D * czn));
    buckets[iz * cxn + ix].push(a, b, c);
  }
  const chunks: Array<{ pos: Uint16Array; nrm: Int8Array; ao: Uint8Array; idx: Uint16Array | Uint32Array; bbox: number[] }> = [];
  for (const tri of buckets) {
    if (!tri.length) continue;
    const map = new Map<number, number>(), verts: number[] = [];
    const idx = tri.map((v) => { let o = map.get(v); if (o === undefined) { o = verts.length; map.set(v, o); verts.push(v); } return o; });
    const pos = new Uint16Array(verts.length * 3), nrm = new Int8Array(verts.length * 3), ao = new Uint8Array(verts.length), bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    verts.forEach((v, o) => {
      const x = m.P[v * 3], y = m.P[v * 3 + 1], z = m.P[v * 3 + 2];
      pos[o * 3] = Math.round((x - B.x0) / W * 65535); pos[o * 3 + 1] = Math.round((y - B.y0) / H * 65535); pos[o * 3 + 2] = Math.round((z - B.z0) / D * 65535);
      for (let a = 0; a < 3; a++) nrm[o * 3 + a] = Math.round(m.N[v * 3 + a] * 127);
      ao[o] = Math.round(m.AO[v] * 255);
      bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.min(bb[2], z); bb[3] = Math.max(bb[3], x); bb[4] = Math.max(bb[4], y); bb[5] = Math.max(bb[5], z);
    });
    chunks.push({ pos, nrm, ao, idx: verts.length < 65536 ? new Uint16Array(idx) : new Uint32Array(idx), bbox: bb.map((q) => Math.round(q * 100) / 100) });
  }
  return chunks;
}

function writeBin(file: string, header: Record<string, unknown>, blobs: ArrayBufferView[]) {
  const offs: number[][] = []; let off = 0;
  for (const b of blobs) { off = (off + 3) & ~3; offs.push([off, b.byteLength]); off += b.byteLength; }
  const hj = Buffer.from(JSON.stringify({ ...header, blobs: offs }), "utf8"), hlen = (hj.length + 3) & ~3;
  const out = Buffer.alloc(4 + hlen + off);
  out.writeUInt32LE(hlen, 0); hj.copy(out, 4); out.fill(32, 4 + hj.length, 4 + hlen);
  blobs.forEach((b, i) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).copy(out, 4 + hlen + offs[i][0]));
  // a full disk must never leave a truncated .bin behind for the live game: the .tmp proves the space, then the bytes
  // are copied OVER the existing file (a rename made vite's public-file watcher drop rock.bin: the dev server answered
  // index.html for it until the file was re-added)
  fs.writeFileSync(file + ".tmp", out); fs.copyFileSync(file + ".tmp", file); fs.unlinkSync(file + ".tmp");
  console.log(`  wrote ${path.relative(process.cwd(), file)} ${(out.length / 1024 / 1024).toFixed(2)} MB`);
}

// ---------------------------------------------------------------------------------------------- rock
console.log(`bake COCO CAVES rock (hash ${LAYOUT_HASH}) bounds`, BOUNDS);
const hi = surfaceNets(RES, true, !argv.includes("--no-dc")), lo = surfaceNets(1.6, false);
const hiC = pack(hi, 5, 5), loC = pack(lo, 2, 2);
{
  const blobs: ArrayBufferView[] = [], chunks: unknown[] = [];
  for (const [lod, list] of [["hi", hiC], ["lo", loC]] as const) for (const c of list) { chunks.push({ lod, n: c.ao.length, ni: c.idx.length, i32: c.idx instanceof Uint32Array, bbox: c.bbox }); blobs.push(c.pos, c.nrm, c.ao, c.idx); }
  writeBin(path.join(OUT, "rock.bin"), { v: 1, hash: LAYOUT_HASH, bounds: BOUNDS, chunks }, blobs);
}

// ---------------------------------------------------------------------------------------------- light volume
if (!argv.includes("--no-light")) {
  const Vb = { x0: -782, y0: 38, z0: -382, nx: 124, ny: 38, nz: 116, res: 1 };
  const srgbLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lamps = C.LAMPS.map((L) => {
    const hex = parseInt(L.color.slice(1), 16), r = srgbLin(((hex >> 16) & 255) / 255), g = srgbLin(((hex >> 8) & 255) / 255), b = srgbLin((hex & 255) / 255);
    // push a lamp out of the rock it may be embedded in (wall crystals)
    let { x, y, z } = L;
    for (let it = 0; it < 40; it++) { const d = sdf(x, y, z); if (d > 0.45) break; const e = 0.2, gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e), l = Math.hypot(gx, gy, gz) || 1; x += gx / l * 0.25; y += gy / l * 0.25; z += gz / l * 0.25; }
    return { x, y, z, r, g, b, power: L.power, range: Math.sqrt(L.power * 12 / 0.04) };
  });
  // cosine-weighted hemisphere (Fibonacci), 64 rays, rotated per voxel (the trilinear fetch averages the noise)
  const dirs: number[][] = []; const NR = 64;
  for (let i = 0; i < NR; i++) { const u = (i + 0.5) / NR, r = Math.sqrt(u), a = i * 2.399963; dirs.push([r * Math.cos(a), Math.sqrt(1 - u), r * Math.sin(a)]); }
  const escapeY = BOUNDS.y1 + 1, xz: [number, number, number, number] = [BOUNDS.x0 - 4, BOUNDS.z0 - 4, BOUNDS.x1 + 4, BOUNDS.z1 + 4];
  const NW = Number(argv[argv.indexOf("--workers") + 1] || 0) || Math.min(12, Math.max(2, (await import("node:os")).cpus().length - 8));
  const plane = Vb.nx * Vb.ny, rgba = new Uint8Array(Vb.nz * plane * 4), sunv = new Uint8Array(Vb.nz * plane);
  const jobs: Array<[number, number]> = []; for (let k = 0; k < Vb.nz; k += 4) jobs.push([k, Math.min(Vb.nz, k + 4)]);
  let done = 0;
  await new Promise<void>((resolve, reject) => {
    let active = 0;
    const next = () => {
      if (!jobs.length) { if (!active) resolve(); return; }
      const [k0, k1] = jobs.shift()!; active++;
      const w = new Worker(new URL("./light-worker.mts", import.meta.url), { workerData: { V: Vb, k0, k1, lamps, dirs, escapeY, xz }, execArgv: ["--import", "tsx"] });
      w.on("message", (m: { k0: number; k1: number; rgba: Uint8Array; sunv: Uint8Array }) => { rgba.set(m.rgba, m.k0 * plane * 4); sunv.set(m.sunv, m.k0 * plane); done += m.k1 - m.k0; });
      w.on("error", reject);
      w.on("exit", () => { active--; if (done % 16 < 4) process.stdout.write(`  light ${done}/${Vb.nz} slices (${((Date.now() - t0) / 1000).toFixed(0)} s)\r`); next(); });
    };
    for (let i = 0; i < NW; i++) next();
  });
  console.log("");
  writeBin(path.join(OUT, "light.bin"), { v: 1, hash: LAYOUT_HASH, vol: Vb, enc: "rgb=sqrt(E/12), a=sky; sun r8" }, [rgba, sunv]);
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
