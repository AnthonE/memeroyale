// THE WRECK — the broken BANANA CO. freighter: two hull sections built in their SECTION FRAME (shared/pois/the-wreck.ts:
// local x from the intact end to the break, y up from the keel, z across) and placed by the section transform, so the
// visuals and the colliders come from the same hull function. Per section:
//   • lofted rust shell (half-breadth(x, y)) ending in a RAGGED tear at the break (plates torn back 0–3 m), a few
//     plates bent outward, the inside of the shell dark (you look into the hold)
//   • exposed frames (ribs) + broken deck beams + a torn tween deck + dangling plates + hanging cables at the break
//   • main deck plating with hatch coamings (one hatch broken open into the hold), bent / missing railings
//   • white superstructure (levels with the window facade texture, bridge wings, rails, roof clutter), a tall yellow
//     funnel with a black top, a yellow mast with yards + crow's nest + stays
//   • BANANA CO. letters on the bow half's beach-side flank
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { WorldCtx } from "../../../engine/engine";
import { paint, type HarborMats } from "../_kit/harbor-materials";
import type { ContainerKit } from "../_kit/containers";
import { Builder, hash, trs, type V3, mergeCasters } from "../_kit/harbor-geo";
import { drawPieces, roomMats } from "../_kit/harbor-rooms";
import { BOW, BOW_CORE_X, BREAK_DEBRIS, HOLD_STAIR, RAMPS, SECTIONS, TORN_DOOR, TORN_ROOM, debrisFrame, extStairPieces, extStairRoofGap, underExtStair, holdStairPieces, houseInteriorPieces, inHouse, levelBox, levelStairPiece, ventX2, breakX, deckY, endX, halfBreadth, STERN_GEAR, houseHoles, houseTorn, hullRows, rampSteps, wreckWing, houseLevel, houseStair, sectionToWorld as sectionToWorldV, type HullSection } from "../../../../../shared/pois/the-wreck";
import { wreckMats, type WreckMats } from "./wreck-mats";
import type { HarborLod } from "../peel-harbor/lod";

export interface WreckCtx { ctx: WorldCtx; mats: HarborMats; kit: ContainerKit; group: THREE.Group; lod?: HarborLod }

/** the section transform as a matrix (same composition as sectionToWorld) */
export function sectionMatrix(s: HullSection): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.roll, s.yaw, s.pitch, "YZX"));
  return new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(1, 1, 1));
}

type Tri = number[];
/** push a quad (a b c d, CCW seen from outside) with metre UVs (u along x, v along the girth) */
function quad(pos: Tri, uv: Tri, a: V3, b: V3, c: V3, d: V3, ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number], flip: boolean) {
  const vs = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
  const us = flip ? [ua, uc, ub, ua, ud, uc] : [ua, ub, uc, ua, uc, ud];
  for (let k = 0; k < 6; k++) { pos.push(...vs[k]); uv.push(...us[k]); }
}
function geo(pos: Tri, uv: Tri, smooth = false): THREE.BufferGeometry {
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (smooth) {
    // shared vertices → smooth normals across the buckled plating (flat per-triangle normals made every dished quad a
    // pair of differently lit triangles: a herringbone "planked" hull)
    g = mergeVertices(g, 1e-3);
    g.computeVertexNormals();
    return g.toNonIndexed();
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------ torn plating
/**
 * A torn steel strip (never rectangular cardboard tabs): `len` along +X from its root (x = 0), width w
 * across z, curling about z by `curl` rad over its length (a peeled-back plate), twisting by `twist` rad, the free end
 * a jagged saw-tooth that also nibbles the side edges; both faces (offset by the plate thickness) with metre UVs.
 */
export function tornStrip(len: number, w: number, curl: number, twist: number, seed: number, t = 0.07, uvSwap = false): THREE.BufferGeometry {
  // (a minimum steel thickness + closed edges — 4–5 cm two-sided strips read as paper flags)
  t = Math.max(t, 0.07);
  const nu = 7, nv = 4, pos: number[] = [], uv: number[] = [];
  // jagged free end: each across-sample stops at its own length (saw teeth), side edges nibbled
  const endAt = (j: number) => len * (0.62 + 0.38 * hash(seed, j, 3) ** 0.7);
  const P = (i: number, j: number, face: number): V3 => {
    const vj = j / nv, uLen = endAt(j) * (i / nu);
    // centre line: integrate the curl (bend about z) — the strip peels away from its root
    let x = 0, y = 0, a = 0;
    const steps = 6;
    for (let k = 0; k < steps; k++) { const du = uLen / steps; a = curl * ((k + 0.5) / steps) * (uLen / len) ** 1.3; x += Math.cos(a) * du; y += Math.sin(a) * du; }
    const nib = (vj === 0 || vj === 1) ? (hash(seed, i, j) - 0.5) * 0.18 * w * (i / nu) : 0;
    const zz = (vj - 0.5) * w * (1 - 0.35 * (i / nu) * hash(seed, j, 7)) + nib;
    // twist about the centre line: z rotates into y
    const tw = twist * (i / nu), cz = Math.cos(tw), sz = Math.sin(tw);
    const nx = -Math.sin(a), ny = Math.cos(a);     // the strip's normal in the bend plane
    const off = face * t * 0.5;
    return [x + nx * (zz * sz + off), y + ny * (zz * sz + off), zz * cz];
  };
  for (const face of [1, -1]) for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = P(i, j, face), b = P(i + 1, j, face), c = P(i + 1, j + 1, face), d = P(i, j + 1, face);
    // (uvSwap: the plating's seams run ALONG the strip — a long plate on a slope with cross seams read as ladder rungs)
    const U = (p: V3): [number, number] => (uvSwap ? [p[2] + seed * 0.37, p[0]] : [p[0], p[2]]);
    const ua = U(a), ub = U(b), uc = U(c), ud = U(d);
    // (u × v points to −n: the +n face flips its winding so both faces look outward)
    quad(pos, uv, a, b, c, d, ua, ub, uc, ud, face > 0);
  }
  // the torn edges: the jagged free end + both nibbled sides, closed between the two faces (thickness shows)
  const edge = (p0: [number, number], p1: [number, number], flip: boolean) => {
    const a = P(p0[0], p0[1], 1), b = P(p1[0], p1[1], 1), c = P(p1[0], p1[1], -1), d = P(p0[0], p0[1], -1), L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    quad(pos, uv, a, b, c, d, [0, 0], [L, 0], [L, t], [0, t], flip);
  };
  for (let j = 0; j < nv; j++) edge([nu, j], [nu, j + 1], true);
  for (let i = 0; i < nu; i++) { edge([i, 0], [i + 1, 0], false); edge([i, nv], [i + 1, nv], true); }
  return geo(pos, uv);
}
/** a torn-off cable BUNDLE along a sagging path (3 sheathed cables twisted round each other —
 *  black, grey, a faded orange one — with frayed copper tips), not a single black line */
function cableBundle(b: Builder, M: WreckMats, pts: V3[], r = 0.04, seed = 0) {
  const n = 18, curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.5);
  const frames = curve.computeFrenetFrames(n, false), cols: THREE.Material[] = [M.black, M.steel, cableOrange()];
  for (let c = 0; c < 3; c++) {
    const ps: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPointAt(t), a = c * 2.094 + t * 7 + seed, off = r * 1.15 * (i === n ? 1.6 : 1);
      const N = frames.normals[i], B = frames.binormals[i];
      ps.push([p.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * off, p.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * off, p.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * off]);
    }
    b.tube(cols[c], ps, r * (c === 2 ? 0.8 : 1), 7, { samples: n * 2, tension: 0.5 });
    const e = ps[ps.length - 1], d = [e[0] - ps[ps.length - 2][0], e[1] - ps[ps.length - 2][1], e[2] - ps[ps.length - 2][2]], dl = Math.hypot(d[0], d[1], d[2]) || 1;
    for (let k = 0; k < 3; k++) b.cyl(copper(), e, [e[0] + (d[0] / dl) * 0.09 + (hash(seed, c, k) - 0.5) * 0.05, e[1] + (d[1] / dl) * 0.09 + (hash(c, k, seed) - 0.5) * 0.05, e[2] + (d[2] / dl) * 0.09], 0.006, 3, { caps: false });
  }
}
let orangeM: THREE.MeshStandardMaterial | null = null, copperM: THREE.MeshStandardMaterial | null = null;
const cableOrange = () => (orangeM ??= new THREE.MeshStandardMaterial({ color: "#b8642a", roughness: 0.75, metalness: 0, name: "wreck-cable-orange" }));
const copper = () => (copperM ??= new THREE.MeshStandardMaterial({ color: "#c27a3a", roughness: 0.35, metalness: 0.9, name: "wreck-copper" }));

// ------------------------------------------------------------------------------------------------ shell
/** plating sag between the frames (every 2 m) and the longitudinals (every ~1.55 m) + a few impact dents — inward
 *  metres, ≤ 0.28 (the colliders sit on the unbuckled surface: within the hit-reg tolerance) */
function buckle(s: HullSection, x: number, y: number): number {
  if (y > s.depth - 0.7 || y < 0.6) return 0;
  const f = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / 2.0), g = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / 1.55);
  let d = 0.075 * f * (0.45 + 0.55 * g);
  for (let k = 0; k < 7; k++) {
    const cx = 6 + hash(s.x, k, 1) * (s.length - 12), cy = 2 + hash(s.x, k, 2) * (s.depth - 5), r = 1.2 + hash(s.x, k, 3) * 2.2;
    const q = ((x - cx) / r) ** 2 + ((y - cy) / (r * 0.7)) ** 2;
    if (q < 1) d += (0.12 + 0.1 * hash(s.x, k, 4)) * (1 - q) ** 2;
  }
  // low-frequency dents (big soft pushes from the reef and the other half) + buckled FOLDS running diagonally away
  // from the break — the hull reads crumpled, not a clean rust box (still ≤ 0.3 m: the colliders sit on the fair shell)
  // the stern takes 7 deeper dents + a long horizontal crease where
  // the side buckled when it broke
  const nd = s.id === "stern" ? 7 : 4, dd = s.id === "stern" ? 0.24 : 0.16;
  for (let k = 0; k < nd; k++) {
    const cx = s.length * (0.2 + 0.75 * hash(s.y, k, 11)), cy = s.depth * (0.25 + 0.5 * hash(s.y, k, 12)), r = 3 + hash(s.y, k, 13) * 5;
    const q = ((x - cx) / r) ** 2 + ((y - cy) / (r * 0.6)) ** 2;
    if (q < 1) d += dd * (1 - q) ** 1.5;
  }
  if (s.id === "stern") {
    // the crease: a V along ~60 % of the depth from the break back to x 18, wandering, with a raised lip above it
    const yc = s.depth * 0.62 + Math.sin(x * 0.21) * 0.9 + Math.sin(x * 0.53 + 1.3) * 0.35, fade = Math.max(0, Math.min(1, (x - 16) / 10));
    const dl = (y - yc) / 0.6;
    d += fade * (0.2 * Math.exp(-dl * dl) - 0.06 * Math.exp(-((dl + 1.5) ** 2)));
  }
  const nearBreak = Math.max(0, 1 - (s.length - x) / 16);
  if (nearBreak > 0) for (let k = 0; k < 3; k++) {
    // fold line: from the break at height y0 running back-down at ~30°; a V crease with a raised lip beside it
    const y0 = s.depth * (0.3 + 0.25 * k) + hash(s.x, k, 21) * 2, slope = 0.45 + hash(s.x, k, 22) * 0.4;
    const dl = (y - (y0 - (s.length - x) * slope)) / 0.7;
    if (Math.abs(dl) < 2.2) d += nearBreak * (0.2 * Math.exp(-(dl * dl)) - 0.07 * Math.exp(-((dl - 1.4) ** 2)));
  }
  // (≤ 0.18 m — deeper dents plus the fit tolerance open 0.30–0.34 m gaps between the drawn shell and its collider)
  return Math.max(-0.08, Math.min(0.18, d));
}
/** how far the shell's top edge (the sheer) is crumpled down below the deck at
 *  local x — sagging into the break over its last 14 m + two buckled notches along the length. The deck plating stays
 *  at deckY, so the notch shows the torn plate edge + the dark hold under it. (≤ 0.75 m: the colliders keep the fair
 *  shell up to the deck; a notch this small is below the hit-reg tolerance a kong notices.) */
function sheerDip(s: HullSection, x: number, side: number): number {
  // the stern's sheer sags further into the break (over 22 m, up to 1.1 m) with four buckled notches;
  // the bow keeps the profile above
  const stern = s.id === "stern", reach = stern ? 22 : 14;
  const nb = Math.max(0, 1 - (s.length - x) / reach);
  let d = nb * nb * ((stern ? 1.0 : 0.6) + 0.15 * Math.sin(x * 2.3 + side * 1.7));
  for (let k = 0; k < (stern ? 4 : 2); k++) {
    const cx = s.length * ((stern ? 0.18 : 0.28) + (stern ? 0.19 : 0.3) * k) + (hash(s.x, k, side, 51) - 0.5) * 6, w = 2.2 + hash(s.x, k, side, 52) * 2;
    const q = (x - cx) / w;
    if (Math.abs(q) < 1) d += (stern ? 0.5 : 0.35) * (1 - q * q) ** 2 * (0.6 + 0.4 * hash(s.x, k, side, 53));
  }
  return Math.min(stern ? 1.1 : 0.75, d);
}
function shell(b: Builder, M: WreckMats, s: HullSection) {
  const pos: Tri = [], uv: Tri = [];
  const base = hullRows(s), rowsY: number[] = [];
  for (let i = 0; i < base.length - 1; i++) { const n = Math.max(1, Math.ceil((base[i + 1] - base[i]) / 0.5)); for (let k = 0; k < n; k++) rowsY.push(base[i] + ((base[i + 1] - base[i]) * k) / n); }
  rowsY.push(base[base.length - 1]);
  const N = 90;   // (perf: 90 segments — 0.6 m, still resolves the 2 m frame sag; the shell is drawn in 3 passes)
  // girth arc length per row (v) at a representative x
  const girth = (x: number, i: number) => { let g = 0; for (let k = 1; k <= i; k++) g += Math.hypot(rowsY[k] - rowsY[k - 1], halfBreadth(s, x, rowsY[k]) - halfBreadth(s, x, rowsY[k - 1])); return g; };
  const Z = (side: number, x: number, y: number) => { const h = halfBreadth(s, x, y); return side * (h > 0.6 ? h - buckle(s, x, y) : h); };
  // (the halves share the plating texture — offset the stern's so their plate grids never line up)
  const uo = s.id === "stern" ? 7.3 : 0, vo = s.id === "stern" ? 2.9 : 0;
  for (const side of [1, -1] as const) {
    for (let r = 0; r < rowsY.length - 1; r++) {
      const y0 = rowsY[r], y1 = rowsY[r + 1];
      const xs0 = endX(s, y0), xs1 = endX(s, y1), xe0 = breakX(s, y0, side), xe1 = breakX(s, y1, side);
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N;
        const xa0 = xs0 + (xe0 - xs0) * t0, xa1 = xs0 + (xe0 - xs0) * t1, xb0 = xs1 + (xe1 - xs1) * t0, xb1 = xs1 + (xe1 - xs1) * t1;
        const cap = (x: number, y: number) => Math.min(y, deckY(s, x) - sheerDip(s, x, side));
        const top = (x: number, y: number) => cap(x, r === rowsY.length - 2 ? deckY(s, x) : y);
        const ya0 = cap(xa0, y0), ya1 = cap(xa1, y0), yb1 = top(xb1, y1), yb0 = top(xb0, y1);
        const A: V3 = [xa0, ya0, Z(side, xa0, ya0)], B: V3 = [xa1, ya1, Z(side, xa1, ya1)];
        const Cc: V3 = [xb1, yb1, Z(side, xb1, yb1)], D: V3 = [xb0, yb0, Z(side, xb0, yb0)];
        const g0 = girth(20, r) + vo, g1 = girth(20, r + 1) + vo;
        quad(pos, uv, A, B, Cc, D, [xa0 + uo, g0], [xa1 + uo, g0], [xb1 + uo, g1], [xb0 + uo, g1], side < 0);
      }
    }
  }
  // stern transom / counter (flat-ish plate closing the stern end)
  if (s.id === "stern") {
    for (let r = 0; r < rowsY.length - 1; r++) {
      const y0 = rowsY[r], y1 = rowsY[r + 1], x0 = endX(s, y0), x1 = endX(s, y1);
      const h0 = halfBreadth(s, x0 + 1e-3, y0), h1 = halfBreadth(s, x1 + 1e-3, y1);
      quad(pos, uv, [x0, y0, -h0], [x0, y0, h0], [x1, y1, h1], [x1, y1, -h1], [-h0, y0], [h0, y0], [h1, y1], [-h1, y1], false);
    }
  }
  b.addRaw(M.hull, geo(pos, uv, true));
}

// ------------------------------------------------------------------------------------------------ deck
/** faded hatch-cover green, chipped + rust-streaked (harbor paint kit: textured, weathered) */
const hatchGreen = () => paint("#4f6a45", { rough: 0.7, grime: 0.55, name: "wreck-hatch-green" });
function deck(b: Builder, M: WreckMats, m: HarborMats, s: HullSection) {
  const pos: Tri = [], uv: Tri = [];
  const x0 = endX(s, s.depth), x1 = s.length - 2.2, n = 60;
  const hatchX = s.openHatch;
  for (let i = 0; i < n; i++) {
    const xa = x0 + (x1 - x0) * (i / n), xb = x0 + (x1 - x0) * ((i + 1) / n);
    const ya = deckY(s, xa), yb = deckY(s, xb), ha = halfBreadth(s, xa, ya) - 0.05, hb = halfBreadth(s, xb, yb) - 0.05;
    const inHatch = (xa + xb) / 2 > hatchX[0] && (xa + xb) / 2 < hatchX[1];
    // the torn end: the last strips get a ragged outline across the beam
    const cutA = i === n - 1 ? (hash(s.x, 1) - 0.5) * 3 : 0;
    // each band: [z at xa, z at xb] for its two long edges (outer edges follow the hull, hatch edges are straight)
    const bands: Array<[[number, number], [number, number]]> = inHatch ? [[[-ha, -hb], [-4, -4]], [[4, 4], [ha, hb]]] : [[[-ha, -hb], [ha, hb]]];
    for (const [[zaA, zaB], [zbA, zbB]] of bands) {
      const A: V3 = [xa, ya, zaA], B: V3 = [xb + cutA, yb, zaB], Cc: V3 = [xb, yb, zbB], D: V3 = [xa, ya, zbA];
      quad(pos, uv, A, B, Cc, D, [xa, zaA], [xb, zaB], [xb, zbB], [xa, zbA], true);
    }
  }
  b.addRaw(M.deck, geo(pos, uv));
  // hatch coamings (3 hatches; the one over the open hold is broken — covers fallen in)
  const hatches = s.hatches;
  for (const [ha, hb2] of hatches) {
    const y = deckY(s, (ha + hb2) / 2);
    const open = ha === hatchX[0];
    for (const z of [-4.1, 4.1]) {
      if (open && s.id === "stern" && z < 0) {
        // (a gap in the coaming where the hold stair tops out)
        const g0 = HOLD_STAIR.x0 - 0.2, g1 = HOLD_STAIR.x0 + 1.35;
        b.box(M.deck, [(ha - 0.15 + g0) / 2, y + 0.45, z], [g0 - ha + 0.15, 0.9, 0.22], { bevel: 0.04 });
        b.box(M.deck, [(g1 + hb2 + 0.15) / 2, y + 0.45, z], [hb2 + 0.15 - g1, 0.9, 0.22], { bevel: 0.04 });
        continue;
      }
      b.box(M.deck, [(ha + hb2) / 2, y + 0.45, z], [hb2 - ha + 0.3, 0.9, 0.22], { bevel: 0.04 });
    }
    for (const x of [ha, hb2]) b.box(M.deck, [x, y + 0.45, 0], [0.22, 0.9, 8.4], { bevel: 0.04 });
    void 0;
    if (!open) {
      for (let k = 0; k < 3; k++) b.box(hatchGreen(), [ha + (hb2 - ha) * (k + 0.5) / 3, y + 0.98, 0], [(hb2 - ha) / 3 - 0.08, 0.16, 8.1], { bevel: 0.03, rotZ: (hash(ha, k) - 0.5) * 0.05 });
    } else {
      // two covers collapsed into the hole at steep angles, one still hanging on
      b.box(hatchGreen(), [ha + 1.4, y - 1.4, -1.8], [2.4, 0.16, 4.2], { bevel: 0.03, rotZ: 0.9, rotX: 0.2 });
      b.box(hatchGreen(), [hb2 - 1.6, y - 2.2, 1.6], [2.2, 0.16, 4.0], { bevel: 0.03, rotZ: -1.1, rotX: -0.3 });
      b.box(hatchGreen(), [hb2 - 0.5, y + 0.5, -2.4], [2.0, 0.16, 3.6], { bevel: 0.03, rotZ: -0.5 });
    }
  }
  // winches / bollards / vents along the deck
  for (let x = 6; x < s.length - 8; x += 9.5) for (const side of [-1, 1]) {
    if (underExtStair(s, x, side)) continue;
    const y = deckY(s, x), hb = halfBreadth(s, x, y);
    b.cyl(M.steel, [x, y, side * (hb - 1.0)], [x, y + 0.7, side * (hb - 1.0)], 0.28, 10);
    b.cyl(M.steel, [x + 0.7, y, side * (hb - 1.0)], [x + 0.7, y + 0.7, side * (hb - 1.0)], 0.28, 10);
  }

}

/** bent, gappy railings along both deck edges (+ across the stern's transom) */
function railings(b: Builder, M: WreckMats, s: HullSection) {
  if (s.id === "stern") {
    const x = endX(s, s.depth) + 0.15, y = deckY(s, x), hb = halfBreadth(s, x + 0.2, y) - 0.2;
    let prev: V3 | null = null;
    for (let z = -hb; z <= hb + 0.01; z += 1.5) {
      const h = hash(s.x, z, 7);
      if (h < 0.1) { prev = null; continue; }
      const top: V3 = [x - (h > 0.88 ? 0.4 : 0), y + 1.05 - (h > 0.88 ? 0.3 : 0), z];
      b.cyl(M.steel, [x, y, z], top, 0.03, 5, { caps: false });
      if (prev) { b.cyl(M.steel, prev, top, 0.028, 5, { caps: false }); b.cyl(M.steel, [prev[0], prev[1] - 0.5, prev[2]], [top[0], top[1] - 0.5, top[2]], 0.022, 4, { caps: false }); }
      prev = top;
    }
  }
  for (const side of [1, -1]) {
    let prev: V3 | null = null;
    for (let x = endX(s, s.depth) + 1; x < s.length - 3; x += 1.5) {
      const h = hash(s.x, side, x);
      const y = deckY(s, x), z = side * (halfBreadth(s, x, y) - 0.12);
      if (h < 0.12) { prev = null; continue; }                       // missing section
      const bend = h > 0.86 ? (h - 0.86) * 9 : 0;                    // a few crumpled posts
      const top: V3 = [x + bend * 0.3, y + 1.05 - bend * 0.35, z + side * bend * 0.5];
      b.cyl(M.steel, [x, y, z], top, 0.03, 5, { caps: false });
      if (prev) { b.cyl(M.steel, prev, top, 0.028, 5, { caps: false }); b.cyl(M.steel, [prev[0], prev[1] - 0.5, prev[2]], [top[0], top[1] - 0.5, top[2]], 0.022, 4, { caps: false }); }
      prev = top;
    }
  }
}

// ------------------------------------------------------------------------------------------------ the break
function breakDetail(b: Builder, M: WreckMats, s: HullSection) {
  const L = s.length;
  // frames (ribs) following the hull section inward, sticking out of the torn shell
  for (const fx of [L - 5.2, L - 3.6, L - 2.0, L - 0.6]) {
    for (const side of [1, -1]) {
      const pts: V3[] = [];
      for (let y = 0.3; y <= s.depth - 0.2; y += 0.9) pts.push([fx, y, side * (halfBreadth(s, fx, y) - 0.28)]);
      const cut = Math.floor(hash(fx, side, s.x) * pts.length * 0.5);
      b.rail(M.steel, pts.slice(0, pts.length - cut), 0.1, 4);
    }
    // deck beam: broken off somewhere across
    const y = s.depth - 0.35, hb = halfBreadth(s, fx, y) - 0.3, brk = -hb + (0.35 + hash(fx, s.y) * 0.6) * 2 * hb;
    b.beam(M.steel, [fx, y, -hb], [fx, y - (hash(fx) - 0.5) * 0.6, brk], 0.18, 0.35);
    if (hash(fx, 3) > 0.4) b.beam(M.steel, [fx, y, hb], [fx + 0.4, y - 1.2 * hash(fx, 5), brk + 1.2], 0.18, 0.35);
  }
  // tween deck: a floor inside at 6.3 m, torn at the break, dark underneath
  const tw = s.depth * 0.57;
  for (let x = L - 14; x < L - 1.5; x += 1.2) {
    const hb = halfBreadth(s, x, tw) - 0.3, torn = x > L - 4 ? hash(x, s.x) * 3 : 0;
    b.box(M.deck, [x + 0.6, tw, 0], [1.2, 0.2, 2 * hb - torn], { rotZ: x > L - 4 ? (hash(x, 9) - 0.5) * 0.3 : 0 });
  }
  // dangling plates hanging from the deck edge at the tear + the shell's torn edge peeled back in curled, saw-toothed
  // strips all the way down both sides
  for (let k = 0; k < 7; k++) {
    const z = (hash(k, s.x) - 0.5) * 12, x = L - 1.6 + hash(k, 2) * 1.2, len = 2.2 + hash(k, 4) * 2.2;
    const m = new THREE.Matrix4().makeTranslation(x, s.depth - 0.2, z).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + (hash(k, 6) - 0.5) * 0.6)).multiply(new THREE.Matrix4().makeRotationX((hash(k, 7) - 0.5) * 0.5));
    b.add(M.hull, tornStrip(len, 1.0 + hash(k, 5) * 0.9, 0.5 + hash(k, 8) * 0.8, (hash(k, 9) - 0.5) * 0.8, s.x + k), m, false);
  }
  for (const side of [1, -1]) for (let y = 0.8; y < s.depth - 0.8; y += 1.3 + hash(side, y, s.x) * 0.9) {
    const x = breakX(s, y, side) - 0.15, hb = halfBreadth(s, x, y);
    if (hb < 1) continue;
    const len = 0.9 + hash(y, side, 1) * 1.8, out = 0.5 + hash(y, side, 2) * 0.9;
    // root on the shell's torn edge, peeling outward (+z side → +z) and back toward the break (+x)
    const m = new THREE.Matrix4().makeTranslation(x, y, side * (hb - 0.05)).multiply(new THREE.Matrix4().makeRotationY(side * -out)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationZ((hash(y, side, 3) - 0.5) * 0.7));
    b.add(M.hull, tornStrip(len, 0.8 + hash(y, side, 4) * 0.9, side * (0.7 + hash(y, side, 5) * 1.2), (hash(y, side, 6) - 0.5) * 0.6, s.x * 3 + y * 7 + side), m, false);
  }
  for (let k = 0; k < 5; k++) {
    const z = (hash(k, 21) - 0.5) * 10, y = s.depth - 0.5 - hash(k, 22) * 3;
    b.box(M.steel, [L + 0.6, y, z], [3.2 + hash(k, 23) * 2, 0.14, 0.3], { rotZ: (hash(k, 24) - 0.6) * 0.8, rotY: (hash(k, 25) - 0.5) * 0.6 });
  }
  // hanging cables from the torn deck
  for (let k = 0; k < 4; k++) {
    const z = (hash(k, 31) - 0.5) * 12, x = L - 1.8;
    const a: V3 = [x, s.depth - 0.2, z], c: V3 = [x + 1.5 + hash(k, 32) * 2, s.depth - 5 - hash(k, 33) * 3, z + (hash(k, 34) - 0.5) * 3];
    cableBundle(b, M, [a, [(a[0] + c[0]) / 2 + 0.6, (a[1] + c[1]) / 2 - 0.8, (a[2] + c[2]) / 2], c], 0.045, k);
  }
}

// ------------------------------------------------------------------------------------------------ superstructure
/** one deck level of the house: facade walls (UV v = height within the level so the window row lines up). `openEnd`:
 *  the +x wall is gone (a torn house end) and the side walls stop raggedly short of it. */
const LH = 3.1;
function level(b: Builder, M: WreckMats, x0: number, x1: number, y0: number, h: number, hw: number, openEnd = false, seed = 0, holes: { plus: Array<[number, number]>; minus: Array<[number, number]> } = { plus: [], minus: [] }) {
  const pos: Tri = [], uv: Tri = [];
  const xs = openEnd ? x1 - 0.4 - hash(seed, 1) * 1.4 : x1, xs2 = openEnd ? x1 - 0.4 - hash(seed, 2) * 1.4 : x1;
  /** [a, b] minus the holes */
  const cut = (a: number, c: number, hs: Array<[number, number]>) => {
    let segs: Array<[number, number]> = [[a, c]];
    for (const [h0, h1] of hs) segs = segs.flatMap(([p, q]) => (h1 <= p || h0 >= q ? [[p, q]] : [[p, Math.max(p, h0)], [Math.min(q, h1), q]]).filter(([u, v]) => v - u > 0.1) as Array<[number, number]>);
    return segs;
  };
  const faces: Array<[V3, V3, number, number]> = [];
  for (const [a, c] of cut(x0, xs, holes.plus)) faces.push([[a, y0, hw], [c, y0, hw], c - a, a - x0]);
  for (const [a, c] of cut(x0, xs2, holes.minus)) faces.push([[c, y0, -hw], [a, y0, -hw], c - a, xs2 - c]);
  faces.push([[x0, y0, -hw], [x0, y0, hw], 2 * hw, 0]);
  if (!openEnd) faces.push([[x1, y0, hw], [x1, y0, -hw], 2 * hw, 0]);
  for (const [a, c, len, u0] of faces) quad(pos, uv, a, c, [c[0], y0 + h, c[2]], [a[0], y0 + h, a[2]], [u0, 0], [u0 + len, 0], [u0 + len, h], [u0, h], false);
  b.addRaw(M.facade, geo(pos, uv));
  // (a thin trim at each deck line — 0.3 m ledges + rails on every level read as a parking garage)
  b.box(M.whiteTrim, [(x0 + x1) / 2 - (openEnd ? 0.6 : 0), y0 + h - 0.06, 0], [x1 - x0 + (openEnd ? -0.6 : 0.12), 0.12, 2 * hw + 0.12]);
  // gutted rooms behind the torn-out walls: dark back wall 2.4 m in, floor, ceiling, jambs, ragged plates, cables
  for (const [side, list] of [[1, holes.plus], [-1, holes.minus]] as Array<[number, Array<[number, number]>]>) for (const [h0, h1] of list) {
    // (the holes open into the rooms; wall-thickness jambs stay)
    for (const xe of [h0, h1]) b.box(M.inner, [xe, y0 + h / 2, side * (hw - 0.25)], [0.12, h, 0.5]);
    for (let k = 0; k < 4; k++) {
      const xe = k < 2 ? h0 : h1, dir = k < 2 ? 1 : -1, yy = y0 + 0.4 + hash(seed, xe, k) * (h - 1.2);
      const m = new THREE.Matrix4().makeTranslation(xe, yy, side * hw).multiply(new THREE.Matrix4().makeRotationY(dir > 0 ? side * -0.4 : Math.PI + side * 0.4)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      b.add(M.whiteTrim, tornStrip(0.7 + hash(xe, k) * 0.8, 0.6 + hash(k, seed) * 0.6, side * dir * (0.8 + hash(seed, k) * 0.9), (hash(k, xe) - 0.5) * 0.7, seed * 13 + k + xe, 0.08), m, false);
    }
    { const m = new THREE.Matrix4().makeTranslation(h0 + 0.2, y0 + h - 0.1, side * hw).multiply(new THREE.Matrix4().makeRotationX(side > 0 ? -0.3 : 0.3)).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + 0.1));
      b.add(M.whiteTrim, tornStrip(0.9 + hash(seed, h0) * 0.6, h1 - h0 - 0.6, 0.6, 0.2, seed * 17 + h0, 0.08), m.multiply(new THREE.Matrix4().makeTranslation(0, 0, (h1 - h0) / 2 - 0.3)), false); }
    for (let k = 0; k < 2; k++) { const xx = h0 + (h1 - h0) * (0.3 + k * 0.4), zz = side * (hw - 0.4); cableBundle(b, M, [[xx, y0 + h - 0.1, zz], [xx + 0.2, y0 + h - 0.9, zz], [xx + 0.3, y0 + h - 1.8 - hash(k, seed) * 0.6, zz + side * 0.1]], 0.03, seed + k); }

  }
  if (openEnd) {
    // torn wall plates bent outward where the side walls end, a jagged strip of facade left hanging
    for (const side of [1, -1]) {
      const xe = side > 0 ? xs : xs2;
      // (ONE heavy plate per wall end, 10 cm steel, peeled back from a bent frame
      // stiffener — three thin strips stacked up the edge read as paper)
      const k = 1, ph = (h - 0.6) * 0.62;
      const m = new THREE.Matrix4().makeTranslation(xe - 0.05, y0 + 0.3 + (h - 0.6 - ph) * hash(seed, side, 2), side * hw).multiply(new THREE.Matrix4().makeRotationY(side * -(0.3 + hash(seed, k, 3) * 0.5))).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      b.add(M.whiteTrim, tornStrip(0.8 + hash(seed, k, 7) * 0.9, ph, side * (0.5 + hash(seed, k, 4) * 0.7), (hash(seed, k, 5) - 0.5) * 0.4, seed * 19 + k * 3 + side, 0.1), m, false);
      b.beam(M.steel, [xe - 0.08, y0 + 0.1, side * (hw - 0.12)], [xe + 0.25, y0 + h - 0.4, side * (hw + 0.35 + hash(seed, side) * 0.4)], 0.12, 0.08);
    }
  }
}

/** the debris cascade at a break (BREAK_DEBRIS — the same slabs the colliders fit): deck plating on top (hull plating
 *  for the shell plates), frames + a girder under it, torn curled lips on its free end + sides, hanging cables */
function breakDebris(b: Builder, M: WreckMats, s: HullSection, hm?: HarborMats) {
  BREAK_DEBRIS.filter((d) => d.s === s.id).forEach((d, di) => {
    const f = debrisFrame(d), [U, V, W] = f.A;
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...U), new THREE.Vector3(...V), new THREE.Vector3(...W)).setPosition(f.c[0], f.c[1], f.c[2]);
    b.box(d.deck ? M.deck : M.hull, [0, 0, 0], [d.len, d.t, d.w], { m });
    if (d.deck) {
      for (let x = -d.len / 2 + 0.7; x < d.len / 2 - 0.3; x += 1.4) b.box(M.steel, [x, -d.t / 2 - 0.22, 0], [0.12, 0.44, d.w * 0.92], { m });
      for (const z of [-d.w * 0.28, d.w * 0.22]) b.box(M.steel, [0, -d.t / 2 - 0.35, z], [d.len * 0.94, 0.6, 0.16], { m });
    } else for (let x = -d.len / 2 + 0.8; x < d.len / 2; x += 1.6) b.box(M.steel, [x, -d.t / 2 - 0.15, 0], [0.1, 0.3, d.w * 0.9], { m });
    // torn, curled lips: along the free end + both sides
    const lip = (x: number, z: number, ry: number, k: number) => {
      const lm = m.clone().multiply(new THREE.Matrix4().makeTranslation(x, d.t / 2, z)).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      b.add(d.deck ? M.deck : M.hull, tornStrip(0.8 + hash(di, k, 1) * 1.1, 1.0 + hash(di, k, 2) * 0.9, 0.8 + hash(di, k, 3) * 1.2, (hash(di, k, 4) - 0.5) * 0.7, s.x + di * 31 + k), lm, false);
    };
    for (let k = 0; k < Math.round(d.w / 1.6); k++) lip(d.len / 2 - 0.1, -d.w / 2 + (k + 0.5) * (d.w / Math.round(d.w / 1.6)), 0, k);
    for (let k = 0; k < 2; k++) for (const side of [1, -1]) lip(-d.len / 4 + k * d.len / 2, side * (d.w / 2 - 0.1), side * -Math.PI / 2, 10 + k * 2 + (side > 0 ? 1 : 0));
    // cables + a pipe run torn out with it
    for (let k = 0; k < 2; k++) {
      const z = (hash(di, k, 7) - 0.5) * d.w * 0.7, a = new THREE.Vector3(-d.len / 2 + 0.4, -d.t, z).applyMatrix4(m), c = new THREE.Vector3(d.len * 0.2, -d.t - 1.8 - hash(di, k) * 1.5, z + 0.6).applyMatrix4(m);
      cableBundle(b, M, [[a.x, a.y, a.z], [(a.x + c.x) / 2, Math.min(a.y, c.y) - 0.8, (a.z + c.z) / 2], [c.x, c.y, c.z]], 0.042, di * 3 + k);
    }
    // the collapse is a waterfall of junk: every slab carries 2–4 hatch / dunnage PLANKS jutting past its edges at
    // odd angles, a snapped I-beam frame sticking out sideways, and (deck slabs) a toppled crate or two
    if (hm) {
      const np = d.deck ? 4 : 2;
      for (let k = 0; k < np; k++) {
        const len = 2.4 + hash(di, k, 61) * 2.4, along = d.len * (0.05 + 0.5 * hash(di, k, 62)), across = (hash(di, k, 63) - 0.5) * d.w * 0.9;
        const pm = m.clone().multiply(new THREE.Matrix4().makeTranslation(along, d.t / 2 + 0.06 + k * 0.05, across))
          .multiply(new THREE.Matrix4().makeRotationY((hash(di, k, 64) - 0.5) * 2.4)).multiply(new THREE.Matrix4().makeRotationZ((hash(di, k, 65) - 0.5) * 0.5));
        b.box(hm.wood, [0, 0, 0], [len, 0.07, 0.26 + hash(di, k, 66) * 0.12], { m: pm });
      }
      const bm = m.clone().multiply(new THREE.Matrix4().makeTranslation(d.len * 0.3, -d.t / 2 - 0.1, (hash(di, 67) < 0.5 ? -1 : 1) * d.w * 0.45)).multiply(new THREE.Matrix4().makeRotationY((hash(di, 68) - 0.5) * 1.4 + Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationX((hash(di, 69) - 0.5) * 0.6));
      const bl = 3 + hash(di, 70) * 2.5;
      b.box(M.steel, [0, 0, 0], [bl, 0.34, 0.03], { m: bm }); b.box(M.steel, [0, 0.16, 0], [bl, 0.03, 0.2], { m: bm }); b.box(M.steel, [0, -0.16, 0], [bl, 0.03, 0.2], { m: bm });
      // a rubble layer on every slab — torn plate offcuts lying flat,
      // snapped pipe lengths, a frame stub, dunnage — low (≤ 0.3 m: you walk over it, it stops no one) but busy
      for (let k = 0; k < 7; k++) {
        const along = d.len * (-0.42 + 0.84 * hash(di, k, 81)), across = (hash(di, k, 82) - 0.5) * d.w * 0.85, ry = hash(di, k, 83) * 6.28, kind = Math.floor(hash(di, k, 84) * 4);
        const rm = m.clone().multiply(new THREE.Matrix4().makeTranslation(along, d.t / 2 + 0.03, across)).multiply(new THREE.Matrix4().makeRotationY(ry));
        if (kind === 0) b.add(M.hull, tornStrip(0.9 + hash(di, k, 85) * 1.2, 0.6 + hash(di, k, 86) * 0.8, 0.15, (hash(di, k, 87) - 0.5) * 0.3, s.x + di * 53 + k, 0.07), rm.clone().multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)), false);
        else if (kind === 1) { const pl = 1.2 + hash(di, k, 88) * 1.6; b.cyl(M.steel, new THREE.Vector3(-pl / 2, 0.1, 0).applyMatrix4(rm).toArray() as V3, new THREE.Vector3(pl / 2, 0.12, 0).applyMatrix4(rm).toArray() as V3, 0.09, 8); }
        else if (kind === 2) b.box(M.steel, [0, 0.12, 0], [1.4 + hash(di, k, 89), 0.24, 0.12], { m: rm });
        else b.box(hm.wood, [0, 0.05, 0], [1.6 + hash(di, k, 90), 0.08, 0.24], { m: rm });
      }
      if (d.deck && hash(di, 71) < 0.6) {
        const cm = m.clone().multiply(new THREE.Matrix4().makeTranslation(-d.len * 0.15, d.t / 2 + 0.45, (hash(di, 72) - 0.5) * d.w * 0.5)).multiply(new THREE.Matrix4().makeRotationY(hash(di, 73) * 3)).multiply(new THREE.Matrix4().makeRotationZ((hash(di, 74) - 0.5) * 0.4));
        b.box(hm.wood, [0, 0, 0], [0.95, 0.9, 0.95], { m: cm, bevel: 0.04 });
      }
    }
  });
}

let panelM: THREE.MeshStandardMaterial | null = null, dadoM: THREE.MeshStandardMaterial | null = null;
const wallPanel = () => (panelM ??= paint("#cdbf9e", { rough: 0.8, grime: 0.75, name: "wreck-wall-panel" }));
const dadoPaint = () => (dadoM ??= paint("#4f5d63", { rough: 0.7, grime: 0.6, name: "wreck-dado" }));
/** the exposed rooms of a torn house end: dark back wall, floors sticking out past the tear (sagging, jagged), hanging
 *  planks + cables, a few wall studs and room clutter — the cut-open stern superstructure */
function tornRooms(b: Builder, M: WreckMats, m: HarborMats, s: HullSection, dk: number) {
  const H = s.house, xb = H.x1 - TORN_ROOM;
  for (let l = 0; l <= H.levels; l++) {
    const y = dk + l * LH, hw = H.halfW - (l > 0 ? 0.3 : 0);
    if (l < H.levels) {
      // back wall of the exposed rooms (dark, stained) + a door hole
      // (a real doorway into the house — the collider wall leaves the same cell out)
      const [d0, d1] = TORN_DOOR, wz0 = -hw + 0.1, wz1 = hw - 0.1;
      b.box(M.inner, [xb - 0.1, y + LH / 2, (wz0 + d0) / 2], [0.3, LH, d0 - wz0]);
      b.box(M.inner, [xb - 0.1, y + LH / 2, (d1 + wz1) / 2], [0.3, LH, wz1 - d1]);
      b.box(M.inner, [xb - 0.1, y + 2.3 + (LH - 2.3) / 2, (d0 + d1) / 2], [0.3, LH - 2.3, d1 - d0]);
      for (const zz of [d0, d1]) b.box(M.steel, [xb - 0.1, y + 1.15, zz], [0.34, 2.3, 0.08]);
      // the back wall's room face is a real wall — water-stained cream bulkhead panels with seams,
      // a blue-grey dado, a skirting, a steel door frame + a door leaf hanging open; the
      // rooms are furnished by the interiors kit (STERN_ROOMS "stern-torn-*")
      const P = wallPanel(), D = dadoPaint(), fx = xb + 0.055;
      for (const [za, zb] of [[wz0, d0], [d1, wz1]] as Array<[number, number]>) {
        b.box(P, [fx, y + LH / 2, (za + zb) / 2], [0.012, LH - 0.1, zb - za]);
        b.box(D, [fx + 0.008, y + 0.6, (za + zb) / 2], [0.012, 1.2, zb - za]);
        b.box(M.steel, [fx + 0.02, y + 0.06, (za + zb) / 2], [0.03, 0.12, zb - za]);
        for (let z = za + 0.8; z < zb - 0.2; z += 0.8) b.box(M.black, [fx + 0.008, y + LH / 2 + 0.6, z], [0.014, LH - 1.4, 0.02]);
      }
      b.box(P, [fx, y + 2.3 + (LH - 2.3) / 2, (d0 + d1) / 2], [0.012, LH - 2.3, d1 - d0]);
      for (const zz of [d0 - 0.06, d1 + 0.06]) b.box(M.steel, [fx + 0.02, y + 1.15, zz], [0.06, 2.3, 0.12]);
      b.box(M.steel, [fx + 0.02, y + 2.33, (d0 + d1) / 2], [0.06, 0.12, d1 - d0 + 0.24]);
      { const dm = new THREE.Matrix4().makeTranslation(fx + 0.04, y + 1.12, d0).multiply(new THREE.Matrix4().makeRotationY(-1.15 - hash(l, 77) * 0.4)).multiply(new THREE.Matrix4().makeTranslation(0, 0, (d1 - d0) / 2));
        b.box(M.whiteTrim, [0, 0, 0], [0.05, 2.15, d1 - d0 - 0.08], { m: dm }); b.box(M.steel, [0.04, 0.05, (d1 - d0) / 2 - 0.2], [0.04, 0.04, 0.12], { m: dm }); }
    }
    if (l === 0) continue;
    // floor slab of this level: runs out past the tear by 0.3–2.2 m in uneven tongues, sagging at the end
    const n = 5;
    for (let k = 0; k < n; k++) {
      const za = -hw + (2 * hw * k) / n, zb = -hw + (2 * hw * (k + 1)) / n, out = 0.3 + hash(l, k, 11) * 1.9;
      const len = TORN_ROOM + out, sag = hash(l, k, 12) * 0.25, zc = (za + zb) / 2, wz = zb - za - 0.04, rz = -sag * 0.35, yc = y - sag * 0.5;
      // the deck of the level above as STRUCTURE — a 4 cm steel plate
      // (rusty deck paint) on two I-beam joists that run on past the torn plate and droop, the plaster ceiling under it
      // hanging in a ragged sheet only inside the room
      b.box(M.deck, [xb + len / 2, yc - 0.02, zc], [len, 0.05, wz], { rotZ: rz });
      b.box(M.hull, [xb + len - 0.02, yc - 0.03, zc], [0.06, 0.07, wz - 0.1], { rotZ: rz + 0.3 });
      for (const f of [0.28, 0.72]) {
        const jz = za + (zb - za) * f, ext = 0.25 + hash(l, k, f * 10) * 0.7, jl = len + ext, droop = -0.12 - hash(l, k, f * 20) * 0.35;
        const jm = new THREE.Matrix4().makeTranslation(xb, yc - 0.05, jz).multiply(new THREE.Matrix4().makeRotationZ(rz));
        const seg = (x0: number, x1: number, a: number) => {
          const mm = jm.clone().multiply(new THREE.Matrix4().makeTranslation(x0, 0, 0)).multiply(new THREE.Matrix4().makeRotationZ(a));
          const L2 = x1 - x0;
          b.box(M.steel, [L2 / 2, -0.13, 0], [L2, 0.2, 0.025], { m: mm });       // web
          b.box(M.steel, [L2 / 2, -0.015, 0], [L2, 0.025, 0.14], { m: mm });    // top flange (under the plate)
          b.box(M.steel, [L2 / 2, -0.24, 0], [L2, 0.025, 0.14], { m: mm });     // bottom flange
        };
        seg(0, len - 0.4, 0); seg(len - 0.4, jl, droop);
      }
      // the ceiling plaster under the deck: inside the room, torn off at the tear
      b.box(M.whiteTrim, [xb + TORN_ROOM / 2 - 0.1, yc - 0.3, zc], [TORN_ROOM - 0.2, 0.02, wz], { rotZ: rz });
      // planks / beams sticking out further + dangling
      if (hash(l, k, 13) > 0.45) b.box(m.wood, [xb + len + 0.6, y - 0.3 - hash(l, k, 14) * 0.6, (za + zb) / 2 + (hash(l, k, 15) - 0.5)], [2.2, 0.08, 0.28], { rotZ: -0.3 - hash(l, k, 16) * 0.7, rotY: (hash(l, k, 17) - 0.5) * 0.5 });
    }
    // hanging cables + a pipe run cut off at the tear
    for (let k = 0; k < 2; k++) {
      const z = (hash(l, k, 21) - 0.5) * 2 * hw * 0.8, x0 = xb + TORN_ROOM - 0.2;
      cableBundle(b, M, [[x0, y - 0.1, z], [x0 + 0.5, y - 1.0, z + 0.2], [x0 + 0.6, y - 1.9 - hash(l, k) * 0.8, z + 0.3]], 0.035, l * 5 + k);
    }
    b.cyl(M.steel, [xb, y - 0.45, hw - 0.6], [H.x1 + 0.4, y - 0.55, hw - 0.6], 0.09, 8);
  }
  // what is left of the END WALL — per level one or two big facade plates
  // still hanging at the tear, bent outward / sagging, covering part of each opening, + a collapsed ceiling panel
  for (let l = 0; l < H.levels; l++) {
    const y = dk + l * LH, hw = H.halfW - (l > 0 ? 0.3 : 0);
    const n = hash(l, 91, s.x) < 0.6 ? 1 : 0;   // (one hanging plate on some levels — a curtain of white strips reads as paper flags)
    for (let k = 0; k < n; k++) {
      const zc = (l % 2 ? -1 : 1) * hw * (0.35 + hash(l, k, 92) * 0.45), wdt = 1.2 + hash(l, k, 93) * 1.2;
      const m = new THREE.Matrix4().makeTranslation(H.x1 - 0.25, y + LH - 0.15, zc)
        .multiply(new THREE.Matrix4().makeRotationY((hash(l, k, 94) - 0.5) * 0.5))
        .multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + (hash(l, k, 95) - 0.5) * 0.25))
        .multiply(new THREE.Matrix4().makeRotationX((hash(l, k, 96) - 0.5) * 0.3));
      b.add(M.facade, tornStrip(LH * (0.55 + hash(l, k, 97) * 0.35), wdt, 0.35 + hash(l, k, 98) * 0.5, (hash(l, k, 99) - 0.5) * 0.5, s.x + l * 17 + k, 0.12, true), m, false);
    }
    if (l > 0 && hash(l, 101, s.x) < 0.7) {
      const zc = (hash(l, 102) - 0.5) * hw;
      const m = new THREE.Matrix4().makeTranslation(H.x1 - 1.2, y - 0.3, zc).multiply(new THREE.Matrix4().makeRotationY((hash(l, 103) - 0.5) * 0.6)).multiply(new THREE.Matrix4().makeRotationZ(-0.45 - hash(l, 104) * 0.3));
      b.add(M.hull, tornStrip(2.4 + hash(l, 105), 1.8 + hash(l, 106), 0.3, 0.2, s.x + l * 29, 0.1), m, false);
    }
  }
}

function house(b: Builder, M: WreckMats, m: HarborMats, s: HullSection) {
  const H = s.house, dk = deckY(s, (H.x0 + H.x1) / 2), lh = LH, torn = houseTorn(s);
  for (let l = 0; l < H.levels; l++) {
    const inset = l === H.levels - 1 ? 1.2 : l * 0.25;
    const x1 = torn ? H.x1 : H.x1 - inset * 0.5;
    const holes = { plus: houseHoles(s, l, 1).map((h): [number, number] => [h.x0, h.x1]), minus: houseHoles(s, l, -1).map((h): [number, number] => [h.x0, h.x1]) };
    level(b, M, H.x0 + inset, x1, dk + l * lh, lh, H.halfW - (l > 0 ? 0.3 : 0), torn, l + (s.id === "bow" ? 0 : 10), holes);
    // external rails on the bridge deck only (rails on every level read as parking-garage balconies)
    if (l === H.levels - 2) for (const side of [1, -1]) {
      const z = side * (H.halfW + 0.25), y = dk + (l + 1) * lh;
      for (let x = H.x0 + 0.5; x < H.x1 - (torn ? 1.5 : 0); x += 1.6) if (hash(x, l, side) > 0.15) b.cyl(M.whiteTrim, [x, y, z], [x, y + 0.95, z + side * (hash(x, l) > 0.85 ? 0.3 : 0)], 0.03, 4, { caps: false });
      b.box(M.whiteTrim, [(H.x0 + H.x1) / 2 - (torn ? 0.8 : 0), y + 0.95, z], [H.x1 - H.x0 - (torn ? 2 : 0.4), 0.05, 0.05]);
    }
  }
  // the rooms inside (stairwell, floors, plaster liners, furniture, lamps) — the colliders' pieces, derelict paint;
  // the bow's world-level stair pieces are drawn by buildFreighter in world space
  const rm = roomMats(m, { indoor: true, ibl: 0.35, derelict: true });
  const pcs = houseInteriorPieces(s).filter((p) => !levelStairPiece(s, p) && !(s.id === "bow" && p.kind === "flight"));
  drawPieces(b, pcs, rm);
  if (s.id === "stern") drawPieces(b, [...holdStairPieces(s), ...extStairPieces(s)], rm);
  if (torn) tornRooms(b, M, m, s, dk);
  // the bridge deck (top level): a continuous band of dark wheelhouse glass with white mullions on all four sides
  // (breaks the office-block window grid; the bridge reads as one dark strip under the roof)
  {
    const l = H.levels - 1, inset = 1.2, x0 = H.x0 + inset, x1 = torn ? H.x1 - 1.6 : H.x1 - inset * 0.5, hw = H.halfW - 0.3, y = dk + l * lh + 1.75;
    const glass = M.black;
    // wheelhouse windows: square dark panes in a row (small square windows, lots of white wall between)
    for (const side of [1, -1]) for (let x = x0 + 1.0; x < x1 - 0.8; x += 1.9) {
      if (hash(x, side, s.x) < 0.2) continue;
      b.box(M.whiteTrim, [x, y, side * (hw + 0.04)], [1.0, 0.95, 0.06]);
      b.box(glass, [x, y, side * (hw + 0.07)], [0.75, 0.72, 0.04]);
    }
    for (const xe of torn ? [x0] : [x0, x1]) for (let z = -hw + 1.0; z < hw - 0.8; z += 1.7) {
      const o = xe === x0 ? -1 : 1;
      b.box(M.whiteTrim, [xe + o * 0.04, y, z], [0.06, 0.95, 1.0]);
      b.box(glass, [xe + o * 0.07, y, z], [0.04, 0.72, 0.75]);
    }
  }
  // bridge wings on the top level + roof clutter (radar pedestal, vents, a searchlight)
  const top = dk + H.levels * lh;
  // open bridge wings (shared wreckWing = the colliders): plate, bulwark, cap rail, brackets, a repeater console
  for (const side of [1, -1]) {
    for (const q of wreckWing(s, side)) b.box(M.whiteTrim, q.c, [2 * q.h[0], 2 * q.h[1], 2 * q.h[2]], { bevel: 0.02 });
    const wb = wreckWing(s, side), pl = wb[0], y = pl.c[1] + pl.h[1], zo = pl.c[2] + side * pl.h[2];
    b.box(M.steel, [pl.c[0], y + 1.12, zo - side * 0.05], [2.5, 0.06, 0.14]);
    for (const dx of [-0.9, 0.9]) b.beam(M.whiteTrim, [pl.c[0] + dx, y - 1.4, side * (H.halfW + 0.05)], [pl.c[0] + dx, y - 0.25, zo - side * 0.3], 0.16, 0.16);
    b.box(M.black, [pl.c[0] + 0.4, y + 0.5, zo - side * 0.45], [0.5, 1.0, 0.4], { bevel: 0.03 });
    b.box(M.steel, [pl.c[0] + 0.4, y + 1.02, zo - side * 0.5], [0.42, 0.04, 0.3], { rotX: side * 0.4 });
  }
  // (the roof is drawn over exactly the collider's extent — top level's walls → x1 — with the
  // stairwell's hatch open as in the colliders, a coaming round the hatch)
  {
    const Lt = houseLevel(s, H.levels - 1), rx0 = Lt.x0, rx1 = torn ? H.x1 - 2.0 : Lt.x1, rz = Lt.hw;
    const [w0, w1, v0, v1] = houseStair(s).holes(H.levels)[0];
    const slabR = (xa: number, xb: number, za: number, zb: number) => { if (xb - xa > 0.02 && zb - za > 0.02) b.box(M.whiteTrim, [(xa + xb) / 2, top + 0.12, (za + zb) / 2], [xb - xa, 0.24, zb - za]); };
    slabR(rx0, w0, -rz, rz); slabR(w1, rx1, -rz, rz); slabR(w0, w1, -rz, v0); slabR(w0, w1, v1, rz);
    for (const [cx, cz, sx, sz] of [[(w0 + w1) / 2, v0, w1 - w0 + 0.16, 0.08], [(w0 + w1) / 2, v1, w1 - w0 + 0.16, 0.08], [w0, (v0 + v1) / 2, 0.08, v1 - v0], [w1, (v0 + v1) / 2, 0.08, v1 - v0]] as Array<[number, number, number, number]>) b.box(M.steel, [cx, top + 0.32, cz], [sx, 0.16, sz]);
  }
  b.box(M.steel, [H.x0 + 3, top + 0.7, -2], [1.4, 1.1, 1.4], { bevel: 0.08 });
  b.cyl(M.steel, [H.x0 + 6, top, 2.5], [H.x0 + 6, top + 1.4, 2.5], 0.4, 10);
  // roof railing
  // (open where the exterior stair's roof landing comes in on the −z side)
  for (const side of [1, -1]) {
    const ra = (H.x0 + H.x1) / 2 - (H.x1 - H.x0 - 2.5) / 2, rb = (H.x0 + H.x1) / 2 + (H.x1 - H.x0 - 2.5) / 2, gap = side < 0 ? extStairRoofGap(s) : null;
    const runs: Array<[number, number]> = gap ? [[ra, gap[0] - 0.1], [gap[1] + 0.1, rb]] : [[ra, rb]];
    for (const [a, c] of runs) if (c - a > 0.2) b.box(M.whiteTrim, [(a + c) / 2, top + 1.1, side * (H.halfW - 0.4)], [c - a, 0.05, 0.05]);
  }

}

/** rounded-rectangle funnel casing (tall squarish yellow funnel, black top, slight aft rake), exhaust pipes
 *  poking out of the top */
function funnel(b: Builder, M: WreckMats, s: HullSection) {
  const H = s.house, F = s.funnel, x = H.funnelX, dk = deckY(s, x), h = F.h, rake = 0.9 * (s.id === "bow" ? 1 : -1);
  const r = Math.min(F.hx, F.hz) * (F.round ?? 0.62), tp = F.taper ?? 0.07, kAt = (y: number) => 1 - tp * (y / h);
  const shape = new THREE.Shape();
  shape.moveTo(-F.hx + r, -F.hz); shape.lineTo(F.hx - r, -F.hz); shape.quadraticCurveTo(F.hx, -F.hz, F.hx, -F.hz + r);
  shape.lineTo(F.hx, F.hz - r); shape.quadraticCurveTo(F.hx, F.hz, F.hx - r, F.hz); shape.lineTo(-F.hx + r, F.hz);
  shape.quadraticCurveTo(-F.hx, F.hz, -F.hx, F.hz - r); shape.lineTo(-F.hx, -F.hz + r); shape.quadraticCurveTo(-F.hx, -F.hz, -F.hx + r, -F.hz);
  const seg = (y0: number, y1: number, k0: number, k1: number, mat: THREE.Material) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, steps: 1, curveSegments: 5 });
    g.rotateX(-Math.PI / 2); // extrude +Z → +Y (shape y → −z)
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / (y1 - y0), k = k0 + (k1 - k0) * t, yy = y0 + p.getY(i);
      p.setXYZ(i, x + p.getX(i) * k + rake * (yy / h), dk + yy, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    b.add(mat, g, undefined, true, 1);
  };
  seg(-0.5, h - 2.2, kAt(-0.5), kAt(h - 2.2), M.funnel);
  seg(h - 2.2, h, kAt(h - 2.2), kAt(h), M.black);
  // top lip (a flared black cap) + a rust-dark band under the black + exhaust pipes
  seg(h - 0.25, h + 0.05, kAt(h) + 0.05, kAt(h) + 0.05, M.black);
  if (tp > 0.15) seg(h - 3.2, h - 2.75, kAt(h - 3.2) + 0.025, kAt(h - 2.75) + 0.025, M.steel);
  b.cyl(M.black, [x - 0.6 + rake, dk + h - 0.6, 0.4], [x - 0.5 + rake, dk + h + 1.1, 0.4], 0.32, 10);
  b.cyl(M.black, [x + 0.6 + rake, dk + h - 0.6, -0.3], [x + 0.65 + rake, dk + h + 0.8, -0.3], 0.24, 10);
  // (no caged ladder up the funnel — the sim has no climbing, so it would be a ladder you could
  //  not use)
}

function mast(b: Builder, M: WreckMats, s: HullSection) {
  const H = s.house, x = H.mastX, base = deckY(s, x) + H.levels * LH, h = 15;
  b.cyl(M.mast, [x, base, 0], [x, base + h, 0], 0.26, 10, { r1: 0.16 });
  for (const [y, w] of [[h * 0.55, 5], [h * 0.8, 3.4]] as Array<[number, number]>) b.box(M.mast, [x, base + y, 0], [0.18, 0.18, w]);
  // crow's nest platform with a rail (no rungs up the mast — the sim has no climbing)
  b.cyl(M.mast, [x, base + h * 0.42, 0], [x, base + h * 0.42 + 0.12, 0], 0.9, 12);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.cyl(M.mast, [x + Math.cos(a) * 0.85, base + h * 0.42, Math.sin(a) * 0.85], [x + Math.cos(a) * 0.85, base + h * 0.42 + 0.8, Math.sin(a) * 0.85], 0.025, 4, { caps: false }); }
  // stays down to the house roof edges
  for (const side of [1, -1]) b.cyl(M.black, [x, base + h * 0.8, 0], [x - 4, base + 0.2, side * (H.halfW - 0.5)], 0.03, 4, { caps: false });
  b.cyl(M.black, [x, base + h * 0.95, 0], [H.funnelX + (x > H.funnelX ? 1 : -1) * s.funnel.hx * 0.8, deckY(s, H.funnelX) + s.funnel.h - 0.3, 0], 0.03, 4, { caps: false });
  // top light + a bird perched
  b.box(M.black, [x, base + h + 0.1, 0], [0.3, 0.2, 0.3]);
}

function letters(group: THREE.Group, M: WreckMats, s: HullSection) {
  // "THE FEED" ~3 m letters mid-flank on the beach side (the name sits well inside the hull, half-way down
  // from the deck, the whole word clear of the break) — the plane is a grid that follows the hull's half-breadth, so
  // the paint sits ON the plating
  // (4.5 m toward the break + 0.8 m up — further aft and lower the "B" runs into the sand)
  const x0 = 24, x1 = 47.5, yc = s.depth - 5.6, h = 3.7;
  const g = new THREE.PlaneGeometry(x1 - x0, h, 40, 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const lx = (x0 + x1) / 2 + p.getX(i) * (s.beachSide < 0 ? -1 : 1), ly = yc + p.getY(i);
    p.setXYZ(i, lx, ly, s.beachSide * (halfBreadth(s, lx, ly) + 0.05));
  }
  if (s.beachSide < 0) g.index && g.setIndex(Array.from(g.index.array).reverse());
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, M.letters);
  mesh.name = "wreck-letters"; mesh.receiveShadow = true; mesh.castShadow = false; mesh.userData.castShadow = false; mesh.renderOrder = 1;
  group.add(mesh);
}

/** the name on the stern's transom (faded white BANANA CO. across the raked plate, readable from the sea) */
function transomName(group: THREE.Group, M: WreckMats, s: HullSection) {
  const w = 13, h = w * 320 / 2048, yc = s.depth - 2.6;
  const g = new THREE.PlaneGeometry(w, h, 8, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i), y = yc + p.getY(i); p.setXYZ(i, endX(s, y) - 0.06, y, px); }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, M.letters);
  mesh.name = "wreck-transom-name"; mesh.receiveShadow = true; mesh.castShadow = false; mesh.userData.castShadow = false; mesh.renderOrder = 1;
  group.add(mesh);
}

/** the stern's running gear: bronze 4-blade propeller on its boss, the rudder (streamlined blade + stock into the
 *  counter), the skeg + sole piece; barnacle-crusted below the old waterline */
function sternGear(b: Builder, M: WreckMats, s: HullSection) {
  if (s.id !== "stern") return;
  const G = STERN_GEAR;
  const bronze = new THREE.MeshStandardMaterial({ color: "#8a6232", roughness: 0.55, metalness: 0.6, name: "wreck-bronze" });
  b.cyl(bronze, [G.propX - 0.2, G.propY, 0], [G.propX + 1.0, G.propY, 0], 0.5, 12, { r1: 0.34 });
  b.cyl(M.steel, [G.propX + 1.0, G.propY, 0], [G.propX + 2.4, G.propY + 0.05, 0], 0.32, 10);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const m = new THREE.Matrix4().makeTranslation(G.propX + 0.25, G.propY, 0).multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(0, G.propR * 0.52, 0)).multiply(new THREE.Matrix4().makeRotationY(0.55));
    const blade = new THREE.SphereGeometry(1, 10, 6).scale(0.14, G.propR * 0.5, 0.62);
    b.add(bronze, blade, m, false);
  }
  // rudder blade (flat foil with a rounded nose), stock up into the counter, pintle straps
  const cx = (G.rudderX0 + G.rudderX1) / 2, cy = (G.rudderY0 + G.rudderY1) / 2;
  b.box(M.hull, [cx, cy, 0], [G.rudderX1 - G.rudderX0, G.rudderY1 - G.rudderY0, 0.32], { bevel: 0.1 });
  b.cyl(M.hull, [G.rudderX1, G.rudderY0, 0], [G.rudderX1, G.rudderY1, 0], 0.2, 10);
  b.cyl(M.steel, [G.stockX, G.rudderY1, 0], [G.stockX, G.rudderY1 + 3.2, 0], 0.26, 10);
  for (const y of [G.rudderY0 + 1.5, cy, G.rudderY1 - 1.2]) b.box(M.steel, [cx, y, 0], [G.rudderX1 - G.rudderX0 + 0.1, 0.18, 0.4]);
  // skeg / sole piece from the keel end under the prop to the rudder heel
  b.box(M.hull, [(endX(s, 0.4) + G.rudderX0) / 2, 0.3, 0], [endX(s, 0.4) - G.rudderX0 + 0.4, 0.5, 0.5], { bevel: 0.08 });
}

/** mushroom + gooseneck ventilators (dark mouths), twin bollards and fairleads along the bulwarks, a windlass on the
 *  bow's forecastle, empty bent lifeboat davits on the house sides */
function deckGear(b: Builder, M: WreckMats, s: HullSection) {
  const dk = (x: number) => deckY(s, x);
  for (const [x, z] of [[11, 2.6], [s.length * 0.55, 2.6], [s.length * 0.3, -3.2]] as Array<[number, number]>) {
    const y = dk(x);
    if (!inHouse(s, x)) {
      b.cyl(M.steel, [x, y, z], [x, y + 1.6, z], 0.32, 12);
      b.cyl(M.whiteTrim, [x, y + 1.6, z], [x + 0.55, y + 2.05, z], 0.38, 12);
      b.cyl(M.black, [x + 0.56, y + 2.06, z], [x + 0.6, y + 2.1, z], 0.32, 12);
    }
    const x2 = ventX2(s, x), y2 = dk(x2);
    if (inHouse(s, x2)) continue;
    b.cyl(M.steel, [x2, y2, -z * 0.6], [x2, y2 + 1.1, -z * 0.6], 0.22, 10);
    b.cyl(M.steel, [x2, y2 + 1.1, -z * 0.6], [x2, y2 + 1.3, -z * 0.6], 0.42, 12);
  }
  for (let x = 4; x < s.length - 6; x += 12) for (const side of [1, -1]) {
    const y = dk(x), z = side * (halfBreadth(s, x, y) - 0.8);
    for (const dx of [-0.35, 0.35]) b.cyl(M.black, [x + dx, y, z], [x + dx, y + 0.55, z], 0.18, 10);
    b.box(M.black, [x, y + 0.08, z], [1.2, 0.16, 0.5]);
  }
  if (s.id === "bow") {
    const x = 5, y = dk(x);
    b.box(M.steel, [x, y + 0.5, 0], [1.6, 1.0, 2.4], { bevel: 0.08 });
    for (const sz of [-1, 1]) { b.cyl(M.black, [x, y + 0.7, sz * 1.2], [x, y + 0.7, sz * 1.8], 0.55, 14); b.cyl(M.steel, [x + 0.4, y + 0.2, sz * 1.5], [x + 3.5, y + 0.1, sz * 2.4], 0.07, 6); }
  }
  // davits: a pair of bent arms on each house side, one dragging an empty cradle
  const H = s.house, top = dk((H.x0 + H.x1) / 2) + HOUSE_LEVEL_H;
  for (const side of [1, -1]) for (const dx of [2, 5.5]) {
    const x = H.x0 + dx, z = side * (H.halfW + 0.2), bent = hash(s.x, side, dx) > 0.5;
    b.beam(M.whiteTrim, [x, top, z], [x + 0.2, top + 2.2, z + side * 0.4], 0.22, 0.22);
    b.beam(M.whiteTrim, [x + 0.2, top + 2.2, z + side * 0.4], [x + 0.3, top + (bent ? 1.4 : 2.4), z + side * (bent ? 1.9 : 1.6)], 0.18, 0.18);
    if (dx === 2 && side === s.beachSide) b.tube(M.black, [[x + 0.3, top + 2.3, z + side * 1.6], [x + 0.35, top + 1.2, z + side * 1.7], [x + 0.4, top + 0.2, z + side * 1.5]], 0.025, 4, { samples: 6 });
  }
}
const HOUSE_LEVEL_H = 3.1;

/** sun shafts falling through the stern's broken hatch into the flooded hold
 *  (crossed additive cards, fading down) + a warm light pool on the water + caustic flecks on the hold's walls */
let shaftM: THREE.MeshBasicMaterial | null = null, poolM: THREE.MeshBasicMaterial | null = null;
function holdLight(b: Builder, s: HullSection) {
  if (s.id !== "stern") return;
  shaftM ??= (() => { const c = document.createElement("canvas"); c.width = 8; c.height = 128; const g = c.getContext("2d")!, gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,236,190,0.0)"); gr.addColorStop(0.08, "rgba(255,236,190,0.75)"); gr.addColorStop(0.6, "rgba(255,226,170,0.35)"); gr.addColorStop(1, "rgba(255,220,160,0)"); g.fillStyle = gr; g.fillRect(0, 0, 8, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, name: "wreck-hold-shaft" }); })();
  poolM ??= (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d")!; const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, "rgba(255,240,200,0.9)"); gr.addColorStop(1, "rgba(255,230,180,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.globalCompositeOperation = "destination-out"; for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(0,0,0,${0.3 + (i % 3) * 0.2})`; g.lineWidth = 3; g.beginPath(); g.arc(20 + ((i * 37) % 90), 20 + ((i * 53) % 90), 6 + (i % 5) * 3, 0, 5); g.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, name: "wreck-hold-pool" }); })();
  const [h0, h1] = s.openHatch, top = deckY(s, (h0 + h1) / 2), water = 4.3;
  for (let k = 0; k < 4; k++) {
    const x = h0 + 0.8 + k * ((h1 - h0 - 1.6) / 3), z = -2.6 + k * 1.7, len = top - water + 1.5;
    for (const ry of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(1.2 + hash(k, 3) * 0.8, len).translate(0, -len / 2, 0);
      const mm = new THREE.Matrix4().makeTranslation(x, top + 0.8, z).multiply(new THREE.Matrix4().makeRotationZ(-0.28)).multiply(new THREE.Matrix4().makeRotationY(ry + k * 0.4));
      b.add(shaftM, g, mm, false);
    }
    b.add(poolM, new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(x + 1.2, water + 0.03, z), false);
  }
}

/** (parity) the HOLD of each half, drawn — the tank-top floor the hold colliders stand on (rusted
 *  plates with a weld grid, limber holes, sunk sludge), web frames up the inside of the shell every 2.4 m with brackets,
 *  a longitudinal girder down the centre line and silt / sunk cargo on the plates. The bow's forward hold is packed
 *  solid (only aft of BOW_CORE_X is open). Section-local, like the colliders (shared holdFloor: tank top at 1.5 m). */
function holdInterior(b: Builder, M: WreckMats, s: HullSection, hm: HarborMats) {
  const L = s.length, y = 1.5, x0 = s === BOW ? BOW_CORE_X + 0.3 : 4, x1 = L - 1;
  // tank-top plates: 2.4 × (breadth) bays, a dark weld seam between them, a rust tone per plate
  for (let x = x0; x < x1 - 0.05; x += 2.4) {
    const xb = Math.min(x1, x + 2.4), xm = (x + xb) / 2, hb = halfBreadth(s, xm, y) - 0.4;
    if (hb < 0.6) continue;
    b.box(M.deck, [xm, y - 0.06, 0], [xb - x - 0.03, 0.12, 2 * hb], { rotZ: 0 });
    b.box(M.black, [xb - 0.015, y - 0.055, 0], [0.04, 0.12, 2 * hb]);
    // flat-bar stiffeners along the floor (≤ 0.12 m: the plates stay the walkable floor the colliders are) + limber holes
    b.box(M.steel, [xm, y + 0.06, 0], [xb - x, 0.12, 0.14]);
    for (const sd of [-1, 1]) b.box(M.steel, [xm, y + 0.05, sd * hb * 0.55], [xb - x, 0.1, 0.1]);
    for (const sd of [-1, 1]) b.box(M.black, [xm, y + 0.002, sd * hb * 0.3], [0.5, 0.004, 0.3]);
    // web frames up both sides of the shell (outside the floor)
    for (const sd of [-1, 1]) {
      const pts: V3[] = [];
      for (let yy = y; yy <= s.depth - 0.4; yy += 0.8) pts.push([x, yy, sd * (halfBreadth(s, x, yy) - 0.32)]);
      b.rail(M.steel, pts, 0.09, 4);
    }
    void hm;
  }
}

export async function buildFreighter(w: WreckCtx): Promise<THREE.Group[]> {
  const M = wreckMats();
  const out: THREE.Group[] = [];
  for (const s of SECTIONS) {
    const sec = new THREE.Group();
    sec.name = `wreck-${s.id}`;
    sec.applyMatrix4(sectionMatrix(s));
    // (a deferred builder + yields between the parts and through the merge — no long main-thread task)
    const b = new Builder(true), Y = () => w.ctx.yield();
    shell(b, M, s); await Y();
    deck(b, M, w.mats, s); await Y();
    breakDetail(b, M, s); await Y();
    house(b, M, w.mats, s); await Y();
    funnel(b, M, s);
    mast(b, M, s);
    sternGear(b, M, s); await Y();
    deckGear(b, M, s);
    breakDebris(b, M, s, w.mats); await Y();
    holdLight(b, s);
    holdInterior(b, M, s, w.mats); await Y();
    if (s === BOW) {
      // the rusted collision bulkhead that closes the packed forward hold (seen from the break, looking in)
      const sh = new THREE.Shape(), n = 12, x = BOW_CORE_X, top = deckY(s, x) - 0.35;
      for (let i = 0; i <= n; i++) { const y = 0.3 + ((top - 0.3) * i) / n; const z = halfBreadth(s, x, y) - 0.45; if (i === 0) sh.moveTo(-z, y); else sh.lineTo(-z, y); }
      for (let i = n; i >= 0; i--) { const y = 0.3 + ((top - 0.3) * i) / n; sh.lineTo(halfBreadth(s, x, y) - 0.45, y); }
      b.add(M.hull, new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: false, curveSegments: 1 }), new THREE.Matrix4().makeTranslation(x + 0.12, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
      for (let y = 2; y < top - 1; y += 2.4) b.box(M.steel, [x - 0.1, y, 0], [0.18, 0.22, 2 * (halfBreadth(s, x, y) - 0.6)]);
    }
    sec.add(await b.buildAsync(`wreck-${s.id}-hull`, { palette: (m) => /^(wreck-black|wreck-steel|wreck-inner|wreck-bronze|greenPaint|wood)$/.test(m.name) }, Y));
    const fine = new Builder(true);
    railings(fine, M, s);
    const rails = await fine.buildAsync(`wreck-${s.id}-rails`, { cast: false }, Y);
    sec.add(rails);
    w.lod?.add(rails, { show: 260 });
    if (s === BOW) letters(sec, M, s);
    else transomName(sec, M, s);
    // one shadow draw per section (perf: ~9 materials × 2 cascades = 18 shadow draws a half)
    mergeCasters(sec);
    w.group.add(sec);
    out.push(sec);
  }
  // the bow's world-level stair (treads + landings = levelBox colliders, drawn in world space)
  {
    const lb = new Builder(), rm = roomMats(w.mats, { indoor: true, ibl: 0.35, derelict: true });
    for (const p of houseInteriorPieces(BOW).filter((q) => levelStairPiece(BOW, q))) {
      const bx = levelBox(BOW, p);
      lb.base = new THREE.Matrix4().compose(new THREE.Vector3(bx.c[0], bx.c[1], bx.c[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(bx.yaw ?? 0)), new THREE.Vector3(1, 1, 1));
      drawPieces(lb, [{ ...p, c: [0, 0, 0], h: [bx.h[0], bx.h[1], bx.h[2]] }], rm);
    }
    lb.base = null;
    const g = lb.build("wreck-bow-stair", { cast: false });
    w.group.add(g);
  }
  // ---- surf where the hulls meet the water: along both sides find the local height whose world y is 0 and ring
  // foam there (the bow half's buried stem and the reef-borne break get the heaviest wash)
  const water = w.ctx.shared.get("water") as { registerFoamCircle?: (x: number, z: number, r: number, s?: number) => void } | undefined;
  if (water?.registerFoamCircle) for (const s of SECTIONS) for (const side of [1, -1]) for (let x = 1; x < s.length; x += 3) {
    // world y is linear in local y at fixed (x, z≈side·hb): y(ly) = y0 + ly·k
    const hb = halfBreadth(s, x, s.depth * 0.3) || s.beam / 2;
    const a = sectionToWorldV(s, x, 0, side * hb), b = sectionToWorldV(s, x, s.depth, side * hb);
    if ((a[1] > 0) === (b[1] > 0)) continue;
    const t = a[1] / (a[1] - b[1]), ly = s.depth * t, h = halfBreadth(s, x, ly);
    const p = sectionToWorldV(s, x, ly, side * (h + 0.6));
    water.registerFoamCircle(p[0], p[2], 2.2 + hash(x, side) * 1.2, x > s.length - 6 ? 1.0 : 0.75);
  }

  // ---- the debris ramps (colliders: ≤ 0.26 m steps under the surface): no tidy staircase on stilts. Each is a
  // COLLAPSED DECK: two or three big warped slabs of deck plating lying along the slope (their top sits half a riser
  // over the step line, so feet never sink more than ~0.13 m), shingled over each other, frames showing under them,
  // torn curled lips on their edges, a bent railing run still attached along one side, a fallen mast / boom beside it
  // and loose plates + cables at the foot.
  const rb = new Builder();
  RAMPS.forEach((r, ri) => {
    const [ax, ay, az] = r.a, [bx, by, bz] = r.b, len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(-(bz - az), bx - ax), dx = (bx - ax) / len, dz = (bz - az) / len, px = -dz, pz = dx;
    const steps = rampSteps(r), riser = steps.length > 1 ? steps[1].top - steps[0].top : 0.3;
    const L3 = Math.hypot(len, by - ay), slope = Math.atan2(by - ay, len);
    const nSlab = L3 > 16 ? 2 : 1;
    for (let k = 0; k < nSlab; k++) {
      const t0 = k / nSlab - (k ? 0.04 : 0), t1 = (k + 1) / nSlab + 0.02, tm = (t0 + t1) / 2;
      const cx = ax + (bx - ax) * tm, cz = az + (bz - az) * tm, cy = ay + (by - ay) * tm + riser * 0.5 - 0.09;
      const jy = (hash(ri, k, 1) - 0.5) * 0.12, jr = (hash(ri, k, 2) - 0.5) * 0.1, wk = r.w * (1.0 + hash(ri, k, 3) * 0.18);
      const m = new THREE.Matrix4().makeRotationY(yaw + jy).multiply(new THREE.Matrix4().makeRotationZ(slope + (hash(ri, k, 4) - 0.5) * 0.03)).multiply(new THREE.Matrix4().makeRotationX(jr)).setPosition(cx, cy + k * 0.04, cz);
      const lenK = L3 * (t1 - t0);
      // three torn RUST plates side by side (two deck-plank boxes read as a wooden ladder leaning on the hull):
      // each a jagged-ended strip of hull plating, buckled its own way, one lifted at its edge, a gap between them
      // each lane is SHINGLED from 3–4 shorter torn
      // plates of different widths, each yawed / lifted its own way and overhanging the next — no continuous stiles
      for (const lane of [-1, 0, 1]) {
        const nseg = 3 + Math.floor(hash(ri, k, lane, 13) * 2);
        for (let q = 0; q < nseg; q++) {
          const wl = wk * (0.27 + hash(ri, k, lane, q, 10) * 0.22), ll = (lenK / nseg) * (1.15 + hash(ri, k, lane, q, 9) * 0.3);
          const at = -lenK / 2 + (lenK * q) / nseg + (hash(ri, k, lane, q, 5) - 0.5) * 0.4;
          const lm = m.clone().multiply(new THREE.Matrix4().makeTranslation(at, 0.05 + q * 0.035 + (hash(ri, k, lane, q, 6) - 0.5) * 0.08, lane * wk * 0.3 + (hash(ri, k, lane, q, 14) - 0.5) * 0.35))
            .multiply(new THREE.Matrix4().makeRotationX(lane * (0.03 + hash(ri, k, lane, q, 7) * 0.12))).multiply(new THREE.Matrix4().makeRotationY((hash(ri, k, lane, q, 8) - 0.5) * 0.42));
          rb.add(M.hull, tornStrip(ll, wl, (hash(ri, k, lane, q, 11) - 0.5) * 0.3, (hash(ri, k, lane, q, 12) - 0.5) * 0.35, ri * 70 + k * 11 + lane * 5 + q + 3, 0.12, false), lm, false);
        }
      }
      // rubble on the slope: torn plate offcuts + a snapped frame lying across it
      for (let q = 0; q < 3; q++) {
        const qm = m.clone().multiply(new THREE.Matrix4().makeTranslation(-lenK / 2 + lenK * (0.2 + 0.3 * q) , 0.12, (hash(ri, k, q, 41) - 0.5) * wk * 0.7)).multiply(new THREE.Matrix4().makeRotationY(hash(ri, k, q, 42) * 6.28)).multiply(new THREE.Matrix4().makeRotationZ((hash(ri, k, q, 43) - 0.5) * 0.6));
        rb.add(M.hull, tornStrip(0.8 + hash(ri, k, q, 44) * 1.1, 0.5 + hash(ri, k, q, 45) * 0.6, 0.6 + hash(ri, k, q, 46), 0.3, ri * 13 + k * 5 + q), qm, false);
      }
      // the torn-off deck structure under the slab: a longitudinal girder + two or three bent frame stubs at irregular
      // spacing (a T-bar every 1.25 m reads as the rungs of a ladder from the beach)
      rb.box(M.steel, [0, -0.4, wk * 0.18], [lenK * 0.95, 0.42, 0.14], { m });
      for (let f = 0; f < 3; f++) {
        if (f === 2 && hash(ri, k, 31) < 0.5) continue;
        const at = -lenK / 2 + lenK * (0.18 + 0.32 * f + (hash(ri, k, f, 32) - 0.5) * 0.14), wf = wk * (0.45 + hash(ri, k, f, 33) * 0.4);
        const fm = m.clone().multiply(new THREE.Matrix4().makeTranslation(at, -0.24, (hash(ri, k, f, 34) - 0.5) * wk * 0.3)).multiply(new THREE.Matrix4().makeRotationX((hash(ri, k, f, 35) - 0.5) * 0.5));
        rb.box(M.steel, [0, 0, 0], [0.12, 0.3, wf], { m: fm });
      }
      // curled torn lips along both long edges + the upper end
      for (let e = 0; e < 3; e++) {
        const side = e % 2 ? 1 : -1, along = -lenK / 2 + (e + 0.5) * lenK / 3;
        const lm = m.clone().multiply(new THREE.Matrix4().makeTranslation(along, 0.02, side * wk / 2)).multiply(new THREE.Matrix4().makeRotationY(side * -Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 * side));
        rb.add(M.hull, tornStrip(0.6 + hash(ri, k, e) * 0.7, 1.0 + hash(ri, e, k) * 0.8, side * (0.9 + hash(k, e, ri) * 0.9), (hash(e, k, ri) - 0.5) * 0.5, ri * 50 + k * 7 + e), lm, false);
      }
    }
    // (no railing run along the slope — posts + a handrail make the collapsed plates read as a built stair)
    // a fallen mast / derrick boom lying beside the slope (bow) or a cargo boom across the foot (stern)
    {
      const sd = ri % 2 ? -1 : 1, o = sd * (r.w / 2 + 0.9);
      // lying low along the foot: its heel in the water/sand, its head propped on the lower slab
      const a0: V3 = [ax - dx * 6 + px * (o + sd * 2.5), ay - 0.5, az - dz * 6 + pz * (o + sd * 2.5)], a1: V3 = [ax + (bx - ax) * 0.3 + px * o, ay + (by - ay) * 0.3 - 0.35, az + (bz - az) * 0.3 + pz * o];
      rb.cyl(M.mast, a0, a1, 0.3, 12, { r1: 0.22 });
      for (const t of [0.25, 0.55]) { const c: V3 = [a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t, a0[2] + (a1[2] - a0[2]) * t]; rb.box(M.mast, [c[0], c[1], c[2]], [0.25, 0.25, 2.2 + t * 1.5], { rotY: yaw + 0.3 }); }
      rb.tube(M.black, [a1, [a1[0] + dx, a1[1] - 1.2, a1[2] + dz], [a1[0] + dx * 1.6 + px * 0.5, ay - 0.5, a1[2] + dz * 1.6 + pz * 0.5]], 0.04, 5, { samples: 8 });
    }
    // loose plates + a coil of cable at the foot
    for (let k = 0; k < 5; k++) {
      const t = -0.04 - hash(ri, k, 9) * 0.1, sd = (hash(ri, k, 10) - 0.5) * r.w * 1.8;
      const m = new THREE.Matrix4().makeTranslation(ax + (bx - ax) * t + px * sd, ay - 0.15, az + (bz - az) * t + pz * sd).multiply(new THREE.Matrix4().makeRotationY(hash(ri, k, 13) * 6)).multiply(new THREE.Matrix4().makeRotationZ((hash(ri, k, 14) - 0.5) * 0.5));
      rb.add(M.hull, tornStrip(1.2 + hash(ri, k, 11), 0.8 + hash(ri, k, 12) * 0.8, (hash(ri, k, 15) - 0.5) * 0.8, (hash(ri, k, 16) - 0.5) * 0.4, ri * 90 + k), m, false);
    }
    rb.add(M.black, new THREE.TorusGeometry(0.45, 0.06, 5, 16).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(ax - dx * 1.2 + px * r.w * 0.3, ay - 0.1, az - dz * 1.2 + pz * r.w * 0.3), false);
  });
  const ramps = rb.build("wreck-ramps", { palette: (m) => /^(wreck-steel|wreck-black|wreck-mast|wood)$/.test(m.name) });
  mergeCasters(ramps);
  w.group.add(ramps);
  w.lod?.add(ramps, { show: 450 });
  void trs;
  return out;
}
