// The loot containers as the loot generator fits them against walls (shared/sim/loot-spots.ts
// crateClear / fitCrate) and as the client draws them (client/src/weapons/chest-geo.ts CUBE + chest.ts, client/src/game/
// ammobox.ts — both take their OPEN angle from here). Local frame: origin = floor centre, +Z = the front, the lid hinged
// at the back top edge and swinging up and back to `open` rad. Tiny on purpose: the weapons studio pages import it.
export interface CrateShape { hw: number; front: number; back: number; h: number; hy: number; hz: number; ld: number; lt: number; open: number }
/** half width, front / back half depth (corner frame included), closed height, hinge (y, z), lid depth + thickness, open angle */
export const CHEST_CRATE: CrateShape = { hw: 0.54, front: 0.52, back: 0.56, h: 0.98, hy: 0.78, hz: -0.546, ld: 1.08, lt: 0.22, open: 92 * Math.PI / 180 };
export const AMMO_CRATE: CrateShape = { hw: 0.4, front: 0.24, back: 0.25, h: 0.42, hy: 0.285, hz: -0.2325, ld: 0.47, lt: 0.115, open: 93 * Math.PI / 180 };
