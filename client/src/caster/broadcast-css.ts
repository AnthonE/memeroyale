// Styles of the broadcast layer (broadcast.ts) and the desk's extra panels (panels.ts): leaderboard, player popover,
// ping card, results. One <style>, classes kb- (broadcast) / kp- (panels). The broadcast is built for a 1080p stream:
// chunky condensed type, team-colour slabs, every element animated in and out.
import { UI } from "../ui/styles";
import { vh } from "./styles";

export const BROADCAST_CSS = `
/* the broadcast layer only shows on the clean feed (H) and the PROGRAM output */
.kc:not(.clean) .kb { display: none; }
.kb { position: absolute; inset: 0; pointer-events: none; font-family: ${UI.cond}; color: #fff; }
.kb * { box-sizing: border-box; }
.kb .slab { background: linear-gradient(180deg, rgba(10,22,34,.94), rgba(6,14,22,.94)); box-shadow: 0 ${vh(6)} ${vh(22)} rgba(0,0,0,.45); }

/* bug: logo + LIVE + clock */
.kb-bug { position: absolute; top: ${vh(26)}; left: ${vh(30)}; display: flex; align-items: stretch; border-radius: ${vh(6)}; overflow: hidden; }
.kb-bug .logo { background: ${UI.yellow}; color: #1d1400; font: 800 ${vh(26)} ${UI.cond}; letter-spacing: .04em; padding: ${vh(4)} ${vh(12)}; line-height: 1.05; display: flex; align-items: center; }
.kb-bug .live { display: flex; align-items: center; gap: ${vh(6)}; padding: 0 ${vh(10)}; font-weight: 800; font-size: ${vh(18)}; letter-spacing: .14em; }
.kb-bug .live i { width: ${vh(10)}; height: ${vh(10)}; border-radius: 50%; background: #ff3b30; box-shadow: 0 0 ${vh(10)} #ff3b30; animation: kbBlink 1.4s infinite; }
.kb-bug .clock { padding: 0 ${vh(12)}; display: flex; align-items: center; font: 800 ${vh(24)} ${UI.cond}; border-left: 1px solid rgba(255,255,255,.12); font-variant-numeric: tabular-nums; }
.kb-bug .replay { display: none; background: #ff3b30; padding: 0 ${vh(12)}; align-items: center; font-weight: 800; font-size: ${vh(20)}; letter-spacing: .16em; }
@keyframes kbBlink { 50% { opacity: .35; } }

/* counters (top centre) */
.kb-count { position: absolute; top: ${vh(22)}; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: ${vh(6)}; }
.kb-count .row { display: flex; border-radius: ${vh(8)}; overflow: hidden; }
.kb-count .cell { padding: ${vh(4)} ${vh(18)}; text-align: center; min-width: ${vh(108)}; }
.kb-count .cell + .cell { border-left: 1px solid rgba(255,255,255,.12); }
.kb-count .cell b { display: block; font: 800 ${vh(40)} / 1 ${UI.cond}; font-variant-numeric: tabular-nums; }
.kb-count .cell span { font-size: ${vh(13)}; font-weight: 800; letter-spacing: .24em; color: rgba(255,255,255,.62); }
.kb-count .cell.storm b { color: #d8b6ff; } .kb-count .cell.storm.closing b { color: #ff7ad9; animation: kbBlink .9s infinite; }
.kb-pips { display: flex; gap: ${vh(4)}; padding: ${vh(5)} ${vh(8)}; border-radius: ${vh(20)}; }
.kb-pips i { width: ${vh(13)}; height: ${vh(13)}; border-radius: ${vh(3)}; background: var(--tc); box-shadow: 0 0 ${vh(6)} color-mix(in srgb, var(--tc) 60%, transparent); transition: opacity .4s, transform .4s; }
.kb-pips i.out { opacity: .18; transform: scale(.7); box-shadow: none; }

/* fight banner */
.kb-fight { position: absolute; top: ${vh(150)}; left: 50%; transform: translate(-50%, -${vh(30)}); opacity: 0; transition: opacity .35s, transform .35s; display: flex; flex-direction: column; align-items: center; gap: ${vh(4)}; }
.kb-fight.on { opacity: 1; transform: translate(-50%, 0); }
.kb-fight .vs { display: flex; align-items: center; gap: ${vh(10)}; padding: ${vh(5)} ${vh(16)}; border-radius: ${vh(8)}; }
.kb-fight .t { font: 800 ${vh(30)} ${UI.cond}; letter-spacing: .04em; color: var(--tc); text-shadow: 0 0 ${vh(14)} color-mix(in srgb, var(--tc) 45%, transparent); }
.kb-fight .t small { font-size: ${vh(17)}; color: rgba(255,255,255,.7); margin-left: ${vh(5)}; }
.kb-fight .x { font: 800 ${vh(18)} ${UI.cond}; color: rgba(255,255,255,.55); letter-spacing: .1em; }
.kb-fight .where { font-weight: 800; font-size: ${vh(16)}; letter-spacing: .3em; color: ${UI.yellow}; background: rgba(6,14,22,.85); padding: ${vh(2)} ${vh(12)}; border-radius: ${vh(4)}; }

/* kill feed (top right) */
.kb-feed { position: absolute; top: ${vh(26)}; right: ${vh(30)}; display: flex; flex-direction: column; align-items: flex-end; gap: ${vh(5)}; }
.kb-k { display: flex; align-items: center; gap: ${vh(8)}; padding: ${vh(4)} ${vh(12)} ${vh(4)} 0; border-radius: ${vh(5)}; font-weight: 800; font-size: ${vh(21)}; letter-spacing: .02em; animation: kbIn .32s cubic-bezier(.2,.9,.3,1.2); transition: opacity .5s; overflow: hidden; }
.kb-k.old { opacity: 0; }
.kb-k .a { color: var(--ka); border-left: ${vh(5)} solid var(--ka); padding-left: ${vh(9)}; }
.kb-k .b { color: var(--kb); } .kb-k.final .b { text-decoration: line-through; text-decoration-thickness: ${vh(2)}; }
.kb-k img { height: ${vh(22)}; filter: drop-shadow(0 1px 1px #000); }
.kb-k .w { font-size: ${vh(14)}; color: rgba(255,255,255,.6); letter-spacing: .12em; }
.kb-k.out { background: linear-gradient(90deg, rgba(160,20,20,.9), rgba(90,10,10,.92)); padding-left: ${vh(12)}; letter-spacing: .1em; }
@keyframes kbIn { from { transform: translateX(${vh(60)}); opacity: 0; } }

/* lower third (bottom left) */
.kb-l3 { position: absolute; left: ${vh(30)}; bottom: ${vh(34)}; display: flex; align-items: stretch; transform: translateX(-${vh(40)}); opacity: 0; transition: opacity .3s, transform .35s cubic-bezier(.2,.9,.3,1.1); }
.kb-l3.on { opacity: 1; transform: none; }
.kb-l3 .team { background: var(--tc); color: #111; writing-mode: vertical-rl; transform: rotate(180deg); font: 800 ${vh(15)} ${UI.cond}; letter-spacing: .22em; padding: ${vh(8)} ${vh(4)}; border-radius: ${vh(6)} 0 0 ${vh(6)}; text-align: center; }
.kb-l3 .body { padding: ${vh(8)} ${vh(18)} ${vh(10)}; border-radius: 0 ${vh(8)} ${vh(8)} 0; min-width: ${vh(460)}; border-top: ${vh(3)} solid var(--tc); }
.kb-l3 .nm { display: flex; align-items: baseline; gap: ${vh(12)}; }
.kb-l3 .nm b { font: 800 ${vh(46)} / 1 ${UI.cond}; letter-spacing: .01em; }
.kb-l3 .nm span { font-size: ${vh(15)}; font-weight: 800; letter-spacing: .18em; color: rgba(255,255,255,.62); }
.kb-l3 .nm .tag { color: ${UI.yellow}; }
.kb-l3 .line { display: flex; align-items: center; gap: ${vh(16)}; margin-top: ${vh(6)}; }
.kb-l3 .bars { flex: 1; display: flex; flex-direction: column; gap: ${vh(4)}; min-width: ${vh(220)}; }
.kb-l3 .bars i { position: relative; height: ${vh(11)}; border-radius: ${vh(2)}; background: rgba(255,255,255,.14); overflow: hidden; display: block; }
.kb-l3 .bars i b { display: block; height: 100%; transition: width .25s; }
.kb-l3 .bars .h b { background: ${UI.hp}; } .kb-l3 .bars .s b { background: ${UI.shield}; }
.kb-l3 .st { text-align: center; } .kb-l3 .st b { display: block; font: 800 ${vh(30)} / 1 ${UI.cond}; } .kb-l3 .st span { font-size: ${vh(11)}; letter-spacing: .2em; font-weight: 800; color: rgba(255,255,255,.6); }
.kb-l3 .gun { display: flex; align-items: center; gap: ${vh(6)}; font-weight: 800; font-size: ${vh(15)}; letter-spacing: .1em; color: rgba(255,255,255,.75); }
.kb-l3 .gun img { height: ${vh(30)}; filter: drop-shadow(0 1px 2px #000); }
.kb-l3.hurt .bars .h b { background: #ff4b4b; }

/* fight scoreboard (bottom centre, drone on a fight) */
.kb-fs { position: absolute; left: 50%; bottom: ${vh(30)}; transform: translate(-50%, ${vh(30)}); opacity: 0; transition: opacity .3s, transform .35s; display: flex; gap: ${vh(10)}; }
.kb-fs.on { opacity: 1; transform: translate(-50%, 0); }
.kb-fs .col { min-width: ${vh(250)}; border-radius: ${vh(8)}; padding: ${vh(6)} ${vh(12)} ${vh(8)}; border-top: ${vh(4)} solid var(--tc); }
.kb-fs .col h6 { margin: 0 0 ${vh(4)}; font: 800 ${vh(22)} ${UI.cond}; color: var(--tc); letter-spacing: .06em; display: flex; justify-content: space-between; }
.kb-fs .col h6 span { color: rgba(255,255,255,.7); font-size: ${vh(15)}; }
.kb-fs .m { display: grid; grid-template-columns: 1fr ${vh(110)}; gap: ${vh(8)}; align-items: center; font-weight: 800; font-size: ${vh(17)}; padding: ${vh(1)} 0; }
.kb-fs .m.dead { opacity: .35; text-decoration: line-through; }
.kb-fs .m i { display: block; height: ${vh(5)}; border-radius: ${vh(2)}; background: rgba(255,255,255,.14); overflow: hidden; margin: ${vh(1)} 0; }
.kb-fs .m i b { display: block; height: 100%; transition: width .25s; } .kb-fs .m .h b { background: ${UI.hp}; } .kb-fs .m .s b { background: ${UI.shield}; }

/* top fraggers (bottom right) */
.kb-board { position: absolute; right: ${vh(30)}; bottom: ${vh(34)}; border-radius: ${vh(8)}; padding: ${vh(6)} ${vh(14)} ${vh(8)}; min-width: ${vh(250)}; }
.kb-board h6 { margin: 0 0 ${vh(3)}; font: 800 ${vh(14)} ${UI.cond}; letter-spacing: .26em; color: ${UI.yellow}; }
.kb-board .r { display: grid; grid-template-columns: ${vh(22)} 1fr auto; gap: ${vh(8)}; align-items: center; font-weight: 800; font-size: ${vh(19)}; padding: ${vh(1)} 0; }
.kb-board .r em { font-style: normal; color: rgba(255,255,255,.55); font-size: ${vh(15)}; }
.kb-board .r .n { border-left: ${vh(4)} solid var(--tc); padding-left: ${vh(7)}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kb-board .r .n.dead { opacity: .45; }
.kb-board .r b { font-variant-numeric: tabular-nums; }

/* centre flash (squad out, winner) */
.kb-flash { position: absolute; top: 34%; left: 50%; transform: translate(-50%, -50%) scale(.9); opacity: 0; transition: opacity .3s, transform .3s; text-align: center; }
.kb-flash.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.kb-flash b { display: block; font: 800 ${vh(64)} / 1 ${UI.cond}; letter-spacing: .04em; color: var(--tc, #fff); text-shadow: 0 ${vh(4)} ${vh(30)} rgba(0,0,0,.8), 0 0 ${vh(30)} color-mix(in srgb, var(--tc, #fff) 40%, transparent); }
.kb-flash span { display: inline-block; margin-top: ${vh(8)}; font-weight: 800; font-size: ${vh(22)}; letter-spacing: .3em; background: rgba(6,14,22,.88); padding: ${vh(4)} ${vh(16)}; border-radius: ${vh(4)}; }

/* results card (desk AND broadcast) */
.kb-results { position: absolute; inset: 0; display: none; place-items: center; background: radial-gradient(ellipse at center, rgba(6,12,20,.55), rgba(6,12,20,.86)); pointer-events: auto; font-family: ${UI.cond}; color: #fff; z-index: 3; }
.kb-results.on { display: grid; animation: kbFade .5s; }
@keyframes kbFade { from { opacity: 0; } }
.kb-results .card { width: min(${vh(1180)}, 94vw); border-radius: ${vh(14)}; border: 2px solid ${UI.yellow}; padding: ${vh(22)} ${vh(30)}; background: rgba(8,20,32,.94); }
.kb-results .head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,.12); padding-bottom: ${vh(10)}; }
.kb-results .head span { font-weight: 800; font-size: ${vh(16)}; letter-spacing: .3em; color: ${UI.yellow}; }
.kb-results .win b { display: block; font: 800 ${vh(70)} / 1 ${UI.cond}; color: var(--tc); text-shadow: 0 0 ${vh(30)} color-mix(in srgb, var(--tc) 40%, transparent); }
.kb-results .win em { font-style: normal; font-size: ${vh(22)}; font-weight: 800; color: rgba(255,255,255,.8); letter-spacing: .06em; }
.kb-results .cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: ${vh(30)}; margin-top: ${vh(14)}; }
.kb-results h6 { margin: 0 0 ${vh(6)}; font-size: ${vh(14)}; letter-spacing: .28em; color: rgba(255,255,255,.6); }
.kb-results .pl { display: grid; grid-template-columns: ${vh(44)} 1fr auto; gap: ${vh(10)}; align-items: center; padding: ${vh(3)} 0; border-bottom: 1px solid rgba(255,255,255,.06); font-weight: 800; font-size: ${vh(19)}; }
.kb-results .pl .pn { color: ${UI.yellow}; font-size: ${vh(22)}; }
.kb-results .pl .t { color: var(--tc); } .kb-results .pl .t small { color: rgba(255,255,255,.65); font-size: ${vh(15)}; margin-left: ${vh(6)}; }
.kb-results .pl em { font-style: normal; color: rgba(255,255,255,.7); font-size: ${vh(16)}; }

/* ---- desk panels (panels.ts) */
.kc-feed li img.wi { height: ${vh(17)}; vertical-align: -${vh(3)}; filter: drop-shadow(0 1px 1px #000); }
.kp-tabs { display: flex; gap: ${vh(4)}; margin-bottom: ${vh(4)}; }
.kp-tabs button { background: transparent; border: 0; color: ${UI.creamDim}; font: 800 ${vh(15)} ${UI.cond}; letter-spacing: .16em; padding: 0 ${vh(4)} ${vh(2)}; border-bottom: 2px solid transparent; }
.kp-tabs button.on { color: ${UI.yellow}; border-bottom-color: ${UI.yellow}; }
.kp-lb { width: 100%; border-collapse: collapse; font-weight: 700; font-size: ${vh(15)}; }
.kp-lb th { text-align: left; font-size: ${vh(11.5)}; letter-spacing: .16em; color: ${UI.creamDim}; font-weight: 800; padding: ${vh(2)} ${vh(4)}; }
.kp-lb td { padding: ${vh(2)} ${vh(4)}; border-bottom: 1px solid rgba(255,255,255,.05); white-space: nowrap; }
.kp-lb tr { cursor: pointer; } .kp-lb tr:hover td { background: rgba(255,255,255,.06); }
.kp-lb td.n { border-left: ${vh(4)} solid var(--tc); max-width: ${vh(150)}; overflow: hidden; text-overflow: ellipsis; }
.kp-lb tr.dead td { opacity: .45; } .kp-lb tr.sel td { background: rgba(255,212,0,.15); }
.kp-lb td.num { text-align: right; font-variant-numeric: tabular-nums; }
.kp-pop { position: absolute; z-index: 5; width: ${vh(330)}; padding: ${vh(10)} ${vh(12)}; pointer-events: none; border-left: ${vh(4)} solid var(--tc); }
.kp-pop b.nm { font-size: ${vh(24)}; font-weight: 800; display: block; line-height: 1; }
.kp-pop .sub { font-size: ${vh(12.5)}; letter-spacing: .16em; font-weight: 800; color: var(--tc); }
.kp-pop .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: ${vh(4)}; margin: ${vh(8)} 0; text-align: center; }
.kp-pop .grid b { display: block; font-size: ${vh(20)}; line-height: 1; } .kp-pop .grid span { font-size: ${vh(10.5)}; letter-spacing: .14em; color: ${UI.creamDim}; }
.kp-pop .slots { display: flex; gap: ${vh(4)}; }
.kp-pop .slots .kc-slot { width: ${vh(56)}; height: ${vh(48)}; }
.kp-pop .ammo { margin-top: ${vh(6)}; font-size: ${vh(12.5)}; color: ${UI.creamDim}; letter-spacing: .06em; font-weight: 700; }
.kp-ping { position: absolute; top: ${vh(130)}; left: 50%; transform: translate(-50%, -${vh(20)}); opacity: 0; transition: opacity .25s, transform .25s; padding: ${vh(8)} ${vh(14)}; display: flex; gap: ${vh(12)}; align-items: center; border: 2px solid #3cf0ff !important; pointer-events: none; }
.kp-ping.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
.kp-ping b { display: block; font-size: ${vh(14)}; letter-spacing: .16em; color: #3cf0ff; } .kp-ping span { font-size: ${vh(18)}; font-weight: 800; }
.kp-ping button { background: #3cf0ff; color: #032; border: 0; border-radius: ${vh(6)}; font-weight: 800; font-size: ${vh(17)}; letter-spacing: .1em; padding: ${vh(5)} ${vh(12)}; }
.kp-ping button kbd { font-family: inherit; opacity: .6; margin-left: ${vh(5)}; }
.kp-tally { display: none; margin-left: ${vh(6)}; background: #ff3b30; color: #fff; font-weight: 800; font-size: ${vh(13)}; letter-spacing: .16em; padding: ${vh(1)} ${vh(7)}; border-radius: ${vh(4)}; animation: kbBlink 1.6s infinite; }
.kc.onair .kp-tally { display: inline-block; }
.kc.onair .kc-seat { box-shadow: 0 0 0 2px #ff3b30, 0 0 ${vh(24)} rgba(255,59,48,.45); }
.kc-seats .s .air { color: #ff3b30; font-weight: 800; margin-left: ${vh(4)}; }
.kc-seats .s.onair { border-color: #ff3b30; }
.kc-seats .s .take { margin-left: ${vh(5)}; font: 800 ${vh(11)} ${UI.cond}; letter-spacing: .12em; background: #ff3b30; color: #fff; border: 0; border-radius: ${vh(3)}; padding: 0 ${vh(5)}; cursor: pointer; }
.kc-seat .acts { display: flex; gap: ${vh(5)}; margin-top: ${vh(6)}; }
.kc-seat .acts button { flex: 1; background: rgba(255,255,255,.06); color: ${UI.creamText}; border: 1px solid rgba(255,255,255,.16); border-radius: ${vh(5)}; font-weight: 800; font-size: ${vh(13)}; letter-spacing: .12em; padding: ${vh(3)} 0; }
.kc-seat .acts button kbd { font-family: inherit; color: ${UI.creamDim}; margin-right: ${vh(4)}; }
.kc-seat .acts button.take { border-color: #ff3b30; color: #ff8f88; }

/* PROGRAM output: nothing but the broadcast, no cursor */
.kc.program { cursor: none; }
.kc.program .kb-results { pointer-events: none; }
`;
