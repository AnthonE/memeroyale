// KONG ROYALE · Toon design system foundation.
// Every screen builds on these tokens and `tn-` primitives: no raw hex values,
// radii, outlines or shadows in screen code.
//
// Units: the design is authored on a 1920×1080 logical canvas. `T(n)` is n design px scaled to the viewport through
// `--tu` (menus: the 1920×1080 canvas fitted to the window; inside the HUD root `.kr-root`, the HUD's own unit, so the
// Accessibility → HUD size setting scales Toon HUD parts too). Size tokens are re-declared on every element that
// sets its own `--tu` (`:root`, `.kr-root`, `.kr-tu`) so they always resolve against the nearest canvas.
// (no import from styles.ts: it imports this module, and the logo table below is built at load time)
const uiAsset = (p: string) => `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/assets/ui/${p}`;

/** the Toon palette for code that paints (canvas) or computes colours; CSS uses the custom properties */
export const TOON = {
  bg: "#071422",
  surface: "#0E2A3D",
  surface2: "#12344B",
  surfaceRaised: "#17405A",
  rule: "#1D4763",
  ruleStrong: "#2A5C7C",
  outline: "#04101A",
  text: "#FFF8E7",
  textMuted: "#A9C6DA",
  textFaint: "#7FA3BC",
  accent: "#FFD21A",
  accentLight: "#FFE45C",
  accentShade: "#F2B800",
  onAccent: "#04101A",
  sky: "#4FB6EA",
  shield: "#3EC4FF",
  success: "#5BE37D",
  warning: "#FF9F1C",
  danger: "#FF4D5E",
  rarityCommon: "#4CC35A",
  rarityRare: "#2F8BFF",
  disabled: "#2A4152",
  disabledText: "#8FA8B8",
  focus: "#FFFFFF",
  display: "'Lilita One', 'Arial Black', Impact, sans-serif",
  ui: "'Nunito', 'Segoe UI', system-ui, sans-serif",
  spring: "cubic-bezier(.34, 1.56, .64, 1)",
} as const;

/** n design px (1920×1080 canvas) → a CSS length on the current Toon canvas */
export const T = (n: number) => `calc(${n} * var(--tu))`;

/** Toon logo / icon files (public/assets/ui/toon). Lockup on lobby + loading, compact wordmark in settings, brow icon
 *  under 160 px. These are auto-traced exports (TODO: replace with vector masters). */
export const TOON_LOGO = {
  lockup: uiAsset("toon/kong-royale-lockup.svg"),
  lockupNavy: uiAsset("toon/kong-royale-lockup-navy.svg"),
  wordmark: uiAsset("toon/kong-wordmark-saffron.svg"),
  wordmarkIvory: uiAsset("toon/kong-wordmark-ivory.svg"),
  brow: uiAsset("toon/kong-brow-icon.svg"),
  shieldHit: uiAsset("toon/kong-shield-hit.svg"),
  shieldBreak: uiAsset("toon/kong-shield-break.svg"),
} as const;

/** an ivory keycap (`accent`: yellow, `unbound`: red). Text must come from the real bindings (settings/labels.ts) */
export function keycap(text: string, variant: "" | "accent" | "unbound" = ""): HTMLElement {
  const k = document.createElement("kbd");
  k.className = "tn-key" + (variant ? ` tn-key--${variant}` : "");
  k.textContent = text || "—";
  if (!text || text === "—") k.classList.add("tn-key--unbound");
  return k;
}

const SIZE_TOKENS = `
  --kong-text-outline-lg: ${T(6)}; --kong-text-outline-md: ${T(5)}; --kong-text-outline-sm: ${T(4)}; --kong-text-outline-xs: ${T(3)};
  --kong-space-1: ${T(4)}; --kong-space-2: ${T(8)}; --kong-space-3: ${T(12)}; --kong-space-4: ${T(16)};
  --kong-space-6: ${T(24)}; --kong-space-8: ${T(32)}; --kong-space-12: ${T(48)}; --kong-space-16: ${T(64)};
  --kong-safe: ${T(48)};
  --kong-outline-xs: ${T(2)}; --kong-outline-sm: ${T(3)}; --kong-outline-md: ${T(4)};
  --kong-drop-pill: 0 ${T(4)} 0 var(--kong-outline);
  --kong-drop-tile: 0 ${T(5)} 0 var(--kong-outline);
  --kong-drop-button: 0 ${T(6)} 0 var(--kong-outline);
  --kong-drop-card: 0 ${T(7)} 0 var(--kong-outline);
  --kong-drop-dialog: 0 ${T(10)} 0 var(--kong-outline);
  --kong-drop-hover: 0 ${T(9)} 0 var(--kong-outline);
  --kong-drop-pressed: 0 ${T(1)} 0 var(--kong-outline);
  --kong-radius-key: ${T(9)}; --kong-radius-button: ${T(16)}; --kong-radius-tile: ${T(18)};
  --kong-radius-card: ${T(22)}; --kong-radius-panel: ${T(24)}; --kong-radius-dialog: ${T(26)};
  --kong-control-height: ${T(52)}; --kong-primary-height: ${T(64)};
  --kong-focus-width: ${T(4)}; --kong-focus-offset: ${T(3)};
  --kong-fs-lobby: ${T(110)}; --kong-lh-lobby: ${T(100)};
  --kong-fs-title: ${T(88)}; --kong-lh-title: ${T(92)};
  --kong-fs-heading: ${T(32)}; --kong-lh-heading: ${T(36)};
  --kong-fs-label: ${T(21)}; --kong-lh-label: ${T(28)};
  --kong-fs-body: ${T(19)}; --kong-lh-body: ${T(28)};
  --kong-fs-tab: ${T(17)}; --kong-lh-tab: ${T(22)};
  --kong-fs-support: ${T(16)}; --kong-lh-support: ${T(22)};
  --kong-fs-key: ${T(17)}; --kong-lh-key: ${T(20)};
  --kong-fs-hud: ${T(40)}; --kong-lh-hud: ${T(44)};
`;

const TOON_CSS = `
@font-face { font-family: 'Lilita One'; font-style: normal; font-weight: 400; font-display: block;
  src: url('${uiAsset("toon/lilita-one-latin.woff2")}') format('woff2'); }
@font-face { font-family: 'Nunito'; font-style: normal; font-weight: 200 1000; font-display: block;
  src: url('${uiAsset("toon/nunito-var-latin.woff2")}') format('woff2'); }

:root {
  --tu: min(calc(100vh / 1080), calc(100vw / 1920));
  --kong-bg: ${TOON.bg}; --kong-surface: ${TOON.surface}; --kong-surface-2: ${TOON.surface2}; --kong-surface-raised: ${TOON.surfaceRaised};
  --kong-rule: ${TOON.rule}; --kong-rule-strong: ${TOON.ruleStrong};
  --kong-outline: ${TOON.outline}; --kong-text: ${TOON.text}; --kong-text-muted: ${TOON.textMuted}; --kong-text-faint: ${TOON.textFaint};
  --kong-accent: ${TOON.accent}; --kong-accent-light: ${TOON.accentLight}; --kong-accent-shade: ${TOON.accentShade}; --kong-on-accent: ${TOON.onAccent};
  --kong-sky: ${TOON.sky}; --kong-shield: ${TOON.shield}; --kong-success: ${TOON.success}; --kong-warning: ${TOON.warning}; --kong-danger: ${TOON.danger};
  --kong-rarity-common: ${TOON.rarityCommon}; --kong-rarity-rare: ${TOON.rarityRare};
  --kong-disabled: ${TOON.disabled}; --kong-disabled-text: ${TOON.disabledText}; --kong-focus: ${TOON.focus};
  --kong-font-display: ${TOON.display}; --kong-font-ui: ${TOON.ui};
  --kong-gradient-primary: linear-gradient(180deg, #FFE45C 0%, #FFD21A 55%, #F2B800 100%);
  --kong-gradient-primary-hover: linear-gradient(180deg, #FFEA7A 0%, #FFD83A 55%, #F5C000 100%);
  --kong-gradient-secondary: linear-gradient(180deg, #24597B, #17405A);
  --kong-gradient-danger: linear-gradient(180deg, #FF7A86, #FF4D5E);
  --kong-gradient-health: linear-gradient(180deg, #FFE45C, #FFD21A 55%, #F2B800);
  --kong-gradient-shield: linear-gradient(180deg, #8FE0FF, #3EC4FF 55%, #1E9BE0);
  --kong-gradient-panel: linear-gradient(180deg, #12344B, #0E2A3D);
  --kong-gradient-common: radial-gradient(circle at 50% 45%, #8EEA7E 0%, #4CC35A 55%, #2C8A3A 100%);
  --kong-gradient-rare: radial-gradient(circle at 50% 45%, #7FC4FF 0%, #2F8BFF 55%, #1A5BC4 100%);
  --kong-scrim: rgba(4, 16, 26, 0.72);
  --kong-motion-fast: 120ms; --kong-motion-standard: 180ms; --kong-motion-slow: 240ms;
  --kong-ease-spring: ${TOON.spring}; --kong-ease-out: cubic-bezier(.2, .8, .2, 1);
}
:root, .kr-root, .kr-tu { ${SIZE_TOKENS} }
/* the HUD keeps its own unit (viewport height × HUD size, width-bounded; styles.ts) */
.kr-root { --tu: calc(var(--u) * 1440 / 1080); }
@media (prefers-reduced-motion: reduce) { :root { --kong-motion-fast: 0ms; --kong-motion-standard: 0ms; --kong-motion-slow: 0ms; --kong-ease-spring: ease-out; } }
/* the game's own Accessibility → Reduced motion */
html.kr-calm { --kong-motion-fast: 0ms; --kong-motion-standard: 0ms; --kong-motion-slow: 0ms; --kong-ease-spring: ease-out; }

/* ---------- type roles ---------- */
.tn-display, .tn-title, .tn-lobby-display, .tn-heading, .tn-hud-num {
  font-family: var(--kong-font-display); font-weight: 400; letter-spacing: .01em; color: var(--kong-text);
  -webkit-text-stroke: var(--kong-text-outline-sm) var(--kong-outline); paint-order: stroke fill; }
.tn-lobby-display { font-size: var(--kong-fs-lobby); line-height: var(--kong-lh-lobby); -webkit-text-stroke-width: var(--kong-text-outline-lg); text-shadow: 0 ${T(7)} 0 var(--kong-outline); }
.tn-title { font-size: var(--kong-fs-title); line-height: var(--kong-lh-title); -webkit-text-stroke-width: var(--kong-text-outline-md); text-shadow: 0 ${T(7)} 0 var(--kong-outline); }
.tn-heading { font-size: var(--kong-fs-heading); line-height: var(--kong-lh-heading); -webkit-text-stroke-width: var(--kong-text-outline-xs); }
.tn-hud-num { font-size: var(--kong-fs-hud); line-height: var(--kong-lh-hud); font-variant-numeric: tabular-nums; }
.tn-label { font-family: var(--kong-font-ui); font-weight: 800; font-size: var(--kong-fs-label); line-height: var(--kong-lh-label); color: var(--kong-text); }
.tn-body { font-family: var(--kong-font-ui); font-weight: 600; font-size: var(--kong-fs-body); line-height: var(--kong-lh-body); color: var(--kong-text-muted); }
.tn-support { font-family: var(--kong-font-ui); font-weight: 700; font-size: var(--kong-fs-support); line-height: var(--kong-lh-support); color: var(--kong-text-muted); }
.tn-eyebrow { font-family: var(--kong-font-ui); font-weight: 900; font-size: var(--kong-fs-support); line-height: var(--kong-lh-support);
  letter-spacing: .12em; text-transform: uppercase; color: var(--kong-text-muted); }
.tn-num { font-variant-numeric: tabular-nums; }

/* ---------- logo on dark surfaces: 3px outline + one hard 6px drop ---------- */
.tn-logo { display: block; height: auto; user-select: none; -webkit-user-drag: none;
  filter: drop-shadow(${T(3)} 0 0 var(--kong-outline)) drop-shadow(${T(-3)} 0 0 var(--kong-outline)) drop-shadow(0 ${T(3)} 0 var(--kong-outline))
    drop-shadow(0 ${T(-3)} 0 var(--kong-outline)) drop-shadow(0 ${T(6)} 0 var(--kong-outline)); }

/* ---------- focus: 4px white ring, 3px offset, keyboard + controller ---------- */
.tn-focusable:focus-visible, .tn-btn:focus-visible, .tn-pill:focus-visible, .tn-subtab:focus-visible, .tn-tile:focus-visible,
.tn-switch:focus-visible, .tn-seg button:focus-visible, .tn-cycle button:focus-visible, .tn-slider:focus-visible, .tn-focus {
  outline: var(--kong-focus-width) solid var(--kong-focus); outline-offset: var(--kong-focus-offset); }

/* ---------- button ---------- */
.tn-btn { appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: var(--kong-space-3);
  min-height: var(--kong-control-height); padding: 0 ${T(26)}; border-radius: var(--kong-radius-button);
  border: var(--kong-outline-md) solid var(--kong-outline); box-shadow: var(--kong-drop-button);
  background: var(--kong-gradient-secondary); color: var(--kong-text); cursor: pointer;
  font-family: var(--kong-font-ui); font-weight: 900; font-size: var(--kong-fs-tab); letter-spacing: .08em; text-transform: uppercase;
  transition: transform var(--kong-motion-fast) var(--kong-ease-spring), box-shadow var(--kong-motion-fast), background var(--kong-motion-fast); }
.tn-btn:hover { transform: translateY(${T(-3)}); box-shadow: var(--kong-drop-hover); }
.tn-btn:active, .tn-btn.is-pressed { transform: translateY(${T(5)}); box-shadow: var(--kong-drop-pressed); transition-duration: 60ms; }
.tn-btn--primary { background: var(--kong-gradient-primary); color: var(--kong-on-accent); min-height: var(--kong-primary-height); }
.tn-btn--primary:hover { background: var(--kong-gradient-primary-hover); }
.tn-btn--danger { background: var(--kong-gradient-danger); color: #fff; }
.tn-btn--tertiary { border-color: transparent; box-shadow: none; background: none; color: var(--kong-text-muted); }
.tn-btn--tertiary:hover { transform: none; box-shadow: none; color: var(--kong-text); }
.tn-btn--big { font-family: var(--kong-font-display); font-weight: 400; font-size: ${T(40)}; letter-spacing: .02em; text-transform: none;
  -webkit-text-stroke: 0; }
.tn-btn[disabled], .tn-btn.is-disabled { background: var(--kong-disabled); color: var(--kong-disabled-text); cursor: default; transform: none; box-shadow: var(--kong-drop-button); }
.tn-btn.is-error { border-color: var(--kong-danger); }

/* ---------- category tabs: outlined pills, active yellow ---------- */
.tn-pills { display: flex; flex-wrap: wrap; gap: ${T(10)}; }
.tn-pill { appearance: none; display: inline-flex; align-items: center; gap: var(--kong-space-2); padding: ${T(12)} ${T(24)};
  border-radius: 999px; border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: var(--kong-drop-pill);
  background: var(--kong-surface-2); color: #CFE2EE; cursor: pointer; white-space: nowrap;
  font-family: var(--kong-font-ui); font-weight: 900; font-size: var(--kong-fs-tab); line-height: var(--kong-lh-tab); letter-spacing: .08em; text-transform: uppercase;
  transition: transform var(--kong-motion-fast) var(--kong-ease-spring), background var(--kong-motion-fast), color var(--kong-motion-fast); }
.tn-pill:hover { background: var(--kong-surface-raised); color: var(--kong-text); transform: translateY(${T(-2)}); }
.tn-pill:active { transform: translateY(${T(3)}); box-shadow: var(--kong-drop-pressed); }
.tn-pill.is-on, .tn-pill[aria-selected="true"], .tn-pill[aria-pressed="true"] { background: var(--kong-accent); color: var(--kong-on-accent); }
.tn-pill[disabled] { background: var(--kong-disabled); color: var(--kong-disabled-text); cursor: default; transform: none; }
/* local section tabs: quiet text, the active one an ivory pill */
.tn-subtab { appearance: none; padding: ${T(8)} ${T(18)}; border-radius: 999px; border: var(--kong-outline-sm) solid transparent; background: none;
  color: var(--kong-text-muted); cursor: pointer; font-family: var(--kong-font-ui); font-weight: 900; font-size: var(--kong-fs-tab);
  line-height: var(--kong-lh-tab); letter-spacing: .1em; text-transform: uppercase; }
.tn-subtab:hover { color: var(--kong-text); }
.tn-subtab.is-on, .tn-subtab[aria-selected="true"] { background: var(--kong-text); color: var(--kong-outline); border-color: var(--kong-outline); box-shadow: 0 ${T(3)} 0 var(--kong-outline); }

/* ---------- keycap ---------- */
.tn-key { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; height: ${T(34)}; min-width: ${T(34)};
  padding: 0 ${T(8)}; border-radius: var(--kong-radius-key); border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: var(--kong-drop-pill);
  background: var(--kong-text); color: var(--kong-outline); font-family: var(--kong-font-ui); font-weight: 900; font-size: var(--kong-fs-key);
  line-height: var(--kong-lh-key); letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; font-style: normal; }
.tn-key--accent { background: var(--kong-accent); }
.tn-key--unbound { background: var(--kong-danger); color: #fff; }
.tn-key--big { height: ${T(70)}; min-width: ${T(70)}; border-width: var(--kong-outline-md); border-radius: ${T(14)}; box-shadow: 0 ${T(7)} 0 var(--kong-outline); font-size: ${T(26)}; }
.tn-hint { display: inline-flex; align-items: center; gap: ${T(10)}; font-family: var(--kong-font-ui); font-weight: 900; font-size: var(--kong-fs-tab);
  letter-spacing: .1em; text-transform: uppercase; color: var(--kong-text); }

/* ---------- surfaces ---------- */
.tn-panel { background: var(--kong-gradient-panel); border: var(--kong-outline-md) solid var(--kong-outline); border-radius: var(--kong-radius-panel);
  box-shadow: var(--kong-drop-card); color: var(--kong-text); }
.tn-dialog { background: var(--kong-gradient-panel); border: var(--kong-outline-md) solid var(--kong-outline); border-radius: var(--kong-radius-dialog);
  box-shadow: var(--kong-drop-dialog); color: var(--kong-text); animation: tn-pop var(--kong-motion-slow) var(--kong-ease-spring) both; }
@keyframes tn-pop { from { transform: scale(.9); opacity: 0; } to { transform: none; opacity: 1; } }
html.kr-calm .tn-dialog { animation: none; }
.tn-tile { background: rgba(14, 42, 61, .92); border: var(--kong-outline-sm) solid var(--kong-outline); border-radius: var(--kong-radius-tile);
  box-shadow: var(--kong-drop-tile); color: var(--kong-text); transition: background var(--kong-motion-fast), border-color var(--kong-motion-fast); }
.tn-tile:hover { background: var(--kong-surface-2); }
.tn-tile.is-sel { background: var(--kong-surface-raised); border-color: var(--kong-accent); box-shadow: var(--kong-drop-tile), 0 0 0 var(--kong-outline-sm) var(--kong-outline); }
.tn-tile.is-error { border-color: var(--kong-danger); }
.tn-tile.is-disabled { opacity: 1; color: var(--kong-disabled-text); }
.tn-chip { display: inline-flex; align-items: center; gap: ${T(8)}; padding: ${T(6)} ${T(14)}; border-radius: 999px;
  background: rgba(14, 42, 61, .88); border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: var(--kong-drop-pill); color: var(--kong-text);
  font-family: var(--kong-font-ui); font-weight: 900; font-size: var(--kong-fs-support); }
.tn-badge { display: inline-flex; align-items: center; padding: ${T(3)} ${T(10)}; border-radius: 999px; border: var(--kong-outline-xs) solid var(--kong-outline);
  background: var(--kong-text); color: var(--kong-outline); font-family: var(--kong-font-ui); font-weight: 900; font-size: ${T(12)}; letter-spacing: .1em; text-transform: uppercase; }
.tn-badge--accent { background: var(--kong-accent); }
.tn-toast { display: inline-flex; align-items: center; gap: ${T(10)}; padding: ${T(10)} ${T(20)} ${T(10)} ${T(16)}; border-radius: 999px;
  background: var(--kong-surface); border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: var(--kong-drop-pill), inset ${T(6)} 0 0 var(--kong-accent);
  color: var(--kong-text); font-family: var(--kong-font-ui); font-weight: 800; font-size: var(--kong-fs-support); }
.tn-scrim { background: var(--kong-scrim); }

/* ---------- slider: 14px track, yellow gradient fill, 30px ivory thumb ---------- */
.tn-slider { position: relative; height: ${T(30)}; cursor: pointer; touch-action: none; }
.tn-slider .track { position: absolute; left: 0; right: 0; top: 50%; height: ${T(14)}; margin-top: ${T(-7)}; border-radius: 999px;
  background: var(--kong-outline); box-shadow: inset 0 0 0 ${T(2)} var(--kong-rule); }
.tn-slider .fill { position: absolute; left: 0; top: 50%; height: ${T(14)}; margin-top: ${T(-7)}; border-radius: 999px;
  background: linear-gradient(180deg, var(--kong-accent-light), var(--kong-accent-shade)); box-shadow: inset 0 0 0 ${T(2)} var(--kong-outline); }
.tn-slider .thumb { position: absolute; top: 50%; width: ${T(30)}; height: ${T(30)}; margin: ${T(-15)} 0 0 ${T(-15)}; border-radius: 50%;
  background: var(--kong-text); border: var(--kong-outline-md) solid var(--kong-outline); box-shadow: var(--kong-drop-pill); box-sizing: border-box;
  transition: transform var(--kong-motion-fast) var(--kong-ease-spring); }
.tn-slider:hover .thumb, .tn-slider:focus-visible .thumb { transform: scale(1.12); }
.tn-slider[aria-disabled="true"] .fill { background: var(--kong-disabled); }

/* ---------- switch: outlined pill, green when on, explicit On/Off text ---------- */
.tn-switch { appearance: none; display: inline-flex; align-items: center; gap: ${T(12)}; background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--kong-text); font-family: var(--kong-font-ui); font-weight: 900; font-size: var(--kong-fs-label); }
.tn-switch .sw { position: relative; width: ${T(64)}; height: ${T(36)}; border-radius: 999px; border: var(--kong-outline-sm) solid var(--kong-outline);
  background: var(--kong-disabled); box-shadow: 0 ${T(3)} 0 var(--kong-outline); box-sizing: border-box; transition: background var(--kong-motion-fast); }
.tn-switch .sw::after { content: ""; position: absolute; top: ${T(3)}; left: ${T(3)}; width: ${T(24)}; height: ${T(24)}; border-radius: 50%;
  background: var(--kong-text); border: var(--kong-outline-sm) solid var(--kong-outline); box-sizing: border-box;
  transition: transform var(--kong-motion-standard) var(--kong-ease-spring); }
.tn-switch[aria-checked="true"] .sw { background: var(--kong-success); }
.tn-switch[aria-checked="true"] .sw::after { transform: translateX(${T(28)}); }

/* ---------- segmented choice: dark pill track, yellow active pill ---------- */
.tn-seg { display: inline-flex; gap: ${T(4)}; padding: ${T(4)}; border-radius: 999px; background: var(--kong-outline); border: var(--kong-outline-sm) solid var(--kong-outline); }
.tn-seg button { appearance: none; border: 0; border-radius: 999px; padding: ${T(8)} ${T(16)}; background: none; color: var(--kong-text-muted); cursor: pointer;
  font-family: var(--kong-font-ui); font-weight: 800; font-size: var(--kong-fs-support); transition: background var(--kong-motion-fast) var(--kong-ease-spring); }
.tn-seg button:hover { color: var(--kong-text); }
.tn-seg button.is-on, .tn-seg button[aria-pressed="true"] { background: var(--kong-accent); color: var(--kong-on-accent); }

/* ---------- cycle: ‹ value › with round outlined arrows ---------- */
.tn-cycle { display: inline-flex; align-items: center; gap: ${T(16)}; }
.tn-cycle button { appearance: none; width: ${T(40)}; height: ${T(40)}; border-radius: 50%; background: var(--kong-surface-2);
  border: var(--kong-outline-sm) solid var(--kong-outline); color: var(--kong-text); cursor: pointer; font: 900 ${T(18)} var(--kong-font-ui); }
.tn-cycle button:hover { background: var(--kong-surface-raised); }
.tn-cycle .v { min-width: ${T(120)}; text-align: center; font-family: var(--kong-font-ui); font-weight: 900; font-size: var(--kong-fs-label); }
`;

let mounted = false;
/** inject the Toon fonts, tokens and primitives once (styles.ts injectStyles() calls this) */
export function injectToon(): void {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  const s = document.createElement("style");
  s.id = "kr-toon";
  s.textContent = TOON_CSS;
  document.head.prepend(s);
}

/** resolves when the Toon webfonts are usable (canvas painters wait for this) */
export function toonFontsReady(): Promise<void> {
  injectToon();
  const f = document.fonts;
  if (!f) return Promise.resolve();
  return Promise.all([f.load(`400 40px 'Lilita One'`), f.load(`900 40px 'Nunito'`), f.load(`800 40px 'Nunito'`), f.load(`700 40px 'Nunito'`)])
    .then(() => undefined, () => undefined);
}
