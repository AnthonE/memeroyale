// Sign in with Elo Pros on the title (the server's half is server/elo.ts). Only when the server says it is on
// (GET api/elo): the page loads Elo Pros' sign-in script (pinned by its SRI hash), keeps a fresh nonce from our server
// ready (so the popup opens on the click itself, which a browser requires), and on the click asks Elo Pros for a pass,
// hands it to our server (POST api/elo/signin) and keeps the ticket it answers with. The game sends that ticket on every
// connection (game/index.ts), so a player signs in once a day. A sign-in names the player's Elo Pros account and, when
// one is linked, their wallet; the callsign stays theirs to pick.
const SDK = "https://elopros.com/sdk/elo-signin-1.js";
const SDK_SRI = "sha384-avZuflRDaeWr0LikAplKPVTyquBsumLmPa7EfTOnCQpDl9LFVgBxRhR5V64Bk2Pa";
const KEY = "kr-elo";
const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";

interface Sdk { popup(o: { game: string; nonce: string; callback?: string }): Promise<{ pass: string }> }
export interface EloState { on: boolean; busy: boolean; account: string | null; wallet: string | null; error: string | null }
interface Stored { ticket: string; account: string; wallet: string | null; exp: number }

const state: EloState = { on: false, busy: false, account: null, wallet: null, error: null };
const listeners: Array<(s: EloState) => void> = [];
const emit = () => { for (const f of listeners) f(state); };
let game = "", nonce = "", nonceAt = 0;

function read(): Stored | null {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "null") as Stored | null;
    return j && typeof j.ticket === "string" && j.exp * 1000 > Date.now() ? j : null;
  } catch { return null; }
}
function write(s: Stored | null) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* private mode: this page only */ } }
let mem: Stored | null = read();
function adopt(s: Stored | null) { mem = s; write(s); state.account = s?.account ?? null; state.wallet = s?.wallet ?? null; emit(); }
adopt(mem);

async function freshNonce() {
  const r = await fetch(`${base}api/elo/nonce`, { cache: "no-store" });
  if (!r.ok) throw new Error(`nonce ${r.status}`);
  nonce = String((await r.json() as { nonce?: unknown }).nonce ?? ""); nonceAt = Date.now();
}
function loadSdk(): Promise<void> {
  if ((window as unknown as { EloSignIn?: Sdk }).EloSignIn) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = SDK; s.integrity = SDK_SRI; s.crossOrigin = "anonymous"; s.async = true;
    s.onload = () => ok(); s.onerror = () => fail(new Error("the Elo Pros sign-in script did not load"));
    document.head.appendChild(s);
  });
}

export const eloSignIn = {
  state,
  onChange(f: (s: EloState) => void) { listeners.push(f); f(state); },
  /** the ticket to hand the server on a connection (null: signed out) */
  ticket(): string | null { return mem && mem.exp * 1000 > Date.now() ? mem.ticket : null; },
  /** the server refused the ticket (restarted with a new key, or it ran out): signed out, sign in again */
  refused() { if (mem) { adopt(null); state.error = "Signed out: sign in again."; emit(); } },
  /** once at the title: is sign-in on here? then the script and a nonce, kept fresh (a nonce lasts ten minutes) */
  async init() {
    try {
      const r = await fetch(`${base}api/elo`, { cache: "no-store" });
      const j = r.ok ? await r.json() as { on?: boolean; game?: string } : {};
      if (!j.on || !j.game) return;
      game = j.game;
      await Promise.all([loadSdk(), freshNonce()]);
      state.on = true; emit();
      setInterval(() => { if (!state.busy) void freshNonce().catch(() => { /* next round */ }); }, 4 * 60_000);
    } catch { /* no server, or no sign-in here: the title just doesn't offer it */ }
  },
  /** from the click handler itself (a popup opened later is blocked) */
  async begin() {
    const sdk = (window as unknown as { EloSignIn?: Sdk }).EloSignIn;
    if (!state.on || state.busy || !sdk) return;
    state.busy = true; state.error = null; emit();
    const n = nonce;
    try {
      const { pass } = await sdk.popup({ game, nonce: n, callback: new URL(`${base}elo-callback.html`, location.href).href });
      const r = await fetch(`${base}api/elo/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pass }) });
      const j = await r.json() as { ok?: boolean; ticket?: string; account?: string; wallet?: string | null; exp?: number; error?: string };
      if (!r.ok || !j.ok || !j.ticket || !j.account || !j.exp) throw new Error(j.error || `sign-in ${r.status}`);
      adopt({ ticket: j.ticket, account: j.account, wallet: j.wallet ?? null, exp: j.exp });
    } catch (e) {
      const code = (e as { code?: string }).code;
      state.error = code === "cancelled" || code === "closed" || code === "replaced" ? null : code === "blocked" ? "Allow pop-ups for this site to sign in." : "Couldn't sign in. Try again.";
    } finally {
      state.busy = false; emit();
      // the nonce is spent either way
      if (nonceAt) void freshNonce().catch(() => { /* the next round */ });
    }
  },
  signOut() { adopt(null); },
};
