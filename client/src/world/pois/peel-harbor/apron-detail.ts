// PEEL HARBOR — the slab's KONG-EYE detail layer (without it, at 1.8 m the apron is a flat beige slab and the
// stains, tyre fans and grime bands are invisible at eye level). Two parts, both world-space, both read at 1–40 m:
//
//  1. a FINE TILE (1024², 12 × 12 m = 2 × 2 of the 6 m pour panels, 1.2 cm/texel) painted in code: hairline + corner
//     cracks, sawn repair patches with sealed borders, spalled joint arrises, aggregate speckle, tyre-rubber arcs and an
//     oil-grain field; plus its normal map. Every 6 m panel samples a random quadrant of it in one of 8 orientations
//     (per-panel hash), so the 12 m tile never reads as a repeat. Faded out beyond ~45 m (the coarse map carries it).
//  2. a MASK over the whole slab (1024², the DM rect of apron.ts, ≈ 0.4 m/texel): R = traffic (lanes, transfer lane,
//     chassis-park aisles), G = oil (under chassis axles, tractor + forklift + genset parking, crane bogies, lane
//     mouths), B = wet (drains + the quay gutter). The shader thresholds the fine oil grain against G (splotchy stains
//     with crisp edges up close, soft blots from the air), masks the rubber arcs with R, darkens + glosses around B.
//
// The slab shader lives in apron.ts (slabMaterial) and calls installSlabDetail().
import * as THREE from "three";
import { BLOCKS, CHASSIS_PARK, CRANE, PROPS, QUAY, blockRect, onApron, yardLanes } from "../../../../../shared/pois/peel-harbor";
import { canvas, rng, tex } from "../_kit/harbor-paint";
import { TS, paintFine, takeFinePre } from "./apron-fine";

/** the slab-wide mask rect (harbor-local), same as apron.ts' coarse detail map */
export const DM = { x0: 520, z0: 36, sx: 380, sz: 440, size: 1024 };

/** drain gullies at the lane mouths (shared by the drain geometry and the wet mask) */
let drainCache: Array<[number, number]> | null = null;
export function drainSpots(): Array<[number, number]> {
  if (drainCache) return drainCache;
  const out: Array<[number, number]> = [];
  const r = rng(33);
  for (const l of yardLanes()) for (const t of [0.2, 0.5, 0.8]) {
    const x = l.x0 + (l.x1 - l.x0) * t + (r() - 0.5) * 0.6, z = l.z0 + (l.z1 - l.z0) * t;
    if (onApron(x, z, 3)) out.push([x, z]);
  }
  return (drainCache = out);
}

// ------------------------------------------------------------------------------------------------ fine tile
let fineCache: { a: THREE.Texture; n: THREE.Texture } | null = null;
/** RGBA: R albedo (0.5 neutral), G oil grain (0..1 threshold field), B height-ish (unused), A rubber marks */
export function fineTile(): { a: THREE.Texture; n: THREE.Texture } {
  if (fineCache) return fineCache;
  const { pk, nk } = takeFinePre() ?? paintFine();
  const mk = (d: Uint8Array) => { const t = new THREE.DataTexture(d, TS, TS, THREE.RGBAFormat, THREE.UnsignedByteType); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; };
  const at = mk(pk), nt = mk(nk);
  fineCache = { a: at, n: nt };
  return fineCache;
}

// ------------------------------------------------------------------------------------------------ slab mask
let maskCache: THREE.Texture | null = null;
/** R traffic, G oil, B wet — over the DM rect (harbor-local x → u, z → v, flipY off) */
export function apronMasks(): THREE.Texture {
  if (maskCache) return maskCache;
  const S = DM.size, [el, c] = canvas(S, S);
  c.fillStyle = "#000"; c.fillRect(0, 0, S, S);
  const X = (x: number) => ((x - DM.x0) / DM.sx) * S, Z = (z: number) => ((z - DM.z0) / DM.sz) * S, M = (m: number) => (m / DM.sx) * S;
  const r = rng(9202);
  c.globalCompositeOperation = "lighter";
  const blob = (x: number, z: number, rad: number, col: string, a: number, sx = 1, sz = 1, rot = 0) => {
    c.save(); c.translate(X(x), Z(z)); c.rotate(rot); c.scale(sx, sz);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, M(rad));
    g.addColorStop(0, col); g.addColorStop(0.55, col); g.addColorStop(1, "rgba(0,0,0,0)");
    c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(0, 0, M(rad), 0, Math.PI * 2); c.fill(); c.restore();
  };
  const band = (x0: number, z0: number, x1: number, z1: number, w: number, a: number) => {
    c.save(); c.strokeStyle = "rgb(255,0,0)"; c.lineCap = "round"; c.globalAlpha = a; c.lineWidth = M(w);
    c.filter = `blur(${M(w * 0.25).toFixed(1)}px)`;
    c.beginPath(); c.moveTo(X(x0), Z(z0)); c.lineTo(X(x1), Z(z1)); c.stroke(); c.restore();
  };
  // traffic (R): the transfer lane + backreach lane under the cranes, every yard lane, the chassis-park aisles
  band(CRANE.railLand - 6.2, QUAY.eastZ0, CRANE.railLand - 6.2, QUAY.eastZ1, 5, 0.9);
  band((CRANE.railLand + CRANE.railSea) / 2, QUAY.railZ0 - 10, (CRANE.railLand + CRANE.railSea) / 2, QUAY.railZ1 + 10, 6, 0.8);
  for (const l of yardLanes()) band(l.x0, l.z0, l.x1, l.z1, Math.max(3, l.w - 1), 0.75);
  { const C = CHASSIS_PARK; for (let z = C.z0 + 3 + 3 * C.rowPitch; z < C.z1; z += 4 * C.rowPitch) band(C.x0, z, C.x1, z, 4, 0.8); band(C.x0 - 3, C.z0 - 2, C.x1 + 3, C.z0 - 2, 5, 0.7); }
  // lane mouths: the turning fans get extra traffic + oil
  for (const b of BLOCKS) {
    const [x0, x1, z0, z1] = blockRect(b);
    const ends: Array<[number, number]> = b.dir === "z" ? [[(x0 + x1) / 2, z0 - 3.5], [(x0 + x1) / 2, z1 + 3.5]] : [[x0 - 3.5, (z0 + z1) / 2], [x1 + 3.5, (z0 + z1) / 2]];
    for (const [x, z] of ends) {
      if (!onApron(x, z, 3)) continue;
      blob(x, z, 5, "rgb(255,0,0)", 0.55);
      blob(x + (r() - 0.5) * 3, z + (r() - 0.5) * 3, 1.4 + r() * 1.6, "rgb(0,255,0)", 0.55 + r() * 0.3, 1, 0.7 + r() * 0.5, r() * 3);
    }
  }
  // oil (G): under every chassis' tandem axle + landing legs, every tractor's engine + fifth wheel, forklift counterweights,
  // gensets; the crane bogies along both rails; a drip line down the transfer lane
  for (const p of PROPS) {
    const c0 = Math.cos(p.yaw), s0 = Math.sin(p.yaw);
    const at = (lx: number, lz = 0): [number, number] => [p.x + lx * c0 + lz * s0, p.z - lx * s0 + lz * c0];
    const drop = (lx: number, rad: number, a: number, lz = 0) => { const [x, z] = at(lx, lz); blob(x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, rad, "rgb(0,255,0)", a, 1, 0.6 + r() * 0.6, r() * 3); };
    if (p.kind === "chassis") { drop(-4.5, 1.6, 0.7); drop(3.6, 1.0, 0.45); if (r() < 0.6) drop(5.8 + r() * 2, 1.4, 0.55); }
    else if (p.kind === "truck") { drop(2.3, 1.5, 0.75); drop(-1.4, 1.2, 0.5); }
    else if (p.kind === "forklift") { drop(-0.9, 1.1, 0.6); drop(0.4, 0.8, 0.4); }
    else if (p.kind === "generator") { drop(0, 1.6, 0.7); }
  }
  for (const cz of CRANE.zs) for (const rx of [CRANE.railLand, CRANE.railSea]) for (const e of [-1, 1]) for (const tz of [-1.25, 1.25]) blob(rx + (r() - 0.5) * 0.8, cz + e * (CRANE.legHalfZ + 0.6) + tz, 1.3 + r() * 0.8, "rgb(0,255,0)", 0.6, 0.7, 1.4);
  for (let z = QUAY.railZ0; z < QUAY.railZ1; z += 1.5 + r() * 4) for (const rx of [CRANE.railLand, CRANE.railSea]) if (r() < 0.35) blob(rx + (r() - 0.5) * 1.2, z, 0.5 + r() * 0.8, "rgb(0,255,0)", 0.5);
  for (let z = QUAY.eastZ0 + 6; z < QUAY.eastZ1 - 6; z += 3 + r() * 6) blob(CRANE.railLand - 6.2 + (r() - 0.5) * 2.4, z, 0.6 + r() * 1.4, "rgb(0,255,0)", 0.45 + r() * 0.35);
  // the chassis-park bays: a dark drip patch under every parked slot, even the empty ones
  { const C = CHASSIS_PARK; for (let z = C.z0 + 3, row = 0; z < C.z1 - 3; z += C.rowPitch, row++) { if (row % 4 === 3) continue; for (let x = C.x0 + 8; x < C.x1 - 6; x += C.slot) { blob(x - 4.5, z, 1.3, "rgb(0,255,0)", 0.5); blob(x + 9.4, z, 1.1, "rgb(0,255,0)", 0.4); } } }
  // wet (B): drain halos + the quay gutter
  for (const [x, z] of drainSpots()) { blob(x, z, 2.6 + r() * 1.2, "rgb(0,0,255)", 0.8, 1, 1.4); blob(x, z, 1.2, "rgb(0,0,255)", 0.7); }
  c.save(); c.strokeStyle = "rgb(0,0,255)"; c.globalAlpha = 0.55; c.lineWidth = M(1.4); c.filter = `blur(${M(0.5).toFixed(1)}px)`; c.beginPath(); c.moveTo(X(QUAY.eastX - 2.8), Z(QUAY.eastZ0 + 3)); c.lineTo(X(QUAY.eastX - 2.8), Z(QUAY.eastZ1 - 3)); c.stroke(); c.restore();
  const t = tex(el, { srgb: false, repeat: false, aniso: 4 });
  t.flipY = false;
  maskCache = t;
  return t;
}

/** install the fine detail layer in a slab material's shader (chained after apron.ts' own map/roughness code: needs
 *  the varyings vApronP (harbor-local xz) + vApronUv (DM rect uv) that apron.ts declares) */
export const SLAB_DETAIL_PARS = /* glsl */ `
uniform sampler2D apronFine;
uniform sampler2D apronFineN;
uniform sampler2D apronMask;
uniform vec4 apronTune;   // x: fine albedo strength, y: oil strength, z: rubber strength, w: fine normal strength
varying vec3 vApronAX;
varying vec3 vApronAZ;
float apHash(vec2 p) { return fract(sin(dot(p, vec2(41.37, 289.13))) * 43758.5453); }
`;
export const SLAB_DETAIL_VERT = /* glsl */ `
  vApronAX = normalize( ( modelViewMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz );
  vApronAZ = normalize( ( modelViewMatrix * vec4( 0.0, 0.0, 1.0, 0.0 ) ).xyz );
`;
/** after <map_fragment> (diffuseColor) — defines apFade / apOil / apWet / apN for the later hooks */
export const SLAB_DETAIL_MAP = /* glsl */ `
  float apDist = length( vViewPosition );
  float apFade = 1.0 - smoothstep( 22.0, 48.0, apDist );
  vec3 apMask = texture2D( apronMask, vApronUv ).rgb;
  // (so the apron never reads as a clean flat grey slab from the air: the far field keeps the wear — oil blots
  // at full strength, the traffic lanes a tyre-darkened band, the wet gutters darker)
  // (no black blotches across the yard from the air: the far field keeps HALF the oil — up close
  // the crisp thresholded splats below are unchanged)
  float apOil = apMask.g * 0.42, apWet = apMask.b;
  diffuseColor.rgb *= 1.0 - apMask.r * 0.2 * ( 1.0 - apFade );
  vec2 apN = vec2( 0.0 ), apU = vec2( 1.0, 0.0 ), apV = vec2( 0.0, 1.0 );
  if ( apFade > 0.001 ) {
    // per 6 m pour panel: a random quadrant of the 12 m tile in one of 8 orientations
    vec2 apC = floor( vApronP / 6.0 ), apF = vApronP - apC * 6.0;
    float h0 = apHash( apC ), h1 = apHash( apC + 17.3 ), h2 = apHash( apC + 51.9 );
    bool sw = h0 > 0.5; float sa = h1 > 0.5 ? -1.0 : 1.0, sb = h2 > 0.5 ? -1.0 : 1.0;
    vec2 ab = sw ? apF.yx : apF.xy;
    ab = vec2( sa > 0.0 ? ab.x : 6.0 - ab.x, sb > 0.0 ? ab.y : 6.0 - ab.y );
    vec2 q = floor( vec2( apHash( apC + 3.1 ), apHash( apC + 9.7 ) ) * 2.0 );
    vec2 tuv = ( q * 6.0 + clamp( ab, 0.004, 5.996 ) ) / 12.0;
    // gradients from the continuous position (no mip seam at the panel edges)
    vec2 gx = dFdx( vApronP ) / 12.0, gy = dFdy( vApronP ) / 12.0;
    gx = sw ? gx.yx : gx; gy = sw ? gy.yx : gy; gx *= vec2( sa, sb ); gy *= vec2( sa, sb );
    vec4 fa = textureGrad( apronFine, tuv, gx, gy );
    vec3 fn = textureGrad( apronFineN, tuv, gx, gy ).xyz * 2.0 - 1.0;
    // texture u / v axes in harbor-local (x, z)
    apU = sw ? vec2( 0.0, sa ) : vec2( sa, 0.0 ); apV = sw ? vec2( sb, 0.0 ) : vec2( 0.0, sb );
    apN = fn.xy * apronTune.w * apFade;
    diffuseColor.rgb *= mix( 1.0, 0.5 + fa.r * 1.0, apronTune.x * apFade );
    // rubber arcs where the traffic runs
    diffuseColor.rgb *= 1.0 - fa.a * apMask.r * apronTune.z * apFade;
    // oil: the fine grain thresholded against the mask (crisp splat edges up close)
    float apOs = smoothstep( fa.g - 0.06, fa.g + 0.06, apMask.g * 1.5 );
    apOil = mix( apOil, apOs, apFade );
  }
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.34, 0.33, 0.33 ), apOil * apronTune.y );
  diffuseColor.rgb *= 1.0 - apWet * 0.3;
`;
/** after <roughnessmap_fragment> */
export const SLAB_DETAIL_ROUGH = /* glsl */ `
  roughnessFactor = mix( roughnessFactor, 0.32, clamp( apOil * apronTune.y * 0.8 + apWet * 0.5, 0.0, 1.0 ) );
`;
/** after <normal_fragment_maps> */
export const SLAB_DETAIL_NORMAL = /* glsl */ `
  if ( apFade > 0.001 ) {
    vec3 apT = vApronAX * apU.x + vApronAZ * apU.y, apB = vApronAX * apV.x + vApronAZ * apV.y;
    normal = normalize( normal + apT * apN.x + apB * apN.y );
  }
`;
export const SLAB_TUNE = { value: new THREE.Vector4(1.0, 0.85, 1.0, 0.9) };
if (typeof window !== "undefined") (window as unknown as { __apronTune: typeof SLAB_TUNE }).__apronTune = SLAB_TUNE;
