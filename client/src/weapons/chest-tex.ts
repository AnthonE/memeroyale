// BANANA CO. crate texture ATLAS (target art loot-01-crate-closed, loot-02-crate-open, loot-03-rarity-lineup): one canvas-
// painted trim sheet per crate STYLE so a whole closed crate is ONE material / ONE draw (instanced per rarity).
//   albedo 2048×2560 (sRGB) · normal + ORM (R = cavity AO, G = roughness, B = metalness) at half res · emissive mask.
// Regions (canvas px, y down) — chest-geo.ts maps every part's UVs into one of these:
//   front / side / side2 / top : 1024² wood faces, boards painted to MATCH the geometry's board layout (BOARDS below)
//   band / gold                : painted-metal trim (white-ish, tinted per rarity by vertex colour) / polished gold
//   rope, dark wood, screw head, flat, seam (emissive), glow (emissive gradient), inner boards, misc
// Hand-painted look (the target art): broad warm streaks, bold dark grain, painted knots with a light rim, cracks with a
// lit lip, pale edge chips, a lit top edge per board; the stencil is burnt INTO the boards (distressed, grain shows).
import * as THREE from "three";
import { rng, bananaPath, paintKong } from "./lib/mats";
/** full twists of each strand along the handle rope (chest-geo plyRope) — the target art shows ~12 strand bumps per loop */
export const ROPE_TURNS = 4.6;

export type CrateStyle = "classic" | "lineup" | "supply";
export const ATLAS_W = 2048, ATLAS_H = 2560;
export type Rect = [number, number, number, number];
export const REG = {
  front: [0, 0, 1024, 1024] as Rect,
  side2: [1024, 0, 1024, 1024] as Rect,
  side: [0, 1024, 1024, 1024] as Rect,
  top: [1024, 1024, 1024, 1024] as Rect,
  band: [0, 2048, 1024, 256] as Rect,
  gold: [0, 2304, 1024, 256] as Rect,
  rope: [1024, 2048, 512, 256] as Rect,
  dark: [1536, 2048, 256, 256] as Rect,
  screw: [1792, 2048, 128, 128] as Rect,
  seam: [1920, 2048, 128, 128] as Rect,
  flat: [1792, 2176, 128, 128] as Rect,
  glow: [1920, 2176, 128, 128] as Rect,
  inner: [1024, 2304, 512, 256] as Rect,
  medal: [1536, 2304, 256, 256] as Rect,
  kong: [1792, 2304, 256, 256] as Rect,
};

/** board layout per face, normalised [u0, v0, u1, v1] (u right, v UP). Geometry and painter share it. */
export const BOARDS: Record<"front" | "side" | "side2" | "top", Rect[]> = {
  // front: three rows, the top row split (target art: a short board at the top left), the bottom row split far right
  front: [[0, 0, 0.78, 0.31], [0.78, 0, 1, 0.31], [0, 0.33, 1, 0.64], [0, 0.66, 0.34, 1], [0.34, 0.66, 1, 1]],
  side: [[0, 0, 1, 0.31], [0, 0.33, 0.6, 0.64], [0.6, 0.33, 1, 0.64], [0, 0.66, 1, 1]],
  side2: [[0, 0, 0.45, 0.31], [0.45, 0, 1, 0.31], [0, 0.33, 1, 0.64], [0, 0.66, 1, 1]],
  top: [[0, 0, 1, 0.315], [0, 0.335, 1, 0.655], [0, 0.675, 1, 1]],
};

/** supply crate (loot-02): three full-width painted planks per face butting tight (the target art's thin plank lines — the
 *  classic layout's split boards + 2 cm row gaps read as stacked drawers under the cream paint) */
const SUPPLY_ROWS: Rect[] = [[0, 0, 1, 0.332], [0, 0.334, 1, 0.666], [0, 0.668, 1, 1]];
export const SUPPLY_BOARDS: Record<"front" | "side" | "side2" | "top", Rect[]> = { front: SUPPLY_ROWS, side: SUPPLY_ROWS, side2: SUPPLY_ROWS, top: BOARDS.top };
export const boardsFor = (style: CrateStyle) => (style === "supply" ? SUPPLY_BOARDS : BOARDS);

export interface CrateAtlas {
  map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; orm: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture;
  style: CrateStyle;
}

type C2 = CanvasRenderingContext2D;
function canvas(w: number, h: number) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  return { c, x: c.getContext("2d", { willReadFrequently: true })! };
}
function tex(c: HTMLCanvasElement, srgb: boolean, aniso = 8): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const hex = (c: THREE.Color) => "#" + c.getHexString();

/** three canvases painted in lockstep: albedo (full res), height + ORM (half res, drawn with the same calls ×0.5) */
class Painter {
  readonly A: C2; readonly H: C2; readonly R: C2;
  constructor(a: C2, h: C2, r: C2) { this.A = a; this.H = h; this.R = r; }
  /** run a drawing fn on the half-res canvases with the same coordinates */
  half(fn: (x: C2) => void) { for (const x of [this.H, this.R]) { x.save(); x.scale(0.5, 0.5); fn(x); x.restore(); } }
}

// -------------------------------------------------------------------------------------------------------- wood
interface WoodPal { base: string; dark: string; light: string; chip: string; gap: string }
// chocolate, not orange: the target art's planks sample #6e4326–#7a4a2a lit
// (grade.ts sim: albedo #85583b under the studio key + grade → #7a4a2b lit, #6a432b in the half-shade)
// less saturated (the crate grade's ×1.42 chroma turned more saturated planks rust #643518 h23 s.76; target art #6d4631 s.55)
const WOOD: WoodPal = { base: "#7b5a43", dark: "#4b3526", light: "#9d7b5e", chip: "#bf9d7c", gap: "#1e140c" };
const WOOD_INNER: WoodPal = { base: "#6d4a33", dark: "#3c291b", light: "#8d6746", chip: "#a8845e", gap: "#1a0f08" };

function strokeWavy(x: C2, x0: number, y0: number, len: number, amp: number, f: number, ph: number, vertical: boolean) {
  x.beginPath();
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len, off = Math.sin((t / len) * Math.PI * 2 * f + ph) * amp;
    const px = vertical ? x0 + off : x0 + t, py = vertical ? y0 + t : y0 + off;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.stroke();
}

/** one painted board inside rect (canvas px); grain along the long axis */
function paintBoard(P: Painter, r: () => number, bx: number, by: number, bw: number, bh: number, pal: WoodPal, opts: { knot?: boolean; cracks?: number } = {}) {
  const A = P.A;
  const vertical = bh > bw * 1.4;
  const shade = 0.86 + r() * 0.26;
  const base = new THREE.Color(pal.base).multiplyScalar(shade);
  // base + painted light falloff (light from the top-left: lighter top, darker bottom)
  const g = A.createLinearGradient(bx, by, bx + bw * 0.2, by + bh);
  g.addColorStop(0, hex(base.clone().lerp(new THREE.Color(pal.light), 0.35)));
  g.addColorStop(0.55, hex(base));
  g.addColorStop(1, hex(base.clone().lerp(new THREE.Color(pal.dark), 0.3)));
  A.fillStyle = g; A.fillRect(bx, by, bw, bh);
  // height: board top plateau with bevelled edges (the geometry has the chamfer; this adds the worn rounding)
  P.half((x) => {
    if (x === P.H) {
      x.fillStyle = "#9a9a9a"; x.fillRect(bx, by, bw, bh);
      const e = Math.min(14, Math.min(bw, bh) * 0.08);
      x.strokeStyle = "#6a6a6a"; x.lineWidth = e; x.strokeRect(bx + e / 2, by + e / 2, bw - e, bh - e);
      x.strokeStyle = "#808080"; x.lineWidth = e * 0.5; x.strokeRect(bx + e * 1.1, by + e * 1.1, bw - e * 2.2, bh - e * 2.2);
    } else {
      // ORM: cavity 1, roughness ~0.78 with streaks, metal 0
      x.fillStyle = `rgb(255,${Math.round(196 + r() * 24)},0)`; x.fillRect(bx, by, bw, bh);
    }
  });
  A.save(); A.beginPath(); A.rect(bx, by, bw, bh); A.clip();
  P.half((x) => { x.save(); x.beginPath(); x.rect(bx, by, bw, bh); x.clip(); });
  const L = vertical ? bh : bw, W = vertical ? bw : bh;
  // broad painterly streaks (the target art's big warm/cool bands along the grain)
  for (let i = 0; i < 6; i++) {
    const dark = r() < 0.5;
    A.strokeStyle = dark ? `rgba(58,36,22,${0.12 + r() * 0.14})` : `rgba(200,160,120,${0.08 + r() * 0.12})`;
    A.lineWidth = W * (0.1 + r() * 0.16); A.lineCap = "round";
    const o = W * (0.1 + r() * 0.8);
    strokeWavy(A, vertical ? bx + o : bx - 10, vertical ? by - 10 : by + o, L + 20, W * 0.04, 0.5 + r(), r() * 6, vertical);
  }
  // bold dark grain lines (few, long, slightly wavy) + fine grain
  for (let i = 0; i < 5; i++) {
    const w = 1.6 + r() * 2.6, o = W * (0.06 + r() * 0.88), a = 0.22 + r() * 0.3;
    A.strokeStyle = `rgba(52,28,12,${a})`; A.lineWidth = w;
    const s0 = r() * L * 0.4, len = L * (0.35 + r() * 0.7);
    strokeWavy(A, vertical ? bx + o : bx + s0, vertical ? by + s0 : by + o, len, W * 0.025, 0.6 + r() * 1.2, r() * 6, vertical);
    P.half((x) => { if (x !== P.H) return; x.strokeStyle = "rgba(40,40,40,.55)"; x.lineWidth = w * 1.6; strokeWavy(x, vertical ? bx + o : bx + s0, vertical ? by + s0 : by + o, len, W * 0.025, 0.6, 0, vertical); });
  }
  for (let i = 0; i < 9; i++) {
    const o = W * r(), light = r() < 0.45;
    A.strokeStyle = light ? `rgba(230,180,120,${0.08 + r() * 0.1})` : `rgba(55,30,12,${0.06 + r() * 0.1})`; A.lineWidth = 1.2 + r() * 1.6;
    const s0 = r() * L * 0.5;
    strokeWavy(A, vertical ? bx + o : bx + s0, vertical ? by + s0 : by + o, L * (0.3 + r() * 0.6), W * 0.012, 1 + r(), r() * 6, vertical);
  }
  // knot: dark painted oval, grain-coloured ring, a light highlight arc (painted, not vector rings)
  if (opts.knot ?? r() < 0.55) {
    const ku = 0.2 + r() * 0.6, kv = 0.3 + r() * 0.4;
    const kx = vertical ? bx + bw * kv : bx + bw * ku, ky = vertical ? by + bh * ku : by + bh * kv;
    const kr = W * (0.07 + r() * 0.06);
    const [rx, ry] = vertical ? [kr * 0.7, kr * 1.3] : [kr * 1.3, kr * 0.7];
    const kg = A.createRadialGradient(kx, ky, 0, kx, ky, Math.max(rx, ry) * 1.8);
    kg.addColorStop(0, "rgba(40,20,8,.95)"); kg.addColorStop(0.35, "rgba(70,38,16,.85)"); kg.addColorStop(0.6, "rgba(120,72,36,.4)"); kg.addColorStop(1, "rgba(120,72,36,0)");
    A.fillStyle = kg; A.beginPath(); A.ellipse(kx, ky, rx * 1.8, ry * 1.8, 0, 0, Math.PI * 2); A.fill();
    A.strokeStyle = "rgba(225,170,110,.55)"; A.lineWidth = 2.2; A.beginPath(); A.ellipse(kx, ky, rx * 1.05, ry * 1.05, 0, Math.PI * 1.05, Math.PI * 1.7); A.stroke();
    P.half((x) => { if (x === P.H) { x.fillStyle = "rgba(60,60,60,.6)"; x.beginPath(); x.ellipse(kx, ky, rx, ry, 0, 0, Math.PI * 2); x.fill(); } });
  }
  // cracks: from an end, jagged, dark with a lit lip
  const nc = opts.cracks ?? (r() < 0.6 ? 1 + Math.floor(r() * 2) : 0);
  for (let k = 0; k < nc; k++) {
    const fromStart = r() < 0.5;
    const o = W * (0.2 + r() * 0.6), len = L * (0.12 + r() * 0.25);
    const pts: Array<[number, number]> = [];
    let s = fromStart ? 0 : L, off = o;
    for (let i = 0; i < 7; i++) {
      pts.push(vertical ? [bx + off, by + s] : [bx + s, by + off]);
      s += (fromStart ? 1 : -1) * len / 6; off += (r() - 0.5) * W * 0.06;
    }
    const draw = (x: C2, style: string, w: number, dy: number) => { x.strokeStyle = style; x.lineWidth = w; x.lineCap = "round"; x.lineJoin = "round"; x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py + dy) : x.moveTo(px, py + dy))); x.stroke(); };
    draw(A, "rgba(200,150,95,.3)", 2.0, 2.0);
    draw(A, "rgba(30,14,6,.9)", 2.6, 0);
    P.half((x) => { if (x === P.H) draw(x, "rgba(20,20,20,.9)", 4, 0); else draw(x, "rgb(150,235,0)", 4, 0); });
  }
  // edge wear: pale chips along the long edges + a lit top edge / dark bottom edge line
  for (let i = 0; i < 7; i++) {
    const s = r() * L, top = r() < 0.6, cw = 6 + r() * 22, ch = 3 + r() * 6;
    const px = vertical ? (top ? bx : bx + bw) : bx + s, py = vertical ? by + s : (top ? by : by + bh);
    A.fillStyle = `rgba(214,160,100,${0.55 + r() * 0.3})`;
    A.beginPath();
    if (vertical) { A.moveTo(px, py); A.lineTo(px + (top ? ch : -ch), py + cw * 0.3); A.lineTo(px + (top ? ch * 0.6 : -ch * 0.6), py + cw); A.lineTo(px, py + cw * 1.1); }
    else { A.moveTo(px, py); A.lineTo(px + cw * 0.3, py + (top ? ch : -ch)); A.lineTo(px + cw, py + (top ? ch * 0.6 : -ch * 0.6)); A.lineTo(px + cw * 1.1, py); }
    A.closePath(); A.fill();
    P.half((x) => { if (x === P.H) { x.fillStyle = "rgba(70,70,70,.8)"; x.beginPath(); x.arc(px + (vertical ? 0 : cw * 0.5), py + (vertical ? cw * 0.5 : 0), ch * 1.2, 0, Math.PI * 2); x.fill(); } });
  }
  A.fillStyle = "rgba(240,200,140,.35)";
  if (vertical) A.fillRect(bx, by, 3, bh); else A.fillRect(bx, by, bw, 3);
  A.fillStyle = "rgba(30,15,6,.45)";
  if (vertical) A.fillRect(bx + bw - 4, by, 4, bh); else A.fillRect(bx, by + bh - 4, bw, 4);
  // end-grain darkening at the board ends (dirt + AO)
  const eg = vertical ? A.createLinearGradient(bx, by, bx, by + bh) : A.createLinearGradient(bx, by, bx + bw, by);
  eg.addColorStop(0, "rgba(35,18,8,.28)"); eg.addColorStop(0.07, "rgba(35,18,8,0)"); eg.addColorStop(0.93, "rgba(35,18,8,0)"); eg.addColorStop(1, "rgba(35,18,8,.28)");
  A.fillStyle = eg; A.fillRect(bx, by, bw, bh);
  A.restore();
  P.half((x) => x.restore());
}

/** a face region painted with its board layout; gaps dark (they sit over the geometry gaps) */
function paintFace(P: Painter, r: () => number, rect: Rect, boards: Rect[], pal: WoodPal) {
  const [x0, y0, w, h] = rect;
  P.A.fillStyle = pal.gap; P.A.fillRect(x0, y0, w, h);
  P.half((x) => { x.fillStyle = x === P.H ? "#303030" : "rgb(90,250,0)"; x.fillRect(x0, y0, w, h); });
  for (const [u0, v0, u1, v1] of boards) {
    const bx = x0 + u0 * w, by = y0 + (1 - v1) * h, bw = (u1 - u0) * w, bh = (v1 - v0) * h;
    paintBoard(P, r, bx + 1, by + 1, bw - 2, bh - 2, pal);
  }
}

// -------------------------------------------------------------------------------------------------------- stencils
function distress(x: C2, r: () => number, rx: number, ry: number, rw: number, rh: number, n = 700) {
  x.save(); x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < n; i++) { x.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.5})`; x.beginPath(); x.arc(rx + r() * rw, ry + r() * rh, 0.5 + r() * 1.8, 0, Math.PI * 2); x.fill(); }
  // a few long scuffs through the paint
  for (let i = 0; i < 8; i++) { x.strokeStyle = `rgba(0,0,0,${0.4 + r() * 0.4})`; x.lineWidth = 1 + r() * 2; const px = rx + r() * rw, py = ry + r() * rh; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.3) * 60, py + (r() - 0.5) * 12); x.stroke(); }
  x.restore();
}

/** banana BUNCH silhouette (three bananas fanning from a stem, like the target art's stencil), filled, at (cx, cy), size s */
export function bunchPath(x: C2, cx: number, cy: number, s: number, rot = 0) {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  // stem
  x.beginPath(); x.moveTo(-0.05 * s, -0.5 * s); x.lineTo(0.05 * s, -0.5 * s); x.lineTo(0.06 * s, -0.36 * s); x.lineTo(-0.04 * s, -0.34 * s); x.closePath(); x.fill();
  // three curved bananas: each a crescent from the stem down-left, curling
  const one = (ang: number, len: number, fat: number) => {
    x.save(); x.translate(0, -0.36 * s); x.rotate(ang);
    x.beginPath();
    x.moveTo(-0.03 * s, 0);
    x.bezierCurveTo(-0.28 * s * fat, 0.18 * s, -0.3 * s * fat, 0.55 * s * len, 0.02 * s, 0.78 * s * len);
    x.bezierCurveTo(0.08 * s, 0.8 * s * len, 0.1 * s, 0.76 * s * len, 0.08 * s, 0.72 * s * len);
    x.bezierCurveTo(-0.14 * s * fat, 0.5 * s * len, -0.1 * s * fat, 0.2 * s, 0.05 * s, 0.02 * s);
    x.closePath(); x.fill();
    x.restore();
  };
  one(0.5, 1.0, 1.0); one(0.15, 1.05, 1.05); one(-0.22, 0.98, 0.95);
  x.restore();
}

/** outlined bunch (the loot-01 stencil draws the bunch as thick strokes with gaps between bananas) */
function stencilBunch(x: C2, cx: number, cy: number, s: number, col: string, gapCol: string | null) {
  x.fillStyle = col; bunchPath(x, cx, cy, s, -0.25);
  if (gapCol) {
    // carve thin separation lines between the bananas (reads as a drawn stencil, not a blob)
    x.save(); x.globalCompositeOperation = "destination-out"; x.strokeStyle = "#000"; x.lineWidth = s * 0.028; x.lineCap = "round";
    x.translate(cx, cy); x.rotate(-0.25); x.translate(0, -0.36 * s);
    for (const [ang, len] of [[0.34, 0.95], [-0.04, 1.0]] as Array<[number, number]>) {
      x.save(); x.rotate(ang); x.beginPath(); x.moveTo(-0.04 * s, 0.06 * s); x.bezierCurveTo(-0.22 * s, 0.24 * s, -0.22 * s, 0.52 * s * len, 0.0, 0.72 * s * len); x.stroke(); x.restore();
    }
    x.restore();
  }
}

/** loot-01 bunch stencil drawn like the target art's: a hand of four bananas as bold OUTLINES fanning down-left from a stem
 *  at the top right, tips curling up (a line drawing burnt into the planks, not a filled blob) */
function outlineBunch(x: C2, cx: number, cy: number, s: number, col: string) {
  x.save(); x.strokeStyle = col; x.lineJoin = "round"; x.lineCap = "round"; x.lineWidth = s * 0.042;
  const stem: [number, number] = [cx + s * 0.28, cy - s * 0.36];
  const bez = (p0: number[], p1: number[], p2: number[], u: number) => [0, 1].map((k) => (1 - u) * (1 - u) * p0[k] + 2 * (1 - u) * u * p1[k] + u * u * p2[k]);
  const fan: Array<[number, number, number]> = [[-0.42, 0.9, 0.2], [-0.12, 1.0, 0.21], [0.18, 0.97, 0.2], [0.46, 0.86, 0.18]];
  // back to front so the front bananas overlap (knock out their interior before stroking)
  for (const [a, len, fat] of fan) {
    const L = s * len, ca = Math.cos(a), sa = Math.sin(a);
    const rot = (dx: number, dy: number): [number, number] => [stem[0] + dx * ca - dy * sa, stem[1] + dx * sa + dy * ca];
    const p0 = rot(-s * 0.04, s * 0.05), p1 = rot(-L * 0.18, L * 0.72), p2 = rot(-L * 0.86, L * 0.52);
    const N = 26, side1: number[][] = [], side2: number[][] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = bez(p0, p1, p2, u), q = bez(p0, p1, p2, Math.min(1, u + 0.01)), q0 = bez(p0, p1, p2, Math.max(0, u - 0.01));
      const tx = q[0] - q0[0], ty = q[1] - q0[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      const hw = s * fat * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.9)), 0.75);
      side1.push([p[0] + nx * hw, p[1] + ny * hw]); side2.push([p[0] - nx * hw, p[1] - ny * hw]);
    }
    const path = () => { x.beginPath(); side1.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); for (let i = side2.length - 1; i >= 0; i--) x.lineTo(side2[i][0], side2[i][1]); x.closePath(); };
    x.save(); x.globalCompositeOperation = "destination-out"; path(); x.fill(); x.restore();
    path(); x.stroke();
    // a ridge line along each banana (the target art's inner stroke)
    x.save(); x.lineWidth = s * 0.018; x.globalAlpha = 0.8; x.beginPath();
    for (let i = 3; i <= N - 3; i++) { const u = i / N, p = bez(p0, p1, p2, u); const px = (side1[i][0] * 0.35 + p[0] * 0.65), py = (side1[i][1] * 0.35 + p[1] * 0.65); i === 3 ? x.moveTo(px, py) : x.lineTo(px, py); }
    x.stroke(); x.restore();
  }
  // the stem: a short thick stalk with a cut top
  x.lineWidth = s * 0.05; x.beginPath(); x.moveTo(stem[0] - s * 0.02, stem[1] + s * 0.06); x.lineTo(stem[0] + s * 0.05, stem[1] - s * 0.1); x.stroke();
  x.restore();
}

function stencilText(x: C2, text: string, cx: number, cy: number, size: number, maxW: number, col: string, box: boolean) {
  x.font = `900 ${Math.round(size)}px "Arial Black", Impact, "Helvetica Neue", Helvetica, sans-serif`;
  x.textAlign = "center"; x.textBaseline = "middle";
  const tw = Math.min(maxW, x.measureText(text).width);
  if (box) {
    // stencil box: a thin frame around the text (target art: BANANA CO. in a rectangle)
    x.strokeStyle = col; x.lineWidth = size * 0.1;
    x.strokeRect(cx - tw / 2 - size * 0.28, cy - size * 0.62, tw + size * 0.56, size * 1.2);
  }
  x.fillStyle = col; x.fillText(text, cx, cy + size * 0.04, maxW);
  // stencil bridges: small gaps cut through the letters (a real stencil's ties)
  x.save(); x.globalCompositeOperation = "destination-out"; x.fillStyle = "#000";
  const n = text.replace(/[^A-Z]/g, "").length;
  for (let i = 0; i < n; i++) { const px = cx - tw / 2 + ((i + 0.5) / n) * tw; x.fillRect(px - size * 0.02, cy - size * 0.02, size * 0.04, size * 0.13); }
  x.restore();
}

/** the burnt BANANA CO. stencil across a face region (loot-01): bunch above, boxed text below, distressed */
function faceStencil(P: Painter, r: () => number, rect: Rect, col: string, o: { bunchAt?: [number, number]; textAt?: [number, number]; size?: number; box?: boolean; text?: string; outline?: boolean; maxW?: number; textSize?: number } = {}) {
  const [x0, y0, w, h] = rect;
  const { c, x } = canvas(w, h);
  const s = (o.size ?? 0.34) * w;
  const [bu, bv] = o.bunchAt ?? [0.36, 0.34], [tu, tv] = o.textAt ?? [0.36, 0.62];
  if (o.outline) outlineBunch(x, bu * w, bv * h, s, col); else stencilBunch(x, bu * w, bv * h, s, col, col);
  stencilText(x, o.text ?? "BANANA CO.", tu * w, tv * h, o.textSize ? o.textSize * w : s * 0.24, w * (o.maxW ?? 0.42), col, o.box ?? true);
  distress(x, r, 0, 0, w, h, 380);
  P.A.drawImage(c, x0, y0);
  // burnt stencils sit a hair lower (the burn eats the grain) and are rougher
  P.half((xx) => { xx.globalAlpha = 0.35; xx.globalCompositeOperation = xx === P.H ? "multiply" : "source-over"; if (xx === P.H) xx.drawImage(c, x0, y0); xx.globalAlpha = 1; xx.globalCompositeOperation = "source-over"; });
}

// -------------------------------------------------------------------------------------------------------- trims
function paintBand(P: Painter, r: () => number, rect: Rect, gold: boolean) {
  const [x0, y0, w, h] = rect;
  const A = P.A;
  // near-white base (tinted per rarity by vertex colour). No value patches (they read as blotchy stains) — a clean
  // painted metal with a faint brushed streak and a handful of thin scratches (the target art's caps are clean colour + a few
  // light nicks; the edge wear comes from the bevel highlights / glint)
  A.fillStyle = "#f4f4f4"; A.fillRect(x0, y0, w, h);
  A.save(); A.beginPath(); A.rect(x0, y0, w, h); A.clip();
  for (let i = 0; i < 40; i++) {
    A.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "200,196,190"},${0.03 + r() * 0.03})`;
    A.beginPath(); A.ellipse(x0 + r() * w, y0 + r() * h, 60 + r() * 120, 20 + r() * 40, 0, 0, Math.PI * 2); A.fill();
  }
  // a few long diagonal scratches (darker bare metal + a light lip) — clean, sparse, like the target art
  // sparser, straight, all leaning the same way (scratches meeting in "^" chevrons, with two screws, read as a
  // FACE on every cap at 4K)
  const scratches: Array<[number, number, number, number, number]> = [];
  for (let i = 0; i < 6; i++) scratches.push([x0 + (i + 0.2 + r() * 0.6) / 6 * w, y0 + (0.15 + r() * 0.7) * h, 22 + r() * 40, -0.95 + (r() - 0.5) * 0.3, 0.9 + r() * 0.8]);
  for (const [px, py, len, a, lw] of scratches) {
    A.strokeStyle = "rgba(150,120,90,.42)"; A.lineWidth = lw; A.lineCap = "round";
    A.beginPath(); A.moveTo(px, py); A.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); A.stroke();
    A.strokeStyle = "rgba(255,255,255,.7)"; A.lineWidth = 1;
    A.beginPath(); A.moveTo(px + 1.5, py + 1.5); A.lineTo(px + Math.cos(a) * len + 1.5, py + Math.sin(a) * len + 1.5); A.stroke();
  }
  A.restore();
  P.half((x) => {
    x.save(); x.beginPath(); x.rect(x0, y0, w, h); x.clip();
    if (x === P.H) {
      x.fillStyle = "#8a8a8a"; x.fillRect(x0, y0, w, h);
      for (const [px, py, len, a] of scratches) { x.strokeStyle = "rgba(70,70,70,.6)"; x.lineWidth = 2; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke(); }
    } else {
      // glossy paint (rough ~0.27); gold: polished paint, metalness ≤ 0.1 (a metal-1 gold band mirrored the
      // jungle and read olive-khaki — the gold is albedo-driven, its highlights come from the glint)
      // the gold reads as polished metal (metalness .6, rough .25), not butter-yellow paint
      x.fillStyle = gold ? "rgb(255,64,152)" : "rgb(255,70,0)"; x.fillRect(x0, y0, w, h);
      for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(255,${gold ? 84 : 96},${gold ? 24 : 0},.35)`; x.beginPath(); x.ellipse(x0 + r() * w, y0 + r() * h, 30 + r() * 60, 6 + r() * 12, -0.5, 0, Math.PI * 2); x.fill(); }
    }
    x.restore();
  });
}

/** rope STRAND cell: u = along the rope, v = round one strand (v 0.5 faces out of the rope → lit, v 0 / 1 = the contact
 *  grooves → dark). Fine fibres run diagonally along the strand; the height makes each strand a rounded bulge. */
function paintRope(P: Painter, r: () => number, rect: Rect) {
  const [x0, y0, w, h] = rect;
  const A = P.A;
  const g = A.createLinearGradient(0, y0, 0, y0 + h);
  // (pale strands with long fibre lines read as combed hair): warm tan plies with a
  // strong lit crown → dark contact groove gradient (the target art's bead-like 3-ply rope), a few short soft fibre ticks
  // lighter, less saturated jute (target art: lit #eedab4, mid #cbae80, groove #7a5c3c)
  // a shade deeper (the studio key washed lighter plies to cream #f0dcb0 — target art lit #eedab4 / mid #cbae80)
  g.addColorStop(0, "#5e4329"); g.addColorStop(0.16, "#957551"); g.addColorStop(0.36, "#c4a576"); g.addColorStop(0.5, "#dcc295"); g.addColorStop(0.64, "#c4a576"); g.addColorStop(0.84, "#957551"); g.addColorStop(1, "#5e4329");
  A.fillStyle = g; A.fillRect(x0, y0, w, h);
  A.save(); A.beginPath(); A.rect(x0, y0, w, h); A.clip();
  for (let i = 0; i < 700; i++) {
    const px = x0 + r() * w, py = y0 + h * (0.2 + r() * 0.6), len = 3 + r() * 6;
    A.strokeStyle = r() < 0.5 ? `rgba(120,86,48,${0.1 + r() * 0.12})` : `rgba(250,228,186,${0.08 + r() * 0.1})`;
    A.lineWidth = 1 + r() * 1.2; A.beginPath(); A.moveTo(px, py); A.lineTo(px + len, py + len * 0.8); A.stroke();
  }
  A.restore();
  P.half((x) => {
    x.save(); x.beginPath(); x.rect(x0, y0, w, h); x.clip();
    if (x === P.H) {
      const hg = x.createLinearGradient(0, y0, 0, y0 + h); hg.addColorStop(0, "#5a5a5a"); hg.addColorStop(0.5, "#a0a0a0"); hg.addColorStop(1, "#5a5a5a");
      x.fillStyle = hg; x.fillRect(x0, y0, w, h);
      for (let i = 0; i < 300; i++) { const px = x0 + r() * w, py = y0 + h * (0.2 + r() * 0.6); x.strokeStyle = r() < 0.5 ? "rgba(60,60,60,.25)" : "rgba(200,200,200,.2)"; x.lineWidth = 1.4; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 5, py + 4); x.stroke(); }
    } else { x.fillStyle = "rgb(255,240,0)"; x.fillRect(x0, y0, w, h); x.fillStyle = "rgba(150,240,0,.6)"; x.fillRect(x0, y0, w, h * 0.08); x.fillRect(x0, y0 + h * 0.92, w, h * 0.08); }
    x.restore();
  });
}

function paintScrew(P: Painter, rect: Rect) {
  const [x0, y0, w, h] = rect, cx = x0 + w / 2, cy = y0 + h / 2, R = w * 0.46;
  const A = P.A;
  const g = A.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
  g.addColorStop(0, "#f4f6f8"); g.addColorStop(0.5, "#aeb4ba"); g.addColorStop(1, "#5c6168");
  A.fillStyle = "#5c6168"; A.fillRect(x0, y0, w, h);
  A.fillStyle = g; A.beginPath(); A.arc(cx, cy, R, 0, Math.PI * 2); A.fill();
  // slot
  A.save(); A.translate(cx, cy); A.rotate(-0.7);
  A.fillStyle = "#2a2c30"; A.fillRect(-R * 0.82, -R * 0.13, R * 1.64, R * 0.26);
  A.fillStyle = "rgba(255,255,255,.5)"; A.fillRect(-R * 0.8, R * 0.13, R * 1.6, R * 0.05);
  A.restore();
  P.half((x) => {
    if (x === P.H) { x.fillStyle = "#909090"; x.fillRect(x0, y0, w, h); x.save(); x.translate(cx, cy); x.rotate(-0.7); x.fillStyle = "#101010"; x.fillRect(-R * 0.82, -R * 0.13, R * 1.64, R * 0.26); x.restore(); }
    else { x.fillStyle = "rgb(255,90,255)"; x.fillRect(x0, y0, w, h); }
  });
}

function paintFlat(P: Painter, rect: Rect, col: string, rough: number, metal: number) {
  const [x0, y0, w, h] = rect;
  P.A.fillStyle = col; P.A.fillRect(x0, y0, w, h);
  P.half((x) => { x.fillStyle = x === P.H ? "#808080" : `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`; x.fillRect(x0, y0, w, h); });
}

/** round banana medallion (legendary side / supply lid): gold ring, dark disc, a gold banana */
function paintMedal(P: Painter, rect: Rect, kong: boolean) {
  const [x0, y0, w, h] = rect, cx = x0 + w / 2, cy = y0 + h / 2, R = w * 0.48;
  const A = P.A;
  A.fillStyle = "#e9e9e9"; A.fillRect(x0, y0, w, h);
  const g = A.createLinearGradient(cx - R, cy - R, cx + R, cy + R); g.addColorStop(0, "#fff0a0"); g.addColorStop(0.5, "#f6c21a"); g.addColorStop(1, "#b67e08");
  if (!kong) {
    // a GOLD coin (not a dark porthole) — a deep-gold field, a dark engraved
    // ring, two fat raised bananas with dark outlines and lit ridges (the loot-03 target art)
    // the loot-03 target art's medallion at 4K = a fat gold bezel round a DARK chocolate field with two BRIGHT lemon bananas
    // (an all-gold coin read as one orange disc at sheet scale; the contrast is what reads)
    const f = A.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * 0.85); f.addColorStop(0, "#5a3620"); f.addColorStop(0.7, "#3b2213"); f.addColorStop(1, "#24140a");
    A.fillStyle = f; A.beginPath(); A.arc(cx, cy, R * 0.8, 0, Math.PI * 2); A.fill();
    A.strokeStyle = "#6a4204"; A.lineWidth = R * 0.05; A.beginPath(); A.arc(cx, cy, R * 0.76, 0, Math.PI * 2); A.stroke();
    A.strokeStyle = g; A.lineWidth = R * 0.14; A.beginPath(); A.arc(cx, cy, R * 0.87, 0, Math.PI * 2); A.stroke();
    for (const [dx, dy, sc, rot] of [[-0.04, -0.13, 1.25, -0.5], [0.04, 0.15, 1.25, -0.45]] as Array<[number, number, number, number]>) {
      A.fillStyle = "#ffdc1c"; bananaPath(A, cx + R * dx, cy + R * dy, R * sc, rot); A.fill();
      A.strokeStyle = "#1e1006"; A.lineWidth = R * 0.045; A.stroke();
      A.save(); A.globalAlpha = 0.7; A.fillStyle = "#fff8d0"; bananaPath(A, cx + R * dx - R * 0.03, cy + R * dy - R * 0.06, R * sc * 0.62, rot); A.fill(); A.restore();
    }
  }
  else {
    A.fillStyle = "#3b2416"; A.beginPath(); A.arc(cx, cy, R * 0.8, 0, Math.PI * 2); A.fill();
    A.strokeStyle = g; A.lineWidth = R * 0.14; A.beginPath(); A.arc(cx, cy, R * 0.86, 0, Math.PI * 2); A.stroke();
  }
  A.fillStyle = g;
  if (kong) {
    // kong face with a little crown (supply crate medallion) — the shared gorilla emblem
    paintKong(A, cx, cy + R * 0.12, R * 0.5, "#f6c21a", "#2c170b", { light: "#ffe27a", crown: true, line: 0.06 });
  }
  P.half((x) => {
    if (x === P.H) { x.fillStyle = "#707070"; x.fillRect(x0, y0, w, h); x.fillStyle = "#b0b0b0"; x.beginPath(); x.arc(cx, cy, R * 0.93, 0, Math.PI * 2); x.fill(); x.fillStyle = "#606060"; x.beginPath(); x.arc(cx, cy, R * 0.78, 0, Math.PI * 2); x.fill(); }
    else { x.fillStyle = "rgb(255,70,210)"; x.fillRect(x0, y0, w, h); x.fillStyle = "rgb(255,160,0)"; x.beginPath(); x.arc(cx, cy, R * 0.78, 0, Math.PI * 2); x.fill(); }
  });
}

// -------------------------------------------------------------------------------------------------------- supply
/** cream painted boards (loot-02): pale paint over wood, chipped to wood at the edges, faded decals */
function paintSupplyFace(P: Painter, r: () => number, rect: Rect, boards: Rect[], decal: "front" | "side" | "top") {
  const [x0, y0, w, h] = rect;
  paintFace(P, r, rect, boards, WOOD);
  const A = P.A;
  const { c, x } = canvas(w, h);
  for (const [u0, v0, u1, v1] of boards) {
    const bx = u0 * w + 3, by = (1 - v1) * h + 3, bw = (u1 - u0) * w - 6, bh = (v1 - v0) * h - 6;
    const g = x.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, "#f7ecc6"); g.addColorStop(1, "#e3d09d");
    x.fillStyle = g; x.fillRect(bx, by, bw, bh);
    for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(190,165,110,${0.08 + r() * 0.12})`; x.beginPath(); x.ellipse(bx + r() * bw, by + r() * bh, 10 + r() * 60, 3 + r() * 10, 0, 0, Math.PI * 2); x.fill(); }
  }
  // decals
  if (decal === "front") {
    // big faded banana lower left, kong medallion right, a green leaf behind it
    // a BOLD banana decal (the target art's saturated yellow banana with a darker shade side + outline)
    x.fillStyle = "#f4c417"; bananaPath(x, w * 0.3, h * 0.66, w * 0.62, -1.15); x.fill();
    x.strokeStyle = "#b98404"; x.lineWidth = 9; x.stroke();
    x.save(); x.clip(); x.fillStyle = "rgba(200,140,0,.55)"; bananaPath(x, w * 0.36, h * 0.72, w * 0.62, -1.15); x.fill(); x.restore();
    x.fillStyle = "rgba(255,244,190,.75)"; bananaPath(x, w * 0.27, h * 0.61, w * 0.38, -1.15); x.fill();
    x.fillStyle = "#3f8f2a"; x.beginPath(); x.moveTo(w * 0.62, h * 0.9); x.bezierCurveTo(w * 0.68, h * 0.5, w * 0.8, h * 0.25, w * 0.98, h * 0.08); x.bezierCurveTo(w * 1.0, h * 0.35, w * 0.9, h * 0.7, w * 0.62, h * 0.9); x.fill();
    x.strokeStyle = "#2c6d1c"; x.lineWidth = 5; x.beginPath(); x.moveTo(w * 0.64, h * 0.88); x.bezierCurveTo(w * 0.72, h * 0.6, w * 0.84, h * 0.36, w * 0.97, h * 0.12); x.stroke();
  } else if (decal === "side") {
    x.save(); x.translate(w * 0.5, h * 0.5); x.rotate(0.08);
    x.font = `900 ${Math.round(w * 0.12)}px "Arial Black", Impact, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = "rgba(92,58,34,.85)"; x.fillText("BANANA CO.", 0, 0, w * 0.86); x.restore();
  }
  distress(x, r, 0, 0, w, h, 1600);
  // edge wear to the wood beneath: knock the paint out along board edges
  x.save(); x.globalCompositeOperation = "destination-out";
  for (const [u0, v0, u1, v1] of boards) {
    const bx = u0 * w, by = (1 - v1) * h, bw = (u1 - u0) * w, bh = (v1 - v0) * h;
    for (let i = 0; i < 14; i++) { const top = r() < 0.5; x.beginPath(); x.ellipse(bx + r() * bw, top ? by + 4 : by + bh - 4, 6 + r() * 20, 3 + r() * 7, 0, 0, Math.PI * 2); x.fill(); }
  }
  x.restore();
  A.drawImage(c, x0, y0);
  P.half((xx) => { if (xx !== P.H) { xx.globalAlpha = 0.7; xx.fillStyle = "rgb(255,150,0)"; xx.fillRect(x0, y0, w, h); xx.globalAlpha = 1; } });
}

// -------------------------------------------------------------------------------------------------------- build
const cache = new Map<CrateStyle, CrateAtlas>();

export function crateAtlas(style: CrateStyle = "classic"): CrateAtlas {
  const hit = cache.get(style);
  if (hit) return hit;
  const r = rng(style === "classic" ? 31 : style === "lineup" ? 57 : 83);
  const a = canvas(ATLAS_W, ATLAS_H), hc = canvas(ATLAS_W / 2, ATLAS_H / 2), rc = canvas(ATLAS_W / 2, ATLAS_H / 2);
  const P = new Painter(a.x, hc.x, rc.x);
  if (style === "supply") {
    paintSupplyFace(P, r, REG.front, SUPPLY_BOARDS.front, "front");
    paintSupplyFace(P, r, REG.side2, SUPPLY_BOARDS.side2, "side");
    paintSupplyFace(P, r, REG.side, SUPPLY_BOARDS.side, "side");
    paintSupplyFace(P, r, REG.top, SUPPLY_BOARDS.top, "top");
  } else {
    paintFace(P, r, REG.front, BOARDS.front, WOOD);
    paintFace(P, r, REG.side2, BOARDS.side2, WOOD);
    paintFace(P, r, REG.side, BOARDS.side, WOOD);
    paintFace(P, r, REG.top, BOARDS.top, WOOD);
    if (style === "classic") {
      // loot-01: burnt-brown bunch + boxed BANANA CO. on the front; nothing else
      // centred on the planks BETWEEN the corner posts (guards cover u < 0.22 / u > 0.78), bigger, darker, legible
      // (never cut in half by a corner post): a FILLED burnt bunch over the top + middle boards and
      // a big boxed BANANA CO. inside the bottom board (never across a board gap), all between the posts (u .24-.76)
      faceStencil(P, r, REG.front, "rgba(34,19,10,.88)", { bunchAt: [0.5, 0.36], textAt: [0.5, 0.845], size: 0.4, box: true, maxW: 0.46, textSize: 0.105 });
    } else {
      // loot-03: a PALE CREAM bunch + BANANA CO. on every face (side2 carries the medallion slot, top a faint banana)
      for (const k of ["front", "side", "side2"] as const) faceStencil(P, r, REG[k], "rgba(236,205,150,.9)", { bunchAt: [0.5, 0.36], textAt: [0.5, 0.8], size: 0.5, box: false });
      const [x0, y0, w, h] = REG.top;
      a.x.save(); a.x.globalAlpha = 0.28; a.x.fillStyle = "#e8c890"; bananaPath(a.x, x0 + w * 0.5, y0 + h * 0.5, w * 0.34, -0.4); a.x.fill(); a.x.restore();
    }
  }
  paintBand(P, r, REG.band, false);
  paintBand(P, r, REG.gold, true);
  paintRope(P, r, REG.rope);
  paintFace(P, r, REG.dark, [[0, 0, 1, 1]], { ...WOOD_INNER, base: "#4a2c18" });
  paintScrew(P, REG.screw);
  paintFlat(P, REG.flat, "#ffffff", 0.45, 0);
  paintFlat(P, REG.seam, "#ffffff", 0.3, 0);
  // glow: vertical gradient white → warm (interior light falloff, emissive)
  paintFlat(P, REG.glow, "#fff", 0.6, 0);
  { const [x0, y0, w, h] = REG.glow; const g = a.x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, "#fff6d0"); g.addColorStop(1, "#c89030"); a.x.fillStyle = g; a.x.fillRect(x0, y0, w, h); }
  paintFace(P, r, REG.inner, [[0, 0, 1, 0.32], [0, 0.34, 1, 0.66], [0, 0.68, 1, 1]], WOOD_INNER);
  paintMedal(P, REG.medal, false);
  paintMedal(P, REG.kong, true);
  // normal from height (wrapped Sobel is wrong for an atlas: clamp at the borders)
  const normal = heightToNormalClamp(hc.c, 5);
  // emissive mask: seam + glow regions, everything else black (quarter res: the seam cell carries a vertical profile)
  const ED = 4;
  const e = canvas(ATLAS_W / ED, ATLAS_H / ED);
  e.x.fillStyle = "#000"; e.x.fillRect(0, 0, e.c.width, e.c.height);
  const emit = (rect: Rect, col: string) => { const [x0, y0, w, h] = rect; e.x.fillStyle = col; e.x.fillRect(x0 / ED + 0.5, y0 / ED + 0.5, w / ED - 1, h / ED - 1); };
  {
    // the seam bead's emissive PROFILE (v = bottom → top of the bead): a hot core line (1.0) with coloured lips (≈0.3)
    // — the tone curve bleaches the core toward white-lemon while the lips stay saturated (the target art's neon seam)
    const [x0, y0, w, h] = REG.seam, ex = x0 / ED, ey = y0 / ED, ew = w / ED, eh = h / ED;
    for (let j = 0; j < eh; j++) {
      const t = (j + 0.5) / eh, d = Math.abs(t - 0.5) / 0.5;
      const lin = 0.26 + 0.74 * Math.exp(-Math.pow(d / 0.42, 2));
      const s = Math.round(Math.pow(lin, 1 / 2.2) * 255);
      e.x.fillStyle = `rgb(${s},${s},${s})`; e.x.fillRect(ex, ey + j, ew, 1);
    }
  }
  // interior glow: a FLAT mask (an 8-texel gradient bands) at a third of the seam's HDR core
  emit(REG.glow, "#8c8c8c");
  // (in world the legendary read olive-khaki): the rarity trim carries a faint self-glow of its own
  // rarity colour (≈3 % of the seam core) so a crate in jungle shade stays GOLD / green / blue instead of going khaki
  // under the green-blue ambient — the stylised-BR "the loot glows" read, far below the seam's intensity
  if (style !== "supply") { emit(REG.band, "#3a3a3a"); emit(REG.gold, "#404040"); }
  const emissiveMap = tex(e.c, true, 1); emissiveMap.minFilter = THREE.LinearFilter; emissiveMap.generateMipmaps = false;
  const out: CrateAtlas = { map: tex(a.c, true, 8), normalMap: normal, orm: tex(rc.c, false, 8), emissiveMap, style };
  cache.set(style, out);
  return out;
}

function heightToNormalClamp(hc: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = hc.width, h = hc.height;
  const src = hc.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = src[i * 4] / 255;
  const { c, x } = canvas(w, h);
  const img = x.createImageData(w, h), d = img.data;
  for (let j = 0; j < h; j++) {
    const jm = Math.max(0, j - 1) * w, j0 = j * w, jp = Math.min(h - 1, j + 1) * w;
    for (let i = 0; i < w; i++) {
      const im = Math.max(0, i - 1), ip = Math.min(w - 1, i + 1);
      const dx = (H[jm + ip] + 2 * H[j0 + ip] + H[jp + ip] - H[jm + im] - 2 * H[j0 + im] - H[jp + im]) * strength;
      const dy = (H[jp + im] + 2 * H[jp + i] + H[jp + ip] - H[jm + im] - 2 * H[jm + i] - H[jm + ip]) * strength;
      const l = Math.hypot(dx, dy, 1), k = (j0 + i) * 4;
      d[k] = ((-dx / l) * 0.5 + 0.5) * 255; d[k + 1] = ((dy / l) * 0.5 + 0.5) * 255; d[k + 2] = (1 / l) * 255; d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return tex(c, false, 8);
}

/** atlas UV of a point (s, t) ∈ [0,1]² inside a region (t up), inset by `pad` px so mips never bleed a neighbour */
export function regionUV(reg: Rect, s: number, t: number, pad = 6): [number, number] {
  const [x0, y0, w, h] = reg;
  const px = x0 + pad + Math.min(1, Math.max(0, s)) * (w - 2 * pad), py = y0 + pad + (1 - Math.min(1, Math.max(0, t))) * (h - 2 * pad);
  return [px / ATLAS_W, 1 - py / ATLAS_H];
}
