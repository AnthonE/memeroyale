// Canvas-painted foliage textures, v2 — the hero painters that define the island's look. Everything is painted in
// code (deterministic, seeded, cached) so plants match the target art's "big sculpted leaf clumps, glossy stylised PBR"
// direction exactly. Albedo textures are mid-tone: the foliage material adds sun, translucency and GI fill.
//   palmFrond2      512x1280 portrait, base at v=0 — WIDE stylised feather: fused overlapping leaflets (notched edge)
//                    for the first ~65 %, separating drooping leaflets toward the tip, bright yellow-green rachis.
//   canopyPuff      1024², rounded mass of ~300 small lanceolate leaves in shoot clusters, feathered silhouette.
//   treeBark2       512² tile, grey-brown, vertical fibre + fissures, height→normal.   palmBark2: tan ringed tile.
//   coconut2        256², fibrous husk with the three "eyes".    liana: 64x1024 twisted rope strand.
//   groundcover     512², clump of small round glossy leaves.    signWood / signPost: the highlands signpost.
import * as THREE from "three";
import { mulberry32 } from "../../../../shared/world/noise";

type Ctx = CanvasRenderingContext2D;
const cache = new Map<string, THREE.CanvasTexture>();
const canvas = (w: number, h: number): [HTMLCanvasElement, Ctx] => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")!]; };
const cached = (key: string, make: () => THREE.CanvasTexture) => { let t = cache.get(key); if (!t) { t = make(); cache.set(key, t); } return t; };
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function tex(c: HTMLCanvasElement, o: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = o.aniso ?? 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** tapered pointed leaf polygon from (x0,y0) along (dx,dy): length len, width w, perpendicular droop, widest at `widest` */
function leaf(ctx: Ctx, x0: number, y0: number, dx: number, dy: number, len: number, w: number, droop: number, widest = 0.4, tipSharp = 1) {
  const px = -dy, py = dx;
  const tipx = x0 + dx * len + px * droop * len, tipy = y0 + dy * len + py * droop * len;
  const mx = x0 + dx * len * widest + px * droop * len * widest * 0.5, my = y0 + dy * len * widest + py * droop * len * widest * 0.5;
  ctx.beginPath();
  ctx.moveTo(x0 - px * w * 0.2, y0 - py * w * 0.2);
  ctx.quadraticCurveTo(mx - px * w * 0.5, my - py * w * 0.5, tipx - px * w * 0.04 * tipSharp, tipy - py * w * 0.04 * tipSharp);
  ctx.quadraticCurveTo(mx + px * w * 0.5, my + py * w * 0.5, x0 + px * w * 0.2, y0 + py * w * 0.2);
  ctx.closePath();
  return [tipx, tipy, mx, my] as const;
}

// =====================================================================================================================
// PALM FROND
export function palmFrond2(seed = 1, o: { hue?: number; light?: number; sat?: number } = {}): THREE.CanvasTexture {
  return cached(`frond2:${seed}:${JSON.stringify(o)}`, () => {
    const W = 512, H = 1280;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 7919 + 11);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, hue = o.hue ?? 92, light = o.light ?? 0.44, sat = o.sat ?? 0.6;
    const N = 36, t0 = 0.075, t1 = 0.985;
    const yOf = (t: number) => H - 6 - t * (H - 12);
    const pitch = ((t1 - t0) * (H - 12)) / N;
    // leaflets, drawn tip-first so the lower (base-ward) leaflet overlaps the one above: reads as one fused blade
    for (let k = N - 1; k >= 0; k--) {
      const t = t0 + ((k + 0.5) / N) * (t1 - t0);
      const y = yOf(t);
      const sep = smooth(0.62, 1.0, t);                       // 0 fused … 1 separated tip leaflets
      const ang = lerp(1.08, 0.5, Math.pow(t, 0.8));           // from the rachis axis (rad) — flatter toward the tip
      const edge = (W / 2 - 4) * (0.55 + 0.45 * smooth(0, 0.22, t)) * (1 - 0.18 * smooth(0.8, 1, t));
      const reach = Math.min(edge / Math.max(0.3, Math.sin(ang)), edge * 1.9) * (0.97 + rnd() * 0.05);
      const w = pitch * lerp(2.35, 1.15, sep) * (0.94 + rnd() * 0.12) * (0.75 + 0.25 * smooth(0, 0.15, t));
      const droop = 0.06 + 0.34 * t * t;
      for (const s of [-1, 1]) {
        const dx = s * Math.sin(ang), dy = -Math.cos(ang);
        const hj = (rnd() - 0.5) * 7, lj = (rnd() - 0.5) * 0.05 + (k % 2 ? 0.02 : -0.02);
        const [tx, ty, mx, my] = leaf(ctx, cx + s * 4, y, dx, dy, reach, w, s * droop, 0.55 - 0.2 * sep, 1);
        const g = ctx.createLinearGradient(cx, y, tx, ty);
        g.addColorStop(0, hsl(hue + 6 + hj, sat, light - 0.13 + lj));
        g.addColorStop(0.25, hsl(hue + hj, sat + 0.02, light + lj));
        g.addColorStop(0.75, hsl(hue - 4 + hj, sat + 0.05, light + 0.05 + lj));
        g.addColorStop(1, hsl(hue - 10 + hj, sat + 0.08, light + 0.1 + lj));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = hsl(hue + 8, 0.5, 0.16, 0.42); ctx.lineWidth = 1.4; ctx.stroke();
        // midvein: light ridge + soft dark shadow line beside it (sculpted crease)
        ctx.beginPath(); ctx.moveTo(cx + s * 4, y); ctx.quadraticCurveTo(mx, my, tx, ty);
        ctx.strokeStyle = hsl(hue - 20, 0.55, 0.7, 0.32); ctx.lineWidth = 2.2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + s * 4 + dy * s * 2.5, y - dx * s * 2.5); ctx.quadraticCurveTo(mx + dy * s * 2.5, my - dx * s * 2.5, tx, ty);
        ctx.strokeStyle = hsl(hue + 10, 0.5, 0.22, 0.2); ctx.lineWidth = 1.6; ctx.stroke();
      }
    }
    // glossy sheen: soft light band along the blade either side of the rachis (alpha preserved)
    ctx.globalCompositeOperation = "source-atop";
    const sheen = ctx.createLinearGradient(cx - 150, 0, cx + 150, 0);
    sheen.addColorStop(0, "rgba(255,255,210,0)"); sheen.addColorStop(0.35, "rgba(255,255,210,0.14)"); sheen.addColorStop(0.5, "rgba(255,255,210,0.05)"); sheen.addColorStop(0.65, "rgba(255,255,210,0.14)"); sheen.addColorStop(1, "rgba(255,255,210,0)");
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H);
    // base AO where the leaflets meet the petiole
    const ao = ctx.createLinearGradient(0, H, 0, H * 0.8);
    ao.addColorStop(0, "rgba(20,40,0,0.35)"); ao.addColorStop(1, "rgba(20,40,0,0)");
    ctx.fillStyle = ao; ctx.fillRect(0, H * 0.8, W, H * 0.2);
    ctx.globalCompositeOperation = "source-over";
    // rachis: tapered, yellow-green, darker outline, bright highlight ridge
    ctx.beginPath();
    ctx.moveTo(cx - 15, H); ctx.lineTo(cx - 2.5, 30); ctx.lineTo(cx + 2.5, 30); ctx.lineTo(cx + 15, H); ctx.closePath();
    const rg = ctx.createLinearGradient(0, H, 0, 0);
    rg.addColorStop(0, hsl(52, 0.55, 0.5)); rg.addColorStop(0.5, hsl(66, 0.62, 0.5)); rg.addColorStop(1, hsl(78, 0.58, 0.46));
    ctx.fillStyle = rg; ctx.fill();
    ctx.strokeStyle = hsl(70, 0.5, 0.22, 0.85); ctx.lineWidth = 1.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 6, H); ctx.lineTo(cx - 1, 40); ctx.strokeStyle = hsl(58, 0.75, 0.8, 0.8); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 8, H); ctx.lineTo(cx + 1.5, 40); ctx.strokeStyle = hsl(70, 0.5, 0.28, 0.5); ctx.lineWidth = 2.5; ctx.stroke();
    return tex(c, { aniso: 16 });
  });
}

// =====================================================================================================================
// CANOPY PUFF — a rounded mass of small leaves in shoot clusters. hue centre, leafLen px (at 1024), count leaves.
export function canopyPuff(seed = 1, o: { hue?: number; leafLen?: number; count?: number; sat?: number; light?: number; round?: boolean; clusters?: number; wide?: number } = {}): THREE.CanvasTexture {
  return cached(`puff:${seed}:${JSON.stringify(o)}`, () => {
    const W = 1024;
    const [c, ctx] = canvas(W, W);
    const rnd = mulberry32(seed * 31337 + 5);
    const hue = o.hue ?? 100, leafLen = o.leafLen ?? 78, count = o.count ?? 320, sat = o.sat ?? 0.58, light = o.light ?? 0.4, wide = o.wide ?? 0.42;
    const nCl = o.clusters ?? 14;
    ctx.clearRect(0, 0, W, W);
    const R = W / 2 - leafLen * 0.9;
    // shoot clusters: centres inside the blob, each a fan of leaves around a twig end pointing outward
    const clusters: Array<{ x: number; y: number; a: number; d: number }> = [];
    for (let i = 0; i < nCl; i++) {
      const th = (i / nCl) * Math.PI * 2 + rnd() * 0.5, r = R * (0.25 + 0.7 * Math.sqrt(rnd()));
      clusters.push({ x: W / 2 + Math.cos(th) * r, y: W / 2 + Math.sin(th) * r, a: th + (rnd() - 0.5) * 0.8, d: r / R });
    }
    const leaves: Array<{ x: number; y: number; a: number; l: number; w: number; d: number; c: number }> = [];
    for (let i = 0; i < count; i++) {
      const ci = Math.floor(rnd() * nCl), cl = clusters[ci];
      const spread = leafLen * 1.3;
      const x = cl.x + (rnd() - 0.5) * 2 * spread, y = cl.y + (rnd() - 0.5) * 2 * spread;
      const d = Math.hypot(x - W / 2, y - W / 2) / R;
      if (d > 1.02) continue;
      // outward-ish orientation with jitter; outer leaves point outward more strictly (feathered silhouette)
      const outward = Math.atan2(y - W / 2, x - W / 2);
      const a = lerp(cl.a + (rnd() - 0.5) * 2.4, outward + (rnd() - 0.5) * 0.9, smooth(0.5, 1, d));
      const l = leafLen * (0.7 + rnd() * 0.6), w = l * (o.round ? 0.62 : wide) * (0.85 + rnd() * 0.3);
      leaves.push({ x, y, a, l, w, d, c: ci });
    }
    leaves.sort((p, q) => q.d - p.d);   // outer first, centre on top (depth stack)
    for (const L of leaves) {
      const dx = Math.cos(L.a), dy = Math.sin(L.a);
      const depth = 1 - L.d;
      const hj = (rnd() - 0.5) * 12, lj = (rnd() - 0.5) * 0.09;
      const li = light - 0.04 * depth + lj;
      const [tx, ty, mx, my] = leaf(ctx, L.x - dx * L.l * 0.45, L.y - dy * L.l * 0.45, dx, dy, L.l, L.w, (rnd() - 0.5) * 0.12, o.round ? 0.5 : 0.42);
      const g = ctx.createLinearGradient(L.x - dx * L.l * 0.45, L.y - dy * L.l * 0.45, tx, ty);
      g.addColorStop(0, hsl(hue + hj + 4, sat, li - 0.06));
      g.addColorStop(0.5, hsl(hue + hj, sat + 0.04, li + 0.02));
      g.addColorStop(1, hsl(hue + hj - 6, sat + 0.08, li + 0.07));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = hsl(hue + 6, 0.5, 0.15, 0.3 + 0.2 * depth); ctx.lineWidth = 1.3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L.x - dx * L.l * 0.4, L.y - dy * L.l * 0.4); ctx.quadraticCurveTo(mx, my, tx - dx * 4, ty - dy * 4);
      ctx.strokeStyle = hsl(hue - 14, 0.5, 0.64, 0.25); ctx.lineWidth = 1.5; ctx.stroke();
    }
    // interior occlusion: darker toward the centre-bottom of the puff (alpha preserved) — the card set + bent normals
    // supply the big-volume shading; this only stops the interior reading as flat
    ctx.globalCompositeOperation = "source-atop";
    const occ = ctx.createRadialGradient(W * 0.5, W * 0.6, W * 0.04, W * 0.5, W * 0.55, W * 0.5);
    occ.addColorStop(0, "rgba(0,18,0,0.28)"); occ.addColorStop(0.55, "rgba(0,18,0,0.08)"); occ.addColorStop(1, "rgba(0,18,0,0)");
    ctx.fillStyle = occ; ctx.fillRect(0, 0, W, W);
    ctx.globalCompositeOperation = "source-over";
    return tex(c, { aniso: 8 });
  });
}

// =====================================================================================================================
// NORMAL from height (Sobel), tileable
export function normalFromHeight(hc: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const W = hc.width, H = hc.height;
  const src = hc.getContext("2d")!.getImageData(0, 0, W, H).data;
  const [c, ctx] = canvas(W, H);
  const out = ctx.createImageData(W, H), d = out.data;
  const h = (x: number, y: number) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * W + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** buttress-tree bark: grey-brown, smooth-ish with vertical fibre streaks and a few deep fissures; square tile (1.4 m) */
export function treeBark2(seed = 1, o: { hue?: number; light?: number } = {}): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const key = `treebark2:${seed}:${JSON.stringify(o)}`;
  const hue = o.hue ?? 30, light = o.light ?? 0.43;
  const paint = (heightOnly: boolean) => {
    const W = 512, H = 512;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 23 + (heightOnly ? 4 : 5));
    ctx.fillStyle = heightOnly ? "#8c8c8c" : hsl(hue, 0.16, light); ctx.fillRect(0, 0, W, H);
    // broad tonal patches (weathered plates), very soft
    if (!heightOnly) for (let i = 0; i < 90; i++) {
      const x = rnd() * W, y = rnd() * H, w = 40 + rnd() * 120, h = 80 + rnd() * 240;
      ctx.fillStyle = hsl(hue + (rnd() - 0.5) * 16, 0.14 + rnd() * 0.1, light + (rnd() - 0.5) * 0.16, 0.22);
      ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, (rnd() - 0.5) * 0.3, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y - H, w / 2, h / 2, (rnd() - 0.5) * 0.3, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y + H, w / 2, h / 2, (rnd() - 0.5) * 0.3, 0, 6.3); ctx.fill();
    }
    // vertical fibre streaks (tile vertically): many, low contrast
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, len = 60 + rnd() * 260, y = rnd() * H, lean = (rnd() - 0.5) * 10;
      const dark = rnd() < 0.55;
      ctx.strokeStyle = heightOnly ? (dark ? "#6a6a6a" : "#a8a8a8") : (dark ? hsl(hue, 0.2, light - 0.16, 0.28) : hsl(hue + 6, 0.16, light + 0.16, 0.24));
      ctx.lineWidth = 1 + rnd() * 2.2; ctx.lineCap = "round";
      for (const oy of [0, -H, H]) { ctx.beginPath(); ctx.moveTo(x, y + oy); ctx.lineTo(x + lean, y + len + oy); ctx.stroke(); }
    }
    // deep fissures (wavy verticals), wrap vertically
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W;
      let px = x; ctx.beginPath(); ctx.moveTo(px, -20);
      for (let y = 0; y <= H + 20; y += 28) { px += (rnd() - 0.5) * 12; ctx.lineTo(px, y); }
      ctx.strokeStyle = heightOnly ? "#2a2a2a" : hsl(hue, 0.25, 0.16, 0.55); ctx.lineWidth = 3 + rnd() * 4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 5, -20); px = x + 5;
      for (let y = 0; y <= H + 20; y += 28) { px += (rnd() - 0.5) * 12; ctx.lineTo(px, y); }
      ctx.strokeStyle = heightOnly ? "#c8c8c8" : hsl(hue + 8, 0.2, light + 0.22, 0.32); ctx.lineWidth = 1.8; ctx.stroke();
    }
    // lichen flecks + faint moss haze
    if (!heightOnly) for (let i = 0; i < 90; i++) { ctx.fillStyle = hsl(95 + rnd() * 30, 0.3, 0.42 + rnd() * 0.2, 0.18); ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H, 3 + rnd() * 9, 2 + rnd() * 5, rnd() * 3, 0, 6.3); ctx.fill(); }
    return c;
  };
  return {
    map: cached(key, () => tex(paint(false), { repeat: true, aniso: 16 })),
    normalMap: cached(key + ":n", () => tex(normalFromHeight(paint(true), 2.4), { srgb: false, repeat: true, aniso: 16 })),
  };
}

/** palm trunk tile: tan/grey-tan with two leaf-scar ring bands per tile (v 0.25 / 0.75) and fine fibre. `bold` = the
 *  highlands cup-stack look (orange-brown, deep grooves). */
export function palmBark2(seed = 1, o: { hue?: number; light?: number; sat?: number; bold?: boolean } = {}): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const key = `palmbark2:${seed}:${JSON.stringify(o)}`;
  const hue = o.hue ?? 36, light = o.light ?? 0.56, sat = o.sat ?? 0.2, bold = !!o.bold;
  const paint = (heightOnly: boolean) => {
    const W = 256, H = 256;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 17 + (heightOnly ? 3 : 2));
    ctx.fillStyle = heightOnly ? "#8a8a8a" : hsl(hue, sat, light); ctx.fillRect(0, 0, W, H);
    // per-segment tonal variation (each ring segment slightly different)
    if (!heightOnly) for (const [y0, y1] of [[0, 64], [64, 192], [192, 256]]) { ctx.fillStyle = hsl(hue + (rnd() - 0.5) * 10, sat, light + (rnd() - 0.5) * 0.08, 0.5); ctx.fillRect(0, y0, W, y1 - y0); }
    // fibre streaks (diagonal weave on real palms — slight lean)
    for (let i = 0; i < 220; i++) {
      const x = rnd() * W, len = 20 + rnd() * 90, y = rnd() * H, lean = (rnd() - 0.5) * 14;
      const dark = rnd() < 0.5;
      ctx.strokeStyle = heightOnly ? (dark ? "#6c6c6c" : "#a6a6a6") : (dark ? hsl(hue, sat + 0.1, light - 0.18, 0.28) : hsl(hue, sat, light + 0.14, 0.24));
      ctx.lineWidth = 0.8 + rnd() * 2;
      for (const oy of [0, -H, H]) { ctx.beginPath(); ctx.moveTo(x, y + oy); ctx.lineTo(x + lean, y + len + oy); ctx.stroke(); }
    }
    // ring bands (leaf scars): lighter rim above, dark groove, soft below. canvas y = (1 - v) * H → v .25 → y 192
    const bandH = bold ? 26 : 18;
    for (const y of [64, 192]) {
      const g = ctx.createLinearGradient(0, y - bandH, 0, y + bandH);
      if (heightOnly) { g.addColorStop(0, "#8a8a8a"); g.addColorStop(0.3, "#d0d0d0"); g.addColorStop(0.5, bold ? "#141414" : "#303030"); g.addColorStop(0.8, "#6a6a6a"); g.addColorStop(1, "#8a8a8a"); }
      else {
        g.addColorStop(0, hsl(hue, sat, light, 0)); g.addColorStop(0.3, hsl(hue, sat + 0.05, light + 0.16, 0.9)); g.addColorStop(0.5, hsl(hue, sat + 0.15, light - (bold ? 0.34 : 0.26), 0.95)); g.addColorStop(0.8, hsl(hue, sat + 0.05, light - 0.1, 0.7)); g.addColorStop(1, hsl(hue, sat, light, 0));
      }
      ctx.fillStyle = g; ctx.fillRect(0, y - bandH, W, bandH * 2);
      // ragged scar edge
      if (!heightOnly) for (let x = 0; x < W; x += 5) { ctx.fillStyle = hsl(hue, sat + 0.15, light - 0.3, 0.45 + rnd() * 0.4); ctx.fillRect(x, y - 2 + rnd() * 4, 3, 3 + rnd() * 5); }
    }
    return c;
  };
  return {
    map: cached(key, () => tex(paint(false), { repeat: true, aniso: 16 })),
    normalMap: cached(key + ":n", () => tex(normalFromHeight(paint(true), bold ? 3 : 2.2), { srgb: false, repeat: true, aniso: 16 })),
  };
}

/** coconut husk: fibrous brown (or green-yellow young nut), with the three eyes at the top (v≈0.92) */
export function coconut2(seed = 1, green = false): THREE.CanvasTexture {
  return cached(`coco2:${seed}:${green}`, () => {
    const W = 256, H = 256;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 5 + 8);
    const base = green ? [64, 0.55, 0.5] : [28, 0.45, 0.32];
    ctx.fillStyle = hsl(base[0], base[1], base[2]); ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) {
      const x = rnd() * W, y = rnd() * H, len = 8 + rnd() * 30;
      ctx.strokeStyle = green ? hsl(58 + rnd() * 14, 0.55, 0.38 + rnd() * 0.3, 0.35) : hsl(22 + rnd() * 14, 0.45, 0.16 + rnd() * 0.34, 0.5);
      ctx.lineWidth = 0.8 + rnd() * 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 5, y + len); ctx.stroke();
    }
    // three eyes near the top (sphere v≈0.92 → y≈20)
    for (let e = 0; e < 3; e++) { const x = W / 2 + Math.cos((e / 3) * 6.283) * 26, y = 22 + Math.sin((e / 3) * 6.283) * 8; ctx.beginPath(); ctx.ellipse(x, y, 9, 6, 0, 0, 6.3); ctx.fillStyle = hsl(base[0], 0.4, 0.12, 0.9); ctx.fill(); }
    // soft top/bottom darkening
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(0,0,0,0.25)"); g.addColorStop(0.2, "rgba(0,0,0,0)"); g.addColorStop(0.8, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.2)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return tex(c, { repeat: true });
  });
}

/**
 * The fallen log's weathered, DEBARKED wood (a pale tan-grey log, long drying cracks
 * along it, soft grain, a knot or two, scraps of dark bark left in the hollows): 512² tile, u ALONG the log (canvas
 * x), v AROUND it (canvas y, wraps). + a height-derived normal map (grain grooves, cracks, knot rims).
 */
export function logWood(seed = 1): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const key = `logwood:${seed}`;
  const paint = (heightOnly: boolean) => {
    const W = 512, H = 512;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 41 + 3);                       // the same draws for colour and height
    // (pale weathered wood, not dark red-brown — toward #b8a07a)
    ctx.fillStyle = heightOnly ? "#9a9a9a" : hsl(37, 0.28, 0.6); ctx.fillRect(0, 0, W, H);
    const wrap = (f: (dx: number, dy: number) => void) => { for (const dx of [0, -W, W]) for (const dy of [0, -H, H]) f(dx, dy); };
    // weathering: broad pale-grey and warm-tan bands running along the log
    for (let i = 0; i < 60; i++) {
      const y = rnd() * H, x = rnd() * W, w = 120 + rnd() * 300, h = 14 + rnd() * 40, grey = rnd() < 0.5;
      const col = heightOnly ? (grey ? "rgba(170,170,170,0.18)" : "rgba(120,120,120,0.14)") : grey ? hsl(40, 0.1, 0.7, 0.24) : hsl(32, 0.3, 0.5, 0.18);
      wrap((dx, dy) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, w / 2, h / 2, 0, 0, 6.3); ctx.fill(); });
    }
    // grain: many long, slightly wavy lines along u
    for (let i = 0; i < 340; i++) {
      const y0 = rnd() * H, x0 = rnd() * W, len = 120 + rnd() * 380, dark = rnd() < 0.6, amp = 1 + rnd() * 3, ph = rnd() * 6.28;
      const col = heightOnly ? (dark ? "rgba(90,90,90,0.5)" : "rgba(200,200,200,0.35)") : dark ? hsl(30, 0.28, 0.4, 0.26) : hsl(40, 0.22, 0.76, 0.22);
      wrap((dx, dy) => {
        ctx.strokeStyle = col; ctx.lineWidth = 0.8 + rnd() * 1.4; ctx.beginPath();
        for (let t = 0; t <= len; t += 16) { const x = x0 + t + dx, y = y0 + dy + Math.sin(t * 0.02 + ph) * amp; if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      });
    }
    // drying cracks: long dark fissures with a pale lit lip above them
    for (let i = 0; i < 9; i++) {
      const y0 = rnd() * H, x0 = rnd() * W, len = 180 + rnd() * 320, ph = rnd() * 6.28, wd = 2 + rnd() * 3.5;
      const pts: Array<[number, number]> = [];
      for (let t = 0; t <= len; t += 10) pts.push([x0 + t, y0 + Math.sin(t * 0.03 + ph) * 4 + (rnd() - 0.5) * 2]);
      wrap((dx, dy) => {
        ctx.lineCap = "round";
        ctx.strokeStyle = heightOnly ? "#1c1c1c" : hsl(24, 0.4, 0.14, 0.85); ctx.lineWidth = wd;
        ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy))); ctx.stroke();
        ctx.strokeStyle = heightOnly ? "#d0d0d0" : hsl(38, 0.24, 0.7, 0.5); ctx.lineWidth = 1.4;
        ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x + dx, y + dy - wd * 0.8) : ctx.moveTo(x + dx, y + dy - wd * 0.8))); ctx.stroke();
      });
    }
    // knots: dark cores with ring halos that bend the grain
    for (let i = 0; i < 3; i++) {
      const x = rnd() * W, y = rnd() * H, r = 7 + rnd() * 9;
      wrap((dx, dy) => {
        for (let k = 3; k >= 0; k--) {
          ctx.strokeStyle = heightOnly ? (k % 2 ? "#707070" : "#b8b8b8") : hsl(28, 0.35, 0.3 + k * 0.06, 0.5);
          ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r * (1 + k * 0.7) * 1.8, r * (1 + k * 0.5), 0, 0, 6.3); ctx.stroke();
        }
        ctx.fillStyle = heightOnly ? "#303030" : hsl(22, 0.45, 0.16, 0.9); ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r * 1.2, r * 0.8, 0, 0, 6.3); ctx.fill();
      });
    }
    // scraps of old dark bark in the hollows
    if (!heightOnly) for (let i = 0; i < 14; i++) {
      const x = rnd() * W, y = rnd() * H, w = 20 + rnd() * 60, h = 6 + rnd() * 14;
      wrap((dx, dy) => { ctx.fillStyle = hsl(22, 0.35, 0.2, 0.55); ctx.beginPath(); ctx.ellipse(x + dx, y + dy, w / 2, h / 2, (rnd() - 0.5) * 0.2, 0, 6.3); ctx.fill(); });
    }
    // green algae / lichen flecks
    if (!heightOnly) for (let i = 0; i < 160; i++) { const x = rnd() * W, y = rnd() * H; ctx.fillStyle = hsl(80 + rnd() * 20, 0.35, 0.4 + rnd() * 0.15, 0.22); ctx.beginPath(); ctx.ellipse(x, y, 2 + rnd() * 6, 1.5 + rnd() * 3, 0, 0, 6.3); ctx.fill(); }
    return c;
  };
  return {
    map: cached(key, () => tex(paint(false), { repeat: true, aniso: 16 })),
    normalMap: cached(key + ":n", () => tex(normalFromHeight(paint(true), 3), { srgb: false, repeat: true, aniso: 16 })),
  };
}

/**
 * A DRY fallen palm frond (straw-brown, lying on the sand): 256×1024, base at v=0,
 * a pale tapered rachis down the middle, 34 pairs of curling straw leaflets angled toward the tip, some broken short,
 * a few gaps; tan … grey-brown with darker bases.
 */
export function dryFrond(seed = 1): THREE.CanvasTexture {
  return cached(`dryfrond:${seed}`, () => {
    const W = 256, H = 1024;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 61 + 7);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const yOf = (v: number) => (1 - v) * H;
    for (let i = 0; i < 34; i++) {
      const v = 0.08 + 0.9 * (i / 34), len = W * 0.47 * Math.sin(Math.PI * Math.min(1, 0.15 + v * 0.95)) * (0.75 + 0.25 * rnd());
      for (const side of [-1, 1]) {
        if (rnd() < 0.08) continue;                                          // a missing leaflet
        const l = len * (rnd() < 0.15 ? 0.45 : 1), w = 7 + rnd() * 5, ang = (0.55 + rnd() * 0.25) * side;
        const x0 = cx + side * 4, y0 = yOf(v);
        const x1 = x0 + Math.sin(ang) * l, y1 = y0 - Math.cos(Math.abs(ang)) * l * 0.55;
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        const hue = 30 + rnd() * 10, li = 0.42 + rnd() * 0.16;
        g.addColorStop(0, hsl(hue - 4, 0.42, li - 0.14)); g.addColorStop(0.5, hsl(hue, 0.46, li)); g.addColorStop(1, hsl(hue + 4, 0.4, li + 0.08));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x0, y0 - w * 0.5);
        ctx.quadraticCurveTo((x0 + x1) / 2 + side * 3, (y0 + y1) / 2 - w * 0.6, x1, y1);
        ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + w * 0.4, x0, y0 + w * 0.5);
        ctx.fill();
        ctx.strokeStyle = hsl(hue - 8, 0.4, li - 0.2, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
    // rachis: pale tapered stripe
    ctx.beginPath(); ctx.moveTo(cx - 9, H); ctx.lineTo(cx - 2, 0); ctx.lineTo(cx + 2, 0); ctx.lineTo(cx + 9, H); ctx.closePath();
    const rg = ctx.createLinearGradient(cx - 9, 0, cx + 9, 0); rg.addColorStop(0, hsl(34, 0.3, 0.42)); rg.addColorStop(0.5, hsl(38, 0.34, 0.66)); rg.addColorStop(1, hsl(32, 0.3, 0.4));
    ctx.fillStyle = rg; ctx.fill();
    return tex(c);
  });
}

/** fallen-log end grain, 256²: pale tan heartwood with growth rings, radial checks, a dark bark rim (polar uv) */
export function logEnd(seed = 1): THREE.CanvasTexture {
  return cached(`logend:${seed}`, () => {
    const W = 256;
    const [c, ctx] = canvas(W, W);
    const rnd = mulberry32(seed * 37 + 5);
    const C = W / 2;
    ctx.fillStyle = hsl(32, 0.42, 0.3); ctx.fillRect(0, 0, W, W);
    // heartwood disc with rings
    for (let r = C * 0.9; r > 2; r -= 3 + rnd() * 5) {
      const k = r / C;
      ctx.beginPath();
      for (let a = 0; a <= 64; a++) { const t = (a / 64) * Math.PI * 2, rr = r * (1 + 0.035 * Math.sin(t * 3 + seed) + 0.02 * Math.sin(t * 7)); a ? ctx.lineTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr) : ctx.moveTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr); }
      ctx.closePath();
      ctx.fillStyle = hsl(34 + k * 4, 0.45 - k * 0.1, 0.62 - k * 0.1 + (rnd() - 0.5) * 0.04); ctx.fill();
      ctx.strokeStyle = hsl(28, 0.4, 0.4, 0.45); ctx.lineWidth = 1; ctx.stroke();
    }
    // radial checks (drying cracks) + a darker rotten core
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2, r0 = C * (0.05 + rnd() * 0.2), r1 = C * (0.45 + rnd() * 0.4);
      ctx.strokeStyle = hsl(25, 0.4, 0.22, 0.8); ctx.lineWidth = 1.5 + rnd() * 2;
      ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); ctx.lineTo(C + Math.cos(a + 0.05) * r1, C + Math.sin(a + 0.05) * r1); ctx.stroke();
    }
    const g = ctx.createRadialGradient(C, C, 0, C, C, C * 0.25); g.addColorStop(0, hsl(26, 0.4, 0.3, 0.8)); g.addColorStop(1, hsl(26, 0.4, 0.3, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
    // bark rim + moss flecks on the rim
    ctx.lineWidth = C * 0.16; ctx.strokeStyle = hsl(26, 0.35, 0.22);
    ctx.beginPath(); ctx.arc(C, C, C * 0.92, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 40; i++) { const a = -Math.PI * (0.1 + rnd() * 0.8), r = C * (0.84 + rnd() * 0.14); ctx.fillStyle = hsl(85 + rnd() * 15, 0.5, 0.32 + rnd() * 0.1, 0.8); ctx.beginPath(); ctx.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, 2 + rnd() * 4, 0, 6.3); ctx.fill(); }
    return tex(c);
  });
}

/** liana strand: twisted brown rope with a green-lichen sheen and a few tiny leaves, 64 x 1024, tip at v=1 */
export function liana(seed = 1): THREE.CanvasTexture {
  return cached(`liana:${seed}`, () => {
    const W = 64, H = 1024;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 19 + 21);
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(W / 2 - 13, H); ctx.quadraticCurveTo(W / 2 + 10, H / 2, W / 2 - 4, 0); ctx.lineTo(W / 2 + 4, 0); ctx.quadraticCurveTo(W / 2 + 24, H / 2, W / 2 + 13, H); ctx.closePath();
    ctx.fillStyle = hsl(32, 0.32, 0.36); ctx.fill();
    ctx.save(); ctx.clip();
    // twist: diagonal light/dark stripes
    for (let y = -40; y < H + 40; y += 22) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 14); ctx.strokeStyle = hsl(34, 0.3, 0.52, 0.5); ctx.lineWidth = 5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y + 9); ctx.lineTo(W, y + 23); ctx.strokeStyle = hsl(28, 0.35, 0.2, 0.55); ctx.lineWidth = 4; ctx.stroke();
    }
    for (let i = 0; i < 40; i++) { ctx.fillStyle = hsl(100, 0.35, 0.45, 0.25); ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H, 3 + rnd() * 5, 2 + rnd() * 3, 0, 0, 6.3); ctx.fill(); }
    ctx.restore();
    for (let i = 0; i < 9; i++) {
      const y = 60 + rnd() * (H - 120), s = rnd() < 0.5 ? -1 : 1, a = s > 0 ? 0.4 + rnd() * 0.6 : Math.PI - 0.4 - rnd() * 0.6;
      const [tx, ty] = leaf(ctx, W / 2 + s * 4, y, Math.cos(a), Math.sin(a) * 0.4 + 0.3, 22 + rnd() * 14, 14, 0, 0.4);
      const g = ctx.createLinearGradient(W / 2, y, tx, ty); g.addColorStop(0, hsl(105, 0.5, 0.3)); g.addColorStop(1, hsl(90, 0.55, 0.46));
      ctx.fillStyle = g; ctx.fill();
    }
    return tex(c);
  });
}

/** ground cover: a clump of small round glossy leaves (peperomia / clover-ish), 512², base at the bottom centre */
export function groundcover(seed = 1, o: { hue?: number; light?: number } = {}): THREE.CanvasTexture {
  return cached(`gcover:${seed}:${JSON.stringify(o)}`, () => {
    const W = 512, H = 512;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 91 + 17);
    const hue = o.hue ?? 108, light = o.light ?? 0.4;
    ctx.clearRect(0, 0, W, H);
    const items: Array<{ x: number; y: number; r: number; a: number; d: number }> = [];
    for (let i = 0; i < 34; i++) {
      const a = -Math.PI * (0.1 + 0.8 * rnd()), len = 60 + rnd() * 190;
      const x = W / 2 + Math.cos(a) * len * 1.25, y = H - 14 + Math.sin(a) * len;
      items.push({ x, y, r: 22 + rnd() * 26, a: a + (rnd() - 0.5) * 1.2, d: len });
    }
    items.sort((p, q) => q.d - p.d);
    for (const it of items) {
      // stem
      ctx.beginPath(); ctx.moveTo(W / 2 + (rnd() - 0.5) * 30, H - 8); ctx.quadraticCurveTo((W / 2 + it.x) / 2, (H + it.y) / 2 + 20, it.x, it.y);
      ctx.strokeStyle = hsl(hue - 10, 0.45, 0.32, 0.8); ctx.lineWidth = 2.5; ctx.stroke();
      // round / heart leaf
      const g = ctx.createRadialGradient(it.x - it.r * 0.3, it.y - it.r * 0.3, it.r * 0.1, it.x, it.y, it.r);
      const hj = (rnd() - 0.5) * 14, lj = (rnd() - 0.5) * 0.1;
      g.addColorStop(0, hsl(hue + hj - 8, 0.55, light + 0.14 + lj)); g.addColorStop(0.7, hsl(hue + hj, 0.55, light + lj)); g.addColorStop(1, hsl(hue + hj + 4, 0.55, light - 0.08 + lj));
      ctx.beginPath(); ctx.ellipse(it.x, it.y, it.r * 1.05, it.r * 0.9, it.a, 0, 6.3); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = hsl(hue, 0.5, 0.15, 0.5); ctx.lineWidth = 1.2; ctx.stroke();
      // notch + vein
      ctx.beginPath(); ctx.moveTo(it.x - Math.cos(it.a) * it.r * 0.95, it.y - Math.sin(it.a) * it.r * 0.95); ctx.lineTo(it.x + Math.cos(it.a) * it.r * 0.7, it.y + Math.sin(it.a) * it.r * 0.7);
      ctx.strokeStyle = hsl(hue - 20, 0.5, 0.68, 0.35); ctx.lineWidth = 1.5; ctx.stroke();
    }
    return tex(c);
  });
}




/** rope tile (twisted sisal), 64 x 64 */
export function ropeTile(): THREE.CanvasTexture {
  return cached("rope", () => {
    const W = 64, H = 64;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = hsl(42, 0.45, 0.55); ctx.fillRect(0, 0, W, H);
    for (let y = -16; y < H + 16; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 10); ctx.strokeStyle = hsl(40, 0.5, 0.3, 0.7); ctx.lineWidth = 5; ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, y + 7); ctx.lineTo(W, y + 17); ctx.strokeStyle = hsl(44, 0.5, 0.72, 0.6); ctx.lineWidth = 3; ctx.stroke(); }
    return tex(c, { repeat: true });
  });
}


(globalThis as unknown as { __vegPaint?: Map<string, THREE.CanvasTexture> }).__vegPaint = cache;




// =====================================================================================================================
// LAWN TUFT (flat 1.2 m carpet squares and 1.3 m straight blade strips draw a visible web of
// tile edges over the terrain's own grass): one small soft tuft of ~120 thin blades rooted along the bottom edge, the
// ROOTS painted in the terrain lawn's colour (the tuft melts into the ground — no plug outline), lighter warm tips, a
// ragged dome top and blades thinning out toward both sides (no card edge ever reads as a line). 512×256, base at v=0.
export function lawnTuft(seed = 1, o: { flowers?: boolean } = {}): THREE.CanvasTexture {
  return cached(`lawntuft:${seed}:${!!o.flowers}`, () => {
    const W = 512, H = 256;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 977 + 13);
    ctx.clearRect(0, 0, W, H);
    // SPARSE separate blades (a dense tuft body reads as a wall of cards over the lawn) — the terrain's painted
    // lawn shows between them; the blades add relief, catch the light at their tips and break the flat ground line
    const blades: Array<{ x: number; h: number; lean: number; w: number; k: number; hue: number }> = [];
    // (72 blades, a saturated yellow-green body — the meadow measured p50 #5e7725 against the
    // target art's #759515: the tufts must lift the painted lawn, not dot it with lime tips)
    for (let i = 0; i < 72; i++) {
      const u = 0.04 + 0.92 * rnd(), side = Math.abs(u - 0.5) * 2;
      blades.push({ x: u * W, h: H * (0.35 + 0.6 * Math.pow(rnd(), 0.7)) * (1 - 0.35 * side * side), lean: (rnd() - 0.5) * 0.8, w: 6.5 + rnd() * 6.5, k: rnd(), hue: 84 + (rnd() - 0.5) * 12 });
    }
    blades.sort((a, b) => a.k - b.k);
    for (const b of blades) {
      const tx = b.x + b.lean * b.h, ty = H - b.h;
      const cx = b.x + b.lean * b.h * 0.25, cy = H - b.h * 0.5;
      const g = ctx.createLinearGradient(b.x, H, tx, ty);
      // (a smooth, saturated body with only slightly lighter warm tips: lime spikes over a darker lawn read patchy)
      g.addColorStop(0, hsl(b.hue - 8, 0.72, 0.4 + 0.03 * b.k));
      g.addColorStop(0.45, hsl(b.hue - 9, 0.76, 0.44 + 0.03 * b.k));
      g.addColorStop(0.8, hsl(b.hue - 11, 0.76, 0.46 + 0.03 * b.k));
      g.addColorStop(1, hsl(b.hue - 14, 0.74, 0.49 + 0.04 * b.k));   // light warm tips
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(b.x - b.w / 2, H + 2);
      ctx.quadraticCurveTo(cx - b.w * 0.25, cy, tx, ty);
      ctx.quadraticCurveTo(cx + b.w * 0.25, cy, b.x + b.w / 2, H + 2);
      ctx.closePath();
      ctx.fill();
    }
    if (o.flowers) for (let i = 0; i < 3; i++) {
      // tiny white daisies / yellow buttercups just above the blades (the target art's lawn is dotted with them)
      const x = W * (0.2 + rnd() * 0.6), y = H * (0.25 + rnd() * 0.3), r = 6 + rnd() * 3;
      ctx.strokeStyle = hsl(92, 0.5, 0.32); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 8, H); ctx.stroke();
      const white = rnd() < 0.5;
      ctx.fillStyle = white ? "#f8f8f0" : "#ffd524";
      for (let p = 0; p < 6; p++) { const a = (p / 6) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.45, r * 0.5, r * 0.3, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = white ? "#f2b814" : "#e08a0c"; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    return tex(c);
  });
}

/**
 * MEADOW FLOWERS (not a saturated orange/red bouquet sticker): 7–10 thin stems with
 * small white daisies and yellow buttercups at varied heights and a few grass blades, 512×512, base at v=0.
 */
export function meadowFlowers(seed = 1): THREE.CanvasTexture {
  return cached(`meadowflowers2:${seed}`, () => {
    // 5–7 short thin stems with BIG crisp heads — mostly glossy buttercup yellow, some pure white daisies — a couple
    // of blades, no dark base
    const W = 512, H = 512;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 419 + 3);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      const x = W * (0.25 + rnd() * 0.5), h = H * (0.12 + rnd() * 0.2), lean = (rnd() - 0.5) * 0.5, w = 5 + rnd() * 4;
      const g = ctx.createLinearGradient(x, H, x + lean * h, H - h);
      g.addColorStop(0, hsl(84, 0.55, 0.42)); g.addColorStop(1, hsl(72, 0.65, 0.58));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w / 2, H + 2); ctx.quadraticCurveTo(x + lean * h * 0.3, H - h * 0.5, x + lean * h, H - h); ctx.quadraticCurveTo(x + lean * h * 0.3 + w * 0.2, H - h * 0.5, x + w / 2, H + 2); ctx.fill();
    }
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const x0 = W * (0.25 + rnd() * 0.5), top = H * (0.18 + rnd() * 0.42), x1 = x0 + (rnd() - 0.5) * 70;
      ctx.strokeStyle = hsl(86, 0.55, 0.45); ctx.lineWidth = 2.6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x0, H); ctx.quadraticCurveTo((x0 + x1) / 2 + (rnd() - 0.5) * 20, (H + top) / 2, x1, top); ctx.stroke();
      const kind = rnd(), r = 22 + rnd() * 10;
      if (kind < 0.38) {
        ctx.fillStyle = "#ffffff";
        for (let p = 0; p < 12; p++) { const a = (p / 12) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x1 + Math.cos(a) * r * 0.6, top + Math.sin(a) * r * 0.42, r * 0.46, r * 0.16, a, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = "#ffc814"; ctx.beginPath(); ctx.arc(x1, top, r * 0.28, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = "#ffd60a";
        for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2 + 0.3; ctx.beginPath(); ctx.ellipse(x1 + Math.cos(a) * r * 0.42, top + Math.sin(a) * r * 0.32, r * 0.4, r * 0.3, a, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = "#fff6b0"; ctx.beginPath(); ctx.arc(x1 - r * 0.14, top - r * 0.12, r * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e89a08"; ctx.beginPath(); ctx.arc(x1, top, r * 0.12, 0, Math.PI * 2); ctx.fill();
      }
    }
    return tex(c);
  });
}

// =====================================================================================================================
// LOG MOSS BLANKET (without it the jungle log reads as a dark cylinder)
/**
 * 512×256, u tiles along the log, v = 0 on the log's top line → 1 at the blanket's edge: thick lime moss (#7fae2e-ish)
 * with fuzzy speckles on top, a ragged lower edge with drips hanging down the log's sides (alpha-tested).
 */
export function mossBlanket(seed = 1): THREE.CanvasTexture {
  return cached(`mossblanket3:${seed}`, () => {
    // the target art's jungle log carries PATCHY bright lime moss — a broken cushion along the top line (weathered
    // wood showing through in holes), clumps and islands thinning out down the sides, a few thin mossy strands
    // hanging off — never a solid band with teeth. v 0 = the log's top line (canvas bottom), v 1 = the blanket's
    // lowest edge (~88° down the side).
    const W = 512, H = 256;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 71 + 11);
    ctx.clearRect(0, 0, W, H);
    const yOf = (v: number) => (1 - v) * (H - 1);           // three flips Y: canvas bottom = v 0 (the top line)
    const wave = (n: number, amp: number[]) => { const ph = amp.map(() => rnd() * 6.28); return (x: number) => amp.reduce((a, A, i) => a + A * Math.sin((x / W) * Math.PI * 2 * (i === 0 ? 2 : i === 1 ? 5 : 11) + ph[i]), n); };
    const core = wave(0.26, [0.07, 0.05, 0.03]);            // the continuous cushion along the top line
    const reach = wave(0.62, [0.12, 0.06, 0.04]);           // how far the clumps straggle down the side
    const wrapX = (f: (dx: number) => void) => { for (const dx of [0, -W, W]) f(dx); };
    // cushion core (per column, with a soft ragged lower boundary painted by the clumps below)
    for (let x = 0; x < W; x++) {
      const e = Math.max(0.08, core(x));
      const g = ctx.createLinearGradient(0, yOf(0), 0, yOf(e));
      g.addColorStop(0, hsl(72, 0.66, 0.5)); g.addColorStop(0.6, hsl(78, 0.62, 0.44)); g.addColorStop(1, hsl(84, 0.56, 0.36));
      ctx.fillStyle = g; ctx.fillRect(x, yOf(e), 1, yOf(0) - yOf(e) + 1);
    }
    // clumps: dense on the top line, thinning into separate islands down to `reach` (no regular rhythm)
    for (let i = 0; i < 5200; i++) {
      const x = rnd() * W, xi = Math.floor(x) % W, v = Math.pow(rnd(), 1.35) * 0.95;
      const lim = reach(xi);
      if (v > lim) continue;
      // acceptance falls off below the core: islands, not a band
      const over = (v - core(xi)) / Math.max(0.05, lim - core(xi));
      if (over > 0 && rnd() < Math.pow(over, 0.7) * 0.92) continue;
      const r = 1.3 + Math.pow(rnd(), 2.0) * 8.5, big = r > 5;
      const L = 0.34 + rnd() * 0.22 - v * 0.1;
      wrapX((dx) => {
        if (big) { ctx.fillStyle = hsl(90, 0.5, 0.2, 0.2); ctx.beginPath(); ctx.ellipse(x + dx, yOf(v) + r * 0.55, r * 1.1, r * 0.7, 0, 0, 6.3); ctx.fill(); }
        ctx.fillStyle = hsl(66 + rnd() * 20, 0.62 + rnd() * 0.12, L, big ? 0.85 : 0.95);
        ctx.beginPath(); ctx.ellipse(x + dx, yOf(v), r, r * (0.6 + rnd() * 0.45), rnd() * 3, 0, 6.3); ctx.fill();
        // sunlit top of the clump (the target art's moss sparkles yellow-lime on top)
        ctx.fillStyle = hsl(64 + rnd() * 10, 0.72, Math.min(0.78, L + 0.2), 0.7);
        ctx.beginPath(); ctx.ellipse(x + dx - r * 0.15, yOf(v) - r * 0.3, r * 0.55, r * 0.35, 0, 0, 6.3); ctx.fill();
      });
    }
    // bare wood showing through the cushion (holes, torn edges)
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, v = 0.04 + rnd() * 0.3, r = 5 + rnd() * 16;
      wrapX((dx) => { ctx.fillStyle = "rgba(0,0,0,1)"; ctx.beginPath(); ctx.ellipse(x + dx, yOf(v), r * (1.4 + rnd()), r * 0.6, (rnd() - 0.5) * 0.4, 0, 6.3); ctx.fill(); });
    }
    ctx.globalCompositeOperation = "source-over";
    // a few thin mossy strands hanging off the side (tapered, olive), not a row of drips
    for (let i = 0; i < 6; i++) {
      const x0 = rnd() * W, v0 = reach(Math.floor(x0)) * (0.6 + rnd() * 0.3), len = 0.1 + rnd() * 0.2, w0 = 2 + rnd() * 2.5, sw = (rnd() - 0.5) * 10;
      wrapX((dx) => {
        for (let k = 0; k < 14; k++) {
          const t = k / 13, v = v0 + len * t;
          if (v > 0.99) break;
          ctx.fillStyle = hsl(80 - t * 6, 0.5, 0.36 - t * 0.08, 0.9);
          ctx.beginPath(); ctx.ellipse(x0 + dx + sw * t * t, yOf(v), w0 * (1 - 0.6 * t) + 0.6, 3.2, 0, 0, 6.3); ctx.fill();
        }
      });
    }
    // fibrous streaks + specks
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * W, v = rnd() * 0.9, xi = Math.floor(x) % W;
      if (v > core(xi) + 0.05) continue;
      ctx.strokeStyle = hsl(70 + rnd() * 14, 0.64, 0.42 + rnd() * 0.24, 0.45); ctx.lineWidth = 1 + rnd();
      const l = 4 + rnd() * 10;
      wrapX((dx) => { ctx.beginPath(); ctx.moveTo(x + dx, yOf(v)); ctx.lineTo(x + dx + l, yOf(v) + (rnd() - 0.5) * 3); ctx.stroke(); });
    }
    return tex(c, { repeat: true });
  });
}

/**
 * The lawn's two tufts (plain | with daisies) side by side — ONE detail pool / draw, the half picked per
 * instance (foliage-material V_ATLAS instance flag, detail-gen.ts DETAIL_ALIAS). 1024×256.
 */
export function lawnAtlas(): THREE.CanvasTexture {
  return cached("lawnatlas", () => {
    const a = lawnTuft(1).image as HTMLCanvasElement, b = lawnTuft(2, { flowers: true }).image as HTMLCanvasElement;
    const [c, ctx] = canvas(a.width * 2, a.height);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(a, 0, 0); ctx.drawImage(b, a.width, 0);
    return tex(c);
  });
}

/** the highland palm's young nuts — smooth glossy yellow (#d8c43a) with faint fibres, a green-tinged cap and
 * the three eyes (bright yellow balls under the crown, not olive-khaki) */
export function coconutYellow(seed = 1): THREE.CanvasTexture {
  return cached(`cocoY:${seed}`, () => {
    const W = 256, H = 256;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 13 + 4);
    const g0 = ctx.createLinearGradient(0, 0, 0, H);
    g0.addColorStop(0, hsl(70, 0.55, 0.42)); g0.addColorStop(0.22, hsl(52, 0.72, 0.52)); g0.addColorStop(0.7, hsl(50, 0.74, 0.54)); g0.addColorStop(1, hsl(44, 0.7, 0.44));
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = rnd() * H, len = 10 + rnd() * 30;
      ctx.strokeStyle = hsl(46 + rnd() * 12, 0.6, 0.4 + rnd() * 0.25, 0.18);
      ctx.lineWidth = 0.8 + rnd() * 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 4, y + len); ctx.stroke();
    }
    for (let e = 0; e < 3; e++) { const x = W / 2 + Math.cos((e / 3) * 6.283) * 22, y = 18 + Math.sin((e / 3) * 6.283) * 6; ctx.beginPath(); ctx.ellipse(x, y, 7, 5, 0, 0, 6.3); ctx.fillStyle = hsl(40, 0.5, 0.2, 0.8); ctx.fill(); }
    return tex(c, { repeat: true });
  });
}

/**
 * The STRAP frond (the highland palm's broad-leaflet card; painted dry, the beach litter's straw-tinted frond).
 * 512×1024, base at
 * v = 0: a broad blade (widest at ~45 %, tapering to the tip) cut into `straps` wide strap segments per side that are
 * FUSED at the rachis and separate toward the margin (the cuts open into narrow gaps), each strap angled toward the tip
 * with a lit crease down its middle, fine parallel veins, a darker margin and a slightly ragged cut end; a pale tapered
 * rachis. `dry`: straw #c9a86a with grey-brown streaks, broken / missing straps and tattered ends. Returns the albedo
 * and a normal map (each strap a shallow ridge, the veins as grooves).
 */
export function strapFrond(seed = 1, o: { dry?: boolean; straps?: number } = {}): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const key = `strap:${seed}:${!!o.dry}:${o.straps ?? 7}`;
  const paint = (heightOnly: boolean) => {
    const W = 512, H = 1024;
    const [c, ctx] = canvas(W, H);
    const rnd = mulberry32(seed * 977 + (o.dry ? 5 : 1));
    ctx.clearRect(0, 0, W, H);
    if (heightOnly) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
    const cx = W / 2, N = o.straps ?? 7, dry = !!o.dry;
    const t0 = 0.07, t1 = 0.975;
    const yOf = (t: number) => H - 4 - t * (H - 8);
    // blade half-width (px) at t: broad from ~25 % to ~65 %, pointed tip
    const hw = (t: number) => (W / 2 - 6) * (0.3 + 0.7 * smooth(t0, 0.3, t)) * (1 - 0.92 * smooth(0.62, 1.0, t)) + 4;
    // (lighter mid green — the target art's highland crown is #3f8a2e with lime-lit tops)
    const hue = dry ? 38 : 100, sat = dry ? 0.42 : 0.6, lit = dry ? 0.56 : 0.35;
    // strap boundaries along the rachis (slightly uneven), wider straps toward the middle
    const bounds: number[] = [t0];
    for (let k = 1; k < N; k++) bounds.push(t0 + (t1 - t0) * (k / N + (rnd() - 0.5) * 0.25 / N));
    bounds.push(t1);
    type Pt = [number, number];
    for (const s of [-1, 1]) {
      for (let k = N - 1; k >= 0; k--) {
        const ta = bounds[k], tb = bounds[k + 1];
        if (dry && rnd() < 0.1) continue;                                    // a missing strap
        const tm = (ta + tb) / 2;
        // strap direction: from the axis toward the side, angled tipward (steeper near the tip)
        const th = lerp(1.1, 0.42, Math.pow((tm - t0) / (t1 - t0), 0.9)) + (rnd() - 0.5) * 0.08;
        const dx = s * Math.sin(th), dy = -Math.cos(th);
        const reachTo = (t: number) => {
          // march out from (cx, y(t)) along d until the blade outline
          let L = 0;
          for (let i = 0; i < 400; i++) { const x = Math.abs(dx) * L, yy = yOf(t) + dy * L; const tt = (H - 4 - yy) / (H - 8); if (x > hw(Math.min(1, tt))) break; L += 2; }
          return L;
        };
        const broken = dry && rnd() < 0.15 ? 0.45 + rnd() * 0.3 : 1;
        const La = reachTo(ta) * broken, Lb = reachTo(tb) * broken;
        const droop = (dry ? 0.1 : 0.16) * (0.4 + tm);                       // the strap sags toward the tip
        const gap = (u: number) => (dry ? 3 : 2.2) + u * u * (dry ? 12 : 9);  // the cut opens toward the margin
        const pA = (u: number): Pt => { const L = La * u; return [cx + s * 3 + dx * L + s * -0 , yOf(ta) + dy * L + droop * L * u * 0.6 - gap(u) * 0.5]; };
        const pB = (u: number): Pt => { const L = Lb * u; return [cx + s * 3 + dx * L, yOf(tb) + dy * L + droop * L * u * 0.6 + gap(u) * 0.5]; };
        // polygon: along edge A (lower) out, ragged cut end, back along edge B (upper)
        const pts: Pt[] = [];
        for (let i = 0; i <= 10; i++) pts.push(pA(i / 10));
        const eA = pA(1), eB = pB(1);
        // the cut end: a soft point (green) or a ragged tear (dry)
        const nCut = 6, pointK = dry ? 4 : Math.min(26, 0.22 * Math.hypot(eB[0] - eA[0], eB[1] - eA[1]));
        for (let i = 1; i < nCut; i++) {
          const f = i / nCut;
          const jag = (dry ? 10 : 2) * (rnd() - 0.3) + pointK * Math.sin(Math.PI * Math.pow(f, 0.8));
          pts.push([eA[0] + (eB[0] - eA[0]) * f + dx * jag, eA[1] + (eB[1] - eA[1]) * f + dy * jag]);
        }
        for (let i = 10; i >= 0; i--) pts.push(pB(i / 10));
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        const mA = pA(0.5), mB = pB(0.5), mid: Pt = [(mA[0] + mB[0]) / 2, (mA[1] + mB[1]) / 2];
        const tip: Pt = [(eA[0] + eB[0]) / 2, (eA[1] + eB[1]) / 2];
        const base: Pt = [cx + s * 3, (yOf(ta) + yOf(tb)) / 2];
        const hj = (rnd() - 0.5) * (dry ? 8 : 6), lj = (rnd() - 0.5) * 0.06;
        if (heightOnly) {
          // ridge: a gradient across the strap (light at the crease, dark at the edges)
          const g = ctx.createLinearGradient(mA[0], mA[1], mB[0], mB[1]);
          g.addColorStop(0, "#303030"); g.addColorStop(0.5, "#c8c8c8"); g.addColorStop(1, "#303030");
          ctx.fillStyle = g; ctx.fill();
        } else {
          const g = ctx.createLinearGradient(base[0], base[1], tip[0], tip[1]);
          if (dry) {
            g.addColorStop(0, hsl(hue - 6 + hj, sat - 0.08, lit - 0.14 + lj)); g.addColorStop(0.35, hsl(hue + hj, sat, lit + lj));
            g.addColorStop(0.8, hsl(hue + 4 + hj, sat - 0.04, lit + 0.06 + lj)); g.addColorStop(1, hsl(hue - 8 + hj, sat - 0.12, lit - 0.1 + lj));
          } else {
            g.addColorStop(0, hsl(hue - 20 + hj, sat + 0.1, lit + 0.1 + lj)); g.addColorStop(0.3, hsl(hue - 8 + hj, sat + 0.04, lit + 0.05 + lj));
            g.addColorStop(0.75, hsl(hue + 2 + hj, sat, lit + lj)); g.addColorStop(1, hsl(hue + 6 + hj, sat - 0.04, lit - 0.05 + lj));
          }
          ctx.fillStyle = g; ctx.fill();
        }
        ctx.save(); ctx.clip();
        // parallel veins along the strap
        const nv = heightOnly ? 7 : 9;
        for (let v = 1; v < nv; v++) {
          const f = v / nv;
          ctx.beginPath();
          for (let i = 0; i <= 10; i++) { const a = pA(i / 10), b = pB(i / 10); const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.strokeStyle = heightOnly ? "rgba(0,0,0,0.22)" : dry ? hsl(hue - 10, 0.35, lit - 0.2, 0.18) : hsl(hue + 10, 0.5, lit - 0.16, 0.14);
          ctx.lineWidth = 1; ctx.stroke();
        }
        if (!heightOnly) {
          // lit crease down the strap's middle + a soft shade line beside it
          ctx.beginPath();
          for (let i = 0; i <= 10; i++) { const a = pA(i / 10), b = pB(i / 10); const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.strokeStyle = dry ? hsl(hue + 6, 0.4, lit + 0.16, 0.5) : hsl(hue - 22, 0.6, lit + 0.3, 0.45); ctx.lineWidth = 2.4; ctx.stroke();
          // grey-brown weathering streaks on dry straps, a sheen band on green ones
          if (dry) for (let i = 0; i < 3; i++) { const f = rnd(); ctx.beginPath(); for (let j = 0; j <= 10; j++) { const a = pA(j / 10), b = pB(j / 10); const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f; if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.strokeStyle = hsl(28, 0.18, 0.32 + rnd() * 0.12, 0.35); ctx.lineWidth = 2 + rnd() * 4; ctx.stroke(); }
          else { const sh = ctx.createLinearGradient(mid[0] - 40, mid[1] - 40, mid[0] + 40, mid[1] + 40); sh.addColorStop(0, "rgba(255,255,200,0)"); sh.addColorStop(0.5, "rgba(255,255,200,0.1)"); sh.addColorStop(1, "rgba(255,255,200,0)"); ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H); }
        }
        ctx.restore();
        // margin: a darker edge line
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.strokeStyle = heightOnly ? "rgba(0,0,0,0.6)" : dry ? hsl(hue - 12, 0.4, lit - 0.26, 0.5) : hsl(hue + 12, 0.55, 0.14, 0.5);
        ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    // base AO where the straps meet the petiole
    if (!heightOnly) {
      ctx.globalCompositeOperation = "source-atop";
      const ao = ctx.createLinearGradient(0, H, 0, H * 0.78);
      ao.addColorStop(0, dry ? "rgba(40,24,0,0.35)" : "rgba(10,30,0,0.4)"); ao.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ao; ctx.fillRect(0, H * 0.78, W, H * 0.22);
      ctx.globalCompositeOperation = "source-over";
    }
    // rachis: tapered pale stripe with a highlight
    ctx.beginPath(); ctx.moveTo(cx - 13, H); ctx.lineTo(cx - 2, 16); ctx.lineTo(cx + 2, 16); ctx.lineTo(cx + 13, H); ctx.closePath();
    if (heightOnly) ctx.fillStyle = "#e0e0e0";
    else { const rg = ctx.createLinearGradient(0, H, 0, 0); if (dry) { rg.addColorStop(0, hsl(34, 0.3, 0.46)); rg.addColorStop(1, hsl(40, 0.34, 0.66)); } else { rg.addColorStop(0, hsl(56, 0.55, 0.48)); rg.addColorStop(0.5, hsl(70, 0.6, 0.5)); rg.addColorStop(1, hsl(82, 0.55, 0.44)); } ctx.fillStyle = rg; }
    ctx.fill();
    if (!heightOnly) { ctx.beginPath(); ctx.moveTo(cx - 5, H); ctx.lineTo(cx - 1, 30); ctx.strokeStyle = dry ? hsl(40, 0.4, 0.76, 0.7) : hsl(60, 0.75, 0.78, 0.75); ctx.lineWidth = 3; ctx.stroke(); }
    return c;
  };
  return {
    map: cached(key, () => tex(paint(false), { aniso: 16 })),
    normalMap: cached(key + ":n", () => tex(normalFromHeight(paint(true), 2.2), { srgb: false, aniso: 16 })),
  };
}
