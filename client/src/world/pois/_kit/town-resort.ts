// poi-town RESORT kit (Coconut Cove): round layered-thatch tiki bar on bamboo posts, coral/cream beach umbrellas with a
// scalloped valance + ribs, slatted loungers with cream cushions, towels, side tables, fallen palm fronds, the raised
// pool's mosaic-tile + caustics material. Everything goes into the TownBins (merged per material, vertex-colour tinted).
// Conventions: `at` = WORLD matrix of the prop's ground-contact origin; local +z = front, +y up, metres.
import * as THREE from "three";
import { fruitSink } from "./town-fruit";
import type { TownBins } from "./town-materials";
import { M, col, cylGeo, latheGeo, chamferBoxGeo, tubeGeo, noise3, type ColorFn } from "./town-geo";
import { stripeValance, leafGeo } from "./town-building";

const TAU = Math.PI * 2;
type Mat = THREE.Matrix4;
type Rng = () => number;
const T = (at: Mat, x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx): Mat => at.clone().multiply(M(x, y, z, yaw, pitch, roll, sx, sy, sz));

// ================================================================================================ bamboo
/** a bamboo pole from a to b (local to at): segmented culm with swollen nodes */
export function bamboo(bins: TownBins, at: Mat, a: THREE.Vector3, b: THREE.Vector3, r: number, rng: Rng, color = "#b89a5a") {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const base = at.clone().multiply(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
  const segL = 0.38 + rng() * 0.1, n = Math.max(1, Math.round(len / segL)), sl = len / n;
  const c0 = col(color), dark = col(color).multiplyScalar(0.72);
  for (let i = 0; i < n; i++) {
    const y0 = i * sl, k = 0.93 + rng() * 0.12;
    bins.wood.add(cylGeo(r, r * 1.02, sl - 0.02, 10), base.clone().multiply(M(0, y0 + sl / 2, 0)), c0.clone().multiplyScalar(k), (x, y, z, bb, o) => o.multiplyScalar(0.92 + 0.12 * noise3(x * 6, y * 2, z * 6)));
    bins.woodDark.add(cylGeo(r * 1.12, r * 1.12, 0.045, 10), base.clone().multiply(M(0, y0 + sl, 0)), dark);
  }
}

/** one ragged thatch SKIRT of a low mushroom-dome roof — outer surface from (r0, y0) down to a thick shaggy lip at
 *  (r1, y1) (bulging, drooping toward the rim, alternating straw "teeth" of random length), then the underside back in
 *  under the lip so the thickness reads from outside and the straw from below. V spans ONE course of the thatch
 *  texture (its fringe shadow lands on the geometric lip), U = metres round. */
function thatchSkirt(r0: number, y0: number, r1: number, y1: number, seg: number, rng: Rng, o: { bulge?: number; teeth?: number; thick?: number } = {}): THREE.BufferGeometry {
  const rings = 6, bulge = o.bulge ?? 0.18, teeth = o.teeth ?? 0.22, thick = o.thick ?? 0.26;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const jit = Array.from({ length: seg + 1 }, () => rng()), wav = Array.from({ length: seg + 1 }, () => rng());
  jit[seg] = jit[0]; wav[seg] = wav[0];
  const course = 0.3; // texture metres per course (genThatch: 5 courses / 1.5 m)
  const row = (r: number, y: number, v: number, i: number) => { const a = i / seg * TAU; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); uv.push(a * r1, v); };
  // outer: rings 0..rings, then the lip teeth row (rings+1), then 2 underside rows
  for (let j = 0; j <= rings + 3; j++) {
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU, jj = jit[i], w = 0.5 + 0.5 * Math.sin(a * 5 + wav[0] * 6) * 0.6 + 0.4 * (wav[i] - 0.5);
      if (j <= rings) {
        const t = j / rings, e = t * t;
        let r = r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * bulge + 0.04 * Math.sin(a * 9 + j) * t;
        let y = y0 + (y1 - y0) * (0.55 * t + 0.45 * e);
        if (j === rings) { y += (jj - 0.5) * 0.08 - 0.04 * w; r += (jj - 0.5) * 0.1; }
        row(r, y, t * course * 0.82, i);
      } else if (j === rings + 1) {
        // shaggy straw ends: alternating long / short teeth hanging below the rim, flared out a little
        const drop = teeth * (0.35 + 0.65 * jj) * ((i & 1) ? 1 : 0.55) * (0.8 + 0.4 * w);
        row(r1 + 0.1 + 0.08 * jj, y1 - drop, course, i);
      } else if (j === rings + 2) {
        row(r1 - thick * 0.5, y1 - 0.02, course * 0.7, i);
      } else {
        row(r1 - thick * 1.6, y1 + thick * 0.8, course * 0.3, i);
      }
    }
  }
  const W = seg + 1;
  for (let j = 0; j < rings + 3; j++) for (let i = 0; i < seg; i++) { const a = j * W + i, b = a + W; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** hanging creeper strand: small leaves alternating down a gently swinging line from `top` (local to at) */
export function vineStrand(bins: TownBins, at: Mat, top: THREE.Vector3, drop: number, rng: Rng, color = "#4f8a2e") {
  const n = Math.max(3, Math.round(drop / 0.16)), sway = (rng() - 0.5) * 0.3, ph = rng() * 6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = -drop * t, x = sway * t * t + 0.04 * Math.sin(t * 5 + ph), z = 0.03 * Math.cos(t * 4 + ph);
    const s = 0.75 + 0.4 * (1 - t) * rng();
    bins.leaf.add(leafGeo(0.26 * s, 0.15 * s), T(at, top.x + x, top.y + y, top.z + z, rng() * TAU, 0.9 + rng() * 0.5, (i % 2 ? 1 : -1) * 0.5), col(color, 0.85 + rng() * 0.3));
  }
}
/** Round tiki bar: bamboo posts, 3-layer ragged thatch dome with moss, green board counter + cream top (gap toward
 *  `gap` local angle for the bartender), 7 bamboo stools, shelves + bottles, lanterns. R = roof post radius. */
export function addTikiBar(bins: TownBins, at: Mat, R: number, rng: Rng, o: { gap?: number; counterR?: number } = {}) {
  const ph = 2.75, gap = o.gap ?? -Math.PI / 2, cr = o.counterR ?? R - 1.35;
  // ---- posts (6) + ring beam
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6, x = Math.cos(a) * (R - 0.35), z = Math.sin(a) * (R - 0.35);
    bamboo(bins, at, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, ph + 0.35, z), 0.11, rng, "#a88a4e");
    bins.stone.add(cylGeo(0.2, 0.24, 0.16, 10), T(at, x, 0.08, z), col("#b9ab8e"));
  }
  const ring: THREE.Vector3[] = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; ring.push(new THREE.Vector3(Math.cos(a) * (R - 0.35), ph + 0.28, Math.sin(a) * (R - 0.35))); }
  bins.woodDark.add(tubeGeo(ring, 0.09, 8, true, 48), at, col("#7a5a34"));
  // rafters from the ring to the low apex (visible from below)
  const apex = ph + 2.3;
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12; bamboo(bins, at, new THREE.Vector3(Math.cos(a) * (R + 0.45), ph + 0.05, Math.sin(a) * (R + 0.45)), new THREE.Vector3(Math.cos(a) * 0.3, apex - 0.1, Math.sin(a) * 0.3), 0.05, rng, "#9c7e46"); }
  // ---- thatch: a LOW, WIDE shaggy mushroom dome — three overlapping ragged skirts (each lip
  // hanging over the next, thick straw rim, drooping teeth), a flattened crown, a little bamboo cupola with its own
  // thatch hat; moss clumps + creepers trailing from the eave.
  const thC = col("#f2d69c", 1.3), fn: ColorFn = (x, y, z, b, oo) => { const n = noise3(x * 1.3, y * 2.2, z * 1.3), n2 = noise3(x * 5, y * 5, z * 5); oo.multiplyScalar(0.8 + 0.28 * n + 0.08 * n2); if (y < at.elements[13] + ph + 0.3) oo.multiplyScalar(0.8); };
  const grey = (k: number) => thC.clone().lerp(new THREE.Color("#b9ab8c"), k);
  bins.thatch.add(thatchSkirt(R * 0.55, ph + 1.45, R + 1.0, ph - 0.12, 72, rng, { bulge: 0.34, teeth: 0.38, thick: 0.36 }), at, grey(0.16), fn);
  bins.thatch.add(thatchSkirt(R * 0.32, ph + 2.02, R * 0.88, ph + 0.92, 60, rng, { bulge: 0.26, teeth: 0.28, thick: 0.28 }), at, grey(0.07), fn);
  bins.thatch.add(thatchSkirt(0.2, apex, R * 0.58, ph + 1.62, 48, rng, { bulge: 0.18, teeth: 0.22, thick: 0.22 }), at, grey(0), fn);
  // cupola: a short bamboo drum on the crown with a small ragged thatch hat
  bins.wood.add(cylGeo(0.42, 0.46, 0.42, 14), T(at, 0, apex + 0.12, 0), col("#8a7040"), (x, y, z, b, oo) => oo.multiplyScalar(0.85 + 0.2 * noise3(x * 8, y * 3, z * 8)));
  bins.thatch.add(thatchSkirt(0.05, apex + 0.78, 0.7, apex + 0.3, 28, rng, { bulge: 0.08, teeth: 0.12, thick: 0.1 }), at, grey(0.05), fn);
  bins.rope.add(new THREE.TorusGeometry(0.44, 0.035, 5, 16), T(at, 0, apex + 0.3, 0, 0, Math.PI / 2), col("#8a6a3a"));
  // moss cushions on the thatch (lumpy, darker in their folds)
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU, t = 0.2 + rng() * 0.7, r = R * 0.35 + (R + 0.7 - R * 0.35) * t, y = apex - 0.15 - (apex - ph) * t * 0.95;
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) { const n = 0.75 + 0.5 * noise3(p.getX(k) * 3 + i, p.getY(k) * 3, p.getZ(k) * 3); p.setXYZ(k, p.getX(k) * n, p.getY(k) * n, p.getZ(k) * n); }
    g.computeVertexNormals();
    const s0 = 0.18 + rng() * 0.16;
    bins.leaf.add(g, T(at, Math.cos(a) * r, y + 0.06, Math.sin(a) * r, rng() * 6, 0, 0, s0 * 1.4, s0 * 0.7, s0 * 1.2), col(rng() < 0.5 ? "#4a7a2a" : "#5f8a32"), (x, yy, z, b, o) => o.multiplyScalar(0.75 + 0.35 * noise3(x * 9, yy * 9, z * 9)));
    // creepers trailing from the moss down over the eave
    if (i % 3 !== 2) for (let k = 0; k < 3; k++) { const aa = a + (k - 1) * 0.1; vineStrand(bins, at, new THREE.Vector3(Math.cos(aa) * (R + 1.05), ph - 0.12, Math.sin(aa) * (R + 1.05)), 0.7 + rng() * 1.1, rng); }
  }
  // ---- counter: vertical green boards + cream top ring, gap for the bartender
  const gapW = 0.55; // radians
  const nB = 64;
  for (let i = 0; i < nB; i++) {
    const a = i / nB * TAU;
    let da = Math.abs(((a - gap) % TAU + TAU + Math.PI) % TAU - Math.PI);
    if (da < gapW) continue;
    const tone = 0.9 + rng() * 0.18;
    bins.clapboard.add(chamferBoxGeo(cr * TAU / nB + 0.01, 1.04, 0.08, 0.012), T(at, Math.cos(a) * (cr + 0.18), 0.52, Math.sin(a) * (cr + 0.18), -a + Math.PI / 2), col("#3f8a5c", tone));
    if (i % 4 === 0) bins.woodDark.add(chamferBoxGeo(0.07, 1.0, 0.06, 0.01), T(at, Math.cos(a) * (cr + 0.24), 0.5, Math.sin(a) * (cr + 0.24), -a + Math.PI / 2), col("#2f6a45"));
    da = 0;
  }
  // cream top (lathe ring, with the gap cut as two partial lathes)
  const topProf: Array<[number, number]> = [[cr - 0.32, 1.04], [cr - 0.32, 1.1], [cr + 0.36, 1.1], [cr + 0.42, 1.07], [cr + 0.36, 1.04], [cr - 0.32, 1.04]];
  const pts = topProf.map(([r, y]) => new THREE.Vector2(r, y));
  const arc = TAU - gapW * 2, start = gap + gapW;
  const lg = new THREE.LatheGeometry(pts, 40, 0, arc); lg.computeVertexNormals();
  // LatheGeometry phi runs from +z toward +x; rotate so phi 0 lands at `start` in our x = cos, z = sin convention
  bins.stone.add(lg, T(at, 0, 0, 0, Math.PI / 2 - start - arc), col("#ece0c4"));
  // footrail
  const fr: THREE.Vector3[] = []; for (let i = 0; i <= 30; i++) { const a = start + arc * i / 30; fr.push(new THREE.Vector3(Math.cos(a) * (cr + 0.34), 0.22, Math.sin(a) * (cr + 0.34))); }
  bins.metal.add(tubeGeo(fr, 0.025, 6, false, 40), at, col("#b89048"));
  // ---- inside: back shelves with bottles, a cooler, a blender, crates
  const back = T(at, Math.cos(gap) * 0.2, 0, Math.sin(gap) * 0.2, -gap - Math.PI / 2);
  bins.woodDark.add(chamferBoxGeo(1.5, 1.6, 0.4, 0.02), T(back, 0, 0.8, 0), col("#6a4a2c"));
  for (let s = 0; s < 3; s++) for (let i = 0; i < 6; i++) bins.glass.add(cylGeo(0.035, 0.045, 0.24 + (i % 3) * 0.04, 8), T(back, -0.55 + i * 0.22, 1.62 + s * 0.02 + (s === 0 ? 0 : 0) + (s > 0 ? -0.5 * s : 0) + 0.12, 0.08), col(["#3fb37a", "#d9903a", "#c94b3f", "#59a6d1", "#e8d25a", "#6a3a2a"][(i + s) % 6]));
  bins.plastic.add(chamferBoxGeo(0.7, 0.55, 0.5, 0.04), T(at, 0.4, 0.28, 0.3, 0.4), col("#2f7fb5"));
  // ---- stools (7) outside the counter + lanterns under the eave + hanging bananas
  for (let i = 0; i < 7; i++) {
    const a = gap + Math.PI + (i - 3) * 0.62, r = cr + 0.95;
    addStool(bins, T(at, Math.cos(a) * r, 0, Math.sin(a) * r, rng() * 6), rng);
  }
  for (let i = 0; i < 4; i++) { const a = gap + Math.PI * 0.25 + i * 1.55; addLantern(bins, T(at, Math.cos(a) * (R - 0.55), ph - 0.35, Math.sin(a) * (R - 0.55))); }
  for (let i = 0; i < 2; i++) {
    const a = gap + Math.PI + (i ? 0.5 : -0.5), x = Math.cos(a) * (R - 0.8), z = Math.sin(a) * (R - 0.8);
    bins.rope.add(cylGeo(0.01, 0.01, 0.5, 4), T(at, x, ph - 0.05, z), col("#c7b58a"));
    bananaHand(bins, T(at, x, ph - 0.5, z, rng() * 6, Math.PI), rng, 6, 0.9);
  }
}
export function addStool(bins: TownBins, at: Mat, rng: Rng) {
  bins.wood.add(latheGeo([[0, 0.7], [0.2, 0.7], [0.22, 0.74], [0.2, 0.78], [0, 0.78]], 14), at, col("#a47a48", 0.9 + rng() * 0.2));
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; bamboo(bins, at, new THREE.Vector3(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17), new THREE.Vector3(Math.cos(a) * 0.1, 0.7, Math.sin(a) * 0.1), 0.025, rng, "#9c7e46"); }
  const r: THREE.Vector3[] = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU; r.push(new THREE.Vector3(Math.cos(a) * 0.14, 0.28, Math.sin(a) * 0.14)); }
  bins.rope.add(tubeGeo(r, 0.012, 4, true, 16), at, col("#8a6a3a"));
}
export function addLantern(bins: TownBins, at: Mat) {
  bins.metal.add(latheGeo([[0, 0.3], [0.1, 0.3], [0.13, 0.26], [0.02, 0.36], [0, 0.4]], 8), at, col("#2b2f33"));
  bins.glass.add(cylGeo(0.09, 0.09, 0.24, 10), T(at, 0, 0.15, 0), col("#ffe6a8"));
  bins.bulb.add(new THREE.SphereGeometry(0.055, 10, 8), T(at, 0, 0.15, 0), col("#fff2c0"));
  bins.metal.add(cylGeo(0.11, 0.11, 0.03, 10), T(at, 0, 0.02, 0), col("#2b2f33"));
  bins.metal.add(cylGeo(0.008, 0.008, 0.3, 4), T(at, 0, 0.55, 0), col("#2b2f33"));
}
/** a hand of 5–8 curved bananas hanging from a crown (local +y = stem up) */
export function bananaHand(bins: TownBins, at: Mat, rng: Rng, n = 6, s = 1) {
  const fx = fruitSink();
  if (fx) {
    // hanging bunch: stalk + two smooth hands back to back, fingers pointing down and curling out
    bins.woodDark.add(cylGeo(0.018 * s, 0.024 * s, 0.22 * s, 6), T(at, 0, 0.02 * s, 0), col("#6a5a2a"));
    for (const k of [0, 1]) fx.hand(T(at, 0, -0.03 * s - k * 0.05 * s, 0, k * Math.PI + (rng() - 0.5) * 0.4, 0, -Math.PI / 2 + 0.35, s * (0.95 + rng() * 0.1)), Math.min(7, Math.max(5, n - k)), rng() * 0.3);
    return;
  }
  const g = bananaFinger();
  bins.woodDark.add(cylGeo(0.03 * s, 0.04 * s, 0.14 * s, 6), T(at, 0, 0.06 * s, 0), col("#6a5a2a"));
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 1.3 - 0.65 * Math.PI, ring = i % 2;
    bins.fruit.add(g, T(at, Math.sin(a) * 0.05 * s, 0, Math.cos(a) * 0.05 * s, a, -0.6 - ring * 0.2, 0, s * (0.95 + rng() * 0.1)), col("#f2c93a", 0.92 + rng() * 0.12));
  }
}
let fingerG: THREE.BufferGeometry | null = null;
/** one banana finger: curved tapered tube, stem at the origin, curving out along +z and up (+y) */
function bananaFinger(): THREE.BufferGeometry {
  if (fingerG) return fingerG;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(0, -0.05 * t + 0.1 * t * t, 0.2 * t)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.022, 7, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), t = Math.min(1, Math.max(0, z / 0.2)); const k = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.5; const c = new THREE.CatmullRomCurve3(pts).getPoint(t); p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, z); }
  g.computeVertexNormals();
  // green tip + dark blossom end via vertex colours
  const cc = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const t = p.getZ(i) / 0.2; const c = t < 0.12 ? new THREE.Color("#7a8a3a") : t > 0.96 ? new THREE.Color("#4a3a22") : new THREE.Color(1, 1, 1); cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(cc, 3));
  fingerG = g;
  return g;
}

// ================================================================================================ umbrellas, loungers
/** striped umbrella canopy: gently domed, `panels` coral/cream gores (stripe atlas row), sagging between ribs */
function canopyGeo(r: number, rise: number, panels: number, row: number): THREE.BufferGeometry {
  const seg = panels * 4, rings = 6, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU, gore = Math.abs(Math.sin(a * panels / 2)); // 0 at ribs
      const rr = r * t * (1 - 0.035 * gore * t), y = rise * (1 - t ** 1.6) - 0.05 * gore * t;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      uv.push(i / seg * panels / 8, (row + 0.15 + 0.7 * (1 - t)) / 6);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export function addUmbrella(bins: TownBins, at: Mat, row: number, tilt = 0, r = 1.7, h = 2.55, rng: Rng = Math.random) {
  bins.woodDark.add(cylGeo(0.035, 0.045, h, 8), T(at, 0, h / 2, 0), col("#6a4a2c"));
  const top = T(at, 0, h, 0, rng() * TAU, tilt);
  const panels = 10;
  bins.stripes.add(canopyGeo(r, 0.5, panels, row), T(top, 0, -0.3, 0), 0xffffff);
  // scalloped valance round the rim (10 short straight pieces)
  for (let i = 0; i < panels; i++) {
    const a0 = i / panels * TAU, a1 = (i + 1) / panels * TAU, am = (a0 + a1) / 2, w = 2 * r * Math.sin(Math.PI / panels);
    bins.stripes.add(stripeValance(w, 0.16, row), T(top, Math.cos(am) * r * 0.975, -0.38, Math.sin(am) * r * 0.975, -am + Math.PI / 2), 0xffffff);
  }
  // ribs under the canopy + stretchers
  for (let i = 0; i < panels; i++) {
    const a = i / panels * TAU;
    const p = [new THREE.Vector3(0, 0.18, 0), new THREE.Vector3(Math.cos(a) * r * 0.5, 0.06, Math.sin(a) * r * 0.5), new THREE.Vector3(Math.cos(a) * r * 0.98, -0.32, Math.sin(a) * r * 0.98)];
    bins.woodDark.add(tubeGeo(p, 0.012, 4, false, 6), T(top, 0, -0.3, 0), col("#5a3f26"));
  }
  bins.metal.add(latheGeo([[0, 0.28], [0.05, 0.26], [0.04, 0.16], [0, 0.14]], 8), T(top, 0, -0.1, 0), col("#c9a24a"));
  // weighted base: round cream stone
  bins.stone.add(latheGeo([[0, 0], [0.34, 0], [0.36, 0.05], [0.25, 0.12], [0.08, 0.16], [0, 0.16]], 14), at, col("#d8ccb0"));
}
/** slatted wooden lounger with a raised back rest (back at local −z) + cream cushions */
export function addLounger(bins: TownBins, at: Mat, rng: Rng, cushion = ["#ecd9b8", "#e98a6e", "#7fc8c0", "#f2c88a"][Math.floor(rng() * 4)]) {
  const w = 0.72, wood = col("#a9773f", 0.9 + rng() * 0.2), dark = col("#6e4f30");
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) bins.wood.add(chamferBoxGeo(0.07, 0.1, 2.0, 0.015), T(at, x, 0.3, 0), dark);
  for (let i = 0; i < 9; i++) bins.wood.add(chamferBoxGeo(w, 0.03, 0.12, 0.01), T(at, 0, 0.36, 0.95 - 0.02 - i * 0.16), wood);
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [-0.85, 0.85]) bins.woodDark.add(chamferBoxGeo(0.06, 0.3, 0.06, 0.012), T(at, x, 0.15, z), dark);
  // back rest (hinged at z −0.25, raised ~45°)
  const back = T(at, 0, 0.38, -0.3, 0, -0.78);
  for (let i = 0; i < 5; i++) bins.wood.add(chamferBoxGeo(w - 0.04, 0.03, 0.12, 0.01), T(back, 0, 0, -0.08 - i * 0.14), wood);
  bins.wood.add(chamferBoxGeo(0.05, 0.04, 0.8, 0.01), T(back, 0, -0.04, -0.4), dark);
  // cushions (puffy)
  bins.fabric.add(chamferBoxGeo(w - 0.08, 0.09, 1.25, 0.04), T(at, 0, 0.42, 0.34), col(cushion));
  bins.fabric.add(chamferBoxGeo(w - 0.08, 0.08, 0.72, 0.035), T(back, 0, 0.05, -0.38), col(cushion, 0.97));
  bins.fabric.add(chamferBoxGeo(0.44, 0.1, 0.22, 0.05), T(back, 0, 0.1, -0.66), col("#f7f1e2"));
}
export function addTowel(bins: TownBins, at: Mat, rng: Rng) {
  const c = ["#3a86c8", "#e8722a", "#2fb3a8", "#f1c232", "#d9483b"][Math.floor(rng() * 5)];
  const g = new THREE.PlaneGeometry(0.55, 1.1, 3, 6); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, 0.012 * Math.sin(p.getX(i) * 9 + p.getZ(i) * 5));
  g.computeVertexNormals();
  bins.fabric.add(g, T(at, 0.02, 0.475, 0.3, (rng() - 0.5) * 0.3), col(c), (x, y, z, b, o) => { if (Math.sin((x + z) * 14) > 0.6) o.lerp(new THREE.Color("#f7f1e2"), 0.8); });
}
export function addSideTable(bins: TownBins, at: Mat, rng: Rng) {
  bins.wood.add(latheGeo([[0, 0.5], [0.26, 0.5], [0.28, 0.53], [0.26, 0.55], [0, 0.55]], 16), at, col("#b98b58"));
  bins.woodDark.add(cylGeo(0.03, 0.05, 0.5, 8), T(at, 0, 0.25, 0), col("#5a3f26"));
  bins.woodDark.add(latheGeo([[0, 0], [0.2, 0], [0.18, 0.04], [0, 0.05]], 12), at, col("#5a3f26"));
  // a drink with a straw + a coconut
  bins.glass.add(cylGeo(0.035, 0.03, 0.12, 8), T(at, 0.08, 0.61, 0.02), col("#f2a24a"));
  bins.plastic.add(new THREE.SphereGeometry(0.075, 10, 8), T(at, -0.1, 0.62, -0.04), col("#6a4a2a"));
  void rng;
}
/** a fallen, half-dried palm frond lying on the ground */
export function addFallenFrond(bins: TownBins, at: Mat, rng: Rng, len = 2.6) {
  const n = 12;
  const rachis: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; rachis.push(new THREE.Vector3(Math.sin(t * 2.2) * 0.25, 0.05 + 0.08 * Math.sin(t * Math.PI), t * len)); }
  bins.woodDark.add(tubeGeo(rachis, 0.025, 5, false, 16), at, col("#8a6a3a"));
  const dry = col("#b89a52"), green = col("#6f8a3a");
  for (let i = 1; i < n; i++) {
    const p = rachis[i], t = i / n;
    for (const s of [-1, 1]) {
      const l = (0.55 + 0.35 * Math.sin(t * Math.PI)) * (0.8 + rng() * 0.4);
      const g = new THREE.PlaneGeometry(0.08, l, 1, 2); g.translate(0, l / 2, 0); g.rotateX(-Math.PI / 2);
      bins.leaf.add(g, T(at, p.x, p.y - 0.01, p.z, s * (1.1 + rng() * 0.3), 0, 0), (rng() < 0.6 ? dry : green).clone().multiplyScalar(0.85 + rng() * 0.2));
    }
  }
}

// ================================================================================================ pool materials
let poolTile: THREE.MeshStandardMaterial | null = null;
const causticT = { value: 0 };
/** pool basin: pale aqua 10 cm mosaic tiles with a darker band + animated caustic light (emissive, world-space) */
export function poolTileMaterial(): THREE.MeshStandardMaterial {
  if (poolTile) return poolTile;
  const n = 256, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, tx = x % 16, ty = y % 16, grout = tx < 1 || ty < 1;
    const h = Math.sin(Math.floor(x / 16) * 12.9898 + Math.floor(y / 16) * 78.233) * 43758.5453, r = h - Math.floor(h);
    const k = grout ? 0.85 : 0.9 + 0.1 * r, blue = r > 0.93; // a few darker blue accent tiles
    data[i] = (blue ? 40 : 84) * k; data[i + 1] = (blue ? 150 : 204) * k; data[i + 2] = (blue ? 205 : 222) * k; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 1.6, 1 / 1.6);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.35, metalness: 0, name: "town:pool-tile" });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCausT = causticT;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vTownW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvTownW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vTownW; uniform float uCausT;
float townCaustic(vec2 p, float t) {
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) { float tt = t * (1.0 - (3.5 / float(n + 1))); i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten))); }
  c /= 4.0; c = 1.17 - pow(c, 1.4); return pow(abs(c), 8.0);
}`).replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
{ float cz = townCaustic(mod(vTownW.xz * 1.1, 6.2831853 * 4.0), uCausT * 0.6); totalEmissiveRadiance += vec3(0.85, 1.0, 1.0) * clamp(cz, 0.0, 1.6) * 2.6 * diffuseColor.rgb; }`);
  };
  m.customProgramCacheKey = () => "town-pool-tile";
  poolTile = m;
  return m;
}
/** call every frame (animates the caustics) */
export function tickPool(t: number) { causticT.value = t; }
