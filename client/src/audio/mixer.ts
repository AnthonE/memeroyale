// The mix graph.
//
//   voices ─┬─► p1 (your gun, your feet) ───────────────────────────────┐
//           ├─► p3 (other players) ──► duck3p ──► envLP ─┐              │
//           ├─► world (explosions, chests, storm, plane) ► duckW ──► envLP ┤
//           ├─► amb (beds + sprinkles) ──► duckAmb ► ambLP ──────────────┤
//           ├─► ui (hit confirms, UI, stings — never ducked/filtered) ──┤
//           └─► sends: room (indoor IR) / yard (outdoor IR) ───────────┘
//                                                   master ─► shock LP ─► bus compressor ─► soft clip ─┬─► full range ───► out
//                                                                                                     └─► range comp ► reduced ┘
//
// Player preferences (SETTINGS → AUDIO): Combat / Interface / Ambience multiply the bus trims (setMix, 1 = the authored
// mix) and DYNAMIC RANGE picks the output path (setDynamicRange; FULL = the authored mix, the reduced path is silent).
//
// Master dynamics = one AudioWorklet (limiter.ts): glue compressor + 1.33 ms look-ahead brickwall at -1 dBFS, then a
// static soft-clip curve (transparent below -3 dBFS, never above -0.2 dBFS) as the last safety. DynamicsCompressorNode
// is only the fallback when AudioWorklet is missing (its fixed 6 ms look-ahead costs latency).
import { installMaster } from "./limiter";
import { setT } from "./param";

/** `near` (swimming): YOUR body right at your ears under water — your strokes, exhaled bubbles,
 *  heartbeat, the dive / surfacing — past the underwater muffle and the cue / confirm ducks (they carry the underwater
 *  colour themselves), on the Combat volume */
export type Bus = "p1" | "p3" | "world" | "amb" | "ui" | "near";

// bus trims (dB) — the mix hierarchy, measured with the audition tool's 100 ms "impulse loudness":
// your gun is the loudest recurring thing but sits UNDER the master's glue threshold (no pumping on single shots); hit
// feedback cuts through it; the island's beds sit well under it and leave the 250 Hz-2 kHz band to distant gunfire
/** the master DRIVE (dB) in front of the glue + true-peak limiter (limiter.ts). DEFAULT 0 (measured:
 * +9.5 dB took combat from -24.4 to -18.4 LUFS (TP -1.43 dBTP) but shaved every 1P spike to the
 * ceiling — the sniper's 1P rise read 32 ms (target: <= 3 ms), first-peak dominance 0.7-2.8 dB and the sniper fell from
 * the loudest 1P gun (+2.3 dB) to -1.7); even +2 dB costs the sniper lead. `setDrive(db)` keeps
 * it as an opt-in "loud / small speakers" mix. */
export const MASTER_DRIVE_DB = 0;
export const BUS_DB: Record<Bus, number> = { p1: -1, p3: 0, world: 0, amb: -10, ui: -1, near: -1 };

const dbToGain = (db: number) => Math.pow(10, db / 20);

export class Mixer {
  readonly out: GainNode;
  /** DYNAMIC RANGE (setDynamicRange): FULL passes the soft clip straight out; REDUCED sends it through one more
   *  compressor instead (its make-up gain trimmed) */
  private rangeCompressor: DynamicsCompressorNode;
  private fullRange: GainNode;
  private reducedRange: GainNode;
  readonly master: GainNode;
  readonly buses: Record<Bus, GainNode>;
  readonly room: ConvolverNode;
  readonly yard: ConvolverNode;
  readonly roomSend: GainNode;
  readonly yardSend: GainNode;
  /** STREET SLAPS — the walls within ~20 m of you throw your shots back as discrete slaps 10-120 ms later (a market lane,
   * a container row, a courtyard). A 6-tap early-reflection network on the audio thread (4 walls + 2 flutter slaps between opposite walls) (no per-shot cost): mono in →
   * per tap delay (2·r/343) → bright low-pass → gain → pan (the wall's side) → out. index.ts feeds guns / blasts near you
   * into `erSend` and re-aims the taps at the nearest walls as you move (setER) */
  readonly erSend: GainNode;
  /** reverb sends per bus + space (reverbInput): the category levels scale a voice's reverb with its dry sound */
  private preferenceSends = new Map<string, GainNode>();
  private userMix = { combat: 1, ui: 1, ambience: 1 };
  private er: { d: DelayNode; lp: BiquadFilterNode; g: GainNode; pan: StereoPannerNode | null }[] = [];
  readonly shock: BiquadFilterNode;
  readonly comp: DynamicsCompressorNode;
  /** the blast itself (explosions within shell-shock range) enters AFTER the shell-shock filter — the world goes dull
   * around it, the blast's own crack, body and falling debris stay bright (otherwise the filter closes on the blast's own
   * 1-4 kHz body and debris 60 ms in). It follows the storm / indoor env filter like the world bus. */
  readonly blast: GainNode;
  private blastLP: BiquadFilterNode;
  /** resolves once the worklet limiter is in the chain (or the fallback is final) */
  readonly ready: Promise<void>;
  /** gain reduction of the master limiter, dB (negative), updated ~45×/s */
  limiterGR = 0;
  /** the deepest limiter gain reduction since the context started (dB, ≤ 0) — "no shot is limited" is measurable */
  limiterGRMax = 0;
  private driveDb = MASTER_DRIVE_DB;
  private limiterNode: AudioWorkletNode | null = null;
  usingWorklet = false;
  private pre: GainNode;
  private duck3p: GainNode;
  private duckW: GainNode;
  private duckAmb: GainNode;
  /** remote gunfire / explosions: the beds dip a few dB while a fight is audible (scheduled at the sound's arrival) */
  private duckAmbFar: GainNode;
  /** the island holds its breath as the storm wall nears (beds dip ≤ 7 dB on the safe side within ~250 m) */
  private stormAmb: GainNode;
  private ambLP: BiquadFilterNode;
  private uwLP: BiquadFilterNode;
  private uwG: GainNode;
  private uwK = 0;
  private ambBand: BiquadFilterNode;
  private envLP: BiquadFilterNode;
  private indoor = 0;
  /** everything but the UI bus passes through here — a drop cue (GO, RAMP OPEN) pulls the whole world down 9 dB */
  private cueG: GainNode;
  /** a hit confirm's tick owns 15-110 ms after it: everything but the UI bus (your gun, `hurt`, the reverbs, the beds)
   * dips 6 dB and other players' guns 12 dB (without it, 2 of 10 confirms in a close fight fell to +3 dB over an enemy SMG shot /
   * your hurt landing on them) */
  private conf3p: GainNode;
  private confAll: GainNode;
  /** `hurt` (you took damage) enters the p1 bus here — a confirm pushes it 9 dB further aside (the two collide in every
   * close fight: your hurt landing on your own confirm's tick is the worst case) */
  readonly hurtIn: GainNode;

  constructor(private ctx: BaseAudioContext) {
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.out = g(1);
    this.master = g(1);
    this.shock = ctx.createBiquadFilter();
    // (idle at Nyquist: a 20 kHz / Q 0.5 low-pass at 48 kHz still takes 2-3 dB off a 0.3 ms pressure spike — otherwise YOUR
    // sniper's first peak came out level with the blast behind it)
    this.shock.type = "lowpass"; this.shock.frequency.value = ctx.sampleRate / 2; this.shock.Q.value = 0.5;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.knee.value = 8; this.comp.ratio.value = 6;
    this.comp.attack.value = 0.002; this.comp.release.value = 0.15;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    // FULL range bypasses the extra compressor; REDUCED compensates the browser compressor's automatic make-up gain with
    // a measured -7.3 dB output trim
    this.rangeCompressor = ctx.createDynamicsCompressor();
    this.rangeCompressor.threshold.value = -24; this.rangeCompressor.knee.value = 12;
    this.rangeCompressor.ratio.value = 3; this.rangeCompressor.attack.value = 0.01; this.rangeCompressor.release.value = 0.2;
    this.fullRange = g(1); this.reducedRange = g(0);
    clip.connect(this.fullRange).connect(this.out);
    clip.connect(this.rangeCompressor).connect(this.reducedRange).connect(this.out);
    this.pre = g(1);
    this.master.connect(this.shock).connect(this.pre).connect(this.comp).connect(clip);
    this.ready = installMaster(ctx).then((node) => {
      if (!node) return;
      this.pre.disconnect();
      this.pre.connect(node).connect(clip);
      this.comp.disconnect();
      this.usingWorklet = true;
      this.limiterNode = node;
      node.port.postMessage({ drive: this.driveDb });
      node.port.onmessage = (e) => { this.limiterGR = e.data as number; if (this.limiterGR < this.limiterGRMax) this.limiterGRMax = this.limiterGR; };
    });
    this.out.connect(ctx.destination);
    this.blast = g(dbToGain(BUS_DB.world));
    this.blastLP = ctx.createBiquadFilter(); this.blastLP.type = "lowpass"; this.blastLP.frequency.value = 20000; this.blastLP.Q.value = 0.4;
    this.blast.connect(this.blastLP).connect(this.pre);

    this.buses = { p1: g(), p3: g(), world: g(), amb: g(), ui: g(), near: g() };
    this.duck3p = g(); this.duckW = g(); this.duckAmb = g(); this.duckAmbFar = g(); this.stormAmb = g();
    this.envLP = ctx.createBiquadFilter(); this.envLP.type = "lowpass"; this.envLP.frequency.value = 20000; this.envLP.Q.value = 0.4;
    this.ambLP = ctx.createBiquadFilter(); this.ambLP.type = "lowpass"; this.ambLP.frequency.value = 20000; this.ambLP.Q.value = 0.4;
    this.cueG = g(1);
    this.confAll = g(1);
    // under water everything but the UI goes through a closing low-pass and dips (idle at Nyquist = transparent)
    this.uwLP = ctx.createBiquadFilter(); this.uwLP.type = "lowpass"; this.uwLP.frequency.value = ctx.sampleRate / 2; this.uwLP.Q.value = 0.5;
    this.uwG = g(1);
    this.cueG.connect(this.confAll).connect(this.uwLP).connect(this.uwG).connect(this.master);
    this.conf3p = g();
    this.hurtIn = g(1);
    this.buses.p1.connect(this.cueG);
    this.buses.p3.connect(this.duck3p).connect(this.conf3p).connect(this.envLP);
    this.buses.world.connect(this.duckW).connect(this.envLP);
    this.envLP.connect(this.cueG);
    // bass management: beds + reverb returns stay out of the sub range the guns and explosions own; and a wide dip in the
    // 250 Hz-1.6 kHz band where a distant shot's report lives, so a fight 150-450 m away reads over the jungle
    const ambHP = ctx.createBiquadFilter(); ambHP.type = "highpass"; ambHP.frequency.value = 90; ambHP.Q.value = 0.6;
    const ambCarve = ctx.createBiquadFilter(); ambCarve.type = "peaking"; ambCarve.frequency.value = 640; ambCarve.Q.value = 0.55; ambCarve.gain.value = -6;
    // a far shot's arrival carves a 1-4 kHz HOLE in the beds (waterfall, river, canopy wind) rather
    // than only dipping them: its report lives there
    this.ambBand = ctx.createBiquadFilter(); this.ambBand.type = "peaking"; this.ambBand.frequency.value = 2000; this.ambBand.Q.value = 0.6; this.ambBand.gain.value = 0;
    this.buses.amb.connect(this.duckAmb).connect(this.duckAmbFar).connect(this.stormAmb).connect(ambHP).connect(ambCarve).connect(this.ambBand).connect(this.ambLP).connect(this.cueG);
    this.buses.ui.connect(this.master);
    this.buses.near.connect(this.master);
    for (const [k, v] of Object.entries(BUS_DB)) this.buses[k as Bus].gain.value = dbToGain(v);
    this.hurtIn.connect(this.buses.p1);

    this.room = ctx.createConvolver();
    this.room.buffer = impulse(ctx, 0.75, 0.004, 5200, 0.55, 11);
    this.yard = ctx.createConvolver();
    this.yard.buffer = impulse(ctx, 1.9, 0.025, 3800, 0.35, 23, [0.06, 0.13, 0.21]);
    this.roomSend = g(0); this.yardSend = g(1);
    const yardHP = ctx.createBiquadFilter(); yardHP.type = "highpass"; yardHP.frequency.value = 160; yardHP.Q.value = 0.6;
    const roomHP = ctx.createBiquadFilter(); roomHP.type = "highpass"; roomHP.frequency.value = 90; roomHP.Q.value = 0.6;
    this.roomSend.connect(this.room).connect(roomHP).connect(this.cueG);
    this.yardSend.connect(this.yard).connect(yardHP).connect(this.envLP);
    this.erSend = g(1); this.erSend.channelCount = 1; this.erSend.channelCountMode = "explicit";
    const erHP = ctx.createBiquadFilter(); erHP.type = "highpass"; erHP.frequency.value = 180; erHP.Q.value = 0.6;
    this.erSend.connect(erHP);
    for (let i = 0; i < 6; i++) {
      const d = ctx.createDelay(0.25); d.delayTime.value = 0.02 + i * 0.01;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000; lp.Q.value = 0.5;
      const gg = g(0);
      const pan = (ctx as AudioContext).createStereoPanner ? ctx.createStereoPanner() : null;
      erHP.connect(d).connect(lp).connect(gg);
      if (pan) gg.connect(pan).connect(this.cueG); else gg.connect(this.cueG);
      this.er.push({ d, lp, g: gg, pan });
    }
  }

  /** the entry point of `bus` for a voice whose buffer was decoded at `rate` Hz (< the context's rate): an anti-image
   * low-pass shared by every such voice of that bus (see antiImage). Full-rate voices get the bus itself */
  aaIn(bus: Bus, rate: number): AudioNode {
    if (!(rate < this.ctx.sampleRate - 1)) return this.buses[bus];
    const k = `${bus}@${rate}`;
    let n = this.aa.get(k);
    if (!n) {
      const c = antiImage(this.ctx, rate);
      if (c) { c.output.connect(this.buses[bus]); n = c.input; } else n = this.buses[bus];
      this.aa.set(k, n);
    }
    return n;
  }
  private aa = new Map<string, AudioNode>();

  /** aim the street-slap taps: per tap delay (s), linear gain, pan (-1 left … 1 right), low-pass Hz (unused taps: gain 0) */
  setER(taps: { delay: number; gain: number; pan: number; lp: number }[]) {
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.er.length; i++) {
      const e = this.er[i], q = taps[i];
      setT(e.g.gain, q ? q.gain : 0, t, 0.08, 0.02);
      if (!q) continue;
      setT(e.d.delayTime, q.delay, t, 0.06, 0.004);
      setT(e.lp.frequency, q.lp, t, 0.1, 0.02);
      if (e.pan) setT(e.pan.pan, q.pan, t, 0.08, 0.02);
    }
  }

  /** 0 = dry land, 1 = the camera under water — a 20 kHz → 450 Hz low-pass and -6 dB on everything but the UI */
  setUnderwater(k: number) {
    if (Math.abs(k - this.uwK) < 0.002) return;
    this.uwK = k;
    const t = this.ctx.currentTime;
    if (k === 0) {
      // back on land: EXACTLY Nyquist (identity) — a filter left a hair under it would round off your gun's pressure spike
      this.uwLP.frequency.cancelScheduledValues(t); this.uwLP.frequency.setValueAtTime(this.ctx.sampleRate / 2, t);
      this.uwG.gain.cancelScheduledValues(t); this.uwG.gain.setValueAtTime(1, t);
      return;
    }
    setT(this.uwLP.frequency, 20000 * Math.pow(450 / 20000, k), t, 0.03, 0.01);
    setT(this.uwG.gain, Math.pow(10, (-6 * k) / 20), t, 0.03, 0.01);
  }

  /** the master drive (dB, 0 = the wide undriven mix); the glue threshold moves with it (limiter.ts) */
  setDrive(db: number) {
    this.driveDb = Math.max(0, Math.min(12, db));
    this.limiterNode?.port.postMessage({ drive: this.driveDb });
  }
  get drive() { return this.usingWorklet ? this.driveDb : 0; }

  setMaster(v: number) {
    this.out.gain.setTargetAtTime(Math.max(0, Math.min(1.5, v)), this.ctx.currentTime, 0.02);
  }

  /** SETTINGS → AUDIO → DYNAMIC RANGE: "full" = the authored mix, "reduced" = louder events pulled down (quiet listening) */
  setDynamicRange(profile: "full" | "reduced") {
    const reduced = profile === "reduced", t = this.ctx.currentTime;
    this.fullRange.gain.setTargetAtTime(reduced ? 0 : 1, t, 0.02);
    this.reducedRange.gain.setTargetAtTime(reduced ? dbToGain(-7.3) : 0, t, 0.02);
  }

  /** SETTINGS → AUDIO category levels (0..1). They MULTIPLY the authored bus trims (1 = the mix exactly as authored);
   *  the reverbs are scaled at their inputs so combat and ambience never mute one another's returns */
  setMix(levels: { combat: number; ui: number; ambience: number }) {
    const unit = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
    this.userMix = { combat: unit(levels.combat), ui: unit(levels.ui), ambience: unit(levels.ambience) };
    const t = this.ctx.currentTime;
    for (const bus of Object.keys(this.buses) as Bus[]) this.buses[bus].gain.setTargetAtTime(dbToGain(BUS_DB[bus]) * this.categoryLevel(bus), t, 0.02);
    this.blast.gain.setTargetAtTime(dbToGain(BUS_DB.world) * this.userMix.combat, t, 0.02);
    this.erSend.gain.setTargetAtTime(this.userMix.combat, t, 0.02);
    for (const [key, node] of this.preferenceSends) node.gain.setTargetAtTime(this.categoryLevel(key.split(":")[0] as Bus), t, 0.02);
  }
  private categoryLevel(bus: Bus) { return bus === "amb" ? this.userMix.ambience : bus === "ui" ? this.userMix.ui : this.userMix.combat; }
  /** the room / yard reverb send for a voice of `bus` (one unity-gain node per bus + space at the default mix) */
  reverbInput(bus: Bus, space: "room" | "yard"): GainNode {
    const key = `${bus}:${space}`;
    let node = this.preferenceSends.get(key);
    if (!node) { node = this.ctx.createGain(); node.gain.value = this.categoryLevel(bus); node.connect(space === "room" ? this.roomSend : this.yardSend); this.preferenceSends.set(key, node); }
    return node;
  }

  /** own gunfire: pull the world back a few dB for ~a quarter second so your shots cut through */
  duck(strength = 1) {
    const t = this.ctx.currentTime;
    for (const [n, db] of [[this.duckAmb, -7], [this.duck3p, -3.5], [this.duckW, -2.5]] as const) {
      const p = n.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.setTargetAtTime(dbToGain(db * strength), t, 0.006);
      p.setTargetAtTime(1, t + 0.07, 0.16);
    }
  }

  /** a hit confirm lands at `at` (its tick 35 ms later): enemy guns and your own sounds make room for ~90 ms */
  duckConfirm(at: number) {
    const t = Math.max(at, this.ctx.currentTime);
    for (const [n, db] of [[this.conf3p, -6], [this.confAll, -6], [this.hurtIn, -9]] as const) {
      const p = n.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.setTargetAtTime(dbToGain(db), t + 0.015, 0.006);
      p.setTargetAtTime(1, t + 0.1, 0.03);
    }
  }

  /** a drop cue (GO / RAMP OPEN, on the UI bus): the world, your own sounds and the beds dip `db` under it for `hold` s */
  duckCue(db: number, hold = 0.8, at = this.ctx.currentTime) {
    const p = this.cueG.gain, t = Math.max(at, this.ctx.currentTime);
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(dbToGain(-Math.abs(db)), t, 0.015);
    p.setTargetAtTime(1, t + hold, 0.35);
  }

  /** remote gunfire / an explosion arriving at `at`: the ambience beds dip `db` for ~0.3 s and recover over ~1 s */
  duckFar(db: number, at: number) {
    const p = this.duckAmbFar.gain, t = Math.max(at, this.ctx.currentTime);
    // a broadband dip of 40 % of it + a 1-4 kHz band duck of the full amount (+2, ≤ 12 dB), held ~300 ms
    const g = dbToGain(-Math.abs(db) * 0.4);
    p.cancelScheduledValues(t);
    p.setTargetAtTime(g, t, 0.012);
    p.setTargetAtTime(1, t + 0.25, 0.45);
    const b = this.ambBand.gain;
    b.cancelScheduledValues(t);
    b.setTargetAtTime(-Math.min(12, Math.abs(db) + 2), t, 0.012);
    b.setTargetAtTime(0, t + 0.3, 0.35);
  }

  /** a near explosion: the world goes dull for a moment (and index.ts adds the tinnitus tone). `at` = when the blast
   * lands — the filter closes ~60 ms after it so the blast's own crack and thump come through bright first */
  shellshock(amount: number, at = this.ctx.currentTime) {
    const t = Math.max(at, this.ctx.currentTime), f = this.shock.frequency;
    f.cancelScheduledValues(t);
    f.setTargetAtTime(20000 * Math.pow(0.03, amount), t, 0.03);
    f.setTargetAtTime(this.ctx.sampleRate / 2, t + 0.5 + 1.2 * amount, 0.6);
  }

  /** the storm wall is `v` (0..1) close on the safe side: the beds dim up to 4 dB so the wall's roar carries */
  setStormNear(v: number) { setT(this.stormAmb.gain, dbToGain(-4 * v), this.ctx.currentTime, 0.6, 0.01); }

  /** indoors 0..1 (smoothed by caller): muffle the outside beds, swap the yard reverb for the room */
  setIndoor(v: number, inStorm: boolean, closeness = 0.5) {
    this.indoor = v;
    const t = this.ctx.currentTime;
    const ambF = 20000 * Math.pow(900 / 20000, v) * (inStorm ? 0.35 : 1);
    // (per frame: automation only when a value really moved — no event flood at 240 fps)
    setT(this.ambLP.frequency, Math.max(300, ambF), t, 0.15, 0.01);
    setT(this.envLP.frequency, inStorm ? 6500 : 20000, t, 0.3, 0.01);
    setT(this.blastLP.frequency, inStorm ? 6500 : 20000 * Math.pow(2500 / 20000, v), t, 0.3, 0.01);
    setT(this.roomSend.gain, v, t, 0.15, 0.01);
    setT(this.yardSend.gain, (1 - v * 0.9) * (0.45 + 0.9 * closeness), t, 0.4, 0.01);
  }
  get indoorAmount() { return this.indoor; }
}

/**
 * ANTI-IMAGE low-pass for a buffer decoded at `rate` < the context rate. The AudioBufferSourceNode resamples it with
 * linear interpolation, which mirrors the spectrum around the decode rate: a 24 kHz bed showed a notch at exactly 12 kHz
 * and its 6-8 kHz cicadas again as ghost bands at 16-18 kHz only 7-11 dB down. An 8th-order Chebyshev I
 * low-pass (4 biquad sections, 0.3 dB ripple, bilinear with the cutoff prewarped) just under the decode Nyquist removes
 * the images: 24 kHz → flat to 10 kHz, -29 dB at 12 kHz, -55 dB at 14 kHz; 32 kHz → flat to 14 kHz, -37 dB at 16 kHz.
 * null when the browser has no IIRFilterNode or nothing needs removing.
 */
export function antiImage(ctx: BaseAudioContext, rate: number): { input: AudioNode; output: AudioNode; nodes: AudioNode[] } | null {
  const fs = ctx.sampleRate;
  const fc = rate * (rate <= 24000 ? 0.4333 : 0.4375);
  if (fc > fs * 0.45) return null;
  // the 8th-order Chebyshev as FOUR BIQUADS (each pole pair = one resonant low-pass section, RBJ bilinear with the
  // same prewarp), not IIRFilterNodes: Chromium's IIRFilterNode constructor measures its own
  // tail time by running the filter's impulse response: 20-30 ms per node at this Q — the first loop / bed of each
  // (bus, rate) cost a single 85-124 ms play() in a live match.
  const n = 8, rip = 0.3;
  const eps = Math.sqrt(Math.pow(10, rip / 10) - 1), v = Math.asinh(1 / eps) / n;
  const K = 2 * fs, wc = K * Math.tan((Math.PI * fc) / fs);
  const input = ctx.createGain();
  const nodes: AudioNode[] = [input];
  let tail: AudioNode = input;
  for (let k = 1; k <= n / 2; k++) {
    const th = ((2 * k - 1) * Math.PI) / (2 * n);
    const re = -Math.sinh(v) * Math.sin(th) * wc, im = Math.cosh(v) * Math.cos(th) * wc;
    const w = Math.sqrt(re * re + im * im), qLin = w / (-2 * re);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = (fs / Math.PI) * Math.atan(w / K);
    f.Q.value = 20 * Math.log10(qLin);
    tail.connect(f); tail = f; nodes.push(f);
  }
  return { input, output: tail, nodes };
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4096, c = new Float32Array(new ArrayBuffer(n * 4));
  // linear to -1.5 dBFS (the worklet's true-peak ceiling): a -3 dBFS knee rounds every gunshot's spike off
  const knee = 0.841, ceil = 0.977; // -1.5 dBFS linear region, -0.2 dBFS ceiling
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    let y = a;
    if (a > knee) y = knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/** procedural stereo IR: exponentially decaying noise, HF damping that increases over time, optional early slaps */
export function impulse(ctx: BaseAudioContext, dur: number, pre: number, damp: number, level: number, seed: number, early: number[] = []): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor((dur + pre) * sr);
  const buf = ctx.createBuffer(2, n, sr);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const p0 = Math.floor(pre * sr);
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr;
      const env = Math.exp((-6.9 * t) / dur) * Math.min(1, t / 0.004);
      // one-pole lowpass whose cutoff falls with time: bright onset, dark tail
      const fc = damp * Math.exp(-t / (dur * 0.5)) + 300;
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      lp = lp * a + rnd() * (1 - a);
      d[i] = lp * env * 3;
    }
    for (const [k, e] of early.entries()) {
      const i = Math.floor((pre + e + ch * 0.0013) * sr);
      if (i < n) d[i] += 0.35 * (1 - k * 0.25) * (ch ? 0.85 : 1);
    }
    // energy-normalise
    let sum = 0;
    for (let i = 0; i < n; i++) sum += d[i] * d[i];
    const k = level / Math.sqrt(sum + 1e-12);
    for (let i = 0; i < n; i++) d[i] *= k;
  }
  return buf;
}
