// interiors — per-kind furniture drawing. Every item is drawn in its own frame: origin = footprint centre on the floor
// it stands on, +z = its front, w along x, d along z, h up — and fits inside its w × h × d box (the collider), so what
// you see is what stops you. Chunky bevelled forms, painted wear (worn chamfers, grime at the base, dark undersides).
import * as THREE from "three";
import type { InteriorItem, InteriorStyle } from "../../../../../shared/pois/interior-kit";
import { bananaGeo, boxGeo, planeGeo, sphGeo, cylGeo, torusGeo, type IBuilder, type MatKey } from "./interior-geo";

// ------------------------------------------------------------------------------------------------ palettes
export const WOOD = ["#b98552", "#8a5a36", "#d7b27a", "#6e4a2e"];
const PAINT: Record<InteriorStyle, string[]> = {
  house: ["#5fa39a", "#e8c86a", "#d9745a", "#f2ead8", "#6f8fc4", "#9bbf7a"],
  shop: ["#2f8a86", "#e8b04a", "#d9483b", "#f2ead8", "#3a86c8", "#7bbf4a"],
  warehouse: ["#e8a33a", "#3f7fb0", "#c94f3c", "#7a8a52", "#d7d2c4", "#4f6f7a"],
  lab: ["#e9eef0", "#3f5f6b", "#2fb3a8", "#9aa7ad", "#dfe6e8", "#2b3238"],
  hut: ["#c99a5a", "#8fb3a0", "#d9745a", "#e8d6a8", "#6f8fc4", "#a8c46a"],
  cabin: ["#7a4a2a", "#2f4f6f", "#a8322a", "#e8d6a8", "#3e6a4a", "#c9a45a"],
  temple: ["#9c8f78", "#b8a88a", "#d4a53a", "#7a6a55", "#6f8a52", "#c98a4a"],
};
const FABRIC = ["#d9483b", "#2f8a86", "#e8b04a", "#6a7fc0", "#f2e3c7", "#8a5aa8"];
const LEAF = ["#3f9a45", "#2f7f3a", "#5fae4a"];
const WARM = new THREE.Color(1.9, 1.45, 0.85);   // lamp glow (HDR vertex colour)
const TEAL = new THREE.Color(0.35, 1.6, 1.45);
const FIRE = new THREE.Color(2.4, 1.1, 0.3);

export interface DrawCtx {
  B: IBuilder;
  style: InteriorStyle;
  /** ceiling height above this item's base (for flues / cords) */
  ceil: number;
  rng: () => number;
  /** lamp light positions (item-local, filled by the drawers) → the fake light pools */
  lights: Array<{ x: number; y: number; z: number; r: number; c: THREE.Color; floor?: boolean; wash?: boolean }>;
}
const pc = (s: InteriorStyle, i: number) => PAINT[s][((i % 6) + 6) % 6];
const shade = (hex: string, f: number) => new THREE.Color(hex).multiplyScalar(f);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// helpers
function legs4(D: DrawCtx, w: number, d: number, h: number, t: number, col: THREE.ColorRepresentation, inset = 0.05, key: MatKey = "wood", taper = 0.8) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.B.cyl(key, sx * (w / 2 - inset - t / 2), 0, sz * (d / 2 - inset - t / 2), t / 2 * taper, t / 2, h, col, { seg: 8, grime: 0.25 });
}
function knob(D: DrawCtx, x: number, y: number, z: number, col = "#d8b25a") { D.B.sphere("metal", x, y, z, 0.022, col, { detail: 0 }); }
function books(D: DrawCtx, x0: number, x1: number, y: number, z: number, depth: number, maxH: number) {
  let x = x0;
  const r = D.rng;
  while (x < x1 - 0.03) {
    if (r() < 0.12) { x += 0.05 + r() * 0.1; continue; }
    const t = 0.025 + r() * 0.035, h = maxH * (0.62 + r() * 0.38);
    if (x + t > x1) break;
    const lean = r() < 0.08 ? 0.25 : 0;
    D.B.box("paint", x + t / 2, y, z, t, h, depth * (0.75 + r() * 0.2), FABRIC[Math.floor(r() * FABRIC.length)], { b: 0, rz: lean, wear: 0.25 });
    x += t + 0.003;
  }
}
function fruitPile(D: DrawCtx, cx: number, y: number, cz: number, w: number, d: number, kind: "banana" | "mango" | "lime" | "mixed", n = 10) {
  const r = D.rng;
  for (let i = 0; i < n; i++) {
    const k = kind === "mixed" ? (["banana", "mango", "lime"] as const)[i % 3] : kind;
    const x = cx + (r() - 0.5) * w * 0.8, z = cz + (r() - 0.5) * d * 0.8, yy = y + 0.03 + (i / n) * 0.05;
    if (k === "banana") {
      // a little bunch: 3 curved fingers fanned about the stem, lying on their side
      const ry = r() * 6, col = r() < 0.8 ? "#ffd83a" : "#c8d840", fingers = n > 8 ? 2 : 3;
      for (let f = 0; f < fingers; f++) D.B.push("paint", bananaGeo(), D.B.M(x, yy + 0.025 + f * 0.012, z, ry + (f - 1) * 0.28, Math.PI / 2 - 0.25, 0), f === 1 ? shade(col, 1.08) : col, { uv: "box", wear: 0, under: 0.35 });
    }
    else if (k === "mango") D.B.sphere("paint", x, yy + 0.035, z, 0.055, r() < 0.5 ? "#e8722a" : "#d9483b", { sx: 1.1, sy: 0.9, sz: 0.95, detail: 1 });
    else D.B.sphere("paint", x, yy + 0.03, z, 0.04, "#7bbf4a", { detail: 1 });
  }
}

/** animated fire: 3 crossed flame cards (the "fire" material scrolls a noise through a teardrop mask) + an ember glow */
function flame(D: DrawCtx, x: number, y: number, z: number, w: number, h: number, k = 1) {
  const B = D.B, ph = D.rng();
  for (let i = 0; i < 3; i++) B.push("fire", planeGeo(), B.M(x, y + h / 2, z, (i * Math.PI) / 3 + ph, 0, 0, w * (i === 1 ? 0.8 : 1), h * (i === 1 ? 0.85 : 1), 1), new THREE.Color(k * (i === 1 ? 0.8 : 1), 0, (ph + i * 0.31) % 1), { uv: "geo", wear: 0, under: 0 });
}
/** a parametric surface (u, v ∈ [0, 1]) → non-indexed geometry, both faces */
function surface(f: (u: number, v: number) => [number, number, number], nu: number, nv: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  const P = (i: number, j: number) => f(i / nu, j / nv);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    const q = [[a, i, j], [b, i + 1, j], [c, i + 1, j + 1], [a, i, j], [c, i + 1, j + 1], [d, i, j + 1]] as Array<[[number, number, number], number, number]>;
    for (const [p, ii, jj] of q) { pos.push(...p); uv.push(ii / nu, jj / nv); }
    for (const [p, ii, jj] of [q[0], q[2], q[1], q[3], q[5], q[4]]) { pos.push(...p); uv.push(ii / nu, jj / nv); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
const screenRect = (cell: number): [number, number, number, number] => { const u = (cell % 4) * 0.25, v = cell < 4 ? 0.5 : 0; return [u + 0.003, v + 0.006, u + 0.247, v + 0.494]; };

type Drawer = (D: DrawCtx, it: InteriorItem) => void;
const W = (it: InteriorItem) => [it.w, it.h, it.d] as const;

const DRAW: Partial<Record<InteriorItem["kind"], Drawer>> = {
  // ------------------------------------------------------------------------------------------ house
  bed(D, it) {
    const [w, h, d] = W(it), wood = WOOD[(it.c + 1) % 4], B = D.B;
    B.box("wood", 0, 0.1, 0, w, 0.24, d - 0.04, wood, { grime: 0.2 });
    legs4(D, w, d - 0.04, 0.1, 0.08, shade(wood, 0.8), 0.03);
    B.box("fabric", 0, 0.34, 0.01, w - 0.08, 0.2, d - 0.14, "#f4efe6", { b: 0.06, wear: 0 });
    B.box("fabric", 0, 0.46, d * 0.14, w + 0.02, 0.1, d * 0.66, FABRIC[it.c % FABRIC.length], { b: 0.045, wear: 0.15 });
    B.box("fabric", 0, 0.47, d * 0.14 + d * 0.33 - 0.12, w + 0.03, 0.1, 0.22, shade(FABRIC[it.c % FABRIC.length], 1.2), { b: 0.045, wear: 0 }); // folded edge
    const pill = w > 1.4 ? [-w / 4, w / 4] : [0];
    for (const x of pill) B.box("fabric", x, 0.52, -d / 2 + 0.34, Math.min(0.62, w / pill.length - 0.12), 0.14, 0.36, "#fbf7ef", { b: 0.06, wear: 0, rx: -0.12 });
    B.box("wood", 0, 0.1, -d / 2 + 0.045, w + 0.08, h - 0.1, 0.09, wood, { b: 0.035 });
    B.box("wood", 0, h - 0.06, -d / 2 + 0.045, w + 0.14, 0.07, 0.13, shade(wood, 1.1), { b: 0.025 });
    B.box("wood", 0, 0.1, d / 2 - 0.04, w + 0.04, 0.42, 0.08, wood, { b: 0.03 });
  },
  nightstand(D, it) {
    const [w, h, d] = W(it), col = WOOD[(it.c + 2) % 4], B = D.B;
    legs4(D, w, d, 0.1, 0.05, shade(col, 0.8), 0.03);
    B.box("wood", 0, 0.1, 0, w, h - 0.14, d, col, { grime: 0.15 });
    B.box("wood", 0, h - 0.045, 0, w + 0.03, 0.045, d + 0.03, shade(col, 1.08));
    B.box("paint", 0, 0.28, d / 2 + 0.005, w - 0.08, 0.16, 0.02, pc(D.style, it.c + 1), { b: 0.006 });
    B.box("paint", 0, h - 0.24, d / 2 + 0.005, w - 0.08, 0.14, 0.02, pc(D.style, it.c + 1), { b: 0.006 });
    knob(D, 0, 0.36, d / 2 + 0.025); knob(D, 0, h - 0.17, d / 2 + 0.025);
  },
  dresser(D, it) {
    const [w, h, d] = W(it), col = it.c === 1 ? pc(D.style, 0) : WOOD[it.c % 4], B = D.B, key: MatKey = it.c === 1 ? "paint" : "wood";
    legs4(D, w, d, 0.1, 0.06, shade(WOOD[1], 0.9), 0.04);
    B.box(key, 0, 0.1, 0, w, h - 0.14, d, col, { grime: 0.15 });
    B.box("wood", 0, h - 0.045, 0, w + 0.04, 0.045, d + 0.04, WOOD[0]);
    const n = 3, dh = (h - 0.22) / n;
    for (let i = 0; i < n; i++) {
      for (const sx of w > 1 ? [-1, 1] : [0]) {
        const dw = w > 1 ? w / 2 - 0.06 : w - 0.08;
        B.box(key, sx * (w / 4), 0.14 + i * dh, d / 2 + 0.006, dw, dh - 0.04, 0.02, shade(col, 1.06), { b: 0.008 });
        knob(D, sx * (w / 4), 0.14 + i * dh + dh / 2 - 0.02, d / 2 + 0.03);
      }
    }
    // dressing on top
    B.cyl("paint", -w * 0.3, h, 0, 0.07, 0.09, 0.2, "#e9e1d0", { seg: 10 });
    B.sphere("leaf", -w * 0.3, h + 0.26, 0, 0.1, LEAF[0], { sx: 1.2, sy: 0.9, sz: 1.1 });
    B.box("paint", w * 0.1, h, 0.02, 0.22, 0.05, 0.16, FABRIC[(it.c + 3) % 6], { b: 0.006 });
  },
  wardrobe(D, it) {
    const [w, h, d] = W(it), col = it.c === 2 ? pc(D.style, 3) : WOOD[it.c % 4], key: MatKey = it.c === 2 ? "paint" : "wood", B = D.B;
    B.box(key, 0, 0.08, 0, w, h - 0.16, d, col, { grime: 0.18 });
    B.box("wood", 0, 0, 0, w - 0.06, 0.08, d - 0.06, shade(WOOD[1], 0.8));
    B.box("wood", 0, h - 0.08, 0, w + 0.06, 0.08, d + 0.06, shade(col, 1.08), { b: 0.02 });
    for (const sx of [-1, 1]) {
      B.box(key, sx * w / 4, 0.14, d / 2 + 0.006, w / 2 - 0.05, h - 0.3, 0.02, shade(col, 1.05), { b: 0.008 });
      B.box(key, sx * w / 4, 0.3, d / 2 + 0.018, w / 2 - 0.2, h - 0.64, 0.012, shade(col, 0.95), { b: 0.004, wear: 0.1 });
      B.box("metal", sx * 0.05, h * 0.5, d / 2 + 0.03, 0.02, 0.22, 0.02, "#d8b25a", { b: 0.005, wear: 0 });
    }
    // a suitcase on top? no: keeps h. A folded blanket peeking
  },
  bookshelf(D, it) {
    const [w, h, d] = W(it), col = WOOD[it.c % 4], B = D.B;
    B.box("wood", -w / 2 + 0.025, 0, 0, 0.05, h, d, col); B.box("wood", w / 2 - 0.025, 0, 0, 0.05, h, d, col);
    B.box("wood", 0, 0, -d / 2 + 0.01, w - 0.06, h, 0.02, shade(col, 0.7), { wear: 0 });
    const n = 5, sh = (h - 0.1) / n;
    for (let i = 0; i <= n; i++) B.box("wood", 0, 0.04 + i * sh - (i === n ? 0.02 : 0), 0, w - 0.08, 0.03, d - 0.02, shade(col, 1.05));
    for (let i = 0; i < n; i++) {
      const y = 0.07 + i * sh;
      if (D.rng() < 0.18) { D.B.sphere("paint", -w / 4, y + 0.1, 0, 0.1, pc(D.style, i), { sy: 0.9 }); books(D, 0, w / 2 - 0.06, y, 0.02, d - 0.06, sh - 0.06); }
      else books(D, -w / 2 + 0.06, w / 2 - 0.06, y, 0.02, d - 0.06, sh - 0.06);
    }
  },
  sofa(D, it) {
    const [w, h, d] = W(it), f = FABRIC[it.c % FABRIC.length], B = D.B, arm = 0.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl("wood", sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), 0.025, 0.03, 0.08, WOOD[1], { seg: 6 });
    B.box("fabric", 0, 0.08, 0, w, 0.28, d, shade(f, 0.9), { b: 0.05, wear: 0.1 });
    for (const sx of [-1, 1]) B.box("fabric", sx * (w / 2 - arm / 2), 0.08, 0.02, arm, 0.54, d - 0.04, f, { b: 0.07, wear: 0.12 });
    B.box("fabric", 0, 0.08, -d / 2 + 0.13, w - 0.02, h - 0.08, 0.26, shade(f, 0.95), { b: 0.07, wear: 0.1 });
    const n = w > 1.6 ? 2 : 1, cw = (w - 2 * arm) / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + arm + cw * (i + 0.5);
      B.box("fabric", x, 0.36, 0.1, cw - 0.03, 0.13, d - 0.34, shade(f, 1.08), { b: 0.055, wear: 0.1 });
      B.box("fabric", x, 0.46, -d / 2 + 0.3, cw - 0.06, 0.36, 0.18, shade(f, 1.12), { b: 0.07, wear: 0.08, rx: -0.18 });
    }
    B.box("fabric", -w / 2 + arm + 0.22, 0.48, -d / 2 + 0.44, 0.34, 0.3, 0.12, FABRIC[(it.c + 2) % 6], { b: 0.05, wear: 0, rx: -0.3, ry: 0.3 });
  },
  armchair(D, it) {
    const [w, h, d] = W(it), f = FABRIC[(it.c + 1) % FABRIC.length], B = D.B, arm = 0.17;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl("wood", sx * (w / 2 - 0.09), 0, sz * (d / 2 - 0.09), 0.022, 0.028, 0.08, WOOD[1], { seg: 6 });
    B.box("fabric", 0, 0.08, 0, w, 0.28, d, shade(f, 0.9), { b: 0.05, wear: 0.1 });
    for (const sx of [-1, 1]) B.box("fabric", sx * (w / 2 - arm / 2), 0.08, 0.02, arm, 0.52, d - 0.04, f, { b: 0.07 });
    B.box("fabric", 0, 0.08, -d / 2 + 0.12, w - 0.02, h - 0.08, 0.24, shade(f, 0.95), { b: 0.07 });
    B.box("fabric", 0, 0.36, 0.08, w - 2 * arm - 0.02, 0.13, d - 0.3, shade(f, 1.08), { b: 0.055 });
  },
  "coffee-table"(D, it) {
    const [w, h, d] = W(it), col = WOOD[it.c % 4], B = D.B;
    B.box("wood", 0, h - 0.05, 0, w, 0.05, d, col, { b: 0.018 });
    legs4(D, w, d, h - 0.05, 0.05, shade(col, 0.85), 0.04);
    B.box("wood", 0, 0.1, 0, w - 0.12, 0.025, d - 0.12, shade(col, 0.9));
    B.box("paint", -w * 0.2, h, 0, 0.26, 0.04, 0.2, FABRIC[(it.c + 1) % 6], { b: 0.006, ry: 0.3 });
    B.box("paint", -w * 0.2, h + 0.04, 0, 0.22, 0.035, 0.17, FABRIC[(it.c + 4) % 6], { b: 0.006, ry: 0.1 });
    B.cyl("paint", w * 0.22, h, 0.05, 0.13, 0.08, 0.07, "#e9e1d0", { seg: 14 });
    fruitPile(D, w * 0.22, h + 0.02, 0.05, 0.2, 0.2, "mixed", 5);
    B.box("wood", 0, 0.125, 0, 0.35, 0.05, 0.24, FABRIC[(it.c + 2) % 6], { b: 0.006 });
  },
  table(D, it) {
    const [w, h, d] = W(it), col = WOOD[it.c % 4], B = D.B;
    B.box("wood", 0, h - 0.06, 0, w, 0.06, d, col, { b: 0.02 });
    B.box("wood", 0, h - 0.16, 0, w - 0.14, 0.1, d - 0.14, shade(col, 0.85), { b: 0.01 });
    legs4(D, w, d, h - 0.06, 0.075, shade(col, 0.9), 0.06, "wood", 0.75);
    if (D.style === "hut" || D.style === "cabin") { B.box("fabric", 0, h, 0, w * 0.35, 0.01, d + 0.02, "#e8d6a8", { b: 0.003, wear: 0 }); }
    // settings
    const r = D.rng, n = w > 1.3 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const x = (n === 4 ? (i % 2 ? 0.42 : -0.42) : 0), z = (i < n / 2 ? 1 : -1) * (d / 2 - 0.2);
      B.cyl("paint", x + (r() - 0.5) * 0.05, h, z, 0.12, 0.1, 0.02, "#f4efe6", { seg: 14 });
      if (r() < 0.6) B.cyl("glass", x + 0.2, h, z - Math.sign(z) * 0.05, 0.035, 0.03, 0.12, "#cfe6ee", { seg: 8 });
    }
    B.cyl("paint", 0, h, 0, 0.16, 0.1, 0.08, pc(D.style, it.c + 2), { seg: 14 });
    fruitPile(D, 0, h + 0.03, 0, 0.22, 0.22, D.style === "shop" ? "mixed" : "banana", 6);
  },
  chair(D, it) {
    const [w, h, d] = W(it), col = WOOD[(it.c + 2) % 4], B = D.B, sy = 0.46;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl("wood", sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.02, 0.024, sy, col, { seg: 6 });
    B.box("wood", 0, sy, 0, w, 0.045, d, col, { b: 0.015 });
    if (D.style === "house" || D.style === "cabin") B.box("fabric", 0, sy + 0.045, 0.02, w - 0.06, 0.04, d - 0.08, FABRIC[(it.c + 3) % 6], { b: 0.018, wear: 0 });
    for (const sx of [-1, 1]) B.box("wood", sx * (w / 2 - 0.04), sy, -d / 2 + 0.035, 0.05, h - sy, 0.05, col, { b: 0.012 });
    for (const y of [sy + 0.2, h - 0.1]) B.box("wood", 0, y, -d / 2 + 0.035, w - 0.06, 0.08, 0.03, shade(col, 1.06), { b: 0.01 });
  },
  counter(D, it) { counterBase(D, it); },
  sink(D, it) {
    counterBase(D, it);
    const [w, h, d] = W(it), B = D.B;
    B.box("metal", 0, h - 0.02, 0.02, w - 0.24, 0.025, d - 0.28, "#b9c2c4", { b: 0.01 });
    B.box("paint", 0, h - 0.015, 0.02, w - 0.34, 0.02, d - 0.38, "#2f383a", { b: 0.004, wear: 0 });
    B.cyl("metal", 0, h, -d / 2 + 0.1, 0.018, 0.022, 0.26, "#d9dcdc", { seg: 8 });
    B.box("metal", 0, h + 0.24, -d / 2 + 0.16, 0.03, 0.03, 0.16, "#d9dcdc", { b: 0.008 });
    B.box("paint", w * 0.3, h, -d / 2 + 0.16, 0.1, 0.18, 0.06, "#2fb3a8", { b: 0.01 });
  },
  stove(D, it) {
    const [w, h, d] = W(it), B = D.B;
    B.box("metal", 0, 0.05, 0, w - 0.02, h - 0.05, d - 0.02, "#e9ecea", { b: 0.03, grime: 0.12 });
    B.box("paint", 0, 0, 0.02, w - 0.08, 0.06, d - 0.08, "#2b2b2b", { wear: 0 });
    B.box("paint", 0, 0.18, d / 2 - 0.005, w - 0.16, h * 0.5, 0.02, "#2a2d2e", { b: 0.01, wear: 0.05 });
    B.box("glass", 0, 0.3, d / 2 + 0.008, w - 0.32, h * 0.22, 0.01, "#6a5a4a", { b: 0.004 });
    B.box("metal", 0, h * 0.72, d / 2 + 0.04, w - 0.24, 0.025, 0.025, "#c8cccc", { b: 0.006 });
    for (const [x, z] of [[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.14], [0.18, 0.14]]) { B.cyl("metal", x, h, z, 0.1, 0.1, 0.015, "#2b2b2b", { seg: 14 }); B.cyl("metal", x, h + 0.015, z, 0.05, 0.05, 0.01, "#595959", { seg: 10 }); }
    for (let i = 0; i < 4; i++) B.cyl("metal", -w / 2 + 0.16 + i * (w - 0.32) / 3, h - 0.09, d / 2 - 0.01, 0.022, 0.022, 0.03, "#333", { rx: Math.PI / 2, seg: 8 });
    B.box("metal", 0, h, -d / 2 + 0.04, w - 0.02, 0.14, 0.05, "#dfe2e0", { b: 0.012 });
    B.cyl("metal", -0.18, h + 0.015, 0.14, 0.11, 0.1, 0.12, "#c94f3c", { seg: 14 });   // a pot
  },
  fridge(D, it) {
    const [w, h, d] = W(it), col = ["#e9ecea", "#8fc9c0", "#f1d7a0", "#e9ecea"][it.c % 4], B = D.B;
    B.box("paint", 0, 0.04, 0, w, h - 0.04, d, col, { b: 0.07, grime: 0.12, wear: 0.2 });
    B.box("paint", 0, 0, 0, w - 0.1, 0.05, d - 0.1, "#333", { wear: 0 });
    B.box("paint", 0, h * 0.64, d / 2 + 0.002, w - 0.06, 0.012, 0.012, shade(col, 0.6), { b: 0, wear: 0 });
    for (const [y0, y1] of [[0.25, 0.6], [h * 0.7, h * 0.92]]) B.box("metal", -w / 2 + 0.1, y0 * (y0 < 1 ? h : 1), d / 2 + 0.03, 0.03, (y1 - y0) * (y0 < 1 ? h : 1), 0.03, "#cfd3d3", { b: 0.01 });
    const r = D.rng; for (let i = 0; i < 3; i++) B.box("paint", (r() - 0.3) * w * 0.5, h * (0.45 + r() * 0.1), d / 2 + 0.005, 0.07, 0.07, 0.012, FABRIC[i], { b: 0.004, wear: 0 });
    B.box("paint", 0.05, h * 0.5, d / 2 + 0.004, 0.16, 0.2, 0.004, "#f7f2e6", { b: 0, rz: 0.08, wear: 0 });
  },
  "upper-cab"(D, it) {
    const [w, h, d] = W(it), col = pc(D.style, it.c + 3), B = D.B;
    B.box("paint", 0, 0, 0, w - 0.01, h, d, col, { b: 0.02 });
    B.box("paint", 0, 0.03, d / 2 + 0.004, w - 0.06, h - 0.06, 0.015, shade(col, 1.05), { b: 0.006 });
    B.box("metal", w / 2 - 0.1, 0.08, d / 2 + 0.02, 0.02, 0.14, 0.02, "#d8b25a", { b: 0.005 });
  },
  rug(D, it) {
    // the printed rug 6 mm over its felt pad (2 mm apart they fought from across a room)
    const cell = it.c % 4, u = (cell % 2) * 0.5, v = cell < 2 ? 0.5 : 0;
    D.B.push("rug", planeFlat(), D.B.M(0, 0.034, 0, 0, -Math.PI / 2, 0, it.w, it.d, 1), "#ffffff", { uv: "rect", rect: [u, v, u + 0.5, v + 0.5], wear: 0, under: 0 });
    D.B.box("fabric", 0, 0.013, 0, it.w + 0.02, 0.015, it.d + 0.02, "#5a4636", { b: 0.004, wear: 0 });
  },
  picture(D, it) {
    const [w, h] = W(it), B = D.B, cell = it.c % 6, fw = Math.min(0.09, w * 0.12), fc = [WOOD[3], "#2b2622", "#c9a45a", WOOD[1]][it.c % 4];
    // moulded frame (4 bevelled rails), a gilt lip, the painted canvas set back
    B.box("wood", 0, 0, -0.02, w, fw, 0.055, fc, { b: 0.018 }); B.box("wood", 0, h - fw, -0.02, w, fw, 0.055, fc, { b: 0.018 });
    for (const sx of [-1, 1]) B.box("wood", sx * (w / 2 - fw / 2), fw, -0.02, fw, h - 2 * fw, 0.055, fc, { b: 0.018 });
    B.box("metal", 0, fw - 0.012, -0.012, w - 2 * fw + 0.024, h - 2 * fw + 0.024, 0.02, "#d4a53a", { b: 0.006, wear: 0.3 });
    B.push("art", planeGeoLocal(), B.M(0, h / 2, 0.012, 0, 0, 0, w - 2 * fw, h - 2 * fw, 1), "#ffffff", { uv: "rect", rect: artRect(cell), wear: 0, under: 0 });
  },
  mirror(D, it) {
    const [w, h] = W(it), B = D.B;
    B.box("wood", 0, 0, -0.015, w, h, 0.04, "#d4a53a", { b: 0.015 });
    B.box("metal", 0, 0.05, 0.002, w - 0.1, h - 0.1, 0.01, "#bcd0d8", { b: 0.003, wear: 0 });
  },
  clock(D, it) {
    const [w] = W(it), B = D.B;
    B.cyl("wood", 0, 0, -0.01, w / 2, w / 2, 0.05, WOOD[1], { rx: Math.PI / 2, seg: 20, uv: "box" });
    B.cyl("paint", 0, 0, 0.018, w / 2 - 0.04, w / 2 - 0.04, 0.01, "#f7f2e6", { rx: Math.PI / 2, seg: 20 });
    B.box("paint", 0, 0, 0.028, 0.015, w * 0.3, 0.006, "#222", { b: 0, wear: 0, rz: 0.6 });
    B.box("paint", 0, 0, 0.03, 0.012, w * 0.38, 0.006, "#222", { b: 0, wear: 0, rz: -1.9 });
  },
  "wall-shelf"(D, it) {
    const [w] = W(it), B = D.B;
    B.box("wood", 0, 0, 0, w, 0.035, 0.24, WOOD[0], { b: 0.01 });
    for (const sx of [-1, 1]) B.box("metal", sx * w * 0.35, -0.14, -0.08, 0.025, 0.14, 0.08, "#333", { b: 0.005 });
    books(D, -w / 2 + 0.05, -w * 0.05, 0.035, 0.0, 0.18, 0.2);
    B.cyl("paint", w * 0.25, 0.035, 0, 0.06, 0.05, 0.1, "#c9744a", { seg: 10 });
    B.sphere("leaf", w * 0.25, 0.2, 0, 0.08, LEAF[1], { sy: 0.8 });
    B.cyl("glass", w * 0.4, 0.035, 0, 0.04, 0.04, 0.14, "#9fd6c8", { seg: 8 });
  },
  plant(D, it) {
    const [w, h] = W(it), B = D.B, r = D.rng;
    const pot = ["#c9744a", "#e9e1d0", "#2f8a86"][it.c % 3];
    B.cyl("paint", 0, 0, 0, w * 0.42, w * 0.32, 0.36, pot, { seg: 14, grime: 0.2 });
    B.cyl("paint", 0, 0.34, 0, w * 0.45, w * 0.45, 0.05, shade(pot, 0.9), { seg: 14 });
    B.cyl("stone", 0, 0.36, 0, w * 0.39, w * 0.39, 0.02, "#4a3526", { seg: 12 });
    const kind = it.v < 0.4 ? 0 : it.v < 0.7 ? 1 : 2;
    if (kind === 0) {
      // monstera: long stems arching out, big heart-shaped leaves (flattened, tilted, two-tone)
      const n = 7 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5, t = 0.45 + r() * 0.55, reach = w * 0.55 * t, top = 0.36 + (h - 0.45) * (0.55 + t * 0.45);
        const x = Math.cos(a) * reach, z = Math.sin(a) * reach;
        B.rod("leaf", V(Math.cos(a) * 0.03, 0.38, Math.sin(a) * 0.03), V(x * 0.85, top - 0.04, z * 0.85), 0.009, "#4f7a2a", 5);
        const tilt = 0.35 + t * 0.5;
        B.push("leaf", sphLeaf(), B.M(x, top, z, -a + Math.PI / 2, tilt, 0, 0.17 + t * 0.06, 0.02, 0.24 + t * 0.08), LEAF[i % 3], { uv: "box", wear: 0.25, edge: new THREE.Color("#a8d870"), under: 0.4 });
      }
    } else if (kind === 1) {
      // snake plant: stiff upright blades, yellow margins
      const n = 9 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, rr = r() * w * 0.2, bh = (h - 0.4) * (0.6 + r() * 0.4);
        B.cbox("leaf", Math.cos(a) * rr, 0.38 + bh / 2, Math.sin(a) * rr, 0.07, bh, 0.014, i % 2 ? "#2f6a3a" : "#3f7f45", { b: 0.006, ry: r() * 3, rx: (r() - 0.5) * 0.25, rz: (r() - 0.5) * 0.25, wear: 0.45, edge: new THREE.Color("#d8d060") });
      }
    } else {
      // fern ball: many drooping fronds
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.3, up = r() < 0.4;
        const len = (h - 0.4) * (up ? 0.9 : 0.75), el = up ? 0.9 : 0.25 + r() * 0.3;
        B.push("leaf", sphLeaf(), B.M(Math.cos(a) * len * 0.35, 0.4 + len * 0.45 * Math.sin(el) + 0.05, Math.sin(a) * len * 0.35, -a + Math.PI / 2, up ? -0.9 : el, 0, 0.07, 0.015, len * 0.5), LEAF[(i + 1) % 3], { uv: "box", wear: 0.2, edge: new THREE.Color("#b8e080") });
      }
    }
  },
  "floor-lamp"(D, it) {
    const [, h] = W(it), B = D.B;
    B.cyl("metal", 0, 0, 0, 0.16, 0.18, 0.04, "#3a3a3a", { seg: 14 });
    B.rod("metal", V(0, 0.04, 0), V(0, h - 0.34, 0), 0.015, "#c9a45a", 8);
    B.cyl("fabric", 0, h - 0.38, 0, 0.13, 0.2, 0.34, "#f4e6c4", { seg: 16 });
    B.cyl("glow", 0, h - 0.4, 0, 0.17, 0.17, 0.02, WARM, { seg: 16 });
    D.lights.push({ x: 0, y: h - 0.3, z: 0, r: 2.2, c: new THREE.Color(1, 0.8, 0.5), floor: true });
  },
  "table-lamp"(D, it) {
    const B = D.B, h = it.h;
    B.sphere("paint", 0, 0.1, 0, 0.09, pc(D.style, it.c + 4), { sy: 1.1 });
    B.rod("metal", V(0, 0.18, 0), V(0, h - 0.18, 0), 0.01, "#c9a45a", 6);
    B.cyl("fabric", 0, h - 0.2, 0, 0.09, 0.14, 0.2, "#f4e6c4", { seg: 14 });
    B.cyl("glow", 0, h - 0.21, 0, 0.12, 0.12, 0.015, WARM, { seg: 14 });
    D.lights.push({ x: 0, y: h - 0.1, z: 0, r: 1.9, c: new THREE.Color(1.1, 0.85, 0.52) });
  },
  pendant(D, it) {
    const B = D.B, h = it.h, big = it.w > 0.8;
    B.rod("paint", V(0, h, 0), V(0, 0.2, 0), 0.008, "#222", 5);
    B.cyl("metal", 0, h - 0.01, 0, 0.07, 0.07, 0.01, "#333", { seg: 10 });
    if (big) { B.box("metal", 0, 0.02, 0, it.w, 0.06, 0.2, "#dfe6e8", { b: 0.015 }); B.box("glow", 0, 0.01, 0, it.w - 0.06, 0.012, 0.14, new THREE.Color(1.8, 1.8, 1.7), { b: 0, wear: 0, under: 0 }); }
    else if (D.style === "warehouse" || D.style === "lab") { B.cyl("metal", 0, 0, 0, 0.08, 0.26, 0.2, "#3f6f5a", { seg: 16 }); B.sphere("glow", 0, 0.02, 0, 0.07, WARM); }
    else { B.cyl("paint", 0, 0.02, 0, 0.07, 0.22, 0.2, pc(D.style, it.c + 1), { seg: 16 }); B.sphere("glow", 0, 0.03, 0, 0.075, WARM); }
    D.lights.push({ x: 0, y: 0, z: 0, r: big ? 3.2 : 2.8, c: new THREE.Color(1, 0.85, 0.6), floor: true });
  },
  "tv-stand"(D, it) {
    const [w, h, d] = W(it), col = WOOD[it.c % 4], B = D.B;
    legs4(D, w, d, 0.12, 0.05, shade(col, 0.8), 0.05, "wood", 0.7);
    B.box("wood", 0, 0.12, 0, w, h - 0.12, d, col);
    for (const sx of [-1, 1]) B.box("paint", sx * w / 4, 0.16, d / 2 + 0.005, w / 2 - 0.06, h - 0.2, 0.02, pc(D.style, it.c + 2), { b: 0.006 });
    // radio + record box
    B.box("wood", -w * 0.22, h, 0, 0.42, 0.24, 0.2, WOOD[1], { b: 0.04 });
    B.box("fabric", -w * 0.22 - 0.07, h + 0.04, 0.1, 0.2, 0.16, 0.01, "#d8c7a0", { b: 0.004, wear: 0 });
    B.cyl("paint", -w * 0.22 + 0.13, h + 0.12, 0.105, 0.035, 0.035, 0.02, "#f1c232", { rx: Math.PI / 2, seg: 10 });
    books(D, w * 0.1, w * 0.42, h, 0, 0.2, 0.24);
  },
  // ------------------------------------------------------------------------------------------ shop
  "shop-counter"(D, it) {
    const [w, h, d] = W(it), col = pc(D.style, it.c), B = D.B;
    B.box("paint", 0, 0, 0, w, h - 0.06, d - 0.04, col, { grime: 0.25, b: 0.03 });
    for (let i = 0; i < Math.round(w / 0.6); i++) { const pw = w / Math.round(w / 0.6); B.box("paint", -w / 2 + pw * (i + 0.5), 0.12, d / 2 - 0.015, pw - 0.08, h - 0.32, 0.02, shade(col, 1.1), { b: 0.01 }); }
    B.box("wood", 0, h - 0.06, 0, w + 0.06, 0.06, d + 0.02, WOOD[0], { b: 0.02 });
    B.box("paint", 0, 0, d / 2 - 0.03, w, 0.1, 0.03, shade(col, 0.6), { wear: 0 });
    fruitPile(D, w * 0.25, h, 0, 0.35, 0.25, "banana", 6);
    B.box("paint", w * 0.05, h, 0.05, 0.3, 0.04, 0.2, "#f7f2e6", { b: 0.006 });
  },
  register(D, it) {
    const B = D.B;
    B.box("metal", 0, 0, 0, 0.4, 0.1, 0.38, "#3f4a4c", { b: 0.02 });
    B.box("metal", 0, 0.1, -0.06, 0.34, 0.12, 0.22, "#c94f3c", { b: 0.02, rx: -0.3 });
    B.box("glow", 0, 0.26, -0.13, 0.2, 0.06, 0.02, new THREE.Color(0.3, 1.1, 0.5), { b: 0, rx: -0.3, wear: 0 });
    for (let i = 0; i < 9; i++) B.box("paint", -0.1 + (i % 3) * 0.06, 0.18 + Math.floor(i / 3) * 0.02, 0.02 + Math.floor(i / 3) * -0.04, 0.045, 0.02, 0.035, "#e9e1d0", { b: 0.004, rx: -0.3 });
  },
  "shelf-goods"(D, it) {
    const [w, h, d] = W(it), B = D.B, col = D.style === "shop" ? "#dfe6e8" : pc(D.style, it.c);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box("metal", sx * (w / 2 - 0.025), 0, sz * (d / 2 - 0.025), 0.04, h, 0.04, "#6f7f86", { b: 0.008 });
    B.box("metal", 0, 0.05, -d / 2 + 0.01, w - 0.06, h - 0.05, 0.015, shade(col, 0.9), { b: 0, wear: 0 });
    const n = Math.max(2, Math.round(h / 0.45)), sh = (h - 0.08) / n, r = D.rng;
    for (let i = 0; i < n; i++) {
      const y = 0.06 + i * sh;
      B.box("metal", 0, y, 0, w - 0.04, 0.03, d - 0.02, col, { b: 0.008 });
      B.box("paint", 0, y - 0.005, d / 2 - 0.005, w - 0.04, 0.05, 0.012, pc(D.style, it.c + i), { b: 0, wear: 0 });
      // goods
      let x = -w / 2 + 0.06;
      while (x < w / 2 - 0.1) {
        const kind = r(), gw = kind < 0.5 ? 0.16 + r() * 0.08 : 0.09, gh = Math.min(sh - 0.08, kind < 0.5 ? 0.2 + r() * 0.12 : 0.13), cell = Math.floor(r() * 16);
        if (r() < 0.1) { x += 0.12; continue; }
        const rows = d > 0.4 ? 2 : 1;
        for (let k = 0; k < rows; k++) {
          const z = rows === 2 ? (k ? -d * 0.2 : d * 0.18) : 0;
          if (kind < 0.5) B.push("goods", boxGeo(gw, gh, 0.12), B.M(x + gw / 2, y + 0.03 + gh / 2, z, (r() - 0.5) * 0.1), "#ffffff", { uv: "rect", rect: goodsRect(cell), wear: 0.1 });
          else B.cyl("goods", x + gw / 2, y + 0.03, z, gw / 2, gw / 2, gh, "#ffffff", { seg: 10, uv: "rect", rect: goodsRect(cell) });
        }
        x += gw + 0.015;
      }
    }
    B.box("metal", 0, h - 0.03, 0, w, 0.03, d, shade(col, 1.05), { b: 0.008 });
  },
  "fruit-display"(D, it) {
    const [w, h, d] = W(it), B = D.B, col = WOOD[[0, 2, 0, 2][it.c % 4]];
    const tiers = 3, td = d / tiers;
    for (let i = 0; i < tiers; i++) {
      const z = d / 2 - td * (i + 0.5), top = h * (0.45 + i * 0.25);
      B.box("wood", 0, 0, z, w, top, td, shade(col, 1 - i * 0.05), { grime: 0.2 });
      B.box("wood", 0, top, z, w - 0.04, 0.08, td - 0.04, shade(col, 0.8), { b: 0.01 });
      const kinds = ["banana", "mango", "lime"] as const;
      for (let k = 0; k < 2; k++) {
        const kind = kinds[(it.c + i + k) % 3];
        B.box("paint", (k - 0.5) * w * 0.5, top + 0.02, z, w * 0.46, 0.05, td * 0.78, kind === "banana" ? "#d9a82a" : kind === "mango" ? "#c9582a" : "#5f9a3a", { b: 0.02, wear: 0 });
        fruitPile(D, (k - 0.5) * w * 0.5, top + 0.05, z, w * 0.45, td * 0.8, kind, 9);
      }
      B.box("paint", w * 0.3, top - 0.12, z + td / 2 + 0.005, 0.14, 0.09, 0.01, "#f7f2e6", { b: 0.003, wear: 0 });
    }
  },
  cooler(D, it) {
    const [w, h, d] = W(it), B = D.B, col = it.c ? "#d9483b" : "#2f8a86";
    B.box("metal", 0, 0, 0, w, h, d, col, { b: 0.05, grime: 0.15 });
    B.box("paint", 0, 0.12, d / 2 - 0.05, w - 0.12, h - 0.4, 0.06, "#1d2a2c", { b: 0.01, wear: 0 });
    const r = D.rng;
    for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) B.cyl("goods", -w / 2 + 0.14 + i * (w - 0.28) / 5, 0.16 + row * (h - 0.44) / 4, d / 2 - 0.12, 0.04, 0.04, 0.2, "#ffffff", { seg: 8, uv: "rect", rect: goodsRect(Math.floor(r() * 16)) });
    B.box("glow", 0, h - 0.3, d / 2 - 0.035, w - 0.14, 0.03, 0.02, new THREE.Color(1.5, 1.7, 1.8), { b: 0, wear: 0 });
    B.box("glass", 0, 0.1, d / 2 - 0.012, w - 0.1, h - 0.36, 0.015, "#cfe6ee", { b: 0.004 });
    B.box("paint", 0, h - 0.22, d / 2 + 0.002, w - 0.1, 0.16, 0.01, "#f7f2e6", { b: 0.004, wear: 0 });
    D.lights.push({ x: 0, y: h * 0.5, z: d / 2 + 0.2, r: 1.2, c: new THREE.Color(0.7, 0.9, 1.0), floor: true });
  },
  sacks(D, it) {
    const [w, h, d] = W(it), B = D.B, r = D.rng;
    for (let i = 0; i < 4; i++) {
      const x = (i % 2 - 0.5) * w * 0.5, z = (Math.floor(i / 2) - 0.5) * d * 0.45;
      B.box("fabric", x, 0, z, w * 0.46, h * 0.46, d * 0.44, ["#c9a877", "#b89a6a", "#d8bf8e"][i % 3], { b: 0.06, wear: 0.1, ry: (r() - 0.5) * 0.3 });
      B.box("paint", x, h * 0.2, z + d * 0.22 + 0.001, w * 0.2, h * 0.12, 0.004, "#8a3a2a", { b: 0, wear: 0, ry: 0 });
    }
    B.box("fabric", 0, h * 0.46, 0, w * 0.5, h * 0.44, d * 0.46, "#c9a877", { b: 0.06, ry: 0.4 });
    B.cyl("fabric", 0.1, h * 0.9, 0.05, 0.05, 0.08, 0.1, "#b89a6a", { seg: 8 });
  },
  "shop-sign"(D, it) {
    const [w, h] = W(it), B = D.B;
    B.box("wood", 0, 0, -0.02, w + 0.06, h + 0.06, 0.04, WOOD[3]);
    B.push("sign", planeGeoLocal(), B.M(0, h / 2 + 0.03, 0.003, 0, 0, 0, w, h, 1), "#ffffff", { uv: "geo", wear: 0, under: 0 });
  },
  // ------------------------------------------------------------------------------------------ warehouse
  rack(D, it) {
    const [w, h, d] = W(it), B = D.B, up = ["#3f7fb0", "#2f6f9a", "#4f6f7a"][it.c % 3], beam = "#e8742a";
    const bays = Math.max(1, Math.round(w / 2.4)), bw = w / bays;
    for (let i = 0; i <= bays; i++) for (const sz of [-1, 1]) B.box("metal", -w / 2 + i * bw + (i === 0 ? 0.04 : i === bays ? -0.04 : 0), 0, sz * (d / 2 - 0.04), 0.08, h, 0.08, up, { b: 0.012, grime: 0.2 });
    for (let i = 0; i <= bays; i++) for (let k = 0; k < 4; k++) B.rod("metal", V(-w / 2 + i * bw + (i === 0 ? 0.04 : i === bays ? -0.04 : 0), 0.2 + k * (h - 0.4) / 4, -d / 2 + 0.04), V(-w / 2 + i * bw + (i === 0 ? 0.04 : i === bays ? -0.04 : 0), 0.2 + (k + 1) * (h - 0.4) / 4, d / 2 - 0.04), 0.012, up, 5);
    const levels = [0.12, h * 0.48, h - 0.12];
    const r = D.rng;
    for (const y of levels) {
      for (const sz of [-1, 1]) B.box("metal", 0, y - 0.1, sz * (d / 2 - 0.04), w - 0.02, 0.1, 0.06, beam, { b: 0.01 });
      B.box("wood", 0, y, 0, w - 0.1, 0.03, d - 0.06, WOOD[2], { b: 0.004 });
      if (y > h - 0.2) continue;
      for (let b = 0; b < bays; b++) {
        const cx = -w / 2 + bw * (b + 0.5), room = (y === levels[0] ? levels[1] : levels[2]) - y - 0.16;
        const pick = r();
        B.box("wood", cx, y + 0.03, 0, Math.min(bw - 0.2, 1.1), 0.12, d - 0.16, WOOD[0], { b: 0.01 });
        if (pick < 0.45) { // cardboard boxes
          for (let k = 0; k < 4; k++) { const bh = Math.min(room - 0.12, 0.35 + r() * 0.15) / (k < 2 ? 1 : 1); if (k >= 2 && bh * 2 > room - 0.12) continue; B.box("paint", cx + (k % 2 - 0.5) * 0.5, y + 0.15 + (k >= 2 ? bh : 0), (r() - 0.5) * 0.1, 0.46, bh, Math.min(0.8, d - 0.2), "#c9a26a", { b: 0.015, wear: 0.2, ry: (r() - 0.5) * 0.08 }); }
        } else if (pick < 0.75) { // wrapped pallet
          B.box("glass", cx, y + 0.15, 0, Math.min(bw - 0.25, 1.0), Math.min(room - 0.1, 0.9), d - 0.25, "#dfe8ea", { b: 0.05 });
          B.box("paint", cx, y + 0.15, 0, Math.min(bw - 0.35, 0.9), Math.min(room - 0.14, 0.86), d - 0.33, pc("warehouse", Math.floor(r() * 6)), { b: 0.03 });
        } else { // drums
          for (let k = 0; k < 2; k++) B.cyl("metal", cx + (k - 0.5) * 0.55, y + 0.15, 0, 0.26, 0.26, Math.min(room - 0.1, 0.85), ["#3f7fb0", "#c94f3c", "#e8a33a"][Math.floor(r() * 3)], { seg: 14 });
        }
      }
    }
  },
  crate(D, it) { crate(D, it.w, it.h, it.d, 0, it.c); },
  "crate-stack"(D, it) { crate(D, it.w, it.h / 2, it.d, 0, it.c); crate(D, it.w * 0.92, it.h / 2, it.d * 0.92, it.h / 2, it.c + 1, 0.15); },
  barrel(D, it) {
    const [w, h] = W(it), B = D.B, r = w / 2;
    if (D.style === "hut" || D.style === "cabin") {
      B.cyl("wood", 0, 0, 0, r * 0.97, r * 0.85, h / 2, WOOD[it.c % 4], { seg: 14, grime: 0.2 });
      B.cyl("wood", 0, h / 2, 0, r * 0.85, r * 0.97, h / 2, WOOD[it.c % 4], { seg: 14 });
      for (const y of [0.08, h / 2 - 0.02, h - 0.1]) B.cyl("metal", 0, y, 0, r * (y > 0.2 && y < h - 0.2 ? 1.0 : 0.9), r * (y > 0.2 && y < h - 0.2 ? 1.0 : 0.9), 0.04, "#4a4a48", { seg: 14 });
      B.cyl("wood", 0, h - 0.02, 0, r * 0.84, r * 0.84, 0.02, shade(WOOD[it.c % 4], 0.8), { seg: 14 });
    } else {
      const col = ["#3f7fb0", "#c94f3c", "#e8a33a", "#4f8a52"][it.c % 4];
      B.cyl("metal", 0, 0, 0, r, r, h, col, { seg: 16, grime: 0.25 });
      for (const y of [h * 0.33, h * 0.66]) B.cyl("metal", 0, y, 0, r + 0.012, r + 0.012, 0.03, shade(col, 0.8), { seg: 16 });
      B.cyl("metal", 0, h - 0.01, 0, r * 0.95, r * 0.95, 0.015, shade(col, 1.1), { seg: 16 });
      B.cyl("metal", r * 0.45, h, 0, 0.04, 0.04, 0.02, "#888", { seg: 8 });
      B.box("paint", 0, h * 0.4, r + 0.002, r * 0.8, h * 0.16, 0.005, "#f7f2e6", { b: 0, wear: 0 });
    }
  },
  pallet(D, it) { pallet(D, it.w, it.h, it.d); },
  workbench(D, it) {
    const [w, h, d] = W(it), B = D.B;
    B.box("wood", 0, h - 0.07, 0, w, 0.07, d, WOOD[0], { b: 0.015, grime: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box("metal", sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), 0.06, h - 0.07, 0.06, "#4f6f7a", { b: 0.01 });
    B.box("wood", 0, 0.18, 0, w - 0.1, 0.03, d - 0.1, WOOD[1]);
    B.box("metal", w / 2 - 0.2, h, d / 2 - 0.12, 0.18, 0.12, 0.14, "#3f7fb0", { b: 0.02 });   // vice
    B.box("metal", -w * 0.2, h, 0, 0.42, 0.16, 0.22, "#c94f3c", { b: 0.025 });                 // toolbox
    B.box("metal", -w * 0.2, h + 0.16, 0, 0.3, 0.03, 0.03, "#333", { b: 0.008 });
    B.box("wood", w * 0.08, h, 0.12, 0.3, 0.03, 0.04, WOOD[2], { b: 0.008, ry: 0.4 });
    for (let k = 0; k < 3; k++) B.cyl("paint", -w / 2 + 0.2 + k * 0.12, 0.21, 0, 0.05, 0.05, 0.14, ["#e8a33a", "#3f7fb0", "#7a8a52"][k], { seg: 10 });
  },
  toolboard(D, it) {
    const [w, h] = W(it), B = D.B;
    B.box("paint", 0, 0, -0.01, w, h, 0.02, "#c9a877", { b: 0.005, wear: 0.1 });
    const r = D.rng;
    for (let i = 0; i < 7; i++) { const x = -w / 2 + 0.15 + i * (w - 0.3) / 6, len = 0.2 + r() * 0.25; B.box("metal", x, h * 0.2 + r() * 0.2, 0.012, 0.03, len, 0.02, i % 2 ? "#c94f3c" : "#555", { b: 0.006 }); B.box("metal", x, h * 0.2 + len, 0.012, 0.08, 0.04, 0.025, "#777", { b: 0.006 }); }
  },
  forklift(D, it) {
    // counterbalance forklift: rounded counterweight + engine hood with the seat on it, overhead guard on 4 posts, the mast
    // (two channels + tie bars) with the fork carriage lowered, bigger drive wheels at the front, an amber beacon in a
    // housing ON the guard roof
    const [w, h, d] = W(it), B = D.B, y = it.c ? "#e8b020" : "#e8742a", dark = "#2c2e30", steel = "#5a5e62";
    const rear = -d / 2, bodyEnd = d / 2 - 1.15;
    // wheels: front drive (r 0.3), rear steer (r 0.24), rims + hub caps
    for (const [z, rr] of [[bodyEnd - 0.35, 0.3], [rear + 0.45, 0.24]] as Array<[number, number]>) for (const sx of [-1, 1]) {
      B.cyl("fabric", sx * (w / 2 - 0.12), rr, z, rr, rr, 0.22, "#1e1e1e", { rz: Math.PI / 2, seg: 18 });
      B.cyl("metal", sx * (w / 2 - 0.12) + sx * 0.012, rr, z, rr * 0.55, rr * 0.55, 0.21, "#c9ccce", { rz: Math.PI / 2, seg: 12 });
      B.cyl("metal", sx * (w / 2 - 0.12) + sx * 0.11, rr, z, rr * 0.2, rr * 0.2, 0.02, "#333", { rz: Math.PI / 2, seg: 8 });
    }
    // chassis + fenders
    B.box("metal", 0, 0.16, (rear + bodyEnd) / 2, w - 0.34, 0.3, bodyEnd - rear - 0.1, dark, { b: 0.05 });
    for (const sx of [-1, 1]) B.box("metal", sx * (w / 2 - 0.12), 0.56, bodyEnd - 0.35, 0.26, 0.06, 0.72, y, { b: 0.02 });
    // counterweight: a rounded block at the back
    B.box("metal", 0, 0.2, rear + 0.3, w - 0.06, 0.78, 0.6, "#34383b", { b: 0.16, grime: 0.25 });
    B.cyl("metal", 0, 0.98, rear + 0.3, 0.14, 0.14, 0.04, "#e8b020", { seg: 12 });
    // hood (engine cover) sloping up to the seat, the dashboard + steering wheel
    B.box("metal", 0, 0.42, rear + 0.95, w - 0.12, 0.52, 1.05, y, { b: 0.09, grime: 0.18 });
    B.box("metal", 0, 0.94, rear + 0.95, w - 0.36, 0.04, 0.9, shade(y, 0.85), { b: 0.015 });
    B.box("fabric", 0, 0.98, rear + 0.95, 0.5, 0.1, 0.46, "#222", { b: 0.05 });
    B.box("fabric", 0, 1.06, rear + 0.7, 0.5, 0.42, 0.1, "#222", { b: 0.05, rx: -0.15 });
    B.box("metal", 0, 0.42, bodyEnd - 0.12, w - 0.3, 0.72, 0.22, y, { b: 0.05 });
    B.rod("metal", V(0, 1.0, bodyEnd - 0.18), V(0, 1.28, bodyEnd - 0.34), 0.022, "#333", 6);
    B.push("metal", torusGeo(0.15, 0.018, 16), B.M(0, 1.3, bodyEnd - 0.35, 0, -1.0, 0), "#222", { uv: "box", wear: 0 });
    // overhead guard: 4 posts, a slatted roof
    const gz0 = rear + 0.5, gz1 = bodyEnd - 0.05, gy = h - 0.2;
    for (const sx of [-1, 1]) for (const z of [gz0, gz1]) B.rod("metal", V(sx * (w / 2 - 0.1), 0.9, z), V(sx * (w / 2 - 0.1), gy, z + (z === gz1 ? -0.05 : 0)), 0.035, dark, 8);
    for (const sx of [-1, 1]) B.box("metal", sx * (w / 2 - 0.1), gy, (gz0 + gz1) / 2, 0.07, 0.07, gz1 - gz0 + 0.1, dark, { b: 0.015 });
    for (let k = 0; k < 6; k++) B.box("metal", 0, gy + 0.01, gz0 + (k + 0.5) * (gz1 - gz0) / 6, w - 0.16, 0.04, 0.05, dark, { b: 0.01 });
    // amber beacon on the roof: a housing, the lens, the glow
    B.cyl("metal", 0.25, gy + 0.07, gz0 + 0.15, 0.07, 0.08, 0.05, "#222", { seg: 12 });
    B.cyl("glass", 0.25, gy + 0.12, gz0 + 0.15, 0.055, 0.06, 0.08, "#e8a020", { seg: 12 });
    B.sphere("glow", 0.25, gy + 0.17, gz0 + 0.15, 0.05, new THREE.Color(2.4, 1.3, 0.25), { sy: 0.9 });
    // mast: two channels + tie bars, the carriage with its backrest, forks on the floor
    const mz = d / 2 - 1.02;
    for (const sx of [-1, 1]) { B.box("metal", sx * 0.34, 0.08, mz, 0.1, h - 0.12, 0.14, steel, { b: 0.015, grime: 0.2 }); B.box("metal", sx * 0.24, 0.08, mz + 0.04, 0.07, h - 0.3, 0.1, shade(steel, 1.15), { b: 0.012 }); }
    for (const yy of [0.5, h * 0.55, h - 0.12]) B.box("metal", 0, yy, mz, 0.78, 0.07, 0.12, steel, { b: 0.012 });
    for (const sx of [-1, 1]) B.rod("metal", V(sx * 0.12, 0.6, mz - 0.1), V(sx * 0.12, h * 0.55, mz - 0.1), 0.025, "#8a8e92", 6);
    B.box("metal", 0, 0.06, mz + 0.1, 0.86, 0.36, 0.06, "#3a3d40", { b: 0.012 });
    for (let k = 0; k < 5; k++) B.box("metal", -0.36 + k * 0.18, 0.42, mz + 0.1, 0.03, 0.62, 0.03, "#3a3d40", { b: 0.006 });
    B.box("metal", 0, 1.02, mz + 0.1, 0.86, 0.04, 0.04, "#3a3d40", { b: 0.008 });
    for (const sx of [-1, 1]) { B.box("metal", sx * 0.26, 0.02, mz + 0.12 + 0.5, 0.11, 0.05, 1.0, "#44484c", { b: 0.01 }); B.box("metal", sx * 0.26, 0.02, mz + 0.14, 0.11, 0.34, 0.05, "#44484c", { b: 0.01 }); }
    // decals: a load-plate, warning chevrons on the counterweight
    B.box("paint", 0.2, 0.62, rear + 1.3, 0.2, 0.14, 0.005, "#f2efe4", { b: 0, wear: 0, ry: -Math.PI / 2, rz: 0 });
    for (let k = 0; k < 4; k++) B.box("paint", -0.32 + k * 0.2, 0.55, rear - 0.005, 0.1, 0.28, 0.01, k % 2 ? "#1c1c1c" : "#f1c232", { b: 0, wear: 0, rz: 0.5 });
    D.lights.push({ x: 0.25, y: gy + 0.2, z: gz0 + 0.15, r: 1.2, c: new THREE.Color(1, 0.6, 0.15), wash: false });
  },
  // ------------------------------------------------------------------------------------------ lab
  "server-rack"(D, it) {
    const [w, h, d] = W(it), B = D.B;
    B.box("metal", 0, 0, 0, w, h, d, "#3a4550", { b: 0.03, wear: 0.3, edge: new THREE.Color("#a8bcc4") });
    for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) B.box("paint", sx * (w / 2 + 0.002), 0.3 + k * (h - 0.6) / 6, 0, 0.004, 0.05, d * 0.7, "#1f262c", { b: 0, wear: 0 });
    B.box("metal", 0, h - 0.06, 0, w + 0.02, 0.06, d + 0.02, "#2fb3a8", { b: 0.012 });
    B.box("paint", 0, h * 0.3, d / 2 + 0.03, w * 0.5, 0.05, 0.005, "#f7f2e6", { b: 0, wear: 0 });
    B.box("metal", 0, 0.08, d / 2 - 0.02, w - 0.08, h - 0.16, 0.04, "#1c2226", { b: 0.01, wear: 0.1 });
    const units = Math.floor((h - 0.3) / 0.11), r = D.rng;
    for (let i = 0; i < units; i++) {
      const y = 0.14 + i * 0.11;
      B.box("metal", 0, y, d / 2 + 0.005, w - 0.14, 0.09, 0.012, i % 3 ? "#39434a" : "#44515a", { b: 0.004, wear: 0 });
      for (let k = 0; k < 4; k++) if (r() < 0.7) B.box("glow", -w / 2 + 0.12 + k * 0.035, y + 0.03, d / 2 + 0.013, 0.014, 0.014, 0.005, r() < 0.75 ? TEAL : new THREE.Color(1.8, 0.8, 0.2), { b: 0, wear: 0, under: 0 });
      if (r() < 0.5) B.box("metal", w * 0.15, y + 0.02, d / 2 + 0.012, w * 0.35, 0.05, 0.005, "#222a2e", { b: 0, wear: 0 });
    }
    for (const sx of [-1, 1]) B.box("glow", sx * (w / 2 - 0.035), 0.1, d / 2 + 0.004, 0.012, h - 0.2, 0.01, TEAL, { b: 0, wear: 0, under: 0 });
    B.box("metal", 0, h, 0, w * 0.6, 0.02, d * 0.6, "#555", { b: 0.004 });
    D.lights.push({ x: 0, y: 0.05, z: d / 2 + 0.4, r: 1.4, c: new THREE.Color(0.3, 1.0, 0.95), floor: true });
  },
  desk(D, it) {
    const [w, h, d] = W(it), col = it.c ? "#e9eef0" : WOOD[0], key: MatKey = it.c ? "paint" : "wood", B = D.B;
    B.box(key, 0, h - 0.04, 0, w, 0.04, d, col, { b: 0.012 });
    B.box("metal", -w / 2 + 0.03, 0, 0, 0.04, h - 0.04, d - 0.08, "#4f5a60", { b: 0.01 });
    B.box("paint", w / 2 - 0.22, 0, 0.02, 0.4, h - 0.06, d - 0.12, "#dfe6e8", { b: 0.02, grime: 0.15 });
    for (let i = 0; i < 3; i++) { B.box("paint", w / 2 - 0.22, 0.05 + i * (h - 0.1) / 3, d / 2 - 0.035, 0.36, (h - 0.1) / 3 - 0.03, 0.02, "#cfd8da", { b: 0.006 }); B.box("metal", w / 2 - 0.22, 0.05 + (i + 0.5) * (h - 0.1) / 3, d / 2 - 0.02, 0.1, 0.015, 0.015, "#555", { b: 0.003 }); }
    B.box("paint", 0, h, d / 2 - 0.2, 0.44, 0.02, 0.15, "#2b3238", { b: 0.006 });
    B.box("paint", 0.34, h, d / 2 - 0.2, 0.07, 0.02, 0.1, "#2b3238", { b: 0.006 });
    B.cyl("paint", -w / 2 + 0.2, h, 0.1, 0.04, 0.035, 0.1, pc("lab", 2), { seg: 10 });
    B.box("paint", -w / 2 + 0.35, h, -0.05, 0.22, 0.03, 0.3, "#f7f2e6", { b: 0.004, ry: 0.2 });
  },
  monitor(D, it) {
    const B = D.B;
    B.box("metal", 0, 0, -0.02, 0.2, 0.015, 0.14, "#2b3238", { b: 0.005 });
    B.box("metal", 0, 0.015, -0.05, 0.04, 0.16, 0.03, "#2b3238", { b: 0.008 });
    B.box("metal", 0, 0.12, -0.03, 0.6, 0.36, 0.035, "#1f2529", { b: 0.012, rx: -0.08 });
    const cell = D.style === "lab" ? [0, 1, 2, 3, 5][Math.floor(it.v * 5)] : [6, 7, 2, 4][Math.floor(it.v * 4)];
    B.push("screen", planeGeoLocal(), B.M(0, 0.3, -0.011, 0, -0.08, 0, 0.55, 0.31, 1), new THREE.Color(1.25, 1.25, 1.25), { uv: "rect", rect: screenRect(cell), wear: 0, under: 0 });
    D.lights.push({ x: 0, y: 0.3, z: 0.3, r: 0.9, c: new THREE.Color(0.4, 0.9, 1.0) });
  },
  "office-chair"(D, it) {
    const [w, h, d] = W(it), f = it.c ? "#2f8a86" : "#39434a", B = D.B;
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; B.rod("metal", V(0, 0.08, 0), V(Math.cos(a) * w * 0.42, 0.05, Math.sin(a) * d * 0.42), 0.022, "#333", 6); B.sphere("fabric", Math.cos(a) * w * 0.42, 0.035, Math.sin(a) * d * 0.42, 0.035, "#222", { detail: 0 }); }
    B.cyl("metal", 0, 0.08, 0, 0.03, 0.03, 0.34, "#888", { seg: 8 });
    B.box("fabric", 0, 0.42, 0.03, w - 0.06, 0.09, d - 0.1, f, { b: 0.04 });
    B.box("fabric", 0, 0.55, -d / 2 + 0.07, w - 0.12, h - 0.58, 0.08, f, { b: 0.04, rx: -0.1 });
    for (const sx of [-1, 1]) B.box("metal", sx * (w / 2 - 0.05), 0.5, 0.02, 0.04, 0.2, 0.3, "#333", { b: 0.01 });
  },
  "lab-bench"(D, it) {
    const [w, h, d] = W(it), B = D.B, r = D.rng;
    B.box("paint", 0, 0.08, 0, w - 0.04, h - 0.12, d - 0.04, "#e9eef0", { b: 0.02, grime: 0.12 });
    B.box("paint", 0, 0, 0.0, w - 0.1, 0.08, d - 0.12, "#3f5f6b", { wear: 0 });
    const n = Math.round(w / 0.6);
    for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n; B.box("paint", x, 0.12, d / 2 - 0.012, w / n - 0.05, h - 0.2, 0.02, "#dfe6e8", { b: 0.008 }); B.box("metal", x, h - 0.2, d / 2 + 0.005, 0.12, 0.018, 0.018, "#555", { b: 0.004 }); }
    B.box("paint", 0, h - 0.04, 0, w, 0.04, d, "#1f2a2e", { b: 0.012 });
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 0.25 + r() * (w - 0.5), z = (r() - 0.5) * (d - 0.3);
      if (i % 3 === 0) { B.cyl("glass", x, h, z, 0.05, 0.08, 0.16, "#cfe6ee", { seg: 10 }); B.cyl("glow", x, h + 0.005, z, 0.07, 0.078, 0.06, i % 2 ? TEAL : new THREE.Color(1.6, 0.6, 1.4), { seg: 10 }); }
      else if (i % 3 === 1) { B.cyl("glass", x, h, z, 0.04, 0.04, 0.2, "#cfe6ee", { seg: 8 }); }
      else { B.box("metal", x, h, z, 0.16, 0.05, 0.2, "#dfe6e8", { b: 0.01 }); B.rod("metal", V(x, h + 0.05, z - 0.06), V(x, h + 0.28, z - 0.02), 0.02, "#dfe6e8", 6); B.cyl("metal", x, h + 0.18, z + 0.02, 0.022, 0.02, 0.12, "#333", { seg: 8, rx: 0.3 }); }
    }
    B.box("metal", w * 0.35, h, -d / 2 + 0.06, 0.03, 0.4, 0.03, "#c8cccc", { b: 0.006 });
    B.box("metal", w * 0.35, h + 0.37, -d / 2 + 0.12, 0.03, 0.03, 0.14, "#c8cccc", { b: 0.006 });
    D.lights.push({ x: 0, y: h, z: 0, r: 1.0, c: new THREE.Color(0.4, 1.0, 0.95) });
  },
  locker(D, it) {
    const [w, h, d] = W(it), col = ["#3f7fb0", "#2f8a86", "#9aa7ad"][it.c % 3], B = D.B;
    B.box("metal", 0, 0, 0, w - 0.01, h, d, col, { b: 0.015, grime: 0.2 });
    B.box("metal", 0, 0.05, d / 2 + 0.003, w - 0.06, h - 0.1, 0.012, shade(col, 1.07), { b: 0.006 });
    for (let i = 0; i < 4; i++) B.box("paint", 0, h - 0.25 - i * 0.04, d / 2 + 0.01, w * 0.5, 0.012, 0.005, "#1c2226", { b: 0, wear: 0 });
    for (let i = 0; i < 4; i++) B.box("paint", 0, 0.2 + i * 0.04, d / 2 + 0.01, w * 0.5, 0.012, 0.005, "#1c2226", { b: 0, wear: 0 });
    B.box("metal", w / 2 - 0.08, h * 0.5, d / 2 + 0.018, 0.025, 0.12, 0.02, "#c8cccc", { b: 0.005 });
    B.box("paint", 0, h - 0.12, d / 2 + 0.01, 0.12, 0.05, 0.005, "#f7f2e6", { b: 0, wear: 0 });
  },
  whiteboard(D, it) {
    const [w, h] = W(it), B = D.B;
    if (it.c === 1) {
      // cork notice board (dock office): tide tables, notes, a photo, pins
      B.box("wood", 0, 0, -0.015, w, h, 0.03, WOOD[1], { b: 0.01 });
      B.box("fabric", 0, 0.04, 0.0, w - 0.08, h - 0.08, 0.012, "#b98a52", { b: 0.003, wear: 0 });
      const r = D.rng, cols = ["#f7f2e6", "#f1e27a", "#9fd6c8", "#f2b8a8", "#f7f2e6"];
      for (let k = 0; k < 9; k++) { const pw = 0.14 + r() * 0.12, ph = 0.1 + r() * 0.14, x = (r() - 0.5) * (w - pw - 0.14), y = 0.08 + r() * (h - ph - 0.18); B.box("paint", x, y, 0.012, pw, ph, 0.004, cols[k % 5], { b: 0, wear: 0, rz: (r() - 0.5) * 0.25 }); B.sphere("paint", x, y + ph - 0.02, 0.02, 0.012, ["#d9483b", "#3a86c8", "#2fb3a8"][k % 3], { detail: 0 }); }
      B.push("art", planeGeoLocal(), B.M(w * 0.28, h * 0.55, 0.016, 0, 0, 0.08, 0.26, 0.2, 1), "#ffffff", { uv: "rect", rect: artRect(3), wear: 0, under: 0 });
      return;
    }
    B.box("metal", 0, 0, -0.015, w, h, 0.03, "#c8cccc", { b: 0.01 });
    B.push("art", planeGeoLocal(), B.M(0, h / 2, 0.002, 0, 0, 0, w - 0.06, h - 0.06, 1), "#ffffff", { uv: "rect", rect: artRect(7), wear: 0, under: 0 });
    B.box("metal", 0, -0.04, 0.03, w * 0.6, 0.03, 0.06, "#c8cccc", { b: 0.008 });
  },
  "cable-tray"(D, it) {
    const B = D.B, w = it.w, h = it.h;
    for (const sx of [-1, 1]) B.rod("metal", V(sx * w * 0.4, h, 0), V(sx * w * 0.4, 0.05, 0), 0.01, "#555", 5);
    B.box("metal", 0, 0, 0, w, 0.06, 0.32, "#9aa7ad", { b: 0.008 });
    for (let k = 0; k < 4; k++) B.cyl("fabric", 0, 0.05, -0.1 + k * 0.065, 0.022, 0.022, w - 0.04, ["#222", "#2f8a86", "#c94f3c", "#222"][k], { rz: Math.PI / 2, seg: 6 });
  },
  // ------------------------------------------------------------------------------------------ hut / cabin
  hammock(D, it) {
    // two timber posts, a striped cloth that SAGS: a catenary along its length, curling up at both edges across it, the
    // ends gathered to rope fans at the spreader bars (not a rigid trough of boxes)
    const [w, , d] = W(it), B = D.B, f = FABRIC[it.c % FABRIC.length], top = 1.2, sag = 0.52, span = w - 0.7;
    for (const sx of [-1, 1]) { B.box("wood", sx * (w / 2 - 0.06), 0, 0, 0.12, top + 0.25, 0.12, WOOD[1], { b: 0.025, grime: 0.2 }); B.box("wood", sx * (w / 2 - 0.06), top + 0.25, 0, 0.16, 0.06, 0.16, WOOD[3], { b: 0.015 }); }
    const half = d * 0.46;
    const at = (u: number, v: number): [number, number, number] => {
      const x = -span / 2 + u * span, s2 = Math.pow(2 * u - 1, 2), open = 1 - s2;          // 0 at the bars, 1 mid
      const acr = (v - 0.5) * 2, z = acr * half * (0.35 + 0.65 * open);
      const y = top - sag * (1 - s2) + (acr * acr) * 0.2 * open - 0.02 * Math.sin(u * Math.PI * 6) * open * (1 - Math.abs(acr));
      return [x, y, z];
    };
    const g = surface(at, 18, 8);
    // stripes across the cloth: 4 bands of the palette through the uv v (painted per vertex: split the surface)
    B.push("cloth", g, null, f, { uv: "geo", uvScale: 2, wear: 0, under: 0.15 });
    for (const vv of [0.18, 0.5, 0.82]) {
      const st = surface((u, v) => { const p = at(u, vv - 0.035 + v * 0.07); return [p[0], p[1] + 0.006, p[2]]; }, 18, 1);
      B.push("cloth", st, null, vv === 0.5 ? "#f2e3c7" : shade(f, 0.7), { uv: "geo", wear: 0, under: 0 });
    }
    for (const sx of [-1, 1]) {
      B.cbox("wood", sx * span / 2, top + 0.02, 0, 0.04, 0.04, half * 0.8, WOOD[2], { b: 0.01 });
      for (const z of [-0.3, -0.1, 0.1, 0.3]) B.rod("fabric", V(sx * span / 2, top + 0.02, z * half * 2 * 0.4 / 0.3 * 0.3), V(sx * (w / 2 - 0.1), top + 0.18, 0), 0.008, "#d8c7a0", 4);
    }
  },
  net(D, it) {
    const [w, h] = W(it), B = D.B, r = D.rng;
    const nx = 8, ny = 6;
    for (let i = 0; i <= nx; i++) B.rod("fabric", V(-w / 2 + i * w / nx, h, 0.01), V(-w / 2 + i * w / nx + (r() - 0.5) * 0.1, 0.1 + Math.sin(i / nx * Math.PI) * 0.15, 0.03), 0.006, "#6a5a3a", 3);
    for (let j = 0; j <= ny; j++) { const y = 0.1 + j * (h - 0.1) / ny + Math.sin(j) * 0.02; B.rod("fabric", V(-w / 2, y, 0.02), V(w / 2, y + (r() - 0.5) * 0.06, 0.02), 0.006, "#6a5a3a", 3); }
    for (let k = 0; k < 4; k++) B.sphere("paint", -w / 2 + 0.2 + k * (w - 0.4) / 3, h - 0.05, 0.05, 0.06, "#e8742a", { detail: 1 });
    B.box("wood", 0, h - 0.02, 0.02, w + 0.1, 0.05, 0.05, WOOD[1], { b: 0.01 });
  },
  "wood-stove"(D, it) {
    const [w, h, d] = W(it), B = D.B;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box("metal", sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), 0.06, 0.16, 0.06, "#2c2a28", { b: 0.01 });
    B.box("metal", 0, 0.16, 0, w, h - 0.2, d, "#34302c", { b: 0.04, wear: 0.25, edge: new THREE.Color("#8a7a6a") });
    B.box("metal", 0, h - 0.06, 0, w + 0.04, 0.06, d + 0.04, "#2c2a28", { b: 0.015 });
    B.box("metal", 0, 0.28, d / 2 + 0.005, w * 0.6, h * 0.42, 0.02, "#2c2a28", { b: 0.01 });
    B.box("glow", 0, 0.34, d / 2 + 0.006, w * 0.42, h * 0.22, 0.01, new THREE.Color(1.2, 0.35, 0.08), { b: 0, wear: 0, under: 0 });
    flame(D, 0, 0.3, d / 2 + 0.03, w * 0.3, h * 0.24, 0.8);
    B.box("glass", 0, 0.33, d / 2 + 0.05, w * 0.46, h * 0.25, 0.008, "#6a4a3a", { b: 0.002, wear: 0 });
    B.cyl("metal", 0, h, -d * 0.15, 0.08, 0.08, Math.max(0.2, D.ceil - h), "#2c2a28", { seg: 12 });
    B.cyl("metal", 0.12, h, 0.1, 0.1, 0.09, 0.14, "#4a4a48", { seg: 12 }); // kettle
    D.lights.push({ x: 0, y: 0.35, z: d / 2 + 0.25, r: 2.2, c: new THREE.Color(1, 0.55, 0.2), floor: true });
  },
  stool(D, it) {
    const [w, h] = W(it), B = D.B;
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; B.rod("wood", V(Math.cos(a) * w * 0.2, h - 0.04, Math.sin(a) * w * 0.2), V(Math.cos(a) * w * 0.4, 0, Math.sin(a) * w * 0.4), 0.02, WOOD[1], 6); }
    B.cyl("wood", 0, h - 0.05, 0, w / 2, w / 2 - 0.02, 0.05, WOOD[2], { seg: 14 });
  },
  mat(D, it) {
    const [w, h, d] = W(it), B = D.B, f = FABRIC[it.c % FABRIC.length];
    B.box("fabric", 0, 0, 0, w, h * 0.6, d, "#d8c7a0", { b: 0.03 });
    B.box("fabric", 0, h * 0.6, 0.15, w + 0.02, 0.04, d * 0.6, f, { b: 0.02 });
    B.box("fabric", 0, h * 0.6, -d / 2 + 0.25, w * 0.6, 0.1, 0.3, "#f4efe6", { b: 0.04 });
  },
  lantern(D, it) {
    const B = D.B, h = it.h, hang = it.y > 1.2;
    if (hang) B.rod("metal", V(0, h, 0), V(0, 0.36, 0), 0.006, "#333", 4);
    B.cyl("metal", 0, 0, 0, 0.1, 0.11, 0.04, "#3a3a38", { seg: 10 });
    B.cyl("glow", 0, 0.04, 0, 0.065, 0.065, 0.2, WARM, { seg: 10 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.78; B.rod("metal", V(Math.cos(a) * 0.08, 0.04, Math.sin(a) * 0.08), V(Math.cos(a) * 0.08, 0.26, Math.sin(a) * 0.08), 0.008, "#3a3a38", 4); }
    B.cyl("metal", 0, 0.26, 0, 0.03, 0.1, 0.08, "#3a3a38", { seg: 10 });
    B.push("metal", torusGeoL(), B.M(0, 0.36, 0, 0, 0, 0, 1, 1, 1), "#3a3a38", { uv: "box", wear: 0 });
    D.lights.push({ x: 0, y: 0.14, z: 0, r: hang ? 3.4 : 1.5, c: new THREE.Color(1.15, 0.8, 0.45), floor: hang });
  },
  "captain-desk"(D, it) {
    const [w, h, d] = W(it), B = D.B, col = WOOD[1];
    for (const sx of [-1, 1]) {
      B.box("wood", sx * (w / 2 - 0.25), 0, 0, 0.5, h - 0.06, d, col, { b: 0.025, grime: 0.2 });
      for (let i = 0; i < 3; i++) { B.box("wood", sx * (w / 2 - 0.25), 0.08 + i * (h - 0.2) / 3, d / 2 + 0.006, 0.42, (h - 0.2) / 3 - 0.04, 0.02, shade(col, 1.12), { b: 0.008 }); knob(D, sx * (w / 2 - 0.25), 0.08 + (i + 0.5) * (h - 0.2) / 3, d / 2 + 0.03); }
    }
    B.box("wood", 0, h - 0.2, 0, w - 1.0, 0.14, d - 0.06, col);
    B.box("wood", 0, 0, -d / 2 + 0.03, w - 1.0, h - 0.2, 0.04, shade(col, 0.8));
    B.box("wood", 0, h - 0.06, 0, w + 0.06, 0.06, d + 0.06, shade(col, 1.1), { b: 0.02 });
    B.box("fabric", 0, h, 0, w - 0.4, 0.006, d - 0.3, "#2f5a3a", { b: 0.002, wear: 0 });
    B.push("art", planeGeoLocal(), B.M(-0.15, h + 0.012, 0.05, 0.1, -Math.PI / 2, 0, 0.62, 0.48, 1), "#ffffff", { uv: "rect", rect: artRect(6), wear: 0, under: 0 });
    B.cyl("metal", 0.45, h, -0.15, 0.07, 0.07, 0.03, "#c9a45a", { seg: 14 });
    B.cyl("glass", -0.55, h, -0.2, 0.04, 0.05, 0.22, "#6a8a5a", { seg: 8 });
    B.rod("paint", V(0.25, h + 0.01, 0.2), V(0.4, h + 0.12, 0.28), 0.006, "#f7f2e6", 4);
  },
  "map-table"(D, it) {
    const [w, h, d] = W(it), B = D.B, col = WOOD[3];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl("wood", sx * (w / 2 - 0.12), 0, sz * (d / 2 - 0.12), 0.05, 0.07, h - 0.08, col, { seg: 10 });
    B.box("wood", 0, 0.14, 0, w - 0.2, 0.05, d - 0.2, shade(col, 0.9));
    B.box("wood", 0, h - 0.08, 0, w, 0.08, d, col, { b: 0.025 });
    B.push("art", planeGeoLocal(), B.M(0, h + 0.004, 0, 0.05, -Math.PI / 2, 0, w - 0.25, d - 0.2, 1), "#ffffff", { uv: "rect", rect: artRect(6), wear: 0, under: 0 });
    for (const [x, z] of [[-w / 2 + 0.2, -d / 2 + 0.18], [w / 2 - 0.2, d / 2 - 0.18]]) B.cyl("metal", x, h, z, 0.05, 0.05, 0.05, "#4a4a48", { seg: 10 });
    B.cyl("metal", 0.3, h, 0.1, 0.09, 0.09, 0.02, "#c9a45a", { seg: 16 });
    B.box("metal", 0.3, h + 0.02, 0.1, 0.16, 0.005, 0.01, "#333", { b: 0, wear: 0, ry: 0.7 });
  },
  "sea-chest"(D, it) {
    const [w, h, d] = W(it), B = D.B, col = WOOD[(it.c + 1) % 4];
    B.box("wood", 0, 0, 0, w, h * 0.62, d, col, { b: 0.02, grime: 0.2 });
    B.push("wood", cylGeoL(), B.M(0, h * 0.62, 0, 0, 0, Math.PI / 2, h * 0.38 / 0.5, w - 0.01, d / 2 / 0.5), col, { uv: "box", wear: 0 });
    for (const x of [-w * 0.32, w * 0.32]) { B.box("metal", x, 0, 0, 0.05, h * 0.62 + 0.01, d + 0.02, "#4a4a48", { b: 0.008 }); B.push("metal", cylGeoL(), B.M(x, h * 0.62, 0, 0, 0, Math.PI / 2, (h * 0.38 + 0.012) / 0.5, 0.05, (d / 2 + 0.012) / 0.5), "#4a4a48", { uv: "box", wear: 0 }); }
    B.box("metal", 0, h * 0.45, d / 2 + 0.005, 0.1, 0.14, 0.02, "#c9a45a", { b: 0.006 });
    for (const sx of [-1, 1]) B.box("metal", sx * (w / 2 + 0.01), h * 0.35, 0, 0.03, 0.04, 0.16, "#4a4a48", { b: 0.006 });
  },
  chart(D, it) {
    const [w, h] = W(it), B = D.B;
    B.box("wood", 0, 0, -0.015, w, h, 0.04, WOOD[3], { b: 0.012 });
    B.push("art", planeGeoLocal(), B.M(0, h / 2, 0.007, 0, 0, 0, w - 0.1, h - 0.1, 1), "#ffffff", { uv: "rect", rect: artRect(6), wear: 0, under: 0 });
  },
  // ------------------------------------------------------------------------------------------ temple
  brazier(D, it) {
    const [w, h] = W(it), B = D.B;
    B.box("stone", 0, 0, 0, w * 0.6, h * 0.12, w * 0.6, "#8a7f6a", { b: 0.04 });
    B.cyl("stone", 0, h * 0.12, 0, w * 0.16, w * 0.22, h * 0.5, "#9c8f78", { seg: 10 });
    B.cyl("metal", 0, h * 0.62, 0, w * 0.5, w * 0.24, h * 0.24, "#6a5030", { seg: 14, grime: 0.3 });
    B.cyl("metal", 0, h * 0.84, 0, w * 0.5, w * 0.5, 0.03, "#8a6a3a", { seg: 14 });
    B.cyl("glow", 0, h * 0.84 + 0.02, 0, w * 0.44, w * 0.44, 0.02, new THREE.Color(2.2, 0.7, 0.15), { seg: 14 });   // embers
    for (let k = 0; k < 6; k++) { const a = k * 1.1; B.cbox("wood", Math.cos(a) * w * 0.16, h * 0.84 + 0.06, Math.sin(a) * w * 0.16, w * 0.42, 0.05, 0.05, "#3a2a1c", { ry: a, rz: 0.25, b: 0.01, wear: 0 }); }
    flame(D, 0, h * 0.84 + 0.03, 0, w * 0.62, 0.55, 1.1);
    flame(D, w * 0.12, h * 0.84 + 0.03, -w * 0.08, w * 0.4, 0.38, 0.8);
    D.lights.push({ x: 0, y: h + 0.2, z: 0, r: 3.8, c: new THREE.Color(1.15, 0.6, 0.23), floor: true });
  },
  altar(D, it) {
    const [w, h, d] = W(it), B = D.B;
    B.box("stone", 0, 0, 0, w, 0.2, d, "#8a7f6a", { b: 0.05, grime: 0.3 });
    B.box("stone", 0, 0.2, 0, w - 0.2, h - 0.35, d - 0.2, "#a89a80", { b: 0.05 });
    B.box("stone", 0, h - 0.15, 0, w, 0.15, d, "#b8a88a", { b: 0.05 });
    B.box("metal", 0, h * 0.45, d / 2 - 0.09, w - 0.4, 0.1, 0.02, "#d4a53a", { b: 0.01 });
    for (const sx of [-1, 1]) { B.cyl("paint", sx * (w / 2 - 0.2), h, d / 2 - 0.25, 0.04, 0.04, 0.16, "#f4efe6", { seg: 8 }); flame(D, sx * (w / 2 - 0.2), h + 0.16, d / 2 - 0.25, 0.06, 0.12, 0.7); }
    fruitPile(D, 0.4, h, 0.15, 0.35, 0.3, "banana", 6);
    D.lights.push({ x: 0, y: h, z: d / 2, r: 1.6, c: new THREE.Color(1, 0.6, 0.25) });
  },
  urn(D, it) {
    // foot → belly → neck → lip, every part seated on the one below
    const [w, h] = W(it), B = D.B, col = it.c ? "#c9744a" : "#a89a80";
    const foot = 0.07, ry = h * 0.3, yb = foot + ry - 0.025;
    B.cyl("stone", 0, 0, 0, w * 0.26, w * 0.3, foot, shade(col, 0.8), { seg: 14, grime: 0.3 });
    B.sphere("stone", 0, yb, 0, w * 0.5, col, { sx: 1, sy: ry / (w * 0.5), sz: 1, detail: 2 });
    const neck = yb + ry * 0.82;
    B.cyl("stone", 0, neck - 0.02, 0, w * 0.2, w * 0.27, h * 0.16, col, { seg: 14 });
    B.cyl("stone", 0, neck + h * 0.14 - 0.02, 0, w * 0.27, w * 0.22, h * 0.07, shade(col, 1.1), { seg: 14 });
    B.cyl("metal", 0, yb - 0.02, 0, w * 0.505, w * 0.505, 0.04, "#d4a53a", { seg: 18 });
    B.cyl("metal", 0, yb + ry * 0.5, 0, w * 0.43, w * 0.43, 0.025, "#d4a53a", { seg: 18 });
  },
  rubble(D, it) {
    const [w, h, d] = W(it), B = D.B, r = D.rng;
    for (let k = 0; k < 7; k++) {
      const s = 0.18 + r() * 0.3;
      B.cbox("stone", (r() - 0.5) * (w - s), s * 0.35 + (k > 4 ? s * 0.4 : 0), (r() - 0.5) * (d - s), s, Math.min(h, s * 0.7), s * (0.7 + r() * 0.5), ["#9c8f78", "#b8a88a", "#8a7f6a"][k % 3], { b: 0.04, ry: r() * 3, rx: (r() - 0.5) * 0.5, rz: (r() - 0.5) * 0.5 });
    }
  },
  idol(D, it) {
    // a small gilded kong idol squatting on a plinth, knuckles down, jade eyes
    const [w, h, d] = W(it), B = D.B, gold = it.c ? "#d4a53a" : "#7f9a5a", key: MatKey = it.c ? "metal" : "stone";
    B.box("stone", 0, 0, 0, w, h * 0.14, d, "#8a7f6a", { b: 0.03 });
    kongFigure(B, key, 0, h * 0.14, 0, w * 0.9, h * 0.86, gold);
    for (const sx of [-1, 1]) B.sphere("glow", sx * w * 0.9 * 0.085, h * 0.14 + h * 0.86 * 0.705, w * 0.9 * 0.23, 0.02, TEAL);
  },
  statue(D, it) {
    // a seated kong guardian carved in stone: stepped pedestal, chunky bevelled body, knuckles on the base, a gold circlet
    const [w, h, d] = W(it), B = D.B, gold = it.c ? "#d4a53a" : "#9aa07a";
    B.box("stone", 0, 0, 0, w, 0.3, d, "#8a7f6a", { b: 0.05, grime: 0.3 });
    B.box("stone", 0, 0.3, 0, w * 0.86, 0.12, d * 0.86, "#a89a80", { b: 0.03 });
    kongFigure(B, "stone", 0, 0.42, 0, w * 0.82, h - 0.42, "#b8a88a");
    B.cyl("metal", 0, 0.42 + (h - 0.42) * 0.7 + w * 0.82 * 0.13, 0.0, w * 0.82 * 0.235, w * 0.82 * 0.25, 0.06, gold, { seg: 16 });
    for (const sx of [-1, 1]) B.sphere("glow", sx * w * 0.82 * 0.085, 0.42 + (h - 0.42) * 0.705, w * 0.82 * 0.23, 0.02, TEAL);
  },
  pillar(D, it) {
    const [w, h] = W(it), B = D.B, r = D.rng;
    B.box("stone", 0, 0, 0, w, 0.18, w, "#8a7f6a", { b: 0.04, grime: 0.3 });
    B.cyl("stone", 0, 0.18, 0, w * 0.36, w * 0.4, h - 0.3, "#b8a88a", { seg: 12 });
    for (let k = 0; k < 3; k++) B.cbox("stone", (r() - 0.5) * w * 0.3, h - 0.1 + r() * 0.05, (r() - 0.5) * w * 0.3, w * 0.3, 0.2, w * 0.3, "#a89a80", { b: 0.03, ry: r() * 3, rx: (r() - 0.5) * 0.6 });
    B.cyl("leaf", 0, 0.18, 0, w * 0.405, w * 0.41, 0.3, "#5f8a42", { seg: 12, sx: 1, sz: 1 });
  },
  banner(D, it) {
    // a hanging temple banner: turned pole with finials, cloth with a gold border + a sun emblem, a swallow-tail hem
    const [w, h] = W(it), B = D.B, cloth = D.style === "temple" ? ["#a8322a", "#2f5a8a", "#3e6a3a"][it.c % 3] : "#a8322a";
    B.cyl("wood", 0, h, 0.04, 0.025, 0.025, w + 0.24, WOOD[3], { rz: Math.PI / 2, seg: 8 });
    for (const sx of [-1, 1]) B.sphere("metal", sx * (w / 2 + 0.13), h, 0.04, 0.04, "#d4a53a", { detail: 1 });
    for (const sx of [-1, 1]) B.rod("fabric", V(sx * w * 0.3, h + 0.01, 0.04), V(0, h + 0.2, 0.02), 0.006, "#6a5030", 4);
    B.box("cloth", 0, 0.16, 0.02, w, h - 0.18, 0.014, cloth, { b: 0.004, wear: 0 });
    for (const sx of [-1, 1]) { B.box("cloth", sx * (w / 4), -0.02, 0.02, w / 2 - 0.02, 0.2, 0.014, cloth, { b: 0.004, wear: 0, rz: sx * 0.35 }); }
    for (const sx of [-1, 1]) B.box("metal", sx * (w / 2 - 0.05), 0.16, 0.03, 0.035, h - 0.2, 0.008, "#d4a53a", { b: 0, wear: 0 });
    for (const y of [0.2, h - 0.12]) B.box("metal", 0, y, 0.03, w - 0.06, 0.035, 0.008, "#d4a53a", { b: 0, wear: 0 });
    B.cyl("metal", 0, h * 0.58, 0.032, w * 0.2, w * 0.2, 0.012, "#e8c25a", { rx: Math.PI / 2, seg: 20 });
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; B.box("metal", Math.cos(a) * w * 0.27, h * 0.58 + Math.sin(a) * w * 0.27 - 0.05, 0.03, 0.03, 0.1, 0.008, "#e8c25a", { b: 0, wear: 0, rz: a - Math.PI / 2 }); }
    B.cyl("cloth", 0, h * 0.58, 0.04, w * 0.1, w * 0.1, 0.012, shade(cloth, 0.6), { rx: Math.PI / 2, seg: 14 });
  },
  column(D, it) {
    // a full-height hall column: stepped plinth, a shaft (temple: dressed drums with a carved band; else a timber post
    // with knee braces), a capital block under the ceiling
    const [w, h] = W(it), B = D.B, r = D.rng;
    if (D.style === "temple") {
      B.box("stone", 0, 0, 0, w, 0.22, w, "#8a7f6a", { b: 0.04, grime: 0.35 });
      B.box("stone", 0, 0.22, 0, w * 0.86, 0.14, w * 0.86, "#9c8f78", { b: 0.03 });
      const n = Math.max(3, Math.round((h - 0.8) / 0.7)), dh = (h - 0.36 - 0.44) / n;
      for (let k = 0; k < n; k++) B.cyl("stone", 0, 0.36 + k * dh, 0, w * 0.34, w * 0.35, dh - 0.015, shade("#b8a88a", 0.92 + r() * 0.14), { seg: 14, grime: k === 0 ? 0.3 : 0 });
      B.cyl("metal", 0, 0.36 + dh * 1.5, 0, w * 0.355, w * 0.355, 0.05, "#b8903a", { seg: 16 });
      B.cyl("stone", 0, h - 0.44, 0, w * 0.46, w * 0.34, 0.18, "#a89a80", { seg: 14 });
      B.box("stone", 0, h - 0.26, 0, w * 1.05, 0.26, w * 1.05, "#9c8f78", { b: 0.035 });
      if (it.c) B.cyl("leaf", 0, 0.36, 0, w * 0.355, w * 0.36, 0.5 + r() * 0.6, "#5f8a42", { seg: 14 });
    } else {
      B.box("stone", 0, 0, 0, w * 0.9, 0.12, w * 0.9, "#8a8378", { b: 0.02 });
      B.box("wood", 0, 0.12, 0, w * 0.6, h - 0.12, w * 0.6, WOOD[1], { b: 0.03, grime: 0.2 });
    }
  },
  "side-table"(D, it) {
    const [w, h, d] = W(it), col = WOOD[it.c % 4], B = D.B;
    B.cyl("wood", 0, h - 0.04, 0, w / 2, w / 2, 0.04, col, { seg: 18 });
    B.cyl("wood", 0, 0.02, 0, 0.04, 0.05, h - 0.06, shade(col, 0.85), { seg: 8 });
    B.cyl("wood", 0, 0, 0, w * 0.32, w * 0.36, 0.03, shade(col, 0.8), { seg: 14 });
    B.box("paint", -0.1, h, 0.08, 0.16, 0.03, 0.22, FABRIC[(it.c + 2) % 6], { b: 0.004, ry: 0.5 });
  },
  "water-cooler"(D, it) {
    const [w, h, d] = W(it), B = D.B;
    B.box("paint", 0, 0, 0, w, h * 0.72, d, "#e9eef0", { b: 0.04, grime: 0.15 });
    B.box("paint", 0, h * 0.45, d / 2 + 0.005, w * 0.6, 0.12, 0.03, "#2b3238", { b: 0.01 });
    B.box("metal", -0.07, h * 0.5, d / 2 + 0.02, 0.03, 0.04, 0.04, "#2fb3a8", { b: 0.006 }); B.box("metal", 0.07, h * 0.5, d / 2 + 0.02, 0.03, 0.04, 0.04, "#d9483b", { b: 0.006 });
    B.cyl("glass", 0, h * 0.72, 0, w * 0.4, w * 0.38, h * 0.26, "#8fd0e8", { seg: 14 });
    B.cyl("glow", 0, h * 0.73, 0, w * 0.36, w * 0.35, h * 0.16, new THREE.Color(0.35, 0.75, 0.95), { seg: 14 });
  },

  fireplace(D, it) {
    // house focal wall: brick firebox + hearth slab, a timber mantel shelf with candles / a clock / books, logs + fire
    const [w, h, d] = W(it), B = D.B, brick = ["#b0583a", "#c9b8a0", "#8a6a55"][it.c % 3];
    B.box("stone", 0, 0, 0.04, w + 0.2, 0.08, d + 0.08, "#6a625a", { b: 0.02, grime: 0.2 });
    for (const sx of [-1, 1]) B.box("stone", sx * (w / 2 - 0.2), 0.08, 0, 0.4, h - 0.26, d, brick, { b: 0.025, grime: 0.15 });
    B.box("stone", 0, h - 0.62, 0, w - 0.8, 0.44, d, brick, { b: 0.025 });
    B.box("stone", 0, 0.08, -d / 2 + 0.1, w - 0.8, h - 0.7, 0.2, "#231c18", { b: 0.01, wear: 0 });   // soot-black firebox back
    B.box("stone", 0, 0.08, 0.02, w - 0.8, 0.02, d - 0.1, "#2a2420", { b: 0, wear: 0 });
    for (let k = 0; k < 6; k++) B.box("paint", -w / 2 + 0.2 + (k % 2) * 0.1, 0.16 + k * 0.17, d / 2 + 0.003, 0.24, 0.02, 0.006, "#7a3a24", { b: 0, wear: 0 });
    B.box("wood", 0, h - 0.18, 0.03, w + 0.16, 0.1, d + 0.1, WOOD[3], { b: 0.02 });
    B.box("wood", 0, h - 0.08, 0.04, w + 0.24, 0.08, d + 0.16, WOOD[1], { b: 0.02 });
    // logs + fire
    for (const [x, rz] of [[-0.12, 0.2], [0.12, -0.25], [0, 0]] as Array<[number, number]>) B.cyl("wood", x, 0.16 + (x === 0 ? 0.08 : 0), 0.0, 0.055, 0.06, w * 0.35, "#4a3322", { rz: Math.PI / 2 + rz, ry: 0.4, seg: 8 });
    B.box("glow", 0, 0.1, 0.02, w * 0.4, 0.03, 0.18, new THREE.Color(2.0, 0.6, 0.12), { b: 0, wear: 0, under: 0 });
    flame(D, 0, 0.14, 0.02, 0.42, 0.5, 1.0);
    flame(D, -0.14, 0.14, 0.04, 0.22, 0.3, 0.7);
    // mantel dressing
    B.cyl("paint", -w / 2 + 0.18, h, 0.04, 0.03, 0.03, 0.16, "#f4efe6", { seg: 8 }); flame(D, -w / 2 + 0.18, h + 0.15, 0.04, 0.05, 0.1, 0.6);
    B.box("wood", w / 2 - 0.32, h, 0.02, 0.22, 0.3, 0.12, WOOD[1], { b: 0.03 }); B.cyl("paint", w / 2 - 0.32, h + 0.18, 0.085, 0.07, 0.07, 0.01, "#f7f2e6", { rx: Math.PI / 2, seg: 14 });
    books(D, -0.2, 0.18, h, 0.02, 0.14, 0.2);
    D.lights.push({ x: 0, y: 0.4, z: d / 2 + 0.5, r: 2.6, c: new THREE.Color(1, 0.55, 0.22), floor: true, wash: false });
  },
  tv(D, it) {
    const [w, h] = W(it), B = D.B;
    B.box("metal", 0, 0, -0.02, 0.36, 0.02, 0.2, "#222", { b: 0.006 });
    B.box("metal", 0, 0.02, -0.03, 0.06, 0.12, 0.04, "#222", { b: 0.01 });
    B.box("metal", 0, 0.1, -0.03, w, h - 0.1, 0.05, "#15181a", { b: 0.012 });
    B.push("screen", planeGeo(), B.M(0, 0.1 + (h - 0.1) / 2, -0.004, 0, 0, 0, w - 0.06, h - 0.16, 1), new THREE.Color(1.1, 1.1, 1.1), { uv: "rect", rect: screenRect(2), wear: 0, under: 0 });
  },
  treasure(D, it) {
    // plunder: an open chest spilling a heap of gold coins, goblets, a crown, strings of pearls, gems (≤ 0.5 m tall)
    const [w, h, d] = W(it), B = D.B, r = D.rng;
    const gold = ["#e8c25a", "#d4a53a", "#f2d77a"];
    B.sphere("metal", 0.05, 0, 0.05, w * 0.42, "#d4a53a", { sx: 1.0, sy: (h * 0.55) / (w * 0.42), sz: (d * 0.46) / (w * 0.42), detail: 2 });
    for (let k = 0; k < 60; k++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.95, x = Math.cos(a) * rr * w * 0.48, z = Math.sin(a) * rr * d * 0.48;
      const yy = Math.max(0, h * 0.55 * Math.sqrt(Math.max(0, 1 - rr * rr)) - 0.012);
      B.cyl("metal", x, yy, z, 0.03, 0.03, 0.008, gold[k % 3], { seg: 7, rx: (r() - 0.5) * 1.2, rz: (r() - 0.5) * 1.2 });
    }
    // open chest at the back of the heap
    const cz = -d / 2 + 0.2, cw = 0.62, ch = 0.3;
    B.box("wood", -0.1, 0, cz, cw, ch, 0.36, WOOD[3], { b: 0.02, grime: 0.2, ry: 0.15 });
    B.box("wood", -0.1, ch - 0.02, cz - 0.2, cw, 0.3, 0.05, WOOD[1], { b: 0.02, rx: -0.35, ry: 0.15 });
    for (const x of [-0.3, 0.1]) B.box("metal", x, 0, cz + 0.02, 0.04, ch + 0.01, 0.38, "#4a4a48", { b: 0.006, ry: 0.15 });
    B.sphere("metal", -0.1, ch - 0.02, cz, 0.24, "#e8c25a", { sy: 0.35, sz: 0.55, detail: 1 });
    // goblets, a crown, gems
    for (const [x, z] of [[0.3, 0.1], [-0.35, 0.22]] as Array<[number, number]>) { const yy = h * 0.35; B.cyl("metal", x, yy, z, 0.04, 0.05, 0.02, "#d4a53a", { seg: 10 }); B.cyl("metal", x, yy + 0.02, z, 0.012, 0.012, 0.08, "#d4a53a", { seg: 6 }); B.cyl("metal", x, yy + 0.1, z, 0.055, 0.03, 0.08, "#e8c25a", { seg: 12 }); }
    B.cyl("metal", 0.1, h * 0.48, -0.02, 0.1, 0.09, 0.07, "#e8c25a", { seg: 12, rx: 0.2 });
    for (let k = 0; k < 5; k++) { const a = k * 1.25; B.box("metal", 0.1 + Math.cos(a) * 0.09, h * 0.48 + 0.07, -0.02 + Math.sin(a) * 0.09, 0.03, 0.05, 0.02, "#e8c25a", { b: 0.004, ry: -a }); }
    for (let k = 0; k < 7; k++) B.sphere("glow", (r() - 0.5) * w * 0.6, h * (0.3 + r() * 0.2), (r() - 0.5) * d * 0.5, 0.025, [new THREE.Color(1.6, 0.2, 0.3), new THREE.Color(0.2, 1.1, 0.5), new THREE.Color(0.3, 0.5, 1.6)][k % 3], { detail: 0 });
    for (let k = 0; k < 14; k++) B.sphere("paint", -0.25 + k * 0.035, h * 0.22 + Math.sin(k * 0.6) * 0.03, 0.28 + Math.cos(k * 0.5) * 0.05, 0.014, "#f4f0e6", { detail: 0 });
    D.lights.push({ x: 0, y: 0.3, z: 0, r: 1.1, c: new THREE.Color(1, 0.8, 0.35), floor: true, wash: false });
  },
  chandelier(D, it) {
    // wrought ring of 6 candles on chains under the ceiling (captain's cabin hero light)
    const B = D.B, h = it.h, R = Math.min(0.42, it.w / 2);
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; B.rod("metal", V(Math.cos(a) * R * 0.9, 0.08, Math.sin(a) * R * 0.9), V(0, h * 0.6, 0), 0.007, "#2a2622", 4); }
    B.rod("metal", V(0, h * 0.6, 0), V(0, h, 0), 0.01, "#2a2622", 5);
    B.cyl("metal", 0, h - 0.02, 0, 0.08, 0.08, 0.02, "#2a2622", { seg: 10 });
    B.push("metal", torusGeo(R, 0.022, 24), B.M(0, 0.06, 0, 0, Math.PI / 2, 0), "#3a3430", { uv: "box", wear: 0.2 });
    B.push("metal", torusGeo(R * 0.55, 0.015, 18), B.M(0, 0.0, 0, 0, Math.PI / 2, 0), "#3a3430", { uv: "box", wear: 0.2 });
    B.sphere("metal", 0, -0.02, 0, 0.05, "#c9a45a", { detail: 1 });
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, x = Math.cos(a) * R, z = Math.sin(a) * R;
      B.cyl("metal", x, 0.06, z, 0.035, 0.02, 0.03, "#c9a45a", { seg: 8 });
      B.cyl("paint", x, 0.09, z, 0.016, 0.018, 0.1, "#f4efe6", { seg: 8 });
      flame(D, x, 0.19, z, 0.05, 0.09, 0.8);
    }
    D.lights.push({ x: 0, y: 0.1, z: 0, r: 4.0, c: new THREE.Color(1.1, 0.78, 0.42), floor: true });
  },
  runner(D, it) {
    // a long red runner with a gold border and fringe (captain's cabin), lying flat
    const [w, , d] = W(it), B = D.B;
    B.box("fabric", 0, 0.012, 0, w, 0.014, d, "#8a1f1f", { b: 0.004, wear: 0 });
    for (const sx of [-1, 1]) B.box("fabric", sx * (w / 2 - 0.07), 0.026, 0, 0.05, 0.003, d - 0.1, "#d4a53a", { b: 0, wear: 0 });
    for (const sz of [-1, 1]) B.box("fabric", 0, 0.026, sz * (d / 2 - 0.07), w - 0.1, 0.003, 0.05, "#d4a53a", { b: 0, wear: 0 });
    for (let k = 0; k < Math.floor(d / 0.9); k++) B.box("fabric", 0, 0.026, -d / 2 + 0.45 + k * 0.9, w * 0.3, 0.003, w * 0.3, "#d4a53a", { b: 0, wear: 0, ry: Math.PI / 4 });
    for (const sz of [-1, 1]) for (let k = 0; k < 12; k++) B.box("fabric", -w / 2 + (k + 0.5) * w / 12, 0.012, sz * (d / 2 + 0.04), 0.02, 0.008, 0.08, "#e8d6a8", { b: 0, wear: 0 });
  },
  neon(D, it) {
    // an emissive tube logo on a dark backing board with stand-offs (lab / shop hero light)
    const [w, h] = W(it), B = D.B, row = it.c % 3;
    B.box("metal", 0, 0, -0.02, w, h, 0.03, "#15191c", { b: 0.01 });
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl("metal", x * (w / 2 - 0.05), h / 2 + y * (h / 2 - 0.05), 0.0, 0.012, 0.012, 0.03, "#8a8e92", { rx: Math.PI / 2, seg: 6 });
    B.push("neon", planeGeo(), B.M(0, h / 2, 0.012, 0, 0, 0, w - 0.02, h - 0.02, 1), new THREE.Color(1.8, 1.8, 1.8), { uv: "rect", rect: [0, 1 - (row + 1) / 3 + 0.004, 1, 1 - row / 3 - 0.004], wear: 0, under: 0 });
    const c = [new THREE.Color(0.25, 1, 0.95), new THREE.Color(1, 0.35, 0.6), new THREE.Color(1, 0.85, 0.25)][row];
    D.lights.push({ x: 0, y: 0, z: 0.4, r: 1.7, c: c.multiplyScalar(0.8), floor: false, wash: false });
  },
  hazard(D, it) {
    const [w, , d] = W(it), B = D.B;
    B.push("hazard", planeGeo(), B.M(0, 0.022, 0, 0, -Math.PI / 2, 0, w, d, 1), "#ffffff", { uv: "rect", rect: [0, 0, w, 1], wear: 0, under: 0 });
  },
  "wall-cab"(D, it) {
    // a wall-hung cabinet with two doors, a cornice and a pot on top
    const [w, h] = W(it), B = D.B, col = pc(D.style, it.c + 3), d = 0.32;
    B.box("paint", 0, 0, d / 2 - 0.03, w, h, d, col, { b: 0.02 });
    for (const sx of [-1, 1]) { B.box("paint", sx * w / 4, 0.03, d - 0.02, w / 2 - 0.04, h - 0.06, 0.015, shade(col, 1.06), { b: 0.006 }); knob(D, sx * 0.05, h * 0.4, d); }
    B.box("wood", 0, h, d / 2 - 0.03, w + 0.04, 0.04, d + 0.03, WOOD[0], { b: 0.01 });
    B.cyl("paint", -w * 0.25, h + 0.04, d / 2, 0.06, 0.05, 0.12, "#c9744a", { seg: 10 });
    B.sphere("leaf", -w * 0.25, h + 0.2, d / 2, 0.08, LEAF[1], { sy: 0.8 });
  },
  "coat-rack"(D, it) {
    // a hook rail by the door: 4 hooks, a coat, a hat, a bag
    const [w] = W(it), B = D.B, r = D.rng;
    B.box("wood", 0, 0.28, 0, w, 0.1, 0.03, WOOD[1], { b: 0.01 });
    for (let k = 0; k < 4; k++) B.box("metal", -w / 2 + 0.1 + k * (w - 0.2) / 3, 0.3, 0.05, 0.02, 0.06, 0.06, "#333", { b: 0.005, rx: 0.4 });
    const cc = FABRIC[Math.floor(r() * 6)];
    B.box("cloth", -w / 2 + 0.1, -0.6, 0.08, 0.3, 0.9, 0.12, cc, { b: 0.05, wear: 0 });
    B.box("cloth", -w / 2 + 0.1, 0.12, 0.09, 0.24, 0.2, 0.1, shade(cc, 0.8), { b: 0.04, wear: 0 });
    B.cyl("fabric", w / 2 - 0.1, 0.1, 0.1, 0.13, 0.13, 0.02, "#6a4a2a", { seg: 14 }); B.cyl("fabric", w / 2 - 0.1, 0.12, 0.1, 0.08, 0.09, 0.1, "#6a4a2a", { seg: 12 });
    B.box("fabric", 0.05, -0.2, 0.08, 0.2, 0.26, 0.08, FABRIC[(Math.floor(r() * 6) + 2) % 6], { b: 0.04, wear: 0 });
  },
  "sill-pot"(D, it) {
    // window-sill dressing: a flower pot, a bottle or a stack of books
    const B = D.B, r = D.rng, v = Math.floor(it.v * 3);
    if (v === 0) { B.cyl("paint", 0, 0, 0, 0.07, 0.055, 0.12, ["#c9744a", "#e9e1d0", "#2f8a86"][it.c % 3], { seg: 12 }); for (let k = 0; k < 5; k++) B.sphere("leaf", (r() - 0.5) * 0.08, 0.16 + r() * 0.06, (r() - 0.5) * 0.06, 0.05, LEAF[k % 3], { sy: 0.7 }); B.sphere("paint", 0.02, 0.23, 0, 0.025, ["#d9483b", "#f1c232", "#8a5aa8"][it.c % 3], { detail: 0 }); }
    else if (v === 1) { B.cyl("glass", -0.04, 0, 0, 0.035, 0.035, 0.22, "#6a8a5a", { seg: 8 }); B.cyl("glass", 0.05, 0, 0.01, 0.03, 0.03, 0.16, "#8a5a3a", { seg: 8 }); }
    else { let y = 0; for (let k = 0; k < 3; k++) { const t = 0.03 + r() * 0.02; B.box("paint", 0, y, 0, 0.18, t, 0.11, FABRIC[Math.floor(r() * 6)], { b: 0.004, ry: (r() - 0.5) * 0.3 }); y += t; } }
  },
  filing(D, it) {
    const [w, h, d] = W(it), B = D.B, col = ["#6f7f86", "#3f5f6b", "#8a8a7a"][it.c % 3];
    B.box("metal", 0, 0, 0, w, h, d, col, { b: 0.015, grime: 0.2 });
    for (let k = 0; k < 4; k++) { const dh = (h - 0.08) / 4, y = 0.04 + k * dh; B.box("metal", 0, y + 0.01, d / 2 + 0.002, w - 0.05, dh - 0.02, 0.015, shade(col, 1.08), { b: 0.006 }); B.box("metal", 0, y + dh * 0.6, d / 2 + 0.015, 0.14, 0.025, 0.02, "#c8cccc", { b: 0.005 }); B.box("paint", 0, y + dh * 0.78, d / 2 + 0.012, 0.09, 0.04, 0.004, "#f7f2e6", { b: 0, wear: 0 }); }
    B.box("paint", 0.05, h, 0, w * 0.6, 0.06, d * 0.5, "#e9e1d0", { b: 0.006, ry: 0.2 });
  },
  radio(D, it) {
    // marine VHF set: a box with a dial window, knobs, a handset on a curly cord, a whip aerial
    const [w, h, d] = W(it), B = D.B;
    B.box("metal", 0, 0, 0, w, h * 0.6, d, "#2b3238", { b: 0.015 });
    B.box("glow", -w * 0.15, h * 0.32, d / 2 + 0.003, w * 0.4, h * 0.16, 0.006, new THREE.Color(1.4, 0.9, 0.25), { b: 0, wear: 0 });
    for (let k = 0; k < 3; k++) B.cyl("metal", w * 0.14 + k * 0.06, h * 0.3, d / 2 + 0.01, 0.018, 0.018, 0.02, "#c8cccc", { rx: Math.PI / 2, seg: 8 });
    B.box("metal", w * 0.3, h * 0.6, 0, 0.07, 0.12, 0.05, "#1c2226", { b: 0.02, rx: 0.2 });
    B.rod("metal", V(-w / 2 + 0.04, h * 0.6, -d / 2 + 0.04), V(-w / 2 + 0.08, h + 0.35, -d / 2 + 0.02), 0.004, "#333", 4);
  },
  "life-ring"(D, it) {
    const [w] = W(it), B = D.B, R = w * 0.36;
    B.push("paint", torusGeo(R, w * 0.12, 20), B.M(0, w / 2, 0.06, 0, 0, 0), "#f2efe4", { uv: "box", wear: 0.2 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; B.box("paint", Math.cos(a) * R, w / 2 + Math.sin(a) * R - 0.07, 0.06, w * 0.26, 0.14, w * 0.26, it.c ? "#e8742a" : "#d9483b", { b: 0.03, rz: a - Math.PI / 2, wear: 0 }); }
    B.push("fabric", torusGeo(R + w * 0.13, 0.008, 20), B.M(0, w / 2, 0.06, 0, 0, 0), "#d8c7a0", { uv: "box", wear: 0 });
    B.box("metal", 0, w - 0.06, 0.0, 0.04, 0.06, 0.06, "#555", { b: 0.01 });
  },
  clutter(D, it) {
    // v picks the variant; c = style index (0 house, 1 shop, 2 warehouse, 3 lab, 4 hut, 5 cabin, 6 temple)
    const [w, h, d] = W(it), B = D.B, r = D.rng, st = it.c;
    const pool = st === 2 ? [2, 3, 4, 2] : st === 3 ? [2, 0, 7, 4] : st === 4 || st === 5 ? [1, 3, 4, 5] : st === 6 ? [6, 6, 1, 6] : st === 1 ? [2, 1, 4, 2] : [0, 1, 5, 2, 7];
    const v = pool[Math.floor(it.v * pool.length) % pool.length];
    switch (v) {
      case 0: { // stack of books / magazines
        let y = 0; for (let i = 0; i < 4 + Math.floor(r() * 3) && y < h - 0.05; i++) { const t = 0.04 + r() * 0.03; B.box("paint", (r() - 0.5) * 0.05, y, (r() - 0.5) * 0.05, w * (0.6 + r() * 0.3), t, d * (0.6 + r() * 0.3), FABRIC[Math.floor(r() * 6)], { b: 0.005, ry: (r() - 0.5) * 0.4 }); y += t; }
        break;
      }
      case 1: { // wicker basket with laundry / fruit
        B.cyl("wood", 0, 0, 0, w * 0.46, w * 0.38, h * 0.8, "#c9a26a", { seg: 12, grime: 0.2 });
        for (let k = 0; k < 3; k++) B.cyl("wood", 0, h * (0.2 + k * 0.25), 0, w * (0.4 + k * 0.025) + 0.006, w * (0.4 + k * 0.025) + 0.006, 0.025, "#a8824a", { seg: 12 });
        if (st === 0) B.sphere("fabric", 0, h * 0.8, 0, w * 0.36, FABRIC[Math.floor(r() * 6)], { sy: 0.45, detail: 1 }); else fruitPile(D, 0, h * 0.72, 0, w * 0.6, w * 0.6, "mixed", 7);
        break;
      }
      case 2: { // cardboard box, flaps open
        B.box("paint", 0, 0, 0, w, h * 0.9, d, "#c9a26a", { b: 0.012, wear: 0.25 });
        B.box("paint", 0, h * 0.9 - 0.005, d / 2 + 0.06, w - 0.02, 0.01, 0.14, "#b8905a", { b: 0.002, rx: 0.8, wear: 0 });
        B.box("paint", 0, h * 0.9 - 0.005, -d / 2 - 0.06, w - 0.02, 0.01, 0.14, "#b8905a", { b: 0.002, rx: -0.8, wear: 0 });
        B.box("paint", 0, h * 0.5, d / 2 + 0.002, w * 0.5, 0.06, 0.003, "#e8dcc0", { b: 0, wear: 0 });
        break;
      }
      case 3: { // bucket (+ mop / fishing rod)
        B.cyl("metal", 0, 0, 0, w * 0.34, w * 0.28, h * 0.7, st === 4 || st === 5 ? "#6f8fa4" : "#d9483b", { seg: 12, grime: 0.2 });
        B.push("metal", torusGeo(w * 0.3, 0.006, 12), B.M(0, h * 0.7, 0, 0, 0.3, 0), "#555", { uv: "box", wear: 0 });
        B.rod("wood", V(0, 0.05, 0), V(0.05, 1.5, -d * 0.4), 0.012, WOOD[2], 5);
        break;
      }
      case 4: { // crate of bottles
        B.box("wood", 0, 0, 0, w, h * 0.55, d, WOOD[2], { b: 0.01, grime: 0.2 });
        for (let i = 0; i < 6; i++) B.cyl("glass", (i % 3 - 1) * w * 0.28, h * 0.1, (Math.floor(i / 3) - 0.5) * d * 0.45, 0.035, 0.035, h * 0.85, ["#6a8a5a", "#8a5a3a", "#5a7a9a"][i % 3], { seg: 8 });
        break;
      }
      case 5: { // boots + a bag
        for (const sx of [-1, 1]) { B.box("fabric", sx * 0.08, 0, 0.02, 0.1, 0.22, 0.12, "#5a3a24", { b: 0.03 }); B.box("fabric", sx * 0.08, 0, 0.1, 0.1, 0.08, 0.12, "#4a2e1c", { b: 0.03 }); }
        B.box("fabric", w * 0.2, 0, -0.05, 0.3, h * 0.6, 0.2, FABRIC[Math.floor(r() * 6)], { b: 0.06, ry: 0.4 });
        break;
      }
      case 6: { // temple: candles cluster + a small offering pot
        for (let i = 0; i < 5; i++) { const x = (r() - 0.5) * w * 0.7, z = (r() - 0.5) * d * 0.7, ch = 0.08 + r() * 0.18; B.cyl("paint", x, 0, z, 0.025, 0.03, ch, "#f4efe6", { seg: 8 }); B.sphere("glow", x, ch + 0.025, z, 0.014, FIRE, { sy: 1.8, detail: 0 }); }
        B.cyl("stone", w * 0.2, 0, -d * 0.2, 0.09, 0.07, 0.16, "#c9744a", { seg: 10 });
        D.lights.push({ x: 0, y: 0.2, z: 0, r: 0.9, c: new THREE.Color(1, 0.6, 0.25), floor: true });
        break;
      }
      default: { // 7: a stack of paper boxes / a guitar case lying down
        B.box("paint", 0, 0, 0, w, h * 0.45, d * 0.8, "#e9eef0", { b: 0.01 });
        B.box("paint", 0.02, h * 0.45, 0, w * 0.9, h * 0.4, d * 0.75, "#dfe6e8", { b: 0.01, ry: 0.15 });
        B.box("paint", 0, h * 0.2, d * 0.4 + 0.002, w * 0.4, 0.05, 0.003, "#2f8a86", { b: 0, wear: 0 });
      }
    }
  },
};

// shared sub-shapes ------------------------------------------------------------------------------
/** a squatting kong figure, chunky bevelled blocks (feet, haunches, belly, chest, shoulders, arms to the knuckles, head
 *  with a heavy brow + muzzle + ears) fitting w × h, standing at y */
function kongFigure(B: IBuilder, key: MatKey, x: number, y: number, z: number, w: number, h: number, col: string) {
  // soft, pillowy blocks (big chamfers) + spheres: a hunched gorilla, not a robot
  const c = new THREE.Color(col), dk = c.clone().multiplyScalar(0.78), lt = c.clone().multiplyScalar(1.1);
  for (const sx of [-1, 1]) { B.box(key, x + sx * w * 0.2, y, z + w * 0.14, w * 0.3, h * 0.1, w * 0.32, dk, { b: w * 0.06 }); B.sphere(key, x + sx * w * 0.19, y + h * 0.2, z + 0.02, w * 0.19, c, { sy: 1.1, sz: 1.2 }); }
  B.sphere(key, x, y + h * 0.3, z, w * 0.33, c, { sy: 0.95, sz: 0.85, detail: 2 });                        // belly
  B.sphere(key, x, y + h * 0.5, z - 0.03, w * 0.4, lt, { sx: 1.1, sy: 0.72, sz: 0.72, detail: 2 });         // chest + shoulders
  B.sphere(key, x, y + h * 0.3, z + w * 0.22, w * 0.2, lt, { sy: 1.2, sz: 0.4 });                            // belly plate
  for (const sx of [-1, 1]) {
    B.sphere(key, x + sx * w * 0.38, y + h * 0.55, z - 0.02, w * 0.17, c, { detail: 1 });                      // shoulder
    B.cyl(key, x + sx * w * 0.37, y + h * 0.3, z + w * 0.1, w * 0.12, w * 0.15, h * 0.34, c, { rx: -0.2, rz: sx * 0.12, seg: 10 }); // forearm
    B.sphere(key, x + sx * w * 0.38, y + h * 0.42, z + w * 0.02, w * 0.14, c, { sy: 1.3 });                  // upper arm
    B.box(key, x + sx * w * 0.36, y, z + w * 0.18, w * 0.26, h * 0.12, w * 0.28, dk, { b: w * 0.09 });       // knuckles
  }
  const hy = y + h * 0.7;
  B.sphere(key, x, hy, z + 0.01, w * 0.24, c, { sx: 1.05, sy: 0.95, detail: 2 });                            // head
  B.box(key, x, hy + h * 0.04, z + w * 0.14, w * 0.44, h * 0.07, w * 0.14, dk, { b: w * 0.035 });          // brow
  B.sphere(key, x, hy - h * 0.05, z + w * 0.18, w * 0.15, lt, { sx: 1.3, sy: 0.8, sz: 0.7 });               // muzzle
  B.box(key, x, hy - h * 0.085, z + w * 0.285, w * 0.14, h * 0.012, 0.01, dk, { b: 0, wear: 0 });          // mouth
  for (const sx of [-1, 1]) { B.sphere(key, x + sx * w * 0.25, hy, z - 0.02, w * 0.075, dk, { sz: 0.5 }); B.sphere(key, x + sx * w * 0.085, hy + h * 0.005, z + w * 0.21, w * 0.035, "#1c1612", { detail: 0 }); }
}
function counterBase(D: DrawCtx, it: InteriorItem) {
  const [w, h, d] = W(it), col = pc(D.style, it.c + 3), B = D.B;
  B.box("paint", 0, 0.1, -0.02, w - 0.01, h - 0.14, d - 0.06, col, { b: 0.015, grime: 0.12 });
  B.box("paint", 0, 0, -0.06, w - 0.01, 0.1, d - 0.14, "#2b2b2b", { wear: 0 });
  B.box("paint", 0, 0.14, d / 2 - 0.045, w - 0.06, h - 0.3, 0.02, shade(col, 1.06), { b: 0.008 });
  B.box("metal", w / 2 - 0.12, h - 0.26, d / 2 - 0.025, 0.12, 0.018, 0.018, "#c8cccc", { b: 0.004 });
  B.box("stone", 0, h - 0.04, 0, w, 0.04, d, "#e8e0cf", { b: 0.012 });
  if (it.kind === "counter" && D.rng() < 0.7) {
    const r = D.rng;
    if (r() < 0.5) { B.box("wood", 0, h, 0.02, 0.4, 0.025, 0.28, WOOD[0], { b: 0.006 }); B.cyl("paint", 0.1, h + 0.025, 0.02, 0.05, 0.05, 0.03, "#e8722a", { seg: 10 }); }
    else { B.cyl("paint", -0.15, h, -0.1, 0.06, 0.05, 0.18, pc(D.style, 1), { seg: 10 }); B.cyl("paint", 0.05, h, -0.12, 0.05, 0.045, 0.14, pc(D.style, 2), { seg: 10 }); B.cyl("glass", 0.2, h, 0.05, 0.035, 0.03, 0.22, "#a8d8c0", { seg: 8 }); }
  }
}
function crate(D: DrawCtx, w: number, h: number, d: number, y: number, c: number, ry = 0) {
  const B = D.B, col = WOOD[(c + 2) % 4], dark = shade(col, 0.72);
  const save = B.base.clone();
  if (ry) B.base.multiply(new THREE.Matrix4().makeRotationY(ry));
  B.box("wood", 0, y + 0.02, 0, w - 0.04, h - 0.04, d - 0.04, shade(col, 0.95), { b: 0.01, grime: 0.15 });
  const t = 0.07;
  // frame boards on every edge (bevelled), a diagonal brace on the two big faces
  for (const sy of [0, h - t]) for (const sz of [-1, 1]) B.box("wood", 0, y + sy, sz * (d / 2 - t / 2), w, t, t, dark, { b: 0.012 });
  for (const sy of [0, h - t]) for (const sx of [-1, 1]) B.box("wood", sx * (w / 2 - t / 2), y + sy, 0, t, t, d - 2 * t, dark, { b: 0.012 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box("wood", sx * (w / 2 - t / 2), y + t, sz * (d / 2 - t / 2), t, h - 2 * t, t, dark, { b: 0.012 });
  const diag = Math.atan2(h - 2 * t, w - 2 * t), len = Math.hypot(h - 2 * t, w - 2 * t);
  for (const sz of [-1, 1]) B.cbox("wood", 0, y + h / 2, sz * (d / 2 - 0.012), len, t * 0.8, 0.03, dark, { b: 0.008, rz: diag * sz });
  if (h > 0.5 && D.rng() < 0.6) B.box("paint", 0, y + h * 0.3, d / 2 + 0.004, w * 0.4, h * 0.16, 0.004, "#2f2a24", { b: 0, wear: 0 });
  B.base.copy(save);
}
function pallet(D: DrawCtx, w: number, h: number, d: number) {
  const B = D.B, col = WOOD[2];
  for (const sx of [-1, 0, 1]) B.box("wood", sx * (w / 2 - 0.05), 0, 0, 0.1, h - 0.03, d, shade(col, 0.85), { b: 0.01 });
  const n = 6; for (let i = 0; i < n; i++) B.box("wood", 0, h - 0.03, -d / 2 + (i + 0.5) * d / n, w, 0.03, d / n - 0.04, shade(col, 0.95 + (i % 2) * 0.08), { b: 0.006 });
}

// uv helpers --------------------------------------------------------------------------------------
function planeGeoLocal() { return planeGeo(); }
/** unit leaf blade: a flattened icosphere (radius 1) — scale (width, thickness, length) */
function sphLeaf() { return sphGeo(1, 1); }
let flatPlane: THREE.BufferGeometry | null = null;
function planeFlat() { return (flatPlane ??= planeGeo()); }
function cylGeoL() { return cylGeo(0.5, 0.5, 1, 14); }
function torusGeoL() { return torusGeo(0.035, 0.006, 10); }
export function artRect(cell: number): [number, number, number, number] { const u = (cell % 4) * 0.25, v = cell < 4 ? 0.5 : 0; return [u + 0.004, v + 0.008, u + 0.246, v + 0.492]; }
function goodsRect(cell: number): [number, number, number, number] { const u = (cell % 4) * 0.25, v = 0.75 - Math.floor(cell / 4) * 0.25; return [u + 0.01, v + 0.01, u + 0.24, v + 0.24]; }

/** draw one item (the caller sets D.B.base to the item's frame) */
export function drawItem(D: DrawCtx, it: InteriorItem) {
  const f = DRAW[it.kind];
  if (f) f(D, it);
  else D.B.box("wood", 0, 0, 0, it.w, it.h, it.d, "#b98552");
}
