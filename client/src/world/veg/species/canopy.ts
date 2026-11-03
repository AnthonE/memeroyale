// Canopy family: jungle broadleaf tree, bush, mangrove.
// Jungle tree (5 silhouettes: understory, canopy, emergent, wide umbrella, tall narrow — shared/world/veg-scatter.ts
// jungleTreeShape, which the server's trunk colliders also use): a 12-sided trunk, 4–6 DISCRETE sinuous buttress
// blades (their own bark UVs, gaps between them), branches spread along the upper trunk that fork toward the canopy
// lobes, catenary lianas hanging from the branches (never through the trunk or the ground), and a layered canopy of
// irregular painted leaf-SPRAY cards ("canopy-spray-*": elongated twigs of leaves with ragged outlines — not round
// leaf balls) on lobes of an ellipsoid. Cards use the VEG_BILLBOARD foliage material (they face the viewer, and the
// sun in the shadow pass — shrunk there so sun dapples get through; the dark core cards never cast).
// LOD0 ≈ 1.5 k tris, LOD1 ≈ 0.3 k.
import * as THREE from "three";
import { mulberry32 } from "../../../../../shared/world/noise";
import { jungleTreeShape, treeRadius, treeCentreAt, treeRings, treeCrevice, rootStations, mangroveShape, mangroveRootR, mangroveTrunkR, MANGROVE_SEGS, type TreeShape } from "../../../../../shared/world/veg-scatter";
import { curveFrames, tube, ribbon, mergeAll, fibSphere, finalize, type Card, type Frame } from "../geo";
import { foliageMaterial, type FoliageMaterials } from "../foliage-material";
import { vegTex } from "../tex";
import { flatTexture } from "../textures";
import type { Species } from "./types";
import { crownGeometry, type Clump } from "./crown";

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type CanopyMats = Record<"bark" | "vineRope" | "crown" | "bushCrown" | "mangroveCrown" | "vineLeaf" | "vineLeaf3" | "bushBroad" | "mangroveBark", FoliageMaterials>;
let mats: CanopyMats | null = null;
function materials(): CanopyMats {
  if (mats) return mats;
  const crownMat = (height: number, sway: number) => foliageMaterial({
    map: vegTex("crown-leaves"), color: 0xffffff, roughness: 0.55, translucency: 0.6, transColor: 0xb2ff48, height, sway,
    bob: height > 4 ? 0.06 : 0.03, flutter: height > 4 ? 0.035 : 0.02, envMapIntensity: 0.35, fill: 0.4, wrap: 0.42, billboard: 0, puff: 0,
    alphaTest: 0.45, atlas2: true, shadowLift: 0.3, noFlip: true, hullFade: true,
  });
  const barkN = vegTex("bark-jungle-n", { data: true, repeat: true });
  // (lighter grey-brown bark, brighter tint, more fill: the buttress giant must not read as a plain dark cone)
  // (grey-brown, not red-brown — the canopy's saturation boost no longer reaches bark (F_GRADE), and the
  // bark itself sits at 0.78 saturation: the target art's jungle trunks are #8b7d6b lit / #5e5448 in the shade)
  const bark = (color: number) => foliageMaterial({ map: vegTex("bark-jungle", { repeat: true }), normalMap: barkN, normalScale: 1.25, color, roughness: 0.86, height: 16, sway: 0.2, flutter: 0, envMapIntensity: 0.55, fill: 0.46, wrap: 0.34, doubleSide: false, sat: 0.72 });
  mats = {
    bark: bark(0xf0ebe2),
    // (vines have no impostor; their rope + leaves shrink out by 108 m, before the 125 m cut)
    vineRope: foliageMaterial({ map: vegTex("bark-jungle", { repeat: true }), normalMap: barkN, normalScale: 1.25, color: 0xf0ebe2, roughness: 0.86, height: 16, sway: 0.2, flutter: 0, envMapIntensity: 0.55, fill: 0.46, wrap: 0.34, doubleSide: false, sat: 0.72, fadeFar: [80, 108] }),
    // one tint per silhouette (not every crown the same yellow-olive puff): the canopy reads as a
    // mix of species — deep cool understory, fresh canopy, warm yellow-lime emergents, blue-green umbrellas, lime narrows
    // (jungle foliage measured hue 92–97° vs the target art's 83°, saturation 0.75 vs 0.93: every tint pulled
    // toward yellow-green, blue taken out)
    // (draw merging: ONE material per mass atlas — the per-silhouette tint lives in the card vertex colours,
    // TREE_TINT — so the variants sharing an atlas draw together, lod.ts PartGroup)
    // volumetric crowns (species/crown.ts) — fixed 3D leaf-spray cards + a leafy hull per
    // clump, clump normals on both faces (noFlip); billboard 0 keeps the leaf-cluster fragment path (matte, crown grade)
    crown: crownMat(16, 0.22),
    bushCrown: crownMat(2, 0.04),
    mangroveCrown: crownMat(6, 0.1),
    // lianas keep the leaf-SPRAY cards (twigs of bigger leaves along the rope)
    // (lighter — hanging greenery under the canopy read as dark specks against the crowns)
    // (fixed 3D leaf sprays along the strands in the crown atlas — the camera-facing cards turned with the view)
    // (the strands' spray CARDS read as flat chains in the sky — modelled heart leaves,
    // opaque, vertex-shaded: a real 3D leaf string at any angle)
    // (not flat, unshaded pale-lime quads: a deep, value-split leaf green lit like the
    // crowns — less wrap / ambient fill / translucency so the V-fold and the droop shade)
    vineLeaf3: foliageMaterial({ map: flatTexture("#ffffff"), color: new THREE.Color(0.4, 0.6, 0.2), roughness: 0.6, translucency: 0.38, transColor: 0x8fd040, height: 16, sway: 0.22, bob: 0.08, flutter: 0.05, envMapIntensity: 0.3, fill: 0.3, wrap: 0.3, fadeFar: [80, 108] }),
    vineLeaf: foliageMaterial({ map: vegTex("crown-leaves"), color: 0xf4ffd0, roughness: 0.5, translucency: 0.8, transColor: 0xb2ff48, height: 16, sway: 0.22, bob: 0.08, flutter: 0.05, envMapIntensity: 0.35, fill: 0.42, wrap: 0.55, alphaTest: 0.42, atlas2: true, fadeFar: [80, 108] }),
    // (bushes must not read as cauliflower balls: one bush in three is twig SPRAYS around a glossy clump core —
    // protruding sprigs break the silhouette)
    // (the bushes in the target art's harbour foreground are big glossy broad leaves):
    // broad canna / heliconia-like leaves arching out of two of the three bush clumps
    bushBroad: foliageMaterial({ map: vegTex("banana-leaf-b"), color: new THREE.Color(1.02, 1.06, 0.9), roughness: 0.42, translucency: 0.95, transColor: 0xc4ff4a, height: 2, sway: 0.04, bob: 0.07, flutter: 0.02, envMapIntensity: 0.45, fill: 0.46, wrap: 0.6, alphaTest: 0.45, shadowLift: 0.6, specK: 0.7 }),
    mangroveBark: foliageMaterial({ map: vegTex("bark-jungle", { repeat: true }), normalMap: barkN, color: 0xa89888, normalScale: 1, roughness: 0.85, height: 6, sway: 0.1, flutter: 0, envMapIntensity: 0.35, fill: 0.14 }),
  };
  return mats;
}

/** per silhouette: canopy tint (was the leaf material colour) and bark tint — multiplied into the vertex colours */
const TREE_TINT: Array<{ leaf: number; bark: number }> = [
  { leaf: 0xdce6a8, bark: 0xffffff }, { leaf: 0xfaf4c4, bark: 0xdcd4c8 }, { leaf: 0xfff0a4, bark: 0xffffff }, { leaf: 0xd4dcac, bark: 0xdcd4c8 }, { leaf: 0xfcfcae, bark: 0xffffff },
];
/** multiply a geometry's vertex colours by a (linear) colour */
function tintGeo(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = g.attributes.color as THREE.BufferAttribute | undefined, k = new THREE.Color(hex);
  if (!c || hex === 0xffffff) return g;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k.r, c.getY(i) * k.g, c.getZ(i) * k.b);
  c.needsUpdate = true;
  return g;
}

export interface CanopyOpts {
  /** number of lobes and their radius range (m) */
  lobes: number;
  lobeR: [number, number];
  /** cards per lobe shell and card size (× lobe radius) */
  cards: number;
  cardK: number;
  /** darkest AO (core / underside) */
  aoMin?: number;
  /** min lobe elevation on the canopy shell (−1 … 1): < 0 lets lobes hang below the equator */
  minY?: number;
  /** flatten the lobe shells vertically */
  squash?: number;
  bend?: number;
  /** stray cards poking out of the lobe (ragged silhouette), fraction of cards */
  stray?: number;
  /** dark core plug cards (they never cast shadows) */
  core?: number;
  /** fraction of (non-stray) shell cards drawn with the dense clump half of the atlas; inward / downward cards always are */
  clump?: number;
  /** how much a card's normal follows its own LOBE (1) vs the whole canopy ellipsoid (0): 1 = each lobe lit as a puff */
  lobeNormal?: number;
  /** skip shell cards facing the canopy core below this dot (−1 keeps all) — hidden cards are pure overdraw */
  hide?: number;
  /** group the lobes into this many sub-crowns (spreading crowns with sky gaps between the masses); 0 = even shell */
  clusters?: number;
}

/**
 * Lobed canopy: lobes on the ellipsoid (c, rx, ry); each lobe a shell of cards. Returns the cards + the lobe centres
 * (branches grow to them). Inner cards (facing the canopy core) are skipped — they would never be seen.
 * Core plug cards carry aPhase ≥ 2 (the shadow pass drops them so light gets through the canopy middle).
 */
export function lobedCanopy(seed: number, c: THREE.Vector3, rx: number, ry: number, o: CanopyOpts): { cards: Card[]; lobes: Array<{ p: THREE.Vector3; r: number }> } {
  const rndL = mulberry32(seed), rnd = mulberry32(seed * 7 + 3);
  const cards: Card[] = [];
  const lobes: Array<{ p: THREE.Vector3; r: number }> = [];
  const aoMin = o.aoMin ?? 0.42, squash = o.squash ?? 0.8;
  let dirs = fibSphere(Math.max(3, Math.round(o.lobes / (1 - (o.minY ?? -0.3)) * 2)), o.minY ?? -0.3, 0.45, rndL);
  if (o.clusters) {
    // sub-crowns: k cluster directions around the crown, each lobe = a cluster direction + a small jitter
    const k = o.clusters, a0 = rndL() * Math.PI * 2;
    const cl = Array.from({ length: k }, (_, i) => { const a = a0 + (i / k) * Math.PI * 2 + (rndL() - 0.5) * 0.8, y = (o.minY ?? -0.3) * 0.3 + 0.25 + (rndL() - 0.5) * 0.5; const r = Math.sqrt(Math.max(0, 1 - y * y)); return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); });
    dirs = dirs.map((_, i) => cl[i % k].clone().add(new THREE.Vector3(rndL() - 0.5, (rndL() - 0.5) * 0.7, rndL() - 0.5).multiplyScalar(0.62)).normalize());
  }
  const radii = dirs.map(() => o.lobeR[0] + Math.pow(rndL(), 1.5) * (o.lobeR[1] - o.lobeR[0]));
  for (let i = 0; i < Math.min(o.lobes, dirs.length); i++) {
    const d = dirs[i];
    const R = radii[i];
    const out = 0.5 + rndL() * 0.15;
    const lc = new THREE.Vector3(c.x + d.x * (rx - R * out), c.y + d.y * (ry - R * 0.45), c.z + d.z * (rx - R * out));
    lobes.push({ p: lc, r: R });
    const shell = fibSphere(o.cards, -0.75, 0.35, rnd);
    for (const s of shell) {
      const canopyN = new THREE.Vector3((lc.x - c.x) / rx, ((lc.y - c.y) / ry) * 1.1 + 0.25, (lc.z - c.z) / rx).normalize();
      if (s.dot(canopyN) < (o.hide ?? -0.35)) continue;                         // faces the core: hidden
      const stray = rnd() < (o.stray ?? 0.12);
      const k = stray ? 0.9 + rnd() * 0.25 : 0.55 + rnd() * 0.12;
      const pos = lc.clone().add(new THREE.Vector3(s.x * R * k, s.y * R * k * squash, s.z * R * k));
      const ln = o.lobeNormal ?? 0.5;
      const n = s.clone().multiplyScalar(0.2 + ln).addScaledVector(canopyN, 1.2 - ln).normalize();
      const outer = s.dot(canopyN);
      const ao = aoMin + (1 - aoMin) * smooth(-0.9, 0.9, n.y * 0.7 + outer * 0.35 + (pos.y - c.y) / ry * 0.3);
      const tr = 0.93 + rnd() * 0.14, tb = 0.88 + rnd() * 0.16;
      const clump = !stray && (outer < 0.15 || n.y < -0.35 || rnd() < (o.clump ?? 0.45));
      cards.push({ c: pos, size: R * o.cardK * (stray ? 0.75 : 0.85 + rnd() * 0.35) * (clump ? 0.92 : 1), n, col: [ao * tr, ao, ao * tb], bend: (o.bend ?? 0.6) * (0.5 + 0.5 * smooth(-0.5, 1, outer)), phase: rnd(), dome: 0.6, atlas: clump ? 1 : 0 });
    }
  }
  // draw order inside the mesh = bottom-up (players look at canopies from below / the side): the lower cards' depth
  // rejects the hidden upper leaves before they are shaded — canopy fragments were ~6 layers deep
  cards.sort((a, b) => a.c.y - b.c.y);
  // dark core cards: plug holes so the sky never shows through the middle of a canopy (never cast: aPhase + 2); drawn
  // last (mostly hidden). The dense clump cards fill most holes, so fewer are needed.
  const core = o.core ?? Math.max(1, Math.round(o.lobes * 0.2));
  for (let k = 0; k < core; k++) {
    const d = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.3) * 0.6, rnd() - 0.5);
    const pos = c.clone().add(new THREE.Vector3(d.x * rx * 0.6, d.y * ry, d.z * rx * 0.6));
    cards.push({ c: pos, size: rx * 0.85, n: new THREE.Vector3(d.x, 0.6, d.z).normalize(), col: [aoMin * 0.75, aoMin * 0.8, aoMin * 0.78], bend: 0.1, phase: 2 + rnd() * 0.99, dome: 0.3, atlas: 1 });
  }
  return { cards, lobes };
}

/** trunk centre (x, z) at height y (m above ground) — shared/world/veg-scatter.ts (the bullet boxes use it too) */
const centreAt = treeCentreAt;

/**
 * Jungle-tree trunk + buttress ROOTS (not a single tent-like sheet with stretched
 * wood-grain UVs): a round flared trunk tube, and 4–6 SEPARATE rounded roots swept
 * along the shared flange crest (shared/world/veg-scatter.ts flangeAt — the server's root collider boxes follow the
 * same crest): each root is a tapered plank with a rounded top (wide foot, ~40 % narrower crest) whose top line drops
 * steeply off the trunk and flattens out along the ground (concave profile), snaking sideways with the flange sweep;
 * it starts inside the trunk a little ABOVE its attach height (the top edge runs into the bark as a fading ridge) and
 * its tip sinks into the soil. UVs: v runs ALONG the root (the bark's vertical fibres follow the root), u across its
 * profile, both at the trunk's texel density (1.6 m per tile). A lime moss band rides the crests and the ground line.
 */
function buttressTrunk(s: TreeShape, lod1: boolean): { geo: THREE.BufferGeometry; top: number } {
  const TILE = 1.6;
  const gs: THREE.BufferGeometry[] = [];
  // ---- trunk: flared tube (u = whole tiles around → no seam in the texture), root-crease AO at its foot
  {
    const ys = treeRings(s, lod1);
    const fr: Frame[] = ys.map((y, i) => {
      const [cx, cz] = centreAt(s, y);
      const [nx, nz] = centreAt(s, ys[Math.min(ys.length - 1, i + 1)] + (i === ys.length - 1 ? 0.5 : 0));
      const t = new THREE.Vector3(nx - cx, Math.max(0.2, (ys[Math.min(ys.length - 1, i + 1)] - y) || 0.5), nz - cz).normalize();
      const sd = new THREE.Vector3(1, 0, 0).sub(t.clone().multiplyScalar(t.x)).normalize();
      return { p: new THREE.Vector3(cx, y, cz), t, s: sd, n: new THREE.Vector3().crossVectors(t, sd).normalize(), d: y + 0.8 };
    });
    const nU = Math.max(2, Math.round((2 * Math.PI * treeRadius(s, 1.5)) / TILE));
    const HF = s.flanges.reduce((a, f) => Math.max(a, f.h), 0);
    // angular distance from the nearest root at height y → the crevice between two roots (0 on a root … 1 mid-gap) —
    // shared (veg-scatter treeCrevice / drawnTrunkRadius: the bullet boxes follow the same pulled-in tube)
    const crevice = (y: number, a: number) => treeCrevice(s, y, a);
    gs.push(tube(fr, {
      radial: lod1 ? 9 : 20,                   // (9, not 6: a hexagonal LOD1 trunk misses the bullet boxes' round core)
      // (between the roots the flare pulls IN — a deep gap, the roots stand proud)
      // (−30 % and high up the trunk — a shallower flare between the plank roots reads as one conical skirt)
      radius: (t, a) => { const y = ys[Math.round(t * (ys.length - 1))]; return treeRadius(s, y) * (1 - 0.3 * crevice(y, a) * Math.pow(Math.max(0, 1 - Math.max(0, y) / Math.max(2.6, 0.85 * HF)), 1.3)) * (1 + (lod1 ? 0 : 0.035 * Math.sin(a * 3 + y * 2.3) * Math.sin(a * 7 + 1.3))); },
      v: (t) => (ys[Math.round(t * (ys.length - 1))] + 0.8) / TILE, uRepeat: nU,
      color: (t, a) => {
        const y = ys[Math.round(t * (ys.length - 1))];
        const ao = (0.5 + 0.5 * smooth(-0.3, 1.6, y)) * (1 - 0.18 * smooth(s.trunkH * 0.55, s.trunkH, y));
        const moss = smooth(1.6, 0.1, y) * (0.5 + 0.5 * Math.max(0, Math.cos(a - 1.0)));
        const cr = 1 - 0.58 * crevice(y, a);                    // contact shade deep in the gaps between roots
        return [ao * cr * (1 - 0.4 * moss), ao * cr * (1 + 0.08 * moss), ao * cr * (1 - 0.6 * moss)];
      },
      capTop: true,
    }));
  }
  // ---- roots
  const K = lod1 ? 6 : 8;                      // stations along a root (LOD1 6: close to the root boxes)
  const WALL = lod1 ? 1 : 2, ARC = lod1 ? 2 : 4; // profile: wall points per side, top-arc segments
  for (const fl of s.flanges) {
    const rT0 = treeRadius(s, fl.h);
    const st: Array<{ x: number; z: number; y: number; hwB: number; hwT: number; f: number }> = [];
    // inside the trunk above the attach height (the crest runs up into the bark as a fading ridge), then the crest: the
    // shared flange profile rounded off into a low ground root near the tip, sunk at the very end; slim plates (tall thin
    // fins with deep gaps) — shared/world/veg-scatter.ts rootStations (the bullet boxes follow the same stations)
    for (const q of rootStations(s, fl, K, true)) st.push(q);
    st.sort((a, b) => a.f - b.f);
    void rT0;
    // profile points (lateral x, height y, arc length s): left foot → wall → rounded crest → wall → right foot
    const pos: number[] = [], uvs: number[] = [], col: number[] = [], idx: number[] = [];
    let along = 0;
    const nP = 2 * (WALL + 1) + ARC - 1;
    st.forEach((q, i) => {
      if (i > 0) { const p = st[i - 1]; along += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); }
      const a = st[Math.max(0, i - 1)], b = st[Math.min(st.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const lx = -dz, lz = dx;
      const yTop = q.y, rT = Math.max(0.02, q.hwT), yArc = yTop - rT;
      const prof: Array<[number, number]> = [];
      for (let w = 0; w <= WALL; w++) { const yy = -0.35 + (yArc + 0.35) * (w / (WALL + 0.001)); const k2 = yy < 0 ? 0 : yy / Math.max(0.01, yArc); prof.push([-(q.hwB + (rT - q.hwB) * Math.pow(Math.min(1, k2), 0.7)) * (1 + 0.06 * Math.sin(k2 * 3)), Math.min(yy, yArc)]); }
      for (let j = 1; j < ARC; j++) { const th = Math.PI - (j / ARC) * Math.PI; prof.push([Math.cos(th) * rT, yArc + Math.sin(th) * rT]); }
      for (let w = WALL; w >= 0; w--) { const yy = -0.35 + (yArc + 0.35) * (w / (WALL + 0.001)); const k2 = yy < 0 ? 0 : yy / Math.max(0.01, yArc); prof.push([(q.hwB + (rT - q.hwB) * Math.pow(Math.min(1, k2), 0.7)) * (1 + 0.06 * Math.sin(k2 * 3 + 1)), Math.min(yy, yArc)]); }
      // arc length around the profile, centred on the crest (u = 0 at the top line)
      const sArr = [0]; for (let j = 1; j < prof.length; j++) sArr.push(sArr[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]));
      const sMid = sArr[Math.floor(prof.length / 2)];
      prof.forEach(([x, y], j) => {
        pos.push(q.x + lx * x, y, q.z + lz * x);
        uvs.push((sArr[j] - sMid) / TILE + 0.37 * fl.a, along / TILE);
        // AO: soil contact, the crease where the root meets the trunk; moss rides the crest and the ground line
        const crest = Math.max(0, 1 - Math.abs(sArr[j] - sMid) / (rT * 2.2 + 0.12));
        const ground = smooth(0.45, 0.05, y);
        const ao = (0.5 + 0.5 * smooth(-0.3, 0.9, y)) * (1 - 0.3 * smooth(0.12, 0, q.f)) * (0.93 + 0.12 * crest);
        const moss = Math.min(1, crest * (0.55 + 0.45 * smooth(0, 0.35, q.f)) + ground * 0.55) * (q.f < 0 ? 0.4 : 1);
        col.push(ao * (1 - 0.46 * moss), ao * (1 + 0.14 * moss), ao * (1 - 0.66 * moss));
      });
    });
    for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < nP - 1; j++) {
      const a = i * nP + j, b = a + nP;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // outward normals (the winding depends on the sweep direction)
    const Nn = g.attributes.normal as THREE.BufferAttribute;
    let dot = 0; const mid = Math.floor(nP / 2);
    for (let i = 0; i < st.length; i++) { const k = i * nP + mid; dot += Nn.getY(k); }
    if (dot < 0) { const I = g.index!.array as Uint16Array | Uint32Array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.index!.needsUpdate = true; g.computeVertexNormals(); }
    g = finalize(g, { bend: 0 });
    gs.push(g);
  }
  return { geo: mergeAll(gs), top: s.trunkH };
}

export function buildJungleTree(variant: number): Species {
  const m = materials();
  const v = variant % 5;
  const s = jungleTreeShape(v);
  const rnd = mulberry32(2400 + v * 31);
  const pts = s.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const top = pts[pts.length - 1];
  const TILE = 1.6;
  const rTop = treeRadius(s, s.trunkH);
  // ---- canopy: 6–10 BIG leaf masses (hundreds of small leaf stickers read noisy) — each lobe a shell of large
  // cards whose normals point out of THEIR lobe (each mass is lit as one puff: sun side, shade side, dark core)
  // crown SILHOUETTES (distant crowns must not be identical round puffs): 0 understory = round,
  // 1 canopy = 3 irregular sub-crowns, 2 emergent = a wide FLAT-TOPPED umbrella (lobes on the upper cap only), 3 =
  // spreading 4-mass crown with sky gaps, 4 = tall oval
  const shapeK = [[1, 1, 0], [1.05, 1, 0.1], [1.3, 0.55, 0.35], [1.12, 0.95, 0], [0.82, 1.4, 0.1]][v];
  const rx = s.rx * shapeK[0], ry = s.ry * shapeK[1];
  const canopyC = new THREE.Vector3(top.x, s.crownY + s.ry * shapeK[2], top.z);
  const nLobes = (v === 3 ? 11 : v === 4 ? 7 : v === 2 ? 11 : 8) + Math.floor(rnd() * 3);
  // each lobe = 4 big mass cards at different depths (parallax = volume); the mass texture's own bumps give the crown
  // 20–40 lit puffs with shaded creases between them
  // (the mass texture is dense: 3 cards per lobe cover what 6 spray cards did — canopy overdraw is veg's main GPU cost)
  const cOpts: CanopyOpts = {
    // (perf: 2 bigger cards per lobe, not 3 — 30 % fewer LOD0 canopy cards)
    lobes: nLobes, lobeR: v === 2 ? [rx * 0.28, rx * 0.4] : [rx * 0.36, rx * 0.54], cards: 2, cardK: 2.35, aoMin: 0.36,
    minY: v === 2 ? 0.05 : v === 3 ? -0.15 : v === 0 ? -0.5 : v === 4 ? -0.6 : -0.35, squash: v === 2 ? 0.55 : 0.8,
    stray: 0, clump: 0.5, lobeNormal: 0.9, core: 0, hide: 0.05, clusters: v === 1 ? 3 : v === 3 ? 4 : 0,
  };
  const cDetail = lobedCanopy(2100 + v, canopyC, rx, ry, cOpts);
  const cLow = lobedCanopy(2100 + v, canopyC, rx, ry, { ...cOpts, cards: 2, cardK: 2.45, hide: 0.25 });
  // ---- limbs (straight limbs read as a wire umbrella from below):
  // the trunk FORKS at the crown base into 3–4 THICK
  // limbs (they start inside the trunk top — a real crotch) that wander to their lobes through 3–4 soft bends (a random
  // walk that rises, swings side to side and levels out), taper to 0.4 of their base and END INSIDE a leaf mass; one
  // thick secondary leaves each limb at 45–65 % of its length (collar, 0.6 of the limb there) toward the neighbouring
  // lobe, 2 bends, also ending in the leaves. The lower side boughs carry their own small leaf clump at the tip (no
  // bare stick ever ends in the air). No thin straight twigs.
  interface Limb { pts: THREE.Vector3[]; r0: number; r1: number; sec: boolean }
  const limbs: Limb[] = [];
  /** extra leaf clumps at bough tips (cards appended to both canopy tiers) */
  const tipClumps: Array<{ p: THREE.Vector3; r: number }> = [];
  {
    const rb = mulberry32(2200 + v);
    /** a smooth path a → b with `bends` alternating side swings (amp × length) and an arching rise */
    // (smooth waves, not zigzags: the sideways offset is a sine of `bends` half-periods under a sin(πt) envelope, plus a
    // smaller vertical wave, sampled densely — the tube's spline then carries soft S-bends with no elbows)
    const bendy = (a: THREE.Vector3, b: THREE.Vector3, bends: number, amp: number, rise: number): THREE.Vector3[] => {
      const d = b.clone().sub(a), L = d.length(), dir = d.clone().normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      const ph = rb() * Math.PI, ph2 = rb() * Math.PI, A = amp * L * (0.75 + 0.5 * rb()), n = 3 + bends * 2;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, env = Math.sin(t * Math.PI);
        const p = a.clone().addScaledVector(d, t);
        p.addScaledVector(side, A * env * Math.sin(t * Math.PI * bends + ph));
        p.y += rise * L * env * (0.8 + 0.2 * Math.sin(ph2)) + A * 0.5 * env * Math.sin(t * Math.PI * (bends - 1) + ph2);
        pts.push(p);
      }
      return pts;
    };
    const lobes = cDetail.lobes.slice().sort((a, b) => Math.atan2(a.p.z - top.z, a.p.x - top.x) - Math.atan2(b.p.z - top.z, b.p.x - top.x));
    const nL = Math.min(lobes.length, 3 + Math.floor(rb() * 2));
    for (let i = 0; i < nL; i++) {
      const la = lobes[Math.floor((i / nL) * lobes.length)], lb = lobes[Math.floor(((i + 0.5) / nL) * lobes.length) % lobes.length];
      // the limb ends deep inside its lobe (the mass cards sit at 0.55–0.67 of the lobe radius from its centre)
      const tgt = la.p.clone().lerp(canopyC, 0.22);
      const dir = tgt.clone().sub(top); dir.y = 0; dir.normalize();
      const start = top.clone().add(new THREE.Vector3(0, -0.9, 0));
      const crotch = top.clone().addScaledVector(dir, rTop * 0.55).add(new THREE.Vector3(0, 0.4, 0));
      const rl = rTop * (0.74 - 0.08 * i / nL);
      const path = [start, ...bendy(crotch, tgt, 3 + Math.floor(rb() * 2), 0.05, 0.1)];
      limbs.push({ pts: path, r0: rl, r1: rl * 0.4, sec: false });
      // one thick secondary to the neighbouring lobe, branching off at 45–65 % of the limb
      const fr = curveFrames(path, 24), ft = 0.45 + rb() * 0.2, bp = fr[Math.round(ft * 24)].p;
      const tip = lb.p.clone().lerp(canopyC, 0.25);
      if (tip.distanceTo(bp) > 1.2) limbs.push({ pts: bendy(bp, tip, 2, 0.06, 0.12), r0: rl * (1 - 0.6 * ft) * 0.62, r1: rl * 0.16, sec: true });
    }
    // lower side boughs (the wide crowns): a bendy bough that ends in its own leaf clump
    const nSide = v === 2 || v === 3 ? 2 : 1;
    for (let i = 0; i < nSide; i++) {
      const hy = s.trunkH * (0.7 + 0.12 * i + rb() * 0.05), [cx, cz] = centreAt(s, hy);
      const a = rb() * Math.PI * 2, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const base = new THREE.Vector3(cx, hy, cz).addScaledVector(d, treeRadius(s, hy) * 0.3);
      const out = base.clone().addScaledVector(d, rx * 0.42).add(new THREE.Vector3(0, rx * 0.3, 0));
      limbs.push({ pts: bendy(base, out, 3, 0.05, 0.12), r0: rTop * 0.5, r1: rTop * 0.2, sec: true });
      tipClumps.push({ p: out, r: rx * 0.26 });
    }
  }
  const limbGeo = (radial: number, withSec: boolean) => mergeAll(limbs.filter((l) => withSec || !l.sec).map((l) => tube(curveFrames(l.pts, withSec ? (l.sec ? 10 : 14) : 5), {
    radial,
    // swollen collar where the limb leaves the trunk, smooth taper to r1 (0.4 of the base), capped end (in the leaves)
    radius: (t) => (l.r0 + (l.r1 - l.r0) * Math.pow(t, 0.85)) * (1 + 0.3 * Math.pow(Math.max(0, 1 - t / 0.16), 2)),
    v: (_t, d) => d / TILE, uRepeat: 1,
    // (light: seen from below the limbs are lit by the ground / understory bounce, not near-black)
    color: (t) => { const a = 0.78 + 0.2 * t; return [a, a, a]; },
    capTop: true,
  })));
  // leaf clumps at the bough tips: 4 dense-clump cards around each tip
  if (tipClumps.length) {
    const rc = mulberry32(2500 + v);
    const clumpCards = (k: number): Card[] => tipClumps.flatMap(({ p, r }) => Array.from({ length: k }, () => {
      const o = new THREE.Vector3(rc() - 0.5, (rc() - 0.3) * 0.7, rc() - 0.5).multiplyScalar(r * 0.9);
      const n = o.clone().add(new THREE.Vector3(0, r * 0.4, 0)).normalize();
      const ao = 0.62 + 0.3 * smooth(-0.6, 0.8, n.y);
      return { c: p.clone().add(o), size: r * 2.3 * (0.85 + rc() * 0.3), n, col: [ao, ao, ao * 0.96] as [number, number, number], bend: 0.5, phase: rc(), dome: 0.6, atlas: 1 };
    }));
    cDetail.cards.push(...clumpCards(4)); cDetail.cards.sort((a, b) => a.c.y - b.c.y);
    cLow.cards.push(...clumpCards(2)); cLow.cards.sort((a, b) => a.c.y - b.c.y);
  }
  // ---- lianas (no sharp V-kinks): bark-brown ropes 10–14 cm thick as SMOOTH catenaries
  // (cosh sag, 18 segments) between limb tips and long hanging strands with a lazy S and a curled tip (14 segments),
  // never through the trunk or the ground
  const lianas = () => {
    const gs: THREE.BufferGeometry[] = [];
    const rl = mulberry32(2300 + v);
    const strand = (p: THREE.Vector3[], w: number, segs: number) => {
      const fr = curveFrames(p, segs, 0.5);
      gs.push(tube(fr, { radial: 4, radius: (t) => w * (1 - 0.3 * t), v: (_t, d) => d / 0.8, uRepeat: 1, bend: (t) => 0.1 + t * 0.5, phase: rl() * 6.283, color: (t) => { const a = 0.66 + 0.1 * t; return [a * 0.86, a * 0.84, a * 0.62]; } }));
    };
    const clearOfTrunk = (q: THREE.Vector3) => q.y > 1.4 && (q.y > s.trunkH + 0.5 || Math.hypot(q.x - centreAt(s, q.y)[0], q.z - centreAt(s, q.y)[1]) > treeRadius(s, q.y) + 0.45);
    // (no hanging bark strands: 5 cm rods falling 3–9 m nearly straight read as vertical poles in the sky gaps;
    // the tree keeps 2–3 deep catenary LOOPS between its limb ends
    // inside the leaves — the hanging greenery is the vine kind's leafy tendrils)
    const anchors = limbs.filter((l) => !l.sec).map((l) => l.pts[l.pts.length - 1]);
    let made = 0;
    for (let tries = 0; tries < 30 && made < 3; tries++) {
      const a = anchors[Math.floor(rl() * anchors.length)].clone();
      if (rl() < 0) {
        // hanging strand: falls straight-ish, drifts out a little in a slow S, the tip curls
        const drop = 3.2 + rl() * Math.min(6, a.y - 3.5);
        const out = new THREE.Vector3(rl() - 0.5, 0, rl() - 0.5).normalize().multiplyScalar(0.8 + rl() * 1.2);
        const side = new THREE.Vector3(out.z, 0, -out.x).normalize().multiplyScalar(0.25 + rl() * 0.2);
        const ph = rl() * 6.28;
        const p: THREE.Vector3[] = [];
        for (let k = 0; k <= 8; k++) {
          const u = k / 8;
          p.push(a.clone().addScaledVector(out, Math.sin(u * Math.PI * 0.5)).add(new THREE.Vector3(0, -drop * u, 0)).addScaledVector(side, Math.sin(u * Math.PI * 1.3 + ph) * u));
        }
        p[8].addScaledVector(out, 0.18).y += 0.18;               // curled tip
        if (!p.every(clearOfTrunk)) continue;
        strand(p, 0.05 + rl() * 0.015, 12);
      } else {
        const c2 = anchors[Math.floor(rl() * anchors.length)].clone();
        const span = a.distanceTo(c2);
        if (span < 3) continue;
        // catenary y = c·cosh(x/c): pick the sag, solve c numerically once; 12 control points
        // (DEEP loops — a shallow sag read as a straight rope from below)
        const sag = 1.4 + rl() * 1.4 + span * 0.28;
        let lo = 0.05, hi = 1000;
        for (let it = 0; it < 50; it++) { const m = Math.sqrt(lo * hi); if (m * (Math.cosh(span / (2 * m)) - 1) > sag) lo = m; else hi = m; }
        const cc = Math.sqrt(lo * hi);
        const p: THREE.Vector3[] = [];
        for (let k = 0; k <= 12; k++) {
          const u = k / 12, x = (u - 0.5) * span;
          const q = a.clone().lerp(c2, u);
          q.y -= sag - (cc * Math.cosh(x / cc) - cc);
          p.push(q);
        }
        if (!p.every(clearOfTrunk)) continue;
        strand(p, 0.036 + rl() * 0.012, 16);
      }
      made++;
    }
    return mergeAll(gs);
  };
  const lian = lianas();
  // ---- the crown = the lobes (+ the bough-tip clumps) as volumetric 3D leaf clumps (species/crown.ts)
  const clumps: Clump[] = [...cDetail.lobes.map((l) => ({ p: l.p, r: l.r })), ...tipClumps.map((t) => ({ p: t.p, r: t.r * 0.95 }))];
  // satellites: 1–2 small clumps bulging out of every lobe's outer / upper side (no round topiary balls — the crown's
  // outline is lumpy, cloud-like masses)
  {
    const rs = mulberry32(2700 + v);
    for (const l of cDetail.lobes) {
      const out = l.p.clone().sub(canopyC); out.y = out.y * 0.5 + ry * 0.35; out.normalize();
      const k = 1 + Math.floor(rs() * 2);
      for (let i = 0; i < k; i++) {
        const d = out.clone().add(new THREE.Vector3(rs() - 0.5, (rs() - 0.3) * 0.8, rs() - 0.5).multiplyScalar(1.3)).normalize();
        const r = l.r * (0.42 + rs() * 0.16);
        clumps.push({ p: l.p.clone().addScaledVector(d, l.r * 0.72), r, hull: 0 });
      }
    }
  }
  const cs = Math.min(1.25, Math.max(0.8, rx / 6));
  const crownO = { seed: 2600 + v, c: canopyC, rx, ry, density: 0.42, size: [0.95 * cs, 1.55 * cs] as [number, number], radial: 0.3, hull: 1, hullK: 0.72, hullUV: [0.5, 0.5, 0.4] as [number, number, number], squash: v === 2 ? 0.66 : 0.84, aoMin: 0.45, lobeNormal: 0.7 };
  const crown0 = crownGeometry(clumps, crownO);
  const crown1 = crownGeometry(clumps, { ...crownO, density: 0.13, size: [1.45 * cs, 2.1 * cs], hull: 0, radial: 0.25 });
  void cLow;
  const btr0 = buttressTrunk(s, false), btr1 = buttressTrunk(s, true);
  // one bark material for every silhouette (the darker B bark is a vertex tint) and one canopy material per mass atlas
  const barkM = m.bark;
  const T = TREE_TINT[v];
  const parts = [
    { name: "bark", mats: barkM, lod0: tintGeo(mergeAll([btr0.geo, limbGeo(6, true), lian]), T.bark), lod1: tintGeo(mergeAll([btr1.geo, limbGeo(5, false)]), T.bark) },
    { name: "canopy", mats: m.crown, lod0: tintGeo(crown0, T.leaf), lod1: tintGeo(crown1, T.leaf) },
  ];
  // under-canopy darkening on LOD1 bark (LOD1 casts no shadows: without this the distant trunks read as pale sticks)
  darken(parts[0].lod1, 0.55);
  const box = new THREE.Box3();
  for (const p of parts) if (p.lod0.attributes.position) { p.lod0.computeBoundingBox(); box.union(p.lod0.boundingBox!); }
  box.expandByScalar(rx * 0.2);   // billboard cards reach past their fixed-orientation bounds
  const center = box.getCenter(new THREE.Vector3());
  return {
    id: `jungle-tree:${variant}`, kind: "jungle-tree", variant, parts,
    height: box.max.y, radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z), center, boundR: box.getSize(new THREE.Vector3()).length() / 2,
    // (perf: LOD1 → impostor at 75 m, not 110 — the longer LOD1 range cost 0.8–1.8 ms at the jungle cameras)
    // (3D crowns cost ~3× flat cards per LOD1 tree — LOD1 → impostor at 62 m; the impostor bakes the same
    // clumps, so the switch keeps the silhouette)
    lod0: 28, lod1: 62, impostor: true, shadow: true,
  };
}

/** multiply a geometry's vertex colours (bake shade) */
export function darken(g: THREE.BufferGeometry, k: number) {
  const c = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!c) return;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  c.needsUpdate = true;
}

export function buildBush(variant: number): Species {
  const m = materials();
  const v = variant % 3;
  const rnd = mulberry32(3000 + v * 13);
  const rx = 1.0 + rnd() * 0.5, ry = 0.7 + rnd() * 0.35;
  const c = new THREE.Vector3(0, ry * 0.85, 0);
  // irregular leaf-spray clump: 3–5 uneven lobes, strays poke out, low flat base
  // (an irregular clump of a few big mass cards — not a round ball of leaf stickers)
  const o: CanopyOpts = { lobes: 3 + Math.floor(rnd() * 3), lobeR: [rx * 0.42, rx * 0.68], cards: 3, cardK: 1.65, aoMin: 0.5, minY: -0.05, squash: 0.72, bend: 0.35, stray: 0.24, core: 0, clump: 0.45, lobeNormal: 0.8, hide: -0.4, clusters: v === 1 ? 0 : 2 };
  // (the broad-leaf bushes keep a lower, smaller card clump — the big leaves carry the silhouette)
  const broad = v !== 1;
  const cc = broad ? c.clone().setY(ry * 0.62) : c, rxx = broad ? rx * 0.82 : rx, ryy = broad ? ry * 0.75 : ry;
  const hi = lobedCanopy(3100 + v, cc, rxx, ryy, o);
  const lo = lobedCanopy(3100 + v, cc, rxx, ryy, { ...o, cards: 2, cardK: 2.0 });
  // the clump is a volumetric 3D crown (species/crown.ts), not camera-facing mass cards
  void lo;
  const bClumps: Clump[] = hi.lobes.map((l) => ({ p: l.p, r: l.r * 1.05 }));
  const bO = { seed: 3300 + v, c: cc, rx: rxx, ry: ryy, density: 2.6, size: [0.42, 0.62] as [number, number], radial: 0.35, hull: 1, hullK: 0.7, hullUV: [0.5, 0.5, 0.4] as [number, number, number], squash: 0.78, aoMin: 0.48, lobeNormal: 0.65, bend: 0.4 };
  const parts: Species["parts"] = [{ name: "leaf", mats: m.bushCrown, lod0: crownGeometry(bClumps, bO), lod1: crownGeometry(bClumps, { ...bO, density: 0.9, size: [0.6, 0.85], hull: 0, radial: 0.25 }) }];
  if (broad) {
    // 6–8 broad leaves on short petioles from the clump's heart: they rise at 45–70°, arch out and droop at the tip,
    // spread around the bush (golden-angle yaw) and reach ~0.4 m past the clump — a leafy crown, not a ball
    const rl = mulberry32(3200 + v);
    const n = 6 + Math.floor(rl() * 3);
    const spec = Array.from({ length: n }, (_, i) => ({ yaw: i * 2.39996 + rl() * 0.6, pitch: (46 + rl() * 26) * (Math.PI / 180), droop: (60 + rl() * 40) * (Math.PI / 180), L: (0.95 + rl() * 0.5) * rx, y0: 0.25 + rl() * ry * 0.5, tint: 0.88 + rl() * 0.2, ph: rl() * 6.283, tw: (rl() - 0.5) * 0.5 }));
    const leaves = (segs: number, across: number) => mergeAll(spec.map((q) => {
      const d = new THREE.Vector3(Math.cos(q.yaw), 0, Math.sin(q.yaw));
      let p = new THREE.Vector3(d.x * 0.12, q.y0, d.z * 0.12);
      const pts = [p.clone()];
      for (let i = 1; i <= 8; i++) { const t = i / 8, a = q.pitch - q.droop * Math.pow(t, 1.5); p = p.clone().addScaledVector(d, (Math.cos(a) * q.L) / 8).add(new THREE.Vector3(0, (Math.sin(a) * q.L) / 8, 0)); pts.push(p); }
      return ribbon(curveFrames(pts, segs), {
        across, width: () => q.L * 0.25, fold: () => 0.14, curl: () => -0.08, twist: (t) => q.tw * t,
        bend: (t) => Math.pow(t, 1.3) * 0.6, phase: q.ph,
        color: (t) => { const a = (0.6 + 0.4 * smooth(0, 0.35, t)) * q.tint; return [a, a, a * 0.96]; },
      });
    }));
    parts.push({ name: "broad", mats: m.bushBroad, lod0: leaves(8, 2), lod1: leaves(3, 1) });
  }
  const box = new THREE.Box3(); for (const p of parts) { p.lod0.computeBoundingBox(); box.union(p.lod0.boundingBox!); }
  box.expandByScalar(0.3);
  return {
    id: `bush:${variant}`, kind: "bush", variant, parts, height: box.max.y, radius: rx + 0.8, center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    // (LOD0 casts: bushes with no shadow read as hovering on open sand)
    lod0: 22, lod1: 50, impostor: true, shadow: true,
  };
}

export function buildMangrove(variant: number): Species {
  const m = materials();
  const v = variant % 3;
  // three distinct shapes: squat spreading, tall narrow, lopsided leaning — the trunk line and the ARCHING prop roots
  // (a cage of arches) come from shared/world/veg-scatter.ts mangroveShape: the bullet boxes follow the same tubes
  const sh = mangroveShape(v);
  const rnd = mulberry32(4000 + v * 7);
  for (let i = 0; i < sh.rnd; i++) rnd();            // (the crown continues the shape's random stream)
  const H = sh.H;
  const trunkTop = new THREE.Vector3(...sh.trunk[2]);
  const trunkPts = sh.trunk.map((q) => new THREE.Vector3(...q));
  const roots = (radial: number) => {
    const gs: THREE.BufferGeometry[] = [];
    for (const r of sh.roots) {
      gs.push(tube(curveFrames(r.map((q) => new THREE.Vector3(...q)), MANGROVE_SEGS.root), { radial, radius: (t) => mangroveRootR(t), v: (_t, d) => d / 1.6, color: (t) => { const a2 = 0.62 + 0.3 * (1 - t); return [a2, a2 * 0.97, a2 * 0.92]; } }));
    }
    gs.push(tube(curveFrames(trunkPts, MANGROVE_SEGS.trunk), { radial: radial + 3, radius: (t) => mangroveTrunkR(t), v: (_t, d) => d / 1.6, color: () => [0.72, 0.7, 0.66], capTop: true }));
    return mergeAll(gs);
  };
  // a dense bushy dome that reaches down toward the water (mangrove islets), not a ball on a stick
  // (the crown sits LOW — its skirt comes down to ~1.8 m, over the root cage, not floating on a bare pole)
  const rx = [3.6, 3.0, 3.3][v] + rnd() * 0.7, ry = [2.0, 2.8, 2.3][v] + rnd() * 0.4;
  const c = new THREE.Vector3(trunkTop.x * 0.8, Math.max(1.9 + ry * 0.8, H - 0.9), trunkTop.z * 0.8);
  const o: CanopyOpts = { lobes: [9, 8, 8][v], lobeR: [rx * 0.4, rx * 0.62], cards: 4, cardK: 1.75, aoMin: 0.5, minY: -0.75, stray: 0.1, clump: 0.5, lobeNormal: 0.85, hide: -0.3, clusters: v === 1 ? 0 : 2 };
  const hi = lobedCanopy(4200 + v, c, rx, ry, o);
  const mClumps: Clump[] = hi.lobes.map((l) => ({ p: l.p, r: l.r * 1.05 }));
  const mO = { seed: 4300 + v, c, rx, ry, density: 1.0, size: [0.7, 1.05] as [number, number], radial: 0.3, hull: 1, hullK: 0.72, hullUV: [0.5, 0.5, 0.4] as [number, number, number], squash: 0.8, aoMin: 0.44, lobeNormal: 0.65, bend: 0.5 };
  const parts = [
    // (LOD1 keeps EVERY prop root — the bullet boxes follow them at every tier)
    // (and round roots — 16 / 8 sides: the thin roots are all edge, the boxes must match the tube)
    { name: "bark", mats: m.mangroveBark, lod0: roots(16), lod1: roots(8) },
    { name: "leaf", mats: m.mangroveCrown, lod0: crownGeometry(mClumps, mO), lod1: crownGeometry(mClumps, { ...mO, density: 0.4, size: [1.0, 1.4], hull: 0, radial: 0.25 }) },
  ];
  darken(parts[0].lod1, 0.7);
  const box = new THREE.Box3();
  for (const p of parts) { p.lod0.computeBoundingBox(); box.union(p.lod0.boundingBox!); }
  box.expandByScalar(0.4);
  return {
    id: `mangrove:${variant}`, kind: "mangrove", variant, parts, height: box.max.y, radius: rx + 1.2, center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    lod0: 28, lod1: 80, impostor: true, shadow: true,
  };
}

/** points of a catenary between a and b sagging `sag` m below the chord's midpoint (c·cosh), `n` segments */
function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] {
  const span = Math.max(0.1, Math.hypot(b.x - a.x, b.z - a.z));
  let lo = 0.05, hi = 1000;
  for (let it = 0; it < 50; it++) { const q = Math.sqrt(lo * hi); if (q * (Math.cosh(span / (2 * q)) - 1) > sag) lo = q; else hi = q; }
  const cc = Math.sqrt(lo * hi);
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n, x = (u - 0.5) * span;
    const p = a.clone().lerp(b, u);
    p.y -= sag - (cc * Math.cosh(x / cc) - cc);
    return p;
  });
}

/**
 * Hanging vine (decorative): smooth curves (no sharp V-kinks, no leaf stickers at the joints, never a fence-like
 * straight bar with evenly spaced vertical strands):
 *   variant 0 LIANA LOOPS: a thin (8 cm) woody liana whose ends vanish into the crowns
 *     ~12 m up, sagging in a deep catenary to ~8 m, with two smaller loops (4–6 m spans, 1.5–2.6 m sag) swinging off it
 *     sideways and 3 thin tendrils dangling 1.5–3.5 m in lazy curves; a few small leaf sprays, most of them where
 *     the tendrils end. 30 segments per loop — no kinks.
 *   variant 1 LEAFY CURTAIN: a hidden rope up in the canopy (13 m) dropping 12–16 thin green strands of uneven length
 *     (2.5–6 m, longest mid-span) at uneven spacing, each with a slight sway curve and DENSE leaf sprays (every
 *     ~0.3 m) — a veil of hanging greenery, not a row of sticks.
 * Model +X runs along the span.
 */
export function buildVine(variant: number): Species {
  const m = materials();
  const v = variant % 2;
  const rnd = mulberry32(12000 + (v ? 3 : 1) * 17);
  const curtain = v === 1;
  const loops: Array<{ pts: THREE.Vector3[]; w: number }> = [];
  const strands: Array<{ pts: THREE.Vector3[]; w: number; leaf: number }> = [];
  /** a hanging tendril from `a`, dropping `drop` m with a lazy sideways curve and a curled tip */
  const tendril = (a: THREE.Vector3, drop: number, sway: number, n = 12): THREE.Vector3[] => {
    const ph = rnd() * 6.28, dir = new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(a.clone().addScaledVector(dir, sway * Math.sin(t * Math.PI * 0.9 + ph * 0.2) * t).add(new THREE.Vector3(0.08 * Math.sin(t * 5 + ph) * t, -drop * t, 0.08 * Math.cos(t * 4 + ph) * t)));
    }
    pts[n].addScaledVector(dir, 0.12).y += 0.1;
    return pts;
  };
  if (!curtain) {
    const L = 13, a = new THREE.Vector3(-L / 2, 12.2, (rnd() - 0.5) * 1.2), b = new THREE.Vector3(L / 2, 11.6, (rnd() - 0.5) * 1.2);
    const main = catenary(a, b, 3.6, 30);
    loops.push({ pts: main, w: 0.042 });
    // two smaller loops swinging off the main liana to the sides
    for (let k = 0; k < 2; k++) {
      const i0 = 4 + Math.floor(rnd() * 6) + k * 12, p0 = main[Math.min(main.length - 1, i0)];
      const p1 = p0.clone().add(new THREE.Vector3(2.5 + rnd() * 2.5, 0.8 + rnd() * 1.2, (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 1.5)));
      loops.push({ pts: catenary(p0, p1, 1.5 + rnd() * 1.1, 22), w: 0.03 });
    }
    // (short, curly tendrils — a 3.5 m drop reads as a straight pole from the trail)
    for (let k = 0; k < 3; k++) {
      const p0 = main[6 + Math.floor(rnd() * 19)];
      strands.push({ pts: tendril(p0, 1.0 + rnd() * 1.3, 0.55 + rnd() * 0.35), w: 0.018 + rnd() * 0.005, leaf: 0.7 });
    }
  } else {
    const L = 8.5, a = new THREE.Vector3(-L / 2, 13.2, 0), b = new THREE.Vector3(L / 2, 12.8, (rnd() - 0.5) * 1.4);
    // (the curtain's rope sags into a soft loop and hides under
    // a dense leaf cover — a shallow 4 cm bar read as a straight diagonal pole from below)
    const rope = catenary(a, b, 1.9, 24);
    loops.push({ pts: rope, w: 0.026 });
    const ns = 12 + Math.floor(rnd() * 5);
    for (let k = 0; k < ns; k++) {
      const u = Math.min(0.97, Math.max(0.03, (k + rnd() * 0.9) / ns + (rnd() - 0.5) * 0.06));
      const p0 = rope[Math.round(u * (rope.length - 1))].clone();
      const drop = 2.5 + 3.3 * Math.sin(u * Math.PI) * (0.55 + rnd() * 0.45);
      strands.push({ pts: tendril(p0, drop, 0.25 + rnd() * 0.3, 14), w: 0.014 + rnd() * 0.007, leaf: 0.3 });
    }
  }
  const cards: Card[] = [];
  const leafAlong = (pts: THREE.Vector3[], every: number, size: number, hang: boolean, tipCluster: boolean) => {
    const fr = curveFrames(pts, 40, 0.5), len = fr[fr.length - 1].d;
    let d = every * (0.3 + rnd() * 0.6), side = rnd() < 0.5 ? 1 : -1;
    const put = (dd: number, sz: number) => {
      let i = 1; while (i < fr.length - 1 && fr[i].d < dd) i++;
      const f = fr[i];
      side = -side;
      const off = f.s.clone().multiplyScalar(0.08 * side).add(new THREE.Vector3(0, hang ? -0.05 : -0.1, 0));
      const tone = 0.95 + rnd() * 0.15;
      cards.push({ c: f.p.clone().add(off), size: sz * (0.75 + rnd() * 0.5), n: f.s.clone().multiplyScalar(side).add(new THREE.Vector3(rnd() - 0.5, 0.3, rnd() - 0.5)).normalize(), col: [tone * 0.96, tone, tone * 0.86], bend: hang ? 0.8 : 0.6, phase: rnd(), dome: 0.5, atlas: 0 });
    };
    while (d < len - 0.1) { put(d, size); d += every * (0.6 + rnd() * 0.8); }
    if (tipCluster) { put(len - 0.05, size * 1.3); put(len - 0.35, size * 1.15); }
  };
  // modelled leaf strings: heart-shaped leaves on short petioles, alternating round the strand in a 137° spiral,
  // uneven sizes and gaps, the odd leaf missing, a cluster at the tip — each leaf a V-folded, drooping ribbon
  type LeafSpec = { p: THREE.Vector3; out: THREE.Vector3; len: number; tone: number; droop: number };
  const leaves: LeafSpec[] = [];
  const leafString = (pts: THREE.Vector3[], every: number, size: number, tipCluster: boolean) => {
    const fr = curveFrames(pts, 40, 0.5), len = fr[fr.length - 1].d;
    let d = every * rnd(), rot = rnd() * 6.28;
    const put = (dd: number, sz: number) => {
      let i = 1; while (i < fr.length - 1 && fr[i].d < dd) i++;
      const f = fr[i]; rot += 2.4 + (rnd() - 0.5) * 0.5;
      const out = f.s.clone().multiplyScalar(Math.cos(rot)).addScaledVector(f.n, Math.sin(rot)).normalize();
      leaves.push({ p: f.p.clone(), out, len: sz * (0.6 + rnd() * 0.8), tone: 0.86 + rnd() * 0.24, droop: 0.5 + rnd() * 0.5 });
    };
    while (d < len - 0.1) { if (rnd() > 0.12) put(d, size); d += every * (0.55 + rnd() * 0.9); }
    if (tipCluster) { put(len - 0.04, size * 1.15); put(len - 0.18, size); put(len - 0.3, size * 0.9); }
  };
  if (curtain) { for (const st of strands) leafString(st.pts, 0.14, 0.2, true); leafString(loops[0].pts, 0.16, 0.24, false); }
  else { for (const lp of loops) leafString(lp.pts, 0.55, 0.2, false); for (const st of strands) leafString(st.pts, 0.16, 0.2, true); }
  const leafGeo = (keep: (i: number) => boolean, grow: number, segs: number) => mergeAll(leaves.filter((_, i) => keep(i)).map((lf) => {
    // the petiole leaves the strand outward and down; the blade droops from it
    const L = lf.len * grow, base = lf.p.clone().addScaledVector(lf.out, 0.03 + L * 0.12).add(new THREE.Vector3(0, -0.02, 0));
    const dir = lf.out.clone().setY(lf.out.y - 0.6).normalize();
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 4; k++) { const t = k / 4; pts.push(base.clone().addScaledVector(dir, L * t).add(new THREE.Vector3(0, -lf.droop * L * t * t * 0.6, 0))); }
    return ribbon(curveFrames(pts, segs), {
      across: 2, width: (t) => L * 0.42 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.06)), 0.75) * (1 - 0.25 * t), fold: () => 0.35, twist: () => 0,
      bend: (t) => 0.5 + 0.5 * t, phase: rnd() * 6.283,
      color: (t, u) => { const a = lf.tone * (0.72 + 0.28 * t) * (1 - 0.12 * Math.abs(u - 0.5) * 2); return [a * 0.92, a, a * 0.8]; },
    });
  }));
  void leafAlong;
  // woody olive-brown lianas; the curtain's strands are green aerial roots
  const col = (t: number): [number, number, number] => { const a = 0.78 + 0.1 * Math.sin(t * 9); return [a * 0.82, a * 0.8, a * 0.6]; };
  const colG = (t: number): [number, number, number] => { const a = 0.7 + 0.12 * t; return [a * 0.72, a * 0.86, a * 0.48]; };
  const ropeGeo = (segs: number, radial: number, withStrands: boolean) => mergeAll([
    ...loops.map((lp) => tube(curveFrames(lp.pts, segs), { radial, radius: (t) => lp.w * (1 - 0.15 * Math.sin(t * Math.PI)), v: (_t, d) => d / 0.8, uRepeat: 1, bend: (t) => 0.25 + 0.55 * Math.sin(t * Math.PI), color: col })),
    ...(withStrands ? strands.map((st) => tube(curveFrames(st.pts, Math.max(6, segs >> 1)), { radial: Math.max(3, radial - 1), radius: (t) => st.w * (1 - 0.45 * t), v: (_t, d) => d / 0.8, uRepeat: 1, bend: (t) => 0.4 + 0.6 * t, phase: rnd() * 6.28, color: curtain ? colG : col, capTop: true })) : []),
  ]);
  const parts = [
    // the curtain's strands are thin swaying green aerial roots (not straight poles), so every leaf hangs from something;
    // LOD1 keeps them with fewer segments and every other leaf
    { name: "rope", mats: m.vineRope, lod0: ropeGeo(30, 5, true), lod1: ropeGeo(10, 3, true), shadow: false },
    { name: "leaf", mats: m.vineLeaf3, lod0: leafGeo(() => true, 1, 4), lod1: leafGeo((i) => i % 2 === 0, 1.25, 2), shadow: false },
  ];
  const box = new THREE.Box3();
  for (const p of parts) { p.lod0.computeBoundingBox(); box.union(p.lod0.boundingBox!); }
  box.expandByScalar(0.6);
  return {
    id: `vine:${variant}`, kind: "vine", variant, parts, height: box.max.y, radius: 8, center: box.getCenter(new THREE.Vector3()), boundR: box.getSize(new THREE.Vector3()).length() / 2,
    lod0: 20, lod1: 125, impostor: false,
  };
}
