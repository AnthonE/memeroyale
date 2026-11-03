// Banana SMG "PEELER" — target art gear-03-weapons (top-middle), traced off the 2880² sheet (px → metres via rp()).
// A long faceted banana arching up to a green stem at the rear top; up front a brown clamp collar with a ring-sight
// post, a yellow spacer ring and a fat brown muzzle drum with a cream star-slice face; a brown side plate with a
// rivet + bolt head; a ribbed brown fore-grip; a wide curved cream flesh magazine in a brown well; a brown strap with
// a square rivet plate + rear rail; a yellow raked pistol grip with a brown rivet, lime band and brown base.
import * as THREE from "three";
import { extrude, extrudeSmooth, filletCyl, lathe, rbox, ringGeo, smooth, tf, alignY, type V3 } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { bananaBody, clearSlope, facetBand, frontHood, muzzleDisc, rearPeep, rivet, screw, stemCap, FWD } from "./common";
import type { GunSpec } from "./types";

const X0 = 1392, Y0 = 945, K = 0.00079, KZ = K / 0.97;
const rp = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(0, -(y - Y0) * K, (x - X0) * KZ);
/** extrude a traced side outline (art px) `w` wide in X, bevel `bv` */
function side(pts: Array<[number, number]>, w: number, bv: number, map: (x: number, y: number) => THREE.Vector3 = rp) {
  const g = extrudeSmooth(pts.map(([x, y]) => { const v = map(x, y); return [-v.z, v.y] as [number, number]; }), w, bv, 72, 3);
  g.rotateY(Math.PI / 2);
  return smooth(g, 60);
}

export function buildSmg(): GunSpec {
  const b = new PartBuilder();
  // ---- body: banana from the stem (1492, 735) to the front collar (935, 845), sagging in the middle
  const stemP = rp(1486, 745), tipP = rp(932, 842);
  const len = stemP.distanceTo(tipP);
  const body = bananaBody(b, {
    length: len, radius: 0.072, bend: 0.62, facets: 5, round: 0.3, along: 52, radial: 60, squash: 0.92,
    profile: [0.42, 0.74, 0.92, 1, 1, 1, 0.99, 0.98, 0.97, 0.96, 0.96], at: stemP.toArray() as V3, pitch: Math.atan2(tipP.y - stemP.y, stemP.z - tipP.z),
  });
  stemCap(b, body.stem.center, body.stem.dir, body.stem.radius * 0.95, 0.07, 1.25);
  const tip = body.tip, d = tip.dir.clone().normalize();
  const at = (dist: number) => tip.center.clone().addScaledVector(d, dist);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const M = (p: THREE.Vector3) => new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
  // ---- front: big brown clamp collar (r 88 px), yellow spacer ring (r 70), brown muzzle drum (r 55) + face ring
  b.add(ringGeo(88 * K, 50 * K, 50 * KZ, 0.008, 44), C.brown, "matte", M(at(-0.012)));
  b.add(ringGeo(90 * K, 84 * K, 8 * KZ, 0.002, 44), C.brownDark, "matte", M(at(0.006)));
  b.add(ringGeo(72 * K, 40 * K, 30 * KZ, 0.005, 40), C.banana, "gloss", M(at(0.028)));
  const drumL = 115 * KZ, drumR = 55 * K;
  b.add(filletCyl(drumR, drumL, 0.006, 40), C.brown, "matte", M(at(0.04 + drumL / 2)));
  b.add(ringGeo(drumR * 1.07, drumR * 0.9, 0.018, 0.004, 40), C.brownDark, "matte", M(at(0.052)));
  muzzleDisc(b, at(0.04 + drumL - 0.004), d, drumR * 0.96, C.brownDark, 0.01, 0.02);
  // clamp ear + the front sight: the ring faces DOWN THE BORE (it stood side-on with a cream
  // disc filling it — from behind, a post with nothing to look through): a hooded front sight, the ring round a blade
  // whose bright tip is the aim point; the rear ghost ring sits on the line that clears the stem (below, after the body)
  const ear = rp(886, 752);
  b.add(rbox(0.03, 0.022, 0.03, 0.006, 3), C.brown, "matte", tf([0, ear.y, ear.z]));
  const ring = rp(880, 682);
  const F = new THREE.Vector3(0, ring.y, ring.z);
  frontHood(b, F, 0.019, 0.0048, ear.y + 0.008);
  // ---- side plate (both flanks): long brown bracket with a lighter channel, a round rivet and a square bolt head
  const plate: Array<[number, number]> = [[944, 812], [1010, 804], [1130, 812], [1134, 866], [1010, 874], [944, 858]];
  for (const sx of [1, -1]) {
    const pG0 = extrude(plate.map(([x, y]) => { const v = rp(x, y); return [-v.z, v.y] as [number, number]; }), 0.01, 0.003, 4, 2); pG0.rotateY(Math.PI / 2);
    const pG = smooth(pG0, 40);
    const w = body.at(0.86).radius * 0.84;
    b.add(pG, C.brown, "matte", tf([sx * w, 0, 0]));
    const ch: Array<[number, number]> = [[1020, 818], [1120, 822], [1122, 858], [1020, 862]];
    b.add(side(ch, 0.004, 0.001), C.brownLight, "matte", tf([sx * (w + 0.006), 0, 0]));
    const rv = rp(1003, 832); rivet(b, [sx * (w + 0.006), rv.y, rv.z], [sx, 0, 0], 0.012);
    const bh = rp(957, 832); b.add(rbox(0.008, 0.02, 0.02, 0.004, 2), C.brownDark, "matte", tf([sx * (w + 0.006), bh.y, bh.z]));
    const la = rp(1030, 936); b.add(rbox(0.016, 0.02, 0.06, 0.005, 2), C.brown, "matte", tf([sx * w * 0.55, la.y, la.z], [0, 0, sx * 0.5]));
  }
  // top button
  const tb = rp(1098, 776); b.add(rbox(0.024, 0.014, 0.036, 0.005, 2), C.brown, "matte", tf([0, tb.y + 0.004, tb.z], [0.05, 0, 0]));
  // ---- fore-grip: ribbed brown lathe hanging under the front, widening to a round butt
  const fgTop = rp(944, 936);
  b.add(rbox(0.04, 0.03, 0.05, 0.008, 2), C.brown, "matte", tf([0, fgTop.y + 0.006, fgTop.z]));
  const fgL = 150 * K;
  const fprof: Array<[number, number]> = [[0.0001, 0]];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, base = 0.02 + 0.008 * u + 0.004 * Math.pow(u, 6);
    const rib = u > 0.12 && u < 0.92 ? 0.0022 * Math.pow(Math.abs(Math.sin(u * Math.PI * 6)), 0.5) : 0;
    const end = u > 0.95 ? Math.sqrt(Math.max(0.05, 1 - Math.pow((u - 0.95) / 0.05, 2))) : 1;
    fprof.push([(base + rib) * end, u * fgL]);
  }
  fprof.push([0.0001, fgL]);
  const fg = lathe(fprof, 24);
  b.add(fg, C.brown, "matte", alignY(fgTop, new THREE.Vector3(0, -1, 0.06)));
  // ---- lower receiver + mag well (brown) under the middle
  const well: Array<[number, number]> = [[1164, 930], [1300, 928], [1304, 966], [1168, 968]];
  b.add(side(well, 0.05, 0.008), C.brown, "matte");
  // ---- magazine: wide curved cream flesh block (pivot at the well so reloads can drop it)
  const magTop = rp(1232, 960);
  const mag = b.sub("mag", magTop.toArray() as V3);
  // curved like a banana: the front edge bows forward, the back edge follows; flat angled base
  const magO: Array<[number, number]> = [[1188, 962], [1276, 962], [1266, 1020], [1244, 1080], [1208, 1144], [1172, 1214], [1156, 1230], [1102, 1206], [1086, 1190], [1118, 1128], [1150, 1062], [1174, 1004]];
  const magG = extrude(magO.map(([x, y]) => { const v = rp(x, y); return [-v.z, v.y] as [number, number]; }), 0.046, 0.011, 6, 3);
  magG.rotateY(Math.PI / 2);
  mag.addGradient(smooth(magG, 40), C.creamDeep, C.flesh, "y", "gloss");
  // two long ribs down each face + a darker base edge
  for (const sx of [1, -1]) {
    for (const off of [0, 22]) {
      const c = new THREE.CatmullRomCurve3([rp(1216 - off, 972), rp(1200 - off, 1040), rp(1168 - off, 1110), rp(1128 - off, 1188)]);
      const g = new THREE.TubeGeometry(c, 20, 0.0022, 6, false);
      mag.add(g, C.creamDeep, "matte", tf([sx * 0.0262, 0, 0]));
    }
  }

  // ---- strap around the body (x≈1300) with a square rivet plate, and a rear rail + rivet on both flanks
  const sA = facetBand(b, body, 0.34, 0.032, 0.008, C.brown);
  for (const sx of [1, -1]) {
    const sp = sA.center.clone().addScaledVector(sA.B, sx * (sA.radius * 0.9 + 0.006)).addScaledVector(sA.N, -sA.radius * 0.2);
    b.add(rbox(0.008, 0.026, 0.026, 0.004, 2), C.brownDark, "matte", tf(sp.toArray() as V3));
    b.add(rbox(0.004, 0.008, 0.008, 0.002, 1), C.brownLight, "matte", tf(sp.clone().addScaledVector(sA.B, sx * 0.005).toArray() as V3));
    const rail: Array<[number, number]> = [[1320, 850], [1420, 842], [1424, 866], [1322, 872]];
    b.add(side(rail, 0.006, 0.002), C.brown, "matte", tf([sx * body.at(0.2).radius * 0.86, 0, 0]));
    const rr = rp(1424, 838); rivet(b, [sx * body.at(0.2).radius * 0.9, rr.y, rr.z], [sx, 0.2, 0], 0.011);
  }
  // ---- trigger guard + curled trigger
  const guard: Array<[number, number]> = [[1296, 954], [1300, 990], [1318, 1012], [1352, 1016], [1380, 998], [1384, 958], [1370, 960], [1368, 992], [1350, 1003], [1322, 1000], [1310, 984], [1310, 954]];
  b.add(side(guard, 0.016, 0.004), C.brown, "matte");
  const trig: Array<[number, number]> = [[1340, 958], [1350, 975], [1350, 995], [1340, 1004], [1334, 996], [1340, 980], [1332, 962]];
  b.add(side(trig, 0.011, 0.003), C.brownDark, "matte");
  // ---- pistol grip: yellow, strongly raked, segment grooves, brown rivet, lime band, brown base
  const grip: Array<[number, number]> = [[1370, 930], [1430, 918], [1462, 950], [1494, 1020], [1522, 1100], [1530, 1160], [1440, 1170], [1418, 1110], [1396, 1036], [1378, 980]];
  b.addGradient(side(grip, 0.056, 0.019), C.banana, C.bananaDeep, "y", "gloss");
  for (let k = 0; k < 4; k++) {
    const y = 1000 + k * 36;
    const x0 = 1392 + (y - 960) * 0.32, x1 = 1466 + (y - 960) * 0.42;
    const g0 = rp(x0, y), g1 = rp(x1, y + 6);
    for (const sx of [1, -1]) b.add(filletCyl(0.0014, g0.distanceTo(g1), 0.0005, 6), C.bananaDeep, "matte", alignY(g0.clone().lerp(g1, 0.5).setX(sx * 0.028), g1.clone().sub(g0)));
  }
  const gr = rp(1404, 952); for (const sx of [1, -1]) rivet(b, [sx * 0.029, gr.y, gr.z], [sx, 0, 0], 0.007);
  const band: Array<[number, number]> = [[1412, 1122], [1536, 1114], [1542, 1156], [1420, 1164]];
  b.add(side(band, 0.061, 0.008), C.lime, "gloss");
  b.add(side([[1426, 1162], [1540, 1154], [1544, 1196], [1430, 1202]], 0.055, 0.01), C.brown, "matte");
  screw(b, [0.028, rp(0, 1015).y, rp(1395, 0).z], [1, 0, 0], 0.004);
  // ---- rear ghost ring: on the lowest line from the front aim point that clears the body, the strap, the top button and
  // the stem cap by 3 cm (measured on the built gun), 5 cm ahead of the stem, on two uprights down to the body
  const sightLine = (() => {
    const tmp = b.build({ name: "smg-probe" });
    // (aimed, the stem cap filled the lower half of the aperture) 3 cm over the stem: it drops under the ring
    const slope = clearSlope(tmp, F, 0.032, 0.03, 0.04);
    const rz = stemP.z - 0.05, ry = F.y + slope * (rz - F.z);
    let base = -Infinity; const v = new THREE.Vector3();
    tmp.root.updateMatrixWorld(true);
    tmp.root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const pos = m.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); if (Math.abs(v.x) < 0.012 && Math.abs(v.z - rz) < 0.012) base = Math.max(base, v.y); } });
    const R = new THREE.Vector3(0, ry, rz);
    rearPeep(b, R, 0.022, 0.0036, Number.isFinite(base) ? base - 0.004 : ry - 0.04);
    return { front: F.clone(), rear: R };
  })();
  const built = b.build({ name: "smg" });
  const mz = at(0.04 + drumL + 0.012);
  return { ...built, id: "smg", muzzle: mz, length: 0.62, gripAnchor: rp(1430, 1000), foreAnchor: rp(944, 1010), sightY: ring.y, fwd: FWD, sightLine };
}
