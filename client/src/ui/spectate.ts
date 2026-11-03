// The spectator UI: a bar at the bottom centre the moment you watch someone — ◀ / ▶
// (clickable: the cursor is free while spectating), the watched kong's name big and clear, its health + shield, what it
// holds, its eliminations, an IN THE STORM tag, kongs / squads left — and the full player list (Tab): every player, alive
// first, click a row to watch them. DOM only, touched only when a value changes; the game owns the keys (index.ts) and
// the camera (render.ts).
import type { SpectateAction, SpectateView } from "./api";
import { addCss, UI } from "./styles";
import { svgGlyph } from "./icons";
import { RARITY_COLOR } from "../../../shared/world/map";

const u = (n: number) => `calc(${n} * var(--u))`;
/** a squad's colour in the list (my own squad is yellow) */
export const squadHue = (team: number) => `hsl(${(team * 67 + 190) % 360} 80% 66%)`;

const CSS = `
.kr-spec { position: absolute; left: 50%; bottom: ${u(46)}; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: ${u(10)}; }
.kr-spec .bar { display: flex; align-items: stretch; gap: ${u(12)}; }
.kr-spec .arrow { pointer-events: auto; cursor: pointer; width: ${u(92)}; border: ${u(2.5)} solid ${UI.yellow}; border-radius: ${u(10)};
  background: rgba(14,42,62,0.82); color: ${UI.yellow}; display: grid; place-items: center; padding: 0; font: inherit;
  box-shadow: 0 ${u(5)} 0 rgba(0,0,0,0.35); transition: transform .08s, background .12s; }
.kr-spec .arrow:hover { background: ${UI.yellow}; color: ${UI.ink}; }
.kr-spec .arrow:active, .kr-spec .arrow.hit { transform: translateY(${u(3)}); box-shadow: 0 ${u(2)} 0 rgba(0,0,0,0.35); }
.kr-spec .arrow svg { width: ${u(34)}; height: ${u(40)}; }
.kr-spec .arrow small { display: block; font-family: ${UI.cond}; font-size: ${u(17)}; font-weight: 800; letter-spacing: ${u(1.5)}; margin-top: ${u(2)}; opacity: .85; }
.kr-spec .arrow[disabled] { opacity: .35; cursor: default; }
.kr-spec .card { width: ${u(700)}; padding: ${u(12)} ${u(26)} ${u(14)}; border: ${u(2.5)} solid ${UI.yellow}; border-radius: ${u(10)};
  background: linear-gradient(180deg, rgba(14,42,62,0.9), rgba(8,22,34,0.9)); box-shadow: 0 ${u(6)} ${u(22)} rgba(0,0,0,0.4); }
.kr-spec .top { display: flex; align-items: center; gap: ${u(10)}; font-family: ${UI.cond}; font-size: ${u(22)}; font-weight: 800; letter-spacing: ${u(3)}; color: ${UI.creamDim}; }
.kr-spec .top .eye { width: ${u(30)}; height: ${u(21)}; }
.kr-spec .top .left { margin-left: auto; color: ${UI.creamText}; }
.kr-spec .top .left b { color: ${UI.yellow}; }
.kr-spec .name { display: flex; align-items: baseline; gap: ${u(14)}; margin-top: ${u(2)}; }
.kr-spec .name b { font-family: ${UI.block}; font-size: ${u(54)}; font-weight: 900; line-height: 1.05; color: ${UI.yellow}; letter-spacing: ${u(1)};
  text-shadow: 0 ${u(4)} 0 rgba(0,0,0,0.45); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: ${u(470)}; }
.kr-spec .name .tag { font-family: ${UI.cond}; font-size: ${u(20)}; font-weight: 800; letter-spacing: ${u(2.5)}; padding: ${u(3)} ${u(10)}; border-radius: ${u(5)};
  color: ${UI.ink}; background: ${UI.yellow}; }
.kr-spec .name .kills { margin-left: auto; display: flex; align-items: center; gap: ${u(6)}; font-size: ${u(34)}; font-weight: 800; color: ${UI.creamText}; }
.kr-spec .name .kills svg { width: ${u(30)}; height: ${u(30)}; }
.kr-spec .stats { display: flex; align-items: center; gap: ${u(16)}; margin-top: ${u(8)}; }
.kr-spec .bars { flex: 1; display: flex; flex-direction: column; gap: ${u(5)}; }
.kr-spec .hb { position: relative; height: ${u(16)}; border-radius: ${u(4)}; background: rgba(0,0,0,0.5); overflow: hidden; }
.kr-spec .hb i { position: absolute; inset: 0; transform-origin: left center; transition: transform .18s ease-out; }
.kr-spec .hb.sh i { background: ${UI.shield}; } .kr-spec .hb.hp i { background: ${UI.hp}; }
.kr-spec .hb span { position: absolute; right: ${u(6)}; top: 50%; transform: translateY(-50%); font-size: ${u(14)}; font-weight: 800; color: #fff; text-shadow: 0 1px 2px #000; }
.kr-spec .held { min-width: ${u(170)}; max-width: ${u(230)}; padding: ${u(6)} ${u(12)}; border-radius: ${u(6)}; background: rgba(0,0,0,0.42); border-left: ${u(5)} solid #b8bec6;
  font-family: ${UI.cond}; font-size: ${u(24)}; font-weight: 800; letter-spacing: ${u(1.5)}; color: ${UI.creamText}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kr-spec .storm { padding: ${u(6)} ${u(12)}; border-radius: ${u(6)}; background: rgba(150,40,200,0.85); color: #fff; font-family: ${UI.cond}; font-size: ${u(21)}; font-weight: 800; letter-spacing: ${u(2)}; white-space: nowrap; }
.kr-spec .down { margin-top: ${u(8)}; font-family: ${UI.cond}; font-size: ${u(24)}; font-weight: 800; letter-spacing: ${u(2.5)}; color: #ff8a80; }
.kr-spec.isdown .name b { color: rgba(246,239,198,0.5); text-decoration: line-through; text-decoration-thickness: ${u(4)}; }
.kr-spec .hint { font-family: ${UI.cond}; font-size: ${u(21)}; font-weight: 800; letter-spacing: ${u(2.5)}; color: ${UI.creamText}; text-shadow: 0 1px 3px rgba(0,0,0,0.85); white-space: nowrap; }
.kr-spec .hint kbd { font: inherit; color: ${UI.ink}; background: ${UI.cream}; border-radius: ${u(4)}; padding: 0 ${u(7)}; margin: 0 ${u(4)}; }
.kr-spec .hint .sep { opacity: .45; margin: 0 ${u(10)}; }

.kr-plist { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -54%); width: ${u(1500)}; max-height: ${u(1060)}; display: flex; flex-direction: column;
  pointer-events: auto; border: ${u(3)} solid ${UI.yellow}; border-radius: ${u(12)}; background: rgba(8,22,34,0.94); box-shadow: 0 ${u(20)} ${u(60)} rgba(0,0,0,0.55); }
.kr-plist .hd { display: flex; align-items: baseline; gap: ${u(18)}; padding: ${u(20)} ${u(30)} ${u(12)}; border-bottom: ${u(2)} solid rgba(255,212,0,0.35); }
.kr-plist .hd b { font-family: ${UI.block}; font-size: ${u(48)}; color: ${UI.yellow}; letter-spacing: ${u(2)}; }
.kr-plist .hd span { font-family: ${UI.cond}; font-size: ${u(26)}; font-weight: 800; letter-spacing: ${u(3)}; color: ${UI.creamText}; }
.kr-plist .hd .x { margin-left: auto; font-size: ${u(20)}; color: ${UI.creamDim}; }
.kr-plist .note { margin: ${u(10)} ${u(30)} 0; padding: ${u(8)} ${u(14)}; border-radius: ${u(6)}; background: rgba(255,212,0,0.14); color: ${UI.yellow};
  font-family: ${UI.cond}; font-size: ${u(21)}; font-weight: 800; letter-spacing: ${u(2)}; }
.kr-plist .rows { overflow-y: auto; padding: ${u(14)} ${u(24)} ${u(22)}; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: ${u(6)} ${u(14)}; }
.kr-plist .row { display: flex; align-items: center; gap: ${u(12)}; height: ${u(50)}; padding: 0 ${u(14)}; border-radius: ${u(7)}; border: ${u(2)} solid transparent;
  background: rgba(255,255,255,0.05); color: ${UI.creamText}; font: inherit; text-align: left; }
.kr-plist button.row { cursor: pointer; }
.kr-plist button.row:hover { background: rgba(255,212,0,0.18); border-color: rgba(255,212,0,0.6); }
.kr-plist .row.on { background: rgba(255,212,0,0.24); border-color: ${UI.yellow}; }
.kr-plist .row.out { opacity: .42; }
.kr-plist .row.locked { opacity: .55; }
.kr-plist .row .sq { width: ${u(12)}; height: ${u(30)}; border-radius: ${u(3)}; flex: none; }
.kr-plist .row .nm { flex: 1; font-size: ${u(25)}; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kr-plist .row.out .nm { text-decoration: line-through; }
.kr-plist .row .k { display: flex; align-items: center; gap: ${u(5)}; font-size: ${u(22)}; font-weight: 800; min-width: ${u(52)}; justify-content: flex-end; }
.kr-plist .row .k svg { width: ${u(20)}; height: ${u(20)}; }
.kr-plist .row .st { font-family: ${UI.cond}; font-size: ${u(18)}; font-weight: 800; letter-spacing: ${u(2)}; min-width: ${u(96)}; text-align: right; color: ${UI.creamDim}; }
.kr-plist button.row .st { opacity: 0; } .kr-plist button.row:hover .st, .kr-plist button.row.mate .st { opacity: 1; }
.kr-plist .row.on .st { color: ${UI.yellow}; }
`;

const ARROW_L = "M30 4 L8 20 L30 36", ARROW_R = "M8 4 L30 20 L8 36";
function arrowSvg(d: string) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 38 40");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); p.setAttribute("fill", "none");
  p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "7"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
  s.appendChild(p); return s;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e;
}
const txt = (e: HTMLElement, s: string) => { if (e.textContent !== s) e.textContent = s; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export class SpectateUi {
  readonly bar: HTMLDivElement;
  readonly list: HTMLDivElement;
  onAction: ((a: SpectateAction) => void) | null = null;
  private readonly prev: HTMLButtonElement; private readonly next: HTMLButtonElement;
  private readonly left: HTMLSpanElement; private readonly nameB: HTMLElement; private readonly tag: HTMLSpanElement;
  private readonly killsN: HTMLSpanElement; private readonly hpI: HTMLElement; private readonly hpN: HTMLSpanElement;
  private readonly shI: HTMLElement; private readonly shN: HTMLSpanElement; private readonly held: HTMLDivElement;
  private readonly storm: HTMLDivElement; private readonly down: HTMLDivElement; private readonly hint: HTMLDivElement;
  private readonly lHead: HTMLSpanElement; private readonly lNote: HTMLDivElement; private readonly rows: HTMLDivElement; private readonly lClose: HTMLSpanElement;
  private shown = false; private listShown = false; private sig = ""; private listSig = ""; private hintSig = "";

  constructor(root: HTMLElement) {
    addCss("kr-spectate-css", CSS);
    const bar = this.bar = el("div", "kr-spec kr-hide", root);
    const row = el("div", "bar", bar);
    this.prev = el("button", "arrow", row); this.prev.type = "button"; this.prev.setAttribute("aria-label", "Previous player"); this.prev.appendChild(arrowSvg(ARROW_L));
    const card = el("div", "card", row);
    this.next = el("button", "arrow", row); this.next.type = "button"; this.next.setAttribute("aria-label", "Next player"); this.next.appendChild(arrowSvg(ARROW_R));
    const top = el("div", "top", card);
    top.appendChild(svgGlyph("eye", "eye", UI.creamDim));
    el("span", "", top).textContent = "SPECTATING";
    this.left = el("span", "left", top);
    const name = el("div", "name", card);
    this.nameB = el("b", "", name);
    this.tag = el("span", "tag", name); this.tag.textContent = "SQUADMATE"; this.tag.style.display = "none";
    const kills = el("span", "kills", name); kills.appendChild(svgGlyph("skull", "", UI.creamText)); this.killsN = el("span", "", kills);
    const stats = el("div", "stats", card);
    const bars = el("div", "bars", stats);
    const sh = el("div", "hb sh", bars); this.shI = el("i", "", sh); this.shN = el("span", "", sh);
    const hp = el("div", "hb hp", bars); this.hpI = el("i", "", hp); this.hpN = el("span", "", hp);
    this.held = el("div", "held", stats);
    this.storm = el("div", "storm", stats); this.storm.textContent = "IN THE STORM"; this.storm.style.display = "none";
    this.down = el("div", "down", card); this.down.style.display = "none";
    this.hint = el("div", "hint", bar);
    const list = this.list = el("div", "kr-plist kr-hide", root);
    list.setAttribute("role", "dialog"); list.setAttribute("aria-label", "Players");
    const hd = el("div", "hd", list);
    el("b", "", hd).textContent = "PLAYERS";
    this.lHead = el("span", "", hd);
    this.lClose = el("span", "x", hd);
    this.lNote = el("div", "note", list); this.lNote.style.display = "none";
    this.rows = el("div", "rows", list);
    // the cursor is free while spectating: the arrows and the rows are plain buttons (never the canvas' click-to-aim)
    const act = (a: SpectateAction) => (e: Event) => { e.preventDefault(); e.stopPropagation(); this.onAction?.(a); };
    this.prev.addEventListener("click", act({ t: "prev" })); this.next.addEventListener("click", act({ t: "next" }));
    for (const b of [this.prev, this.next]) b.addEventListener("mousedown", (e) => e.stopPropagation());
    this.rows.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.row"); if (!b) return;
      e.preventDefault(); e.stopPropagation(); this.onAction?.({ t: "pick", id: Number(b.dataset.id) });
    });
    list.addEventListener("mousedown", (e) => e.stopPropagation());
  }

  /** a key press cycled: the matching arrow dips like a click */
  flash(dir: -1 | 1) { const b = dir < 0 ? this.prev : this.next; b.classList.add("hit"); setTimeout(() => b.classList.remove("hit"), 110); }

  update(v: SpectateView | null | undefined) {
    const on = !!v;
    if (on !== this.shown) { this.shown = on; this.bar.classList.toggle("kr-hide", !on); }
    const lOn = !!v && v.listOpen;
    if (lOn !== this.listShown) { this.listShown = lOn; this.list.classList.toggle("kr-hide", !lOn); this.listSig = ""; }
    if (!v) return;
    const hp = Math.max(0, Math.round(v.hp)), sh = Math.max(0, Math.round(v.shield));
    const sig = `${v.id}|${v.name}|${v.mate}|${hp}|${sh}|${v.held?.name}|${v.held?.rarity}|${v.kills}|${v.inStorm}|${v.down?.by}|${v.alive}|${v.squads}|${v.trios}|${v.count}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.left.innerHTML = `<b>${v.alive}</b> ALIVE${v.trios ? ` · <b>${v.squads}</b> SQUADS` : ""}`;
      txt(this.nameB, v.name.toUpperCase());
      this.tag.style.display = v.mate ? "" : "none";
      txt(this.killsN, String(v.kills));
      this.hpI.style.transform = `scaleX(${Math.min(1, hp / 100)})`; txt(this.hpN, String(hp));
      this.shI.style.transform = `scaleX(${Math.min(1, sh / 100)})`; txt(this.shN, String(sh));
      this.held.style.display = v.held ? "" : "none";
      if (v.held) { txt(this.held, v.held.name); this.held.style.borderLeftColor = RARITY_COLOR[v.held.rarity]; }
      this.storm.style.display = v.inStorm && !v.down ? "" : "none";
      this.bar.classList.toggle("isdown", !!v.down);
      this.down.style.display = v.down ? "" : "none";
      if (v.down) txt(this.down, `${v.down.by ? `ELIMINATED BY ${v.down.by.toUpperCase()}` : "ELIMINATED"} · SWITCHING…`);
      this.prev.disabled = this.next.disabled = v.count < 2;
    }
    const hs = `${v.keys.prev}|${v.keys.next}|${v.keys.list}|${v.index}|${v.count}|${v.squadOnly}`;
    if (hs !== this.hintSig) {
      this.hintSig = hs;
      this.prev.querySelector("small")?.remove(); this.next.querySelector("small")?.remove();
      el("small", "", this.prev).textContent = v.keys.prev; el("small", "", this.next).textContent = v.keys.next;
      this.hint.innerHTML = `${v.count > 0 ? `${v.index > 0 ? `${v.index} / ${v.count}` : `${v.count} TO WATCH`}${v.squadOnly ? " · SQUAD ONLY" : ""}<span class="sep">|</span>` : ""}<kbd>${esc(v.keys.list)}</kbd> ALL PLAYERS<span class="sep">|</span><kbd>DRAG</kbd> LOOK AROUND<span class="sep">|</span><kbd>WHEEL</kbd> ZOOM`;
      txt(this.lClose, `${v.keys.list} / ESC · CLOSE`);
    }
    if (lOn) this.updateList(v);
  }

  private updateList(v: SpectateView) {
    const sig = `${v.alive}|${v.squads}|${v.squadOnly}|` + v.list.map((r) => `${r.id}:${r.alive ? 1 : 0}${r.watching ? 1 : 0}${r.canWatch ? 1 : 0}${r.kills}`).join(",");
    if (sig === this.listSig) return;
    this.listSig = sig;
    txt(this.lHead, `${v.alive} ALIVE${v.trios ? ` · ${v.squads} SQUADS` : ""}`);
    this.lNote.style.display = v.squadOnly ? "" : "none";
    txt(this.lNote, "YOUR SQUAD IS STILL IN THE FIGHT — YOU CAN WATCH YOUR SQUADMATES UNTIL THEY'RE OUT");
    const skull = svgGlyph("skull", "", UI.creamText).outerHTML;
    let html = "";
    for (const r of v.list) {
      const tagName = r.alive && r.canWatch && !r.watching ? "button" : "div";
      const cls = `row${r.watching ? " on" : ""}${r.alive ? "" : " out"}${r.alive && !r.canWatch ? " locked" : ""}${r.mate ? " mate" : ""}`;
      const st = r.watching ? "WATCHING" : !r.alive ? "OUT" : r.mate ? "SQUAD" : r.canWatch ? "WATCH" : "";
      const col = r.mate ? UI.yellow : squadHue(r.team);
      html += `<${tagName} class="${cls}" ${tagName === "button" ? `type="button" data-id="${r.id}"` : ""}><span class="sq" style="background:${col}"></span><span class="nm">${esc(r.name.toUpperCase())}</span><span class="k">${skull}${r.kills}</span><span class="st">${st}</span></${tagName}>`;
    }
    this.rows.innerHTML = html;
  }
}
