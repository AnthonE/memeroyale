// CPU replica of the composite's tone curve + OkLab grade (post.ts FINAL_FRAG — keep the two in sync). Presets give
// the SKY as display colours measured on the target art (sRGB hex at an elevation); gradeInv() turns each into the
// linear radiance the sky shader must emit so that tone + grade land exactly on it. Pure module (node-testable).

export interface GradeParams {
  exp: number; toe: number; sat: number; con: number; warm: number; shade: number;
  /** contrast pivot on OkLab L and the soft gamut's highlight knee */
  piv?: number; knee?: number;
  /** bright-green gamut roll-off strength (1 = on; 0 = off) */
  greenRoll?: number;
}

const cb = Math.cbrt;
const sm = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function toOklab(c: number[]): [number, number, number] {
  const l = cb(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = cb(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = cb(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function fromOklab(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** the TONE part (exposure, luminance toe, hue-keeping shoulder): HDR radiance → linear 0..1 (post.ts tone()) */
export function toneFwd(cIn: number[], P: GradeParams): number[] {
  let c = cIn.map((v) => Math.max(0, v * P.exp));
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const off = y < 0.08 ? y - 6.25 * y * y : 0.04;
  const k = Math.max(y - off * P.toe, 0) / Math.max(y, 1e-5);
  c = c.map((v) => v * k);
  const S = 0.76, D = 0.15;
  const peak = Math.max(...c);
  if (peak >= S) {
    const d = 1 - S, np = 1 - (d * d) / (peak + d - S);
    c = c.map((v) => (v * np) / peak);
    const g = 1 - 1 / (D * (peak - np) + 1);
    c = c.map((v) => v + (np - v) * g);
  }
  return c;
}

/** the GRADE part (OkLab contrast / saturation / split tone / soft gamut) on a toned linear 0..1 colour */
export function gradePost(c: number[], P: GradeParams): number[] {
  let [L, a, b] = toOklab(c);
  L = Math.min(1, Math.max(0, L));
  const PV = P.piv ?? 0.55;
  L = L < PV ? PV * (L / PV) ** P.con : 1 - (1 - PV) * ((1 - L) / (1 - PV)) ** P.con;
  a *= P.sat; b *= P.sat;
  const w = P.shade * 0.045 * (1 - sm(0.25, 0.6, L)) + P.warm * 0.045 * sm(0.55, 0.92, L);
  a += 0.12 * w; b += w; // warm shade leans yellow, less red (the harbor shade beside yellow containers)
  // sunlit palm fronds clipped to neon lime (4.85 % of a field frame at G ≥ 250 with R or B < 200), so:
  // a gamut roll-off for bright GREENS (OkLab hue ~112–180°: lime → green, yellows / bananas untouched): chroma and a
  // touch of lightness roll off above L .7, and the soft gamut's highlight knee drops so the green channel lands ≤ ~245
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  const wg = (P.greenRoll ?? 1) * sm(113, 125, hue) * (1 - sm(172, 190, hue)) * sm(0.02, 0.06, Math.hypot(a, b));
  if (wg > 0) {
    const k = sm(0.66, 0.95, L);
    a *= 1 - wg * 0.3 * k; b *= 1 - wg * 0.3 * k;
    L *= 1 - wg * 0.05 * sm(0.75, 1.0, L);
  }
  let o = fromOklab(L, a, b);
  const g = Math.max(L * L * L, 1e-6), mn = Math.min(...o), mx0 = Math.max(...o);
  // green highlights: evaluate the knee on a stretched range so the channel peak saturates at ~0.9 (sRGB ~243)
  const cap = 1 - 0.1 * wg;
  const mx = mx0 / cap;
  let t = 1;
  const A = 0.2, F = 0.025, K = A - F, r = mn / g;
  if (r < A && mn < g) { const x = A - r, rp = A - x / (1 + x / K); t = Math.min(t, (1 - rp) / (1 - r)); }
  const H = P.knee ?? 0.96;
  if (mx > H && mx0 > g) { const tgt = cap * (1 - ((1 - H) * (1 - H)) / (mx - 2 * H + 1)); t = Math.min(t, Math.max(tgt - g, 0) / (mx0 - g)); }
  t = Math.min(1, Math.max(0, t));
  o = o.map((v) => Math.min(1, Math.max(0, g + (v - g) * t))) as [number, number, number];
  return o;
}

/** linear HDR scene radiance → linear display colour (0..1), exactly as the composite shader does it */
export const gradeFwd = (cIn: number[], P: GradeParams): number[] => gradePost(toneFwd(cIn, P), P);

export const toSRGB = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
export const fromSRGB = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const hex2lin = (h: string) => [1, 3, 5].map((i) => fromSRGB(parseInt(h.slice(i, i + 2), 16) / 255));
export const lin2hex = (c: number[]) => "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, toSRGB(v))) * 255).toString(16).padStart(2, "0")).join("");

/** the linear scene radiance whose graded output is the target display colour (target given as linear display rgb) */
export function gradeInvLin(T: number[], P: GradeParams): number[] {
  let x = T.slice();
  for (let it = 0; it < 48; it++) {
    const o = gradeFwd(x, P);
    x = x.map((v, i) => Math.max(0, v * Math.pow(Math.max(T[i], 1e-5) / Math.max(o[i], 1e-5), 0.75)));
  }
  return x;
}
export const gradeInv = (hex: string, P: GradeParams) => gradeInvLin(hex2lin(hex), P);

/**
 * Sky gradient table: display stops [elevation°, sRGB hex] interpolated in OkLab (monotone cubic over elevation — no
 * Mach bands at the stops, no overshoot), each texel inverted through the grade. Returns linear radiance rows for u = sqrt(elev / 90°).
 */
export function skyTable(stops: Array<[number, string]>, P: GradeParams | null, n = 128): Float32Array {
  const s = stops.slice().sort((a, b) => a[0] - b[0]);
  const labs = s.map(([, h]) => toOklab(hex2lin(h)));
  const out = new Float32Array(n * 4);
  const at = (e: number) => {
    if (e <= s[0][0]) return labs[0];
    if (e >= s[s.length - 1][0]) return labs[labs.length - 1];
    let i = 0;
    while (i < s.length - 2 && e > s[i + 1][0]) i++;
    const e0 = s[i][0], e1 = s[i + 1][0], h = e1 - e0, t = (e - e0) / h;
    const r: number[] = [];
    for (let k = 0; k < 3; k++) {
      // monotone cubic Hermite (Fritsch–Carlson) per OkLab channel: C1 through every stop and no overshoot (a Catmull-Rom
      // spline overshoots between unevenly spaced stops and draws Mach bands at them)
      const m1 = slope(k, i), m2 = slope(k, i + 1);
      const t2 = t * t, t3 = t2 * t;
      r.push((2 * t3 - 3 * t2 + 1) * labs[i][k] + (t3 - 2 * t2 + t) * h * m1 + (-2 * t3 + 3 * t2) * labs[i + 1][k] + (t3 - t2) * h * m2);
    }
    return r;
  };
  // Fritsch–Carlson tangents at stop j for channel k
  const slope = (k: number, j: number) => {
    const sec = (a: number) => (labs[a + 1][k] - labs[a][k]) / (s[a + 1][0] - s[a][0]);
    if (j === 0) return sec(0);
    if (j === s.length - 1) return sec(j - 1);
    const a = sec(j - 1), b = sec(j);
    if (a * b <= 0) return 0;
    const h0 = s[j][0] - s[j - 1][0], h1 = s[j + 1][0] - s[j][0];
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / a + w2 / b); // weighted harmonic mean
  };
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), e = u * u * 90;
    const lab = at(e);
    const disp = fromOklab(lab[0], lab[1], lab[2]).map((v) => Math.max(0, v));
    const lin = P ? gradeInvLin(disp, P) : disp;
    out.set([lin[0], lin[1], lin[2], 1], i * 4);
  }
  return out;
}

/** LUT size; its input is the TONED colour (0..1) through a perceptual shaper u = c^(1/LUT_GAMMA) (post.ts mirrors it) */
export const LUT_N = 48, LUT_GAMMA = 2.2;
/**
 * grade + sRGB encode baked into an N³ table (RGBA half floats, r fastest) over the toned, perceptually shaped colour:
 * the composite runs the cheap analytic tone curve, then one 3D fetch instead of the OkLab round trip + gamut
 * compression + sRGB pow. (The tone curve stays out of the LUT: over a log-HDR axis its trilinear kinks in the
 * highlight shoulder drew contour rings over every lit cloud dome and bands in the sky near the sun.)
 */
export function gradeLUT(P: GradeParams, N = LUT_N): Float32Array {
  const out = new Float32Array(N * N * N * 4);
  const axis = Array.from({ length: N }, (_, i) => Math.pow(i / (N - 1), LUT_GAMMA));
  let o = 0;
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const d = gradePost([axis[r], axis[g], axis[b]], P);
    out[o++] = toSRGB(d[0]); out[o++] = toSRGB(d[1]); out[o++] = toSRGB(d[2]); out[o++] = 1;
  }
  return out;
}
