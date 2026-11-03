// BRIDGE (live only) until gameplay makes the contract's calls (api.ts) itself: the other players' actions that
// gameplay does not voice yet — a reload, a heal / shield use, a jump, a glider snapping open, crouch-walking feet — and
// the rarity sweetener of your own pickups. Read from the match's debug handle (`window.__kr.game.cm`), never required.
// Each part switches itself OFF for good the moment gameplay plays that sound itself (Engine.trigger → `sawReal`).
// Runs from the engine's idle-time slice at ~20 Hz; ≤ 49 remotes, a few comparisons each (allocation-free per tick).
import { CONSUMABLES, WEAPONS } from "../../../shared/world/map";
import { CONSUMABLE_DEFS } from "../../../shared/sim/const";
import type { PlayOpts } from "./api";

// shared/sim/player.ts `PS` is a const enum (not importable at runtime under isolatedModules): mirrored here
const PS_GROUND = 0, PS_GLIDE = 2, PS_ZIP = 6;
/** the zipline trolley's pitch: playbackRate = ride speed / ZIP_REF (the loop is recorded at ~16 m/s) */
const ZIP_REF = 16;

interface RemoteLike { id: number; n: number; lastTick: number; st: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; crouch: boolean; grounded: boolean; anim: number; held: number }
interface SlotLike { kind: number; id: number; rarity: number }
interface CmLike { me: number; remotes: RemoteLike[]; pred: { slots: SlotLike[]; slope?: boolean; st?: number; grounded?: boolean; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number }; serverTick(): number; phase: number }
interface Prev { anim: number; st: number; grounded: boolean; stepAcc: number; seen: boolean; zip: boolean }

export type BridgePart = "reload" | "use" | "jump" | "glider" | "crouch" | "tier" | "slide" | "zip";

export class GameBridge {
  /** parts still bridged (false = gameplay voices it itself) */
  readonly on: Record<BridgePart, boolean> = { reload: true, use: true, jump: true, glider: true, crouch: true, tier: true, slide: true, zip: true };
  /** you are riding a zipline (the trolley loop runs as "__zip") */
  private myZip = false;
  private wasSlope = false;
  private lastSlide = -9;
  private prev: Prev[] = [];
  private pos: [number, number, number] = [0, 0, 0];
  private lastT = -1;
  /** your slots as of the last tick (kind/id/rarity) and the last slot that changed (time, rarity) */
  private slotSig: number[] = [];
  private lastGain = { t: -9, rarity: 0 };
  private pendingPick = -9;
  /** bridged sounds played (stats) */
  played = 0;

  constructor(private play: (name: string, o: PlayOpts) => void, private sweeten: (tier: number) => void, private stop: (loopId: string) => void = () => {}) {}

  /** gameplay played `name` itself (not through this bridge): stop bridging that part */
  sawReal(name: string, o: PlayOpts) {
    if (name.startsWith("zip:")) { if (this.on.zip) { this.on.zip = false; if (this.myZip) this.stop("__zip"); this.myZip = false; } return; }
    if (!o.pos) { if (name === "slide") this.on.slide = false; return; }
    if (name.startsWith("reload:")) this.on.reload = false;
    else if (name === "heal:use" || name === "shield:use") this.on.use = false;
    else if (name === "jump") this.on.jump = false;
    else if (name === "glider:open") this.on.glider = false;
    else if (name.startsWith("step:") && (o.volume ?? 1) <= 0.4) this.on.crouch = false;
  }

  /** a local pickup without `tier`: the sweetener follows once the slot that took it is known (≤ 0.5 s) */
  pickup(now: number, tier: number | undefined) {
    if (tier !== undefined) { this.on.tier = false; return; }
    if (!this.on.tier) return;
    if (now - this.lastGain.t < 0.5) { this.fire(this.lastGain.rarity); this.lastGain.t = -9; return; }
    this.pendingPick = now;
  }

  private fire(rarity: number) { if (rarity >= 1) { this.sweeten(rarity); this.played++; } }

  tick(now: number, listener: [number, number, number]) {
    let cm: CmLike | undefined;
    try { cm = (globalThis as unknown as { __kr?: { game?: { cm?: CmLike | null } } }).__kr?.game?.cm ?? undefined; } catch { return; }
    if (!cm || !cm.remotes) { this.lastT = -1; return; }
    const dt = this.lastT < 0 ? 0 : Math.min(0.25, now - this.lastT);
    this.lastT = now;
    this.slots(cm, now);
    // your own slide down a slope too steep to stand on (the sim's p.slope): gravel + sand giving way under the feet
    const pr = cm.pred;
    if (this.on.slide && pr && pr.slope !== undefined) {
      const sliding = !!pr.slope && pr.st === PS_GROUND && Math.hypot(pr.vx ?? 0, pr.vy ?? 0, pr.vz ?? 0) > 2.5;
      if (sliding && !this.wasSlope && now - this.lastSlide > 0.9) { this.lastSlide = now; this.play("slide", { volume: 0.8, _bridge: true } as PlayOpts); this.played++; }
      this.wasSlope = sliding;
    }
    // YOUR zipline ride (PS.Zip): the T-bar clacks on, the trolley loop follows your speed, the stop
    // block clunks when you let go / arrive
    if (this.on.zip && pr) {
      const riding = pr.st === PS_ZIP;
      const sp = Math.hypot(pr.vx ?? 0, pr.vy ?? 0, pr.vz ?? 0);
      if (riding && !this.myZip) { this.play("zip:attach", { _bridge: true } as PlayOpts); this.played++; }
      if (riding) this.play("zip:ride", { loopId: "__zip", rate: Math.max(0.35, Math.min(1.6, sp / ZIP_REF)), _bridge: true } as PlayOpts);
      else if (this.myZip) { this.stop("__zip"); this.play("zip:detach", { _bridge: true } as PlayOpts); this.played++; }
      this.myZip = riding;
    }
    if (cm.phase < 1 && !this.on.crouch && !this.on.reload && !this.on.zip) return;
    const st = cm.serverTick();
    const P = this.pos;
    for (const r of cm.remotes) {
      if (r.id === cm.me) continue;
      let q = this.prev[r.id];
      if (!q) q = this.prev[r.id] = { anim: 0, st: r.st, grounded: r.grounded, stepAcc: 0, seen: false, zip: false };
      const live = r.n > 0 && st - r.lastTick <= 90;
      if (!live) { q.seen = false; if (q.zip) { this.stop(`__zip${r.id}`); q.zip = false; } continue; }
      const d = Math.hypot(r.x - listener[0], r.y - listener[1], r.z - listener[2]);
      if (!q.seen) { q.seen = true; q.anim = r.anim; q.st = r.st; q.grounded = r.grounded; q.stepAcc = 0; continue; }
      P[0] = r.x; P[1] = r.y + 1.1; P[2] = r.z;
      const rise = r.anim & ~q.anim;
      if (d < 30) {
        if (this.on.reload && rise & 1 && r.held < 0x80) { this.play(`reload:${WEAPONS[r.held & 7]}`, { pos: P, volume: 0.9, _bridge: true } as PlayOpts); this.played++; }
        if (this.on.use && rise & 2 && r.held >= 0x80 && r.held !== 0xff) {
          const c = CONSUMABLES[r.held & 0x7f], def = c ? CONSUMABLE_DEFS[c] : undefined;
          if (def) { this.play(def.shield > 0 && def.hp === 0 ? "shield:use" : "heal:use", { pos: P, volume: 0.9, dur: def.useS, item: c, _bridge: true } as PlayOpts); this.played++; }
        }
      }
      if (d < 90) {
        if (this.on.jump && q.grounded && !r.grounded && r.st === PS_GROUND && r.vy > 3) { P[1] = r.y; this.play("jump", { pos: P, volume: 0.8, _bridge: true } as PlayOpts); this.played++; }
        if (this.on.glider && q.st !== PS_GLIDE && r.st === PS_GLIDE) { P[1] = r.y + 2.3; this.play("glider:open", { pos: P, volume: 1, _bridge: true } as PlayOpts); this.played++; }
      }
      // crouch-walking feet (gameplay voices only upright steps): a soft step every 1.4 m within 25 m
      if (this.on.crouch && r.crouch && r.st === PS_GROUND && r.grounded && d < 25 && dt > 0) {
        const sp = Math.hypot(r.vx, r.vz);
        q.stepAcc += sp * dt;
        if (q.stepAcc > 1.4 && sp > 0.6) { q.stepAcc = 0; P[1] = r.y; this.play("step:grass", { pos: P, volume: 0.32, _bridge: true } as PlayOpts); this.played++; }
      } else q.stepAcc = 0;
      // someone else riding a zipline within 70 m: their trolley (a moving loop at their T-bar) + the clacks
      if (this.on.zip) {
        const riding = r.st === PS_ZIP && d < 70;
        if (riding) {
          P[1] = r.y + 2.3;
          if (!q.zip && q.st !== PS_ZIP) { this.play("zip:attach", { pos: P, _bridge: true } as PlayOpts); this.played++; }
          this.play("zip:ride", { pos: P, loopId: `__zip${r.id}`, rate: Math.max(0.35, Math.min(1.6, Math.hypot(r.vx, r.vy, r.vz) / ZIP_REF)), _bridge: true } as PlayOpts);
        } else if (q.zip) { this.stop(`__zip${r.id}`); if (r.st !== PS_ZIP && d < 70) { P[1] = r.y + 1.5; this.play("zip:detach", { pos: P, _bridge: true } as PlayOpts); this.played++; } }
        q.zip = riding;
      }
      q.anim = r.anim; q.st = r.st; q.grounded = r.grounded;
    }
  }

  /** watch your slots: a slot that gained an item (or a better one) remembers its rarity for the pickup sweetener */
  private slots(cm: CmLike, now: number) {
    if (!this.on.tier) return;
    const s = cm.pred?.slots;
    if (!s) return;
    for (let i = 0; i < s.length; i++) {
      const sig = s[i].kind * 4096 + s[i].id * 8 + s[i].rarity;
      const old = this.slotSig[i];
      this.slotSig[i] = sig;
      if (old === undefined || old === sig || s[i].kind === 0) continue;
      this.lastGain.t = now; this.lastGain.rarity = s[i].rarity;
      if (now - this.pendingPick < 0.5) { this.fire(s[i].rarity); this.pendingPick = -9; this.lastGain.t = -9; }
    }
    if (now - this.pendingPick > 0.5) this.pendingPick = -9;
  }
}
