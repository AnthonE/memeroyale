// HIGHLIGHTS: the big moments of the match, caught as they happen and replayable with one click (replay.ts keeps
// REC_S seconds; older moments stay listed, greyed). What counts:
//   MULTI-KILL  — one kong downs 2+ enemies with no more than STREAK_S between kills (DOUBLE, TRIPLE, QUAD, RAMPAGE)
//   SQUAD WIPE  — the last of a squad goes down: credited to the squad that did it
//   LONG SHOT   — a kill from ≥ LONG_M (a sniper's ≥ 100 m)
//   CLUTCH      — the last kong of its squad standing wipes a squad that had 2+ up when it started (1v2, 1v3)
//   FIRST BLOOD — the first kill after the drop
// AUTO-REPLAY (on by default while the autopilot drives): the best fresh BIG moment (a squad wipe, a triple, a clutch, a
// 200 m+ shot) is replayed once at ¾ speed when the island calms down (no hot fight anywhere, the watched story quiet) —
// never more often than every AUTO_GAP_S, and never if it is already AUTO_LATE_S old. A replay costs live air time.
import { WEAPONS } from "../../../shared/world/map";
import type { ClientMatch } from "../game/client";
import type { CasterState, CPlayer } from "./state";
import type { Director } from "./director";
import { REC_S, type Replay } from "./replay";
import type { CamShot } from "./rig";
import { teamLook } from "./teams";
import { weaponName } from "./state";
import { UI } from "../ui/styles";

const STREAK_S = 7, LONG_M = 150, AUTO_GAP_S = 75, AUTO_CALM_S = 4, AUTO_LATE_S = 20, AUTO_WEIGHT = 3, AUTO_SPEED = 0.75;
/** a calm island for an auto-replay: no fight hotter than this */
const CALM_I = 120;
const SNIPER = WEAPONS.indexOf("sniper");

export type HlKind = "multi" | "wipe" | "long" | "clutch" | "first";
export interface Highlight {
  id: number; kind: HlKind; title: string; who: string; color: string;
  /** match time it happened (s), wall time (s), the replay window (ticks) */
  time: number; at: number; from: number; to: number;
  shot: Partial<CamShot>; weight: number; replayed: boolean;
}
const KIND_LABEL: Record<HlKind, string> = { multi: "MULTI", wipe: "WIPE", long: "LONG SHOT", clutch: "CLUTCH", first: "FIRST BLOOD" };
const MULTI = ["", "", "DOUBLE KILL", "TRIPLE KILL", "QUAD KILL"];

const now = () => performance.now() / 1000;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export class Highlights {
  readonly list: Highlight[] = [];
  autoReplay = true;
  private seq = 1;
  private readonly streak = new Map<number, { n: number; last: number; firstTick: number; lastTick: number; hl: Highlight | null; victims: number[] }>();
  /** the last kill on each squad (who, when) — a wipe is credited to it */
  private readonly lastOnTeam = new Map<number, { killer: number; tick: number; firstTick: number; at: number }>();
  private firstBlood = false;
  /** a lone survivor working through a squad: who, vs which squad, how many were up, its kills on it so far */
  private readonly clutch = new Map<number, { team: number; n: number; kills: number; tick: number }>();
  private lastAuto = -1e9;
  private el: HTMLElement | null = null; private listEl: HTMLElement | null = null; private autoBtn: HTMLButtonElement | null = null; private sig = "";

  constructor(private readonly cm: ClientMatch, private readonly state: CasterState, private readonly replay: Replay, private readonly director: Director) {
    state.listeners.push({
      kill: (killer, victim, weapon) => this.onKill(killer, victim, weapon),
      squadOut: (team) => this.onSquadOut(team),
    });
  }

  private add(h: Omit<Highlight, "id" | "at" | "time" | "replayed">): Highlight {
    const hl: Highlight = { ...h, id: this.seq++, at: now(), time: this.cm.time, replayed: false };
    this.list.unshift(hl); if (this.list.length > 14) this.list.length = 14;
    return hl;
  }
  private col(p: CPlayer | undefined) { return p ? teamLook(p.team).color : UI.yellow; }

  private onKill(killer: number, victim: number, weapon: number) {
    const s = this.state, tick = this.cm.lastEvTick, t = now();
    const k = killer >= 0 && killer !== victim ? s.players[killer] : null, v = s.players[victim];
    if (!v || this.cm.phase < 2) return;
    // the victim's squad: remember who hit it last (the wipe credit) and when this run on it began
    const prev = this.lastOnTeam.get(v.team);
    if (k) this.lastOnTeam.set(v.team, { killer: k.id, tick, firstTick: prev && t - prev.at < 25 ? prev.firstTick : tick, at: t });
    if (!k) return;
    if (!this.firstBlood) {
      this.firstBlood = true;
      this.add({ kind: "first", title: "FIRST BLOOD", who: `${k.name} → ${v.name}`, color: this.col(k), from: tick - 4 * 60, to: tick + 1.5 * 60, shot: { mode: "follow", target: k.id, fight: -1, group: [k.id, victim] }, weight: 1 });
    }
    // multi-kill streak
    let st = this.streak.get(k.id);
    if (!st || t - st.last > STREAK_S) { st = { n: 0, last: t, firstTick: tick, lastTick: tick, hl: null, victims: [] }; this.streak.set(k.id, st); }
    st.n++; st.last = t; st.lastTick = tick; st.victims.push(victim);
    if (st.n >= 2) {
      const title = st.n < MULTI.length ? MULTI[st.n] : `RAMPAGE ×${st.n}`;
      const shot: Partial<CamShot> = { mode: "follow", target: k.id, fight: -1, group: [k.id, ...st.victims] };
      if (st.hl) { Object.assign(st.hl, { title, from: st.firstTick - 3 * 60, to: tick + 1.5 * 60, weight: st.n, shot, replayed: false, at: t, time: this.cm.time }); const i = this.list.indexOf(st.hl); if (i >= 0) this.list.splice(i, 1); this.list.unshift(st.hl); }
      else st.hl = this.add({ kind: "multi", title, who: k.name, color: this.col(k), from: st.firstTick - 3 * 60, to: tick + 1.5 * 60, shot, weight: st.n });
    }
    // long shot: measured from the killer's last muzzle to the victim's last hit (the events' own positions — the drawn
    // kongs are interpolated, and mid-replay they are in the past)
    const d = this.replay.killDistance(k.id, victim);
    if (d >= LONG_M || (weapon === SNIPER && d >= 100)) {
      this.add({ kind: "long", title: `${Math.round(d)} M ${weapon === SNIPER ? "SNIPE" : "SHOT"}`, who: `${k.name} → ${v.name} · ${weaponName(weapon)}`, color: this.col(k), from: tick - 3.5 * 60, to: tick + 1.2 * 60,
        shot: { mode: weapon === SNIPER ? "pov" : "follow", target: k.id, fight: -1, group: [k.id, victim] }, weight: d >= 200 ? 3 : 2 });
    }
    // clutch: the killer is the last of its squad up and starts on a squad with two or more up — it is a CLUTCH if it
    // finishes that squad (onSquadOut); dying ends it
    this.clutch.delete(victim);
    if (s.mode === "trios") {
      const mates = s.teams.get(k.team)?.members.filter((id) => s.players[id].alive && id !== k.id).length ?? 0;
      let c = this.clutch.get(k.id);
      if (mates === 0 && (!c || c.team !== v.team)) {
        const foes = s.teams.get(v.team)?.members.filter((id) => s.players[id].alive || id === victim).length ?? 0;
        if (foes >= 2) { c = { team: v.team, n: foes, kills: 0, tick }; this.clutch.set(k.id, c); } else c = undefined;
      }
      if (c && c.team === v.team) c.kills++;
    }
  }

  private onSquadOut(team: number) {
    const s = this.state, w = this.lastOnTeam.get(team);
    if (!w || now() - w.at > 12) return;
    const k = s.players[w.killer]; if (!k) return;
    const victims = s.teams.get(team)?.members ?? [];
    const label = s.mode === "trios" ? `TEAM ${teamLook(k.team).name} WIPES ${teamLook(team).name}` : `${k.name} ELIMINATES ${s.players[victims[0]]?.name ?? "?"}`;
    if (s.mode === "solo") return;   // (solo: every kill is a "wipe" — the multi / long / first moments cover it)
    const c = this.clutch.get(k.id);
    if (c && c.team === team && c.kills >= 2) {
      this.clutch.delete(k.id);
      this.add({ kind: "clutch", title: `CLUTCH 1v${c.n}`, who: `${k.name} wipes TEAM ${teamLook(team).name} alone`, color: this.col(k), from: c.tick - 4 * 60, to: w.tick + 2 * 60,
        shot: { mode: "follow", target: k.id, fight: -1, group: [k.id, ...victims] }, weight: 3.5 });
      return;
    }
    this.add({ kind: "wipe", title: "SQUAD WIPE", who: label, color: this.col(k), from: Math.max(w.firstTick, w.tick - 8 * 60) - 2 * 60, to: w.tick + 2 * 60,
      shot: { mode: "drone", target: k.id, fight: -1, group: [...(s.teams.get(k.team)?.members ?? [k.id]), ...victims] }, weight: 3 });
  }

  play(h: Highlight, speed?: number) {
    const [lo] = this.replay.span();
    if (h.from < lo - 60) { this.toast("TOO OLD — THE REPLAY KEEPS THE LAST 90 SECONDS"); return; }
    h.replayed = true;
    this.replay.play({ from: h.from, to: Math.min(h.to, this.replay.liveTick() - 2), shot: h.shot, label: `${h.title} — ${h.who}`, speed: speed ?? 0.5 });
  }

  /** per frame: auto-replay when the action calms */
  update() {
    if (!this.autoReplay || !this.director.enabled || this.replay.active) return;
    const t = now(); if (t - this.lastAuto < AUTO_GAP_S) return;
    const fresh = this.list.filter((h) => !h.replayed && h.weight >= AUTO_WEIGHT && t - h.at > AUTO_CALM_S && t - h.at < AUTO_LATE_S);
    if (!fresh.length) return;
    // calm = no hot fight anywhere, and the director's own story has had no damage for a few seconds
    if (this.state.fights.some((f) => f.intensity > CALM_I)) return;
    const cur = this.director.current, f = cur && cur.shot.fight >= 0 ? this.state.fight(cur.shot.fight) : null;
    if (f && t - f.lastAt < 5) return;
    const h = fresh.sort((a, b) => b.weight - a.weight)[0];
    this.lastAuto = t; this.play(h, AUTO_SPEED);
  }

  // ---------------------------------------------------------------- the desk panel
  attach(deskEl: HTMLElement) {
    if (!cssOn) { const st = document.createElement("style"); st.textContent = HL_CSS; document.head.appendChild(st); cssOn = true; }
    this.el?.remove();
    const host = deskEl.querySelector<HTMLElement>(".kc-right") ?? deskEl;
    const el = this.el = document.createElement("div"); el.className = "p kc-hl";
    el.innerHTML = `<h4>HIGHLIGHTS <button class="kc-hl-auto"></button></h4><div class="kc-hl-list"></div>`;
    host.appendChild(el);
    this.listEl = el.querySelector(".kc-hl-list"); this.autoBtn = el.querySelector(".kc-hl-auto");
    this.autoBtn!.addEventListener("click", () => { this.autoReplay = !this.autoReplay; this.sig = ""; });
    this.listEl!.addEventListener("click", (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>("[data-hl]"); if (!r) return; const h = this.list.find((x) => x.id === +r.dataset.hl!); if (h) this.play(h); });
    this.sig = "";
  }
  /** the panel (throttled by its own signature) */
  frameUi() {
    if (!this.listEl || !this.autoBtn) return;
    const [lo] = this.replay.span(), t = now();
    const sig = `${this.autoReplay}|${this.list.map((h) => `${h.id}:${h.title}:${h.replayed}:${h.from < lo - 60 ? 0 : 1}`).join(",")}|${Math.floor(t / 5)}`;
    if (sig === this.sig) return; this.sig = sig;
    this.autoBtn.textContent = this.autoReplay ? "AUTO-REPLAY ON" : "AUTO-REPLAY OFF"; this.autoBtn.classList.toggle("on", this.autoReplay);
    this.listEl.innerHTML = this.list.length ? this.list.slice(0, 8).map((h) => {
      const old = h.from < lo - 60;
      return `<div class="kc-hl-row ${old ? "old" : ""}" data-hl="${h.id}" title="${old ? "older than the replay buffer" : "click to replay"}"><span class="k" style="--hc:${h.color}">${KIND_LABEL[h.kind]}</span><span class="t"><b>${esc(h.title)}</b> ${esc(h.who)}</span><time>${mmss(h.time)}</time><span class="pl">${old ? "" : "▶"}</span></div>`;
    }).join("") : `<div class="kc-empty">Multi-kills, squad wipes and long shots land here — click one to replay it.</div>`;
  }
  private toast(text: string) { const t = document.querySelector<HTMLElement>(".kc-toast"); if (t) { t.textContent = text; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 1600); } }
  dispose() { this.el?.remove(); this.el = null; this.listEl = null; }
}
void REC_S;

let cssOn = false;
const vh = (px: number) => `${(px / 10.8).toFixed(3)}vh`;
const HL_CSS = `
.kc-hl { padding: ${vh(8)} ${vh(10)}; flex: 0 0 auto; max-height: 34%; overflow-y: auto; }
.kc-hl h4 { display: flex; align-items: center; justify-content: space-between; }
.kc-hl-auto { font: 800 ${vh(11)} ${UI.cond}; letter-spacing: .12em; padding: ${vh(2)} ${vh(7)}; border-radius: ${vh(4)}; border: 1px solid rgba(255,255,255,.2); background: transparent; color: ${UI.creamDim}; }
.kc-hl-auto.on { border-color: #ff3b30; color: #ff6b5e; }
.kc-hl-row { display: grid; grid-template-columns: auto 1fr auto ${vh(14)}; gap: ${vh(7)}; align-items: center; padding: ${vh(4)} ${vh(4)}; border-radius: ${vh(5)}; cursor: pointer; font-size: ${vh(14.5)}; font-weight: 700; }
.kc-hl-row:hover { background: rgba(255,59,48,.14); }
.kc-hl-row.old { opacity: .4; cursor: default; }
.kc-hl-row .k { font-size: ${vh(11)}; letter-spacing: .1em; padding: ${vh(1)} ${vh(5)}; border-radius: ${vh(3)}; background: var(--hc); color: #111; font-weight: 800; }
.kc-hl-row .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kc-hl-row .t b { color: #fff; margin-right: ${vh(4)}; }
.kc-hl-row time { color: ${UI.creamDim}; font-size: ${vh(12)}; }
.kc-hl-row .pl { color: #ff3b30; font-size: ${vh(12)}; }
`;
