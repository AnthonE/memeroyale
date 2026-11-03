// Weapon Toon tokens (hoist candidates for toon.ts): the rarity tile every weapon slot, inventory card and loot
// card paints its item on, for all six of the game's real tiers. The Toon design only defines two tiles: its green
// "common" and blue "rare". The game's
// tiers keep their real meaning and hue (shared/world/map.ts RARITY_COLOR: grey common, green uncommon, blue rare,
// purple epic, orange legendary, pink-red mythic), so green uses the design's green stops and blue its blue stops;
// the other four follow the same light → mid → deep recipe.
//
// Use: put `data-rarity="<tier>"` (or the class `tn-weapons-r-<tier>`) on an element and paint it with `.tn-weapons-tile`
// (or read --r-hi / --r-mid / --r-lo yourself). The weapon swap timing lives here too (it zeroes under reduced motion
// with the motion tokens it is built from).
import type { Rarity } from "../../../shared/world/map";
import { addCss } from "./styles";

/** light → mid → deep stops of each tier's tile (mid is the tier's hue) */
export const RARITY_TILE: Record<Rarity, readonly [hi: string, mid: string, lo: string]> = {
  common: ["#E3E8EE", "#A9B3BE", "#5F6A76"],
  uncommon: ["#8BE08F", "#4CC35A", "#2C8A3A"],
  rare: ["#7FB8FF", "#2F8BFF", "#1A56B8"],
  epic: ["#D6A6FF", "#A35BF2", "#5E26A8"],
  legendary: ["#FFD98A", "#FFA62B", "#B85A0A"],
  mythic: ["#FF9DBB", "#FF2F6D", "#9A0E46"],
};

const tierVars = (Object.keys(RARITY_TILE) as Rarity[]).map((r) => {
  const [hi, mid, lo] = RARITY_TILE[r];
  return `[data-rarity="${r}"], .tn-weapons-r-${r} { --r-hi: ${hi}; --r-mid: ${mid}; --r-lo: ${lo}; }`;
}).join("\n");

const CSS = `
:root {
  /* the equipped slot's lift + the readout pop: the Toon design's 160 ms spring (zeroes with the motion tokens) */
  --tn-weapons-swap: calc(var(--kong-motion-slow) * 2 / 3);
  --tn-weapons-glow: color-mix(in srgb, var(--kong-accent) 70%, transparent);
  --tn-weapons-glow-soft: color-mix(in srgb, var(--kong-accent) 55%, transparent);
  --tn-weapons-art-drop: color-mix(in srgb, var(--kong-outline) 55%, transparent);
  --tn-weapons-quiet: color-mix(in srgb, var(--kong-surface) 88%, transparent);
  --tn-weapons-hollow: color-mix(in srgb, var(--kong-outline) 50%, transparent);
}
${tierVars}
/* a rarity tile: the Toon design's radial gradient (ellipse 70% × 80% at 50% 40%) */
.tn-weapons-tile { background: radial-gradient(ellipse 70% 80% at 50% 40%, var(--r-hi) 0%, var(--r-mid) 45%, var(--r-lo) 100%); }
/* a rarity text label: a small outlined ivory pill (the Toon design's card label, on the tile); --tier fills it with the
   tier's colour where it sits on navy */
.tn-weapons-rar { display: inline-flex; align-items: center; border-radius: 999px; border: var(--kong-outline-sm) solid var(--kong-outline);
  background: var(--kong-text); color: var(--kong-outline); font-family: var(--kong-font-ui); font-weight: 900;
  letter-spacing: .16em; text-transform: uppercase; line-height: 1; white-space: nowrap; }
.tn-weapons-rar--tier { background: var(--r-hi, var(--kong-text)); }
/* the Toon 2 px dark outline around small HUD icons (the spec's hit icons; the slot badges) */
.tn-weapons-icon-outline { filter: drop-shadow(var(--kong-outline-xs) 0 0 var(--kong-outline)) drop-shadow(calc(-1 * var(--kong-outline-xs)) 0 0 var(--kong-outline))
  drop-shadow(0 var(--kong-outline-xs) 0 var(--kong-outline)) drop-shadow(0 calc(-1 * var(--kong-outline-xs)) 0 var(--kong-outline)); }
`;

let injected = false;
export function injectWeaponTokens(): void { if (!injected) { injected = true; addCss("kr-ui-weapon-tokens", CSS); } }

// ---------------------------------------------------------------- item art fit
// The item renders (public/assets/ui/icons/*.webp, or the game's own icon renderer) are square with transparent margins;
// the design crops art to the item. fitArt() scales an <img> (object-fit: contain in a box of the given
// aspect) so the item's opaque bounds fill the box — measured once per image from its alpha, applied
// as a transform (no layout).
const bounds = new Map<string, [number, number, number, number] | null>();
function measure(img: HTMLImageElement): [number, number, number, number] | null {
  const N = 64, c = document.createElement("canvas"); c.width = N; c.height = N;
  const g = c.getContext("2d", { willReadFrequently: true }); if (!g) return null;
  try { g.drawImage(img, 0, 0, N, N); } catch { return null; }
  const a = g.getImageData(0, 0, N, N).data;
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (a[(y * N + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0 / N, y0 / N, (x1 + 1 - x0) / N, (y1 + 1 - y0) / N];
}
/** fit `img`'s opaque bounds to its box (`aspect` = box width / height; `fill` = share of the box the item may take) */
export function fitArt(img: HTMLImageElement, aspect: number, fill = 0.96) {
  const apply = () => {
    const src = img.currentSrc || img.src;
    let b = bounds.get(src);
    if (b === undefined) { b = img.naturalWidth ? measure(img) : null; if (img.naturalWidth) bounds.set(src, b); }
    if (!b || !img.naturalWidth) { img.style.transform = ""; return; }
    // the image as `contain` draws it: d × d' inside the box (in box-height units)
    const ia = img.naturalWidth / img.naturalHeight, dw = Math.min(aspect, ia), dh = dw / ia;
    const [bx, by, bw, bh] = b, cw = bw * dw, ch = bh * dh;
    const s = Math.min(aspect / cw, 1 / ch) * fill;
    const ox = (0.5 - (bx + bw / 2)) * dw * s, oy = (0.5 - (by + bh / 2)) * dh * s;   // box-height units
    img.style.transform = `translate(${(ox / aspect * 100).toFixed(2)}%, ${(oy * 100).toFixed(2)}%) scale(${s.toFixed(3)})`;
  };
  if (img.complete && img.naturalWidth) apply(); else img.addEventListener("load", apply, { once: true });
}
