// PEEL HARBOR — the moored BANANA CO. container feeder (black hull with a white sheer line, red boot-top +
// red bulbous bow, anchor pockets, white aft superstructure with window bands + bridge wings, white funnel with a red
// band + black top, bow mast, forecastle machinery, deck stacks behind lashing bridges, railings, mooring lines).
// Hull = lofted half-breadth function H(z, y) (raked stem, bow flare, round bilge, transom). Layout: SHIP in
// shared/pois/peel-harbor.ts (bow → +Z). Deck containers come from SHIP_CONTAINERS via the harbor container kit.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { APRON_Y, BOW_Z as BOW0, GANGWAYS, PROPS, SEA_LADDERS, SHIP, SHIP_BAYS, SHIP_DECK_H, SHIP_HATCH_H, shipHatch, shipHousePieces, shipLevels } from "../../../../../shared/pois/peel-harbor";
import { drawPieces, roomMats } from "../_kit/harbor-rooms";
import { Builder, type V3, c1Caster, mergeCasters } from "../_kit/harbor-geo";
import { harborTex, paint, weather, type HarborMats } from "../_kit/harbor-materials";
const hatchMat = () => paint("#4a5d52", { rough: 0.6, name: "hatch" });
import { canvas, rng, stencilText, streaks, tex } from "../_kit/harbor-paint";
import { foam, type Part } from "./parts";

const S = SHIP;
/** small solid-colour parts merged into one palette draw (Builder palette) */
const SMALL_MATS = /^(darkPaint|steel|galv|rubber|cable|rope|windowDark|warnLight|lampLens|redPaint|bluePaint|greenPaint|hatch|cone-orange|fender-yellow|yellowPaint|blackHull|bootRed|paint-.*)$/;
const HALF = S.beam / 2;
const STERN_Z = S.z - S.length / 2, BOW_Z = S.z + S.length / 2;
const FC_TOP = S.forecastle.top;

/** stem (bow end) z at height y — raked forward toward the deck */
const stemZ = (y: number) => BOW_Z - (1 - (y - S.keelY) / (FC_TOP - S.keelY)) ** 1.3 * 9;
/** transom (stern end) z at height y — slight overhang */
const sternZ = (y: number) => STERN_Z + Math.max(0, 1.2 - y) * 0.9;

/** the bulbous bow, LOFTED into the stem (never a separate floating red ellipsoid): an ellipsoid whose
 *  half-breadth is smooth-maxed with the hull's, and whose nose extends the stem line forward over its height */
// (high + fat — its crown breaks the water as a rounded red nub)
const BULB = { y: S.keelY + 3.7, ry: 2.35, zc: BOW_Z - 6.9, rz: 5.4, rx: 2.45 };
const bulbHalf = (z: number, y: number) => { const dy = (y - BULB.y) / BULB.ry, dz = (z - BULB.zc) / BULB.rz, q = 1 - dy * dy - dz * dz; return q > 0 ? BULB.rx * Math.sqrt(q) : 0; };
/** the forward end of the hull at height y: the raked stem, or the bulb's nose where it is further forward */
const noseZ = (y: number) => { const dy = (y - BULB.y) / BULB.ry; return Math.max(stemZ(y), Math.abs(dy) < 1 ? BULB.zc + BULB.rz * Math.sqrt(1 - dy * dy) - 0.02 : -Infinity); };
function hullHalf(z: number, y: number): number {
  const zs = sternZ(y), zb = stemZ(y);
  if (z < zs - 1e-4 || z > zb + 1e-4) return 0;
  const u = Math.max(0, Math.min(1, (y - S.keelY) / (S.deckY - S.keelY)));
  const tb = Math.min(1, (zb - z) / 34), ts = Math.min(1, (z - zs) / 16);
  const fb = 1 - (1 - tb) ** 2.1;
  const fs = 0.8 + 0.2 * (1 - (1 - ts) ** 2);
  const bilge = u < 0.2 ? Math.sqrt(Math.max(0, 1 - ((0.2 - u) / 0.2) ** 2)) : 1;
  const e = (1 - tb) ** 1.6;                         // 1 at the stem → V sections
  const vsec = Math.min(1, (u / 0.95) ** 0.75);
  let s = bilge * (1 - e) + vsec * e;
  // bow flare above the waterline: a smooth S from the waterline to the deck (a kinked linear ramp shows facets)
  const fl = Math.max(0, Math.min(1, (y - 0.5) / (S.deckY - 0.5)));
  // (0.26 over the forward third: the bow flares out above the waterline)
  const ef = (1 - Math.min(1, (zb - z) / 44)) ** 1.2;
  s *= 1 + 0.26 * ef * fl * fl * (3 - 2 * fl);
  const es = (1 - ts) ** 2;                          // stern: fuller underbody cut away toward the keel
  s *= 1 - es * 0.55 * (1 - u) ** 2;
  return HALF * Math.min(fb, fs) * Math.max(0, s);
}
/** half-breadth of the hull at (z, y) (with the bulb blended in by a smooth max) */
export function halfBreadth(z: number, y: number): number {
  const a = hullHalf(z, y), b = z > BOW_Z - 14 ? bulbHalf(z, y) : 0;
  if (b <= 0) return a;
  if (a <= 0) return b;
  const k = 0.9, h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** the hull shell as three material bands (boot-top red, black topsides, white sheer strip) + deck + transom */
function hullGeometry(b: Builder, m: HarborMats) {
  const rows = [S.keelY, S.keelY + 0.25, S.keelY + 0.6, S.keelY + 0.95, S.keelY + 1.3, S.keelY + 1.7, S.keelY + 2.1, S.keelY + 2.5, S.keelY + 2.9, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.25, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0, 6.8, 7.6, S.deckY - 0.8, S.deckY - 0.42, S.deckY - 0.05, S.deckY];
  const N = 150;
  const ts = [...Array(N + 1)].map((_, i) => { const t = i / N; return t < 0.5 ? 0.5 * (2 * t) ** 1.25 : 1 - 0.5 * (2 - 2 * t) ** 1.6; });
  const pt = (ri: number, i: number, side: 1 | -1): V3 => {
    const y = rows[ri], z = sternZ(y) + (noseZ(y) - sternZ(y)) * ts[i];
    return [S.x + side * halfBreadth(z, y), y, z];
  };
  // a LOADED ship — the red boot-top ends 1.25 m
  // above the waterline (≈ 13 % of the freeboard), a tall black topside, a 0.8 m white sheer stripe along the deck edge
  const band = (y0: number, y1: number): THREE.Material => (y1 <= 1.3 ? bootTop(m) : y0 >= S.deckY - 0.85 ? m.whitePaint : hullPlates());
  const geos = new Map<THREE.Material, number[]>();
  const push = (mat: THREE.Material, ...p: V3[]) => { const a = geos.get(mat) ?? geos.set(mat, []).get(mat)!; for (const q of p) a.push(...q); };
  for (let ri = 0; ri < rows.length - 1; ri++) {
    const mat = band(rows[ri], rows[ri + 1]);
    for (let i = 0; i < N; i++) for (const side of [1, -1] as const) {
      const a = pt(ri, i, side), c = pt(ri, i + 1, side), d = pt(ri + 1, i + 1, side), e = pt(ri + 1, i, side);
      if (side < 0) { push(mat, a, c, d); push(mat, a, d, e); } else { push(mat, a, d, c); push(mat, a, e, d); }
    }
  }
  for (const [mat, pos] of geos) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // smooth the shading across the hull: rebuild as indexed via mergeVertices-like pass (cheap: average by position)
    smoothNormals(g);
    b.add(mat, g, undefined, true, 1);
  }
  // transom (flat stern face): fan between the two sides of station 0
  const tr: number[] = [];
  for (let ri = 0; ri < rows.length - 1; ri++) {
    const aL = pt(ri, 0, -1), aR = pt(ri, 0, 1), bL = pt(ri + 1, 0, -1), bR = pt(ri + 1, 0, 1);
    tr.push(...aL, ...bR, ...aR, ...aL, ...bL, ...bR);
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.Float32BufferAttribute(tr, 3)); tg.computeVertexNormals();
  b.add(hullPlates(), tg);
  // main deck (flat) from the transom to the forecastle break
  const dk: number[] = [];
  const dz = (i: number) => sternZ(S.deckY) + (stemZ(S.deckY) - sternZ(S.deckY)) * ts[i];
  for (let i = 0; i < N; i++) {
    const z0 = dz(i), z1 = dz(i + 1), h0 = halfBreadth(z0, S.deckY) - 0.02, h1 = halfBreadth(z1, S.deckY) - 0.02;
    dk.push(S.x - h0, S.deckY, z0, S.x - h1, S.deckY, z1, S.x + h1, S.deckY, z1, S.x - h0, S.deckY, z0, S.x + h1, S.deckY, z1, S.x + h0, S.deckY, z0);
  }
  const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.Float32BufferAttribute(dk, 3)); dg.computeVertexNormals();
  b.add(m.deck, dg);
}

/** average normals of coincident vertices (non-indexed soup) so the lofted hull shades smoothly */
function smoothNormals(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
  const key = (i: number) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  const acc = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) { const k = key(i); const a = acc.get(k) ?? acc.set(k, [0, 0, 0]).get(k)!; a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); }
  for (let i = 0; i < pos.count; i++) { const a = acc.get(key(i))!; const l = Math.hypot(a[0], a[1], a[2]) || 1; nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
}

/** forecastle bulwark (raised bow) following the deck-edge plan from z0 to the stem, up to FC_TOP */
function forecastle(b: Builder, m: HarborMats) {
  const z0 = S.forecastle.z0 - 4, z1 = stemZ(S.deckY);
  const n = 26, pos: number[] = [], white: number[] = [];
  const edge = (t: number, side: number): V3 => { const z = z0 + (z1 - z0) * t; return [S.x + side * halfBreadth(z, S.deckY), 0, z]; };
  // rise: from deck at z0 to FC_TOP at z0+4 (a sheer step), then level
  const top = (z: number) => S.deckY + (FC_TOP - S.deckY) * Math.min(1, Math.max(0, (z - z0) / 4));
  for (let i = 0; i < n; i++) for (const side of [1, -1]) {
    const a = edge(i / n, side), c = edge((i + 1) / n, side);
    const ya = top(a[2]), yc = top(c[2]);
    const q = (arr: number[], y0a: number, y1a: number, y0c: number, y1c: number) => {
      const A: V3 = [a[0], y0a, a[2]], Cc: V3 = [c[0], y0c, c[2]], D: V3 = [c[0], y1c, c[2]], E: V3 = [a[0], y1a, a[2]];
      if (side < 0) arr.push(...A, ...Cc, ...D, ...A, ...D, ...E); else arr.push(...A, ...D, ...Cc, ...A, ...E, ...D);
    };
    q(pos, S.deckY - 0.05, ya - 0.4, S.deckY - 0.05, yc - 0.4);
    q(white, ya - 0.4, ya, yc - 0.4, yc);
  }
  for (const [mat, arr] of [[m.blackHull, pos], [m.whitePaint, white]] as const) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
    b.add(mat, g);
  }
  // inner face of the bulwark + forecastle deck (red)
  const deck: number[] = [];
  for (let i = 0; i < n; i++) {
    const za = z0 + 4 + (z1 - z0 - 4) * (i / n), zc = z0 + 4 + (z1 - z0 - 4) * ((i + 1) / n);
    const ha = halfBreadth(za, S.deckY) - 0.3, hc = halfBreadth(zc, S.deckY) - 0.3;
    deck.push(S.x - ha, FC_TOP - 1.2, za, S.x - hc, FC_TOP - 1.2, zc, S.x + hc, FC_TOP - 1.2, zc, S.x - ha, FC_TOP - 1.2, za, S.x + hc, FC_TOP - 1.2, zc, S.x + ha, FC_TOP - 1.2, za);
  }
  const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.Float32BufferAttribute(deck, 3)); dg.computeVertexNormals();
  b.add(m.deck, dg);
  // forecastle front wall (aft face, facing the bays)
  b.box(m.whitePaint, [S.x, (S.deckY + FC_TOP - 1.2) / 2, z0 + 4], [2 * halfBreadth(z0 + 4, S.deckY) - 0.4, FC_TOP - 1.2 - S.deckY, 0.3]);
  // breakwater (V wall) + windlass + bollards + bow mast
  const fy = FC_TOP - 1.2;
  for (const sd of [-1, 1]) b.beam(m.whitePaint, [S.x + sd * 7, fy + 0.8, z0 + 7], [S.x, fy + 0.8, z0 + 10], 0.25, 1.6);
  for (const sd of [-1, 1]) {
    b.cyl(m.redPaint, [S.x + sd * 1.2, fy + 0.9, BOW0 - 8], [S.x + sd * 3.2, fy + 0.9, BOW0 - 8], 0.7, 16);
    b.cyl(m.darkPaint, [S.x + sd * 0.4, fy + 0.9, BOW0 - 8], [S.x + sd * 3.6, fy + 0.9, BOW0 - 8], 0.25, 10);
    b.box(m.redPaint, [S.x + sd * 2.2, fy + 0.4, BOW0 - 8], [2.6, 0.8, 2.2], { bevel: 0.1 });
    for (const bz of [BOW0 - 11.5, BOW0 - 4]) for (const bx of [0, 0.7]) b.cyl(m.darkPaint, [S.x + sd * (6 + bx), fy, bz], [S.x + sd * (6 + bx), fy + 0.8, bz], 0.28, 10);
    // anchor chain runs to the hawse pipes
    b.tube(m.steel, [[S.x + sd * 2.2, fy + 1.2, BOW0 - 8], [S.x + sd * 4.5, fy + 0.3, BOW0 - 5], [S.x + sd * 6.5, fy + 0.2, BOW0 - 2.5]], 0.12, 6);
  }
  b.cyl(m.whitePaint, [S.x, fy, BOW0 - 4], [S.x, fy + 9.5, BOW0 - 4], 0.28, 10, { r1: 0.16 });
  b.box(m.whitePaint, [S.x, fy + 7.4, BOW0 - 4], [3.2, 0.16, 0.16]);
  b.cyl(m.lampLens, [S.x, fy + 9.5, BOW0 - 4], [S.x, fy + 9.8, BOW0 - 4], 0.14, 8);
  // railing around the forecastle top
  const rail: V3[] = [];
  for (let i = 0; i <= 12; i++) { const z = z0 + 4 + (z1 - z0 - 4.5) * (i / 12); rail.push([S.x + halfBreadth(z, S.deckY) - 0.15, FC_TOP, z]); }
  for (let i = 12; i >= 0; i--) { const z = z0 + 4 + (z1 - z0 - 4.5) * (i / 12); rail.push([S.x - halfBreadth(z, S.deckY) + 0.15, FC_TOP, z]); }
  railing(b, m, rail, 1.0, 1.5);
}

function railing(b: Builder, m: HarborMats, pts: V3[], h = 1.05, post = 1.5, mat?: THREE.Material) {
  const R = mat ?? m.galv;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1], len = Math.hypot(c[0] - a[0], c[2] - a[2]), n = Math.max(1, Math.round(len / post));
    for (let k = 0; k < n; k++) { const t = k / n; b.cyl(R, [a[0] + (c[0] - a[0]) * t, a[1], a[2] + (c[2] - a[2]) * t], [a[0] + (c[0] - a[0]) * t, a[1] + h, a[2] + (c[2] - a[2]) * t], 0.03, 5, { caps: false }); }
  }
  for (const hh of [h, h * 0.55]) b.rail(R, pts.map((p) => [p[0], p[1] + hh, p[2]] as V3), 0.03, 5);
}

// ------------------------------------------------------------------------------------------------ bridge consoles
/** glowing nav-screen atlas (4 tiles: radar, ECDIS chart, engine / alarm panel, CCTV of the deck) */
let navMat: THREE.MeshStandardMaterial | null = null;
function navScreens(): THREE.MeshStandardMaterial {
  if (navMat) return navMat;
  const [el, c] = canvas(512, 128), r = rng(4242);
  const tile = (i: number, f: (x: number) => void) => { c.save(); c.translate(i * 128, 0); c.beginPath(); c.rect(0, 0, 128, 128); c.clip(); f(0); c.restore(); };
  tile(0, () => { // radar: rings, a sweep, blips, the heading line
    c.fillStyle = "#04140a"; c.fillRect(0, 0, 128, 128);
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 60); g.addColorStop(0, "#0c3a1c"); g.addColorStop(1, "#03140a"); c.fillStyle = g; c.beginPath(); c.arc(64, 64, 58, 0, 7); c.fill();
    c.strokeStyle = "rgba(90,255,140,0.45)"; c.lineWidth = 1; for (const rr of [16, 32, 48, 58]) { c.beginPath(); c.arc(64, 64, rr, 0, 7); c.stroke(); }
    c.fillStyle = "rgba(90,255,140,0.35)"; c.beginPath(); c.moveTo(64, 64); c.arc(64, 64, 58, -1.2, -0.6); c.fill();
    c.strokeStyle = "#8dffb0"; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 6); c.stroke();
    c.fillStyle = "#d8ffe0"; for (let k = 0; k < 14; k++) { const a = r() * 6.28, d = 10 + r() * 46; c.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + r() * 3, 2); }
  });
  tile(1, () => { // ECDIS: sea shades, yellow coast, the planned track
    c.fillStyle = "#1f5d8f"; c.fillRect(0, 0, 128, 128); c.fillStyle = "#2f7cb8"; c.fillRect(0, 40, 128, 88);
    c.fillStyle = "#e3c25a"; c.beginPath(); c.moveTo(0, 0); c.lineTo(70, 0); c.bezierCurveTo(60, 20, 30, 30, 0, 52); c.fill();
    c.strokeStyle = "#ff5a3c"; c.lineWidth = 2; c.beginPath(); c.moveTo(10, 120); c.lineTo(60, 80); c.lineTo(110, 60); c.stroke();
    c.fillStyle = "#ffffff"; for (let k = 0; k < 6; k++) c.fillRect(20 + k * 17, 90 - k * 5, 2, 2);
    c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(0, 112, 128, 16); c.fillStyle = "#9fe3ff"; c.font = "10px monospace"; c.fillText("SOG 0.0 kn  HDG 274", 4, 124);
  });
  tile(2, () => { // engine / alarm panel: bar gauges + a few lit indicators
    c.fillStyle = "#121a22"; c.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 6; k++) { const h = 20 + r() * 70; c.fillStyle = "#1e2c38"; c.fillRect(8 + k * 20, 20, 12, 90); c.fillStyle = k === 4 ? "#ffb347" : "#4fd1ff"; c.fillRect(8 + k * 20, 110 - h, 12, h); }
    for (let k = 0; k < 6; k++) { c.fillStyle = k === 2 ? "#ff4d3a" : "#5bff8a"; c.beginPath(); c.arc(14 + k * 20, 10, 3, 0, 7); c.fill(); }
  });
  tile(3, () => { // CCTV of the cargo deck: grey stacks, a banana-yellow box, a timestamp
    c.fillStyle = "#5c6166"; c.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 7; k++) { c.fillStyle = ["#8a8f94", "#c9a12a", "#6c7a64", "#9b4a3a"][k % 4]; c.fillRect(6 + k * 17, 50 - (k % 3) * 12, 15, 70 + (k % 3) * 12); }
    c.fillStyle = "rgba(255,255,255,0.08)"; for (let y = 0; y < 128; y += 3) c.fillRect(0, y, 128, 1);
    c.fillStyle = "#e8e8e8"; c.font = "9px monospace"; c.fillText("CAM 03  DECK", 4, 12);
  });
  const t = tex(el, { repeat: false });
  navMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 1.1, roughness: 0.25, metalness: 0, name: "ship-nav-screens" });
  return navMat;
}
/** a modelled bridge console in the box of a shared "console" piece (harbor-local; its long axis along x, the operator
 *  side toward −z = aft): a steel cabinet with a sloped desk carrying two nav screens, rows of lit push-buttons, twin
 *  throttle levers (port red / starboard green) or the helm (a small chrome wheel + autopilot dial) on the middle pair */
function bridgeConsole(b: Builder, m: HarborMats, p: { c: [number, number, number]; h: [number, number, number] }, k: number) {
  const [cx, cy, cz] = p.c, [hx, hy, hz] = p.h, y0 = cy - hy, y1 = cy + hy, x0 = cx - hx, x1 = cx + hx, zf = cz - hz, zb = cz + hz;
  const grey = paint("#4a535b", { rough: 0.45, grime: 0.15, name: "paint-console-grey" }), D = m.darkPaint, scr = navScreens();
  b.box(grey, [cx, y0 + 0.4, cz + 0.05], [2 * hx - 0.02, 0.8, 2 * hz - 0.1], { bevel: 0.03 });
  b.box(D, [cx, y0 + 0.05, cz + 0.08], [2 * hx - 0.1, 0.1, 2 * hz - 0.2]);
  // sloped desk: front lip at 0.82, back edge at y1 (tilted ~12°)
  const slope = Math.atan2(y1 - (y0 + 0.82), 2 * hz - 0.1);
  b.box(grey, [cx, (y0 + 0.82 + y1) / 2 - 0.02, cz], [2 * hx, 0.05, 2 * hz / Math.cos(slope)], { rotX: -slope, bevel: 0.015 });
  b.box(D, [cx, y0 + 0.8, zf + 0.03], [2 * hx, 0.06, 0.06], { bevel: 0.02 });
  const sy = (y0 + 0.82 + y1) / 2 + 0.008;
  const n = 2;
  for (let i = 0; i < n; i++) {
    const sxc = x0 + (2 * hx) * ((i + 0.5) / n), tileI = (k * 2 + i) % 4;
    const g = new THREE.PlaneGeometry(0.62, 0.42);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let v = 0; v < uv.count; v++) uv.setX(v, (tileI + uv.getX(v)) / 4);
    b.addRaw(scr, g, new THREE.Matrix4().makeTranslation(sxc, sy + 0.01, cz + 0.12).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 - slope)));
    b.box(D, [sxc, sy, cz + 0.12], [0.7, 0.02, 0.5]);
  }
  // push-button rows along the front of the slope (lit: amber / green / red)
  for (let j = 0; j < 10; j++) b.box(j % 3 === 0 ? m.warnLight : j % 3 === 1 ? m.lampLens : paint("#4fe07a", { rough: 0.3, name: "paint-btn-green" }), [x0 + 0.15 + j * ((2 * hx - 0.3) / 9), y0 + 0.86, zf + 0.14], [0.05, 0.025, 0.05]);
  if (k === 1 || k === 2) {
    // the helm (middle pair): a small chrome wheel on a column + the autopilot dial
    const hxw = k === 1 ? x1 - 0.25 : x0 + 0.25;
    b.cyl(m.steel, [hxw, y0 + 0.82, zf + 0.25], [hxw, y0 + 1.05, zf + 0.08], 0.04, 8);
    b.add(m.galv, new THREE.TorusGeometry(0.2, 0.022, 6, 24), new THREE.Matrix4().makeTranslation(hxw, y0 + 1.07, zf + 0.06).multiply(new THREE.Matrix4().makeRotationX(0.5)));
    for (let a = 0; a < 3; a++) { const an = (a / 3) * Math.PI * 2; b.cyl(m.galv, [hxw, y0 + 1.07, zf + 0.06], [hxw + Math.cos(an) * 0.19, y0 + 1.07 + Math.sin(an) * 0.17, zf + 0.06 - Math.sin(an) * 0.09], 0.012, 4, { caps: false }); }
    b.cyl(D, [cx, y0 + 0.9, zf + 0.3], [cx, y0 + 0.93, zf + 0.3], 0.1, 16);
  } else {
    // twin throttles (telegraph levers)
    for (const [dx, col] of [[-0.12, m.redPaint], [0.12, paint("#2f9a4a", { rough: 0.4, name: "paint-stbd-green" })]] as Array<[number, THREE.Material]>) {
      const tx = cx + dx;
      b.box(D, [tx, y0 + 0.86, zf + 0.3], [0.08, 0.05, 0.3]);
      b.cyl(m.steel, [tx, y0 + 0.88, zf + 0.3], [tx, y0 + 1.08, zf + 0.22], 0.015, 6);
      b.add(col, new THREE.SphereGeometry(0.04, 10, 8), new THREE.Matrix4().makeTranslation(tx, y0 + 1.1, zf + 0.21));
    }
  }
  void zb;
}

/** a ship room's island (harbor-local axis-aligned box): a back-to-back bank of grey-blue crew lockers (louvred
 *  doors + handles + name cards on both long faces, a hard hat and a kit bag on top) or the mess's serving counter
 *  (white steel cabinets, a stainless top, a kick plate, trays and a tea urn) */
function shipIslandInto(b: Builder, m: HarborMats, p: { c: [number, number, number]; h: [number, number, number]; kind?: string }, k: number) {
  const [cx, cy, cz] = p.c, [hx, hy, hz] = p.h, y0 = cy - hy, y1 = cy + hy, alongX = hx >= hz, L = 2 * (alongX ? hx : hz), D = 2 * (alongX ? hz : hx);
  const at = (u: number, y: number, v: number): V3 => (alongX ? [cx + u, y, cz + v] : [cx + v, y, cz + u]);
  const sz = (su: number, sy: number, sv: number): V3 => (alongX ? [su, sy, sv] : [sv, sy, su]);
  const D_ = m.darkPaint;
  if (p.kind === "locker") {
    const body = paint("#6f8796", { rough: 0.45, grime: 0.25, name: "ship-locker" }), n = Math.max(2, Math.round(L / 0.46));
    b.box(body, at(0, y0 + (y1 - y0) / 2 + 0.03, 0), sz(L, y1 - y0 - 0.06, D), { bevel: 0.015 });
    b.box(D_, at(0, y0 + 0.04, 0), sz(L - 0.04, 0.08, D - 0.04));
    for (const sv of [-1, 1]) for (let i = 0; i < n; i++) {
      const u = -L / 2 + (L * (i + 0.5)) / n, w = L / n - 0.03, f = sv * (D / 2 + 0.004);
      b.box(body, at(u, y0 + 0.1 + (y1 - y0 - 0.18) / 2, f), sz(w, y1 - y0 - 0.2, 0.012));
      for (let v = 0; v < 4; v++) b.box(D_, at(u, y1 - 0.25 - v * 0.05, f + sv * 0.007), sz(w * 0.6, 0.018, 0.006));
      b.box(m.galv, at(u + w * 0.32, y0 + 1.05, f + sv * 0.02), sz(0.03, 0.14, 0.03));
      b.box(m.whitePaint, at(u, y1 - 0.48, f + sv * 0.008), sz(0.12, 0.05, 0.004));
    }
    b.box(m.yellowPaint, at(-L / 4, y1 + 0.07, 0), sz(0.3, 0.14, 0.26), { bevel: 0.05 });
    b.box(paint("#2f4a3a", { rough: 0.8, name: "kit-bag" }), at(L / 4, y1 + 0.13, 0.02), sz(0.55, 0.26, 0.3), { bevel: 0.08 });
  } else {
    const body = paint("#e2e3df", { rough: 0.5, grime: 0.3, name: "galley-cabinet" });
    b.box(body, at(0, y0 + (y1 - y0 - 0.05) / 2 + 0.06, 0), sz(L - 0.06, y1 - y0 - 0.11, D - 0.08));
    b.box(D_, at(0, y0 + 0.04, 0), sz(L - 0.14, 0.08, D - 0.16));
    b.box(m.galv, at(0, y1 - 0.025, 0), sz(L, 0.05, D), { bevel: 0.01 });
    for (const sv of [-1, 1]) for (let i = 0; i < 4; i++) { const u = -L / 2 + (L * (i + 0.5)) / 4; b.box(D_, at(u, y0 + 0.5, sv * (D / 2 - 0.035)), sz(0.01, 0.75, 0.006)); b.box(m.galv, at(u + 0.15, y1 - 0.18, sv * (D / 2 - 0.02)), sz(0.14, 0.02, 0.03)); }
    for (let t = 0; t < 3; t++) b.box(paint(["#c96a35", "#3d7fb0", "#d9c45a"][(t + k) % 3], { rough: 0.4, name: "galley-tray" }), at(-L / 3 + t * 0.3, y1 + 0.012, -0.1 + t * 0.05), sz(0.36, 0.02, 0.27));
    b.cyl(m.galv, at(L / 3, y1, 0.05), at(L / 3, y1 + 0.38, 0.05), 0.13, 12);
    b.box(D_, at(L / 3, y1 + 0.4, 0.05), sz(0.08, 0.04, 0.08));
  }
}

function superstructure(b: Builder, m: HarborMats) {
  const H = S.house, W = m.whitePaint;
  const z0 = H.z - H.halfL, z1 = H.z + H.halfL, deckH = 3.25;
  const levels = Math.floor((H.top - S.deckY) / deckH);
  // the house is a real building — hollow decks, windows, doors, stairwell, furniture (shared shipHousePieces =
  // the colliders). Walls/rails in daylight paint, rooms in the indoor set; the stepped-deck lips + rails stay.
  {
    const all = shipHousePieces(), pcs = all.filter((p) => p.kind !== "console" && p.kind !== "locker" && !(p.kind === "cabinet" && p.mat === "cabinet")), outdoorMat = (p: { mat: string }) => /^(hull|rail|glass)$/.test(p.mat);
    drawPieces(b, pcs.filter(outdoorMat), roomMats(m, { steel: "#e8b21c" }));
    drawPieces(b, pcs.filter((p) => !outdoorMat(p)), roomMats(m, { indoor: true, ibl: 0.28, steel: "#9aa0a4" }));
    // the bridge consoles are modelled (screens, buttons, throttles, the helm), not dark boxes
    all.filter((p) => p.kind === "console").sort((a, q) => a.c[0] - q.c[0]).forEach((p, k) => bridgeConsole(b, m, p, k));
    // the room islands — back-to-back crew lockers / the mess's serving counter (shared shipIsland = the colliders)
    all.filter((p) => p.kind === "locker" || (p.kind === "cabinet" && p.mat === "cabinet")).forEach((p, k) => shipIslandInto(b, m, p, k));
  }
  for (let l = 0; l < levels; l++) {
    const y0 = S.deckY + l * deckH, y1 = y0 + deckH;
    const bridge = l === levels - 1;
    const hw = bridge ? H.halfW - 0.6 : H.halfW - (l === 0 ? 0 : 0.6 + (l > 2 ? 0.7 : 0));
    const zb0 = z0 + (l > 1 ? 1.2 : 0), zb1 = z1 - l * 1.1;
    b.box(W, [S.x, y1 - 0.08, (zb0 + zb1) / 2 + 0.3], [2 * hw + 0.6, 0.16, zb1 - zb0 + 1.2]);
    if (!bridge) {
      railing(b, m, [[S.x - hw - 0.35, y1, zb1 + 0.5], [S.x + hw + 0.35, y1, zb1 + 0.5]], 1.0, 1.4, m.whitePaint);
      for (const sd of [-1, 1]) railing(b, m, [[S.x + sd * (hw + 0.35), y1, zb0], [S.x + sd * (hw + 0.35), y1, zb1 + 0.5]], 1.0, 1.4, m.whitePaint);
    }
  }
  // the wheelhouse roof's railing (the stairwell tops out there; colliders: shared shipHouseRails) — round the
  // roof and out along the bridge wings (house-local x along the ship, z across → harbor [S.x − z, y, H.z + x])
  { const Lv = shipLevels(), vb = Lv[Lv.length - 1], y = S.deckY + vb.y0 + SHIP_DECK_H, hw = vb.hw - 0.1, ww = S.beam / 2 - 0.25, wx = vb.xb - 2.8, xa = vb.xa + 0.1, xb = vb.xb - 0.1;
    const P = (hx: number, hz: number): V3 => [S.x - hz, y, H.z + hx];
    railing(b, m, [P(wx, -ww), P(xb, -ww), P(xb, ww), P(wx, ww)], 1.0, 1.4, m.whitePaint);
    for (const sd of [-1, 1]) railing(b, m, [P(wx, sd * ww), P(wx, sd * hw), P(xa, sd * hw)], 1.0, 1.4, m.whitePaint);
    railing(b, m, [P(xa, -hw), P(xa, hw)], 1.0, 1.4, m.whitePaint); }
  // wheelhouse roof + mast with radar + antennas
  const roofY = S.deckY + levels * deckH;
  // the radar mast: a tripod of white tubes up to a platform (radar scanners on pedestals), a signal yard, a pole
  // mast above with the masthead light, antennas + a whip on the wings
  const mz = H.z - 1, py = roofY + 4.2;
  for (const [ax, az] of [[-1.6, -1.2], [1.6, -1.2], [0, 1.4]] as Array<[number, number]>) b.cyl(W, [S.x + ax, roofY, mz + az], [S.x + ax * 0.25, py, mz + az * 0.25], 0.14, 8);
  b.box(W, [S.x, py, mz], [3.2, 0.14, 2.2], { bevel: 0.04 });
  railing(b, m, [[S.x - 1.6, py, mz - 1.1], [S.x + 1.6, py, mz - 1.1], [S.x + 1.6, py, mz + 1.1], [S.x - 1.6, py, mz + 1.1], [S.x - 1.6, py, mz - 1.1]], 0.8, 0.8, W);
  for (const [rx, rl] of [[-0.9, 3.6], [1.0, 2.6]] as Array<[number, number]>) { b.cyl(m.darkPaint, [S.x + rx, py, mz], [S.x + rx, py + 0.6, mz], 0.18, 8); b.box(m.darkPaint, [S.x + rx, py + 0.72, mz], [rl, 0.18, 0.35], { bevel: 0.05, rotY: rx > 0 ? 0.6 : -0.2 }); }
  b.cyl(W, [S.x, py, mz + 0.4], [S.x, py + 6.2, mz + 0.4], 0.16, 10, { r1: 0.08 });
  b.box(W, [S.x, py + 3.6, mz + 0.4], [4.4, 0.14, 0.14]);
  for (const sd of [-1, 1]) b.cyl(m.cable, [S.x + sd * 2.2, py + 3.6, mz + 0.4], [S.x + sd * 1.4, roofY + 0.2, mz - 2], 0.015, 4, { caps: false });
  b.cyl(m.warnLight, [S.x, py + 6.2, mz + 0.4], [S.x, py + 6.5, mz + 0.4], 0.12, 8);
  for (const ax of [-2.6, 2.6]) b.cyl(m.galv, [S.x + ax, roofY, H.z + 2], [S.x + ax, roofY + 3.2, H.z + 2], 0.04, 5);
  // funnel (aft of the house): oval casing, white with a red band + black top
  const fz = z0 - 2.2, fy0 = S.deckY + 3.25 * 3, fy1 = H.funnelTop;
  const funnel = (y0: number, y1: number, mat: THREE.Material, scale = 1) => b.lathe(mat, [[2.3 * scale, 0], [2.2 * scale, (y1 - y0) * 0.5], [2.05 * scale, y1 - y0]], 20, new THREE.Matrix4().makeTranslation(S.x, y0, fz).multiply(new THREE.Matrix4().makeScale(1.3, 1, 1)));
  funnel(fy0, fy1 - 3.4, W);
  funnel(fy1 - 3.4, fy1 - 1.4, m.bootRed, 0.93);
  funnel(fy1 - 1.4, fy1, m.darkPaint, 0.89);
  b.cyl(m.darkPaint, [S.x - 0.8, fy1, fz], [S.x - 0.8, fy1 + 0.8, fz], 0.35, 10);
  b.cyl(m.darkPaint, [S.x + 0.8, fy1, fz], [S.x + 0.8, fy1 + 0.6, fz], 0.28, 10);
  // lifeboats on davits (orange) each side of the house
  const orange = m.redPaint;
  for (const sd of [-1, 1]) {
    const lx = S.x + sd * (H.halfW + 0.9), ly = S.deckY + 3.25 * 2 + 0.3;
    b.lathe(orange, [[0, -3.2], [0.8, -2.6], [1.05, -1], [1.1, 0], [1.05, 1], [0.8, 2.6], [0, 3.2]], 14, new THREE.Matrix4().makeTranslation(lx, ly + 0.9, H.z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 1, 0.8)));
    b.box(W, [lx, ly + 1.75, H.z], [1.9, 0.4, 5.4], { bevel: 0.15 });
    for (const dz of [-2.4, 2.4]) b.beam(m.galv, [S.x + sd * H.halfW, ly - 0.5, H.z + dz], [lx, ly + 2.4, H.z + dz], 0.2, 0.2);
  }
  // stern mooring deck: winches + bollards + fairleads
  for (const sd of [-1, 1]) {
    b.cyl(m.redPaint, [S.x + sd * 2, S.deckY + 0.8, STERN_Z + 5], [S.x + sd * 4, S.deckY + 0.8, STERN_Z + 5], 0.6, 14);
    for (const bz of [STERN_Z + 2.5, STERN_Z + 8]) b.cyl(m.darkPaint, [S.x + sd * 8, S.deckY, bz], [S.x + sd * 8, S.deckY + 0.8, bz], 0.28, 10);
  }
}

function deckFittings(b: Builder, m: HarborMats) {
  // one hatch cover per designed bay (SHIP_BAYS / shipHatch = the colliders: 0.5 m, a step). No lashing bridges:
  // 6 m posts + a walkway at 14.9 m with no collider would be scenery you walk through.
  for (const bz of SHIP_BAYS) {
    const h = shipHatch(bz);
    b.box(hatchMat(), [S.x, S.deckY + SHIP_HATCH_H / 2, bz], [2 * h.hw, SHIP_HATCH_H, 2 * h.hl], { bevel: 0.06 });
    // the panel joints + the coaming lip (reads as steel hatch panels, not a slab)
    for (const dz of [-h.hl / 2, 0, h.hl / 2]) b.box(m.darkPaint, [S.x, S.deckY + SHIP_HATCH_H + 0.005, bz + dz], [2 * h.hw - 0.2, 0.02, 0.08]);
    b.box(m.darkPaint, [S.x, S.deckY + SHIP_HATCH_H + 0.005, bz], [0.08, 0.02, 2 * h.hl - 0.2]);
  }
  // side railings on the main deck, open where the gangways (port, toward the quay) and the sea ladders (starboard) arrive
  const gaps = (sd: number) => (sd < 0 ? GANGWAYS.map((g) => [g.b[2] - 6.2, g.b[2] + 1.9]) : SEA_LADDERS.map((l) => [l.zTop - 1.5, l.zTop + 1.5]));
  for (const sd of [-1, 1]) {
    let pts: V3[] = [];
    const flush = () => { if (pts.length > 1) railing(b, m, pts, 1.05, 1.6); pts = []; };
    for (let z = S.house.z + S.house.halfL + 0.5; z <= S.forecastle.z0 - 0.4; z += 2) {
      const g = gaps(sd).find(([a, c]) => z > a && z < c);
      if (g) { flush(); continue; }
      pts.push([S.x + sd * (halfBreadth(z, S.deckY) - 0.12), S.deckY, z]);
    }
    flush();
  }
  // stern railing around the poop
  const sp: V3[] = [];
  for (let z = S.house.z - S.house.halfL; z >= STERN_Z + 0.4; z -= 2.5) sp.push([S.x + halfBreadth(z, S.deckY) - 0.12, S.deckY, z]);
  sp.push([S.x - halfBreadth(STERN_Z + 0.4, S.deckY) + 0.12, S.deckY, STERN_Z + 0.4]);
  for (let z = STERN_Z + 2.9; z <= S.house.z - S.house.halfL; z += 2.5) sp.push([S.x - halfBreadth(z, S.deckY) + 0.12, S.deckY, z]);
  railing(b, m, sp, 1.05, 1.5);
  // anchor pockets (hawse) both sides + anchors
  for (const sd of [-1, 1]) {
    const z = BOW0 - 7, y = S.deckY - 1.4, x = S.x + sd * (halfBreadth(z, y) + 0.02);
    // recessed pocket (dark) + stockless anchor: shank, crown, two flukes, the chain disappearing into the hawse
    b.cyl(m.darkPaint, [x - sd * 0.35, y, z], [x + sd * 0.04, y, z], 1.05, 18);
    b.box(m.steel, [x + sd * 0.14, y - 0.35, z], [0.26, 1.7, 0.34], { bevel: 0.08 });
    b.box(m.steel, [x + sd * 0.16, y - 1.3, z], [0.36, 0.42, 1.2], { bevel: 0.12 });
    for (const f of [-1, 1]) b.box(m.steel, [x + sd * 0.18, y - 0.95, z + f * 0.75], [0.3, 0.9, 0.5], { bevel: 0.1, rotX: f * 0.5 });
    b.cyl(m.steel, [x + sd * 0.14, y + 0.55, z], [x + sd * 0.1, y + 0.95, z], 0.12, 8);
  }
  // (the bulbous bow is part of the lofted hull — halfBreadth / noseZ)
  // portholes along the aft topsides
  for (const sd of [-1, 1]) for (let z = STERN_Z + 6; z < S.house.z + S.house.halfL; z += 2.6) {
    const y = S.deckY - 1.6, x = S.x + sd * (halfBreadth(z, y) + 0.01);
    b.cyl(m.windowDark, [x - sd * 0.05, y, z], [x + sd * 0.04, y, z], 0.22, 10);
  }
}

/** the boot-top: the harbor's red with a dark fouling band just above the waterline (weed + scum where the swell
 *  washes), rust runs from the plate seams + hawse, scuffs from the tugs */
let boot: THREE.MeshStandardMaterial | null = null;
function bootTop(m: HarborMats): THREE.MeshStandardMaterial {
  if (boot) return boot;
  const src = m.bootRed;
  boot = weather(new THREE.MeshStandardMaterial({ color: "#b3361e", roughness: 0.6, metalness: 0.04, normalMap: src.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughnessMap: src.roughnessMap, name: "ship-boot" }), { vary: 0.16, grime: 0.62, grimeY: -0.25, grimeH: 1.1, grimeColor: "#3a4a2c", streak: 0.3, streakColor: "#5a2410" });
  return boot;
}

/** hull plating: a 14 × 9.6 m tile of STAGGERED plates — strakes of 2.0–2.8 m, butts every 3–7 m offset per strake,
 *  each plate a hair different, thin weld beads — sparse uneven rust (a few seams weep, the rest are clean), fender
 *  scuffs along one strake. Colour + normal, metre UVs. */
let plates: THREE.MeshStandardMaterial | null = null;
function hullPlates(): THREE.MeshStandardMaterial {
  if (plates) return plates;
  // (painted in the harbor texture worker — harbor-materials shipHullTile)
  const map = harborTex("shipHull.color", { aniso: 8 }), normalMap = harborTex("shipHull.normal", { srgb: false });
  map.name = "ship-hull-plates"; normalMap.name = "ship-hull-plates-n";
  // world-space weathering: a light touch of long rust runs (0.16, not 0.42 — stronger, they read as evenly spaced "organ pipes")
  plates = weather(new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.46, metalness: 0.12, name: "hull-plates" }), { vary: 0.12, grime: 0, streak: 0.16, streakColor: "#6a3a1e" });
  map.repeat.set(1 / 14, 1 / 9.6); normalMap.repeat.set(1 / 14, 1 / 9.6);
  return plates;
}

/** "THE FEED" painted on both flanks (white, worn) + rust runs from the hawse pipes and the scuppers */
function nameDecals(group: THREE.Group) {
  const [el, c] = canvas(2048, 256);
  stencilText(c, "THE FEED", 1024, 205, { size: 200, color: "#f4f1e8", align: "center", wear: 0.2, seed: 17, letterSpacing: 18 });
  const t = tex(el, { repeat: false, aniso: 16 });
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mat.name = "ship-name";
  const zc = S.z - 18, w = 26, h = 3.25, y = S.deckY - 2.8;
  // rust runs
  const [rel, rc] = canvas(256, 512);
  rc.clearRect(0, 0, 256, 512);
  streaks(rc, 20, 0, 216, 512, { n: 14, color: "rgba(130,64,28,1)", alpha: 0.8, lenMin: 180, lenMax: 500, width: 10, seed: 91, blend: "source-over" });
  const rust = new THREE.MeshStandardMaterial({ map: tex(rel, { repeat: false }), transparent: true, depthWrite: false, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, name: "ship-rust-runs" });
  const names: THREE.BufferGeometry[] = [], rusts: THREE.BufferGeometry[] = [];
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, sd: number) => g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(sd > 0 ? Math.PI / 2 : -Math.PI / 2)));
  for (const sd of [-1, 1]) {
    names.push(place(new THREE.PlaneGeometry(w, h), S.x + sd * (halfBreadth(zc, y) + 0.03), y, zc, sd));
    // hawse (bow) + scupper runs along the sheer
    const runs: Array<[number, number, number, number]> = [[BOW0 - 7, S.deckY - 2.4, 2.4, 7.5], [BOW0 - 5.8, S.deckY - 2.7, 1.2, 5.2], ...[...Array(7)].map((_, i): [number, number, number, number] => [STERN_Z + 14 + i * 15, S.deckY - 1.2, 0.9, 2.6 + (i % 3)])];
    for (const [rz, ry, rw, rh] of runs) rusts.push(place(new THREE.PlaneGeometry(rw, rh), S.x + sd * (halfBreadth(rz, ry - rh / 2) + 0.05), ry - rh / 2, rz, sd));
  }
  // draft marks: white metre ladders at the stem, amidships + the stern on both sides (ticks + small numerals)
  const [del, dc] = canvas(128, 512);
  dc.clearRect(0, 0, 128, 512);
  dc.fillStyle = "#f2f0e8"; dc.font = "bold 40px Helvetica, Arial, sans-serif"; dc.textAlign = "left";
  for (let k = 0; k < 5; k++) { const y = 470 - k * 100; dc.fillText(String(2 + k * 2), 44, y); dc.fillRect(6, y - 30, 30, 8); dc.fillRect(6, y - 80, 18, 6); }
  const dmat = new THREE.MeshStandardMaterial({ map: tex(del, { repeat: false }), transparent: true, alphaTest: 0.4, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, name: "ship-draft" });
  const drafts: THREE.BufferGeometry[] = [];
  for (const sd of [-1, 1]) for (const dz of [BOW0 - 10.5, S.z, STERN_Z + 2.5]) drafts.push(place(new THREE.PlaneGeometry(1.1, 4.4), S.x + sd * (halfBreadth(dz, 1.8) + 0.04), 1.8, dz, sd));
  {
    const mesh = new THREE.Mesh(mergeGeometries(drafts), dmat);
    mesh.name = "ship-draft"; mesh.receiveShadow = true; mesh.userData.castShadow = false;
    group.add(mesh);
  }
  for (const [geos, m, n] of [[names, mat, "ship-name"], [rusts, rust, "ship-rust"]] as const) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.name = n; mesh.receiveShadow = true; mesh.userData.castShadow = false;
    group.add(mesh);
  }
}

/** mooring lines from the ship's fairleads to the quay bollards */
function mooringLines(b: Builder, m: HarborMats) {
  const bollards = PROPS.filter((p) => p.kind === "bollard");
  const nearest = (z: number) => bollards.reduce((a, p) => (Math.abs(p.z - z) < Math.abs(a.z - z) ? p : a), bollards[0]);
  const lines: Array<[number, number, number]> = [[BOW0 - 8, FC_TOP, BOW0 + 10], [BOW0 - 16, FC_TOP, BOW0 - 28], [S.house.z + 4, S.deckY + 1, S.house.z + 20], [STERN_Z + 3, S.deckY + 1, STERN_Z - 14]];
  for (const [sz, sy, tz] of lines) {
    const bo = nearest(tz);
    const a: V3 = [S.x - halfBreadth(sz, S.deckY) + 0.1, sy, sz], c: V3 = [bo.x, APRON_Y + 0.7, bo.z];
    const mid: V3 = [(a[0] + c[0]) / 2, Math.min(a[1], c[1]) - 1.2, (a[2] + c[2]) / 2];
    b.tube(m.rope, [a, mid, c], 0.07, 6, { samples: 16, tension: 0.5 });
  }
}

function gangway(b: Builder, m: HarborMats, G: (typeof GANGWAYS)[number]) {
  // a wide gangway climbing along the hull (2.6 m, railed both sides — the colliders stop you at the rails):
  // treads, stringers, handrails, a platform at the top, a davit
  const [ax, ay, az] = G.a, [bx, by, bz] = G.b;
  const len = Math.hypot(bx - ax, by - ay, bz - az), yaw = Math.atan2(-(bz - az), bx - ax), pitch = Math.atan2(by - ay, Math.hypot(bx - ax, bz - az));
  const mm = new THREE.Matrix4().makeTranslation((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
    .multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationZ(pitch));
  const bb = new Builder(); bb.base = mm;
  const W = G.w;
  // (the inboard handrail stops where the treads reach over the hull — the collider rail does too: you step off onto
  // the deck there; local −z is the inboard side)
  const tCut = Math.min(1, Math.max(0, (S.x - S.beam / 2 - 0.2 - W / 2 - 0.03 - ax) / (bx - ax)));
  for (const sz of [-W / 2, W / 2]) {
    const x1 = sz < 0 ? -len / 2 + len * tCut : len / 2;
    bb.box(m.yellowPaint, [0, -0.05, sz], [len, 0.3, 0.09]);
    for (let x = -len / 2 + 0.3; x < x1; x += 1.5) bb.cyl(m.galv, [x, 0, sz], [x, 1.0, sz], 0.035, 5, { caps: false });
    bb.cyl(m.galv, [x1, 0, sz], [x1, 1.0, sz], 0.035, 5, { caps: false });
    bb.cyl(m.yellowPaint, [-len / 2, 1.0, sz], [x1, 1.0, sz], 0.045, 6);
    bb.cyl(m.galv, [-len / 2, 0.55, sz], [x1, 0.55, sz], 0.025, 5);
  }
  // treads stay level: counter-rotate each by the pitch
  const n = Math.ceil((by - ay) / 0.3);
  for (let k = 0; k < n; k++) { const x = -len / 2 + (len * (k + 0.5)) / n; bb.box(m.galv, [x, 0.05, 0], [len / n * 0.85, 0.06, W - 0.1], { rotZ: -pitch }); }
  const g = bb.build("gangway");
  g.children.forEach((c) => (c as THREE.Mesh).geometry && b.add((c as THREE.Mesh).material as THREE.Material, (c as THREE.Mesh).geometry, undefined, false));
  // landing platform on the deck edge + the davit arm holding the gangway
  b.box(m.galv, [bx + 0.3, by - 0.05, bz + 0.9], [2.0, 0.1, 2.6]);
  b.beam(m.yellowPaint, [bx + 1.4, by, bz + 2.0], [bx - 0.3, by + 3.2, bz - 1], 0.18, 0.18);
  b.cyl(m.cable, [bx - 0.3, by + 3.2, bz - 1], [ax + (bx - ax) * 0.55, ay + (by - ay) * 0.55 + 1, az + (bz - az) * 0.55], 0.02, 4, { caps: false });
}

/** far LOD (perf): the lofted hull at 28 stations × 7 rows with the
 *  boot-top / black / sheer bands as vertex colours, deck, forecastle, the stepped house, funnel — ≈ 1.6 k tris, 1 draw.
 *  (Its deck stacks are containers: the kit's own LOD handles them.) Also the ship's cascade-1 shadow caster. */
function shipProxy(): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  const tri = (a: V3, b: V3, d: V3, hex: string) => { c.set(hex); pos.push(...a, ...b, ...d); for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b); };
  const quad = (a: V3, b: V3, d: V3, e: V3, hex: string) => { tri(a, b, d, hex); tri(a, d, e, hex); };
  const rows = [S.keelY, -1.5, 0, 1.25, 4.5, S.deckY - 0.8, S.deckY];
  const N = 28, ts = [...Array(N + 1)].map((_, i) => { const t = i / N; return t < 0.5 ? 0.5 * (2 * t) ** 1.25 : 1 - 0.5 * (2 - 2 * t) ** 1.6; });
  const pt = (ri: number, i: number, side: number): V3 => { const y = rows[ri], z = sternZ(y) + (noseZ(y) - sternZ(y)) * ts[i]; return [S.x + side * halfBreadth(z, y), y, z]; };
  for (let ri = 0; ri < rows.length - 1; ri++) {
    const hex = rows[ri + 1] <= 1.3 ? "#9e3220" : rows[ri] >= S.deckY - 0.85 ? "#e8e5dc" : "#2e3641";
    for (let i = 0; i < N; i++) for (const side of [1, -1]) {
      const a = pt(ri, i, side), b = pt(ri, i + 1, side), d = pt(ri + 1, i + 1, side), e = pt(ri + 1, i, side);
      if (side < 0) quad(a, b, d, e, hex); else quad(a, e, d, b, hex);
    }
  }
  for (let ri = 0; ri < rows.length - 1; ri++) { const aL = pt(ri, 0, -1), aR = pt(ri, 0, 1), bL = pt(ri + 1, 0, -1), bR = pt(ri + 1, 0, 1); quad(aL, aR, bR, bL, "#2e3641"); }
  for (let i = 0; i < N; i++) { const a = pt(rows.length - 1, i, -1), b = pt(rows.length - 1, i + 1, -1), d = pt(rows.length - 1, i + 1, 1), e = pt(rows.length - 1, i, 1); quad(a, b, d, e, "#7a3526"); }
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, hex: string, k = 1) => {
    const h = (f: number) => { c.set(hex).multiplyScalar(f * k); return `#${c.getHexString()}`; };
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], h(1.05));
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], h(0.95)); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], h(0.8));
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], h(0.88)); quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], h(0.88));
  };
  const fz0 = S.forecastle.z0 - 4, fz1 = stemZ(S.deckY) - 3;
  box(S.x - HALF * 0.78, S.x + HALF * 0.78, S.deckY, FC_TOP, fz0 + 4, fz1, "#262d36");
  const H0 = S.house, z0 = H0.z - H0.halfL, z1 = H0.z + H0.halfL;
  for (let l = 0; l < 5; l++) { const y0 = S.deckY + l * 3.25, hw = l === 4 ? H0.halfW + 0.3 : H0.halfW - (l === 0 ? 0 : 0.6 + (l > 2 ? 0.7 : 0)); box(S.x - hw, S.x + hw, y0, y0 + 3.25, z0 + (l > 1 ? 1.2 : 0), z1 - l * 1.1, "#f0ede4"); }
  const fz = z0 - 2.2, fy0 = S.deckY + 3.25 * 3;
  box(S.x - 2.8, S.x + 2.8, fy0, H0.funnelTop - 3.4, fz - 2.1, fz + 2.1, "#f0ede4"); box(S.x - 2.6, S.x + 2.6, H0.funnelTop - 3.4, H0.funnelTop - 1.4, fz - 1.95, fz + 1.95, "#b3361e"); box(S.x - 2.4, S.x + 2.4, H0.funnelTop - 1.4, H0.funnelTop, fz - 1.85, fz + 1.85, "#2a2c2e");
  // hatch covers + lashing-bridge posts read as a dark band under the deck stacks
  box(S.x - HALF + 2.4, S.x + HALF - 2.4, S.deckY, S.deckY + 0.6, S.bays.z0, S.bays.z1, "#4a5d52");
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.08, name: "ship-far" }));
  mesh.name = "ship-far"; mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.castShadow = true; mesh.userData.farShadow = "force";
  return mesh;
}

export const part: Part = {
  id: "ship",
  async build({ ctx, mats, group, lod }) {
    const m = mats;
    const b = new Builder(true);
    // (yields between the stages — the harbor streams in without > 50 ms main-thread tasks)
    hullGeometry(b, m); await ctx.yield();
    forecastle(b, m);
    superstructure(b, m); await ctx.yield();
    deckFittings(b, m);
    mooringLines(b, m);
    for (const G of GANGWAYS) gangway(b, m, G);
    await ctx.yield();
    const ship = await b.buildAsync("ship", { palette: (m) => SMALL_MATS.test(m.name) }, () => ctx.yield());
    await ctx.yield();
    group.add(ship);
    // perf: the detailed casters render into the near cascade only; cascade 1 gets the far proxy's silhouette; beyond
    // 150 m on the ground (330 m from the air) the whole ship swaps to the ~1.6 k-tri proxy
    const far = shipProxy();
    group.add(far);
    mergeCasters(ship, { farShadow: false, c1: false });
    const c1 = c1Caster(far, ship, "ship-c1");
    if (c1) ship.add(c1);
    const deco = new THREE.Group(); deco.name = "ship-decals";
    nameDecals(deco);
    ship.add(deco);
    lod.pair(ship, far, 150, { air: 330 });
    const F = foam(ctx);
    // a thin contact line of foam along the waterline (not a white shelf) + the wash at the stem / bulb
    F.rect(S.x, S.z, HALF, S.length / 2, 0.8, 0.32);
    F.circle(S.x, BOW_Z - 1, 4, 0.9);
    F.capsule(S.x - HALF + 1, BOW_Z - 12, S.x - HALF + 0.5, BOW_Z - 3, 1.6, 0.8);
    F.capsule(S.x + HALF - 1, BOW_Z - 12, S.x + HALF - 0.5, BOW_Z - 3, 1.6, 0.8);
  },
};
