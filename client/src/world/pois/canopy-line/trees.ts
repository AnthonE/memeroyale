// CANOPY LINE — the gigantic hero trees: fluted trunk (collider-exact radius ±5 %), buttress flanges (their top follows
// the collider staircase within ±0.15 m), a crown fork of thick bendy limbs and a huge lobed canopy built with the
// island canopy's own leaf-mass cards (veg lobedCanopy + foliage material → same look, wind and shadows as veg trees).
import * as THREE from "three";
import { type Column, groundAt, trunkR, limbLine, limbR, TRUNK_GROOVE } from "../../../../../shared/pois/canopy-line";
import { lobedCanopy } from "../../veg/species/canopy";
import { curveFrames, tube } from "../../veg/geo";
import { crownGeometry, type Clump } from "../../veg/species/crown";
import { mulberry } from "../../../../../shared/pois/canopy-line";
import { type Bins, type CanopyMats, M, col } from "./kit";

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };


/** the trunk tube in WORLD space into bins.bark. `decks` = deck heights (AO bands under them) */
export function addTrunk(bins: Bins, c: Column, decks: number[], o: { radial?: number; step?: number } = {}) {
  // hero trunk: 28 × 1.1 m is enough for the strangler-fig strands carved into the bark (they read by shading)
  const radial = o.radial ?? 28, dy = o.step ?? 1.1;
  // (parity) the tube ends at the crown fork (= the collider's top) under a cap; the limbs (shared centre lines,
  // collided) carry on out of it — no un-collided neck
  // the foot reaches under the LOWEST ground round the trunk (on the escarpment the downhill side is ~4 m below gy)
  let gMin = c.gy; for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; gMin = Math.min(gMin, groundAt(c.x + Math.cos(a) * c.r * 1.05, c.z + Math.sin(a) * c.r * 1.05)); }
  const y0 = gMin - 1.2, y1 = c.top;
  const rows = Math.ceil((y1 - y0) / dy);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], colr: number[] = [], idx: number[] = [];
  const r0 = trunkR(c, c.gy + 5);
  const circ = TAU * r0;
  // strangler-fig strands: 9 root cords wandering down the trunk, crossing each other, their
  // crests at ~1.03 r, the grooves between them carved IN to 0.93 r (the trunk stays inside its ±0.15 m collider band)
  const rs = mulberry(c.seed * 97 + 11), H = y1 - c.gy;
  const strands = Array.from({ length: 9 }, (_, k) => ({ a0: k / 9 * TAU + (rs() - 0.5) * 0.5, tw: (rs() - 0.5) * 0.5 / H * TAU, wf: 0.1 + rs() * 0.15, wp: rs() * 6, w: 0.13 + rs() * 0.08 }));
  const strandAt = (a: number, y: number) => {
    const foot = 1 - smooth(c.gy, c.gy + 9, y);
    let S = 0;
    for (const st of strands) {
      const sa = st.a0 + st.tw * (y - c.gy) + 0.22 * Math.sin(y * st.wf + st.wp);
      const d = Math.atan2(Math.sin(a - sa), Math.cos(a - sa)), w = st.w * (1 + 0.9 * foot);
      S += Math.exp(-(d / w) * (d / w));
    }
    return Math.min(1, S);
  };
  for (let i = 0; i <= rows; i++) {
    const y = y0 + (y1 - y0) * i / rows;
    for (let k = 0; k <= radial; k++) {
      const a = k / radial * TAU, ca = Math.cos(a), sa = Math.sin(a);
      // a lobed root flare at the very foot (below knee height: the collider disc stays the trunk at 1.2 / 1.7 m)
      // (parity) flared only within 0.8 m of the LOCAL ground (else the downhill side of a slope trunk flares at 1–2 m)
      const gl = groundAt(c.x + ca * r0, c.z + sa * r0);
      const fl = 0 * gl;   // (parity: no flare — any bulge past the collider band is a grazing walk-through; the flanges carry the foot)
      const S = strandAt(a, y);
      const r = r0 * (TRUNK_GROOVE + 0.001 + 0.02 * Math.sqrt(S) + 0.003 * Math.sin(a * 13 + y * 0.9) + fl);   // the strands read by shading, their relief stays inside the collider band   // grooves = the collider's inradius
      pos.push(c.x + ca * r, y, c.z + sa * r);
      nor.push(ca, 0, sa);
      uv.push(k / radial * circ / 2.6, y / 2.6);   // a 2.6 m bark tile: chunkier, stylised plates on a 5 m trunk
      // AO: dark foot, darker bands under each deck, lighter bark up the trunk, shade under the crown, deep grooves
      let ao = 0.72 + 0.28 * smooth(c.gy - 0.5, c.gy + 4, y);
      for (const d of decks) ao *= 1 - 0.34 * smooth(d - 3.6, d - 0.3, y) * (1 - smooth(d - 0.3, d + 0.2, y));
      ao *= 1 - 0.2 * smooth(c.top - 6, c.top, y);
      const ridge = 0.5 + 0.62 * S;
      // moss: a green skirt at the foot + moss filling the damp (north-west) grooves, lichen blotches on the crests
      const damp = Math.max(0, -Math.cos(a - 2.4));
      const streak = (1 - S) * (0.5 + 0.5 * damp) * (1 - smooth(c.gy + 8, c.gy + 45, y) * 0.5);
      const moss = Math.min(1, 1 - smooth(c.gy + 0.5, c.gy + 3.5, y) + streak * 0.9);
      const lich = S * smooth(0.72, 0.9, Math.sin(a * 9 + y * 1.3 + c.seed) * Math.sin(a * 4 - y * 0.7 + c.seed * 0.5)) * 0.4;
      const v0 = ao * ridge;
      colr.push(v0 * (1 - 0.45 * moss + lich * 0.3), v0 * (1 + 0.12 * moss + lich * 0.35), v0 * (1 - 0.58 * moss + lich * 0.25));
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < rows; i++) for (let k = 0; k < radial; k++) { const a = i * stride + k; idx.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  bins.bark.add(g, null, 0xd9cdbd);
  { const cap = new THREE.CircleGeometry(r0 * 1.02, radial); cap.rotateX(-Math.PI / 2); cap.translate(c.x, y1, c.z); bins.bark.add(cap, null, 0x9a8f80); }   // a deeper grey-brown (lighter bare trunks read as pale striped pillars)
}

/** buttress flanges: lofted fins whose top runs straight from `h` at the trunk to the ground at the tip */
export function addFlanges(bins: Bins, c: Column) {
  const R = trunkR(c, c.gy);
  for (const f of c.flanges) {
    const n = 8, ca = Math.cos(f.a), sa = Math.sin(f.a), px = -sa, pz = ca;
    const r0 = R * 0.8, span = f.len + (R - r0);
    const secs: Array<Array<[number, number, number]>> = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, d = r0 + span * t;
      const cx = c.x + ca * d, cz = c.z + sa * d;
      // top follows the collider staircase's mid-points (straight slope), rounded crest; tapers toward the tip
      const top = c.gy + f.h * (1 - t) + 0.05, bot = Math.min(groundAt(cx, cz), top - 0.1) - 0.5;
      const th = f.th * (1 - 0.4 * t) * 0.5 * (1 + 0.15 * Math.sin(t * 5 + f.a * 3));
      // the blade sways sideways a little (organic), never out of its collider (≤ 5 cm)
      const sw = 0.05 * Math.sin(t * Math.PI);
      const ring: Array<[number, number, number]> = [];
      for (const [u, v] of [[-1, 0], [-1, 0.72], [-0.55, 0.93], [0, 1], [0.55, 0.93], [1, 0.72], [1, 0]]) {
        const y = bot + (top - bot) * v - (v > 0.9 ? 0 : 0), w = th * u * (v > 0.95 ? 0.4 : 1);
        ring.push([cx + px * (w + sw), y, cz + pz * (w + sw)]);
      }
      secs.push(ring);
    }
    const pos: number[] = [], uv: number[] = [], colr: number[] = [], idx: number[] = [];
    const m = secs[0].length;
    secs.forEach((ring, i) => ring.forEach(([x, y, z], k) => {
      pos.push(x, y, z); uv.push((i / n) * span / 1.6, (k / (m - 1)) * 2.2);
      const ao = 0.62 + 0.38 * smooth(c.gy - 0.6, c.gy + f.h * 0.8, y);
      colr.push(ao * 0.92, ao, ao * 0.82);
    }));
    for (let i = 0; i < n; i++) for (let k = 0; k < m - 1; k++) { const a = i * m + k, b = a + m; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    // tip cap
    const last = n * m;
    for (let k = 1; k < m - 1; k++) idx.push(last, last + k + 1, last + k);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // (the loft winds either way with the flange angle: two-sided lighting comes from the normals' recompute; make the
    // winding outward by checking the first quad)
    bins.bark.add(g, null, 0xffffff);
  }
}

export interface Crown { mesh: THREE.Mesh; tris: number }

/** crown fork limbs (bark bin, world space) + the branchlets (soft twig bin) + the clumped canopy (its own mesh, object
 *  space at the trunk top).
 *  The crown is built
 *  FROM the branches, like veg's canopy trees: every collided main limb (shared centre line) forks into 2 secondaries at
 *  45–65 % of its length and carries on as a tertiary; every branch tip ends INSIDE a leaf clump hung round it (the tip
 *  sits in the clump's lower third), a cap of clumps closes the top. Only the thick crotch shows under the leaves. */
export function addCrown(bins: Bins, c: Column, mats: CanopyMats, variant: number): Crown | null {
  if (!c.crown) return null;
  const base = new THREE.Vector3(c.x, c.top, c.z);
  const cR = c.crown.rx, ry = c.crown.ry;
  const cc = new THREE.Vector3(0, c.crown.y - c.top, 0);
  const rs = mulberry(c.seed * 131 + 5);
  const clumps: Clump[] = [];
  const barkCol = (t: number): [number, number, number] => { const a = 0.86 - 0.12 * t; return [a, a * 0.97, a * 0.9]; };
  /** a soft branch from `a` to `b` with a lazy bend, radius r0 → r1 */
  const branch = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sag: number, radial: number) => {
    const d = b.clone().sub(a), L = d.length(), side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    const pts = [a.clone(), a.clone().addScaledVector(d, 0.35).addScaledVector(side, (rs() - 0.5) * L * 0.12).add(new THREE.Vector3(0, -sag * L * 0.05, 0)), a.clone().addScaledVector(d, 0.7).addScaledVector(side, (rs() - 0.5) * L * 0.1).add(new THREE.Vector3(0, sag * L * 0.04, 0)), b.clone()];
    const fr = curveFrames(pts, Math.max(4, Math.round(L / 1.1)));
    bins.twig.add(tube(fr, { radial, radius: (t) => r0 + (r1 - r0) * Math.pow(t, 0.8), v: (_t, dd) => dd / 1.6, uRepeat: 1, color: barkCol, capTop: true }), null, 0xd9cdbd);
  };
  for (const l of c.limbs) {
    // the loft follows every 3rd sample of the shared centre line (the curve between them deviates < 2 cm)
    const line = limbLine(l).filter((_q, i, arr) => i % 3 === 0 || i === arr.length - 1), pts = line.map((q) => new THREE.Vector3(...q.p));
    const fr = curveFrames(pts, pts.length - 1);
    // the collided main limb: the trunk's bark tint carried on (no pale grey pole), a swollen crotch at the trunk
    const g = tube(fr, { radial: 10, radius: (t) => limbR(l, t) * (1 + 0.18 * (1 - smooth(0, 0.18, t)) + 0.04 * Math.sin(t * 17 + c.seed)), v: (_t, d) => d / 2.6, uRepeat: 2, color: (t) => barkCol(t * 0.6), capTop: true });
    bins.bark.add(g, null, 0xd9cdbd);
    const tip = pts[pts.length - 1].clone(), out = new THREE.Vector3(tip.x - c.x, 0, tip.z - c.z).normalize();
    // the tertiary: the limb carries on up and out, deep into its clump
    const t3 = tip.clone().addScaledVector(out, cR * 0.08).add(new THREE.Vector3(0, cR * 0.1, 0));
    branch(tip, t3, limbR(l, 1) * 0.95, 0.07, 0, 6);
    const rT = cR * (0.27 + rs() * 0.05);
    clumps.push({ p: t3.clone().addScaledVector(out, rT * 0.05).add(new THREE.Vector3(0, rT * 0.2, 0)).sub(base), r: rT });
    // 2 secondaries off the limb at 45–65 % of its length, fanning sideways and up
    for (const sd of [-1, 1]) {
      const u = 0.45 + rs() * 0.2, k = Math.min(line.length - 1, Math.round(u * (line.length - 1))), p0 = new THREE.Vector3(...line[k].p);
      const yaw = Math.atan2(out.z, out.x) + sd * (0.55 + rs() * 0.3), dist = cR * (0.24 + rs() * 0.08);
      const e = p0.clone().add(new THREE.Vector3(Math.cos(yaw) * dist, cR * (0.16 + rs() * 0.1), Math.sin(yaw) * dist));
      branch(p0, e, limbR(l, u) * 0.62, 0.06, 1, 7);
      const r = cR * (0.22 + rs() * 0.06);
      clumps.push({ p: e.clone().add(new THREE.Vector3(0, r * 0.25, 0)).sub(base), r });
    }
  }
  // the crown cap: clumps closing the top over the fork (the lit dome the plane sees)
  const nTop = 4, ph = rs() * TAU;
  for (let k = 0; k < nTop; k++) { const a = ph + k / nTop * TAU, rr = cR * 0.2; clumps.push({ p: new THREE.Vector3(Math.cos(a) * rr, cR * (0.6 + rs() * 0.08), Math.sin(a) * rr), r: cR * (0.3 + rs() * 0.04) }); }
  clumps.push({ p: new THREE.Vector3(0, cR * 0.74, 0), r: cR * 0.28 });
  // small satellites bulging out of the big clumps' outer / upper side (a lumpy cloud, dark gaps, never a ball)
  for (const q of clumps.slice()) {
    const o2 = q.p.clone().sub(cc); o2.y = o2.y * 0.5 + ry * 0.25; o2.normalize();
    const d = o2.add(new THREE.Vector3(rs() - 0.5, (rs() - 0.3) * 0.8, rs() - 0.5).multiplyScalar(1.1)).normalize();
    clumps.push({ p: q.p.clone().addScaledVector(d, q.r * 0.78), r: q.r * (0.38 + rs() * 0.14), hull: 0 });
  }
  const geo = crownGeometry(clumps, { seed: 4400 + c.seed, c: cc, rx: cR, ry, density: 0.06, size: [2.1, 3.3], radial: 0.34, hull: 1, hullK: 0.74, hullUV: [0.5, 0.5, 0.4], squash: 0.8, aoMin: 0.34, lobeNormal: 0.7 });
  const fm = mats.leaves[variant % mats.leaves.length];
  const mesh = new THREE.Mesh(geo, fm.mat);
  mesh.customDepthMaterial = fm.depth;
  mesh.position.copy(base);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = `canopy:crown:${c.id}:foliage`;   // (parity: leaves are soft — you glide through a crown)
  mesh.userData.castShadow = true;
  geo.computeBoundingSphere();
  mesh.updateMatrixWorld(true);
  void lobedCanopy;
  return { mesh, tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 };
}

/** bark tint for logs / posts */
export const BARK = col("#b9ab98");
void M;
