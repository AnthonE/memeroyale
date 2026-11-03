// PEEL HARBOR — access: the ways out of the water and up the ship, so a kong who falls off the boat never swims far.
// Draws exactly what shared/pois/peel-harbor.ts shipAccessBoxes collides with:
//   • SEA_LADDERS — accommodation ladders down the seaward hull side to a landing stage at the waterline
//   • QUAY_STAIRS — water stairs let into the quay walls (the berth face, in the gap beside the hull; the south inlet)
//   • fcStair     — the stair up the forecastle break on the centre line
import { Builder, type V3, mergeCasters } from "../_kit/harbor-geo";
import { FC_DECK, QUAY_STAIRS, SEA_LADDERS, SHIP, WATER_STEP_Y, fcStair, quayStairTreads } from "../../../../../shared/pois/peel-harbor";
import { foam, type Part } from "./parts";

export const part: Part = {
  id: "access",
  async build({ ctx, mats: m, group, lod }) {
    const b = new Builder(true), S = SHIP;
    // ---- seaward accommodation ladders
    for (const L of SEA_LADDERS) {
      const x0 = S.x + S.beam / 2 + 0.05, x1 = x0 + 1.6, n = Math.ceil((S.deckY - WATER_STEP_Y) / 0.33), dir = Math.sign(L.zTop - L.zBot), run = (L.zTop - L.zBot) / n;
      const zs0 = L.zBot - dir * 2.4;
      // landing stage (grating on a yellow frame) + its fenders
      b.box(m.galv, [(x0 + x1 + 1.0) / 2, WATER_STEP_Y - 0.2, (L.zBot + zs0) / 2], [x1 + 1.0 - x0, 0.4, 2.4], { bevel: 0.03 });
      b.box(m.yellowPaint, [(x0 + x1 + 1.0) / 2, WATER_STEP_Y - 0.36, (L.zBot + zs0) / 2], [x1 + 1.1 - x0, 0.12, 2.5]);
      for (let k = 1; k <= n; k++) {
        const zc = L.zBot + run * (k - 0.5), y = WATER_STEP_Y + (S.deckY - WATER_STEP_Y) * (k / n);
        b.box(m.galv, [(x0 + x1) / 2, y - 0.04, zc], [x1 - x0, 0.08, Math.abs(run) + 0.03]);
        b.box(m.yellowPaint, [(x0 + x1) / 2, y - 0.02, zc + dir * (Math.abs(run) / 2 - 0.03)], [x1 - x0 - 0.1, 0.05, 0.06]);
      }
      // stringers + the outboard handrail (posts every ~1.5 m) + an inboard grab rail on the hull
      const a: V3 = [0, WATER_STEP_Y - 0.1, L.zBot], c: V3 = [0, S.deckY - 0.1, L.zTop];
      for (const x of [x0 + 0.05, x1]) b.beam(m.yellowPaint, [x, a[1], a[2]], [x, c[1], c[2]], 0.08, 0.3);
      b.cyl(m.yellowPaint, [x1 + 0.04, WATER_STEP_Y + 1.0, L.zBot], [x1 + 0.04, S.deckY + 1.0, L.zTop], 0.04, 6);
      for (let k = 0; k <= 8; k++) { const t = k / 8, y = WATER_STEP_Y + (S.deckY - WATER_STEP_Y) * t, z = L.zBot + (L.zTop - L.zBot) * t; b.cyl(m.galv, [x1 + 0.04, y, z], [x1 + 0.04, y + 1.0, z], 0.03, 5, { caps: false }); }
      b.cyl(m.galv, [x0 + 0.02, WATER_STEP_Y + 0.9, L.zBot], [x0 + 0.02, S.deckY + 0.9, L.zTop], 0.03, 5);
      // the davit + falls holding it at the deck edge
      b.beam(m.yellowPaint, [x0 - 0.6, S.deckY, L.zTop], [x1 + 0.2, S.deckY + 2.6, L.zTop - dir * 1.2], 0.16, 0.16);
      b.cyl(m.cable, [x1 + 0.2, S.deckY + 2.6, L.zTop - dir * 1.2], [x1, WATER_STEP_Y + 4.5, L.zBot + dir * 3.5], 0.02, 4, { caps: false });
      foam(ctx).rect(x0 + 1.3, (L.zBot + zs0) / 2, 1.6, 1.4, 0.6, 0.5);
    }
    // ---- water stairs in the quay walls: concrete flights with yellow nosings + a railing on the open side
    for (const q of QUAY_STAIRS) {
      const t = quayStairTreads(q);
      for (const [x0, x1, , y1, z0, z1] of t) {
        b.box(m.concrete, [(x0 + x1) / 2, (y1 - 2.4) / 2, (z0 + z1) / 2], [x1 - x0, y1 + 2.4, z1 - z0], { bevel: 0.03 });
        const up = Math.sign(q.to - q.from), along = q.along === "z";
        const ex = along ? (x0 + x1) / 2 : up > 0 ? x1 - 0.04 : x0 + 0.04, ez = along ? (up > 0 ? z1 - 0.04 : z0 + 0.04) : (z0 + z1) / 2;
        b.box(m.yellowPaint, [ex, y1 + 0.005, ez], along ? [x1 - x0 - 0.1, 0.012, 0.07] : [0.07, 0.012, z1 - z0 - 0.1]);
      }
      // railing along the open (water) side of the flight
      // (from the third tread up, like its colliders: a swimmer boards the two foot treads from the side)
      const first = t[2], last = t[t.length - 1], o = q.out;
      const side = q.along === "z" ? (o > 0 ? first[1] - 0.06 : first[0] + 0.06) : (o > 0 ? first[5] - 0.06 : first[4] + 0.06);
      const fa = q.along === "z" ? (first[4] + first[5]) / 2 : (first[0] + first[1]) / 2;
      const pA: V3 = q.along === "z" ? [side, first[3], fa] : [fa, first[3], side], pB: V3 = q.along === "z" ? [side, last[3], q.to] : [q.to, last[3], side];
      b.cyl(m.galv, [pA[0], pA[1] + 1.0, pA[2]], [pB[0], pB[1] + 1.0, pB[2]], 0.035, 6);
      for (let k = 0; k <= 4; k++) { const u = k / 4, p: V3 = [pA[0] + (pB[0] - pA[0]) * u, pA[1] + (pB[1] - pA[1]) * u, pA[2] + (pB[2] - pA[2]) * u]; b.cyl(m.galv, p, [p[0], p[1] + 1.0, p[2]], 0.03, 5, { caps: false }); }
    }
    // ---- the forecastle stair (steel, yellow nosings, side rails)
    const st = fcStair();
    for (const s of st) {
      b.box(m.darkPaint, [S.x, (S.deckY + s.y1) / 2, (s.z0 + s.z1) / 2], [2 * s.hw, s.y1 - S.deckY, s.z1 - s.z0]);
      b.box(m.yellowPaint, [S.x, s.y1 + 0.005, s.z0 + 0.04], [2 * s.hw - 0.1, 0.012, 0.07]);
    }
    for (const sd of [-1, 1]) {
      const x = S.x + sd * (st[0].hw + 0.04);
      b.cyl(m.galv, [x, S.deckY + 1.0, st[0].z0], [x, FC_DECK + 1.0, st[st.length - 1].z1], 0.035, 6);
      for (const s of [st[0], st[3], st[st.length - 1]]) b.cyl(m.galv, [x, s.y1, (s.z0 + s.z1) / 2], [x, s.y1 + 1.0, (s.z0 + s.z1) / 2], 0.03, 5, { caps: false });
    }
    const g = await b.buildAsync("harbor-access", { palette: (mm) => /^(galv|darkPaint|yellowPaint|cable)$/.test(mm.name) }, () => ctx.yield());
    group.add(g);
    mergeCasters(g, { c1: false });
    lod.add(g, { shadow: 120 });
  },
};
