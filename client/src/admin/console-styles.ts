// Admin console styles. Every size is a design px on the 1920×1080 canvas through T() (the console scales with the
// window like the Toon lobby); colours, outlines, drops, radii and motion are the Toon tokens (ui/toon.ts). Console-only
// classes are `tn-adm-*`.
import { T } from "../ui/toon";

/** a colour token at an opacity (no raw hex in screen code) */
const a = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;

export const CONSOLE_CSS = `
.tn-adm-app { height: 100vh; min-height: ${T(700)}; display: flex; flex-direction: column; gap: ${T(18)};
  padding: ${T(26)} ${T(48)} ${T(14)}; background: radial-gradient(ellipse at 30% -10%, var(--kong-surface) 0%, var(--kong-bg) 60%); overflow: hidden; }

/* ---------------- top bar */
.tn-adm-bar { display: flex; align-items: center; justify-content: space-between; gap: ${T(24)}; min-height: ${T(64)}; }
.tn-adm-brand { display: flex; align-items: center; gap: ${T(18)}; min-width: 0; }
.tn-adm-brow { width: ${T(76)}; flex: none; }
.tn-adm-title { margin: 0; font-size: ${T(44)}; line-height: ${T(48)}; white-space: nowrap; -webkit-text-stroke-width: var(--kong-text-outline-sm); }
.tn-adm-brand .tn-adm-private { margin-left: ${T(6)}; }
.tn-adm-barright { display: flex; align-items: center; gap: ${T(16)}; }
.tn-adm-conn { font-size: ${T(15)}; letter-spacing: .1em; text-transform: uppercase; padding: ${T(7)} ${T(16)}; }
.tn-adm-conn .dot { width: ${T(12)}; height: ${T(12)}; border-radius: 50%; background: var(--kong-success); box-shadow: 0 0 0 ${T(2)} var(--kong-outline); }
.tn-adm-conn.is-reconnecting { color: var(--kong-warning); }
.tn-adm-conn.is-connecting { color: var(--kong-text-muted); }
.tn-adm-conn .tn-adm-spin { width: ${T(16)}; height: ${T(16)}; }
.tn-adm-logout { min-height: ${T(48)}; padding: 0 ${T(10)}; }

/* ---------------- lobby pills */
.tn-adm-pills { align-items: center; }
.tn-adm-pills[hidden] { display: none; }
.tn-adm-lpill { max-width: ${T(420)}; text-transform: none; letter-spacing: .02em; font-size: ${T(18)}; }
.tn-adm-lpill .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tn-adm-lpill small { font-size: ${T(14)}; font-weight: 800; opacity: .8; letter-spacing: .04em; }
.tn-adm-lpill .live { flex: none; width: ${T(10)}; height: ${T(10)}; border-radius: 50%; background: var(--kong-success); box-shadow: 0 0 0 ${T(2)} var(--kong-outline); }
.tn-adm-newpill { background: transparent; box-shadow: none; border-style: dashed; border-color: var(--kong-rule-strong); color: var(--kong-text-muted); }
.tn-adm-newpill .tn-adm-ico { width: ${T(18)}; height: ${T(18)}; }

/* ---------------- main + footer */
.tn-adm-main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.tn-adm-main[data-view="create"], .tn-adm-main[data-view="loading"] { align-items: center; justify-content: center; overflow: auto; }
.tn-adm-foot { display: flex; align-items: center; justify-content: space-between; gap: ${T(24)}; min-height: ${T(32)}; }
.tn-adm-evnote { margin: 0; color: var(--kong-text-faint); }
.tn-adm-evnote.is-warn { color: var(--kong-warning); }
.tn-adm-loading { display: flex; align-items: center; gap: ${T(14)}; color: var(--kong-text-muted); }
.tn-adm-loading .tn-adm-spin { width: ${T(28)}; height: ${T(28)}; }

/* ---------------- shared card bits */
.tn-adm-card { padding: ${T(20)} ${T(24)} ${T(22)}; min-width: 0; }
.tn-adm-ctop { display: flex; align-items: center; gap: ${T(14)}; min-height: ${T(30)}; }
.tn-adm-ctop .tn-eyebrow { color: var(--kong-text); }
.tn-adm-ctopnote { color: var(--kong-text-faint); }
.tn-btn.tn-adm-sm { min-height: ${T(44)}; padding: 0 ${T(16)}; gap: ${T(8)}; font-size: ${T(15)}; box-shadow: var(--kong-drop-pill); border-width: var(--kong-outline-sm); }
.tn-btn.tn-adm-sm:hover { box-shadow: 0 ${T(6)} 0 var(--kong-outline); }
.tn-btn.tn-adm-sm:active { box-shadow: var(--kong-drop-pressed); }
.tn-btn.tn-adm-sm .tn-adm-ico { width: ${T(18)}; height: ${T(18)}; }
.tn-btn--tertiary.tn-adm-sm { box-shadow: none; }
.tn-btn[hidden] { display: none; }

/* settings-style rows: outlined navy tiles, label left, control right */
.tn-adm-row { display: flex; align-items: center; justify-content: space-between; gap: ${T(16)}; padding: ${T(12)} ${T(18)}; min-height: ${T(66)}; }
.tn-adm-row:hover { background: ${a("--kong-surface", 92)}; }
.tn-adm-row:focus-within { border-color: var(--kong-accent); }
.tn-adm-row--stack { flex-direction: column; align-items: stretch; gap: ${T(8)}; }
.tn-adm-rowtxt { display: grid; gap: ${T(2)}; min-width: 0; }
.tn-adm-rowtxt .tn-support { color: var(--kong-text-faint); font-size: ${T(15)}; line-height: ${T(20)}; }
.tn-adm-rowtop { display: flex; align-items: baseline; justify-content: space-between; gap: ${T(12)}; }
.tn-adm-namehint { color: var(--kong-accent); font-size: ${T(14)}; }
.tn-adm-row.is-disabled .tn-label { color: var(--kong-disabled-text); }
.tn-adm-seg button { font-size: ${T(17)}; padding: ${T(8)} ${T(20)}; font-weight: 900; }
.tn-adm-seg button[disabled] { cursor: default; color: var(--kong-disabled-text); }
.tn-adm-seg button[aria-pressed="true"][disabled] { background: var(--kong-disabled); color: var(--kong-text); }
.tn-adm-seg.is-busy { opacity: .7; cursor: progress; }
.tn-adm-cycle { gap: ${T(10)}; }
.tn-adm-cycle button { width: ${T(38)}; height: ${T(38)}; }
.tn-adm-cycle button:focus-visible { outline: var(--kong-focus-width) solid var(--kong-focus); outline-offset: var(--kong-focus-offset); }
.tn-adm-cycle .v { min-width: ${T(124)}; font-size: ${T(19)}; }
.tn-adm-cycle .v.is-draft { color: var(--kong-accent); }
.tn-adm-cycle .tn-adm-spin { display: none; }
.tn-adm-cycle.is-busy .tn-adm-spin { display: inline-block; margin-left: ${T(-6)}; }
.tn-adm-sw { font-size: ${T(18)}; gap: ${T(10)}; }
.tn-adm-sw .tn-adm-swtxt { min-width: ${T(34)}; text-align: left; }
.tn-adm-sw[aria-checked="true"] .tn-adm-swtxt { color: var(--kong-success); }
.tn-adm-sw[disabled] { cursor: default; }
.tn-adm-sw[disabled]:not(.is-busy) .sw, .tn-adm-sw[disabled]:not(.is-busy) .tn-adm-swtxt { opacity: .45; }
.tn-adm-sw.is-busy { cursor: progress; }
.tn-adm-note { display: flex; align-items: center; gap: ${T(10)}; margin: 0; }
.tn-adm-note .tn-adm-ico { width: ${T(20)}; height: ${T(20)}; color: var(--kong-sky); }

/* ---------------- create */
.tn-adm-create { width: min(${T(760)}, 100%); padding: ${T(36)} ${T(40)} ${T(32)}; display: flex; flex-direction: column; gap: ${T(14)}; }
.tn-adm-create .tn-eyebrow { margin: 0; }
.tn-adm-bigtitle { margin: 0 0 ${T(2)}; font-family: var(--kong-font-display); font-weight: 400; font-size: ${T(60)}; line-height: ${T(64)};
  color: var(--kong-text); -webkit-text-stroke: var(--kong-text-outline-md) var(--kong-outline); paint-order: stroke fill; text-shadow: 0 ${T(5)} 0 var(--kong-outline); }
.tn-adm-cintro { margin: 0 0 ${T(10)}; }
.tn-adm-cacts { display: flex; justify-content: flex-end; align-items: center; gap: ${T(16)}; margin-top: ${T(8)}; }
.tn-adm-go { min-width: ${T(340)}; min-height: ${T(76)}; }
.tn-adm-go .tn-adm-spin, .tn-adm-start .tn-adm-spin { width: ${T(26)}; height: ${T(26)}; border-width: ${T(4)}; }

/* ---------------- lobby layout: [link | match] over [settings | roster] */
.tn-adm-lobby { flex: 1; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: ${T(20)}; }
.tn-adm-toprow { display: grid; grid-template-columns: minmax(0, 1fr) ${T(680)}; gap: ${T(20)}; }
.tn-adm-botrow { min-height: 0; display: grid; grid-template-columns: ${T(452)} minmax(0, 1fr); gap: ${T(20)}; }

/* link card */
.tn-adm-linkcard, .tn-adm-matchcard { display: flex; flex-direction: column; justify-content: space-between; gap: ${T(12)}; }
.tn-adm-code { margin-left: auto; margin-right: ${T(4)}; font-size: ${T(18)}; letter-spacing: .16em; height: ${T(34)}; }
.tn-adm-linkrow { display: flex; align-items: center; gap: ${T(18)}; min-width: 0; }
.tn-adm-link { flex: 1; min-width: 0; padding: ${T(10)} ${T(16)}; border-radius: ${T(12)}; background: var(--kong-bg);
  border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: inset 0 ${T(3)} 0 var(--kong-outline);
  font-weight: 900; font-size: ${T(30)}; line-height: ${T(36)}; letter-spacing: .01em; color: var(--kong-text); overflow-wrap: anywhere; user-select: all; }
.tn-adm-linkbtns { display: flex; gap: ${T(10)}; flex: none; }
.tn-adm-linkbtns .tn-btn.tn-adm-sm { min-height: ${T(38)}; padding: 0 ${T(14)}; font-size: ${T(14)}; }
.tn-adm-copy { flex: none; min-width: ${T(200)}; min-height: ${T(58)}; font-size: ${T(18)}; }
.tn-adm-copy .cok { display: none; }
.tn-adm-copy.is-done { color: var(--kong-success); }
.tn-adm-copy.is-done .cok { display: inline-flex; }
.tn-adm-copy.is-done .cico { display: none; }
.tn-adm-linkbtns a.tn-btn { text-decoration: none; }

/* match card */
.tn-adm-phase { flex: none; white-space: nowrap; font-size: ${T(14)}; padding: ${T(4)} ${T(12)}; }
.tn-adm-phase.ph-idle { background: var(--kong-surface-raised); color: var(--kong-text); }
.tn-adm-phase.ph-0 { background: var(--kong-sky); }
.tn-adm-phase.ph-1 { background: var(--kong-sky); }
.tn-adm-phase.ph-2 { background: var(--kong-success); }
.tn-adm-phase.ph-3 { background: var(--kong-text); }
.tn-adm-status { color: var(--kong-text); font-size: ${T(19)}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; font-variant-numeric: tabular-nums; }
.tn-adm-matchrow { display: flex; gap: ${T(14)}; }
.tn-adm-start { flex: 1; min-height: ${T(68)}; font-size: ${T(36)}; white-space: nowrap; }
.tn-adm-launch { font-size: ${T(30)}; }
.tn-adm-end { flex: none; min-height: ${T(68)}; padding: 0 ${T(24)}; font-size: ${T(17)}; white-space: nowrap; }
.tn-adm-end.is-wide { flex: 1; font-family: var(--kong-font-display); font-weight: 400; font-size: ${T(34)}; letter-spacing: .02em; text-transform: none; }
.tn-adm-end.is-wide .tn-adm-ico { width: ${T(28)}; height: ${T(28)}; }

/* settings card */
.tn-adm-settings { display: flex; flex-direction: column; gap: ${T(10)}; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--kong-rule-strong) transparent; }
.tn-adm-shead { margin: 0 0 ${T(2)}; color: var(--kong-text); }
.tn-adm-lname { height: ${T(48)}; font-size: ${T(20)}; }
.tn-adm-close { align-self: flex-start; margin-top: auto; min-height: ${T(44)}; padding: 0 ${T(8)}; gap: ${T(8)}; }
.tn-adm-close:hover { color: var(--kong-danger); }
.tn-adm-close .tn-adm-ico { width: ${T(18)}; height: ${T(18)}; }

/* ---------------- roster */
.tn-adm-roster { min-height: 0; display: flex; flex-direction: column; padding: ${T(18)} ${T(22)} ${T(16)}; }
.tn-adm-rhead { display: flex; align-items: center; justify-content: space-between; gap: ${T(16)}; margin-bottom: ${T(12)}; }
.tn-adm-rhleft { display: flex; align-items: baseline; gap: ${T(16)}; min-width: 0; }
.tn-adm-rtitle { margin: 0; font-size: ${T(36)}; line-height: ${T(40)}; }
.tn-adm-count { font-weight: 900; font-size: ${T(20)}; color: var(--kong-text-muted); font-variant-numeric: tabular-nums; }
.tn-adm-rtools { display: flex; gap: ${T(12)}; }
.tn-adm-rhint { margin-left: ${T(8)}; color: var(--kong-text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.tn-adm-rhint[hidden] { display: none; }
.tn-adm-rbody { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: ${T(270)} minmax(0, 1fr); align-items: start; gap: ${T(16)};
  padding: ${T(4)} ${T(6)} ${T(10)} ${T(2)}; scrollbar-width: thin; scrollbar-color: var(--kong-rule-strong) transparent; }
.tn-adm-roster[data-mode="solo"] .tn-adm-rbody { grid-template-columns: minmax(0, 1fr); }
.tn-adm-rbody > [hidden] { display: none; }
.tn-adm-rempty { grid-column: 1 / -1; align-self: center; justify-self: center; display: flex; flex-direction: column; align-items: center; gap: ${T(6)};
  padding: ${T(60)} 0; text-align: center; }
.tn-adm-rempty .tn-heading, .tn-adm-rempty .tn-body { margin: 0; }
.tn-adm-rempty .tn-adm-ico.big { width: ${T(64)}; height: ${T(64)}; color: var(--kong-rule-strong); margin-bottom: ${T(8)}; }

/* team cards: a dark well with three seats; the pool is the left column */
.tn-adm-teams { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: ${T(12)}; align-content: start; }
.tn-adm-team { display: flex; flex-direction: column; gap: ${T(6)}; padding: ${T(8)} ${T(10)} ${T(10)}; border-radius: var(--kong-radius-card);
  background: ${a("--kong-outline", 55)}; border: var(--kong-outline-sm) solid var(--kong-outline); min-width: 0;
  transition: border-color var(--kong-motion-fast), background var(--kong-motion-fast), transform var(--kong-motion-fast) var(--kong-ease-spring); }
.tn-adm-thead { display: flex; align-items: baseline; justify-content: space-between; gap: ${T(8)}; padding: 0 ${T(6)}; }
.tn-adm-tname { font-family: var(--kong-font-display); font-size: ${T(23)}; line-height: ${T(27)}; color: var(--kong-text);
  -webkit-text-stroke: var(--kong-text-outline-xs) var(--kong-outline); paint-order: stroke fill; }
.tn-adm-tcount { font-weight: 900; font-size: ${T(15)}; color: var(--kong-text-faint); font-variant-numeric: tabular-nums; }
.tn-adm-team.is-filled .tn-adm-tcount { color: var(--kong-text); }
.tn-adm-team.is-empty .tn-adm-tname { color: var(--kong-text-muted); }
.tn-adm-slots { display: flex; flex-direction: column; gap: ${T(7)}; }
.tn-adm-pool { position: sticky; top: 0; }
.tn-adm-pool .tn-adm-tname { color: var(--kong-sky); }
.tn-adm-pool .tn-adm-tcount { color: var(--kong-text); }
.tn-adm-pnote { margin: 0; padding: ${T(14)} ${T(8)}; text-align: center; color: var(--kong-text-faint); }
.tn-adm-seat { height: ${T(54)}; display: flex; align-items: center; justify-content: center; border-radius: var(--kong-radius-tile);
  border: var(--kong-outline-xs) dashed var(--kong-rule); color: var(--kong-text-faint); font-weight: 800; font-size: ${T(13)}; opacity: .8;
  letter-spacing: .1em; text-transform: uppercase; }
/* drag feedback: yellow = drop here, red = full */
.tn-adm-roster.is-dragging .tn-adm-team { border-style: dashed; border-color: var(--kong-rule-strong); }
.tn-adm-team.is-over { border-style: solid !important; border-color: var(--kong-accent) !important; background: ${a("--kong-accent", 12)}; transform: scale(1.02); }
.tn-adm-team.is-full { border-style: solid !important; border-color: var(--kong-danger) !important; background: ${a("--kong-danger", 10)}; }
.tn-adm-team.is-full .tn-adm-tcount { color: var(--kong-danger); }

/* player tiles */
.tn-adm-ptile { position: relative; display: grid; grid-template-rows: auto auto; align-content: center; gap: ${T(1)}; height: ${T(54)}; padding: ${T(4)} ${T(12)} ${T(4)} ${T(14)};
  cursor: grab; user-select: none; outline: none; min-width: 0; box-shadow: 0 ${T(4)} 0 var(--kong-outline); }
.tn-adm-ptile:focus-visible { outline: var(--kong-focus-width) solid var(--kong-focus); outline-offset: var(--kong-focus-offset); }
.tn-adm-ptile:hover { background: var(--kong-surface-2); }
.tn-adm-ptile.is-drag { opacity: .45; }
.tn-adm-ptile.is-busy { cursor: progress; opacity: .7; }
.tn-adm-ptile > .tn-adm-spin { position: absolute; right: ${T(10)}; top: ${T(8)}; width: ${T(16)}; height: ${T(16)}; color: var(--kong-accent); }
.tn-adm-ptile .top { display: flex; align-items: center; gap: ${T(6)}; min-width: 0; }
.tn-adm-ptile .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 900; font-size: ${T(19)}; line-height: ${T(24)};
  letter-spacing: .02em; color: var(--kong-text); }
.tn-adm-ptile .ren { width: ${T(15)}; height: ${T(15)}; color: var(--kong-text-faint); }
.tn-adm-ptile .ren[hidden] { display: none; }
.tn-adm-ptile .meta { display: flex; align-items: center; justify-content: space-between; gap: ${T(8)}; }
.tn-adm-ptile .ping, .tn-adm-ptile .st { flex: none; }
.ping { display: inline-flex; align-items: center; gap: ${T(6)}; font-weight: 800; font-size: ${T(14)}; line-height: ${T(18)}; font-variant-numeric: tabular-nums; }
.ping::before { content: ""; width: ${T(9)}; height: ${T(9)}; border-radius: 50%; background: currentColor; }
.ping.is-good { color: var(--kong-success); }
.ping.is-fair { color: var(--kong-warning); }
.ping.is-poor { color: var(--kong-danger); }
.ping.is-none { color: var(--kong-text-faint); }
.tn-adm-ptile .st { font-size: ${T(11)}; padding: ${T(1)} ${T(8)}; }
.st.st-room { background: transparent; color: var(--kong-text-faint); border-color: var(--kong-rule-strong); }
.st.st-playing { background: var(--kong-success); }
.st.st-out { background: var(--kong-disabled); color: var(--kong-text); }
.st.st-waiting { background: var(--kong-sky); }

/* SOLO: one clean list, 4 across */
.tn-adm-solo { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: ${T(12)}; align-content: start; }
.tn-adm-solo .tn-adm-ptile { cursor: pointer; }

/* kicked */
.tn-adm-kicked { grid-column: 1 / -1; border-top: ${T(2)} solid var(--kong-rule); padding-top: ${T(10)}; }
.tn-adm-kicked[hidden] { display: none; }
.tn-adm-ksum { display: flex; align-items: center; gap: ${T(12)}; cursor: pointer; list-style: none; padding: ${T(6)} ${T(4)}; border-radius: ${T(10)};
  font-weight: 900; font-size: ${T(16)}; letter-spacing: .1em; text-transform: uppercase; color: var(--kong-text-muted); }
.tn-adm-ksum::-webkit-details-marker { display: none; }
.tn-adm-ksum:focus-visible { outline: var(--kong-focus-width) solid var(--kong-focus); outline-offset: var(--kong-focus-offset); }
.tn-adm-ksum .chev { width: ${T(20)}; height: ${T(20)}; transform: rotate(-90deg); transition: transform var(--kong-motion-fast); }
.tn-adm-kicked[open] .chev { transform: none; }
.tn-adm-ksum .tn-support { text-transform: none; letter-spacing: 0; color: var(--kong-text-faint); font-weight: 700; }
.tn-adm-klist { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: ${T(10)}; padding: ${T(8)} 0 ${T(4)}; }
.tn-adm-krow { display: flex; align-items: center; gap: ${T(12)}; padding: ${T(8)} ${T(8)} ${T(8)} ${T(16)}; border-radius: var(--kong-radius-tile);
  background: ${a("--kong-outline", 55)}; border: var(--kong-outline-sm) solid var(--kong-outline); min-width: 0; }
.tn-adm-krow .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 900; font-size: ${T(17)}; }
.tn-adm-krow .tn-support { flex: none; color: var(--kong-text-faint); }

/* ---------------- player menu (popover) */
.tn-adm-menu { position: fixed; z-index: 40; width: ${T(460)}; padding: ${T(18)} ${T(20)} ${T(20)}; display: grid; gap: ${T(12)};
  border-radius: var(--kong-radius-card); box-shadow: 0 ${T(8)} 0 var(--kong-outline); transform-origin: 0 0;
  animation: tn-pop var(--kong-motion-standard) var(--kong-ease-spring) both; }
.tn-adm-mhead { display: grid; gap: ${T(2)}; padding-bottom: ${T(10)}; border-bottom: ${T(2)} solid var(--kong-rule); }
.tn-adm-mname { font-family: var(--kong-font-display); font-size: ${T(30)}; line-height: ${T(34)}; color: var(--kong-text); overflow-wrap: anywhere;
  -webkit-text-stroke: var(--kong-text-outline-xs) var(--kong-outline); paint-order: stroke fill; }
.tn-adm-mmain, .tn-adm-mform { display: grid; gap: ${T(10)}; }
.tn-adm-mmain[hidden], .tn-adm-mform[hidden] { display: none; }
.tn-adm-mlabel { margin: 0; }
.tn-adm-mgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: ${T(8)}; max-height: ${T(300)}; overflow-y: auto; padding: ${T(2)} ${T(2)} ${T(6)}; }
.tn-adm-mteam { justify-content: space-between; padding: ${T(9)} ${T(14)}; font-size: ${T(15)}; letter-spacing: .04em; min-width: 0; }
.tn-adm-mteam:first-child { grid-column: 1 / -1; }
.tn-adm-mteam small { font-size: ${T(12)}; font-weight: 800; letter-spacing: .04em; opacity: .85; }
.tn-adm-mteam[aria-pressed="true"] { background: var(--kong-surface-raised); color: var(--kong-text); box-shadow: inset 0 0 0 ${T(2)} var(--kong-accent), var(--kong-drop-pill); cursor: default; }
.tn-adm-mteam[disabled]:not([aria-pressed="true"]) { box-shadow: none; }
.tn-adm-mrow { display: flex; gap: ${T(10)}; justify-content: space-between; margin-top: ${T(4)}; }
.tn-adm-mrow .tn-btn { flex: 1; }
.tn-adm-kickbtn { color: var(--kong-danger); }
.tn-adm-rename { text-transform: uppercase; letter-spacing: .1em; }
.tn-adm-mform .tn-support { margin: 0; color: var(--kong-text-faint); }

/* ---------------- dialogs */
.tn-adm-scrim { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: ${T(24)};
  animation: tn-adm-fade var(--kong-motion-standard) var(--kong-ease-out) both; }
@keyframes tn-adm-fade { from { opacity: 0; } }
.tn-adm-dialog { width: min(${T(640)}, 100%); padding: ${T(32)} ${T(36)} ${T(28)}; display: grid; gap: ${T(16)}; }
.tn-adm-dialog.is-danger { box-shadow: var(--kong-drop-dialog), inset 0 ${T(8)} 0 var(--kong-danger); padding-top: ${T(40)}; }
.tn-adm-dialog.is-wide { width: min(${T(720)}, 100%); justify-items: center; text-align: center; }
.tn-adm-dtitle { margin: 0; font-size: ${T(44)}; line-height: ${T(48)}; overflow-wrap: anywhere; -webkit-text-stroke-width: var(--kong-text-outline-sm); }
.tn-adm-dtext { margin: 0; font-size: ${T(21)}; line-height: ${T(30)}; }
.tn-adm-dbody { display: grid; gap: ${T(16)}; justify-items: inherit; }
.tn-adm-dactions { display: flex; justify-content: flex-end; gap: ${T(14)}; margin-top: ${T(8)}; }
.tn-adm-dialog.is-wide .tn-adm-dactions { justify-content: center; }
.tn-adm-dactions .tn-btn { min-width: ${T(160)}; }
.tn-adm-qr { width: ${T(540)}; height: ${T(540)}; padding: ${T(22)}; border-radius: var(--kong-radius-card); background: var(--kong-text); color: var(--kong-outline);
  border: var(--kong-outline-md) solid var(--kong-outline); box-shadow: var(--kong-drop-card); }
.tn-adm-qr svg { width: 100%; height: 100%; display: block; }
.tn-adm-qrlink { margin: 0; font-weight: 900; font-size: ${T(26)}; color: var(--kong-text); overflow-wrap: anywhere; }

/* ---------------- toasts (bottom centre) */
.tn-adm-toasts { position: fixed; right: ${T(48)}; top: ${T(108)}; z-index: 70; display: flex; flex-direction: column;
  align-items: flex-end; gap: ${T(10)}; pointer-events: none; max-width: min(${T(900)}, 90vw); }
.tn-adm-toast { font-size: ${T(19)}; padding: ${T(12)} ${T(24)} ${T(12)} ${T(22)}; animation: tn-pop var(--kong-motion-standard) var(--kong-ease-spring) both;
  transition: opacity var(--kong-motion-slow), transform var(--kong-motion-slow); }
.tn-adm-toast .tn-adm-ico { width: ${T(22)}; height: ${T(22)}; color: var(--kong-accent); }
.tn-adm-toast.is-err { box-shadow: var(--kong-drop-pill), inset ${T(6)} 0 0 var(--kong-danger); }
.tn-adm-toast.is-err .tn-adm-ico { color: var(--kong-danger); }
.tn-adm-toast.is-out { opacity: 0; transform: translateY(${T(-8)}); }

@media (prefers-reduced-motion: reduce) {
  .tn-adm-menu, .tn-adm-toast, .tn-adm-scrim { animation: none; }
  .tn-adm-team.is-over { transform: none; }
}
`;
