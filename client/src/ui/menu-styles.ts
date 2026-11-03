// Menu screens (title / lobby / results / pause / loading) — the mood: a chunky banana-yellow block
// logotype + a left menu column over the live island, premium but simple. Sized in --u like the HUD.
import { UI, U as u, addCss } from "./styles";
import { T } from "./toon";

export function injectMenuStyles(): void { addCss("kr-ui-menu", MENU_CSS); addCss("kr-ui-match-menu", MATCH_MENU_CSS); }

const MENU_CSS = `
.kr-lobby, .kr-results, .kr-pause { pointer-events: auto; user-select: none; -webkit-user-select: none; }
.kr-lobby input, .kr-results input { user-select: text; -webkit-user-select: text; }

/* ------------------------------------------------------------------ title / lobby
   The Toon lobby's styles live in lobby-styles.ts. The .kr-btn block below stays: the results card uses it
   (and a few lobby buttons carry .kr-btn as the controller's first-focus hook; lobby-styles.ts overrides it there). */
.kr-btn { display: flex; align-items: center; justify-content: center; gap: ${u(14)}; width: 100%; height: ${u(90)}; border: 0; border-radius: ${u(10)}; cursor: pointer;
  font: 800 ${u(44)} ${UI.cond}; letter-spacing: ${u(5)}; color: #1d1400;
  background: linear-gradient(180deg, #ffe45c 0%, ${UI.yellow} 48%, #eab800 100%);
  box-shadow: 0 ${u(6)} 0 #9c7400, 0 ${u(12)} ${u(24)} rgba(0,0,0,0.35), inset 0 ${u(2)} 0 rgba(255,255,255,0.55);
  transition: transform .07s, box-shadow .07s, filter .12s; position: relative; top: 0; }
.kr-btn:hover { filter: brightness(1.07); }
.kr-btn:active { top: ${u(4)}; box-shadow: 0 ${u(2)} 0 #9c7400, 0 ${u(6)} ${u(14)} rgba(0,0,0,0.35), inset 0 ${u(2)} 0 rgba(255,255,255,0.5); }
.kr-btn.ghost { color: ${UI.creamText}; background: rgba(4,14,24,0.62); border: ${u(2.5)} solid rgba(255,212,0,0.85);
  box-shadow: 0 ${u(8)} ${u(20)} rgba(0,0,0,0.3); font-size: ${u(36)}; height: ${u(78)}; }
.kr-btn.ghost:hover { background: rgba(255,212,0,0.14); }
.kr-btn:disabled { opacity: 0.45; cursor: default; filter: grayscale(0.4); }
.kr-btn svg { width: ${u(38)}; height: ${u(38)}; }

/* ------------------------------------------------------------------ results */
.kr-results { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; font-family: ${UI.sans}; color: ${UI.creamText};
  background: radial-gradient(ellipse 70% 70% at 50% 45%, rgba(6,12,20,0.35), rgba(6,12,20,0.82)); }
.kr-results.win { background: radial-gradient(ellipse 70% 70% at 50% 40%, rgba(80,56,0,0.3), rgba(10,8,2,0.82)); }
.kr-results canvas.confetti { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.kr-results .card { position: relative; width: ${u(1040)}; padding: ${u(46)} ${u(60)} ${u(46)}; text-align: center;
  background: linear-gradient(180deg, rgba(14,42,62,0.92), rgba(8,22,34,0.94)); border: ${u(3)} solid ${UI.yellow}; border-radius: ${u(16)};
  box-shadow: 0 ${u(30)} ${u(80)} rgba(0,0,0,0.6), inset 0 ${u(1)} 0 rgba(255,255,255,0.08); }
.kr-results.win .card { box-shadow: 0 0 ${u(80)} rgba(255,200,0,0.35), 0 ${u(30)} ${u(80)} rgba(0,0,0,0.6); }
.kr-results .kick { font: 800 ${u(30)} ${UI.cond}; letter-spacing: ${u(8)}; color: rgba(246,239,198,0.7); }
.kr-results .place { font: 900 ${u(210)} ${UI.block}; line-height: 0.95; color: ${UI.yellow}; margin: ${u(8)} 0 ${u(2)};
  text-shadow: 0 ${u(8)} 0 #7a5a00, 0 ${u(16)} ${u(30)} rgba(0,0,0,0.5); }
.kr-results .place small { font-size: ${u(90)}; vertical-align: ${u(70)}; margin-right: ${u(6)}; }
.kr-results.win .place { font-size: ${u(150)}; line-height: 1.05; letter-spacing: ${u(2)}; }
.kr-results .of { font: 800 ${u(34)} ${UI.cond}; letter-spacing: ${u(6)}; color: ${UI.creamText}; }
.kr-results .kb { min-height: ${u(40)}; margin-top: ${u(14)}; font: 700 ${u(28)} ${UI.cond}; letter-spacing: ${u(3)}; color: rgba(246,239,198,0.75); }
.kr-results .kb b { color: #ff7a5c; font-weight: 800; }
.kr-results .stats { display: grid; grid-template-columns: repeat(var(--n, 3), 1fr); gap: ${u(14)}; margin: ${u(28)} 0 ${u(26)}; }
.kr-results .stat { padding: ${u(18)} ${u(10)} ${u(16)}; border-radius: ${u(10)}; background: rgba(4,14,24,0.6); border: ${u(1.5)} solid rgba(246,239,198,0.12); }
.kr-results .stat .v { font: 800 ${u(66)} ${UI.sans}; line-height: 1; color: ${UI.creamText}; }
.kr-results .stat .k { margin-top: ${u(8)}; font: 800 ${u(22)} ${UI.cond}; letter-spacing: ${u(4)}; color: rgba(246,239,198,0.6); }
.kr-results .stat.hl .v { color: ${UI.yellow}; }
.kr-results .squad { display: flex; flex-direction: column; gap: ${u(8)}; margin: ${u(-8)} 0 ${u(26)}; }
.kr-results .squad .r { display: grid; grid-template-columns: 1fr ${u(170)} ${u(200)}; align-items: center; height: ${u(52)}; padding: 0 ${u(20)};
  border-radius: ${u(6)}; background: rgba(4,14,24,0.5); font: 800 ${u(28)} ${UI.cond}; letter-spacing: ${u(2)}; text-align: left; }
.kr-results .squad .r.me { color: ${UI.yellow}; }
.kr-results .squad .r span:not(:first-child) { text-align: right; color: rgba(246,239,198,0.8); }
.kr-results .btns { display: grid; grid-template-columns: 1fr; gap: ${u(12)}; width: ${u(560)}; margin: 0 auto; }
.kr-results .hint { margin-top: ${u(16)}; font: 700 ${u(20)} ${UI.sans}; letter-spacing: ${u(1.5)}; color: rgba(246,239,198,0.5); }
/* personal bests (this device): under the stats, sized with the card */
.kr-results .recap { margin: ${u(-6)} 0 ${u(26)}; padding: ${u(18)} ${u(24)}; text-align: left; background: rgba(4,14,24,0.65);
  border: ${u(1.5)} solid rgba(255,212,0,0.3); border-radius: ${u(10)}; }
.kr-results .recap[hidden] { display: none; }
.kr-results .recap-context { font: 700 ${u(19)} ${UI.sans}; letter-spacing: ${u(1)}; color: #ffe98a; }
.kr-results .recap-title { margin-top: ${u(6)}; font: 800 ${u(32)} ${UI.cond}; letter-spacing: ${u(1.5)}; color: #fff4c4; }
.kr-results .recap-records { margin-top: ${u(8)}; font: 700 ${u(22)} ${UI.sans}; line-height: 1.45; color: #fff4c4; }
.kr-results .recap-target { margin-top: ${u(8)}; font: 600 ${u(20)} ${UI.sans}; line-height: 1.45; color: #e9e1c7; }
.kr-results .recap-status { margin-top: ${u(10)}; font: 600 ${u(17)} ${UI.sans}; line-height: 1.4; color: #bdc8cd; }
`;

/* ------------------------------------------------------------------ match menu (ui/match-menu.ts)
   A full-height left sidebar, the game visible on the right. Units: the
   1920×1080 menu canvas (not the HUD size), so T(n) = n design px on any window. No blur, no glass. */
const MATCH_MENU_CSS = `
.kr-mm { --tu: min(calc(100vh / 1080), calc(100vw / 1920)); position: fixed; inset: 0; z-index: 20; display: none; pointer-events: auto;
  color: var(--kong-text); font-family: var(--kong-font-ui); }
.kr-mm.on { display: block; }
.kr-mm:focus { outline: none; }
.kr-mm .mm-scrim { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(7,20,34,.96) 0, rgba(7,20,34,.92) ${T(600)}, rgba(7,20,34,.3) ${T(860)}, rgba(7,20,34,.08) ${T(1150)}, rgba(7,20,34,0) ${T(1500)});
  animation: mm-fade var(--kong-motion-standard) ease-out both; }
.kr-mm .mm-panel { position: absolute; left: ${T(96)}; top: ${T(84)}; bottom: ${T(56)}; width: ${T(560)}; display: flex; flex-direction: column;
  animation: mm-in var(--kong-motion-standard) var(--kong-ease-spring) both; }
@keyframes mm-in { from { transform: translateX(${T(-120)}); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes mm-fade { from { opacity: 0; } to { opacity: 1; } }
html.kr-calm .kr-mm .mm-panel, html.kr-calm .kr-mm .mm-scrim { animation: none; }
/* the report bar replaces the menu while it is up; SETTINGS hides it (settings-css.ts) */
.kr-mm.reporting .mm-panel { visibility: hidden; }

.kr-mm .mm-ctx { display: flex; align-items: center; gap: ${T(24)}; font: 900 var(--kong-fs-support)/var(--kong-lh-support) var(--kong-font-ui);
  letter-spacing: .12em; text-transform: uppercase; color: var(--kong-text); white-space: nowrap; }
.kr-mm .mm-ctx i { flex: 1; height: ${T(3)}; border-radius: ${T(3)}; background: rgba(255,248,231,.55); }
.kr-mm .mm-title { margin: ${T(40)} 0 0; font: 400 ${T(172)}/.8 var(--kong-font-display); letter-spacing: .01em; color: var(--kong-text);
  -webkit-text-stroke: var(--kong-text-outline-md) var(--kong-outline); paint-order: stroke fill; text-shadow: 0 ${T(7)} 0 var(--kong-outline); }
.kr-mm .mm-sub { margin-top: ${T(26)}; display: flex; align-items: center; gap: ${T(12)}; font: 800 ${T(20)}/1 var(--kong-font-ui);
  letter-spacing: .26em; text-transform: uppercase; color: var(--kong-warning); }
.kr-mm .mm-sub i { width: ${T(8)}; height: ${T(8)}; border-radius: 50%; background: var(--kong-warning); }

.kr-mm .mm-main { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.kr-mm .mm-main[hidden], .kr-mm .mm-confirm[hidden] { display: none; }
.kr-mm .mm-list { display: flex; flex-direction: column; gap: ${T(14)}; margin-top: ${T(56)}; }
.kr-mm .mm-leave { margin-top: ${T(36)}; }
.kr-mm .mm-item { appearance: none; position: relative; display: flex; align-items: center; justify-content: space-between; gap: ${T(16)};
  box-sizing: border-box; width: 100%; height: ${T(76)}; padding: 0 ${T(28)}; text-align: left; cursor: pointer;
  border: var(--kong-outline-md) solid var(--kong-outline); border-radius: var(--kong-radius-tile); box-shadow: var(--kong-drop-button);
  background: linear-gradient(180deg, #1C4B6A, #12344B); color: #E6F1F8;
  font: 900 ${T(32)}/1 var(--kong-font-ui); letter-spacing: .1em; text-transform: uppercase; white-space: nowrap;
  transition: transform var(--kong-motion-standard) var(--kong-ease-spring), background var(--kong-motion-fast), color var(--kong-motion-fast), box-shadow var(--kong-motion-fast); }
.kr-mm .mm-item[hidden] { display: none; }
.kr-mm .mm-item small { font: 900 ${T(15)}/1 var(--kong-font-ui); letter-spacing: .12em; padding: ${T(5)} ${T(10)}; border-radius: 999px;
  border: var(--kong-outline-xs) solid var(--kong-outline); background: rgba(4,16,26,.55); color: var(--kong-text-muted); }
.kr-mm .mm-item[aria-pressed="true"] small { background: var(--kong-success); color: var(--kong-outline); }
/* the selected entry (keyboard, controller or mouse) is the yellow one */
.kr-mm .mm-item:focus { outline: none; }
.kr-mm .mm-item:focus, .kr-mm .mm-item.is-sel { background: var(--kong-gradient-primary); color: var(--kong-on-accent); transform: translateX(${T(10)}) scale(1.02); }
.kr-mm .mm-item:focus small { color: var(--kong-outline); background: rgba(255,248,231,.7); }
.kr-mm .mm-item:active { transform: translateX(${T(10)}) translateY(${T(5)}); box-shadow: var(--kong-drop-pressed); transition-duration: 60ms; }
/* Leave match: quiet red until selected, then the danger gradient; only as wide as its label */
.kr-mm .mm-item[data-act="leave"], .kr-mm .mm-item[data-act="leave-yes"] { width: auto; align-self: flex-start; background: linear-gradient(180deg, #5A2430, #3E1820); color: #FFD1D6; }
.kr-mm .mm-item[data-act="leave"]:focus, .kr-mm .mm-item[data-act="leave-yes"]:focus { background: var(--kong-gradient-danger); color: #fff; }
.kr-mm .mm-leave { border-top: ${T(3)} solid var(--kong-rule); padding-top: ${T(28)}; }

/* a denser stack when the firing range shows every entry (analytics + controls coach) */
.kr-mm.dense .mm-list { gap: ${T(11)}; margin-top: ${T(44)}; }
.kr-mm.dense .mm-item { height: ${T(64)}; font-size: ${T(28)}; }
.kr-mm.dense .mm-leave { margin-top: ${T(26)}; padding-top: ${T(22)}; }

/* Leave confirm: in place of the list (one layer, no stacked modal) */
.kr-mm .mm-confirm { margin-top: ${T(56)}; padding: ${T(28)} ${T(28)} ${T(32)}; display: flex; flex-direction: column; gap: ${T(16)};
  background: var(--kong-gradient-panel); border: var(--kong-outline-md) solid var(--kong-outline); border-radius: var(--kong-radius-dialog); box-shadow: var(--kong-drop-dialog);
  animation: tn-pop var(--kong-motion-slow) var(--kong-ease-spring) both; }
html.kr-calm .kr-mm .mm-confirm { animation: none; }
.kr-mm .mm-confirm h2 { margin: 0; color: var(--kong-text); }
.kr-mm .mm-confirm-p { margin: 0; font: 600 var(--kong-fs-body)/var(--kong-lh-body) var(--kong-font-ui); color: var(--kong-text-muted); white-space: normal; }
.kr-mm .mm-confirm-btns { display: flex; flex-direction: column; gap: ${T(14)}; margin-top: ${T(8)}; }
/* inside the confirm the destructive action is the full red gradient */
.kr-mm .mm-confirm .mm-item[data-act="leave-yes"] { width: 100%; background: var(--kong-gradient-danger); color: #fff; }
.kr-mm .mm-confirm .mm-item[data-act="leave-yes"]:focus { box-shadow: var(--kong-drop-button), 0 0 0 ${T(3)} var(--kong-text); }

.kr-mm .mm-foot { margin-top: auto; padding-top: ${T(24)}; display: flex; gap: ${T(34)}; align-items: center; white-space: nowrap; }
.kr-mm .mm-foot .tn-hint { font-size: ${T(16)}; }
.kr-mm .mm-foot .tn-key { height: ${T(30)}; min-width: ${T(30)}; font-size: ${T(15)}; }
/* the controller shows its own button hints (padnav) */
html.kr-pad .kr-mm .mm-foot { visibility: hidden; }
`;
