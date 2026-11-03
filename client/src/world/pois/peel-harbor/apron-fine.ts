// PEEL HARBOR — the slab's FINE TILE painter (split out of apron-detail.ts so the harbor texture worker can
// paint it — otherwise a ~240 ms main-thread task). Pure: canvases (OffscreenCanvas in a worker) → two RGBA byte arrays.
// R albedo (0.5 neutral), G oil grain (0..1 threshold field), B height, A rubber marks; + its normal map.
import { canvas, noiseTile, rng } from "../_kit/harbor-paint";

export const TILE_M = 12, TS = 1024, PX = TS / TILE_M; // px per metre in the fine tile
let pre: { pk: Uint8Array; nk: Uint8Array } | null = null;
/** hand over a tile painted elsewhere (the worker) */
export function setFinePre(v: { pk: Uint8Array; nk: Uint8Array }) { pre = v; }
export function takeFinePre() { const v = pre; pre = null; return v; }
export function paintFine(): { pk: Uint8Array; nk: Uint8Array } {
  const R = rng(9101);
  // albedo (grey, 128 neutral) and height (grey, 128) canvases, painted in parallel, wrapped at the tile edge
  const [ael, a] = canvas(TS, TS), [hel, h] = canvas(TS, TS), [rel, rb] = canvas(TS, TS);
  a.fillStyle = "#808080"; a.fillRect(0, 0, TS, TS);
  h.fillStyle = "#808080"; h.fillRect(0, 0, TS, TS);
  rb.fillStyle = "#000"; rb.fillRect(0, 0, TS, TS);
  const wrap = (fn: (ox: number, oy: number) => void) => { for (const ox of [-TS, 0, TS]) for (const oy of [-TS, 0, TS]) fn(ox, oy); };
  // pour texture: a broad trowel mottle + a fine one
  a.save(); a.globalCompositeOperation = "overlay";
  a.globalAlpha = 0.3; a.drawImage(noiseTile(512, 911, 5, 0.6), 0, 0, TS, TS);
  a.globalAlpha = 0.22; a.drawImage(noiseTile(256, 912, 4, 0.55), 0, 0, TS / 2, TS / 2); a.drawImage(noiseTile(256, 912, 4, 0.55), TS / 2, 0, TS / 2, TS / 2);
  a.drawImage(noiseTile(256, 912, 4, 0.55), 0, TS / 2, TS / 2, TS / 2); a.drawImage(noiseTile(256, 912, 4, 0.55), TS / 2, TS / 2, TS / 2, TS / 2);
  a.restore();
  h.save(); h.globalCompositeOperation = "overlay"; h.globalAlpha = 0.5; h.drawImage(noiseTile(256, 913, 5, 0.6), 0, 0, TS, TS); h.restore();
  // aggregate: exposed stones (lighter + darker flecks, tiny bumps)
  for (let i = 0; i < 9000; i++) {
    const x = R() * TS, y = R() * TS, s = 0.7 + R() * 1.3, dark = R() < 0.5;
    a.fillStyle = dark ? `rgba(84,80,74,${0.15 + R() * 0.25})` : `rgba(200,196,188,${0.12 + R() * 0.2})`;
    a.fillRect(x, y, s, s * (0.6 + R() * 0.8));
    h.fillStyle = dark ? "rgba(90,90,90,0.4)" : "rgba(170,170,170,0.4)"; h.fillRect(x, y, s, s);
  }
  // repair patches: sawn rectangles (lighter new pour or darker oil-soaked old pour) with a sealed border groove
  for (let i = 0; i < 3; i++) {
    const w = (1.2 + R() * 1.6) * PX, d = (1.0 + R() * 1.4) * PX, x = R() * (TS - w), y = R() * (TS - d), light = R() < 0.6;
    a.fillStyle = light ? `rgba(160,158,152,0.55)` : `rgba(96,92,86,0.5)`; a.fillRect(x, y, w, d);
    a.save(); a.globalCompositeOperation = "overlay"; a.globalAlpha = 0.35; a.drawImage(noiseTile(256, 920 + i, 4, 0.6), x, y, w, d); a.restore();
    a.strokeStyle = "rgba(40,38,36,0.85)"; a.lineWidth = 2.2; a.strokeRect(x, y, w, d);
    a.strokeStyle = "rgba(210,206,198,0.5)"; a.lineWidth = 1; a.strokeRect(x - 2, y - 2, w + 4, d + 4);
    h.strokeStyle = "#303030"; h.lineWidth = 3; h.strokeRect(x, y, w, d);
    if (!light) { h.fillStyle = "rgba(110,110,110,0.5)"; h.fillRect(x + 2, y + 2, w - 4, d - 4); }
  }
  // cracks: jagged random walks (1–4 m) from a panel edge or a panel corner, occasionally branching; a dark V-groove with
  // a chipped light arris beside it (albedo) + a groove in the height
  const crack = (x0: number, y0: number, ang: number, len: number, wd: number, depth = 0) => {
    const pts: Array<[number, number]> = [[x0, y0]];
    let x = x0, y = y0, a0 = ang;
    const step = 5 + R() * 4;
    for (let s = 0; s < len; s += step) {
      a0 += (R() - 0.5) * 0.9; a0 = ang + Math.max(-0.7, Math.min(0.7, a0 - ang));
      x += Math.cos(a0) * step; y += Math.sin(a0) * step; pts.push([x, y]);
      if (depth < 1 && R() < 0.03) crack(x, y, a0 + (R() < 0.5 ? 1 : -1) * (0.5 + R() * 0.6), len * (0.2 + R() * 0.3), wd * 0.7, depth + 1);
    }
    wrap((ox, oy) => {
      const path = () => { a.beginPath(); pts.forEach(([px, py], i) => (i ? a.lineTo(px + ox, py + oy) : a.moveTo(px + ox, py + oy))); };
      a.save(); a.lineJoin = "round"; a.lineCap = "round";
      a.strokeStyle = "rgba(205,200,190,0.45)"; a.lineWidth = wd + 2.2; path(); a.stroke();
      a.strokeStyle = "rgba(34,32,30,0.9)"; a.lineWidth = wd; path(); a.stroke();
      a.restore();
      h.save(); h.lineJoin = "round"; h.lineCap = "round"; h.strokeStyle = "#1a1a1a"; h.lineWidth = wd + 1.2;
      h.beginPath(); pts.forEach(([px, py], i) => (i ? h.lineTo(px + ox, py + oy) : h.moveTo(px + ox, py + oy))); h.stroke(); h.restore();
    });
  };
  const P6 = 6 * PX;
  for (let pi = 0; pi < 4; pi++) {
    const px0 = (pi % 2) * P6, py0 = Math.floor(pi / 2) * P6;
    const n = [1, 2, 0, 3][pi];
    for (let k = 0; k < n; k++) {
      const edge = Math.floor(R() * 4), t = 0.15 + R() * 0.7;
      const [x, y, ang] = edge === 0 ? [px0 + t * P6, py0, Math.PI / 2] : edge === 1 ? [px0 + t * P6, py0 + P6, -Math.PI / 2] : edge === 2 ? [px0, py0 + t * P6, 0] : [px0 + P6, py0 + t * P6, Math.PI];
      crack(x, y, ang + (R() - 0.5) * 0.8, (1.2 + R() * 2.8) * PX, 1.6 + R() * 1.2);
    }
    // a corner crack (re-entrant corners crack diagonally)
    if (R() < 0.7) { const cx = R() < 0.5 ? 0 : 1, cy = R() < 0.5 ? 0 : 1; crack(px0 + cx * P6 + (cx ? -0.3 : 0.3) * PX, py0 + cy * P6 + (cy ? -0.3 : 0.3) * PX, Math.atan2(cy ? -1 : 1, cx ? -1 : 1) + (R() - 0.5) * 0.4, (0.6 + R() * 0.9) * PX, 1.8); }
    // spalled arrises along the panel edges (the joints themselves are drawn analytically in the shader)
    for (let k = 0; k < 14; k++) {
      const alongX = R() < 0.5, t = R() * P6, off = (R() < 0.5 ? 0 : P6), w = 4 + R() * 14, d = 2 + R() * 5;
      const x = alongX ? px0 + t : px0 + off - (off ? d : 0), y = alongX ? py0 + off - (off ? d : 0) : py0 + t;
      a.fillStyle = `rgba(88,84,78,${0.5 + R() * 0.3})`; a.beginPath(); a.ellipse(x, y, alongX ? w : d, alongX ? d : w, 0, 0, Math.PI * 2); a.fill();
      h.fillStyle = "rgba(60,60,60,0.8)"; h.beginPath(); h.ellipse(x, y, alongX ? w : d, alongX ? d : w, 0, 0, Math.PI * 2); h.fill();
    }
  }
  // pop-outs + tiny oil drips (dark specks) scattered
  for (let i = 0; i < 90; i++) { const x = R() * TS, y = R() * TS, r0 = 1.5 + R() * 4; a.fillStyle = `rgba(52,48,44,${0.35 + R() * 0.4})`; a.beginPath(); a.ellipse(x, y, r0, r0 * (0.6 + R() * 0.5), R() * 3, 0, Math.PI * 2); a.fill(); }
  // tyre rubber (A): long gentle arcs in pairs (the two wheels of an axle, 1.9 m apart) + short skid streaks
  rb.save(); rb.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const cx = R() * TS, cy = R() * TS, rad = (4 + R() * 10) * PX, a0 = R() * Math.PI * 2, sw = 0.25 + R() * 0.45, w = (0.14 + R() * 0.1) * PX;
    for (const dr of [0, 1.9 * PX]) wrap((ox, oy) => {
      rb.strokeStyle = `rgba(255,255,255,${0.3 + R() * 0.4})`; rb.lineWidth = w;
      rb.beginPath(); rb.arc(cx + ox, cy + oy, rad + dr, a0, a0 + sw); rb.stroke();
    });
  }
  for (let i = 0; i < 10; i++) { const x = R() * TS, y = R() * TS, ang = R() * Math.PI, l = (0.8 + R() * 2.2) * PX; wrap((ox, oy) => { rb.strokeStyle = `rgba(255,255,255,${0.35 + R() * 0.35})`; rb.lineWidth = (0.12 + R() * 0.08) * PX; rb.beginPath(); rb.moveTo(x + ox, y + oy); rb.lineTo(x + ox + Math.cos(ang) * l, y + oy + Math.sin(ang) * l); rb.stroke(); }); }
  rb.restore();
  // oil grain: a blotchy fbm field (thresholded in the shader against the oil mask → organic splat edges) + drip dots
  const grain = noiseTile(512, 931, 5, 0.62);
  const [gel, g] = canvas(TS, TS);
  g.drawImage(grain, 0, 0, TS, TS);
  for (let i = 0; i < 260; i++) { const x = R() * TS, y = R() * TS, r0 = 2 + R() * 9; g.fillStyle = `rgba(0,0,0,${0.4 + R() * 0.5})`; g.beginPath(); g.arc(x, y, r0, 0, Math.PI * 2); g.fill(); }
  // pack: R albedo, G oil grain, B height, A rubber — as DataTextures (a canvas with alpha stores PREMULTIPLIED colour:
  // the near-zero rubber alpha destroys R/G/B → a camo pattern)
  const ad = a.getImageData(0, 0, TS, TS).data, gd = g.getImageData(0, 0, TS, TS).data, hd = h.getImageData(0, 0, TS, TS).data, rd = rb.getImageData(0, 0, TS, TS).data;
  const pk = new Uint8Array(TS * TS * 4), nk = new Uint8Array(TS * TS * 4);
  for (let i = 0; i < TS * TS; i++) {
    pk[i * 4] = Math.round(ad[i * 4] * 0.3 + ad[i * 4 + 1] * 0.55 + ad[i * 4 + 2] * 0.15); pk[i * 4 + 1] = gd[i * 4]; pk[i * 4 + 2] = hd[i * 4]; pk[i * 4 + 3] = rd[i * 4];
  }
  // normal (row y ↔ v = y / TS, flipY off): n = (−dH/du, −dH/dv, 1)
  const Hh = (x: number, y: number) => hd[(((y + TS) % TS) * TS + ((x + TS) % TS)) * 4] / 255, NS = 3.2;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const dx = (Hh(x + 1, y) - Hh(x - 1, y)) * NS, dy = (Hh(x, y + 1) - Hh(x, y - 1)) * NS, l = Math.hypot(dx, dy, 1), i = (y * TS + x) * 4;
    nk[i] = Math.round(128 - (dx / l) * 127); nk[i + 1] = Math.round(128 - (dy / l) * 127); nk[i + 2] = Math.round(128 + (1 / l) * 127); nk[i + 3] = 255;
  }
  void hel; void ael; void rel; void gel;
  return { pk, nk };
}
