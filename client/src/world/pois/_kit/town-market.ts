// poi-town MANGO MARKET dressing kit: market stalls under striped canopies heaped with glossy mangoes and chunky
// bananas, slatted wooden + ribbed plastic crates, crate stacks, a handcart, retro-style scooters, planter boxes, pots,
// benches, lamp posts, string lights, bunting, rooftop water tanks (plastic / galvanised / big tank on a timber stand /
// timber water tower), AC units, sacks and baskets. Everything goes into the shared TownBins (one merged mesh per
// material); colours are baked per vertex (contact AO, grime, fruit ripeness gradients, painted-wood tone variation).
// Conventions: `at` = WORLD matrix of the prop's ground-contact origin; local +z = FRONT (customer side), +y up, metres.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { LabEnv } from "./town-lab";
import type { TownBins } from "./town-materials";
import { M, col, chamferBoxGeo, cylGeo, latheGeo, tubeGeo, catenary, boxProjectUV, combine, detail, segs, type ColorFn } from "./town-geo";
import { fruitSink, fruitMound } from "./town-fruit";

const DEG = Math.PI / 180, TAU = Math.PI * 2;
type Mat = THREE.Matrix4;
type Rng = () => number;
type C = string | THREE.Color;
type Bin = TownBins["wood"];

// ======================================================================================================= utilities
const T = (at: Mat, x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx): Mat => at.clone().multiply(M(x, y, z, yaw, pitch, roll, sx, sy, sz));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const sstep = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pick = <V>(rng: Rng, a: V[]): V => a[Math.floor(rng() * a.length) % a.length];
const tone = (c: C, rng: Rng, amt = 0.08) => col(c, 1 + (rng() - 0.5) * 2 * amt);
const uvr = (rng: Rng): [number, number] => [rng() * 3, rng() * 3];
const h3 = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (dx: number, dy: number, dz: number) => h3(xi + dx, yi + dy, zi + dz);
  return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v), lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
/** colour fn evaluated in the LOCAL frame of `m` (GeoBin hands the fn world-space positions) */
function local(m: Mat, fn: (x: number, y: number, z: number, o: THREE.Color) => void): ColorFn {
  const inv = m.clone().invert(), v = new THREE.Vector3();
  return (x, y, z, _b, o) => { v.set(x, y, z).applyMatrix4(inv); fn(v.x, v.y, v.z, o); };
}
/** contact AO in the prop frame (local y = 0 is the ground) + soft world-space mottling (hand-painted variation) */
function grime(at: Mat, h = 0.4, k = 0.62, mottle = 0.08, freq = 3.1): ColorFn {
  const inv = at.clone().invert(), v = new THREE.Vector3();
  return (x, y, z, _b, o) => {
    v.set(x, y, z).applyMatrix4(inv);
    o.multiplyScalar((k + (1 - k) * sstep(0, h, v.y)) * (1 + mottle * (vnoise(x * freq, y * freq, z * freq) - 0.5) * 2));
  };
}
function ramp(stops: Array<[number, THREE.Color]>, v: number, o: THREE.Color) {
  if (v <= stops[0][0]) { o.copy(stops[0][1]); return; }
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; o.copy(ca).lerp(cb, (v - a) / (b - a)); return; }
  o.copy(stops[stops.length - 1][1]);
}
const cache = new Map<string, THREE.BufferGeometry>();
// (keyed by the detail mode too: a geometry first built inside `lowDetail` must not be reused at full detail)
const cached = (k0: string, make: () => THREE.BufferGeometry) => { const k = detail() + ":" + k0; let g = cache.get(k); if (!g) cache.set(k, (g = make())); return g; };

/** LatheGeometry via latheGeo with the seam + axis normals fixed (no vertical seam line, no star at the poles) */
function lathe(profile: Array<[number, number]>, seg = 24): THREE.BufferGeometry {
  const g = latheGeo(profile, seg), n = profile.length, nor = g.attributes.normal as THREE.BufferAttribute;
  seg = segs(seg); // latheGeo already applied the detail mode's segment count
  for (let j = 0; j < n; j++) {
    const a = j, b = seg * n + j;
    const x = nor.getX(a) + nor.getX(b), y = nor.getY(a) + nor.getY(b), z = nor.getZ(a) + nor.getZ(b), l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(a, x / l, y / l, z / l); nor.setXYZ(b, x / l, y / l, z / l);
    if (profile[j][0] < 1e-4) {
      const up = j === n - 1 ? profile[j][1] >= profile[j - 1][1] : j === 0 ? profile[j][1] >= profile[1][1] : true;
      for (let i = 0; i <= seg; i++) nor.setXYZ(i * n + j, 0, up ? 1 : -1, 0);
    }
  }
  return g;
}
/** a side-profile shape (x, y) extruded along z (centred) with a soft round bevel and smooth normals — the "toy" panel */
function puffy(shape: THREE.Shape, depth: number, bevel: number, seg = 3, curveSeg = 8): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: detail() ? seg : 1, curveSegments: detail() ? curveSeg : Math.max(2, curveSeg >> 2), steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute("uv"); g.deleteAttribute("normal");
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return boxProjectUV(g, 1);
}
function roundRect(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape(), x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
/** sphere with merged seams (smooth), metre UVs */
const ball = (seg = 10, rings = 7) => cached(`ball${seg}.${rings}`, () => {
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, segs(seg, 5), segs(rings, 3));
  g.deleteAttribute("uv"); g.deleteAttribute("normal"); g = mergeVertices(g); g.computeVertexNormals();
  return boxProjectUV(g, 1);
});
const cyl = (seg: number) => cached(`cyl${seg}`, () => cylGeo(1, 1, 1, seg));
/** a unit cylinder along +y (0..1) scaled into a rod from a to b (local coords of `at`) */
function rod(bin: Bin, at: Mat, a: THREE.Vector3, b: THREE.Vector3, r: number, color: C, seg = 8, fn?: ColorFn) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
  bin.add(cyl(seg), at.clone().multiply(m), col(color), fn);
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** vertical timber with the plank grain running up it: a chamfered box built lying along x and stood on end */
function post(bin: Bin, w: number, h: number, d: number, m: Mat, c: C, bevel = 0.015, fn?: ColorFn, uv: [number, number] = [0, 0]) {
  bin.add(chamferBoxGeo(h, w, d, bevel, uv), m.clone().multiply(M(0, 0, 0, 0, 0, Math.PI / 2)), col(c), fn);
}

// ======================================================================================================= fruit
const MANGO_RAMP: Array<[number, THREE.Color]> = [[0, col("#6f9e34")], [0.24, col("#b9c43a")], [0.44, col("#f8c62f")], [0.66, col("#f89a22")], [0.85, col("#f06a24")], [1, col("#d8432a")]];
/** plump asymmetric kidney-shaped mango, unit length along x (stem end −x, beak tip +x), lying on its flat side */
type Lod = 0 | 1 | 2;
function mangoGeo(v: number, lod: Lod): THREE.BufferGeometry {
  return cached(`mango${v}.${lod}`, () => {
    let g: THREE.BufferGeometry = lod === 2 ? new THREE.SphereGeometry(1, 7, 5) : lod === 1 ? new THREE.SphereGeometry(1, 8, 6) : new THREE.SphereGeometry(1, 10, 7);
    g.deleteAttribute("uv"); g.deleteAttribute("normal"); g = mergeVertices(g);
    const p = g.attributes.position as THREE.BufferAttribute, bend = 0.045 + v * 0.02, beak = 0.025 + (v % 2) * 0.02;
    for (let i = 0; i < p.count; i++) {
      const L = p.getY(i), A = p.getX(i), W = -p.getZ(i); // (x,y) swap + z flip keeps the winding outward
      const taper = 1 - 0.1 * L - 0.04 * L * L;
      const x = L * 0.5 * (1 + 0.03 * Math.max(0, W));
      const y = A * (0.34 + v * 0.012) * taper;
      let z = W * 0.4 * taper * (W < 0 ? 0.93 : 1.04);
      z += bend * (0.55 - L * L) - beak * sstep(0.3, 1, L);
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return boxProjectUV(g, 1);
  });
}
function addMango(bins: TownBins, m: Mat, rng: Rng, lod: Lod = 0, ripe = rng()) {
  const fx = fruitSink();
  if (fx) { fx.mango(m, 0.25 + ripe * 0.75, 0.92 + rng() * 0.16); return; }
  const bx = rng() * 2 - 1, by = 0.5 + rng() * 0.6, bz = rng() * 2 - 1, bl = Math.hypot(bx, by, bz);
  bins.fruit.add(mangoGeo(Math.floor(rng() * 3), lod), m, 0xffffff, local(m, (x, y, z, o) => {
    const nx = x / 0.5, ny = y / 0.3, nz = z / 0.37, l = Math.hypot(nx, ny, nz) || 1;
    const t = (nx * bx + ny * by + nz * bz) / (l * bl);
    const v = 0.44 + ripe * 0.42 + t * 0.26 - 0.12 * sstep(-0.2, -0.5, x) + 0.08 * (vnoise(x * 9, y * 9, z * 9) - 0.5);
    ramp(MANGO_RAMP, v, o);
    o.multiplyScalar(0.62 + 0.38 * sstep(-0.9, 0.35, ny / l));
  }));
}

/** chunky curved 5-sided banana finger, unit length along +x, curving up (+y); faceted-soft normals */
function bananaGeo(lod: Lod): THREE.BufferGeometry {
  return cached(`banana${lod}`, () => {
    const R = 1.5, phi = 1 / R, S = 5;
    const ts = lod ? [0, 0.16, 0.5, 0.84, 1] : [0, 0.07, 0.17, 0.34, 0.54, 0.74, 0.88, 0.96, 1];
    const rad = (lod ? [0.036, 0.1, 0.142, 0.1, 0.026] : [0.034, 0.045, 0.096, 0.134, 0.142, 0.132, 0.1, 0.058, 0.024]).map((r) => r * 1.05);
    const Cp = (t: number) => V(R * Math.sin(phi * t), R * (1 - Math.cos(phi * t)), 0);
    const Tn = (t: number) => V(Math.cos(phi * t), Math.sin(phi * t), 0);
    const dir = (t: number, a: number) => V(-Math.sin(phi * t) * Math.cos(a), Math.cos(phi * t) * Math.cos(a), Math.sin(a));
    const pos: number[] = [], nor: number[] = [];
    type P = { p: THREE.Vector3; n: THREE.Vector3 };
    const tri = (a: P, b: P, c: P) => {
      const e1 = new THREE.Vector3().subVectors(b.p, a.p), e2 = new THREE.Vector3().subVectors(c.p, a.p), fn = e1.cross(e2);
      const want = a.n.clone().add(b.n).add(c.n);
      for (const q of fn.dot(want) >= 0 ? [a, b, c] : [a, c, b]) { pos.push(q.p.x, q.p.y, q.p.z); nor.push(q.n.x, q.n.y, q.n.z); }
    };
    const soft = (corner: THREE.Vector3, face: THREE.Vector3) => corner.clone().multiplyScalar(0.42).addScaledVector(face, 0.58).normalize();
    for (let i = 0; i < ts.length - 1; i++) for (let k = 0; k < S; k++) {
      const a0 = k * TAU / S + TAU / 4, a1 = (k + 1) * TAU / S + TAU / 4, am = (k + 0.5) * TAU / S + TAU / 4;
      const q = (ti: number, a: number): P => ({ p: Cp(ts[ti]).addScaledVector(dir(ts[ti], a), rad[ti]), n: soft(dir(ts[ti], a), dir(ts[ti], am)) });
      const A = q(i, a0), B = q(i, a1), Cc = q(i + 1, a1), D = q(i + 1, a0);
      tri(A, B, Cc); tri(A, Cc, D);
    }
    // stem cut + dark pointed tip
    const e0 = Cp(0).addScaledVector(Tn(0), -0.012), e1 = Cp(1).addScaledVector(Tn(1), 0.03);
    for (let k = 0; k < S; k++) {
      const a0 = k * TAU / S + TAU / 4, a1 = (k + 1) * TAU / S + TAU / 4;
      tri({ p: Cp(0).addScaledVector(dir(0, a0), rad[0]), n: Tn(0).negate() }, { p: Cp(0).addScaledVector(dir(0, a1), rad[0]), n: Tn(0).negate() }, { p: e0, n: Tn(0).negate() });
      const last = ts.length - 1;
      tri({ p: Cp(1).addScaledVector(dir(1, a0), rad[last]), n: dir(1, a0).add(Tn(1)).normalize() }, { p: Cp(1).addScaledVector(dir(1, a1), rad[last]), n: dir(1, a1).add(Tn(1)).normalize() }, { p: e1, n: Tn(1) });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return boxProjectUV(g, 1);
  });
}
const BAN_Y = col("#f9cb2e"), BAN_G = col("#8fae34"), BAN_STEM = col("#5a4a22"), BAN_TIP = col("#35271a");
/** a hand of bananas: crown at the origin, fingers fanned across z, pointing +x and curving up (+y) */
function addHand(bins: TownBins, m: Mat, rng: Rng, n = 5, len = 0.21, green = rng() * 0.25, lod: Lod = 0) {
  const fx = fruitSink();
  if (fx) { fx.hand(T(m, 0, 0, 0, 0, 0, 0, len / 0.2), Math.max(5, Math.min(7, n + 1)), green); return; }
  const base = BAN_Y.clone().lerp(BAN_G, green * 0.3);
  bins.fruit.add(ball(6, 4), T(m, -0.018, 0.012, 0, 0, 0, 0, 0.03, 0.028, (n * 0.043) / 2 + 0.01), col("#6b6a2a"));
  for (let k = 0; k < n; k++) {
    const u = k - (n - 1) / 2, row = k % 2;
    const f = T(m, 0, row * 0.018, u * 0.041, -u * 7 * DEG + (rng() - 0.5) * 0.08, 0, (row ? 8 : 0) * DEG + (rng() - 0.5) * 0.06, len * (0.94 + rng() * 0.12));
    const g = green + (rng() - 0.5) * 0.12;
    bins.fruit.add(bananaGeo(lod), f, 0xffffff, local(f, (x, y, z, o) => {
      const t = x / 0.94;
      o.copy(base).lerp(BAN_G, clamp01(g * 0.25 + 0.8 * sstep(0.11, 0.0, t)));
      if (t < 0.06) o.lerp(BAN_STEM, sstep(0.06, 0.0, t));
      if (t > 0.93) o.lerp(BAN_TIP, sstep(0.93, 0.985, t));
      // concave (inner) side slightly darker, faint ridge freckles
      const cy = 1.5 * (1 - Math.cos(t / 1.5));
      o.multiplyScalar((y < cy ? 0.86 : 1) * (0.95 + 0.1 * vnoise(x * 30, y * 30, z * 30)));
    }));
  }
}

/** heaped fruit over a w x d (or round, w = diameter) footprint whose rim is at local y; mounded, not a flat layer */
function addHeap(bins: TownBins, at: Mat, rng: Rng, w: number, d: number, y: number, heap: number, fruit: "mango" | "banana", round = false, lod: Lod = 0) {
  const H = 0.015 + heap * Math.min(w, d) * (fruit === "mango" ? 0.42 : 0.3);
  const f01 = (x: number, z: number) => Math.max(0, round ? 1 - (x * x + z * z) / (w * w / 4) : (1 - (2 * x / w) ** 2) * (1 - (2 * z / d) ** 2));
  const surf = (x: number, z: number) => y + H * Math.pow(f01(x, z), 0.6);
  // "shadowed fruit" underlay so gaps never reveal the crate floor
  // fruit-coloured mound under the fruit: fills the gaps up close, and IS the heap from afar when the individual fruit
  // (TownLod fine tier) are culled
  // the mound is FRUIT-coloured (orange / yellow / red speckle for mangoes, yellow for bananas) and sits under two
  // layers of fruit — from afar (fruit instances culled) it still reads as a heap of fruit, never as a brown cake
  fruitMound(bins, T(at, 0, y - 0.07, 0), w / 2 * 0.95, H * 0.85 + 0.02, (round ? w : d) / 2 * 0.95, fruit, rng());
  const place = (x: number, z: number, lift: number) => {
    const yy = surf(x, z) + lift, e = 0.02;
    const gx = (surf(x + e, z) - surf(x - e, z)) / (2 * e), gz = (surf(x, z + e) - surf(x, z - e)) / (2 * e);
    return T(at, x, yy, z, 0, -Math.atan(gz) * 0.8, Math.atan(gx) * 0.8);
  };
  if (fruit === "mango") {
    // lod 2 (mid-distance stalls/crates): fewer, slightly bigger fruit — the fruit-coloured mound carries the heap
    const sp = lod === 2 ? 1.35 : 1, cw = 0.096 * sp, cd = 0.104 * sp;
    const nx = Math.max(1, Math.round(w / cw)), nz = Math.max(1, Math.round((round ? w : d) / cd)), D = round ? w : d;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let x = -w / 2 + (i + 0.5 + (j % 2 ? 0.22 : -0.22) + (rng() - 0.5) * 0.3) * w / nx;
      let z = -D / 2 + (j + 0.5 + (rng() - 0.5) * 0.25) * D / nz;
      if (round) { const r = Math.hypot(x, z), lim = w / 2 - 0.05; if (r > lim) { if (r > lim + 0.04) continue; x *= lim / r; z *= lim / r; } }
      x = Math.max(-w / 2 + 0.05, Math.min(w / 2 - 0.05, x)); z = Math.max(-D / 2 + 0.045, Math.min(D / 2 - 0.045, z));
      const s = 0.132 * (0.9 + rng() * 0.2) * (lod === 2 ? 1.12 : 1);
      addMango(bins, place(x, z, 0.014).multiply(M(0, 0, 0, rng() * TAU, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.45, s)), rng, lod);
      // second (and on full heaps a third) nested layer on the crown of the mound — the heap is fruit all the way down
      // (perf: the painted heap mound fills the gaps, so the nested layers are sparser — ~30 fruit a crate, not ~50)
      if (heap > 0.45 && f01(x, z) > 0.2 && rng() < (lod < 2 ? 0.5 : 0.3)) {
        const x2 = x + cw * 0.5 * (rng() < 0.5 ? 1 : -1), z2 = z + cd * 0.45 * (rng() < 0.5 ? 1 : -1);
        if (f01(x2, z2) > 0.15) addMango(bins, place(x2, z2, 0.045).multiply(M(0, 0, 0, rng() * TAU, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6, s)), rng, lod);
        if (heap > 0.8 && lod < 2 && f01(x, z) > 0.6 && rng() < 0.25) addMango(bins, place(x + (rng() - 0.5) * cw * 0.4, z + (rng() - 0.5) * cd * 0.4, 0.1).multiply(M(0, 0, 0, rng() * TAU, (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.7, s * 0.96)), rng, lod);
      }
    }
  } else {
    // hands of bananas laid flat, alternating direction, a second layer crowning the heap
    const D = round ? w : d, hw = lod === 2 ? 0.27 : 0.24, hd = lod === 2 ? 0.25 : 0.2;
    const nx = Math.max(1, Math.round(w / hw)), nz = Math.max(1, Math.round(D / hd));
    const lay = (x: number, z: number, lift: number, flip: boolean) => {
      const yaw = (flip ? Math.PI : 0) + (rng() - 0.5) * 0.5;
      const m = place(x, z, lift).multiply(M(-Math.cos(yaw) * 0.1, 0, Math.sin(yaw) * 0.1, yaw, 0, (rng() - 0.3) * 0.25));
      addHand(bins, m, rng, lod === 2 ? 4 + Math.floor(rng() * 2) : 4 + Math.floor(rng() * 3), 0.2 + rng() * 0.03, rng() * 0.35, lod ? 1 : 0);
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = -w / 2 + (i + 0.5) * w / nx + (rng() - 0.5) * 0.03, z = -D / 2 + (j + 0.5) * D / nz + (rng() - 0.5) * 0.03;
      if (round && Math.hypot(x, z) > w / 2 - 0.06) continue;
      lay(x, z, -0.01, (i + j) % 2 === 1);
    }
    if (heap > 0.4) { const n2 = Math.max(1, Math.round(nx * nz * (lod === 2 ? 0.35 : 0.45) * heap)); for (let k = 0; k < n2; k++) lay((rng() - 0.5) * w * 0.45, (rng() - 0.5) * D * 0.4, 0.05, rng() < 0.5); }
  }
}

// ======================================================================================================= crates
interface CrateOpts { w: number; d: number; h: number; color: C; slats?: number; bottom?: boolean; nails?: boolean; caps?: boolean }
/** slatted wooden crate (chunky corner posts, recessed side planks with gaps, overhanging rim caps, nail heads). */
function woodCrate(bins: TownBins, at: Mat, rng: Rng, o: CrateOpts): { iw: number; id: number; rim: number } {
  const { w, d, h } = o, p = Math.min(0.05, w * 0.09), t = 0.019, n = o.slats ?? 3, gap = 0.012, ch = 0.024, cw = 0.056;
  const hp = h - ch, ph = (hp - 0.01 - gap * (n - 1)) / n;
  const fn = grime(at, h * 0.9 + 0.1, 0.62, 0.1, 5);
  const base = col(o.color);
  const tn = (k = 1) => base.clone().multiplyScalar(k * (0.88 + rng() * 0.24));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(bins.wood, p, hp, p, T(at, sx * (w / 2 - p / 2), hp / 2, sz * (d / 2 - p / 2)), tn(0.78), 0.012, fn, uvr(rng));
  for (let i = 0; i < n; i++) {
    const yy = 0.01 + ph / 2 + i * (ph + gap);
    for (const s of [-1, 1]) {
      bins.wood.bbox(w - 2 * p + 0.012, ph, t, T(at, 0, yy, s * (d / 2 - t / 2 - 0.007), 0, 0, (rng() - 0.5) * 0.012), tn(), 0.006, fn, uvr(rng));
      bins.wood.bbox(t, ph, d - 2 * p + 0.012, T(at, s * (w / 2 - t / 2 - 0.007), yy, 0, 0, (rng() - 0.5) * 0.012), tn(), 0.006, fn, uvr(rng));
    }
  }
  if (o.caps !== false) for (const s of [-1, 1]) {
    bins.wood.bbox(w + 0.008, ch, cw, T(at, 0, h - ch / 2, s * (d / 2 - cw / 2 + 0.004)), tn(1.12), 0.009, fn, uvr(rng));
    bins.wood.bbox(cw, ch, d - 2 * cw + 0.016, T(at, s * (w / 2 - cw / 2 + 0.004), h - ch / 2 - 0.001, 0), tn(1.12), 0.009, fn, uvr(rng));
  }
  if (o.bottom) for (let i = 0; i < 3; i++) bins.wood.bbox(w - 2 * t - 0.02, 0.014, (d - 2 * t) / 3 - 0.012, T(at, 0, 0.012, -d / 3 + i * d / 3), tn(0.8), 0.004, fn, uvr(rng));
  if (o.nails) {
    const nail = col("#2e2a26");
    for (const s of [-1, 1]) for (const e of [-1, 1]) for (let i = 0; i < n; i++) {
      bins.metal.add(cyl(6), T(at, e * (w / 2 - p / 2), 0.01 + ph / 2 + i * (ph + gap), s * (d / 2 + 0.0015), 0, Math.PI / 2, 0, 0.0075, 0.004, 0.0075), nail);
    }
  }
  return { iw: w - 2 * (t + 0.007), id: d - 2 * (t + 0.007), rim: h };
}

/** wooden crate of fruit heaped above the rim. Default 60 x 40 x 32 cm, mangoes, heap 0.8 */
export function addFruitCrate(bins: TownBins, at: THREE.Matrix4, rng: () => number, o: { color?: string; fruit?: "mango" | "banana"; heap?: number; w?: number; d?: number; lod?: 0 | 1 | 2 } = {}): void {
  const w = o.w ?? 0.6, d = o.d ?? 0.4, h = Math.min(0.36, 0.2 + Math.min(w, d) * 0.3), lod = o.lod ?? 0;
  const c = woodCrate(bins, at, rng, { w, d, h, color: o.color ?? "#8a5a34", nails: lod === 0 });
  addHeap(bins, at, rng, c.iw, c.id, c.rim - 0.035, o.heap ?? 0.8, o.fruit ?? "mango", false, lod);
}

/** stackable ribbed plastic crate (real openings: vent bars on the long sides, handle slots on the ends). 56 x 38 x 28 */
export function addPlasticCrate(bins: TownBins, at: THREE.Matrix4, color: string, o: { fruit?: "mango" | "banana" | null; lod?: 0 | 1 | 2 } = {}): void {
  const w = 0.56, d = 0.38, h = 0.28, c = col(color), dk = col(color, 0.82), fn = grime(at, 0.3, 0.7, 0.05, 6), P = bins.plastic;
  // LOW copy: an open box (5 slabs) + its heap — 60 tris instead of ~330
  if (detail() === 0) {
    P.box(w, 0.03, d, T(at, 0, 0.015, 0), dk);
    for (const s2 of [-1, 1]) { P.box(w, h, 0.025, T(at, 0, h / 2, s2 * (d / 2 - 0.0125)), c); P.box(0.025, h, d - 0.05, T(at, s2 * (w / 2 - 0.0125), h / 2, 0), c); }
    if (o.fruit) addHeap(bins, at, Math.random, w - 0.06, d - 0.06, h - 0.035, 0.75, o.fruit, false, 2);
    return;
  }
  P.bbox(w - 0.02, 0.022, d - 0.02, T(at, 0, 0.011, 0), dk, 0.006, fn);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.bbox(0.05, h, 0.05, T(at, sx * (w / 2 - 0.025), h / 2, sz * (d / 2 - 0.025)), c, 0.014, fn);
  for (const s of [-1, 1]) {
    // long sides: top rim, bottom band, mid rail, vent bars
    P.bbox(w, 0.042, 0.03, T(at, 0, h - 0.021, s * (d / 2 - 0.015)), c, 0.01, fn);
    P.bbox(w - 0.06, 0.055, 0.022, T(at, 0, 0.05, s * (d / 2 - 0.013)), c, 0.006, fn);
    P.bbox(w - 0.06, 0.022, 0.02, T(at, 0, h * 0.56, s * (d / 2 - 0.012)), c, 0.006, fn);
    for (let i = 0; i < 6; i++) P.box(0.016, h - 0.12, 0.018, T(at, -w / 2 + 0.05 + (i + 0.5) * (w - 0.1) / 6, (h - 0.04 + 0.075) / 2, s * (d / 2 - 0.013)), c, [0, 0], fn);
    // ends: solid lower panel, handle slot above, rim bar
    P.bbox(0.024, h * 0.56, d - 0.06, T(at, s * (w / 2 - 0.013), h * 0.28 + 0.01, 0), c, 0.006, fn);
    P.bbox(0.03, 0.045, d, T(at, s * (w / 2 - 0.015), h - 0.0225, 0), c, 0.01, fn);
    P.bbox(0.026, h * 0.44 - 0.06, 0.06, T(at, s * (w / 2 - 0.013), h * 0.78 - 0.02, -d / 2 + 0.085), c, 0.006, fn);
    P.bbox(0.026, h * 0.44 - 0.06, 0.06, T(at, s * (w / 2 - 0.013), h * 0.78 - 0.02, d / 2 - 0.085), c, 0.006, fn);
  }
  if (o.fruit) addHeap(bins, at, Math.random, w - 0.06, d - 0.06, h - 0.035, 0.75, o.fruit, false, o.lod ?? 1);
}

const PLASTIC_COLS = ["#2f6fb0", "#2a9d8f", "#4c9a3b", "#d24b3a", "#f0b92e", "#3a86c8"];
/** a casual stack of n crates (wooden + plastic, some with fruit on top). Footprint ~1.2 x 0.45 */
export function addCrateStack(bins: TownBins, at: THREE.Matrix4, rng: () => number, n = 4): void {
  // LOW copy: two crate blocks + one on top (~40 tris vs ~1.2 k)
  if (detail() === 0) {
    const c1 = pick(rng, PLASTIC_COLS), c2 = pick(rng, ["#8a5a34", "#9a6b3e", "#7a5a3c"]);
    bins.plastic.box(0.58, 0.29, 0.4, T(at, -0.31, 0.145, 0), col(c1)); bins.wood.box(0.6, 0.3, 0.4, T(at, 0.31, 0.15, 0), col(c2));
    if (n > 2) bins.wood.box(0.6, 0.3, 0.4, T(at, (rng() - 0.5) * 0.3, 0.45, 0, (rng() - 0.5) * 0.2), col(c2, 0.95));
    return;
  }
  const levels: number[] = [];
  let left = n;
  while (left > 0) { const k = Math.min(left, levels.length === 0 ? 2 : levels[levels.length - 1] === 1 ? 1 : 2 - (rng() < 0.4 ? 1 : 0)); levels.push(k); left -= k; }
  let y = 0;
  for (let L = 0; L < levels.length; L++) {
    const k = levels[L], top = L === levels.length - 1;
    let hMax = 0;
    for (let i = 0; i < k; i++) {
      const x = k === 1 ? (rng() - 0.5) * 0.2 : (i - 0.5) * 0.62, m = T(at, x + (rng() - 0.5) * 0.04, y, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.1);
      if (rng() < 0.5) {
        addPlasticCrate(bins, m, pick(rng, PLASTIC_COLS), { fruit: top && rng() < 0.6 ? (rng() < 0.6 ? "mango" : "banana") : null }); hMax = Math.max(hMax, 0.28);
      } else {
        const full = top && rng() < 0.6;
        const c = woodCrate(bins, m, rng, { w: 0.6, d: 0.4, h: 0.3, color: pick(rng, ["#8a5a34", "#9a6b3e", "#7a5a3c", "#a07a4a"]), bottom: !full });
        if (full) addHeap(bins, m, rng, c.iw, c.id, c.rim - 0.035, 0.6, rng() < 0.6 ? "mango" : "banana", false, 1);
        hMax = Math.max(hMax, 0.3);
      }
    }
    y += hMax + 0.002;
  }
}

// ======================================================================================================= stall
/** canvas sheet from z0 (back, y0) to z1 (front, y1) across x ∈ [-w/2, w/2], sagging between the rafters */
function canopyGeo(w: number, z0: number, y0: number, z1: number, y1: number, row: number, rafters: number[], zb: [number, number]): { geo: THREE.BufferGeometry; edge: (x: number, t: number) => THREE.Vector3 } {
  const xs: number[] = [], nz = detail() ? 7 : 2;
  const ex = [-w / 2, ...rafters, w / 2];
  for (let b = 0; b < ex.length - 1; b++) { const n = Math.max(2, Math.round((ex[b + 1] - ex[b]) / (detail() ? 0.14 : 0.5))); for (let i = 0; i < n; i++) xs.push(ex[b] + (ex[b + 1] - ex[b]) * i / n); }
  xs.push(w / 2);
  const sagX = (x: number) => {
    if (x < rafters[0]) return 0.07 * (rafters[0] - x) / (rafters[0] + w / 2);
    if (x > rafters[rafters.length - 1]) return 0.07 * (x - rafters[rafters.length - 1]) / (w / 2 - rafters[rafters.length - 1]);
    for (let i = 0; i < rafters.length - 1; i++) if (x <= rafters[i + 1]) return 0.035 * Math.sin(Math.PI * (x - rafters[i]) / (rafters[i + 1] - rafters[i]));
    return 0;
  };
  const edge = (x: number, t: number) => {
    const z = lerp(z0, z1, t), yb = lerp(y0, y1, t);
    const zt = (z - zb[0]) / (zb[1] - zb[0]), belly = (zt > 0 && zt < 1 ? 0.6 * Math.sin(Math.PI * zt) : 0) + (zt > 1 ? 0.5 * (zt - 1) : 0);
    return V(x, yb - sagX(x) * (1 + belly), z);
  };
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (const x of xs) { const t = j / nz, p = edge(x, t); pos.push(p.x, p.y, p.z); uv.push((x + w / 2) * 0.5, (row + 0.15 + 0.7 * t) / 6); }
  const nx = xs.length;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  if ((g.attributes.normal as THREE.BufferAttribute).getY(0) < 0) { const a = idx.slice(); for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.setIndex(a); g.computeVertexNormals(); }
  return { geo: g, edge };
}
/** scalloped valance hanging from a top-edge curve top(s), s ∈ [0, len]; one tongue per stripe (25 cm) */
function valanceGeo(top: (s: number) => THREE.Vector3, len: number, h: number, row: number, u0: number, out: THREE.Vector3): THREE.BufferGeometry {
  const sc = 0.25, n = Math.max(2, Math.round(len / sc * (detail() ? 6 : 2))), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = len * i / n, p = top(s), ph = ((u0 + s) / sc) % 1, hh = h * (0.68 + 0.32 * Math.sin(Math.PI * (ph < 0 ? ph + 1 : ph)) ** 0.7);
    const wob = 0.012 * Math.sin((u0 + s) * 9.0);
    pos.push(p.x, p.y, p.z, p.x + out.x * (0.035 + wob), p.y - hh, p.z + out.z * (0.035 + wob));
    uv.push((u0 + s) * 0.5, (row + 0.82) / 6, (u0 + s) * 0.5, (row + 0.82 - 0.55 * hh / h) / 6);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const finialGeo = () => cached("finial", () => lathe([[0, 0], [0.05, 0], [0.036, 0.02], [0.03, 0.04], [0.047, 0.066], [0.034, 0.096], [0, 0.11]], 8));

/** market stall: timber frame with turned pole caps, sloped striped canopy (sags between rafters, scalloped valances),
 *  tilted display table with three heaped trays, lower shelf with crates, hanging banana bunch. Default w 2.6, depth ~1.9 */
export function addStall(bins: TownBins, at: THREE.Matrix4, rng: () => number, o: { stripe?: number; fruit?: "mango" | "banana" | "mixed"; w?: number; lod?: 0 | 1 | 2 } = {}): void {
  if (o.lod === 2) { addStallLow(bins, at, rng, o); return; }
  const w = o.w ?? 2.6, row = Math.max(0, Math.min(5, Math.round(o.stripe ?? 1))), fruit = o.fruit ?? "mango";
  const zf = 0.55, zb = -0.75, yF = 2.12, yB = 2.42, slope = (yB - yF) / (zf - zb);
  const yR = (z: number) => yB - slope * (z - zb);
  const px = w / 2 - 0.06, WOOD = "#95673b", BEAM = "#6e4a2a";
  const fn = grime(at, 0.9, 0.6, 0.12, 2.3);
  // posts on flat stone feet, finials above the canvas
  for (const sx of [-1, 1]) for (const z of [zf, zb]) {
    const top = yR(z) + 0.1;
    post(bins.wood, 0.09, top, 0.09, T(at, sx * px, top / 2, z), tone(WOOD, rng), 0.016, fn, uvr(rng));
    bins.stone.bbox(0.17, 0.05, 0.17, T(at, sx * px, 0.025, z, rng() * 0.3), tone("#bfb29a", rng), 0.015);
    bins.wood.add(finialGeo(), T(at, sx * px, top - 0.004, z), tone("#7a4f2c", rng));
    bins.rope.add(cyl(8), T(at, sx * px, yR(z) - 0.035, z, 0, 0, 0, 0.056, 0.05, 0.056), col("#cdb98a"));
  }
  // beams (front/back) + rafters that carry the canvas; knee braces
  for (const z of [zf, zb]) bins.woodDark.bbox(w - 0.02, 0.11, 0.075, T(at, 0, yR(z) - 0.1, z), tone(BEAM, rng), 0.014, fn, uvr(rng));
  const rafters = [-px + 0.09, 0, px - 0.09], zr0 = zb - 0.12, zr1 = zf + 0.42, rl = Math.hypot(zr1 - zr0, slope * (zr1 - zr0));
  for (const x of rafters) bins.woodDark.bbox(0.055, 0.075, rl, T(at, x, yR((zr0 + zr1) / 2) - 0.04, (zr0 + zr1) / 2, 0, Math.atan(slope)), tone(BEAM, rng), 0.012, fn, uvr(rng));
  for (const sx of [-1, 1]) bins.woodDark.bbox(0.05, 0.05, 0.42, T(at, sx * (px - 0.14), yR(zf) - 0.28, zf, Math.PI / 2 * 0, 0, sx * 45 * DEG), tone(BEAM, rng), 0.01);
  // canvas + valances
  const cz0 = zb - 0.16, cz1 = zf + 0.46, cw = w + 0.24;
  const can = canopyGeo(cw, cz0, yR(cz0) + 0.012, cz1, yR(cz1) + 0.012, row, rafters, [zb, zf]);
  bins.stripes.add(can.geo, at, 0xffffff, local(at, (x, y, z, c) => c.multiplyScalar(0.92 + 0.08 * sstep(yF - 0.2, yB, y))));
  bins.stripes.add(valanceGeo((s) => can.edge(-cw / 2 + s, 1), cw, 0.26, row, 0, V(0, 0, 1)), at, 0xffffff);
  for (const sx of [-1, 1]) {
    const L = Math.hypot(cz1 - cz0, yR(cz0) - yR(cz1));
    bins.stripes.add(valanceGeo((s) => can.edge(sx * cw / 2, sx > 0 ? s / L : 1 - s / L), L, 0.2, row, 0.125, V(sx, 0, 0)), at, 0xffffff);
  }
  // display table: tilted plank top, aprons, legs, lower shelf
  const tw = w - 0.36, td = 0.78, tz = 0.26, tyB = 0.88, tyF = 0.8, tilt = Math.atan((tyB - tyF) / td), tyc = (tyB + tyF) / 2;
  bins.wood.bbox(tw, 0.045, td, T(at, 0, tyc, tz, 0, tilt), tone("#a9773f", rng), 0.012, fn, uvr(rng));
  for (const s of [-1, 1]) {
    bins.woodDark.bbox(tw - 0.06, 0.12, 0.03, T(at, 0, tyc - 0.08 + s * 0.035 * -1, tz + s * (td / 2 - 0.04)), tone(BEAM, rng), 0.008, fn, uvr(rng));
    bins.woodDark.bbox(0.03, 0.1, td - 0.1, T(at, s * (tw / 2 - 0.06), tyc - 0.08, tz, 0, tilt), tone(BEAM, rng), 0.008, fn, uvr(rng));
    for (const e of [-1, 1]) {
      const lz = tz + e * (td / 2 - 0.07), lh = lerp(tyB, tyF, (lz - (tz - td / 2)) / td) - 0.03;
      post(bins.woodDark, 0.065, lh, 0.065, T(at, s * (tw / 2 - 0.1), lh / 2, lz), tone(BEAM, rng), 0.012, fn, uvr(rng));
    }
  }
  bins.wood.bbox(tw - 0.2, 0.03, td - 0.16, T(at, 0, 0.2, tz), tone("#8e643a", rng), 0.008, fn, uvr(rng));
  // three display trays on the table (plain bevelled trays; fruit heaped above the rim)
  const trays = fruit === "mixed" ? ["mango", "banana", "mango"] as const : fruit === "banana" ? ["banana", "mango", "banana"] as const : ["mango", "mango", "mango"] as const;
  const trW = (tw - 0.12) / 3 - 0.03, trD = td - 0.16, trH = 0.12;
  for (let i = 0; i < 3; i++) {
    const m = T(at, -tw / 2 + 0.06 + (i + 0.5) * (tw - 0.12) / 3, tyc + 0.022, tz + 0.02, (rng() - 0.5) * 0.04, tilt);
    const tc = tone(pick(rng, ["#7a4e2c", "#8a5a34", "#6f4a2c"]), rng), tf = grime(m, 0.12, 0.7, 0.1, 6);
    for (const s of [-1, 1]) {
      bins.wood.bbox(trW, trH, 0.022, T(m, 0, trH / 2, s * (trD / 2 - 0.011)), tc, 0.007, tf, uvr(rng));
      bins.wood.bbox(0.022, trH, trD - 0.044, T(m, s * (trW / 2 - 0.011), trH / 2, 0), tc.clone().multiplyScalar(0.9), 0.007, tf, uvr(rng));
    }
    addHeap(bins, m, rng, trW - 0.044, trD - 0.044, trH - 0.025, trays[i] === "mango" ? 0.85 : 0.55, trays[i], false, o.lod ?? 1);
  }
  // under the table: a crate of fruit in the shade + a sack by the back post
  woodCrate(bins, T(at, -tw / 4, 0.215, tz, (rng() - 0.5) * 0.2), rng, { w: 0.56, d: 0.38, h: 0.28, color: "#8a6444", slats: 2, caps: false, bottom: true });
  const sackYaw = rng() * TAU;
  if (detail()) addSack(bins, T(at, -px + 0.3, 0, zb + 0.3, sackYaw), rng);
  // hanging banana bunch from the front beam
  if (fruit !== "mango") {
    const hx = px * 0.55 * (rng() < 0.5 ? 1 : -1), hy = yR(zf) - 0.16;
    rod(bins.rope, at, V(hx, hy - 0.26, zf + 0.06), V(hx, hy, zf + 0.04), 0.008, "#cdb98a", 5);
    const top = T(at, hx, hy - 0.26, zf + 0.06);
    bins.woodDark.add(cyl(6), T(top, 0, -0.26, 0, 0, 0, 0, 0.022, 0.3, 0.022), col("#5d5a26"));
    for (let k = 0; k < 3; k++) addHand(bins, T(top, 0, -0.08 - k * 0.09, 0, k * 2.2 + rng() * 0.5, 0, 0).multiply(M(0.035, 0, 0, 0, 0, 55 * DEG)), rng, 4 + (k % 2), 0.19, 0.25, 1);
  }
}

/** the stall's LOW copy (drawn 13–60 m): the same silhouette in ~350 tris — box posts / beams / table, the same
 *  sagging striped canopy (fewer segments) + a front valance, three flat trays with their painted heap mounds */
function addStallLow(bins: TownBins, at: THREE.Matrix4, rng: () => number, o: { stripe?: number; fruit?: "mango" | "banana" | "mixed"; w?: number }): void {
  const w = o.w ?? 2.6, row = Math.max(0, Math.min(5, Math.round(o.stripe ?? 1))), fruit = o.fruit ?? "mango";
  const zf = 0.55, zb = -0.75, yF = 2.12, yB = 2.42, slope = (yB - yF) / (zf - zb);
  const yR = (z: number) => yB - slope * (z - zb);
  const px = w / 2 - 0.06;
  for (const sx of [-1, 1]) for (const z of [zf, zb]) { const top = yR(z) + 0.1; bins.wood.box(0.09, top, 0.09, T(at, sx * px, top / 2, z), col("#95673b")); }
  for (const z of [zf, zb]) bins.woodDark.box(w - 0.02, 0.11, 0.075, T(at, 0, yR(z) - 0.1, z), col("#6e4a2a"));
  const cz0 = zb - 0.16, cz1 = zf + 0.46, cw = w + 0.24;
  const can = canopyGeo(cw, cz0, yR(cz0) + 0.012, cz1, yR(cz1) + 0.012, row, [-px + 0.09, px - 0.09], [zb, zf]);
  bins.stripes.add(can.geo, at, 0xffffff);
  bins.stripes.add(valanceGeo((s2) => can.edge(-cw / 2 + s2, 1), cw, 0.26, row, 0, V(0, 0, 1)), at, 0xffffff);
  const tw = w - 0.36, td = 0.78, tz = 0.26, tyc = 0.84, tilt = Math.atan(0.08 / td);
  bins.wood.box(tw, 0.05, td, T(at, 0, tyc, tz, 0, tilt), col("#a9773f"));
  bins.woodDark.box(tw - 0.06, 0.5, td - 0.12, T(at, 0, tyc - 0.3, tz), col("#6e4a2a"));
  const trays = fruit === "mixed" ? ["mango", "banana", "mango"] as const : fruit === "banana" ? ["banana", "mango", "banana"] as const : ["mango", "mango", "mango"] as const;
  const trW = (tw - 0.12) / 3 - 0.03, trD = td - 0.16;
  for (let i = 0; i < 3; i++) {
    const m = T(at, -tw / 2 + 0.06 + (i + 0.5) * (tw - 0.12) / 3, tyc + 0.022, tz + 0.02, 0, tilt);
    bins.wood.box(trW, 0.1, trD, T(m, 0, 0.05, 0), col("#7a4e2c"));
    addHeap(bins, m, rng, trW - 0.044, trD - 0.044, 0.095, trays[i] === "mango" ? 0.85 : 0.55, trays[i], false, 2);
  }
}

// ======================================================================================================= handcart
/** two-wheel wooden handcart loaded with fruit: bed centre at the origin, handles toward +x, wheels at x ≈ -0.25 */
export function addHandcart(bins: TownBins, at: THREE.Matrix4, rng: () => number): void {
  const fn = grime(at, 0.8, 0.62, 0.12, 2.5), bedY = 0.62, L = 1.3, W = 0.84, x0 = -0.72;
  const wood = "#a0703f", dark = "#5e3d22";
  // LOW copy: bed + sides + handles + two 10-sided wheels + the heap (~250 tris vs ~2.2 k)
  if (detail() === 0) {
    bins.wood.box(L, 0.05, W, T(at, x0 + L / 2, bedY, 0), col(wood));
    for (const s2 of [-1, 1]) { bins.wood.box(L, 0.2, 0.04, T(at, x0 + L / 2, bedY + 0.12, s2 * (W / 2)), col(wood, 0.9)); bins.wood.box(2.25, 0.09, 0.07, T(at, x0 + 2.25 / 2, bedY - 0.07, s2 * (W / 2 - 0.1)), col(dark)); bins.wood.add(cyl(10), T(at, x0 + 0.45, 0.36, s2 * (W / 2 + 0.08), 0, Math.PI / 2, 0, 0.36, 0.06, 0.36), col(dark)); }
    addHeap(bins, T(at, x0 + L / 2, bedY + 0.03, 0), rng, L - 0.1, W - 0.1, 0.2, 0.9, rng() < 0.5 ? "mango" : "banana", false, 2);
    return;
  }
  for (let i = 0; i < 5; i++) bins.wood.bbox(L, 0.035, W / 5 - 0.012, T(at, x0 + L / 2, bedY, -W / 2 + (i + 0.5) * W / 5), tone(wood, rng), 0.008, fn, uvr(rng));
  for (const s of [-1, 1]) {
    bins.wood.bbox(L, 0.2, 0.035, T(at, x0 + L / 2, bedY + 0.12, s * (W / 2 + 0.005)), tone(wood, rng, 0.1), 0.01, fn, uvr(rng));
    bins.woodDark.bbox(2.25, 0.09, 0.07, T(at, x0 + 2.25 / 2 - 0.02, bedY - 0.07, s * (W / 2 - 0.1)), tone(dark, rng), 0.014, fn, uvr(rng));
    bins.woodDark.add(cyl(8), T(at, x0 + 2.25 - 0.02, bedY - 0.07, s * (W / 2 - 0.1), 0, 0, Math.PI / 2, 0.032, 0.18, 0.032), col("#3b2a1c"));
    for (const px of [x0 + 0.08, x0 + L - 0.08]) post(bins.woodDark, 0.05, 0.26, 0.05, T(at, px, bedY + 0.1, s * (W / 2 + 0.03)), tone(dark, rng), 0.01, fn);
  }
  bins.wood.bbox(0.035, 0.2, W, T(at, x0 + 0.018, bedY + 0.12, 0), tone(wood, rng), 0.01, fn, uvr(rng));
  // front prop legs + axle
  for (const s of [-1, 1]) post(bins.woodDark, 0.06, bedY - 0.1, 0.06, T(at, x0 + L - 0.1, (bedY - 0.1) / 2, s * (W / 2 - 0.1), 0, 0, -6 * DEG), tone(dark, rng), 0.012, fn);
  bins.metal.add(cyl(8), T(at, -0.25, 0.36, 0, 0, Math.PI / 2, 0, 0.025, W + 0.3, 0.025), col("#3a3d40"));
  bins.woodDark.bbox(0.12, 0.2, W - 0.2, T(at, -0.25, 0.5, 0), tone(dark, rng), 0.02, fn);
  // wheels: iron tyre, wooden felloe, 10 spokes, hub
  for (const s of [-1, 1]) {
    const wm = T(at, -0.25, 0.36, s * (W / 2 + 0.1));
    bins.metal.add(cached("cartTyre", () => boxProjectUV(new THREE.TorusGeometry(0.335, 0.026, 6, 28), 1)), wm, col("#3b3a38"));
    bins.woodDark.add(cached("cartFelloe", () => boxProjectUV(new THREE.TorusGeometry(0.3, 0.03, 5, 24), 1)), T(wm, 0, 0, 0, 0, 0, 0, 1, 1, 1.2), tone(dark, rng));
    for (let k = 0; k < 10; k++) bins.woodDark.box(0.028, 0.27, 0.03, T(wm, 0, 0, 0, 0, 0, k * TAU / 10).multiply(M(0, 0.16, 0)), tone(dark, rng));
    bins.woodDark.add(lathe([[0, -0.07], [0.05, -0.07], [0.065, -0.04], [0.065, 0.04], [0.05, 0.07], [0, 0.07]], 10), T(wm, 0, 0, 0, 0, Math.PI / 2), tone(dark, rng));
    bins.metal.add(cyl(10), T(wm, 0, 0, s * 0.07, 0, Math.PI / 2, 0, 0.03, 0.02, 0.03), col("#2e2d2b"));
  }
  // load: a mango crate, a pile of banana hands, a sack
  const cm = T(at, x0 + 0.36, bedY + 0.018, -0.1, 0.12), cc = woodCrate(bins, cm, rng, { w: 0.56, d: 0.4, h: 0.3, color: "#8a5a34" });
  addHeap(bins, cm, rng, cc.iw, cc.id, cc.rim - 0.035, 0.7, "mango", false, 1);
  for (let k = 0; k < 4; k++) addHand(bins, T(at, x0 + 0.85 + (rng() - 0.5) * 0.25, bedY + 0.05 + (k > 1 ? 0.06 : 0), -0.18 + (k % 2) * 0.3, rng() * TAU, 0, (rng() - 0.5) * 0.3), rng, 5, 0.21, rng() * 0.3, 1);
  addSack(bins, T(at, x0 + 1.05, bedY + 0.018, 0.2, rng() * TAU, 0, 0, 0.85), rng);
}

// ======================================================================================================= scooter
/** chunky glossy retro-style scooter, ~1.75 m long, +x = front wheel, origin = ground centre, parked upright */
export function addScooter(bins: TownBins, at: THREE.Matrix4, color: string): void {
  const paint = col(color), fn = grime(at, 0.5, 0.72, 0.03, 2), chrome = col("#e2e6ea"), dark = col("#2c2d30"), rub = col("#1b1b1d");
  const FX = 0.66, RX = -0.52, WR = 0.22;
  // LOW copy (10–60 m, ~500 tris vs ~4 k for the medium kit): torus tyres + hub discs, the bulbous rear cowl as a
  // squashed ellipsoid, rounded leg shield + front mudguard, floorboard, seat, handlebar + headlamp
  if (detail() === 0) {
    const tyre = cached("tyreLow", () => new THREE.TorusGeometry(0.158, 0.062, 5, 12));
    const blob = cached("blobLow", () => new THREE.SphereGeometry(1, 8, 6));
    for (const x of [FX, RX]) { bins.fabric.add(tyre, T(at, x, WR, 0), rub); bins.metal.add(cyl(8), T(at, x, WR, 0, 0, Math.PI / 2, 0, 0.11, 0.1, 0.11), chrome); }
    bins.plastic.add(blob, T(at, -0.4, 0.5, 0, 0, 0, 0, 0.38, 0.24, 0.22), paint);
    bins.plastic.add(blob, T(at, 0.62, 0.36, 0, 0, 0, 0, 0.2, 0.12, 0.1), paint);
    bins.plastic.add(blob, T(at, 0.47, 0.66, 0, 0, 0, -0.25, 0.08, 0.36, 0.2), paint);
    bins.plastic.box(0.62, 0.06, 0.28, T(at, 0.08, 0.28, 0), dark);
    bins.fabric.add(blob, T(at, -0.36, 0.76, 0, 0, 0, 0, 0.3, 0.07, 0.15), col("#3a2a22"));
    bins.metal.add(cyl(6), T(at, 0.58, 1.0, 0, 0, Math.PI / 2, 0, 0.022, 0.62, 0.022), chrome);
    bins.metal.add(cyl(6), T(at, 0.55, 0.84, 0, 0, 0, -0.25, 0.03, 0.34, 0.03), chrome);
    bins.plastic.add(blob, T(at, 0.62, 0.98, 0, 0, 0, 0, 0.1, 0.09, 0.12), paint);
    return;
  }
  // wheels
  for (const [x, front] of [[FX, true], [RX, false]] as Array<[number, boolean]>) {
    const wm = T(at, x, WR, 0);
    bins.fabric.add(cached("tyre", () => boxProjectUV(new THREE.TorusGeometry(0.158, 0.062, detail() ? 8 : 4, detail() ? 22 : 9), 1)), T(wm, 0, 0, 0, 0, 0, 0, 1, 1, 0.92), rub);
    bins.metal.add(cached("rim", () => lathe([[0, -0.052], [0.04, -0.05], [0.05, -0.03], [0.09, -0.028], [0.108, -0.042], [0.116, -0.036], [0.116, 0.036], [0.108, 0.042], [0.09, 0.028], [0.05, 0.03], [0.045, 0.045], [0.035, 0.056], [0, 0.058]], 14)), T(wm, 0, 0, 0, 0, Math.PI / 2), chrome);
    for (let k = 0; k < 4; k++) bins.metal.add(cyl(6), T(wm, Math.cos(k * TAU / 4) * 0.068, Math.sin(k * TAU / 4) * 0.068, 0.034, 0, Math.PI / 2, 0, 0.01, 0.012, 0.01), col("#9aa0a6"));
    if (!front) bins.metal.add(cyl(12), T(wm, 0, 0, -0.07, 0, Math.PI / 2, 0, 0.1, 0.04, 0.1), dark);
  }
  // rear cowl (the bulbous engine cover) — side profile extruded with a big round bevel
  const cowl = new THREE.Shape();
  cowl.moveTo(-0.13, 0.37); cowl.lineTo(-0.13, 0.53); cowl.quadraticCurveTo(-0.15, 0.585, -0.32, 0.585);
  cowl.bezierCurveTo(-0.52, 0.59, -0.69, 0.57, -0.74, 0.47); cowl.quadraticCurveTo(-0.77, 0.37, -0.66, 0.35); cowl.lineTo(-0.24, 0.36); cowl.lineTo(-0.13, 0.37);
  bins.plastic.add(cached("cowl", () => puffy(cowl, 0.26, 0.075, 3, 7)), at, paint, fn);
  // floorboard + rubber strips + running-board chrome, chassis tunnel
  bins.plastic.bbox(0.62, 0.07, 0.36, T(at, 0.14, 0.235, 0), paint, 0.028, fn);
  for (let i = 0; i < 4; i++) bins.fabric.bbox(0.5, 0.01, 0.028, T(at, 0.16, 0.272, -0.105 + i * 0.07), rub, 0.004);
  for (const s of [-1, 1]) bins.metal.bbox(0.6, 0.018, 0.014, T(at, 0.14, 0.255, s * 0.183), chrome, 0.006);
  bins.metal.bbox(0.5, 0.08, 0.2, T(at, 0.12, 0.16, 0), dark, 0.03);
  // leg shield: a chunky curved band (side profile bulging forward), tapering toward the top — the toy retro-scooter front
  const band = new THREE.Shape();
  band.moveTo(0.425, 0.25); band.lineTo(0.47, 0.25); band.quadraticCurveTo(0.555, 0.62, 0.37, 0.93); band.lineTo(0.33, 0.93); band.quadraticCurveTo(0.505, 0.62, 0.425, 0.25);
  bins.plastic.add(cached("shield", () => {
    const g = puffy(band, 0.33, 0.032, 3, 10), p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (1 - 0.3 * clamp01((p.getY(i) - 0.3) / 0.65)));
    g.computeVertexNormals();
    return boxProjectUV(g, 1);
  }), at, paint, fn);
  // front neck + fork + shock, helmet fender hugging the wheel
  rod(bins.plastic, at, V(FX - 0.07, WR + 0.3, 0), V(0.49, 0.62, 0), 0.05, color, 10, fn);
  rod(bins.metal, at, V(FX - 0.06, WR + 0.3, -0.085), V(FX, WR, -0.085), 0.022, "#3a3c40", 8);
  rod(bins.metal, at, V(FX - 0.03, WR + 0.24, -0.11), V(FX + 0.01, WR + 0.06, -0.11), 0.015, "#c9ced3", 6);
  const fender = new THREE.Shape();
  fender.absarc(0, 0, 0.29, 8 * DEG, 162 * DEG, false); fender.absarc(0, 0, 0.262, 162 * DEG, 8 * DEG, true); fender.closePath();
  bins.plastic.add(cached("fender", () => puffy(fender, 0.13, 0.03, 3, 18)), T(at, FX, WR, 0), paint, fn);
  // headset (rounded "head") with a big round headlamp "eye"
  bins.plastic.add(cached("headset", () => puffy(roundRect(0.2, 0.08, 0.035), 0.12, 0.04, 3, 4)), T(at, 0.36, 0.99, 0, 0, 0, -6 * DEG), paint, fn);
  const lampM = T(at, 0.47, 1.0, 0, 0, 0, -Math.PI / 2 + 4 * DEG, 1.12);
  bins.metal.add(cached("lampBezel", () => lathe([[0, -0.03], [0.05, -0.03], [0.07, -0.01], [0.074, 0.02], [0.066, 0.03], [0.06, 0.018], [0, 0.018]], 16)), lampM, chrome);
  bins.plastic.add(cached("lampLens", () => lathe([[0.061, 0.012], [0.058, 0.02], [0.03, 0.031], [0, 0.034]], 16)), lampM, col("#fff6d8"));
  const bar = [V(0.27, 1.03, -0.35), V(0.32, 1.02, -0.16), V(0.32, 1.02, 0.16), V(0.27, 1.03, 0.35)];
  bins.metal.add(tubeGeo(bar, 0.014, 6, false, 10), at, chrome);
  for (const s of [-1, 1]) {
    rod(bins.fabric, at, V(0.265, 1.032, s * 0.3), V(0.262, 1.034, s * 0.41), 0.022, "#1d1d1f", 8);
    rod(bins.metal, at, V(0.3, 1.035, s * 0.22), V(0.36, 1.03, s * 0.36), 0.006, "#c9ced3", 4);
    rod(bins.metal, at, V(0.31, 1.03, s * 0.2), V(0.26, 1.24, s * 0.28), 0.007, "#c9ced3", 5);
    bins.metal.add(cached("mirror", () => lathe([[0, -0.012], [0.04, -0.012], [0.05, -0.004], [0.05, 0.004], [0.044, 0.01], [0, 0.012]], 12)), T(at, 0.255, 1.28, s * 0.29, 0, 0, Math.PI / 2 + 10 * DEG), chrome);
  }
  // seat (two-up saddle) + chrome grab rail + tail light
  const seat = new THREE.Shape();
  seat.moveTo(-0.14, 0.62); seat.lineTo(-0.6, 0.62); seat.quadraticCurveTo(-0.66, 0.64, -0.62, 0.7); seat.lineTo(-0.46, 0.715);
  seat.quadraticCurveTo(-0.4, 0.69, -0.3, 0.688); seat.quadraticCurveTo(-0.17, 0.69, -0.14, 0.655); seat.lineTo(-0.14, 0.62);
  bins.plastic.add(cached("seat", () => puffy(seat, 0.2, 0.045, 3, 6)), at, col("#2a211c"), fn);
  bins.metal.add(tubeGeo([V(-0.58, 0.66, -0.15), V(-0.72, 0.66, -0.13), V(-0.76, 0.66, 0), V(-0.72, 0.66, 0.13), V(-0.58, 0.66, 0.15)], 0.012, 6, false, 14), at, chrome);
  const tail = T(at, -0.815, 0.49, 0, 0, 0, Math.PI / 2 + 12 * DEG);
  bins.metal.add(cached("tailBezel", () => lathe([[0, -0.01], [0.04, -0.01], [0.046, 0.005], [0.04, 0.012], [0, 0.012]], 10)), tail, chrome);
  bins.plastic.add(cached("tailLens", () => lathe([[0.036, 0.012], [0.022, 0.024], [0, 0.028]], 10)), tail, col("#d42a1f"));
  // engine case (right) + exhaust (left), centre stand
  const eng = new THREE.Shape(); eng.absellipse(0, 0, 0.15, 0.085, 0, TAU, false, 0);
  bins.metal.add(cached("engine", () => puffy(eng, 0.07, 0.03, 2, 10)), T(at, -0.38, 0.27, 0.13, 0, 0, 8 * DEG), col("#7c8085"));
  bins.metal.add(cached("muffler", () => lathe([[0, -0.2], [0.03, -0.2], [0.055, -0.17], [0.06, -0.12], [0.06, 0.14], [0.05, 0.18], [0.02, 0.2], [0.012, 0.26], [0, 0.26]], 10)), T(at, -0.5, 0.2, -0.16, 0, 0, Math.PI / 2 + 4 * DEG), col("#8e949a"));
  for (const s of [-1, 1]) rod(bins.metal, at, V(-0.08, 0.14, s * 0.1), V(-0.02, 0.012, s * 0.13), 0.012, "#3a3c40", 5);
  bins.metal.bbox(0.05, 0.02, 0.3, T(at, -0.02, 0.012, 0), col("#3a3c40"), 0.006);
}

// ======================================================================================================= greenery
/** leaf blade pointing +z from the origin, V-folded on the midrib, drooping tip */
function leafBlade(n = 5): THREE.BufferGeometry {
  if (!detail()) n = 2;
  return cached(`leaf${n}`, () => {
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.94)), 0.75) * 0.5, y = -0.35 * t * t;
      pos.push(-w, y - w * 0.3, t, 0, y + 0.02, t, w, y - w * 0.3, t);
    }
    for (let i = 0; i < n; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return boxProjectUV(g, 1);
  });
}
function addLeaf(bins: TownBins, m: Mat, c: C, rng: Rng) {
  const base = col(c, 0.9 + rng() * 0.2), tip = base.clone().lerp(col("#c6e05a"), 0.3);
  bins.leaf.add(leafBlade(), m, 0xffffff, local(m, (x, y, z, o) => { o.copy(base).lerp(tip, sstep(0.3, 1, z)).multiplyScalar(0.7 + 0.3 * sstep(0, 0.4, z) + (Math.abs(x) < 0.05 ? 0.08 : 0)); }));
}
/** 5-petal cupped blossom in XZ facing up, radius 1 */
const blossomGeo = () => cached("blossom", () => {
  const out: Array<[number, number]> = [];
  for (let p = 0; p < 5; p++) for (const [da, r] of [[-30, 0.5], [-17, 0.92], [0, 1], [17, 0.92]] as Array<[number, number]>) { const a = (p * 72 + da) * DEG; out.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const pos: number[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length], ra = Math.hypot(a[0], a[1]), rb = Math.hypot(b[0], b[1]);
    pos.push(0, -0.05, 0, b[0], 0.28 * rb * rb, b[1], a[0], 0.28 * ra * ra, a[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return boxProjectUV(g, 1);
});
function addBlossom(bins: TownBins, m: Mat, c: C) {
  const pc = col(c), cc = col("#ffe07a");
  bins.leaf.add(blossomGeo(), m, 0xffffff, local(m, (x, y, z, o) => { o.copy(cc).lerp(pc, sstep(0.0, 0.45, Math.hypot(x, z))); }));
}
/** leafy clump (radial blades) + optional flowers, rooted at `m` (y up), radius ~r */
function addFoliage(bins: TownBins, m: Mat, rng: Rng, r: number, flowers: string[] | null, nLeaves = 12) {
  if (!detail()) nLeaves = Math.max(4, Math.round(nLeaves / 2));
  const greens = ["#3c8a2e", "#4f9d34", "#2f7a2a", "#5aa83a"];
  for (let i = 0; i < nLeaves; i++) {
    const a = i * TAU / nLeaves * 2.39996 + rng() * 0.3, up = i < nLeaves * 0.3, len = r * (up ? 0.9 : 1.1) * (0.8 + rng() * 0.4);
    addLeaf(bins, T(m, 0, 0.02, 0, a, -(up ? 55 : 20 + rng() * 25) * DEG, (rng() - 0.5) * 0.4, len * 0.55, len * 0.55, len), pick(rng, greens), rng);
  }
  if (flowers && flowers.length) {
    const n = Math.round((6 + r * 26) * (detail() ? 1 : 0.4));
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * r * 0.75, fs = r * (0.09 + rng() * 0.05) + 0.018;
      addBlossom(bins, T(m, Math.cos(a) * rr, r * 0.28 * (1 - (rr / r) ** 2) + 0.05 + rng() * 0.06, Math.sin(a) * rr, rng() * TAU, (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.7, fs), pick(rng, flowers));
    }
  }
}

const FLOWER_COLS = ["#e8402f", "#f39a2b", "#f6d23a", "#e0508f", "#fff4e6"];
/** painted wooden planter trough on feet, soil, leafy mound + flowers. Default w 1.0 */
export function addPlanterBox(bins: TownBins, at: THREE.Matrix4, rng: () => number, o: { w?: number; color?: string; flowers?: string[] } = {}): void {
  const w = o.w ?? 1.0, d = 0.38, h = 0.4, c = col(o.color ?? "#3f8f78"), fn = grime(at, 0.45, 0.6, 0.12, 4);
  // LOW copy: the painted box + soil + two leafy flowering clumps (~130 tris vs ~740)
  if (detail() === 0) {
    bins.wood.box(w, h, d, T(at, 0, h / 2, 0), c); bins.wood.box(w + 0.04, 0.03, d + 0.04, T(at, 0, h + 0.015, 0), c.clone().multiplyScalar(1.08));
    const fl = o.flowers ?? [pick(rng, FLOWER_COLS), pick(rng, FLOWER_COLS)];
    for (const x of [-w / 4, w / 4]) addFoliage(bins, T(at, x, h - 0.02, 0), rng, 0.32, fl, 5);
    return;
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(bins.wood, 0.07, h + 0.02, 0.07, T(at, sx * (w / 2 - 0.035), (h + 0.02) / 2, sz * (d / 2 - 0.035)), c.clone().multiplyScalar(0.85), 0.012, fn, uvr(rng));
  for (let i = 0; i < 3; i++) {
    const y = 0.07 + i * 0.105, pw = c.clone().multiplyScalar(0.9 + rng() * 0.2);
    for (const s of [-1, 1]) {
      bins.wood.bbox(w - 0.1, 0.095, 0.024, T(at, 0, y + 0.05, s * (d / 2 - 0.018)), pw, 0.007, fn, uvr(rng));
      bins.wood.bbox(0.024, 0.095, d - 0.1, T(at, s * (w / 2 - 0.018), y + 0.05, 0), pw, 0.007, fn, uvr(rng));
    }
  }
  for (const s of [-1, 1]) {
    bins.wood.bbox(w + 0.04, 0.03, 0.07, T(at, 0, h + 0.035, s * (d / 2 - 0.02)), c.clone().multiplyScalar(1.08), 0.01, fn, uvr(rng));
    bins.wood.bbox(0.07, 0.03, d - 0.1, T(at, s * (w / 2 - 0.02), h + 0.035, 0), c.clone().multiplyScalar(1.08), 0.01, fn, uvr(rng));
  }
  bins.woodDark.bbox(w - 0.1, 0.03, d - 0.1, T(at, 0, h - 0.03, 0), col("#3a2818"), 0.01);
  const fl = o.flowers ?? [pick(rng, FLOWER_COLS), pick(rng, FLOWER_COLS)];
  const n = Math.max(2, Math.round(w / 0.36));
  for (let i = 0; i < n; i++) addFoliage(bins, T(at, -w / 2 + (i + 0.5) * w / n + (rng() - 0.5) * 0.06, h - 0.02, (rng() - 0.5) * 0.06), rng, 0.3 + rng() * 0.06, fl, 11);
}

/** terracotta pot with a rolled rim + foot band, soil, and a leafy plant / flowering bush / nothing. size = pot height */
export function addPot(bins: TownBins, at: THREE.Matrix4, rng: () => number, o: { size?: number; plant?: "leafy" | "flowers" | "none" } = {}): void {
  const s = o.size ?? 0.45, plant = o.plant ?? "leafy";
  const tc = pick(rng, ["#c0703f", "#b8643c", "#c98a5a", "#a95a3a"]);
  // LOW copy: an 8-sided pot + one foliage clump (~90 tris vs ~320)
  if (detail() === 0) {
    bins.stone.add(cached("potLow", () => lathe([[0, 0], [0.34, 0], [0.4, 0.78], [0.47, 0.83], [0.47, 0.96], [0, 0.96]], 8)), T(at, 0, 0, 0, 0, 0, 0, s * 0.75, s, s * 0.75), col(tc));
    if (plant !== "none") addFoliage(bins, T(at, 0, s * 0.9, 0), rng, s * 1.2, plant === "flowers" ? [pick(rng, FLOWER_COLS), pick(rng, FLOWER_COLS)] : null, 5);
    return;
  }
  const prof: Array<[number, number]> = [[0, 0], [0.3, 0], [0.33, 0.012], [0.35, 0.08], [0.345, 0.1], [0.4, 0.78], [0.44, 0.8], [0.47, 0.83], [0.47, 0.96], [0.45, 1], [0.41, 1], [0.39, 0.93], [0, 0.93]];
  bins.stone.add(cached("pot", () => lathe(prof, 18)), T(at, 0, 0, 0, rng() * TAU, 0, 0, s * 0.75, s, s * 0.75), col(tc), local(T(at, 0, 0, 0, 0, 0, 0, s * 0.75, s, s * 0.75), (x, y, z, c) => {
    c.multiplyScalar((0.62 + 0.38 * sstep(0, 0.35, y)) * (y > 0.8 ? 1.1 : 1) * (0.92 + 0.16 * vnoise(x * 6, y * 6, z * 6)));
    if (y < 0.3) c.lerp(col("#e8dcc8"), 0.18 * sstep(0.3, 0.05, y) * vnoise(x * 9 + 3, y * 9, z * 9));
  }));
  bins.woodDark.add(cyl(14), T(at, 0, s * 0.9, 0, 0, 0, 0, s * 0.3, 0.02, s * 0.3), col("#3a2818"));
  if (plant === "leafy") {
    const m = T(at, 0, s * 0.9, 0);
    for (let i = 0; i < 4; i++) rod(bins.leaf, m, V(0, 0, 0), V(Math.cos(i * 1.7) * s * 0.3, s * 0.6, Math.sin(i * 1.7) * s * 0.3), 0.01, "#4a7a2a", 4);
    addFoliage(bins, m, rng, s * 1.35, null, 10);
    addFoliage(bins, T(m, 0, s * 0.35, 0, 0.7), rng, s * 1.0, null, 7);
  } else if (plant === "flowers") {
    const m = T(at, 0, s * 0.9, 0);
    for (let i = 0; i < 7; i++) bins.leaf.add(ball(7, 5), T(m, (rng() - 0.5) * s * 0.5, s * (0.15 + rng() * 0.25), (rng() - 0.5) * s * 0.5, 0, 0, 0, s * (0.24 + rng() * 0.1)), col(pick(rng, ["#3c8a2e", "#4f9d34", "#2f7a2a"])));
    addFoliage(bins, T(m, 0, s * 0.3, 0), rng, s * 0.8, [pick(rng, FLOWER_COLS), pick(rng, FLOWER_COLS)], 9);
  }
}

// ======================================================================================================= hero banana plant
/** one banana leaf blade (textured card, town:banana-leaf — the texture's alpha cuts the outline + wind tears): midrib
 *  arching up then drooping, the two halves hanging in a soft V with a vein corrugation, a slight twist. Built pointing
 *  +z from the origin; u across (0.5 = midrib), v base → tip. */
function bananaLeafGeo(L: number, Wd: number, droop: number, seed: number): THREE.BufferGeometry {
  let st = (seed * 2654435761 + 7) >>> 0;
  const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const N = detail() >= 1 ? 16 : detail() > 0 ? 10 : 7, K = detail() > 0 ? 3 : 2, pos: number[] = [], uv: number[] = [], colr: number[] = [], idx: number[] = [];
  const twist = (rnd() - 0.5) * 0.5, fold = 0.18 + rnd() * 0.12;
  const mid = (t: number) => V(0, Math.sin(t * Math.PI * 0.85) * L * 0.16 - droop * t * t * L, t * L);
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = mid(t), c2 = mid(Math.min(1, t + 0.01)), tan = V(c2.x - c.x, c2.y - c.y, c2.z - c.z).normalize();
    const tw = twist * t, ax = V(Math.cos(tw), Math.sin(tw), 0);
    for (let k = -K; k <= K; k++) {
      const u = k / K, au = Math.abs(u), w = Wd * au;
      const down = -fold * w * au - 0.012 * L * (i % 2 ? 1 : -1) * au; // V fold + alternating vein corrugation
      const p = c.clone().addScaledVector(ax, u * Wd).add(V(0, down, 0)).addScaledVector(tan, au * Wd * 0.2);
      pos.push(p.x, p.y, p.z); uv.push(0.5 + 0.5 * u, t);
      const sh = 0.82 + 0.18 * au;                              // a little AO in the fold
      colr.push(sh, sh, sh);
    }
  }
  const row = 2 * K + 1;
  for (let i = 0; i < N; i++) for (let k = 0; k < 2 * K; k++) { const a0 = i * row + k, b0 = a0 + row; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // lean the normals toward "up" so the double-sided card is lit like a curved leaf from either side
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) { const y = n.getY(i), s2 = y < 0 ? -1 : 1; const vx = n.getX(i), vy = n.getY(i) + 0.35 * s2, vz = n.getZ(i), l = Math.hypot(vx, vy, vz); n.setXYZ(i, vx / l, vy / l, vz / l); }
  return g;
}
/** hero banana plant (big foreground leaves): tapered pseudostem with dry sheaths, `n` huge torn leaves
 *  on arching petioles. `yaws` (radians, local) aims leaves; default = spread all round. Height ~h to the leaf crown. */
export function addBananaPlant(bins: TownBins, at: THREE.Matrix4, rng: () => number, o: { h?: number; n?: number; leaf?: number; yaws?: number[]; pitch?: number } = {}): void {
  const h = o.h ?? 1.6, n = o.yaws?.length ?? o.n ?? 7, L = o.leaf ?? 1.8;
  bins.leaf.add(cylGeo(0.07, 0.13, h, 12), T(at, 0, h / 2, 0), col("#7fa33a"), local(at, (x, y, z, c) => c.lerp(col("#6a5a2a"), 0.5 * sstep(h * 0.5, 0, y)).multiplyScalar(0.8 + 0.3 * vnoise(x * 20, y * 5, z * 20))));
  for (let i = 0; i < 3; i++) { const a = rng() * TAU; bins.leaf.add(cached("sheath", () => { const g = new THREE.PlaneGeometry(0.16, 0.7, 1, 4); g.translate(0, 0.35, 0); return g; }), T(at, Math.cos(a) * 0.11, h * (0.1 + rng() * 0.3), Math.sin(a) * 0.11, -a + Math.PI / 2, 0, (rng() - 0.5) * 0.4), col("#8a6a36"), undefined); }
  for (let i = 0; i < n; i++) {
    const yaw = o.yaws ? o.yaws[i] : i * TAU / n * 1.618 + rng() * 0.4, pitch = (o.pitch ?? 0.5) + (rng() - 0.5) * 0.5;
    const ll = L * (0.8 + rng() * 0.35), top = T(at, 0, h - 0.05 * i / n, 0, yaw, 0, 0);
    // petiole: a short stiff green stalk rising out of the crown
    const pl = 0.35 + rng() * 0.2;
    bins.leaf.add(cyl(6), T(top, 0, pl * Math.sin(pitch + 0.3) / 2, pl * Math.cos(pitch + 0.3) / 2, 0, Math.PI / 2 - (pitch + 0.3), 0, 0.025, pl, 0.025), col("#7fb23c"));
    bins.bleaf.add(bananaLeafGeo(ll, ll * 0.2, 0.35 + rng() * 0.25, Math.floor(rng() * 1e6)), T(top, 0, pl * Math.sin(pitch + 0.3), pl * Math.cos(pitch + 0.3), 0, -pitch, (rng() - 0.5) * 0.35), col("#ffffff", 0.9 + rng() * 0.2));
  }
}

// ======================================================================================================= furniture
/** 1.7 m bench: "stone" (two plinths + slab) or "wood" (cast-iron ends painted green, slatted seat + back) */
export function addBench(bins: TownBins, at: THREE.Matrix4, o: { kind?: "stone" | "wood" } = {}): void {
  if ((o.kind ?? "stone") === "stone") {
    const fn = combine(grime(at, 0.35, 0.62, 0.1, 3), local(at, (x, y, z, c) => c.lerp(col("#6f7f3a"), 0.28 * sstep(0.12, 0, y) * vnoise(x * 5, y * 5, z * 5))));
    for (const s of [-1, 1]) bins.stone.bbox(0.36, 0.36, 0.4, T(at, s * 0.58, 0.18, 0), col("#cfc4ae"), 0.04, fn, [s, 0.3]);
    bins.stone.bbox(1.72, 0.1, 0.48, T(at, 0, 0.41, 0), col("#dcd2bd"), 0.03, fn, [0.4, 0.1]);
    return;
  }
  const iron = col("#2f4a3c"), slat = col("#a8733f"), fn = grime(at, 0.4, 0.66, 0.08, 4);
  for (const s of [-1, 1]) {
    const x = s * 0.72;
    bins.plastic.bbox(0.05, 0.44, 0.05, T(at, x, 0.22, 0.2), iron, 0.012, fn);
    bins.plastic.bbox(0.05, 0.9, 0.05, T(at, x, 0.45, -0.19, 0, -10 * DEG), iron, 0.012, fn);
    bins.plastic.bbox(0.05, 0.05, 0.5, T(at, x, 0.4, 0), iron, 0.012, fn);
    bins.plastic.bbox(0.055, 0.04, 0.46, T(at, x, 0.66, 0.02, 0, 4 * DEG), iron, 0.014, fn);
    bins.plastic.add(cached("benchFoot", () => lathe([[0, 0], [0.045, 0], [0.04, 0.03], [0.028, 0.05], [0, 0.05]], 8)), T(at, x, 0, 0.2), iron);
    bins.plastic.add(cached("benchFoot", () => lathe([[0, 0], [0.045, 0], [0.04, 0.03], [0.028, 0.05], [0, 0.05]], 8)), T(at, x, 0, -0.27), iron);
  }
  for (let i = 0; i < 4; i++) bins.wood.bbox(1.7, 0.032, 0.085, T(at, 0, 0.44, 0.17 - i * 0.1), slat.clone().multiplyScalar(0.92 + (i % 2) * 0.12), 0.01, fn, [i * 0.7, 0]);
  for (let i = 0; i < 2; i++) bins.wood.bbox(1.7, 0.1, 0.03, T(at, 0, 0.66 + i * 0.14, -0.235 - i * 0.025, 0, -10 * DEG), slat.clone().multiplyScalar(0.95 + i * 0.08), 0.01, fn, [i * 0.4, 0.2]);
}

/** cast-iron street lamp (painted bottle green) with a glowing lantern. Default h 3.4 (to the lantern roof tip) */
export function addLampPost(bins: TownBins, at: THREE.Matrix4, h = 3.4): void {
  const iron = col("#2b4538"), fn = grime(at, 0.6, 0.7, 0.05, 3), H = h - 0.62;
  // LOW copy: base + 6-sided pole + glowing lantern + cap (~70 tris vs ~460)
  if (detail() === 0) {
    bins.stone.box(0.4, 0.14, 0.4, T(at, 0, 0.07, 0), col("#cbbfa8"));
    bins.plastic.add(cylGeo(0.06, 0.12, H, 6), T(at, 0, H / 2, 0), iron);
    bins.bulb.add(cylGeo(0.11, 0.09, 0.3, 6), T(at, 0, H + 0.2, 0), 0xffffff);
    bins.plastic.add(cylGeo(0.02, 0.21, 0.2, 6), T(at, 0, H + 0.45, 0), iron);
    return;
  }
  bins.stone.bbox(0.4, 0.14, 0.4, T(at, 0, 0.07, 0), col("#cbbfa8"), 0.03);
  const prof: Array<[number, number]> = [[0, 0.14], [0.16, 0.14], [0.16, 0.2], [0.13, 0.24], [0.13, 0.42], [0.1, 0.47], [0.08, 0.53], [0.08, 0.6], [0.105, 0.62], [0.105, 0.68], [0.07, 0.72], [0.055, H - 0.25], [0.075, H - 0.22], [0.075, H - 0.17], [0.055, H - 0.14], [0.06, H - 0.06], [0.11, H - 0.02], [0.13, H], [0, H]];
  bins.plastic.add(lathe(prof, 12), at, iron, fn);
  // lantern: glowing frosted core, 6 iron bars, bottom cup, roof cone + finial
  const L = T(at, 0, H, 0);
  bins.plastic.add(lathe([[0, 0], [0.13, 0], [0.15, 0.03], [0.12, 0.05], [0, 0.05]], 12), L, iron);
  bins.bulb.add(cylGeo(0.105, 0.085, 0.3, 12), T(L, 0, 0.2, 0), 0xffffff);
  for (let k = 0; k < 6; k++) rod(bins.plastic, L, V(Math.cos(k * TAU / 6) * 0.115, 0.05, Math.sin(k * TAU / 6) * 0.115), V(Math.cos(k * TAU / 6) * 0.14, 0.37, Math.sin(k * TAU / 6) * 0.14), 0.009, "#2b4538", 4);
  bins.plastic.add(lathe([[0, 0.34], [0.2, 0.35], [0.21, 0.38], [0.12, 0.46], [0.04, 0.52], [0.04, 0.55], [0.03, 0.56], [0.045, 0.58], [0.03, 0.62], [0, 0.63]], 12), L, iron);
}

/** warm festoon: dark catenary cable with G40 globe bulbs hanging on sockets every ~0.55 m (bulb bin = emissive) */
export function addStringLights(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, sag = 0.35): void {
  // LOW copy: a 3-sided wire + octahedron bulbs (~25 tris a metre vs ~77)
  if (detail() === 0) {
    const pts = catenary(a, b, sag, 10), len = a.distanceTo(b);
    // (a cable you can see at 20–40 m — at 12 / 8 mm the bulbs read as floating sparkles)
    bins.rope.add(tubeGeo(pts, 0.02, 3, false, 12), null, col("#1f2a22"));
    const n = Math.max(1, Math.floor(len / 0.55));
    for (let i = 1; i < n; i++) { const t = i / n, p = new THREE.Vector3().lerpVectors(a, b, t).add(V(0, -sag * 4 * t * (1 - t), 0)); bins.bulb.add(FAR_OCT, M(p.x, p.y - 0.1, p.z, 0, 0, 0, 0.05, 0.06, 0.05), 0xffffff); }
    return;
  }
  const pts = catenary(a, b, sag, 18), len = a.distanceTo(b);
  bins.rope.add(tubeGeo(pts, 0.014, 4, false, 30), null, col("#1f2a22"));
  const n = Math.max(1, Math.floor(len / 0.55));
  for (let i = 1; i < n; i++) {
    const t = i / n, p = new THREE.Vector3().lerpVectors(a, b, t).add(V(0, -sag * 4 * t * (1 - t), 0));
    bins.rope.add(cyl(6), M(p.x, p.y - 0.035, p.z, 0, 0, 0, 0.017, 0.055, 0.017), col("#22261f"));
    bins.bulb.add(ball(7, 5), M(p.x, p.y - 0.1, p.z, 0, 0, 0, 0.042, 0.048, 0.042), 0xffffff);
  }
}

/** triangular pennant bunting on a line (stripes-atlas solid colours: orange / yellow / teal / red / coral / blue) */
export function addBunting(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: () => number): void {
  // LOW copy: the far flags (bare coloured triangles) on a 3-sided cord
  if (detail() === 0) { bins.rope.add(tubeGeo(catenary(a, b, sag, 10), 0.01, 3, false, 12), null, col("#d8c9a6")); addBuntingFar(bins, a, b, sag, rng, 1); return; }
  const pts = catenary(a, b, sag, 16), len = a.distanceTo(b);
  bins.rope.add(tubeGeo(pts, 0.006, 4, false, 32), null, col("#d8c9a6"));
  const n = Math.max(1, Math.floor(len / 0.4)), dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize(), yaw = Math.atan2(-dir.z, dir.x);
  // flags sample the CREAM stripe of the canvas (cloth weave + seams) and are tinted per flag from the
  // bunting palette (yellow / orange / teal / red / blue / green) — the dyed stripes read red + dark green
  const PAL = ["#ffc21a", "#ff7a1a", "#1fb8ab", "#e8402a", "#2f86dc", "#ffc21a", "#62c23e", "#ff7a1a"];
  const n0 = Math.floor(rng() * PAL.length);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = new THREE.Vector3().lerpVectors(a, b, t).add(V(0, -sag * 4 * t * (1 - t), 0));
    const slope = -sag * 4 * (1 - 2 * t) / len;
    const row = Math.floor(rng() * 6), v = (row + 0.5) / 6, u0 = 0.14, u1 = 0.22;
    const w = 0.28, h = 0.34 + rng() * 0.04, bil = 0.02 + rng() * 0.02;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, -h * 0.45, bil, w / 2, 0, 0, 0, -h, 0, 0, -h * 0.45, bil, 0, -h, 0, -w / 2, 0, 0, 0, -h * 0.45, bil], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([u0, v, u1, v, (u0 + u1) / 2, v, u1, v, (u0 + u1) / 2, v, (u0 + u1) / 2, v, (u0 + u1) / 2, v, u0, v, (u0 + u1) / 2, v], 2));
    g.computeVertexNormals();
    bins.stripes.add(g, M(p.x, p.y + 0.005, p.z, yaw, (rng() - 0.5) * 0.35, Math.atan(slope) + (rng() - 0.5) * 0.12), col(PAL[(n0 + i) % PAL.length], 0.95 + rng() * 0.1));
  }
}

// ======================================================================================================= tanks
function tankProfile(R: number, H: number, ribs: number, taper: number, domeH: number, lidR: number): Array<[number, number]> {
  const r = (y: number) => R * (1 - taper * y / H), Hs = H - domeH;
  const P: Array<[number, number]> = [[0, 0], [R * 0.93, 0], [R * 0.99, 0.018], [r(0.06), 0.06]];
  for (let i = 1; i <= ribs; i++) {
    const y = 0.06 + (Hs - 0.1) * i / (ribs + 1), rr = r(y), b = 0.02 + R * 0.006;
    P.push([rr, y - 0.045], [rr + b, y - 0.016], [rr + b, y + 0.016], [rr, y + 0.045]);
  }
  const r0 = r(Hs);
  P.push([r0, Hs - 0.02]);
  for (let k = 1; k <= 6; k++) { const a = k / 6 * Math.PI / 2; P.push([lidR + 0.02 + (r0 - lidR - 0.02) * Math.cos(a), Hs + domeH * Math.sin(a)]); }
  P.push([lidR + 0.005, H + 0.004], [lidR, H + 0.05], [lidR - 0.018, H + 0.068], [lidR * 0.5, H + 0.074], [0, H + 0.075]);
  return P;
}
/** ribbed moulded-plastic tank (+ vertical mould rib, outlet fitting with valve + pipe). origin = tank bottom centre */
function plasticTank(bins: TownBins, at: Mat, rng: Rng, R: number, H: number, color: C, ribs: number, seg = 24) {
  const c = col(color), prof = tankProfile(R, H, ribs, 0.05, H * 0.17, R * 0.36);
  bins.plastic.add(lathe(prof, seg), at, c, local(at, (x, y, z, o) => {
    const a = Math.atan2(z, x);
    o.multiplyScalar((0.66 + 0.34 * sstep(0, H * 0.45, y)) * (1 + 0.1 * sstep(H * 0.8, H, y)) * (0.93 + 0.14 * vnoise(a * 2.2, y * 2.4, 0.5)) * (y < 0.08 ? 0.7 : 1));
  }));
  // vertical mould rib following the taper
  const tl = Math.atan(0.05 * R / H), ra = 40 * DEG, rr = R * (1 - 0.05 * 0.5) + 0.012;
  bins.plastic.bbox(0.05, H * 0.78, 0.035, T(at, Math.cos(ra) * rr, H * 0.41, -Math.sin(ra) * rr, ra + Math.PI / 2, 0, 0).multiply(M(0, 0, 0, 0, -tl * 0)), c.clone().multiplyScalar(0.95), 0.012);
  // outlet: PVC socket, brass valve, elbow pipe down
  const oa = -60 * DEG, ox = Math.cos(oa), oz = -Math.sin(oa), y0 = 0.14;
  rod(bins.plastic, at, V(ox * (R - 0.02), y0, oz * (R - 0.02)), V(ox * (R + 0.14), y0, oz * (R + 0.14)), 0.03, "#e6e2d8", 10);
  bins.metal.bbox(0.07, 0.07, 0.07, T(at, ox * (R + 0.1), y0, oz * (R + 0.1), -oa), col("#b8923e"), 0.012);
  rod(bins.metal, at, V(ox * (R + 0.1), y0 + 0.03, oz * (R + 0.1)), V(ox * (R + 0.1), y0 + 0.1, oz * (R + 0.1)), 0.008, "#b8923e", 5);
  bins.metal.bbox(0.1, 0.012, 0.02, T(at, ox * (R + 0.1), y0 + 0.1, oz * (R + 0.1), -oa), col("#c43a2a"), 0.004);
  rod(bins.metal, at, V(ox * (R + 0.14), y0, oz * (R + 0.14)), V(ox * (R + 0.3), y0, oz * (R + 0.3)), 0.028, "#8e9399", 8);
  rod(bins.metal, at, V(ox * (R + 0.3), y0 + 0.02, oz * (R + 0.3)), V(ox * (R + 0.3), -0.25, oz * (R + 0.3)), 0.028, "#8e9399", 8);
  bins.metal.add(ball(8, 6), T(at, ox * (R + 0.3), y0, oz * (R + 0.3), 0, 0, 0, 0.036), col("#8e9399"));
  // overflow stub near the top
  rod(bins.plastic, at, V(Math.cos(1.2) * (R * 0.92), H * 0.84, -Math.sin(1.2) * (R * 0.92)), V(Math.cos(1.2) * (R + 0.08), H * 0.84, -Math.sin(1.2) * (R + 0.08)), 0.022, "#e6e2d8", 8);
}
/** a chunky timber platform: 4 splayed legs, bearers, thick deck planks, diagonal braces, iron straps with bolts */
function timberStand(bins: TownBins, at: Mat, rng: Rng, S: number, Hs: number) {
  const fn = grime(at, 0.5, 0.6, 0.14, 2.5), wood = "#8a6444", L = S / 2 - 0.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(bins.woodDark, 0.17, Hs - 0.14, 0.17, T(at, sx * L, (Hs - 0.14) / 2, sz * L, 0, sz * 3 * DEG, -sx * 3 * DEG), tone(wood, rng, 0.12), 0.03, fn, uvr(rng));
  for (const sz of [-1, 1]) bins.woodDark.bbox(S + 0.1, 0.15, 0.17, T(at, 0, Hs - 0.215, sz * L), tone(wood, rng, 0.1), 0.028, fn, uvr(rng));
  const np = Math.max(4, Math.round(S / 0.27));
  for (let i = 0; i < np; i++) bins.wood.bbox(S / np - 0.018, 0.075, S + 0.16, T(at, -S / 2 + (i + 0.5) * S / np, Hs - 0.1, 0, (rng() - 0.5) * 0.02), tone("#9c7650", rng, 0.14), 0.02, fn, uvr(rng));
  for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const len = Math.hypot(L * 2 * 0.8, Hs * 0.62);
    bins.woodDark.bbox(0.07, 0.11, len, T(at, sx * (L + 0.05), Hs * 0.42, sz * (L + 0.05), sx ? 0 : Math.PI / 2, (sx + sz > 0 ? 1 : -1) * Math.atan2(Hs * 0.62, L * 1.6)), tone(wood, rng), 0.015, fn, uvr(rng));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const m = T(at, sx * L, Hs - 0.24, sz * (L + 0.088));
    bins.metal.bbox(0.12, 0.2, 0.006, m, col("#3e3b38"), 0.002);
    for (const dy of [-0.05, 0.05]) bins.metal.add(cyl(6), T(m, 0, dy, 0.005 * sz, 0, Math.PI / 2, 0, 0.012, 0.01, 0.012), col("#2a2826"));
  }
}
/** rooftop water tank. kinds: "plastic" (ribbed moulded tank on two sleepers), "steel" (galvanised, riveted, lid ajar,
 *  on a concrete plinth), "stand" (BIG ribbed tank on a chunky timber stand), "tower" (timber water tower with a ribbed
 *  tank on top). origin = ground contact centre; scale multiplies everything. */
export function addWaterTank(bins: TownBins, at: THREE.Matrix4, rng: () => number, o: { kind: "plastic" | "steel" | "stand" | "tower"; color?: string; scale?: number }): void {
  const s = o.scale ?? 1, A = s === 1 ? at : T(at, 0, 0, 0, 0, 0, 0, s);
  // LOW copy (rooftop tanks from 30 m): a 12-sided ribbed-profile lathe on its stand boxes (~120 tris vs ~600–1 k)
  if (detail() === 0) {
    const tank = (y0: number, R: number, H: number, c: string) => bins.plastic.add(lathe([[0, 0], [R, 0], [R, H * 0.3], [R * 1.03, H * 0.33], [R, H * 0.36], [R, H * 0.66], [R * 1.03, H * 0.69], [R, H * 0.72], [R * 0.96, H * 0.94], [R * 0.3, H], [0, H]], 12), T(A, 0, y0, 0), col(c));
    if (o.kind === "plastic") { bins.woodDark.box(1.4, 0.1, 0.8, T(A, 0, 0.05, 0), col("#7a5a3c")); tank(0.1, 0.6, 1.3, o.color ?? "#2f4f8f"); }
    else if (o.kind === "stand") { bins.woodDark.box(1.9, 0.86, 1.9, T(A, 0, 0.43, 0), col("#6a4a2c")); tank(0.86, 0.84, 1.85, o.color ?? "#5d7f33"); }
    else if (o.kind === "tower") { for (const sx of [-1, 1]) for (const sz of [-1, 1]) bins.woodDark.box(0.15, 3.2, 0.15, T(A, sx * 0.74, 1.6, sz * 0.74), col("#a47a52")); bins.wood.box(1.9, 0.1, 1.95, T(A, 0, 3.24, 0), col("#9c7650")); tank(3.28, 0.72, 1.45, o.color ?? "#2f5fa0"); }
    else { bins.stone.box(1.45, 0.14, 1.45, T(A, 0, 0.07, 0), col("#bfb6a4")); tank(0.14, 0.62, 1.12, o.color ?? "#c3c8cb"); }
    return;
  }
  if (o.kind === "plastic") {
    for (const z of [-0.32, 0.32]) bins.woodDark.bbox(1.4, 0.1, 0.14, T(A, 0, 0.05, z), tone("#7a5a3c", rng), 0.02, grime(A, 0.3, 0.6));
    plasticTank(bins, T(A, 0, 0.1, 0), rng, 0.6, 1.3, o.color ?? "#2f4f8f", 3);
  } else if (o.kind === "stand") {
    timberStand(bins, A, rng, 1.9, 0.86);
    plasticTank(bins, T(A, 0, 0.86, 0), rng, 0.84, 1.85, o.color ?? "#5d7f33", 4);
  } else if (o.kind === "tower") {
    const Ht = 3.2, fn = grime(A, 0.8, 0.6, 0.14, 2), wood = "#a47a52", Lb = 0.8, Lt = 0.68;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const a = V(sx * Lb, 0, sz * Lb), b = V(sx * Lt, Ht, sz * Lt), m = T(A, (a.x + b.x) / 2, Ht / 2, (a.z + b.z) / 2, 0, sz * Math.atan((Lb - Lt) / Ht), -sx * Math.atan((Lb - Lt) / Ht));
      post(bins.woodDark, 0.15, Ht, 0.15, m, tone(wood, rng), 0.025, fn, uvr(rng));
      bins.stone.bbox(0.3, 0.12, 0.3, T(A, sx * Lb, 0.06, sz * Lb), col("#bdb19b"), 0.03);
    }
    for (const y of [1.1, 2.3]) {
      const Ly = lerp(Lb, Lt, y / Ht) + 0.09;
      for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) bins.woodDark.bbox(Ly * 2 + 0.1, 0.1, 0.07, T(A, sx * Ly, y, sz * Ly, sx ? Math.PI / 2 : 0), tone(wood, rng), 0.015, fn, uvr(rng));
    }
    for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) for (const k of [-1, 1]) {
      const Ly = lerp(Lb, Lt, 0.5) + 0.1;
      bins.woodDark.box(0.05, 0.07, 2.25, T(A, sx * Ly, 1.7, sz * Ly, sx ? 0 : Math.PI / 2, k * Math.atan2(1.2, 1.5) * 0 + k * 0.62), tone(wood, rng), uvr(rng), fn);
    }
    const np = 6;
    for (let i = 0; i < np; i++) bins.wood.bbox(1.9 / np - 0.016, 0.08, 1.95, T(A, -0.95 + (i + 0.5) * 1.9 / np, Ht + 0.04, 0), tone("#9c7650", rng, 0.12), 0.018, fn, uvr(rng));
    for (const sz of [-1, 1]) bins.woodDark.bbox(1.95, 0.12, 0.12, T(A, 0, Ht - 0.06, sz * (Lt - 0.02)), tone(wood, rng), 0.02, fn);
    // ladder on +z
    for (const sx of [-1, 1]) post(bins.woodDark, 0.05, Ht + 0.7, 0.06, T(A, sx * 0.22, (Ht + 0.7) / 2, Lb + 0.12, 0, -Math.atan(0.1 / Ht)), tone(wood, rng), 0.012, fn);
    for (let k = 0; k < 11; k++) bins.woodDark.box(0.44, 0.035, 0.035, T(A, 0, 0.3 + k * 0.32, Lb + 0.12 - 0.1 * (0.3 + k * 0.32) / Ht), tone(wood, rng), [k, 0]);
    plasticTank(bins, T(A, 0, Ht + 0.08, 0), rng, 0.72, 1.45, o.color ?? "#2f5fa0", 3, 22);
  } else {
    // galvanised steel: tapered, rolled beads, top bead, riveted seam, lid ajar, brass tap, concrete plinth
    const R = 0.62, H = 1.12, r = (y: number) => R * (1 - 0.07 * y / H);
    bins.stone.bbox(1.45, 0.14, 1.45, T(A, 0, 0.07, 0), col("#bfb6a4"), 0.03, grime(A, 0.2, 0.7));
    const P: Array<[number, number]> = [[0, 0], [R * 0.97, 0], [R + 0.012, 0.02], [r(0.04), 0.04]];
    for (const yb of [0.3, 0.58, 0.86]) P.push([r(yb), yb - 0.025], [r(yb) + 0.014, yb], [r(yb), yb + 0.025]);
    P.push([r(H - 0.04), H - 0.04], [r(H) + 0.02, H - 0.012], [r(H) + 0.018, H + 0.012], [r(H) - 0.01, H + 0.012], [r(H) - 0.02, H], [0, H]);
    const tm = T(A, 0, 0.14, 0);
    const galv = (m: Mat): ColorFn => local(m, (x, y, z, c) => {
      const a = Math.atan2(z, x);
      c.multiplyScalar((0.8 + 0.3 * vnoise(a * 5, y * 7, 1.3)) * (0.7 + 0.3 * sstep(0, 0.35, y)));
      c.lerp(col("#7a5a3a"), 0.35 * sstep(0.25, 0, y) * vnoise(a * 9, y * 4, 7.1));
    });
    bins.plastic.add(lathe(P, 26), tm, col(o.color ?? "#c3c8cb"), galv(tm));
    const lid = T(tm, 0.07, H + 0.035, 0.04, 0.3, 0, -5 * DEG);
    bins.metal.add(lathe([[0, 0.03], [r(H) + 0.02, -0.01], [r(H) + 0.02, -0.035], [r(H) + 0.035, -0.035], [r(H) + 0.035, 0.0], [r(H) * 0.35, 0.06], [0.04, 0.08], [0.03, 0.1], [0.06, 0.11], [0.05, 0.13], [0, 0.13]], 26), lid, col("#bcc2c5"), galv(lid));
    for (let k = 0; k < 7; k++) { const y = 0.12 + k * 0.14; bins.plastic.add(ball(6, 4), T(tm, r(y) + 0.004, y, 0, 0, 0, 0, 0.012, 0.012, 0.012), col("#9ea4a8")); }
    const ta = 0.9, tx = Math.cos(ta), tz = -Math.sin(ta);
    rod(bins.metal, tm, V(tx * (R - 0.03), 0.12, tz * (R - 0.03)), V(tx * (R + 0.12), 0.12, tz * (R + 0.12)), 0.022, "#c09a44", 8);
    rod(bins.metal, tm, V(tx * (R + 0.11), 0.12, tz * (R + 0.11)), V(tx * (R + 0.11), 0.03, tz * (R + 0.11)), 0.015, "#c09a44", 6);
    bins.metal.bbox(0.012, 0.02, 0.1, T(tm, tx * (R + 0.12), 0.16, tz * (R + 0.12), ta), col("#c43a2a"), 0.004);
  }
}

// ======================================================================================================= AC unit
/** split-AC outdoor unit on rails: bevelled casing, raised fan guard, side louvres, service cover, insulated pipes */
export function addACUnit(bins: TownBins, at: THREE.Matrix4, rng: () => number): void {
  const w = 0.82, h = 0.56, d = 0.3, y0 = 0.1, cas = tone("#e9e5dc", rng, 0.04);
  // LOW copy: casing box + dark fan disc (~40 tris vs ~830)
  if (detail() === 0) {
    bins.plastic.box(w, h, d, T(at, 0, y0 + h / 2, 0), cas); bins.plastic.box(w + 0.04, y0, d + 0.1, T(at, 0, y0 / 2, 0), col("#6e7276"));
    bins.plastic.add(cyl(10), T(at, -0.1, y0 + h / 2, d / 2 + 0.005, 0, Math.PI / 2, 0, 0.2, 0.01, 0.2), col("#26282b"));
    return;
  }
  const fn = combine(grime(at, 0.35, 0.72, 0.04, 5), local(at, (x, y, z, c) => c.lerp(col("#8a6a4a"), 0.3 * sstep(y0 + 0.16, y0, y) * vnoise(x * 18, 2, z * 4))));
  for (const x of [-0.28, 0.28]) {
    bins.metal.bbox(0.05, y0 - 0.02, d + 0.12, T(at, x, (y0 - 0.02) / 2, 0), col("#6e7276"), 0.008);
    bins.fabric.bbox(0.07, 0.025, 0.07, T(at, x, y0 - 0.008, 0.12), col("#222"), 0.006);
    bins.fabric.bbox(0.07, 0.025, 0.07, T(at, x, y0 - 0.008, -0.12), col("#222"), 0.006);
  }
  bins.plastic.bbox(w, h, d, T(at, 0, y0 + h / 2, 0), cas, 0.03, fn);
  bins.plastic.bbox(w + 0.02, 0.03, d + 0.02, T(at, 0, y0 + h - 0.005, 0), cas.clone().multiplyScalar(0.97), 0.012);
  // fan: dark disc, raised guard rings + spokes, hub
  const fc = T(at, -0.1, y0 + h / 2, d / 2);
  bins.metal.add(cyl(24), T(fc, 0, 0, 0.004, 0, Math.PI / 2, 0, 0.215, 0.008, 0.215), col("#26282b"));
  for (const [rr, zz] of [[0.215, 0.012], [0.16, 0.03], [0.1, 0.042], [0.045, 0.048]] as Array<[number, number]>) bins.metal.add(cached(`ring${rr}`, () => boxProjectUV(new THREE.TorusGeometry(rr, 0.0055, 3, rr > 0.1 ? 22 : 12), 1)), T(fc, 0, 0, zz), col("#3a3d40"));
  for (let k = 0; k < 4; k++) bins.metal.box(0.43, 0.01, 0.01, T(fc, 0, 0, 0.03, 0, 0, k * Math.PI / 4), col("#3a3d40"));
  bins.metal.add(lathe([[0.05, 0], [0.045, 0.03], [0.03, 0.05], [0, 0.055]], 12), T(fc, 0, 0, 0.005, 0, Math.PI / 2), col("#4a4d52"));
  for (let k = 0; k < 3; k++) bins.fabric.bbox(0.16, 0.012, 0.03, T(fc, 0, 0, 0.02, 0, 0, k * TAU / 3 + 0.4).multiply(M(0.1, 0, 0, 0, 0.5, 0)), col("#1c1d1f"), 0.004);
  // right side: louvred grille, service cover with screws
  for (let k = 0; k < 7; k++) bins.plastic.bbox(0.02, 0.012, d - 0.08, T(at, w / 2 + 0.004, y0 + 0.08 + k * 0.058, 0, 0, 0, 25 * DEG), cas.clone().multiplyScalar(0.9), 0.004);
  bins.plastic.bbox(0.2, 0.26, 0.012, T(at, w / 2 - 0.13, y0 + h * 0.55, d / 2 + 0.004), cas.clone().multiplyScalar(0.95), 0.005);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bins.metal.add(cyl(6), T(at, w / 2 - 0.13 + sx * 0.08, y0 + h * 0.55 + sy * 0.11, d / 2 + 0.011, 0, Math.PI / 2, 0, 0.007, 0.006, 0.007), col("#8e9499"));
  // insulated pipe pair leaving the side and dropping to the roof
  for (const [k, r] of [[0, 0.022], [1, 0.016]] as Array<[number, number]>) {
    const z = -0.05 + k * 0.07;
    bins.fabric.add(tubeGeo([V(w / 2 - 0.05, y0 + 0.14 + k * 0.05, z), V(w / 2 + 0.1, y0 + 0.14 + k * 0.05, z), V(w / 2 + 0.16, y0 + 0.05, z), V(w / 2 + 0.18, 0.02, z + 0.15), V(w / 2 + 0.2, 0.02, z + 0.6)], r, 5, false, 14), at, col(k ? "#d9d4c8" : "#cfc8b8"));
  }
}

// ======================================================================================================= sack + basket
/** lumpy burlap sack with a gathered, rope-tied neck (~0.55 m tall) */
export function addSack(bins: TownBins, at: THREE.Matrix4, rng: () => number): void {
  const seed = rng() * 100, lean = (rng() - 0.5) * 0.2, fat = 0.92 + rng() * 0.2, H = 0.5 + rng() * 0.08;
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, detail() ? 16 : 7, detail() ? 12 : 5);
  g.deleteAttribute("uv"); g.deleteAttribute("normal"); g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    const t = (p.getY(i) + 1) / 2, a = Math.atan2(z, x);
    const lump = 0.8 + 0.4 * vnoise(x * 2.2 + seed, t * 3, z * 2.2);
    // squat full body, pinched neck with radial folds, flared tuft above the tie
    const body = t < 0.66 ? Math.pow(Math.sin(Math.PI * Math.min(1, 0.2 + t / 0.66 * 0.8) * 0.5 + Math.PI * 0.25), 0.5) * lump : 0;
    const neck = lerp(0.9 * lump, 0.17, sstep(0.62, 0.84, t)) * (1 + 0.18 * Math.sin(a * 7 + seed) * sstep(0.55, 0.8, t));
    const rad = t < 0.66 ? body : t < 0.88 ? neck : 0.17 + 0.3 * sstep(0.88, 1, t) * (0.8 + 0.4 * Math.sin(a * 5 + seed));
    x *= 0.27 * fat * rad; z *= 0.23 * fat * rad;
    const y = t < 0.08 ? t * 0.25 : 0.02 + (t - 0.08) / 0.92 * H + (t > 0.95 ? -0.03 : 0);
    x += lean * y * 0.6;
    p.setXYZ(i, x, Math.max(0, y), z);
  }
  g.computeVertexNormals(); boxProjectUV(g, 0.5);
  const c = tone("#c9a46a", rng, 0.1);
  bins.fabric.add(g, at, c, local(at, (x, y, z, o) => o.multiplyScalar((0.6 + 0.4 * sstep(0, 0.2, y)) * (0.88 + 0.24 * vnoise(x * 16, y * 16, z * 16)) * (y > H * 0.78 ? 0.86 : 1))));
  const ty = 0.02 + (0.8 - 0.08) / 0.92 * H;
  bins.rope.add(cached("sackTie", () => boxProjectUV(new THREE.TorusGeometry(0.058, 0.013, 4, 12), 1)), T(at, lean * ty * 0.6, ty, 0, 0, Math.PI / 2 + 0.1, 0), col("#8a6a3a"));
}

/** round woven basket (wicker weave baked in vertex colour), two handles, optional fruit heap. Ø 0.56 m */
export function addBasket(bins: TownBins, at: THREE.Matrix4, rng: () => number, fruit?: "mango" | "banana"): void {
  const prof: Array<[number, number]> = [[0, 0.01], [0.2, 0.0], [0.22, 0.02]];
  for (let i = 1; i <= 7; i++) { const t = i / 7; prof.push([0.22 + 0.06 * Math.sin(t * Math.PI * 0.6), 0.02 + t * 0.2]); }
  prof.push([0.3, 0.235], [0.285, 0.25], [0.268, 0.235], [0.255, 0.22], [0, 0.22]);
  const c = tone("#b98a4e", rng, 0.08);
  bins.rope.add(cached("basket", () => lathe(prof, 24)), at, c, local(at, (x, y, z, o) => {
    const a = Math.atan2(z, x), rowI = Math.floor(y / 0.029), colI = Math.floor((a + Math.PI) / TAU * 24 + (rowI % 2) * 0.5);
    o.multiplyScalar(((rowI + colI) % 2 ? 0.8 : 1.05) * (0.62 + 0.38 * sstep(0, 0.12, y)) * (y > 0.225 ? 1.1 : 1));
  }));
  for (const s of [-1, 1]) bins.rope.add(tubeGeo([V(s * 0.27, 0.2, -0.06), V(s * 0.33, 0.27, -0.03), V(s * 0.33, 0.27, 0.03), V(s * 0.27, 0.2, 0.06)], 0.012, 5, false, 8), at, c.clone().multiplyScalar(0.9));
  if (fruit) addHeap(bins, at, rng, 0.5, 0.5, 0.2, fruit === "mango" ? 0.8 : 0.6, fruit, true, 1);
}

// ======================================================================================================= lab
/** slot "market": a mini market street with every prop + variations */
export function lab(env: LabEnv): void {
  const { bins, rng } = env, at = env.at, o = env.origin;
  const W = (x: number, y: number, z: number) => V(o.x + x, o.y + y, o.z + z);
  // stall row
  addStall(bins, at(-6.2, 0, -4), rng, { stripe: 1, fruit: "mango" });
  addStall(bins, at(-3.3, 0, -4), rng, { stripe: 0, fruit: "banana" });
  addStall(bins, at(-0.4, 0, -4), rng, { stripe: 2, fruit: "mixed" });
  addStall(bins, at(2.3, 0, -4), rng, { stripe: 3, fruit: "mango", w: 2.2 });
  addStall(bins, at(5.1, 0, -4.2, -0.12), rng, { stripe: 4, fruit: "banana", w: 2.4 });
  // in front of the stalls: baskets, sacks, crates
  addBasket(bins, at(-5.2, 0, -1.9), rng, "mango");
  addBasket(bins, at(-4.55, 0, -2.05), rng, "banana");
  addBasket(bins, at(1.3, 0, -1.8), rng);
  addSack(bins, at(-1.6, 0, -2.0), rng); addSack(bins, at(-1.25, 0, -2.25), rng); addSack(bins, at(-1.45, 0, -1.65, 1), rng);
  addPlasticCrate(bins, at(3.3, 0, -1.9, 0.1), "#2f6fb0", { fruit: "banana" });
  addPlasticCrate(bins, at(3.3, 0.281, -1.9, 0.06), "#2a9d8f");
  addPlasticCrate(bins, at(3.95, 0, -1.8, -0.2), "#d24b3a", { fruit: "mango" });
  addCrateStack(bins, at(-7.9, 0, -2.6, 0.3), rng, 5);
  addCrateStack(bins, at(7.2, 0, -2.3, -0.4), rng, 3);
  // the view's foreground: mango crates, banana crate, green plastic crate of mangoes
  addFruitCrate(bins, at(1.2, 0, 2.6, 0.08), rng, { heap: 0.95 });
  addFruitCrate(bins, at(1.95, 0, 3.15, -0.2), rng, { heap: 0.7, color: "#6f4a2c" });
  addFruitCrate(bins, at(0.25, 0, 3.0, 0.35), rng, { fruit: "banana", heap: 0.85, color: "#8a5a34" });
  addPlasticCrate(bins, at(2.6, 0, 2.3, 0.3), "#4c9a3b", { fruit: "mango" });
  addFruitCrate(bins, at(-0.6, 0, 2.2, -0.1), rng, { heap: 0.5, w: 0.5, d: 0.36, color: "#9a6b3e" });
  // crate table (wood bench + crates), scooters, cart
  addBench(bins, at(-2.6, 0, 1.0, 0.1), { kind: "wood" });
  addPlasticCrate(bins, at(-2.9, 0.458, 1.0, 0.1), "#f0b92e", { fruit: "mango" });
  addScooter(bins, at(4.9, 0, 0.7, -0.5), "#f2b724");
  addScooter(bins, at(-4.4, 0, 1.2, 0.45), "#d9452f");
  addScooter(bins, at(6.6, 0, 1.6, -0.9), "#2fb3a8");
  addHandcart(bins, at(-6.6, 0, 1.6, 0.55), rng);
  // planters, pots, benches, lamps
  addPlanterBox(bins, at(-1.4, 0, 4.4), rng, { w: 1.3, color: "#3f8f78" });
  addPlanterBox(bins, at(4.4, 0, 3.8, -0.3), rng, { w: 1.0, color: "#c85a3a", flowers: ["#f6d23a", "#fff4e6"] });
  addPot(bins, at(0.2, 0, 1.0), rng, { size: 0.5, plant: "leafy" });
  addPot(bins, at(3.4, 0, 4.9), rng, { size: 0.42, plant: "flowers" });
  addPot(bins, at(-3.4, 0, 3.6), rng, { size: 0.36, plant: "flowers" });
  addPot(bins, at(6.0, 0, -1.6), rng, { size: 0.3, plant: "none" });
  addBench(bins, at(-5.4, 0, 3.6, 0.25), { kind: "stone" });
  addLampPost(bins, at(-8.2, 0, -0.6));
  addLampPost(bins, at(7.6, 0, -0.4));
  addLampPost(bins, at(-0.8, 0, 5.8));
  const lh = 3.25;
  addStringLights(bins, W(-8.2, lh - 0.45, -0.6), W(7.6, lh - 0.45, -0.4), 0.9);
  addStringLights(bins, W(-8.2, lh - 0.45, -0.6), W(-0.8, lh - 0.45, 5.8), 0.6);
  addBunting(bins, W(-8.2, lh + 0.05, -0.6), W(7.6, lh + 0.05, -0.4), 0.7, rng);
  addBunting(bins, W(7.6, lh + 0.05, -0.4), W(-0.8, lh + 0.05, 5.8), 0.6, rng);
  // tanks + AC units (east side)
  addWaterTank(bins, at(10.2, 0, -5.2), rng, { kind: "plastic" });
  addWaterTank(bins, at(12.0, 0, -5.4), rng, { kind: "plastic", color: "#2c8a80", scale: 1.15 });
  addWaterTank(bins, at(13.8, 0, -5.0), rng, { kind: "steel" });
  addWaterTank(bins, at(11.0, 0, -1.6), rng, { kind: "stand" });
  addWaterTank(bins, at(13.8, 0, 1.2), rng, { kind: "tower" });
  addACUnit(bins, at(10.0, 0, 2.6, -0.3), rng);
  addACUnit(bins, at(11.1, 0, 3.0, -0.3), rng);
  // greenery behind the stalls
  env.veg.plant("banana-plant", o.x - 8.5, o.z - 6.5, 0.4, 1, o.y);
  env.veg.plant("palm", o.x + 8.5, o.z - 7.5, 1.2, 1, o.y);
  env.veg.plant("monstera", o.x - 9.3, o.z + 3.5, 2.0, 1, o.y);
}

// ======================================================================================================= far tier
// The market's signature from the drop / a rooftop 100–250 m away (stalls, canopies and bunting would vanish
// beyond the 75 m low tier): a few dozen triangles a prop — canopy card with the stall's stripe row, a table block,
// bunting as bare coloured triangles (1.3× size so they survive the distance), string-light bulbs as small glowing
// octahedra. Everything single-quad / no rope tubes; lives in TownLod's prop `far` tier.
const FAR_OCT = new THREE.OctahedronGeometry(1, 0);
export function addStallFar(bins: TownBins, at: THREE.Matrix4, stripe = 1, w = 2.6): void {
  const row = Math.max(0, Math.min(5, Math.round(stripe)));
  const card = (cw: number, ch: number) => {
    const g = new THREE.PlaneGeometry(cw, ch, 1, 1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cw, (row + 0.15 + 0.7 * uv.getY(i)) / 6);
    return g;
  };
  bins.stripes.add(card(w + 0.24, 1.6).rotateX(-Math.PI / 2), at.clone().multiply(M(0, 2.3, -0.1, 0, Math.atan(0.3 / 1.3))), 0xffffff);
  bins.stripes.add(card(w + 0.24, 0.26), at.clone().multiply(M(0, 2.02, 0.7)), 0xffffff);
  bins.wood.box(w - 0.36, 0.8, 0.8, at.clone().multiply(M(0, 0.4, 0.26)), col("#8a5f36"));
}
export function addBuntingFar(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: () => number, k = 1.3): void {
  const len = a.distanceTo(b), n = Math.max(1, Math.floor(len / (k > 1.1 ? 0.55 : 0.4)));
  const PAL = ["#ffc21a", "#ff7a1a", "#1fb8ab", "#e8402a", "#2f86dc", "#ffc21a", "#62c23e", "#ff7a1a"];
  const n0 = Math.floor(rng() * PAL.length);
  const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize(), yaw = Math.atan2(-dir.z, dir.x);
  const pos: number[] = [], cl: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = new THREE.Vector3().lerpVectors(a, b, t).add(V(0, -sag * 4 * t * (1 - t), 0));
    const w = 0.28 * k, h = 0.35 * k;
    const ex = Math.cos(yaw) * w / 2, ez = -Math.sin(yaw) * w / 2;
    // two-sided flag (both windings) so it reads from either side of the street
    const A = [p.x - ex, p.y, p.z - ez], B = [p.x + ex, p.y, p.z + ez], C = [p.x, p.y - h, p.z];
    pos.push(...A, ...B, ...C, ...A, ...C, ...B);
    c.set(PAL[(n0 + i) % PAL.length]);
    for (let k = 0; k < 6; k++) cl.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3));
  g.computeVertexNormals();
  // the plastic bin: vertex colour only (the stripes canvas would tint the flags cream at this size)
  bins.plastic.add(g, null, 0xffffff);
}
export function addLightsFar(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, sag: number): void {
  const len = a.distanceTo(b), n = Math.max(1, Math.floor(len / 1.1));
  // (the far bulbs hang on a drawn cable too)
  bins.rope.add(tubeGeo(catenary(a, b, sag, 8), 0.03, 3, false, 8), null, col("#1f2a22"));
  for (let i = 1; i < n; i++) {
    const t = i / n, p = new THREE.Vector3().lerpVectors(a, b, t).add(V(0, -sag * 4 * t * (1 - t), 0));
    bins.bulb.add(FAR_OCT, M(p.x, p.y - 0.1, p.z, 0, 0, 0, 0.09, 0.1, 0.09), 0xffffff);
  }
}
