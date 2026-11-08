// THE PLANTATION packing house visuals (barn-local frame from shared/pois/the-plantation.ts): a tall red board-and-
// batten barn whose steep gable faces the yard (loft window, big door, loading hatch), a long saltbox lean-to under a
// clerestory strip on its left, blue-grey corrugated roofs with tan rake boards + ridge caps, a two-level porch (dock
// + weathered shed roof, upper loading deck with railing, crates and its own little roof), the inclined truss conveyor
// carrying green bunches up onto the deck, BANANA CO. bins full of green bananas, interior packing line.
import * as THREE from "three";
import * as S from "../../../../../shared/pois/the-plantation";
import { rng } from "../../../../../shared/pois/coast-kit";
import { Batch, M, box, rbox, cyl, sph, addPieces, frameGeo, lightPoolMat } from "../_kit/coast-kit";
import * as P from "../_kit/coast-props";
import { openStair } from "../peel-strip/coast-dress";
import { textDecal } from "../_kit/coast-sign";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
// barn red ≈ #b8322a on the board-and-batten texture (mean #97352b → ×1.22), white trims, blue-grey roofs
const RED = new THREE.Color(1.1, 0.9, 0.86), ROOF = 0xb2cdef, TAN = 0xf1ebdf, TAN_D = 0xd6ccba, POST = 0xc6a078;

/** flat polygon wall (XY outline, extruded t along Z, centred on z) with rectangular holes [x0,y0,x1,y1] */
function polyWall(b: Batch, pts: Array<[number, number]>, t: number, m: THREE.Matrix4, holes: Array<[number, number, number, number]> = [], key: "gBarn" | "gPlanks" = "gBarn", color: THREE.ColorRepresentation = RED, inner = 0) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  s.closePath();
  for (const [x0, y0, x1, y1] of holes) { const h = new THREE.Path(); h.moveTo(x0, y0); h.lineTo(x0, y1); h.lineTo(x1, y1); h.lineTo(x1, y0); h.closePath(); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }); g.translate(0, 0, -t / 2);
  if (inner) {
    // the face whose normal is local z = `inner` looks into the building: raw timber planks there
    const [gi, go] = splitByFacing(g, (_c, nn) => nn.z * inner > 0.5);
    if (gi) b.add(gi, "gPlanks", { m, uv: "box", tile: 3.2, uvRot: true, color: TIMBER_IN });
    if (go) b.add(go, key, { m, uv: "box", tile: 3.2, color });
    return;
  }
  b.add(g, key, { m, uv: "box", tile: 3.2, color });
}

/** interior-facing wall faces are raw grey-brown timber planks (not saturated red): the
 *  wall box is split per triangle — faces looking into the building (toward `inside(p)`) go to the plank material,
 *  the rest keep the barn-red boards */
const TIMBER_IN = 0xe2c7a2;
function splitByFacing(g0: THREE.BufferGeometry, isIn: (c: THREE.Vector3, n: THREE.Vector3) => boolean) {
  const g = g0.index ? g0.toNonIndexed() : g0;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, A: number[] = [], B: number[] = [];
  const c = new THREE.Vector3(), v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(p, i + k)); c.multiplyScalar(1 / 3);
    nn.fromBufferAttribute(n, i);
    (isIn(c, nn) ? A : B).push(i, i + 1, i + 2);
  }
  const mk = (ix: number[]) => { if (!ix.length) return null; const q = g.clone(); q.setIndex(ix); return q; };
  return [mk(A), mk(B)] as const;
}
function twoToneBox(b: Batch, w: number, h: number, d: number, m: THREE.Matrix4, inside: (p: THREE.Vector3) => THREE.Vector3, outer: THREE.Color) {
  const g = box(w, h, d, Math.max(1, Math.round(h / 1.2)));
  g.applyMatrix4(m);
  const [gi, go] = splitByFacing(g, (c, nn) => Math.abs(nn.y) < 0.5 && nn.dot(inside(c.clone()).sub(c)) > 0);
  if (gi) b.add(gi, "gPlanks", { uv: "box", tile: 3.2, uvRot: true, color: TIMBER_IN, aoY: 0.2, aoRange: 2.2, aoMin: 0.7 });
  // (splash grime up the base of the boards)
  if (go) b.add(go, "gBarn", { uv: "box", tile: 3.2, color: outer, aoY: 0.2, aoRange: 2.2, aoMin: 0.7, mud: { y0: 0.2, h: 1.6, k: 0.5 } });
}

/** corrugated slab + purlin underlay; `m` places the slab centre, local X along the eave, local Z down the slope */
function roofSlab(b: Batch, m: THREE.Matrix4, w: number, len: number, color = ROOF, key: "gCorrRoof" | "gCorr" = "gCorrRoof") {
  // corrugation ridges run DOWN the slope (texture v along local z; along the eave they read as shingle
  // courses); raw-timber sarking underneath with rafters every 1.2 m (not a pitch-black ceiling inside)
  b.add(box(w, 0.1, len), key, { m, uv: "local", tile: 2.2, color });
  // chunky standing ribs every 0.9 m down the slope (big corrugations: they catch the sun + cast thin
  // shadow lines, readable from 50 m where the texture's fine ridges blur) + a per-sheet tint so the courses read
  const rc = new THREE.Color(color as THREE.ColorRepresentation);
  for (let x = -w / 2 + 0.45, i = 0; x < w / 2 - 0.2; x += 0.9, i++) {
    b.add(box(0.1, 0.07, len), key, { m: mul(m, M(x, 0.07, 0)), uv: "local", tile: 2.2, color: rc.clone().multiplyScalar(i % 5 === 2 ? 0.9 : i % 7 === 4 ? 1.08 : 1.02) });
  }
  b.add(box(w - 0.1, 0.06, len - 0.1), "gPlanks", { m: mul(m, M(0, -0.09, 0)), uv: "local", tile: 3, color: 0xe8c9a0 });
  for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 1.2) b.add(box(0.12, 0.2, len - 0.2), "wood", { m: mul(m, M(x, -0.22, 0)), tile: 1.5, color: 0xc49a6c, lod: 2 });
}

/** sliding barn door: red boards, tan frame + Z brace, hung on a black rail (local: bottom-centre, face +Z) */
function barnDoor(b: Batch, m: THREE.Matrix4, w: number, h: number) {
  b.add(box(w, h, 0.1), "gBarn", { m: mul(m, M(0, h / 2, 0)), uv: "box", tile: 3.2, color: new THREE.Color(1.12, 0.9, 0.88) });
  const f = 0.18;
  for (const [x, y, ww, hh] of [[0, f / 2, w, f], [0, h - f / 2, w, f], [-w / 2 + f / 2, h / 2, f, h], [w / 2 - f / 2, h / 2, f, h], [0, h / 2, w, f]]) b.add(rbox(ww, hh, 0.07, 0.015), "wood", { m: mul(m, M(x, y, 0.08)), color: TAN });
  const d = Math.hypot(w - 2 * f, h / 2 - 1.5 * f), a = Math.atan2(h / 2 - 1.5 * f, w - 2 * f);
  for (const cy of [h * 0.25, h * 0.75]) b.add(rbox(d, f * 0.85, 0.06, 0.015), "wood", { m: mul(m, M(0, cy, 0.085, 0, 0, a)), color: TAN });
  b.add(box(w * 2 + 0.4, 0.12, 0.12), "pmetal", { m: mul(m, M(-w / 2, h + 0.15, 0.02)), color: 0x2e2a26 });
  for (const x of [-w / 3, w / 3]) b.add(cyl(0.08, 0.08, 0.06, 8).rotateX(Math.PI / 2), "steel", { m: mul(m, M(x, h + 0.12, 0.1)), uv: "local", color: 0x333333 });
  b.add(rbox(0.05, 0.45, 0.06, 0.02), "steel", { m: mul(m, M(w / 2 - 0.35, h * 0.45, 0.14)), color: 0x2a2a2a });
}

function crateStack(b: Batch, x0: number, z0: number, x1: number, z1: number, h: number, y: number, seed: number) {
  const r = rng(seed);
  // big field bins (1.8 x 0.9 x 1.1) stamped BANANA CO., heaped with green hands; pallets under the yard stacks
  // bins never overlap (2 bins in 2.8 m half-hide every stencil: 'BANANA C' / 'ANANA CO.')
  // the bins FILL the shared collider box (whole 1.8 × 1.15 bins inside it would leave up to 0.4 m of invisible
  // wall on each side of every stack)
  const nx = Math.max(1, Math.round((x1 - x0) / 1.8)), nz = Math.max(1, Math.round((z1 - z0) / 1.15)), layers = Math.max(1, Math.round(h / 0.85));
  const L = (x1 - x0 - 0.1 * (nx - 1)) / nx, W = (z1 - z0 - 0.1 * (nz - 1)) / nz, H = (h - (y === 0 ? 0.14 : 0)) / layers / 1.02;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const cx = mx + (i - (nx - 1) / 2) * (L + 0.1), cz = mz + (j - (nz - 1) / 2) * (W + 0.1), yaw = (r() - 0.5) * 0.06;
    if (y === 0) P.pallet(b, mul(M(cx, y, cz, 0, yaw, 0), M(0, 0, 0, 0, 0, 0, 1.5, 1, 1.4)));
    for (let k = 0; k < layers; k++) {
      const top = k === layers - 1;
      P.crate(b, mul(M(cx, y + (y === 0 ? 0.14 : 0) + k * H * 1.02, cz, 0, yaw + (r() - 0.5) * 0.05, 0), M(0, 0, 0, 0, 0, 0, L / 1.2, H / 0.8, W / 0.8)), { full: top, seed: seed * 13 + i * 5 + j * 3 + k, lid: !top });
    }
  }
}

/** `bIn` = the interior (packing line): its own distance group, drawn only within ~30 m of the house */
export function buildBarn(b: Batch, bMid: Batch, bNear: Batch, glows: THREE.Vector3[], bIn: Batch = bNear) {
  const B = S.BARN, f = B.frame, { t, len } = B, Mn = B.main, Ln = B.lean, zb = -len, hw = (Mn.x1 - Mn.x0) / 2;
  const rise = S.barnRise(), ridgeY = Mn.eave + rise;
  b.setFrame(f.x, f.y, f.z, f.yaw); bMid.setFrame(f.x, f.y, f.z, f.yaw); bNear.setFrame(f.x, f.y, f.z, f.yaw); bIn.setFrame(f.x, f.y, f.z, f.yaw);
  addPieces(b, S.BARN_LOCAL, {
    "bn:floor": { mat: "gConcrete", color: 0x9f9a92, tile: 6 },
    "bn:wall": { mat: "gBarn", skip: true }, "bn:clere": { mat: "gBarn", skip: true },
    "bn:loft": { mat: "deck", color: 0xb48a60, tile: 2.2 },
    "bn:step": { mat: "deck", skip: true }, // open treads (openStair) — solid blocks are a walk-through wedge
    "bn:dock": { mat: "deck", color: 0xa47e56, tile: 2.2 },
    "bn:dstep": { mat: "deck", color: 0x9c7852, tile: 1.4, round: 0.02 },
    "bn:deck": { mat: "deck", color: 0xaa8358, tile: 2.2 },
    "bn:post": { mat: "wood", color: POST, tile: 1.5, round: 0.03 },
    "bn:roofM": { mat: "gCorrPaint", skip: true }, "bn:roofL": { mat: "gCorrPaint", skip: true }, "bn:shed": { mat: "gCorr", skip: true },
    "bn:gable": { mat: "gBarn", skip: true }, "bn:leanEnd": { mat: "gBarn", skip: true }, "bn:conv": { mat: "pmetal", skip: true },
    // the boarded lean-to ceiling + the planked knee wall under the clerestory (the void above is sealed solid)
    "bn:leanCeil": { mat: "gPlanksH", color: 0xc4a47c, tile: 2.2, uvRot: true }, "bn:leanKnee": { mat: "gPlanksH", color: 0xb08c64, tile: 2.2 },
    "bn:table": { mat: "wood", skip: true }, "bn:rstep": { mat: "pmetal", skip: true }, "bn:rland": { mat: "pmetal", skip: true }, "bn:bins": { mat: "wood", skip: true }, crates: { mat: "wood", skip: true }, rail: { mat: "wood", skip: true },
  }, 0.2);
  openStair(b, S.BARN_LOCAL, "bn:step", { color: 0xa88058 });
  // the porch / deck posts are collider pieces — drawn here at exactly their boxes
  for (const p of S.BARN_LOCAL) if (p.k === "bn:post" && p.col) b.add(rbox(p.h[0] * 2, p.h[1] * 2, p.h[2] * 2, 0.03), "wood", { m: M(p.c[0], p.c[1], p.c[2], 0, p.yaw ?? 0, 0), tile: 1.5, color: POST });
  // walls: red outside, raw timber inside (the interior centre: main block x 0 / lean-to x −11, z −13)
  const inPt = (q: THREE.Vector3) => new THREE.Vector3(q.x > Mn.x0 - 0.2 ? 0 : (Ln.x0 + Mn.x0) / 2, q.y, -len / 2);
  for (const pc of S.BARN_LOCAL) {
    if (pc.col || (pc.k !== "bn:wall" && pc.k !== "bn:clere")) continue;
    twoToneBox(b, pc.h[0] * 2, pc.h[1] * 2, pc.h[2] * 2, M(pc.c[0], pc.c[1], pc.c[2], pc.pitch ?? 0, pc.yaw ?? 0, 0), inPt, pc.k === "bn:clere" ? new THREE.Color(1.1, 0.86, 0.83) : RED);
  }
  // ---- gables: front (loft window hole) + back, as true triangles in the Z-facing planes
  const W2 = B.loftWin;
  polyWall(b, [[-hw, Mn.eave], [hw, Mn.eave], [0, ridgeY]], t, M(0, 0, -t / 2), [[-W2.w / 2, W2.y0, W2.w / 2, W2.y0 + W2.h]], "gBarn", RED, -1);
  polyWall(b, [[-hw, Mn.eave], [hw, Mn.eave], [0, ridgeY]], t, M(0, 0, zb + t / 2), [], "gBarn", RED, 1);
  // lean-to end walls (trapezoids) — front with a door
  const leanPts: Array<[number, number]> = [[Ln.x0, 0.2], [Mn.x0, 0.2], [Mn.x0, Ln.hi], [Ln.x0, Ln.lo]];
  polyWall(b, leanPts, t, M(0, 0, -t / 2), [[-13.3, 0.2, -10.3, 3.2]], "gBarn", RED, -1);
  polyWall(b, leanPts, t, M(0, 0, zb + t / 2), [], "gBarn", RED, 1);
  // ---- roofs: main (two slopes, ridge along Z) + lean-to single slope, rake boards, ridge cap, fascia
  const run = hw + Mn.over, slopeL = run / Math.cos(Mn.pitch) + 0.05, cy = Mn.eave + (hw - run / 2) * Math.tan(Mn.pitch);
  for (const s of [-1, 1]) {
    const rm = M(s * run / 2, cy + 0.2, zb / 2, 0, 0, -s * Mn.pitch);
    roofSlab(b, mul(rm, M(0, 0, 0, 0, Math.PI / 2, 0)), len + 1.0, slopeL);
    // eave fascia board
    b.add(rbox(0.1, 0.3, len + 1.1, 0.02), "wood", { m: mul(rm, M(s * slopeL / 2, -0.08, 0)), color: TAN_D });
    // rake boards front + back
    for (const e of [0.55, zb - 0.55]) b.add(rbox(slopeL + 0.1, 0.34, 0.14, 0.03), "wood", { m: mul(rm, M(0, -0.04, e - zb / 2)), color: TAN });
  }
  { const ridge = cyl(0.17, 0.17, len + 1.2, 8); ridge.rotateX(Math.PI / 2); b.add(ridge, "gCorrRoof", { m: M(0, ridgeY + 0.32, zb / 2), uv: "local", tile: 2, color: 0x8a9db0 }); }
  {
    const runL = Mn.x0 - Ln.x0 + Ln.over, dy = (Ln.hi - Ln.lo) * runL / (Mn.x0 - Ln.x0), ang = Math.atan2(dy, runL), L = Math.hypot(runL, dy);
    const rm = M(Mn.x0 - runL / 2, Ln.hi - dy / 2 + 0.2, zb / 2, 0, 0, ang);
    roofSlab(b, mul(rm, M(0, 0, 0, 0, Math.PI / 2, 0)), len + 1.0, L);
    b.add(rbox(0.1, 0.28, len + 1.1, 0.02), "wood", { m: mul(rm, M(-L / 2, -0.08, 0)), color: TAN_D });
    for (const e of [0.5, zb - 0.5]) b.add(rbox(L + 0.1, 0.3, 0.14, 0.03), "wood", { m: mul(rm, M(0, -0.04, e - zb / 2)), color: TAN });
    // flashing where the lean-to meets the clerestory
    b.add(box(0.5, 0.06, len + 0.8), "pmetal", { m: M(Mn.x0 - 0.2, Ln.hi + 0.28, zb / 2), color: 0x7d8e9e });
  }
  // clerestory band: window strip in the main left wall between the lean-to roof and the eave
  for (let z = -2.2; z > zb + 1.5; z -= 3.3) {
    b.add(box(0.06, 1.0, 2.2), "darkGlass", { m: M(Mn.x0 - t / 2 - 0.02, Ln.hi + 0.85, z) });
    b.add(frameGeo(2.2, 1.0, 0.1, 0.14, false), "wood", { m: M(Mn.x0 - t / 2 - 0.03, Ln.hi + 0.35, z, 0, -Math.PI / 2, 0), uv: "local", tile: 1, color: TAN });
  }
  // clerestory overhang: a narrow shed roof on brackets along the main block's left wall, between the lean-to roof
  // and the main eave (a long upper strip)
  {
    const y = Ln.hi + 1.62, out = 1.25, ang2 = 0.22;
    b.add(box(out + 0.2, 0.08, len + 0.6), "gCorrRoof", { m: M(Mn.x0 - t / 2 - out / 2, y, zb / 2, 0, 0, ang2), uv: "local", tile: 2.2, uvRot: true, color: ROOF });
    b.add(rbox(0.1, 0.22, len + 0.7, 0.02), "wood", { m: M(Mn.x0 - t / 2 - out - 0.05, y - Math.sin(ang2) * out / 2 - 0.08, zb / 2), color: TAN });
    for (let z = -1.5; z > zb + 0.5; z -= 3.2) P.strut(b, [Mn.x0 - t / 2, y - 0.9, z], [Mn.x0 - t / 2 - out + 0.2, y - 0.15, z], 0.05, POST, new THREE.Matrix4(), "wood");
  }
  // corner boards (white) on the main block + lean-to, base skirt
  for (const [x, z, h] of [[Mn.x1, 0, Mn.eave], [Mn.x1, zb, Mn.eave], [Mn.x0, 0, Mn.eave], [Mn.x0, zb, Mn.eave], [Ln.x0, 0, Ln.lo], [Ln.x0, zb, Ln.lo]] as Array<[number, number, number]>) {
    b.add(rbox(0.28, h, 0.28, 0.03), "wood", { m: M(x + (x > 0 ? -0.1 : 0.1), h / 2, z + (z < -1 ? 0.1 : -0.1)), color: TAN });
  }
  for (const [x0, x1, z] of [[Ln.x0, Mn.x1, 0.03], [Ln.x0, Mn.x1, zb - 0.03]] as Array<[number, number, number]>) b.add(box(x1 - x0, 0.4, 0.06), "gConcrete", { m: M((x0 + x1) / 2, 0.4, z), tile: 3, color: 0x8a7a6a });
  // ---- front openings: big door (leaf parked open), loading hatch, loft door, loft window + hoist beam
  const D0 = B.door;
  b.add(frameGeo(D0.w, D0.h, 0.2, 0.42, false), "wood", { m: M(D0.x, 0.2, 0), uv: "local", tile: 1, color: TAN });
  barnDoor(b, M(D0.x + D0.w + 0.15, 0.2, 0.2), D0.w, D0.h);
  const H0 = B.hatch;
  b.add(frameGeo(H0.w, H0.h, 0.16, 0.42, false), "wood", { m: M(H0.x, H0.y0, 0), uv: "local", tile: 1, color: TAN });
  const LD = B.loftDoor;
  b.add(frameGeo(LD.w, LD.h, 0.14, 0.42, false), "wood", { m: M(LD.x, B.loft, 0), uv: "local", tile: 1, color: TAN });
  b.add(rbox(LD.w - 0.05, LD.h - 0.05, 0.07, 0.02), "gBarn", { m: M(LD.x + LD.w / 2 + 0.15, B.loft + LD.h / 2, 0.55, 0, 1.25, 0), uv: "box", tile: 3.2, color: 0xe8e0dc });
  b.add(frameGeo(W2.w, W2.h, 0.17, 0.4, false), "wood", { m: M(0, W2.y0, 0), uv: "local", tile: 1, color: TAN });
  b.add(box(W2.w, W2.h, 0.05), "glass", { m: M(0, W2.y0 + W2.h / 2, -0.25), shadow: false });
  b.add(rbox(0.3, 0.3, 2.2, 0.03), "wood", { m: M(0, ridgeY - 0.9, 0.9), color: TAN_D });
  b.add(cyl(0.012, 0.012, 3.0, 4), "steel", { m: M(0, ridgeY - 2.5, 1.85), color: 0x333333 });
  b.add(new THREE.TorusGeometry(0.1, 0.025, 5, 10), "steel", { m: M(0, ridgeY - 1.05, 1.85, 0, 0, 0), uv: "local", color: 0x333333 });
  // side windows (right wall, lean-to outer wall) + back door, with tan frames
  for (const [u, y0, w, h] of [[10.6, 1.2, 1.4, 1.4], [16.2, 1.2, 1.4, 1.4], [9, B.loft + 1.0, 1.4, 1.4], [17, B.loft + 1.0, 1.4, 1.4], [13, 0.2, 2.4, 3.0]] as Array<[number, number, number, number]>) {
    b.add(frameGeo(w, h, 0.12, 0.36, false), "wood", { m: M(Mn.x1, y0, -u, 0, Math.PI / 2, 0), uv: "local", tile: 1, color: TAN });
    if (h < 2) b.add(box(0.05, h, w), "glass", { m: M(Mn.x1 - 0.12, y0 + h / 2, -u), shadow: false });
  }
  for (const [u, y0, w, h] of [[4.5, 1.2, 1.6, 1.3], [16, 1.2, 1.6, 1.3], [22, 1.2, 1.6, 1.3], [10, 0.2, 3.4, 3.4]] as Array<[number, number, number, number]>) {
    b.add(frameGeo(w, h, 0.12, 0.36, false), "wood", { m: M(Ln.x0, y0, -u, 0, -Math.PI / 2, 0), uv: "local", tile: 1, color: TAN });
    if (h < 2) b.add(box(0.05, h, w), "glass", { m: M(Ln.x0 + 0.12, y0 + h / 2, -u), shadow: false });
  }
  b.add(frameGeo(3.0, 3.0, 0.16, 0.4, false), "wood", { m: M(-11.8, 0.2, 0), uv: "local", tile: 1, color: TAN });
  // ---- porch: railings, post braces, deck roof (right), lower shed roof (weathered), fascia
  const Dk = B.deck, Sh = B.shed, C = B.conv;
  P.railing(b, C.x1 + 1.3, Dk.z1 - 0.08, Dk.x1 - 0.08, Dk.z1 - 0.08, B.loft, { h: 1.05, spacing: 1.6, mat: "wood", color: TAN, thick: 0.08, bars: 2 });
  P.railing(b, Dk.x1 - 0.08, 0.1, Dk.x1 - 0.08, Dk.z1 - 0.08, B.loft, { h: 1.05, spacing: 1.6, mat: "wood", color: TAN, thick: 0.08, bars: 2 });
  P.railing(b, Dk.x0 + 0.08, 0.1, Dk.x0 + 0.08, C.z - C.w / 2 - 0.05, B.loft, { h: 1.05, spacing: 1.6, mat: "wood", color: TAN, thick: 0.08, bars: 2 });
  b.add(box(Dk.x1 - Dk.x0, 0.32, 0.12), "wood", { m: M((Dk.x0 + Dk.x1) / 2, B.loft - 0.36, Dk.z1 - 0.06), color: TAN_D });
  for (const x of [Dk.x0 + 0.2, -1.2, 2.6, Dk.x1 - 0.2]) for (const s of [-1, 1]) P.strut(b, [x, B.loft - 1.3, Dk.z1 - 0.2], [x + s * 0.9, B.loft - 0.3, Dk.z1 - 0.2], 0.06, POST, new THREE.Matrix4(), "wood");
  // upper deck roof over the right half (on tall posts), weathered corrugated
  {
    const x0 = 0.6, x1 = Dk.x1 + 0.2, z1 = Dk.z1 + 0.4, y0 = 8.25, y1 = 7.75, ang = Math.atan2(y0 - y1, z1);
    b.add(box(x1 - x0, 0.08, Math.hypot(z1, y0 - y1)), "gCorrRoof", { m: M((x0 + x1) / 2, (y0 + y1) / 2, z1 / 2, ang, 0, 0), uv: "local", tile: 2.4, color: 0xd8cbb8 });
    b.add(rbox(x1 - x0, 0.22, 0.1, 0.02), "wood", { m: M((x0 + x1) / 2, y1 - 0.12, z1 - 0.05), color: TAN });
    for (const x of [x0 + 0.2, (x0 + x1) / 2, x1 - 0.2]) b.add(rbox(0.16, y1 - B.loft, 0.16, 0.03), "wood", { m: M(x, (y1 + B.loft) / 2, Dk.z1 - 0.2), color: POST });
  }
  {
    const runS = Sh.z1 - Sh.z0, ang = Math.atan2(Sh.y0 - Sh.y1, runS), L = Math.hypot(runS, Sh.y0 - Sh.y1);
    b.add(box(Sh.x1 - Sh.x0 + 0.4, 0.08, L + 0.3), "gCorrRoof", { m: M((Sh.x0 + Sh.x1) / 2, (Sh.y0 + Sh.y1) / 2 + 0.1, (Sh.z0 + Sh.z1) / 2 + 0.1, ang, 0, 0), uv: "local", tile: 2.4, color: 0xe0cdb4 });
    b.add(rbox(Sh.x1 - Sh.x0 + 0.4, 0.22, 0.1, 0.02), "wood", { m: M((Sh.x0 + Sh.x1) / 2, Sh.y1 - 0.05, Sh.z1 + 0.2), color: TAN });
    b.add(box(Sh.x1 - Sh.x0, 0.2, 0.14), "wood", { m: M((Sh.x0 + Sh.x1) / 2, Sh.y1 - 0.25, Sh.z1 - 0.23), color: TAN_D });
    for (const x of [Sh.x0 + 0.2, 1.4, Sh.x1 - 0.2]) P.strut(b, [x, Sh.y1 - 1.0, Sh.z1 - 0.23], [x + (x < 0 ? 0.8 : -0.8), Sh.y1 - 0.3, Sh.z1 - 0.23], 0.05, POST, new THREE.Matrix4(), "wood");
  }
  // crates on the upper deck + dock, sacks, a hand truck
  for (const [x, z, n] of [[-2.9, 1.2, 2], [-0.9, 1.4, 1], [1.3, 1.1, 1], [4.2, 1.3, 2], [5.5, 2.3, 1]] as Array<[number, number, number]>) {
    for (let k = 0; k < n; k++) P.crate(bMid, M(x, B.loft + k * 0.82, z, 0, (x * 0.37) % 0.3, 0), { full: k === n - 1, seed: Math.round(x * 10) + k, lid: k < n - 1 });
  }
  P.sack(bNear, M(3.4, B.dock.y, 4.6, 0, 0.4, 0)); P.sack(bNear, M(3.9, B.dock.y, 4.9, 0, 1.1, 0), 0xc2ad86);
  // ---- the conveyor: truss side frames, braces, rollers, belt with cleats, A-frame legs, motor, green bunches
  const L = C.x1 - C.x0, cRise = C.y1 - C.y0, ang = Math.atan2(cRise, L), lenC = Math.hypot(L, cRise);
  const cm = M((C.x0 + C.x1) / 2, (C.y0 + C.y1) / 2, C.z, 0, 0, ang);
  const GREY = 0x75726a;
  for (const s of [-1, 1]) {
    b.add(rbox(lenC, 0.24, 0.09, 0.02), "pmetal", { m: mul(cm, M(0, 0.12, s * (C.w / 2))), color: GREY });
    b.add(rbox(lenC, 0.09, 0.09, 0.02), "pmetal", { m: mul(cm, M(0, -0.62, s * (C.w / 2))), color: 0x66635c });
    const n = 16;
    for (let k = 0; k <= n; k++) {
      const x0 = -lenC / 2 + (k * lenC) / n;
      b.add(box(0.06, 0.72, 0.06), "pmetal", { m: mul(cm, M(x0, -0.25, s * C.w / 2)), color: GREY });
      if (k < n) P.strut(b, [x0, -0.62, s * C.w / 2], [x0 + lenC / n, 0.1, s * C.w / 2], 0.03, GREY, cm);
    }
    // guard rail on posts
    for (let k = 0; k <= 8; k++) b.add(box(0.04, 0.5, 0.04), "pmetal", { m: mul(cm, M(-lenC / 2 + k * lenC / 8, 0.45, s * (C.w / 2 + 0.02))), color: 0x8a8780 });
    b.add(cyl(0.025, 0.025, lenC, 5).rotateZ(Math.PI / 2), "pmetal", { m: mul(cm, M(0, 0.7, s * (C.w / 2 + 0.02))), uv: "local", color: 0x8a8780 });
  }
  b.add(box(lenC, 0.04, C.w - 0.1), "rubber", { m: mul(cm, M(0, 0.21, 0)), color: 0x2a2a28 });
  for (let k = 0; k < Math.floor(lenC / 0.6); k++) b.add(box(0.05, 0.05, C.w - 0.14), "rubber", { m: mul(cm, M(-lenC / 2 + 0.3 + k * 0.6, 0.25, 0)), color: 0x1e1e1c });
  for (let k = 0; k < Math.floor(lenC / 0.55); k++) b.add(cyl(0.05, 0.05, C.w - 0.1, 8).rotateX(Math.PI / 2), "steel", { m: mul(cm, M(-lenC / 2 + 0.3 + k * 0.55, 0.14, 0)), uv: "local", color: 0x9a9a96 });
  for (let k = 0; k < 6; k++) {
    const x = C.x0 + 1.6 + k * (L - 3.2) / 5, y = C.y0 + (x - C.x0) * Math.tan(ang) - 0.55;
    for (const s of [-1, 1]) P.strut(b, [x - 0.5, 0, C.z + s * (C.w / 2 + 0.35)], [x, y, C.z + s * C.w / 2], 0.06, 0x5c5a54, new THREE.Matrix4());
    b.add(box(0.07, 0.07, C.w + 0.7), "pmetal", { m: M(x - 0.25, y * 0.5, C.z), color: 0x5c5a54 });
    b.add(rbox(0.3, 0.1, C.w + 0.9, 0.02), "gConcrete", { m: M(x - 0.5, 0.05, C.z), tile: 1, color: 0xa09a90 });
  }
  b.add(rbox(1.2, 1.0, 1.7, 0.06), "gloss", { m: M(C.x0 - 0.5, 0.5, C.z), color: 0xe0b52a });
  b.add(cyl(0.26, 0.26, 0.5, 14).rotateX(Math.PI / 2), "pmetal", { m: M(C.x0 - 0.5, 1.15, C.z + 0.65), uv: "local", color: 0x3a3a3a });
  b.add(rbox(0.5, 0.6, 0.3, 0.03), "pmetal", { m: M(C.x0 - 1.4, 0.9, C.z - 0.9), color: 0x7f8b92 });
  // green bunches riding up the belt every ~0.55 m (a packed conveyor)
  const nB = Math.floor(lenC / 0.55);
  for (let k = 0; k < nB; k++) {
    const u = (k + 0.5) / nB, x = C.x0 + L * u, y = C.y0 + cRise * u + 0.3;
    P.bananaHeap(bMid, M(x, y, C.z, 0, 0, ang), 0.55, C.w - 0.3, 3, 40 + k, 0.16);
  }
  // loading hopper at the foot of the conveyor, heaped with bunches
  b.add(rbox(2.0, 0.8, 2.0, 0.04), "crate", { m: M(C.x0 - 2.2, 0.4, C.z), uv: "box", tile: 1.5 });
  P.bananaHeap(bMid, M(C.x0 - 2.2, 0.8, C.z), 1.8, 1.8, 14, 55, 0.45);
  // ---- yard crate stacks
  for (const [i, [x0, z0, x1, z1, h, y]] of S.CRATE_STACKS.entries()) crateStack(bMid, x0, z0, x1, z1, h, y, 70 + i);
  // BANANA CO. sign board on the gable under the loft window
  b.add(rbox(5.4, 1.1, 0.1, 0.03), "wood", { m: M(0, Mn.eave - 0.2, 0.08), color: 0xf1e6cc });
  textDecal(b, "THE FEED", 5.0, 0.9, M(0, Mn.eave - 0.2, 0.14), { fg: "#8a2418", bg: null, font: 900 });
  // ---- interior (≤ 75 m): a working packing line — sorting tables heaped with hands, two long washing tanks,
  // hanging bunches on the overhead rail, stacked empty crates, a scale desk, sacks; warm lamps with light pools
  const n = bIn;
  // washing tanks (galvanised tubs with water) along the main block
  // overhead rail with hanging green bunches (hooks) over the tanks
  n.add(box(0.08, 0.08, 16), "steel", { m: M(-1.0, 3.6, -13), color: 0x444444 });
  for (let k = 0; k < 9; k++) {
    const z = -20 + k * 1.8;
    n.add(cyl(0.01, 0.01, 0.9, 4), "steel", { m: M(-1.0, 3.15, z), color: 0x333333 });
    const bunch = P.bananaHand(false);
    for (let j = 0; j < 4; j++) n.add(bunch, "bananaFruit", { m: M(-1.0, 2.55 - j * 0.12, z, 0, j * 1.6, Math.PI, 1.5), uv: "keep", color: new THREE.Color().setHSL(0.25, 0.55, 0.78) });
  }
  // scale desk + ledger + a stool, sacks
  // (the interiors kit dresses the lean-to)
  // ceiling joists under the lean-to boards
  for (let z = -B.len + 0.9; z < -0.5; z += 1.6) n.add(box(Math.abs(B.lean.x0 - B.main.x0) - 0.5, 0.18, 0.12), "wood", { m: M((B.lean.x0 + B.main.x0) / 2, S.BARN_LEANCEIL.y - S.BARN_LEANCEIL.t - 0.09, z), color: 0x7a5a3c });
  // lamps: shades + warm pools on the floor (no real lights)
  for (const [x, z] of [[-13, -8], [-9, -8], [-13, -18], [-9, -18], [0, -6], [0, -16]]) {
    const y = x < -6 ? S.BARN_LEANCEIL.y - S.BARN_LEANCEIL.t + 0.25 : B.loft - 0.35;
    n.add(cyl(0.012, 0.012, 0.8, 4), "steel", { m: M(x, y - 0.4, z), color: 0x222222 });
    n.add(cyl(0.12, 0.45, 0.3, 14, true), "pmetal", { m: M(x, y - 0.9, z), color: 0x2f5a3a });
    n.add(sph(0.12, 10, 8), "lamp", { m: M(x, y - 1.0, z) });
    const pool = new THREE.CircleGeometry(2.6, 20); pool.rotateX(-Math.PI / 2);
    n.add(pool, lightPoolMat(), { m: M(x, 0.23, z), uv: "keep", shadow: false });
    glows.push(new THREE.Vector3(x, y - 1.05, z).applyMatrix4(b.frame));
  }
  // ridge pole with the yellow vane + beacon on the gable apex
  b.add(cyl(0.05, 0.06, 2.6, 6), "pmetal", { m: M(0, ridgeY + 1.6, 0.3), color: 0x333333 });
  b.add(rbox(0.55, 0.42, 0.05, 0.02), "gloss", { m: M(0.25, ridgeY + 2.7, 0.3, 0, 0.4, 0), color: 0xf2c22a });
  b.add(sph(0.14, 10, 8), "gloss", { m: M(0, ridgeY + 2.95, 0.3), color: 0xf2c22a });
  // arrow + cardinal cross of the weather vane
  b.add(rbox(0.9, 0.06, 0.06, 0.02), "gloss", { m: M(0.1, ridgeY + 2.45, 0.3, 0, 0.4, 0), color: 0x2e2a26 });
  for (const a of [0, Math.PI / 2]) b.add(box(0.7, 0.03, 0.03), "pmetal", { m: M(0, ridgeY + 2.15, 0.3, 0, a, 0), color: 0x2e2a26 });
  // wall lamps over the big door + the dock
  for (const x of [D0.x - D0.w / 2 - 0.6, 5.2]) glows.push(P.wallLamp(b, M(x, 4.9, 0, 0, 0, 0)).applyMatrix4(b.frame));
  b.setFrame(0, 0, 0, 0); bMid.setFrame(0, 0, 0, 0); bNear.setFrame(0, 0, 0, 0); bIn.setFrame(0, 0, 0, 0);
}

export { lightPoolMat };
