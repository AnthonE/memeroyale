// View cameras: fixed cameras (`?view=<id>`) used for screenshots and visual regression; POI layouts are composed for them.
// Every view has an id and a fixed framing, so `node tools/shot.mjs <id>` produces a like-for-like frame between builds.
// These are rough defaults. A module refines its views by exporting `views` —
// a module view with the same id overrides the default. Keep the view's composition: subject placement, height,
// lens, what is foreground/background.
import * as THREE from "three";
import type { Terrain } from "../../../shared/world/terrain";

export interface CamSpec {
  pos: [number, number, number];
  target: [number, number, number];
  /** vertical fov in degrees (default 50) */
  fov?: number;
  /** when true, pos[1] and target[1] are metres ABOVE the terrain at their xz (never below sea level) */
  rel?: boolean;
  /** animation time to freeze at (water, wind, clouds) — default 12 */
  t?: number;
  /** free-form hints for the gameplay layer (e.g. { actors: "firefight" }) */
  stage?: string;
  note?: string;
}

const V = (pos: CamSpec["pos"], target: CamSpec["target"], o: Partial<CamSpec> = {}): CamSpec => ({ pos, target, fov: 50, ...o });

export const DEFAULT_VIEWS: Record<string, CamSpec> = {
  // island & map
  "island-01-master-aerial": V([60, 1250, 1500], [-20, 0, -40], { fov: 42 }),
  "island-03-approach": V([380, 820, 2300], [0, 0, 0], { fov: 58 }),
  // POIs (one wide view each)
  "poi-01-peel-harbor": V([540, 48, 640], [600, 12, 330], { fov: 52 }),
  "poi-02-the-wreck": V([-1010, 45, 170], [-800, 6, 90], { fov: 50 }),
  "poi-03-ripe-peak": V([-230, 105, -290], [-380, 170, -430], { fov: 55 }),
  "poi-04-banana-temple": V([-40, 2.2, -30], [-40, 20, -150], { fov: 60, rel: true }),
  "poi-05-coconut-cove": V([90, 38, 590], [90, 8, 400], { fov: 50 }),
  "poi-06-stilt-town": V([330, 7, -190], [330, 5, -330], { fov: 55 }),
  "poi-07-the-plantation": V([-230, 4, 400], [-230, 6, 240], { fov: 55, rel: true }),
  "poi-08-cnvs-lab": V([150, 20, -380], [150, 8, -480], { fov: 55, rel: true }),
  "poi-09-mist-falls": V([-140, 12, -310], [-140, 30, -420], { fov: 60, rel: true }),
  "poi-10-peel-strip": V([-470, 24, 70], [-470, 2, -120], { fov: 55, rel: true }),
  "poi-11-lookout-point": V([-430, 75, 570], [-590, 50, 470], { fov: 50 }),
  "poi-12-mango-market": V([430, 22, 150], [430, 2, 20], { fov: 55, rel: true }),
  "poi-13-the-murk": V([560, 6, -110], [560, 3, -220], { fov: 60 }),
  "poi-14-coco-caves": V([-700, 4, -270], [-720, 3, -290], { fov: 70, rel: true }),
  "poi-15-canopy-line": V([160, 30, -130], [160, 20, -250], { fov: 60, rel: true }),
  "poi-16-wreck-bay": V([40, 30, -890], [40, 3, -700], { fov: 50 }),
  // biomes (ground level)
  "biome-01-beach": V([240, 1.7, 485], [120, 3, 430], { fov: 60, rel: true }),
  "biome-02-jungle": V([120, 1.7, -40], [150, 3, -90], { fov: 65, rel: true }),
  "biome-03-highlands": V([-140, 2, 40], [-60, 6, 220], { fov: 60, rel: true }),
  "biome-04-volcanic": V([-270, 2, -290], [-380, 150, -430], { fov: 60, rel: true }),
  "biome-05-sea-cliffs": V([-700, 3, 360], [-600, 10, 520], { fov: 60, rel: true }),
  "biome-06-river": V([-100, 3, -330], [-140, 5, -400], { fov: 60, rel: true }),
  // sky / storm (atmosphere + gameplay)
  "sky-01-dawn": V([300, 40, 700], [-200, 60, -300], { fov: 60 }),
  "storm-02-aerial": V([0, 1600, 1300], [0, 0, -50], { fov: 45, stage: "storm-aerial" }),
  "storm-01-wall": V([150, 2, 470], [0, 30, 300], { fov: 65, rel: true, stage: "storm-wall" }),
  // characters, loot, gear — staged on the lobby islet (0, 1020)
  "char-03-firefight": V([640, 1.4, 590], [700, 2, 560], { fov: 65, rel: true, stage: "firefight" }),
  "char-05-third-person": V([330, 2.2, -120], [330, 2, -200], { fov: 70, rel: true, stage: "third-person" }),
  "loot-01-crate-closed": V([3, 2.2, 1024], [0, 0.6, 1020], { fov: 35, rel: true, stage: "loot-closed" }),
  "loot-02-crate-open": V([3, 2.2, 1024], [0, 0.6, 1020], { fov: 35, rel: true, stage: "loot-open" }),
  "loot-03-rarity-lineup": V([0, 3, 1030], [0, 0.6, 1020], { fov: 40, rel: true, stage: "loot-lineup" }),
  "loot-05-ground-loot": V([0, 1.6, 1024], [0, 0.2, 1020], { fov: 60, rel: true, stage: "ground-loot" }),
  "gear-01-heals": V([0, 1.6, 1023], [0, 0.6, 1020], { fov: 35, rel: true, stage: "heals" }),
  "gear-03-weapons": V([0, 1.8, 1024], [0, 1.0, 1020], { fov: 40, rel: true, stage: "weapons" }),
  "drop-01-plane-exterior": V([100, 420, 1600], [0, 400, 1500], { fov: 50, stage: "plane" }),
  "drop-05-glider": V([200, 90, 60], [220, 100, 20], { fov: 55, stage: "glider" }),
  "ui-01-hud": V([240, 1.7, 485], [120, 2, 430], { fov: 75, rel: true, stage: "hud" }),
};

export function applyView(cam: THREE.PerspectiveCamera, spec: CamSpec, terrain: Terrain) {
  const ground = (x: number, z: number) => Math.max(0, terrain.height(x, z));
  const p = spec.pos.slice() as number[], t = spec.target.slice() as number[];
  if (spec.rel) { p[1] += ground(p[0], p[2]); t[1] += ground(t[0], t[2]); }
  cam.position.set(p[0], p[1], p[2]);
  cam.fov = spec.fov ?? 50;
  cam.up.set(0, 1, 0);
  cam.lookAt(t[0], t[1], t[2]);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

/** ?cam=x,y,z,tx,ty,tz[,fov] */
export function parseCam(s: string): CamSpec | null {
  const v = s.split(",").map(Number);
  if (v.length < 6 || v.some((x) => !Number.isFinite(x))) return null;
  return { pos: [v[0], v[1], v[2]], target: [v[3], v[4], v[5]], fov: v[6] || 55 };
}
