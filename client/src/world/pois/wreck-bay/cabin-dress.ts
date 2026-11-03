// WRECK BAY — storytelling dressing of the galleon's rooms, on top of the shared
// interiors kit's furniture (SHIP_LAYOUTS). Placed clear of every kit item, doorway / gap, hatch, mast and hull
// opening. Visual only, and parity-safe by construction:
//  - wall pieces sit within 0.12 m of the lining (the collider face behind them)
//  - floor clutter is low (≤ 0.15 m: inside the floor tolerance) or a small footprint (bottles, a keg, a shot pyramid)
//  - table-top still lifes stand on the kit tables' tops
// Wall lantern brackets also push warm light pools (belowDeckLight) so the rooms read at 10 m.
import * as THREE from "three";
import { M, col, cylGeo, latheGeo, tubeGeo } from "../_kit/town-geo";
import { SHIP_LAYOUTS, DECKS, MASTS, HULL_OPS, hb } from "../../../../../shared/pois/wreck-bay";
import { SHIPM, L, lantern, type ShipBins } from "./ship";
import { cask } from "./props";

type Rect = { x: number; z: number; hw: number; hd: number; yaw: number };
const IRON = "#2e2a28", GILT = "#dca23a", PARCH = "#ead8ae", INK = "#3a2a1a", RED = "#8e1c1c", WOODD = "#5a3a22";
const soft = (c: string, k = 0.6, bright = 1.0) => new THREE.Color(1, 1, 1).lerp(new THREE.Color(c), k).multiplyScalar(bright);

export function dressShipRooms(B: ShipBins, rng: () => number, pools: Array<[number, number, number, number]>) {
  // all interior dressing in the fine bins (shown within ~46 m of the ship): it is inside the hull
  const n = B.fine, f = B.fine;
  for (const l of SHIP_LAYOUTS) {
    const r = l.room, y = r.y, x0 = r.x - r.w / 2, x1 = r.x + r.w / 2;
    const captain = l.role === "captain", gun = (r.id ?? "").startsWith("gun"), hold = (r.id ?? "").startsWith("hold");
    const taken: Rect[] = l.items.map((it) => ({ x: r.x + it.x, z: it.z, hw: it.w / 2 + 0.25, hd: it.d / 2 + 0.25, yaw: it.yaw }));
    const inRect = (q: Rect, x: number, z: number) => { const c = Math.cos(q.yaw), s = Math.sin(q.yaw), dx = x - q.x, dz = z - q.z; return Math.abs(dx * c - dz * s) < q.hw && Math.abs(dx * s + dz * c) < q.hd; };
    // doorways / gaps: 1.7 m clear in front of them
    const doors = r.openings.filter((o) => o.kind !== "window").map((o) => (o.side === 1 ? [x1, o.at] : o.side === 3 ? [x0, o.at] : [r.x + o.at, o.side === 0 ? 5 : -5]) as [number, number]);
    const deck = DECKS.find((d) => Math.abs(d.y - y) < 0.05);
    const inner = (x: number, h: number) => hb(x, y + h) - 0.33;
    const free = (x: number, z: number, rad: number) => {
      if (x < x0 + rad + 0.1 || x > x1 - rad - 0.1 || Math.abs(z) > inner(x, 0.3) - rad - 0.05) return false;
      if (taken.some((q) => inRect(q, x, z))) return false;
      if (doors.some(([dx, dz]) => Math.hypot(x - dx, (z - dz) * (Math.abs(dz) >= 5 ? 0.35 : 1)) < 1.7)) return false;
      if (MASTS.some((ms) => Math.hypot(x - ms.x, z) < 0.9)) return false;
      if (deck?.holes.some((hh) => x > hh.x0 - 0.4 && x < hh.x1 + 0.4 && z > hh.z0 - 0.4 && z < hh.z1 + 0.4)) return false;
      return true;
    };
    const claim = (x: number, z: number, rad: number) => taken.push({ x, z, hw: rad + 0.15, hd: rad + 0.15, yaw: 0 });
    const floorSpot = (rad: number): [number, number] | null => {
      for (let t = 0; t < 60; t++) { const x = x0 + rng() * r.w, z = (rng() * 2 - 1) * inner(x0 + r.w / 2, 0.3); if (free(x, z, rad)) { claim(x, z, rad); return [x, z]; } }
      return null;
    };
    // wall spots: along both long walls, clear of hull openings and of tall kit items standing against the wall
    const wallTaken: Array<[number, number]> = [];
    const wallSpot = (h: number, half: number): [number, number] | null => {
      for (let t = 0; t < 50; t++) {
        const sd = rng() < 0.5 ? 1 : -1, x = x0 + 0.6 + rng() * (r.w - 1.2), z = sd * (inner(x, h) - 0.02);
        if (HULL_OPS.some((o) => o.side === sd && x > o.x0 - half - 0.25 && x < o.x1 + half + 0.25 && y + h + 0.5 > o.y0 && y + h - 0.5 < o.y1)) continue;
        if (l.items.some((it) => Math.abs(r.x + it.x - x) < it.w / 2 + half + 0.15 && Math.abs(Math.abs(it.z) - Math.abs(z)) < 1.0 && Math.sign(it.z) === sd && it.y + it.h > h - 0.45)) continue;
        if (wallTaken.some(([wx, ws]) => ws === sd && Math.abs(wx - x) < half + 0.5)) continue;
        if (doors.some(([dx, dz]) => Math.abs(dx - x) < 1.2 && Math.sign(dz) === sd && Math.abs(dz) >= 5)) continue;
        wallTaken.push([x, sd]);
        return [x, sd];
      }
      return null;
    };
    // the wall frame at (x, side, height): local +z faces into the room
    const W = (x: number, sd: number, h: number, out = 0, dx = 0, dy = 0) => L(x + dx, y + h + dy, sd * (inner(x, h) - out), sd > 0 ? Math.PI : 0);

    // ---------------------------------------------------------------- wall pieces
    // two lantern brackets (warm pools) — four in the hold / gun deck (the darkest rooms)
    for (let k = 0; k < (hold || gun ? 4 : 2); k++) {
      const s = wallSpot(1.8, 0.25); if (!s) break;
      const [x, sd] = s, m = W(x, sd, 1.8, 0.02);
      n.metal.box(0.05, 0.05, 0.38, m.clone().multiply(M(0, 0.1, 0.19)), col(IRON));
      n.metal.box(0.04, 0.3, 0.04, m.clone().multiply(M(0, -0.05, 0.02)), col(IRON));
      lantern(n, m.clone().multiply(M(0, -0.3, 0.36)));
      pools.push([x, y, sd * (inner(x, 1.8) - 1.1), 2.6]);
    }
    // crossed cutlasses on a plaque (pistols in the captain's rooms)
    for (let k = 0; k < (captain ? 2 : 1); k++) {
      const s = wallSpot(1.55, 0.35); if (!s) break;
      const m = W(s[0], s[1], 1.55, 0.03);
      n.wood.bbox(0.55, 0.62, 0.04, m, soft(WOODD), 0.015);
      for (const e of [-1, 1]) {
        const b = m.clone().multiply(M(0, 0, 0.04, 0, 0, e * 0.75));
        n.metal.box(0.04, 0.72, 0.012, b.clone().multiply(M(0, 0.08, 0)), col("#c8ccd0"));
        n.metal.add(new THREE.TorusGeometry(0.07, 0.012, 4, 10, Math.PI), b.clone().multiply(M(0, -0.3, 0)), col(GILT));
        n.wood.box(0.035, 0.14, 0.035, b.clone().multiply(M(0, -0.36, 0)), col("#3a2414"));
      }
      if (captain) n.metal.add(new THREE.SphereGeometry(0.07, 8, 6), m.clone().multiply(M(0, 0.34, 0.03)), col(GILT));
    }
    // a framed treasure map / sea chart (red X, a dotted course, a compass rose)
    {
      const s = wallSpot(1.5, 0.5);
      if (s) {
        const m = W(s[0], s[1], 1.5, 0.03);
        n.wood.bbox(0.95, 0.7, 0.05, m, soft("#4a2e1a"), 0.02);
        f.plastic.box(0.83, 0.58, 0.01, m.clone().multiply(M(0, 0, 0.03)), col(PARCH));
        for (const e of [-1, 1]) f.plastic.box(0.12, 0.022, 0.006, m.clone().multiply(M(0.22, -0.08, 0.04, 0, 0, e * 0.8)), col("#b02418"));
        for (let i = 0; i < 7; i++) f.plastic.box(0.035, 0.012, 0.006, m.clone().multiply(M(-0.3 + i * 0.075, 0.12 - Math.sin(i * 0.8) * 0.1, 0.04)), col(INK));
        f.plastic.add(new THREE.RingGeometry(0.05, 0.065, 12), m.clone().multiply(M(-0.28, -0.16, 0.041)), col(INK));
        // island blobs
        f.plastic.add(new THREE.CircleGeometry(0.09, 7), m.clone().multiply(M(0.18, -0.05, 0.039, 0, 0, 0, 1.4, 0.8, 1)), col("#9aa86a"));
      }
    }
    // rope coils on a peg; a tricorn hat on a peg (crew) / a gold-framed portrait (captain)
    {
      const s = wallSpot(1.45, 0.25);
      if (s) {
        const m = W(s[0], s[1], 1.45, 0.02);
        n.wood.add(cylGeo(0.03, 0.03, 0.18, 6), m.clone().multiply(M(0, 0.2, 0.09, 0, Math.PI / 2, 0)), col("#3a2414"));
        for (let k = 0; k < 4; k++) n.rope.add(new THREE.TorusGeometry(0.22 - k * 0.012, 0.03, 5, 16), m.clone().multiply(M(0, -0.02 - k * 0.01, 0.06 + k * 0.025, 0, 0, 0.1 * k)), col("#b89f6c"));
      }
      const s2 = wallSpot(1.6, 0.3);
      if (s2) {
        const m = W(s2[0], s2[1], 1.6, 0.03);
        if (captain) {
          n.metal.bbox(0.56, 0.7, 0.05, m, col(GILT), 0.02);
          f.plastic.box(0.44, 0.58, 0.01, m.clone().multiply(M(0, 0, 0.03)), col("#4a3a5a"));
          f.plastic.add(new THREE.CircleGeometry(0.12, 12), m.clone().multiply(M(0, 0.08, 0.037, 0, 0, 0, 1, 1.2, 1)), col("#c89a6a"));
          f.plastic.box(0.3, 0.2, 0.006, m.clone().multiply(M(0, -0.16, 0.037)), col(RED));
        } else {
          n.wood.add(cylGeo(0.03, 0.03, 0.18, 6), m.clone().multiply(M(0, 0.15, 0.09, 0, Math.PI / 2, 0)), col("#3a2414"));
          const hat = m.clone().multiply(M(0, 0.05, 0.16, 0, -1.2, 0));
          n.plastic.add(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 3), hat, col("#1e1a1c"));
          n.plastic.add(cylGeo(0.12, 0.14, 0.13, 10), hat.clone().multiply(M(0, 0.08, 0)), col("#242022"));
          n.metal.add(new THREE.TorusGeometry(0.27, 0.01, 4, 3), hat.clone().multiply(M(0, 0.02, 0, 0, Math.PI / 2, 0)), col(GILT));
        }
      }
    }
    // ---------------------------------------------------------------- the captain's rooms: velvet drapes at the stern windows
    if (captain) for (const o of r.openings) {
      if (o.kind !== "window" || o.side !== 3) continue;
      const wx = x0 + 0.1, half = o.w / 2;
      n.metal.add(cylGeo(0.025, 0.025, o.w + 0.9, 6), L(wx + 0.05, y + 2.45, o.at, 0, Math.PI / 2, 0), col(GILT));
      for (const e of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const zt = o.at + e * (half + 0.05 + k * 0.07), zb = o.at + e * (half - 0.1 + k * 0.1);
          const pts = [new THREE.Vector3(wx + 0.06, y + 2.42, zt), new THREE.Vector3(wx + 0.08, y + 1.55, o.at + e * (half + 0.12 + k * 0.03)), new THREE.Vector3(wx + 0.1, y + 1.2, o.at + e * (half + 0.18 + k * 0.025)), new THREE.Vector3(wx + 0.07, y + 0.45, zb)].map((v) => v.applyMatrix4(SHIPM));
          n.plastic.add(tubeGeo(pts, 0.055, 6, false, 12), null, soft(RED, 0.95, 0.75 + 0.1 * (k % 2)));
        }
        n.metal.add(new THREE.SphereGeometry(0.06, 8, 6), L(wx + 0.16, y + 1.2, o.at + e * (half + 0.2)), col(GILT));
        n.metal.add(new THREE.ConeGeometry(0.05, 0.16, 8), L(wx + 0.16, y + 1.08, o.at + e * (half + 0.2), 0, 0, Math.PI), col(GILT));
      }
    }
    // ---------------------------------------------------------------- table-top still lifes
    for (const it of l.items) {
      if (it.kind !== "table" && it.kind !== "map-table" && it.kind !== "captain-desk") continue;
      const tx = r.x + it.x, tz = it.z, ty = y + it.h, c = Math.cos(it.yaw), s = Math.sin(it.yaw);
      const at = (u: number, v: number, yaw = 0) => L(tx + u * c + v * s, ty, tz - u * s + v * c, it.yaw + yaw);
      // a candle (drips + a flame bulb) on a brass stick
      const cm = at(-it.w * 0.32, -it.d * 0.15);
      n.metal.add(latheGeo([[0, 0], [0.07, 0], [0.07, 0.015], [0.02, 0.03], [0.015, 0.12], [0.035, 0.13], [0, 0.13]], 10), cm, col(GILT));
      n.plastic.add(cylGeo(0.018, 0.02, 0.14, 8), cm.clone().multiply(M(0, 0.2, 0)), col("#f2ead2"));
      n.bulb.add(new THREE.SphereGeometry(0.022, 6, 5), cm.clone().multiply(M(0, 0.3, 0, 0, 0, 0, 1, 1.8, 1)), col("#ffd27a"));
      // tankard + plate, an open book or a sextant / compass
      const tm = at(it.w * 0.28, it.d * 0.12);
      n.metal.add(cylGeo(0.055, 0.06, 0.14, 10), tm.clone().multiply(M(0, 0.07, 0)), col("#8a8a86"));
      n.metal.add(new THREE.TorusGeometry(0.04, 0.01, 4, 8, Math.PI), tm.clone().multiply(M(0.065, 0.07, 0, 0, 0, -Math.PI / 2)), col("#8a8a86"));
      n.metal.add(cylGeo(0.13, 0.11, 0.015, 14), at(it.w * 0.05, it.d * 0.2), col("#9a9690"));
      if (it.kind === "table") {
        for (let k = 0; k < 3; k++) f.plastic.add(new THREE.SphereGeometry(0.04, 6, 4), at(it.w * 0.05 + (k - 1) * 0.05, it.d * 0.2 + (k % 2) * 0.03).multiply(M(0, 0.04, 0, 0, 0, 0, 1, 0.6, 1)), col("#c88a3a"));
        // dice + scattered cards (a crew's game)
        for (let k = 0; k < 4; k++) f.plastic.box(0.07, 0.004, 0.1, at(-it.w * 0.05 + k * 0.06, -it.d * 0.2 + (k % 2) * 0.05, k * 0.4), col(k % 2 ? "#f4f0e4" : "#e8e0d0"));
        for (let k = 0; k < 2; k++) f.plastic.box(0.03, 0.03, 0.03, at(it.w * 0.2 + k * 0.05, -it.d * 0.25, k).multiply(M(0, 0.015, 0)), col("#f4f0e8"));
      } else {
        const bm = at(-it.w * 0.05, -it.d * 0.05, 0.2);
        for (const e of [-1, 1]) n.plastic.box(0.2, 0.02, 0.28, bm.clone().multiply(M(e * 0.1, 0.02, 0, 0, 0, e * -0.12)), col("#f0e6cc"));
        n.plastic.box(0.42, 0.02, 0.3, bm.clone().multiply(M(0, 0.005, 0)), col("#5a1c14"));
        n.metal.add(new THREE.TorusGeometry(0.08, 0.012, 5, 16), at(it.w * 0.32, -it.d * 0.2).multiply(M(0, 0.015, 0, 0, Math.PI / 2, 0)), col(GILT));
      }
    }
    // ---------------------------------------------------------------- floor clutter (low or narrow)
    // (sparse on the walkable floor: one bottle cluster a room, shot + powder by the guns, the captain's skull)
    // bottles (a cluster, one lying down)
    for (let k = 0; k < 1; k++) {
      const sp = floorSpot(0.2); if (!sp) break;
      const bottle = latheGeo([[0, 0], [0.045, 0], [0.045, 0.18], [0.02, 0.24], [0.015, 0.3], [0, 0.3]], 8);
      for (let i = 0; i < 3; i++) n.plastic.add(bottle, L(sp[0] + (i - 1) * 0.1, y, sp[1] + (i % 2) * 0.08), col(i % 2 ? "#2f5a2a" : "#5a3418"));
      n.plastic.add(bottle, L(sp[0] + 0.05, y + 0.045, sp[1] - 0.14, 0.4, 0, Math.PI / 2), col("#3a6a34"));
    }
    if (gun || hold) {
      // a pyramid of round shot + a powder keg (gun deck / hold)
      { const sp = floorSpot(0.25); if (sp) { const ball = new THREE.SphereGeometry(0.075, 8, 6); for (let a = 0; a < 3; a++) for (let i = 0; i < 3 - a; i++) for (let j = 0; j < 3 - a; j++) n.metal.add(ball, L(sp[0] + (i - (2 - a) / 2) * 0.15, y + 0.075 + a * 0.12, sp[1] + (j - (2 - a) / 2) * 0.15), col("#2a2826")); } }
      { const sp = floorSpot(0.25); if (sp) { cask(n, L(sp[0], y, sp[1], rng() * 6), 0.2, 0.42, rng, "#4a3020"); f.plastic.add(new THREE.CircleGeometry(0.12, 8), L(sp[0] + 0.2, y + 0.005, sp[1] + 0.12, 0, -Math.PI / 2, 0), col("#141210")); } }
    }
    if (captain) {
      // a skull with a guttered candle on it
      { const sp = floorSpot(0.2); if (sp) { const m = L(sp[0], y, sp[1], rng() * 6); n.plastic.add(new THREE.SphereGeometry(0.1, 10, 8), m.clone().multiply(M(0, 0.1, 0, 0, 0, 0, 1, 0.95, 1.1)), col("#e8dcc0")); for (const e of [-1, 1]) n.woodDark.add(new THREE.SphereGeometry(0.028, 6, 5), m.clone().multiply(M(0.09, 0.11, e * 0.04)), col("#1a1410")); n.plastic.box(0.08, 0.04, 0.12, m.clone().multiply(M(0.06, 0.03, 0)), col("#ddd0b4")); n.plastic.add(cylGeo(0.02, 0.025, 0.08, 8), m.clone().multiply(M(0, 0.23, 0)), col("#f2ead2")); n.bulb.add(new THREE.SphereGeometry(0.018, 6, 5), m.clone().multiply(M(0, 0.29, 0, 0, 0, 0, 1, 1.8, 1)), col("#ffd27a")); } }
    }
  }
}
