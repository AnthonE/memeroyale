// CNVS LAB — the architecture, drawn from the SAME resolved parts the colliders are made of (shared/pois/cnvs-lab.ts):
// wall boxes → outer prefab skin (colour bands per module scheme) + interior lining; slabs; roofs + parapets; stilts;
// steps / landings / decks; plus dressing that stays within ±0.15 m of a collider face (window + door frames, corner
// posts, pilasters, fascia, sliding door leaves, wall lamps, rails' posts and tubes). Local frame: x = u, z = v.
import * as THREE from "three";
import { labLayout, MODULES, DECKS, HELI, G, stepTop, CORNER_R, type Part, type ModuleSpec, type Side } from "../../../../../shared/pois/cnvs-lab";
import { Bins, RoutedBins, type V3 } from "./geo";
import type { LabMats, Room } from "./mats";

/** per module: exterior colour bands (heights above the floor) */
function bands(m: ModuleSpec, M: LabMats): Array<[number, number, THREE.Material]> {
  const top = m.roofTop - m.floor;
  if (m.scheme === "band") return [[-0.3, 1.05, M.yellow], [1.05, 1.15, M.trim], [1.15, top + 0.01, M.white]];
  if (m.scheme === "yellow") return [[-0.3, 0.35, M.graphite], [0.35, top - 0.6, M.yellow], [top - 0.6, top + 0.01, M.white]];
  if (m.id === "B") return [[-0.3, 0.85, M.yellow], [0.85, 0.95, M.trim], [0.95, top + 0.01, M.white]];
  // (the pods are WHITE boxes on a graphite plinth with a thin yellow pinstripe — the yellow lives in the
  // wainscots, door frames, rails and equipment, not in heavy top bands)
  return [[-0.3, 0.3, M.graphite], [0.3, 0.42, M.yellow], [0.42, top + 0.01, M.white]];
}
const modOf = (id?: string) => MODULES.find((m) => m.id === id);
/** the pods' rounded vertical corners: the wall skins stop RC short of every module corner and
 *  a quarter-cylinder fairing (radius RC, tangent to both faces) closes it in each colour band — the toy-like soft edge
 *  reads at 30 m. The colliders follow it: two facet boxes per corner (shared moduleParts), the arc ≤ 4 cm proud. */
const RC = CORNER_R, RC_P = 0;
/** quarter fairing at module corner (cu, cv) bulging toward (su, sv) = ±1, from ya to yb */
function fairing(b: Bins, mat: THREE.Material, cu: number, cv: number, su: number, sv: number, ya: number, yb: number, r = RC, pr = RC_P, caps = false, tint: THREE.ColorRepresentation = 0xffffff) {
  if (yb - ya < 0.004) return;
  // three's cylinder: x = r·sin θ, z = r·cos θ → the quadrant (su, sv)
  const t0 = su > 0 ? (sv > 0 ? 0 : Math.PI / 2) : (sv > 0 ? Math.PI * 1.5 : Math.PI);
  const g = new THREE.CylinderGeometry(r, r, yb - ya, 10, 1, !caps, t0, Math.PI / 2);
  const c = r - pr;
  b.add(mat, g, new THREE.Matrix4().makeTranslation(cu - su * c, (ya + yb) / 2, cv - sv * c), tint);
}

export interface ShellOut { shell: Bins; interior: RoutedBins; glass: Bins; near: Bins; rooms: Room[] }

/** async: yields to the engine's time-slicer every ~120 parts / per module so no main-thread task runs > 50 ms */
export async function buildShell(M: LabMats, y: () => Promise<void> = async () => {}): Promise<ShellOut> {
  const L = labLayout();
  // the interior dressing files itself per pod (RoutedBins): each pod's interior culls on its own distance
  const podOf = (x: number, y: number, z: number) => MODULES.find((m) => x > m.u[0] - 0.6 && x < m.u[1] + 0.6 && z > m.v[0] - 0.6 && z < m.v[1] + 0.6 && y > m.floor - 0.8 && y < m.roofTop + 0.3)?.id ?? "x";
  const shell = new Bins(), interior = new RoutedBins(podOf), glass = new Bins(), near = new Bins();
  const rooms: Room[] = [];

  const lo = (p: Part, a: 0 | 1 | 2) => p.c[a] - p.h[a], hi = (p: Part, a: 0 | 1 | 2) => p.c[a] + p.h[a];
  let np = 0;
  for (const p of L.parts) {
    if (++np % 60 === 0) await y();
    if (p.yaw) continue; // fence / helipad corners: drawn from their specs
    const x0 = lo(p, 0), x1 = hi(p, 0), y0 = lo(p, 1), y1 = hi(p, 1), z0 = lo(p, 2), z1 = hi(p, 2);
    switch (p.kind) {
      case "wall": {
        const m = modOf(p.mod)!, n = p.n!;
        // outer skin (t − 0.08) + lining (0.08); split the skin into the module's colour bands
        const inner = 0.08;
        const sk = n[0] ? (n[0] > 0 ? [x0 + inner, x1] : [x0, x1 - inner]) : (n[1] > 0 ? [z0 + inner, z1] : [z0, z1 - inner]);
        const ln = n[0] ? (n[0] > 0 ? [x0, x0 + inner] : [x1 - inner, x1]) : (n[1] > 0 ? [z0, z0 + inner] : [z1 - inner, z1]);
        // the skin stops RC short of the module's corners (the rounded fairings close them)
        const [ca0, ca1] = n[0] ? [m.v[0], m.v[1]] : [m.u[0], m.u[1]];
        const [w0, w1] = n[0] ? [Math.max(z0, ca0 + RC), Math.min(z1, ca1 - RC)] : [Math.max(x0, ca0 + RC), Math.min(x1, ca1 - RC)];
        for (const [b0, b1, mat] of bands(m, M)) {
          const ya = Math.max(y0, m.floor + b0), yb = Math.min(y1, m.floor + b1);
          if (yb - ya < 0.005 || w1 - w0 < 0.005) continue;
          if (n[0]) shell.box(mat, sk[0], ya, w0, sk[1], yb, w1); else shell.box(mat, w0, ya, sk[0], w1, yb, sk[1]);
        }
        // lining only below the ceiling (the part above is inside the roof slab)
        const ceil = m.roofTop - 0.3;
        if (y0 < ceil - 0.01) {
          const yb = Math.min(y1, ceil);
          if (n[0]) shell.box(M.lining, ln[0], y0, z0, ln[1], yb, z1); else shell.box(M.lining, x0, y0, ln[0], x1, yb, ln[1]);
        }
        break;
      }
      case "partition": {
        const m = modOf(p.mod)!;
        shell.box(M.lining, x0, y0, z0, x1, Math.min(y1, m.roofTop - 0.3), z1);
        break;
      }
      case "glass": {
        glass.box(M.glass, x0, y0, z0, x1, y1, z1);
        // frame on the outside face (proud 0.05) + inside sill
        const n = p.n!;
        const along = n[1] !== 0;
        const face = n[0] > 0 ? x1 + 0.12 : n[0] < 0 ? x0 - 0.12 : n[1] > 0 ? z1 + 0.12 : z0 - 0.12;
        const a0 = along ? x0 : z0, a1 = along ? x1 : z1;
        const put = (b: Bins, mat: THREE.Material, pa: number, pb: number, ya: number, yb: number, d0: number, d1: number) => {
          if (along) b.box(mat, pa, ya, Math.min(d0, d1), pb, yb, Math.max(d0, d1)); else b.box(mat, Math.min(d0, d1), ya, pa, Math.max(d0, d1), yb, pb);
        };
        const out = (along ? n[1] : n[0]), f0 = face - out * 0.02;
        // chunky graphite surround (0.16 wide, 0.1 proud, bevelled) around a 0.15 m reveal — dark,
        // rounded, toy-like window frames round glowing teal glass
        const sw = 0.16, sp = 0.1, putB = (pa: number, pb: number, ya: number, yb: number, d0: number, d1: number) => {
          if (along) shell.box(M.graphite, pa, ya, Math.min(d0, d1), pb, yb, Math.max(d0, d1), { bevel: 0.05 }); else shell.box(M.graphite, Math.min(d0, d1), ya, pa, Math.max(d0, d1), yb, pb, { bevel: 0.05 });
        };
        putB(a0 - sw, a1 + sw, y1, y1 + sw, f0, face + out * sp);
        putB(a0 - sw, a1 + sw, y0 - sw, y0, f0, face + out * (sp + 0.05));
        putB(a0 - sw, a0, y0, y1, f0, face + out * sp);
        putB(a1, a1 + sw, y0, y1, f0, face + out * sp);
        // reveal lining (the glass sits 0.15 m back from the surround)
        put(shell, M.trim, a0, a0 + 0.02, y0, y1, face - out * 0.15, face);
        put(shell, M.trim, a1 - 0.02, a1, y0, y1, face - out * 0.15, face);
        put(shell, M.trim, a0, a1, y1 - 0.02, y1, face - out * 0.15, face);
        // rain visor over the window (graphite, 0.18 proud)
        put(shell, M.graphite, a0 - sw - 0.1, a1 + sw + 0.1, y1 + sw + 0.02, y1 + sw + 0.12, f0, face + out * 0.18);
        // mullions every ~1.6 m
        const nm = Math.floor((a1 - a0) / 1.6);
        for (let k = 1; k <= nm; k++) { const a = a0 + (a1 - a0) * k / (nm + 1); put(shell, M.trim, a - 0.03, a + 0.03, y0, y1, face - out * 0.1, face + out * 0.01); }
        // inside sill
        const fi = face - out * 0.3;
        put(interior, M.furnMetal, a0, a1, y0 - 0.04, y0, fi, fi - out * 0.16);
        break;
      }
      case "slab": {
        const m = modOf(p.mod);
        if (m && !m.stilts) {
          // ground plinth: concrete, top covered by the floor finish inside
          shell.box(M.concrete, x0, y0, z0, x1, y1 - 0.004, z1, { tint: 0xd8d2c6 });
        } else if (m) {
          shell.box(M.steel, x0, y0, z0, x1, y1 - 0.004, z1, { tint: 0x9aa0a6 });
          // edge beam (yellow on the stilted modules) + underside joists
          const e = 0.06;
          shell.box(M.yellow, x0 - e, y0 - 0.05, z0 - e, x1 + e, y1 - 0.02, z0 + 0.12);
          shell.box(M.yellow, x0 - e, y0 - 0.05, z1 - 0.12, x1 + e, y1 - 0.02, z1 + e);
          shell.box(M.yellow, x0 - e, y0 - 0.05, z0, x0 + 0.12, y1 - 0.02, z1);
          shell.box(M.yellow, x1 - 0.12, y0 - 0.05, z0, x1 + e, y1 - 0.02, z1);
          for (let x = x0 + 1.2; x < x1 - 0.6; x += 1.4) shell.box(M.steel, x - 0.07, y0 - 0.28, z0 + 0.1, x + 0.07, y0, z1 - 0.1, { tint: 0x707880 });
        }
        break;
      }
      case "roof": {
        const m = modOf(p.mod)!;
        // roof membrane (warm grey with grit) and the ceiling underside inside
        shell.box(M.white, x0, y0, z0, x1, y1, z1, { tint: 0xe2dfd8 });
        shell.box(M.ceiling, x0 + 0.3, y0 - 0.02, z0 + 0.3, x1 - 0.3, y0 - 0.002, z1 - 0.3);
        // fascia band round the roof edge (proud 0.06) + a rain gutter lip
        // a CHUNKY cornice (≥ 0.35 m, rounded): 0.62 m tall, 0.14 m proud, bevelled, with a graphite drip line
        // (graphite, dark roof-slab edges; the white walls read as rounded pods under it)
        const e = 0.14, fy0 = m.roofTop - 0.42;
        const fmat = M.graphite, bo = { bevel: 0.08 };
        // (the cornice follows the rounded corners — straight runs between quarter rings of radius RC)
        const qx0 = x0 + RC, qx1 = x1 - RC, qz0 = z0 + RC, qz1 = z1 - RC;
        shell.box(fmat, qx0, fy0, z0 - e, qx1, m.roofTop + 0.02, z0 + 0.1, bo);
        shell.box(fmat, qx0, fy0, z1 - 0.1, qx1, m.roofTop + 0.02, z1 + e, bo);
        shell.box(fmat, x0 - e, fy0, qz0, x0 + 0.1, m.roofTop + 0.02, qz1, bo);
        shell.box(fmat, x1 - 0.1, fy0, qz0, x1 + e, m.roofTop + 0.02, qz1, bo);
        // a thin yellow reveal line under the cornice (the accent pinstripe)
        const dl = 0.06;
        shell.box(M.yellow, qx0, fy0 - dl, z0 - 0.05, qx1, fy0, z0, {});
        shell.box(M.yellow, qx0, fy0 - dl, z1, qx1, fy0, z1 + 0.05, {});
        shell.box(M.yellow, x0 - 0.05, fy0 - dl, qz0, x0, fy0, qz1, {});
        shell.box(M.yellow, x1, fy0 - dl, qz0, x1 + 0.05, fy0, qz1, {});
        for (const [cu, cv, su, sv] of [[x0, z0, -1, -1], [x1, z0, 1, -1], [x0, z1, -1, 1], [x1, z1, 1, 1]] as Array<[number, number, number, number]>) {
          fairing(shell, fmat, cu, cv, su, sv, fy0, m.roofTop + 0.02, RC + e, e, true);
          fairing(shell, M.yellow, cu, cv, su, sv, fy0 - dl, fy0, RC + 0.05, 0.05, false);
        }
        break;
      }
      case "parapet": {
        const m = modOf(p.mod)!;
        // parapet: a chunky graphite curb + a yellow tube railing on posts with a flat
        // cap rail, all inside the collider footprint (the collider stays the full-height parapet box: rays at 1.2 /
        // 1.7 m above the roof pass over it; the cap is the drawn top of the box)
        void m;
        const H = y1 - y0, curb = Math.min(0.32, H * 0.5), cx0 = x0 + 0.02, cx1 = x1 - 0.02, cz0 = z0 + 0.02, cz1 = z1 - 0.02;
        shell.box(M.graphite, x0, y0, z0, x1, y0 + curb, z1, { bevel: 0.05 });
        const alongX = x1 - x0 > z1 - z0, L0 = alongX ? x0 : z0, L1 = alongX ? x1 : z1, len = L1 - L0;
        const np = Math.max(1, Math.round(len / 1.5));
        for (let k = 0; k <= np; k++) {
          const a = Math.min(L1 - 0.05, Math.max(L0 + 0.05, L0 + len * k / np));
          if (alongX) shell.box(M.yellow, a - 0.045, y0 + curb, (z0 + z1) / 2 - 0.045, a + 0.045, y1 - 0.05, (z0 + z1) / 2 + 0.045, { bevel: 0.015 });
          else shell.box(M.yellow, (x0 + x1) / 2 - 0.045, y0 + curb, a - 0.045, (x0 + x1) / 2 + 0.045, y1 - 0.05, a + 0.045, { bevel: 0.015 });
        }
        if (H > 0.8) { const ym = (y0 + curb + y1) / 2; if (alongX) near.cyl(M.yellow, [L0, ym, (z0 + z1) / 2], [L1, ym, (z0 + z1) / 2], 0.03, 6); else near.cyl(M.yellow, [(x0 + x1) / 2, ym, L0], [(x0 + x1) / 2, ym, L1], 0.03, 6); }
        // (the cap covers the whole collider top + 1 cm: the scanner's lattice samples the parapet's edge lines)
        void cx0; void cx1; void cz0; void cz1;
        shell.box(M.yellow, x0 - 0.01, y1 - 0.06, z0 - 0.01, x1 + 0.01, y1, z1 + 0.01, { bevel: 0.015 });
        break;
      }
      case "stilt": {
        // (1.5 cm proud of the collider, bevel 2 cm: a ray grazing the collider's corner meets the drawn corner too)
        shell.box(M.paint, x0 - 0.015, y0, z0 - 0.015, x1 + 0.015, y1, z1 + 0.015, { bevel: 0.02, tint: 0x6f777f });
        // knee braces up under the deck (above any head / jump: ≥ 37.3 m) toward the neighbouring stilts' sides
        if (y1 - G > 3.6) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
          near.cyl(M.paint, [cx + dx * 0.2, y1 - 0.95, cz + dz * 0.2], [cx + dx * 0.95, y1 - 0.25, cz + dz * 0.95], 0.05, 5, { tint: 0x6f777f });
        }
        // hazard wrap at knee-to-hip height (striped stilt feet) + a yellow collar under the deck + a bolted
        // base plate (all flush / ≤ 2 cm proud)
        shell.box(M.hazard, x0 - 0.02, G + 0.7, z0 - 0.02, x1 + 0.02, G + 1.2, z1 + 0.02);
        shell.box(M.yellow, x0 - 0.02, y1 - 0.55, z0 - 0.02, x1 + 0.02, y1 - 0.3, z1 + 0.02, { bevel: 0.01 });
        shell.box(M.steel, x0 - 0.12, G - 0.05, z0 - 0.12, x1 + 0.12, G + 0.06, z1 + 0.12, { tint: 0x4d545b });
        shell.box(M.concrete, x0 - 0.3, G - 0.3, z0 - 0.3, x1 + 0.3, G + 0.03, z1 + 0.3, { tint: 0xc9c2b4 });
        break;
      }
      case "step": {
        // body (a solid stepped flank reads as a blank grey block): a dark steel stringer plate with
        // bar-grating infill panels on the long flanks (1 cm proud, a 12 cm steel frame round them) + a yellow nosing
        shell.box(M.paint, x0, y0, z0, x1, y1 - 0.05, z1, { tint: 0x4d545b });
        if (y1 - y0 > 0.6) {
          const ya = Math.max(y0, y1 - 1.6), yb = y1 - 0.2;
          if (x1 - x0 > z1 - z0) { shell.box(M.grate, x0 + 0.12, ya, z0 - 0.01, x1 - 0.12, yb, z0); shell.box(M.grate, x0 + 0.12, ya, z1, x1 - 0.12, yb, z1 + 0.01); }
          else { shell.box(M.grate, x0 - 0.01, ya, z0 + 0.12, x0, yb, z1 - 0.12); shell.box(M.grate, x1, ya, z0 + 0.12, x1 + 0.01, yb, z1 - 0.12); }
        }
        shell.box(M.yellow, x0 + 0.01, y1 - 0.09, z0 + 0.01, x1 - 0.01, y1 - 0.05, z1 - 0.01);
        shell.box(M.grate, x0 + 0.02, y1 - 0.05, z0, x1 - 0.02, y1, z1);
        break;
      }
      case "landing": {
        // the solid landing tower reads as a steel cage: graphite corner posts + rails framing bar-grating panels
        // (1.2 cm proud), a yellow edge band under the deck, grating deck
        shell.box(M.paint, x0, y0, z0, x1, y1 - 0.06, z1, { tint: 0x4d545b });
        if (y1 - 0.3 - y0 > 0.8) {
          const pr = 0.012, yt = y1 - 0.32;
          shell.box(M.grate, x0 - pr, y0, z0 + 0.1, x0, yt, z1 - 0.1); shell.box(M.grate, x1, y0, z0 + 0.1, x1 + pr, yt, z1 - 0.1);
          shell.box(M.grate, x0 + 0.1, y0, z0 - pr, x1 - 0.1, yt, z0); shell.box(M.grate, x0 + 0.1, y0, z1, x1 - 0.1, yt, z1 + pr);
          // (posts + rails inside the collider footprint, ≤ 1.2 cm proud: grazing rays meet the box where they meet them)
          for (const [cx, cz] of [[x0 + 0.06, z0 + 0.06], [x1 - 0.06, z0 + 0.06], [x0 + 0.06, z1 - 0.06], [x1 - 0.06, z1 - 0.06]]) shell.box(M.graphite, cx - 0.072, y0, cz - 0.072, cx + 0.072, y1 - 0.3, cz + 0.072, { bevel: 0.015 });
          for (let yy = y0 + 1.2; yy < y1 - 0.8; yy += 1.4) {
            shell.box(M.graphite, x0 - 0.012, yy, z0 - 0.012, x1 + 0.012, yy + 0.08, z0 + 0.03); shell.box(M.graphite, x0 - 0.012, yy, z1 - 0.03, x1 + 0.012, yy + 0.08, z1 + 0.012);
            shell.box(M.graphite, x0 - 0.012, yy, z0, x0 + 0.03, yy + 0.08, z1); shell.box(M.graphite, x1 - 0.03, yy, z0, x1 + 0.012, yy + 0.08, z1);
          }
        }
        shell.box(M.yellow, x0 - 0.02, y1 - 0.3, z0 - 0.02, x1 + 0.02, y1 - 0.06, z1 + 0.02);
        shell.box(M.grate, x0 + 0.03, y1 - 0.06, z0 + 0.03, x1 - 0.03, y1, z1 - 0.03);
        break;
      }
      case "deck": {
        const d = DECKS.find((q) => q.id === p.mod);
        const big = d?.kind === "bridge" && Math.max(x1 - x0, z1 - z0) > 8;
        // girder sides (yellow) + grating walk surface + dark underside
        shell.box(M.steel, x0 + 0.1, y0, z0 + 0.1, x1 - 0.1, y1 - 0.06, z1 - 0.1, { tint: 0x6d747b });
        shell.box(M.grate, x0 + 0.02, y1 - 0.06, z0 + 0.02, x1 - 0.02, y1, z1 - 0.02);
        const along = x1 - x0 > z1 - z0, gd = big ? 0.75 : 0.34;
        if (along) { shell.box(M.yellow, x0, y1 - gd, z0 - 0.04, x1, y1 - 0.04, z0 + 0.1); shell.box(M.yellow, x0, y1 - gd, z1 - 0.1, x1, y1 - 0.04, z1 + 0.04); }
        else { shell.box(M.yellow, x0 - 0.04, y1 - gd, z0, x0 + 0.1, y1 - 0.04, z1); shell.box(M.yellow, x1 - 0.1, y1 - gd, z0, x1 + 0.04, y1 - 0.04, z1); }
        break;
      }
      case "stoop": shell.box(M.concrete, x0, y0, z0, x1, y1, z1, { bevel: 0.03, tint: 0xd8d2c6 }); break;
      default: break;
    }
  }

  // ---- per-module dressing: interior floor, corner posts, pilasters, doors, signs, lamps, rooms
  await y();
  for (const m of MODULES) {
    await y();
    const u0 = m.u[0], u1 = m.u[1], v0 = m.v[0], v1 = m.v[1], t = 0.3, top = m.roofTop, ceil = top - 0.3;
    const fmat = m.id === "A" || m.id === "P" ? M.floorServer : m.id === "D" || m.id === "F" ? M.floorWarm : M.floorLab;
    // the interiors kit lays each room's floor finish 12 mm up: the lab's own floor sits 1 cm under it (a
    // coplanar pair z-fights) and only the server hall keeps its perforated raised floor (kit floor "none" there)
    shell.box(fmat, u0 + t, m.floor - 0.03, v0 + t, u1 - t, m.id === "A" ? m.floor + 0.012 : m.floor + 0.002, v1 - t);
    // corner posts (chunky, bevelled) — the prefab frame
    // rounded corner caps (the pods have soft vertical edges): a 16-sided column over each corner, its
    // outer quarter proud ≤ 0.15 m of the walls, in the module's accent colour + a graphite base / cap ring
    // rounded corners: a quarter fairing per colour band (the skins stop RC short of the corner) + a graphite
    // corner guard strip at kick height on the ground blocks
    for (const [cu, cv, su, sv] of [[u0, v0, -1, -1], [u1, v0, 1, -1], [u0, v1, -1, 1], [u1, v1, 1, 1]] as Array<[number, number, number, number]>) {
      const wTop = m.roofTop - 0.42;
      for (const [b0, b1, mat] of bands(m, M)) fairing(shell, mat, cu, cv, su, sv, Math.max(m.floor - (m.stilts ? 0.3 : 0.24), m.floor + b0), Math.min(wTop, m.floor + b1));
      // inside: the room's corner lining (the walls' linings stop CORNER_R short of the OUTER corner, 0.2 m short of the
      // room's corner): two 0.2 m strips close it, flush with the linings
      const ci = 0.3, li = 0.08, ya = m.floor, yb = ceil;
      const ru = cu - su * ci, rv = cv - sv * ci;
      shell.box(M.lining, Math.min(ru, cu - su * RC), ya, Math.min(rv, rv + sv * li), Math.max(ru, cu - su * RC), yb, Math.max(rv, rv + sv * li));
      shell.box(M.lining, Math.min(ru, ru + su * li), ya, Math.min(rv, cv - sv * RC), Math.max(ru, ru + su * li), yb, Math.max(rv, cv - sv * RC));
    }
    // module joints (else the long slabs read as one box): on every face longer than 12 m, a graphite
    // expansion joint (0.2 m, 1.2 cm proud) splits it into prefab modules and the middle module's skin is a warmer
    // off-white — the 22 m A block reads as three chunky units, E and C as two
    for (const s of ["n", "s"] as Side[]) {
      const L = u1 - u0; if (L < 12) continue;
      const nj = L > 18 ? 2 : 1, f = s === "n" ? v0 : v1, out = s === "n" ? -1 : 1;
      const ops = [...m.doors, ...m.windows, ...(m.sign ? [{ s: m.sign.s, at: m.sign.at, w: m.sign.w, y0: m.sign.y0, h: m.sign.h }] : [])].filter((o) => o.s === s);
      for (let k = 1; k <= nj; k++) {
        let at = u0 + L * k / (nj + 1);
        for (let tries = 0; tries < 8 && ops.some((o) => Math.abs(o.at - at) < o.w / 2 + 0.35); tries++) at += (tries % 2 ? -1 : 1) * (tries + 1) * 0.6;
        if (ops.some((o) => Math.abs(o.at - at) < o.w / 2 + 0.35)) continue;
        shell.box(M.graphite, at - 0.1, m.floor - (m.stilts ? 0.3 : 0.24), Math.min(f, f + out * 0.012), at + 0.1, m.roofTop - 0.42, Math.max(f, f + out * 0.012), { bevel: 0.01 });
        // bolt heads up the joint
        for (let yy = m.floor + 0.6; yy < m.roofTop - 0.6; yy += 0.7) shell.box(M.steel, at - 0.03, yy, Math.min(f, f + out * 0.02), at + 0.03, yy + 0.06, Math.max(f, f + out * 0.02), { tint: 0x9aa0a6 });
      }
      if (nj === 2) {
        // the middle module: a warm off-white skin panel over the white (flush, 6 mm) between the joints
        const a0 = u0 + L / 3 + 0.1, a1 = u0 + 2 * L / 3 - 0.1, top0 = m.roofTop - 0.42;
        const segs: Array<[number, number]> = []; let c0 = a0;
        for (const o of ops.filter((o) => o.at + o.w / 2 > a0 && o.at - o.w / 2 < a1).sort((p, q) => p.at - q.at)) { segs.push([c0, o.at - o.w / 2 - 0.2]); c0 = o.at + o.w / 2 + 0.2; }
        segs.push([c0, a1]);
        const yb = m.floor + (m.scheme === "band" ? 1.15 : 0.42);
        for (const [p0, p1] of segs) if (p1 - p0 > 0.3) shell.box(M.white, p0, yb, Math.min(f, f + out * 0.006), p1, top0, Math.max(f, f + out * 0.006), { tint: 0xf3e6cc });
        // … and above / below every opening inside it
        for (const o of ops.filter((o) => o.at + o.w / 2 > a0 && o.at - o.w / 2 < a1)) {
          const q0 = Math.max(a0, o.at - o.w / 2 - 0.2), q1 = Math.min(a1, o.at + o.w / 2 + 0.2), isDoor = m.doors.includes(o as never);
          const oy0 = isDoor ? 0 : ((o as { y0?: number }).y0 ?? 1), oh = isDoor ? ((o as { h?: number }).h ?? 2.5) : ((o as { h?: number }).h ?? 1.4);
          if (!isDoor && m.floor + oy0 - 0.2 > yb + 0.05) shell.box(M.white, q0, yb, Math.min(f, f + out * 0.006), q1, m.floor + oy0 - 0.2, Math.max(f, f + out * 0.006), { tint: 0xf3e6cc });
          const ya = m.floor + oy0 + oh + (isDoor ? 0.45 : 0.32);
          if (top0 - ya > 0.1) shell.box(M.white, q0, ya, Math.min(f, f + out * 0.006), q1, top0, Math.max(f, f + out * 0.006), { tint: 0xf3e6cc });
        }
      }
    }
    // pilasters every ~4 m where no opening is
    const ops = [...m.doors, ...m.windows, ...(m.sign ? [{ ...m.sign }] : [])];
    for (const s of ["n", "s", "e", "w"] as Side[]) {
      const along = s === "n" || s === "s", a = along ? u0 : v0, b = along ? u1 : v1;
      const n = Math.max(1, Math.round((b - a) / 4));
      for (let k = 1; k < n; k++) {
        const at = a + (b - a) * k / n;
        if (ops.some((o) => o.s === s && Math.abs(o.at - at) < o.w / 2 + 0.25)) continue;
        const f = s === "n" ? v0 : s === "s" ? v1 : s === "w" ? u0 : u1, out = s === "n" || s === "w" ? -1 : 1;
        if (along) shell.box(M.paint, at - 0.08, m.floor - 0.1, Math.min(f, f + out * 0.05), at + 0.08, top - 0.4, Math.max(f, f + out * 0.05), { tint: 0xc9ccca });
        else shell.box(M.paint, Math.min(f, f + out * 0.05), m.floor - 0.1, at - 0.08, Math.max(f, f + out * 0.05), top - 0.4, at + 0.08, { tint: 0xc9ccca });
      }
    }
    // doors: yellow frame + a graphite sliding leaf parked beside the opening + a lamp above
    for (const d of m.doors) {
      const along = d.s === "n" || d.s === "s", f = d.s === "n" ? v0 : d.s === "s" ? v1 : d.s === "w" ? u0 : u1, out = d.s === "n" || d.s === "w" ? -1 : 1;
      const dh = d.h ?? 2.5, a0 = d.at - d.w / 2, a1 = d.at + d.w / 2, fw = 0.12;
      const P = (pa: number, pb: number, ya: number, yb: number, d0: number, d1: number, mat: THREE.Material, bins = shell, bevel = 0) => {
        const q0 = f + out * d0, q1 = f + out * d1;
        if (along) bins.box(mat, pa, ya, Math.min(q0, q1), pb, yb, Math.max(q0, q1), { bevel }); else bins.box(mat, Math.min(q0, q1), ya, pa, Math.max(q0, q1), yb, pb, { bevel });
      };
      P(a0 - fw, a0, m.floor, m.floor + dh, -0.02, 0.07, M.yellow);
      P(a1, a1 + fw, m.floor, m.floor + dh, -0.02, 0.07, M.yellow);
      P(a0 - fw, a1 + fw, m.floor + dh, m.floor + dh + fw, -0.02, 0.07, M.yellow);
      // reveal lining inside the opening (thin, within the wall thickness)
      P(a0 - 0.02, a0, m.floor, m.floor + dh, -t, 0, M.trim); P(a1, a1 + 0.02, m.floor, m.floor + dh, -t, 0, M.trim);
      // sliding leaf (parked over the wall on the side with more room), with a vision strip
      const leafW = Math.min(d.w + 0.1, 1.6), side = (d.at - (along ? u0 : v0)) > ((along ? u1 : v1) - d.at) ? -1 : 1;
      const la = side > 0 ? a1 + fw + 0.02 : a0 - fw - 0.02 - leafW, lb = la + leafW;
      if (la > (along ? u0 : v0) + 0.3 && lb < (along ? u1 : v1) - 0.3 && (d.h ?? 2.5) <= 2.6) {
        P(la, lb, m.floor + 0.02, m.floor + dh - 0.02, 0.005, 0.055, M.graphite, shell, 0.02);
        P(la + leafW * 0.3, lb - leafW * 0.3, m.floor + 1.4, m.floor + 2.0, 0.055, 0.06, M.glassDark, near);
        P(a0 - 0.2, lb + 0.2 > a1 ? Math.max(lb, a1) + 0.2 : a1 + 0.2, m.floor + dh + fw, m.floor + dh + fw + 0.08, 0.02, 0.1, M.trim);
      } else if ((d.h ?? 2.5) > 2.6) {
        // roller door: the rolled drum box above the opening + guide rails
        P(a0 - 0.1, a1 + 0.1, m.floor + dh + 0.02, m.floor + dh + 0.42, 0.0, 0.13, M.graphite, shell, 0.04);
      }
      P(d.at - 0.18, d.at + 0.18, m.floor + dh + 0.2, m.floor + dh + 0.34, 0.02, 0.14, M.tealGlow, near);
    }
    // painted sign board (B: the CNVS.DEV wordmark on the south face)
    if (m.sign) {
      const s = m.sign, f = s.s === "s" ? v1 : v0, out = s.s === "s" ? 1 : -1;
      const a0 = s.at - s.w / 2, a1 = s.at + s.w / 2, y0 = m.floor + s.y0, y1 = y0 + s.h;
      shell.box(M.graphite, a0 - 0.08, y0 - 0.08, Math.min(f, f + out * 0.06), a1 + 0.08, y1 + 0.08, Math.max(f, f + out * 0.06), { bevel: 0.03 });
      const z = f + out * 0.065;
      shell.quad(M.sign, out > 0 ? [[a0, y0, z], [a1, y0, z], [a1, y1, z], [a0, y1, z]] : [[a1, y0, z], [a0, y0, z], [a0, y1, z], [a1, y1, z]]);
    }
    // rooms (lighting): split by partitions
    const cuts = (m.partitions ?? []).filter((p) => p.axis === "u").map((p) => p.at).sort((a, b) => a - b);
    const edges = [u0 + t, ...cuts, u1 - t];
    for (let i = 0; i < edges.length - 1; i++) {
      const ra = edges[i] + (i > 0 ? 0.1 : 0), rb = edges[i + 1] - (i < edges.length - 2 ? 0.1 : 0);
      const room: Room = { min: new THREE.Vector3(ra, m.floor - 0.1, v0 + t), max: new THREE.Vector3(rb, ceil + 0.05, v1 - t), lamps: [] };
      const col = new THREE.Color(m.id === "A" && i === 0 ? "#a8e8f0" : m.id === "D" || m.id === "F" ? "#ffe2b8" : m.id === "C" ? "#eaf6ff" : "#e6f0ff");
      const nx = Math.max(1, Math.round((rb - ra) / 4.5)), nz = Math.max(1, Math.round((v1 - v0 - 2 * t) / 5));
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const lx = ra + (rb - ra) * (a + 0.5) / nx, lz = v0 + t + (v1 - v0 - 2 * t) * (b + 0.5) / nz;
        room.lamps.push({ p: new THREE.Vector3(lx, ceil - 0.25, lz), i: m.id === "A" ? 0.9 : 1.2, c: col });
        // (the ceiling + its light panels are the interiors kit's drop ceiling — the lamp list only drives roomLight)
      }
      rooms.push(room);
    }
  }

  // ---- rails (deck / landing edges): posts every ~1.5 m, top tube, knee rail, kick plate
  await y();
  for (const r of L.rails) {
    const [ax, az] = r.a, [bx, bz] = r.b, len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.5));
    const y = r.y;
    for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; shell.box(M.yellow, x - 0.035, y, z - 0.035, x + 0.035, y + 1.02, z + 0.035); }
    // handrail: a rounded flat-topped rail 9 cm wide over the 8 cm rail collider (its top is the collider's top)
    { const alongX = Math.abs(bx - ax) > Math.abs(bz - az), x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
      if (alongX) shell.box(M.yellow, x0, y + 0.99, z0 - 0.045, x1, y + 1.06, z1 + 0.045, { bevel: 0.025 }); else shell.box(M.yellow, x0 - 0.045, y + 0.99, z0, x1 + 0.045, y + 1.06, z1, { bevel: 0.025 }); }
    near.cyl(M.yellow, [ax, y + 0.55, az], [bx, y + 0.55, bz], 0.022, 5);
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    if (along) near.box(M.yellow, Math.min(ax, bx), y, az - 0.012, Math.max(ax, bx), y + 0.12, az + 0.012); else near.box(M.yellow, ax - 0.012, y, Math.min(az, bz), ax + 0.012, y + 0.12, Math.max(az, bz));
  }
  // ---- stair handrails: sloped tube 1.0 above the nosings + a post every third step
  for (const sr of L.stairRails) {
    const st = sr.st, s = st.s, d = st.dir, sd: [number, number] = sr.side === "e" ? [1, 0] : sr.side === "w" ? [-1, 0] : sr.side === "s" ? [0, 1] : [0, -1];
    const pts: V3[] = [];
    for (let i = 0; i < st.n; i++) {
      const along = (i + 0.5) * st.tread, x = s.at[0] + d[0] * along + sd[0] * sr.off, z = s.at[1] + d[1] * along + sd[1] * sr.off, y = stepTop(st, i);
      if (i % 3 === 0 || i === st.n - 1) shell.box(M.yellow, x - 0.035, y, z - 0.035, x + 0.035, y + 1.02, z + 0.035);
      if (i === 0 || i === st.n - 1) pts.push([x, y + 1.03, z]);
    }
    if (pts.length === 2) {
      shell.cyl(M.yellow, pts[0], pts[1], 0.035, 8);
      // a bar-grating balustrade panel under the handrail, in the plane of the per-step rail colliders: the
      // rail boxes (step top … +1.05) read as the solid guard they are instead of an invisible wall between the posts
      const [a, b] = pts, lo = 0.93, hi = 0.07;
      const P = (p: V3, dy: number): V3 => [p[0], p[1] - dy, p[2]];
      const q: [V3, V3, V3, V3] = [P(a, lo), P(b, lo), P(b, hi), P(a, hi)];
      shell.quad(M.grate, q, 0xffffff, false); shell.quad(M.grate, [q[1], q[0], q[3], q[2]], 0xffffff, false);
      near.cyl(M.yellow, [a[0], a[1] - 0.95, a[2]], [b[0], b[1] - 0.95, b[2]], 0.025, 6);
    }
  }

  // ---- stair stringers: a yellow sloped channel on each open side along the nosing line + graphite ribs below it
  for (const st of L.stairs) {
    const s = st.s, d = st.dir, run = st.n * st.tread, hw = s.w / 2;
    if (s.y1 - s.y0 < 1.0) continue;
    for (const sg of [-1, 1]) {
      const ox = d[0] === 0 ? sg * (hw + 0.035) : 0, oz = d[0] === 0 ? 0 : sg * (hw + 0.035);
      const a: V3 = [s.at[0] + ox, s.y0 + st.first - 0.28, s.at[1] + oz], b: V3 = [s.at[0] + d[0] * run + ox, s.y1 - 0.28, s.at[1] + d[1] * run + oz];
      const L2d = Math.hypot(b[0] - a[0], b[2] - a[2]), ang = Math.atan2(b[1] - a[1], L2d);
      const yaw = Math.atan2(d[0], d[1]);
      near.obox(M.yellow, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [0.07, 0.3, Math.hypot(L2d, b[1] - a[1])], { yaw, pitch: -ang });
      const nr = Math.floor(run / 0.9);
      for (let k = 1; k < nr; k++) {
        const t = k / nr, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, yTop = a[1] + (b[1] - a[1]) * t - 0.1;
        if (yTop - st.base < 0.3) continue;
        near.box(M.graphite, x - (d[0] === 0 ? 0.03 : 0.05), st.base, z - (d[0] === 0 ? 0.05 : 0.03), x + (d[0] === 0 ? 0.03 : 0.05), yTop, z + (d[0] === 0 ? 0.05 : 0.03));
      }
    }
  }

  // ---- helipad (octagonal prism, painted deck, edge lights) — the same octagon as its 4 collider boxes
  {
    const { u, v, a, top } = HELI, R = a / Math.cos(Math.PI / 8);
    const prism = new THREE.CylinderGeometry(R, R, top - G + 0.2, 8, 1, false);
    const mm = new THREE.Matrix4().makeRotationY(Math.PI / 8).setPosition(u, (top + G - 0.2) / 2, v);
    shell.add(M.white, prism, mm, 0xf2efe8, true);
    for (let k = 0; k < 8; k++) {
      const ang = k * Math.PI / 4, rr = R * Math.cos(Math.PI / 8) * 0 + R;
      near.obox(M.graphite, [u + Math.cos(ang + Math.PI / 8) * (rr - 0.02) , (G + top) / 2 - 0.1, v + Math.sin(ang + Math.PI / 8) * (rr - 0.02)], [0.3, top - G + 0.1, 0.3], { yaw: -(ang + Math.PI / 8), bevel: 0.05 });
    }
    // hazard skirt band + a graphite lip
    const band = new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.34, 8, 1, true);
    shell.add(M.hazard, band, new THREE.Matrix4().makeRotationY(Math.PI / 8).setPosition(u, top - 0.3, v), 0xffffff, true);
    const lip = new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.1, 8, 1, false);
    shell.add(M.graphite, lip, new THREE.Matrix4().makeRotationY(Math.PI / 8).setPosition(u, top - 0.08, v), 0xffffff, true);
    // painted top (uv 0..1 across the octagon)
    const g = new THREE.CircleGeometry(R + 0.06, 8); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 8);
    const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * a) + 0.5, 0.5 - pos.getZ(i) / (2 * a));
    g.translate(u, top + 0.004, v);
    shell.add(M.heliTop, g, undefined, 0xffffff, false);
    // perimeter lights (red / green alternating) on the lip
    for (let k = 0; k < 16; k++) {
      const ang = k * Math.PI / 8, rr = a - 0.35;
      near.cyl(k % 2 ? M.red : M.green, [u + Math.cos(ang) * rr, top, v + Math.sin(ang) * rr], [u + Math.cos(ang) * rr, top + 0.09, v + Math.sin(ang) * rr], 0.08, 8);
    }
    // vents + access hatch on the skirt
    for (let k = 0; k < 8; k++) {
      const ang = Math.PI / 8 + k * Math.PI / 4 + Math.PI / 8, rr = a + 0.02;
      near.obox(M.graphite, [u + Math.cos(ang) * rr, G + 0.75, v + Math.sin(ang) * rr], [1.2, 0.5, 0.05], { yaw: -ang + Math.PI / 2, bevel: 0.01 });
    }
  }
  return { shell, interior, glass, near, rooms };
}
