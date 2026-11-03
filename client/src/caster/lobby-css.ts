// The caster lobby card (over the title scene): join a lobby's caster seat by code, or open an exhibition.
import { UI } from "../ui/styles";

const vh = (px: number) => `${(px / 10.8).toFixed(3)}vh`;

export const LOBBY_CSS = `
.kcl { position: fixed; inset: 0; display: grid; place-items: center end; padding-right: 6vw; z-index: 12; pointer-events: none; font-family: ${UI.cond}; color: ${UI.creamText}; }
.kcl-card { pointer-events: auto; width: ${vh(560)}; background: rgba(8,22,34,.88); border: 2px solid ${UI.yellow}; border-radius: ${vh(14)}; padding: ${vh(24)} ${vh(28)}; box-shadow: 0 ${vh(20)} ${vh(60)} rgba(0,0,0,.5); backdrop-filter: blur(6px); }
.kcl-brand b { display: block; font-size: ${vh(58)}; line-height: .9; font-weight: 800; color: ${UI.yellow}; letter-spacing: .02em; }
.kcl-brand span { font-size: ${vh(22)}; font-weight: 800; letter-spacing: .32em; color: #fff; }
.kcl-name { display: block; margin: ${vh(18)} 0 ${vh(14)}; font-size: ${vh(13)}; letter-spacing: .2em; font-weight: 800; color: ${UI.creamDim}; }
.kcl input { display: block; width: 100%; margin-top: ${vh(5)}; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); border-radius: ${vh(6)}; color: #fff; font: 800 ${vh(24)} ${UI.cond}; letter-spacing: .08em; padding: ${vh(6)} ${vh(10)}; text-transform: uppercase; }
.kcl input:focus { outline: 2px solid ${UI.yellow}; }
.kcl-join { display: flex; gap: ${vh(8)}; } .kcl-join input { margin: 0; flex: 1; }
.kcl button { font: 800 ${vh(19)} ${UI.cond}; letter-spacing: .08em; border-radius: ${vh(7)}; padding: ${vh(9)} ${vh(14)}; cursor: pointer; background: rgba(255,255,255,.08); color: ${UI.creamText}; border: 1px solid rgba(255,255,255,.25); flex: 1; }
.kcl button:hover { border-color: ${UI.yellow}; }
.kcl button.go { background: ${UI.yellow}; color: #1d1400; border-color: ${UI.yellow}; }
.kcl-btns { display: flex; gap: ${vh(8)}; margin-top: ${vh(10)}; }
.kcl-or { text-align: center; margin: ${vh(18)} 0 ${vh(4)}; font-size: ${vh(13)}; letter-spacing: .2em; font-weight: 800; color: ${UI.creamDim}; }
.kcl-hint { font-size: ${vh(14)}; color: ${UI.creamDim}; margin: ${vh(12)} 0 0; line-height: 1.35; font-weight: 600; }
.kcl-hint b { color: ${UI.yellow}; }
.kcl-code { font-size: ${vh(26)}; font-weight: 800; letter-spacing: .06em; } .kcl-code b { color: ${UI.yellow}; }
.kcl-status { font-size: ${vh(15)}; letter-spacing: .14em; color: ${UI.creamDim}; font-weight: 800; margin: ${vh(4)} 0 ${vh(10)}; }
.kcl-cols { display: grid; grid-template-columns: 1fr 1fr; gap: ${vh(14)}; max-height: ${vh(300)}; overflow: auto; }
.kcl h5 { margin: 0 0 ${vh(4)}; font-size: ${vh(13)}; letter-spacing: .2em; color: ${UI.yellow}; }
.kcl-row { font-size: ${vh(17)}; font-weight: 700; padding: ${vh(2)} 0; } .kcl-row.me { color: ${UI.yellow}; } .kcl-row.dim { color: ${UI.creamDim}; font-size: ${vh(14)}; }
.kcl-busy { margin-top: ${vh(12)}; color: ${UI.yellow}; font-weight: 800; letter-spacing: .14em; }
.kcl-last { margin-top: ${vh(16)}; } .kcl-last h5 { margin-bottom: ${vh(6)}; }
.kcl-res.kb-results.on { position: static; display: block; background: none; pointer-events: none; zoom: .5; }
.kcl-last { overflow: hidden; } .kcl-res .card { width: auto; border-width: 1px; }
.kcl-err { margin-top: ${vh(12)}; color: #ff7a6b; font-weight: 800; letter-spacing: .06em; font-size: ${vh(16)}; }
/* (seats) the standby slate a PROGRAM window shows before the match (OBS captures it) */
.kb-slate { position: fixed; inset: 0; display: grid; place-items: center; background: radial-gradient(ellipse at center, rgba(14,42,62,.62), rgba(6,12,20,.94)); z-index: 12; font-family: ${UI.cond}; color: #fff; text-align: center; }
.kb-slate b { display: block; font: 800 ${vh(120)} / .9 ${UI.cond}; color: ${UI.yellow}; letter-spacing: .02em; text-shadow: 0 ${vh(8)} ${vh(40)} rgba(0,0,0,.6); }
.kb-slate span { font-weight: 800; font-size: ${vh(30)}; letter-spacing: .4em; }
.kb-slate em { display: block; margin-top: ${vh(24)}; font-style: normal; font-weight: 800; font-size: ${vh(20)}; letter-spacing: .2em; color: rgba(255,255,255,.6); animation: kclBlink 2s infinite; }
@keyframes kclBlink { 50% { opacity: .35; } }
`;
