// PEEL STRIP hangar visuals (hangar-local frame from shared/pois/peel-strip.ts): weathered vertical-plank walls,
// segmental barrel roof of galvanised corrugated sheet (ridges run eave→ridge, wavy eave edge, gable barge trims),
// steel arch trusses + purlins inside, yellow trim band over the huge door, sliding leaves parked on an overhead rail,
// giant banana mural, mezzanine with stair, workshop dressing, the BANANA CO. plane half out of the door, and the
// lean-to shed (horizontal boards, yellow trims, corrugated roof, open door, chair).
import * as THREE from "three";
import * as S from "../../../../../shared/pois/peel-strip";
import { Batch, M, box, rbox, cyl, sph, addPieces, frameGeo, rectShape, shapeGeo, decal, lightPoolMat } from "../_kit/coast-kit";
import { rng } from "../../../../../shared/pois/coast-kit";
import * as P from "../_kit/coast-props";
import { bananaPlane } from "../_kit/coast-vehicles";
import { textDecal } from "../_kit/coast-sign";
import { YEL } from "./tower";
import { openStair } from "./coast-dress";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);

/** barrel roof sheet between angles ±θ, length along X; UV u = x/tile (the texture's vertical ridges → ridges run
 *  eave → ridge, following the arch), v = arc/tile. Built as individual 0.9 × 2.8 m corrugated SHEETS (own vertices)
 *  so each sheet gets its own weathering tint (galvanised / dull / rusty) and the courses overlap with a small step. */
function barrel(R: number, cy: number, th: number, x0: number, x1: number, segs: number, tile: number, inner: boolean, seed = 7) {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const r = rng(seed), sheetW = 0.92, sheetL = 2.8, arcL = 2 * th * R;
  const nx = Math.ceil((x1 - x0) / sheetW), na = Math.ceil(arcL / sheetL), sub = Math.max(2, Math.ceil(segs / na));
  for (let i = 0; i < nx; i++) for (let j = 0; j < na; j++) {
    const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx;
    const a0 = -th + (2 * th) * j / na, a1 = -th + (2 * th) * (j + 1) / na + (j < na - 1 ? 0.012 : 0);
    // weathering: most sheets galvanised grey, some dull, a few rusty (more toward the eaves, where water runs off)
    const eave = 1 - Math.abs((j + 0.5) / na - 0.5) * 2, k = r();
    let cr = 0.92 + r() * 0.16, cg = cr, cb = cr;
    if (k < 0.16 + (1 - eave) * 0.14) { cr *= 1.12; cg *= 0.86; cb *= 0.72; } else if (k < 0.4) { cr *= 0.84; cg *= 0.84; cb *= 0.86; }
    const rr = R + (inner ? 0 : (j % 2) * 0.018), base = pos.length / 3;
    for (let s2 = 0; s2 <= sub; s2++) {
      const a = a0 + (a1 - a0) * s2 / sub, arc = a * R, streak = 1 - 0.12 * Math.pow(Math.abs(Math.sin(a * 3 + i)), 4);
      for (const x of [xa, xb]) {
        pos.push(x, cy + Math.cos(a) * rr, Math.sin(a) * rr);
        uv.push(x / tile, arc / tile);
        col.push(cr * streak, cg * streak, cb * streak);
      }
    }
    for (let s2 = 0; s2 < sub; s2++) {
      const a = base + s2 * 2, b2 = a + 1, c = a + 2, d = a + 3;
      if (inner) idx.push(a, b2, c, b2, d, c); else idx.push(a, c, b2, b2, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** corrugated eave edge: thin wavy strip along X at the sheet's lower edge (the corrugation section reads in silhouette) */
function wavyEave(x0: number, x1: number, pitch: number, amp: number, h: number) {
  const pos: number[] = [], idx: number[] = [];
  const n = Math.ceil((x1 - x0) / pitch) * 6;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, w = Math.sin((x / pitch) * Math.PI * 2) * amp;
    pos.push(x, 0, w, x, -h, w);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** arch-topped gable wall shape (z along shape X), optional rectangular holes */
function gableShape(holes: Array<[number, number, number, number]>) {
  const { W, HW, floor } = S.HGR, hw = W / 2, s = new THREE.Shape();
  s.moveTo(-hw, floor); s.lineTo(hw, floor); s.lineTo(hw, HW);
  const n = 24;
  for (let i = 1; i <= n; i++) { const z = hw - (2 * hw * i) / n; s.lineTo(z, S.hgrArch(z) - 0.06); }
  s.lineTo(-hw, floor);
  for (const [z0, y0, z1, y1] of holes) { const h = new THREE.Path(); h.moveTo(z0, y0); h.lineTo(z0, y1); h.lineTo(z1, y1); h.lineTo(z1, y0); h.lineTo(z0, y0); s.holes.push(h); }
  return s;
}

export function buildHangar(b: Batch, bNear: Batch, glows: THREE.Vector3[]) {
  const H = S.HGR, f = H.frame, { L, W, HW, floor } = H, hl = L / 2, hw = W / 2;
  b.setFrame(f.x, f.y, f.z, f.yaw); bNear.setFrame(f.x, f.y, f.z, f.yaw);
  addPieces(b, S.HGR_LOCAL, {
    "hg:floor": { mat: "gConcrete", color: 0x9d9a94, tile: 7 },
    "hg:wall": { mat: "gPlanks", color: 0xfff4e2, tile: 4.6 },
    "hg:mezz": { mat: "deck", color: 0xb48a60, tile: 2.2 },
    "hg:step": { mat: "deck", skip: true }, // open treads (openStair below)
    "hg:post": { mat: "pmetal", color: 0x4a4540, tile: 1 },
    "hg:bench": { mat: "wood", skip: true }, "hg:chest": { mat: "gloss", skip: true }, "hg:engine": { mat: "gloss", skip: true }, "hg:gable": { mat: "gPlanks", skip: true }, "hg:roof": { mat: "gCorr", skip: true },
    "ps:airstair": { mat: "gloss", color: 0xf2c21a, tile: 1, round: 0.02 }, "hg:shelf": { mat: "pmetal", skip: true }, "hg:crate": { mat: "wood", skip: true },
    "hg:leaf": { mat: "gCorr", skip: true }, drums: { mat: "pmetal", skip: true }, plane: { mat: "gloss", skip: true },
    "sh:floor": { mat: "deck", color: 0x9c7a58, tile: 2 },
    "sh:wall": { mat: "gPlanksH", color: 0xc9ad8a, tile: 3.2, uvRot: true },
    "sh:roof": { mat: "gCorr", skip: true },
    rail: { mat: "pmetal", skip: true },
  });
  openStair(b, S.HGR_LOCAL, "hg:step", { color: 0xa88058 });
  // ---- gable ends (true arch outline, plank texture) + yellow trims
  const t = 0.3;
  const front = gableShape([[-H.doorW / 2, floor, H.doorW / 2, floor + H.doorH]]);
  const back = gableShape([[4.0 - 0.9, floor, 4.0 + 0.9, floor + 2.8], [-5, 5.6, -2.6, 6.8]]);
  for (const [shape, x] of [[front, hl - t / 2], [back, -hl + t / 2]] as Array<[THREE.Shape, number]>) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -t / 2);
    b.add(g, "gPlanks", { m: M(x, 0, 0, 0, -Math.PI / 2, 0), uv: "box", tile: 4.6, color: 0xfff2de });
  }
  // yellow band over the door, door jamb trims, gable corner trims, base kick band
  b.add(rbox(H.doorW + 1.6, 0.55, 0.12, 0.03), "plaster", { m: M(hl + 0.03, floor + H.doorH + 0.32, 0, 0, Math.PI / 2, 0), color: YEL });
  for (const s of [-1, 1]) {
    b.add(rbox(0.12, H.doorH + 0.1, 0.34, 0.02), "plaster", { m: M(hl + 0.03, floor + H.doorH / 2, s * (H.doorW / 2 + 0.12)), color: YEL });
    b.add(rbox(0.36, HW, 0.36, 0.03), "plaster", { m: M(hl - 0.1, HW / 2, s * (hw - 0.1)), color: YEL });
    b.add(rbox(0.36, HW, 0.36, 0.03), "plaster", { m: M(-hl + 0.1, HW / 2, s * (hw - 0.1)), color: YEL });
  }
  for (const s of [-1, 1]) b.add(box(L + 0.1, 0.35, 0.06), "plaster", { m: M(0, floor + 0.18, s * (hw + 0.02)), tile: 2, color: 0x8f8a7c });
  // ---- barrel roof: outer corrugated sheet, inner face, wavy eaves, gable barge trims, ridge cap
  const R = S.HGR_R, cy = HW - (R - H.AR), zE = hw + H.over, th = Math.asin(zE / R);
  const x0 = -hl - 0.5, x1 = hl + 0.5;
  b.add(barrel(R + 0.02, cy, th, x0, x1, 40, 2.2, false, 7), "gCorr", { uv: "keep", color: 0xfff6ea });
  b.add(barrel(R - 0.1, cy, th, x0, x1, 40, 2.2, true, 8), "gCorr", { uv: "keep", color: 0x9a968e });
  for (const s of [-1, 1]) {
    const ey = cy + Math.cos(th) * R, ez = s * zE;
    const eave = wavyEave(x0, x1, 2.2 / 16, 0.035, 0.14);
    b.add(eave, "gCorr", { m: M(0, ey + 0.02, ez, 0, s < 0 ? Math.PI : 0, 0), uv: "box", tile: 2.2, color: 0xcfcac2 });
    b.add(cyl(0.07, 0.07, L + 1.0, 8).rotateZ(Math.PI / 2), "pmetal", { m: M(0, ey - 0.12, ez + s * 0.05), uv: "local", color: 0x77736a }); // gutter
  }
  // barge boards: chunky curved fascia capping the sheet edge at both gables
  for (const x of [x0 + 0.12, x1 - 0.12]) {
    const segs = 26;
    for (let i = 0; i < segs; i++) {
      const a0 = -th + (2 * th * i) / segs, a1 = -th + (2 * th * (i + 1)) / segs, am = (a0 + a1) / 2, rr = R + 0.02;
      b.add(box(0.34, 0.3, (a1 - a0) * rr + 0.03), "pmetal", { m: M(x, cy + Math.cos(am) * rr, Math.sin(am) * rr, am, 0, 0), color: 0x77716a });
    }
  }
  // ---- steel arch trusses + purlins inside, tie rods
  for (let k = 0; k <= 6; k++) {
    const x = -hl + 0.6 + (k * (L - 1.2)) / 6, segs = 14;
    for (let i = 0; i < segs; i++) {
      const a0 = -th * 0.96 + (2 * th * 0.96 * i) / segs, a1 = -th * 0.96 + (2 * th * 0.96 * (i + 1)) / segs, am = (a0 + a1) / 2, r = R - 0.32;
      const len = (a1 - a0) * r + 0.02;
      b.add(box(0.14, 0.34, len), "pmetal", { m: M(x, cy + Math.cos(am) * r, Math.sin(am) * r, am, 0, 0), color: 0x4a4a48 });
    }
    b.add(cyl(0.03, 0.03, W - 0.6, 5).rotateX(Math.PI / 2), "steel", { m: M(x, HW - 0.2, 0), uv: "local", color: 0x555555 });
    for (const s of [-1, 1]) b.add(box(0.18, HW - floor, 0.18), "pmetal", { m: M(x, (HW + floor) / 2, s * (hw - 0.3)), color: 0x4a4a48 });
  }
  for (let i = -3; i <= 3; i++) {
    const a = (i / 3.4) * th, r = R - 0.55;
    b.add(box(L - 0.6, 0.12, 0.12), "pmetal", { m: M(0, cy + Math.cos(a) * r, Math.sin(a) * r, a, 0, 0), color: 0x5a5854 });
  }
  // ---- overhead door rail + telescoping leaves (2 per side) parked in front of the gable wall
  b.add(box(0.2, 0.25, W + 0.4), "pmetal", { m: M(hl + 0.55, floor + H.doorH + 0.75, 0), color: 0x3c3a36 });
  for (const s of [-1, 1]) for (const [layer, dxl] of [[0, 0.18], [1, 0.45]] as Array<[number, number]>) {
    const zc = s * (H.doorW / 2 + (hw - H.doorW / 2) / 2 + (layer ? 0 : -0.25)), wz = hw - H.doorW / 2 - 0.12;
    b.add(box(0.1, H.doorH + 0.15, wz), "gCorr", { m: M(hl + dxl, floor + (H.doorH + 0.15) / 2, zc), uv: "box", tile: 2.2, color: layer ? 0xf0ebe2 : 0xe2ddd4 });
    for (const zz of [-wz / 2, wz / 2]) b.add(rbox(0.14, H.doorH + 0.2, 0.14, 0.03), "plaster", { m: M(hl + dxl + 0.05, floor + (H.doorH + 0.2) / 2, zc + zz), color: YEL });
    for (const yy of [0.12, H.doorH * 0.5, H.doorH + 0.1]) b.add(rbox(0.14, 0.14, wz, 0.03), "plaster", { m: M(hl + dxl + 0.05, floor + yy, zc), color: YEL });
    for (const zz of [-wz / 3, wz / 3]) b.add(cyl(0.1, 0.1, 0.07, 10).rotateZ(Math.PI / 2), "steel", { m: M(hl + dxl + 0.1, floor + H.doorH + 0.52, zc + zz), uv: "local", color: 0x333333 });
  }
  // ---- banana mural on the long (camera) side + BANANA CO. lettering over the door
  // one BIG outlined banana on the long side facing the view camera
  // nearer the door end (the spotter deck sees the side's door half past the tower)
  decal(b, "logo1", 6.6, 6.6, M(6.2, 2.45, hw + 0.03, 0, 0, 0));
  textDecal(b, "THE FEED", 7.2, 0.9, M(hl + 0.1, floor + H.doorH + 1.25, 0, 0, Math.PI / 2, 0), { fg: "#2a2418", bg: null, font: 900 });
  // ---- interior: mezzanine joists + posts + railing, stair rail, shelves, bench, tyres, drums, propeller, lamps
  const my = H.mezz.y, mx = H.mezz.x1;
  for (let z = -hw + 1; z < hw; z += 2.2) b.add(box(Math.abs(-hl - mx) - 0.3, 0.26, 0.14), "wood", { m: M((-hl + mx) / 2, my - 0.43, z), color: 0x6a4a30 });
  b.add(box(0.2, 0.32, W - 0.6), "pmetal", { m: M(mx - 0.1, my - 0.46, 0), color: 0x4a4540 });
  P.railing(b, mx - 0.05, -hw + 1.95, mx - 0.05, hw - 0.4, my, { h: 1.05, spacing: 1.6, color: 0x3d3935, thick: 0.05, bars: 2 });
  { const y0 = floor, y1 = my; P.strut(b, [mx + 5.0, y0 + 1.0, -hw + 1.97], [mx, y1 + 1.0, -hw + 1.97], 0.04, 0x3d3935, new THREE.Matrix4()); for (const u of [0, 0.5, 1]) { const px = mx + 5.0 - 5.0 * u, py = y0 + (y1 - y0) * u; b.add(box(0.06, 1.0, 0.06), "pmetal", { m: M(px, py + 0.5, -hw + 1.97), color: 0x3d3935 }); } }
  // workbench with vise + tools, tyre stack, spare propeller on the wall, engine crate
  b.add(rbox(2.2, 1.4, 0.05, 0.02), "wood", { m: M(-1, floor + 2.0, hw - 0.18), color: 0x6a4a30 });
  for (let i = 0; i < 7; i++) b.add(box(0.05, 0.4 + (i % 3) * 0.12, 0.03), "steel", { m: M(-1.9 + i * 0.3, floor + 1.9, hw - 0.22), color: 0x8a8a8a });
  { const pm = M(-hl + 0.2, floor + 3.0, 5.5, 0, Math.PI / 2, 0.3); for (let k = 0; k < 3; k++) { const bl = rbox(0.1, 1.3, 0.26, 0.04); bl.translate(0, 0.7, 0); b.add(bl, "pmetal", { m: mul(pm, M(0, 0, 0, 0, 0, (k / 3) * Math.PI * 2)), color: 0x5d5f63 }); } b.add(sph(0.2, 12, 8), "chrome", { m: pm, color: 0xbfc2c6 }); }
  // (the pallet + sacks are a cover piece — HGR_COVER "hg:pallet", drawn by dress.ts)
  // hanging lamps
  for (const x of [-6, 2, 9]) {
    b.add(cyl(0.015, 0.015, 3.2, 4), "steel", { m: M(x, cy + R - 2.0, 0), color: 0x222222 });
    b.add(cyl(0.12, 0.5, 0.35, 16, true), "pmetal", { m: M(x, cy + R - 3.7, 0), color: 0x2f5a3a });
    b.add(sph(0.14, 10, 8), "lamp", { m: M(x, cy + R - 3.78, 0) });
    glows.push(new THREE.Vector3(x, cy + R - 3.85, 0).applyMatrix4(b.frame));
  }
  // oil stains on the floor
  for (const [x, z, r] of [[8, 1, 1.4], [3, -2, 0.9], [11, 3.5, 0.8], [-4, 4, 1.1]]) b.add(new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2), "blob", { m: M(x, floor + 0.012, z), uv: "keep", color: new THREE.Color(0.55, 0.55, 0.55), shadow: false });
  // ---- more workshop (≤ 75 m): engine hoist with a chain, a spare radial engine on a stand, a tool pegboard with
  // hanging tools, a compressor, parts shelving, loot crates on the mezzanine, warm pools under the lamps
  {
    const n = bNear;
    // (no engine hoist: the engine stands on its own wheeled stand in the work bay)
    // the work bay floor: grey-blue epoxy with a yellow / black hazard border, bay numbers and a tow line to the door
    {
      const x0 = -6.2, x1 = 7.6, z0 = -6.6, z1 = 6.6;
      b.add(box(x1 - x0, 0.012, z1 - z0), "concrete", { m: M((x0 + x1) / 2, floor + 0.007, (z0 + z1) / 2), tile: 3, color: 0x6f8394, shadow: false });
      const stripe = (ax: number, az: number, bx2: number, bz: number) => {
        const L = Math.hypot(bx2 - ax, bz - az), yaw = Math.atan2(-(bz - az), bx2 - ax);
        b.add(box(L, 0.014, 0.3), "paint", { m: M((ax + bx2) / 2, floor + 0.012, (az + bz) / 2, 0, yaw, 0), color: 0xf2c21a, shadow: false });
        for (let t = 0.2; t < L - 0.2; t += 0.6) n.add(box(0.16, 0.016, 0.3), "paint", { m: M(ax + (bx2 - ax) * t / L, floor + 0.014, az + (bz - az) * t / L, 0, yaw + 0.6, 0), color: 0x1e1e1e, shadow: false });
      };
      stripe(x0, z0, x1, z0); stripe(x0, z1, x1, z1); stripe(x0, z0, x0, z1);
      for (let x = 9; x < 13; x += 1.2) b.add(box(0.6, 0.012, 0.18), "paint", { m: M(x, floor + 0.012, 0), color: 0xf2efe8, shadow: false });
      textDecal(b, "BAY 2", 1.6, 0.6, M(-4.6, floor + 0.02, 5.6, -Math.PI / 2, 0, 0), { fg: "#f2c21a", bg: null, font: 900, stencil: true });
    }
    for (const x of [-6, 2, 9]) { const pg = new THREE.CircleGeometry(3.2, 20); pg.rotateX(-Math.PI / 2); n.add(pg, lightPoolMat(), { m: M(x, floor + 0.03, 0), uv: "keep", shadow: false }); }
  }
  // ---- the plane, half out of the door (nose +X)
  bananaPlane(b, M(S.PLANE_AT.x, floor, S.PLANE_AT.z, 0, 0, 0), { propA: 0.35 });
  for (const sd of [-1, 1]) textDecal(b, "THE FEED", 2.3, 0.36, M(S.PLANE_AT.x - 1.4, floor + 1.58, S.PLANE_AT.z + sd * 0.7, 0, sd > 0 ? 0 : Math.PI, sd * 0.17), { fg: "#2a2418", bg: null, font: 900 });
  // wheel chocks + tow bar
  for (const s of [-1, 1]) b.add(rbox(0.25, 0.18, 0.4, 0.03), "plaster", { m: M(S.PLANE_AT.x + 1.95, floor + 0.09, S.PLANE_AT.z + s * 1.42), color: YEL });
  // ---- fuel drums (red / green / red-with-band) + tool cart + jerry cans by the mural corner and inside the door
  const drums: Array<[number, number, number]> = [[8.5, hw + 0.8, 0xb3302a], [9.25, hw + 0.9, 0x3d7a3c], [10.0, hw + 0.75, 0xb3302a], [9.6, hw + 1.45, 0xb3302a], [8.9, hw + 1.5, 0x3d7a3c]];
  for (const [x, z, c] of drums) { P.drum(b, M(x, 0, z, 0, x, 0), c); b.add(new THREE.TorusGeometry(0.292, 0.03, 4, 20).rotateX(Math.PI / 2), "plaster", { m: M(x, 0.62, z), uv: "local", color: YEL }); }
  for (const [x, z, c] of [[11.0, -hw + 1.2, 0xb3302a], [11.7, -hw + 1.1, 0xb3302a], [11.4, -hw + 1.8, 0x3d7a3c]] as Array<[number, number, number]>) P.drum(b, M(x, floor, z), c);
  P.jerryCan(b, M(10.6, 0, hw + 1.6, 0, 0.5, 0));
  P.jerryCan(b, M(10.9, 0, hw + 1.3, 0, 1.1, 0), 0x3d7a3c);
  // ---- lean-to shed: yellow corner trims, front gable, corrugated roof, door + windows, chair + table inside
  const sh = S.SHED;
  const gz = sh.z1 - 0.12;
  { const gs = new THREE.Shape(); gs.moveTo(sh.x0, sh.eave); gs.lineTo(sh.x1, sh.eave); gs.lineTo((sh.x0 + sh.x1) / 2, sh.eave + sh.rise); gs.lineTo(sh.x0, sh.eave);
    const g = new THREE.ExtrudeGeometry(gs, { depth: 0.25, bevelEnabled: false }); g.translate(0, 0, -0.125);
    b.add(g, "gPlanksH", { m: M(0, 0, gz), uv: "box", tile: 3.2, uvRot: true, color: 0xc9ad8a }); }
  for (const [x, z] of [[sh.x0, sh.z1], [sh.x1, sh.z1], [sh.x1, sh.z0 + 0.15]]) b.add(rbox(0.2, sh.eave, 0.2, 0.03), "plaster", { m: M(x, sh.eave / 2 + 0.1, z), color: YEL });
  b.add(rbox(sh.x1 - sh.x0 + 0.2, 0.18, 0.12, 0.03), "plaster", { m: M((sh.x0 + sh.x1) / 2, sh.eave, sh.z1 + 0.02), color: YEL });
  const half = (sh.x1 - sh.x0) / 2, pitch = Math.atan2(sh.rise, half + 0.4), slen = Math.hypot(half + 0.4, sh.rise) + 0.12;
  for (const sg of [-1, 1]) {
    const cx = (sh.x0 + sh.x1) / 2 + sg * (half + 0.4) / 2;
    b.add(box(slen, 0.06, sh.z1 - sh.z0 + 0.9), "gCorr", { m: M(cx, sh.eave + sh.rise / 2 + 0.14, (sh.z0 + sh.z1) / 2 + 0.2, 0, 0, -sg * pitch), uv: "box", tile: 2.2, uvRot: true, color: 0xd6d1c8 });
    b.add(rbox(0.1, 0.22, sh.z1 - sh.z0 + 0.95, 0.02), "plaster", { m: M((sh.x0 + sh.x1) / 2 + sg * (half + 0.45), sh.eave - 0.02, (sh.z0 + sh.z1) / 2 + 0.2), color: YEL });
  }
  b.add(cyl(0.08, 0.08, sh.z1 - sh.z0 + 0.9, 6).rotateX(Math.PI / 2), "pmetal", { m: M((sh.x0 + sh.x1) / 2, sh.eave + sh.rise + 0.18, (sh.z0 + sh.z1) / 2 + 0.2), uv: "local", color: 0x77736a });
  // door (open outward) + window frames (yellow) with glass + sill; interior chair, table, lantern
  b.add(frameGeo(1.3, 2.3, 0.12, 0.34, false), "plaster", { m: M(sh.doorX, 0.2, gz), uv: "local", tile: 1, color: YEL });
  const dl = M(sh.doorX + 0.65, 0.2, gz + 0.15, 0, 2.0, 0);
  b.add(rbox(1.25, 2.25, 0.06, 0.02), "gPlanksH", { m: mul(dl, M(-0.625, 1.13, 0)), uv: "box", tile: 2.5, uvRot: true, color: 0xb49774 });
  for (const [wx, wz, yaw] of [[sh.winX, gz, 0], [sh.x1 - 0.12, sh.z1 - 2.4, Math.PI / 2]] as Array<[number, number, number]>) {
    const wm = M(wx, 1.1, wz, 0, yaw, 0);
    b.add(frameGeo(1.2, 1.0, 0.1, 0.32, false), "plaster", { m: wm, uv: "local", tile: 1, color: YEL });
    b.add(shapeGeo(rectShape(1.2, 1.0)), "glass", { m: mul(wm, M(0, 0, -0.02)), uv: "keep", shadow: false });
    b.add(rbox(1.5, 0.08, 0.3, 0.02), "wood", { m: mul(wm, M(0, -0.05, 0.12)), color: 0x6a4a30 });
  }
  // (the shed is furnished by the interiors kit)
  glows.push(P.wallLamp(b, M(sh.doorX + 1.1, 2.4, sh.z1, 0, 0, 0)).applyMatrix4(b.frame));
  b.setFrame(0, 0, 0, 0); bNear.setFrame(0, 0, 0, 0);
}
