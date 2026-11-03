// PEEL HARBOR — the wharf slab: concrete apron (joint grid via the concrete tile), chamfered top edge, quay wall faces
// with tide band on every water edge, concrete kerb on the land edges, the berth's hazard capping + yellow/black
// fender panels + ladders, plain capping + rubber fenders on the other water edges, crane rails as real rail heads in
// recessed channels, drains, and the painted layer as GEOMETRY (crisp at any distance, ~2 draws): yellow safety lines,
// white lane dashes, container-slot corner marks, block letters + bay numbers, hatched no-standing zones under the
// crane backreaches, zebra crossings at the warehouse doors, lane arrows. Oil stains / tyre fans / rust blooms are
// decal quads from one 1024² stain atlas (not a 4096×3321 canvas = 69 MB).
// Geometry derives from shared/pois/peel-harbor.ts (APRON polygon, QUAY, CRANE, BLOCKS…), all in harbor-local space.
import * as THREE from "three";
import { APRON, APRON_BOTTOM, APRON_Y, BLOCKS, BERTH_EDGES, CHASSIS_PARK, CONTAINERS, CRANE, DOORS, LAYDOWN, QUAY, WAREHOUSES, WATER_EDGES, blockRect, doorCentres, jungleAt, onApron, whToWorld, yardLanes } from "../../../../../shared/pois/peel-harbor";
import { Builder, hash } from "../_kit/harbor-geo";
import { paint, slabConcreteMaps, weather } from "../_kit/harbor-materials";
import { canvas, paintNoise, rng, splotches, tex } from "../_kit/harbor-paint";
import { foam, groundAt, type Part } from "./parts";
import { DM, SLAB_DETAIL_MAP, SLAB_DETAIL_NORMAL, SLAB_DETAIL_PARS, SLAB_DETAIL_ROUGH, SLAB_DETAIL_VERT, SLAB_TUNE, apronMasks, drainSpots, fineTile } from "./apron-detail";

/** inset a closed polygon by d (positive = inward) — miter offset per vertex */
function inset(poly: Array<[number, number]>, d: number): Array<[number, number]> {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n]; area += ax * bz - bx * az; }
  const s = area > 0 ? 1 : -1;
  return poly.map((p, i) => {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]), l2 = Math.hypot(e2[0], e2[1]);
    const n1 = [-e1[1] / l1 * s, e1[0] / l1 * s], n2 = [-e2[1] / l2 * s, e2[0] / l2 * s];
    const bx = n1[0] + n2[0], bz = n1[1] + n2[1], bl = Math.hypot(bx, bz) || 1;
    const cos = (bx / bl) * n1[0] + (bz / bl) * n1[1];
    const k = d / Math.max(0.35, cos);
    return [p[0] + (bx / bl) * k, p[1] + (bz / bl) * k] as [number, number];
  });
}

function topGeometry(poly: Array<[number, number]>, y: number): THREE.BufferGeometry {
  const pts = poly.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  for (const t of tris) {
    let [a, b, c] = t;
    const ax = pts[a].x, az = pts[a].y, bx = pts[b].x, bz = pts[b].y, cx = pts[c].x, cz = pts[c].y;
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny < 0) [b, c] = [c, b];
    for (const k of [a, b, c]) { pos.push(pts[k].x, y, pts[k].y); nor.push(0, 1, 0); uv.push(pts[k].x, -pts[k].y); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** walls + chamfer strip around the slab, split into water edges and land edges */
function rimGeometry(outer: Array<[number, number]>, inner: Array<[number, number]>, yTop: number, bevel: number, yBot: number, water: (i: number) => boolean, landBot: (i: number) => number = () => yTop - 1.4) {
  const buf = { wW: [] as number[], wU: [] as number[], lW: [] as number[], lU: [] as number[], cP: [] as number[], cU: [] as number[] };
  let acc = 0;
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n], ai = inner[i], bi = inner[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ex = b[0] - a[0], ez = b[1] - a[1];
    let nx = ez, nz = -ex;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (onApron(mx + nx / len * 0.5, mz + nz / len * 0.5)) { nx = -nx; nz = -nz; }
    const quad = (arr: number[], uvs: number[], p: number[][], t: number[][]) => {
      const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const cx = u[1] * v[2] - u[2] * v[1], cz = u[0] * v[1] - u[1] * v[0];
      const order = cx * nx + cz * nz > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of order) { arr.push(...p[k]); uvs.push(...t[k]); }
    };
    const w = water(i);
    const yb = w ? yBot : landBot(i);
    quad(w ? buf.wW : buf.lW, w ? buf.wU : buf.lU, [[a[0], yb, a[1]], [b[0], yb, b[1]], [b[0], yTop - bevel, b[1]], [a[0], yTop - bevel, a[1]]], [[acc, yb], [acc + len, yb], [acc + len, yTop - bevel], [acc, yTop - bevel]]);
    quad(buf.cP, buf.cU, [[a[0], yTop - bevel, a[1]], [b[0], yTop - bevel, b[1]], [bi[0], yTop, bi[1]], [ai[0], yTop, ai[1]]], [[acc, 0], [acc + len, 0], [acc + len, bevel * 1.4], [acc, bevel * 1.4]]);
    acc += len;
  }
  const mk = (p: number[], u: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2)); g.computeVertexNormals(); return g; };
  return { water: mk(buf.wW, buf.wU), land: mk(buf.lW, buf.lU), chamfer: mk(buf.cP, buf.cU) };
}

// ------------------------------------------------------------------------------------------------ painted layer
/** 1024² paint atlas: worn line tile (u repeats along the line), hatch, arrow, zebra bar, and 20 labels */
const PA = {
  size: 1024,
  line: { x: 0, y: 0, w: 1024, h: 64 },          // worn solid line (tileable along u)
  dash: { x: 0, y: 64, w: 1024, h: 64 },         // 3 m dash + 3 m gap per tile (6 m)
  hatch: { x: 0, y: 128, w: 256, h: 256 },       // 45° hatch, tileable
  arrow: { x: 256, y: 128, w: 128, h: 256 },
  corner: { x: 384, y: 128, w: 128, h: 128 },    // L corner mark
  labels: { x: 0, y: 384, w: 1024, h: 640, cols: 4, rows: 5 },
};
function paintAtlas(): THREE.Texture {
  const [el, c] = canvas(PA.size, PA.size);
  c.clearRect(0, 0, PA.size, PA.size);
  c.fillStyle = "#fff";
  c.fillRect(PA.line.x, PA.line.y + 6, PA.line.w, PA.line.h - 12);
  for (let x = 0; x < 512; x++) c.fillRect(PA.dash.x + x, PA.dash.y + 6, 1, PA.dash.h - 12);
  c.save(); c.beginPath(); c.rect(PA.hatch.x, PA.hatch.y, PA.hatch.w, PA.hatch.h); c.clip();
  c.translate(PA.hatch.x, PA.hatch.y); c.rotate(-Math.PI / 4);
  for (let s = -400; s < 400; s += 64) c.fillRect(s, -400, 30, 800);
  c.restore();
  // arrow (pointing up in the tile = +v)
  c.beginPath();
  const A = PA.arrow;
  c.moveTo(A.x + 64, A.y + 8); c.lineTo(A.x + 118, A.y + 90); c.lineTo(A.x + 82, A.y + 90); c.lineTo(A.x + 82, A.y + 248); c.lineTo(A.x + 46, A.y + 248); c.lineTo(A.x + 46, A.y + 90); c.lineTo(A.x + 10, A.y + 90); c.closePath(); c.fill();
  const K = PA.corner;
  c.fillRect(K.x + 4, K.y + 4, 120, 22); c.fillRect(K.x + 4, K.y + 4, 22, 120);
  // wear: DIRECTIONAL (not swiss-cheese round holes) — tyres scrub the lines along their length: long thin scrapes
  // along u on the line/dash tiles, short scuffs in the traffic direction on the symbols, a fine grit speckle
  {
    const R = rng(61);
    c.save(); c.globalCompositeOperation = "destination-out";
    for (const reg of [PA.line, PA.dash]) for (let i = 0; i < 90; i++) {
      const x = reg.x + R() * reg.w, y = reg.y + 4 + R() * (reg.h - 8), len = 20 + R() ** 2 * 260;
      c.globalAlpha = 0.35 + R() * 0.6; c.fillRect(x, y, len, 1 + R() * 3.5);
    }
    for (const reg of [PA.hatch, PA.arrow, PA.corner, PA.labels]) for (let i = 0; i < reg.w * reg.h / 900; i++) {
      const x = reg.x + R() * reg.w, y = reg.y + R() * reg.h, len = 8 + R() ** 2 * 60;
      c.globalAlpha = 0.3 + R() * 0.55; c.fillRect(x, y, 1 + R() * 3, len);
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 5000; i++) { c.globalAlpha = 0.3 + R() * 0.7; c.fillRect(R() * PA.size, R() * PA.size, 1 + R() * 1.5, 1 + R() * 1.5); }
    c.restore();
  }
  const t = tex(el, { repeat: false, aniso: 8 });
  return t;
}

/** quad collector for the painted layer (UVs into the paint atlas, optional repeat along u for lines) */
class Paint {
  pos: number[] = []; uv: number[] = [];
  /** a strip from (x0,z0) to (x1,z1), width w, mapped to region r with `rep` = metres per region-width along u */
  strip(x0: number, z0: number, x1: number, z1: number, w: number, r: { x: number; y: number; w: number; h: number }, rep = 0, y = APRON_Y + 0.012) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), nx = -dz / L * w / 2, nz = dx / L * w / 2;
    const u0 = r.x / PA.size, u1 = (r.x + r.w) / PA.size, v0 = 1 - (r.y + r.h) / PA.size, v1 = 1 - r.y / PA.size;
    if (!rep) {
      this.q([x0 - nx, y, z0 - nz], [x1 - nx, y, z1 - nz], [x1 + nx, y, z1 + nz], [x0 + nx, y, z0 + nz], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      return;
    }
    // repeat: split into region-sized pieces
    const n = Math.max(1, Math.ceil(L / rep));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, f = (L / n) / rep;
      const ax = x0 + dx * t0, az = z0 + dz * t0, bx = x0 + dx * t1, bz = z0 + dz * t1;
      this.q([ax - nx, y, az - nz], [bx - nx, y, bz - nz], [bx + nx, y, bz + nz], [ax + nx, y, az + nz], [u0, v0], [u0 + (u1 - u0) * f, v0], [u0 + (u1 - u0) * f, v1], [u0, v1]);
    }
  }
  /** a rectangle centred at (x,z), size (sx along x, sz along z), rotated by rot (three yaw), region r */
  rect(x: number, z: number, sx: number, sz: number, rot: number, r: { x: number; y: number; w: number; h: number }, y = APRON_Y + 0.013) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (a: number, b: number): [number, number, number] => [x + a * c + b * s, y, z - a * s + b * c];
    const u0 = r.x / PA.size, u1 = (r.x + r.w) / PA.size, v0 = 1 - (r.y + r.h) / PA.size, v1 = 1 - r.y / PA.size;
    this.q(P(-sx / 2, sz / 2), P(sx / 2, sz / 2), P(sx / 2, -sz / 2), P(-sx / 2, -sz / 2), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
  }
  label(i: number, x: number, z: number, h: number, rot: number) {
    const cw = PA.labels.w / PA.labels.cols, ch = PA.labels.h / PA.labels.rows;
    this.rect(x, z, h * (cw / ch), h, rot, { x: PA.labels.x + (i % PA.labels.cols) * cw, y: PA.labels.y + Math.floor(i / PA.labels.cols) * ch, w: cw, h: ch });
  }
  private q(a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[]) {
    // up-facing: (b−a)×(c−a) must have +y
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const tri = ny >= 0 ? [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]] : [[a, ua], [c, uc], [b, ub], [a, ua], [d, ud], [c, uc]];
    for (const [p, t] of tri) { this.pos.push(...p); this.uv.push(...t); }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    const n = new Float32Array(this.pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function paintMat(color: string, map: THREE.Texture, name: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, map, alphaTest: 0.5, roughness: 0.72, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  m.name = name;
  return m;
}

// ------------------------------------------------------------------------------------------------ stains
/** 1024² stain atlas, 4×2 cells: 0-1 oil splats, 2 tyre fan, 3 skid pair, 4 rust bloom, 5 dirt drift, 6 puddle ring, 7 drain streak */
let stainCache: THREE.Texture | null = null;
export function stainAtlas(): THREE.Texture {
  if (stainCache) return stainCache;
  const S = 1024, C = 256;
  const [el, c] = canvas(S, S / 2);
  c.clearRect(0, 0, S, S / 2);
  const cell = (i: number) => ({ x: (i % 4) * C, y: Math.floor(i / 4) * C });
  const r = rng(77);
  for (const i of [0, 1]) {
    const { x, y } = cell(i);
    splotches(c, x + 40, y + 40, C - 80, C - 80, { n: 18, rMin: 12, rMax: 60, color: "rgba(0,0,0,1)", alpha: 0.5, seed: 10 + i });
    splotches(c, x + 80, y + 80, C - 160, C - 160, { n: 10, rMin: 10, rMax: 40, color: "rgba(0,0,0,1)", alpha: 0.7, seed: 20 + i });
  }
  { // tyre fan: a sweep of soft, broken rubber smears (turning trucks) — irregular, never concentric
    const { x, y } = cell(2);
    c.save(); c.lineCap = "round";
    for (let k = 0; k < 16; k++) {
      const a0 = -1.2 + r() * 1.0, R = 70 + r() * 150, len = 0.25 + r() * 0.5, w = 5 + r() * 9;
      c.strokeStyle = `rgba(0,0,0,${0.12 + r() * 0.18})`; c.lineWidth = w;
      c.beginPath(); c.arc(x + 30 + r() * 20, y + C - 20 - r() * 20, R, a0, a0 + len, false); c.stroke();
    }
    c.restore();
    paintNoise(c, x, y, C, C, { seed: 4, scale: 70, alpha: 0.6, blend: "destination-out" });
  }
  { // skid pair
    const { x, y } = cell(3);
    c.fillStyle = "rgba(0,0,0,0.45)"; c.fillRect(x + 80, y + 10, 26, C - 20); c.fillRect(x + 150, y + 10, 26, C - 20);
    paintNoise(c, x, y, C, C, { seed: 5, scale: 80, alpha: 0.7, blend: "destination-out" });
  }
  { const { x, y } = cell(4); splotches(c, x + 30, y + 30, C - 60, C - 60, { n: 30, rMin: 8, rMax: 50, color: "rgba(150,70,25,1)", alpha: 0.55, seed: 44 }); }
  { const { x, y } = cell(5); splotches(c, x + 10, y + 10, C - 20, C - 20, { n: 40, rMin: 20, rMax: 70, color: "rgba(90,78,60,1)", alpha: 0.3, seed: 45 }); }
  { const { x, y } = cell(6); c.strokeStyle = "rgba(0,0,0,0.3)"; c.lineWidth = 14; c.beginPath(); c.ellipse(x + C / 2, y + C / 2, 90, 60, 0.3, 0, Math.PI * 2); c.stroke(); splotches(c, x + 60, y + 70, 130, 110, { n: 12, rMin: 10, rMax: 40, color: "rgba(0,0,0,1)", alpha: 0.18, seed: 46 }); }
  { const { x, y } = cell(7); const g = c.createLinearGradient(0, y, 0, y + C); g.addColorStop(0, "rgba(0,0,0,0.5)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(x + 90, y, 76, C); }
  // soften all edges
  paintNoise(c, 0, 0, S, S / 2, { seed: 9, scale: 180, alpha: 0.35, blend: "destination-out" });
  stainCache = tex(el, { repeat: false, aniso: 4 });
  return stainCache;
}

// ------------------------------------------------------------------------------------------------ slab detail map
/** ONE 1024² map over the whole slab (≈ 0.4 m/texel): multiply colour (RGB) + oiliness (A → glossier). Repair panels,
 *  oil splats, tyre fans + traffic grime in the lanes, rust blooms under ground-tier boxes, dirt drifts along the land
 *  edges, soil around the jungle patches — no transparent overlay quads (stain decals would cost overdraw). */
let slabDetailCache: THREE.Texture | null = null;
function slabDetail(): THREE.Texture {
  if (slabDetailCache) return slabDetailCache;
  return (slabDetailCache = slabDetailPaint());
}
function slabDetailPaint(): THREE.Texture {
  const S = DM.size, [el, c] = canvas(S, S);
  c.fillStyle = "rgba(255,255,255,1)"; c.fillRect(0, 0, S, S);
  const X = (x: number) => ((x - DM.x0) / DM.sx) * S, Z = (z: number) => ((z - DM.z0) / DM.sz) * S, M = (m: number) => (m / DM.sx) * S;
  const r = rng(4243);
  // large-scale tone: the slab was poured in bays — gentle per-bay variation + noise
  paintNoise(c, 0, 0, S, S, { seed: 4244, scale: 520, alpha: 0.1, blend: "multiply" });
  // repair panels on the 4 m joint grid (lighter new pours, darker oil-soaked bays)
  for (let i = 0; i < 260; i++) {
    const w = 4 * (1 + Math.floor(r() * 3)), d = 4 * (1 + Math.floor(r() * 4)), x = 520 + Math.floor(r() * 95) * 4, z = 40 + Math.floor(r() * 108) * 4;
    if (!onApron(x + w / 2, z + d / 2, 2)) continue;
    const light = r() < 0.5;
    c.fillStyle = light ? `rgba(255,252,242,${0.5 + r() * 0.3})` : `rgba(${196 + r() * 20},${188 + r() * 18},${172 + r() * 16},${0.5 + r() * 0.35})`;
    c.fillRect(X(x), Z(z), M(w), M(d));
  }
  const blob = (x: number, z: number, rad: number, col: string, a: number, sq = 1) => {
    const g = c.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), M(rad));
    g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
    c.save(); c.globalAlpha = a; c.fillStyle = g; c.translate(X(x), Z(z)); c.scale(1, sq); c.translate(-X(x), -Z(z)); c.beginPath(); c.arc(X(x), Z(z), M(rad), 0, Math.PI * 2); c.fill(); c.restore();
  };
  // traffic grime down every lane + the transfer lane under the cranes
  const band = (x0: number, z0: number, x1: number, z1: number, w: number, a: number) => {
    c.save(); c.strokeStyle = "rgba(92,84,72,1)"; c.lineCap = "round";
    for (let k = 0; k < 3; k++) { c.globalAlpha = a * (0.5 + r() * 0.5); c.lineWidth = M(w * (0.5 + r() * 0.6)); const o = (r() - 0.5) * w * 0.8; c.beginPath(); c.moveTo(X(x0 + o), Z(z0)); c.lineTo(X(x1 + o), Z(z1)); c.stroke(); }
    c.restore();
  };
  band(CRANE.railLand - 6.2, QUAY.eastZ0, CRANE.railLand - 6.2, QUAY.eastZ1, 4, 0.5);
  band(CRANE.railLand - 1.5, QUAY.eastZ0, CRANE.railLand - 1.5, QUAY.eastZ1, 3, 0.35);
  for (const l of yardLanes()) band(l.x0, l.z0, l.x1, l.z1, l.cross ? 3 : 3.5, 0.45);
  // tyre fans at the block ends (turning straddle carriers / trucks)
  for (const b of BLOCKS) {
    const [x0, x1, z0, z1] = blockRect(b);
    const ends: Array<[number, number]> = b.dir === "z" ? [[(x0 + x1) / 2, z0 - 4], [(x0 + x1) / 2, z1 + 4]] : [[x0 - 4, (z0 + z1) / 2], [x1 + 4, (z0 + z1) / 2]];
    for (const [x, z] of ends) {
      if (!onApron(x, z, 3)) continue;
      c.save(); c.strokeStyle = "rgba(40,36,32,1)"; c.lineCap = "round";
      // (a few long, gently curved scuffs swinging OUT of the lane — denser arcs (11 per end, r 5–14 m, random
      // phase) draw "crop circles" all over the slab from the plane)
      const out = b.dir === "z" ? (z < (z0 + z1) / 2 ? -1 : 1) : (x < (x0 + x1) / 2 ? -1 : 1);
      for (let k = 0; k < 4; k++) {
        const R = M(14 + r() * 12), side = r() < 0.5 ? -1 : 1, sweep = 0.22 + r() * 0.3;
        // centre off to one side of the lane mouth so the arc leaves the block end heading outward
        const cx = b.dir === "z" ? x + side * (14 + r() * 8) : x, cz = b.dir === "z" ? z : z + side * (14 + r() * 8);
        const aMid = Math.atan2(Z(z) - Z(cz), X(x) - X(cx)) + out * side * 0.15;
        c.globalAlpha = 0.14 + r() * 0.16; c.lineWidth = M(0.5 + r() * 0.5);
        c.beginPath(); c.arc(X(cx), Z(cz), R, aMid - sweep / 2, aMid + sweep / 2); c.stroke();
      }
      c.restore();
      blob(x + (r() - 0.5) * 5, z + (r() - 0.5) * 5, 1.0 + r() * 1.5, "rgba(60,54,46,1)", 0.22 + r() * 0.15);
    }
  }
  // oil splats, drips under the quay transfer lane: small (1.2–4 m), warm grey, 20–45 %, and a big one is a rare
  // 3–6 m faint stain — wear, not soot (6–16 m splats at 40–65 % near-black read as dirt or soot noise from the drop)
  for (let i = 0; i < 420; i++) {
    const x = 524 + r() * 372, z = 40 + r() * 430;
    if (!onApron(x, z, 3)) continue;
    const big = r() < 0.06;
    blob(x, z, big ? 1.5 + r() * 1.5 : 0.6 + r() * 1.4, "rgba(70,62,52,1)", big ? 0.15 + r() * 0.1 : 0.25 + r() * 0.2, 0.6 + r() * 0.8);
  }
  for (let z = QUAY.eastZ0 + 6; z < QUAY.eastZ1 - 6; z += 6 + r() * 8) blob(855 + r() * 6, z, 0.8 + r() * 1.4, "rgba(60,54,46,1)", 0.3);
  // rust blooms under ground-tier boxes
  for (const p of CONTAINERS) {
    if (Math.abs(p.y - APRON_Y) > 0.1 || r() < 0.45) continue;
    blob(p.x + (r() - 0.5) * 1.5, p.z + (r() - 0.5) * 6, 1.8 + r() * 2, "rgba(150,82,40,1)", 0.25);
  }
  // dirt drifts along the land edges + around the jungle patches
  for (let i = 0; i < APRON.length; i++) {
    if (WATER_EDGES.includes(i)) continue;
    const [ax, az] = APRON[i], [bx, bz] = APRON[(i + 1) % APRON.length], len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < len; t += 4) { const f = t / len; blob(ax + (bx - ax) * f + (r() - 0.5) * 3, az + (bz - az) * f + (r() - 0.5) * 3, 4 + r() * 5, "rgba(130,112,84,1)", 0.35); }
  }
  for (let z = 40; z < 470; z += 3) for (let x = 524; x < 896; x += 3) { const j = jungleAt(x, z); if (j > 0.02 && j < 0.9 && r() < 0.5) blob(x, z, 2.5 + r() * 2, "rgba(96,84,56,1)", 0.3 * j + 0.1); }
  const t = tex(el, { repeat: false, aniso: 4 });
  t.flipY = false;
  return t;
}
/** the slab material: warm-cream jointless concrete + weather layer + the slab detail map (harbor-local) + an ANALYTIC
 *  6 m joint grid (sawn joints with a light arris, per-panel pour tone) that stays readable from 100 m: the line widens
 *  to ~0.8 px and loses contrast instead of aliasing */
function slabMaterial(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const m = base.clone(); m.name = "apron-slab";
  const sc = slabConcreteMaps();
  m.map = sc.map; m.normalMap = sc.normalMap; m.normalScale = new THREE.Vector2(0.55, 0.55);
  // (target: warm light grey #b5ab9c S 0.14 lit; a beige pour renders #dcc298 S 0.31, a flat slab): a
  // neutral warm-grey pour (the tile + this multiplier), the kong-eye detail layer on top (apron-detail.ts)
  m.color = new THREE.Color(0.78, 0.81, 0.92);
  weather(m, { vary: 0.16, grime: 0.2, grimeY: 3.5, grimeH: 0.5, scale: [0.06, 0.013] });
  const map = slabDetail(), prev = m.onBeforeCompile;
  const fine = fineTile(), mask = apronMasks();
  m.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    shader.uniforms.apronDetail = { value: map };
    shader.uniforms.apronFine = { value: fine.a }; shader.uniforms.apronFineN = { value: fine.n }; shader.uniforms.apronMask = { value: mask };
    shader.uniforms.apronTune = SLAB_TUNE;
    shader.vertexShader = "varying vec2 vApronUv;\nvarying vec2 vApronP;\nvarying vec3 vApronAX;\nvarying vec3 vApronAZ;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vApronP = position.xz;
      vApronUv = vec2((position.x - ${DM.x0.toFixed(1)}) / ${DM.sx.toFixed(1)}, (position.z - ${DM.z0.toFixed(1)}) / ${DM.sz.toFixed(1)});
      ${SLAB_DETAIL_VERT}`);
    shader.fragmentShader = "uniform sampler2D apronDetail;\nvarying vec2 vApronUv;\nvarying vec2 vApronP;\n" + SLAB_DETAIL_PARS + shader.fragmentShader
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec4 apd = texture2D(apronDetail, vApronUv);
        diffuseColor.rgb *= apd.rgb * 1.02;
        {
          // pour panels: 6 m bays, each a slightly different tone (reads at 100 m even where the joints are sub-pixel)
          vec2 jq = vApronP / 6.0, jc = floor(jq);
          float jh = fract(sin(dot(jc, vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= 0.94 + 0.1 * jh;
          // sawn joints: dark sealant line + a light chipped arris beside it; width floors at ~0.8 px when far
          vec2 jf = abs(fract(jq) - 0.5) * 6.0;
          float jd = 3.0 - max(jf.x, jf.y);
          float jw = max(fwidth(vApronP.x), fwidth(vApronP.y));
          float lw = max(0.035, jw * 0.8), far = smoothstep(0.02, 0.12, jw);
          float joint = 1.0 - smoothstep(lw, lw + jw, jd);
          float arris = (1.0 - smoothstep(lw + 0.03, lw + 0.03 + jw, jd)) * (1.0 - joint) * (1.0 - far);
          diffuseColor.rgb *= 1.0 - joint * mix(0.5, 0.2, far);
          diffuseColor.rgb *= 1.0 + arris * 0.12;
        }
        ${SLAB_DETAIL_MAP}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor *= mix(0.72, 1.0, smoothstep(0.35, 0.8, dot(apd.rgb, vec3(0.333))));
        ${SLAB_DETAIL_ROUGH}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        ${SLAB_DETAIL_NORMAL}`);
  };
  const pk = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => pk() + "|apron-detail3";
  return m;
}

// ------------------------------------------------------------------------------------------------ part
export const part: Part = {
  id: "apron",
  async build({ ctx, mats, group, lod }) {
    const b = new Builder(true);
    const bevel = 0.18;
    const innerTop = inset(APRON, bevel);
    const water = (i: number) => WATER_EDGES.includes(i);
    // (the slab's painted maps one per time slice — together they are one ~100 ms task inside slabMaterial)
    slabConcreteMaps(); await ctx.yield(); slabDetail(); await ctx.yield(); apronMasks(); await ctx.yield(); fineTile(); await ctx.yield();
    b.addRaw(slabMaterial(mats.concrete), topGeometry(innerTop, APRON_Y));
    await ctx.yield();
    // a land edge whose ground falls away outside it (the inlet / pier corners) gets its wall down to below
    // that ground: the land skirt (yard.ts) does not float over the trench there, so the 1.4 m wall would leave a gap
    // under the slab. Every other land edge keeps its 1.4 m wall.
    const landBot = (i: number) => {
      const [ax, az] = APRON[i], [bx, bz] = APRON[(i + 1) % APRON.length], len = Math.hypot(bx - ax, bz - az);
      let nx = (bz - az) / len, nz = -(bx - ax) / len;
      if (onApron((ax + bx) / 2 + nx * 2, (az + bz) / 2 + nz * 2)) { nx = -nx; nz = -nz; }
      let g = Infinity;
      for (let k = 0; k <= Math.ceil(len); k++) { const t = k / Math.ceil(len); for (const d of [0.3, 1.5, 3]) g = Math.min(g, groundAt(ctx, ax + (bx - ax) * t + nx * d, az + (bz - az) * t + nz * d)); }
      return Math.min(APRON_Y - 1.4, g - 0.5);
    };
    const rim = rimGeometry(APRON, innerTop, APRON_Y, bevel, APRON_BOTTOM, water, landBot);
    b.addRaw(mats.quayWall, rim.water);
    b.addRaw(mats.concrete, rim.land);
    b.addRaw(mats.concrete, rim.chamfer);
    await ctx.yield();
    const slab = await b.buildAsync("apron", { cast: false }, () => ctx.yield());
    await ctx.yield();
    group.add(slab);

    // ---- edge furniture (capping, fenders, ladders, kerbs) — one detail group
    const e = new Builder(true);
    const F = foam(ctx);
    for (let i = 0; i < APRON.length; i++) {
      await ctx.yield();
      const [ax, az] = APRON[i], [bx, bz] = APRON[(i + 1) % APRON.length], len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      let nx = dz, nz = -dx; // outward normal
      if (onApron((ax + bx) / 2 + nx, (az + bz) / 2 + nz)) { nx = -nx; nz = -nz; }
      const rot = Math.atan2(-dz, dx); // three yaw that maps +X onto the edge direction
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (BERTH_EDGES.includes(i)) {
        // hazard capping beam + alternating yellow steel / black rubber fender panels
        e.box(mats.hazard, [mx - nx * 0.43, APRON_Y + 0.2, mz - nz * 0.43], [len - 0.2, 0.45, 0.9], { bevel: 0.06, rotY: rot });
        // black rubber fender pads alternating with narrower weathered-yellow steel panels on the dark wall
        // (the wall shows between them) — not a solid candy-stripe
        const fenderYellow = paint("#d49a16", { rough: 0.62, grime: 0.55, name: "fender-yellow" });
        for (let t = 2.2, k = 0; t < len - 2; t += 1.85, k++) {
          const yellow = k % 2 === 0, x = ax + dx * t, z = az + dz * t;
          if (groundAt(ctx, x + nx * 1.5, z + nz * 1.5) > -0.4) continue;   // no fenders hanging over sand
          e.box(yellow ? fenderYellow : mats.rubber, [x + nx * (yellow ? 0.1 : 0.26), APRON_Y - (yellow ? 1.25 : 1.55), z + nz * (yellow ? 0.1 : 0.26)], [yellow ? 0.95 : 1.25, yellow ? 2.3 : 2.9, yellow ? 0.2 : 0.52], { bevel: yellow ? 0.04 : 0.09, rotY: rot });
          if (!yellow) for (const oy of [-0.9, 0.9]) e.box(mats.steel, [x + nx * 0.53, APRON_Y - 1.55 + oy, z + nz * 0.53], [0.9, 0.08, 0.04], { rotY: rot });
        }
        // (no recessed wall ladders — painted rungs nobody could climb; the berth's water
        // stairs (QUAY_STAIRS, access.ts) are the real way out of the water)
        F.capsule(ax + nx * 0.8, az + nz * 0.8, bx + nx * 0.8, bz + nz * 0.8, 1.4, 0.5);
      } else if (water(i)) {
        // plain concrete capping (a pale kerb) + black cylinder fenders + a chain of old tyres
        e.box(mats.concrete, [mx - nx * 0.4, APRON_Y + 0.14, mz - nz * 0.4], [len, 0.3, 0.8], { bevel: 0.05, rotY: rot });
        for (let t = 4; t < len - 3; t += 8) {
          const x = ax + dx * t + nx * 0.35, z = az + dz * t + nz * 0.35;
          if (groundAt(ctx, x + nx * 1.2, z + nz * 1.2) > -0.4) continue;   // (no fenders over the beach)
          e.cyl(mats.rubber, [x - dx * 1.1, APRON_Y - 1.1, z - dz * 1.1], [x + dx * 1.1, APRON_Y - 1.1, z + dz * 1.1], 0.35, 12);
        }
        F.capsule(ax + nx * 0.8, az + nz * 0.8, bx + nx * 0.8, bz + nz * 0.8, 1.2, 0.45);
      } else {
        // land edge: raised kerb
        e.box(mats.concrete, [mx - nx * 0.2, APRON_Y + 0.12, mz - nz * 0.2], [len, 0.24, 0.4], { bevel: 0.04, rotY: rot });
      }
    }
    // crane rails: dark recessed channel (with lighter edge lips) + a real rail profile (foot, web, head) + buffers
    const zc = (QUAY.railZ0 + QUAY.railZ1) / 2, zl = QUAY.railZ1 - QUAY.railZ0;
    const railShape = new THREE.Shape();
    railShape.moveTo(-0.075, 0); railShape.lineTo(0.075, 0); railShape.lineTo(0.075, 0.015); railShape.lineTo(0.018, 0.03); railShape.lineTo(0.016, 0.105);
    railShape.lineTo(0.036, 0.11); railShape.lineTo(0.036, 0.15); railShape.lineTo(-0.036, 0.15); railShape.lineTo(-0.036, 0.11); railShape.lineTo(-0.016, 0.105); railShape.lineTo(-0.018, 0.03); railShape.lineTo(-0.075, 0.015); railShape.closePath();
    for (const rx of [CRANE.railLand, CRANE.railSea]) {
      e.box(mats.asphalt, [rx, APRON_Y - 0.03, zc], [0.62, 0.08, zl], {});
      for (const s of [-1, 1]) e.box(mats.steel, [rx + s * 0.33, APRON_Y + 0.004, zc], [0.05, 0.02, zl]);
      e.extrude(mats.steel, railShape, zl - 1, new THREE.Matrix4().makeTranslation(rx, APRON_Y - 0.1, QUAY.railZ0 + 0.5));
      for (let z = QUAY.railZ0 + 1; z < QUAY.railZ1 - 1; z += 0.9) e.box(mats.darkPaint, [rx, APRON_Y - 0.06, z], [0.24, 0.05, 0.08]);
      for (const ez of [QUAY.railZ0 + 1.6, QUAY.railZ1 - 1.6]) {
        e.box(mats.hazard, [rx, APRON_Y + 0.6, ez], [1.3, 1.2, 1.1], { bevel: 0.08 });
        e.box(mats.rubber, [rx, APRON_Y + 0.7, ez + (ez < zc ? 0.75 : -0.75)], [0.8, 0.8, 0.4], { bevel: 0.1 });
      }
    }
    // cable trench cover plates beside the land rail + storm drain channel along the safety strip
    for (let z = QUAY.railZ0 + 3; z < QUAY.railZ1 - 3; z += 3.1) e.box(mats.galv, [CRANE.railLand - 1.4, APRON_Y + 0.012, z + 1.5], [0.9, 0.025, 3.0]);
    e.box(mats.steel, [QUAY.eastX - 2.8, APRON_Y + 0.008, (QUAY.eastZ0 + QUAY.eastZ1) / 2], [0.35, 0.012, QUAY.eastZ1 - QUAY.eastZ0 - 6]);
    // drains: grated gullies at the lane mouths (frame + bars)
    for (const [x, z] of drainSpots()) {
      e.box(mats.darkPaint, [x, APRON_Y + 0.01, z], [0.7, 0.03, 1.0]);
      for (let k = 0; k < 6; k++) e.box(mats.steel, [x, APRON_Y + 0.026, z - 0.4 + k * 0.16], [0.62, 0.012, 0.05]);
    }
    await ctx.yield();
    const edges = await e.buildAsync("apron-edges", { cast: false, palette: (m) => /^(darkPaint|steel|galv|rubber|fender-yellow)$/.test(m.name) }, () => ctx.yield());
    group.add(edges);
    // (240 m, pop-proof: at 170 m the quay fenders / capping / drains appeared mid-approach)
    lod.add(edges, { show: 240 });

    // ---- painted layer (geometry)
    const atlas = paintAtlas();
    const Y = new Paint(), W = new Paint();
    const Lr = PA.line, Dr = PA.dash;
    // berth safety strip (solid yellow) + the backreach lane edge
    Y.strip(QUAY.eastX - 2.2, QUAY.eastZ0 + 2, QUAY.eastX - 2.2, QUAY.eastZ1 - 2, 0.2, Lr, 6);
    Y.strip(CRANE.railLand - 3.2, QUAY.eastZ0 + 2, CRANE.railLand - 3.2, QUAY.eastZ1 - 12, 0.2, Lr, 6);
    // transfer lane centre dashes + lane dashes between the blocks
    W.strip(CRANE.railLand - 6.2, QUAY.eastZ0 + 4, CRANE.railLand - 6.2, QUAY.eastZ1 - 14, 0.18, Dr, 6);
    for (const l of yardLanes()) if (!l.cross) W.strip(l.x0, l.z0, l.x1, l.z1, 0.16, Dr, 6);
    { const C = CHASSIS_PARK; for (let z = C.z0 + 0.5; z < C.z1 - 1; z += C.rowPitch) W.strip(C.x0 + 2, z, C.x1 - 2, z, 0.14, Lr, 6); for (let x = C.x0 + 1; x < C.x1; x += C.slot) W.strip(x, C.z0 + 0.5, x, C.z1 - 2, 0.12, Lr, 6); }
    // slot corner L-marks under ground-tier boxes + lane arrows (no painted letters: signage is BANANA CO. only)
    for (const p of CONTAINERS) {
      if (Math.abs(p.y - APRON_Y) > 0.1 || (p.size ?? 40) !== 40) continue;
      const along = Math.abs(Math.sin(p.yaw)) > 0.9 ? "z" : Math.abs(Math.cos(p.yaw)) > 0.9 ? "x" : null;
      if (!along) continue;
      for (const [sx, sz, rot] of [[-1, -1, 0], [1, -1, -Math.PI / 2], [1, 1, Math.PI], [-1, 1, Math.PI / 2]] as Array<[number, number, number]>) {
        if (along === "z") Y.rect(p.x + sx * 1.42, p.z + sz * 6.3, 0.9, 0.9, rot, PA.corner); else Y.rect(p.x + sx * 6.3, p.z + sz * 1.42, 0.9, 0.9, rot, PA.corner);
      }
    }
    for (const l of yardLanes()) if (!l.cross) for (let z = l.z0 + 20; z < l.z1 - 10; z += 55) if (onApron(l.x0, z, 3)) W.rect(l.x0, z, 1.1, 3.6, hash(z, l.x0) < 0.5 ? 0 : Math.PI, PA.arrow);
    // hatched no-standing zones under the crane backreaches + a yellow border
    for (const cz of CRANE.zs) {
      const x0 = Math.max(CRANE.girderX0 + 1.5, blockRect(BLOCKS[0])[1] + 1.5), x1 = CRANE.railLand - 3.6, z0 = cz - 10, z1 = cz + 10;
      if (x1 - x0 < 3) continue;
      for (let x = x0; x < x1; x += 4) for (let z = z0; z < z1; z += 4) Y.rect(Math.min(x + 2, x1 - 2), z + 2, Math.min(4, x1 - x), 4, 0, PA.hatch);
      Y.strip(x0, z0, x1, z0, 0.2, Lr, 6); Y.strip(x0, z1, x1, z1, 0.2, Lr, 6); Y.strip(x0, z0, x0, z1, 0.2, Lr, 6);
    }
    // zebra crossings in front of every warehouse door
    for (const w of WAREHOUSES) for (const side of [1, -1]) for (const dc of doorCentres(w)) {
      for (let k = 0; k < 6; k++) {
        const [x, z] = whToWorld(w, dc - DOORS.hw + 0.3 + k * 0.9, side * (w.width / 2 + 2.4));
        if (onApron(x, z, 1)) W.rect(x, z, 0.5, 2.8, w.yaw, { x: 0, y: 6, w: 64, h: 52 });
      }
    }
    const yMat = paintMat("#f2c230", atlas, "apron-paint-yellow"), wMat = paintMat("#f4f2ea", atlas, "apron-paint-white");
    await ctx.yield();
    const paintGroup = new THREE.Group(); paintGroup.name = "apron-paint";
    for (const [pp, mm] of [[Y, yMat], [W, wMat]] as const) {
      const mesh = new THREE.Mesh(pp.build(), mm);
      mesh.receiveShadow = true; mesh.castShadow = false; mesh.userData.castShadow = false; mesh.renderOrder = 1; mesh.name = mm.name;
      paintGroup.add(mesh);
    }
    group.add(paintGroup);
    lod.add(paintGroup, { show: 700 });

    // ---- the lay-down yard is gravel over the old slab, the chassis park has painted bays
    {
      const [el, c] = canvas(512, 512);
      c.fillStyle = "#a39a8c"; c.fillRect(0, 0, 512, 512);
      const rr = rng(516);
      for (let i = 0; i < 9000; i++) { const v = 110 + rr() * 90; c.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`; c.beginPath(); c.arc(rr() * 512, rr() * 512, 1 + rr() * 3, 0, Math.PI * 2); c.fill(); }
      paintNoise(c, 0, 0, 512, 512, { seed: 517, scale: 400, alpha: 0.35, blend: "overlay" });
      splotches(c, 0, 0, 512, 512, { n: 20, rMin: 30, rMax: 90, color: "rgba(90,78,62,1)", alpha: 0.25, seed: 518 });
      const gm = new THREE.MeshStandardMaterial({ map: tex(el, { aniso: 8 }), roughness: 0.97, name: "laydown-gravel", polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5 });
      gm.map!.repeat.set(1, 1);
      const L = LAYDOWN, g = new THREE.PlaneGeometry(L.x1 - L.x0 - 2, L.z1 - L.z0 - 2).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute, pp = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (pp.getX(k) + L.x0) / 5, -(pp.getZ(k) + L.z0) / 5);
      const gravel = new THREE.Mesh(g, gm);
      gravel.position.set((L.x0 + L.x1) / 2, APRON_Y + 0.006, (L.z0 + L.z1) / 2);
      gravel.name = "laydown-gravel"; gravel.receiveShadow = true; gravel.userData.castShadow = false;
      group.add(gravel);
      lod.add(gravel, { show: 700 });
    }
    void splotches;
  },
};
