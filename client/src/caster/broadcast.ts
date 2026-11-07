// The BROADCAST layer: what stays on screen on the clean feed (H) and is all a PROGRAM window (?cast=CODE&program — the
// OBS output) shows. TV-grade and readable on a 1080p stream:
//   top-left    — MEME ROYALE bug, LIVE, the match clock (REPLAY when a replay runs: `replay` flag)
//   top-centre  — ALIVE / SQUADS / STORM counters, one pip per squad in its colour (dimmed when out), and the FIGHT banner
//                 ("TEAM RED vs TEAM BLUE · MANGO MARKET") whenever the camera is on a fight
//   top-right   — the kill feed (killer ▸ weapon icon ▸ victim, team colours, squads out in red), 5 lines, 9 s each
//   bottom-left — the LOWER THIRD of the watched kong (team slab, name, kills, damage, health / shield, the gun in hand),
//                 sliding in on every cut
//   bottom-ctr  — the FIGHT SCOREBOARD on a drone shot of a fight: one column per squad, every member's health
//   bottom-right— the top 3 fraggers
//   centre      — flashes: a squad eliminated, the winner
// Everything is diffed: a frame writes only what changed.
import type { ClientMatch } from "../game/client";
import type { CasterRig } from "./rig";
import type { CasterState, CPlayer, FeedItem } from "./state";
import { heldName, weaponName } from "./state";
import { teamLook } from "./teams";
import { esc, heldIcon, weaponIcon } from "./panels";

const el = (tag: string, cls: string, parent: HTMLElement, html?: string) => { const e = document.createElement(tag); e.className = cls; if (html !== undefined) e.innerHTML = html; parent.appendChild(e); return e; };
const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const set = (e: HTMLElement, html: string) => { if (e.dataset.h !== html) { e.dataset.h = html; e.innerHTML = html; } };

export class Broadcast {
  readonly el: HTMLElement;
  private readonly clock: HTMLElement; private readonly replayEl: HTMLElement;
  private readonly alive: HTMLElement; private readonly squads: HTMLElement; private readonly storm: HTMLElement; private readonly stormLbl: HTMLElement; private readonly pips: HTMLElement;
  private readonly fight: HTMLElement; private readonly feed: HTMLElement; private readonly l3: HTMLElement; private readonly fs: HTMLElement; private readonly board: HTMLElement; private readonly flash: HTMLElement;
  private feedSeen = -1; private readonly feedRows: Array<{ el: HTMLElement; at: number }> = [];
  private l3For = -2; private l3At = 0; private flashT = 0; private at = 0;
  /** set by the replay system: the bug says REPLAY */
  replay = false;

  constructor(private readonly state: CasterState, private readonly rig: CasterRig, private readonly cm: ClientMatch, parent: HTMLElement) {
    const root = this.el = el("div", "kb bc", parent);
    const bug = el("div", "kb-bug slab", root);
    el("div", "logo", bug, "MEME ROYALE"); el("div", "live", bug, "<i></i>LIVE");
    this.clock = el("div", "clock", bug); this.replayEl = el("div", "replay", bug, "REPLAY");
    const count = el("div", "kb-count", root), row = el("div", "row slab", count);
    const cell = (cls: string, label: string) => { const c = el("div", `cell ${cls}`, row); const b = el("b", "", c); const s = el("span", "", c, label); return [b, s, c] as const; };
    [this.alive] = cell("", "ALIVE"); [this.squads] = cell("", "SQUADS");
    const [sb, sl] = cell("storm", "STORM"); this.storm = sb; this.stormLbl = sl;
    this.pips = el("div", "kb-pips slab", count);
    this.fight = el("div", "kb-fight", root);
    this.feed = el("div", "kb-feed", root);
    this.l3 = el("div", "kb-l3", root);
    this.fs = el("div", "kb-fs", root);
    this.board = el("div", "kb-board slab", root);
    this.flash = el("div", "kb-flash", root);
  }

  /** the storm counter: [big text, label, closing?] (the desk's top bar uses it too) */
  static stormText(cm: ClientMatch): [string, string, boolean] {
    const st = cm.storm;
    if (!cm.plan || cm.phase < 1 || cm.range) return ["—", "STORM", false];
    if (st.done) return ["0:00", "FINAL STORM", true];
    if (st.phase === 0) return [mmss(st.timer), "FIRST CIRCLE IN", false];
    return [mmss(st.timer), st.shrinking ? `STORM ${st.phase} CLOSING` : `STORM ${st.phase} MOVES IN`, st.shrinking];
  }

  update(dt: number) {
    const now = performance.now(); if (now - this.at < 80) return; this.at = now;
    const s = this.state, cm = this.cm, rig = this.rig;
    this.clock.textContent = mmss(cm.time);
    this.replayEl.style.display = this.replay ? "flex" : "none";
    set(this.alive, String(cm.phase === 0 ? (cm.names.length || 50) : s.aliveCount || cm.alive));
    set(this.squads, String(cm.squads));
    const [st, lbl, closing] = Broadcast.stormText(cm);
    set(this.storm, st); set(this.stormLbl, lbl); this.storm.parentElement!.classList.toggle("closing", closing);
    // squad pips
    const teams = [...s.teams.values()].sort((a, b) => a.id - b.id);
    set(this.pips, teams.map((t) => `<i class="${t.out ? "out" : ""}" style="--tc:${t.look.color}"></i>`).join(""));
    this.pips.style.display = teams.length > 1 && teams.length <= 25 ? "" : "none";
    // fight banner + scoreboard
    const f = rig.fight >= 0 ? s.fight(rig.fight) : rig.target >= 0 && s.players[rig.target]?.fight >= 0 ? s.fight(s.players[rig.target].fight) : null;
    const solo = s.mode === "solo";
    if (f) {
      const sides = f.teams.slice(0, 4).map((t) => { const look = teamLook(t), team = s.teams.get(t); const alive = team?.members.filter((id) => s.players[id].alive).length ?? 0;
        const name = solo ? s.players.find((p) => p.team === t)?.name ?? look.name : `TEAM ${look.name}`;
        return `<span class="t" style="--tc:${look.color}">${esc(name)}${solo ? "" : `<small>${alive} UP</small>`}</span>`; }).join(`<span class="x">VS</span>`);
      set(this.fight, `<div class="vs slab">${sides}</div><div class="where">${esc(f.where)}</div>`);
    }
    this.fight.classList.toggle("on", !!f && cm.phase === 2);
    const scoreOn = !!f && (rig.mode === "drone" || rig.mode === "overhead") && rig.fight === f.id && !solo;
    if (scoreOn) set(this.fs, f!.teams.slice(0, 3).map((t) => {
      const look = teamLook(t), team = s.teams.get(t); if (!team) return "";
      const alive = team.members.filter((id) => s.players[id].alive).length;
      return `<div class="col slab" style="--tc:${look.color}"><h6>${look.name}<span>${alive}/${team.members.length} UP</span></h6>${team.members.map((id) => { const p = s.players[id];
        return `<div class="m ${p.alive || p.resurging ? "" : "dead"}"><span>${esc(p.name)}</span><span><i class="h"><b style="width:${p.alive ? Math.min(100, p.hp) : 0}%"></b></i><i class="s"><b style="width:${p.alive ? Math.min(100, p.shield) : 0}%"></b></i></span></div>`; }).join("")}</div>`;
    }).join(""));
    this.fs.classList.toggle("on", scoreOn);
    // lower third: the watched kong (not on a wide fight shot, not in free cam)
    const p = rig.target >= 0 && !scoreOn && rig.mode !== "free" && rig.mode !== "overhead" ? s.players[rig.target] : null;
    this.lowerThird(p && p.live ? p : null);
    // feed
    this.feedTick(now);
    // top 3
    const top = s.players.filter((q) => q.stat && q.kills > 0).sort((a, b) => b.kills - a.kills || b.damage - a.damage).slice(0, 3);
    set(this.board, top.length ? `<h6>TOP FRAGGERS</h6>${top.map((q, i) => `<div class="r"><em>${i + 1}</em><span class="n ${q.alive || q.resurging ? "" : "dead"}" style="--tc:${teamLook(q.team).color}">${esc(q.name)}</span><b>${q.kills}</b></div>`).join("")}` : "");
    this.board.style.display = top.length && !scoreOn ? "" : "none";
    if (this.flashT > 0) { this.flashT -= Math.max(dt, 0.08); if (this.flashT <= 0) this.flash.classList.remove("on"); }
  }

  private lowerThird(p: CPlayer | null) {
    const id = p ? p.id : -1;
    // a cut: the card drops out, then slides back in with the new kong (two updates later — never waiting on a
    // requestAnimationFrame, which a background OBS / headless page may not run)
    if (id !== this.l3For) { this.l3For = id; this.l3At = performance.now(); this.l3.classList.remove("on"); }
    if (!p) return;
    if (!this.l3.classList.contains("on") && performance.now() - this.l3At > 60) this.l3.classList.add("on");
    const look = teamLook(p.team), solo = this.state.mode === "solo";
    this.l3.style.setProperty("--tc", look.color);
    this.l3.classList.toggle("hurt", performance.now() / 1000 - p.lastHurtAt < 0.8);
    const icon = heldIcon(p.held);
    const status = p.inPlane ? "ON THE PLANE" : p.resurging ? `BACK IN ${Math.ceil(Math.max(0, p.respawnIn))}` : !p.alive ? (p.placement ? `OUT · #${p.placement}` : "DOWN") : "";
    set(this.l3, `<div class="team">${solo ? "SOLO" : esc(look.name)}</div><div class="body slab"><div class="nm"><b>${esc(p.name)}</b><span>${p.bot ? "BOT" : "PLAYER"}</span>${status ? `<span class="tag">${status}</span>` : ""}</div>
      <div class="line"><div class="bars"><i class="h"><b style="width:${p.alive ? Math.min(100, p.hp) : 0}%"></b></i><i class="s"><b style="width:${p.alive ? Math.min(100, p.shield) : 0}%"></b></i></div>
      <div class="st"><b>${p.kills}</b><span>KILLS</span></div><div class="st"><b>${p.damage}</b><span>DMG</span></div>
      ${p.alive ? `<div class="gun">${icon ? `<img src="${icon}" alt="">` : ""}${esc(heldName(p.held))}</div>` : ""}</div></div>`);
  }

  private feedTick(now: number) {
    const s = this.state, fresh: FeedItem[] = [];
    for (const f of s.feed) { if (f.id <= this.feedSeen) break; fresh.push(f); }
    if (fresh.length) this.feedSeen = fresh[0].id;
    for (const f of fresh.reverse()) {
      const html = this.feedRow(f); if (!html) continue;
      const row = document.createElement("div"); row.innerHTML = html; const e = row.firstElementChild as HTMLElement;
      this.feed.prepend(e); this.feedRows.unshift({ el: e, at: now });
      if (f.kind === "squad-out" && f.a !== undefined) this.flashOn(this.state.mode === "trios" ? `TEAM ${teamLook(f.a).name}` : s.players.find((p) => p.team === f.a)?.name ?? "", "ELIMINATED", teamLook(f.a).color, 2.6);
      if (f.kind === "win" && f.a !== undefined) this.flashOn(this.state.mode === "trios" ? `TEAM ${teamLook(f.a).name}` : s.players.find((p) => p.team === f.a)?.name ?? "", "VICTORY ROYALE", teamLook(f.a).color, 6);
    }
    for (let i = this.feedRows.length - 1; i >= 0; i--) {
      const r = this.feedRows[i], age = now - r.at;
      if (i >= 5 || age > 9000) { r.el.classList.add("old"); if (age > 9600 || i >= 7) { r.el.remove(); this.feedRows.splice(i, 1); } }
    }
  }
  private feedRow(f: FeedItem): string | null {
    const s = this.state;
    if ((f.kind === "kill" || f.kind === "down") && f.b !== undefined) {
      const a = f.a !== undefined && f.a >= 0 && f.a !== f.b ? s.players[f.a] : null, b = s.players[f.b];
      const icon = f.weapon !== undefined ? weaponIcon(f.weapon) : null;
      const w = icon ? `<img src="${icon}" alt="">` : `<span class="w">${esc(weaponName(f.weapon ?? -1))}</span>`;
      const ka = a ? teamLook(a.team).color : "#888", kb = teamLook(b.team).color;
      return `<div class="kb-k slab ${f.final ? "final" : ""}" style="--ka:${ka};--kb:${kb}">${a ? `<span class="a">${esc(a.name)}</span>` : `<span class="a" style="--ka:#888">&nbsp;</span>`}${w}<span class="b">${esc(b.name)}</span></div>`;
    }
    if (f.kind === "squad-out") return `<div class="kb-k out">${esc(f.text)}</div>`;
    return null;
  }
  flashOn(big: string, small: string, color: string, s: number) {
    this.flash.style.setProperty("--tc", color);
    this.flash.innerHTML = `<b>${esc(big)}</b><span>${esc(small)}</span>`;
    this.flash.classList.add("on"); this.flashT = s;
  }
}
