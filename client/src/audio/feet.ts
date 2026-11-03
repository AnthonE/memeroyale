// FOOT-PLANT DRIVEN STEPS (not distance strides). The audio engine voices every footstep itself, on the animation's
// own foot plants:
//  - YOUR feet (first person): the camera's view bob IS the 1P walk animation (render.ts firstPersonCamera: the eye dips
//    with sin(2·bobT) — lowest point = heel strike). A step is scheduled at the exact moment the bob reaches its trough
//    (predicted from bobT and its rate, sample-accurate on the audio clock), so the sound lands with the camera dip.
//  - OTHER kongs (third person): the kong rig's planted-foot solver (actors/kong-rig.ts stepFeet: each foot swings for
//    `dur` s and PLANTS when its swing parameter u reaches 1). The plant is scheduled at (1 − u)·dur ahead when it falls
//    before the next frame, else voiced on the swing → stance edge. Crouch-walkers are heard (the crouch set, quiet),
//    idle foot shuffles give a soft scuff.
//  - A CROWD is not 49 pairs of feet (in the warm-up they would drown out everything else): only the
//    NEAR_K nearest moving kongs are voiced (enemies before teammates, with a little hysteresis so a voice does not
//    flicker between two kongs at the same range), their feet dip with how many kongs are moving around you (≤ 8 dB),
//    and in the warm-up (match phase 0) another WARMUP_DB. One or two kongs about — a real fight's case — are untouched.
//    The engine applies `othersDb` to every other kong's foot sound (plants, lands, jumps), scales the beds' duck under
//    an enemy's step by `bedDuck`, and voices another kong's land / jump only when `nearFoot` says it is one of them.
// Everything is read from the match's debug handle (`window.__kr.game`: cm.pred, render.bobT, render.actors), never
// required: without it (offline renders, the audition) the engine keeps its plain paths.

export type StepKind = "walk" | "run" | "crouch" | "land";
export interface FootEvent { local: boolean; kind: StepKind; x: number; y: number; z: number; at: number; volume: number; rate: number; id: number }

// shared/sim/player.ts `PS` is a const enum (not importable at runtime under isolatedModules): mirrored here
const PS_GROUND = 0;

interface PredLike { st: number; grounded: boolean; swim?: boolean; hp: number; vx: number; vz: number; crouch: boolean; sprint: boolean; mvT: number; x: number; y: number; z: number }
interface FootLike { swing: boolean; u: number; dur: number; loco: boolean; plant: { x: number; y: number; z: number }; pos: { x: number; y: number; z: number } }
interface PoseLike { x: number; y: number; z: number; vx: number; vz: number; state: string; crouch: boolean; sprint: boolean; friendly?: boolean }
interface ActorSlotLike { id: number; pose: PoseLike; actor: { animator?: { feet: FootLike[] } } }
interface RenderLike { bobT: number; actors: Map<number, ActorSlotLike> }
interface GameLike { cm?: { pred?: PredLike; me?: number; phase?: number } | null; render?: RenderLike | null }

/** per remote kong: the swing tracking, its distance this frame and the frame it was last among the voiced nearest */
interface RemoteFeet { sw: [boolean, boolean]; u: [number, number]; swing: [number, number]; sched: [number, number]; seen: number; d: number; x: number; z: number; near: number }

const TAU = Math.PI * 2;
/** remote steps are voiced within this range (m) — enemy feet are gameplay information */
const REMOTE_RANGE = 45;
/** only this many other kongs' feet are voiced at once — the nearest moving ones */
const NEAR_K = 3;
/** a voiced kong keeps its slot until another is this much nearer (m) */
const NEAR_HYST = 1.5;
/** a teammate ranks as if this much further away (m): an enemy's feet win the slot */
const FRIEND_RANK = 20;
/** kongs moving within this range (m) make the crowd (a teammate counts half) */
const CROWD_R = 20;
/** the crowd's dip: 10·log10(n / 2) dB past two kongs, at most this much */
const CROWD_MAX_DB = 8;
/** others' feet in the warm-up (match phase 0, the lobby islet: nothing counts yet) */
const WARMUP_DB = -7;

export class FootDriver {
  /** true while the driver has a live match handle (the engine then drops gameplay's distance-stride `step:*` calls) */
  active = false;
  /** plants voiced (stats / tests): local, remote */
  local = 0; remote = 0;
  /** last local plants [scheduled audio time, bob-trough time estimate] — tests read the sync error from these */
  readonly log: Array<{ t: number; kind: StepKind; local: boolean; lead: number }> = [];
  private lastBob = NaN; private bobRate = 0; private schedK = -1e9; private wasMoving = false;
  private feet = new Map<number, RemoteFeet>();
  private frame = 0;
  /** dB on every other kong's foot sound (crowd dip + warm-up), smoothed; 0 when one or two kongs are about */
  othersDb = 0;
  /** 0..1: how much another kong's step may pull the beds back (1 = one or two about; 0 = a crowd / the warm-up) */
  bedDuck = 1;
  /** kongs moving within CROWD_R (teammates half) and kongs voiced, this frame (stats) */
  crowd = 0; voiced = 0;
  // the nearest-K selection (reused: no garbage per frame)
  private nearQ: (RemoteFeet | null)[] = new Array(NEAR_K).fill(null);
  private nearKey = new Float64Array(NEAR_K);
  private nearX = new Float64Array(NEAR_K); private nearZ = new Float64Array(NEAR_K);

  /** another kong's land / jump at (x, z): voiced when fewer than NEAR_K kongs' feet are (a match: one or two about), else
   * only when it is one of them (within 2.5 m of a voiced kong) — the warm-up islet's 49 hopping kongs are not */
  nearFoot(x: number, z: number): boolean {
    if (!this.active || this.voiced < NEAR_K) return true;
    for (let j = 0; j < this.voiced; j++) { const dx = x - this.nearX[j], dz = z - this.nearZ[j]; if (dx * dx + dz * dz < 6.25) return true; }
    return false;
  }

  constructor(private emit: (e: FootEvent) => void) {}

  /** call once per rendered frame after the game updated (render.ts calls audio.update last) */
  tick(dt: number, now: number, listener: readonly number[]) {
    let g: GameLike | undefined;
    try { g = (globalThis as unknown as { __kr?: { game?: GameLike } }).__kr?.game; } catch { g = undefined; }
    const p = g?.cm?.pred, r = g?.render;
    this.active = !!(p && r && typeof r.bobT === "number" && r.actors);
    if (!this.active) { this.othersDb = 0; this.bedDuck = 1; this.voiced = 0; }
    if (!this.active || !p || !r || dt <= 0 || dt > 0.25) { this.lastBob = NaN; return; }
    this.frame++;
    this.localFeet(p, r.bobT, dt, now);
    this.remoteFeet(r, listener, now, dt, g?.cm?.me ?? -1, g?.cm?.phase ?? 2);
  }

  private localFeet(p: PredLike, bobT: number, dt: number, now: number) {
    const sp = Math.hypot(p.vx, p.vz);
    // (swimming: no foot plants — the swim hands voice the strokes on their own beat, render.ts swimStroke)
    const moving = p.st === PS_GROUND && p.grounded && !p.swim && p.hp > 0 && sp > 0.8 && p.mvT <= 0;
    const prev = this.lastBob;
    this.lastBob = bobT;
    if (!Number.isFinite(prev)) return;
    const rate = (bobT - prev) / dt;
    if (rate > 0) this.bobRate = this.bobRate > 0 ? this.bobRate + (rate - this.bobRate) * 0.5 : rate;
    // bob phase of the eye height sin(2·bobT): troughs at 2·bobT = 3π/2 + 2πk
    const k = Math.floor((2 * bobT - 1.5 * Math.PI) / TAU);
    if (!moving) { this.wasMoving = false; this.schedK = k; return; }
    const kind: StepKind = p.crouch ? "crouch" : p.sprint ? "run" : "walk";
    if (!this.wasMoving) {
      // starting to move: the first plant is the next trough (no step for the one we are already past)
      this.wasMoving = true; this.schedK = k;
    }
    // a trough we crossed without having scheduled it (a rate jump / a long frame): voice it now
    if (k > this.schedK) { this.schedK = k; this.fire(true, kind, p.x, p.y, p.z, now, 0, -1); }
    // the next trough: schedule it on the audio clock when it falls before the next frame (+ a margin of at
    // least 60 ms, since a frame LONGER than this one (a hitch, a slow machine) used to skip past it and voice the step
    // late, up to a whole frame; 60 ms of bob-rate prediction errs < 5 ms)
    const next = (1.5 * Math.PI + TAU * (k + 1)) / 2;
    const lead = this.bobRate > 0 ? (next - bobT) / this.bobRate : Infinity;
    if (lead >= 0 && lead < Math.max(dt * 1.6, 0.06) && this.schedK < k + 1) { this.schedK = k + 1; this.fire(true, kind, p.x, p.y, p.z, now + lead, lead, -1); }
  }

  private remoteFeet(r: RenderLike, L: readonly number[], now: number, dt: number, me: number, phase: number) {
    const seen = this.frame;
    // pass 1: who is on foot and making steps, how far — the NEAR_K nearest are voiced (ranked: a teammate further back,
    // the kongs voiced last frame NEAR_HYST nearer), the movers within CROWD_R make the crowd
    const nq = this.nearQ, nk = this.nearKey;
    let nn = 0, crowd = 0;
    for (const a of r.actors.values()) {
      if (a.id === me) continue;
      const feet = a.actor?.animator?.feet, ps = a.pose;
      if (!feet || !ps) continue;
      const q = this.feet.get(a.id);
      if (!q) continue;
      const d = q.d = Math.hypot(ps.x - L[0], ps.y - L[1], ps.z - L[2]);
      q.x = ps.x; q.z = ps.z;
      // (a kong in the air — a hop, a step off a ledge — keeps its slot: its landing is one of the voiced feet)
      const air = ps.state === "jump" || ps.state === "fall";
      if (d > REMOTE_RANGE || !(air || ps.state === "idle" || ps.state === "move" || ps.state === "land")) continue;
      const moving = Math.hypot(ps.vx, ps.vz) > 0.6;
      if (moving && d < CROWD_R) crowd += ps.friendly ? 0.5 : 1;
      if (!moving && !air && !feet[0].swing && !feet[1].swing) continue;
      const key = d + (ps.friendly ? FRIEND_RANK : 0) - (q.near === seen - 1 ? NEAR_HYST : 0);
      // insertion into the K best (ascending key)
      let j = nn < NEAR_K ? nn++ : NEAR_K;
      if (j === NEAR_K) { if (key >= nk[NEAR_K - 1]) continue; j = NEAR_K - 1; }
      while (j > 0 && nk[j - 1] > key) { nk[j] = nk[j - 1]; nq[j] = nq[j - 1]; j--; }
      nk[j] = key; nq[j] = q;
    }
    for (let j = 0; j < nn; j++) { const q = nq[j]!; q.near = seen; this.nearX[j] = q.x; this.nearZ[j] = q.z; nq[j] = null; }
    this.crowd = crowd; this.voiced = nn;
    // the crowd's dip + the warm-up's: down fast (a crowd forms → its feet sink in ~0.15 s), back up slowly (~0.8 s)
    const target = (crowd > 2 ? -Math.min(CROWD_MAX_DB, 10 * Math.log10(crowd / 2)) : 0) + (phase === 0 ? WARMUP_DB : 0);
    this.othersDb += (target - this.othersDb) * (1 - Math.exp(-dt / (target < this.othersDb ? 0.15 : 0.8)));
    this.bedDuck = phase === 0 ? 0 : Math.min(1, Math.max(0, (6 - crowd) / 4));
    // pass 2: every kong's swings are tracked (each plant voiced once); only the voiced ones' plants sound
    for (const a of r.actors.values()) {
      const id = a.id;
      if (id === me) continue;
      const feet = a.actor?.animator?.feet, ps = a.pose;
      if (!feet || !ps) continue;
      let q = this.feet.get(id);
      if (!q) { q = { sw: [feet[0].swing, feet[1].swing], u: [feet[0].u, feet[1].u], swing: [0, 0], sched: [-1, -1], seen, d: Infinity, x: 0, z: 0, near: -1 }; this.feet.set(id, q); continue; }
      const gap = seen - q.seen; q.seen = seen;
      const d = q.d;
      const onFoot = ps.state === "idle" || ps.state === "move" || ps.state === "land";
      const voice = q.near === seen;
      for (let i = 0; i < 2; i++) {
        const f = feet[i], was = q.sw[i];
        // a new swing (lift-off, or a swing restarted before it planted): its own id, so each plant is voiced once
        if (f.swing && (!was || f.u < q.u[i])) q.swing[i]++;
        q.sw[i] = f.swing; q.u[i] = f.u;
        if (gap > 1 || !onFoot || d > REMOTE_RANGE || !voice) { q.sched[i] = q.swing[i]; continue; }
        const sp = Math.hypot(ps.vx, ps.vz);
        const kind: StepKind = ps.crouch ? "crouch" : ps.sprint && sp > 6 ? "run" : "walk";
        // settle shuffles (not a locomotion swing): a soft scuff
        const vol = f.loco ? 1 : 0.45;
        const k: StepKind = f.loco ? kind : "crouch";
        if (f.swing) {
          // schedule the plant ahead when it lands before the next frame (u advances dt / dur per frame)
          const lead = (1 - f.u) * f.dur;
          if (q.sched[i] !== q.swing[i] && lead < Math.max(dt * 1.6, 0.06)) { q.sched[i] = q.swing[i]; this.fire(false, k, f.pos.x, ps.y, f.pos.z, now + lead, lead, id, vol); }
        } else if (was && q.sched[i] !== q.swing[i]) {
          // swing → stance this frame and not scheduled: voice it now
          q.sched[i] = q.swing[i]; this.fire(false, k, f.plant.x, ps.y, f.plant.z, now, 0, id, vol);
        }
      }
    }
    if (this.feet.size > 64) for (const [id, q] of this.feet) if (seen - q.seen > 600) this.feet.delete(id);
  }

  private fire(local: boolean, kind: StepKind, x: number, y: number, z: number, at: number, lead: number, id: number, vol = 1) {
    if (local) this.local++; else this.remote++;
    this.log.push({ t: at, kind, local, lead });
    if (this.log.length > 2048) this.log.splice(0, 1024);
    this.emit({ local, kind, x, y, z, at, volume: vol, rate: 1, id });
  }
}
