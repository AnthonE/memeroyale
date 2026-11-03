// CNVS LAB — furniture, equipment and yard cover, drawn inside each PROPS collider envelope (shared/pois/cnvs-lab.ts):
// server racks with hot-aisle containment, consoles + monitors, lab benches, specimen tanks (a glowing banana inside),
// bunks, lockers, shelving, generators, AC condensers, flight cases, barrels, cable drums, water tanks, the buggy, solar
// rows, planters; plus the fence (posts, chain-link, open gate leaves, torn breaches) and the yard paving.
import * as THREE from "three";
import { PROPS, PROP_DIMS, MODULES, FENCE, HELI, G, gateLeaves, labLayout, CONTAINERS, CONSOLE_BRIDGE, CONSOLE_STRIP, BUGGY_POSTS, BUGGY_CANOPY, bunkParts, BUNK, CYL_PROPS, ANTENNA_WHIPS, BARRIER_STEPS, WATERTANK_RC, CHAIR_SEAT, CHAIR_BACK, LAMP_PLINTH, LAMP_POLE, DOME, type PropSpec } from "../../../../../shared/pois/cnvs-lab";
import { Bins, type V3 } from "./geo";
import type { LabMats } from "./mats";

const rng = (s: number) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

/** a banana: a pentagonal (ridged) tube along a gentle arc, thick in the middle, tapering to a stem and a dark tip */
function bananaGeo(len: number, r: number): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -len / 2, 0), new THREE.Vector3(len * 0.32, 0, 0), new THREE.Vector3(0, len / 2, 0));
  const n = 26, rad = 5, g = new THREE.TubeGeometry(curve, n, r, rad, false);
  const pos = g.attributes.position as THREE.BufferAttribute, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n, k = t < 0.12 ? 0.25 + t / 0.12 * 0.55 : t > 0.88 ? 0.3 + (1 - t) / 0.12 * 0.5 : 0.8 + 0.2 * Math.sin((t - 0.12) / 0.76 * Math.PI);
    curve.getPointAt(t, c);
    for (let j = 0; j <= rad; j++) { const idx = i * (rad + 1) + j; v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c); pos.setXYZ(idx, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return g;
}

export async function buildProps(M: LabMats, bins: { interior: Bins; near: Bins; glass: Bins; shell: Bins }, yld: () => Promise<void> = async () => {}) {
  const r = rng(4242), glassBins = bins.glass;
  let np = 0;
  for (const p of PROPS) {
    if (++np % 40 === 0) await yld();
    const d = PROP_DIMS[p.k], s = p.s ?? 1;
    const w = (p.rot ? d[2] : d[0]) * s, dd = (p.rot ? d[0] : d[2]) * s;
    const inside = MODULES.find((m) => p.u > m.u[0] && p.u < m.u[1] && p.v > m.v[0] && p.v < m.v[1] && (p.y === undefined || Math.abs(p.y - m.floor) < 0.2));
    const y = p.y ?? (inside ? inside.floor : G);
    const indoor = !!inside && p.y === undefined || (p.y !== undefined && MODULES.some((m) => Math.abs(m.floor - p.y!) < 0.05 && p.u > m.u[0] && p.u < m.u[1] && p.v > m.v[0] && p.v < m.v[1]));
    // (outdoor props ≥ 1 m — cover, tanks, generators, solar rows — draw with the shell, visible to the far-proxy
    //  switch; the near bin (hidden beyond 90 m) keeps the small dressing only: no pop of cover at 90 m)
    const big = Math.max(w, dd, d[1]) >= 1.0;
    const B = indoor ? bins.interior : big ? bins.shell : bins.near;
    const x0 = p.u - w / 2, x1 = p.u + w / 2, z0 = p.v - dd / 2, z1 = p.v + dd / 2;
    const full = inside && (p.k === "rack" || p.k === "ups" || p.k === "shelf") ? inside.roofTop - inside.floor : d[1] * (p.k === "watertank" || p.k === "tank" ? Math.min(s, 1.25) : 1);
    const h = full;
    const F = indoor ? M.furn : M.paint, FM = indoor ? M.furnMetal : M.galv;
    const alongZ = dd > w;
    switch (p.k) {
      case "rack": {
        const bodyTop = y + 2.25;
        B.box(M.rack, x0, y, z0, x1, bodyTop, z1);
        B.box(M.furnMetal, x0 - 0.02, bodyTop, z0 - 0.02, x1 + 0.02, bodyTop + 0.08, z1 + 0.02, { tint: 0x3a3f45 });
        // hot-aisle containment + cable ladder up to the ceiling (the collider fills to the roof)
        B.box(M.furn, x0 + 0.05, bodyTop + 0.08, z0, x1 - 0.05, y + h - 0.32, z1, { tint: 0x9aa4ab });
        for (let z = z0 + 0.3; z < z1; z += 0.6) B.box(M.tealGlow, x0 - 0.005, bodyTop + 0.3, z, x1 + 0.005, bodyTop + 0.36, z + 0.3);
        B.box(M.furnMetal, x0 - 0.1, y + h - 0.32, z0, x1 + 0.1, y + h - 0.3, z1, { tint: 0x8a9096 });
        break;
      }
      case "ups": case "battery": case "pc": case "cabinet": {
        B.box(indoor ? M.furnMetal : M.graphite, x0, y, z0, x1, y + Math.min(h, p.k === "ups" ? 2.3 : h), z1, { bevel: 0.03, tint: p.k === "cabinet" ? 0xd9dcd8 : 0x3a3f45 });
        if (p.k === "ups" && h > 2.3) B.box(M.furn, x0 + 0.05, y + 2.3, z0 + 0.05, x1 - 0.05, y + h, z1 - 0.05, { tint: 0x8d969c });
        // status panel + LEDs on the long face (both sides: cheap)
        for (const sgn of [-1, 1]) {
          const zf = alongZ ? p.v : (sgn < 0 ? z0 - 0.006 : z1 + 0.006), xf = alongZ ? (sgn < 0 ? x0 - 0.006 : x1 + 0.006) : p.u;
          if (alongZ) B.box(M.screens[(p.u * 7 | 0) & 3], xf - 0.004, y + 1.2, zf - 0.2, xf + 0.004, y + 1.5, zf + 0.2);
          else B.box(M.screens[(p.u * 7 | 0) & 3], xf - 0.2, y + 1.2, zf - 0.004, xf + 0.2, y + 1.5, zf + 0.004);
          for (let k = 0; k < 4; k++) { const yy = y + 0.9 - k * 0.12; if (alongZ) B.box(k % 2 ? M.green : M.tealGlow, xf - 0.006, yy, zf - 0.3, xf + 0.006, yy + 0.04, zf - 0.26); else B.box(k % 2 ? M.green : M.tealGlow, xf - 0.3, yy, zf - 0.006, xf - 0.26, yy + 0.04, zf + 0.006); }
        }
        break;
      }
      case "console": if (p.back) {
        // control console: a white desk strip (keyboards, a glowing trackball deck) in front of a graphite monitor bridge
        // (1.85 m, three screens facing the operator + a teal status strip) — the SAME two boxes the sim collides with
        const b = p.back, top = y + d[1], ch = CONSOLE_BRIDGE;
        const alongU = b === "n" || b === "s";   // the console runs along u
        const L0 = alongU ? x0 : z0, L1 = alongU ? x1 : z1, D0 = alongU ? z0 : x0, D1 = alongU ? z1 : x1, mid = p.tower ? (b === "n" || b === "w" ? D1 : D0) : b === "n" || b === "w" ? D1 - CONSOLE_STRIP : D0 + CONSOLE_STRIP;
        const back0 = b === "n" || b === "w" ? D0 : mid, back1 = b === "n" || b === "w" ? mid : D1;
        const fr0 = b === "n" || b === "w" ? mid : D0, fr1 = b === "n" || b === "w" ? D1 : mid;
        const face = b === "n" || b === "w" ? mid : mid;     // the bridge's operator-facing plane
        const fs = b === "n" || b === "w" ? 1 : -1;          // toward the operator
        const bx = (l0: number, l1: number, y0: number, y1: number, d0: number, d1: number, mat: THREE.Material, o: { tint?: number; bevel?: number } = {}) => alongU
          ? B.box(mat, l0, y0, Math.min(d0, d1), l1, y1, Math.max(d0, d1), o) : B.box(mat, Math.min(d0, d1), y0, l0, Math.max(d0, d1), y1, l1, o);
        bx(L0 - 0.012, L1 + 0.012, y, y + ch, Math.min(back0, back1) - 0.012, Math.max(back0, back1) + 0.012, M.furnMetal, { tint: 0x2e3338, bevel: 0.015 });
        if (!p.tower) {
          bx(L0, L1, y, top - 0.06, fr0, fr1, M.furn, { tint: 0xe9ecea, bevel: 0.03 });
          bx(L0 - 0.02, L1 + 0.02, top - 0.06, top, fr0 - 0.02, fr1 + 0.02, M.furnMetal, { tint: 0x3a3f45, bevel: 0.015 });
        }
        const n = Math.max(2, Math.round((L1 - L0) / 0.75)), sw = (L1 - L0) / n;
        for (let k = 0; k < n; k++) {
          const a0 = L0 + k * sw + 0.05, a1 = L0 + (k + 1) * sw - 0.05;
          bx(a0, a1, y + 1.02, y + 1.62, face + fs * 0.005, face + fs * 0.012, M.screens[(k + (p.u | 0)) & 3]);
          if (!p.tower) bx(a0 + 0.1, a1 - 0.1, top, top + 0.025, face + fs * 0.12, face + fs * 0.3, M.furnMetal, { tint: 0x222428 });
          else bx(a0, a1, y + 0.3, y + 0.9, face + fs * 0.005, face + fs * 0.012, M.screens[(k + 2) & 3]);
        }
        bx(L0 + 0.05, L1 - 0.05, y + 1.72, y + 1.76, face + fs * 0.005, face + fs * 0.012, M.tealGlow);
        if (!p.tower) bx(L0 + 0.05, L1 - 0.05, top + 0.005, top + 0.012, face + fs * 0.34, face + fs * 0.4, M.tealGlow);
        break;
      } // eslint-disable-next-line no-fallthrough
      case "desk": case "table": {
        const top = y + d[1];
        // operator desks / consoles: a solid modesty-panel pedestal (the console reads as furniture, not legs), a
        // bevelled top with a graphite edge, monitors on the back edge facing `face`, keyboard, mouse, mugs and papers
        const console_ = p.k === "console";
        B.box(F, x0, top - 0.05, z0, x1, top, z1, { bevel: 0.015, tint: p.k === "table" ? 0xe9e4d8 : 0xf2f2ee });
        B.box(FM, x0 - 0.005, top - 0.07, z0 - 0.005, x1 + 0.005, top - 0.045, z1 + 0.005, { tint: 0x2d3136 });
        if (console_) {
          // console body: a graphite pedestal set back 0.25 m on the operator side (knee space) + a teal status strip
          const fx = p.face === "e" ? 1 : p.face === "w" ? -1 : 0, fz = p.face === "s" ? 1 : p.face === "n" ? -1 : (alongZ ? 0 : 1);
          const bx0 = x0 + (fx > 0 ? 0 : fx < 0 ? 0.25 : 0.03), bx1 = x1 - (fx > 0 ? 0.25 : fx < 0 ? 0 : 0.03), bz0 = z0 + (fz > 0 ? 0 : fz < 0 ? 0.25 : 0.03), bz1 = z1 - (fz > 0 ? 0.25 : fz < 0 ? 0 : 0.03);
          B.box(FM, bx0, y, bz0, bx1, top - 0.07, bz1, { tint: 0x3a3f45, bevel: 0.02 });
          if (fx) B.box(M.tealGlow, fx > 0 ? bx1 : bx0 - 0.004, y + 0.08, bz0 + 0.1, fx > 0 ? bx1 + 0.004 : bx0, y + 0.11, bz1 - 0.1);
          else B.box(M.tealGlow, bx0 + 0.1, y + 0.08, fz > 0 ? bz1 : bz0 - 0.004, bx1 - 0.1, y + 0.11, fz > 0 ? bz1 + 0.004 : bz0);
        } else for (const [lx, lz] of [[x0 + 0.06, z0 + 0.06], [x1 - 0.06, z0 + 0.06], [x0 + 0.06, z1 - 0.06], [x1 - 0.06, z1 - 0.06]]) B.box(FM, lx - 0.03, y, lz - 0.03, lx + 0.03, top - 0.05, lz + 0.03, { tint: 0x5d646b });
        if (p.holo) {
          // planning table: an emissive site map inlaid in the top + a graphite rim, a few markers and a tablet
          B.box(M.screens[1], x0 + 0.08, top, z0 + 0.08, x1 - 0.08, top + 0.006, z1 - 0.08);
          for (let k = 0; k < 4; k++) { const mx = x0 + 0.3 + r() * (w - 0.6), mz = z0 + 0.3 + r() * (dd - 0.6); B.cyl(k % 2 ? M.red : M.amber, [mx, top, mz], [mx, top + 0.06, mz], 0.025, 6); }
        }
        if (p.k !== "table") {
          // monitors on the back edge, facing f (default: +x for desks along z, +z for desks along x)
          const f: [number, number] = p.face === "e" ? [1, 0] : p.face === "w" ? [-1, 0] : p.face === "n" ? [0, -1] : p.face === "s" ? [0, 1] : alongZ ? [1, 0] : [0, 1];
          const nMon = console_ ? 3 : 2, span = f[0] ? z1 - z0 : x1 - x0, depth = f[0] ? w : dd;
          const back = -(depth / 2 - 0.16);
          for (let k = 0; k < nMon; k++) {
            const a = (k + 0.5) / nMon - 0.5, mw = Math.min(0.62, span / nMon - 0.06);
            const cu = p.u + (f[0] ? back * f[0] : a * span), cv = p.v + (f[0] ? a * span : back * f[1]);
            const scr = M.screens[(k + (p.u | 0)) & 3], mh = console_ ? 0.48 : 0.42;
            // stand + bezel + screen (facing f)
            B.box(M.furnMetal, cu - 0.05, top, cv - 0.05, cu + 0.05, top + 0.12, cv + 0.05, { tint: 0x2a2e33 });
            if (f[0]) { B.box(M.furnMetal, cu - 0.03, top + 0.1, cv - mw / 2, cu + 0.03, top + 0.1 + mh, cv + mw / 2, { tint: 0x2a2e33, bevel: 0.01 }); B.box(scr, f[0] > 0 ? cu + 0.03 : cu - 0.036, top + 0.14, cv - mw / 2 + 0.03, f[0] > 0 ? cu + 0.036 : cu - 0.03, top + 0.06 + mh, cv + mw / 2 - 0.03); }
            else { B.box(M.furnMetal, cu - mw / 2, top + 0.1, cv - 0.03, cu + mw / 2, top + 0.1 + mh, cv + 0.03, { tint: 0x2a2e33, bevel: 0.01 }); B.box(scr, cu - mw / 2 + 0.03, top + 0.14, f[1] > 0 ? cv + 0.03 : cv - 0.036, cu + mw / 2 - 0.03, top + 0.06 + mh, f[1] > 0 ? cv + 0.036 : cv - 0.03); }
          }
          // keyboard + mouse in front of the middle, a mug, a paper stack / clipboard
          const kx = (off: number, along: number): [number, number] => f[0] ? [p.u + f[0] * off, p.v + along] : [p.u + along, p.v + f[1] * off];
          const [ku, kv] = kx(0.12, 0), kw = f[0] ? [0.09, 0.25] : [0.25, 0.09];
          B.box(M.furnMetal, ku - kw[0], top, kv - kw[1], ku + kw[0], top + 0.02, kv + kw[1], { tint: 0x222428, bevel: 0.005 });
          const [mu, mv] = kx(0.12, span * 0.22); B.box(M.furnMetal, mu - 0.035, top, mv - 0.035, mu + 0.035, top + 0.02, mv + 0.035, { tint: 0x222428 });
          const [gu, gv] = kx(0.2, -span * 0.35); B.cyl(M.paint, [gu, top, gv], [gu, top + 0.1, gv], 0.042, 10, { tint: [0xffd430, 0x2f8f8a, 0xf4f2ea][(p.u * 3 | 0) % 3] });
          const [pu, pv] = kx(0.05, span * 0.36); B.box(M.paint, pu - 0.15, top, pv - 0.11, pu + 0.15, top + 0.025, pv + 0.11, { tint: 0xf4f2ea });
        }
        break;
      }
      case "chair": {
        // operator chair: 5-star base, gas lift, padded seat (the seat block collider's top), back panel + headrest
        const f = p.face ?? "n", seatT = y + CHAIR_SEAT;
        for (let k = 0; k < 5; k++) { const a = k * 1.2566; B.box(M.furnMetal, p.u + Math.cos(a) * 0.14 - 0.14, y + 0.04, p.v + Math.sin(a) * 0.14 - 0.03, p.u + Math.cos(a) * 0.14 + 0.14, y + 0.08, p.v + Math.sin(a) * 0.14 + 0.03, { tint: 0x222428, rotY: -a }); }
        B.cyl(M.furnMetal, [p.u, y + 0.06, p.v], [p.u, seatT - 0.1, p.v], 0.035, 8, { tint: 0x777d83 });
        B.box(M.fabric, x0 + 0.01, seatT - 0.1, z0 + 0.01, x1 - 0.01, seatT, z1 - 0.01, { bevel: 0.04, tint: 0x2f3a44 });
        const bu0 = f === "w" ? x1 - CHAIR_BACK : x0, bu1 = f === "e" ? x0 + CHAIR_BACK : x1, bv0 = f === "n" ? z1 - CHAIR_BACK : z0, bv1 = f === "s" ? z0 + CHAIR_BACK : z1;
        const nar = (lo: number, hi: number, full: boolean) => full ? [lo + 0.04, hi - 0.04] : [lo, hi];
        const [au0, au1] = nar(bu0, bu1, f === "n" || f === "s"), [av0, av1] = nar(bv0, bv1, f === "e" || f === "w");
        B.box(M.fabric, au0, seatT, av0, au1, y + h, av1, { bevel: 0.035, tint: 0x2f3a44 });
        B.box(M.furnMetal, au0 + (f === "n" || f === "s" ? 0.1 : 0), y + h - 0.06, av0 + (f === "e" || f === "w" ? 0.1 : 0), au1 - (f === "n" || f === "s" ? 0.1 : 0), y + h, av1 - (f === "e" || f === "w" ? 0.1 : 0), { tint: 0xffd430, bevel: 0.02 });
        break;
      }
      case "weather": {
        // weather station: ballast block, galvanised mast, louvred white instrument screen, a small solar panel, the
        // anemometer cups + wind vane on top (above 2 m: visual only)
        B.box(M.concrete, x0, y, z0, x1, y + 0.25, z1, { bevel: 0.03, tint: 0xd8d2c6 });
        B.cyl(M.galv, [p.u, y + 0.25, p.v], [p.u, y + h, p.v], 0.045, 8);
        B.box(M.paint, p.u - 0.17, y + 1.15, p.v - 0.17, p.u + 0.17, y + 1.55, p.v + 0.17, { bevel: 0.02, tint: 0xf4f2ea });
        for (let k = 0; k < 4; k++) B.box(M.trim, p.u - 0.175, y + 1.2 + k * 0.09, p.v - 0.175, p.u + 0.175, y + 1.215 + k * 0.09, p.v + 0.175);
        B.box(M.solar, p.u - 0.05, y + 1.75, p.v - 0.25, p.u + 0.35, y + 1.77, p.v + 0.25);
        for (let k = 0; k < 3; k++) { const a = k * 2.094; B.cyl(M.galv, [p.u, y + h - 0.05, p.v], [p.u + Math.cos(a) * 0.22, y + h - 0.05, p.v + Math.sin(a) * 0.22], 0.01, 4); B.add(M.graphite, new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI), new THREE.Matrix4().makeTranslation(p.u + Math.cos(a) * 0.22, y + h - 0.05, p.v + Math.sin(a) * 0.22)); }
        B.box(M.yellow, p.u - 0.02, y + h - 0.28, p.v - 0.3, p.u + 0.02, y + h - 0.2, p.v + 0.18);
        B.add(M.red, new THREE.SphereGeometry(0.04, 8, 6), new THREE.Matrix4().makeTranslation(p.u, y + h + 0.03, p.v));
        break;
      }
      case "dome": {
        // radome: a graphite plinth with vents + a white faceted sphere (a CNVS band round its equator)
        B.box(M.graphite, x0, y, z0, x1, y + DOME.plinth, z1, { bevel: 0.05 });
        for (let k = 0; k < 3; k++) B.box(M.trim, x0 + 0.25 + k * 0.4, y + 0.12, z1, x0 + 0.5 + k * 0.4, y + 0.36, z1 + 0.012);
        const cy = y + DOME.plinth + DOME.r;
        B.add(M.white, new THREE.IcosahedronGeometry(DOME.r, 2), new THREE.Matrix4().makeTranslation(p.u, cy, p.v), 0xf4f2ea, true);
        B.cyl(M.yellow, [p.u, cy - 0.05, p.v], [p.u, cy + 0.05, p.v], DOME.r + 0.012, 24);
        B.cyl(M.galv, [p.u, y + DOME.plinth, p.v], [p.u, cy - DOME.r * 0.7, p.v], DOME.r * 0.55, 16);
        break;
      }
      case "lamp": {
        // yard lamp post: concrete plinth, graphite pole, yellow arm + a warm LED head (the arm and head are ≥ 4 m up)
        B.box(M.concrete, x0, y - 0.05, z0, x1, y + LAMP_PLINTH, z1, { bevel: 0.04, tint: 0xd8d2c6 });
        B.box(M.graphite, p.u - LAMP_POLE / 2 - 0.005, y + LAMP_PLINTH, p.v - LAMP_POLE / 2 - 0.005, p.u + LAMP_POLE / 2 + 0.005, y + h - 0.55, p.v + LAMP_POLE / 2 + 0.005, { bevel: 0.02 });
        B.box(M.yellow, p.u - 0.06, y + h - 0.6, p.v - 0.06, p.u + 0.06, y + h - 0.45, p.v + 0.9, { bevel: 0.02 });
        B.box(M.graphite, p.u - 0.18, y + h - 0.65, p.v + 0.62, p.u + 0.18, y + h - 0.5, p.v + 1.02, { bevel: 0.03 });
        B.box(M.lampPanel, p.u - 0.15, y + h - 0.66, p.v + 0.65, p.u + 0.15, y + h - 0.65, p.v + 0.99);
        B.box(M.hazard, p.u - LAMP_POLE / 2 - 0.01, y + LAMP_PLINTH + 0.6, p.v - LAMP_POLE / 2 - 0.01, p.u + LAMP_POLE / 2 + 0.01, y + LAMP_PLINTH + 1.0, p.v + LAMP_POLE / 2 + 0.01);
        break;
      }
      case "bench": {
        const top = y + d[1];
        B.box(F, x0, y, z0, x1, top - 0.06, z1, { tint: 0xdfe4e2 });
        B.box(M.furnMetal, x0 - 0.02, top - 0.06, z0 - 0.02, x1 + 0.02, top, z1 + 0.02, { tint: 0x30353a });
        // modelled glassware along the bench: Erlenmeyer flasks (cone + neck + glowing liquid), beakers, a test-tube
        // rack, a microscope (base, arm, stage, tube + eyepiece), a sample tray; drawers + kick plate on the body
        const along = w >= dd, L = along ? w : dd, at = (t: number, off: number): [number, number] => along ? [x0 + t * L, p.v + off] : [p.u + off, z0 + t * L];
        for (let k = 0; k < 4; k++) { const [dx, dz] = at(0.12 + k * 0.25, along ? dd / 2 - 0.02 : w / 2 - 0.02); B.box(M.furnMetal, dx - 0.12, y + 0.35, dz - 0.012, dx + 0.12, y + 0.37, dz + 0.012, { tint: 0x9aa0a6 }); }
        for (const [t, col] of [[0.1, 0x7dffb0], [0.22, 0xff8ae0]] as Array<[number, number]>) {
          const [fx, fz] = at(t, -0.12);
          B.cyl(M.specimen, [fx, top, fz], [fx, top + 0.18, fz], 0.11, 14, { r1: 0.035 });
          B.cyl(M.specimen, [fx, top + 0.18, fz], [fx, top + 0.27, fz], 0.03, 10);
          B.cyl(M.tealGlow, [fx, top + 0.005, fz], [fx, top + 0.07, fz], 0.095, 14, { r1: 0.07, tint: col });
        }
        for (const t of [0.34, 0.4]) { const [bx, bz] = at(t, 0.1); B.cyl(M.specimen, [bx, top, bz], [bx, top + 0.14, bz], 0.06, 12); B.cyl(M.tealGlow, [bx, top + 0.005, bz], [bx, top + 0.06, bz], 0.055, 12, { tint: 0x7de7ff }); }
        { const [rx, rz] = at(0.55, 0); const a0 = along ? rx - 0.2 : rx - 0.06, a1 = along ? rx + 0.2 : rx + 0.06, b0 = along ? rz - 0.06 : rz - 0.2, b1 = along ? rz + 0.06 : rz + 0.2;
          B.box(M.furnMetal, a0, top, b0, a1, top + 0.08, b1, { tint: 0xe8eaec, bevel: 0.01 });
          for (let k = 0; k < 5; k++) { const [tx, tz] = at(0.55 + (k - 2) * 0.03, 0); B.cyl(M.specimen, [tx, top + 0.02, tz], [tx, top + 0.2, tz], 0.012, 6); } }
        { const [mx, mz] = at(0.78, -0.05);
          B.box(M.furnMetal, mx - 0.1, top, mz - 0.13, mx + 0.1, top + 0.04, mz + 0.13, { tint: 0x2d3136, bevel: 0.01 });
          B.cyl(M.furnMetal, [mx, top + 0.04, mz - 0.1], [mx, top + 0.32, mz - 0.06], 0.03, 8, { tint: 0x2d3136 });
          B.box(M.furnMetal, mx - 0.07, top + 0.12, mz - 0.07, mx + 0.07, top + 0.14, mz + 0.07, { tint: 0xe8eaec });
          B.cyl(M.furnMetal, [mx, top + 0.16, mz], [mx, top + 0.36, mz - 0.05], 0.025, 8, { tint: 0xe8eaec });
          B.cyl(M.furnMetal, [mx, top + 0.36, mz - 0.05], [mx, top + 0.42, mz - 0.12], 0.018, 8, { tint: 0x2d3136 }); }
        { const [sx, sz] = at(0.92, 0.05); B.box(M.furnMetal, sx - 0.1, top, sz - 0.14, sx + 0.1, top + 0.03, sz + 0.14, { tint: 0xffd430 }); }
        break;
      }
      case "tank": {
        const rr = CYL_PROPS.tank!(p);
        B.cyl(FM, [p.u, y, p.v], [p.u, y + 0.3, p.v], rr + 0.04, 16, { tint: 0x3a3f45 });
        B.cyl(FM, [p.u, y + h - 0.22, p.v], [p.u, y + h, p.v], rr + 0.04, 16, { tint: 0x3a3f45 });
        bins.glass.cyl(M.specimen, [p.u, y + 0.3, p.v], [p.u, y + h - 0.22, p.v], rr, 20, { caps: false });
        // the specimen: a banana, of course — a tapered, faceted curved fruit with a dark stem and tip, floating upright
        const ban = bananaGeo(0.78 * s, 0.1 * s); ban.rotateY((p.u * 1.7) % 6.28); ban.translate(p.u, y + 0.3 + (h - 0.52) * 0.5, p.v);
        // lit (an emissive banana shades flat, like a card), glossy yellow peel with a green-tinged stem
        // end and a dark stem + blossom tip, so the curve and the five ridges read
        B.add(M.furn, ban, undefined, 0xffd23a, true);
        { const L = 0.78 * s, yb = y + 0.3 + (h - 0.52) * 0.5, ry = (p.u * 1.7) % 6.28, cs = Math.cos(ry), sn = Math.sin(ry);
          const tip = (dy: number): V3 => [p.u, yb + dy, p.v];
          B.cyl(M.furn, tip(L / 2 - 0.02), tip(L / 2 + 0.09), 0.026 * s, 6, { tint: 0x6b8a2a, r1: 0.02 * s });
          B.cyl(M.furn, tip(-L / 2 - 0.03), tip(-L / 2 + 0.03), 0.022 * s, 6, { tint: 0x3a2a18 });
          void cs; void sn; }
        B.cyl(M.graphite, [p.u, y + 0.3, p.v], [p.u, y + 0.72, p.v], 0.012, 6);
        B.cyl(M.graphite, [p.u - 0.2, y + h - 0.22, p.v], [p.u - 0.1, y + 0.9, p.v], 0.008, 5);
        break;
      }
      case "hood": {
        B.box(F, x0, y, z0, x1, y + h, z1, { tint: 0xeef0ee });
        const f = x1 + 0.005;
        bins.glass.box(M.glass, f - 0.01, y + 1.0, z0 + 0.1, f, y + 1.9, z1 - 0.1);
        break;
      }
      case "bunk": {
        // exactly the shared bunkParts boxes: a steel frame bunk with head / foot boards, a back panel on the wall
        // side, two made beds (mattress, blanket, pillow), a ladder on the open side and a reading lamp
        const bp = bunkParts(p, y), along = w >= dd, back = bp[4];
        const frame = 0x4d545b;
        B.box(FM, bp[2][0], bp[2][2], bp[2][4], bp[2][1], bp[2][3], bp[2][5], { tint: frame, bevel: 0.02 });
        B.box(FM, bp[3][0], bp[3][2], bp[3][4], bp[3][1], bp[3][3], bp[3][5], { tint: frame, bevel: 0.02 });
        B.box(F, back[0], back[2], back[4], back[1], back[3], back[5], { tint: 0x8d7a62, bevel: 0.01 });
        const blanket = [0x5f7f9a, 0x9a5f4f, 0x5f8a62][Math.abs(Math.round(p.u * 3 + p.v)) % 3];
        for (const [yb, yt] of [[y + 0.29, y + BUNK.lower], [y + BUNK.up0, y + BUNK.up1]]) {
          // steel pan + front board flush with the collider face, mattress, blanket, pillow at the head end
          B.box(FM, x0 + 0.05, yb, z0 + 0.02, x1 - 0.05, yb + 0.1, z1 - 0.02, { tint: frame });
          B.box(M.fabric, x0 + 0.1, yb + 0.1, z0 + 0.08, x1 - 0.1, yt - 0.06, z1 - 0.08, { bevel: 0.05, tint: 0xe8e4da });
          if (along) B.box(M.fabric, x0 + 0.55, yt - 0.08, z0 + 0.06, x1 - 0.1, yt - 0.02, z1 - 0.06, { bevel: 0.03, tint: blanket });
          else B.box(M.fabric, x0 + 0.06, yt - 0.08, z0 + 0.55, x1 - 0.06, yt - 0.02, z1 - 0.1, { bevel: 0.03, tint: blanket });
          if (along) B.box(M.fabric, x0 + 0.12, yt - 0.06, z0 + 0.15, x0 + 0.5, yt + 0.05, z1 - 0.15, { bevel: 0.05, tint: 0xf4f2ea });
          else B.box(M.fabric, x0 + 0.15, yt - 0.06, z0 + 0.12, x1 - 0.15, yt + 0.05, z0 + 0.5, { bevel: 0.05, tint: 0xf4f2ea });
        }
        // a guard board along the open side of the upper bed (flush with the collider face)
        const open = along ? (back[4] <= z0 + 0.01 ? z1 : z0) : (back[0] <= x0 + 0.01 ? x1 : x0), os = (along ? open === z1 : open === x1) ? -1 : 1;
        if (along) B.box(FM, x0 + 0.5, y + BUNK.up0, Math.min(open, open + os * 0.04), x1 - 0.08, y + BUNK.up1, Math.max(open, open + os * 0.04), { tint: 0xffd430, bevel: 0.01 });
        else B.box(FM, Math.min(open, open + os * 0.04), y + BUNK.up0, z0 + 0.5, Math.max(open, open + os * 0.04), y + BUNK.up1, z1 - 0.08, { tint: 0xffd430, bevel: 0.01 });
        // ladder rungs at the foot end of the open side (thin, inside the envelope)
        for (let k = 0; k < 4; k++) { const yy = y + 0.5 + k * 0.3; if (along) B.box(FM, x0 + 0.1, yy, Math.min(open, open + os * 0.05), x0 + 0.45, yy + 0.03, Math.max(open, open + os * 0.05), { tint: frame }); else B.box(FM, Math.min(open, open + os * 0.05), yy, z0 + 0.1, Math.max(open, open + os * 0.05), yy + 0.03, z0 + 0.45, { tint: frame }); }
        // a footlocker at the foot of the open side (0.42 m: a step-over, no collider) with a duffel bag on top
        { const f = bp[5];   // the footlocker (a collider step): drawn exactly on its box, a duffel bag on top
          B.box(M.caseG, f[0], f[2], f[4], f[1], f[3], f[5], { bevel: 0.02 });
          B.box(M.fabric, f[0] + 0.1, f[3], f[4] + 0.08, f[0] + Math.min(0.5, f[1] - f[0] - 0.1), f[3] + 0.12, f[5] - 0.08, { bevel: 0.05, tint: 0x6a7a4a }); }
        // reading lamp on the back panel above the upper bed + a poster below it
        const bz = along ? (back[4] <= z0 + 0.01 ? z0 + BUNK.back : z1 - BUNK.back) : 0, bx = along ? 0 : (back[0] <= x0 + 0.01 ? x0 + BUNK.back : x1 - BUNK.back);
        if (along) { B.box(M.amber, p.u + 0.5, y + 1.72, Math.min(bz, bz - Math.sign(bz - p.v) * 0.08), p.u + 0.7, y + 1.8, Math.max(bz, bz - Math.sign(bz - p.v) * 0.08)); }
        else { B.box(M.amber, Math.min(bx, bx - Math.sign(bx - p.u) * 0.08), y + 1.72, p.v + 0.5, Math.max(bx, bx - Math.sign(bx - p.u) * 0.08), y + 1.8, p.v + 0.7); }
        break;
      }
      case "locker": {
        const n = 3;
        for (let k = 0; k < n; k++) {
          const a0 = x0 + (x1 - x0) * k / n, a1 = x0 + (x1 - x0) * (k + 1) / n;
          B.box(FM, a0 + 0.01, y, z0, a1 - 0.01, y + h, z1, { bevel: 0.015, tint: [0x2f8f8a, 0x3a3f45, 0x2f8f8a][k] });
          for (let v = 0; v < 4; v++) B.box(M.furnMetal, a0 + 0.12, y + 1.55 + v * 0.06, z1, a1 - 0.12, y + 1.58 + v * 0.06, z1 + 0.008, { tint: 0x16191c });
        }
        break;
      }
      case "shelf": {
        const sh = Math.min(h, 2.7);
        for (const [lx, lz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.box(FM, lx - 0.04 + (lx === x0 ? 0.04 : -0.04), y, lz - 0.04 + (lz === z0 ? 0.04 : -0.04), lx + 0.04 + (lx === x0 ? 0.04 : -0.04), y + sh, lz + 0.04 + (lz === z0 ? 0.04 : -0.04), { tint: 0xe8a61a });
        for (const yy of [0.15, 1.0, 1.85, 2.6]) {
          B.box(FM, x0, y + yy - 0.05, z0, x1, y + yy, z1, { tint: 0x3a3f45 });
          if (yy < 2.5) for (let k = 0; k < 3; k++) { if (r() < 0.25) continue; const bw = 0.4 + r() * 0.3; const bx = x0 + 0.1 + k * (w - 0.2) / 3 * (alongZ ? 0 : 1), bz = z0 + 0.1 + k * (dd - 0.2) / 3 * (alongZ ? 1 : 0);
            B.box(r() < 0.5 ? M.caseY : M.caseG, bx, y + yy, bz, bx + (alongZ ? w - 0.2 : bw), y + yy + 0.3 + r() * 0.25, bz + (alongZ ? bw : dd - 0.2), { bevel: 0.02 }); }
        }
        if (h > sh + 0.05) B.box(M.furn, x0, y + sh, z0, x1, y + h, z1, { tint: 0x8d969c });
        break;
      }
      case "crate": case "crateL": case "pallet": {
        if (p.k === "pallet") {
          B.box(M.wood, x0, y, z0, x1, y + 0.14, z1, { tint: 0xc9a878 });
          B.box(M.caseG, x0 + 0.05, y + 0.14, z0 + 0.05, x1 - 0.05, y + 0.52, z1 - 0.05, { bevel: 0.03 });
          B.box(M.caseY, x0 + 0.15, y + 0.52, z0 + 0.15, x1 - 0.2, y + h, z1 - 0.2, { bevel: 0.03 });
        } else {
          const mat = (p.seed ?? Math.round(p.u * 3 + p.v)) % 3 === 0 ? M.caseG : M.caseY;
          B.box(mat, x0, y, z0, x1, y + h, z1, { bevel: 0.05 });
          for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.box(M.trim, cx - 0.07, y, cz - 0.07, cx + 0.07, y + 0.14, cz + 0.07, { bevel: 0.02 });
          B.box(M.trim, x0 - 0.01, y + h * 0.45, z0 - 0.01, x1 + 0.01, y + h * 0.55, z1 + 0.01);
        }
        break;
      }
      case "barrel": {
        const rr = w / 2;
        B.cyl(M.paint, [p.u, y, p.v], [p.u, y + h, p.v], rr, 16, { tint: 0xffd430 });
        for (const f of [0.28, 0.72]) B.cyl(M.paint, [p.u, y + h * f - 0.02, p.v], [p.u, y + h * f + 0.02, p.v], rr + 0.015, 16, { tint: 0xc99a12 });
        B.cyl(M.paint, [p.u, y + h, p.v], [p.u, y + h + 0.01, p.v], rr - 0.03, 16, { tint: 0x2d3136 });
        break;
      }
      case "generator": {
        B.box(M.graphite, x0, y, z0, x1, y + 0.25, z1, { bevel: 0.02 });
        B.box(M.yellow, x0 + 0.03, y + 0.25, z0 + 0.03, x1 - 0.03, y + h - 0.05, z1 - 0.03, { bevel: 0.08 });
        B.box(M.graphite, x0, y + h - 0.08, z0, x1, y + h, z1, { bevel: 0.03 });
        for (let k = 0; k < 6; k++) { const t = (k + 0.5) / 6; if (alongZ) B.box(M.graphite, x1 - 0.02, y + 0.5, z0 + t * dd - 0.12, x1 + 0.005, y + 1.2, z0 + t * dd + 0.12); else B.box(M.graphite, x0 + t * w - 0.12, y + 0.5, z1 - 0.02, x0 + t * w + 0.12, y + 1.2, z1 + 0.005); }
        B.cyl(M.galv, [x0 + 0.3, y + h, z0 + 0.3], [x0 + 0.3, y + h + 0.5, z0 + 0.3], 0.07, 10);
        break;
      }
      case "ac": {
        B.box(M.paint, x0, y, z0, x1, y + h, z1, { bevel: 0.04, tint: 0xe9e7e0 });
        const fr = Math.min(w, dd) * 0.36;
        if (alongZ) B.add(M.graphite, new THREE.CircleGeometry(fr, 20).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(x1 + 0.005, y + h * 0.5, p.v), 0xffffff, true);
        else B.add(M.graphite, new THREE.CircleGeometry(fr, 20), new THREE.Matrix4().makeTranslation(p.u, y + h * 0.5, z1 + 0.005), 0xffffff, true);
        break;
      }
      case "drum": {
        // cable drum lying on its side: two plywood flanges + a core wound with graphite cable and a yellow band
        const rr = d[1] / 2, ax = alongZ ? 0 : 1;
        const P = (t: number): V3 => ax ? [x0 + (x1 - x0) * t, y + rr, p.v] : [p.u, y + rr, z0 + (z1 - z0) * t];
        B.cyl(M.wood, P(0), P(0.1), rr, 20, { tint: 0xe2c08a }); B.cyl(M.wood, P(0.9), P(1), rr, 20, { tint: 0xe2c08a });
        B.cyl(M.cable, P(0.1), P(0.9), rr * 0.84, 18, { tint: 0x2a2d30 });
        B.cyl(M.paint, P(0.46), P(0.54), rr * 0.85, 18, { tint: 0xffd430 });
        break;
      }
      case "watertank": {
        // (parity) a rounded-square poly water tank, faces on the collider (a plus of two boxes), corner
        // r 0.35 — the corners' arcs just outside the plus (a round tank left 0.48 m of invisible wall at every corner): white ribbed body, yellow hoops, flat lid + hatch
        const a = w / 2, rc = WATERTANK_RC;
        const rrect = (hw: number, r0: number) => { const sh = new THREE.Shape(); sh.moveTo(-hw + r0, -hw); sh.lineTo(hw - r0, -hw); sh.quadraticCurveTo(hw, -hw, hw, -hw + r0); sh.lineTo(hw, hw - r0); sh.quadraticCurveTo(hw, hw, hw - r0, hw); sh.lineTo(-hw + r0, hw); sh.quadraticCurveTo(-hw, hw, -hw, hw - r0); sh.lineTo(-hw, -hw + r0); sh.quadraticCurveTo(-hw, -hw, -hw + r0, -hw); return sh; };
        const slab = (hw: number, r0: number, ya: number, yb: number, mat: THREE.Material, tint: number) => {
          const g = new THREE.ExtrudeGeometry(rrect(hw, r0), { depth: yb - ya, bevelEnabled: false, curveSegments: 5 }); g.rotateX(-Math.PI / 2);
          B.add(mat, g, new THREE.Matrix4().makeTranslation(p.u, ya, p.v), tint, true);
        };
        slab(a - 0.012, rc, y, y + h - 0.04, M.paint, 0xf1efe8);   // (1.2 cm inside the collider face — the ribs below sit ON it)
        for (const f of [0.2, 0.5, 0.8]) slab(a + 0.02, rc + 0.02, y + h * f - 0.06, y + h * f + 0.06, M.paint, 0xffd430);
        slab(a - 0.06, rc - 0.04, y + h - 0.04, y + h + 0.03, M.paint, 0xd8d6ce);
        B.cyl(M.graphite, [p.u + 0.3, y + h + 0.03, p.v - 0.2], [p.u + 0.3, y + h + 0.12, p.v - 0.2], 0.28, 14);
        // outlet valve + pipe at the base, a CNVS water sign
        B.cyl(M.galv, [p.u, y + 0.3, p.v + a - 0.02], [p.u, y + 0.3, p.v + a + 0.1], 0.07, 8);
        B.box(M.paint, p.u - 0.35, y + 1.55, p.v + a - 0.01, p.u + 0.35, y + 1.9, p.v + a + 0.012, { tint: 0x2f8f8a });
        // moulded ribs on every face (3 cm proud), a graphite base skid, a yellow
        // ladder + a sight-gauge tube on the west face, a grime band at the foot
        for (let k = -2; k <= 2; k++) {
          const o = k * (a - rc) / 2.6;
          B.box(M.paint, p.u + o - 0.04, y + 0.16, p.v - a, p.u + o + 0.04, y + h - 0.12, p.v - a + 0.012, { tint: 0xcfcabd });
          B.box(M.paint, p.u + o - 0.04, y + 0.16, p.v + a - 0.012, p.u + o + 0.04, y + h - 0.12, p.v + a, { tint: 0xcfcabd });
          B.box(M.paint, p.u + a - 0.012, y + 0.16, p.v + o - 0.04, p.u + a, y + h - 0.12, p.v + o + 0.04, { tint: 0xcfcabd });
        }
        B.box(M.graphite, p.u - a + 0.005, y, p.v - a + 0.005, p.u + a - 0.005, y + 0.14, p.v + a - 0.005, { bevel: 0.02 });
        B.box(M.paint, p.u - a + 0.01, y + 0.14, p.v - a + 0.01, p.u + a - 0.01, y + 0.42, p.v + a - 0.01, { tint: 0xb9b2a2 });
        // (ladder + gauge flush with the collider face: a grazing ray never meets a drawn rung outside it)
        for (const dz of [-0.22, 0.22]) B.box(M.yellow, p.u - a, y + 0.15, p.v + dz - 0.025, p.u - a + 0.03, y + h + 0.1, p.v + dz + 0.025);
        for (let yy = y + 0.45; yy < y + h; yy += 0.32) B.box(M.yellow, p.u - a, yy, p.v - 0.22, p.u - a + 0.025, yy + 0.035, p.v + 0.22);
        B.cyl(M.glass, [p.u - a + 0.02, y + 0.3, p.v + 0.55], [p.u - a + 0.02, y + h - 0.3, p.v + 0.55], 0.02, 6);
        break;
      }
      case "buggy": {
        const along = !alongZ, L = along ? w : dd, W = along ? dd : w;
        const X = (a: number, b: number): [number, number] => along ? [p.u + a, p.v + b] : [p.u + b, p.v + a];
        const bx = (a0: number, a1: number, b0: number, b1: number, ya: number, yb: number, mat: THREE.Material, tint: number, bevel = 0.04) => {
          const [ua, va] = X(a0, b0), [ub, vb] = X(a1, b1);
          B.box(mat, Math.min(ua, ub), y + ya, Math.min(va, vb), Math.max(ua, ub), y + yb, Math.max(va, vb), { bevel, tint });
        };
        const body = p.col ? new THREE.Color(p.col).getHex() : 0xffd430;
        // (drawn = the shared buggyParts colliders — body to 1.05, four cage posts, a canopy 1.5–1.6)
        bx(-L / 2 + 0.1, L / 2 - 0.1, -W / 2 + 0.1, W / 2 - 0.1, 0.35, 0.98, M.paint, body, 0.1);
        bx(L / 2 - 1.0, L / 2 - 0.1, -W / 2 + 0.15, W / 2 - 0.15, 0.95, 1.05, M.paint, body, 0.06);
        bx(-L / 2 + 0.2, -0.1, -W / 2 + 0.2, W / 2 - 0.2, 0.95, 1.05, M.paint, 0x2d3136, 0.05);
        bx(-L / 2 + 0.05, L / 2 - 0.05, -W / 2 + 0.05, W / 2 - 0.05, 0.55, 0.62, M.graphite, 0x2d3136, 0.02);
        for (const [a, b] of [[-L / 2 + 0.55, -W / 2 + 0.05], [-L / 2 + 0.55, W / 2 - 0.05], [L / 2 - 0.55, -W / 2 + 0.05], [L / 2 - 0.55, W / 2 - 0.05]]) {
          const [cu, cv] = X(a, b), [du, dv] = X(a, b + Math.sign(b) * 0.25);
          B.cyl(M.rubber, [cu, y + 0.36, cv], [du, y + 0.36, dv], 0.36, 16);
        }
        // roll cage posts + the canopy (headlights on the nose)
        for (const [a, b] of BUGGY_POSTS(W)) { const [cu, cv] = X(a, b); B.box(M.graphite, cu - 0.05, y + 1.0, cv - 0.05, cu + 0.05, y + 1.52, cv + 0.05, { bevel: 0.015 }); }
        bx(BUGGY_CANOPY[0], BUGGY_CANOPY[1], -W / 2 + 0.12, W / 2 - 0.12, 1.5, 1.6, M.paint, 0x2d3136, 0.04);
        for (const b of [-W / 2 + 0.35, W / 2 - 0.35]) bx(L / 2 - 0.12, L / 2 - 0.08, b - 0.12, b + 0.12, 0.7, 0.85, M.lampPanel, 0xffffff, 0);
        break;
      }
      // ---- rooftop / deck kit: chunky, bevelled, each inside its collider envelope
      case "vtank": {
        // yellow gas tank on a graphite skid: domed cylinder + hoops + a valve cage on top
        const rr = CYL_PROPS.vtank!(p);
        B.box(M.graphite, x0, y, z0, x1, y + 0.18, z1, { bevel: 0.03 });
        B.cyl(M.paint, [p.u, y + 0.18, p.v], [p.u, y + h - 0.35, p.v], rr, 20, { tint: 0xffd430 });
        B.cyl(M.paint, [p.u, y + h - 0.35, p.v], [p.u, y + h - 0.1, p.v], rr, 20, { r1: rr * 0.55, tint: 0xffd430 });
        for (const f of [0.3, 0.62]) B.cyl(M.paint, [p.u, y + h * f - 0.04, p.v], [p.u, y + h * f + 0.04, p.v], rr + 0.02, 20, { tint: 0x2d3136 });
        B.cyl(M.galv, [p.u, y + h - 0.1, p.v], [p.u, y + h, p.v], 0.1, 10);
        B.box(M.paint, p.u - 0.28, y + h * 0.42, (alongZ ? z1 : z1) - 0.02, p.u + 0.28, y + h * 0.52, z1 + 0.01, { tint: 0xd8322a });
        break;
      }
      case "hvac": {
        // packaged rooftop unit: white casing, louvred side, two fan shrouds on top, graphite plinth
        B.box(M.graphite, x0, y, z0, x1, y + 0.12, z1, { bevel: 0.02 });
        B.box(M.paint, x0 + 0.02, y + 0.12, z0 + 0.02, x1 - 0.02, y + h - 0.02, z1 - 0.02, { bevel: 0.08, tint: 0xeceae3 });
        const L = alongZ ? dd : w;
        for (let k = 0; k < 7; k++) { const a = -L / 2 + 0.25 + k * (L - 0.5) / 6; if (alongZ) B.box(M.graphite, x1 - 0.02, y + 0.35, p.v + a - 0.08, x1 + 0.005, y + h - 0.3, p.v + a + 0.08); else B.box(M.graphite, p.u + a - 0.08, y + 0.35, z1 - 0.02, p.u + a + 0.08, y + h - 0.3, z1 + 0.005); }
        for (const sg of [-1, 1]) {
          const fu = alongZ ? p.u : p.u + sg * L * 0.24, fv = alongZ ? p.v + sg * L * 0.24 : p.v, fr = Math.min(w, dd) * 0.34;
          B.cyl(M.paint, [fu, y + h - 0.02, fv], [fu, y + h, fv], fr + 0.06, 20, { tint: 0x2d3136 });
          B.cyl(M.graphite, [fu, y + h - 0.03, fv], [fu, y + h + 0.004, fv], fr, 20);
          B.box(M.galv, fu - fr, y + h - 0.01, fv - 0.03, fu + fr, y + h + 0.01, fv + 0.03);
        }
        break;
      }
      case "uplink": {
        // the small uplink dish: a graphite pedestal (the collider) carrying a 1.9 m dish, rim + feed, above head height
        B.box(M.graphite, x0, y, z0, x1, y + 0.2, z1, { bevel: 0.04 });
        B.cyl(M.paint, [p.u, y + 0.2, p.v], [p.u, y + h, p.v], Math.min(w, dd) * 0.43, 16, { tint: 0xeceae3 });
        B.box(M.yellow, p.u - 0.3, y + h - 0.15, p.v - 0.3, p.u + 0.3, y + h + 0.25, p.v + 0.3, { bevel: 0.06 });
        B.cyl(M.graphite, [p.u, y + h + 0.25, p.v], [p.u + 0.15, y + h + 1.0, p.v + 0.15], 0.12, 10);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.55, 0.62, 0.56).normalize());
        const dm = new THREE.Matrix4().compose(new THREE.Vector3(p.u + 0.15, y + h + 1.0, p.v + 0.15), q, new THREE.Vector3(1, 1, 1));
        const pr: Array<[number, number]> = []; for (let i = 0; i <= 8; i++) { const rr = 0.95 * i / 8; pr.push([Math.max(0.001, rr), rr * rr / 2.2]); }
        B.lathe(M.dish, [...pr].reverse(), 28, dm, 0xffffff, true);
        B.lathe(M.white, pr.map(([rr, yy]) => [rr, yy - 0.09 - 0.05 * rr] as [number, number]), 28, dm, 0xe8e6de);
        const rim = new THREE.TorusGeometry(0.97, 0.07, 8, 32); rim.rotateX(Math.PI / 2); rim.translate(0, 0.41, 0);
        B.add(M.yellow, rim, dm, 0xffffff, true);
        const fz = new THREE.Vector3(0, 0.95, 0).applyMatrix4(dm), c0 = new THREE.Vector3(0, 0, 0).applyMatrix4(dm);
        B.cyl(M.white, [c0.x, c0.y, c0.z], [fz.x, fz.y, fz.z], 0.035, 6);
        B.cyl(M.graphite, [fz.x, fz.y, fz.z], [fz.x, fz.y + 0.12, fz.z], 0.09, 10);
        break;
      }
      case "antenna": {
        // antenna cluster: a ballast block + three whips and a panel antenna (thin: visual), red tip beacon
        B.box(M.concrete, x0, y, z0, x1, y + h, z1, { bevel: 0.05, tint: 0xcfc8ba });
        for (const [du, dv, hh] of ANTENNA_WHIPS) B.cyl(M.galv, [p.u + du, y + h, p.v + dv], [p.u + du, y + h + hh, p.v + dv], 0.04, 6, { r1: 0.015 });
        B.box(M.white, p.u + 0.1, y + h + 1.2, p.v - 0.3, p.u + 0.22, y + h + 2.2, p.v - 0.05, { bevel: 0.03 });
        B.add(M.red, new THREE.SphereGeometry(0.08, 8, 6), new THREE.Matrix4().makeTranslation(p.u, y + h + 4.15, p.v + 0.22));
        break;
      }
      case "pipes": {
        // a pipe run on sleepers: two insulated lines (yellow + graphite) + a flange every 1.5 m
        const L = alongZ ? dd : w, ax = alongZ ? [0, 1] : [1, 0], cr = Math.min(w, dd);
        for (let t = -L / 2 + 0.3; t <= L / 2 - 0.3 + 1e-6; t += (L - 0.6) / Math.max(1, Math.round((L - 0.6) / 1.5))) {
          const cu = p.u + ax[0] * t, cv = p.v + ax[1] * t;
          B.box(M.graphite, cu - (alongZ ? cr / 2 : 0.08), y, cv - (alongZ ? 0.08 : cr / 2), cu + (alongZ ? cr / 2 : 0.08), y + 0.14, cv + (alongZ ? 0.08 : cr / 2), { bevel: 0.02 });
        }
        for (const [off, rr, tint] of [[-0.14, 0.13, 0xffd430], [0.15, 0.1, 0x3a3f45]] as Array<[number, number, number]>) {
          const yy = y + 0.14 + rr, a: V3 = alongZ ? [p.u + off, yy, z0] : [x0, yy, p.v + off], b: V3 = alongZ ? [p.u + off, yy, z1] : [x1, yy, p.v + off];
          B.cyl(M.paint, a, b, rr, 12, { tint });
          for (let t = -L / 2 + 0.75; t < L / 2; t += 1.5) { const cu = alongZ ? p.u + off : p.u + t, cv = alongZ ? p.v + t : p.v + off; const aa: V3 = alongZ ? [cu, yy, cv - 0.04] : [cu - 0.04, yy, cv], bb: V3 = alongZ ? [cu, yy, cv + 0.04] : [cu + 0.04, yy, cv]; B.cyl(M.galv, aa, bb, rr + 0.03, 12); }
        }
        break;
      }
      case "vent": {
        // mushroom vent: galvanised stack + a wide cap
        B.box(M.graphite, x0 + 0.05, y, z0 + 0.05, x1 - 0.05, y + 0.1, z1 - 0.05, { bevel: 0.02 });
        B.cyl(M.galv, [p.u, y + 0.1, p.v], [p.u, y + h - 0.2, p.v], w * 0.28, 12);
        B.cyl(M.galv, [p.u, y + h - 0.22, p.v], [p.u, y + h, p.v], w * 0.5, 14, { r1: w * 0.18 });
        break;
      }
      case "comms": {
        // outdoor comms cabinet: graphite, a louvred door, status LEDs, a yellow hazard stripe
        B.box(M.graphite, x0, y, z0, x1, y + h, z1, { bevel: 0.04 });
        const fz = alongZ ? x1 + 0.005 : z1 + 0.005;
        for (let k = 0; k < 6; k++) { const yy = y + 0.25 + k * 0.09; if (alongZ) B.box(M.furnMetal, x1 - 0.01, yy, z0 + 0.12, fz, yy + 0.04, z1 - 0.12, { tint: 0x55595e }); else B.box(M.furnMetal, x0 + 0.12, yy, z1 - 0.01, x1 - 0.12, yy + 0.04, fz, { tint: 0x55595e }); }
        for (let k = 0; k < 3; k++) { const yy = y + h - 0.35 - k * 0.1; if (alongZ) B.box(k ? M.green : M.tealGlow, x1 - 0.005, yy, p.v - 0.2, fz + 0.005, yy + 0.04, p.v - 0.14); else B.box(k ? M.green : M.tealGlow, p.u - 0.2, yy, z1 - 0.005, p.u - 0.14, yy + 0.04, fz + 0.005); }
        B.box(M.hazard, x0 - 0.005, y + h - 0.16, z0 - 0.005, x1 + 0.005, y + h - 0.08, z1 + 0.005);
        break;
      }
      case "tankH": {
        // horizontal propane tank on two saddles
        const L = alongZ ? dd : w, rr = Math.min(w, dd) / 2 - 0.03, cy = y + h - rr;
        const a: V3 = alongZ ? [p.u, cy, z0 + rr * 0.6] : [x0 + rr * 0.6, cy, p.v], b: V3 = alongZ ? [p.u, cy, z1 - rr * 0.6] : [x1 - rr * 0.6, cy, p.v];
        B.cyl(M.paint, a, b, rr, 20, { tint: 0xeceae3 });
        for (const [e, sg] of [[a, -1], [b, 1]] as Array<[V3, number]>) { const tip: V3 = alongZ ? [e[0], e[1], e[2] + sg * rr * 0.55] : [e[0] + sg * rr * 0.55, e[1], e[2]]; B.cyl(M.paint, e, tip, rr, 20, { r1: rr * 0.45, tint: 0xeceae3 }); }
        for (const t of [-L * 0.28, L * 0.28]) { const cu = alongZ ? p.u : p.u + t, cv = alongZ ? p.v + t : p.v; B.box(M.yellow, cu - (alongZ ? rr : 0.12), y, cv - (alongZ ? 0.12 : rr), cu + (alongZ ? rr : 0.12), cy - rr * 0.4, cv + (alongZ ? 0.12 : rr), { bevel: 0.03 }); }
        B.cyl(M.galv, [p.u, cy + rr, p.v], [p.u, y + h + 0.001, p.v], 0.09, 10);
        void L;
        break;
      }
      case "skylight": {
        // pitched glass skylight on a yellow curb (low: step-over)
        B.box(M.yellow, x0, y, z0, x1, y + 0.22, z1, { bevel: 0.04 });
        glassBins.obox(M.glass, [p.u, y + 0.34, p.v], [w - 0.2, 0.22, dd - 0.2], { bevel: 0.06 });
        B.box(M.graphite, p.u - 0.03, y + 0.22, z0 + 0.08, p.u + 0.03, y + h, z1 - 0.08);
        break;
      }
      case "sandbag": {
        // a sandbag wall: staggered courses of rounded bags
        const along = w > dd, L = along ? w : dd, T = along ? dd : w, rows = 4, bl = 0.55;
        for (let r0 = 0; r0 < rows; r0++) {
          const yy = y + r0 * (h / rows), n = Math.floor(L / bl), off = (r0 % 2) * bl * 0.5;
          for (let k = 0; k < n - (r0 % 2); k++) {
            const a = -L / 2 + off + k * bl + 0.02, b = a + bl - 0.04, sh = 0.92 + ((k * 7 + r0 * 3) % 5) * 0.02;
            const c0 = along ? [p.u + a, p.v - T / 2 * sh] : [p.u - T / 2 * sh, p.v + a], c1 = along ? [p.u + b, p.v + T / 2 * sh] : [p.u + T / 2 * sh, p.v + b];
            B.box(M.fabric, Math.min(c0[0], c1[0]), yy, Math.min(c0[1], c1[1]), Math.max(c0[0], c1[0]), yy + h / rows, Math.max(c0[1], c1[1]), { bevel: 0.07, tint: (k + r0) % 3 ? 0xb5a47c : 0xa89770 });
          }
        }
        break;
      }
      case "reel": {
        // a yellow steel cable reel on its side: flanges with spokes, a graphite cable core
        const rr = h / 2, ax = alongZ ? 0 : 1;
        const P = (t: number): V3 => ax ? [x0 + (x1 - x0) * t, y + rr, p.v] : [p.u, y + rr, z0 + (z1 - z0) * t];
        B.cyl(M.paint, P(0), P(0.08), rr, 20, { tint: 0xffd430 }); B.cyl(M.paint, P(0.92), P(1), rr, 20, { tint: 0xffd430 });
        B.cyl(M.cable, P(0.08), P(0.92), rr * 0.8, 18, { tint: 0x2a2d30 });
        B.cyl(M.graphite, P(-0.02), P(1.02), rr * 0.2, 10);
        break;
      }
      case "planter": {
        B.box(M.concrete, x0, y, z0, x1, y + h, z1, { bevel: 0.06, tint: 0xd9d2c4 });
        B.box(M.concrete, x0 + 0.12, y + h - 0.08, z0 + 0.12, x1 - 0.12, y + h - 0.02, z1 - 0.12, { tint: 0x5a4632 });
        break;
      }
      case "solar": {
        // a solid ballast tray (0 → 0.25) + legs + the panel tilting 0.3 → 0.55 m: the collider is the tray's
        // envelope to SOLAR_H (0.425, the panel's mean height) — floor within ±0.13 m, no open underside
        B.box(M.galv, x0, y, z0, x1, y + 0.25, z1, { bevel: 0.03 });
        for (const [lx, lz] of [[x0 + 0.15, z0 + 0.25], [x1 - 0.15, z0 + 0.25], [x0 + 0.15, z1 - 0.25], [x1 - 0.15, z1 - 0.25], [p.u, z0 + 0.25], [p.u, z1 - 0.25]]) B.box(M.graphite, lx - 0.04, y + 0.25, lz - 0.04, lx + 0.04, y + (lz < p.v ? 0.52 : 0.3), lz + 0.04);
        const tilt = Math.atan2(0.25, dd - 0.1);
        B.obox(M.solar, [p.u, y + 0.425, p.v], [w - 0.05, 0.05, (dd - 0.05) / Math.cos(tilt)], { pitch: -tilt });
        break;
      }
      case "sofa": {
        B.box(M.fabric, x0, y, z0, x1, y + 0.45, z1, { bevel: 0.08, tint: 0x3f6f78 });
        if (alongZ) B.box(M.fabric, x1 - 0.22, y + 0.45, z0, x1, y + d[1], z1, { bevel: 0.08, tint: 0x3f6f78 });
        else B.box(M.fabric, x0, y + 0.45, z0, x1, y + d[1], z0 + 0.22, { bevel: 0.08, tint: 0x3f6f78 });
        break;
      }
      case "barrier": {
        // concrete jersey barrier: wide foot, sloped faces, a yellow / graphite hazard band, lifting slots
        const along = w > dd, L = along ? w : dd;
        const put = (a0: number, a1: number, b0: number, b1: number, y0: number, y1: number, mat: THREE.Material, tint: number, bevel = 0.03) => {
          if (along) B.box(mat, p.u - L / 2 + a0, y + y0, p.v + b0, p.u - L / 2 + a1, y + y1, p.v + b1, { tint, bevel });
          else B.box(mat, p.u + b0, y + y0, p.v - L / 2 + a0, p.u + b1, y + y1, p.v - L / 2 + a1, { tint, bevel });
        };
        // (a 1.4 m blast barrier — hard cover you can crouch behind; tapered 0.82 → 0.5 m within the collider)
        const hw = dd < w ? dd / 2 : w / 2;
        // (the shared BARRIER_STEPS boxes, each drawn 1 cm proud with a 2 cm bevel)
        // the two lifting pockets are REAL: the
        // foot is cast around them (open through the barrier, concrete inside) — flat black boxes 1 cm proud
        // of the foot read as painted holes and flicker against it
        const SL = [[0.5, 0.8], [L - 0.8, L - 0.5]], SH = 0.12;
        for (const [y0, y1, ins] of BARRIER_STEPS) {
          const e = ins > 0 ? 0.02 * (ins / 0.08) : 0, b0 = -hw + ins - 0.01, b1 = hw - ins + 0.01, a0 = e - 0.01, a1 = L - e + 0.01;
          if (y0 > 0) { put(a0, a1, b0, b1, y0, y1, M.concrete, 0xe0dbd0, 0.02); continue; }
          put(a0, a1, b0, b1, SH, y1, M.concrete, 0xe0dbd0, 0.02);
          let c = a0; for (const [s0, s1] of SL) { put(c, s0, b0, b1, 0, SH, M.concrete, 0xe0dbd0, 0.02); c = s1; }
          put(c, a1, b0, b1, 0, SH, M.concrete, 0xe0dbd0, 0.02);
          // the pocket's roof, a shade darker (grime from the forks)
          for (const [s0, s1] of SL) put(s0 - 0.01, s1 + 0.01, b0 + 0.01, b1 - 0.01, SH - 0.004, SH + 0.01, M.concrete, 0x8a857c, 0);
        }
        put(0.04, L - 0.04, -hw + 0.155, hw - 0.155, 0.95, 1.1, M.hazard, 0xffffff, 0);
        break;
      }
      case "pot": {
        B.cyl(M.paint, [p.u, y, p.v], [p.u, y + h, p.v], w / 2, 12, { r1: w / 2 * 0.8, tint: 0x3a3f45 });
        B.cyl(M.paint, [p.u, y + h - 0.06, p.v], [p.u, y + h, p.v], w / 2 + 0.03, 12, { tint: 0xffd430 });
        B.cyl(M.wood, [p.u, y + h - 0.08, p.v], [p.u, y + h - 0.05, p.v], w / 2 - 0.02, 12, { tint: 0x4a3526 });
        break;
      }
      default: B.box(M.paint, x0, y, z0, x1, y + h, z1, { tint: 0x999999 });
    }
    void (p as PropSpec);
  }

  // ---- the fence: yellow posts every ~3 m, top + bottom rail, chain-link panels (alpha), open gates, torn breaches
  const L = labLayout();
  const post = (x: number, z: number, hgt = FENCE.h + 0.1) => { bins.near.cyl(M.yellow, [x, G - 0.1, z], [x, G + hgt, z], 0.06, 6); bins.near.add(M.yellow, new THREE.SphereGeometry(0.085, 6, 4), new THREE.Matrix4().makeTranslation(x, G + hgt + 0.03, z)); };
  for (const f of L.fence) {
    const [ax, az] = f.a, [bx, bz] = f.b, len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= n; k++) post(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
    bins.near.cyl(M.galv, [ax, G + FENCE.h - 0.05, az], [bx, G + FENCE.h - 0.05, bz], 0.03, 6);
    bins.near.cyl(M.galv, [ax, G + 0.1, az], [bx, G + 0.1, bz], 0.02, 6);
    // mesh (both faces)
    const Lm = len, Hm = FENCE.h - 0.1;
    const q = new THREE.PlaneGeometry(Lm, Hm); const uv = q.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Lm, uv.getY(i) * Hm);
    const yaw = Math.atan2(bz - az, bx - ax);
    bins.near.add(M.fence, q, new THREE.Matrix4().makeRotationY(-yaw).setPosition((ax + bx) / 2, G + 0.05 + Hm / 2, (az + bz) / 2), 0xffffff, false);
  }
  for (const g of gateLeaves()) {
    const [hx, hz] = g.hinge, ex = hx + Math.cos(g.yaw) * g.len, ez = hz + Math.sin(g.yaw) * g.len;
    post(hx, hz, FENCE.h + 0.3);
    bins.near.poly(M.yellow, [[hx, G + 0.1, hz], [hx, G + 2.2, hz], [ex, G + 2.2, ez], [ex, G + 0.1, ez], [hx, G + 0.1, hz]], 0.045, 8);
    bins.near.cyl(M.yellow, [hx, G + 0.1, hz], [ex, G + 2.2, ez], 0.03, 6);
    const q = new THREE.PlaneGeometry(g.len, 2.1); const uv = q.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * g.len, uv.getY(i) * 2.1);
    bins.near.add(M.fence, q, new THREE.Matrix4().makeRotationY(-g.yaw).setPosition((hx + ex) / 2, G + 1.15, (hz + ez) / 2), 0xffffff, false);
    // wheel under the free end
    bins.near.cyl(M.rubber, [ex - 0.05, G + 0.12, ez], [ex + 0.05, G + 0.12, ez], 0.12, 10);
  }
  // breaches: a torn panel flopped over on the ground + a leaning bent post at each side
  for (const b of FENCE.gaps.filter((g) => g.kind === "breach")) {
    const along = b.s === "n" || b.s === "s", line = b.s === "n" ? FENCE.v[0] : b.s === "s" ? FENCE.v[1] : b.s === "w" ? FENCE.u[0] : FENCE.u[1];
    const inward = b.s === "n" || b.s === "w" ? 1 : -1;
    const mid = (b.a + b.b) / 2, len = b.b - b.a - 0.6;
    const px = along ? mid : line + inward * 0.9, pz = along ? line + inward * 0.9 : mid;
    const q = new THREE.PlaneGeometry(len, 1.9); const uv = q.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * 1.9);
    const m = new THREE.Matrix4().makeRotationY(along ? 0 : Math.PI / 2).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.12 * inward));
    m.setPosition(px, G + 0.12, pz);
    bins.near.add(M.fence, q, m, 0xdddddd, false);
    for (const e of [b.a, b.b]) {
      const x = along ? e : line, z = along ? line : e;
      bins.near.cyl(M.yellow, [x, G - 0.1, z], [x + (along ? 0 : inward * 0.5), G + 2.0, z + (along ? inward * 0.5 : 0)], 0.06, 10);
    }
  }
}

/** yard paving: concrete aprons under / between the buildings and a gravel pad round the dish tower (thin, 3 cm) */
export function buildYard(M: LabMats, bins: Bins) {
  const pave = (u0: number, u1: number, v0: number, v1: number, tint = 0xe1ded6) => bins.box(M.concrete, u0, G - 0.02, v0, u1, G + 0.07, v1, { tint, bevel: 0.03 });
  pave(3, 30.5, -9.5, 10);      // A apron
  pave(30.5, 53, -11.5, 10);    // C yard
  pave(5, 27, -29, -9.5);       // E apron / bridge yard
  pave(36, 53, -33, -18);       // P apron
  pave(-28, -8.5, -17, -0.5, 0xd6d1c6); // D yard
  pave(-32.5, -22.5, 24, 32.5, 0xd6d1c6); // gate booth
  // the helipad forecourt: a concrete apron from the pad to the C yard + a walkway to the A doors
  pave(17.5, 34, 10, 23, 0xe4e1da); pave(2, 17.5, 10, 11.5, 0xe4e1da);
  for (let u = 18.5; u < 34; u += 3) bins.box(M.trim, u - 0.02, G + 0.07, 10.2, u + 0.02, G + 0.075, 22.8);   // slab seams
  for (let v = 12.5; v < 23; v += 3) bins.box(M.trim, 17.7, G + 0.07, v - 0.02, 33.8, G + 0.075, v + 0.02);
  // painted parking bays + a walkway stripe on the A apron
  bins.box(M.hazard, 3.2, G + 0.07, 8.6, 30, G + 0.078, 8.9);
}

/** the compound's gravel yard: a 1 m grid over the fenced area whose vertex alpha is 0 on the terrain road (dirt shows
 *  through) and beyond the fence; × the gravel map's blotch alpha → ragged alpha-tested edges */
export function buildGravel(M: LabMats, isRoad: (u: number, v: number) => boolean): THREE.Group {
  const [u0, u1] = [FENCE.u[0] - 3, FENCE.u[1] + 3], [v0, v1] = [FENCE.v[0] - 3, FENCE.v[1] + 3];
  const nu = Math.round((u1 - u0) / 2), nv = Math.round((v1 - v0) / 2);   // (a 2 m grid — 4× fewer tris)
  const g = new THREE.PlaneGeometry(u1 - u0, v1 - v0, nu, nv); g.rotateX(-Math.PI / 2); g.translate((u0 + u1) / 2, G + 0.055, (v0 + v1) / 2);   // (5.5 cm — terrain micro-bumps poke green through at 2.5)
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getZ(i);
    uv.setXY(i, u, -v);
    const out = Math.max(FENCE.u[0] - u, u - FENCE.u[1], FENCE.v[0] - v, v - FENCE.v[1]);
    let a = 1 - Math.max(0, Math.min(1, (out + 0.5) / 2.5));
    // yard pads only round the buildings / helipad / decks (grass + the jungle beds elsewhere)
    let dn = Math.hypot(u - HELI.u, v - HELI.v) - HELI.a;
    for (const m of MODULES) dn = Math.min(dn, Math.hypot(Math.max(m.u[0] - u, 0, u - m.u[1]), Math.max(m.v[0] - v, 0, v - m.v[1])));
    // (the 11 m gap between the C and P yards sits at dn ≈ 5.5 → alpha 1.65 × the blotch map punches a
    //  green line of holes through the grit — the yard runs 7 m out before it frays)
    a *= 1 - Math.max(0, Math.min(1, (dn - 7) / 4));
    if (isRoad(u, v)) a = 0; else if (isRoad(u + 1, v) || isRoad(u - 1, v) || isRoad(u, v + 1) || isRoad(u, v - 1)) a *= 0.45;
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1; col[i * 4 + 3] = a * 2.2;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 4));
  // cells whose four corners are fully opaque draw with an opaque copy of the material (no alpha test → early
  // depth, no discard over the whole yard); only the ragged rim keeps the alpha-tested material
  const idx = g.index!, inner: number[] = [], rim: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a0 = col[idx.getX(t) * 4 + 3], a1 = col[idx.getX(t + 1) * 4 + 3], a2 = col[idx.getX(t + 2) * 4 + 3];
    (Math.min(a0, a1, a2) >= 2.1 ? inner : rim).push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
  }
  const grp = new THREE.Group(); grp.name = "lab:gravel";
  // (a Lambert copy: the grit is fully rough anyway — no normal map / PBR on the biggest surface of the yard)
  const opaque = (M.gravel.userData.opaque ??= new THREE.MeshLambertMaterial({ name: "lab:gravel-opaque", map: M.gravel.map, color: M.gravel.color, vertexColors: true })) as THREE.MeshLambertMaterial;
  for (const [ix, mat, nm] of [[inner, opaque, "lab:gravel"], [rim, M.gravel, "lab:gravel-rim"]] as Array<[number[], THREE.Material, string]>) {
    if (!ix.length) continue;
    const gg = new THREE.BufferGeometry(); for (const k of Object.keys(g.attributes)) gg.setAttribute(k, g.attributes[k]); gg.setIndex(ix); gg.computeBoundingSphere();
    const m = new THREE.Mesh(gg, mat); m.name = nm; m.receiveShadow = true; m.castShadow = false;
    // (the opaque yard draws before the terrain it covers: the terrain under it dies in the depth test)
    if (mat !== M.gravel) m.renderOrder = -1;
    m.userData.castShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); grp.add(m);
  }
  return grp;
}

/** 20 ft supply containers (the shared layout's CONTAINERS; collider = harbor-kit containerBox, 6.06 × 2.59 × 2.44 m):
 *  painted steel box with corrugation ribs, a top rail, corner castings, door bars + a CNVS hazard band on the door end */
export function buildContainers(M: LabMats, B: Bins) {
  const L = 6.058, W = 2.438, H = 2.591, tints: Record<string, number> = { yellow: 0xffd430, white: 0xe9e7e0, teal: 0x2f8f8a, red: 0xc0392b, green: 0x4f8a3a, blue: 0x2f5f9a };
  for (const c of CONTAINERS) {
    const along = Math.abs(Math.cos(c.yaw)) > 0.5, hl = along ? L / 2 : W / 2, hd = along ? W / 2 : L / 2, t = tints[c.color] ?? 0xe9e7e0;
    const x0 = c.u - hl, x1 = c.u + hl, z0 = c.v - hd, z1 = c.v + hd, y = G;
    B.box(M.paint, x0 + 0.015, y, z0 + 0.015, x1 - 0.015, y + H, z1 - 0.015, { tint: t, bevel: 0.02 });
    // corrugation on the long sides (ribs 0.04 proud, inside the collider) + top / bottom rails + corner posts
    const Ls = along ? [x0, x1] : [z0, z1], n = Math.floor((Ls[1] - Ls[0] - 0.4) / 0.28);
    for (let k = 0; k <= n; k++) {
      const a = Ls[0] + 0.2 + k * (Ls[1] - Ls[0] - 0.4) / n;
      if (along) { B.box(M.paint, a - 0.05, y + 0.18, z0, a + 0.05, y + H - 0.16, z0 + 0.06, { tint: t }); B.box(M.paint, a - 0.05, y + 0.18, z1 - 0.06, a + 0.05, y + H - 0.16, z1, { tint: t }); }
      else { B.box(M.paint, x0, y + 0.18, a - 0.05, x0 + 0.06, y + H - 0.16, a + 0.05, { tint: t }); B.box(M.paint, x1 - 0.06, y + 0.18, a - 0.05, x1, y + H - 0.16, a + 0.05, { tint: t }); }
    }
    B.box(M.graphite, x0, y + H - 0.16, z0, x1, y + H, z1, { bevel: 0.02 });
    B.box(M.graphite, x0, y, z0, x1, y + 0.18, z1, { bevel: 0.02 });
    // corner castings + posts 1 cm proud of the collider (a grazing ray meets the drawn corner, not an undrawn one)
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.box(M.graphite, Math.max(x0 - 0.012, cx - 0.16), y, Math.max(z0 - 0.012, cz - 0.16), Math.min(x1 + 0.012, cx + 0.16), y + H, Math.min(z1 + 0.012, cz + 0.16), { bevel: 0.01 });
    // door end (+x of the container's own frame): 4 locking bars + a hazard band
    const de = along ? (Math.cos(c.yaw) > 0 ? x1 : x0) : (Math.sin(-c.yaw) > 0 ? z1 : z0), sg = de === x1 || de === z1 ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const a = (along ? z0 : x0) + 0.35 + k * ((along ? W : W) - 0.7) / 3;
      if (along) B.box(M.galv, de - (sg > 0 ? 0.02 : -0.02) - 0.03, y + 0.25, a - 0.03, de + (sg > 0 ? 0.03 : -0.03), y + H - 0.25, a + 0.03);
      else B.box(M.galv, a - 0.03, y + 0.25, de - 0.03, a + 0.03, y + H - 0.25, de + 0.03);
    }
    if (along) B.box(M.hazard, Math.min(de, de - sg * 0.01), y + 1.1, z0 + 0.2, Math.max(de, de + sg * 0.012), y + 1.35, z1 - 0.2);
    else B.box(M.hazard, x0 + 0.2, y + 1.1, Math.min(de, de - sg * 0.01), x1 - 0.2, y + 1.35, Math.max(de, de + sg * 0.012));
  }
}
