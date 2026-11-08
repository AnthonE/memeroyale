// poi-harbor kit — instanced ISO shipping containers ("THE FEED"), the shared prop other POIs / the actors area can
// use. Plain placements in → InstancedMeshes out. Colliders for the same placements: `containerBox()` /
// `containerBoxes()` in shared/pois/harbor-kit.ts.
//
//   const kit = new ContainerKit();
//   kit.add({ x, y, z, yaw, color: "yellow" });                       // 40 ft, closed
//   kit.add({ x, y, z, yaw, color: "red", size: 20, open: true, pitch: 0.3 });
//   kit.addStack(x, y, z, yaw, ["yellow", "green"]);                  // two high
//   const set = kit.build({ lod: 60 });                               // once
//   scene.add(set); ctx.onUpdate(() => set.update(ctx.camera.position));
//
// How it renders: every colour shares ONE painted atlas (containers-tex.ts): the paint layer is near-white and is
// multiplied by the per-instance colour where the atlas' tint mask says "painted steel"; rust, dust, rubber, castings
// keep their painted colour. "THE FEED" text + banana logos are stamped in the fragment shader from a per-instance
// decal id (stamp atlas + a tiny rect table), so decals cost no extra draws, never z-fight and survive the LOD box.
// LOD: `build({ lod: metres })` → containers within `lod` of the camera use the full ~2 k-tri model, the rest a
// ~30-tri box painted from the same atlas (instances swap between the two meshes when the camera moves).
//
// Scale: 40 ft = 12.19 × 2.44 × 2.59 m. Local frame: length +X, doors at +X, y = ground contact.
import * as THREE from "three";
import { CONTAINER_DIMS, containerStack, placementHash, type ContainerColor, type ContainerPlacement, type ContainerSize } from "../../../../../shared/pois/harbor-kit";
import { BOT_RAIL_H, PROFILE, SIDE_DEPTH, SIDE_INSET, TOP_RAIL_H, containerGeometry, containerLodGeometry, containerMidGeometry, decalGeometry, sidePeriod, sidePeriods, sideRange } from "./containers-geo";
import { shadowOnly } from "./harbor-geo";
import { INST_FADE, INST_FADE_S, instFadeAttr, patchInstFade } from "./inst-fade";
import { SCHEMES, STAMPS, containerDentNormal, containerDetail, containerSharedAtlas, decalStamps } from "./containers-tex";

const OPEN_ANGLES: [number, number] = [THREE.MathUtils.degToRad(215), THREE.MathUtils.degToRad(110)];
/** enterable boxes: both leaves swung (almost) flat against the side walls */
const ENTER_ANGLES: [number, number] = [THREE.MathUtils.degToRad(262), THREE.MathUtils.degToRad(262)];
/** the geometry variant of a placement: closed, spilled open (wreck), enterable (yard) */
export type OpenVariant = false | true | "enter";
const angles = (v: OpenVariant) => (v === "enter" ? ENTER_ANGLES : v ? OPEN_ANGLES : false);

const geoCache = new Map<string, THREE.BufferGeometry>();
/** full-detail container geometry (shared, cached) */
export function containerGeo(size: ContainerSize, open: OpenVariant): THREE.BufferGeometry {
  const k = `${size}:${open}`;
  let g = geoCache.get(k);
  if (!g) { g = containerGeometry(size, angles(open), open === "enter"); geoCache.set(k, g); }
  return g;
}
/** the shadow casters are INSET boxes: the corrugated walls (valleys 4.5 cm behind the rails) used to sit inside their
 *  own caster box, so every valley + the far flank fell in its own PCF-blurred shadow — "organ-pipe tubes" */
export const CASTER_INSET = 0.1;
let casterUnit: THREE.BufferGeometry | null = null;
const midCache = new Map<string, THREE.BufferGeometry>();
/** the MID level (corrugated long walls, box frame, painted ends) */
export function containerMidGeo(size: ContainerSize, open: OpenVariant): THREE.BufferGeometry {
  const k = `${size}:${open}`;
  let g = midCache.get(k);
  if (!g) { g = containerMidGeometry(size, angles(open)); midCache.set(k, g); }
  return g;
}
const lodCache = new Map<string, THREE.BufferGeometry>();
export function containerLodGeo(size: ContainerSize, open: OpenVariant): THREE.BufferGeometry {
  const k = `${size}:${open}`;
  let g = lodCache.get(k);
  if (!g) { g = containerLodGeometry(size, angles(open)); lodCache.set(k, g); }
  return g;
}

// ------------------------------------------------------------------------------------------------ decal table
/** decal ids (per instance). 20 ft uses id + 8 (its own rects). 0 = none. */
export const DECAL = { none: 0, yellow: 1, logo: 2, lightText: 3, wreck: 4, darkText: 5, blueText: 6 } as const;
type Stamp = keyof Pick<typeof STAMPS, "text" | "bananaMask" | "bananaColor" | "bananaWhite">;
interface StampUse { stamp: Stamp; rect: [number, number, number, number]; tint: string }
const TEXT_DARK = SCHEMES.yellow.text, TEXT_LIGHT = "#f4d23e";
/** wall-space rects (x along the side from its centre in the reading direction, y up from the bottom), metres */
const DECAL_TYPES: Record<number, StampUse[]> = {
  // 40 ft
  1: [{ stamp: "text", rect: [-1.05, 1.3, 5.45, 2.25], tint: TEXT_DARK }, { stamp: "bananaMask", rect: [-2.75, 0.62, -0.95, 2.42], tint: TEXT_DARK }],
  2: [{ stamp: "bananaColor", rect: [-0.35, -1.12, 5.05, 4.28], tint: "#ffffff" }],
  3: [{ stamp: "text", rect: [-3.3, 1.25, 3.3, 2.22], tint: TEXT_LIGHT }],
  4: [{ stamp: "bananaWhite", rect: [-4.6, -0.05, -1.9, 2.65], tint: "#ffffff" }],
  5: [{ stamp: "text", rect: [-1.05, 1.3, 5.45, 2.25], tint: TEXT_DARK }],
  6: [{ stamp: "text", rect: [-3.3, 1.25, 3.3, 2.22], tint: "#1f3f78" }],
  // 20 ft
  9: [{ stamp: "text", rect: [-2.35, 1.38, 2.75, 2.13], tint: TEXT_DARK }],
  10: [{ stamp: "bananaColor", rect: [-1.7, -0.36, 1.95, 3.29], tint: "#ffffff" }],
  11: [{ stamp: "text", rect: [-2.4, 1.36, 2.4, 2.07], tint: TEXT_LIGHT }],
  12: [{ stamp: "bananaWhite", rect: [-1.35, -0.05, 1.35, 2.65], tint: "#ffffff" }],
  13: [{ stamp: "text", rect: [-2.35, 1.38, 2.75, 2.13], tint: TEXT_DARK }],
  14: [{ stamp: "text", rect: [-2.4, 1.36, 2.4, 2.07], tint: "#1f3f78" }],
};
let tableCache: THREE.DataTexture | null = null;
/** per decal type: the pivot its instance scale works around (centre of all its rects, metres) */
function pivotOf(id: number): [number, number] {
  const uses = DECAL_TYPES[id]; if (!uses) return [0, 1.3];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const u of uses) { x0 = Math.min(x0, u.rect[0]); y0 = Math.min(y0, u.rect[1]); x1 = Math.max(x1, u.rect[2]); y1 = Math.max(y1, u.rect[3]); }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}
function decalTable(): THREE.DataTexture {
  if (tableCache) return tableCache;
  const rows = 32, cols = 4, data = new Float32Array(cols * rows * 4);
  const c = new THREE.Color();
  for (const [idS, uses] of Object.entries(DECAL_TYPES)) {
    const pv = pivotOf(Number(idS));
    uses.forEach((u, k) => {
      const row = Number(idS) * 2 + k, s = STAMPS[u.stamp];
      const o = row * cols * 4;
      data.set(u.rect, o);
      data.set([s.x / STAMPS.w, 1 - (s.y + s.h) / STAMPS.h, s.w / STAMPS.w, s.h / STAMPS.h], o + 4);
      c.set(u.tint);
      data.set([c.r, c.g, c.b, 1], o + 8);
      data.set([pv[0], pv[1], 0, 0], o + 12);
    });
  }
  tableCache = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat, THREE.FloatType);
  tableCache.minFilter = tableCache.magFilter = THREE.NearestFilter;
  tableCache.needsUpdate = true;
  return tableCache;
}

/** how far each decal type may slide along the wall (metres, [min, max]) and still stay on the panel */
const DECAL_SLIDE: Record<number, [number, number]> = { 1: [-1.4, 0.3], 2: [-1.6, 0.55], 3: [-2.1, 2.1], 4: [-1.2, 2.6], 5: [-4.6, 0.3], 6: [-2.1, 2.1], 9: [-0.25, 0.1], 10: [-0.8, 0.55], 11: [-0.5, 0.5], 12: [-1.2, 1.2], 13: [-0.25, 0.1], 14: [-0.5, 0.5] };
/** per-instance decal parameters: [id, slide along the wall (m), scale, paint strength] — every box a little different;
 *  about one in five carries a faded / sun-bleached print */
export function decalParams(p: ContainerPlacement, style: "yellow" | "white" = "yellow"): [number, number, number, number] {
  const id = decalId(p, style);
  if (!id) return [0, 0, 1, 1];
  const h1 = placementHash({ x: p.x * 1.37 + 3, y: p.y, z: p.z * 0.71 }), h2 = placementHash({ x: p.z, y: p.x + 1, z: p.y * 3 }), h3 = placementHash({ x: p.y + p.z, y: p.x * 2, z: 7 });
  const [a, b] = DECAL_SLIDE[id] ?? [0, 0];
  const scale = 0.9 + 0.13 * h2;
  const fade = h3 < 0.2 ? 0.42 + h3 * 1.4 : 0.86 + 0.14 * h1;
  return [id, p.decalSlide ?? a + (b - a) * h1, p.decalScale ?? scale, p.decalFade ?? (style === "white" ? fade * 0.9 : fade)];
}

/** the decal id a placement gets (by colour unless overridden) */
export function decalId(p: ContainerPlacement, style: "yellow" | "white" = "yellow"): number {
  const size20 = (p.size ?? 40) === 20;
  let id: number;
  if (p.decal === "none") return 0;
  if (style === "white") id = DECAL.wreck;
  else if (p.decal === "text") id = p.color === "yellow" ? DECAL.darkText : p.color === "white" ? DECAL.blueText : DECAL.lightText;
  else if (p.decal === "logo") id = DECAL.logo;
  else if (p.decal === "both") id = p.color === "yellow" ? DECAL.yellow : DECAL.logo;
  else id = p.color === "yellow" ? DECAL.yellow : p.color === "blue" ? DECAL.lightText : p.color === "white" ? DECAL.blueText : DECAL.logo;
  if (size20 && id === DECAL.yellow) id = DECAL.darkText;
  return id + (size20 ? 8 : 0);
}

// ------------------------------------------------------------------------------------------------ material
// the side-wall corrugation numbers the shader shares with the geometry (fold phase, profile fractions)
const F5 = (v: number) => v.toFixed(5);
const P40 = F5(sidePeriod(40)), P20 = F5(sidePeriod(20)), SX40 = F5(-sideRange(40)[0]), SX20 = F5(-sideRange(20)[0]);
const PC1 = F5(PROFILE.C1), PF1 = F5(PROFILE.F1), PV1 = F5(PROFILE.V1);
/** parallax corrugation (the LOD box's flat side walls): profile depths, the wall's rail band, UV per metre */
const PI_ = F5(SIDE_INSET), PD_ = F5(SIDE_DEPTH), PYB = F5(BOT_RAIL_H), PYT = F5(CONTAINER_DIMS[40].H - TOP_RAIL_H);
const PN40 = F5(sidePeriods(40)), PN20 = F5(sidePeriods(20));
const UVM40 = F5(1 / (sideRange(40)[1] - sideRange(40)[0])), UVM20 = F5(0.5 / (sideRange(20)[1] - sideRange(20)[0]));
const CT_VERT_PARS = /* glsl */ `
attribute vec3 wallUv;
attribute vec4 ctDecal;
varying vec3 vCtWall;
varying vec4 vCtDecal;
varying float vCtGraze;
varying vec3 vCtTan;
varying float vCtSeed;
`;
// wallUv.z: 1 / 2 = corrugated side A (+Z) / B (−Z), 3 / 4 = the flat LOD sides, 0 = not a side wall; +10 on 20 ft boxes
const CT_VERT = /* glsl */ `
  vCtWall = wallUv; vCtDecal = ctDecal; vCtGraze = 0.0; vCtTan = vec3( 0.0 );
  mat4 ctM = modelMatrix;
  #ifdef USE_INSTANCING
    ctM = ctM * instanceMatrix;
  #endif
  // a per-box seed (its world position): every box's ribs + streaks differ
  vCtSeed = fract( dot( ctM[ 3 ].xyz, vec3( 0.1371, 0.2713, 0.4191 ) ) );
  if ( wallUv.z > 0.5 ) {
    float ctSide = mod( mod( wallUv.z, 10.0 ), 2.0 ) > 0.5 ? 1.0 : -1.0;
    // view-space tangent along increasing wallUv.x (side A: local +X, side B: local −X) — the LOD box fakes its folds
    vCtTan = normalize( ( viewMatrix * vec4( ( ctM * vec4( ctSide, 0.0, 0.0, 0.0 ) ).xyz, 0.0 ) ).xyz );
    if ( ctDecal.x > 0.5 ) {
      vec3 ctN = normalize( ( ctM * vec4( 0.0, 0.0, ctSide, 0.0 ) ).xyz );
      vec3 ctP = ( ctM * vec4( transformed, 1.0 ) ).xyz;
      vCtGraze = ( 1.0 - abs( dot( normalize( cameraPosition - ctP ), ctN ) ) ) * smoothstep( 1.2, 3.5, length( cameraPosition - ctP ) );
    }
  }
`;
const CT_FRAG_PARS = /* glsl */ `
uniform sampler2D ctStamps;
uniform highp sampler2D ctTable;
uniform sampler2D ctDetail;
uniform vec4 ctTune;   // x: fill gain on painted steel, y: indirect-specular scale, z: -, w: undo atmos' warm-bounce squaring
uniform vec4 ctTune2;  // x: grime-run strength, y: grime-run share of ribs, z: per-rib tone, w: -
uniform vec4 ctDbg;    // dev switches (1 = on): x parallax trace, y decals, z fold shading, w AO / bounce fix-ups
varying vec3 vCtWall;
varying vec4 vCtDecal;
varying float vCtGraze;
varying vec3 vCtTan;
varying float vCtSeed;
#define CT_C1 ${PC1}
#define CT_F1 ${PF1}
#define CT_V1 ${PV1}
// the LOD box's flat side walls trace the corrugation per pixel (parallax-occlusion in 1-D): the hit point's shift
// along the wall in periods (0 elsewhere) — ctFold, the atlas fetches and the facet normal all read it
float ctPomDu = 0.0;
float ctPomW = 0.0;
// the side-wall corrugation phase (periods from the first fold at the front post) + its screen derivative
vec2 ctFold0() {
  bool c20 = vCtWall.z > 10.5;
  float u = ( vCtWall.x + ( c20 ? ${SX20} : ${SX40} ) ) / ( c20 ? ${P20} : ${P40} );
  return vec2( u, max( fwidth( u ), 1e-4 ) );
}
vec2 ctFold() { vec2 f = ctFold0(); return vec2( f.x + ctPomDu, f.y ); }
// the trapezoid (0 crest … 1 valley) branch-free: the descending flank's ramp, the rising flank's ramp, clamped
float ctProf( float f ) { return clamp( min( ( f - CT_C1 ) * ( 1.0 / ( CT_F1 - CT_C1 ) ), ( 1.0 - f ) * ( 1.0 / ( 1.0 - CT_V1 ) ) ), 0.0, 1.0 ); }
/** the view ray entering the wall's outer plane at phase u0 (periods), moving k periods along the wall per metre of
 *  depth: the depth (m) where it first meets the trapezoid profile (crests CT_I behind the rails, valleys CT_D deeper) */
float ctPomDepth( float u0, float k ) {
  const float I = ${PI_}, D = ${PD_};
  if ( ctProf( fract( u0 + k * I ) ) <= 0.0 ) return I;
  float h0 = I, h1 = I + D;
  // (6 linear steps: a crest is 0.32 of a period, so a step skips one only beyond ~82° incidence)
  for ( int i = 1; i <= 6; i ++ ) {
    float h = I + D * float( i ) * ( 1.0 / 6.0 );
    if ( h >= I + D * ctProf( fract( u0 + k * h ) ) - 1e-5 ) { h1 = h; break; }
    h0 = h;
  }
  for ( int j = 0; j < 3; j ++ ) {
    float hm = 0.5 * ( h0 + h1 );
    if ( hm >= I + D * ctProf( fract( u0 + k * hm ) ) ) h1 = hm; else h0 = hm;
  }
  return h1;
}
float ctHash( float a, float b ) { return fract( sin( a * 12.9898 + b * 78.233 ) * 43758.5453 ); }
`;
/** replaces <map_fragment>: the parallax trace on the LOD walls, then the atlas fetch at the traced point (textureGrad
 *  with the plain UV's derivatives: the shift jumps at facet edges and must not spike the mip level) */
const CT_MAP = /* glsl */ `
  vec2 ctUvShift = vec2( 0.0 );
  vec2 ctGx = dFdx( vMapUv ), ctGy = dFdy( vMapUv );
  {
    vec2 ctF0 = ctFold0();
    float ctK0 = mod( vCtWall.z, 10.0 );
    float ctW = ( 1.0 - smoothstep( 0.12, 0.35, ctF0.y ) ) * step( 2.5, ctK0 ) * step( ctK0, 4.5 ) * step( ${PYB}, vCtWall.y ) * step( vCtWall.y, ${PYT} );
    if ( ctW > 0.001 && gl_FrontFacing && ctDbg.x > 0.5 ) {
      bool c20 = vCtWall.z > 10.5;
      float P = c20 ? ${P20} : ${P40}, NP = c20 ? ${PN20} : ${PN40};
      vec3 V = normalize( vViewPosition ), N = normalize( vNormal );
      float dn = max( dot( V, N ), 0.1 );
      // metres along the wall per metre of depth for the ray INTO the wall
      float s = clamp( -dot( V, vCtTan ) / dn, -8.0, 8.0 );
      float k = s / P;
      float h = ctPomDepth( ctF0.x, k );
      float uHit = clamp( ctF0.x + k * h, 0.02, NP - 0.02 );
      ctPomDu = ( uHit - ctF0.x ) * ctW;
      ctPomW = ctW;
      ctUvShift.x = ctPomDu * P * ( c20 ? ${UVM20} : ${UVM40} );
    }
  }
#ifdef USE_MAP
  diffuseColor *= ctPomW > 0.0 ? textureGrad( map, vMapUv + ctUvShift, ctGx, ctGy ) : texture2D( map, vMapUv );
#endif
`;
const CT_ROUGHMAP = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor *= ( ctPomW > 0.0 ? textureGrad( roughnessMap, vRoughnessMapUv + ctUvShift, ctGx, ctGy ) : texture2D( roughnessMap, vRoughnessMapUv ) ).g;
#endif
`;
const CT_FRAG = /* glsl */ `
  float ctMask = 0.0;
#if defined( USE_COLOR )
  // tint only the painted-steel part of the atlas (R of the roughness/mask map)
  ctMask = ( ctPomW > 0.0 ? textureGrad( roughnessMap, vRoughnessMapUv + ctUvShift, ctGx, ctGy ) : texture2D( roughnessMap, vRoughnessMapUv ) ).r;
  diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, ctMask );
#endif
  // BANANA CO. stamps on the side walls (per-instance decal id + slide / scale / paint strength → 2 rects from the table)
  if ( vCtDecal.x > 0.5 && vCtWall.z > 0.5 && ctDbg.y > 0.5 ) {
    int ctRow = int( vCtDecal.x + 0.5 ) * 2;
    float ctOn = gl_FrontFacing ? 1.0 : 0.0;
    vec2 wxy = vCtWall.xy;
    if ( mod( vCtWall.z, 10.0 ) < 2.5 ) {
      // corrugated wall seen along its length: the flanks facing the eye carry the WHOLE period's paint, so the print
      // stays continuous instead of breaking into ridge/valley stair-steps ("BAHAHA C9")
      bool s20 = vCtDecal.x > 8.5;
      float P = s20 ? ${P20} : ${P40}, sx1 = s20 ? ${SX20} : ${SX40};
      float u = ( wxy.x + sx1 ) / P, f = fract( u ), p0 = floor( u );
      float fx = f < CT_C1 ? f : f < CT_F1 ? ( f - CT_C1 ) / ( CT_F1 - CT_C1 ) : f < CT_V1 ? f : ( f - CT_V1 ) / ( 1.0 - CT_V1 );
      wxy.x = mix( wxy.x, ( p0 + fx ) * P - sx1, smoothstep( 0.5, 0.82, vCtGraze ) );
    }
    vec4 pv = texelFetch( ctTable, ivec2( 3, ctRow ), 0 );
    wxy = vec2( ( wxy.x - vCtDecal.y - pv.x ) / vCtDecal.z + pv.x, ( wxy.y - pv.y ) / vCtDecal.z + pv.y );
    for ( int k = 0; k < 2; k ++ ) {
      vec4 rc = texelFetch( ctTable, ivec2( 0, ctRow + k ), 0 );
      vec2 sz = max( rc.zw - rc.xy, vec2( 1e-4 ) );
      vec2 q = ( wxy - rc.xy ) / sz;
      float inside = step( 0.0, q.x ) * step( q.x, 1.0 ) * step( 0.0, q.y ) * step( q.y, 1.0 ) * step( 1e-3, rc.z - rc.x );
      // (perf: most of a wall is outside both rects — skip the other two table fetches + the stamp fetch there)
      if ( inside < 0.5 ) continue;
      vec4 at = texelFetch( ctTable, ivec2( 1, ctRow + k ), 0 );
      vec4 tn = texelFetch( ctTable, ivec2( 2, ctRow + k ), 0 );
      vec4 st = texture2D( ctStamps, at.xy + clamp( q, 0.0, 1.0 ) * at.zw );
      vec3 ink = mix( diffuseColor.rgb, st.rgb * tn.rgb, 0.85 + 0.15 * vCtDecal.w );
      // (the stamp alpha is a signed distance field — a crisp edge with a one-pixel AA ramp at any distance)
      float sdW = max( fwidth( st.a ) * 0.75, 0.004 );
      float cov = smoothstep( 0.5 - sdW, 0.5 + sdW, st.a );
      diffuseColor.rgb = mix( diffuseColor.rgb, ink, cov * tn.a * inside * ctOn * vCtDecal.w );
    }
  }
  // near-field paint detail (the atlas alone is blurry at 1–3 m): orange peel, fine scratches, pits — fades out by ~13 m
  float ctNear = 1.0 - smoothstep( 5.0, 13.0, length( vViewPosition ) );
  vec2 ctDet = vec2( 0.5 );
  if ( ctNear > 0.001 ) {
    ctDet = texture2D( ctDetail, vMapUv * vec2( 26.0, 24.0 ) ).rg;
    diffuseColor.rgb *= 1.0 + ( ctDet.r - 0.5 ) * 0.55 * ctNear;
  }
  // the long walls' folds, resolution-independent (never "organ pipes / wooden fence"): cavity shading by
  // profile region (valleys hold grime + see less sky, flanks between), a crisp worn-paint highlight on both crest
  // edges, a dark crease in the valley folds, a per-rib paint tone (rolled sheet never quite matches) and vertical
  // grime / rust runs from the top rail down individual ribs — all faded out before they alias
  float ctKind = mod( vCtWall.z, 10.0 );
  vec2 ctU = ctFold();
  if ( ctKind > 0.5 && gl_FrontFacing && ctDbg.z > 0.5 && ctU.y < 0.55 ) {
    float f = fract( ctU.x ), fw = ctU.y, rib = floor( ctU.x );
    float dC = min( min( f, 1.0 - f ), abs( f - CT_C1 ) ), dV = min( abs( f - CT_F1 ), abs( f - CT_V1 ) );
    float lw = 0.018, vis = 1.0 - smoothstep( 0.05, 0.13, fw ), visFar = 1.0 - smoothstep( 0.2, 0.55, fw );
    float crest = 1.0 - smoothstep( lw, lw + fw, dC ), crease = 1.0 - smoothstep( lw * 0.8, lw * 0.8 + fw, dV );
    float valley = smoothstep( CT_F1 - fw, CT_F1 + fw, f ) * ( 1.0 - smoothstep( CT_V1 - fw, CT_V1 + fw, f ) );
    float flank = smoothstep( CT_C1 - fw, CT_C1 + fw, f ) * ( 1.0 - smoothstep( CT_F1 - fw, CT_F1 + fw, f ) ) + smoothstep( CT_V1 - fw, CT_V1 + fw, f );
    diffuseColor.rgb *= 1.0 - visFar * ( 0.17 * valley + 0.08 * flank );
    diffuseColor.rgb *= 1.0 + vis * ( 0.26 * crest - 0.3 * crease );
    // per-rib tone (±3.5 %) — a hand-painted panel look (kept low with the grime runs: stronger, together they read
    // as wood grain / cardboard at 1440p)
    float rt = ctHash( rib, vCtSeed * 97.0 + ctKind );
    diffuseColor.rgb *= 1.0 + visFar * ( rt - 0.5 ) * ctTune2.z;
    // grime runs: ~1 rib in 5 carries a thin warm-dark run from under the top rail, 0.2–1.2 m long, centred on its
    // crest or valley, fading downward (+ a few short ones rising from the bottom rail)
    float wallTop = 2.36, yTop = wallTop - vCtWall.y;
    float hr = ctHash( rib + 0.37, vCtSeed * 53.0 + ctKind * 3.1 );
    if ( hr < ctTune2.y ) {
      float len = 0.2 + 1.0 * ctHash( rib + 1.7, vCtSeed * 31.0 ), cx = ctHash( rib + 4.1, vCtSeed ) < 0.5 ? CT_C1 * 0.5 : ( CT_F1 + CT_V1 ) * 0.5;
      float wid = 0.04 + 0.06 * ctHash( rib + 9.3, vCtSeed * 7.0 );
      float across = 1.0 - smoothstep( wid * 0.5, wid * 0.5 + fw, abs( f - cx ) );
      float along = ( 1.0 - smoothstep( 0.0, len, yTop ) ) * step( 0.0, yTop );
      diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.66, 0.52, 0.36 ), ctTune2.x * across * along * visFar );
    }
    if ( hr > 0.9 ) {
      float yb = vCtWall.y - 0.25, len = 0.15 + 0.4 * ctHash( rib + 2.3, vCtSeed );
      float across = 1.0 - smoothstep( 0.05, 0.05 + fw, abs( f - 0.66 ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.36, 0.2, 0.1 ), 0.45 * across * ( 1.0 - smoothstep( 0.0, len, yb ) ) * step( 0.0, yb ) * visFar );
    }
  }
  // inside faces (seen through open doors): dim — little sky/sun reaches in there
  if ( !gl_FrontFacing ) diffuseColor.rgb *= 0.42;
`;
/** after the normal maps: the flat LOD sides fake the trapezoid flanks (±37°) so boxes at 20–170 m still read ribbed */
const CT_NORMAL = /* glsl */ `
  if ( mod( vCtWall.z, 10.0 ) > 2.5 && gl_FrontFacing ) {
    vec2 ctU = ctFold();
    float f = fract( ctU.x ), fw = ctU.y;
    float tilt = ( smoothstep( CT_C1 - fw, CT_C1 + fw, f ) - smoothstep( CT_F1 - fw, CT_F1 + fw, f ) ) - smoothstep( CT_V1 - fw, CT_V1 + fw, f );
    // (traced walls show the TRUE facet under the pixel — a steeper, crisper flank, 1.58 = the profile's slope)
    normal = normalize( normal + vCtTan * tilt * mix( 0.72, 1.3, ctPomW ) * ( 1.0 - smoothstep( 0.15, 0.4, fw ) ) );
  }
`;
/** after the roughness map: detail roughness (scratches + pits rougher) */
const CT_ROUGH = /* glsl */ `
  roughnessFactor = clamp( roughnessFactor + ( ctDet.g - 0.5 ) * 0.45 * ctNear, 0.08, 1.0 );
`;
/** after atmos' screen-space AO (inserted right after <aomap_fragment>): the painted outside keeps only ~35 % of it.
 *  The half-res SSAO (0.75 m radius) shaded every 4.5 cm corrugation valley into a soft gradient — "organ pipe
 *  tubes". Contact darkening on the ground + between stacked boxes survives at 35 %. */
const CT_AO = /* glsl */ `
#if defined( ATMOS_LIT ) && defined( ATM_WPOS )
  if ( gl_FrontFacing && ctDbg.w > 0.5 ) {
    float ctAO = clamp( atmosSSAO( ATM_WPOS ), 0.2, 1.0 ), ctKeep = mix( 1.0, ctAO, 0.35 );
    reflectedLight.indirectDiffuse *= ctKeep / ctAO; reflectedLight.indirectSpecular *= ctKeep / ctAO;
    float ctD = mix( 1.0, ctKeep, uAtmAOParams.y ) / mix( 1.0, ctAO, uAtmAOParams.y );
    reflectedLight.directDiffuse *= ctD; reflectedLight.directSpecular *= ctD;
  }
#endif
#if defined( ATMOS_LIT )
  // (else the hero yellow renders mustard / cardboard): on the painted steel, atmos' warm multi-bounce
  // multiplies the fill by albedo / luminance a SECOND time — on a yellow (G < R) that squares the chroma toward orange.
  // Undo it here and lift the fill instead (hue-preserving: the shade sides stay banana-yellow), and keep the
  // sky's sheen off the paint (its milky specular desaturated the lit sides to S 0.74)
  if ( ctMask > 0.01 && gl_FrontFacing && ctDbg.w > 0.5 ) {
    if ( uAtmBounce > 0.0 && ctTune.w > 0.0 ) {
      vec3 ctA = clamp( diffuseColor.rgb, 0.0, 1.0 );
      float ctL = max( dot( ctA, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-3 );
      float ctW = smoothstep( 0.15, 0.6, ( ctA.r - ctA.b ) / ctL ) * smoothstep( -0.02, 0.06, ( ctA.r - ctA.g ) / ctL );
      vec3 ctB = mix( vec3( 1.0 ), ctA / ctL, uAtmBounce * ctW );
      // keep the brightness atmos gave the fill, but with the paint's own hue (chroma applied once, not squared)
      vec3 ctI0 = reflectedLight.indirectDiffuse, ctI1 = ctI0 / max( ctB, vec3( 0.05 ) );
      ctI1 *= dot( ctI0, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( ctI1, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-6 );
      reflectedLight.indirectDiffuse = mix( ctI0, ctI1, ctTune.w * ctMask );
    }
    reflectedLight.indirectDiffuse *= 1.0 + ctTune.x * ctMask;
    reflectedLight.indirectSpecular *= mix( 1.0, ctTune.y, ctMask );
  }
#endif
`;
/** runtime tuning of the paint response (shared uniforms; `window.__ctTune` in dev) */
// (tuned at poi-01 4K / the lane / char-03: fill ×2 + half the bounce squaring undone → shade yellows golden H 42 V 0.55
// instead of mustard H 37 V 0.42; a pre-tone saturation push was tried and only shifted the hue orange — the grade's
// soft gamut floors every channel at ~11 % of the grey, which caps a lit yellow at S ≈ 0.73 whatever the albedo)
export const CT_TUNE = { ctTune: { value: new THREE.Vector4(1.0, 0.6, 0, 0.5) }, ctTune2: { value: new THREE.Vector4(0.28, 0.2, 0.07, 0) }, ctDbg: { value: new THREE.Vector4(1, 1, 1, 1) } };
if (typeof window !== "undefined") (window as unknown as { __ctTune: typeof CT_TUNE }).__ctTune = CT_TUNE;

const matCache = new Map<string, THREE.MeshStandardMaterial>();
/** the shared container material (FrontSide for closed boxes, DoubleSide for open ones) */
export function containerMaterial(_color?: ContainerColor, doubleSided = false): THREE.MeshStandardMaterial {
  const k = doubleSided ? "ds" : "fs";
  let m = matCache.get(k);
  if (m) return m;
  const a = containerSharedAtlas();
  m = new THREE.MeshStandardMaterial({
    map: a.map, roughnessMap: a.roughMask, roughness: 1, metalness: 0.05,
    normalMap: containerDentNormal(), normalScale: new THREE.Vector2(0.35, 0.35),
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.name = `container-${k}`;
  const stamps = decalStamps(), table = decalTable(), detail = containerDetail();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.ctStamps = { value: stamps };
    shader.uniforms.ctTable = { value: table };
    shader.uniforms.ctDetail = { value: detail };
    shader.uniforms.ctTune = CT_TUNE.ctTune; shader.uniforms.ctTune2 = CT_TUNE.ctTune2; shader.uniforms.ctDbg = CT_TUNE.ctDbg;
    shader.vertexShader = CT_VERT_PARS + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + CT_VERT);
    patchInstFade(shader);
    shader.fragmentShader = CT_FRAG_PARS + shader.fragmentShader
      .replace("#include <map_fragment>", CT_MAP)
      .replace("#include <color_fragment>", CT_FRAG)
      .replace("#include <roughnessmap_fragment>", CT_ROUGHMAP + CT_ROUGH)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + CT_NORMAL)
      .replace("#include <aomap_fragment>", "#include <aomap_fragment>\n" + CT_AO);
  };
  m.customProgramCacheKey = () => INST_FADE ? "container-v8-kd" : "container-v8";
  matCache.set(k, m);
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

/** world matrix of a placement (translate · Ry(yaw) · Rz(pitch) · Rx(roll)) */
export function placementMatrix(p: ContainerPlacement, out = new THREE.Matrix4()): THREE.Matrix4 {
  _e.set(p.roll ?? 0, p.yaw, p.pitch ?? 0, "YZX");
  _q.setFromEuler(_e);
  _p.set(p.x, p.y, p.z);
  return out.compose(_p, _q, _s);
}

/** the per-instance colour: scheme colour × a small brightness/hue variance */
export function containerTint(p: ContainerPlacement, out = new THREE.Color()): THREE.Color {
  const h = placementHash(p);
  const v = p.tint ?? 0.9 + 0.16 * h;
  out.set(SCHEMES[p.color].base);
  out.r *= v * (0.98 + 0.04 * ((h * 7) % 1)); out.g *= v * (0.98 + 0.03 * ((h * 13) % 1)); out.b *= v * (0.96 + 0.08 * ((h * 29) % 1));
  return out;
}

/** a view of a shared geometry with its own per-instance decal attribute (buffers are shared, not copied) */
function instancedView(base: THREE.BufferGeometry, capacity: number): { geo: THREE.BufferGeometry; decal: THREE.InstancedBufferAttribute } {
  const geo = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(base.attributes)) geo.setAttribute(k, a);
  geo.boundingBox = base.boundingBox; geo.boundingSphere = base.boundingSphere;
  const decal = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 4), 4);
  decal.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("ctDecal", decal);
  return { geo, decal };
}

/** the invisible material of the box-geometry shadow casters (the corrugated model never goes into a shadow map).
 *  In the MAIN pass every vertex is thrown outside the clip volume, so nothing is rasterised (a colorWrite=false
 *  MeshBasicMaterial would still rasterise every box face of the whole yard first, renderOrder −1, with no depth to
 *  reject it: 0.8 ms of invisible overdraw at kong eye in a lane). The shadow + far-map passes draw these meshes with
 *  three's own depth material, so they still cast exactly the box silhouettes. */
let casterMat: THREE.ShaderMaterial | null = null;
function shadowOnlyMaterial(): THREE.ShaderMaterial {
  return (casterMat ??= Object.assign(new THREE.ShaderMaterial({
    vertexShader: "void main() { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); }",
    fragmentShader: "void main() { gl_FragColor = vec4( 0.0 ); }",
    colorWrite: false, depthWrite: false, depthTest: false,
  }), { name: "container-shadow-caster" }));
}

interface Level { mesh: THREE.InstancedMesh; decal: THREE.InstancedBufferAttribute; kd: THREE.InstancedBufferAttribute }
interface Bucket {
  size: ContainerSize; open: OpenVariant;
  items: ContainerPlacement[];
  mats: Float32Array; cols: Float32Array; decals: Float32Array; centres: Float32Array;
  /** [full model, mid (corrugated sides), LOD box] — levels 1/2 are absent without LOD */
  levels: Array<Level | null>;
  /** LOD-box geometry for every instance, invisible, the only thing that casts (≤ shadowDist) */
  caster: THREE.InstancedMesh | null;
  /** current level per instance (0 full, 1 mid, 2 box) */
  level: Uint8Array;
  /** bucket bounds (set-local) */
  sphere: THREE.Sphere;
  /** instance write order (front-to-back) + its sort keys */
  order?: Uint32Array; key?: Float32Array;
  /** the level each instance is crossfading FROM (255 = none) and when that started (ms) */
  from?: Uint8Array; fromT?: Float64Array; fading?: number;
  /** (perf) the sort-camera generation `order` was last sorted for */
  sortGen?: number;
}

/** the built containers: a Group with an LOD `update(cameraPosition)` */
export class ContainerSet extends THREE.Group {
  readonly buckets: Bucket[] = [];
  /** full model within `lod` m, the corrugated MID model to `midLod` m, the ~36-tri box beyond */
  lod = Infinity;
  midLod = Infinity;
  /** the caster (box geometry) is enabled while the camera is within this distance of the set's bounds (m) */
  shadowDist = 60;
  /** ONE instanced unit-box caster for every box of the set (all sizes, open or not: perf — one caster per bucket
   *  cost an empty main-pass draw + a draw per cascade each) */
  caster: THREE.InstancedMesh | null = null;
  readonly bounds = new THREE.Sphere();
  private last = new THREE.Vector3(1e9, 1e9, 1e9);
  private lastSort = new THREE.Vector3(1e9, 1e9, 1e9);
  private frames = 0;
  /** the camera the instance order was last sorted for (write() emits instances NEAR → FAR: one big bucket drawn in
   *  placement order threw away early-z — every box behind the lane wall was shaded too) */
  private sortCam = new THREE.Vector3(1e9, 1e9, 1e9);
  private sortGen = 0;
  /** swap instances between the full model, the mid model and the LOD box by distance to `cam` (set-local; cheap) */
  update(cam: THREE.Vector3, force = false) {
    const now = performance.now();
    // crossfading buckets are rewritten every frame until their swaps have finished
    if (this.fadingBuckets.size) for (const b of this.fadingBuckets) this.write(b, now);
    if (!force && ++this.frames < 20 && cam.distanceToSquared(this.last) < 1) return;
    this.frames = 0; this.last.copy(cam);
    // re-sort front-to-back when the camera has moved 8 m (all buckets rewritten)
    if (cam.distanceToSquared(this.lastSort) > 64) { this.lastSort.copy(cam); this.sortCam.copy(cam); this.sortGen++; force = true; }
    const hy = 6, mid = Math.max(this.midLod, this.lod);
    const in0 = this.lod * this.lod, out0 = (this.lod + hy) ** 2, in1 = mid * mid, out1 = (mid + hy) ** 2;
    if (this.caster) { const cast = Math.max(0, cam.distanceTo(this.bounds.center) - this.bounds.radius) < this.shadowDist; if (this.caster.castShadow !== cast) { this.caster.castShadow = cast; this.caster.visible = cast; } }
    for (const b of this.buckets) {
      const d = Math.max(0, cam.distanceTo(b.sphere.center) - b.sphere.radius);
      // (a caster that is not casting is hidden too: it still cost a main-pass draw call every frame)
      if (b.caster) { const cast = d < this.shadowDist; if (b.caster.castShadow !== cast) { b.caster.castShadow = cast; b.caster.visible = cast; } }
      if (!isFinite(this.lod)) { if (force) this.write(b); continue; }
      let changed = force;
      // the whole bucket beyond both ranges: everything is a box
      if (d > mid + hy) {
        for (let i = 0; i < b.items.length; i++) if (b.level[i] !== 2) { this.swap(b, i, 2, now); changed = true; }
        if (changed) this.write(b, now);
        continue;
      }
      const hasMid = !!b.levels[1];
      for (let i = 0; i < b.items.length; i++) {
        const dx = b.centres[i * 3] - cam.x, dy = b.centres[i * 3 + 1] - cam.y, dz = b.centres[i * 3 + 2] - cam.z;
        const d2 = dx * dx + dy * dy + dz * dz, cur = b.level[i];
        let want: number;
        if (d2 < (cur === 0 ? out0 : in0)) want = 0;
        else if (hasMid && d2 < (cur <= 1 ? out1 : in1)) want = 1;
        else want = 2;
        if (want !== cur) { this.swap(b, i, want, now); changed = true; }
      }
      if (changed) this.write(b, now);
    }
  }
  private fadingBuckets = new Set<Bucket>();
  /** an instance changes level: with INST_FADE (and a camera that did not cut) it crossfades from the old one */
  private swap(b: Bucket, i: number, want: number, now: number) {
    const cur = b.level[i];
    b.level[i] = want;
    if (!INST_FADE || !b.levels[cur] || !b.levels[want]) return;
    const from = (b.from ??= new Uint8Array(b.items.length).fill(255)), t0 = (b.fromT ??= new Float64Array(b.items.length));
    // (a swap back while still fading: it fades back from where it was going)
    from[i] = cur; t0[i] = now;
    this.fadingBuckets.add(b);
  }
  write(b: Bucket, now = performance.now()) {
    const cnt = [0, 0, 0];
    const from = b.from, t0 = b.fromT;
    let fading = 0;
    // front-to-back order for the current sort camera
    const N = b.items.length, order = (b.order ??= new Uint32Array(N).map((_, i) => i)), key = (b.key ??= new Float32Array(N));
    const sc = this.sortCam;
    // (perf) sort only when the sort camera moved since this bucket's last sort: a crossfading bucket
    // is rewritten EVERY frame (INST_FADE) and re-sorted all its instances with a comparator each time
    if (sc.x < 1e8 && b.sortGen !== this.sortGen) {
      b.sortGen = this.sortGen;
      for (let i = 0; i < N; i++) { const dx = b.centres[i * 3] - sc.x, dy = b.centres[i * 3 + 1] - sc.y, dz = b.centres[i * 3 + 2] - sc.z; key[i] = dx * dx + dy * dy + dz * dz; }
      order.sort((p, q) => key[p] - key[q]);
    }
    for (let j = 0; j < N; j++) {
      const i = order[j];
      let lv = b.level[i];
      if (!b.levels[lv]) lv = lv === 1 && b.levels[2] ? 2 : 0;
      const L = b.levels[lv]!, n = cnt[lv]++;
      (L.mesh.instanceMatrix.array as Float32Array).set(b.mats.subarray(i * 16, i * 16 + 16), n * 16);
      (L.mesh.instanceColor!.array as Float32Array).set(b.cols.subarray(i * 3, i * 3 + 3), n * 3);
      (L.decal.array as Float32Array).set(b.decals.subarray(i * 4, i * 4 + 4), n * 4);
      let t = 1, fl = 255;
      if (from && t0 && from[i] !== 255) {
        t = (now - t0[i]) / (INST_FADE_S * 1000);
        if (t >= 1 || from[i] === lv || !b.levels[from[i]]) { from[i] = 255; t = 1; } else { fl = from[i]; fading++; }
      }
      // arriving level: draws the pixels with noise < t; the leaving one the rest (complementary)
      (L.kd.array as Float32Array)[n] = t < 1 ? t - 1 : 0;
      if (fl !== 255) {
        const F = b.levels[fl]!, m = cnt[fl]++;
        (F.mesh.instanceMatrix.array as Float32Array).set(b.mats.subarray(i * 16, i * 16 + 16), m * 16);
        (F.mesh.instanceColor!.array as Float32Array).set(b.cols.subarray(i * 3, i * 3 + 3), m * 3);
        (F.decal.array as Float32Array).set(b.decals.subarray(i * 4, i * 4 + 4), m * 4);
        (F.kd.array as Float32Array)[m] = Math.max(0.011, t);
      }
    }
    b.fading = fading;
    if (!fading) this.fadingBuckets.delete(b);
    b.levels.forEach((L, k) => {
      if (!L) return;
      const m = L.mesh, n = cnt[k];
      m.count = n; m.visible = n > 0;
      m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; L.decal.needsUpdate = true; L.kd.needsUpdate = true;
      m.boundingSphere = null; if (n) m.computeBoundingSphere();
    });
  }
  /** register the LOD update on the engine's frame hooks (camera in world space → set-local) */
  autoUpdate(ctx: { onUpdate(fn: (dt: number, t: number) => void): void; camera: THREE.Camera }) {
    const inv = new THREE.Matrix4(), local = new THREE.Vector3();
    ctx.onUpdate(() => { inv.copy(this.matrixWorld).invert(); this.update(local.copy(ctx.camera.position).applyMatrix4(inv)); });
    return this;
  }
  /** full-detail instance count right now (for budgets / debugging) */
  nearCount() { return this.buckets.reduce((s, b) => s + (b.levels[0]?.mesh.count ?? 0), 0); }
}

export class ContainerKit {
  readonly placements: ContainerPlacement[] = [];
  /** decal style: "white" = faded white banana-bunch logos on every colour (the wreck) */
  logoStyle: "yellow" | "white" = "yellow";
  /** 0..1 sun-faded + salt-crusted paint (the wreck's spill): desaturates and darkens the instance colours */
  weathered = 0;
  add(p: ContainerPlacement) { this.placements.push(p); return p; }
  addMany(ps: ContainerPlacement[]) { for (const p of ps) this.placements.push(p); return ps; }
  addStack(x: number, y: number, z: number, yaw: number, colors: ContainerColor[], size: ContainerSize = 40, o: Partial<ContainerPlacement> = {}) {
    return this.addMany(containerStack(x, y, z, yaw, colors, size, o));
  }

  /**
   * Build the instanced meshes into one ContainerSet. Placements are bucketed per `cell` metres (default 64) so each
   * InstancedMesh has tight bounds and frustum culling works per cell. `lod` (metres): beyond it containers draw as
   * the ~30-tri box (call set.update(camPos) per frame, or set.autoUpdate(ctx)); omit for full detail everywhere.
   * Shadows: the corrugated model never casts — an invisible box-geometry caster per cell does, while the camera is
   * within `shadowDist` (default 60 m) of the cell (the static far shadow map covers the rest; `farShadow` = a
   * ContainerFarProxy or false). `shadows: false` disables casting entirely.
   */
  build(o: { shadows?: boolean; name?: string; lod?: number; midLod?: number; cell?: number; shadowDist?: number } = {}): ContainerSet {
    const it = this.steps(o);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }
  /** the same build in slices — `yieldFn` (a module's `ctx.yield`) runs between the buckets and before the
   *  caster, so a streamed POI never blocks the main thread for the whole yard at once */
  async buildAsync(o: { shadows?: boolean; name?: string; lod?: number; midLod?: number; cell?: number; shadowDist?: number }, yieldFn: () => Promise<void>): Promise<ContainerSet> {
    const it = this.steps(o);
    let r = it.next();
    while (!r.done) { await yieldFn(); r = it.next(); }
    return r.value;
  }
  private *steps(o: { shadows?: boolean; name?: string; lod?: number; midLod?: number; cell?: number; shadowDist?: number } = {}): Generator<void, ContainerSet, void> {
    const set = new ContainerSet();
    set.name = o.name ?? "containers";
    const shadows = o.shadows ?? true;
    set.lod = o.lod ?? Infinity;
    set.midLod = o.midLod ?? set.lod;
    set.shadowDist = o.shadowDist ?? 60;
    const useLod = isFinite(set.lod), useMid = set.midLod > set.lod, cell = o.cell ?? 64;
    const groups = new Map<string, ContainerPlacement[]>();
    for (const p of this.placements) {
      const k = `${p.size ?? 40}:${p.enter ? 2 : p.open ? 1 : 0}:${Math.floor(p.x / cell)}:${Math.floor(p.z / cell)}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
    }
    yield;
    for (const [k, items] of groups) {
      const [sizeS, openS] = k.split(":");
      const size = Number(sizeS) as ContainerSize, open: OpenVariant = openS === "2" ? "enter" : openS === "1";
      const n = items.length;
      const mat = containerMaterial(undefined, !!open);
      const level = (geo: THREE.BufferGeometry, name: string): Level => {
        const v = instancedView(geo, n), m = new THREE.InstancedMesh(v.geo, mat, n), kd = instFadeAttr(v.geo, n);
        m.name = name;
        m.castShadow = false; m.receiveShadow = true; m.userData.castShadow = false; m.userData.farShadow = false;
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
        return { mesh: m, decal: v.decal, kd };
      };
      const levels: Array<Level | null> = [
        level(containerGeo(size, open), `containers-${k}`),
        useLod && useMid ? level(containerMidGeo(size, open), `containers-mid-${k}`) : null,
        useLod ? level(containerLodGeo(size, open), `containers-lod-${k}`) : null,
      ];
      const b: Bucket = {
        size, open, items, mats: new Float32Array(n * 16), cols: new Float32Array(n * 3), decals: new Float32Array(n * 4), centres: new Float32Array(n * 3),
        levels, caster: null, level: new Uint8Array(n).fill(useLod ? 2 : 0), sphere: new THREE.Sphere(),
      };
      const H = CONTAINER_DIMS[size].H;
      const pts: THREE.Vector3[] = [];
      items.forEach((p, i) => {
        placementMatrix(p, _m);
        _m.toArray(b.mats, i * 16);
        containerTint(p, _c);
        if (this.weathered > 0) {
          const w = this.weathered * (0.7 + 0.6 * placementHash({ x: p.z, y: p.x, z: p.y }));
          const l = _c.r * 0.3 + _c.g * 0.55 + _c.b * 0.15;
          _c.setRGB(_c.r + (l - _c.r) * 0.35 * w, _c.g + (l - _c.g) * 0.35 * w, _c.b + (l - _c.b) * 0.35 * w).multiplyScalar(1 - 0.16 * w);
        }
        _c.toArray(b.cols, i * 3);
        b.decals.set(decalParams(p, this.logoStyle), i * 4);
        _p.set(0, H / 2, 0).applyMatrix4(_m).toArray(b.centres, i * 3);
        pts.push(_p.clone());
      });
      b.sphere.setFromPoints(pts); b.sphere.radius += CONTAINER_DIMS[size].L / 2 + 1;
      set.buckets.push(b);
      set.write(b);
      for (const L of levels) if (L) set.add(L.mesh);
      yield;
    }
    if (shadows && this.placements.length) {
      // the ONE caster: a unit box (y 0…1) per placement, scaled to the box inset by CASTER_INSET
      const unit = (casterUnit ??= new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
      // (its own geometry instance: shadowOnly() toggles the draw range per pass)
      const caster = shadowOnly(new THREE.InstancedMesh(unit.clone(), shadowOnlyMaterial(), this.placements.length));
      caster.name = `${set.name}-caster`;
      const sm = new THREE.Matrix4(), pts: THREE.Vector3[] = [];
      this.placements.forEach((p, i) => {
        const { L, W, H } = CONTAINER_DIMS[p.size ?? 40];
        placementMatrix(p, _m).multiply(sm.makeTranslation(0, CASTER_INSET, 0)).multiply(new THREE.Matrix4().makeScale(L - 2 * CASTER_INSET, H - 2 * CASTER_INSET, W - 2 * CASTER_INSET));
        caster.setMatrixAt(i, _m);
        pts.push(new THREE.Vector3(p.x, p.y + H / 2, p.z));
      });
      caster.instanceMatrix.needsUpdate = true; caster.computeBoundingSphere();
      caster.castShadow = true; caster.receiveShadow = false; caster.userData.castShadow = true; caster.userData.farShadow = false;
      set.caster = caster; set.add(caster);
      yield;
      set.bounds.setFromPoints(pts); set.bounds.radius += 8;
      // the static far shadow map (atmos bakes it once from the casters) gets EVERY box, whatever the camera distance
      // at bake time: a hidden merged box proxy that the bake force-shows
      const bake = new THREE.Mesh(containerProxyGeometry(this.placements, CASTER_INSET), shadowOnlyMaterial());
      bake.name = `${set.name}-farshadow`;
      bake.visible = false; bake.castShadow = true; bake.receiveShadow = false;
      bake.userData.castShadow = true; bake.userData.farShadow = "force";
      set.add(bake);
    }
    return set;
  }
}

/**
 * A merged, untextured far stand-in for a set of containers (one draw): vertex-coloured boxes (roof + 4 sides). Use it
 * as the harbor's distance proxy and as the static far-shadow-map caster (`userData.farShadow = "force"`).
 */
export function containerProxyGeometry(ps: ContainerPlacement[], inset = 0): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], nor: number[] = [];
  const c = new THREE.Color(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const p of ps) {
    const d = CONTAINER_DIMS[p.size ?? 40], L = d.L - 2 * inset, W = d.W - 2 * inset, H = d.H - inset;
    placementMatrix(p, _m); nm.getNormalMatrix(_m);
    containerTint(p, c);
    const x = L / 2, z = W / 2;
    const faces: Array<[number[][], number[], number]> = [
      [[[-x, H, z], [x, H, z], [x, H, -z], [-x, H, -z]], [0, 1, 0], 1.08],
      [[[-x, 0, z], [x, 0, z], [x, H, z], [-x, H, z]], [0, 0, 1], 0.92],
      [[[x, 0, -z], [-x, 0, -z], [-x, H, -z], [x, H, -z]], [0, 0, -1], 0.92],
      [[[x, 0, z], [x, 0, -z], [x, H, -z], [x, H, z]], [1, 0, 0], 0.8],
      [[[-x, 0, -z], [-x, 0, z], [-x, H, z], [-x, H, -z]], [-1, 0, 0], 0.85],
    ];
    for (const [q, n, k] of faces) {
      const w = [q[0], q[1], q[2], q[0], q[2], q[3]];
      v.set(n[0], n[1], n[2]).applyMatrix3(nm).normalize();
      for (const pt of w) {
        const pw = new THREE.Vector3(pt[0], pt[1], pt[2]).applyMatrix4(_m);
        pos.push(pw.x, pw.y, pw.z); nor.push(v.x, v.y, v.z); col.push(c.r * k, c.g * k, c.b * k);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}


export { CONTAINER_DIMS, decalGeometry };
export type { ContainerColor, ContainerPlacement, ContainerSize };
