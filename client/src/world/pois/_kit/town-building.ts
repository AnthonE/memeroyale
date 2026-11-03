// poi-town modular building: visuals derived from the SAME resolved parts the server colliders use
// (shared/pois/town-kit.ts). Plaster walls with openings + deep reveals, chunky bevelled trims (architraves, sills,
// string courses, cornices, quoins, plinth), louvred shutters, flower boxes, doors, shop fronts with roll-up
// shutters, wooden balconies with balusters + planters, corrugated tin awnings on brackets/posts, striped canvas
// awnings, flat roofs with parapet + coping + rooftop dressing (tanks, AC, bulkhead, pipes, vents, lines) or gable
// corrugated-tin roofs (rafters, fascia, ridge cap, gable vents), downpipes, signage and simple furnished interiors.
// Every piece goes into the POI's merged material bins (vertex-colour tinted).
import * as THREE from "three";
import { type BuildingParts, type TownBuilding, type RoofProp, STAIR_GUARD_H, slabPieces, awningPostUs, stairZone, openingHash, windowClosed, hasQuoins, shutterLeaves, DOOR_SWING, FRENCH_SWING, bulkLeaf } from "../../../../../shared/pois/town-kit";
import { M, boxGeo, cylGeo, latheGeo, quadGeo, col, groundAO, eaveAO, combine, corrugatedGeo, rustFn, noise3, chamferBoxGeo, leafClumpGeo, mediumDetail, lowDetail, type ColorFn, type GeoBin } from "./town-geo";
import { mulberry } from "../../../../../shared/pois/town-kit";
import { FACADE } from "./town-tex";
import { fruitSink, fruitMound } from "./town-fruit";
import { bananaHand, addStool } from "./town-resort";
import { addSack, addWaterTank, addACUnit, addPot } from "./town-market";
import type { TownBins, TownMats } from "./town-materials";

const DEG = Math.PI / 180;
const _hsl = { h: 0, s: 0, l: 0 };
function paintBright(c: string): THREE.Color { const o = col(c); o.getHSL(_hsl); return o.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.08), Math.min(0.78, _hsl.l * 1.2)); }

export interface BuildOpts {
  /** interior furniture (default from spec, true) */
  interior?: boolean;
  /** the rooms are furnished by the shared interiors kit (town-interiors.ts) — skip the built-in furniture */
  kitFurniture?: boolean;
  /** add roof dressing (default true) */
  dressing?: boolean;
  /** list of sign meshes to attach (returned so the POI adds them to the group) */
  extra: THREE.Object3D[];
  /** detail tier: 2 = hero (plaza / camera), 1 = mid, 0 = far (plain trims, sparser balusters, no flower boxes) */
  lod?: 0 | 1 | 2;
  /** optional hook to draw a rooftop prop with a better asset kit; return true when handled */
  roofProp?: (bins: TownBins, at: THREE.Matrix4, prop: RoofProp, rng: () => number) => boolean;
  /** detail bins (TownLod near level): floors, ceilings, stairs, wall linings, flower boxes, lamps */
  near?: TownBins;
  /** finest bins (TownLod fine level, ~45 m): furniture + room dressing */
  fine?: TownBins;
}

const WOOD_BAL = "#8b5a30", WOOD_DARK = "#5b3c1e", IRON = "#2b2f33";
const FLOWERS = ["#e0402f", "#f06a8a", "#f2b233", "#e8483a", "#d9365a", "#ffffff"];

// shared low-poly pieces (instanced into the bins as geometry copies)
const blob0 = new THREE.IcosahedronGeometry(1, 0);
const blob1 = new THREE.IcosahedronGeometry(1, 1);

export function addBuilding(bins: TownBins, mats: TownMats, p: BuildingParts, o: BuildOpts) {
  // perf: below hero detail the whole building (incl. its rooftop kit) is built in MEDIUM detail — plain boxes
  // instead of bevels, ~60 % segments, nothing under 3 cm — it is only ever seen from > ~15 m at these tiers
  if ((o.lod ?? 2) < 2) { mediumDetail(() => addBuildingFull(bins, mats, p, o)); return; }
  addBuildingFull(bins, mats, p, o);
}
function addBuildingFull(bins: TownBins, mats: TownMats, p: BuildingParts, o: BuildOpts) {
  const { b, t, floorH, H } = p;
  const rng = p.rng;
  const nb = o.near ?? bins;
  const base = new THREE.Matrix4().makeRotationY(b.yaw).setPosition(b.x, 0, b.z);
  const L = (lx: number, ly: number, lz: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => base.clone().multiply(M(lx, ly, lz, yaw, pitch, roll, sx, sy, sz));
  const plasterish = b.material !== "clapboard" && b.material !== "stone";
  const wallBin: GeoBin = b.material === "clapboard" ? bins.clapboard : b.material === "stone" ? bins.stone : bins.plaster;
  // (painted clapboard reads ~20 % brighter + a touch more saturated — the huts stay candy-bright even in
  // the porch shade; the board grooves + texture already darken it)
  const wallCol = b.material === "clapboard" ? paintBright(b.wall) : col(b.wall), trimCol = col(b.trim), shutterCol = col(b.shutter ?? "#3b4a3a"), doorCol = col(b.door ?? b.shutter ?? "#6b4a2b");
  const plinthCol = col(b.plinth ?? b.wall).lerp(new THREE.Color("#8a7a66"), 0.35).multiplyScalar(0.8);
  const tone = 1 + (rng() - 0.5) * 0.08;
  // walls: contact grime at the base, darker under the cornice, sun-bleached toward the top, blotchy weathering
  const wallFn: ColorFn = combine(groundAO(b.y, 1.4, 0.7), eaveAO(b.y + H, 0.5, 0.88), (x, y, z, bb, out) => {
    const n = noise3(x * 0.35, y * 0.5, z * 0.35);
    out.multiplyScalar(tone * (0.93 + 0.12 * n) * (1 + 0.04 * Math.min(1, (y - b.y) / Math.max(1, H))));
  });
  const trimFn: ColorFn = combine(groundAO(b.y, 0.8, 0.75), (x, y, z, bb, out) => out.multiplyScalar(0.94 + 0.08 * noise3(x * 0.9, y * 0.9, z * 0.9)));
  const uvo = (): [number, number] => [rng() * 3, rng() * 3];
  const lod = o.lod ?? 2;
  /** bevelled box at high detail, plain box when far (bevels ≥ `keep` survive at lod 1) */
  // bevelled trims only on hero buildings (lod 2); plain boxes elsewhere (44 → 12 tris a piece)
  const BB = (bin: GeoBin, w: number, h: number, d: number, m: THREE.Matrix4, c: THREE.Color, bev: number, fn?: ColorFn, keep = 0.035) => {
    void keep;
    if (lod >= 2) bin.bbox(w, h, d, m, c, bev, fn); else bin.box(w, h, d, m, c, [0, 0], fn);
  };
  // corrugated tin: real ribs on hero buildings, a flat normal-mapped sheet elsewhere (real ribs cost ~26 tris per 10 cm)
  const tinGeo = (w: number, l: number) => lod >= 2 ? corrugatedGeo(w, l, 0.076, 0.018, 2) : flatSheet(w, l);
  curLod = lod;
  const quoins = hasQuoins(b); // (deterministic — the corner quoins collide, town-kit openingFill)
  const shutterMode = b.shutters ?? "mixed";
  const flowerP = b.flowers ?? 0.35;

  // ---------- walls, openings
  for (const w of p.walls) {
    const th = Math.atan2(-w.dir[1], w.dir[0]);
    // piece frame: local +x along the wall, +z = OUTWARD; `off` > 0 moves inward
    const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
    for (let f = 0; f < b.floors; f++) {
      const fy = b.y + f * floorH;
      for (const pc of w.pieces[f]) {
        const yc = fy + pc.y, hh = pc.h;
        if (f === 0 && pc.y < 0.55 && plasterish) {
          const ph = Math.min(0.55, hh) - pc.y;
          BB(bins.plaster, pc.w, ph, t + 0.05, at(pc.u + pc.w / 2, yc + ph / 2, t / 2 - 0.025), plinthCol, 0.025, trimFn);
          if (hh - ph > 0.01) wallBin.box(pc.w, hh - ph, t, at(pc.u + pc.w / 2, yc + ph + (hh - ph) / 2, t / 2), wallCol, uvo(), wallFn);
        } else wallBin.box(pc.w, hh, t, at(pc.u + pc.w / 2, yc + hh / 2, t / 2), wallCol, uvo(), wallFn);
      }
      for (const op of w.openings[f]) addOpening(bins, mats, b, p, at, op, fy, f, { trimCol, shutterCol, doorCol, trimFn, shutterMode, flowerP: lod === 2 ? flowerP : lod === 1 ? flowerP * 0.5 : 0, t, rng, uvo, extra: o.extra, BB, lod, near: nb, front: w.side === p.front, wlen: w.len, sibs: w.openings[f] });
    }
    if (plasterish) {
      // string courses between floors, chunky two-step cornice at the top of flat-roof buildings
      for (let f = 1; f < b.floors; f++) BB(bins.trim, w.len + 0.14, 0.16, 0.12, at(w.len / 2, b.y + f * floorH - 0.02, -0.03), trimCol, 0.035, trimFn);
      if (p.roof.kind === "flat") {
        BB(bins.trim, w.len + 0.2, 0.2, 0.14, at(w.len / 2, b.y + H - 0.12, -0.05), trimCol, 0.04, trimFn);
        BB(bins.trim, w.len + 0.34, 0.12, 0.24, at(w.len / 2, b.y + H + 0.04, -0.1), trimCol, 0.04, trimFn);
      }
      if (quoins) BB(bins.trim, 0.36, H - 0.5, 0.36, at(0, b.y + 0.5 + (H - 0.5) / 2, 0.03), trimCol, 0.04, trimFn);
    }
  }

  // ---------- floors / ceilings (detail bins: drawn only near the building) — interior finishes, not exterior paving
  const hasInt = (o.interior ?? b.interior ?? true) && b.w > 4.2 && b.d > 4.2;
  const inkR = mulberry(Math.floor(rng() * 1e9));
  const INNER = ["#f3ead6", "#e9f0e6", "#f5e6c8", "#f2dcd4", "#e3eef0", "#f6efe0"];
  const innerCol = col(INNER[Math.floor(inkR() * INNER.length)], 0.8);
  const shopFloor = col(["#c98a5e", "#b8b09c", "#d6a26e"][Math.floor(inkR() * 3)]);
  for (const s of p.slabs) {
    const holes = p.holes.filter((h) => h.floor === s.floor);
    const rects = slabPieces(s.x0 + t * 0.5, s.z0 + t * 0.5, s.x1 - t * 0.5, s.z1 - t * 0.5, holes);
    const isRoof = s.floor === b.floors && p.roof.kind === "flat";
    const isCeilOnly = s.floor === b.floors && p.roof.kind !== "flat";
    for (const r of rects) {
      const w = r[2] - r[0], d = r[3] - r[1], cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
      const top = s.floor === 0 ? s.y + 0.05 : s.y;
      if (s.floor === 0 && b.material === "clapboard") nb.woodDark.box(w, 0.12, d, L(cx, s.y - 0.04, cz), col("#a97d4e"), uvo());
      else if (s.floor === 0) {
        // ground floor: terracotta / stone tiles in shops, boards in homes
        if (b.shop) nb.stone.box(w, s.t + 0.05, d, L(cx, top - (s.t + 0.05) / 2, cz), shopFloor, uvo());
        else nb.wood.box(w, s.t + 0.05, d, L(cx, top - (s.t + 0.05) / 2, cz), col("#b0804e"), uvo());
      } else if (isRoof) {
        // roof deck (main bins — seen from every rooftop): bitumen/concrete with patches, and a clean ceiling under it
        bins.stone.box(w, s.t, d, L(cx, top - s.t / 2, cz), col("#b9aa92"), uvo(), (x, y, z, bb, out) => { const n = noise3(x * 0.45, 0, z * 0.45), m = noise3(x * 1.7 + 3, 1, z * 1.7); out.multiplyScalar(0.88 + 0.16 * n); if (m > 0.66) out.lerp(new THREE.Color("#6f6a62"), 0.45); });
        if (hasInt) nb.inner.box(w, 0.02, d, L(cx, top - s.t - 0.011, cz), innerCol.clone().multiplyScalar(0.92), uvo());
      } else if (isCeilOnly) {
        nb.inner.box(w, s.t, d, L(cx, top - s.t / 2, cz), innerCol.clone().multiplyScalar(0.92), uvo());
      } else {
        nb.woodDark.box(w, 0.06, d, L(cx, top - 0.03, cz), col("#b98b58"), uvo());
        nb.inner.box(w, s.t - 0.06, d, L(cx, top - 0.06 - (s.t - 0.06) / 2, cz), innerCol.clone().multiplyScalar(0.92), uvo());
      }
    }
    for (const h of holes) {
      nb.woodDark.box(h.x1 - h.x0, 0.12, 0.08, L((h.x0 + h.x1) / 2, s.y + 0.06, h.z0 - 0.04), col("#8a6a44"));
      nb.woodDark.box(h.x1 - h.x0, 0.12, 0.08, L((h.x0 + h.x1) / 2, s.y + 0.06, h.z1 + 0.04), col("#8a6a44"));
    }
  }
  // interior wall lining: a clean painted skin on the inner face of every solid wall piece (darker toward floor +
  // ceiling = cheap interior AO; without it the rooms show the weathered exterior plaster inside)
  if (hasInt && b.material !== "clapboard") for (const w of p.walls) {
    const th = Math.atan2(-w.dir[1], w.dir[0]);
    const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
    for (let f = 0; f < b.floors; f++) {
      const fy = b.y + f * floorH, top = fy + floorH;
      const ao: ColorFn = (x, y, z, bb, out) => { const a = Math.min(1, (y - fy) / 0.7), c = Math.min(1, (top - y) / 0.9); out.multiplyScalar(0.86 + 0.14 * Math.min(a, c)); };
      const fbl = o.fine ?? nb;
      for (const pc of w.pieces[f]) fbl.inner.box(pc.w, pc.h, 0.02, at(pc.u + pc.w / 2, fy + pc.y + pc.h / 2, t + 0.011), innerCol, uvo(), ao);
      // skirting board
      for (const pc of w.pieces[f]) if (pc.y < 0.05) fbl.woodDark.box(pc.w, 0.1, 0.025, at(pc.u + pc.w / 2, fy + (f === 0 ? 0.1 : 0.05), t + 0.02), col("#6e4f30"));
    }
  }

  // ---------- stairs: solid treads + risers (one bevelled block per step) + handrail — in the shell bins (they
  // collide, and are seen through every door, not only within ~11 m like the 'fine' furniture tier)
  for (const st of p.stairs) {
    const n = st.steps, tread = st.run / n, rise = st.rise / n;
    const yaw = Math.atan2(-st.dir[1], st.dir[0]);
    for (let i = 0; i < n; i++) {
      // (solid to the floor like its collider — not 0.9 m blocks floating over a void the sim fills)
      const u = (i + 0.5) * tread, top = (i + 1) * rise, h = top;
      // (the solid core is a PLASTERED stair base — the Mediterranean masonry stair with timber treads — and each
      //  riser a painted board: wood blocks read as a wall of crates)
      nb.stairBase.box(tread + 0.03, h, st.width, L(st.x + st.dir[0] * u, st.y + top - h / 2, st.z + st.dir[1] * u, yaw), col(i % 2 ? "#ecdfc6" : "#e6d8bd"), [i * 0.37, 0]);
      nb.stairRail.box(0.025, Math.min(rise, h) - 0.02, st.width - 0.02, L(st.x + st.dir[0] * (u - tread / 2 - 0.004), st.y + top - Math.min(rise, h) / 2 - 0.01, st.z + st.dir[1] * (u - tread / 2 - 0.004), yaw), col("#7a5233"));
    }
    // a lighter tread board with a 3 cm nosing on every step
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) * tread - 0.015, top = (i + 1) * rise;
      nb.stairWood.box(tread + 0.06, 0.035, st.width + 0.02, L(st.x + st.dir[0] * u, st.y + top + 0.012, st.z + st.dir[1] * u, yaw), col("#b98b58", 0.92 + (i % 3) * 0.04), [i * 0.41, 0.2]);
    }
    // the flight runs between the shaft walls: a timber handrail on brackets along both sides, 0.9 m over the nosings
    {
      const len = Math.hypot(st.run, st.rise), ang = Math.atan2(st.rise, st.run);
      for (const sg of [-1, 1]) {
        const off = sg * (st.width / 2 + 0.06);
        const px = st.x - st.dir[1] * off, pz = st.z + st.dir[0] * off;
        nb.stairRail.bbox(len, 0.06, 0.06, L(px + st.dir[0] * st.run / 2, st.y + st.rise / 2 + STAIR_GUARD_H - 0.05, pz + st.dir[1] * st.run / 2, yaw, 0, ang), col(WOOD_DARK), 0.02);
        for (const k of [0.15, 0.5, 0.85]) nb.metal.box(0.03, 0.03, 0.08, L(px + st.dir[0] * k * st.run + st.dir[1] * sg * 0.03, st.y + k * st.rise + STAIR_GUARD_H - 0.09, pz + st.dir[1] * k * st.run - st.dir[0] * sg * 0.03, yaw), col("#3b3d40"));
      }
    }
  }
  // the stair shaft walls (shared hallWalls = their colliders): plastered both sides in the interior colour
  for (const [x0, z0, x1, z1, y0, y1] of p.hallWalls) nb.stairBase.box(x1 - x0, y1 - y0, z1 - z0, L((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), innerCol, uvo());
  // stair-well balustrades (shared rails = their colliders): a top rail, a bottom rail and turned balusters
  for (const rl of p.rails) {
    const dx = rl.x1 - rl.x0, dz = rl.z1 - rl.z0, len = Math.hypot(dx, dz);
    if (len < 0.2) continue;
    const yaw = Math.atan2(-dz, dx), cx = (rl.x0 + rl.x1) / 2, cz = (rl.z0 + rl.z1) / 2;
    nb.stairRail.bbox(len + 0.06, 0.06, 0.08, L(cx, rl.y + STAIR_GUARD_H - 0.03, cz, yaw), col(WOOD_DARK), 0.015);
    nb.stairRail.box(len, 0.05, 0.05, L(cx, rl.y + 0.08, cz, yaw), col(WOOD_DARK));
    const n = Math.max(2, Math.round(len / 0.14));
    for (let i = 0; i <= n; i++) { const u = i / n; nb.stairWood.add(cylGeo(0.022, 0.026, STAIR_GUARD_H - 0.14, 6), L(rl.x0 + dx * u, rl.y + (STAIR_GUARD_H - 0.14) / 2 + 0.1, rl.z0 + dz * u), col("#a47748")); }
  }

  // ---------- roof
  const r = p.roof;
  if (r.kind === "flat") {
    for (const w of p.walls) {
      const th = Math.atan2(-w.dir[1], w.dir[0]);
      const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
      wallBin.box(w.len - 0.02, r.parapet, 0.26, at(w.len / 2, r.y + r.parapet / 2, 0.13), wallCol, uvo(), wallFn);
      BB(bins.trim, w.len + 0.16, 0.1, 0.4, at(w.len / 2, r.y + r.parapet + 0.05, 0.12), trimCol.clone().multiplyScalar(0.96), 0.03, trimFn);
      // scupper spout through the parapet
      if (w.len > 5 && rng() < 0.6) bins.metal.add(cylGeo(0.05, 0.05, 0.45, 6), at(w.len * (0.2 + rng() * 0.6), r.y + 0.12, -0.12).multiply(M(0, 0, 0, 0, Math.PI / 2)), col("#8f959b"));
    }
    // tin pent skirt sloping out from the parapet (colour b.pent) on every side
    if (b.pent) {
      const pc = col(b.pent), dep = 0.8, drop = 0.3, sl = Math.hypot(dep, drop), ang = Math.atan2(drop, dep);
      for (const w of p.walls) {
        const th = Math.atan2(-w.dir[1], w.dir[0]);
        const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
        const y0 = r.y + r.parapet + 0.12;
        bins.tin.add(tinGeo(w.len + 2 * dep * 0.96, sl), at(w.len / 2, y0 - drop / 2, -dep / 2 + 0.02).multiply(M(0, 0, 0, 0, ang)), pc, rustFn(0.28, "#7a3a1e", 1.4, b.x));
        bins.metal.box(w.len + 2 * dep, 0.08, 0.04, at(w.len / 2, y0 - drop - 0.03, -dep - 0.01), pc.clone().multiplyScalar(0.8));
        for (let u = 0.4; u < w.len; u += 1.8) bins.woodDark.box(0.07, 0.07, dep * 0.9, at(u, y0 - drop * 0.6, -dep * 0.45).multiply(M(0, 0, 0, 0, ang)), col(WOOD_DARK));
      }
    }
    // roof access bulkhead over the top stair
    // drawn from the shared bulkhead pieces (the same boxes the server collides with)
    const k = p.bulk;
    if (k) {
      for (const [x0, z0, x1, z1, y0, y1] of k.pieces) wallBin.box(x1 - x0, y1 - y0, z1 - z0, L((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), wallCol, uvo(), wallFn);
      const bw = k.x1 - k.x0, bd = k.z1 - k.z0, cx = (k.x0 + k.x1) / 2, cz = (k.z0 + k.z1) / 2;
      bins.metal.box(bw + 0.1, 0.12, bd + 0.1, L(cx, k.y + k.h + 0.06, cz), col(b.roofColor).multiplyScalar(0.8));
      bins.tin.add(tinGeo(bd + 0.4, bw + 0.35), L(cx, k.y + k.h + 0.14, cz, Math.PI / 2, 0, -1.5 * DEG), col(b.roofColor), rustFn(0.3, "#8a4a26", 1.6, b.x));
      // inside the stair house: a plastered ceiling + a lamp, like the rooms below (the lid's bare metal underside reads
      // as a black void over the top flight)
      bins.stairBase.box(bw - 0.12, 0.03, bd - 0.12, L(cx, k.y + k.h - 0.02, cz), innerCol, uvo());
      ceilingLamp(bins, L(cx, k.y + k.h - 0.03, cz), 0.35);
      const dm = (k.door.a0 + k.door.a1) / 2, dw = k.door.a1 - k.door.a0;
      if (k.door.side === "x") bins.trim.bbox(dw + 0.24, 0.12, 0.26, L(k.door.at, k.y + 2.2 + 0.06, dm, Math.PI / 2), trimCol, 0.02);
      else bins.trim.bbox(dw + 0.24, 0.12, 0.26, L(dm, k.y + 2.2 + 0.06, k.door.at), trimCol, 0.02);
      // (the leaf from the shared bulkLeaf — the same box the server collides with, for every hall orientation)
      { const [lx, lz, d] = bulkLeaf(k); bins.wood.bbox(0.9, 2.05, 0.05, L(lx, k.y + 1.04, lz, Math.atan2(-d[1], d[0])), doorCol, 0.012); }
    }
    if (o.dressing !== false) for (const pr of r.props) {
      const at = L(pr.x, r.y + 0.02, pr.z, pr.yaw ?? 0);
      if (o.roofProp?.(bins, at, pr, rng)) continue;
      addRoofProp(bins, at, pr, rng);
    }
    if (o.dressing !== false && lod >= 1) {
      // vent stacks + a pipe run along the parapet + (sometimes) a TV antenna or a washing line
      const vx = -b.w / 2 + 0.9, vz = -b.d / 2 + 0.8;
      bins.metal.add(cylGeo(0.11, 0.11, 0.8, 8), L(vx, r.y + 0.4, vz), col("#9aa0a6"));
      bins.metal.add(cylGeo(0.02, 0.19, 0.12, 8), L(vx, r.y + 0.86, vz), col("#8f959b"));
      bins.metal.add(cylGeo(0.05, 0.05, Math.max(1, b.w * 0.55), 6), L(-b.w * 0.12, r.y + 0.14, b.d / 2 - 0.5, 0, 0, Math.PI / 2), col("#8f959b"));
      if (rng() < 0.35) {
        bins.metal.add(cylGeo(0.02, 0.025, 2.2, 5), L(b.w / 2 - 0.7, r.y + 1.1, b.d / 2 - 0.7), col("#6f757b"));
        for (const [yy, l] of [[1.9, 1.1], [1.6, 0.8], [1.3, 0.6]]) bins.metal.add(cylGeo(0.012, 0.012, l, 4), L(b.w / 2 - 0.7, r.y + yy, b.d / 2 - 0.7, 0.6, 0, Math.PI / 2), col("#6f757b"));
      } else if (rng() < 0.4 && b.w > 6) {
        const x0 = -b.w / 2 + 1.2, x1 = b.w / 2 - 2.2, zz = 0.4;
        for (const x of [x0, x1]) bins.metal.add(cylGeo(0.025, 0.025, 1.7, 5), L(x, r.y + 0.85, zz), col("#7a7f85"));
        bins.rope.add(cylGeo(0.008, 0.008, x1 - x0, 4), L((x0 + x1) / 2, r.y + 1.65, zz, 0, 0, Math.PI / 2), col("#e8e0cc"));
        const cloth = ["#f4efe1", "#3a86c8", "#e0402f", "#f2c132", "#7fc8c0"];
        for (let i = 0; i < 4; i++) {
          const k = GARMENTS[Math.floor(rng() * GARMENTS.length)];
          bins.fabric.add(k, L(x0 + 0.5 + i * (x1 - x0 - 1) / 3, r.y + 1.64, zz, (rng() - 0.5) * 0.2), col(cloth[Math.floor(rng() * cloth.length)]));
          bins.woodDark.box(0.03, 0.08, 0.02, L(x0 + 0.5 + i * (x1 - x0 - 1) / 3 - 0.15, r.y + 1.63, zz), col("#8a6a44"));
        }
      }
    }
  } else {
    const alongX = r.axis === "x", shed = r.kind === "shed";
    const span = shed ? (alongX ? b.d : b.w) + 2 * r.overhang : (alongX ? b.d : b.w) / 2 + r.overhang;
    const ridgeLen = (alongX ? b.w : b.d) + 2 * r.overhang;
    const slopeLen = Math.hypot(span, r.rise), ang = Math.atan2(r.rise, span);
    const yawAxis = alongX ? 0 : Math.PI / 2;
    const roofCol = col(b.roofColor);
    const sides = shed ? [1] : [1, -1];
    const rust = rustFn(0.34, "#8a4a26", 1.1, b.z);
    for (const sgn of sides) {
      const off = shed ? 0 : span / 2 * sgn;
      const lx = alongX ? 0 : off, lz = alongX ? off : 0;
      // slope frame: local x along the ridge, local z down the slope (outward = +z for sgn +1)
      // slope frame: local x along the ridge, local z across; the sheet descends toward sgn·z (outward)
      const slope = L(lx, r.y + r.rise / 2 + 0.06, lz, yawAxis, sgn * ang);
      bins.tin.add(tinGeo(ridgeLen, slopeLen), slope, roofCol, rust);
      const nR = Math.max(2, Math.round(ridgeLen / 0.9));
      for (let i = 0; i <= nR; i++) {
        const xx = -ridgeLen / 2 + 0.15 + (ridgeLen - 0.3) * i / nR;
        bins.woodDark.box(0.07, 0.14, slopeLen - 0.05, slope.clone().multiply(M(xx, -0.1, 0)), col("#6a4a2c"));
      }
      bins.wood.bbox(ridgeLen + 0.04, 0.2, 0.05, slope.clone().multiply(M(0, -0.09, sgn * (slopeLen / 2 - 0.02))), col(b.trim), 0.012);
    }
    if (!shed) {
      // ridge cap (half-round)
      const cap = new THREE.CylinderGeometry(0.16, 0.16, ridgeLen + 0.05, 10, 1, true, -Math.PI / 2, Math.PI);
      bins.tin.add(cap, L(0, r.y + r.rise + 0.06, 0, yawAxis, 0, Math.PI / 2), roofCol.clone().multiplyScalar(0.9), rust);
      // a plastered chimney: stack, a projecting cap course, two terracotta pots (shared collider = the stack)
      if (b.chimney) {
        const [cx, cz] = b.chimney, H0 = r.y, H1 = r.y + r.rise + 0.95;
        wallBin.box(0.72, H1 - H0, 0.72, L(cx, (H0 + H1) / 2, cz), wallCol, [cx, cz], wallFn);
        bins.trim.bbox(0.86, 0.12, 0.86, L(cx, H1 + 0.04, cz), trimCol, 0.02);
        for (const dx of [-0.16, 0.16]) bins.stone.add(cylGeo(0.09, 0.11, 0.32, 10), L(cx + dx, H1 + 0.26, cz), col("#b8674a"));
      }
      // gable ends: wall wedge + vent + bargeboards. The ridge runs along local x when alongX, so the gables close the
      // ±x ENDS (at ±z they would poke through the slopes and leave both real gable ends open to the sky)
      for (const sgn of [1, -1]) {
        const gw = alongX ? b.d : b.w;
        const lx = alongX ? sgn * (b.w / 2 - t / 2) : 0, lz = alongX ? 0 : sgn * (b.d / 2 - t / 2);
        const gy = alongX ? Math.PI / 2 : 0;
        wallBin.add(wedgeGeo(gw, r.rise - 0.05, t), L(lx, r.y, lz, gy), wallCol, wallFn);
        const vy = r.y + r.rise * 0.4, out = alongX ? -sgn : sgn;   // local +z of the rotated frame points -x when gy = π/2
        bins.trim.bbox(0.8, 0.6, 0.12, L(lx, vy, lz, gy).multiply(M(0, 0, out * (t / 2 + 0.02))), trimCol, 0.03);
        bins.louvre.add(new THREE.BoxGeometry(0.6, 0.42, 0.04), L(lx, vy, lz, gy).multiply(M(0, 0, out * (t / 2 + 0.08))), shutterCol);
      }
      // a small gable DORMER on the front slope: clapboard cheeks + front, a little
      // tin gable roof with a ridge cap, a trimmed window with a louvred shutter pair
      if (b.dormer && alongX) {
        const hz = span * 0.52 - r.overhang * 0.5, yb = r.y + r.rise * (1 - hz / span), dw = Math.min(1.5, b.w * 0.3), dh = 1.0;
        const zc = hz - 0.55;
        wallBin.add(sidesGeo(dw, dh + 0.25, 1.1), L(0, yb - 0.25, zc), wallCol, wallFn);
        const dRise = 0.45, dSpan = dw / 2 + 0.18, dSl = Math.hypot(dSpan, dRise), dAng = Math.atan2(dRise, dSpan);
        for (const sg of [1, -1]) bins.tin.add(flatSheet(1.35, dSl), L(sg * dSpan / 2, yb + dh + dRise / 2 + 0.03, zc + 0.05, Math.PI / 2, sg * dAng), roofCol, rust);
        bins.tin.add(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6, 1, true, -Math.PI / 2, Math.PI), L(0, yb + dh + dRise + 0.04, zc + 0.05, Math.PI / 2, 0, Math.PI / 2), roofCol.clone().multiplyScalar(0.9));
        wallBin.add(wedgeGeo(dw, dRise, 0.06), L(0, yb + dh, zc + 0.55 - 0.03), wallCol, wallFn);
        bins.trim.box(0.74, 0.62, 0.06, L(0, yb + 0.5, zc + 0.57), trimCol);
        bins.glass.add(quadGeo(0.56, 0.46), L(0, yb + 0.5, zc + 0.605), 0xffffff);
        for (const sg of [-1, 1]) bins.louvre.add(new THREE.BoxGeometry(0.3, 0.56, 0.03), L(sg * 0.54, yb + 0.5, zc + 0.6, sg * 0.25), shutterCol);
      }
    }
  }

  // ---------- balcony
  if (p.balcony) {
    const w = p.walls[p.balcony.side], th = Math.atan2(-w.dir[1], w.dir[0]);
    const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
    const u0 = p.balcony.u0, u1 = p.balcony.u1, len = u1 - u0, um = (u0 + u1) / 2, dep = p.balcony.depth, y = p.balcony.y;
    const wcol = col(WOOD_BAL), dark = col(WOOD_DARK);
    bins.woodDark.bbox(len, 0.14, dep, at(um, y - 0.07, -dep / 2), wcol, 0.03);
    // corbels (beam ends) under the slab
    const nB = Math.max(2, Math.round(len / 1.6));
    for (let i = 0; i <= nB; i++) {
      const u = u0 + 0.12 + (len - 0.24) * i / nB;
      bins.woodDark.bbox(0.14, 0.2, dep + 0.08, at(u, y - 0.24, -dep / 2 - 0.02), dark, 0.03);
      if (lod >= 1) bins.woodDark.bbox(0.12, 0.12, 0.62, at(u, y - 0.5, -0.24).multiply(M(0, 0, 0, 0, -38 * DEG)), dark, 0.025);
    }
    // posts, rails, balusters
    const nP = Math.max(2, Math.round(len / 1.4));
    for (let i = 0; i <= nP; i++) bins.woodDark.bbox(0.11, 1.08, 0.11, at(u0 + 0.06 + (len - 0.12) * i / nP, y + 0.54, -dep + 0.07), wcol, 0.02);
    bins.woodDark.bbox(len + 0.06, 0.08, 0.14, at(um, y + 1.06, -dep + 0.07), wcol, 0.025);
    bins.woodDark.box(len, 0.06, 0.07, at(um, y + 0.13, -dep + 0.07), dark);
    for (const u of [u0 + 0.06, u1 - 0.06]) {
      bins.woodDark.bbox(0.08, 0.08, dep, at(u, y + 1.06, -dep / 2), wcol, 0.02);
      bins.woodDark.box(0.06, 0.06, dep, at(u, y + 0.13, -dep / 2), dark);
      const nS = Math.floor(dep / (lod === 2 ? 0.15 : 0.28));
      for (let i = 1; i < nS; i++) bins.woodDark.box(0.045, 0.86, 0.045, at(u, y + 0.59, -dep * i / nS), wcol);
    }
    if (lod === 0) bins.woodDark.box(len - 0.1, 0.82, 0.04, at(um, y + 0.59, -dep + 0.07), wcol.clone().multiplyScalar(0.85));
    else {
      const nBal = Math.floor(len / (lod === 2 ? 0.15 : 0.2));
      for (let i = 1; i < nBal; i++) bins.woodDark.box(0.045, 0.86, 0.045, at(u0 + len * i / nBal, y + 0.59, -dep + 0.07), wcol);
    }
    // hanging planters with flowers on the rail
    const nPl = Math.max(1, Math.round(len / 2.4));
    if (lod >= 1) for (let i = 0; i < nPl; i++) addFlowerBox(nb, at(u0 + len * (i + 0.5) / nPl, y + 1.1, -dep + 0.02), Math.min(1.1, len / nPl - 0.4), rng, true);
    // a couple of pots on the balcony floor
    if (rng() < 0.6) addPlanter(nb, at(u1 - 0.45, y, -dep + 0.4), rng, 0.3);
  }

  // ---------- awning
  if (p.awning) {
    const w = p.walls[p.awning.side], th = Math.atan2(-w.dir[1], w.dir[0]);
    const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
    const u0 = p.awning.u0, u1 = p.awning.u1, len = u1 - u0, um = (u0 + u1) / 2, dep = p.awning.depth, y = p.awning.y;
    if (p.awning.kind === "tin") {
      const drop = 0.45, sl = Math.hypot(dep, drop), ang = Math.atan2(drop, dep);
      const c = col(b.awningColor ?? b.roofColor);
      // sheet: ribs run down the slope
      bins.tin.add(tinGeo(len + 0.1, sl), at(um, y - drop / 2 + 0.05, -dep / 2).multiply(M(0, 0, 0, 0, ang)), c, rustFn(0.3, "#8a4a26", 1.5, b.x + b.z));
      // edge flashing strip + ledger + front beam
      bins.metal.bbox(len + 0.12, 0.1, 0.05, at(um, y - drop - 0.01, -dep - 0.02), c.clone().multiplyScalar(0.85), 0.012);
      bins.woodDark.bbox(len, 0.16, 0.1, at(um, y + 0.02, -0.05), col(WOOD_DARK), 0.02);
      bins.woodDark.bbox(len, 0.14, 0.1, at(um, y - drop - 0.12, -dep + 0.1), col(WOOD_DARK), 0.02);
      const posts = b.awningPosts ? awningPostUs(p.awning) : [];
      if (posts.length) {
        for (const u of posts) {
          const hPost = y - drop - 0.12 - b.y;
          bins.woodDark.bbox(0.14, hPost, 0.14, at(u, b.y + hPost / 2, -dep + 0.12), col(WOOD_DARK), 0.025);
          bins.stone.bbox(0.26, 0.12, 0.26, at(u, b.y + 0.06, -dep + 0.12), col("#bfb39b"), 0.02);
          bins.woodDark.bbox(0.08, 0.08, 0.7, at(u, y - drop - 0.45, -dep + 0.4).multiply(M(0, 0, 0, 0, 40 * DEG)), col(WOOD_DARK), 0.015);
        }
      } else {
        const n = Math.max(1, Math.round(len / 2.2));
        for (let i = 0; i <= n; i++) {
          const u = u0 + 0.12 + (len - 0.24) * i / n;
          const sy = y - 0.95, ey = y - drop - 0.1, ex = dep - 0.15;
          const l = Math.hypot(ex, ey - sy), a = Math.atan2(ey - sy, ex);
          bins.woodDark.bbox(0.08, 0.08, l, at(u, (sy + ey) / 2, -ex / 2).multiply(M(0, 0, 0, 0, a)), col(WOOD_DARK), 0.015);
        }
      }
    } else {
      const drop = 0.34, sl = Math.hypot(dep, drop), ang = Math.atan2(drop, dep), row = b.stripe ?? 0;
      bins.stripes.add(stripeQuad(len, sl, row, 0.06), at(um, y - drop / 2, -dep / 2).multiply(M(0, 0, 0, 0, ang)), 0xffffff);
      bins.stripes.add(stripeValance(len, 0.3, row), at(um, y - drop - 0.15, -dep - 0.01), 0xffffff);
      for (const u of [u0, u1]) bins.stripes.add(sideCheek(dep, drop, row), at(u, y, 0).multiply(M(0, 0, 0, -Math.PI / 2)), 0xffffff);
      bins.metal.add(cylGeo(0.025, 0.025, len, 6), at(um, y - drop, -dep).multiply(M(0, 0, 0, 0, 0, Math.PI / 2)), col("#4a4f55"));
      bins.metal.add(cylGeo(0.03, 0.03, len, 6), at(um, y + 0.02, -0.06).multiply(M(0, 0, 0, 0, 0, Math.PI / 2)), col("#4a4f55"));
      for (const u of [u0 + 0.1, um, u1 - 0.1]) {
        const dy = 0.9 - drop, l = Math.hypot(dep, dy);
        bins.metal.add(cylGeo(0.018, 0.018, l, 5), at(u, y - 0.9 + dy / 2, -dep / 2).multiply(M(0, 0, 0, 0, Math.atan2(dep, dy))), col("#4a4f55"));
      }
    }
  }

  // ---------- signage
  if (b.sign) {
    const w = p.walls[p.front], th = Math.atan2(-w.dir[1], w.dir[0]);
    const sw = Math.min(3.2, w.len - 1.4), sh = sw / 4;
    const y = b.y + (b.floors > 1 ? floorH - 0.28 : H - 0.5);
    const at = L(w.A[0] + w.dir[0] * (w.len / 2) + w.n[0] * 0.1, y, w.A[1] + w.dir[1] * (w.len / 2) + w.n[1] * 0.1, th);
    const [bg, fg] = signPalette(b, rng);
    const mesh = new THREE.Mesh(boxGeo(sw, sh, 0.06), mats.sign(b.sign, bg, fg));
    mesh.applyMatrix4(at); mesh.castShadow = true; mesh.matrixAutoUpdate = false; mesh.name = "sign";
    o.extra.push(mesh);
    bins.woodDark.bbox(sw + 0.14, sh + 0.14, 0.05, at.clone().multiply(M(0, 0, -0.05)), col("#4a3320"), 0.015);
  }

  // ---------- wall services: downpipe with brackets + shoe, a meter box, a wall lamp
  if (o.dressing !== false) {
    const side = p.walls[(p.front + 1) % 4], th = Math.atan2(-side.dir[1], side.dir[0]);
    const u = side.len - 0.35;
    const px = side.A[0] + side.dir[0] * u + side.n[0] * 0.11, pz = side.A[1] + side.dir[1] * u + side.n[1] * 0.11;
    const pipeCol = col(rng() < 0.5 ? "#9aa0a6" : b.trim);
    bins.metal.add(cylGeo(0.055, 0.055, H - 0.25, 7), L(px, b.y + 0.25 + (H - 0.25) / 2, pz, th), pipeCol);
    bins.metal.add(cylGeo(0.06, 0.06, 0.3, 7), L(px, b.y + 0.2, pz, th).multiply(M(0, 0, 0.12, 0, Math.PI / 2 - 0.5)), pipeCol);
    for (let k = 1; k < b.floors * 2; k++) bins.metal.box(0.16, 0.05, 0.14, L(px, b.y + k * floorH / 2, pz, th), col("#6f757b"));
    const fw = p.walls[p.front], fth = Math.atan2(-fw.dir[1], fw.dir[0]);
    if (rng() < 0.5) {
      const mu = 0.45;
      bins.metal.bbox(0.4, 0.5, 0.16, L(fw.A[0] + fw.dir[0] * mu + fw.n[0] * 0.08, b.y + 1.5, fw.A[1] + fw.dir[1] * mu + fw.n[1] * 0.08, fth), col("#c9ced3"), 0.02);
    }
  }

  // ---------- interior furniture per archetype (detail bins): shop / home ground floor / bedroom upstairs
  const fb = o.fine ?? nb;
  if (o.kitFurniture) { /* furnished by the interiors kit */ }
  else if (hasInt && b.material !== "clapboard") furnish(fb, p, L, inkR, innerCol);
  else if (hasInt) furnishHut(fb, p, L, inkR);
}

// ================================================================================================ LOD1
/** open box: the 4 side faces only (no top/bottom), metre UVs (u along the face, v = height), facing out (or in) */
function sidesGeo(w: number, h: number, d: number, inward = false): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const hx = w / 2, hz = d / 2, s = inward ? -1 : 1;
  const faces: Array<[number[], number[], number[], number]> = [
    [[-hx, 0, hz], [hx, 0, hz], [0, 0, 1], w], [[hx, 0, hz], [hx, 0, -hz], [1, 0, 0], d],
    [[hx, 0, -hz], [-hx, 0, -hz], [0, 0, -1], w], [[-hx, 0, -hz], [-hx, 0, hz], [-1, 0, 0], d],
  ];
  for (const [a, b, n, len] of faces) {
    const A = [a[0], 0, a[2]], B = [b[0], 0, b[2]], C = [b[0], h, b[2]], D = [a[0], h, a[2]];
    const quad = inward ? [A, D, C, A, C, B] : [A, B, C, A, C, D];
    const quv = inward ? [[0, 0], [0, h], [len, h], [0, 0], [len, h], [len, 0]] : [[0, 0], [len, 0], [len, h], [0, 0], [len, h], [0, h]];
    for (let i = 0; i < 6; i++) { pos.push(...quad[i]); nor.push(n[0] * s, 0, n[2] * s); uv.push(quv[i][0], quv[i][1]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (!inward) g.userData.coBox = true;   // an open box: the coplanar resolver may move its side planes
  return g;
}
/** unit decal quad (1 × 1, facing +z, centred) mapped onto FACADE atlas cell c (half-texel inset against bleeding) */
const decalCache = new Map<number, THREE.BufferGeometry>();
export function facadeDecal(c: number): THREE.BufferGeometry {
  let g = decalCache.get(c);
  if (g) return g;
  g = new THREE.PlaneGeometry(1, 1);
  const col0 = c % 4, row = Math.floor(c / 4), eu = 0.5 / 1024, ev = 0.5 / 512;
  const u0 = col0 / 4 + eu, u1 = (col0 + 1) / 4 - eu, v0 = row / 2 + ev, v1 = (row + 1) / 2 - ev;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) < 0.5 ? u0 : u1, uv.getY(i) < 0.5 ? v0 : v1);
  decalCache.set(c, g);
  return g;
}
// (openingHash / windowClosed live in shared town-kit — the colliders need the same shutter state)
export { openingHash, windowClosed };
/**
 * LOD1 of a building (drawn beyond its `mid` distance instead of the full shell): open wall box + plinth band + string
 * courses + cornice / parapet with coping and an inset roof deck (or pitched tin sheets + ridge + gables), painted
 * window / door / shop decals from the FACADE atlas at the real opening positions, awning sheets, balcony slab + rail
 * panel, simple rooftop tanks. ~300–500 tris a building vs ~5–9 k for the full shell.
 */
export function addBuildingLod1(bins: TownBins, p: BuildingParts, o: {
  /** MEDIUM tier (30 m → mid): real window frames (lintel, sill, jambs) around the painted openings so the facade keeps
   *  its relief, and the rooftop kit through the POI's hook (low detail) */
  frames?: boolean; roofProp?: BuildOpts["roofProp"];
} = {}) {
  const { b, floorH, H } = p;
  const base = new THREE.Matrix4().makeRotationY(b.yaw).setPosition(b.x, 0, b.z);
  const L = (lx: number, ly: number, lz: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => base.clone().multiply(M(lx, ly, lz, yaw, pitch, roll, sx, sy, sz));
  const plasterish = b.material !== "clapboard" && b.material !== "stone";
  const wallBin: GeoBin = b.material === "clapboard" ? bins.clapboard : b.material === "stone" ? bins.stone : bins.plaster;
  // (painted clapboard reads ~20 % brighter + a touch more saturated — the huts stay candy-bright even in
  // the porch shade; the board grooves + texture already darken it)
  const wallCol = b.material === "clapboard" ? paintBright(b.wall) : col(b.wall), trimCol = col(b.trim), shutterCol = col(b.shutter ?? "#3b4a3a"), doorCol = col(b.door ?? b.shutter ?? "#6b4a2b");
  const plinthCol = col(b.plinth ?? b.wall).lerp(new THREE.Color("#8a7a66"), 0.35).multiplyScalar(0.8);
  const wallFn: ColorFn = combine(groundAO(b.y, 1.4, 0.7), eaveAO(b.y + H, 0.5, 0.88));
  const r = p.roof, flat = r.kind === "flat";
  const topY = flat ? r.y + r.parapet : r.y;
  wallBin.add(sidesGeo(b.w, topY - b.y, b.d), L(0, b.y, 0), wallCol, wallFn);
  if (plasterish) {
    bins.plaster.add(sidesGeo(b.w + 0.05, 0.55, b.d + 0.05), L(0, b.y, 0), plinthCol);
    for (let f = 1; f < b.floors; f++) bins.trim.add(sidesGeo(b.w + 0.14, 0.16, b.d + 0.14), L(0, b.y + f * floorH - 0.1, 0), trimCol);
  }
  if (flat) {
    const pt = 0.26;
    if (plasterish) bins.trim.box(b.w + 0.2, 0.2, b.d + 0.2, L(0, r.y - 0.12, 0), trimCol);
    wallBin.add(sidesGeo(b.w - 2 * pt, r.parapet + 0.02, b.d - 2 * pt, true), L(0, r.y - 0.01, 0), wallCol.clone().multiplyScalar(0.9));
    bins.stone.box(b.w - 2 * pt + 0.02, 0.04, b.d - 2 * pt + 0.02, L(0, r.y - 0.01, 0), col("#b9aa92"));
    for (const [w, d, x, z] of [[b.w + 0.16, 0.4, 0, b.d / 2 - 0.12], [b.w + 0.16, 0.4, 0, -b.d / 2 + 0.12], [0.4, b.d - 0.64, b.w / 2 - 0.12, 0], [0.4, b.d - 0.64, -b.w / 2 + 0.12, 0]])
      bins.trim.box(w, 0.1, d, L(x, topY + 0.05, z), trimCol.clone().multiplyScalar(0.96));
    if (b.pent) {
      const pc = col(b.pent), dep = 0.8, drop = 0.3, sl = Math.hypot(dep, drop), ang = Math.atan2(drop, dep);
      for (const w of p.walls) {
        const th = Math.atan2(-w.dir[1], w.dir[0]);
        const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
        bins.tin.add(flatSheet(w.len + 2 * dep * 0.96, sl), at(w.len / 2, topY + 0.12 - drop / 2, -dep / 2 + 0.02).multiply(M(0, 0, 0, 0, ang)), pc);
      }
    }
    for (const pr of r.props) {
      const at = L(pr.x, r.y + 0.02, pr.z, pr.yaw ?? 0), s2 = pr.s ?? 1;
      if (o.roofProp && o.roofProp(bins, at, pr, p.rng)) continue;
      const tank = (y0: number, rr: number, hh: number, c: string, steel = false) => (steel ? bins.metal : bins.plastic).add(cylGeo(rr, rr, hh, 10), at.clone().multiply(M(0, y0 + hh / 2, 0)), col(c));
      // (the LOD1 copies have the collider's dimensions (town-kit roofPropShape) — bigger / higher boxes
      //  would read as invisible walls round every far tank)
      if (pr.kind === "plastic") { bins.woodDark.box(1.4 * s2, 0.1 * s2, 0.78 * s2, at.clone().multiply(M(0, 0.05 * s2, 0)), col("#7a5a3c")); tank(0.1 * s2, 0.6 * s2, 1.3 * s2, pr.color ?? "#2f4f8f"); }
      else if (pr.kind === "steel") { bins.stone.box(1.44 * s2, 0.14 * s2, 1.44 * s2, at.clone().multiply(M(0, 0.07 * s2, 0)), col("#bfb6a4")); tank(0.14 * s2, 0.62 * s2, 1.12 * s2, "#b9bec4", true); }
      else if (pr.kind === "stand") { bins.woodDark.box(1.9 * s2, 0.86 * s2, 1.9 * s2, at.clone().multiply(M(0, 0.43 * s2, 0)), col("#6a4a2c")); tank(0.86 * s2, 0.84 * s2, 1.85 * s2, pr.color ?? "#5e7a3a"); }
      else if (pr.kind === "tower") { for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bins.woodDark.box(0.16 * s2, 3.2 * s2, 0.16 * s2, at.clone().multiply(M(sx * 0.74 * s2, 1.6 * s2, sz * 0.74 * s2)), col("#6a4a2c")); bins.wood.box(1.9 * s2, 0.1 * s2, 1.96 * s2, at.clone().multiply(M(0, 3.24 * s2, 0)), col("#9c7650")); tank(3.29 * s2, 0.72 * s2, 1.45 * s2, "#2f5fa0"); }
      else if (pr.kind === "ac") bins.metal.box(0.86, 0.66, 0.4, at.clone().multiply(M(0, 0.33, 0)), col("#d3d7db"));
      else if (pr.kind === "crates") bins.wood.box(1.2, 0.6, 0.45, at.clone().multiply(M(0, 0.3, 0)), col("#b98b58"));
    }
  } else {
    const alongX = r.axis === "x", shed = r.kind === "shed";
    const span = shed ? (alongX ? b.d : b.w) + 2 * r.overhang : (alongX ? b.d : b.w) / 2 + r.overhang;
    const ridgeLen = (alongX ? b.w : b.d) + 2 * r.overhang, slopeLen = Math.hypot(span, r.rise), ang = Math.atan2(r.rise, span);
    const yawAxis = alongX ? 0 : Math.PI / 2, roofCol = col(b.roofColor);
    for (const sgn of shed ? [1] : [1, -1]) {
      const off = shed ? 0 : span / 2 * sgn, lx = alongX ? 0 : off, lz = alongX ? off : 0;
      const slope = L(lx, r.y + r.rise / 2 + 0.06, lz, yawAxis, sgn * ang);
      bins.tin.add(flatSheet(ridgeLen, slopeLen), slope, roofCol, rustFn(0.34, "#8a4a26", 1.1, b.z));
      bins.wood.box(ridgeLen + 0.04, 0.2, 0.05, slope.clone().multiply(M(0, -0.09, sgn * (slopeLen / 2 - 0.02))), col(b.trim));
    }
    if (!shed) {
      bins.tin.add(new THREE.CylinderGeometry(0.16, 0.16, ridgeLen + 0.05, 6, 1, true, -Math.PI / 2, Math.PI), L(0, r.y + r.rise + 0.06, 0, yawAxis, 0, Math.PI / 2), roofCol.clone().multiplyScalar(0.9));
      for (const sgn of [1, -1]) {
        const gw = alongX ? b.d : b.w, lx = alongX ? sgn * (b.w / 2 - p.t / 2) : 0, lz = alongX ? 0 : sgn * (b.d / 2 - p.t / 2);
        wallBin.add(wedgeGeo(gw, r.rise - 0.05, p.t), L(lx, r.y, lz, alongX ? Math.PI / 2 : 0), wallCol, wallFn);
      }
    }
  }
  // openings → painted decals 3 cm proud of the wall
  const { FU, FS, FL } = FACADE;
  for (const w of p.walls) {
    const th = Math.atan2(-w.dir[1], w.dir[0]);
    const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
    for (let f = 0; f < b.floors; f++) {
      const fy = b.y + f * floorH;
      let dk = 0;
      for (const op of w.openings[f]) {
        let cell = 2, tint = shutterCol;
        if (op.kind === "window") {
          if (op.shutters === false) cell = 2;
          else if (windowClosed(b, f, op)) cell = openingHash(b, f, op.u, 3) < 0.15 ? 6 : 0;
          else cell = 1;
        } else if (op.kind === "french") cell = openingHash(b, f, op.u, 5) < 0.5 ? 7 : 3;
        else if (op.kind === "door") { cell = 4; tint = doorCol; }
        else if (op.kind === "shop") { cell = 5; tint = col("#ffffff"); }
        else continue;
        const tall = cell === 3 || cell === 4 || cell === 5 || cell === 7, fs = tall ? 0.03 : FS;
        const Wd = op.w / (1 - 2 * FU), Hd = op.h / (1 - fs - FL), wide = cell === 1 || cell === 7;
        const cu = op.u + op.w / 2, y0 = fy + op.y - fs * Hd;
        // neighbouring decals overlap (open shutters paint twice the opening's width): alternate 2.5 mm apart
        bins.facade.add(facadeDecal(cell), at(cu, y0 + Hd / 2, -0.03 - (dk++ & 1) * 0.0025).multiply(M(0, 0, 0, 0, 0, 0, wide ? Wd * 2 : Wd, Hd, 1)), tint);
        if (o.frames && plasterish) {
          // relief: lintel + sill (windows) + jambs standing 6–9 cm proud of the wall, like the full shell's trims
          const fw = 0.15, jy = op.kind === "window" ? fy + op.y + op.h / 2 + 0.06 : fy + op.y + (op.h + fw / 2) / 2, hj = op.h + (op.kind === "window" ? 0.12 : fw / 2);
          bins.trim.box(op.w + 2 * fw + 0.12, 0.2, 0.14, at(cu, fy + op.y + op.h + 0.1, -0.05), trimCol);
          if (op.kind === "window") bins.trim.box(op.w + 2 * fw + 0.16, 0.09, 0.24, at(cu, fy + op.y - 0.04, -0.06), trimCol);
          for (const su of [op.u - fw / 2, op.u + op.w + fw / 2]) bins.trim.box(fw, hj, 0.1, at(su, jy, -0.035), trimCol);
        }
      }
    }
  }
  // awning + balcony (the colour blocks that read from afar)
  if (p.awning) {
    const w = p.walls[p.awning.side], th = Math.atan2(-w.dir[1], w.dir[0]);
    const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
    const u0 = p.awning.u0, u1 = p.awning.u1, len = u1 - u0, um = (u0 + u1) / 2, dep = p.awning.depth, y = p.awning.y;
    if (p.awning.kind === "tin") {
      const drop = 0.45, sl = Math.hypot(dep, drop), ang = Math.atan2(drop, dep), c = col(b.awningColor ?? b.roofColor);
      bins.tin.add(flatSheet(len + 0.1, sl), at(um, y - drop / 2 + 0.05, -dep / 2).multiply(M(0, 0, 0, 0, ang)), c);
      bins.woodDark.box(len, 0.14, 0.1, at(um, y - drop - 0.12, -dep + 0.1), col(WOOD_DARK));
      if (b.awningPosts) for (const u of awningPostUs(p.awning)) { const hPost = y - drop - 0.12 - b.y; bins.woodDark.box(0.14, hPost, 0.14, at(u, b.y + hPost / 2, -dep + 0.12), col(WOOD_DARK)); }
    } else {
      const drop = 0.34, sl = Math.hypot(dep, drop), ang = Math.atan2(drop, dep), row = b.stripe ?? 0;
      bins.stripes.add(stripeQuad(len, sl, row, 0.0), at(um, y - drop / 2, -dep / 2).multiply(M(0, 0, 0, 0, ang)), 0xffffff);
      bins.stripes.add(stripeValance(len, 0.3, row), at(um, y - drop - 0.15, -dep - 0.01), 0xffffff);
    }
  }
  if (p.balcony) {
    const w = p.walls[p.balcony.side], th = Math.atan2(-w.dir[1], w.dir[0]);
    const at = (u: number, y: number, off: number) => L(w.A[0] + w.dir[0] * u - w.n[0] * off, y, w.A[1] + w.dir[1] * u - w.n[1] * off, th);
    const u0 = p.balcony.u0, u1 = p.balcony.u1, len = u1 - u0, um = (u0 + u1) / 2, dep = p.balcony.depth, y = p.balcony.y;
    bins.woodDark.box(len, 0.2, dep, at(um, y - 0.1, -dep / 2), col(WOOD_BAL));
    bins.woodDark.box(len, 0.95, 0.06, at(um, y + 0.55, -dep + 0.07), col(WOOD_BAL, 0.85));
    for (const u of [u0 + 0.05, u1 - 0.05]) bins.woodDark.box(0.06, 0.95, dep, at(u, y + 0.55, -dep / 2), col(WOOD_BAL, 0.85));
  }
}

type LFn = (lx: number, ly: number, lz: number, yaw?: number, pitch?: number, roll?: number, sx?: number, sy?: number, sz?: number) => THREE.Matrix4;
const bb = (bin: GeoBin, w: number, h: number, d: number, m: THREE.Matrix4, c: THREE.Color | string, bev = 0.02, fn?: ColorFn) => bin.add(chamferBoxGeo(w, h, d, bev), m, typeof c === "string" ? col(c) : c, fn);
const pick = <T>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length) % a.length];
/** a small crate on a shelf / floor with a heaped fruit mound (cheap: box + dome + a few fruit) */
function shelfCrate(fb: TownBins, m: THREE.Matrix4, r: () => number, w = 0.46, d = 0.32, h = 0.2) {
  const crate = pick(r, ["#8a5a34", "#2f8f86", "#3a6fb0", "#c85a3a", "#9a6b3e"]);
  fb.wood.box(w, h, d, m.clone().multiply(M(0, h / 2, 0)), col(crate));
  const banana = r() < 0.4, fx = fruitSink();
  // fruit-coloured bed so no gap shows the crate floor, then a layer of real (instanced) fruit on top
  fruitMound(fb, m.clone().multiply(M(0, h - 0.04, 0)), w / 2 * 0.92, 0.08, d / 2 * 0.92, banana ? "banana" : "mango", r());
  if (!fx) return;
  if (banana) { for (let k = 0; k < 2; k++) fx.hand(m.clone().multiply(M(-w * 0.25 + k * w * 0.1, h + 0.01, (k - 0.5) * d * 0.4, (k ? Math.PI : 0) + (r() - 0.5) * 0.4, 0, 0.1, (w / 0.46) * 0.9)), 5 + Math.floor(r() * 2), r() * 0.3); return; }
  const nx = Math.max(2, Math.round(w / 0.12)), nz = Math.max(2, Math.round(d / 0.12));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) fx.mango(m.clone().multiply(M(-w / 2 + (i + 0.5) * w / nx + (r() - 0.5) * 0.02, h + 0.02 + (r() * 0.02), -d / 2 + (j + 0.5) * d / nz, r() * 6.28, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 0.12 + r() * 0.02)), r(), 0.92 + r() * 0.16);
}
const DOME = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
const PEB = new THREE.IcosahedronGeometry(1, 0);
const BALL = new THREE.IcosahedronGeometry(1, 1);
function pictureFrame(fb: TownBins, m: THREE.Matrix4, r: () => number, w = 0.7, h = 0.5) {
  bb(fb.woodDark, w, h, 0.04, m, pick(r, ["#5b3b20", "#c9a24a", "#2f4a3a"]), 0.01);
  fb.fabric.box(w - 0.1, h - 0.1, 0.01, m.clone().multiply(M(0, 0, 0.022)), col(pick(r, ["#4fa3c8", "#e89a5a", "#6ab06a", "#e8c24a", "#d9573e"])), [0, 0], (x, y, z, b2, o2) => { if (noise3(x * 9, y * 9, z * 9) > 0.55) o2.lerp(new THREE.Color("#f4efe1"), 0.5); });
}
function ceilingLamp(fb: TownBins, m: THREE.Matrix4, drop = 0.55) {
  fb.metal.add(cylGeo(0.008, 0.008, drop, 4), m.clone().multiply(M(0, -drop / 2, 0)), col("#2a2a2a"));
  fb.metal.add(latheGeo([[0.02, 0], [0.18, -0.12], [0.2, -0.16], [0.02, -0.1]], 14), m.clone().multiply(M(0, -drop, 0)), col("#d8cfa8"));
  fb.bulb.add(BALL, m.clone().multiply(M(0, -drop - 0.1, 0, 0, 0, 0, 0.06)), col("#fff1c8"));
}
/** ceiling fan: down-rod, motor housing, 4 cane blades */
function ceilingFan(fb: TownBins, m: THREE.Matrix4, r: () => number) {
  fb.metal.add(cylGeo(0.012, 0.012, 0.35, 5), m.clone().multiply(M(0, -0.175, 0)), col("#3a3530"));
  fb.metal.add(latheGeo([[0, 0], [0.1, -0.02], [0.12, -0.1], [0.08, -0.16], [0, -0.17]], 12), m.clone().multiply(M(0, -0.35, 0)), col("#b89048"));
  const a0 = r() * 6;
  for (let k = 0; k < 4; k++) bb(fb.wood, 0.58, 0.015, 0.14, m.clone().multiply(M(0, -0.45, 0, a0 + k * Math.PI / 2)).multiply(M(0.38, 0, 0, 0, 0.12)), "#8a6238", 0.006);
  fb.bulb.add(BALL, m.clone().multiply(M(0, -0.53, 0, 0, 0, 0, 0.07)), col("#fff1c8"));
}
/** rattan armchair (cane frame, woven seat + back, cream cushion); front = local +z */
function rattanChair(fb: TownBins, m: THREE.Matrix4, r: () => number) {
  const cane = col("#c49a5c", 0.92 + r() * 0.12);
  bb(fb.wood, 0.66, 0.1, 0.6, m.clone().multiply(M(0, 0.36, 0)), cane, 0.03);
  bb(fb.wood, 0.66, 0.62, 0.08, m.clone().multiply(M(0, 0.7, -0.27, 0, -0.18)), cane, 0.03);
  for (const s of [-1, 1]) bb(fb.wood, 0.08, 0.26, 0.56, m.clone().multiply(M(s * 0.3, 0.56, 0)), cane, 0.03);
  for (const [dx, dz] of [[-0.28, -0.24], [0.28, -0.24], [-0.28, 0.24], [0.28, 0.24]]) fb.wood.add(cylGeo(0.022, 0.026, 0.33, 6), m.clone().multiply(M(dx, 0.165, dz)), cane.clone().multiplyScalar(0.85));
  bb(fb.fabric, 0.56, 0.09, 0.5, m.clone().multiply(M(0, 0.45, 0.02)), pick(r, ["#f4efe1", "#e9dcc4", "#d9b25f"]), 0.04);
}
function plantPot(fb: TownBins, m: THREE.Matrix4, r: () => number, s = 0.3) {
  fb.stone.add(latheGeo([[0, 0], [s * 0.7, 0], [s * 0.85, s * 1.1], [s * 0.95, s * 1.12], [s * 0.95, s * 1.22], [0, s * 1.22]], 12), m, col(pick(r, ["#b8674a", "#c9a27a", "#3f8f78"])));
  fb.leaf.add(leafClumpGeo(Math.floor(r() * 4)), m.clone().multiply(M(0, s * 1.2, 0, r() * 6, 0, 0, s * 1.6, s * 1.8, s * 1.6)), col("#4a8c33"));
}
/** furnish every floor of a plaster building (local frame: x ±w/2, z ±d/2, front +z); the stair strip runs along the
 *  back-left, the door is on the front — furniture keeps to the right half and clear of both */
function furnish(fb: TownBins, p: BuildingParts, L: LFn, r: () => number, wallC: THREE.Color) {
  const { b, t, floorH } = p;
  const W = b.w / 2 - t - 0.04, D = b.d / 2 - t - 0.04;
  void wallC;
  for (let f = 0; f < b.floors; f++) {
    // switchback stairs — the stair block differs per floor (the flight on it + the stairwell from below)
    const sz = stairZone(p, f), stairX1 = sz ? sz[2] : -W, stairZ1 = sz ? sz[3] : -D;
    const xr0 = Math.max(stairX1 - 0.2, -W + 0.4); // left edge of the "free" right-hand zone
    const fy = b.y + f * floorH + (f === 0 ? 0.05 : 0), ceil = b.y + (f + 1) * floorH - (f === b.floors - 1 && p.roof.kind !== "flat" ? 0.22 : 0.28);
    // ceiling variants — exposed timber beams (every 3rd room), a boarded ceiling (every 3rd), plain paint otherwise
    const cv = Math.floor(r() * 3);
    if (cv === 0) for (let x = -W + 0.6; x < W - 0.3; x += 1.25) { if (p.holes.some((h) => h.floor === f + 1 && x > h.x0 - 0.2 && x < h.x1 + 0.2)) continue; fb.woodDark.box(0.16, 0.2, 2 * D, L(x, ceil - 0.1, 0), col("#6e4f30", 0.9 + r() * 0.2), [x, 0]); }
    else if (cv === 1 && !p.holes.some((h) => h.floor === f + 1)) fb.wood.box(2 * W, 0.03, 2 * D, L(0, ceil - 0.015, 0), col("#c9a57a"), [0, 0]);
    if (r() < 0.55 && ceil - fy > 2.6) ceilingFan(fb, L((xr0 + W) / 2 + 0.2, ceil - (cv === 0 ? 0.2 : 0), -0.3), r);
    else ceilingLamp(fb, L((xr0 + W) / 2, ceil, 0), Math.min(0.6, ceil - fy - 2.3));
    if (f === 0 && !b.shop && b.floors === 1) {
      // ---- studio (beach bungalows, one-room huts): bed + rug, a pair of rattan chairs round a low table, a dresser,
      // pictures, plants
      const bw = Math.min(1.6, W - xr0 - 0.3), bx = W - 0.05 - bw / 2, bz0 = -D + 0.1, bz = bz0 + 1.02;
      if (bw > 0.9) {
        fb.fabric.box(bw + 0.9, 0.015, 2.6, L(bx - 0.25, fy + 0.008, bz + 0.3), col(pick(r, ["#b8543f", "#2f7f78", "#c7913e"])));
        bb(fb.woodDark, bw, 0.3, 2.05, L(bx, fy + 0.17, bz), "#6a4526", 0.03);
        bb(fb.fabric, bw - 0.06, 0.22, 1.98, L(bx, fy + 0.42, bz), pick(r, ["#f4efe4", "#ece2cc"]), 0.07);
        bb(fb.fabric, bw + 0.04, 0.07, 1.2, L(bx, fy + 0.54, bz + 0.35), pick(r, ["#d56a4e", "#3f8f86", "#e0b24a"]), 0.03);
        for (const px of bw > 1.2 ? [-0.36, 0.36] : [0]) bb(fb.fabric, 0.55, 0.14, 0.36, L(bx + px, fy + 0.6, bz0 + 0.28, 0, -0.15), "#fbf7ee", 0.06);
        bb(fb.woodDark, bw + 0.12, 1.05, 0.08, L(bx, fy + 0.52, bz0 - 0.02), "#5b3b20", 0.025);
        pictureFrame(fb, L(W + 0.015, fy + 1.55, bz + 0.2, -Math.PI / 2), r, 0.8, 0.55);
      }
      const cx = Math.max(xr0, -W + 1.2) + 0.9, cz = D - 1.5;
      fb.fabric.box(2.0, 0.015, 1.5, L(cx, fy + 0.008, cz), col(pick(r, ["#d0654a", "#3f8f86", "#e2b04e"])));
      fb.wood.add(latheGeo([[0, 0.42], [0.36, 0.42], [0.38, 0.45], [0.36, 0.47], [0, 0.47]], 16), L(cx, fy, cz), col("#a97b4c"));
      fb.woodDark.add(cylGeo(0.04, 0.06, 0.42, 8), L(cx, fy + 0.21, cz), col("#5b3c1e"));
      for (const dx of [-0.85, 0.85]) rattanChair(fb, L(cx + dx, fy, cz, dx > 0 ? -Math.PI / 2 - 0.3 : Math.PI / 2 + 0.3), r);
      plantPot(fb, L(-W + 0.4, fy, D - 0.4), r, 0.34);
      plantPot(fb, L(cx, fy + 0.47, cz, 0), r, 0.09);
      bb(fb.wood, 0.45, 0.8, 1.0, L(-W + 0.25, fy + 0.4, -D + 1.2), "#a8764a", 0.02);
      pictureFrame(fb, L(-W - 0.015, fy + 1.6, 0, Math.PI / 2), r, 0.7, 0.5);
      continue;
    }
    if (f === 0 && b.shop) {
      // ---- produce shop: counter across the right, shelves of crates up the right wall, bananas from the ceiling
      const cz = D - 1.9, cx0 = Math.max(-W + 1.9, 0.1), cL = W - 0.25 - cx0;
      if (cL > 1.2) {
        bb(fb.woodDark, cL, 0.92, 0.55, L(cx0 + cL / 2, fy + 0.46, cz), "#6e4a2c", 0.02);
        for (let k = 0; k < Math.floor(cL / 0.22); k++) fb.wood.box(0.18, 0.8, 0.02, L(cx0 + 0.12 + k * 0.22, fy + 0.46, cz + 0.285), col("#8a5e36", 0.9 + r() * 0.2));
        bb(fb.wood, cL + 0.12, 0.05, 0.7, L(cx0 + cL / 2, fy + 0.95, cz), "#b98b58", 0.015);
        // scale + a basket of mangoes on the counter
        fb.metal.add(chamferBoxGeo(0.28, 0.1, 0.22, 0.02), L(cx0 + 0.4, fy + 1.03, cz), col("#d24b3a"));
        fb.metal.add(latheGeo([[0, 0], [0.16, 0.02], [0.17, 0.05], [0, 0.03]], 14), L(cx0 + 0.4, fy + 1.13, cz), col("#c9ced3"));
        shelfCrate(fb, L(cx0 + cL - 0.45, fy + 0.975, cz, r() * 0.4), r);
      }
      const sx = W - 0.24, z0 = -D + 1.6, z1 = D - 2.6;
      if (z1 - z0 > 1) {
        for (const zz of [z0, z1]) bb(fb.woodDark, 0.44, 2.0, 0.06, L(sx, fy + 1.0, zz), "#5b3c1e", 0.012);
        for (const y of [0.5, 1.2]) {
          fb.wood.box(0.46, 0.04, z1 - z0 + 0.06, L(sx, fy + y, (z0 + z1) / 2), col("#a47748"));
          for (let zz = z0 + 0.3; zz < z1 - 0.2; zz += 0.62) shelfCrate(fb, L(sx - 0.02, fy + y + 0.02, zz, Math.PI / 2 + (r() - 0.5) * 0.2), r, 0.44, 0.3, 0.18);
        }
      }
      for (let k = 0; k < 1; k++) {
        const hx = cx0 + 0.6, hz = D - 1.1;
        fb.rope.add(cylGeo(0.008, 0.008, 0.45, 4), L(hx, ceil - 0.22, hz), col("#c7b58a"));
        bananaHand(fb, L(hx, ceil - 0.5, hz, r() * 6, Math.PI), r, 6, 1.0);
      }
      // sacks + a crate stack at the back
      for (let k = 0; k < 2; k++) addSack(fb, L(xr0 + 0.4 + k * 0.55, fy, stairZ1 + 0.5, r() * 6), r);
      shelfCrate(fb, L(W - 0.5, fy, -D + 0.45, 0.1), r, 0.6, 0.4, 0.3); shelfCrate(fb, L(W - 0.5, fy + 0.3, -D + 0.45, -0.1), r, 0.6, 0.4, 0.3);
    } else if (f === 0) {
      // ---- living room: bordered rug, table + chairs, a cushioned bench, a dresser, pictures, a plant
      const cx = (xr0 + W) / 2, cz = Math.max(stairZ1 + 1.4, -0.2);
      fb.fabric.box(Math.min(2.4, W - xr0 - 0.4), 0.015, 1.8, L(cx, fy + 0.008, cz), col(pick(r, ["#8a3a2c", "#1f5f5a", "#8a6428"])));
      fb.fabric.box(Math.min(2.0, W - xr0 - 0.8), 0.015, 1.4, L(cx, fy + 0.014, cz), col(pick(r, ["#d0654a", "#3f8f86", "#e2b04e"])));
      bb(fb.wood, 1.2, 0.05, 0.8, L(cx, fy + 0.76, cz), "#a97b4c", 0.015);
      for (const [dx, dz] of [[-0.52, -0.32], [0.52, -0.32], [-0.52, 0.32], [0.52, 0.32]]) fb.woodDark.box(0.06, 0.74, 0.06, L(cx + dx, fy + 0.37, cz + dz), col("#5b3c1e"));
      for (const dz of [-0.72, 0.72]) addChair(fb, L(cx, fy, cz + dz, dz > 0 ? Math.PI : 0), r);
      fb.glass.add(cylGeo(0.04, 0.035, 0.12, 8), L(cx + 0.2, fy + 0.84, cz), col("#c8e8e0"));
      plantPot(fb, L(cx - 0.3, fy + 0.785, cz + 0.1), r, 0.1);
      // bench with cushions along the right wall
      if (D - 1.2 - (stairZ1 + 0.3) > 1.6) {
        const bz = (D - 1.2 + stairZ1 + 0.3) / 2;
        bb(fb.woodDark, 0.5, 0.42, 1.6, L(W - 0.3, fy + 0.21, bz), "#6e4a2c", 0.02);
        bb(fb.fabric, 0.46, 0.1, 1.5, L(W - 0.3, fy + 0.47, bz), pick(r, ["#e2b04e", "#3f8f86", "#d0654a"]), 0.04);
        bb(fb.fabric, 0.12, 0.4, 1.5, L(W - 0.1, fy + 0.72, bz, 0, 0, -0.15), pick(r, ["#f4efe1", "#e9dcc4"]), 0.05);
        pictureFrame(fb, L(W + 0.015, fy + 1.65, bz, -Math.PI / 2), r, 0.9, 0.6);
      }
      // dresser against the back wall (right of the stair)
      if (W - stairX1 > 1.4) {
        const dx = (Math.max(stairX1, xr0) + W) / 2;
        bb(fb.wood, Math.min(1.3, W - stairX1 - 0.2), 0.85, 0.45, L(dx, fy + 0.425, -D + 0.25), "#a8764a", 0.02);
        plantPot(fb, L(dx - 0.3, fy + 0.85, -D + 0.25), r, 0.14);
        pictureFrame(fb, L(dx, fy + 1.6, -D + 0.02), r, 0.6, 0.45);
      }
      plantPot(fb, L(W - 0.4, fy, D - 0.45), r, 0.34);
    } else {
      // ---- bedroom: bed (head to the back, right wall), wardrobe, dresser + mirror, rug, chair, picture, plant
      const bw = Math.min(1.6, W - xr0 - 0.3), bx = W - 0.05 - bw / 2, bz0 = Math.max(stairZ1 + 0.1, -D + 0.1), bz1 = bz0 + 2.05;
      if (bw > 0.9 && bz1 < D - 0.4) {
        const bz = (bz0 + bz1) / 2;
        fb.fabric.box(bw + 0.8, 0.015, 2.6, L(bx - 0.2, fy + 0.008, bz + 0.3), col(pick(r, ["#b8543f", "#2f7f78", "#c7913e"])));
        bb(fb.woodDark, bw, 0.3, 2.05, L(bx, fy + 0.17, bz), "#6a4526", 0.03);
        bb(fb.fabric, bw - 0.06, 0.22, 1.98, L(bx, fy + 0.42, bz), pick(r, ["#f4efe4", "#ece2cc", "#e4ece8"]), 0.07);
        bb(fb.fabric, bw + 0.04, 0.07, 1.2, L(bx, fy + 0.54, bz + 0.35), pick(r, ["#d56a4e", "#3f8f86", "#e0b24a", "#6c8ec2"]), 0.03);
        for (const px of bw > 1.2 ? [-0.36, 0.36] : [0]) bb(fb.fabric, 0.55, 0.14, 0.36, L(bx + px, fy + 0.6, bz0 + 0.28, 0, -0.15), "#fbf7ee", 0.06);
        bb(fb.woodDark, bw + 0.12, 1.05, 0.08, L(bx, fy + 0.52, bz0 - 0.02), "#5b3b20", 0.025);
        pictureFrame(fb, L(W + 0.015, fy + 1.55, bz + 0.2, -Math.PI / 2), r, 0.8, 0.55);
      }
      // wardrobe against the right wall toward the front
      if (D - 1.0 > bz1 + 0.8) {
        const wz = (bz1 + 0.2 + D - 0.1) / 2, wl = Math.min(1.3, D - bz1 - 0.4);
        bb(fb.wood, 0.58, 2.0, wl, L(W - 0.3, fy + 1.0, wz), "#9a6a40", 0.03);
        for (const sz of [-1, 1]) { bb(fb.wood, 0.03, 1.6, wl / 2 - 0.12, L(W - 0.6, fy + 1.05, wz + sz * wl / 4), "#a87a4c", 0.01); fb.metal.add(BALL, L(W - 0.62, fy + 1.05, wz + sz * 0.06, 0, 0, 0, 0.022), col("#c9a54a")); }
      }
      // dresser + mirror against the left wall toward the front, chair by the window
      const dz = D - 1.1;
      bb(fb.wood, 0.45, 0.8, 1.0, L(-W + 0.25, fy + 0.4, dz), "#a8764a", 0.02);
      fb.glass.add(new THREE.PlaneGeometry(0.7, 0.9), L(-W + 0.02, fy + 1.4, dz, Math.PI / 2), 0xffffff);
      plantPot(fb, L(-W + 0.25, fy + 0.8, dz - 0.3), r, 0.12);
      addChair(fb, L((xr0 + W) / 2 - 0.4, fy, D - 0.7, Math.PI + 0.5), r);
      plantPot(fb, L(-W + 0.4, fy, D - 0.4), r, 0.3);
    }
  }
}
/** a stilt hut room: sleeping mat + frame at the back, table + stools, crates, a net + lantern on the wall */
function furnishHut(fb: TownBins, p: BuildingParts, L: LFn, r: () => number) {
  const { b, t } = p;
  const W = b.w / 2 - t - 0.04, D = b.d / 2 - t - 0.04, fy = b.y + 0.02;
  bb(fb.woodDark, 1.4, 0.28, 2.0, L(W - 0.75, fy + 0.14, -D + 1.05), "#6a4526", 0.03);
  bb(fb.fabric, 1.34, 0.16, 1.92, L(W - 0.75, fy + 0.36, -D + 1.05), pick(r, ["#e9e2cf", "#d9b25f", "#7fb8b0"]), 0.06);
  bb(fb.fabric, 1.36, 0.06, 1.0, L(W - 0.75, fy + 0.46, -D + 1.3), pick(r, ["#d9483b", "#2f8f86", "#3a86c8"]), 0.03);
  bb(fb.fabric, 0.5, 0.12, 0.34, L(W - 0.75, fy + 0.5, -D + 0.3), "#fbf7ee", 0.05);
  bb(fb.wood, 1.0, 0.05, 0.7, L(-W + 0.9, fy + 0.72, 0), "#a97b4c", 0.015);
  for (const [dx, dz] of [[-0.42, -0.28], [0.42, -0.28], [-0.42, 0.28], [0.42, 0.28]]) fb.woodDark.box(0.05, 0.7, 0.05, L(-W + 0.9 + dx, fy + 0.35, dz), col("#5b3c1e"));
  for (const dx of [-0.6, 0.6]) addStool(fb, L(-W + 0.9 + dx, fy, 0.4, r() * 6, 0, 0, 0.85), r);
  shelfCrate(fb, L(-W + 0.4, fy, -D + 0.35), r, 0.55, 0.4, 0.3);
  shelfCrate(fb, L(-W + 0.95, fy, -D + 0.35, 0.2), r, 0.55, 0.4, 0.3);
  ceilingLamp(fb, L(0, b.y + p.floorH - 0.2, 0), 0.45);
  pictureFrame(fb, L(W + 0.015, fy + 1.6, -D + 1.1, -Math.PI / 2), r, 0.6, 0.45);
}


interface OpeningCtx {
  trimCol: THREE.Color; shutterCol: THREE.Color; doorCol: THREE.Color; trimFn: ColorFn; shutterMode: "closed" | "open" | "mixed"; flowerP: number;
  t: number; rng: () => number; uvo: () => [number, number]; extra: THREE.Object3D[]; lod: 0 | 1 | 2; near: TownBins; front: boolean;
  /** the wall's length + this floor's openings (open shutter leaves must stay on solid wall) */
  wlen?: number; sibs?: Array<{ u: number; w: number }>;
  BB: (bin: GeoBin, w: number, h: number, d: number, m: THREE.Matrix4, c: THREE.Color, bev: number, fn?: ColorFn, keep?: number) => void;
}
function addOpening(bins: TownBins, mats: TownMats, b: TownBuilding, p: BuildingParts, at: (u: number, y: number, off: number) => THREE.Matrix4,
  op: { u: number; w: number; y: number; h: number; kind: string; shutters?: boolean }, fy: number, f: number, c: OpeningCtx) {
  const { rng, t } = c;
  const cu = op.u + op.w / 2, cy = fy + op.y + op.h / 2;
  const fw = 0.15; // architrave width
  if (op.kind === "window" || op.kind === "french" || op.kind === "door" || op.kind === "shop") {
    const hj = op.h + (op.kind === "window" ? 0.12 : fw / 2);
    const jy = op.kind === "window" ? cy + 0.06 : fy + op.y + hj / 2;
    // jambs on EVERY opening at every detail tier: the medium copy (24 m → mid) and the painted LOD1 facade both draw
    // a full frame, so the full shell does too (jambs only on hero / front walls swapped a side window's frame for a
    // bare hole up close)
    c.BB(bins.trim, fw, hj, 0.1, at(op.u - fw / 2, jy, -0.035), c.trimCol, 0.025, c.trimFn);
    c.BB(bins.trim, fw, hj, 0.1, at(op.u + op.w + fw / 2, jy, -0.035), c.trimCol, 0.025, c.trimFn);
    // head: a deeper lintel with a slight overhang
    c.BB(bins.trim, op.w + 2 * fw + 0.12, 0.2, 0.14, at(cu, fy + op.y + op.h + 0.1, -0.05), c.trimCol, 0.03, c.trimFn);
    if (op.kind === "window") c.BB(bins.trim, op.w + 2 * fw + 0.16, 0.09, 0.24, at(cu, fy + op.y - 0.04, -0.06), c.trimCol, 0.025, c.trimFn, 0.02);
    // reveal lining (a darker inside face of the opening so the wall thickness reads)
    bins.plaster.box(op.w, 0.02, t, at(cu, fy + op.y + op.h - 0.01, t / 2), col(b.wall, 0.72));
  }
  if (op.kind === "window") {
    const closed = windowClosed(b, f, op);
    const sw = op.w / 2 - 0.01;
    if (op.shutters !== false && closed) {
      // closed louvred leaves inside the opening
      for (const s of [-1, 1]) bins.louvre.add(new THREE.BoxGeometry(sw, op.h - 0.02, 0.05), at(cu + s * (sw / 2 + 0.005), cy, 0.06), c.shutterCol);
      bins.trim.box(0.04, op.h - 0.02, 0.06, at(cu, cy, 0.04), c.shutterCol.clone().multiplyScalar(0.8));
    } else {
      // glass recessed, shutters folded open against the wall (if any)
      bins.glass.add(quadGeo(op.w, op.h), at(cu, cy, 0.17), 0xffffff);
      // (no cross mullion — every pane breaks and the opening is a vault; a cross left standing in a
      //  smashed window read as bars you could not get through)
      if (b.interior === false) bins.plaster.box(op.w, op.h, 0.02, at(cu, cy, t - 0.01), col("#3a2f28"));
      // (a leaf folded open must lie on solid wall, never past the building's corner in mid-air; the
      //  same leaves collide: town-kit shutterLeaves)
      if (op.shutters !== false) for (const s of shutterLeaves(op, c.wlen ?? 1e9, c.sibs ?? [])) {
        const hinge = s < 0 ? op.u - 0.15 : op.u + op.w + 0.15;
        bins.louvre.add(new THREE.BoxGeometry(sw, op.h - 0.02, 0.05), at(hinge, cy, -0.075).multiply(M(0, 0, 0, s < 0 ? 12 * DEG : -12 * DEG)).multiply(M(s < 0 ? -sw / 2 : sw / 2, 0, 0)), c.shutterCol);
      }
    }
    if (f >= 1 && rng() < c.flowerP) addFlowerBox(c.near, at(cu, fy + op.y - 0.2, -0.2), op.w + 0.1, rng, false);
  }
  if (op.kind === "french") {
    if (b.interior === false) bins.plaster.box(op.w, op.h, 0.02, at(cu, cy, t - 0.01), col("#3a2f28"));
    for (const s of [-1, 1]) {
      const hinge = s < 0 ? op.u : op.u + op.w, lw = op.w / 2 - 0.02, a = s < 0 ? FRENCH_SWING : -FRENCH_SWING;
      const mm = at(hinge, cy, t / 2).multiply(M(0, 0, 0, a)).multiply(M(s < 0 ? lw / 2 : -lw / 2, 0, 0));
      bins.trim.bbox(lw, op.h - 0.02, 0.05, mm, c.shutterCol, 0.012);
      bins.glass.add(quadGeo(lw - 0.18, op.h - 0.5), mm.clone().multiply(M(0, 0.08, 0.03)), 0xffffff);
    }
  }
  if (op.kind === "door") {
    const a = DOOR_SWING; // (swung past square — the leaf clears the doorway; it collides, town-kit openingFill)
    const mm = at(op.u, fy + op.h / 2, t / 2).multiply(M(0, 0, 0, a)).multiply(M(op.w / 2, 0, 0));
    // vertical boards: the planks texture runs along u, so build the leaf lying along x and stand it up
    bins.wood.add(chamferBoxGeo(op.h - 0.04, op.w - 0.03, 0.07, 0.015, c.uvo()).rotateZ(Math.PI / 2), mm, c.doorCol);
    bins.wood.bbox(op.w - 0.36, 0.62, 0.04, mm.clone().multiply(M(0, op.h * 0.24, 0.04)), c.doorCol.clone().multiplyScalar(0.86), 0.015);
    bins.wood.bbox(op.w - 0.36, 0.86, 0.04, mm.clone().multiply(M(0, -op.h * 0.2, 0.04)), c.doorCol.clone().multiplyScalar(0.86), 0.015);
    bins.metal.add(blob0, mm.clone().multiply(M(op.w / 2 - 0.12, -0.1, 0.06, 0, 0, 0, 0.035)), col("#c9a24a"));
    bins.stone.bbox(op.w + 0.5, 0.12, 0.55, at(cu, fy + 0.06, -0.26), col("#d8cdb6"), 0.03);
    // wall lamp beside the door (some)
    if (rng() < 0.35) {
      bins.metal.bbox(0.12, 0.2, 0.1, at(op.u + op.w + 0.45, fy + 2.4, -0.05), col(IRON), 0.01);
      bins.bulb.add(blob0, at(op.u + op.w + 0.45, fy + 2.28, -0.16).multiply(M(0, 0, 0, 0, 0, 0, 0.08, 0.1, 0.08)), col("#ffe9b8"));
    }
  }
  if (op.kind === "shop") {
    // roll-up shutter half open at the head, counter + goods inside, dark interior backing
    const hs = 0.55 + rng() * 0.5;
    bins.tin.add(corrugatedGeo(op.h * 0 + hs, op.w - 0.02, 0.05, 0.01).rotateZ(0), at(cu, fy + op.y + op.h - hs / 2, 0.05).multiply(M(0, 0, 0, 0, Math.PI / 2)).multiply(M(0, 0, 0, Math.PI / 2)), col("#9aa3a8"));
    bins.metal.bbox(op.w + 0.04, 0.26, 0.22, at(cu, fy + op.y + op.h + 0.02, 0.04), col("#8b9196"), 0.03);
    bins.wood.bbox(op.w - 0.3, 0.95, 0.6, at(cu, fy + 0.48, 0.6), col("#7a5a36"), 0.02);
    bins.trim.bbox(op.w - 0.2, 0.06, 0.72, at(cu, fy + 0.98, 0.6), col("#e8dcc4"), 0.015);
    const nC = Math.max(2, Math.floor((op.w - 0.4) / 0.62));
    for (let i = 0; i < nC; i++) {
      const u = op.u + 0.35 + (op.w - 0.7) * (i + 0.5) / nC;
      const crateCol = col(["#2f8f86", "#b98b58", "#c85a3a", "#3a6fb0"][Math.floor(rng() * 4)]);
      bins.wood.bbox(0.5, 0.2, 0.36, at(u, fy + 1.1, 0.55), crateCol, 0.015);
      const banana = rng() < 0.5, fx = fruitSink();
      fruitMound(bins, at(u, fy + 1.19, 0.55), 0.23, 0.07, 0.16, banana ? "banana" : "mango", rng());
      if (fx) {
        if (banana) for (let k = 0; k < 2; k++) fx.hand(at(u - 0.1 + k * 0.08, fy + 1.22, 0.5 + k * 0.1).multiply(M(0, 0, 0, k ? Math.PI : 0, 0, 0.1)), 6, rng() * 0.3);
        else for (let k = 0; k < 6; k++) fx.mango(at(u - 0.16 + (k % 3) * 0.16, fy + 1.24 + (k > 2 ? 0.04 : 0), 0.48 + (k % 2) * 0.13).multiply(M(0, 0, 0, k * 1.3, (rng() - 0.5) * 0.4, 0, 0.125)), rng(), 0.92 + rng() * 0.16);
      }
    }
    if (b.interior === false) bins.plaster.box(op.w, op.h, 0.02, at(cu, fy + op.y + op.h / 2, t + 1.6), col("#3a2f28"));
  }
}

/** a 5-petal flower head (unit radius, cupped, facing +y), vertex colours: white-ish petals (× the tint) + yellow eye */
let flowerG: THREE.BufferGeometry | null = null;
function flowerHead(): THREE.BufferGeometry {
  if (flowerG) return flowerG;
  const seg = 20, pos: number[] = [0, 0.12, 0], colr: number[] = [1.6, 1.3, 0.2], idx: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * Math.PI * 2, r = 0.62 + 0.38 * Math.abs(Math.cos(a * 2.5));
    pos.push(Math.cos(a) * r, 0.25 * r * r, Math.sin(a) * r); colr.push(1, 1, 1);
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + (i + 1) % seg, 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return (flowerG = g);
}

/** hanging laundry silhouettes (top edge at y = 0, hanging down, facing ±z, double-sided material): t-shirt, towel,
 *  trousers, dress */
const garment = (pts: Array<[number, number]>) => { const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))); const p = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) p.setZ(i, 0.03 * Math.sin(p.getX(i) * 7 + p.getY(i) * 3)); g.computeVertexNormals(); return g; };
const GARMENTS = [
  garment([[-0.26, 0], [-0.1, 0], [-0.05, -0.05], [0.05, -0.05], [0.1, 0], [0.26, 0], [0.34, -0.16], [0.22, -0.22], [0.2, -0.62], [-0.2, -0.62], [-0.22, -0.22], [-0.34, -0.16]]),
  garment([[-0.3, 0], [0.3, 0], [0.31, -0.72], [0.18, -0.76], [0.05, -0.72], [-0.1, -0.75], [-0.3, -0.72]]),
  garment([[-0.2, 0], [0.2, 0], [0.22, -0.82], [0.05, -0.82], [0, -0.3], [-0.05, -0.82], [-0.22, -0.82]]),
  garment([[-0.14, 0], [-0.06, -0.02], [0.06, -0.02], [0.14, 0], [0.16, -0.24], [0.3, -0.78], [-0.3, -0.78], [-0.16, -0.24]]),
];

/** window flower box (or balcony rail planter): painted box + red/pink/yellow flower clusters + leaves */
export function addFlowerBox(bins: TownBins, at: THREE.Matrix4, w: number, rng: () => number, hang: boolean) {
  const boxCol = col(["#b5533c", "#3d6a3a", "#8b5a30", "#2f8f86"][Math.floor(rng() * 4)]);
  bins.wood.bbox(w, 0.2, 0.22, at.clone().multiply(M(0, 0.1, hang ? -0.1 : 0)), boxCol, 0.02);
  const n = Math.max(3, Math.round(w / 0.16));
  const fc = FLOWERS[Math.floor(rng() * FLOWERS.length)], fc2 = FLOWERS[Math.floor(rng() * FLOWERS.length)];
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.08 + (w - 0.16) * (i + 0.5) / n, z = (hang ? -0.1 : 0) + (rng() - 0.5) * 0.1;
    // soft leaf clump + real 5-petal flower heads with a yellow eye
    bins.leaf.add(leafClumpGeo(i % 4, 10), at.clone().multiply(M(x, 0.2 + rng() * 0.04, z, rng() * 6, 0, 0, 0.16 + rng() * 0.05, 0.12, 0.16)), col(rng() < 0.5 ? "#3f8a2e" : "#4f9a36"));
    if (rng() < 0.8) for (let k = 0; k < 2; k++) bins.fruit.add(flowerHead(), at.clone().multiply(M(x + (rng() - 0.5) * 0.1, 0.33 + rng() * 0.07, z + (rng() - 0.5) * 0.1, rng() * 6, (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.7, 0.045 + rng() * 0.015)), col(rng() < 0.6 ? fc : fc2));
  }
  // trailing leaves over the front edge
  for (let i = 0; i < Math.round(w / 0.35); i++) bins.leaf.add(leafGeo(0.3, 0.12), at.clone().multiply(M(-w / 2 + 0.15 + i * 0.35, 0.14, (hang ? -0.1 : 0) + 0.12, 0, 0.9 + rng() * 0.4, 0)), col("#3f8a2e"));
}

function addChair(bins: TownBins, at: THREE.Matrix4, rng: () => number) {
  const c = col(["#a97b4c", "#2f8f86", "#c85a3a"][Math.floor(rng() * 3)]);
  bins.wood.bbox(0.44, 0.05, 0.42, at.clone().multiply(M(0, 0.46, 0)), c, 0.012);
  bins.wood.bbox(0.44, 0.45, 0.05, at.clone().multiply(M(0, 0.7, -0.19)), c, 0.012);
  for (const [dx, dz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) bins.woodDark.box(0.04, 0.44, 0.04, at.clone().multiply(M(dx, 0.22, dz)), col(WOOD_DARK));
}

/** rooftop prop (fallback kit — a POI can route these to a better asset kit through BuildOpts.roofProp) */
export function addRoofProp(bins: TownBins, at: THREE.Matrix4, pr: RoofProp, rng: () => number) {
  const s = pr.s ?? 1;
  // tanks / towers / stands / AC / planters come from the market kit (its low copy below hero detail) — the
  // SAME dimensions the shared colliders use (town-kit roofPropShape)
  if (pr.kind === "plastic" || pr.kind === "steel" || pr.kind === "stand" || pr.kind === "tower" || pr.kind === "ac" || pr.kind === "planter") {
    const draw = () => {
      if (pr.kind === "ac") addACUnit(bins, at, rng);
      else if (pr.kind === "planter") addPot(bins, at, rng, { size: 0.5 * s });
      else addWaterTank(bins, at, rng, { kind: pr.kind as "plastic" | "steel" | "stand" | "tower", color: pr.color, scale: s });
    };
    if (curLod >= 2) draw(); else lowDetail(draw);
    return;
  }
  switch (pr.kind) {
    case "crates": for (let k = 0; k < 3; k++) bins.wood.bbox(0.6, 0.34, 0.42, at.clone().multiply(M(k === 2 ? 0 : (k - 0.5) * 0.64, k === 2 ? 0.51 : 0.17, 0, (rng() - 0.5) * 0.3)), col(["#b98b58", "#2f8f86", "#c85a3a"][k]), 0.025); break;
  }
}

/** triangular wedge: base w (x), height rise (y), thickness t (z); apex up */
function wedgeGeo(w: number, rise: number, t: number): THREE.BufferGeometry {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
  return g;
}
/** striped fabric in the XZ plane (w along x, d along z), v pinned inside a stripe-atlas row; `sag` bows the middle */
export function stripeQuad(w: number, d: number, row: number, sag = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 0.5)), 3);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, -sag * Math.sin(Math.PI * (x / w + 0.5)) * Math.sin(Math.PI * (z / d + 0.5)));
    uv.setXY(i, uv.getX(i) * w, (row + 0.15 + 0.7 * uv.getY(i)) / 6);
  }
  g.computeVertexNormals();
  return g;
}
/** hanging valance strip facing +z, scalloped bottom */
export function stripeValance(w: number, h: number, row: number): THREE.BufferGeometry {
  const n = Math.max(4, Math.round(w / 0.25));
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, h / 2);
  shape.lineTo(w / 2, h / 2);
  for (let i = n; i >= 0; i--) {
    const x = -w / 2 + w * i / n;
    if (i < n) shape.quadraticCurveTo(x + w / n / 2, -h / 2 - h * 0.35, x, -h / 2);
    else shape.lineTo(x, -h / 2);
  }
  const g = new THREE.ShapeGeometry(shape);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), (row + 0.15 + 0.7 * (0.5 + pos.getY(i) / h)) / 6);
  return g;
}
/** triangular side cheek of a canvas awning (in the local XY plane of the wall end, facing +z) */
function sideCheek(dep: number, drop: number, row: number): THREE.BufferGeometry {
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(dep, -drop), new THREE.Vector2(dep, -drop - 0.3), new THREE.Vector2(0, -0.3)]);
  const g = new THREE.ShapeGeometry(s);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), (row + 0.15 + 0.7 * (0.5 + pos.getY(i) * 0.5)) / 6);
  return g;
}

function signPalette(b: TownBuilding, rng: () => number): [string, string] {
  const opts: Array<[string, string]> = [["#f1c232", "#3b2a14"], ["#2f8f86", "#f4efe1"], ["#d9483b", "#f7e9c9"], ["#2b4c7e", "#f5d67a"], ["#f4efe1", "#b63a2a"]];
  const pick = opts[Math.floor(rng() * opts.length)];
  return pick[0].toLowerCase() === b.wall.toLowerCase() ? opts[(opts.indexOf(pick) + 1) % opts.length] : pick;
}

/** flat sheet in the XZ plane facing +Y with corrugatedGeo's UV layout (u across, v along) — the tin texture's normal
 *  map carries the ribs */
function flatSheet(w: number, l: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, l); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + w / 2, p.getZ(i) + l / 2);
  return g;
}
let curLod: 0 | 1 | 2 = 2;
/** ribbed plastic / steel water tank on a low stand */
export function addTank(bins: TownBins, at: THREE.Matrix4, color: string, steel: boolean, rng: () => number, scale = 1, stand = true) {
  const r = 0.66 * scale, h = 1.45 * scale;
  const prof: Array<[number, number]> = [[0, 0.02], [r * 0.9, 0.02], [r, 0.1], [r, h * 0.28], [r * 0.965, h * 0.31], [r * 0.965, h * 0.35], [r, h * 0.38], [r, h * 0.6], [r * 0.965, h * 0.63], [r * 0.965, h * 0.67], [r, h * 0.7], [r, h * 0.9], [r * 0.9, h * 0.97], [r * 0.45, h + 0.04], [r * 0.34, h + 0.05], [r * 0.34, h + 0.17], [r * 0.3, h + 0.2], [0, h + 0.2]];
  const c = col(color, 1 + (rng() - 0.5) * 0.1);
  const lift = stand ? 0.3 * scale : 0;
  (steel ? bins.metal : bins.plastic).add(latheGeo(curLod >= 2 ? prof : prof.filter((_, i) => i % 2 === 0 || i === prof.length - 1), curLod >= 2 ? 24 : 12), at.clone().multiply(M(0, lift, 0)), c, (x, y, z, bb, out) => { out.multiplyScalar(0.9 + 0.16 * noise3(x * 2, y * 2, z * 2)); });
  if (stand) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bins.woodDark.bbox(0.1, lift, 0.1, at.clone().multiply(M(sx * r * 0.7, lift / 2, sz * r * 0.7)), col(WOOD_DARK), 0.02);
    bins.woodDark.bbox(r * 1.7, 0.08, r * 1.7, at.clone().multiply(M(0, lift - 0.04, 0)), col("#6a4a2c"), 0.02);
  }
  bins.metal.add(cylGeo(0.04, 0.04, 0.8, 6), at.clone().multiply(M(r * 0.9, lift * 0.6 + 0.08, 0, 0, 0, Math.PI / 2)), col("#8f959b"));
}
/** tall timber water tower with a blue tank */
export function addWaterTower(bins: TownBins, at: THREE.Matrix4, rng: () => number) {
  const h = 3.2, dark = col("#6a4a2c");
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bins.woodDark.bbox(0.18, h, 0.18, at.clone().multiply(M(sx * 0.85, h / 2, sz * 0.85, 0, sx * 0.05, sz * -0.05)), dark, 0.03);
  for (const y of [1.0, 2.2]) for (const s of [[0, 1], [0, -1], [1, 0], [-1, 0]]) bins.woodDark.bbox(1.8, 0.1, 0.1, at.clone().multiply(M(s[0] * 0.85, y, s[1] * 0.85, s[0] ? Math.PI / 2 : 0)), dark, 0.02);
  for (const s of [[0, 1], [0, -1], [1, 0], [-1, 0]]) for (const k of [1, -1]) bins.woodDark.box(0.06, 0.06, 2.3, at.clone().multiply(M(s[0] * 0.86, 1.6, s[1] * 0.86, s[0] ? 0 : Math.PI / 2, k * 0.62)), dark);
  bins.woodDark.bbox(2.2, 0.14, 2.2, at.clone().multiply(M(0, h + 0.07, 0)), col("#7a5634"), 0.03);
  addTank(bins, at.clone().multiply(M(0, h + 0.14, 0)), "#2f5fa0", false, rng, 1.15, false);
  // ladder
  for (const x of [-0.2, 0.2]) bins.woodDark.box(0.05, h, 0.05, at.clone().multiply(M(x, h / 2, 1.0)), dark);
  for (let i = 0; i < 9; i++) bins.woodDark.box(0.4, 0.04, 0.04, at.clone().multiply(M(0, 0.3 + i * 0.34, 1.0)), dark);
}
/** terracotta planter with a leafy clump */
export function addPlanter(bins: TownBins, at: THREE.Matrix4, rng: () => number, size = 0.45) {
  bins.stone.add(latheGeo([[0, 0], [size * 0.7, 0], [size * 0.8, 0.05], [size * 0.95, size * 1.1], [size * 1.05, size * 1.1], [size * 1.05, size * 1.25], [size * 0.9, size * 1.25], [size * 0.8, size * 0.95], [0, size * 0.95]], 14), at, col(["#b8674a", "#c9a27a", "#8b6a4a"][Math.floor(rng() * 3)]), (x, y, z, bb, out) => out.multiplyScalar(0.85 + 0.2 * noise3(x * 4, y * 4, z * 4)));
  bins.leaf.add(leafClumpGeo(Math.floor(rng() * 4), 16), at.clone().multiply(M(0, size * 0.95, 0, rng() * 6, 0, 0, size * 0.8, size * 0.6, size * 0.8)), col("#3e7f2e"));
  const n = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, tilt = 0.5 + rng() * 0.7, len = size * (1.6 + rng() * 1.2);
    bins.leaf.add(leafGeo(len, len * 0.38), at.clone().multiply(M(0, size * 1.1, 0, a, 0, 0)).multiply(M(0, 0, 0, 0, -tilt)).multiply(M(0, 0, len / 2)), col(rng() < 0.5 ? "#3f8f2f" : "#59a63a"));
  }
}
/** a leaf: pointed ellipse in the XZ plane pointing +z, slight fold */
export function leafGeo(len: number, wid: number): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [];
  const n = 6;
  for (let i = 0; i <= n; i++) { const tt = i / n; const w = Math.sin(tt * Math.PI) ** 0.7 * wid / 2; pts.push([-w, (tt - 0.5) * len]); }
  for (let i = n; i >= 0; i--) { const tt = i / n; const w = Math.sin(tt * Math.PI) ** 0.7 * wid / 2; pts.push([w, (tt - 0.5) * len]); }
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape, 3);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, -Math.abs(x) * 0.45 - (z / len) ** 2 * len * 0.25); }
  g.computeVertexNormals();
  return g;
}
