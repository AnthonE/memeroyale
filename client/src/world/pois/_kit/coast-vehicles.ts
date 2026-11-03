// poi-coast vehicles, all procedural and written into a Batch at a matrix (frame space). Local axes: +X = forward
// (nose), +Y up, +Z = vehicle left. Chunky toy proportions, bevelled everywhere, glossy paint (clearcoat).
import * as THREE from "three";
import { Batch, M, box, rbox, cyl, sph, lathe, type MatKey } from "./coast-kit";
import { bananaHeap, crate, jerryCan, strut } from "./coast-props";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
/** a Batch view that adds road grime (mud toward the wheels) to
 *  everything drawn through it — base y = the vehicle matrix's origin height (frame space) */
export function grimy(b: Batch, m: THREE.Matrix4, h = 1.1, k = 0.6): Batch {
  const y0 = m.elements[13];
  return { add: (g: THREE.BufferGeometry, key: Parameters<Batch["add"]>[1], o: Parameters<Batch["add"]>[2] = {}) => b.add(g, key, { ...o, mud: o?.mud ?? { y0, h, k } }) } as unknown as Batch;
}

/** reverse triangle winding (indexed or not) — after a mirroring scale */
export function flipWinding(g: THREE.BufferGeometry) {
  if (g.index) { const idx = g.index; for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); } idx.needsUpdate = true; return; }
  for (const name of Object.keys(g.attributes)) {
    const at = g.attributes[name] as THREE.BufferAttribute, n = at.itemSize, arr = at.array as Float32Array;
    for (let t = 0; t < at.count; t += 3) for (let k = 0; k < n; k++) { const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k, v = arr[i1]; arr[i1] = arr[i2]; arr[i2] = v; }
    at.needsUpdate = true;
  }
}

/** tyre: rounded-profile ring around the local Z axis (axle), radius r, width w; optional block lugs */
export function wheel(b: Batch, m: THREE.Matrix4, r: number, w: number, o: { rim?: THREE.ColorRepresentation; lugs?: number; lugH?: number; rimMat?: MatKey; hub?: boolean } = {}) {
  const ri = r * 0.62, e = Math.min(w * 0.3, (r - ri) * 0.4);
  const prof: Array<[number, number]> = [];
  // profile in (radius, axial) → built around Y then rotated to Z
  const N = 5;
  prof.push([ri, -w / 2]);
  for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + (i / N) * Math.PI / 2; prof.push([r - e + Math.cos(a) * e, -w / 2 + e + Math.sin(a) * e]); }
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI / 2; prof.push([r - e + Math.cos(a) * e, w / 2 - e + Math.sin(a) * e]); }
  prof.push([ri, w / 2]);
  const g = lathe(prof, { segs: 28, tile: 1 });
  g.rotateX(Math.PI / 2);
  b.add(g, "rubber", { m, uv: "keep", color: 0x2a2826 });
  if (o.lugs) {
    const lh = o.lugH ?? 0.06;
    for (let i = 0; i < o.lugs; i++) {
      const a = (i / o.lugs) * Math.PI * 2;
      for (const s of [-1, 1]) {
        const lug = box(0.1, lh * 2, w * 0.46);
        b.add(lug, "rubber", { m: mul(m, mul(M(0, 0, 0, 0, 0, a), M(0, r - lh * 0.2, s * w * 0.24, s * 0.5, 0, 0))), color: 0x2a2826 });
      }
    }
  }
  // rim disc + hub
  const rim = cyl(ri, ri, w * 0.8, 20); rim.rotateX(Math.PI / 2);
  b.add(rim, o.rimMat ?? "gloss", { m, uv: "local", tile: 1, color: o.rim ?? 0xd8d8d8 });
  if (o.hub !== false) for (const s of [-1, 1]) {
    const hub = cyl(ri * 0.35, ri * 0.45, 0.08, 10); hub.rotateX(Math.PI / 2);
    b.add(hub, "steel", { m: mul(m, M(0, 0, s * w * 0.42)), color: 0x9a9a9a });
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; b.add(cyl(0.02, 0.02, 0.04, 6).rotateX(Math.PI / 2), "steel", { m: mul(m, M(Math.cos(a) * ri * 0.25, Math.sin(a) * ri * 0.25, s * (w * 0.42 + 0.04))), color: 0x555555 }); }
  }
}

// ------------------------------------------------------------------------------------------------ red pickup
export function pickup(b0: Batch, m: THREE.Matrix4, paint: THREE.ColorRepresentation = 0xb8281e) {
  const b = grimy(b0, m, 1.0, 0.55);
  const P = paint, dark = 0x2a2a2c;
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => mul(m, M(x, y, z, rx, ry, rz));
  // chassis + bumpers
  b.add(rbox(4.4, 0.25, 1.5, 0.05), "pmetal", { m: at(0, 0.55, 0), color: dark });
  b.add(rbox(0.28, 0.3, 2.0, 0.08), "chrome", { m: at(2.32, 0.72, 0), color: 0xd0d0d0 });
  b.add(rbox(0.22, 0.26, 2.0, 0.06), "pmetal", { m: at(-2.3, 0.7, 0), color: 0x3a3a3a });
  // hood + front fenders
  b.add(rbox(1.5, 0.62, 1.95, 0.18), "gloss", { m: at(1.55, 1.02, 0), color: P });
  b.add(rbox(0.12, 0.42, 1.5, 0.04), "pmetal", { m: at(2.3, 1.0, 0), color: 0x1d1d1e }); // grille
  for (let i = 0; i < 5; i++) b.add(box(0.03, 0.34, 1.35), "chrome", { m: at(2.37, 1.0, -0.6 + i * 0.3), color: 0xcfcfcf });
  for (const s of [-1, 1]) {
    b.add(cyl(0.16, 0.16, 0.08, 16).rotateZ(Math.PI / 2), "chrome", { m: at(2.33, 1.08, s * 0.72), uv: "local", color: 0xe8e8e8 });
    b.add(cyl(0.12, 0.12, 0.02, 16).rotateZ(Math.PI / 2), "lamp", { m: at(2.38, 1.08, s * 0.72) });
    b.add(rbox(0.08, 0.16, 0.2, 0.03), "lampRed", { m: at(-2.36, 1.02, s * 0.82) });
  }
  // cab: lower body to the belt line, slim A/B/C pillars + roof, CLEAR glass (not black blocks) and a readable
  // interior — bench seat, dash with gauges, steering wheel, rear-view mirror
  b.add(rbox(1.5, 0.66, 1.9, 0.14), "gloss", { m: at(0.25, 1.08, 0), color: P });
  b.add(rbox(1.36, 0.12, 1.82, 0.06), "gloss", { m: at(0.2, 2.0, 0), color: P });
  for (const s of [-1, 1]) {
    b.add(rbox(0.09, 0.66, 0.09, 0.03), "gloss", { m: at(0.84, 1.67, s * 0.88, 0, 0, -0.35), color: P });   // A pillar
    b.add(rbox(0.12, 0.6, 0.09, 0.03), "gloss", { m: at(-0.42, 1.67, s * 0.88), color: P });                // B/C pillar
    b.add(rbox(1.3, 0.05, 0.08, 0.02), "gloss", { m: at(0.22, 1.39, s * 0.93), color: new THREE.Color(P).multiplyScalar(0.8) }); // belt trim
    b.add(rbox(0.16, 0.04, 0.03, 0.01), "chrome", { m: at(0.35, 1.25, s * 0.96), color: 0xd8d8d8 });          // door handle
  }
  b.add(box(0.03, 0.62, 1.62), "glass", { m: at(0.96, 1.66, 0, 0, 0, -0.35), shadow: false });
  for (const s of [-1, 1]) b.add(box(1.14, 0.56, 0.03), "glass", { m: at(0.2, 1.67, s * 0.9), shadow: false });
  b.add(box(0.03, 0.5, 1.56), "glass", { m: at(-0.44, 1.66, 0), shadow: false });
  // interior
  b.add(box(1.3, 0.05, 1.72), "rubber", { m: at(0.2, 1.4, 0), color: 0x2a2624 });
  b.add(rbox(0.5, 0.18, 1.6, 0.06), "fabric", { m: at(-0.12, 1.52, 0), color: 0x6a4a34 });            // seat cushion
  b.add(rbox(0.16, 0.55, 1.6, 0.06), "fabric", { m: at(-0.34, 1.8, 0, 0, 0, 0.12), color: 0x6a4a34 });  // backrest
  b.add(rbox(0.36, 0.2, 1.72, 0.05), "pmetal", { m: at(0.78, 1.52, 0), color: 0x2e2c2a });            // dash
  for (const z of [0.3, 0.5]) b.add(cyl(0.05, 0.05, 0.02, 12).rotateZ(Math.PI / 2), "chrome", { m: at(0.6, 1.6, z), uv: "local", color: 0xe8e0d0 });
  const sw = new THREE.TorusGeometry(0.17, 0.022, 6, 20); sw.rotateY(Math.PI / 2);
  b.add(sw, "rubber", { m: at(0.52, 1.66, 0.4, 0, 0, 0.55), uv: "local", color: 0x1c1c1c });
  b.add(cyl(0.02, 0.02, 0.3, 6), "steel", { m: at(0.64, 1.6, 0.4, 0, 0, 1.0), color: 0x333333 });
  b.add(rbox(0.04, 0.06, 0.2, 0.01), "pmetal", { m: at(0.7, 1.95, 0), color: 0x1c1c1c });
  // mirrors
  for (const s of [-1, 1]) b.add(rbox(0.1, 0.18, 0.12, 0.03), "pmetal", { m: at(0.9, 1.55, s * 1.08), color: dark });
  // bed
  b.add(rbox(1.95, 0.1, 1.9, 0.03), "pmetal", { m: at(-1.45, 0.75, 0), color: 0x3b3b3d });
  for (const s of [-1, 1]) b.add(rbox(1.95, 0.55, 0.1, 0.04), "gloss", { m: at(-1.45, 1.05, s * 0.9), color: P });
  b.add(rbox(0.1, 0.55, 1.9, 0.04), "gloss", { m: at(-2.38, 1.05, 0), color: P });
  // wheel arches + wheels
  for (const x of [1.5, -1.45]) for (const s of [-1, 1]) {
    const arch = new THREE.TorusGeometry(0.52, 0.09, 6, 14, Math.PI);
    b.add(arch, "gloss", { m: at(x, 0.72, s * 0.98), uv: "local", color: new THREE.Color(P).multiplyScalar(0.85) });
    wheel(b, at(x, 0.44, s * 0.82), 0.44, 0.32, { rim: 0xf2f2f2, lugs: 16, lugH: 0.035 });
  }
  // roll bar + cargo
  for (const s of [-1, 1]) b.add(cyl(0.04, 0.04, 0.8, 8), "steel", { m: at(-0.62, 1.55, s * 0.82), uv: "local", color: 0x2a2a2a });
  b.add(cyl(0.04, 0.04, 1.64, 8).rotateX(Math.PI / 2), "steel", { m: at(-0.62, 1.95, 0), uv: "local", color: 0x2a2a2a });
  crate(b, at(-1.6, 0.8, 0.25, 0, 0.2, 0), { lid: true });
  jerryCan(b, at(-2.05, 0.8, -0.55, 0, 1.4, 0));
}

// ------------------------------------------------------------------------------------------------ BANANA CO. plane
/** low-wing single-prop taildragger (crop-duster proportions), ~8.6 m long, 11 m span. Nose at +X. */
export function bananaPlane(b: Batch, m: THREE.Matrix4, o: { livery?: THREE.ColorRepresentation; propA?: number } = {}) {
  const Y = o.livery ?? 0xf8d42c, D = 0x2e2618, G = 0x6d6f73;
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1) => mul(m, M(x, y, z, rx, ry, rz, s));
  // attitude: taildragger sits nose-up ~10°
  const body = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => mul(at(0, 1.25, 0, 0, 0, 0.17), M(x, y, z, rx, ry, rz));
  // fuselage lathe along X: profile [radius, x]
  const prof: Array<[number, number]> = [[0.02, -4.6], [0.2, -4.5], [0.32, -3.6], [0.48, -2.4], [0.62, -1.0], [0.7, 0.2], [0.72, 1.2], [0.72, 2.2], [0.68, 2.9], [0.66, 3.2]];
  const fg = lathe(prof, { segs: 24, tile: 2 });
  fg.rotateZ(-Math.PI / 2); // Y axis → X axis
  // squash vertically a touch → more toy-like oval section
  fg.scale(1, 1.05, 0.92);
  b.add(fg, "gloss", { m: body(0, 0, 0), uv: "keep", color: Y });
  // dark livery stripe along the side
  for (const s of [-1, 1]) b.add(rbox(6.2, 0.16, 0.05, 0.03), "gloss", { m: body(-0.6, 0.05, s * 0.64, 0, s * 0.04, 0), color: D });
  // cowling ring + radial engine face + spinner + prop
  const cowl = cyl(0.7, 0.66, 0.5, 24); cowl.rotateZ(Math.PI / 2);
  b.add(cowl, "gloss", { m: body(3.35, 0, 0), uv: "local", color: D });
  const face = cyl(0.6, 0.6, 0.05, 24); face.rotateZ(Math.PI / 2);
  b.add(face, "pmetal", { m: body(3.61, 0, 0), color: 0x2a2a2a });
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; b.add(rbox(0.1, 0.18, 0.22, 0.03), "steel", { m: body(3.62, Math.cos(a) * 0.4, Math.sin(a) * 0.4, a, 0, 0), color: 0x8a8a8a }); }
  const spin = new THREE.ConeGeometry(0.26, 0.6, 20); spin.rotateZ(-Math.PI / 2);
  b.add(spin, "chrome", { m: body(3.95, 0, 0), uv: "local", color: 0xbfc2c6 });
  const pa = o.propA ?? 0.4;
  for (let k = 0; k < 3; k++) {
    const a = pa + (k / 3) * Math.PI * 2;
    const blade = rbox(0.06, 1.45, 0.22, 0.03);
    blade.translate(0, 0.78, 0);
    b.add(blade, "pmetal", { m: body(3.8, 0, 0, a, 0, 0).multiply(M(0, 0, 0, 0, 0.25, 0)), color: G });
    const tip = rbox(0.065, 0.16, 0.23, 0.03); tip.translate(0, 1.45, 0);
    b.add(tip, "gloss", { m: body(3.8, 0, 0, a, 0, 0).multiply(M(0, 0, 0, 0, 0.25, 0)), color: Y });
  }
  // exhaust stubs
  for (const s of [-1, 1]) b.add(cyl(0.05, 0.05, 0.3, 8).rotateZ(Math.PI / 2 + 0.3), "steel", { m: body(2.9, -0.35, s * 0.62), uv: "local", color: 0x4a4038 });
  // canopy
  const can = new THREE.SphereGeometry(0.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  can.scale(1.9, 0.75, 0.95);
  b.add(can, "glass", { m: body(0.9, 0.55, 0), uv: "keep", shadow: false });
  // cockpit: seat, headrest, stick, instrument coaming (read through the clear canopy)
  b.add(rbox(0.5, 0.12, 0.55, 0.04), "fabric", { m: body(0.7, 0.62, 0), color: 0x6a4a34 });
  b.add(rbox(0.12, 0.55, 0.5, 0.04), "fabric", { m: body(0.42, 0.9, 0, 0, 0, 0.2), color: 0x6a4a34 });
  b.add(rbox(0.3, 0.14, 0.9, 0.05), "pmetal", { m: body(1.65, 0.78, 0), color: 0x2a2826 });
  b.add(cyl(0.02, 0.02, 0.45, 6), "steel", { m: body(1.15, 0.8, 0, 0, 0, -0.3), color: 0x222222 });
  for (const x of [0.2, 0.9, 1.6]) { const ring = new THREE.TorusGeometry(0.55, 0.03, 5, 16, Math.PI); ring.scale(1, 0.8, 1); b.add(ring, "gloss", { m: body(x, 0.58, 0, 0, Math.PI / 2, 0), uv: "local", color: Y }); }
  // wings (airfoil extrusion), low mounted, dihedral
  const af = new THREE.Shape();
  af.moveTo(0.95, 0); af.bezierCurveTo(0.95, 0.1, 0.5, 0.2, 0, 0.19); af.bezierCurveTo(-0.5, 0.16, -0.9, 0.05, -0.95, 0);
  af.bezierCurveTo(-0.9, -0.03, -0.3, -0.06, 0, -0.06); af.bezierCurveTo(0.5, -0.06, 0.95, -0.04, 0.95, 0);
  for (const s of [-1, 1]) {
    const w = new THREE.ExtrudeGeometry(af, { depth: 5.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
    // taper the tip
    const p = w.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getZ(i) / 5.3, k = 1 - 0.32 * t; p.setX(i, p.getX(i) * k - 0.12 * t); p.setY(i, p.getY(i) * k); }
    w.computeVertexNormals();
    if (s < 0) { w.scale(1, 1, -1); flipWinding(w); w.computeVertexNormals(); }
    b.add(w, "gloss", { m: body(1.1, -0.42, s * 0.45, s * -0.07, 0, 0), uv: "local", tile: 3, color: Y });
    // wing-tip stripe + nav light
    b.add(rbox(1.2, 0.14, 0.4, 0.05), "gloss", { m: body(0.95, -0.42 + 5.1 * 0.07, s * 5.45, s * -0.07, 0, 0), color: D });
    b.add(sph(0.06, 8, 6), s > 0 ? "lampRed" : "lamp", { m: body(1.0, -0.4 + 5.2 * 0.07, s * 5.72) });
  }
  // tail: stabiliser + fin + rudder stripe
  const stab = rbox(0.95, 0.08, 3.6, 0.04);
  b.add(stab, "gloss", { m: body(-4.1, 0.12, 0), color: Y });
  const fin = new THREE.Shape(); fin.moveTo(-0.55, 0); fin.lineTo(0.75, 0); fin.quadraticCurveTo(0.1, 0.4, -0.2, 1.45); fin.lineTo(-0.62, 1.45); fin.lineTo(-0.55, 0);
  const fg2 = new THREE.ExtrudeGeometry(fin, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  fg2.translate(0, 0, -0.05);
  b.add(fg2, "gloss", { m: body(-4.0, 0.15, 0), uv: "local", tile: 2, color: Y });
  b.add(rbox(0.36, 1.2, 0.14, 0.04), "gloss", { m: body(-4.55, 0.85, 0), color: D });
  // main gear: legs + spats + wheels; tail wheel
  for (const s of [-1, 1]) {
    strut(b, [1.3, -0.45, s * 0.9], [1.45, -1.05, s * 1.35], 0.06, 0x2a2a2a, body(0, 0, 0), "steel");
    const spat = sph(0.3, 14, 10); spat.scale(1.6, 1.05, 0.62);
    b.add(spat, "gloss", { m: body(1.45, -1.05, s * 1.42), uv: "local", color: Y });
    wheel(b, body(1.45, -1.13, s * 1.42), 0.3, 0.16, { rim: 0x777777, hub: false });
  }
  wheel(b, body(-4.3, -0.34, 0), 0.12, 0.08, { rim: 0x555555, hub: false });
  // side decal: BANANA CO. text plate (canvas) handled by the caller if wanted
}



// ------------------------------------------------------------------------------------------------ tractor + trailer
export function tractor(b0: Batch, m: THREE.Matrix4, paint: THREE.ColorRepresentation = 0xd6b82e) {
  const b = grimy(b0, m, 1.4, 0.7);
  const Y = paint, K = 0x2a2a2a;
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => mul(m, M(x, y, z, rx, ry, rz));
  // rear wheels (big, lugged, yellow rims), front wheels
  for (const s of [-1, 1]) {
    wheel(b, at(-0.7, 0.82, s * 0.95), 0.82, 0.5, { rim: Y, lugs: 18, lugH: 0.12 });
    wheel(b, at(1.55, 0.5, s * 0.78), 0.5, 0.3, { rim: Y, lugs: 16, lugH: 0.05 });
    // rear fender (quarter shell)
    const f = new THREE.CylinderGeometry(0.95, 0.95, 0.56, 16, 1, true, -Math.PI * 0.05, Math.PI * 0.62);
    f.rotateX(Math.PI / 2);
    b.add(f, "gloss", { m: at(-0.7, 0.82, s * 0.95, 0, 0, Math.PI * 0.2), uv: "local", tile: 1, color: Y });
  }
  // chassis, engine hood, grille, exhaust
  b.add(rbox(3.0, 0.35, 0.8, 0.06), "pmetal", { m: at(0.35, 0.72, 0), color: K });
  b.add(rbox(1.75, 0.82, 0.95, 0.16), "gloss", { m: at(1.2, 1.25, 0), color: Y });
  b.add(rbox(0.1, 0.62, 0.72, 0.04), "pmetal", { m: at(2.1, 1.22, 0), color: 0x1a1a1a });
  for (let i = 0; i < 6; i++) b.add(box(0.03, 0.05, 0.66), "chrome", { m: at(2.15, 0.98 + i * 0.09, 0), color: 0xbdbdbd });
  for (const s of [-1, 1]) {
    b.add(cyl(0.09, 0.09, 0.06, 12).rotateZ(Math.PI / 2), "lamp", { m: at(2.1, 1.5, s * 0.34) });
    for (let i = 0; i < 4; i++) b.add(box(0.5, 0.03, 0.02), "pmetal", { m: at(1.1 + i * 0.2, 1.3, s * 0.48), color: 0x2a2a2a }); // side vents
  }
  b.add(cyl(0.07, 0.07, 1.3, 10), "pmetal", { m: at(1.7, 2.1, -0.28), uv: "local", color: K });
  b.add(cyl(0.09, 0.07, 0.12, 10), "pmetal", { m: at(1.7, 2.78, -0.28, 0.3, 0, 0), uv: "local", color: K });
  // cab: floor, seat, steering, ROPS frame + roof, rear window frame
  b.add(rbox(1.4, 0.12, 1.5, 0.04), "pmetal", { m: at(-0.55, 1.45, 0), color: 0x3a3a3a });
  b.add(rbox(0.55, 0.12, 0.6, 0.05), "fabric", { m: at(-0.75, 1.72, 0), color: 0x2d2b28 });
  b.add(rbox(0.12, 0.6, 0.6, 0.05), "fabric", { m: at(-1.05, 2.0, 0, 0, 0, 0.15), color: 0x2d2b28 });
  b.add(new THREE.TorusGeometry(0.2, 0.025, 5, 16), "pmetal", { m: at(0.05, 2.1, 0, 0, Math.PI / 2, 0.9), uv: "local", color: K });
  b.add(cyl(0.025, 0.025, 0.55, 6), "steel", { m: at(0.18, 1.85, 0, 0, 0, 0.9), color: K });
  for (const x of [0.3, -1.25]) for (const s of [-1, 1]) b.add(rbox(0.08, 1.65, 0.08, 0.02), "gloss", { m: at(x, 2.25, s * 0.72), color: Y });
  b.add(rbox(1.85, 0.12, 1.75, 0.06), "gloss", { m: at(-0.48, 3.08, 0), color: Y });
  b.add(rbox(1.7, 0.06, 1.6, 0.03), "pmetal", { m: at(-0.48, 3.0, 0), color: 0x2a2a2a });
  // cab glazing: clear glass (not opaque grey slabs) + a thin frame
  b.add(box(0.03, 1.1, 1.36), "glass", { m: at(0.3, 2.35, 0), shadow: false });
  b.add(box(0.03, 0.9, 1.36), "glass", { m: at(-1.25, 2.45, 0), shadow: false });
  for (const [x, y, hh] of [[0.3, 2.35, 1.1], [-1.25, 2.45, 0.9]] as Array<[number, number, number]>) for (const s of [-1, 1]) b.add(box(0.05, hh, 0.05), "pmetal", { m: at(x, y, s * 0.68), color: K });
  b.add(rbox(0.2, 0.12, 0.3, 0.03), "lamp", { m: at(0.3, 2.95, 0.6) });
  // hitch
  b.add(rbox(0.5, 0.12, 0.2, 0.03), "steel", { m: at(-1.75, 0.65, 0), color: 0x333333 });
  // detail: front weight block + bumper bar, front axle beam, a step + grab
  // handles, fuel tank, a toolbox, the exhaust's heat guard, mud flaps behind the rear wheels, a work lamp on the roof
  b.add(rbox(0.36, 0.5, 0.9, 0.05), "pmetal", { m: at(2.3, 0.8, 0), color: 0x2e2e2e });
  for (let i = 0; i < 4; i++) b.add(rbox(0.1, 0.44, 0.2, 0.02), "pmetal", { m: at(2.5, 0.8, -0.33 + i * 0.22), color: 0x3a3a3a });
  b.add(cyl(0.05, 0.05, 1.6, 8).rotateX(Math.PI / 2), "steel", { m: at(1.55, 0.5, 0), uv: "local", color: 0x333333 });
  for (const s of [-1, 1]) {
    b.add(rbox(0.36, 0.05, 0.22, 0.02), "steel", { m: at(-0.05, 0.95, s * 0.62), color: 0x444444 });
    b.add(cyl(0.02, 0.02, 0.8, 6), "chrome", { m: at(0.33, 2.1, s * 0.78), color: 0xd0d0d0 });
    b.add(rbox(0.05, 0.4, 0.5, 0.02), "rubber", { m: at(-1.45, 0.45, s * 0.95), color: 0x1e1e1e });
  }
  b.add(cyl(0.22, 0.22, 0.6, 14).rotateX(Math.PI / 2), "gloss", { m: at(0.2, 1.2, 0.5), uv: "local", color: Y });
  b.add(cyl(0.04, 0.04, 0.05, 8), "chrome", { m: at(0.2, 1.45, 0.62), color: 0xcfcfcf });
  b.add(rbox(0.45, 0.3, 0.3, 0.03), "gloss", { m: at(-0.4, 1.28, -0.62), color: 0xc0392b });
  b.add(cyl(0.1, 0.1, 0.4, 10, true), "pmetal", { m: at(1.7, 1.95, -0.28), uv: "local", color: 0x555555 });
  b.add(rbox(0.22, 0.16, 0.18, 0.03), "pmetal", { m: at(-1.1, 3.22, 0.5), color: 0x2a2a2a });
  b.add(box(0.02, 0.12, 0.14), "lamp", { m: at(-0.98, 3.22, 0.5) });
}

/** wooden farm trailer heaped with green banana hands; drawbar toward +X */
export function trailer(b0: Batch, m: THREE.Matrix4, seed = 7) {
  const b = grimy(b0, m, 1.0, 0.6);
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => mul(m, M(x, y, z, rx, ry, rz));
  b.add(rbox(3.2, 0.14, 1.8, 0.03), "pmetal", { m: at(0, 0.72, 0), color: 0x333333 });
  b.add(box(3.1, 0.08, 1.7), "deck", { m: at(0, 0.83, 0), tile: 1.5, color: 0xd6c09a });
  for (const s of [-1, 1]) {
    b.add(box(3.2, 0.6, 0.08), "deck", { m: at(0, 1.17, s * 0.88), tile: 1.5, uvRot: true, color: 0xd6c09a });
    for (const x of [-1.5, -0.5, 0.5, 1.5]) b.add(rbox(0.1, 0.72, 0.12, 0.02), "wood", { m: at(x, 1.15, s * 0.92), color: 0x8a6a4a });
  }
  for (const x of [-1.6, 1.6]) b.add(box(0.08, 0.6, 1.8), "deck", { m: at(x, 1.17, 0), tile: 1.5, uvRot: true, color: 0xd6c09a });
  for (const s of [-1, 1]) wheel(b, at(0, 0.45, s * 0.98), 0.45, 0.28, { rim: 0xd9c52b, lugs: 14, lugH: 0.04 });
  b.add(rbox(1.2, 0.1, 0.1, 0.03), "steel", { m: at(2.1, 0.66, 0), color: 0x333333 });
  // heaped well above the sides (a heap below the side boards reads as an empty trailer)
  bananaHeap(b, at(0, 1.12, 0), 2.9, 1.55, 30, seed, 0.3);
  bananaHeap(b, at(0, 1.42, 0), 2.4, 1.2, 22, seed + 1, 0.42);
}
