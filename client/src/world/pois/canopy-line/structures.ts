// CANOPY LINE — every built thing, from the shared LAYOUT (the same numbers the server collides against):
// ring decks (plank floors with the stair holes, rim, joists, knee braces, rope rails with their gates), spiral stairs
// (wedge treads, solid blocks where they meet a floor, brackets, rope rails), rope bridges, the launch tower, the
// treehouses (plank walls with real openings, frames, shutters, ceilings, lofts, thatched hip roofs, furniture),
// the winch shelter, zipline cables + poles + pulleys, and all the cover props.
import * as THREE from "three";
import {
  type Column, type Ring, type Helix, type Bridge, type Hut, type Zip, type Prop, type Shelter, type Side,
  LAYOUT, TOWER, STAIR, STAIR_CAB, towerCabin, RAIL_H, WALL_T, ZIP_POLE, zipPole, rockPlanes, ringRailRuns, holeRailRuns, stairRailRuns, bridgeSegs, sagY, rad, toW, inArc, wallPieces, sideFrame, hutRoofRect, octRoofOutline, groundAt, trunkR, mulberry,
} from "../../../../../shared/pois/canopy-line";
import type { Bins, Rng } from "./kit";
import { M, col } from "../_kit/town-geo";
import { logGeo, beamM, ropeGeo, sagPts, lashing, geoFrom } from "./geo";
import { chamferBoxGeo, cylGeo, latheGeo } from "../_kit/town-geo";

const TAU = Math.PI * 2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
// (the town plank / thatch albedos are already coloured — tints stay light and warm: honey timber)
const PLANK = "#f2d3a4", BEAM = "#b08a60", POST = "#e8dccb", ROPE = "#b89a6a", THATCH = "#ffe9b0";   // (golden straw)
const tone = (rng: Rng, c: string, a = 0.12) => col(c, 1 - a + rng() * 2 * a);

// ------------------------------------------------------------------------------------------------ primitives
/** a wedge prism around (cx, cz): angles a ± dA/2, radii r0..r1, from y0 to y1 (treads, blocks). Top UVs run along the tread */
export function wedgeGeo(cx: number, cz: number, a: number, dA: number, r0: number, r1: number, y0: number, y1: number): THREE.BufferGeometry {
  const a0 = a - dA / 2, a1 = a + dA / 2;
  const P = (r: number, t: number, y: number): [number, number, number] => [cx + Math.cos(t) * r, y, cz + Math.sin(t) * r];
  const c = [P(r0, a0, y1), P(r0, a1, y1), P(r1, a1, y1), P(r1, a0, y1), P(r0, a0, y0), P(r0, a1, y0), P(r1, a1, y0), P(r1, a0, y0)];
  const faces: Array<[number, number, number, number]> = [[0, 3, 2, 1], [4, 5, 6, 7], [3, 7, 6, 2], [0, 1, 5, 4], [0, 4, 7, 3], [1, 2, 6, 5]];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const ta = new THREE.Vector3(), tb = new THREE.Vector3(), n = new THREE.Vector3();
  for (const f of faces) {
    const q = f.map((i) => c[i]);
    ta.set(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]); tb.set(q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]);
    n.crossVectors(tb, ta).normalize();
    // outward check against the prism centre
    const mx = (q[0][0] + q[2][0]) / 2 - (cx + Math.cos(a) * (r0 + r1) / 2), my = (q[0][1] + q[2][1]) / 2 - (y0 + y1) / 2, mz = (q[0][2] + q[2][2]) / 2 - (cz + Math.sin(a) * (r0 + r1) / 2);
    const flip = n.x * mx + n.y * my + n.z * mz < 0;
    const base = pos.length / 3;
    // metre UVs per face with U along the face's most horizontal edge: plank grain runs level on the block sides
    const la = ta.length(), lb = tb.length(), uAlongA = Math.abs(ta.y) / (la || 1) <= Math.abs(tb.y) / (lb || 1);
    for (let k = 0; k < 4; k++) {
      pos.push(...q[k]); nor.push(flip ? -n.x : n.x, flip ? -n.y : n.y, flip ? -n.z : n.z);
      const ea = k === 1 || k === 2 ? 1 : 0, eb = k >= 2 ? 1 : 0;   // q0 → q1 = edge a, q0 → q3 = edge b
      if (uAlongA) uv.push(ea * la, eb * lb); else uv.push(eb * lb, ea * la);
    }
    // (parity: inverted, every tread / stair block draws inside-out and rays see its far faces)
    if (flip) idx.push(base, base + 1, base + 2, base, base + 2, base + 3); else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return geoFrom(pos, nor, uv, idx);
}

/** annular / octagonal plank floor: top (planar metre UVs along the ring's plank direction), underside, outer + hole edges */
function floorGeo(c: Column, g: Ring, plankYaw: number): THREE.BufferGeometry {
  const N = g.kind === "tower" ? 64 : Math.max(64, Math.ceil(TAU * g.r1 / 0.7));
  const outer = (t: number) => {
    if (g.kind !== "tower") return g.r1;
    const seg = TAU / g.n, d = t - Math.round(t / seg) * seg; // octagon: faces centred on k·45°
    return g.r1 / Math.cos(d);
  };
  const isFloor = (t: number, inner: boolean) => !inner || !g.holes.some((h) => inArc(t, h));
  const radii = (t: number) => [g.r0, g.rh, g.rh + (outer(t) - g.rh) * 0.5, outer(t)];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const cu = Math.cos(plankYaw), su = Math.sin(plankYaw);
  const T = g.y, Bt = g.y - 0.3;
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u?: number, v?: number) => {
    pos.push(x, y, z); nor.push(nx, ny, nz);
    uv.push(u ?? (x * cu + z * su), v ?? (-x * su + z * cu));
    return pos.length / 3 - 1;
  };
  for (let i = 0; i < N; i++) {
    const t0 = i / N * TAU, t1 = (i + 1) / N * TAU, tm = (t0 + t1) / 2;
    const R0 = radii(t0), R1 = radii(t1);
    for (let b = 0; b < 3; b++) {
      if (!isFloor(tm, b === 0)) continue;
      for (const [y, ny] of [[T, 1], [Bt, -1]] as Array<[number, number]>) {
        const p = [[R0[b], t0], [R1[b], t1], [R1[b + 1], t1], [R0[b + 1], t0]].map(([r, t]) => vert(c.x + Math.cos(t) * r, y, c.z + Math.sin(t) * r, 0, ny, 0));
        if (ny > 0) idx.push(p[0], p[2], p[1], p[0], p[3], p[2]); else idx.push(p[0], p[1], p[2], p[0], p[2], p[3]);
      }
      // side walls where the floor ends: outer edge, hole boundaries (radial + arc)
      const edge = (ra: number, ta: number, rb: number, tb: number) => {
        const ax = c.x + Math.cos(ta) * ra, az = c.z + Math.sin(ta) * ra, bx = c.x + Math.cos(tb) * rb, bz = c.z + Math.sin(tb) * rb;
        let nx = bz - az, nz = -(bx - ax); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        const L = Math.hypot(bx - ax, bz - az);
        const q = [vert(ax, T, az, nx, 0, nz, 0, 0.3), vert(bx, T, bz, nx, 0, nz, L, 0.3), vert(bx, Bt, bz, nx, 0, nz, L, 0), vert(ax, Bt, az, nx, 0, nz, 0, 0)];
        idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
      };
      if (b === 2) edge(R0[3], t0, R1[3], t1);
      if (b === 0) {
        if (!isFloor(tm - TAU / N, true)) edge(R0[1], t0, R0[0], t0);
        if (!isFloor(tm + TAU / N, true)) edge(R1[0], t1, R1[1], t1);
      }
      if (b === 1 && !isFloor(tm, true)) edge(R1[1], t1, R0[1], t0);
    }
  }
  // (parity: wound inside-out, from above you see the UNDERSIDE 0.3 m below the collider top
  // (kongs float), and from below the up-lit top faces make the undersides read as bright discs) — every face turned out
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const geo = geoFrom(pos, nor, uv, idx);
  return geo;
}

// ------------------------------------------------------------------------------------------------ rails
/** rope rail along world points (posts at each point, two ropes), `skip(i)` = no post / no rope from i to i+1 */
function ropeRail(bins: Bins, pts: THREE.Vector3[], rng: Rng, o: { h?: number; postR?: number; sag?: number; bunting?: boolean; postEvery?: number; midRope?: boolean } = {}) {
  const h = o.h ?? RAIL_H, pr = o.postR ?? 0.075, pe = o.postEvery ?? 1;
  for (const [pi, p] of pts.entries()) {
    if (pi % pe && pi !== pts.length - 1) continue;
    bins.bark.add(cylGeo(pr, pr * 1.15, h + 0.12, 5, false, 1.6), M(p.x, p.y + (h + 0.12) / 2, p.z, rng() * 3, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.04), tone(rng, POST, 0.1));
    // (budget: none on the stair posts, every 2nd post elsewhere)
    if (o.midRope !== false && pi % 2 === 0) lashing(bins, p.x, p.y + h - 0.12, p.z, pr);
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = a.distanceTo(b), sag = (o.sag ?? 0.05) * L;
    // (parity: the rail collider = this chunky planed handrail, 0.84–1.1 m — a kong can't pass under it, and its top
    // is a drawn surface; the ropes below are dressing)
    { const bm = beamM(V(a.x, a.y + h - 0.08, a.z), V(b.x, b.y + h - 0.08, b.z)); bins.woodDark.box(bm.len + 0.12, 0.26, 0.16, bm.m, tone(rng, "#c89e70", 0.08), [rng() * 2, 0]); }
    if (o.midRope !== false) bins.rope.add(ropeGeo(sagPts(V(a.x, a.y + h * 0.5, a.z), V(b.x, b.y + h * 0.5, b.z), sag * 1.3, 3), 0.024, 3, 1), null, col(ROPE, 0.92));
    if (o.bunting && i % 2 === 0) bunting(bins, V(a.x, a.y + h - 0.07, a.z), V(b.x, b.y + h - 0.07, b.z), sag * 0.3, rng);
  }
}
const FLAGS = ["#ffd23a", "#e8472e", "#2fa7a0", "#8cc63f", "#ff8a2a"];
/** little painted pennants hanging from a top rope (inside the rail's collider, never at head height) */
function bunting(bins: Bins, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: Rng) {
  const n = Math.max(2, Math.round(a.distanceTo(b) / 0.42));
  const d = b.clone().sub(a); d.y = 0; d.normalize();
  for (let k = 1; k < n; k++) {
    const t = k / n, p = a.clone().lerp(b, t); p.y -= 4 * sag * t * (1 - t);
    const w = 0.13, hgt = 0.26;
    const g = triGeo([-w * d.x, 0, -w * d.z], [w * d.x, 0, w * d.z], [0, -hgt, 0]);
    bins.fabric.add(g, M(p.x, p.y - 0.02, p.z, (rng() - 0.5) * 0.3), col(FLAGS[Math.floor(rng() * FLAGS.length)]));
  }
}

// ------------------------------------------------------------------------------------------------ rings
export function addRing(main: Bins, det: Bins, g: Ring, helix: Helix | undefined, rng: Rng) {
  const c = LAYOUT.columns[g.col];
  const plankYaw = rng() * Math.PI;
  main.wood.add(floorGeo(c, g, plankYaw), null, col("#ecd6b6", 1.0), (x, y, z, b, o) => {
    // warm wear + AO toward the trunk and under the rails; the UNDERSIDE is in the deck's own shade (otherwise, seen from
    // the valley the undersides read as bright flat discs)
    const r = Math.hypot(x - c.x, z - c.z), k = 0.82 + 0.18 * Math.min(1, (r - g.r0) / 1.6);
    o.multiplyScalar(k * (0.94 + 0.12 * Math.sin(x * 1.7 + z * 2.3)) * (y < g.y - 0.1 ? 0.3 : 1));
  });
  // heavy timber under-structure: a trunk collar (two lashed ring beams hugging the bark + wedge blocks), a
  // girder ring at 60 % of the radius, deep joists every ~1.7 m — seen from below the decks read as platforms, not
  // mushrooms
  if (g.kind === "tree") {
    const NC = 14;
    for (let i = 0; i < NC; i++) {
      const t0 = i / NC * TAU, t1 = (i + 1) / NC * TAU, rr = g.r0 + 0.12;
      // never over the stair arriving through the floor hole, nor where treads pass just under the deck
      if (g.holes.some((hl) => inArc(t0, hl) || inArc(t1, hl) || inArc((t0 + t1) / 2, hl))) continue;
      if (helix && helix.steps.some((st) => st.y < g.y + 0.05 && st.y > g.y - 3.2 && (Math.abs(Math.atan2(Math.sin(st.a - t0), Math.cos(st.a - t0))) < st.dA || Math.abs(Math.atan2(Math.sin(st.a - t1), Math.cos(st.a - t1))) < st.dA))) continue;
      for (const [dy, hh] of [[-0.45, 0.32], [-0.85, 0.26]] as Array<[number, number]>) {
        const a = V(c.x + Math.cos(t0) * rr, g.y + dy, c.z + Math.sin(t0) * rr), b = V(c.x + Math.cos(t1) * rr, g.y + dy, c.z + Math.sin(t1) * rr);
        const bm = beamM(a, b); main.woodDark.box(bm.len + 0.08, hh, 0.24, bm.m, tone(rng, BEAM, 0.08));
      }
    }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; if (g.holes.some((hl) => inArc(a, hl))) continue; lashing(det, c.x + Math.cos(a) * (g.r0 + 0.14), g.y - 0.62, c.z + Math.sin(a) * (g.r0 + 0.14), 0.05); }
    const rg = g.rh + (g.r1 - g.rh) * 0.45, NG = Math.max(12, Math.ceil(TAU * rg / 1.8));
    for (let i = 0; i < NG; i++) {
      const t0 = i / NG * TAU, t1 = (i + 1) / NG * TAU;
      const a = V(c.x + Math.cos(t0) * rg, g.y - 0.72, c.z + Math.sin(t0) * rg), b = V(c.x + Math.cos(t1) * rg, g.y - 0.72, c.z + Math.sin(t1) * rg);
      const bm = beamM(a, b); main.woodDark.box(bm.len + 0.1, 0.3, 0.24, bm.m, tone(rng, BEAM, 0.08), [0, 0], (x, y, z, bb, o) => o.multiplyScalar(0.7));
    }
  }
  const outerR = (t: number) => g.kind === "tower" ? g.r1 / Math.cos(t - Math.round(t / (TAU / g.n)) * (TAU / g.n)) : g.r1;
  // rim fascia + rim beam
  const NR = g.kind === "tower" ? 8 : Math.max(24, Math.ceil(TAU * g.r1 / 2.0));   // (2 m rim boards)
  for (let i = 0; i < NR; i++) {
    const t0 = (g.kind === "tower" ? i - 0.5 : i) / NR * TAU, t1 = (g.kind === "tower" ? i + 0.5 : i + 1) / NR * TAU;
    const a = V(c.x + Math.cos(t0) * outerR(t0), 0, c.z + Math.sin(t0) * outerR(t0)), b = V(c.x + Math.cos(t1) * outerR(t1), 0, c.z + Math.sin(t1) * outerR(t1));
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, L = a.distanceTo(b), yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    // (the launch tower's deck rims are painted BANANA CO. yellow: the landmark reads from the plane and across the valley)
    if (g.kind === "tower") {
      // BANANA CO.-yellow PAINTED planks: two boards per face on the plank texture,
      // a dark weathered cap, worn (darker, browner) paint toward the corners
      for (const [dy, hh] of [[-0.1, 0.24], [-0.36, 0.24]] as Array<[number, number]>) main.wood.box(L + 0.06, hh, 0.12, M(mx, g.y + dy, mz, yaw), col("#ffe35a"), [rng() * 3, dy], (x, y, z, b, o) => { const e = Math.min(1, Math.hypot(x - mx, z - mz) / (L / 2)); o.multiplyScalar(1 - 0.28 * e * e); o.g *= 1 - 0.08 * e; });
      main.woodDark.box(L + 0.1, 0.06, 0.18, M(mx, g.y + 0.03, mz, yaw), tone(rng, BEAM, 0.08));
    }
    else { main.woodDark.box(L + 0.04, 0.5, 0.14, M(mx, g.y - 0.24, mz, yaw), tone(rng, BEAM, 0.08), [rng() * 3, 0]); main.woodDark.box(L + 0.02, 0.1, 0.2, M(mx, g.y - 0.5, mz, yaw), tone(rng, BEAM, 0.12), [rng() * 3, 0]); }
  }
  // joists (radial) + knee braces to the trunk where no stair passes under
  const NJ = g.kind === "tower" ? 8 : Math.max(16, Math.round(TAU * g.r1 / 1.7));
  for (let j = 0; j < NJ; j++) {
    const t = (j + 0.25) / NJ * TAU;
    const inHole = g.holes.some((h) => inArc(t, h));
    const ra = inHole ? g.rh + 0.05 : g.r0, rb = outerR(t) - 0.12;
    const p0 = V(c.x + Math.cos(t) * ra, g.y - 0.48, c.z + Math.sin(t) * ra), p1 = V(c.x + Math.cos(t) * rb, g.y - 0.48, c.z + Math.sin(t) * rb);
    const { m, len } = beamM(p0, p1);
    main.woodDark.box(len, 0.4, 0.22, m, tone(rng, BEAM, 0.08), [0, 0], (x, y, z, bb, o) => o.multiplyScalar(0.55));
    if (g.kind === "tower" || !helix || j % 2) continue;
    // brace: trunk at y − 3.4 → joist at 0.62 r1; clear of every stair tread it would pass (+ a kong's height)
    const yb = g.y - 3.4, rt = 0.62 * g.r1;
    const clear = helix.steps.every((s) => {
      const da = Math.abs(Math.atan2(Math.sin(s.a - t), Math.cos(s.a - t)));
      if (da > s.dA + 0.12) return true;
      return s.y + 2.1 < yb || s.y - 0.3 > g.y;
    });
    if (!clear) continue;
    const q0 = V(c.x + Math.cos(t) * (c.r - 0.05), yb, c.z + Math.sin(t) * (c.r - 0.05)), q1 = V(c.x + Math.cos(t) * rt, g.y - 0.62, c.z + Math.sin(t) * rt);
    const bm = beamM(q0, q1);
    main.woodDark.box(bm.len, 0.2, 0.18, bm.m, tone(rng, BEAM, 0.08));
  }
  // outer rail + the rail round the stair hole: the SHARED post runs (their chords are the colliders, parity)
  const V3v = (q: [number, number, number]) => V(q[0], q[1], q[2]);
  for (const run of ringRailRuns(g, c)) ropeRail(det, run.map(V3v), rng, { bunting: g.kind === "tree" });
  for (const run of holeRailRuns(g, c)) ropeRail(det, run.map(V3v), rng);
}

// ------------------------------------------------------------------------------------------------ spiral stairs
export function addHelix(main: Bins, det: Bins, h: Helix, rng: Rng) {
  const c = LAYOUT.columns[h.col];
  h.steps.forEach((s) => {
    const solid = Number.isFinite(s.solid);
    // (parity) a tread = three radial planks, EXACTLY the collider slices (shared genColliders: width at each slice's
    // inner radius) — a solid block = timber under a plank top; the stepped outline is a few cm at 1.4 m
    const yb = solid ? s.solid : s.y - STAIR.thick, pc = tone(rng, PLANK, 0.12), bc = tone(rng, BEAM, 0.1);
    for (let i = 0; i < 3; i++) {
      const ra = s.r0 + (s.r1 - s.r0) * i / 3, rb = s.r0 + (s.r1 - s.r0) * (i + 1) / 3, w = 2 * ra * Math.tan(s.dA / 2), rm = (ra + rb) / 2;
      const x = c.x + Math.cos(s.a) * rm, z = c.z + Math.sin(s.a) * rm;
      if (solid) main.woodDark.box(rb - ra, s.y - 0.08 - yb, w, M(x, (yb + s.y - 0.08) / 2, z, -s.a), bc, [rng() * 2, 0]);
      main.wood.box(rb - ra, solid ? 0.08 : STAIR.thick, w, M(x, solid ? s.y - 0.04 : s.y - STAIR.thick / 2, z, -s.a), pc, [rng() * 2, i * 0.5]);
    }
    if (!solid) {
      // bracket: from the bark under the tread to its outer edge
      const t0 = V(c.x + Math.cos(s.a) * (c.r - 0.05), s.y - 0.95, c.z + Math.sin(s.a) * (c.r - 0.05));
      const t1 = V(c.x + Math.cos(s.a) * (s.r1 - 0.25), s.y - 0.12, c.z + Math.sin(s.a) * (s.r1 - 0.25));
      const bm = beamM(t0, t1);
      det.woodDark.box(bm.len, 0.1, 0.1, bm.m, tone(rng, BEAM, 0.1));
    }
  });
  // the shared rail run (a point on every railed tread = the collider chords); a post on every second tread
  for (const run of stairRailRuns(h, c)) ropeRail(det, run.map((q) => V(q[0], q[1], q[2])), rng, { sag: 0.02, postEvery: 2, midRope: false });
}

// ------------------------------------------------------------------------------------------------ bridges
export function addBridge(main: Bins, det: Bins, b: Bridge, rng: Rng) {
  const a = V(...b.a), e = V(...b.b);
  const dx = e.x - a.x, dz = e.z - a.z, L = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx);
  const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  const n = Math.max(4, Math.round(L / 0.3));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, y = sagY(b.a[1], b.b[1], b.sag, t);
    const x = a.x + dx * t, z = a.z + dz * t;
    // (parity: planks butt up — the gaps let a vertical ray fall through a floor the collider keeps continuous)
    main.wood.box(L / n * 0.97, 0.055, b.w + (rng() - 0.5) * 0.04, M(x, y - 0.028, z, yaw + (rng() - 0.5) * 0.02), tone(rng, PLANK, 0.16), [rng() * 3, 0]);
  }
  const line = (off: number, dy: number, r: number, sagK = 1) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(V(a.x + dx * t + px * off, sagY(b.a[1], b.b[1], b.sag * sagK, t) + dy, a.z + dz * t + pz * off)); }
    return pts;
  };
  for (const sd of [-1, 1]) {
    // stringers under the plank ends, handrail rope, knee rope
    main.rope.add(ropeGeo(line(sd * (b.w / 2 - 0.08), -0.08, 0), 0.045, 5, 2), null, col(ROPE, 0.9));
    // (parity) a peeled-pole handrail on each side = the rail collider's top (per plank segment, bridgeSegs) — the
    // rope-only rail would leave a standable collider top with nothing solid drawn on it (parity invisible-floor)
    for (const sg of bridgeSegs(b)) {
      const t0 = sg.t0, t1 = sg.t1, pa = V(a.x + dx * t0 + px * sd * (b.w / 2 + 0.05), sg.y + RAIL_H - 0.045, a.z + dz * t0 + pz * sd * (b.w / 2 + 0.05)), pb = V(a.x + dx * t1 + px * sd * (b.w / 2 + 0.05), sg.y + RAIL_H - 0.045, a.z + dz * t1 + pz * sd * (b.w / 2 + 0.05));
      det.woodDark.add(logGeo(pa, pb, 0.05, 0.05, 5, true), null, tone(rng, "#c89e70", 0.08));
    }
    if (sd > 0) { const pl = line(sd * (b.w / 2 + 0.05), RAIL_H - 0.04, 0, 0.92); for (let i = 0; i + 1 < pl.length; i += 2) bunting(det, pl[i], pl[i + 1], 0.01, rng); }
    det.rope.add(ropeGeo(line(sd * (b.w / 2 + 0.05), RAIL_H * 0.5, 0, 0.96), 0.03, 4, 2), null, col(ROPE, 0.92));
    // hangers every ~0.9 m
    const nh = Math.max(3, Math.round(L / 0.9));
    for (let i = 1; i < nh; i++) {
      const t = i / nh, yb = sagY(b.a[1], b.b[1], b.sag, t), yt = sagY(b.a[1], b.b[1], b.sag * 0.92, t) + RAIL_H - 0.02;
      const x = a.x + dx * t + px * sd * (b.w / 2 + 0.03), z = a.z + dz * t + pz * sd * (b.w / 2 + 0.03);
      det.rope.add(logGeo(V(x, yb - 0.06, z), V(x, yt, z), 0.014, 0.014, 3), null, col(ROPE, 0.85));
    }
    // end posts
    for (const [p, y] of [[a, b.a[1]], [e, b.b[1]]] as Array<[THREE.Vector3, number]>) {
      const x = p.x + px * sd * (b.w / 2 + 0.12), z = p.z + pz * sd * (b.w / 2 + 0.12);
      main.bark.add(logGeo(V(x, y - 0.5, z), V(x, y + 1.45, z), 0.13, 0.11, 9), null, col("#c8b8a2"));
      lashing(det, x, y + RAIL_H - 0.15, z, 0.12);
    }
  }
  void yaw;
}

// ------------------------------------------------------------------------------------------------ tower
export function addTower(main: Bins, det: Bins, rng: Rng) {
  const T = TOWER, c = T.col;
  const Rp = T.apothem / Math.cos(Math.PI / 8) - 0.2;
  // mast
  main.bark.add(logGeo(V(c.x, c.gy - 0.8, c.z), V(c.x, T.nest + 1, c.z), 0.44, 0.38, 14), null, col("#cdbca5"));
  // the flag mast over the nest: tapering spar to FLAG_TOP (over every crown), iron bands + lashed stays
  main.bark.add(logGeo(V(c.x, T.nest + 1, c.z), V(c.x, T.flagTop, c.z), 0.38, 0.17, 12), null, col("#d6c5ad"));
  for (let y = T.nest + 3; y < T.flagTop - 2; y += 4.5) det.metal.add(cylGeo(0.4 - (y - T.nest) * 0.007, 0.4 - (y - T.nest) * 0.007, 0.12, 12), M(c.x, y, c.z), col("#3a3530"));
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4, [x, z] = rad(c, a, T.nestR - 0.2); det.rope.add(logGeo(V(x, T.nest + 0.9, z), V(c.x, T.nest + 14, c.z), 0.02, 0.02, 3), null, col(ROPE, 0.85)); }
  // corner posts
  const post = (k: number) => { const a = (k + 0.5) / 8 * TAU; return V(c.x + Math.cos(a) * Rp, 0, c.z + Math.sin(a) * Rp); };
  for (let k = 0; k < 8; k++) {
    const p = post(k), g = groundAt(p.x, p.z);
    // (landmark: chunky legs, a splayed foot block)
    main.bark.add(logGeo(V(p.x, g - 0.8, p.z), V(p.x, T.roofY, p.z), T.legR, T.legR * 0.86, 12), null, col("#c9b79e"));
    main.woodDark.add(chamferBoxGeo(1.1, 0.5, 1.1, 0.06), M(p.x, g + 0.1, p.z, (k + 0.5) / 8 * TAU), tone(rng, BEAM, 0.06));
    // rope lashings where the ring beams meet the legs
    for (const y of [70 - 0.55, T.top - 0.55]) lashing(det, p.x, y, p.z, T.legR);
  }
  // the stone plinth that levels the base room on the escarpment (= the collider octagon) + its plank floor
  {
    const Rc = T.apothem / Math.cos(Math.PI / 8), h = T.floorY - T.plinthLo;
    main.rock.add(cylGeo(Rc, Rc + 0.25, h, 8, false, 2.2), M(c.x, (T.floorY + T.plinthLo) / 2, c.z, Math.PI / 8), col("#cfc6b6"), (x, y, z, b, o) => o.multiplyScalar(0.72 + 0.28 * Math.min(1, (y - T.plinthLo) / Math.max(1, h))));
    main.wood.add(cylGeo(Rc - 0.04, Rc - 0.04, 0.08, 8, false, 1), M(c.x, T.floorY - 0.035, c.z, Math.PI / 8), tone(rng, PLANK, 0.06));
  }
  // ring beams + X braces between levels
  const fl = T.floorY;
  const levels = [fl + T.skirtH, fl + T.skirtH + (T.mid - fl - T.skirtH) / 3, fl + T.skirtH + 2 * (T.mid - fl - T.skirtH) / 3, T.mid - 0.55, T.top - 0.55, T.roofY - 0.1];
  for (let k = 0; k < 8; k++) {
    const p = post(k), q = post(k + 1);
    for (const y of levels) { const bm = beamM(V(p.x, y, p.z), V(q.x, y, q.z)); main.woodDark.add(chamferBoxGeo(bm.len, 0.26, 0.2, 0.03), bm.m, tone(rng, BEAM, 0.08)); }
    for (let l = 0; l + 1 < levels.length - 1; l++) {
      if (levels[l] > T.mid - 1 && levels[l + 1] < T.top) continue;   // the T1 cabin's planked walls close that bay
      const y0 = levels[l] + 0.2, y1 = levels[l + 1] - 0.2;
      for (const [u, v] of [[p, q], [q, p]]) { const bm = beamM(V(u.x, y0, u.z), V(v.x, y1, v.z)); main.woodDark.add(chamferBoxGeo(bm.len, 0.16, 0.14, 0.02), bm.m, tone(rng, BEAM, 0.1)); }
    }
  }
  // no skirt walls: the base is an open plank deck on the stone plinth (their tops were an unreachable floor)
  // roof: a big 8-sided thatch CAP from the eave (overhang 0.9) up to the crow's nest rim (the mast stair climbs
  // through it), a thick shaggy lip, a second lip under the nest; the nest deck + rail are a ring (addRing, T3)
  const eave = T.roofY, peak = T.peak, R0 = T.capR, Rn = T.nestR - 0.05;
  const segs = 8, pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const corner = (k: number, r: number): [number, number] => { const a = (k + 0.5) / segs * TAU; return [c.x + Math.cos(a) * r / Math.cos(Math.PI / 8), c.z + Math.sin(a) * r / Math.cos(Math.PI / 8)]; };
  for (let k = 0; k < segs; k++) {
    for (const [off, th] of [[0.15, 0], [-0.3, 1]] as Array<[number, number]>) {
      const [ax, az] = corner(k, R0), [bx, bz] = corner(k + 1, R0), [cx2, cz2] = corner(k + 1, Rn), [dx2, dz2] = corner(k, Rn);
      const q: Array<[number, number, number]> = [[ax, eave + off, az], [bx, eave + off, bz], [cx2, peak + off, cz2], [dx2, peak + off, dz2]];
      const e1 = V(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]), e2 = V(q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]), n = e2.clone().cross(e1).normalize();
      if (n.y < 0) n.negate(); if (th) n.negate();
      const base = pos.length / 3, sl = Math.hypot(R0 - Rn, peak - eave);
      for (const p of q) { pos.push(...p); nor.push(n.x, n.y, n.z); }
      uv.push(0, sl / 1.3, e1.length() / 1.3, sl / 1.3, e1.length() / 1.3 * 0.75, 0, e1.length() / 1.3 * 0.25, 0);
      const t = (i0: number, i1: number, i2: number) => { const pa = V(...q[i0]), nn = V(...q[i1]).sub(pa).cross(V(...q[i2]).sub(pa)); if (nn.dot(n) >= 0) idx.push(base + i0, base + i1, base + i2); else idx.push(base + i0, base + i2, base + i1); };
      t(0, 1, 2); t(0, 2, 3);
    }
    for (const [r, y, hh, w] of [[R0 + 0.05, eave - 0.05, 0.62, 0.6], [Rn + 0.1, peak + 0.05, 0.3, 0.3]] as Array<[number, number, number, number]>) {
      const [ax, az] = corner(k, r), [bx, bz] = corner(k + 1, r);
      const bm = beamM(V(ax, y, az), V(bx, y, bz));
      main.thatch.add(chamferBoxGeo(bm.len + 0.15, hh, w, 0.12), bm.m, col(THATCH, 0.9));
    }
    // ragged straw skirt off the big cap's eave (the hut thatch's fringe)
    { const [ax, az] = corner(k, R0 + 0.3), [bx, bz] = corner(k + 1, R0 + 0.3), mid = (k + 1) / segs * TAU, o = V(Math.cos(mid), 0, Math.sin(mid)); thatchFringe(det, V(ax, eave - 0.3, az), V(bx, eave - 0.3, bz), o, rng, 0.75); }
  }
  main.thatch.add(geoFrom(pos, nor, uv, idx), null, col(THATCH), (x, y, z, b, o) => o.multiplyScalar(0.88 + 0.12 * Math.sin(x * 2.3 + z * 1.9 + y * 3.1)));
  // the planked mid cabin on T1 (the shared towerCabin pieces = its colliders): thick
  // horizontal boards outside, a dark backing, a sill + head trim round every opening, BANANA CO. boards on two faces
  {
    const A = T.apothem;
    for (const w of towerCabin()) {
      const ca = Math.cos(w.a), sa = Math.sin(w.a), tx = -sa, tz = ca, P = (u: number, y: number, r: number) => V(c.x + ca * r + tx * u, y, c.z + sa * r + tz * u);
      const um = (w.u0 + w.u1) / 2, len = w.u1 - w.u0, yaw = -Math.atan2(tz, tx);
      // backing board (the collider's inner face) + horizontal planks 0.24 m with shadow gaps, outer face = the deck edge
      const pm = P(um, (w.y0 + w.y1) / 2, A - 0.15);
      main.woodDark.box(len, w.y1 - w.y0, 0.12, M(pm.x, pm.y, pm.z, yaw), col("#7a5c3e"), [rng() * 3, w.y0]);
      const nb = Math.max(1, Math.round((w.y1 - w.y0) / 0.25)), bh = (w.y1 - w.y0) / nb;
      for (let i = 0; i < nb; i++) { const q = P(um, w.y0 + (i + 0.5) * bh, A - 0.05); main.wood.box(len + (rng() - 0.5) * 0.04, bh - 0.03, 0.09, M(q.x, q.y, q.z, yaw, 0, (rng() - 0.5) * 0.012), tone(rng, i % 7 === 3 ? "#d9b07a" : "#e8c690", 0.1), [rng() * 4, i * 0.27]); }
    }
    // trims round the openings + vertical corner battens
    const g1 = LAYOUT.rings[LAYOUT.deck.T1];
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU, ca = Math.cos(a), sa = Math.sin(a), tx = -sa, tz = ca, yaw = -Math.atan2(tz, tx), P = (u: number, y: number) => V(c.x + ca * (A - 0.07) + tx * u, y, c.z + sa * (A - 0.07) + tz * u);   // (parity: the trims sit inside the wall collider)
      const door = towerCabin().some((w) => w.a === a && w.door), o = door ? { w: 1.6, y: 0, h: 2.4 } : { w: 1.5, y: 1.0, h: 1.2 };
      for (const sd of [-1, 1]) { const q = P(sd * (o.w / 2 + 0.06), g1.y + o.y + o.h / 2); det.woodDark.bbox(0.12, o.h + 0.24, 0.12, M(q.x, q.y, q.z, yaw), tone(rng, BEAM, 0.06), 0.02); }
      { const q = P(0, g1.y + o.y + o.h + 0.07); det.woodDark.bbox(o.w + 0.4, 0.14, 0.14, M(q.x, q.y, q.z, yaw), tone(rng, BEAM, 0.06), 0.02); }
      if (!door) { const q = P(0, g1.y + o.y - 0.06); det.woodDark.bbox(o.w + 0.46, 0.12, 0.2, M(q.x, q.y, q.z, yaw), tone(rng, BEAM, 0.06), 0.02); for (const sd of [-1, 1]) { const r = P(sd * (o.w / 2 + 0.06 + o.w / 4), g1.y + o.y + o.h / 2); det.wood.box(o.w / 2 - 0.02, o.h, 0.05, M(r.x + ca * 0.04, r.y, r.z + sa * 0.04, yaw), tone(rng, "#6f8f5a", 0.08), [rng(), 0]); } }
      // the BANANA CO. boards on the two valley faces (NE / E)
      if (!door && (k === 7 || k === 0)) { const q = P(0, g1.y + 3.6); main.plastic.bbox(2.9, 1.1, 0.08, M(q.x + ca * 0.05, q.y, q.z + sa * 0.05, yaw), col("#ffd93a"), 0.02); det.label.add(new THREE.PlaneGeometry(2.6, 0.95), M(q.x + ca * 0.1, q.y, q.z + sa * 0.1, yaw + Math.PI), col("#ffffff")); }
    }
    // roof edge of the cabin = the T2 deck's painted rim (addRing); a plank sole plate round the cabin foot
    for (let k = 0; k < 8; k++) { const a0 = (k - 0.5) / 8 * TAU, a1 = (k + 0.5) / 8 * TAU, R1 = A / Math.cos(Math.PI / 8); const bm = beamM(V(c.x + Math.cos(a0) * R1, g1.y + 0.08, c.z + Math.sin(a0) * R1), V(c.x + Math.cos(a1) * R1, g1.y + 0.08, c.z + Math.sin(a1) * R1)); main.woodDark.add(chamferBoxGeo(bm.len, 0.16, 0.2, 0.02), bm.m, tone(rng, BEAM, 0.06)); }
  }
  // BANANA CO. banners hung down the open lower shaft on the three valley faces: 3.2 × 11 m cloth (soft), weighted
  // with a pole at the hem, a stencil panel — the tower's mass + colour from the plane and across the valley
  for (const k of [7, 0, 1]) {
    const a = k / 8 * TAU, ca = Math.cos(a), sa = Math.sin(a), tx = -sa, tz = ca, r = T.apothem + 0.35, top = 69.3, bot = top - 11;
    const nx = 6, ny = 12, pos: number[] = [], nrm: number[] = [], uvs: number[] = [], ids: number[] = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = (i / nx - 0.5) * 3.2, t = j / ny, y = top - (top - bot) * t, bil = 0.12 * Math.sin(t * Math.PI) * Math.cos(u * 1.4 + k) + 0.05 * Math.sin(u * 6 + t * 9);
      pos.push(c.x + ca * (r + bil) + tx * u, y, c.z + sa * (r + bil) + tz * u); nrm.push(ca, 0, sa); uvs.push(i / nx, 1 - t);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = j * (nx + 1) + i; ids.push(q, q + nx + 1, q + 1, q + 1, q + nx + 1, q + nx + 2); }
    const g = geoFrom(pos, nrm, uvs, ids); g.computeVertexNormals();
    { const nn = g.attributes.normal as THREE.BufferAttribute; if (nn.getX(0) * ca + nn.getZ(0) * sa < 0) { const ix = g.index!; for (let i = 0; i < ix.count; i += 3) { const t2 = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t2); } g.computeVertexNormals(); } }
    main.fabric.add(g, null, col(k === 0 ? "#2fa7a0" : "#ffd23a"));
    const back = g.clone(); { const ix = back.index!; for (let i = 0; i < ix.count; i += 3) { const t2 = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t2); } back.computeVertexNormals(); }
    main.fabric.add(back, null, col("#c9a23a"));
    // hem + head poles, the stencil (two BANANA CO. labels down the cloth)
    for (const y of [top + 0.05, bot - 0.05]) det.woodDark.add(logGeo(V(c.x + ca * (r + 0.05) - tx * 1.8, y, c.z + sa * (r + 0.05) - tz * 1.8), V(c.x + ca * (r + 0.05) + tx * 1.8, y, c.z + sa * (r + 0.05) + tz * 1.8), 0.06, 0.06, 6), null, col(BEAM));
    for (const y of [top - 2.6, top - 7.4]) det.label.add(new THREE.PlaneGeometry(2.8, 1.4), M(c.x + ca * (r + 0.2), y, c.z + sa * (r + 0.2), Math.PI / 2 - a), col("#ffffff"));
  }
  // flag mast from the nest: a big two-tail BANANA CO. pennant that reads from the plane
  {
    const fx = c.x, fz = c.z, y = T.flagTop - 3.0, len = 12, hgt = 5.0, a = 0.5;   // (a 12 × 5 m pennant at the mast top — the plane read)
    const ux = Math.cos(a), uz = Math.sin(a);
    const pts: number[] = [], nrm: number[] = [], uvs: number[] = [], ids: number[] = [];
    const nx = 8;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, wv = 0.18 * Math.sin(u * 5.5) * u;
      const hTop = hgt / 2 * (1 - 0.35 * u), hBot = -hgt / 2 * (1 - 0.35 * u) + (u > 0.7 ? (u - 0.7) * 2.2 : 0);
      for (const hy of [hTop, hBot]) { pts.push(fx + ux * len * u - uz * wv, y + hy - u * 0.25, fz + uz * len * u + ux * wv); nrm.push(-uz, 0, ux); uvs.push(u, hy > 0 ? 1 : 0); }
    }
    for (let i = 0; i < nx; i++) { const b0 = i * 2; ids.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2); }   // (wound to its normal)
    const g = geoFrom(pts, nrm, uvs, ids);
    main.fabric.add(g, null, col("#ffd93a"));
    const back = g.clone(); const ix = back.index!; for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); }
    const bn = back.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < bn.count; i++) bn.setXYZ(i, -bn.getX(i), -bn.getY(i), -bn.getZ(i));
    main.fabric.add(back, null, col("#f0c52c"));
    main.plastic.add(new THREE.SphereGeometry(0.2, 10, 8), M(fx, T.flagTop + 0.1, fz), col("#ffd93a"));
  }
  // BANANA CO. board on the top deck rail, facing the valley (NE)
  {
    const a = 1.93, [x, z] = rad(c, a, T.apothem - 0.02);
    main.wood.bbox(2.4, 0.9, 0.08, M(x, T.top + 1.55, z, -a + Math.PI / 2), col("#f2c23a"), 0.02);
    const lx = x + Math.cos(a) * 0.05, lz = z + Math.sin(a) * 0.05;
    det.label.add(new THREE.PlaneGeometry(2.1, 0.78), M(lx, T.top + 1.55, lz, -a + Math.PI / 2), col("#ffffff"));
    for (const u of [-1, 1]) { const ox = Math.cos(a + Math.PI / 2) * u * 1.0, oz = Math.sin(a + Math.PI / 2) * u * 1.0; main.woodDark.box(0.1, 2.0, 0.1, M(x + ox - Math.cos(a) * 0.06, T.top + 1.0, z + oz - Math.sin(a) * 0.06, -a), col(BEAM)); }
  }
}


// ------------------------------------------------------------------------------------------------ thatch fringe
/** a ragged skirt of straw tufts hanging off an eave line: a zig-zag hem (tufts 0.3–0.6 m),
 *  flared outward, both faces — soft dressing above head height (the stepped roof colliders carry the collision) */
function thatchFringe(bins: Bins, a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3, rng: Rng, len = 0.45) {
  const L = a.distanceTo(b), n = Math.max(3, Math.round(L / 0.13));
  const pos: number[] = [], uv: number[] = [], colr: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = a.clone().lerp(b, t);
    const tuft = len * (0.62 + 0.38 * (i % 2 ? 0.55 + rng() * 0.3 : 0.9 + rng() * 0.3));
    pos.push(p.x, p.y, p.z, p.x + out.x * 0.16, p.y - tuft, p.z + out.z * 0.16);
    uv.push(t * L / 1.2, 0, t * L / 1.2, tuft / 1.2);
    const k = 0.9 + rng() * 0.2; colr.push(k, k, k * 0.98, k * 0.72, k * 0.68, k * 0.6);
  }
  for (let i = 0; i < n; i++) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx); g.computeVertexNormals();
  // face the outward side (+out); the back copy faces the wall
  const nn = g.attributes.normal as THREE.BufferAttribute;
  if (nn.getX(0) * out.x + nn.getZ(0) * out.z < 0) { const ix = g.index!; for (let i = 0; i < ix.count; i += 3) { const t2 = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t2); } g.computeVertexNormals(); }
  const back = g.clone(); { const ix = back.index!; for (let i = 0; i < ix.count; i += 3) { const t2 = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t2); } back.computeVertexNormals(); }
  bins.fringe.add(g, null, col(THATCH, 0.95));
  bins.fringe.add(back, null, col(THATCH, 0.62));
}
// ------------------------------------------------------------------------------------------------ huts
function hipRoofGeo(h: { x: number; z: number; yaw: number }, rect: [number, number, number, number], y: number, pitch: number, lift = 0): THREE.BufferGeometry {
  const [x0, x1, z0, z1] = rect, hw = (x1 - x0) / 2, hd = (z1 - z0) / 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const rise = Math.min(hw, hd) * pitch, alongX = hw >= hd, rl = Math.abs(hw - hd);
  const W = (lx: number, lz: number, ly: number): [number, number, number] => { const [ox, oz] = toW(h.yaw, lx, lz); return [h.x + ox, y + ly + lift, h.z + oz]; };
  const A = W(x0, z0, 0), Bq = W(x1, z0, 0), C = W(x1, z1, 0), D = W(x0, z1, 0);
  const R1 = alongX ? W(cx - rl, cz, rise) : W(cx, cz - rl, rise), R2 = alongX ? W(cx + rl, cz, rise) : W(cx, cz + rl, rise);
  // faces: back (A,B,R2,R1) front (C,D,R1,R2) left (D,A,R1) right (B,C,R2) — along-x ridge; else rotated
  const quads: Array<Array<[number, number, number]>> = alongX ? [[A, Bq, R2, R1], [C, D, R1, R2], [D, A, R1], [Bq, C, R2]] : [[Bq, C, R2, R1], [D, A, R1, R2], [A, Bq, R1], [C, D, R2]];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const up = new THREE.Vector3();
  for (const q of quads) {
    const e1 = V(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]), e2 = V(q[q.length - 1][0] - q[0][0], q[q.length - 1][1] - q[0][1], q[q.length - 1][2] - q[0][2]);
    const n = e1.clone().cross(e2).normalize(); if (n.y < 0) n.negate();
    up.copy(n);
    const base = pos.length / 3, eL = e1.length(), sl = Math.hypot(rise, Math.min(hw, hd));
    q.forEach((p, k) => {
      pos.push(...p); nor.push(n.x, n.y, n.z);
      // V runs down the slope from the ridge (thatch courses horizontal)
      const along = V(p[0] - q[0][0], p[1] - q[0][1], p[2] - q[0][2]).dot(e1.clone().normalize());
      uv.push(along / 0.95, (k < 2 ? sl : 0) / 0.95);   // finer straw courses: the 1.5 m tile read as dark bands
    });
    // triangulate with the winding that faces n
    const t = (a: number, b: number, cc: number) => {
      const pa = V(...(q[a] as [number, number, number])), pb = V(...(q[b] as [number, number, number])), pc = V(...(q[cc] as [number, number, number]));
      const nn = pb.clone().sub(pa).cross(pc.clone().sub(pa));
      if (nn.dot(n) >= 0) idx.push(base + a, base + b, base + cc); else idx.push(base + a, base + cc, base + b);
    };
    t(0, 1, 2); if (q.length === 4) t(0, 2, 3);
  }
  return geoFrom(pos, nor, uv, idx);
}

/** the octagonal thatch roof (octRoofOutline: the colliders' outline): 8 planar faces from the eave ring (s = 0)
 *  to the ridge (s = the short half side), straw courses running level; `lift` = vertical offset (the underside) */
function octOutline(h: Hut, s: number, y: number): THREE.Vector3[] {
  const o = octRoofOutline(h, s), P = (lx: number, lz: number) => { const [ox, oz] = toW(h.yaw, lx, lz); return V(h.x + ox, y, h.z + oz); };
  return [P(o.cx + o.a - o.c, o.cz + o.b), P(o.cx - o.a + o.c, o.cz + o.b), P(o.cx - o.a, o.cz + o.b - o.c), P(o.cx - o.a, o.cz - o.b + o.c), P(o.cx - o.a + o.c, o.cz - o.b), P(o.cx + o.a - o.c, o.cz - o.b), P(o.cx + o.a, o.cz - o.b + o.c), P(o.cx + o.a, o.cz + o.b - o.c)];
}
function octRoofGeo(h: Hut, y: number, down = false): THREE.BufferGeometry {
  const [x0, x1, z0, z1] = hutRoofRect(h), m = Math.min(x1 - x0, z1 - z0) / 2, rise = m * h.pitch;
  const lo = octOutline(h, 0, y), hi = octOutline(h, m, y + rise);
  const ctr = lo.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / 8);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const sl = Math.hypot(m, rise);
  for (let k = 0; k < 8; k++) {
    const a = lo[k], b = lo[(k + 1) % 8], c = hi[(k + 1) % 8], d = hi[k];
    const n = b.clone().sub(a).cross(d.clone().sub(a));
    if (n.lengthSq() < 1e-8) n.copy(c.clone().sub(a).cross(d.clone().sub(a)));
    n.normalize();
    const mid = a.clone().add(b).multiplyScalar(0.5).sub(ctr); if (n.x * mid.x + n.z * mid.z < 0) n.negate();
    if (down) n.negate();
    const base = pos.length / 3, L = a.distanceTo(b), Lt = d.distanceTo(c), off = (L - Lt) / 2;
    for (const [p, u, v] of [[a, 0, sl], [b, L, sl], [c, off + Lt, 0], [d, off, 0]] as Array<[THREE.Vector3, number, number]>) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u / 0.95, v / 0.95); }
    const tri = (i0: number, i1: number, i2: number) => { const pa = V(pos[(base + i0) * 3], pos[(base + i0) * 3 + 1], pos[(base + i0) * 3 + 2]), pb = V(pos[(base + i1) * 3], pos[(base + i1) * 3 + 1], pos[(base + i1) * 3 + 2]), pc = V(pos[(base + i2) * 3], pos[(base + i2) * 3 + 1], pos[(base + i2) * 3 + 2]); const nn = pb.sub(pa).cross(pc.sub(pa)); if (nn.lengthSq() < 1e-10) return; if (nn.dot(n) >= 0) idx.push(base + i0, base + i1, base + i2); else idx.push(base + i0, base + i2, base + i1); };
    tri(0, 1, 2); tri(0, 2, 3);
  }
  return geoFrom(pos, nor, uv, idx);
}

export function addHut(main: Bins, det: Bins, h: Hut, rng: Rng) {
  const L = (lx: number, ly: number, lz: number, yaw = 0) => M(...(() => { const [ox, oz] = toW(h.yaw, lx, lz); return [h.x + ox, h.y + ly, h.z + oz] as [number, number, number]; })(), -h.yaw + yaw);
  const Lp = (lx: number, ly: number, lz: number) => { const [ox, oz] = toW(h.yaw, lx, lz); return V(h.x + ox, h.y + ly, h.z + oz); };
  const wallC = col(h.wall);
  const H = h.floorH;
  // floor for the ground cabin (the deck huts stand on their deck's planks)
  if (h.id === "depot") {
    main.woodDark.box(h.w + 0.2, 1.2, h.d + 0.2, L(0, -0.6, 0), tone(rng, BEAM, 0.05));
    main.wood.box(h.w - 0.1, 0.06, h.d - 0.1, L(0, -0.02, 0), col("#b98d5c"), [0.3, 0.1]);
    // stilts under the low side + porch steps
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = Lp(u * (h.w / 2 - 0.1), 0, v * (h.d / 2 - 0.1)); main.bark.add(logGeo(V(p.x, groundAt(p.x, p.z) - 0.5, p.z), V(p.x, h.y - 0.3, p.z), 0.16, 0.15, 8), null, col("#c9b79e")); }
    for (const k of LAYOUT.blocks) {
      if (Math.hypot(k.x - h.x, k.z - h.z) > 8) continue;
      main.woodDark.box(k.hx * 2, k.y1 - k.y0 - 0.06, k.hz * 2, M(k.x, (k.y0 + k.y1 - 0.06) / 2, k.z, -k.yaw), tone(rng, BEAM, 0.06));
      main.wood.box(k.hx * 2 + 0.04, 0.06, k.hz * 2 + 0.04, M(k.x, k.y1 - 0.03, k.z, -k.yaw), tone(rng, PLANK, 0.1), [rng() * 2, 0]);
    }
  }
  for (let f = 0; f < h.floors; f++) {
    const fy = f * H;
    for (const side of [0, 1, 2, 3] as Side[]) {
      const sf = sideFrame(h, side);
      const ops = f === 0 ? h.openings.filter((o) => o.side === side) : h.openings.filter((o) => o.side === side && o.kind === "window");
      const alongX = side === 0 || side === 2;
      const len = alongX ? sf.len : sf.len - 2 * WALL_T;
      for (const p of wallPieces(len, H, ops)) {
        const um = (p.u0 + p.u1) / 2, lx = sf.cx + sf.dir[0] * um - sf.n[0] * WALL_T / 2, lz = sf.cz + sf.dir[1] * um - sf.n[1] * WALL_T / 2;
        const w = p.u1 - p.u0, hh = p.v1 - p.v0;
        // chunky horizontal LOG walls outside (a dark backing board in the gaps between the logs), plank boards
        // inside (the interiors kit panels them) — a clapboard texture reads as pixelated camo blotches
        const bamboo = f > 0 || h.id.endsWith("pod");
        (bamboo ? main.thatch : main.woodDark).box(alongX ? w : WALL_T * 0.5, hh, alongX ? WALL_T * 0.5 : w, L(lx + sf.n[0] * WALL_T * 0.1, fy + (p.v0 + p.v1) / 2, lz + sf.n[1] * WALL_T * 0.1), col(bamboo ? "#b89a62" : "#8a6a48"), [rng() * 3, p.v0]);
        main.wood.box(alongX ? w : WALL_T * 0.4, hh, alongX ? WALL_T * 0.4 : w, L(lx - sf.n[0] * WALL_T * 0.3, fy + (p.v0 + p.v1) / 2, lz - sf.n[1] * WALL_T * 0.3), col("#d8b58a"), [0.5, p.v0 + 0.3]);
        if (f > 0 || h.id.endsWith("pod")) {
          // the loft storey + the sleeping pods: woven-bamboo walls — vertical poles 0.14 m apart (crests at the
          // collider face), a split-bamboo rail top and bottom
          // culms of mixed girth (4–8 cm) at uneven
          // spacing, each with its own lean and sun-bleach, over a woven straw mat; split-bamboo rails lashed at 3 heights
          let u = p.u0 + 0.02;
          while (u < p.u1 - 0.03) {
            const r = 0.04 + rng() * 0.035; u += r;
            if (u > p.u1 - 0.02) break;
            const off = 0.045 + r * 0.25 + (rng() - 0.5) * 0.015, lean = (rng() - 0.5) * 0.03;
            const a = Lp(sf.cx + sf.dir[0] * u + sf.n[0] * off, fy + p.v0, sf.cz + sf.dir[1] * u + sf.n[1] * off), b = Lp(sf.cx + sf.dir[0] * (u + lean) + sf.n[0] * off, fy + p.v1, sf.cz + sf.dir[1] * (u + lean) + sf.n[1] * off);
            const c = rng(), k = 0.84 + rng() * 0.26;
            main.wood.add(logGeo(a, b, r, r * (0.92 + rng() * 0.08), 6, true), null, col(c < 0.12 ? "#c9c27a" : c < 0.3 ? "#e3c37e" : "#f0dca6", k));
            u += r + 0.004 + rng() * 0.02;
          }
          for (const v of [p.v0 + 0.12, (p.v0 + p.v1) / 2, p.v1 - 0.12]) { const a = Lp(sf.cx + sf.dir[0] * p.u0 + sf.n[0] * 0.11, fy + v, sf.cz + sf.dir[1] * p.u0 + sf.n[1] * 0.11), b = Lp(sf.cx + sf.dir[0] * p.u1 + sf.n[0] * 0.11, fy + v, sf.cz + sf.dir[1] * p.u1 + sf.n[1] * 0.11); main.wood.add(logGeo(a, b, 0.05, 0.05, 6), null, col("#b8955a")); }
        } else {
          const nLog = Math.max(1, Math.round(hh / 0.3)), step = hh / nLog, lr = Math.min(0.155, step * 0.56);
          const ext = (u: number) => Math.abs(u) > len / 2 - 0.05 ? Math.sign(u) * 0.2 : 0;   // corner logs cross past the corner
          for (let i = 0; i < nLog; i++) {
            const v = fy + p.v0 + (i + 0.5) * step, u0 = p.u0 + ext(p.u0) + 0.01, u1 = p.u1 + ext(p.u1) - 0.01;
            const off = -0.035 + (i % 2 ? 0.012 : 0);   // log crests ≤ WALL_OUT past the wall plane (the collider covers them)
            const a = Lp(sf.cx + sf.dir[0] * u0 + sf.n[0] * off, v, sf.cz + sf.dir[1] * u0 + sf.n[1] * off), b = Lp(sf.cx + sf.dir[0] * u1 + sf.n[0] * off, v, sf.cz + sf.dir[1] * u1 + sf.n[1] * off);
            // (the plank texture's seams on round logs read as diagonal bricks) — real
            // horizontal logs: bark-grain running along each log (veg jungle bark, honey-tinted = peeled & weathered),
            // 8-sided, each its own girth / tone, sawn end-grain discs where the logs cross at the notched corners
            const r0 = lr * (0.92 + rng() * 0.12), r1 = lr * (0.92 + rng() * 0.12);
            main.bark.add(logGeo(a, b, r0, r1, 8), null, col(rng() < 0.25 ? "#e0b680" : "#f0cf9c", 0.95 + rng() * 0.15 - (i === 0 ? 0.14 : 0)));
            for (const [q, r, uu] of [[a, r0, p.u0], [b, r1, p.u1]] as Array<[THREE.Vector3, number, number]>) {
              if (!ext(uu)) continue;
              const dir = b.clone().sub(a).normalize().multiplyScalar(Math.sign(uu - (p.u0 + p.u1) / 2) * 0.004), disc = new THREE.CircleGeometry(r * 0.94, 8);
              const qq = q.clone().add(dir), m4 = new THREE.Matrix4().lookAt(qq, qq.clone().add(dir), V(0, 1, 0)).setPosition(qq);
              disc.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)); det.wood.add(disc, m4, col("#e9cf9f", 0.9 + rng() * 0.15));
            }
          }
        }
      }
      // frames + shutters / door leaves (boxes laid ALONG the wall: world yaw = hut yaw + the side's direction)
      const along = -h.yaw + Math.atan2(-sf.dir[1], sf.dir[0]);
      for (const o of ops) {
        const at = (du: number, dn: number, v: number) => { const lx = sf.cx + sf.dir[0] * (o.u + du) + sf.n[0] * dn, lz = sf.cz + sf.dir[1] * (o.u + du) + sf.n[1] * dn; const p = Lp(lx, fy + v, lz); return M(p.x, p.y, p.z, along); };
        const W2 = o.w / 2, dep = WALL_T + 0.08, mid = -WALL_T / 2;
        det.woodDark.bbox(0.1, o.h + 0.2, dep, at(-W2 - 0.05, mid, o.y + o.h / 2), tone(rng, BEAM, 0.06), 0.015);
        det.woodDark.bbox(0.1, o.h + 0.2, dep, at(W2 + 0.05, mid, o.y + o.h / 2), tone(rng, BEAM, 0.06), 0.015);
        det.woodDark.bbox(o.w + 0.3, 0.12, dep, at(0, mid, o.y + o.h + 0.06), tone(rng, BEAM, 0.06), 0.015);
        if (o.kind === "window") {
          det.woodDark.bbox(o.w + 0.36, 0.1, dep + 0.08, at(0, mid + 0.04, o.y - 0.05), tone(rng, BEAM, 0.06), 0.015);
          // open shutters swung flat against the outside wall on both sides
          for (const sd of [-1, 1]) det.wood.box(o.w / 2 - 0.02, o.h, 0.05, at(sd * (W2 + 0.12 + o.w / 4), 0.04, o.y + o.h / 2), tone(rng, "#6f8f5a", 0.08), [rng(), 0]);
        } else {
          // door leaf opened inward, flat against the inside wall
          det.wood.box(o.w * 0.9, o.h - 0.06, 0.05, at(W2 + 0.05 + o.w * 0.45, -WALL_T - 0.04, o.h / 2), tone(rng, "#8c5a36", 0.08), [rng(), 0]);
        }
      }
    }
    // corner posts (log) + sill / top plates
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = Lp(u * (h.w / 2 - 0.02), fy, v * (h.d / 2 - 0.02)); main.bark.add(logGeo(V(p.x, p.y - (f === 0 ? 0.35 : 0), p.z), V(p.x, p.y + H + 0.2, p.z), 0.15, 0.14, 8), null, col("#c9b79e")); }
    for (const sd of [-1, 1]) {
      main.woodDark.bbox(h.w + 0.2, 0.2, 0.26, L(0, fy + H + 0.05, sd * (h.d / 2 - 0.05)), tone(rng, BEAM, 0.05), 0.03);
      main.woodDark.bbox(0.26, 0.2, h.d + 0.2, L(sd * (h.w / 2 - 0.05), fy + H + 0.05, 0), tone(rng, BEAM, 0.05), 0.03);
    }
    // ceiling boards + beams (top storey) / loft floor (storey below the top)
    const iw = h.w / 2 - WALL_T, id = h.d / 2 - WALL_T;
    if (f === h.floors - 1) {
      main.wood.box(iw * 2, 0.08, id * 2, L(0, fy + H + 0.06, 0), col("#e2c296"));   // (beams + ceiling finish: interiors kit)
    } else if (h.stair) {
      const s = h.stair, x0 = s.x0 - 0.05, x1 = s.x0 + s.steps * s.run + 0.05, z1 = s.z + s.w / 2 + 0.05;
      const rects: Array<[number, number, number, number]> = [[-iw, iw, z1, id], [-iw, x0, -id, z1], [x1, iw, -id, z1]];
      for (const [a, b, cq, d] of rects) if (b - a > 0.05 && d - cq > 0.05) main.wood.box(b - a, 0.24, d - cq, L((a + b) / 2, fy + H - 0.12, (cq + d) / 2), col("#f6e2bc"), [rng(), rng()]);
      // exposed joists across the short span under the loft floor (not over the stair
      // opening), a summer beam, two hanging storm lanterns glowing warm over the room
      for (let jx = -iw + 0.45; jx < iw - 0.2; jx += 0.9) {
        const open = jx > x0 - 0.1 && jx < x1 + 0.1;
        const za = open ? z1 + 0.02 : -id, zb = id;
        main.woodDark.add(chamferBoxGeo(0.14, 0.2, zb - za, 0.02), L(jx, fy + H - 0.34, (za + zb) / 2), tone(rng, "#e4bd88", 0.08));
      }
      main.woodDark.add(chamferBoxGeo(iw * 2, 0.26, 0.22, 0.03), L(0, fy + H - 0.37, z1 + 0.14), tone(rng, "#dcb27c", 0.06));
      for (const lx of [-iw * 0.45, iw * 0.55]) {
        const p = Lp(lx, fy + H - 0.36, (z1 + id) / 2 + 0.2);
        det.rope.add(logGeo(V(p.x, p.y, p.z), V(p.x, p.y - 0.55, p.z), 0.012, 0.012, 3), null, col(ROPE));
        det.metal.add(cylGeo(0.11, 0.13, 0.05, 8), M(p.x, p.y - 0.58, p.z), col("#3a3530"));
        det.metal.add(cylGeo(0.02, 0.13, 0.08, 8), M(p.x, p.y - 0.55, p.z), col("#3a3530"));
        det.bulb.add(cylGeo(0.09, 0.09, 0.24, 10), M(p.x, p.y - 0.72, p.z), col("#ffffff"));
        det.metal.add(cylGeo(0.12, 0.12, 0.04, 8), M(p.x, p.y - 0.86, p.z), col("#3a3530"));
        for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; det.metal.box(0.015, 0.28, 0.015, M(p.x + Math.cos(a) * 0.11, p.y - 0.72, p.z + Math.sin(a) * 0.11), col("#2e2c2a")); }
      }
      // rail along the opening
      const rp: THREE.Vector3[] = []; for (let k = 0; k <= 3; k++) rp.push(Lp(x0 + 0.6 + (x1 - x0 - 1.2) * k / 3, fy + H, z1 + 0.04));
      ropeRail(det, rp, rng, { postR: 0.05 });
      // interior stair: OPEN joinery = the shared colliders — chunky nosed
      // treads with open risers on two notched stringers, a closed plank cupboard (with a door) under the low flight only,
      // turned balusters + a newel + a handrail on the room side
      const rise = H / s.steps, zo = s.z + s.w / 2;
      for (let i = 0; i < s.steps; i++) {
        const cx = s.x0 + (i + 0.5) * s.run, ty = (i + 1) * rise, cab = ty <= STAIR_CAB + 1e-6;
        main.wood.bbox(s.run + 0.06, cab ? 0.07 : 0.12, s.w - 0.04, L(cx + 0.02, ty - (cab ? 0.035 : 0.06), s.z), tone(rng, "#f0d2a2", 0.08), 0.02);
        if (cab) main.woodDark.box(0.04, rise - 0.07, s.w - 0.16, L(cx - s.run / 2 + 0.03, ty - rise / 2 - 0.035, s.z), tone(rng, BEAM, 0.08));
      }
      for (const sd of [-1, 1]) {
        const zz = s.z + sd * (s.w / 2 - 0.05);
        const bm = beamM(Lp(s.x0 - 0.1, 0.12, zz), Lp(s.x0 + s.steps * s.run + 0.05, H - 0.1, zz));
        main.woodDark.add(chamferBoxGeo(bm.len, 0.32, 0.09, 0.025), bm.m, tone(rng, "#a87a4c", 0.05));
      }
      // the cupboard under the low flight: boards following the flight + a small plank door with a latch
      const nCab = Math.max(1, Math.floor(STAIR_CAB / rise + 1e-6));
      for (let i = 0; i < nCab; i++) {
        const cx = s.x0 + (i + 0.5) * s.run, hy = (i + 1) * rise - 0.07;
        det.wood.box(s.run - 0.02, hy, 0.05, L(cx, hy / 2, zo + 0.02), col(i % 2 ? "#d6ab78" : "#cfa06c"), [rng(), 0]);
      }
      { const dx = s.x0 + nCab * s.run - 0.02; det.woodDark.box(0.05, nCab * rise - 0.07, s.w - 0.04, L(dx, (nCab * rise - 0.07) / 2, s.z), tone(rng, BEAM, 0.06), [rng(), 0]); }
      { const dc = s.x0 + nCab * s.run * 0.55; det.wood.bbox(0.62, 0.95, 0.04, L(dc, 0.55, zo + 0.05), col("#9a6a40"), 0.01); det.metal.add(cylGeo(0.025, 0.025, 0.05, 6), L(dc + 0.22, 0.6, zo + 0.08, 0).multiply(M(0, 0, 0, 0, Math.PI / 2)), col("#2e2c2a")); }
      // balustrade from the 3rd tread: a baluster per tread, newel posts, a handrail along the nosing line + 0.96 m
      // (parity: a ray must meet what stops it) a boarded balustrade — vertical tongue-and-groove boards stepping up with
      // the flight (= the per-tread balustrade colliders), a capping handrail, newels
      for (let i = 2; i < s.steps; i++) {
        const cx = s.x0 + (i + 0.5) * s.run, ty = (i + 1) * rise;
        for (let k = 0; k < 3; k++) det.wood.box(s.run / 3 - 0.012, 0.96, 0.05, L(cx - s.run / 3 + k * s.run / 3, ty + 0.48, zo + 0.03), tone(rng, (i + k) % 2 ? "#e2b884" : "#d8ab76", 0.05), [rng(), 0]);
      }
      for (const i of [1, s.steps - 1]) { const cx = s.x0 + (i + 0.5) * s.run, ty = (i + 1) * rise; main.woodDark.add(chamferBoxGeo(0.14, 1.12, 0.14, 0.025), L(cx, ty + 0.5, zo + 0.03), tone(rng, "#a87a4c", 0.05)); det.woodDark.add(new THREE.SphereGeometry(0.09, 8, 6), L(cx, ty + 1.12, zo + 0.03), col("#a87a4c")); }
      { const hb = beamM(Lp(s.x0 + 1.5 * s.run, 2 * rise + 1.0, zo + 0.03), Lp(s.x0 + (s.steps - 0.5) * s.run, H + 1.0, zo + 0.03)); det.woodDark.add(chamferBoxGeo(hb.len, 0.08, 0.1, 0.02), hb.m, tone(rng, "#b88a58", 0.05)); }
    }
  }
  // thatched OCTAGONAL roof: thick thatch (top + underside), a fat rolled lip + a long ragged straw skirt on all 8
  // eave edges, a second ragged course a third of the way up (layered thatch), the ridge roll
  const top = h.floors * H + 0.2;
  const [x0, x1, z0, z1] = hutRoofRect(h);
  main.thatch.add(octRoofGeo(h, h.y + top), null, col(THATCH), (x, y, z, b, o) => { o.multiplyScalar(0.88 + 0.12 * Math.sin(x * 3.1 + z * 2.3) * Math.sin(y * 4.1 + x)); });
  main.thatch.add(octRoofGeo(h, h.y + top - 0.3, true), null, col(THATCH, 0.62));
  {
    const ring = octOutline(h, -0.02, h.y + top - 0.12), ctr = ring.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / 8);
    const m = Math.min(x1 - x0, z1 - z0) / 2, up = octOutline(h, m * 0.36, h.y + top + m * 0.36 * h.pitch - 0.02);
    for (let k = 0; k < 8; k++) {
      const a = ring[k], b = ring[(k + 1) % 8], mid = a.clone().add(b).multiplyScalar(0.5), o = mid.clone().sub(ctr).setY(0).normalize();
      const bm = beamM(a, b);
      main.thatch.add(chamferBoxGeo(bm.len + 0.25, 0.4, 0.36, 0.12), bm.m, col(THATCH, 0.95));
      const ext = b.clone().sub(a).normalize().multiplyScalar(0.14);
      thatchFringe(det, a.clone().sub(ext).addScaledVector(o, 0.17).setY(a.y - 0.1), b.clone().add(ext).addScaledVector(o, 0.17).setY(b.y - 0.1), o, rng, 0.72);
      // the upper course's ragged hem lying on the slope
      const ua = up[k], ub = up[(k + 1) % 8];
      if (ua.distanceTo(ub) > 0.4) thatchFringe(det, ua.clone().addScaledVector(o, 0.06), ub.clone().addScaledVector(o, 0.06), o, rng, 0.42);
    }
  }
  {
    const hw = (x1 - x0) / 2, hd = (z1 - z0) / 2, rise = Math.min(hw, hd) * h.pitch, rl = Math.abs(hw - hd), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const alongX = hw >= hd;
    const p = alongX ? Lp(cx - rl - 0.2, top + rise, cz) : Lp(cx, top + rise, cz - rl - 0.2), q = alongX ? Lp(cx + rl + 0.2, top + rise, cz) : Lp(cx, top + rise, cz + rl + 0.2);
    main.thatch.add(logGeo(p, q, 0.24, 0.24, 8), null, col(THATCH, 0.82));
    // a tied straw top-knot over the ridge ends (the round huts' finial)
    for (const e of [p, q]) { det.fringe.add(new THREE.ConeGeometry(0.32, 0.7, 7), M(e.x, e.y + 0.3, e.z), col(THATCH, 0.8)); det.rope.add(new THREE.TorusGeometry(0.2, 0.04, 4, 10), M(e.x, e.y + 0.18, e.z, 0, Math.PI / 2), col(ROPE)); }
  }
  // lantern by the first door
  const d0 = h.openings.find((o) => o.kind === "door");
  if (d0) {
    const sf = sideFrame(h, d0.side), lx = sf.cx + sf.dir[0] * (d0.u + d0.w / 2 + 0.35) + sf.n[0] * 0.18, lz = sf.cz + sf.dir[1] * (d0.u + d0.w / 2 + 0.35) + sf.n[1] * 0.18;
    const p = Lp(lx, 2.2, lz);
    det.metal.add(cylGeo(0.09, 0.11, 0.26, 8), M(p.x, p.y, p.z), col("#3a3530"));
    det.bulb.add(new THREE.SphereGeometry(0.075, 8, 6), M(p.x, p.y, p.z), col("#ffffff"));
  }
  // BANANA CO. sign on the lodge front
  if (h.interior === "lodge") {
    main.wood.bbox(2.6, 0.7, 0.07, L(1.2, H + 0.5, h.d / 2 + 0.04), col("#f2c23a"), 0.02);
    det.label.add(new THREE.PlaneGeometry(2.3, 0.6), L(1.2, H + 0.5, h.d / 2 + 0.085), col("#ffffff"));
  }
}

export function addShelter(main: Bins, det: Bins, s: Shelter, rng: Rng) {
  const Lp = (lx: number, ly: number, lz: number) => { const [ox, oz] = toW(s.yaw, lx, lz); return V(s.x + ox, s.y + ly, s.z + oz); };
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = Lp(u * (s.w / 2 - 0.15), 0, v * (s.d / 2 - 0.15)); main.bark.add(logGeo(p, V(p.x, p.y + s.h + 0.2, p.z), 0.13, 0.12, 8), null, col("#c9b79e")); lashing(det, p.x, p.y + s.h - 0.2, p.z, 0.12); }
  const rect: [number, number, number, number] = [-s.w / 2 - 0.5, s.w / 2 + 0.5, -s.d / 2 - 0.5, s.d / 2 + 0.5];
  const shell = hipRoofGeo(s, rect, s.y + s.h, s.pitch);
  main.thatch.add(shell, null, col(THATCH));
  const under = hipRoofGeo(s, rect, s.y + s.h - 0.28, s.pitch);
  const nrm = under.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  const ix = under.index!; for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); }
  main.thatch.add(under, null, col(THATCH, 0.7));
  for (const [a, b] of [[[rect[0], rect[2]], [rect[1], rect[2]]], [[rect[1], rect[2]], [rect[1], rect[3]]], [[rect[1], rect[3]], [rect[0], rect[3]]], [[rect[0], rect[3]], [rect[0], rect[2]]]] as Array<[[number, number], [number, number]]>) {
    const bm = beamM(Lp(a[0], s.h - 0.1, a[1]), Lp(b[0], s.h - 0.1, b[1]));
    main.thatch.add(chamferBoxGeo(bm.len + 0.2, 0.34, 0.3, 0.1), bm.m, col(THATCH, 0.95));
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ol = Math.hypot(mx, mz) || 1, o = Lp(mx / ol, 0, mz / ol).sub(Lp(0, 0, 0)).normalize();
    thatchFringe(det, Lp(a[0], s.h - 0.18, a[1]).addScaledVector(o, 0.15), Lp(b[0], s.h - 0.18, b[1]).addScaledVector(o, 0.15), o, rng, 0.42);
  }
  for (const sd of [-1, 1]) { const bm = beamM(Lp(-s.w / 2, s.h, sd * (s.d / 2 - 0.15)), Lp(s.w / 2, s.h, sd * (s.d / 2 - 0.15))); main.woodDark.add(chamferBoxGeo(bm.len, 0.2, 0.18, 0.02), bm.m, tone(rng, BEAM, 0.05)); }
}

// ------------------------------------------------------------------------------------------------ ziplines
export function addZip(main: Bins, det: Bins, z: Zip, rng: Rng) {
  const a = V(...z.a), b = V(...z.b);
  main.cable.add(ropeGeo(sagPts(a, b, z.sag, 48), 0.03, 5, 1), null, col("#ffffff"));
  for (const [e, p, deck, q] of [[0, a, z.ya, b], [1, b, z.yb, a]] as Array<[0 | 1, THREE.Vector3, number, THREE.Vector3]>) {
    // the pole stands beside the cable end (zipPole: the shared collider) and holds the cable on a
    // cantilever arm — a rider arriving under the cable steps straight onto the deck past it
    const [px, pz] = zipPole(z, e);
    main.bark.add(logGeo(V(px, deck - 0.4, pz), V(px, p.y + 0.35, pz), 0.17, 0.15, 10), null, col("#cdbca5"));
    { const cap = new THREE.CircleGeometry(0.15, 10); cap.rotateX(-Math.PI / 2); main.bark.add(cap, M(px, p.y + 0.35, pz), col("#a89880")); }
    // cantilever arm from the pole over the cable end + a brace, then the pulley block + a hanging T-bar trolley
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    { const ex = p.x + ux * 0.35, ez = p.z + uz * 0.35, ax = ex - px, az = ez - pz, al = Math.hypot(ax, az);
      det.woodDark.bbox(0.16, 0.16, al + 0.3, M((px + ex) / 2, p.y + 0.15, (pz + ez) / 2, Math.atan2(-az, ax) + Math.PI / 2), col(BEAM), 0.02);
      det.woodDark.add(logGeo(V(px, p.y - 0.75, pz), V(px + ax * 0.6, p.y + 0.1, pz + az * 0.6), 0.05, 0.05, 6), null, col(BEAM)); }
    det.metal.add(cylGeo(0.16, 0.16, 0.08, 14), M(p.x + ux * 0.25, p.y, p.z + uz * 0.25, Math.atan2(-uz, ux), 0, Math.PI / 2), col("#e0b020"));
    det.metal.add(new THREE.TorusGeometry(0.16, 0.035, 5, 14), M(p.x + ux * 0.25, p.y, p.z + uz * 0.25, Math.atan2(-uz, ux) + Math.PI / 2), col("#2e2c2a"));
    const hx = p.x + ux * 0.6, hz = p.z + uz * 0.6, hy = p.y - 0.05 - 4 * z.sag * (0.6 / Math.hypot(b.x - a.x, b.z - a.z));
    det.metal.add(logGeo(V(hx, hy, hz), V(hx, hy - 1.0, hz), 0.02, 0.02, 4), null, col("#3a3835"));
    det.plastic.add(logGeo(V(hx - uz * 0.3, hy - 1.02, hz + ux * 0.3), V(hx + uz * 0.3, hy - 1.02, hz - ux * 0.3), 0.04, 0.04, 8), null, col("#d8342c"));
    lashing(det, px, p.y - 0.5, pz, 0.16);
    void rng;
  }
}

// ------------------------------------------------------------------------------------------------ props
/** one banana finger: a curved, tapered 5-sided tube (blunt flower tip, a short neck into the crown), bending UP from
 *  its crown at the local origin along +x; cached. Vertex colour: green neck, yellow body, a dark tip */
const bananaGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    const n = 6, sides = 5, pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [], colr: number[] = [];
    const P = (t: number) => V(0.2 * Math.sin(t * 1.25) / Math.sin(1.25), 0.11 * (1 - Math.cos(t * 1.5)) / (1 - Math.cos(1.5)), 0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, c = P(t), d = P(Math.min(1, t + 0.01)).sub(P(Math.max(0, t - 0.01))).normalize();
      const side = V(0, 0, 1), up = d.clone().cross(side).normalize();
      const r = t < 0.12 ? 0.012 + t * 0.12 : 0.008 + 0.027 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.12) / 0.88 * 0.92 + 0.08)), 0.45);
      for (let k = 0; k <= sides; k++) {
        const a = k / sides * Math.PI * 2, nx = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
        pos.push(c.x + nx.x * r, c.y + nx.y * r, c.z + nx.z * r); nor.push(nx.x, nx.y, nx.z); uv.push(k / sides, t);
        const neck = t < 0.14, tip = t > 0.95;
        colr.push(...(tip ? [0.25, 0.2, 0.12] : neck ? [0.62, 0.75, 0.3] : [1, 0.97 - 0.05 * Math.cos(a * 5), 0.85]));
      }
    }
    for (let i = 0; i < n; i++) for (let k = 0; k < sides; k++) { const a = i * (sides + 1) + k, b2 = a + sides + 1; idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
    g = geoFrom(pos, nor, uv, idx); g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    return g;
  };
})();
/** a real BUNCH lying on its side: a curved green-brown stalk with 3 hands spiralled
 *  round it, each hand a fan of 5–7 fingers curving up and out from its crown — local frame: stalk along x, base at 0 */
function bananaBunch(bins: Bins, m: THREE.Matrix4, rng: Rng) {
  const stalk = (t: number) => new THREE.Vector3(-0.1 + t * 0.5, 0.13 + 0.03 * Math.sin(t * 3), 0);
  const sp: THREE.Vector3[] = []; for (let i = 0; i <= 6; i++) sp.push(stalk(i / 6).applyMatrix4(m));
  bins.woodDark.add(ropeGeo(sp, 0.028, 6, 2), null, col("#6f7a3a"));
  for (let hnd = 0; hnd < 3; hnd++) {
    const t = 0.25 + hnd * 0.25, c = stalk(t), nf = 6 - hnd, roll = hnd * 2.1;
    for (let i = 0; i < nf; i++) {
      const a = roll + (i / nf - 0.5) * 2.4;   // fingers fanned round the stalk's upper / side arc
      const fm = m.clone().multiply(M(c.x, c.y, c.z)).multiply(new THREE.Matrix4().makeRotationX(a)).multiply(M(0, 0.025, 0, (rng() - 0.5) * 0.2, 0, Math.PI / 2 - 0.25 + (rng() - 0.5) * 0.15));   // finger along the radius, curving back toward the stalk's base
      bins.plastic.add(bananaGeo(), fm, col(rng() < 0.15 ? "#d8e04a" : "#ffdc3a", 0.94 + rng() * 0.1));
    }
  }
}
function bananaHand(bins: Bins, m: THREE.Matrix4, rng: Rng, n = 6) {
  // one loose hand: a row of fingers fanned from a shared green crown, curving up
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * 0.9;
    bins.plastic.add(bananaGeo(), m.clone().multiply(M(0, 0.03 + Math.abs(i - (n - 1) / 2) * 0.01, (i - (n - 1) / 2) * 0.05, a)), col(rng() < 0.12 ? "#d8e04a" : "#ffdc3a", 0.95 + rng() * 0.08));
  }
  bins.plastic.add(logGeo(new THREE.Vector3(-0.05, 0.03, 0).applyMatrix4(m), new THREE.Vector3(-0.1, 0.05, 0).applyMatrix4(m), 0.03, 0.022, 6), null, col("#7f8a3c"));
}
function crate(main: Bins, det: Bins, m: THREE.Matrix4, s: number, rng: Rng, yellow: boolean, label: boolean) {
  // (a saturated BANANA CO. yellow, authored greener — the warm grade pushes yellows orange)
  const w = 1.0 * s, base = yellow ? "#f6e02c" : "#e8c28a";
  (yellow ? main.plastic : main.wood).add(chamferBoxGeo(w - 0.06, w - 0.06, w - 0.06, 0.02, [rng() * 3, 0]), m, tone(rng, base, 0.05));
  // bevelled frame boards on every edge (worn: lighter rubbed chamfers) + riveted steel corner caps
  for (const [x, y, z, sx, sy, sz] of [[0, 1, 1, 1, 0, 0], [0, -1, 1, 1, 0, 0], [0, 1, -1, 1, 0, 0], [0, -1, -1, 1, 0, 0], [1, 0, 1, 0, 1, 0], [-1, 0, 1, 0, 1, 0], [1, 0, -1, 0, 1, 0], [-1, 0, -1, 0, 1, 0], [1, 1, 0, 0, 0, 1], [-1, 1, 0, 0, 0, 1], [1, -1, 0, 0, 0, 1], [-1, -1, 0, 0, 0, 1]]) {
    (yellow ? det.plastic : det.woodDark).box(sx ? w - 0.16 : 0.1, sy ? w - 0.16 : 0.1, sz ? w - 0.16 : 0.1, m.clone().multiply(M(x * (w / 2 - 0.04), y * (w / 2 - 0.04), z * (w / 2 - 0.04))), tone(rng, yellow ? "#e9c21c" : "#a57a4c", 0.07));
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    det.metal.box(0.15, 0.15, 0.15, m.clone().multiply(M(x * (w / 2 - 0.06), y * (w / 2 - 0.06), z * (w / 2 - 0.06))), col("#55504a"));
  }
  // diagonal brace on the two side faces (the stencil faces stay clear)
  for (const xx of [1, -1]) (yellow ? det.plastic : det.woodDark).box(0.06, 0.08, w * 1.12, m.clone().multiply(M(xx * (w / 2 - 0.01), 0, 0, 0, Math.PI / 4)), tone(rng, yellow ? "#ffc934" : "#a57a4c", 0.06));
  // BANANA CO. stencil big on the two stencil faces (± z) — legible at 15 m (0.8 × 0.5 of the face, bold paint)
  if (label) for (const k of [0, 2]) { const a = k * Math.PI / 2; det.label.add(new THREE.PlaneGeometry(w * 0.8, w * 0.5), m.clone().multiply(M(Math.sin(a) * (w / 2 + 0.006), 0, Math.cos(a) * (w / 2 + 0.006), a)), col("#ffffff")); }
}
/** a chiselled rock = its collider box ∩ the shared chamfer planes (rockPlanes): a convex faceted block with
 *  flat facets, crisp bevels and chipped corners, built by clipping the box's faces plane by plane (Sutherland–Hodgman +
 *  a cap polygon per cut). Local frame: bottom at y 0; vertex colours: darker toward the (buried) foot, lit crown */
function rockBlockGeo(p: Prop, chamferK = 1): THREE.BufferGeometry {
  const { hx, hz } = p, top = p.hy * 2;
  type P3 = [number, number, number];
  const box: P3[][] = [
    [[hx, 0, -hz], [hx, top, -hz], [hx, top, hz], [hx, 0, hz]], [[-hx, 0, hz], [-hx, top, hz], [-hx, top, -hz], [-hx, 0, -hz]],
    [[-hx, top, -hz], [-hx, top, hz], [hx, top, hz], [hx, top, -hz]], [[-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz]],
    [[-hx, 0, hz], [hx, 0, hz], [hx, top, hz], [-hx, top, hz]], [[hx, 0, -hz], [-hx, 0, -hz], [-hx, top, -hz], [hx, top, -hz]],
  ];
  let polys = box;
  for (const [nx, ny, nz, d] of rockPlanes(p, chamferK)) {
    const side = (q: P3) => nx * q[0] + ny * q[1] + nz * q[2] - d;
    const next: P3[][] = [], cap: P3[] = [];
    for (const poly of polys) {
      const out: P3[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
        if (sa <= 0) out.push(a);
        if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) { const t = sa / (sa - sb), q: P3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; out.push(q); cap.push(q); }
      }
      if (out.length >= 3) next.push(out);
    }
    if (cap.length >= 3) {
      // order the cap points around their centroid in the cut plane (outward normal = n)
      const c = cap.reduce((s, q) => [s[0] + q[0] / cap.length, s[1] + q[1] / cap.length, s[2] + q[2] / cap.length] as P3, [0, 0, 0] as P3);
      const n = V(nx, ny, nz), u = Math.abs(ny) < 0.9 ? V(0, 1, 0).cross(n).normalize() : V(1, 0, 0).cross(n).normalize(), w = n.clone().cross(u);
      const ang = (q: P3) => { const v = V(q[0] - c[0], q[1] - c[1], q[2] - c[2]); return Math.atan2(v.dot(w), v.dot(u)); };
      const uniq = cap.filter((q, i) => cap.findIndex((o) => Math.hypot(o[0] - q[0], o[1] - q[1], o[2] - q[2]) < 1e-5) === i).sort((a, b) => ang(a) - ang(b));
      if (uniq.length >= 3) next.push(uniq);
    }
    polys = next;
  }
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [], colr: number[] = [];
  for (const poly of polys) {
    // face normal from Newell's method; flip the fan when it points inward (faces wind outward)
    const n = V(0, 0, 0);
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; n.x += (a[1] - b[1]) * (a[2] + b[2]); n.y += (a[2] - b[2]) * (a[0] + b[0]); n.z += (a[0] - b[0]) * (a[1] + b[1]); }
    n.normalize();
    const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cy = poly.reduce((s, q) => s + q[1], 0) / poly.length, cz = poly.reduce((s, q) => s + q[2], 0) / poly.length;
    const outward = n.x * cx + n.y * (cy - p.hy) + n.z * cz > 0;
    if (!outward) n.negate();
    const base = pos.length / 3;
    for (const q of poly) {
      pos.push(q[0], q[1], q[2]); nor.push(n.x, n.y, n.z); uv.push(q[0] + q[2], q[1]);
      const k = (0.62 + 0.38 * Math.min(1, q[1] / top * 1.3)) * (n.y > 0.5 ? 1.08 : 1);
      colr.push(k, k, k * 0.97);
    }
    for (let i = 1; i + 1 < poly.length; i++) { if (outward) idx.push(base, base + i, base + i + 1); else idx.push(base, base + i + 1, base + i); }
  }
  const g = geoFrom(pos, nor, uv, idx);
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  return g;
}
/** one triangle (local coords) with its normal */
function triGeo(a: [number, number, number], b: [number, number, number], c: [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 0, 0, 0.5, 1, 1, 0], 2));
  g.computeVertexNormals();
  return g;
}
/** A-frame canvas: two sagging slopes (length 2·hl along x, half width hw, ridge height h).
 *  Every 0.62 m awning stripe is its OWN strip of quads (crisp
 *  edges, no colour interpolated across a band), 12 rows down the slope: the ridge dips between the poles, the slopes
 *  belly in, diagonal tension folds run from the pole tops, the hem scallops between the pegs; both faces drawn */
function tentGeo(hl: number, hw: number, h: number, rng: Rng, accent: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  const ny = 12, pos: number[] = [], uv: number[] = [], idx: number[] = [], colr: number[] = [];
  const ph = rng() * 6, bw = 0.62, nb = Math.max(2, Math.round(2 * hl / bw)), bwid = 2 * hl / nb;
  const P = (x: number, t: number, sd: number): [number, number, number] => {
    const u = (x + hl) / (2 * hl), su = Math.sin(Math.PI * u);
    const ridge = 0.09 * su;                                                       // ridge rope sags between the poles
    const belly = 0.16 * Math.sin(Math.PI * t) * (0.5 + 0.5 * su);                 // slope pulled in by its own weight
    const fold = 0.05 * Math.sin(Math.PI * t) * Math.sin((u * 2 - t * 0.6) * Math.PI * 3 + ph);   // diagonal tension folds
    const hem = t > 0.88 ? (t - 0.88) * 0.5 : 0, scal = t > 0.9 ? 0.06 * Math.abs(Math.sin(u * Math.PI * 4)) * (t - 0.9) / 0.1 : 0;
    return [x, (h - ridge) * (1 - t) + scal, sd * (hw * t - belly + fold + hem)];
  };
  for (const sd of [-1, 1]) for (let b = 0; b < nb; b++) {
    const band = b % 2 ? accent : [0.96, 0.92, 0.8], base = pos.length / 3, nx = 3;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const t = j / ny, x = -hl + (b + i / nx) * bwid;
      pos.push(...P(x, t, sd)); uv.push((x + hl) / 1.2, t * 1.6);
      // painted canvas: sun-bleached at the ridge, a dark hem band, dirt splash at the foot, a seam line at each band edge
      const edge = i === 0 || i === nx ? 0.88 : 1, k = edge * (t > 0.9 ? 0.62 : 1) * (1.05 - 0.2 * t) * (0.95 + 0.05 * Math.sin(x * 7 + ph));
      colr.push(k * band[0], k * band[1], k * band[2]);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = base + j * (nx + 1) + i, c = a + nx + 1; if (sd > 0) idx.push(a, c, a + 1, a + 1, c, c + 1); else idx.push(a, a + 1, c, a + 1, c + 1, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // inside faces (visible through the open door)
  const inside = g.clone(); const ix = inside.index!; for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); }
  inside.computeVertexNormals();
  const out = new THREE.BufferGeometry();
  const Pp = [...(g.attributes.position.array as Float32Array), ...(inside.attributes.position.array as Float32Array)], U = [...(g.attributes.uv.array as Float32Array), ...(inside.attributes.uv.array as Float32Array)], N = [...(g.attributes.normal.array as Float32Array), ...(inside.attributes.normal.array as Float32Array)];
  const n0 = g.attributes.position.count, I = [...Array.from(g.index!.array), ...Array.from(ix.array).map((k) => k + n0)];
  out.setAttribute("position", new THREE.Float32BufferAttribute(Pp, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3)); out.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); out.setIndex(I);
  out.setAttribute("color", new THREE.Float32BufferAttribute([...colr, ...colr.map((v) => v * 0.6)], 3));
  return out;
}
/** a tied burlap sack: a lathed sack body slumped under its own weight (wide flat
 *  foot, bulging belly, cinched neck, a frayed tuft over the tie), lumpy, in local metres (bottom at y 0) */
function sackGeo(seed: number, H = 0.62, R = 0.3): THREE.BufferGeometry {
  const prof: Array<[number, number]> = [[0, 0], [R * 0.82, 0], [R * 0.98, 0.06 * H], [R, 0.22 * H], [R * 0.93, 0.45 * H], [R * 0.7, 0.66 * H], [R * 0.36, 0.8 * H], [R * 0.2, 0.86 * H], [R * 0.24, 0.9 * H], [R * 0.33, 0.97 * H], [R * 0.18, H], [0, H * 0.98]];
  const g = latheGeo(prof, 14), p = g.attributes.position as THREE.BufferAttribute, r = mulberry(seed);
  const ph = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), t = y / H;
    const lump = 1 + 0.07 * Math.sin(a * 3 + ph[0]) * Math.sin(t * 7 + ph[1]) + 0.04 * Math.sin(a * 7 + ph[2]);
    const slump = 1 + 0.18 * Math.max(0, 0.5 - t);                     // settles wide at the foot
    p.setXYZ(i, x * lump * slump * 1.08, y * (1 - 0.05 * Math.cos(a * 2)), z * lump * slump * 0.92);
  }
  g.computeVertexNormals();
  return g;
}
export function addProp(main: Bins, det: Bins, p: Prop, rng: Rng) {
  const at = (dy = 0, s = 1) => M(p.x, p.y + dy, p.z, -p.yaw, 0, 0, s);
  const s = p.s;
  switch (p.kind) {
    case "crate": crate(main, det, at(p.hy), s, rng, false, true); break;
    case "crate-banana": crate(main, det, at(p.hy), s, rng, true, true); bananaBunch(det, at(p.hy * 2 - 0.16).multiply(M(-0.12, 0, 0.05, rng() * 0.6 - 0.3, 0, 0, 0.85)), rng); bananaHand(det, at(p.hy * 2 - 0.04).multiply(M(0.2, 0, -0.28, 2.4 + rng())), rng); break;   // (parity: nothing stands > 0.12 m proud of the lid) break;
    case "crate-stack": {
      // (parity: the crates fill their two collider boxes — only a hair of hand-stacked skew)
      crate(main, det, at(0.5).multiply(M(-0.45, 0, 0.02, 0.025)), 0.94, rng, false, true);
      crate(main, det, at(0.5).multiply(M(0.46, 0, -0.02, -0.02)), 0.94, rng, true, true);
      crate(main, det, at(1.45).multiply(M(0.0, 0, 0.0, 0.01)), 0.95, rng, false, false);
      break;
    }
    case "barrel": {
      main.woodDark.add(latheGeo([[0, 0], [0.38, 0], [0.42, 0.25], [0.44, 0.55], [0.42, 0.85], [0.38, 1.1], [0, 1.1]], 16), at(), tone(rng, "#9b6b3c", 0.08));
      for (const y of [0.18, 0.92]) det.metal.add(new THREE.TorusGeometry(0.405 + (y > 0.5 ? 0 : 0.01), 0.02, 4, 18), at(y).multiply(M(0, 0, 0, 0, Math.PI / 2)), col("#403a33"));
      break;
    }
    case "drum": main.plastic.add(cylGeo(0.34, 0.34, 1.0, 16), at(0.5), col("#2f7fa8")); break;
    case "log": {
      const a = new THREE.Vector3(-p.hx + 0.02, 0, 0).applyMatrix4(at(p.hy)), b = new THREE.Vector3(p.hx - 0.02, 0, 0).applyMatrix4(at(p.hy));   // (parity: the full collider length)
      main.bark.add(logGeo(a, b, p.hz * 0.98, p.hz * 0.9, 12), null, col("#b5a48c"));
      for (const [q, r] of [[a, p.hz * 0.98], [b, p.hz * 0.9]] as Array<[THREE.Vector3, number]>) det.wood.add(cylGeo(r * 0.92, r * 0.92, 0.04, 12), M(q.x, q.y, q.z, -p.yaw, 0, Math.PI / 2), col("#d8b98c"));
      break;
    }
    // (parity: a superellipsoid leaves the collider's corners / top 0.2–0.5 m proud) — a chiselled block cut
    // from the SAME box + chamfer planes the collider steps follow (rockPlanes); triplanar mossy boulder stone (kit.ts)
    case "rock": main.rock.add(rockBlockGeo(p), M(p.x, p.y, p.z, -p.yaw), tone(rng, "#d8d0c2", 0.08)); break;
    case "lantern-post": {
      const m = at();
      main.bark.add(logGeo(new THREE.Vector3(0, -0.3, 0).applyMatrix4(m), new THREE.Vector3(0, 2.25, 0).applyMatrix4(m), 0.09, 0.07, 7), null, col("#cdbca5"));
      det.woodDark.add(chamferBoxGeo(0.6, 0.08, 0.08, 0.015), m.clone().multiply(M(0.26, 2.1, 0)), col(BEAM));
      const q = new THREE.Vector3(0.5, 1.72, 0).applyMatrix4(m);
      det.metal.add(cylGeo(0.12, 0.14, 0.3, 8), M(q.x, q.y, q.z), col("#3a3530"));
      det.metal.add(cylGeo(0.02, 0.12, 0.1, 8), M(q.x, q.y + 0.2, q.z), col("#3a3530"));
      det.bulb.add(new THREE.SphereGeometry(0.1, 8, 6), M(q.x, q.y - 0.01, q.z), col("#ffffff"));
      det.metal.add(logGeo(new THREE.Vector3(q.x, q.y + 0.25, q.z), new THREE.Vector3(q.x, q.y + 0.38, q.z), 0.01, 0.01, 3), null, col("#2e2c2a"));
      break;
    }
    case "sacks": {
      // (parity: fits its 1.2 × 0.72 × 0.6 m collider) two sacks side by side, one flopped on top, tied necks
      // two upright tied sacks (their shoulders = the 1.2 × 0.54 × 0.6 m collider top, the tied necks a hand over it)
      const sd = Math.floor(p.x * 13 + p.z * 7);
      for (const [x, z, yaw, lie] of [[-0.3, 0.02, 0.4, 0], [0.3, -0.03, 2.1, 0]] as Array<[number, number, number, number]>) {
        main.fabric.add(sackGeo(sd + x * 10, 0.62, 0.29), at(0).multiply(M(x, 0, z, yaw)), tone(rng, "#c4a06a", 0.06));
        det.rope.add(new THREE.TorusGeometry(0.065, 0.022, 4, 10), at(0.62 * 0.87).multiply(M(x, 0, z, 0, Math.PI / 2)), col("#8a6a3e")); void lie;
      }
      break;
    }
    case "winch": {
      // the hero machine: steel skid, yellow-painted side frames, a cable drum wound with rope between big
      // yellow flanges, a spur gear + pinion, a finned motor on its own yellow housing, a brake lever
      const m = at();
      // (the warm key + grade push yellows toward orange: the paint is authored greener / lighter so it READS banana-yellow)
      const Y = "#ffe04a", STEEL = "#7c848b", DARK = "#3d434a";
      for (const z of [-0.62, 0.62]) main.metal.add(chamferBoxGeo(2.6, 0.14, 0.2, 0.02), m.clone().multiply(M(0, 0.07, z)), col(DARK));
      for (const x of [-1.1, 0, 1.1]) main.metal.add(chamferBoxGeo(0.16, 0.1, 1.44, 0.015), m.clone().multiply(M(x, 0.16, 0)), col(DARK));
      // side frames (A-shaped: two legs + a bearing block)
      for (const z of [-0.66, 0.66]) {
        for (const sx of [-1, 1]) { const q0 = new THREE.Vector3(0.1 + sx * 0.55, 0.2, z).applyMatrix4(m), q1 = new THREE.Vector3(0.1, 1.08, z).applyMatrix4(m); const bm = beamM(q0, q1); main.plastic.add(chamferBoxGeo(bm.len, 0.16, 0.12, 0.02), bm.m, col(Y)); }
        main.plastic.add(chamferBoxGeo(0.34, 0.3, 0.16, 0.03), m.clone().multiply(M(0.1, 1.08, z)), col(Y));
      }
      // drum + flanges + wound rope (a helix) + a rope run off toward the line
      main.metal.add(cylGeo(0.42, 0.42, 1.1, 24), m.clone().multiply(M(0.1, 1.08, 0, 0, Math.PI / 2)), col(STEEL));
      for (const z of [-0.56, 0.56]) main.plastic.add(cylGeo(0.66, 0.66, 0.07, 28), m.clone().multiply(M(0.1, 1.08, z, 0, Math.PI / 2)), col(Y));
      {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 150; i++) { const t = i / 150, a2 = t * Math.PI * 2 * 12, z = -0.5 + t * 1.0; pts.push(new THREE.Vector3(0.1 + Math.cos(a2) * 0.47, 1.08 + Math.sin(a2) * 0.47, z).applyMatrix4(m)); }
        det.rope.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, 0.04, 5, false), null, col("#a9855a"));
        const r0 = new THREE.Vector3(0.1, 1.55, 0.2).applyMatrix4(m), r1 = new THREE.Vector3(2.4, 1.9, 0.3).applyMatrix4(m);
        det.rope.add(ropeGeo(sagPts(r0, r1, 0.15, 6), 0.04, 5, 2), null, col("#a9855a"));
      }
      // spur gear (toothed ring) + pinion on the motor side
      const gear = (x: number, y: number, z: number, r: number, teeth: number) => {
        main.metal.add(cylGeo(r * 0.86, r * 0.86, 0.1, 24), m.clone().multiply(M(x, y, z, 0, Math.PI / 2)), col(STEEL));
        for (let k = 0; k < teeth; k++) { const a2 = k / teeth * Math.PI * 2; det.metal.add(chamferBoxGeo(0.1, r * 0.2, 0.1, 0.01), m.clone().multiply(M(x + Math.cos(a2) * r * 0.93, y + Math.sin(a2) * r * 0.93, z, 0, 0, a2 - Math.PI / 2)), col(STEEL)); }
        main.metal.add(cylGeo(r * 0.3, r * 0.3, 0.16, 12), m.clone().multiply(M(x, y, z, 0, Math.PI / 2)), col(DARK));
      };
      gear(0.1, 1.08, 0.76, 0.58, 22); gear(-0.72, 0.62, 0.76, 0.24, 10);
      // motor housing + finned motor + a brake lever with a red knob
      main.plastic.add(chamferBoxGeo(0.8, 0.62, 0.95, 0.06), m.clone().multiply(M(-0.8, 0.52, -0.05)), col(Y));
      main.metal.add(cylGeo(0.27, 0.27, 0.62, 18), m.clone().multiply(M(-0.8, 0.62, 0.72, 0, Math.PI / 2)), col(DARK));
      for (let k = 0; k < 6; k++) det.metal.add(cylGeo(0.31, 0.31, 0.025, 18), m.clone().multiply(M(-0.8, 0.62, 0.48 + k * 0.09, 0, Math.PI / 2)), col("#4a5057"));
      { const q0 = new THREE.Vector3(-0.3, 0.3, -0.62).applyMatrix4(m), q1 = new THREE.Vector3(-0.55, 1.35, -0.62).applyMatrix4(m); det.metal.add(logGeo(q0, q1, 0.03, 0.025, 6), null, col(DARK)); det.plastic.add(new THREE.SphereGeometry(0.07, 10, 8), M(q1.x, q1.y, q1.z), col("#d8342c")); }
      // hazard stripes on the housing front
      for (let k = 0; k < 4; k++) det.plastic.add(chamferBoxGeo(0.06, 0.5, 0.02, 0.005), m.clone().multiply(M(-1.21, 0.52, -0.38 + k * 0.22, 0, 0, 0.5)), col("#222"));
      break;
    }
    case "table": {
      main.wood.add(chamferBoxGeo(1.8 * s, 0.07, 1.1 * s, 0.02), at(0.78), tone(rng, PLANK, 0.08));
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) det.woodDark.add(chamferBoxGeo(0.08, 0.76, 0.08, 0.01), at(0.38).multiply(M(u * 0.8 * s, 0, v * 0.47 * s)), col(BEAM));
      det.bulb.add(new THREE.SphereGeometry(0.06, 8, 6), at(0.9).multiply(M(0.3, 0, 0.1)), col("#ffffff"));
      det.metal.add(cylGeo(0.07, 0.09, 0.2, 8), at(0.9).multiply(M(0.3, 0, 0.1)), col("#3a3530"));
      det.fabric.add(chamferBoxGeo(0.5, 0.01, 0.36, 0.004), at(0.822).multiply(M(-0.3, 0, -0.1, 0.3)), col("#e6dcc0"));
      break;
    }
    case "chair": main.wood.add(chamferBoxGeo(0.45, 0.05, 0.45, 0.01), at(0.45), tone(rng, PLANK, 0.1)); for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) det.woodDark.box(0.05, 0.45, 0.05, at(0.22).multiply(M(u * 0.19, 0, v * 0.19)), col(BEAM)); det.wood.box(0.45, 0.45, 0.05, at(0.7).multiply(M(0, 0, -0.2)), tone(rng, PLANK, 0.1)); break;
    case "bench": main.wood.add(chamferBoxGeo(1.6, 0.07, 0.4, 0.015), at(0.44), tone(rng, PLANK, 0.1)); for (const u of [-1, 1]) det.woodDark.box(0.08, 0.42, 0.36, at(0.21).multiply(M(u * 0.65, 0, 0)), col(BEAM)); break;
    case "shelf": {
      for (const u of [-1, 1]) main.woodDark.box(0.06, 1.8, 0.4, at(0.9).multiply(M(u * 0.67, 0, 0)), col(BEAM));
      for (const y of [0.1, 0.65, 1.2, 1.75]) main.wood.box(1.36, 0.04, 0.4, at(y), tone(rng, PLANK, 0.08));
      for (const y of [0.12, 0.67, 1.22]) for (let k = 0; k < 4; k++) { if (rng() < 0.3) continue; const c = ["#c24a2e", "#e8c64b", "#4f8a5b", "#d9d0b8"][Math.floor(rng() * 4)]; det.plastic.add(cylGeo(0.07, 0.08, 0.22, 8), at(y + 0.13).multiply(M(-0.5 + k * 0.33, 0, 0)), col(c)); }
      break;
    }
    case "bunk": {
      main.wood.add(chamferBoxGeo(2.0, 0.12, 0.9, 0.02), at(0.4), tone(rng, PLANK, 0.08));
      det.fabric.add(chamferBoxGeo(1.9, 0.16, 0.82, 0.05), at(0.54), col("#e6dcc4"));
      det.fabric.add(chamferBoxGeo(1.2, 0.05, 0.86, 0.02), at(0.63).multiply(M(0.35, 0, 0, 0.03)), col(rng() < 0.5 ? "#c0503a" : "#3f7d8a"));
      det.fabric.add(new THREE.SphereGeometry(0.2, 8, 6), at(0.66).multiply(M(-0.72, 0, 0, 0, 0, 0, 1.2, 0.45, 1.6)), col("#f1ead8"));
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) det.woodDark.box(0.09, 1.1, 0.09, at(0.55).multiply(M(u * 0.95, 0, v * 0.4)), col(BEAM));
      break;
    }
    case "firepit": {
      // ring of chiselled fieldstones (small rockBlockGeo blocks, the same stone as the boulders)
      for (let k = 0; k < 11; k++) { const a = k / 11 * TAU, sx = 0.17 + 0.05 * Math.sin(k * 2.3), stone: Prop = { ...p, kind: "rock", x: p.x + Math.cos(a) * 0.72, z: p.z + Math.sin(a) * 0.72 + k * 1e-3, hx: sx, hy: 0.13 + 0.03 * Math.cos(k * 1.7), hz: 0.15, yaw: a };
        det.rock.add(rockBlockGeo(stone, 0.35), M(stone.x, p.y - 0.04, stone.z, -a), col("#b8b0a2")); }
      // a teepee of CHARRED logs (black, glowing ember ends), a bed of grey ash + glowing
      // embers, a cooking pot hung from a lashed tripod
      det.rock.add(cylGeo(0.6, 0.66, 0.06, 14), M(p.x, p.y + 0.02, p.z), col("#5a5650"));
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU + 0.4, f = V(p.x + Math.cos(a) * 0.58, p.y + 0.06, p.z + Math.sin(a) * 0.58), t = V(p.x - Math.cos(a) * 0.05, p.y + 0.62, p.z - Math.sin(a) * 0.05);
        det.bark.add(logGeo(f, t, 0.075, 0.05, 7), null, col("#3a2f28"));
        det.bulb.add(cylGeo(0.05, 0.05, 0.05, 6), M(t.x, t.y - 0.06, t.z), col("#ff8a2a"));   // the burning tips at the apex
      }
      for (let k = 0; k < 14; k++) { const a = rng() * TAU, r = rng() * 0.42; det.bulb.add(new THREE.SphereGeometry(0.035 + rng() * 0.04, 6, 4), M(p.x + Math.cos(a) * r, p.y + 0.05, p.z + Math.sin(a) * r, 0, 0, 0, 1, 0.55, 1), col(rng() < 0.5 ? "#ff6a1a" : "#ffb03a")); }
      det.bulb.add(new THREE.SphereGeometry(0.2, 8, 6), M(p.x, p.y + 0.16, p.z, 0, 0, 0, 1.1, 0.9, 1.1), col("#ffb84a"));
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.2; det.rope.add(logGeo(V(p.x + Math.cos(a) * 0.95, p.y, p.z + Math.sin(a) * 0.95), V(p.x, p.y + 1.45, p.z), 0.03, 0.025, 5), null, col("#6a5038")); }
      det.rope.add(logGeo(V(p.x, p.y + 1.42, p.z), V(p.x, p.y + 0.95, p.z), 0.008, 0.008, 3), null, col("#2e2c2a"));
      det.metal.add(latheGeo([[0, 0], [0.16, 0.01], [0.21, 0.08], [0.22, 0.18], [0.2, 0.26], [0, 0.26]], 12), M(p.x, p.y + 0.66, p.z), col("#2e2c2a"));
      break;
    }
    case "tent": {
      // a real A-frame tent: sagging canvas slopes with folds + a rolled-up door flap, closed back gable, ridge pole
      // on two uprights, guy ropes to pegs, a ground sheet (the collider is a 4-step A-frame inside the canvas)
      const m = at(), H = p.hy * 2, HW = p.hz, HL = p.hx;
      const pal: Array<[number, number, number]> = [[0.28, 0.6, 0.58], [0.93, 0.52, 0.2], [0.98, 0.8, 0.24]], acc = pal[Math.floor(rng() * pal.length)];
      const canvas = new THREE.Color(acc[0], acc[1], acc[2]).getStyle(), trim = "#9b5b34";
      main.fabric.add(tentGeo(HL, HW, H, rng, acc), m, col("#ffffff"));
      // back gable (closed) + front gable flaps tied open
      main.fabric.add(triGeo([-HL, 0, -HW], [-HL, 0, HW], [-HL, H, 0]), m, col(canvas, 0.86));
      for (const sd of [-1, 1]) det.fabric.add(triGeo([HL, 0, sd * HW], [HL, 0, sd * HW * 0.35], [HL, H * 0.98, 0]), m, col(canvas, 0.92));
      det.fabric.add(logGeo(new THREE.Vector3(HL + 0.02, H * 0.55, -HW * 0.62).applyMatrix4(m), new THREE.Vector3(HL + 0.02, H * 0.55, HW * 0.62).applyMatrix4(m), 0.07, 0.07, 6), null, col(canvas, 0.8));
      main.fabric.add(chamferBoxGeo(HL * 2 + 0.3, 0.03, HW * 2 + 0.3, 0.01), m.clone().multiply(M(0, 0.02, 0)), col(trim));
      const poleA = new THREE.Vector3(-HL - 0.06, 0, 0), poleB = new THREE.Vector3(HL + 0.06, 0, 0);
      for (const q of [poleA, poleB]) det.woodDark.add(logGeo(q.clone().applyMatrix4(m), q.clone().setY(H + 0.18).applyMatrix4(m), 0.035, 0.03, 5), null, col(BEAM));
      det.woodDark.add(logGeo(poleA.clone().setY(H + 0.02).applyMatrix4(m), poleB.clone().setY(H + 0.02).applyMatrix4(m), 0.035, 0.035, 5), null, col(BEAM));
      for (const [x, z] of [[-HL - 0.06, 0], [HL + 0.06, 0]] as Array<[number, number]>) for (const sd of [-1, 1]) {
        const top = new THREE.Vector3(x, H + 0.12, z).applyMatrix4(m), peg = new THREE.Vector3(x + Math.sign(x) * 1.1, 0.02, sd * 0.9).applyMatrix4(m);
        det.rope.add(logGeo(top, peg, 0.012, 0.012, 3), null, col(ROPE));
        det.woodDark.add(logGeo(peg.clone().add(new THREE.Vector3(0, -0.12, 0)), peg.clone().add(new THREE.Vector3(0, 0.12, 0)), 0.025, 0.02, 4), null, col(BEAM));
      }
      for (const sd of [-1, 1]) for (const u of [-0.7, 0.7]) {
        const eave = new THREE.Vector3(u * HL, 0.25, sd * HW * 0.9).applyMatrix4(m), peg = new THREE.Vector3(u * HL, 0.02, sd * (HW + 0.5)).applyMatrix4(m);
        det.rope.add(logGeo(eave, peg, 0.01, 0.01, 3), null, col(ROPE));
      }
      break;
    }
    case "rope-coil": for (let k = 0; k < 4; k++) det.rope.add(new THREE.TorusGeometry(0.34 - k * 0.02, 0.04, 5, 16), at(0.04 + k * 0.07).multiply(M(0, 0, 0, 0, Math.PI / 2)), col(ROPE)); break;
    default: break;
  }
}
void Math.floor(STAIR.rise); void ZIP_POLE; void trunkR; void mulberry;
