// Shared actor material look (kongs, plane, glider). The target art lights the characters and their vehicles like a
// studio: a ripe banana yellow stays banana yellow (hue 40–46 on screen) in sun AND in shade.
//
// The problem (a systemic hue error, every actor yellow rendered orange: wraps 33 vs 40, plane fin 32 vs 46, skin
// 23 vs 30): the atmos area's warm multi-bounce (shadows.ts, `uAtmBounce`) multiplies the ambient of every warm albedo
// by albedo / luminance once more — right for cream sand, but on a saturated yellow it squares the chroma (R/G up,
// blue negative) and the fill turns ochre / orange. Measured on drop-01: fuselage shade hue 31.8 with the bounce, 38.4
// without. `actorLook()` divides exactly that factor back out of the indirect diffuse (same formula, after atmos's line)
// and scales the env reflection; the direct sun is untouched.
import type * as THREE from "three";

/** GLSL (after `#include <aomap_fragment>`): undo atmos's warm-bounce factor on this surface's indirect diffuse */
export const UNBOUNCE_GLSL = /* glsl */ `
#ifdef ATMOS_LIT
  {
    vec3 akA = clamp( diffuseColor.rgb, 0.0, 1.0 );
    float akL = max( dot( akA, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-3 );
    float akW = smoothstep( 0.15, 0.6, ( akA.r - akA.b ) / akL ) * smoothstep( -0.02, 0.06, ( akA.r - akA.g ) / akL );
    vec3 akF = mix( vec3( 1.0 ), akA / akL, uAtmBounce * akW );
    vec3 akS = vec3( greaterThanEqual( akF, vec3( 0.0 ) ) ) * 2.0 - 1.0;
    reflectedLight.indirectDiffuse /= akS * max( abs( akF ), vec3( 0.05 ) );
  }
#endif
`;

/** chain onto a material's onBeforeCompile: unbounce + optional env-reflection scale + optional extra GLSL (same slot) */
export function actorLook<M extends THREE.Material>(m: M, o: { spec?: number; key: string; glsl?: string }): M {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  const code = `${UNBOUNCE_GLSL}${o.spec !== undefined ? `reflectedLight.indirectSpecular *= ${o.spec.toFixed(3)};` : ""}${o.glsl ?? ""}`;
  m.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace("#include <aomap_fragment>", `#include <aomap_fragment>\n${code}`);
  };
  m.customProgramCacheKey = () => `${prevKey()}|actorLook-${o.key}`;
  m.needsUpdate = true;
  return m;
}
