// LOOKOUT POINT view light: late golden hour. atmos ships "midday" (the game) and "dawn"; until it
// ships a "golden" preset of its own the poi-11 view's `stage: "golden"` applies
// this one through atmos's PUBLISHED api (`ctx.shared.get("atmos").state.apply(preset)` — the same call setPreset
// makes). Nothing here edits atmos code; the preset is derived from the live midday preset so every field atmos adds
// later keeps its midday value. Colours are DISPLAY targets like atmos's own tables (atmos inverts its grade).
// Target sky colours at the camera's pixel elevations (away from the sun, x≈0.35 of the frame):
//   2° #faeab5 · 4° #e7dfb9 · 7° #c7cec1 · 10° #a6b8be · 13° #8fa4b2 · 16° #8596ab; toward the sun the band goes
//   #fbecae → #fdfcd7 (the halo); sea under the sun #fbeec0; lit cloud crowns cream #fff0cf, shade lavender-grey.
import type { WorldCtx } from "../../../engine/engine";

/** sun bearing (deg, 0 = north / −Z, 90 = east) + elevation for the poi-11 camera (looking NE over the bay). A sun in
 *  front of the camera (az 142) puts the whole W cliff face and the tower's front in shade, reading as a brown
 *  slab. The key light falls on the tower's front-left and warms the grey cliff face: a low WNW sun behind
 *  the camera's left shoulder lights the face, the tower and the cottage front warm, and throws long shadows away to
 *  the right. */
export const GOLDEN_SUN = { az: 283, elev: 13 };

type Preset = Record<string, unknown> & { sunElev: number; sunAz: number };
interface AtmosLike { state: { preset: Preset; apply(p: Preset): void } }

export function goldenPreset(base: Preset): Preset {
  return {
    ...base,
    sunElev: GOLDEN_SUN.elev, sunAz: GOLDEN_SUN.az,
    sunColor: "#ffd9a6", sunIntensity: 4.1,
    sky: [[0, "#fbe7b0"], [2, "#faeab5"], [4, "#e7dfb9"], [7, "#c7cec1"], [10, "#a6b8be"], [13, "#8fa4b2"], [16, "#8596ab"],
      [24, "#7489a8"], [40, "#627ba4"], [90, "#566f9c"]],
    glowColor: "#fff1c4", glow: 1.25, glowSize: 0.36, discDeg: 1.3, rays: 0.35, glowDesat: 0.35,
    sunHorizon: "#ffe2a0", sunHorizonAmt: 0.9,
    cirrus: 0.18, cirrusOpacity: 0.16, cirrusLit: "#ffe6b8", cirrusShade: "#b9b4c8",
    // fill: lavender-blue sky above, warm peach horizon, warm sunlit-rock bounce from below
    envZenith: "#9aa4c0", envHorizon: "#f0cf9c", groundHorizon: "#b09070", groundNadir: "#6e5a48",
    envIntensity: 0.62, envGlow: 0.55,
    cloudLit: "#ffe6b4", cloudSun: 2.5, cloudShade: "#bcaaa6", cloudTop: "#f7e7c9", cloudBase: "#a3909a", cloudRim: 0.75,
    cloudKeyToCam: 0.06, cloudKeyNearSun: 0.65, cloudWrap: 0.32,
    // golden aerial haze: the far island + volcano recede into a warm veil (the far coast reads soft gold)
    hazeColor: "#f0d6a8", hazeDensity: 1 / 2100, hazeHeight: 520, hazeSun: 1.0,
    fogColor: "#ffe6c0", fogDensity: 0.002, fogHeight: 18,
    exposure: 1.08, saturation: 1.12, contrast: 1.16, warmth: 0.07, shadeWarmth: 0.12, vignette: 0.06, bloom: 0.45,
    cloudShadow: 0.5, rimLight: 1.35, warmBounce: 1.3, // a stronger golden rim on the tower
  };
}

/** apply the golden look (no-op if atmos is absent) */
export function stageGolden(ctx: WorldCtx) {
  const api = ctx.shared.get("atmos") as AtmosLike | undefined;
  if (!api?.state?.apply) return;
  // derive from midday even if another view already changed the preset (setPreset("midday") resets first)
  const a = api as unknown as { setPreset?(id: string): void };
  try { a.setPreset?.("midday"); } catch { /* keep */ }
  api.state.apply(goldenPreset(api.state.preset));
}
