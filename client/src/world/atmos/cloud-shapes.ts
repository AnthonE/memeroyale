// Cloud prototypes: each stylized cumulus is a hierarchy of spheres — big LOBES (the cloud's masses), FLORETS on
// every lobe's upper surface (the cauliflower), BEADS on the florets (the fine lumpy outline) and a flat SKIRT along
// the base. The sphere list is smooth-unioned into a signed-distance volume on the GPU (cloud-bake.ts) and raymarched
// at runtime (clouds.ts). Units: the prototype's WIDTH is 1 (x), so a prototype scales uniformly to any size.
// Deterministic (seeded) — the same clouds every load, on every client.

/** puff = the aerial's fair-weather heaps (many small florets, seen from above at 300–600 px); cotton = the small
 *  distant puffs of the ground views (a few soft lobes: at 100–250 px many florets read as popcorn) */
export type CloudKind = "cumulus" | "tower" | "humilis" | "puff" | "cotton";

export interface CloudProto {
  kind: CloudKind;
  seed: number;
  /** spheres: x, y, z, r, k (smooth-union radius) — in width units, base plane at y = 0 */
  spheres: Float32Array;
  count: number;
  /** tight bounds of the solid (before the margin) */
  min: [number, number, number];
  max: [number, number, number];
}

export function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface S { x: number; y: number; z: number; r: number; k: number }

/** points on the upper part of a sphere, biased up + outward-sideways, well spread (golden-angle spiral + jitter) */
function capDirs(n: number, rng: () => number, minY: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const off = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * (1 - minY); // 1 .. minY
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const a = off + i * 2.39996 + (rng() - 0.5) * 0.7;
    const yj = Math.min(1, Math.max(minY, y + (rng() - 0.5) * 0.15));
    out.push([Math.cos(a) * rr, yj, Math.sin(a) * rr]);
  }
  return out;
}

export function sculptCloud(kind: CloudKind, seed: number): CloudProto {
  const rng = mulberry32(seed * 7919 + 17);
  const sph: S[] = [];
  const add = (x: number, y: number, z: number, r: number, k: number) => { sph.push({ x, y, z, r, k }); };

  // ---- lobes: the big masses along the cloud's long axis
  const cfg = {
    cumulus: { lobes: [3, 5], spread: 0.68, rMin: 0.13, rMax: 0.2, lift: 0.28, depth: 0.22, stack: 0.6 },
    tower: { lobes: [3, 4], spread: 0.55, rMin: 0.14, rMax: 0.21, lift: 0.5, depth: 0.2, stack: 0.8 },
    humilis: { lobes: [4, 6], spread: 0.76, rMin: 0.1, rMax: 0.15, lift: 0.12, depth: 0.2, stack: 0.3 },
    puff: { lobes: [4, 5], spread: 0.62, rMin: 0.12, rMax: 0.16, lift: 0.03, depth: 0.16, stack: 0.15 },
    cotton: { lobes: [3, 5], spread: 0.6, rMin: 0.13, rMax: 0.19, lift: 0.1, depth: 0.18, stack: 0.15 },
  }[kind];
  const nL = cfg.lobes[0] + Math.floor(rng() * (cfg.lobes[1] - cfg.lobes[0] + 1));
  const hero = Math.min(nL - 1, Math.max(0, Math.floor(nL * (0.3 + rng() * 0.4))));
  const lobes: S[] = [];
  if (kind === "puff") {
    // a fair-weather puff is an IRREGULAR
    // heap: a core heap + 2–3 ARMS that wander off it (random walks of shrinking lobes) — the aerial target art's puffs
    // are ragged blobs with a lobe trailing off one side, never an oval
    // the target art's puffs are FLAT, WIDE pancakes
    // (seen from 46° above: 2 : 1 on screen; ours were 1.4 : 1 tall heaps) — a low core, arms that also spread in depth,
    // lobes sitting low on the base (centre ≈ 0.3–0.45 R), a lower dome
    const R0 = 0.125 + rng() * 0.025;
    lobes.push({ x: 0, y: R0 * 0.48, z: 0, r: R0, k: R0 * 0.35 });
    lobes.push({ x: (rng() - 0.5) * R0, y: R0 * 0.36, z: (rng() < 0.5 ? 1 : -1) * R0 * (0.6 + rng() * 0.3), r: R0 * 0.8, k: R0 * 0.3 });
    const arms = 3 + Math.floor(rng() * 2);
    for (let arm = 0; arm < arms; arm++) {
      // arms leave the core mostly along the long axis (±x): the field turns that axis across the view, so from the
      // plane the puff is a wide flat blob, never a stack (a z arm reads as a vertical tower from 45° above)
      let a = (arm & 1 ? Math.PI : 0) + (rng() - 0.5) * 1.1 + (arm >= 2 ? (rng() < 0.5 ? 1 : -1) * 1.2 : 0);
      let x = 0, z = 0;
      const len = 2 + Math.floor(rng() * 3) + (arm === 0 ? 1 : 0);
      for (let k = 1; k <= len; k++) {
        a += (rng() - 0.5) * 0.9;
        const step = 0.07 + rng() * 0.035;
        x += Math.cos(a) * step; z += Math.sin(a) * step * 0.7;
        const R = R0 * (1 - (k / (len + 1)) * 0.55) * (0.75 + rng() * 0.4);
        lobes.push({ x, y: R * (0.3 + rng() * 0.15), z, r: R, k: R * 0.3 });
      }
    }
  } else for (let i = 0; i < nL; i++) {
    const t = nL === 1 ? 0.5 : i / (nL - 1);
    const edge = 1 - Math.abs(t - 0.5) * 2; // 0 at the ends, 1 in the middle
    const R = (cfg.rMin + (cfg.rMax - cfg.rMin) * (0.35 + 0.65 * edge) * (0.8 + rng() * 0.3)) * (i === hero ? 1.12 : 1);
    const x = (t - 0.5) * cfg.spread + (rng() - 0.5) * 0.05;
    const z = (rng() - 0.5) * cfg.depth;
    // lobes sit on the base (y centre ≈ 0.55 R) and rise toward the hero lobe: a domed profile
    const rise = cfg.lift * Math.pow(edge, 1.4) * (i === hero ? 1 : 0.35 + rng() * 0.35);
    const y = R * 0.55 + rise * 0.5;
    lobes.push({ x, y, z, r: R, k: R * 0.35 });
    // stacked turret on the hero lobe (and sometimes a neighbour): the towering cauliflower head
    if ((i === hero || rng() < 0.3 * cfg.stack) && cfg.stack > 0.2) {
      const R2 = R * (0.72 + rng() * 0.12);
      const dx = (rng() - 0.5) * R * 0.5, dz = (rng() - 0.5) * R * 0.3;
      lobes.push({ x: x + dx, y: y + R * (0.7 + cfg.stack * 0.35), z: z + dz, r: R2, k: R2 * 0.4 });
      if (kind === "tower" && i === hero && false) { // third turret retired: towers capped at ~0.8× width
        const R3 = R2 * 0.74;
        lobes.push({ x: x + dx * 1.4 + (rng() - 0.5) * R * 0.3, y: y + R * (0.7 + cfg.stack * 0.35) + R2 * 0.95, z: z + dz, r: R3, k: R3 * 0.4 });
      }
    }
  }
  // front/back filler lobes so the cloud has depth (reads as a mass from every side, incl. the aerial camera)
  const nFill = kind === "puff" ? 0 : kind === "cotton" ? 1 : Math.max(2, Math.floor(nL * 0.8));
  for (let i = 0; i < nFill; i++) {
    const a = lobes[Math.floor(rng() * lobes.length)];
    const side = rng() < 0.5 ? -1 : 1;
    const R = a.r * (0.62 + rng() * 0.18);
    lobes.push({ x: a.x + (rng() - 0.5) * a.r, y: Math.max(R * 0.5, a.y - a.r * 0.25), z: a.z + side * a.r * (0.55 + rng() * 0.2), r: R, k: R * 0.4 });
  }
  // lobe cores sit well inside the florets so the creases between florets are deep (scalloped cauliflower outline)
  for (const l of lobes) add(l.x, l.y, l.z, l.r * 0.8, l.k);

  // ---- florets: densely packed heads on each lobe's upper + side surface — THEY are the visible surface — and, round
  // the lobe's lower half, BELLY florets: the underside is packed rounded florets with creases (the bake only flattens
  // the lowest of them a little), not a plate
  // per-kind floret scale. Puffs (small on screen, seen from above): MANY distinct florets (≈ lobe/3, spaced ~1.5
  // radii so each is its own dome with a crease round it — the target art's cauliflower); big cumulus: fewer, bigger
  // florets (≈ lobe/2) = the big soft sub-lobes of the target art's hero clouds (no popcorn)
  // floret radii spread ~1:3 (r = r0 + r1·u²: many
  // small, a few big heads), their depth jittered more so some heads stand proud and small ones sit in the creases
  const FC = {
    // puffs — more, smaller heads (a finer cotton texture from the plane), still spread ~1:3
    puff: { n: [34, 42], r: [0.1, 0.16], d: 0.8, k: 0.55 },
    humilis: { n: [12, 15], r: [0.3, 0.2], d: 0.72, k: 0.3 },
    cotton: { n: [10, 12], r: [0.34, 0.24], d: 0.66, k: 0.3 },
    // (big cumulus keep their big soft sub-lobes, which hold up at 4K — only a mild spread)
    cumulus: { n: [10, 13], r: [0.38, 0.2], d: 0.66, k: 0.22 },
    tower: { n: [10, 13], r: [0.38, 0.2], d: 0.66, k: 0.22 },
  }[kind];
  const florets: Array<S & { nx: number; ny: number; nz: number }> = [];
  for (const L of lobes) {
    const n = FC.n[0] + Math.floor(rng() * (FC.n[1] - FC.n[0] + 1));
    for (const [dx, dy, dz] of capDirs(n, rng, -0.3)) {
      const u = rng();
      const r = L.r * (FC.r[0] + u * u * FC.r[1]);
      // big heads sit a little deeper (they bulge out anyway), small ones ride higher or nestle in the creases
      const jit = kind === "puff" || kind === "cotton" ? 0.14 : 0.06;
      const d = L.r * (FC.d + (rng() - 0.35) * jit - (u * u - 0.33) * 0.05);
      const f = { x: L.x + dx * d, y: L.y + dy * d, z: L.z + dz * d, r, k: r * FC.k, nx: dx, ny: dy, nz: dz };
      if (f.y - f.r * 0.5 < 0) continue; // the belly florets below cover that
      florets.push(f);
      add(f.x, f.y, f.z, f.r, f.k);
    }
    if (L.y - L.r > 0.12) continue; // a stacked turret: its underside is hidden inside the cloud
    const nb = 5 + Math.floor(rng() * 3);
    const off = rng() * Math.PI * 2;
    for (let i = 0; i < nb; i++) {
      // a ring under the lobe (outer florets, seen from below and in the silhouette's lower edge) + one under the core
      const a = off + (i / nb) * Math.PI * 2 + (rng() - 0.5) * 0.5;
      const ring = i === 0 ? 0 : 0.55 + rng() * 0.25;
      const r = L.r * (0.36 + rng() * 0.14);
      const x = L.x + Math.cos(a) * L.r * ring, z = L.z + Math.sin(a) * L.r * ring;
      // hang to ~0.02–0.045 below the base (the bake's soft plane at −0.03 flattens the lowest a little)
      const y = r - 0.02 - rng() * 0.025;
      add(x, y, z, r, r * 0.22);
    }
  }
  // ---- beads on the outward face of each floret: the finer scalloping (2–4 per floret)
  for (const F of florets) {
    if (F.ny < -0.2) continue;
    // (puffs: 2–4 beads — the aerial target art's cotton texture is finer than its florets)
    const n = kind === "puff" ? 2 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 3);
    for (const [dx, dy, dz] of capDirs(n, rng, 0.0)) {
      let ux = dx * 0.7 + F.nx * 0.75, uy = dy * 0.7 + F.ny * 0.75, uz = dz * 0.7 + F.nz * 0.75;
      const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
      const r = F.r * (0.3 + rng() * 0.16);
      const d = F.r * (0.66 + rng() * 0.06);
      const y = F.y + uy * d;
      if (y - r * 0.4 < 0) continue;
      // (puffs blend their beads softly — the aerial target art's cotton is fine soft lumps, not warts)
      add(F.x + ux * d, y, F.z + uz * d, r, r * (kind === "puff" ? 0.35 : 0.18));
    }
  }
  // ---- bridges: a low sphere between neighbouring lobes, so the underside is continuous (no gaps between the lobes'
  // bellies seen from below)
  const low = lobes.filter((l) => l.y - l.r < 0.12).sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < low.length; i++) {
    const a = low[i], b = low[i + 1];
    const r = Math.min(a.r, b.r) * 0.7;
    add((a.x + b.x) / 2, r * 0.75, (a.z + b.z) / 2, r, r * 0.35);
  }

  // ---- normalise: width (x extent of the solid) = 1, base at y = 0, centred in x/z
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (const s of sph) {
    mnx = Math.min(mnx, s.x - s.r); mxx = Math.max(mxx, s.x + s.r);
    mnz = Math.min(mnz, s.z - s.r); mxz = Math.max(mxz, s.z + s.r);
    mxy = Math.max(mxy, s.y + s.r);
  }
  mny = 0; // the base plane (the bake clips everything below y = BASE)
  const w = mxx - mnx, cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2;
  const out = new Float32Array(sph.length * 5);
  sph.forEach((s, i) => {
    out[i * 5] = (s.x - cx) / w; out[i * 5 + 1] = s.y / w; out[i * 5 + 2] = (s.z - cz) / w;
    out[i * 5 + 3] = s.r / w; out[i * 5 + 4] = s.k / w;
  });
  return {
    kind, seed, spheres: out, count: sph.length,
    min: [-0.5, mny / w, (mnz - cz) / w],
    max: [0.5, mxy / w, (mxz - cz) / w],
  };
}
