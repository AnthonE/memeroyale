// THE PLANTATION — the planter's farmhouse, the packing-line cover inside the barn, the barn roof stair, the
// water-tower stair, the cottages' rain barrel + woodshed: every piece drawn at EXACTLY its shared collider
// (shared/pois/the-plantation.ts FARM_LOCAL, BARN_COVER, BARN_ROOFSTAIR, WT_STAIR, COT_OUT).
import * as THREE from "three";
import * as S from "../../../../../shared/pois/the-plantation";
import { Batch, M, box, rbox, cyl, sph, addPieces, dressOpenings, frameGeo } from "../_kit/coast-kit";
import * as P from "../_kit/coast-props";
import { textDecal } from "../_kit/coast-sign";
import { crateBlock, drawRails, h01, openStair, plate, stairTreads } from "../peel-strip/coast-dress";
import { scaleDesk, strawBale, timberStair, washTrough } from "../peel-strip/hero-props";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
const WHITE = 0xf3eee2, SIDING = 0xf1e9d6, SHUTTER = 0x3f7a5a, TRIM = 0xf7f3ea;

/** a gable triangle (width w at the eave, rise h, thickness t) with a rectangular window hole [x0, x1] × [y0, y1] */
function gableHole(w: number, h: number, t: number, hole: [number, number, number, number]) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
  const p = new THREE.Path(), [a, b2, c, d] = hole;
  p.moveTo(a, c); p.lineTo(a, d); p.lineTo(b2, d); p.lineTo(b2, c); p.lineTo(a, c);
  s.holes.push(p);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}

// ------------------------------------------------------------------------------------------------ farmhouse
export function buildFarmhouse(b: Batch, bMid: Batch, bNear: Batch, glows: THREE.Vector3[]) {
  const H = S.FARM, f = H.frame, { hx, hz, t, f0, f1, f2 } = H, O = S.FARM_OPEN;
  for (const q of [b, bMid, bNear]) q.setFrame(f.x, f.y, f.z, f.yaw);
  addPieces(b, S.FARM_LOCAL, {
    "fh:floor": { mat: "stone", color: 0xb7ad9c, tile: 1.6 },
    "fh:porch": { mat: "deck", color: 0xb8936a, tile: 1.8 },
    "fh:pstep": { mat: "stone", color: 0xbdb3a2, tile: 1.2, round: 0.03 },
    "fh:wall": { mat: "gSiding", color: SIDING, tile: 2.4, ao: true },
    "fh:floor1": { mat: "deck", color: 0xa47e56, tile: 2 },
    "fh:floor2": { mat: "deck", color: 0x9c7a56, tile: 2 },
    "fh:step": { mat: "plaster", color: 0xeadfc8, tile: 1.2 },
    "fh:step2": { mat: "wood", skip: true }, // open-riser attic stair (timberStair below)
    "fh:closet": { mat: "gPlanksH", color: 0xb49774, tile: 2.0, uvRot: true },
    "fh:part": { mat: "plaster", color: 0xeadfc8, tile: 2.5 },
    "fh:knee": { mat: "gPlanksH", color: 0xb49774, tile: 2.2, uvRot: true },
    "fh:chimney": { mat: "brick", color: 0xffffff, tile: 1.4 },
    "fh:roof": { mat: "gTiles", color: 0xffffff, tile: 2.2 },
    "fh:balc": { mat: "deck", color: 0xb8936a, tile: 1.8 },
    "fh:parapet": { mat: "gSiding", color: WHITE, tile: 2.2 },
    "fh:gable": { mat: "gSiding", skip: true }, "fh:post": { mat: "wood", skip: true }, "fh:crate": { mat: "wood", skip: true }, "fh:trunk": { mat: "wood", skip: true },
    rail: { mat: "wood", skip: true },
  }, 0);
  // gables with the attic window (the collider leaves [-0.5, 0.5] × [f2 + 0.6, f2 + 1.6] open)
  const rise = hz * Math.tan(H.pitch);
  for (const sx of [-1, 1]) {
    const gm = M(sx * (hx - t / 2), H.eave, 0, 0, sx * Math.PI / 2, 0);
    b.add(gableHole(2 * hz, rise, t, [-0.5, 0.5, f2 + 0.6 - H.eave, f2 + 1.6 - H.eave]), "gSiding", { m: gm, uv: "local", tile: 2.4, color: SIDING });
    b.add(frameGeo(1.0, 1.0, 0.1, t + 0.08, false), "wood", { m: mul(gm, M(0, f2 + 0.6 - H.eave, 0)), uv: "local", tile: 1, color: TRIM });
    b.add(box(0.98, 0.98, 0.02), "glass", { m: mul(gm, M(0, f2 + 1.1 - H.eave, 0)), shadow: false });
    b.add(rbox(2 * hz + 0.2, 0.2, 0.1, 0.02), "wood", { m: mul(gm, M(0, 0.1, t / 2 + 0.03)), color: TRIM });
  }
  // attic side of the roof: plank sarking + rafters every 0.9 m (the tiles' underside read as red tiles from inside)
  for (const p of S.FARM_LOCAL) {
    if (p.k !== "fh:roof" || p.col) continue;
    const m = M(p.c[0], p.c[1], p.c[2], p.pitch ?? 0, p.yaw ?? 0, 0);
    bNear.add(box(p.h[0] * 2 - 1.1, 0.03, p.h[2] * 2 - 0.2), "deck", { m: mul(m, M(0, -p.h[1] - 0.02, 0)), tile: 1.6, color: 0x9a7a58 });
    for (let x = -p.h[0] + 0.7; x < p.h[0] - 0.6; x += 0.9) bNear.add(box(0.08, 0.14, p.h[2] * 2 - 0.3), "wood", { m: mul(m, M(x, -p.h[1] - 0.1, 0)), color: 0x6e5238 });
  }
  // eave fascia + rake boards + ridge cap
  const run = hz + H.over, cy = H.eave + (hz - run / 2) * Math.tan(H.pitch);
  for (const s of [-1, 1]) {
    b.add(rbox(2 * hx + 1.1, 0.22, 0.08, 0.02), "wood", { m: M(0, H.eave - (H.over) * Math.tan(H.pitch) + 0.1, s * (hz + H.over)), color: TRIM });
    for (const e of [-1, 1]) b.add(rbox(0.1, 0.24, run / Math.cos(H.pitch) + 0.05, 0.02), "wood", { m: M(e * (hx + 0.52), cy + 0.2, s * run / 2, s * H.pitch, 0, 0), color: TRIM });
  }
  b.add(cyl(0.13, 0.13, 2 * hx + 1.1, 10).rotateZ(Math.PI / 2), "clay", { m: M(0, H.eave + rise + 0.32, 0), uv: "local", color: 0xa84a36 });
  // openings: white frames, glass, sills, green shutters, open doors
  // (no mullion cross — the panes break and you vault through; a cross left standing in a smashed
  // window is what you would clip through)
  const od = { frame: TRIM, frameW: 0.1, glass: "glass" as const, mullions: false, sill: TRIM, leaf: 0x3f6f5a, swing: -1.3 };
  const oo = (a: ReadonlyArray<{ u: number; w: number; y0: number; h: number }>, dy = 0) => a.map((q) => ({ ...q, y0: q.y0 + dy }));
  const walls = (y0: number, fr: typeof O.front0, bk: typeof O.back0, rt: typeof O.right0, lf: typeof O.left0, dy: number) => {
    const lines: Array<[number, number, number, number, typeof O.front0]> = [[-hx, hz - t / 2, hx, hz - t / 2, fr], [hx, -hz + t / 2, -hx, -hz + t / 2, bk], [hx - t / 2, hz - t, hx - t / 2, -hz + t, rt], [-hx + t / 2, -hz + t, -hx + t / 2, hz - t, lf]];
    for (const [li, [x0, z0, x1, z1, ops]] of lines.entries()) {
      // (the leaves swing as their colliders do — S.FARM_SWING: front onto the veranda, back flat to the wall)
      dressOpenings(b, x0, z0, x1, z1, y0, oo(ops, dy), t, { ...od, swing: li < 2 ? S.FARM_SWING[li] : od.swing });
      // shutters beside each window (outer face)
      const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = uz, nz = -ux, yaw = Math.atan2(-uz, ux);
      for (const q of oo(ops, dy)) {
        if (q.y0 < 0.05) continue;
        for (const s of [-1, 1]) {
          const u = q.u + s * (q.w / 2 + 0.3), x = x0 + ux * u + nx * (t / 2 + 0.04), z = z0 + uz * u + nz * (t / 2 + 0.04);
          b.add(rbox(0.5, q.h + 0.06, 0.04, 0.012), "wood", { m: M(x, y0 + q.y0 + q.h / 2, z, 0, yaw, 0), color: SHUTTER, lod: 0 });
          for (let k = 1; k < 5; k++) bNear.add(box(0.44, 0.02, 0.02), "wood", { m: M(x + nx * 0.02, y0 + q.y0 + (k / 5) * q.h, z + nz * 0.02, 0, yaw, 0), color: 0x2f5f46 });
        }
      }
    }
  };
  walls(f0, O.front0, O.back0, O.right0, O.left0, 0);
  walls(f1 - 0.3, O.front1, O.back1, O.right1, O.left1, 0.3);
  // corner boards + floor band
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(rbox(0.18, H.eave - f0 + 0.02, 0.18, 0.02), "wood", { m: M(sx * (hx - 0.05), (H.eave + f0) / 2, sz * (hz - 0.05)), color: TRIM });
  for (const s of [-1, 1]) b.add(box(2 * hx + 0.06, 0.2, 0.04), "wood", { m: M(0, f1 - 0.2, s * (hz + 0.02)), color: TRIM });
  // veranda posts (turned, white) with brackets; balcony cap rail
  for (const x of [-hx + 0.2, -2.2, 2.2, hx - 0.2]) {
    const z = hz + H.porch - 0.17;
    b.add(rbox(0.26, f1 - 0.3 - f0, 0.26, 0.04), "wood", { m: M(x, (f1 - 0.3 + f0) / 2, z), color: WHITE });
    b.add(rbox(0.36, 0.14, 0.36, 0.03), "wood", { m: M(x, f0 + 0.07, z), color: WHITE });
    for (const s of [-1, 1]) if (Math.abs(x + s * 0.5) < hx) P.strut(bMid, [x, f1 - 1.0, z], [x + s * 0.55, f1 - 0.35, z], 0.04, WHITE, new THREE.Matrix4(), "wood");
  }
  b.add(rbox(2 * hx + 0.1, 0.08, 0.2, 0.02), "wood", { m: M(0, f1 + 1.04, hz + H.porch - 0.07), color: TRIM });
  // chimney cap + pots, a fireplace mouth on the ground floor
  const C = H.chimney;
  b.add(rbox(C.x1 - C.x0 + 0.16, 0.14, C.z1 - C.z0 + 0.16, 0.02), "stone", { m: M((C.x0 + C.x1) / 2, C.top + 0.07, (C.z0 + C.z1) / 2), color: 0xb0a898 });
  for (const s of [-1, 1]) b.add(cyl(0.1, 0.13, 0.4, 10), "clay", { m: M((C.x0 + C.x1) / 2 + s * 0.22, C.top + 0.34, (C.z0 + C.z1) / 2), uv: "local", color: 0xb2583c });
  bNear.add(box(0.02, 0.7, 0.6), "darkGlass", { m: M(C.x0 - 0.011, f0 + 0.4, (C.z0 + C.z1) / 2), color: 0x201814 });
  // attic: crates + an old trunk (their colliders), a hanging lamp
  for (const [x0, z0, x1, z1, h, k, y0] of S.FARM_FURN) {
    if (k === "fh:crate") crateBlock(bMid, x0, y0, z0, x1, y0 + h, z1, Math.round(x0 * 10), { lod: 2 });
    else if (k === "fh:trunk") {
      bNear.add(rbox(x1 - x0, h * 0.75, z1 - z0, 0.03), "wood", { m: M((x0 + x1) / 2, y0 + h * 0.375, (z0 + z1) / 2), color: 0x6a3f24 });
      bNear.add(lathe2(x1 - x0, h * 0.25, z1 - z0), "wood", { m: M((x0 + x1) / 2, y0 + h * 0.75, (z0 + z1) / 2), color: 0x5a3520 });
      for (const s of [-0.3, 0.3]) bNear.add(box(0.05, h + 0.01, z1 - z0 + 0.01), "steel", { m: M((x0 + x1) / 2 + s * (x1 - x0), y0 + h / 2, (z0 + z1) / 2), color: 0x3a3430 });
    }
  }
  bNear.add(sph(0.12, 10, 8), "lamp", { m: M(0, H.eave + 1.2, 0) });
  // porch: a swing seat, a lamp by the door, a nameplate
  // (no loose bench on the veranda: it had no collider)
  glows.push(P.wallLamp(b, M(1.1, f0 + 2.2, hz)).applyMatrix4(b.frame));
  plate(bNear, "PLANTER'S HOUSE", 1.6, 0.26, M(-1.4, f0 + 2.1, hz + 0.02), "#2d4a36", "#f3eee2");
  drawRails(b, S.FARM_LOCAL, { color: 0x6a4a30, mat: "wood" });
  stairTreads(bNear, S.FARM_LOCAL, "fh:step", { color: 0x7a5434 });
  // an open-riser timber stair on its tread colliders — plank
  // treads with nosings, two stringers, a hand rail on the open side — over a boarded cupboard with a little door
  {
    const tr: Array<[number, number, number, number, number, number]> = [];
    const P0 = S.FARM_LOCAL;
    for (let k = 0; k + 1 < P0.length; k++) if (P0[k].k === "fh:step2" && P0[k + 1].k === "step:col") { const q = P0[k + 1]; tr.push([q.c[0], q.c[1] + q.h[1], q.c[2], q.h[0], q.h[2] - 0.01, q.yaw ?? 0]); }
    timberStair(b, bNear, tr, { railSide: 1, color: 0x9a6a40 });
    const S2 = H.stair2;
    bNear.add(rbox(0.6, 1.05, 0.04, 0.01), "wood", { m: M(S2.x1 + 0.005, f1 + 0.55, (S2.z0 + S2.z0 + 1.6) / 2, 0, Math.PI / 2, 0), color: 0x6e5238 });
    bNear.add(sph(0.025, 6, 4), "chrome", { m: M(S2.x1 + 0.03, f1 + 0.55, S2.z0 + 1.0), color: 0xd8b25a });
  }
  for (const q of [b, bMid, bNear]) q.setFrame(0, 0, 0, 0);
}
/** a half-cylinder trunk lid (w along x, rise h, depth d) */
function lathe2(w: number, h: number, d: number) {
  const g = new THREE.CylinderGeometry(d / 2, d / 2, w, 12, 1, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2); g.scale(1, (2 * h) / d, 1);
  return g;
}

// ------------------------------------------------------------------------------------------------ barn interior cover
/** the packing line, drawn at BARN_COVER (every table / tank / crate has a collider) */
export function buildBarnCover(b: Batch, n: Batch) {
  const f = S.BARN.frame;
  b.setFrame(f.x, f.y, f.z, f.yaw); n.setFrame(f.x, f.y, f.z, f.yaw);
  S.BARN_COVER.forEach(([x0, z0, x1, z1, h, k, y0 = 0.2], i) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, top = y0 + h;
    if (k === "crates") crateBlock(b, x0, y0, z0, x1, top, z1, 200 + i, { lod: 2 });
    else if (k === "bn:table") {
      // sorting bench: plank top on a boarded base (solid: it is cover), heaped with green hands
      b.add(rbox(w + 0.1, 0.08, d + 0.1, 0.02), "wood", { m: M(cx, top - 0.04, cz), color: 0x9a7650, lod: 2 });
      b.add(box(w - 0.1, h - 0.08, d - 0.1), "gPlanksH", { m: M(cx, y0 + (h - 0.08) / 2, cz), tile: 1.6, uvRot: true, color: 0xa88a66, lod: 2 });
      for (let q = 0; q < Math.floor(d / 1.3); q++) P.bananaHeap(n, M(cx, top, z0 + 0.65 + q * 1.3), w - 0.3, 1.0, 3, 300 + i * 9 + q, 0.08);
    } else if (k === "bn:tank") {
      // galvanised troughs on angle-iron legs, rolled rims, taps
      // on a supply pipe, water with floating hands (long axis = barn z)
      washTrough(n, n, M(cx, y0, cz, 0, Math.PI / 2, 0), d, w, h, 400 + i);
    } else if (k === "bn:bins") {
      b.add(rbox(w, h, d, 0.03), "gPlanksH", { m: M(cx, y0 + h / 2, cz), tile: 1.6, uvRot: true, color: 0xc49a6a, lod: 2 });
      textDecal(n, "THE FEED", Math.min(1.6, w - 0.2), 0.3, M(cx, y0 + h * 0.55, z1 + 0.012), { fg: "#8a2418", bg: null, font: 900, stencil: true });
      P.bananaHeap(n, M(cx, top - 0.05, cz), w - 0.2, d - 0.2, 4, 500 + i, 0.14);
    } else if (k === "bn:desk") {
      // a timber desk carrying a cast-iron platform scale
      // with a dial head on its column (the head = the "bn:scalehead" box), a sack + hands on the platform, a ledger
      scaleDesk(n, n, M(cx, y0, cz), w, d, h + 1.0, { top: h });
    } else if (k === "bn:scalehead") {
      // (drawn with the desk)
    } else if (k === "bn:hay") {
      // strapped straw bales (streaky stalks, bulged sides, twine, a loose
      // fringe at the cut ends) in courses filling the box; alternate courses turned 90°
      const nx = Math.max(1, Math.round(w / 1.2)), nz = Math.max(1, Math.round(d / 0.6)), ny = Math.max(1, Math.round(h / 0.5));
      for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) for (let yy = 0; yy < ny; yy++) {
        const bw = w / nx, bd = d / nz, bh = h / ny, s = i * 37 + a * 5 + c * 3 + yy;
        const bx = x0 + bw * (a + 0.5), bz = z0 + bd * (c + 0.5), by = y0 + bh * yy;
        strawBale(n, n, M(bx, by, bz, 0, Math.PI / 2 + (h01(s) - 0.5) * 0.03, 0), bd, bh, bw, s);
      }
    }
  });
  b.setFrame(0, 0, 0, 0); n.setFrame(0, 0, 0, 0);
}

// ------------------------------------------------------------------------------------------------ stairs + small props
/** barn roof stair + landings, water-tower stair + landing, their rails; cottage rain barrels + woodsheds */
export function buildAccess(b: Batch, bMid: Batch, bNear: Batch) {
  // barn roof stair (barn frame)
  const bf = S.BARN.frame;
  b.setFrame(bf.x, bf.y, bf.z, bf.yaw);
  addPieces(b, S.BARN_LOCAL.filter((p) => p.k === "bn:rland"), { "bn:rland": { mat: "pmetal", color: 0x56616a, tile: 1.2, round: 0.02 } });
  openStair(b, S.BARN_LOCAL, "bn:rstep", { mat: "pmetal", color: 0x6b7680, stringer: 0x3a4046, thick: 0.06 });
  // stringers + support posts under the landings
  const R = S.BARN_ROOFSTAIR, xc = R.x + R.w / 2;
  for (const [z, y] of [[R.zMid0, R.mid], [R.zTop0, R.top]] as Array<[number, number]>) for (const dx of [-R.w / 2 + 0.05, R.w / 2 - 0.05]) b.add(box(0.1, y - 0.25, 0.1), "pmetal", { m: M(xc + dx, (y - 0.25) / 2, z + 0.1), color: 0x3a3a3a });
  drawRails(b, S.BARN_LOCAL, { color: 0x2f3438 });
  b.setFrame(0, 0, 0, 0);
  // water-tower stair (world pieces)
  addPieces(b, S.PIECES.filter((p) => p.k === "wt:land"), { "wt:land": { mat: "deck", color: 0x9c7852, tile: 1.4 } });
  openStair(b, S.PIECES, "wt:step", { color: 0x9c7852 });
  const W = S.WTOWER, wm = M(W.x, S.PAD.y, W.z, 0, W.yaw, 0), SW = S.WT_STAIR;
  for (const z of [SW.z0 - 1.5, (SW.z0 + SW.zTop) / 2, SW.zTop + 0.3]) {
    const y = W.legH * (SW.z0 - z) / (SW.z0 - SW.zTop);
    for (const x of [SW.x0 + 0.06, SW.x1 - 0.06]) b.add(box(0.12, Math.max(0.2, y - 0.1), 0.12), "wood", { m: mul(wm, M(x, Math.max(0.1, y - 0.1) / 2, z)), color: 0x6a4428 });
  }
  drawRails(b, S.PIECES.filter((p) => Math.hypot(p.c[0] - W.x, p.c[2] - W.z) < 9), { color: 0x6a4a30, mat: "wood" });
  // cottages: rain barrel + woodshed (the parkour route onto the eave), drawn at COT_OUT
  for (const [ci, c] of S.COTTAGES.entries()) {
    bMid.setFrame(c.f.x, c.f.y, c.f.z, c.f.yaw); bNear.setFrame(c.f.x, c.f.y, c.f.z, c.f.yaw);
    for (const [x0, z0, x1, z1, h, k] of S.COT_OUT) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
      if (k === "ct:barrel") {
        bMid.add(cyl(w / 2 - 0.02, w / 2 - 0.05, h, 16), "gStaves", { m: M(cx, h / 2, cz), uv: "local", tile: 1, color: 0x9a7048 });
        for (const y of [0.15, h - 0.15]) bMid.add(cyl(w / 2, w / 2, 0.04, 16, true), "steel", { m: M(cx, y, cz), uv: "local", color: 0x4a4038 });
        bNear.add(cyl(w / 2 - 0.06, w / 2 - 0.06, 0.02, 16), "darkGlass", { m: M(cx, h - 0.05, cz), color: 0x4f7f90 });
      } else if (k === "ct:woodshed") {
        // log store: 4 posts, a plank back, a lean-to plank roof (its top = the step onto the eave), split logs
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) bMid.add(box(0.1, h - 0.06, 0.1), "wood", { m: M(cx + sx * (w / 2 - 0.05), (h - 0.06) / 2, cz + sz * (d / 2 - 0.05)), color: 0x6a4a30 });
        bMid.add(rbox(w + 0.02, 0.08, d + 0.02, 0.02), "gPlanksH", { m: M(cx, h - 0.04, cz), tile: 1.4, color: 0x8a6a48 });
        bMid.add(box(0.04, h - 0.1, d), "gPlanksH", { m: M(cx + w / 2 - 0.02, (h - 0.1) / 2, cz), tile: 1.4, uvRot: true, color: 0x9a7a58 });
        for (let row = 0; row < 5; row++) for (let q = 0; q < 6; q++) {
          const g = cyl(0.1, 0.1, w - 0.2, 7); g.rotateZ(Math.PI / 2);
          bNear.add(g, "wood", { m: M(cx - 0.05, 0.12 + row * 0.19, z0 + 0.2 + q * (d - 0.4) / 5 + (row % 2) * 0.08), uv: "local", tile: 0.5, color: new THREE.Color(0xb08050).multiplyScalar(0.85 + h01(ci * 50 + row * 6 + q) * 0.25) });
        }
      }
    }
  }
  bMid.setFrame(0, 0, 0, 0); bNear.setFrame(0, 0, 0, 0);
}
