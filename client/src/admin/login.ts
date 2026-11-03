// Admin login (bundle dist-admin/login.js, public: it holds nothing but this form). Asks the server whether this browser
// already has an admin session; if so it loads the console bundle (served only with a valid session cookie), else it
// shows the key form. The key is read once on submit, cleared from the field at once (success or failure), sent as
// the JSON body of one same-origin POST and never logged, stored or put into a URL. There is deliberately no <form>
// element: a page whose script failed can't fall back to a native GET submit that would put the key into the URL.
import { TOON_LOGO, T } from "../ui/toon";
import { addStyle, adminChip, adminUrl, ensureToon, h, icon, safeNote, setBusy, spinner } from "./common";

type Phase = "checking" | "form" | "loading";

function boot(): void {
  ensureToon();
  addStyle("kr-admin-login", CSS);
  document.body.classList.add("kr-admin");
  const root = document.getElementById("kr-admin") ?? document.body.appendChild(h("div"));
  root.id = "kr-admin";

  // ---------------------------------------------------------------- the card
  const wrap = h("main", "tn-adm-login");
  const card = h("section", "tn-panel tn-adm-lcard");
  card.setAttribute("aria-labelledby", "tn-adm-lhead");
  const top = h("div", "tn-adm-ltop");
  top.append(adminChip());
  const logo = h("img", "tn-logo tn-adm-llogo");
  logo.src = TOON_LOGO.lockup; logo.alt = "Kong Royale"; logo.draggable = false;
  const head = h("h1", "tn-title tn-adm-lhead", "Admin");
  head.id = "tn-adm-lhead";
  const intro = h("p", "tn-body tn-adm-lintro", "Create event lobbies, share the link, run the match.");

  const field = h("div", "tn-adm-lfield");
  const label = h("label", "tn-label", "Admin key");
  const input = h("input", "tn-adm-input tn-adm-key");
  input.id = "kr-admin-key"; label.htmlFor = input.id;
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("data-lpignore", "true");
  input.setAttribute("aria-describedby", "kr-admin-lerr");
  input.maxLength = 256;
  field.append(label, input);

  const err = h("p", "tn-adm-err");
  err.id = "kr-admin-lerr";
  err.setAttribute("role", "alert");
  const btn = h("button", "tn-btn tn-btn--primary tn-adm-lbtn");
  btn.type = "button";
  const btnLabel = h("span", "", "Log in");
  btn.append(btnLabel, spinner());

  const status = h("p", "tn-support tn-adm-lstatus");
  status.setAttribute("aria-live", "polite");

  card.append(top, logo, head, intro, field, btn, err, status);
  wrap.append(card, safeNote());
  root.replaceChildren(wrap);

  // ---------------------------------------------------------------- states
  let waitUntil = 0;
  let waitTimer = 0;
  const setPhase = (p: Phase, msg = "") => {
    card.dataset.phase = p;
    const busy = p !== "form";
    setBusy(btn, busy);
    input.disabled = busy || Date.now() < waitUntil;
    btn.disabled = busy || Date.now() < waitUntil;
    btnLabel.textContent = p === "checking" ? "Checking…" : p === "loading" ? "Opening console…" : "Log in";
    status.textContent = msg;
  };
  const showError = (msg: string) => {
    err.replaceChildren(icon("alert"), h("span", "", msg));
    input.setAttribute("aria-invalid", "true");
  };
  const clearError = () => { err.replaceChildren(); input.removeAttribute("aria-invalid"); };

  /** a 429: lock the form until the server's wait is over, counting down */
  const lockFor = (s: number) => {
    waitUntil = Date.now() + s * 1000;
    clearInterval(waitTimer);
    const tick = () => {
      const left = Math.ceil((waitUntil - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(waitTimer); waitUntil = 0; clearError();
        setPhase("form"); input.focus();
        return;
      }
      showError(left >= 60 ? `Too many tries. Wait ${Math.ceil(left / 60)} minute${Math.ceil(left / 60) === 1 ? "" : "s"}.`
        : `Too many tries. Wait ${left} second${left === 1 ? "" : "s"}.`);
      input.disabled = true; btn.disabled = true;
    };
    tick();
    waitTimer = window.setInterval(tick, 1000);
  };

  // ---------------------------------------------------------------- console
  const loadConsole = () => {
    setPhase("loading");
    const s = document.createElement("script");
    s.src = adminUrl("admin/console.js");
    s.onerror = () => {
      s.remove();
      setPhase("form");
      showError("Session expired. Log in again.");
      input.focus();
    };
    document.body.appendChild(s);
  };

  // ---------------------------------------------------------------- submit
  const submit = async () => {
    if (card.dataset.phase !== "form" || Date.now() < waitUntil) return;
    let key: string | null = input.value;
    input.value = "";                      // out of the DOM before anything else happens
    if (!key.trim()) { key = null; showError("Enter the admin key."); input.focus(); return; }
    clearError();
    setPhase("checking");
    let res: Response;
    try {
      res = await fetch(adminUrl("admin/api/login"), {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ key }),
      });
    } catch {
      key = null;
      setPhase("form"); showError("Can't reach the server. Check the connection and try again."); input.focus();
      return;
    }
    key = null;
    input.value = "";
    if (res.ok) { loadConsole(); return; }
    let body: { retryS?: unknown; error?: unknown } = {};
    try { body = await res.json(); } catch { /* not JSON: use the status alone */ }
    setPhase("form");
    if (res.status === 429) { lockFor(Math.max(1, Math.round(Number(body.retryS) || 60))); return; }
    if ((res.status === 403 || res.status === 401) && body.error === "refused") showError("The server refused this page's request. Reload the page and try again.");
    else if (res.status === 403 || res.status === 401) showError("Wrong key.");
    else if (res.status === 503) showError("No admin key is set on this server.");
    else showError(`The server refused (${res.status}). Try again.`);
    input.focus();
  };
  btn.addEventListener("click", () => void submit());
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } });
  input.addEventListener("input", () => { if (input.getAttribute("aria-invalid")) clearError(); });

  // ---------------------------------------------------------------- already logged in?
  setPhase("checking");
  fetch(adminUrl("admin/api/session"), { credentials: "same-origin", cache: "no-store" })
    .then((r) => {
      if (r.ok) loadConsole();
      else if (r.status === 503) { setPhase("form"); showError("No admin key is set on this server."); }
      else { setPhase("form"); input.focus(); }
    })
    .catch(() => { setPhase("form"); showError("Can't reach the server. Check the connection and try again."); });
}

const CSS = `
.tn-adm-login { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${T(28)};
  padding: ${T(48)} ${T(24)}; background: radial-gradient(ellipse at 50% 0%, var(--kong-surface) 0%, var(--kong-bg) 70%); }
.tn-adm-lcard { width: min(${T(640)}, 100%); padding: ${T(40)} ${T(48)} ${T(36)}; display: flex; flex-direction: column; align-items: stretch; gap: ${T(18)}; }
.tn-adm-ltop { display: flex; justify-content: center; }
.tn-adm-llogo { width: ${T(300)}; align-self: center; margin: ${T(10)} 0 ${T(4)}; }
.tn-adm-lhead { margin: 0; text-align: center; }
.tn-adm-lintro { margin: 0 0 ${T(8)}; text-align: center; }
.tn-adm-lfield { display: grid; gap: ${T(8)}; }
.tn-adm-key { font-size: ${T(26)}; letter-spacing: .14em; }
.tn-adm-lbtn { width: 100%; margin-top: ${T(6)}; font-family: var(--kong-font-display); font-weight: 400; font-size: ${T(30)}; letter-spacing: .03em;
  -webkit-text-stroke: 0; }
.tn-adm-lbtn .tn-adm-spin { width: ${T(24)}; height: ${T(24)}; }
.tn-adm-lstatus { margin: 0; text-align: center; min-height: 0; }
.tn-adm-lstatus:empty { display: none; }
`;

boot();
