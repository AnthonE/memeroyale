// Canvas-painted textures for the stilt-hut set (loot-05-ground-loot). Painterly-stylized wood, bamboo, thatch, weave,
// sand and a corrugated roof. Every texture is tileable and built once (module cache). Height is painted with the
// same canvas calls as the albedo, then turned into a normal map with a wrapped Sobel pass (fast typed-array loop).
import * as THREE from "three";
import { rng } from "./lib/mats";

type Ctx2 = CanvasRenderingContext2D;
function canvas(w: number, h: number) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  return { c, x: c.getContext("2d", { willReadFrequently: true })! };
}
function tex(c: HTMLCanvasElement, srgb = true, aniso = 12): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
/** wrapped Sobel normal map from the red channel of a height canvas */
function normalFrom(hc: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = hc.width, h = hc.height;
  const src = hc.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = src[i * 4] / 255;
  const { c, x } = canvas(w, h);
  const img = x.createImageData(w, h), d = img.data;
  for (let j = 0; j < h; j++) {
    const jm = ((j - 1 + h) % h) * w, j0 = j * w, jp = ((j + 1) % h) * w;
    for (let i = 0; i < w; i++) {
      const im = (i - 1 + w) % w, ip = (i + 1) % w;
      const dx = (H[jm + ip] + 2 * H[j0 + ip] + H[jp + ip] - H[jm + im] - 2 * H[j0 + im] - H[jp + im]) * strength;
      const dy = (H[jp + im] + 2 * H[jp + i] + H[jp + ip] - H[jm + im] - 2 * H[jm + i] - H[jm + ip]) * strength;
      const l = Math.hypot(dx, dy, 1), k = (j0 + i) * 4;
      d[k] = (-dx / l * 0.5 + 0.5) * 255; d[k + 1] = (dy / l * 0.5 + 0.5) * 255; d[k + 2] = (1 / l) * 255; d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return tex(c, false);
}
/** draw into both albedo + height canvases with a wrap (so strokes crossing an edge tile) */
function wrapDraw(w: number, h: number, fn: (dx: number, dy: number) => void) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(dx, dy);
}
const hex = (c: THREE.Color) => "#" + c.getHexString();

export interface PBRTex { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }
const cache = new Map<string, unknown>();
function once<T>(k: string, f: () => T): T { if (!cache.has(k)) cache.set(k, f()); return cache.get(k) as T; }

/** wavy grain strokes along U inside the band [y0, y0+bh) */
function grain(x: Ctx2, hx: Ctx2 | null, r: () => number, w: number, y0: number, bh: number, n: number, dark: string, light: string, hStrength = 0.06) {
  for (let i = 0; i < n; i++) {
    const isDark = r() < 0.55;
    const yy = y0 + bh * (0.04 + r() * 0.92), amp = bh * (0.01 + r() * 0.05), f = 0.5 + r() * 2.5, ph = r() * 6.28;
    const lw = isDark ? 0.6 + r() * 1.8 : 0.5 + r() * 1.4, a = isDark ? 0.08 + r() * 0.22 : 0.04 + r() * 0.12;
    const x0 = -w * 0.1 + r() * w * 0.3, len = w * (0.5 + r() * 0.9);
    x.strokeStyle = isDark ? dark.replace("A", String(a)) : light.replace("A", String(a)); x.lineWidth = lw;
    x.beginPath();
    for (let t = 0; t <= 40; t++) {
      const u = x0 + (t / 40) * len, v = yy + Math.sin((u / w) * Math.PI * 2 * f + ph) * amp + Math.sin(u * 0.02 + ph) * amp * 0.3;
      if (t === 0) x.moveTo(u, v); else x.lineTo(u, v);
    }
    x.stroke();
    if (hx && isDark) {
      hx.strokeStyle = `rgba(0,0,0,${hStrength * (0.5 + r())})`; hx.lineWidth = lw * 1.2;
      hx.beginPath();
      for (let t = 0; t <= 40; t++) {
        const u = x0 + (t / 40) * len, v = yy + Math.sin((u / w) * Math.PI * 2 * f + ph) * amp + Math.sin(u * 0.02 + ph) * amp * 0.3;
        if (t === 0) hx.moveTo(u, v); else hx.lineTo(u, v);
      }
      hx.stroke();
    }
  }
}
function knot(x: Ctx2, hx: Ctx2 | null, cx: number, cy: number, kr: number, r: () => number) {
  for (let k = 5; k >= 0; k--) {
    x.strokeStyle = `rgba(55,28,10,${0.12 + (5 - k) * 0.06})`; x.lineWidth = 1 + r();
    x.beginPath(); x.ellipse(cx, cy, kr * (1 + k * 0.7), kr * (0.45 + k * 0.28), 0, 0, Math.PI * 2); x.stroke();
  }
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, kr);
  g.addColorStop(0, "rgba(45,22,8,.85)"); g.addColorStop(1, "rgba(70,36,14,0)");
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, kr, kr * 0.62, 0, 0, Math.PI * 2); x.fill();
  if (hx) { const hg = hx.createRadialGradient(cx, cy, 0, cx, cy, kr * 1.2); hg.addColorStop(0, "rgba(0,0,0,.35)"); hg.addColorStop(1, "rgba(0,0,0,0)"); hx.fillStyle = hg; hx.beginPath(); hx.ellipse(cx, cy, kr * 1.3, kr * 0.8, 0, 0, Math.PI * 2); hx.fill(); }
}

/** FLOOR: 2048² tile = 2.4 m × 2.4 m, 8 planks (30 cm) running along U, staggered butt joints, nails at joists,
 *  bevelled edges, scuffs + scratches. Worn dark-honey wood like the target art. */
export function floorTex(): PBRTex {
  return once("floor", () => {
    const S = 2048, N = 8, pw = S / N, r = rng(41);
    const { c, x } = canvas(S, S), { c: hc, x: hx } = canvas(S, S), { c: rc, x: rx } = canvas(S, S);
    hx.fillStyle = "#fff"; hx.fillRect(0, 0, S, S);
    rx.fillStyle = "#b8b8b8"; rx.fillRect(0, 0, S, S);
    const base = new THREE.Color("#8a5430");
    const seam = (x0: number, y0: number, x1: number, y1: number) => { // plank piece rect
      const shade = 0.78 + r() * 0.36, hue = (r() - 0.5) * 0.025;
      const col = base.clone().offsetHSL(hue, (r() - 0.5) * 0.08, 0).multiplyScalar(shade);
      x.fillStyle = hex(col); x.fillRect(x0, y0, x1 - x0, y1 - y0);
      // broad painterly streaks
      for (let i = 0; i < 7; i++) {
        const yy = y0 + r() * (y1 - y0), hh = (y1 - y0) * (0.1 + r() * 0.35);
        x.fillStyle = r() < 0.5 ? `rgba(40,20,8,${0.05 + r() * 0.08})` : `rgba(255,200,140,${0.03 + r() * 0.06})`;
        x.fillRect(x0, yy - hh / 2, x1 - x0, hh);
      }
      x.save(); x.beginPath(); x.rect(x0, y0, x1 - x0, y1 - y0); x.clip();
      hx.save(); hx.beginPath(); hx.rect(x0, y0, x1 - x0, y1 - y0); hx.clip();
      x.translate(x0, 0); hx.translate(x0, 0);
      grain(x, hx, r, x1 - x0, y0, y1 - y0, 60, "rgba(38,18,6,A)", "rgba(255,210,150,A)", 0.08);
      if (r() < 0.45) knot(x, hx, (x1 - x0) * (0.15 + r() * 0.7), y0 + (y1 - y0) * (0.3 + r() * 0.4), 6 + r() * 9, r);
      x.restore(); hx.restore();
      // rougher / smoother per piece
      rx.fillStyle = `rgb(${150 + r() * 60 | 0},${150 + r() * 60 | 0},${150 + r() * 60 | 0})`; rx.fillRect(x0, y0, x1 - x0, y1 - y0);
    };
    const joints: number[][] = [];
    for (let p = 0; p < N; p++) {
      const y0 = p * pw, y1 = y0 + pw;
      const js = [r() * S]; if (r() < 0.6) js.push((js[0] + S * (0.35 + r() * 0.3)) % S);
      js.sort((a, b) => a - b); joints.push(js);
      const cuts = [0, ...js, S];
      for (let k = 0; k < cuts.length - 1; k++) seam(cuts[k], y0, cuts[k + 1], y1);
      // the piece that wraps (cut at S → 0) keeps continuity well enough: joints are real seams anyway
    }
    // bevels + gaps (height) and dark/light edge lines (albedo)
    const gap = 5, bev = 12;
    for (let p = 0; p < N; p++) {
      const y0 = p * pw;
      const g = hx.createLinearGradient(0, y0, 0, y0 + bev); g.addColorStop(0, "rgba(0,0,0,.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
      hx.fillStyle = g; hx.fillRect(0, y0, S, bev);
      const g2 = hx.createLinearGradient(0, y0 + pw - bev, 0, y0 + pw); g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(1, "rgba(0,0,0,.75)");
      hx.fillStyle = g2; hx.fillRect(0, y0 + pw - bev, S, bev);
      hx.fillStyle = "#000"; hx.fillRect(0, y0 - gap / 2, S, gap); if (p === 0) hx.fillRect(0, S - gap / 2, S, gap);
      x.fillStyle = "rgba(22,10,4,.92)"; x.fillRect(0, y0 - gap / 2, S, gap); if (p === 0) x.fillRect(0, S - gap / 2, S, gap);
      x.fillStyle = "rgba(255,214,160,.16)"; x.fillRect(0, y0 + gap / 2, S, 3);
      x.fillStyle = "rgba(30,14,5,.25)"; x.fillRect(0, y0 + pw - gap / 2 - 4, S, 4);
      rx.fillStyle = "#fff"; rx.fillRect(0, y0 - gap / 2, S, gap);
      for (const jx of joints[p]) {
        hx.fillStyle = "#000"; hx.fillRect(jx - 2, y0, 4, pw);
        const gj = hx.createLinearGradient(jx - bev, 0, jx + bev, 0); gj.addColorStop(0, "rgba(0,0,0,0)"); gj.addColorStop(0.5, "rgba(0,0,0,.7)"); gj.addColorStop(1, "rgba(0,0,0,0)");
        hx.fillStyle = gj; hx.fillRect(jx - bev, y0, bev * 2, pw);
        x.fillStyle = "rgba(22,10,4,.9)"; x.fillRect(jx - 2, y0, 4, pw);
        // nails either side of the joint
        for (const sx of [-1, 1]) for (const fy of [0.28, 0.72]) {
          const nx = jx + sx * 16, ny = y0 + pw * fy;
          x.fillStyle = "rgba(25,18,14,.95)"; x.beginPath(); x.arc(nx, ny, 5, 0, Math.PI * 2); x.fill();
          x.fillStyle = "rgba(170,150,130,.35)"; x.beginPath(); x.arc(nx - 1.5, ny - 1.5, 2, 0, Math.PI * 2); x.fill();
          hx.fillStyle = "rgba(0,0,0,.3)"; hx.beginPath(); hx.arc(nx, ny, 6, 0, Math.PI * 2); hx.fill();
        }
      }
      // joist nails every 0.6 m (512 px)
      for (let jn = 0; jn < 4; jn++) for (const fy of [0.25, 0.75]) {
        const nx = jn * 512 + 180 + (p % 2) * 6, ny = y0 + pw * fy;
        x.fillStyle = "rgba(28,20,15,.85)"; x.beginPath(); x.arc(nx, ny, 4.2, 0, Math.PI * 2); x.fill();
        hx.fillStyle = "rgba(0,0,0,.25)"; hx.beginPath(); hx.arc(nx, ny, 5, 0, Math.PI * 2); hx.fill();
      }
    }
    // wear: scuffs, scratches, stains (wrapped)
    for (let i = 0; i < 140; i++) {
      const sx = r() * S, sy = r() * S, len = 20 + r() * 160, a = (r() - 0.5) * 0.5;
      wrapDraw(S, S, (dx, dy) => {
        x.strokeStyle = `rgba(255,220,170,${0.06 + r() * 0.1})`; x.lineWidth = 0.8 + r() * 1.2;
        x.beginPath(); x.moveTo(sx + dx, sy + dy); x.lineTo(sx + dx + Math.cos(a) * len, sy + dy + Math.sin(a) * len); x.stroke();
      });
    }
    for (let i = 0; i < 26; i++) {
      const sx = r() * S, sy = r() * S, rr = 40 + r() * 140;
      wrapDraw(S, S, (dx, dy) => {
        const g = x.createRadialGradient(sx + dx, sy + dy, 0, sx + dx, sy + dy, rr);
        const dark = r() < 0.6;
        g.addColorStop(0, dark ? `rgba(30,14,4,${0.08 + r() * 0.1})` : `rgba(255,205,140,${0.05 + r() * 0.06})`); g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g; x.fillRect(sx + dx - rr, sy + dy - rr, rr * 2, rr * 2);
      });
    }
    return { map: tex(c), normalMap: normalFrom(hc, 2.2), roughnessMap: tex(rc, false) };
  });
}

/** neutral-honey GRAIN (no seams) for boards, logs, crates, staves: 1024 × 1024, grain along U. Tint with vertex colour. */
export function grainTex(): PBRTex {
  return once("grain", () => {
    const S = 1024, r = rng(77);
    const { c, x } = canvas(S, S), { c: hc, x: hx } = canvas(S, S), { c: rc, x: rx } = canvas(S, S);
    x.fillStyle = "#c98f58"; x.fillRect(0, 0, S, S);
    hx.fillStyle = "#fff"; hx.fillRect(0, 0, S, S);
    rx.fillStyle = "#c0c0c0"; rx.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      const yy = r() * S, hh = 10 + r() * 80;
      wrapDraw(S, S, (_dx, dy) => { x.fillStyle = r() < 0.5 ? `rgba(90,45,15,${0.05 + r() * 0.1})` : `rgba(255,220,170,${0.04 + r() * 0.08})`; x.fillRect(0, yy + dy - hh / 2, S, hh); });
    }
    // grain in 4 bands so it tiles vertically (strokes clipped per band; each band tiles along U by using full periods)
    for (let b = 0; b < 4; b++) {
      const y0 = (b * S) / 4;
      for (let i = 0; i < 70; i++) {
        const isDark = r() < 0.6, yy = y0 + r() * (S / 4), amp = 3 + r() * 12, f = 1 + Math.floor(r() * 3), ph = r() * 6.28;
        const lw = isDark ? 0.8 + r() * 2 : 0.6 + r() * 1.5, a = isDark ? 0.1 + r() * 0.25 : 0.05 + r() * 0.12;
        x.strokeStyle = isDark ? `rgba(60,28,8,${a})` : `rgba(255,225,170,${a})`; x.lineWidth = lw;
        hx.strokeStyle = `rgba(0,0,0,${isDark ? 0.1 + r() * 0.1 : 0})`; hx.lineWidth = lw * 1.3;
        for (const ctx2 of [x, hx]) {
          ctx2.beginPath();
          for (let t = 0; t <= 64; t++) { const u = (t / 64) * S, v = yy + Math.sin((u / S) * Math.PI * 2 * f + ph) * amp; if (t === 0) ctx2.moveTo(u, v); else ctx2.lineTo(u, v); }
          ctx2.stroke();
        }
      }
    }
    for (let i = 0; i < 5; i++) knot(x, hx, r() * (S - 80) + 40, r() * (S - 80) + 40, 7 + r() * 8, r);
    // a few long drying cracks
    for (let i = 0; i < 6; i++) {
      const yy = r() * S, x0 = r() * S * 0.6, len = 120 + r() * 300;
      x.strokeStyle = "rgba(35,15,5,.55)"; x.lineWidth = 1.5; hx.strokeStyle = "rgba(0,0,0,.6)"; hx.lineWidth = 2.5;
      for (const ctx2 of [x, hx]) { ctx2.beginPath(); ctx2.moveTo(x0, yy); ctx2.bezierCurveTo(x0 + len * 0.3, yy + 3, x0 + len * 0.6, yy - 3, x0 + len, yy + 1); ctx2.stroke(); }
    }
    for (let i = 0; i < 3000; i++) { rx.fillStyle = `rgba(${r() < 0.5 ? 255 : 0},0,0,0.05)`; rx.fillRect(r() * S, r() * S, 2 + r() * 20, 1 + r() * 2); }
    return { map: tex(c), normalMap: normalFrom(hc, 1.6), roughnessMap: tex(rc, false) };
  });
}

/** END GRAIN for log cut ends: rings + radial checks (clamped, not tiled) */
export function endGrainTex(): THREE.CanvasTexture {
  return once("end", () => {
    const S = 256, m = S / 2, r = rng(5);
    const { c, x } = canvas(S, S);
    const g = x.createRadialGradient(m, m, 0, m, m, m); g.addColorStop(0, "#e2b67c"); g.addColorStop(0.85, "#c98f55"); g.addColorStop(0.93, "#7a4a26"); g.addColorStop(1, "#5a331a");
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    for (let k = 1; k < 14; k++) { x.strokeStyle = `rgba(110,60,25,${0.25 + r() * 0.25})`; x.lineWidth = 1 + r() * 1.5; x.beginPath(); x.ellipse(m + (r() - 0.5) * 3, m + (r() - 0.5) * 3, (k / 14) * m * 0.86, (k / 14) * m * 0.84, 0, 0, Math.PI * 2); x.stroke(); }
    for (let k = 0; k < 4; k++) { const a = r() * 6.28; x.strokeStyle = "rgba(60,30,10,.7)"; x.lineWidth = 2; x.beginPath(); x.moveTo(m + Math.cos(a) * m * 0.2, m + Math.sin(a) * m * 0.2); x.lineTo(m + Math.cos(a) * m * 0.8, m + Math.sin(a) * m * 0.8); x.stroke(); }
    const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  });
}

/** BAMBOO (dry, golden-tan) — one tile = one internode along V; darker node band at the tile edges */
export function bambooTex(): PBRTex {
  return once("bamboo", () => {
    const W = 512, H = 512, r = rng(19);
    const { c, x } = canvas(W, H), { c: hc, x: hx } = canvas(W, H), { c: rc, x: rx } = canvas(W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#8a5a28"); g.addColorStop(0.06, "#c08a45"); g.addColorStop(0.5, "#d3a258"); g.addColorStop(0.94, "#c08a45"); g.addColorStop(1, "#8a5a28");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    hx.fillStyle = "#fff"; hx.fillRect(0, 0, W, H);
    rx.fillStyle = "#7a7a7a"; rx.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const px = r() * W, dark = r() < 0.6;
      x.strokeStyle = dark ? `rgba(90,50,15,${0.06 + r() * 0.16})` : `rgba(255,230,170,${0.05 + r() * 0.12})`; x.lineWidth = 0.6 + r() * 2.2;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (r() - 0.5) * 6, H); x.stroke();
    }
    for (let i = 0; i < 18; i++) { const px = r() * W, py = r() * H; x.fillStyle = `rgba(80,40,10,${0.1 + r() * 0.15})`; x.beginPath(); x.ellipse(px, py, 3 + r() * 14, 1.5 + r() * 4, 0, 0, Math.PI * 2); x.fill(); }
    // node ridge (height) at the tile edges
    const hg = hx.createLinearGradient(0, 0, 0, 30); hg.addColorStop(0, "rgba(0,0,0,.6)"); hg.addColorStop(1, "rgba(0,0,0,0)");
    hx.fillStyle = hg; hx.fillRect(0, 0, W, 30);
    const hg2 = hx.createLinearGradient(0, H - 30, 0, H); hg2.addColorStop(0, "rgba(0,0,0,0)"); hg2.addColorStop(1, "rgba(0,0,0,.6)");
    hx.fillStyle = hg2; hx.fillRect(0, H - 30, W, 30);
    for (let i = 0; i < 200; i++) { rx.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`; rx.fillRect(r() * W, 0, 1 + r() * 3, H); }
    return { map: tex(c), normalMap: normalFrom(hc, 2.0), roughnessMap: tex(rc, false) };
  });
}

/** THATCH underside: dense straw strands on deep brown, running along V (down the roof slope) */
export function thatchTex(): PBRTex {
  return once("thatch", () => {
    const S = 1024, r = rng(23);
    const { c, x } = canvas(S, S), { c: hc, x: hx } = canvas(S, S), { c: rc, x: rx } = canvas(S, S);
    x.fillStyle = "#3a2410"; x.fillRect(0, 0, S, S);
    hx.fillStyle = "#555"; hx.fillRect(0, 0, S, S);
    rx.fillStyle = "#f0f0f0"; rx.fillRect(0, 0, S, S);
    for (let i = 0; i < 5200; i++) {
      const px = r() * S, py = r() * S, len = 60 + r() * 220, a = Math.PI / 2 + (r() - 0.5) * 0.25;
      const l = r();
      wrapDraw(S, S, (dx, dy) => {
        x.strokeStyle = `rgba(${140 + l * 90 | 0},${95 + l * 70 | 0},${40 + l * 40 | 0},${0.35 + r() * 0.5})`; x.lineWidth = 1 + r() * 2.2;
        x.beginPath(); x.moveTo(px + dx, py + dy); x.lineTo(px + dx + Math.cos(a) * len, py + dy + Math.sin(a) * len); x.stroke();
        hx.strokeStyle = `rgba(255,255,255,${0.2 + l * 0.5})`; hx.lineWidth = 1.5 + r() * 2;
        hx.beginPath(); hx.moveTo(px + dx, py + dy); hx.lineTo(px + dx + Math.cos(a) * len, py + dy + Math.sin(a) * len); hx.stroke();
      });
    }
    return { map: tex(c), normalMap: normalFrom(hc, 1.4), roughnessMap: tex(rc, false) };
  });
}

/** WOVEN rattan (basket / pot band): over-under strips */
export function wovenTex(): PBRTex {
  return once("woven", () => {
    const S = 512, n = 8, cell = S / n, r = rng(31);
    const { c, x } = canvas(S, S), { c: hc, x: hx } = canvas(S, S), { c: rc, x: rx } = canvas(S, S);
    x.fillStyle = "#5a3a1a"; x.fillRect(0, 0, S, S);
    hx.fillStyle = "#000"; hx.fillRect(0, 0, S, S);
    rx.fillStyle = "#d0d0d0"; rx.fillRect(0, 0, S, S);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const horiz = (i + j) % 2 === 0;
      const x0 = i * cell, y0 = j * cell;
      const gg = horiz ? x.createLinearGradient(0, y0, 0, y0 + cell) : x.createLinearGradient(x0, 0, x0 + cell, 0);
      const l = 0.9 + r() * 0.2;
      gg.addColorStop(0, "#7a5528"); gg.addColorStop(0.5, `rgb(${210 * l | 0},${168 * l | 0},${100 * l | 0})`); gg.addColorStop(1, "#7a5528");
      x.fillStyle = gg; x.fillRect(x0 + 2, y0 + 2, cell - 4, cell - 4);
      const hg = horiz ? hx.createLinearGradient(0, y0, 0, y0 + cell) : hx.createLinearGradient(x0, 0, x0 + cell, 0);
      hg.addColorStop(0, "#333"); hg.addColorStop(0.5, "#fff"); hg.addColorStop(1, "#333");
      hx.fillStyle = hg; hx.fillRect(x0 + 2, y0 + 2, cell - 4, cell - 4);
      for (let k = 0; k < 6; k++) { x.strokeStyle = `rgba(90,55,20,${0.15 + r() * 0.2})`; x.lineWidth = 1; x.beginPath(); if (horiz) { const yy = y0 + 4 + r() * (cell - 8); x.moveTo(x0 + 2, yy); x.lineTo(x0 + cell - 2, yy); } else { const xx = x0 + 4 + r() * (cell - 8); x.moveTo(xx, y0 + 2); x.lineTo(xx, y0 + cell - 2); } x.stroke(); }
    }
    return { map: tex(c), normalMap: normalFrom(hc, 3.0), roughnessMap: tex(rc, false) };
  });
}


/** CORRUGATED tin roof, coral-red paint with rust + wear; ridges along V */
export function tinTex(): PBRTex {
  return once("tin", () => {
    const W = 256, H = 512, r = rng(3);
    const { c, x } = canvas(W, H), { c: hc, x: hx } = canvas(W, H), { c: rc, x: rx } = canvas(W, H);
    x.fillStyle = "#c2452e"; x.fillRect(0, 0, W, H);
    const ridges = 8;
    for (let i = 0; i < W; i++) {
      const s = Math.sin((i / W) * Math.PI * 2 * ridges);
      x.fillStyle = `rgba(${s > 0 ? "255,190,160" : "60,10,5"},${Math.abs(s) * 0.18})`; x.fillRect(i, 0, 1, H);
      hx.fillStyle = `rgb(${(s * 0.5 + 0.5) * 255 | 0},0,0)`; hx.fillRect(i, 0, 1, H);
    }
    for (let i = 0; i < 90; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); void g; const px = r() * W, py = r() * H, rr = 4 + r() * 26; x.fillStyle = `rgba(${r() < 0.5 ? "120,60,25" : "230,200,170"},${0.15 + r() * 0.3})`; x.beginPath(); x.ellipse(px, py, rr * 0.5, rr, 0, 0, Math.PI * 2); x.fill(); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(90,40,15,${0.2 + r() * 0.3})`; x.fillRect(r() * W, r() * H, 1.5, 10 + r() * 50); }
    rx.fillStyle = "#909090"; rx.fillRect(0, 0, W, H);
    return { map: tex(c), normalMap: normalFrom(hc, 2.5), roughnessMap: tex(rc, false) };
  });
}

/** soft radial blob (white → 0), for fake contact shadows + glows (no mip banding) */
export function blobTex(power = 1.6): THREE.CanvasTexture {
  return once("blob" + power, () => {
    const S = 128, { c, x } = canvas(S, S);
    const img = x.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const d = Math.hypot(i - S / 2 + 0.5, j - S / 2 + 0.5) / (S / 2);
      const a = Math.pow(Math.max(0, 1 - d), power) * (1 - Math.max(0, d - 0.9) * 10);
      const k = (j * S + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.max(0, a) * 255;
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}
