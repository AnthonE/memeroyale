// gear-01-heals: the three heals on the studio sheet, ¾ views like the target art. One look:
// the real in-game PBR items under the studio key light (no toon / outline pass). Dev: wpn-heal-<id> (one item, close).
import * as THREE from "three";
import type { CamSpec } from "../../engine/views";
import { buildCoconut, buildHeal, HEAL_ORDER } from "../heals";
import { stageCam, type StageDef, type StageFile } from "../studio";

// the items fill about 60 % of the target art's frame: centres + sizes measured on the target art (x at 0.115 /
// 0.355 / 0.61 / 0.87 of the width, cup + husk ≈ 0.48 of the band height, the banana 0.74)
// [x, yaw, scale, tilt] — the leaf parcel is tipped toward the camera (the target art shows its top face + the patch),
// the golden banana bigger (target art: 0.65 of the band height)
// (in HEAL_ORDER: leaf bundle, smoothie, golden banana)
const LAYOUT: Array<[number, number, number, number]> = [[-0.62, -0.55, 1.75, 0.55], [0.02, -0.35, 1.7, 0], [0.62, -0.25, 1.5, 0]];

const stages: Record<string, StageDef> = {
  heals: {
    origin: "studio",
    build(_ctx, root) {
      // the target art's FOUR items in its order — smoothie, coconut (studio-only, see heals.ts buildCoconut),
      // leaf bundle, golden banana — at the target art's x stations (0.115 / 0.355 / 0.61 / 0.87 of the width)
      const items: Array<[() => THREE.Object3D, number, number, number, number]> = [
        [() => buildHeal("smoothie").root, -0.8, 0.05, 1.62, 0],
        [() => buildCoconut().root, -0.29, -0.3, 1.5, 0],
        [() => buildHeal("leaf-bundle").root, 0.25, -0.55, 1.55, 0.55],
        [() => buildHeal("golden-banana").root, 0.8, -0.25, 1.42, 0],
      ];
      for (const [mk, x, ry, sc, rx] of items) {
        const holder = new THREE.Group();
        holder.add(mk());
        holder.position.set(x, 0.0, 0); holder.rotation.set(rx, ry, 0, "YXZ"); holder.scale.setScalar(sc);
        root.add(holder);
        // tipped items rest on their lowest point
        if (rx) { root.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(holder); const lo = root.worldToLocal(bb.min.clone()).y; holder.position.y -= lo; }
      }
      void LAYOUT;
    },
  },
};
// a little more from above (the target art sees the smoothie's surface and the parcel's top)
const views: Record<string, CamSpec> = { "gear-01-heals": stageCam([0, 1.32, 2.45], [0, 0.32, 0], 26, "heals") };
HEAL_ORDER.forEach((id, i) => {
  stages[`heal-${id}`] = {
    origin: "studio",
    build(_ctx, root) {
      const holder = new THREE.Group(); holder.add(buildHeal(id).root);
      holder.rotation.y = LAYOUT[i]?.[1] ?? -0.3; holder.scale.setScalar(2.2);   // (the red banana has no sheet slot)
      root.add(holder);
    },
  };
  views[`wpn-heal-${id}`] = stageCam([0, 1.05, 2.3], [0, 0.5, 0], 24, `heal-${id}`);
});

const file: StageFile = { stages, views };
export default file;
