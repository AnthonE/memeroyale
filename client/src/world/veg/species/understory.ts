// Understory: banana plant (pseudostem + huge torn paddle leaves + banana bunch & purple bud), giant monstera, fern,
// flowers (red bromeliad rosette / heliconia clump / wildflower tuft). Leaves are curved, V-keeled ribbons carrying
// the painted leaf textures (each texture is laid out stem-at-the-bottom, so the ribbon's v runs base → tip).
import * as THREE from "three";
import { mulberry32 } from "../../../../../shared/world/noise";
import { curveFrames, tube, ribbon, finalize, mergeAll } from "../geo";
import { foliageMaterial, type FoliageMaterials } from "../foliage-material";
import { flatTexture } from "../textures";
import { meadowFlowers } from "../paint";
import { vegTex } from "../tex";
import { BANANA_TINT } from "../detail-gen";
import type { Species } from "./types";

const D2R = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type UMats = Record<"bananaLeaf" | "bananaLeafB" | "bananaStem" | "bunch" | "monstera" | "stem" | "fern" | "bromeliad" | "heliconia" | "heliLeaf" | "wild", FoliageMaterials>;
let mats: UMats | null = null;
function materials(): UMats {
  if (mats) return mats;
  const leaf = (id: string, o: Partial<Parameters<typeof foliageMaterial>[0]> = {}) => foliageMaterial({
    map: vegTex(id), roughness: 0.36, translucency: 0.85, transColor: 0xc4ff4a, height: 3.5, sway: 0.1, bob: 0.1, flutter: 0.03,
    // (fill 0.46, wrap 0.6 — the target art's understory leaves stay luminous lime in the shade;
    // the jungle view measured V p50 0.23 against the target art's 0.31)
    // (+ a little of the sun back in the canopy's shade: the target art's understory glows lime under the trees)
    envMapIntensity: 0.55, fill: 0.46, wrap: 0.6, alphaTest: 0.45, shadowLift: 0.3, ...o,
  });
  mats = {
    // (backlit lime translucency: the banana paddles in the target art's jungle
    // glow lime even where the canopy shades them — most of the sun back into their shadow + a stronger glow; the
    // jungle view's right third measured V p75 .35 against the target art's .48)
    // (dry yellow → brown margins / tips per leaf and per plant — foliage-material F_SENESCE)
    bananaLeaf: leaf("banana-leaf", { shadowLift: 0.75, translucency: 1.2, senesce: BANANA_TINT ? 1 : 0 }),
    bananaLeafB: leaf("banana-leaf-b", { shadowLift: 0.75, translucency: 1.2, senesce: BANANA_TINT ? 1 : 0 }),
    // pseudostem: overlapping yellow-green leaf sheaths with brown dried streaks and blotches (painted tile + normal)
    bananaStem: foliageMaterial({ map: vegTex("banana-stem", { repeat: true }), normalMap: vegTex("banana-stem-n", { data: true, repeat: true }), normalScale: 1.1, color: 0xe8ecd0, roughness: 0.6, height: 3.5, sway: 0.1, flutter: 0, envMapIntensity: 0.5, fill: 0.2, wrap: 0.3, doubleSide: false }),
    // one mesh for the whole bunch: fingers, stalk and bud coloured by vertex colour on a white map
    // (golden, not khaki — the bunch hangs in the plant's shade; strong fill, little sky sheen)
    // (banana fruit toward #f2b422 with AO between the fingers: the colour lives in the vertex
    // colours — golden body, green-tinged base, dark tip, contact AO where the fingers crowd the stalk)
    // (the bunch hangs in its own leaves' shade — most of the sun back, a golden fill)
    // (the sky sheen washed the gold out to beige: less of it, a satin finish)
    bunch: foliageMaterial({ map: flatTexture("#ffffff"), color: new THREE.Color(1.15, 1.0, 0.9), roughness: 0.55, height: 3.5, sway: 0.1, flutter: 0, envMapIntensity: 0.12, fill: 0.75, wrap: 0.5, shadowLift: 0.8, doubleSide: false, sat: 1.25 }),
    // (the deep-emerald paint × gloss reads as near-black plastic: lifted to mid-green, matte-er, lime rim)
    // (no plastic specular sheen on the monstera: roughness +0.25, glint and sky sheen −50 %)
    monstera: leaf("monstera-leaf", { color: new THREE.Color(1.55, 1.55, 0.88), roughness: 0.87, specK: 0.5, translucency: 0.7, transColor: 0xb4f050, height: 1.8, sway: 0.03, bob: 0.05, flutter: 0.015, envMapIntensity: 0.32, fill: 0.5, shadowLift: 0.6 /* no shrink band — the understory impostor carries it out to the band */ }),
    stem: foliageMaterial({ map: flatTexture("#5a9a34"), roughness: 0.55, height: 1.8, sway: 0.03, bob: 0.05, flutter: 0, envMapIntensity: 0.5, fill: 0.2 }),
    fern: leaf("fern-frond", { roughness: 0.5, translucency: 0.75, transColor: 0xb8ff50, height: 1, sway: 0.02, bob: 0.06, flutter: 0.03, envMapIntensity: 0.7, fadeFar: [12, 34], matte: true, shadowLift: 0.55 }),
    bromeliad: leaf("bromeliad-leaf", { color: new THREE.Color(1.25, 1.1, 1.1), roughness: 0.35, translucency: 0.6, transColor: 0xff5a70, height: 0.8, sway: 0.01, bob: 0.02, flutter: 0.01, envMapIntensity: 0.9, fadeFar: [14, 38] }),
    // (heliconias are 1.4–2 m — no shrink band, an understory impostor instead)
    heliconia: leaf("heliconia", { roughness: 0.35, translucency: 0.35, transColor: 0xffa040, height: 1.5, sway: 0.03, bob: 0.03, flutter: 0.01, envMapIntensity: 0.9 }),
    heliLeaf: leaf("banana-leaf-b", { height: 1.5, sway: 0.03, bob: 0.05, flutter: 0.02, shadowLift: 0.6, senesce: BANANA_TINT ? 0.6 : 0 }),
    // meadow wildflowers: small white daisies + yellow buttercups on thin stems (canvas) — not a bouquet sticker
    wild: foliageMaterial({ map: meadowFlowers(1), roughness: 0.55, translucency: 0.45, transColor: 0xd8ff70, height: 0.5, sway: 0.03, bob: 0.04, flutter: 0.02, envMapIntensity: 0.5, fill: 0.34, wrap: 0.5, alphaTest: 0.45, matte: true, fadeFar: [14, 38] }),
  };
  return mats;
}

/** a big leaf: arc from `base` toward yaw/pitch with droop; `aspect` = texture width/height (ribbon full width = len·aspect) */
function leafRibbon(rnd: () => number, base: THREE.Vector3, yaw: number, pitch0: number, droop: number, len: number, aspect: number, o: { across: number; fold: number; segs: number; bend?: number; curl?: number; phase?: number; tint?: number; ao?: number; twist?: number; /** leaf age 0 (young) … 1 (old) for the dry-margin ramp (foliage-material VEG_SENESCE): encoded in the colour's blue / red ratio 0.97 → 0.91 */ age?: number }) {
  const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const pts = [base.clone()];
  let p = base.clone();
  const S = 10;
  for (let i = 1; i <= S; i++) {
    const t = i / S, pitch = pitch0 - droop * Math.pow(t, 1.35);
    p = p.clone().addScaledVector(dir, Math.cos(pitch) * len / S).add(new THREE.Vector3(0, Math.sin(pitch) * len / S, 0));
    pts.push(p);
  }
  const tint = o.tint ?? 1, ao0 = o.ao ?? 0.6, bk = 0.97 - 0.06 * Math.min(1, Math.max(0, o.age ?? 0));
  const tw = o.twist ?? (rnd() - 0.5) * 0.3;
  return ribbon(curveFrames(pts, o.segs), {
    across: o.across, width: () => len * aspect * 0.5, fold: () => o.fold, curl: () => o.curl ?? 0, twist: (t) => tw * t,
    bend: (t) => Math.pow(t, 1.3) * (o.bend ?? 0.6), phase: o.phase ?? rnd() * 6.283,
    color: (t) => { const ao = (ao0 + (1 - ao0) * smooth(0, 0.35, t)) * tint; return [ao, ao, ao * bk]; },
  });
}

export function buildBanana(variant: number): Species {
  const m = materials();
  const rnd = mulberry32(5000 + variant * 11);
  const h = 2.6 + rnd() * 1.0;
  const stemPts = [new THREE.Vector3(0, -0.25, 0), new THREE.Vector3((rnd() - 0.5) * 0.12, h * 0.5, (rnd() - 0.5) * 0.12), new THREE.Vector3((rnd() - 0.5) * 0.2, h, (rnd() - 0.5) * 0.2)];
  const top = stemPts[2];
  // pseudostem: a round, slightly swollen sheath column (layered sheath stripes in the texture), darker at the foot
  const stem = (radial: number, segs: number) => tube(curveFrames(stemPts, segs), {
    radial, radius: (t) => (0.16 * (1 - 0.3 * t) + 0.06 * Math.pow(Math.max(0, 1 - t / 0.12), 2)) * (1 + 0.06 * Math.sin(t * 9)),
    v: (_t, d) => d / 1.1, uRepeat: 1, color: (t) => { const ao = 0.55 + 0.45 * smooth(0, 0.3, t); return [ao, ao, ao * 0.95]; }, capTop: true,
  });
  const nLeaves = 8 + Math.floor(rnd() * 3);
  const leafSpec = Array.from({ length: nLeaves }, (_, i) => {
    const r = i / (nLeaves - 1);                // 0 = youngest (upright centre) … 1 = oldest (lowest)
    return { r, yaw: (i / nLeaves) * Math.PI * 2 + (rnd() - 0.5) * 0.6, pitch0: (74 - 88 * r) * D2R + (rnd() - 0.5) * 10 * D2R, len: (2.1 + rnd() * 0.5) * (0.78 + 0.22 * Math.min(1, r * 2)) * (h / 3), tint: 0.92 + rnd() * 0.16, droop: (40 + 38 * r) * D2R, ph: rnd() * 6.283, tw: (rnd() - 0.5) * 0.3 };
  });
  const petioles = (radial: number) => mergeAll(leafSpec.map((L) => {
    const d = new THREE.Vector3(Math.cos(L.yaw), 0, Math.sin(L.yaw));
    const a = top.clone().add(new THREE.Vector3(0, -0.12 - 0.12 * L.r, 0));
    const b = a.clone().addScaledVector(d, 0.34 * Math.cos(L.pitch0)).add(new THREE.Vector3(0, 0.34 * Math.sin(L.pitch0), 0));
    return tube(curveFrames([a, a.clone().lerp(b, 0.5), b], 2), { radial, radius: (t) => 0.04 * (1 - 0.35 * t), v: (_t, dd) => dd, color: () => [0.62, 0.78, 0.42] });
  }));
  const leaves = (segs: number, across: number) => mergeAll(leafSpec.map((L) => {
    const d = new THREE.Vector3(Math.cos(L.yaw), 0, Math.sin(L.yaw));
    const base = top.clone().add(new THREE.Vector3(0, -0.12 - 0.12 * L.r, 0)).addScaledVector(d, 0.32 * Math.cos(L.pitch0)).add(new THREE.Vector3(0, 0.32 * Math.sin(L.pitch0), 0));
    return leafRibbon(rnd, base, L.yaw, L.pitch0, L.droop, L.len, 0.5, { across, fold: 0.14, segs, bend: 0.55, curl: -0.1, tint: L.tint, ao: 0.62, phase: L.ph, twist: L.tw, age: BANANA_TINT ? L.r : 0 });
  }));
  // banana bunch (a DENSE golden cone, not sparse pale
  // fingers along a long stalk): ONE mesh — a thick stalk arching out of the top of the pseudostem and dropping
  // straight down; 7 tight hands of 11–13 plump fingers spiralling up a 0.75 m fruit section, each finger leaving the
  // stalk sideways and curving UP (the fruit points to the light), golden #f2b422 with a green-tinged base, a dark
  // tip and contact AO where the fingers crowd the stalk; the purple bud hangs below on a short bare stalk
  const bunch = (hands: number, per: number, radial: number, segs: number) => {
    const gs: THREE.BufferGeometry[] = [];
    const rb = mulberry32(5100 + variant);
    const sa = top.clone().add(new THREE.Vector3(0.05, -0.1, 0.03)), sb = top.clone().add(new THREE.Vector3(0.36, 0.02, 0.12));
    const sc = top.clone().add(new THREE.Vector3(0.5, -0.3, 0.17)), sd = top.clone().add(new THREE.Vector3(0.52, -1.25, 0.18));
    const stalk = curveFrames([sa, sb, sc, sd], 12);
    gs.push(tube(stalk, { radial: 6, radius: (u) => 0.05 * (1 - 0.35 * u), color: () => [0.4, 0.46, 0.2] }));
    // the fruit section: from 0.3 m below the arch down 0.75 m
    const f0 = sc.clone().add(new THREE.Vector3(0, -0.12, 0)), f1 = sc.clone().add(new THREE.Vector3(0.015, -0.82, 0.005));
    const up = new THREE.Vector3(0, 1, 0);
    for (let hI = 0; hI < hands; hI++) {
      const q = hI / Math.max(1, hands - 1);
      const c = f0.clone().lerp(f1, q);
      // (the hands shrink toward the bottom: a cone, widest at the top)
      // (long, plump fingers leaving the stalk wide — otherwise from the front the bunch reads as a thin
      // column of small fingers; the target art's is a fat golden cone ~0.45 m across)
      const L = 0.28 * (1 - 0.45 * q), rr = 0.075 * (1 - 0.3 * q);
      const n = Math.max(3, Math.round(per * (1 - 0.25 * q)));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + hI * 1.05 + (rb() - 0.5) * 0.3;
        const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const p0 = c.clone().addScaledVector(out, rr * 0.6).addScaledVector(up, -0.02);
        const p1 = p0.clone().addScaledVector(out, L * 0.32).addScaledVector(up, L * 0.02);
        const p2 = p1.clone().addScaledVector(out, L * 0.24).addScaledVector(up, L * 0.3);
        const p3 = p2.clone().addScaledVector(out, L * 0.02).addScaledVector(up, L * 0.4);
        const tone = 0.93 + 0.12 * rb();
        gs.push(tube(curveFrames([p0, p1, p2, p3], segs), {
          radial, radius: (u) => (u < 0.1 ? 0.016 + u * 0.24 : 0.04 * (1 - 0.62 * Math.pow(Math.max(0, u - 0.5) / 0.5, 1.7))) * (1 + 0.06 * (rb() - 0.5)),
          color: (u, ang) => {
            if (u > 0.95) return [0.14, 0.08, 0.02];
            // contact AO toward the stalk and on the finger's underside
            const ao = (0.42 + 0.58 * smooth(0.02, 0.45, u)) * (0.86 + 0.14 * Math.sin(ang));
            const g = smooth(0.05, 0.3, u);            // green-yellow base → golden body
            return [(0.55 + 0.45 * g) * tone * ao, (0.5 + 0.1 * g) * tone * ao, 0.035 * ao];
          },
          capTop: true,
        }));
      }
    }
    // bare stalk below the fruit + the purple bud with a pale bract
    const bud = new THREE.ConeGeometry(0.075, 0.26, 7, 1);
    bud.rotateX(Math.PI); bud.translate(sd.x, sd.y - 0.1, sd.z);
    gs.push(finalize(bud, { color: [0.3, 0.07, 0.15] }));
    return mergeAll(gs);
  };
  const withBunch = variant % 2 === 0;
  const leafM = variant % 2 ? m.bananaLeaf : m.bananaLeafB;
  const parts: Species["parts"] = [
    { name: "stem", mats: m.bananaStem, shadow: false, lod0: mergeAll([stem(10, 5), petioles(7)]) /* round petioles, not square */, lod1: withBunch ? mergeAll([stem(5, 2), bunch(3, 6, 3, 1)]) : stem(5, 2) },
    { name: "leaf", mats: leafM, lod0: leaves(9, 3), lod1: leaves(4, 1) },
  ];
  if (withBunch) parts.push({ name: "bunch", mats: m.bunch, lod0: bunch(7, 12, 5, 3), lod1: new THREE.BufferGeometry(), shadow: false });   // ~74 fingers ≈ 2.8 k tris
  const box = new THREE.Box3();
  for (const p of parts) { p.lod0.computeBoundingBox(); box.union(p.lod0.boundingBox!); }
  return {
    id: `banana-plant:${variant}`, kind: "banana-plant", variant, parts, height: box.max.y, radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z), center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    lod0: 20, lod1: 55, impostor: true, shadow: true,
  };
}

export function buildMonstera(variant: number): Species {
  const m = materials();
  const rnd = mulberry32(6000 + variant * 5);
  const n = 7 + Math.floor(rnd() * 4);
  const spec = Array.from({ length: n }, (_, i) => ({ yaw: i * 2.39996 + rnd() * 0.5, hgt: 0.55 + rnd() * 0.85, out: 0.3 + rnd() * 0.45, L: 0.85 + rnd() * 0.55, pitch: (18 + rnd() * 34) * D2R, droop: (35 + rnd() * 30) * D2R, tint: 0.9 + rnd() * 0.18, ph: rnd() * 6.283 }));
  const stems = (radial: number) => mergeAll(spec.map((s) => {
    const p = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(s.yaw) * s.out * 0.4, s.hgt * 0.65, Math.sin(s.yaw) * s.out * 0.4), new THREE.Vector3(Math.cos(s.yaw) * s.out, s.hgt, Math.sin(s.yaw) * s.out)];
    return tube(curveFrames(p, 3), { radial, radius: (t) => 0.024 * (1 - 0.3 * t), color: () => [0.8, 0.8, 0.8], bend: (t) => t * 0.3, phase: s.ph });
  }));
  const leaves = (segs: number, across: number) => mergeAll(spec.map((s) => {
    const base = new THREE.Vector3(Math.cos(s.yaw) * s.out, s.hgt, Math.sin(s.yaw) * s.out);
    return leafRibbon(rnd, base, s.yaw, s.pitch, s.droop, s.L, 1.0, { across, fold: 0.1, segs, bend: 0.35, curl: 0.06, tint: s.tint, ao: 0.72, phase: s.ph, twist: 0 });
  }));
  const parts = [
    { name: "stem", mats: m.stem, lod0: stems(4), lod1: new THREE.BufferGeometry() },   // sub-pixel beyond LOD0
    { name: "leaf", mats: m.monstera, lod0: leaves(6, 3), lod1: leaves(3, 1) },
  ];
  const box = new THREE.Box3();
  for (const p of parts) { p.lod0.computeBoundingBox(); box.union(p.lod0.boundingBox!); }
  return {
    id: `monstera:${variant}`, kind: "monstera", variant, parts, height: box.max.y, radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z), center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    lod0: 18, lod1: 45, impostor: true,   // (an impostor, not a shrink-out: the plant is 1.8 m tall)
  };
}

export function buildFern(variant: number): Species {
  const m = materials();
  const rnd = mulberry32(7000 + variant * 3);
  const fronds = (segs: number, across: number) => {
    const r2 = mulberry32(7100 + variant);
    const gs: THREE.BufferGeometry[] = [];
    const n = 9 + Math.floor(r2() * 3);
    for (let i = 0; i < n; i++) {
      const r = i / (n - 1), yaw = i * 2.39996 + r2() * 0.4;
      const L = (0.9 + r2() * 0.5) * (variant ? 1.15 : 1);
      gs.push(leafRibbon(r2, new THREE.Vector3(0, 0.04, 0), yaw, (70 - 50 * r) * D2R, (70 + 40 * r) * D2R, L, 0.5, { across, fold: 0.22, segs, bend: 0.8, tint: 0.9 + r2() * 0.2, ao: 0.55 }));
    }
    return mergeAll(gs);
  };
  void rnd;
  const parts = [{ name: "frond", mats: m.fern, lod0: fronds(4, 2), lod1: fronds(2, 1) }];
  const box = new THREE.Box3(); parts[0].lod0.computeBoundingBox(); box.union(parts[0].lod0.boundingBox!);
  return {
    id: `fern:${variant}`, kind: "fern", variant, parts, height: box.max.y, radius: 1.3, center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    lod0: 12, lod1: 34, impostor: false,
  };
}

/** crossed upright cards (flowers, heliconia) rooted at y = 0 */
function crossCards(rnd: () => number, n: number, w: number, h: number, spread = 0.2, bend = 0.4, aoMin = 0.6): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(w, h, 1, 3);
    g.translate(0, h / 2 - 0.02, 0);
    g.rotateX((rnd() - 0.5) * 0.25);
    g.rotateY((i / n) * Math.PI + rnd() * 0.4);
    g.translate((rnd() - 0.5) * spread, 0, (rnd() - 0.5) * spread);
    const ph = rnd() * 6.283;
    gs.push(finalize(g, { color: (_i, p) => { const ao = aoMin + (1 - aoMin) * smooth(0, 0.4, p.y / h); return [ao, ao, ao]; }, bend: (_i, p) => Math.pow(Math.max(0, p.y / h), 2) * bend, phase: ph }));
  }
  return mergeAll(gs);
}

export function buildFlowers(variant: number): Species {
  const m = materials();
  const rnd = mulberry32(8000 + variant * 3);
  const parts: Species["parts"] = [];
  const kind = variant % 3;
  if (kind === 0) {
    // red bromeliad rosette
    const rosette = (segs: number) => {
      const r2 = mulberry32(8100 + variant);
      const gs: THREE.BufferGeometry[] = [];
      // (a 0.7–0.9 m rosette of 14 broad arching straps, not red specks)
      const n = 11;
      for (let i = 0; i < n; i++) {
        const r = i / (n - 1), yaw = i * 2.39996;
        const L = 0.5 + 0.36 * r + r2() * 0.08;
        gs.push(leafRibbon(r2, new THREE.Vector3(0, 0.03, 0), yaw, (78 - 60 * r) * D2R, (30 + 38 * r) * D2R, L, 0.3, { across: segs > 2 ? 2 : 1, fold: 0.3, segs, bend: 0.3, tint: 1.05 + r2() * 0.1, ao: 0.75 }));
      }
      return mergeAll(gs);
    };
    parts.push({ name: "rosette", mats: m.bromeliad, lod0: rosette(3), lod1: rosette(2) });
  } else if (kind === 1) {
    // heliconia clump: broad torn leaves + orange/yellow bract stalks
    const leaves = (segs: number) => {
      const r2 = mulberry32(8200 + variant);
      const gs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) {
        const yaw = i * 2.39996 + r2() * 0.4, L = 0.95 + r2() * 0.45;
        gs.push(leafRibbon(r2, new THREE.Vector3(0, 0.05, 0), yaw, (72 - 36 * (i / 5)) * D2R, 58 * D2R, L, 0.5, { across: 2, fold: 0.18, segs, bend: 0.4, tint: 0.95, ao: 0.6, age: BANANA_TINT ? i / 5 : 0 }));
      }
      return mergeAll(gs);
    };
    parts.push({ name: "leaf", mats: m.heliLeaf, lod0: leaves(7), lod1: leaves(3) }, { name: "bract", mats: m.heliconia, lod0: crossCards(rnd, 3, 0.55, 1.1, 0.35, 0.25), lod1: crossCards(rnd, 2, 0.55, 1.1, 0.35, 0.25) });
  } else {
    // wildflower tuft (highlands / meadow)
    parts.push({ name: "wild", mats: m.wild, lod0: crossCards(rnd, 3, 0.55, 0.55, 0.12, 0.5, 0.88), lod1: crossCards(rnd, 2, 0.55, 0.55, 0.12, 0.5, 0.88) });
  }
  const box = new THREE.Box3();
  for (const p of parts) { p.lod0.computeBoundingBox(); box.union(p.lod0.boundingBox!); }
  return {
    id: `flowers:${variant}`, kind: "flowers", variant, parts, height: box.max.y, radius: 1.0, center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    lod0: kind === 2 ? 14 : 16, lod1: 38, impostor: kind === 1,   // (the heliconia clump carries an impostor)
  };
}
