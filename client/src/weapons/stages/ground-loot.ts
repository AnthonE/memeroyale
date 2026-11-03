// loot-05-ground-loot: floor loot with rarity beams inside a stilt hut.
import { createLootView } from "../loot";
import { buildHut } from "../hut";
import { HUT, stageCam, type StageDef, type StageFile } from "../studio";

const stages: Record<string, StageDef> = {
  "ground-loot": {
    origin: HUT,
    build(ctx, root, onUpdate) {
      // warm late-morning sun from the left-back, low enough to rake through the slats (the target art's floor stripes)
      const atmos = ctx.shared.get("atmos") as { state: { preset: Record<string, unknown>; apply(p: unknown): void } } | undefined;
      // a dark interior (low sky fill, no warm multi-bounce reddening the planks) lit by hard warm sun slats
      if (atmos) atmos.state.apply({ ...atmos.state.preset, sunElev: 30, sunAz: 250, sunColor: "#ffd8a0", sunIntensity: 7.5, envIntensity: 0.22, warmBounce: 0.25, warmth: 0.05, saturation: 1.12, exposure: 1.05 });
      const hut = buildHut(ctx);
      root.add(hut.root);
      const items: Array<[Parameters<typeof createLootView>[2], Parameters<typeof createLootView>[3], number, number, number]> = [
        ["ammo", "uncommon", -1.35, 0, 0.8], ["smg", "rare", -0.1, 0, 0.55], ["smoothie", "epic", 1.2, 0, 0.9],
      ];
      for (const [item, rarity, x, y, z] of items) {
        // items at 1.3×; the gun turned so its side profile faces the camera
        const l = createLootView(ctx, hut.floorY, item, rarity, { grounded: true, scale: 1.3 });
        l.object.position.set(x, hut.floorY + y, z);
        root.add(l.object);
        onUpdate((dt, t) => l.update(dt, t));
      }
    },
  },
};

const file: StageFile = { stages, views: { "loot-05-ground-loot": stageCam([0.1, 1.25, 2.9], [0.25, 0.7, -2.0], 60, "ground-loot", HUT) } };
export default file;
