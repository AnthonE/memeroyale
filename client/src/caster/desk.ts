// The caster desk: everything a commentator reads at a glance, laid over the live view.
//   top        — phase, match clock, players alive, squads left, the storm
//   top-left   — seat + lobby code, AUTO / MANUAL, what the director is doing, the other seats
//   left       — every squad: colour, alive dots, kills; every kong: health / shield, held weapon, kills (click = follow,
//                double-click = POV, click a squad header = drone on that squad)
//   right      — the feed (eliminations, squads out, storm, phases) and the live FIGHTS (click = drone on it)
//   bottom     — the watched kong's card (health, shield, loadout, kills / damage / bucks) and the camera bar
//   bottom-left— the minimap (every kong in its team colour, fights glowing, the storm; click = free cam there)
// DOM writes are throttled (roster / fights 6 Hz, card 15 Hz) and diffed per row.
import { RARITIES, RARITY_COLOR, WEAPONS, CONSUMABLES } from "../../../shared/world/map";
import { WEAPON_DEFS, CONSUMABLE_DEFS } from "../../../shared/sim/const";
import { SK } from "../../../shared/sim/player";
import { itemIconUrl } from "../ui/icons";
import type { PaintedMap } from "../ui/mapimage";
import type { ClientMatch } from "../game/client";
import type { CasterRig, CamMode } from "./rig";
import { CAM_LABEL } from "./rig";
import { heldName, type CasterState, type CFight, type CPlayer, type FeedItem } from "./state";
import { teamLook } from "./teams";
import { DESK_CSS } from "./styles";
import { drawCasterMap } from "./map";
import { Broadcast } from "./broadcast";
import { BROADCAST_CSS } from "./broadcast-css";
import { lastResults, leaderboardHtml, popoverHtml, resultsHtml, weaponIcon } from "./panels";

export interface DeskActions {
  follow(id: number, mode?: CamMode): void;
  fight(id: number): void;
  team(team: number): void;
  setMode(mode: CamMode): void;
  toggleAuto(): void;
  freeAt(x: number, z: number): void;
  followSeat(seat: number): void;
  toggleListen?(team: number): void;
  /** (seats) PRODUCER: put a seat's camera on air · offer my shot to the other seats · cut to the last ping */
  take?(seat: number): void; ping?(): void; acceptPing?(): void;
}
export interface SeatInfo { seat: number; name: string; me: boolean; following: boolean; watching: string;
  /** (seats) this seat's camera is on air · it is a PROGRAM window · it is the producer · it runs the autopilot */
  onAir?: boolean; program?: boolean; producer?: boolean; auto?: boolean }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", parent?: HTMLElement, html?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; parent?.appendChild(e); return e; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const PHASE = ["WARM-UP", "PLANE", "LIVE", "RESULTS"];

let cssOn = false;

export class CasterDesk {
  readonly el: HTMLElement;
  private readonly topPhase: HTMLElement; private readonly topClock: HTMLElement; private readonly topAlive: HTMLElement; private readonly topSquads: HTMLElement; private readonly topStorm: HTMLElement; private readonly stormBox: HTMLElement;
  private readonly autoBtn: HTMLButtonElement; private readonly dirLine: HTMLElement; private readonly seatTag: HTMLElement; private readonly seatsEl: HTMLElement;
  private readonly list: HTMLElement; private readonly rosterCount: HTMLElement;
  private readonly feedUl: HTMLElement; private readonly fightsEl: HTMLElement;
  private readonly card: HTMLElement; private readonly camBar: HTMLElement;
  private readonly mini: HTMLCanvasElement; private readonly tac: HTMLElement; private readonly tacCanvas: HTMLCanvasElement;
  private readonly toastEl: HTMLElement; private readonly help: HTMLElement;
  private rosterAt = 0; private cardAt = 0; private feedTop = -1; private toastT = 0;
  private readonly teamEls = new Map<number, { root: HTMLElement; head: HTMLElement; rows: Map<number, HTMLElement>; sig: string }>();
  /** listen-in state per team (set by the voice module) */
  listening = new Set<number>(); speaking = new Set<number>();
  seats: SeatInfo[] = [];
  auto = false; dirText = "";
  tactical = false;
  /** the TV layer (clean feed / PROGRAM) */
  readonly broadcast: Broadcast;
  /** this window is a PROGRAM output: nothing but the broadcast */
  program = false;
  private tab: "fights" | "board" = "fights";
  private readonly boardEl: HTMLElement; private readonly tabs: HTMLElement;
  private readonly pop: HTMLElement; private popFor = -1; private popAnchor: HTMLElement | null = null;
  private readonly pingEl: HTMLElement; private pingGo: (() => void) | null = null;
  private readonly resultsEl: HTMLElement; private resultsOn = false;
  /** the seat panel grows (a two-line director line, the seat strip, the seat actions): the roster starts below it */
  private seatEl!: HTMLElement; private rosterEl!: HTMLElement; private rosterTop = -1;

  constructor(private readonly state: CasterState, private readonly rig: CasterRig, private readonly cm: ClientMatch, private readonly map: PaintedMap, readonly code: string, private readonly act: DeskActions) {
    if (!cssOn) { const st = document.createElement("style"); st.textContent = DESK_CSS + BROADCAST_CSS; document.head.appendChild(st); cssOn = true; }
    const root = this.el = el("div", "kc");
    // top bar
    const top = el("div", "p kc-top", root);
    const cell = (cls: string, label: string) => { const d = el("div", cls, top); const b = el("b", "", d); el("span", "", d, label); return b; };
    this.topPhase = cell("phase", "PHASE"); this.topClock = cell("", "MATCH"); this.topAlive = cell("", "ALIVE"); this.topSquads = cell("", "SQUADS");
    this.topStorm = cell("storm", "STORM"); this.stormBox = this.topStorm.parentElement!;
    // seat + autopilot
    const seat = this.seatEl = el("div", "p kc-seat", root);
    const r1 = el("div", "row", seat);
    this.seatTag = el("span", "tag", r1);
    el("span", "kp-tally", r1, "ON AIR");
    this.autoBtn = el("button", "kc-auto", r1, "AUTO") as HTMLButtonElement;
    this.autoBtn.addEventListener("click", () => this.act.toggleAuto());
    this.dirLine = el("div", "kc-dir", seat);
    this.seatsEl = el("div", "kc-seats", seat);
    this.seatsEl.addEventListener("click", (e) => {
      const t = e.target as HTMLElement, take = t.closest<HTMLElement>("[data-take]");
      if (take) { this.act.take?.(+take.dataset.take!); return; }
      const s = t.closest<HTMLElement>("[data-seat]"); if (s) this.act.followSeat(+s.dataset.seat!);
    });
    // (seats) PING my shot to the other seats; the producer's TAKE (my camera on air)
    const acts = el("div", "acts kc-desk-only", seat);
    const pingB = el("button", "", acts, "<kbd>N</kbd>PING SEATS"); pingB.addEventListener("click", () => this.act.ping?.());
    const takeB = el("button", "take", acts, "<kbd>ENTER</kbd>TAKE MY CAMERA"); takeB.dataset.takeMe = "1";
    takeB.addEventListener("click", () => { const me = this.seats.find((x) => x.me); if (me) this.act.take?.(me.seat); });
    // roster
    const ros = this.rosterEl = el("div", "p kc-roster", root);
    const h = el("h4", "", ros, "SQUADS "); this.rosterCount = el("small", "", h);
    this.list = el("div", "kc-list", ros);
    this.list.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const vox = t.closest<HTMLElement>("[data-vox]"); if (vox) { this.act.toggleListen?.(+vox.dataset.vox!); e.stopPropagation(); return; }
      const pl = t.closest<HTMLElement>("[data-pid]"); if (pl) { this.act.follow(+pl.dataset.pid!); return; }
      const tm = t.closest<HTMLElement>("[data-team]"); if (tm) this.act.team(+tm.dataset.team!);
    });
    this.list.addEventListener("dblclick", (e) => { const pl = (e.target as HTMLElement).closest<HTMLElement>("[data-pid]"); if (pl) this.act.follow(+pl.dataset.pid!, "pov"); });
    // right column
    const right = el("div", "kc-right", root);
    const feed = el("div", "p kc-feed", right); el("h4", "", feed, "FEED"); this.feedUl = el("ul", "", feed);
    this.feedUl.addEventListener("click", (e) => { const a = (e.target as HTMLElement).closest<HTMLElement>("[data-pid]"); if (a) this.act.follow(+a.dataset.pid!); });
    const fights = el("div", "p kc-fights", right);
    // (desk) two tabs share the panel: the live fights and the leaderboard (B)
    this.tabs = el("div", "kp-tabs", fights, `<button data-tab="fights" class="on">LIVE FIGHTS</button><button data-tab="board">LEADERBOARD</button>`);
    this.tabs.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]"); if (b) this.setTab(b.dataset.tab as "fights" | "board"); });
    this.fightsEl = el("div", "", fights);
    this.fightsEl.addEventListener("click", (e) => { const f = (e.target as HTMLElement).closest<HTMLElement>("[data-fight]"); if (f) this.act.fight(+f.dataset.fight!); });
    this.boardEl = el("div", "hide", fights);
    this.boardEl.addEventListener("click", (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>("[data-pid]"); if (r) this.act.follow(+r.dataset.pid!); });
    // bottom
    const bottom = el("div", "kc-bottom", root);
    this.card = el("div", "p kc-card", bottom);
    this.camBar = el("div", "p kc-cams", bottom);
    const modes: CamMode[] = ["follow", "pov", "drone", "orbit", "overhead", "free"];
    modes.forEach((m, i) => { const b = el("button", "", this.camBar, `<kbd>${i + 1}</kbd>${CAM_LABEL[m]}`); b.dataset.mode = m; b.addEventListener("click", () => this.act.setMode(m)); });
    el("div", "sep", this.camBar);
    const tacB = el("button", "", this.camBar, "<kbd>M</kbd>TACTICAL MAP"); tacB.dataset.tac = "1"; tacB.addEventListener("click", () => this.setTactical(!this.tactical));
    // minimap
    const mini = el("div", "p kc-mini", root); this.mini = el("canvas", "", mini) as HTMLCanvasElement; el("div", "lbl", mini, "ISLAND");
    this.mini.width = this.mini.height = 540;
    this.mini.addEventListener("click", (e) => this.mapClick(this.mini, e));
    // tactical
    this.tac = el("div", "kc-tac hide", root); this.tacCanvas = el("canvas", "", this.tac) as HTMLCanvasElement; this.tacCanvas.width = this.tacCanvas.height = 1400;
    this.tacCanvas.addEventListener("click", (e) => this.mapClick(this.tacCanvas, e));
    this.tac.addEventListener("click", (e) => { if (e.target === this.tac) this.setTactical(false); });
    // toast + help
    this.toastEl = el("div", "kc-toast", root);
    // (desk) hover a kong (roster / leaderboard): its full card
    this.pop = el("div", "p kp-pop hide", root);
    const hover = (e: MouseEvent) => { const r = (e.target as HTMLElement).closest<HTMLElement>("[data-pid]"); this.popAnchor = r; this.popFor = r ? +r.dataset.pid! : -1; if (!r) this.pop.classList.add("hide"); else this.popover(); };
    this.list.addEventListener("mouseover", hover); this.boardEl.addEventListener("mouseover", hover);
    this.list.addEventListener("mouseleave", () => { this.popFor = -1; this.pop.classList.add("hide"); }); this.boardEl.addEventListener("mouseleave", () => { this.popFor = -1; this.pop.classList.add("hide"); });
    // (seats) another seat's "look at this!"
    this.pingEl = el("div", "p kp-ping kc-desk-only", root);
    this.pingEl.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("button")) this.pingGo?.(); });
    // the broadcast layer (clean feed / PROGRAM) and the results card (both)
    this.broadcast = new Broadcast(state, rig, cm, root);
    this.resultsEl = el("div", "kb-results bc", root);
    this.resultsEl.addEventListener("click", () => { if (!this.program) this.resultsEl.classList.remove("on"); });
    this.help = el("div", "kc-help hide", root, `<div class="p bc"><h3>CASTER DESK — KEYS</h3>
      <div><kbd>SPACE / P</kbd>autopilot on / off</div><div><kbd>1 – 6</kbd>follow · pov · drone · orbit · overhead · free</div>
      <div><kbd>TAB / SHIFT+TAB</kbd>next / previous player alive</div><div><kbd>F</kbd>drone on the hottest fight</div>
      <div><kbd>G</kbd>cycle the live fights</div><div><kbd>T</kbd>follow the top fragger</div>
      <div><kbd>C</kbd>re-chase (camera back behind)</div><div><kbd>M</kbd>tactical map</div>
      <div><kbd>B</kbd>leaderboard / live fights</div><div><kbd>H</kbd>clean feed (broadcast only)</div>
      <div><kbd>L</kbd>listen in on the watched squad</div><div><kbd>R</kbd>instant replay of the shot (R / ESC = live)</div><div><kbd>[ ]</kbd>replay speed ¼× · ½× · 1×</div><div><kbd>CLICK</kbd>a HIGHLIGHT to replay it</div>
      <div><kbd>X</kbd>x-ray (players through walls): auto in wide shots · on · off</div><div><kbd>I</kbd>nameplates + team markers on / off</div><div><kbd>N</kbd>ping your shot to the other seats</div>
      <div><kbd>Y</kbd>go to the last ping</div><div><kbd>ENTER</kbd>producer: put your camera on air</div>
      <div><kbd>WASD QE</kbd>fly (free cam), Shift = fast</div><div><kbd>DRAG / WHEEL</kbd>orbit / zoom</div>
      <div><kbd>CLICK</kbd>a player (roster / feed / board) to follow, double-click = POV</div><div><kbd>CLICK A SEAT</kbd>mirror that seat's camera</div>
      <div><kbd>?</kbd>this sheet</div><div><kbd>ESC</kbd>close the map / this sheet</div>
      <div><kbd>PROGRAM OUT</kbd>open ?cast=CODE&amp;program in OBS: the clean feed of the camera on air</div></div>`);
    this.help.addEventListener("click", () => this.help.classList.add("hide"));
  }

  toggleHelp() { this.help.classList.toggle("hide"); }
  /** Esc: the sheet first, then the map; true when something closed */
  closeOverlay(): boolean { if (!this.help.classList.contains("hide")) { this.help.classList.add("hide"); return true; } if (this.tactical) { this.setTactical(false); return true; } return false; }
  setTactical(on: boolean) { this.tactical = on; this.tac.classList.toggle("hide", !on); this.camBar.querySelector<HTMLElement>("[data-tac]")?.classList.toggle("on", on); }
  setClean(on: boolean) { this.el.classList.toggle("clean", on); }
  /** a PROGRAM output window: the broadcast only, for good (H shows the desk for a look, the output stays clean) */
  setProgram(on: boolean) { this.program = on; this.el.classList.toggle("program", on); this.setClean(on); }
  setTab(t: "fights" | "board") { this.tab = t; for (const b of this.tabs.querySelectorAll<HTMLElement>("[data-tab]")) b.classList.toggle("on", b.dataset.tab === t); this.fightsEl.classList.toggle("hide", t !== "fights"); this.boardEl.classList.toggle("hide", t !== "board"); this.rosterAt = 0; }
  toggleBoard() { this.setTab(this.tab === "board" ? "fights" : "board"); }
  /** (seats) another seat offers its shot */
  showPing(who: string, what: string, go: () => void) {
    this.pingGo = go;
    this.pingEl.innerHTML = `<div><b>${esc(who)} · LOOK AT THIS</b><span>${esc(what)}</span></div><button>GO<kbd>Y</kbd></button>`;
    this.pingEl.classList.add("on");
  }
  hidePing() { this.pingEl.classList.remove("on"); this.pingGo = null; }
  /** Y: take the offered shot */
  acceptPing() { this.pingGo?.(); }
  get clean() { return this.el.classList.contains("clean"); }
  toast(text: string) { if (this.program) return; this.toastEl.textContent = text; this.toastEl.classList.add("on"); this.toastT = 1.6; }
  setVisible(v: boolean) { this.el.style.display = v ? "" : "none"; }
  dispose() { this.el.remove(); }

  private mapClick(c: HTMLCanvasElement, e: MouseEvent) {
    const r = c.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    const [x, z] = this.map.toWorld(u * this.map.sizePx, v * this.map.sizePx);
    // a kong near the click: follow it; else fly there
    let best = -1, bd = (this.map.half * 2 * 0.02) ** 2;
    for (const p of this.state.players) { if (!p.live || !p.alive) continue; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p.id; } }
    if (best >= 0) this.act.follow(best); else this.act.freeAt(x, z);
    if (c === this.tacCanvas) this.setTactical(false);
  }

  update(dt: number) {
    const now = performance.now(), cm = this.cm, s = this.state;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove("on"); }
    // top bar
    this.topPhase.textContent = PHASE[cm.phase] ?? "—";
    this.topClock.textContent = mmss(cm.phase >= 2 ? cm.time : cm.phase === 0 ? cm.time : cm.time);
    this.topAlive.textContent = String(cm.phase === 0 ? (cm.names.length || 50) : s.aliveCount || cm.alive);   // trios seats 48
    this.topSquads.textContent = String(cm.squads);
    const [stT, stL, stC] = Broadcast.stormText(cm);
    if (this.topStorm.textContent !== stT) this.topStorm.textContent = stT;
    const stLbl = this.stormBox.lastElementChild as HTMLElement; if (stLbl.textContent !== stL) stLbl.textContent = stL;
    this.stormBox.classList.toggle("closing", stC);
    this.broadcast.update(dt);
    this.el.classList.toggle("onair", !!this.seats.find((x) => x.me && x.onAir) && this.seats.length > 1);
    // the results phase: the card (desk + broadcast), kept for the caster lobby afterwards
    if (cm.phase === 3 && !this.resultsOn) { const h = resultsHtml(s, cm.time); if (h) { this.resultsOn = true; lastResults.html = h; this.resultsEl.innerHTML = h; this.resultsEl.classList.add("on"); } }
    else if (cm.phase !== 3 && this.resultsOn) { this.resultsOn = false; this.resultsEl.classList.remove("on"); }
    // seat line + director
    this.seatTag.innerHTML = `CASTER · LOBBY <span class="code">${esc(this.code)}</span>`;
    this.autoBtn.classList.toggle("on", this.auto); this.autoBtn.textContent = this.auto ? "AUTO ●" : "MANUAL";
    if (this.dirLine.innerHTML !== this.dirText) this.dirLine.innerHTML = this.dirText;
    for (const b of this.camBar.querySelectorAll<HTMLElement>("[data-mode]")) b.classList.toggle("on", b.dataset.mode === this.rig.mode);
    if (now - this.rosterAt > 160) {
      const top = Math.round(this.seatEl.offsetTop + this.seatEl.offsetHeight + innerHeight * 0.009);
      if (top !== this.rosterTop && this.seatEl.offsetHeight > 0) { this.rosterTop = top; this.rosterEl.style.top = `${top}px`; }
      this.rosterAt = now; this.roster(); if (this.tab === "fights") this.fights(); else this.board(); this.seatsLine(); if (this.popFor >= 0) this.popover(); }
    if (now - this.cardAt > 66) { this.cardAt = now; this.targetCard(); this.feed(); }
    // maps
    drawCasterMap(this.mini, this.map, s, this.rig, cm, 1);
    if (this.tactical) drawCasterMap(this.tacCanvas, this.map, s, this.rig, cm, 0);
  }

  private seatsLine() {
    const sig = JSON.stringify(this.seats);
    if (this.seatsEl.dataset.sig === sig) return; this.seatsEl.dataset.sig = sig;
    const producer = this.seats.some((x) => x.me && x.producer), multi = this.seats.filter((x) => !x.program).length > 1;
    this.seatsEl.innerHTML = this.seats.map((x) => x.program
      ? `<span class="s" title="a PROGRAM output window (OBS)">▣ PROGRAM OUT</span>`
      : `<span class="s ${x.me ? "me" : ""} ${x.following ? "on" : ""} ${x.onAir && multi ? "onair" : ""}" data-seat="${x.seat}" title="${esc(x.watching)}${x.auto ? " (autopilot)" : ""}">${x.producer ? "★ " : ""}SEAT ${x.seat + 1} · ${esc(x.name)}${x.me ? " (YOU)" : ""}${x.onAir && multi ? '<span class="air">● AIR</span>' : ""}${producer && !x.onAir ? `<button class="take" data-take="${x.seat}">TAKE</button>` : ""}</span>`).join("");
    const takeMe = this.el.querySelector<HTMLElement>("[data-take-me]"); if (takeMe) takeMe.style.display = producer ? "" : "none";
    // one seat alone has nobody to ping or to put on air: the seat actions only show with company
    const acts = this.seatEl.querySelector<HTMLElement>(".acts"); if (acts) acts.style.display = multi ? "" : "none";
  }

  private roster() {
    const s = this.state, teams = [...s.teams.values()].sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.alive - a.alive || b.kills - a.kills || a.id - b.id);
    this.rosterCount.textContent = `${teams.filter((t) => !t.out).length} / ${teams.length} LEFT`;
    const solo = s.mode === "solo";
    teams.forEach((t, order) => {
      let te = this.teamEls.get(t.id);
      if (!te) {
        const root = el("div", "kc-team"); root.dataset.team = String(t.id); root.style.setProperty("--tc", t.look.color);
        const head = el("div", "th", root);
        te = { root, head, rows: new Map(), sig: "" }; this.teamEls.set(t.id, te);
      }
      if (this.list.children[order] !== te.root) this.list.insertBefore(te.root, this.list.children[order] ?? null);
      const fighting = t.members.some((id) => s.players[id].fight >= 0);
      te.root.classList.toggle("out", t.out); te.root.classList.toggle("fighting", fighting && !t.out);
      const dots = t.members.map((id) => { const p = s.players[id]; return p.alive ? "●" : p.resurging ? "◌" : "✕"; }).join("");
      const sig = `${t.alive}|${t.kills}|${fighting}|${t.out}|${t.placement}|${this.listening.has(t.id)}|${this.speaking.has(t.id)}|${dots}`;
      if (sig !== te.sig) {
        te.sig = sig;
        const name = solo ? (s.players[t.members[0]]?.name ?? t.look.name) : t.look.name;
        te.head.innerHTML = `<span class="nm">${esc(name)}</span>${solo ? "" : `<span>${dots}</span>`}${fighting && !t.out ? '<span class="fire">IN A FIGHT</span>' : ""}${t.out ? `<span class="k">#${t.placement || "—"}</span>` : `<span class="k">${t.kills} KILLS</span>`}${solo ? "" : `<span class="vox ${this.listening.has(t.id) ? "on" : ""}" data-vox="${t.id}" title="listen in">${this.speaking.has(t.id) ? "◉" : "♪"}</span>`}`;
      }
      if (solo) { te.head.dataset.pid = String(t.members[0]); te.root.dataset.pid = String(t.members[0]); }
      for (const id of solo ? [] : t.members) {
        const p = s.players[id];
        let row = te.rows.get(id);
        if (!row) { row = el("div", "kc-pl", te.root, `<span class="st"></span><span class="n"></span><span class="kc-bars"><i class="h"><b></b></i><i class="s"><b></b></i></span><span class="kk"></span>`); row.dataset.pid = String(id); te.rows.set(id, row); }
        this.plRow(row, p);
      }
      if (solo) { const p = s.players[t.members[0]]; te.root.classList.toggle("sel", this.rig.target === p.id); }
    });
  }
  private plRow(row: HTMLElement, p: CPlayer) {
    const dead = !p.alive;
    row.classList.toggle("dead", dead && !p.resurging); row.classList.toggle("sel", this.rig.target === p.id);
    row.classList.toggle("hurt", performance.now() / 1000 - p.lastHurtAt < 0.8);
    const st = row.children[0] as HTMLElement, n = row.children[1] as HTMLElement, bars = row.children[2] as HTMLElement, kk = row.children[3] as HTMLElement;
    const stTxt = p.inPlane ? "✈" : p.resurging ? `${Math.ceil(Math.max(0, p.respawnIn))}` : dead ? "✕" : p.fight >= 0 ? "⚔" : p.st === 1 || p.st === 2 ? "▼" : "";
    if (st.textContent !== stTxt) st.textContent = stTxt;
    const nTxt = `${esc(p.name)}<em>${dead ? "" : esc(heldName(p.held))}</em>`;
    if (n.innerHTML !== nTxt) n.innerHTML = nTxt;
    ((bars.children[0] as HTMLElement).firstElementChild as HTMLElement).style.width = `${dead ? 0 : Math.min(100, p.hp)}%`;
    ((bars.children[1] as HTMLElement).firstElementChild as HTMLElement).style.width = `${dead ? 0 : Math.min(100, p.shield)}%`;
    const k = String(p.kills); if (kk.textContent !== k) kk.textContent = k;
  }

  private board() { const h = leaderboardHtml(this.state, this.rig.target); if (this.boardEl.dataset.h !== h) { this.boardEl.dataset.h = h; this.boardEl.innerHTML = h; } }
  private popover() {
    const p = this.state.players[this.popFor], a = this.popAnchor;
    if (!p || !a || !a.isConnected) { this.pop.classList.add("hide"); return; }
    const h = popoverHtml(this.state, p);
    if (this.pop.dataset.h !== h) { this.pop.dataset.h = h; this.pop.innerHTML = h; }
    this.pop.style.setProperty("--tc", teamLook(p.team).color);
    const r = a.getBoundingClientRect(), right = r.left > innerWidth / 2;
    this.pop.style.top = `${Math.max(8, Math.min(innerHeight - 260, r.top - 10))}px`;
    this.pop.style.left = right ? "" : `${r.right + 12}px`; this.pop.style.right = right ? `${innerWidth - r.left + 12}px` : "";
    this.pop.classList.remove("hide");
  }
  private fights() {
    const s = this.state, fs = s.fights.slice(0, 6);
    const maxI = Math.max(60, ...fs.map((f) => f.peak));
    const html = fs.length ? fs.map((f) => this.fightHtml(f, maxI)).join("") : `<div class="kc-empty">${this.cm.phase < 2 ? "Waiting for the drop…" : "No shots traded right now."}</div>`;
    if (this.fightsEl.dataset.h !== html) { this.fightsEl.dataset.h = html; this.fightsEl.innerHTML = html; }
  }
  private fightHtml(f: CFight, maxI: number) {
    const s = this.state, solo = s.mode === "solo";
    const chips = f.teams.map((t) => { const look = teamLook(t), alive = s.teams.get(t)?.members.filter((id) => s.players[id].alive).length ?? 0; const label = solo ? s.players.find((p) => p.team === t)?.name ?? look.name : `${look.name} ${alive}`; return `<span class="chip" style="--tc:${look.color}">${esc(label)}</span>`; }).join('<span class="vs">vs</span>');
    const dur = Math.max(0, performance.now() / 1000 - f.startedAt);
    return `<div class="kc-fight ${this.rig.fight === f.id ? "on" : ""}" data-fight="${f.id}"><div class="ft">${chips}</div><div class="meta"><span>${esc(f.where)}</span><span>${Math.round(f.damage)} DMG · ${f.kills} DOWN · ${mmss(dur)}</span></div><div class="heat"><b style="width:${Math.round(Math.min(1, f.intensity / maxI) * 100)}%"></b></div></div>`;
  }

  private feed() {
    const s = this.state, top = s.feed[0]?.id ?? -1;
    if (top === this.feedTop) return; this.feedTop = top;
    this.feedUl.innerHTML = s.feed.slice(0, 9).map((f) => this.feedHtml(f)).join("");
  }
  private feedHtml(f: FeedItem) {
    const s = this.state, t = `<time>${mmss(f.time)}</time>`;
    if ((f.kind === "kill" || f.kind === "down") && f.b !== undefined) {
      const a = f.a !== undefined && f.a >= 0 && f.a !== f.b ? s.players[f.a] : null, b = s.players[f.b];
      const col = (p: CPlayer) => teamLook(p.team).color;
      const who = a ? `<span class="a" data-pid="${a.id}" style="color:${col(a)}">${esc(a.name)}</span>` : "";
      const icon = f.weapon !== undefined ? weaponIcon(f.weapon) : null;
      const how = icon ? `<img class="wi" src="${icon}" alt="" title="${esc(f.text.split(" · ").pop() ?? "")}">` : esc(f.text.split(" · ").pop() ?? "");
      return `<li class="${f.kind}">${t}${who}<span class="w">${f.final ? "✕" : "▼"} ${how}</span><span class="b" data-pid="${b.id}" style="color:${col(b)}">${esc(b.name)}</span></li>`;
    }
    return `<li class="${f.kind}">${t}<span>${esc(f.text)}</span></li>`;
  }

  private targetCard() {
    const p = this.rig.target >= 0 ? this.state.players[this.rig.target] : undefined;
    const c = this.card;
    const f = this.rig.fight >= 0 ? this.state.fight(this.rig.fight) : null;
    // a drone shot on a fight shows the fight; once that fight has ended (or merged away) the card falls back to the
    // kong the shot is on, then to the wide shot itself — never "NO TARGET" under a live picture
    if (!p || (this.rig.mode === "drone" && f) || this.rig.mode === "free") {
      const wide = this.rig.mode === "drone" || this.rig.mode === "overhead";
      const html = f ? `<div class="who"><b>${esc(f.where)}</b><span style="--tc:#ff6b4b">LIVE FIGHT · ${f.teams.length} SQUADS</span></div><div class="hs"></div><div></div>` : `<div class="who"><b>${this.rig.mode === "free" ? "FREE CAMERA" : wide ? "WIDE SHOT" : "NO TARGET"}</b><span>CLICK A PLAYER TO FOLLOW</span></div><div></div><div></div>`;
      if (c.dataset.h !== html) { c.dataset.h = html; c.innerHTML = html; c.style.setProperty("--tc", "#ffd400"); }
      return;
    }
    const look = teamLook(p.team), solo = this.state.mode === "solo";
    c.style.setProperty("--tc", look.color);
    const st = p.stat;
    const slots = st ? st.slots.map((sl, i) => {
      if (sl.kind === SK.Empty) return `<div class="kc-slot ${i === st.active ? "act" : ""}"></div>`;
      const id = sl.kind === SK.Weapon ? WEAPONS[sl.id] : CONSUMABLES[sl.id];
      const rc = sl.kind === SK.Weapon ? RARITY_COLOR[RARITIES[Math.min(5, sl.rarity)]] : "transparent";
      const num = sl.kind === SK.Weapon ? sl.mag : sl.count;
      const title = sl.kind === SK.Weapon ? WEAPON_DEFS[WEAPONS[sl.id]]?.name : CONSUMABLE_DEFS[CONSUMABLES[sl.id]]?.name;
      return `<div class="kc-slot ${i === st.active ? "act" : ""}" title="${esc(title ?? "")}" style="--rc:${rc}"><img src="${itemIconUrl(id ?? "banana")}" alt=""><small>${num}</small><i></i></div>`;
    }).join("") : "";
    const status = p.inPlane ? "ON THE PLANE" : p.resurging ? `BACK IN ${Math.ceil(Math.max(0, p.respawnIn))}s` : !p.alive ? (p.placement ? `OUT · #${p.placement}` : "DOWN") : p.fight >= 0 ? "IN A FIGHT" : "";
    const html = `<div class="who"><b>${esc(p.name)}</b><span>${solo ? "" : `TEAM ${look.name}`}${p.bot ? "<em>BOT</em>" : "<em>PLAYER</em>"}${status ? `<em>${status}</em>` : ""}</span>
      <div class="stats"><div><b>${p.kills}</b><span>KILLS</span></div><div><b>${p.damage}</b><span>DAMAGE</span></div><div><b>$${p.cash}</b><span>BUCKS</span></div></div></div>
      <div class="hs"><div class="bar hp"><b style="width:${p.alive ? Math.min(100, p.hp) : 0}%"></b><span>${p.alive ? Math.ceil(p.hp) : 0}</span></div><div class="bar sh"><b style="width:${p.alive ? Math.min(100, p.shield) : 0}%"></b><span>${p.alive ? Math.ceil(p.shield) : 0}</span></div></div>
      <div class="kc-slots">${slots}</div>`;
    if (c.dataset.h !== html) { c.dataset.h = html; c.innerHTML = html; }
  }
}
