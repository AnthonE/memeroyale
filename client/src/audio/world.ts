// Acoustic queries against the SAME world the game collides with: the heightfield (shared/world/terrain.ts) and the
// static boxes (shared/pois/*). Cheap by design — a few dozen height samples per query, boxes via a 32 m grid.
//   occlusion(listener, source)   → 0 (clear line) .. 1 (behind a hill / inside a building from outside)
//   occl(listener, source, now)   → the same, cached per 2 m / 4 m cell pair for 150 ms (the per-shot hot path)
//   reflections(source, listener) → up to 3 echo points (hill faces, cliffs, walls) with delay + gain; the expensive
//                                   listener-independent part (12 terrain/box rays around the source) is cached per 16 m
//                                   cell and computed OFF the hot path (`work(budgetMs)` from update(); a miss returns null)
//   probe(listener)               → shore directions / biome mix around you, for the ambience beds
// Box lookups walk only the 32 m grid cells the segment actually crosses (2D DDA) and dedupe with a stamp, so a 250 m
// query in a town touches ~10 cells instead of the whole bounding rectangle.
import type { Terrain } from "../../../shared/world/terrain";
import type { Box, Surface } from "../../../shared/world/colliders";
import { floorSurface, roomAt, roomsVersion, stepSurfaceAt, type StepSurface } from "./steps";
import { Biome } from "../../../shared/world/map";

export type V3 = [number, number, number];
const C = 343; // speed of sound m/s
/** diffraction: where along the blocked line to look for a way round, and the sideways / upward offsets tried (m),
 * nearest first */
const DIFF_F = [0.5, 0.25];
const DIFF_OFF: [number, number][] = [[2.5, 0], [-2.5, 0], [0, 2.8], [5, 0], [-5, 0], [0, 5.5], [9, 0], [-9, 0]];

interface GridBox { b: Box; cy: number; sy: number; cx: number; cz: number; hx: number; hz: number; hy: number; stamp: number }
/** a reflecting face around a source cell (listener-independent) */
interface Reflector { R: V3; dir: V3; dist: number; surf: number }

export class AcousticWorld {
  /** acoustic grid (16 m): boxes that can block / reflect sound — anything spanning ≥ 2.4 m (walls, floors, roofs,
   * containers, hulls). Props (crates, barrels, bins: 26k of the 42k colliders) are acoustically transparent here. */
  private grid = new Map<number, GridBox[]>();
  private readonly cell = 16;
  /** ground grid (8 m): every solid box, for "what do the feet stand on" */
  private ground = new Map<number, GridBox[]>();
  private readonly gcell = 8;
  private nAcoustic = 0;
  private stampN = 1;
  private refl = new Map<number, Reflector[]>();
  private reflQueue: { k: number; s: V3 }[] = [];
  private reflQueued = new Set<number>();
  private occCache = new Map<number, { v: number; t: number }>();
  private encCache = new Map<string, number>();
  /** timing of the last work() slice (ms) and cells computed so far — stats */
  workMs = 0;
  cellsBuilt = 0;

  constructor(public terrain: Terrain | null, boxes: Box[] = []) {
    this.setBoxes(boxes);
  }

  setBoxes(boxes: Box[]) {
    this.grid.clear(); this.ground.clear(); this.nAcoustic = 0;
    this.refl.clear(); this.reflQueue.length = 0; this.reflQueued.clear();
    this.occCache.clear();
    this.encCache.clear();
    this.nearCache?.clear();
    for (const b of boxes) {
      // never let one malformed POI collider entry take the audio down
      if (!b || !b.c || !b.h || !Number.isFinite(b.c[0]) || !Number.isFinite(b.h[0])) continue;
      if (b.noShoot) continue; // foliage: sound passes (handled as light damping elsewhere)
      const r = Math.hypot(b.h[0], b.h[2]);
      const g: GridBox = { b, cx: b.c[0], cy: Math.cos(-(b.yaw ?? 0)), sy: Math.sin(-(b.yaw ?? 0)), cz: b.c[2], hx: b.h[0], hz: b.h[2], hy: b.h[1], stamp: 0 };
      const put = (grid: Map<number, GridBox[]>, C: number) => {
        const x0 = Math.floor((b.c[0] - r) / C), x1 = Math.floor((b.c[0] + r) / C);
        const z0 = Math.floor((b.c[2] - r) / C), z1 = Math.floor((b.c[2] + r) / C);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          const k = key(x, z);
          let a = grid.get(k);
          if (!a) grid.set(k, (a = []));
          a.push(g);
        }
      };
      put(this.ground, this.gcell);
      // + WALL SEGMENTS — the interiors kit / town / hotel walls are built from 1-2 m pieces between their doors
      // and windows (half-length 0.5-1, 0.1-0.15 thick), which the ≥ 1.2 m rule dropped: the enclosure probe saw a ceiling
      // and no walls (25 of 447 scanned interior rooms read "covered", not "room") and sound passed through them unoccluded.
      // Tall (≥ 1.8 m), thin (≤ 0.7 m), ≥ 0.8 m long: +15.8k boxes of 41.6k; tree trunks / pillars (square) stay out
      const M = Math.max(b.h[0], b.h[2]);
      if (M >= 1.2 || (b.h[1] >= 0.9 && M >= 0.4 && Math.min(b.h[0], b.h[2]) <= 0.35)) { put(this.grid, this.cell); this.nAcoustic++; }
    }
  }

  /** acoustically relevant boxes (walls, floors, roofs, containers) */
  get boxCount() { return this.nAcoustic; }

  /** fraction of the direct path blocked: terrain ridges count fully, building walls a bit less (they transmit) */
  occlusion(a: V3, b: V3, boxes = true): number {
    const t = this.terrain;
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const d = Math.hypot(dx, dy, dz);
    if (d < 2) return 0;
    let occ = 0;
    if (t) {
      const n = Math.max(6, Math.min(48, Math.ceil(d / 5)));
      let depth = 0;
      for (let i = 1; i < n; i++) {
        const f = i / n;
        const x = a[0] + dx * f, y = a[1] + dy * f, z = a[2] + dz * f;
        const h = t.height(x, z);
        if (h > y + 0.4) depth = Math.max(depth, h - y);
      }
      occ = Math.min(1, depth / 4);
    }
    if (boxes && occ < 1 && d < 260) {
      const hits = this.segmentBoxes(a, b, 3);
      if (hits > 0) {
        let o = Math.min(0.85, 0.55 + 0.15 * (hits - 1));
        // DIFFRACTION — a wall between you and a sound is not the end of it: if the sound can bend round an open corner,
        // through a doorway or over a low wall / container, it arrives that way, a little quieter and darker the longer the
        // detour (not a flat -6.6 dB low-pass on every blocked line, even round an open corner)
        if (d < 90) { const df = this.diffracted(a, b, d); if (df !== null) o = Math.min(o, df); }
        occ = Math.max(occ, o);
      }
    }
    return occ;
  }

  /** the shortest detour around the obstacle between a and b (sideways round a corner / doorway, or over the top):
   * candidate turning points at ½ and ¼ of the way, offset 2.5-9 m sideways or 2.8-5.5 m up; the first whose two legs are
   * both clear of boxes (and of the ground) wins. → an occlusion value for the detour (0.15 + 0.17 per metre of extra
   * path, ≤ 0.55), or null when there is no way round */
  private diffracted(a: V3, b: V3, d: number): number | null {
    const dx = (b[0] - a[0]) / d, dz = (b[2] - a[2]) / d;
    const hn = Math.hypot(dx, dz) || 1;
    const nx = -dz / hn, nz = dx / hn;
    const t = this.terrain;
    let best: number | null = null;
    const D = this.diffTmp;
    for (const f of DIFF_F) {
      const mx = a[0] + (b[0] - a[0]) * f, my = a[1] + (b[1] - a[1]) * f, mz = a[2] + (b[2] - a[2]) * f;
      for (const [side, up] of DIFF_OFF) {
        D[0] = mx + nx * side; D[1] = my + up; D[2] = mz + nz * side;
        const extra = Math.hypot(D[0] - a[0], D[1] - a[1], D[2] - a[2]) + Math.hypot(b[0] - D[0], b[1] - D[1], b[2] - D[2]) - d;
        if (best !== null && extra >= best) continue;
        if (t && t.height(D[0], D[2]) > D[1] - 0.3) continue;
        if (this.segmentBoxes(a, D, 1) || this.segmentBoxes(D, b, 1)) continue;
        best = extra;
      }
      if (best !== null && best < 1.2) break;
    }
    return best === null ? null : Math.min(0.55, 0.15 + 0.17 * best);
  }
  private diffTmp: V3 = [0, 0, 0];

  /** occlusion() cached per (listener qa m, source qb m) cell pair for `ttl` s — what every shot / step asks */
  occl(a: V3, b: V3, now: number, ttl = 0.15, qa = 2, qb = 4): number {
    const k = ((((Math.round(a[0] / qa) * 73856093) ^ (Math.round(a[1] / qa) * 19349663) ^ (Math.round(a[2] / qa) * 83492791)) >>> 0) * 4099
      + (((Math.round(b[0] / qb) * 50331653) ^ (Math.round(b[1] / qb) * 12582917) ^ (Math.round(b[2] / qb) * 25165843)) >>> 0)) + qa * 1e-3;
    const c = this.occCache.get(k);
    if (c && now - c.t < ttl && now >= c.t) return c.v;
    const v = this.occlusion(a, b);
    if (c) { c.v = v; c.t = now; return v; }
    if (this.occCache.size > 2048) trim(this.occCache, 256);
    this.occCache.set(k, { v, t: now });
    return v;
  }

  /** visit the acoustic grid cells a 2D segment crosses (Amanatides-Woo); fn returns true to stop */
  private cells(ax: number, az: number, bx: number, bz: number, fn: (list: GridBox[]) => boolean | void) {
    const C = this.cell;
    let x = Math.floor(ax / C), z = Math.floor(az / C);
    const x1 = Math.floor(bx / C), z1 = Math.floor(bz / C);
    const dx = bx - ax, dz = bz - az;
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(C / dx) : Infinity, tdz = dz !== 0 ? Math.abs(C / dz) : Infinity;
    let tmx = dx !== 0 ? ((dx > 0 ? (x + 1) * C - ax : ax - x * C) / Math.abs(dx)) : Infinity;
    let tmz = dz !== 0 ? ((dz > 0 ? (z + 1) * C - az : az - z * C) / Math.abs(dz)) : Infinity;
    for (let n = 0; n < 256; n++) {
      const list = this.grid.get(key(x, z));
      if (list && fn(list)) return;
      if (x === x1 && z === z1) return;
      if (tmx < tmz) { if (tmx > 1) return; tmx += tdx; x += sx; } else { if (tmz > 1) return; tmz += tdz; z += sz; }
    }
  }

  /** number of solid boxes the segment passes through (capped at `cap`) */
  segmentBoxes(a: V3, b: V3, cap = 3): number {
    let hits = 0;
    const st = ++this.stampN;
    this.cells(a[0], a[2], b[0], b[2], (list) => {
      for (const g of list) {
        if (g.stamp === st) continue;
        g.stamp = st;
        if (segHitsBox(a, b, g) !== null) {
          // ignore boxes that contain an endpoint (the source standing on / inside a floor slab)
          if (inside(a, g) || inside(b, g)) continue;
          if (++hits >= cap) return true;
        }
      }
    });
    return hits;
  }

  /** first box hit along a ray (distance), for reflections */
  rayBox(o: V3, dir: V3, maxD: number): number | null {
    const b: V3 = [o[0] + dir[0] * maxD, o[1] + dir[1] * maxD, o[2] + dir[2] * maxD];
    let best: number | null = null;
    const st = ++this.stampN;
    this.cells(o[0], o[2], b[0], b[2], (list) => {
      for (const g of list) {
        if (g.stamp === st) continue;
        g.stamp = st;
        if (inside(o, g)) continue;
        const f = segHitsBox(o, b, g);
        if (f !== null && (best === null || f * maxD < best)) best = f * maxD;
      }
      return best !== null; // cells are visited near → far: the first hit cell holds the nearest face (±1 cell overlap)
    });
    return best;
  }

  /** reflecting faces around a source cell (16 m), or null when not computed yet (queued for work()) */
  reflectors(s: V3, queue = true): Reflector[] | null {
    const k = rkey(s);
    const r = this.refl.get(k);
    if (r) return r;
    if (queue && !this.reflQueued.has(k)) {
      this.reflQueued.add(k);
      this.reflQueue.push({ k, s: [Math.round(s[0] / 16) * 16, s[1], Math.round(s[2] / 16) * 16] });
      if (this.reflQueue.length > 64) { const d = this.reflQueue.shift()!; this.reflQueued.delete(d.k); }
    }
    return null;
  }

  /** build queued reflector cells for up to `budgetMs` (called from update(); most recent requests first). Work is
   * sliced per RAY, so one slow town cell never blows a frame. */
  work(budgetMs: number): void {
    if (!this.reflQueue.length && !this.building) { this.workMs = 0; return; }
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (!this.building) {
        const q = this.reflQueue.pop();
        if (!q) break;
        this.reflQueued.delete(q.k);
        if (this.refl.has(q.k)) continue;
        this.building = { k: q.k, s: q.s, i: 0, out: [] };
      }
      const b = this.building;
      const f = this.reflRay(b.s, b.i++);
      if (f) b.out.push(f);
      if (b.i >= 12) this.finishCell(b.k, b.out);
    }
    this.workMs = performance.now() - t0;
  }

  /** compute a cell now (the audition tool primes its scripted positions) */
  ensure(s: V3): Reflector[] {
    const have = this.reflectors(s, false);
    if (have) return have;
    const out: Reflector[] = [];
    const c: V3 = [Math.round(s[0] / 16) * 16, s[1], Math.round(s[2] / 16) * 16];
    for (let i = 0; i < 12; i++) { const f = this.reflRay(c, i); if (f) out.push(f); }
    const k = rkey(s);
    if (this.building?.k === k) this.building = null;
    return this.finishCell(k, out);
  }

  private building: { k: number; s: V3; i: number; out: Reflector[] } | null = null;

  private finishCell(k: number, out: Reflector[]): Reflector[] {
    if (this.refl.size > 4096) trim(this.refl, 512);
    this.refl.set(k, out);
    this.cellsBuilt++;
    if (this.building?.k === k) this.building = null;
    return out;
  }

  /** one of the 12 rays around a source: the first hill face / wall that could throw the sound back */
  private reflRay(s: V3, i: number): Reflector | null {
    const t = this.terrain;
    const y0 = s[1] + 1.5;
    const ang = (i / 12) * Math.PI * 2 + 0.13;
    const dir: V3 = [Math.cos(ang), 0, Math.sin(ang)];
    let dist: number | null = null, surf = 0.55;
    if (t) {
      for (let r = 6; r <= 260; r += r < 60 ? 4 : 8) {
        const h = t.height(s[0] + dir[0] * r, s[2] + dir[2] * r);
        if (h > y0 + 2.5) {
          dist = r;
          // a real face (steep rise) reflects better than a gentle slope that only just clears the ear
          const h2 = t.height(s[0] + dir[0] * (r + 8), s[2] + dir[2] * (r + 8));
          surf = h2 - y0 > 10 ? 0.75 : 0.55;
          break;
        }
      }
    }
    const bd = this.rayBox([s[0], y0, s[2]], dir, Math.min(dist ?? 80, 80));
    if (bd !== null && bd > 3 && (dist === null || bd < dist)) { dist = bd; surf = 0.75; }
    if (dist === null || dist < 14) return null;
    const R: V3 = [s[0] + dir[0] * dist, y0, s[2] + dir[2] * dist];
    // the source side of the path must be open (a face behind a nearer wall of the same street doesn't count)
    // (walls only matter for near faces: a far hill face is judged by the terrain alone — keeps each ray cheap in towns)
    const occ = this.occlusion([s[0], y0, s[2]], [R[0] - dir[0] * 3, R[1], R[2] - dir[2] * 3], dist < 90);
    if (occ > 0.9) return null;
    return { R, dir, dist, surf: surf * (1 - 0.6 * occ) };
  }

  /**
   * Early reflections of a loud sound at `s` heard at `l`: the strongest 3 surfaces facing back (hills, cliffs, walls),
   * distinct in time. null = this source cell is not analysed yet (queued; the caller plays the shot without echoes).
   */
  reflections(s: V3, l: V3, now = 0, sync = false): Echo[] | null {
    const refl = sync ? this.ensure(s) : this.reflectors(s);
    if (!refl) return null;
    const direct = Math.hypot(l[0] - s[0], l[1] - s[1], l[2] - s[2]);
    const cand: { f: Reflector; back: number; extra: number; g0: number }[] = [];
    for (const f of refl) {
      const R = f.R;
      const back = Math.hypot(l[0] - R[0], l[1] - R[1], l[2] - R[2]);
      const extra = (f.dist + back - direct) / C;
      if (extra < 0.05 || extra > 1.4) continue;
      // relative to the direct sound: your own shot (direct≈0) is referenced at ~12 m so valley slap-back is audible
      cand.push({ f, back, extra, g0: f.surf * (Math.max(direct, 12) + 10) / (f.dist + back + 10) });
    }
    cand.sort((a, b) => b.g0 - a.g0);
    // keep echoes that are distinct in time (> 60 ms apart) so they read as separate slaps, not a comb filter. The
    // reflected path must itself reach you (a face hidden behind another ridge doesn't echo to you) — checked only for
    // the few best candidates, cached per 8 m listener cell; your own shots skip it (the source side was checked when
    // the cell was analysed, and you ARE the source)
    const pickd: Echo[] = [];
    let checks = 0;
    for (const c of cand) {
      if (pickd.length >= 3 || checks >= 5) break;
      if (!pickd.every((p) => Math.abs(p.delay - c.extra) > 0.06)) continue;
      let occ = 0;
      if (direct > 20) { checks++; occ = c.back < 60 ? this.occl(l, [c.f.R[0], c.f.R[1] + 2, c.f.R[2]], now, 2.0, 8, 8) : this.occlusion(l, [c.f.R[0], c.f.R[1] + 2, c.f.R[2]], false); }
      if (occ > 0.9) continue;
      pickd.push({ pos: c.f.R, delay: c.extra, gain: c.g0 * (1 - 0.6 * occ), dist: c.f.dist + c.back, surf: c.f.surf * (1 - 0.6 * occ) });
    }
    return pickd;
  }

  /**
   * the NEAR faces around `p` (a street, a market lane, a courtyard): 12 horizontal rays at ear height against the
   * walls / containers / hulls within 20 m (reflections() skips faces nearer than 14 m or < 50 ms of extra path; alone it gave
   * your rifle in Mango Market the tail of an open field). Cached per 2 m cell (and 1 m of height). `urban` = how
   * walled-in the spot is (0 open … 1 a lane with walls all round), from the faces' count and nearness.
   */
  nearFaces(p: V3): NearFaces {
    const k = `${Math.round(p[0] / 2)},${Math.round(p[1])},${Math.round(p[2] / 2)}`;
    const hit = this.nearCache.get(k);
    if (hit) return hit;
    const faces: { dist: number; dir: V3 }[] = [];
    // walled-in = faces on SEVERAL sides (a lane, a plaza ringed by stalls), not one crate or fence beside you: the rays'
    // nearness summed, times how many of the 4 quadrants around you have a face within 16 m
    let u = 0, quads = 0;
    if (this.nAcoustic) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.26;
        const dir: V3 = [Math.cos(a), 0, Math.sin(a)];
        const d = this.rayBox(p, dir, 20);
        if (d === null || d < 1.2) continue;
        faces.push({ dist: d, dir });
        if (d < 16) { u += Math.min(1, 10 / (d + 4)); quads |= 1 << Math.floor(i / 3); }
      }
    }
    faces.sort((a, b) => a.dist - b.dist);
    let nq = 0; for (let q = 0; q < 4; q++) if (quads & (1 << q)) nq++;
    const r: NearFaces = { faces, urban: Math.min(1, u / 4) * Math.min(1, nq / 3) };
    if (this.nearCache.size > 1024) trim(this.nearCache, 128);
    this.nearCache.set(k, r);
    return r;
  }
  private nearCache = new Map<string, NearFaces>();

  /** how open the place around `s` is: 0 = open beach / field (no faces), 1 = valley / street canyon (faces all round) */
  closeness(s: V3): number | null {
    const r = this.reflectors(s);
    if (!r) return null;
    let v = 0;
    // near faces make a place ring; a hill 150 m behind the beach barely does
    for (const f of r) v += f.surf * Math.min(1, Math.pow(40 / (f.dist + 10), 1.5));
    return Math.min(1, v / 3);
  }

  /** ambience probe around the listener */
  probe(l: V3): Probe {
    const t = this.terrain;
    const p: Probe = { sea: [], lagoonNear: 0, jungle: 0, open: 0, rock: 0, cinder: 0, beach: 0, ground: 0, height: l[1] };
    if (!t) return p;
    const ground = t.height(l[0], l[2]);
    p.ground = ground;
    p.height = l[1] - Math.max(ground, 0);
    const radii = [6, 12, 20, 30, 45, 65, 90, 125, 170, 230, 300];
    let nb = 0;
    const counts = { jungle: 0, open: 0, rock: 0, cinder: 0, beach: 0 };
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      let sea: number | null = null;
      for (const r of radii) {
        const x = l[0] + cx * r, z = l[2] + cz * r;
        const b = t.biomeAt(x, z);
        if (r <= 45) {
          nb++;
          if (b === Biome.Jungle) counts.jungle++;
          else if (b === Biome.Grass || b === Biome.Farmland) counts.open++;
          else if (b === Biome.Path || b === Biome.Paved) nb--; // POI pads & roads: neutral — the land around them decides
          else if (b === Biome.Rock) counts.rock++;
          else if (b === Biome.Cinder) counts.cinder++;
          else if (b === Biome.Beach) counts.beach++;
          if (b === Biome.Lagoon) p.lagoonNear = Math.max(p.lagoonNear, 1 - r / 60);
        }
        if (sea === null && (b === Biome.DeepOcean || b === Biome.Reef) && t.height(x, z) < 0) sea = r;
      }
      if (sea !== null) p.sea.push({ ang: a, dist: sea, x: l[0] + cx * sea, z: l[2] + cz * sea });
    }
    // centre sample counts double
    const bc = t.biomeAt(l[0], l[2]);
    const kind: Partial<Record<Biome, keyof typeof counts>> = {
      [Biome.Jungle]: "jungle", [Biome.Rock]: "rock", [Biome.Cinder]: "cinder", [Biome.Beach]: "beach", [Biome.Grass]: "open", [Biome.Farmland]: "open",
    };
    const kc = kind[bc];
    if (kc) counts[kc] += 4;
    if (bc !== Biome.Path && bc !== Biome.Paved) nb += 4;
    nb = Math.max(1, nb);
    p.jungle = counts.jungle / nb; p.open = counts.open / nb; p.rock = counts.rock / nb; p.cinder = counts.cinder / nb; p.beach = counts.beach / nb;
    return p;
  }

  /** extra delay for a sound at distance d (speed of sound) */
  static travel(d: number) { return d / C; }

  /**
   * How "inside" a point is, 0..1, from the same boxes the game collides with: a roof overhead (a box above within
   * 7 m) and walls around (horizontal rays in 8 directions hitting a box within 10 m). Used when gameplay does not
   * say (env.indoors) — listener muffling / room reverb — and per shot for the shooter's own room tail.
   */
  /** enclosure() only if it is already known for that 1 m cell (null = not yet — a hot path queues it) */
  enclosureCached(p: V3): number | null {
    const v = this.encCache.get(`${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])}`);
    return v === undefined ? null : v;
  }

  private roomsV = -1;
  enclosure(p: V3): number {
    if (this.roomsV !== roomsVersion) { this.roomsV = roomsVersion; this.encCache.clear(); }
    const k = `${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])}`;
    const hit = this.encCache.get(k);
    if (hit !== undefined) return hit;
    let v = 0;
    // a head INSIDE a solid box (a probe point in a quay's / hull's collider volume, where no player can stand) says
    // nothing about a room: only the drawn rooms map counts there
    const up = this.insideSolid(p) ? null : this.rayBox([p[0], p[1] + 0.3, p[2]], [0, 1, 0], 7);
    if (up !== null) {
      // (5.7 % of open-sky points read as rooms without this): one box straight overhead (a sign, a
      // crane arm, a pier plank) is not a roof — the SKY must be hidden: 8 slanted rays (45° up) must mostly hit a box too
      let sky = 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        if (this.rayBox([p[0], p[1] + 0.3, p[2]], [Math.cos(a) * 0.7071, 0.7071, Math.sin(a) * 0.7071], 10) === null) sky++;
      }
      if (sky <= 3) {
        let walls = 0;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.2;
          // (under a SEALED ceiling — no sky on any of the 8 slanted rays — a hall's walls count up to 20 m away:
          // the CNVS server hall's are 21-26 m apart)
          if (this.rayBox([p[0], p[1], p[2]], [Math.cos(a), 0, Math.sin(a)], sky === 0 ? 20 : 10) !== null) walls++;
        }
        // a room has walls nearly all round (a door or window or two open); 4 = a porch / shed; less = just covered
        v = walls >= 5 && sky <= 2 ? 1 : walls >= 4 ? 0.6 : 0.15;
      } else v = sky <= 5 ? 0.15 : 0;
    }
    // the drawn rooms map (steps.ts roomAt, baked from the rendered meshes) — drawn roofs / rock domes / hulls
    // …but only under SOMETHING solid — a map baked before a building moved (a moved block leaves open streets
    // reading "room" from the stale bake) must never put a room under open sky.
    // A roof the player can stand under has a collider within 40 m overhead; the map refines how enclosed it is
    const rm = roomAt(p[0], p[1] - 1.6, p[2]);
    if (rm > v && (up !== null || this.solidOverhead(p, 40))) v = rm;
    if (this.encCache.size > 2048) trim(this.encCache, 256);
    this.encCache.set(k, v);
    return v;
  }

  /** any collider (decks and planks included — the acoustic grid keeps only boxes ≥ 1.2 m) over the head within `up` m */
  private solidOverhead(p: V3, up: number): boolean {
    const list = this.ground.get(key(Math.floor(p[0] / this.gcell), Math.floor(p[2] / this.gcell)));
    if (!list) return false;
    for (const g of list) {
      const bot = g.b.c[1] - g.hy;
      if (bot <= p[1] + 0.3 || bot > p[1] + up || Math.min(g.hx, g.hz) < 0.08) continue;
      if (inside([p[0], g.b.c[1], p[2]], g)) return true;
    }
    return false;
  }

  private insideSolid(p: V3): boolean {
    const list = this.ground.get(key(Math.floor(p[0] / this.gcell), Math.floor(p[2] / this.gcell)));
    if (list) for (const g of list) if (g.hx >= 0.5 && g.hz >= 0.5 && g.hy >= 0.5 && inside(p, g)) return true;
    return false;
  }

  /**
   * What the feet stand on at (x, feetY, z): the top of a box within [-0.8, +0.45] m of the feet, else the heightfield
   * (surface from the biome; below sea level = water). Returns the surface and the ground height.
   */
  groundAt(x: number, feetY: number, z: number): { y: number; surf: StepSurface } {
    let best: GridBox | null = null, bestTop = -1e9;
    const list = this.ground.get(key(Math.floor(x / this.gcell), Math.floor(z / this.gcell)));
    if (list) {
      for (const g of list) {
        const top = g.b.c[1] + g.hy;
        if (top < feetY - 0.8 || top > feetY + 0.45 || top <= bestTop) continue;
        const q = toLocal([x, top, z], g);
        if (Math.abs(q[0]) <= g.hx + 0.05 && Math.abs(q[2]) <= g.hz + 0.05) { best = g; bestTop = top; }
      }
    }
    const t = this.terrain;
    const th = t ? t.height(x, z) : 0;
    // the DRAWN floor first (steps.ts drawn-floor map: plank floors, paving, gravel, swamp water …), then the
    // box's tag, then the terrain's visible splat layer / sea / river depth (never "any foot under 0.35 m is water")
    const y = best && bestTop >= th - 0.05 ? bestTop : th;
    const f = floorSurface(x, y, z, best && bestTop >= th - 0.05 ? 0.4 : 0.2);
    if (f) return { y, surf: f };
    if (best && bestTop >= th - 0.05) return { y: bestTop, surf: best.b.surf ?? "stone" };
    if (!t) return { y: th, surf: "grass" };
    return { y: th, surf: stepSurfaceAt(t, 255, x, th, z) };
  }
}

/** heightfield biome → footstep surface */
const BIOME_SURF: Partial<Record<Biome, Surface>> = {
  [Biome.DeepOcean]: "water", [Biome.Reef]: "water", [Biome.Lagoon]: "water", [Biome.Beach]: "sand",
  [Biome.Grass]: "grass", [Biome.Farmland]: "grass", [Biome.Jungle]: "foliage", [Biome.Rock]: "stone",
  [Biome.Cinder]: "stone", [Biome.Path]: "sand", [Biome.Paved]: "concrete",
};

export interface Echo { pos: V3; delay: number; gain: number; dist: number; /** reflectivity × path visibility */ surf: number }
/** faces within 20 m around a point (nearest first) + how walled-in it is (0 … 1) */
export interface NearFaces { faces: { dist: number; dir: V3 }[]; urban: number }
export interface Probe {
  sea: { ang: number; dist: number; x: number; z: number }[];
  lagoonNear: number;
  jungle: number; open: number; rock: number; cinder: number; beach: number;
  ground: number;
  /** listener height above ground (or sea) */
  height: number;
}

/** drop the `n` oldest entries of a Map (insertion order) — a cache that never falls off a cliff */
export function trim<K, V>(m: Map<K, V>, n: number) {
  for (const k of m.keys()) { m.delete(k); if (--n <= 0) break; }
}

function key(x: number, z: number) { return (x + 4096) * 8192 + (z + 4096); }
/** reflector cell: 16 m in x/z, 8 m in y */
function rkey(s: V3) { return ((Math.round(s[0] / 16) + 512) * 1024 + (Math.round(s[2] / 16) + 512)) * 64 + Math.max(0, Math.min(63, Math.round(s[1] / 8) + 8)); }

function toLocal(p: V3, g: GridBox): V3 {
  const x = p[0] - g.cx, z = p[2] - g.cz;
  return [x * g.cy - z * g.sy, p[1] - g.b.c[1], x * g.sy + z * g.cy];
}

function inside(p: V3, g: GridBox) {
  const q = toLocal(p, g);
  return Math.abs(q[0]) <= g.hx && Math.abs(q[1]) <= g.hy && Math.abs(q[2]) <= g.hz;
}

/** slab test in the box's yaw frame → entry fraction along a→b, or null */
function segHitsBox(a: V3, b: V3, g: GridBox): number | null {
  const p = toLocal(a, g), q = toLocal(b, g);
  const h = [g.hx, g.hy, g.hz];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = q[i] - p[i];
    if (Math.abs(d) < 1e-9) {
      if (p[i] < -h[i] || p[i] > h[i]) return null;
    } else {
      let ta = (-h[i] - p[i]) / d, tb = (h[i] - p[i]) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
  }
  return t0;
}
