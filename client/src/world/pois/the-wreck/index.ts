// POI THE WRECK — the beached BANANA CO. freighter, broken in two on the west reef, containers spilled across the
// shallows and the beach. Layout + colliders: shared/pois/the-wreck.ts (hull sections, spill, rocks, ramps).
// Parts: freighter.ts (both hull halves), dressing.ts (rocks, banana piles, vines, plants, bluff, gulls).
// View camera poi-02-the-wreck: on the north beach at eye level looking SSW out to sea — the bow half left (beached,
// BANANA CO. on its flank), the stern half right, open water + horizon between the torn ends, spill in front.
import * as THREE from "three";
import type { WorldModule } from "../../module";
import type { CamSpec } from "../../../engine/views";
import { BOW, BOW_ROOMS, CONTAINERS, STERN, STERN_ROOMS, deckBoxPlacements, deckY, houseInner, sectionToWorld } from "../../../../../shared/pois/the-wreck";
import { buildInteriors } from "../_kit/interior";
import { harborMatsAsync } from "../_kit/harbor-materials";
import { containerTexAsync } from "../_kit/containers-tex";
import { farBakeStandInAsync, freezeStatic } from "../_kit/harbor-geo";
import { ContainerKit } from "../_kit/containers";
import { prepareBananaSkin, useBananaRenderer } from "../_kit/harbor-bananas";
import { HarborLod } from "../peel-harbor/lod";
import { buildFreighter } from "./freighter";
import { dressWreck } from "./dressing";

/** a camera from section-local points (eye 1.7 m over the deck at (x, z), looking at (tx, ty, tz)) */
const onDeck = (sec: typeof BOW, x: number, z: number, tx: number, ty: number, tz: number, fov: number, note: string): CamSpec => {
  const p = sectionToWorld(sec, x, deckY(sec, x) + 1.7, z), t = sectionToWorld(sec, tx, ty, tz);
  return { pos: [p[0], p[1], p[2]], target: [t[0], t[1], t[2]], fov, note };
};
const views: Record<string, CamSpec> = {
  "poi-02-the-wreck": { pos: [-831.5, 7.8, 63.5], target: [-875, 2.6, 138.8], fov: 51, note: "on the bamboo lookout at the top of the beach (kong eye on the deck), looking SSW: bow half broadside left (BANANA CO., stem buried in the sand), stern half right with its torn end toward us, sea between the breaks, spill across the beach + lagoon" },
  "wip-wreck-aerial": { pos: [-770, 80, 60], target: [-885, 0, 140], fov: 55, note: "both halves + spill from above the beach" },
  "wip-wreck-break": { pos: [-872, 4, 118], target: [-893, 6, 142], fov: 62, note: "into the stern half's torn end from the shallows" },
  "wip-wreck-deck": onDeck(BOW, 52.5, -6.8, 30, 24, 0, 68, "kong eye on the bow half's tilted deck, looking up the slope at the house + funnel"),
  "wip-wreck-stern-deck": onDeck(STERN, 14, 2, 36, 22, 0, 66, "kong eye on the stern deck: hatch, vents, bollards, the house with its gutted rooms"),
  "wip-wreck-sea": { pos: [-977, 3.5, 94.3], target: [-944.7, 3, 120], fov: 55, note: "from the sea: the stern's counter, rudder + propeller" },
  "wip-wreck-spill": { pos: [-834, 3.2, 80], target: [-850, 0.8, 104], fov: 60, note: "open containers + banana heaps on the beach" },
  "wip-wreck-heap": { pos: [-845, 3.5, 102], target: [-872, 1.5, 127], fov: 58, note: "the heap under the break" },
  "wip-wreck-letters": { pos: [-846, 3.4, 118], target: [-862, 8, 150], fov: 50, note: "THE FEED letters on the bow flank, 35 m" },
};

// eye level inside the stern house (section-local corner → opposite corner)
for (const l of [0, 1, 2]) {
  const I = houseInner(STERN, l), p = sectionToWorld(STERN, I.x0 + 0.6, I.y0 + 1.7, -I.hw + 0.6), t = sectionToWorld(STERN, I.x1, I.y0 + 0.9, I.hw * 0.5);
  views[`wip-wreck-room-${l}`] = { pos: [p[0], p[1], p[2]], target: [t[0], t[1], t[2]], fov: 75, note: `eye level in the stern house, level ${l}` };
}
views["wip-wreck-torn"] = { pos: [-893.5, 21.2, 138], target: [-900, 20.1, 138], fov: 70, note: "the stern's torn rooms from the tear" };

const mod: WorldModule = {
  id: "poi:the-wreck",
  views,
  async build(ctx) {
    const group = new THREE.Group();
    group.name = "the-wreck";
    ctx.scene.add(group);
    performance.mark("the-wreck:build:start"); performance.mark("the-wreck:part:mats");
    // (the harbor + container textures are painted in worker threads meanwhile)
    const [mats] = await Promise.all([harborMatsAsync(), containerTexAsync()]);
    useBananaRenderer(ctx.renderer);
    await prepareBananaSkin(() => ctx.yield());
    const lod = new HarborLod(group);
    const kit = new ContainerKit();
    kit.logoStyle = "white";
    kit.weathered = 0.35;
    kit.addMany(CONTAINERS);
    // containers still riding on the decks (same placements as their colliders)
    kit.addMany(deckBoxPlacements());
    // one bucket per size/open (the default 64 m cells gave 40 draw calls for ~50 boxes)
    performance.mark("the-wreck:part:containers");
    // (no mid level — the LOD box traces its corrugation per pixel)
    const set = await kit.buildAsync({ name: "wreck-containers", lod: 26, midLod: 0, cell: 4096 }, () => ctx.yield());
    group.add(set);
    lod.containers(set);
    performance.mark("the-wreck:part:freighter");
    try { await buildFreighter({ ctx, mats, kit, group, lod }); } catch (e) { console.error("[the-wreck] freighter failed", e); }
    await ctx.yield();
    performance.mark("the-wreck:part:dressing");
    try { await dressWreck({ ctx, mats, kit, group, lod }); } catch (e) { console.error("[the-wreck] dressing failed", e); }
    await ctx.yield();
    performance.mark("the-wreck:part:rooms");
    // the stern house's rooms, furnished by the shared interiors kit, built in a frame that carries the stern
    // section's transform (they list with the wreck; the colliders are fitted the same way — sternRoomBoxes)
    // (the bow house too — BOW_ROOMS; each level's three rooms in their own call so the build stays sliced)
    for (const [S, rooms, nm] of [[STERN, STERN_ROOMS, "stern"], [BOW, BOW_ROOMS, "bow"]] as const) {
      const sec = new THREE.Object3D(); sec.name = `wreck-${nm}-rooms-frame`;
      sec.position.set(S.x, S.y, S.z);
      sec.quaternion.setFromEuler(new THREE.Euler(S.roll, S.yaw, S.pitch, "YZX"));
      ctx.scene.add(sec); sec.updateMatrixWorld(true);
      const byLevel = new Map<string, typeof rooms[number][]>();
      for (const r of rooms) { const k = (r.id ?? "").replace(/[afm]$/, ""); byLevel.set(k, [...(byLevel.get(k) ?? []), r]); }
      for (const [k, rs] of byLevel) {
        try { await buildInteriors(ctx, rs, { parent: sec, name: `wreck-${k}-rooms`, maxDist: 90 }); } catch (e) { console.error("[the-wreck] rooms failed", e); }
        await ctx.yield();
      }
    }
    // every static caster goes into the far shadow map through ONE force-shown stand-in (LOD / off-screen culling
    // of the live groups can no longer drop parts of the POI from the far map)
    performance.mark("the-wreck:part:finish");
    await farBakeStandInAsync(group, () => ctx.yield());
    await ctx.yield();
    await lod.finishAsync(() => ctx.yield());
    // (perf: the wreck is static — the gulls animate through instance matrices — so bake every object matrix once)
    freezeStatic(group);
    performance.mark("the-wreck:build:end");
    ctx.onUpdate(() => lod.update(ctx.camera));
  },
};
export default mod;
