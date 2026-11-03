// Registry order = build order. atmos first (lights, environment), then ground, water, plants, POIs, then
// actors/weapons showcase. Each entry is a dynamic import so one area's broken file cannot take the others down.
// The boot (main.ts) starts EVERY import at once (network + parse overlap the CPU builds) and builds in this order.
import type { WorldModule } from "./module";
import type { PoiId } from "../../../shared/world/map";

type Loader = () => Promise<{ default: WorldModule }>;
const poi = (id: PoiId): [string, Loader] => [`poi:${id}`, () => import(`./pois/${id}/index.ts`)];

export const MODULES: Array<[string, Loader]> = [
  ["atmos", () => import("./atmos/index")],
  ["terrain", () => import("./terrain/index")],
  ["water", () => import("./water/index")],
  ["veg", () => import("./veg/index")],
  poi("peel-harbor"), poi("the-wreck"), poi("mango-market"), poi("stilt-town"), poi("coconut-cove"),
  poi("banana-temple"), poi("ripe-peak"), poi("mist-falls"), poi("lookout-point"), poi("peel-strip"),
  poi("the-plantation"), poi("cnvs-lab"), poi("the-murk"), poi("coco-caves"), poi("canopy-line"),
  poi("wreck-bay"), poi("lobby-islet"),
  ["exits", () => import("./exits/index")],   // cliff-stair exits out of low ground — shared/world/exits.ts
  ["showcase", () => import("../actors/showcase")],
  ["weapons-showcase", () => import("../weapons/showcase")],
  ["interiors", () => import("./pois/_kit/interior-showcase")],   // interiors area: int-* views (build is a no-op; stage builds)
  ["gameplay-stage", () => import("../game/stage")],
];

/**
 * Modules the GAME page builds before the title is ready (the title / lobby camera stands on the lobby islet looking
 * at the island; the warm-up plays on the islet). Every other module streams in right after the title is up, nearest
 * to the islet first. A module can override this with `priority` (module.ts).
 */
export const TITLE_MODULES = new Set(["atmos", "terrain", "water", "veg", "poi:lobby-islet", "showcase", "weapons-showcase", "gameplay-stage"]);
