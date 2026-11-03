// COCO CAVES ground: the cave floor skin (a pebbly sand / stone skin 4 cm over the terrain — the terrain IS the floor
// collider — darker toward the walls, wet near the pool, ending at the tunnel mouths) and the tidal pool
// (jungle kit water in bed mode: turquoise over a sandy bed, caustics, glow; a wade: the bed never deeper than BED_D).
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { pbr, stoneMaterial } from "../_kit/jungle-mat";
import { waterMaterial, poolSurface, bindWaterTime } from "../_kit/jungle-water";
import { floorAt, groundAt, plateAt, PG, POOL_BOX, colliders, hallDist, insidePoly, TUNNELS, POOL, WATER_Y, BED_D } from "../../../../../shared/pois/coco-caves";
import { cavePatch } from "./light";

/** distance past the outer end of a tunnel (negative inside it); +inf when not in its corridor */
function tunnelT(x: number, z: number): { inside: boolean; past: number } {
  let best = { inside: false, past: 1e9 };
  for (const t of TUNNELS) {
    const dx = t.b[0] - t.a[0], dz = t.b[1] - t.a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const along = (x - t.a[0]) * ux + (z - t.a[1]) * uz, across = Math.abs(-(x - t.a[0]) * uz + (z - t.a[1]) * ux);
    if (along > -4 && along < L + 5 && across < t.width / 2 + 2.2) { const past = along - L; if (past < best.past) best = { inside: true, past }; }
  }
  return best;
}
/** the pool bed (terrain, raised to WATER_Y − BED_D inside the pool: the collider bed plates) */
export const bedAt = (x: number, z: number) => { const g = floorAt(x, z); return insidePoly(POOL, x, z) ? Math.max(g, WATER_Y - BED_D) : g; };

/** the skin height at a grid vertex: the terrain, or over the floor plates (1 m cells, flat tops) the mean of the four
 *  cells round the vertex — the skin then crosses each plate step at mid-height (≤ 0.125 m off the collider) */
function skinY(x: number, z: number): number {
  const e = PG.cs / 2, g = groundAt(x, z), p = [plateAt(x - e, z - e), plateAt(x + e, z - e), plateAt(x - e, z + e), plateAt(x + e, z + e)];
  if (p.every((v) => v < g)) return g + 0.04;
  // (the HIGHEST of the four 0.5 m plate cells round the vertex, laid exactly on it: at a plate step the skin is on the
  //  upper plate's edge, mid-cell ≤ 6 cm over the lower one — parity ±0.15; the baked rock is sunk 0.15 m under it)
  return Math.max(g, ...p);
}
const inPG = (x: number, z: number) => x > PG.x0 && x < PG.x0 + PG.nx * PG.cs && z > PG.z0 && z < PG.z0 + PG.nz * PG.cs;
export function buildFloor(ctx: WorldCtx, group: THREE.Group) {
  // a 1 m skin, refined to 0.5 m over the plate rect (its bounds lie on the terrain's 2 m grid lines: no cracks)
  const x0 = -778, x1 = -664, z0 = -380, z1 = -266, H = 0.5;
  const nx = Math.round((x1 - x0) / H), nz = Math.round((z1 - z0) / H);
  const keep = (x: number, z: number) => hallDist(x, z) > -2.5 || tunnelT(x, z).inside;
  const pos: number[] = [], colr: number[] = [], idxO: number[] = [], vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
  const idx = idxO;
  const c = new THREE.Color();
  const vert = (i: number, k: number) => {
    const o = k * (nx + 1) + i; if (vid[o] >= 0) return vid[o];
    const x = x0 + i * H, z = z0 + k * H, y = skinY(x, z);
    vid[o] = pos.length / 3; pos.push(x, y, z);
    // tone: pale sand in the open, darker packed earth / stone toward the walls, wet dark sand at the waterline
    const hd = hallDist(x, z);
    const nearWall = hd > -2.5 ? 1 - Math.min(1, Math.max(0, hd) / 6) : 0.7;
    c.set("#d8c7a4").lerp(new THREE.Color("#8f7e68"), nearWall * 0.75);
    const wet = 1 - Math.min(1, Math.max(0, (y - WATER_Y) / 0.55));
    c.multiplyScalar(1 - 0.38 * wet);
    colr.push(c.r, c.g, c.b);
    return vid[o];
  };
  const quad = (i: number, k: number, st: number) => {
    const x = x0 + (i + st / 2) * H, z = z0 + (k + st / 2) * H;
    const a = vert(i, k), b = vert(i + st, k), cc = vert(i + st, k + st), d = vert(i, k + st);
    // match the terrain's diagonal (terrain.ts: even global parity → (i,j)–(i+1,j+1))
    const gi = Math.floor((z + 1200) / 2), gj = Math.floor((x + 1200) / 2);
    if (((gi + gj) & 1) === 0) idx.push(a, cc, b, a, d, cc); else idx.push(a, d, b, b, d, cc);
  };
  for (let k = 0; k < nz; k += 2) for (let i = 0; i < nx; i += 2) {
    const x = x0 + (i + 1) * H, z = z0 + (k + 1) * H;
    if (!keep(x, z)) continue;
    // (no alpha-hashed fringe past the tunnel mouths — it rendered as a flat WHITE sheet
    //  on the grass outside all three entrances; the sand skin ends cleanly at the mouth line, the
    //  terrain carries on underneath)
    { const tt = tunnelT(x, z); if (tt.inside && hallDist(x, z) < -2.5 && tt.past > 0) continue; }
    if (inPG(x, z)) { for (const [di, dk] of [[0, 0], [1, 0], [0, 1], [1, 1]]) quad(i + di, k + dk, 1); }
    else quad(i, k, 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idxO); g.computeVertexNormals(); g.computeBoundingSphere();
  const mk = () => { const m = stoneMaterial(pbr(ctx, "sand2"), { triplanar: true, scale: 3.2, vertexColors: true, variation: 0.5, roughness: 1, detail: 0.5, normalScale: 1.2 });
    m.name = "caves:floor"; m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; cavePatch(m); return m; };
  const mesh = new THREE.Mesh(g, mk()); mesh.name = "caves-floor"; mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  group.add(mesh);
  return mesh;
}

/** distance fields over the pool box at 0.2 m — to the shore (floor at / over the water) and to
 *  anything solid crossing the water line (shore, rocks, piles, posts, stair blocks). The solid field feeds the water's
 *  foam rings (jungle-water `rocks`: R8 = d / 6 m); the shore field fakes depth (deep teal centre, turquoise shallows). */
function poolFields() {
  const [x0, z0, x1, z1] = POOL_BOX, S = 0.2, W = Math.round((x1 - x0) / S), H = Math.round((z1 - z0) / S);
  const shore = new Float32Array(W * H), solid = new Float32Array(W * H), INF = 1e6;
  const cross = colliders.filter((b) => b.c[1] - b.h[1] < WATER_Y + 0.05 && b.c[1] + b.h[1] > WATER_Y - 0.02 && b.c[0] > x0 - 3 && b.c[0] < x1 + 3 && b.c[2] > z0 - 3 && b.c[2] < z1 + 3);
  // (build time: the crossing boxes binned on a 2 m grid — each 0.2 m cell tests only its bin, ~300 ms → ~10 ms)
  const BS = 2, BW = Math.ceil((x1 - x0) / BS) + 1, BH = Math.ceil((z1 - z0) / BS) + 1, bins: number[][] = Array.from({ length: BW * BH }, () => []);
  cross.forEach((b, n) => { const yw = -(b.yaw ?? 0), ex = Math.abs(Math.cos(yw)) * b.h[0] + Math.abs(Math.sin(yw)) * b.h[2], ez = Math.abs(Math.sin(yw)) * b.h[0] + Math.abs(Math.cos(yw)) * b.h[2];
    for (let bj = Math.max(0, Math.floor((b.c[2] - ez - z0) / BS)); bj <= Math.min(BH - 1, Math.floor((b.c[2] + ez - z0) / BS)); bj++)
      for (let bi = Math.max(0, Math.floor((b.c[0] - ex - x0) / BS)); bi <= Math.min(BW - 1, Math.floor((b.c[0] + ex - x0) / BS)); bi++) bins[bj * BW + bi].push(n); });
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * S, z = z0 + (j + 0.5) * S, k = j * W + i;
    const dry = floorAt(x, z) >= WATER_Y - 0.02 || !insidePoly(POOL, x, z);
    shore[k] = dry ? 0 : INF;
    let hit = dry;
    if (!hit) for (const n of bins[Math.min(BH - 1, Math.floor((z - z0) / BS)) * BW + Math.min(BW - 1, Math.floor((x - x0) / BS))]) { const b = cross[n], yw = -(b.yaw ?? 0), c = Math.cos(yw), sn = Math.sin(yw), dx = x - b.c[0], dz = z - b.c[2]; if (Math.abs(dx * c - dz * sn) < b.h[0] && Math.abs(dx * sn + dz * c) < b.h[2]) { hit = true; break; } }
    solid[k] = hit ? 0 : INF;
  }
  // two-pass chamfer distance (metres)
  const chamfer = (f: Float32Array) => {
    const a = S, d = S * Math.SQRT2;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; let v = f[k];
      if (i > 0) v = Math.min(v, f[k - 1] + a); if (j > 0) { v = Math.min(v, f[k - W] + a); if (i > 0) v = Math.min(v, f[k - W - 1] + d); if (i < W - 1) v = Math.min(v, f[k - W + 1] + d); } f[k] = v; }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; let v = f[k];
      if (i < W - 1) v = Math.min(v, f[k + 1] + a); if (j < H - 1) { v = Math.min(v, f[k + W] + a); if (i < W - 1) v = Math.min(v, f[k + W + 1] + d); if (i > 0) v = Math.min(v, f[k + W - 1] + d); } f[k] = v; }
  };
  chamfer(shore); chamfer(solid);
  const data = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) data[k] = Math.round(Math.min(1, solid[k] / 6) * 255);
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  const shoreAt = (x: number, z: number) => { const i = Math.min(W - 1, Math.max(0, Math.floor((x - x0) / S))), j = Math.min(H - 1, Math.max(0, Math.floor((z - z0) / S))); return shore[j * W + i]; };
  return { tex, box: [x0, z0, x1 - x0, z1 - z0] as [number, number, number, number], shoreAt };
}

export function buildPool(ctx: WorldCtx, group: THREE.Group) {
  bindWaterTime(ctx);
  const F = poolFields();
  const sand = pbr(ctx, "sand2");
  const mat = waterMaterial({
    // saturated turquoise (#1fc3c8 shallows → #0a7fa0 deep). The pool is a wade (≤ 1.05 m), so the
    // absorption is ~2× a real lagoon's — the bed fades to turquoise within the first half metre instead of reading as
    // pale sand under clear glass
    shallow: "#14b4b2", mid: "#0a90ab", deep: "#065f88", glow: 0.18, clarity: 0.8, ripple: 0.7, lace: 0.6, foamScale: 0.6, alpha0: 0.78, env: 0.5,
    // brighter mint shallows, a deep teal centre (the fake depth below), foam rings at every shore / rock / pile
    bed: { map: sand, tint: [0.78, 0.84, 0.72], scale: 3.2 }, sigma: [2.6, 0.62, 0.42], scatter: "#06708a", caustics: 1.35,
    rocks: { tex: F.tex, box: F.box },
  });
  mat.name = "caves:water";
  // (lamp 0.25, not 0.6: the skylight bounce lamp made a white-cyan hot spot on the water at the view camera)
  cavePatch(mat, { spec: 0.35, lamp: 0.25 });
  const mesh = poolSurface(-713, -320.5, 40, 28, WATER_Y, bedAt, mat, { seg: 200 });
  // the fake depth: the lagoon reads 1 m deep in the shallows and ~3 m in the middle (the sim's wade is ≤ BED_D everywhere)
  { const pos = mesh.geometry.attributes.position as THREE.BufferAttribute, dep = mesh.geometry.attributes.depth as THREE.BufferAttribute;
    for (let i = 0; i < dep.count; i++) { const d = dep.getX(i); if (d <= 0) continue; const sd = F.shoreAt(pos.getX(i), pos.getZ(i)); dep.setX(i, d * (1 + 2.1 * THREE.MathUtils.smoothstep(sd, 1.2, 9))); }
    dep.needsUpdate = true; }
  // clip to the pool outline (the valley south of the sill is lower than the water: it must stay dry)
  { const g = mesh.geometry, pos = g.attributes.position as THREE.BufferAttribute, idx = g.index!, keep: number[] = [];
    for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2); const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3; if (insidePoly(POOL, x, z)) keep.push(a, b, c); }
    g.setIndex(keep); g.computeBoundingSphere(); }
  mesh.name = "caves-pool";
  group.add(mesh);
  return mesh;
}
