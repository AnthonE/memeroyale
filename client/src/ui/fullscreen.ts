// The game's OWN full-screen toggle — a button on
// the title next to SETTINGS, an entry in the match menu, Alt+Enter / F11 (game/input.ts) — and the notice when the browser
// takes the game out of full screen on its own (an Esc it kept: no Keyboard Lock on an http:// page or in Firefox /
// Safari). Only the game's full screen lets a short Esc reach the game (menus close, pause opens) while the screen stays
// full; the browser's own F11 / green-button full screen never can.
import type { GameInput } from "../game/input";
import { addCss, UI } from "./styles";

const u = (n: number) => `calc(${n} * var(--u))`;
const CSS = `
.kr-fs-btn, .kr-fs-toast { --u: min(calc(100vh / 1440), calc(100vw / 2300)); }
.kr-fs-btn { position: fixed; top: ${u(40)}; right: ${u(330)}; z-index: 12; display: flex; align-items: center; gap: ${u(12)}; cursor: pointer;
  font: 800 ${u(28)} ${UI.cond}; letter-spacing: ${u(3)}; color: ${UI.cream}; background: rgba(9,26,40,0.78);
  border: ${u(2)} solid rgba(255,212,0,0.8); border-radius: ${u(10)}; padding: ${u(10)} ${u(22)}; pointer-events: auto; }
.kr-fs-btn:hover, .kr-fs-btn:focus-visible { background: ${UI.yellow}; color: #1d1400; outline: none; }
.kr-fs-btn svg { width: ${u(34)}; height: ${u(34)}; }
.kr-fs-btn small { font: 700 ${u(18)} ${UI.cond}; letter-spacing: ${u(2)}; opacity: .7; }
.kr-fs-toast { position: fixed; left: 50%; top: 27%; transform: translateX(-50%); z-index: 58; display: none; align-items: center; gap: ${u(18)};
  background: rgba(9,26,40,0.94); border: ${u(2)} solid rgba(255,212,0,0.85); border-radius: ${u(10)}; padding: ${u(14)} ${u(16)} ${u(14)} ${u(24)};
  font: 700 ${u(26)} ${UI.cond}; letter-spacing: ${u(2)}; color: ${UI.creamText}; pointer-events: auto; white-space: nowrap; box-shadow: 0 ${u(12)} ${u(40)} rgba(0,0,0,0.45); }
.kr-fs-toast.on { display: flex; }
.kr-fs-toast b { color: ${UI.yellow}; }
.kr-fs-toast small { display: block; font: 600 ${u(19)} ${UI.cond}; letter-spacing: ${u(1.5)}; opacity: .72; margin-top: ${u(2)}; }
.kr-fs-toast button { font: 800 ${u(24)} ${UI.cond}; letter-spacing: ${u(2)}; color: #1d1400; background: ${UI.yellow}; border: 0; border-radius: ${u(8)};
  padding: ${u(9)} ${u(18)}; cursor: pointer; display: flex; align-items: center; gap: ${u(8)}; }
.kr-fs-toast button svg { width: ${u(24)}; height: ${u(24)}; }
.kr-fs-toast button.x { background: transparent; color: ${UI.cream}; border: ${u(2)} solid rgba(246,239,198,0.35); }
/* over the match menu it docks beside the left sidebar (left / width / top set
   in dock()), the text wraps */
.kr-fs-toast.docked { transform: none; white-space: normal; flex-wrap: wrap; justify-content: center; text-align: center; box-sizing: border-box; row-gap: ${u(12)}; }
.kr-fs-toast.docked > div { flex: 1 1 100%; }
`;
/** four corner brackets pointing out (enter) / in (exit) */
const ICON = (exit: boolean) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${exit
  ? `<path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"/>`
  : `<path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>`}</svg>`;
const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);
/** the game's own full-screen key, as the player's keyboard writes it */
export const FS_KEY = isMac ? "⌥ RETURN" : "ALT+ENTER";

export interface FullscreenUi {
  /** the browser ended the game's full screen on its own (an Esc it kept): say so, offer the way back — `click`: the next
   *  click on the game restores it (a menu just closed); `resume`: the match menu's RESUME does (live play paused);
   *  `key`: the game's toggle (Alt+Enter, the button) */
  lost(mode: "click" | "resume" | "key"): void;
  /** re-read the full-screen state into the buttons */
  sync(): void;
}

export function createFullscreenUi(input: GameInput, lobbyRoot: HTMLElement, pauseCard: HTMLElement): FullscreenUi {
  addCss("kr-ui-fullscreen", CSS);
  const supported = !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
  // ---- title: next to SETTINGS (the gear is mounted later by ui/settings.ts: line up with it once it is there)
  const btn = document.createElement("button");
  btn.className = "kr-fs-btn"; btn.type = "button";
  if (supported) lobbyRoot.appendChild(btn);
  const place = () => {
    const gear = lobbyRoot.querySelector<HTMLElement>(".kr-video-gear");
    if (!gear || !gear.offsetWidth) return false;
    const r = gear.getBoundingClientRect();
    btn.style.right = `${Math.round(innerWidth - r.left + 12)}px`; btn.style.top = `${Math.round(r.top)}px`; btn.style.height = `${Math.round(r.height)}px`;
    return true;
  };
  { let n = 0; const iv = window.setInterval(() => { if (place() || ++n > 120) clearInterval(iv); }, 250); }
  addEventListener("resize", () => { place(); });
  btn.addEventListener("click", (ev) => { ev.stopPropagation(); input.toggleFullscreen(); btn.blur(); });
  // ---- the match menu (ui/match-menu.ts) has its own FULL SCREEN entry: this keeps its label and action (the match
  // keeps running while you flip it); hidden where the page cannot go full screen
  const pbtn = pauseCard.querySelector<HTMLButtonElement>('button[data-act="fullscreen"]') ?? document.createElement("button");
  pbtn.hidden = !supported;
  pbtn.addEventListener("click", (ev) => { ev.stopPropagation(); input.toggleFullscreen(); });
  // ---- the notice: the browser took the game out of full screen
  const toast = document.createElement("div"); toast.className = "kr-fs-toast"; toast.setAttribute("role", "status");
  document.body.appendChild(toast);
  let timer = 0;
  // while the match menu is up the notice docks beside its left sidebar (on the game, next to the
  // buttons), never over the MENU title or the entries
  const card = pauseCard.querySelector<HTMLElement>(".mm-panel");
  const dock = () => {
    const up = toast.classList.contains("on") && pauseCard.classList.contains("on") && !!card?.offsetWidth;
    toast.classList.toggle("docked", up);
    if (!up || !card) { toast.style.top = ""; toast.style.left = ""; toast.style.width = ""; return; }
    const r = card.getBoundingClientRect(), gap = Math.round(r.left * 0.6);
    toast.style.left = `${Math.round(r.right + gap)}px`;
    toast.style.width = `${Math.round(Math.min(innerWidth - r.right - gap * 2, r.width * 1.3))}px`;
    toast.style.top = `${Math.round(r.top + r.height * 0.42)}px`;
  };
  new MutationObserver(dock).observe(pauseCard, { attributes: true, attributeFilter: ["class"] });
  addEventListener("resize", dock);
  toast.addEventListener("click", (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLElement>("button")?.dataset.a;
    if (a === "fs") input.toggleFullscreen();
    if (a) { toast.classList.remove("on"); clearTimeout(timer); dock(); }
  });
  const sync = () => {
    const on = input.isFullscreen;
    btn.innerHTML = `${ICON(on)}<span>${on ? "EXIT FULL SCREEN" : "FULL SCREEN"}</span><small>${FS_KEY}</small>`;
    btn.title = on ? (input.escHeld ? "Esc stays in the game — hold Esc for 2 s to leave full screen" : "Full screen") : `The game's own full screen: Esc then closes menus without leaving it (${FS_KEY})`;
    pbtn.innerHTML = `<span>${on ? "EXIT FULL SCREEN" : "FULL SCREEN"}</span><small>${FS_KEY}</small>`;
    if (on) toast.classList.remove("on");
    dock(); place();
  };
  input.onFullscreenState = sync;
  document.addEventListener("fullscreenchange", sync);
  sync();
  return {
    sync,
    lost(mode) {
      if (!supported) return;
      const how = mode === "click" ? "CLICK THE GAME TO PLAY ON IN FULL SCREEN" : mode === "resume" ? "RESUME PUTS THE GAME BACK IN FULL SCREEN"
        : `${FS_KEY} OR THE BUTTON PUTS THE GAME BACK IN ITS OWN FULL SCREEN`;
      toast.innerHTML = `<div>FULL SCREEN OFF — THIS BROWSER KEEPS <b>ESC</b><small>${how}</small></div>`
        + `<button data-a="fs">${ICON(false)}FULL SCREEN</button><button class="x" data-a="x">OK</button>`;
      toast.classList.add("on"); dock();
      clearTimeout(timer); timer = window.setTimeout(() => { toast.classList.remove("on"); dock(); }, 7000);
    },
  };
}
