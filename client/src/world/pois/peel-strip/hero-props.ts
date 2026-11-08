// poi-coast hero props: modelled, bevelled, worn pieces instead of box
// stand-ins — a 9-cylinder radial engine on a wheeled stand, a pallet rack, a roll cabinet, galvanised wash troughs,
// a platform scale desk, strapped straw bales, an open-riser timber attic stair. Each draws INSIDE a given box
// (base at y 0, footprint ±w/2 × ±d/2, height h) so the shared collider is the same box.
import * as THREE from "three";
import { Batch, M, box, rbox, cyl, sph, lathe } from "../_kit/coast-kit";
import { rng } from "../../../../../shared/pois/coast-kit";
import { crateAt } from "./coast-dress";
import { bananaHeap } from "../_kit/coast-props";
import { textDecal } from "../_kit/coast-sign";
import { grimy } from "../_kit/coast-vehicles";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
const col = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k);

/** worn paint: a few darker scuffs + bare-metal chips along the top edges of a box face (w × h on local +z face) */
function scuffs(n: Batch, m: THREE.Matrix4, w: number, h: number, d: number, seed: number, base: number) {
  const r = rng(seed);
  for (let k = 0; k < 5; k++) {
    const x = (r() - 0.5) * (w - 0.1), sz = r() < 0.5 ? -1 : 1;
    n.add(box(0.04 + r() * 0.12, 0.015 + r() * 0.03, 0.006), "steel", { m: mul(m, M(x, h - 0.02 - r() * 0.04, sz * (d / 2 + 0.002))), color: 0x9a9894, shadow: false });
  }
  for (let k = 0; k < 3; k++) {
    const x = (r() - 0.5) * (w - 0.2), sz = r() < 0.5 ? -1 : 1;
    n.add(box(0.15 + r() * 0.25, 0.05 + r() * 0.12, 0.006), "pmetal", { m: mul(m, M(x, 0.05 + r() * 0.12, sz * (d / 2 + 0.003))), color: col(base, 0.55), shadow: false });
  }
}

/**
 * 9-cylinder radial engine on a yellow wheeled maintenance stand. Box: x ±w/2 (engine axis), z ±d/2, y 0…h.
 * The crankcase sits at the box centre line; cylinders reach just inside the box.
 */
export function radialEngine(b: Batch, n: Batch, m: THREE.Matrix4, w: number, d: number, h: number) {
  const YEL = 0xd9a62a, R0 = Math.min(d, h * 0.8) / 2 - 0.03, cy = h - R0 - 0.02, ax = 0.05;
  // ---- stand: rectangular tube base on 4 swivel casters, two A-frame uprights to a mounting ring, a push handle
  const bw = w - 0.06, bd = d - 0.08;
  for (const s of [-1, 1]) b.add(rbox(bw, 0.07, 0.07, 0.015), "gloss", { m: mul(m, M(0, 0.17, s * (bd / 2 - 0.035))), color: YEL });
  for (const s of [-1, 1]) b.add(rbox(0.07, 0.07, bd, 0.015), "gloss", { m: mul(m, M(s * (bw / 2 - 0.035), 0.17, 0)), color: YEL });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cm = mul(m, M(sx * (bw / 2 - 0.06), 0, sz * (bd / 2 - 0.06)));
    n.add(cyl(0.065, 0.065, 0.04, 12).rotateX(Math.PI / 2), "rubber", { m: mul(cm, M(0, 0.065, 0)), uv: "local", color: 0x1e1e1e });
    n.add(box(0.03, 0.09, 0.06), "steel", { m: mul(cm, M(0, 0.1, 0)), color: 0x707070 });
  }
  for (const s of [-1, 1]) {
    const z = s * (R0 * 0.55);
    // A-frame: two struts from the base rails up to the ring mount
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(-0.15 + sx * 0.28, 0.2, s * (bd / 2 - 0.05)), c = new THREE.Vector3(-0.15, cy - R0 * 0.35, z);
      const L = a.distanceTo(c), mid = a.clone().add(c).multiplyScalar(0.5), dir = c.clone().sub(a).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      b.add(rbox(0.06, L, 0.06, 0.015), "gloss", { m: mul(m, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1))), color: YEL });
    }
  }
  const ringT = new THREE.TorusGeometry(R0 * 0.45, 0.035, 6, 20); ringT.rotateY(Math.PI / 2);
  b.add(ringT, "gloss", { m: mul(m, M(-0.15, cy, 0)), uv: "local", color: YEL });
  b.add(cyl(0.025, 0.025, 0.55, 6), "steel", { m: mul(m, M(-w / 2 + 0.12, 0.45, 0, 0, 0, 0.5)), color: 0x5a5a5a });
  scuffs(n, mul(m, M(0, 0.135, 0)), bw, 0.07, bd, 31, YEL);
  // drip tray + oil
  n.add(rbox(w * 0.7, 0.04, d * 0.6, 0.01), "pmetal", { m: mul(m, M(0, 0.03, 0)), color: 0x3a3a38 });
  n.add(cyl(0.22, 0.22, 0.005, 14), "gloss", { m: mul(m, M(0.05, 0.055, 0.05)), uv: "local", color: 0x0d0b08 });
  // ---- the engine (axis +x): crankcase, nose case + prop flange, 9 finned cylinders with heads, rocker boxes,
  // pushrods, intake pipes, exhaust collector ring, rear accessory case with two magnetos
  const E = mul(m, M(ax, cy, 0));
  const ckR = R0 * 0.36;
  b.add(cyl(ckR, ckR, 0.26, 9).rotateZ(Math.PI / 2), "gloss", { m: E, uv: "local", color: 0x5d6266 });
  b.add(lathe([[ckR * 0.95, 0], [ckR * 0.8, 0.12], [ckR * 0.45, 0.24], [0.08, 0.3], [0.0, 0.31]], { segs: 14 }).rotateZ(-Math.PI / 2), "gloss", { m: mul(E, M(0.13, 0, 0)), uv: "local", color: 0x6b7074 });
  n.add(cyl(0.09, 0.09, 0.05, 12).rotateZ(Math.PI / 2), "steel", { m: mul(E, M(0.45, 0, 0)), uv: "local", color: 0x8a8a86 });
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; n.add(cyl(0.012, 0.012, 0.03, 5).rotateZ(Math.PI / 2), "steel", { m: mul(E, M(0.48, Math.cos(a) * 0.065, Math.sin(a) * 0.065)), color: 0x444444 }); }
  b.add(cyl(ckR * 0.75, ckR * 0.85, 0.2, 12).rotateZ(Math.PI / 2), "gloss", { m: mul(E, M(-0.22, 0, 0)), uv: "local", color: 0x4d5256 });
  for (const s of [-1, 1]) n.add(cyl(0.05, 0.05, 0.14, 10).rotateZ(Math.PI / 2), "gloss", { m: mul(E, M(-0.34, 0.06, s * 0.09)), uv: "local", color: 0x7a2a22 });
  const cylL = R0 - ckR - 0.1, finR = 0.085;
  for (let q = 0; q < 9; q++) {
    const a = (q / 9) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    // cylinder frame: local +y = radial direction (in the y-z plane)
    const C = mul(E, M(0, 0, 0, a, 0, 0));
    b.add(cyl(0.06, 0.065, cylL, 10), "steel", { m: mul(C, M(0, ckR + cylL / 2, 0)), uv: "local", color: 0x4a4c4e });
    for (let f = 0; f < 7; f++) n.add(cyl(finR, finR, 0.012, 12), "steel", { m: mul(C, M(0, ckR + 0.03 + f * (cylL - 0.05) / 6, 0)), uv: "local", color: 0x5b5e60 });
    // head: a squat rounded block with two rocker boxes and fins
    b.add(rbox(0.16, 0.12, 0.15, 0.04), "steel", { m: mul(C, M(0, ckR + cylL + 0.05, 0)), color: 0x6e7072 });
    for (const s of [-1, 1]) n.add(rbox(0.06, 0.05, 0.05, 0.015), "gloss", { m: mul(C, M(s * 0.05, ckR + cylL + 0.11, 0)), color: 0x3c4044 });
    // pushrod tubes (front) + intake pipe (back)
    n.add(cyl(0.011, 0.011, cylL, 5), "chrome", { m: mul(C, M(0.07, ckR + cylL / 2, 0.03)), color: 0xbfc2c6 });
    n.add(cyl(0.02, 0.02, cylL * 0.9, 6), "steel", { m: mul(C, M(-0.1, ckR + cylL * 0.45, 0)), color: 0x6a6a68 });
    // exhaust stub into the collector
    n.add(cyl(0.025, 0.03, 0.12, 6), "pmetal", { m: mul(C, M(-0.08, ckR + cylL - 0.02, 0, 0, 0, 0.9)), color: 0x6b4a36 });
    void ca; void sa;
  }
  const coll = new THREE.TorusGeometry(ckR + cylL * 0.7, 0.03, 6, 28); coll.rotateY(Math.PI / 2);
  b.add(coll, "pmetal", { m: mul(E, M(-0.16, 0, 0)), uv: "local", color: 0x6b4a36 });
  // a rag + a spanner on the stand rail, a tag on wire
  n.add(box(0.22, 0.012, 0.16), "fabric", { m: mul(m, M(0.2, 0.215, bd / 2 - 0.035, 0.2, 0.3, 0)), color: 0xb8342a });
  n.add(box(0.2, 0.01, 0.03), "chrome", { m: mul(m, M(-0.15, 0.21, -bd / 2 + 0.04, 0, 0.5, 0)), color: 0xbfc2c6 });
  n.add(box(0.07, 0.1, 0.005), "plain", { m: mul(E, M(0.1, -ckR - 0.12, 0.15)), color: 0xf2e6c4 });
}

/** steel pallet rack (two bays, three levels) loaded with crates, drums and boxes; a mesh back panel in the middle.
 *  Box: x ±w/2 (long), z ±d/2 (shallow), y 0…h. Tops too narrow to stand on. */
export function palletRack(b: Batch, n: Batch, m: THREE.Matrix4, w: number, d: number, h: number, seed: number) {
  const OR = 0xd9632a, BL = 0x2f5f86, r = rng(seed);
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) b.add(box(0.07, h, 0.07), "pmetal", { m: mul(m, M(sx * (w / 2 - 0.04), h / 2, sz * (d / 2 - 0.04))), color: BL });
  const lv = [0.12, h * 0.42, h * 0.78];
  for (const y of lv) for (const sz of [-1, 1]) b.add(box(w, 0.1, 0.05), "pmetal", { m: mul(m, M(0, y, sz * (d / 2 - 0.04))), color: OR });
  for (const y of lv) n.add(box(w - 0.1, 0.02, d - 0.1), "deck", { m: mul(m, M(0, y + 0.06, 0)), tile: 1.2, color: 0xb59a74 });
  // mesh back panel (dark perforated steel) so the rack reads (and blocks) as one object
  b.add(box(w - 0.1, h - 0.15, 0.02), "pmetal", { m: mul(m, M(0, h / 2, 0)), color: 0x4a4e52 });
  for (let i = 0; i < lv.length; i++) {
    const y = lv[i] + 0.07, top = (i + 1 < lv.length ? lv[i + 1] : h) - 0.12 - y;
    let x = -w / 2 + 0.15;
    while (x < w / 2 - 0.4) {
      const k = r(), iw = 0.35 + r() * 0.5;
      if (x + iw > w / 2 - 0.1) break;
      for (const sz of [-1, 1]) {
        const z = sz * (d / 4);
        if (k < 0.45) crateAt(n, mul(m, M(x + iw / 2, y, z, 0, (r() - 0.5) * 0.1, 0)), iw, Math.min(top, 0.25 + r() * 0.3), d / 2 - 0.06, seed + i * 7 + Math.round(x * 10));
        else if (k < 0.7) n.add(cyl(Math.min(iw, d / 2) / 2 - 0.02, Math.min(iw, d / 2) / 2 - 0.02, Math.min(top, 0.5), 12), "pmetal", { m: mul(m, M(x + iw / 2, y + Math.min(top, 0.5) / 2, z)), uv: "local", color: [0xb3302a, 0x3d7a3c, 0x2f5f86][Math.floor(r() * 3)] });
        else n.add(rbox(iw, Math.min(top, 0.2 + r() * 0.25), d / 2 - 0.08, 0.02), "fabric", { m: mul(m, M(x + iw / 2, y + 0.12, z)), color: [0xb8a27a, 0x8a6a4a, 0x6a7a8a][Math.floor(r() * 3)] });
      }
      x += iw + 0.08;
    }
  }
  // load-rating tags
  for (const sz of [-1, 1]) n.add(box(0.18, 0.12, 0.005), "plain", { m: mul(m, M(-w / 4, lv[1] - 0.02, sz * (d / 2 - 0.01))), color: 0xf2d23a, shadow: false });
}

/** red roll cabinet (tool chest) with drawers, handles, a top box and worn edges. Box w × d × h. */
export function rollCabinet(b: Batch, n: Batch, m: THREE.Matrix4, w: number, d: number, h: number, seed: number) {
  const RED = 0xb8342a;
  b.add(rbox(w, h - 0.12, d, 0.03), "gloss", { m: mul(m, M(0, (h - 0.12) / 2 + 0.1, 0)), color: RED });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) n.add(cyl(0.045, 0.045, 0.035, 10).rotateX(Math.PI / 2), "rubber", { m: mul(m, M(sx * (w / 2 - 0.08), 0.05, sz * (d / 2 - 0.08))), uv: "local", color: 0x1e1e1e });
  const nd = 6;
  for (let q = 0; q < nd; q++) {
    const y = 0.18 + q * (h - 0.35) / nd;
    n.add(box(w - 0.08, 0.008, 0.01), "pmetal", { m: mul(m, M(0, y + 0.06, d / 2 + 0.004)), color: 0x5a1a14 });
    n.add(box(w * 0.7, 0.025, 0.03), "chrome", { m: mul(m, M(0, y + 0.03, d / 2 + 0.015)), color: 0xbfc2c6 });
  }
  n.add(rbox(w - 0.06, 0.02, d - 0.05, 0.005), "rubber", { m: mul(m, M(0, h - 0.01, 0)), color: 0x262626 });
  n.add(rbox(0.3, 0.08, 0.06, 0.01), "chrome", { m: mul(m, M(w * 0.15, h + 0.04, 0, 0, 0.4, 0)), color: 0xbfc2c6 }); // spanner roll
  scuffs(n, mul(m, M(0, 0.1, 0)), w, h - 0.12, d, seed, RED);
}

/** galvanised washing trough on angle-iron legs: rolled rim, rivets, two brass taps on a supply pipe, water with
 *  bananas floating in it. Box w (long) × d × h (the rim top). */
export function washTrough(b: Batch, n: Batch, m: THREE.Matrix4, w: number, d: number, h: number, seed: number) {
  const GALV = 0x8f9595, r = rng(seed), tub = 0.42, y0 = h - tub;
  // tub: an open box of thin galvanised sheet (outer + inner faces), rolled rim, darker seams
  for (const s of [-1, 1]) {
    b.add(box(w - 0.04, tub, 0.03), "steel", { m: mul(m, M(0, y0 + tub / 2, s * (d / 2 - 0.035))), color: GALV });
    b.add(box(0.03, tub, d - 0.1), "steel", { m: mul(m, M(s * (w / 2 - 0.035), y0 + tub / 2, 0)), color: GALV });
  }
  b.add(box(w - 0.08, 0.03, d - 0.08), "steel", { m: mul(m, M(0, y0 + 0.015, 0)), color: 0x9da2a1 });
  for (const s of [-1, 1]) {
    const tr = new THREE.CylinderGeometry(0.03, 0.03, w, 8); tr.rotateZ(Math.PI / 2);
    n.add(tr, "steel", { m: mul(m, M(0, h - 0.02, s * (d / 2 - 0.03))), uv: "local", color: 0xc9cecd });
    const tz = new THREE.CylinderGeometry(0.03, 0.03, d - 0.06, 8); tz.rotateX(Math.PI / 2);
    n.add(tz, "steel", { m: mul(m, M(s * (w / 2 - 0.03), h - 0.02, 0)), uv: "local", color: 0xc9cecd });
  }
  for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 1.2) for (const s of [-1, 1]) n.add(box(0.02, tub - 0.04, 0.008), "steel", { m: mul(m, M(x, y0 + tub / 2, s * (d / 2 - 0.018))), color: 0x7f8584, shadow: false });
  // water (dark teal, glossy) + floating banana hands + suds
  b.add(box(w - 0.1, 0.02, d - 0.1), "gloss", { m: mul(m, M(0, h - 0.1, 0)), color: 0x2f5a58 });
  // (fruit tris are costly — a few floating hands read)
  bananaHeap(n, mul(m, M(0, h - 0.13, 0)), w - 0.5, d - 0.3, Math.min(5, Math.round(w * 0.6)), seed, 0.02, false);
  for (let k = 0; k < 10; k++) n.add(sph(0.05 + r() * 0.05, 6, 4), "plain", { m: mul(m, M((r() - 0.5) * (w - 0.3), h - 0.09, (r() - 0.5) * (d - 0.3), 0, 0, 0, 1, 0.3, 1)), color: 0xe8f0ee, shadow: false });
  // legs: angle iron, cross braces
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    n.add(box(0.05, y0, 0.05), "pmetal", { m: mul(m, M(sx * (w / 2 - 0.08), y0 / 2, sz * (d / 2 - 0.08))), color: 0x4a4c4a });
  }
  for (const sx of [-1, 1]) n.add(box(0.03, 0.03, d - 0.16), "pmetal", { m: mul(m, M(sx * (w / 2 - 0.08), 0.12, 0)), color: 0x4a4c4a });
  // supply pipe + brass taps over one long side, a drain hose
  n.add(cyl(0.025, 0.025, w * 0.9, 8).rotateZ(Math.PI / 2), "steel", { m: mul(m, M(0, h + 0.35, -d / 2 + 0.02)), uv: "local", color: 0x8a8f8e });
  for (const x of [-w * 0.25, w * 0.25]) {
    n.add(cyl(0.02, 0.02, 0.3, 8), "steel", { m: mul(m, M(x, h + 0.2, -d / 2 + 0.02)), uv: "local", color: 0x8a8f8e });
    n.add(rbox(0.06, 0.06, 0.12, 0.015), "gloss", { m: mul(m, M(x, h + 0.08, -d / 2 + 0.07)), color: 0xc7a23a });
    n.add(box(0.12, 0.015, 0.02), "gloss", { m: mul(m, M(x, h + 0.13, -d / 2 + 0.05)), color: 0xa82a22 });
  }
  n.add(cyl(0.03, 0.03, 0.6, 6), "rubber", { m: mul(m, M(w / 2 - 0.15, 0.25, d / 2 - 0.1, 0.5, 0, 0)), color: 0x262626 });
}

/** platform scale on a timber desk: weighing platform with a sack of bananas, a dial head on a column with a needle and
 *  a counterweight beam, a ledger, a lamp. Box w × d × h. */
export function scaleDesk(b: Batch, n: Batch, m: THREE.Matrix4, w: number, d: number, h: number, o: { top?: number } = {}) {
  const top = o.top ?? h * 0.62;
  // desk: thick planked top on four legs + a shelf with crates of tickets
  b.add(rbox(w, 0.06, d, 0.015), "wood", { m: mul(m, M(0, top - 0.03, 0)), tile: 0.8, color: 0x9a6a40 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(rbox(0.07, top - 0.06, 0.07, 0.01), "wood", { m: mul(m, M(sx * (w / 2 - 0.06), (top - 0.06) / 2, sz * (d / 2 - 0.06))), color: 0x6a4428 });
  b.add(box(w - 0.12, 0.03, d - 0.12), "wood", { m: mul(m, M(0, 0.18, 0)), color: 0x7a5232 });
  // scale platform (green cast iron, chequer plate) with a banana sack + a hand on it
  const px = -w * 0.2;
  b.add(rbox(w * 0.5, 0.08, d * 0.75, 0.02), "gloss", { m: mul(m, M(px, top + 0.04, 0)), color: 0x2f5a3a });
  n.add(box(w * 0.46, 0.01, d * 0.7), "steel", { m: mul(m, M(px, top + 0.085, 0)), color: 0x8a8f8a });
  // column + dial head (white face, black ticks, red needle), counterweight beam with a poise
  const hx = w * 0.3;
  b.add(rbox(0.1, h - top - 0.42, 0.1, 0.02), "gloss", { m: mul(m, M(hx, top + (h - top - 0.42) / 2, -d * 0.2)), color: 0x2f5a3a });
  const head = mul(m, M(hx, h - 0.2, -d * 0.2));
  b.add(cyl(0.2, 0.2, 0.09, 24).rotateX(Math.PI / 2), "gloss", { m: head, uv: "local", color: 0x2f5a3a });
  n.add(cyl(0.17, 0.17, 0.01, 24).rotateX(Math.PI / 2), "plain", { m: mul(head, M(0, 0, 0.05)), uv: "local", color: 0xf4efe2 });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; n.add(box(0.008, 0.03, 0.004), "plain", { m: mul(head, M(Math.sin(a) * 0.14, Math.cos(a) * 0.14, 0.056, 0, 0, -a)), color: 0x1a1a1a }); }
  n.add(box(0.008, 0.13, 0.004), "plain", { m: mul(head, M(0.03, 0.04, 0.06, 0, 0, -0.6)), color: 0xb8231c });
  n.add(cyl(0.02, 0.02, 0.01, 8).rotateX(Math.PI / 2), "chrome", { m: mul(head, M(0, 0, 0.062)), color: 0xbfc2c6 });
  n.add(box(w * 0.42, 0.025, 0.025), "steel", { m: mul(m, M(hx - w * 0.12, top + 0.32, d * 0.25)), color: 0x3a3a3a });
  n.add(rbox(0.07, 0.07, 0.05, 0.01), "steel", { m: mul(m, M(hx - w * 0.2, top + 0.32, d * 0.25)), color: 0x9a9a96 });
  // the load: a jute sack + a green hand, a ledger + pencil, ticket spike
  n.add(rbox(w * 0.36, 0.22, d * 0.42, 0.08, 3), "fabric", { m: mul(m, M(px, top + 0.2, 0, 0, 0.2, 0)), color: 0xb89c6e });
  bananaHeap(n, mul(m, M(px + 0.05, top + 0.31, 0)), w * 0.25, d * 0.25, 2, 5, 0.02, false);
  n.add(box(0.28, 0.025, 0.2), "fabric", { m: mul(m, M(w * 0.32, top + 0.012, d * 0.18, 0, 0.2, 0)), color: 0x6a2a22 });
  n.add(box(0.26, 0.004, 0.18), "plain", { m: mul(m, M(w * 0.32, top + 0.027, d * 0.18, 0, 0.2, 0)), color: 0xf2ead2 });
  n.add(cyl(0.005, 0.005, 0.15, 4).rotateZ(Math.PI / 2), "wood", { m: mul(m, M(w * 0.3, top + 0.035, d * 0.15)), color: 0xd9a62a });
  n.add(cyl(0.004, 0.004, 0.14, 4), "steel", { m: mul(m, M(-w * 0.45, top + 0.07, d * 0.3)), color: 0x555555 });
}

/**
 * strapped straw bale filling box w × h × d (strands along local z): bulged sides, streaky straw colour from many
 * thin stalk bands, two twine straps, a ragged fringe of loose stalks at both cut ends.
 */
export function strawBale(b: Batch, n: Batch, m: THREE.Matrix4, w: number, h: number, d: number, seed: number) {
  const g = new THREE.BoxGeometry(w - 0.02, h - 0.02, d - 0.02, 6, 4, 10);
  const p = g.attributes.position, colA: number[] = [], r = rng(seed);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i); const z = p.getZ(i);
    const ex = Math.abs(x) / (w / 2), ey = Math.abs(y) / (h / 2);
    // rounded edges (pulled in at the corners) + a soft bulge
    const k = Math.max(0, ex + ey - 1.55) * 0.18;
    x -= Math.sign(x) * k; y -= Math.sign(y) * k;
    const bulge = 0.012 * (1 - (2 * z / d) ** 2);
    x += Math.sign(x) * bulge * (ex > 0.95 ? 1 : 0); y += Math.sign(y) * bulge * (ey > 0.95 ? 1 : 0);
    p.setXYZ(i, x, y, z);
    // straw streaks: colour bands across x / y (constant along z = the stalks' direction)
    const s = Math.sin((x + y) * 61 + seed) * 0.5 + Math.sin((x - y) * 37 + seed * 3) * 0.5;
    const c = new THREE.Color(0xd8b45a).lerp(new THREE.Color(0xa8823a), 0.5 + 0.5 * s).multiplyScalar(0.9 + 0.15 * r());
    colA.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colA, 3));
  g.computeVertexNormals();
  b.add(g, "fabric", { m: mul(m, M(0, h / 2, 0)), uv: "local", tile: 0.4, color: 0xffffff, aoY: 0, aoRange: h, aoMin: 0.7 });
  // twine straps (two bands round the short axis)
  for (const zz of [-d * 0.25, d * 0.25]) {
    for (const s of [-1, 1]) {
      n.add(box(w + 0.004, 0.012, 0.025), "fabric", { m: mul(m, M(0, h / 2 + s * (h / 2 - 0.004), zz)), color: 0x8a5a2a });
      n.add(box(0.012, h + 0.004, 0.025), "fabric", { m: mul(m, M(s * (w / 2 - 0.004), h / 2, zz)), color: 0x8a5a2a });
    }
  }
  // fringe: loose stalks poking out of the cut ends
  for (const s of [-1, 1]) for (let k = 0; k < 16; k++) {
    const x = (r() - 0.5) * (w - 0.08), y = 0.04 + r() * (h - 0.08), L = 0.04 + r() * 0.06;
    n.add(box(0.006, 0.006, L), "fabric", { m: mul(m, M(x, y, s * (d / 2 - 0.01), (r() - 0.5) * 0.8, (r() - 0.5) * 0.8, 0)), color: 0xe2c470, shadow: false });
  }
}

/**
 * open-riser timber stair (two stringers, treads with nosings, a hand rail on posts on the open side). The flight
 * climbs from (x, y0, z0) along +dir… given as the shared layout's tread boxes so every tread is drawn exactly at its
 * collider: `treads` = [cx, top y, cz, half w across, half run along, yaw].
 */
export function timberStair(b: Batch, n: Batch, treads: Array<[number, number, number, number, number, number]>, o: { railSide?: 1 | -1; color?: number } = {}) {
  if (!treads.length) return;
  const C = o.color ?? 0x9a6a40, side = o.railSide ?? 1;
  for (const [cx, ty, cz, hw, hr, yaw] of treads) {
    b.add(rbox(2 * hw, 0.05, 2 * hr + 0.03, 0.012), "wood", { m: M(cx, ty - 0.025, cz, 0, yaw, 0), tile: 0.9, color: C });
    n.add(box(2 * hw - 0.02, 0.025, 0.02), "wood", { m: mul(M(cx, ty - 0.06, cz, 0, yaw, 0), M(0, 0, hr - 0.02)), color: 0x6a4428 });
  }
  // stringers: from the first to the last tread, under both ends
  const a = treads[0], z = treads[treads.length - 1], yaw = a[5], hw = a[3];
  const dx = z[0] - a[0], dy = z[1] - a[1], dz = z[2] - a[2], L = Math.hypot(dx, dz), run = a[4] * 2;
  const pitch = Math.atan2(dy, L), len = Math.hypot(L + run, dy + 0.1);
  for (const s of [-1, 1]) {
    const off = new THREE.Vector3(s * (hw - 0.03), 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const mid = new THREE.Vector3((a[0] + z[0]) / 2, (a[1] + z[1]) / 2 - 0.16, (a[2] + z[2]) / 2).add(off);
    const fwd = Math.atan2(dx, dz);
    b.add(rbox(0.05, 0.26, len, 0.01), "wood", { m: M(mid.x, mid.y, mid.z, -pitch, fwd, 0), color: 0x7a5232 });
  }
  // hand rail on the open side: posts at the first, middle and last tread + a sloped rail
  const off = new THREE.Vector3(side * (hw - 0.03), 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const pts = [a, treads[Math.floor(treads.length / 2)], z];
  for (const p of pts) n.add(box(0.05, 0.95, 0.05), "wood", { m: M(p[0] + off.x, p[1] + 0.475, p[2] + off.z), color: 0x6a4428 });
  const mid = new THREE.Vector3((a[0] + z[0]) / 2 + off.x, (a[1] + z[1]) / 2 + 0.92, (a[2] + z[2]) / 2 + off.z);
  n.add(rbox(0.06, 0.05, Math.hypot(L, dy) + 0.1, 0.015), "wood", { m: M(mid.x, mid.y, mid.z, -pitch, Math.atan2(dx, dz), 0), color: 0x8a5a36 });
}

/** a faceted boulder that fills box w × h × d (base at y 0): a subdivided box, corners + edges pulled in, noise dents,
 *  flat-shaded facets (chunky stylised rock), sunk a little into the ground */
export function rockBlock(b: Batch, m: THREE.Matrix4, w: number, h: number, d: number, seed: number, o: { color?: THREE.ColorRepresentation; lod?: 0 | 1 | 2; tile?: number; seg?: number } = {}) {
  const sg = o.seg ?? 4, g0 = new THREE.BoxGeometry(w, h + 0.1, d, sg, Math.max(3, Math.round(sg * 0.75)), sg);
  const p = g0.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ux = Math.abs(x) / (w / 2), uy = Math.abs(y) / ((h + 0.1) / 2), uz = Math.abs(z) / (d / 2);
    const corner = Math.max(0, (ux > 0.9 ? 1 : 0) + (uy > 0.9 && y > 0 ? 1 : 0) + (uz > 0.9 ? 1 : 0) - 1);
    const nse = Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 1.3) * 0.5 + Math.sin(y * 4.3 + seed * 0.7) * 0.5;
    const pull = 0.16 * corner + 0.05 * (1 + nse);
    const k = Math.max(0.55, 1 - pull / Math.max(0.3, Math.min(w, h, d) / 2));
    p.setXYZ(i, x * (ux > 0.5 ? k : 1), y > 0 ? y * (uy > 0.5 ? k + (1 - k) * 0.4 : 1) : y, z * (uz > 0.5 ? k : 1));
  }
  const g = g0.toNonIndexed(); g.computeVertexNormals();
  b.add(g, "gBoulder", { m: mul(m, M(0, (h + 0.1) / 2 - 0.1, 0)), uv: "box", tile: o.tile ?? 2.2, color: o.color ?? 0xd8d4cc, aoY: 0, aoRange: Math.min(h, 6), aoMin: 0.6, lod: o.lod });
}

/** cab-over box van (BANANA CO. delivery), nose +x, filling the shared van boxes: chassis between the wheels
 *  (x ±2.2, z ±0.9, y 0–0.6), cargo box (x −2.6…0.9, y 0.6–2.3), cab (x 0.9–2.6, y 0.6–2.0) */
export function boxVan(b0: Batch, n0: Batch, m: THREE.Matrix4, seed: number) {
  const b = grimy(b0, m, 1.2, 0.6), n = grimy(n0, m, 1.2, 0.6);
  const PAINT = [0xf2efe6, 0x3f7fb0, 0xd9a62a][seed % 3], r = rng(seed);
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => mul(m, M(x, y, z, rx, ry, rz));
  // chassis + skirts (dark) + bumpers
  b.add(rbox(4.4, 0.36, 1.78, 0.04), "pmetal", { m: at(0, 0.42, 0), color: 0x2a2a2a });
  for (const s of [-1, 1]) b.add(box(2.2, 0.26, 0.05), "pmetal", { m: at(-0.5, 0.45, s * 0.88), color: 0x333333 });
  b.add(rbox(0.18, 0.28, 2.04, 0.04), "pmetal", { m: at(2.52, 0.5, 0), color: 0x3a3a3a });
  b.add(rbox(0.16, 0.24, 2.0, 0.04), "pmetal", { m: at(-2.52, 0.48, 0), color: 0x3a3a3a });
  // cargo box: panelled sides, roof rails, rear doors with hinges, BANANA CO. livery, rust + dents
  b.add(rbox(3.5, 1.7, 2.08, 0.06), "gloss", { m: at(-0.85, 1.45, 0), color: PAINT });
  for (let x = -2.4; x < 0.8; x += 0.7) for (const s of [-1, 1]) n.add(box(0.05, 1.5, 0.02), "gloss", { m: at(x, 1.45, s * 1.045), color: new THREE.Color(PAINT).multiplyScalar(0.86) });
  for (const s of [-1, 1]) {
    b.add(box(3.3, 0.22, 0.012), "gloss", { m: at(-0.85, 1.0, s * 1.046), color: 0xd23a2a });
    textDecal(n, "THE FEED", 2.4, 0.42, at(-0.9, 1.6, s * 1.05, 0, s > 0 ? 0 : Math.PI, 0), { fg: "#2a4f6f", bg: null, font: 900 });
    n.add(cyl(0.025, 0.025, 3.3, 6).rotateZ(Math.PI / 2), "steel", { m: at(-0.85, 2.33, s * 0.9), uv: "local", color: 0x8a8a86 });
  }
  n.add(box(0.012, 1.5, 0.02), "pmetal", { m: at(-2.61, 1.45, 0), color: 0x333333 });
  for (const s of [-1, 1]) for (const y of [0.9, 2.0]) n.add(box(0.04, 0.12, 0.08), "steel", { m: at(-2.62, y, s * 0.95), color: 0x6a6a68 });
  n.add(rbox(0.04, 0.05, 0.6, 0.01), "chrome", { m: at(-2.62, 1.3, -0.4), color: 0xbfc2c6 });
  // cab: flat front with a big windshield, side windows, grille, headlamps, mirrors, wipers, a roof beacon
  b.add(rbox(1.7, 1.4, 2.0, 0.12), "gloss", { m: at(1.75, 1.3, 0), color: PAINT });
  b.add(rbox(0.04, 0.62, 1.7, 0.03), "darkGlass", { m: at(2.6, 1.6, 0) });
  for (const s of [-1, 1]) b.add(rbox(0.9, 0.55, 0.04, 0.03), "darkGlass", { m: at(1.85, 1.6, s * 1.0) });
  b.add(rbox(0.04, 0.4, 1.3, 0.02), "pmetal", { m: at(2.61, 0.95, 0), color: 0x2a2a2a });
  for (const s of [-1, 1]) {
    n.add(rbox(0.05, 0.16, 0.3, 0.03), "lamp", { m: at(2.62, 0.95, s * 0.78) });
    n.add(rbox(0.05, 0.28, 0.16, 0.02), "pmetal", { m: at(2.55, 1.7, s * 1.1), color: 0x222222 });
    n.add(box(0.02, 0.02, 0.6), "pmetal", { m: at(2.63, 1.32, s * 0.4, 0.4 * s, 0, 0), color: 0x111111 });
    b.add(cyl(0.38, 0.38, 0.26, 16).rotateX(Math.PI / 2), "rubber", { m: at(1.65, 0.38, s * 0.92), uv: "local", color: 0x1e1e1e });
    b.add(cyl(0.38, 0.38, 0.26, 16).rotateX(Math.PI / 2), "rubber", { m: at(-1.7, 0.38 - (s > 0 && seed % 2 ? 0.08 : 0), s * 0.92), uv: "local", color: 0x1e1e1e }); // one flat tyre
    for (const x of [1.65, -1.7]) n.add(cyl(0.2, 0.2, 0.03, 12).rotateX(Math.PI / 2), "steel", { m: at(x, 0.38, s * 1.06), uv: "local", color: 0x8a8a86 });
  }
  n.add(cyl(0.1, 0.12, 0.14, 10), "lamp", { m: at(1.8, 2.07, 0), color: 0xffa21e });
  // grime: dark road dirt along the bottom of both sides, rust streaks from the roof rails, a dent
  for (const s of [-1, 1]) {
    n.add(box(4.9, 0.3, 0.012), "pmetal", { m: at(-0.05, 0.75, s * 1.05), color: 0x4a3a2a, shadow: false });
    for (let k = 0; k < 4; k++) n.add(box(0.05, 0.3 + r() * 0.5, 0.012), "pmetal", { m: at(-2.3 + r() * 3, 2.0 - r() * 0.3, s * 1.047), color: 0x7a4a32, shadow: false });
  }
}
