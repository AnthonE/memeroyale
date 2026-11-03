// THE MURK view light for the poi-13 view (`stage: "murk"`): the sun hangs high AHEAD of the camera (NNW,
// over the channel), back-lighting the canopy so shafts fall toward the camera; warm key, dense low haze over the
// swamp, green-gold bounce. Applied through atmos's PUBLISHED state api (ctx.shared "atmos": state.apply(preset)),
// derived from the live midday preset (the same pattern as poi-coast lookout-point/golden.ts). No atmos code edited.
import type { WorldCtx } from "../../../engine/engine";
import { setMurkHaze } from "./water";

type Preset = Record<string, unknown> & { sunElev: number; sunAz: number };
interface AtmosLike { state: { preset: Preset; apply(p: Preset): void }; setPreset?(id: string): void }

export function murkPreset(base: Preset): Preset {
  return {
    ...base,
    // the sun hangs just above the frame's top-centre, straight up the channel (az 350): the canopy is BACK-lit,
    // the shafts fall toward the camera and the only bright sky is the hazy sun gap
    sunElev: 36, sunAz: 350,
    sky: [[0, "#efe4bc"], [10, "#e9e3c2"], [25, "#dfe2c8"], [45, "#cfdccc"], [90, "#bdd2cc"]],
    glowColor: "#fff0c4", glow: 1.3, glowSize: 0.3, discDeg: 1.2, glare: 1.1, glowDesat: 0.3,
    cirrus: 0.0,
    sunColor: "#ffd8a8", sunIntensity: 3.6,
    envZenith: "#8fa890", envHorizon: "#c8c89a", groundHorizon: "#8a7a4a", groundNadir: "#4a4430",
    envIntensity: 0.55,
    fogColor: "#c8a868", fogDensity: 0.0075, fogHeight: 6, fogStart: 10,
    hazeColor: "#c8d0b0", hazeDensity: 1 / 900,
    exposure: 1.0, saturation: 1.02, contrast: 1.26, warmth: 0.1, shadeWarmth: 0.14, vignette: 0, bloom: 0.5,
    rays: 0.95, warmBounce: 1.25,
  };
}

export function stageMurk(ctx: WorldCtx) {
  setMurkHaze(0.45);
  const api = ctx.shared.get("atmos") as AtmosLike | undefined;
  if (!api?.state?.apply) return;
  try { api.setPreset?.("midday"); } catch { /* keep */ }
  api.state.apply(murkPreset(api.state.preset));
}
