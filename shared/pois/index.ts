// Every POI's static colliders, for the server and client prediction. Add nothing here by hand — each POI exports
// `colliders` from shared/pois/<id>.ts and is listed once below.
import type { Box } from "../world/colliders";
import * as peelHarbor from "./peel-harbor";
import * as theWreck from "./the-wreck";
import * as mangoMarket from "./mango-market";
import * as stiltTown from "./stilt-town";
import * as coconutCove from "./coconut-cove";
import * as bananaTemple from "./banana-temple";
import * as ripePeak from "./ripe-peak";
import * as mistFalls from "./mist-falls";
import * as lookoutPoint from "./lookout-point";
import * as peelStrip from "./peel-strip";
import * as thePlantation from "./the-plantation";
import * as cnvsLab from "./cnvs-lab";
import * as theMurk from "./the-murk";
import * as cocoCaves from "./coco-caves";
import * as canopyLine from "./canopy-line";
import * as wreckBay from "./wreck-bay";
import * as lobbyIslet from "./lobby-islet";

const ALL = [peelHarbor, theWreck, mangoMarket, stiltTown, coconutCove, bananaTemple, ripePeak, mistFalls, lookoutPoint,
  peelStrip, thePlantation, cnvsLab, theMurk, cocoCaves, canopyLine, wreckBay, lobbyIslet];

export function allColliders(): Box[] {
  return ALL.flatMap((m) => m.colliders);
}

export function allClearings() {
  return ALL.flatMap((m) => m.clearings);
}

/** designed loot (`LOOT_SPOTS` contract) of the POIs that export it, by POI id (= the module file name).
 * shared/sim/loot.ts placeLoot reads it; a POI without it keeps the random scatter. */
export type LootSpots = { chests: Array<[number, number, number, number]>; floor: Array<[number, number, number]>;
  /** indices into `chests`: the POI's PAYOFF chests (a vault dais) — always on, a Rare Chest, even inside a room */
  hero?: number[] };
const IDS = ["peel-harbor", "the-wreck", "mango-market", "stilt-town", "coconut-cove", "banana-temple", "ripe-peak", "mist-falls",
  "lookout-point", "peel-strip", "the-plantation", "cnvs-lab", "the-murk", "coco-caves", "canopy-line", "wreck-bay", "lobby-islet"];
export function lootSpotsById(): Record<string, LootSpots> {
  const out: Record<string, LootSpots> = {};
  ALL.forEach((m, i) => { const ls = (m as { LOOT_SPOTS?: LootSpots }).LOOT_SPOTS; if (ls && (ls.chests?.length || ls.floor?.length)) out[IDS[i]] = ls; });
  return out;
}
/** every POI's interiors-kit rooms (`INTERIOR_ROOMS`), by POI id — the loot generator's room
 * units (shared/sim/loot-spots.ts: every enterable room gets loot by design). Read-only; a POI without them is skipped. */
export type KitRoomLite = { id?: string; x: number; y: number; z: number; yaw: number; w: number; d: number; h: number; openings: Array<{ kind: string }> };
export function interiorRoomsById(): Record<string, KitRoomLite[]> {
  const out: Record<string, KitRoomLite[]> = {};
  // + LOOT_ROOMS: rooms a POI draws itself (e.g. the Wreck Bay galleon's listed cabins) declared in world frame
  // for the loot census only — never built by the client, never collided
  ALL.forEach((m, i) => { const r = [...((m as { INTERIOR_ROOMS?: KitRoomLite[] }).INTERIOR_ROOMS ?? []), ...((m as { LOOT_ROOMS?: KitRoomLite[] }).LOOT_ROOMS ?? [])]; if (r.length) out[IDS[i]] = r; });
  return out;
}
/** a POI's HOT loot zones (`LOOT_HOT`): an enterable building whose centre lies in a zone is a HOT building
 * (shared/sim/loot-spots.ts roomUnits: `chests` chest spots per storey, `roof` on its roof, ~70 % live, hot rarity) —
 * the POI's payoff buildings (the CNVS Lab server hall, the Wreck Bay galleon), whatever their size */
export type HotZone = { x: number; z: number; r: number; chests: number; roof: number };
export function hotZonesById(): Record<string, HotZone[]> {
  const out: Record<string, HotZone[]> = {};
  ALL.forEach((m, i) => { const z = (m as { LOOT_HOT?: HotZone[] }).LOOT_HOT; if (z?.length) out[IDS[i]] = z; });
  return out;
}
