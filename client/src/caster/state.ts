// The caster seat's live picture of the match: every player (where, how healthy, what they carry, how hot their last
// seconds were), every squad (colour, alive count, placement), the feed of big moments, and the FIGHTS — who is trading
// damage with whom right now, how hard, and where. Fed by the ClientMatch (positions / health from CastSnap, loadouts from
// CastStats) and the match events (hits, shots, kills, announcements) the seat's event sink forwards here.
//
// Fights are an engagement graph: a hit adds its damage to the edge shooter→victim, a shot that lands near an enemy adds
// a little (suppression counts as fighting), a kill adds a lot. Edges decay (half-life FIGHT_HALF_S). Players joined by
// live edges across ≥ 2 squads form one fight; squadmates standing near a participant are pulled in (they are in it,
// even before they fire). Fights keep their id from frame to frame by overlap, so the director can stay on "the same
// fight" while its cast changes.
import { PS } from "../../../shared/sim/player";
import { CSF, ANN, type CastStat } from "../../../shared/net/proto";
import { POIS, WEAPONS, CONSUMABLES } from "../../../shared/world/map";
import { WEAPON_DEFS, CONSUMABLE_DEFS } from "../../../shared/sim/const";
import type { ClientMatch, Remote } from "../game/client";
import { teamLook, type TeamLook } from "./teams";

export const FIGHT_HALF_S = 7;
const EDGE_MIN = 6;
const MATE_PULL_M = 45;
/** two engagements sharing a squad whose centres are this close are one fight */
const MERGE_M = 45;
/** a fight is one PLACE: its kongs are split into groups linked by ≤ LINK_M (single linkage) — a chain of shooters
 *  across the island (A shoots B, B's mate trades with C 300 m away) is two fights, not one blob of seven squads */
const LINK_M = 65;
const LINGER_S = 4.5;

export interface CPlayer {
  id: number; name: string; team: number; bot: boolean;
  /** drawn pose (the interpolated remote) */
  x: number; y: number; z: number; yaw: number; pitch: number; vx: number; vz: number; st: number; crouch: boolean;
  hp: number; shield: number; held: number;
  /** have we got live data for it (a snapshot within ~1.5 s) */
  live: boolean;
  alive: boolean; eliminated: boolean; resurging: boolean; respawnIn: number; inPlane: boolean; winner: boolean;
  kills: number; damage: number; cash: number; placement: number; redeploys: number;
  stat: CastStat | null;
  /** combat heat: decaying damage dealt + taken + shots (≈ "how much is happening to this kong right now") */
  heat: number;
  lastShotAt: number; lastHitAt: number; lastHurtAt: number; lastKillAt: number; lastDownAt: number;
  /** the fight it is in (−1 = none) */
  fight: number;
}
export interface CTeam {
  id: number; look: TeamLook; members: number[]; alive: number; out: boolean; placement: number; kills: number; damage: number; winner: boolean; heat: number;
}
export type FeedKind = "kill" | "down" | "squad-out" | "storm" | "phase" | "info" | "fight" | "win";
export interface FeedItem { id: number; at: number; time: number; kind: FeedKind; text: string; a?: number; b?: number; weapon?: number; final?: boolean; head?: boolean; x?: number; z?: number }
export interface CFight {
  id: number; teams: number[]; players: number[]; x: number; z: number; y: number; r: number;
  /** current intensity (sum of live edges) and its peak; damage and kills since it began */
  intensity: number; peak: number; damage: number; kills: number;
  startedAt: number; lastAt: number; where: string;
  /** squads that arrived after the fight had begun (third parties), newest last */
  joins: Array<{ team: number; at: number }>;
  /** the engagement graph lost it at this time (s): it lingers LINGER_S (decaying) before it ends — a fight whose
   *  shooters reload or reposition does not blink out of the list (and the director's story with it). −1 = live */
  goneSince: number;
}
export interface CasterListener {
  kill?(killer: number, victim: number, weapon: number, final: boolean): void;
  hit?(shooter: number, victim: number, dmg: number, kill: boolean, head: boolean): void;
  fightStart?(f: CFight): void;
  fightEnd?(f: CFight): void;
  squadOut?(team: number, left: number): void;
  /** a squad joined a fight that was already on between others */
  thirdParty?(f: CFight, team: number): void;
}

const now = () => performance.now() / 1000;
let feedSeq = 1;

/** where (x, z) is, as a caster says it: the POI it is in, near, or the compass part of the island */
export function placeName(x: number, z: number): string {
  let best = "", bd = Infinity;
  for (const p of POIS) { const d = Math.hypot(p.x - x, p.z - z) - p.r; if (d < bd) { bd = d; best = p.name; } }
  if (bd < 0) return best;
  if (bd < 160) return `NEAR ${best}`;
  const ns = z < -300 ? "NORTH" : z > 300 ? "SOUTH" : "", ew = x < -300 ? "WEST" : x > 300 ? "EAST" : "";
  return ns || ew ? `${ns}${ns && ew ? "-" : ""}${ew} WILDS` : "MID ISLAND";
}

/** display name of what a held byte / slot means */
export function heldName(held: number): string {
  if (held === 0xff) return "UNARMED";
  if (held & 0x80) { const c = CONSUMABLES[held & 0x7f]; return c ? (CONSUMABLE_DEFS as Record<string, { name?: string }>)[c]?.name ?? c.toUpperCase() : "ITEM"; }
  const w = WEAPONS[held & 7]; return w ? WEAPON_DEFS[w].name : "GUN";
}
export function weaponName(weapon: number): string {
  if (weapon === 255) return "STORM"; if (weapon === 253) return "TUK-TUK"; if (weapon === 252) return "BANANA BOMB"; if (weapon === 251) return "TOP BANANA"; if (weapon === 250) return "HELICOPTER";
  const w = WEAPONS[weapon]; return w ? WEAPON_DEFS[w].name : "FALL";
}

export class CasterState {
  readonly players: CPlayer[] = [];
  readonly teams = new Map<number, CTeam>();
  readonly feed: FeedItem[] = [];
  fights: CFight[] = [];
  readonly listeners: CasterListener[] = [];
  /** directed engagement edges a→b: weight (decays), keyed a * 64 + b */
  private readonly edges = new Map<number, number>();
  private fightSeq = 1;
  private lastEdgeT = now();
  mode: "solo" | "trios" = "solo";
  storm = { phase: 0, shrinking: false };
  constructor(readonly cm: ClientMatch) {
    for (let i = 0; i < 50; i++) this.players.push(makeP(i));
  }
  get time() { return this.cm.time; }

  // ---------------------------------------------------------------- events (from the seat's event sink)
  onHit(shooter: number, victim: number, zone: number, dmg: number, kill: boolean) {
    const t = now(), a = this.players[shooter], b = this.players[victim];
    if (b) { b.heat += dmg; b.lastHurtAt = t; }
    if (a && a !== b) { a.heat += dmg * 1.2; a.lastHitAt = t; if (b && a.team !== b.team) this.edge(shooter, victim, dmg + (kill ? 40 : 0)); }
    for (const l of this.listeners) l.hit?.(shooter, victim, dmg, kill, zone === 1);   // (hitscan.ts: zone 1 = head)
  }
  onShot(shooter: number, ex: number, ey: number, ez: number) {
    const t = now(), a = this.players[shooter]; if (!a) return;
    a.lastShotAt = t; a.heat += 1.5;
    // the enemy nearest the shot's end (within 9 m): suppressing fire is part of a fight
    let best = -1, bd = 81;
    for (const q of this.players) {
      if (!q.live || !q.alive || q.team === a.team) continue;
      const d = (q.x - ex) ** 2 + (q.y + 1 - ey) ** 2 + (q.z - ez) ** 2;
      if (d < bd) { bd = d; best = q.id; }
    }
    if (best >= 0) this.edge(shooter, best, 2.5);
  }
  onKill(killer: number, victim: number, weapon: number, final: boolean) {
    const t = now(), k = this.players[killer], v = this.players[victim];
    if (v) v.lastDownAt = t;
    if (k && k !== v) { k.lastKillAt = t; k.heat += 30; }
    const kn = killer >= 0 && k ? k.name : null, vn = v ? v.name : "?";
    const how = weaponName(weapon);
    this.push({ kind: final ? "kill" : "down", a: killer, b: victim, weapon, final, x: v?.x, z: v?.z,
      text: kn && killer !== victim ? `${kn} ${final ? "eliminated" : "dropped"} ${vn} · ${how}` : `${vn} ${final ? "eliminated" : "dropped"} by the ${how.toLowerCase()}` });
    for (const l of this.listeners) l.kill?.(killer, victim, weapon, final);
  }
  onAnnounce(code: number, a: number, b: number) {
    if (code === ANN.SquadEliminated) {
      const look = teamLook(a);
      this.push({ kind: "squad-out", text: this.mode === "trios" ? `TEAM ${look.name} ELIMINATED · ${b} squads left` : `${this.players.find((p) => p.team === a)?.name ?? "A player"} is out · ${b} left`, a });
      for (const l of this.listeners) l.squadOut?.(a, b);
    } else if (code === ANN.Final) this.push({ kind: "info", text: "FINAL CIRCLE — resurgence is off" });
    else if (code === ANN.ResurgenceOff) this.push({ kind: "info", text: "RESURGENCE OFF — no more redeploys" });
    else if (code === ANN.Victory) { const look = teamLook(a); this.push({ kind: "win", text: this.mode === "trios" ? `TEAM ${look.name} WINS` : `${this.players.find((p) => p.team === a)?.name ?? "?"} WINS`, a }); }
    else if (code === ANN.PlaneOpen) this.push({ kind: "phase", text: "THE PLANE IS OPEN — drop!" });
  }
  onStorm(phase: number, shrinking: boolean) {
    this.storm.phase = phase; this.storm.shrinking = shrinking;
    this.push({ kind: "storm", text: shrinking ? `STORM ${phase} IS CLOSING` : `STORM ${phase} — next circle marked` });
  }
  onPhase(phase: number) {
    if (phase === 0) { this.feed.length = 0; this.fights = []; this.edges.clear(); for (const p of this.players) { p.heat = 0; p.fight = -1; } this.push({ kind: "phase", text: "WARM-UP" }); }
    else if (phase === 1) this.push({ kind: "phase", text: "THE PLANE TAKES OFF" });
    else if (phase === 2) this.push({ kind: "phase", text: "EVERYONE IS OUT — MATCH ON" });
    else if (phase === 3) this.push({ kind: "phase", text: "MATCH OVER" });
  }
  push(o: Omit<FeedItem, "id" | "at" | "time">) {
    this.feed.unshift({ id: feedSeq++, at: now(), time: this.cm.time, ...o });
    if (this.feed.length > 120) this.feed.length = 120;
  }
  private edge(a: number, b: number, w: number) { const k = a * 64 + b; this.edges.set(k, (this.edges.get(k) ?? 0) + w); }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const cm = this.cm, st = cm.serverTick();
    this.mode = cm.mode;
    // a trios match seats 48: the seats past the match's roster are not players (they used to show up
    // as two empty members of team 0)
    const seats = cm.names.length > 0 ? cm.names.length : this.players.length;
    for (const p of this.players) {
      if (p.id >= seats) { p.live = false; p.alive = false; p.team = -1; continue; }
      const r: Remote = cm.remotes[p.id], s = cm.castStats[p.id];
      p.name = cm.names[p.id] || p.name;
      p.team = r.team;
      if (r.n > 0) { p.x = r.x; p.y = r.y; p.z = r.z; p.yaw = r.yaw; p.pitch = r.pitch; p.vx = r.vx; p.vz = r.vz; p.st = r.st; p.crouch = r.crouch; p.hp = r.hp; p.shield = r.shield; p.held = r.held; }
      p.live = r.n > 0 && st - r.lastTick < 90;
      if (cm.castStatsTick >= 0) {
        p.stat = s;
        p.bot = (s.flags & CSF.Bot) !== 0; p.alive = (s.flags & CSF.Alive) !== 0; p.eliminated = (s.flags & CSF.Eliminated) !== 0;
        p.resurging = (s.flags & CSF.Resurging) !== 0; p.respawnIn = s.respawnIn; p.inPlane = (s.flags & CSF.Plane) !== 0; p.winner = (s.flags & CSF.Winner) !== 0;
        p.kills = s.kills; p.damage = s.damage; p.cash = s.cash; p.placement = s.placement; p.redeploys = s.redeploys; p.team = s.team;
      } else { p.alive = p.live && p.st !== PS.Dead && p.st !== PS.Spectate; p.inPlane = p.st === PS.Plane; }
      // the snapshot says dead before the 4 Hz stats do
      if (p.live && (p.st === PS.Dead || p.st === PS.Spectate)) p.alive = false;
      p.heat *= Math.exp(-dt * Math.LN2 / 4);
    }
    // squads
    for (const t of this.teams.values()) { t.members.length = 0; t.alive = 0; t.kills = 0; t.damage = 0; t.heat = 0; }
    for (const p of this.players) {
      if (p.id >= seats) continue;
      let t = this.teams.get(p.team);
      if (!t) { t = { id: p.team, look: teamLook(p.team), members: [], alive: 0, out: false, placement: 0, kills: 0, damage: 0, winner: false, heat: 0 }; this.teams.set(p.team, t); }
      t.members.push(p.id); if (p.alive || p.resurging) t.alive++;
      t.kills += p.kills; t.damage += p.damage; t.heat += p.heat;
      t.out = p.stat ? (p.stat.flags & CSF.SquadOut) !== 0 : false; t.placement = Math.max(t.placement, p.placement); t.winner = p.winner;
    }
    for (const [id, t] of this.teams) if (!t.members.length) this.teams.delete(id);
    this.updateFights();
  }

  private updateFights() {
    const t = now(), dt = t - this.lastEdgeT; this.lastEdgeT = t;
    const k = Math.exp(-dt * Math.LN2 / FIGHT_HALF_S);
    // undirected weights between living players, decayed
    const adj = new Map<number, Map<number, number>>();
    for (const [key, w0] of this.edges) {
      const w = w0 * k; if (w < 0.5) { this.edges.delete(key); continue; }
      this.edges.set(key, w);
      const a = (key / 64) | 0, b = key % 64, pa = this.players[a], pb = this.players[b];
      if (!pa || !pb) continue;
      (adj.get(a) ?? adj.set(a, new Map()).get(a)!).set(b, (adj.get(a)?.get(b) ?? 0) + w);
      (adj.get(b) ?? adj.set(b, new Map()).get(b)!).set(a, (adj.get(b)?.get(a) ?? 0) + w);
    }
    // components over edges ≥ EDGE_MIN
    const seen = new Set<number>(), comps: number[][] = [];
    for (const [a] of adj) {
      if (seen.has(a)) continue;
      const comp: number[] = [], stack = [a]; seen.add(a);
      while (stack.length) {
        const x = stack.pop()!; comp.push(x);
        for (const [y, w] of adj.get(x)!) if (w >= EDGE_MIN && !seen.has(y)) { seen.add(y); stack.push(y); }
      }
      if (comp.length >= 2) comps.push(comp);
    }
    // pull in squadmates standing near a participant (alive, on the ground)
    const sets: Array<Set<number>> = [];
    for (const comp of comps) {
      const set = new Set(comp);
      for (const id of comp) {
        const p = this.players[id];
        for (const q of this.players) if (!set.has(q.id) && q.team === p.team && q.alive && q.live && Math.hypot(q.x - p.x, q.z - p.z) < MATE_PULL_M) set.add(q.id);
      }
      sets.push(set);
    }
    // one squad in two engagements a stone's throw apart is ONE fight (a caster calls "RED vs PINK at CNVS LAB" once,
    // not twice): merge sets that share a squad and whose centres are within MERGE_M
    const centre = (set: Set<number>) => { let x = 0, z = 0, n = 0; for (const id of set) { const p = this.players[id]; x += p.x; z += p.z; n++; } return [x / n, z / n]; };
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < sets.length && !merged; i++) for (let j = i + 1; j < sets.length && !merged; j++) {
        const ti = new Set([...sets[i]].map((id) => this.players[id].team));
        if (![...sets[j]].some((id) => ti.has(this.players[id].team))) continue;
        const [ax, az] = centre(sets[i]), [bx, bz] = centre(sets[j]);
        if (Math.hypot(ax - bx, az - bz) > MERGE_M) continue;
        for (const id of sets[j]) sets[i].add(id);
        sets.splice(j, 1); merged = true;
      }
    }
    // split each set by place (single linkage over LINK_M); a piece with one squad only is not a fight
    const places: Array<Set<number>> = [];
    for (const set of sets) {
      const left = [...set];
      while (left.length) {
        const piece = new Set<number>([left.pop()!]), queue = [...piece];
        while (queue.length) {
          const a = this.players[queue.pop()!];
          for (let i = left.length - 1; i >= 0; i--) { const b = this.players[left[i]]; if (Math.hypot(a.x - b.x, a.z - b.z) <= LINK_M) { piece.add(b.id); queue.push(b.id); left.splice(i, 1); } }
        }
        if (new Set([...piece].map((id) => this.players[id].team)).size >= 2) places.push(piece);
      }
    }
    const fresh: CFight[] = [];
    for (const set of places) {
      const comp = [...set];
      const ids = comp.filter((id) => this.players[id].live);
      const teams = [...new Set(ids.map((id) => this.players[id].team))];
      if (teams.length < 2 || !ids.length) continue;
      // one side is already gone (wiped, or all waiting on a redeploy): that fight is over — the feed has the wipe
      if (new Set(ids.filter((id) => this.players[id].alive).map((id) => this.players[id].team)).size < 2) continue;
      let sx = 0, sz = 0, sy = 0, n = 0;
      for (const id of ids) { const p = this.players[id]; if (!p.alive) continue; sx += p.x; sz += p.z; sy += p.y; n++; }
      if (!n) for (const id of ids) { const p = this.players[id]; sx += p.x; sz += p.z; sy += p.y; n++; }
      const x = sx / n, z = sz / n, y = sy / n;
      let r = 0; for (const id of ids) { const p = this.players[id]; if (p.alive) r = Math.max(r, Math.hypot(p.x - x, p.z - z)); }
      let intensity = 0; for (const a of comp) { const m = adj.get(a); if (m) for (const [b, w] of m) if (set.has(b)) intensity += w / 2; }
      fresh.push({ id: 0, teams, players: ids, x, z, y, r: Math.max(r, 6), intensity, peak: intensity, damage: 0, kills: 0, startedAt: t, lastAt: t, where: placeName(x, z), joins: [], goneSince: -1 });
    }
    // keep ids by overlap with last frame's fights
    const old = this.fights, used = new Set<number>();
    for (const f of fresh) {
      let best: CFight | null = null, bo = 0;
      for (const o of old) { if (used.has(o.id)) continue; const ov = f.players.filter((id) => o.players.includes(id)).length; if (ov > bo) { bo = ov; best = o; } }
      if (best) {
        used.add(best.id); f.id = best.id; f.startedAt = best.startedAt; f.peak = Math.max(best.peak, f.intensity); f.damage = best.damage; f.kills = best.kills; f.lastAt = best.lastAt; f.joins = best.joins;
        // a squad that was not in it a moment ago, into a fight that has been on for a while: a third party
        for (const tm of f.teams) if (!best.teams.includes(tm) && t - best.startedAt > 3 && !f.joins.some((j) => j.team === tm)) { f.joins.push({ team: tm, at: t }); for (const l of this.listeners) l.thirdParty?.(f, tm); }
      }
      else { f.id = this.fightSeq++; for (const l of this.listeners) l.fightStart?.(f); }
    }
    for (const o of old) {
      if (used.has(o.id)) continue;
      // lost by the graph: linger (fading) while two of its squads still stand, then end
      if (o.goneSince < 0) o.goneSince = t;
      const alive = o.players.filter((id) => this.players[id].alive && this.players[id].live);
      if (t - o.goneSince < LINGER_S && new Set(alive.map((id) => this.players[id].team)).size >= 2 && !fresh.some((f) => f.players.some((id) => o.players.includes(id)))) {
        let x = 0, z = 0; for (const id of alive) { x += this.players[id].x; z += this.players[id].z; }
        o.x = x / alive.length; o.z = z / alive.length; o.intensity *= Math.exp(-dt * 0.5); fresh.push(o);
      } else for (const l of this.listeners) l.fightEnd?.(o);
    }
    this.fights = fresh.sort((a, b) => b.intensity - a.intensity);
    for (const p of this.players) p.fight = -1;
    for (const f of this.fights) for (const id of f.players) this.players[id].fight = f.id;
  }
  /** a hit / kill inside a fight adds to its totals (called by the seat's sink after onHit / onKill) */
  creditFight(victim: number, dmg: number, kill: boolean) {
    const f = this.fights.find((x) => x.players.includes(victim)); if (!f) return;
    f.damage += dmg; if (kill) f.kills++; f.lastAt = now();
  }
  fight(id: number) { return this.fights.find((f) => f.id === id) ?? null; }
  /** players still in the match (alive or coming back) */
  get aliveCount() { let n = 0; for (const p of this.players) if (p.alive) n++; return n; }
}

function makeP(id: number): CPlayer {
  return { id, name: `MEMER ${id + 1}`, team: 0, bot: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, st: 0, crouch: false, hp: 100, shield: 0, held: 0xff, live: false,
    alive: false, eliminated: false, resurging: false, respawnIn: -1, inPlane: false, winner: false, kills: 0, damage: 0, cash: 0, placement: 0, redeploys: 0, stat: null,
    heat: 0, lastShotAt: -1e9, lastHitAt: -1e9, lastHurtAt: -1e9, lastKillAt: -1e9, lastDownAt: -1e9, fight: -1 };
}
