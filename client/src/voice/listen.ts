// CASTER LISTEN-IN — the seat's side of squad comms. The seat tells the server which squads it tunes into
// ({ t: "listen", team, on }); the humans of that squad who have a mic then offer the seat a send-only connection with
// their mic track (client/src/voice/squad.ts), which this answers receive-only. The seat therefore hears exactly what the
// squad hears — only while that player holds the talk key (or has an open mic).
// A local exhibition has no server: the set of listened squads is still kept (the bot comms read it), nothing is sent.
import type { Link } from "../game/net";
import { VoicePeer, voiceCtx, SPEAK_LEVEL, type VoiceSignal } from "./peer";

export interface RosterMate { pid: number; mic: boolean; name: string }

export class CasterListen {
  /** squads this seat listens to (the local truth; the server's "listening" echo is adopted while online) */
  readonly teams = new Set<number>();
  /** each listened squad's humans (from the server's roster) */
  readonly rosters = new Map<number, RosterMate[]>();
  private readonly peers = new Map<number, VoicePeer>();
  private readonly teamOfPid = new Map<number, number>();
  volume = 1;
  private disposed = false;
  constructor(private readonly link: Link) {}

  get online() { return !this.link.offline; }
  set(team: number, on: boolean) {
    if (on === this.teams.has(team)) return;
    if (on) this.teams.add(team); else { this.teams.delete(team); this.dropTeam(team); }
    if (this.online) this.link.sendJSON({ t: "listen", team, on });
  }
  toggle(team: number) { this.set(team, !this.teams.has(team)); return this.teams.has(team); }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); for (const p of this.peers.values()) p.setVolume(this.volume); }

  onJSON(m: Record<string, unknown>): boolean {
    if (this.disposed) return false;
    if (m.t === "listening") {
      if (!Array.isArray(m.teams)) return true;
      const now = new Set((m.teams as number[]).filter((n) => Number.isInteger(n)));
      for (const t of [...this.teams]) if (!now.has(t)) { this.teams.delete(t); this.dropTeam(t); }
      for (const t of now) this.teams.add(t);
      return true;
    }
    if (m.t === "voiceroster") {
      const team = m.team as number; if (!Number.isInteger(team) || team < 0) return true;
      const mates = ((m.mates as RosterMate[]) ?? []).filter((q) => Number.isInteger(q.pid)).map((q) => ({ pid: q.pid, mic: q.mic === true, name: String(q.name ?? "") }));
      this.rosters.set(team, mates);
      for (const q of mates) this.teamOfPid.set(q.pid, team);
      // a player who left the squad / lost the mic: its connection goes
      for (const [pid, p] of this.peers) if (this.teamOfPid.get(pid) === team && !mates.some((q) => q.pid === pid && q.mic)) { p.close(); this.peers.delete(pid); }
      return true;
    }
    if (m.t === "rtc") {
      const from = String(m.from ?? ""), d = m.d as VoiceSignal;
      if (!/^p\d+$/.test(from) || !d || typeof d.id !== "string") return true;
      const pid = Number(from.slice(1));
      let p = this.peers.get(pid);
      if (d.kind === "offer") {
        if (p && p.id === d.id) return true;
        p?.close();
        p = new VoicePeer({ target: from, send: (to, s) => this.link.sendJSON({ t: "rtc", to, d: s }), track: null, dir: "recvonly", ctx: voiceCtx(), volume: this.volume });
        p.onFailed = () => { if (this.peers.get(pid) === p) { p!.close(); this.peers.delete(pid); } };
        this.peers.set(pid, p);
      }
      void p?.signal(d);
      return true;
    }
    return false;
  }
  private dropTeam(team: number) {
    for (const [pid, p] of this.peers) if (this.teamOfPid.get(pid) === team) { p.close(); this.peers.delete(pid); }
    this.rosters.delete(team);
  }
  /** the humans speaking right now (pid → level) */
  levels(out = new Map<number, number>()): Map<number, number> {
    out.clear();
    for (const [pid, p] of this.peers) { const l = p.level(); if (l > SPEAK_LEVEL) out.set(pid, l); }
    return out;
  }
  /** humans with a mic in a listened squad */
  mics(team: number) { return (this.rosters.get(team) ?? []).filter((q) => q.mic).length; }
  /** tests: inbound audio bytes per connected player */
  async stats() { const o: Record<number, { bytes: number; state: string; level: number }> = {}; for (const [pid, p] of this.peers) o[pid] = { bytes: await p.inboundBytes(), state: p.pc.connectionState, level: p.level() }; return o; }
  resume() { void voiceCtx()?.resume(); for (const p of this.peers.values()) p.resume(); }
  dispose() {
    this.disposed = true;
    for (const t of this.teams) if (this.online) this.link.sendJSON({ t: "listen", team: t, on: false });
    for (const p of this.peers.values()) p.close(); this.peers.clear(); this.teams.clear();
  }
}
