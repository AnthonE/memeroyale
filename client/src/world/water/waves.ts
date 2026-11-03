// Gerstner swell shared by the GLSL (vertex displacement + per-pixel normal) and the JS mirror (surfaceAt → buoyancy,
// wading). Wavelength (m), amplitude (m), steepness (0..1), direction (unit xz, the direction the wave travels).
// The target art shows a calm tropical sea: a long low swell + a few shorter components. Everything is damped toward
// the beach (depth) and inside the lagoon (calm). Band-limited: each component fades out of the vertex displacement
// once the clipmap cells get too coarse for it (≈ 12–20 wavelengths away) and out of the per-pixel normal once it is
// smaller than a few pixels — no aliasing, no swimming when the clipmap snaps.

export interface Wave { len: number; amp: number; steep: number; dir: [number, number] }

const norm = (x: number, z: number): [number, number] => { const l = Math.hypot(x, z); return [x / l, z / l]; };

export const WAVES: Wave[] = [
  { len: 58, amp: 0.24, steep: 0.18, dir: norm(0.35, 1.0) },   // long swell from the NNW… travelling SSE
  { len: 31, amp: 0.12, steep: 0.24, dir: norm(0.8, 0.6) },
  { len: 17, amp: 0.065, steep: 0.30, dir: norm(-0.3, 0.95) },
  { len: 9.5, amp: 0.036, steep: 0.34, dir: norm(0.95, -0.2) },
  { len: 5.3, amp: 0.018, steep: 0.36, dir: norm(0.1, 1.0) },
  { len: 3.1, amp: 0.010, steep: 0.38, dir: norm(-0.7, 0.7) },
];

export const GRAVITY = 9.81;

/** how many of the WAVES (the longest first) get their slopes per vertex */
export const LONG = 5;

/** GLSL constant arrays + gerstner() (vertex: displacement + normal) and gerstnerSlopeLong/Short() (band-limited slopes) */
export function wavesGLSL(): string {
  const n = WAVES.length;
  const f = (v: number) => v.toFixed(5);
  // UNROLLED (ANGLE/Metal keeps const-array loops as loops with dynamic indexing: ~3× slower per wave)
  const slopeFn = (name: string, i0: number, i1: number) => {
    let body = "";
    for (let i = i0; i < i1; i++) {
      const w = WAVES[i], kk = (2 * Math.PI) / w.len, c = Math.sqrt(GRAVITY / kk);
      body += `  { float bl = 1.0 - smoothstep(${f(w.len * 0.12)}, ${f(w.len * 0.3)}, fp);
    float ph = ${f(kk)} * (dot(vec2(${f(w.dir[0])}, ${f(w.dir[1])}), xz) - ${f(c)} * t);
    sl += vec2(${f(w.dir[0])}, ${f(w.dir[1])}) * (${f(kk * w.amp)} * ampScale * bl * cos(ph)); }\n`;
    }
    return `vec2 ${name}(vec2 xz, float ampScale, float t, float fp) {\n  vec2 sl = vec2(0.0);\n${body}  return sl;\n}`;
  };
  // vertex: displacement + crest + the long components' slopes, ONE sin/cos per wave, unrolled
  let vbody = "";
  WAVES.forEach((w, i) => {
    const kk = (2 * Math.PI) / w.len, c = Math.sqrt(GRAVITY / kk), q = w.steep / (kk * w.amp * n);
    vbody += `  { float bl = 1.0 - smoothstep(${f(12 * w.len)}, ${f(20 * w.len)}, dist);
    float a = ${f(w.amp)} * ampScale * bl;
    float ph = ${f(kk)} * (dot(vec2(${f(w.dir[0])}, ${f(w.dir[1])}), xz) - ${f(c)} * t);
    float s = sin(ph), c = cos(ph);
    disp += vec3(${f(q * w.dir[0])} * a * c, a * s, ${f(q * w.dir[1])} * a * c);
`;
    if (i < 2) vbody += `    crest += (0.5 + 0.5 * s * bl) * ${i === 0 ? "0.65" : "0.35"};
`;
    if (i < LONG) vbody += `    sl += vec2(${f(w.dir[0])}, ${f(w.dir[1])}) * (${f(kk)} * a * (1.0 - smoothstep(${f(w.len * 0.12)}, ${f(w.len * 0.3)}, fpV)) * c);
`;
    vbody += `  }
`;
  });
  return /* glsl */ `
// vertex: disp = xyz displacement, crest = 0..1 near the crest of the primary swell, sl = the long components' slopes.
// dist = camera distance (m): components fade once the clipmap cells (≈ dist/64 m) exceed a quarter wavelength; fpV =
// the vertex footprint for the slopes (≈ the clipmap cell there). The crest factor fades to a neutral 0.5 with the band
// limit (coarse far rings would alias it into bright stripes). UNROLLED (ANGLE/Metal keeps const-array loops as loops
// with dynamic indexing: ~3× slower per wave)
void gerstner(vec2 xz, float ampScale, float t, float dist, float fpV, out vec3 disp, out float crest, out vec2 sl) {
  disp = vec3(0.0); crest = 0.0; sl = vec2(0.0);
${vbody}}
// surface slopes (∂h/∂x, ∂h/∂z) of the short swell components (${LONG}..${n - 1}), band-limited by the footprint fp (m / pixel);
// the long ones (≥ 17 m) are evaluated per VERTEX and interpolated
${slopeFn("gerstnerSlopeShort", LONG, n)}`;
}

/** JS mirror of the vertex shader's vertical displacement (ignores the horizontal Gerstner shift — fine for buoyancy). */
export function swellHeight(x: number, z: number, t: number, ampScale: number): number {
  let y = 0;
  for (const w of WAVES) {
    const k = (2 * Math.PI) / w.len, c = Math.sqrt(GRAVITY / k);
    y += w.amp * ampScale * Math.sin(k * (w.dir[0] * x + w.dir[1] * z - c * t));
  }
  return y;
}
