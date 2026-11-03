// Banana assault rifle "BUNCHGUN" — target art gear-03-weapons (top-right), traced off the 2880² sheet. AK silhouette:
// brown muzzle brake with a star-slice face, a gas block with a tall windowed front-sight tower, a brown gas tube
// bracket, TWO cream flesh tubes (upper slim, lower fat) with yellow caps + dark vents bound by a rope lashing, a
// receiver of two stacked faceted bananas with a brown strap, a rear sight knob, a brown mag well, a two-tier
// "pumpkin" drum magazine of bananas with brown stem nubs and a vertical strap, a raked cream grip, and a brown
// wedge stock with green rope wraps. The target art draws it pitched muzzle-up ~6°; rp() un-rotates so the bore is level.
import * as THREE from "three";
import { bananaGeometry, bananaEnd, disc, extrude, extrudeSmooth, filletCyl, gridGeometry, lathe, rbox, ringGeo, smooth, tf, alignY, type V3 } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { hullRope, bananaBody, facetBand, muzzleDisc, rivet, ropeWrap, screw, sightDot, stemCap, FWD, UP } from "./common";
import type { GunSpec } from "./types";

/** how far the iron sights stand above the receiver (gun units) — see the ADS sight line at the end */
const SIGHT_RAISE = 0.034;
const X0 = 2560, Y0 = 930, K = 0.00082, KZ = K / 0.99, ALPHA = 0.1;
const ca = Math.cos(ALPHA), sa = Math.sin(ALPHA);
/** art px → gun space with the target art's muzzle-up tilt removed */
const rp = (x: number, y: number): THREE.Vector3 => {
  const dx = x - X0, dy = y - Y0;
  const fwd = dx * -ca + dy * -sa, up = dx * sa + dy * -ca;
  return new THREE.Vector3(0, up * K, -fwd * KZ);
};
/** shrink a closed outline by d (the extrude bevel grows it back to the drawn size) */
function inset(pts: Array<[number, number]>, d: number) {
  let area = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
  const sgn = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length], c = pts[(i + 1) % pts.length];
    let nx = 0, ny = 0;
    for (const [u, v] of [[a, p], [p, c]] as Array<[[number, number], [number, number]]>) { const ex = v[0] - u[0], ey = v[1] - u[1], l = Math.hypot(ex, ey) || 1; nx += -ey / l; ny += ex / l; }
    const l = Math.hypot(nx, ny) || 1; return [p[0] + (sgn * nx / l) * d, p[1] + (sgn * ny / l) * d] as [number, number];
  });
}
function side(pts: Array<[number, number]>, w: number, bv: number, sharp = false, keep = false) {
  let p2 = pts.map(([x, y]) => { const v = rp(x, y); return [-v.z, v.y] as [number, number]; });
  if (!sharp && !keep && bv >= 0.015) p2 = inset(p2, bv * 0.85);
  const g = sharp ? extrude(p2, w, bv, 6, 2) : extrudeSmooth(p2, w, bv, 72, 3);
  g.rotateY(Math.PI / 2);
  return smooth(g, sharp ? 40 : 60);
}
/** a tube between two art points (radius in px) */
function tubeBetween(b: PartBuilder, a: [number, number], c: [number, number], rPx: number, color: string, kind: "gloss" | "matte" = "matte", fillet = 0.004) {
  const p0 = rp(...a), p1 = rp(...c);
  b.add(filletCyl(rPx * K, p0.distanceTo(p1), fillet, 32), color, kind, alignY(p0.clone().lerp(p1, 0.5), p1.clone().sub(p0)));
  return { p0, p1, dir: p1.clone().sub(p0).normalize() };
}

/** the drum magazine: ONE smooth "pumpkin" of `count` banana lobes (the target art's tidy
 *  ball of bananas standing on end): an ellipsoid whose radius dips into a narrow dark groove between neighbouring lobes
 *  and into a latitude groove at the stem ring (a third down from the top — the short upper tier points up, the long
 *  lower tier hangs down); each lobe bright lemon at its crown, deep yellow in the grooves; brown hex stem nubs round
 *  the stem ring, small brown tips at the bottom. Axis +Y. */
function bananaDrum(b: PartBuilder, c: THREE.Vector3, R: number, H: number, count: number, r: number, phase = 0) {
  const lat0 = 0.34;                       // stem ring latitude (sin φ): above the equator
  const ROWS = 72, COLS = count * 14;
  const lobe = (th: number) => { let u = ((th - phase) / (Math.PI * 2)) * count; u -= Math.floor(u); return Math.sqrt(Math.max(0, 1 - (2 * u - 1) * (2 * u - 1))); };
  const radius = (th: number, sp: number) => {
    const ring = 1 - 0.075 * Math.exp(-Math.pow((sp - lat0) / 0.05, 2));
    return (0.83 + 0.17 * Math.pow(lobe(th), 0.5)) * ring;
  };
  const g = gridGeometry(ROWS, COLS, (i, j, out) => {
    const v = i / (ROWS - 1), sp = Math.sin((v - 0.5) * Math.PI), cp = Math.cos((v - 0.5) * Math.PI);
    const th = (j / COLS) * Math.PI * 2, k = radius(th, sp);
    out.set(Math.cos(th) * cp * R * k, sp * H * (0.96 + 0.04 * k), Math.sin(th) * cp * R * k);
  }, true);
  // gridGeometry winds for curve sweeps (rows along a tangent): make the drum face outward
  { const ix = g.index!.array as Uint32Array | Uint16Array; const p = g.attributes.position as THREE.BufferAttribute, a = new THREE.Vector3(), b2 = new THREE.Vector3(), c2 = new THREE.Vector3();
    a.fromBufferAttribute(p, ix[COLS * 10 * 3 + 0] ?? ix[0]); b2.fromBufferAttribute(p, ix[COLS * 10 * 3 + 1] ?? ix[1]); c2.fromBufferAttribute(p, ix[COLS * 10 * 3 + 2] ?? ix[2]);
    const n = b2.clone().sub(a).cross(c2.clone().sub(a)); if (n.dot(a) < 0) { for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; } g.computeVertexNormals(); } }
  const deep = new THREE.Color(C.bananaDeep), lemon = new THREE.Color(C.banana), groove = new THREE.Color("#c99a10"), col = new THREE.Color();
  b.addPainted(g, (p) => {
    const q = p.clone().sub(c), th = Math.atan2(q.z, q.x), sp = Math.max(-1, Math.min(1, q.y / H));
    const l = lobe(th), ringK = Math.exp(-Math.pow((sp - lat0) / 0.06, 2));
    col.copy(groove).lerp(deep, Math.min(1, l * 1.6)).lerp(lemon, Math.max(0, l - 0.35) * (0.55 + 0.45 * Math.max(0, sp + 0.3)));
    return col.lerp(groove, ringK * 0.8);
  }, "gloss", tf(c.toArray() as V3));
  // stem nubs (hexagonal, brown) round the stem ring at every lobe crown; small dark tips at the bottom pole
  const ringR = R * Math.sqrt(1 - lat0 * lat0) * 0.93, ringY = lat0 * H;
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * Math.PI * 2 + phase;
    const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const pUp = c.clone().addScaledVector(radial, ringR).addScaledVector(UP, ringY);
    b.add(filletCyl(r * 0.36, r * 0.8, r * 0.12, 14, r * 0.3, r * 0.4), C.brown, "matte", alignY(pUp.clone().addScaledVector(radial, r * 0.1), radial.clone().addScaledVector(UP, 0.5), 0));
    b.add(disc(r * 0.26, r * 0.06, r * 0.02, 14), C.brownDark, "matte", alignY(pUp.clone().addScaledVector(radial, r * 0.5).addScaledVector(UP, r * 0.22), radial.clone().addScaledVector(UP, 0.5)));
    const tipLat = -0.78, tr = R * Math.sqrt(1 - tipLat * tipLat) * 0.9;
    const pT = c.clone().addScaledVector(radial, tr).addScaledVector(UP, tipLat * H * 0.97);
    b.add(filletCyl(r * 0.15, r * 0.3, r * 0.06, 10, r * 0.12, r * 0.17), C.brownDark, "matte", alignY(pT, radial.clone().addScaledVector(UP, -1.4)));
  }
}

/** the drum is a real
 *  BUNCH — `count` faceted bananas standing on end round the axis, bellies out, stems gathered into a brown crown at the
 *  top (under the well), tips gathered at the bottom with small dark tip caps. Axis +Y, centre c, outer radius R. */
function bananaBall(b: PartBuilder, c: THREE.Vector3, R: number, H: number, count: number, phase = 0) {
  // slimmer bananas (r 0.33 R, not 0.4 R) so each one reads on its own
  // with a dark gap between neighbours, a dark core behind them (the gaps show shadow, not more yellow), and a little
  // per-banana variation in length / lean / turn (a real bunch is never a perfect lobe pattern)
  // fuller (br 0.33 → 0.4 R) and straighter (bend 1.75 → 1.3 rad) — the target art's bunch is a near-round ball, ours
  // pinched to an egg at the top and bottom
  const L0 = 2 * H * 0.92, br = R * 0.4, bend = 1.3;
  b.add(new THREE.SphereGeometry(1, 24, 16).scale(R * 0.62, H * 0.82, R * 0.62), "#3a2410", "matte", tf(c.toArray() as V3));
  for (let i = 0; i < count; i++) {
    const jit = Math.sin(i * 12.9898 + 4.1) * 0.5 + 0.5, jit2 = Math.sin(i * 78.233 + 1.7) * 0.5 + 0.5;
    const L = L0 * (0.93 + 0.08 * jit);
    const Rc = L / (2 * Math.sin(bend / 2)), sag = Rc * (1 - Math.cos(bend / 2));
    const d0 = Math.max(0.008, R - sag - br);
    const a = (i / count) * Math.PI * 2 + phase + (jit2 - 0.5) * 0.12;
    const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const lean = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar((jit - 0.5) * 0.16);
    const xp = UP.clone().add(lean).normalize(), yp = radial.clone().negate(), zp = new THREE.Vector3().crossVectors(xp, yp).normalize();
    yp.crossVectors(zp, xp).normalize();
    const base = c.clone().addScaledVector(radial, d0).addScaledVector(UP, -L / 2 + (jit2 - 0.5) * H * 0.06);
    const m = new THREE.Matrix4().makeBasis(xp, yp, zp).setPosition(base);
    const o = { length: L, radius: br, bend, facets: 5, round: 0.22, along: 30, radial: 30, squash: 0.88, profile: [0.32, 0.7, 0.92, 1, 1, 1, 1, 0.95, 0.84, 0.62, 0.36] };
    b.addGradient(bananaGeometry(o), C.bananaDeep, C.banana, "y", "gloss", m);
    // stem (top) → a brown nub; tip (bottom) → a small dark cap
    const st = bananaEnd(o, true), tp = bananaEnd(o, false);
    for (const [e, stem] of [[st, true], [tp, false]] as Array<[ReturnType<typeof bananaEnd>, boolean]>) {
      const cen = e.center.clone().applyMatrix4(m), dir = e.dir.clone().transformDirection(m);
      const isTop = cen.y > c.y;
      void stem; b.add(filletCyl(e.radius * (isTop ? 0.62 : 0.5), e.radius * (isTop ? 0.9 : 0.5), e.radius * 0.15, 12), isTop ? C.brown : C.brownDark, "matte", alignY(cen.clone().addScaledVector(dir, e.radius * 0.2), dir));
    }
  }
  // the bunch's brown band: a strap round the stem tier (a third down from the top), riding on the bananas
  { const yB = c.y + H * 0.42, rB = R * 0.9; const band = new THREE.TorusGeometry(rB, 0.007, 8, 64); band.scale(1, 1, 2.2); band.rotateX(Math.PI / 2);
    b.add(band, C.brown, "matte", tf([c.x, yB, c.z])); }
  // the crown: a brown collar gathering the stems under the mag well, and a dark cap under the tips
  b.add(filletCyl(R * 0.42, H * 0.16, 0.006, 24), C.brown, "matte", tf([c.x, c.y + H * 0.93, c.z]));
  b.add(filletCyl(R * 0.2, H * 0.1, 0.004, 18), C.brownDark, "matte", tf([c.x, c.y - H * 0.95, c.z]));
}

export function buildAr(): GunSpec {
  const b = new PartBuilder();
  // ---- muzzle brake (x 1600…1700), star-slice face, vent slot; collar
  const mb = tubeBetween(b, [1604, 781], [1702, 786], 23, C.brown, "matte", 0.006);
  muzzleDisc(b, mb.p0, mb.dir.clone().negate(), 21 * K, C.brownDark, 0.008, 0.02);
  for (const sx of [1, -1]) b.add(rbox(0.004, 0.011, 0.028, 0.002, 1), "#2a1609", "matte", tf([sx * 22 * K, rp(1655, 783).y, rp(1655, 783).z]));
  tubeBetween(b, [1700, 786], [1722, 787], 28, C.brownDark, "matte", 0.004);
  // ---- gas block + front-sight tower (tall post with a window, ringed top)
  b.add(side([[1716, 752], [1800, 756], [1804, 826], [1716, 822]], 0.05, 0.008, true), C.brown, "matte");
  // tower: two slim legs (a triangular window between them) rising to a ring
  b.add(side([[1744, 758], [1760, 690], [1756, 676], [1768, 676], [1764, 758]], 0.02, 0.004, true), C.brown, "matte");
  b.add(side([[1770, 758], [1774, 676], [1784, 676], [1788, 758]], 0.02, 0.004, true), C.brown, "matte");
  b.add(side([[1752, 700], [1784, 700], [1786, 716], [1750, 716]], 0.02, 0.003, true), C.brown, "matte");
  const ringTop = rp(1768, 660);
  // a wider, thinner aperture ring — the ADS sight picture looks THROUGH it, and a 40 m
  // kong fits inside the hole instead of being covered by a fat post
  // the aperture rides SIGHT_RAISE higher on two slim uprights (a raised AK-style hood), so in ADS the receiver and
  // stock fall well below the sight line instead of crowding the crosshair
  const ringC = ringTop.y + 0.006 + SIGHT_RAISE;
  b.add(new THREE.TorusGeometry(0.024, 0.0042, 10, 32), C.brown, "matte", tf([0, ringC, ringTop.z]));   // hole along the bore (it was edge-on: a post in the sight picture)
  for (const sx of [1, -1]) b.add(rbox(0.0055, SIGHT_RAISE + 0.012, 0.012, 0.002, 1), C.brown, "matte", tf([sx * 0.02, ringTop.y + 0.004 + (SIGHT_RAISE - 0.012) / 2, ringTop.z]));
  // a slim front BLADE rising inside the hood to
  // the aperture's centre with a bright fibre tip — the aim point sits exactly on the crosshair spot (the hood alone left
  // you guessing the middle of an empty ring)
  { const bl = 0.0225; b.add(rbox(0.0034, bl, 0.006, 0.0012, 1), C.brownDark, "matte", tf([0, ringC - 0.024 + bl / 2, ringTop.z]));
    sightDot(b, new THREE.Vector3(0, ringC - 0.0008, ringTop.z), 0.0031); }
  // ---- barrel sections to the lower tube + a collar
  tubeBetween(b, [1800, 790], [1866, 792], 21, C.brown, "matte", 0.003);
  tubeBetween(b, [1862, 792], [1884, 793], 29, C.brownDark, "matte", 0.004);
  tubeBetween(b, [1880, 794], [1968, 798], 24, C.brown, "matte", 0.003);
  // gas tube bracket: rises from the barrel collar to the front of the upper tube
  // a STRAIGHT riser (not a U-shaped pipe) from the barrel collar + a straight gas tube into the upper
  // cream tube, joined by a short square elbow block (the target art's AK gas tube)
  {
    const r0 = rp(1878, 790), r1 = rp(1878, 726), g1 = rp(1984, 728);
    b.add(filletCyl(0.0125, r0.distanceTo(r1), 0.003, 20), C.brown, "matte", alignY(r0.clone().lerp(r1, 0.5), r1.clone().sub(r0)));
    b.add(filletCyl(0.0125, r1.distanceTo(g1), 0.003, 20), C.brown, "matte", alignY(r1.clone().lerp(g1, 0.5), g1.clone().sub(r1)));
    b.add(rbox(0.032, 0.034, 0.034, 0.008, 2), C.brownDark, "matte", tf(r1.toArray() as V3));
    b.add(ringGeo(0.019, 0.011, 0.012, 0.003, 20), C.brownDark, "matte", alignY(r0.clone().lerp(r1, 0.3), r1.clone().sub(r0)));
  }
  // ---- cream flesh tubes: upper slim (r 40) + lower fat (r 62), yellow front caps, vents, rope lashing
  const up0: [number, number] = [1980, 728], up1: [number, number] = [2250, 748];
  const lo0: [number, number] = [1984, 832], lo1: [number, number] = [2240, 862];
  const tU = tubeBetween(b, up0, up1, 40, C.cream, "gloss", 0.01);
  const tL = tubeBetween(b, lo0, lo1, 60, C.cream, "gloss", 0.014);
  for (const [t, r] of [[tU, 40], [tL, 60]] as Array<[typeof tU, number]>) {
    // yellow end caps front + back, faint segment rings, peeled-flesh grooves along the tube
    b.add(ringGeo(r * K * 1.1, r * K * 0.55, 0.032, 0.007, 36), C.banana, "gloss", alignY(t.p0.clone().addScaledVector(t.dir, 0.012), t.dir));
    b.add(ringGeo(r * K * 1.08, r * K * 0.55, 0.026, 0.006, 36), C.bananaDeep, "gloss", alignY(t.p1.clone().addScaledVector(t.dir, -0.01), t.dir));
    const q = new THREE.Quaternion().setFromUnitVectors(UP, t.dir);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const rad = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(q);
      const L = t.p0.distanceTo(t.p1) * 0.86;
      b.add(filletCyl(0.0016, L, 0.0006, 5), C.creamDeep, "matte", alignY(t.p0.clone().lerp(t.p1, 0.5).addScaledVector(rad, r * K * 0.995), t.dir));
    }
  }
  for (const [x, y] of [[2050, 758], [2150, 764], [2060, 870], [2170, 882]] as Array<[number, number]>) {
    const v = rp(x, y);
    for (const sx of [1, -1]) b.add(rbox(0.006, 0.01, 0.034, 0.002, 1), "#3a2412", "matte", tf([sx * (y > 800 ? 58 : 38) * K, v.y, v.z]));
  }
  // rope lashing binding both tubes (x≈2120): three turns that HUG the two tubes' outline (an oval
  // stadium floated off both tubes)
  {
    const zc = rp(2118, 800).z;
    const at = (t: typeof tU) => { const k = (zc - t.p0.z) / (t.p1.z - t.p0.z); return t.p0.y + (t.p1.y - t.p0.y) * k; };
    hullRope(b, [[0, at(tU), 40 * K], [0, at(tL), 60 * K]], zc, 3, 0.0052, C.rope, 1.08);
  }
  // ---- receiver: two stacked faceted bananas (upper stem at the rear), brown strap on the lower
  const recU = bananaBody(b, { length: rp(2250, 740).distanceTo(rp(2612, 812)), radius: 0.04, bend: 0.3, facets: 5, round: 0.35, along: 36, radial: 48, squash: 0.95,
    profile: [0.6, 0.86, 0.98, 1, 1, 1, 1, 0.99, 0.98, 0.97, 0.96], at: rp(2612, 812).toArray() as V3, pitch: Math.atan2(rp(2250, 740).y - rp(2612, 812).y, rp(2612, 812).z - rp(2250, 740).z) });
  stemCap(b, recU.stem.center, recU.stem.dir, recU.stem.radius * 0.8, 0.03, 0.2);
  const recL = bananaBody(b, { length: rp(2236, 836).distanceTo(rp(2604, 900)), radius: 0.047, bend: 0.22, facets: 5, round: 0.35, along: 36, radial: 48, squash: 0.95,
    profile: [0.6, 0.86, 0.98, 1, 1, 1, 1, 0.99, 0.98, 0.97, 0.96], at: rp(2604, 900).toArray() as V3, pitch: Math.atan2(rp(2236, 836).y - rp(2604, 900).y, rp(2604, 900).z - rp(2236, 836).z) });
  b.add(new THREE.SphereGeometry(0.03, 12, 10), C.limeDark, "gloss", tf(recL.stem.center.toArray() as V3));
  const st = facetBand(b, recL, 0.2, 0.03, 0.007, C.brown);
  for (const sx of [1, -1]) b.add(rbox(0.008, 0.03, 0.03, 0.004, 2), C.brownDark, "matte", tf(st.center.clone().addScaledVector(st.B, sx * st.radius * 0.95).toArray() as V3));
  facetBand(b, recU, 0.62, 0.02, 0.006, C.brown);
  // rear sight: small brown post with a round knob
  const rs = rp(2318, 708);
  b.add(rbox(0.022, 0.022, 0.04, 0.005, 2), C.brown, "matte", tf([0, rs.y, rs.z]));
  b.add(new THREE.SphereGeometry(0.011, 14, 10), C.brownDark, "matte", tf([0, rs.y + 0.006, rs.z + 0.022]));
  // side charging rail on the upper banana
  for (const sx of [1, -1]) b.add(side([[2300, 760], [2400, 772], [2398, 790], [2300, 780]], 0.006, 0.002, true), "#3a2412", "matte", tf([sx * 0.046, 0, 0]));
  // ---- mag well (brown bracket) under the front of the receiver
  b.add(side([[2310, 872], [2440, 890], [2436, 940], [2310, 936]], 0.07, 0.01, true), C.brown, "matte");
  b.add(side([[2364, 868], [2400, 872], [2398, 896], [2364, 892]], 0.076, 0.004, true), C.brownDark, "matte");
  // ---- drum magazine (pivot at the well for reloads): banana pumpkin + vertical strap with a buckle
  // centre + radii measured on the target art (drum spans x 2163-2451, y 919-1230)
  const drumC = rp(2300, 1084), DR = 166 * K, DH = 166 * K;   // ×1.15 / ×1.07 — the bunch read small next to the target art
  const drum = b.sub("mag", rp(2380, 920).toArray() as V3);
  // 12 slimmer columns → the target art's tidy ribbed pumpkin
  bananaBall(drum, drumC, DR, DH, 7, 0.13); void bananaDrum;
  // a WIDE brown band round the rear third of the drum (vertical hoop) with a square buckle + pin
  const hz = DR * 0.5, hr = DR * Math.sqrt(1 - 0.5 * 0.5) * 0.99 + 0.006;
  {
    const prof: Array<[number, number]> = [[-0.004, -0.015], [0.005, -0.015], [0.009, -0.011], [0.01, 0], [0.009, 0.011], [0.005, 0.015], [-0.004, 0.015]];
    const pts: number[] = [], idx: number[] = [];
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2, cx = Math.cos(t) * hr, cy = Math.sin(t) * hr * (DH / DR);
      const nx = Math.cos(t), ny = Math.sin(t) * (DR / DH), nl = Math.hypot(nx, ny);
      for (const [o, w] of prof) pts.push(cx + (nx / nl) * o, cy + (ny / nl) * o, w);
    }
    const P = prof.length;
    for (let i = 0; i < N; i++) for (let j = 0; j < P - 1; j++) { const a0 = i * P + j, b0 = a0 + P; idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); bg.setIndex(idx); bg.computeVertexNormals();
    drum.add(bg, C.brown, "matte", tf(drumC.clone().setZ(drumC.z + hz).toArray() as V3));
  }
  drum.add(rbox(0.016, 0.05, 0.042, 0.005, 2), C.brownDark, "matte", tf([hr * 1.0 + 0.006, drumC.y, drumC.z + hz]));
  drum.add(rbox(0.008, 0.03, 0.026, 0.003, 1), C.gold, "metal", tf([hr * 1.0 + 0.015, drumC.y, drumC.z + hz]));
  drum.add(rbox(0.018, 0.12, 0.05, 0.006, 2), C.brown, "matte", tf([0, rp(2380, 950).y, rp(2380, 950).z]));
  // ---- trigger guard + trigger
  b.add(side([[2436, 922], [2440, 960], [2466, 984], [2512, 986], [2540, 962], [2540, 926], [2526, 926], [2526, 956], [2508, 972], [2470, 970], [2452, 952], [2450, 922]], 0.016, 0.004), C.brown, "matte");
  b.add(side([[2480, 928], [2492, 944], [2494, 966], [2484, 972], [2480, 960], [2484, 944], [2474, 932]], 0.011, 0.003), C.brownDark, "matte");
  // ---- grip: cream, raked, grooves, yellow band + brown base
  const gr: Array<[number, number]> = [[2536, 916], [2596, 908], [2616, 960], [2632, 1030], [2644, 1100], [2580, 1106], [2566, 1040], [2548, 980]];
  b.addGradient(side(gr, 0.042, 0.013), C.creamDeep, C.cream, "y", "gloss");
  for (let k = 0; k < 5; k++) {
    const y = 950 + k * 30, x0 = 2552 + (y - 916) * 0.26, x1 = 2604 + (y - 916) * 0.3;
    const g0 = rp(x0, y), g1 = rp(x1, y + 4);
    for (const sx of [1, -1]) b.add(filletCyl(0.0015, g0.distanceTo(g1), 0.0005, 5), C.creamDeep, "matte", alignY(g0.clone().lerp(g1, 0.5).setX(sx * 0.0212), g1.clone().sub(g0)));
  }
  b.add(side([[2578, 1096], [2646, 1090], [2650, 1116], [2582, 1122]], 0.047, 0.007), C.banana, "gloss");
  b.add(side([[2583, 1122], [2650, 1116], [2654, 1136], [2587, 1142]], 0.042, 0.006), C.brown, "matte");
  // ---- stock: brown wedge, butt plate, green rope wraps
  // a MODELLED wooden stock — the wedge outline smoothed
  // and fully bevelled (a rounded comb on top, a rounded toe), a raised cheek-rest panel on each side, a darker inlaid
  // toe line and a rubber butt pad with a rounded edge, instead of one sharp extruded slab
  const stockP: Array<[number, number]> = [[2604, 806], [2660, 800], [2800, 818], [2826, 822], [2832, 1000], [2804, 1004], [2720, 966], [2662, 910], [2616, 880]];
  b.addGradient(side(stockP, 0.06, 0.02), C.brown, C.brownLight, "y", "matte");
  b.add(side([[2668, 812], [2790, 826], [2796, 876], [2700, 866], [2670, 846]], 0.072, 0.01), C.brownLight, "matte");   // cheek rest
  b.add(side([[2690, 930], [2800, 984], [2800, 994], [2686, 940]], 0.064, 0.004), C.brownDark, "matte");               // toe inlay
  b.add(side([[2810, 818], [2842, 820], [2848, 1002], [2814, 1008]], 0.066, 0.012), C.brownDark, "matte");             // butt pad
  for (let k = 0; k < 4; k++) { const y = 850 + k * 40; b.add(side([[2836, y], [2850, y], [2850, y + 8], [2836, y + 8]], 0.068, 0.002, true), "#2a170a", "matte"); }
  const rw = rp(2732, 890);
  // the green rope bands wrap the stock's section (a rounded rectangle, 0.058 wide) and follow its sloping
  // underside (ellipses stood off the wedge)
  for (let k = 0; k < 3; k++) {
    const x = 2712 + k * 18;
    const top = rp(x, 802 + k * 1.5 - 2), bot = rp(x - 4, 958 + k * 10 + 4);
    const pts: THREE.Vector3[] = [];
    const cy = (top.y + bot.y) / 2, hy = (top.y - bot.y) / 2, hx = 0.029 + 0.0058, cz = (top.z + bot.z) / 2, n = 2 / 6;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
      pts.push(new THREE.Vector3(Math.sign(sa) * Math.pow(Math.abs(sa), n) * hx, cy + Math.sign(ca) * Math.pow(Math.abs(ca), n) * hy, cz + (ca > 0 ? top.z - cz : bot.z - cz) * Math.abs(ca)));
    }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.0062, 8, true), k === 1 ? C.lime : C.limeDark, "rope");
  }
  void rw;
  screw(b, [0.03, rp(2640, 850).y, rp(2640, 850).z], [1, 0, 0], 0.005);
  screw(b, [-0.03, rp(2640, 850).y, rp(2640, 850).z], [-1, 0, 0], 0.005);
  void ropeWrap; void rivet; void lathe;
  const mz = mb.p0.clone().addScaledVector(mb.dir, -0.012);
  // ---- iron-sight line: the eye looks through the front aperture and a rear PEEP ring
  // (a wide ghost ring: close to the eye in ADS, its hole frames the front aperture) set on a post on the line that clears
  // everything behind the front sight (the upper receiver banana, the rope wraps, the stock comb) by SIGHT_RAISE —
  // an aligned sight picture with the gun low in the frame. (These must be added BEFORE b.build() or they are never drawn.)
  const F = new THREE.Vector3(0, ringC, ringTop.z);
  const obst: THREE.Vector3[] = [];
  for (let x = 2250; x <= 2612; x += 18) { const k = (x - 2250) / (2612 - 2250); obst.push(rp(x, 740 + (812 - 740) * k).add(new THREE.Vector3(0, 0.04 + SIGHT_RAISE, 0))); }
  for (const [x, y] of [[2660, 800], [2712, 806], [2750, 810], [2800, 818], [2826, 822]] as Array<[number, number]>) obst.push(rp(x, y).add(new THREE.Vector3(0, 0.012 + SIGHT_RAISE, 0)));
  let slope = -Infinity; for (const o of obst) slope = Math.max(slope, (o.y - F.y) / (o.z - F.z));
  const peepZ = rs.z + 0.01, peepY = F.y + slope * (peepZ - F.z) + 0.008;
  const PR = 0.03;   // ghost-ring radius (gun units)
  for (const sx of [1, -1]) b.add(rbox(0.009, Math.max(0.01, peepY - rs.y), 0.014, 0.003, 1), C.brown, "matte", tf([sx * (PR * 0.8), (rs.y + peepY) / 2 - 0.006, peepZ]));
  b.add(new THREE.TorusGeometry(PR, 0.0045, 10, 40), C.brownDark, "matte", tf([0, peepY, peepZ], [0, 0, 0]));
  const sightLine = { front: F, rear: new THREE.Vector3(0, peepY, peepZ) };
  const built = b.build({ name: "ar" });
  return { ...built, id: "ar", muzzle: mz, length: 1.0, gripAnchor: rp(2585, 980), foreAnchor: rp(2080, 900), sightY: ringTop.y, fwd: FWD, sightLine };
}
