// Master dynamics as an AudioWorklet: a stereo-linked glue compressor + a 1.33 ms look-ahead TRUE-PEAK brickwall limiter
// in one node. Replaces DynamicsCompressorNode (whose fixed 6 ms look-ahead would push call→sound past 20 ms).
// True peak (a sample-only detector let the 1P sniper reach -0.76 dBTP outdoors, -0.11 dBTP in a room): the
// detector also sees the INTER-SAMPLE peaks — a 4× oversampled estimate (8-tap
// windowed-sinc interpolation at 1/4, 1/2 and 3/4 of every sample interval, as ITU-R BS.1770 true peak) — and the ceiling
// is -1.5 dBTP, so the output's true peak stays ≤ -1 dBTP with the gain ripple's margin.
// Loudness (for a loud, dense mix: combat at -16..-14 LUFS integrated, true peak <= -1 dBTP; the
// undriven mix sits at -24.5 LUFS with a 22 dB peak-to-loudness ratio): a DRIVE stage in front (port message {drive: dB},
// default MASTER_DRIVE_DB in mixer.ts) lifts the whole mix; the glue threshold moves up with it (it still only touches a
// pile-up, never one shot) and the true-peak limiter got a DUAL release — a gunshot's 1-3 ms pressure spike is shaved and
// the gain is back within ~10 ms (no pumping of the body / the beds behind it); only a sustained overload (≥ ~40 ms: an
// explosion, a firefight's pile-up) engages the slow 150 ms release.
// Loaded from a Blob URL so no extra file needs serving; if AudioWorklet is unavailable the mixer keeps its
// DynamicsCompressor fallback.
const SRC = /* js */ `
class KrMaster extends AudioWorkletProcessor {
  constructor() {
    super();
    this.L = 64;
    this.b0 = new Float32Array(this.L); this.b1 = new Float32Array(this.L); this.win = new Float32Array(this.L).fill(1);
    this.w = 0; this.g = 1; this.env = 0; this.gr = 0; this.n = 0;
    this.ceil = Math.pow(10, -1.5 / 20);
    // true-peak interpolator: 3 fractional phases × 8 taps (Hann-windowed sinc), over the last 8 compressed samples
    this.h0 = new Float32Array(8); this.h1 = new Float32Array(8); this.hp = 0;
    this.fir = [0.25, 0.5, 0.75].map((f) => { const c = new Float32Array(8); let s = 0;
      for (let k = 0; k < 8; k++) { const t = k - 3 - f, x = Math.PI * t, sinc = Math.abs(t) < 1e-9 ? 1 : Math.sin(x) / x;
        const wn = 0.5 + 0.5 * Math.cos(Math.PI * t / 4.5); c[k] = sinc * wn; s += c[k]; }
      for (let k = 0; k < 8; k++) c[k] /= s; return c; });
    this.thr0 = -3; this.ratio = 2.0; this.knee = 6; // glue: only a pile-up of loud sounds, never one shot
    this.drive = 1; this.thr = this.thr0;
    this.port.onmessage = (e) => { const d = e.data && e.data.drive; if (typeof d === "number") { this.drive = Math.pow(10, d / 20); this.thr = this.thr0 + d; } };
    this.gs = 1; this.sAtt = 1 - Math.exp(-1 / (0.04 * sampleRate)); this.sRel = 1 - Math.exp(-1 / (0.15 * sampleRate));
    this.cAtt = 1 - Math.exp(-1 / (0.004 * sampleRate));
    this.cRel = 1 - Math.exp(-1 / (0.18 * sampleRate));
    this.lAtt = 1 - Math.exp(-5 / this.L);
    this.lRel = 1 - Math.exp(-1 / (0.009 * sampleRate));
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const o0 = out[0], o1 = out[1] || out[0];
    const n = o0.length;
    const l = inp && inp[0] ? inp[0] : null, r = inp && inp[1] ? inp[1] : l;
    const L = this.L, b0 = this.b0, b1 = this.b1, win = this.win, ceil = this.ceil;
    let w = this.w, g = this.g, gs = this.gs, env = this.env, minG = 1;
    const dv = this.drive;
    for (let i = 0; i < n; i++) {
      const x0 = l ? l[i] * dv : 0, x1 = r ? r[i] * dv : 0;
      const a = Math.max(Math.abs(x0), Math.abs(x1));
      env += (a - env) * (a > env ? this.cAtt : this.cRel);
      const lv = 20 * Math.log10(env + 1e-9), over = lv - this.thr;
      let gdb = 0;
      if (over > this.knee / 2) gdb = -over * (1 - 1 / this.ratio);
      else if (over > -this.knee / 2) gdb = -(1 - 1 / this.ratio) * (over + this.knee / 2) * (over + this.knee / 2) / (2 * this.knee);
      const cg = Math.pow(10, gdb / 20);
      const y0 = x0 * cg, y1 = x1 * cg;
      // true peak of the compressed signal: this sample and the 3 interpolated points in the interval 3-4 samples back
      // (the interpolator needs 4 samples of future; the 64-sample look-ahead window covers the lag)
      const h0 = this.h0, h1 = this.h1; let hp = this.hp;
      h0[hp] = y0; h1[hp] = y1; hp = (hp + 1) & 7; this.hp = hp;
      let pk = Math.max(Math.abs(y0), Math.abs(y1));
      if (pk > ceil * 0.5 || Math.abs(h0[(hp + 3) & 7]) > ceil * 0.5 || Math.abs(h1[(hp + 3) & 7]) > ceil * 0.5) {
        for (let f = 0; f < 3; f++) {
          const c = this.fir[f]; let s0 = 0, s1 = 0;
          for (let k = 0; k < 8; k++) { const q = (hp + k) & 7; s0 += c[k] * h0[q]; s1 += c[k] * h1[q]; }
          const a2 = Math.max(Math.abs(s0), Math.abs(s1)); if (a2 > pk) pk = a2;
        }
      }
      win[w] = pk > ceil ? ceil / pk : 1;
      let m = 1;
      for (let k = 0; k < L; k++) if (win[k] < m) m = win[k];
      g += (m - g) * (m < g ? this.lAtt : this.lRel);
      // (dual release: the slow gain follows the needed reduction only when it lasts ≥ ~40 ms, and lets go over 150 ms)
      gs += (m - gs) * (m < gs ? this.sAtt : this.sRel);
      const gg = g < gs ? g : gs;
      const d0 = b0[w] * gg, d1 = b1[w] * gg;
      b0[w] = y0; b1[w] = y1;
      w = w + 1 === L ? 0 : w + 1;
      o0[i] = d0 > ceil ? ceil : d0 < -ceil ? -ceil : d0;
      if (out[1]) o1[i] = d1 > ceil ? ceil : d1 < -ceil ? -ceil : d1;
      const tg = gg * cg;
      if (tg < minG) minG = tg;
    }
    this.w = w; this.g = g; this.gs = gs; this.env = env;
    this.gr = Math.min(this.gr, 20 * Math.log10(minG));
    if (++this.n % 8 === 0) { this.port.postMessage(this.gr); this.gr = 0; }
    return true;
  }
}
registerProcessor("kr-master", KrMaster);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();

export function installMaster(ctx: BaseAudioContext): Promise<AudioWorkletNode | null> {
  if (!ctx.audioWorklet || typeof Blob === "undefined") return Promise.resolve(null);
  let p = loaded.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([SRC], { type: "text/javascript" }));
    p = ctx.audioWorklet.addModule(url).then(() => true, () => false);
    loaded.set(ctx, p);
  }
  return p.then((ok) => {
    if (!ok) return null;
    try {
      return new AudioWorkletNode(ctx, "kr-master", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
    } catch { return null; }
  });
}
