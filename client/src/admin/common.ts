// Admin page helpers shared by the two admin bundles (login.js, console.js; each is its own IIFE, so this module is
// inlined into both). Screen-safety rules for everything under client/src/admin/:
//  - player-controlled text (names, lobby names) only ever reaches the DOM through textContent / text nodes (`h()`);
//    the only innerHTML is the static icon markup below and the QR svg generated from our own link;
//  - nothing secret is ever rendered, logged, stored or put into the URL (the page never touches location/query/hash).
import { injectToon, T } from "../ui/toon";

/** an admin URL relative to the admin page (`…/admin`, also when opened as `…/admin/`; query + hash are ignored) */
export function adminUrl(path: string): string {
  return new URL(path, location.origin + location.pathname.replace(/\/+$/, "")).href;
}

/** the Toon fonts, tokens and primitives (once per page, even with both bundles loaded) */
export function ensureToon(): void {
  if (!document.getElementById("kr-toon")) injectToon();
  addStyle("kr-admin-base", BASE_CSS);
  document.title = "Meme Royale · ADMIN";
}

export function addStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/** an element with classes and (plain) text: the only way admin code puts text on screen */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string | number): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = String(text);
  return e;
}

/** static icons (our own markup, no data in it), 24×24 stroke icons in currentColor */
const ICONS = {
  copy: `<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>`,
  check: `<path d="M4.5 12.5l5 5L19.5 7"/>`,
  qr: `<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>`,
  open: `<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>`,
  logout: `<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 8l-4 4 4 4M6 12h10"/>`,
  shield: `<path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>`,
  alert: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/>`,
  balance: `<path d="M12 4v16M5 20h14M6 8l-3 6h6zM18 8l-3 6h6zM6 8h12"/>`,
  shuffle: `<path d="M4 7h3.5c4 0 5 10 9 10H20M17 14l3 3-3 3M4 17h3.5c1.4 0 2.5-1.2 3.4-2.8M13.1 9.8C14 8.2 15.1 7 16.5 7H20M17 4l3 3-3 3"/>`,
  pencil: `<path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 3 0l.5.5a2 2 0 0 1 0 3L8.5 19z"/>`,
  kick: `<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.3 3.4-5.5 6.5-5.5 1.2 0 2.3.3 3.2.9M15.5 15.5l5 5M20.5 15.5l-5 5"/>`,
  move: `<path d="M5 12h14M14 7l5 5-5 5"/>`,
  lock: `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  x: `<path d="M6 6l12 12M18 6L6 18"/>`,
  chev: `<path d="M8 10l4 4 4-4"/>`,
  user: `<circle cx="12" cy="8" r="3.5"/><path d="M5 19.5c.9-3.3 3.6-5.5 7-5.5s6.1 2.2 7 5.5"/>`,
} as const;
export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = ""): HTMLSpanElement {
  const s = h("span", "tn-adm-ico" + (cls ? " " + cls : ""));
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return s;
}

/** the loud "this is the admin window" chip (also on the login screen) */
export function adminChip(): HTMLElement {
  const c = h("span", "tn-chip tn-adm-private");
  c.append(icon("lock"), h("span", "", "Admin view · Private"));
  return c;
}

/** the quiet screen-safety promise at the foot of every admin screen */
export function safeNote(): HTMLElement {
  const p = h("p", "tn-support tn-adm-safe");
  p.append(icon("shield"), h("span", "", "Nothing on this screen is secret: no keys, tokens or IP addresses are ever shown."));
  return p;
}

/** a hidden-until-busy spinner for a button */
export function spinner(): HTMLSpanElement {
  const s = h("span", "tn-adm-spin");
  s.setAttribute("aria-hidden", "true");
  return s;
}

/** show a control as waiting for the server (disabled + spinner) */
export function setBusy(el: HTMLElement, on: boolean): void {
  el.classList.toggle("is-busy", on);
  if (on) el.setAttribute("aria-busy", "true");
  else el.removeAttribute("aria-busy");
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
    if (on) { el.dataset.admBusy = "1"; el.disabled = true; }
    else if (el.dataset.admBusy) { delete el.dataset.admBusy; el.disabled = el.dataset.admOff === "1"; }
  }
}
/** set a control's own disabled state without fighting setBusy() */
export function setOff(el: HTMLButtonElement | HTMLInputElement, off: boolean): void {
  el.dataset.admOff = off ? "1" : "";
  el.disabled = off || el.dataset.admBusy === "1";
}

const BASE_CSS = `
html, body { margin: 0; min-height: 100%; background: var(--kong-bg); }
body.kr-admin { color: var(--kong-text); font-family: var(--kong-font-ui); -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; }
body.kr-admin *, body.kr-admin *::before, body.kr-admin *::after { box-sizing: border-box; }
/* the red edge: which window is the admin one, at a glance on a shared screen */
body.kr-admin::before { content: ""; position: fixed; left: 0; right: 0; top: 0; height: ${T(8)}; z-index: 50; background: var(--kong-danger);
  box-shadow: 0 ${T(2)} 0 var(--kong-outline); pointer-events: none; }
.tn-adm-ico { display: inline-flex; flex: none; width: ${T(24)}; height: ${T(24)}; }
.tn-adm-ico svg { width: 100%; height: 100%; display: block; }
.tn-chip.tn-adm-private { background: var(--kong-danger); color: var(--kong-text); letter-spacing: .14em; text-transform: uppercase;
  font-size: ${T(15)}; padding: ${T(7)} ${T(16)} ${T(7)} ${T(12)}; }
.tn-adm-private .tn-adm-ico { width: ${T(18)}; height: ${T(18)}; }
.tn-adm-safe { display: flex; align-items: center; gap: ${T(10)}; margin: 0; color: var(--kong-text-faint); }
.tn-adm-safe .tn-adm-ico { width: ${T(20)}; height: ${T(20)}; color: var(--kong-success); }
.tn-adm-spin { display: none; flex: none; width: ${T(20)}; height: ${T(20)}; border-radius: 50%; border: ${T(3)} solid currentColor;
  border-right-color: transparent; animation: tn-adm-spin .8s linear infinite; }
.is-busy > .tn-adm-spin { display: inline-block; }
.is-busy > .tn-adm-ico { display: none; }
@keyframes tn-adm-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .tn-adm-spin { animation-duration: 2.4s; } }
.tn-adm-input { width: 100%; height: ${T(56)}; padding: 0 ${T(16)}; outline: none; background: var(--kong-bg); color: var(--kong-text);
  border: var(--kong-outline-sm) solid var(--kong-outline); border-radius: ${T(12)}; box-shadow: inset 0 ${T(3)} 0 var(--kong-outline);
  caret-color: var(--kong-accent); font-family: var(--kong-font-ui); font-weight: 800; font-size: ${T(22)}; user-select: text; }
.tn-adm-input::placeholder { color: var(--kong-text-faint); opacity: 1; }
.tn-adm-input:focus-visible { outline: var(--kong-focus-width) solid var(--kong-focus); outline-offset: var(--kong-focus-offset); }
.tn-adm-input[aria-invalid="true"] { border-color: var(--kong-danger); }
.tn-adm-input:disabled { color: var(--kong-disabled-text); }
.tn-adm-err { display: flex; align-items: flex-start; gap: ${T(10)}; margin: 0; color: var(--kong-danger); font-weight: 800;
  font-size: var(--kong-fs-body); line-height: var(--kong-lh-body); }
.tn-adm-err .tn-adm-ico { margin-top: ${T(2)}; }
.tn-adm-err:empty, .tn-adm-err[hidden] { display: none; }
.tn-btn .tn-adm-ico { width: ${T(22)}; height: ${T(22)}; }
.tn-btn.is-busy { cursor: progress; }
.tn-adm-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;
