// The local player's reload trigger.
//
// A per-frame trigger (fire when the predicted reload timer is within 2 × dt of full) misses at > 120 fps (the window
// never opens) and doubles at 30 fps (it opens on two frames). This one is EDGE based and runs per SIM TICK (a hook
// on ClientMatch.onTick, chained with whatever else is there), so frame rate, long frames, several ticks per frame
// and prediction reconciles cannot skip or double it:
//   start  = the timer rose this tick (0 → reloadS, or a chained shotgun shell: ≈0 → reloadS)
//   cancel = the timer dropped to 0 from more than one tick's worth (weapon swap, shotgun fire-interrupt, death)
// The per-frame `frame()` then fires viewModel.reload(total, elapsed) + the reload sound exactly once per start
// (elapsed-aware: the ticks already simulated this frame), and viewModel.cancelReload() on a cancel.
// The prediction reconcile (client.ts) never rewrites pred.reloadT, so online play sees the same edges as offline.
import { DT } from "../../../shared/sim/const";
import type { ViewModel } from "./api";

interface Hands { reloadT: number; reloadTotal: number }
interface TickSource { onTick: ((inp: never) => void) | null; pred: Hands }

export class ReloadTrigger {
  /** sim reload starts seen (ticks) */
  seq = 0;
  /** stats (a test script reads them through window.__krReload) */
  readonly stats = { starts: 0, calls: 0, cancels: 0, cancelCalls: 0, sameFrameCancel: 0, multiStartFrames: 0 };
  private prev = 0;
  private seen = 0;
  private cancel = false;
  private hook: ((inp: never) => void) | null = null;

  /** (re)install the per-tick detector on the match; call every frame (cheap) — it re-chains if someone replaced it */
  install(cm: TickSource) {
    if (cm.onTick === this.hook && this.hook) return;
    const other = cm.onTick;
    const hook = (inp: never) => { this.tick(cm.pred); other?.(inp); };
    this.hook = hook; cm.onTick = hook;
    if (typeof window !== "undefined") (window as unknown as { __krReload?: ReloadTrigger }).__krReload = this;
  }

  /** one sim tick of the local prediction ran */
  tick(p: Hands) {
    const cur = p.reloadT > 0 ? p.reloadT : 0, prev = this.prev;
    this.prev = cur;
    if (cur > 0 && cur > prev + 1e-6) { this.seq++; this.stats.starts++; this.cancel = false; }
    else if (cur <= 0 && prev > DT + 1e-4) { this.cancel = true; this.stats.cancels++; }
  }

  /** once per rendered frame, after the sim ran: drive the viewmodel + the sound */
  frame(p: Hands, vm: ViewModel, onStart: () => void) {
    if (this.seq !== this.seen) {
      if (this.seq - this.seen > 1) this.stats.multiStartFrames++;
      this.seen = this.seq; this.stats.calls++;
      const total = p.reloadTotal > 0 ? p.reloadTotal : 1;
      const live = p.reloadT > 0;
      vm.reload(total, live ? Math.max(0, total - p.reloadT) : 0);
      onStart();
      if (!live || this.cancel) { this.stats.sameFrameCancel++; this.cancel = false; vm.cancelReload?.(); this.stats.cancelCalls++; }
    } else if (this.cancel) {
      this.cancel = false; this.stats.cancelCalls++;
      vm.cancelReload?.();
    } else if (p.reloadT > 0 && p.reloadTotal > 0) vm.syncReload?.(p.reloadTotal - p.reloadT, p.reloadTotal);
  }
}
