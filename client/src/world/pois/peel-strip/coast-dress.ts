// poi-coast — shared client dressing helpers for LOOKOUT POINT, PEEL STRIP and THE PLANTATION: rails drawn from
// their shared collider pieces, crate stacks / cabinets drawn at EXACTLY a collider box, the POI flora (the collidable
// palms live in shared/pois/<poi>.ts FLORA so every drawn trunk has the veg area's trunk collider).
import * as THREE from "three";
import type { VegApi, PlantKind } from "../../veg/api";
import { floraColliders, type Flora, type Piece } from "../../../../../shared/pois/coast-kit";
import { vegTrunkColliders, VARIANTS } from "../../../../../shared/world/veg-scatter";
import { Batch, M, box, rbox, cyl, type MatKey } from "../_kit/coast-kit";
import { textDecal } from "../_kit/coast-sign";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
/** deterministic 0..1 hash */
export const h01 = (a: number, b = 0) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

/** end points (frame space) of a shared railCol piece: bottom of the rail at each end + its height */
function railEnds(p: Piece): { a: THREE.Vector3; c: THREE.Vector3; h: number } {
  const yaw = p.yaw ?? 0, pitch = p.pitch ?? 0, L = p.h[2];
  const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(L);
  const mid = new THREE.Vector3(p.c[0], p.c[1] - p.h[1], p.c[2]);
  return { a: mid.clone().sub(d), c: mid.clone().add(d), h: p.h[1] * 2 };
}
/** a metal guard rail between two bottom points (sloped OK): posts every ~1.2 m, top rail, knee rail, toe plate */
export function rail(b: Batch, a: THREE.Vector3, c: THREE.Vector3, h: number, o: { color?: THREE.ColorRepresentation; mat?: MatKey; toe?: boolean } = {}) {
  const col = o.color ?? 0x3a332d, mk = o.mat ?? "pmetal";
  const dir = c.clone().sub(a), L = dir.length();
  if (L < 0.05) return;
  const yaw = Math.atan2(dir.x, dir.z), pitch = -Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
  const n = Math.max(1, Math.round(L / 1.2));
  for (let k = 0; k <= n; k++) {
    const p = a.clone().lerp(c, k / n);
    b.add(rbox(0.055, h, 0.055, 0.012), mk, { m: M(p.x, p.y + h / 2, p.z), tile: 1, color: col });
  }
  const bar = (y: number, t: number) => {
    const m = a.clone().lerp(c, 0.5);
    b.add(rbox(t, t, L + 0.06, t * 0.25), mk, { m: M(m.x, m.y + y, m.z, pitch, yaw, 0), tile: 1, color: col });
  };
  bar(h, 0.06); bar(h * 0.5, 0.035);
  if (o.toe) { const m = a.clone().lerp(c, 0.5); b.add(box(0.02, 0.1, L), mk, { m: M(m.x, m.y + 0.05, m.z, pitch, yaw, 0), tile: 1, color: col }); }
}
/** every "rail:new" piece of a shared layout (frame-local pieces into the batch's current frame) */
export function drawRails(b: Batch, pieces: Piece[], o: { color?: THREE.ColorRepresentation; mat?: MatKey } = {}) {
  for (const p of pieces) if (p.k === "rail:new") { const { a, c, h } = railEnds(p); rail(b, a, c, h, o); }
}

/** one wooden crate exactly w×h×d (frame space, base centre at m): planked body with the BANANA CO. stencil face,
 *  corner posts + rims proud ≤ 2 cm (inside the collider tolerance), a lid */
export function crateAt(b: Batch, m: THREE.Matrix4, w: number, h: number, d: number, seed = 0, o: { lod?: 0 | 1 | 2; tint?: THREE.ColorRepresentation } = {}) {
  const lod = o.lod ?? 1, t = new THREE.Color(o.tint ?? 0xffffff).multiplyScalar(0.88 + 0.2 * h01(seed, 3));
  b.add(new THREE.BoxGeometry(w - 0.04, h - 0.02, d - 0.04), "crate", { m: mul(m, M(0, h / 2, 0)), uv: "keep", color: t, lod });
  const e = 0.075, wc = 0xb58d5e;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(e, h, e), "wood", { m: mul(m, M(sx * (w / 2 - e / 2), h / 2, sz * (d / 2 - e / 2))), tile: 1, color: wc, lod });
  for (const y of [e / 2, h - e / 2]) {
    for (const sz of [-1, 1]) b.add(box(w, e, e), "wood", { m: mul(m, M(0, y, sz * (d / 2 - e / 2))), tile: 1, color: wc, lod });
    for (const sx of [-1, 1]) b.add(box(e, e, d - 2 * e), "wood", { m: mul(m, M(sx * (w / 2 - e / 2), y, 0)), tile: 1, color: wc, lod });
  }
  // diagonal brace on the long faces
  const ang = Math.atan2(h - 2 * e, w - 2 * e), bl = Math.hypot(w - 2 * e, h - 2 * e);
  for (const sz of [-1, 1]) b.add(box(bl, 0.06, 0.03), "wood", { m: mul(m, M(0, h / 2, sz * (d / 2 - 0.005), 0, 0, sz * ang)), tile: 1, color: 0xa47c50, lod });
}
/** crates stacked to fill the box [x0..x1] × [y0..y1] × [z0..z1] (frame space) — cells ≤ 1.3 m, courses ≤ 0.9 m */
export function crateBlock(b: Batch, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, seed = 0, o: { lod?: 0 | 1 | 2; yaw?: number; tint?: THREE.ColorRepresentation; m?: THREE.Matrix4 } = {}) {
  const W = x1 - x0, D = z1 - z0, H = y1 - y0;
  const nx = Math.max(1, Math.round(W / 1.3)), nz = Math.max(1, Math.round(D / 1.3)), ny = Math.max(1, Math.round(H / 0.85));
  const cw = W / nx, cd = D / nz, ch = H / ny;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const s = seed * 31 + i * 7 + k * 13 + j * 3, jit = (h01(s, 1) - 0.5) * 0.08;
    const cm = M(x0 + cw * (i + 0.5), y0 + ch * j, z0 + cd * (k + 0.5), 0, (o.yaw ?? 0) + (j ? jit : 0), 0);
    crateAt(b, o.m ? new THREE.Matrix4().multiplyMatrices(o.m, cm) : cm, cw, ch, cd, s, o);
  }
}
/** a closed steel cabinet / shelving unit exactly at a box: side + back + top panels, shelves with boxes and cans */
export function shelfUnit(b: Batch, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, seed = 0, o: { color?: THREE.ColorRepresentation; lod?: 0 | 1 | 2; backZ?: 1 | -1; backX?: 1 | -1 } = {}) {
  const lod = o.lod ?? 1, col = o.color ?? 0x55636c, W = x1 - x0, D = z1 - z0, H = y1 - y0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = W >= D, L = alongX ? W : D, dep = alongX ? D : W, yaw = alongX ? 0 : Math.PI / 2;
  const f = M(cx, y0, cz, 0, yaw, 0);
  b.add(box(L, H, 0.04), "pmetal", { m: mul(f, M(0, H / 2, -dep / 2 + 0.02)), tile: 1, color: new THREE.Color(col).multiplyScalar(0.8), lod });
  for (const s of [-1, 1]) b.add(box(0.05, H, dep), "pmetal", { m: mul(f, M(s * (L / 2 - 0.025), H / 2, 0)), tile: 1, color: col, lod });
  const nS = Math.max(2, Math.round(H / 0.55));
  for (let k = 0; k <= nS; k++) {
    const y = Math.min(H - 0.02, k * (H / nS)) + 0.02;
    b.add(box(L - 0.1, 0.035, dep - 0.02), "pmetal", { m: mul(f, M(0, y, 0)), tile: 1, color: col, lod });
    if (k === nS) continue;
    let x = -L / 2 + 0.12;
    for (let i = 0; x < L / 2 - 0.3 && i < 12; i++) {
      const s = seed * 17 + k * 5 + i, bw = 0.3 + h01(s) * 0.35, bh = Math.min(H / nS - 0.1, 0.22 + h01(s, 2) * 0.28);
      if (h01(s, 5) > 0.18) {
        const c = [0xb98a55, 0xd9c49a, 0x8a5a3a, 0x3f6e8a, 0xc0392b, 0x6e8a3f][Math.floor(h01(s, 7) * 6)];
        if (h01(s, 9) < 0.3) b.add(cyl(0.09, 0.09, bh, 10), "pmetal", { m: mul(f, M(x + 0.1, y + bh / 2 + 0.02, (h01(s, 4) - 0.5) * 0.2)), uv: "local", tile: 1, color: c, lod: 2 });
        else b.add(rbox(bw, bh, dep - 0.12, 0.02), "plain", { m: mul(f, M(x + bw / 2, y + bh / 2 + 0.02, 0)), color: c, lod: 2 });
      }
      x += bw + 0.05;
    }
  }
}
/** a sign plate with painted text */
export function plate(b: Batch, text: string, w: number, h: number, m: THREE.Matrix4, fg = "#1d1a14", bg = "#f4d23a") {
  b.add(rbox(w + 0.08, h + 0.08, 0.04, 0.015), "pmetal", { m, color: 0x2f2b27, shadow: false });
  textDecal(b, text, w, h, mul(m, M(0, 0, 0.025)), { fg, bg, font: 900 });
}

/** plant the POI's flora list (collidable trunks are in the shared colliders) through the veg api. A page without the
 *  veg module (`?modules=…` tool pages: the parity check) gets plain trunk blocks at exactly the trunk colliders, so what
 *  collides is still drawn there. */
export function plantFlora(veg: VegApi | undefined, flora: Flora[], scene?: THREE.Object3D) {
  if (!veg) {
    if (!scene) return;
    const b = new Batch();
    for (const t of floraColliders(flora, vegTrunkColliders, VARIANTS)) b.add(box(t.h[0] * 2, t.h[1] * 2, t.h[2] * 2), "wood", { m: M(t.c[0], t.c[1], t.c[2], 0, -(t.yaw ?? 0), 0), color: 0x8a6a4a });
    scene.add(b.build("coast:trunks(no-veg)"));
    return;
  }
  const lists = new Map<PlantKind, THREE.Matrix4[]>();
  for (const [k, x, y, z, yaw, s] of flora) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));
    const l = lists.get(k as PlantKind) ?? []; l.push(m); lists.set(k as PlantKind, l);
  }
  for (const [k, ms] of lists) veg.plant(k, ms);
}
/** collidable veg kinds: a POI draws these ONLY through its shared FLORA (a client-only palm is a walk-through trunk) */
export const SOLID_KINDS: ReadonlySet<string> = new Set(["palm", "palm-leaning", "jungle-tree", "log"]);

/** tread caps (nosing proud 2 cm) on the solid step blocks of a shared stair — the block reads as a plastered stair
 *  stringer, the caps as timber / stone treads */
export function stairTreads(b: Batch, pieces: Piece[], kind: string, o: { mat?: MatKey; color?: THREE.ColorRepresentation } = {}) {
  for (const p of pieces) {
    if (p.k !== kind || p.col) continue;
    const top = p.c[1] + p.h[1];
    b.add(rbox(p.h[0] * 2 + 0.02, 0.05, p.h[2] * 2 + 0.03, 0.012), o.mat ?? "wood", { m: M(p.c[0], top - 0.02, p.c[2], 0, p.yaw ?? 0, 0), tile: 1, color: o.color ?? 0x8a6444, lod: 2 });
  }
}

/** open-riser stair: a plank tread at every tread collider of a shared `stairs()` flight whose visual blocks are skipped
 *  (the full-height blocks read as a solid wedge you could walk into under the flight — parity walk-through), plus a
 *  stringer on each side from the first to the last tread */
export function openStair(b: Batch, pieces: Piece[], visKind: string, o: { color?: THREE.ColorRepresentation; mat?: MatKey; stringer?: THREE.ColorRepresentation; thick?: number } = {}) {
  const treads: Piece[] = [];
  for (let i = 0; i + 1 < pieces.length; i++) if (pieces[i].k === visKind && pieces[i + 1].k === "step:col") treads.push(pieces[i + 1]);
  if (!treads.length) return;
  const th = o.thick ?? 0.07;
  for (const p of treads) b.add(rbox(p.h[0] * 2, th, p.h[2] * 2 - 0.02, 0.015), o.mat ?? "deck", { m: M(p.c[0], p.c[1] + p.h[1] - th / 2, p.c[2], 0, p.yaw ?? 0, 0), tile: 1.2, color: o.color ?? 0xa88058 });
  // stringers per straight run (consecutive treads with the same yaw)
  let run: Piece[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const a = run[0], z = run[run.length - 1], yaw = a.yaw ?? 0, cx = Math.cos(yaw), sx = -Math.sin(yaw);
      for (const s of [-1, 1]) {
        const off = s * (a.h[0] - 0.04);
        P3strut(b, [a.c[0] + cx * off, a.c[1] + a.h[1] - th - 0.12, a.c[2] + sx * off], [z.c[0] + cx * off, z.c[1] + z.h[1] - th - 0.12, z.c[2] + sx * off], o.stringer ?? 0x6b4b33);
      }
    }
    run = [];
  };
  for (const p of treads) { if (run.length && Math.abs((run[0].yaw ?? 0) - (p.yaw ?? 0)) > 1e-3) flush(); run.push(p); }
  flush();
}
function P3strut(b: Batch, a: number[], c: number[], color: THREE.ColorRepresentation) {
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]), L = d.length();
  const yaw = Math.atan2(d.x, d.z), pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
  b.add(rbox(0.07, 0.24, L + 0.3, 0.02), "wood", { m: M((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, pitch, yaw, 0), tile: 1.5, color });
}
