// SETTINGS menu: the Toon settings screen over the live game (ui/settings-shell.ts), opened from the title (the SETTINGS
// button) and the pause card (SETTINGS). Five categories (Mouse & keyboard, Controller, Audio, Video, Accessibility);
// every change applies instantly and is remembered on this device (settings/preferences.ts for the player's
// preferences, engine/display.ts for video). Also here: the FPS counter overlay, the first-visit "auto-detected" toast,
// the bench's step-down notice and the runtime guard's "switch to a lower preset?" toast.
// The root keeps the class `.kr-video` (`.on` while open) and the BACK button `.close`: game/index.ts gates gameplay
// input and routes the controller on them.
import type { Engine } from "../engine/engine";
import type { Display, Level, VideoSettings } from "../engine/display";
import { U as u, addCss } from "./styles";
import { T } from "./toon";
import { SETTINGS_CSS } from "./settings-css";
import { createSettingsShell } from "./settings-shell";

const CSS = `
.kr-fps, .kr-vtoast, .kr-vnote, .kr-video-gear { --u: min(calc(100vh / 1440), calc(100vw / 2300)); }
.kr-video-gear { position: fixed; top: ${u(40)}; right: ${u(48)}; z-index: 12; display: flex; align-items: center; gap: ${u(12)}; cursor: pointer; pointer-events: auto;
  padding: ${u(12)} ${u(24)}; border-radius: ${u(18)}; border: ${u(4)} solid var(--kong-outline); box-shadow: 0 ${u(6)} 0 var(--kong-outline);
  background: var(--kong-gradient-secondary); color: var(--kong-text); font: 900 ${u(24)}/1 var(--kong-font-ui); letter-spacing: .08em; text-transform: uppercase;
  transition: transform var(--kong-motion-fast) var(--kong-ease-spring), box-shadow var(--kong-motion-fast); }
.kr-video-gear:hover { transform: translateY(${u(-3)}); box-shadow: 0 ${u(9)} 0 var(--kong-outline); }
.kr-video-gear:active { transform: translateY(${u(5)}); box-shadow: 0 ${u(1)} 0 var(--kong-outline); }
.kr-video-gear:focus-visible { outline: var(--kong-focus-width) solid var(--kong-focus); outline-offset: var(--kong-focus-offset); }
.kr-video-gear svg { width: ${u(30)}; height: ${u(30)}; }
.kr-fps { position: fixed; left: ${u(14)}; top: ${u(10)}; z-index: 55; display: none; pointer-events: none;
  font: 700 ${u(26)} ui-monospace, 'SF Mono', Menlo, Consolas, monospace; color: var(--kong-success); text-shadow: 0 ${u(2)} ${u(3)} var(--kong-outline); }
.kr-fps.on { display: block; }
.kr-fps small { color: var(--kong-text-muted); font-size: ${u(20)}; margin-left: ${u(8)}; }
/* the video notices: Toon toasts (outlined navy pill, yellow left edge) */
.kr-vtoast, .kr-vnote { position: fixed; z-index: 58; display: none; align-items: center; gap: ${T(14)}; pointer-events: auto;
  padding: ${T(10)} ${T(12)} ${T(10)} ${T(20)}; border-radius: 999px; background: var(--kong-surface); border: var(--kong-outline-sm) solid var(--kong-outline);
  box-shadow: var(--kong-drop-pill), inset ${T(8)} 0 0 var(--kong-accent); color: var(--kong-text);
  font-family: var(--kong-font-ui); font-weight: 800; font-size: var(--kong-fs-support); line-height: var(--kong-lh-support); white-space: nowrap; }
.kr-vtoast { left: 50%; bottom: ${u(250)}; transform: translateX(-50%); }
.kr-vnote { right: ${T(36)}; bottom: ${T(30)}; max-width: ${T(900)}; white-space: normal; border-radius: var(--kong-radius-tile); box-shadow: var(--kong-drop-pill), inset ${T(8)} 0 0 var(--kong-warning); }
.kr-vtoast.on, .kr-vnote.on { display: flex; }
.kr-vtoast b, .kr-vnote b { color: var(--kong-accent); font-weight: 900; }
.kr-vtoast button, .kr-vnote button { appearance: none; cursor: pointer; white-space: nowrap; padding: ${T(6)} ${T(16)}; border-radius: 999px;
  border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: 0 ${T(3)} 0 var(--kong-outline); background: var(--kong-surface-2); color: var(--kong-text);
  font: 900 var(--kong-fs-support) var(--kong-font-ui); letter-spacing: .08em; text-transform: uppercase; }
.kr-vtoast button.y { background: var(--kong-gradient-primary); color: var(--kong-on-accent); }
.kr-vtoast button:active, .kr-vnote button:active { transform: translateY(${T(2)}); box-shadow: var(--kong-drop-pressed); }
`;

const GEAR = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.6 7.6 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>`;

export interface VideoMenu {
  open(): void; close(): void; readonly isOpen: boolean;
  /** open on a category ("kbm" | "pad" | "audio" | "video" | "a11y") and section (tools) */
  show(cat: string, sec?: number): void;
}

export function createVideoMenu(engine: Engine, display: Display): VideoMenu {
  addCss("kr-ui-video", CSS);
  addCss("kr-settings-toon", SETTINGS_CSS);
  const shell = createSettingsShell(engine, display);
  return {
    get isOpen() { return shell.isOpen; },
    open() { shell.open(); },
    close() { shell.close(); },
    show(cat: string, sec?: number) { shell.show(cat, sec); },
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }

/** the FPS counter (top-left), the SETTINGS button on the title, the button on the pause card, the toasts */
export function mountVideoUi(engine: Engine, display: Display, menu: VideoMenu) {
  addCss("kr-ui-video", CSS);
  const fps = document.createElement("div"); fps.className = "kr-fps"; document.body.appendChild(fps);
  let fpsTimer = 0;
  display.onShowFps = (on) => {
    fps.classList.toggle("on", on);
    clearInterval(fpsTimer);
    if (on) fpsTimer = window.setInterval(() => {
      const f = engine.liveFps();
      fps.innerHTML = `${f} FPS<small>${f ? (1000 / f).toFixed(1) : "-"} MS${engine.gpuMs ? ` · GPU ${engine.gpuMs.toFixed(1)}` : ""}</small>`;
    }, 500);
  };

  // title: a SETTINGS button top-right while the lobby / title is showing
  const lobby = document.querySelector(".kr-lobby");
  if (lobby) {
    const gear = document.createElement("button"); gear.type = "button"; gear.className = "kr-video-gear"; gear.innerHTML = `${GEAR}<span>SETTINGS</span>`;
    gear.addEventListener("click", (ev) => { ev.stopPropagation(); menu.open(); });
    lobby.appendChild(gear);
  }
  // pause card: SETTINGS above RESUME, styled like its neighbours
  const resume = document.querySelector<HTMLButtonElement>('.kr-pause button[data-a="resume"]');
  if (resume) {
    const b = document.createElement("button");
    b.textContent = "SETTINGS";
    b.style.cssText = resume.style.cssText + ";background:rgba(8,24,36,.9);color:#f6efc6;border:2px solid #ffd400";
    b.addEventListener("click", (ev) => { ev.stopPropagation(); menu.open(); });
    resume.parentElement!.insertBefore(b, resume);
    resume.parentElement!.insertBefore(document.createElement("br"), resume);
  }

  const toast = document.createElement("div"); toast.className = "kr-vtoast"; toast.setAttribute("role", "status"); document.body.appendChild(toast);
  let toastTimer = 0;
  const show = (html: string, ms: number) => { toast.innerHTML = html; toast.classList.add("on"); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove("on"), ms); };
  toast.addEventListener("click", (ev) => {
    const a = (ev.target as HTMLElement).dataset.a;
    if (!a) return;
    if (a === "apply") display.set({ preset: toast.dataset.level as Level });
    if (a === "menu") menu.show("video", 1);
    toast.classList.remove("on");
  });
  // the first-visit bench stepped the preset down: a persistent corner notice with the new 3D resolution (never a
  // silent drop) until the player dismisses it or opens the settings
  const note = document.createElement("div"); note.className = "kr-vnote"; note.setAttribute("role", "status"); document.body.appendChild(note);
  const showNote = (st: NonNullable<VideoSettings["stepped"]>) => {
    note.innerHTML = `<span>Your GPU missed the frame budget on <b>${esc(cap(st.from))}</b>: Auto now uses <b>${esc(cap(st.to))}</b> · 3D resolution <b>${Math.round(st.res * 100)}%</b></span>
      <button type="button" data-a="menu">Settings</button><button type="button" data-a="ok">OK</button>`;
    note.classList.add("on");
  };
  note.addEventListener("click", (ev) => {
    const a = (ev.target as HTMLElement).dataset.a;
    if (!a) return;
    if (a === "menu") menu.show("video", 1);
    display.ackStepped();
    note.classList.remove("on");
  });
  display.onStepped = showNote;
  if (display.settings.stepped && !display.settings.stepped.ack) showNote(display.settings.stepped);

  display.onSuggest = (level, f) => {
    toast.dataset.level = level;
    show(`<span>Frame rate is low (${f} FPS): switch to <b>${esc(cap(level))}</b>?</span><button type="button" class="y" data-a="apply">Switch</button><button type="button" data-a="x">Keep</button>`, 12000);
  };
  return {
    /** first visit: say what Auto picked */
    announceAuto() {
      const s = display.settings;
      const m = /(GeForce [^(),]+|Quadro [^(),]+|Radeon[^(),]*|Apple M\d[^(),]*|Iris[^(),]*|Intel[^(),]*|Arc [^(),]+|Mali[^(),]*|Adreno[^(),]*)/i.exec(display.gpu);
      const name = (m ? m[1] : "your GPU").replace(/\s+/g, " ").trim();
      show(`<span>Video preset <b>Auto · ${esc(cap(s.auto))}</b> · ${esc(name)}</span><button type="button" data-a="menu">Settings</button>`, 7000);
    },
  };
}
