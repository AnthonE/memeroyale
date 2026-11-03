// WRECK BAY view light: SUNSET — the sun sits on the sea horizon just right of the frame
// centre between the galleon and the headland; the sky runs from a hot peach-orange band at the horizon through gold
// into lavender, cumulus lit orange-pink from below, long warm light raking across the beach and the hull, lavender
// fill in the shadows. Applied through atmos's PUBLISHED state api (`ctx.shared.get("atmos").state.apply(preset)`, the
// same call its setPreset makes) — derived from the live midday preset so every field atmos adds later keeps its
// midday value (the pattern of poi-coast lookout-point/golden.ts). Nothing here edits atmos code.
import type { WorldCtx } from "../../../engine/engine";

/** sun bearing (deg, 0 = north / −Z, 90 = east) + elevation for the poi-16 camera (looking NNE, az ≈ 27°) */
export const SUNSET_SUN = { az: 36, elev: 3.2 }; // in the gap between the stern and the headland (az 29 hid it behind the hull)

type Preset = Record<string, unknown> & { sunElev: number; sunAz: number };
interface AtmosLike { state: { preset: Preset; apply(p: Preset): void } }

export function sunsetPreset(base: Preset): Preset {
  return {
    ...base,
    sunElev: SUNSET_SUN.elev, sunAz: SUNSET_SUN.az,
    sunColor: "#ff9e48", sunIntensity: 4.3,
    sky: [[0, "#ff9640"], [2, "#ffa852"], [5, "#ffbb6c"], [9, "#fcc283"], [14, "#f5b590"], [20, "#e6a69c"], [28, "#c99db2"],
      [40, "#9d98c8"], [60, "#7c8ccb"], [90, "#6680c6"]],
    glowColor: "#ffc860", glow: 1.9, glowSize: 0.42, discDeg: 3.2, rays: 0.6, glowDesat: 0.2, glare: 0.35, glareWhite: 0.1,
    sunHorizon: "#ffc070", sunHorizonAmt: 1.0,
    cirrus: 0.22, cirrusOpacity: 0.2, cirrusLit: "#ffcf9a", cirrusShade: "#b8a4c0",
    envZenith: "#9a9cc8", envHorizon: "#f4c08c", groundHorizon: "#c09070", groundNadir: "#6e5448",
    envIntensity: 0.66, envGlow: 0.6,
    cloudLit: "#ffa868", cloudSun: 3.2, cloudShade: "#c08ca4", cloudTop: "#ffcf9c", cloudBase: "#a07494", cloudRim: 1.3,
    cloudKeyToCam: 0.18, cloudKeyNearSun: 1.0, cloudWrap: 0.5,
    hazeColor: "#f6c89a", hazeDensity: 1 / 7000, hazeHeight: 300, hazeSun: 0.8,
    fogColor: "#ffd8b0", fogDensity: 0.0004, fogHeight: 8,
    exposure: 0.98, saturation: 1.3, contrast: 1.3, warmth: 0.08, shadeWarmth: 0.1, vignette: 0.04, bloom: 0.35,
    cloudShadow: 0.45, rimLight: 1.5, warmBounce: 1.5,
  };
}

/** apply the sunset look (no-op if atmos is absent) */
export function stageSunset(ctx: WorldCtx) {
  const api = ctx.shared.get("atmos") as AtmosLike | undefined;
  if (!api?.state?.apply) return;
  const a = api as unknown as { setPreset?(id: string): void };
  try { a.setPreset?.("midday"); } catch { /* keep */ }
  api.state.apply(sunsetPreset(api.state.preset));
}
