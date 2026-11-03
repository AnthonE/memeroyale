// A tuk-tuk ploughing through a fence, a hedge or the banana rows
// (Box.noDrive — the sim lets it through) throws splinters / leaves and you hear it go. Client-side only: each visible,
// moving tuk-tuk's nose is tested against the flagged boxes once a frame; a box bursts once (then rests 1.5 s).
import type { StaticWorld } from "../../../shared/sim/world";
import type { TukFx } from "./tuk-fx";
import type { Sfx } from "../audio/api";

const WOOD: readonly [number, number, number] = [0.55, 0.4, 0.24], LEAF: readonly [number, number, number] = [0.3, 0.45, 0.16], METAL: readonly [number, number, number] = [0.6, 0.62, 0.62];
/** surface index (shared/sim/world.ts SURF_IDX) → the burst's colour and sound */
const SURF: ReadonlyArray<[readonly [number, number, number], Sfx]> = [[WOOD, "impact:wood"], [METAL, "impact:metal"], [WOOD, "impact:wood"], [WOOD, "impact:wood"], [WOOD, "impact:wood"], [LEAF, "impact:grass"], [WOOD, "impact:wood"], [LEAF, "impact:foliage"], [METAL, "impact:glass"], [WOOD, "impact:fabric"]];

export class TukThru {
  private last = new Map<number, number>();
  constructor(private world: StaticWorld, private fx: TukFx, private play: (s: Sfx, x: number, y: number, z: number, v: number) => void) {}
  /** a tuk-tuk drawn at (x, y, z) facing yaw, forward speed vf (m/s), `d2` from the camera */
  check(x: number, y: number, z: number, yaw: number, vf: number, d2: number, now: number) {
    if (Math.abs(vf) < 2.5 || d2 > 90 * 90) return;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), w = this.world;
    // the nose (driving forward) or the tail (reversing), at bumper height
    const off = vf > 0 ? 1.1 : -1.0, px = x + fx * off, pz = z + fz * off;
    const i = w.firstFlagged(px, pz, 0.7, y + 0.2, y + 1.6, w.noDrive);
    if (i < 0) return;
    const t = this.last.get(i);
    if (t !== undefined && now - t < 1500) return;
    this.last.set(i, now);
    if (this.last.size > 64) for (const [k, v] of this.last) if (now - v > 1500) this.last.delete(k);
    const [col, sfx] = SURF[w.surf[i]] ?? SURF[0], bx = w.cx[i], bz = w.cz[i], by = y + 0.7, vx = fx * vf * 0.35, vz = fz * vf * 0.35;
    for (let k = 0; k < 9; k++) this.fx.dust(px + (Math.random() - 0.5) * 1.2, by + Math.random() * 0.6, pz + (Math.random() - 0.5) * 1.2, vx, vz, col, 0.8 + Math.random() * 0.5);
    if (col === METAL) this.fx.sparks(px, by, pz, vx, vz, 5);
    this.play(sfx, bx, by, bz, Math.min(1, 0.45 + Math.abs(vf) / 20));
    this.play("tuk:crash", px, by, pz, Math.min(0.6, 0.2 + Math.abs(vf) / 30));
  }
}
