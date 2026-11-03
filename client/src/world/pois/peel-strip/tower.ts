// PEEL STRIP control tower + spotter deck visuals (tower-local frame from shared/pois/peel-strip.ts).
// Beige precast-panel concrete shaft with yellow base band + corner trims, banana mural, yellow-framed steel door,
// conduit + junction boxes, balcony (yellow fascia, plank deck, dark rail), yellow cab with outward-leaning glazing,
// thick yellow roof slabs, radar dish + beacon mast; square stairwell inside; timber deck bridged to the balcony.
import * as THREE from "three";
import * as S from "../../../../../shared/pois/peel-strip";
import { Batch, M, box, rbox, cyl, sph, addPieces, frameGeo, rectShape, shapeGeo, decal } from "../_kit/coast-kit";
import * as P from "../_kit/coast-props";
import { openStair, plate } from "./coast-dress";
import { textDecal } from "../_kit/coast-sign";

// palette (never all orange-brown): lemon banana-yellow trims (≈ #f2c21a on screen), a
// cool beige concrete shaft (≈ #cfc6b4), grey-brown deck planks
export const YEL = 0xfbe24a, YEL_D = 0xe0c02a, DARK = 0x3a332d, BEIGE = 0xffffff;
const SHAFT = new THREE.Color(0.9, 0.96, 1.05);
const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);

/** pitched rail (posts + top tube) between two points, frame space */
export function slopeRail(b: Batch, a: [number, number, number], c: [number, number, number], h: number, key: "pmetal" | "wood", color: number, t = 0.05, posts = 4) {
  const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c);
  for (let k = 0; k <= posts; k++) { const p = va.clone().lerp(vc, k / posts); b.add(rbox(t * 1.3, h, t * 1.3, t * 0.3), key, { m: M(p.x, p.y + h / 2, p.z), color, tile: 1 }); }
  for (const hh of [h, h * 0.5]) P.strut(b, [a[0], a[1] + hh, a[2]], [c[0], c[1] + hh, c[2]], t * (hh === h ? 0.75 : 0.45), color, new THREE.Matrix4(), key);
}

export function buildTower(b: Batch, bNear: Batch, glows: THREE.Vector3[]) {
  const T = S.TWR, f = T.frame, { S: H, cab } = T;
  b.setFrame(f.x, f.y, f.z, f.yaw); bNear.setFrame(f.x, f.y, f.z, f.yaw);
  const top = cab - T.slab;
  // ---- shaft (precast panels), slab, stair, landings, cab floor, balcony deck
  addPieces(b, S.TWR_LOCAL, {
    "tw:wall": { mat: "gConcrete", color: SHAFT, tile: 4.8 },
    "tw:slab": { mat: "gConcrete", color: new THREE.Color(0.72, 0.76, 0.8), tile: 6 },
    "tw:step": { mat: "concrete", color: 0xcfcac0, tile: 1.5, round: 0.02 },
    "tw:land": { mat: "concrete", color: 0xcfcac0, tile: 2 },
    "tw:cabfloor": { mat: "concrete", color: 0xa9a49a, tile: 3 },
    "tw:balc": { mat: "plaster", color: YEL, tile: 2, round: 0.04 },
    "tw:rland": { mat: "pmetal", color: 0x5b6570, tile: 1.2, round: 0.02 }, "tw:rstep": { mat: "pmetal", skip: true },
    "tw:cabwall": { mat: "gloss", skip: true }, "tw:glass": { mat: "glass", skip: true }, "tw:roof": { mat: "plaster", skip: true },
    "tw:roof2": { mat: "plaster", skip: true }, "tw:console": { mat: "pmetal", skip: true }, "tw:mast": { mat: "pmetal", skip: true },
    "tw:crates": { mat: "wood", skip: true }, "tw:fill": { mat: "concrete", skip: true }, "tw:hatchrail": { mat: "pmetal", skip: true },
    rail: { mat: "pmetal", skip: true },
  });
  openStair(b, S.TWR_LOCAL, "tw:rstep", { mat: "pmetal", color: 0x6b7580, stringer: 0x3a4046, thick: 0.06 });
  // stair stringers under the upper flights (concrete wedge underside reads as a real stair from below)
  for (const fl of S.TWR_FLIGHTS.slice(1)) {
    const fx = Math.sin(fl.yaw), fz = Math.cos(fl.yaw), L = 2.8, ang = Math.atan2(T.rise, L);
    b.add(box(T.lane, 0.22, Math.hypot(L, T.rise)), "concrete", { m: M(fl.x + fx * L / 2, fl.y0 + T.rise / 2 - 0.3, fl.z + fz * L / 2, -ang, fl.yaw, 0), tile: 2, color: 0xbab5ab });
  }
  // inner guard rails on the flights + around the hatch
  for (const fl of S.TWR_FLIGHTS) {
    const fx = Math.sin(fl.yaw), fz = Math.cos(fl.yaw), L = 2.8, lane = T.lane;
    const ix = fl.x + (Math.abs(fx) < 0.5 ? -Math.sign(fl.x) * (lane / 2 - 0.06) : 0), iz = fl.z + (Math.abs(fz) < 0.5 ? -Math.sign(fl.z) * (lane / 2 - 0.06) : 0);
    slopeRail(b, [ix, fl.y0, iz], [ix + fx * L, fl.y0 + T.rise, iz + fz * L], 0.95, "pmetal", 0x2f2b27, 0.04, 3);
  }
  P.railing(b, -1.4, 1.34, 2.55, 1.34, cab, { h: 1.0, spacing: 1.3, color: 0x2f2b27, thick: 0.045, bars: 1 });
  // interior ceiling light + wall lamps in the stairwell
  for (const [lx, ly, lz] of [[0, 7.9, 0], [0, 3.8, 0]] as Array<[number, number, number]>) {
    b.add(cyl(0.02, 0.02, cab - 0.35 - ly, 4), "steel", { m: M(lx, (ly + cab - 0.35) / 2, lz), color: 0x333333 });
    b.add(cyl(0.18, 0.28, 0.16, 12), "pmetal", { m: M(lx, ly + 0.1, lz), color: 0x2f5a3a });
    b.add(sph(0.11, 10, 8), "lamp", { m: M(lx, ly, lz) });
  }
  // ---- yellow base band + corner trims + panel edge chamfers
  {
    const bh = 1.15, by = 0.2 + bh / 2, t = 0.1, e = H + t / 2 - 0.02, d0 = T.doorX - T.doorW / 2 - 0.16, d1 = T.doorX + T.doorW / 2 + 0.16;
    const band = (w: number, d: number, x: number, z: number) => b.add(rbox(w, bh, d, 0.03), "plaster", { m: M(x, by, z), tile: 2, color: YEL, aoY: 0.2, aoRange: 0.8, aoMin: 0.7 });
    band(d0 + H + t, t, (d0 - H - t) / 2, e); band(H + t - d1, t, (d1 + H + t) / 2, e);
    band(2 * H + 2 * t, t, 0, -e); band(t, 2 * H, -e, 0); band(t, 2 * H, e, 0);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(rbox(0.42, top - 1.35, 0.09, 0.02), "plaster", { m: M(sx * (H - 0.2), 1.35 + (top - 1.35) / 2, sz * (H + 0.03)), tile: 2, color: YEL });
    b.add(rbox(0.09, top - 1.35, 0.42, 0.02), "plaster", { m: M(sx * (H + 0.03), 1.35 + (top - 1.35) / 2, sz * (H - 0.2)), tile: 2, color: YEL });
  }
  // door: yellow frame, a panelled steel leaf (two recessed panels, vision slot, push bar, kick plate) swung inward
  const dx = T.doorX, dz = H;
  b.add(frameGeo(T.doorW, T.doorH, 0.16, 0.5, false), "plaster", { m: M(dx, 0.2, dz), uv: "local", tile: 1, color: YEL });
  // the leaf stands open 90° against the right jamb, drawn at exactly its collider (S.TWR_LEAF)
  const LF = S.TWR_LEAF, leaf = M((LF.x0 + LF.x1) / 2, 0.2, LF.z1, 0, Math.PI / 2, 0), lw = LF.z1 - LF.z0;
  b.add(rbox(lw, T.doorH - 0.04, 0.07, 0.02), "pmetal", { m: mul(leaf, M(lw / 2, T.doorH / 2, 0)), color: 0x8e8272 });
  for (const [py, ph] of [[0.75, 1.0], [1.95, 0.9]] as Array<[number, number]>) b.add(rbox(lw - 0.36, ph, 0.03, 0.015), "pmetal", { m: mul(leaf, M(lw / 2, py, 0.045)), color: 0x7a6f61 });
  b.add(rbox(0.5, 0.16, 0.05, 0.02), "darkGlass", { m: mul(leaf, M(lw / 2, 2.45, 0.04)) });
  b.add(rbox(lw - 0.2, 0.28, 0.02, 0.01), "steel", { m: mul(leaf, M(lw / 2, 0.16, 0.045)), color: 0xa7a8a4 });
  b.add(cyl(0.025, 0.025, lw - 0.35, 8).rotateZ(Math.PI / 2), "steel", { m: mul(leaf, M(lw / 2, 1.05, 0.13)), uv: "local", color: 0xb8b8b4 });
  for (const px of [0.25, lw - 0.25]) b.add(box(0.05, 0.05, 0.1), "steel", { m: mul(leaf, M(px, 1.05, 0.08)), color: 0x888884 });
  b.add(rbox(T.doorW + 0.3, 0.12, 0.6, 0.03), "concrete", { m: M(dx, 0.26, dz + 0.3), tile: 1, color: 0x8f8a80 });
  // banana mural (right of the door) + small BANANA CO. plaque
  decal(b, "logo1", 2.8, 2.8, M(0.95, 4.6, H + 0.035, 0, 0, 0));
  // an enamel sign on two stand-off bolts + a stencilled number
  plate(b, "CONTROL TOWER", 1.15, 0.32, M(dx + 1.5, 2.35, H + 0.06), "#fdf6e3", "#2a6f9a");
  plate(b, "AUTHORISED CREW ONLY", 1.15, 0.2, M(dx + 1.5, 1.98, H + 0.06), "#1d1a14", "#f4d23a");
  for (const sx of [-0.52, 0.52]) b.add(cyl(0.02, 0.02, 0.06, 6).rotateX(Math.PI / 2), "steel", { m: M(dx + 1.5 + sx, 2.35, H + 0.04), uv: "local", color: 0x9a9890 });
  textDecal(b, "T1", 0.9, 0.6, M(-H + 0.5, 6.6, H + 0.03), { fg: "#2b2b2b", bg: null, font: 900, stencil: true });
  // conduit: two straight steel pipes in clamps just under the balcony slab, down the right corner into a junction
  // box with a hinged door, handle and a yellow warning label (black wavy cables would draw a smile over the logo)
  const cy0 = top - 0.34;
  for (const [k, zz] of [[0, 0.07], [1, 0.16]] as Array<[number, number]>) {
    b.add(cyl(0.045, 0.045, 2 * H - 0.6, 8).rotateZ(Math.PI / 2), "steel", { m: M(-0.3, cy0 - k * 0.14, H + zz), uv: "local", color: 0x6d6e6a });
    b.add(cyl(0.045, 0.045, cy0 - 2.3, 8), "steel", { m: M(H - 0.62 - k * 0.14, (cy0 + 2.3) / 2 - k * 0.07, H + zz), uv: "local", color: 0x6d6e6a });
  }
  for (let x = -2.4; x <= 2.4; x += 1.2) b.add(rbox(0.1, 0.4, 0.22, 0.02), "steel", { m: M(x, cy0 - 0.07, H + 0.1), color: 0x4a4a48 });
  const jb = M(H - 0.7, 1.75, H + 0.16);
  b.add(rbox(0.62, 0.8, 0.26, 0.03), "pmetal", { m: jb, color: 0x9a9c94 });
  b.add(rbox(0.54, 0.72, 0.03, 0.01), "pmetal", { m: mul(jb, M(0, 0, 0.14)), color: 0xa8aaa2 });
  b.add(rbox(0.04, 0.16, 0.04, 0.01), "steel", { m: mul(jb, M(0.2, 0, 0.17)), color: 0x333333 });
  for (const yy of [-0.25, 0.25]) b.add(cyl(0.02, 0.02, 0.08, 6), "steel", { m: mul(jb, M(-0.28, yy, 0.15)), color: 0x555555 });
  { const t = new THREE.Shape(); t.moveTo(-0.1, -0.08); t.lineTo(0.1, -0.08); t.lineTo(0, 0.1); t.lineTo(-0.1, -0.08); b.add(new THREE.ShapeGeometry(t), "plain", { m: mul(jb, M(0, 0.2, 0.158)), uv: "keep", color: 0xf2c22a, shadow: false }); }
  // hazard checker paving around the base + grey pavers
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    const px = i * 1.0, pz = j * 1.0;
    if (Math.abs(px) < H + 0.3 && Math.abs(pz) < H + 0.3) continue;
    if (Math.hypot(px, pz) > 5.2) continue;
    const yel = (i + j) % 2 === 0 && pz > 0;
    b.add(rbox(0.96, 0.1, 0.96, 0.02), "concrete", { m: M(px, 0.02, pz), tile: 1, color: yel ? 0xe8b92a : 0xb3aea4 });
  }
  // crates + drum stacked by the door
  P.crate(b, M(1.5, 0.2, H + 0.75, 0, 0.1, 0), { lid: true, seed: 2 });
  P.crate(b, M(1.6, 1.02, H + 0.75, 0, -0.08, 0), { lid: true, seed: 3 });
  P.crate(b, M(2.55, 0.2, H + 0.8, 0, 1.45, 0), { lid: true, seed: 4 });
  P.drum(b, M(-2.75, 0.2, H + 0.55), 0x2f5f86);
  // ---- balcony: yellow fascia band, plank deck, dark metal railing
  const B = H + T.balc;
  for (const [sx, sz, w, d] of [[0, 1, 2 * B, 0.3], [0, -1, 2 * B, 0.3], [1, 0, 0.3, 2 * B], [-1, 0, 0.3, 2 * B]] as Array<[number, number, number, number]>) {
    b.add(rbox(w + 0.04, 0.5, d + 0.04, 0.05), "plaster", { m: M(sx * (B - 0.13), top + 0.05, sz * (B - 0.13)), tile: 2, color: YEL });
  }
  for (const [x0, z0, x1, z1] of [[-B, H, B, B], [-B, -B, B, -H], [-B, -H, -H, H], [H, -H, B, H]] as Array<[number, number, number, number]>) {
    b.add(box(x1 - x0 - 0.04, 0.06, z1 - z0 - 0.04), "deck", { m: M((x0 + x1) / 2, cab + 0.03, (z0 + z1) / 2), tile: 2.2, color: 0x8c7a64 });
  }
  const railC = 0x3b3631, rr = B - 0.08;
  P.railing(b, -rr, rr, rr, rr, cab, { h: 1.1, spacing: 1.5, color: railC, thick: 0.05, bars: 1 });
  P.railing(b, rr, rr, rr, -rr, cab, { h: 1.1, spacing: 1.5, color: railC, thick: 0.05, bars: 1 });
  P.railing(b, rr, -rr, -rr, -rr, cab, { h: 1.1, spacing: 1.5, color: railC, thick: 0.05, bars: 1 });
  P.railing(b, -rr, -rr, -rr, rr, cab, { h: 1.1, spacing: 1.5, color: railC, thick: 0.05, bars: 1 });
  // ---- cab: sloped yellow fascia (low wall), leaning glazing with dark mullions, roof slabs, console
  const ci = T.cabS - 0.02, g0 = cab + T.lowWall, gh = T.glassH, lean = T.lean;
  const rf0 = ci + 0.02, rf1 = ci + 0.2, rg1 = rf1 + lean;
  const dA = -T.cabDoorZ - T.cabDoorW / 2, dB = -T.cabDoorZ + T.cabDoorW / 2; // door span on the right face (face-local x)
  /** trapezoid panel on a face (face-local: +Z = outward), bottom at radius rb/height yb, top at rt/yt; x-range clipped to the face */
  const panel = (fm: THREE.Matrix4, x0: number, x1: number, yb: number, yt: number, rb: number, rt: number, key: "plaster" | "glass", color: number, flip = false) => {
    const cl = (x: number, r: number) => Math.max(-r, Math.min(r, x));
    const pos = [cl(x0, rb), yb, rb, cl(x1, rb), yb, rb, cl(x1, rt), yt, rt, cl(x0, rt), yt, rt];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([x0 / 2, yb / 2, x1 / 2, yb / 2, x1 / 2, yt / 2, x0 / 2, yt / 2], 2));
    g.setIndex(flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    b.add(g, key, { m: fm, uv: key === "glass" ? "keep" : "box", tile: 2, color, shadow: key !== "glass" });
  };
  const lc = Math.atan2(lean, gh);
  for (const yaw of [0, Math.PI, -Math.PI / 2, Math.PI / 2]) {
    const fm = M(0, 0, 0, 0, yaw, 0), isDoor = Math.abs(yaw - Math.PI / 2) < 0.01;
    const spans: Array<[number, number]> = isDoor ? [[-9, dA], [dB, 9]] : [[-9, 9]];
    for (const [x0, x1] of spans) {
      panel(fm, x0, x1, cab, g0, rf0, rf1, "plaster", YEL);                       // sloped yellow fascia
      panel(fm, x0, x1, cab, g0, rf0 - 0.28, rf0 - 0.28, "plaster", 0xd9d3c4, true); // inner face
      panel(fm, x0, x1, g0 + 0.06, g0 + gh, rf1, rg1, "glass", 0xffffff);          // leaning glazing
    }
    if (isDoor) {
      for (const x of [dA, dB]) b.add(rbox(0.12, gh + T.lowWall, 0.16, 0.02), "pmetal", { m: mul(fm, M(x, cab + (gh + T.lowWall) / 2, rf1 + lean * 0.4, -lc, 0, 0)), color: 0x26221f });
      b.add(rbox(dB - dA, 0.12, 0.2, 0.02), "pmetal", { m: mul(fm, M((dA + dB) / 2, g0 + gh - 0.2, rg1 - 0.05)), color: 0x26221f });
      // open door leaf (glazed steel) swung out against the glazing
      const lm = mul(fm, M(dB, cab, rf1 + 0.05, 0, 1.35, 0));
      b.add(rbox(T.cabDoorW - 0.05, 2.35, 0.06, 0.02), "pmetal", { m: mul(lm, M(-(T.cabDoorW - 0.05) / 2, 1.18, 0)), color: YEL_D });
      b.add(box(T.cabDoorW - 0.35, 1.2, 0.07), "darkGlass", { m: mul(lm, M(-(T.cabDoorW - 0.05) / 2, 1.6, 0)) });
    }
    // sill frame + mullions + head frame
    b.add(rbox(2 * rf1 + 0.12, 0.12, 0.2, 0.02), "pmetal", { m: mul(fm, M(0, g0, rf1)), color: 0x26221f });
    for (let k = 0; k <= 4; k++) {
      const u = -1 + (2 * k) / 4, x = u * (rf1 + lean / 2) * 0.985;
      if (isDoor && x > dA - 0.3 && x < dB + 0.3) continue;
      b.add(rbox(0.1, gh / Math.cos(lc), 0.12, 0.02), "pmetal", { m: mul(fm, M(x, g0 + gh / 2, rf1 + lean / 2, -lc, 0, 0)), color: 0x26221f });
    }
    b.add(rbox(2 * rg1 + 0.12, 0.14, 0.16, 0.02), "pmetal", { m: mul(fm, M(0, g0 + gh, rg1)), color: 0x26221f });
  }
  // roof: two thick yellow slabs with a dark drip line
  const R = rg1 + 0.55;
  b.add(rbox(2 * R, T.roofT, 2 * R, 0.08), "plaster", { m: M(0, T.roof0 + T.roofT / 2, 0), tile: 2.5, color: YEL, aoY: T.roof0, aoRange: 0.4, aoMin: 0.75 });
  b.add(rbox(2 * R - 0.9, 0.36, 2 * R - 0.9, 0.06), "plaster", { m: M(0, T.roof0 + T.roofT + 0.18, 0), tile: 2.5, color: 0xe9b31c });
  b.add(box(2 * R - 0.3, 0.05, 2 * R - 0.3), "pmetal", { m: M(0, T.roof0 - 0.02, 0), color: 0x3a342c });
  // cab ceiling + the control console: an angled desk along the back glazing with screens, radio stack, lamps, a
  // microphone, binoculars, chart, two swivel chairs, a map board, a fire extinguisher (≤ 75 m)
  b.add(box(2 * ci - 0.4, 0.05, 2 * ci - 0.4), "plaster", { m: M(0, T.roof0 - 0.05, 0), color: 0xe6e0d2 });
  // (drawn at exactly S.TWR_CONSOLE — the wide cab's console runs along the back glazing)
  const CN = S.TWR_CONSOLE, n = bNear, cw = CN.x1 - CN.x0, cxm = (CN.x0 + CN.x1) / 2, cz = (CN.z0 + CN.z1) / 2;
  n.add(rbox(cw, CN.h - 0.08, CN.z1 - CN.z0, 0.03), "pmetal", { m: M(cxm, cab + (CN.h - 0.08) / 2, cz), color: 0x5f6368 });
  n.add(rbox(cw, 0.08, CN.z1 - CN.z0 + 0.04, 0.02), "pmetal", { m: M(cxm, cab + CN.h - 0.04, cz), color: 0x3a3e42 });
  // the monitor bank behind the desk (= its collider): a tilted instrument face with the screens
  const BK = CN.bank, bz = (BK.z0 + BK.z1) / 2;
  n.add(rbox(cw, BK.h, BK.z1 - BK.z0, 0.03), "pmetal", { m: M(cxm, cab + BK.h / 2, bz), color: 0x4a4e52 });
  // the wide cab's floor: grey linoleum over the overhang ring (the balcony planks run under the glazing)
  for (const [x0, z0, x1, z1] of [[-ci, H, ci, ci], [-ci, -ci, ci, -H], [-ci, -H, -H, H], [H, -H, ci, H]] as Array<[number, number, number, number]>)
    b.add(box(x1 - x0, 0.02, z1 - z0), "concrete", { m: M((x0 + x1) / 2, cab + 0.065, (z0 + z1) / 2), tile: 2, color: 0x8d9596 });
  for (const [i, sx] of [-1.6, -0.55, 0.55, 1.6].entries()) {
    n.add(rbox(0.78, 0.5, 0.06, 0.02), "pmetal", { m: M(sx, cab + 1.32, BK.z1 + 0.02), color: 0x2a2c2e });
    // radar scope / nav map on the screens (not plain orange panels)
    const sg = new THREE.PlaneGeometry(0.66, 0.38), uv = sg.attributes.uv, half = i % 2;
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * 0.5 + half * 0.5);
    n.add(sg, "screen", { m: M(sx, cab + 1.33, BK.z1 + 0.055), uv: "keep", shadow: false });
  }
  n.add(rbox(0.6, 0.3, 0.35, 0.03), "pmetal", { m: M(-2.0, cab + CN.h + 0.15, cz), color: 0x3d5a45 }); // radio
  for (let k = 0; k < 4; k++) n.add(cyl(0.03, 0.03, 0.03, 8).rotateX(Math.PI / 2), "chrome", { m: M(-2.15 + k * 0.1, cab + CN.h + 0.2, cz + 0.18), uv: "local", color: 0xd8d8d0 });
  for (const lx of [-1.1, 0, 1.1]) n.add(sph(0.04, 8, 6), lx === 0 ? "lampRed" : "lamp", { m: M(lx, cab + CN.h + 0.03, cz + 0.22) });
  n.add(cyl(0.01, 0.01, 0.3, 4), "steel", { m: M(0.3, cab + CN.h + 0.15, cz, 0.3, 0, 0), color: 0x222222 }); // mic
  n.add(sph(0.04, 8, 6), "rubber", { m: M(0.3, cab + CN.h + 0.3, cz + 0.05), color: 0x222222 });
  n.add(box(0.6, 0.01, 0.4), "fabric", { m: M(1.2, cab + CN.h + 0.005, cz + 0.05, 0, 0.2, 0), color: 0xe8dcc0 }); // chart
  for (const bx2 of [-0.9, 1.3]) {
    n.add(rbox(0.5, 0.08, 0.5, 0.03), "fabric", { m: M(bx2, cab + 0.52, cz + 1.1), color: 0x2c2c2c });
    n.add(rbox(0.5, 0.5, 0.08, 0.03), "fabric", { m: M(bx2, cab + 0.85, cz + 1.38), color: 0x2c2c2c });
    n.add(cyl(0.03, 0.03, 0.45, 6), "steel", { m: M(bx2, cab + 0.26, cz + 1.1), color: 0x555555 });
    n.add(cyl(0.25, 0.25, 0.03, 10), "steel", { m: M(bx2, cab + 0.03, cz + 1.1), color: 0x444444 });
  }
  n.add(rbox(1.4, 0.9, 0.04, 0.02), "wood", { m: M(-ci + 0.3, cab + 0.9, 0.6, 0, Math.PI / 2, 0), color: 0x7a5236 }); // map board
  { const mg = new THREE.PlaneGeometry(1.2, 0.75), uv = mg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 0.5 + uv.getX(k) * 0.5); n.add(mg, "screen", { m: M(-ci + 0.33, cab + 0.9, 0.6, 0, Math.PI / 2, 0), uv: "keep", shadow: false }); }
  n.add(cyl(0.08, 0.08, 0.45, 10), "gloss", { m: M(2.5, cab + 0.23, 1.8), color: 0xc0392b }); // extinguisher
  glows.push(new THREE.Vector3(0, cab + 1.2, -1.6).applyMatrix4(b.frame));
  // radar dish (left-back of the roof) + beacon mast (right-back)
  const ry = T.roof0 + T.roofT + 0.36;
  // radar dish on a lattice post (a big white dish on the roof's left corner)
  // (on the roof's front-left corner, turned toward the runway threshold — visible from the spotter deck)
  const dxz = [-1.7, 0.9];
  b.add(cyl(0.34, 0.46, 0.3, 12), "pmetal", { m: M(dxz[0], ry + 0.15, dxz[1]), color: 0x37332d });
  b.add(cyl(0.1, 0.14, 1.9, 10), "pmetal", { m: M(dxz[0], ry + 1.2, dxz[1]), color: 0x37332d });
  b.add(rbox(0.5, 0.35, 0.4, 0.04), "pmetal", { m: M(dxz[0], ry + 2.2, dxz[1]), color: 0x4a4a46 });
  // turned to show its bowl three-quarter to the spotter deck (tower-local bearing to the deck + 35°)
  { const cw = S.sw(S.SPOT.x, S.SPOT.z), f2 = T.frame, dx = cw[0] - f2.x, dz = cw[2] - f2.z, c = Math.cos(f2.yaw), sn = Math.sin(f2.yaw);
    const lx = dx * c - dz * sn - dxz[0], lz = dx * sn + dz * c - dxz[1], yaw = Math.atan2(lx, lz) + 0.6;
    P.dish(b, M(dxz[0], ry + 2.65, dxz[1], -0.4, yaw, 0), 1.5); }
  const mx = 1.45, mz = -1.55;
  b.add(rbox(0.8, 0.35, 0.8, 0.05), "pmetal", { m: M(mx, ry + 0.17, mz), color: 0x2f2c28 });
  b.add(cyl(0.16, 0.2, 5.8, 12), "pmetal", { m: M(mx, ry + 3.1, mz), uv: "local", color: 0x3c3833 });
  for (const yy of [1.2, 2.4, 3.3, 4.6]) b.add(cyl(0.26, 0.26, 0.16, 12), "pmetal", { m: M(mx, ry + yy, mz), color: 0x2a2724 });
  b.add(cyl(0.12, 0.14, 1.6, 10), "chrome", { m: M(mx, ry + 6.7, mz), uv: "local", color: 0x8a8a86 });
  b.add(cyl(0.22, 0.22, 0.2, 12), "pmetal", { m: M(mx, ry + 7.55, mz), color: 0xd8d8d0 });
  b.add(sph(0.17, 12, 8), "lampRed", { m: M(mx, ry + 7.78, mz) });
  glows.push(new THREE.Vector3(mx, ry + 7.8, mz).applyMatrix4(b.frame));
  b.setFrame(0, 0, 0, 0); bNear.setFrame(0, 0, 0, 0);
}

/** the 10 m timber spotter platform at the threshold (strip frame): braced posts, plank deck, heavy brown railing, stair */
export function buildSpotter(b: Batch) {
  const o = S.SPOT, st = S.STRIP, h = o.half, wr = 0x8f6a47, post = 0x6b4b33;
  b.setFrame(st.x, st.y, st.z, st.yaw);
  addPieces(b, S.PIECES_SPOT, {
    "sp:deck": { mat: "deck", color: 0xb88c62, tile: 2.2 },
    "sp:post": { mat: "wood", color: 0x6b4a32, tile: 1.5 },
    "sp:step": { mat: "deck", skip: true }, // open treads (openStair) — the full blocks made a walk-through wedge
    rail: { mat: "wood", skip: true },
  });
  // the four posts are collider pieces — drawn here at exactly their boxes
  for (const p of S.PIECES_SPOT) if (p.k === "sp:post" && p.col) b.add(rbox(p.h[0] * 2, p.h[1] * 2, p.h[2] * 2, 0.03), "wood", { m: M(p.c[0], p.c[1], p.c[2]), tile: 1.5, color: post });
  // X-bracing on all four sides, three tiers
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([px, pz]) => [o.x + px * (h - 0.25), o.z + pz * (h - 0.25)]);
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = c[i], [x1, z1] = c[(i + 1) % 4];
    for (const [ya, yb] of [[0.5, 3.6], [3.6, 6.7], [6.7, 9.6]]) {
      P.strut(b, [x0, ya, z0], [x1, yb, z1], 0.07, post, new THREE.Matrix4(), "wood");
      P.strut(b, [x1, ya, z1], [x0, yb, z0], 0.07, post, new THREE.Matrix4(), "wood");
      b.add(rbox(Math.hypot(x1 - x0, z1 - z0), 0.16, 0.12, 0.02), "wood", { m: M((x0 + x1) / 2, yb, (z0 + z1) / 2, 0, Math.atan2(-(z1 - z0), x1 - x0), 0), color: post });
    }
  }
  for (const [x, z] of c) b.add(rbox(0.7, 0.3, 0.7, 0.04), "concrete", { m: M(x, 0.1, z), color: 0x9a968e });
  b.add(rbox(2 * h + 0.3, 0.3, 0.25, 0.03), "wood", { m: M(o.x, o.y - 0.45, o.z - h + 0.1), color: post });
  b.add(rbox(2 * h + 0.3, 0.3, 0.25, 0.03), "wood", { m: M(o.x, o.y - 0.45, o.z + h - 0.1), color: post });
  const e = 0.06;
  // post-and-rail timber railing (a chunky brown parapet box would fill the foreground)
  const ro = { h: 1.05, spacing: 1.1, mat: "wood" as const, color: wr, thick: 0.06, bars: 1 };
  P.railing(b, o.x - h + e, o.z + h - e, o.x + h - e, o.z + h - e, o.y, ro);
  P.railing(b, o.x + h - e, o.z - h + e, o.x + h - e, o.z + h - e, o.y, ro);
  P.railing(b, o.x - h + e, o.z - h + e, o.x + h - e, o.z - h + e, o.y, ro);
  P.railing(b, o.x - h + e, o.z - h + e, o.x - h + e, o.stairZ - o.stairW / 2 - 0.05, o.y, ro);
  const L = 0.5 * o.stairN;
  for (const dz of [-o.stairW / 2 - 0.05, o.stairW / 2 + 0.05]) slopeRail(b, [o.x - h - L, 0, o.stairZ + dz], [o.x - h, o.y, o.stairZ + dz], 1.0, "wood", wr, 0.07, 6);
  // stringers + a mid support frame under the long stair
  for (const dz of [-o.stairW / 2, o.stairW / 2]) P.strut(b, [o.x - h - L, 0.1, o.stairZ + dz], [o.x - h, o.y - 0.25, o.stairZ + dz], 0.11, post, new THREE.Matrix4(), "wood");
  for (const t of [0.35, 0.7]) { const x = o.x - h - L + L * t, y = o.y * t; for (const dz of [-o.stairW / 2, o.stairW / 2]) b.add(rbox(0.2, y, 0.2, 0.03), "wood", { m: M(x, y / 2, o.stairZ + dz), color: post }); }
  openStair(b, S.PIECES_SPOT, "sp:step", { color: 0xa88058 });
  // (no loose crate on the deck: the deck's loot chest is the match's)
  b.setFrame(0, 0, 0, 0);
}

void shapeGeo; void rectShape;
