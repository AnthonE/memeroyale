// WATER FEEDBACK: a splash when a kong goes into deep water (loudness,
// size and the surface crater scale with the impact speed), the swim wake on the interactive water, a body-out slosh +
// drips when you pull yourself out, and a short dip of YOUR eye under the surface on a hard entry (the existing
// underwater look + the audio engine's underwater muffle / bed take it from there). The swim strokes themselves are the
// audio engine's foot plants while swimming (audio/index.ts stepNameFor → water:stroke).
// Read-only over the match mirror; no allocations per frame.
import type { ClientMatch } from "./client";
import type { Sfx } from "../audio/api";
import type { WaterApi } from "../world/water/api";
import { PS } from "../../../shared/sim/player";
import { SWIM_FLOAT_Y } from "../../../shared/sim/const";

/** swimming: dev switches for cost ablation (flipped at runtime on window.__swimDev):
 *  stroke sounds, stroke splashes, everything of MY strokes, the 1P swim hands (render.ts), the dive / surfacing splashes (here) */
export const SWIM_DEV = { sfx: true, splash: true, local: true, diveSplash: true, hands: true };
try { (globalThis as unknown as { __swimDev?: typeof SWIM_DEV }).__swimDev = SWIM_DEV; } catch { /* */ }
/** swimming sounds (audio/bank.ts swim:*) */
const DIVE: Sfx = "swim:dive", SURFACE: Sfx = "swim:surface", GASP: Sfx = "swim:gasp";
const BUBBLES: Sfx = "swim:bubbles", LOW_AIR: Sfx = "swim:low-air";
/** another kong is under water when its feet are this far below the float line (render.ts stateOf, the same rule) */
const remoteUnder = (swim: boolean, st: number, y: number) => swim && st === PS.Ground && y < SWIM_FLOAT_Y - 0.45;

type Play = (s: Sfx, x: number, y: number, z: number, volume: number) => void;
type Sfx2 = (s: Sfx, o?: { volume?: number }) => void;
interface RemoteW { swim: boolean; vy: number; air: boolean; wake: number; under: boolean }

/** impact speed (m/s) → splash level 0.2..1 */
const splashVol = (v: number) => Math.max(0.2, Math.min(1, (v - 1) / 13));

export class WaterFx {
  private wasSwim = false; private wasSt = 0; private lastVy = 0; private airborne = false;
  private dipT = 9; private dipD = 0; private wakeT = 0;
  /** swimming: under water last frame, the next exhale's bubbles (s), the low-air pulse clock (s) */
  private wasUnder = false; private bubbleT = 0; private lowT = 0; private rnd = 0x2545f491;
  private readonly rem = new Map<number, RemoteW>();

  update(dt: number, cm: ClientMatch, water: WaterApi | undefined, sfx: Sfx2, play: Play, cx: number, cz: number) {
    const p = cm.pred;
    if (p.st === PS.Dead || p.st === PS.Spectate || p.st === PS.Plane) { this.wasSwim = false; this.wasUnder = false; this.wasSt = p.st; this.lastVy = 0; return; }
    // ---- you
    if (p.swim && !this.wasSwim) {
      // the speed you hit the water with: the last frame's fall (a glide / freefall landing zeroes vy on the entry tick)
      const v = Math.max(-this.lastVy, 0);
      const vol = splashVol(this.airborne ? v : v * 0.5);
      if (this.airborne || v > 2) {
        sfx("water:splash", { volume: vol });
        water?.splash(p.x, p.z, 0.6 + 1.4 * vol);
        // a hard entry: the eye goes under for a moment (0.25-0.5 s, up to 1.1 m)
        if (v > 9) { this.dipT = 0; this.dipD = Math.min(1.1, 0.35 + v * 0.03); }
      } else sfx("water:stroke", { volume: 0.5 });
    }
    // pulling yourself out (swim mantle): the body leaving the water + drips
    if (p.st === PS.Mantle && this.wasSt !== PS.Mantle && this.wasSwim) { sfx("water:out", { volume: 0.9 }); water?.splash(p.x, p.z, 0.7); }
    // swimming: the duck-dive (a breath in, the head going under), coming up (the surface breaks, an exhale — a big
    // gasp when the air nearly ran out), the exhale's bubbles every few seconds under water, the low-air pulse
    const under = p.swim && p.under && p.st === PS.Ground;
    if (under && !this.wasUnder) { sfx(DIVE, { volume: 0.9 }); if (SWIM_DEV.diveSplash) water?.splash(p.x, p.z, 0.45); this.bubbleT = 1.4 + this.frand() * 0.8; this.lowT = 0; }
    else if (!under && this.wasUnder && p.swim && p.st === PS.Ground) {
      // (the gasp waits 0.45 s in the bank: the blow-out of the surfacing lands first, then the desperate inhale)
      sfx(SURFACE, { volume: 0.85 }); if (p.breath < 0.3) sfx(GASP, { volume: 1 });
      if (SWIM_DEV.diveSplash) water?.disturb(p.x, p.z, 0.7, 0.05, 0.6);
    }
    if (under) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) { sfx(BUBBLES, { volume: 0.7 + 0.3 * (1 - p.breath) }); this.bubbleT = (p.breath < 0.3 ? 1.3 : 2.6) + this.frand() * 1.6; }
      if (p.breath < 0.3) { this.lowT -= dt; if (this.lowT <= 0) { sfx(LOW_AIR, { volume: 0.55 + 0.45 * (1 - p.breath / 0.3) }); this.lowT = 0.9 - 0.3 * (1 - p.breath / 0.3); } }
    }
    this.wasUnder = under;
    // the wake: a soft push every ~0.12 s while you swim and move (on the surface)
    if (p.swim && !p.under && water) {
      const sp = Math.hypot(p.vx, p.vz);
      this.wakeT -= dt;
      if (sp > 1 && this.wakeT <= 0) { this.wakeT = 0.12; water.disturb(p.x, p.z, 0.6, 0.012 + sp * 0.004, 0.35); }
    }
    this.airborne = p.st === PS.Freefall || p.st === PS.Glide || (p.st === PS.Ground && !p.grounded && !p.swim && p.vy < -1);
    if (!p.swim) this.lastVy = p.st === PS.Ground || p.st === PS.Freefall || p.st === PS.Glide ? p.vy : 0;
    this.wasSwim = p.swim; this.wasSt = p.st;
    this.dipT += dt;
    // ---- other kongs within earshot (45 m): their entry splashes + wakes near the camera
    for (const r of cm.remotes) {
      if (r.id === cm.me || r.n === 0) continue;
      let w = this.rem.get(r.id);
      if (!w) { w = { swim: r.swim, vy: 0, air: false, wake: 0, under: false }; this.rem.set(r.id, w); }
      const d2 = (r.x - cx) ** 2 + (r.z - cz) ** 2, live = r.st === PS.Ground && r.swim;
      // another kong ducking under / coming up (its splash; under water it leaves no wake)
      const und = remoteUnder(r.swim, r.st, r.y);
      if (und !== w.under && live && d2 < 45 * 45) {
        if (und) { play(DIVE, r.x, 0, r.z, 0.8); water?.splash(r.x, r.z, 0.45); }
        else { play(SURFACE, r.x, 0.2, r.z, 0.75); water?.disturb(r.x, r.z, 0.7, 0.05, 0.6); }
      }
      w.under = und;
      if (live && !w.swim && d2 < 60 * 60) {
        const v = Math.max(-w.vy, 0), vol = splashVol(w.air ? v : v * 0.5);
        if (w.air || v > 2) { play("water:splash", r.x, -0.2, r.z, vol); water?.splash(r.x, r.z, 0.6 + 1.4 * vol); }
      }
      if (live && !und && water && d2 < 48 * 48 && Math.hypot(r.vx, r.vz) > 1) { w.wake -= dt; if (w.wake <= 0) { w.wake = 0.15; water.disturb(r.x, r.z, 0.6, 0.02, 0.3); } }
      w.air = r.st === PS.Freefall || r.st === PS.Glide || (r.st === PS.Ground && !r.grounded && !r.swim);
      if (!r.swim) w.vy = r.vy;
      w.swim = live;
    }
  }
  private frand() { this.rnd = (this.rnd * 1664525 + 1013904223) >>> 0; return this.rnd / 4294967296; }
  /** add to the eye height after the swim surface clamp: a hard entry dips it under the surface (≤ 0, metres) */
  dipY(): number {
    const T = 0.55; if (this.dipT >= T) return 0;
    const u = this.dipT / T;
    return -this.dipD * Math.sin(Math.PI * Math.sqrt(u));
  }
}
