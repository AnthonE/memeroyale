// Vegetation API published on ctx.shared.get("veg") by the veg module (which builds BEFORE every POI).
// POIs use it to dress their grounds with the same palms/bushes as the rest of the island, so everything matches.
// Always call defensively: `(ctx.shared.get("veg") as VegApi | undefined)?.plant(...)`.
import type * as THREE from "three";

export type PlantKind = "palm" | "palm-leaning" | "jungle-tree" | "bush" | "fern" | "monstera" | "banana-plant" | "flowers" | "grass" | "bamboo" | "mangrove" | "log" | "groundcover" | "vine";

/** veg quality tier (the video settings' "foliage" / view distance) */
export type VegQuality = "low" | "medium" | "high" | "epic";
export interface VegQualityState {
  tier: VegQuality;
  /** LOD / detail / shrink-band distance multiplier (1 = high) */
  dist: number;
  /** fraction of the small plants (grass, ferns, flowers, ground cover) kept */
  density: number;
  /** which vegetation meshes cast sun shadows: every LOD0 caster, only trees + palms, none */
  shadows: "all" | "trees" | "none";
}

/** the video settings as an object: `density` / `foliage` = small-plant density + shadow casting tier, `distance` /
 *  `viewDist` = LOD / shrink-band distance tier (either may be a tier name or a raw number) */
export interface VegQualityInput {
  density?: VegQuality | number; foliage?: VegQuality;
  distance?: VegQuality | number; viewDist?: VegQuality;
}

export interface VegApi {
  /** add instances; each matrix is a world transform (scale 1 = the species' natural size) */
  plant(kind: PlantKind, transforms: THREE.Matrix4[]): void;
  /** apply a quality tier live (distances, small-plant density, shadow casting); returns what is in effect.
   *  Trees and palms are drawn to the horizon on every tier (impostors) — nothing ever pops. */
  setQuality?(tier: VegQuality | VegQualityInput): VegQualityState;
}
