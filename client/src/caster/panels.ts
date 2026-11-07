// The desk's extra panels: the LEADERBOARD (a tab next to the live fights), the PLAYER POPOVER (hover a kong on the
// roster or the board: its whole loadout, reserves, stats), the PING card (another seat says "look at this!"), and the
// MATCH RESULTS card (the 14 s results phase — on the desk AND on the broadcast; the last one also stays on the caster
// lobby card until the next match). Shared helpers: weapon icons for the feeds, the loadout row.
import { CONSUMABLES, RARITIES, RARITY_COLOR, WEAPONS } from "../../../shared/world/map";
import { CONSUMABLE_DEFS, WEAPON_DEFS } from "../../../shared/sim/const";
import { SK } from "../../../shared/sim/player";
import { itemIconUrl } from "../ui/icons";
import type { CasterState, CPlayer } from "./state";
import { teamLook } from "./teams";

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** the icon of a kill's weapon byte (null: the storm, a vehicle, the fall — the caller writes the name) */
export function weaponIcon(weapon: number): string | null {
  if (weapon === 252) return itemIconUrl("banana-bomb");
  const w = WEAPONS[weapon]; return w && weapon < WEAPONS.length ? itemIconUrl(w) : null;
}
/** the icon of a held byte (the snapshot's `held`) */
export function heldIcon(held: number): string | null {
  if (held === 0xff) return null;
  if (held & 0x80) { const c = CONSUMABLES[held & 0x7f]; return c ? itemIconUrl(c) : null; }
  const w = WEAPONS[held & 7]; return w ? itemIconUrl(w) : null;
}
/** a kong's five slots as desk tiles (the active one ringed, rarity bar, rounds / count) */
export function slotsHtml(p: CPlayer): string {
  const st = p.stat; if (!st) return "";
  return st.slots.map((sl, i) => {
    if (sl.kind === SK.Empty) return `<div class="kc-slot ${i === st.active ? "act" : ""}"></div>`;
    const id = sl.kind === SK.Weapon ? WEAPONS[sl.id] : CONSUMABLES[sl.id];
    const rc = sl.kind === SK.Weapon ? RARITY_COLOR[RARITIES[Math.min(5, sl.rarity)]] : "transparent";
    const num = sl.kind === SK.Weapon ? sl.mag : sl.count;
    const title = sl.kind === SK.Weapon ? WEAPON_DEFS[WEAPONS[sl.id]]?.name : CONSUMABLE_DEFS[CONSUMABLES[sl.id]]?.name;
    return `<div class="kc-slot ${i === st.active ? "act" : ""}" title="${esc(title ?? "")}" style="--rc:${rc}"><img src="${itemIconUrl(id ?? "banana")}" alt=""><small>${num}</small><i></i></div>`;
  }).join("");
}
const AMMO = ["LIGHT", "HEAVY", "SHELLS", "ROCKETS"];
const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** kills / damage / status for everyone, sorted; click a row to follow */
export function leaderboardHtml(s: CasterState, target: number): string {
  const rows = s.players.filter((p) => p.stat || p.live).sort((a, b) => b.kills - a.kills || b.damage - a.damage || Number(b.alive) - Number(a.alive)).slice(0, 18);
  return `<table class="kp-lb"><tr><th>#</th><th>PLAYER</th><th class="num">K</th><th class="num">DMG</th><th class="num"></th></tr>${rows.map((p, i) => {
    const look = teamLook(p.team), status = p.alive ? (p.fight >= 0 ? "⚔" : "") : p.resurging ? `BACK ${Math.ceil(Math.max(0, p.respawnIn))}s` : p.placement ? `#${p.placement}` : "✕";
    return `<tr data-pid="${p.id}" class="${p.alive || p.resurging ? "" : "dead"} ${p.id === target ? "sel" : ""}"><td>${i + 1}</td><td class="n" style="--tc:${look.color}">${esc(p.name)}</td><td class="num">${p.kills}</td><td class="num">${p.damage}</td><td class="num">${status}</td></tr>`;
  }).join("")}</table>`;
}

/** the hover card of one kong */
export function popoverHtml(s: CasterState, p: CPlayer): string {
  const look = teamLook(p.team), solo = s.mode === "solo";
  const status = p.inPlane ? "ON THE PLANE" : p.resurging ? `BACK IN ${Math.ceil(Math.max(0, p.respawnIn))}s` : !p.alive ? (p.placement ? `OUT · #${p.placement}` : "DOWN") : p.fight >= 0 ? "IN A FIGHT" : "ALIVE";
  const ammo = p.stat ? p.stat.ammo.map((n, i) => (n ? `${AMMO[i]} ${n}` : "")).filter(Boolean).join(" · ") : "";
  return `<b class="nm">${esc(p.name)}</b><span class="sub">${solo ? "" : `TEAM ${look.name} · `}${p.bot ? "BOT" : "PLAYER"} · ${status}</span>
    <div class="grid"><div><b>${p.kills}</b><span>KILLS</span></div><div><b>${p.damage}</b><span>DAMAGE</span></div><div><b>${p.alive ? Math.ceil(p.hp) : 0}/${p.alive ? Math.ceil(p.shield) : 0}</b><span>HP/SHIELD</span></div><div><b>$${p.cash}</b><span>BUCKS</span></div></div>
    <div class="slots">${slotsHtml(p)}</div>${ammo ? `<div class="ammo">RESERVES · ${ammo}</div>` : ""}${p.redeploys ? `<div class="ammo">REDEPLOYS USED · ${p.redeploys}</div>` : ""}`;
}

/** the results of the match that just ended (null while nobody has won / been placed) */
export function resultsHtml(s: CasterState, matchTime: number): string | null {
  const teams = [...s.teams.values()];
  if (!teams.length) return null;
  const solo = s.mode === "solo";
  const win = teams.find((t) => t.winner) ?? teams.filter((t) => !t.out).sort((a, b) => b.kills - a.kills)[0];
  // (the runner-up is never given a placement by the match — its squad was still in it when the winner was decided: #2,
  // as the server's own outcome says)
  const place = (t: typeof teams[number]) => (t === win ? 1 : t.placement || 2);
  const ranked = teams.slice().sort((a, b) => place(a) - place(b) || b.kills - a.kills).slice(0, 6);
  const nameOf = (t: typeof teams[number]) => (solo ? s.players[t.members[0]]?.name ?? t.look.name : `TEAM ${t.look.name}`);
  const frag = s.players.filter((p) => p.stat).sort((a, b) => b.kills - a.kills || b.damage - a.damage).slice(0, 5);
  if (!win) return null;
  const wl = win.look;
  return `<div class="card"><div class="head"><span>MATCH RESULTS · ${solo ? "SOLO" : "TRIOS"} · ${mmss(matchTime)}</span><span>${teams.length} SQUADS</span></div>
    <div class="cols"><div><div class="win" style="--tc:${wl.color}"><h6>VICTORY ROYALE</h6><b>${esc(nameOf(win))}</b><em>${solo ? "" : win.members.map((id) => esc(s.players[id].name)).join(" · ") + " — "}${win.kills} kills</em></div>
      <h6 style="margin-top:2vh">PLACEMENTS</h6>${ranked.map((t) => `<div class="pl" style="--tc:${t.look.color}"><span class="pn">#${place(t)}</span><span class="t">${esc(nameOf(t))}${solo ? "" : `<small>${t.members.map((id) => esc(s.players[id].name)).join(" · ")}</small>`}</span><em>${t.kills} K · ${Math.round(t.damage)} DMG</em></div>`).join("")}</div>
    <div><h6>TOP FRAGGERS</h6>${frag.map((p, i) => `<div class="pl" style="--tc:${teamLook(p.team).color}"><span class="pn">${i + 1}</span><span class="t">${esc(p.name)}</span><em>${p.kills} K · ${p.damage} DMG</em></div>`).join("")}</div></div></div>`;
}
/** the last match's results (the caster lobby card shows them until the next match) */
export const lastResults: { html: string | null } = { html: null };
