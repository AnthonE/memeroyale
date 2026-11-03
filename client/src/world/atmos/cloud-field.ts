// The KONG ROYALE sky: where every cumulus sits. Deterministic (same sky on every client / every capture).
//
// Composed by what each view camera (`?view=<id>`) SEES: every hero cloud is placed by its screen position in that
// view (u, v of its base centre, 0..1 from the top-left), its screen width (fraction of the frame) and a base
// altitude — the ray through (u, v) meets the base plane there, and the long axis is turned across the line of sight.
// One condensation level (bases 480–620 m) so the sky reads as one weather system: from the ground the heroes sit
// 3–15° above the horizon, 3–9 km out (not overhead — overhead clouds only show their undersides). Then:
//   - the aerial view's 8 cotton balls (small, over the sea around the island, bases ~140–170 m),
//   - a far horizon ring (7.4–9 km) in the azimuths no view camera looks at, so free play never sees an empty sky.
// No random mid-distance scatter: it put 20+ popcorn puffs 5–25° up in every ground view.
// Pure module (no DOM / WebGL): a node script can project it into every view camera and report overlaps / intruders.
import { mulberry32, type CloudKind } from "./cloud-shapes";

export interface CloudSpec {
  /** base centre (m); y = altitude of the flat base */
  x: number; y: number; z: number;
  /** width in metres */
  w: number;
  /** yaw (radians) */
  rot: number;
  kind: CloudKind;
  /** prototype variant within the kind */
  v: number;
  /** debug label: which view composed it */
  tag?: string;
}

export interface ViewCam { pos: [number, number, number]; az: number; pitch: number; fov: number; aspect: number }

const D2R = Math.PI / 180;

/** view id → key in VIEW_CAMS */
export const VIEW_IDS: Record<string, string> = {
  "poi-01-peel-harbor": "harbor", "biome-01-beach": "beach", "char-03-firefight": "firefight",
  "sky-01-dawn": "dawn", "island-01-master-aerial": "aerial", "sky-02-night": "night", "sky-03-rain": "rain",
};

/** the atmos-owned sky views (index.ts registers them; the fields below are composed for them) */
export const SKY_VIEWS: Record<"night" | "rain", { pos: [number, number, number]; target: [number, number, number]; fov: number }> = {
  // the lookout-point plateau at night (the lighthouse on the cliff, a lit keeper's cottage, palms and a
  // big tree framing the left, the moon upper-left over the sea)
  night: { pos: [-603, 48.3, 474], target: [-662, 60, 446], fov: 52 },
  // the south beach below the coconut-cove headland, looking ESE along the bay: jungle + cliff left, sea right, the
  // rainbow over the water (the low sun sits behind the camera, WNW)
  rain: { pos: [180, 5.4, 500], target: [500, 8, 650], fov: 62 },
};

/** the view cameras as resolved in the full world (module view overrides; beach = the water area's solved view).
 *  Defaults only: atmos afterBuild re-reads the LIVE module views (the POI / actors areas move their cameras) and
 *  rebuilds the field, so the sky stays composed for whatever the view camera's frame is. */
export const VIEW_CAMS: Record<string, ViewCam> = {
  harbor: { pos: [418, 33, 634], az: 41.6, pitch: -6.1, fov: 50, aspect: 16 / 9 },
  beach: { pos: [124, 3, -662], az: -57.3, pitch: 11.6, fov: 60, aspect: 16 / 9 },
  firefight: { pos: [240, 3, 544], az: 130, pitch: -1.1, fov: 58, aspect: 16 / 9 },
  dawn: camLook([432, 1.9, -252], [-330, 150, -470], 44),
  aerial: camLook([80, 1659, 1652], [21, 0, 61], 30),
  night: camLook(SKY_VIEWS.night.pos, SKY_VIEWS.night.target, SKY_VIEWS.night.fov),
  rain: camLook(SKY_VIEWS.rain.pos, SKY_VIEWS.rain.target, SKY_VIEWS.rain.fov),
};

export function camLook(p: [number, number, number], t: [number, number, number], fov: number): ViewCam {
  const dx = t[0] - p[0], dy = t[1] - p[1], dz = t[2] - p[2];
  return { pos: p, az: Math.atan2(dx, -dz) / D2R, pitch: Math.atan2(dy, Math.hypot(dx, dz)) / D2R, fov, aspect: 16 / 9 };
}

/** camera basis (forward, right, up) */
export function basis(c: ViewCam) {
  const a = c.az * D2R, p = c.pitch * D2R;
  const f = [Math.sin(a) * Math.cos(p), Math.sin(p), -Math.cos(a) * Math.cos(p)];
  const r = [Math.cos(a), 0, Math.sin(a)];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, u, tv: Math.tan((c.fov * D2R) / 2), th: Math.tan((c.fov * D2R) / 2) * c.aspect };
}

/** project a world point → [u, v, depth] (u, v 0..1 from the top-left; depth along the view axis) */
export function project(c: ViewCam, x: number, y: number, z: number): [number, number, number] {
  const b = basis(c);
  const d = [x - c.pos[0], y - c.pos[1], z - c.pos[2]];
  const df = d[0] * b.f[0] + d[1] * b.f[1] + d[2] * b.f[2];
  const dr = d[0] * b.r[0] + d[1] * b.r[1] + d[2] * b.r[2];
  const du = d[0] * b.u[0] + d[1] * b.u[1] + d[2] * b.u[2];
  return [0.5 + dr / (df * b.th) / 2, 0.5 - du / (df * b.tv) / 2, df];
}

export function cloudField(preset: "midday" | "dawn" | "night" | "rain" | "jungle" = "midday", cams: Partial<Record<string, ViewCam>> = {}): CloudSpec[] {
  const rng = mulberry32(4242);
  const cam = (k: string) => cams[k] ?? VIEW_CAMS[k];
  const out: CloudSpec[] = [];
  let v = 0;
  /** place a cloud by its base-centre screen position in a view camera */
  const at = (view: string, u: number, vv: number, wFrac: number, base: number, kind: CloudKind, yawJit = 12) => {
    const c = cam(view), b = basis(c);
    const sx = (2 * u - 1) * b.th, sy = (1 - 2 * vv) * b.tv;
    const ray = [b.f[0] + b.r[0] * sx + b.u[0] * sy, b.f[1] + b.r[1] * sx + b.u[1] * sy, b.f[2] + b.r[2] * sx + b.u[2] * sy];
    const t = (base - c.pos[1]) / ray[1];
    if (!(t > 0)) return;
    const x = c.pos[0] + ray[0] * t, z = c.pos[2] + ray[2] * t;
    const depth = t; // ray has unit forward component
    const w = wFrac * 2 * depth * b.th;
    const rot = -c.az * D2R + (rng() - 0.5) * 2 * yawJit * D2R;
    out.push({ x, y: base, z, w, rot, kind, v: v++, tag: view });
  };

  if (preset === "night") {
    // ---- sky-02-night: moonlit masses — a big bank left of centre under the moon (upper-left), a smaller
    // tower right of centre over the peak, a cut cloud at the top-left edge, low puffs along the horizon
    at("night", 0.30, 0.47, 0.30, 700, "cumulus");
    at("night", 0.13, 0.43, 0.14, 560, "humilis");
    at("night", 0.46, 0.43, 0.10, 640, "cotton");
    at("night", 0.02, 0.16, 0.16, 1500, "cumulus");
    at("night", 0.63, 0.40, 0.09, 600, "humilis");
    at("night", 0.90, 0.44, 0.10, 520, "cotton");
  } else if (preset === "rain") {
    // ---- sky-03-rain: a dramatic squall sky — towering white cumulus over the bay (centre + right), a grey mass across
    // the top, broken puffs over the hills on the left; blue breaks between them
    at("rain", 0.36, 0.30, 0.20, 900, "tower");
    at("rain", 0.74, 0.30, 0.28, 820, "tower");
    at("rain", 0.97, 0.36, 0.16, 700, "cumulus");
    at("rain", 0.55, 0.10, 0.34, 1900, "cumulus");
    at("rain", 0.20, 0.10, 0.20, 1600, "cumulus");
    at("rain", 0.26, 0.26, 0.09, 700, "humilis");
    at("rain", 0.58, 0.40, 0.10, 560, "humilis");
    at("rain", 0.87, 0.45, 0.07, 500, "cotton");
    at("rain", 0.05, 0.30, 0.10, 700, "humilis");
  } else if (preset === "dawn") {
    // ---- sky-01-dawn (looking SW, sun low on the right): big peach banks filling the left half, a mass rising
    // behind the volcano (not a balloon over its summit), a backlit bank right of the sun — the sun disc stays clear
    // (camera: the stilt-town lagoon beach, looking W at the volcano, sun low on the right) — the target art's sky is
    // FULL: big peach masses filling the left half, a lavender band across the top, a mass rising behind the volcano, a
    // backlit bank right of the sun; the disc itself stays clear
    at("dawn", 0.16, 0.40, 0.36, 620, "cumulus");
    at("dawn", 0.03, 0.30, 0.22, 700, "cumulus");
    at("dawn", 0.30, 0.22, 0.24, 1100, "cumulus");
    at("dawn", 0.52, 0.34, 0.20, 760, "cumulus");
    at("dawn", 0.46, 0.10, 0.30, 1500, "humilis");
    at("dawn", 0.72, 0.18, 0.22, 1200, "cumulus");
    at("dawn", 0.70, 0.40, 0.12, 600, "humilis");
    at("dawn", 0.97, 0.27, 0.13, 900, "cumulus"); // clear of the low sun (at ~0.9, 0.45)
    at("dawn", 0.90, 0.12, 0.16, 1300, "humilis");
  } else {
    // Altitudes are chosen so a view's clouds don't clutter another view's frame.
    // ---- poi-01-peel-harbor (looking NE over the port): big cumulus cut by the top-left, a tall one left of centre,
    // small puffs behind the cranes, a medium one right of centre and the hero cumulus top-right
    at("harbor", 0.07, 0.17, 0.24, 520, "cumulus");
    at("harbor", 0.32, 0.20, 0.15, 560, "cumulus");
    at("harbor", 0.51, 0.215, 0.065, 540, "cotton");
    at("harbor", 0.555, 0.145, 0.04, 600, "cotton");
    at("harbor", 0.615, 0.165, 0.065, 580, "humilis");
    at("harbor", 0.635, 0.22, 0.04, 540, "cotton");
    at("harbor", 0.71, 0.265, 0.11, 520, "cumulus");
    at("harbor", 0.885, 0.245, 0.25, 600, "cumulus");
    // ---- biome-01-beach (looking WNW, sun just outside the top-right): a big cumulus upper-centre, a huge mass on the
    // right, fair-weather puffs low on the right (the two low ones are ALSO the harbor's puffs behind the cranes)
    // (0.22 wide, a touch lower: wider, it sat too close and too large behind the palms; target ≈ 20°)
    at("beach", 0.5, 0.29, 0.22, 900, "cumulus");
    // the right-hand hero is four medium masses (~20° wide in total, 15 to 35° up) stepping up and back from the
    // horizon bank, never one giant mass filling the right third
    at("beach", 0.785, 0.37, 0.155, 760, "cumulus");
    at("beach", 0.915, 0.315, 0.15, 820, "cumulus");
    at("beach", 0.855, 0.47, 0.13, 660, "humilis");
    at("beach", 0.975, 0.465, 0.1, 690, "cotton");
    at("beach", 0.655, 0.44, 0.10, 450, "humilis");
    at("beach", 0.96, 0.56, 0.12, 450, "humilis");
    // the target art's right half keeps building down to the horizon: a lower bank under the big mass
    at("beach", 0.80, 0.60, 0.17, 480, "cumulus");
    at("beach", 0.70, 0.635, 0.12, 420, "humilis");
    // ---- char-03-firefight (looking SE over the beach): a big cumulus upper-centre, a low one behind the tower on
    // the left, medium + small puffs across the right half
    at("firefight", 0.46, 0.19, 0.30, 600, "cumulus");
    at("firefight", 0.25, 0.18, 0.17, 560, "humilis");
    at("firefight", 0.88, 0.175, 0.11, 580, "cumulus");
    at("firefight", 0.645, 0.10, 0.09, 620, "cotton");
    at("firefight", 0.77, 0.245, 0.10, 520, "humilis");
    at("firefight", 0.985, 0.08, 0.07, 620, "cotton");
    // ---- island-01-master-aerial: 8 cotton balls over the sea around the island (120–250 m wide), LOW (bases ~140–170 m)
    // so each soft shadow lands right beside its cloud (~170 m SE, ~1 cloud-height along the sun; at
    // 420–650 m the shadows fell 800 px away / off frame). Seen from the air only (clouds.ts uMinCamY fade)
    const A: Array<[number, number, number, number]> = [
      [0.05, 0.10, 0.10, 170], [0.15, 0.17, 0.055, 160], [0.58, 0.10, 0.10, 160], [0.80, 0.15, 0.13, 150],
      [0.975, 0.36, 0.06, 150], [0.03, 0.47, 0.085, 160], [0.06, 0.72, 0.08, 145], [0.515, 0.92, 0.13, 140],
    ];
    for (const [u, vv, w, alt] of A) at("aerial", u, vv, w, alt, "puff", 30); // long axis across the view: flat cotton balls from above
  }

  // ---- horizon ring (7.4–9 km): fills the azimuths no view camera composes (N, S–WSW), bases 480–620 m
  const RING: Array<[number, number, number, CloudKind]> = [
    [-16, 7600, 1500, "cumulus"], [186, 7400, 1500, "cumulus"], [200, 8400, 1100, "humilis"], [214, 9000, 1400, "cumulus"],
    [236, 8000, 1300, "humilis"], [258, 8800, 1600, "cumulus"],
  ];
  for (const [az, d, w, kind] of RING) {
    if (preset === "dawn" && az > 190 && az < 290) continue; // the dawn frame (SW) is composed above
    const a = az * D2R;
    out.push({ x: Math.sin(a) * d, y: 480 + rng() * 140, z: -Math.cos(a) * d, w, rot: -a + (rng() - 0.5) * 0.4, kind, v: v++, tag: "ring" });
  }
  // ---- horizon banks: low cumulus 1–5° above the horizon in EVERY azimuth, 9.5–11 km out (every ground
  // view has a cloud line on the sea horizon, like the target art; small on screen, cheap)
  for (let i = 0; i < 18; i++) {
    const az = i * 20 + (rng() - 0.5) * 12;
    if (preset === "dawn" && az > 200 && az < 260) continue;
    const a = az * D2R, d = 9500 + rng() * 1500;
    out.push({ x: Math.sin(a) * d, y: 380 + rng() * 160, z: -Math.cos(a) * d, w: 1000 + rng() * 800, rot: -a + (rng() - 0.5) * 0.5, kind: "humilis", v: v++, tag: "bank" });
  }
  return out;
}
