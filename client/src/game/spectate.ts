// Spectating, the client half: who can be watched (every living kong this client hears about —
// all of them ride the snapshots, far ones 1 in 3 — in a stable order: my squad first, then squad by squad), cycling,
// the kill tallies the bar and the list show (counted from the kill feed: the wire carries nobody else's kills), and the
// HUD view. The server decides for real (shared/sim/match.ts spectateOp / stepSpectate); ClientMatch.spectateTo asks.
import { PS, rarityOf } from "../../../shared/sim/player";
import { CONSUMABLE_DEFS, WEAPON_DEFS } from "../../../shared/sim/const";
import { CONSUMABLES, WEAPONS } from "../../../shared/world/map";
import { inStorm } from "../../../shared/sim/storm";
import type { SpectateView } from "../ui/api";
import type { ClientMatch, Remote } from "./client";

/** a remote not heard from for this many ticks is not offered (far kongs arrive 1 snapshot in 3) */
const FRESH_TICKS = 60;

export class SpectateTracker {
  /** eliminations per player this match (the warm-up does not count; no squadmate kills) */
  readonly kills = new Int16Array(256);
  /** who last took each player down (-1 = the storm / a fall / nobody yet) */
  readonly killer = new Int16Array(256).fill(-1);
  /** out for good (a final kill) */
  readonly out = new Uint8Array(256);
  /** the full player list (Tab) is open */
  listOpen = false;
  private readonly order: number[] = [];
  private view: SpectateView | null = null;

  onKill(cm: ClientMatch, killer: number, victim: number, final: boolean) {
    if (victim < 0 || victim > 255) return;
    this.killer[victim] = killer;
    if (final && cm.phase !== 0) this.out[victim] = 1;
    if (killer >= 0 && killer <= 255 && killer !== victim && cm.phase !== 0 && cm.remotes[killer]?.team !== cm.remotes[victim]?.team) this.kills[killer]++;
  }
  /** spectating right now (out for good, the server named someone to watch) */
  active(cm: ClientMatch) { return cm.pred.st === PS.Dead && cm.spectate >= 0; }
  private live(cm: ClientMatch, r: Remote | undefined): r is Remote {
    return !!r && r.id !== cm.me && r.n > 0 && !r.deadNow && r.st !== PS.Dead && r.st !== PS.Spectate && r.st !== PS.Plane && !this.out[r.id] && cm.snapTick() - r.lastTick < FRESH_TICKS;   // (against the newest snapshot — a stall is not "gone")
  }
  /** a squadmate of mine is still in the fight: only the squad may be watched (the server's rule too) */
  squadOnly(cm: ClientMatch) {
    const team = cm.pred.team;
    return cm.remotes.some((r) => r.team === team && this.live(cm, r));
  }
  /** everyone I may watch, in cycle order: my squad, then squad by squad */
  candidates(cm: ClientMatch): number[] {
    const o = this.order; o.length = 0;
    const team = cm.pred.team, only = this.squadOnly(cm);
    for (const r of cm.remotes) if (this.live(cm, r) && (!only || r.team === team)) o.push(r.id);
    o.sort((a, b) => { const ra = cm.remotes[a], rb = cm.remotes[b]; const ma = ra.team === team ? 0 : 1, mb = rb.team === team ? 0 : 1; return ma - mb || ra.team - rb.team || a - b; });
    return o;
  }
  /** the next / previous kong to watch from the current one (-1 = nobody else) */
  cycle(cm: ClientMatch, dir: -1 | 1): number {
    const c = this.candidates(cm); if (!c.length) return -1;
    const i = c.indexOf(cm.spectate);
    const j = i < 0 ? (dir > 0 ? 0 : c.length - 1) : (i + dir + c.length) % c.length;
    return c[j] === cm.spectate ? -1 : c[j];
  }
  canWatch(cm: ClientMatch, id: number) { return this.candidates(cm).includes(id); }

  /** the HUD's spectator view this frame (null = not spectating) */
  hudView(cm: ClientMatch, name: (id: number) => string, keys: SpectateView["keys"], playerCount: number): SpectateView | null {
    if (!this.active(cm)) { this.listOpen = false; return null; }
    const id = cm.spectate, r = cm.remotes[id];
    const v = (this.view ??= { id: -1, name: "", team: 0, mate: false, hp: 0, shield: 0, held: null, kills: 0, inStorm: false, down: null, index: 0, count: 0, alive: 0, squads: 0, trios: false, squadOnly: false, listOpen: false, list: [], keys });
    const c = this.candidates(cm);
    v.id = id; v.name = name(id); v.team = r ? r.team : 0; v.mate = !!r && r.team === cm.pred.team;
    const dead = !r || r.deadNow || r.st === PS.Dead || r.st === PS.Spectate;
    v.hp = dead ? 0 : r.hp; v.shield = dead ? 0 : r.shield;
    v.held = dead || !r ? null : heldOf(r.held);
    v.kills = this.kills[id] ?? 0;
    v.inStorm = !dead && !!r && !!cm.plan && cm.phase === 2 && inStorm(cm.storm, r.x, r.z);
    v.down = dead ? { by: this.killer[id] >= 0 ? name(this.killer[id]) : "" } : null;
    v.index = c.indexOf(id) + 1; v.count = c.length;
    v.alive = cm.alive; v.squads = cm.squads; v.trios = cm.mode === "trios";
    v.squadOnly = this.squadOnly(cm); v.listOpen = this.listOpen; v.keys = keys;
    v.list.length = 0;
    if (this.listOpen) {
      const team = cm.pred.team;
      for (let i = 0; i < playerCount; i++) {
        if (i === cm.me) continue;
        const q = cm.remotes[i]; if (!q) continue;
        v.list.push({ id: i, name: name(i), team: q.team, kills: this.kills[i], alive: this.live(cm, q) || (!this.out[i] && cm.phase < 2), mate: q.team === team, watching: i === id, canWatch: c.includes(i) });
      }
      v.list.sort((a, b) => (a.alive === b.alive ? 0 : a.alive ? -1 : 1) || (a.mate === b.mate ? 0 : a.mate ? -1 : 1) || b.kills - a.kills || a.team - b.team || a.id - b.id);
    }
    return v;
  }
}

/** a snapshot's held byte: a gun (id | tier << 3), an item (0x80 | id) or nothing (0xff) */
function heldOf(h: number): SpectateView["held"] {
  if (h === 0xff) return null;
  if (h & 0x80) { const id = CONSUMABLES[h & 0x7f]; const d = id ? CONSUMABLE_DEFS[id] : null; return d ? { name: d.name, rarity: "common", kind: "item" } : null; }
  const id = WEAPONS[h & 7]; const d = id ? WEAPON_DEFS[id] : null;
  return d ? { name: d.name, rarity: rarityOf(h >> 3), kind: "weapon" } : null;
}
