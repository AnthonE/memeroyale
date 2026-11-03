// Sawed-off banana shotgun "DOUBLE BUNCH" — target art gear-03-weapons (bottom-left), traced off the 2880² sheet.
// Four banana barrels stacked 2×2: the fat top pair ends in cream star-slice faces, the slimmer bottom pair in open
// brown bores with cream rims. A chunky brown strap binds the bundle; behind it a brown fore-end swallows the lower
// pair; the upper pair runs into a brown receiver (two rivets, yellow top lever); brown trigger guard + curled
// trigger; a cream ribbed flesh grip (six rings) hanging down-back, yellow bands top + bottom, lime cap.
import * as THREE from "three";
import { bananaGeometry, filletCyl, rbox, ringGeo, tf, alignY, type V3 } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { accentGem, bore, clearSlope, curvedGrip, hullBand, rivet, sightDot, sliceDisc, taperX, tracer, FWD } from "./common";
import type { GunSpec } from "./types";

// origin = grip top (art px 662, 1900); ¾ view yawed ~32° (cz 0.85); the target art tilts the muzzle up ~5°
const T = tracer(662, 1900, 0.00082, 0.85, 0.09);
const { rp, side } = T;

export function buildShotgun(): GunSpec {
  const b = new PartBuilder();
  // ---- barrel geometry (gun space): top pair fat, bottom pair slimmer, touching side by side
  // the target art's four barrels are near-equal (a tight 2x2 bundle), not fat-over-slim
  const RU = 0.048, RL = 0.044, SX = 0.05;
  const yU = rp(135, 1790).y, yL = rp(132, 1903).y;
  // sawed-off: the barrels are cut ~9 cm shorter than the traced target art
  const CUT = 0.09;
  const zM = rp(135, 1790).z + CUT;          // muzzle faces
  const zRU = rp(592, 1840).z;                // upper pair runs into the receiver
  const zRL = rp(440, 1930).z;                // lower pair ends inside the fore-end
  const barrel = (x: number, y: number, r: number, z0: number, z1: number, roll: number) => {
    const len = z1 - z0; // z0 = rear (larger z), z1 = muzzle
    const g = bananaGeometry({ length: -len, radius: r, bend: 0.05, facets: 5, round: 0.34, along: 26, radial: 50, squash: 1,
      profile: [0.88, 0.9, 0.92, 0.93, 0.95, 0.96, 0.97, 0.98, 0.99, 1, 1] });
    const m = new THREE.Matrix4().makeTranslation(x, y, z0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationX(roll));
    b.addGradient(g, C.bananaDeep, C.banana, "y", "gloss", m);
  };
  for (const sx of [1, -1]) {
    barrel(sx * SX, yU, RU, zRU, zM, sx * 0.3);
    barrel(sx * SX, yL, RL, zRL, zM, sx * 0.3 + Math.PI / 5);
    // top pair: cream slice in a yellow peel rim; bottom pair: open bores with a cream rim
    // the slice sits FLUSH in a thin peel lip (a 1 cm recess hides it behind the rim at the sheet's ¾ angle)
    b.add(ringGeo(RU * 1.0, RU * 0.86, 0.01, 0.003, 44), C.bananaDeep, "gloss", alignY(new THREE.Vector3(sx * SX, yU, zM + 0.001), FWD));
    sliceDisc(b, new THREE.Vector3(sx * SX, yU, zM + 0.0015), FWD, RU * 0.9, 0.006);
    const bc = new THREE.Vector3(sx * SX, yL, zM + 0.004);
    b.add(ringGeo(RL * 0.99, RL * 0.74, 0.016, 0.004, 40), C.flesh, "gloss", alignY(bc.clone().setZ(zM - 0.001), FWD));
    bore(b, bc.clone().setZ(zM + 0.006), FWD, RL * 0.76, 0.03);
    b.add(filletCyl(RL * 0.6, 0.004, 0, 24), "#140a04", "matte", alignY(bc.clone().setZ(zM + 0.05), FWD));
    // peel slash grooves on the outer flanks (target art: long cuts on each barrel side)
    b.add(rbox(0.004, 0.006, 0.09, 0.002, 1), "#9a6a08", "matte", tf([sx * (SX + RL * 0.96), yL + RL * 0.12, zM + 0.16], [0, 0, 0]));
    b.add(rbox(0.004, 0.006, 0.12, 0.002, 1), "#9a6a08", "matte", tf([sx * (SX + RU * 0.95), yU - RU * 0.28, zRU - 0.07], [0.04, 0, 0]));
  }
  // fill the diamond gap in the middle of the bundle so no light leaks through
  b.add(rbox(0.05, 0.08, zRU - zM - 0.03, 0.01, 2), C.bananaDeep, "gloss", tf([0, (yU + yL) / 2, (zRU + zM) / 2 + 0.01]));
  // ---- strap band around the whole bundle (hull of the four barrels), rivet + keeper on top
  const circles: Array<[number, number, number]> = [[SX, yU, RU * 0.985], [-SX, yU, RU * 0.985], [SX, yL, RL * 0.99], [-SX, yL, RL * 0.99]];
  const zS = rp(282, 1850).z + CUT * 0.45;
  hullBand(b, circles, zS, 0.044, 0.012, C.brown);
  hullBand(b, circles.map(([x, y, r]) => [x, y, r + 0.0115] as [number, number, number]), zS - 0.016, 0.005, 0.0022, C.brownDark);
  hullBand(b, circles.map(([x, y, r]) => [x, y, r + 0.0115] as [number, number, number]), zS + 0.016, 0.005, 0.0022, C.brownDark);
  for (const sx of [1, -1]) rivet(b, [sx * (SX + RU + 0.012), (yU + yL) / 2 - 0.004, zS], [sx, 0, 0], 0.0075);
  // keeper tongue lying in the top valley behind the strap
  // a small flat tab (a tall tongue arches over the bundle like a saddle handle)
  b.add(side([[282, 1742], [322, 1744], [350, 1756], [352, 1764], [318, 1764], [288, 1760]], 0.026, 0.005), C.brown, "matte", tf([0, 0.004, CUT * 0.45]));
  // ---- fore-end: brown block swallowing the lower pair behind the strap, rounded rear, one rivet per flank
  // the fore-end is a slim brown STRAP round the lower pair (barrels
  // stay visible), a second one just ahead of the receiver
  const lower = circles.slice(2);
  for (const zz of [rp(400, 1920).z, rp(452, 1920).z]) hullBand(b, lower.map(([x, y, r]) => [x, y, r * 0.99] as [number, number, number]), zz, 0.03, 0.009, C.brown);
  for (const sx of [1, -1]) { const rv = rp(426, 1912); rivet(b, [sx * (SX + RL + 0.009), rv.y - 0.004, rv.z], [sx, 0, 0], 0.0062); }
  // ---- receiver + lower frame (one brown casting): wide breech tapering toward the grip
  const recPts: Array<[number, number]> = [[452, 1892], [576, 1892], [580, 1804], [606, 1798], [642, 1820], [676, 1846], [694, 1870], [688, 1902], [664, 1936], [640, 1962], [616, 1972], [596, 1958], [566, 1942], [516, 1936], [478, 1932], [452, 1924]];
  const rec = side(recPts, 0.13, 0.02);
  const zF = rp(580, 1850).z, zB = rp(690, 1880).z;
  b.add(taperX(rec, zF, zB, 1, 0.58), C.brown, "matte");
  // breech collar: where the top pair enters the receiver
  hullBand(b, circles.slice(0, 2).map(([x, y, r]) => [x, y, r * 0.98] as [number, number, number]), zRU - 0.012, 0.026, 0.009, C.brownDark);
  // rivets on the receiver flank (art px 607,1884 + 635,1907)
  for (const sx of [1, -1]) {
    for (const [x, y] of [[607, 1884], [636, 1906]] as Array<[number, number]>) {
      const v = rp(x, y); const f = 1 - 0.42 * Math.min(1, Math.max(0, (v.z - zF) / (zB - zF)));
      rivet(b, [sx * (0.065 * f + 0.001), v.y, v.z], [sx, 0, 0], 0.0072);
    }
  }
  // yellow top lever on the receiver (raised rear tab)
  b.addGradient(side([[574, 1802], [580, 1790], [622, 1788], [634, 1778], [646, 1780], [648, 1794], [626, 1806], [582, 1810]], 0.026, 0.006), C.bananaDeep, C.banana, "y", "gloss");
  // ---- trigger guard (thick brown loop) + curled trigger
  b.add(side([[482, 1928], [490, 1958], [504, 1990], [528, 2014], [562, 2020], [594, 2010], [614, 1992], [624, 1964], [612, 1950]], 0.022, 0.006, false,
    [[[536, 1944], [534, 1972], [546, 1996], [566, 2002], [584, 1990], [590, 1966], [582, 1946]]]), C.brown, "matte");
  b.add(side([[544, 1946], [556, 1962], [562, 1984], [554, 2000], [544, 1998], [550, 1984], [546, 1964], [538, 1950]], 0.012, 0.003), C.brownDark, "matte");
  // ---- grip: cream ribbed flesh hanging down-back, yellow bands top + bottom, lime cap
  // raked back like the target art (the grip leaves the receiver at ~25 deg from vertical and curls further at the cap)
  const gp = [rp(662, 1892), rp(690, 1950), rp(716, 2004), rp(740, 2058), rp(758, 2112)];
  curvedGrip(b, gp, { depth: 0.1, width: 0.078, taper: 0.94, ribs: 5, ribU: [0.2, 0.78],
    bands: [{ u0: 0.06, u1: 0.2, color: C.banana, grow: 1.08 }, { u0: 0.78, u1: 0.9, color: C.banana, grow: 1.08 }], cap: { u0: 0.9, color: C.lime } });
  // ---- rarity accent: a gem on each receiver flank (first person sees the left one)
  const acc = b.sub("accent");
  const ap = rp(648, 1860);
  for (const sx of [1, -1]) accentGem(b, acc, [sx * 0.062, ap.y, ap.z], [sx, 0, 0], 0.01);
  // ---- a real shotgun sight — a flat brown RIB down the valley between the top pair and a
  // brass front BEAD with a bright pip at its muzzle end (the aim point): ADS looks along the rib to the bead (it looked
  // over a brown block at nothing). No rear sight (a double gun's is the rib itself): the line runs back from the bead
  // just clear of the breech
  // (a raised vent rib: it rides on the barrel strap and on a post at the muzzle, so the sight line clears the strap)
  const ribY = yU + RU + 0.017;
  b.add(rbox(0.013, 0.007, zRU - zM - 0.02, 0.003, 1), C.brown, "matte", tf([0, ribY, (zRU + zM) / 2 + 0.006]));
  for (const pz of [zM + 0.03, zRU - 0.03]) b.add(rbox(0.009, ribY - yU - 0.02, 0.012, 0.002, 1), C.brownDark, "matte", tf([0, (ribY + yU + 0.02) / 2, pz]));
  const F = new THREE.Vector3(0, ribY + 0.004 + 0.0058, zM + 0.016);
  b.add(new THREE.SphereGeometry(0.0062, 14, 10), C.gold, "metal", tf([F.x, F.y - 0.0008, F.z]));
  sightDot(b, new THREE.Vector3(F.x, F.y + 0.0004, F.z + 0.0042), 0.0026);
  const sightLine = (() => {
    const tmp = b.build({ name: "shotgun-probe" });
    // (a high cheek: the eye 5 cm above the breech line looks DOWN the rib, so the rib and the top barrels lead to the
    // bead in perspective and the breech drops to the bottom of the view)
    const rz = zB - 0.01;
    const slope = Math.max(0, clearSlope(tmp, F, 0.03, 0.004, 0.03, rz + 0.02));
    return { front: F.clone(), rear: new THREE.Vector3(0, F.y + slope * (rz - F.z) + 0.05, rz) };
  })();
  const built = b.build({ name: "shotgun" });
  return { ...built, id: "shotgun", muzzle: new THREE.Vector3(0, (yU + yL) / 2, zM - 0.01), length: -zM + 0.08,
    gripAnchor: rp(690, 1990), foreAnchor: rp(380, 1975), sightY: yU + RU, fwd: FWD, sightLine };
}
void (null as unknown as V3);
