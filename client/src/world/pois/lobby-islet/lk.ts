// Lobby build context + shared prop helpers (rope wraps, sagging ropes, banana bunches, item transforms, materials).
import * as THREE from "three";
import type { AtlasSet } from "./atlas";
import { Batch, M, cyl, lathe, tube, type Tint } from "./kit";
import { rng } from "./paint";
import { type LobbyItem, toWorld, worldYaw, groundY } from "../../../../../shared/pois/lobby-islet";

export interface LK {
  b: Batch;
  at: AtlasSet;
  /** live terrain height (never below sea level for placement purposes) */
  ground(x: number, z: number): number;
  r: () => number;
}

/** item transform: origin on the item's ground (explicit gy > baked > pad) or `y`, rotated by the item's world yaw */
export function itemM(it: LobbyItem, y?: number, extraYaw = 0): THREE.Matrix4 {
  const [x, z] = toWorld(it.lx, it.d);
  return M(x, y ?? groundY(it), z, 0, worldYaw(it.a) + extraYaw, 0);
}
/** world position of an item-local point */
export function itemPoint(it: LobbyItem, ox: number, oy: number, oz: number, y0?: number): THREE.Vector3 {
  return new THREE.Vector3(ox, oy, oz).applyMatrix4(itemM(it, y0));
}
/** ground height under an item-local point */
export function groundAt(k: LK, it: LobbyItem, ox: number, oz: number): number {
  const p = itemPoint(it, ox, 0, oz, 0);
  return k.ground(p.x, p.z);
}

export const WOOD = { warm: "#c98f63", mid: "#b07a52", dark: "#7a5236", deep: "#5c3c26", grey: "#a89484", pale: "#e0b88a" };
export const TINT = { rope: "#ffffff", iron: "#4a4642", steel: "#c8ccd0", black: "#2a2b2e", brass: "#d4a24a" };

// ------------------------------------------------------------------------------------------------ materials
export function makeMaterials(at: AtlasSet): Record<string, THREE.Material> {
  const std = (t: AtlasSet["A"]["tex"], o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.ormMap, metalnessMap: t.ormMap, aoMap: t.ormMap, aoMapIntensity: 0.85,
    vertexColors: true, roughness: 1, metalness: 1, ...o,
  });
  const A = std(at.A.tex); A.name = "lobby-A";
  const B = std(at.B.tex); B.name = "lobby-B";
  const Bcut = std(at.B.tex, { alphaTest: 0.5, side: THREE.DoubleSide }); Bcut.name = "lobby-Bcut";
  // blended (soft sand-drift edges), no depth write: ground decals only
  const decal = std(at.B.tex, { transparent: true, depthWrite: false, alphaTest: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }); decal.name = "lobby-decal";
  const glow = new THREE.MeshBasicMaterial({ map: at.B.tex.map, vertexColors: true }); glow.name = "lobby-glow";
  const tarmac = new THREE.MeshStandardMaterial({
    map: at.tarmac.map, normalMap: at.tarmac.normalMap, roughnessMap: at.tarmac.ormMap, aoMap: at.tarmac.ormMap, vertexColors: true, roughness: 1, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  tarmac.name = "lobby-tarmac";
  const rock = rockMaterial(at);
  const rope = new THREE.MeshStandardMaterial({ map: at.rope.map, normalMap: at.rope.normalMap, roughnessMap: at.rope.ormMap, aoMap: at.rope.ormMap, vertexColors: true, roughness: 1, metalness: 0 });
  rope.name = "lobby-rope";
  return { A, B, Bcut, decal, glow, tarmac, rock, rope };
}

/** triplanar limestone with moss on up-facing surfaces (world-space, so the huge outcrop never stretches) */
function rockMaterial(at: AtlasSet): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: at.rock.map, roughnessMap: at.rock.ormMap, vertexColors: true, roughness: 1, metalness: 0 });
  m.name = "lobby-rock";
  const nmap = at.rock.normalMap;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNrm = { value: nmap };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vWPos; varying vec3 vWNrm; uniform sampler2D uNrm;
float kHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float kNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(kHash(i), kHash(i+vec2(1,0)), f.x), mix(kHash(i+vec2(0,1)), kHash(i+vec2(1,1)), f.x), f.y); }
vec3 kTri(sampler2D t, vec3 p, vec3 w){ return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z; }`)
      .replace("#include <map_fragment>", `
vec3 tw = pow(abs(normalize(vWNrm)), vec3(5.0)); tw /= (tw.x + tw.y + tw.z);
vec3 tp = vWPos / 9.0;
vec3 rockC = kTri(map, tp, tw);
vec3 rockC2 = kTri(map, tp * 0.31 + 0.17, tw);
rockC = mix(rockC, rockC2 * vec3(0.95, 0.93, 0.9), 0.35);
float mossN = kNoise(vWPos.xz * 0.35) * 0.6 + kNoise(vWPos.xz * 1.7) * 0.4;
float moss = smoothstep(0.52, 0.8, normalize(vWNrm).y + (mossN - 0.5) * 0.5);
vec3 mossC = mix(vec3(0.24, 0.40, 0.12), vec3(0.42, 0.55, 0.18), kNoise(vWPos.xz * 0.9));
diffuseColor.rgb *= mix(rockC, mossC, moss);
float kMoss = moss;`)
      .replace("#include <roughnessmap_fragment>", `float roughnessFactor = roughness * mix(kTri(roughnessMap, tp, tw).g, 0.95, kMoss);`)
      .replace("#include <normal_fragment_maps>", `
{ vec3 w = tw; vec3 n = normalize(vWNrm);
  vec3 nx = texture2D(uNrm, tp.zy).xyz * 2.0 - 1.0, ny = texture2D(uNrm, tp.xz).xyz * 2.0 - 1.0, nz = texture2D(uNrm, tp.xy).xyz * 2.0 - 1.0;
  // whiteout-style blend of the three planar normals into world space
  vec3 wn = normalize(vec3(0.0, nx.y, nx.x) * w.x * sign(n.x) + vec3(ny.x, 0.0, ny.y) * w.y * sign(n.y) + vec3(nz.x, nz.y, 0.0) * w.z * sign(n.z));
  vec3 pert = normalize(n + wn * 0.9 * (1.0 - kMoss * 0.7));
  normal = normalize((viewMatrix * vec4(pert, 0.0)).xyz);
}`);
  };
  m.customProgramCacheKey = () => "lobby-rock-v1";
  return m;
}

// ------------------------------------------------------------------------------------------------ rope helpers
/** identity uv rect (uv = the raw metre coordinates) for the tiling sheets */
export const RAW = { u0: 0, u1: 1e6, v0: 0, v1: 1e6, mu: 1e6, mv: 1e6 };
/** rope tube along any curve, on the tiling rope sheet (one lay ≈ 1.1 × the circumference, like real 3-strand rope) */
export function ropeAlong(k: LK, curve: THREE.Curve<THREE.Vector3>, ropeR: number, m: THREE.Matrix4 | null = null, tint: Tint = TINT.rope, radial = 6) {
  const len = curve.getLength();
  const n = Math.min(400, Math.max(6, Math.ceil(len / Math.max(0.02, ropeR * 1.6))));
  const as = 0.125 / (1.1 * Math.PI * 2 * ropeR);
  k.b.add("rope", tube(curve, n, ropeR, radial, { rect: RAW, aroundM: 1, alongScale: as, off: [k.r() * 4, 0] }), m, tint);
}

/** helical rope wrap around a vertical post (local, centred at x=z=0, from y0 upward) */
export function ropeWrap(k: LK, m: THREE.Matrix4, postR: number, y0: number, turns: number, ropeR = 0.028, pitch = 0.062) {
  const pts: THREE.Vector3[] = [];
  const n = Math.ceil(turns * 24);
  const ph = k.r() * Math.PI * 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = ph + t * turns * Math.PI * 2;
    const rr = postR + ropeR * 0.92;
    pts.push(new THREE.Vector3(Math.sin(a) * rr, y0 + t * turns * pitch, Math.cos(a) * rr));
  }
  ropeAlong(k, new THREE.CatmullRomCurve3(pts), ropeR, m, TINT.rope, 7);
}

/** sagging rope between two world points */
export function ropeSpan(k: LK, a: THREE.Vector3, b: THREE.Vector3, sag: number, ropeR = 0.022, tint: Tint = TINT.rope) {
  const pts: THREE.Vector3[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  ropeAlong(k, new THREE.CatmullRomCurve3(pts), ropeR, null, tint, 6);
}

/** coiled rope lying on a deck (local origin on the deck surface) */
export function ropeCoil(k: LK, m: THREE.Matrix4, R = 0.34, turns = 4.5, ropeR = 0.024) {
  const pts: THREE.Vector3[] = [];
  const n = Math.ceil(turns * 30);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * Math.PI * 2;
    const rr = R - t * (turns * ropeR * 1.9);
    pts.push(new THREE.Vector3(Math.sin(a) * rr, ropeR + (i % 2) * 0.002 + (t > 0.85 ? (t - 0.85) * 0.25 : 0), Math.cos(a) * rr));
  }
  const last = pts[pts.length - 1];
  pts.push(new THREE.Vector3(last.x + 0.25, ropeR, last.z + 0.35), new THREE.Vector3(last.x + 0.55, ropeR, last.z + 0.9));
  ropeAlong(k, new THREE.CatmullRomCurve3(pts), ropeR, m, TINT.rope, 6);
}

// ------------------------------------------------------------------------------------------------ bananas
/** one banana: curved, tapered, five-faceted; local origin at the stem, curving along +x and up */
export function bananaGeo(k: LK, len = 0.2, r = 0.021) {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(len * 0.55, -len * 0.05, 0), new THREE.Vector3(len, len * 0.28, 0));
  return tube(curve, 12, (t) => r * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04)), 0.55)), 5, { rect: k.at.A.uv("banana"), aroundM: 0.125, alongScale: 0.25 / len, caps: true });
}
/** a hand of bananas (fan of n fruit on a crown), local origin at the crown, fruit pointing roughly +x / up */
export function bananaHand(k: LK, m: THREE.Matrix4, n = 6, len = 0.2, tint: Tint = "#ffffff") {
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1) - 0.5;
    const row = i % 2;
    const g = bananaGeo(k, len * (0.9 + k.r() * 0.2), 0.02 + k.r() * 0.003);
    const mm = new THREE.Matrix4().multiplyMatrices(m, M(0, row * 0.02, f * 0.02, f * 0.5, f * 1.1 + (k.r() - 0.5) * 0.15, 0.25 + row * 0.25 + (k.r() - 0.5) * 0.1));
    k.b.add("A", g, mm, tint);
  }
  // crown stub
  k.b.add("A", cyl(0.018, 0.012, 0.06, 6, 0.004, { rect: k.at.A.uv("grainDark") }), new THREE.Matrix4().multiplyMatrices(m, M(-0.03, 0, 0, 0, 0, Math.PI / 2)), "#6a7a3a");
}
/** a full hanging bunch: several hands spiralling around a curved stalk; origin at the top of the stalk, hanging down -y */
export function bananaBunch(k: LK, m: THREE.Matrix4, hands = 5, scale = 1) {
  const stalkH = 0.28 + hands * 0.07;
  k.b.add("A", cyl(0.028, 0.02, stalkH + 0.18, 7, 0.005, { rect: k.at.A.uv("grainDark"), u: "along" }), new THREE.Matrix4().multiplyMatrices(m, M(0, -stalkH - 0.1, 0, 0, 0, 0, scale)), "#6f7a36");
  for (let i = 0; i < hands; i++) {
    const t = i / Math.max(1, hands - 1);
    const y = -0.08 - t * stalkH;
    const ang = i * 2.1;
    const hm = new THREE.Matrix4().multiplyMatrices(m, M(0, y * scale, 0, 0, ang, 0, scale));
    bananaHand(k, new THREE.Matrix4().multiplyMatrices(hm, M(0.035, 0, 0, 0, 0, -0.15)), 5 + (i % 2), 0.2 - t * 0.03);
  }
}
/** a loose pile of banana hands resting on a surface (origin on the surface) */
export function bananaPile(k: LK, m: THREE.Matrix4, count = 3, spread = 0.25) {
  for (let i = 0; i < count; i++) {
    const a = k.r() * Math.PI * 2, rr = Math.sqrt(k.r()) * spread;
    bananaHand(k, new THREE.Matrix4().multiplyMatrices(m, M(Math.cos(a) * rr, 0.03 + i * 0.03, Math.sin(a) * rr, 0, k.r() * Math.PI * 2, 0.35)), 4 + (i % 3), 0.19);
  }
}

// ------------------------------------------------------------------------------------------------ misc shared
export function lanternGeo(k: LK, h = 0.26, r = 0.1) {
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([0.02 + r * Math.pow(Math.sin(Math.PI * t), 0.6), t * h]); }
  return lathe(prof, 10, { rect: k.at.B.uv("lantern"), fit: "both" }, 2);
}
export function bulbGeo(k: LK, r = 0.035) {
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; prof.push([Math.max(0.004, r * Math.sin(Math.PI * t) * (1 - 0.35 * t)), -t * r * 2.2]); }
  return lathe(prof, 8, { rect: k.at.B.uv("bulb"), fit: "both" }, 2);
}
export { rng };
