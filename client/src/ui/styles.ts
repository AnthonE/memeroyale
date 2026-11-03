// Shared UI design tokens + injected stylesheets. Everything is sized in `--u` (= 1 px at 2560×1440) so the HUD
// scales with the viewport height (the layout is authored at 2560×1440).
// Only transform / opacity are animated at runtime; every layout value below is static.
import { preferences } from "../settings/preferences";
import { COIN_URL } from "./coin";
import { injectToon, toonFontsReady } from "./toon";
export const BASE_URL = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
export const uiAsset = (p: string) => `${BASE_URL}/assets/ui/${p}`;

export const UI = {
  yellow: "#ffd400",
  yellowSel: "#f2c530",
  gold: "#e0b21e",
  cream: "#f6efc6",
  creamText: "#fbf3c9",
  creamNum: "#faf3b2",
  creamDim: "rgba(246,239,198,0.55)",
  /** yellow health; shield is blue (cream read as grey / yellow) */
  hp: "#ffd400",
  shield: "#2ea8ff",
  /** the shield readout's number (a light blue that holds on the dark panel) */
  shieldNum: "#bfe6ff",
  shieldBlue: "#6fd0ff",
  navy: "rgba(14,42,62,0.8)",
  navy60: "rgba(14,42,62,0.6)",
  pillBg: "rgba(18,50,76,0.62)",
  ink: "#0e2a3e",
  inkDark: "#15110a",
  dark: "rgba(10,12,6,0.8)",
  coral: "#ff5f57",
  red: "#ff3b30",
  purple: "#8a4dff",
  sans: "'KR Sans', Roboto, 'Helvetica Neue', Arial, sans-serif",
  cond: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
  block: "'KR Block', 'Arial Black', Impact, sans-serif",
} as const;
/** the deep end of each rarity's slot gradient (RARITY_COLOR is the bright end): a hotbar / inventory slot
 *  wears its rarity all over — grey, green, blue, purple, orange-gold, mythic pink-red. (a mythic wears the MYTHIC
 *  tier's colour like any tier — its own signature colour made STALACTITE read common and the GOLDEN IDOL legendary; the
 *  signature colour is only a small gem on it) */
export const RARITY_DEEP: Record<string, string> = { common: "#3f454d", uncommon: "#145a26", rare: "#123f80", epic: "#43167a", legendary: "#8a3f06", mythic: "#6e0a30" };

const u = (n: number) => `calc(${n} * var(--u))`;
export { u as U };

const injectedIds = new Set<string>();
/** inject a stylesheet once (id-keyed) */
export function addCss(id: string, text: string): void {
  if (injectedIds.has(id) || document.getElementById(id)) { injectedIds.add(id); return; }
  injectedIds.add(id);
  const s = document.createElement("style");
  s.id = id;
  s.textContent = text;
  document.head.appendChild(s);
}

/** HUD width floor (u): below it the 2560-wide layout would collide (vitals 39..656 meet the hotbar's 784 u at
 *  1475 u), so only there does the width bound the HUD unit — never at 16:9 / 16:10 / 21:9 with the default HUD size */
export const HUD_MIN_W = 1500;
/** the HUD's px per u: viewport height (1 u = 1 px at 1440 p) × SETTINGS → ACCESSIBILITY → HUD size, width-bounded */
export const hudUnit = (w: number, h: number, scale: number) => Math.min(h / 1440 * scale, w / HUD_MIN_W);

let preferenceStylesMounted = false;
export function injectStyles(): void {
  // HUD size: one custom property on the document (the HUD and the inventory read it)
  // reduced motion as a class too: CSS-only motion (the hotbar's grow, the mythic sheen, medals) stands still
  if (!preferenceStylesMounted) { preferenceStylesMounted = true; preferences.subscribe((p) => { document.documentElement.style.setProperty("--hud-scale", String(p.hudScale)); document.documentElement.classList.toggle("kr-calm", p.reducedMotion); }); }
  injectToon();
  addCss("kr-ui-base", BASE_CSS);
  addCss("kr-ui-hud", HUD_CSS);
}

/** resolves when the UI webfonts are usable (canvas painters wait for this before painting text) */
export function fontsReady(): Promise<void> {
  injectStyles();
  const f = document.fonts;
  if (!f) return Promise.resolve();
  return Promise.all([
    f.load(`800 40px 'KR Sans'`), f.load(`700 40px 'KR Sans'`), f.load(`800 40px 'Barlow Condensed'`),
    f.load(`700 40px 'Barlow Condensed'`), f.load(`900 40px 'KR Block'`), toonFontsReady(),
  ]).then(() => undefined, () => undefined);
}

const BASE_CSS = `
@font-face { font-family: 'KR Sans'; font-style: normal; font-weight: 100 900; font-display: block;
  src: url('${uiAsset("roboto-var-latin.woff2")}') format('woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-style: normal; font-weight: 700; font-display: block;
  src: url('${uiAsset("barlow-condensed-700.woff2")}') format('woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-style: normal; font-weight: 800; font-display: block;
  src: url('${uiAsset("barlow-condensed-800.woff2")}') format('woff2'); }
@font-face { font-family: 'KR Block'; font-style: normal; font-weight: 300 900; font-display: block;
  src: url('${uiAsset("rubik-var-latin.woff2")}') format('woff2'); }
.kr-lobby, .kr-results, .kr-mapv { --u: calc(100vh / 1440); }
.kr-root { --u: min(calc(100vh / 1440 * var(--hud-scale, 1)), calc(100vw / ${HUD_MIN_W})); }
.kr-hide { display: none !important; }
.kr-root *, .kr-lobby *, .kr-results * { box-sizing: border-box; }
`;

const HUD_CSS = `
.kr-root {
  position: absolute; inset: 0; overflow: hidden; contain: strict;
  font-family: ${UI.sans}; font-weight: 700; color: ${UI.creamText};
  pointer-events: none; user-select: none; -webkit-user-select: none;
  -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision;
  font-variant-numeric: tabular-nums;
}
.kr-root canvas { display: block; }

/* (Toon) feedback layers, minimap, mode label, compass, storm clock, status line, health / shield, squad: ui/hud-css.ts */

/* (economy) the wallet (over the health bars), the bounty card + the hunted banner (under the storm pill) */
.kr-cash { position: absolute; left: ${u(39)}; bottom: ${u(209)}; height: ${u(52)}; display: flex; align-items: center; gap: ${u(10)}; padding: 0 ${u(16)} 0 ${u(12)};
  background: ${UI.dark}; border: ${u(1.6)} solid rgba(226,192,26,0.78); border-radius: ${u(7)}; box-shadow: 0 ${u(4)} ${u(14)} rgba(0,0,0,0.25); }
.kr-cash::before { content: ""; display: block; width: ${u(36)}; height: ${u(36)}; background: ${COIN_URL} center / contain no-repeat; filter: drop-shadow(0 ${u(2)} ${u(2)} rgba(0,0,0,0.45)); }
.kr-cash .v { font: 800 ${u(34)} 'Barlow Condensed', sans-serif; color: ${UI.creamText}; letter-spacing: .02em; }
.kr-cash .g { position: absolute; left: 100%; margin-left: ${u(10)}; font: 900 ${u(30)} 'Barlow Condensed', sans-serif; font-style: normal; color: #7dff6a; text-shadow: 0 ${u(2)} ${u(3)} rgba(0,0,0,0.7); opacity: 0; white-space: nowrap; }
.kr-cash .g.pop { animation: krCashPop 1.5s ease-out; }
@keyframes krCashPop { 0% { opacity: 0; transform: translateY(${u(10)}); } 12% { opacity: 1; transform: none; } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(${u(-18)}); } }
.kr-bountycard { position: absolute; left: 50%; transform: translateX(-50%); top: ${u(246)}; min-width: ${u(420)}; text-align: center; padding: ${u(8)} ${u(22)}; border-radius: ${u(6)};
  background: linear-gradient(90deg, rgba(150,20,14,0.92), rgba(60,10,8,0.88)); border: ${u(2)} solid #ff6a52; box-shadow: 0 0 ${u(18)} rgba(255,59,48,0.45); }
.kr-bountycard .t { font: 900 ${u(26)} 'Barlow Condensed', sans-serif; letter-spacing: .04em; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kr-bountycard .s { font: 700 ${u(15)} ${UI.sans}; letter-spacing: .06em; color: #ffd2c8; margin-top: ${u(2)}; }
.kr-hunted { position: absolute; left: 50%; top: ${u(326)}; transform: translateX(-50%); padding: ${u(10)} ${u(28)}; border-radius: ${u(6)}; white-space: nowrap;
  font: 900 ${u(34)} 'Barlow Condensed', sans-serif; letter-spacing: .08em; color: #fff; background: rgba(170,18,12,0.9); border: ${u(2)} solid #ff8a76;
  box-shadow: 0 0 ${u(24)} rgba(255,59,48,0.6); animation: krHunted 1.2s ease-in-out infinite; }
@keyframes krHunted { 50% { box-shadow: 0 0 ${u(40)} rgba(255,59,48,0.95); } }

/* (Toon) squadmate tags, kill feed, announcements, location / radio banners, elimination: ui/hud-css.ts */

/* (Toon) vehicle HUD, altimeter, flight keys, chute, redeploy / spectate, diagnostics, hit numbers, scope: ui/hud-css.ts */
/* (Toon) interact prompt / loot card, pickup toast, use / reload label: ui/weapon-prompts.ts */
`;
