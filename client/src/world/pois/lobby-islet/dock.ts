// Wooden dock: a plank platform over the shallows + a gangway up to the sand. Planks (≤3.8 m boards, staggered butt
// joints over the joists, worn edges, nails), joists, bearers on round piles driven into the seabed, fascia boards,
// X-bracing under the visible edges, tall rope-wrapped mooring posts with sagging rope rails, a ladder into the water,
// coiled rope, banana hands, weeds growing between the boards. Driven by the "dock"/"post" layout items.
import * as THREE from "three";
import { LOBBY, type LobbyItem, toWorld, DIM } from "../../../../../shared/pois/lobby-islet";
import { M, cbox, cyl, grid } from "./kit";
import { type LK, itemM, WOOD, ropeWrap, ropeSpan, ropeCoil, bananaPile, TINT } from "./lk";
import type { WaterApi } from "../../water/api";

const PLANK_W = 0.235, GAP = 0.02, PLANK_T = 0.07;
const tints = ["#f6d2b0", "#ead0b8", "#fbdcbc", "#e2c2a4", "#f0cfae", "#f7e0c6", "#e0cbb6", "#dcd2c8", "#d6cbc0"];
const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);

export function buildDock(k: LK, water?: WaterApi) {
  const posts = LOBBY.filter((i) => i.kind === "post");
  for (const it of LOBBY) if (it.kind === "dock") section(k, it, posts, water);
  for (const p of posts) post(k, p, water);
  railing(k, posts);
  dressing(k);
}

function section(k: LK, it: LobbyItem, posts: LobbyItem[], water?: WaterApi) {
  const w = it.w ?? 4, l = it.l ?? 10, top = it.top ?? 1.25;
  const base = itemM(it, top);             // local origin at deck-top level, X across, +Z toward the camera
  const add = (key: string, g: THREE.BufferGeometry, m: THREE.Matrix4, tint: string) => k.b.add(key, g, mul(base, m), tint);
  const grainW = k.at.A.uv("grainWarm"), grainD = k.at.A.uv("grainDark"), endg = k.at.A.uv("endgrain");
  const localGround = (x: number, z: number) => { const p = new THREE.Vector3(x, 0, z).applyMatrix4(base); return k.ground(p.x, p.z); };

  // ---- joists along Z (every ~0.9 m); plank butt joints land on them
  const nj = Math.max(3, Math.round(w / 0.9) + 1);
  const jx = Array.from({ length: nj }, (_, j) => -w / 2 + 0.1 + (j / (nj - 1)) * (w - 0.2));
  const jy = -PLANK_T - 0.09;
  for (const x of jx) add("A", cbox(0.1, 0.18, l - 0.1, 0.012, { grain: 2, rect: grainD, end: endg, off: [k.r() * 1, k.r() * 0.5] }), M(x, jy, 0), WOOD.dark);

  // ---- planks across X, ≤3.8 m boards, staggered joints on joists
  const n = Math.floor(l / (PLANK_W + GAP));
  const z0 = -l / 2 + (l - n * (PLANK_W + GAP) + GAP) / 2 + PLANK_W / 2;
  for (let i = 0; i < n; i++) {
    const z = z0 + i * (PLANK_W + GAP);
    const cuts: number[] = [-w / 2 - 0.03 - k.r() * 0.04];
    let x = cuts[0];
    const stagger = (i % 3) * 1.1;
    while (x < w / 2 - 0.1) {
      const target = x + (x === cuts[0] ? 1.2 + stagger + k.r() * 0.6 : 2.6 + k.r() * 1.1);
      if (target >= w / 2 - 0.4) { cuts.push(w / 2 + 0.03 + k.r() * 0.04); break; }
      const j = jx.reduce((best, jj) => (Math.abs(jj - target) < Math.abs(best - target) ? jj : best), jx[0]);
      if (j <= x + 0.5) { cuts.push(w / 2 + 0.03); break; }
      cuts.push(j); x = j;
    }
    for (let c = 0; c < cuts.length - 1; c++) {
      const x0 = cuts[c] + (c > 0 ? 0.004 : 0), x1 = cuts[c + 1] - (c < cuts.length - 2 ? 0.004 : 0);
      const len = x1 - x0;
      if (len > 3.9) continue;
      const strip = Math.floor(k.r() * 8);
      const g = cbox(len, PLANK_T, PLANK_W * (0.96 + k.r() * 0.05), 0.014, { grain: 0, rect: k.at.A.uv(`plank${strip}`), end: endg, off: [k.r() * (3.9 - len), 0] });
      const warp = (k.r() - 0.5) * 0.014;
      add("A", g, M((x0 + x1) / 2, -PLANK_T / 2 + (k.r() - 0.5) * 0.012, z + (k.r() - 0.5) * 0.01, warp, (k.r() - 0.5) * 0.01, (k.r() - 0.5) * 0.01), tints[Math.floor(k.r() * tints.length)]);
    }
  }
  // ---- fascia around the edges
  for (const s of [-1, 1]) add("A", cbox(0.07, 0.28, l + 0.14, 0.016, { grain: 2, rect: grainW, end: endg, off: [k.r(), k.r() * 0.5] }), M(s * (w / 2 + 0.035), -0.16, 0), WOOD.deep);
  for (const s of [-1, 1]) add("A", cbox(w + 0.14, 0.28, 0.07, 0.016, { grain: 0, rect: grainW, end: endg, off: [k.r() * 0.3, k.r() * 0.5] }), M(0, -0.16, s * (l / 2 + 0.035)), WOOD.deep);

  // ---- bearers (along X) every ~2.4 m, each on a row of piles
  const nb = Math.max(2, Math.round(l / 2.4) + 1);
  const bz = Array.from({ length: nb }, (_, b) => -l / 2 + 0.25 + (b / (nb - 1)) * (l - 0.5));
  const npx = Math.max(2, Math.round(w / 2.6) + 1);
  const px = Array.from({ length: npx }, (_, i) => -w / 2 + 0.12 + (i / (npx - 1)) * (w - 0.24));
  const by = -PLANK_T - 0.18 - 0.1;
  for (const z of bz) {
    // bearer in ≤3.8 m lengths
    const segs = Math.ceil((w + 0.3) / 3.8);
    for (let s = 0; s < segs; s++) {
      const x0 = -w / 2 - 0.15 + (s * (w + 0.3)) / segs, x1 = -w / 2 - 0.15 + ((s + 1) * (w + 0.3)) / segs;
      add("A", cbox(x1 - x0 - 0.01, 0.2, 0.18, 0.016, { grain: 0, rect: grainD, end: endg, off: [k.r() * (3.9 - (x1 - x0)), k.r() * 0.5] }), M((x0 + x1) / 2, by, z), WOOD.dark);
    }
    for (const x of px) {
      const wp = new THREE.Vector3(x, 0, z).applyMatrix4(base);
      if (posts.some((p) => { const [ppx, ppz] = toWorld(p.lx, p.d); return Math.hypot(ppx - wp.x, ppz - wp.z) < 0.8; })) continue;
      const gy = localGround(x, z);
      const pileTop = by - 0.1;                                            // under the bearer (local)
      const depthBelow = top + pileTop - gy;                               // metres from the pile top down to the sand
      if (depthBelow < 0.08) continue;
      const bottom = gy - (gy < 0 ? 1.0 : 0.35);
      const h = top + pileTop - bottom;
      add("A", cyl(0.15, 0.16, h, 12, 0.02, { rect: grainD, u: "along", cap: endg, off: [k.r() * 2, k.r() * 0.3] }), M(x, pileTop - h, z, (k.r() - 0.5) * 0.02, k.r() * 6, (k.r() - 0.5) * 0.02), WOOD.deep);
      if (gy < 0.05) {
        water?.registerFoamCircle(wp.x, wp.z, 0.42, 0.6);
        // weed / barnacle band at the waterline
        add("A", cyl(0.175, 0.172, 0.34, 12, 0.03, { rect: grainD, u: "along" }), M(x, -top - 0.24, z), "#5f6b40");
      }
    }
  }
  // ---- X-bracing under the outer edges where the water is deep enough to see it
  if (w > 6) for (const zEdge of [-l / 2 + 0.25, l / 2 - 0.25]) for (let i = 0; i < npx - 1; i++) {
    const xa = px[i], xb = px[i + 1];
    const gy = localGround((xa + xb) / 2, zEdge);
    const drop = top - Math.max(gy, -0.4) - 0.45;
    if (drop < 0.6) continue;
    const len = Math.hypot(drop, xb - xa);
    const ang = Math.atan2(drop, xb - xa);
    for (const sgn of [-1, 1]) add("A", cbox(len, 0.14, 0.06, 0.012, { grain: 0, rect: grainD, end: endg, off: [k.r(), 0] }), M((xa + xb) / 2, by - 0.1 - drop / 2, zEdge + (zEdge > 0 ? 0.13 : -0.13), 0, 0, sgn * ang), WOOD.deep);
  }
  if (Math.min(...[[-w / 2, -l / 2], [w / 2, -l / 2], [-w / 2, l / 2], [w / 2, l / 2]].map(([x, z]) => localGround(x, z))) < 0) {
    const [cx, cz] = toWorld(it.lx, it.d);
    water?.registerFoamRect(cx, cz, w / 2 + 0.2, l / 2 + 0.2, base.elements[0] ? Math.atan2(-base.elements[2], base.elements[0]) : 0, 0.5, 0.35);
  }
  // iron bolt heads along the fascia facing the camera
  const bolt = k.at.A.uv("metal");
  for (let i = 0; i < Math.floor(w / 1.6); i++) add("A", cyl(0.022, 0.02, 0.025, 8, 0.006, { rect: bolt, cap: bolt }), M(-w / 2 + 0.8 + i * 1.6, -0.12, l / 2 + 0.075, Math.PI / 2, 0, 0), TINT.iron);
}

function post(k: LK, it: LobbyItem, water?: WaterApi) {
  const top0 = LOBBY.find((i) => i.id === "platform")?.top ?? 1.25;
  const [x, z] = toWorld(it.lx, it.d);
  const gy = k.ground(x, z), top = it.top ?? 1.6;
  const bot = gy - 1.4, h = top - bot, r = 0.2 + (k.r() - 0.5) * 0.03;
  const m = M(x, bot, z, (k.r() - 0.5) * 0.02, k.r() * 6, (k.r() - 0.5) * 0.02);
  k.b.add("A", cyl(r * 0.98, r, h, 16, 0.04, { rect: k.at.A.uv("grainDark"), u: "along", cap: k.at.A.uv("endgrain"), off: [k.r() * 1.5, k.r() * 0.3] }), m, "#8a6446");
  // thick rope wraps: one just under the top, one at deck level (tying the post to the fascia)
  ropeWrap(k, M(x, 0, z), r, top - 0.44, 2.3 + k.r() * 0.8, 0.032);
  ropeWrap(k, M(x, 0, z), r, top0 - 0.3, 1.6, 0.03);
  if (gy < 0.05) water?.registerFoamCircle(x, z, 0.5, 0.8);
  if (gy < -0.1) k.b.add("A", cyl(r + 0.016, r + 0.012, 0.34, 16, 0.03, { rect: k.at.A.uv("grainDark"), u: "along" }), M(x, -0.24, z), "#56663e");
}

function railing(k: LK, posts: LobbyItem[]) {
  // rope rails between posts (indices into the post items, layout order): far edge (0-1, 1-2; 2-3 is the gangway
  // opening), left edge (0-4-5), right edge (3-7-6)
  const pairs: Array<[number, number]> = [[0, 1], [1, 2], [0, 4], [4, 5], [3, 7], [7, 6]];
  for (const [i, j] of pairs) {
    const a = posts[i], b = posts[j];
    if (!a || !b) continue;
    const [ax, az] = toWorld(a.lx, a.d), [bx, bz] = toWorld(b.lx, b.d);
    const ya = (a.top ?? 1.6) - 0.3, yb = (b.top ?? 1.6) - 0.3;
    const dir = new THREE.Vector3(bx - ax, 0, bz - az).normalize().multiplyScalar(0.21);
    ropeSpan(k, new THREE.Vector3(ax, ya, az).add(dir), new THREE.Vector3(bx, yb, bz).sub(dir), 0.18 + Math.hypot(bx - ax, bz - az) * 0.04, 0.026);
  }
}

function dressing(k: LK) {
  const plat = LOBBY.find((i) => i.id === "platform")!, gang = LOBBY.find((i) => i.id === "gangway")!;
  const top = plat.top ?? 1.25;
  const onDeck = (it: LobbyItem, ox: number, oz: number, yaw = 0) => mul(itemM(it, top), M(ox, 0, oz, 0, yaw, 0));
  const P = (plat.w ?? 12.8) / 2, Q = (plat.l ?? 7.4) / 2;
  // coiled ropes, banana hands by the crates, a loose line trailing to a post
  ropeCoil(k, onDeck(plat, 3.6, 2.4, 0.6), 0.38, 4.4, 0.026);
  ropeCoil(k, onDeck(plat, -5.2, 1.6, 2.1), 0.3, 3.4, 0.022);
  bananaPile(k, onDeck(plat, -3.9, -2.3, 0.3), 2, 0.1);
  bananaPile(k, onDeck(plat, -5.6, -1.7, 1.2), 3, 0.16);
  bananaPile(k, onDeck(gang, 0.5, 0.9, 2.2), 1, 0.05);
  // weeds growing between the boards (crossed cutout quads)
  const tuft = (it: LobbyItem, ox: number, oz: number, s: number) => {
    for (let q = 0; q < 3; q++) {
      const g = grid(0.5, 0.5, 2, 2, k.at.B.uv("grass"), (x, y, o) => o.set(x - 0.25, y, (y * y) * 0.3), [0, 0], "both");
      k.b.add("Bcut", g, mul(onDeck(it, ox, oz, q * 1.05 + k.r()), M(0, 0, 0, 0, 0, 0, s)), "#8fae5a");
    }
  };
  tuft(plat, -3.7, -3.2, 1.1); tuft(plat, 1.2, -3.3, 0.8); tuft(plat, 5.9, -1.4, 1.0); tuft(plat, -6.0, 2.9, 0.8); tuft(gang, -0.9, -1.4, 0.9); tuft(plat, 4.6, 3.3, 0.7);
  // ladder down into the water on the right edge
  const lad = mul(onDeck(plat, P + 0.06, 1.2, Math.PI / 2), M(0, 0, 0));
  const lg = k.at.A.uv("grainDark");
  for (const s of [-1, 1]) k.b.add("A", cbox(0.07, 2.3, 0.09, 0.012, { grain: 1, rect: lg, off: [k.r(), 0] }), mul(lad, M(s * 0.27, -0.85, 0.05, -0.1, 0, 0)), WOOD.deep);
  for (let r = 0; r < 6; r++) k.b.add("A", cbox(0.52, 0.05, 0.07, 0.01, { grain: 0, rect: lg, off: [k.r() * 3, k.r() * 0.5] }), mul(lad, M(0, -0.2 - r * 0.32, 0.07 + r * 0.032, -0.1, 0, 0)), WOOD.dark);
  // mooring cleat on the near edge
  const cleat = onDeck(plat, 1.5, Q - 0.25, 0);
  k.b.add("A", cbox(0.42, 0.07, 0.09, 0.02, { grain: 0, rect: k.at.A.uv("metal") }), mul(cleat, M(0, 0.1, 0)), TINT.iron);
  for (const s of [-1, 1]) k.b.add("A", cbox(0.07, 0.1, 0.07, 0.015, { grain: 1, rect: k.at.A.uv("metal") }), mul(cleat, M(s * 0.1, 0.05, 0)), TINT.iron);
  void DIM;
}
