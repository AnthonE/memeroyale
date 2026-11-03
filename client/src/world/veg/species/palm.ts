// Coconut palm — the hero plant (beach, highlands, harbor fringe, aerial). The trunk follows the SHARED shape
// (shared/world/veg-scatter.ts palmShape / palmRadius — the server's trunk colliders use the same curve).
// Shape and look:
//   • every frond is a BROAD glossy blade folded along its rachis: the painted frond card (palm-frond-r on the beach
//     palms: leaflets fused into a wide blade with diagonal grooves and split edges; palm-frond-s on the warm highland
//     palm: 8–10 chunky strap leaflets per side) is cut down its midrib into two half-blades that leave the rachis
//     20–55° below the frond plane (the target art's inverted-V / gutter cross-section) and curl further down toward
//     their edges, so each frond reads as a 3D feather with a lit upper face and a shaded underside; a luminance normal
//     map makes the grooves catch the sun. A pale tapered rachis tube carries the midrib. LOD1 is the SAME blade with
//     fewer segments (no texture / shape pop at the switch), the impostor bakes LOD0.
//   • 6–8 big (≈0.3 m) brown nuts hang in a visible cluster below the frond bases on the beach palms; the warm
//     highland palm carries 5–6 glossy yellow (#d8c43a) nuts. The fibrous boot is small so the nuts show.
//   • trunks: pale grey-beige with soft leaf-scar rings (beach); the highland palm is the target art's stacked orange
//     cups — its ring collars / grooves are GEOMETRY (the silhouette steps at every ring), aligned with its texture.
// Variants: 0 / 1 beach, 2 upright = the orange "warm" highlands palm (Grass biome only); leaning 2 = S-curve.
import * as THREE from "three";
import { mulberry32 } from "../../../../../shared/world/noise";
import { palmShape, palmRadius } from "../../../../../shared/world/veg-scatter";
import { curveFrames, tube, finalize, mergeAll, type Frame } from "../geo";
import { foliageMaterial, type FoliageMaterials } from "../foliage-material";
import { coconut2, coconutYellow, palmBark2, strapFrond } from "../paint";
import { vegTex } from "../tex";
import type { Species } from "./types";

const D2R = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** frond card: texture id, physical width of the whole texture as a fraction of the frond length, fold / curl (deg) */
const FROND = {
  beach: { id: "palm-frond-r", wf: 0.42, fold0: 10, fold1: 42, curl: 30 },
  // (the highland hero: the chunky strap-leaflet card — the target art's highland crown is 8–10 broad separate leaflets
  // a side; its dark look was self-shadowing, fixed by the material's shadowLift / twoSide)
  // (the canvas STRAP card (paint.ts strapFrond — 7 broad strap
  // segments a side, fused at the rachis, pointed ends), broader, less folded so the straps show their faces)
  warm: { id: "strap", wf: 0.56, fold0: 8, fold1: 30, curl: 22 },
};

type PalmMats = Record<"bark" | "barkWarm" | "frond" | "frondWarm" | "coco" | "cocoYellow", FoliageMaterials>;
let mats: PalmMats | null = null;
function materials(): PalmMats {
  if (mats) return mats;
  const frond = (id: string, color: number | THREE.Color, o: { fill?: number; wrap?: number; trans?: number } = {}) => foliageMaterial({
    ...(id === "strap" ? (() => { const f = strapFrond(1); return { map: f.map, normalMap: f.normalMap }; })() : { map: vegTex(id), normalMap: vegTex(`${id}-n`, { data: true }) }),
    normalScale: 0.9, color, roughness: 0.3, translucency: o.trans ?? 0.85, transColor: 0xc8f040,
    // (fill / wrap low: the target art's crowns carry deep blue-green shade under the lit fronds — measured beach dark
    // share 0.11 vs the target art's 0.22)
    height: 11, sway: 0.35, bob: 0.22, flutter: 0.035, envMapIntensity: 0.6, fill: o.fill ?? 0.2, wrap: o.wrap ?? 0.3, alphaTest: 0.45, alphaMip: 0.3, twoSide: true, shadowLift: 0.6,
  });
  const bark = palmBark2(3, { hue: 34, light: 0.6, sat: 0.14 });
  mats = {
    bark: foliageMaterial({ map: bark.map, normalMap: bark.normalMap, normalScale: 0.9, color: 0xf4efe6, roughness: 0.78, height: 11, sway: 0.35, flutter: 0, envMapIntensity: 0.5, fill: 0.18, wrap: 0.25, doubleSide: false }),
    // highland palm: smooth orange-brown cups with bold tan ring collars
    // (× a cool tint — the lit orange texture read saturated carrot-orange; the target art's cups are brown-orange)
    barkWarm: foliageMaterial({ map: vegTex("bark-palm-hl", { repeat: true }), normalMap: vegTex("bark-palm-hl-n", { data: true, repeat: true }), normalScale: 1.4, color: new THREE.Color(0.95, 0.86, 0.8), sat: 0.66, roughness: 0.62, height: 11, sway: 0.35, flutter: 0, envMapIntensity: 0.6, fill: 0.14, wrap: 0.2, doubleSide: false }),
    frond: frond(FROND.beach.id, 0xffffff),
    // the highland hero crown: seen from below against the sky with the sun behind the camera — the target art's crown
    // is bright lime all over (strong fill + wrap + translucency, a yellower tint)
    frondWarm: frond(FROND.warm.id, new THREE.Color(1.08, 1.12, 0.78), { fill: 0.42, wrap: 0.6, trans: 1.25 }),
    // (the nuts hang in the crown's shade — more fill so the cluster reads mid-brown like the target art's)
    coco: foliageMaterial({ map: coconut2(1), color: new THREE.Color(1.25, 1.12, 1.0), roughness: 0.42, height: 11, sway: 0.35, flutter: 0, envMapIntensity: 0.75, fill: 0.5, wrap: 0.4, shadowLift: 0.6, doubleSide: false }),
    // (the young nuts hang in the crown's shade — a strong fill keeps them the target art's sunny #d8c43a, not khaki)
    cocoYellow: foliageMaterial({ map: coconutYellow(1), color: new THREE.Color(1.15, 1.08, 0.8), roughness: 0.3, height: 11, sway: 0.35, flutter: 0, envMapIntensity: 0.85, fill: 0.55, wrap: 0.45, shadowLift: 0.75, doubleSide: false }),
  };
  return mats;
}

export interface PalmOpts { leaning?: boolean; variant: number }

interface FrondSpec { yaw: number; pitch: number; droop: number; len: number; tw: number; col: [number, number, number]; phase: number; spear?: boolean; fold: number }

/** frame at fraction t (0..1) of a frame list (linear) */
function frameAt(fr: Frame[], t: number): { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; n: THREE.Vector3 } {
  const x = Math.min(fr.length - 1.0001, Math.max(0, t * (fr.length - 1))), i = Math.floor(x), f = x - i;
  const a = fr[i], b = fr[i + 1];
  return { p: a.p.clone().lerp(b.p, f), t: a.t.clone().lerp(b.t, f).normalize(), s: a.s.clone().lerp(b.s, f).normalize(), n: a.n.clone().lerp(b.n, f).normalize() };
}

export function buildPalm(o: PalmOpts): Species {
  const m = materials();
  const leaning = !!o.leaning;
  const shape = palmShape(o.variant, leaning);
  const { h, warm } = shape;
  const F = warm ? FROND.warm : FROND.beach;
  const rnd = mulberry32(1300 + o.variant * 23 + (leaning ? 700 : 0));
  const pts = shape.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const top = pts[pts.length - 1].clone();
  const topDir = top.clone().sub(pts[pts.length - 2]).normalize();
  // metres of trunk per texture tile: beach bark has two soft leaf-scar rings per tile (a ring every ~0.36 m, spacing
  // jittered ±25 % — a regular barber pole reads fake); the warm bark tile carries 3 rings (one every 0.5 m, regular)
  // (the hero's cups are as tall as the trunk is wide in the target art — 1.8 m per 3 rings)
  const TILE = warm ? 1.8 : 0.72;
  const rp1 = rnd() * 6.283, rp2 = rnd() * 6.283;
  const ringV = warm ? (d: number) => d / TILE : (d: number) => (d + 0.08 * TILE * Math.sin(d * 1.9 + rp1) + 0.03 * TILE * Math.sin(d * 4.3 + rp2)) / TILE;
  // warm cups: ring collars at v ≡ 0.026 (mod 1/3) in bark-palm-hl (measured from the texture)
  const cupPhase = (d: number) => { const q = ringV(d) * 3 - 0.078; return q - Math.floor(q); };
  // (every ring is an inverted CUP — narrow where it leaves the rim below,
  // widening steadily to a rounded rim that overhangs the next cup up; no collar bumps. p 0 = a cup's foot (tucked
  // under the rim below), p → 1 its rim)
  const cupK = (d: number) => {
    const p = cupPhase(d);
    // (a gentle profile swing: a deeper one reads as a stack of flower-pot cups)
    if (p < 0.9) return 0.94 + 0.1 * Math.pow(p / 0.9, 1.25);
    const k = (p - 0.9) / 0.1;                        // over the rim and back under it
    return 1.04 + 0.01 * Math.sin(k * Math.PI * 0.5) - 0.1 * smooth(0.35, 1, k);
  };
  /** cup shading: the foot of each cup sits in the rim's shadow, the rim catches the light */
  const cupShade = (d: number) => { const p = cupPhase(d); return p < 0.9 ? 0.8 + 0.24 * smooth(0, 0.85, p) : 1.04 - 0.2 * smooth(0.5, 1, (p - 0.9) / 0.1); };
  // the cup trunk samples its rings at fixed phases (collar, grooves, body) so every ring gets the same profile
  const cupFrames = () => {
    const dense = curveFrames(pts, Math.round(h * 24), 0.5), end = dense[dense.length - 1].d;
    const ds: number[] = [0];
    for (let k = 0; ; k++) {
      let stop = false;
      for (const p of [0.005, 0.3, 0.6, 0.82, 0.9, 0.95, 0.985]) { const d = 0.5 + TILE * (k + 0.078 + p) / 3; if (d >= end - 0.05) { stop = true; break; } if (d > 0.3) ds.push(d); }
      if (stop) break;
    }
    ds.push(end);
    let j = 0;
    return ds.map((d) => {
      while (j < dense.length - 2 && dense[j + 1].d < d) j++;
      const a = dense[j], b = dense[j + 1], f = Math.min(1, Math.max(0, (d - a.d) / Math.max(1e-6, b.d - a.d)));
      return { p: a.p.clone().lerp(b.p, f), t: a.t.clone().lerp(b.t, f).normalize(), s: a.s.clone().lerp(b.s, f).normalize(), n: a.n.clone().lerp(b.n, f).normalize(), d };
    });
  };
  const trunkGeo = (segs: number, radial: number, cups: boolean) => {
    const frames = cups ? cupFrames() : curveFrames(pts, segs, 0.5);
    return tube(frames, {
      radial,
      radius: (t, a) => { const d = frames[Math.round(t * (frames.length - 1))].d - 0.5; return palmRadius(shape, d, a) * (cups && d > 0.25 ? cupK(d) : 1); },
      v: (t) => ringV(frames[Math.round(t * (frames.length - 1))].d - 0.5),
      uRepeat: warm ? 1 : 2,
      color: (t) => {
        const ao = 0.62 + 0.38 * smooth(0.03, 0.12, t), crown = 1 - 0.35 * smooth(0.9, 1, t);
        const d = frames[Math.round(t * (frames.length - 1))].d - 0.5, cs = cups && d > 0.25 ? cupShade(d) : 1;
        return [ao * crown * cs, ao * crown * cs, ao * crown * cs];
      },
      capTop: true,
    });
  };

  // ---- a small fibrous boot (old frond bases) + a cluster of big nuts hanging right under the crown
  const bootR = warm ? 0.25 : 0.27;
  const bootGeo = (detail: number) => {
    const g = new THREE.IcosahedronGeometry(bootR, detail);
    g.scale(1.1, 1.0, 1.1);
    const p = g.attributes.position as THREE.BufferAttribute;
    const r2 = mulberry32(7 + o.variant);
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.88 + r2() * 0.24), p.getY(i) * (0.9 + r2() * 0.2), p.getZ(i) * (0.88 + r2() * 0.24));
    g.computeVertexNormals();
    g.translate(top.x, top.y - 0.02, top.z);
    return finalize(g, { color: (_i, q) => { const a = (0.45 + 0.4 * smooth(top.y - 0.35, top.y + 0.25, q.y)) * 0.8; return [a * 0.95, a * 0.78, a * 0.6]; } });
  };
  // (the target art has 6–8 big nuts per crown): 7–9 (beach) / 6–7 (highland)
  // nuts hanging OUT from under the boot in two tiers, so a cluster reads from every side below the frond fan
  const nNuts = warm ? 6 + Math.floor(rnd() * 2) : 7 + Math.floor(rnd() * 3);
  const side0 = rnd() * Math.PI * 2;
  const nutSpec = Array.from({ length: nNuts }, (_, i) => {
    // two tiers around ~3/4 of the trunk, just below the boot: the target art's bunch of big nuts reads as one cluster
    const tier = i % 2, a = side0 + (i / nNuts) * Math.PI * 2 + (rnd() - 0.5) * 0.35 + tier * 0.45;
    // (the highland nuts are the target art's big glossy yellow cluster hanging clear of the frond bases)
    const r = (warm ? 0.26 : 0.195) + rnd() * 0.025;
    const rr = shape.r0 * (warm ? 0.7 : 0.85) + r * (tier ? 0.95 : 1.3) + 0.05;
    return { a, rr, dy: bootR * 0.85 + r * 0.8 + tier * r * 1.3 + rnd() * 0.08 + (warm ? 0.38 : 0), r, tilt: (rnd() - 0.5) * 0.7, tone: 0.86 + rnd() * 0.24 };
  });
  const cocoGeo = (wSeg: number, hSeg: number) => mergeAll(nutSpec.map((s) => {
    const g = new THREE.SphereGeometry(s.r, wSeg, hSeg);
    g.scale(0.94, 1.1, 0.94);
    g.rotateX(s.tilt); g.rotateZ(s.tilt * 0.7);
    g.translate(top.x + Math.cos(s.a) * s.rr, top.y - s.dy, top.z + Math.sin(s.a) * s.rr);
    return finalize(g, { color: [s.tone, s.tone * 0.97, s.tone * 0.94] });
  }));

  // ---- fronds: 13–15 on jittered even yaws, plus 2 young spears (the highland hero: 10–11 broad strap fronds, longer
  // and heavier — they arch out and hang like the target art's — and ONE small unfolded spear: the two folded spears
  // drew a stiff tent on top of the crown)
  const count = warm ? 10 + Math.floor(rnd() * 2) : 13 + Math.floor(rnd() * 3);
  const specs: FrondSpec[] = [];
  const order = Array.from({ length: count }, (_, i) => i).sort(() => rnd() - 0.5);
  for (let i = 0; i < count; i++) {
    const r = order[i] / (count - 1);          // 0 = top / youngest … 1 = lowest / oldest (shuffled around the crown)
    const yaw = (i / count) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI * 2 / count) * 0.8;
    // sun-kissed lime top fronds → cooler blue-green low fronds (the target art's crown value split)
    const warmth = 1 - r;
    const b = (0.98 + rnd() * 0.12) * (1 - 0.12 * r);
    specs.push({
      yaw,
      // a fountain: young fronds reach up, the rest arc out and hang, the oldest droop well below the crown
      // (warm hero: the fronds leave the crown flatter and hang only toward their tips — a curtain of
      // steeply drooping frond bases hid the target art's yellow nut cluster from the trail below)
      pitch: (52 - 64 * r + (warm ? 14 * r : 0)) * D2R + (rnd() - 0.5) * 12 * D2R,
      droop: (66 + 30 * r + (warm ? 14 : 0)) * D2R + (rnd() - 0.5) * 14 * D2R,
      len: (4.3 + rnd() * 0.9) * (0.9 + 0.1 * r) * (h / 10) ** 0.2 * (warm ? 1.08 : 1),
      tw: (rnd() - 0.5) * 0.35,
      col: [b * (0.93 + 0.1 * warmth), b * (0.97 + 0.04 * warmth), b * (0.94 - 0.1 * warmth)],
      phase: rnd() * 6.283,
      fold: 0.9 + rnd() * 0.25 + 0.15 * r,
    });
  }
  for (let i = 0; i < (warm ? 1 : 2); i++) specs.push({ yaw: rnd() * 6.283, pitch: (warm ? 62 : 72 + rnd() * 10) * D2R, droop: (warm ? 34 : 18) * D2R, len: (2.3 + rnd() * 0.6) * (warm ? 0.8 : 1), tw: rnd() * 3, col: [1.04, 1.06, 0.92], phase: rnd() * 6.283, spear: true, fold: warm ? 0.7 : 2.2 });

  // crown basis: tilt the crown slightly with the trunk top direction
  const up = new THREE.Vector3(0, 1, 0).lerp(topDir, 0.4).normalize();
  const e1 = new THREE.Vector3(1, 0, 0).sub(up.clone().multiplyScalar(up.x)).normalize();
  const e2 = new THREE.Vector3().crossVectors(up, e1);
  const rachisPts = (f: FrondSpec) => {
    const dirXZ = e1.clone().multiplyScalar(Math.cos(f.yaw)).addScaledVector(e2, Math.sin(f.yaw));
    let p = top.clone().addScaledVector(dirXZ, 0.1).addScaledVector(up, 0.06);
    const fp = [p.clone()];
    const S = 12;
    for (let i = 1; i <= S; i++) {
      const t = i / S;
      const pitch = f.pitch - f.droop * Math.pow(t, f.spear ? 1.4 : warm ? 2.3 : 1.9);   // arch out first, the tip hangs
      p = p.clone().addScaledVector(dirXZ, Math.cos(pitch) * f.len / S).addScaledVector(up, Math.sin(pitch) * f.len / S);
      fp.push(p);
    }
    return fp;
  };

  /**
   * One frond: two half-blades (texture u 0.5 → 0 and 0.5 → 1) hanging off the rachis. `along` segments down the
   * frond, `across` from the rachis to the leaflet tips; the cross-section leaves the rachis `fold` degrees below the
   * frond plane (steeper toward the tip) and curls further down toward the edge. + an optional rachis tube.
   */
  const frondGeo = (f: FrondSpec, along: number, across: number, rachis: number) => {
    const gs: THREE.BufferGeometry[] = [];
    const fr = curveFrames(rachisPts(f), 24, 0.5);
    const W = F.wf * f.len * 0.5 * (f.spear ? 0.55 : 1);                     // texture half-width in metres
    const bendAt = (t: number) => Math.pow(t, 1.35);
    if (rachis > 0) {
      const rach = tube(curveFrames(rachisPts(f), 6, 0.5), { radial: rachis, radius: (t) => lerp(0.05, 0.012, t), v: (t) => t, uRepeat: 0, bend: bendAt, phase: f.phase, color: (t) => { const a = 0.78 + 0.22 * smooth(0, 0.3, t); return [f.col[0] * a, f.col[1] * a, f.col[2] * a]; } });
      const uv = rach.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5);
      gs.push(rach);
    }
    for (const side of [-1, 1]) {
      const pos: number[] = [], uvs: number[] = [], col: number[] = [], bend: number[] = [], ph: number[] = [], idx: number[] = [];
      for (let i = 0; i <= along; i++) {
        const t = i / along, F0 = frameAt(fr, t);
        const tw = f.tw * t;
        const Sd = F0.s.clone().multiplyScalar(Math.cos(tw)).addScaledVector(F0.n, Math.sin(tw));
        const N = F0.n.clone().multiplyScalar(Math.cos(tw)).addScaledVector(F0.s, -Math.sin(tw));
        // fold below the frond plane: shallow at the base, steep toward the tip (the leaflets hang)
        const fold = (lerp(F.fold0, F.fold1, smooth(0.05, 0.85, t)) * f.fold) * D2R;
        let x = 0, y = 0;
        for (let j = 0; j <= across; j++) {
          const a = j / across;
          if (j > 0) {
            const th = Math.min(88 * D2R, fold + F.curl * D2R * Math.pow((j - 0.5) / across, 1.3) * (0.6 + 0.6 * t));
            x += Math.cos(th) * W / across; y -= Math.sin(th) * W / across;
          }
          const P = F0.p.clone().addScaledVector(Sd, side * (x + 0.012)).addScaledVector(N, y);
          pos.push(P.x, P.y, P.z);
          uvs.push(0.5 + side * 0.5 * a, t);
          const ao = (0.6 + 0.4 * smooth(0, 0.22, t)) * (0.92 + 0.08 * a);
          col.push(f.col[0] * ao, f.col[1] * ao, f.col[2] * ao);
          bend.push(bendAt(t) + 0.3 * a * t);
          ph.push(f.phase);
        }
      }
      const st = across + 1;
      for (let i = 0; i < along; i++) for (let j = 0; j < across; j++) {
        const k = i * st + j;
        if (side > 0) idx.push(k, k + 1, k + st, k + 1, k + st + 1, k + st); else idx.push(k, k + st, k + 1, k + 1, k + st, k + st + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute("aBend", new THREE.Float32BufferAttribute(bend, 1));
      g.setAttribute("aPhase", new THREE.Float32BufferAttribute(ph, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      gs.push(g);
    }
    return mergeAll(gs);
  };
  const crownGeo = (along: number, across: number, rachis: number) => mergeAll(specs.map((f) => frondGeo(f, f.spear ? Math.max(3, along - 3) : along, across, rachis)));

  const barkM = warm ? m.barkWarm : m.bark;
  const cocoM = warm ? m.cocoYellow : m.coco;
  // draw calls: bark, nuts + boot, fronds at LOD0; bark (+ low nuts + boot) and the same fronds (fewer segments) at LOD1
  const parts: Species["parts"] = [
    // (15 sides, no saw-teeth under 1 m — the 5 root knuckles land on whole facets; nuts 12 × 8)
    { name: "bark", mats: barkM, lod0: trunkGeo(Math.round(h * 3.4), 15, warm), lod1: mergeAll([trunkGeo(14, 9, false), bootGeo(0), cocoGeo(6, 3)]) },   // (14 × 9: a hexagonal, chorded LOD1 trunk misses the bullet boxes)
    { name: "coco", mats: cocoM, lod0: mergeAll([bootGeo(1), cocoGeo(12, 8)]), lod1: new THREE.BufferGeometry(), shadow: false },
    { name: "frond", mats: warm ? m.frondWarm : m.frond, lod0: crownGeo(10, 3, 3), lod1: crownGeo(5, 2, 0) },
  ];
  const box = new THREE.Box3();
  for (const p of parts) if (p.lod0.attributes.position) { p.lod0.computeBoundingBox(); box.union(p.lod0.boundingBox!); }
  const center = box.getCenter(new THREE.Vector3());
  const boundR = box.getSize(new THREE.Vector3()).length() / 2;
  return {
    id: `${leaning ? "palm-leaning" : "palm"}:${o.variant}`, kind: leaning ? "palm-leaning" : "palm", variant: o.variant,
    parts, height: box.max.y, radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z), center, boundR,
    // (the warm highland palms are few and stand alone on the meadows: their cup rings stay modelled out to 36 m)
    // (perf: non-hero palms switch from LOD0 to LOD1 at 14 m — 52–55 k tris of background palms at
    // the jungle view; LOD1 keeps the same blades with fewer segments, so the switch reads as nothing)
    lod0: warm ? 36 : 14, lod1: 85, impostor: true, shadow: true,
  };
}
