// THE SURF YOU HEAR IS THE SURF YOU SEE.
// The water shader draws every breaker from one analytic phase (client/src/world/water/shader.ts COMMON):
//   ψ(x, z, t) = fract(t / wtrPeriod + coastPhase(x, z))        (0 = a bore reaches the waterline)
//   u = fract(ψ + shoreD / wtrSurfLen)                           (crests travel shoreward; a crest at u = 0 ≡ 1)
//   the crest breaks where the water is shallower than wtrBreakDepth (the lip curls at u > 0.9, the whitewater from u = 0)
// This module mirrors that phase on the CPU: on the nearest sloping beach it finds the break line (depth ≈ 0.8 ×
// wtrBreakDepth) in up to three places along the shore and the waterline nearest you, and schedules one real recorded
// crash per breaker at the instant its crest reaches the break line (the crash's loudness PEAK on that instant, plus the
// sound's travel time), and one lap at the waterline per swash arrival (ψ = 0). Live it reads the water's own uniforms
// (wtrTime, wtrPeriod, wtrSurfLen, wtrBreakDepth) and depth / shore distance through ctx.shared "water" (window.__kr.engine);
// offline renders (no water module) use the material's defaults on the audio clock and the terrain for depth.
// Lapping falls -6 dB per doubling of distance past 10 m (inverse distance from a 10 m reference).
import type { V3 } from "./world";

/** the water material's defaults (client/src/world/water/material.ts) — used when the live uniforms are not there */
export const SURF_DEFAULTS = { period: 8.5, surfLen: 17, breakDepth: 0.85 };
export function coastPhase(x: number, z: number): number {
  return Math.sin(x * 0.013 + z * 0.009) * 0.35 + Math.sin(x * 0.0051 - z * 0.0077) * 0.55 + Math.sin(z * 0.021 + 1.3) * 0.12;
}
const fract = (v: number) => v - Math.floor(v);
/** the shader's sin-free hash and its per-crest set amplitude (0.45..1) */
export function h1(p: number): number { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
export const setAmp = (id: number) => 0.45 + 0.55 * h1(id + 4.1);
/** the shader's 1D value noise (wtrVN1) */
export function vn1(x: number): number { const i = Math.floor(x), f = x - i; return h1(i + 1.7) + (h1(i + 2.7) - h1(i + 1.7)) * f * f * (3 - 2 * f); }
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** does the crest BREAK here? The shader (shader.ts "breaking sections along the crest") breaks each crest in
 * 10-30 m sections (~55 % of it): brkK *= smoothstep(0.36, 0.52, sectN * 0.8 + setAmp * 0.25 + vary2 * 0.1), sectN a value
 * noise along the shore hashed per crest. At a fixed point the crest that breaks there always has the same id
 * (crestId = floor(ψ + d / L + 0.1) at u = 0 → ceil(d / L)), so the pattern is fixed in space: mirrored here (vary2, a
 * texture noise, taken at its mean 0.5). `along` = the position along the shore (dot(xz, shoreT)). 0..1 */
export function breaksAt(along: number, d: number, Ls: number): number {
  const id = Math.max(0, Math.ceil(d / Ls));
  const sectN = vn1(along / 21 + id * 7.31) * 0.65 + vn1(along / 7 - id * 3.7) * 0.35;
  return sstep(0.36, 0.52, sectN * 0.8 + setAmp(id) * 0.25 + 0.05);
}
/** the next instant (water clock) ≥ t at which the crest crosses shore distance d at a point of coast phase cp */
export function nextCrest(t: number, cp: number, d: number, P: number, Ls: number): number {
  const ph = t / P + cp + d / Ls;
  return (Math.floor(ph) + 1 - cp - d / Ls) * P;
}

export interface WaterLike {
  depthAt(x: number, z: number): number;
  shoreDistanceAt(x: number, z: number): number;
  isUnderwater(): boolean;
  uniforms: Record<string, { value: unknown }>;
}
export interface SurfHost {
  readonly ctx: BaseAudioContext;
  readonly listener: { pos: V3 };
  readonly live: boolean;
  /** terrain height (offline depth) */
  height(x: number, z: number): number | null;
  water(): WaterLike | undefined;
  /** 0..1: how much open surf the ambience hears here (sheltered coves / caves / indoors take it down) */
  surfWeight(): number;
  surfShot(group: string, pos: V3, db: number, when: number, ref: number): void;
}
interface Pt { kind: "crash" | "lap"; x: number; z: number; d: number; cp: number; next: number; lvl: number; brk: number }
export interface SurfEvent { kind: "crash" | "lap"; at: number; water: number; x: number; z: number; d: number; dist: number }

export class SurfSync {
  pts: Pt[] = [];
  /** tools (surf check): voice only crashes or only laps */
  only?: "crash" | "lap";
  /** tools (surf timing check): voice only the nearest break point, so crashes never overlap in the measurement */
  one = false;
  /** 0..1: how close the nearest drawn breaker is (1 within 40 m, 0 past 120 m) — the engine never lets the ambience's
   * shore weight mute a breaker you can see right in front of you */
  nearK = 0;
  /** every scheduled crash / lap (audio time of the visual instant, water time, place) — the surf check reads it */
  readonly log: SurfEvent[] = [];
  private refreshT = 0;
  private lastL: V3 = [1e9, 0, 1e9];
  private params = { ...SURF_DEFAULTS };
  constructor(private h: SurfHost) {}

  /** the water clock now and the audio time that shows the same instant on screen */
  private clock(): { w: number; toAudio: (w: number) => number } {
    const now = this.h.ctx.currentTime, wa = this.h.water();
    const wt = wa?.uniforms?.wtrTime?.value;
    if (typeof wt === "number" && this.h.live) {
      // a frame drawn now is on screen ~1 frame later; what is scheduled at ctx time C is heard outputLatency after C
      const outLat = (this.h.ctx as AudioContext).outputLatency || 0;
      return { w: wt, toAudio: (w) => now + (w - wt) + 1 / 60 - outLat };
    }
    return { w: now, toAudio: (w) => w };
  }

  private depth(x: number, z: number): number | null {
    const wa = this.h.water();
    if (wa) return wa.depthAt(x, z);
    const g = this.h.height(x, z);
    return g === null ? null : -g;
  }

  /** sheltered water the shader keeps calm (the Murk, the Wreck lagoon, Wreck Bay's cove, the harbor basin) */
  private sheltered(x: number, z: number): boolean {
    const u = this.h.water()?.uniforms;
    if (!u) return false;
    const v = (k: string) => u[k]?.value as { x: number; y: number; z: number; w?: number } | undefined;
    for (const k of ["wtrMurkP", "wtrLagoonP", "wtrLagoon2P"]) { const p = v(k); if (p && Math.hypot(x - p.x, z - p.y) < p.z) return true; }
    const hb = v("wtrHarborP");
    if (hb && hb.w !== undefined && ((x - hb.x) * hb.z) ** 2 + ((z - hb.y) * hb.w) ** 2 < 1) return true;
    return false;
  }

  private refresh() {
    const L = this.h.listener.pos, u = this.h.water()?.uniforms;
    const num = (k: string, d: number) => { const v = u?.[k]?.value; return typeof v === "number" && v > 0 ? v : d; };
    this.params = { period: num("wtrPeriod", SURF_DEFAULTS.period), surfLen: num("wtrSurfLen", SURF_DEFAULTS.surfLen), breakDepth: num("wtrBreakDepth", SURF_DEFAULTS.breakDepth) };
    const BD = this.params.breakDepth * 0.8;
    const cands: { a: number; rW: number; W: [number, number]; B: [number, number]; dB: number; brk: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, dx = Math.sin(a), dz = -Math.cos(a);
      let rW = -1, rB = -1;
      for (let r = 0; r <= 220; r += 2) {
        const x = L[0] + dx * r, z = L[2] + dz * r, dp = this.depth(x, z);
        if (dp === null) break;
        if (rW < 0) { if (dp > 0.03) rW = r; continue; }
        if (dp >= BD) { rB = r; break; }
        if (r - rW > 70) break;
      }
      if (rW < 0 || rB < 0 || rB - rW < 2) continue;                     // no beach that way / a quay or cliff (no breakers drawn)
      const bx = L[0] + dx * rB, bz = L[2] + dz * rB;
      const far = this.depth(L[0] + dx * (rB + 25), L[2] + dz * (rB + 25));
      if (far === null || far < 1.2) continue;                            // a pond / a river bed, not the sea
      if (this.sheltered(bx, bz)) continue;
      const wa = this.h.water();
      const dB = wa ? Math.max(0.5, wa.shoreDistanceAt(bx, bz)) : rB - rW;
      // the shore's normal (toward open water) from the depth / shore-distance gradient → the along-shore coordinate
      const fld = (x: number, z: number) => (wa ? wa.shoreDistanceAt(x, z) : (this.depth(x, z) ?? 0));
      let nx = fld(bx + 2, bz) - fld(bx - 2, bz), nz = fld(bx, bz + 2) - fld(bx, bz - 2);
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-6) { nx /= nl; nz /= nl; } else { nx = dx; nz = dz; }
      const brk = breaksAt(bx * -nz + bz * nx, dB, this.params.surfLen);
      cands.push({ a, rW, W: [L[0] + dx * rW, L[2] + dz * rW], B: [bx, bz], dB, brk });
    }
    const old = this.pts;
    this.pts = [];
    if (!cands.length) return;
    cands.sort((p, q) => p.rW - q.rW);
    const n0 = cands[0];
    if (n0.rW > 230) return;
    // (crashes only where the drawn crest breaks — the nearest breaking section first; laps at the nearest waterline)
    const brks = cands.filter((c) => c.brk > 0.5 && Math.hypot(c.B[0] - n0.B[0], c.B[1] - n0.B[1]) < 90);
    const pick = brks.length ? [brks[0]] : [];
    for (const c of brks) {
      if (pick.length >= (this.one ? 1 : 3)) break;
      if (pick.every((p) => Math.hypot(p.B[0] - c.B[0], p.B[1] - c.B[1]) > 22) && Math.hypot(c.B[0] - n0.B[0], c.B[1] - n0.B[1]) < 80) pick.push(c);
    }
    const keep = (kind: Pt["kind"], x: number, z: number) => old.find((p) => p.kind === kind && Math.hypot(p.x - x, p.z - z) < 4);
    for (const c of pick) {
      const k = keep("crash", c.B[0], c.B[1]);
      this.pts.push(k ?? { kind: "crash", x: c.B[0], z: c.B[1], d: c.dB, cp: coastPhase(c.B[0], c.B[1]), next: NaN, lvl: c === pick[0] ? 0 : -2, brk: c.brk });
    }
    if (n0.rW < 120) {
      const k = keep("lap", n0.W[0], n0.W[1]);
      this.pts.push(k ?? { kind: "lap", x: n0.W[0], z: n0.W[1], d: 0, cp: coastPhase(n0.W[0], n0.W[1]), next: NaN, lvl: 0, brk: 1 });
    }
  }

  update(dt: number) {
    const L = this.h.listener.pos;
    this.refreshT -= dt;
    if (this.refreshT <= 0 || Math.hypot(L[0] - this.lastL[0], L[2] - this.lastL[2]) > 8) {
      this.refreshT = 1.2; this.lastL = [L[0], L[1], L[2]];
      if (L[1] < 140) this.refresh(); else this.pts = [];
    }
    if (!this.pts.length) { this.nearK = 0; return; }
    let dn = 1e9;
    for (const p of this.pts) if (p.kind === "crash") dn = Math.min(dn, Math.hypot(p.x - L[0], p.z - L[2]));
    this.nearK = Math.min(1, Math.max(0, (120 - dn) / 80));
    const w = this.h.surfWeight();
    const { w: wNow, toAudio } = this.clock();
    const { period: P, surfLen: Ls } = this.params;
    const now = this.h.ctx.currentTime;
    for (const p of this.pts) {
      if (!Number.isFinite(p.next) || p.next < wNow - 0.25) p.next = nextCrest(wNow - 0.05, p.cp, p.d, P, Ls);
      // schedule ≤ 0.35 s ahead (the crash file's build-up before its peak is handled by surfShot's peak alignment)
      while (p.next - wNow < 0.35) {
        const dist = Math.hypot(p.x - L[0], p.z - L[2], L[1]);
        const at = toAudio(p.next);
        if (w > 0.12 && at > now - 0.05 && (!this.only || this.only === p.kind)) {
          const amp = p.kind === "crash" ? setAmp(Math.max(0, Math.ceil(p.d / Ls))) * p.brk : 1;
          // (crashes are the EVENTS of a beach — under them the shore bed is the breaker-free wash while the sync runs, ambience.ts)
          const db = (p.kind === "crash" ? 5 : -5) + p.lvl + 20 * Math.log10(amp * Math.min(1, w * 1.2));
          this.h.surfShot(p.kind === "crash" ? "amb1/crash" : "amb1/lap", [p.x, 0.5, p.z], db, at + dist / 343, p.kind === "crash" ? 15 : 10);
          this.log.push({ kind: p.kind, at: +at.toFixed(4), water: +p.next.toFixed(4), x: +p.x.toFixed(1), z: +p.z.toFixed(1), d: +p.d.toFixed(2), dist: +dist.toFixed(1) });
          if (this.log.length > 400) this.log.splice(0, 100);
        }
        p.next += P;
      }
    }
  }
}
