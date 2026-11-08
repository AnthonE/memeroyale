// MEDALS: a special kill pops a medal — a hexagon badge in the accolade's colour with its
// emblem, the title, one short line — in a row under the elimination banner (never near the crosshair). A kill's medals
// pop one after another (a cascade), hold, then lift away; the next kill's row replaces them. DOM + inline SVG (crisp at
// any size), transform / opacity animation only (WAAPI), nothing per frame while idle. The game decides what a kill earns
// (client/src/game/accolades.ts) and plays the sound; this only shows them.
import type { AccoladeId } from "./api";
import { addCss } from "./styles";
import { T } from "./toon";

/** title, colour, emblem (a 100 × 100 glyph drawn in cream with a dark edge; `num` = a big number instead) */
export const MEDALS: Record<AccoladeId, { title: string; color: string; glyph: string; num?: string }> = {} as never;
const HEX = "M50 3L95 28V82L50 107L5 82V28Z", HEX_IN = "M50 12L87 33V77L50 98L13 77V33Z";
const INK = "#0b0f16", GOLD = "#ffd400";
const G = {
  speed: `<path d="M-14 44H4M-20 56H2M-12 68H4" stroke="#fffbea" stroke-width="5" stroke-linecap="round"/>`,
  tuk: `<path d="M24 22H66Q74 22 77 30L80 38H16L19 29Q21 22 24 22Z"/><path d="M23 38H29V54H23ZM63 38H69V54H63Z"/><path d="M12 52H72Q86 52 92 64L94 70Q95 76 89 76H12Q7 76 7 70V58Q7 52 12 52Z"/><circle cx="27" cy="78" r="11"/><circle cx="77" cy="78" r="11"/><circle cx="27" cy="78" r="3.5" fill="${INK}" stroke="none"/><circle cx="77" cy="78" r="3.5" fill="${INK}" stroke="none"/>`,
  impact: `<path d="M96 40L104 50L116 46L110 58L120 66L107 68L106 81L97 72L88 78L90 66Z" fill="${GOLD}"/>`,
  shots: `<path d="M98 30H118M100 42H124M98 54H116" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/>`,
  heli: `<path d="M8 22H92" stroke="#fffbea" stroke-width="6" stroke-linecap="round"/><path d="M48 22V30"/><path d="M22 34Q24 30 40 30H56Q74 30 80 44L82 52Q83 62 70 62H30Q18 62 18 50Z"/><path d="M78 44H96L98 38H104V52H86Z"/><path d="M24 70H72M32 62L30 70M62 62L64 70" stroke="#fffbea" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M28 38H44V48H26Z" fill="#7fd4ff"/>`,
  rotor: `<circle cx="50" cy="50" r="9"/><path d="M50 41C58 20 80 10 92 12C90 22 70 38 56 46Z"/><path d="M58 55C80 58 92 78 88 90C78 88 62 70 54 58Z"/><path d="M42 54C30 74 10 82 4 74C10 64 30 52 44 46Z"/><path d="M20 30A40 40 0 0 1 40 13M82 62A40 40 0 0 1 70 84M18 72A40 40 0 0 1 11 50" fill="none" stroke="#fffbea" stroke-width="4" stroke-linecap="round" opacity=".8"/>`,
  minigun: `<path d="M6 40H22V60H6Z"/><path d="M22 34H48V66H22Z"/><path d="M48 38H90V44H48ZM48 47H94V53H48ZM48 56H90V62H48Z"/><path d="M28 66H40L36 82H24Z"/><path d="M92 36L104 30L100 44L112 50L100 56L104 70L92 64Z" fill="${GOLD}"/>`,
  head: `<circle cx="50" cy="52" r="26"/><circle cx="26" cy="46" r="8"/><circle cx="74" cy="46" r="8"/><circle cx="50" cy="52" r="34" fill="none" stroke="#ff4a3a" stroke-width="6"/><path d="M50 8V30M50 74V96M6 52H28M72 52H94" stroke="#ff4a3a" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="52" r="5" fill="#ff4a3a" stroke="none"/>`,
  scope: `<circle cx="50" cy="50" r="40" fill="none" stroke="#fffbea" stroke-width="7"/><path d="M50 14V40M50 60V86M14 50H40M60 50H86" stroke="#fffbea" stroke-width="5" stroke-linecap="round"/><path d="M50 64V68M50 74V78M36 50H32M68 50H64" stroke="#fffbea" stroke-width="3"/><circle cx="50" cy="50" r="4"/>`,
  banana: `<path d="M14 30Q18 78 66 84Q86 86 92 74Q70 76 52 64Q30 50 26 26Z"/><path d="M22 20L28 28M20 30L12 26" stroke="#fffbea" stroke-width="5" stroke-linecap="round"/><path d="M60 22L66 8L72 22L86 18L78 30L90 38L76 40L78 54L66 44L56 52L56 38L42 34L56 30Z" fill="${GOLD}"/>`,
  skull: `<path d="M50 10C28 10 14 26 14 46C14 58 20 66 28 70V82Q28 88 34 88H66Q72 88 72 82V70C80 66 86 58 86 46C86 26 72 10 50 10Z"/><circle cx="36" cy="48" r="9" fill="${INK}" stroke="none"/><circle cx="64" cy="48" r="9" fill="${INK}" stroke="none"/><path d="M50 60L55 70H45Z" fill="${INK}" stroke="none"/>`,
  payback: `<path d="M50 14C28 14 16 30 16 46C16 56 21 64 28 68V78Q28 84 34 84H66Q72 84 72 78V68C79 64 84 56 84 46C84 30 72 14 50 14Z"/><circle cx="37" cy="47" r="8" fill="${INK}" stroke="none"/><circle cx="63" cy="47" r="8" fill="${INK}" stroke="none"/><path d="M12 30A42 42 0 0 1 80 12" fill="none" stroke="#46d160" stroke-width="7" stroke-linecap="round"/><path d="M74 2L90 14L72 22Z" fill="#46d160"/>`,
  burst: `<path d="M50 4L60 32L88 22L72 46L98 58L68 64L74 94L50 74L26 94L32 64L2 58L28 46L12 22L40 32Z" fill="${GOLD}"/><path d="M50 26L56 42L72 38L62 52L76 62L58 62L60 78L50 66L40 78L42 62L24 62L38 52L28 38L44 42Z" fill="#ff6a2a" stroke="none"/>`,
  flame: `<path d="M50 4C56 22 76 30 76 56C76 76 64 92 50 92C36 92 24 78 24 60C24 46 32 38 36 30C38 40 42 46 48 48C46 32 46 16 50 4Z" fill="#ff6a2a"/><path d="M50 40C54 52 64 56 64 70C64 80 58 88 50 88C42 88 36 81 36 72C36 62 44 58 50 40Z" fill="${GOLD}" stroke="none"/>`,
};
Object.assign(MEDALS, {
  roadkill: { title: "ROADKILL", color: "#ffb020", glyph: G.speed + G.tuk + G.impact },
  driveby: { title: "DRIVE-BY", color: "#ff8a2a", glyph: G.speed + G.tuk + G.shots },
  flyby: { title: "FLY-BY", color: "#35c8ff", glyph: G.heli + G.shots },
  chopped: { title: "CHOPPED", color: "#ff4a3a", glyph: G.rotor },
  topbanana: { title: "BRRRT", color: "#ffd400", glyph: G.minigun },
  headshot: { title: "HEADSHOT", color: "#ff3b30", glyph: G.head },
  longshot: { title: "LONG SHOT", color: "#35d0ff", glyph: G.scope },
  bananasplit: { title: "RATIOED", color: "#ffd400", glyph: G.banana },
  wrecked: { title: "WRECKED", color: "#ff7a2a", glyph: G.burst },
  payback: { title: "PAYBACK", color: "#46d160", glyph: G.payback },
  double: { title: "DOUBLE KILL", color: "#ff9a2a", glyph: "", num: "2×" },
  triple: { title: "TRIPLE KILL", color: "#ff4a3a", glyph: "", num: "3×" },
  quad: { title: "QUAD KILL", color: "#b45cff", glyph: "", num: "4×" },
  rampage: { title: "RAMPAGE", color: "#ff2f6d", glyph: G.flame + `<g transform="translate(25 32) scale(.5)">${G.skull}</g>` },
});

let gradN = 0;
/** the badge: rim + inner field in `c`, a soft top light, the emblem (ids unique per badge: several on screen at once) */
function badgeSvg(c: string, glyph: string): string {
  const k = gradN++;
  return `<svg viewBox="0 0 100 110" aria-hidden="true"><defs>
  <linearGradient id="kmr${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d0"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="#3a2a08"/></linearGradient>
  <linearGradient id="kmf${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${INK}"/></linearGradient>
  <radialGradient id="kmh${k}" cx=".5" cy=".28" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <path d="${HEX}" fill="url(#kmr${k})"/><path d="${HEX}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="${HEX_IN}" fill="url(#kmf${k})" stroke="rgba(0,0,0,.5)" stroke-width="1.5"/><path d="${HEX_IN}" fill="url(#kmh${k})"/>
  <g transform="translate(15 19) scale(.7)" fill="#fffbea" stroke="${INK}" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${glyph}</g></svg>`;
}

const CSS = `
/* (Toon) a row under the elimination banner, anchored to the screen centre so a larger HUD size keeps it on screen */
.kr-medals { position: absolute; left: 50%; top: calc(50% + ${T(140)}); transform: translateX(-50%); display: flex; gap: ${T(20)}; align-items: flex-start; pointer-events: none; }
.kr-medals.low { top: calc(50% + ${T(186)}); }
.kr-medal { position: relative; display: flex; flex-direction: column; align-items: center; width: ${T(188)}; }
.kr-medal .em { position: relative; width: ${T(84)}; height: ${T(93)}; }
.kr-medal .rays { position: absolute; left: 50%; top: 50%; width: ${T(188)}; height: ${T(188)}; margin: ${T(-94)} 0 0 ${T(-94)}; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--c) 55%, transparent) 0deg 7deg, transparent 7deg 22.5deg);
  -webkit-mask: radial-gradient(circle, #000 18%, transparent 68%); mask: radial-gradient(circle, #000 18%, transparent 68%); opacity: 0; }
/* the badge art keeps its own edge; a hard Toon drop under it */
.kr-medal svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 ${T(4)} 0 var(--kong-outline)); }
.kr-medal .num { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font-family: var(--kong-font-display); font-size: ${T(36)};
  line-height: 1; color: var(--kong-text); -webkit-text-stroke: ${T(5)} var(--kong-outline); paint-order: stroke fill; }
.kr-medal .t { margin-top: ${T(8)}; font-family: var(--kong-font-display); font-size: ${T(28)}; letter-spacing: .03em; line-height: 1; color: var(--kong-text); white-space: nowrap;
  -webkit-text-stroke: ${T(5)} var(--kong-outline); paint-order: stroke fill; text-shadow: 0 ${T(4)} 0 var(--kong-outline); }
.kr-medal .s { margin-top: ${T(10)}; padding: ${T(5)} ${T(12)}; border-radius: 999px; font-family: var(--kong-font-ui); font-weight: 900; font-size: ${T(12)}; letter-spacing: .1em; line-height: 1;
  color: var(--kong-text); white-space: nowrap; text-transform: uppercase; background: color-mix(in srgb, var(--kong-surface) 92%, transparent);
  border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: var(--kong-drop-pill), inset 0 ${T(-3)} 0 color-mix(in srgb, var(--c) 80%, transparent); }
`;

export interface MedalEvent { at: number; id: AccoladeId; sub: string }
/** a kill's medals stay this long (s) after the last one popped, then lift away over EXIT_S */
const HOLD_S = 2.2, EXIT_S = 0.35, STAGGER_S = 0.22, MAX = 3;

export class Medals {
  readonly el = document.createElement("div");
  private seen = -Infinity;
  private shown: Array<{ el: HTMLElement; at: number }> = [];
  private lastPop = -99; private leaving = false;
  constructor(parent: HTMLElement) { addCss("kr-ui-medals", CSS); this.el.className = "kr-medals kr-hide"; parent.appendChild(this.el); }

  /** new events (their `at` above the last seen) start a row; `now` = the HUD's clock (s) */
  update(events: readonly MedalEvent[] | undefined, now: number, calm: boolean) {
    let fresh: MedalEvent[] | null = null;
    if (events) for (const e of events) if (e.at > this.seen) { (fresh ??= []).push(e); }
    if (fresh) {
      this.seen = fresh[fresh.length - 1].at;
      // a new kill's medals replace whatever is up (one row, never a backlog)
      const batch = fresh.length > MAX ? fresh.slice(fresh.length - MAX) : fresh;
      this.clear();
      this.el.classList.remove("kr-hide"); this.leaving = false;
      batch.forEach((e, i) => this.pop(e, i * STAGGER_S, calm));
      this.lastPop = now + (batch.length - 1) * STAGGER_S;
      return;
    }
    if (!this.shown.length) return;
    const age = now - this.lastPop;
    if (!this.leaving && age > HOLD_S) {
      this.leaving = true;
      for (const m of this.shown) m.el.animate(calm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-18%) scale(0.94)" }], { duration: EXIT_S * 1000, easing: "ease-in", fill: "forwards" });
    }
    if (this.leaving && age > HOLD_S + EXIT_S + 0.05) { this.clear(); this.el.classList.add("kr-hide"); }
  }

  private clear() { for (const m of this.shown) m.el.remove(); this.shown.length = 0; }

  private pop(e: MedalEvent, delay: number, calm: boolean) {
    const M = MEDALS[e.id]; if (!M) return;
    const m = document.createElement("div"); m.className = "kr-medal"; m.style.setProperty("--c", M.color);
    m.innerHTML = `<div class="em"><div class="rays"></div>${badgeSvg(M.color, M.glyph)}${M.num ? `<div class="num">${M.num}</div>` : ""}</div><div class="t"></div><div class="s"></div>`;
    (m.querySelector(".t") as HTMLElement).textContent = M.title;
    (m.querySelector(".s") as HTMLElement).textContent = e.sub;
    this.el.appendChild(m); this.shown.push({ el: m, at: e.at });
    const d = delay * 1000, ez = "cubic-bezier(.2,.8,.2,1)";
    const em = m.querySelector(".em") as HTMLElement, rays = m.querySelector(".rays") as HTMLElement, t = m.querySelector(".t") as HTMLElement, s = m.querySelector(".s") as HTMLElement;
    if (calm) { m.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: d, fill: "backwards" }); return; }
    em.animate([{ transform: "scale(0.25) rotate(-28deg)", opacity: 0 }, { transform: "scale(1.2) rotate(5deg)", opacity: 1, offset: 0.55 }, { transform: "scale(0.96) rotate(-1deg)", offset: 0.8 }, { transform: "none", opacity: 1 }],
      { duration: 460, delay: d, easing: ez, fill: "backwards" });
    rays.animate([{ transform: "scale(0.5) rotate(0deg)", opacity: 0 }, { transform: "scale(1.05) rotate(40deg)", opacity: 0.95, offset: 0.25 }, { transform: "scale(1.25) rotate(110deg)", opacity: 0 }],
      { duration: 1500, delay: d + 80, easing: "ease-out", fill: "both" });
    t.animate([{ transform: "translateY(40%) scale(1.3)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 340, delay: d + 140, easing: ez, fill: "backwards" });
    s.animate([{ transform: "translateY(-30%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300, delay: d + 260, easing: "ease-out", fill: "backwards" });
  }
}
