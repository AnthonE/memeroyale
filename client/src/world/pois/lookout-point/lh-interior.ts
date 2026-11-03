// LOOKOUT POINT — the lighthouse interior:
// the stair hangs on the wall with an iron balustrade on its open edge, a cast-iron column carries timber floors
// (store → oil room → watch room → lens store) that you step onto from the stair, each with a panelled dado, wall
// lamps with warm pools, a pendant under the floor above and its own props — every prop, rail panel and floor drawn
// at exactly its shared collider (shared/pois/lookout-point.ts LH_PROPS / lh:rail / lh:floorW / lh:column).
import * as THREE from "three";
import * as L from "../../../../../shared/pois/lookout-point";
import { rng } from "../../../../../shared/pois/coast-kit";
import { Batch, M, box, rbox, cyl, sph, lathe, lightPoolMat } from "../_kit/coast-kit";
import * as P from "../_kit/coast-props";
import { crateBlock, shelfUnit } from "../peel-strip/coast-dress";
import { textDecal } from "../_kit/coast-sign";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
const IRON = 0x2a2a2c, OAK = 0x9a6a40, DADO = 0x7a2a22;

export function lighthouseInterior(b: Batch, n: Batch, glows: Array<{ p: THREE.Vector3; size: number }>) {
  const { x, y, z } = L.LH, T = L.LH.top - y;
  const at = (px = 0, py = 0, pz = 0) => M(x + px, y + py, z + pz);
  const rAt = (h: number) => L.lhRadius(y + h) - L.LH.wall;
  const polar = (a: number, r: number, h: number, yaw = 0) => M(x + Math.cos(a) * r, y + h, z + Math.sin(a) * r, 0, Math.PI / 2 - a + yaw, 0);
  // ---- the floors: oak boards on the collider octagon, an iron edge band, joists underneath, a round rag rug
  for (const [fi, h] of L.LH_FLOORS.entries()) {
    const R = L.lhFloorR(h);
    b.add(cyl(R, R, 0.25, 8), "deck", { m: at(0, h - 0.125, 0), uv: "box", tile: 2.0, color: 0xc49a6a });
    const band = new THREE.CylinderGeometry(R + 0.01, R + 0.01, 0.12, 8, 1, true);
    b.add(band, "pmetal", { m: at(0, h - 0.07, 0), uv: "local", color: IRON });
    for (const a of [0, Math.PI / 2]) b.add(box(2 * R * 0.92, 0.18, 0.14), "wood", { m: mul(at(0, h - 0.34, 0), M(0, 0, 0, 0, a, 0)), color: 0x6a4428 });
    if (fi < 2) {
      const rug = new THREE.CircleGeometry(R * 0.55, 24); rug.rotateX(-Math.PI / 2);
      n.add(rug, "fabric", { m: at(0, h + 0.012, 0), uv: "keep", color: [0x9a3a2a, 0x2f5f86][fi], shadow: false });
      const ring2 = new THREE.RingGeometry(R * 0.4, R * 0.46, 24); ring2.rotateX(-Math.PI / 2);
      n.add(ring2, "fabric", { m: at(0, h + 0.016, 0), uv: "keep", color: 0xe0c070, shadow: false });
    }
    // the floor's name plate on the column
    textDecal(n, ["OIL ROOM", "WATCH ROOM", "LENS STORE"][fi], 0.7, 0.16, mul(at(0, h + 1.6, 0), M(0, 0, 0.235)), { fg: "#f2ead2", bg: "#2a3a2a", font: 800 });
  }
  // ground room floor: worn flagstones (the drawn floor), a painted compass rose
  // ---- the cast-iron column with a collar under every floor
  b.add(cyl(0.22, 0.24, T - 0.25, 14), "gloss", { m: at(0, (T - 0.25) / 2, 0), uv: "local", color: 0x1f3a2a });
  for (const h of [0.15, ...L.LH_FLOORS.map((q) => q - 0.4), T - 0.5]) b.add(cyl(0.3, 0.26, 0.2, 14), "gloss", { m: at(0, h, 0), uv: "local", color: 0x1a2f22 });
  // ---- iron balustrade on the stair's open edge: a panel + a handrail cap per tread (= each lh:rail collider)
  for (const p of L.PIECES) {
    if (p.k !== "lh:rail") continue;
    const m = M(p.c[0], p.c[1], p.c[2], 0, p.yaw ?? 0, 0), len = p.h[2] * 2, hh = p.h[1] * 2;
    // balusters every ~0.16 m (rays through the gaps still meet a bar within the collider tolerance), top + bottom rail
    const nb = Math.max(3, Math.round(len / 0.16));
    for (let k = 0; k < nb; k++) n.add(box(0.022, hh - 0.1, 0.022), "pmetal", { m: mul(m, M(0, -0.03, -len / 2 + (k + 0.5) * len / nb)), color: IRON });
    b.add(rbox(0.07, 0.05, len + 0.02, 0.015), "wood", { m: mul(m, M(0, hh / 2 - 0.02, 0)), color: OAK });
    b.add(box(0.04, 0.04, len), "pmetal", { m: mul(m, M(0, -hh / 2 + 0.06, 0)), color: IRON });
  }
  // ---- a red panelled dado round the wall in every room (floor → +1.05 m), a picture rail above it
  for (const h of [0.12, ...L.LH_FLOORS]) {
    const r0 = rAt(h) - 0.035, r1 = rAt(h + 1.05) - 0.035;
    const ig = h < 0.5 ? L.LH.doorW / 2 / r0 + 0.04 : 0;
    const g = lathe([[r0, 0], [r1, 1.05]], { a0: h < 0.5 ? L.LH.doorA + ig : 0, a1: h < 0.5 ? L.LH.doorA + Math.PI * 2 - ig : Math.PI * 2, segs: 48, inner: true, tile: 1.2 });
    b.add(g, "wood", { m: at(0, h, 0), uv: "keep", color: DADO });
    const rail = new THREE.TorusGeometry(r1 - 0.02, 0.035, 4, 48); rail.rotateX(Math.PI / 2);
    n.add(rail, "wood", { m: at(0, h + 1.08, 0), uv: "local", color: 0x5a2018 });
  }
  // ---- props at their boxes
  const r = rng(717);
  for (const p of L.PIECES) {
    if (!p.k.startsWith("lh:") || !["lh:crates", "lh:drums", "lh:chest", "lh:shelf", "lh:desk", "lh:lens"].includes(p.k)) continue;
    const [hw, hh, hd] = p.h, yaw = p.yaw ?? 0, base = p.c[1] - hh;
    const m = M(p.c[0], base, p.c[2], 0, yaw, 0);
    if (p.k === "lh:crates") crateBlock(n, -hw, 0, -hd, hw, 2 * hh, hd, 731, { m });
    else if (p.k === "lh:drums") {
      const cols = [0xb3302a, 0x3d7a3c, 0x2f5f86, 0xb3302a];
      for (let i = 0; i < 4; i++) { const dx = (i % 2 ? 1 : -1) * (hw - 0.3), dz = (i < 2 ? 1 : -1) * (hd - 0.3); if (hw < 0.55 && i % 2) continue; P.drum(n, mul(m, M(hw < 0.55 ? 0 : dx, 0, dz, 0, r() * 6, 0)), cols[i]); }
      textDecal(n, "LAMP OIL", 0.5, 0.14, mul(m, M(0, 0.55, hd + 0.01)), { fg: "#f2ead2", bg: null, font: 900, stencil: true });
    } else if (p.k === "lh:chest") {
      n.add(rbox(2 * hw, 2 * hh * 0.7, 2 * hd, 0.03), "wood", { m: mul(m, M(0, hh * 0.7, 0)), color: 0x6a3f24 });
      n.add(rbox(2 * hw + 0.02, 2 * hh * 0.3, 2 * hd + 0.02, 0.06), "wood", { m: mul(m, M(0, 2 * hh * 0.85, 0)), color: 0x5a3520 });
      for (const s of [-0.3, 0.3]) n.add(box(0.05, 2 * hh + 0.01, 2 * hd + 0.01), "steel", { m: mul(m, M(s * 2 * hw, hh, 0)), color: 0x3a3430 });
      n.add(rbox(0.12, 0.14, 0.04, 0.01), "chrome", { m: mul(m, M(0, 2 * hh * 0.7, hd + 0.02)), color: 0xd8b25a });
    } else if (p.k === "lh:shelf") {
      const fr = n.frame.clone(); n.frame = mul(fr, m);
      shelfUnit(n, -hw, 0, -hd, hw, 2 * hh, hd, 741 + Math.round(base), { color: 0x6e4a30 });
      n.frame = fr;
    } else if (p.k === "lh:desk") {
      // the keeper's watch desk: oak top on panelled pedestals, the logbook, a brass lamp, a VHF set, a mug
      n.add(rbox(2 * hw, 0.06, 2 * hd, 0.015), "wood", { m: mul(m, M(0, 2 * hh - 0.03, 0)), color: OAK });
      for (const s of [-1, 1]) n.add(rbox(0.42, 2 * hh - 0.06, 2 * hd - 0.06, 0.02), "wood", { m: mul(m, M(s * (hw - 0.22), hh - 0.03, 0)), color: 0x7a5232 });
      n.add(box(0.36, 0.03, 0.26), "fabric", { m: mul(m, M(-0.1, 2 * hh + 0.015, 0, 0, 0.2, 0)), color: 0x2a4f6f });
      n.add(box(0.34, 0.005, 0.24), "plain", { m: mul(m, M(-0.1, 2 * hh + 0.033, 0, 0, 0.2, 0)), color: 0xf2ead2 });
      n.add(rbox(0.42, 0.18, 0.26, 0.02), "pmetal", { m: mul(m, M(hw - 0.3, 2 * hh + 0.09, -0.05)), color: 0x3d5a45 });
      for (let k = 0; k < 3; k++) n.add(cyl(0.025, 0.025, 0.02, 8).rotateX(Math.PI / 2), "chrome", { m: mul(m, M(hw - 0.4 + k * 0.08, 2 * hh + 0.1, 0.085)), uv: "local", color: 0xd8d8d0 });
      n.add(cyl(0.012, 0.012, 0.3, 6), "chrome", { m: mul(m, M(-hw + 0.2, 2 * hh + 0.15, -0.1)), color: 0xc7a23a });
      n.add(sph(0.06, 8, 6), "lamp", { m: mul(m, M(-hw + 0.2, 2 * hh + 0.32, -0.1)) });
      n.add(cyl(0.04, 0.035, 0.09, 10), "plain", { m: mul(m, M(0.25, 2 * hh + 0.045, 0.12)), color: 0xe8e2d6 });
      glows.push({ p: new THREE.Vector3().setFromMatrixPosition(mul(m, M(-hw + 0.2, 2 * hh + 0.32, -0.1))), size: 0.9 });
    } else if (p.k === "lh:lens") {
      // a spare Fresnel lens panel in its open crate: stepped glass rings on a brass frame
      crateBlock(n, -hw, 0, -hd, hw, 2 * hh * 0.55, hd, 751, { m });
      for (let k = 0; k < 5; k++) { const tg = new THREE.TorusGeometry(0.12 + k * 0.07, 0.025, 4, 24); n.add(tg, "glass", { m: mul(m, M(0, 2 * hh * 0.55 + 0.32, 0.05, -0.2, 0, 0)), uv: "local", shadow: false }); }
      n.add(new THREE.TorusGeometry(0.47, 0.03, 4, 28), "gloss", { m: mul(m, M(0, 2 * hh * 0.55 + 0.32, 0.05, -0.2, 0, 0)), uv: "local", color: 0xc7a23a });
    }
  }
  // ---- light: two wall lamps per room + a pendant under the floor above, each with a warm pool on the floor below
  for (const [k, h] of [0, ...L.LH_FLOORS].entries()) {
    const arr = k === 0 ? L.LH.doorA + Math.PI : L.lhArrival(h).a + Math.PI;
    for (const da of [-1.1, 1.1]) {
      const a = arr + da, rw = rAt(h + 2.1) - 0.02;
      const lm = M(x + Math.cos(a) * rw, y + h + 2.1, z + Math.sin(a) * rw, 0, -Math.PI / 2 - a, 0);
      glows.push({ p: P.wallLamp(n, lm), size: 1.0 });
      const wash = new THREE.CircleGeometry(1.2, 18);
      n.add(wash, lightPoolMat(), { m: mul(lm, M(0, 0.1, 0.03)), uv: "keep", shadow: false });
    }
    const ceil = k < L.LH_FLOORS.length ? L.LH_FLOORS[k] : T;
    const hang = polar(arr, 0.9, ceil - 0.55);
    n.add(cyl(0.008, 0.008, 0.3, 4), "steel", { m: mul(hang, M(0, 0.15, 0)), color: 0x222222 });
    n.add(cyl(0.1, 0.22, 0.2, 12, true), "pmetal", { m: hang, color: 0x2f5a3a });
    n.add(sph(0.1, 10, 8), "lamp", { m: mul(hang, M(0, -0.08, 0)) });
    const pl = new THREE.CircleGeometry(2.2, 20); pl.rotateX(-Math.PI / 2);
    n.add(pl, lightPoolMat(), { m: polar(arr, 0.9, h + 0.03), uv: "keep", shadow: false });
    glows.push({ p: new THREE.Vector3().setFromMatrixPosition(hang), size: 1.3 });
  }
  // ---- ground room: a painted compass rose on the flags, a coiled hawser, a notice board by the door
  { const cr = new THREE.CircleGeometry(1.1, 32); cr.rotateX(-Math.PI / 2); n.add(cr, "paint", { m: at(0, 0.125, 0), uv: "keep", color: 0x2f5f86, shadow: false });
    for (let k = 0; k < 8; k++) { const sp = new THREE.PlaneGeometry(0.18, k % 2 ? 0.7 : 1.2); sp.translate(0, k % 2 ? 0.35 : 0.6, 0); sp.rotateX(-Math.PI / 2); n.add(sp, "paint", { m: mul(at(0, 0.128, 0), M(0, 0, 0, 0, (k * Math.PI) / 4, 0)), uv: "keep", color: k % 2 ? 0xe0c070 : 0xf2ead2, shadow: false }); } }
  { const a = L.LH.doorA + 0.55, rw = rAt(1.6) - 0.03; const nb = M(x + Math.cos(a) * rw, y + 1.6, z + Math.sin(a) * rw, 0, -Math.PI / 2 - a, 0);
    n.add(rbox(0.9, 0.6, 0.03, 0.01), "wood", { m: nb, color: 0x8a5a36 });
    for (let k = 0; k < 4; k++) n.add(box(0.18, 0.22, 0.005), "plain", { m: mul(nb, M(-0.3 + k * 0.2, (k % 2 ? 0.08 : -0.06), 0.02, 0, 0, (k - 1.5) * 0.08)), color: [0xf2ead2, 0xe8d090, 0xd8e8f0, 0xf2ead2][k] });
    textDecal(n, "KEEPER'S NOTICES", 0.8, 0.1, mul(nb, M(0, 0.24, 0.022)), { fg: "#2a1a10", bg: null, font: 800 }); }
}
