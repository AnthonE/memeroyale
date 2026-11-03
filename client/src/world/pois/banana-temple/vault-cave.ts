// banana-temple — the golden vault as a CAVE: above the carved stone wall bases the
// brick gives way to a rough dark rock skin (displaced, triplanar rock, moss in the up-facing nooks), the nave ceiling is
// broken rock hanging up to a metre down with a ragged opening round the light shaft, fallen ceiling slabs hang in the
// gloom, and roots + creepers pour out of the cracks. Everything here sits ABOVE head height or ≤ 0.3 m proud of the
// collider walls (parity tolerance), so what you see is still what you collide with.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { TEMPLE, mulberry } from "../../../../../shared/pois/jungle-layout";
import { merge, staticMesh, rock, tint, fbm3, type Geo } from "../_kit/jungle-geo";
import { stoneMaterial, pbr, interiorPatch } from "../_kit/jungle-mat";
import { buildHangingVines, type VineSpot } from "../_kit/jungle-vines";
import { rootTangles } from "./dungeon";
import type { TempleMats } from "./temple";

const T = TEMPLE;

/** a displaced rock sheet over a wall / ceiling rectangle: origin o, edge vectors u / v, unit normal n INTO the room;
 *  displacement 0…amp along n (fbm), fading to `edge` at the rectangle's border so neighbouring sheets meet;
 *  `skip(p)` drops quads (the shaft hole), `rim(p)` adds extra depth (the hole's lip) */
function rockSheet(o: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3, amp: number, seed: number, o2: { step?: number; edge?: number; skip?: (p: THREE.Vector3) => boolean; rim?: (p: THREE.Vector3) => number } = {}): Geo | null {
  const step = o2.step ?? 0.45, nu = Math.max(2, Math.ceil(u.length() / step)), nv = Math.max(2, Math.ceil(v.length() / step)), edge = o2.edge ?? 0.15;
  const P: THREE.Vector3[] = [], p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const a = i / nu, b = j / nv; p.copy(o).addScaledVector(u, a).addScaledVector(v, b);
    const f = 0.5 + 0.5 * fbm3(p.x * 0.55 + seed, p.y * 0.55, p.z * 0.55, 4), ridge = 1 - Math.abs(fbm3(p.x * 1.4, p.y * 1.4 + seed, p.z * 1.4, 2));
    const fade = Math.min(1, Math.min(a, 1 - a, b, 1 - b) * Math.min(nu, nv) / 2.5);
    let d = amp * (0.25 + 0.75 * f * (0.6 + 0.4 * ridge)) * (edge + (1 - edge) * fade);
    if (o2.rim) d += o2.rim(p);
    P.push(p.clone().addScaledVector(n, d));
  }
  const pos: number[] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const A = P[j * (nu + 1) + i], B = P[j * (nu + 1) + i + 1], C = P[(j + 1) * (nu + 1) + i], D = P[(j + 1) * (nu + 1) + i + 1];
    if (o2.skip && o2.skip(new THREE.Vector3().addVectors(A, D).multiplyScalar(0.5))) continue;
    // winding so the face normal points along n
    const nn = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(B, A), new THREE.Vector3().subVectors(C, A));
    if (nn.dot(n) >= 0) pos.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, B.x, B.y, B.z, D.x, D.y, D.z, C.x, C.y, C.z);
    else pos.push(A.x, A.y, A.z, C.x, C.y, C.z, B.x, B.y, B.z, B.x, B.y, B.z, C.x, C.y, C.z, D.x, D.y, D.z);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  tint(g, "#ffffff", 0.08);
  return g;
}

export function buildVaultCave(ctx: WorldCtx, mats: TempleMats, root: THREE.Group) {
  const ch = T.chamber, N = T.nave, fy = ch.y0, az = T.altar.z, rnd = mulberry(6611), sheets: Array<Geo | null> = [], chunks: Geo[] = [], roots: Geo[] = [];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const hole = V(0.6, ch.y1, az - 0.2), holeR = 1.75;
  const near = (p: THREE.Vector3) => Math.hypot(p.x - hole.x, p.z - hole.z);
  // the nave ceiling: broken rock hanging 0.3–1.2 m, a ragged opening round the shaft (deeper rock at its lip)
  sheets.push(rockSheet(V(-N, ch.y1, T.niche.z), V(2 * N, 0, 0), V(0, 0, ch.z1 - T.niche.z), V(0, -1, 0), 1.0, 1, { step: 0.4, edge: 0.25, skip: (p) => near(p) < holeR, rim: (p) => Math.max(0, 0.9 - Math.abs(near(p) - holeR) * 0.9) }));
  // the clerestory (nave walls above the aisle ceilings) + the aisle ceilings + the aisle walls' upper band
  for (const sx of [-1, 1]) {
    sheets.push(rockSheet(V(sx * N, T.aisleTop, ch.z0), V(0, 0, ch.z1 - ch.z0), V(0, ch.y1 - T.aisleTop, 0), V(-sx, 0, 0), 0.55, 2 + sx, { edge: 0.3 }));
    sheets.push(rockSheet(V(sx * N, T.aisleTop, ch.z0), V(sx * (ch.x1 - N), 0, 0), V(0, 0, ch.z1 - ch.z0), V(0, -1, 0), 0.38, 4 + sx, { edge: 0.3 }));
    sheets.push(rockSheet(V(sx * ch.x1, fy + 3.75, ch.z0), V(0, 0, ch.z1 - ch.z0), V(0, T.aisleTop - fy - 3.75, 0), V(-sx, 0, 0), 0.28, 6 + sx, { edge: 0.4 }));
    // the aisle end walls above the carved bands
    for (const zw of [ch.z0, ch.z1]) sheets.push(rockSheet(V(sx * N, fy + 3.75, zw), V(sx * (ch.x1 - N), 0, 0), V(0, T.aisleTop - fy - 3.75, 0), V(0, 0, zw === ch.z0 ? 1 : -1), 0.28, 8 + sx + zw, { edge: 0.4 }));
  }
  // the niche (behind the seated gorilla): back wall above 2.6 m + its lower ceiling; the front wall over the corridor
  sheets.push(rockSheet(V(-N, fy + 2.6, ch.z0), V(2 * N, 0, 0), V(0, T.niche.top - fy - 2.6, 0), V(0, 0, 1), 0.3, 12, { edge: 0.3 }));
  sheets.push(rockSheet(V(-N, T.niche.top, ch.z0), V(2 * N, 0, 0), V(0, 0, T.niche.z - ch.z0), V(0, -1, 0), 0.5, 13, { edge: 0.3 }));
  sheets.push(rockSheet(V(-N, 9.3, ch.z1), V(2 * N, 0, 0), V(0, ch.y1 - 9.3, 0), V(0, 0, -1), 0.4, 14, { edge: 0.3 }));
  // fallen ceiling slabs wedged high in the nave + broken rock round the shaft's mouth (all above 8.4 m: out of reach)
  for (let k = 0; k < 9; k++) { const a = rnd() * 6.28, r = holeR + 0.3 + rnd() * 0.9, s = 0.35 + rnd() * 0.45;
    chunks.push(rock(s * 1.4, s, s * 1.1, { seed: 70 + k, angular: true, tint: "#6f604f" }).applyMatrix4(new THREE.Matrix4().makeRotationY(rnd() * 6).setPosition(hole.x + Math.cos(a) * r, ch.y1 - 0.5 - rnd() * 0.5, hole.z + Math.sin(a) * r))); }
  for (const [x, z, s] of [[-2.2, az + 6.5, 0.8], [2.4, az + 11, 0.7], [-1.8, az + 16.5, 0.6], [1.6, az + 3.2, 0.55]] as Array<[number, number, number]>)
    chunks.push(rock(s * 1.8, s * 0.8, s * 1.3, { seed: 90 + Math.round(z), angular: true, tint: "#655747" }).applyMatrix4(new THREE.Matrix4().makeRotationY(rnd() * 6).setPosition(x, ch.y1 - 0.75, z)));
  // roots pouring from the ceiling cracks: thick ones round the shaft, thinner curtains along the clerestory (≥ 6.4 m up)
  for (let k = 0; k < 7; k++) { const a = rnd() * 6.28; roots.push(...rootTangles(rnd, hole.x + Math.cos(a) * (holeR + 0.2), ch.y1 - 0.2, hole.z + Math.sin(a) * (holeR + 0.2), 3, 1.6, 3.4, 0.09)); }
  for (let k = 0; k < 10; k++) { const sx = k % 2 ? -1 : 1; roots.push(...rootTangles(rnd, sx * (N - 0.5), ch.y1 - 0.3, az + 1 + rnd() * 16, 2, 1.0, 2.6, 0.06)); }
  for (let k = 0; k < 8; k++) { const sx = k % 2 ? -1 : 1; roots.push(...rootTangles(rnd, sx * (N + 1.3), T.aisleTop - 0.2, az - 2 + rnd() * 19, 2, 0.6, 1.4, 0.05)); }
  const rockM = stoneMaterial(pbr(ctx, "lava-rock"), { scale: 3.2, triplanar: true, moss: 0.55, mossCover: 0.4, mossColor: "#5f8f2c", vertexColors: true, variation: 0.35, color: "#a08a72", roughness: 0.9, detail: 0.6 }, pbr(ctx, "moss"));
  interiorPatch(rockM, mats.zone, "vcave");
  const rootM = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.92 }); interiorPatch(rootM, mats.zone, "vroot");
  const g = new THREE.Group(); g.name = "vault-cave";
  g.add(...[staticMesh(merge(sheets.filter((x): x is Geo => !!x)), rockM, "vault-cave-rock", false), staticMesh(merge(chunks), rockM, "vault-cave-chunks", false), staticMesh(merge(roots), rootM, "vault-root-vines", false)].filter((m): m is THREE.Mesh => !!m));
  // creeper curtains out of the ceiling cracks
  const vines: VineSpot[] = [];
  for (let k = 0; k < 10; k++) { const sx = k % 2 ? -1 : 1; vines.push({ x: sx * (N - 0.1), y: ch.y1 - 0.4, z: az - 1 + rnd() * 18, w: 1.4 + rnd(), len: 2.4 + rnd() * 2.4, ry: sx < 0 ? Math.PI / 2 : -Math.PI / 2 }); }
  buildHangingVines(ctx, g, vines, 1, { oneSided: true, push: 0.25, out: 0.2, color: "#9fbf72" });
  g.traverse((o) => { if (o.name === "jungle-vines") interiorPatch((o as THREE.Mesh).material as THREE.MeshStandardMaterial, mats.zone, "vcv"); });
  root.add(g);
  return g;
}
