// interiors — canvas-painted textures for the room-furnishing kit. Every furniture texture is a LIGHT, near-neutral
// albedo with painted detail (grain, weave, chips, scratches, grime) that the per-vertex colour tints, so one texture
// per material family serves every palette. Floors, art, rugs and goods are full-colour atlases. All lazy + cached.
import * as THREE from "three";

type Rng = () => number;
export function rngOf(seed: number): Rng {
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function cv(w: number, h = w, readBack = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement("canvas"); el.width = w; el.height = h;
  // (a canvas read back with getImageData stays on the CPU — a GPU canvas stalls on the busy GPU)
  return [el, el.getContext("2d", readBack ? { willReadFrequently: true } : undefined)!];
}
function toTex(el: HTMLCanvasElement, srgb = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
/** soft value noise, tileable (drawn as upscaled random grids, several octaves) */
function noise(c: CanvasRenderingContext2D, S: number, seed: number, alpha: number, blend: GlobalCompositeOperation = "overlay", oct = 5, dark = false) {
  const r = rngOf(seed);
  c.save(); c.globalCompositeOperation = blend; c.imageSmoothingEnabled = true;
  for (let o = 0; o < oct; o++) {
    const n = 4 << o, [el, g] = cv(n, n), img = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = dark ? r() * 128 : r() * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    c.globalAlpha = alpha / (o * 0.6 + 1);
    // tileable: draw 2×2 so the bilinear blur wraps
    const [big, bg] = cv(n * 2, n * 2);
    bg.drawImage(el, 0, 0); bg.drawImage(el, n, 0); bg.drawImage(el, 0, n); bg.drawImage(el, n, n);
    c.drawImage(big, n / 2, n / 2, n, n, 0, 0, S, S);
  }
  c.restore();
}
function specks(c: CanvasRenderingContext2D, S: number, seed: number, n: number, color: string, rMin: number, rMax: number, alpha: number) {
  const r = rngOf(seed);
  c.save(); c.fillStyle = color;
  for (let i = 0; i < n; i++) { c.globalAlpha = alpha * (0.4 + r() * 0.6); const x = r() * S, y = r() * S, rr = rMin + r() * (rMax - rMin); c.beginPath(); c.ellipse(x, y, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); c.fill(); }
  c.restore();
}
function scratch(c: CanvasRenderingContext2D, S: number, seed: number, n: number, color: string, alpha: number, len = 40) {
  const r = rngOf(seed);
  c.save(); c.strokeStyle = color; c.lineCap = "round";
  for (let i = 0; i < n; i++) { c.globalAlpha = alpha * (0.3 + r() * 0.7); c.lineWidth = 0.6 + r() * 1.4; const x = r() * S, y = r() * S, a = r() * Math.PI, l = len * (0.3 + r()); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.35); c.stroke(); }
  c.restore();
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture { let t = cache.get(key); if (!t) { t = make(); cache.set(key, t); } return t; }

// ------------------------------------------------------------------------------------------------ furniture families
/** light wood grain along U (1 tile ≈ 1 m) with knots and a satin sheen variance */
export const woodTex = () => cached("wood", () => {
  const S = 512, [el, c] = cv(S);
  c.fillStyle = "#e9d8bf"; c.fillRect(0, 0, S, S);
  const r = rngOf(11);
  for (let i = 0; i < 90; i++) {
    const y = r() * S, amp = 2 + r() * 6, f = 1 + r() * 3, ph = r() * 6;
    c.strokeStyle = `rgba(${120 + r() * 40},${80 + r() * 30},${45 + r() * 20},${0.1 + r() * 0.22})`; c.lineWidth = 0.8 + r() * 2.6;
    c.beginPath();
    for (let x = -4; x <= S + 4; x += 8) { const yy = y + Math.sin((x / S) * Math.PI * 2 * f + ph) * amp; if (x < 0) c.moveTo(x, yy); else c.lineTo(x, yy); }
    c.stroke();
  }
  for (let k = 0; k < 5; k++) { const x = r() * S, y = r() * S; const g = c.createRadialGradient(x, y, 1, x, y, 10 + r() * 8); g.addColorStop(0, "rgba(90,55,30,0.55)"); g.addColorStop(1, "rgba(90,55,30,0)"); c.fillStyle = g; c.beginPath(); c.ellipse(x, y, 22, 8, 0, 0, Math.PI * 2); c.fill(); }
  noise(c, S, 12, 0.18);
  scratch(c, S, 13, 40, "#fff6e6", 0.18, 30);
  return toTex(el);
});
/** painted surface: near white, faint brush mottling, chips showing primer + dark nicks, grime toward the bottom (v=0) */
export const paintTex = () => cached("paint", () => {
  const S = 512, [el, c] = cv(S);
  c.fillStyle = "#f4f0e8"; c.fillRect(0, 0, S, S);
  noise(c, S, 21, 0.12);
  const r = rngOf(22);
  c.strokeStyle = "rgba(200,190,175,0.05)"; c.lineWidth = 6;
  for (let i = 0; i < 24; i++) { const y = r() * S; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(S * 0.3, y + r() * 6 - 3, S * 0.6, y + r() * 6 - 3, S, y); c.stroke(); }
  specks(c, S, 23, 30, "#c9b89a", 2, 7, 0.55);     // chipped paint → primer
  specks(c, S, 24, 50, "#6e5a44", 0.6, 2.2, 0.5);  // dark nicks
  scratch(c, S, 25, 30, "#8a7a66", 0.22, 26);
  return toTex(el);
});
export const fabricTex = () => cached("fabric", () => {
  // soft woven cloth: a fine, low-contrast twill (reads as fabric up close, flat colour at 5 m — no plaid)
  const S = 512, [el, c] = cv(S);
  c.fillStyle = "#eee8de"; c.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 3) { c.fillStyle = `rgba(${y % 6 ? "255,255,255" : "110,100,90"},0.05)`; c.fillRect(0, y, S, 1.5); }
  for (let x = 0; x < S; x += 3) { c.fillStyle = `rgba(${x % 6 ? "255,255,255" : "110,100,90"},0.04)`; c.fillRect(x, 0, 1.5, S); }
  noise(c, S, 31, 0.2);
  specks(c, S, 32, 24, "#9b8f80", 10, 30, 0.08);   // soft soiling
  scratch(c, S, 33, 30, "#ffffff", 0.12, 50);      // pile highlights
  return toTex(el);
});
export const metalTex = () => cached("metal", () => {
  const S = 512, [el, c] = cv(S);
  c.fillStyle = "#e4e6e6"; c.fillRect(0, 0, S, S);
  const r = rngOf(41);
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "90,95,100"},${0.03 + r() * 0.05})`; c.fillRect(0, r() * S, S, 1 + r() * 2); }
  noise(c, S, 42, 0.12);
  scratch(c, S, 43, 90, "#ffffff", 0.3, 50);
  scratch(c, S, 44, 40, "#5a5048", 0.25, 30);
  specks(c, S, 45, 14, "#9a6a42", 4, 16, 0.22);   // rust bloom
  return toTex(el);
});
export const stoneTex = () => cached("stone", () => {
  const S = 512, [el, c] = cv(S);
  c.fillStyle = "#ddd6c8"; c.fillRect(0, 0, S, S);
  noise(c, S, 51, 0.35, "overlay", 6);
  specks(c, S, 52, 90, "#8f8778", 1, 5, 0.35);
  specks(c, S, 53, 20, "#6f8a52", 6, 20, 0.18); // moss
  const r = rngOf(54);
  c.strokeStyle = "rgba(70,60,50,0.4)"; c.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) { let x = r() * S, y = r() * S; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; c.lineTo(x, y); } c.stroke(); }
  return toTex(el);
});
export const leafTex = () => cached("leaf", () => {
  const S = 256, [el, c] = cv(S);
  c.fillStyle = "#d8ecc4"; c.fillRect(0, 0, S, S);
  const r = rngOf(61);
  c.strokeStyle = "rgba(255,255,240,0.35)"; c.lineWidth = 2;
  for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 30, y - 20 - r() * 20); c.stroke(); }
  noise(c, S, 62, 0.25);
  return toTex(el);
});
/** wall plaster: soft mottling, hairline cracks, scuffs + grime in the lower band (v 0..0.3 of a 3 m tile) */
export const plasterTex = () => cached("plaster", () => {
  const S = 512, [el, c] = cv(S);
  c.fillStyle = "#f3eee4"; c.fillRect(0, 0, S, S);
  noise(c, S, 71, 0.16);
  const r = rngOf(72);
  c.strokeStyle = "rgba(110,95,75,0.22)"; c.lineWidth = 1;
  for (let i = 0; i < 3; i++) { let x = r() * S, y = r() * S; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 26; y += r() * 16; c.lineTo(x, y); } c.stroke(); }
  scratch(c, S, 73, 40, "#8a7358", 0.2, 34);
  specks(c, S, 74, 12, "#b7a585", 10, 30, 0.1);
  return toTex(el);
});

// ------------------------------------------------------------------------------------------------ floors (full colour)
export type FloorKind = "planks" | "boards" | "tiles" | "checker" | "concrete" | "stone" | "deck";
/** 1 tile = FLOOR_TILE_M metres */
export const FLOOR_TILE_M: Record<FloorKind, number> = { planks: 2, boards: 2, tiles: 1.2, checker: 1.2, concrete: 3, stone: 2.4, deck: 2 };
export const floorTex = (k: FloorKind) => cached(`floor-${k}`, () => {
  const S = 1024, [el, c] = cv(S);
  const r = rngOf(100 + k.length * 7);
  const planks = (base: string[], rows: number, gap: string, wear: number) => {
    const h = S / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * S * 0.5;
      while (x < S) {
        const len = S * (0.35 + r() * 0.45), col = base[Math.floor(r() * base.length)];
        c.fillStyle = col; c.fillRect(x, i * h, len, h);
        // grain
        for (let k2 = 0; k2 < 8; k2++) { c.strokeStyle = `rgba(60,35,15,${0.06 + r() * 0.1})`; c.lineWidth = 1 + r() * 2; const y = i * h + r() * h; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.7, y + (r() - 0.5) * 6, x + len, y); c.stroke(); }
        // bevelled edges: light top, dark bottom, end joint
        c.fillStyle = "rgba(255,240,215,0.18)"; c.fillRect(x, i * h, len, 3);
        c.fillStyle = gap; c.fillRect(x, (i + 1) * h - 3, len, 3); c.fillRect(x + len - 3, i * h, 3, h);
        // nail heads
        c.fillStyle = "rgba(40,30,25,0.55)"; for (const nx of [x + 10, x + len - 14]) { c.beginPath(); c.arc(nx, i * h + h * 0.3, 2.2, 0, 7); c.arc(nx, i * h + h * 0.7, 2.2, 0, 7); c.fill(); }
        x += len;
      }
    }
    noise(c, S, 101, 0.14);
    specks(c, S, 102, 40 * wear, "#3a2616", 3, 14, 0.18);
    scratch(c, S, 103, 120 * wear, "#fff1dc", 0.14, 40);
  };
  switch (k) {
    case "planks": planks(["#b77a45", "#a86d3c", "#c28550", "#9d6436", "#b47444"], 8, "rgba(45,25,12,0.75)", 1); break;
    case "boards": planks(["#a9875c", "#9a7a50", "#b39064", "#8f7048"], 6, "rgba(40,28,15,0.8)", 1.6); break;
    case "deck": planks(["#8a5b36", "#7d5230", "#94633c", "#734a2a"], 10, "rgba(20,14,10,0.9)", 1.3); break;
    case "tiles": case "checker": {
      const n = 6, t = S / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const col = k === "checker" ? ((i + j) % 2 ? "#2f3a3c" : "#ece5d6") : ["#e9dcc5", "#e3d3b8", "#efe4cf"][Math.floor(r() * 3)];
        c.fillStyle = col; c.fillRect(i * t, j * t, t, t);
        c.fillStyle = "rgba(255,255,255,0.14)"; c.fillRect(i * t + 4, j * t + 4, t - 8, 4);
      }
      c.fillStyle = "rgba(120,110,95,0.9)";
      for (let i = 0; i <= n; i++) { c.fillRect(i * t - 3, 0, 6, S); c.fillRect(0, i * t - 3, S, 6); }
      noise(c, S, 111, 0.12);
      specks(c, S, 112, 30, "#6d5f4c", 4, 18, 0.14);
      scratch(c, S, 113, 60, "#5a4e40", 0.14, 40);
      break;
    }
    case "concrete": {
      c.fillStyle = "#a9a59d"; c.fillRect(0, 0, S, S);
      noise(c, S, 121, 0.4, "overlay", 6);
      specks(c, S, 122, 30, "#6e685e", 20, 70, 0.14);          // oil / water stains
      specks(c, S, 123, 300, "#d8d3c8", 1, 3, 0.35);
      c.strokeStyle = "rgba(60,58,52,0.55)"; c.lineWidth = 3;   // saw cuts
      c.beginPath(); c.moveTo(0, S / 2); c.lineTo(S, S / 2); c.moveTo(S / 2, 0); c.lineTo(S / 2, S); c.stroke();
      c.fillStyle = "rgba(230,190,40,0.55)"; c.fillRect(S * 0.08, 0, 14, S);   // a worn safety line
      scratch(c, S, 124, 80, "#4a463f", 0.25, 60);
      break;
    }
    case "stone": {
      c.fillStyle = "#b9ab93"; c.fillRect(0, 0, S, S);
      const n = 4, t = S / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const off = j % 2 ? t / 2 : 0, x = i * t + off, y = j * t;
        for (const xx of [x, x - S]) {
          c.fillStyle = ["#c1b298", "#b3a387", "#cabba0", "#a99a80"][Math.floor(r() * 4)];
          c.beginPath(); (c as CanvasRenderingContext2D & { roundRect: (...a: number[]) => void }).roundRect(xx + 6, y + 6, t - 12, t - 12, 14); c.fill();
        }
      }
      noise(c, S, 131, 0.14, "overlay", 5);
      specks(c, S, 132, 16, "#6d8a4a", 6, 22, 0.16);
      specks(c, S, 133, 200, "#5e5446", 1, 4, 0.3);
      break;
    }
  }
  return toTex(el);
});

// ------------------------------------------------------------------------------------------------ atlases (full colour)
/** re-paint atlas cells as brush work: dabs follow a flow field, colours sampled from the flat composition */
function painterly(c: CanvasRenderingContext2D, C: number, cells: number[], seed: number) {
  const r = rngOf(seed);
  for (const i of cells) {
    const x0 = (i % 4) * C, y0 = Math.floor(i / 4) * C;
    const src = c.getImageData(x0, y0, C, C).data;
    const at = (x: number, y: number) => { const k = (Math.min(C - 1, Math.max(0, y | 0)) * C + Math.min(C - 1, Math.max(0, x | 0))) * 4; return [src[k], src[k + 1], src[k + 2]]; };
    c.save(); c.beginPath(); c.rect(x0, y0, C, C); c.clip();
    for (let pass = 0; pass < 3; pass++) {
      const n = [2600, 1800, 700][pass], len = [9, 6, 3.5][pass], wid = [3.2, 2.2, 1.4][pass];
      for (let k = 0; k < n; k++) {
        const x = r() * C, y = r() * C, [R, G, B] = at(x, y);
        // flow: along the local colour edge (a painter follows the forms), else a soft swirl
        const [R1, G1, B1] = at(x + 3, y), [R2, G2, B2] = at(x, y + 3);
        const gx = R1 + G1 + B1 - R - G - B, gy = R2 + G2 + B2 - R - G - B;
        const ang = Math.hypot(gx, gy) > 20 ? Math.atan2(gy, gx) + Math.PI / 2 : Math.sin(x * 0.05 + i) * 1.2 + Math.cos(y * 0.04) * 0.8;
        const j = (r() - 0.5) * 34, lum = pass === 2 ? 22 : 0;
        c.fillStyle = `rgb(${Math.max(0, Math.min(255, R + j + lum))},${Math.max(0, Math.min(255, G + j * 0.9 + lum))},${Math.max(0, Math.min(255, B + j * 0.8 + lum))})`;
        c.globalAlpha = pass === 2 ? 0.55 : 0.85;
        c.beginPath(); c.ellipse(x0 + x, y0 + y, len * (0.6 + r() * 0.8), wid * (0.7 + r() * 0.6), ang, 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;
    // varnish: warm vignette + a thin dark rabbet shadow along the frame edge
    const g = c.createRadialGradient(x0 + C / 2, y0 + C / 2, C * 0.25, x0 + C / 2, y0 + C / 2, C * 0.75);
    g.addColorStop(0, "rgba(255,230,180,0)"); g.addColorStop(1, "rgba(60,35,15,0.35)");
    c.fillStyle = g; c.fillRect(x0, y0, C, C);
    c.strokeStyle = "rgba(30,18,8,0.55)"; c.lineWidth = 6; c.strokeRect(x0 + 3, y0 + 3, C - 6, C - 6);
    c.restore();
  }
}
export const artTex = () => cached("art", () => {
  const C = 256, [el, c] = cv(C * 4, C * 2, true);
  const r = rngOf(201);
  const cell = (i: number, draw: (x: number, y: number) => void) => { const x = (i % 4) * C, y = Math.floor(i / 4) * C; c.save(); c.beginPath(); c.rect(x, y, C, C); c.clip(); draw(x, y); c.restore(); };
  // 0 island landscape
  cell(0, (x, y) => { const g = c.createLinearGradient(0, y, 0, y + C); g.addColorStop(0, "#5fb4e6"); g.addColorStop(0.55, "#bfe6f2"); g.addColorStop(0.56, "#2aa3b8"); g.addColorStop(1, "#1d6f96"); c.fillStyle = g; c.fillRect(x, y, C, C); c.fillStyle = "#f6e3a8"; c.beginPath(); c.ellipse(x + C * 0.55, y + C * 0.62, C * 0.35, C * 0.07, 0, 0, 7); c.fill(); c.fillStyle = "#3f9a45"; c.beginPath(); c.ellipse(x + C * 0.55, y + C * 0.55, C * 0.22, C * 0.12, 0, Math.PI, 0); c.fill(); c.strokeStyle = "#6b4a2a"; c.lineWidth = 6; c.beginPath(); c.moveTo(x + C * 0.66, y + C * 0.6); c.quadraticCurveTo(x + C * 0.7, y + C * 0.4, x + C * 0.62, y + C * 0.3); c.stroke(); c.fillStyle = "#2f8a3c"; for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(x + C * 0.62 + Math.cos(k * 1.3) * 22, y + C * 0.3 + Math.sin(k * 1.3) * 8, 26, 8, k * 1.3, 0, 7); c.fill(); } c.fillStyle = "#fff"; c.globalAlpha = 0.85; c.beginPath(); c.ellipse(x + C * 0.25, y + C * 0.2, 40, 14, 0, 0, 7); c.fill(); c.globalAlpha = 1; });
  // 1 banana still life
  cell(1, (x, y) => { c.fillStyle = "#7a3b2e"; c.fillRect(x, y, C, C); c.fillStyle = "#c98a4a"; c.fillRect(x, y + C * 0.7, C, C * 0.3); c.fillStyle = "#e9e1cf"; c.beginPath(); c.ellipse(x + C / 2, y + C * 0.72, C * 0.34, C * 0.08, 0, 0, 7); c.fill(); for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? "#f4c430" : "#e8b020"; c.strokeStyle = "#6b4d12"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x + C * 0.3 + k * 12, y + C * 0.68); c.quadraticCurveTo(x + C * 0.5 + k * 8, y + C * (0.3 + k * 0.03), x + C * 0.75, y + C * 0.45 + k * 6); c.quadraticCurveTo(x + C * 0.52 + k * 8, y + C * (0.42 + k * 0.03), x + C * 0.34 + k * 12, y + C * 0.7); c.fill(); c.stroke(); } });
  // 2 kong portrait (stylised silhouette, warm backdrop)
  cell(2, (x, y) => { const g = c.createRadialGradient(x + C / 2, y + C * 0.45, 10, x + C / 2, y + C / 2, C * 0.7); g.addColorStop(0, "#f2c46a"); g.addColorStop(1, "#b0562e"); c.fillStyle = g; c.fillRect(x, y, C, C); c.fillStyle = "#4a2e20"; c.beginPath(); c.ellipse(x + C / 2, y + C * 0.95, C * 0.42, C * 0.35, 0, Math.PI, 0); c.fill(); c.beginPath(); c.ellipse(x + C / 2, y + C * 0.45, C * 0.22, C * 0.24, 0, 0, 7); c.fill(); c.fillStyle = "#c89468"; c.beginPath(); c.ellipse(x + C / 2, y + C * 0.52, C * 0.14, C * 0.12, 0, 0, 7); c.fill(); c.fillStyle = "#fff"; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + C / 2 + s * 22, y + C * 0.42, 11, 13, 0, 0, 7); c.fill(); } c.fillStyle = "#1a1210"; for (const s of [-1, 1]) { c.beginPath(); c.arc(x + C / 2 + s * 21, y + C * 0.43, 6, 0, 7); c.fill(); } });
  // 3 sailing boat
  cell(3, (x, y) => { c.fillStyle = "#f3d9a4"; c.fillRect(x, y, C, C); c.fillStyle = "#e07a3a"; c.beginPath(); c.arc(x + C * 0.7, y + C * 0.35, 30, 0, 7); c.fill(); c.fillStyle = "#3b7fa8"; c.fillRect(x, y + C * 0.62, C, C * 0.38); c.fillStyle = "#6b3a22"; c.beginPath(); c.moveTo(x + C * 0.25, y + C * 0.62); c.lineTo(x + C * 0.72, y + C * 0.62); c.lineTo(x + C * 0.64, y + C * 0.72); c.lineTo(x + C * 0.32, y + C * 0.72); c.fill(); c.fillStyle = "#fbf6ea"; c.beginPath(); c.moveTo(x + C * 0.48, y + C * 0.2); c.lineTo(x + C * 0.48, y + C * 0.6); c.lineTo(x + C * 0.3, y + C * 0.6); c.fill(); c.fillStyle = "#e84b3c"; c.beginPath(); c.moveTo(x + C * 0.5, y + C * 0.24); c.lineTo(x + C * 0.5, y + C * 0.6); c.lineTo(x + C * 0.66, y + C * 0.6); c.fill(); });
  // 4 abstract mid-century shapes
  cell(4, (x, y) => { c.fillStyle = "#efe6d2"; c.fillRect(x, y, C, C); const cols = ["#2fb3a8", "#f1c232", "#e8722a", "#d9483b", "#3a86c8"]; for (let k = 0; k < 7; k++) { c.fillStyle = cols[k % 5]; c.globalAlpha = 0.9; if (k % 2) { c.beginPath(); c.arc(x + r() * C, y + r() * C, 20 + r() * 40, 0, 7); c.fill(); } else c.fillRect(x + r() * C * 0.7, y + r() * C * 0.7, 30 + r() * 60, 20 + r() * 50); } c.globalAlpha = 1; });
  // 5 mountain sunset
  cell(5, (x, y) => { const g = c.createLinearGradient(0, y, 0, y + C); g.addColorStop(0, "#ff9a5a"); g.addColorStop(0.6, "#ffd58a"); g.addColorStop(1, "#ffe9c0"); c.fillStyle = g; c.fillRect(x, y, C, C); c.fillStyle = "#6a4a7a"; c.beginPath(); c.moveTo(x, y + C * 0.8); c.lineTo(x + C * 0.35, y + C * 0.35); c.lineTo(x + C * 0.6, y + C * 0.65); c.lineTo(x + C * 0.8, y + C * 0.45); c.lineTo(x + C, y + C * 0.75); c.lineTo(x + C, y + C); c.lineTo(x, y + C); c.fill(); c.fillStyle = "#3d7a4a"; c.fillRect(x, y + C * 0.85, C, C * 0.15); });
  // 6 sea chart
  cell(6, (x, y) => { c.fillStyle = "#e8d6a8"; c.fillRect(x, y, C, C); c.strokeStyle = "rgba(90,70,40,0.35)"; c.lineWidth = 1; for (let k = 0; k < C; k += 32) { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + k, y + C); c.moveTo(x, y + k); c.lineTo(x + C, y + k); c.stroke(); } c.fillStyle = "#b9a36a"; c.strokeStyle = "#6b4d2a"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x + 60, y + 90); c.bezierCurveTo(x + 120, y + 40, x + 200, y + 80, x + 180, y + 150); c.bezierCurveTo(x + 150, y + 210, x + 80, y + 190, x + 60, y + 90); c.fill(); c.stroke(); c.strokeStyle = "#b8322a"; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(x + 20, y + 230); c.quadraticCurveTo(x + 90, y + 200, x + 130, y + 130); c.stroke(); c.setLineDash([]); c.font = "bold 28px sans-serif"; c.fillStyle = "#b8322a"; c.fillText("X", x + 120, y + 138); c.strokeStyle = "#6b4d2a"; c.beginPath(); c.arc(x + 210, y + 40, 22, 0, 7); c.moveTo(x + 210, y + 12); c.lineTo(x + 210, y + 68); c.moveTo(x + 182, y + 40); c.lineTo(x + 238, y + 40); c.stroke(); });
  // 7 whiteboard
  cell(7, (x, y) => { c.fillStyle = "#f7f8f6"; c.fillRect(x, y, C, C); c.strokeStyle = "#2a6fb0"; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 20, y + 60); for (let k = 0; k < 8; k++) c.lineTo(x + 30 + k * 26, y + 60 + Math.sin(k) * 20); c.stroke(); c.strokeStyle = "#c23b30"; c.strokeRect(x + 30, y + 120, 70, 50); c.strokeRect(x + 150, y + 120, 70, 50); c.beginPath(); c.moveTo(x + 100, y + 145); c.lineTo(x + 150, y + 145); c.stroke(); c.font = "bold 26px sans-serif"; c.fillStyle = "#1f8a70"; c.fillText("CNVS.DEV", x + 40, y + 220); });
  // the six paintings get a PAINTED pass — thousands of short oriented brush dabs that
  // re-sample the underlying composition with value / hue jitter (impasto highlights on top), then a varnish vignette
  // (as one task the painted pass took ~170 ms on the main thread on the first kit call, so it runs one
  // painting per task after the texture exists: the canvas updates in place, needsUpdate re-uploads it)
  const tex = toTex(el, true, false);
  const steps: Array<() => void> = [0, 1, 2, 3, 4, 5].map((i) => () => painterly(c, C, [i], 211 + i));
  steps.push(() => noise(c, C * 4, 209, 0.08));   // canvas grain over everything
  const run = () => { const f = steps.shift(); if (!f) return; f(); tex.needsUpdate = true; setTimeout(run, 0); };
  if (typeof setTimeout === "function") setTimeout(run, 0); else while (steps.length) steps.shift()!();
  return tex;
});
/** rug atlas 2 × 2 */
export const rugTex = () => cached("rug", () => {
  const C = 512, [el, c] = cv(C * 2, C * 2);
  const pals = [["#b8412f", "#e9c77a", "#2e5d73", "#f3e6cc"], ["#2f7a7a", "#f2d49b", "#c25a3a", "#efe3c8"], ["#6a4f8a", "#f0c96a", "#3e8a6a", "#f4ead6"], ["#c9822f", "#2f4f6f", "#e8dcc0", "#8a3a2a"]];
  pals.forEach((p, i) => {
    const x = (i % 2) * C, y = Math.floor(i / 2) * C;
    c.fillStyle = p[0]; c.fillRect(x, y, C, C);
    c.strokeStyle = p[1]; c.lineWidth = 18; c.strokeRect(x + 30, y + 30, C - 60, C - 60);
    c.strokeStyle = p[3]; c.lineWidth = 6; c.strokeRect(x + 58, y + 58, C - 116, C - 116);
    c.fillStyle = p[2];
    for (let k = 0; k < 5; k++) { const cx = x + C / 2, cy = y + C / 2, s = 150 - k * 28; c.save(); c.translate(cx, cy); c.rotate(Math.PI / 4); c.fillStyle = k % 2 ? p[1] : p[2]; c.fillRect(-s / 2, -s / 2, s, s); c.restore(); }
    // fringe dots along the short ends
    c.fillStyle = p[3]; for (let k = 0; k < 24; k++) { c.fillRect(x + 12 + k * 20, y + 4, 6, 14); c.fillRect(x + 12 + k * 20, y + C - 18, 6, 14); }
  });
  noise(c, C * 2, 301, 0.18);
  specks(c, C * 2, 302, 60, "#3a2a1a", 8, 30, 0.1);
  return toTex(el, true, false);
});
/** goods atlas 4 × 4: cereal boxes, cans, jars, bottles, sacks, crates of fruit — front faces */
export const goodsTex = () => cached("goods", () => {
  const C = 128, [el, c] = cv(C * 4, C * 4);
  const r = rngOf(401);
  const cols = ["#e84b3c", "#f1c232", "#2fb3a8", "#3a86c8", "#e8722a", "#7bbf4a", "#b05ad0", "#f2e8d3"];
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * C, y = Math.floor(i / 4) * C, a = cols[i % 8], b = cols[(i * 3 + 2) % 8];
    c.fillStyle = a; c.fillRect(x, y, C, C);
    c.fillStyle = b; c.fillRect(x, y + C * 0.35, C, C * 0.3);
    c.fillStyle = "#fff"; c.globalAlpha = 0.85; c.beginPath(); c.ellipse(x + C / 2, y + C / 2, C * 0.26, C * 0.13, 0, 0, 7); c.fill(); c.globalAlpha = 1;
    c.fillStyle = a; c.font = `bold ${Math.round(C * 0.14)}px sans-serif`; c.textAlign = "center"; c.fillText(["MANGO", "BANANA", "COCO", "LIME", "PAPAYA", "KIWI", "GUAVA", "FIG"][i % 8], x + C / 2, y + C * 0.55);
    c.fillStyle = "rgba(0,0,0,0.18)"; c.fillRect(x, y + C - 10, C, 10);
    c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(x, y, C, 6);
    void r;
  }
  noise(c, C * 4, 402, 0.1);
  return toTex(el, true, false);
});
/** "BANANA CO." sign board */
export const signTex = () => cached("sign", () => {
  const [el, c] = cv(512, 128);
  c.fillStyle = "#1f5f5a"; c.fillRect(0, 0, 512, 128);
  c.strokeStyle = "#f1c232"; c.lineWidth = 8; c.strokeRect(8, 8, 496, 112);
  c.font = "900 64px 'Arial Black', Impact, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillStyle = "#0b2a28"; c.fillText("BANANA CO.", 259, 70); c.fillStyle = "#f6e7b8"; c.fillText("BANANA CO.", 256, 66);
  noise(c, 512, 501, 0.12);
  specks(c, 512, 502, 30, "#0e2826", 2, 8, 0.4);
  return toTex(el, true, false);
});
/** soft radial pool for fake lamp / window light (linear; the falloff is in RGB on black — the fx blend is dst·(1+src)) */
export const glowTex = () => cached("glow2", () => {
  const S = 128, [el, c] = cv(S);
  c.fillStyle = "#000"; c.fillRect(0, 0, S, S);
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgb(255,255,255)"); g.addColorStop(0.3, "rgb(150,150,150)"); g.addColorStop(0.6, "rgb(50,50,50)"); g.addColorStop(0.85, "rgb(10,10,10)"); g.addColorStop(1, "rgb(0,0,0)");
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  return toTex(el, false, false);
});
/** window light patch: soft-edged rectangle with a mullion cross shadow (RGB on black) */
export const windowLightTex = () => cached("winlight2", () => {
  const S = 128, [el, c] = cv(S);
  c.fillStyle = "#000"; c.fillRect(0, 0, S, S);
  c.filter = "blur(7px)";
  c.fillStyle = "#fff"; c.fillRect(18, 18, S - 36, S - 36);
  c.fillStyle = "#000"; c.fillRect(S / 2 - 3, 10, 6, S - 20); c.fillRect(10, S / 2 - 3, S - 20, 6);
  c.filter = "none";
  return toTex(el, false, false);
});

/** dressed sandstone blocks in running bond (temple walls): 1 tile = 2.4 m, light + tinted by the vertex colour */
export const blockTex = () => cached("blocks", () => {
  const S = 1024, [el, c] = cv(S);
  c.fillStyle = "#8f836c"; c.fillRect(0, 0, S, S);   // mortar
  const r = rngOf(601), rows = 6, rh = S / rows;
  for (let j = 0; j < rows; j++) {
    let x = j % 2 ? -rh * 0.9 : 0;
    while (x < S) {
      const bw = rh * (1.4 + r() * 1.1), v = 200 + Math.floor(r() * 30);
      const col = `rgb(${v},${v - 12 - Math.floor(r() * 10)},${v - 38 - Math.floor(r() * 12)})`;
      for (const xx of [x, x - S, x + S]) {
        c.fillStyle = col; c.beginPath(); (c as CanvasRenderingContext2D & { roundRect: (...a: number[]) => void }).roundRect(xx + 4, j * rh + 4, bw - 8, rh - 8, 10); c.fill();
        c.fillStyle = "rgba(255,245,225,0.22)"; c.fillRect(xx + 8, j * rh + 6, bw - 16, 5);          // lit top edge
        c.fillStyle = "rgba(60,45,30,0.25)"; c.fillRect(xx + 8, (j + 1) * rh - 11, bw - 16, 6);       // shadowed bottom
      }
      x += bw;
    }
  }
  noise(c, S, 602, 0.22, "overlay", 6);
  specks(c, S, 603, 120, "#6d6250", 1, 4, 0.35);
  specks(c, S, 604, 14, "#6f8a52", 10, 40, 0.16);     // moss patches
  scratch(c, S, 605, 40, "#5a4e3e", 0.3, 30);         // chips / cracks
  return toTex(el);
});

/** drop-ceiling: 2 × 2 acoustic tiles per 1.2 m texture tile, speckled, on white T-bars */
export const ceilTex = () => cached("ceil", () => {
  const S = 512, [el, c] = cv(S);
  c.fillStyle = "#e9e6de"; c.fillRect(0, 0, S, S);
  specks(c, S, 701, 1400, "#b9b3a6", 0.6, 1.8, 0.55);
  noise(c, S, 702, 0.08);
  specks(c, S, 703, 5, "#c8b48a", 14, 34, 0.12);   // a water stain or two
  c.fillStyle = "#f7f6f2"; for (const x of [0, S / 2]) { c.fillRect(x - 5, 0, 10, S); c.fillRect(0, x - 5, S, 10); }
  c.fillStyle = "rgba(90,90,90,0.35)"; for (const x of [0, S / 2]) { c.fillRect(x + 5, 0, 2, S); c.fillRect(0, x + 5, S, 2); }
  return toTex(el);
});

// ------------------------------------------------------------------------------------------------ more atlases
/** monitor / terminal UIs, atlas 4 × 2 (emissive, full colour): 0 code editor, 1 graphs, 2 island map, 3 CCTV grid,
 *  4 radar sweep, 5 server status, 6 cargo manifest (dock), 7 weather / tide chart */
export const screenTex = () => cached("screens", () => {
  const C = 256, [el, c] = cv(C * 4, C * 2), r = rngOf(801);
  const cell = (i: number, draw: (x: number, y: number) => void) => { const x = (i % 4) * C, y = Math.floor(i / 4) * C; c.save(); c.beginPath(); c.rect(x, y, C, C); c.clip(); c.fillStyle = "#07161b"; c.fillRect(x, y, C, C); draw(x, y); c.restore(); };
  const bar = (x: number, y: number, t: string, col = "#2fb3a8") => { c.fillStyle = col; c.fillRect(x, y, C, 18); c.fillStyle = "#04110f"; c.font = "bold 12px monospace"; c.fillText(t, x + 6, y + 13); };
  cell(0, (x, y) => { bar(x, y, "kong.ts — CNVS"); c.font = "11px monospace"; for (let k = 0; k < 17; k++) { let xx = x + 8 + (k % 5 ? 14 : 0) + (k % 3 ? 10 : 0); const cols = ["#7fdbca", "#f78c6c", "#c792ea", "#ffcb6b", "#82aaff", "#d6deeb"]; for (let t = 0; t < 4; t++) { const w = 12 + r() * 46; c.fillStyle = cols[Math.floor(r() * cols.length)]; c.fillRect(xx, y + 28 + k * 13, w, 6); xx += w + 6; if (xx > x + C - 30) break; } } c.fillStyle = "#f7f2e6"; c.fillRect(x + 60, y + 28 + 9 * 13, 2, 9); });
  cell(1, (x, y) => { bar(x, y, "POWER / TEMP", "#e8b04a"); c.strokeStyle = "#1f4a4f"; c.lineWidth = 1; for (let k = 0; k < 8; k++) { c.beginPath(); c.moveTo(x, y + 40 + k * 26); c.lineTo(x + C, y + 40 + k * 26); c.stroke(); } for (const [col, ph] of [["#2fe0c8", 0], ["#ff6a5a", 2], ["#ffd24a", 4]] as Array<[string, number]>) { c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); for (let k = 0; k <= 40; k++) { const xx = x + k * C / 40, yy = y + 130 + Math.sin(k * 0.35 + ph) * 35 + (r() - 0.5) * 16; if (k) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke(); } for (let k = 0; k < 10; k++) { c.fillStyle = k % 2 ? "#2fb3a8" : "#1f7f78"; const h = 20 + r() * 40; c.fillRect(x + 12 + k * 24, y + C - 8 - h, 16, h); } });
  cell(2, (x, y) => { c.fillStyle = "#0c3350"; c.fillRect(x, y, C, C); c.fillStyle = "#3f9a55"; c.beginPath(); c.ellipse(x + 128, y + 136, 86, 70, 0.3, 0, 7); c.fill(); c.fillStyle = "#6cc26a"; c.beginPath(); c.ellipse(x + 118, y + 128, 52, 40, 0.5, 0, 7); c.fill(); c.fillStyle = "#e8d6a8"; c.beginPath(); c.ellipse(x + 176, y + 176, 22, 12, 0.4, 0, 7); c.fill(); c.strokeStyle = "rgba(120,220,255,0.35)"; for (let k = 0; k < C; k += 32) { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + k, y + C); c.moveTo(x, y + k); c.lineTo(x + C, y + k); c.stroke(); } c.strokeStyle = "#ff5a4a"; c.lineWidth = 3; c.beginPath(); c.arc(x + 150, y + 110, 12, 0, 7); c.stroke(); bar(x, y, "ISLAND OPS"); });
  cell(3, (x, y) => { for (let k = 0; k < 4; k++) { const xx = x + (k % 2) * 128, yy = y + Math.floor(k / 2) * 128; const g = c.createLinearGradient(0, yy, 0, yy + 128); g.addColorStop(0, ["#5a7a8a", "#6a8a6a", "#8a7a6a", "#4a5a7a"][k]); g.addColorStop(1, "#1a2226"); c.fillStyle = g; c.fillRect(xx + 2, yy + 2, 124, 124); c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(xx + 20 + r() * 40, yy + 60, 30 + r() * 30, 50); c.fillStyle = "#ff4a3a"; c.fillRect(xx + 8, yy + 8, 6, 6); c.fillStyle = "#d6deeb"; c.font = "10px monospace"; c.fillText(`CAM ${k + 1}`, xx + 18, yy + 15); } for (let yy = 0; yy < C; yy += 3) { c.fillStyle = "rgba(255,255,255,0.05)"; c.fillRect(x, y + yy, C, 1); } });
  cell(4, (x, y) => { c.fillStyle = "#031a12"; c.fillRect(x, y, C, C); c.strokeStyle = "#1fbf6a"; c.lineWidth = 1.5; for (let k = 1; k <= 4; k++) { c.beginPath(); c.arc(x + 128, y + 128, k * 28, 0, 7); c.stroke(); } const g = c.createRadialGradient(x + 128, y + 128, 0, x + 128, y + 128, 112); g.addColorStop(0, "rgba(80,255,150,0.6)"); g.addColorStop(1, "rgba(80,255,150,0)"); c.fillStyle = g; c.beginPath(); c.moveTo(x + 128, y + 128); c.arc(x + 128, y + 128, 112, -0.2, 0.7); c.fill(); c.fillStyle = "#9dffc0"; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x + 128 + (r() - 0.5) * 180, y + 128 + (r() - 0.5) * 180, 3, 0, 7); c.fill(); } });
  cell(5, (x, y) => { bar(x, y, "RACK STATUS"); c.font = "11px monospace"; for (let k = 0; k < 12; k++) { const ok = r() > 0.15; c.fillStyle = ok ? "#2fe0a0" : "#ff6a4a"; c.fillRect(x + 10, y + 30 + k * 18, 10, 10); c.fillStyle = "#b8d8d4"; c.fillText(`node-${(k * 7 + 3).toString().padStart(2, "0")}`, x + 28, y + 39 + k * 18); c.fillStyle = "#1f4a4f"; c.fillRect(x + 110, y + 31 + k * 18, 130, 8); c.fillStyle = ok ? "#2fb3a8" : "#e8b04a"; c.fillRect(x + 110, y + 31 + k * 18, 20 + r() * 110, 8); } });
  cell(6, (x, y) => { c.fillStyle = "#f2efe4"; c.fillRect(x, y, C, C); bar(x, y, "MANIFEST — PEEL HARBOR", "#3a86c8"); c.font = "11px monospace"; for (let k = 0; k < 13; k++) { c.fillStyle = k % 2 ? "#e2ddd0" : "#f2efe4"; c.fillRect(x, y + 24 + k * 17, C, 17); c.fillStyle = "#223"; c.fillText(`KR-${(1000 + k * 37).toString()}  ${["BANANA", "MANGO", "COCO", "LIME"][k % 4]}  ${(r() * 90 + 10).toFixed(0)}t`, x + 8, y + 36 + k * 17); } });
  cell(7, (x, y) => { bar(x, y, "TIDE 06:40  ▲2.1m", "#e8b04a"); c.strokeStyle = "#62b8ff"; c.lineWidth = 3; c.beginPath(); for (let k = 0; k <= 60; k++) { const xx = x + k * C / 60, yy = y + 140 + Math.sin(k * 0.21) * 50; if (k) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke(); c.fillStyle = "rgba(98,184,255,0.18)"; c.lineTo(x + C, y + C); c.lineTo(x, y + C); c.fill(); c.fillStyle = "#ffd24a"; c.beginPath(); c.arc(x + 200, y + 60, 16, 0, 7); c.fill(); });
  noise(c, C * 4, 802, 0.05);
  return toTex(el, true, false);
});
/** neon signs, atlas 1 × 3 rows (tube strokes on transparent black; the material adds them): 0 "CNVS" lab logo,
 *  1 "OPEN" + banana, 2 a kong-head logo */
export const neonTex = () => cached("neon", () => {
  const W = 512, H = 160, [el, c] = cv(W, H * 3);
  c.fillStyle = "#000"; c.fillRect(0, 0, W, H * 3);
  const tube = (draw: () => void, col: string) => { c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineCap = "round"; c.lineJoin = "round"; c.shadowColor = col; for (const [lw, blur, a] of [[16, 30, 0.35], [9, 12, 0.7], [4, 0, 1]] as Array<[number, number, number]>) { c.globalAlpha = a; c.lineWidth = lw; c.shadowBlur = blur; draw(); } c.globalAlpha = 1; c.strokeStyle = "#fff"; c.lineWidth = 1.6; c.shadowBlur = 0; draw(); c.restore(); };
  c.font = "900 104px 'Arial Black', Impact, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  tube(() => c.strokeText("CNVS", W / 2, H / 2 + 4), "#35f0dc");
  tube(() => { c.strokeText("OPEN", W / 2 + 60, H * 1.5 + 4); c.beginPath(); c.arc(90, H * 1.5 - 40, 60, 0.6, 2.2); c.stroke(); }, "#ff5a8a");
  tube(() => { c.beginPath(); c.arc(W / 2, H * 2.5, 58, 0, 7); c.stroke(); c.beginPath(); c.arc(W / 2 - 62, H * 2.5 - 38, 22, 0, 7); c.stroke(); c.beginPath(); c.arc(W / 2 + 62, H * 2.5 - 38, 22, 0, 7); c.stroke(); c.beginPath(); c.ellipse(W / 2, H * 2.5 + 18, 30, 20, 0, 0, 7); c.stroke(); }, "#ffd23a");
  return toTex(el, true, false);
});
/** flame card: a soft teardrop mask in R, a flicker noise field in G (scrolled by the fire shader) */
export const flameTex = () => cached("flame", () => {
  const S = 128, [el, c] = cv(S), img = c.createImageData(S, S), r = rngOf(901);
  const grid = Array.from({ length: 17 * 17 }, () => r());
  const vn = (u: number, v: number) => { const x = u * 16, y = v * 16, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, g = (a: number, b: number) => grid[((b % 16) * 17) + (a % 16)]; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return (g(i, j) * (1 - sx) + g(i + 1, j) * sx) * (1 - sy) + (g(i, j + 1) * (1 - sx) + g(i + 1, j + 1) * sx) * sy; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = 1 - y / S;                    // v = 0 bottom
    const half = 0.42 * Math.pow(Math.max(0, 1 - v), 0.7) * Math.min(1, v * 6 + 0.35);
    const d = Math.abs(u - 0.5) / Math.max(half, 1e-3);
    const m = Math.max(0, 1 - d * d) * Math.min(1, (1 - v) * 1.6);
    const n = vn(u, v) * 0.6 + vn(u * 2, v * 2) * 0.3 + vn(u * 4, v * 4) * 0.1;
    const k = (y * S + x) * 4;
    img.data[k] = Math.round(m * 255); img.data[k + 1] = Math.round(n * 255); img.data[k + 2] = 0; img.data[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const t = toTex(el, false, true); t.generateMipmaps = true;
  return t;
});
/** soft contact shadow: white edges → dark centre (MULTIPLIED onto the floor) */
export const contactTex = () => cached("contact", () => {
  const S = 128, [el, c] = cv(S);
  c.fillStyle = "#fff"; c.fillRect(0, 0, S, S);
  c.filter = "blur(11px)";
  c.fillStyle = "#6a6a6a"; (c as CanvasRenderingContext2D & { roundRect: (...a: number[]) => void }).roundRect(26, 26, S - 52, S - 52, 16); c.fill();
  c.filter = "blur(4px)";
  c.fillStyle = "#4a4a4a"; (c as CanvasRenderingContext2D & { roundRect: (...a: number[]) => void }).roundRect(34, 34, S - 68, S - 68, 8); c.fill();
  c.filter = "none";
  return toTex(el, false, false);
});
/** lamp wall-wash: a lampshade throws a bright parabola up and a softer one down onto the wall behind it */
export const washTex = () => cached("wash", () => {
  const S = 128, [el, c] = cv(S), img = c.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S - 0.5) * 2, v = (0.5 - y / S) * 2;        // v up
    const up = v > 0 ? Math.max(0, 1 - (u * u) / (0.15 + v * 0.9)) * Math.exp(-v * 1.6) : 0;
    const dn = v < 0 ? Math.max(0, 1 - (u * u) / (0.12 - v * 0.7)) * Math.exp(v * 2.4) * 0.6 : 0;
    const core = Math.exp(-(u * u + v * v) * 14) * 0.8;
    const val = Math.min(1, (up + dn) * Math.max(0, 1 - Math.abs(u)) + core);
    const k = (y * S + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(val * 255); img.data[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return toTex(el, false, false);
});
/** fine detail (pits, grains, chisel marks) for the stone / plaster / concrete materials at ~0.5 m per tile */
export const detailTex = () => cached("detail", () => {
  const S = 256, [el, c] = cv(S);
  c.fillStyle = "#808080"; c.fillRect(0, 0, S, S);
  noise(c, S, 951, 0.5, "overlay", 6);
  specks(c, S, 952, 900, "#3a3a3a", 0.5, 1.8, 0.5);
  specks(c, S, 953, 400, "#d0d0d0", 0.5, 1.5, 0.45);
  scratch(c, S, 954, 60, "#4a4a4a", 0.35, 14);
  return toTex(el, false, true);
});
/** yellow / black hazard stripes (1 tile = 1 m along u) */
export const hazardTex = () => cached("hazard", () => {
  const [el, c] = cv(256, 64);
  c.fillStyle = "#f1c232"; c.fillRect(0, 0, 256, 64);
  c.fillStyle = "#1c1c1c";
  for (let x = -64; x < 320; x += 64) { c.beginPath(); c.moveTo(x, 64); c.lineTo(x + 32, 64); c.lineTo(x + 96, 0); c.lineTo(x + 64, 0); c.fill(); }
  noise(c, 256, 961, 0.25);
  scratch(c, 256, 962, 50, "#6a6050", 0.5, 30);
  specks(c, 256, 963, 40, "#5a5040", 1, 5, 0.4);
  return toTex(el);
});
