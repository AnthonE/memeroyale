// GPU particle families for the weapons FX.
// One instanced quad draw per family; each particle is simulated STATELESSLY on the GPU from its spawn record
// (position, velocity, drag, gravity, size curve, birth time), so update() is O(1): it only advances a time uniform.
// Spawning writes 24 floats into a fixed-size ring buffer (no allocation) and uploads just the dirty range.
// Blending is premultiplied alpha (ONE, ONE_MINUS_SRC_ALPHA): a shape can be purely additive (alpha 0), solid
// (alpha 1) or anything between, so hot glows and occluding cartoon shapes share one draw.
import * as THREE from "three";

/** how a quad is oriented (vertex shader) */
export const M = { BILL: 0, STRETCH: 1, AXIS: 2, SEG: 3, TRACER: 4, PLANE: 5 } as const;
/** glow family shapes (hot / emissive) */
export const G = { GLOW: 0, BURST: 1, SPARK: 2, STAR: 3, RING: 4, TRACER: 5, BEAM: 6, FLAME: 7, GLINT: 8, PETALS: 9, CORE: 10 } as const;
/** smoke family shapes (lit, alpha) */
export const S = { PUFF: 0, FIRE: 1, DROP: 2, LEAF: 3, FLUFF: 4, FOAM: 5, SOFT: 6 } as const;
/** decal family shapes (lit, alpha, lying on a surface) */
export const D = { WOOD: 0, METAL: 1, STONE: 2, GLASS: 3, FABRIC: 4, SCORCH: 5, DIVOT: 6 } as const;

/** shared uniforms (one object for all families; refreshed in onBeforeRender with the camera actually drawing) */
export interface FxUniforms {
  uTime: { value: number };
  uPx: { value: number };
  uSunV: { value: THREE.Vector3 };
  uSunW: { value: THREE.Vector3 };
  uSunCol: { value: THREE.Color };
  uAmb: { value: THREE.Color };
}
export function makeUniforms(): FxUniforms {
  return {
    uTime: { value: 0 }, uPx: { value: 0.001 },
    uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunW: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
    uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uAmb: { value: new THREE.Color(0.34, 0.4, 0.5) },
  };
}

const VERT = /* glsl */ `
attribute vec4 iP; // pos, birth
attribute vec4 iV; // velocity | axis | segment | normal, life
attribute vec4 iS; // size0, size1, drag, gravity
attribute vec4 iC; // rgb (linear, HDR ok), alpha
attribute vec4 iM; // shape, mode, rot0, spin
attribute vec4 iX; // mode extras, ease
uniform float uTime;
uniform float uPx;
varying vec2 vUv;
varying vec2 vN;
varying vec4 vC;
varying vec3 vA;
varying vec4 vX;
varying float vW;
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
vec3 sideOf(vec3 ax, vec3 toC, vec3 fallback) { vec3 c = cross(ax, toC); float l = length(c); return l > 1e-6 ? c / l : fallback; }
void main() {
  float age = uTime - iP.w;
  float life = iV.w;
  if (age < 0.0 || age >= life) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  float k = age / life;
  int mode = int(iM.y + 0.5);
  float kk = iX.w > 0.0 ? 1.0 - pow(1.0 - k, iX.w) : k;
  float size = mix(iS.x, iS.y, kk);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 c = position.xy;
  vec3 wp;
  vW = 1.0;
  vX = vec4(0.0);
  if (mode <= 1) {
    float drag = iS.z;
    float e = exp(-drag * age);
    float f = drag > 1e-4 ? (1.0 - e) / drag : age;
    vec3 p = iP.xyz + iV.xyz * f;
    p.y -= 0.5 * iS.w * age * age;
    if (mode == 0) {
      float a = iM.z + iM.w * age;
      float ca = cos(a), sa = sin(a);
      vec2 r = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
      wp = p + (camR * r.x + camU * r.y) * size * 0.5;
      vUv = c; vN = r;
    } else {
      vec3 vel = iV.xyz * e;
      vel.y -= iS.w * age;
      float sp = length(vel);
      vec3 ax = sp > 1e-4 ? vel / sp : camU;
      vec3 toC = cameraPosition - p;
      vec3 sd = sideOf(ax, toC, camR);
      float w = size;
      float wmin = length(toC) * uPx * 1.4;
      if (w < wmin) { vW = w / wmin; w = wmin; }
      float len = w + sp * iX.x;
      wp = p + ax * (c.x * 0.5 - 0.5) * len + sd * c.y * w * 0.5;
      vUv = vec2(c.x * 0.5 + 0.5, c.y); vN = c;
      vX.x = len / w;
    }
  } else if (mode == 2) {
    vec3 ax = normalize(iV.xyz);
    vec3 toC = cameraPosition - iP.xyz;
    vec3 sd = sideOf(ax, toC, camR);
    float w = size * iX.y;
    wp = iP.xyz + ax * (c.x * 0.5 + 0.5) * size + sd * c.y * w * 0.5;
    vUv = vec2(c.x * 0.5 + 0.5, c.y); vN = c;
  } else if (mode <= 4) {
    vec3 dir = iV.xyz;
    float dist = length(dir);
    dir /= max(dist, 1e-5);
    float h = dist, t = 0.0;
    if (mode == 4) { h = min(age * iX.x, dist); t = max(0.0, h - iX.y); }
    vec3 mid = iP.xyz + dir * mix(t, h, c.x * 0.5 + 0.5);
    vec3 toC = cameraPosition - mid;
    vec3 sd = sideOf(dir, toC, camR);
    float w = size;
    float wmin = length(toC) * uPx * 1.6;
    if (w < wmin) { vW = w / wmin; w = wmin; }
    wp = mid + sd * c.y * w * 0.5;
    vUv = vec2(c.x * 0.5 + 0.5, c.y); vN = c;
    vX = vec4(h - t, w, iX.z, (mode == 4 && h >= dist) ? age - dist / iX.x : -1.0);
  } else {
    vec3 n = normalize(iV.xyz);
    vec3 t1 = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(n, t1);
    float a = iM.z + iM.w * age;
    float ca = cos(a), sa = sin(a);
    vec2 r = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
    wp = iP.xyz + n * iX.z + (t1 * r.x + t2 * r.y) * size * 0.5;
    vUv = c; vN = r;
    vX = vec4(n, 0.0);
  }
  vC = iC;
  vA = vec3(k, hash11(iP.w * 7.31 + float(gl_InstanceID) * 1.618), iM.x);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunV;
uniform vec3 uSunW;
uniform vec3 uSunCol;
uniform vec3 uAmb;
varying vec2 vUv;
varying vec2 vN;
varying vec4 vC;
varying vec3 vA;
varying vec4 vX;
varying float vW;
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
// signed distance d (<0 inside) → antialiased coverage
float aa(float d) { return clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0); }
// angular noise without the atan seam: sample on a circle
float ringNoise(vec2 q, float freq, float seed) { vec2 d = q / max(length(q), 1e-4); return vnoise(d * freq + seed); }
vec3 fireRamp(float t) {
  vec3 c = mix(vec3(0.7, 0.07, 0.01), vec3(2.6, 0.75, 0.06), smoothstep(0.02, 0.3, t));
  c = mix(c, vec3(4.2, 2.7, 0.55), smoothstep(0.32, 0.55, t));
  return mix(c, vec3(7.0, 6.2, 4.2), smoothstep(0.62, 0.85, t));
}
// IQ's 5-point star SDF
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
float capsule(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y * 0.5);
  float x = clamp(p.x, 0.5, max(aspect - 0.5, 0.5));
  return length(p - vec2(x, 0.0)) - 0.5;
}
`;

const OUT = /* glsl */ `
  gl_FragColor = o;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

const GLOW_FRAG = COMMON + /* glsl */ `
void main() {
  float k = vA.x, seed = vA.y;
  int shape = int(vA.z + 0.5);
  vec4 o = vec4(0.0);
  if (shape == 0) {
    // soft hot glow (flash cores, fire blobs)
    float g = max(exp(-dot(vUv, vUv) * 4.0) - 0.0183, 0.0);
    float f = 1.0 - k; f *= f;
    o = vec4(vC.rgb * g * f * vC.a, 0.0);
  } else if (shape == 1) {
    // cartoon muzzle star: 7-9 long jagged rays + short rays between, white-hot core → banana yellow → orange rim
    float r = length(vUv);
    float th = atan(vUv.y, vUv.x);
    float N = 7.0 + floor(seed * 3.0);
    float sec = 6.2831853 / N;
    float i = floor(th / sec + 0.5);
    float d = abs(th - i * sec) / (sec * 0.5);
    float L = 0.62 + 0.38 * h11(i + seed * 91.0);
    float i2 = floor(th / sec);
    float d2 = abs(th - (i2 + 0.5) * sec) / (sec * 0.5);
    float L2 = 0.36 + 0.22 * h11(i2 + seed * 37.0 + 5.0);
    float core = 0.24 + 0.05 * sin(th * 5.0 + seed * 20.0);
    float rad = max(core + (L - core) * pow(max(1.0 - d, 0.0), 2.4), core + (L2 - core) * pow(max(1.0 - d2, 0.0), 2.8));
    rad *= 0.8 + 0.2 * smoothstep(0.0, 0.4, k);
    float cov = aa(r - rad);
    float t = 1.0 - r / rad;
    vec3 col = mix(vec3(2.4, 0.7, 0.06), vec3(4.6, 3.3, 0.7), smoothstep(0.0, 0.3, t));
    col = mix(col, vec3(9.0, 8.2, 6.4), smoothstep(0.42, 0.78, t));
    float f = 1.0 - smoothstep(0.55, 1.0, k);
    o = vec4(col * vC.rgb * cov * f * vC.a, cov * f * 0.4 * vC.a);
  } else if (shape == 2) {
    // velocity-stretched spark: rounded capsule, hot head, cooling tail
    float dd = capsule(vUv, vX.x);
    float cov = smoothstep(0.0, -0.25, dd);
    float along = 0.25 + 0.75 * vUv.x;
    vec3 col = mix(vec3(3.2, 0.95, 0.12), vec3(7.0, 5.6, 2.8), (1.0 - k) * (1.0 - k)) * vC.rgb;
    float f = 1.0 - smoothstep(0.55, 1.0, k);
    o = vec4(col * cov * along * f * vW * vC.a, 0.0);
  } else if (shape == 3) {
    // cartoon hit star: rounded 5-point star, bright fill, orange rim, soft glow
    vec2 p = vUv * 1.2;
    float d = sdStar5(p, 0.78, 0.48) - 0.07;
    float cov = aa(d);
    float inner = aa(d + 0.11);
    vec3 fill = mix(vec3(2.6, 2.0, 0.55), vec3(3.4, 3.2, 2.6), smoothstep(0.45, 0.0, length(p))) * vC.rgb;
    vec3 rim = vec3(1.3, 0.34, 0.03) * vC.rgb;
    vec3 col = mix(rim, fill, inner);
    float glow = exp(-max(d, 0.0) * 10.0) * (1.0 - cov) * 0.7;
    float f = 1.0 - smoothstep(0.7, 1.0, k);
    o = vec4((col * cov + vec3(2.2, 1.3, 0.25) * vC.rgb * glow) * f * vC.a, cov * f * vC.a);
  } else if (shape == 4) {
    // expanding ring (shock / hit ring), thins out as it grows
    float r = length(vUv);
    float th = mix(0.2, 0.03, k);
    float d = abs(r - (0.97 - th)) - th;
    float cov = aa(d);
    float f = 1.0 - k; f *= f;
    o = vec4(vC.rgb * cov * f, cov * f * vC.a);
  } else if (shape == 5) {
    // banana round: glossy golden spindle head (solid) + hot streak tail (additive)
    float L = vX.x, W = vX.y, H = min(vX.z, L);
    float m = (1.0 - vUv.x) * L;
    float arrive = vX.w;
    float fade = arrive < 0.0 ? 1.0 : 1.0 - clamp(arrive / 0.035, 0.0, 1.0);
    float yM = vUv.y * 0.5 * W;
    vec4 head = vec4(0.0);
    if (arrive < 0.0 && H > 0.0 && m < H) {
      float u = m / H;
      float hw = 0.5 * W * pow(sin(3.14159 * clamp(0.03 + u * 0.94, 0.0, 1.0)), 0.6) * (1.0 - 0.25 * u);
      float cov = aa(abs(yM) - hw);
      float yy = yM / max(hw, 1e-4);
      vec3 c = mix(vec3(1.25, 0.42, 0.03), vec3(2.3, 1.55, 0.18), smoothstep(-0.95, 0.15, yy));
      c = mix(c, vec3(4.2, 3.9, 2.8), smoothstep(0.25, 0.5, yy) * (1.0 - smoothstep(0.62, 0.86, yy)) * (1.0 - smoothstep(0.55, 0.95, u)));
      c *= mix(0.6, 1.0, smoothstep(0.0, 0.3, 1.0 - abs(yy)));
      c = mix(vec3(0.55, 0.26, 0.05), c, smoothstep(0.02, 0.12, 1.0 - u));
      head = vec4(c * cov, cov);
    }
    float tail = 0.0;
    float t0 = H * 0.35;
    if (m > t0) {
      float s = clamp((m - t0) / max(L - t0, 1e-3), 0.0, 1.0);
      float y = vUv.y;
      tail = (exp(-y * y * 12.0) + 0.25 * exp(-y * y * 2.5)) * pow(1.0 - s, 1.4);
    }
    vec3 tc = vec3(3.2, 2.1, 0.45) * vC.rgb * tail * vW;
    o = vec4(head.rgb + tc * (1.0 - head.a), head.a) * fade * vC.a;
  } else if (shape == 6) {
    // lingering beam (sniper): thin hot core + soft halo, slowly swirling, fading
    float y = vUv.y;
    float core = exp(-y * y * 36.0) + exp(-y * y * 5.0) * 0.3;
    float ends = smoothstep(0.0, 0.015, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
    float n = 0.7 + 0.3 * vnoise(vec2(vUv.x * vX.x * 1.2 - uTime * 2.0, y * 1.5 + seed * 10.0));
    float f = (1.0 - k); f *= f;
    o = vec4(vC.rgb * core * ends * n * f * vW * vC.a, 0.0);
  } else if (shape == 7) {
    // flame tongue anchored at its base (muzzle prongs, rocket exhaust)
    float x = vUv.x, y = abs(vUv.y);
    float n = vnoise(vec2(x * 5.0 + seed * 20.0, vUv.y * 2.0 + seed * 7.0));
    float hw = pow(x, 0.4) * pow(1.0 - x, 0.85) * 1.85 * (0.8 + 0.4 * n);
    float cov = smoothstep(hw, hw * 0.72, y) * smoothstep(0.0, 0.04, x);
    float t = (1.0 - x * 0.9) * (1.0 - 0.7 * y / max(hw, 1e-3));
    vec3 col = fireRamp(t) * vC.rgb;
    float f = 1.0 - smoothstep(0.45, 1.0, k);
    // a body you can see against the sky (at 0.3 it is a pale additive wisp)
    o = vec4(col * cov * f * vC.a, cov * f * 0.72 * vC.a);
  } else if (shape == 9) {
    // muzzle star: 4-6 FAT flame petals round a hot core — a filled, soft-edged, painted flame (not line art),
    // licking noise along the petals, orange rim → yellow body → cream-white heart; mostly opaque so it reads against a
    // bright sky
    float r = length(vUv);
    float th = atan(vUv.y, vUv.x);
    float N = 4.0 + floor(seed * 1.99);
    float petal = pow(abs(cos(th * N * 0.5 + seed * 6.2831)), 1.5);
    float n = vnoise(vec2(th * 2.6 + seed * 11.0, r * 5.0 - k * 7.0));
    float rad = 0.4 + 0.58 * petal * (0.75 + 0.5 * n);
    rad *= 0.72 + 0.28 * smoothstep(0.0, 0.3, k);
    float e = r / max(rad, 1e-3);
    float cov = smoothstep(1.0, 0.9, e);
    float t = 1.0 - e;
    // saturated flame (orange-red lick → banana yellow → a SMALL cream heart); kept under the tone curve's shoulder so it
    // stays yellow / orange against a bright sky instead of washing to peach
    vec3 col = mix(vec3(0.95, 0.16, 0.01), vec3(1.25, 0.62, 0.04), smoothstep(0.0, 0.28, t));
    col = mix(col, vec3(1.45, 1.12, 0.22), smoothstep(0.3, 0.6, t));
    col = mix(col, vec3(1.9, 1.7, 1.0), smoothstep(0.72, 0.95, t));
    float f = 1.0 - smoothstep(0.5, 1.0, k);
    o = vec4(col * cov * f * vC.a, cov * f * 0.95 * vC.a);
  } else if (shape == 10) {
    // opaque-ish fireball core with a soft body: cream-white heart → yellow → orange edge (flash cores, blast heart)
    float r = length(vUv);
    float n = vnoise(vUv * 3.0 + seed * 17.0);
    float e = r / (0.8 + 0.2 * n);
    float cov = smoothstep(1.0, 0.55, e);
    vec3 col = mix(vec3(1.1, 0.3, 0.02), vec3(1.5, 1.0, 0.16), smoothstep(0.85, 0.45, e));
    col = mix(col, vec3(1.95, 1.75, 1.05), smoothstep(0.4, 0.08, e));
    float f = 1.0 - smoothstep(0.4, 1.0, k);
    o = vec4(col * vC.rgb * cov * f * vC.a, cov * f * 0.9 * vC.a);
  } else {
    // 4-point twinkle glint
    vec2 p = abs(vUv);
    float g = exp(-p.x * 16.0) * exp(-p.y * 2.6) + exp(-p.y * 16.0) * exp(-p.x * 2.6) + exp(-dot(p, p) * 18.0);
    float f = sin(3.14159 * k);
    o = vec4(vC.rgb * g * f * vC.a, 0.0);
  }
  if (o.a <= 0.0 && dot(o.rgb, vec3(1.0)) <= 0.0) discard;
  ${OUT}
}`;

const SMOKE_FRAG = COMMON + /* glsl */ `
float toon(float x) { return smoothstep(-0.1, 0.24, x); }
void main() {
  float k = vA.x, seed = vA.y;
  int shape = int(vA.z + 0.5);
  vec4 o = vec4(0.0);
  if (shape <= 1 || shape == 6) {
    // stylized cartoon puff: cauliflower silhouette, cel-lit sphere, eroding from the outside in as it ages
    // (shape 6 = SOFT: the same lit puff with a feathered edge + softer core — dust, trails, smoke columns)
    vec2 q = vUv;
    float r = length(q);
    if (r > 1.0) discard;
    vec2 sp = q * 1.6 + seed * 23.0;
    float n1 = vnoise(sp), n2 = vnoise(sp * 2.4 + 7.1);
    float n = n1 * 0.62 + n2 * 0.38;
    float edge = 0.7 + 0.28 * ringNoise(q, 2.3, seed * 11.0);
    float F = r / edge;
    float er = smoothstep(0.3, 1.0, k);
    float Fd = F + er * (0.15 + 1.3 * (1.0 - n));
    float cov = shape == 6 ? smoothstep(1.0, 0.4, Fd) * (0.55 + 0.45 * smoothstep(1.0, 0.2, F)) : shape == 1 ? smoothstep(1.0, 0.78, Fd) : aa(Fd - 1.0);
    if (cov <= 0.0) discard;
    vec2 nv = vN / edge + (vec2(n1, n2) - 0.5) * (shape == 1 ? 0.3 : 0.7);
    vec3 nrm = normalize(vec3(nv, sqrt(max(1.0 - dot(vN, vN) / (edge * edge), 0.04))));
    float dif = shape == 1 ? smoothstep(-0.5, 0.9, dot(nrm, uSunV)) : toon(dot(nrm, uSunV));
    vec3 lit = vC.rgb * (uAmb * (0.8 + 0.3 * nrm.y) + uSunCol * dif);
    float a = cov * vC.a * smoothstep(0.0, 0.03, k);
    if (shape == 1) {
      // a steeper, noisier temperature field (with 70 % of every puff in the white-hot band it reads as pastel-peach
      // cotton) — a SMALL white-yellow core, then saturated yellow → orange → red lobes
      // (the noise breaks the rings into licks), burning down to charcoal soot from the outside in as the puff ages.
      // Emissive (the sun barely touches fire).
      // (so it is not a flat orange blob at 0.2 s) the temperature also follows the puff's FORM — hotter on its sun-facing
      // top, cooler + redder underneath — so every lobe reads as a lit yellow crown over an orange-red belly, and the
      // bands are wider (a painted gradient, not three flat rings)
      float T = (1.36 - F * 0.84 + (n - 0.5) * 0.6 + 0.2 * (dif - 0.5) + 0.14 * nrm.y) * (1.0 - smoothstep(0.05, 0.75, k));
      // peaks kept under the tone curve's shoulder (0.76) except the white-hot heart: over it the shoulder bleached the
      // oranges to salmon / peach
      vec3 fire = vec3(0.2, 0.022, 0.006);
      fire = mix(fire, vec3(0.5, 0.05, 0.008), smoothstep(0.2, 0.32, T));
      fire = mix(fire, vec3(0.95, 0.26, 0.012), smoothstep(0.36, 0.52, T));
      fire = mix(fire, vec3(1.0, 0.66, 0.06), smoothstep(0.6, 0.78, T));
      fire = mix(fire, vec3(1.9, 1.6, 0.75), smoothstep(0.9, 1.04, T));
      lit = mix(vec3(0.15, 0.14, 0.13) * (uAmb * (0.85 + 0.35 * nrm.y) + uSunCol * dif), fire, smoothstep(0.1, 0.2, T));
    }
    o = vec4(lit * a, a);
  } else if (shape == 2) {
    // droplet / sand grain (velocity-stretched), with a highlight
    float dd = capsule(vUv, vX.x);
    float cov = smoothstep(0.0, -0.2, dd);
    float hl = smoothstep(0.1, 0.6, vUv.y) * 0.8;
    vec3 lit = vC.rgb * (uAmb + uSunCol * 0.85) + hl * uSunCol * 0.4;
    float a = cov * vC.a * (1.0 - smoothstep(0.7, 1.0, k)) * vW;
    o = vec4(lit * a, a);
  } else if (shape == 3) {
    // leaf bit: pointed leaf with a mid-rib, flutter shading
    vec2 p = vUv;
    float y = p.y + 0.18 * (p.x * p.x - 0.5);
    float hw = 0.46 * pow(max(1.0 - p.x * p.x, 0.0), 0.75);
    float cov = aa(abs(y) - hw);
    if (cov <= 0.0) discard;
    float rib = 1.0 - 0.4 * exp(-y * y / 0.004) * step(p.x, 0.9);
    float side = y > 0.0 ? 1.0 : 0.82;
    float fl = 0.62 + 0.38 * sin(uTime * 11.0 + seed * 40.0);
    vec3 lit = vC.rgb * rib * side * (uAmb + uSunCol * fl);
    float a = cov * vC.a * (1.0 - smoothstep(0.8, 1.0, k));
    o = vec4(lit * a, a);
  } else if (shape == 4) {
    // fabric fluff / lint tuft: soft irregular wisp
    float r = length(vUv);
    float edge = 0.55 + 0.45 * ringNoise(vUv, 3.0, seed * 13.0);
    float cov = smoothstep(1.0, 0.55, r / edge);
    if (cov <= 0.0) discard;
    vec3 lit = vC.rgb * (uAmb + uSunCol * 0.9);
    float a = cov * vC.a * (1.0 - smoothstep(0.6, 1.0, k));
    o = vec4(lit * a, a);
  } else {
    // foam / dust ring lying on a surface (normal in vX.xyz), broken noisy edge + faint fill
    float r = length(vUv);
    float n = ringNoise(vUv, 3.2, seed * 9.0 + r * 3.0);
    float th = mix(0.15, 0.045, k) * (0.5 + n);
    float cov = aa(abs(r - 0.8) - th);
    float fill = smoothstep(0.8, 0.1, r) * 0.3 * n;
    vec3 lit = vC.rgb * (uAmb + uSunCol * max(dot(vX.xyz, uSunW), 0.0));
    float a = max(cov, fill) * vC.a * pow(1.0 - k, 1.3);
    o = vec4(lit * a, a);
  }
  ${OUT}
}`;

const DECAL_FRAG = COMMON + /* glsl */ `
void main() {
  float k = vA.x, seed = vA.y;
  int shape = int(vA.z + 0.5);
  vec2 q = vUv;
  float r = length(q);
  if (r > 1.0) discard;
  vec3 L = uAmb + uSunCol * max(dot(vX.xyz, uSunW), 0.0);
  float fade = 1.0 - smoothstep(0.78, 1.0, k);
  float th = atan(q.y, q.x);
  float wob = ringNoise(q, 3.0, seed * 17.0);
  vec3 c = vec3(0.0); float a = 0.0; vec3 glow = vec3(0.0);
  if (shape == 0 || shape == 3) {
    // radial rays: wood = pale splinters, glass = crack lines
    float N = shape == 0 ? 7.0 : 9.0;
    float sec = 6.2831853 / N;
    float i = floor(th / sec + 0.5);
    float jit = (h11(i + seed * 50.0) - 0.5) * 0.5;
    float d = abs(th - (i + jit) * sec) / (sec * 0.5);
    float len = 0.45 + 0.5 * h11(i * 3.1 + seed * 13.0);
    if (shape == 0) {
      float ray = aa(r - (0.2 + (len - 0.2) * pow(max(1.0 - d, 0.0), 3.2)));
      float hole = aa(r - 0.16 - 0.05 * wob);
      float soot = smoothstep(0.75, 0.2, r) * 0.3;
      c = mix(mix(vec3(0.08, 0.05, 0.03), vec3(0.78, 0.58, 0.34) * L, ray), vec3(0.02, 0.012, 0.008), hole);
      a = max(max(ray * 0.95, hole), soot);
    } else {
      float line = aa(d * r * sec * 0.5 - 0.012) * step(r, len) * smoothstep(len, len * 0.6, r);
      float ring = aa(abs(r - 0.34 - 0.05 * wob) - 0.01) * step(0.45, vnoise(vec2(th * 3.0, seed * 7.0)));
      float hole = aa(r - 0.09 - 0.03 * wob);
      float frost = smoothstep(0.3, 0.1, r) * 0.45;
      c = mix(vec3(0.95, 0.98, 1.0) * L * 1.2, vec3(0.05, 0.08, 0.1), hole);
      a = max(max(max(line, ring) * 0.9, hole), frost);
    }
  } else if (shape == 1) {
    // metal: dark bore, bright dented rim, faint soot
    float hole = aa(r - 0.13 - 0.02 * wob);
    float rim = aa(abs(r - 0.21) - 0.07);
    float soot = smoothstep(0.8, 0.25, r) * 0.35;
    c = mix(vec3(0.08, 0.075, 0.07), vec3(0.95, 0.93, 0.9) * L * 1.1, rim);
    c = mix(c, vec3(0.02), hole);
    a = max(max(rim, hole), soot);
  } else if (shape == 2) {
    // stone / concrete: chipped crater, pale dust ring, dark centre
    float crater = aa(r - 0.24 - 0.12 * wob);
    float dust = smoothstep(0.8, 0.3, r + (wob - 0.5) * 0.35) * 0.65;
    float pit = aa(r - 0.11 - 0.04 * wob);
    c = mix(vec3(0.82, 0.8, 0.76) * L, vec3(0.3, 0.29, 0.28) * L, crater);
    c = mix(c, vec3(0.04), pit);
    a = max(max(dust, crater * 0.9), pit);
  } else if (shape == 4) {
    // fabric: frayed dark tear
    float tear = aa(r - 0.2 - 0.18 * wob);
    float fray = aa(r - 0.34 - 0.2 * vnoise(q * 9.0 + seed)) * 0.4;
    c = vec3(0.05, 0.04, 0.035);
    a = max(tear * 0.9, fray);
  } else if (shape == 5) {
    // explosion scorch: soot with radial streaks + a dying ember glow in the centre
    float streak = 0.55 + 0.45 * vnoise(vec2(th * 5.0, seed * 3.0) + r * 0.5);
    float soot = smoothstep(1.0, 0.15, r + (wob - 0.5) * 0.4) * streak;
    c = vec3(0.035, 0.028, 0.022);
    a = soot * 0.9;
    float ember = exp(-r * 5.0) * (1.0 - smoothstep(0.0, 0.14, k)) * (0.6 + 0.4 * vnoise(q * 8.0 + seed));
    glow = vec3(3.0, 0.9, 0.12) * ember;
  } else {
    // sand / dirt divot
    a = smoothstep(0.7, 0.1, r + (wob - 0.5) * 0.3) * 0.45;
    c = vec3(0.3, 0.22, 0.14) * L;
  }
  a *= fade * vC.a;
  vec4 o = vec4(c * a + glow * fade, a);
  if (o.a <= 0.002 && dot(glow, vec3(1.0)) <= 0.0) discard;
  ${OUT}
}`;

const STRIDE = 24;
export const PARAMS = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, s0: 0.1, s1: 0.1, drag: 0, grav: 0,
  r: 1, g: 1, b: 1, a: 1, shape: 0, mode: 0, rot: 0, spin: 0, e0: 0, e1: 0, e2: 0, ease: 0,
  /** seconds before the particle is born (a timeline inside one emit burst — e.g. the explosion's smoke after its fire) */
  delay: 0,
};
export type Params = typeof PARAMS;

/** a pooled ring buffer of GPU-simulated quads = one draw call */
export class QuadFamily {
  readonly mesh: THREE.Mesh;
  /** the spawn record: set fields, then emit(); emit() resets it to defaults */
  readonly p: Params = { ...PARAMS };
  private readonly data: Float32Array;
  private readonly buf: THREE.InstancedInterleavedBuffer;
  private readonly geo: THREE.InstancedBufferGeometry;
  private cursor = 0;
  private pendStart = 0;
  private pend = 0;
  private high = 0;
  /** latest death time (clock seconds) of anything spawned: the mesh hides itself when nothing is alive */
  maxEnd = -1;
  constructor(name: string, readonly cap: number, frag: string, renderOrder: number, readonly u: FxUniforms, private clock: () => number, onRender: (cam: THREE.Camera, r: THREE.WebGLRenderer) => void) {
    this.data = new Float32Array(cap * STRIDE);
    this.buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    ["iP", "iV", "iS", "iC", "iM", "iX"].forEach((n, i) => g.setAttribute(n, new THREE.InterleavedBufferAttribute(this.buf, 4, i * 4)));
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      name: `fx-${name}`, vertexShader: VERT, fragmentShader: frag, uniforms: u as unknown as Record<string, THREE.IUniform>,
      transparent: true, depthWrite: false, depthTest: true, toneMapped: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = `fx-${name}`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.userData.castShadow = false; this.mesh.userData.noOutline = true;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (r, _s, cam) => onRender(cam, r);
  }

  emit() {
    const p = this.p, d = this.data, o = this.cursor * STRIDE;
    const t = this.clock() + p.delay;
    d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z; d[o + 3] = t;
    d[o + 4] = p.vx; d[o + 5] = p.vy; d[o + 6] = p.vz; d[o + 7] = p.life;
    d[o + 8] = p.s0; d[o + 9] = p.s1; d[o + 10] = p.drag; d[o + 11] = p.grav;
    d[o + 12] = p.r; d[o + 13] = p.g; d[o + 14] = p.b; d[o + 15] = p.a;
    d[o + 16] = p.shape; d[o + 17] = p.mode; d[o + 18] = p.rot; d[o + 19] = p.spin;
    d[o + 20] = p.e0; d[o + 21] = p.e1; d[o + 22] = p.e2; d[o + 23] = p.ease;
    if (this.pend === 0) this.pendStart = this.cursor;
    this.pend++;
    if (this.cursor + 1 > this.high) this.high = this.cursor + 1;
    this.cursor = (this.cursor + 1) % this.cap;
    if (t + p.life > this.maxEnd) this.maxEnd = t + p.life;
    Object.assign(p, PARAMS);
  }

  /** upload this frame's spawns; show/hide by liveness (O(1)) */
  flush(now: number) {
    if (this.pend > 0) {
      const b = this.buf;
      if (this.pend >= this.cap) b.addUpdateRange(0, this.cap * STRIDE);
      else if (this.pendStart + this.pend <= this.cap) b.addUpdateRange(this.pendStart * STRIDE, this.pend * STRIDE);
      else { b.addUpdateRange(this.pendStart * STRIDE, (this.cap - this.pendStart) * STRIDE); b.addUpdateRange(0, (this.pendStart + this.pend - this.cap) * STRIDE); }
      b.needsUpdate = true;
      this.pend = 0;
      this.geo.instanceCount = this.high;
    }
    this.mesh.visible = now < this.maxEnd;
  }

  /** shift every stored birth time (clock rebase) */
  rebase(dt: number) {
    for (let i = 0; i < this.cap; i++) this.data[i * STRIDE + 3] -= dt;
    this.maxEnd -= dt;
    this.buf.addUpdateRange(0, this.cap * STRIDE); this.buf.needsUpdate = true;
  }
}

export const FRAG = { glow: GLOW_FRAG, smoke: SMOKE_FRAG, decal: DECAL_FRAG };
