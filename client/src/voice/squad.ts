// SQUAD VOICE — the player's side (online matches; offline practice never makes one). Hold the talk key (SETTINGS →
// CONTROLS, B by default) to talk to the squad; a quick double tap toggles an open mic. Nothing is asked of the browser
// until the first press: then the microphone permission prompt, then the mic stays ready for the rest of the session.
//
// Connections come from the server's roster of the squad ({ t: "voiceroster" }, server/voice.ts): a pair of squadmates
// connects when at least one of them has a mic — the mic holder offers (the lower pid when both have one, the other side
// is the "polite" peer and yields on a collision). Caster seats listening to the squad get a send-only connection with
// the SAME mic track, so a caster hears exactly what the squad hears (only while the talk key is held / the mic is open),
// and the squad sees CASTERS LISTENING while any seat is tuned in.
//
// Cost when nobody talks: one tiny DOM widget (hidden in solo with no listeners), no mic, no peer connections.
import type { Link } from "../game/net";
import { preferences } from "../settings/preferences";
import { bindLabel } from "../settings/bindings";
import { VoicePeer, voiceCtx, SPEAK_LEVEL, type VoiceSignal } from "./peer";

interface Mate { pid: number; mic: boolean; name: string }
export interface SquadVoice {
  /** "rtc" / "voiceroster" from the server; true = handled */
  onJSON(m: Record<string, unknown>): boolean;
  /** our seat in the match that just started (−1 = none) */
  setMe(pid: number): void;
  /** the match ended: drop every connection (the next match has new squads) */
  endMatch(): void;
  dispose(): void;
  readonly el: HTMLElement;
  /** tests / tools: who we are, the roster, our mic, every connection's state + inbound audio */
  stats(): Promise<{ me: number; mates: Mate[]; listeners: number[]; mic: boolean; open: boolean; hint: string; peers: Record<string, { state: string; bytes: number; level: number }> }>;
}

const CSS = `
.kv { position: fixed; left: 1.67vh; top: 46vh; z-index: 11; font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; color: #fbf3c9; pointer-events: none; display: flex; flex-direction: column; gap: .5vh; }
.kv.off { display: none; }
.kv .mic { display: inline-flex; align-items: center; gap: .6vh; align-self: flex-start; padding: .35vh .9vh; border-radius: .6vh; background: rgba(10,12,6,.72); font-weight: 800; font-size: 1.6vh; letter-spacing: .12em; }
.kv .mic i { width: 1.1vh; height: 1.1vh; border-radius: 50%; background: rgba(255,255,255,.3); }
.kv .mic.on { background: rgba(20,90,40,.85); } .kv .mic.on i { background: #3fdc6c; box-shadow: 0 0 1vh #3fdc6c; }
.kv .mic.open { outline: 2px solid #3fdc6c; }
.kv .mic.bad { background: rgba(90,30,20,.8); letter-spacing: .06em; }
.kv .mates { display: flex; flex-wrap: wrap; gap: .5vh; }
.kv .mate { pointer-events: auto; cursor: pointer; padding: .2vh .8vh; border-radius: .5vh; background: rgba(10,12,6,.6); font-weight: 700; font-size: 1.5vh; display: inline-flex; align-items: center; gap: .5vh; }
.kv .mate i { width: .9vh; height: .9vh; border-radius: 50%; background: rgba(255,255,255,.25); }
.kv .mate.talk i { background: #3fdc6c; box-shadow: 0 0 .8vh #3fdc6c; }
.kv .mate.muted { opacity: .5; text-decoration: line-through; }
.kv .cast { align-self: flex-start; padding: .25vh .8vh; border-radius: .5vh; background: rgba(160,30,40,.85); font-weight: 800; font-size: 1.4vh; letter-spacing: .14em; }
.kr-squad .m.vx-talk { box-shadow: 0 0 0 .25vh #3fdc6c, 0 0 1.4vh rgba(63,220,108,.55); }
`;
let cssOn = false;

export function createSquadVoice(link: Link, ui: HTMLElement): SquadVoice {
  if (!cssOn) { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); cssOn = true; }
  const el = document.createElement("div"); el.className = "kv off"; ui.appendChild(el);
  const micEl = document.createElement("div"); micEl.className = "mic"; el.appendChild(micEl);
  const matesEl = document.createElement("div"); matesEl.className = "mates"; el.appendChild(matesEl);
  const castEl = document.createElement("div"); castEl.className = "cast"; castEl.textContent = "📡 CASTERS LISTENING"; el.appendChild(castEl);

  let me = -1, mates: Mate[] = [], listeners: number[] = [];
  let track: MediaStreamTrack | null = null, micStream: MediaStream | null = null, asked = false, hint = "";
  let ptt = false, open = false, lastUp = -1e9;
  const peers = new Map<string, VoicePeer>();
  const muted = new Set<number>();
  let disposed = false;
  let micAn: AnalyserNode | null = null; const micBuf = new Float32Array(512);

  const send = (to: string, d: VoiceSignal) => link.sendJSON({ t: "rtc", to, d });
  // a fresh voice has no mic yet: the server forgets any earlier one of this connection (a rejoin after LEAVE)
  link.sendJSON({ t: "voice", mic: false });
  const talking = () => (ptt || open) && !!track;
  const applyTrack = () => { if (track) track.enabled = ptt || open; };

  async function getMic() {
    if (asked) return; asked = true;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      hint = location.protocol === "http:" ? "VOICE NEEDS HTTPS · YOU CAN STILL HEAR YOUR SQUAD" : "NO MICROPHONE ACCESS HERE";
      return;
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (disposed) { micStream.getTracks().forEach((t) => t.stop()); return; }
      track = micStream.getAudioTracks()[0] ?? null;
      if (!track) { hint = "NO MICROPHONE FOUND"; return; }
      applyTrack();
      const ctx = voiceCtx();
      if (ctx) { try { const src = ctx.createMediaStreamSource(micStream); micAn = ctx.createAnalyser(); micAn.fftSize = 512; src.connect(micAn); } catch { micAn = null; } }
      link.sendJSON({ t: "voice", mic: true });
      reconcile(true);
    } catch (e) {
      const n = (e as DOMException)?.name;
      hint = n === "NotAllowedError" || n === "SecurityError" ? "MIC BLOCKED · ALLOW IT IN THE ADDRESS BAR" : "NO MICROPHONE FOUND";
    }
  }

  /** the connections the roster calls for: rebuild what changed, open what we offer, close what is gone */
  function reconcile(rebuildAll = false) {
    if (me < 0) { for (const p of peers.values()) p.close(); peers.clear(); return; }
    const want = new Map<string, { key: string; offer: boolean; dir: RTCRtpTransceiverDirection }>();
    const meMic = !!track;
    for (const q of mates) {
      if (q.pid === me || (!meMic && !q.mic)) continue;
      const offer = meMic && (!q.mic || me < q.pid);
      want.set(`p${q.pid}`, { key: `${meMic ? 1 : 0}${q.mic ? 1 : 0}`, offer, dir: meMic ? (q.mic ? "sendrecv" : "sendonly") : "recvonly" });
    }
    if (meMic) for (const s of listeners) want.set(`s${s}`, { key: "1", offer: true, dir: "sendonly" });
    for (const [t, p] of peers) { const w = want.get(t); if (!w || w.key !== p.key || rebuildAll) { p.close(); peers.delete(t); } }
    for (const [t, w] of want) {
      if (peers.has(t) || !w.offer) continue;
      const p = makePeer(t, w.dir); p.key = w.key; peers.set(t, p); void p.offer();
    }
  }
  function makePeer(target: string, dir: RTCRtpTransceiverDirection) {
    const pid = target[0] === "p" ? Number(target.slice(1)) : -1;
    const p = new VoicePeer({ target, send, track, dir, ctx: voiceCtx(), volume: muted.has(pid) ? 0 : 1 });
    p.onFailed = () => { if (peers.get(target) === p) { p.close(); peers.delete(target); setTimeout(() => reconcile(), 1500); } };
    return p;
  }
  function onSignal(from: string, d: VoiceSignal) {
    if (!d || typeof d !== "object" || typeof d.id !== "string") return;
    let p = peers.get(from);
    if (d.kind === "offer") {
      const pid = from[0] === "p" ? Number(from.slice(1)) : -1;
      if (p && p.id === d.id) return;
      // a collision (we offered too): the lower pid is impolite and keeps its own offer; the higher one yields
      if (p && p.offerer && p.pc.signalingState === "have-local-offer" && pid >= 0 && me < pid) return;
      p?.close();
      const q = mates.find((x) => x.pid === pid), meMic = !!track;
      const dir: RTCRtpTransceiverDirection = meMic ? (q?.mic ? "sendrecv" : "sendonly") : "recvonly";
      p = makePeer(from, dir); p.key = `${meMic ? 1 : 0}${q?.mic ? 1 : 0}`; peers.set(from, p);
    }
    void p?.signal(d);
  }

  // ---- the talk key (hold = talk, double tap = open mic)
  const isTalk = (code: string) => preferences.value.binds.talk?.includes(code) ?? false;
  const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const press = (code: string, down: boolean, repeat = false) => {
    if (me < 0 || !isTalk(code) || repeat) return false;
    for (const p of peers.values()) p.resume();
    void voiceCtx()?.resume();
    if (down) {
      if (performance.now() - lastUp < 320) { open = !open; ptt = false; } else ptt = true;
      if (!track) void getMic();
    } else { if (ptt) lastUp = performance.now(); ptt = false; }
    applyTrack(); return true;
  };
  // (not while the settings menu is open: its key / mouse capture for a rebind would key the mic)
  const menu = () => !!document.querySelector(".kr-video.on");
  const kd = (e: KeyboardEvent) => { if (!typing(e) && !menu()) press(e.code, true, e.repeat); };
  const ku = (e: KeyboardEvent) => { press(e.code, false); };
  const md = (e: MouseEvent) => { if (!menu()) press(`Mouse${e.button}`, true); };
  const mu = (e: MouseEvent) => { press(`Mouse${e.button}`, false); };
  const blur = () => { ptt = false; applyTrack(); };
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("mousedown", md); window.addEventListener("mouseup", mu); window.addEventListener("blur", blur);
  matesEl.addEventListener("click", (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>("[data-pid]"); if (!m) return;
    const pid = +m.dataset.pid!; if (muted.has(pid)) muted.delete(pid); else muted.add(pid);
    peers.get(`p${pid}`)?.setVolume(muted.has(pid) ? 0 : 1);
  });

  // ---- the widget (+ the HUD's squad rows light up for whoever talks)
  let sig = "", kvTop = 0;
  const tick = setInterval(() => {
    if (disposed) return;
    const others = mates.filter((q) => q.pid !== me);
    const show = me >= 0 && (others.length > 0 || listeners.length > 0);
    el.classList.toggle("off", !show);
    if (!show) return;
    // never over the HUD's left column (mode label → storm clock + its warnings → squad panel): a STORM
    // CLOSING tag or a bounty card pushes the squad rows down, and the widget moves down under them (46vh stays the
    // spot while there is room; the HUD hidden = a zero rect = the CSS spot)
    const col = document.querySelector(".kr-root > .tn-hud-left")?.getBoundingClientRect();
    const top = col && col.bottom > 0 ? Math.max(Math.round(window.innerHeight * 0.46), Math.ceil(col.bottom + window.innerHeight * 0.01)) : 0;
    if (top !== kvTop) { kvTop = top; el.style.top = top ? `${top}px` : ""; }
    let own = 0;
    if (micAn && talking()) { micAn.getFloatTimeDomainData(micBuf); let s = 0; for (let i = 0; i < micBuf.length; i++) s += micBuf[i] * micBuf[i]; own = Math.sqrt(s / micBuf.length); }
    // an unbound talk key must not say "HOLD B TO TALK" while B does nothing (or something else)
    const tk = preferences.value.binds.talk?.[0], hold = tk ? `HOLD ${bindLabel(tk).toUpperCase()} TO TALK` : "PUSH TO TALK UNBOUND · SETTINGS";
    const micState = hint ? "bad" : talking() ? "on" : "";
    const micTxt = hint ? hint : !track ? hold : open ? "OPEN MIC" : ptt ? "ON AIR" : hold;
    const speaking = new Set<string>();
    for (const q of others) { const p = peers.get(`p${q.pid}`); if (p && p.level() > SPEAK_LEVEL) speaking.add(q.name); }
    const s2 = `${micState}|${open}|${micTxt}|${own > SPEAK_LEVEL}|${others.map((q) => `${q.pid}${q.name}${speaking.has(q.name) ? 1 : 0}${muted.has(q.pid) ? 1 : 0}${q.mic ? 1 : 0}`).join(",")}|${listeners.length}`;
    if (s2 !== sig) {
      sig = s2;
      micEl.className = `mic ${micState} ${open && !hint ? "open" : ""}`;
      micEl.innerHTML = `<i></i>${micTxt}`;
      matesEl.innerHTML = others.map((q) => `<span class="mate ${speaking.has(q.name) ? "talk" : ""} ${muted.has(q.pid) ? "muted" : ""}" data-pid="${q.pid}" title="click to mute">${q.mic ? "🎙" : "🔇"} ${q.name.replace(/[&<>]/g, "")}<i></i></span>`).join("");
      castEl.style.display = listeners.length ? "" : "none";
    }
    for (const row of document.querySelectorAll<HTMLElement>(".kr-squad .m")) {
      const nm = row.querySelector(".nm")?.textContent ?? "";
      row.classList.toggle("vx-talk", speaking.has(nm));
    }
  }, 100);

  return {
    el,
    async stats() {
      const peersOut: Record<string, { state: string; bytes: number; level: number }> = {};
      for (const [t, p] of peers) peersOut[t] = { state: p.pc.connectionState, bytes: await p.inboundBytes(), level: p.level() };
      return { me, mates, listeners, mic: !!track, open, hint, peers: peersOut };
    },
    onJSON(m) {
      if (m.t === "voiceroster") {
        const team = m.team as number;
        mates = team < 0 ? [] : ((m.mates as Mate[]) ?? []).filter((q) => Number.isInteger(q.pid)).map((q) => ({ pid: q.pid, mic: q.mic === true, name: String(q.name ?? "") }));
        listeners = team < 0 ? [] : ((m.listeners as number[]) ?? []).filter((n) => Number.isInteger(n));
        reconcile();
        return true;
      }
      if (m.t === "rtc") { onSignal(String(m.from ?? ""), m.d as VoiceSignal); return true; }
      return false;
    },
    setMe(pid) {
      me = pid; reconcile();
      // the mic of a previous match: tell this match's roster
      if (track) link.sendJSON({ t: "voice", mic: true });
    },
    endMatch() { me = -1; mates = []; listeners = []; ptt = false; open = false; applyTrack(); reconcile(); el.classList.add("off"); },
    dispose() {
      disposed = true; clearInterval(tick);
      for (const p of peers.values()) p.close(); peers.clear();
      micStream?.getTracks().forEach((t) => t.stop()); track = null;
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("mousedown", md); window.removeEventListener("mouseup", mu); window.removeEventListener("blur", blur);
      for (const row of document.querySelectorAll<HTMLElement>(".kr-squad .m.vx-talk")) row.classList.remove("vx-talk");
      el.remove();
    },
  };
}
