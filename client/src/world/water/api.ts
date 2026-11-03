// Water API published on ctx.shared.get("water") by the water module (builds after atmos + terrain, before veg/POIs).
// Other areas use it for buoyancy, wading, splash placement and to request foam around things they put in the water
// (piers, pilings, rocks, hulls, quay walls). Always call defensively:
//   const water = ctx.shared.get("water") as WaterApi | undefined; water?.registerFoamCircle(x, z, 1.2);
import type * as THREE from "three";

export interface WaterApi {
  /** mean sea level (metres) — the world contract says 0 */
  readonly level: number;
  /** water column above the terrain at (x, z): + in water, − on land */
  depthAt(x: number, z: number): number;
  /** signed distance to the shoreline in metres: + in water, − on land */
  shoreDistanceAt(x: number, z: number): number;
  /** animated surface height (swell) at (x, z) — matches the vertex shader (used for buoyancy / wading). t = ctx time */
  surfaceAt(x: number, z: number, t: number): number;
  /** foam disc (soft edge) — pilings, rocks, buoys, splashes. strength 0..1 */
  registerFoamCircle(x: number, z: number, r: number, strength?: number): void;
  /** foam along a segment (round caps) — quay walls, pier edges, beams lying in the water */
  registerFoamCapsule(x1: number, z1: number, x2: number, z2: number, r: number, strength?: number): void;
  /** foam RING around a yaw-rotated box footprint (half extents hx, hz) — hulls, containers, platforms. ring = band width */
  registerFoamRect(x: number, z: number, hx: number, hz: number, yaw: number, ring?: number, strength?: number): void;
  /** remove every registered foam shape */
  clearFoam(): void;
  /** re-run the automatic waterline-intersection foam bake (props that cross y≈0 get foam rings without any call;
   *  the bake also re-runs by itself when the scene's mesh count changes during the first ~30 s) */
  rebakeObstacles(): void;
  /** true while the main camera is below the surface */
  isUnderwater(): boolean;
  /** INTERACTIVE WATER (48 m window around the camera): push the surface at (x, z) — radius r (m), strength s (m:
   *  ~0.01–0.03 per frame for a wading kong's wake, 0.1–0.3 for impacts), foam 0..1. Rings spread at ~1.3 m/s. */
  disturb(x: number, z: number, r: number, s: number, foam?: number): void;
  /** convenience: an impact splash (bullet ≈ 0.4, body landing ≈ 1, rocket ≈ 2) — crater ring + foam */
  splash(x: number, z: number, size?: number): void;
  /** live tuning: uniforms of the water material (uShallow, uMid, uDeep, uWaveAmp, uAbsorb, uCausticsStrength …) */
  uniforms: Record<string, THREE.IUniform>;
  material: THREE.Material;
  mesh: THREE.Mesh;
}
