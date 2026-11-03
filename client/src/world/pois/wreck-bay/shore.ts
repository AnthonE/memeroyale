// WRECK BAY — everything off the ship: the rope bridge, the landing rock + platform, the boardwalk, the castaway camp
// (two stilt huts, the lookout tower, the sailcloth tent, the bonfire, treasure + stores), beach cover, sculpted rocks
// and the headland with its waterfall. World-frame pieces come from shared/pois/wreck-bay.ts PIECES (the colliders).
import * as THREE from "three";
import { M, col, cylGeo, latheGeo, tubeGeo, catenary, noise3, boxProjectUV } from "../_kit/town-geo";
import type { TownBins } from "../_kit/town-materials";
import { addLongboat } from "../_kit/town-boat";
import { sculptRock } from "../_kit/jungle-rocks";
import {
  PIECES, BRIDGE, BOARDING, BOARD_RAIL_Y0, LANDING, BOARDWALK, SHACKS, TOWER, TENT, TREASURE, FIRE, ROCKS, COVER, RAIL, HEADLAND, shackToWorld, towerToWorld, tentToWorld, coverBase, ROCK_SOLIDS, LANDING_SOLID, centroid2, type WPiece, type RockSolid, type Shack,
} from "../../../../../shared/pois/wreck-bay";
import { sacksIn, lantern } from "./ship";
import { pirateCrate, cask, bonfire, CRATE_TONES } from "./props";

const soft = (c: string, k = 0.45, bright = 1.0) => new THREE.Color(1, 1, 1).lerp(new THREE.Color(c), k).multiplyScalar(bright);
const ROPE = "#b89f6c", DECKC = "#c9a27a", TIMBER = "#9a7450", TARP = "#fbe08a";
/** the camp tent: a saturated banana-yellow sailcloth (the huts keep the paler TARP) */
const TENTC = "#f6c43c";
const W = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => M(x, y, z, yaw, pitch, roll, sx, sy, sz);
type Ground = (x: number, z: number) => number;
export interface ShoreBins { main: (x: number, z: number) => TownBins; near: (x: number, z: number) => TownBins; fine: (x: number, z: number) => TownBins }
export interface ItemBins { main: TownBins; near: TownBins; fine: TownBins; lod1: TownBins }

function post(b: TownBins, x: number, z: number, y0: number, y1: number, r: number, rng: () => number, c = TIMBER) {
  const h = y1 - y0; if (h <= 0.05) return;
  b.wood.add(cylGeo(r * 0.9, r, h, 8), W(x, y0 + h / 2, z, rng() * 6, (rng() - 0.5) * 0.03, (rng() - 0.5) * 0.03), soft(c, 0.55, 0.9 + rng() * 0.15),
    (px, py, pz, bb, o) => { if (py < 0.25) o.lerp(new THREE.Color("#3e3a26"), 0.6); });
}
function ropeLine(b: TownBins, a: THREE.Vector3, c: THREE.Vector3, r: number, sag: number, color = ROPE) {
  b.rope.add(tubeGeo(catenary(a, c, sag, 8), r, 4, false, 10), null, col(color));
}

// ------------------------------------------------------------------------------------------------ world pieces
function drawWorldPiece(S: ShoreBins, p: WPiece, rng: () => number, g: Ground) {
  const [cx, cy, cz] = p.c, [hx, hy, hz] = p.h;
  const m = W(cx, cy, cz, p.yaw ?? 0);
  const main = S.main(cx, cz), near = S.near(cx, cz), fine = S.fine(cx, cz);
  const uvo = (): [number, number] => [rng() * 3, rng() * 3];
  switch (p.k) {
    case "plank": {
      const sag = (rng() - 0.5) * 0.04;
      main.woodDark.box(hx * 2 - 0.04 - rng() * 0.05, hy * 2, hz * 2 - rng() * 0.2, m.clone().multiply(W(0, 0, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.06, 0, sag)), soft(DECKC, 0.5, 0.85 + rng() * 0.25), uvo());
      return;
    }
    case "platform": {
      // plank deck on joists over the landing rock
      const n = Math.round((hz * 2) / 0.24);
      for (let i = 0; i < n; i++) main.woodDark.box(hx * 2 - rng() * 0.1, 0.07, 0.22, m.clone().multiply(W(0, hy - 0.035, -hz + (i + 0.5) * (hz * 2 / n))), soft(DECKC, 0.5, 0.88 + rng() * 0.2), uvo());
      for (const s of [-1, 0, 1]) main.wood.box(0.16, hy * 2 - 0.07, hz * 2, m.clone().multiply(W(s * (hx - 0.2), -0.035, 0)), soft("#6a4a30", 0.6, 0.85));
      return;
    }
    case "bwdeck": {
      // boardwalk section: planks across, two stringers, piles to the seabed at both ends
      const n = Math.round((hx * 2) / 0.26);
      for (let i = 0; i < n; i++) main.woodDark.box(0.24, 0.07, hz * 2 - rng() * 0.12, m.clone().multiply(W(-hx + (i + 0.5) * (hx * 2 / n), hy - 0.035, (rng() - 0.5) * 0.05)), soft(DECKC, 0.5, 0.85 + rng() * 0.22), uvo());
      for (const s of [-1, 1]) main.wood.box(hx * 2, 0.18, 0.14, m.clone().multiply(W(0, -0.09, s * (hz - 0.2))), soft("#6a4a30", 0.6, 0.85));
      for (const s of [-1, 1]) {
        const q = new THREE.Vector3(-hx + 0.1, 0, s * (hz - 0.1)).applyMatrix4(m);
        post(main, q.x, q.z, g(q.x, q.z) - 0.6, cy + hy - 0.02, 0.13, rng);
      }
      // rope rail on the east side (posts + two ropes)
      const a = new THREE.Vector3(-hx, 0, hz - 0.05).applyMatrix4(m), b2 = new THREE.Vector3(hx, 0, hz - 0.05).applyMatrix4(m);
      post(near, a.x, a.z, cy + hy - 0.05, cy + hy + 1.05, 0.06, rng);
      ropeLine(near, a.clone().setY(cy + hy + 1.0), b2.clone().setY(cy + hy + 1.0), 0.025, 0.14);
      ropeLine(near, a.clone().setY(cy + hy + 0.55), b2.clone().setY(cy + hy + 0.55), 0.02, 0.1);
      return;
    }
    case "landrock": return; // drawn as a sculpted rock (below)
    case "wstair": main.woodDark.box(hx * 2, hy * 2, hz * 2, m, soft(DECKC, 0.45, 0.9), uvo()); near.wood.box(hx * 2 + 0.02, 0.05, hz * 2, m.clone().multiply(W(0, hy - 0.025, 0)), soft("#6a4a30", 0.6, 0.95)); return;
    case "stair": main.woodDark.box(hx * 2, hy * 2, hz * 2, m, soft(DECKC, 0.45, 0.88), uvo()); return;
    case "hutfloor": main.woodDark.box(hx * 2, hy * 2, hz * 2, m, soft(DECKC, 0.5, 0.92), uvo()); return;
    case "porch": main.woodDark.box(hx * 2, hy * 2, hz * 2, m, soft(DECKC, 0.5, 0.95), uvo()); return;
    case "hutwall": {
      main.thatch.box(hx * 2, hy * 2, hz * 2, m, soft("#f0d49a", 0.45, 1.25), uvo(), (x, y, z, bb, o) => { o.multiplyScalar(0.85 + 0.2 * noise3(x * 0.8, y * 0.5, z * 0.8)); });
      // lashing bands top + bottom
      near.rope.box(hx * 2 + 0.01, 0.06, hz * 2 + 0.04, m.clone().multiply(W(0, hy - 0.2, 0)), col("#8a6a3a"));
      return;
    }
    case "ceiling": near.trim.box(hx * 2, hy * 2, hz * 2, m, soft("#b08a5a", 0.5, 0.8)); return;
    case "cot": {
      near.wood.box(hx * 2, 0.12, hz * 2, m.clone().multiply(W(0, 0.05, 0)), soft("#7a5232", 0.6, 0.9));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) near.wood.box(0.08, hy * 2 - 0.1, 0.08, m.clone().multiply(W(sx * (hx - 0.08), -0.08, sz * (hz - 0.08))), soft("#6a4428", 0.6, 0.9));
      fine.louvre.box(hx * 2 - 0.1, 0.12, hz * 2 - 0.06, m.clone().multiply(W(0, hy - 0.02, 0)), soft("#e8d7a8", 0.6, 1.0));
      fine.louvre.box(0.45, 0.1, hz * 2 - 0.15, m.clone().multiply(W(-hx + 0.3, hy + 0.08, 0)), soft("#f2e6c2", 0.5, 1.0));
      return;
    }
    case "table": {
      near.wood.box(hx * 2, 0.07, hz * 2, m.clone().multiply(W(0, hy - 0.035, 0)), soft("#9a6e44", 0.6, 1.0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) near.wood.box(0.07, hy * 2 - 0.07, 0.07, m.clone().multiply(W(sx * (hx - 0.08), -0.035, sz * (hz - 0.08))), soft("#6a4428", 0.6, 0.9));
      lantern(fine, m.clone().multiply(W(0.15, hy + 0.62, 0.05)));
      fine.metal.add(cylGeo(0.09, 0.07, 0.12, 8), m.clone().multiply(W(-0.2, hy + 0.06, -0.1)), col("#8a8a88"));
      return;
    }
    case "crates": {
      // hand-built plank crates (props.ts), the stack's top = the collider top
      const n = Math.max(1, Math.round((hy * 2) / 0.6)), h = (hy * 2) / n;
      for (let i = 0; i < n; i++) pirateCrate(near, m.clone().multiply(W((rng() - 0.5) * 0.02, -hy + i * h, (rng() - 0.5) * 0.02, (rng() - 0.5) * 0.05)), hx * 2 - 0.02, h, hz * 2 - 0.02, rng, CRATE_TONES[Math.floor(rng() * 4)], i === n - 1);
      return;
    }
    case "barrels": {
      const n = Math.max(1, Math.round(hx * 2 / 0.64)), r = Math.min(hx / n, hz) * 0.97;
      for (let i = 0; i < n; i++) cask(near, m.clone().multiply(W(-hx + (i + 0.5) * (hx * 2 / n), -hy, 0, rng() * 6)), r, hy * 2, rng, ["#8a5a32", "#7a4e2c"][i % 2]);
      return;
    }
    case "sacks": sacksIn(fine, m, hx, hy, hz, rng); return;
    case "log": {
      main.wood.add(cylGeo(hx * 1.2, hx * 1.32, hy * 2, 10), m, soft(TIMBER, 0.6, 0.9), (x, y, z, bb, o) => { if (y < g(x, z) + 0.3) o.lerp(new THREE.Color("#3e3a26"), 0.5); });
      return;
    }
    case "towerfloor": {
      const n = Math.round((hx * 2) / 0.25);
      for (let i = 0; i < n; i++) main.woodDark.box(0.23, hy * 2, hz * 2 - rng() * 0.08, m.clone().multiply(W(-hx + (i + 0.5) * (hx * 2 / n), 0, 0)), soft(DECKC, 0.5, 0.86 + rng() * 0.2), uvo());
      main.wood.box(hx * 2, 0.16, 0.14, m.clone().multiply(W(0, -hy - 0.08, hz - 0.1)), soft("#6a4a30", 0.6, 0.85));
      main.wood.box(hx * 2, 0.16, 0.14, m.clone().multiply(W(0, -hy - 0.08, -hz + 0.1)), soft("#6a4a30", 0.6, 0.85));
      return;
    }
    case "towerrail": {
      main.wood.box(hx * 2, 0.1, 0.12, m.clone().multiply(W(0, hy - 0.05, 0)), soft(TIMBER, 0.6, 0.95));
      main.wood.box(hx * 2, 0.08, 0.08, m.clone().multiply(W(0, -0.05, 0)), soft(TIMBER, 0.6, 0.9));
      const n = Math.max(1, Math.round(hx * 2 / 1.1));
      for (let i = 0; i <= n; i++) main.wood.box(0.1, hy * 2, 0.1, m.clone().multiply(W(-hx + i * (hx * 2 / n), 0, 0)), soft(TIMBER, 0.6, 0.9));
      // woven palm-leaf screen on the lower half
      near.louvre.box(hx * 2, hy * 0.9, 0.03, m.clone().multiply(W(0, -hy * 0.5, 0.05)), soft("#c8a45c", 0.7, 0.85));
      return;
    }
    case "towerroof": {
      // pitched sailcloth canopy on a ridge pole (visual) over the collider slab (hidden inside the canopy)
      main.wood.box(hx * 2, 0.14, 0.14, m.clone().multiply(W(0, 1.3, 0)), soft(TIMBER, 0.6, 0.9));
      for (const s of [-1, 1]) {
        const run = hz + 0.1, ang = Math.atan2(1.3, run), len = Math.hypot(1.3, run);
        main.louvre.box(hx * 2 + 0.2, 0.05, len, m.clone().multiply(W(0, 0.65, s * run / 2, 0, s * ang, 0)), soft(TARP, 0.8, 1.05));
      }
      main.woodDark.box(hx * 2, hy * 2, hz * 2, m, soft("#8a6a44", 0.5, 0.8));
      return;
    }
    case "pole": main.wood.add(cylGeo(0.075, 0.09, hy * 2, 7), m, soft(TIMBER, 0.6, 0.9)); return;
    case "flagpole": main.wood.add(cylGeo(0.05, 0.07, hy * 2, 8), m, soft(TIMBER, 0.6, 0.9)); return;
    case "firering": return; // drawn with the fire
    case "coaming": main.wood.box(hx * 2, hy * 2, hz * 2, m, soft("#6a4a30", 0.6, 1.0)); return;
    default: return; // collider-only kinds (bridgecol, ropewall, stiltskirt, rooftier, cover, trunk)
  }
}

// ------------------------------------------------------------------------------------------------ hut roofs + trim
function hutDressing(B: ItemBins, s: Shack, rng: () => number, g: Ground, glowsOut: THREE.Vector3[]) {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  const L = (lx: number, ly: number, lz: number, yaw = 0, pitch = 0, roll = 0) => W(s.x + lx * c + lz * sn, ly, s.z - lx * sn + lz * c, s.yaw + yaw, pitch, roll);
  const hw = s.w / 2, hd = s.d / 2, H = s.wallH, top = s.y + H + 0.12, ov = 0.45, span = hd + ov;
  // stilts (log posts to the ground) + corner posts
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) {
    const [x, z] = shackToWorld(s, sx * (hw - 0.15), sz * (hd - 0.15));
    post(B.main, x, z, g(x, z) - 0.5, s.y - 0.2, 0.14, rng);
    if (sx !== 0) post(B.main, x, z, s.y, top, 0.1, rng, "#8a6a44");
  }
  if (s.porch > 0) for (const sx of [-1, 1]) {
    const [x, z] = shackToWorld(s, sx * (hw - 0.2), hd + s.porch - 0.15);
    post(B.main, x, z, g(x, z) - 0.5, s.y - 0.2, 0.12, rng);
    post(B.main, x, z, s.y, top - 0.15, 0.08, rng, "#8a6a44"); // porch roof posts (the roof overhang reaches them)
  }
  // roof: two sailcloth slopes over bamboo rafters + a ridge pole; gable triangles in bamboo
  const ang = Math.atan2(s.rise, span), len = Math.hypot(s.rise, span);
  for (const sg of [1, -1]) {
    const reach = sg > 0 && s.porch > 0 ? s.porch * 0.9 : 0; // the front slope extends over the porch
    const l2 = len + reach / Math.cos(ang);
    B.main.louvre.add(new THREE.BoxGeometry(s.w + 2 * ov, 0.06, l2, 1, 1, 6), L(0, top + s.rise / 2 - (reach * Math.tan(ang)) / 2, sg * (span + reach) / 2, 0, sg * ang, 0), soft(sg > 0 ? TARP : "#f4d27a", 0.8, 1.05),
      (x, y, z, bb, o) => { o.multiplyScalar(0.86 + 0.18 * noise3(x * 0.7, y, z * 0.7)); });
    for (let i = 0; i <= 5; i++) B.near.thatch.add(cylGeo(0.05, 0.05, l2, 6), L(-hw - ov + 0.2 + i * (s.w + 2 * ov - 0.4) / 5, top + s.rise / 2 - 0.08 - (reach * Math.tan(ang)) / 2, sg * (span + reach) / 2, 0, Math.PI / 2 + sg * ang, 0), soft("#c8a060", 0.6, 0.95));
  }
  B.main.thatch.add(cylGeo(0.09, 0.09, s.w + 2 * ov + 0.3, 8), L(0, top + s.rise + 0.02, 0, 0, 0, Math.PI / 2), soft("#b89050", 0.6, 0.95));
  for (const sx of [-1, 1]) {
    const shp = new THREE.Shape(); shp.moveTo(-hd, 0); shp.lineTo(hd, 0); shp.lineTo(0, s.rise * (hd / span) + (s.rise * ov / span)); shp.closePath();
    const gg = new THREE.ExtrudeGeometry(shp, { depth: 0.12, bevelEnabled: false }); gg.translate(0, 0, -0.06);
    boxProjectUV(gg, 1);
    B.main.thatch.add(gg, L(sx * (hw - 0.06), top - 0.05, 0, Math.PI / 2), soft("#d8b47a", 0.5, 0.95));
  }
  // door + window frames (driftwood), a hanging sailcloth door flap, shutters propped open
  const fr = soft("#7a5a3a", 0.6, 0.95);
  const frame = (side: 0 | 1 | 2 | 3, u: number, v0: number, v1: number, w: number) => {
    const [lx, lz, yaw] = side === 0 ? [-hw + u, hd + 0.02, 0] : side === 2 ? [hw - u, -hd - 0.02, Math.PI] : side === 1 ? [hw + 0.02, hd - u, Math.PI / 2] : [-hw - 0.02, -hd + u, -Math.PI / 2];
    B.near.wood.box(w + 0.2, 0.1, 0.1, L(lx, s.y + v1 + 0.05, lz, yaw), fr);
    if (v0 > 0.05) B.near.wood.box(w + 0.24, 0.08, 0.16, L(lx, s.y + v0 - 0.04, lz, yaw), fr);
    for (const e of [-1, 1]) B.near.wood.box(0.1, v1 - v0, 0.1, L(lx + (side === 0 ? e * (w / 2 + 0.05) : side === 2 ? -e * (w / 2 + 0.05) : 0), s.y + (v0 + v1) / 2, lz + (side === 1 ? -e * (w / 2 + 0.05) : side === 3 ? e * (w / 2 + 0.05) : 0), yaw), fr);
  };
  frame(0, s.doorU, 0, 2.2, 1.2);
  for (const [side, u] of s.windows) frame(side, u, 1.0, 1.85, 1.1);
  // door flap rolled up over the door
  B.near.louvre.add(cylGeo(0.12, 0.12, 1.3, 8), L(-hw + s.doorU, s.y + 2.12, hd + 0.08, 0, 0, Math.PI / 2), soft("#d84a2a", 0.7, 0.95));
  // lantern by the door + a rope line with drying cloth
  const [lx, lz] = [-hw + s.doorU + 0.9, hd + 0.18];
  lantern(B.near, L(lx, s.y + 2.3, lz));
  glowsOut.push(new THREE.Vector3(...(() => { const [x, z] = shackToWorld(s, lx, lz); return [x, s.y + 1.88, z] as [number, number, number]; })()));
  // (the interior — furniture, lantern, rug, clutter, loot slots — is the shared interiors kit: INTERIOR_ROOMS)
  // LOD1
  const lb = B.lod1;
  lb.thatch.box(s.w, H, s.d, L(0, s.y + H / 2, 0), soft("#d8b47a", 0.5, 0.9));
  lb.woodDark.box(s.w, 0.3, s.d + (s.porch || 0), L(0, s.y - 0.15, (s.porch || 0) / 2), soft(DECKC, 0.5, 0.8));
  for (const sg of [1, -1]) lb.louvre.box(s.w + 2 * ov, 0.08, len, L(0, top + s.rise / 2, sg * span / 2, 0, sg * ang, 0), soft("#f0c040", 0.85, 0.95));
  void rng;
}

// ------------------------------------------------------------------------------------------------ rocks
const _rockCache = new Map<string, THREE.BufferGeometry>();
function rockProto(seed: number, big: boolean): THREE.BufferGeometry {
  const key = `${seed}|${big}`;
  let g = _rockCache.get(key);
  if (!g) {
    g = big
      ? sculptRock(seed, { res: 18, cuts: 3, round: 0.05, boxy: 6.0, strata: 1.2, sideCuts: 0.3, base: -0.97, lump: 0.035, chips: 2, ext: [1, 0.9, 0.95] })
      : sculptRock(seed, { res: 12, cuts: 8, round: 0.12, boxy: 2.4, strata: 0.4, sideCuts: 0.55, base: -0.8, lump: 0.07, chips: 3, ext: [1, 0.8, 0.9] });
    if (g.index) g = g.toNonIndexed();
    g.computeBoundingBox();
    const bb = g.boundingBox!, sx = 2 / (bb.max.x - bb.min.x), sy = 2 / (bb.max.y - bb.min.y), sz = 2 / (bb.max.z - bb.min.z);
    g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    g.scale(sx, sy, sz); // → x,z ∈ [−1, 1], y ∈ [0, 2]
    g.computeVertexNormals();
    if (big) flattenTop(g);
    _rockCache.set(key, g);
  }
  return g;
}
/** a cliff tier's top = the flat ledge its collider box stands on: every up-facing face in the upper half is lifted
 *  onto the y = 2 plane (welded: all copies of a moved position move, the side faces stretch up to meet it) — the random
 *  cut planes would otherwise leave the top up to a metre under the box top (kongs floating over the plateau) */
function flattenTop(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute, n = p.count;
  const key = (i: number) => `${Math.round(p.getX(i) * 1000)},${Math.round(p.getY(i) * 1000)},${Math.round(p.getZ(i) * 1000)}`;
  const lift = new Set<string>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const f = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if (f.y > 0.45 && Math.min(a.y, b.y, c.y) > 1.15) for (let k = 0; k < 3; k++) lift.add(key(i + k));
  }
  const keys: string[] = []; for (let i = 0; i < n; i++) keys.push(key(i));
  for (let i = 0; i < n; i++) if (lift.has(keys[i])) p.setY(i, 2);
  p.needsUpdate = true;
  g.computeVertexNormals();
}
/** smooth (area-weighted, position-welded) normals on a non-indexed mesh: the sculpted rock reads rounded + chiselled
 *  instead of flat-shaded facets, while its per-face box-projected UVs stay unsmeared */
function smoothNormals(g: THREE.BufferGeometry, crease = 0.35) {
  const p = g.attributes.position as THREE.BufferAttribute, n = p.count;
  const acc = new Map<number, THREE.Vector3>();
  const key = (i: number) => { const x = Math.round(p.getX(i) * 200), y = Math.round(p.getY(i) * 200), z = Math.round(p.getZ(i) * 200); return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0; };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn: THREE.Vector3[] = [];
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const f = b.clone().sub(a).cross(c.clone().sub(a)); // area-weighted
    fn.push(f.clone().normalize());
    for (let k = 0; k < 3; k++) { const kk = key(i + k); const v = acc.get(kk); if (v) v.add(f); else acc.set(kk, f.clone()); }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const sm = acc.get(key(i))!.clone().normalize(), f = fn[Math.floor(i / 3)];
    // keep hard chisel edges where the smooth normal strays far from the face (crease)
    const v = sm.dot(f) < crease ? f : sm;
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  g.setAttribute("normal", new THREE.BufferAttribute(out, 3));
}
const MOSS = new THREE.Color("#6f8a3a"), WETR = new THREE.Color("#4a4034"), SANDC = new THREE.Color("#cdb892");
const STRATA = new THREE.Color("#a98f8e"), ROSE = new THREE.Color("#e2b8a2");
/** a faceted rock SOLID (shared ROCK_SOLIDS — exactly what the sim collides with): the rings become facet quads, each
 *  subdivided and nudged ≤ amp along the radius by a world-space noise (a chiselled face, crack-free: shared vertices
 *  move together), the top a low fan. Flat-shaded facets with smooth shading inside a facet. */
function solidGeo(s: RockSolid): THREE.BufferGeometry {
  const R = s.rings, n = R[0].pts.length, cliff = s.kind === "cliff";
  const [ax, az] = centroid2(R[0].pts), amp = cliff ? 0.1 : 0.045, cell = cliff ? 1.4 : 0.55;
  const nudge = (x: number, y: number, z: number): [number, number, number] => {
    const dx = x - ax, dz = z - az, l = Math.hypot(dx, dz) || 1;
    const k = amp * (noise3(x * 0.9, y * (cliff ? 0.35 : 0.9), z * 0.9) * 2 - 1) * (y > R[R.length - 1].y - 0.01 ? 0 : 1);
    return [x + (dx / l) * k, y, z + (dz / l) * k];
  };
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[], ox: number, oz: number) => {
    // outward winding: the face normal must point away from the rock axis (ox, oz) / up for the cap
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - ox, mz = (a[2] + b[2] + c[2]) / 3 - oz;
    const out = Number.isNaN(ox) ? ny > 0 : nx * mx + nz * mz > 0;
    if (out) pos.push(...a, ...b, ...c); else pos.push(...a, ...c, ...b);
  };
  for (let j = 0; j < R.length - 1; j++) {
    const A = R[j], B = R[j + 1];
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const p00 = [A.pts[i][0], A.y, A.pts[i][1]], p10 = [A.pts[i2][0], A.y, A.pts[i2][1]], p01 = [B.pts[i][0], B.y, B.pts[i][1]], p11 = [B.pts[i2][0], B.y, B.pts[i2][1]];
      const su = Math.max(1, Math.ceil(Math.hypot(p10[0] - p00[0], p10[2] - p00[2]) / cell)), sv = Math.max(1, Math.ceil((B.y - A.y) / cell));
      const at = (u: number, v: number) => { const q = [0, 1, 2].map((k) => (p00[k] * (1 - u) + p10[k] * u) * (1 - v) + (p01[k] * (1 - u) + p11[k] * u) * v); return nudge(q[0], q[1], q[2]); };
      for (let a = 0; a < su; a++) for (let b = 0; b < sv; b++) {
        const q00 = at(a / su, b / sv), q10 = at((a + 1) / su, b / sv), q01 = at(a / su, (b + 1) / sv), q11 = at((a + 1) / su, (b + 1) / sv);
        tri(q00, q10, q11, ax, az); tri(q00, q11, q01, ax, az);
      }
    }
  }
  // the cap: a fan to the (slightly raised) centre, split in rings so the top reads as a worn dome, not a lid
  const T = R[R.length - 1], [cx, cz] = centroid2(T.pts), cy = T.y + s.capRise;
  for (let i = 0; i < n; i++) {
    const a = T.pts[i], b = T.pts[(i + 1) % n];
    const m = (p: number[], t: number) => [cx + (p[0] - cx) * t, T.y + (cy - T.y) * (1 - t * t), cz + (p[1] - cz) * t];
    const a1 = m(a, 0.55), b1 = m(b, 0.55);
    tri([a[0], T.y, a[1]], [b[0], T.y, b[1]], b1, NaN, NaN); tri([a[0], T.y, a[1]], b1, a1, NaN, NaN);
    tri(a1, b1, [cx, cy, cz], NaN, NaN);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** draw a solid: box-projected UVs on the flat facets, smooth shading inside a facet (hard 45° edges stay hard), vertex
 *  colour: grey-mauve sandstone strata (cliffs) / warm grey (boulders), moss on the up faces, the wet band at the sea */
function addSolid(bins: TownBins, s: RockSolid, wet: boolean, onSand: boolean) {
  const g0 = solidGeo(s), cliff = s.kind === "cliff";
  boxProjectUV(g0, 1);
  smoothNormals(g0, 0.9);
  const pos = g0.attributes.position as THREE.BufferAttribute, nor = g0.attributes.normal as THREE.BufferAttribute;
  const c = new Float32Array(pos.count * 3), base = new THREE.Color(cliff ? "#dedaec" : "#ddd2c6"), t = new THREE.Color();
  const yb = s.rings[1].y, top = s.top;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nor.getY(i);
    const n = noise3(x * 0.25, y * 0.25, z * 0.25);
    t.copy(base).multiplyScalar(0.84 + 0.28 * n);
    if (cliff) {
      // sandstone strata: thin darker bands + warm rose beds, wobbling along the face
      const st = Math.sin((y + n * 1.6) * 2.3), st2 = Math.sin((y + n * 0.8) * 0.71 + 1.3);
      if (st > 0.72) t.lerp(STRATA, 0.25 * (st - 0.72) / 0.28);
      if (st2 > 0.4) t.lerp(ROSE, 0.15 * (st2 - 0.4));
      // rain streaks / darker cracks below the lips
      const lipD = Math.min(top - y, 4) / 4; t.multiplyScalar(0.92 + 0.08 * lipD);
    }
    if (ny > 0.55 && (y > yb + 0.5 || cliff)) t.lerp(MOSS, Math.min(0.85, (ny - 0.55) * 2.2) * (0.6 + 0.6 * n));
    if (wet && y < 0.45) t.lerp(WETR, Math.min(0.8, (0.45 - y) * 0.9));
    else if (onSand && y < yb + 0.9) t.lerp(SANDC, 0.28 * (yb + 0.9 - y));
    c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b;
  }
  g0.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  (cliff ? bins.stone : bins.rock).add(g0, null, 0xffffff);
}

// ------------------------------------------------------------------------------------------------ build
export async function buildShore(S: ShoreBins, items: { hut: (s: Shack) => ItemBins; tower: ItemBins }, rng: () => number, g: Ground, yieldTask: () => Promise<void> = async () => {}) {
  const glows: THREE.Vector3[] = [];
  { let t = performance.now();
    for (const p of PIECES) if (p.f === "world" && p.col < 2) { drawWorldPiece(S, p, rng, g); if (performance.now() - t > 30) { await yieldTask(); t = performance.now(); } } }
  await yieldTask();

  // ---- the rope bridge: two hand ropes + two foot ropes (catenary), vertical hangers every 2 planks, the A-frame
  {
    const pl = BRIDGE.planks, n = pl.length;
    const side = (i: number, s: number, dy: number) => { const p = pl[i]; const nx = Math.sin(p.yaw) * s * (BRIDGE.w / 2 + 0.05), nz = Math.cos(p.yaw) * s * (BRIDGE.w / 2 + 0.05); return new THREE.Vector3(p.x + nx, p.y + dy, p.z + nz); };
    const nb = S.near(pl[n >> 1].x, pl[n >> 1].z), mb = S.main(pl[n >> 1].x, pl[n >> 1].z);
    for (const s of [1, -1]) {
      const hand: THREE.Vector3[] = [], foot: THREE.Vector3[] = [];
      for (let i = 0; i < n; i += 2) { hand.push(side(i, s, 1.05 + 0.1 * Math.sin((i / n) * Math.PI))); foot.push(side(i, s, -0.05)); }
      hand.push(side(n - 1, s, 1.05)); foot.push(side(n - 1, s, -0.05));
      mb.rope.add(tubeGeo(hand, 0.04, 5, false, hand.length * 2), null, col(ROPE));
      mb.rope.add(tubeGeo(foot, 0.035, 5, false, foot.length * 2), null, col(ROPE, 0.9));
      for (let i = 0; i < hand.length; i++) nb.rope.add(tubeGeo([foot[i], hand[i]], 0.015, 3, false, 2), null, col(ROPE, 0.95));
      // a netting zig-zag between the hangers
      for (let i = 0; i < hand.length - 1; i++) nb.rope.add(tubeGeo([foot[i], hand[i].clone().lerp(hand[i + 1], 0.5).setY((hand[i].y + foot[i].y) / 2 + 0.2), foot[i + 1]], 0.01, 3, false, 4), null, col(ROPE, 0.85));
    }
    // A-frame on the landing: two leaning posts per side, a cross beam, ropes tied down to the rock
    const a = BRIDGE.a;
    const yaw = pl[0].yaw;
    for (const s of [1, -1]) {
      const nx = Math.sin(yaw) * s * (BRIDGE.w / 2 + 0.25), nz = Math.cos(yaw) * s * (BRIDGE.w / 2 + 0.25);
      post(mb, a[0] + nx, a[2] + nz, LANDING.top - 0.3, LANDING.top + 2.2, 0.13, rng);
      ropeLine(nb, new THREE.Vector3(a[0] + nx, LANDING.top + 2.1, a[2] + nz), new THREE.Vector3(a[0] + nx * 0.8, LANDING.top + 1.05, a[2] + nz * 0.8), 0.03, 0.05);
    }
    mb.wood.box(0.16, 0.16, BRIDGE.w + 0.8, W(a[0], LANDING.top + 2.1, a[2], yaw), soft(TIMBER, 0.6, 0.9));
    // at the ship end: the ropes tie to the bulwark (short lashings)
    glows.push(new THREE.Vector3(a[0], LANDING.top + 2.4, a[2]));
    lantern(nb, W(a[0], LANDING.top + 2.05, a[2]));
  }
  // ---- the sea-side boarding stair's hand ropes: posts every 6 treads on both edges, a hand rope + a mid rope
  {
    const Bd = BOARDING, pts: Array<{ k: number; top: number }> = [];
    for (let i = 0; i < Bd.n; i++) { const top = Bd.yTop - (Bd.n - 1 - i) * Bd.rise; if (top >= BOARD_RAIL_Y0) pts.push({ k: Bd.k0 - (Bd.n - 1 - i) * Bd.run - Bd.run / 2, top }); }
    if (pts.length > 1) {
      const [mx, mz] = Bd.at(pts[pts.length >> 1].k, Bd.cOff), nb = S.near(mx, mz), mb = S.main(mx, mz);
      for (const e of [-1, 1]) {
        const at = (q: { k: number; top: number }, dy: number) => { const [x, z] = Bd.at(q.k, Bd.cOff + e * (Bd.W / 2 + 0.04)); return new THREE.Vector3(x, q.top + dy, z); };
        const sel = pts.filter((_, i) => i % 6 === 0 || i === pts.length - 1);
        for (const q of sel) { const v = at(q, 0); post(mb, v.x, v.z, q.top - 0.24, q.top + 1.08, 0.06, rng); }
        mb.rope.add(tubeGeo(sel.map((q) => at(q, 1.02)), 0.035, 5, false, sel.length * 2), null, col(ROPE));
        nb.rope.add(tubeGeo(sel.map((q) => at(q, 0.55)), 0.025, 4, false, sel.length * 2), null, col(ROPE, 0.9));
      }
    }
  }
  // ---- the landing rock under the platform
  addSolid(S.main(LANDING.x, LANDING.z), LANDING_SOLID, true, false);
  // ---- rocks (headland = the first five, sculpted cliff blocks; the rest poly boulders)
  // headland blocks: the chunky stratified sculpt (cliff ledges); boulders: the rounded one
  await yieldTask();
  for (const [i, r] of ROCKS.entries()) {
    // headland: ONE stratified sandstone mass per tier, sized to that tier's collider box (a continuous cliff face with
    // ledges — not a pile of pillow blocks); boulders: their single block
    for (const sd of ROCK_SOLIDS[i]) addSolid(S.main(r.x, r.z), sd, i < HEADLAND || g(r.x, r.z) < 0.1, i >= HEADLAND && sd.rings[1].y > -0.6);
    if (i < HEADLAND || i % 4 === 3) await yieldTask();
  }
  await yieldTask();
  // ---- huts (dressing, roofs, stilts) + the tower's extras
  for (const s of SHACKS) hutDressing(items.hut(s), s, rng, g, glows);
  {
    const T = TOWER, B = items.tower;
    // cross braces between the legs + a banana-yellow pennant on a pole + a spyglass on the rail
    const hw = T.w / 2 + 0.12;
    for (const [ax, az, bx, bz] of [[-hw, -hw, hw, -hw], [hw, -hw, hw, hw], [hw, hw, -hw, hw], [-hw, hw, -hw, -hw]]) {
      const [x0, z0] = towerToWorld(ax, az), [x1, z1] = towerToWorld(bx, bz);
      for (const [y0, y1] of [[T.g + 0.2, T.l1 - 0.3], [T.l1 - 0.3, T.g + 0.2]]) {
        const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        B.main.wood.add(cylGeo(0.07, 0.07, a.distanceTo(b), 6), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), soft(TIMBER, 0.6, 0.85));
      }
    }
    const [px, pz] = towerToWorld(T.w / 2 - 0.3, -T.w / 2 + 0.3);
    B.main.fabric.add(new THREE.PlaneGeometry(1.8, 0.9, 4, 1), W(px + 0.95 * Math.cos(T.yaw + 0.4), T.roof + 1.95, pz - 0.95 * Math.sin(T.yaw + 0.4), T.yaw + 0.4), soft("#f2c53a", 0.9, 1.0));
    B.main.wood.box(1.6, 0.08, 0.08, W(px, T.l2 + 2.6, pz, T.yaw + 0.8), soft(TIMBER, 0.6, 0.9));
    B.lod1.wood.box(T.w, T.l2 - T.g, T.w, W(T.x, (T.g + T.l2) / 2, T.z, T.yaw), soft(TIMBER, 0.6, 0.7));
    { const q = new THREE.Vector3(px + 0.7 * Math.cos(T.yaw + 0.8), T.l2 + 2.55, pz - 0.7 * Math.sin(T.yaw + 0.8)); lantern(B.near, W(q.x, q.y, q.z)); glows.push(new THREE.Vector3(q.x, q.y - 0.42, q.z)); }
  }
  await yieldTask();
  // ---- the sailcloth tent: ridge canvas (back wall → ridge → front awning) with sag between the poles, a back wall,
  //      guy ropes, treasure + stores under it
  {
    const T = TENT;
    const Lt = (lx: number, ly: number, lz: number) => { const [x, z] = tentToWorld(lx, lz); return new THREE.Vector3(x, ly, z); };
    const nx = 14, nz = 10, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const W2 = T.w / 2 + 0.35, D2 = T.d / 2;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / nz, lx = (u - 0.5) * 2 * W2, lz = (v - 0.5) * 2 * (D2 + 0.25);
      const base = lz < 0 ? T.back + (T.ridge - T.back) * (1 + lz / D2) : T.ridge - (T.ridge - T.awning) * (lz / D2);
      const sag = 0.22 * Math.sin(Math.min(1, Math.abs(lx) / (T.w / 2)) * Math.PI) * (0.4 + 0.6 * Math.abs(lz) / D2);
      const p = Lt(lx, T.g + base + 0.08 - sag, lz);
      pos.push(p.x, p.y, p.z); uv.push(lx, lz + (base - T.back) * 0.8);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a2 = j * (nx + 1) + i; idx.push(a2, a2 + nx + 1, a2 + 1, a2 + 1, a2 + nx + 1, a2 + nx + 2); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
    const B = S.main(T.x, T.z), N = S.near(T.x, T.z), F = S.fine(T.x, T.z);
    B.louvre.add(tg, null, col(TENTC), (x, y, z, bb, o) => { o.multiplyScalar(0.86 + 0.18 * noise3(x * 0.6, y * 0.6, z * 0.6)); });
    // the canvas has body: a rolled hem (rope-stiffened) round its free edges, stitched seams running down the slope, and
    // patches sewn over old tears
    {
      const edge = (i0: number, j0: number, di: number, dj: number, n: number) => {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= n; k++) { const q = ((j0 + dj * k) * (nx + 1) + (i0 + di * k)) * 3; pts.push(new THREE.Vector3(pos[q], pos[q + 1] - 0.02, pos[q + 2])); }
        N.louvre.add(tubeGeo(pts, 0.035, 5, false, n * 2), null, soft("#c8a050", 0.8, 0.95));
      };
      edge(0, 0, 1, 0, nx); edge(0, nz, 1, 0, nx); edge(0, 0, 0, 1, nz); edge(nx, 0, 0, 1, nz);
      for (const i of [3, 7, 11]) {
        const pts: THREE.Vector3[] = [];
        for (let j = 0; j <= nz; j++) { const q = (j * (nx + 1) + i) * 3; pts.push(new THREE.Vector3(pos[q], pos[q + 1] + 0.012, pos[q + 2])); }
        F.louvre.add(tubeGeo(pts, 0.012, 4, false, nz * 2), null, soft("#b89040", 0.8, 0.9));
      }
      for (const [i, j, c] of [[4, 3, "#d8482a"], [9, 6, "#e8c070"], [12, 2, "#c8b890"]] as Array<[number, number, string]>) {
        const q = (j * (nx + 1) + i) * 3, q2 = (j * (nx + 1) + i + 1) * 3, q3 = ((j + 1) * (nx + 1) + i) * 3;
        const p0 = new THREE.Vector3(pos[q], pos[q + 1], pos[q + 2]), ax = new THREE.Vector3(pos[q2], pos[q2 + 1], pos[q2 + 2]).sub(p0), az = new THREE.Vector3(pos[q3], pos[q3 + 1], pos[q3 + 2]).sub(p0);
        const nrm = ax.clone().cross(az).normalize(); if (nrm.y < 0) nrm.negate();
        const pg = new THREE.BufferGeometry().setFromPoints([p0, p0.clone().add(ax), p0.clone().add(az), p0.clone().add(ax), p0.clone().add(ax).add(az), p0.clone().add(az)].map((v) => v.add(nrm.clone().multiplyScalar(0.015))));
        pg.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1], 2)); pg.computeVertexNormals();
        F.louvre.add(pg, null, soft(c, 0.75, 0.95));
      }
    }
    // back wall (canvas) + a scalloped valance along the awning edge
    const bw = Lt(0, 0, -D2);
    B.louvre.box(T.w + 0.5, T.back + 0.1, 0.05, W(bw.x, T.g + (T.back + 0.1) / 2 - 0.02, bw.z, T.yaw), col(TENTC, 0.9));
    for (let i = 0; i < 9; i++) {
      const lx = -W2 + (i + 0.5) * (2 * W2 / 9), q = Lt(lx, 0, D2 + 0.25);
      B.louvre.add(new THREE.CircleGeometry(0.36, 8, Math.PI, Math.PI), W(q.x, T.g + T.awning + 0.02, q.z, T.yaw), i % 2 ? soft("#d8482a", 0.85, 1.0) : col(TENTC));
    }
    // ridge pole + guy ropes to pegs
    { const a2 = Lt(-T.w / 2 - 0.2, T.g + T.ridge + 0.02, 0), b2 = Lt(T.w / 2 + 0.2, T.g + T.ridge + 0.02, 0); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b2.clone().sub(a2).normalize()); B.wood.add(cylGeo(0.07, 0.07, a2.distanceTo(b2), 7), new THREE.Matrix4().compose(a2.clone().add(b2).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), soft(TIMBER, 0.6, 0.9)); }
    for (const sx of [-1, 1]) for (const lz of [0, D2]) {
      const top = Lt(sx * T.w / 2, T.g + (lz ? T.awning : T.ridge), lz), peg = Lt(sx * (T.w / 2 + 1.7), T.g + 0.05, lz + (lz ? 1.4 : 0));
      ropeLine(N, top, peg, 0.018, 0.08);
      N.wood.box(0.06, 0.3, 0.06, W(peg.x, T.g + 0.1, peg.z), soft("#6a4a30", 0.6, 0.9));
    }
    // treasure: two open chests spilling gold + coin scatter, a rug, a hanging lantern
    const chest = (lx: number, lz: number, yaw: number) => {
      const o = Lt(lx, T.g, lz), mm = W(o.x, T.g, o.z, T.yaw + yaw);
      N.wood.box(0.9, 0.5, 0.6, mm.clone().multiply(W(0, 0.25, 0)), soft("#7a4a24", 0.7, 0.95));
      for (const e of [-1, 0, 1]) N.plastic.box(e ? 0.06 : 0.92, e ? 0.52 : 0.06, e ? 0.62 : 0.62, mm.clone().multiply(W(e * 0.3, e ? 0.25 : 0.5, 0)), col("#d8a030"));
      N.wood.box(0.9, 0.08, 0.6, mm.clone().multiply(W(0, 0.72, -0.34, 0, -1.2, 0)), soft("#7a4a24", 0.7, 0.95));
      const gold = new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); gold.scale(1.05, 0.45, 0.7);
      N.plastic.add(gold, mm.clone().multiply(W(0, 0.48, 0)), col("#ffc830"), (x, y, z, bb, o) => { if (noise3(x * 9, y * 9, z * 9) > 0.55) o.multiplyScalar(1.35); });
      for (let k = 0; k < 18; k++) F.plastic.add(cylGeo(0.05, 0.05, 0.012, 8), mm.clone().multiply(W(0.5 + rng() * 0.6, 0.01 + rng() * 0.03, (rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4)), col("#ffd040"));
    };
    chest(1.2, 0.2, 0.25);
    chest(2.4, 0.9, -0.6);
    // the hoard outside the tent: ornate chests (banded, studded, lid thrown back, gold heaped and spilling), coin drifts,
    // a lantern post, a rope coil
    for (const [lx, lz, yw] of TREASURE) {
      const o = Lt(lx, 0, lz), gy = g(o.x, o.z), mm = W(o.x, gy, o.z, T.yaw + yw);
      N.wood.box(0.94, 0.52, 0.64, mm.clone().multiply(W(0, 0.26, 0)), soft("#6a3a1c", 0.75, 0.95), [rng() * 3, rng() * 3]);
      for (const e of [-0.32, 0, 0.32]) N.plastic.box(0.07, 0.54, 0.66, mm.clone().multiply(W(e, 0.26, 0)), col("#e0a830"));
      N.plastic.box(0.98, 0.06, 0.68, mm.clone().multiply(W(0, 0.52, 0)), col("#e0a830"));
      N.plastic.box(0.98, 0.07, 0.68, mm.clone().multiply(W(0, 0.035, 0)), col("#b88422"));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) N.plastic.add(new THREE.SphereGeometry(0.035, 6, 4), mm.clone().multiply(W(sx * 0.47, 0.44, sz * 0.32)), col("#ffd860"));
      // the domed lid thrown back
      // the domed lid, hinged on the back top edge and thrown open ~110° (built closed from the hinge toward +z, then turned)
      const lid = new THREE.CylinderGeometry(0.33, 0.33, 0.96, 12, 1, false, 0, Math.PI); lid.rotateZ(Math.PI / 2); lid.scale(1, 0.6, 1); lid.translate(0, 0, 0.33); lid.rotateX(-1.95);
      const hinge = mm.clone().multiply(W(0, 0.53, -0.32));
      N.wood.add(lid, hinge, soft("#6a3a1c", 0.75, 0.95));
      for (const e of [-0.32, 0.32]) { const band = new THREE.CylinderGeometry(0.34, 0.34, 0.06, 12, 1, true, 0, Math.PI); band.rotateZ(Math.PI / 2); band.scale(1, 0.6, 1); band.translate(e, 0, 0.33); band.rotateX(-1.95); N.plastic.add(band, hinge, col("#e0a830")); }
      // heaped gold + gems, and a spill of coins down the front onto the sand
      const heap = new THREE.SphereGeometry(0.44, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); heap.scale(1.0, 0.5, 0.68);
      N.plastic.add(heap, mm.clone().multiply(W(0, 0.5, 0)), col("#ffc830"), (x, y, z, bb, oc) => { if (noise3(x * 11, y * 11, z * 11) > 0.52) oc.multiplyScalar(1.4); });
      for (const [gx, gz, gc] of [[0.18, 0.1, "#e8304a"], [-0.2, -0.05, "#30a8e8"], [0.02, 0.18, "#40d060"]] as Array<[number, number, string]>) F.glass.add(new THREE.OctahedronGeometry(0.06), mm.clone().multiply(W(gx, 0.7, gz)), col(gc));
      const spill = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); spill.scale(1.0, 0.14, 0.8);
      N.plastic.add(spill, mm.clone().multiply(W(0.05, 0.0, 0.62)), col("#f2b828"), (x, y, z, bb, oc) => { if (noise3(x * 13, y * 13, z * 13) > 0.5) oc.multiplyScalar(1.35); });
      for (let k = 0; k < 22; k++) F.plastic.add(cylGeo(0.05, 0.05, 0.014, 8), mm.clone().multiply(W((rng() - 0.5) * 1.3, 0.02 + rng() * 0.05, 0.5 + rng() * 0.9, 0, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5)), col("#ffd040"));
    }
    {
      // a lantern post among the hoard + a coil of rope
      const o = Lt(-4.9, 0, 1.9), gy = g(o.x, o.z);
      post(N, o.x, o.z, gy - 0.3, gy + 2.1, 0.07, rng);
      N.wood.box(0.5, 0.06, 0.06, W(o.x, gy + 2.05, o.z, T.yaw), soft("#6a4a30", 0.6, 0.9));
      const lp = Lt(-4.9, 0, 2.1);
      lantern(N, W(lp.x, gy + 2.02, lp.z));
      glows.push(new THREE.Vector3(lp.x, gy + 1.6, lp.z));
      const rc = Lt(-3.0, 0, -1.9), rg = g(rc.x, rc.z);
      for (let k = 0; k < 4; k++) F.rope.add(new THREE.TorusGeometry(0.36 - k * 0.07, 0.04, 5, 16), W(rc.x, rg + 0.04 + k * 0.07, rc.z, 0, Math.PI / 2, 0), col("#b89f6c"));
    }
    const rug = Lt(-0.4, 0, 0.2);
    F.louvre.box(2.4, 0.02, 1.6, W(rug.x, T.g + 0.02, rug.z, T.yaw + 0.1), soft("#b8402a", 0.7, 0.9));
    const lamp = Lt(0.2, 0, 0.1);
    lantern(N, W(lamp.x, T.g + T.ridge - 0.6, lamp.z));
    ropeLine(N, new THREE.Vector3(lamp.x, T.g + T.ridge, lamp.z), new THREE.Vector3(lamp.x, T.g + T.ridge - 0.85, lamp.z), 0.012, 0);
    glows.push(new THREE.Vector3(lamp.x, T.g + T.ridge - 1.05, lamp.z));
  }
  await yieldTask();
  // ---- the bonfire: stone ring, log tepee, embers (flames + glow added by the module)
  {
    const f = FIRE, B = S.main(f.x, f.z), N = S.near(f.x, f.z);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng() * 0.2, r = f.r;
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      const rg = rockProto(40 + (i % 5), false).clone(); rg.applyMatrix4(W(x, g(x, z) - 0.12, z, rng() * 6, 0, 0, 0.26 + rng() * 0.1, 0.16 + rng() * 0.06, 0.24 + rng() * 0.08)); boxProjectUV(rg, 1); rg.deleteAttribute("color");
      B.rock.add(rg, null, soft("#a8a090", 0.4, 0.95 - rng() * 0.15));
    }
    const gy = g(f.x, f.z);
    // charred log cabin + leaning tepee logs + ash bed (props.ts bonfire; its own ring is skipped: r 0 → the sculpted
    // ring stones above stay)
    bonfire(N, W(f.x, gy - 0.02, f.z, rng() * 6), 0.62, rng);
    N.bulb.add(new THREE.SphereGeometry(0.46, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), W(f.x, gy - 0.04, f.z, 0, 0, 0, 1, 0.3, 1), col("#ff6a1a"));
    // embers in the ash
    for (let i = 0; i < 26; i++) { const a = rng() * 6.28, r = 0.15 + rng() * 0.55; N.bulb.add(new THREE.IcosahedronGeometry(0.03 + rng() * 0.03, 0), W(f.x + Math.cos(a) * r, gy + 0.03, f.z + Math.sin(a) * r), col(rng() < 0.5 ? "#ff5a10" : "#ffa030")); }
    // (the flame tongues: index.ts fireCore — a vertex-coloured unlit mesh; the bulb material is a fixed cream)
    // log seats around the fire
    for (const [a, len] of [[0.6, 2.0], [2.5, 1.7], [4.2, 1.9]] as Array<[number, number]>) {
      const x = f.x + Math.cos(a) * 2.6, z = f.z + Math.sin(a) * 2.6;
      B.wood.add(cylGeo(0.22, 0.24, len, 10), W(x, g(x, z) + 0.15, z, -a + Math.PI / 2, 0, Math.PI / 2), soft(TIMBER, 0.6, 0.85));
    }
    // a cooking spit
    for (const s of [-1, 1]) N.wood.add(cylGeo(0.035, 0.04, 1.4, 5), W(f.x + s * 0.8, gy + 0.6, f.z, 0, 0, s * 0.18), soft("#6a4a30", 0.6, 0.9));
    N.metal.add(cylGeo(0.02, 0.02, 1.9, 5), W(f.x, gy + 1.22, f.z, 0, 0, Math.PI / 2), col("#3a3634"));
  }
  await yieldTask();
  // ---- beach cover (the colliders are the COVER boxes)
  let tc = performance.now();
  for (const cv of COVER) {
    if (performance.now() - tc > 30) { await yieldTask(); tc = performance.now(); }
    // stands on the shared baked base (coverBase): the drawn top IS the collider top
    const y = coverBase(cv), B = S.main(cv.x, cv.z), N = S.near(cv.x, cv.z);
    const m = W(cv.x, y, cv.z, cv.yaw);
    switch (cv.k) {
      case "longboat": addLongboat(B, m.clone().multiply(W(0, -0.05, 0, Math.PI / 2, 0.05, 0.22)), { hull: "#8a5a34", stripe: "#e8c040", lower: "#4a3a2a", inner: "#9a7450", motor: false, oars: true, len: 5.4, fenders: 0, cargo: ["barrel", "rope"] }, rng); break;
      case "crates": {
        // a washed-up stack: hand-built plank crates (bevelled frame, iron brackets, rope handles, a painted mark), each
        // tier a little smaller and turned; a rope coil on the top one
        const n = Math.max(1, Math.round(cv.h[1] * 2 / 0.62)), h = cv.h[1] * 2 / n;
        for (let i = 0; i < n; i++) pirateCrate(N, m.clone().multiply(W((rng() - 0.5) * 0.03 * i, i * h, (rng() - 0.5) * 0.03 * i, (rng() - 0.5) * 0.06 * i)), cv.h[0] * 2 - 0.02, h, cv.h[2] * 2 - 0.02, rng, CRATE_TONES[(i + Math.floor(rng() * 4)) % 4], true);   // (full footprint every tier: the collider top is the drawn top everywhere)
        if (rng() < 0.6) for (let k = 0; k < 3; k++) S.fine(cv.x, cv.z).rope.add(new THREE.TorusGeometry(0.2 - k * 0.05, 0.03, 5, 14), m.clone().multiply(W(0.1, cv.h[1] * 2 + 0.03 + k * 0.05, 0.05, 0, Math.PI / 2, 0)), col("#b89f6c"));
        break;
      }
      case "barrels": {
        // two coopered casks side by side (bulging staves, iron hoops, a board head, a bung) filling the collider
        const r = Math.min(cv.h[0] * 0.5, cv.h[2]) * 0.97;
        for (const sd of [-1, 1]) cask(N, m.clone().multiply(W(sd * cv.h[0] * 0.5, 0, 0, rng() * 6)), r, cv.h[1] * 2, rng, sd > 0 ? "#8a5a32" : "#7a4e2c");
        break;
      }
      case "cannonbeach": {
        const prof: Array<[number, number]> = [[0, 0], [0.26, 0], [0.3, 0.1], [0.26, 0.3], [0.24, 1.6], [0.2, 2.3], [0.24, 2.4], [0, 2.4]];
        B.metal.add(latheGeo(prof, 14), m.clone().multiply(W(-1.2, 0.2, 0, 0, 0, -Math.PI / 2 + 0.08)), col("#3a3432"), (x, yy, z, bb, o) => { if (noise3(x * 4, yy * 4, z * 4) > 0.5) o.lerp(new THREE.Color("#7a4a2a"), 0.5); });
        break;
      }
      case "mastlog": {
        B.wood.add(cylGeo(cv.h[1] * 0.9, cv.h[1], cv.h[0] * 2, 10), m.clone().multiply(W(0, cv.h[1], 0, 0, 0, Math.PI / 2)), soft(TIMBER, 0.6, 0.8), (x, yy, z, bb, o) => { if (yy < g(x, z) + 0.25) o.lerp(new THREE.Color("#3e3a26"), 0.6); });
        for (let k = -1; k <= 1; k++) B.metal.add(cylGeo(cv.h[1] + 0.02, cv.h[1] + 0.02, 0.1, 10), m.clone().multiply(W(k * cv.h[0] * 0.6, cv.h[1], 0, 0, 0, Math.PI / 2)), col("#3a3634"));
        break;
      }
    }
  }
  await yieldTask();
  // ---- driftwood, planks and rope scattered on the sand (fine detail)
  for (let i = 0; i < 26; i++) {
    const x = -40 + rng() * 150, z = -690 + ((x + 40) / 150) * 30 + 22 + rng() * 14;
    const y = g(x, z);
    if (y < 0.05 || y > 3) continue;
    const L = 0.9 + rng() * 1.4, yw = rng() * 6, cx = Math.cos(yw) * L / 2, cz = -Math.sin(yw) * L / 2;
    const ya = g(x - cx, z - cz), yb = g(x + cx, z + cz), yc = Math.min(y, (ya + yb) / 2);
    // plank: rolled to the slope along its length, centred 1 cm under the lower of the mid / end-average ground
    S.fine(x, z).wood.box(L, 0.06, 0.18 + rng() * 0.1, W(x, yc + 0.01, z, yw, 0, Math.atan2(yb - ya, L)), soft(rng() < 0.5 ? "#b8a080" : "#8a6a44", 0.6, 0.9));
  }
  return { glows };
}

/** far proxies for the shore structures */
export function shoreProxy(proxyBox: (m: THREE.Matrix4, w: number, h: number, d: number, wall: string, roof: string, windows?: boolean) => void, proxyGeo: (g: THREE.BufferGeometry, m: THREE.Matrix4 | null, c: string) => void) {
  for (const s of SHACKS) proxyBox(M(s.x, s.y - 0.4, s.z, s.yaw), s.w, s.wallH + s.rise + 0.4, s.d, "#c8a060", "#e8b43a", false);
  proxyBox(M(TOWER.x, TOWER.g, TOWER.z, TOWER.yaw), TOWER.w, TOWER.roof - TOWER.g + 1.2, TOWER.w, "#8a6a44", "#e8b43a", false);
  proxyGeo(new THREE.BoxGeometry(LANDING.hx * 2, LANDING.top + 1, LANDING.hz * 2), M(LANDING.x, LANDING.top / 2 - 0.5, LANDING.z, LANDING.yaw), "#8a8070");
  void RAIL; void BOARDWALK;
}
