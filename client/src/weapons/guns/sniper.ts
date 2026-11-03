// Banana sniper — target art gear-03-weapons (bottom-middle), ~1.1 m. One connected
// yellow stock (fore-end → receiver line → wrist, extruded from its side profile) with a swept pistol grip, the thick
// cream flesh barrel half sunk into the fore-end and running into a brown receiver, a ball-knob bolt at the rear right,
// a wooden-log scope lashed with green vines on two short mounts, rope at the wrist, trigger + guard, and a compact
// cream coil-wrapped butt with a lime butt plate.
import * as THREE from "three";
import { extrudeSmooth, filletCyl, rbox, ringGeo, smooth, tf } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { block, bore, ringLoop, ropeWrap, screw, triggerGuard, tube, FWD } from "./common";
import type { GunSpec } from "./types";

export function buildSniper(): GunSpec {
  const b = new PartBuilder();
  const Y = 0.05;            // body centre line
  const BR = 0.059;          // body half-width (fat)
  // one connected silhouette: the stock is ONE extruded yellow side profile — a
  // rounded fore-end the barrel sinks into, the flat receiver line, the wrist — instead of a pointed banana whose tip
  // pierced the stock; a separate swept pistol grip under the wrist (what the right hand holds); the barrel runs INTO a
  // brown receiver; a ball-knob bolt at the rear right; a compact cream coil-wrapped butt with a lime plate (target art).
  // ExtrudeGeometry's bevel grows the outline by `bevel`: inset the profile by it first so the part keeps its drawn size
  const inset = (pts: Array<[number, number]>, d: number) => {
    let area = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const sgn = area > 0 ? 1 : -1;
    return pts.map((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length], c = pts[(i + 1) % pts.length];
      let nx = 0, ny = 0;
      for (const [u, v] of [[a, p], [p, c]] as Array<[[number, number], [number, number]]>) { const ex = v[0] - u[0], ey = v[1] - u[1], l = Math.hypot(ex, ey) || 1; nx += -ey / l; ny += ex / l; }
      const l = Math.hypot(nx, ny) || 1; return [p[0] + (sgn * nx / l) * d, p[1] + (sgn * ny / l) * d] as [number, number];
    });
  };
  const side = (pts: Array<[number, number]>, depth: number, bevel: number) => { const g = extrudeSmooth(inset(pts, bevel * 0.85), depth, bevel, 64, 4); g.rotateY(Math.PI / 2); return smooth(g, 60); };
  // profile = (forward = −z, y)
  const body: Array<[number, number]> = [[0.41, Y + 0.004], [0.395, Y + 0.036], [0.32, Y + 0.048], [0.12, Y + 0.054], [-0.05, Y + 0.054], [-0.14, Y + 0.047], [-0.2, Y + 0.034],
    [-0.215, Y + 0.0], [-0.2, Y - 0.036], [-0.12, Y - 0.046], [0.0, Y - 0.047], [0.2, Y - 0.047], [0.33, Y - 0.041], [0.395, Y - 0.026]];
  b.addGradient(side(body, BR * 2, 0.034), C.bananaDeep, C.banana, "y", "gloss");
  // a faint peel ridge along each flank + a darker belly seam (the target art's painted banana lines)
  for (const x of [-1, 1]) tube(b, [x * BR * 0.93, Y + 0.012, -0.05], [0, 0, 1], 0.004, 0.5, C.bananaDeep, "gloss", 0.002, 8);
  // pistol grip: swept back under the wrist
  const grip: Array<[number, number]> = [[-0.068, Y - 0.02], [-0.118, Y - 0.022], [-0.192, Y - 0.14], [-0.186, Y - 0.166], [-0.132, Y - 0.168], [-0.078, Y - 0.07]];
  b.addGradient(side(grip, 0.072, 0.024), C.bananaDeep, C.banana, "y", "gloss");
  b.add(rbox(0.074, 0.016, 0.066, 0.007, 2), C.limeDark, "gloss", tf([0, Y - 0.162, 0.16], [-0.5, 0, 0]));   // green grip cap
  // ---- barrel: thick cream flesh half sunk into the fore-end top, faint segment rings, brown muzzle ring + bore
  const BY = Y + 0.045, br = 0.037, BZ0 = -0.64;
  const BZ1 = -0.02;
  tube(b, [0, BY, (BZ0 + BZ1) / 2], [0, 0, 1], br, BZ1 - BZ0, C.cream, "gloss", 0.006, 28);
  for (const z of [-0.44, -0.52]) b.add(ringGeo(br + 0.0008, br - 0.004, 0.004, 0, 28), C.creamDeep, "matte", tf([0, BY, z], [Math.PI / 2, 0, 0]));
  b.add(ringGeo(br * 1.2, br * 0.78, 0.05, 0.007, 28), C.brown, "matte", tf([0, BY, BZ0 + 0.02], [Math.PI / 2, 0, 0]));
  bore(b, new THREE.Vector3(0, BY, BZ0 - 0.004), new THREE.Vector3(0, 0, -1), br * 0.95, 0.05);
  // brown collar where the barrel leaves the fore-end nose + a band under the fore-end (target art)
  b.add(ringGeo(br * 1.18, br * 0.92, 0.024, 0.006, 28), C.brown, "matte", tf([0, BY, -0.405], [Math.PI / 2, 0, 0]));
  block(b, [0, Y - 0.04, -0.36], [0.05, 0.03, 0.05], C.brown, "matte", [0, 0, 0], 0.008);
  // ---- receiver: a brown action block the barrel runs into, ejection port, screws
  const RT = Y + 0.088;       // receiver top
  block(b, [0, (Y + 0.036 + RT) / 2, 0.02], [0.058, RT - Y - 0.036, 0.2], C.brown, "matte", [0, 0, 0], 0.008);
  block(b, [0.03, Y + 0.068, 0.03], [0.004, 0.02, 0.07], "#2a170a", "matte", [0, 0, 0], 0.002);
  for (const z of [-0.06, 0.1]) { screw(b, [0.03, Y + 0.058, z], [1, 0, 0], 0.005); screw(b, [-0.03, Y + 0.058, z], [-1, 0, 0], 0.005); }
  // the bolt: a pivot at the rear right (1P: the right hand lifts + pulls it during the reload) — bolt body along the
  // receiver top, the handle out to the right, a round knob
  const bolt = b.sub("bolt", [0.02, RT, 0.1]);
  tube(bolt, [0, RT + 0.004, 0.095], [0, 0, 1], 0.014, 0.08, C.brownDark, "matte", 0.003, 14);
  tube(bolt, [0.04, RT - 0.002, 0.118], [1, -0.15, 0.2], 0.008, 0.07, C.brown, "matte", 0.002, 12);
  bolt.add(new THREE.SphereGeometry(0.019, 18, 12), C.brownDark, "matte", tf([0.078, RT - 0.008, 0.126]));
  // ---- scope: a wooden log on two short brown mounts, cream end rings, dark bores, two green vine lashings
  const LR = 0.074, S0 = -0.33, S1 = 0.07, SY = 0.25;
  for (const z of [-0.2, 0.0]) {
    const y0 = z < -0.05 ? BY + br - 0.004 : RT, y1 = SY - LR * 0.92;
    block(b, [0, y0 + 0.008, z], [0.046, 0.016, 0.044], C.brownDark, "matte", [0, 0, 0], 0.005);
    block(b, [0, (y0 + y1) / 2 + 0.008, z], [0.028, y1 - y0, 0.032], C.brown, "matte", [0, 0, 0], 0.006);
    b.add(ringGeo(LR * 1.1, LR * 0.93, 0.03, 0.005, 32), C.brown, "matte", tf([0, SY, z], [Math.PI / 2, 0, 0]));
    screw(b, [0.015, (y0 + y1) / 2 + 0.008, z], [1, 0, 0], 0.005); screw(b, [-0.015, (y0 + y1) / 2 + 0.008, z], [-1, 0, 0], 0.005);
  }
  // a BARK log — ridged plates (deep longitudinal grooves
  // between raised bark strips, broken by a few rings), knots, a snapped twig, and an OPEN bore at the front (a wide
  // dark hole in a pale cut-wood ring with growth rings)
  const log = new THREE.CylinderGeometry(LR, LR, S1 - S0, 64, 24, true);
  const lp = log.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < lp.count; i++) {
    const a = Math.atan2(lp.getZ(i), lp.getX(i)), y = lp.getY(i);
    const strip = Math.pow(Math.abs(Math.sin(a * 7 + Math.sin(y * 9) * 0.35)), 0.35);          // raised bark strips
    const ring = 1 - 0.5 * Math.exp(-Math.pow((y - 0.06) / 0.006, 2)) - 0.4 * Math.exp(-Math.pow((y + 0.1) / 0.005, 2));
    const rr = 1 - 0.07 + 0.07 * strip * ring + 0.012 * Math.sin(a * 23 + y * 40);
    lp.setX(i, lp.getX(i) * rr); lp.setZ(i, lp.getZ(i) * rr);
  }
  log.computeVertexNormals();
  b.addGradient(log, "#4a2c18", "#8a5a34", "z", "matte", tf([0, SY, (S0 + S1) / 2], [Math.PI / 2, 0, 0]));
  // knots + a snapped twig on top
  for (const [a, z] of [[1.2, -0.25], [2.6, -0.1], [0.4, 0.02]] as Array<[number, number]>) b.add(new THREE.SphereGeometry(0.014, 12, 8).scale(1, 0.55, 1.3), "#3a2112", "matte", tf([Math.cos(a) * LR * 0.97, SY + Math.sin(a) * LR * 0.97, z]));
  tube(b, [-0.012, SY + LR * 1.02, -0.3], [-0.3, 1, 0.4], 0.006, 0.035, "#5a3a20", "matte", 0.002, 8);
  // front: a pale cut-wood ring (growth rings painted as thin darker rings) round an OPEN dark bore
  b.add(ringGeo(LR * 1.0, LR * 0.66, 0.012, 0.004, 48), "#d8b27a", "matte", tf([0, SY, S0 - 0.004], [Math.PI / 2, 0, 0]));
  for (const k of [0.74, 0.84, 0.93]) b.add(ringGeo(LR * k + 0.0012, LR * k - 0.0012, 0.0122, 0, 48), "#a8804e", "matte", tf([0, SY, S0 - 0.0041], [Math.PI / 2, 0, 0]));
  { const bw = new THREE.CylinderGeometry(LR * 0.66, LR * 0.66, 0.1, 40, 1, true); bw.scale(-1, 1, 1); b.add(bw, "#2a170a", "matte", tf([0, SY, S0 + 0.045], [Math.PI / 2, 0, 0])); }
  b.add(filletCyl(LR * 0.66, 0.004, 0, 36), "#0e0804", "matte", tf([0, SY, S0 + 0.09], [Math.PI / 2, 0, 0]));
  b.add(ringGeo(LR * 1.0, LR * 0.5, 0.014, 0.004, 48), "#d8b27a", "matte", tf([0, SY, S1 + 0.004], [Math.PI / 2, 0, 0]));
  b.add(filletCyl(LR * 0.5, 0.01, 0.002, 28), "#160d06", "matte", tf([0, SY, S1 + 0.006], [Math.PI / 2, 0, 0]));
  ropeWrap(b, [0, SY, -0.22], [0, 0, 1], LR * 1.0, 3, 0.008, C.limeDark, 1.15);
  ropeWrap(b, [0, SY, -0.04], [0, 0, 1], LR * 1.0, 3, 0.008, C.lime, 1.15, 2.0);
  tube(b, [0.01, SY + LR * 1.05, -0.26], [0.3, 1, -0.5], 0.004, 0.05, C.limeDark, "matte", 0.001, 8);
  tube(b, [-0.02, SY + LR * 1.02, -0.02], [-0.4, 1, 0.3], 0.0035, 0.04, C.lime, "matte", 0.001, 8);
  block(b, [0, SY + LR * 0.98, -0.13], [0.03, 0.02, 0.03], C.brown, "matte", [0, 0, 0], 0.005);
  // ---- rope lashing where the body meets the grip (target art) + sling ring + trigger / guard
  ropeWrap(b, [0, Y + 0.002, 0.13], [0, 0, 1], BR * 0.92, 2, 0.006, C.rope, 1.1);
  ringLoop(b, [0, Y - 0.05, -0.2], 0.014, 0.004, [0, Math.PI / 2, 0]);
  triggerGuard(b, [0, Y - 0.046, 0.03], 0.085, 0.042, 0.008, 0.02);
  // ---- stock: the target art's CURVED yellow stock —
  // the wrist sweeps down and back like a banana's neck — into a cream butt WRAPPED in peel strips (one smooth body with
  // slanted raised bandage strips crossing it, not stacked slices), ending in an angled lime butt plate
  {
    const wrist: Array<[number, number]> = [[-0.16, Y + 0.046], [-0.22, Y + 0.04], [-0.28, Y + 0.022], [-0.32, Y + 0.004], [-0.322, Y - 0.1], [-0.27, Y - 0.082], [-0.215, Y - 0.05], [-0.17, Y - 0.03]];
    b.addGradient(side(wrist, 0.098, 0.03), C.bananaDeep, C.banana, "y", "gloss");
    // peel ridges continue along the wrist's flanks (one banana from the fore-end to the butt)
    for (const x of [-1, 1]) tube(b, [x * 0.047, Y + 0.0, 0.25], [0, -0.42, 1], 0.0035, 0.13, C.bananaDeep, "gloss", 0.0015, 8);
    const butt: Array<[number, number]> = [[-0.3, Y + 0.012], [-0.37, Y - 0.004], [-0.425, Y - 0.022], [-0.448, Y - 0.05], [-0.452, Y - 0.17], [-0.432, Y - 0.192], [-0.36, Y - 0.17], [-0.305, Y - 0.112]];
    b.addGradient(side(butt, 0.106, 0.034), C.creamDeep, C.flesh, "y", "gloss");
    // bandage strips: slanted raised bands wrapping the butt section (rounded-rectangle loops round the cross-section)
    const strip = (z: number, yT: number, yB: number, tilt: number, col: string) => {
      const pts: THREE.Vector3[] = [], hx = 0.056, hy = (yT - yB) / 2, cy = (yT + yB) / 2, n = 0.32;
      for (let i = 0; i < 48; i++) {
        const t = (i / 48) * Math.PI * 2, st = Math.sin(t), ct = Math.cos(t);
        const x = Math.sign(st) * Math.pow(Math.abs(st), n) * hx, y = cy + Math.sign(ct) * Math.pow(Math.abs(ct), n) * hy;
        pts.push(new THREE.Vector3(x, y, z + (y - cy) * tilt));
      }
      b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.0075, 8, true), col, "gloss");
    };
    strip(0.335, Y + 0.008, Y - 0.13, -0.42, C.cream);
    strip(0.372, Y - 0.002, Y - 0.152, -0.42, C.creamDeep);
    strip(0.41, Y - 0.014, Y - 0.172, -0.42, C.cream);
    // dark crease shadows between the strips
    for (const zc of [0.353, 0.391]) b.add(rbox(0.108, 0.13, 0.004, 0.002, 1), "#b39364", "matte", tf([0, Y - 0.075, zc], [-0.4, 0, 0]));
    // angled lime butt plate + its dark rubber face
    b.add(rbox(0.118, 0.205, 0.024, 0.011, 2), C.lime, "gloss", tf([0, Y - 0.092, 0.458], [0.1, 0, 0]));
    b.add(rbox(0.1, 0.18, 0.008, 0.003, 1), C.limeDark, "matte", tf([0, Y - 0.092, 0.472], [0.1, 0, 0]));
  }
  const built = b.build({ name: "sniper" });
  return { ...built, id: "sniper", muzzle: new THREE.Vector3(0, BY, BZ0 - 0.03), length: 1.1, gripAnchor: new THREE.Vector3(0, Y - 0.07, 0.125), foreAnchor: new THREE.Vector3(0, Y - 0.05, -0.2), sightY: SY, fwd: FWD };
}
