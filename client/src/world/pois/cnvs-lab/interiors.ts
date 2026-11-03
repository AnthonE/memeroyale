// CNVS LAB — interior dressing that needs no collider: everything is flat on a wall (≤ 0.12 m proud), above head
// height (≥ 2.1 m over the floor) or painted on the floor. Per room: the server hall's cable ladders + floor tape +
// EXIT signs; the control room's video wall; whiteboards, posters, wall screens, extinguishers, the bunks' rug; the
// garage's pegboard + chain hoist. Furniture with bulk lives in PROPS (shared layout, collides).
import * as THREE from "three";
import { MODULES, PROPS, CX, CZ, INTERIOR_ROOMS, type ModuleSpec, type Side } from "../../../../../shared/pois/cnvs-lab";
import { furnishRoom } from "../../../../../shared/pois/interior-kit";
import type { Bins } from "./geo";
import type { LabMats } from "./mats";

const T = 0.3;
/** inner face coordinate + inward sign for a side */
const inner = (m: ModuleSpec, s: Side) => s === "n" ? { f: m.v[0] + T, k: 1 } : s === "s" ? { f: m.v[1] - T, k: -1 } : s === "w" ? { f: m.u[0] + T, k: 1 } : { f: m.u[1] - T, k: -1 };
function flat(b: Bins, mat: THREE.Material, m: ModuleSpec, s: Side, a0: number, a1: number, y0: number, y1: number, d0: number, d1: number, tint: THREE.ColorRepresentation = 0xffffff, bevel = 0) {
  const { f, k } = inner(m, s), q0 = f + k * d0, q1 = f + k * d1;
  if (s === "n" || s === "s") b.box(mat, a0, y0, Math.min(q0, q1), a1, y1, Math.max(q0, q1), { tint, bevel });
  else b.box(mat, Math.min(q0, q1), y0, a0, Math.max(q0, q1), y1, a1, { tint, bevel });
}
export function buildInteriors(M: LabMats, B: Bins) {
  // wall dressing (whiteboards, screens, posters, clocks) comes from the interiors kit with the furniture; the lab
  // keeps: EXIT signs over every door, and the control room's 5.4 m video wall (3 × 2 screens) on B's west wall
  for (const m of MODULES) {
    const fl = m.floor, ceil = m.roofTop - 0.3;
    for (const d of m.doors) flat(B, M.green, m, d.s, d.at - 0.25, d.at + 0.25, fl + 2.6, Math.min(fl + 2.78, ceil - 0.05), 0, 0.1);
  }
  { const m = MODULES.find((q) => q.id === "B")!, fl = m.floor, mid = (m.v[0] + m.v[1]) / 2, vw = 5.4, cw = vw / 3;
    flat(B, M.furnMetal, m, "w", mid - vw / 2 - 0.1, mid + vw / 2 + 0.1, fl + 0.85, fl + 2.65, 0, 0.07, 0x202428);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) flat(B, M.screens[(i + j * 3) % 4], m, "w", mid - vw / 2 + i * cw + 0.03, mid - vw / 2 + (i + 1) * cw - 0.03, fl + 0.92 + j * 0.84, fl + 1.72 + j * 0.84, 0.07, 0.08);
    // status LED strip under the wall
    flat(B, M.tealGlow, m, "w", mid - vw / 2, mid + vw / 2, fl + 0.8, fl + 0.84, 0, 0.09);
  }
  const A = MODULES.find((m) => m.id === "A")!, E = MODULES.find((m) => m.id === "E")!, D = MODULES.find((m) => m.id === "D")!;
  // server hall: hazard tape along the hot aisles, perforated-tile rows glow a little under the racks
  for (const p of PROPS) if (p.k === "rack") {
    B.box(M.hazard, p.u - 0.55, A.floor + 0.016, p.v - 2.6, p.u - 0.47, A.floor + 0.022, p.v + 2.6);
    B.box(M.hazard, p.u + 0.47, A.floor + 0.016, p.v - 2.6, p.u + 0.55, A.floor + 0.022, p.v + 2.6);
  }
  {     const hy = E.roofTop - 0.3 - 0.3; B.box(M.furnMetal, E.u[0] + 1, hy, -21.2, E.u[1] - 1, hy + 0.22, -20.8, { tint: 0xe8a61a });
    B.cyl(M.cable, [13.5, hy, -21], [13.5, E.floor + 2.4, -21], 0.02, 5);
    B.box(M.furnMetal, 13.3, E.floor + 2.25, -21.2, 13.7, E.floor + 2.45, -20.8, { tint: 0xe8a61a }); }
  // server hall: a cable ladder + a red sprinkler main over every hot aisle (≥ 3.4 m: above any jumping head), floor
  // cable runs between the rows, CRAC units flat on the partition wall
  { const racks = PROPS.filter((p) => p.k === "rack").map((p) => p.u).sort((a, b) => a - b);
    for (let i = 0; i < racks.length - 1; i++) {
      const u = (racks[i] + racks[i + 1]) / 2;
      // floor: a yellow-sheathed power run down the aisle (flat)
      B.box(M.hazard, u - 0.08, A.floor + 0.016, -4.8, u + 0.08, A.floor + 0.03, 4.8);
    }
    // CRAC units against the partition (u = 22, room side), flat 0.12
    for (const v of [-5.2, 0.2]) { B.box(M.furn, 21.78, A.floor + 0.1, v - 0.9, 21.9, A.floor + 2.4, v + 0.9, { tint: 0xd7dcd8 }); for (let k = 0; k < 8; k++) B.box(M.furnMetal, 21.75, A.floor + 1.5 + k * 0.1, v - 0.8, 21.78, A.floor + 1.53 + k * 0.1, v + 0.8, { tint: 0x30353a }); B.box(M.tealGlow, 21.75, A.floor + 1.2, v - 0.3, 21.77, A.floor + 1.35, v + 0.3); }
  }
  // labs: wall cabinets above head height + bench kit (centrifuge, microscope, rack of vials)
  { const C = MODULES.find((m) => m.id === "C")!;
    // only the solid wall spans (a run across the north window + the C1 door head reads as a blank white panel), with
    // door seams, pulls and a graphite crown
    for (const [u0, u1] of [[30.45, 32.25], [38.4, 41.2], [42.95, 45.6]] as Array<[number, number]>) {
      const z0 = C.v[0] + T, z1 = z0 + 0.38, ya = C.floor + 2.15, yb = C.floor + 2.75;
      B.box(M.furn, u0, ya, z0, u1, yb, z1, { tint: 0xeef0ee, bevel: 0.02 });
      B.box(M.furn, u0 - 0.02, yb, z0, u1 + 0.02, yb + 0.05, z1 + 0.03, { tint: 0x3a3f45, bevel: 0.01 });
      const nd = Math.max(2, Math.round((u1 - u0) / 0.55));
      for (let k = 1; k < nd; k++) { const u = u0 + (u1 - u0) * k / nd; B.box(M.furnMetal, u - 0.006, ya + 0.02, z1, u + 0.006, yb - 0.02, z1 + 0.004, { tint: 0x8a9095 }); }
      for (let k = 0; k < nd; k++) { const u = u0 + (u1 - u0) * (k + (k % 2 ? 0.2 : 0.8)) / nd; B.box(M.furnMetal, u - 0.012, ya + 0.04, z1, u + 0.012, ya + 0.16, z1 + 0.02, { tint: 0x30353a }); }
    }
  }
  // bunks: shelves over the bunks' heads (≥ 2.1 m), a lamp, the rug
  for (const u of [-18.6, -15.6]) B.box(M.wood, u - 0.9, D.floor + 2.15, D.v[0] + T, u + 0.9, D.floor + 2.2, D.v[0] + T + 0.3, { tint: 0xb89068 });
  floorDressing(M, B);
}

/** floor dressing (flat, ≤ 2.6 cm over the floor — walkable, parity-safe): woven rugs in the crew
 *  quarters (the entry + under the mess table), the CNVS floor medallion in the control room, black anti-fatigue mats
 *  along the lab benches + a hazard ring round the specimen tanks, entry mats + yellow walk lines at the ground doors */
function floorDressing(M: LabMats, B: Bins) {
  const mod = (id: string) => MODULES.find((m) => m.id === id)!;
  const rug = (y: number, u0: number, u1: number, v0: number, v1: number, cols: number[]) => {
    B.box(M.paint, u0, y + 0.012, v0, u1, y + 0.02, v1, { tint: cols[0] });
    B.box(M.paint, u0 + 0.12, y + 0.02, v0 + 0.12, u1 - 0.12, y + 0.024, v1 - 0.12, { tint: cols[1] });
    const n = Math.max(2, Math.round((u1 - u0) / 0.45));
    for (let k = 1; k < n; k += 2) B.box(M.paint, u0 + 0.12 + (u1 - u0 - 0.24) * k / n, y + 0.024, v0 + 0.25, u0 + 0.12 + (u1 - u0 - 0.24) * (k + 1) / n, y + 0.026, v1 - 0.25, { tint: cols[2] });
    // fringe
    for (const v of [v0 - 0.06, v1]) B.box(M.paint, u0 + 0.05, y + 0.012, v, u1 - 0.05, y + 0.016, v + 0.06, { tint: 0xe9dcc0 });
  };
  const D = mod("D"), Bm = mod("B"), C = mod("C"), A = mod("A"), E = mod("E"), P = mod("P");
  rug(D.floor, -17.6, -14.4, -7.9, -5.1, [0x8a2f24, 0xc4553a, 0xe6b54a]);
  rug(D.floor, -12.7, -9.7, -12.3, -8.9, [0x1f5f66, 0x2f8f8a, 0xe8d8b0]);
  // control room: the CNVS medallion (graphite disc, yellow ring, teal core)
  { const cu = 20.5, cv = -1.45, y = Bm.floor;
    const disc = (r: number, h: number, mat: THREE.Material, tint: number) => B.cyl(mat, [cu, y + 0.012, cv], [cu, y + h, cv], r, 32, { tint });
    disc(1.15, 0.018, M.paint, 0x2d3136); disc(1.0, 0.022, M.yellow, 0xffffff); disc(0.86, 0.024, M.paint, 0x2d3136); disc(0.42, 0.026, M.tealGlow, 0xffffff);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; B.box(M.yellow, cu + Math.cos(a) * 0.62 - 0.05, y + 0.024, cv + Math.sin(a) * 0.62 - 0.05, cu + Math.cos(a) * 0.62 + 0.05, y + 0.026, cv + Math.sin(a) * 0.62 + 0.05); } }
  // labs: anti-fatigue mats in front of the benches + hazard rings round both specimen tanks
  for (const [u0, u1, v0, v1] of [[33.0, 35.6, -4.4, -3.6], [31.3, 32.1, -6.3, -4.0], [36.0, 36.8, -3.3, -0.9]] as Array<[number, number, number, number]>) B.box(M.rubber, u0, C.floor + 0.012, v0, u1, C.floor + 0.022, v1);
  for (const p of PROPS) if (p.k === "tank" && Math.abs((p.y ?? C.floor) - C.floor) < 0.1 && p.u > C.u[0] && p.u < C.u[1]) {
    const ring = new THREE.RingGeometry(0.72, 0.86, 24); ring.rotateX(-Math.PI / 2); ring.translate(p.u, C.floor + 0.02, p.v); B.add(M.hazard, ring, undefined, 0xffffff, true);
  }
  // ground doors: a ribbed entry mat inside + a yellow walk line
  for (const m of [A, E, P]) for (const d of m.doors) {
    if (d.h && d.h > 2.6) continue;
    const along = d.s === "n" || d.s === "s", f = d.s === "n" ? m.v[0] + T : d.s === "s" ? m.v[1] - T : d.s === "w" ? m.u[0] + T : m.u[1] - T, k = d.s === "n" || d.s === "w" ? 1 : -1;
    const a0 = d.at - d.w / 2, a1 = d.at + d.w / 2, q0 = f + k * 0.05, q1 = f + k * 1.05, y = m.floor + 0.014;
    if (along) B.box(M.rubber, a0, y, Math.min(q0, q1), a1, y + 0.01, Math.max(q0, q1)); else B.box(M.rubber, Math.min(q0, q1), y, a0, Math.max(q0, q1), y + 0.01, a1);
    const r0 = f + k * 1.15, r1 = f + k * 1.25;
    if (along) B.box(M.yellow, a0 - 0.3, y, Math.min(r0, r1), a1 + 0.3, y + 0.008, Math.max(r0, r1)); else B.box(M.yellow, Math.min(r0, r1), y, a0 - 0.3, Math.max(r0, r1), y + 0.008, a1 + 0.3);
  }
}

/** (parity) the interiors kit's warehouse racks collide as their full bounding box (2.7 m) but are drawn as open
 *  shelving with a few goods: rays at 1.2 / 1.7 m cross the empty bays = an "invisible wall". In the lab's rooms every
 *  rack bay is stocked full-depth (to 5 cm inside the faces) on both lower levels: wrapped pallets, carton stacks and
 *  CNVS flight cases, so the collider reads as the loaded rack it is. Local lab frame (x = u, z = v). */
export function stockKitRacks(M: LabMats, B: Bins) {
  let seed = 911; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cardboard = [0xc9a26a, 0xb89060, 0xd2ae78];
  for (const room of INTERIOR_ROOMS) {
    if (!room.id?.startsWith("cnvs-lab:")) continue;
    const L = furnishRoom(room);
    const cy = Math.cos(room.yaw), sy = Math.sin(room.yaw);
    for (const it of L.items) {
      if (it.kind !== "rack") continue;
      const w = it.w, h = it.h, d = it.d, bays = Math.max(1, Math.round(w / 2.4)), bw = w / bays;
      const iy = it.yaw, ci = Math.cos(iy), si = Math.sin(iy);
      // item-local (a along w, b along d) → room-local → lab-local
      const put = (a: number, b: number, y0: number, y1: number, hw: number, hd: number, mat: THREE.Material, tint: number, bevel: number) => {
        const rx = it.x + a * ci + b * si, rz = it.z - a * si + b * ci;
        const x = room.x + rx * cy + rz * sy - CX, z = room.z - rx * sy + rz * cy - CZ;
        const yaw = room.yaw + iy, g = new THREE.BoxGeometry(hw * 2, y1 - y0, hd * 2);
        B.add(mat, bevel > 0 ? g : g, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, room.y + it.y + (y0 + y1) / 2, z), tint, true);
      };
      const lv1 = h * 0.48;
      for (let bI = 0; bI < bays; bI++) {
        const ca = -w / 2 + bw * (bI + 0.5), half = (bw - 0.16) / 2, hd = d / 2 - 0.05;
        for (const [y0, y1] of [[0.15, lv1 - 0.11], [lv1 + 0.03, Math.min(h - 0.24, lv1 + 1.0)]]) {
          const pick = r();
          // every load sits on a wooden pallet and is made of
          // individual taped, labelled cartons (or drums / flight cases)
          const carton = (cx: number, cz: number, ya: number, yb: number, hw: number, hdd: number) => {
            put(cx, cz, ya, yb, hw, hdd, M.paint, cardboard[Math.floor(r() * 3)], 0);
            put(cx, cz, yb - 0.004, yb + 0.004, Math.min(0.05, hw * 0.3), hdd + 0.002, M.paint, 0x9a7a4a, 0);   // tape
            put(cx, cz - hdd - 0.003, ya + (yb - ya) * 0.45, ya + (yb - ya) * 0.75, hw * 0.45, 0.004, M.paint, r() < 0.5 ? 0xf2f0ea : 0xffd430, 0);   // label
          };
          if (pick < 0.4) {
            // a palletised load: wooden pallet + 3 × 2 cartons in layers + two white straps
            put(ca, 0, y0, y0 + 0.13, half, hd, M.paint, 0x9b7148, 0);
            for (let k = 0; k < 3; k++) put(ca + (k - 1) * half * 0.66, 0, y0 + 0.13, y0 + 0.15, half * 0.06, hd, M.paint, 0x6e4f30, 0);
            const ly = Math.max(1, Math.round((y1 - y0 - 0.15) / 0.38)), lh = (y1 - y0 - 0.16) / ly;
            for (let l = 0; l < ly; l++) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
              carton(ca + (i - 1) * half * 0.667, (j - 0.5) * hd, y0 + 0.15 + l * lh, y0 + 0.15 + (l + 1) * lh - 0.012, half / 3 - 0.012, hd / 2 - 0.012);
            for (const sa of [-0.45, 0.45]) put(ca + sa * half, 0, y0 + 0.14, y1 - 0.01, 0.025, hd + 0.006, M.paint, 0xf4f4f0, 0);
          } else if (pick < 0.75) {
            // carton stacks: 2 × 2 columns of boxes, full height of the bay
            for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
              const n = 2 + Math.floor(r() * 2), hh = (y1 - y0) / n;
              for (let k = 0; k < n; k++) carton(ca + (i - 0.5) * half, (j - 0.5) * hd, y0 + k * hh, y0 + (k + 1) * hh - 0.01, half / 2 - 0.01, hd / 2 - 0.01);
            }
          } else {
            // CNVS flight cases (yellow / graphite)
            const n = 2, hh = (y1 - y0) / n;
            for (let k = 0; k < n; k++) put(ca, 0, y0 + k * hh, y0 + (k + 1) * hh - 0.015, half, hd, k % 2 ? M.caseG : M.caseY, 0xffffff, 0);
          }
        }
      }
    }
  }
}
