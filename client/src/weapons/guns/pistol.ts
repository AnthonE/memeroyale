// Banana pistol "NUB" — target art gear-03-weapons (top-left), measured off the 2880² sheet (px → metres via rp()).
// A fat FACETED banana slide (5 faces, rounded ridges) with the green stem at the rear top; the front is peeled:
// a yellow peel lip around a cream flesh dome with a wooden cork barrel; a brown cork front sight; a brown strap over
// the slide (rivet on each flank); a brown side clip + rivet at the front; an ejection slot and a hex badge; a brown
// trigger guard + curled trigger; a chunky yellow grip with a cream peeled panel, a brown front strap and a lime cap.
import * as THREE from "three";
import { extrudeSmooth, filletCyl, lathe, rbox, ringGeo, smooth, tf, alignY, type V3 } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { bananaBody, clearSlope, facetBand, rearNotch, rivet, screw, sightDot, stemCap, FWD, UP } from "./common";
import type { GunSpec } from "./types";

// art px → gun space (−Z forward, +Y up, origin = top of the grip). The target art is a ¾ view (muzzle toward the
// viewer), so horizontal distances are foreshortened by ~0.88.
const X0 = 470, Y0 = 905, K = 0.0006, KZ = K / 0.96;
const rp = (x: number, y: number, xOff = 0): THREE.Vector3 => new THREE.Vector3(xOff, -(y - Y0) * K, (x - X0) * KZ);
/** grip-space points lean further back the lower they are (the target art's grip rake) */
const rg = (x: number, y: number): THREE.Vector3 => rp(x + Math.max(0, y - Y0) * 0.22, y);

export function buildPistol(): GunSpec {
  const b = new PartBuilder();
  const slide = b.sub("slide", [0, 0.06, 0]);
  // ---- slide body: faceted banana, stem (rear) at x≈575 → cut front at x≈128, fat in the middle
  const stemP = rp(590, 752), tipP = rp(128, 800);
  const len = stemP.distanceTo(tipP);
  const body = bananaBody(slide, {
    length: len, radius: 0.07, bend: 0.62, facets: 5, round: 0.3, along: 44, radial: 60, squash: 0.9,
    profile: [0.4, 0.72, 0.92, 1, 1, 0.98, 0.95, 0.91, 0.87, 0.83, 0.8], at: stemP.toArray() as V3, pitch: Math.atan2(tipP.y - stemP.y, stemP.z - tipP.z),
  });
  stemCap(slide, body.stem.center, body.stem.dir, body.stem.radius * 0.95, 0.046, 1.1);
  // the stem cap's top centre: the rear notch sits on it (the last part of the slide — nothing behind the
  // rear sight to crowd the sight picture)
  const stemTop = (() => { const dd = body.stem.dir.clone().normalize().addScaledVector(UP, 1.1).normalize(); return body.stem.center.clone().addScaledVector(dd, -body.stem.radius * 0.95 * 0.05 + 0.046 * 0.985); })();
  // ---- peeled front: yellow peel lip, cream flesh dome with segment lines, wooden cork barrel
  const tip = body.tip, d = tip.dir.clone().normalize();
  slide.add(ringGeo(tip.radius * 1.02, tip.radius * 0.8, 0.012, 0.004, 44), C.bananaDeep, "gloss", alignY(tip.center.clone().addScaledVector(d, -0.002), d));
  const dome = lathe([[0.0001, 0.048], [0.012, 0.047], [0.024, 0.042], [0.034, 0.033], [0.042, 0.02], [0.047, 0.008], [0.05, 0], [0.0001, 0]].map(([r, y]) => [r * (tip.radius / 0.05) * 0.84, y]) as Array<[number, number]>, 40);
  slide.addGradient(dome, C.creamDeep, C.flesh, "y", "gloss", alignY(tip.center.clone().addScaledVector(d, -0.004), d));
  for (let k = 0; k < 5; k++) {
    // peeled-flesh segment seams running from the lip toward the cork
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
    const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(q);
    const p0 = tip.center.clone().addScaledVector(radial, tip.radius * 0.8).addScaledVector(d, 0.006);
    const p1 = tip.center.clone().addScaledVector(radial, tip.radius * 0.3).addScaledVector(d, 0.042);
    const mid = p0.clone().lerp(p1, 0.5);
    slide.add(filletCyl(0.0016, p0.distanceTo(p1), 0.0005, 6), C.creamDeep, "matte", alignY(mid, p1.clone().sub(p0)));
  }
  const corkC = tip.center.clone().addScaledVector(d, 0.05);
  slide.add(filletCyl(0.0135, 0.04, 0.003, 20), C.brown, "matte", alignY(corkC, d));
  slide.add(filletCyl(0.0118, 0.004, 0.0015, 20), C.cream, "matte", alignY(corkC.clone().addScaledVector(d, 0.02), d));
  slide.add(filletCyl(0.004, 0.003, 0.001, 12), "#2a1609", "matte", alignY(corkC.clone().addScaledVector(d, 0.022), d));
  // ---- front sight: a little brown cork post on top of the front. Its top is the aim point
  // (a bright fibre dot on its back face), a rear NOTCH sight sits on the slide on the line that clears the stem — a
  // real three-dot sight picture for ADS (it aimed over the post alone, the gun canted aside)
  const fs = rp(168, 690);
  slide.add(rbox(0.016, 0.026, 0.02, 0.004, 3), C.brown, "matte", tf([0, fs.y - 0.008, fs.z], [0.12, 0, 0]));
  slide.add(rbox(0.017, 0.005, 0.021, 0.002, 2), C.brownLight, "matte", tf([0, fs.y + 0.005, fs.z + 0.001], [0.12, 0, 0]));
  const F = new THREE.Vector3(0, fs.y + 0.0062, fs.z + 0.004);
  sightDot(slide, new THREE.Vector3(0, F.y - 0.0035, fs.z + 0.0115), 0.0036);
  // ---- strap over the slide (x≈340..400) with a rivet on each flank near the bottom of the band
  const sA = facetBand(slide, body, 0.34, 0.026, 0.007, C.brown);
  for (const sx of [1, -1]) rivet(slide, sA.center.clone().addScaledVector(sA.B, sx * sA.radius * 0.86).addScaledVector(sA.N, -sA.radius * 0.3), sA.B.clone().multiplyScalar(sx).addScaledVector(sA.N, -0.3), 0.0065);
  // ---- side clip (front lower flank): a curved brown bracket + rivet, both sides
  const cl = body.at(0.84);
  for (const sx of [1, -1]) {
    const clip = rbox(0.012, 0.05, 0.03, 0.005, 3);
    slide.add(clip, C.brown, "matte", tf([sx * cl.radius * 0.86, cl.center.y - cl.radius * 0.32, cl.center.z], [0, 0, sx * 0.35]));
    slide.add(rbox(0.013, 0.012, 0.036, 0.004, 2), C.brown, "matte", tf([sx * cl.radius * 0.66, cl.center.y - cl.radius * 0.8, cl.center.z], [0, 0, sx * 0.9]));
    rivet(slide, [sx * (cl.radius * 0.93 + 0.004), cl.center.y - cl.radius * 0.22, cl.center.z + 0.004], [sx, 0.2, 0], 0.0062);
  }
  // ---- ejection slot (x 330..415, y≈853) + hex badge (x 460..515, y≈884) on both flanks
  const sl = rp(338, 853), hb = rp(492, 880);
  for (const sx of [1, -1]) {
    const w = body.at(0.42).radius * 0.9;
    slide.add(rbox(0.006, 0.008, 0.055, 0.002, 2), "#3a1f0e", "matte", tf([sx * w, sl.y, sl.z]));
    slide.add(rbox(0.004, 0.0025, 0.055, 0.001, 1), C.bananaDeep, "gloss", tf([sx * (w + 0.001), sl.y + 0.006, sl.z]));
    const hex = new THREE.CylinderGeometry(0.016, 0.016, 0.006, 6); hex.rotateZ(Math.PI / 2); hex.rotateX(Math.PI / 6);
    slide.add(hex, C.brown, "matte", tf([sx * (body.at(0.25).radius * 0.8), hb.y, hb.z]));
    slide.add(rbox(0.003, 0.003, 0.02, 0.001, 1), "#2a1609", "matte", tf([sx * (body.at(0.25).radius * 0.8 + 0.003), hb.y, hb.z]));
  }
  // ---- lower frame (yellow) joining slide → grip → guard
  const fr = rbox(0.056, 0.05, 0.19, 0.02, 4);
  b.addGradient(fr, C.bananaDeep, C.banana, "y", "gloss", tf([0, 0.012, rp(410, 0).z]));
  // ---- trigger guard: a smooth brown D-loop extruded in X (profile traced from the target art)
  const guard: Array<[number, number]> = [[250, 898], [268, 950], [292, 994], [336, 1012], [392, 1008], [420, 990], [430, 950], [414, 946], [406, 982], [388, 994], [340, 997], [306, 982], [284, 944], [270, 898]];
  const gp = guard.map(([x, y]) => { const v = rp(x, y); return [v.z, v.y] as [number, number]; });
  const gg = extrudeSmooth(gp.map(([z, y]) => [-z, y]), 0.016, 0.004, 64, 2);
  gg.rotateY(Math.PI / 2);
  b.add(smooth(gg, 55), C.brown, "matte");
  // curled trigger blade
  const trig: Array<[number, number]> = [[352, 918], [362, 935], [366, 960], [358, 985], [346, 992], [352, 978], [356, 958], [352, 938], [344, 922]];
  const tg = extrudeSmooth(trig.map(([x, y]) => { const v = rp(x, y); return [-v.z, v.y] as [number, number]; }), 0.012, 0.003, 40, 2);
  tg.rotateY(Math.PI / 2);
  b.add(smooth(tg, 55), C.brownDark, "matte");
  // ---- grip: chunky yellow shell (traced outline, extruded + bevelled), cream panels, brown front strap, lime cap
  const gripO: Array<[number, number]> = [[422, 905], [548, 896], [578, 950], [598, 1050], [616, 1150], [622, 1205], [500, 1212], [474, 1150], [450, 1060], [428, 990]];
  const gG = extrudeSmooth(gripO.map(([x, y]) => { const v = rg(x, y); return [-v.z, v.y] as [number, number]; }), 0.056, 0.02, 64, 5);
  gG.rotateY(Math.PI / 2);
  b.addGradient(smooth(gG, 60), C.banana, C.bananaDeep, "y", "gloss");
  // cream panels (both flanks): inset outline, lightly domed, with four grain lines + a small hole
  // the target art's cream panel covers most of the grip flank (a thin yellow border only)
  const panel: Array<[number, number]> = [[468, 986], [554, 968], [584, 1070], [602, 1180], [506, 1194], [486, 1100]];
  const pG = extrudeSmooth(panel.map(([x, y]) => { const v = rg(x, y); return [-v.z, v.y] as [number, number]; }), 0.008, 0.003, 48, 2);
  pG.rotateY(Math.PI / 2);
  for (const sx of [1, -1]) {
    b.addGradient(smooth(pG, 60), C.creamDeep, C.cream, "y", "gloss", tf([sx * 0.025, 0, 0]));
    for (let k = 0; k < 4; k++) { const v = rg(488 + k * 9, 1020 + k * 44); b.add(rbox(0.002, 0.0018, 0.05, 0.0006, 1), C.creamDeep, "matte", tf([sx * 0.0295, v.y, v.z + 0.022], [0.08, 0, 0])); }
    const h = rg(574, 1178); b.add(filletCyl(0.0035, 0.004, 0.001, 10), "#3a2412", "matte", alignY([sx * 0.0296, h.y, h.z], [sx, 0, 0]));
  }
  // brown front strap: continues from the guard down the grip's front edge
  const strapO: Array<[number, number]> = [[416, 944], [448, 940], [462, 1000], [478, 1080], [494, 1160], [506, 1206], [484, 1208], [468, 1160], [450, 1080], [432, 1000]];
  const sG = extrudeSmooth(strapO.map(([x, y]) => { const v = rg(x, y); return [-v.z, v.y] as [number, number]; }), 0.061, 0.008, 48, 2);
  sG.rotateY(Math.PI / 2);
  b.add(smooth(sG, 60), C.brown, "matte");
  const sc = rg(474, 1150);
  screw(b, [0.0305, sc.y, sc.z], [1, 0, 0], 0.0045);
  screw(b, [-0.0305, sc.y, sc.z], [-1, 0, 0], 0.0045);
  // lime base cap with a lighter rim
  const cap = rg(560, 1218);
  b.add(rbox(0.066, 0.024, 0.098, 0.01, 3), C.lime, "gloss", tf([0, cap.y, cap.z], [-0.22, 0, 0]));
  b.add(rbox(0.062, 0.006, 0.094, 0.003, 2), "#b7de5c", "gloss", tf([0, cap.y + 0.012, cap.z + 0.003], [-0.22, 0, 0]));
  // small brown button above the grip (x≈500, y≈890 in the target art: the magazine release)
  // ---- the rear notch: ON the stem cap's cut top (the slide's last part), its ears' tops on the lowest line from the
  // front post that clears the slide and its strap by 3 mm (measured on the built gun) and at least 1 cm over the stem —
  // a fibre dot on each ear: the three-dot sight picture
  const sightLine = (() => {
    const tmp = b.build({ name: "pistol-probe" });
    const rz = stemTop.z;
    const slope = clearSlope(tmp, F, 0.026, 0.003, 0.03, rz - 0.012);
    const R = new THREE.Vector3(0, Math.max(F.y + slope * (rz - F.z), stemTop.y + 0.013), rz);
    rearNotch(slide, R, 0.011, 0.0085, stemTop.y - 0.004);
    return { front: F.clone(), rear: R };
  })();
  const built = b.build({ name: "pistol" });
  const mz = corkC.clone().addScaledVector(d, 0.026);
  return { ...built, id: "pistol", muzzle: mz, length: 0.36, gripAnchor: rp(505, 960), foreAnchor: null, sightY: fs.y + 0.075, fwd: FWD, sightLine };
}
