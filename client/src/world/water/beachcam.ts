// Solves the biome-01-beach view camera on the LIVE terrain (the terrain area regenerates the island; a hard-coded
// camera ends up inland or in the sea). Target composition: standing on dry sand a few metres
// from the waterline, the shoreline running away ahead-right, clear shallows filling the right half, the beach
// receding ahead, land/jungle/cliffs rising on the left, a far headland across the water, the sun ahead-right and
// high (out of frame), horizon ~70 % down the frame (pitch up ~13°), no tree trunk in the near foreground.
// Only runs when ?view=biome-01-beach is requested (~150–400 ms incl. the deterministic veg scatter replay).
import type { Terrain } from "../../../../shared/world/terrain";
import { Biome } from "../../../../shared/world/map";
import type { CamSpec } from "../../engine/views";

const SUN_AZ = -34; // atmos midday preset (deg, 0 = north, 90 = east)

export interface BeachCandidate { x: number; z: number; az: number; score: number; note: string }

/** every candidate that passes the hard tests, best first */
export async function beachCandidates(T: Terrain, anchor: [number, number] = [120, -665], radius = 420): Promise<BeachCandidate[]> {
  const H = (x: number, z: number) => T.height(x, z);
  // trunks from the veg area's deterministic scatter (same seed as the client/server) — keep them out of the frame
  let trunks: Array<[number, number]> = [];
  try {
    const veg = await import("../../../../shared/world/veg-scatter");
    const pois = await import("../../../../shared/pois/index");
    const clear = (pois as unknown as { allClearings?: () => unknown[] }).allClearings?.() ?? [];
    trunks = veg.scatterVegetation(T, clear as Parameters<typeof veg.scatterVegetation>[1])
      .filter((v) => v.kind === "palm" || v.kind === "palm-leaning" || v.kind === "jungle-tree" || v.kind === "bamboo" || v.kind === "mangrove")
      .filter((v) => Math.hypot(v.x - anchor[0], v.z - anchor[1]) < radius + 40)
      .map((v) => [v.x, v.z]);
  } catch { /* scatter unavailable: skip the trunk test */ }
  const out: BeachCandidate[] = [];
  const ray = (x: number, z: number, az: number, r: number) => { const b = (az * Math.PI) / 180; return H(x + Math.sin(b) * r, z - Math.cos(b) * r); };
  for (let z = anchor[1] - radius; z <= anchor[1] + radius; z += 4) for (let x = anchor[0] - radius; x <= anchor[0] + radius; x += 4) {
    if (Math.hypot(x - anchor[0], z - anchor[1]) > radius) continue;
    const h = H(x, z); if (h < 0.45 || h > 2.4) continue;
    if (T.biomeAt(x, z) !== Biome.Beach) continue;
    let dw = 99;
    for (let a = 0; a < 16 && dw > 3; a++) { const ang = (a / 16) * Math.PI * 2; for (let r = 2; r <= 16; r++) if (H(x + Math.cos(ang) * r, z + Math.sin(ang) * r) < 0) { dw = Math.min(dw, r); break; } }
    if (dw < 4 || dw > 13) continue;
    for (let az = -180; az < 180; az += 6) {
      // right half: open water from ~15 m out to 250 m
      let wR = 0, nR = 0;
      for (const off of [8, 15, 22, 29]) for (let r = 18; r <= 258; r += 30) { nR++; if (ray(x, z, az + off, r) < -0.3) wR++; }
      if (wR < nR * 0.8) continue;
      // near right foreground: the shallows start close (the waterline crosses the lower-right of the frame)
      let nearW = 0; for (const off of [12, 20, 28]) for (const r of [6, 9, 12]) if (ray(x, z, az + off, r) < 0.05) nearW++;
      if (nearW < 3) continue;
      // the swash must be VISIBLE: no berm / sand-bank lip between the eye and the waterline on the right (a steep bank
      // hides the whole foam line behind its crest)
      let hid = 0;
      for (const off of [10, 18, 26, 34]) {
        let rw = -1; for (let r = 1.5; r <= 24; r += 0.5) if (ray(x, z, az + off, r) < 0.02) { rw = r; break; }
        if (rw < 0) { hid++; continue; }
        const eye = h + 1.7;
        for (let r = 0.5; r < rw; r += 0.5) { const los = eye + (0.05 - eye) * (r / rw); if (ray(x, z, az + off, r) > los - 0.04) { hid++; break; } }
      }
      if (hid > 1) continue;
      // NO cliff / rock wall in the near frame: the target art's foreground is open sand (hills stand 60+ m back)
      let wall = 0; for (let off = -40; off <= 12; off += 6) for (let r = 4; r <= 34; r += 3) if (ray(x, z, az + off, r) > h + 2.2) wall++;
      if (wall > 1) continue;
      // the sandy shallow shelf on the right (0.2–2.5 m deep, 10–45 m out): the glass-clear turquoise of the target art
      let shelf = 0, nS = 0; for (const off of [14, 22, 30, 38]) for (let r = 10; r <= 46; r += 6) { nS++; const d = -ray(x, z, az + off, r); if (d > 0.15 && d < 2.6) shelf++; }
      // left: land within 25..145 m, and hills/jungle rising 8–60 m further back (60–220 m)
      let lL = 0, nL = 0, rise = 0;
      for (const off of [-12, -20, -28]) for (let r = 25; r <= 145; r += 20) { nL++; const hh = ray(x, z, az + off, r); if (hh > 0.4) lL++; }
      if (lL < nL * 0.7) continue;
      for (const off of [-8, -16, -26, -36]) for (let r = 60; r <= 220; r += 20) rise = Math.max(rise, ray(x, z, az + off, r));
      // ahead: the beach recedes (low sand) + a far headland across the water on the right
      let ahead = 0; for (let r = 30; r <= 190; r += 20) { const hh = ray(x, z, az + 3, r); if (hh > 0.1 && hh < 5) ahead++; }
      let head = 0; for (const off of [8, 14, 20, 26]) for (let r = 350; r <= 900; r += 50) if (ray(x, z, az + off, r) > 3) { head++; break; }
      let rel = SUN_AZ - az; while (rel > 180) rel -= 360; while (rel < -180) rel += 360;
      const sun = rel > 0 && rel < 80 ? 3 : rel >= 80 && rel < 120 ? 1 : 0;
      // trunks in the near frame (3..14 m, ±24°) are a hard fail; 14..30 m in the centre a penalty
      let block = 0;
      const b = (az * Math.PI) / 180, fx = Math.sin(b), fz = -Math.cos(b);
      for (const [tx, tz] of trunks) {
        const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz); if (d > 30 || d < 0.5) continue;
        const cos = (dx * fx + dz * fz) / d; if (cos < 0.9) continue; // outside ±26°
        block += d < 14 ? 10 : 1;
      }
      if (block >= 10) continue;
      const hills = rise < 8 ? rise / 8 : rise < 60 ? 1 : Math.max(0, 1 - (rise - 60) / 60);
      const score = (wR / nR) * 3 + (lL / nL) * 2 + hills * 2.5 + (ahead / 9) * 3 + (shelf / nS) * 4 + head * 1.0 + sun + nearW * 0.2 - block * 0.8
        - Math.hypot(x - anchor[0], z - anchor[1]) / radius * 0.5;
      out.push({ x, z, az, score, note: `shelf ${shelf}/${nS} rise ${rise.toFixed(0)} ahead ${ahead} head ${head} sun ${sun}` });
    }
  }
  return out.sort((p, q) => q.score - p.score);
}

export async function solveBeachView(T: Terrain, anchor: [number, number] = [120, -665], radius = 420): Promise<CamSpec | null> {
  const c = (await beachCandidates(T, anchor, radius))[0];
  if (!c) return null;
  const b = (c.az * Math.PI) / 180, y = T.height(c.x, c.z) + 1.7;
  return {
    pos: [c.x, y, c.z],
    target: [c.x + Math.sin(b) * 100, y + 23, c.z - Math.cos(b) * 100],
    fov: 60, rel: false, t: 12,
    note: `water area: solved on the live terrain (az ${c.az}°, score ${c.score.toFixed(1)}, ${c.note})`,
  };
}
