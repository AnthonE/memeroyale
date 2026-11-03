// Short tarmac runway draped on the live terrain: tiling asphalt (8 m tile, metre UVs), worn white paint (centreline
// dashes, threshold "piano keys", edge lines, aiming blocks), sand drifting over the edges, little edge lights.
import * as THREE from "three";
import type { LobbyItem } from "../../../../../shared/pois/lobby-islet";
import { toWorld, worldYaw } from "../../../../../shared/pois/lobby-islet";
import { M, cyl, grid } from "./kit";
import { type LK, TINT } from "./lk";
import { bulbGeo } from "./lk";

export function buildRunway(k: LK, it: LobbyItem) {
  const L = it.l ?? 70, W = it.w ?? 16;
  const [cx, cz] = toWorld(it.lx, it.d);
  const yaw = worldYaw(it.a);
  const rot = new THREE.Matrix4().makeRotationY(yaw);
  /** runway-local (u along, v across; v + = toward the item BACK so grid() quads face up) → world, draped `lift` above the sand */
  const P = (u: number, v: number, lift: number, out: THREE.Vector3) => {
    out.set(u, 0, -v).applyMatrix4(rot);
    out.x += cx; out.z += cz;
    out.y = k.ground(out.x, out.z) + lift;
    return out;
  };
  // ---- asphalt: 2 m grid, metre uvs / 8 (the tarmac sheet repeats every 8 m)
  {
    const nx = Math.ceil(L / 2), ny = Math.ceil(W / 2);
    const g = grid(L, W, nx, ny, { u0: 0, u1: 1, v0: 0, v1: 1, mu: 1e6, mv: 1e6 }, (x, y, o) => { P(x - L / 2, y - W / 2, 0.045, o); });
    const uv = g.attributes.uv.array as Float32Array;
    for (let j = 0, i = 0; j <= ny; j++) for (let q = 0; q <= nx; q++, i += 2) { uv[i] = ((q / nx) * L) / 8 + 0.37; uv[i + 1] = ((j / ny) * W) / 8 + 0.11; }
    // darker, more worn in the centre strip (tyre wear), lighter dusty edges — via vertex tint later (single tint here)
    k.b.add("tarmac", g, null, "#e2ddd6");
    // a raised tarmac lip along the edges so the strip reads as a surface, not a decal
    for (const s of [-1, 1]) {
      const lip = grid(L, 0.35, nx, 1, { u0: 0, u1: 1, v0: 0, v1: 1, mu: 1e6, mv: 1e6 }, (x, y, o) => { P(x - L / 2, s * (W / 2 + y * 0.9), 0.045 - y * 0.32, o); });
      if (s < 0) { const idx = lip.index!.array as Uint16Array | Uint32Array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } lip.computeVertexNormals(); }
      k.b.add("tarmac", lip, null, "#b9b3aa");
    }
  }
  // ---- paint (decal material, B atlas "paint" = 4 m × 1 m worn white)
  const paint = k.at.B.uv("paint");
  const quad = (u0: number, v0: number, len: number, wid: number, tint = "#ffffff") => {
    const pieces = Math.ceil(len / 3.8), pl = len / pieces;
    for (let p = 0; p < pieces; p++) {
      const g = grid(pl, wid, Math.max(1, Math.ceil(pl / 1.5)), 1, paint, (x, y, o) => { P(u0 + p * pl + x, v0 + y, 0.075, o); }, [k.r() * (4 - pl), k.r() * Math.max(0, 1 - wid)]);
      k.b.add("decal", g, null, tint);
    }
  };
  // centreline dashes
  for (let u = -L / 2 + 14; u < L / 2 - 14; u += 8) quad(u, -0.22, 4, 0.44);
  // threshold piano keys at both ends + aiming blocks
  for (const end of [-1, 1]) {
    const u0 = end < 0 ? -L / 2 + 1.2 : L / 2 - 1.2 - 6;
    for (let i = 0; i < 6; i++) { const v = -W / 2 + 1.4 + i * ((W - 2.8 - 0.9) / 5); if (Math.abs(v + 0.45) < 0.9) continue; quad(u0, v, 6, 0.9); }
    quad(end < 0 ? -L / 2 + 0.4 : L / 2 - 0.4 - 0.5, -W / 2 + 0.6, 0.5, W - 1.2);        // threshold bar across
    const ua = end < 0 ? -L / 2 + 13 : L / 2 - 13 - 7;
    for (const s of [-1, 1]) quad(ua, s < 0 ? -3.4 : 1.8, 7, 1.6);
  }
  // edge lines
  for (const s of [-1, 1]) quad(-L / 2 + 0.5, s < 0 ? -W / 2 + 0.35 : W / 2 - 0.35 - 0.3, L - 1, 0.3);
  // ---- sand drifting in over the edges and the ends (alpha drift strips)
  // (strips lying half on the terrain's own sand read as hard ORANGE blotches at eye level,
  // where the warm decal tint never matches. The strips sit ON the tarmac, spilling in from its edge, in a pale
  // neutral sand tint, and fewer / narrower ones so the feathered alpha ramp (≥ 0.6 m) reads as blown sand)
  const sand = k.at.B.uv("sand");
  for (const s of [-1, 1]) for (let u = -L / 2 + 1; u < L / 2 - 3; u += 5.2 + k.r() * 3) {
    if (k.r() < 0.3) continue;
    const len = 3.4 + k.r() * 0.5, wid = 1.2 + k.r() * 0.9;
    const v0 = s < 0 ? -W / 2 - wid * 0.12 : W / 2 - wid * 0.88;
    const g = grid(len, wid, 3, 2, sand, (x, y, o) => { P(u + x, v0 + y, 0.09, o); }, [k.r() * (4 - len), 0], "v");
    k.b.add("decal", g, null, "#e9e0cc");
  }
  for (const end of [-1, 1]) for (let v = -W / 2 + 0.4; v < W / 2 - 3; v += 4.1) {
    const u0 = end < 0 ? -L / 2 + 0.1 : L / 2 - 2.3;
    const g = grid(2.2 + k.r() * 0.5, 3.4, 2, 3, sand, (x, y, o) => { P(u0 + x, v + y * 0.95, 0.09, o); }, [k.r() * 1.5, 0], "v");
    k.b.add("decal", g, null, "#e9e0cc");
  }
  // ---- edge lights every 10 m (short posts + lens, emissive)
  const tmp = new THREE.Vector3();
  for (const s of [-1, 1]) for (let u = -L / 2 + 3; u <= L / 2 - 3; u += 10) {
    P(u, s * (W / 2 + 0.7), 0, tmp);
    k.b.add("A", cyl(0.06, 0.05, 0.32, 8, 0.01, { rect: k.at.A.uv("paintMetal"), cap: k.at.A.uv("paintMetal") }), M(tmp.x, tmp.y - 0.05, tmp.z), "#e8e2d6");
    k.b.add("glow", bulbGeo(k, 0.05), M(tmp.x, tmp.y + 0.33, tmp.z, Math.PI, 0, 0), s < 0 ? "#bfe6ff" : "#ffe7a8", 2.2);
    k.b.add("A", cyl(0.07, 0.07, 0.03, 8, 0.008, { rect: k.at.A.uv("metal"), cap: k.at.A.uv("metal") }), M(tmp.x, tmp.y + 0.26, tmp.z), TINT.iron);
  }
}
