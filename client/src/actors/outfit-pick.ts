// Kong variety: which hat / top / shorts
// a kong wears this match. Pure and deterministic — every client derives the same look for a player from its id and the
// match seed (the "match" message), so nothing goes over the wire. outfits.ts holds the meshes, kong.ts draws them.
import type { KongOutfit } from "./api";

const SET_SHORTS = ["#1c9c9a", "#e3b21c", "#3d4a2a"];        // the char-01 squad's sets: teal / work yellow / olive
const MORE_SHORTS = ["#2b4f8c", "#6b4a2e", "#1c9c9a", "#3d4a2a"];
/** deterministic per (player id, match seed) — the same look for a player on every client for the whole match: ~65 %
 *  wear a hat, ~55 % a top; the shorts follow the top's set (or stay brick red); bare kongs sometimes swap shorts */
export function outfitFor(id: number, seed: number): KongOutfit {
  let h = Math.imul((id + 1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((seed | 0) + 0x6d2b79f5, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  const r = (k: number) => ((h >>> (k * 8)) & 255) / 256;
  const hat = r(0) < 0.35 ? -1 : Math.min(2, Math.floor(r(1) * 3));
  const top = r(2) < 0.45 ? -1 : Math.min(2, Math.floor(r(3) * 3));
  let h2 = Math.imul(h ^ 0x27d4eb2d, 0x165667b1); h2 ^= h2 >>> 15;
  const r2 = ((h2 >>> 4) & 255) / 256, r3 = ((h2 >>> 12) & 255) / 256;
  const shorts = top >= 0 ? (r2 < 0.7 ? SET_SHORTS[top] : null) : r2 < 0.25 ? MORE_SHORTS[Math.min(3, Math.floor(r3 * 4))] : null;
  return { hat, top, shorts };
}
