// GLSL for the storm's secondary layers: dust skirt, ground glow, lightning, debris, and the
// inside-the-storm sky / grade / wet ground. The wall + deck themselves are the traced volume in ./volume.ts.
// Linear-space colours; tone mapping + colour space via three's chunks.

// ---------------------------------------------------------------- dust skirt (golden sand blown up the foot of the wall)
// Two shells in front of the face. Wind-blown streaks scroll along and up; the top edge is ragged (a sloped dune of
// flying sand); dense at the ground, wispy higher up; grazing views look through more of it (thickness ∝ 1/cos).
export const DUST_VERT = /* glsl */ `
uniform float uR, uTime, uLean, uOff, uHgt;
uniform vec2 uCenter;
varying float vH, vAng;
varying vec3 vW, vN;
void main() {
  vH = position.y; vAng = atan(position.z, position.x);
  float radial = uR - uOff - vH * uHgt * uLean * 0.6;
  vW = vec3(uCenter.x + cos(vAng) * radial, vH * uHgt - 6.0, uCenter.y + sin(vAng) * radial);
  vN = vec3(-cos(vAng), 0.0, -sin(vAng));
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}
`;

export const DUST_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime, uR, uInside, uLipK, uStrike, uAlpha, uHgt;
uniform vec3 uColDust, uBoltCol;
varying float vH, vAng;
varying vec3 vW, vN;
// a sunlit curtain of blown sand at the foot of the wall (a bright golden haze with wind streaks, the
// billows fading into it) — translucent everywhere (an opaque shell reads as a brown "mud" wall up close)
void main() {
  float along = vAng * uR, h = vH * uHgt;
  vec2 p1 = vec2(along / 220.0 - uTime * 0.06, h / 70.0 - uTime * 0.03);
  vec2 p2 = vec2(along / 60.0 - uTime * 0.16, h / 9.0 - uTime * 0.05);
  float n1 = texture2D(uNoise, p1).r, n2 = texture2D(uNoise, p2 * vec2(1.0, 0.3)).a;
  float top = uHgt * (0.35 + 0.65 * texture2D(uNoise, vec2(along / 600.0, 0.37)).g);
  float dens = exp(-h / (top * 0.32)) * smoothstep(top, top * 0.25, h) * (0.4 + 0.8 * n1) * (0.55 + 0.65 * n2);
  vec3 v = normalize(cameraPosition - vW);
  float cosv = abs(dot(v, vN)) + 0.45;
  float a = 1.0 - pow(max(1.0 - clamp(dens * uAlpha, 0.0, 0.9), 0.0), 1.0 / cosv);
  // the camera near the curtain looks THROUGH thin blowing sand, never at a wall of it: fade by horizontal distance
  float d = length((vW - cameraPosition).xz);
  a *= smoothstep(5.0, 40.0, d) * (1.0 - smoothstep(1100.0, 2200.0, d)) * (1.0 - uInside) * (1.0 - uLipK);
  vec3 col = uColDust * (0.75 + 0.5 * n2) * (1.25 - 0.6 * h / uHgt) + uBoltCol * uStrike * 0.6 * exp(-h / 60.0);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.7));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- ground glow under the wall (yellow energy on the sand)
export const GLOW_VERT = /* glsl */ `
uniform float uR;
uniform vec2 uCenter;
varying vec2 vLocal;
void main() {
  vLocal = position.xz;
  vec3 wp = vec3(uCenter.x + position.x * uR, 0.0, uCenter.y + position.z * uR);
  wp.y = 2.5;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const GLOW_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uR, uStrike, uFlash, uTime, uLipK;
uniform vec3 uBoltCol;
varying vec2 vLocal;
void main() {
  float rd = (length(vLocal) - 1.0) * uR + 18.0;
  float ang = atan(vLocal.y, vLocal.x);
  float n = texture2D(uNoise, vec2(ang * 12.0, uTime * 0.05)).g;
  // from the ground: a tight glow at the foot of the wall; from the air: the yellow haze spilling onto the sea inside the rim
  // from the air: a narrow yellow spill on the water / land just inside the lip, not a wash
  float sig = 2600.0 + uLipK * 6000.0;
  float a = exp(-rd * rd / sig) * (0.14 + 0.18 * n + uStrike * 0.55 + uFlash * 0.3 + uLipK * 0.25) * smoothstep(60.0, -10.0, rd);
  a *= smoothstep(0.8, 0.9, length(vLocal));   // never a hard inner edge
  gl_FragColor = vec4(uBoltCol * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- inside: rolling storm sky + the warm safe-zone gap
export const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const DOME_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform highp sampler3D uSph;
uniform float uTime, uInside, uFlashV;
uniform vec2 uGapDir;
uniform vec3 uMurkDark, uMurkLit, uGapCol, uVioletFlash, uMurkMid, uHorizon;
varying vec3 vDir;
// the storm deck seen from inside: heavy lumpy cloud masses hanging over you — dark cores, violet bodies,
// edges lit from the tear in the deck toward the safe zone, lightning flashing through. The lumps are the storm's own
// sphere grid (the wall's billows) laid on a ceiling ~320 m up: bumps on bumps, like the wall. Toward the horizon the
// deck recedes into the murk: its horizon colour IS the murk fog colour (uHorizon) — no seam with the fogged ground.
float sph(vec3 q) { return texture(uSph, q * (1.0 / 6.0)).r; }
float lumps(vec2 P) {
  vec3 q1 = vec3(P.x / 190.0, uTime * 0.012, P.y / 190.0);
  vec3 q2 = vec3(P.y / 70.0 + 3.1, uTime * 0.03 + 0.4, P.x / 70.0 + 1.7);
  return sph(q1) + 0.3 * sph(q2);
}
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, 0.0, 1.0);
  vec2 wind = vec2(uTime * 2.2, uTime * 0.9);
  vec2 P = d.xz / (up + 0.16) * 320.0 + wind;
  // soften the far (grazing) deck: sample the lumps a little blurrier toward the horizon (no shimmer)
  float s0 = lumps(P);
  vec2 gd = normalize(uGapDir + vec2(1e-4));
  float sg = lumps(P - vec2(gd.x, gd.y) * 26.0);
  float dens = smoothstep(0.22, -0.3, s0);
  // lit rims: a lump's side turned toward the tear (its field falls toward the gap) catches the light
  float lit = clamp((sg - s0) * 3.2 + 0.25, 0.0, 1.0);
  vec2 hd = normalize(d.xz + vec2(1e-5));
  float toward = clamp(dot(hd, gd) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uMurkMid, uMurkDark, dens);
  col = mix(col, uMurkLit, lit * smoothstep(0.05, 0.6, dens) * (0.35 + 0.65 * toward));
  // the tear: warm sunlight breaking through toward the safe zone, 3-20° above the horizon, framed by lit cloud edges
  float gapA = pow(toward, 5.0) * exp(-abs(up - 0.17) * 4.5);
  float tear = 1.0 - dens;
  col = mix(col, uGapCol * 3.2, clamp(gapA * tear * 1.7, 0.0, 0.97));
  col += uGapCol * gapA * lit * 1.1;
  col += uGapCol * pow(toward, 3.0) * exp(-up * 5.0) * 0.08;
  // lightning flashing through the deck
  col += uVioletFlash * uFlashV * (0.3 + 0.9 * lit) * (1.0 - dens * 0.5);
  // the deck recedes into the murk at the horizon (= the fog colour, lifted toward the tear)
  vec3 hz = uHorizon + uGapCol * pow(toward, 5.0) * 0.12;
  col = mix(col, hz, exp(-up * 6.0) * 0.92);
  col = mix(hz, col, smoothstep(-0.04, 0.02, d.y));
  float a = uInside * smoothstep(-0.6, 0.0, d.y);
  // ±1.5 % dither: the post LUT bands smooth violet gradients otherwise
  vec3 p3 = fract(vec3(gl_FragCoord.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33);
  col *= 1.0 + (fract((p3.x + p3.y) * p3.z) - 0.5) * 0.05;     // ≥ 1 quantum of the R11G11B10F scene buffer
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- inside: the grade (a per-pixel multiplier drawn last)
// violet and darker everywhere, but warm and LIFTED toward the gap on the horizon (light scattering in the murk) and
// flashed by lightning. HDR multiply (>1 brightens) — the scene target is half float.
export const GRADE_VERT = /* glsl */ `
uniform mat4 uInvProj, uCamWorld;
varying vec3 vRay;
void main() {
  vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
  vRay = mat3(uCamWorld) * (v.xyz / v.w);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
export const GRADE_FRAG = /* glsl */ `
uniform vec3 uGradeCol;
uniform vec2 uGapDir;
uniform float uIns, uFlashV;
varying vec3 vRay;
// the storm grade: violet + darker, warmer and lifted toward the gap. Every term is a smooth function of the view
// direction (a hard horizon cut reads as a wedge when the camera rolls) + a ±½ LSB dither against banding.
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 d = normalize(vRay);
  vec2 hd = normalize(d.xz + vec2(1e-5));
  float toward = clamp(dot(hd, normalize(uGapDir + vec2(1e-4))) * 0.5 + 0.5, 0.0, 1.0);
  float gap = pow(toward, 8.0) * exp(-abs(d.y - 0.05) * 3.0);
  vec3 m = mix(vec3(1.0), uGradeCol, uIns);
  m = mix(m, vec3(1.15, 1.02, 0.86), clamp(gap * uIns * 0.85, 0.0, 1.0));
  m += vec3(0.22, 0.18, 0.36) * uFlashV;
  m *= 1.0 + (hash12(gl_FragCoord.xy) - 0.5) * 0.05 * uIns;   // ≥ 1 quantum of the R11G11B10F scene buffer
  gl_FragColor = vec4(m, 1.0);
}
`;

/** additive companion of the grade: warm light scattered in the murk toward the gap (multiply alone can't warm violet) */
export const GAPGLOW_FRAG = /* glsl */ `
uniform vec3 uGapCol;
uniform vec2 uGapDir;
uniform float uIns;
varying vec3 vRay;
void main() {
  vec3 d = normalize(vRay);
  vec2 hd = normalize(d.xz + vec2(1e-5));
  float toward = clamp(dot(hd, normalize(uGapDir + vec2(1e-4))) * 0.5 + 0.5, 0.0, 1.0);
  // a soft glow hugging the horizon toward the safe zone: gaussian in elevation (no cut below the horizon)
  float e = d.y - 0.05;
  float g = pow(toward, 10.0) * exp(-e * e * 40.0) + 0.3 * pow(toward, 4.0) * exp(-e * e * 8.0);
  // + a faint violet lift everywhere (light scattered in the murk: blacks go dusky violet, not black)
  // the scene buffer is R11G11B10F (5-6 bit mantissas): a smooth additive gradient bands in rings unless dithered by
  // about one quantum of the SUM (otherwise: a banded ellipse facing the safe zone)
  vec3 p3 = fract(vec3(gl_FragCoord.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33);
  float nz = fract((p3.x + p3.y) * p3.z) - 0.5;
  vec3 add = uGapCol * g * 0.2 + vec3(0.013, 0.009, 0.028);
  gl_FragColor = vec4(max(add * (1.0 + nz * 0.5) + nz * 0.004, 0.0) * uIns, 1.0);
}
`;

// ---------------------------------------------------------------- inside: wet ground (draped sheet near the camera)
export const WET_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const WET_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec2 uGapDir;
uniform vec3 uSkyCol, uGapCol;
uniform float uInside, uTime, uFlashV;
varying vec3 vW;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float pn = texture2D(uNoise, vW.xz * 0.03).r + texture2D(uNoise, vW.xz * 0.12 + 0.3).g * 0.3;
  float puddle = smoothstep(0.58, 0.68, pn);
  // rain rings on the puddles (cheap: a moving ridged pattern)
  float rip = texture2D(uNoise, vW.xz * 0.9 + vec2(uTime * 0.7, -uTime * 0.5)).b;
  vec3 r = reflect(-v, normalize(vec3((rip - 0.5) * 0.15, 1.0, (rip - 0.5) * 0.12)));
  float fres = 0.05 + 0.95 * pow(1.0 - max(v.y, 0.0), 5.0);
  vec2 hd = normalize(r.xz + vec2(1e-5));
  float toward = clamp(dot(hd, uGapDir), 0.0, 1.0);
  vec3 refl = mix(uSkyCol, uGapCol * 1.4, pow(toward, 5.0) * exp(-abs(r.y) * 5.0)) + vec3(0.25, 0.2, 0.45) * uFlashV;
  float dist = length(cameraPosition - vW);
  float fade = 1.0 - smoothstep(22.0, 66.0, dist);
  // wet sheen everywhere (a glossy darkening that reflects the storm sky at grazing angles), mirror-like puddles
  float a = mix(0.28 + 0.4 * fres, 0.85, puddle) * uInside * fade;
  vec3 col = mix(vec3(0.02, 0.015, 0.035), refl, mix(0.25 + 0.75 * fres, 0.45 + 0.55 * fres, puddle));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- forked lightning (camera-facing ribbons)
export const BOLT_VERT = /* glsl */ `
attribute vec3 aDir;     // path direction at this vertex (bolt-local, unit, mitred)
attribute vec2 aSide;    // x: -1/+1 side, y: width (bolt-local units)
attribute float aHalo;   // 1 = the wide glow ribbon
uniform mat4 uXf;        // bolt-local → world (position / orientation / scale)
varying vec2 vUvB;
varying float vHalo;
void main() {
  vec3 wp = (uXf * vec4(position, 1.0)).xyz;
  vec3 wd = normalize(mat3(uXf) * aDir);
  vec3 view = normalize(cameraPosition - wp);
  vec3 side = normalize(cross(wd, view) + 1e-5);
  float s = length(mat3(uXf) * vec3(1.0, 0.0, 0.0));
  float dist = length(cameraPosition - wp);
  // widths in screen terms: a crisp 2-4 px core (the trunk thicker) and a soft ~24 px glow
  float w = aHalo > 0.5 ? dist * 0.0072 + aSide.y * s * 2.4 : dist * 0.0011 + aSide.y * s * 0.45;
  wp += side * aSide.x * w;
  vUvB = vec2(aSide.x, aSide.y); vHalo = aHalo;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const BOLT_FRAG = /* glsl */ `
uniform vec3 uCore, uGlow;
uniform float uOn;
varying vec2 vUvB;
varying float vHalo;
void main() {
  float x = vUvB.x;
  vec3 col;
  // glow: a soft falloff, brighter along the trunk (width) than on the twigs
  if (vHalo > 0.5) col = uGlow * exp(-x * x * 5.0) * (0.35 + 60.0 * vUvB.y);
  else col = uCore * exp(-x * x * 2.5) * 9.0 + uGlow * 1.5;
  gl_FragColor = vec4(col * uOn, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- debris: leaves, twigs, pebbles and banana chunks
// mode 0 (inside): a wrapped cube of flying debris around the camera; mode 1 (wall): swirling in front of the wall face
export const DEBRIS_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uWind, uAnchor, uAlong, uOut;
uniform float uTime, uAmt, uMode, uSpan;
varying vec2 vUvD;
varying vec4 vCol;
varying float vLit, vTy;
vec3 rot(vec3 p, vec3 a) {
  float cx = cos(a.x), sx = sin(a.x), cy = cos(a.y), sy = sin(a.y);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  return vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
}
void main() {
  vUvD = uv;
  float ty = floor(aSeed.w * 4.0);
  vTy = ty;
  vec3 col; vec2 sz;
  if (ty < 0.5) { col = vec3(0.075, 0.150, 0.030); sz = vec2(1.1, 0.55); }     // leaf
  else if (ty < 1.5) { col = vec3(0.11, 0.07, 0.04); sz = vec2(1.0, 0.1); }     // twig
  else if (ty < 2.5) { col = vec3(0.03, 0.026, 0.034); sz = vec2(0.24, 0.2); } // pebble
  else if (aSeed.x < 0.5) { col = vec3(0.09, 0.17, 0.04); sz = vec2(1.4, 0.7); vTy = 0.0; } // big leaf
  else { col = vec3(0.95, 0.72, 0.10); sz = vec2(0.62, 0.22); }                // banana chunk
  vec3 wp; float fade; float sp = 11.0 + aSeed.w * 16.0;
  if (uMode < 0.5) {
    float B = 34.0;
    vec3 flow = uWind * (uTime * sp);
    vec3 cellF = fract(aSeed.xyz + (flow - cameraPosition) / B);
    vec3 lp = (cellF - 0.5) * B;
    lp += vec3(sin(uTime * 2.3 + aSeed.x * 40.0), sin(uTime * 3.1 + aSeed.y * 47.0) * 0.6, cos(uTime * 2.7 + aSeed.z * 43.0)) * 0.9;
    wp = cameraPosition + lp;
    vec3 e = abs(cellF - 0.5) * 2.0;
    fade = smoothstep(0.0, 0.22, (1.0 - e.x) * (1.0 - e.y) * (1.0 - e.z)) * smoothstep(4.5, 9.0, length(lp));
    sz *= 0.6;   // many small streaking pieces, not a few giant leaves in front of the camera
  } else {
    // a slab in front of the wall: spiral outward + along the wall, looping; scaled up (they read at 100-300 m)
    float life = fract(aSeed.x + uTime * (0.035 + 0.03 * aSeed.w));
    float along = (aSeed.y - 0.5) * uSpan + (life - 0.5) * 160.0;
    float outw = life * 230.0 + aSeed.z * 40.0;
    float h = 4.0 + pow(aSeed.z, 1.3) * 300.0 + sin(life * 6.2831 + aSeed.x * 20.0) * 25.0 + life * 30.0;
    wp = uAnchor + uAlong * along + uOut * outw + vec3(0.0, h, 0.0);
    fade = smoothstep(0.0, 0.12, life) * smoothstep(1.0, 0.75, life);
    sz *= 4.0 + 0.02 * length(uAnchor + uAlong * along + uOut * outw - cameraPosition);
    if (aSeed.x > 0.2) { col = vec3(0.95, 0.72, 0.10); vTy = 3.0; sz = vec2(0.62, 0.22) * 9.0; }   // mostly bananas out of the wall
    sp = 60.0;
  }
  vCol = vec4(col, fade * uAmt);
  vec3 a = vec3(uTime * (3.0 + aSeed.x * 7.0) + aSeed.y * 30.0, uTime * (2.0 + aSeed.z * 5.0) + aSeed.x * 20.0, 0.0);
  vec3 px = rot(vec3(1.0, 0.0, 0.0), a), py = rot(vec3(0.0, 1.0, 0.0), a);
  vec3 nrm = cross(px, py);
  vLit = 0.45 + 0.55 * abs(nrm.y);
  // motion blur: stretch along the wind for the small near debris
  vec3 wdir = normalize(uWind + vec3(0.0, -0.1, 0.0));
  float stretch = uMode < 0.5 ? 1.0 + sp * 0.09 : 1.0;
  vec3 wp2 = wp + (px * position.x * sz.x + py * position.y * sz.y) + wdir * position.x * sz.x * (stretch - 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp2, 1.0);
}
`;

export const DEBRIS_FRAG = /* glsl */ `
varying vec2 vUvD;
varying vec4 vCol;
varying float vLit, vTy;
void main() {
  vec2 q = vUvD * 2.0 - 1.0;
  float w = 1.0 - q.x * q.x;                                        // pointed leaf / chunk silhouette
  float m = vTy > 2.5 ? w * 0.9 - abs(q.y + 0.55 - 0.75 * q.x * q.x) * 2.2   // banana crescent
                      : w * w - abs(q.y) * 1.05;
  float a = vCol.a * smoothstep(0.0, 0.15, m);
  if (a < 0.02) discard;
  gl_FragColor = vec4(vCol.rgb * vLit, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
