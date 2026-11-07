// THE TUK-TUK RADIO, built like a classic open-world game's radio: a station is a 10-minute live broadcast — each song twice, DJ talk-ups over the intros, an ad break, the ident — at full
// quality, loud and clean in the cab, under your gunfire, with a station banner when you tune in (render.ts / hud.ts:
// the station + what is on air, from the cue sheet radio-program.ts).
//
// The station is ONE streamed <audio> element (never decoded into the bank, never part of the boot: it starts fetching
// the first time a tuk-tuk tunes in) playing the broadcast on a loop: every tuk-tuk on it hears the same moment, and the
// broadcast clock is the MATCH time — tune in late and the song has moved on, the same moment on every client. Per tuk-tuk
// a small chain fans the station out:
//   aboard  → a clean full-range 2D mix (you are in the cab) through the radio's own duck (your shots, a fight near you)
//   outside → a tinny little speaker (band-limited) on a PannerNode at the tuk-tuk, into the world bus (storm / indoor
//             filtering like any world sound), inverse-distance: loud beside it, gone past ~70 m
// Turning the dial: a short soft sweep of static and the station fading up (not a hard cut).
import type { Library } from "./loader";
import { setT } from "./param";
import type { Cue } from "./radio-program";

export interface StationDef { name: string; host: string; file: string; dur: number; offset: number; cues: ReadonlyArray<Cue> }
/** station index = the vehicle's `radio` (shared/sim/vehicle.ts TUK.RADIO_N); 0 = off */
// Kong Royale's KONG FM is Witzner's work, licensed to Kong Royale alone (its CREDITS.md), so Meme Royale ships no
// station yet: every dial position is OFF until one of our own is added here.
export const STATIONS: ReadonlyArray<StationDef | null> = [null];
/** a station is on air: false hides the radio everywhere (the dial, its banner, its static, its settings rows) */
export const RADIO_ON = STATIONS.some((s) => s !== null);
export const stationName = (k: number) => STATIONS[k]?.name ?? null;
/** the broadcast position (s) of station `k` at match time `clock` */
export function broadcastAt(k: number, clock: number): number {
  const s = STATIONS[k]; if (!s) return 0;
  return ((clock + s.offset) % s.dur + s.dur) % s.dur;
}
/** what is on air on station `k` at match time `clock` (the cue sheet), null for OFF */
export function onAir(k: number, clock: number): Cue | null {
  const s = STATIONS[k]; if (!s) return null;
  const t = broadcastAt(k, clock);
  let c = s.cues[0];
  for (let i = 0; i < s.cues.length; i++) { if (s.cues[i].t <= t + 0.05) c = s.cues[i]; else break; }
  return c;
}

/** the radio's levels: in the cab (linear) and from outside at REF m (inverse distance beyond it), audible to MAX_D m.
 *  (measured in the cab on the runway: the broadcast at -16 LUFS-I and the cab +3.3 dB keep it over the engine in 0.5-4 kHz
 *  while driving) */
const CAB = 0.82, OUT = 0.8, REF = 4, ROLL = 1.0, MAX_D = 72;
/** a playing station further than this (s) from the broadcast clock is put back on it (a stall, a slow first fetch) */
const RESYNC = 0.6;

interface Station { el: HTMLAudioElement; src: MediaElementAudioSourceNode; out: GainNode; users: number; playing: boolean; idleAt: number; k: number; pend: boolean; checkAt: number }
/** a tuk-tuk's fan-out: `station` = what it is tuned to, `hooked` = the station still wired into it (turned off, it fades
 *  out for a moment before it lets go), `gen` counts the dial's turns (a late let-go checks it), `dying` = being removed */
interface Chain { station: number; hooked: number; gen: number; dying: boolean; cab: GainNode; ext: GainNode; pan: PannerNode; seen: number; aboard: boolean }

export class Radio {
  private stations = new Map<number, Station>();
  private chains = new Map<number, Chain>();
  private frameN = 0;
  private noise: AudioBuffer | null = null;
  /** every cab feed meets here: the radio's own duck (gunfire), then the player's radio volume, then the master; the
   *  outside speakers meet in extBus (the radio volume) on their way into the world bus */
  private cabBus: GainNode; private cabVol: GainNode; private extBus: GainNode;
  private duckDb = 0; private duckUntil = 0; private ducked = false;
  private clock = 0;
  constructor(private ctx: AudioContext, private base: string, private master: AudioNode, private world: AudioNode, _lib: Library, private ext: "ogg" | "m4a") {
    this.cabBus = ctx.createGain(); this.cabVol = ctx.createGain(); this.extBus = ctx.createGain();
    this.cabBus.connect(this.cabVol).connect(master);
    this.extBus.connect(world);
  }
  /** SETTINGS → AUDIO → Tuk-tuk radio (0..1; 1 = the authored level), on the cab and the outside speakers alike */
  setVolume(v: number) {
    const g = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1, t = this.ctx.currentTime;
    this.cabVol.gain.setTargetAtTime(g, t, 0.03); this.extBus.gain.setTargetAtTime(g, t, 0.03);
  }

  private station(k: number): Station | null {
    const def = STATIONS[k]; if (!def) return null;
    let s = this.stations.get(k);
    if (!s) {
      const el = new Audio();
      el.preload = "none"; el.loop = true; el.crossOrigin = "anonymous";
      el.src = `${this.base}${def.file}.${this.ext}`;
      const src = this.ctx.createMediaElementSource(el), out = this.ctx.createGain();
      src.connect(out);
      const st: Station = { el, src, out, users: 0, playing: false, idleAt: 0, k, pend: false, checkAt: 0 };
      // the first tune-in: the position can only be set once the metadata is there — then it joins the broadcast
      el.addEventListener("loadedmetadata", () => { if (st.playing) this.seek(st); });
      s = st;
      this.stations.set(k, s);
    }
    return s;
  }

  /**
   * tuk-tuk `id` this frame: on `station` (0 = off / silent), drawn at `pos`, `aboard` = I ride it, `clock` = the match
   * time (s, the broadcast clock), `vol` 0..1 (a burning / sinking one fades). Call for every audible tuk-tuk, then frame().
   */
  set(id: number, station: number, pos: ArrayLike<number>, aboard: boolean, d: number, clock: number, vol = 1) {
    this.clock = clock;
    if (station > 0 && !aboard && d > MAX_D) station = 0;
    let c = this.chains.get(id);
    if (!c) {
      if (station <= 0) return;
      const cab = this.ctx.createGain(), ext = this.ctx.createGain(), hp = this.ctx.createBiquadFilter(), lp = this.ctx.createBiquadFilter(), pan = this.ctx.createPanner();
      hp.type = "highpass"; hp.frequency.value = 220; lp.type = "lowpass"; lp.frequency.value = 4800; lp.Q.value = 0.9;
      pan.panningModel = "equalpower"; pan.distanceModel = "inverse"; pan.refDistance = REF; pan.rolloffFactor = ROLL; pan.maxDistance = 1e4;
      cab.gain.value = 0; ext.gain.value = 0;
      cab.connect(this.cabBus); ext.connect(hp).connect(lp).connect(pan).connect(this.extBus);
      c = { station: 0, hooked: 0, gen: 0, dying: false, cab, ext, pan, seen: 0, aboard };
      this.chains.set(id, c);
    }
    c.seen = this.frameN; c.dying = false;
    const t = this.ctx.currentTime;
    if (station !== c.station) {
      c.station = station; const gen = ++c.gen;
      if (station > 0) {
        const resume = c.hooked === station;          // (back on before the last let-go: still wired, mid-fade)
        if (!resume) {
          this.unhook(c);
          const s = this.station(station);
          if (s) { s.out.connect(c.cab); s.out.connect(c.ext); s.users++; c.hooked = station; this.start(s, clock); }
        }
        // a station comes in: fade up from silence (the dial's static covers the first moment) — never a hard cut
        for (const g of [c.cab.gain, c.ext.gain]) { const v0 = resume ? g.value : 0; g.cancelScheduledValues(t); g.setValueAtTime(v0, t); (g as AudioParam & { __v?: number }).__v = v0; }
      } else if (c.hooked > 0) {
        // switched off: it fades out under the dial's click (~60 ms) and then lets go — no cut-off mid-waveform
        for (const g of [c.cab.gain, c.ext.gain]) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(0, t, 0.02); (g as AudioParam & { __v?: number }).__v = 0; }
        setTimeout(() => { if (c.gen === gen && c.station === 0) this.unhook(c); }, 160);
      }
    }
    const on = station > 0 ? vol : 0;
    setT(c.cab.gain, aboard ? on * CAB : 0, t, aboard === c.aboard ? 0.12 : 0.08, 0.002, true);
    setT(c.ext.gain, aboard ? 0 : on * OUT * Math.min(1, Math.max(0, (MAX_D - d) / 16)), t, 0.1, 0.002, true);   // (faded out over the last 16 m)
    c.aboard = aboard;
    const p = c.pan;
    if (p.positionX) { setT(p.positionX, pos[0], t, 0.03, 0.02, true); setT(p.positionY, pos[1], t, 0.03, 0.02, true); setT(p.positionZ, pos[2], t, 0.03, 0.02, true); }
    else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos[0], pos[1], pos[2]);
  }
  /** after this frame's set() calls: tuk-tuks not heard from fade out; stations nobody tunes to pause; a station that
   *  drifted off the broadcast clock (a stall) is put back on it; the gunfire duck releases */
  frame() {
    const t = this.ctx.currentTime, now = performance.now();
    for (const [id, c] of this.chains) {
      if (c.seen === this.frameN || c.dying) continue;
      c.dying = true; c.station = 0; c.gen++;
      this.unhook(c);
      setT(c.cab.gain, 0, t, 0.05, 0.002, true); setT(c.ext.gain, 0, t, 0.05, 0.002, true);
      setTimeout(() => { if (this.chains.get(id) === c && c.dying) { c.cab.disconnect(); c.ext.disconnect(); c.pan.disconnect(); this.chains.delete(id); } }, 400);
    }
    for (const s of this.stations.values()) {
      if (s.users > 0) {
        s.idleAt = 0;
        // ~twice a second: still on the broadcast clock? (a buffering stall leaves the element behind the match)
        if (s.playing && now > s.checkAt && s.el.readyState >= 1 && !s.el.seeking) {
          s.checkAt = now + 500;
          const def = STATIONS[s.k]!, want = broadcastAt(s.k, this.clock);
          let dt = Math.abs(s.el.currentTime - want); dt = Math.min(dt, def.dur - dt);
          if (dt > RESYNC) this.seek(s);
        }
        continue;
      }
      if (s.playing) { if (!s.idleAt) s.idleAt = now; else if (now - s.idleAt > 600) { s.el.pause(); s.playing = false; } }
    }
    if (this.ducked && t > this.duckUntil) {
      this.ducked = false; this.duckDb = 0;
      const p = this.cabBus.gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(1, t, 0.5);
    }
    this.frameN++;
  }
  /** gunfire: the cab radio dips `db` (< 0) and holds at least `hold` s (a deeper duck wins; each shot extends it) —
   *  your own shots ~-7…-9 dB, a fight near you by its level (audio/index.ts) */
  duck(db: number, hold = 0.35) {
    const t = this.ctx.currentTime;
    if (!this.ducked || db < this.duckDb - 0.5) {
      this.duckDb = db; this.ducked = true;
      const p = this.cabBus.gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(Math.pow(10, db / 20), t, 0.02);
    }
    this.duckUntil = Math.max(this.duckUntil, t + hold);
  }
  /** a chain lets go of the station wired into it */
  private unhook(c: Chain) {
    const s = c.hooked > 0 ? this.stations.get(c.hooked) : null;
    if (s) { try { s.out.disconnect(c.cab); s.out.disconnect(c.ext); } catch { /* */ } s.users--; }
    c.hooked = 0;
  }
  /** a station starts (again): rejoin the broadcast at the clock */
  private start(s: Station, clock: number) {
    this.clock = clock;
    if (s.playing) return;
    s.playing = true; s.idleAt = 0;
    this.seek(s);
    void s.el.play().catch(() => { s.playing = false; });
  }
  private seek(s: Station) {
    if (s.el.readyState < 1) return;              // (no metadata yet: loadedmetadata calls back)
    try { s.el.currentTime = broadcastAt(s.k, this.clock); } catch { /* */ }
    s.checkAt = performance.now() + 1500;
  }
  private noiseBuf() {
    if (this.noise) return this.noise;
    const n = this.ctx.sampleRate, b = this.ctx.createBuffer(1, n, n), d = b.getChannelData(0);
    let seed = 1234567, crackle = 0;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const w = seed / 0x7fffffff * 2 - 1;
      // white noise + sparse crackle pops (the dial between stations)
      if ((seed & 0xfff) === 7) crackle = 1; crackle *= 0.995;
      d[i] = w * 0.6 + (seed & 1 ? crackle : -crackle) * 0.5;
    }
    return (this.noise = b);
  }
  /** the dial turning: ~0.25 s of soft static sweeping up the band (the station fades up under it), in the cab or from
   *  the tuk-tuk */
  tune(id: number, aboard: boolean) {
    const c = this.chains.get(id), t = this.ctx.currentTime;
    if (!aboard && !c) return;
    const src = this.ctx.createBufferSource(), bp = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noiseBuf(); src.loop = true;
    bp.type = "bandpass"; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(aboard ? 0.13 : 0.3, t + 0.02); g.gain.setTargetAtTime(0, t + 0.1, 0.06);
    src.connect(bp).connect(g);
    if (aboard || !c) g.connect(this.cabBus); else g.connect(c.pan);
    src.start(t, Math.random() * 0.5); src.stop(t + 0.5);
    src.onended = () => { src.disconnect(); bp.disconnect(); g.disconnect(); };
  }
  /** what is playing (tests / the tracker): station → { playing, t (s into the broadcast), want (the clock's), users } */
  stats() {
    const o: Record<string, { playing: boolean; t: number; want: number; users: number; ready: number }> = {};
    for (const [k, s] of this.stations) o[STATIONS[k]!.name] = { playing: s.playing && !s.el.paused, t: +s.el.currentTime.toFixed(2), want: +broadcastAt(k, this.clock).toFixed(2), users: s.users, ready: s.el.readyState };
    return o;
  }
}
