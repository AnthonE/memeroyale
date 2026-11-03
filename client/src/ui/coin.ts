// The BANANA BUCKS coin: the glyph money wears everywhere (ui/bucks.ts for the HTML helpers). No imports:
// ui/styles.ts uses it in its own stylesheet.
/** the coin: gold face, darker rim + inner ring, a ripe banana embossed in dark brown, a highlight (32 × 32) */
export const COIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>`
  + `<circle cx='16' cy='16' r='15.4' fill='#a86a06'/><circle cx='16' cy='16' r='13.9' fill='#ffd21f'/>`
  + `<circle cx='16' cy='16' r='11.6' fill='none' stroke='#e5a10c' stroke-width='1.4'/>`
  + `<path d='${"M22.4 9.2C25 16.6 19.6 24.3 10.4 23.4C9 23.3 8.2 22.2 8.9 21.5C15.3 20.6 19.8 15.6 19.9 9.7Z"}' fill='#6b3d06'/>`
  + `<path d='M19.6 10.3L20.9 7.1L22.9 7.6L22.4 10.4Z' fill='#6b3d06'/>`
  + `<path d='M7.6 11.2A9.6 9.6 0 0 1 14.6 6.5' stroke='#fff7c2' stroke-width='1.7' fill='none' stroke-linecap='round'/></svg>`;
export const COIN_URL = `url("data:image/svg+xml,${encodeURIComponent(COIN_SVG)}")`;
/** the banana's outline in the coin's 32-unit frame (canvas: new Path2D(BANANA_PATH)) */
export const BANANA_PATH = "M22.4 9.2C25 16.6 19.6 24.3 10.4 23.4C9 23.3 8.2 22.2 8.9 21.5C15.3 20.6 19.8 15.6 19.9 9.7Z M19.6 10.3L20.9 7.1L22.9 7.6L22.4 10.4Z";

/** the coin on a 2D canvas (map markers), centred on (x, y), radius r */
export function drawCoin(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const k = r / 16;
  g.save(); g.translate(x - 16 * k, y - 16 * k); g.scale(k, k);
  g.fillStyle = "#a86a06"; g.beginPath(); g.arc(16, 16, 15.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffd21f"; g.beginPath(); g.arc(16, 16, 13.9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#e5a10c"; g.lineWidth = 1.4; g.beginPath(); g.arc(16, 16, 11.6, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#6b3d06"; g.fill(new Path2D(BANANA_PATH));
  g.restore();
}
