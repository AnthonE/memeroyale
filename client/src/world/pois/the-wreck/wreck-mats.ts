// THE WRECK — painted materials (all canvas, metre-tiled, world-space weathering from harbor-materials `weather()`):
// rust hull plating (strakes + butts + weld seams + flaking old paint), rust deck plating, dirty white superstructure
// facade (one deck level per tile: windows, broken panes, rust tears under every window), rusty yellow funnel paint,
// and the hanging vine strip. The shell material is double-sided with the inside darkened (you see into the hold
// through the break).
import * as THREE from "three";
import { tileMetres, weather } from "../_kit/harbor-materials";
import { canvas, edgeShade, normalFromHeight, paintNoise, rng, scratches, splotches, streaks, tex } from "../_kit/harbor-paint";

export interface WreckMats {
  hull: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  inner: THREE.MeshStandardMaterial;
  facade: THREE.MeshStandardMaterial;
  whiteTrim: THREE.MeshStandardMaterial;
  funnel: THREE.MeshStandardMaterial;
  mast: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  vine: THREE.MeshStandardMaterial;
  letters: THREE.MeshStandardMaterial;
}

let cache: WreckMats | null = null;

/** inside faces (gl_FrontFacing false) → dark + dim sky light: the hold reads as a dark interior */
function darkInside(m: THREE.MeshStandardMaterial, k = 0.28): THREE.MeshStandardMaterial {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      if ( !gl_FrontFacing ) diffuseColor.rgb *= ${k.toFixed(3)};`);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + "|inside";
  return m;
}

function rustPlates(w: number, h: number, seed: number, o: { strake: number; butt: number; tone: string; deck?: boolean }) {
  const [el, c] = canvas(w, h), [hel, hc] = canvas(w, h), [rel, rc] = canvas(w, h);
  const R = rng(seed);
  c.fillStyle = o.tone; c.fillRect(0, 0, w, h);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, w, h);
  rc.fillStyle = "#e0e0e0"; rc.fillRect(0, 0, w, h);
  paintNoise(c, 0, 0, w, h, { seed, scale: w * 0.9, alpha: 0.4, blend: "overlay" });
  paintNoise(c, 0, 0, w, h, { seed: seed + 1, scale: w * 0.2, alpha: 0.25, blend: "overlay" });
  // each plate its own tone (some still carry old dark hull paint, some bright orange scale)
  for (let y = 0; y < h; y += o.strake) for (let x = (Math.floor(y / o.strake) % 2) * o.butt * 0.5 - o.butt; x < w; x += o.butt) {
    const u = R(), k = o.deck ? 0.4 : 1;
    c.fillStyle = u < 0.2 ? `rgba(70,34,18,${0.08 * k})` : u < 0.35 ? `rgba(46,40,38,${0.07 * k})` : u < 0.55 ? `rgba(184,98,52,${0.07 * k})` : `rgba(120,60,30,${0.04 * k})`;
    c.fillRect(x, y, o.butt, o.strake);
    // pillowed plate (height bulges between the seams)
    const g = hc.createRadialGradient(x + o.butt / 2, y + o.strake / 2, 4, x + o.butt / 2, y + o.strake / 2, Math.max(o.butt, o.strake) * 0.7);
    g.addColorStop(0, "rgba(255,255,255,0.22)"); g.addColorStop(1, "rgba(255,255,255,0)");
    hc.fillStyle = g; hc.fillRect(x, y, o.butt, o.strake);
  }
  // big organic rust fields (orange scale / dark crust / remnants of old paint) from multi-octave noise — no round
  // "leopard" splotches (they tiled into a visible dot grid across a 50 m hull)
  paintNoise(c, 0, 0, w, h, { seed: seed + 40, scale: w * 0.45, alpha: 0.38, blend: "overlay", octaves: 5 });
  paintNoise(c, 0, 0, w, h, { seed: seed + 43, scale: w * 0.12, alpha: 0.22, blend: "overlay", octaves: 4 });
  paintNoise(c, 0, 0, w, h, { seed: seed + 44, scale: w * 0.03, alpha: 0.16, blend: "overlay", octaves: 3 });
  // flaking scale: short horizontal-ish flakes (bright fresh rust + dark crust), pitting as fine grain
  scratches(c, 0, 0, w, h, { n: Math.round(w * 0.45), color: "rgba(200,112,56,1)", alpha: 0.35, seed: seed + 2, lenMin: 3, lenMax: w * 0.03, width: 2.5 });
  scratches(c, 0, 0, w, h, { n: Math.round(w * 0.35), color: "rgba(52,24,10,1)", alpha: 0.4, seed: seed + 3, lenMin: 3, lenMax: w * 0.025, width: 2 });
  splotches(rc, 0, 0, w, h, { n: 40, rMin: w * 0.01, rMax: w * 0.05, color: "#ffffff", alpha: 0.5, seed: seed + 3 });
  // weeping rust runs from the seams downward
  if (!o.deck) for (let y = 0; y < h; y += o.strake) streaks(c, 0, y + 3, w, o.strake * 1.4, { n: Math.round(w / 40), color: "rgba(58,26,10,1)", alpha: 0.4, lenMin: o.strake * 0.2, lenMax: o.strake * 1.2, width: 4, seed: seed + 10 + y, blend: "multiply" });
  // seams: dark groove + weld bead highlight
  const sa = o.deck ? 0.32 : 0.75;
  for (let y = 0; y < h; y += o.strake) {
    c.fillStyle = `rgba(25,12,6,${sa})`; c.fillRect(0, y, w, 3); c.fillStyle = `rgba(230,160,110,${sa / 3})`; c.fillRect(0, y + 3, w, 2);
    hc.fillStyle = "#282828"; hc.fillRect(0, y, w, 3); hc.fillStyle = "#c8c8c8"; hc.fillRect(0, y + 3, w, 3);
    for (let x = (Math.floor(y / o.strake) % 2) * o.butt * 0.5; x < w; x += o.butt) {
      c.fillStyle = `rgba(25,12,6,${sa * 0.9})`; c.fillRect(x, y, 3, o.strake); hc.fillStyle = "#282828"; hc.fillRect(x, y, 3, o.strake); hc.fillStyle = "#c8c8c8"; hc.fillRect(x + 3, y, 3, o.strake);
    }
  }
  if (o.deck) {
    // steel deck (never terracotta tiles): big soft rust fields + dark wet crust + green grime pooling in the
    // low spots, raised chequer tread on the walkways, bolt heads — the plate grid stays faint
    splotches(c, 0, 0, w, h, { n: 14, rMin: w * 0.08, rMax: w * 0.3, color: "rgba(150,72,30,1)", alpha: 0.35, seed: seed + 21, blend: "overlay", soft: 0.05 });
    splotches(c, 0, 0, w, h, { n: 10, rMin: w * 0.06, rMax: w * 0.22, color: "rgba(38,30,24,1)", alpha: 0.3, seed: seed + 22, blend: "multiply", soft: 0.05 });
    splotches(c, 0, 0, w, h, { n: 8, rMin: w * 0.05, rMax: w * 0.16, color: "rgba(70,86,40,1)", alpha: 0.25, seed: seed + 23, blend: "multiply", soft: 0.1 });
    for (let yy = 12; yy < h; yy += 14) for (let xx = (yy / 14) % 2 ? 7 : 0; xx < w * 0.3; xx += 14) { hc.fillStyle = "#b0b0b0"; hc.fillRect(xx, yy, 7, 2.5); c.fillStyle = "rgba(160,120,90,0.18)"; c.fillRect(xx, yy, 7, 2); }
    scratches(c, 0, 0, w, h, { n: 90, color: "rgba(200,140,90,1)", alpha: 0.22, seed: seed + 20, lenMin: 5, lenMax: 60 });
  }
  paintNoise(hc, 0, 0, w, h, { seed: seed + 30, scale: w * 0.05, alpha: 0.4, blend: "overlay", octaves: 3 });
  return { map: tex(el, { aniso: 8 }), normal: tex(normalFromHeight(hel, 2.6), { srgb: false }), rough: tex(rel, { srgb: false }) };
}

/**
 * The shell plating of a ship that has rotted on a reef for years (tile 12 × 6 m, 85 px/m): a GRID of chunky steel
 * plates (2 × 1.5 m — never long thin planks), each its own rust tone with a darker weep at its lower edge; soft weld
 * seams with rivet rows; big ragged islands of the old red-brown hull paint and bright orange scale blooms; bold rust
 * runs hanging from the seams (few, long, tapered — no fine grain anywhere: directional scratches read as wood).
 * Normal: slightly dished plates, seam grooves + beads, rivet heads, pitting. Roughness: paint islands smoother.
 */
function hullPlates(seed: number): { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture } {
  const W = 1024, H = 512, pxm = W / 12;
  const [el, c] = canvas(W, H), [hel, hc] = canvas(W, H), [rel, rc] = canvas(W, H);
  const R = rng(seed);
  c.fillStyle = "#94502a"; c.fillRect(0, 0, W, H);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, W, H);
  rc.fillStyle = "#cfcfcf"; rc.fillRect(0, 0, W, H);
  // broad tonal fields (soft, low contrast)
  paintNoise(c, 0, 0, W, H, { seed, scale: W * 0.9, alpha: 0.32, blend: "overlay", octaves: 5 });
  paintNoise(c, 0, 0, W, H, { seed: seed + 1, scale: W * 0.3, alpha: 0.18, blend: "overlay", octaves: 4 });
  // STAGGERED strakes of different heights (1.1–2.1 m), each strake
  // cut into plates of random lengths (1.7–4 m) with its butts offset from the strake below; every plate its own
  // rust tone + weathering class (a few near-black old-paint plates, a few bright orange scale, patched replacements)
  const strakes = [1.35, 2.05, 1.15, 1.45].map((m) => m * pxm);      // sums to 6 m = the tile height
  const plates: Array<{ x: number; y: number; w: number; h: number; rust: number }> = [];
  {
    let y = 0;
    for (const sh of strakes) {
      let x = -R() * pxm * 2;
      while (x < W) {
        const w = pxm * (1.7 + R() * 2.3), u = R();
        plates.push({ x, y, w, h: sh, rust: u });
        x += w;
      }
      y += sh;
    }
  }
  for (const pl of plates) {
    const { x, y, w: pw2, h: ph2, rust: u } = pl;
    for (const ox of [0, W]) {
      const xx = x + ox;
      c.fillStyle = u < 0.18 ? `rgba(44,22,14,${0.12 + R() * 0.12})` : u < 0.4 ? `rgba(206,110,52,${0.07 + R() * 0.08})` : u < 0.55 ? `rgba(120,52,30,${0.06 + R() * 0.06})` : u < 0.62 ? "rgba(86,74,62,0.16)" : "rgba(0,0,0,0)";
      c.fillRect(xx, y, pw2, ph2);
      const g = c.createLinearGradient(0, y, 0, y + ph2);
      g.addColorStop(0, "rgba(255,190,140,0.05)"); g.addColorStop(0.55, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(44,18,6,${0.1 + R() * 0.12})`);
      c.fillStyle = g; c.fillRect(xx, y, pw2, ph2);
      const d = hc.createRadialGradient(xx + pw2 / 2, y + ph2 / 2, 4, xx + pw2 / 2, y + ph2 / 2, pw2 * 0.62);
      d.addColorStop(0, `rgba(0,0,0,${0.1 + R() * 0.12})`); d.addColorStop(1, "rgba(0,0,0,0)");
      hc.fillStyle = d; hc.fillRect(xx, y, pw2, ph2);
    }
  }
  const pw = pxm * 3, ph = pxm * 2, cols = Math.round(W / pw), rows = Math.round(H / ph);
  void cols; void rows;
  // islands of the old hull paint (dark red-brown, some near-black) with ragged edges — smoother than the rust
  const island = (cx: number, cy: number, rx: number, ry: number, col: string, a: number) => {
    for (const [ctx, cc, aa] of [[c, col, a], [rc, "#8c8c8c", 0.8]] as Array<[CanvasRenderingContext2D, string, number]>) {
      ctx.save(); ctx.globalAlpha = aa; ctx.fillStyle = cc; ctx.beginPath();
      const n = 22, rr: number[] = [];
      for (let k = 0; k < n; k++) rr.push(0.55 + R() * 0.55);
      for (let k = 0; k <= n; k++) { const t = (k / n) * Math.PI * 2, q = rr[k % n]; const x = cx + Math.cos(t) * rx * q, y = cy + Math.sin(t) * ry * q; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  };
  for (let i = 0; i < 10; i++) {
    const cx = R() * W, cy = R() * H, rx = pxm * (0.8 + R() * 1.6), ry = pxm * (0.4 + R() * 0.8);
    for (const ox of [-W, 0, W]) island(cx + ox, cy, rx, ry, R() < 0.7 ? "#62301e" : "#3e2820", 0.22 + R() * 0.2);
  }
  // big soft tonal clouds (wet dark crust / dry pale scale) so the plate grid never reads as brickwork from 60 m
  splotches(c, 0, 0, W, H, { n: 14, rMin: pxm * 1.2, rMax: pxm * 3, color: "rgba(58,26,12,1)", alpha: 0.28, seed: seed + 7, blend: "multiply", soft: 0.05 });
  splotches(c, 0, 0, W, H, { n: 10, rMin: pxm * 1.0, rMax: pxm * 2.6, color: "rgba(206,120,66,1)", alpha: 0.2, seed: seed + 8, blend: "screen", soft: 0.05 });
  // bright scale blooms (fresh orange rust breaking through)
  splotches(c, 0, 0, W, H, { n: 26, rMin: pxm * 0.3, rMax: pxm * 1.3, color: "rgba(214,120,58,1)", alpha: 0.22, seed: seed + 2, blend: "screen", soft: 0.1 });
  splotches(rc, 0, 0, W, H, { n: 26, rMin: pxm * 0.3, rMax: pxm * 1.3, color: "#f4f4f4", alpha: 0.5, seed: seed + 2, soft: 0.1 });
  // pitting: fine speckle (dots, never lines)
  for (let i = 0; i < 2600; i++) {
    const x = R() * W, y = R() * H, r = 0.6 + R() * 1.6, dark = R() < 0.6;
    c.fillStyle = dark ? `rgba(40,16,6,${0.25 + R() * 0.3})` : `rgba(226,140,80,${0.15 + R() * 0.25})`; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    if (dark) { hc.fillStyle = "rgba(0,0,0,0.35)"; hc.beginPath(); hc.arc(x, y, r, 0, Math.PI * 2); hc.fill(); }
  }
  // seams: groove + weld bead; rivet rows along both
  const seam = (x0: number, y0: number, x1: number, y1: number) => {
    c.strokeStyle = "rgba(34,14,6,0.3)"; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = "rgba(236,160,110,0.16)"; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x0 + 1.5, y0 + 2); c.lineTo(x1 + 1.5, y1 + 2); c.stroke();
    hc.strokeStyle = "#303030"; hc.lineWidth = 2.5; hc.beginPath(); hc.moveTo(x0, y0); hc.lineTo(x1, y1); hc.stroke();
    hc.strokeStyle = "#b8b8b8"; hc.lineWidth = 2; hc.beginPath(); hc.moveTo(x0 + 2, y0 + 2.5); hc.lineTo(x1 + 2, y1 + 2.5); hc.stroke();
  };
  const rivet = (x: number, y: number) => {
    c.fillStyle = "rgba(52,22,8,0.4)"; c.beginPath(); c.arc(x + 0.6, y + 0.8, 2.0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(220,140,90,0.3)"; c.beginPath(); c.arc(x - 0.4, y - 0.5, 1.1, 0, Math.PI * 2); c.fill();
    hc.fillStyle = "#e8e8e8"; hc.beginPath(); hc.arc(x, y, 2.1, 0, Math.PI * 2); hc.fill();
  };
  // strake seams (horizontal, rivet rows both sides) + the butts of every plate (flush welds: faint + a rivet row)
  { let y = 0; for (const sh of [...strakes, 0]) { const yy = Math.min(H - 1, y); seam(0, yy, W, yy); for (let x = 5; x < W; x += 13) { rivet(x, yy + 6); if (yy > 6) rivet(x + 6, yy - 6); } y += sh; } }
  c.save(); c.globalAlpha = 0.45;
  for (const pl of plates) for (const ox of [0, W]) { const x = pl.x + ox; if (x > 0 && x < W) seam(x, pl.y, x, pl.y + pl.h); }
  c.restore();
  for (const pl of plates) for (const ox of [0, W]) { const x = pl.x + ox; if (x > 0 && x < W) for (let y = pl.y + 8; y < pl.y + pl.h; y += 13) rivet(x + 6, y); }
  // rust runs: CLUSTERED — the rusty plates weep heavily from their top seam, the sound ones hardly at all
  for (const pl of plates) {
    const heavy = pl.rust < 0.3 ? 5 : pl.rust < 0.5 ? 2 : pl.rust > 0.85 ? 1 : 0;
    if (!heavy) continue;
    for (const ox of [0, W]) {
      streaks(c, pl.x + ox, pl.y + 7, pl.w, pl.h * 2.2, { n: heavy * 2, color: "rgba(48,20,8,1)", alpha: 0.62, lenMin: pl.h * 0.35, lenMax: pl.h * 2.0, width: 8, seed: seed + 10 + Math.round(pl.x + pl.y), blend: "multiply" });
      streaks(c, pl.x + ox, pl.y + 7, pl.w, pl.h * 1.1, { n: heavy, color: "rgba(222,122,58,1)", alpha: 0.3, lenMin: pl.h * 0.25, lenMax: pl.h * 0.9, width: 9, seed: seed + 30 + Math.round(pl.x + pl.y), blend: "screen" });
    }
  }
  // the whole field repeated at x ± W where it crossed the edge is handled by the islands; soften the height detail
  paintNoise(hc, 0, 0, W, H, { seed: seed + 40, scale: W * 0.06, alpha: 0.35, blend: "overlay", octaves: 3 });
  paintNoise(rc, 0, 0, W, H, { seed: seed + 41, scale: W * 0.12, alpha: 0.25, blend: "overlay" });
  return { map: tex(el, { aniso: 8 }), normal: tex(normalFromHeight(hel, 2.6), { srgb: false }), rough: tex(rel, { srgb: false }) };
}

function facade(): { map: THREE.Texture; normal: THREE.Texture } {
  // 1024 × 372 ≈ 8 m × 2.9 m (one deck level): a white steel house rotting — irregular window openings (some glazed,
  // most black and broken, a few torn-out panels exposing the dark rooms), heavy rust blooms eating the paint from the
  // seams and the deck line, tears weeping from every opening, grime washing down, peeling paint islands.
  const W = 1024, H = 372, pxm = W / 8;
  const [el, c] = canvas(W, H), [hel, hc] = canvas(W, H);
  const R = rng(4401);
  c.fillStyle = "#ddd5c3"; c.fillRect(0, 0, W, H);
  hc.fillStyle = "#909090"; hc.fillRect(0, 0, W, H);
  paintNoise(c, 0, 0, W, H, { seed: 4402, scale: W * 0.8, alpha: 0.35, blend: "overlay", octaves: 5 });
  // panel seams + a stiffener line
  for (let x = 0; x < W; x += pxm * 2) { c.fillStyle = "rgba(90,70,55,0.4)"; c.fillRect(x, 0, 2, H); hc.fillStyle = "#505050"; hc.fillRect(x, 0, 3, H); }
  // rust eating the paint from the deck line + the seams: ragged blooms (irregular polygons, soft) + vertical washes
  const bloom = (cx: number, cy: number, rx: number, ry: number, col: string, a: number) => {
    c.save(); c.globalAlpha = a; c.fillStyle = col; c.beginPath();
    for (let k = 0; k <= 16; k++) { const t = (k / 16) * Math.PI * 2, rr = 0.5 + R() * 0.7; const x = cx + Math.cos(t) * rx * rr, y = cy + Math.sin(t) * ry * rr; k ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.closePath(); c.fill(); c.restore();
  };
  // rust comes out of the SEAMS and the deck line as vertical runs, and the paint PEELS in
  // flakes (primer + bare steel under a lifted lip) — no round/polygon blooms floating on clean wall
  void bloom;
  const edgeRust = c.createLinearGradient(0, H, 0, H * 0.7); edgeRust.addColorStop(0, "rgba(120,62,30,0.55)"); edgeRust.addColorStop(1, "rgba(120,62,30,0)");
  c.fillStyle = edgeRust; c.fillRect(0, H * 0.7, W, H * 0.3);
  for (let x = 0; x < W; x += pxm * 2) streaks(c, x - 6, 0, 14, H, { n: 3, color: "rgba(112,56,26,1)", alpha: 0.55, lenMin: H * 0.3, lenMax: H * 0.95, width: 5, seed: 4450 + x, blend: "multiply" });
  const peel = (cx: number, cy: number, sz: number) => {
    const pts: Array<[number, number]> = []; const n = 9;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, rr = sz * (0.45 + R() * 0.75); pts.push([cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr * 0.7]); }
    const path = () => { c.beginPath(); pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
    c.save(); c.translate(1.5, 2); c.fillStyle = "rgba(60,40,26,0.45)"; path(); c.fill(); c.restore();        // the lifted lip's shadow
    c.fillStyle = R() < 0.6 ? "#9c8a72" : "#8a5634"; path(); c.fill();                                        // primer / rusty steel
    c.strokeStyle = "rgba(250,246,236,0.9)"; c.lineWidth = 1.5; path(); c.stroke();                             // curled paint edge
    hc.fillStyle = "#6a6a6a"; hc.beginPath(); pts.forEach(([x, y], k) => (k ? hc.lineTo(x, y) : hc.moveTo(x, y))); hc.closePath(); hc.fill();
  };
  for (let i = 0; i < 22; i++) peel(R() * W, H * (0.62 + R() * 0.33), 5 + R() * 11);
  for (let i = 0; i < 14; i++) { const sx = Math.floor(R() * 4) * pxm * 2 + (R() - 0.5) * 16; peel(sx, R() * H, 4 + R() * 8); }
  paintNoise(c, 0, 0, W, H, { seed: 4406, scale: W * 0.3, alpha: 0.18, blend: "multiply", octaves: 4 });
  // openings: windows of two sizes, some doors-height gaps (a torn-out panel), glazed / broken / empty
  let x = pxm * (0.3 + R() * 0.4);
  while (x < W - pxm * 0.6) {
    // (a solid white block with SMALL square windows scattered over lots of blank wall)
    const kind = R(), big = kind < 0.06;
    const s = pxm * (big ? 1.1 : 0.48 + R() * 0.14), sh = big ? pxm * 1.9 : s, y = big ? H - 14 - sh : H - pxm * (1.25 + R() * 0.35);
    for (const dx of [0.12, 0.8]) {
      const len = pxm * (0.6 + R() * 1.4), g = c.createLinearGradient(0, y + sh, 0, y + sh + len);
      g.addColorStop(0, "rgba(110,52,22,0.85)"); g.addColorStop(1, "rgba(110,52,22,0)");
      c.fillStyle = g; c.fillRect(x + s * dx - 3, y + sh, 7 + R() * 7, len);
    }
    const glazed = !big && R() < 0.3;
    c.fillStyle = "#9d8f78"; c.fillRect(x - 5, y - 5, s + 10, sh + 10);
    const pane = c.createLinearGradient(x, y, x + s, y + sh);
    if (glazed) { pane.addColorStop(0, "#4a6270"); pane.addColorStop(0.5, "#1f2e37"); pane.addColorStop(1, "#33444e"); }
    else { pane.addColorStop(0, "#0f0c0a"); pane.addColorStop(1, "#1d1611"); }
    c.fillStyle = pane; c.fillRect(x, y, s, sh);
    // (no diagonal highlight stripe — it read as a "\" glyph on every pane; a soft sky sheen at the top + grime)
    if (glazed) { const sh2 = c.createLinearGradient(0, y, 0, y + sh); sh2.addColorStop(0, "rgba(170,200,215,0.28)"); sh2.addColorStop(0.45, "rgba(170,200,215,0)"); c.fillStyle = sh2; c.fillRect(x, y, s, sh); c.fillStyle = "rgba(90,70,50,0.35)"; c.fillRect(x, y + sh * 0.82, s, sh * 0.18); }
    else if (!big) { const g2 = c.createLinearGradient(x, y, x, y + sh); g2.addColorStop(0, "rgba(60,54,48,0.5)"); g2.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g2; c.fillRect(x, y, s, sh * 0.45); } // a hint of the dark room (no glyph)
    else { c.fillStyle = "rgba(60,90,30,0.8)"; for (let k = 0; k < 6; k++) { c.beginPath(); c.ellipse(x + R() * s, y + sh * (0.5 + R() * 0.5), 6 + R() * 8, 3 + R() * 4, R() * 3, 0, Math.PI * 2); c.fill(); } }
    hc.fillStyle = "#101010"; hc.fillRect(x, y, s, sh); hc.fillStyle = "#d0d0d0"; hc.fillRect(x - 5, y - 5, s + 10, 5); hc.fillRect(x - 5, y + sh, s + 10, 5);
    x += s + pxm * (1.1 + R() * 1.4);
  }
  streaks(c, 0, 0, W, H, { n: 50, color: "rgba(100,78,58,1)", alpha: 0.35, lenMin: H * 0.2, lenMax: H * 0.9, width: 9, seed: 4404, blend: "multiply" });
  edgeShade(c, 0, 0, W, H, { size: H * 0.3, color: "rgba(96,70,45,1)", alpha: 0.45, sides: ["bottom"], blend: "multiply" });
  edgeShade(c, 0, 0, W, H, { size: H * 0.12, color: "rgba(80,60,40,1)", alpha: 0.3, sides: ["top"], blend: "multiply" });
  paintNoise(hc, 0, 0, W, H, { seed: 4407, scale: W * 0.05, alpha: 0.35, blend: "overlay" });
  return { map: tex(el, { aniso: 8 }), normal: tex(normalFromHeight(hel, 3), { srgb: false }) };
}

function yellowRust(): THREE.Texture {
  const S = 512;
  const [el, c] = canvas(S, S);
  // (a deep, greener gold — #e7ad2a renders orange in the sun)
  c.fillStyle = "#d8ab16"; c.fillRect(0, 0, S, S);
  paintNoise(c, 0, 0, S, S, { seed: 4501, scale: S, alpha: 0.25, blend: "overlay" });
  // rust weeping from the plate seams (every 1 m around, 1.5 m up) + irregular flaked patches (no round dots)
  for (let y = 0; y < S; y += S / 2) streaks(c, 0, y + 4, S, S * 0.6, { n: 22, color: "rgba(120,58,22,1)", alpha: 0.5, lenMin: S * 0.08, lenMax: S * 0.5, width: 6, seed: 4502 + y, blend: "multiply" });
  const R = rng(4503);
  // flaked paint along the plate SEAMS (thin horizontal flakes where water sits), not blobs across the plates
  for (let i = 0; i < 18; i++) {
    const cx = R() * S, cy = (R() < 0.5 ? S / 2 : S) - 2 - R() * 18, rx = 10 + R() * 34, ry = 2.5 + R() * 5;
    c.save(); c.globalAlpha = 0.35 + R() * 0.3; c.fillStyle = R() < 0.6 ? "#9a4a1e" : "#6e3414"; c.beginPath();
    for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI * 2, q = 0.45 + R() * 0.7; const x = cx + Math.cos(a) * rx * q, y = cy + Math.sin(a) * ry * q; k ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.closePath(); c.fill(); c.restore();
  }
  for (let y = S / 2; y <= S; y += S / 2) { c.fillStyle = "rgba(90,50,20,0.35)"; c.fillRect(0, y - 2, S, 3); }
  for (let x = 0; x < S; x += S / 3) { c.fillStyle = "rgba(90,50,20,0.25)"; c.fillRect(x, 0, 2, S); }
  return tex(el, { aniso: 8 });
}

function vineStrip(): THREE.Texture {
  // 256 × 1024: a hanging creeper — a wavy stem with heart-shaped leaves both sides, denser at the top
  const W = 256, H = 1024;
  const [el, c] = canvas(W, H);
  c.clearRect(0, 0, W, H);
  const R = rng(4601);
  for (const off of [-50, 0, 46]) {
    let x = W / 2 + off;
    c.strokeStyle = "#3d5a1c"; c.lineWidth = 5; c.beginPath(); c.moveTo(x, 0);
    const pts: Array<[number, number]> = [];
    for (let y = 0; y < H; y += 16) { x += (R() - 0.5) * 8; x = Math.max(40, Math.min(W - 40, x)); pts.push([x, y]); c.lineTo(x, y); }
    c.stroke();
    for (const [px, py] of pts) {
      if (R() < py / H * 0.6) continue;
      for (const s of [-1, 1]) {
        if (R() < 0.3) continue;
        const L = 26 + R() * 30, a = s * (0.6 + R() * 0.7);
        const g = c.createLinearGradient(px, py, px + Math.sin(a) * L, py + Math.cos(a) * L);
        const lit = R();
        g.addColorStop(0, lit < 0.5 ? "#4f8a26" : "#6aa834"); g.addColorStop(1, lit < 0.5 ? "#2f5e1a" : "#3f7a22");
        c.fillStyle = g;
        c.save(); c.translate(px, py); c.rotate(-a);
        c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(L * 0.55, L * 0.2, L * 0.5, L * 0.9, 0, L); c.bezierCurveTo(-L * 0.5, L * 0.9, -L * 0.55, L * 0.2, 0, 0); c.fill();
        c.strokeStyle = "rgba(160,200,90,0.5)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 2); c.lineTo(0, L * 0.85); c.stroke();
        c.restore();
      }
    }
  }
  const t = tex(el, { repeat: false, aniso: 8 });
  return t;
}

function lettersTex(): THREE.Texture {
  const W = 2048, H = 320;
  const [el, c] = canvas(W, H);
  c.clearRect(0, 0, W, H);
  c.font = `800 276px "Avenir Next Condensed", "Arial Narrow", Impact, sans-serif`;
  (c as unknown as { letterSpacing: string }).letterSpacing = "34px";
  c.textAlign = "center"; c.fillStyle = "#efe8d8"; c.fillText("THE FEED", W / 2, 282);
  // paint ageing ON the letters only (source-atop): grime toward the bottom, rust bleeding down through the paint
  c.save(); c.globalCompositeOperation = "source-atop";
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(255,250,235,0)"); g.addColorStop(1, "rgba(120,92,64,0.35)");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.restore();
  streaks(c, 0, 0, W, H, { n: 70, color: "rgba(122,60,26,1)", alpha: 0.55, lenMin: 40, lenMax: 260, width: 7, seed: 4702, blend: "source-atop" });
  splotches(c, 0, 0, W, H, { n: 50, rMin: 3, rMax: 16, color: "rgba(140,70,30,1)", alpha: 0.45, seed: 4703, blend: "source-atop" });
  // flaking: fine specks + a few chipped edges (never big holes — reads as worn paint at 1 m and at 150 m)
  const R = rng(4701);
  c.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 2600; i++) { c.globalAlpha = 0.45 + R() * 0.55; c.beginPath(); c.ellipse(R() * W, R() * H, 0.8 + R() * 2.6, 0.6 + R() * 1.6, R() * 3, 0, Math.PI * 2); c.fill(); }
  for (let i = 0; i < 90; i++) { c.globalAlpha = 0.8; c.beginPath(); c.ellipse(R() * W, R() * H, 3 + R() * 6, 1.5 + R() * 3, R() * 3, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
  paintNoise(c, 0, 0, W, H, { seed: 4704, scale: 90, alpha: 0.22, blend: "destination-out" });
  c.globalCompositeOperation = "source-over";
  return tex(el, { repeat: false, aniso: 16 });
}

export function wreckMats(): WreckMats {
  if (cache) return cache;
  const hullT = hullPlates(4101);
  const deckT = rustPlates(512, 512, 4201, { strake: 256, butt: 512, tone: "#5c4234", deck: true });
  const fac = facade();
  const hull = darkInside(weather(new THREE.MeshStandardMaterial({ map: hullT.map, normalMap: hullT.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: hullT.rough, roughness: 0.95, metalness: 0.22, side: THREE.DoubleSide, name: "wreck-hull" }), { vary: 0.2, grime: 0.85, grimeY: -0.2, grimeH: 2.4, grimeColor: "#2e3b22", scale: [0.07, 0.02], streak: 0.42, streakColor: "#3e1a0a" }));
  tileMetres(hull, 12, 6);
  const deck = weather(new THREE.MeshStandardMaterial({ map: deckT.map, normalMap: deckT.normal, normalScale: new THREE.Vector2(1, 1), roughnessMap: deckT.rough, roughness: 1, metalness: 0.1, name: "wreck-deck" }), { vary: 0.22, grime: 0.3, grimeY: 0, grimeH: 1.5, grimeColor: "#3b4a2a" });
  tileMetres(deck, 7);
  deck.shadowSide = THREE.DoubleSide; // single-sided deck plating must still shade the hold below
  const inner = new THREE.MeshStandardMaterial({ color: "#2a1a12", roughness: 0.95, metalness: 0.05, side: THREE.DoubleSide, name: "wreck-inner" });
  const facadeM = weather(new THREE.MeshStandardMaterial({ map: fac.map, normalMap: fac.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.78, metalness: 0.02, name: "wreck-facade" }), { vary: 0.16, grime: 0.2, grimeY: 8, grimeH: 3, grimeColor: "#7a6a52", streak: 0.35, streakColor: "#7a4a26" });
  tileMetres(facadeM, 8, 2.9);
  facadeM.shadowSide = THREE.DoubleSide; // torn house ends leave single walls — they must still cast
  const trimT = rustPlates(256, 256, 4301, { strake: 128, butt: 256, tone: "#ddd6c6" });
  const whiteTrim = weather(new THREE.MeshStandardMaterial({ map: trimT.map, roughness: 0.8, metalness: 0.02, color: "#ffffff", name: "wreck-white" }), { vary: 0.14, grime: 0.1 });
  tileMetres(whiteTrim, 3);
  const funnel = weather(new THREE.MeshStandardMaterial({ map: yellowRust(), roughness: 0.62, metalness: 0.05, name: "wreck-yellow" }), { vary: 0.14, grime: 0, streak: 0.4, streakColor: "#7a3a14" });
  tileMetres(funnel, 3);
  const vineT = vineStrip();
  const vine = new THREE.MeshStandardMaterial({ map: vineT, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, metalness: 0, name: "wreck-vine" });
  const letters = new THREE.MeshStandardMaterial({ map: lettersTex(), transparent: true, alphaTest: 0.3, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, name: "wreck-letters", depthWrite: false });
  cache = {
    hull, deck, inner, facade: facadeM, whiteTrim, funnel, mast: funnel,
    black: new THREE.MeshStandardMaterial({ color: "#1c1a18", roughness: 0.7, metalness: 0.2, name: "wreck-black" }),
    steel: weather(new THREE.MeshStandardMaterial({ color: "#5a4636", roughness: 0.85, metalness: 0.3, name: "wreck-steel" }), { vary: 0.2, grime: 0 }),
    vine, letters,
  };
  return cache;
}
