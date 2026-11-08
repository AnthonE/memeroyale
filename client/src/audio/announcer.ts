// The announcer: one voice line at a time (public/assets/audio/kr/vo/, the sounds `vo:<line>` in audio/bank.ts). The
// game asks for a line when something happens to YOU (game/render.ts: multi-kills and medals, a streak, the storm, the
// top ten, how your match ends). A line waits its turn behind the one speaking; one that has waited past STALE_MS is
// dropped (it would describe a moment that's gone), and the same line never plays twice inside REPEAT_MS. Off with
// Settings > Audio > Announcer.
import { preferences } from "../settings/preferences";
import type { Sfx } from "./api";
import type { VoLine } from "./vo-lines";

const STALE_MS = 2000, REPEAT_MS = 10_000, QUEUE = 4;
/** how long each line holds the floor, ms (its length plus a breath); the long ones by name, the rest LINE_MS */
const LINE_MS = 1700;
const LONG: Partial<Record<VoLine, number>> = { top_three: 2900, game_over_you_win: 2800, game_over_you_lose: 3000, feed_closing: 2200, clout_acquired: 2100, main_character: 2000 };

export class Announcer {
  private queue: Array<{ line: VoLine; at: number }> = [];
  private last = new Map<VoLine, number>();
  private busyUntil = 0;
  constructor(private play: (s: Sfx) => void) {}
  /** ask for a line; `first` puts it ahead of the waiting ones (the match's end outranks a medal) */
  say(line: VoLine, now = performance.now(), first = false) {
    if (!preferences.value.announcer) return;
    if (now - (this.last.get(line) ?? -Infinity) < REPEAT_MS || this.queue.some((q) => q.line === line)) return;
    const item = { line, at: now };
    if (first) this.queue.unshift(item); else this.queue.push(item);
    if (this.queue.length > QUEUE) this.queue.length = QUEUE;
  }
  /** every frame: the next line once the one speaking is done */
  frame(now = performance.now()) {
    if (now < this.busyUntil) return;
    while (this.queue.length && now - this.queue[0].at > STALE_MS) this.queue.shift();
    const next = this.queue.shift();
    if (!next) return;
    this.last.set(next.line, now);
    this.busyUntil = now + (LONG[next.line] ?? LINE_MS);
    this.play(`vo:${next.line}`);
  }
}
