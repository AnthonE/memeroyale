// Event lobby styles (the player side of admin lobbies, ui/event-lobby.ts). The screen reuses the Toon lobby's own
// parts (`tn-play-*` from lobby-styles.ts: shade, brand, eyebrow, mode line, input, the yellow CTA, links, chips, footer)
// and adds its own `tn-ev-*` pieces. Every size is a design px on the 1920×1080 canvas through T(); colours, outlines,
// drops, radii and motion are Toon tokens only (ui/toon.ts).
import { addCss } from "./styles";
import { T } from "./toon";

export function injectEventLobbyStyles(): void { addCss("kr-ui-event-lobby", CSS); }

/** a colour token at an opacity (no raw hex in screen code) */
const a = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;

const CSS = `
.tn-ev [hidden] { display: none !important; }
/* the room needs the whole width: a calmer, even fade over the scene */
.tn-ev[data-view="room"] .tn-ev-shade {
  background: linear-gradient(90deg, ${a("--kong-bg", 95)} 0%, ${a("--kong-bg", 90)} 32%, ${a("--kong-bg", 74)} 58%, ${a("--kong-bg", 66)} 100%),
              linear-gradient(180deg, ${a("--kong-bg", 50)}, transparent 18%, transparent 80%, ${a("--kong-bg", 60)}); }

/* ---------------- top right: Playing as + Settings */
.tn-ev-id { gap: ${T(24)}; }
.tn-ev-settings { font-size: ${T(18)}; line-height: ${T(27)}; padding: ${T(10)} ${T(22)}; }

/* ---------------- left column */
.tn-ev-main { position: absolute; left: ${T(84)}; top: ${T(228)}; width: ${T(780)}; z-index: 2; }
.tn-ev[data-view="room"] .tn-ev-main { top: ${T(220)}; width: ${T(560)}; }
.tn-ev-name { margin: 0; text-transform: uppercase; overflow-wrap: anywhere; max-width: 100%; }
.tn-ev-name.is-md { font-size: var(--kong-fs-title); line-height: var(--kong-lh-title); -webkit-text-stroke-width: var(--kong-text-outline-md); }
.tn-ev-name.is-lg { font-size: ${T(68)}; line-height: ${T(74)}; -webkit-text-stroke-width: var(--kong-text-outline-md); }
.tn-ev[data-view="room"] .tn-ev-name { font-size: ${T(72)}; line-height: ${T(78)}; -webkit-text-stroke-width: var(--kong-text-outline-md); text-shadow: 0 ${T(6)} 0 var(--kong-outline); }
.tn-ev[data-view="room"] .tn-ev-name.is-md, .tn-ev[data-view="room"] .tn-ev-name.is-lg { font-size: ${T(52)}; line-height: ${T(58)}; }

.tn-ev-loading { display: flex; align-items: center; gap: ${T(18)}; margin-top: ${T(8)};
  font-weight: 800; font-size: ${T(26)}; line-height: ${T(34)}; color: var(--kong-text-muted); }
.tn-ev-loading .tn-play-spin { display: block; width: ${T(32)}; height: ${T(32)}; color: var(--kong-accent); }

/* JOIN */
.tn-ev-meta { margin-top: ${T(24)}; }
.tn-ev-meta b { font-weight: 800; color: var(--kong-text); }
.tn-ev-notes { display: grid; gap: ${T(10)}; margin-top: ${T(20)}; }
.tn-ev-note { display: flex; align-items: center; gap: ${T(12)}; margin-top: ${T(14)};
  font-weight: 800; font-size: ${T(18)}; line-height: ${T(26)}; color: var(--kong-text-muted); }
.tn-ev-notes .tn-ev-note { margin-top: 0; }
.tn-ev-note .tn-play-ico { width: ${T(22)}; height: ${T(22)}; color: var(--kong-text); }
.tn-ev-dot { flex: none; width: ${T(12)}; height: ${T(12)}; border-radius: 50%; background: var(--kong-warning); box-shadow: 0 0 0 ${T(3)} var(--kong-outline); }
.tn-ev-label { display: block; margin: ${T(44)} 0 ${T(12)}; font-size: ${T(16)}; line-height: ${T(24)}; }
.tn-ev-input { width: ${T(512)}; height: ${T(68)}; font-size: ${T(30)}; padding: 0 ${T(20)}; }
.tn-ev-help { width: ${T(512)}; margin-top: ${T(12)}; font-size: ${T(17)}; line-height: ${T(24)}; }
.tn-ev-help.is-error { display: flex; gap: ${T(10)}; align-items: flex-start; color: var(--kong-danger); font-weight: 800; }
.tn-ev-help.is-error .tn-play-ico { flex: none; width: ${T(22)}; height: ${T(22)}; }
.tn-ev-err { font-size: ${T(19)}; line-height: ${T(26)}; }
.tn-ev .tn-ev-cta { margin-top: ${T(28)}; }

/* NOT FOUND + ENDED copy */
.tn-ev-body { margin: ${T(24)} 0 0; max-width: ${T(620)}; font-weight: 700; font-size: ${T(22)}; line-height: ${T(32)}; color: var(--kong-text-muted); }
.tn-ev-code { margin: ${T(12)} 0 0; font-weight: 800; font-size: ${T(15)}; line-height: ${T(22)}; letter-spacing: .2em; text-transform: uppercase; color: var(--kong-text-faint); }
.tn-ev-nf .tn-ev-cta { margin-top: ${T(40)}; }

/* ---------------- ROOM, left: chips, status, notes, the players with no team */
.tn-ev-chips { display: flex; flex-wrap: wrap; gap: ${T(12)}; margin-top: ${T(26)}; }
.tn-ev-chip { padding: ${T(8)} ${T(20)}; font-size: ${T(19)}; line-height: ${T(26)}; letter-spacing: .06em; text-transform: uppercase; }
.tn-ev-chip b { font-weight: 900; color: var(--kong-accent); }
.tn-ev-status { display: flex; align-items: center; gap: ${T(14)}; margin-top: ${T(26)};
  font-weight: 800; font-size: ${T(21)}; line-height: ${T(28)}; color: var(--kong-text); }
.tn-ev-status::before { content: ""; flex: none; width: ${T(14)}; height: ${T(14)}; border-radius: 50%; background: var(--kong-success);
  box-shadow: 0 0 0 ${T(3)} var(--kong-outline); animation: tn-ev-pulse 1.6s var(--kong-ease-out) infinite; }
.tn-ev-status.is-running::before { background: var(--kong-warning); }
.tn-ev-status.is-reconnecting::before { background: var(--kong-danger); }
@keyframes tn-ev-pulse { 50% { transform: scale(.7); } }
html.kr-calm .tn-ev-status::before { animation: none; }
@media (prefers-reduced-motion: reduce) { .tn-ev-status::before { animation: none; } }

.tn-ev-loose { margin-top: ${T(30)}; padding: ${T(18)} ${T(20)} ${T(20)}; box-sizing: border-box; width: 100%;
  background: var(--kong-surface); border: var(--kong-outline-sm) solid var(--kong-outline); border-radius: var(--kong-radius-tile); box-shadow: var(--kong-drop-tile); }
.tn-ev-loose-head { display: flex; align-items: baseline; justify-content: space-between; gap: ${T(12)}; }
.tn-ev-loose-head b { font-family: var(--kong-font-display); font-weight: 400; font-size: ${T(28)}; line-height: ${T(32)}; letter-spacing: .01em; text-transform: uppercase;
  -webkit-text-stroke: var(--kong-text-outline-xs) var(--kong-outline); paint-order: stroke fill; }
.tn-ev-loose-head .n { font-weight: 900; font-size: ${T(18)}; color: var(--kong-text-muted); }
.tn-ev-loose-list { display: flex; flex-wrap: wrap; gap: ${T(10)}; margin-top: ${T(14)}; max-height: ${T(176)}; overflow-y: auto; scrollbar-width: none; padding-bottom: ${T(4)}; }
.tn-ev-loose-help { margin: ${T(14)} 0 0; font-weight: 700; font-size: ${T(17)}; line-height: ${T(24)}; color: var(--kong-text-muted); }
.tn-ev-leave { position: absolute; left: ${T(84)}; bottom: ${T(124)}; z-index: 2; }

/* player chips (no team yet, SOLO): the lobby's chip, stream-sized */
.tn-ev .tn-ev-pchip { height: ${T(48)}; padding: 0 ${T(18)}; gap: ${T(10)}; font-size: ${T(19)}; letter-spacing: .04em; }
.tn-ev .tn-ev-pchip.is-bot { font-size: ${T(17)}; letter-spacing: .08em; background: ${a("--kong-bg", 45)}; }
.tn-ev-you { flex: none; margin-left: auto; font-size: ${T(12)}; }

/* ---------------- ROOM, right: the board (team cards / player grid) */
.tn-ev-board { position: absolute; left: ${T(700)}; right: ${T(64)}; top: ${T(150)}; bottom: ${T(120)}; z-index: 2; display: flex; flex-direction: column; min-height: 0; }
.tn-ev-board-head { display: flex; align-items: baseline; justify-content: space-between; gap: ${T(20)}; margin-bottom: ${T(18)}; padding: 0 ${T(4)}; }
.tn-ev-board-title { font-size: ${T(18)}; line-height: ${T(26)}; color: var(--kong-text); }
.tn-ev-board-hint { font-weight: 700; font-size: ${T(18)}; line-height: ${T(26)}; color: var(--kong-text-muted); }
.tn-ev-teams, .tn-ev-solo { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-content: start;
  padding: ${T(6)} ${T(6)} ${T(16)}; scrollbar-width: thin; scrollbar-color: var(--kong-rule-strong) transparent; }
.tn-ev-teams { gap: ${T(22)} ${T(20)}; }
.tn-ev-solo { gap: ${T(12)} ${T(14)}; }

.tn-ev-team { display: grid; gap: ${T(12)}; padding: ${T(16)} ${T(18)} ${T(18)}; min-width: 0;
  background: var(--kong-surface); border: var(--kong-outline-sm) solid var(--kong-outline); border-radius: var(--kong-radius-tile); box-shadow: var(--kong-drop-tile);
  transition: border-color var(--kong-motion-fast), background var(--kong-motion-fast); }
.tn-ev-team.is-mine { background: var(--kong-surface-raised); border-color: var(--kong-accent); box-shadow: var(--kong-drop-tile), 0 0 0 var(--kong-outline-sm) var(--kong-outline); }
.tn-ev-team-head { display: flex; align-items: baseline; justify-content: space-between; gap: ${T(10)}; }
.tn-ev-team-head b { font-family: var(--kong-font-display); font-weight: 400; font-size: ${T(30)}; line-height: ${T(34)}; letter-spacing: .01em; text-transform: uppercase;
  -webkit-text-stroke: var(--kong-text-outline-xs) var(--kong-outline); paint-order: stroke fill; }
.tn-ev-team-head .n { font-weight: 900; font-size: ${T(16)}; letter-spacing: .08em; color: var(--kong-text-muted); }
.tn-ev-team.is-full .tn-ev-team-head .n { color: var(--kong-text); }
.tn-ev-slots { list-style: none; margin: 0; padding: 0; display: grid; gap: ${T(8)}; }
.tn-ev-slot { display: flex; align-items: center; gap: ${T(8)}; height: ${T(48)}; padding: 0 ${T(10)} 0 ${T(16)}; box-sizing: border-box; min-width: 0;
  background: var(--kong-bg); border: var(--kong-outline-sm) solid var(--kong-outline); border-radius: 999px; box-shadow: 0 ${T(3)} 0 var(--kong-outline);
  font-weight: 900; font-size: ${T(19)}; letter-spacing: .04em; text-transform: uppercase; color: var(--kong-text); }
.tn-ev-slot .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tn-ev-slot.is-me { background: var(--kong-text); color: var(--kong-outline); }
.tn-ev-slot.is-open { background: ${a("--kong-bg", 45)}; border-style: dashed; border-color: var(--kong-rule-strong); box-shadow: none;
  font-weight: 800; font-size: ${T(16)}; letter-spacing: .12em; color: var(--kong-text-faint); }
.tn-ev .tn-ev-teambtn { width: 100%; min-height: ${T(50)}; font-size: ${T(17)}; }
.tn-ev .tn-ev-teambtn.is-leave { background: none; border-color: transparent; box-shadow: none; color: var(--kong-text-muted); }
.tn-ev .tn-ev-teambtn.is-leave:hover { transform: none; color: var(--kong-text); }
.tn-ev .tn-ev-teambtn.is-leave[disabled] { background: none; box-shadow: none; color: var(--kong-accent); }

/* ---------------- ENDED: a calm card */
.tn-ev-end { width: ${T(680)}; box-sizing: border-box; padding: ${T(40)} ${T(44)} ${T(44)}; display: grid; justify-items: start;
  animation: tn-pop var(--kong-motion-slow) var(--kong-ease-spring) both; }
html.kr-calm .tn-ev-end { animation: none; }
.tn-ev-end-ico { display: grid; place-items: center; width: ${T(72)}; height: ${T(72)}; border-radius: var(--kong-radius-tile);
  background: var(--kong-surface-2); border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: var(--kong-drop-pill); color: var(--kong-text); }
.tn-ev-end[data-why="kicked"] .tn-ev-end-ico { color: var(--kong-danger); }
.tn-ev-end-ico .tn-play-ico { width: ${T(38)}; height: ${T(38)}; }
.tn-ev-end-title { margin: ${T(26)} 0 0; font-size: ${T(46)}; line-height: ${T(52)}; -webkit-text-stroke-width: var(--kong-text-outline-sm); text-transform: uppercase; }
.tn-ev-end .tn-ev-body { margin-top: ${T(16)}; }
.tn-ev-end-back { margin-top: ${T(32)}; min-width: ${T(160)}; }

/* ---------------- the room's toast (a refusal: TEAM 3 IS FULL …) */
.tn-ev-toast { position: absolute; right: ${T(64)}; bottom: ${T(48)}; z-index: 5; opacity: 0; pointer-events: none; transform: translateY(${T(8)});
  font-size: ${T(19)}; padding: ${T(12)} ${T(24)} ${T(12)} ${T(20)};
  transition: opacity var(--kong-motion-standard), transform var(--kong-motion-standard) var(--kong-ease-spring); }
.tn-ev-toast.on { opacity: 1; transform: none; }
`;
