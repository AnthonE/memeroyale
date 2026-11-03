// The painted island map (minimap + full map). Pure painter: terrain arrays in → a stylised top-down illustration
// out, drawn from the SAME data the game uses — heightfield + biomes + coast distance + path mask (terrain module),
// the deterministic vegetation scatter (every tree/palm/bush becomes a lit canopy stamp with a soft SE shadow) and
// the POI colliders (every building/container/crate becomes a roof with a height-scaled shadow). Runs in a worker
// (mapworker.ts) with OffscreenCanvas, or on the main thread as a fallback.
import { Biome } from "../../../shared/world/map";
import { Terrain } from "../../../shared/world/terrain";
import type { Box } from "../../../shared/world/colliders";

export interface MapPaintInput {
  heights: Float32Array; biome: Uint8Array; coast: Int8Array | null; path: Uint8Array | null;
  sizePx: number;
}
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type CanvasFactory = (w: number, h: number) => AnyCanvas;
type RGB = [number, number, number];

/** open-sea colour at the map's edge (the minimap/full map fill beyond the painted square with this) */
export const DEEP_SEA: RGB = [14, 72, 118];
export const DEEP_SEA_CSS = `rgb(${DEEP_SEA.join(",")})`;

// ------------------------------------------------------------------ palette
const SEA_DEEP: RGB = [16, 78, 126];
const SEA_MID: RGB = [22, 112, 160];
const SEA_SHELF: RGB = [30, 150, 178];
const SEA_SHALLOW: RGB = [52, 190, 190];
const SEA_LAGOON: RGB = [70, 206, 196];
const SEA_TOUCH: RGB = [128, 226, 206];
const REEF_DARK: RGB = [32, 104, 118];
const FOAM: RGB = [236, 248, 242];
const SAND: RGB = [236, 214, 152];
const SAND_WET: RGB = [206, 180, 124];
const GRASS: RGB = [120, 164, 58];
const GRASS_HI: RGB = [156, 190, 72];
const JUNGLE: RGB = [58, 104, 34];
const JUNGLE_HI: RGB = [84, 132, 44];
const ROCK: RGB = [150, 142, 124];
const ROCK_HI: RGB = [196, 188, 168];
const ROCK_DK: RGB = [92, 86, 76];
const CINDER: RGB = [74, 62, 56];
const PATH: RGB = [196, 164, 106];
const FARM: RGB = [150, 158, 70];
const PAVED: RGB = [164, 158, 146];

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function hash2(x: number, y: number) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x: number, y: number) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 17, y * 2.1 + 5) * 0.3 + vnoise(x * 4.3 + 3, y * 4.3 + 41) * 0.15;

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ------------------------------------------------------------------ 1. base terrain (one pixel per heightfield sample)
function paintBase(t: Terrain, coast: Int8Array | null, path: Uint8Array | null, mk: CanvasFactory): AnyCanvas {
  const R = t.res, H = t.heights, B = t.biome, cell = t.cell;
  const c = mk(R, R);
  const g = c.getContext("2d") as Ctx2D;
  const img = g.createImageData(R, R);
  const px = img.data;
  // sun from the NW, high (matches the in-game sun side on the render)
  const lx = -0.55, ly = 0.62, lz = -0.56;
  const at = (i: number, j: number) => H[Math.min(R - 1, Math.max(0, i)) * R + Math.min(R - 1, Math.max(0, j))];
  for (let i = 0; i < R; i++) {
    const wz = -t.half + i * cell;
    for (let j = 0; j < R; j++) {
      const k = i * R + j, wx = -t.half + j * cell;
      const h = H[k], b = B[k] as Biome;
      const cd = coast ? coast[k] : h > 0 ? 20 : -20;       // signed distance to shore (m), + land
      const n1 = fbm(wx * 0.012, wz * 0.012), n2 = vnoise(wx * 0.09 + 7, wz * 0.09 + 3);
      let col: RGB;
      const edge = Math.max(Math.abs(wx), Math.abs(wz));
      const edgeT = smooth(t.half - 150, t.half - 10, edge);
      if (h < 0.15 && !(b === Biome.Beach && h > -0.3) && b !== Biome.Paved) {
        // ---- water: depth + shore distance ramps, lagoon/reef tints, painted underwater texture
        const depth = Math.max(0, -h);
        const shore = cd < 0 ? -cd : 0;
        let w = mix(SEA_TOUCH, SEA_SHALLOW, smooth(0, 5, shore));
        w = mix(w, SEA_SHELF, smooth(2, 9, depth));
        w = mix(w, SEA_MID, smooth(8, 22, depth));
        w = mix(w, SEA_DEEP, smooth(20, 55, depth));
        if (b === Biome.Lagoon) w = mix(w, SEA_LAGOON, 0.55 * (1 - smooth(6, 16, depth)));
        if (b === Biome.Reef) w = mix(w, REEF_DARK, 0.28 + n2 * 0.25);
        // sandy patches / dark weed in the shallows, long swell streaks in deep water
        const shallowK = 1 - smooth(3, 14, depth);
        w = mix(w, [150, 226, 206], shallowK * Math.max(0, n1 - 0.55) * 0.9);
        w = mix(w, [22, 88, 104], shallowK * Math.max(0, 0.38 - n1) * 0.8);
        const swell = vnoise(wx * 0.02 + wz * 0.035, wz * 0.006);
        w = mix(w, [40, 130, 176], smooth(12, 40, depth) * Math.max(0, swell - 0.6) * 0.8);
        // foam: ribbon hugging the shore with broken lacy edge
        const foam = (1 - smooth(0.5, 5.5 + n2 * 3, shore)) * (0.55 + n2 * 0.45);
        w = mix(w, FOAM, clamp01(foam) * 0.85);
        const lace = shore > 6 && shore < 13 ? Math.max(0, 1 - Math.abs(shore - 9 - (n1 - 0.5) * 6) / 1.2) * Math.max(0, n2 - 0.35) : 0;
        w = mix(w, FOAM, lace * 0.5);
        col = mix(w, DEEP_SEA, edgeT);
      } else {
        // ---- land
        const up = at(i - 1, j), dn = at(i + 1, j), lf = at(i, j - 1), rt = at(i, j + 1);
        const dx = (rt - lf) / (2 * cell), dz = (dn - up) / (2 * cell);
        const nl = 1 / Math.hypot(dx, 1, dz);
        const nx = -dx * nl, ny = nl, nz = -dz * nl;
        const slope = Math.hypot(dx, dz);
        const lit = Math.max(0, nx * lx + ny * ly + nz * lz);
        // concavity (valleys darker, ridges lighter) from a 4-sample ring at 6 m
        const ring = (at(i - 3, j) + at(i + 3, j) + at(i, j - 3) + at(i, j + 3)) * 0.25;
        const cav = Math.max(-1, Math.min(1, (h - ring) * 0.35));
        switch (b) {
          case Biome.Beach: col = mix(SAND_WET, SAND, smooth(0.2, 1.6, h) * (0.85 + n2 * 0.15)); break;
          case Biome.Grass: col = mix(GRASS, GRASS_HI, n1); break;
          case Biome.Jungle: col = mix(JUNGLE, JUNGLE_HI, n1); break;
          case Biome.Rock: col = mix(ROCK, ROCK_HI, n1 * 0.6); break;
          case Biome.Cinder: col = mix(CINDER, [104, 80, 62], n1 * 0.7); break;
          case Biome.Path: col = PATH; break;
          case Biome.Farmland: col = mix(FARM, [186, 176, 88], (Math.sin(wx * 0.9 + wz * 0.35) * 0.5 + 0.5) * 0.55 + n2 * 0.2); break;
          case Biome.Paved: col = mix(PAVED, [184, 178, 164], n2 * 0.5); break;
          case Biome.Lagoon: col = mix(SAND_WET, GRASS, 0.4); break;
          default: col = h < 1.2 ? SAND : mix(GRASS, JUNGLE, n1);
        }
        // cliffs: steep ground turns to banded rock with dark crevices
        const cliff = smooth(0.75, 1.5, slope);
        if (cliff > 0 && b !== Biome.Paved) {
          const strata = Math.sin(h * 1.3 + n1 * 5) * 0.5 + 0.5;
          const rock = mix(mix(ROCK_DK, ROCK, strata), ROCK_HI, Math.max(0, n2 - 0.6) * 1.5);
          col = mix(col, rock, cliff * 0.92);
        }
        // high ground: lighter, cooler
        if (h > 80) col = mix(col, [168, 172, 150], smooth(80, 220, h) * 0.35);
        // dirt paths from the terrain module's path mask
        if (path && path[k] > 8 && b !== Biome.Paved && b !== Biome.Beach) col = mix(col, PATH, smooth(8, 150, path[k]) * 0.9);
        // hillshade + cavity
        const shade = 0.64 + lit * 0.5 + cav * 0.16;
        col = [col[0] * shade, col[1] * shade, col[2] * shade];
        // warm rim of dry sand right above the waterline, wet dark band just at it
        if (cd >= 0 && cd < 3 && b !== Biome.Paved) col = mix(col, SAND_WET, (1 - cd / 3) * 0.55);
      }
      const j2 = 1 + (n2 - 0.5) * 0.05;
      const o = k * 4;
      px[o] = Math.min(255, col[0] * j2);
      px[o + 1] = Math.min(255, col[1] * j2);
      px[o + 2] = Math.min(255, col[2] * j2);
      px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ 2. stamps (canopies, shadows)
interface Stamp { c: AnyCanvas; r: number }
function crownStamp(mk: CanvasFactory, seed: number, base: RGB, hi: RGB, lobes: number): Stamp {
  const S = 96, c = mk(S, S), g = c.getContext("2d") as Ctx2D, r = rng(seed);
  const cx = S / 2, cy = S / 2, R = S * 0.42;
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r() * 0.6, d = R * (0.42 + r() * 0.18);
    pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.5 + r() * 0.16)]);
  }
  pts.push([cx - R * 0.08, cy - R * 0.08, R * 0.62]);
  // dark silhouette (gaps between crowns read as shade)
  g.fillStyle = `rgb(${base.map((v) => v * 0.42).join(",")})`;
  for (const [x, y, rr] of pts) { g.beginPath(); g.arc(x, y, rr * 1.04, 0, Math.PI * 2); g.fill(); }
  // lit lobes: gradient from a NW highlight to a SE core shade
  for (const [x, y, rr] of pts) {
    const gr = g.createRadialGradient(x - rr * 0.38, y - rr * 0.42, rr * 0.08, x + rr * 0.1, y + rr * 0.12, rr * 1.02);
    gr.addColorStop(0, `rgb(${hi.join(",")})`);
    gr.addColorStop(0.45, `rgb(${base.join(",")})`);
    gr.addColorStop(1, `rgb(${base.map((v) => v * 0.55).join(",")})`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rr * 0.93, 0, Math.PI * 2); g.fill();
  }
  // leaf speckle highlights
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = r() * R * 0.8;
    const x = cx + Math.cos(a) * d - R * 0.12, y = cy + Math.sin(a) * d - R * 0.12;
    g.fillStyle = `rgba(${Math.min(255, hi[0] + 30)},${Math.min(255, hi[1] + 30)},${Math.min(255, hi[2] + 20)},${0.35 + r() * 0.3})`;
    g.beginPath(); g.arc(x, y, 2 + r() * 2.5, 0, Math.PI * 2); g.fill();
  }
  return { c, r: S * 0.5 };
}
function palmStamp(mk: CanvasFactory, seed: number, base: RGB, hi: RGB): Stamp {
  const S = 96, c = mk(S, S), g = c.getContext("2d") as Ctx2D, r = rng(seed);
  const cx = S / 2, cy = S / 2, n = 9;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.35, L = S * (0.36 + r() * 0.1), w = S * 0.085;
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(L * 0.5, -w, L, 0);
      g.quadraticCurveTo(L * 0.5, w, 0, 0);
      if (pass === 0) { g.fillStyle = `rgb(${base.map((v) => v * 0.45).join(",")})`; g.lineWidth = 3; g.strokeStyle = g.fillStyle; g.stroke(); }
      else {
        const lit = Math.max(0, Math.cos(a + Math.PI * 0.75));      // fronds pointing NW catch the light
        const col = mix(base, hi, 0.2 + lit * 0.8);
        g.fillStyle = `rgb(${col.map((v) => Math.round(v)).join(",")})`;
        g.fill();
        g.strokeStyle = `rgba(${hi.join(",")},0.55)`; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(2, 0); g.lineTo(L * 0.92, 0); g.stroke();
      }
      g.restore();
    }
  }
  g.fillStyle = "rgb(120,92,40)";
  g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
  return { c, r: S * 0.5 };
}
function shadowStamp(mk: CanvasFactory): Stamp {
  const S = 64, c = mk(S, S), g = c.getContext("2d") as Ctx2D;
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "rgba(8,22,6,0.62)");
  gr.addColorStop(0.6, "rgba(8,22,6,0.42)");
  gr.addColorStop(1, "rgba(8,22,6,0)");
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return { c, r: S * 0.5 };
}

// ------------------------------------------------------------------ 3. buildings from POI colliders
const CONTAINER: RGB[] = [[196, 70, 48], [46, 112, 176], [226, 170, 46], [64, 150, 86], [222, 214, 196], [30, 66, 110]];
function roofColour(b: Box, seed: number): RGB {
  const r = rng(seed)();
  switch (b.surf) {
    case "wood": return mix([150, 98, 56], [182, 128, 72], r);
    case "metal": return CONTAINER[Math.floor(r * CONTAINER.length)];
    case "concrete": return mix([214, 206, 190], [232, 226, 212], r);
    case "stone": return mix([168, 160, 142], [190, 182, 160], r);
    case "fabric": return r < 0.5 ? [222, 88, 60] : [240, 226, 196];
    case "glass": return [150, 206, 226];
    case "sand": return SAND;
    default: return [200, 190, 170];
  }
}

export interface Scatter { kind: string; variant: number; x: number; z: number; scale: number }

export function paintMap(inp: MapPaintInput, mk: CanvasFactory, veg: Scatter[], boxes: Box[]): AnyCanvas {
  const t = new Terrain(inp.heights, inp.biome);
  const S = inp.sizePx, half = t.half, ppm = S / (half * 2);
  const out = mk(S, S);
  const g = out.getContext("2d") as Ctx2D;
  g.imageSmoothingEnabled = true;
  (g as CanvasRenderingContext2D).imageSmoothingQuality = "high";
  const base = paintBase(t, inp.coast, inp.path, mk);
  g.drawImage(base as CanvasImageSource, 0, 0, S, S);
  const X = (x: number) => (x + half) * ppm, Z = (z: number) => (z + half) * ppm;

  // ---- vegetation
  const jungle = [
    crownStamp(mk, 11, [52, 104, 34], [132, 176, 64], 7), crownStamp(mk, 23, [62, 116, 38], [150, 190, 70], 6),
    crownStamp(mk, 37, [44, 92, 36], [116, 164, 58], 8), crownStamp(mk, 41, [72, 124, 40], [164, 198, 78], 6),
  ];
  const bushes = [crownStamp(mk, 5, [78, 128, 46], [150, 190, 76], 5), crownStamp(mk, 9, [66, 116, 40], [140, 182, 70], 4)];
  const banana = [crownStamp(mk, 71, [96, 150, 48], [184, 214, 92], 5)];
  const mangrove = [crownStamp(mk, 83, [48, 90, 44], [104, 146, 66], 6)];
  const palms = [palmStamp(mk, 3, [70, 128, 40], [176, 210, 84]), palmStamp(mk, 17, [60, 116, 36], [160, 200, 76]), palmStamp(mk, 29, [82, 138, 44], [188, 216, 96])];
  const shadow = shadowStamp(mk);
  const DIAM: Record<string, number> = {
    "jungle-tree": 11, palm: 9.5, "palm-leaning": 9, "banana-plant": 4.6, bush: 3.2, mangrove: 5.2, bamboo: 4, monstera: 1.8,
  };
  const sized = veg.filter((v) => DIAM[v.kind] !== undefined);
  // big emergent jungle trees are wider
  const diamOf = (v: Scatter) => DIAM[v.kind] * v.scale * (v.kind === "jungle-tree" ? (v.variant === 2 ? 1.45 : v.variant === 1 ? 1.1 : 0.82) : 1);
  // shadows first (sun NW → shadows fall SE)
  for (const v of sized) {
    if (v.kind === "monstera") continue;
    const d = diamOf(v) * ppm, sh = d * (v.kind === "bush" || v.kind === "banana-plant" ? 0.18 : 0.34);
    g.globalAlpha = v.kind === "bush" ? 0.5 : 0.75;
    g.drawImage(shadow.c as CanvasImageSource, X(v.x) - d * 0.55 + sh, Z(v.z) - d * 0.55 + sh * 1.15, d * 1.1, d * 1.1);
  }
  g.globalAlpha = 1;
  sized.sort((a, b) => a.z - b.z || a.x - b.x);
  for (const v of sized) {
    const d = diamOf(v) * ppm;
    const h = Math.floor(Math.abs(v.x * 7.13 + v.z * 3.71)) >>> 0;
    let st: Stamp;
    switch (v.kind) {
      case "jungle-tree": st = jungle[(h + v.variant) % jungle.length]; break;
      case "palm": case "palm-leaning": st = palms[h % palms.length]; break;
      case "banana-plant": st = banana[0]; break;
      case "mangrove": st = mangrove[0]; break;
      case "monstera": g.globalAlpha = 0.55; st = bushes[h % 2]; break;
      default: st = bushes[h % bushes.length];
    }
    const x = X(v.x), y = Z(v.z);
    g.drawImage(st.c as CanvasImageSource, x - d / 2, y - d / 2, d, d);
    g.globalAlpha = 1;
  }

  // ---- buildings (POI colliders): roofs sorted low → high, each with a height-scaled SE shadow
  const bld: Array<{ b: Box; top: number; rise: number }> = [];
  for (const b of boxes) {
    if (b.noShoot || b.surf === "foliage" || b.surf === "water") continue;
    const ground = t.height(b.c[0], b.c[2]);
    const top = b.c[1] + b.h[1];
    const rise = top - Math.max(0, ground);
    const area = b.h[0] * b.h[2] * 4;
    if (area < 1.2) continue;
    if (rise < 0.9 && area < 30) continue;
    if (rise > 60 && area < 4) continue;     // skip masts / poles
    bld.push({ b, top, rise });
  }
  bld.sort((a, b) => a.top - b.top);
  const rect = (b: Box, grow: number, ox = 0, oy = 0) => {
    const cx = X(b.c[0]) + ox, cy = Z(b.c[2]) + oy, hx = b.h[0] * ppm + grow, hz = b.h[2] * ppm + grow;
    g.save(); g.translate(cx, cy); g.rotate(b.yaw ?? 0);
    g.beginPath(); g.rect(-hx, -hz, hx * 2, hz * 2);
    g.restore();
  };
  // shadows
  g.fillStyle = "rgba(10,18,20,0.30)";
  for (const { b, rise } of bld) {
    const off = Math.min(26, rise * 0.55) * ppm;
    if (off < 0.6) continue;
    rect(b, 0.5, off * 0.8, off);
    g.fill();
  }
  // roofs
  for (let i = 0; i < bld.length; i++) {
    const { b, rise } = bld[i];
    const col = roofColour(b, (b.c[0] * 13.1 + b.c[2] * 7.7) | 0);
    const lift = 0.9 + Math.min(0.25, rise * 0.01);
    rect(b, 0);
    g.fillStyle = `rgb(${col.map((v) => Math.min(255, Math.round(v * lift))).join(",")})`;
    g.fill();
    if (b.h[0] * ppm > 1.6 && b.h[2] * ppm > 1.6) {
      g.lineWidth = Math.max(0.8, ppm * 0.45);
      g.strokeStyle = `rgba(${col.map((v) => Math.round(v * 0.45)).join(",")},0.9)`;
      g.stroke();
      // NW bevel highlight
      g.save();
      g.translate(X(b.c[0]), Z(b.c[2])); g.rotate(b.yaw ?? 0);
      const hx = b.h[0] * ppm, hz = b.h[2] * ppm, e = Math.max(0.8, ppm * 0.5);
      g.fillStyle = "rgba(255,250,235,0.32)";
      g.fillRect(-hx, -hz, hx * 2, e);
      g.fillRect(-hx, -hz, e, hz * 2);
      g.restore();
    }
  }
  return out;
}
