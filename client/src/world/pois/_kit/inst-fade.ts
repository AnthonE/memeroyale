// INSTANCE CROSSFADES for the POI kits' per-instance LOD swaps.
// The harbor's containers swap their ~36-tri box for the full
// corrugated model at 18 m and the PropBatcher swaps every pallet / crate / chassis stand-in for its full model at
// 24 m — one instance at a time, in one frame (~630 such swaps in an 84 s harbor walk). Now an instance
// that changes level is drawn by BOTH levels for FADE_S, with COMPLEMENTARY dissolve masks (engine/dither.ts: the
// leaving level drops the pixels whose noise n < t, the arriving one draws only n < t) — every pixel shows exactly one
// of the two, the noise moves with the TAA jitter, so the swap reads as a short soft blend.
// Per-instance amount = an instanced float attribute `aKrDis` in the engine's dissolve convention (0 drawn, a > 0
// fading out by a, a < 0 fading in with 1 + a drawn). Only materials patched here declare it, and only meshes that
// carry the attribute use them (a declared attribute a geometry lacks would read an undefined generic value).
import * as THREE from "three";
import { DITHER } from "../../../engine/dither";

/** crossfades on (they need the engine's dissolve: ?dither=0 = hard swaps) */
export const INST_FADE = DITHER;
/** seconds a swap takes */
export const INST_FADE_S = 0.4;

const VERT = `
#ifdef KR_DITH_DECL
  if ( aKrDis != 0.0 ) vKrDith.x = aKrDis;
#endif`;
/** patch a vertex shader (inside onBeforeCompile) to read the per-instance dissolve */
export function patchInstFade(sh: { vertexShader: string }) {
  if (!INST_FADE) return;
  sh.vertexShader = "attribute float aKrDis;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>" + VERT);
}

const clones = new WeakMap<THREE.Material, THREE.Material>();
/** a clone of `src` whose program reads `aKrDis` (one per source material; same textures / uniforms) */
export function instFadeMaterial<M extends THREE.Material>(src: M): M {
  if (!INST_FADE) return src;
  const hit = clones.get(src);
  if (hit) return hit as M;
  const m = src.clone() as M;
  m.name = `${src.name || "mat"}-kd`;
  const prev = src.onBeforeCompile, prevKey = src.customProgramCacheKey.bind(src);
  m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r); patchInstFade(sh); };
  m.customProgramCacheKey = () => `${prevKey()}|kd`;
  clones.set(src, m);
  return m;
}

/** the per-instance dissolve attribute for an instanced mesh of `capacity` instances (all 0: drawn) */
export function instFadeAttr(geo: THREE.BufferGeometry, capacity: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity)), 1);
  a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aKrDis", a);
  return a;
}
