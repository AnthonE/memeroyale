// Showcase staging for the weapons area's dev views. Each stage file in ./stages/ is self-contained and
// loaded independently (a broken file only loses its own views). Studio stages float in a white cyc in the sky above
// the lobby islet (only built when one of these stages is requested, so it never appears in gameplay or other views).
import * as THREE from "three";
import type { WorldModule } from "../world/module";
import type { CamSpec } from "../engine/views";
import { buildStudio, STUDIO, STUDIO_SCALE, type StageDef, type StageFile } from "./studio";

const FILES: Array<[string, () => Promise<{ default: StageFile }>]> = [
  ["guns", () => import("./stages/guns")],
  ["chests", () => import("./stages/chests")],
  ["heals", () => import("./stages/heals")],
  ["ground-loot", () => import("./stages/ground-loot")],
  ["fx", () => import("./stages/fx")],
  ["vm", () => import("./stages/vm")],
  ["supply", () => import("./stages/supply")],
];

const loadErrors: string[] = [];
const settled = await Promise.allSettled(FILES.map(([, f]) => f()));
const stages: Record<string, StageDef> = {};
const views: Record<string, CamSpec> = {};
settled.forEach((s, i) => {
  if (s.status === "fulfilled") { Object.assign(stages, s.value.default.stages); Object.assign(views, s.value.default.views); }
  else loadErrors.push(`weapons stage file ${FILES[i][0]}: ${String(s.reason).slice(0, 300)}`);
});

let stageRoot: THREE.Group | null = null;
const updaters: Array<(dt: number, t: number) => void> = [];

const mod: WorldModule = {
  id: "weapons-showcase",
  build(ctx) {
    for (const e of loadErrors) console.error(e);
    ctx.onUpdate((dt, t) => {
      for (const u of updaters) u(dt, t);
    });
  },
  views,
  async stage(ctx, stage) {
    const def = stages[stage];
    if (!def) return;
    const studio = def.origin === "studio";
    if (studio) buildStudio(ctx, def.light);
    if (stageRoot) stageRoot.removeFromParent();
    updaters.length = 0;
    stageRoot = new THREE.Group(); stageRoot.name = "weapons-stage";
    stageRoot.position.copy(studio ? STUDIO : (def.origin as THREE.Vector3));
    if (studio) stageRoot.scale.setScalar(STUDIO_SCALE);
    ctx.scene.add(stageRoot);
    stageRoot.updateMatrixWorld(true);
    await def.build(ctx, stageRoot, (fn) => updaters.push(fn));
    // the atmos material patch (sun light, shadows, haze) for everything the stage built — without it the stage's PBR
    // materials see only the IBL (the atmos sun is a custom light unpatched materials ignore)
    const atmos = ctx.shared.get("atmos") as { sweep?: () => number } | undefined;
    atmos?.sweep?.();
  },
};
export default mod;
