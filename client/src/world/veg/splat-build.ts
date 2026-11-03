// Gaussian-splat bake, CPU half (pure: runs in splat-worker.ts, or on the main thread as a fallback).
//
// Input: one species captured from many directions by splat-bake.ts — per view an orthographic tile of the graded albedo
// (+ coverage) and of the object-space normal + linear depth. Every covered pixel becomes a surface sample (position,
// albedo, normal, the area it stands for); samples go into a fine voxel grid as additive MOMENTS (weight, Σp, Σppᵀ,
// Σalbedo, Σnormal, visible area per view). A level of N splats re-bins those fine voxels into a coarser grid whose cell
// size is searched until the occupied cells fit N; each cell is one anisotropic 3D Gaussian: mean = centroid, covariance
// = the samples' spread (a leaf spray is a flat disc, a trunk segment a needle), colour = mean albedo, normal = mean
// normal, opacity = how much of its own footprint the samples actually covered (max over the views that see it).
// Levels are independent (4096 … 16 splats): the renderer dissolves between neighbouring levels by screen size.
export interface SplatCaptureView {
  /** camera position, right, up, forward (object space, relative to the plant origin) */
  o: [number, number, number]; r: [number, number, number]; u: [number, number, number]; f: [number, number, number];
  /** ortho half extent (m), near, far */
  half: number; near: number; far: number;
  /** tile origin in the atlas (px) */
  tx: number; ty: number;
}

export interface SplatBuildInput {
  id: string;
  res: number;
  width: number; height: number;
  views: SplatCaptureView[];
  /** atlas RGBA8: graded albedo rgb + coverage */
  rgba: Uint8Array;
  /** atlas RGBA8: normal oct (x, y) + depth (hi, lo) — 16-bit linear depth */
  nd: Uint8Array;
  /** plant bounding sphere (object space) */
  center: [number, number, number]; radius: number;
  /** splats per level (finest first) */
  levels: number[];
  /** gaussian footprint scale over the samples' spread (gaps between neighbours close) */
  spread: number;
  /** minimum thickness of a splat as a fraction of its largest axis */
  thick: number;
}

export interface SplatBuildOutput {
  id: string;
  /** levels concatenated (finest first), SPLAT_FLOATS per splat */
  data: Float32Array;
  levels: number[];
  /** per level: real (non-padding) splat count */
  used: number[];
  ms: number;
  /** sample accumulation part of ms, fine voxels */
  msAcc?: number; nf?: number;
}

/** floats per splat: [cx, cy, cz, opacity] [Σxx, Σxy, Σxz, Σyy] [Σyz, Σzz, rank, leaf share] [r, g, b, octNormal] */
export const SPLAT_FLOATS = 16;

const ST = 17; // fine-voxel stride (without the per-view areas): w, Σx Σy Σz, Σxx Σxy Σxz Σyy Σyz Σzz, Σr Σg Σb, Σnx Σny Σnz, Σleaf

function octDecode(x: number, y: number, out: number[]) {
  let nx = x * 2 - 1, ny = y * 2 - 1;
  const nz = 1 - Math.abs(nx) - Math.abs(ny);
  if (nz < 0) { const ox = nx; nx = (1 - Math.abs(ny)) * Math.sign(ox || 1); ny = (1 - Math.abs(ox)) * Math.sign(ny || 1); }
  const l = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
}

/** pack a unit normal (two 10-bit octahedral halves) + a 4-bit consistency into one float — splat.ts decodes it */
function octPack(x: number, y: number, z: number, cons = 1): number {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let u = x / s, v = y / s;
  if (z < 0) { const ou = u; u = (1 - Math.abs(v)) * Math.sign(ou || 1); v = (1 - Math.abs(ou)) * Math.sign(v || 1); }
  const qu = Math.round((u * 0.5 + 0.5) * 1023), qv = Math.round((v * 0.5 + 0.5) * 1023);
  return Math.round(Math.max(0, Math.min(1, cons)) * 15) * 1048576 + qu * 1024 + qv;
}

/** symmetric 3×3 eigen decomposition (Jacobi): returns eigenvalues in `w` and eigenvectors as columns of `V` (row-major) */
function eigSym(a: number[], w: number[], V: number[]) {
  const A = [a[0], a[1], a[2], a[1], a[3], a[4], a[2], a[4], a[5]];
  V.splice(0, 9, 1, 0, 0, 0, 1, 0, 0, 0, 1);
  for (let sweep = 0; sweep < 12; sweep++) {
    const off = Math.abs(A[1]) + Math.abs(A[2]) + Math.abs(A[5]);
    if (off < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = A[p * 3 + q];
      if (Math.abs(apq) < 1e-14) continue;
      const app = A[p * 3 + p], aqq = A[q * 3 + q];
      const th = (aqq - app) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = A[k * 3 + p], akq = A[k * 3 + q];
        A[k * 3 + p] = c * akp - s * akq; A[k * 3 + q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = A[p * 3 + k], aqk = A[q * 3 + k];
        A[p * 3 + k] = c * apk - s * aqk; A[q * 3 + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k * 3 + p], vkq = V[k * 3 + q];
        V[k * 3 + p] = c * vkp - s * vkq; V[k * 3 + q] = s * vkp + c * vkq;
      }
    }
  }
  w[0] = A[0]; w[1] = A[4]; w[2] = A[8];
}

const hash = (i: number) => { const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s); };

export function buildSplats(inp: SplatBuildInput): SplatBuildOutput {
  const t0 = performance.now();
  const { res, width, views, rgba, nd, radius: R } = inp;
  const NV = views.length;
  const S = ST + NV;
  const C = inp.center;
  // fine voxels (object space relative to the bounding centre): ~R/90 — finer than any level's cell
  const v0 = R / 90;
  const K = 512, OFF = 256;
  const map = new Map<number, number>();
  let stats = new Float64Array(S * 4096);
  let nf = 0;
  const nrm = [0, 0, 0];
  for (let j = 0; j < NV; j++) {
    const vw = views[j];
    const pix = (2 * vw.half) / res, area = pix * pix;
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const q = ((vw.ty + y) * width + (vw.tx + x)) * 4;
        if (rgba[q + 3] < 128) continue;
        const px = ((x + 0.5) / res * 2 - 1) * vw.half, py = ((y + 0.5) / res * 2 - 1) * vw.half;
        const d = (nd[q + 2] * 256 + nd[q + 3]) / 65535;
        if (d >= 0.99999) continue;
        const z = vw.near + d * (vw.far - vw.near);
        const X = vw.o[0] + vw.r[0] * px + vw.u[0] * py + vw.f[0] * z - C[0];
        const Y = vw.o[1] + vw.r[1] * px + vw.u[1] * py + vw.f[1] * z - C[1];
        const Z = vw.o[2] + vw.r[2] * px + vw.u[2] * py + vw.f[2] * z - C[2];
        const ix = Math.floor(X / v0) + OFF, iy = Math.floor(Y / v0) + OFF, iz = Math.floor(Z / v0) + OFF;
        if (ix < 0 || iy < 0 || iz < 0 || ix >= K || iy >= K || iz >= K) continue;
        const key = (iz * K + iy) * K + ix;
        let idx = map.get(key);
        if (idx === undefined) {
          idx = nf++;
          map.set(key, idx);
          if (nf * S > stats.length) { const b = new Float64Array(stats.length * 2); b.set(stats); stats = b; }
        }
        octDecode(nd[q] / 255, nd[q + 1] / 255, nrm);
        const o = idx * S, w = area;
        stats[o] += w;
        stats[o + 1] += w * X; stats[o + 2] += w * Y; stats[o + 3] += w * Z;
        stats[o + 4] += w * X * X; stats[o + 5] += w * X * Y; stats[o + 6] += w * X * Z;
        stats[o + 7] += w * Y * Y; stats[o + 8] += w * Y * Z; stats[o + 9] += w * Z * Z;
        stats[o + 10] += w * rgba[q] / 255; stats[o + 11] += w * rgba[q + 1] / 255; stats[o + 12] += w * rgba[q + 2] / 255;
        stats[o + 13] += w * nrm[0]; stats[o + 14] += w * nrm[1]; stats[o + 15] += w * nrm[2];
        stats[o + 16] += rgba[q + 3] > 200 ? w : 0;
        stats[o + ST + j] += area;
      }
    }
  }
  const tAcc = performance.now() - t0;
  // fine-voxel centroids (binning key for the levels)
  const cen = new Float32Array(nf * 3);
  for (let i = 0; i < nf; i++) { const o = i * S, w = stats[o] || 1; cen[i * 3] = stats[o + 1] / w; cen[i * 3 + 1] = stats[o + 2] / w; cen[i * 3 + 2] = stats[o + 3] / w; }

  const total = inp.levels.reduce((a, b) => a + b, 0);
  const data = new Float32Array(total * SPLAT_FLOATS);
  const w3 = [0, 0, 0], V = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const floor2 = (v0 * v0) / 12;
  /** one gaussian from a cluster's summed moments (acc[o …]) into data[q …] */
  const emit = (acc: Float64Array, o: number, q: number, rank: number): boolean => {
    const w = acc[o];
    if (w <= 0) return false;
    const mx = acc[o + 1] / w, my = acc[o + 2] / w, mz = acc[o + 3] / w;
    const cov = [acc[o + 4] / w - mx * mx, acc[o + 5] / w - mx * my, acc[o + 6] / w - mx * mz, acc[o + 7] / w - my * my, acc[o + 8] / w - my * mz, acc[o + 9] / w - mz * mz];
    eigSym(cov, w3, V);
    let smax = 0;
    for (let e = 0; e < 3; e++) { w3[e] = Math.max(w3[e], floor2); smax = Math.max(smax, w3[e]); }
    const th2 = smax * inp.thick * inp.thick, sp2 = inp.spread * inp.spread;
    for (let e = 0; e < 3; e++) w3[e] = Math.max(w3[e], th2) * sp2;
    const Sg = [0, 0, 0, 0, 0, 0];
    const idx = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]];
    for (let t = 0; t < 6; t++) { const [a, b] = idx[t]; let s = 0; for (let e = 0; e < 3; e++) s += V[a * 3 + e] * w3[e] * V[b * 3 + e]; Sg[t] = s; }
    // opacity: the samples' visible area over the gaussian's projected area (2π √det Σ₂), best view
    let op = 0;
    for (let j = 0; j < NV; j++) {
      const A = acc[o + ST + j];
      if (A <= 0) continue;
      const r = views[j].r, u = views[j].u;
      const Sr = [Sg[0] * r[0] + Sg[1] * r[1] + Sg[2] * r[2], Sg[1] * r[0] + Sg[3] * r[1] + Sg[4] * r[2], Sg[2] * r[0] + Sg[4] * r[1] + Sg[5] * r[2]];
      const Su = [Sg[0] * u[0] + Sg[1] * u[1] + Sg[2] * u[2], Sg[1] * u[0] + Sg[3] * u[1] + Sg[4] * u[2], Sg[2] * u[0] + Sg[4] * u[1] + Sg[5] * u[2]];
      const a = r[0] * Sr[0] + r[1] * Sr[1] + r[2] * Sr[2], b = r[0] * Su[0] + r[1] * Su[1] + r[2] * Su[2], d = u[0] * Su[0] + u[1] * Su[1] + u[2] * Su[2];
      const det = Math.max(a * d - b * b, 1e-12);
      op = Math.max(op, A / (2 * Math.PI * Math.sqrt(det)));
    }
    let nx = acc[o + 13], ny = acc[o + 14], nz = acc[o + 15];
    const nl = Math.hypot(nx, ny, nz);
    // mixed normals (a cluster of leaves facing every way): lean on the outward direction from the crown centre
    const cons = nl / w;
    const ol = Math.hypot(mx, my, mz) || 1;
    // (mixed normals — a trunk segment, a ball of leaves — keep their mean direction and a low consistency: the
    // renderer leans them toward the viewer, the half of them that is seen)
    if (nl > 0) { nx /= nl; ny /= nl; nz /= nl; } else { nx = mx / ol; ny = my / ol; nz = mz / ol; }
    data[q] = mx + C[0]; data[q + 1] = my + C[1]; data[q + 2] = mz + C[2]; data[q + 3] = Math.min(1, op);
    data[q + 4] = Sg[0]; data[q + 5] = Sg[1]; data[q + 6] = Sg[2]; data[q + 7] = Sg[3];
    data[q + 8] = Sg[4]; data[q + 9] = Sg[5]; data[q + 10] = hash(rank); data[q + 11] = acc[o + 16] / w;
    data[q + 12] = acc[o + 10] / w; data[q + 13] = acc[o + 11] / w; data[q + 14] = acc[o + 12] / w; data[q + 15] = octPack(nx, ny, nz, cons);
    return true;
  };

  // ---- divisive clustering (PCA split, largest error first): one hierarchy, a snapshot per level. A cluster's error is
  // its weight × (largest spread + colour spread): leaf sprays, fronds and trunks come out as their own elongated
  // gaussians long before the dense crown mass is subdivided.
  const perm = new Int32Array(nf); for (let i = 0; i < nf; i++) perm[i] = i;
  interface Cl { s: number; e: number; err: number; ax: [number, number, number]; m: [number, number, number] }
  const colK = (0.3 * R) * (0.3 * R);
  const tmp = new Float64Array(S);
  const sumRange = (s0: number, e0: number, out: Float64Array, n = S) => {
    out.fill(0);
    for (let i = s0; i < e0; i++) { const o = perm[i] * S; for (let k = 0; k < n; k++) out[k] += stats[o + k]; }
  };
  const mkCl = (s0: number, e0: number): Cl => {
    // (the split needs only the moments, not the per-view areas)
    sumRange(s0, e0, tmp, ST);
    const w = tmp[0] || 1e-9;
    const mx = tmp[1] / w, my = tmp[2] / w, mz = tmp[3] / w;
    const cov = [tmp[4] / w - mx * mx, tmp[5] / w - mx * my, tmp[6] / w - mx * mz, tmp[7] / w - my * my, tmp[8] / w - my * mz, tmp[9] / w - mz * mz];
    eigSym(cov, w3, V);
    let e = 0; for (let k = 1; k < 3; k++) if (w3[k] > w3[e]) e = k;
    // colour spread (Σc² is not tracked: approximate it by the per-voxel means' scatter)
    let cv = 0;
    if (e0 - s0 > 1) {
      const cr = tmp[10] / w, cg = tmp[11] / w, cb = tmp[12] / w;
      for (let i = s0; i < e0; i++) { const o = perm[i] * S, wi = stats[o] || 1e-9; cv += stats[o] * ((stats[o + 10] / wi - cr) ** 2 + (stats[o + 11] / wi - cg) ** 2 + (stats[o + 12] / wi - cb) ** 2); }
      cv /= w;
    }
    const err = e0 - s0 > 1 ? w * (Math.max(0, w3[e]) + colK * cv) : -1;
    return { s: s0, e: e0, err, ax: [V[e], V[3 + e], V[6 + e]], m: [mx, my, mz] };
  };
  // binary max-heap on err
  const heap: Cl[] = [];
  const push = (c: Cl) => { heap.push(c); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].err >= heap[i].err) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = (): Cl => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].err > heap[m].err) m = l; if (r < heap.length && heap[r].err > heap[m].err) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const done: Cl[] = [];
  if (nf) push(mkCl(0, nf));
  const used: number[] = [];
  const acc = new Float64Array(S);
  let base = 0;
  const snapshot = (L: number) => {
    const N = inp.levels[L];
    const all = [...heap, ...done];
    let k = 0;
    for (const c of all) {
      if (k >= N) break;
      sumRange(c.s, c.e, acc);
      if (emit(acc, 0, (base + k) * SPLAT_FLOATS, k + L * 7919)) k++;
    }
    used[L] = k;
  };
  // levels are listed finest first: snapshot coarse → fine as the hierarchy grows
  const order = inp.levels.map((n, i) => [n, i]).sort((a, b) => a[0] - b[0]);
  const offs: number[] = []; { let o = 0; for (const n of inp.levels) { offs.push(o); o += n; } }
  for (const [N, L] of order) {
    while (heap.length + done.length < N && heap.length) {
      const c = pop();
      if (c.err <= 0) { done.push(c); continue; }
      // partition [s, e) by the plane through the mean, normal = principal axis
      let i = c.s, j = c.e - 1;
      while (i <= j) {
        const f = perm[i];
        const d = (cen[f * 3] - c.m[0]) * c.ax[0] + (cen[f * 3 + 1] - c.m[1]) * c.ax[1] + (cen[f * 3 + 2] - c.m[2]) * c.ax[2];
        if (d < 0) i++; else { const t = perm[i]; perm[i] = perm[j]; perm[j] = t; j--; }
      }
      if (i === c.s || i === c.e) { // degenerate: split in the middle of the range
        i = (c.s + c.e) >> 1;
      }
      push(mkCl(c.s, i)); push(mkCl(i, c.e));
    }
    base = offs[L];
    snapshot(L);
  }
  return { id: inp.id, data, levels: inp.levels, used, ms: Math.round(performance.now() - t0), msAcc: Math.round(tAcc), nf };
}
