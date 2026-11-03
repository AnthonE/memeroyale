// CNVS LAB — canvas painters (no image gen, no downloads; worker-safe: OffscreenCanvas when there is no DOM): prefab wall panels (white / yellow / grey lining),
// raised server floor, server-rack fronts with LED emissive, monitor screens, the helipad marking, grating, chain-link,
// solar cells, flight cases, the CNVS.DEV sign. Every map tiles in METRES (the geometry's UVs are metres, see geo.ts).
// Each painter draws a height field alongside the colour where it matters and derives a normal map from it.
export type Cv = HTMLCanvasElement | OffscreenCanvas;
type G2 = CanvasRenderingContext2D;
const canvas = (w: number, h = w): [Cv, G2] => {
  const c: Cv = typeof document !== "undefined" ? Object.assign(document.createElement("canvas"), { width: w, height: h }) : new OffscreenCanvas(w, h);
  return [c, (c as HTMLCanvasElement).getContext("2d", { willReadFrequently: true }) as G2];
};

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const reseed = (s: number) => { seed = s * 7919 + 13; };

/** height canvas (grey = height) → tangent-space normal map canvas */
function normalFrom(h: Cv, strength: number): Cv {
  const W = h.width, H = h.height;
  const src = (h as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, W, H).data;
  const [c, g] = canvas(W, H);
  const out = g.createImageData(W, H), d = out.data;
  const at = (x: number, y: number) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}
function speckle(g: G2, W: number, H: number, n: number, col: string, a: number, r0: number, r1: number) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) { g.globalAlpha = a * (0.3 + 0.7 * rnd()); const r = r0 + (r1 - r0) * rnd(); g.beginPath(); g.arc(rnd() * W, rnd() * H, r, 0, 6.283); g.fill(); }
  g.globalAlpha = 1;
}
function smudges(g: G2, W: number, H: number, n: number, col: string, a: number, r0: number, r1: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, r = r0 + (r1 - r0) * rnd();
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = a * (0.4 + 0.6 * rnd()); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.globalAlpha = 1;
}

/** a painted set: colour (sRGB) + optional normal (linear) + emissive (sRGB) canvases; `metres` = one tile */
export interface PbrTex { map: Cv; normalMap?: Cv; emissiveMap?: Cv; metres: [number, number] }

/** prefab composite wall panels: one tile = 4 m wide × 4 m tall; vertical joints every 1.0 m, a horizontal joint at 1.2 m
 *  and 2.9 m, flush fasteners, faint rain streaks under every horizontal joint, edge highlights (normal map). */
export function panelTex(base: string, o: { seamDark?: string; streak?: number; size?: number; ribbed?: boolean } = {}): PbrTex {
  reseed(base.length * 31 + (o.ribbed ? 7 : 0));
  const S = o.size ?? 1024, px = S / 4;
  const [c, g] = canvas(S), [h, hg] = canvas(S);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  // per-panel tone
  const cols = [0, 1, 2, 3], rows = [0, 1.2, 2.9, 4];
  for (const cx of cols) for (let r = 0; r < 3; r++) {
    const y0 = S - rows[r + 1] * px, y1 = S - rows[r] * px;
    g.globalAlpha = 0.05 + 0.05 * rnd(); g.fillStyle = rnd() < 0.5 ? "#ffffff" : "#8a8070"; g.fillRect(cx * px, y0, px, y1 - y0); g.globalAlpha = 1;
    // pillowed panel: slightly raised centre
    const gr = hg.createLinearGradient(cx * px, 0, cx * px + px, 0);
    gr.addColorStop(0, "#7a7a7a"); gr.addColorStop(0.08, "#868686"); gr.addColorStop(0.92, "#868686"); gr.addColorStop(1, "#7a7a7a");
    hg.fillStyle = gr; hg.fillRect(cx * px, y0, px, y1 - y0);
    if (o.ribbed) for (let k = 1; k < 8; k++) { hg.fillStyle = "#9a9a9a"; hg.fillRect(cx * px + k * px / 8 - 2, y0 + 6, 4, y1 - y0 - 12); }
  }
  smudges(g, S, S, 40, "rgba(120,110,95,1)", 0.05, S * 0.03, S * 0.12);
  // joints
  const seam = o.seamDark ?? "rgba(40,38,34,0.55)";
  g.fillStyle = seam; hg.fillStyle = "#303030";
  for (const cx of cols) { g.fillRect(cx * px - 2, 0, 4, S); hg.fillRect(cx * px - 3, 0, 6, S); }
  for (const r of rows) { const y = S - r * px; g.fillRect(0, y - 2, S, 4); hg.fillRect(0, y - 3, S, 6); }
  // joint highlight (lit top edge)
  g.fillStyle = "rgba(255,255,255,0.35)";
  for (const r of rows) { const y = S - r * px; g.fillRect(0, y + 2, S, 2); }
  for (const cx of cols) g.fillRect(cx * px + 2, 0, 2, S);
  // fasteners
  for (const cx of cols) for (const r of rows) for (const dx of [0.06, 0.94]) {
    const x = cx * px + dx * px, y = S - r * px;
    for (const dy of [-0.05, 0.05]) {
      const yy = y + dy * px; if (yy < 0 || yy > S) continue;
      g.fillStyle = "rgba(60,58,52,0.6)"; g.beginPath(); g.arc(x, yy, 3.2, 0, 6.283); g.fill();
      hg.fillStyle = "#b0b0b0"; hg.beginPath(); hg.arc(x, yy, 3.2, 0, 6.283); hg.fill();
    }
  }
  // rain streaks under horizontal joints + light scratches
  const streak = o.streak ?? 0.12;
  for (let i = 0; i < 90; i++) {
    const r = rows[1 + Math.floor(rnd() * 2)], x = rnd() * S, y = S - r * px + 3, len = (0.1 + rnd() * 0.5) * px;
    const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, `rgba(95,85,70,${streak * (0.5 + rnd())})`); gr.addColorStop(1, "rgba(95,85,70,0)");
    g.fillStyle = gr; g.fillRect(x, y, 2 + rnd() * 5, len);
  }
  g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 12); g.stroke(); }
  speckle(g, S, S, 500, "#5c5548", 0.12, 0.6, 1.6);
  return { map: c, normalMap: normalFrom(h, 3.2), metres: [4, 4] };
}

/** interior lining: pale grey-green laminate panels 1.2 m wide with a skirting strip (tile 4.8 × 3.6 m) */
export function liningTex(): PbrTex {
  reseed(501);
  const W = 1024, H = 768, px = W / 4.8;
  const [c, g] = canvas(W, H), [h, hg] = canvas(W, H);
  g.fillStyle = "#dfe2dc"; g.fillRect(0, 0, W, H); hg.fillStyle = "#808080"; hg.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) { g.globalAlpha = 0.04 + 0.05 * rnd(); g.fillStyle = rnd() < 0.5 ? "#fff" : "#9aa29a"; g.fillRect(i * 1.2 * px, 0, 1.2 * px, H); g.globalAlpha = 1; }
  g.fillStyle = "rgba(70,74,70,0.5)"; hg.fillStyle = "#404040";
  for (let i = 0; i <= 4; i++) { g.fillRect(i * 1.2 * px - 1.5, 0, 3, H); hg.fillRect(i * 1.2 * px - 2, 0, 4, H); }
  // skirting (bottom 0.12 m) + chair rail at 1.0 m
  const yS = H - 0.12 * H / 3.6, yR = H - 1.0 * H / 3.6;
  g.fillStyle = "#5d6468"; g.fillRect(0, yS, W, H - yS); hg.fillStyle = "#a0a0a0"; hg.fillRect(0, yS, W, H - yS);
  g.fillStyle = "#b9c0bd"; g.fillRect(0, yR - 5, W, 10); hg.fillStyle = "#9a9a9a"; hg.fillRect(0, yR - 5, W, 10);
  smudges(g, W, H, 24, "rgba(90,90,80,1)", 0.05, 30, 120);
  speckle(g, W, H, 300, "#8a8f88", 0.1, 0.5, 1.3);
  return { map: c, normalMap: normalFrom(h, 2.5), metres: [4.8, 3.6] };
}

/** raised access floor: 0.6 m tiles, speckled vinyl, some perforated tiles (tile 2.4 m) */
export function floorTex(tone = "#b7bec2", perf = true): PbrTex {
  reseed(tone.charCodeAt(1) * 3 + (perf ? 1 : 0));
  const S = 512, px = S / 2.4;
  const [c, g] = canvas(S), [h, hg] = canvas(S);
  g.fillStyle = tone; g.fillRect(0, 0, S, S); hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * 0.6 * px, y = j * 0.6 * px;
    g.globalAlpha = 0.05 + 0.06 * rnd(); g.fillStyle = rnd() < 0.5 ? "#fff" : "#6a7278"; g.fillRect(x, y, 0.6 * px, 0.6 * px); g.globalAlpha = 1;
    if (perf && (i + j) % 3 === 0) {
      g.fillStyle = "rgba(60,66,70,0.55)";
      for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) { g.beginPath(); g.arc(x + (a + 0.5) * 0.06 * px, y + (b + 0.5) * 0.06 * px, 2.2, 0, 6.283); g.fill(); }
    }
  }
  speckle(g, S, S, 1400, "#59626a", 0.2, 0.4, 1.1);
  speckle(g, S, S, 700, "#ffffff", 0.15, 0.4, 1.0);
  g.fillStyle = "rgba(40,44,48,0.7)"; hg.fillStyle = "#3a3a3a";
  for (let i = 0; i <= 4; i++) { const v = i * 0.6 * px; g.fillRect(v - 1.5, 0, 3, S); g.fillRect(0, v - 1.5, S, 3); hg.fillRect(v - 2, 0, 4, S); hg.fillRect(0, v - 2, S, 4); }
  smudges(g, S, S, 16, "rgba(60,60,55,1)", 0.06, 20, 80);
  return { map: c, normalMap: normalFrom(h, 2), metres: [2.4, 2.4] };
}

/** steel bar grating (catwalks, bridges, stair treads): bearing bars every 3 cm, cross bars every 10 cm (tile 1 m) */
export function grateTex(): PbrTex {
  reseed(77);
  const S = 256;
  const [c, g] = canvas(S), [h, hg] = canvas(S);
  g.fillStyle = "#23272b"; g.fillRect(0, 0, S, S); hg.fillStyle = "#202020"; hg.fillRect(0, 0, S, S);
  const bar = S / 33;
  for (let i = 0; i < 33; i++) { g.fillStyle = i % 2 ? "#9aa0a4" : "#8e9498"; g.fillRect(i * bar, 0, bar * 0.42, S); hg.fillStyle = "#d0d0d0"; hg.fillRect(i * bar, 0, bar * 0.42, S); }
  for (let j = 0; j < 10; j++) { g.fillStyle = "#7d8387"; g.fillRect(0, j * S / 10, S, 3); hg.fillStyle = "#b0b0b0"; hg.fillRect(0, j * S / 10, S, 3); }
  speckle(g, S, S, 200, "#c9a24a", 0.15, 0.6, 1.8);
  smudges(g, S, S, 10, "rgba(70,60,40,1)", 0.12, 10, 50);
  return { map: c, normalMap: normalFrom(h, 4), metres: [1, 1] };
}

/** diagonal hazard stripes, yellow / graphite (tile 1 m × 0.25 m) */
export function hazardTex(): Cv {
  const W = 256, H = 64; const [c, g] = canvas(W, H);
  g.fillStyle = "#f2c10f"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#26292c";
  for (let i = -2; i < 8; i++) { g.beginPath(); g.moveTo(i * 64, H); g.lineTo(i * 64 + 32, H); g.lineTo(i * 64 + 32 + H, 0); g.lineTo(i * 64 + H, 0); g.fill(); }
  reseed(5); speckle(g, W, H, 160, "#6b5a3a", 0.25, 0.5, 1.5);
  return c;
}

/** chain-link diamond mesh (alpha) — tile 0.5 m */
export function chainTex(): Cv {
  const S = 128; const [c, g] = canvas(S);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = "#c7ccce"; g.lineWidth = 3.2; g.lineCap = "round";
  for (let k = -1; k <= 1; k++) {
    g.beginPath(); g.moveTo(k * S, 0); g.lineTo(k * S + S, S); g.stroke();
    g.beginPath(); g.moveTo(k * S + S, 0); g.lineTo(k * S, S); g.stroke();
    g.beginPath(); g.moveTo(k * S + S / 2, 0); g.lineTo(k * S + S * 1.5, S); g.stroke();
    g.beginPath(); g.moveTo(k * S + S / 2, 0); g.lineTo(k * S - S / 2, S); g.stroke();
  }
  return c;
}

/** photovoltaic cells: 6 × 10 cells per panel, silver bus bars, aluminium frame (tile = one 1.0 × 1.7 m panel) */
export function solarTex(): PbrTex {
  reseed(33);
  const W = 256, H = 432; const [c, g] = canvas(W, H), [e, eg] = canvas(W, H);
  g.fillStyle = "#c9ced2"; g.fillRect(0, 0, W, H);
  eg.fillStyle = "#000"; eg.fillRect(0, 0, W, H);
  const m = 8, cw = (W - 2 * m) / 6, ch = (H - 2 * m) / 10;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) {
    const x = m + i * cw, y = m + j * ch;
    const gr = g.createLinearGradient(x, y, x + cw, y + ch); gr.addColorStop(0, "#1b2a55"); gr.addColorStop(1, rnd() < 0.5 ? "#23376e" : "#1e3063");
    g.fillStyle = gr; g.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
    g.fillStyle = "rgba(200,210,230,0.55)"; g.fillRect(x + cw * 0.33, y + 2, 1.2, ch - 4); g.fillRect(x + cw * 0.66, y + 2, 1.2, ch - 4);
    eg.fillStyle = `rgba(120,150,255,${0.02 + 0.03 * rnd()})`; eg.fillRect(x, y, cw, ch);
  }
  return { map: c, normalMap: normalFrom(c, 1), metres: [1, 1.7] };
}

/** server rack fronts: 42U cabinets 0.6 m wide, perforated doors, rows of units with teal / green / amber LEDs (the
 *  emissive map carries the LEDs + faint glow through the perforations). Tile = 2.4 m wide × 2.2 m (4 cabinets). */
export function rackTex(): PbrTex {
  reseed(911);
  const W = 1024, H = 940; const [c, g] = canvas(W, H), [e, eg] = canvas(W, H), [h, hg] = canvas(W, H);
  g.fillStyle = "#16191c"; g.fillRect(0, 0, W, H); eg.fillStyle = "#000"; eg.fillRect(0, 0, W, H); hg.fillStyle = "#808080"; hg.fillRect(0, 0, W, H);
  const cw = W / 4;
  for (let k = 0; k < 4; k++) {
    const x0 = k * cw;
    g.fillStyle = "#2a2f34"; g.fillRect(x0 + 4, 4, cw - 8, H - 8);
    hg.fillStyle = "#6a6a6a"; hg.fillRect(x0, 0, 8, H); hg.fillRect(x0 + cw - 8, 0, 8, H);
    const units = 36, uh = (H - 60) / units;
    for (let u = 0; u < units; u++) {
      const y = 30 + u * uh, kind = rnd();
      if (kind < 0.12) continue;
      g.fillStyle = kind < 0.5 ? "#23272b" : kind < 0.8 ? "#2e3338" : "#1c2024"; g.fillRect(x0 + 18, y + 1, cw - 36, uh - 2);
      // vents
      g.fillStyle = "rgba(0,0,0,0.5)"; for (let v = 0; v < 12; v++) g.fillRect(x0 + 60 + v * 11, y + uh * 0.3, 6, uh * 0.4);
      // drive bays
      if (kind > 0.6) { g.fillStyle = "#3a4046"; for (let d = 0; d < 6; d++) g.fillRect(x0 + 34 + d * 30, y + 3, 26, uh - 6); }
      // LEDs
      const nL = 2 + Math.floor(rnd() * 5);
      for (let l = 0; l < nL; l++) {
        const lx = x0 + cw - 40 - l * 14, ly = y + uh / 2, r = rnd();
        const col = r < 0.55 ? "#39f5e0" : r < 0.8 ? "#4dff7a" : r < 0.93 ? "#ffb02e" : "#4aa8ff";
        g.fillStyle = col; g.fillRect(lx, ly - 2, 5, 4);
        eg.fillStyle = col; eg.fillRect(lx - 1, ly - 3, 7, 6);
        eg.globalAlpha = 0.25; eg.fillRect(lx - 5, ly - 6, 15, 12); eg.globalAlpha = 1;
      }
      hg.fillStyle = "#909090"; hg.fillRect(x0 + 18, y + 1, cw - 36, 2);
    }
    // top label strip + handle
    g.fillStyle = "#39f5e0"; g.globalAlpha = 0.8; g.fillRect(x0 + 20, 10, cw - 40, 5); g.globalAlpha = 1;
    eg.fillStyle = "#1bbfae"; eg.fillRect(x0 + 20, 10, cw - 40, 5);
    g.fillStyle = "#8a9096"; g.fillRect(x0 + cw - 16, H * 0.4, 5, H * 0.2);
  }
  return { map: c, normalMap: normalFrom(h, 2), emissiveMap: e, metres: [2.4, 2.2] };
}

/** monitor / wall-screen content: dark UI with teal graphs, code columns, a world-map-ish blob field and a banana logo */
export function screenTex(kind: "code" | "map" | "graph" | "cam", seedN = 1): Cv {
  reseed(1000 + seedN * 17 + kind.length);
  const W = 512, H = 288; const [c, g] = canvas(W, H);
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#07202a"); bg.addColorStop(1, "#031218");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = "#0e3a44"; g.fillRect(0, 0, W, 18);
  g.fillStyle = "#6ff7e6"; g.font = "bold 12px monospace"; g.fillText("CNVS.DEV // " + ["NODE-7", "UPLINK", "BIOLAB", "PERIMETER"][seedN % 4], 8, 13);
  if (kind === "code") {
    g.font = "11px monospace";
    for (let i = 0; i < 20; i++) { g.fillStyle = rnd() < 0.2 ? "#ffd23a" : rnd() < 0.5 ? "#6ff7e6" : "#3fb8a8"; let s = ""; const n = 6 + Math.floor(rnd() * 40); for (let k = 0; k < n; k++) s += "abcdef0123456789{}();=>.:"[Math.floor(rnd() * 25)]; g.fillText(s, 10 + (i % 3) * 12, 34 + i * 12.5); }
  } else if (kind === "graph") {
    for (let p = 0; p < 3; p++) {
      g.strokeStyle = ["#6ff7e6", "#ffd23a", "#4dff7a"][p]; g.lineWidth = 2; g.beginPath();
      let y = H * (0.3 + p * 0.2);
      for (let x = 10; x < W - 10; x += 8) { y += (rnd() - 0.5) * 18; y = Math.max(30, Math.min(H - 10, y)); if (x === 10) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = "rgba(111,247,230,0.15)"; g.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 20); g.lineTo(x, H); g.stroke(); }
  } else if (kind === "map") {
    g.fillStyle = "rgba(111,247,230,0.5)";
    for (let i = 0; i < 700; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 90; const x = W / 2 + Math.cos(a) * r * 1.6 + Math.sin(a * 3) * 20, y = H / 2 + 14 + Math.sin(a) * r * 0.8; g.fillRect(x, y, 2, 2); }
    g.strokeStyle = "#ffd23a"; g.lineWidth = 2; g.beginPath(); g.arc(W * 0.62, H * 0.45, 14, 0, 6.283); g.stroke();
    g.strokeStyle = "rgba(255,210,58,0.6)"; g.beginPath(); g.moveTo(W * 0.3, H * 0.7); g.quadraticCurveTo(W * 0.5, H * 0.1, W * 0.62, H * 0.45); g.stroke();
  } else {
    // security-cam grid: four greenish feeds
    for (let i = 0; i < 4; i++) {
      const x = 8 + (i % 2) * (W / 2), y = 24 + Math.floor(i / 2) * ((H - 28) / 2), w = W / 2 - 16, hh = (H - 28) / 2 - 8;
      const gr = g.createLinearGradient(x, y, x, y + hh); gr.addColorStop(0, "#2f5a4a"); gr.addColorStop(1, "#16302a"); g.fillStyle = gr; g.fillRect(x, y, w, hh);
      g.fillStyle = "rgba(160,220,190,0.35)"; for (let k = 0; k < 6; k++) g.fillRect(x + rnd() * w * 0.8, y + hh * (0.4 + rnd() * 0.5), 10 + rnd() * 40, 4 + rnd() * 30);
      g.fillStyle = "#ff4b3a"; g.fillRect(x + 6, y + 6, 6, 6);
    }
  }
  // scanlines
  g.fillStyle = "rgba(0,0,0,0.12)"; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  return c;
}

/** the helipad deck: warm concrete, yellow/black safety ring, white TLOF circle, the "H" square — local UV 0..1 */
export function helipadTex(): Cv {
  reseed(404);
  const S = 1024; const [c, g] = canvas(S);
  // cool grey steel deck plates (1.5 m, bolted seams, anti-skid texture) — not a tan slab
  g.fillStyle = "#8e9398"; g.fillRect(0, 0, S, S);
  smudges(g, S, S, 70, "rgba(70,74,78,1)", 0.14, 20, 120);
  smudges(g, S, S, 40, "rgba(170,174,176,1)", 0.12, 20, 100);
  speckle(g, S, S, 9000, "#6f7479", 0.35, 0.5, 1.2);
  speckle(g, S, S, 4000, "#b3b8bc", 0.25, 0.5, 1.0);
  const P = S / 12;
  for (let i = 0; i <= 12; i++) {
    g.fillStyle = "rgba(40,43,46,0.55)"; g.fillRect(i * P - 1.5, 0, 3, S); g.fillRect(0, i * P - 1.5, S, 3);
    g.fillStyle = "rgba(220,224,226,0.25)"; g.fillRect(i * P + 1.5, 0, 1, S); g.fillRect(0, i * P + 1.5, S, 1);
  }
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (const [a, b] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
    g.fillStyle = "#5d6166"; g.beginPath(); g.arc((i + a) * P, (j + b) * P, 2.2, 0, 6.283); g.fill();
  }
  // oil / rubber stains + tyre scuffs
  smudges(g, S, S, 10, "rgba(30,28,26,1)", 0.12, 20, 60);
  const C = S / 2;
  g.strokeStyle = "rgba(30,30,30,0.16)"; g.lineWidth = 16;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(C + (rnd() - 0.5) * 60, C + (rnd() - 0.5) * 60, S * (0.18 + rnd() * 0.12), rnd() * 6, rnd() * 6 + 1.2); g.stroke(); }
  // octagonal perimeter band (hazard)
  g.save(); g.translate(C, C);
  const ring = (r: number) => { g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4, rr = r / Math.cos(Math.PI / 8); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); };
  g.lineWidth = S * 0.035; g.strokeStyle = "#f2c10f"; ring(S * 0.475); g.stroke();
  g.setLineDash([S * 0.03, S * 0.03]); g.strokeStyle = "#26292c"; ring(S * 0.475); g.stroke(); g.setLineDash([]);
  // touchdown circle
  g.lineWidth = S * 0.028; g.strokeStyle = "#f4f1ea"; g.beginPath(); g.arc(0, 0, S * 0.33, 0, 6.283); g.stroke();
  g.lineWidth = S * 0.01; g.strokeStyle = "#f2c10f"; g.beginPath(); g.arc(0, 0, S * 0.3, 0, 6.283); g.stroke();
  // H in a square (a white square frame + H)
  g.lineWidth = S * 0.026; g.strokeStyle = "#f4f1ea"; g.strokeRect(-S * 0.14, -S * 0.14, S * 0.28, S * 0.28);
  g.fillStyle = "#f4f1ea"; const hw = S * 0.028, hh = S * 0.09;
  g.fillRect(-S * 0.07 - hw / 2, -hh, hw, 2 * hh); g.fillRect(S * 0.07 - hw / 2, -hh, hw, 2 * hh); g.fillRect(-S * 0.07, -hw / 2, S * 0.14, hw);
  g.restore();
  // paint wear
  g.globalCompositeOperation = "destination-out";
  speckle(g, S, S, 900, "#000", 0.25, 0.8, 3);
  g.globalCompositeOperation = "destination-over"; g.fillStyle = "#8e9398"; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = "source-over";
  return c;
}

/** painted sign board: "CNVS.DEV" wordmark (the only branding besides BANANA CO.) */
export function signTex(text = "CNVS.DEV", o: { fg?: string; bg?: string; w?: number; h?: number; border?: string } = {}): Cv {
  const W = o.w ?? 1024, H = o.h ?? 288; const [c, g] = canvas(W, H);
  g.fillStyle = o.bg ?? "#f4f2ec"; g.fillRect(0, 0, W, H);
  if (o.border) { const b = H * 0.05; g.strokeStyle = o.border; g.lineWidth = b; g.strokeRect(b, b, W - 2 * b, H - 2 * b); }
  let size = H * 0.62;
  const fam = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
  g.font = `900 ${size}px ${fam}`;
  const tw = g.measureText(text).width; if (tw > W * 0.9) { size *= W * 0.9 / tw; g.font = `900 ${size}px ${fam}`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = o.fg ?? "#23262a"; g.fillText(text, W / 2, H * 0.54);
  reseed(9); g.globalCompositeOperation = "destination-out"; speckle(g, W, H, 220, "#000", 0.12, 0.6, 2); g.globalCompositeOperation = "destination-over"; g.fillStyle = o.bg ?? "#f4f2ec"; g.fillRect(0, 0, W, H); g.globalCompositeOperation = "source-over";
  return c;
}

/** hard-shell flight case / supply crate: yellow or graphite body with ribs, corner caps, a stencilled CNVS.DEV (tile = 1 m) */
export function caseTex(body: string, label: string): PbrTex {
  reseed(body.charCodeAt(2) + label.length);
  const S = 512; const [c, g] = canvas(S), [h, hg] = canvas(S);
  g.fillStyle = body; g.fillRect(0, 0, S, S); hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  smudges(g, S, S, 20, "rgba(60,50,40,1)", 0.1, 20, 90);
  // ribs
  g.fillStyle = "rgba(0,0,0,0.18)"; hg.fillStyle = "#b0b0b0";
  for (const y of [0.12, 0.88]) { g.fillRect(0, y * S - 10, S, 20); hg.fillRect(0, y * S - 10, S, 20); }
  g.fillStyle = "rgba(255,255,255,0.25)"; for (const y of [0.12, 0.88]) g.fillRect(0, y * S - 10, S, 3);
  // label
  g.fillStyle = "rgba(30,32,34,0.85)"; g.font = "900 64px 'Arial Black', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(label, S / 2, S * 0.5);
  speckle(g, S, S, 400, "#3a3228", 0.18, 0.5, 1.8);
  return { map: c, normalMap: normalFrom(h, 2), metres: [1, 1] };
}

/** the dish's reflector: white panels in concentric rings + radial seams (polar UV: u = angle, v = radius 0..1) */
export function dishTex(): PbrTex {
  reseed(61);
  const W = 1024, H = 512; const [c, g] = canvas(W, H), [h, hg] = canvas(W, H);
  g.fillStyle = "#f1efe8"; g.fillRect(0, 0, W, H); hg.fillStyle = "#808080"; hg.fillRect(0, 0, W, H);
  for (let i = 0; i < 24; i++) for (let j = 0; j < 4; j++) { g.globalAlpha = 0.04 + 0.05 * rnd(); g.fillStyle = rnd() < 0.5 ? "#fff" : "#a09a8c"; g.fillRect(i * W / 24, j * H / 4, W / 24, H / 4); g.globalAlpha = 1; }
  g.fillStyle = "rgba(80,78,70,0.45)"; hg.fillStyle = "#404040";
  for (let i = 0; i <= 24; i++) { g.fillRect(i * W / 24 - 1.5, 0, 3, H); hg.fillRect(i * W / 24 - 2, 0, 4, H); }
  for (let j = 1; j < 4; j++) { g.fillRect(0, j * H / 4 - 1.5, W, 3); hg.fillRect(0, j * H / 4 - 2, W, 4); }
  // radial shading (canvas bottom = v 0 = the hub): the hub region sits in the bowl's own shade, the rim catches the light
  { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(1, "rgba(120,112,100,0.45)"); gr.addColorStop(0.65, "rgba(150,142,128,0.18)"); gr.addColorStop(0.2, "rgba(255,255,255,0)"); gr.addColorStop(0, "rgba(255,255,255,0.15)"); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  for (let i = 0; i < 60; i++) { const x = rnd() * W, y = rnd() * H * 0.5 + H * 0.5, len = 20 + rnd() * 60; const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, "rgba(110,100,80,0.12)"); gr.addColorStop(1, "rgba(110,100,80,0)"); g.fillStyle = gr; g.fillRect(x, y, 3, len); }
  return { map: c, normalMap: normalFrom(h, 2), metres: [1, 1] };
}

/** compacted gravel yard: tan-grey fines, scattered pebbles, tyre ruts; ALPHA = ragged blotch noise (0.35..1) so the
 *  yard's edge (vertex alpha × this, alpha-tested) frays into the grass instead of a straight line. Tile 4 m. */
export function gravelTex(): PbrTex {
  // compacted crushed-stone yard: fine, low-contrast grit with a few pebbles, tyre-packed darker lanes and dust;
  // alpha stays ≥ 0.4 everywhere (× the vertex alpha 2.2 = opaque inside the yard — a blotch alpha punches
  // hard-edged "leaf stamp" holes to the grass), ragged only where the vertex alpha fades out at the yard's edge
  reseed(808);
  const S = 512; const [c, g] = canvas(S), [h, hg] = canvas(S);
  g.fillStyle = "#b3a78f"; g.fillRect(0, 0, S, S); hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  smudges(g, S, S, 60, "rgba(150,138,116,1)", 0.22, 30, 110);
  smudges(g, S, S, 40, "rgba(200,190,168,1)", 0.2, 20, 90);
  smudges(g, S, S, 14, "rgba(110,100,84,1)", 0.12, 30, 80);
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.5 + rnd() * rnd() * 2.0, t = rnd();
    g.fillStyle = t < 0.35 ? "#9d9280" : t < 0.65 ? "#c7bca6" : t < 0.88 ? "#ab9d86" : "#857b6c";
    g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, 6.283); g.fill();
    const k = 140 + r * 30; hg.fillStyle = `rgb(${k},${k},${k})`; hg.beginPath(); hg.arc(x, y, r, 0, 6.283); hg.fill();
  }
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S, y = rnd() * S, r = 2.2 + rnd() * 2.6;
    g.fillStyle = rnd() < 0.5 ? "#a39784" : "#8d8374"; g.beginPath(); g.ellipse(x, y, r, r * 0.75, rnd() * 3, 0, 6.283); g.fill();
    g.fillStyle = "rgba(255,250,235,0.25)"; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.3, 0, 0, 6.283); g.fill();
    hg.fillStyle = "#e0e0e0"; hg.beginPath(); hg.arc(x, y, r, 0, 6.283); hg.fill();
  }
  const img = g.getImageData(0, 0, S, S), d = img.data;
  const blot = (x: number, y: number) => { let v = 0; for (let k = 0; k < 4; k++) { const f = 2 ** k * 3; v += Math.sin(x * f * 0.0123 + k * 1.7 + Math.sin(y * f * 0.011 + k)) * Math.cos(y * f * 0.0131 - k * 2.3) / 2 ** k; } return v; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) d[(y * S + x) * 4 + 3] = Math.max(100, Math.min(255, 205 + 50 * blot(x, y)));
  g.putImageData(img, 0, 0);
  return { map: c, normalMap: normalFrom(h, 2.0), metres: [4, 4] };
}

/** poured concrete: warm grey, trowel mottling, formwork seams every 2.5 m, pits + stains (tile 5 m) */
export function concreteTex(): PbrTex {
  reseed(1234);
  const S = 512, px = S / 5; const [c, g] = canvas(S), [h, hg] = canvas(S);
  g.fillStyle = "#b9b2a6"; g.fillRect(0, 0, S, S); hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  smudges(g, S, S, 60, "rgba(160,156,146,1)", 0.18, 20, 80); smudges(g, S, S, 40, "rgba(222,218,208,1)", 0.25, 20, 70);
  speckle(g, S, S, 2200, "#8d877c", 0.25, 0.4, 1.3); speckle(g, S, S, 900, "#e6e0d4", 0.2, 0.4, 1.1);
  for (const k of [0, 2.5]) { g.fillStyle = "rgba(70,66,60,0.45)"; g.fillRect(0, k * px - 1, S, 2); g.fillRect(k * px - 1, 0, 2, S); hg.fillStyle = "#505050"; hg.fillRect(0, k * px - 2, S, 4); hg.fillRect(k * px - 2, 0, 4, S); }
  for (let i = 0; i < 300; i++) { const x = rnd() * S, y = rnd() * S; hg.fillStyle = "#5a5a5a"; hg.beginPath(); hg.arc(x, y, 0.8 + rnd() * 1.6, 0, 6.283); hg.fill(); }
  smudges(g, S, S, 5, "rgba(90,84,72,1)", 0.07, 30, 80);
  return { map: c, normalMap: normalFrom(h, 1.6), metres: [5, 5] };
}
/** painted steel: base colour with fine speckle, scuffs and a few chips to bare metal (tile 2 m) */
export function metalTex(base: string, seedN = 3): PbrTex {
  reseed(seedN * 71);
  const S = 256; const [c, g] = canvas(S), [h, hg] = canvas(S);
  g.fillStyle = base; g.fillRect(0, 0, S, S); hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  smudges(g, S, S, 20, "rgba(0,0,0,1)", 0.06, 10, 40); smudges(g, S, S, 16, "rgba(255,255,255,1)", 0.05, 10, 40);
  speckle(g, S, S, 500, "#000000", 0.08, 0.3, 0.9);
  for (let i = 0; i < 26; i++) { const x = rnd() * S, y = rnd() * S; g.strokeStyle = "rgba(210,214,216,0.35)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 8); g.stroke(); }
  for (let i = 0; i < 12; i++) { const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 3; g.fillStyle = "#9aa0a4"; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); hg.fillStyle = "#606060"; hg.beginPath(); hg.arc(x, y, r, 0, 6.283); hg.fill(); }
  return { map: c, normalMap: normalFrom(h, 1.5), metres: [2, 2] };
}
/** weathered plank / spool wood (tile 1.2 m) */
export function woodTex(): PbrTex {
  reseed(555);
  const S = 256; const [c, g] = canvas(S), [h, hg] = canvas(S);
  g.fillStyle = "#b08a5a"; g.fillRect(0, 0, S, S); hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  const n = 5, pw = S / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = ["#b8905e", "#a8804f", "#bd9868", "#a37b4c", "#b28a59"][i]; g.fillRect(i * pw + 1, 0, pw - 2, S);
    for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(90,60,30,${0.12 + rnd() * 0.15})`; g.lineWidth = 1; g.beginPath(); const x = i * pw + rnd() * pw; g.moveTo(x, 0); g.bezierCurveTo(x + (rnd() - 0.5) * 8, S * 0.3, x + (rnd() - 0.5) * 8, S * 0.7, x + (rnd() - 0.5) * 6, S); g.stroke(); }
    g.fillStyle = "rgba(50,34,18,0.7)"; g.fillRect(i * pw, 0, 2, S); hg.fillStyle = "#404040"; hg.fillRect(i * pw - 1, 0, 3, S);
  }
  return { map: c, normalMap: normalFrom(h, 2), metres: [1.2, 1.2] };
}

/** every texture set the lab uses, by name (the worker and the main-thread fallback paint from the same table) */
export const LAB_PAINT: Record<string, () => PbrTex> = {
  white: () => panelTex("#f7f5ef", { seamDark: "rgba(60,58,52,0.35)", streak: 0.07 }),
  yellow: () => panelTex("#ffdc3a", { seamDark: "rgba(90,70,20,0.35)", streak: 0.1 }),
  graphite: () => panelTex("#3d4248", { seamDark: "rgba(10,10,12,0.6)", streak: 0.05, size: 512 }),
  lining: liningTex, floorServer: () => floorTex("#aeb7bd", true), floorLab: () => floorTex("#d9dcd8", false), floorWarm: () => floorTex("#a79c8c", false),
  grate: grateTex, solar: solarTex, rack: rackTex, caseY: () => caseTex("#f0bd18", "CNVS.DEV"), caseG: () => caseTex("#3c4147", "CNVS.DEV"), dish: dishTex,
  gravel: gravelTex, concrete: concreteTex, steel: () => metalTex("#4a5057", 3), galv: () => metalTex("#a9aeb1", 5), wood: woodTex,
  heli: () => ({ map: helipadTex(), metres: [1, 1] }), hazard: () => ({ map: hazardTex(), metres: [1, 0.25] }), chain: () => ({ map: chainTex(), metres: [0.5, 0.5] }),
  sign: () => ({ map: signTex("CNVS.DEV"), metres: [1, 1] }),
  scrCode: () => ({ map: screenTex("code", 0), metres: [1, 1] }), scrMap: () => ({ map: screenTex("map", 1), metres: [1, 1] }),
  scrGraph: () => ({ map: screenTex("graph", 2), metres: [1, 1] }), scrCam: () => ({ map: screenTex("cam", 3), metres: [1, 1] }),
};
