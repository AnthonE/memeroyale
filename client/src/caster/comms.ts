// COMMS on the caster desk: listen in on any squad.
//   - humans: their real voice (WebRTC listen-in, client/src/voice/listen.ts) — what the squad hears, when they talk
//   - bots (exhibitions, bot-filled squads): radio callouts made from what is happening to them — spotting an enemy
//     (direction + distance), getting hit, being low, a knock, a squad wipe, a third party, the storm moving, reloading
//     under fire, the drop, the win — spoken by the browser's speech voices (one voice / pitch / pace per bot) between
//     radio clicks, paced like a squad (one at a time, per-squad and per-callout cool-downs, stale lines dropped)
// The panel (bottom-right) shows who said what (speaker in squad colour, newest on top), the squads tuned in (click a
// chip to drop it), and the comms volume. The roster's ♪ buttons and L (the watched kong's squad) tune in / out.
import type { Link } from "../game/net";
import type { ClientMatch } from "../game/client";
import { CasterListen } from "../voice/listen";
import type { CasterDesk } from "./desk";
import { placeName, type CasterState, type CPlayer } from "./state";
import { teamLook } from "./teams";
import { UI } from "../ui/styles";

const vh = (px: number) => `${(px / 10.8).toFixed(3)}vh`;
const CSS = `
.kc-comms { position: absolute; right: ${vh(14)}; bottom: ${vh(14)}; width: ${vh(420)}; height: ${vh(262)}; display: flex; flex-direction: column; padding: ${vh(8)} ${vh(10)}; }
.kc-comms .hd { display: flex; align-items: center; gap: ${vh(8)}; }
.kc-comms .hd h4 { flex: none; }
.kc-comms .hd .live { font-size: ${vh(12)}; font-weight: 800; letter-spacing: .14em; color: #3fdc6c; }
.kc-comms .hd input { margin-left: auto; width: ${vh(110)}; accent-color: ${UI.yellow}; }
.kc-comms .tuned { display: flex; flex-wrap: wrap; gap: ${vh(4)}; margin: ${vh(5)} 0 ${vh(3)}; min-height: ${vh(20)}; }
.kc-comms .tuned span { cursor: pointer; padding: 0 ${vh(7)}; border-radius: ${vh(4)}; font-weight: 800; font-size: ${vh(13)}; letter-spacing: .06em; background: var(--tc); color: #111; display: inline-flex; align-items: center; gap: ${vh(4)}; }
.kc-comms .tuned span.talk { box-shadow: 0 0 0 2px #fff, 0 0 ${vh(10)} var(--tc); }
.kc-comms .tuned span small { font-size: ${vh(11)}; opacity: .7; }
.kc-comms .tuned em { font-style: normal; color: ${UI.creamDim}; font-size: ${vh(13)}; font-weight: 600; }
.kc-comms ul { list-style: none; margin: 0; padding: 0; overflow: hidden; flex: 1; }
.kc-comms li { font-size: ${vh(15)}; font-weight: 600; padding: ${vh(2)} 0; line-height: 1.25; animation: kcIn .3s ease-out; }
.kc-comms li b { font-weight: 800; margin-right: ${vh(5)}; }
.kc-comms li.now { color: #fff; } .kc-comms li.old { opacity: .55; }
.kc-comms li .mic { color: #3fdc6c; font-weight: 800; letter-spacing: .08em; }
`;
let cssOn = false;

type Kind = "spot" | "hit" | "low" | "hurtdir" | "crack" | "push" | "knock" | "kill" | "wipe" | "mate" | "last" | "third" | "storm" | "reload" | "shields" | "drop" | "win";
const LINES: Record<Kind, string[]> = {
  spot: ["Enemy {dir}, {d} meters!", "Got eyes on one, {dir}, {d} out!", "Contact {dir}!", "One {dir}, {d} meters.", "Player {dir}, {d}!"],
  hit: ["I'm hit!", "Taking damage!", "Ow, I'm hit!", "They're on me!"],
  hurtdir: ["Taking fire {dir}!", "Shots from {dir}!", "I'm getting shot from {dir}!"],
  low: ["I'm low!", "I'm one shot, cover me!", "Need a heal, I'm low!", "Low, low, low!"],
  crack: ["Cracked him!", "Hit him hard!", "Shield's broken on him!", "Headshot!"],
  push: ["He's one shot, push!", "He's weak, go go go!", "He's low, push him!"],
  knock: ["Knocked one!", "He's down!", "Dropped him!", "One down!"],
  kill: ["He's out!", "Got him!", "Finished him!", "That's a kill!"],
  wipe: ["Squad wiped!", "That's the whole team!", "Team's gone, reset!", "Wiped them!"],
  mate: ["{name} is down!", "Lost {name}!", "They dropped {name}!"],
  last: ["I'm the last one!", "It's just me now!", "I'm solo, I'm solo!"],
  third: ["Third party {dir}!", "Another team coming in {dir}!", "We're getting third partied!"],
  storm: ["Storm's moving, rotate {dir}!", "Zone's closing, we gotta go {dir}!", "Rotate, rotate, storm's coming!"],
  reload: ["Reloading!", "Reloading, cover me!", "I'm reloading!"],
  shields: ["Anyone got shields?", "I need shields.", "No shields on me."],
  drop: ["Dropping {place}!", "We're going {place}!", "I'm landing {place}!"],
  win: ["We won! GG!", "Let's go! GG!", "Meme Royale! Let's go!"],
};
const COOL: Record<Kind, number> = { spot: 14, hit: 6, hurtdir: 9, low: 10, crack: 7, push: 8, knock: 3, kill: 3, wipe: 5, mate: 4, last: 30, third: 25, storm: 40, reload: 12, shields: 45, drop: 60, win: 60 };
const PRIO: Record<Kind, number> = { win: 9, wipe: 8, knock: 7, kill: 7, mate: 7, last: 7, third: 6, low: 6, push: 5, spot: 5, hurtdir: 4, crack: 4, hit: 3, storm: 3, reload: 2, shields: 1, drop: 4 };
const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** compass word from a to b (the island map's north is −z) */
const dirTo = (ax: number, az: number, bx: number, bz: number) => DIRS[((Math.round(Math.atan2(bx - ax, -(bz - az)) / (Math.PI / 4)) % 8) + 8) % 8];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

interface Said { at: number; team: number; who: string; text: string; human: boolean }
interface Pending { at: number; prio: number; p: CPlayer; text: string; kind: Kind }

export interface CasterComms {
  toggle(team: number): boolean;
  onJSON(m: Record<string, unknown>): boolean;
  update(dt: number): void;
  readonly listen: CasterListen;
  readonly said: Said[];
  dispose(): void;
}

export function createCasterComms(o: { link: Link; state: CasterState; desk: CasterDesk; cm: ClientMatch }): CasterComms {
  const { state, desk, cm } = o;
  if (!cssOn) { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); cssOn = true; }
  const listen = new CasterListen(o.link);
  // ---- the panel
  const el = document.createElement("div"); el.className = "p kc-comms kc-desk-only";
  el.innerHTML = `<div class="hd"><h4>COMMS</h4><span class="live"></span><input type="range" min="0" max="100" value="100" title="comms volume"></div><div class="tuned"></div><ul></ul>`;
  desk.el.appendChild(el);
  const liveEl = el.querySelector<HTMLElement>(".live")!, tunedEl = el.querySelector<HTMLElement>(".tuned")!, ul = el.querySelector("ul")!;
  const vol = el.querySelector<HTMLInputElement>("input")!;
  let volume = 1;
  vol.addEventListener("input", () => { volume = +vol.value / 100; listen.setVolume(volume); });
  tunedEl.addEventListener("click", (e) => { const s = (e.target as HTMLElement).closest<HTMLElement>("[data-team]"); if (s) api.toggle(+s.dataset.team!); });

  const said: Said[] = [];
  const say = (team: number, who: string, text: string, human: boolean) => { said.unshift({ at: performance.now() / 1000, team, who, text, human }); if (said.length > 40) said.length = 40; drawLines(); };
  function drawLines() {
    const t = performance.now() / 1000;
    ul.innerHTML = said.slice(0, 10).map((s) => {
      const c = teamLook(s.team).color, age = t - s.at;
      return `<li class="${age < 4 ? "now" : age > 30 ? "old" : ""}"><b style="color:${c}">${s.who.replace(/[&<>]/g, "")}</b>${s.human ? `<span class="mic">🎙 ${s.text}</span>` : `“${s.text}”`}</li>`;
    }).join("") || `<li class="old">${listen.teams.size ? "Quiet on comms…" : "Click ♪ on a squad (or press L) to listen in."}</li>`;
  }
  drawLines();

  // ---- speech (one line at a time across every squad: a radio channel)
  const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
  let voices: SpeechSynthesisVoice[] = [];
  const loadVoices = () => { voices = synth ? synth.getVoices().filter((v) => /^en/i.test(v.lang)) : []; };
  loadVoices(); synth?.addEventListener?.("voiceschanged", loadVoices);
  const queue: Pending[] = [];
  let speaking: Pending | null = null, speakUntil = 0, gapUntil = 0;
  const teamGap = new Map<number, number>(), cool = new Map<string, number>();
  let ctx: AudioContext | null = null;
  function click(up: boolean) {
    try {
      ctx ??= new AudioContext(); void ctx.resume();
      const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** (up ? 3 : 1.5);
      const s = ctx.createBufferSource(); s.buffer = n;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = up ? 2400 : 1500; bp.Q.value = 1.4;
      const g = ctx.createGain(); g.gain.value = 0.18 * volume;
      s.connect(bp).connect(g).connect(ctx.destination); s.start();
    } catch { /* no audio */ }
  }
  function speak(x: Pending) {
    speaking = x; const now = performance.now() / 1000;
    teamGap.set(x.p.team, now + 2.2);
    say(x.p.team, x.p.name, x.text, false);
    const words = x.text.split(/\s+/).length;
    speakUntil = now + 0.5 + words * 0.34;                 // a fallback when the engine never fires "end" (headless)
    if (!synth || volume <= 0) return;
    click(true);
    const u = new SpeechSynthesisUtterance(x.text);
    const seed = (x.p.id * 2654435761) >>> 0;
    if (voices.length) u.voice = voices[seed % voices.length];
    u.pitch = 0.75 + ((seed >> 8) % 60) / 100; u.rate = 1.08 + ((seed >> 16) % 25) / 100; u.volume = Math.min(1, volume);
    u.onend = () => { if (speaking === x) { speakUntil = 0; click(false); } };
    u.onerror = () => { if (speaking === x) speakUntil = 0; };
    try { synth.speak(u); } catch { /* ignore */ }
  }
  /** a bot of a listened squad wants to say `kind` */
  function want(p: CPlayer, kind: Kind, vars: Record<string, string | number> = {}) {
    if (!p.bot || !listen.teams.has(p.team)) return;
    const now = performance.now() / 1000, ck = `${p.id}:${kind}`, tk = `t${p.team}:${kind}`;
    if ((cool.get(ck) ?? 0) > now || (cool.get(tk) ?? 0) > now) return;
    cool.set(ck, now + COOL[kind]); cool.set(tk, now + COOL[kind] * 0.5);
    let text = pick(LINES[kind]);
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
    if (/\{\w+\}/.test(text)) return;
    queue.push({ at: now, prio: PRIO[kind], p, text, kind });
    if (queue.length > 6) { queue.sort((a, b) => b.prio - a.prio); queue.length = 6; }
  }
  const mates = (p: CPlayer) => state.players.filter((q) => q.team === p.team && q.id !== p.id);
  const live = (q: CPlayer) => q.live && q.alive && !q.inPlane;

  // ---- events → callouts
  state.listeners.push({
    hit: (shooter, victim, dmg, kill, head) => {
      const a = state.players[shooter], v = state.players[victim]; if (!v) return;
      if (a && a.team !== v.team && !kill) {
        // my side hurt someone
        if (listen.teams.has(a.team)) { if (v.hp + v.shield < 30 && v.alive) want(a, "push"); else if (head || dmg >= 40) want(a, "crack"); }
        // my side got hurt
        if (listen.teams.has(v.team) && v.alive) { if (v.hp < 35) want(v, "low"); else if (Math.random() < 0.5) want(v, "hurtdir", { dir: dirTo(v.x, v.z, a.x, a.z) }); else want(v, "hit"); }
      }
    },
    kill: (killer, victim, _w, final) => {
      const k = state.players[killer], v = state.players[victim]; if (!v) return;
      if (k && k.team !== v.team) want(k, final ? "kill" : "knock");
      const left = mates(v).filter(live);
      if (left.length === 1) want(left[0], "last");
      else if (left.length) want(left[Math.floor(Math.random() * left.length)], "mate", { name: v.name });
    },
    squadOut: (team) => {
      // the squad that finished them (the last killer we know of) calls the wipe
      const recent = state.feed.find((f) => (f.kind === "kill" || f.kind === "down") && f.b !== undefined && state.players[f.b]?.team === team && f.a !== undefined && f.a >= 0);
      const k = recent ? state.players[recent.a!] : null; if (k && k.team !== team) want(k, "wipe");
    },
    thirdParty: (f, team) => {
      // the squads already fighting see the newcomer coming
      const newcomer = f.players.map((id) => state.players[id]).find((q) => q.team === team && q.alive);
      for (const t of f.teams) if (t !== team && listen.teams.has(t)) { const sp = f.players.map((id) => state.players[id]).find((q) => q.team === t && live(q)); if (sp && newcomer) want(sp, "third", { dir: dirTo(sp.x, sp.z, newcomer.x, newcomer.z) }); }
    },
  });

  // ---- periodic: spotting, the storm, reloads, shields, the drop, the win
  let scanAt = 0, lastShrink = false, lastPhase = cm.phase, wonSaid = false;
  const reloading = new Set<number>();
  function scan() {
    const teams = [...listen.teams];
    if (!teams.length) return;
    const shrinking = state.storm.shrinking;
    for (const t of teams) {
      const squad = state.players.filter((q) => q.team === t && live(q) && q.bot);
      if (!squad.length) continue;
      for (const p of squad) {
        // spotting: the nearest enemy within 110 m, called once per pair a while
        let best: CPlayer | null = null, bd = 110;
        for (const q of state.players) { if (q.team === t || !live(q)) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
        if (best && cm.phase === 2) { const pk = `spot${p.id}:${best.team}`; const now = performance.now() / 1000; if ((cool.get(pk) ?? 0) < now) { cool.set(pk, now + 25); want(p, "spot", { dir: dirTo(p.x, p.z, best.x, best.z), d: Math.max(5, Math.round(bd / 5) * 5) }); } }
        // reloading in a fight (the remote's anim bit 1)
        const rl = (cm.remotes[p.id]?.anim & 1) !== 0;
        if (rl && !reloading.has(p.id) && p.fight >= 0) want(p, "reload");
        if (rl) reloading.add(p.id); else reloading.delete(p.id);
        if (p.shield <= 0 && p.fight < 0 && cm.phase === 2 && performance.now() / 1000 - p.lastHurtAt > 8 && Math.random() < 0.04) want(p, "shields");
      }
      if (shrinking && !lastShrink) {
        const s = cm.storm as unknown as { tx: number; tz: number }, p = squad[0];
        if (Math.hypot(p.x - s.tx, p.z - s.tz) > 60) want(p, "storm", { dir: dirTo(p.x, p.z, s.tx, s.tz) });
      }
      if (cm.phase === 2 && lastPhase === 1) { const p = squad[0]; want(p, "drop", { place: placeName(p.x, p.z).toLowerCase() }); }
      if (!wonSaid && state.players.some((q) => q.team === t && q.winner)) { wonSaid = true; want(squad[0], "win"); }
    }
    lastShrink = shrinking; lastPhase = cm.phase;
  }

  // ---- humans speaking (listen-in): a transcript line when someone starts talking
  const levels = new Map<number, number>(), talkingSince = new Map<number, number>();
  let drawAt = 0;

  const api: CasterComms = {
    listen, said,
    toggle(team) {
      const on = listen.toggle(team);
      const solo = state.mode === "solo", look = teamLook(team);
      const label = solo ? state.players.find((p) => p.team === team)?.name ?? look.name : `TEAM ${look.name}`;
      const humans = state.players.filter((p) => p.team === team && !p.bot).length;
      desk.toast(on ? `LISTENING · ${label}${humans ? "" : " · BOT COMMS"}` : `STOPPED LISTENING · ${label}`);
      listen.resume(); void ctx?.resume();
      if (!on) { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].p.team === team) queue.splice(i, 1); if (speaking?.p.team === team) { synth?.cancel(); speaking = null; speakUntil = 0; } }
      drawLines(); drawTuned();
      return on;
    },
    onJSON: (m) => listen.onJSON(m),
    update(_dt) {
      const now = performance.now() / 1000;
      if (now - scanAt > 0.5) { scanAt = now; scan(); }
      // the radio: finish the current line, then the most urgent fresh one, one squad's line at a time
      if (speaking && now > speakUntil && !(synth?.speaking && now < speakUntil + 3)) { speaking = null; gapUntil = now + 0.45; }
      if (!speaking && now > gapUntil && queue.length) {
        for (let i = queue.length - 1; i >= 0; i--) if (now - queue[i].at > 4 || !listen.teams.has(queue[i].p.team)) queue.splice(i, 1);
        queue.sort((a, b) => b.prio - a.prio || a.at - b.at);
        const i = queue.findIndex((x) => (teamGap.get(x.p.team) ?? 0) < now || x.prio >= 7);
        if (i >= 0) speak(queue.splice(i, 1)[0]);
      }
      // humans: who is talking
      listen.levels(levels);
      for (const [pid] of levels) if (!talkingSince.has(pid)) { talkingSince.set(pid, now); const p = state.players[pid]; if (p) say(p.team, p.name, "speaking", true); }
      for (const pid of [...talkingSince.keys()]) if (!levels.has(pid) && now - talkingSince.get(pid)! > 1.2) talkingSince.delete(pid);
      // the desk: which squads are tuned in / talking right now
      desk.listening.clear(); for (const t of listen.teams) desk.listening.add(t);
      desk.speaking.clear();
      if (speaking && now < speakUntil) desk.speaking.add(speaking.p.team);
      for (const [pid] of levels) { const p = state.players[pid]; if (p) desk.speaking.add(p.team); }
      liveEl.textContent = desk.speaking.size ? "● LIVE" : "";
      if (now - drawAt > 0.5) { drawAt = now; drawTuned(); drawLines(); }
    },
    dispose() {
      listen.dispose(); synth?.cancel(); el.remove();
      synth?.removeEventListener?.("voiceschanged", loadVoices);
      void ctx?.close(); ctx = null;
    },
  };
  let tunedSig = "";
  function drawTuned() {
    const solo = state.mode === "solo";
    const parts = [...listen.teams].map((t) => {
      const look = teamLook(t), humans = listen.mics(t), bots = state.players.filter((p) => p.team === t && p.bot).length;
      const label = solo ? state.players.find((p) => p.team === t)?.name ?? look.name : look.name;
      const sub = humans ? `${humans} MIC${humans > 1 ? "S" : ""}` : bots ? "BOTS" : "NO MICS";
      return `<span data-team="${t}" class="${desk.speaking.has(t) ? "talk" : ""}" style="--tc:${look.color}" title="stop listening">${label.replace(/[&<>]/g, "")} <small>${sub}</small> ✕</span>`;
    });
    const html = parts.length ? parts.join("") : `<em>not listening to anyone</em>`;
    if (html !== tunedSig) { tunedSig = html; tunedEl.innerHTML = html; }
  }
  drawTuned();
  return api;
}
