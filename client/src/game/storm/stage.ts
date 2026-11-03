// Staging for the storm view cameras. Cameras are fixed compositions; stageStorm places the circle for each
// shot and returns the visual (game/stage.ts wires update + the viewmodel).
import * as THREE from "three";
import type { WorldCtx } from "../../engine/engine";
import type { CamSpec } from "../../engine/views";
import type { StormVisual } from "./api";
import { createStormVisual } from "./index";

const V = (pos: CamSpec["pos"], target: CamSpec["target"], o: Partial<CamSpec> = {}): CamSpec => ({ pos, target, fov: 50, ...o });

export const views: Record<string, CamSpec> = {
  // the east-coast beach looking south with the sun behind (atmos sun is north-west): turquoise sea + sunny sky on the
  // left, the storm front on the land side (right), leaning over the beach and curving across far ahead
  // (no foreground rock, palms framing the right, the front leaning over the beach)
  "storm-01-wall": V([818, 2.0, -292], [960, 75, 150], { fov: 66, rel: true, stage: "storm-wall:90:0:0.05:2600" }),
  // the whole island inside the first ring (the phase-2 ring cuts across the north-west coast):
  // 2 km out, 35° down (an oblique ring)
  "storm-02-aerial": V([-70, 1150, 1548], [-70, 0, -90], { fov: 45, stage: "storm-aerial" }),
  // a jungle trail with a sky gap and bolts over it (the cove edge spot was
  // a flat lawn) ~190 m outside a late circle, looking toward the warm gap
  "storm-03-inside": V([-664, 1.7, 48], [-848, 28, 126], { fov: 78, rel: true, stage: "storm-inside" }),
  // in-match probes (diagnostic, not composed; known failure spots): the wall straight ahead at a set distance from the damage
  // circle (stage "storm-probe:<R>:<metres outside the face, negative = inside the storm>")
  "storm-x-near": V([830, 1.7, -262], [900, 25, -60], { fov: 72, rel: true, stage: "storm-probe:900:60" }),
  "storm-x-face": V([830, 6, -262], [900, 12, -60], { fov: 80, rel: true, stage: "storm-probe:900:6" }),
  "storm-x-in": V([830, 6, -262], [900, 10, -60], { fov: 80, rel: true, stage: "storm-probe:900:-14" }),
  "storm-x-up": V([830, 6, -262], [900, 90, -60], { fov: 80, rel: true, stage: "storm-probe:900:-60" }),
  "storm-x-air": V([830, 200, -262], [900, 60, -60], { fov: 72, rel: true, stage: "storm-probe:900:-150" }),
  "storm-x-far": V([830, 1.7, -262], [900, 60, -60], { fov: 72, rel: true, stage: "storm-probe:1400:450" }),
};

export async function stageStorm(ctx: WorldCtx, stage: string): Promise<StormVisual> {
  const storm = createStormVisual(ctx);
  // circles are placed relative to the (already applied) view camera, so the framing survives camera tweaks
  const cam = ctx.camera, f = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const right = new THREE.Vector3(-f.z, 0, f.x), left = right.clone().negate(), p = cam.position;
  if (stage.startsWith("storm-probe:")) {
    // the damage circle straight ahead, its face `off` metres in front of the camera (negative: we are inside the storm)
    const [, rS, offS] = stage.split(":"); const R = Number(rS), off = Number(offS);
    // off ≥ 0: we stand in the safe zone, the centre is behind us; off < 0: we stand in the storm facing the safe zone
    const c = off >= 0 ? p.clone().addScaledVector(f, off - R) : p.clone().addScaledVector(f, R - off);
    c.setY(0);
    storm.set({ cx: c.x, cz: c.z, r: R, tx: c.x, tz: c.z, tr: R * 0.7, shrinking: true, phase: 3 });
  } else if (stage.startsWith("storm-wall")) {
    // the face comes in from the right, `side` m off the camera, and runs away across the view toward the far left
    // (tilt = how much it turns left); centre out on the safe side. storm-wall:<side>:<fwd>:<tilt>:<R>
    const [, sS, fS, tS, rS] = stage.split(":");
    const R = Number(rS || 2600), side = Number(sS || 175), fw = Number(fS || 40), tilt = Number(tS || 0.1);
    const p1 = p.clone().addScaledVector(right, side).addScaledVector(f, fw);
    const t = f.clone().addScaledVector(left, tilt).normalize();
    const c = p1.clone().addScaledVector(new THREE.Vector3(t.z, 0, -t.x).dot(left) > 0 ? new THREE.Vector3(t.z, 0, -t.x) : new THREE.Vector3(-t.z, 0, t.x), R);
    storm.set({ cx: c.x, cz: c.z, r: R, tx: c.x, tz: c.z, tr: R - 150, shrinking: true, phase: 3 });
  } else if (stage === "storm-aerial") {
    storm.set({ cx: -70, cz: -90, r: 1170, tx: -70, tz: -90, tr: 820, shrinking: true, phase: 1 });
  } else {
    // ~190 m outside a small late-game circle straight ahead: the warm gap is where the camera looks
    const R = 190, c = p.clone().addScaledVector(f, R + 190);
    storm.set({ cx: c.x, cz: c.z, r: R, tx: c.x, tz: c.z, tr: 110, shrinking: true, phase: 5 });
    storm.flash(0.6);
  }
  return storm;
}
