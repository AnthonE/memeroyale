// CANOPY LINE — the far proxy for the 0.75 M-tri POI: the silhouette the plane / map / distant
// fights read — trunks + limbs, deck discs with their rims, the launch tower (legs, decks, thatch cap, pennant), the huts
// (log boxes + thatch pyramids), the rope bridges as plank strips and the zip cables — ~20 k triangles in the same
// materials. index.ts swaps it in beyond FAR_SWITCH (MAIN + DETAIL hidden), the crowns stay (they are the canopy read).
import * as THREE from "three";
import { LAYOUT, TOWER, limbLine, limbR, hutRoofRect, toW, sagY, rad } from "../../../../../shared/pois/canopy-line";
import { M, col, cylGeo } from "../_kit/town-geo";
import { logGeo } from "./geo";
import type { Bins } from "./kit";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function addFarProxy(b: Bins) {
  // trunks + limbs
  for (const c of LAYOUT.columns) {
    if (c.kind === "tree") {
      b.bark.add(cylGeo(c.r * 0.98, c.r * 1.02, c.top - c.gy + 1.5, 10, false, 2.6), M(c.x, (c.gy - 1.5 + c.top) / 2, c.z), col("#b8aa96"));
      for (const l of c.limbs) {
        const line = limbLine(l);
        for (let i = 0; i + 4 < line.length; i += 4) { const p = line[i], q = line[i + 4]; b.bark.add(logGeo(V(...p.p), V(...q.p), limbR(l, p.u), limbR(l, q.u), 6), null, col("#c4b6a2")); }
      }
    } else {
      b.bark.add(cylGeo(0.4, 0.4, TOWER.flagTop - c.gy, 6, false, 2), M(c.x, (c.gy + TOWER.flagTop) / 2, c.z), col("#cdbca5"));
    }
  }
  // deck discs (top + rim) — tower decks octagonal and painted yellow at the rim
  for (const g of LAYOUT.rings) {
    const c = LAYOUT.columns[g.col], tower = g.kind === "tower";
    const R = tower ? g.r1 / Math.cos(Math.PI / 8) : g.r1;
    b.wood.add(cylGeo(R, R, 0.3, tower ? 8 : 20, false, 1), M(c.x, g.y - 0.15, c.z, tower ? Math.PI / 8 : 0), col("#ecd6b6"));
    (tower ? b.plastic : b.woodDark).add(cylGeo(R + 0.06, R + 0.06, 0.5, tower ? 8 : 20, true, 1), M(c.x, g.y - 0.25, c.z, tower ? Math.PI / 8 : 0), col(tower ? "#ffdc3e" : "#b08a60"));
    // rail band (reads as the rail from afar)
    b.woodDark.add(cylGeo(R - 0.1, R - 0.1, 0.08, tower ? 8 : 20, true, 1), M(c.x, g.y + 1.05, c.z, tower ? Math.PI / 8 : 0), col("#c9b79e"));
  }
  // launch tower: 8 legs, the thatch cap, the pennant
  {
    const T = TOWER, c = T.col, Rp = T.apothem / Math.cos(Math.PI / 8) - 0.2;
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2, [x, z] = rad(c, a, Rp); b.bark.add(cylGeo(T.legR, T.legR, T.roofY - c.gy + 1, 5, true, 2), M(x, (c.gy - 1 + T.roofY) / 2, z), col("#c9b79e")); }
    const R0 = T.capR / Math.cos(Math.PI / 8);
    b.thatch.add(cylGeo(T.nestR / Math.cos(Math.PI / 8), R0, T.peak - T.roofY, 8, false, 1.3), M(c.x, (T.roofY + T.peak) / 2, c.z, Math.PI / 8), col("#fff2cc"));
    // the T1 cabin (octagonal plank drum), the three banners down the shaft, the 12 × 5 m pennant at the mast top
    const Rc = T.apothem / Math.cos(Math.PI / 8);
    b.wood.add(cylGeo(Rc, Rc, T.cabinTop - 70, 8, false, 1), M(c.x, (70 + T.cabinTop) / 2, c.z, Math.PI / 8), col("#e8c690"));
    for (const k of [7, 0, 1]) { const a = k / 8 * Math.PI * 2; for (const f of [0, Math.PI]) b.fabric.add(new THREE.PlaneGeometry(3.2, 11), M(c.x + Math.cos(a) * (T.apothem + 0.35), 63.8, c.z + Math.sin(a) * (T.apothem + 0.35), Math.PI / 2 - a + f), col(k === 0 ? "#2fa7a0" : "#ffd23a")); }
    for (const f of [0, Math.PI]) b.fabric.add(new THREE.PlaneGeometry(12, 5), M(c.x + Math.cos(0.5) * 6, T.flagTop - 3.2, c.z + Math.sin(0.5) * 6, -0.5 + f), col("#ffd93a"));
  }
  // huts: log box + thatch pyramid
  for (const h of LAYOUT.huts) {
    const [ox, oz] = toW(h.yaw, 0, 0), H = h.floors * h.floorH;
    b.bark.box(h.w, H, h.d, M(h.x + ox, h.y + H / 2, h.z + oz, -h.yaw), col("#d8c09a"));
    const [x0, x1, z0, z1] = hutRoofRect(h), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
    const rise = Math.min(hw, hd) * h.pitch, [rx, rz] = toW(h.yaw, cx, cz);
    const roof = new THREE.ConeGeometry(1 / Math.cos(Math.PI / 8), 1, 8, 1, false, Math.PI / 8);   // (the octagonal thatch)
    b.thatch.add(roof, M(h.x + rx, h.y + H + 0.2 + rise / 2, h.z + rz, -h.yaw, 0, 0, hw, rise, hd), col("#fff2cc"));
  }
  // rope bridges as plank strips; zip cables as thin tubes
  for (const br of LAYOUT.bridges) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V(br.a[0] + (br.b[0] - br.a[0]) * t, sagY(br.a[1], br.b[1], br.sag, t) - 0.05, br.a[2] + (br.b[2] - br.a[2]) * t)); }
    for (let i = 0; i < 6; i++) { const a = pts[i], e = pts[i + 1], d = e.clone().sub(a), L = d.length(); b.wood.box(L + 0.02, 0.08, br.w, M((a.x + e.x) / 2, (a.y + e.y) / 2, (a.z + e.z) / 2, Math.atan2(-d.z, d.x), 0, Math.asin(d.y / L)), col("#f2d3a4")); }
  }
  for (const z of LAYOUT.zips) {
    for (let i = 0; i < 8; i++) { const t0 = i / 8, t1 = (i + 1) / 8; const p = (t: number) => V(z.a[0] + (z.b[0] - z.a[0]) * t, sagY(z.a[1], z.b[1], z.sag, t), z.a[2] + (z.b[2] - z.a[2]) * t); b.cable.add(logGeo(p(t0), p(t1), 0.05, 0.05, 3), null, col("#ffffff")); }
  }
}
