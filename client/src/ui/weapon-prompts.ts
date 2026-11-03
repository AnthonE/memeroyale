// The weapon prompts in Toon: the interact / loot card ("TAKE <name>", rarity · role, ammo, the
// slot it takes or replaces — or why it cannot), the "PICKED UP · X" toast and the use / reload pill under the
// crosshair. Toon: an outlined navy panel (a pill when it is one line), a yellow keycap for the action, the item's art on
// its rarity tile, the rarity as a text pill. DOM built once; touched only when a value changes.
import { CONSUMABLES, WEAPONS, type Rarity } from "../../../shared/world/map";
import { CONSUMABLE_DEFS, WEAPON_DEFS } from "../../../shared/sim/const";
import { MYTHICS } from "../../../shared/sim/mythic";
import type { HudState } from "./api";
import { addCss } from "./styles";
import { T } from "./toon";
import { itemIconUrl } from "./icons";
import { fitArt, injectWeaponTokens } from "./weapon-tokens";
import { bindingText, onLabelsChange } from "../settings/labels";
import type { BindAction } from "../settings/bindings";
import { setMoney } from "./bucks";
import { el, still, txt, type WeaponHudFrame } from "./hotbar";

/** the key the player has bound to `action` (primary unless `index`), as a prompt shows it */
const keyName = (action: BindAction, index = 0) => bindingText(action, index).toUpperCase();
/** the item a loot card names (its label reads the item's name from the same defs): name → icon id */
const ITEM_BY_NAME = new Map<string, string>([
  ...WEAPONS.map((w) => [WEAPON_DEFS[w].name, w] as [string, string]),
  ...CONSUMABLES.map((c) => [CONSUMABLE_DEFS[c].name, c] as [string, string]),
  ...MYTHICS.map((m) => [m.name, m.weapon] as [string, string]),
]);

const CSS = `
/* ---------- interact / loot card (under the crosshair) ---------- */
.kr-interact { position: absolute; left: 50%; top: calc(50% + ${T(88)}); transform: translateX(-50%); max-width: min(80vw, ${T(600)});
  display: flex; align-items: center; gap: ${T(14)}; padding: ${T(10)} ${T(24)} ${T(10)} ${T(10)};
  background: var(--kong-gradient-panel); border: var(--kong-outline-md) solid var(--kong-outline); border-radius: var(--kong-radius-tile);
  box-shadow: var(--kong-drop-card); color: var(--kong-text); font-family: var(--kong-font-ui); }
/* one line (open a chest, drive, revive, let go): an outlined pill */
.kr-interact.solo { border-radius: 999px; padding: ${T(8)} ${T(26)} ${T(8)} ${T(10)}; box-shadow: var(--kong-drop-tile); }
/* lower, so the Banana Stand's prompt clears the shopkeeper (he stands right under the crosshair) */
.kr-interact.low { top: calc(50% + ${T(196)}); }
/* the item on its rarity tile */
.kr-interact .tile { display: none; position: relative; flex: none; width: ${T(84)}; height: ${T(74)}; overflow: hidden;
  border: var(--kong-outline-sm) solid var(--kong-outline); border-radius: var(--kong-radius-button); box-shadow: var(--kong-drop-pill);
  background: radial-gradient(ellipse 70% 80% at 50% 40%, var(--r-hi) 0%, var(--r-mid) 45%, var(--r-lo) 100%); }
.kr-interact.art .tile { display: block; }
.kr-interact .tile img { position: absolute; left: ${T(5)}; top: ${T(5)}; width: calc(100% - ${T(10)}); height: calc(100% - ${T(10)}); object-fit: contain;
  filter: drop-shadow(0 ${T(3)} 0 var(--tn-weapons-art-drop)); }
/* the action's key: a yellow keycap (the hold ring runs round it) */
.kr-interact .key { position: relative; flex: none; display: flex; align-items: center; justify-content: center; height: ${T(40)}; min-width: ${T(40)}; padding: 0 ${T(9)};
  border-radius: var(--kong-radius-key); border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: var(--kong-drop-pill);
  background: var(--kong-accent); color: var(--kong-on-accent); font: 900 ${T(19)} / 1 var(--kong-font-ui); letter-spacing: .02em; white-space: nowrap; }
.kr-interact .key { overflow: hidden; }
.kr-interact .key span { position: relative; z-index: 1; }
.kr-interact .key .fill { position: absolute; inset: 0; transform-origin: left center; transform: scaleX(0); background: color-mix(in srgb, var(--kong-on-accent) 22%, transparent); }
.kr-interact .item-body { display: flex; flex-direction: column; gap: ${T(3)}; min-width: 0; }
.kr-interact .lb { font: 900 ${T(17)} / 1.25 var(--kong-font-ui); letter-spacing: .1em; text-transform: uppercase; color: var(--kong-text); }
.kr-interact .lb b { margin-left: ${T(2)}; font: 400 ${T(28)} / 1.05 var(--kong-font-display); letter-spacing: .01em; color: var(--kong-text);
  -webkit-text-stroke: var(--kong-outline-md) var(--kong-outline); paint-order: stroke fill; }
.kr-interact .detail, .kr-interact .ammo-detail, .kr-interact .change { font: 800 ${T(15)} / 1.35 var(--kong-font-ui); letter-spacing: .04em; color: var(--kong-text-muted); }
.kr-interact .detail:empty, .kr-interact .ammo-detail:empty, .kr-interact .change:empty { display: none; }
.kr-interact .detail .tn-weapons-rar { margin-right: ${T(8)}; padding: ${T(2)} ${T(9)}; font-size: ${T(11)}; vertical-align: ${T(1)}; }
.kr-interact .change { font-weight: 900; letter-spacing: .1em; color: var(--kong-text); }
.kr-interact.blocked .change { color: var(--kong-danger); }
.kr-interact.blocked .key { display: none; }

/* ---------- "PICKED UP · X": a Toon toast over the ammo readout ---------- */
.kr-pickup { position: absolute; right: ${T(44)}; bottom: ${T(282)}; display: inline-flex; align-items: center; gap: ${T(10)};
  padding: ${T(9)} ${T(20)} ${T(9)} ${T(20)}; border-radius: 999px; background: var(--kong-surface); border: var(--kong-outline-sm) solid var(--kong-outline);
  box-shadow: var(--kong-drop-pill), inset ${T(6)} 0 0 var(--kong-accent); color: var(--kong-text);
  font: 800 ${T(16)} / 1.2 var(--kong-font-ui); letter-spacing: .06em; white-space: nowrap; }

/* ---------- use / reload under the crosshair: an outlined pill (the key as a keycap, the seconds in yellow) ---------- */
.kr-using { position: absolute; left: 50%; top: calc(50% + ${T(42)}); transform: translateX(-50%); display: inline-flex; align-items: center; gap: ${T(8)};
  padding: ${T(5)} ${T(16)}; border-radius: 999px; background: var(--kong-surface); border: var(--kong-outline-sm) solid var(--kong-outline); box-shadow: var(--kong-drop-pill);
  font: 900 ${T(16)} / 1.3 var(--kong-font-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--kong-text); white-space: nowrap; }
.kr-using .tn-key { height: ${T(26)}; min-width: ${T(26)}; padding: 0 ${T(6)}; font-size: ${T(14)}; line-height: 1; box-shadow: 0 ${T(3)} 0 var(--kong-outline); letter-spacing: .02em; }
.kr-using small { font: 400 ${T(20)} / 1 var(--kong-font-display); letter-spacing: .02em; color: var(--kong-accent);
  -webkit-text-stroke: var(--kong-outline-sm) var(--kong-outline); paint-order: stroke fill; font-variant-numeric: tabular-nums; }
.kr-using.reload { color: var(--kong-warning); }
.kr-using.none { color: var(--kong-danger); }
`;

export function createWeaponPrompts(root: HTMLElement) {
  injectWeaponTokens();
  addCss("kr-ui-weapon-prompts", CSS);
  const interact = el("div", "kr-interact kr-hide", root);
  const tile = el("div", "tile", interact);
  const tileImg = el("img", "", tile); tileImg.alt = ""; tileImg.decoding = "async";
  const interactKey = el("div", "key", interact);
  const interactKeyTxt = el("span", "", interactKey);
  // hold-to-interact (HudState.interact.hold, 0..1): the keycap fills left → right
  const holdFill = el("i", "fill", interactKey); holdFill.style.display = "none";
  // the loot card: "TAKE <name>" + rarity · role, ammo type / reserve, which slot it takes or replaces (or why not)
  const interactBody = el("div", "item-body", interact);
  const interactLbl = el("div", "lb", interactBody);
  const interactDetail = el("div", "detail", interactBody), interactAmmo = el("div", "ammo-detail", interactBody), interactChange = el("div", "change", interactBody);
  const pickup = el("div", "kr-pickup kr-hide", root); let pickupAt = NaN, pickupStart = -9;
  const usingLbl = el("div", "kr-using kr-hide", root);
  const usingMain = el("span", "", usingLbl);
  const usingKey = el("kbd", "tn-key", usingLbl);
  const usingAfter = el("span", "", usingLbl);
  const usingSub = el("small", "", usingLbl);
  const last = { interact: "", interactOn: false, holdV: -2, using: "", usingOn: false };
  onLabelsChange(() => { last.interact = ""; last.using = ""; });

  function update(s: HudState, f: WeaponHudFrame) {
    const { alive, handsVisible, now } = f;
    // ---- interact prompt
    const it = s.interact;
    const itOn = !!it && alive && !s.scoped && !s.chuteReady;
    if (itOn !== last.interactOn) { last.interactOn = itOn; interact.classList.toggle("kr-hide", !itOn); }
    if (it && itOn) {
      const key = `${it.candidateId}|${it.key}|${it.label}|${it.rarity ?? ""}|${it.detail}|${it.ammo}|${it.change}|${it.blocked}|${it.act ?? ""}`;
      if (key !== last.interact) {
        last.interact = key;
        interactKeyTxt.textContent = keyName(it.act ?? "use");
        // "RARE · Close range": the rarity as its text pill, then the role
        const tier = it.rarity, det = it.detail ?? "", head = tier ? `${tier.toUpperCase()} · ` : "";
        if (tier && det.startsWith(head)) {
          interactDetail.textContent = "";
          const pill = el("span", "tn-weapons-rar tn-weapons-rar--tier", interactDetail); pill.textContent = tier; pill.dataset.rarity = tier;
          interactDetail.append(det.slice(head.length));
        } else setMoney(interactDetail, det);
        txt(interactAmmo, it.ammo ?? ""); txt(interactChange, it.blocked ?? it.change ?? "");
        interact.classList.toggle("blocked", !!it.blocked);
        interact.classList.toggle("low", !!it.low);
        const m = /^(OPEN|TAKE|SWAP FOR|SWAP|USE|PICK UP|REVIVE)\s+(.+)$/.exec(it.label);
        interactLbl.textContent = "";
        if (m) { interactLbl.append(`${m[1]} `); const b = document.createElement("b"); b.textContent = m[2]; interactLbl.appendChild(b); }
        else interactLbl.textContent = it.label;
        // a loot card shows the item on its rarity tile
        const icon = m && (m[1] === "TAKE" || m[1] === "SWAP FOR") ? ITEM_BY_NAME.get(m[2]) : undefined;
        interact.classList.toggle("art", !!icon);
        if (icon) { const src = itemIconUrl(icon); if (tileImg.getAttribute("src") !== src) { tileImg.src = src; fitArt(tileImg, 68 / 58); } tile.dataset.rarity = (tier ?? "common") as Rarity; }
        interact.classList.toggle("solo", !it.detail && !it.ammo && !(it.blocked ?? it.change) && !icon);
        if (!still()) interact.animate([{ opacity: 0, transform: `translateX(-50%) translateY(${T(6)}) scale(.94)` }, { opacity: 1, transform: "translateX(-50%)" }], { duration: 180, easing: "cubic-bezier(.34, 1.56, .64, 1)" });
      }
      const hv = it.hold === undefined ? -1 : Math.round(it.hold * 100) / 100;
      if (hv !== last.holdV) { last.holdV = hv; holdFill.style.display = hv < 0 ? "none" : ""; if (hv >= 0) holdFill.style.transform = `scaleX(${hv})`; }
    }

    if (s.pickup && s.pickup.at !== pickupAt) { pickupAt = s.pickup.at; pickupStart = now; setMoney(pickup, `PICKED UP · ${s.pickup.label}`); }
    pickup.classList.toggle("kr-hide", now - pickupStart > 1.5 || !handsVisible);

    // ---- use / reload pill: kind | text | key | after | seconds
    let useTxt = "";
    if (handsVisible && s.using) useTxt = `use|${s.using.label.toUpperCase()}|||${Math.max(0, s.using.total - s.using.t).toFixed(1)}S`;
    else if (handsVisible && s.reload) useTxt = "reload|RELOADING|||";
    else if (handsVisible && s.ammo && s.ammo.mag === 0 && s.ammo.reserve > 0) useTxt = `press|PRESS|${keyName("reload")}|TO RELOAD|`;
    else if (handsVisible && s.ammo && s.ammo.mag === 0 && s.ammo.reserve === 0) useTxt = "none|NO AMMO|||";
    const useOn = !!useTxt && !s.scoped;
    if (useOn !== last.usingOn) { last.usingOn = useOn; usingLbl.classList.toggle("kr-hide", !useOn); }
    if (useTxt !== last.using) {
      last.using = useTxt;
      const [kind = "", a = "", k = "", after = "", sub = ""] = useTxt.split("|");
      usingLbl.className = `kr-using ${kind}${useOn ? "" : " kr-hide"}`;
      txt(usingMain, a); txt(usingKey, k); txt(usingAfter, after); txt(usingSub, sub);
      usingKey.style.display = k ? "" : "none"; usingAfter.style.display = after ? "" : "none"; usingSub.style.display = sub ? "" : "none";
    }
  }

  return { interact, update };
}
