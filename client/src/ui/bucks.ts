// BANANA BUCKS — the banana coin that stands for money everywhere the game shows it:
// the HUD wallet chip and its +gain pop, the Banana Stand menu, the stand prompt, pickups, the bounty
// texts and announcements, the map's stand markers. Game strings keep "$" only as the MONEY MARK ("$1,500" in
// shared/sim/economy.ts, game/render.ts); moneyHtml() draws it as the coin + 1,500 wherever it reaches the screen.
import { addCss } from "./styles";

export { COIN_SVG, COIN_URL, BANANA_PATH, drawCoin } from "./coin";
import { COIN_URL } from "./coin";

const CSS = `.kr-bb { display: inline-block; width: 0.92em; height: 0.92em; margin: 0 0.1em 0 0.02em; vertical-align: -0.14em;
  background: ${COIN_URL} center / contain no-repeat; font-style: normal; flex: none; }`;
let styled = false;
export function injectBucksCss() { if (!styled) { styled = true; addCss("kr-ui-bucks", CSS); } }

/** the coin as inline HTML (sized by the surrounding font) */
export const coinHtml = () => `<i class="kr-bb" role="img" aria-label="Banana Bucks"></i>`;
/** an amount: the coin + 1,500 */
export const bucksHtml = (n: number) => `${coinHtml()}${Math.round(n).toLocaleString("en-US")}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** a game string as HTML: escaped, every money mark "$1,500" / "+$500" drawn as the coin */
export function moneyHtml(text: string) { return esc(text).replace(/(\+?)\$(\d[\d,]*)/g, (_m, plus: string, n: string) => `${plus}${coinHtml()}${n}`); }
/** set an element's text with the money marks as coins (only touches the DOM when the text changed) */
export function setMoney(el: HTMLElement, text: string) {
  injectBucksCss();
  if (el.dataset.money === text) return;
  el.dataset.money = text;
  if (text.includes("$")) el.innerHTML = moneyHtml(text); else el.textContent = text;
}
