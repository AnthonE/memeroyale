// Town streets: the street plan made visible — paved street ribbons with gutters along the shared TownStreet
// polylines, the yard kit (picket fences, low plastered garden walls, washing lines — hedges: mango-market/hedges.ts) and a painted
// basketball court. Everything is drawn from the SAME numbers the server collides with (shared/pois/<town>.ts props:
// a yard run is a Prop whose local +x runs along it, `s` long).
import * as THREE from "three";
import type { TownBins } from "./town-materials";
import { M, col, cylGeo } from "./town-geo";

type V2 = [number, number];
type Mat = THREE.Matrix4;
const T = (at: Mat, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => at.clone().multiply(M(x, y, z, yaw, pitch, roll, sx, sy, sz));

/** a flat ribbon of width `w` along a polyline at height y (metre UVs: u along, v across); `keep(x, z)` clips it */
export function ribbonGeo(pts: V2[], w: number, y: number, keep: (x: number, z: number) => boolean = () => true): THREE.BufferGeometry | null {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let s = 0, base = -1;
  const nrm = (i: number): V2 => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [-dz / l, dx / l];
  };
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const [nx, nz] = nrm(i), [x, z] = pts[i];
    const ok = keep(x, z);
    if (!ok) { base = -1; continue; }
    const v0 = pos.length / 3;
    pos.push(x + nx * w / 2, y, z + nz * w / 2, x - nx * w / 2, y, z - nz * w / 2);
    uv.push(s, 0, s, w);
    if (base >= 0) idx.push(base, v0, base + 1, base + 1, v0, v0 + 1); // (faces +y)
    base = v0;
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a street: the carriageway (warm grey sett paving), a darker 0.45 m gutter band each side, a pale kerb line */
export function addStreet(bins: TownBins, pts: V2[], w: number, y: number, kind: "main" | "side" | "alley", keep?: (x: number, z: number) => boolean, keepEdge?: (x: number, z: number) => boolean, lift = 0) {
  // `lift` (0..3 mm, per street): two streets' carriageways overlap at a junction — at one height their
  // differently-running paving fought (flicker) where they cross
  const road = ribbonGeo(pts, w, y + 0.035 + lift, keep);
  if (road) bins.paving.add(road, null, col(kind === "main" ? "#b9ad9b" : kind === "side" ? "#c4b8a6" : "#cdbfa8"));
  if (kind === "alley") return;
  for (const sg of [-1, 1]) {
    // offset polylines for the gutters / kerbs
    const off = (d: number): V2[] => pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * d * sg, p[1] + dx / l * d * sg]; });
    // (gutters + kerbs stop where another street's carriageway crosses: a junction mouth stays open)
    const ke = (x: number, z: number) => (!keep || keep(x, z)) && (!keepEdge || keepEdge(x, z));
    const gut = ribbonGeo(off(w / 2 - 0.3), 0.55, y + 0.042, ke);
    if (gut) bins.paving.add(gut, null, col("#8e8476"));
    const kerb = ribbonGeo(off(w / 2 + 0.12), 0.24, y + 0.05, ke);
    if (kerb) bins.stone.add(kerb, null, col("#ddd3c2"));
  }
}

/** picket fence along local +x (len), posts every ~1.8 m, two rails, pickets (full) or a slatted panel (low) */
export function addFence(bins: TownBins, at: Mat, len: number, color: string, low: boolean) {
  const c = col(color), n = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i <= n; i++) bins.wood.box(0.09, 1.08, 0.09, T(at, -len / 2 + len * i / n, 0.54, 0), c.clone().multiplyScalar(0.92));
  for (const y of [0.28, 0.78]) bins.wood.box(len, 0.06, 0.04, T(at, 0, y, -0.03), c);
  if (low) { bins.wood.box(len, 0.82, 0.025, T(at, 0, 0.5, 0.02), c); return; }
  const np = Math.max(2, Math.floor(len / 0.15));
  for (let i = 0; i < np; i++) { const x = -len / 2 + (i + 0.5) * len / np; bins.wood.box(0.07, 0.92, 0.022, T(at, x, 0.5, 0.02), c); bins.wood.add(new THREE.ConeGeometry(0.05, 0.08, 4).rotateY(Math.PI / 4), T(at, x, 1.0, 0.02, 0, 0, 0, 1, 1, 0.45), c); }
}
// (the clipped hedge has its own instanced, leaf-textured set — pois/mango-market/hedges.ts)
/** a low plastered garden wall with a projecting cap and a darker plinth along local +x */
export function addGardenWall(bins: TownBins, at: Mat, len: number, color: string) {
  const c = col(color);
  bins.plaster.box(len, 0.86, 0.26, T(at, 0, 0.43, 0), c, [at.elements[12], at.elements[14]]);
  bins.trim.box(len + 0.06, 0.1, 0.36, T(at, 0, 0.91, 0), c.clone().lerp(new THREE.Color("#ffffff"), 0.35));
  bins.plaster.box(len, 0.16, 0.3, T(at, 0, 0.08, 0), c.clone().multiplyScalar(0.72));
}
/** a raised STREET PLANTER along local +x: a plastered box 1.1 m tall × 0.9 m deep with a stone cap, dark soil
 *  and a clipped shrub crown over it — the town's crouch-proof street cover (collider = the box, shared/pois/mango-market
 *  "splanter"); the crown is foliage (bullets pass) */
export function addStreetPlanter(bins: TownBins, at: Mat, len: number, color: string, rng: () => number, low: boolean) {
  const c = col(color);
  bins.plaster.box(len, 0.98, 0.9, T(at, 0, 0.49, 0), c, [at.elements[12], at.elements[14]]);
  bins.plaster.box(len + 0.04, 0.14, 0.94, T(at, 0, 0.07, 0), c.clone().multiplyScalar(0.7));
  bins.stone.box(len + 0.12, 0.12, 1.02, T(at, 0, 1.04, 0), col("#e6dccb"));
  bins.plaster.box(len - 0.2, 0.04, 0.72, T(at, 0, 1.08, 0), col("#4a3524"));
  const g = new THREE.BoxGeometry(len - 0.3, 0.42, 0.66, low ? 1 : Math.max(2, Math.round(len / 0.5)), low ? 1 : 2, low ? 1 : 2);
  if (!low) { const q = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < q.count; i++) { const x = q.getX(i), y = q.getY(i), z = q.getZ(i); const k = 0.06 * Math.sin(x * 3.7 + z * 4.1) + 0.05 * Math.sin(x * 8.3 + 0.9); q.setXYZ(i, x, y + (y > 0 ? k : 0), z * (1 + (y > 0 ? k : 0))); } g.computeVertexNormals(); }
  bins.leaf.add(g, T(at, 0, 1.3, 0), col("#4b8a32", 0.9 + rng() * 0.2), (x, y, z, b, o) => { o.multiplyScalar(0.78 + 0.3 * Math.min(1, Math.max(0, (y - at.elements[13] - 1.1) / 0.45))); });
  if (!low) for (let x = -len / 2 + 0.45; x < len / 2 - 0.3; x += 0.55 + rng() * 0.4) bins.plastic.box(0.12, 0.08, 0.12, T(at, x, 1.5 + rng() * 0.06, (rng() - 0.5) * 0.4, rng() * 3), col(["#e8455a", "#f2a23a", "#f6e05a", "#ffffff"][Math.floor(rng() * 4)]));
}
/** a washing line between two posts (local ±len/2) with a few cloths */
export function addLaundry(bins: TownBins, at: Mat, len: number, rng: () => number) {
  for (const sx of [-len / 2, len / 2]) bins.woodDark.add(cylGeo(0.04, 0.05, 1.9, 6), T(at, sx, 0.95, 0), col("#6b4a2c"));
  bins.rope.add(cylGeo(0.008, 0.008, len, 4).rotateZ(Math.PI / 2), T(at, 0, 1.82, 0), col("#e8e2d4"));
  const C = ["#e8722a", "#2fb3a8", "#f1c232", "#f4efe1", "#d9483b", "#3a86c8", "#e88ca0"];
  for (let x = -len / 2 + 0.4; x < len / 2 - 0.4; x += 0.55 + rng() * 0.35) {
    const w = 0.35 + rng() * 0.35, h = 0.4 + rng() * 0.45;
    bins.fabric.box(w, h, 0.012, T(at, x + w / 2, 1.8 - h / 2, 0, 0, 0, (rng() - 0.5) * 0.08), col(C[Math.floor(rng() * C.length)]));
  }
}
/** a painted court (centre, yaw, w × d): a red-earth slab, white lines, a hoop at each end */
export function addCourt(bins: TownBins, at: Mat, w: number, d: number) {
  bins.paving.box(w, 0.06, d, T(at, 0, 0.03, 0), col("#b5674a"));
  bins.paving.box(w - 3, 0.062, d - 3, T(at, 0, 0.035, 0), col("#3f7f8c"));
  const line = (x: number, z: number, lw: number, ld: number) => bins.paving.box(lw, 0.07, ld, T(at, x, 0.04, z), col("#f2efe6"));
  const iw = w - 3, id = d - 3;
  line(0, id / 2, iw, 0.08); line(0, -id / 2, iw, 0.08); line(iw / 2, 0, 0.08, id); line(-iw / 2, 0, 0.08, id); line(0, 0, 0.08, id);
  for (const sx of [-1, 1]) {
    bins.metal.add(cylGeo(0.06, 0.07, 3.1, 8), T(at, sx * (iw / 2 + 0.6), 1.55, 0), col("#2e3338"));
    bins.plastic.box(0.05, 1.05, 1.8, T(at, sx * (iw / 2 + 0.45), 2.95, 0), col("#f4f4f0"));
    bins.metal.add(new THREE.TorusGeometry(0.23, 0.018, 6, 14).rotateX(Math.PI / 2), T(at, sx * (iw / 2 + 0.12), 2.75, 0), col("#e05a2a"));
  }
}
