// THE MURK room dressing: the storytelling props shared/pois/the-murk.ts ROOM_DRESS places on top of the
// interiors kit's furniture — a fisherman's / boat-wright's gear on the walls, low clutter on the floor, the table set
// for supper. Each piece is modelled here in its own frame: x along the wall, +z out of the wall into the room, y up
// from its base (wall-hung pieces: from the bottom of their hanging band). Solid pieces carry shared colliders.
import * as THREE from "three";
import { M, col, cylGeo, chamferBoxGeo, tubeGeo, catenary } from "../_kit/town-geo";
import type { TownBins } from "../_kit/town-materials";
import type { Dress } from "../../../../../shared/pois/the-murk";
import { murkLantern, ROPE } from "./geo";

const IRON = "#2e2a26", BONE = "#e2d6b8", PAPER = "#d9c9a0";
type T = (x: number, y: number, z: number, yaw?: number, pitch?: number, roll?: number) => THREE.Matrix4;

function peg(b: TownBins, t: T, x: number, y: number) { b.wood.add(cylGeo(0.018, 0.022, 0.09, 6), t(x, y, 0.045, 0, Math.PI / 2), col("#4a3624")); }
function fish(b: TownBins, t: T, x: number, y: number, z: number, len: number, c: string, roll = 0, hang = false) {
  // a body (squashed ellipsoid), a forked tail, a dorsal fin, an eye — head up when hanging
  const m = t(x, y, z, 0, 0, hang ? Math.PI / 2 : roll);
  const body = new THREE.SphereGeometry(0.5, 12, 8); body.scale(len, len * 0.26, len * 0.11);
  b.plastic.add(body, m, col(c));
  const tail = new THREE.ConeGeometry(len * 0.13, len * 0.22, 3); tail.rotateZ(Math.PI / 2); tail.scale(1, 1, 0.25);
  b.plastic.add(tail, m.clone().multiply(M(-len * 0.56, 0, 0)), col(c, 0.8));
  const fin = new THREE.ConeGeometry(len * 0.08, len * 0.14, 3); fin.scale(1.6, 1, 0.2);
  b.plastic.add(fin, m.clone().multiply(M(len * 0.05, len * 0.15, 0)), col(c, 0.75));
  b.metal.add(new THREE.SphereGeometry(len * 0.025, 6, 4), m.clone().multiply(M(len * 0.36, len * 0.04, len * 0.05)), col("#111111"));
}

/** one dressing piece (its world frame `at` = room frame × piece position / facing) */
export function addDress(nb: TownBins, fb: TownBins, at: THREE.Matrix4, dr: Dress, rng: () => number, extra: THREE.Object3D[], signMat: THREE.Material | null) {
  const t: T = (x, y, z, yaw = 0, pitch = 0, roll = 0) => at.clone().multiply(M(x, y, z, yaw, pitch, roll));
  const h = dr.h, w = dr.w, d = dr.d;
  switch (dr.kind) {
    case "stove": {
      // a cast-iron pot-belly stove on legs: body, a glowing door grate, the ash lip, a kettle on top
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) fb.metal.add(cylGeo(0.025, 0.035, 0.16, 6), t(x * (w / 2 - 0.12), 0.08, z * (d / 2 - 0.12)), col(IRON));
      fb.metal.add(cylGeo(0.3, 0.26, h - 0.3, 16), t(0, 0.16 + (h - 0.3) / 2, 0), col("#2a2624"));
      fb.metal.add(cylGeo(0.34, 0.34, 0.05, 16), t(0, h - 0.12, 0), col("#3a3430"));
      fb.metal.add(cylGeo(0.28, 0.32, 0.04, 16), t(0, 0.18, 0), col("#3a3430"));
      fb.metal.box(0.24, 0.2, 0.02, t(0, 0.42, 0.27), col("#3a3430"));
      fb.bulb.box(0.18, 0.04, 0.01, t(0, 0.37, 0.282), col("#ff7a2a"));
      fb.bulb.box(0.18, 0.04, 0.01, t(0, 0.45, 0.282), col("#ffa040"));
      fb.metal.add(cylGeo(0.09, 0.11, 0.14, 12), t(-0.14, h + 0.03 - 0.12, 0.08), col("#5a6a6a"));
      fb.metal.add(cylGeo(0.012, 0.012, 0.12, 5), t(-0.04, h + 0.06 - 0.12, 0.08, 0, 0, 1.0), col("#5a6a6a"));
      break;
    }
    case "flue": {
      // the stove pipe up through the ceiling / roof boards to the chimney, with a damper collar and a wall strap
      nb.metal.add(cylGeo(0.075, 0.075, h, 12, true), t(0, h / 2, 0), col("#2a2624"));
      nb.metal.add(cylGeo(0.085, 0.085, 0.06, 12), t(0, Math.min(0.5, h * 0.3), 0), col("#3a3430"));
      nb.metal.add(cylGeo(0.13, 0.13, 0.03, 12), t(0, h - 0.02, 0), col("#3a3430"));
      break;
    }
    case "oars": {
      // two oars crossed on pegs: one with a sun-faded red blade, one bare
      for (const s of [-1, 1]) {
        const m = t(0, h / 2, 0.05, 0, 0, s * 0.32);
        nb.wood.add(cylGeo(0.021, 0.024, w, 8), m.clone().multiply(M(0, 0, 0, 0, 0, Math.PI / 2)), col("#b08a5c"));
        nb.wood.add(chamferBoxGeo(0.42, 0.15, 0.02, 0.008), m.clone().multiply(M(s * (w / 2 - 0.2), 0, 0)), col(s > 0 ? "#a8452e" : "#c09a6a"));
        nb.wood.add(cylGeo(0.026, 0.026, 0.14, 8), m.clone().multiply(M(-s * (w / 2 - 0.06), 0, 0, 0, 0, Math.PI / 2)), col("#6a4a2e"));
      }
      peg(nb, t, -0.3, h / 2 - 0.06); peg(nb, t, 0.3, h / 2 - 0.06);
      break;
    }
    case "rods": {
      // a wall rack (two notched battens) holding three rods: cork grips, reels, tapering blanks
      for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) nb.wood.add(chamferBoxGeo(0.07, h, 0.05, 0.01), t(x, h / 2, 0.025), col("#6a4a30"));
      for (let i = 0; i < 3; i++) {
        const y = 0.16 + i * 0.2, m = t(0, y, 0.09, 0, 0, (i - 1) * 0.04);
        nb.plastic.add(cylGeo(0.006, 0.012, w + 0.2, 6), m.clone().multiply(M(0.1, 0, 0, 0, 0, Math.PI / 2)), col(["#2e3a2e", "#6a2a22", "#2a2e3e"][i]));
        nb.wood.add(cylGeo(0.017, 0.017, 0.26, 8), m.clone().multiply(M(-w / 2 + 0.12, 0, 0, 0, 0, Math.PI / 2)), col("#b8946a"));
        nb.metal.add(cylGeo(0.035, 0.035, 0.03, 10), m.clone().multiply(M(-w / 2 + 0.32, -0.03, 0, 0, Math.PI / 2)), col("#8a8a84"));
      }
      break;
    }
    case "trophy": {
      // THE catch: a mounted swamp catfish on an oval plaque + a brass plate
      const plaque = cylGeo(0.5, 0.5, 0.04, 20); plaque.rotateX(Math.PI / 2); plaque.scale(w * 0.95, h * 0.95, 1);
      nb.wood.add(plaque, t(0, h / 2, 0.02), col("#5a3a22"));
      fish(nb, t, 0, h / 2, 0.08, w * 0.8, "#6a6a3e", -0.08);
      // barbels (whiskers)
      for (const s of [-1, 1]) nb.plastic.add(tubeGeo([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.08, s * 0.04, 0.02), new THREE.Vector3(0.16, s * 0.07, 0.03)].map((p) => p.applyMatrix4(t(w * 0.36, h / 2 - 0.02, 0.1))), 0.004, 3, false, 4), null, col("#3a3a22"));
      nb.bronze.add(chamferBoxGeo(0.2, 0.05, 0.01, 0.004), t(0, 0.05, 0.045), col("#c8a050"));
      break;
    }
    case "ropecoil": {
      peg(nb, t, 0, h - 0.06);
      for (let i = 0; i < 3; i++) { const tor = new THREE.TorusGeometry(0.17 - i * 0.012, 0.026, 6, 20); tor.scale(1, 1.25, 1); nb.rope.add(tor, t((i - 1) * 0.02, h / 2 - 0.02, 0.06 + i * 0.012), col(ROPE, 0.9 + i * 0.06)); }
      break;
    }
    case "chart": {
      // a swamp chart pinned to the boards: parchment, ink channels, a red X, the four pins
      nb.plastic.add(chamferBoxGeo(w, h, 0.008, 0.002), t(0, h / 2, 0.006, 0, 0, (dr.v - 0.5) * 0.08), col(PAPER));
      for (let i = 0; i < 6; i++) nb.plastic.box(0.16 + rng() * 0.3, 0.012, 0.004, t((rng() - 0.5) * w * 0.7, h * (0.15 + rng() * 0.7), 0.012, 0, 0, (rng() - 0.5) * 1.6), col("#4a5a6a"));
      for (const r of [0.6, -0.6]) nb.plastic.box(0.1, 0.018, 0.004, t(w * 0.18, h * 0.62, 0.013, 0, 0, r), col("#b02a1e"));
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) nb.metal.add(new THREE.SphereGeometry(0.012, 5, 3), t(x * (w / 2 - 0.03), h / 2 + y * (h / 2 - 0.03), 0.014), col("#a03020"));
      break;
    }
    case "fishline": {
      // fish drying on a line between two nails
      const a = new THREE.Vector3(-w / 2, h - 0.04, 0.06).applyMatrix4(t(0, 0, 0)), b = new THREE.Vector3(w / 2, h - 0.04, 0.06).applyMatrix4(t(0, 0, 0));
      nb.rope.add(tubeGeo(catenary(a, b, 0.06, 8), 0.006, 3, false, 8), null, col(ROPE));
      for (let i = 0; i < 4; i++) { const x = -w / 2 + (i + 0.5) * w / 4; fish(nb, t, x, h - 0.26, 0.06, 0.34 + rng() * 0.08, ["#9a9278", "#8a7a58", "#a8a088", "#7a6a48"][i], 0, true); }
      break;
    }
    case "skull": {
      // a bleached gator skull on a board: long tapering snout, teeth, eye sockets
      nb.wood.add(chamferBoxGeo(w + 0.08, h + 0.06, 0.03, 0.01), t(0, h / 2, 0.015), col("#4a3422"));
      const sn = new THREE.ConeGeometry(0.1, w * 0.85, 8); sn.rotateZ(-Math.PI / 2); sn.scale(1, 0.55, 1);
      fb.plastic.add(sn, t(0.05, h / 2, 0.1), col(BONE));
      const cr = new THREE.SphereGeometry(0.13, 10, 8); cr.scale(1, 0.6, 0.8);
      fb.plastic.add(cr, t(-w * 0.3, h / 2, 0.1), col(BONE, 0.95));
      for (const s of [-1, 1]) fb.metal.add(new THREE.SphereGeometry(0.035, 6, 4), t(-w * 0.28, h / 2 + 0.04, 0.1 + s * 0.06), col("#1a1612"));
      for (let i = 0; i < 9; i++) { const tooth = new THREE.ConeGeometry(0.01, 0.035, 4); tooth.rotateX(Math.PI); fb.plastic.add(tooth, t(-0.12 + i * 0.045, h / 2 - 0.045, 0.14), col("#f4ecd8")); }
      break;
    }
    case "handnet": {
      // a landing net hung by its hoop: handle, steel hoop, a knotted bag
      nb.wood.add(cylGeo(0.018, 0.02, h * 0.62, 8), t(0, h * 0.31, 0.06), col("#8a6a44"));
      const hoop = new THREE.TorusGeometry(0.22, 0.012, 5, 22);
      nb.metal.add(hoop, t(0, h * 0.62 + 0.22, 0.07), col("#5a5a52"));
      const bag = new THREE.ConeGeometry(0.21, 0.42, 12, 1, true); bag.rotateX(Math.PI);
      nb.net.add(bag, t(0, h * 0.62 + 0.03, 0.12, 0, 0.5), col("#c8b890"));
      break;
    }
    case "lantern-wall": {
      // an iron arm + a storm lantern (emissive) on the wall
      nb.metal.box(0.04, 0.04, 0.28, t(0, h - 0.04, 0.14), col(IRON));
      nb.metal.box(0.03, 0.2, 0.02, t(0, h - 0.14, 0.02), col(IRON));
      murkLantern(nb, t(0, 0.02, 0.24));
      break;
    }
    case "floats": {
      const a = new THREE.Vector3(-w / 2, h - 0.03, 0.08).applyMatrix4(t(0, 0, 0)), b = new THREE.Vector3(w / 2, h - 0.03, 0.08).applyMatrix4(t(0, 0, 0));
      nb.rope.add(tubeGeo(catenary(a, b, 0.12, 8), 0.01, 4, false, 8), null, col(ROPE));
      for (let i = 0; i < 4; i++) { const x = -w / 2 + (i + 0.6) * w / 4.4; const ball = new THREE.SphereGeometry(0.09, 12, 8); ball.scale(1, 0.85, 1); nb.plastic.add(ball, t(x, h - 0.22 - Math.sin((i + 0.6) / 4.4 * Math.PI) * 0.1, 0.1), col(["#b04a2e", "#d6c8a4", "#3e6a4a", "#c49a3a"][i])); }
      break;
    }
    case "toolboard": {
      // a plywood tool board: hand saw, claw hammer, wrenches, a brace drill, chisels, a coil of wire
      nb.clapboard.add(chamferBoxGeo(w, h, 0.02, 0.006), t(0, h / 2, 0.01), col("#c8a878"));
      const saw = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.55, 0.04), new THREE.Vector2(0.55, 0.16), new THREE.Vector2(0, 0.12)]);
      const sg = new THREE.ExtrudeGeometry(saw, { depth: 0.003, bevelEnabled: false });
      nb.metal.add(sg, t(-w / 2 + 0.1, h * 0.55, 0.025), col("#9a9a96"));
      nb.wood.add(chamferBoxGeo(0.12, 0.14, 0.03, 0.01), t(-w / 2 + 0.1, h * 0.62, 0.035), col("#7a3a22"));
      nb.wood.add(cylGeo(0.014, 0.016, 0.32, 6), t(0.15, h * 0.62, 0.035), col("#a07a4a"));
      nb.metal.box(0.14, 0.04, 0.04, t(0.15, h * 0.62 + 0.16, 0.04), col("#3a3a38"));
      for (let i = 0; i < 3; i++) nb.metal.box(0.03, 0.18 + i * 0.05, 0.008, t(0.35 + i * 0.07, h * 0.3, 0.025), col("#8a8a86"));
      for (let i = 0; i < 3; i++) { nb.wood.add(cylGeo(0.012, 0.012, 0.09, 6), t(-0.2 + i * 0.06, h * 0.28 + 0.1, 0.03), col("#b08a5a")); nb.metal.box(0.012, 0.11, 0.004, t(-0.2 + i * 0.06, h * 0.28 - 0.02, 0.03), col("#9a9a96")); }
      const wire = new THREE.TorusGeometry(0.09, 0.012, 5, 16); nb.metal.add(wire, t(w / 2 - 0.16, h * 0.7, 0.04), col("#a0603a"));
      for (const [x, y] of [[-w / 2 + 0.05, 0.05], [w / 2 - 0.05, 0.05], [-w / 2 + 0.05, h - 0.05], [w / 2 - 0.05, h - 0.05]]) nb.metal.add(new THREE.SphereGeometry(0.01, 4, 3), t(x, y, 0.024), col(IRON));
      break;
    }
    case "propeller": {
      nb.metal.box(0.05, 0.05, 0.12, t(0, h / 2, 0.06), col(IRON));
      nb.bronze.add(cylGeo(0.05, 0.05, 0.12, 10), t(0, h / 2, 0.14, 0, Math.PI / 2), col("#b88a48"));
      for (let k = 0; k < 3; k++) { const bl = new THREE.SphereGeometry(0.5, 10, 6); bl.scale(0.11, w * 0.42, 0.025); nb.bronze.add(bl, t(0, h / 2, 0.15, 0, 0, k * Math.PI * 2 / 3).multiply(M(0, w * 0.22, 0, 0.35)), col("#b08040")); }
      break;
    }
    case "sign": {
      nb.wood.add(chamferBoxGeo(w + 0.08, h + 0.08, 0.04, 0.012), t(0, h / 2, 0.02), col("#4a3422"));
      if (signMat) { const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMat); g.applyMatrix4(t(0, h / 2, 0.042)); extra.push(g); }
      break;
    }
    case "bucket": {
      // a galvanised bait pail: open drum, rim, wire handle, dark water with a few worms
      fb.metal.add(cylGeo(0.16, 0.13, h, 14, true), t(0, h / 2, 0), col("#9a9a90"));
      fb.metal.add(cylGeo(0.13, 0.13, 0.01, 14), t(0, 0.005, 0), col("#8a8a80"));
      fb.metal.add(new THREE.TorusGeometry(0.16, 0.008, 4, 18).rotateX(Math.PI / 2), t(0, h, 0), col("#b0b0a6"));
      fb.metal.add(new THREE.TorusGeometry(0.16, 0.004, 3, 14, Math.PI), t(0, h, 0, Math.PI / 2 * (dr.v > 0.5 ? 1 : 0.3), 0, 0), col("#6a6a64"));
      fb.plastic.add(cylGeo(0.145, 0.145, 0.01, 14), t(0, h * 0.7, 0), col("#3a2c1a"));
      for (let i = 0; i < 4; i++) fb.plastic.add(new THREE.TorusGeometry(0.03, 0.007, 3, 8, 4), t((rng() - 0.5) * 0.15, h * 0.71, (rng() - 0.5) * 0.15, rng() * 6, Math.PI / 2), col("#a04a4a"));
      break;
    }
    case "tacklebox": {
      fb.metal.add(chamferBoxGeo(w, h * 0.7, d, 0.015), t(0, h * 0.35, 0), col(dr.v > 0.5 ? "#3e6a4a" : "#7a3a2a"));
      fb.metal.add(chamferBoxGeo(w + 0.01, h * 0.28, d + 0.01, 0.02), t(0, h * 0.84, 0), col(dr.v > 0.5 ? "#4a7a56" : "#8a4632"));
      fb.metal.box(0.18, 0.025, 0.03, t(0, h + 0.02, 0), col("#2a2a2a"));
      fb.metal.box(0.04, 0.05, 0.01, t(0, h * 0.68, d / 2 + 0.005), col("#c8c0a0"));
      break;
    }
    case "boots": {
      for (const s of [-1, 1]) {
        const m = t(s * 0.1, 0, 0, (rng() - 0.5) * 0.3 + (s > 0 ? 0.15 : 0));
        fb.plastic.add(cylGeo(0.06, 0.065, h - 0.08, 10), m.clone().multiply(M(0, (h - 0.08) / 2 + 0.06, -0.02)), col("#2e3a2a"));
        fb.plastic.add(chamferBoxGeo(0.12, 0.08, 0.27, 0.03), m.clone().multiply(M(0, 0.04, 0.04)), col("#252c22"));
      }
      break;
    }
    case "firewood": {
      // split logs stacked by the stove + a hatchet in the top log
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
        const lg = cylGeo(0.065, 0.07, 0.55 + rng() * 0.12, 7); lg.rotateX(Math.PI / 2);
        fb.thatch.add(lg, t(-0.2 + i * 0.135 + r * 0.068, 0.07 + r * 0.12, 0, (rng() - 0.5) * 0.12), col("#c8a07a", 0.9 + rng() * 0.2));
      }
      fb.wood.add(cylGeo(0.012, 0.014, 0.38, 6), t(0.05, 0.42, 0.05, 0, 0, 0.9), col("#8a6a44"));
      fb.metal.box(0.1, 0.06, 0.015, t(0.18, 0.5, 0.05, 0, 0, 0.9), col("#5a5a56"));
      break;
    }
    case "bottles": {
      for (let i = 0; i < 4; i++) {
        const x = -0.12 + (i % 2) * 0.12 + (rng() - 0.5) * 0.03, z = -0.05 + Math.floor(i / 2) * 0.1;
        const c = ["#3a5a2a", "#6a3a1a", "#2a4a3a", "#7a5a2a"][i], hh = 0.22 + rng() * 0.08;
        fb.glass.add(cylGeo(0.035, 0.035, hh * 0.68, 10), t(x, hh * 0.34, z), col(c));
        fb.glass.add(cylGeo(0.013, 0.033, hh * 0.32, 10), t(x, hh * 0.84, z), col(c));
        if (i === 3) fb.glass.add(cylGeo(0.035, 0.035, 0.2, 10), t(x + 0.2, 0.035, z, 0, 0, Math.PI / 2), col(c));
      }
      break;
    }
    case "cooler": {
      fb.plastic.add(chamferBoxGeo(w, h * 0.78, d, 0.03), t(0, h * 0.39, 0), col("#b8342a"));
      fb.plastic.add(chamferBoxGeo(w + 0.02, h * 0.2, d + 0.02, 0.03), t(0, h * 0.88, 0), col("#e8e2d4"));
      for (const s of [-1, 1]) fb.plastic.box(0.04, 0.05, 0.16, t(s * (w / 2 + 0.01), h * 0.62, 0), col("#d8d2c4"));
      break;
    }
    case "jerrycan": {
      fb.metal.add(chamferBoxGeo(w, h * 0.86, d, 0.02), t(0, h * 0.43, 0), col(dr.v > 0.5 ? "#8a2e22" : "#4e5a32"));
      fb.metal.box(w * 0.5, 0.05, 0.05, t(-0.04, h * 0.9, 0), col("#2a2a26"));
      fb.metal.add(cylGeo(0.022, 0.022, 0.06, 8), t(w * 0.32, h * 0.9, 0, 0, 0, -0.5), col("#2a2a26"));
      break;
    }
    case "paintcans": {
      for (let i = 0; i < 3; i++) {
        const x = -0.17 + i * 0.17, c = ["#3a6a8a", "#c8a03a", "#e8e0d0"][i];
        fb.metal.add(cylGeo(0.075, 0.075, h - i * 0.04, 14), t(x, (h - i * 0.04) / 2, (rng() - 0.5) * 0.05), col("#a8a8a0"));
        fb.metal.add(cylGeo(0.076, 0.076, 0.04, 14), t(x, h - i * 0.04 - 0.05, (rng() - 0.5) * 0.05), col(c));
      }
      break;
    }
    case "planks": {
      for (let i = 0; i < 5; i++) fb.woodDark.add(chamferBoxGeo(w - rng() * 0.3, 0.05, 0.2, 0.008), t((rng() - 0.5) * 0.1, 0.03 + i * 0.055, (i % 2 - 0.5) * 0.18, (rng() - 0.5) * 0.06), col("#b89a74", 0.85 + rng() * 0.3));
      break;
    }
    case "anchor": {
      nb.metal.add(cylGeo(0.025, 0.025, 0.42, 8), t(0, 0.25, 0, 0, 0, 1.2), col("#3a3632"));
      nb.metal.add(new THREE.TorusGeometry(0.2, 0.025, 6, 14, Math.PI), t(0.05, 0.06, 0, 0, 0, Math.PI + 1.2), col("#3a3632"));
      break;
    }
    case "traps": {
      // a stack of two crab pots: slat frames + rope mesh
      for (let k = 0; k < 2; k++) {
        const y0 = k * 0.52, m = t((rng() - 0.5) * 0.05, y0, 0, (rng() - 0.5) * 0.15);
        for (let i = 0; i < 5; i++) nb.wood.box(0.045, 0.045, d - 0.04, m.clone().multiply(M(-w / 2 + 0.06 + i * (w - 0.12) / 4, 0.48, 0)), col("#8a6a44"));
        for (const s of [-1, 1]) nb.wood.box(w, 0.5, 0.04, m.clone().multiply(M(0, 0.25, s * (d / 2 - 0.02))), col("#7a5a3a"));
        nb.wood.box(w, 0.04, d, m.clone().multiply(M(0, 0.02, 0)), col("#6a4e34"));
        nb.net.box(w - 0.08, 0.44, d - 0.08, m.clone().multiply(M(0, 0.25, 0)), col("#cfc4a0"));
      }
      break;
    }
    case "sawhorse": {
      // two trestles + a plank across them + a saw and a pot of nails on top
      for (const s of [-1, 1]) {
        const x = s * (w / 2 - 0.25);
        nb.wood.add(chamferBoxGeo(0.08, 0.08, d, 0.01), t(x, h - 0.12, 0), col("#a07a4a"));
        for (const zz of [-1, 1]) for (const xx of [-1, 1]) nb.wood.add(chamferBoxGeo(0.05, h - 0.1, 0.05, 0.006), t(x + xx * 0.12, (h - 0.1) / 2, zz * (d / 2 - 0.08), 0, xx * 0.0, -xx * 0.16), col("#8a6a40"));
      }
      nb.woodDark.add(chamferBoxGeo(w, 0.05, d * 0.55, 0.01), t(0, h - 0.055, 0), col("#c8aa80"));
      nb.metal.add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0.03), new THREE.Vector2(0.5, 0.13), new THREE.Vector2(0, 0.1)]), { depth: 0.003, bevelEnabled: false }).rotateX(-Math.PI / 2), t(-0.3, h - 0.02, 0.05, 0.3), col("#9a9a96"));
      nb.metal.add(cylGeo(0.05, 0.05, 0.1, 10), t(0.45, h + 0.02, -0.05), col("#8a8a84"));
      break;
    }
    case "outboard": {
      // an old outboard motor clamped on a stand: two posts + a transom board, cowling, leg, skeg, prop
      for (const s of [-1, 1]) nb.wood.add(chamferBoxGeo(0.08, h * 0.75, 0.08, 0.01), t(s * 0.26, h * 0.375, -0.12), col("#7a5a3a"));
      nb.wood.add(chamferBoxGeo(0.62, 0.22, 0.06, 0.012), t(0, h * 0.68, -0.08), col("#8a6a44"));
      nb.wood.add(chamferBoxGeo(0.62, 0.06, 0.5, 0.012), t(0, 0.03, 0), col("#6a4e34"));
      const cow = new THREE.SphereGeometry(0.5, 14, 10); cow.scale(0.32, 0.36, 0.42);
      nb.plastic.add(cow, t(0, h * 0.86, 0.06), col("#c8482e"));
      nb.metal.add(chamferBoxGeo(0.12, h * 0.55, 0.14, 0.02), t(0, h * 0.42, 0.1), col("#3a3a38"));
      nb.metal.add(chamferBoxGeo(0.14, 0.16, 0.26, 0.03), t(0, h * 0.12, 0.12), col("#3a3a38"));
      for (let k = 0; k < 3; k++) { const bl = new THREE.SphereGeometry(0.5, 8, 5); bl.scale(0.05, 0.16, 0.012); nb.metal.add(bl, t(0, h * 0.12, 0.27, 0, 0, k * 2.09).multiply(M(0, 0.08, 0)), col("#8a8a84")); }
      break;
    }
    case "tabletop": {
      // supper for one on the kit's table: an oil lamp (lit), a tin mug, a plate of fish bones, a bottle, playing cards
      const lamp = t(-0.18, 0, 0.05);
      fb.metal.add(cylGeo(0.07, 0.08, 0.06, 12), lamp.clone().multiply(M(0, 0.03, 0)), col("#8a6a3a"));
      const gl = new THREE.SphereGeometry(0.06, 12, 8); gl.scale(1, 1.5, 1);
      fb.bulb.add(gl, lamp.clone().multiply(M(0, 0.15, 0)), col("#ffc878"));
      fb.metal.add(cylGeo(0.035, 0.05, 0.04, 10), lamp.clone().multiply(M(0, 0.26, 0)), col("#8a6a3a"));
      fb.metal.add(cylGeo(0.04, 0.04, 0.09, 12, true), t(0.2, 0.045, -0.12), col("#9aa0a0"));
      fb.metal.add(new THREE.TorusGeometry(0.025, 0.006, 4, 10, Math.PI), t(0.245, 0.05, -0.12, 0, 0, -Math.PI / 2), col("#9aa0a0"));
      fb.plastic.add(cylGeo(0.12, 0.1, 0.02, 16), t(0.05, 0.01, 0.12), col("#e8e0cc"));
      for (let i = 0; i < 5; i++) fb.plastic.box(0.004, 0.004, 0.08 - Math.abs(i - 2) * 0.015, t(0.0 + i * 0.022, 0.025, 0.12), col(BONE));
      fb.plastic.box(0.13, 0.004, 0.004, t(0.044, 0.025, 0.12), col(BONE));
      fb.glass.add(cylGeo(0.032, 0.032, 0.18, 10), t(-0.02, 0.09, -0.15), col("#3a5a2a"));
      fb.glass.add(cylGeo(0.012, 0.03, 0.08, 10), t(-0.02, 0.22, -0.15), col("#3a5a2a"));
      for (let i = 0; i < 5; i++) fb.plastic.box(0.06, 0.003, 0.085, t(0.28 + (rng() - 0.5) * 0.12, 0.002 + i * 0.002, 0.08 + (rng() - 0.5) * 0.12, rng() * 3), col(i % 2 ? "#e8e4dc" : "#c83a2a"));
      break;
    }
  }
}
