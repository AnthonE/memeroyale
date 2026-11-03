// Ground layer: grass tufts (crossed painted cards, camera-local detail), jungle ground-cover (low leafy rosettes of
// painted cards, camera-local detail), bamboo clumps (segmented canes + painted leaf sprays), fallen mossy logs.
import * as THREE from "three";
import { mulberry32 } from "../../../../../shared/world/noise";
import { logShape, bambooCanes, BAMBOO_SEGS } from "../../../../../shared/world/veg-scatter";
import { curveFrames, tube, finalize, mergeAll } from "../geo";
import { foliageMaterial, type FoliageMaterials } from "../foliage-material";
import { bambooTexture } from "../textures";
import { logEnd, lawnAtlas, mossBlanket, logWood, strapFrond, coconut2 } from "../paint";
import { vegTex } from "../tex";
import type { Species } from "./types";

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type GMats = Record<"lawn" | "grassAB" | "cover" | "mossMat" | "dune" | "cane" | "bambooLeaf" | "log" | "logEnd" | "moss" | "nut" | "dryFrond", FoliageMaterials>;
let mats: GMats | null = null;
function materials(): GMats {
  if (mats) return mats;
  const grass = (id: string, color: number) => foliageMaterial({
    map: vegTex(id), color, atlas2: true, roughness: 0.62, translucency: 0.45, transColor: 0xc8f055, height: 0.6, sway: 0.06, bob: 0.05, flutter: 0.02,
    envMapIntensity: 0.55, fadeFar: [12, 34], fill: 0.36, wrap: 0.6, alphaTest: 0.42, alphaMip: 0.35, matte: true,
    // the blade roots take the ground's colour (rootTint + the terrain albedo bake under them: foliage-material F_ROOT)
    rootFade: 0.055, rootTint: [0.72, 0.76, 0.84],
  });
  // meadow lawn (Grass biome): small soft blade tufts (paint.ts lawnTuft) whose roots are the terrain lawn's
  // colour — dense (0.5 m), randomly sized and turned, no carpet squares or long strips (their edges drew a tile web);
  // thinned 30 → 90 m by per-plant shrink while the survivors widen
  // (plain + daisy tufts share one atlas / one draw — the half is picked per instance)
  const lawn = () => foliageMaterial({
    // lit like the ground it grows from (wrap ≈ lambert, normals near-vertical): at the terrain's albedo the tufts melt
    // into the painted lawn instead of reading as dark hair plugs (wrap 0.6 lit them ~30 % darker than the ground)
    // (warmer, lighter tufts: the meadow measured darker / duller than the target art, V 0.50 vs 0.58, S 0.63 vs 0.79)
    // (measured p50 #5f7120 against the target art's #759515 — brighter, less blue = more saturated)
    // (no straight shingle edges or terraced light / dark bands: the target art's meadow is LOW contrast
    // (luma p25 / p75 112 / 150 — ours was 102 / 183 with lime tips on dark ground): tips toned down, and the lowest
    // ~9 cm of every blade dissolves into the ground with the ground's colour (rootFade / rootTint, foliage-material))
    map: lawnAtlas(), atlas2: true, color: new THREE.Color(1.2, 1.3, 0.66), roughness: 0.7, translucency: 0.24, transColor: 0xc8f055, height: 0.3, sway: 0.05, bob: 0.04, flutter: 0.018,
    envMapIntensity: 0.55, fadeFar: [16, 46], fill: 0.36, wrap: 0.12, alphaTest: 0.42, alphaMip: 0.45, matte: true, widen: 1, noDepth: true,
    rootFade: 0.09, rootTint: [0.62, 0.66, 0.9],
  });
  mats = {
    lawn: lawn(),
    // jungle / cinder / beach-edge tufts: warmer, a touch less saturated than the raw paint, lighter tips via vertex colour
    // (grass A | B in one atlas — one draw; the half is picked per instance)
    grassAB: grass("grass-atlas-ab", 0xf7f3da),
    cover: foliageMaterial({ map: vegTex("groundcover"), color: 0xf8ffc0, roughness: 0.4, translucency: 0.55, transColor: 0xb0ff48, height: 0.5, sway: 0.01, bob: 0.02, flutter: 0.01, envMapIntensity: 0.9, fadeFar: [10, 40], fill: 0.42, wrap: 0.55, alphaTest: 0.45, matte: true, widen: 1, shadowLift: 0.55 }),
    mossMat: foliageMaterial({ map: vegTex("crown-leaves"), color: new THREE.Color(0.78, 0.82, 0.6), roughness: 0.92, height: 0.1, sway: 0, bob: 0, flutter: 0, envMapIntensity: 0.25, fadeFar: [30, 44], fill: 0.5, wrap: 0.5, matte: true, doubleSide: false, shadowLift: 0.5 }),
    dune: foliageMaterial({ map: vegTex("dune-creeper"), color: 0xf4ffe8, roughness: 0.38, translucency: 0.45, transColor: 0xb0ff48, height: 0.3, sway: 0.0, bob: 0.01, flutter: 0.008, envMapIntensity: 0.9, fadeFar: [15, 42], fill: 0.3, wrap: 0.45, alphaTest: 0.45, matte: true }),
    cane: foliageMaterial({ map: bambooTexture(1), roughness: 0.4, height: 8, sway: 0.45, flutter: 0, envMapIntensity: 0.8, fill: 0.16, wrap: 0.25 }),
    bambooLeaf: foliageMaterial({ map: vegTex("bamboo-leaves"), roughness: 0.45, translucency: 0.7, transColor: 0xb8ff50, height: 8, sway: 0.45, bob: 0.12, flutter: 0.04, envMapIntensity: 0.75, fill: 0.32, wrap: 0.5, alphaTest: 0.45 }),
    // (the target art's log is weathered DEBARKED wood — pale tan-grey with long cracks — under a lime moss cushion;
    // the dark mossy-bark tile read as a green camo pipe)
    // (pale, more fill — the target art's log reads pale tan-grey #b8a07a even in the canopy shade)
    // (greyer still: the target art's log is bleached #b8a07a, not orange-tan)
    log: (() => { const w = logWood(1); return foliageMaterial({ map: w.map, normalMap: w.normalMap, normalScale: 1.2, color: new THREE.Color(1.22, 1.17, 1.08), roughness: 0.88, height: 1, fadeFar: [640, 800], sway: 0, flutter: 0, envMapIntensity: 0.45, fill: 0.5, wrap: 0.34, doubleSide: false, sat: 0.72, shadowLift: 0.35 }); })(),
    logEnd: foliageMaterial({ map: logEnd(1), roughness: 0.85, height: 1, fadeFar: [640, 800], sway: 0, flutter: 0, envMapIntensity: 0.4, fill: 0.16, doubleSide: false }),
    // the target art's bright lime moss blanket over the log's top, dripping down its sides
    // palm litter: fallen husked nuts, dry straw fronds on the sand
    nut: foliageMaterial({ map: coconut2(1), color: new THREE.Color(1.15, 1.05, 0.95), roughness: 0.6, height: 0.3, sway: 0, flutter: 0, envMapIntensity: 0.4, fill: 0.35, wrap: 0.35, doubleSide: false, fadeFar: [22, 35] /* shrinks out before the 42 m cut */ }),
    // (a straw #c9a86a BROAD frond, not a fishbone skeleton — the strap card
    // painted dry, 9 straps a side, some missing / broken)
    dryFrond: (() => { const f = strapFrond(2, { dry: true, straps: 9 }); return foliageMaterial({ map: f.map, normalMap: f.normalMap, normalScale: 0.8, roughness: 0.8, height: 0.3, sway: 0, bob: 0, flutter: 0.004, envMapIntensity: 0.3, fill: 0.34, wrap: 0.4, alphaTest: 0.45, matte: true, fadeFar: [22, 35] }); })(),
    // (patchy sunlit lime — the moss keeps most of the sun in the canopy's shade: the target art's glowing cushion)
    moss: foliageMaterial({ map: mossBlanket(1), color: new THREE.Color(1.15, 1.2, 0.86), roughness: 0.92, translucency: 0.3, transColor: 0xb8f050, height: 1, fadeFar: [640, 800], sway: 0, bob: 0, flutter: 0, envMapIntensity: 0.3, fill: 0.55, wrap: 0.55, alphaTest: 0.5, matte: true, shadowLift: 0.55 }),
  };
  return mats;
}

/** lawn tuft: `cards` small blade cards crossed in a star (0.5–0.7 m wide, ~0.3 m tall) — at 0.5 m spacing, randomly
 * scaled and turned, they give the terrain's painted lawn its blade relief without hiding it; normals lean up so the
 * blades light like the ground they grow from */
function lawnTuft(rnd: () => number, cards: number, segsX: number): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = [];
  const ph0 = rnd() * 6.283, a0 = rnd() * Math.PI;
  for (let i = 0; i < cards; i++) {
    const w = 0.56 * (0.85 + rnd() * 0.3), h = 0.28 * (0.85 + rnd() * 0.35);
    const g = new THREE.PlaneGeometry(w, h, segsX, 1);
    // (the card's foot sits ON the ground — the instance matrix shears it onto the slope, detail-gen — and its
    // lowest blades dissolve (rootFade); pitch ±15° so neighbouring cards never line up into rows)
    g.translate(0, h / 2 - 0.015, 0);
    g.rotateX((rnd() - 0.5) * 0.52);
    g.rotateY(a0 + (i / cards) * Math.PI + (rnd() - 0.5) * 0.4);
    g.translate((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12);
    const na = g.attributes.normal as THREE.BufferAttribute;
    for (let k = 0; k < na.count; k++) { const v = new THREE.Vector3(na.getX(k), na.getY(k), na.getZ(k)).multiplyScalar(0.15).add(new THREE.Vector3(0, 1, 0)).normalize(); na.setXYZ(k, v.x, v.y, v.z); }
    const tint = 0.95 + rnd() * 0.1;
    gs.push(finalize(g, { color: (_i, p) => { const y = Math.max(0, p.y) / h, a = (0.9 + 0.1 * smooth(0, 0.5, y)) * tint; return [a, a, a * 0.97]; }, bend: (_i, p) => Math.pow(Math.max(0, p.y / h), 2), phase: ph0 + i * 1.7 }));
  }
  return mergeAll(gs);
}

export function buildGrass(variant: number): Species {
  const m = materials();
  const rnd = mulberry32(9000 + variant * 3);
  if (variant % 4 < 2) {
    const parts = [{ name: "blade", mats: m.lawn, lod0: lawnTuft(rnd, 3, 2), lod1: lawnTuft(mulberry32(9100 + variant), 2, 1) }];
    return {
      id: `grass:${variant}`, kind: "grass", variant, parts, height: 0.35, radius: 0.45, center: new THREE.Vector3(0, 0.15, 0), boundR: 0.5,
      lod0: 16, lod1: 46, impostor: false,
    };
  }
  const tuft = (cards: number, segs: number) => {
    const gs: THREE.BufferGeometry[] = [];
    const h = 0.5 + rnd() * 0.18, w = h * 2.3;
    for (let i = 0; i < cards; i++) {
      const g = new THREE.PlaneGeometry(w * (0.85 + rnd() * 0.3), h, 1, segs);
      g.translate(0, h / 2 - 0.03, 0);
      g.rotateX((rnd() - 0.5) * 0.3);
      g.rotateY((i / cards) * Math.PI + rnd() * 0.35);
      g.translate((rnd() - 0.5) * 0.18, 0, (rnd() - 0.5) * 0.18);
      const tint = 0.9 + rnd() * 0.2;
      // normals lean up (grass lit like the ground it grows from, not like vertical cards)
      const na = g.attributes.normal as THREE.BufferAttribute;
      for (let k = 0; k < na.count; k++) { const v = new THREE.Vector3(na.getX(k), na.getY(k), na.getZ(k)).multiplyScalar(0.45).add(new THREE.Vector3(0, 1, 0)).normalize(); na.setXYZ(k, v.x, v.y, v.z); }
      const ph = rnd() * 6.283;
      gs.push(finalize(g, { color: (_i, p) => { const y = p.y / h, ao = 0.78 + 0.22 * smooth(0, 0.45, y), tip = 1 + 0.18 * smooth(0.55, 1, y), root = 1 - smooth(0, 0.3, y); return [ao * tint * tip * (1.05 + 0.1 * root), ao * tint * tip, ao * tint * (0.88 - 0.12 * root)]; }, bend: (_i, p) => Math.pow(Math.max(0, p.y / h), 2), phase: ph }));
    }
    return mergeAll(gs);
  };
  const mat = m.grassAB;
  const parts = [{ name: "blade", mats: mat, lod0: tuft(3, 2), lod1: tuft(2, 1) }];
  return {
    id: `grass:${variant}`, kind: "grass", variant, parts, height: 0.7, radius: 0.8, center: new THREE.Vector3(0, 0.35, 0), boundR: 0.9,
    lod0: 14, lod1: 34, impostor: false,
  };
}

/** jungle floor ground-cover: a low rosette of painted leaf cards tilted up (0.5–0.9 m across) */
export function buildGroundcover(variant: number): Species {
  const m = materials();
  const rnd = mulberry32(9500 + variant * 7);
  if (variant === 3) {
    // (no bare dirt between sparse repeated clumps) a moss + leaf-litter
    // MAT: a low irregular dome whose rim sinks below the ground — the terrain cuts its outline organically (no decal
    // edge) — mottled moss greens with patches of brown fallen leaves; opaque, a few dozen triangles
    const mat = (seg: number, rings: number) => {
      const r2 = mulberry32(9600);
      const lobes = [0, 1, 2, 3].map(() => [r2() * 6.28, 0.12 + r2() * 0.14, 2 + Math.floor(r2() * 3)] as const);
      const pos: number[] = [], idx: number[] = [];
      const edge = (a: number) => 1 - lobes.reduce((acc, [ph, amp, k]) => acc + amp * (0.5 + 0.5 * Math.sin(a * k + ph)), 0) * 0.55;
      pos.push(0, 0.035, 0);
      for (let r = 1; r <= rings; r++) for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2, f = r / rings, R = edge(a) * f;
        pos.push(Math.cos(a) * R, 0.035 - 0.22 * f * f, Math.sin(a) * R);
      }
      for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
      for (let r = 1; r < rings; r++) for (let i = 0; i < seg; i++) {
        const a = 1 + (r - 1) * seg + i, b = 1 + (r - 1) * seg + ((i + 1) % seg), c = a + seg, d = b + seg;
        idx.push(a, b, d, a, d, c);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      // planar uv into the crown atlas' opaque leaf-mass square (right half): fallen leaves over moss
      const uvs: number[] = []; for (let k = 0; k < pos.length; k += 3) uvs.push(0.75 + pos[k] * 0.1, 0.5 + pos[k + 2] * 0.2);
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      const h = (x: number, z: number) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
      return finalize(g, {
        color: (_i, p) => {
          // moss (lime → olive) with litter patches (warm brown), darker toward the sunk rim
          const n = 0.5 + 0.5 * Math.sin(p.x * 4.1 + Math.cos(p.z * 3.3) * 2) * Math.cos(p.z * 3.7 - p.x * 1.3), lit = h(p.x * 3, p.z * 3) > 0.62 ? 1 : 0;
          // (tints over the leaf-mass texture: moss keeps it green, litter turns it warm brown)
          const moss: [number, number, number] = [0.62 + 0.12 * n, 0.72 + 0.1 * n, 0.4], litter: [number, number, number] = [0.95, 0.62, 0.3];
          const ao = 0.6 + 0.4 * smooth(-0.1, 0.03, p.y);
          return moss.map((c, k) => (c * (1 - 0.7 * lit) + litter[k] * 0.7 * lit) * ao) as [number, number, number];
        },
        bend: 0, phase: 0,
      });
    };
    const parts = [{ name: "moss", mats: m.mossMat, lod0: mat(14, 3), lod1: mat(8, 1) }];
    return { id: `groundcover:${variant}`, kind: "groundcover", variant, parts, height: 0.08, radius: 1.0, center: new THREE.Vector3(0, 0, 0), boundR: 1.1, lod0: 14, lod1: 44, impostor: false };
  }
  if (variant % 3 === 2) {
    // dune creeper: 2–3 flat vine cards sprawled on the sand, slightly lifted at the tips
    const patch = (cards: number) => {
      const gs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < cards; i++) {
        const sz = 1.3 + rnd() * 0.5;
        const g = new THREE.PlaneGeometry(sz, sz, 2, 2);
        g.rotateX(-Math.PI / 2 + (rnd() - 0.5) * 0.12);
        g.rotateY(rnd() * 6.283);
        g.translate((rnd() - 0.5) * 0.9, 0.05 + i * 0.015, (rnd() - 0.5) * 0.9);
        const pa = g.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < pa.count; k++) { const r = Math.hypot(pa.getX(k), pa.getZ(k)); pa.setY(k, pa.getY(k) + r * 0.08); }
        g.computeVertexNormals();
        gs.push(finalize(g, { color: (_i, p) => { const a = 0.78 + 0.22 * smooth(0.04, 0.14, p.y); return [a, a, a]; }, bend: 0.2, phase: rnd() * 6.283 }));
      }
      return mergeAll(gs);
    };
    const parts = [{ name: "dune", mats: m.dune, lod0: patch(3), lod1: patch(2) }];
    return { id: `groundcover:${variant}`, kind: "groundcover", variant, parts, height: 0.2, radius: 1.2, center: new THREE.Vector3(0, 0.1, 0), boundR: 1.3, lod0: 15, lod1: 42, impostor: false };
  }
  // (perf: 1×1 quads — the 2×2 grids were 43 k tris at a jungle camera for a bend nobody sees)
  const rosette = (cards: number) => {
    const gs: THREE.BufferGeometry[] = [];
    const s = 0.75 + rnd() * 0.3;
    for (let i = 0; i < cards; i++) {
      const g = new THREE.PlaneGeometry(s, s, 1, 1);
      g.rotateX(-Math.PI / 2 + (0.35 + rnd() * 0.45));         // tilted up
      g.rotateY((i / cards) * Math.PI * 2 + rnd() * 0.5);
      g.translate((rnd() - 0.5) * 0.25, 0.1 + i * 0.03, (rnd() - 0.5) * 0.25);
      const ph = rnd() * 6.283;
      gs.push(finalize(g, { color: (_i, p) => { const ao = 0.62 + 0.38 * smooth(0, 0.25, p.y); return [ao, ao, ao]; }, bend: (_i, p) => Math.max(0, p.y) * 0.5, phase: ph }));
    }
    return mergeAll(gs);
  };
  const parts = [{ name: "cover", mats: m.cover, lod0: rosette(3), lod1: rosette(2) }];
  return {
    id: `groundcover:${variant}`, kind: "groundcover", variant, parts, height: 0.45, radius: 0.6, center: new THREE.Vector3(0, 0.2, 0), boundR: 0.7,
    lod0: 12, lod1: 40, impostor: false,
  };
}

export function buildBamboo(variant: number): Species {
  const m = materials();
  // the canes come from shared/world/veg-scatter.ts bambooCanes (the bullet boxes follow the same tubes)
  const canes = bambooCanes(variant).map((c) => ({ pts: c.pts.map((q) => new THREE.Vector3(...q)), h: c.h, r: c.r }));
  const NODE = 0.5;
  // node rings come from the texture (one band per tile) — the geometry stays at 5 sides × 6 segments per cane
  const caneGeo = (radial: number, segs: number) => mergeAll(canes.map((c) => tube(curveFrames(c.pts, segs), {
    radial, radius: (t) => c.r * (1 - 0.35 * t),
    v: (_t, d) => d / NODE, uRepeat: 1, color: (t) => { const ao = 0.6 + 0.4 * smooth(0, 0.25, t); return [ao, ao, ao]; }, capTop: true,
  })));
  const leaves = (per: number) => {
    const rl = mulberry32(10100 + variant);
    const gs: THREE.BufferGeometry[] = [];
    for (const c of canes) for (let k = 0; k < per; k++) {
      const t = 0.5 + rl() * 0.5;
      const seg = Math.min(3, Math.floor(t * 4)), f = t * 4 - seg;
      const p = c.pts[seg + 1].clone().lerp(c.pts[Math.min(4, seg + 2)], f);
      const s = 1.0 + rl() * 0.6;
      const g = new THREE.PlaneGeometry(s, s, 1, 1);
      g.translate(s * 0.42, -s * 0.1, 0);
      g.rotateZ(-0.5 + rl() * 0.6); g.rotateY(rl() * 6.283);
      g.translate(p.x, p.y, p.z);
      const tone = 0.85 + rl() * 0.25;
      gs.push(finalize(g, { color: [tone, tone, tone * 0.95], bend: 0.7, phase: rl() * 6.283 }));
    }
    return mergeAll(gs);
  };
  const parts = [
    // (round canes, 8 / 5 sides, and LOD1 keeps the curve's 6 pieces — the per-cane bullet boxes)
    { name: "cane", mats: m.cane, lod0: caneGeo(8, BAMBOO_SEGS), lod1: caneGeo(5, BAMBOO_SEGS) },
    { name: "leaf", mats: m.bambooLeaf, lod0: leaves(5), lod1: leaves(2) },
  ];
  const box = new THREE.Box3();
  for (const p of parts) { p.lod0.computeBoundingBox(); box.union(p.lod0.boundingBox!); }
  return {
    id: `bamboo:${variant}`, kind: "bamboo", variant, parts, height: box.max.y, radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z), center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    lod0: 26, lod1: 70, impostor: true, shadow: true,
  };
}

export function buildLog(variant: number): Species {
  const m = materials();
  const rnd = mulberry32(11000 + variant * 3);
  const { L, R } = logShape(variant); rnd(); rnd();   // the shared shape (colliders) consumed the first two draws
  const pts = [new THREE.Vector3(-L / 2, R * 0.72, 0), new THREE.Vector3(0, R * 0.8 + 0.08, (rnd() - 0.5) * 0.3), new THREE.Vector3(L / 2, R * 0.68, 0)];
  const frames = (segs: number) => curveFrames(pts, segs);
  const radiusAt = (t: number, a: number) => R * (1 - 0.12 * t) * (1 + 0.05 * Math.sin(a * 4 + t * 20) * Math.sin(a * 2.3));
  const body = (radial: number, segs: number) => {
    const g = tube(frames(segs), {
      radial, radius: radiusAt, v: (_t, d) => d / 1.6, uRepeat: 1,
      // AO darkens the underside (ground contact); the bark stays warm brown — the moss is the separate blanket
      // (a green vertex tint + a moss shell over
      // ±112° would hide every bit of bark: a green camo foam pipe)
      color: (_t, a) => { const up = Math.sin(a); const ao = 0.48 + 0.52 * smooth(-0.85, 0.35, up); return [ao * 1.04, ao * 0.98, ao * 0.9]; },
      capTop: false,
    });
    // texture u runs ALONG the log (grain + cracks), v AROUND it at the same texel density (whole tiles around: the
    // wrap seam hides under the log)
    const uv = g.attributes.uv as THREE.BufferAttribute, n = radial + 1, around = Math.max(1, Math.round((2 * Math.PI * R) / 1.6));
    for (let i = 0; i < uv.count; i++) { const a = (i % n) / radial, a2 = (a + 0.25) % 1; uv.setXY(i, uv.getY(i), a2 * around); }
    return g;
  };
  // broken ends: a splintered cone (heartwood pushed out, jagged rim) mapped with the end-grain rings
  const ends = (radial: number) => {
    const f = frames(24);
    const gs: THREE.BufferGeometry[] = [];
    const rs = mulberry32(11100 + variant);
    for (const [fr, s, t] of [[f[0], -1, 0], [f[f.length - 1], 1, 1]] as const) {
      const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
      const out = fr.t.clone().multiplyScalar(s);
      pos.push(fr.p.x + out.x * R * 0.18, fr.p.y + out.y * R * 0.18, fr.p.z + out.z * R * 0.18); uvs.push(0.5, 0.5);
      for (const [k, rr] of [[0.55, 0.55], [1, 1]] as const) for (let a = 0; a < radial; a++) {
        const ang = (a / radial) * Math.PI * 2;
        const r = radiusAt(t, ang) * rr * (k < 1 ? 1 : 0.97);
        const push = (k < 1 ? 0.1 + rs() * 0.12 : (rs() < 0.3 ? 0.08 + rs() * 0.18 : 0)) * R;   // splinters on the rim
        const d = fr.s.clone().multiplyScalar(Math.cos(ang)).addScaledVector(fr.n, Math.sin(ang));
        pos.push(fr.p.x + d.x * r + out.x * push, fr.p.y + d.y * r + out.y * push, fr.p.z + d.z * r + out.z * push);
        uvs.push(0.5 + Math.cos(ang) * rr * 0.5 * s, 0.5 + Math.sin(ang) * rr * 0.5);
      }
      for (let a = 0; a < radial; a++) {
        const b = (a + 1) % radial, i0 = 1 + a, i1 = 1 + b, o0 = 1 + radial + a, o1 = 1 + radial + b;
        if (s > 0) { idx.push(0, i0, i1, i0, o0, o1, i0, o1, i1); } else { idx.push(0, i1, i0, i0, o1, o0, i0, i1, o1); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx); g.computeVertexNormals();
      gs.push(finalize(g, { color: [0.95, 0.9, 0.86] }));
    }
    return mergeAll(gs);
  };
  // two broken branch stubs on the upper side break the straight top silhouette
  const stubs = () => {
    const f = frames(24);
    const rs = mulberry32(11200 + variant);
    return mergeAll([0.3, 0.68].map((u) => {
      const fr = f[Math.round(u * (f.length - 1))];
      const ang = Math.PI * (rs() < 0.5 ? 0.15 + rs() * 0.15 : 0.7 + rs() * 0.15);   // out to one side, never a post
      const d = fr.s.clone().multiplyScalar(Math.cos(ang)).addScaledVector(fr.n, Math.sin(ang)).addScaledVector(fr.t, (rs() - 0.5) * 0.6).normalize();
      const len = R * (0.3 + rs() * 0.35), r0 = R * (0.2 + rs() * 0.08);
      const a = fr.p.clone().addScaledVector(d, R * 0.7), b = fr.p.clone().addScaledVector(d, R * 0.95 + len);
      return tube(curveFrames([a, a.clone().lerp(b, 0.5), b], 3), { radial: 6, radius: (t) => r0 * (1 - 0.45 * t), v: (_t, dd) => dd / 1.6, uRepeat: 1, color: () => [0.8, 0.8, 0.8], capTop: true });
    }));
  };
  // moss blanket: a cushion over the top of the log — solid to ~±55°, its ragged edge and drips hanging down the sides
  // to ~±88° (texture), standing ~5 cm proud on top and hugging the bark at its hanging edge; u along the log, v from
  // the top line to the edge
  const moss = (segA: number, segL: number) => {
    const f = frames(segL);
    const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
    const A = 1.55;
    for (let i = 0; i <= segL; i++) {
      const t = 0.02 + 0.96 * (i / segL), fr = f[Math.round(t * segL)];
      for (let j = 0; j <= segA; j++) {
        const a = Math.PI / 2 - A + (2 * A * j) / segA;
        const k = Math.abs(a - Math.PI / 2) / A;
        const r = radiusAt(t, a) * (1.02 + 0.05 * (1 - k * k)) + 0.018 + 0.03 * (1 - k) * (0.7 + 0.3 * Math.sin(t * 17 + a * 5));
        const d = fr.s.clone().multiplyScalar(Math.cos(a)).addScaledVector(fr.n, Math.sin(a));
        pos.push(fr.p.x + d.x * r, fr.p.y + d.y * r, fr.p.z + d.z * r);
        nor.push(d.x, d.y, d.z);
        uv.push((t * L) / 1.6, k);
      }
    }
    const st = segA + 1;
    for (let i = 0; i < segL; i++) for (let j = 0; j < segA; j++) { const k = i * st + j; idx.push(k, k + st, k + 1, k + 1, k + st, k + st + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return finalize(g, { color: (_i, p) => { const a = 0.8 + 0.25 * smooth(R * 0.3, R * 1.6, p.y); return [a, a, a]; } });
  };
  const parts = [
    { name: "bark", mats: m.log, lod0: mergeAll([body(12, 14), stubs()]), lod1: body(7, 3) },
    // (logs block bullets, so they are drawn at every distance a player can be seen: the cheap LOD1
    // keeps a coarse moss cap and draws to 900 m — a 60 m cut made them vanish in view and turned them into
    // invisible bullet walls)
    // (LOD1 is the bark alone — its vertex colours carry the moss cap; 2 draws less per log variant)
    { name: "end", mats: m.logEnd, lod0: ends(12), lod1: new THREE.BufferGeometry(), shadow: false },
    { name: "moss", mats: m.moss, lod0: moss(12, 14), lod1: moss(4, 3), shadow: false },
  ];
  const box = new THREE.Box3(); parts[0].lod0.computeBoundingBox(); box.union(parts[0].lod0.boundingBox!);
  return {
    id: `log:${variant}`, kind: "log", variant, parts, height: box.max.y, radius: L / 2 + 0.3, center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    lod0: 30, lod1: 900, impostor: false, shadow: true,
  };
}

/**
 * Palm litter: variant 0 = 2–3 fallen husked coconuts half-sunk in the sand; 1 = a dry
 * straw frond lying on the ground, arched a little, its tip curled up; 2 = a split husk half + one nut.
 */
export function buildLitter(variant: number): Species {
  const m = materials();
  const v = variant % 3;
  const rnd = mulberry32(11800 + v * 7);
  const nut = (x: number, z: number, r: number, tilt: number, wSeg: number, hSeg: number) => {
    const g = new THREE.SphereGeometry(r, wSeg, hSeg);
    g.scale(0.94, 1.12, 0.94);
    g.rotateZ(Math.PI / 2 * 0.85 + tilt); g.rotateY(rnd() * 6.28);
    // (fallen coconuts must not sit on the sand like stickers: sunk ~20 % into the sand, contact-dark foot,
    // and LOD0 casts — the species' shadow flag)
    g.translate(x, r * 0.52, z);
    return finalize(g, { color: (_i, p) => { const a = 0.38 + 0.62 * smooth(r * 0.05, r * 1.35, p.y); return [a, a * 0.98, a * 0.95]; } });
  };
  const parts: Species["parts"] = [];
  if (v === 0 || v === 2) {
    const spec = v === 0 ? [[0, 0, 0.19], [0.36, 0.12, 0.17], [-0.12, 0.38, 0.18]].slice(0, 2 + Math.floor(rnd() * 2)) : [[0.3, 0.05, 0.18]];
    const nuts = (w: number, h: number) => mergeAll(spec.map(([x, z, r]) => nut(x, z, r, (rnd() - 0.5) * 0.4, w, h)));
    const gs: THREE.BufferGeometry[] = [nuts(14, 10)];
    if (v === 2) {
      // a split husk half: an open bowl lying on its side
      const h = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
      h.scale(0.95, 1.1, 0.95); h.rotateX(Math.PI * 0.62); h.translate(-0.12, 0.1, -0.05);
      gs.push(finalize(h, { color: [0.85, 0.8, 0.72] }));
    }
    parts.push({ name: "nut", mats: m.nut, lod0: mergeAll(gs), lod1: nuts(8, 5) });
  } else {
    // dry frond: a ribbon along a low arched rachis, nearly flat (leaflets splayed on the sand), tip curling up
    const L = 3.2 + rnd() * 0.8, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(-L / 2 + L * t, 0.04 + 0.18 * Math.sin(t * Math.PI) * (1 - t * 0.5) + 0.3 * Math.pow(t, 4), 0.25 * Math.sin(t * 2.2))); }
    const fr = curveFrames(pts, 16);
    const rib = (along: number) => {
      const f2 = curveFrames(pts, along);
      const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
      for (let i = 0; i <= along; i++) {
        // (the strap card carries the blade outline in its alpha — a constant-width strip maps it undistorted)
        const t = i / along, F = f2[i], hw = L * 0.245;
        // side vector kept horizontal (the frond lies flat), leaflet edges droop onto the sand
        const side = new THREE.Vector3(-F.t.z, 0, F.t.x).normalize();
        for (const [u, k] of [[0, -1], [0.5, 0], [1, 1]] as const) {
          const p = F.p.clone().addScaledVector(side, k * hw);
          // (the leaflets stand up off the rachis in a shallow V — a flat frond vanished edge-on at eye height)
          if (k !== 0) p.y = Math.max(0.03, p.y + 0.16 * hw);
          pos.push(p.x, p.y, p.z); uvs.push(u, t);
        }
      }
      for (let i = 0; i < along; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const na = g.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < na.count; i++) { const n = new THREE.Vector3(na.getX(i), Math.abs(na.getY(i)) + 0.6, na.getZ(i)).normalize(); na.setXYZ(i, n.x, n.y, n.z); }
      return finalize(g, { color: [1, 1, 1], bend: 0 });
    };
    void fr;
    parts.push({ name: "frond", mats: m.dryFrond, lod0: rib(12), lod1: rib(4) });
  }
  const box = new THREE.Box3(); parts[0].lod0.computeBoundingBox(); box.union(parts[0].lod0.boundingBox!);
  return {
    id: `litter:${variant}`, kind: "litter", variant, parts, height: box.max.y, radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z), center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    lod0: 18, lod1: 42, impostor: false, shadow: true,
  };
}
