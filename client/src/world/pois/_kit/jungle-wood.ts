// poi-jungle kit — timber & rope structures: rope-and-plank bridges (sagging deck, handrails, hangers, optional X-bracing,
// log end posts with lashing, anchor ropes), lookout platforms with banana-leaf thatch roofs and a flag, cliff walkways,
// a timber hoist crane with a hanging crate, a dugout canoe. Every builder returns geometry buckets (merged by the
// caller per material) AND the collider boxes, so what you see is what you walk on.
import * as THREE from "three";
import type { Box } from "../../../../../shared/world/colliders";
import { bevelBox, boxUVs, merge, place, tint, rope, lashing, type Geo } from "./jungle-geo";
import { canvasTex, mulberry, ropeTex } from "./jungle-mat";

export interface WoodBuckets { wood: Geo[]; log: Geo[]; rope: Geo[]; leaf: Geo[]; cloth: Geo[]; hull: Geo[]; boxes: Box[] }
export const newBuckets = (): WoodBuckets => ({ wood: [], log: [], rope: [], leaf: [], cloth: [], hull: [], boxes: [] });

const up = new THREE.Vector3(0, 1, 0);
/** a bevelled timber (plank/beam) from its centre, oriented by yaw/pitch/roll; uv in metres along the grain (+x) */
export function timber(len: number, h: number, w: number, c: THREE.Vector3, yaw: number, pitch = 0, roll = 0, tintHex = "#ffffff", bevel = 0.025): Geo {
  const g = bevelBox(len, h, w, bevel);
  // grain along x: planar uv x/z → (along, across)
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv.setXY(i, x / 1.6 + 0.37 * c.x, (ny > nz ? z : y) / 1.6 + 0.21 * c.z);
  }
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(roll, yaw, pitch, "YZX"));
  g.applyMatrix4(m); g.translate(c.x, c.y, c.z);
  tint(g, tintHex, 0.1);
  return g;
}
/** a round log between two points (posts, rails, beams) — uv u around, v along in metres */
export function log(a: THREE.Vector3, b: THREE.Vector3, r: number, tintHex = "#ffffff", segs = 9, r1?: number): Geo {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1 ?? r * 0.94, r, len, segs, r < 0.05 ? 1 : Math.max(1, Math.round(len / 1.5)), r < 0.05);
  const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 6.28 / 1.6, uv.getY(i) * len / 1.6);
  // a little irregularity (hand-hewn)
  const pos = g.attributes.position as THREE.BufferAttribute, rnd = mulberry(Math.round(a.x * 13 + a.z * 7 + b.y * 3));
  const wob = Array.from({ length: 6 }, () => rnd());
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / len + 0.5, k = 1 + 0.05 * Math.sin(y * 7 + wob[0] * 6) * wob[1]; pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
  g.computeVertexNormals();
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  tint(g, tintHex, 0.08);
  return g;
}

export interface BridgeOpts { sag: number; width: number; plank?: number; gap?: number; railH?: number; xBrace?: boolean; posts?: boolean; missing?: number; seed?: number; anchors?: [number, number];
  /** tall lashed log end frames (posts ~2.8 m over the deck, sill log, raking braces to the bank) */
  frames?: boolean }
export const bridgeY = (a: THREE.Vector3, b: THREE.Vector3, sag: number, t: number) => a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
/** a rope-and-plank bridge from a to b (deck heights at the posts). anchors = ground heights behind each end (for guy ropes) */
export function ropeBridge(A: THREE.Vector3, B: THREE.Vector3, o: BridgeOpts, out: WoodBuckets) {
  const rnd = mulberry(o.seed ?? 7), railH = o.railH ?? 1.05, pw = o.plank ?? 0.34, gap = o.gap ?? 0.1, W = o.width;
  const flat = new THREE.Vector3(B.x - A.x, 0, B.z - A.z), span = flat.length(); flat.normalize();
  const side = new THREE.Vector3(-flat.z, 0, flat.x);
  const yaw = Math.atan2(-flat.z, flat.x);
  const P = (t: number, s = 0, lift = 0) => new THREE.Vector3(A.x + (B.x - A.x) * t + side.x * s, bridgeY(A, B, o.sag, t) + lift, A.z + (B.z - A.z) * t + side.z * s);
  // planks
  const n = Math.floor(span / (pw + gap));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n; if (o.missing && rnd() < o.missing && t > 0.15 && t < 0.85) continue;
    const t0 = Math.max(0, t - 0.01), t1 = Math.min(1, t + 0.01);
    const pitch = Math.atan2(bridgeY(A, B, o.sag, t1) - bridgeY(A, B, o.sag, t0), (t1 - t0) * span);
    const c = P(t, (rnd() - 0.5) * 0.08, -0.04);
    out.wood.push(timber(pw * (0.9 + rnd() * 0.16), 0.12, W * (0.98 + rnd() * 0.14), c, yaw + (rnd() - 0.5) * 0.07, pitch, (rnd() - 0.5) * 0.05, rnd() < 0.3 ? "#c9a47a" : rnd() < 0.5 ? "#e6c49a" : "#ffffff", 0.03));
  }
  // stringers under the plank ends + handrails + hangers (+ X bracing)
  const N = 40;
  const line = (s: number, lift: number, sagK: number) => { const pts: THREE.Vector3[] = []; for (let i = 0; i <= N; i++) { const t = i / N; const p = P(t, s, lift); p.y += o.sag * 4 * t * (1 - t) * (1 - sagK); pts.push(p); } return pts; };
  const tube = (pts: THREE.Vector3[], r: number) => { const cv = new THREE.CatmullRomCurve3(pts); const g = new THREE.TubeGeometry(cv, Math.max(12, Math.round(span / 1.2)), r, 5, false); const L = cv.getLength(); const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.5, uv.getY(i)); tint(g, "#ffffff"); return g; };
  for (const s of [-1, 1]) {
    out.rope.push(tube(line(s * W / 2 * 0.92, -0.12, 1), 0.06));
    out.rope.push(tube(line(s * (W / 2 + 0.05), railH, 0.82), 0.06));
    out.rope.push(tube(line(s * (W / 2 + 0.04), railH * 0.52, 0.9), 0.036));
    // stout stakes along the rails every ~3 m, lashed at deck + rail
    const np = Math.max(2, Math.round(span / 3.1));
    for (let i = 1; i < np; i++) {
      const t = i / np, bot = P(t, s * (W / 2 + 0.07), -0.32), top = P(t, s * (W / 2 + 0.07), railH + 0.16); top.y += o.sag * 4 * t * (1 - t) * 0.18;
      out.log.push(log(bot, top, 0.075, "#d4b995", 7));
      out.rope.push(lashing(top.x, top.y - 0.2, top.z, 0.075, 2), lashing(bot.x, bot.y + 0.3, bot.z, 0.075, 2));
    }
    // X-braced sides: open diamonds between hangers ~1.9 m apart, not a dense fence
    const nh = Math.max(4, Math.round(span / (o.xBrace ? 1.9 : 0.9)));
    let prevTop: THREE.Vector3 | null = null, prevBot: THREE.Vector3 | null = null;
    for (let i = 1; i < nh; i++) {
      const t = i / nh, bot = P(t, s * W / 2 * 0.95, -0.05), top = P(t, s * (W / 2 + 0.05), railH); top.y += o.sag * 4 * t * (1 - t) * 0.18;
      out.rope.push(log(bot, top, o.xBrace ? 0.032 : 0.024, "#ffffff", 4));
      if (o.xBrace && prevTop && prevBot) { out.rope.push(log(prevBot, top, 0.028, "#ffffff", 4), log(prevTop, bot, 0.028, "#ffffff", 4)); }
      prevTop = top; prevBot = bot;
    }
  }
  // end posts + lashing + guy ropes
  if (o.posts !== false) for (const [E, dirSign, gy] of [[A, -1, o.anchors?.[0]], [B, 1, o.anchors?.[1]]] as Array<[THREE.Vector3, number, number | undefined]>) {
    const F = !!o.frames, pr = F ? 0.21 : 0.17;
    if (F) { // sill log under the deck end, lashed to both posts
      const l0 = new THREE.Vector3(E.x - side.x * (W / 2 + 0.5), E.y - 0.3, E.z - side.z * (W / 2 + 0.5)), l1 = new THREE.Vector3(E.x + side.x * (W / 2 + 0.5), E.y - 0.3, E.z + side.z * (W / 2 + 0.5));
      out.log.push(log(l0, l1, 0.15, "#cdb393", 8));
    }
    for (const s of [-1, 1]) {
      const base = new THREE.Vector3(E.x + side.x * s * (W / 2 + 0.22), E.y - (F ? 1.9 : 1.4), E.z + side.z * s * (W / 2 + 0.22));
      const top = base.clone(); top.y = E.y + railH + (F ? 1.75 + rnd() * 0.3 : 0.55);
      top.x += flat.x * dirSign * (F ? 0.12 : 0); top.z += flat.z * dirSign * (F ? 0.12 : 0);   // a slight outward lean
      out.log.push(log(base, top, pr, "#d9c4a6", 10, pr * 0.86));
      out.rope.push(lashing(top.x, E.y + railH - 0.12, top.z, pr, 3), lashing(top.x, E.y - 0.05, top.z, pr, 2));
      if (F) {
        out.rope.push(lashing(top.x, top.y - 0.45, top.z, pr * 0.9, 4));
        // raking brace from high on the post down to the bank behind it (an A-frame)
        const bt = base.clone().lerp(top, 0.62), gx = top.x + flat.x * dirSign * 2.4, gz = top.z + flat.z * dirSign * 2.4;
        out.log.push(log(new THREE.Vector3(gx, (gy ?? E.y - 0.4) - 0.3, gz), bt, 0.12, "#cfb697", 8));
        out.rope.push(lashing(bt.x, bt.y - 0.1, bt.z, pr, 2));
      }
      // cap knob
      out.log.push(place(new THREE.SphereGeometry(pr, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), top.x, top.y, top.z));
      if (gy !== undefined) { // guy rope to a stake behind the post
        const stake = new THREE.Vector3(top.x + flat.x * dirSign * 2.6, gy + 0.1, top.z + flat.z * dirSign * 2.6);
        out.rope.push(rope(new THREE.Vector3(top.x, top.y - 0.2, top.z), stake, 0.15, 0.035, 10));
        out.log.push(log(new THREE.Vector3(stake.x, gy - 0.3, stake.z), new THREE.Vector3(stake.x, gy + 0.45, stake.z), 0.07, "#cbb291", 6));
      }
      out.boxes.push({ c: [base.x, (base.y + top.y) / 2, base.z], h: [0.2, (top.y - base.y) / 2, 0.2], yaw: 0, surf: "wood" });
    }
  }
  // colliders: deck segments + side rails (low walls)
  const segs = Math.max(8, Math.round(span / 3));
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs, p0 = P(t0), p1 = P(t1), pm = P((t0 + t1) / 2);
    const dy = p1.y - p0.y, len = span / segs;
    out.boxes.push({ c: [pm.x, pm.y - 0.06, pm.z], h: [len / 2 + 0.05, 0.08, W / 2], yaw, pitch: Math.atan2(dy, len), surf: "wood" });
    for (const s of [-1, 1]) { const q = P((t0 + t1) / 2, s * (W / 2 + 0.1), railH / 2); out.boxes.push({ c: [q.x, q.y, q.z], h: [len / 2, railH / 2, 0.06], yaw, pitch: Math.atan2(dy, len), surf: "wood" }); }
  }
}

/** timber deck (planks across `w`, beams under) — local rect centred at c, yaw; returns top y */
export function deck(c: THREE.Vector3, w: number, d: number, yaw: number, out: WoodBuckets, rnd = mulberry(3), o: { planks?: boolean } = {}) {
  const fwd = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const n = Math.round(w / 0.32);
  if (o.planks !== false) for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n - 0.5, p = c.clone().addScaledVector(fwd, a * w).add(new THREE.Vector3(0, -0.04 + (rnd() - 0.5) * 0.02, 0)).addScaledVector(side, (rnd() - 0.5) * 0.06);
    out.wood.push(timber(0.3, 0.08, d * (0.97 + rnd() * 0.05), p, yaw + (rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.02, rnd() < 0.35 ? "#d2ae84" : "#ffffff"));
  }
  for (const s of [-0.42, 0, 0.42]) out.log.push(log(c.clone().addScaledVector(side, s * d).addScaledVector(fwd, -w / 2 - 0.2).add(new THREE.Vector3(0, -0.22, 0)), c.clone().addScaledVector(side, s * d).addScaledVector(fwd, w / 2 + 0.2).add(new THREE.Vector3(0, -0.22, 0)), 0.13, "#caa983", 8));
  out.boxes.push({ c: [c.x, c.y - 0.12, c.z], h: [w / 2, 0.14, d / 2], yaw, surf: "wood" });
}

/** lookout platform on log stilts with a banana-leaf thatch roof, rope railing (open on `openSide`), flag + crate */
export function lookout(c: THREE.Vector3, groundAt: (x: number, z: number) => number, w: number, d: number, yaw: number, roofH: number, out: WoodBuckets, o: { openSide?: number; flag?: boolean; /** the −fwd end has no rail either (steps go down there) */ openBack?: boolean } = {}) {
  const rnd = mulberry(Math.round(c.x * 3 + c.z));
  const fwd = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const at = (a: number, s: number, y = c.y) => c.clone().addScaledVector(fwd, a).addScaledVector(side, s).setY(y);
  deck(c, w, d, yaw, out, rnd);
  // stilts: 6 posts from the ground to the roof eave (4 corners + 2 middle)
  const posts: THREE.Vector3[] = [];
  for (const a of [-w / 2 + 0.25, 0, w / 2 - 0.25]) for (const s of [-d / 2 + 0.25, d / 2 - 0.25]) {
    const p = at(a, s); const gy = groundAt(p.x, p.z);
    const eave = c.y + roofH - (Math.abs(s) > 0.1 ? 0.0 : 0);
    out.log.push(log(new THREE.Vector3(p.x, Math.min(gy, c.y) - 0.6, p.z), new THREE.Vector3(p.x, eave, p.z), 0.2, "#e0cba9", 10, 0.18));
    out.rope.push(lashing(p.x, c.y - 0.3, p.z, 0.2, 3), lashing(p.x, eave - 0.45, p.z, 0.19, 3));
    if (gy < c.y - 2.5) { // diagonal knee braces under the deck
      const q = p.clone().addScaledVector(fwd, a > 0.1 ? -1.4 : 1.4); q.y = c.y - 0.2;
      out.log.push(log(new THREE.Vector3(p.x, c.y - 1.9, p.z), q, 0.09, "#cfb38e", 7));
    }
    posts.push(p);
    out.boxes.push({ c: [p.x, (gy + c.y + roofH) / 2, p.z], h: [0.2, (c.y + roofH - gy) / 2 + 0.3, 0.2], yaw: 0, surf: "wood" });
  }
  // rope railing on three sides (openSide: +1 → the +fwd end is open for a bridge)
  const railY = c.y + 0.95;
  const edges: Array<[THREE.Vector3, THREE.Vector3]> = [[at(-w / 2 + 0.25, -d / 2 + 0.25, railY), at(w / 2 - 0.25, -d / 2 + 0.25, railY)], [at(-w / 2 + 0.25, d / 2 - 0.25, railY), at(w / 2 - 0.25, d / 2 - 0.25, railY)]];
  if (o.openSide !== -1 && !o.openBack) edges.push([at(-w / 2 + 0.25, -d / 2 + 0.25, railY), at(-w / 2 + 0.25, d / 2 - 0.25, railY)]);
  if (o.openSide !== 1) edges.push([at(w / 2 - 0.25, -d / 2 + 0.25, railY), at(w / 2 - 0.25, d / 2 - 0.25, railY)]);
  for (const [a, b] of edges) {
    out.log.push(log(a, b, 0.07, "#d6bb94", 7));
    out.rope.push(rope(a.clone().setY(railY - 0.45), b.clone().setY(railY - 0.45), 0.12, 0.035, 12));
    const len = a.distanceTo(b), k = Math.round(len / 1.1);
    for (let i = 1; i < k; i++) { const p = a.clone().lerp(b, i / k); out.log.push(log(new THREE.Vector3(p.x, c.y - 0.05, p.z), new THREE.Vector3(p.x, railY + 0.05, p.z), 0.055, "#cdb08a", 6)); }
    out.boxes.push({ c: [(a.x + b.x) / 2, c.y + 0.55, (a.z + b.z) / 2], h: [len / 2, 0.55, 0.06], yaw: Math.atan2(-(b.z - a.z), b.x - a.x), surf: "wood" });
  }
  // roof: ridge along fwd, rafters, then overlapping banana-leaf thatch cards
  const eaveY = c.y + roofH, ridgeY = eaveY + 1.6, over = 0.9;
  out.log.push(log(at(-w / 2 - over, 0, ridgeY), at(w / 2 + over, 0, ridgeY), 0.12, "#d9c19e", 8));
  for (const s of [-1, 1]) out.log.push(log(at(-w / 2 - 0.2, s * (d / 2 - 0.25), eaveY), at(w / 2 + 0.2, s * (d / 2 - 0.25), eaveY), 0.12, "#d9c19e", 8));
  const nr = Math.round(w / 1.2) + 1;
  for (let i = 0; i < nr; i++) { const a = -w / 2 - over * 0.6 + (w + over * 1.2) * i / (nr - 1); for (const s of [-1, 1]) out.log.push(log(at(a, 0, ridgeY + 0.05), at(a, s * (d / 2 + over), eaveY - 0.55), 0.065, "#d3b68f", 6)); }
  // thatch: a planked underlay per slope, then overlapping rows of big banana leaves (tips down-slope, the eave row
  // drooping past the overhang) and a ridge cap of leaves folded over the ridge
  for (const s of [-1, 1]) {
    const eaveOut = s * (d / 2 + over), eY = eaveY - 0.55;
    const pr = at(-w / 2 - over, 0, ridgeY + 0.06), pl = at(w / 2 + over, 0, ridgeY + 0.06), er = at(-w / 2 - over, eaveOut, eY), el = at(w / 2 + over, eaveOut, eY);
    const ul = new THREE.BufferGeometry().setFromPoints([pr, pl, er, pl, el, er]); ul.computeVertexNormals();
    const uvA = new Float32Array([0, 0, w / 1.6, 0, 0, 1.6, w / 1.6, 0, w / 1.6, 1.6, 0, 1.6]); ul.setAttribute("uv", new THREE.BufferAttribute(uvA, 2));
    if (s < 0) { const idx = [0, 2, 1, 3, 4, 5]; ul.setIndex(idx); } else ul.setIndex([0, 1, 2, 3, 5, 4]);
    ul.computeVertexNormals(); tint(ul, "#5c4a30"); out.wood.push(ul);
    const rows = 4, span = w + over * 2;
    for (let r = rows - 1; r >= 0; r--) {
      const t0 = r / rows;                                  // 0 = eave row
      const n = Math.round(span / 0.62);
      for (let i = 0; i <= n; i++) {
        const a = -span / 2 + span * (i + (r % 2) * 0.5) / n + (rnd() - 0.5) * 0.15;
        if (Math.abs(a) > span / 2 + 0.1) continue;
        const rootT = Math.min(1, t0 + 0.42), tipT = t0 - (r === 0 ? 0.26 : 0.08);
        const P = (t: number) => at(a, eaveOut * (1 - t), eY + (ridgeY + 0.06 - eY) * t);
        const root = P(rootT).add(new THREE.Vector3(0, 0.06 + r * 0.03, 0)), tip = P(tipT).add(new THREE.Vector3(0, r === 0 ? -0.35 : 0.05, 0));
        out.leaf.push(leafCard(root, tip, 1.05 + rnd() * 0.35, r === 0 ? 0.35 : 0.12, rnd));
      }
    }
  }
  { const n = Math.round((w + over * 2) / 0.7);
    for (let i = 0; i <= n; i++) { const a = -w / 2 - over + (w + over * 2) * i / n; for (const s of [-1, 1]) { const root = at(a, -s * 0.35, ridgeY + 0.3), tip = at(a + (rnd() - 0.5) * 0.3, s * 1.3, ridgeY - 0.25); out.leaf.push(leafCard(root, tip, 0.95 + rnd() * 0.2, 0.1, rnd)); } } }
  if (o.flag !== false) { // flag pole on the back corner + a red banner with a leaf emblem
    const p = at(-w / 2 + 0.25, -d / 2 + 0.25, eaveY);
    const top = new THREE.Vector3(p.x, ridgeY + 2.6, p.z);
    out.log.push(log(new THREE.Vector3(p.x, eaveY - 0.2, p.z), top, 0.055, "#d6bb94", 6));
    const f = new THREE.PlaneGeometry(1.3, 0.85, 6, 2); const pos = f.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + 0.65; pos.setZ(i, Math.sin(x * 3.2) * 0.12 * x); }
    f.computeVertexNormals(); f.translate(0, 0, 0);
    f.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw + 0.5)); f.translate(top.x, top.y - 0.5, top.z);
    const fx = new THREE.Vector3(Math.cos(yaw + 0.5), 0, -Math.sin(yaw + 0.5)); f.translate(fx.x * 0.02, 0, fx.z * 0.02);
    out.cloth.push(f);
  }
}

/** a curved leaf card between root and tip (width w, droop = mid-sag), uv 0..1 over the leaf texture */
export function leafCard(root: THREE.Vector3, tip: THREE.Vector3, w: number, droop: number, rnd = Math.random): Geo {
  const along = new THREE.Vector3().subVectors(tip, root), L = along.length(); along.normalize();
  let side = new THREE.Vector3().crossVectors(along, up); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
  const nrm = new THREE.Vector3().crossVectors(side, along).normalize();
  const segs = 5, g = new THREE.PlaneGeometry(1, 1, 2, segs);
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const twist = (rnd() - 0.5) * 0.3;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getY(i) + 0.5; // v 0 root → 1 tip
    const wv = w * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1)) ** 0.6;
    const cup = Math.abs(u) * 0.18 * w; // midrib crease
    const p = root.clone().addScaledVector(along, v * L).addScaledVector(side, u * wv + twist * v * u).addScaledVector(nrm, -droop * 4 * v * (1 - v) * 0.5 - droop * v * v * 0.8 + cup);
    pos.setXYZ(i, p.x, p.y, p.z); uv.setXY(i, u + 0.5, v);
  }
  g.computeVertexNormals(); tint(g, "#ffffff", 0.08);
  return g;
}

/** walkway of planks on brackets hugging a wall: from a to b (deck heights), outward normal n */
export function walkway(a: THREE.Vector3, b: THREE.Vector3, w: number, out: WoodBuckets, rnd = mulberry(9)) {
  const flat = new THREE.Vector3(b.x - a.x, 0, b.z - a.z), span = flat.length(); flat.normalize();
  const yaw = Math.atan2(-flat.z, flat.x), side = new THREE.Vector3(-flat.z, 0, flat.x);
  const n = Math.round(span / 0.34);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, c = a.clone().lerp(b, t); c.y -= 0.04; out.wood.push(timber(0.3, 0.07, w, c, yaw + (rnd() - 0.5) * 0.04, Math.atan2(b.y - a.y, span), 0, rnd() < 0.3 ? "#d2ae84" : "#ffffff")); }
  const nb = Math.max(2, Math.round(span / 2.2));
  for (let i = 0; i <= nb; i++) {
    const t = i / nb, c = a.clone().lerp(b, t);
    out.log.push(log(c.clone().addScaledVector(side, -w / 2).add(new THREE.Vector3(0, -0.12, 0)), c.clone().addScaledVector(side, w / 2).add(new THREE.Vector3(0, -0.12, 0)), 0.08, "#caa983", 6));
    const post = c.clone().addScaledVector(side, w / 2 - 0.08);
    out.log.push(log(post.clone().add(new THREE.Vector3(0, -1.6, 0)), post.clone().add(new THREE.Vector3(0, 1.05, 0)), 0.08, "#d0b089", 7));
    out.log.push(log(post.clone().add(new THREE.Vector3(0, -1.4, 0)).addScaledVector(side, -w + 0.1), post.clone().add(new THREE.Vector3(0, -0.14, 0)), 0.05, "#caa983", 5)); // knee brace to the wall
  }
  out.rope.push(rope(a.clone().addScaledVector(side, w / 2 - 0.08).add(new THREE.Vector3(0, 1.0, 0)), b.clone().addScaledVector(side, w / 2 - 0.08).add(new THREE.Vector3(0, 1.0, 0)), 0.15, 0.04, 16));
  out.boxes.push({ c: [(a.x + b.x) / 2, (a.y + b.y) / 2 - 0.06, (a.z + b.z) / 2], h: [span / 2, 0.08, w / 2], yaw, pitch: Math.atan2(b.y - a.y, span), surf: "wood" });
  out.boxes.push({ c: [(a.x + b.x) / 2 + side.x * w / 2, (a.y + b.y) / 2 + 0.5, (a.z + b.z) / 2 + side.z * w / 2], h: [span / 2, 0.55, 0.06], yaw, pitch: Math.atan2(b.y - a.y, span), surf: "wood" });
}

/** timber hoist crane: mast + jib + brace, a rope down to a hanging crate (crate returned as a transform) */
export function hoist(base: THREE.Vector3, yaw: number, jib: number, drop: number, out: WoodBuckets): THREE.Matrix4 {
  const fwd = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const mastTop = base.clone().add(new THREE.Vector3(0, 5.2, 0));
  out.log.push(log(base.clone().add(new THREE.Vector3(0, -0.8, 0)), mastTop, 0.2, "#dbc3a0", 10));
  const tip = mastTop.clone().addScaledVector(fwd, jib).add(new THREE.Vector3(0, 0.6, 0));
  out.log.push(log(mastTop.clone().addScaledVector(fwd, -1.2).add(new THREE.Vector3(0, -0.15, 0)), tip, 0.14, "#d6bc97", 9));
  out.log.push(log(base.clone().add(new THREE.Vector3(0, 2.2, 0)), mastTop.clone().addScaledVector(fwd, jib * 0.55).add(new THREE.Vector3(0, 0.3, 0)), 0.1, "#ceb18a", 8));
  out.rope.push(lashing(mastTop.x, mastTop.y - 0.3, mastTop.z, 0.2, 3), lashing(base.x, base.y + 2.1, base.z, 0.2, 2));
  // pulley wheel + rope
  out.log.push(place(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14), tip.x, tip.y - 0.25, tip.z, yaw, 1, Math.PI / 2));
  const hang = tip.clone().add(new THREE.Vector3(0, -drop, 0));
  out.rope.push(log(tip.clone().add(new THREE.Vector3(0, -0.3, 0)), hang, 0.035, "#ffffff", 5));
  out.rope.push(rope(tip.clone().add(new THREE.Vector3(0, -0.2, 0)), base.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(fwd, 0.3), 0.6, 0.035, 14));
  // crate hanging by 4 short ropes
  const cTop = hang.clone();
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.rope.push(log(cTop, cTop.clone().add(new THREE.Vector3(sx * 0.45, -0.75, sz * 0.45)), 0.022, "#ffffff", 4));
  out.boxes.push({ c: [base.x, base.y + 2.4, base.z], h: [0.25, 3.2, 0.25], yaw: 0, surf: "wood" });
  return new THREE.Matrix4().compose(cTop.clone().add(new THREE.Vector3(0, -1.25, 0)), new THREE.Quaternion().setFromAxisAngle(up, yaw + 0.3), new THREE.Vector3(1, 1, 1));
}

/** dugout canoe: hollowed half-log hull with pointed ends, a rim, three thwarts. Local +x = bow. */
export function canoe(c: THREE.Vector3, yaw: number, len: number, out: WoodBuckets, groundTilt = 0, pitch = 0) {
  const R = len * 0.085, nu = 28, nv = 14;
  const pos: number[] = [], idx: number[] = [], uvs: number[] = [];
  const prof = (u: number) => Math.pow(Math.sin(Math.PI * u), 0.55);
  const ring = (inner: boolean) => {
    const start = pos.length / 3;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, r = R * prof(u) * (inner ? 0.82 : 1), x = (u - 0.5) * len * (inner ? 0.9 : 1);
      const rise = 0.62 * R * Math.pow(Math.abs(u - 0.5) * 2, 2.6); // ends sweep up (raised pointed ends)
      for (let j = 0; j <= nv; j++) {
        const a = Math.PI + Math.PI * j / nv; // bottom half circle (π → 2π)
        const y = Math.sin(a) * r * 1.12 + rise + (inner ? R * 0.1 : 0), z = Math.cos(a) * r;
        pos.push(x, y, z); uvs.push(x / 3.2, (a - Math.PI) * R / 1.2);   // grain streaks run ALONG the hull (one log)
      }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = start + i * (nv + 1) + j, b = a + nv + 1; if (inner) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); }
    return start;
  };
  const o0 = ring(false), i0 = ring(true), nOuter = i0;
  // rim strips joining outer and inner top edges (j = 0 and j = nv)
  for (const j of [0, nv]) for (let i = 0; i < nu; i++) {
    const a = o0 + i * (nv + 1) + j, b = o0 + (i + 1) * (nv + 1) + j, c2 = i0 + i * (nv + 1) + j, d = i0 + (i + 1) * (nv + 1) + j;
    if (j === 0) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(groundTilt, yaw, pitch, "YXZ")), new THREE.Vector3(1, 1, 1));
  // weathered hull: sun-bleached rim + upper sides, darker damp keel (vertex colour over the grain)
  { const P = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const y = P.getY(i), k = Math.min(1, Math.max(0, (y + R * 0.9) / (R * 1.2))), rim = y > R * 0.05 ? 1.12 : 1,
      wet = (0.72 + 0.28 * k) * (i >= nOuter ? 0.5 + 0.25 * k : 1);   // the hollow is darker (shaded, damp) — reads as a dugout, not a board
      col[i * 3] = wet * rim; col[i * 3 + 1] = wet * rim * 0.97; col[i * 3 + 2] = wet * rim * 0.92; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); }
  g.applyMatrix4(m); out.hull.push(g);
  for (const t of [-0.25, 0, 0.25]) { const p = new THREE.Vector3(t * len, -R * 0.12, 0).applyMatrix4(m); out.hull.push(timber(0.2, 0.07, R * 1.5 * Math.pow(Math.sin(Math.PI * (0.5 + t)), 0.55), p, yaw + Math.PI / 2, 0, 0, "#c9ad8a")); }
  out.boxes.push({ c: [c.x, c.y, c.z], h: [len / 2, R * 0.6, R], yaw, surf: "wood" });
}

// ---------------------------------------------------------------- textures
/** banana-leaf card texture: oblong leaf, pale midrib, parallel veins, a few torn slits, lime → yellow-green */
let _leaf: THREE.CanvasTexture | null = null;
export function bananaLeafTex(): THREE.CanvasTexture {
  if (_leaf) return _leaf;
  _leaf = canvasTex(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const rnd = mulberry(31);
    const cx = w / 2;
    const shape = new Path2D();
    shape.moveTo(cx, h * 0.01);
    shape.bezierCurveTo(cx + w * 0.52, h * 0.12, cx + w * 0.5, h * 0.8, cx + w * 0.04, h * 0.99);
    shape.lineTo(cx - w * 0.04, h * 0.99);
    shape.bezierCurveTo(cx - w * 0.5, h * 0.8, cx - w * 0.52, h * 0.12, cx, h * 0.01);
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, "#7fb52c"); grd.addColorStop(0.45, "#b8dc4a"); grd.addColorStop(0.55, "#c4e256"); grd.addColorStop(1, "#86bb30");
    g.fillStyle = grd; g.fill(shape);
    g.save(); g.clip(shape);
    // lengthwise shading toward the tips
    const vg = g.createLinearGradient(0, 0, 0, h); vg.addColorStop(0, "rgba(40,80,10,0.35)"); vg.addColorStop(0.3, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(60,90,10,0.25)");
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    // parallel veins (angled away from the midrib)
    g.strokeStyle = "rgba(70,110,20,0.35)"; g.lineWidth = 1.2;
    for (let y = 10; y < h; y += 7) { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + s * w * 0.25, y + 10, cx + s * w * 0.55, y + 26); g.stroke(); } }
    // torn slits
    g.globalCompositeOperation = "destination-out"; g.strokeStyle = "rgba(0,0,0,1)"; g.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) { const y = h * (0.15 + rnd() * 0.75), s = rnd() < 0.5 ? -1 : 1; g.beginPath(); g.moveTo(cx + s * w * 0.6, y + 26); g.quadraticCurveTo(cx + s * w * 0.3, y + 10, cx + s * w * (0.06 + rnd() * 0.1), y + 2); g.stroke(); }
    g.restore(); g.globalCompositeOperation = "source-over";
    // midrib
    g.strokeStyle = "#e8f0a8"; g.lineWidth = 7; g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, h); g.stroke();
    g.strokeStyle = "rgba(120,140,40,0.6)"; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 4, 0); g.lineTo(cx + 4, h); g.stroke();
  }, { repeat: false });
  return _leaf;
}
/** weathered dugout log: warm grey-brown, long grain streaks running along u, a few checks (cracks) and grey sun-bleach */
let _log: THREE.CanvasTexture | null = null;
export function logTex(): THREE.CanvasTexture {
  if (_log) return _log;
  _log = canvasTex(512, 256, (g, w, h) => {
    const rnd = mulberry(4747);
    g.fillStyle = "#7f6d5c"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { const y = rnd() * h, bh = 4 + rnd() * 22, L = 0.55 + rnd() * 0.25; g.fillStyle = `hsla(${28 + rnd() * 10}, ${10 + rnd() * 10}%, ${Math.round(L * 60)}%, 0.35)`; g.fillRect(0, y, w, bh); }
    for (let i = 0; i < 140; i++) { const y = rnd() * h, x = rnd() * w, len = 60 + rnd() * 260; g.strokeStyle = rnd() < 0.5 ? "rgba(60,40,25,0.35)" : "rgba(210,185,150,0.25)"; g.lineWidth = 0.8 + rnd() * 1.6; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * 6, x + len * 0.7, y + (rnd() - 0.5) * 6, x + len, y + (rnd() - 0.5) * 4); g.stroke(); }
    for (let i = 0; i < 9; i++) { const y = rnd() * h, x = rnd() * w; g.strokeStyle = "rgba(35,22,12,0.7)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + rnd() * 60, y + (rnd() - 0.5) * 3); g.stroke(); }   // checks
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(200,200,190,0.18)"); gr.addColorStop(0.5, "rgba(200,200,190,0)"); gr.addColorStop(1, "rgba(200,200,190,0.12)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  return _log;
}
/** red banner with a cream banana-leaf emblem */
let _flag: THREE.CanvasTexture | null = null;
export function flagTex(): THREE.CanvasTexture {
  if (_flag) return _flag;
  _flag = canvasTex(256, 168, (g, w, h) => {
    g.fillStyle = "#c8262a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.12)"; for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h);
    g.fillStyle = "#fff4dc"; g.save(); g.translate(w * 0.5, h * 0.52);
    for (let i = 0; i < 5; i++) { g.rotate((Math.PI * 2) / 5); g.beginPath(); g.ellipse(0, -h * 0.17, h * 0.07, h * 0.18, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
    g.fillStyle = "#8a1418"; g.fillRect(0, 0, 10, h);
  }, { repeat: false });
  return _flag;
}
/** materials for wood buckets (planks PBR set supplied by the caller) */
export function woodMaterials(planks: Promise<{ map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }>) {
  const wood = new THREE.MeshStandardMaterial({ color: "#c79a6a", roughness: 0.86, vertexColors: true });
  const logM = new THREE.MeshStandardMaterial({ color: "#9a6c42", roughness: 0.9, vertexColors: true });
  planks.then((s) => { for (const m of [wood, logM]) { m.map = s.map; m.normalMap = s.normalMap; m.roughnessMap = s.roughnessMap; m.needsUpdate = true; } wood.color.setRGB(0.86, 0.92, 0.96); logM.color.setRGB(0.66, 0.78, 0.84); });   // the planks map + warm vertex tints run red: pull red out → weathered warm grey-brown timber, never maroon
  const ropeM = new THREE.MeshStandardMaterial({ map: ropeTex(), roughness: 0.95, vertexColors: true, color: "#f6ead4" });
  const leafM = new THREE.MeshStandardMaterial({ map: bananaLeafTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.62, vertexColors: true, color: "#e8ffd0" });
  const clothM = new THREE.MeshStandardMaterial({ map: flagTex(), side: THREE.DoubleSide, roughness: 0.9 });
  // the dugout: weathered warm grey-brown log (matte, sun-bleached), never glossy maroon
  const hullM = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.93, vertexColors: true, side: THREE.DoubleSide, map: logTex() });
  planks.then((s) => { hullM.normalMap = s.normalMap; hullM.normalScale.setScalar(0.8); hullM.needsUpdate = true; });
  return { wood, log: logM, rope: ropeM, leaf: leafM, cloth: clothM, hull: hullM };
}
export type WoodMats = ReturnType<typeof woodMaterials>;

/** merge buckets into static meshes */
export function woodMeshes(b: WoodBuckets, m: WoodMats, name: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const add = (geos: Geo[], mat: THREE.Material, suffix: string, shadows = true) => { const g = merge(geos); if (!g) return; const mesh = new THREE.Mesh(g, mat); mesh.name = `${name}-${suffix}`; mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); out.push(mesh); };
  add(b.wood, m.wood, "wood"); add(b.log, m.log, "log"); add(b.rope, m.rope, "rope", false); add(b.cloth, m.cloth, "cloth"); add(b.hull, m.hull, "hull");
  const lg = merge(b.leaf);
  if (lg) { const mesh = new THREE.Mesh(lg, m.leaf); mesh.name = `${name}-leaf`; mesh.castShadow = true; mesh.receiveShadow = true; mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m.leaf.map, alphaTest: 0.5 }); out.push(mesh); }
  return out;
}
export { boxUVs };
