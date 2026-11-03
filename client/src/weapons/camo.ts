// THE MYTHIC FINISH: one animated "dark matter" camo shared by every mythic — the gun's peel / cream / light parts turn
// to a deep near-black violet with a slow nebula drifting through it in the mythic's own colour (and a cold second hue),
// glowing veins that crawl across the surface and pulse, a scatter of twinkling sparks and a coloured rim; the dark trim
// (straps, grips, brown wood) goes glossy black so the gun keeps its shape. Pattern in OBJECT space (it sticks to the gun,
// the same on the viewmodel, the held gun and the floor item), animated by one shared time uniform.
//
// Cost: a material variant per (base material × tint) — the SAME shader code, so one program per base kind (prewarmed:
// createLoot / createHeld with rarity "mythic" use the generic tint), ~3 value-noise lookups per pixel, nothing per frame
// but one uniform write (tickCamo).
import * as THREE from "three";

/** the shared animation clock (seconds) every camo material reads */
export const CAMO_TIME = { value: 0 };
export function tickCamo(t: number) { CAMO_TIME.value = t % 3600; }
/** the generic mythic tint (a remote kong's held mythic: the wire carries the tier, not which mythic) */
export const MYTHIC_TINT = "#ff2f6d";

const PARS_V = /* glsl */ `
varying vec3 vCamoP;
`;
const PARS_F = /* glsl */ `
varying vec3 vCamoP;
uniform float uCamoT;
uniform vec3 uCamoTint;
float camoHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float camoNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(camoHash(i), camoHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(camoHash(i + vec3(0.0, 1.0, 0.0)), camoHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(camoHash(i + vec3(0.0, 0.0, 1.0)), camoHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(camoHash(i + vec3(0.0, 1.0, 1.0)), camoHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;
/** after <color_fragment>: diffuseColor = the gun's own colour (vertex colours × paint) → the camo; camoGlow for later.
 *  A PRINTED camo (static, crisp-edged, anti-aliased by fwidth): void black, the mythic's deep tone in big blobs, violet
 *  shadow patches, bright flecks of the mythic colour; over it ENERGY VEINS (the contour lines of a slowly drifting
 *  noise field) with a pulse running along them, faintly glowing blob outlines and twinkling sparks. */
const COLOR_F = /* glsl */ `
vec3 camoGlow = vec3(0.0);
{
  vec3 P = vCamoP * 11.0;
  float t = uCamoT;
  float a = camoNoise(P) * 0.7 + camoNoise(P * 2.3 + 3.1) * 0.3;
  float b = camoNoise(P * 1.25 + vec3(7.3, 1.1, 4.7)) * 0.7 + camoNoise(P * 2.9 + 9.2) * 0.3;
  float c = camoNoise(P * 3.1 + vec3(2.2, 8.4, 1.3));
  float wa = fwidth(a) * 1.2 + 1e-4, wb = fwidth(b) * 1.2 + 1e-4, wc = fwidth(c) * 1.2 + 1e-4;
  float A = smoothstep(0.5 - wa, 0.5 + wa, a);
  float Bm = smoothstep(0.57 - wb, 0.57 + wb, b);
  float Cm = smoothstep(0.71 - wc, 0.71 + wc, c);
  vec3 tint = uCamoTint;
  vec3 k0 = vec3(0.01, 0.006, 0.018);
  vec3 k1 = tint * 0.2 + vec3(0.012, 0.0, 0.025);
  vec3 k2 = vec3(0.05, 0.016, 0.1);
  vec3 k3 = tint * 0.8 + 0.08;
  vec3 camo = mix(k0, k1, A);
  camo = mix(camo, k2, Bm * (1.0 - 0.6 * A));
  camo = mix(camo, k3, Cm * A);
  float e = camoNoise(P * 0.75 + vec3(0.0, t * 0.22, t * 0.13));
  float we = fwidth(e) * 1.5 + 1e-4;
  float vein = 1.0 - smoothstep(0.0, we * 2.0 + 0.01, abs(e - 0.5));
  float flow = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(t * 3.0 - (P.x + P.y * 0.7 + P.z * 0.5) * 2.2), 3.0);
  float edgeA = 1.0 - smoothstep(0.0, wa * 2.5 + 0.004, abs(a - 0.5));
  // sparks: a soft round dot (not the whole hash cell — that drew hard-edged cubes) at a random point inside ~1 cell in
  // 90, twinkling; its radius an eighth of a cell (≈ 2 mm on the gun), anti-aliased by the screen-space footprint
  vec3 sc = vCamoP * 70.0, sci = floor(sc);
  float sh = camoHash(sci);
  vec3 so = vec3(camoHash(sci + 17.1), camoHash(sci + 31.7), camoHash(sci + 53.3)) * 0.4 + 0.3;
  float sd = length(fract(sc) - so), sw = fwidth(sd) + 1e-4;
  float spark = step(0.989, sh) * (1.0 - smoothstep(0.12 - sw, 0.12 + sw, sd)) * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * 3.0 + sh * 120.0), 4.0));
  float lum0 = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float body = smoothstep(0.16, 0.4, lum0);
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.12 + k0, camo, body);
  camoGlow = (tint * 3.0 + 0.15) * (vein * flow + edgeA * 0.22) * body + (tint * 0.6 + vec3(0.9, 0.86, 0.8)) * spark * 2.2 * body;
}
`;
/** after <emissivemap_fragment>: the veins, sparks and a coloured rim light up */
const EMISSIVE_F = /* glsl */ `
{
  float camoFr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += camoGlow + uCamoTint * camoFr * 0.45;
}
`;

function inject(shader: THREE.WebGLProgramParametersWithUniforms, tint: { value: THREE.Color }) {
  shader.uniforms.uCamoT = CAMO_TIME;
  shader.uniforms.uCamoTint = tint;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${PARS_V}`)
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCamoP = position;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${PARS_F}`)
    .replace("#include <color_fragment>", `#include <color_fragment>\n${COLOR_F}`)
    .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${EMISSIVE_F}`)
    // glossy: a lacquered finish (the sparks and veins read as under a clear coat)
    .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.26, 0.85);")
    .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = max(metalnessFactor, 0.3);");
}

const cache = new Map<string, THREE.Material>();
/** the camo variant of a LIT gun material (MeshStandard / MeshPhysical), tinted `tint`; null for anything else */
export function camoMaterial(base: THREE.Material, tint: string): THREE.Material | null {
  const b = base as THREE.MeshStandardMaterial;
  if (!b.isMeshStandardMaterial) return null;
  const key = base.uuid + tint;
  let m = cache.get(key);
  if (!m) {
    const n = b.clone();
    const u = { value: new THREE.Color(tint) };
    n.onBeforeCompile = (shader) => inject(shader, u);
    // same code for every tint / base of a kind: the program is shared (the key names the variant, not the instance)
    n.customProgramCacheKey = () => "mythic-camo-3";
    n.name = `${base.name}:camo`;
    if ((n as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) { const p = n as THREE.MeshPhysicalMaterial; p.clearcoat = Math.max(p.clearcoat, 0.6); p.clearcoatRoughness = 0.12; }
    n.userData.camo = true;
    cache.set(key, m = n);
  }
  return m;
}

// the stock material lives in a WeakMap (never in userData: see rarity.ts mythicSkin)
const baseMats = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
/** put the mythic camo (tinted `tint`) on these meshes, or restore their stock materials (`tint` null) */
export function camoSkin(meshes: THREE.Mesh[], tint: string | null) {
  for (const m of meshes) {
    let base = baseMats.get(m); if (!base) baseMats.set(m, base = m.material);
    if (!tint || Array.isArray(base)) { m.material = base; continue; }
    m.material = camoMaterial(base, tint) ?? base;
  }
}
