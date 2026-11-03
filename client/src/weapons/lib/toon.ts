// Studio "illustration" look for the weapons area's product shots (the gear-* and loot-01..03 target art is cel-shaded
// sheets with bold ink lines on pure white). One ShaderMaterial family: 2-tone cel diffuse with a soft terminator,
// saturated warm shade side, a crisp glossy highlight blob, a thin sky rim + warm bounce, metal/gold env streaks,
// derivative normal mapping (planks, rope, fur) — all driven by SHARED light uniforms so the whole sheet is tuned in
// one place. ShaderMaterials are skipped by the atmos patcher, so the studio sits outside the world's haze, cloud
// shadows and sun. In-world (gameplay, loot-05) the same meshes keep their PBR materials.
import * as THREE from "three";

/** shared studio light rig (world-space directions toward the light) */
export const TOON = {
  uKey: { value: new THREE.Vector3(-0.35, 0.88, 0.32).normalize() },
  uKeyCol: { value: new THREE.Color(1.0, 0.97, 0.9) },
  uFill: { value: new THREE.Vector3(0.75, 0.15, 0.6).normalize() },
  uFillCol: { value: new THREE.Color(0.22, 0.24, 0.3) },
  uRim: { value: new THREE.Vector3(0.3, 0.55, -0.8).normalize() },
  uRimCol: { value: new THREE.Color(1.0, 0.98, 0.92) },
  /** shade side = base × this (warm, saturated) */
  uShade: { value: new THREE.Color(0.6, 0.5, 0.46) },
  /** terminator position / softness on N·L */
  uTerm: { value: new THREE.Vector2(0.3, 0.06) },
  uExposure: { value: 1.0 },
};

export interface ToonOpts {
  color?: THREE.ColorRepresentation; vertexColors?: boolean; map?: THREE.Texture | null; normalMap?: THREE.Texture | null; normalScale?: number;
  roughness?: number; metalness?: number; gloss?: number; transparent?: boolean; opacity?: number; side?: THREE.Side; unlit?: boolean;
  emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; alphaTest?: number; depthWrite?: boolean; polygonOffset?: number; blending?: THREE.Blending;
}

const vert = /* glsl */ `
varying vec3 vWN; varying vec3 vWP; varying vec2 vUv;
#ifdef USE_COLOR
varying vec3 vCol;
#endif
uniform mat3 uMapT;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vWN = normalize(mat3(modelMatrix) * normal);
  vUv = (uMapT * vec3(uv, 1.0)).xy;
#ifdef USE_COLOR
  vCol = color;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
varying vec3 vWN; varying vec3 vWP; varying vec2 vUv;
#ifdef USE_COLOR
varying vec3 vCol;
#endif
uniform vec3 uColor; uniform float uOpacity; uniform float uRough; uniform float uMetal; uniform float uGloss;
uniform vec3 uEmissive;
uniform vec3 uKey, uKeyCol, uFill, uFillCol, uRim, uRimCol, uShade; uniform vec2 uTerm; uniform float uExposure;
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
#ifdef USE_NMAP
uniform sampler2D uNMap; uniform float uNScale;
vec3 perturb(vec3 p, vec3 n, vec3 m, vec2 uv) {
  vec3 q0 = dFdx(p), q1 = dFdy(p); vec2 s0 = dFdx(uv), s1 = dFdy(uv);
  vec3 q1p = cross(q1, n), q0p = cross(n, q0);
  vec3 T = q1p * s0.x + q0p * s1.x, B = q1p * s0.y + q0p * s1.y;
  float det = max(dot(T, T), dot(B, B)); float sc = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(T * (m.x * sc) + B * (m.y * sc) + n * m.z);
}
#endif
void main() {
  vec4 base = vec4(uColor, uOpacity);
#ifdef USE_COLOR
  base.rgb *= vCol;
#endif
#ifdef USE_MAP
  vec4 tx = texture2D(uMap, vUv);
  base *= tx;
#endif
#ifdef ALPHATEST
  if (base.a < ALPHATEST) discard;
#endif
#ifdef UNLIT
  gl_FragColor = vec4(base.rgb * uExposure + uEmissive, base.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  return;
#endif
  vec3 N = normalize(vWN);
  if (!gl_FrontFacing) N = -N;
#ifdef USE_NMAP
  vec3 mn = texture2D(uNMap, vUv).xyz * 2.0 - 1.0; mn.xy *= uNScale;
  N = perturb(vWP, N, normalize(mn), vUv);
#endif
  vec3 V = normalize(cameraPosition - vWP);
  float nk = dot(N, uKey);
  float lit = smoothstep(uTerm.x - uTerm.y, uTerm.x + uTerm.y, nk);
  // lit side in two painted steps (full light on faces turned to the key, a mid tone on the flanks) + a gentle
  // gradient inside each step; shade side: warm, saturated, lifted a touch toward the top (sky) and the fill
  float hi = smoothstep(0.8, 0.86, nk);
  vec3 litC = base.rgb * uKeyCol * (mix(0.8, 1.02, hi) + 0.06 * clamp(nk, 0.0, 1.0));
  float up = N.y * 0.5 + 0.5;
  vec3 sat = pow(max(base.rgb, 1e-4), vec3(1.18));
  vec3 shadeC = mix(base.rgb, sat, 0.6) * uShade * (0.82 + 0.3 * up);
  shadeC += base.rgb * uFillCol * max(dot(N, uFill), 0.0);
  vec3 col = mix(shadeC, litC, lit);
  // bounce: warm reflected light on down-facing shade (the illustrations' lighter lower edges)
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
  col += base.rgb * vec3(0.28, 0.22, 0.14) * fres * smoothstep(0.1, -0.7, N.y) * (1.0 - lit * 0.6);
  // rim toward the back light
  col += uRimCol * base.rgb * fres * smoothstep(0.0, 0.5, dot(N, uRim)) * 0.55;
  // glossy highlight: a crisp blob from the key + a soft sheen; metals get a sky/ground env streak
  float shin = mix(140.0, 10.0, uRough);
  vec3 H = normalize(uKey + V);
  float sp = pow(max(dot(N, H), 0.0), shin);
  float blob = smoothstep(0.42, 0.62, sp);
  vec3 specCol = mix(vec3(1.0, 0.98, 0.9), base.rgb * 1.6 + 0.2, uMetal);
  col += specCol * (blob * 0.75 + sp * 0.25) * uGloss * lit;
  vec3 Hf = normalize(uFill + V);
  col += specCol * smoothstep(0.5, 0.7, pow(max(dot(N, Hf), 0.0), shin * 0.7)) * 0.18 * uGloss;
  if (uMetal > 0.01) {
    vec3 R = reflect(-V, N);
    float band = smoothstep(-0.1, 0.25, R.y) - smoothstep(0.55, 0.9, R.y) * 0.45;
    vec3 env = mix(base.rgb * 0.35, base.rgb * 1.5 + 0.12, band);
    col = mix(col, env * (0.7 + 0.3 * lit), uMetal * 0.6);
  }
  col += uEmissive;
  gl_FragColor = vec4(col * uExposure, base.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const cache = new Map<string, THREE.ShaderMaterial>();
const IDENT = new THREE.Matrix3();

export function toonMaterial(o: ToonOpts): THREE.ShaderMaterial {
  const defines: Record<string, string | number> = {};
  if (o.map) defines.USE_MAP = 1;
  if (o.normalMap) defines.USE_NMAP = 1;
  if (o.unlit) defines.UNLIT = 1;
  if (o.alphaTest) defines.ALPHATEST = o.alphaTest.toFixed(3);
  const m = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, defines,
    uniforms: {
      ...TOON,
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      uOpacity: { value: o.opacity ?? 1 },
      uRough: { value: o.roughness ?? 0.5 },
      uMetal: { value: o.metalness ?? 0 },
      uGloss: { value: o.gloss ?? 1 },
      uEmissive: { value: new THREE.Color(o.emissive ?? 0).multiplyScalar(o.emissiveIntensity ?? 1) },
      uMap: { value: o.map ?? null },
      uMapT: { value: o.map ? (o.map.updateMatrix(), o.map.matrix.clone()) : IDENT.clone() },
      uNMap: { value: o.normalMap ?? null },
      uNScale: { value: o.normalScale ?? 1 },
    },
    vertexColors: !!o.vertexColors,
    transparent: !!o.transparent, side: o.side ?? THREE.FrontSide,
    depthWrite: o.depthWrite ?? true,
    blending: o.blending ?? THREE.NormalBlending,
    polygonOffset: !!o.polygonOffset, polygonOffsetFactor: o.polygonOffset ?? 0, polygonOffsetUnits: o.polygonOffset ?? 0,
  });
  m.name = "wpn-toon";
  return m;
}

/** studio twin of an existing (PBR / basic) material — cached per source material */
/** textures the toon look drops (the in-world PBR paint-streak multiply reads as noise on a cel-shaded sheet) */
export const TOON_SKIP_MAPS = new Set<THREE.Texture>();

export function toonFrom(src: THREE.Material): THREE.Material {
  const key = src.uuid;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = src as THREE.MeshPhysicalMaterial & THREE.MeshBasicMaterial;
  if ((src as THREE.ShaderMaterial).isShaderMaterial) return src;
  const basic = (src as THREE.MeshBasicMaterial).isMeshBasicMaterial;
  const physical = (src as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial;
  const gloss = basic ? 0 : physical ? 0.55 + (s.clearcoat ?? 0) * 0.6 : Math.max(0, 0.85 - (s.roughness ?? 0.5)) * 0.9;
  const m = toonMaterial({
    color: s.color, vertexColors: s.vertexColors, map: s.map && !TOON_SKIP_MAPS.has(s.map) ? s.map : null, normalMap: basic ? null : s.normalMap,
    normalScale: basic ? 1 : s.normalScale?.x ?? 1, roughness: basic ? 1 : s.roughness, metalness: basic ? 0 : s.metalness,
    gloss, transparent: s.transparent, opacity: s.opacity, side: s.side, unlit: basic,
    emissive: basic ? 0 : s.emissive, emissiveIntensity: basic ? 0 : s.emissiveIntensity,
    alphaTest: s.alphaTest || undefined, depthWrite: s.depthWrite, polygonOffset: s.polygonOffset ? s.polygonOffsetFactor : 0, blending: s.blending,
  });
  if (m.uniforms.uMap.value && s.map) { s.map.updateMatrix(); (m.uniforms.uMapT.value as THREE.Matrix3).copy(s.map.matrix); }
  cache.set(key, m);
  return m;
}

/** swap every PBR / basic material under root for its toon twin (skips ShaderMaterials: outlines, beams, sparkles) */
export function toonize(root: THREE.Object3D, skip?: (m: THREE.Mesh) => boolean) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.outline || skip?.(mesh)) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => toonFrom(m));
    else mesh.material = toonFrom(mesh.material);
  });
}
