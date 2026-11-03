// Toon modal dialogs for the admin console: one overlay owns focus (Tab is trapped inside, Esc cancels, focus returns
// to where it came from). Titles and bodies are plain text (textContent): a player's name can appear in them.
import { h, icon } from "./common";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

let open: { close: () => void } | null = null;
export const dialogOpen = () => open !== null;

export interface ModalOpts {
  title: string;
  /** "danger" draws the red edge */
  tone?: "danger" | "";
  wide?: boolean;
  onClose?: () => void;
}

/** a scrim + Toon dialog; returns the body to fill and a close function */
export function modal(opts: ModalOpts): { body: HTMLElement; actions: HTMLElement; close: () => void; panel: HTMLElement } {
  open?.close();
  const back = document.activeElement as HTMLElement | null;
  const scrim = h("div", "tn-scrim tn-adm-scrim");
  const panel = h("div", "tn-dialog tn-adm-dialog" + (opts.tone === "danger" ? " is-danger" : "") + (opts.wide ? " is-wide" : ""));
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  const id = "tn-adm-dlg-" + Math.random().toString(36).slice(2, 8);
  const title = h("h2", "tn-heading tn-adm-dtitle", opts.title);
  title.id = id;
  panel.setAttribute("aria-labelledby", id);
  const body = h("div", "tn-adm-dbody");
  const actions = h("div", "tn-adm-dactions");
  panel.append(title, body, actions);
  scrim.append(panel);
  document.body.append(scrim);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", onKey, true);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });

  let closed = false;
  const self = { close: () => close() };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    scrim.remove();
    if (open === self) open = null;
    opts.onClose?.();
    if (back && back.isConnected) back.focus();
  }
  open = self;
  return { body, actions, close, panel };
}

export interface ConfirmOpts {
  title: string;
  body: string;
  ok: string;
  cancel?: string;
  danger?: boolean;
}

/** a yes/no question; resolves true only on the confirm button. Focus starts on Cancel (the safe choice) */
export function confirmBox(o: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const m = modal({ title: o.title, tone: o.danger ? "danger" : "", onClose: () => resolve(answer) });
    const p = h("p", "tn-body tn-adm-dtext", o.body);
    m.body.append(p);
    const no = h("button", "tn-btn", o.cancel ?? "Cancel");
    no.type = "button";
    const yes = h("button", "tn-btn " + (o.danger ? "tn-btn--danger" : "tn-btn--primary"));
    yes.type = "button";
    if (o.danger) yes.append(icon("alert"));
    yes.append(h("span", "", o.ok));
    no.addEventListener("click", () => m.close());
    yes.addEventListener("click", () => { answer = true; m.close(); });
    m.actions.append(no, yes);
    no.focus();
  });
}
