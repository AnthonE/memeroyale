// RED BANANA buff on screen: a pulsing warm vignette round the edges and a timer pill under the crosshair
// (the banana, "RED BANANA", seconds left + a draining bar). Fades in on the bite, flickers for the last 1.5 s, gone at 0.
// Plain DOM over the canvas, pointer-events none; touches the DOM only while the buff runs (and once when it ends).
import { addCss } from "./styles";
import { itemIconUrl } from "./icons";
import { T } from "./toon";

// (Toon) the timer pill is an outlined navy chip (Nunito name, Lilita seconds, a capsule bar); the edge glow is warm
// orange — red on the screen edge is reserved for damage, blue for healing
const CSS = `
.kr-buff { position: fixed; inset: 0; pointer-events: none; z-index: 3; }
.kr-buff .vig { position: absolute; inset: 0; opacity: 0; box-shadow: inset 0 0 ${T(170)} ${T(10)} color-mix(in srgb, var(--kong-warning) 60%, transparent); }
.kr-buff .pill { position: absolute; left: 50%; top: calc(50% + 11vh); transform: translateX(-50%); display: flex; align-items: center; gap: ${T(8)};
  padding: ${T(5)} ${T(16)} ${T(5)} ${T(8)}; border-radius: 999px; background: color-mix(in srgb, var(--kong-surface) 92%, transparent);
  border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: var(--kong-drop-pill), inset 0 0 0 ${T(2)} var(--kong-warning); white-space: nowrap; }
.kr-buff img { width: ${T(36)}; height: ${T(36)}; object-fit: contain; }
.kr-buff .col { display: flex; flex-direction: column; gap: ${T(5)}; min-width: ${T(150)}; }
.kr-buff .row { display: flex; justify-content: space-between; align-items: baseline; gap: ${T(12)}; font-family: var(--kong-font-ui); font-weight: 900;
  font-size: ${T(14)}; letter-spacing: .1em; color: var(--kong-text); }
.kr-buff .row b { font-family: var(--kong-font-display); font-weight: 400; font-size: ${T(20)}; letter-spacing: .01em; font-variant-numeric: tabular-nums;
  -webkit-text-stroke: ${T(4)} var(--kong-outline); paint-order: stroke fill; }
.kr-buff .track { height: ${T(10)}; border-radius: 999px; background: var(--kong-outline); overflow: hidden; }
.kr-buff .track div { height: 100%; width: 100%; border-radius: 999px; background: var(--kong-gradient-primary); transform-origin: left center; }
`;

export class BuffOverlay {
  private readonly root: HTMLDivElement;
  private readonly vig: HTMLDivElement;
  private readonly pill: HTMLDivElement;
  private readonly secs: HTMLElement;
  private readonly bar: HTMLDivElement;
  private on = false; private total = 7; private t = 0; private lastTxt = "";

  constructor(parent: HTMLElement = document.body) {
    addCss("kr-buff-toon", CSS);
    const r = this.root = document.createElement("div");
    r.className = "kr-buff"; r.style.display = "none";
    const v = this.vig = document.createElement("div"); v.className = "vig";
    const p = this.pill = document.createElement("div"); p.className = "pill";
    const img = document.createElement("img"); img.src = itemIconUrl("red-banana"); img.alt = "";
    const col = document.createElement("div"); col.className = "col";
    const row = document.createElement("div"); row.className = "row";
    const name = document.createElement("span"); name.textContent = "RED BANANA";
    const secs = this.secs = document.createElement("b");
    row.append(name, secs);
    const track = document.createElement("div"); track.className = "track";
    const bar = this.bar = document.createElement("div");
    track.append(bar); col.append(row, track); p.append(img, col);
    r.append(v, p); parent.appendChild(r);
  }

  /** per frame: seconds of buff left (0 = none) */
  update(dt: number, left: number) {
    if (left <= 0) { if (this.on) { this.on = false; this.root.style.display = "none"; } return; }
    if (!this.on) { this.on = true; this.root.style.display = ""; this.t = 0; this.total = Math.max(left, 1); }
    if (left > this.total) this.total = left;   // ate another: refreshed
    this.t += dt;
    const fadeIn = Math.min(1, this.t / 0.25), end = left < 1.5 ? 0.55 + 0.45 * Math.abs(Math.sin(left * 9)) : 1;
    const pulse = 0.82 + 0.18 * Math.sin(this.t * 7.5);
    this.vig.style.opacity = (fadeIn * end * pulse * Math.min(1, left / 0.4)).toFixed(3);
    this.pill.style.opacity = (fadeIn * Math.min(1, left / 0.3)).toFixed(3);
    this.bar.style.transform = `scaleX(${(left / this.total).toFixed(4)})`;
    const txt = left.toFixed(1) + "s"; if (txt !== this.lastTxt) { this.lastTxt = txt; this.secs.textContent = txt; }
  }
  dispose() { this.root.remove(); }
}
