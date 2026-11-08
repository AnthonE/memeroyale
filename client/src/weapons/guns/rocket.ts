// Banana-bunch rocket launcher — target art gear-03-weapons (bottom-right). Target-art proportions: length ÷
// diameter ≈ 3.6 including the nose. A fat yellow tube with painted peel-strip panels + the round banana
// emblem and BANANA CO. (painted INTO the tube texture), a brown strap with rivets, an olive band + two green rope
// lashings, a flared brown rear ring; at the front a bunch of SIX distinct bananas (brown stem caps forward, bellies
// in, tips swept back along the tube) around a pointed green coconut warhead with a yellow tip and a yellow collar +
// bracket (the "rocket" pivot, hidden while fired); brown trigger housing, cream ribbed grip + lime cap, brown fore
// handle.
import * as THREE from "three";
import { filletCyl, lathe, ringGeo, tf, bananaGeometry, bananaEnd, alignY } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C, mats, paintBunch } from "../lib/mats";
import { block, fleshGrip, ropeWrap, screw, strap, triggerGuard, FWD } from "./common";
import type { GunSpec } from "./types";

let tubeTex: THREE.CanvasTexture | null = null;
/** wrap-around tube skin: u = angle (0 at +X, the right flank), v = along (0 rear → 1 front). 1024² so a canvas px is
 *  ~0.63 mm both ways (1024×512 would stretch every glyph 1.8× along the tube). STENCIL_V = the stencil's centre. */
const STENCIL_V = 0.43;
function tubeSkin(): THREE.CanvasTexture {
  if (tubeTex) return tubeTex;
  const W = 1024, H = 1024, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  // peel-strip panels: 7 soft vertical bands with darker seams + a lit edge (the target art's bundled-banana tube)
  for (let k = 0; k < 7; k++) {
    const u0 = (k / 7) * W;
    const g = x.createLinearGradient(u0, 0, u0 + W / 7, 0);
    g.addColorStop(0, "rgba(200,150,20,.35)"); g.addColorStop(0.15, "rgba(255,255,255,0)"); g.addColorStop(0.8, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(190,140,10,.25)");
    x.fillStyle = g; x.fillRect(u0, 0, W / 7, H);
    x.fillStyle = "rgba(150,100,10,.55)"; x.fillRect(u0 - 1.5, 0, 3, H);
    x.fillStyle = "rgba(255,250,220,.6)"; x.fillRect(u0 + 2, 0, 2, H);
  }
  // a big round banana emblem ABOVE a BANANA CO. that reads front → rear along the tube, on both flanks, inside the
  // clear zone between the front strap and the olive band (bunch tips end at the strap)
  const col = "rgba(150,95,20,.92)";
  for (const deg of [180, 0]) {
    const cx = W * (1 - deg / 360) % W, cy = H * (1 - STENCIL_V);
    for (const wrap of [0, W, -W]) {
      if (cx + wrap - 200 > W || cx + wrap + 200 < 0) continue;
      x.save(); x.translate(cx + wrap, cy); x.rotate(Math.PI / 2);
      x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 8;
      x.beginPath(); x.arc(-20, -92, 66, 0, Math.PI * 2); x.stroke();
      // line-art bunch (three outlined bananas) like the target art — the filled overlapping crescents read as a heart
      paintBunch(x, -14, -92, 86, col, "#ffffff", 0.07);
      x.font = `900 46px "Arial Black", Impact, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText("THE FEED", 0, 20, 330);
      x.restore();
    }
  }
  tubeTex = new THREE.CanvasTexture(c); tubeTex.colorSpace = THREE.SRGBColorSpace; tubeTex.anisotropy = 8; tubeTex.wrapS = THREE.RepeatWrapping;
  return tubeTex;
}

export function buildRocket(): GunSpec {
  const b = new PartBuilder();
  // a longer tube (L/D ≈ 2.7 without the bunch)
  // the bunch sits IN FRONT of the tube and its tips end at the front strap; behind it a clear stencil zone, then the
  // olive band + green lashings and the flared rear ring (target art bottom-right)
  const R = 0.105, Y = 0.11, Z0 = -0.16, Z1 = 0.44;
  // ---- tube: a textured lathe (u = angle, v = along) with a slight 7-lobe flute; one extra draw for the painted skin
  const prof: Array<[number, number]> = [[R * 0.9, 0], [R, 0.012], [R, Z1 - Z0 - 0.012], [R * 0.9, Z1 - Z0]];
  const tg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 56);
  {
    const p = tg.attributes.position as THREE.BufferAttribute, uv = tg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
      const f = 1 - 0.022 * Math.pow(0.5 - 0.5 * Math.cos(7 * a), 0.6);
      p.setX(i, x * f); p.setZ(i, z * f);
      uv.setXY(i, 1 - (((a / (Math.PI * 2)) + 1) % 1), p.getY(i) / (Z1 - Z0));
    }
    tg.computeVertexNormals();
  }
  // lathe axis +Y → gun −Z (front) … +Y maps to the tube's front
  tg.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).translate(0, Y, Z1);
  const skinMat = new THREE.MeshPhysicalMaterial({ color: C.banana, map: tubeSkin(), roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.25, envMapIntensity: 0.6 });
  skinMat.name = "rocket-skin";
  const tubeM = new THREE.Mesh(tg, skinMat); tubeM.name = "rocket-tube"; tubeM.castShadow = true; tubeM.receiveShadow = true;
  b.object(tubeM);
  // rear: flared brown ring + dark throat; front lip
  b.add(ringGeo(R * 1.14, R * 0.78, 0.06, 0.01, 44), C.brown, "matte", tf([0, Y, Z1 - 0.004], [Math.PI / 2, 0, 0]));
  b.add(ringGeo(R * 1.2, R * 1.08, 0.018, 0.006, 44), C.brownDark, "matte", tf([0, Y, Z1 + 0.018], [Math.PI / 2, 0, 0]));
  b.add(filletCyl(R * 0.8, 0.01, 0.002, 32), "#1a0f08", "matte", tf([0, Y, Z1 - 0.03], [Math.PI / 2, 0, 0]));
  b.add(ringGeo(R * 1.04, R * 0.6, 0.03, 0.008, 44), C.bananaDeep, "gloss", tf([0, Y, Z0 + 0.004], [Math.PI / 2, 0, 0]));
  // bands: brown strap (rivets), olive band, two green rope lashings
  const zStrap = 0.045;
  strap(b, [0, Y, zStrap], [0, 0, 1], R + 0.004, 0.05, 0.011, C.brown, true, false);
  b.add(ringGeo(R + 0.008, R - 0.002, 0.034, 0.004, 44), "#8a8a3a", "matte", tf([0, Y, 0.3], [Math.PI / 2, 0, 0]));
  ropeWrap(b, [0, Y, 0.335], [0, 0, 1], R + 0.002, 3, 0.0085, C.limeDark, 1.05);
  ropeWrap(b, [0, Y, 0.385], [0, 0, 1], R + 0.002, 2, 0.0085, C.lime, 1.05, 1.5);
  // ---- the bunch: EIGHT fat bananas touching round the warhead collar — brown stem caps forward, convex backs out,
  // bellies in, bulging to ~1.4× the tube diameter and sweeping back to end at the strap
  // (target art: a bouquet as wide as the tube + a third)
  const len = 0.25, br = 0.043, bend = 0.75, ring = 0.07, zs = Z0 - 0.06;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const radial = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const base = new THREE.Vector3(0, Y, zs).addScaledVector(radial, ring);
    const xp = new THREE.Vector3(0, 0, 1).addScaledVector(radial, 0.1).normalize();    // stem → tip: back, a little outward
    // banana +Y = its concave side (both ends curl toward +Y): +Y INWARD → the convex back bulges out (the opposite
    // flip bulges the bellies into the tube and buries the bunch)
    const yp = radial.clone().negate().projectOnPlane(xp).normalize();
    const zp = new THREE.Vector3().crossVectors(xp, yp);
    const m = new THREE.Matrix4().makeBasis(xp, yp, zp).setPosition(base);
    const geo = bananaGeometry({ length: len, radius: br, bend, facets: 5, round: 0.45, along: 30, radial: 30, profile: [0.55, 0.82, 0.95, 1, 1, 1, 0.98, 0.93, 0.84, 0.66, 0.4] });
    b.addGradient(geo, C.bananaDeep, C.banana, "y", "gloss", m);
    const e = bananaEnd({ length: len, radius: br, bend }, false);
    const cen = e.center.clone().applyMatrix4(m), dir = e.dir.clone().transformDirection(m);
    b.add(filletCyl(br * 0.42, br * 0.55, br * 0.12, 16), C.brownDark, "matte", alignY(cen.clone().addScaledVector(dir, br * 0.2), dir));
    b.add(filletCyl(br * 0.3, br * 0.1, br * 0.05, 14), C.brownLight, "matte", alignY(cen.clone().addScaledVector(dir, br * 0.48), dir));
  }
  b.add(filletCyl(0.085, 0.1, 0.02, 24), C.bananaDeep, "gloss", tf([0, Y, Z0 - 0.03], [Math.PI / 2, 0, 0])); // core under the bunch
  // ---- warhead (the "rocket" pivot): green coconut cone, dark green base band, yellow tip, yellow collar + bracket
  const rocket = b.sub("rocket", [0, Y, zs - 0.02]);
  const nz = zs - 0.03;
  const cone = lathe([[0.062, 0], [0.068, 0.03], [0.066, 0.08], [0.056, 0.13], [0.04, 0.175], [0.024, 0.2], [0.015, 0.212]], 36);
  rocket.addGradient(cone, C.leafDark, "#86b23c", "y", "gloss", tf([0, Y, nz], [-Math.PI / 2, 0, 0]));
  rocket.add(lathe([[0.019, 0], [0.012, 0.025], [0.0001, 0.05]], 20), C.banana, "gloss", tf([0, Y, nz - 0.21], [-Math.PI / 2, 0, 0]));
  rocket.add(ringGeo(0.072, 0.05, 0.028, 0.006, 40), C.banana, "gloss", tf([0, Y, nz + 0.004], [Math.PI / 2, 0, 0]));
  rocket.add(ringGeo(0.068, 0.05, 0.012, 0.003, 40), "#2f5a18", "matte", tf([0, Y, nz - 0.022], [Math.PI / 2, 0, 0]));
  block(rocket, [0.071, Y, nz + 0.004], [0.014, 0.03, 0.03], C.bananaDeep, "gloss", [0, 0, 0], 0.004);
  screw(rocket, [0.079, Y, nz + 0.004], [1, 0, 0], 0.005);
  // ---- underside: trigger housing, grip, guard, fore handle
  block(b, [0, Y - R - 0.012, 0.06], [0.05, 0.05, 0.13], C.brown, "matte", [0, 0, 0], 0.01);
  screw(b, [0.026, Y - R - 0.01, 0.09], [1, 0, 0], 0.005); screw(b, [-0.026, Y - R - 0.01, 0.09], [-1, 0, 0], 0.005);
  fleshGrip(b, [0, Y - R - 0.03, 0.1], new THREE.Vector3(0, -1, 0.3).normalize(), 0.15, 0.034, { ribs: 5, back: true, cap: true, taper: 0.88, flat: 0.8 });
  triggerGuard(b, [0, Y - R - 0.035, 0.045], 0.08, 0.05, 0.008, 0.02);
  block(b, [0, Y - R - 0.05, -0.08], [0.04, 0.1, 0.04], C.brown, "matte", [0.1, 0, 0], 0.01);
  block(b, [0, Y - R, -0.08], [0.05, 0.03, 0.08], C.brown, "matte", [0, 0, 0], 0.008);
  const built = b.build({ name: "rocket" });
  void mats;
  return { ...built, id: "rocket", muzzle: new THREE.Vector3(0, Y, nz - 0.26), length: 0.88, gripAnchor: new THREE.Vector3(0, Y - R - 0.1, 0.14), foreAnchor: new THREE.Vector3(0, Y - R - 0.08, -0.08), sightY: Y + R + 0.02, fwd: FWD };
}
