// ===================================================================================================================
// LADDERS — every ladder placed on the island, in ONE file (kept out of the POI layout files on purpose, so changes to
// a POI's stairs / ceilings and to its ladders stay independent).
// A ladder = a climb line on a face (shared/sim/climb.ts): foot x / z ON the face, bottom / top feet height, the face's
// outward normal. Placed with probe tools against the static colliders; the sim (shared/sim/player.ts
// PS.Climb) and the visuals (client/src/game/climb-views.ts) read this list.
// ===================================================================================================================
import { ladder, type Climb } from "../sim/climb";
import type { Box } from "../world/colliders";

/** a ladder's look: rope + bamboo rungs (stilt huts, the Murk), rope + wood (the wreck: a cargo net-ish pilot ladder) */
export interface LadderDef { c: Climb; poi: string; style: "bamboo" | "pilot" }

const L = (poi: string, style: LadderDef["style"], x: number, z: number, y0: number, y1: number, nx: number, nz: number): LadderDef => ({ poi, style, c: ladder(x, z, y0, y1, nx, nz) });

export const LADDERS: LadderDef[] = [
  // STILT TOWN — up from the lagoon onto the high walkways the swim-out can't reach (≥ 2.5 m), and from the decks onto hut roofs
  L("stilt-town", "bamboo", 348, -340.45, -1.15, 3.08, 0, -1),
  L("stilt-town", "bamboo", 356.25, -356, -1.15, 3.0, -1, 0),
  L("stilt-town", "bamboo", 316, -391.86, 2.2, 5.39, 0, -1),
  L("stilt-town", "bamboo", 384.18, -356, 2.55, 5.76, -1, 0),
  L("stilt-town", "bamboo", 363.75, -380, 2.2, 8.27, 1, 0),
  // THE MURK — the two-storey stilt buildings: straight up the wall onto the flat roofs
  L("the-murk", "bamboo", 601.871, -189.685, 1.85, 8.9, -0.83, 0.558),    // BAIT & TACKLE, from the side deck
  L("the-murk", "bamboo", 618.865, -250.113, 0.314, 9.3, 0.581, -0.814),  // STILT HOUSE, from the swamp
  // THE WRECK — pilot ladders down the hull into the water: onto the bow's deck along the reef side, and BOTH sides of
  // the stern half (the BANANA CO. bow's two tops hook over its 15° deck edge, 5.32 / 9.59)
  L("the-wreck", "pilot", -852.07, 144.06, -1.14, 5.32, 0.437, -0.899),
  L("the-wreck", "pilot", -866.34, 136.56, -1.15, 9.59, 0.437, -0.899),
  L("the-wreck", "pilot", -933.96, 109.91, -1.15, 13.74, 0.415, -0.91),
  L("the-wreck", "pilot", -944.08, 132.1, -1.15, 16.01, -0.415, 0.91),
  L("the-wreck", "pilot", -901.96, 124.06, -1.15, 14.79, 0.412, -0.911),
  // MIST FALLS — the old road west to the volcano climbs the gorge's south wall, 52 m at 70–76°: four long bamboo ladders zig-zag up the rock columns from the
  // lookout shelf, a timber landing bolted to the rock at the top of each, the last one on the lip where the road to the
  // cone starts. Placed against the COLLIDERS (the basalt columns stand proud of the terrain) by a probe tool: each line 0.75 m clear of the rock over its whole height, each landing ≥ 3.6 m deep
  L("mist-falls", "bamboo", -120.10, -356.01, 34.35, 48.18, 0, -1),
  L("mist-falls", "bamboo", -117.90, -352.06, 48.18, 61.22, 0, -1),
  L("mist-falls", "bamboo", -120.10, -348.09, 61.22, 74.26, 0, -1),
  L("mist-falls", "bamboo", -117.90, -344.62, 74.26, 87.30, 0, -1),
  // the channel behind the falls: its floor is a 50° terrain chute (you slide in, you can't walk back up) and
  // the only other way out was off fall B's lip (−86 hp: a rock ledge at 31 m, then the pool bed — the plunge pool is
  // drawn water, not swim water). The chute drops a sliding kong into a rock crevice 5 m under the stream bed (both of
  // its pits are slide slopes: no jump, no mantle): a short ladder out of the crevice onto the stream bed by fall B's
  // lip, then a ladder from the stream up the north plug's face onto the high bridge's valley. (Both stand ~0.5 m off the
  // colliders: the falls-wall blocks draw ~15 % wider than their boxes, so a ladder on the box face hid inside the rock)
  L("mist-falls", "bamboo", -186.46, -403.6, 49.6, 54.21, -1, 0),
  L("mist-falls", "bamboo", -185.775, -411.836, 54.2, 61.8, 0.389, 0.921),
  // COCONUT COVE — onto two of the tall flat rooftops from the street
  L("coconut-cove", "bamboo", 124.57, 431.21, 4, 11, -0.199, 0.98),
  L("coconut-cove", "bamboo", 36.08, 426, 4, 11.16, -1, 0),
];

export function poiLadders(): Climb[] { return LADDERS.map((l) => l.c); }

/** a timber landing bolted to a cliff face at the top of a ladder: deck top y, centre x / z, half sizes along the
 *  face (hx) and out of it (hz); the face normal is −z (Mist Falls' south gorge wall). Its back part runs into the rock. */
export interface Landing { poi: string; x: number; y: number; z: number; hx: number; hz: number }
export const LANDINGS: Landing[] = ([
  // [x, deck top y, front z (= the ladder line below), back z (in the rock)]
  [-119.00, 48.18, -356.01, -349.77], [-119.00, 61.22, -352.06, -345.94], [-119.00, 74.26, -348.09, -343.23], [-119.00, 87.30, -344.62, -338.6],
] as Array<[number, number, number, number]>).map(([x, y, zf, zb]) => ({ poi: "mist-falls", x, y, z: (zf + zb) / 2, hx: 2, hz: (zb - zf) / 2 }));
/** the landings' colliders: the deck (0.3 m thick) and a rope rail on each open side (1 m, stops a kong walking off the
 *  end; the front stays open — the ladders top out there) */
export function landingBoxes(): Box[] {
  const out: Box[] = [];
  for (const l of LANDINGS) {
    out.push({ c: [l.x, l.y - 0.15, l.z], h: [l.hx, 0.15, l.hz], surf: "wood" });
    // (the rail runs from the front edge to 1 m short of the rock: the back of a deep deck is in the rock)
    for (const s of [-1, 1]) out.push({ c: [l.x + s * (l.hx - 0.04), l.y + 0.55, l.z - 0.5], h: [0.04, 0.55, l.hz - 0.5], surf: "wood", noShoot: true });
  }
  return out;
}
