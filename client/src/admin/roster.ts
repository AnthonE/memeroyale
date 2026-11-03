// The admin console roster: TRIOS team cards (3 seats each) + an Unassigned pool, or the SOLO player list. Player
// tiles are keyed by player id and updated in place (state arrives every ~2 s; rebuilding would drop focus, an open
// menu or a drag). Moving a player: drag the tile onto a team card / Unassigned, or click it → Move to. Every name is
// set with textContent: names are treated as hostile.
import type { AdminLobby, AdminPlayer } from "../../../shared/net/event";
import { EVENT_TEAM_SIZE } from "../../../shared/net/event";
import { h, icon, setBusy, setOff, spinner } from "./common";
import { confirmBox, dialogOpen } from "./dialog";
import type { Ctx } from "./ctx";

const STATE_TEXT: Record<AdminPlayer["state"], string> = { room: "In room", playing: "Playing", out: "Out", waiting: "Waiting" };
const NAME_MAX = 14;
/** the game's callsign rules (server cleanName): upper-case A–Z 0–9 space _ . ! ? ' - */
export const cleanCallsign = (v: string) => v.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9 _.!?'-]/g, "").replace(/\s+/g, " ").slice(0, NAME_MAX);

function pingInfo(ms: number): { text: string; cls: string; word: string } {
  if (!ms) return { text: "— ms", cls: "is-none", word: "not measured yet" };
  if (ms < 90) return { text: `${ms} ms`, cls: "is-good", word: "good" };
  if (ms < 170) return { text: `${ms} ms`, cls: "is-fair", word: "fair" };
  return { text: `${ms} ms`, cls: "is-poor", word: "poor" };
}

interface Tile { el: HTMLElement; nm: HTMLElement; ping: HTMLElement; badge: HTMLElement; ren: HTMLElement; p: AdminPlayer }
interface TeamCard { el: HTMLElement; title: HTMLElement; count: HTMLElement; slots: HTMLElement; team: number }

export class Roster {
  readonly el = h("section", "tn-panel tn-adm-roster");
  private head = h("div", "tn-adm-rhead");
  private countEl = h("span", "tn-adm-count");
  private balanceBtn = h("button", "tn-btn tn-adm-sm");
  private shuffleBtn = h("button", "tn-btn tn-adm-sm");
  private hint = h("span", "tn-support tn-adm-rhint");
  private body = h("div", "tn-adm-rbody");
  private empty = h("div", "tn-adm-rempty");
  private pool: TeamCard;
  private teamsWrap = h("div", "tn-adm-teams");
  private solo = h("div", "tn-adm-solo");
  private kicked = h("details", "tn-adm-kicked");
  private kickedSum = h("summary", "tn-adm-ksum");
  private kickedList = h("div", "tn-adm-klist");
  private teams: TeamCard[] = [];
  private tiles = new Map<number, Tile>();
  private lobby: AdminLobby | null = null;
  private deferred: AdminLobby | null = null;
  private dragUid = -1;
  /** the tile whose open menu a mousedown just closed: its click must not reopen it */
  private suppressUid = -1;
  private menu: { el: HTMLElement; uid: number; tile: HTMLElement; close: (focusTile?: boolean) => void } | null = null;

  constructor(private ctx: Ctx) {
    const title = h("h2", "tn-heading tn-adm-rtitle", "Players");
    this.balanceBtn.type = this.shuffleBtn.type = "button";
    this.balanceBtn.append(icon("balance"), h("span", "", "Auto-balance"), spinner());
    this.shuffleBtn.append(icon("shuffle"), h("span", "", "Shuffle"), spinner());
    this.balanceBtn.title = "Fill teams evenly; nobody already on a team is split up";
    this.shuffleBtn.title = "Random new teams for everyone";
    const tools = h("div", "tn-adm-rtools");
    tools.append(this.balanceBtn, this.shuffleBtn);
    const left = h("div", "tn-adm-rhleft");
    left.append(title, this.countEl, this.hint);
    this.head.append(left, tools);
    this.balanceBtn.addEventListener("click", () => { if (this.lobby) void ctx.act(`${this.lobby.code}:balance`, { a: "balance", code: this.lobby.code }); });
    this.shuffleBtn.addEventListener("click", async () => {
      const l = this.lobby;
      if (!l) return;
      const ok = await confirmBox({ title: "Shuffle the teams?", body: "Everyone gets a random new team. Teams players picked themselves are lost.", ok: "Shuffle" });
      if (ok) void ctx.act(`${l.code}:shuffle`, { a: "shuffle", code: l.code });
    });

    this.empty.append(icon("user", "big"), h("p", "tn-heading", "No players yet."), h("p", "tn-body", "Share the link. Players show up here the moment they join."));
    this.pool = this.makeCard(-1);
    this.pool.el.classList.add("tn-adm-pool");
    this.kicked.append(this.kickedSum, this.kickedList);
    this.body.append(this.empty, this.pool.el, this.teamsWrap, this.solo, this.kicked);
    this.el.append(this.head, this.body);

    // closing the menu from outside
    document.addEventListener("mousedown", this.onDocDown, true);
  }

  destroy(): void {
    document.removeEventListener("mousedown", this.onDocDown, true);
    this.menu?.close(false);
  }

  private onDocDown = (e: MouseEvent) => {
    this.suppressUid = -1;
    if (this.menu && !this.menu.el.contains(e.target as Node) && !dialogOpen()) {
      if (this.menu.tile.contains(e.target as Node)) this.suppressUid = this.menu.uid;
      this.menu.close(false);
    }
  };

  // ------------------------------------------------------------------ cards + tiles
  private makeCard(team: number): TeamCard {
    const el = h("div", "tn-adm-team");
    el.dataset.team = String(team);
    const head = h("div", "tn-adm-thead");
    const title = h("span", "tn-adm-tname", team < 0 ? "Unassigned" : `Team ${team + 1}`);
    const count = h("span", "tn-adm-tcount");
    head.append(title, count);
    const slots = h("div", "tn-adm-slots");
    el.append(head, slots);
    const card: TeamCard = { el, title, count, slots, team };
    el.addEventListener("dragover", (e) => this.onOver(e, card));
    el.addEventListener("dragenter", (e) => this.onOver(e, card));
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget as Node)) el.classList.remove("is-over", "is-full"); });
    el.addEventListener("drop", (e) => this.onDrop(e, card));
    return card;
  }

  private tile(p: AdminPlayer): Tile {
    let t = this.tiles.get(p.id);
    if (!t) {
      const el = h("div", "tn-tile tn-adm-ptile");
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-haspopup", "dialog");
      el.draggable = true;
      el.dataset.uid = String(p.id);
      const nm = h("span", "nm");
      const ren = icon("pencil", "ren");
      const top = h("span", "top");
      top.append(nm, ren);
      const ping = h("span", "ping");
      const badge = h("span", "tn-badge st");
      const meta = h("span", "meta");
      meta.append(ping, badge);
      el.append(top, meta, spinner());
      t = { el, nm, ping, badge, ren, p };
      this.tiles.set(p.id, t);
      const uid = p.id;
      el.addEventListener("click", () => { if (this.suppressUid === uid) { this.suppressUid = -1; return; } this.openMenu(uid); });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.openMenu(uid); } });
      el.addEventListener("dragstart", (e) => {
        this.menu?.close(false);
        this.dragUid = uid;
        el.classList.add("is-drag");
        this.el.classList.add("is-dragging");
        e.dataTransfer?.setData("text/plain", "");
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => {
        this.dragUid = -1;
        el.classList.remove("is-drag");
        this.el.classList.remove("is-dragging");
        for (const c of [this.pool, ...this.teams]) c.el.classList.remove("is-over", "is-full");
        if (this.deferred) { const l = this.deferred; this.deferred = null; this.update(l); }
      });
    }
    t.p = p;
    if (t.nm.textContent !== p.name) t.nm.textContent = p.name;
    t.el.title = p.name;
    t.ren.hidden = !p.renamed;
    const pi = pingInfo(p.ping);
    t.ping.textContent = pi.text;
    t.ping.className = "ping " + pi.cls;
    t.badge.textContent = STATE_TEXT[p.state] ?? p.state;
    t.badge.className = "tn-badge st st-" + p.state;
    t.el.setAttribute("aria-label", `${p.name}: ${STATE_TEXT[p.state] ?? p.state}, ping ${pi.text} (${pi.word})${p.renamed ? ", renamed by you" : ""}. Open options`);
    const code = this.lobby?.code ?? "";
    const busy = this.ctx.busy(`${code}:move:${p.id}`) || this.ctx.busy(`${code}:kick:${p.id}`) || this.ctx.busy(`${code}:rename:${p.id}`);
    setBusy(t.el, busy);
    return t;
  }

  // ------------------------------------------------------------------ drag + drop
  private canDrop(card: TeamCard): "ok" | "same" | "full" {
    const l = this.lobby;
    const p = l?.players.find((x) => x.id === this.dragUid);
    if (!l || !p) return "same";
    if (p.team === card.team) return "same";
    if (card.team >= 0 && l.players.filter((x) => x.team === card.team).length >= EVENT_TEAM_SIZE) return "full";
    return "ok";
  }
  private onOver(e: DragEvent, card: TeamCard): void {
    if (this.dragUid < 0) return;
    const v = this.canDrop(card);
    card.el.classList.toggle("is-over", v === "ok");
    card.el.classList.toggle("is-full", v === "full");
    if (v === "ok") { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "move"; }
    else if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
  }
  private onDrop(e: DragEvent, card: TeamCard): void {
    e.preventDefault();
    card.el.classList.remove("is-over", "is-full");
    const uid = this.dragUid;
    if (uid < 0 || this.canDrop(card) !== "ok" || !this.lobby) return;
    this.move(uid, card.team);
  }
  private move(uid: number, team: number): void {
    const l = this.lobby;
    if (!l) return;
    void this.ctx.act(`${l.code}:move:${uid}`, { a: "move", code: l.code, uid, team });
  }

  // ------------------------------------------------------------------ player menu (click alternative)
  private openMenu(uid: number): void {
    const l = this.lobby;
    const t = this.tiles.get(uid);
    if (!l || !t || dialogOpen()) return;
    if (this.menu?.uid === uid) { this.menu.close(true); return; }
    this.menu?.close(false);
    const p = t.p;
    const el = h("div", "tn-dialog tn-adm-menu");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", `Options for ${p.name}`);
    const head = h("div", "tn-adm-mhead");
    const nm = h("span", "tn-adm-mname", p.name);
    const sub = h("span", "tn-support", (l.mode === "trios" ? (p.team < 0 ? "Unassigned" : `Team ${p.team + 1}`) + " · " : "") + `${STATE_TEXT[p.state]} · ${pingInfo(p.ping).text}`);
    head.append(nm, sub);
    el.append(head);

    const main = h("div", "tn-adm-mmain");
    if (l.mode === "trios") {
      main.append(h("p", "tn-eyebrow tn-adm-mlabel", "Move to"));
      const grid = h("div", "tn-adm-mgrid");
      const opts = [-1, ...Array.from({ length: l.teams }, (_, i) => i)];
      for (const team of opts) {
        const n = l.players.filter((x) => x.team === team).length;
        const b = h("button", "tn-pill tn-adm-mteam");
        b.type = "button";
        const here = team === p.team;
        const full = team >= 0 && n >= EVENT_TEAM_SIZE && !here;
        b.append(h("span", "", team < 0 ? "Unassigned" : `Team ${team + 1}`));
        if (team >= 0) b.append(h("small", "", here ? "here" : `${n}/${EVENT_TEAM_SIZE}`));
        else if (here) b.append(h("small", "", "here"));
        if (here) b.setAttribute("aria-pressed", "true");
        if (full) b.setAttribute("aria-label", `${team < 0 ? "Unassigned" : `Team ${team + 1}`} (full)`);
        b.disabled = here || full;
        b.addEventListener("click", () => { close(true); this.move(uid, team); });
        grid.append(b);
      }
      main.append(grid);
    }
    const row = h("div", "tn-adm-mrow");
    const ren = h("button", "tn-btn tn-adm-sm");
    ren.type = "button";
    ren.append(icon("pencil"), h("span", "", "Rename…"));
    const kick = h("button", "tn-btn tn-adm-sm tn-adm-kickbtn");
    kick.type = "button";
    kick.append(icon("kick"), h("span", "", "Kick"));
    row.append(ren, kick);
    main.append(row);
    el.append(main);

    // rename: an inline field with the game's callsign rules
    const form = h("div", "tn-adm-mform");
    form.hidden = true;
    const lab = h("label", "tn-label", "New name");
    const inp = h("input", "tn-adm-input tn-adm-rename");
    inp.id = "tn-adm-rename-" + uid; lab.htmlFor = inp.id;
    inp.maxLength = NAME_MAX; inp.spellcheck = false; inp.autocomplete = "off";
    inp.setAttribute("autocapitalize", "characters");
    const help = h("p", "tn-support", "Up to 14: A–Z, 0–9, space and _ . ! ? ' -. They can't change it back.");
    const frow = h("div", "tn-adm-mrow");
    const cancel = h("button", "tn-btn tn-btn--tertiary tn-adm-sm", "Cancel");
    const save = h("button", "tn-btn tn-btn--primary tn-adm-sm", "Save");
    cancel.type = save.type = "button";
    frow.append(cancel, save);
    form.append(lab, inp, help, frow);
    el.append(form);
    const syncSave = () => setOff(save, !inp.value.trim() || inp.value.trim() === p.name);
    inp.addEventListener("input", () => {
      const c = cleanCallsign(inp.value);
      if (c !== inp.value) { const pos = Math.min(inp.selectionStart ?? c.length, c.length); inp.value = c; inp.setSelectionRange(pos, pos); }
      syncSave();
    });
    const doSave = () => {
      const name = inp.value.trim();
      if (!name || name === p.name) return;
      close(true);
      void this.ctx.act(`${l.code}:rename:${uid}`, { a: "rename", code: l.code, uid, name });
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSave(); } });
    save.addEventListener("click", doSave);
    cancel.addEventListener("click", () => { form.hidden = true; main.hidden = false; ren.focus(); });
    ren.addEventListener("click", () => {
      main.hidden = true; form.hidden = false;
      inp.value = p.name; syncSave();
      inp.focus(); inp.select();
    });
    kick.addEventListener("click", async () => {
      close(true);
      const ok = await confirmBox({ title: `Kick ${p.name}?`, body: "They can't rejoin this lobby. You can allow them back from the Kicked list.", ok: "Kick", danger: true });
      if (ok) void this.ctx.act(`${l.code}:kick:${uid}`, { a: "kick", code: l.code, uid });
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!form.hidden) { form.hidden = true; main.hidden = false; ren.focus(); } else close(true); }
    });
    el.addEventListener("focusout", (e) => {
      const to = e.relatedTarget as Node | null;
      if (to && !el.contains(to) && !dialogOpen()) close(false);
    });

    document.body.append(el);
    t.el.setAttribute("aria-expanded", "true");
    t.el.classList.add("is-sel");
    const close = (focusTile = false) => {
      if (!el.isConnected) return;
      el.remove();
      t.el.removeAttribute("aria-expanded");
      t.el.classList.remove("is-sel");
      if (this.menu?.el === el) this.menu = null;
      if (focusTile && t.el.isConnected) t.el.focus();
    };
    this.menu = { el, uid, tile: t.el, close };
    this.place();
    (el.querySelector<HTMLElement>("button:not([disabled])") ?? el).focus();
  }

  /** keep the menu beside its tile (right if there's room, else left; clamped to the window) */
  private place(): void {
    const m = this.menu;
    if (!m) return;
    const r = m.tile.getBoundingClientRect();
    const w = m.el.offsetWidth, hgt = m.el.offsetHeight;
    const gap = 12;
    let x = r.right + gap;
    if (x + w > innerWidth - 8) x = r.left - gap - w;
    if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, r.left));
    let y = r.top;
    if (y + hgt > innerHeight - 8) y = innerHeight - hgt - 8;
    m.el.style.left = `${Math.round(x)}px`;
    m.el.style.top = `${Math.round(Math.max(8, y))}px`;
  }

  // ------------------------------------------------------------------ update
  update(l: AdminLobby): void {
    if (this.dragUid >= 0) { this.deferred = l; this.lobby = l; return; }
    const prev = this.lobby;
    this.lobby = l;
    const trios = l.mode === "trios";
    const players = [...l.players].sort((a, b) => a.joinedAt - b.joinedAt || a.id - b.id);
    this.el.dataset.mode = l.mode;

    this.countEl.textContent = `${players.length} / ${l.cap} players`;
    this.balanceBtn.hidden = this.shuffleBtn.hidden = !trios;
    setBusy(this.balanceBtn, this.ctx.busy(`${l.code}:balance`));
    setBusy(this.shuffleBtn, this.ctx.busy(`${l.code}:shuffle`));
    setOff(this.balanceBtn, players.length === 0);
    setOff(this.shuffleBtn, players.length < 2);
    this.hint.textContent = !players.length ? "" : trios
      ? "Drag players between teams, or click one for options"
      : "Click a player to rename or kick";
    this.hint.hidden = !players.length;

    // drop tiles of players who left
    const ids = new Set(players.map((p) => p.id));
    for (const [id, t] of this.tiles) if (!ids.has(id)) { if (this.menu?.uid === id) this.menu.close(false); t.el.remove(); this.tiles.delete(id); }

    this.empty.hidden = players.length > 0;
    this.pool.el.hidden = !trios || players.length === 0;
    this.teamsWrap.hidden = !trios || players.length === 0;
    this.solo.hidden = trios || players.length === 0;

    if (trios) {
      while (this.teams.length < l.teams) { const c = this.makeCard(this.teams.length); this.teams.push(c); this.teamsWrap.append(c.el); }
      while (this.teams.length > l.teams) this.teams.pop()!.el.remove();
      const byTeam = new Map<number, AdminPlayer[]>();
      for (const p of players) { const k = p.team >= 0 && p.team < l.teams ? p.team : -1; (byTeam.get(k) ?? byTeam.set(k, []).get(k)!).push(p); }
      // the pool
      const pool = byTeam.get(-1) ?? [];
      this.pool.count.textContent = pool.length ? String(pool.length) : "";
      const poolKids: HTMLElement[] = pool.map((p) => this.tile(p).el);
      if (!pool.length) poolKids.push(this.note("Everyone has a team."));
      this.place_(this.pool.slots, poolKids);
      // the teams
      for (const c of this.teams) {
        const mem = byTeam.get(c.team) ?? [];
        c.count.textContent = `${mem.length}/${EVENT_TEAM_SIZE}`;
        c.el.classList.toggle("is-filled", mem.length >= EVENT_TEAM_SIZE);
        c.el.classList.toggle("is-empty", mem.length === 0);
        const kids: HTMLElement[] = mem.map((p) => this.tile(p).el);
        for (let i = mem.length; i < EVENT_TEAM_SIZE; i++) kids.push(this.seat(c.slots, i));
        this.place_(c.slots, kids);
      }
    } else {
      this.place_(this.solo, players.map((p) => this.tile(p).el));
    }

    // kicked
    this.kicked.hidden = l.kicked.length === 0;
    this.kickedSum.replaceChildren(icon("chev", "chev"), h("span", "", `Kicked (${l.kicked.length})`),
      h("span", "tn-support", "Kicked players can't rejoin this lobby."));
    const rows: HTMLElement[] = [];
    for (const k of l.kicked) {
      const r = h("div", "tn-adm-krow");
      const when = new Date(k.at);
      const b = h("button", "tn-btn tn-adm-sm");
      b.type = "button";
      b.append(h("span", "", "Allow back"), spinner());
      setBusy(b, this.ctx.busy(`${l.code}:unkick:${k.kid}`));
      b.addEventListener("click", () => void this.ctx.act(`${l.code}:unkick:${k.kid}`, { a: "unkick", code: l.code, kid: k.kid }));
      r.append(h("span", "nm", k.name), h("span", "tn-support", `Kicked ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`), b);
      rows.push(r);
    }
    // keep focus on an Allow back button across updates only when nothing changed
    const sig = l.kicked.map((k) => k.kid).join(",") + "|" + l.kicked.map((k) => this.ctx.busy(`${l.code}:unkick:${k.kid}`) ? 1 : 0).join("");
    if (this.kickedList.dataset.sig !== sig) { this.kickedList.dataset.sig = sig; this.kickedList.replaceChildren(...rows); }

    if (this.menu) {
      const p = l.players.find((x) => x.id === this.menu!.uid);
      if (!p) this.menu.close(false);
      else if (prev && prev.mode !== l.mode) this.menu.close(true);
      else this.place();
    }
  }

  private seats = new WeakMap<HTMLElement, HTMLElement[]>();
  private seat(slots: HTMLElement, i: number): HTMLElement {
    let list = this.seats.get(slots);
    if (!list) this.seats.set(slots, (list = []));
    if (!list[i]) { const s = h("div", "tn-adm-seat", "Open seat"); list[i] = s; }
    return list[i];
  }
  private notes = new WeakMap<HTMLElement, HTMLElement>();
  private note(text: string): HTMLElement {
    let n = this.notes.get(this.pool.slots);
    if (!n) { n = h("p", "tn-support tn-adm-pnote", text); this.notes.set(this.pool.slots, n); }
    return n;
  }
  /** set a container's children only when the order changed (moving a focused node would drop its focus) */
  private place_(box: HTMLElement, kids: HTMLElement[]): void {
    const cur = box.children;
    if (cur.length === kids.length && kids.every((k, i) => cur[i] === k)) return;
    const active = document.activeElement as HTMLElement | null;
    box.replaceChildren(...kids);
    if (active && box.contains(active) && document.activeElement !== active) active.focus();
  }
}
