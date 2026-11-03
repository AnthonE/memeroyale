// COCO CAVES sculpted rocks: the boulder
// clusters in the hall and the outcrops on the plateau are NOT in the 0.5 m-voxel bake (a 1.2–2 m rock could only be a
// rounded box there) — each collider box (ROCKS with `sculpt`) is modelled here as a chiselled rock AROUND that box:
//   • a subdivided box with rounded edges (r ≤ 0.12 m),
//   • 6–10 seeded chisel planes that cut its edges and corners into flat facets (≤ 0.13 m deep on the sides, the top
//     bevels ≤ 0.18 m deep and steep (drop ≤ 0.27 m at the edge), ≤ 0.09 m on a small cap; the middle of the top stays flat — it is a floor),
//   • a taper and low dents (≤ 0.1 m, inward only),
// so the drawn rock stays within the parity band of its collider (the parity check: ±0.35 m ALONG the ray on walls —
// grazing rays multiply any offset and a 3 m ray that ends between a drawn face and a collider face just behind it
// counts as walk-through, so the drawn rock NEVER stands outside its collider — 0.15 m on flat tops / 0.3 m on sloped ones). The
// collider is the box SCULPT_IN inside (shared file). Creased normals (35°) keep the facets crisp, baked AO darkens the foot.
// One merged mesh per group (hall boulders → the detail group, plateau outcrops → the rock group), the rock material.
import * as THREE from "three";
import { mergeGeometries, mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { ROCKS, floorAt, type Rock } from "../../../../../shared/pois/coco-caves";
import { mulberry } from "../_kit/jungle-mat";

const ss = (a: number, b: number, t: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

/** one chiselled rock round a collider box (world space, with a caveAO attribute) */
export function sculptRock(r: Rock): THREE.BufferGeometry {
  const [hx, hy, hz] = r.h, big = Math.max(hx, hz) > 1.3, small = Math.min(hx, hz) < 0.45;
  const step = big ? 0.42 : 0.24;   // (~60 k tris for the hall's boulders, not 165 k; the chisel facets are planar anyway)
  const seg = (L: number) => Math.max(2, Math.ceil(L / step));
  let g: THREE.BufferGeometry = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2, seg(hx * 2), seg(hy * 2), seg(hz * 2));
  g.deleteAttribute("uv"); g.deleteAttribute("normal");
  g = mergeVertices(g, 1e-4);
  const rnd = mulberry((Math.round(r.c[0] * 37) * 73856093) ^ (Math.round(r.c[2] * 41) * 19349663) ^ 0x2c9);
  // chisel planes (local space): side cuts across the vertical edges / faces, top bevels across the top edges + corners
  const R = Math.min(0.12, 0.3 * Math.min(hx, hz, hy));
  const planes: Array<{ n: THREE.Vector3; d: number }> = [];
  const nSide = big ? 6 : 4, nTop = big ? 5 : 3;
  for (let k = 0; k < nSide + nTop; k++) {
    const top = k >= nSide, a = (k / (top ? nTop : nSide)) * Math.PI * 2 + rnd() * 1.1 + (top ? 0.4 : 0);
    // (a top bevel drops c / sin(e) at the edge: ≤ 0.27 m — the parity tolerance on a sloped floor is 0.3 m)
    const e = top ? 0.75 + rnd() * 0.35 : -0.12 + rnd() * 0.42;
    const n = new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
    const s = Math.abs(n.x) * hx + Math.abs(n.y) * hy + Math.abs(n.z) * hz;
    // (a small cap is the cluster's top: shallow bevels only — its narrow top must stay where its collider is)
    const c = top ? (small ? 0.04 + rnd() * 0.05 : 0.08 + rnd() * 0.1) : 0.05 + rnd() * 0.08;
    planes.push({ n, d: s - c });
  }
  const p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), q = new THREE.Vector3(), o = new THREE.Vector3();
  const ao = new Uint8Array(p.count);
  const cy = Math.cos(r.yaw), sy = Math.sin(r.yaw);
  // taper (≤ 0.09 m in at the top) + a lean (± 0.07 m) + low lumps (± 0.05 m): no two rocks share a silhouette
  const taper = small ? 0 : 0.04 + rnd() * 0.04, ph = rnd() * 6.28;   // (absolute: ≤ 0.08 m in at the top)
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // rounded box
    q.set(Math.min(hx - R, Math.max(-(hx - R), v.x)), Math.min(hy - R, Math.max(-(hy - R), v.y)), Math.min(hz - R, Math.max(-(hz - R), v.z)));
    o.subVectors(v, q); const ol = o.length();
    if (ol > 1e-6) { o.multiplyScalar(1 / ol); v.copy(q).addScaledVector(o, R); }
    { const t = (v.y + hy) / (2 * hy), k = 1 - taper * t / Math.max(hx, hz);
      const lump = -0.025 * (0.5 + 0.5 * Math.sin(v.x * 2.3 + ph) * Math.sin(v.y * 1.9 + v.z * 2.1 + ph * 0.7));
      const hl = Math.hypot(v.x, v.z) || 1;
      v.x = v.x * k + (v.x / hl) * lump; v.z = v.z * k + (v.z / hl) * lump; }
    // chisel (twice: a point pushed by one plane may stand outside the next)
    for (let it = 0; it < 2; it++) for (const pl of planes) { const d = v.dot(pl.n) - pl.d; if (d > 0) v.addScaledVector(pl.n, -d); }
    // to world
    const wx = r.c[0] + v.x * cy + v.z * sy, wz = r.c[2] - v.x * sy + v.z * cy, wy = r.c[1] + v.y;
    p.setXYZ(i, wx, wy, wz);
    const f = floorAt(wx, wz);
    ao[i] = Math.round(255 * (0.38 + 0.62 * ss(-0.05, 0.85, wy - f)) * (0.85 + 0.15 * ss(hy - 0.4, hy, v.y)));
  }
  g.setAttribute("caveAO", new THREE.BufferAttribute(ao, 1, true));
  // creased normals: crisp facet edges, smooth over the rounded parts
  const out = toCreasedNormals(g, 0.6);
  return out;
}

/** every `sculpt` rock as one merged mesh per group: [hall boulders (≤ 62 m), plateau outcrops] */
export async function buildSculpted(mat: THREE.Material, yieldFn: () => Promise<void> = async () => {}): Promise<{ low: THREE.Mesh | null; high: THREE.Mesh | null; tris: number }> {
  const lowG: THREE.BufferGeometry[] = [], highG: THREE.BufferGeometry[] = [];
  // (~0.8 ms a rock: a yield every 16 keeps each main-thread slice ≲ 15 ms)
  let k = 0;
  for (const r of ROCKS) if (r.sculpt) { (r.tag === "outcrop" ? highG : lowG).push(sculptRock(r)); if (++k % 16 === 0) await yieldFn(); }
  let tris = 0;
  const mk = (list: THREE.BufferGeometry[], name: string) => {
    if (!list.length) return null;
    const g = mergeGeometries(list)!; list.forEach((x) => x.dispose());
    g.computeBoundingBox(); g.computeBoundingSphere(); tris += g.attributes.position.count / 3;
    const m = new THREE.Mesh(g, mat); m.name = name; m.matrixAutoUpdate = false; m.receiveShadow = true; m.castShadow = true;
    return m;
  };
  return { low: mk(lowG, "caves-sculpt-boulders"), high: mk(highG, "caves-sculpt-outcrops"), tris };
}
