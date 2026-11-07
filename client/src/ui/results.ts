// Placement / victory screen: a big placement number (or "#1 MEME ROYALE" with golden confetti), who got you and with
// what, the match stats and the squad lines, then explicit actions: PLAY AGAIN (practice), SPECTATE (the match is still
// running), BACK TO LOBBY.
import type { ResultsActions, ResultsScreen, ResultsState } from "./api";
import { injectStyles } from "./styles";
import { injectMenuStyles } from "./menu-styles";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, "0")}`;

export function createResults(): ResultsScreen {
  injectStyles(); injectMenuStyles();
  const root = document.createElement("div");
  root.className = "kr-results kr-hide";
  const confetti = document.createElement("canvas"); confetti.className = "confetti";
  root.appendChild(confetti);
  const card = div("card", root);
  const kick = div("kick", card);
  const place = div("place", card);
  const of = div("of", card);
  const kb = div("kb", card);
  const stats = div("stats", card);
  const recap = div("recap", card);
  recap.setAttribute("aria-label", "Personal bests");
  const squad = div("squad", card);
  const btns = div("btns", card);
  const again = document.createElement("button"), spectate = document.createElement("button"), lobby = document.createElement("button");
  for (const [button, label] of [[again, "PLAY AGAIN"], [spectate, "SPECTATE"], [lobby, "BACK TO LOBBY"]] as const) { button.className = "kr-btn"; button.textContent = label; btns.appendChild(button); }
  const hint = div("hint", card);
  let actions: ResultsActions | null = null;
  again.addEventListener("click", () => actions?.playAgain?.());
  spectate.addEventListener("click", () => actions?.spectate?.());
  lobby.addEventListener("click", () => actions?.backToLobby());
  // ---- confetti (victory only): ~220 banana-gold flakes, canvas 2D, stops when hidden
  let raf = 0, flakes: Array<{ x: number; y: number; vx: number; vy: number; r: number; w: number; h: number; c: string; s: number }> = [];
  const COLS = ["#ffd400", "#ffe98a", "#f2b705", "#fff4c4", "#ff9f1a"];
  const runConfetti = () => {
    const W = confetti.width = innerWidth * Math.min(2, devicePixelRatio || 1), H = confetti.height = innerHeight * Math.min(2, devicePixelRatio || 1);
    flakes = Array.from({ length: 220 }, () => ({ x: Math.random() * W, y: -Math.random() * H, vx: (Math.random() - 0.5) * 60, vy: 140 + Math.random() * 220, r: Math.random() * 6, w: 10 + Math.random() * 16, h: 6 + Math.random() * 10, c: COLS[(Math.random() * COLS.length) | 0], s: (Math.random() - 0.5) * 8 }));
    let last = performance.now();
    const g = confetti.getContext("2d")!;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, W, H);
      for (const f of flakes) {
        f.x += (f.vx + Math.sin(f.y * 0.01 + f.r) * 40) * dt; f.y += f.vy * dt; f.r += f.s * dt;
        if (f.y > H + 20) { f.y = -20; f.x = Math.random() * W; }
        g.save(); g.translate(f.x, f.y); g.rotate(f.r); g.scale(1, Math.abs(Math.cos(f.r * 1.7)) * 0.8 + 0.2);
        g.fillStyle = f.c; g.fillRect(-f.w / 2, -f.h / 2, f.w, f.h); g.restore();
      }
      raf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(raf); raf = requestAnimationFrame(step);
  };

  return {
    el: root,
    show(s: ResultsState, nextActions: ResultsActions, preserveFocus = false) {
      const activeBefore = document.activeElement;
      actions = nextActions;
      // (an unavailable action is display:none inline — .kr-btn's display:flex would otherwise win over [hidden])
      again.hidden = !actions.playAgain; spectate.hidden = !actions.spectate;
      again.style.display = actions.playAgain ? "" : "none"; spectate.style.display = actions.spectate ? "" : "none";
      hint.textContent = actions.playAgain ? "YOUR PRACTICE MODE AND DIFFICULTY ARE KEPT FOR PLAY AGAIN" : actions.spectate ? "SPECTATE THE MATCH OR RETURN TO THE LOBBY" : "RETURN TO THE LOBBY FOR YOUR NEXT MATCH";
      root.classList.toggle("win", s.winner);
      kick.textContent = s.winner ? "VICTORY" : s.mode === "solo" ? "YOU PLACED" : "YOUR SQUAD PLACED";
      place.innerHTML = "";
      if (s.winner) place.textContent = "MEME ROYALE";
      else { const sm = document.createElement("small"); sm.textContent = "#"; place.append(sm, String(s.placement)); }
      of.textContent = s.winner ? "#1 OF " + s.totalSquads + (s.mode === "solo" ? " PLAYERS" : " SQUADS") : `OF ${s.totalSquads} ${s.mode === "solo" ? "PLAYERS" : "SQUADS"}`;
      kb.textContent = "";
      if (!s.winner && s.killedBy) { kb.append("ELIMINATED BY "); const b = document.createElement("b"); b.textContent = s.killedBy; kb.appendChild(b); }
      if (!s.winner && s.death) { kb.append(` · ${s.death.weapon}`); if (s.death.incomingDamage && s.death.windowS) kb.append(` · ${s.death.incomingDamage} CONFIRMED HIT DAMAGE · LAST ${s.death.windowS}S`); }
      // stats
      stats.innerHTML = "";
      const rows: Array<[string, string, boolean]> = [["KILLS", String(s.kills), s.kills > 0], ["DAMAGE", String(Math.round(s.damage)), false], ["TIME IN MATCH", s.survivedS === null ? "—" : fmtTime(s.survivedS), false]];
      if (s.stats?.headshots !== undefined) rows.push(["HEADSHOTS", String(s.stats.headshots), false]);
      if (s.stats?.accuracy !== undefined) rows.push(["ACCURACY", `${Math.round(s.stats.accuracy * 100)}%`, false]);
      if (s.stats?.chests !== undefined) rows.push(["CHESTS", String(s.stats.chests), false]);
      stats.style.setProperty("--n", String(Math.min(4, rows.length)));
      for (const [k, v, hl] of rows.slice(0, 4)) { const st = div(hl ? "stat hl" : "stat", stats); div("v", st).textContent = v; div("k", st).textContent = k; }
      recap.replaceChildren(); recap.hidden = !s.recap;
      if (s.recap) {
        div("recap-context", recap).textContent = s.recap.context;
        div("recap-title", recap).textContent = s.recap.headline;
        div("recap-records", recap).textContent = s.recap.records.join(" · ");
        div("recap-target", recap).textContent = s.recap.target;
        div("recap-status", recap).textContent = s.recap.status;
      }
      squad.innerHTML = "";
      squad.style.display = s.squad && s.squad.length > 1 ? "" : "none";
      for (const m of s.squad ?? []) { const r = div(m.me ? "r me" : "r", squad); span(r, m.name); span(r, `${m.kills} KILLS`); span(r, `${Math.round(m.damage)} DMG`); }
      root.classList.remove("kr-hide");
      // a refresh keeps the player's focus unless the focused action just went away
      if (!preserveFocus || (activeBefore === spectate && !actions.spectate) || (activeBefore === again && !actions.playAgain)) (actions.playAgain ? again : actions.spectate ? spectate : lobby).focus();
      if (preserveFocus) return;
      const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (s.winner && !reduceMotion) { confetti.style.display = ""; runConfetti(); } else { confetti.style.display = "none"; cancelAnimationFrame(raf); }
      if (!reduceMotion) card.animate([{ transform: "translateY(24px) scale(0.96)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
    },
    hide() { actions = null; root.classList.add("kr-hide"); cancelAnimationFrame(raf); },
  };
}

function div(cls: string, parent: HTMLElement) { const e = document.createElement("div"); e.className = cls; parent.appendChild(e); return e; }
function span(parent: HTMLElement, t: string) { const e = document.createElement("span"); e.textContent = t; parent.appendChild(e); return e; }
