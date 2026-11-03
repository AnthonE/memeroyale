// The in-match menu: a full-height LEFT sidebar over a navy scrim that fades out to the right, so the
// game stays visible.
// Eyebrow with the mode, a huge MENU title, "• MATCH CONTINUES" (the match never stops: not online, and not in an offline
// practice either — the host keeps simulating while the menu is up), chunky stacked buttons (the selected one turns
// yellow; Leave match red), a compact Leave confirm in place, and an Esc / ↑↓ / Enter keycap footer.
// The game (game/index.ts) owns WHEN it opens and what each action does; this module owns the look, focus and keys.
// Styles: ui/menu-styles.ts (.kr-mm). The full-screen button's label is kept by ui/fullscreen.ts.
import { keycap } from "./toon";
import { injectMenuStyles } from "./menu-styles";

export interface MatchMenuContext {
  /** the eyebrow: FIRING RANGE / PRACTICE · SOLO / TRIOS … */
  eyebrow: string;
  /** firing range: the practice analytics entry */
  range: boolean;
  analyticsShown: boolean;
  /** the first-session controls coach is up: offer to skip it */
  coach: boolean;
  /** offline practice / firing range (vs a live online match): what Leave match means */
  offline: boolean;
}
export interface MatchMenuActions {
  context(): MatchMenuContext;
  resume(): void;
  settings(): void;
  toggleAnalytics(): void;
  skipCoach(): void;
  /** open the bug-report bar; false when there is none (the entry hides) */
  report(): boolean;
  canReport(): boolean;
  leave(): void;
}
export interface MatchMenu {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  show(): void;
  hide(): void;
  /** re-read the context (mode, range, coach) into the entries */
  sync(): void;
  /** Esc / B inside the menu: closes the Leave confirm (true = taken); false = the menu itself should close */
  back(): boolean;
  /** the control the controller / keyboard should land on */
  first(): HTMLElement | null;
}

const ITEM = (act: string, label: string, extra = "") => `<button type="button" class="mm-item" data-act="${act}"${extra}><span>${label}</span></button>`;

export function createMatchMenu(parent: HTMLElement, a: MatchMenuActions): MatchMenu {
  injectMenuStyles();
  const el = document.createElement("div");
  el.className = "kr-pause kr-mm kr-tu"; el.tabIndex = -1;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Menu");
  el.innerHTML = `<div class="mm-scrim"></div>
    <div class="mm-panel">
      <div class="mm-ctx"><span class="mm-eyebrow"></span><i></i></div>
      <h1 class="mm-title">MENU</h1>
      <div class="mm-sub"><i></i><span>MATCH CONTINUES</span></div>
      <div class="mm-main">
        <div class="mm-list">
          ${ITEM("resume", "RESUME")}
          ${ITEM("settings", "SETTINGS")}
          ${ITEM("range-stats", "PRACTICE ANALYTICS", ' aria-pressed="false"')}
          ${ITEM("skip-coach", "SKIP CONTROLS COACH")}
          ${ITEM("fullscreen", "FULL SCREEN")}
          ${ITEM("report", "REPORT A PROBLEM")}
        </div>
        <div class="mm-leave">${ITEM("leave", "LEAVE MATCH")}</div>
      </div>
      <div class="mm-confirm" hidden role="alertdialog" aria-labelledby="mm-confirm-h">
        <h2 id="mm-confirm-h" class="tn-heading">LEAVE MATCH?</h2>
        <p class="mm-confirm-p"></p>
        <div class="mm-confirm-btns">${ITEM("leave-yes", "LEAVE MATCH")}${ITEM("leave-no", "STAY")}</div>
      </div>
      <div class="mm-foot"></div>
    </div>`;
  parent.appendChild(el);
  const $ = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const btn = (act: string) => $<HTMLButtonElement>(`[data-act="${act}"]`);
  const main = $(".mm-main"), confirm = $(".mm-confirm"), foot = $(".mm-foot");
  const hint = (k: HTMLElement, label: string) => { const s = document.createElement("span"); s.className = "tn-hint"; s.append(k, label); return s; };
  const setFoot = (confirming: boolean) => {
    foot.replaceChildren(...(confirming
      ? [hint(keycap("Esc", "accent"), "BACK"), hint(keycap("↑↓"), "SELECT"), hint(keycap("Enter"), "OPEN")]
      : [hint(keycap("Esc", "accent"), "RESUME"), hint(keycap("↑↓"), "SELECT"), hint(keycap("Enter"), "OPEN")]));
  };
  setFoot(false);

  const shown = (b: HTMLElement) => !b.hidden && !b.closest("[hidden]");
  /** the buttons of the current view, in order (↑↓ walks them) */
  const items = () => [...el.querySelectorAll<HTMLButtonElement>(confirm.hidden ? ".mm-main .mm-item" : ".mm-confirm .mm-item")].filter(shown);
  const focus = (b: HTMLElement | null | undefined) => { b?.focus({ preventScroll: true }); };

  const sync = () => {
    const c = a.context();
    $(".mm-eyebrow").textContent = c.eyebrow;
    btn("range-stats").hidden = !c.range;
    btn("range-stats").setAttribute("aria-pressed", String(c.analyticsShown));
    btn("range-stats").innerHTML = `<span>PRACTICE ANALYTICS</span><small>${c.analyticsShown ? "ON" : "OFF"}</small>`;
    btn("skip-coach").hidden = !c.coach;
    btn("report").hidden = !a.canReport();
    // six entries (range + coach + full screen) still fit 1080p: a denser stack
    el.classList.toggle("dense", items().length >= 7);
    $(".mm-confirm-p").textContent = c.offline
      ? "This practice match ends and you go back to the title screen."
      : "You drop out of this match and go back to the title screen. You can't rejoin it.";
  };

  const openConfirm = () => {
    main.hidden = true; confirm.hidden = false; setFoot(true);
    focus(btn("leave-no"));
  };
  const closeConfirm = () => {
    if (confirm.hidden) return false;
    confirm.hidden = true; main.hidden = false; setFoot(false);
    focus(btn("leave"));
    return true;
  };

  el.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!b) return;
    e.stopPropagation();
    switch (b.dataset.act) {
      case "resume": a.resume(); break;
      case "settings": returnTo = b; a.settings(); break;
      case "range-stats": a.toggleAnalytics(); sync(); break;
      case "skip-coach": a.skipCoach(); sync(); focus(btn("resume")); break;
      case "report": returnTo = b; if (!a.report()) sync(); break;
      case "leave": openConfirm(); break;
      case "leave-no": closeConfirm(); break;
      case "leave-yes": a.leave(); break;
      // "fullscreen": ui/fullscreen.ts listens on the button itself
    }
  });
  // the selection follows the mouse too (one highlighted entry)
  el.addEventListener("mouseover", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".mm-item");
    if (b && document.activeElement !== b && !document.documentElement.classList.contains("kr-pad")) focus(b);
  });
  // ↑↓ walk the entries (wrapping); Enter / Space are the buttons' own. Bubble phase on the menu: the game's window
  // listener still sees the key and ignores it (gameplay is off while the menu is up)
  const step = (d: 1 | -1) => {
    const list = items(); if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    focus(list[i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length]);
  };
  addEventListener("keydown", (e) => {
    if (!open || document.documentElement.classList.contains("kr-settings-open")) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.code === "ArrowUp" || e.code === "ArrowDown") { e.preventDefault(); step(e.code === "ArrowUp" ? -1 : 1); }
    else if ((e.code === "Enter" || e.code === "NumpadEnter") && !el.contains(document.activeElement)) { e.preventDefault(); focus(items()[0]); }
  });

  // SETTINGS / the report bar take over; when they close, focus comes back to the entry that opened them
  let returnTo: HTMLElement | null = null;
  const restore = () => {
    if (!open || !returnTo) return;
    if (document.documentElement.classList.contains("kr-settings-open") || reporting()) return;
    if (!el.contains(document.activeElement) || document.activeElement === el) focus(returnTo);
    returnTo = null;
  };
  const reporting = () => { const bar = document.querySelector<HTMLElement>(".kb-bar"); return !!bar && !bar.hidden; };
  new MutationObserver(restore).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  // the report bar replaces the menu (no stacked panels): the sidebar steps aside while it is up
  let barObserved = false;
  const watchBar = () => {
    const bar = document.querySelector<HTMLElement>(".kb-bar");
    if (!bar || barObserved) return;
    barObserved = true;
    new MutationObserver(() => { el.classList.toggle("reporting", open && !bar.hidden); restore(); }).observe(bar, { attributes: true, attributeFilter: ["hidden"] });
  };

  let open = false;
  return {
    el,
    get isOpen() { return open; },
    show() {
      watchBar();
      confirm.hidden = true; main.hidden = false; setFoot(false); returnTo = null;
      sync();
      open = true; el.classList.remove("reporting"); el.classList.add("on");
      focus(btn("resume"));
    },
    hide() {
      if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      open = false; el.classList.remove("on", "reporting");
    },
    sync,
    back: closeConfirm,
    first: () => confirm.hidden ? btn("resume") : btn("leave-no"),
  };
}
