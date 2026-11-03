// Match stats, top right: rounded chips in ONE row:
// squads left (squad modes), players left,
// your kills, your damage (the star; it carries a DMG label). Squad kills are not a
// chip; assists are not tracked. A changed number pops (scale only). The DOM is rebuilt only when the
// set of chips changes; numbers are written only when they change.
import type { HudState } from "./api";
import { TOON } from "./toon";

/** the stat glyphs (24 × 24, currentColor) */
const ICON = {
  skull: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C7 2 3.5 5.6 3.5 10.1c0 2.6 1.2 4.7 3 5.9V19a1 1 0 001 1H9v-2.2h2V20h2v-2.2h2V20h1.5a1 1 0 001-1v-3c1.8-1.2 3-3.3 3-5.9C20.5 5.6 17 2 12 2zM8.6 13.2a2.1 2.1 0 110-4.2 2.1 2.1 0 010 4.2zm6.8 0a2.1 2.1 0 110-4.2 2.1 2.1 0 010 4.2z"/></svg>',
  squad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4.2a3.3 3.3 0 110 6.6 3.3 3.3 0 010-6.6zM5.3 7a2.6 2.6 0 110 5.2 2.6 2.6 0 010-5.2zm13.4 0a2.6 2.6 0 110 5.2 2.6 2.6 0 010-5.2zM12 12.3c3.3 0 6 1.7 6 3.9V19H6v-2.8c0-2.2 2.7-3.9 6-3.9zm-6.7.9c.3 0 .6 0 .9.1-1 .8-1.6 1.8-1.6 2.9V18H0v-2c0-1.6 2.4-2.8 5.3-2.8zm13.4 0c2.9 0 5.3 1.2 5.3 2.8v2h-4.6v-1.8c0-1.1-.6-2.1-1.6-2.9.3-.1.6-.1.9-.1z"/></svg>',
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3a4 4 0 110 8 4 4 0 010-8zm0 10c4.4 0 8 2.2 8 5v3H4v-3c0-2.8 3.6-5 8-5z"/></svg>',
  damage: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 1l-2 7.2L5 5.2l3.2 6.1L1 13.5l7.2 1.9L5.6 22l6.3-4.1L15.6 23l.8-7.3 6.6.5-5-5.1 5-5.8-7 1.4z"/></svg>',
} as const;
type Key = "squads" | "alive" | "kills" | "squadKills" | "dmg";
const fmt = (v: number) => v.toLocaleString("en-US");
const stat = (k: Key, icon: keyof typeof ICON, label: string, unit = "") => `<span class="st" title="${label}"><i class="ic">${ICON[icon]}</i><b data-k="${k}" aria-label="${label}"></b>${unit ? `<span class="u">${unit}</span>` : ""}</span>`;
const chip = (inner: string) => `<div class="tn-hud-chip">${inner}</div>`;

export class MatchStats {
  readonly el = document.createElement("div");
  private sig = "";
  private readonly nums = new Map<Key, HTMLElement>();
  private readonly vals = new Map<Key, number>();
  /** this match's counts read off the kill feed (a new HudState object = a new match / range session) */
  private session: HudState | null = null; private phase = ""; private feedAt = -Infinity; private kills = 0; private squadKills = 0;

  constructor(parent: HTMLElement) { this.el.className = "tn-hud-ms"; parent.appendChild(this.el); }

  update(s: HudState, calm: boolean) {
    // a new session, or a new match in the same one (the warm-up starts and ends it): counts start over
    if (s !== this.session || (s.phase !== this.phase && (s.phase === "warmup" || this.phase === "warmup"))) { this.kills = 0; this.squadKills = 0; }
    if (s !== this.session) { this.session = s; this.feedAt = -Infinity; }
    this.phase = s.phase;
    // kills and squad kills from the kill feed's new entries (warm-up kills do not count; the range counts)
    const counting = !!s.range || s.phase !== "warmup";
    let top = this.feedAt;
    for (const k of s.killfeed) {
      if (k.at <= this.feedAt) continue;
      if (k.at > top) top = k.at;
      if (!counting || k.meVictim && k.meKiller) continue;
      const mine = (name: string, me: boolean) => me || (!!name && s.squad.some((q) => q.name === name));
      if (k.meKiller && !k.meVictim) this.kills++;
      if (mine(k.killer, k.meKiller) && !mine(k.victim, k.meVictim)) this.squadKills++;
    }
    this.feedAt = top;

    const inMatch = !s.range, squads = inMatch && s.mode === "trios";
    const kills = s.kills ?? (s.range ? this.kills : undefined);
    const mineRow = kills !== undefined, dmg = mineRow && s.damage !== undefined;
    const sig = `${inMatch}|${squads}|${mineRow}|${dmg}`;
    if (sig !== this.sig) {
      this.sig = sig; this.nums.clear(); this.vals.clear();
      let h = "";
      if (squads) h += chip(stat("squads", "squad", "Squads left"));
      if (inMatch) h += chip(stat("alive", "person", "Players left"));
      if (mineRow) h += chip(stat("kills", "skull", "Your kills"));
      if (dmg) h += chip(stat("dmg", "damage", "Damage dealt", "DMG"));
      this.el.innerHTML = h ? `<div class="row">${h}</div>` : "";
      for (const b of this.el.querySelectorAll<HTMLElement>("b[data-k]")) this.nums.set(b.dataset.k as Key, b);
    }
    this.set("squads", s.squadsAlive, calm);
    this.set("alive", s.alive, calm);
    if (kills !== undefined) this.set("kills", kills, calm);
    this.set("squadKills", Math.max(this.squadKills, kills ?? 0), calm);
    if (s.damage !== undefined) this.set("dmg", Math.round(s.damage), calm);
  }

  private set(k: Key, v: number, calm: boolean) {
    const b = this.nums.get(k); if (!b) return;
    const was = this.vals.get(k);
    if (was === v) return;
    this.vals.set(k, v);
    b.textContent = fmt(v);
    if (was !== undefined && !calm) b.animate([{ transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 520, easing: TOON.spring });
  }
}
