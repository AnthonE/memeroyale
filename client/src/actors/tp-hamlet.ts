// Thatched lookout hamlet for the char-05-third-person composition (the target art): red plank
// huts with thick layered thatch on timber stilts over grey rock outcrops, a lashed plank walkway + stairs, a tall
// X-braced watchtower with a round thatched roof and a big red flag, back huts on the rocks, and ground dressing
// (red shrine with plants, BANANA CO. crate, stone plinths, crates). Built at a world anchor by tp-set.ts.
//
// Layout is authored in the SHOT FRAME of the view camera — `cf(F, R)` = F metres along the camera heading, R metres
// to its right — converted to the anchor's local frame (the anchor lies BEARING right of the heading), with heights
// `h` above the camera's ground G0 (the CNVS LAB pad, y = 34 by contract). Placements were solved from the target art's
// frame positions (x %, y %) through the view camera (fov 55, pitch −3°, eye 1.38 m above the pad).
// Everything merges into 8 static meshes (one per material).
import * as THREE from "three";
import type { WorldCtx } from "../engine/engine";
import type { CamSpec } from "../engine/views";
import type { VegApi, PlantKind } from "../world/veg/api";
import { townTex, genClapboard } from "../world/pois/_kit/town-tex";
import { chamferBoxGeo, cylGeo } from "../world/pois/_kit/town-geo";
import { pbr, stoneMaterial } from "../world/pois/_kit/jungle-mat";
import { sculptRock, type SculptOpts } from "../world/pois/_kit/jungle-rocks";
import { timberSet, strawSet, coilSet, flagTex, stencilTex } from "./tp-hamlet-tex";
import {
  Bin, type HBins, type V3, type Occluder, type Opening, v3, at, mul, beam, log, lashing, paintBand, ropeLine, deckStrip, stairFlight, ladder,
  wall, gableThatch, coneThatch, bakeAO, reseed, rnd, jit, tone, C,
} from "./tp-hamlet-kit";

export interface HamletAnchor {
  /** world position of the hamlet's centre (on the ground) */
  x: number; z: number;
  /** yaw (radians, three.js rotation.y) of the hamlet's local frame: local −Z points AWAY from the viewer */
  yaw: number;
  /** world position of the view camera (so the builder can orient hero details toward it) */
  cam: [number, number, number];
}

/** the anchor lies this far right of the camera heading (tp-set TP.village.bearingDeg) */
const BEARING = THREE.MathUtils.degToRad(16);
/** a local-frame yaw that aligns an object with the camera frame (+X = camera right, −Z = camera forward) */
const YAW0 = BEARING;

// ------------------------------------------------------------------------------------------------ dev views
// World numbers of the view setup (camera (172.05, ·, −533.79) looking due east; right = +z) — dev only.
const CAM0: [number, number] = [172.05, -533.79];
const W = (F: number, R: number): [number, number] => [CAM0[0] + F, CAM0[1] + R];
const dv = (pF: number, pR: number, ph: number, tF: number, tR: number, th: number, fov: number): CamSpec => {
  const [px, pz] = W(pF, pR), [tx, tz] = W(tF, tR);
  return { pos: [px, ph, pz], target: [tx, th, tz], fov, rel: true, stage: "tp-dev" };
};
/** dev close-ups of the hamlet (merged by showcase.ts) */
export const views: Record<string, CamSpec> = {
  // eye level ~20 m in front of the left hut / walkway
  "wip-hamlet-front": dv(30, 10, 2.2, 50, 16, 5, 50),
  // 3/4 from above-left
  "wip-hamlet-34": dv(24, -14, 20, 52, 18, 1, 50),
  // from the right, along the walkway toward the left hut
  "wip-hamlet-side": dv(40, 44, 5, 52, 12, 3, 55),
  // ground dressing close-up (shrine / crates)
  "wip-hamlet-props": dv(15, 2, 1.8, 23, 6, 0.6, 50),
  // tower + flag
  "wip-hamlet-tower": dv(36, 12, 6, 50.5, 21, 11, 50),
};

// ------------------------------------------------------------------------------------------------ materials
let matCache: { key: THREE.WebGLRenderer; m: Record<keyof HBins, THREE.Material> } | null = null;
export function materials(ctx: WorldCtx): Record<keyof HBins, THREE.Material> {
  if (matCache && matCache.key === ctx.renderer) return matCache.m;
  const tt = timberSet(), st = strawSet(), cs = coilSet();
  const timber = new THREE.MeshStandardMaterial({ map: tt.map, normalMap: tt.normalMap, roughnessMap: tt.roughnessMap, vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.8, name: "hamlet:timber" });
  const paint = townTex(ctx.renderer).material("clapboard", () => genClapboard(512), { normalScale: 0.9 });
  paint.name = "hamlet:paint";
  const thatch = new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.normalMap, roughnessMap: st.roughnessMap, vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.7, name: "hamlet:thatch" });
  thatch.normalScale.setScalar(1.2);
  const rope = new THREE.MeshStandardMaterial({ map: cs.map, normalMap: cs.normalMap, roughnessMap: cs.roughnessMap, vertexColors: true, roughness: 1, metalness: 0, name: "hamlet:rope" });
  const rock = stoneMaterial(pbr(ctx, "boulder"), { triplanar: true, scale: 3.4, moss: 0.62, vertexColors: true, variation: 0.45, color: "#ffffff", normalScale: 1.1 }, pbr(ctx, "moss"));
  rock.name = "hamlet:rock";
  const fruit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, name: "hamlet:fruit" });
  const cloth = new THREE.MeshStandardMaterial({ map: flagTex(), side: THREE.DoubleSide, alphaTest: 0.45, roughness: 0.85, metalness: 0, vertexColors: true, name: "hamlet:cloth" });
  const decal = new THREE.MeshStandardMaterial({ map: stencilTex(), transparent: true, alphaTest: 0.15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.8, metalness: 0, vertexColors: true, name: "hamlet:decal" });
  matCache = { key: ctx.renderer, m: { timber, paint, thatch, rope, rock, fruit, cloth, decal } };
  return matCache.m;
}

// ------------------------------------------------------------------------------------------------ build context
interface K {
  B: HBins;
  /** shot frame → local xz */
  cf: (F: number, R: number) => { x: number; z: number };
  /** camera-aligned matrix at shot-frame (F, R), height h above G0, extra yaw d */
  fm: (F: number, R: number, h: number, d?: number) => THREE.Matrix4;
  G0: number;
  /** terrain height (local xz) */
  terr: (x: number, z: number) => number;
  /** terrain or rock top, whichever is higher (local xz) */
  ground: (x: number, z: number) => number;
  occ: Occluder[];
  rocks: THREE.Mesh[];
  plants: Array<[PlantKind, THREE.Matrix4]>;
}
const P = (M: THREE.Matrix4, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(M);
const yawOf = (M: THREE.Matrix4) => { const e = new THREE.Euler().setFromRotationMatrix(M, "YXZ"); return e.y; };
const occOf = (M: THREE.Matrix4, hx: number, hz: number, y: number, k = 0.45): Occluder => { const p = P(M, 0, 0, 0); return { x: p.x, z: p.z, yaw: yawOf(M), hx, hz, y, k }; };

// ------------------------------------------------------------------------------------------------ rocks
/**
 * A sculpted rock mass (chiselled superellipsoid, jungle-rocks kit) fitted into a box: centre at shot frame (F, R),
 * half sizes hw (across) × hd (along the view), top at h above G0, bottom buried under the lowest terrain around it.
 */
function rockMass(k: K, F: number, R: number, hw: number, hd: number, top: number, seed: number, o: Partial<SculptOpts> & { yaw?: number; res?: number; tint?: string; bottom?: number } = {}) {
  const c = k.cf(F, R);
  let lo = Infinity;
  for (const [dx, dz] of [[0, 0], [hw, 0], [-hw, 0], [0, hd], [0, -hd], [hw * 0.7, hd * 0.7], [-hw * 0.7, -hd * 0.7], [hw * 0.7, -hd * 0.7], [-hw * 0.7, hd * 0.7]]) lo = Math.min(lo, k.terr(c.x + dx, c.z + dz));
  const yTop = k.G0 + top, yBot = o.bottom !== undefined ? k.G0 + o.bottom : lo - 1.2;
  // res ×0.6: 40–70 m away the facets + strata carry the read; no shadow casting (at full res + casting, the rocks cost 44k tris)
  const g = sculptRock(seed, { cuts: o.cuts ?? 8, round: o.round ?? 0.08, boxy: o.boxy ?? 2.9, lump: o.lump ?? 0.05, base: o.base ?? -0.7, sideCuts: o.sideCuts ?? 0.65, strata: o.strata ?? 0.35, ext: o.ext ?? [1, 0.9, 0.85], res: Math.max(12, Math.round((o.res ?? 26) * 0.6)) });
  g.computeBoundingBox();
  const bb = g.boundingBox!, sx = (2 * hw) / (bb.max.x - bb.min.x), sy = (yTop - yBot) / (bb.max.y - bb.min.y), sz = (2 * hd) / (bb.max.z - bb.min.z);
  const cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2;
  g.translate(-cx, -bb.max.y, -cz);
  const M = at(c.x, yTop, c.z, YAW0 + (o.yaw ?? 0), sx, sy, sz);
  // warm grey with a slightly lighter top (vertex tint over the brownish boulder set)
  const tint = new THREE.Color(o.tint ?? "#c9cdd6");
  const n = g.attributes.position.count, cc = new Float32Array(n * 3), pos = g.attributes.position as THREE.BufferAttribute;
  const span = bb.max.y - bb.min.y;
  for (let i = 0; i < n; i++) {
    const t = (pos.getY(i) + span) / span;            // 0 bottom … 1 top
    const kk = 0.78 + 0.34 * t;
    cc[i * 3] = kk; cc[i * 3 + 1] = kk; cc[i * 3 + 2] = kk;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cc, 3));
  k.B.rock.add(g, M, tint);
  const hitG = g.clone().applyMatrix4(M);
  const mesh = new THREE.Mesh(hitG, RAYMAT); mesh.updateMatrixWorld(true);
  k.rocks.push(mesh);
}
const RAYMAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
/** cut stone block (plinths, retaining walls): boxy sculpted rock with crisp facets */
function stoneBlock(k: K, M: THREE.Matrix4, w: number, h: number, d: number, seed: number) {
  const g = sculptRock(seed, { cuts: 6, round: 0.05, boxy: 5, lump: 0.015, base: -0.95, sideCuts: 0.95, strata: 0, ext: [1, 0.8, 0.85], res: 16 });
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  g.translate(-(bb.max.x + bb.min.x) / 2, -bb.min.y, -(bb.max.z + bb.min.z) / 2);
  const cc = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute("color", new THREE.BufferAttribute(cc, 3));
  k.B.rock.add(g, mul(M, at(0, 0, 0, 0, w / (bb.max.x - bb.min.x), h / (bb.max.y - bb.min.y), d / (bb.max.z - bb.min.z))), tone("#d9dbe0", 0.06));
}

// ------------------------------------------------------------------------------------------------ small builders
/** post-and-rail railing along a→b (points at deck-top height) */
function railRun(k: K, a: V3, b: V3, o: { h?: number; step?: number } = {}) {
  const h = o.h ?? 1.0, L = a.distanceTo(b), n = Math.max(1, Math.ceil(L / (o.step ?? 1.35)));
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    log(k.B.timber, v3(p.x, p.y - 0.12, p.z), v3(p.x, p.y + h + 0.1, p.z), 0.055, C.woodDark, 7);
    lashing(k.B.rope, v3(p.x, p.y + h - 0.02, p.z), v3(0, 1, 0), 0.055, 0.1);
  }
  beam(k.B.timber, v3(a.x, a.y + h, a.z), v3(b.x, b.y + h, b.z), 0.075, 0.085, C.wood, 0.02);
  beam(k.B.timber, v3(a.x, a.y + h * 0.5, a.z), v3(b.x, b.y + h * 0.5, b.z), 0.06, 0.07, C.wood, 0.015);
}

/** painted plank crate: board body (clapboard boards in `color`), darker edge battens, optional lid, slats, stencil */
function crate(k: K, M: THREE.Matrix4, w: number, h: number, d: number, color: string, o: { lid?: boolean; slats?: boolean; label?: boolean; rope?: boolean } = {}) {
  const B = k.B, col = tone(color, 0.06), dark = new THREE.Color(color).multiplyScalar(0.62);
  if (o.slats) {
    B.timber.add(chamferBoxGeo(w - 0.08, h - 0.06, d - 0.08, 0.01), mul(M, at(0, h / 2, 0)), "#20160e");       // dark inside
    const rows = 4, sh = (h - 0.06) / rows;
    for (let r = 0; r < rows; r++) {
      const y = 0.05 + sh * (r + 0.5);
      for (const [sx, sz, len, rot] of [[0, d / 2 - 0.02, w, 0], [0, -d / 2 + 0.02, w, 0], [w / 2 - 0.02, 0, d, Math.PI / 2], [-w / 2 + 0.02, 0, d, Math.PI / 2]] as const)
        B.paint.add(chamferBoxGeo(len, sh * 0.72, 0.035, 0.008, [rnd() * 2, 0]), mul(M, at(sx, y, sz, rot)), col);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.paint.add(chamferBoxGeo(0.07, h, 0.07, 0.012), mul(M, at(sx * (w / 2 - 0.035), h / 2, sz * (d / 2 - 0.035))), dark);
    return;
  }
  B.paint.add(chamferBoxGeo(w, h, d, 0.02, [rnd() * 2, 0]), mul(M, at(0, h / 2, 0)), col);
  const bt = 0.055;
  // vertical corner battens + top/bottom bands
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.paint.add(chamferBoxGeo(bt, h + 0.01, bt, 0.01), mul(M, at(sx * (w / 2 - bt / 2 + 0.012), h / 2, sz * (d / 2 - bt / 2 + 0.012))), dark);
  for (const y of [0.04, h - 0.04]) {
    B.paint.add(chamferBoxGeo(w + 0.03, bt, bt, 0.01), mul(M, at(0, y, d / 2 + 0.005)), dark);
    B.paint.add(chamferBoxGeo(w + 0.03, bt, bt, 0.01), mul(M, at(0, y, -d / 2 - 0.005)), dark);
    B.paint.add(chamferBoxGeo(bt, bt, d + 0.03, 0.01), mul(M, at(w / 2 + 0.005, y, 0)), dark);
    B.paint.add(chamferBoxGeo(bt, bt, d + 0.03, 0.01), mul(M, at(-w / 2 - 0.005, y, 0)), dark);
  }
  if (o.lid) B.paint.add(chamferBoxGeo(w + 0.06, 0.07, d + 0.06, 0.02, [0.5, 0]), mul(M, at(0, h + 0.035, 0)), col.clone().multiplyScalar(0.92));
  if (o.label) {
    const g = new THREE.PlaneGeometry(w * 0.8, w * 0.4);
    B.decal.add(g, mul(M, at(0, h * 0.52, d / 2 + 0.012)), "#ffffff");
  }
  if (o.rope) {
    // rope tied around the crate (two bands) + knot
    for (const x of [-w * 0.28, w * 0.28]) {
      const pts = [P(M, x, -0.005, d / 2 + 0.03), P(M, x, h + 0.09, d / 2 + 0.03), P(M, x, h + 0.09, -d / 2 - 0.03), P(M, x, -0.005, -d / 2 - 0.03)];
      for (let i = 0; i < 3; i++) ropeLine(B.rope, pts[i], pts[i + 1], 0, 0.02);
    }
    B.rope.add(new THREE.SphereGeometry(0.05, 6, 5), mul(M, at(w * 0.28, h + 0.1, 0)), "#ffffff");
  }
}

/** a hanging banana bunch: stalk from `top` down, 5 hands of upward-curving bananas */
let bananaGeo: THREE.BufferGeometry | null = null;
function banana(): THREE.BufferGeometry {
  if (bananaGeo) return bananaGeo;
  const L = 0.2;
  const curve = new THREE.CatmullRomCurve3([v3(0, 0, 0), v3(0.05 * L / 0.2, 0.4 * L, 0), v3(0.02, 0.8 * L, 0), v3(-0.03, 1.0 * L, 0)]);
  const g = new THREE.TubeGeometry(curve, 6, 0.028, 5, false);
  const pos = g.attributes.position as THREE.BufferAttribute, cols = new Float32Array(pos.count * 3);
  const yel = new THREE.Color("#f4c52e"), grn = new THREE.Color("#8fae2c"), tip = new THREE.Color("#4a3a18");
  const c = new THREE.Color(), pt = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / L));
    const k = 0.45 + 0.55 * Math.sin(Math.min(1, t * 1.15) * Math.PI);          // taper both ends
    const cp = curve.getPoint(t, pt);
    pos.setXYZ(i, cp.x + (pos.getX(i) - cp.x) * k, pos.getY(i), cp.z + (pos.getZ(i) - cp.z) * k);
    c.copy(grn).lerp(yel, THREE.MathUtils.smoothstep(t, 0.0, 0.3)); if (t > 0.92) c.lerp(tip, (t - 0.92) / 0.08);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return (bananaGeo = g);
}
function bananaBunch(k: K, top: V3, size = 1) {
  const B = k.B, H = 0.8 * size;
  B.fruit.add(cylGeo(0.035 * size, 0.05 * size, H + 0.3, 6), at(top.x, top.y - (H + 0.3) / 2, top.z), "#6d7b2a");
  const hands = 5;
  for (let h = 0; h < hands; h++) {
    const y = top.y - 0.22 * size - h * (H - 0.15) / hands, n = 9 - Math.floor(h * 0.6);
    const rr = (0.1 + 0.05 * Math.sin((h / (hands - 1)) * Math.PI)) * size;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + h * 0.6 + jit(0.15);
      const m = new THREE.Matrix4().compose(v3(top.x + Math.cos(a) * rr, y, top.z + Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -0.5 + jit(0.15), "YXZ")), v3(size, size * (0.9 + rnd() * 0.25), size));
      B.fruit.add(banana(), m, tone("#ffffff", 0.08));
    }
  }
}

// ------------------------------------------------------------------------------------------------ huts
interface HutO {
  M: THREE.Matrix4;                     // floor centre (local frame), yaw
  w: number; d: number; wallH: number; rise: number; eave: number; gable: number; tiers: number; T?: number;
  color: string; front?: Opening[]; back?: Opening[]; left?: Opening[]; right?: Opening[];
  poles?: boolean; barge?: string; seed: number; roof?: boolean;
}
function hut(k: K, o: HutO) {
  const B = k.B, H = o.M, t = 0.1;
  wall(B, mul(H, at(0, 0, o.d / 2 - t / 2)), o.w, o.wallH, t, o.front ?? [], o.color);
  wall(B, mul(H, at(0, 0, -o.d / 2 + t / 2, Math.PI)), o.w, o.wallH, t, o.back ?? [], o.color);
  wall(B, mul(H, at(-o.w / 2 + t / 2, 0, 0, -Math.PI / 2)), o.d - 2 * t, o.wallH, t, o.left ?? [], o.color);
  wall(B, mul(H, at(o.w / 2 - t / 2, 0, 0, Math.PI / 2)), o.d - 2 * t, o.wallH, t, o.right ?? [], o.color);
  // corner posts, sill + top plate, mid trim board (darker trim)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(B.timber, P(H, sx * (o.w / 2 - 0.03), -0.05, sz * (o.d / 2 - 0.03)), P(H, sx * (o.w / 2 - 0.03), o.wallH + 0.08, sz * (o.d / 2 - 0.03)), 0.16, 0.16, C.woodDark, 0.02);
  for (const y of [0.07, o.wallH - 0.02]) {
    for (const sz of [-1, 1]) beam(B.timber, P(H, -o.w / 2 - 0.02, y, sz * (o.d / 2 + 0.01)), P(H, o.w / 2 + 0.02, y, sz * (o.d / 2 + 0.01)), 0.1, 0.13, C.woodDark, 0.02);
    for (const sx of [-1, 1]) beam(B.timber, P(H, sx * (o.w / 2 + 0.01), y, -o.d / 2), P(H, sx * (o.w / 2 + 0.01), y, o.d / 2), 0.1, 0.13, C.woodDark, 0.02);
  }
  if (o.roof === false) return;
  // gable triangles (boards) up into the roof
  const tri = new THREE.Shape([new THREE.Vector2(-o.d / 2, 0), new THREE.Vector2(o.d / 2, 0), new THREE.Vector2(0, o.rise - 0.08)]);
  for (const sx of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(tri, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2); g.rotateY(Math.PI / 2);
    B.paint.add(g, mul(H, at(sx * (o.w / 2 - t / 2), o.wallH, 0)), tone(o.color, 0.04).multiplyScalar(0.85));
  }
  const R = mul(H, at(0, o.wallH, 0));
  const roof = gableThatch(B, R, { len: o.w, span: o.d, rise: o.rise, eave: o.eave, gable: o.gable, tiers: o.tiers, T: o.T ?? 0.22, seed: o.seed });
  const T = o.T ?? 0.22;
  if (o.poles !== false) {
    // crossed ridge poles at both gable ends (they cross just above the ridge and stick up ~0.6 m)
    for (const xe of [roof.x0 + 0.12, roof.x1 - 0.12]) {
      for (const side of [-1, 1]) {
        const a = roof.surf(side, 1.5, xe, T + 0.08).applyMatrix4(R), b = roof.surf(-side, -0.75, xe, T + 0.08).applyMatrix4(R);
        log(B.timber, a, b, 0.065, C.woodDark, 7);
      }
      const c = roof.surf(1, 0, xe, T + 0.25).applyMatrix4(R);
      lashing(B.rope, c, P(R, 1, 0, 0).sub(P(R, 0, 0, 0)), 0.09, 0.14);
    }
  }
  if (o.barge) {
    // painted barge boards along both verges at both gable ends
    for (const xe of [roof.x0 - 0.02, roof.x1 + 0.02]) for (const side of [-1, 1]) {
      const a = roof.surf(side, -0.05, xe, T * 0.55).applyMatrix4(R), b = roof.surf(side, roof.Q + 0.05, xe, T * 0.55).applyMatrix4(R);
      beam(B.timber, a, b, 0.06, 0.3, o.barge, 0.02);
    }
  }
  const floorY = P(H, 0, 0, 0).y;
  k.occ.push(occOf(H, o.w / 2 + o.gable, o.d / 2 + o.eave, floorY + o.wallH, 0.4));
}

// ------------------------------------------------------------------------------------------------ the hamlet
export async function buildHamlet(ctx: WorldCtx, a: HamletAnchor): Promise<THREE.Group> {
  const t0 = performance.now();
  const g = new THREE.Group();
  g.name = "tp-hamlet";
  g.position.set(a.x, 0, a.z);
  g.rotation.y = a.yaw;
  g.updateMatrixWorld(true);
  reseed(4242);

  const m = materials(ctx);
  const B: HBins = {
    timber: new Bin("hamlet:timber", m.timber), paint: new Bin("hamlet:paint", m.paint), thatch: new Bin("hamlet:thatch", m.thatch),
    rope: new Bin("hamlet:rope", m.rope, false), rock: new Bin("hamlet:rock", m.rock, false, false), fruit: new Bin("hamlet:fruit", m.fruit),
    cloth: new Bin("hamlet:cloth", m.cloth), decal: new Bin("hamlet:decal", m.decal, false),
  };
  // local ⇄ world
  const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
  const toW = (lx: number, lz: number): [number, number] => [a.x + lx * cy + lz * sy, a.z - lx * sy + lz * cy];
  const terr = (lx: number, lz: number) => { const [wx, wz] = toW(lx, lz); return ctx.terrain.height(wx, wz); };
  const dxC = a.cam[0] - a.x, dzC = a.cam[2] - a.z;
  const camL = { x: dxC * cy - dzC * sy, z: dxC * sy + dzC * cy };
  const hf = [-Math.sin(BEARING), -Math.cos(BEARING)], hr = [Math.cos(BEARING), -Math.sin(BEARING)];
  const cf = (F: number, R: number) => ({ x: camL.x + hf[0] * F + hr[0] * R, z: camL.z + hf[1] * F + hr[1] * R });
  const G0 = ctx.terrain.height(a.cam[0], a.cam[2]);
  const fm = (F: number, R: number, h: number, d = 0) => { const c = cf(F, R); return at(c.x, G0 + h, c.z, YAW0 + d); };
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), org = new THREE.Vector3();
  const rocks: THREE.Mesh[] = [];
  const ground = (x: number, z: number) => {
    const tg = terr(x, z);
    if (!rocks.length) return tg;
    org.set(x, 400, z); ray.set(org, down); ray.far = 800;
    const hit = ray.intersectObjects(rocks, false)[0];
    return hit ? Math.max(tg, hit.point.y) : tg;
  };
  const k: K = { B, cf, fm, G0, terr, ground, occ: [], rocks, plants: [] };
  const D = 3.8;                                   // deck / walkway top above the pad

  // ============================================================== ROCK OUTCROPS (first: stilts ground on them)
  // left headland (back-left hut on top) + satellites, rising from the slope below the rim
  rockMass(k, 63, -1.5, 8.0, 6.5, 4.2, 11, { strata: 0.5, cuts: 9, res: 30 });
  rockMass(k, 58.5, -8.5, 4.5, 4.0, 1.4, 12, { res: 24 });
  rockMass(k, 67, 6, 5.0, 4.5, 2.6, 13, { res: 24 });
  rockMass(k, 70, -6, 5.5, 4.5, 6.0, 14, { res: 24, strata: 0.6 });
  // under the left hut deck: outcrops pushing up past the rim
  rockMass(k, 53, 1.5, 4.2, 3.4, -0.2, 21, { res: 26 });
  rockMass(k, 48.5, 7.5, 3.0, 2.6, -1.4, 22, { res: 22 });
  rockMass(k, 55.5, 7.5, 3.4, 3.0, 1.2, 23, { res: 22 });
  // behind the walkway (the grey faces seen between the walkway posts)
  rockMass(k, 56.5, 12.5, 3.8, 3.2, 2.4, 31, { res: 24 });
  rockMass(k, 58, 19.5, 4.2, 3.6, 3.4, 32, { res: 26 });
  rockMass(k, 56, 26.5, 3.6, 3.0, 2.0, 33, { res: 24 });
  // right cliff: the far tower-hut stands on the front block; more rock behind
  rockMass(k, 59.5, 42.5, 5.0, 4.4, 6.4, 41, { res: 28, strata: 0.6 });
  rockMass(k, 65, 35, 4.8, 4.0, 4.2, 42, { res: 24 });
  rockMass(k, 66, 50, 5.5, 4.5, 5.2, 43, { res: 24 });
  rockMass(k, 72, 43, 6.0, 5.0, 8.0, 44, { res: 24, strata: 0.6 });
  rockMass(k, 61, 30, 3.0, 2.6, 1.6, 45, { res: 20 });
  // blocky stone plinth under the back-right hut
  rockMass(k, 51.5, 34.8, 3.4, 2.9, 0.9, 51, { res: 20, boxy: 4.2, cuts: 7, round: 0.05, strata: 0.2, bottom: -2.5 });

  // ============================================================== LEFT HUT on its deck
  const LH = fm(50, 4.4, D, 0.1);
  // deck 8.6 × 5.0: hut on the left part, crates on the right
  deckStrip(B, P(LH, -4.3, 0, 0), P(LH, 4.3, 0, 0), 5.0, { ground, railR: false, railL: true, braceR: true, braceL: true, teal: 0.3, step: 2.15 });
  railRun(k, P(LH, -4.25, 0, 2.38), P(LH, -4.25, 0, -2.38));
  railRun(k, P(LH, -4.25, 0, 2.38), P(LH, -3.45, 0, 2.38));
  railRun(k, P(LH, -1.75, 0, 2.38), P(LH, 4.3, 0, 2.38));
  hut(k, {
    M: mul(LH, at(-1.5, 0, -0.35)), w: 4.2, d: 3.4, wallH: 2.45, rise: 1.65, eave: 0.85, gable: 0.6, tiers: 5, T: 0.24, color: C.red, seed: 3,
    front: [{ u0: -1.55, u1: -0.75, v0: 1.05, v1: 1.85 }, { u0: 0.65, u1: 1.3, v0: 1.1, v1: 1.8 }],
    right: [{ u0: -0.55, u1: 0.45, v0: 0, v1: 2.1, door: true }], left: [{ u0: -0.4, u1: 0.3, v0: 1.1, v1: 1.75 }],
  });
  // deck props: blue slatted crate (left end), red box + blue box by the door, big yellow BANANA CO. crate + green crate on it, blue bench
  crate(k, mul(LH, at(-3.6, 0, 1.75, 0.08)), 1.0, 0.7, 0.8, C.blue, { slats: true });
  crate(k, mul(LH, at(1.35, 0, 1.55, -0.1)), 0.7, 0.6, 0.6, C.red, { lid: true });
  crate(k, mul(LH, at(2.1, 0, 1.6, 0.05)), 0.75, 0.55, 0.6, C.teal, { lid: true });
  crate(k, mul(LH, at(3.2, 0, 1.0, -0.04)), 1.3, 0.95, 1.0, C.yellow, { label: true, lid: true });
  crate(k, mul(LH, at(3.15, 1.02, 0.95, 0.12)), 1.05, 0.62, 0.8, C.green, { lid: true });
  // bench
  {
    const Mb = mul(LH, at(-1.3, 0, 1.75));
    B.paint.add(chamferBoxGeo(1.5, 0.07, 0.38, 0.02), mul(Mb, at(0, 0.46, 0)), tone(C.blue, 0.05));
    for (const sx of [-0.6, 0.6]) for (const sz of [-0.13, 0.13]) B.paint.add(chamferBoxGeo(0.07, 0.44, 0.07, 0.015), mul(Mb, at(sx, 0.22, sz)), new THREE.Color(C.blue).multiplyScalar(0.7));
  }
  k.occ.push(occOf(LH, 4.3, 2.5, G0 + D - 0.1, 0.55));

  // ============================================================== WALKWAY: left hut → past the watchtower → right stairs
  const w0 = P(LH, 4.42, 0, 0.9), c1 = cf(46.3, 25.5);
  const wEnd = v3(c1.x, G0 + D, c1.z);
  deckStrip(B, w0, wEnd, 1.7, { ground, railR: true, railL: false, braceR: true, braceL: true, teal: 0.35, step: 2.3, startPost: false });
  {
    const dx = wEnd.x - w0.x, dz = wEnd.z - w0.z, L = Math.hypot(dx, dz);
    k.occ.push({ x: (w0.x + wEnd.x) / 2, z: (w0.z + wEnd.z) / 2, yaw: Math.atan2(-dz, dx), hx: L / 2, hz: 0.85, y: G0 + D - 0.1, k: 0.4 });
  }

  // ============================================================== WATCHTOWER
  const TW = fm(50.6, 21.0, 0, -0.35);
  const platY = G0 + 9.0, cabH = 2.2, twTop = 1.62, twBot = 2.0;
  const legs: V3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const bx = sx * twBot, bz = sz * twBot, pb = P(TW, bx, 0, bz), gy = ground(pb.x, pb.z);
    const top = P(TW, sx * twTop, 0, sz * twTop); top.y = platY + cabH + 0.1;
    const bot = v3(pb.x, gy - 0.4, pb.z);
    log(B.timber, bot, top, 0.17, C.woodDark, 10, 0.85);
    legs.push(bot, top);
  }
  const legAt = (i: number, y: number) => { const b = legs[i * 2], t = legs[i * 2 + 1]; const f = (y - b.y) / (t.y - b.y); return b.clone().lerp(t, f); };
  const baseY = Math.max(...[0, 1, 2, 3].map((i) => legs[i * 2].y + 0.4));
  const levels = [baseY + 0.7, baseY + (platY - baseY) * 0.42, platY - 0.45];
  const faces: Array<[number, number]> = [[0, 1], [1, 3], [3, 2], [2, 0]];   // leg index pairs around the square
  for (const [i, j] of faces) {
    for (const y of levels) {
      beam(B.timber, legAt(i, y), legAt(j, y), 0.1, 0.13, C.wood, 0.02);
      for (const q of [i, j]) lashing(B.rope, legAt(q, y), legs[q * 2 + 1].clone().sub(legs[q * 2]), 0.17, 0.16);
    }
    for (let l = 0; l < 2; l++) {
      const y0 = levels[l] + 0.12, y1 = levels[l + 1] - 0.12;
      beam(B.timber, legAt(i, y0), legAt(j, y1), 0.09, 0.1, C.woodDark, 0.015);
      beam(B.timber, legAt(j, y0), legAt(i, y1), 0.09, 0.1, C.woodDark, 0.015);
    }
  }
  // platform (planks on joists; overhanging joist ends like the target art)
  {
    const pa = P(TW, -2.7, 0, 0), pb = P(TW, 2.7, 0, 0); pa.y = pb.y = platY;
    deckStrip(B, pa, pb, 5.4, { ground, posts: false, step: 1.35 });
    for (const sz of [-1, 1]) beam(B.timber, P(TW, -3.3, 0, sz * 2.05).setY(platY - 0.42), P(TW, 3.3, 0, sz * 2.05).setY(platY - 0.42), 0.16, 0.2, C.woodDark, 0.025);
    // railing around, gap at the ladder (front-left)
    const rp = (x: number, z: number) => P(TW, x, 0, z).setY(platY);
    railRun(k, rp(-2.62, -2.62), rp(2.62, -2.62)); railRun(k, rp(2.62, -2.62), rp(2.62, 2.62));
    railRun(k, rp(2.62, 2.62), rp(-0.3, 2.62)); railRun(k, rp(-2.62, 2.62), rp(-2.62, -2.62));
    k.occ.push({ ...occOf(TW, 2.7, 2.7, platY - 0.1, 0.35) });
  }
  // cabin on the platform + round layered roof
  const CAB = mul(TW, at(0, 0, 0)); CAB.elements[13] = platY;
  hut(k, { M: CAB, w: 3.2, d: 3.2, wallH: cabH, rise: 1, eave: 0.5, gable: 0.5, tiers: 1, color: C.red, seed: 9, poles: false, roof: false,
    front: [{ u0: -1.1, u1: -0.35, v0: 0.95, v1: 1.65 }], right: [{ u0: -0.4, u1: 0.4, v0: 0.95, v1: 1.6 }], left: [{ u0: -0.4, u1: 0.4, v0: 0, v1: 1.95, door: true }] });
  coneThatch(B, mul(CAB, at(0, cabH + 0.05, 0)), { r: 3.5, h: 2.5, tiers: 5, T: 0.24, seed: 5, flare: 0.45, seg: 32 });
  k.occ.push(occOf(CAB, 3.5, 3.5, platY + cabH, 0.4));
  // flagpole from the front-right leg, yard + big red flag, rigging, pennant
  const poleBase = P(TW, twTop + 0.25, 0, twTop + 0.25).setY(platY - 1.2), poleTop = P(TW, twTop + 0.25, 0, twTop + 0.25).setY(G0 + 18.4);
  log(B.timber, poleBase, poleTop, 0.1, C.woodDark, 9, 0.7);
  lashing(B.rope, P(TW, twTop + 0.25, 0, twTop + 0.25).setY(platY - 0.2), v3(0, 1, 0), 0.1, 0.2);
  lashing(B.rope, P(TW, twTop + 0.25, 0, twTop + 0.25).setY(platY + 1.0), v3(0, 1, 0), 0.1, 0.2);
  B.timber.add(new THREE.SphereGeometry(0.13, 8, 6), at(poleTop.x, poleTop.y + 0.05, poleTop.z), C.woodDark);
  const yardY = G0 + 17.7, YA = mul(TW, at(twTop + 0.25, 0, twTop + 0.25, -0.55));
  const yl = P(YA, -2.3, 0, 0).setY(yardY + 0.32), yr = P(YA, 1.2, 0, 0).setY(yardY - 0.1);
  log(B.timber, yl, yr, 0.06, C.woodDark, 7);
  lashing(B.rope, P(YA, 0, 0, 0).setY(yardY + 0.1), yr.clone().sub(yl), 0.1, 0.16);
  {
    // flag: hung under the yard (top edge on the yard), billowing + drooping toward the frayed fly end
    const fw = 2.2, fh = 2.7, nxs = 14, nys = 12;
    const fg = new THREE.PlaneGeometry(fw, fh, nxs, nys);
    const pos = fg.attributes.position as THREE.BufferAttribute, uv = fg.attributes.uv as THREE.BufferAttribute;
    const cc = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), u = x / fw + 0.5, vv = 0.5 - y / fh;      // vv: 0 top … 1 bottom
      const wave = Math.sin(u * 5.2 + vv * 2.4) * 0.16 * (0.3 + vv) + Math.sin(vv * 3.1 + 1.2) * 0.22 * vv;
      pos.setXYZ(i, x + vv * vv * 0.35, y, wave);
      uv.setXY(i, vv, 1 - u);                                                          // texture hoist (u=0) along the yard
      const sh = 0.8 + 0.2 * Math.cos(u * 5.2 + vv * 2.4);
      cc[i * 3] = sh; cc[i * 3 + 1] = sh; cc[i * 3 + 2] = sh;
    }
    fg.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    fg.computeVertexNormals();
    const mid = yl.clone().lerp(yr, 0.42);
    const bx = yr.clone().sub(yl).normalize(), bz = new THREE.Vector3().crossVectors(bx, v3(0, 1, 0)).normalize(), by = new THREE.Vector3().crossVectors(bz, bx).normalize();
    const FM = new THREE.Matrix4().makeBasis(bx, by, bz);
    const org2 = mid.clone().addScaledVector(by, -fh / 2 - 0.05);
    FM.setPosition(org2.x, org2.y, org2.z);
    B.cloth.add(fg, FM, "#ffffff");
    // rigging: pole top → yard ends, yard left end → roof finial; small pennant on that line
    ropeLine(B.rope, poleTop.clone().setY(poleTop.y - 0.1), yl, 0.02, 0.016);
    ropeLine(B.rope, poleTop.clone().setY(poleTop.y - 0.1), yr, 0.02, 0.016);
    const fin = P(CAB, 0, 0, 0).setY(platY + cabH + 2.9);
    ropeLine(B.rope, yl, fin, 0.3, 0.016);
    const pm = yl.clone().lerp(fin, 0.45).setY(yl.y + (fin.y - yl.y) * 0.45 - 0.3);
    const tri = new THREE.BufferGeometry().setFromPoints([v3(0, 0, 0), v3(0.55, -0.1, 0.05), v3(0, -0.6, 0), v3(0, -0.6, 0), v3(0.55, -0.1, 0.05), v3(0.42, -0.62, 0.08)]);
    tri.computeVertexNormals();
    B.fruit.add(tri, at(pm.x, pm.y, pm.z, yawOf(YA) + 0.4), "#b7c43a");
    const tri2 = tri.clone(); tri2.index = null; const p2 = tri2.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p2.count; i += 3) { const x = p2.getX(i + 1), y = p2.getY(i + 1), z = p2.getZ(i + 1); p2.setXYZ(i + 1, p2.getX(i + 2), p2.getY(i + 2), p2.getZ(i + 2)); p2.setXYZ(i + 2, x, y, z); }
    tri2.computeVertexNormals();
    B.fruit.add(tri2, at(pm.x, pm.y, pm.z, yawOf(YA) + 0.4), "#9aa532");
  }
  // ladder: walkway → platform (front face, left of centre)
  {
    const lb = P(TW, -1.0, 0, 3.05).setY(G0 + D), lt = P(TW, -1.0, 0, 2.62).setY(platY + 0.95);
    ladder(B, lb, lt, P(TW, 1, 0, 0).sub(P(TW, 0, 0, 0)).normalize());
  }
  // banana bunch hanging from the platform's left edge
  {
    const hang = P(TW, -2.75, 0, 1.2).setY(platY - 0.3);
    ropeLine(B.rope, hang.clone().setY(platY - 0.05), hang, 0, 0.018);
    bananaBunch(k, hang, 1.1);
  }

  // ============================================================== STAIRS
  // left: from the hut deck's front-left edge down toward the camera to a landing, then a boardwalk back to the pad rim
  {
    const top = P(LH, -2.6, 0, 2.5), dir = P(LH, -0.25, 0, 1).sub(P(LH, 0, 0, 0)).normalize();
    const land = top.clone().addScaledVector(dir, 4.4); land.y = G0 + 0.25;
    stairFlight(B, top, land, 1.5, { railL: true, railR: true, ground });
    // boardwalk from the stair foot straight on to where it meets the pad
    let run = 1.5; while (run < 22 && terr(land.x + dir.x * run, land.z + dir.z * run) < G0 - 0.12) run += 0.5;
    const e = land.clone().addScaledVector(dir, run + 0.6);
    deckStrip(B, land.clone().addScaledVector(dir, -0.25), e, 1.7, { ground, railL: true, railR: true, step: 2.3, braceL: true, braceR: true, teal: 0.25 });
  }
  // right: walkway end down to the pad, lower boardwalk, up to the back-right hut porch
  const BRp = fm(51.2, 34.6, 3.0, -0.55);
  {
    const wdir = wEnd.clone().sub(w0).setY(0).normalize();
    const bot = wEnd.clone().addScaledVector(wdir, 4.6); bot.y = G0 + 0.25;
    stairFlight(B, wEnd.clone().addScaledVector(wdir, -0.05), bot, 1.5, { railL: true, railR: true, ground });
    const lw1 = bot.clone().addScaledVector(wdir, 2.4);
    deckStrip(B, bot.clone().addScaledVector(wdir, -0.2), lw1, 1.9, { ground, step: 1.5, railL: true });
    const porch = P(BRp, -1.1, 0, 3.12);
    const foot = lw1.clone().addScaledVector(wdir, -0.9); foot.y = G0 + 0.25;
    stairFlight(B, porch, foot, 1.3, { railL: true, railR: true, ground });
  }

  // ============================================================== BACK-RIGHT HUT (stilts on the stone plinth)
  {
    deckStrip(B, P(BRp, -3.1, 0, 0.55), P(BRp, 3.1, 0, 0.55), 5.2, { ground, railR: false, braceR: true, braceL: true, step: 2.0 });
    railRun(k, P(BRp, -3.05, 0, 3.08), P(BRp, -1.85, 0, 3.08));
    railRun(k, P(BRp, -0.35, 0, 3.08), P(BRp, 3.05, 0, 3.08));
    railRun(k, P(BRp, 3.05, 0, 3.08), P(BRp, 3.05, 0, -1.95));
    hut(k, { M: BRp, w: 4.8, d: 3.8, wallH: 2.3, rise: 1.8, eave: 0.9, gable: 0.65, tiers: 5, T: 0.24, color: "#9c3a2b", seed: 7,
      front: [{ u0: -0.5, u1: 0.5, v0: 0, v1: 2.05, door: true }, { u0: 1.1, u1: 1.8, v0: 1.05, v1: 1.7 }], right: [{ u0: -0.4, u1: 0.4, v0: 1.05, v1: 1.7 }] });
    k.occ.push(occOf(BRp, 3.1, 2.6, G0 + 2.9, 0.5));
    crate(k, mul(BRp, at(-2.2, 0, 2.2, 0.3)), 0.8, 0.6, 0.6, C.teal, { lid: true });
  }

  // ============================================================== BACK-LEFT HUT on the headland
  {
    const BL = fm(63.5, 0.8, 4.5, 0.25);
    deckStrip(B, P(BL, -2.8, 0, 0.3), P(BL, 2.8, 0, 0.3), 4.4, { ground, railR: true, step: 1.9, braceR: true });
    hut(k, { M: BL, w: 4.0, d: 3.3, wallH: 2.1, rise: 1.5, eave: 0.75, gable: 0.55, tiers: 4, T: 0.22, color: "#a33d2c", seed: 11, barge: C.red, poles: false,
      front: [{ u0: -0.9, u1: -0.25, v0: 0.95, v1: 1.6 }, { u0: 0.5, u1: 1.3, v0: 0, v1: 1.95, door: true }] });
  }

  // ============================================================== FAR-RIGHT TWO-LEVEL TOWER-HUT on the right cliff
  {
    const FT = fm(59.2, 42.8, 0, -0.45);
    const lv1 = G0 + 8.3, lv2 = G0 + 10.2;
    const ftLegs: Array<[V3, V3]> = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pb = P(FT, sx * 1.9, 0, sz * 1.7), gy = ground(pb.x, pb.z);
      const b = v3(pb.x, gy - 0.3, pb.z), t = P(FT, sx * 1.9, 0, sz * 1.7).setY(lv2 + 2.3);
      log(B.timber, b, t, 0.14, C.woodDark, 8);
      ftLegs.push([b, t]);
    }
    for (const lv of [lv1, lv2]) {
      const pa = P(FT, -2.4, 0, 0).setY(lv), pb = P(FT, 2.4, 0, 0).setY(lv);
      deckStrip(B, pa, pb, 4.0, { ground, posts: false, step: 1.2 });
    }
    // braces between legs below level 1 (front + sides) and railing on level 2
    const pairs: Array<[number, number]> = [[1, 3], [0, 1], [2, 3]];
    for (const [i, j] of pairs) {
      const A = ftLegs[i], Bq = ftLegs[j];
      const y0 = Math.max(A[0].y, Bq[0].y) + 0.5, y1 = lv1 - 0.3;
      const at2 = (L: [V3, V3], y: number) => L[0].clone().lerp(L[1], (y - L[0].y) / (L[1].y - L[0].y));
      if (y1 - y0 > 0.8) { beam(B.timber, at2(A, y0), at2(Bq, y1), 0.08, 0.1, C.woodDark); beam(B.timber, at2(Bq, y0), at2(A, y1), 0.08, 0.1, C.woodDark); }
      beam(B.timber, at2(A, lv1 + 1.0), at2(Bq, lv1 + 1.0), 0.08, 0.1, C.wood);
    }
    const rp = (x: number, z: number) => P(FT, x, 0, z).setY(lv2);
    railRun(k, rp(-2.3, 1.9), rp(2.3, 1.9)); railRun(k, rp(2.3, 1.9), rp(2.3, -1.9)); railRun(k, rp(-2.3, 1.9), rp(-2.3, -1.9));
    // back wall panel (red) + gable roof with red barge boards
    const RF = mul(FT, at(0, 0, 0)); RF.elements[13] = lv2 + 2.3;
    wall(B, mul(RF, at(0, -2.3, -1.75, Math.PI)), 3.8, 2.3, 0.1, [], "#a33d2c");
    const roof = gableThatch(B, RF, { len: 3.8, span: 3.4, rise: 1.5, eave: 0.8, gable: 0.55, tiers: 4, T: 0.22, seed: 21 });
    for (const xe of [roof.x0 - 0.02, roof.x1 + 0.02]) for (const side of [-1, 1]) beam(B.timber, roof.surf(side, -0.05, xe, 0.12).applyMatrix4(RF), roof.surf(side, roof.Q + 0.05, xe, 0.12).applyMatrix4(RF), 0.06, 0.3, C.red, 0.02);
    k.occ.push(occOf(RF, 2.5, 2.5, lv2 + 2.3, 0.35));
    k.plants.push(["palm", new THREE.Matrix4().compose(P(FT, 3.4, 0, -3.4).setY(ground(P(FT, 3.4, 0, -3.4).x, P(FT, 3.4, 0, -3.4).z) - 0.2), new THREE.Quaternion(), v3(1, 1, 1))]);
  }

  // ============================================================== GROUND DRESSING on the pad in front
  {
    // stone plinth blocks
    stoneBlock(k, fm(20.4, 6.3, -0.05, -0.2), 1.6, 0.62, 1.15, 61);
    stoneBlock(k, fm(21.9, 4.2, -0.05, 0.1), 2.3, 0.42, 1.7, 62);
    stoneBlock(k, fm(19.2, 4.6, -0.05, 0.35), 1.0, 0.36, 0.8, 63);
    stoneBlock(k, fm(23.5, 7.4, -0.05, -0.1), 1.1, 0.5, 0.9, 64);
    // red shrine box with a little gabled roof (upturned ends) on a pale pallet slab
    const SH = fm(21.9, 4.2, 0.37, -0.12);
    B.rock.add(chamferBoxGeo(1.75, 0.1, 1.3, 0.03), mul(SH, at(0, 0.05, 0)), "#e9e6df");
    const S2 = mul(SH, at(0, 0.1, 0));
    B.paint.add(chamferBoxGeo(1.45, 0.95, 1.0, 0.02, [0.2, 0]), mul(S2, at(0, 0.475, 0)), tone(C.red, 0.04));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.paint.add(chamferBoxGeo(0.07, 1.0, 0.07, 0.012), mul(S2, at(sx * 0.7, 0.5, sz * 0.48)), new THREE.Color(C.redDark));
    for (const y of [0.06, 0.5, 0.92]) for (const sz of [-1, 1]) B.paint.add(chamferBoxGeo(1.5, 0.06, 0.05, 0.01), mul(S2, at(0, y, sz * 0.51)), new THREE.Color(C.redDark));
    for (const sz of [-1, 1]) {
      // roof boards, sloping to ±z, with upturned end tips
      B.paint.add(chamferBoxGeo(1.9, 0.06, 0.78, 0.015), mul(S2, new THREE.Matrix4().makeRotationX(sz * 0.62).setPosition(0, 1.17, sz * 0.3)), tone(C.red, 0.04).multiplyScalar(0.92));
      for (const sx of [-1, 1]) B.timber.add(cylGeo(0.02, 0.045, 0.3, 6), mul(S2, new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(sz * 0.9, 0, -sx * 0.9)).setPosition(sx * 0.98, 0.98, sz * 0.63)), C.redDark);
    }
    beam(B.timber, P(S2, -1.0, 1.43, 0), P(S2, 1.0, 1.43, 0), 0.08, 0.08, C.redDark, 0.015);
    const top = P(S2, 0, 1.45, 0);
    k.plants.push(["bush", new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), 1.2), v3(0.42, 0.42, 0.42))]);
    k.plants.push(["fern", new THREE.Matrix4().compose(P(S2, 0.45, 1.3, 0.1), new THREE.Quaternion(), v3(0.5, 0.5, 0.5))]);
    // yellow BANANA CO. crate tied with rope to a teal-banded post
    const YC = fm(20.4, 6.3, 0.57, -0.3);
    crate(k, YC, 0.95, 0.66, 0.7, C.yellow, { lid: true, rope: true });
    const post = cf(20.9, 7.9), pg = terr(post.x, post.z);
    log(B.timber, v3(post.x, pg - 0.3, post.z), v3(post.x, pg + 1.25, post.z), 0.08, C.woodDark, 8);
    paintBand(B.timber, v3(post.x, pg + 0.25, post.z), v3(post.x, pg + 0.8, post.z), 0.075, C.teal);
    ropeLine(B.rope, P(YC, 0.3, 0.7, 0.2), v3(post.x, pg + 1.0, post.z), 0.18, 0.02);
    lashing(B.rope, v3(post.x, pg + 1.0, post.z), v3(0, 1, 0), 0.08, 0.12);
    // blue tub, teal crate, slat crates
    const TB = fm(21.3, 5.75, 0.37);
    B.paint.add(cylGeo(0.3, 0.26, 0.42, 14, false), mul(TB, at(0, 0.21, 0)), tone(C.blue, 0.05));
    B.timber.add(cylGeo(0.31, 0.31, 0.05, 14, true), mul(TB, at(0, 0.36, 0)), "#3a3530");
    crate(k, fm(16.8, 7.4, 0, 0.3), 0.85, 0.5, 0.6, C.teal, { lid: true });
    crate(k, fm(26.8, 11.0, 0, -0.2), 0.9, 0.7, 0.8, C.wood, { slats: true });
    crate(k, fm(27.6, 12.1, 0, 0.35), 0.8, 0.6, 0.7, "#8a6440", { slats: true });
    crate(k, fm(27.0, 11.2, 0.7, 0.1), 0.7, 0.5, 0.6, "#93704a", { slats: true });
  }

  // ============================================================== vegetation (VegApi — deferred: see below)
  const plantAt = (kind: PlantKind, F: number, R: number, s: number, yaw: number) => {
    const c = cf(F, R), y = ground(c.x, c.z) - 0.15;
    k.plants.push([kind, new THREE.Matrix4().compose(v3(c.x, y, c.z), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), yaw), v3(s, s, s))]);
  };
  plantAt("palm", 55.5, 2.2, 1.15, 0.7);          // rises behind the left hut roof
  plantAt("palm", 64, -6.5, 1.0, 2.1);            // on the headland
  plantAt("palm", 67.5, 2.5, 1.1, 4.0);
  plantAt("palm-leaning", 54.5, 15.2, 1.1, YAW0 + Math.PI + 0.35);   // the banana palm left of the tower (leans left)
  plantAt("palm", 57, 38.5, 1.0, 1.0);
  plantAt("palm", 68, 47, 1.15, 2.6);
  plantAt("palm", 71, 30, 1.0, 5.1);
  plantAt("banana-plant", 55.5, 22.5, 1.3, 0.4);
  plantAt("banana-plant", 47.5, 12.0, 1.1, 2.0);
  plantAt("bush", 54, 9.5, 0.8, 0.0); plantAt("bush", 57.5, 29, 0.9, 1.0); plantAt("bush", 61, -4, 0.8, 2.0);
  plantAt("fern", 44.5, 28.5, 0.9, 0.3); plantAt("fern", 25.5, 9.8, 0.8, 1.3); plantAt("fern", 22.8, 2.6, 0.8, 2.2);
  plantAt("monstera", 48, 31.5, 0.9, 1.0);
  // tp-set clears the camera sightline of scatter plants right AFTER buildHamlet returns; plant on the next macrotask
  // so the hamlet's own plants survive (the ready flag is held until they are in).
  const veg = ctx.shared.get("veg") as VegApi | undefined;
  if (veg && k.plants.length) {
    const toWorld = new THREE.Matrix4().compose(v3(a.x, 0, a.z), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), a.yaw), v3(1, 1, 1));
    const byKind = new Map<PlantKind, THREE.Matrix4[]>();
    for (const [kind, mm] of k.plants) (byKind.get(kind) ?? byKind.set(kind, []).get(kind)!).push(toWorld.clone().multiply(mm));
    const release = ctx.hold("tp-hamlet:veg");
    setTimeout(() => { try { for (const [kind, ms] of byKind) veg.plant(kind, ms); } finally { release(); } }, 0);
  }

  // ============================================================== merge + AO
  const aoGround = (x: number, z: number) => terr(x, z);
  let tris = 0, calls = 0;
  for (const key of Object.keys(B) as Array<keyof HBins>) {
    const bin = B[key];
    tris += bin.tris;
    const mesh = bin.build((geo) => { if (key !== "decal" && key !== "cloth") bakeAO(geo, aoGround, k.occ, key === "rock" ? { groundK: 0.7, groundH: 1.5, downK: 0.25 } : {}); });
    if (mesh) { g.add(mesh); calls++; }
  }
  g.userData.stats = { tris: Math.round(tris), calls, ms: Math.round(performance.now() - t0) };
  console.info("[tp-hamlet]", g.userData.stats);
  return g;
}
