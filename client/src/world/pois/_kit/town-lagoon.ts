// poi-town LAGOON kit (Stilt Town, Coconut Cove piers): round tapered timber piles with a pale barnacle tide band, algae
// line, moss and rope lashings; rope-railed plank bridges; sand/rock islets; prop-root mangrove clumps with dense low
// canopies; mooring poles; painted oil drums; a fish rack with real fish; a timber derrick with rope + net basket;
// readable coarse fishing nets with a rope head-line. Everything goes into the TownBins (merged, vertex-colour tinted).
// Water line is y = 0 (sea level); `at` matrices are world.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { TownBins } from "./town-materials";
import { M, col, cylGeo, latheGeo, tubeGeo, catenary, noise3, chamferBoxGeo, type ColorFn } from "./town-geo";

const TAU = Math.PI * 2;
type Mat = THREE.Matrix4;
type Rng = () => number;
const T = (at: Mat, x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx): Mat => at.clone().multiply(M(x, y, z, yaw, pitch, roll, sx, sy, sz));
const ROPE = "#c9a868";

// ================================================================================================ piles
/** tapered round pile from `bottom` to `top` (world y): UV u runs UP the pile (y) and v round it, so the plank
 *  texture's grain is vertical (mapped round the pile it reads as stacked bricks). Few rings (the tide band is a sleeve). */
const pileCache = new Map<string, THREE.BufferGeometry>();
function pileGeo(top: number, bottom: number, r: number, seed: number): THREE.BufferGeometry {
  const key = `${top.toFixed(1)}|${bottom.toFixed(1)}|${r.toFixed(2)}|${Math.round(seed) % 4}`;
  const hit = pileCache.get(key); if (hit) return hit;
  const ys = [bottom, Math.max(bottom + 0.1, -0.4), 0.6, Math.max(0.7, top - 0.5), top].filter((y, i, a) => y >= bottom && y <= top && (i === 0 || y > a[i - 1] + 0.05));
  const seg = 10, pos: number[] = [], idx: number[] = [], uv: number[] = [];
  for (let j = 0; j < ys.length; j++) {
    const y = ys[j], t = (y - bottom) / Math.max(0.01, top - bottom), rr = r * (1.08 - 0.16 * t);
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU, wob = 1 + 0.05 * Math.sin(a * 3 + seed) + 0.03 * Math.sin(a * 5 + y * 3 + seed);
      // LOG mapping: the whole circumference spans ~one board of the planks texture, so the grain runs up an
      // unbroken log instead of reading as a barrel of staves / stacked bricks
      pos.push(Math.cos(a) * rr * wob, y, Math.sin(a) * rr * wob); uv.push(y * 0.55 + seed, (i / seg) * 0.16 + seed * 0.37);
    }
  }
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  pileCache.set(key, g);
  return g;
}
/** barnacle / tide SLEEVE round a pile: a slightly fatter ring from −0.45 to ~+0.6 m with a ragged top edge (vertex
 *  colour: pale crusty band above the water, dark algae below), drawn in the rock material (specks = barnacles) */
const sleeveCache = new Map<string, THREE.BufferGeometry>();
function sleeveGeo(r: number, seed0: number): THREE.BufferGeometry {
  // cached per (radius, seed bucket) — every sleeve shares a handful of shapes (the barnacle specks come from the rock
  // texture + vertex colour noise evaluated in world space, so repeats do not show)
  const seed = Math.floor(seed0) % 4, key = `${r.toFixed(2)}|${seed}`, hit = sleeveCache.get(key);
  if (hit) return hit;
  // no ragged cut edge (it reads as a paper sawtooth) — the crust BULGES out of the pile
  // (lumpy, 12 segments, noisy radius) and its top row sits flush on the pile surface, so the vertex colours (pale crust →
  // the pile's own wood tone) feather the band out instead of ending in a cut
  const seg = 12, rows = [-0.45, -0.05, 0.12, 0.3, 0.46, 0.62], pos: number[] = [], idx: number[] = [], uv: number[] = [];
  for (let j = 0; j < rows.length; j++) for (let i = 0; i <= seg; i++) {
    const a = i / seg * TAU, last = j === rows.length - 1, wob = 0.05 * Math.sin(a * 5 + seed * 1.7 + j * 2.1) + 0.035 * Math.sin(a * 9 + seed + j * 3.3);
    const y = rows[j] + (j >= 2 && !last ? 0.05 * Math.sin(a * 3 + seed + j) : 0);
    const rr = last ? r * 1.0 : r * (1.13 - 0.018 * j) * (1 + wob);
    pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr); uv.push(a * r * 2, y * 2);
  }
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  sleeveCache.set(key, g);
  return g;
}
const SILVER = new THREE.Color("#b8ab98");
const WOOD_P = new THREE.Color("#8e7760"), BARN = new THREE.Color("#ece8dc"), ALGAE = new THREE.Color("#3f5a30"), WET = new THREE.Color("#3f3326"), MOSS = new THREE.Color("#6f8f3a");
/** a stilt pile: dark weathered timber (vertical grain), a pale speckled barnacle sleeve round the water line with dark
 *  algae under it, moss patches higher up, a thick rope lashing near the top */
export function addPile(bins: TownBins, x: number, z: number, top: number, bottom: number, r = 0.17, rng: Rng = Math.random, lash = true, o?: { cap?: boolean }) {
  const k = 0.9 + rng() * 0.2, seed = rng() * 10;
  const fn: ColorFn = (px, py, pz, b, o) => {
    o.copy(WOOD_P).multiplyScalar(k * (0.86 + 0.22 * noise3(px * 3 + seed, py * 0.8, pz * 3)));
    if (py < -0.3) o.lerp(py < -0.8 ? WET : ALGAE, 0.7);
    else if (py < 0.9) o.multiplyScalar(0.72 + 0.28 * (py + 0.3) / 1.2);   // wet darkening above the tide band
    // sun-bleached silver-grey tops (piles are pale where the weather hits them)
    if (py > 1.0) o.lerp(SILVER, 0.3 * Math.min(1, (py - 1.0) / 1.5));
    const m = noise3(px * 2.3 + seed, py * 1.3, pz * 2.3);
    if (py > 1.2 && m > 0.66) o.lerp(MOSS, Math.min(1, (m - 0.66) * 5) * 0.7);
  };
  bins.wood.add(pileGeo(top, bottom, r, seed), M(x, 0, z), 0xffffff, fn);
  // end-grain cap only where the top shows (bridge / mooring posts — a deck hides it)
  if (!lash || o?.cap) bins.wood.add(latheGeo([[0, 0.05], [r * 0.7, 0.045], [r * 0.95, 0]], 8), M(x, top - 0.02, z), col("#7a5a3a"));
  if (bottom < -0.2) bins.rock.add(sleeveGeo(r, seed), M(x, 0, z, seed), 0xffffff, (px, py, pz, b, o) => {
    const n = noise3(px * 9, py * 7 + seed, pz * 9);
    o.copy(py > -0.02 ? BARN : ALGAE).multiplyScalar(py > -0.02 ? 0.82 + 0.25 * n : 0.7 + 0.3 * n);
    // feather into the timber above ~0.35 m (the top row IS the pile's own wet tone)
    if (py > 0.3) o.lerp(WOOD_P.clone().multiplyScalar(0.7 * k), Math.min(1, (py - 0.3) / 0.3) * (0.75 + 0.25 * n));
  });
  if (lash) addLashing(bins, x, top - 0.42, z, r * 0.98, col(ROPE, 0.9 + rng() * 0.15));
}
/** a chunky rope lashing: 4 bulging turns round a post (lathe, open ends), shaded in the grooves */
const lashCache = new Map<number, THREE.BufferGeometry>();
function lashGeo(r: number): THREE.BufferGeometry {
  // 4 THIN rope turns (fat ones look like hose clamps) (1.4 cm bulges, grooves between) over 18 cm,
  // a 9-point profile × 8 segments (~128 tris)
  const k = Math.round(r * 100);
  let g = lashCache.get(k);
  if (!g) {
    const P: Array<[number, number]> = [[r + 0.002, 0]];
    for (let i = 0; i < 4; i++) { const y0 = 0.012 + i * 0.044; P.push([r + 0.016, y0 + 0.01], [r + 0.019, y0 + 0.022], [r + 0.004, y0 + 0.042]); }
    g = latheGeo(P, 8); lashCache.set(k, g);
  }
  return g;
}
export function addLashing(bins: TownBins, x: number, y: number, z: number, r: number, c: THREE.Color) {
  bins.rope.add(lashGeo(r), M(x, y, z), c, (px, py, pz, b, o) => { const d = Math.hypot(px - x, pz - z) - r; o.multiplyScalar(0.62 + 0.4 * Math.min(1, d / 0.034)); });
}

// ================================================================================================ plank bridge
/** rope-railed plank bridge from a to b at deck height y (planks across, two stringers, posts + rope rails) */
export function addPlankBridge(bins: TownBins, a: [number, number], b: [number, number], y: number, w: number, rng: Rng, piles: (x: number, z: number) => number) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const base = M((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, yaw);
  const n = Math.max(2, Math.floor(len / 0.26));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5, sag = -0.06 * (1 - (2 * t) ** 2);
    bins.woodDark.add(chamferBoxGeo(w * (0.94 + rng() * 0.08), 0.05, 0.22, 0.012, [rng() * 3, 0]), T(base, (rng() - 0.5) * 0.06, sag - 0.025, t * len, (rng() - 0.5) * 0.05), col("#a67c4e", 0.85 + rng() * 0.3));
  }
  for (const s of [-1, 1]) bins.woodDark.add(chamferBoxGeo(0.1, 0.14, len + 0.4, 0.02), T(base, s * (w / 2 - 0.1), -0.13, 0), col("#6e4f30"));
  // posts + rope rails (and piles under long spans)
  const np = Math.max(1, Math.round(len / 2.4));
  const pts: THREE.Vector3[][] = [[], []];
  for (let i = 0; i <= np; i++) {
    const t = i / np - 0.5;
    for (const [k, s] of [[0, -1], [1, 1]] as Array<[number, number]>) {
      const p = new THREE.Vector3(s * (w / 2 - 0.05), 0, t * len).applyMatrix4(base);
      bins.woodDark.add(cylGeo(0.045, 0.055, 1.05, 7), M(p.x, y + 0.5, p.z, 0, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08), col("#5b3c1e"));
      pts[k].push(new THREE.Vector3(p.x, y + 0.95, p.z));
      if (i > 0 && i < np && len > 5) addPile(bins, p.x, p.z, y - 0.1, piles(p.x, p.z) - 0.6, 0.12, rng, false);
    }
  }
  for (const side of pts) for (let i = 0; i < side.length - 1; i++) {
    bins.rope.add(tubeGeo(catenary(side[i], side[i + 1], 0.12, 6), 0.026, 4, false, 7), null, col(ROPE));
    bins.rope.add(tubeGeo(catenary(side[i].clone().setY(y + 0.5), side[i + 1].clone().setY(y + 0.5), 0.09, 6), 0.022, 4, false, 7), null, col(ROPE, 0.92));
  }
}

// ================================================================================================ islet, mangrove
/** low sand + rock mound breaking the water (the terrain has no islet here) */
export function addIslet(bins: TownBins, x: number, z: number, s: number, yaw: number, rng: Rng) {
  const g = new THREE.SphereGeometry(1, 28, 10, 0, TAU, 0, Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), n = 0.85 + 0.3 * noise3(px * 2.1 + x, pz * 2.1, py);
    p.setXYZ(i, px * n * 1.25, py * 0.28 - 0.25, pz * n * 0.9);
  }
  g.computeVertexNormals();
  bins.sand.add(g, M(x, 0, z, yaw, 0, 0, s, s, s), col("#e9dcb9"), (px, py, pz, b, o) => { if (py < 0.08) o.lerp(new THREE.Color("#a99a70"), 0.5); if (py > 0.3) o.lerp(new THREE.Color("#8faa55"), Math.min(1, (py - 0.3) * 2) * 0.55); });
  for (let i = 0; i < 4; i++) { const a = rng() * TAU, r = s * (0.5 + rng() * 0.6); addRock(bins, M(x + Math.cos(a) * r, -0.15, z + Math.sin(a) * r, rng() * 6), 0.5 + rng() * 0.7, rng, 0.6, "#8e8a78"); }
}

// ================================================================================================ small props
/** timber mooring pole standing in the water, rope collar, top cap */
export function addMooringPole(bins: TownBins, x: number, z: number, h: number, bottom: number, rng: Rng) {
  addPile(bins, x, z, h, bottom, 0.14, rng, true, { cap: false });
  bins.woodDark.add(latheGeo([[0, 0], [0.16, 0], [0.12, 0.08], [0, 0.1]], 10), M(x, h, z), col("#4e3a28"));
}
/** painted steel oil drum (ribs, rim, chipped paint) */
export function addDrum(bins: TownBins, at: Mat, color: string, rng: Rng) {
  const prof: Array<[number, number]> = [[0, 0], [0.27, 0], [0.29, 0.02], [0.29, 0.28], [0.305, 0.3], [0.29, 0.32], [0.29, 0.56], [0.305, 0.58], [0.29, 0.6], [0.29, 0.86], [0.3, 0.88], [0.26, 0.88], [0.25, 0.87], [0, 0.87]];
  const c = col(color), rust = new THREE.Color("#7a4a28");
  bins.metal.add(latheGeo(prof, 18), at, c, (x, y, z, b, o) => { const n = noise3(x * 6, y * 6, z * 6); if (n > 0.72) o.lerp(rust, (n - 0.72) * 3); if (y - at.elements[13] < 0.12) o.multiplyScalar(0.7); });
  bins.metal.add(cylGeo(0.035, 0.035, 0.04, 8), T(at, 0.12, 0.89, 0.05), col("#9aa0a6"));
  void rng;
}
let fishG: THREE.BufferGeometry | null = null;
/** one fish: lathe body (head → tail) along −y (hanging by the tail), forked tail fin */
function fishGeo(): THREE.BufferGeometry {
  if (fishG) return fishG;
  // (a FISH, not a spindle — deep flattened body, blunt head, forked tail fin, dorsal + belly fins, dark back
  //  with a silver flank stripe; hanging by the tail (tail root at y 0, the head 0.46 m down))
  const body = latheGeo([[0, 0], [0.014, -0.012], [0.032, -0.06], [0.072, -0.16], [0.094, -0.26], [0.09, -0.33], [0.068, -0.4], [0.038, -0.445], [0, -0.462]], 14);
  body.scale(1, 1, 0.38);
  const tri: number[] = [];
  const fin = (pts: number[][]) => { for (const z of [0.004, -0.004]) { const q = z > 0 ? pts : [pts[0], pts[2], pts[1]]; for (const v of q) tri.push(v[0], v[1], z); } };
  fin([[0, 0.005], [-0.12, 0.15], [0, 0.07]]); fin([[0, 0.005], [0, 0.07], [0.12, 0.15]]);                 // forked tail
  fin([[0.085, -0.13], [0.16, -0.17], [0.09, -0.3]]);                                                   // dorsal (the back = +x)
  fin([[-0.08, -0.2], [-0.13, -0.24], [-0.085, -0.3]]);                                                 // belly fin
  const bn = body.toNonIndexed();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...(bn.attributes.position.array as Float32Array), ...tri], 3));
  g.computeVertexNormals();
  const p = g.attributes.position as THREE.BufferAttribute, cc = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    let k = x > 0.03 ? 0.5 : x > -0.01 ? 0.82 : 1.08;          // dark back, a lighter flank, silver belly
    if (Math.abs(x - 0.012) < 0.016 && y < -0.08) k = 1.15;      // the flank stripe
    if (y < -0.43) k *= 0.6;                                     // darker snout
    if (y > 0.01) k *= 0.75;                                     // fins a shade darker
    cc[i * 3] = k; cc[i * 3 + 1] = k * 1.02; cc[i * 3 + 2] = k * 1.06;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cc, 3));
  fishG = g;
  return g;
}
/** a pole with fish hanging from strings (at = pole centre, local x along the pole) */
export function addFishRack(bins: TownBins, at: Mat, n: number, rng: Rng = Math.random) {
  const L = n * 0.24 + 0.3;
  bins.woodDark.add(cylGeo(0.03, 0.03, L, 7), T(at, 0, 0, 0, 0, 0, Math.PI / 2), col("#5b3c1e"));
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.25 + i * 0.24;
    bins.rope.add(cylGeo(0.006, 0.006, 0.14, 4), T(at, x, -0.07, 0), col(ROPE));
    const tone = ["#9fb4c2", "#b9c6cf", "#8fa6b8", "#c9a37a"][i % 4];
    bins.metal.add(fishGeo(), T(at, x, -0.14, 0, rng() * 0.6 - 0.3, 0, (rng() - 0.5) * 0.15, 0.95 + rng() * 0.3), col(tone));
  }
}
/** timber derrick: post, a raked boom with rope stays, a hanging net basket full of fish/floats */
export function addDerrick(bins: TownBins, at: Mat, rng: Rng) {
  const tim = col("#6e5034");
  bins.woodDark.add(chamferBoxGeo(5.4, 0.24, 0.24, 0.03).rotateZ(Math.PI / 2), T(at, 0, 2.7, 0), tim, (x, y, z, b, o) => o.multiplyScalar(0.85 + 0.25 * noise3(x * 2, y * 4, z * 2)));
  // boom: pivot at 3.6 m, raked out 50°
  const pivot = new THREE.Vector3(0, 3.6, 0).applyMatrix4(at), dir = new THREE.Vector3(Math.sin(0.9), Math.cos(0.9), 0).transformDirection(at);
  const tip = pivot.clone().addScaledVector(dir, 3.6);
  bins.woodDark.add(tubeGeo([pivot, tip], 0.09, 8, false, 2), null, tim);
  // stays + the hoist line
  const postTop = new THREE.Vector3(0, 5.35, 0).applyMatrix4(at);
  bins.rope.add(tubeGeo([postTop, tip], 0.02, 5, false, 2), null, col(ROPE));
  const hang = tip.clone().add(new THREE.Vector3(0, -1.3, 0));
  bins.rope.add(tubeGeo([tip, hang], 0.02, 5, false, 2), null, col(ROPE));
  // net basket: coarse net cone + contents
  const basket = M(hang.x, hang.y - 0.55, hang.z);
  bins.net.add(latheGeo([[0.05, 0.6], [0.45, 0.45], [0.55, 0.1], [0.4, -0.25], [0.1, -0.45], [0, -0.48]], 14), basket, 0xffffff);
  for (let i = 0; i < 7; i++) bins.fruit.add(new THREE.SphereGeometry(0.13, 8, 6), T(basket, (rng() - 0.5) * 0.5, -0.1 + (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.5), col(i % 3 ? "#8fa6b8" : "#2fb3a8"));
  bins.rope.add(new THREE.TorusGeometry(0.46, 0.03, 5, 16), T(basket, 0, 0.44, 0, 0, Math.PI / 2), col(ROPE));
}
/** coarse fishing net draped from its head-line (w wide, h deep) in the local XY plane facing +z; mesh ≈ 22 cm */
export function addNet(bins: TownBins, at: Mat, w: number, h: number, sag = 0.5, rng: Rng = Math.random) {
  const g = new THREE.PlaneGeometry(w, h, 20, 16);
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), t = 0.5 - y / h; // 0 top → 1 bottom
    // draped: gathered toward the bottom, vertical folds that deepen downward, a sagging belly out from the wall
    pos.setZ(i, -sag * t * t * 2 + 0.22 * Math.sin(x * 3.1 + t * 2) * t + 0.12 * Math.sin(x * 7.3 + 1.7) * t * t + 0.06 * Math.sin(x * 13) * t);
    pos.setX(i, x * (1 - 0.38 * t * t) + 0.12 * Math.sin(t * 5 + x));
    pos.setY(i, y - 0.3 * t * t * Math.cos(x / w * Math.PI) - 0.08 * Math.sin(x * 4.1) * t);
    uv.setXY(i, uv.getX(i) * w * 2.4, uv.getY(i) * h * 2.4);
  }
  g.computeVertexNormals();
  bins.net.add(g, T(at, 0, -h / 2, 0), 0xffffff);
  // head-line rope + cork floats along it
  const a = new THREE.Vector3(-w / 2, 0, 0).applyMatrix4(at), b = new THREE.Vector3(w / 2, 0, 0).applyMatrix4(at);
  bins.rope.add(tubeGeo(catenary(a, b, 0.08, 10), 0.028, 5, false, 12), null, col(ROPE));
  const nF = Math.max(2, Math.round(w / 0.7));
  for (let i = 0; i < nF; i++) { const t = (i + 0.5) / nF; bins.plastic.add(new THREE.SphereGeometry(0.075, 10, 8), T(at, -w / 2 + w * t, -0.08 - 0.08 * Math.sin(t * Math.PI), 0.03, 0, 0, 0, 1, 0.75, 1), col(rng() < 0.5 ? "#e8722a" : "#f2c132")); }
}

// ================================================================================================ rocks
const rockCache: THREE.BufferGeometry[] = [];
/** bevelled, rounded boulder (noise-displaced detail-3 sphere, flattened base): mossy top, damp dark foot */
export function rockGeo(v: number, hi = true): THREE.BufferGeometry {
  const k = (v % 5) + (hi ? 0 : 5);
  if (rockCache[k]) return rockCache[k];
  // detail 3 (1280 tris) for big / near rocks, 2 (320) for small ones — smooth normals either way
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, hi ? 3 : 2);
  g.deleteAttribute("normal"); g.deleteAttribute("uv"); g = mergeVertices(g);   // indexed → SMOOTH normals (not faceted)
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let n = 1 + 0.18 * (noise3(x * 1.4 + k * 3, y * 1.4, z * 1.4) - 0.5) * 2 + 0.07 * (noise3(x * 4 + k, y * 4, z * 4) - 0.5) * 2;
    // soft facets: quantise the big lobes a bit so it reads as stone, not a blob
    n = n * 0.85 + 0.15 * Math.round(n * 5) / 5;
    const yy = y < -0.3 ? -0.3 + (y + 0.3) * 0.35 : y;
    let px = x * n * 1.15, py = yy * n * 0.78, pz = z * n;
    // SCULPTED: 7 cleavage planes per shape chop the lobes into flat faces + a flat-ish weathered top
    // (no blob rocks) — a vertex past a plane is pulled back onto it, soft 20 % so the edge keeps a bevel
    for (let c = 0; c < 7; c++) {
      const a = c * 2.39996 + k * 1.3, e = (c % 3 - 1) * 0.45 + 0.15, nx = Math.cos(a) * Math.cos(e), ny = Math.sin(e), nz = Math.sin(a) * Math.cos(e);
      const d = px * nx + py * ny + pz * nz, lim = 0.72 + 0.1 * ((c * 7 + k) % 3);
      if (d > lim) { const q = (d - lim) * 0.8; px -= nx * q; py -= ny * q; pz -= nz * q; }
    }
    if (py > 0.66) py = 0.66 + (py - 0.66) * 0.3;
    p.setXYZ(i, px, py, pz);
  }
  g.computeVertexNormals();
  // triplanar-ish UVs: project on the dominant axis (metres)
  const nor = g.attributes.normal as THREE.BufferAttribute, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i)); const [u, v] = ay > ax && ay > az ? [p.getX(i), p.getZ(i)] : ax > az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)]; uv[i * 2] = u * 1.4; uv[i * 2 + 1] = v * 1.4; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  rockCache[k] = g;
  return g;
}
export function addRock(bins: TownBins, at: Mat, r: number, rng: Rng, mossy = 0.5, color = "#9a9483", low = false) {
  const gy = at.elements[13];
  bins.rock.add(rockGeo(Math.floor(rng() * 5), r > 1.1 && !low), T(at, 0, 0, 0, rng() * 6, 0, 0, r, r, r), col(color, 0.92 + rng() * 0.16), (x, y, z, b, o) => {
    const up = (y - gy) / r, n = noise3(x * 1.8, y * 1.8, z * 1.8), n2 = noise3(x * 5 + 3, y * 5, z * 5);
    // mossy crown (soft-edged patches), damp dark foot, a pale tide line where it meets the sea
    if (up > 0.05 && n > 0.3) o.lerp(MOSS, mossy * Math.min(1, (up - 0.05) * 2.5) * Math.min(1, (n - 0.3) * 3) * (0.75 + 0.25 * n2));
    // a moss CAP on the weathered top (soft ragged edge), lighter sun-bleached stone just under it
    if (up > 0.38) o.lerp(MOSS, Math.min(0.92, mossy * 1.6) * Math.min(1, (up - 0.38) * 4 + (n2 - 0.5) * 0.8));
    else if (up > 0.1) o.multiplyScalar(1.06);
    if (y < 0.3 && y > -0.3) o.lerp(BARN, 0.3 * (1 - Math.abs(y) / 0.3));
    else if (y <= -0.3) o.lerp(ALGAE, 0.45);
    o.multiplyScalar(0.72 + 0.28 * Math.max(0, Math.min(1, up + 0.3)));
  });
}

/** a big fishing net DRAPED in a swag from two eave points (the market front): the head-line sags between
 *  the ends, the sheet hangs deepest in the middle and bellies out, gathered folds; cork + glass floats on the head-line.
 *  `at` = the midpoint of the head-line (local x along it, +z = outward from the wall) */
export function addNetSwag(bins: TownBins, at: Mat, w: number, h: number, rng: Rng = Math.random) {
  const nx = 24, ny = 14, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx - 0.5, t = j / ny, e = 1 - (2 * u) ** 2;               // e: 1 in the middle → 0 at the ends
    const top = -0.35 * e;                                                   // head-line catenary
    const depth = h * Math.pow(Math.max(0, e), 0.55) * (0.75 + 0.25 * Math.sin(u * 5 + 1.3));
    const y = top - t * depth;
    const fold = 0.09 * Math.sin(u * w * 5.5 + t * 1.5) * t + 0.05 * Math.sin(u * w * 13) * t;
    const z = 0.55 * Math.sin(Math.PI * t) * e + 0.25 * t * t * e + fold;
    const x = u * w * (1 - 0.3 * t * t * e);
    pos.push(x, y, z); uv.push(u * w * 2.4, -y * 2.4);   // ~4 cm mesh
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  bins.net.add(g, at, 0xffffff);
  // the head-line rope + floats (cork orange/yellow, a few teal glass floats in rope cradles)
  const hl: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) { const u = i / 10 - 0.5; hl.push(new THREE.Vector3(u * w, -0.35 * (1 - (2 * u) ** 2), 0).applyMatrix4(at)); }
  bins.rope.add(tubeGeo(hl, 0.03, 5, false, 16), null, col(ROPE));
  const nF = Math.max(3, Math.round(w / 0.55));
  for (let i = 0; i < nF; i++) {
    const u = (i + 0.5) / nF - 0.5, y = -0.35 * (1 - (2 * u) ** 2) - 0.1;
    if (i % 3 === 1) { bins.glass.add(new THREE.SphereGeometry(0.13, 12, 10), T(at, u * w, y - 0.12, 0.08), 0xffffff); bins.rope.add(new THREE.TorusGeometry(0.13, 0.012, 4, 12), T(at, u * w, y - 0.12, 0.08, 0, Math.PI / 2), col(ROPE)); }
    else bins.plastic.add(new THREE.SphereGeometry(0.075, 10, 8), T(at, u * w, y, 0.04, 0, 0, 0, 1, 0.75, 1), col(rng() < 0.5 ? "#e8722a" : "#f2c132"));
  }
}
