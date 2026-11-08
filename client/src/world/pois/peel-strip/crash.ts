// PEEL STRIP — the crashed transport at the far end of the runway:
// a boxy high-wing utility transport with a square fuselage
// in riveted, dented, paint-flaked skin, torn in two — the front cabin (cockpit nose, windows, faded livery) and the
// slewed rear (cargo-ramp underside, high tailplane, twin fins) both HOLLOW with a zinc-chromate interior, ribs,
// stringers, troop seats and a torn rim at the break; the two wings lie broken on the ground, one still carrying its
// nacelle + bent prop; spilled BANANA CO. crates. Every part fills exactly its shared box (shared/pois/peel-strip.ts
// crashParts / crashShell): collider ≡ visual by construction.
import * as THREE from "three";
import * as S from "../../../../../shared/pois/peel-strip";
import { rng } from "../../../../../shared/pois/coast-kit";
import { Batch, M, box, rbox, cyl, sph, blobShadow } from "../_kit/coast-kit";
import { crate, bananaHeap } from "../_kit/coast-props";
import { textDecal } from "../_kit/coast-sign";
import type { Terrain } from "../../../../../shared/world/terrain";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
// clean painted cream airframe (plain painted metal): a dark olive camo texture lifted
// to cream by a > 1 vertex tint reads as orange-brown camo blotches from any distance
const SKIN = 0xe8dfc4, WINGC = 0xddd5bd, LIVERY = 0x2f6f9a, ZINC = 0x8a9a62, RUST = 0x7a4a32, DARK = 0x2a2622;

/** smooth value noise (deterministic) */
function noise2(x: number, y: number, seed: number) {
  const h = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}

interface Sec { x: number; hz: number; top: number; bot: number; r: number }
/** perimeter of a rounded rectangle (z, y), CCW seen from +x, `per` points per straight edge, 4 per corner */
function ring(s: Sec, per: number): Array<[number, number, number, number]> {
  const hy = (s.top - s.bot) / 2, cy = (s.top + s.bot) / 2, r = Math.min(s.r, s.hz - 1e-3, hy - 1e-3), ez = s.hz - r, ey = hy - r;
  const pts: Array<[number, number, number, number]> = []; // z, y, nz, ny
  const corner = (cz: number, cyy: number, a0: number) => { for (let k = 0; k < 4; k++) { const a = a0 + (k / 4) * Math.PI / 2; pts.push([cz + Math.cos(a) * r, cyy + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); } };
  const edge = (z0: number, y0: number, z1: number, y1: number, nz: number, ny: number) => { for (let k = 0; k < per; k++) { const t = k / per; pts.push([z0 + (z1 - z0) * t, y0 + (y1 - y0) * t, nz, ny]); } };
  // start at the +z side bottom, go up (+z side), over the top, down the −z side, along the belly
  edge(s.hz, cy - ey, s.hz, cy + ey, 1, 0); corner(ez, cy + ey, 0);
  edge(ez, cy + hy, -ez, cy + hy, 0, 1); corner(-ez, cy + ey, Math.PI / 2);
  edge(-s.hz, cy + ey, -s.hz, cy - ey, -1, 0); corner(-ez, cy - ey, Math.PI);
  edge(-ez, cy - hy, ez, cy - hy, 0, -1); corner(ez, cy - ey, Math.PI * 1.5);
  return pts;
}
/**
 * Lofted hull skin through rounded-rect sections along x. `inset` shrinks every section (inner skin), `inner` flips the
 * faces inward. `dent` (m) pushes the skin in by smooth noise; `tear` jags the edge at the x0 (−1) / x1 (+1) end back
 * into the section by up to that many metres. Returns [geometry, end loops (x0, x1) for rims].
 */
function loft(secs: Sec[], o: { per?: number; inset?: number; inner?: boolean; dent?: number; tear?: number; tearEnd?: -1 | 1; seed?: number; tile?: number }) {
  const per = o.per ?? 6, inset = o.inset ?? 0, seed = o.seed ?? 1, tile = o.tile ?? 1.6;
  const rings = secs.map((s) => ring({ x: s.x, hz: s.hz - inset, top: s.top - inset, bot: s.bot + inset, r: Math.max(0.02, s.r - inset) }, per));
  const n = rings[0].length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const loops: Array<Array<[number, number, number]>> = [];
  for (let j = 0; j < secs.length; j++) {
    let L = 0; const loop: Array<[number, number, number]> = [];
    for (let i = 0; i <= n; i++) {
      const p = rings[j][i % n], q = rings[j][(i + 1) % n];
      let x = secs[j].x, z = p[0], y = p[1];
      const d = (o.dent ?? 0) * Math.max(0, noise2(i * 0.45, x * 1.3, seed) * 1.6 - 0.6);
      z -= p[2] * d; y -= p[3] * d;
      if (o.tear && ((o.tearEnd === -1 && j === 0) || (o.tearEnd === 1 && j === secs.length - 1))) {
        const t = o.tear * (0.25 + 0.75 * noise2(i * 1.7, 3.1, seed + 9)) * (i % 3 === 0 ? 1 : 0.55);
        x -= o.tearEnd * t;
      }
      pos.push(x, y, z); uv.push(L / tile, x / tile); if (i < n) loop.push([x, y, z]);
      L += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    loops.push(loop);
  }
  const W = n + 1;
  for (let j = 0; j + 1 < secs.length; j++) for (let i = 0; i < n; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    // ring runs CCW seen from +x → outward faces need (a, c, b) when x grows with j
    if (o.inner) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return { g, loops };
}
/** quad strip joining two equal-length loops (the torn rim between the outer and the inner skin) */
function rim(a: Array<[number, number, number]>, b: Array<[number, number, number]>, flip: boolean) {
  const pos: number[] = [], idx: number[] = [], n = a.length;
  for (let i = 0; i < n; i++) pos.push(...a[i], ...b[i]);
  for (let i = 0; i < n; i++) { const p = 2 * i, q = 2 * ((i + 1) % n); if (flip) idx.push(p, p + 1, q, q, p + 1, q + 1); else idx.push(p, q, p + 1, q, q + 1, p + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** fan cap over a loop (closed hull end) */
function cap(loop: Array<[number, number, number]>, flip: boolean) {
  let cx = 0, cy = 0, cz = 0; for (const p of loop) { cx += p[0]; cy += p[1]; cz += p[2]; }
  const n = loop.length, pos: number[] = [cx / n, cy / n, cz / n], idx: number[] = [];
  for (const p of loop) pos.push(...p);
  for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + ((i + 1) % n); if (flip) idx.push(0, b, a); else idx.push(0, a, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** one hollow cabin section (front: open at −x, rear: open at +x) filling the box q (crash-local, unscaled) */
function cabin(b: Batch, n: Batch, q: S.CrashPart, front: boolean, seed: number) {
  const K = S.CRASH_SCALE, [hx, hy, hz] = q.h, m = M(q.c[0], q.c[1], q.c[2], 0, q.yaw, 0);
  const wt = S.CRASH_SHELL.wall / K, fl = S.CRASH_SHELL.floor / K, rt = S.CRASH_SHELL.roof / K;
  const open = front ? -1 : 1, x0 = -hx, x1 = hx, NS = 9;
  const secs: Sec[] = Array.from({ length: NS }, (_, i) => ({ x: x0 + (x1 - x0) * (i / (NS - 1)), hz, top: hy, bot: -hy, r: 0.32 }));
  const outer = loft(secs, { dent: 0.06, tear: 0.2, tearEnd: open, seed, per: 7 });
  b.add(outer.g, "pmetal", { m, uv: "keep", color: SKIN, aoY: -hy, aoRange: 1.2, aoMin: 0.55 });
  const inner = loft(secs, { inset: wt, inner: true, tear: 0.2, tearEnd: open, seed, per: 7 });
  b.add(inner.g, "pmetal", { m, uv: "keep", color: ZINC, aoY: -hy, aoRange: 2.0, aoMin: 0.45 });
  // torn rim (raw aluminium + rust) between the skins at the break
  const e = open < 0 ? 0 : NS - 1;
  for (const fl2 of [false, true]) b.add(rim(outer.loops[e], inner.loops[e], fl2), "steel", { m, uv: "box", color: 0x9a9690 });
  // closed end: outer + inner bulkhead caps
  const c = open < 0 ? NS - 1 : 0;
  for (const fl2 of [false, true]) b.add(cap(inner.loops[c], fl2), "pmetal", { m, uv: "box", tile: 1.2, color: 0x6f7c50 });
  // floor: diamond-plate deck on the belly (top = the collider floor top), tie-down rails
  b.add(box(2 * hx - 0.1, 0.06, 2 * (hz - wt) - 0.1), "pmetal", { m: mul(m, M(0, -hy + fl - 0.03, 0)), tile: 0.6, color: 0x6c6e6a });
  for (const s of [-1, 1]) n.add(box(2 * hx - 0.3, 0.04, 0.06), "steel", { m: mul(m, M(0, -hy + fl + 0.02, s * 0.45)), color: 0x9a9a96 });
  // ribs (frames) + stringers inside, a couple of ribs snapped and bent at the break
  const R = new THREE.Matrix4();
  for (let k = 0; k < 7; k++) {
    const x = x0 + 0.35 + k * (2 * hx - 0.7) / 6;
    const band = loft([{ x: x - 0.05, hz, top: hy, bot: -hy, r: 0.32 }, { x: x + 0.05, hz, top: hy, bot: -hy, r: 0.32 }], { inset: wt + 0.07, inner: true, per: 3 });
    n.add(band.g, "pmetal", { m, uv: "keep", color: 0x5f6a44 });
  }
  for (const [zz, yy] of [[hz - wt - 0.04, 0.55], [hz - wt - 0.04, -0.2], [-(hz - wt - 0.04), 0.55], [-(hz - wt - 0.04), -0.2], [0.5, hy - rt - 0.04], [-0.5, hy - rt - 0.04]]) {
    n.add(box(2 * hx - 0.25, 0.05, 0.05), "steel", { m: mul(m, M(0, yy, zz)), color: 0x6a6a64 });
  }
  void R;
  // troop seats: red webbing on tube frames folded against both walls (≤ 0.25 m proud: inside the wall tolerance)
  for (const s of [-1, 1]) {
    const zw = s * (hz - wt - 0.14);
    n.add(rbox(2 * hx - 1.2, 0.05, 0.24, 0.02), "fabric", { m: mul(m, M(0, -hy + fl + 0.42, zw)), color: 0xa8322a });
    n.add(rbox(2 * hx - 1.2, 0.42, 0.03, 0.01), "fabric", { m: mul(m, M(0, -hy + fl + 0.72, s * (hz - wt - 0.03))), color: 0x8a2a24 });
    n.add(cyl(0.02, 0.02, 2 * hx - 1.2, 6).rotateZ(Math.PI / 2), "steel", { m: mul(m, M(0, -hy + fl + 0.45, s * (hz - wt - 0.25))), uv: "local", color: 0x8a8a86 });
  }
  // windows (dark, two smashed) + cabin door outline + faded livery band + titles on both sides
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = x0 + 0.9 + k * 0.9 * (hx / 2.2);
      if (x > x1 - 0.5) continue;
      n.add(rbox(0.42, 0.42, 0.04, 0.08), (k + seed + (s > 0 ? 1 : 0)) % 5 === 0 ? "pmetal" : "darkGlass", { m: mul(m, M(x, 0.45, s * (hz + 0.005))), color: (k + seed) % 5 === 0 ? 0x111111 : 0xffffff });
      n.add(rbox(0.52, 0.52, 0.02, 0.1), "steel", { m: mul(m, M(x, 0.45, s * (hz + 0.002))), color: 0x8c8a84 });
    }
    b.add(box(2 * hx - 0.4, 0.22, 0.012), "pmetal", { m: mul(m, M(0, -0.15, s * (hz + 0.008))), color: LIVERY });
    b.add(box(2 * hx - 0.4, 0.06, 0.012), "pmetal", { m: mul(m, M(0, 0.02, s * (hz + 0.008))), color: 0xd9a62a });
    if (front) textDecal(n, "FEED AIR", 2.4, 0.34, mul(m, M(0.6, 1.25, s * (hz + 0.012), 0, s > 0 ? 0 : Math.PI, 0)), { fg: "#2a4f6f", bg: null, font: 900 });
  }
  // rivet lines: the hull texture carries the rivets; add a few big dents as dark scuffs + rust streaks under the windows
  const r = rng(seed * 13 + 5);
  for (let k = 0; k < 6; k++) {
    const s = r() < 0.5 ? -1 : 1, x = x0 + 0.4 + r() * (2 * hx - 0.8);
    n.add(box(0.06 + r() * 0.05, 0.4 + r() * 0.5, 0.01), "pmetal", { m: mul(m, M(x, 0.05 - r() * 0.3, s * (hz + 0.011))), color: RUST, shadow: false });
  }
}

/** a wing lying on the ground filling box q: constant-chord airfoil (chord along x), torn root at −z… +z end */
function wing(b: Batch, n: Batch, q: S.CrashPart, rootEnd: 1 | -1, seed: number) {
  const [hx, hy, hz] = q.h, m = M(q.c[0], q.c[1] - hy, q.c[2], 0, q.yaw, 0);
  const af = new THREE.Shape();
  const c = hx - 0.03, t = 2 * hy - 0.02;
  af.moveTo(c, 0.06); af.bezierCurveTo(c, t * 0.75, c * 0.4, t, -c * 0.1, t); af.bezierCurveTo(-c * 0.6, t * 0.92, -c, t * 0.35, -c, 0.04);
  af.lineTo(-c, 0.02); af.bezierCurveTo(-c * 0.4, 0, c * 0.5, 0, c, 0.06);
  const L = 2 * hz - 0.06;
  const g = new THREE.ExtrudeGeometry(af, { depth: L, bevelEnabled: false, curveSegments: 10, steps: 6 });
  g.translate(0, 0, -L / 2);
  // dents + a torn, jagged root
  { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); const d = 0.04 * noise2(p.getX(i) * 2, z * 0.8, seed); p.setY(i, y > 0.1 ? y - d : y); if (Math.abs(z - rootEnd * L / 2) < 0.01) p.setZ(i, z - rootEnd * 0.25 * noise2(p.getX(i) * 3, 1, seed + 3)); } g.computeVertexNormals(); }
  b.add(g, "pmetal", { m, uv: "box", tile: 1.8, color: WINGC, aoY: 0, aoRange: 0.4, aoMin: 0.6 });
  // aileron hinge line + flap, nav light at the tip, root ribs + spar stubs sticking out of the tear
  n.add(box(0.03, 0.02, L * 0.45), "pmetal", { m: mul(m, M(-c * 0.55, t * 0.75, -rootEnd * L * 0.22)), color: DARK });
  n.add(sph(0.08, 8, 6), rootEnd > 0 ? "lampRed" : "lamp", { m: mul(m, M(0, t * 0.5, -rootEnd * (L / 2 + 0.02))), color: 0x66ff66 });
  for (const x of [-0.45, 0.2, 0.6]) n.add(box(0.06, t * 0.8, 0.06), "steel", { m: mul(m, M(x * c, t * 0.45, rootEnd * (L / 2 - 0.12))), color: RUST });
  n.add(box(0.1, 0.12, 0.5), "steel", { m: mul(m, M(0.1, t * 0.5, rootEnd * (L / 2 - 0.1))), color: 0x8a8a86 });
}

/** engine nacelle on the wing (filling box q) + a bent three-blade prop at its +x end */
function nacelle(b: Batch, n: Batch, q: S.CrashPart) {
  const [hx, hy, hz] = q.h, m = M(q.c[0], q.c[1], q.c[2], 0, q.yaw, 0);
  b.add(rbox(2 * hx - 0.2, 2 * hy - 0.02, 2 * hz - 0.02, 0.16, 3), "pmetal", { m: mul(m, M(-0.1, 0, 0)), uv: "box", tile: 1.4, color: SKIN });
  b.add(cyl(hz - 0.04, hz - 0.08, 0.25, 14).rotateZ(Math.PI / 2), "pmetal", { m: mul(m, M(hx - 0.2, 0.02, 0)), uv: "local", color: 0x3a3632 });
  n.add(cyl(0.12, 0.12, 0.3, 10).rotateZ(Math.PI / 2), "steel", { m: mul(m, M(-hx + 0.05, -0.1, 0.12)), uv: "local", color: 0x4a3a30 }); // exhaust
  n.add(sph(0.15, 12, 8), "chrome", { m: mul(m, M(hx - 0.02, 0.02, 0, 0, 0, 0, 0.8)), color: 0xbfc2c6 });
  for (let k = 0; k < 3; k++) {
    const a = k * 2.09 + 0.4, bl = rbox(0.07, 0.55, 0.16, 0.03); bl.translate(0, 0.3, 0); bl.rotateX(0.5); // bent back
    n.add(bl, "pmetal", { m: mul(m, M(hx - 0.02, 0.02, 0, a, 0, 0)), color: 0x2f2b27 });
  }
  n.add(box(0.5, 0.04, 2 * hz - 0.1), "steel", { m: mul(m, M(hx * 0.3, hy - 0.01, 0)), color: 0x8c8a84 }); // cowl seam
}

/** the cockpit nose: one lofted skin through the four stepped boxes (windshield slope inside every step's tolerance) */
function nose(b: Batch, n: Batch, parts: S.CrashPart[], seed: number) {
  const f = parts.find((p) => p.k === "cr:fusF")!, n1 = parts.find((p) => p.k === "cr:nose1")!, n2 = parts.find((p) => p.k === "cr:nose2")!;
  // in the front section's frame (all three boxes share its yaw)
  const m = M(f.c[0], f.c[1], f.c[2], 0, f.yaw, 0), c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  const lx = (p: S.CrashPart) => (p.c[0] - f.c[0]) * c - (p.c[2] - f.c[2]) * s;
  const x0 = f.h[0], xa = lx(n1) + n1.h[0], xb = lx(n2) + n2.h[0];
  const top = f.h[1], bot = -f.h[1], y1 = n1.c[1] - f.c[1] + n1.h[1], y2 = n2.c[1] - f.c[1] + n2.h[1], yb2 = n2.c[1] - f.c[1] - n2.h[1];
  const secs: Sec[] = [
    { x: x0 - 0.02, hz: f.h[2], top, bot, r: 0.32 },
    { x: x0 + 0.25, hz: f.h[2] - 0.03, top: top - 0.02, bot, r: 0.34 },
    { x: xa - 0.05, hz: n1.h[2], top: y1 + 0.1, bot: bot + 0.04, r: 0.38 },
    { x: (xa + xb) / 2, hz: (n1.h[2] + n2.h[2]) / 2, top: (y1 + y2) / 2 + 0.05, bot: bot + 0.1, r: 0.42 },
    { x: xb - 0.12, hz: n2.h[2] - 0.12, top: y2 - 0.15, bot: yb2 + 0.12, r: 0.42 },
    { x: xb - 0.01, hz: n2.h[2] - 0.45, top: y2 - 0.55, bot: yb2 + 0.35, r: 0.25 },
  ];
  const sk = loft(secs, { dent: 0.04, seed, per: 6 });
  b.add(sk.g, "pmetal", { m, uv: "keep", color: SKIN, aoY: bot, aoRange: 1.2, aoMin: 0.55 });
  for (const fl2 of [false, true]) b.add(cap(sk.loops[sk.loops.length - 1], fl2), "pmetal", { m, uv: "box", tile: 1, color: SKIN });
  // windshield: 4 panes on the slope (one smashed), frames; a yellow anti-glare panel; side cockpit windows
  const ws = M(x0 + 0.62, y1 - 0.05, 0, 0, 0, -0.55);
  for (let k = 0; k < 4; k++) {
    const z = -0.78 + k * 0.52, broken = k === 1;
    n.add(rbox(0.5, 0.04, 0.46, 0.04), broken ? "pmetal" : "darkGlass", { m: mul(m, mul(ws, M(0, 0.05, z))), color: broken ? 0x0d0c0b : 0xffffff });
  }
  n.add(rbox(0.58, 0.03, 2.2, 0.02), "pmetal", { m: mul(m, mul(ws, M(0, 0.035, 0))), color: DARK });
  n.add(rbox(0.5, 0.02, 1.6, 0.02), "pmetal", { m: mul(m, M(xb - 0.3, y2 - 0.12, 0, 0, 0, -0.6)), color: 0xe0b52a });
  for (const sd of [-1, 1]) n.add(rbox(0.45, 0.38, 0.03, 0.06), "darkGlass", { m: mul(m, M(x0 + 0.5, 1.15, sd * (n1.h[2] + 0.06))) });
}

/** tailplane + twin fins (thin rounded plates exactly their boxes) with the rudder, the red band and the tail number */
function tail(b: Batch, n: Batch, q: S.CrashPart, isFin: boolean) {
  const [hx, hy, hz] = q.h, m = M(q.c[0], q.c[1], q.c[2], 0, q.yaw, 0);
  if (!isFin) {
    b.add(rbox(2 * hx, 2 * hy, 2 * hz, 0.06), "pmetal", { m, uv: "box", tile: 1.6, color: SKIN });
    n.add(box(0.04, 2 * hy + 0.01, 2 * hz - 0.2), "pmetal", { m: mul(m, M(-hx * 0.45, 0, 0)), color: DARK }); // elevator hinge
    return;
  }
  // fin: near-rectangular, rounded top, rudder hinge, faded red band, tail number
  const sh = new THREE.Shape(); const w = 2 * hx, h = 2 * hy;
  sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 2 - 0.25); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - 0.25, h / 2); sh.lineTo(-w / 2 + 0.35, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - 0.35); sh.lineTo(-w / 2, -h / 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 2 * hz - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -(hz - 0.02));
  b.add(g, "pmetal", { m, uv: "box", tile: 1.6, color: SKIN });
  for (const s of [-1, 1]) {
    n.add(box(w - 0.06, 0.32, 0.01), "pmetal", { m: mul(m, M(0, h * 0.18, s * (hz + 0.005))), color: 0xa83a2a });
    n.add(box(0.03, h - 0.1, 0.01), "pmetal", { m: mul(m, M(-w * 0.28, 0, s * (hz + 0.006))), color: DARK });
    textDecal(n, "PS-B4N", w * 0.8, 0.22, mul(m, M(0.05, -h * 0.2, s * (hz + 0.012), 0, s > 0 ? 0 : Math.PI, 0)), { fg: "#2b2b2b", bg: null, font: 800 });
  }
}

/** the sloped cargo-ramp underside of the rear section: one loft through both step boxes (closed rear end) */
function rampEnd(b: Batch, parts: S.CrashPart[], seed: number) {
  const f = parts.find((p) => p.k === "cr:fusR")!, r1 = parts.find((p) => p.k === "cr:ramp1")!, r2 = parts.find((p) => p.k === "cr:ramp2")!;
  const m = M(f.c[0], f.c[1], f.c[2], 0, f.yaw, 0), c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  const lx = (p: S.CrashPart) => (p.c[0] - f.c[0]) * c - (p.c[2] - f.c[2]) * s;
  const xs = -f.h[0], xa = lx(r1) - r1.h[0], xb = lx(r2) - r2.h[0];
  const top = f.h[1], b1 = r1.c[1] - f.c[1] - r1.h[1], b2 = r2.c[1] - f.c[1] - r2.h[1];
  const secs: Sec[] = [
    { x: xb + 0.01, hz: r2.h[2] - 0.02, top: top - 0.04, bot: b2 + 0.12, r: 0.3 },
    { x: (xa + xb) / 2, hz: (r1.h[2] + r2.h[2]) / 2, top: top - 0.01, bot: (b1 + b2) / 2 + 0.05, r: 0.32 },
    { x: xa + 0.05, hz: r1.h[2], top, bot: b1 - 0.02, r: 0.32 },
    { x: xs + 0.02, hz: f.h[2], top, bot: -f.h[1], r: 0.32 },
  ];
  const sk = loft(secs, { dent: 0.05, seed, per: 7 });
  b.add(sk.g, "pmetal", { m, uv: "keep", color: SKIN, aoY: -f.h[1], aoRange: 1.2, aoMin: 0.55 });
  for (const fl2 of [false, true]) b.add(cap(sk.loops[0], fl2), "pmetal", { m, uv: "box", tile: 1.2, color: SKIN });
  // the ramp door outline + hinge on the rear face
  b.add(box(0.03, 0.08, 2 * r2.h[2] - 0.5), "pmetal", { m: mul(m, M(xb - 0.0, b2 + 0.45, 0)), color: DARK });
}

/** the whole crash site (world matrix of the crash frame at the pad, scale = CRASH_SCALE) */
export function buildCrash(b: Batch, n: Batch, terrain: Terrain) {
  const [cx, cz, cyaw] = S.CRASH, K = S.CRASH_SCALE, parts = S.crashParts();
  // (the Batch frame carries the 1.5× scale: every part below is in UNscaled crash-local metres)
  const F0 = M(cx, S.PAD.y, cz, 0, cyaw, 0, K);
  const fb = b.frame.clone(), fn = n.frame.clone();
  b.frame = F0; n.frame = F0;
  let seed = 3;
  for (const q of parts) {
    seed++;
    if (q.k === "cr:fusF") cabin(b, n, q, true, seed);
    else if (q.k === "cr:fusR") cabin(b, n, q, false, seed);
    else if (q.k === "cr:wing") wing(b, n, q, q.c[2] < 0 ? 1 : -1, seed);
    else if (q.k === "cr:nac") nacelle(b, n, q);
    else if (q.k === "cr:stab") tail(b, n, q, false);
    else if (q.k === "cr:fin") tail(b, n, q, true);
    else if (q.k === "cr:crate") crate(b, M(q.c[0], q.c[1] - q.h[1], q.c[2], 0, q.yaw, 0), { lid: seed % 2 === 0, full: seed % 2 === 1, seed }); // 1.2 × 0.8 × 0.8 = the box
  }
  nose(b, n, parts, 21);
  rampEnd(b, parts, 22);
  // bananas spilled from a split crate into the grass, a tyre, hull plates + a seat thrown clear
  bananaHeap(n, M(-1.6, 0.02, 4.9), 1.6, 1.0, 9, 8, 0.08, true);
  const r = rng(71);
  for (let k = 0; k < 12; k++) {
    const x = -9 + r() * 18, z = -7 + r() * 14;
    if (Math.abs(z) < 1.6 && x > -1 && x < 8) continue;
    n.add(rbox(0.4 + r() * 0.8, 0.03, 0.3 + r() * 0.6, 0.01), r() < 0.6 ? "pmetal" : "steel", { m: M(x, 0.03, z, (r() - 0.5) * 0.15, r() * 6, (r() - 0.5) * 0.15), uv: "box", tile: 1.2, color: r() < 0.5 ? SKIN : 0x9a968e });
  }
  b.frame = fb; n.frame = fn;
  // scorched, flattened grass round the wreck
  blobShadow(b, terrain, cx, cz, 22 * K, 13 * K, cyaw, undefined, 0.75);
  void cyl;
}
