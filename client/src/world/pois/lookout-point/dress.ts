// LOOKOUT POINT — the signal hut, the plateau's dry-stone walls + boulders (cover), the keeper's attic
// furniture and rails: every piece drawn at EXACTLY its shared collider (shared/pois/lookout-point.ts HUT_LOCAL, LK_WALLS,
// LK_BOULDERS, COT_FURN attic entries, the attic stair rail).
import * as THREE from "three";
import * as L from "../../../../../shared/pois/lookout-point";
import { Batch, M, box, rbox, cyl, sph, addPieces, dressOpenings } from "../_kit/coast-kit";
import * as P from "../_kit/coast-props";
import { textDecal } from "../_kit/coast-sign";
import { crateBlock, drawRails, h01, plate, stairTreads } from "../peel-strip/coast-dress";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);

// ------------------------------------------------------------------------------------------------ signal hut
export function buildHut(b: Batch, bMid: Batch, bNear: Batch, glows: Array<{ p: THREE.Vector3; size: number }>) {
  const H = L.HUT, f = H.frame, { hx, hz, t, h } = H;
  for (const q of [b, bMid, bNear]) q.setFrame(f.x, f.y, f.z, f.yaw);
  addPieces(b, L.HUT_LOCAL, {
    "hut:floor": { mat: "stone", color: 0xaea696, tile: 1.4 },
    "hut:wall": { mat: "stone", color: 0xd8d0c0, tile: 1.3, ao: true },
    "hut:roof": { mat: "concrete", color: 0xc9c2b4, tile: 2 },
    "hut:parapet": { mat: "stone", color: 0xcfc6b4, tile: 1.3, round: 0.03 },
    "hut:crate": { mat: "wood", skip: true },
  }, 0);
  const od = { frame: 0xf0e8d8, frameW: 0.08, glass: "glass" as const, sill: 0xcfc6b4, leaf: 0xb8342a, swing: -1.2 };
  dressOpenings(b, -hx, hz - t / 2, hx, hz - t / 2, 0.2, [{ u: hx - 0.3, w: 1.2, y0: 0, h: 2.25 }], t, od);
  dressOpenings(b, hx, -hz + t / 2, -hx, -hz + t / 2, 0.2, [{ u: hx, w: 0.9, y0: 0.9, h: 0.8 }], t, od);
  dressOpenings(b, hx - t / 2, hz - t, hx - t / 2, -hz + t, 0.2, [{ u: hz - t, w: 0.8, y0: 1.0, h: 0.8 }], t, od);
  dressOpenings(b, -hx + t / 2, -hz + t, -hx + t / 2, hz - t, 0.2, [{ u: hz - t, w: 0.8, y0: 1.0, h: 0.8 }], t, od);
  // quoins, a red door band, the BANANA CO. signal-station board, a whip antenna + small dish on the roof
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 6; k++) {
    const long = k % 2 === 0;
    b.add(rbox(long ? 0.5 : 0.3, 0.3, 0.08, 0.025), "stone", { m: M(sx * (hx - (long ? 0.25 : 0.15) + 0.03), 0.4 + k * 0.42, sz * (hz + 0.02)), color: 0xe6dfd2 });
  }
  plate(b, "SIGNAL STATION · BANANA CO.", 2.6, 0.36, M(0.9, 2.45, hz + 0.02), "#fdf6e3", "#b8342a");
  const rt = h + H.roofT;
  b.add(cyl(0.03, 0.045, 4.2, 6), "pmetal", { m: M(-hx + 0.5, rt + 2.1, -hz + 0.5), uv: "local", color: 0xa0a0a0 });
  bNear.add(sph(0.07, 8, 6), "lampRed", { m: M(-hx + 0.5, rt + 4.22, -hz + 0.5) });
  P.dish(bMid, mul(M(-1.2, rt, 0.5), M(0, 0, 0, 0, 2.3, 0)), 0.45);
  // the crate staircase to the roof (outside the right wall)
  for (const [x0, z0, x1, z1, hh, k, y0] of L.HUT_FURN) if (k === "hut:crate") crateBlock(bMid, x0, y0, z0, x1, y0 + hh, z1, Math.round(z0 * 10) + 7);
  glows.push({ p: P.wallLamp(b, M(-hx + 1.0, 2.3, hz)).applyMatrix4(b.frame), size: 1.1 });
  for (const q of [b, bMid, bNear]) q.setFrame(0, 0, 0, 0);
}

// ------------------------------------------------------------------------------------------------ plateau cover
/** dry-stone field walls (stacked rounded stones on the ground, capped) + round boulders at their collider boxes */
export function buildPlateauCover(b: Batch, n: Batch, ground: (x: number, z: number) => number) {
  for (const [i, [x, z, yaw, len]] of L.LK_WALLS.entries()) {
    const base0 = L.LK_WALL_BASE[i];
    if (Number.isNaN(base0)) continue;
    const c = Math.cos(yaw), s = Math.sin(yaw), gh = Math.max(...[-0.5, 0, 0.5].map((u) => L.lookoutGround(x + c * u * len, z - s * u * len)));
    const Y = gh - 0.0; // the courses sit on the highest ground under the wall (= the collider's top − 1.24)
    // collider: centre (x, 46.62, z), half (len/2, 0.62, 0.36), sim yaw = −yaw → local +X → world (cos, −sin)… the
    // shared piece yaw is three's rotation.y, so the wall runs along (cos yaw, 0, −sin yaw)
    const ax = c, az = -s;
    const n2 = Math.max(4, Math.round(len / 0.55));
    for (let row = 0; row < 3; row++) for (let k = 0; k < n2; k++) {
      const u = -len / 2 + (k + 0.5 + (row % 2) * 0.5) * (len / n2);
      if (u > len / 2 - 0.2) continue;
      const px = x + ax * u, pz = z + az * u, g0 = ground(px, pz), sd = i * 100 + row * 31 + k;
      const w = len / n2 + 0.08, hh = 0.38 + h01(sd) * 0.1, d = 0.66 - row * 0.06;
      const base = row === 0 ? Math.min(Y, g0, base0) - 0.15 : Y + row * 0.4;
      const top = row === 0 ? Y + 0.42 : base + hh;
      b.add(rbox(w, top - base, d, 0.1), "stone", { m: M(px, (base + top) / 2, pz, (h01(sd, 2) - 0.5) * 0.06, yaw + (h01(sd, 3) - 0.5) * 0.12, 0), tile: 1.1, color: new THREE.Color(0xc4bcac).multiplyScalar(0.82 + h01(sd, 4) * 0.25), lod: 1 });
    }
    // capping stones + moss tufts
    for (let k = 0; k < Math.round(len / 0.8); k++) {
      const u = -len / 2 + 0.4 + k * 0.8, sd = i * 50 + k;
      b.add(rbox(0.72, 0.14, 0.74, 0.06), "stone", { m: M(x + ax * u, Y + 1.17, z + az * u, 0, yaw + (h01(sd) - 0.5) * 0.3, 0), tile: 1, color: 0xb0a898, lod: 1 });
      if (h01(sd, 7) < 0.45) n.add(sph(0.16, 7, 5), "plain", { m: M(x + ax * u + (h01(sd, 8) - 0.5) * 0.4, Y + 1.25, z + az * u, 0, 0, 0, 1, 0.45, 1), color: 0x5f8a3a });
    }
  }
  for (const [x, y, z, sz, seed] of L.LK_BOULDERS) {
    const g = P.roundBoulderGeo(seed, sz * 0.76, sz * 0.52, sz * 0.66, 2);
    b.add(g, "gBoulder", { m: M(x, y + sz * 0.33, z, 0, h01(seed) * 6.28, 0), uv: "local", tile: 2.2, color: 0xc8c2b8, lod: 1 });
  }
}

// ------------------------------------------------------------------------------------------------ keeper's attic
export function buildAttic(b: Batch, n: Batch) {
  const f = L.COT.frame, eave = L.COT_EAVE;
  b.setFrame(f.x, f.y, f.z, f.yaw); n.setFrame(f.x, f.y, f.z, f.yaw);
  for (const [x0, z0, x1, z1, hh, k] of L.COT_FURN) {
    if (hh >= 0) continue;
    const h = -hh, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (k === "cot:crate") crateBlock(n, x0, eave, z0, x1, eave + h, z1, Math.round(x0 * 13), { lod: 2 });
    else if (k === "cot:chest") {
      n.add(rbox(x1 - x0, h * 0.72, z1 - z0, 0.03), "wood", { m: M(cx, eave + h * 0.36, cz), color: 0x5e3a22 });
      n.add(rbox(x1 - x0 + 0.02, h * 0.28, z1 - z0 + 0.02, 0.06), "wood", { m: M(cx, eave + h * 0.86, cz), color: 0x6e4428 });
      for (const q of [-0.3, 0.3]) n.add(box(0.05, h + 0.01, z1 - z0 + 0.02), "steel", { m: M(cx + q * (x1 - x0), eave + h / 2, cz), color: 0x3a3430 });
    }
  }
  // a skylight lamp + an old sea chart on the knee wall
  n.add(sph(0.11, 10, 8), "lamp", { m: M(-0.5, eave + 2.2, 0) });
  n.add(box(0.9, 0.6, 0.02), "fabric", { m: M(-2.5, eave + 0.7, -L.COT_ATTIC.knee + 0.02), color: 0xd9c9a2 });
  drawRails(b, L.COT_LOCAL, { color: 0x5a3a26, mat: "wood" });
  stairTreads(n, L.COT_LOCAL, "cot:step", { color: 0x7a5236 });
  b.setFrame(0, 0, 0, 0); n.setFrame(0, 0, 0, 0);
  void textDecal;
}
