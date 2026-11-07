// Brand art for Meme Royale, drawn here and written to public/assets/ui/brand/: the lockup (title, lobby, loading,
// admin), the compact wordmark (settings), the badge (admin's small icon) and the shield hit / break icons (HUD).
// Text is set in Lilita One (SIL OFL 1.1, public/assets/ui/toon/lilita-one-latin.woff2), embedded in each file:
// an SVG drawn as an <img> loads no fonts of its own. Run: node tools/brand/logos.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "public/assets/ui/brand");
const font = fs.readFileSync(path.join(root, "public/assets/ui/toon/lilita-one-latin.woff2")).toString("base64");
const C = { saffron: "#FFD21A", saffronShade: "#F2B800", ivory: "#FFF8E7", navy: "#0E2A3D", ink: "#04101A", shield: "#3EC4FF", shieldDeep: "#1E9BE0" };
const face = `<style>@font-face{font-family:"MR Lilita";src:url(data:font/woff2;base64,${font}) format("woff2");}text{font-family:"MR Lilita",sans-serif;}</style>`;
const svg = (w, h, label, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}"><title>${label}</title>${body}</svg>\n`;
/** a word in a thick ink outline over a dropped shadow, centred on x */
const word = (text, x, y, size, fill, { spacing = 0, stroke = size * 0.07, shadow = size * 0.05 } = {}) =>
  `<text x="${x}" y="${y + shadow}" font-size="${size}" text-anchor="middle" letter-spacing="${spacing}" fill="${C.ink}" stroke="${C.ink}" stroke-width="${stroke * 2}" stroke-linejoin="round">${text}</text>` +
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" letter-spacing="${spacing}" fill="${fill}" stroke="${C.ink}" stroke-width="${stroke * 2}" stroke-linejoin="round" paint-order="stroke">${text}</text>`;

const lockup = (main, sub) => svg(1600, 596, "Meme Royale", face + word("MEME", 800, 372, 420, main) + word("ROYALE", 800, 548, 150, sub, { spacing: 46 }));
const wordmark = (fill) => svg(1600, 444, "Meme Royale", face + word("MEME", 800, 352, 400, fill));
// The badge: a grinning face in a saffron disc, ours.
const badge = svg(512, 455, "Meme Royale", `<g stroke="${C.ink}" stroke-width="22" stroke-linejoin="round" stroke-linecap="round">` +
  `<circle cx="256" cy="232" r="196" fill="${C.saffron}"/>` +
  `<path d="M150 178 q34 -40 68 0" fill="none"/><path d="M294 178 q34 -40 68 0" fill="none"/>` +
  `<path d="M120 250 q136 150 272 0 z" fill="${C.ivory}"/><path d="M190 304 q66 26 132 0" fill="none" stroke-width="12"/></g>`);
// Shield icons: a heater shield with a raised rim; the break splits it.
const shieldPath = "M12 1.5l9 3.2v6.1c0 5.8-3.8 10.1-9 11.7-5.2-1.6-9-5.9-9-11.7V4.7z";
const rim = "M12 4.2l6.4 2.3v4.4c0 4.2-2.7 7.4-6.4 8.7-3.7-1.3-6.4-4.5-6.4-8.7V6.5z";
const hit = svg(24, 24, "Shield hit", `<path fill="${C.shieldDeep}" stroke="${C.ink}" stroke-width="1.4" d="${shieldPath}"/><path fill="${C.shield}" d="${rim}"/>`).replace('width="24" height="24"', 'width="48" height="48"');
const brk = svg(24, 24, "Shield broken", `<g stroke="${C.ink}" stroke-width="1.4" stroke-linejoin="round"><path fill="${C.shieldDeep}" d="M12 1.5l-9 3.2v6.1c0 5.8 3.8 10.1 9 11.7l-1.2-4.6 2-3.4-2.4-3.3 2.1-3.6-1.6-4.2z" transform="translate(-1.3 0.4)"/><path fill="${C.shield}" d="M12 1.5l9 3.2v6.1c0 5.8-3.8 10.1-9 11.7l-1.2-4.6 2-3.4-2.4-3.3 2.1-3.6-1.6-4.2z" transform="translate(1.3 -0.4)"/></g>`).replace('width="24" height="24"', 'width="48" height="48"');

fs.mkdirSync(out, { recursive: true });
const files = {
  "meme-royale-lockup.svg": lockup(C.saffron, C.ivory),
  "meme-royale-lockup-navy.svg": lockup(C.navy, C.navy),
  "meme-wordmark-saffron.svg": wordmark(C.saffron),
  "meme-wordmark-ivory.svg": wordmark(C.ivory),
  "meme-badge.svg": badge,
  "shield-hit.svg": hit,
  "shield-break.svg": brk,
};
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(out, name), text);
fs.writeFileSync(path.join(out, "provenance.json"), JSON.stringify({
  source: "original: drawn by tools/brand/logos.mjs for Meme Royale",
  licence: "MIT (the repository's); the embedded Lilita One font is SIL OFL 1.1 (public/assets/ui/licenses/)",
}, null, 2) + "\n");
console.log(`wrote ${Object.keys(files).length} files to ${path.relative(root, out)}`);
