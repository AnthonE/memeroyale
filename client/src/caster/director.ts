// AUTOPILOT: the director that follows the action for the caster (v2). Every frame it lists the STORIES on the island,
// scores them, and cuts like a broadcast director would.
//
// Stories (Candidate.kind):
//   fight    — a live fight (state.ts engagement graph): its intensity, how many squads, kills in it, a THIRD PARTY that
//              just arrived, how late in the match it is. The biggest story nearly always.
//   closing  — two squads (nearest members < CLOSE_M) moving toward each other and not fighting yet: the PRE-CUT, so the
//              caster is on them when the first shot goes (and the fight that follows is the same story: a glide, no cut)
//   endgame  — few squads left: the wide drone on everyone still standing, between fights
//   storm    — a kong caught outside the circle, racing it (more when it is closing, more late in the match)
//   plane / drop — the plane (a chase on the bus), then the HOT DROP: the POI the most kongs are diving into
//   star     — a lone kong with heat (shooting / being shot), kills (the top fragger), or an enemy close by
//   warmup   — the warm-up: slow orbits round the field (humans first), a new kong every few seconds
// Shot grammar: a spread-out fight is a DRONE shot framing every participant; a tight one (≤ 3 kongs within ~18 m) is a
// FOLLOW on whoever deals the damage (a sniper is seen down its sights — POV — but never for more than POV_MAX_S).
// Inside a long fight the director alternates the wide drone and a close follow (BEAT_S); a kill in the watched fight
// gets a KILL-CAM beat on the killer.
// Pacing: a shot holds ≥ MIN_SHOT_S (the watched kong dying / the fight ending releases it early); a challenger must beat
// the current story by SWITCH_MARGIN (live score of both); an URGENT story (≥ URGENT_X the current) may cut after
// URGENT_S; a quiet shot (score < QUIET_SCORE) is refreshed after QUIET_S. While a REPLAY runs the director waits.
import { placeName, type CasterState, type CFight, type CPlayer } from "./state";
import type { CamMode, CamShot } from "./rig";
import type { ClientMatch } from "../game/client";
import { teamLook } from "./teams";
import { PS, SK } from "../../../shared/sim/player";
import { WEAPONS, POIS } from "../../../shared/world/map";

const MIN_SHOT_S = 5, SWITCH_MARGIN = 1.45, SWITCH_ADD = 10, URGENT_X = 2.6, URGENT_S = 2.5;
/** one fight to ANOTHER fight: a live fight with kongs still standing is not left for a slightly hotter one this soon */
const FIGHT_HOLD_S = 8;
/** no two cuts closer than this, whatever happens (a story that ended holds its last shot that long: the winner stands) */
const GAP_S = 2.6;
/** variety: a story shown in the last RECENT_S counts RECENT_K of its score; a non-fight story fades after STALE_S on air */
const RECENT_S = 45, RECENT_K = 0.65, STALE_S = 15, STALE_FADE_S = 30;
const QUIET_S = 12, QUIET_SCORE = 18, WARMUP_SHOT_S = 7;
/** inside one fight: the wide drone holds BEAT_S[1], a close follow BEAT_S[0]; POV never longer than POV_MAX_S */
const BEAT_S = [6.5, 10], POV_MAX_S = 7.5, KILLCAM_S = 3.6, KILLCAM_GAP_S = 10, KILLCAM_AFTER_S = 2.5;
/** squads whose nearest members are this close and closing are a story */
const CLOSE_M = 150;

export type StoryKind = "fight" | "closing" | "endgame" | "storm" | "plane" | "drop" | "star" | "warmup";
export interface Candidate { key: string; kind: StoryKind; score: number; shot: CamShot; line: string }

const now = () => performance.now() / 1000;

export class Director {
  enabled = false;
  /** a replay is on screen: no cuts (replay.ts sets it) */
  paused = false;
  current: Candidate | null = null;
  /** when the current STORY began, when its current shot (beat) began */
  private storyAt = -1e9; private shotAt = -1e9; private beatWide = true;
  /** something on screen ends the shot's minimum hold (the watched kong died, the fight ended) */
  private released = false;
  /** a kill in the watched story waiting for its kill-cam beat; when the last kill-cam ran */
  private killCam: { killer: number; victim: number; at: number } | null = null; private lastKillCam = -1e9; private inKillCam = false;
  /** what the director says it is doing (the desk shows it) */
  line = ""; private killLine = "";
  /** cut / glide request out to the app (which owns the rig) */
  onShot: ((shot: CamShot, glide: boolean, why: string) => void) | null = null;
  /** the cut log (tools / tuning): [match time, story key, mode, score, line] */
  readonly log: Array<{ t: number; at: number; key: string; kind: StoryKind; mode: CamMode; score: number; line: string }> = [];
  /** the match (storm, phase, plane) — set by the app; without it the storm / drop stories are skipped */
  cm: ClientMatch | null = null;
  /** when each story key was last put on air (variety) */
  private readonly shown = new Map<string, number>(); private cur0 = "";

  constructor(private readonly state: CasterState) {
    state.listeners.push({
      kill: (killer, victim) => {
        const cur = this.current; if (!cur) return;
        const watched = cur.shot.target === victim || cur.shot.group.includes(victim) || (cur.shot.fight >= 0 && this.state.fight(cur.shot.fight)?.players.includes(victim));
        if (!watched) return;
        if (cur.shot.target === victim && cur.kind !== "fight") this.released = true;
        if (killer >= 0 && killer !== victim && this.state.players[killer]?.alive) this.killCam = { killer, victim, at: now() };
      },
      fightEnd: (f) => { if (this.current?.shot.fight === f.id) this.released = true; },
    });
  }
  setEnabled(on: boolean) { this.enabled = on; if (on) { this.current = null; this.shotAt = -1e9; this.storyAt = -1e9; } }

  update(phase: number) {
    if (!this.enabled || this.paused) return;
    const t = now(), cands = this.candidates(phase);
    if (!cands.length) return;
    const cur = this.current, held = t - this.storyAt;
    // variety: what was on air lately counts less; a lone-kong / storm / tour story wears out on air (a fight never does
    // while it burns: its own intensity decays when it cools)
    for (const c of cands) {
      if (cur && c.key === cur.key) { if (c.kind !== "fight" && held > STALE_S) c.score *= Math.max(0.3, 1 - (held - STALE_S) / STALE_FADE_S); }
      else { const at = this.shown.get(c.key); if (at !== undefined && t - at < RECENT_S) c.score *= RECENT_K; }
    }
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    const curNow = cur ? cands.find((c) => c.key === cur.key) ?? null : null;
    const curScore = curNow ? curNow.score : 0;
    // a closing pre-cut that turned into the fight it predicted: the same story, carried on (no hold, a glide)
    if (cur && cur.kind === "closing" && best.kind === "fight" && best.shot.group.some((id) => cur.shot.group.includes(id))) { this.take(best, true); return; }
    // the watched fight's identity changed under it (it split / merged as kongs moved): the fight that holds most of the
    // kongs on screen IS the story — carry on with it (no new hold, no cut)
    if (cur && !curNow && cur.kind === "fight") {
      let cont: Candidate | null = null, bo = 1;
      for (const c of cands) { if (c.kind !== "fight") continue; const ov = c.shot.group.filter((id) => cur.shot.group.includes(id)).length; if (ov > bo) { bo = ov; cont = c; } }
      if (cont) { this.released = false; this.current = { ...cont, shot: { ...cur.shot, fight: cont.shot.fight, group: cont.shot.group } }; this.onShot?.(this.current.shot, true, "fight"); this.line = this.describe(cont, this.current.shot); return; }
    }
    let take: Candidate | null = null;
    if (cur && t - this.shotAt < GAP_S) { if (curNow) this.current = { ...curNow, shot: cur.shot }; return; }
    if (!cur) take = best;
    else if (this.released) take = best.key === cur.key ? cands[1] ?? null : best;
    else if (!curNow) take = best;                                                                   // the story vanished
    else if (best.key !== cur.key) {
      const minHold = phase === 0 ? WARMUP_SHOT_S : cur.kind === "fight" && best.kind === "fight" ? FIGHT_HOLD_S : MIN_SHOT_S;
      if (held >= minHold && best.score > curScore * SWITCH_MARGIN + SWITCH_ADD) take = best;
      else if (held >= URGENT_S && best.score > curScore * URGENT_X + 20) take = best;
      else if (held >= (phase === 0 ? WARMUP_SHOT_S : QUIET_S) && curScore < QUIET_SCORE) take = best;
    }
    if (take) { this.take(take, !!cur && take.shot.group.some((id) => cur.shot.group.includes(id) || id === cur.shot.target)); return; }
    if (!cur || !curNow) return;
    // the story continues: keep its line fresh (kills, third parties) and run its beats
    this.current = { ...curNow, shot: cur.shot };
    this.line = this.describe(curNow, cur.shot);
    this.beats(cur, curNow, t);
  }

  /** a new story on screen */
  private take(c: Candidate, glide: boolean) {
    const t = now();
    this.current = c; this.storyAt = t; this.shotAt = t; this.beatWide = c.shot.mode === "drone"; this.released = false; this.killCam = null; this.inKillCam = false;
    if (this.cur0 && this.cur0 !== c.key) this.shown.set(this.cur0, t);
    this.cur0 = c.key; this.shown.set(c.key, t);
    this.line = this.describe(c, c.shot);
    this.onShot?.(c.shot, glide, c.kind);
    this.note(c, c.shot);
  }
  /** a new shot inside the same story */
  private cutShot(shot: CamShot, glide = false) {
    const cur = this.current!; this.current = { ...cur, shot }; this.shotAt = now(); this.inKillCam = false;
    this.line = this.describe(cur, shot);
    this.onShot?.(shot, glide, cur.kind);
    this.note(cur, shot);
  }
  private note(c: Candidate, shot: CamShot) {
    this.log.push({ t: this.cm?.time ?? 0, at: now(), key: c.key, kind: c.kind, mode: shot.mode, score: Math.round(c.score), line: this.line.replace(/<[^>]+>/g, "") });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }

  /** inside a story: kill-cam, the POV cap, the wide / close alternation of a long fight */
  private beats(cur: Candidate, live: Candidate, t: number) {
    const shotHeld = t - this.shotAt, s = this.state;
    const f = cur.shot.fight >= 0 ? s.fight(cur.shot.fight) : null;
    // kill-cam: the killer, close, for a beat (unless we are already on it)
    const kc = this.killCam;
    if (kc && t - kc.at < 2.5 && t - this.lastKillCam > KILLCAM_GAP_S && shotHeld > KILLCAM_AFTER_S) {
      this.killCam = null;
      const k = s.players[kc.killer];
      if (k && k.alive && k.live && !(cur.shot.target === k.id && cur.shot.mode !== "drone")) {
        this.lastKillCam = t;
        this.cutShot({ mode: "follow", target: k.id, group: cur.shot.group, fight: cur.shot.fight });
        this.inKillCam = true; this.killLine = `${this.name(k)} drops ${this.name(s.players[kc.victim])} — <i>KILL CAM</i>`; this.line = this.killLine;
        return;
      }
    }
    if (kc && t - kc.at >= 2.5) this.killCam = null;
    // a close shot on a kong that just went down (and no kill-cam took over): back to the story's wide shot
    const tgt = cur.shot.target >= 0 ? s.players[cur.shot.target] : null;
    if (cur.shot.mode !== "drone" && tgt && !tgt.alive && shotHeld > GAP_S && live.shot.target !== tgt.id) { this.cutShot(live.shot); this.beatWide = live.shot.mode === "drone"; return; }
    // never long down a kong's sights
    if (cur.shot.mode === "pov" && shotHeld > POV_MAX_S) { this.cutShot({ ...cur.shot, mode: "follow" }); return; }
    // a kill-cam beat ends after KILLCAM_S: back to the story's wide shot
    if (this.inKillCam) { if (shotHeld > KILLCAM_S) { this.cutShot(live.shot); this.beatWide = live.shot.mode === "drone"; } else this.line = this.killLine; return; }
    if (!f || f.players.filter((id) => s.players[id].alive).length < 2) return;
    // long fight: wide ↔ close
    if (shotHeld > (this.beatWide ? BEAT_S[1] : BEAT_S[0])) {
      const star = this.star(f);
      if (this.beatWide && star) { this.beatWide = false; this.cutShot({ mode: this.closeMode(star), target: star.id, group: f.players, fight: f.id }); }
      else { this.beatWide = true; this.cutShot({ mode: "drone", target: star?.id ?? cur.shot.target, group: f.players, fight: f.id }); }
    }
  }

  /** the one doing the damage in a fight (else the one taking it) */
  private star(f: CFight): CPlayer | null {
    let best: CPlayer | null = null, bs = -1; const t = now();
    for (const id of f.players) { const p = this.state.players[id]; if (!p.alive || !p.live) continue; const s = p.heat + (t - p.lastHitAt < 2 ? 40 : 0) + (t - p.lastKillAt < 4 ? 30 : 0) + p.kills * 3; if (s > bs) { bs = s; best = p; } }
    return best;
  }
  /** a sniper is seen down its sights now and then; everyone else over the shoulder */
  private closeMode(p: CPlayer): CamMode {
    const s = p.stat?.slots[p.stat.active];
    const sniper = !!s && s.kind === SK.Weapon && WEAPONS[s.id] === "sniper";
    return sniper && Math.random() < 0.55 ? "pov" : "follow";
  }

  // ---------------------------------------------------------------- stories
  private candidates(phase: number): Candidate[] {
    const s = this.state, out: Candidate[] = [];
    const teamsLeft = [...s.teams.values()].filter((t) => !t.out && t.alive > 0);
    const squadsLeft = Math.max(1, teamsLeft.length);
    // every fight matters more as the field thins (trios: 17 squads → ×1, 4 → ×2.1; solo: 50 → ×1, 6 → ×2.3)
    const field = s.mode === "trios" ? 17 : 50;
    const endgame = 1 + Math.max(0, 1 - squadsLeft / (field * 0.6)) * 1.4;
    const t = now();
    if (phase === 0) return this.warmup();
    // the match is won: the winners, slowly orbited
    if (phase === 3) {
      const win = s.players.filter((p) => p.winner && p.live && p.alive);
      if (win.length) { const w = win.find((p) => !p.bot) ?? win[0]; return [{ key: "win", kind: "endgame", score: 100, shot: { mode: "orbit", target: w.id, group: win.map((p) => p.id), fight: -1 }, line: `${this.teamName(w.team)} <i>WIN KONG ROYALE</i>` }]; }
    }
    // the plane: a chase on the bus until kongs are diving; then the hot drop
    const air = s.players.filter((p) => p.live && p.alive && (p.st === PS.Freefall || p.st === PS.Glide));
    const aboard = s.players.filter((p) => p.live && p.alive && (p.inPlane || p.st === PS.Plane));
    if (phase === 1 && aboard.length && air.length < 3) {
      const rider = aboard.find((p) => !p.bot) ?? aboard[0];
      out.push({ key: "plane", kind: "plane", score: 25, shot: { mode: "drone", target: rider.id, group: [rider.id], fight: -1 }, line: `THE PLANE — <i>${aboard.length}</i> kongs aboard` });
    }
    if (air.length >= 3) this.hotDrop(air, out);
    // fights
    for (const f of s.fights) {
      const alive = f.players.filter((id) => s.players[id].alive && s.players[id].live);
      if (!alive.length) continue;
      const tp = f.joins.length && t - f.joins[f.joins.length - 1].at < 14;
      let score = (f.intensity * (1 + 0.35 * (f.teams.length - 1)) + f.kills * 16 + Math.min(30, f.damage * 0.06) + 20 + (tp ? 28 : 0)) * endgame;
      // a fight that went quiet (no damage for a few seconds) fades as a story before its edges do
      const quiet = t - f.lastAt; if (quiet > 6) score *= Math.max(0.35, 1 - (quiet - 6) / 14);
      let spread = 0; for (const id of alive) { const p = s.players[id]; spread = Math.max(spread, Math.hypot(p.x - f.x, p.z - f.z)); }
      const star = this.star(f);
      const tight = alive.length <= 3 && spread < 18 && star;
      const shot: CamShot = tight ? { mode: "follow", target: star!.id, group: f.players, fight: f.id } : { mode: "drone", target: star?.id ?? alive[0], group: f.players, fight: f.id };
      out.push({ key: `f${f.id}`, kind: "fight", score, shot, line: "" });
    }
    if (phase === 2) {
      this.closing(out, endgame);
      this.storm(out, endgame);
      // the final squads: one wide shot on everyone still standing
      const finalN = s.mode === "trios" ? 3 : 4;
      if (squadsLeft <= finalN && squadsLeft >= 2) {
        const ids = s.players.filter((p) => p.alive && p.live && !p.inPlane).map((p) => p.id);
        let cx = 0, cz = 0; for (const id of ids) { cx += s.players[id].x; cz += s.players[id].z; } cx /= ids.length || 1; cz /= ids.length || 1;
        let spread = 0; for (const id of ids) spread = Math.max(spread, Math.hypot(s.players[id].x - cx, s.players[id].z - cz));
        // everyone left in one shot: a raised drone when they are close, straight down over the zone when they are not
        if (ids.length && spread < 650) out.push({ key: "endgame", kind: "endgame", score: 24 * endgame, shot: { mode: spread < 220 ? "drone" : "overhead", target: ids[0], group: ids, fight: -1 }, line: "" });
      }
      // the last few squads, one by one (between fights the director tours them: where they hold, how many are up)
      if (squadsLeft <= finalN + 1 && squadsLeft >= 2) for (const tm of teamsLeft) {
        const up = tm.members.map((id) => s.players[id]).filter((p) => p.alive && p.live && !p.inPlane);
        if (!up.length || up.some((p) => p.fight >= 0)) continue;
        out.push({ key: `t${tm.id}`, kind: "endgame", score: (14 + up.length * 3 + tm.kills * 0.8) * endgame, shot: { mode: up.length > 1 ? "drone" : "follow", target: up[0].id, group: up.map((p) => p.id), fight: -1 },
          line: `${this.teamName(tm.id)} — <i>${up.length} up</i> · ${tm.kills} kills · holding ${placeName(up[0].x, up[0].z)}` });
      }
    }
    // lone kongs: heat, kills, the top fragger
    let topK = 0; for (const p of s.players) if (p.alive && p.kills > topK) topK = p.kills;
    for (const p of s.players) {
      if (!p.live || !p.alive || p.inPlane || p.st === PS.Plane) continue;
      const top = p.kills > 0 && p.kills === topK ? 6 + p.kills : 0;
      const score = (p.heat * 0.55 + p.kills * 2 + top + (p.bot ? 0 : 3)) * (phase === 2 ? endgame : 1);
      if (score < 3) continue;
      out.push({ key: `p${p.id}`, kind: "star", score, shot: { mode: "follow", target: p.id, group: [], fight: -1 }, line: "" });
    }
    // nothing at all: anyone on their feet (the top fragger first)
    if (!out.length) {
      const pick = s.players.filter((p) => p.live && p.alive && p.st !== PS.Plane).sort((a, b) => b.kills - a.kills || b.damage - a.damage)[0];
      if (pick) out.push({ key: `p${pick.id}`, kind: "star", score: 1, shot: { mode: "follow", target: pick.id, group: [], fight: -1 }, line: "" });
    }
    return out;
  }

  /** the warm-up: slow orbits, humans first, a new kong every WARMUP_SHOT_S */
  private warmup(): Candidate[] {
    const s = this.state, out: Candidate[] = [];
    const cur = this.current?.shot.target ?? -1, seed = Math.floor(now() / WARMUP_SHOT_S);
    for (const p of s.players) {
      if (!p.live || !p.alive) continue;
      // a stable pseudo-random order per WARMUP_SHOT_S window, so the pick changes every window, not every frame
      const r = ((p.id * 2654435761 + seed * 40503) >>> 0) % 1000 / 1000;
      const score = (p.bot ? 2 : 9) + p.heat * 0.2 + r * 3 + (p.id === cur ? 2 : 0);
      out.push({ key: `w${p.id}`, kind: "warmup", score, shot: { mode: "orbit", target: p.id, group: [], fight: -1 }, line: "" });
    }
    return out;
  }

  /** the POI the most diving kongs will land in (where they are + their drift until touchdown) */
  private hotDrop(air: CPlayer[], out: Candidate[]) {
    const terrainY = 0, byPoi = new Map<number, CPlayer[]>();
    for (const p of air) {
      const fall = p.st === PS.Glide ? 6 : 40, tLand = Math.min(25, Math.max(0, (p.y - terrainY) / fall));
      const lx = p.x + p.vx * tLand * 0.6, lz = p.z + p.vz * tLand * 0.6;
      let best = -1, bd = Infinity;
      POIS.forEach((q, i) => { const d = Math.hypot(q.x - lx, q.z - lz) - q.r * 1.3; if (d < bd) { bd = d; best = i; } });
      if (best >= 0 && bd < 120) (byPoi.get(best) ?? byPoi.set(best, []).get(best)!).push(p);
    }
    for (const [i, ps] of byPoi) {
      if (ps.length < 3) continue;
      const teams = new Set(ps.map((p) => p.team)).size;
      // after the opening drop these are redeploys (resurgence): still a story, a smaller one
      const opening = (this.cm?.phase ?? 1) === 1 || (this.cm?.time ?? 0) < 75;
      out.push({ key: `d${i}`, kind: "drop", score: (10 + ps.length * 3 + teams * 3) * (opening ? 1 : 0.6), shot: { mode: "drone", target: ps[0].id, group: ps.map((p) => p.id), fight: -1 },
        line: opening ? `HOT DROP — <i>${ps.length}</i> kongs${teams > 1 ? ` from ${teams} ${this.state.mode === "solo" ? "" : "squads "}` : " "}into ${POIS[i].name}` : `REDEPLOYS — <i>${ps.length}</i> kongs gliding back into ${POIS[i].name}` });
    }
  }

  /** squads closing on each other: the pre-cut before the first shot */
  private closing(out: Candidate[], endgame: number) {
    const s = this.state, teams = [...s.teams.values()].filter((t) => !t.out);
    const aliveOf = (tid: number) => s.teams.get(tid)!.members.map((id) => s.players[id]).filter((p) => p.alive && p.live && !p.inPlane && p.st !== PS.Freefall && p.st !== PS.Glide);
    for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
      const A = aliveOf(teams[i].id), B = aliveOf(teams[j].id);
      if (!A.length || !B.length) continue;
      let d = Infinity, pa: CPlayer | null = null, pb: CPlayer | null = null;
      for (const a of A) for (const b of B) { const dd = Math.hypot(a.x - b.x, a.z - b.z); if (dd < d) { d = dd; pa = a; pb = b; } }
      if (d > CLOSE_M || !pa || !pb) continue;
      // already fighting each other: the fight is the story
      if (pa.fight >= 0 && pa.fight === pb.fight) continue;
      // closing speed along the line between them (+ = getting closer)
      const nx = (pb.x - pa.x) / (d || 1), nz = (pb.z - pa.z) / (d || 1);
      const closing = (pa.vx * nx + pa.vz * nz) - (pb.vx * nx + pb.vz * nz);
      if (closing < 0.8 && d > 45) continue;
      const score = ((CLOSE_M - d) / CLOSE_M * 26 + Math.min(10, closing * 1.5) + (A.length + B.length) * 1.5) * endgame;
      const aggressor = (pa.vx * nx + pa.vz * nz) >= -(pb.vx * nx + pb.vz * nz) ? pa : pb;
      const group = [...A, ...B].map((p) => p.id);
      const shot: CamShot = d < 70 ? { mode: "drone", target: aggressor.id, group, fight: -1 } : { mode: "follow", target: aggressor.id, group, fight: -1 };
      out.push({ key: `c${Math.min(teams[i].id, teams[j].id)}-${Math.max(teams[i].id, teams[j].id)}`, kind: "closing", score, shot, line: d < 25 ? `${this.teamName(aggressor.team)} right on top of ${this.teamName(aggressor === pa ? pb.team : pa.team)}` : `${this.teamName(aggressor.team)} closing on ${this.teamName(aggressor === pa ? pb.team : pa.team)} — <i>${Math.round(d)} m</i>` });
    }
  }

  /** kongs outside the circle, racing it */
  private storm(out: Candidate[], endgame: number) {
    const cm = this.cm, st = cm?.storm; if (!cm || !st || st.phase < 1 || st.r > 3000) return;
    for (const p of this.state.players) {
      if (!p.alive || !p.live || p.inPlane || p.st === PS.Freefall || p.st === PS.Glide) continue;
      const out1 = Math.hypot(p.x - st.cx, p.z - st.cz) - st.r;
      if (out1 < 25) continue;
      const score = (6 + Math.min(14, out1 / 12) + (st.shrinking ? 6 : 0) + (p.hp < 50 ? 4 : 0)) * endgame;
      out.push({ key: `s${p.id}`, kind: "storm", score, shot: { mode: "follow", target: p.id, group: [], fight: -1 }, line: `${this.name(p)} racing the storm — <i>${Math.round(out1)} m</i> out` });
    }
  }

  // ---------------------------------------------------------------- words
  private name(p: CPlayer | undefined) { if (!p) return "?"; return `<span style="color:${teamLook(p.team).color}">${p.name}</span>`; }
  private teamName(team: number) {
    const s = this.state, look = teamLook(team);
    const label = s.mode === "solo" ? s.players.find((p) => p.team === team)?.name ?? look.name : `TEAM ${look.name}`;
    return `<span style="color:${look.color}">${label}</span>`;
  }
  private describe(c: Candidate, shot: CamShot): string {
    const s = this.state;
    const on = shot.mode !== "drone" && shot.target >= 0 ? ` — on ${this.name(s.players[shot.target])}${shot.mode === "pov" ? " (POV)" : ""}` : "";
    if (c.kind === "fight" && shot.fight >= 0) {
      const f = s.fight(shot.fight); if (!f) return this.line;
      const tp = f.joins.length ? f.joins[f.joins.length - 1] : null;
      const left = (team: number) => s.teams.get(team)?.members.filter((id) => s.players[id].alive).length ?? 0;
      let head: string;
      if (f.teams.length > 3) head = `<i>BRAWL</i> — ${f.teams.length} ${s.mode === "solo" ? "kongs" : "squads"}${tp && now() - tp.at < 20 ? `, ${this.teamName(tp.team)} the latest in` : ""}`;
      else if (tp && now() - tp.at < 20 && f.teams.length === 3) {
        const others = f.teams.filter((x) => x !== tp.team).map((x) => this.teamName(x)).join(" vs ");
        head = `${this.teamName(tp.team)} <i>third-partying</i> ${others}`;
      } else head = f.teams.map((x) => this.teamName(x)).join(" vs ");
      const tally = s.mode === "trios" && f.teams.length <= 3 ? ` (${f.teams.map(left).join("v")})` : "";
      const kills = f.kills ? ` · ${f.kills} down` : "";
      return `${head}${tally} at ${f.where}${kills}${on}`;
    }
    if (c.key === "win" || c.key.startsWith("t")) return c.line;
    if (c.kind === "endgame") {
      const teams = [...new Set(shot.group.map((id) => s.players[id].team))];
      return `<i>FINAL ${teams.length}</i> — ${teams.map((x) => this.teamName(x)).join(", ")}`;
    }
    if (c.kind === "star") {
      const p = s.players[shot.target]; if (!p) return "";
      let topK = 0; for (const q of s.players) if (q.alive && q.kills > topK) topK = q.kills;
      if (p.kills && p.kills === topK && p.kills >= 3) return `${this.name(p)} — <i>${p.kills} kills</i>, the one to beat`;
      if (now() - p.lastHurtAt < 3) return `${this.name(p)} under fire`;
      if (now() - p.lastShotAt < 3) return `${this.name(p)} opening up`;
      return `${this.name(p)}${p.kills ? ` · ${p.kills} kills` : ""} on the move`;
    }
    if (c.kind === "warmup") { const p = s.players[shot.target]; return p ? `WARM-UP — ${this.name(p)}${p.bot ? "" : " (player)"}` : "WARM-UP"; }
    return c.line + (c.kind === "closing" || c.kind === "storm" ? "" : on);
  }
}
