// Terrain splat material: MeshStandardMaterial (keeps three's lights, shadows, IBL, fog, tone mapping) with
// onBeforeCompile injecting a 12-layer array-texture splat:
//   • per-pixel geometric normal from a 2 m data texture (coarse LODs shade like fine ones)
//   • HEIGHT-BASED blending (each layer's height map decides who wins at a boundary: pebbles poke through grass,
//     sand fills the gaps between rocks) instead of soft cross-fades
//   • anti-tiling: noise-warped UVs + a 4.7× larger second sample blended in with distance, macro colour variation
//   • triplanar rock/cliff/basalt on slopes; farm rows follow the plantation field
//   • weights fetched through a ~0.8 m noise warp + a capped blend exponent → no glassy triangular shards at edges
//   • wet-sand band 6–10 m wide at the waterline (keyed on the baked coast distance), chocolate cinder on the cone
//     (rough, never sky-blue), lava streaks down its west gullies, glowing lava cracks in the badlands crust,
//     macro yellow-green / dark-hollow variation keyed to curvature + sun aspect, gentle baked cavity (no AO stacking)
//   • beyond ~400 m the island is shaded from a baked top-down albedo map (one fetch, no tiling at all)
import * as THREE from "three";
import { WORLD } from "../../../../shared/world/map";
import { PLANTATION_FIELD, VOLCANO } from "../../../../shared/world/terrain-gen";
import { LAYERS, LAYER_COUNT, layerIndex, type LayerArrays } from "./textures";
import { TERRAIN_INST_PARS, TERRAIN_LODV } from "./lod";

/** The six res² RGBA8 data maps are packed into TWO array textures (2 samplers instead of 6 — the lit terrain
 * material must stay under 16 texture units with atmos's shadow / cloud / sky / AO samplers added):
 *  dat layer 0 "data": r,g = normal xz (0..1), b = path coverage, a = cavity (0.5 = flat)
 *  dat layer 1 "info": r = coast distance ((d+127)/254), g = badlands, b = cone, a = lava SDF ((d + 4) / 32: signed distance
 *                      in metres to the nearest lava channel's bank, −4..28; 1 = no lava nearby)
 *  dat layer 2 "path": r = signed lateral offset from the nearest dirt-path centreline (128 + 20·m), g = its half-width
 *                      (40·m), b = single-layer flag (20·(layer + 1)), a = POI-ground ring weight
 *  dat layer 3 "skin": r = push-back weight of the terrain's steep face behind a sculpted cliff skin (cliffskin.ts)
 *  w   layers 0..2   : the 12 splat weights (4 per layer) */
export interface TerrainGpuData {
  dat: THREE.DataArrayTexture;
  w: THREE.DataArrayTexture;
  res: number;
}

/** tileable 256² value-noise texture shared by the terrain + rock shaders (one fetch instead of 4–12 hashes):
 * r, g = value noise 8 cells / tile (two seeds), b = 32 cells / tile, a = 3-octave fbm (8/16/32 cells, 0.5/0.25/0.125).
 * nT(p * f / 8).r ≈ vnoise(p * f), nT(p * f / 8).a ≈ fbm3(p * f). */
let noiseTex: THREE.DataTexture | null = null;
export function terrainNoiseTexture(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const S = 256, data = new Uint8Array(S * S * 4);
  const hash = (i: number, j: number, s: number) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (x: number, y: number, cells: number, seed: number) => {
    const fx = x * cells, fy = y * cells, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), w = (a: number) => ((a % cells) + cells) % cells;
    const a = hash(w(i), w(j), seed), b = hash(w(i + 1), w(j), seed), c = hash(w(i), w(j + 1), seed), d = hash(w(i + 1), w(j + 1), seed);
    return (a + (b - a) * su) + ((c + (d - c) * su) - (a + (b - a) * su)) * sv;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, k = (y * S + x) * 4;
    data[k] = vn(u, v, 8, 1) * 255; data[k + 1] = vn(u, v, 8, 2) * 255; data[k + 2] = vn(u, v, 32, 3) * 255;
    data[k + 3] = (0.5 * vn(u, v, 8, 4) + 0.25 * vn(u, v, 16, 5) + 0.125 * vn(u, v, 32, 6)) * 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true; t.name = "terrain-noise";
  return (noiseTex = t);
}

/** tileable 512² cellular (Voronoi) texture, 24 cells per tile: r = (F2 − F1) × 2 (distance to the nearest cell edge,
 * cell units, clamped 0..1), g = the nearest cell's id — the badlands crust plates read this instead of evaluating
 * Voronoi per pixel (2 fetches instead of ~54 hashes). */
let cellTex: THREE.DataTexture | null = null;
export function terrainCellTexture(): THREE.DataTexture {
  if (cellTex) return cellTex;
  const S = 512, C = 24, data = new Uint8Array(S * S * 4);
  const hash = (i: number, j: number, s: number) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const w = (a: number) => ((a % C) + C) % C;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x / S * C, fy = y / S * C, ci = Math.floor(fx), cj = Math.floor(fy);
    let d1 = 9, d2 = 9, id = 0;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
      const i = ci + a, j = cj + b, px = i + 0.1 + 0.8 * hash(w(i), w(j), 1), py = j + 0.1 + 0.8 * hash(w(i), w(j), 2);
      const d = Math.hypot(px - fx, py - fy);
      if (d < d1) { d2 = d1; d1 = d; id = hash(w(i), w(j), 3); } else if (d < d2) d2 = d;
    }
    const k = (y * S + x) * 4;
    data[k] = Math.min(255, Math.round((d2 - d1) * 2 * 255)); data[k + 1] = Math.round(id * 255); data[k + 2] = 0; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true; t.name = "terrain-cells";
  return (cellTex = t);
}

/** GLSL helpers shared by the terrain and the rock material */
export const GLSL_COMMON = /* glsl */`
uniform sampler2D tNoise;
vec4 nT(vec2 p) { return texture(tNoise, p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float fbm3(vec2 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03 + 1.7) * 0.25 + vnoise(p * 4.11 + 3.1) * 0.125; }
// 2D simplex noise (Ashima / Gustavson, MIT) — smooth contours for the lava channels (value noise kinks)
vec3 krPerm(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);
  vec3 p = krPerm(krPerm(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0); m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
// cellular noise: x = F1, y = F2 − F1 (≈ distance to the cell edge), z = cell id hash
vec3 krVoronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vec2(hash12(n + g), hash12(n + g + 17.31)) * 0.8 + 0.1;
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(n + g + 3.7); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
vec3 satAdjust(vec3 c, float s) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return mix(vec3(l), c, 1.0 + s); }
// layered strata tint along world Y (sandstone look): lighter weathered band tops, darker seams
float strata(vec3 p) { float ph = p.y * 0.42 + nT(p.xz * 0.00625).a * 1.6; float f = fract(ph); return 0.86 + 0.18 * smoothstep(0.0, 0.25, f) - 0.14 * smoothstep(0.82, 1.0, f); }
`;

export function makeTerrainMaterial(arrays: LayerArrays, gpu: TerrainGpuData) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const tint = LAYERS.map((l) => new THREE.Vector3(...l.tint));
  const params = LAYERS.map((l) => new THREE.Vector4(l.tile, l.sat, l.rough, l.nrm));
  // per layer: x = second anti-tiling sample on/off, y = detail-normal / full-triplanar distance (m) — dark
  // low-contrast layers (cinder, lava crust, mud, reef, basalt) skip the anti-tiling fetch and fetch normals nearer
  const ND: Record<string, number> = { cinder: 32, lava: 45, mud: 45, reef: 45, basalt: 60 };
  const params2 = LAYERS.map((l) => new THREE.Vector4(ND[l.id] ? 0 : 1, ND[l.id] ?? 130, 0, 0));
  const uniforms = {
    tAlb: { value: arrays.albedo }, tNrm: { value: arrays.normal },
    tDat: { value: gpu.dat }, tW: { value: gpu.w },
    uGrid: { value: new THREE.Vector4(WORLD.HALF, WORLD.CELL, gpu.res, 0) },
    uTint: { value: tint }, uParams: { value: params }, uParams2: { value: params2 },
    uFarmRot: { value: new THREE.Vector2(Math.cos(PLANTATION_FIELD.yaw), Math.sin(PLANTATION_FIELD.yaw)) },
    uFarmC: { value: new THREE.Vector2(PLANTATION_FIELD.x, PLANTATION_FIELD.z) },
    uTime: { value: 0 },
    tNoise: { value: terrainNoiseTexture() },
    tCell: { value: terrainCellTexture() },
    /** 1 while baking the top-down albedo map (output albedo, no lighting) */
    uBakeMode: { value: 0 },
    /** far albedo map (baked); sampled beyond uFarD.x, fully by uFarD.y metres */
    tFar: { value: null as THREE.Texture | null },
    uFarD: { value: new THREE.Vector2(420, 520) },
    /** look controls (tuned against the target art) */
    uLook: { value: new THREE.Vector4(1.0, 0.24, 0.7, 2.8) }, // x: macro variation, y: cavity strength, z: wet darkening, w: height-blend sharpness (≤ 3)
    uVolc: { value: new THREE.Vector2(VOLCANO.x, VOLCANO.z) },
    /** unit vector toward the sun (atmos's ctx.shared "sunDir", copied every frame by index.ts) */
    uSunDir: { value: new THREE.Vector3(-0.39, 0.67, -0.63) },
    /** perf probes: 1 = skip x crust, y cone scree, z lava, w splat layers */
    uKill: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const L = (id: string) => layerIndex(id);
  const terrainHook = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = { ...(shader.defines || {}), KR_TERRAIN: 1, NLAYERS: LAYER_COUNT, ...(TERRAIN_LODV ? { KR_LODV: 1 } : {}) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", /* glsl */`#include <common>
        uniform highp sampler2DArray tDat; uniform vec4 uGrid; varying vec3 vTPos;
        ${TERRAIN_INST_PARS}
        vec2 gridUV(vec2 xz) { return ((xz + uGrid.x) / uGrid.y + 0.5) / uGrid.z; }`)
      .replace("#include <beginnormal_vertex>", /* glsl */`
        // instanced LOD node: the unit grid vertex → world position + exact height (lod.ts)
        vec3 krP = krGridPos(position);
        vec4 dd = texture(tDat, vec3(gridUV(krP.xz), 0.0));
        float nx = dd.r * 2.0 - 1.0, nz = dd.g * 2.0 - 1.0;
        vec3 objectNormal = vec3(nx, sqrt(max(0.0, 1.0 - nx * nx - nz * nz)), nz);`)
      .replace("#include <begin_vertex>", /* glsl */`vec3 transformed = krP;
        vTPos = krP;
        // behind a sculpted cliff skin the ground's own steep face steps back 2.2 m (render only — collision
        // is the unpushed heightfield; the skin stands within ±0.8 m of it)
        { float sk = texture(tDat, vec3(gridUV(krP.xz), 3.0)).r;
          if (sk > 0.004) transformed.xz -= vec2(nx, nz) / max(0.35, length(vec2(nx, nz))) * 2.2 * sk * smoothstep(0.35, 0.75, length(vec2(nx, nz))); }`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", /* glsl */`#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray tAlb; uniform sampler2DArray tNrm;
        uniform sampler2DArray tDat; uniform sampler2DArray tW;
        uniform vec4 uGrid; uniform vec3 uTint[NLAYERS]; uniform vec4 uParams[NLAYERS]; uniform vec4 uParams2[NLAYERS]; uniform vec2 uFarmRot; uniform vec2 uFarmC;
        uniform float uTime; uniform float uBakeMode; uniform sampler2D tFar; uniform vec2 uFarD; uniform vec4 uLook; uniform vec2 uVolc; uniform vec3 uSunDir; uniform sampler2D tCell; uniform vec4 uKill;
        varying vec3 vTPos;
        vec2 gridUV(vec2 xz) { return ((xz + uGrid.x) / uGrid.y + 0.5) / uGrid.z; }
        ${GLSL_COMMON}
        // detail-normal weight at camera distance camD for a detail distance D: KR_LODV fades it
        // out over D … 1.3 D (a hard 0/1 switch draws a shimmering line that swept over the ground; fading
        // beyond D, not before it, keeps every bit of the near detail)
        #ifdef KR_LODV
        #define KR_NW(D) clamp((1.3 * (D) - camD) / (0.3 * (D)), 0.0, 1.0)
        #else
        #define KR_NW(D) ((camD < (D)) ? 1.0 : 0.0)
        #endif
        float krFwY = 0.0;
        vec3 krAlbedo; float krRough; vec3 krWN; vec3 krEmis; float krCrack;
        vec3 krNg = vec3(0.0, 1.0, 0.0);   // the TRUE facet normal (screen derivatives) — triplanar weights on walls
        // world-xz gradient of a scalar field from screen-space derivatives (per 2×2 quad; for bevel normals)
        vec2 krWorldGrad(float f, vec2 xz) {
          vec2 dx = dFdx(xz), dy = dFdy(xz); float det = dx.x * dy.y - dx.y * dy.x;
          if (abs(det) < 1e-8) return vec2(0.0);
          vec2 df = vec2(dFdx(f), dFdy(f));
          return vec2(dy.y * df.x - dx.y * df.y, -dy.x * df.x + dx.x * df.y) / det;
        }
        // one layer: albedo (a = height), world-space detail normal (a = roughness). tri: triplanar on slopes.
        void krSample(int li, vec3 p, vec3 N, vec2 warp, float dmix, float nw, out vec4 alb, out vec3 nrm, out float rough) {
          bool nearF = nw > 0.001;
          float tile = uParams[li].x; float layer = float(li);
          vec2 uv = p.xz / tile;
          bool farm = li == ${L("farm")};
          // farm furrows follow the plantation's planted rows (ridge centres on the plant lines, no anti-tiling warp)
          if (farm) { vec2 q = p.xz - uFarmC; uv = vec2(dot(q, uFarmRot) / tile + 0.0625, dot(q, vec2(-uFarmRot.y, uFarmRot.x)) / tile); warp = vec2(0.0); dmix = 0.0; }
          // EVERY layer goes triplanar past ~37° — a
          // top-down projection of grass / path / cinder on a 45–70° bank stretched 1.4–3× down the fall line
          bool tri = !farm && (((li == ${L("cliff")} || li == ${L("rock")} || li == ${L("basalt")}) && N.y < 0.9) || min(N.y, krNg.y) < 0.8);
          if (tri) {
            // (far does not snap to ONE projection — a snap drew hard-edged patches where a slope turned past
            // 45°; a softer blend (power 4) usually needs 2 fetches, normals stay skipped beyond the detail distance)
            vec3 NP = N.y < 0.8 ? krNg : N;   // project steep ground by its real facet
            vec3 tw = pow(abs(NP), vec3(mix(4.0, 8.0, nw))); tw /= (tw.x + tw.y + tw.z);
            vec2 ux = vec2(p.z, -p.y) / tile, uz = vec2(p.x, -p.y) / tile;
            alb = vec4(0.0); vec4 nx4 = vec4(0.5, 0.5, 1.0, 0.9), ny4 = nx4, nz4 = nx4;
            // (axes whose weight is negligible are not fetched)
            if (tw.x > 0.02) { alb += texture(tAlb, vec3(ux, layer)) * tw.x; if (nearF) nx4 = texture(tNrm, vec3(ux, layer)); }
            if (tw.y > 0.02) { alb += texture(tAlb, vec3(uv, layer)) * tw.y; if (nearF) ny4 = texture(tNrm, vec3(uv, layer)); }
            if (tw.z > 0.02) { alb += texture(tAlb, vec3(uz, layer)) * tw.z; if (nearF) nz4 = texture(tNrm, vec3(uz, layer)); }
            alb /= max(1e-3, (tw.x > 0.02 ? tw.x : 0.0) + (tw.y > 0.02 ? tw.y : 0.0) + (tw.z > 0.02 ? tw.z : 0.0));
            // anti-tiling on rock walls too: a 4.7× larger, offset sample on the dominant projection blended in
            // with distance (without it the walls show one small crocodile-crack tile repeating)
            if (dmix > 0.01) {
              vec2 du = tw.x > tw.y && tw.x > tw.z ? ux : tw.z > tw.y ? uz : uv;
              alb = mix(alb, texture(tAlb, vec3(du * 0.213 + vec2(0.37, 0.61), layer)), dmix * 0.75);
            }
            // the detail normal fades out over D … 1.3 D (no hard line)
            nx4 = mix(vec4(0.5, 0.5, 1.0, 0.9), nx4, nw); ny4 = mix(vec4(0.5, 0.5, 1.0, 0.9), ny4, nw); nz4 = mix(vec4(0.5, 0.5, 1.0, 0.9), nz4, nw);
            vec3 nx = nx4.xyz * 2.0 - 1.0, ny = ny4.xyz * 2.0 - 1.0, nz = nz4.xyz * 2.0 - 1.0;
            vec3 wx = vec3(nx.z * sign(NP.x), nx.y, nx.x), wy = vec3(ny.x, ny.z, -ny.y), wz = vec3(nz.x, nz.y, nz.z * sign(NP.z));
            nrm = normalize(wx * tw.x + wy * tw.y + wz * tw.z);
            rough = nx4.a * tw.x + ny4.a * tw.y + nz4.a * tw.z;
            #ifdef KR_LODV
            // Toksvig: a minified normal map's averaged (shortened) normal → its variance goes into the roughness
            { float tl = clamp(length(nx * tw.x + ny * tw.y + nz * tw.z), 0.05, 1.0); rough = sqrt(sqrt(rough * rough * rough * rough + min((1.0 - tl) / tl, 0.5))); }
            #endif
          } else {
            vec2 u1 = uv + warp;
            alb = texture(tAlb, vec3(u1, layer));
            // second, much larger sample breaks the repetition at mid distance
            if (dmix > 0.01) alb = mix(alb, texture(tAlb, vec3(u1 * 0.213 + vec2(0.37, 0.61), layer)), dmix);
            vec4 n4 = nearF ? mix(vec4(0.5, 0.5, 1.0, 0.92), texture(tNrm, vec3(u1, layer)), nw) : vec4(0.5, 0.5, 1.0, 0.92);
            vec3 tn = n4.xyz * 2.0 - 1.0;
            #ifdef KR_LODV
            { float tl = clamp(length(tn), 0.05, 1.0); n4.a = sqrt(sqrt(n4.a * n4.a * n4.a * n4.a + min((1.0 - tl) / tl, 0.5))); }
            #endif
            vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x), B = cross(T, N);
            nrm = normalize(T * tn.x - B * tn.y + N * tn.z);
            rough = n4.a;
          }
        }`)
      .replace("#include <map_fragment>", /* glsl */`
        {
          vec3 p = vTPos;
          vec2 guv = gridUV(p.xz);
          vec4 dd = texture(tDat, vec3(guv, 0.0)), inf = texture(tDat, vec3(guv, 1.0));
          float nx = dd.r * 2.0 - 1.0, nz = dd.g * 2.0 - 1.0;
          vec3 N = normalize(vec3(nx, sqrt(max(0.0, 1.0 - nx * nx - nz * nz)), nz));
          // splat weights through a ~0.8 m noise warp: breaks the 2 m bilinear diamonds into organic edges.
          // (perf) single-layer areas (path.b flag, ±4 m of one layer) skip the warp + 3 weight fetches
          vec4 w0 = vec4(0.0), w1 = vec4(0.0), w2 = vec4(0.0);
          #ifndef KR_FAR
          float sgl = texelFetch(tDat, ivec3(ivec2((p.xz + uGrid.x) / uGrid.y + 0.5), 2), 0).b * 255.0 / 20.0 - 1.0;
          if (sgl > -0.5 && uBakeMode < 0.5) {
            float li = floor(sgl + 0.5);
            w0 = vec4(equal(vec4(li), vec4(0.0, 1.0, 2.0, 3.0))); w1 = vec4(equal(vec4(li), vec4(4.0, 5.0, 6.0, 7.0))); w2 = vec4(equal(vec4(li), vec4(8.0, 9.0, 10.0, 11.0)));
          } else {
            vec4 nw = nT(p.xz * 0.04625);
            vec2 wj = (nw.rg - 0.5) * 1.7 + (nw.ba - 0.5) * 0.7;
            vec2 wuv = gridUV(p.xz + wj);
            w0 = texture(tW, vec3(wuv, 0.0)); w1 = texture(tW, vec3(wuv, 1.0)); w2 = texture(tW, vec3(wuv, 2.0));
          }
          #endif
          float camD = uBakeMode > 0.5 ? 0.0 : distance(cameraPosition, p);
          float cavity = dd.a * 2.0 - 1.0;
          float coastD = inf.r * 254.0 - 127.0, bad = inf.g, cone = inf.b;
          float lsd = inf.a * 32.0 - 4.0;   // signed distance (m) to the nearest lava river's bank
          vec3 col = vec3(0.0), nn = N; float rough = 0.95;
          krEmis = vec3(0.0); krCrack = 0.0;
          // screen-space derivatives of the world position, taken in uniform control flow (the cone streaks + crust fetch
          // with explicit gradients inside branches)
          vec2 dpx = dFdx(p.xz), dpy = dFdy(p.xz);
          krFwY = fwidth(p.y);
          // the facet normal: the 2 m data normal is smooth, so on a pleated 60–90° wall its projection axis
          // disagreed with the real triangle and the texture streaked down the face — steep ground projects by the facet
          { vec3 fx = dFdx(p), fy = dFdy(p); vec3 ng = cross(fx, fy); float lg = length(ng);
            krNg = lg > 1e-8 ? ng / lg : N; if (krNg.y < 0.0) krNg = -krNg;
            if (N.y > 0.85) krNg = N; }   // (flat ground: the smooth normal — no derivative noise)
          // (slide faces read as rock cliffs, not tan dirt / leaf litter) past ~52° every layer yields to
          // the wall's rock — tan bedded sandstone on the coast, basalt in the lava field and on the cone, grey granite inland
          { float sk = smoothstep(0.66, 0.5, min(N.y, krNg.y)) * (1.0 - step(0.5, uBakeMode));
            if (sk > 0.001) {
              w0 *= 1.0 - sk; w1 *= 1.0 - sk; w2 *= 1.0 - sk;
              float cl = coastD < 90.0 ? sk * 0.75 : 0.0, ba = (bad > 0.3 || cone > 0.3) ? sk * 0.8 : 0.0, ro = sk - cl - ba;
              ${["cliff", "basalt", "rock"].map((id) => { const i = L(id); const v = id === "cliff" ? "cl" : id === "basalt" ? "ba" : "ro"; return `w${i >> 2}.${"rgba"[i & 3]} += ${v};`; }).join(" ")}
            } }
          // (no screen-door grids, moiré contour rings or foil speculars) the cone's relief lives in the HEIGHTFIELD
          // (terrain-gen coneRill / coneGully — the 2 m normal texture shades it at every distance), not in a
          // per-2×2-quad derivative bump. Polar frame for the fall-line scree streaks: seam on the EAST
          // face (never seen from the lava field), analytic gradients so the mips never break at the seam
          float cVr = 0.0, cA1 = 0.0; vec2 cGrad = vec2(0.0), cDir = vec2(0.0);
          if (cone > 0.01 && uKill.y < 0.5) {
            vec2 dv = p.xz - uVolc; cVr = max(length(dv), 1.0);
            cA1 = atan(-dv.y, -dv.x) * 0.15915494;
            cGrad = vec2(-dv.y, dv.x) / (cVr * cVr) * 0.15915494; cDir = dv / cVr;
          }
          // (perf: a cheap lit path beyond 150 m) in the lava field + on the cone the full splat stops at
          // ~150 m (one black layer — the baked far albedo carries it exactly; the crust is only drawn within ~110 m)
          // (smooth — a step drew a hard stair-stepped seam round the cone foot)
          float volcK = max(smoothstep(0.25, 0.45, bad), smoothstep(0.25, 0.75, cone));
          vec2 farD = mix(uFarD, vec2(95.0, 130.0), volcK);
          #ifndef KR_FAR
          if (camD < farD.y && uKill.w < 0.5) {
            // (perf) the macro field only where a green layer is drawn (it tints grass / jungle; the black lava field
            // and the sand skip the fetch)
            vec4 mc = w0.g + w0.b > 0.01 ? nT(p.xz * (1.0 / 1520.0)) : vec4(0.5);
            float macro = mc.a, macro2 = mc.b;
            vec2 warp = (nT(p.xz * 0.005625 + 0.21).gr - 0.5) * 0.9;
            // (no second anti-tiling fetch within ~12 m, no detail-normal fetch beyond 130 m: fewer fetches per layer)
            // (the second, larger anti-tiling sample only between 12 and ~220 m: beyond it the far albedo blend takes over)
            float dmix = uBakeMode > 0.5 ? 0.35 : clamp((camD - 12.0) / 110.0, 0.0, 0.62) * (1.0 - smoothstep(140.0, 175.0, camD));
            float nearW = KR_NW(130.0);
            nn = vec3(0.0); rough = 0.0; float wsum = 0.0;
            // the cone's albedo is replaced by the scree pass below: sample only its cinder layer there (normals + grain)
            if (cone > 0.95) { w0 = vec4(0.0); w1 = vec4(0.0, 0.0, 1.0, 0.0); w2 = vec4(0.0); }
            // (perf) every layer is its own unrolled uniform branch, skipped below a 0.035 weight. Per layer: uParams2.x = second
            // anti-tiling sample (0/1), .y = detail-normal / full-triplanar distance (m).
            // (measured on an M5-class GPU: a top-3 dynamic loop shows no clear win; a full dynamic loop measured with
            // GPU timer queries takes 0.70 ms vs 0.45 ms unrolled at biome-04 — the unrolled uniform branches stay)
            #define KR_LAYER(I, W) if (W > 0.035) { vec4 a; vec3 dn; float r; krSample(I, p, N, warp, uParams2[I].x * dmix, KR_NW(uParams2[I].y), a, dn, r); \
              float f = W * pow(clamp(a.a * 0.6 + W * 1.25, 0.02, 2.0), min(uLook.w, 3.0)); \
              vec3 c = satAdjust(a.rgb, uParams[I].y) * uTint[I]; \
              if (I == ${L("cliff")}) c *= strata(p); \
              if (I == ${L("rock")} || I == ${L("cliff")}) { float mv = nT(p.xz * 0.0021 + p.y * 0.0031).a; c *= (0.78 + 0.44 * mv) * mix(vec3(1.0), vec3(1.06, 1.0, 0.9), smoothstep(0.55, 0.8, nT(p.xz * 0.0071 - p.y * 0.006 + 0.3).r)); } \
              col += c * f; rough += r * uParams[I].z * f; nn += mix(N, dn, uParams[I].w) * f; wsum += f; }
            // (perf) pure black-cinder pixels (the lava field, the cone): one lean sample instead of the 12-layer block
            if (w1.b > 0.995) {
              vec4 a; vec3 dn; float r; krSample(${L("cinder")}, p, N, warp, 0.0, KR_NW(uParams2[${L("cinder")}].y), a, dn, r);
              col = satAdjust(a.rgb, uParams[${L("cinder")}].y) * uTint[${L("cinder")}]; rough = r * uParams[${L("cinder")}].z; nn = mix(N, dn, uParams[${L("cinder")}].w); wsum = 1.0;
            } else {
            KR_LAYER(0, w0.r) KR_LAYER(1, w0.g) KR_LAYER(2, w0.b) KR_LAYER(3, w0.a) KR_LAYER(4, w1.r) KR_LAYER(5, w1.g)
            KR_LAYER(6, w1.b) KR_LAYER(7, w1.a) KR_LAYER(8, w2.r) KR_LAYER(9, w2.g) KR_LAYER(10, w2.b) KR_LAYER(11, w2.a)
            }
            float inv = 1.0 / max(wsum, 1e-5);
            col *= inv; rough *= inv; nn = normalize(nn);
            // THE PLANTATION: crop rows along the planted lines (3.7 m apart, ~60 % leafy green / 40 % soil, leaf clumps at
            // the 2.9 m plant spacing, alternate rows offset half a plant). Full strength from ~130 m and in the far bake
            // (the aerial reads green rows, not a brown field); near the ground it thins to low green cover between the
            // POI's own banana plants.
            if (w1.a > 0.01) {
              vec2 fq = p.xz - uFarmC;
              float lat = dot(fq, uFarmRot) / 3.7;
              float row = floor(lat + 0.5);
              float alongC = dot(fq, vec2(-uFarmRot.y, uFarmRot.x)) / 2.9 + mod(row, 2.0) * 0.5;
              float ph = abs(fract(lat + 0.5) - 0.5), clump = abs(fract(alongC + 0.5) - 0.5);
              // (in the far bake the leaf canopy covers ~80 % of each row — from the air the field reads as green crop
              // rows, not khaki soil)
              float lw = uBakeMode > 0.5 ? 0.4 : 0.29;
              float leaf = 1.0 - smoothstep(lw - 0.04, lw + 0.04, ph + 0.1 * smoothstep(0.15, 0.5, clump) + (nT(p.xz * 0.31).r - 0.5) * 0.08);
              float farK = uBakeMode > 0.5 ? 1.0 : smoothstep(40.0, 130.0, camD);
              vec3 cropC = vec3(0.1, 0.24, 0.045) * (0.75 + 0.5 * nT(p.xz * 0.23 + 0.5).a) * (0.85 + 0.3 * smoothstep(0.3, 0.0, clump));
              if (uBakeMode > 0.5) {
                // from the air every plant is a round banana CROWN
                // (r ≈ 1.5 m) lit on its sun side, yellow-green highlights, dark leaf shadow on the far side, dark soil /
                // shade in the furrows — the target art's plantation reads as rows of plant crowns, not a lawn with
                // lines (clumps of 2 × 2 plants: the far map's 1.2 m texels and the aerial's 1.5 m pixels resolve them)
                float lat2 = lat * 0.5, row2 = floor(lat2 + 0.5), al2 = dot(fq, vec2(-uFarmRot.y, uFarmRot.x)) / 5.8 + mod(row2, 2.0) * 0.5;
                vec2 cq = vec2(fract(lat2 + 0.5) - 0.5, fract(al2 + 0.5) - 0.5) * vec2(7.4, 5.8);
                float cr = length(cq * vec2(0.85, 1.0)) + (nT(p.xz * 0.45 + row2 * 0.37).r - 0.5) * 1.2;
                float crown = 1.0 - smoothstep(2.4, 3.3, cr);
                float lit = clamp(0.5 + 0.5 * dot(normalize(cq + 1e-3), normalize(vec2(-0.55, -0.8))) * smoothstep(0.3, 2.6, length(cq)), 0.0, 1.0);
                vec3 crownC = mix(vec3(0.045, 0.1, 0.018), vec3(0.2, 0.34, 0.05), lit) * (0.8 + 0.4 * nT(p.xz * 0.05 + row * 0.11).a);
                crownC = mix(crownC, vec3(0.3, 0.42, 0.07), smoothstep(0.82, 0.95, lit) * 0.5);   // glossy leaf highlights
                cropC = mix(vec3(0.035, 0.03, 0.012), crownC, crown) * (0.8 + 0.35 * nT(p.xz * 0.012 + 0.3).a);
                leaf = 1.0;
              }
              col = mix(col, cropC, leaf * w1.a * mix(0.3, 1.0, farK));
              // soil clods + furrow crumbs near the eye (the 29.6 m farm tile alone smears at ground level)
              if (camD < 60.0) {
                float cl2 = nT(p.xz * 0.34 + 0.11).b, cl3 = nT(p.xz * 1.3).b;
                float soil = w1.a * (1.0 - leaf) * smoothstep(60.0, 12.0, camD);
                col *= mix(1.0, (0.78 + 0.34 * cl2) * (0.88 + 0.24 * smoothstep(0.55, 0.75, cl3)), soil);
                nn = normalize(nn + vec3(cl3 - 0.5, 0.0, cl2 - 0.5) * 0.25 * soil);
              }
              rough = mix(rough, 0.8, leaf * w1.a);
            }
            float lk = uLook.x;
            // macro colour: sun-dried yellow-green on convex, sun-facing (south / west) ground and the high macro noise,
            // deeper cool green in hollows and on shaded north slopes
            float green = w0.g + w0.b;
            float aspect = dot(normalize(vec2(N.x, N.z) + 1e-4), normalize(vec2(-0.45, 0.9))) * smoothstep(0.02, 0.25, length(N.xz));
            // (capped: sun-dried patches stay YELLOW-GREEN (~(170,165,65)), never mustard / ochre)
            float dry = clamp(smoothstep(0.35, 0.75, macro) * 0.55 + 0.2 * smoothstep(0.05, -0.5, cavity) + 0.15 * aspect, 0.0, 0.6);
            float hollow = smoothstep(0.1, 0.6, cavity) * 0.7 + 0.3 * smoothstep(0.1, -0.6, aspect);
            vec3 macroTint = mix(vec3(0.92, 0.98, 0.9), vec3(1.12, 1.04, 0.9), dry) * mix(vec3(1.0), vec3(0.84, 0.94, 0.92), hollow);
            col *= mix(vec3(1.0), macroTint, green * lk);
            col *= 1.0 + (macro2 - 0.5) * 0.2 * lk;
            // (no flat mown lawn at eye level) 8–25 m patches of sun-dried straw and of
            // darker lush clover in the meadow grass, + a fine ±8 % tuft-scale fleck — never one uniform lawn tone
            if (w0.g > 0.05 && camD < 220.0 && uBakeMode < 0.5) {
              vec4 gv = nT(p.xz * 0.0125 + 0.37);
              float dryP = smoothstep(0.56, 0.7, gv.a + 0.1 * (macro - 0.5)) * w0.g;
              float lush = smoothstep(0.6, 0.74, gv.r) * w0.g * (1.0 - dryP);
              col = mix(col, col * vec3(1.25, 1.08, 0.66), dryP * 0.55);
              col = mix(col, col * vec3(0.74, 0.9, 0.82), lush * 0.5);
              col *= 1.0 + (gv.b - 0.5) * 0.16 * w0.g * (1.0 - smoothstep(60.0, 160.0, camD));
            }
            // from the air the jungle floor IS canopy (veg covers it): the far bake paints it a deep, mottled
            // canopy green, so canopy gaps and the terrain-only aerial read as forest (the target art's (79,97,47)),
            // not as olive-brown litter against lime meadows
            if (uBakeMode > 0.5) {
              vec3 canopy = vec3(0.046, 0.078, 0.02) * (0.7 + 0.6 * macro) * (0.85 + 0.3 * macro2);
              col = mix(col, canopy, w0.b * 0.85);
              // meadows + POI-ground rings from the air: clumps of shrubs / copse crowns over the grass (the far bake is
              // only ever seen from > 280 m) — denser in the POI rings, so a POI clearing's mean colour sits within ~10 %
              // of the jungle around it instead of reading as a pale-lime disc
              float ringW = texture(tDat, vec3(guv, 2.0)).a;
              float clumps = smoothstep(0.42, 0.62, nT(p.xz * 0.037 + 1.3).a + 0.12 * (nT(p.xz * 0.11).b - 0.5));
              col = mix(col, canopy * 1.15, w0.g * clamp(clumps * (0.45 + 0.5 * ringW) + 0.25 * ringW, 0.0, 0.85));
              col *= 1.0 - 0.14 * w0.g;
            }
            // beach: sun-bleached dry sand up top, a 6–10 m darker glossy wet band at the waterline, damp just below it
            float sand = w0.r;
            if (sand > 0.01) {
              float wetD = coastD + (nT(p.xz * 0.01 + 0.5).r - 0.5) * 3.0;
              // (a static 0-8.5 m × 0.7 band here, under the water's
              // own swash film doubled the darkening into a 5-12 m grey-brown strip. The WET sand is the water's
              // time-varying swash film (water/shader.ts wtrWetK: covered sand darkens, dries over ~9 s); the terrain keeps
              // only a faint damp tint over the first ~1-3 m)
              float wet = (1.0 - smoothstep(0.5, 2.5, wetD)) * smoothstep(-6.0, -0.5, wetD) * sand;
              col = mix(col, col * vec3(0.9, 0.89, 0.87), wet); rough = mix(rough, 0.45, wet * 0.6);
              col *= 1.0 + 0.07 * smoothstep(10.0, 22.0, coastD) * sand;
            }
            // the cone: FALL-LINE FLUTING — sharp rock ribs 2–6 m apart running straight down the flank (seamless
            // polar noise, see cFl above) with blue-black basalt on the rib crests + the big convex ridges, warm
            // grey-brown scree streaming down the flutes and the big heightfield gullies, an oxidised brown lip +
            // pale ash toward the crater. No closed cells anywhere.
            if (cone > 0.01 && uKill.y < 0.5) {
              // cinder SCREE
              // streaming down the rills (fall-line streaks, band-limited through explicit gradients — no aliasing at any
              // angle), dark jointed BASALT on the rib crests (a real triplanar rock texture, 4 m, blend sharpness 6), pale
              // weathered crest edges, dark damp rill floors; slate-cool, matte (roughness ≥ 0.62: no foil speculars)
              float lum = clamp(dot(col, vec3(0.3, 0.5, 0.2)) / 0.011, 0.5, 1.6);        // the cinder layer's grain (pebbles)
              vec2 gX = vec2(dot(cGrad, dpx), dot(cDir, dpx)), gY = vec2(dot(cGrad, dpy), dot(cDir, dpy));
              vec2 k1 = vec2(46.0, 1.0 / 70.0), k2 = vec2(150.0, 1.0 / 24.0);
              float st1 = textureGrad(tNoise, vec2(cA1, cVr) * k1 + vec2(0.2, 0.0), gX * k1, gY * k1).r;
              float st2 = textureGrad(tNoise, vec2(cA1, cVr) * k2 + vec2(0.7, 0.3), gX * k2, gY * k2).r;
              float streak = 0.62 * st1 + 0.38 * st2;
              float ridge = smoothstep(0.0, -0.3, cavity), gully = smoothstep(0.04, 0.4, cavity);
              // rock bands: the crests + a wandering fraction of the flank (outcropping lava-flow rock)
              float band = smoothstep(0.52, 0.68, nT(vec2(cA1 * 9.0, cVr / 140.0) + 0.37).a + 0.2 * ridge);
              float rockK = clamp(max(ridge * 0.9, band * 0.75), 0.0, 1.0);
              vec3 scree = vec3(0.044, 0.054, 0.092) * (0.55 + 0.9 * streak * streak) * (0.82 + 0.18 * lum);
              vec3 rockC = vec3(0.038, 0.045, 0.074);
              vec3 rn = N; float rr = 0.78;
              if (camD < 110.0 || uBakeMode > 0.5) {
                // near: the basalt layer as a proper triplanar (4 m tiles), its normal map at half strength
                vec4 ra; vec3 rdn; float rrr;
                krSample(${L("basalt")}, p * 1.4, N, vec2(0.0), 0.0, KR_NW(60.0), ra, rdn, rrr);
                float rl = dot(ra.rgb, vec3(0.3, 0.5, 0.2));
                rockC *= clamp(rl / 0.03, 0.55, 1.6);
                rn = normalize(mix(N, rdn, 0.5 * (1.0 - smoothstep(60.0, 110.0, camD))));
              }
              vec3 cc = mix(scree, rockC, rockK);
              // painted relief (the sun is frontal at the biome-04 view and the aerial looks at the shaded south face):
              // dark rill floors, pale weathered crests — the ridges read at every distance and in the far albedo
              cc *= mix(1.0, 0.4, gully);
              cc *= 1.0 + 0.9 * smoothstep(-0.1, -0.45, cavity);
              float lip = smoothstep(86.0, 66.0, cVr);
              cc = mix(cc, vec3(0.09, 0.075, 0.07) * (0.8 + 0.4 * streak), lip * 0.5 * (1.0 - smoothstep(60.0, 52.0, cVr)));   // oxidised lip
              cc = mix(cc, vec3(0.12, 0.118, 0.115) * (0.8 + 0.35 * streak), smoothstep(60.0, 50.0, cVr) * 0.75);           // pale ash in the bowl
              // painted fill: shaded faces lift a little and go cool (the target art's blue-grey shade), never orange
              float ndl = dot(N, uSunDir);
              cc *= mix(1.3, 1.0, smoothstep(-0.15, 0.6, ndl)) * mix(vec3(1.0), vec3(0.95, 1.0, 1.1), smoothstep(0.5, -0.05, ndl));
              col = mix(col, cc, cone);
              rough = mix(rough, mix(0.88, 0.76, rockK), cone);
              // scree: the cinder normal only as a faint grain (it read as crumpled foil); rock: the basalt texture's relief
              nn = normalize(mix(nn, mix(normalize(mix(nn, N, 0.75)), rn, rockK), cone));
            }
            // badlands: no Voronoi plate paving. The crust
            // is a real lava-rock texture (broken slabs + rubble) laid in a FLOW frame (polar round the cone, seam on the
            // east): slabs ~1.5× longer down the flow, a second 4.3× larger fetch of the same texture splits the field into
            // 4–8 m slabs, loose cinder grit in the hollows (height blend). Its seams are DARK — they glow only near the
            // rivers and in a few residual-heat patches. No crust inside the melt.
            if (bad > 0.05 && cone < 0.5 && uKill.x < 0.5) {
              float flatK = smoothstep(0.62, 0.28, 1.0 - N.y);
              float crustN = nT(p.xz * (1.0 / 420.0) + 0.37).a;   // ~50 m patches: crust sheets vs loose cinder
              float crustW = smoothstep(0.3, 0.6, bad) * flatK * (0.55 + 0.45 * smoothstep(0.34, 0.5, crustN)) * smoothstep(-0.3, 0.9, lsd);
              if (crustW > 0.01 && camD < 105.0) {
                vec2 dvp = p.xz - uVolc; float fr = max(length(dvp), 1.0), fa = atan(-dvp.y, -dvp.x);
                vec2 fuv = vec2(fa * (300.0 / 7.0), fr / 10.5);
                vec4 n02 = nT(p.xz * 0.02);
                vec2 fw = (n02.rg - 0.5) * 0.3;
                // (the polar frame's seam is on the EAST face — never in the lava field: implicit derivatives are fine)
                vec4 cr = texture(tAlb, vec3(fuv + fw, ${L("lava")}));
                vec4 cr2 = camD < 75.0 ? texture(tAlb, vec3(fuv * 0.232 + vec2(0.31, 0.57), ${L("lava")})) : vec4(0.05, 0.05, 0.055, 0.5);
                // the texture's (orange) crack pixels → seams
                float seam = smoothstep(0.04, 0.2, cr.r - cr.b) * smoothstep(0.12, 0.4, cr.r);
                float seam2 = smoothstep(0.04, 0.2, cr2.r - cr2.b) * smoothstep(0.12, 0.4, cr2.r);
                // the hot CORE of a crack (the texture's yellow centre line) — only these glow
                float core = smoothstep(0.1, 0.3, cr.g - cr.b) * seam, core2 = smoothstep(0.1, 0.3, cr2.g - cr2.b) * seam2;
                // slab rock: the texture's charcoal, desaturated + cooled; big-slab tone steps; seams near-black
                vec3 plate = satAdjust(cr.rgb * (1.0 - seam), -0.75) * vec3(0.72, 0.75, 0.86) * (0.8 + 0.4 * n02.b) * (0.9 + 0.2 * cr2.a);
                plate = mix(plate, vec3(0.006, 0.0055, 0.006), max(seam, seam2 * 0.85));
                // height blend: slab tops over the cinder grit (the cinder fills the cracks + hollows)
                float top = smoothstep(0.3, 0.55, cr.a * 0.7 + 0.3 * (1.0 - seam2) + 0.25 * crustW - 0.2 - 0.25 * max(cavity, 0.0));
                float cw = crustW * top;
                col = mix(col, plate, cw);
                rough = mix(rough, mix(0.6, 0.9, max(seam, seam2)), cw);
                if (camD < 45.0) {
                  vec4 crn = texture(tNrm, vec3(fuv + fw, ${L("lava")}));
                  vec3 tn = crn.xyz * 2.0 - 1.0;
                  vec3 Tu = normalize(vec3(-dvp.y, 0.0, dvp.x)), Tv = vec3(dvp.x, 0.0, dvp.y) / fr;
                  vec3 cn = normalize(Tu * tn.x + Tv * tn.y + N * max(tn.z, 0.2));
                  nn = normalize(mix(nn, cn, cw * 0.75 * (1.0 - smoothstep(28.0, 45.0, camD))));
                }
                krCrack = max(seam, seam2) * cw;
                if (uBakeMode < 0.5) {
                  // heat: near the rivers (≤ ~9 m from a bank) + sparse residual-heat patches; the big-slab seams only
                  // right beside a river
                  float run = smoothstep(0.45, 0.62, n02.b);
                  float hot = clamp(smoothstep(4.0, 1.0, lsd) * (0.25 + 0.75 * run) + 0.6 * smoothstep(0.74, 0.84, n02.a) * run, 0.0, 1.0);
                  float hot2 = smoothstep(3.0, 0.8, lsd) * run;
                  float pulse = 0.82 + 0.18 * sin(uTime * 1.3 + p.x * 0.07 + p.z * 0.05);
                  krEmis += (vec3(2.0, 0.5, 0.04) * core * hot + vec3(2.6, 0.8, 0.07) * core2 * hot2) * crustW * pulse * (1.0 - smoothstep(75.0, 105.0, camD));
                }
              }
            }
            // baked cavity: gullies a little darker, ridges a little lighter — gentle, and not on paths / sand (the real
            // shadow + AO already darken them; stacking all three turned shaded paths into asphalt)
            col *= 1.0 - clamp(cavity, -1.0, 0.7) * uLook.y * (1.0 - 0.8 * (w0.a + w0.r));
            // dirt paths: a crisp tan ribbon from the UNBLURRED 2 m path mask (bilinear, thresholded at its 50 % contour,
            // edge wobble ±0.3 m), a darker lusher grass lip along both edges, a lighter worn centre line
            if (dd.b > 0.004) {
            // the ribbon from the signed centreline offset (exact under bilinear filtering): |offset| < half-width
            // with a gentle ±0.25 m edge wobble → a smooth constant-width winding road; the baked coverage mask (dd.b)
            // only gates it (water / plantation / steep-wall exclusions). pmRaw keeps the 0..1 coverage scale.
            vec2 pt = texture(tDat, vec3(guv, 2.0)).rg;
            float pHW = pt.g * 6.375, pOff = abs(pt.r * 12.75 - 6.4);
            // (not a flat, hard-edged beige strip) a BROKEN edge — two noise octaves push it ±0.8 m
            // (grass tongues into the dirt, dirt bays into the grass), soft over ~0.3 m; across the trail a worn lighter
            // centre, a darker trodden rut either side of it (two wheel ruts on roads), damp darker margins, pebbles near
            // the eye
            vec4 pn4 = nT(p.xz * 0.37 + 0.3);
            float eN = (nT(p.xz * 0.09).a - 0.5) * 1.0 + (pn4.b - 0.5) * 0.7;
            float pDist = pOff - pHW + eN;                                     // metres outside the ribbon edge (< 0 inside)
            float pmW = max(fwidth(pDist), 0.15);
            float pm = (1.0 - smoothstep(-pmW, pmW, pDist)) * smoothstep(0.35, 0.55, dd.b) * step(0.1, pHW);
            float lip = smoothstep(1.4, 0.1, pDist) * (1.0 - pm) * step(0.1, pHW);
            col = mix(col, col * vec3(0.78, 0.9, 0.7), lip * 0.5 * (w0.g + w0.b));
            if (pm > 0.003) {
              vec4 pa; vec3 pn; float pr;
              krSample(${L("path")}, p, N, warp, dmix, nearW, pa, pn, pr);
              vec3 pc = satAdjust(pa.rgb, uParams[${L("path")}].y) * uTint[${L("path")}];
              float u = pOff / max(pHW, 0.3) + (pn4.r - 0.5) * 0.18;                 // 0 centre → 1 edge
              float road = step(2.0, pHW);
              float rut = road > 0.5 ? smoothstep(0.16, 0.0, abs(u - 0.52)) : smoothstep(0.2, 0.0, abs(u - 0.42)) * 0.8;
              float worn = smoothstep(0.32, 0.0, u) * (1.0 - road * 0.5);
              pc *= (1.0 + 0.1 * worn) * (1.0 - 0.14 * rut * (0.7 + 0.6 * pn4.g)) * (1.0 - 0.12 * smoothstep(0.7, 1.0, u)) * (1.0 - 0.12 * cavity * uLook.y);
              // tufts of the verge inside the margin, patchy
              float verge = smoothstep(0.72, 1.05, u + (pn4.a - 0.5) * 0.5) * (w0.g + w0.b + 0.3);
              pc = mix(pc, col, clamp(verge, 0.0, 1.0) * 0.6);
              if (camD < 40.0) {   // pebbles / grit
                float pb = nT(p.xz * 1.9 + 0.41).b, pb2 = nT(p.xz * 3.7 - 0.2).b;
                float peb = smoothstep(0.83, 0.9, pb) * (1.0 - smoothstep(25.0, 40.0, camD));
                pc = mix(pc, pc * (0.62 + 0.7 * pb2), peb);
                nn = normalize(nn + vec3(pb2 - 0.5, 0.0, pb - 0.85) * 0.9 * peb * pm);
              }
              col = mix(col, pc, pm);
              rough = mix(rough, pr * uParams[${L("path")}].z, pm);
              nn = normalize(mix(nn, mix(N, pn, uParams[${L("path")}].w), pm * 0.8));
            }
            }
          }
          #endif
          if (camD > farD.x && uBakeMode < 0.5) {
            vec2 fuv = vec2((p.x + uGrid.x) / (2.0 * uGrid.x), 1.0 - (p.z + uGrid.x) / (2.0 * uGrid.x));
            vec3 fc = texture(tFar, fuv).rgb;
            #ifdef KR_FAR
            float t = 1.0;   // (far program: every pixel of a far node is beyond uFarD.y)
            #else
            float t = smoothstep(farD.x, farD.y, camD);
            #endif
            col = mix(col, fc, t); rough = mix(rough, 0.95, t); nn = normalize(mix(nn, N, t));
            // steep walls beyond the splat: the far albedo is a TOP-DOWN bake — a 40 m sea cliff owns one or two of
            // its texels, smeared down the whole face (a smeared brown wall). Past ~40° the wall's own rock
            // (tan bedded sandstone on the coast, grey granite inland, basalt in the lava field) is projected on the two
            // side axes instead, with the strata bands
            float stp = smoothstep(0.78, 0.62, min(N.y, krNg.y)) * (1.0 - cone);
            if (stp > 0.01 && uKill.y < 0.5) {
              int RL = coastD < 90.0 ? ${L("cliff")} : (bad > 0.3 ? ${L("basalt")} : ${L("rock")});
              float tl = uParams[RL].x * 1.6;
              vec2 sw = pow(abs(krNg.xz) + 1e-3, vec2(4.0)); sw /= max(1e-4, sw.x + sw.y);
              vec3 ra = texture(tAlb, vec3(vec2(p.z, -p.y) / tl, float(RL))).rgb * sw.x + texture(tAlb, vec3(vec2(p.x, -p.y) / tl, float(RL))).rgb * sw.y;
              vec3 rc = satAdjust(ra, uParams[RL].y - 0.25) * uTint[RL];
              // keep the bake's overall value (lighting / moss / wetness it averaged) — only the detail + banding come back
              float lf = dot(fc, vec3(0.3, 0.55, 0.15)), lr = dot(rc, vec3(0.3, 0.55, 0.15));
              rc *= clamp(lf / max(lr, 1e-3), 0.6, 1.5);
              // read as layered rock from 300 m+: 4–7 m bedding bands with dark partings, vertical fissures, a lighter
              // weathered lip (the texture's own detail is sub-pixel out there — a flat orange wall otherwise)
              { vec2 th = normalize(vec2(-krNg.z, krNg.x) + 1e-4);
                float bw = p.y / 5.5 + (nT(p.xz * 0.0042 + 0.3).a - 0.5) * 2.4, bf = fract(bw), bi = floor(bw);
                float band = 0.8 + 0.28 * fract(sin(bi * 12.9898) * 43758.5453) - 0.3 * (1.0 - smoothstep(0.0, 0.12, bf));
                #ifdef KR_LODV
                // band-limited: a 5.5 m band covering < ~2 px (far / grazing) fades to its mean instead of aliasing
                band = mix(0.92, band, clamp(1.6 - (krFwY + length(dpx) * 0.25) / 5.5 * 2.2, 0.0, 1.0));
                #endif
                float fis = nT(vec2(dot(p.xz, th) * 0.055, p.y * 0.006) + 0.17).r;
                band *= 0.78 + 0.34 * smoothstep(0.25, 0.6, fis);
                rc *= band * mix(vec3(1.0), vec3(0.92, 0.95, 1.02), 0.5); }
              col = mix(col, rc, stp * t);
            }
            // the cone beyond the splat (the biome-04 view sees it at 250–500 m, the far map's 1.2 m texels are
            // too soft there): fine fall-line streaks + the basalt texture's rock detail (top-down, 4 m — a 35–50° flank
            // stretches it < 1.6×; no triplanar seam) modulate the baked albedo — it reads as rock, not plasticine
            if (cone > 0.01 && uKill.y < 0.5) {
              vec2 gX = vec2(dot(cGrad, dpx), dot(cDir, dpx)), gY = vec2(dot(cGrad, dpy), dot(cDir, dpy));
              vec2 k2 = vec2(150.0, 1.0 / 24.0);
              float st2 = textureGrad(tNoise, vec2(cA1, cVr) * k2 + vec2(0.7, 0.3), gX * k2, gY * k2).r;
              float rl = dot(texture(tAlb, vec3(p.xz * 0.25, ${L("basalt")}.0)).rgb, vec3(0.3, 0.5, 0.2));
              col *= mix(1.0, (0.62 + 0.76 * st2) * clamp(rl / 0.028, 0.55, 1.6), t * cone);
            }
          }
          // lava rivers (at every distance): the melt (red banks → orange → yellow-white core, HDR so bloom catches it),
          // crust rafts drifting on it, the carved channel's black crusted LEVEES (the heightfield sinks the bed
          // and raises the banks — terrain-gen carveLava), the glow SPILLING onto the banks, no crust seam across the melt
          if (lsd < 6.0 && uBakeMode < 0.5 && uKill.z < 0.5) {
            float ln1 = nT(p.xz * 0.045).a, ln2 = nT(p.xz * 0.21 + 0.7).r, sw = nT(p.xz * 0.012 + 0.4).a;
            // (the cone's rivers stay thin bright streaks — the swell / pinch only out in the field)
            float onField = 1.0 - smoothstep(0.1, 0.5, cone);
            // (a gentler swell — the carved bed is only ~0.6 m wider than the melt)
            float e = lsd + ((ln1 - 0.5) * 0.7 - 0.5 * smoothstep(0.5, 0.82, sw) + 0.3 * smoothstep(0.45, 0.2, sw)) * mix(0.1, 1.0, onField) + (ln2 - 0.5) * mix(0.08, 0.3, onField);
            float aa = max(fwidth(e), 0.05);
            float inside = 1.0 - smoothstep(-aa, aa, e);
            float levee = (1.0 - smoothstep(0.0, 2.6, e)) * (1.0 - inside);
            float tt = uTime * 0.05;
            float f2 = nT(p.xz * 0.26 + vec2(-tt, tt * 0.4)).r;
            float heat = smoothstep(0.0, 0.75, -e + (f2 - 0.5) * 0.45);
            vec3 melt = mix(vec3(0.9, 0.07, 0.004), vec3(2.6, 0.62, 0.03), smoothstep(0.0, 0.4, heat));
            melt = mix(melt, vec3(4.2, 2.3, 0.55), smoothstep(0.45, 1.0, heat) * (0.7 + 0.3 * f2));
            float skin = 0.0;
            // dark crust rafts drift in the melt (the target art's braided channels: black islands, yellow between),
            // denser toward the banks, fewer on the thin cone streaks
            if (camD < 300.0) skin = smoothstep(0.6, 0.68, nT(p.xz * 0.16 + vec2(tt * 0.7, -tt * 0.3)).a + 0.12 * (1.0 - smoothstep(0.2, 0.7, heat))) * onField * (1.0 - smoothstep(200.0, 300.0, camD));
            melt *= 1.0 - 0.85 * skin;
            // banks: black glassy crusted rock (rougher up the levee), the channel's heat on it
            col = mix(col, vec3(0.011, 0.01, 0.011), inside);
            col = mix(col, col * 0.55 + vec3(0.004), levee * 0.8);
            rough = mix(rough, 0.4, inside); rough = mix(rough, 0.55, levee * 0.6);
            krEmis *= 1.0 - inside;
            float pulse = 0.9 + 0.1 * sin(uTime * 1.1 + p.x * 0.05 - p.z * 0.04);
            float spill = exp(-max(e, 0.0) / 0.8) * (1.0 - inside);
            krEmis += melt * inside * pulse + (vec3(1.4, 0.22, 0.01) * smoothstep(0.25, 0.0, e) + vec3(0.3, 0.04, 0.002) * spill) * (1.0 - inside) * pulse;
          }
          krAlbedo = col; krRough = clamp(rough, 0.18, 1.0); krWN = nn;
        }
        diffuseColor.rgb *= krAlbedo;`)
      .replace("#include <roughnessmap_fragment>", /* glsl */`float roughnessFactor = krRough;
        #ifdef KR_LODV
        // geometric specular AA (Kaplanyan–Hoffman 2016 / Tokuyoshi–Kaplanyan 2019): the
        // shading normal's screen-space variance widens the GGX lobe — the 2 m normal field + detail normals minified on
        // a far / grazing pixel no longer glint on and off frame to frame. alpha = roughness², sigma² 0.25, kappa 0.18.
        { vec3 dnx = dFdx(krWN), dny = dFdy(krWN);
          float a = roughnessFactor * roughnessFactor;
          float a2 = a * a + min(0.5 * (dot(dnx, dnx) + dot(dny, dny)), 0.18);
          roughnessFactor = sqrt(sqrt(a2)); }
        #endif`)
      .replace("#include <normal_fragment_maps>", /* glsl */`normal = normalize((viewMatrix * vec4(krWN, 0.0)).xyz);`)
      .replace("#include <emissivemap_fragment>", /* glsl */`totalEmissiveRadiance += krEmis;`)
      .replace("#include <dithering_fragment>", /* glsl */`#include <dithering_fragment>
        if (uBakeMode > 0.5) gl_FragColor = vec4(krAlbedo, 1.0);`);
  };
  mat.onBeforeCompile = terrainHook;
  mat.customProgramCacheKey = () => "kr-terrain-v19" + (TERRAIN_LODV ? "-lodv1" : "");
  // (perf) the FAR program: the same shader without the splat (weights, layers, crust, paths, farm, sand) —
  // LOD nodes wholly beyond uFarD.y draw with it (lod.ts), so far pixels never pay the near program's registers
  const far = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  far.onBeforeCompile = (shader) => { terrainHook(shader); shader.defines = { ...(shader.defines || {}), KR_FAR: 1 }; };
  far.customProgramCacheKey = () => "kr-terrain-far-v19" + (TERRAIN_LODV ? "-lodv1" : "");
  return { material: mat, farMaterial: far, uniforms };
}
