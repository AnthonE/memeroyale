// THE MURK huts: visuals from the SAME resolved parts the colliders use (shared/pois/the-murk.ts resolveHut / hutBoxes).
// Weathered board walls (vertical boards, battens, corner posts, frames, crooked shutters, hanging doors), board-course
// roofs with rafters / fascia / ridge cap / moss, flat roof decks with a kick board + rail, stilts, interior stairs,
// ceilings, and furniture. Bins: TownLod item tiers (main = shell, near = interior finish, fine = furniture).
import * as THREE from "three";
import { M, col, cylGeo, boxGeo, noise3, tubeGeo, catenary, chamferBoxGeo, corrugatedGeo, type ColorFn } from "../_kit/town-geo";
import type { TownBins } from "../_kit/town-materials";
import { addCrate, addBarrel } from "../_kit/town-props";
import { addNet } from "../_kit/town-lagoon";
import { addLongboat } from "../_kit/town-boat";
import { addSack } from "../_kit/town-market";
import { type HutParts, roofAt, WATER_Y, hutStilts, porchRoofParts, INTERIOR_ROOMS } from "../../../../../shared/pois/the-murk";
/** kit rooms that paint their own inner wall skin (the rest show this hut's vertical board lining) */
const kitRooms = new Set(INTERIOR_ROOMS.filter((r) => r.finish?.wall).map((r) => r.id));
import { soft, addPost, murkLantern, murkCrate, prismXY, ROPE } from "./geo";

type V2 = [number, number];
const STAIN = new THREE.Color("#4a5230");

export interface HutBins { main: TownBins; near: TownBins; fine: TownBins; lod1: TownBins }

export function addHut(B: HutBins, p: HutParts, groundAt: (x: number, z: number) => number, rng: () => number) {
  const h = p.h, { w, d, t, floorH } = h;
  const base = new THREE.Matrix4().makeRotationY(h.yaw).setPosition(h.x, 0, h.z);
  const L = (lx: number, ly: number, lz: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => base.clone().multiply(M(lx, ly, lz, yaw, pitch, roll, sx, sy, sz));
  const W = (lx: number, lz: number): V2 => { const c = Math.cos(h.yaw), s = Math.sin(h.yaw); return [h.x + lx * c + lz * s, h.z - lx * s + lz * c]; };
  const m = B.main, nb = B.near, fb = B.fine;
  // (+15 % albedo — otherwise the huts read as dark boxes at 40 m under the canopy)
  const wallC = soft(h.wall, 0.42, 1.18), trimC = soft(h.trim, 0.6, 1.0), inC = soft(h.wall, 0.25, 0.86);
  const doorC = soft(h.door, 0.75, 1.0), roofC = soft(h.roofCol, 0.35, 1.0);
  const tone = 0.94 + rng() * 0.1;
  // walls: grime at the base, soft darkening under the eaves, blotchy weathering
  const wallFn: ColorFn = (x, y, z, b, o) => {
    const k = Math.min(1, Math.max(0, (y - h.y) / 1.1));
    const n = noise3(x * 0.6, y * 0.45, z * 0.6);
    o.multiplyScalar(tone * (0.72 + 0.28 * k) * (0.9 + 0.2 * n) * (1 - 0.12 * Math.max(0, (y - (h.y + p.H - 0.6)) / 0.6)));
    // swamp wear: a green-brown algae / water stain climbing from the sill (the bottom vertices of each board piece
    // carry it, so it fades up the wall), patchier where the noise is high
    if (y - h.y < 0.35) o.lerp(STAIN, 0.28 + 0.2 * n);
  };
  const uvo = (): [number, number] => [rng() * 4, rng() * 4];

  // ---------------------------------------------------------------- stilts + floor structure
  {
    const nz = Math.max(2, Math.round(d / 2.4));
    // stilts: exactly the shared layout's (colliders from the same list); the smokehouse stands on the platform
    if (h.y < 5) for (const [x, z, r] of hutStilts(h)) addPost(m, x, z, h.y - 0.26, Math.min(groundAt(x, z), WATER_Y) - 0.7, r * (0.95 + rng() * 0.15), rng, false);
    // bearers under the floor
    if (h.y < 5) for (let j = 0; j <= nz; j++) { const lz = -d / 2 + 0.2 + (d - 0.4) * j / nz; m.wood.box(w + 0.2, 0.18, 0.16, L(0, h.y - 0.34, lz), col("#6e5a44")); }
    // cross braces on the long sides (tall stilts only)
    if (h.y < 5 && h.y - WATER_Y > 1.2) for (const s of [-1, 1]) {
      const len = Math.hypot(w - 0.4, h.y - 0.5 - WATER_Y), ang = Math.atan2(h.y - 0.5 - WATER_Y, w - 0.4);
      m.wood.box(len, 0.1, 0.1, L(0, (h.y - 0.4 + WATER_Y) / 2, s * (d / 2 - 0.2), 0, 0, ang), col("#6a5238"));
      m.wood.box(len, 0.1, 0.1, L(0, (h.y - 0.4 + WATER_Y) / 2, s * (d / 2 - 0.2), 0, 0, -ang), col("#6a5238"));
    }
  }

  // the boat slip is LINED: board skirts down both sides and across the inner end, from under the floor into the
  // bed (shared hutBoxes: the same boards collide — a wader in the slip has the floor edge + crates as cover)
  if (h.slip) {
    const S = h.slip, top = h.y - 0.24, bot = WATER_Y - 1.4;
    const runs: Array<[number, number, number, number]> = [[S.x0 - 0.05, S.z0, S.x0 - 0.05, S.z1 + 0.05], [S.x1 + 0.05, S.z0, S.x1 + 0.05, S.z1 + 0.05], [S.x0 - 0.05, S.z1 + 0.05, S.x1 + 0.05, S.z1 + 0.05]];
    for (const [ax, az, bx, bz] of runs) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.24)), yaw = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, wb = len / n - 0.015, r0 = rng();
        m.clapboard.add(chamferBoxGeo(0.06, top - bot, wb, 0.008, [rng() * 3, rng() * 3]), L(ax + (bx - ax) * u, (top + bot) / 2, az + (bz - az) * u, yaw), wallC.clone().multiplyScalar(0.62 + r0 * 0.25), (x, y, z, b, o) => { if (y < WATER_Y + 0.25) o.lerp(STAIN, 0.6).multiplyScalar(0.7); });
      }
      m.wood.box(0.12, 0.14, len + 0.1, L((ax + bx) / 2, WATER_Y + 0.15, (az + bz) / 2, yaw), col("#4a3a2a"));
    }
  }

  // ---------------------------------------------------------------- floors / slabs (planks up, dark boards under)
  for (const s of p.slabs) {
    const isRoof = !!s.roof;
    for (const r of s.rects) {
      const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2, rw = r[2] - r[0], rd = r[3] - r[1];
      if (rw < 0.02 || rd < 0.02) continue;
      // planks run along local x (texture U) — top board layer
      (s.floor === 0 || isRoof ? m : nb).woodDark.box(rw, 0.07, rd, L(cx, s.y - 0.035, cz), soft("#b89a78", 0.3, 0.98), uvo());
      // the slab body / ceiling underneath (dark boards)
      if (s.floor > 0) nb.wood.box(rw, s.t - 0.07, rd, L(cx, s.y - 0.07 - (s.t - 0.07) / 2, cz), soft("#7a6450", 0.5, 0.75), uvo());
      else m.wood.box(rw, s.t - 0.07, rd, L(cx, s.y - 0.07 - (s.t - 0.07) / 2, cz), soft("#6a5642", 0.5, 0.7), uvo());
    }
  }

  // ---------------------------------------------------------------- walls + openings
  for (const wl of p.walls) {
    const th = Math.atan2(-wl.dir[1], wl.dir[0]);
    const at = (u: number, y: number, off: number, yaw = 0, pitch = 0, roll = 0) => L(wl.A[0] + wl.dir[0] * u - wl.n[0] * off, y, wl.A[1] + wl.dir[1] * u - wl.n[1] * off, th + yaw, pitch, roll);
    for (let f = 0; f < h.floors; f++) {
      const fy = h.y + f * floorH;
      for (const pc of wl.pieces[f]) {
        // the board wall core (both faces textured; the inside face is the room's board lining)
        m.clapboard.box(pc.w, pc.h, t, at(pc.u + pc.w / 2, fy + pc.y + pc.h / 2, t / 2), wallC, [pc.u * 0.9 + f * 1.3, fy + pc.y], wallFn);
        // the OUTSIDE skin = individual bevelled boards, each its own width / tint / value (sun-bleached grey,
        // weathered brown, a newer reddish replacement), spliced at a random height; a water-stain gradient climbs from
        // the sill (darker + greener at the bottom of each lower board)
        if (pc.h > 0.25) {
          let u = pc.u;
          while (u < pc.u + pc.w - 0.04) {
            const bw = Math.min(pc.u + pc.w - u, 0.17 + rng() * 0.12), r0 = rng();
            const tint = (r0 < 0.08 ? new THREE.Color("#e0d8c8") : r0 < 0.13 ? new THREE.Color("#e8b898") : new THREE.Color("#ffffff")).multiplyScalar(0.93 + rng() * 0.12);
            const bc = wallC.clone().multiply(tint);
            const split = pc.y < 0.1 && pc.h > 1.6 && rng() < 0.35 ? 0.8 + rng() * 0.6 : 0;
            const segs: Array<[number, number]> = split ? [[0, split], [split, pc.h]] : [[0, pc.h]];
            for (const [a0, a1] of segs) {
              const lower = a0 === 0 && pc.y < 0.1;
              const stain: ColorFn = (x, y, z, b, o) => {
                wallFn(x, y, z, b, o);
                const k = Math.max(0, 1 - (y - h.y) / 1.25);
                if (lower && k > 0) o.lerp(STAIN, 0.42 * k).multiplyScalar(1 - 0.2 * k);
              };
              // (the texture runs on continuously across the boards — wall-space UVs — so the wall reads as one weathered
              // skin with board joints, not a patchwork)
              m.clapboard.add(chamferBoxGeo(bw - 0.012, a1 - a0 - 0.006, 0.03, 0.009, [u + f * 1.3, fy + pc.y + a0]), at(u + bw / 2, fy + pc.y + (a0 + a1) / 2, -0.014, 0, 0, (rng() - 0.5) * 0.006), bc, stain);
            }
            u += bw;
          }
        }
        // interior lining tone (a thin darker skin so the inside reads warm-dark, not the outside's sun-bleach) — storeys
        // furnished by the interiors kit get the kit's panelled / painted inner skin instead
        if (!kitRooms.has(`murk-${h.id}-${f}`)) nb.clapboard.box(pc.w - 0.02, pc.h - 0.02, 0.02, at(pc.u + pc.w / 2, fy + pc.y + pc.h / 2, t + 0.011), inC, [pc.u + 3, fy], wallFn);
      }
      // sill beam + top plate outside
      m.wood.box(wl.len + 0.1, 0.16, 0.08, at(wl.len / 2, fy + 0.08, -0.04), trimC);
      m.wood.box(wl.len + 0.1, 0.12, 0.08, at(wl.len / 2, fy + floorH - 0.06, -0.04), trimC);
      for (const op of wl.openings[f]) {
        const oy = fy + op.y, cu = op.u + op.w / 2;
        // chunky frame boards (outside), lintel, sill
        for (const s of [-1, 1]) m.wood.bbox(0.11, op.h + 0.1, 0.07, at(cu + s * (op.w / 2 + 0.05), oy + op.h / 2, -0.03), trimC, 0.015);
        m.wood.bbox(op.w + 0.34, 0.13, 0.08, at(cu, oy + op.h + 0.065, -0.035), trimC, 0.015);
        // reveal boards (wall thickness) inside the opening
        for (const s of [-1, 1]) nb.wood.box(0.03, op.h, t, at(cu + s * (op.w / 2 - 0.015), oy + op.h / 2, t / 2), trimC);
        nb.wood.box(op.w, 0.03, t, at(cu, oy + op.h - 0.015, t / 2), trimC);
        if (op.kind === "window") {
          m.wood.bbox(op.w + 0.26, 0.07, 0.16, at(cu, oy - 0.035, -0.06), trimC, 0.015);
          // shutters: two plank leaves on strap hinges at the sides, folded back FLAT against the wall (not sticking
          // out ~90° into the porches — walk-through panels at head height); some window gets one hanging crooked
          const crooked = rng() < 0.3;
          for (const s of [-1, 1]) {
            const open = 0.03 + rng() * 0.05, lw = op.w / 2 - 0.02;
            const hx = cu + s * (op.w / 2 + 0.1);
            const g = at(hx, oy + op.h / 2, -0.045, s * -open, 0, crooked && s > 0 ? 0.12 : 0);
            // the strap hinges (iron) on the frame
            for (const yy of [0.3, -0.3]) m.metal.box(0.16, 0.035, 0.012, at(hx - s * 0.03, oy + op.h / 2 + op.h * yy, -0.075), col("#2e2a26"));
            const leaf = g.clone().multiply(M(s * lw / 2, crooked && s > 0 ? -0.08 : 0, 0));
            m.clapboard.box(lw, op.h - 0.06, 0.04, leaf, doorC, uvo());
            m.wood.box(lw - 0.04, 0.08, 0.05, leaf.clone().multiply(M(0, op.h * 0.28, 0)), col("#5a4430"));
            m.wood.box(lw - 0.04, 0.08, 0.05, leaf.clone().multiply(M(0, -op.h * 0.28, 0)), col("#5a4430"));
          }
        } else {
          // the door leaf, swung OUT flat against the wall beside the opening (never in the passage)
          const lw = Math.min(1.1, op.w - 0.1), hinge = cu - op.w / 2 - 0.02;
          const g = at(hinge, oy + (op.h - 0.1) / 2 + 0.02, -0.06, Math.PI * 0.975);
          const leaf = g.clone().multiply(M(lw / 2, 0, 0));
          m.clapboard.box(lw, op.h - 0.12, 0.05, leaf, doorC, uvo());
          for (const yy of [-0.8, 0, 0.8]) m.wood.box(lw - 0.06, 0.1, 0.06, leaf.clone().multiply(M(0, yy, 0.01)), col("#5a4430"));
          m.metal.box(0.03, 0.12, 0.05, leaf.clone().multiply(M(lw / 2 - 0.12, 0, 0.04)), col("#2b2b28"));
          // a worn threshold plank
          m.woodDark.box(op.w + 0.1, 0.04, t + 0.1, at(cu, fy + 0.02, t / 2), col("#8a7258"));
        }
      }
    }
    // corner posts (at the wall's start corner: A), outside
    const [cxA, czA] = [wl.A[0] - wl.dir[0] * 0.04 + wl.n[0] * 0.02, wl.A[1] - wl.dir[1] * 0.04 + wl.n[1] * 0.02];
    m.wood.bbox(0.2, p.H + 0.1, 0.2, L(cxA, h.y + p.H / 2 - 0.02, czA), trimC, 0.03);
  }

  // ---------------------------------------------------------------- roof
  const ov = h.overhang;
  if (h.roof === "flat") {
    // kick board parapet (solid, 0.55 m) + posts + top rail (the rail collider is noShoot)
    for (const wl of p.walls) {
      const th = Math.atan2(-wl.dir[1], wl.dir[0]);
      const at = (u: number, y: number, off: number) => L(wl.A[0] + wl.dir[0] * u - wl.n[0] * off, y, wl.A[1] + wl.dir[1] * u - wl.n[1] * off, th);
      m.clapboard.box(wl.len, 0.55, 0.14, at(wl.len / 2, p.roofY + 0.19, 0.07), wallC, uvo(), wallFn);
      m.wood.box(wl.len + 0.12, 0.08, 0.2, at(wl.len / 2, p.roofY + 0.5, 0.07), trimC);
      const n = Math.max(1, Math.round(wl.len / 1.6));
      for (let i = 0; i < n; i++) { const u = (i + 0.5) * wl.len / n; m.wood.box(0.08, 0.52, 0.08, at(u, p.roofY + 0.78, 0.07), trimC); }
      m.wood.bbox(wl.len + 0.1, 0.09, 0.11, at(wl.len / 2, p.roofY + 1.06, 0.07), trimC, 0.02);
    }
    // roof hatch frame around the stair hole (the last flight is the roof stair)
    const rf = h.stairs.find((s) => s.toRoof);
    if (rf) {
      const run = Math.round(floorH / 0.2) * 0.27, x0 = rf.x - rf.dir * 0.1, x1 = rf.x + rf.dir * (run + 0.25);
      for (const s of [-1, 1]) m.wood.box(Math.abs(x1 - x0), 0.2, 0.1, L((x0 + x1) / 2, p.roofY + 0.1, rf.z + s * (rf.w / 2 + 0.4)), trimC);
      // the hatch lid flipped open
      m.clapboard.box(1.0, 0.05, rf.w, L(x1 + rf.dir * 0.1, p.roofY + 0.5, rf.z, 0, 0, rf.dir * 1.2), doorC, uvo());
    }
  } else {
    const gable = h.roof === "gable";
    const run = gable ? d / 2 + ov : d + 2 * ov;
    const ang = Math.atan(h.pitch), sl = run / Math.cos(ang), Lx = w + 2 * ov + 0.1;
    const sides = gable ? [1, -1] : [1];
    for (const sg of sides) {
      // plane at mid-run; the board courses (the roof set's horizontal courses run along local x)
      const zc = gable ? sg * run / 2 : (-d / 2 - ov) + run / 2;
      const yc = roofAt(p, zc) + 0.095;
      const g = L(0, yc, zc, 0, gable ? sg * ang : ang, 0);
      // board courses with MOSS grown into the low, shaded parts (vertex tint — no stuck-on moss blobs)
      const MOSSC = new THREE.Color("#5f7a2e"), MOSSD = new THREE.Color("#3f5a22");
      m.tin.box(Lx, 0.09, sl, g, roofC, [rng() * 2, 0], (x, y, z, b, o) => {
        const nn = noise3(x * 0.5, y * 0.5, z * 0.5), mm = noise3(x * 0.9 + 11, y * 1.3, z * 0.9);
        o.multiplyScalar(0.86 + 0.25 * nn);
        const low = 1 - Math.min(1, Math.max(0, (y - p.tipY) / Math.max(0.5, p.ridgeY - p.tipY)));
        const k = Math.max(0, mm - 0.52) * 3.2 * (0.35 + 0.65 * low);
        if (k > 0) o.lerp(mm > 0.7 ? MOSSD : MOSSC, Math.min(0.8, k));
      });
      // rafters under the roof every ~0.9 m
      for (let x = -w / 2; x <= w / 2 + 0.01; x += w / Math.round(w / 0.9)) nb.wood.box(0.08, 0.12, sl - 0.1, g.clone().multiply(M(x, -0.105, 0)), col("#5a4634"));
      // fascia board at the eave tip
      m.wood.box(Lx, 0.2, 0.05, g.clone().multiply(M(0, -0.05, sl / 2 + 0.02)), trimC);
      // a patched tin sheet
      // a patch of rusty corrugated tin nailed over a leak (a flat pale board reads as a skylight)
      if (rng() < 0.55) m.metal.add(corrugatedGeo(0.9 + rng() * 0.4, 1.0 + rng() * 0.5, 0.076, 0.016, 4), g.clone().multiply(M((rng() - 0.5) * (Lx - 2), 0.06, (rng() - 0.5) * sl * 0.5, (rng() - 0.5) * 0.3)), col("#5a3a26"), (x, y, z, b, o) => { const n = noise3(x * 2.2, y * 2.2, z * 2.2); o.lerp(new THREE.Color(n > 0.5 ? "#6e3418" : "#3e2c22"), 0.6); });
    }
    if (gable) {
      // ridge cap: two boards in a V + a moss line
      m.wood.box(Lx + 0.05, 0.06, 0.34, L(0, p.ridgeY + 0.16, 0.13, 0, ang), trimC);
      m.wood.box(Lx + 0.05, 0.06, 0.34, L(0, p.ridgeY + 0.16, -0.13, 0, -ang), trimC);
    } else {
      m.wood.box(Lx, 0.2, 0.05, L(0, roofAt(p, -d / 2 - ov) + 0.05, -d / 2 - ov - 0.02, 0, ang), trimC);
    }
    // gable / side infill between the wall top and the roof (both side walls: ±x)
    for (const sx of [-1, 1]) {
      const pts: Array<[number, number]> = gable
        ? [[-d / 2, 0], [d / 2, 0], [0, p.ridgeY - (h.y + p.H)]]
        : [[-d / 2, 0], [d / 2, 0], [d / 2, roofAt(p, d / 2) - (h.y + p.H)], [-d / 2, roofAt(p, -d / 2) - (h.y + p.H)]];
      // shape u runs along local −z → +z; place on the x = ±(w/2 − t/2) plane facing ±x
      const g = prismXY(pts.map(([u, y]) => [u, y]), t);
      m.clapboard.add(g, L(sx * (w / 2 - t / 2), h.y + p.H, 0, -Math.PI / 2), wallC, wallFn);
      // a small gable vent
      if (gable) m.wood.box(0.05, 0.4, 0.6, L(sx * (w / 2 + 0.01), h.y + p.H + (p.ridgeY - h.y - p.H) * 0.45, 0), col("#3a2a1e"));
    }
  }

  // ---------------------------------------------------------------- porch roof (shed on posts over the front porch)
  if (h.porchRoof) {
    const q = porchRoofParts(p), ang = Math.atan2(q.y0 - q.y1, q.z1 + 0.2 - q.z0), sl = Math.hypot(q.z1 + 0.2 - q.z0, q.y0 - q.y1);
    const zc = (q.z0 + q.z1 + 0.2) / 2, yc = (q.y0 + q.y1) / 2 + 0.1;
    const g = L(q.sh, yc, zc, 0, ang, 0);
    m.tin.box(q.w + 0.2, 0.08, sl, g, roofC, [rng() * 2, 0]);
    m.wood.box(q.w + 0.2, 0.18, 0.05, g.clone().multiply(M(0, -0.06, sl / 2 + 0.02)), trimC);
    m.wood.box(q.w, 0.16, 0.14, L(q.sh, q.y1 - 0.02, q.z1 - 0.15), trimC);
    for (let x = q.sh - q.w / 2 + 0.3; x <= q.sh + q.w / 2 - 0.2; x += 1.0) nb.wood.box(0.07, 0.1, sl - 0.2, g.clone().multiply(M(x - q.sh, -0.09, 0)), col("#5a4634"));
    for (const [px, pz] of q.posts) { const [wx, wz] = W(px, pz); addPost(m, wx, wz, q.y1 - 0.02, h.y - 0.02, 0.09, rng, true, "#b8a080"); }
    // a lantern under it, a hanging float line
    murkLantern(nb, L(q.sh + q.w / 2 - 0.6, q.y1 - 0.45, q.z1 - 0.4));
  }

  // ---------------------------------------------------------------- interior flights
  for (const f of p.flights) {
    const tread = f.tread, rise = f.rise / f.n;
    for (let i = 0; i < f.n; i++) {
      const u = (i + 0.5) * tread, top = f.y0 + (i + 1) * rise;
      nb.woodDark.box(tread + 0.03, 0.05, f.w, L(f.x + f.dir * u, top - 0.025, f.z), soft("#b89a78", 0.3, 0.95), uvo());
      nb.wood.box(0.03, rise, f.w - 0.04, L(f.x + f.dir * (u - tread / 2 + 0.015), top - rise / 2 - 0.02, f.z), col("#6a5642"));
    }
    const run = f.n * tread, sl = Math.hypot(run, f.rise), a = Math.atan2(f.rise, run);
    for (const s of [-1, 1]) nb.wood.box(sl, 0.24, 0.06, L(f.x + f.dir * run / 2, f.y0 + f.rise / 2 - 0.1, f.z + s * (f.w / 2 + 0.03), 0, 0, f.dir * a), col("#5a4634"));
    // guard rail on the floor above along the hole edge (matches the noShoot collider)
    const g0 = run * 0.3, g1 = run - 1.1;
    if (g1 - g0 > 0.4) {
      const gx = f.x + f.dir * (g0 + g1) / 2, gl = g1 - g0;
      for (const k of [-0.5, 0, 0.5]) nb.wood.box(0.07, 1.0, 0.07, L(gx + f.dir * k * gl, f.y0 + f.rise + 0.5, f.z + f.w / 2 + 0.4), col("#5a4634"));
      nb.wood.box(gl, 0.08, 0.09, L(gx, f.y0 + f.rise + 1.0, f.z + f.w / 2 + 0.4), col("#6a5642"));
      nb.wood.box(gl, 0.06, 0.07, L(gx, f.y0 + f.rise + 0.5, f.z + f.w / 2 + 0.4), col("#6a5642"));
    }
  }
  if (h.loft) {
    const y = h.y + h.loft.h;
    const st0 = h.stairs[0], ra = st0 ? st0.x + st0.dir * Math.round(h.loft.h / 0.2) * 0.27 + 0.5 : -0.2, rb = w / 2 - t;
    for (let x = ra; x <= rb + 0.01; x += (rb - ra) / Math.round((rb - ra) / 1.1)) nb.wood.box(0.07, 1.0, 0.07, L(x, y + 0.5, h.loft.z0 + 0.05), col("#5a4634"));
    nb.wood.box(rb - ra, 0.08, 0.09, L((ra + rb) / 2, y + 1.0, h.loft.z0 + 0.05), col("#6a5642"));
    nb.wood.box(rb - ra, 0.06, 0.07, L((ra + rb) / 2, y + 0.5, h.loft.z0 + 0.05), col("#6a5642"));
    // loft posts down to the floor
    for (const x of [-w / 2 + 0.6, 0, w / 2 - 0.6]) nb.wood.box(0.16, h.loft.h, 0.16, L(x, h.y + h.loft.h / 2, h.loft.z0 + 0.1), col("#5a4634"));
  }

  // ---------------------------------------------------------------- furniture (fine tier)
  for (const f of h.furniture) {
    const at = L(f.x, h.y + f.y, f.z, f.yaw);
    const T = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) => at.clone().multiply(M(x, y, z, yaw, pitch, roll));
    switch (f.kind) {
      case "table": {
        fb.wood.bbox(f.w, 0.07, f.d, T(0, f.h - 0.035, 0), col("#b08a64"), 0.02);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) fb.wood.box(0.08, f.h - 0.07, 0.08, T(sx * (f.w / 2 - 0.1), (f.h - 0.07) / 2, sz * (f.d / 2 - 0.1)), col("#6a5238"));
        // clutter: a lantern, a jar, a plate
        murkLantern(fb, T(f.w * 0.25, f.h, 0));
        fb.glass.add(cylGeo(0.07, 0.07, 0.18, 8), T(-f.w * 0.2, f.h + 0.09, 0.1), col("#8fa87a"));
        break;
      }
      case "stool": fb.wood.add(cylGeo(0.2, 0.18, 0.06, 10), T(0, f.h, 0), col("#9a7650")); for (let i = 0; i < 3; i++) fb.wood.box(0.05, f.h, 0.05, T(Math.cos(i * 2.1) * 0.12, f.h / 2, Math.sin(i * 2.1) * 0.12), col("#6a5238")); break;
      case "bed": case "bunk": {
        const levels = f.kind === "bunk" ? [0.4, 1.45] : [0.35];
        for (const ly of levels) {
          fb.wood.box(f.w, 0.12, f.d, T(0, ly, 0), col("#7a5a3c"));
          fb.fabric.bbox(f.w - 0.1, 0.16, f.d - 0.1, T(0, ly + 0.14, 0), col("#b7a88a"), 0.05);
          fb.fabric.bbox(f.w * 0.55, 0.06, f.d - 0.06, T(f.w * 0.18, ly + 0.24, 0, 0.05), col(["#7a3a2a", "#3a5a6a", "#6a6a3a"][Math.floor(rng() * 3)]), 0.02);
          fb.fabric.bbox(0.4, 0.12, f.d * 0.6, T(-f.w / 2 + 0.3, ly + 0.28, 0), col("#e0d6bc"), 0.05);
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) fb.wood.box(0.08, f.h, 0.08, T(sx * (f.w / 2 - 0.04), f.h / 2, sz * (f.d / 2 - 0.04)), col("#5a4430"));
        break;
      }
      case "shelf": case "locker": {
        const metal = f.kind === "locker";
        const bin = metal ? fb.metal : fb.wood, c = metal ? col("#5a6a5e") : col("#8a6a48");
        bin.box(f.w, f.h, 0.03, T(0, f.h / 2, -f.d / 2 + 0.015), c);
        for (const s of [-1, 1]) bin.box(0.04, f.h, f.d, T(s * (f.w / 2 - 0.02), f.h / 2, 0), c);
        const nS = metal ? 2 : 4;
        for (let i = 0; i <= nS; i++) bin.box(f.w - 0.06, 0.03, f.d - 0.02, T(0, 0.08 + i * (f.h - 0.12) / nS, 0), c);
        if (!metal) for (let i = 0; i < nS; i++) for (let k = 0; k < 4; k++) {
          const q = rng();
          if (q < 0.4) fb.glass.add(cylGeo(0.06, 0.06, 0.2, 8), T(-f.w / 2 + 0.2 + k * (f.w - 0.3) / 4, 0.2 + i * (f.h - 0.12) / nS, 0), col(["#9fb27a", "#c8a860", "#7a9aa0"][Math.floor(rng() * 3)]));
          else if (q < 0.7) addCrate(fb, T(-f.w / 2 + 0.25 + k * (f.w - 0.3) / 4, 0.1 + i * (f.h - 0.12) / nS, 0, rng()), "#9a7a52", 0.26, 0.18, 0.22);
        }
        else fb.metal.box(f.w - 0.1, f.h - 0.1, 0.02, T(0, f.h / 2, f.d / 2 - 0.01), col("#6a7a6e"));
        break;
      }
      case "counter": {
        fb.clapboard.box(f.w, f.h - 0.06, f.d, T(0, (f.h - 0.06) / 2, 0), soft("#7a5a3c", 0.4), [rng() * 2, 0]);
        fb.wood.bbox(f.w + 0.1, 0.06, f.d + 0.1, T(0, f.h - 0.03, 0), col("#a07a52"), 0.02);
        murkLantern(fb, T(-f.w / 2 + 0.3, f.h, 0));
        for (let k = 0; k < 3; k++) fb.glass.add(cylGeo(0.08, 0.08, 0.22, 8), T(0.2 + k * 0.3, f.h + 0.11, 0), col("#b8c890"));
        break;
      }
      case "stove": {
        fb.metal.bbox(f.w, f.h, f.d, T(0, f.h / 2, 0), col("#2e2c2a"), 0.04);
        fb.metal.add(cylGeo(0.08, 0.08, h.y + p.H - (h.y + f.y + f.h) + 1.2, 8), T(0, f.h + (p.H - f.y - f.h + 1.2) / 2, -f.d / 4), col("#3a3632"));
        fb.bulb.box(f.w * 0.5, 0.12, 0.02, T(0, f.h * 0.35, f.d / 2 + 0.01), col("#ff8a3a"));
        break;
      }
      case "crate": murkCrate(fb, at, f.w, f.h * 0.5 - 0.004, f.d, "#c8a47c", rng); murkCrate(fb, T(0.02, f.h * 0.5, 0, 0.2), f.w * 0.94, f.h * 0.5 - 0.004, f.d * 0.94, "#d8b088", rng); break;
      case "barrel": addBarrel(fb, at, "#8a6a44", false); break;
      case "netpile": addNet(fb, T(0, 0.02, 0, 0, -Math.PI / 2), f.w, f.d, 0.3, rng); fb.net.add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), T(0, 0, 0, 0, 0, 0).multiply(M(0, 0, 0, 0, 0, 0, f.w / 2, f.h, f.d / 2)), col("#cfc4a0")); break;
      case "rack": {
        if (f.col === false) {
          // smokehouse fish rack: poles + hanging fish
          for (const s of [-1, 1]) fb.wood.add(cylGeo(0.03, 0.03, f.w, 6), T(0, 0, s * f.d / 3, 0, 0, Math.PI / 2), col("#4a3624"));
          for (let k = 0; k < 10; k++) { const x = -f.w / 2 + 0.15 + k * (f.w - 0.3) / 9; for (const s of [-1, 1]) fb.fabric.add(new THREE.CapsuleGeometry(0.05, 0.22, 3, 6), T(x, -0.2, s * f.d / 3, 0, 0, 0.1), col("#b0703a")); }
        } else {
          // fishing-rod rack
          fb.wood.box(f.w, 0.08, f.d, T(0, 0.3, 0), col("#6a5238")); fb.wood.box(f.w, 0.08, f.d, T(0, 1.4, 0), col("#6a5238"));
          for (let k = 0; k < 6; k++) fb.wood.add(cylGeo(0.012, 0.02, f.h, 5), T(-f.w / 2 + 0.15 + k * (f.w - 0.3) / 5, f.h / 2, 0, 0, 0.05, 0), col("#3a2a1e"));
        }
        break;
      }
      case "tank": {
        fb.plastic.add(cylGeo(f.w / 2, f.w / 2, f.h * 0.8, 16), T(0, f.h * 0.4 + 0.2, 0), col(f.h > 1.2 ? "#4a6a5a" : "#3a5a5a"));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) fb.wood.box(0.08, 0.2, 0.08, T(sx * f.w * 0.3, 0.1, sz * f.w * 0.3), col("#5a4430"));
        break;
      }
      case "workbench": {
        fb.wood.bbox(f.w, 0.08, f.d, T(0, f.h - 0.04, 0), col("#a88460"), 0.02);
        fb.wood.box(f.w - 0.1, 0.05, f.d - 0.1, T(0, 0.25, 0), col("#7a5a3c"));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) fb.wood.box(0.09, f.h, 0.09, T(sx * (f.w / 2 - 0.08), f.h / 2, sz * (f.d / 2 - 0.08)), col("#5a4430"));
        fb.rope.add(new THREE.TorusGeometry(0.22, 0.05, 6, 16), T(0.4, f.h + 0.04, 0, 0, Math.PI / 2), col(ROPE));
        fb.metal.box(0.35, 0.05, 0.08, T(-0.4, f.h + 0.03, 0.1, 0.4), col("#4a4a48"));
        break;
      }
      case "firepit": {
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; fb.rock.add(new THREE.IcosahedronGeometry(0.16, 0), T(Math.cos(a) * f.w * 0.42, 0.1, Math.sin(a) * f.w * 0.42, rng() * 6), col("#6a6660")); }
        fb.bulb.add(new THREE.IcosahedronGeometry(0.22, 1), T(0, 0.08, 0, 0, 0, 0).multiply(M(0, 0, 0, 0, 0, 0, 1, 0.35, 1)), col("#ff7a2a"));
        for (let k = 0; k < 4; k++) fb.wood.add(cylGeo(0.05, 0.06, 0.6, 6), T(0, 0.12, 0, k * 0.8, 0, Math.PI / 2 - 0.2), col("#2a1e14"));
        break;
      }
      case "sacks": for (let k = 0; k < 3; k++) addSack(fb, T((k - 1) * f.w * 0.3, 0, (rng() - 0.5) * 0.3, rng() * 3), rng); break;
      case "boat": addLongboat(m, L(f.x, WATER_Y - 0.02, f.z, f.yaw, 0.02, 0.03, 0.85), { hull: "#6a8a7a", stripe: "#e0d6bc", lower: "#3a4a3a", motor: false, oars: true, len: 5.0 }, rng); break;
      case "chest": break; // loot chests are placed by gameplay at LOOT_SPOTS
    }
  }

  // ---------------------------------------------------------------- dressing: eave lanterns, hanging net, ropes
  {
    const [lx, lz] = [w / 2 - 0.5, d / 2 + 0.35];
    murkLantern(nb, L(lx, h.y + 2.35, lz));
    // (the green fishing-net drapes are drawn by fx.ts from LAYOUT — alpha-cut, sagging, dark green)
    // a rope coil + a hanging float line under the eave
    const a = new THREE.Vector3(...(() => { const q = W(-w / 2 + 0.3, d / 2 + ov * 0.8); return [q[0], h.y + p.H - 0.1, q[1]] as [number, number, number]; })());
    const b = new THREE.Vector3(...(() => { const q = W(w / 2 - 0.3, d / 2 + ov * 0.8); return [q[0], h.y + p.H - 0.1, q[1]] as [number, number, number]; })());
    if (h.roof !== "flat") nb.rope.add(tubeGeo(catenary(a, b, 0.35, 10), 0.015, 4, false, 12), null, col(ROPE));
  }

  // ---------------------------------------------------------------- LOD1 (beyond ~80 m + the shadow proxy)
  {
    const lb = B.lod1;
    lb.clapboard.box(w, p.H, d, L(0, h.y + p.H / 2, 0), wallC, [0, 0], wallFn);
    if (h.roof === "flat") lb.clapboard.box(w + 0.1, 0.6, d + 0.1, L(0, p.roofY + 0.25, 0), wallC);
    else {
      const gable = h.roof === "gable", run = gable ? d / 2 + ov : d + 2 * ov, ang = Math.atan(h.pitch), sl = run / Math.cos(ang);
      for (const sg of gable ? [1, -1] : [1]) {
        const zc = gable ? sg * run / 2 : (-d / 2 - ov) + run / 2;
        lb.tin.box(w + 2 * ov, 0.1, sl, L(0, roofAt(p, zc) + 0.1, zc, 0, gable ? sg * ang : ang), roofC);
      }
      for (const sx of [-1, 1]) {
        const pts: Array<[number, number]> = gable ? [[-d / 2, 0], [d / 2, 0], [0, p.ridgeY - (h.y + p.H)]] : [[-d / 2, 0], [d / 2, 0], [d / 2, roofAt(p, d / 2) - (h.y + p.H)], [-d / 2, roofAt(p, -d / 2) - (h.y + p.H)]];
        lb.clapboard.add(prismXY(pts, 0.1), L(sx * (w / 2 - 0.05), h.y + p.H, 0, -Math.PI / 2), wallC);
      }
    }
    lb.wood.box(w, 0.3, d, L(0, h.y - 0.15, 0), col("#5a4634"));
  }
}

/** the far proxy of a hut (TownLod proxy: box + roof prism) */
export function hutProxy(proxyBox: (m: THREE.Matrix4, w: number, h: number, d: number, wall: string, roof: string, windows?: boolean) => void, proxyGeo: (g: THREE.BufferGeometry, m: THREE.Matrix4 | null, c: string) => void, p: HutParts) {
  const h = p.h;
  proxyBox(M(h.x, h.y - 0.3, h.z, h.yaw), h.w, p.H + 0.3, h.d, "#7a5a40", "#6a5442", false);
  if (h.roof !== "flat") proxyGeo(new THREE.CylinderGeometry(0.01, 1, 1, 4, 1), M(h.x, (p.ridgeY + p.roofY) / 2, h.z, h.yaw + Math.PI / 4, 0, 0, (h.w / 2 + h.overhang) * 1.42, p.ridgeY - p.roofY, (h.d / 2 + h.overhang) * 1.42), "#6a5442");
  void boxGeo;
}
