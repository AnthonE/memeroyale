// The caster desk's styles (one <style>, every class prefixed kc-). Sizes in vh so the desk scales with the window the
// way the HUD does; 1080p is the design height. Colours from the game's UI tokens (ui/styles.ts) + the team palette.
import { UI } from "../ui/styles";

/** a design pixel at 1080p: scales with the window height, and with the width on narrower-than-16:9 windows (4:3, 5:4,
 *  a 1366×768 laptop stays 16:9) so the side panels never run into the card */
export const vh = (px: number) => `min(${(px / 10.8).toFixed(3)}vh, ${(px / 19.2).toFixed(3)}vw)`;

export const DESK_CSS = `
.kc { position: fixed; inset: 0; pointer-events: none; z-index: 12; font-family: ${UI.cond}; color: ${UI.creamText}; user-select: none; }
.kc * { box-sizing: border-box; }
.kc .p { pointer-events: auto; background: rgba(8,22,34,.82); border: 1px solid rgba(255,212,0,.22); border-radius: ${vh(10)}; box-shadow: 0 ${vh(8)} ${vh(28)} rgba(0,0,0,.35); backdrop-filter: blur(6px); }
.kc h4 { margin: 0; font-weight: 800; font-size: ${vh(15)}; letter-spacing: .16em; color: ${UI.yellow}; text-transform: uppercase; }
.kc .hide { display: none !important; }
.kc button { font-family: inherit; cursor: pointer; }

/* top bar */
.kc-top { position: absolute; top: ${vh(14)}; left: 50%; transform: translateX(-50%); display: flex; align-items: stretch; gap: ${vh(2)}; padding: 0; overflow: hidden; }
.kc-top > div { padding: ${vh(7)} ${vh(16)}; text-align: center; background: rgba(8,22,34,.6); }
.kc-top b { display: block; font-size: ${vh(28)}; line-height: 1; font-weight: 800; color: #fff; letter-spacing: .02em; }
.kc-top span { font-size: ${vh(12.5)}; letter-spacing: .18em; color: ${UI.creamDim}; font-weight: 700; }
.kc-top .phase b { color: ${UI.yellow}; font-size: ${vh(22)}; padding-top: ${vh(3)}; }
.kc-top .storm b { color: #c79bff; }
.kc-top .storm.closing b { color: #ff7ad9; animation: kcPulse 1s infinite; }
@keyframes kcPulse { 50% { opacity: .55; } }

/* seat + autopilot (top-left) */
.kc-seat { position: absolute; top: ${vh(14)}; left: ${vh(14)}; width: ${vh(370)}; padding: ${vh(10)} ${vh(12)}; }
.kc-seat .row { display: flex; align-items: center; gap: ${vh(8)}; }
.kc-seat .tag { font-size: ${vh(13)}; letter-spacing: .16em; font-weight: 800; color: ${UI.creamDim}; }
.kc-seat .code { color: ${UI.yellow}; }
.kc-auto { margin-left: auto; border: 2px solid ${UI.yellow}; background: transparent; color: ${UI.yellow}; font-weight: 800; font-size: ${vh(16)}; letter-spacing: .12em; border-radius: ${vh(6)}; padding: ${vh(3)} ${vh(10)}; }
.kc-auto.on { background: ${UI.yellow}; color: #1d1400; box-shadow: 0 0 ${vh(16)} rgba(255,212,0,.45); }
.kc-dir { margin-top: ${vh(6)}; font-size: ${vh(15.5)}; font-weight: 700; line-height: 1.25; color: #fff; min-height: ${vh(19)}; }
.kc-dir i { font-style: normal; color: ${UI.yellow}; }
.kc-seats { margin-top: ${vh(6)}; display: flex; flex-wrap: wrap; gap: ${vh(5)}; }
.kc-seats .s { font-size: ${vh(12.5)}; font-weight: 700; letter-spacing: .06em; padding: ${vh(2)} ${vh(7)}; border-radius: ${vh(4)}; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); cursor: pointer; }
.kc-seats .s.me { border-color: ${UI.yellow}; color: ${UI.yellow}; }
.kc-seats .s.on { background: ${UI.yellow}; color: #1d1400; }

/* roster (left) */
.kc-roster { position: absolute; top: ${vh(150)}; left: ${vh(14)}; bottom: ${vh(300)}; width: ${vh(370)}; display: flex; flex-direction: column; padding: ${vh(8)} 0 ${vh(8)} ${vh(8)}; }
.kc-roster h4 { padding: 0 ${vh(6)} ${vh(6)}; display: flex; justify-content: space-between; }
.kc-roster h4 small { color: ${UI.creamDim}; letter-spacing: .1em; font-size: ${vh(12)}; }
.kc-list { overflow-y: auto; padding-right: ${vh(6)}; flex: 1; scrollbar-width: thin; scrollbar-color: rgba(255,212,0,.3) transparent; }
.kc-team { margin-bottom: ${vh(6)}; border-left: ${vh(5)} solid var(--tc); background: linear-gradient(90deg, color-mix(in srgb, var(--tc) 16%, transparent), transparent 70%); border-radius: ${vh(5)}; padding: ${vh(3)} ${vh(6)} ${vh(4)}; cursor: pointer; }
.kc-team.out { opacity: .38; filter: grayscale(.7); }
.kc-team.fighting { box-shadow: inset 0 0 0 1px color-mix(in srgb, #ff4b4b 70%, transparent); }
.kc-team .th { display: flex; align-items: baseline; gap: ${vh(6)}; font-weight: 800; font-size: ${vh(15)}; letter-spacing: .08em; }
.kc-team .th .nm { color: var(--tc); }
.kc-team .th .k { margin-left: auto; font-size: ${vh(13)}; color: ${UI.creamDim}; }
.kc-team .th .fire { color: #ff6b4b; font-size: ${vh(12)}; letter-spacing: .12em; animation: kcPulse .8s infinite; }
.kc-team .th .vox { width: ${vh(16)}; height: ${vh(16)}; border-radius: 50%; border: 1px solid rgba(255,255,255,.3); display: inline-grid; place-items: center; font-size: ${vh(10)}; }
.kc-team .th .vox.on { background: #3fdc6c; border-color: #3fdc6c; color: #062; }
.kc-pl { display: grid; grid-template-columns: ${vh(18)} 1fr ${vh(92)} ${vh(30)}; align-items: center; gap: ${vh(6)}; padding: ${vh(2)} ${vh(2)}; border-radius: ${vh(4)}; font-size: ${vh(15)}; font-weight: 700; }
.kc-pl:hover { background: rgba(255,255,255,.08); }
.kc-pl.sel { background: rgba(255,212,0,.18); outline: 1px solid rgba(255,212,0,.6); }
.kc-pl.dead { opacity: .45; }
.kc-pl.dead .n { text-decoration: line-through; }
.kc-pl .st { font-size: ${vh(12)}; text-align: center; color: ${UI.creamDim}; }
.kc-pl .n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kc-pl .n em { font-style: normal; color: ${UI.creamDim}; font-size: ${vh(12)}; margin-left: ${vh(4)}; }
.kc-pl .kk { text-align: right; color: ${UI.yellow}; font-size: ${vh(14)}; }
.kc-bars { display: flex; flex-direction: column; gap: ${vh(2)}; }
.kc-bars i { display: block; height: ${vh(5)}; background: rgba(255,255,255,.12); border-radius: ${vh(2)}; overflow: hidden; }
.kc-bars i b { display: block; height: 100%; transition: width .25s; }
.kc-bars .h b { background: ${UI.hp}; } .kc-bars .s b { background: ${UI.shield}; }
.kc-pl.hurt .kc-bars .h b { background: #ff4b4b; }

/* feed + fights (right) */
.kc-right { position: absolute; top: ${vh(14)}; right: ${vh(14)}; width: ${vh(420)}; display: flex; flex-direction: column; gap: ${vh(10)}; bottom: ${vh(300)}; }
.kc-feed { padding: ${vh(8)} ${vh(10)}; flex: 0 0 auto; max-height: 48%; overflow: hidden; }
.kc-feed ul { list-style: none; margin: ${vh(4)} 0 0; padding: 0; }
.kc-feed li { font-size: ${vh(15.5)}; font-weight: 700; padding: ${vh(3)} 0; border-bottom: 1px solid rgba(255,255,255,.06); display: flex; gap: ${vh(6)}; align-items: baseline; animation: kcIn .35s ease-out; }
.kc-feed li time { color: ${UI.creamDim}; font-size: ${vh(12)}; min-width: ${vh(34)}; }
.kc-feed li .a, .kc-feed li .b { cursor: pointer; }
.kc-feed li .w { color: ${UI.creamDim}; font-size: ${vh(13)}; }
.kc-feed li.squad-out { color: #ff8f8f; } .kc-feed li.win { color: ${UI.yellow}; font-size: ${vh(18)}; }
.kc-feed li.storm { color: #d9b8ff; } .kc-feed li.phase, .kc-feed li.info { color: ${UI.creamDim}; }
@keyframes kcIn { from { opacity: 0; transform: translateX(${vh(20)}); } }
.kc-fights { padding: ${vh(8)} ${vh(10)}; flex: 1 1 auto; overflow-y: auto; }
.kc-fight { margin-top: ${vh(6)}; padding: ${vh(6)} ${vh(8)}; border-radius: ${vh(6)}; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); cursor: pointer; }
.kc-fight:hover { border-color: rgba(255,212,0,.5); }
.kc-fight.on { border-color: ${UI.yellow}; background: rgba(255,212,0,.12); }
.kc-fight .ft { display: flex; gap: ${vh(4)}; align-items: center; flex-wrap: wrap; font-weight: 800; font-size: ${vh(15)}; }
.kc-fight .chip { padding: 0 ${vh(6)}; border-radius: ${vh(3)}; background: var(--tc); color: #111; font-size: ${vh(13)}; letter-spacing: .05em; }
.kc-fight .vs { color: ${UI.creamDim}; font-size: ${vh(12)}; }
.kc-fight .meta { display: flex; justify-content: space-between; font-size: ${vh(12.5)}; color: ${UI.creamDim}; margin-top: ${vh(3)}; letter-spacing: .06em; }
.kc-fight .heat { height: ${vh(4)}; border-radius: ${vh(2)}; background: rgba(255,255,255,.1); margin-top: ${vh(4)}; overflow: hidden; }
.kc-fight .heat b { display: block; height: 100%; background: linear-gradient(90deg, #ffb020, #ff4b4b); transition: width .3s; }
.kc-empty { color: ${UI.creamDim}; font-size: ${vh(14)}; margin-top: ${vh(6)}; font-weight: 600; }

/* bottom: target card + camera bar */
.kc-bottom { position: absolute; left: 50%; bottom: ${vh(14)}; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: ${vh(8)}; }
.kc-card { display: grid; grid-template-columns: auto 1fr auto; gap: ${vh(16)}; align-items: center; padding: ${vh(10)} ${vh(16)}; min-width: ${vh(760)}; border-top: ${vh(4)} solid var(--tc, ${UI.yellow}); }
.kc-card .who b { display: block; font-size: ${vh(34)}; line-height: 1; font-weight: 800; letter-spacing: .02em; color: #fff; }
.kc-card .who span { font-size: ${vh(14)}; font-weight: 800; letter-spacing: .14em; color: var(--tc); }
.kc-card .who em { font-style: normal; margin-left: ${vh(8)}; color: ${UI.creamDim}; }
.kc-card .hs { display: flex; flex-direction: column; gap: ${vh(4)}; min-width: ${vh(220)}; }
.kc-card .hs .bar { position: relative; height: ${vh(14)}; border-radius: ${vh(3)}; background: rgba(255,255,255,.12); overflow: hidden; }
.kc-card .hs .bar b { display: block; height: 100%; transition: width .2s; }
.kc-card .hs .bar span { position: absolute; right: ${vh(5)}; top: 50%; transform: translateY(-50%); font-size: ${vh(12)}; font-weight: 800; color: #111; }
.kc-card .hs .hp b { background: ${UI.hp}; } .kc-card .hs .sh b { background: ${UI.shield}; } .kc-card .hs .sh span { color: #fff; }
.kc-card .stats { display: flex; gap: ${vh(14)}; margin-top: ${vh(4)}; }
.kc-card .stats div { text-align: center; } .kc-card .stats b { display: block; font-size: ${vh(22)}; line-height: 1; color: #fff; } .kc-card .stats span { font-size: ${vh(11)}; letter-spacing: .16em; color: ${UI.creamDim}; }
.kc-slots { display: flex; gap: ${vh(5)}; }
.kc-slot { width: ${vh(64)}; height: ${vh(56)}; border-radius: ${vh(6)}; background: rgba(255,255,255,.06); border: 2px solid rgba(255,255,255,.12); position: relative; display: grid; place-items: center; }
.kc-slot.act { border-color: ${UI.yellow}; box-shadow: 0 0 ${vh(10)} rgba(255,212,0,.35); }
.kc-slot img { max-width: 88%; max-height: 70%; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
.kc-slot i { position: absolute; left: 0; right: 0; bottom: 0; height: ${vh(4)}; border-radius: 0 0 ${vh(4)} ${vh(4)}; background: var(--rc, transparent); }
.kc-slot small { position: absolute; right: ${vh(3)}; top: ${vh(1)}; font-size: ${vh(12)}; font-weight: 800; color: #fff; text-shadow: 0 1px 2px #000; }
.kc-cams { display: flex; gap: ${vh(5)}; padding: ${vh(5)}; }
.kc-cams button { background: rgba(255,255,255,.06); color: ${UI.creamText}; border: 1px solid rgba(255,255,255,.14); border-radius: ${vh(6)}; padding: ${vh(5)} ${vh(12)}; font-weight: 800; font-size: ${vh(15)}; letter-spacing: .1em; }
.kc-cams button kbd { font-family: inherit; color: ${UI.creamDim}; font-size: ${vh(11)}; margin-right: ${vh(5)}; }
.kc-cams button.on { background: ${UI.yellow}; color: #1d1400; border-color: ${UI.yellow}; }
.kc-cams button.on kbd { color: #5a4600; }
.kc-cams .sep { width: 1px; background: rgba(255,255,255,.15); margin: 0 ${vh(3)}; }

/* minimap (bottom-left) */
.kc-mini { position: absolute; left: ${vh(14)}; bottom: ${vh(14)}; width: ${vh(270)}; height: ${vh(270)}; padding: ${vh(4)}; }
.kc-mini canvas { width: 100%; height: 100%; display: block; border-radius: ${vh(7)}; cursor: crosshair; }
.kc-mini .lbl { position: absolute; left: ${vh(10)}; top: ${vh(8)}; font-size: ${vh(12)}; letter-spacing: .16em; font-weight: 800; color: ${UI.creamDim}; text-shadow: 0 1px 2px #000; pointer-events: none; }

/* tactical (full map) */
.kc-tac { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(4,10,16,.72); pointer-events: auto; }
.kc-tac canvas { height: 92vh; width: 92vh; border-radius: ${vh(12)}; box-shadow: 0 0 0 2px rgba(255,212,0,.4), 0 ${vh(20)} ${vh(60)} rgba(0,0,0,.6); cursor: crosshair; }

/* toast + help */
.kc-toast { position: absolute; top: ${vh(92)}; left: 50%; transform: translateX(-50%); padding: ${vh(6)} ${vh(18)}; border-radius: ${vh(6)}; background: rgba(8,22,34,.9); border: 1px solid ${UI.yellow}; font-size: ${vh(18)}; font-weight: 800; letter-spacing: .08em; opacity: 0; transition: opacity .25s; }
.kc-toast.on { opacity: 1; }
.kc-help { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(4,10,16,.6); pointer-events: auto; }
.kc-help .p { padding: ${vh(22)} ${vh(30)}; max-width: ${vh(1100)}; columns: 2; column-gap: ${vh(40)}; }
.kc-help h3 { column-span: all; margin: 0 0 ${vh(10)}; font-size: ${vh(30)}; color: ${UI.yellow}; letter-spacing: .08em; }
.kc-help div { break-inside: avoid; display: flex; gap: ${vh(10)}; font-size: ${vh(16)}; font-weight: 700; padding: ${vh(3)} 0; }
.kc-help kbd { font-family: inherit; min-width: ${vh(110)}; color: ${UI.yellow}; }

/* clean feed: only the broadcast layer (broadcast.ts) and elements marked .bc stay; no toasts on the stream */
.kc.clean .p:not(.bc), .kc.clean .kc-desk-only, .kc.clean .kc-toast { display: none !important; }
`;
