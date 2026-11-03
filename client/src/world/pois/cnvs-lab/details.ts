// CNVS LAB — exterior dressing on the module walls, all within 0.15 m of the wall face (inside the collision
// tolerance): conduit runs under the fascia, rain downpipes at corners, electrical cabinets + meter boxes, caged
// bulkhead lamps beside the doors, CNVS.DEV door plaques, louvred vents, pipe drops down the stilts, rooftop hatches /
// skylights (flush, ≤ 0.12 m), and the high cable run from the mast to the control-room roof.
import * as THREE from "three";
import { MODULES, MAST, G, type ModuleSpec, type Side } from "../../../../../shared/pois/cnvs-lab";
import { Bins, type V3 } from "./geo";
import type { LabMats } from "./mats";

const rng = (s: number) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

/** wall frame helpers: a point on side s at along-coordinate a, height y, out = distance out from the face */
function wallPt(m: ModuleSpec, s: Side, a: number, y: number, out: number): V3 {
  if (s === "n") return [a, y, m.v[0] - out];
  if (s === "s") return [a, y, m.v[1] + out];
  if (s === "w") return [m.u[0] - out, y, a];
  return [m.u[1] + out, y, a];
}
/** a box on the wall face: along [a0,a1], height [y0,y1], depth out from the face [d0,d1] */
function wallBox(b: Bins, mat: THREE.Material, m: ModuleSpec, s: Side, a0: number, a1: number, y0: number, y1: number, d0: number, d1: number, o: { bevel?: number; tint?: THREE.ColorRepresentation } = {}) {
  const p0 = wallPt(m, s, a0, y0, d0), p1 = wallPt(m, s, a1, y1, d1);
  b.box(mat, Math.min(p0[0], p1[0]), y0, Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), y1, Math.max(p0[2], p1[2]), o);
}

export function buildDetails(M: LabMats, shell: Bins, near: Bins) {
  const r = rng(77);
  for (const m of MODULES) {
    const top = m.roofTop, fl = m.floor;
    const ops = [...m.doors, ...m.windows, ...(m.sign ? [m.sign] : [])];
    // also clear of the corner columns and the pilasters (shell.ts: every ~4 m) — a door plaque split by a
    // pilaster read as "C | EV"
    const pil = (s: Side) => { const A = s === "n" || s === "s" ? m.u[0] : m.v[0], B = s === "n" || s === "s" ? m.u[1] : m.v[1], n = Math.max(1, Math.round((B - A) / 4)); return { A, B, at: Array.from({ length: n - 1 }, (_, k) => A + (B - A) * (k + 1) / n) }; };
    const free = (s: Side, a: number, w: number) => { const P = pil(s); return a - w / 2 > P.A + 0.6 && a + w / 2 < P.B - 0.6 && !P.at.some((q) => Math.abs(q - a) < w / 2 + 0.12) && !ops.some((o) => o.s === s && Math.abs(o.at - a) < o.w / 2 + w / 2 + 0.15); };
    for (const s of ["n", "s", "e", "w"] as Side[]) {
      const along = s === "n" || s === "s", A = along ? m.u[0] : m.v[0], B = along ? m.u[1] : m.v[1], L = B - A;
      if (L < 4) continue;
      // conduit pair under the fascia (brackets every ~1.5 m)
      const py = top - 0.72;
      for (const [k, rr] of [[0, 0.055], [1, 0.04]] as Array<[number, number]>) {
        const y = py - k * 0.16;
        near.cyl(M.galv, wallPt(m, s, A + 0.35, y, 0.09), wallPt(m, s, B - 0.35, y, 0.09), rr, 8);
      }
      for (let a = A + 0.6; a < B - 0.4; a += 1.5) wallBox(near, M.trim, m, s, a - 0.03, a + 0.03, py - 0.26, py + 0.08, 0, 0.13);
      // electrical cabinet + meter box on long ground-level walls
      if (fl < G + 1 && L > 8) {
        const a = A + L * (0.2 + r() * 0.6);
        if (free(s, a, 1.2)) {
          wallBox(near, M.graphite, m, s, a - 0.45, a + 0.45, fl + 0.6, fl + 1.75, 0, 0.13, { bevel: 0.02 });
          wallBox(near, M.hazard, m, s, a - 0.45, a + 0.45, fl + 1.62, fl + 1.7, 0.13, 0.135);
          wallBox(near, M.paint, m, s, a + 0.55, a + 0.85, fl + 1.1, fl + 1.5, 0, 0.1, { tint: 0xd8d8d0, bevel: 0.01 });
          near.cyl(M.graphite, wallPt(m, s, a, fl + 0.6, 0.06), wallPt(m, s, a, fl - 0.24, 0.06), 0.04, 6);
        }
      }
      // louvred vent panel high on the wall
      { const a = A + L * (0.15 + r() * 0.7);
        if (free(s, a, 1.0)) { wallBox(near, M.graphite, m, s, a - 0.45, a + 0.45, top - 1.55, top - 1.0, 0, 0.05); for (let k = 0; k < 5; k++) wallBox(near, M.trim, m, s, a - 0.42, a + 0.42, top - 1.5 + k * 0.1, top - 1.46 + k * 0.1, 0.05, 0.1); } }
    }
    // corner downpipes (roof → ground / deck), graphite
    for (const [cu, cv, s] of [[m.u[0] + 0.45, m.v[1], "s"], [m.u[1] - 0.45, m.v[0], "n"]] as Array<[number, number, Side]>) {
      // (stilted pods: the pipe ends in a spout at the slab — a pipe hanging in the open under the pod had no collider)
      const base = m.floor < G + 1 ? G + 0.05 : m.floor - 0.3, out = s === "s" ? 0.09 : -0.09;
      near.cyl(M.graphite, [cu, top - 0.1, cv + out], [cu, base, cv + out], 0.06, 8);
      near.cyl(M.graphite, [cu, base + 0.25, cv + out], [cu, base, cv + out * (m.stilts ? 1.6 : 2.5)], 0.06, 8);
    }
    // doors: caged bulkhead lamp beside + a CNVS.DEV plaque
    for (const d of m.doors) {
      const s = d.s, a = [d.at + d.w / 2 + 0.45, d.at - d.w / 2 - 0.45].find((q) => free(s, q, 0.62));
      if (a === undefined) continue;
      const lp = wallPt(m, s, a, fl + 2.3, 0.1);
      near.box(M.graphite, lp[0] - 0.1, lp[1] - 0.12, lp[2] - 0.1, lp[0] + 0.1, lp[1] + 0.12, lp[2] + 0.1, { bevel: 0.02 });
      near.add(M.amber, new THREE.SphereGeometry(0.075, 10, 8), new THREE.Matrix4().makeTranslation(...wallPt(m, s, a, fl + 2.3, 0.14)));
      wallBox(near, M.sign, m, s, a - 0.3, a + 0.3, fl + 1.5, fl + 1.72, 0, 0.02);
    }
    // roof: flush hatch + skylight + drains (≤ 0.12 m — walkable without a collider)
    const cu = m.u[0] + (m.u[1] - m.u[0]) * 0.3, cv = (m.v[0] + m.v[1]) / 2 + 1.2;
    const covered = MODULES.some((o) => o !== m && Math.abs(o.floor - top) < 0.05 && cu + 2.8 > o.u[0] && cu - 0.8 < o.u[1] && cv + 0.8 > o.v[0] && cv - 0.8 < o.v[1]);
    if (m.u[1] - m.u[0] > 6 && !covered) {
      shell.box(M.graphite, cu - 0.6, top, cv - 0.6, cu + 0.6, top + 0.1, cv + 0.6, { bevel: 0.03 });
      shell.box(M.glassDark, cu + 1.4, top, cv - 0.5, cu + 2.6, top + 0.08, cv + 0.5);
    }
    // stilted modules: a pipe + cable drop down one stilt into a ground junction box
    if (m.stilts) {
      const x = m.u[1] - 0.2 - 0.26, z = m.v[1] - 0.2;
      near.cyl(M.galv, [x, fl - 0.35, z], [x, G + 0.6, z], 0.06, 8);
      near.cyl(M.cable, [x - 0.12, fl - 0.35, z + 0.1], [x - 0.12, G + 0.6, z + 0.1], 0.03, 6);
    }
  }
  // the high cable run: mast platform → the control room's roof corner (≥ 6 m over every walkable surface below it)
  const a: V3 = [MAST.u + 0.5, G + 12.7, MAST.v + 0.9], b: V3 = [22.08, 45.5, -4.08];
  const pts: V3[] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 2.2 * Math.sin(Math.PI * t), a[2] + (b[2] - a[2]) * t]); }
  near.poly(M.cable, pts, 0.035, 5);
  near.cyl(M.galv, [22.08, 41.3, -4.08], [22.08, 45.6, -4.08], 0.06, 8); // the cable's mast, clamped to the parapet's outer corner
}
