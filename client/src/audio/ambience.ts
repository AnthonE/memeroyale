// Ambience: the island breathes. Biome beds crossfade from a probe of the heightfield/biomes around you; the surf is
// not a flat bed but up to two emitters placed ON the nearest shorelines (turn your head and the sea moves); the
// waterfall and the CNVS lab hum are point sources; birds, parrots, monkeys, gulls, frogs, creaks and lava pops are
// spatial one-shots sprinkled around you. Indoors, the outside is muffled and a room tone fades in. Inside the storm
// the island goes dull and the storm roars.
import { POIS, type PoiId } from "../../../shared/world/map";
import { AMB_DB } from "./bank";
import type { V3, Probe } from "./world";
import type { Engine } from "./index";
import { setT } from "./param";

const dbg = (db: number) => Math.pow(10, db / 20);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type Handle = NonNullable<ReturnType<Engine["bed"]>>;
interface Bed { group: string; h: Handle | null; cur: number; target: number; idle: number }
interface Emitter { group: string; pos: V3; h: Handle | null; cur: number; target: number; ref: number; max: number; db: number; occ: number;
  /** a source INSIDE a building (the CNVS server hall's racks) plays on the world bus — the
   * indoor muffle of the outdoor beds must not swallow it when you stand next to it; the walls occlude it outside */
  interior?: boolean }
interface Sprinkle { group: string; next: number; every: [number, number]; weight: (w: Weights) => number; db: number; place: "canopy" | "shore" | "ground" | "water" | "air" | "far" | "roof" | "near" | "surfline" | "slap" | "field" | "sky" | "ship" | "shipHigh" | "ear" | "cave" | "arch" }
type Weights = Record<string, number>;

// (Wreck Bay is not in the harbor list — it has its own galleon bed; the Murk, Canopy Line and Coco Caves are not in the
// jungle / lagoon lists — each has its own soundscape below)
const HARBOR: PoiId[] = ["peel-harbor", "the-wreck", "stilt-town"];
// the towns have their own bed (awnings, sparrows, doves, a street breeze):
// Mango Market and the Coconut Cove resort (its tiki-bar radio still plays)
const TOWN: PoiId[] = ["mango-market", "coconut-cove"];
// POIs whose pads are paved/path but whose soul is the jungle around them (the temple, the falls, the lab, the canopy)
const JUNGLE: PoiId[] = ["banana-temple", "mist-falls", "cnvs-lab"];
// the newer POIs' own places (numbers from their layouts — kept here, not imported, so a POI module
// mid-edit can never take the audio down): the galleon's midship (shared/pois/wreck-bay.ts SHIP), the sea-cave hall
// (shared/pois/coco-caves.ts HALL_C, ~36 m across, roof ≥ 58 m; the WEST ARCH is where the sea booms in)
const SHIP: V3 = [45, 6, -701];
const CAVE = { x: -721, z: -318, r: 34, roof: 58, arch: [-770, 36, -316] as V3 };
// open, windy high ground
const WINDY: PoiId[] = ["lookout-point", "peel-strip"];

export class Ambience {
  private beds = new Map<string, Bed>();
  private surf: Emitter[] = [];
  private points: Emitter[] = [];
  private probeT = 0;
  private probe: Probe | null = null;
  private w: Weights = {};
  private sprinkles: Sprinkle[];
  private clock = 0;
  private pointI = 0;
  /** 0..1 — the shore bed is the breaker-free wash (the surf sync has a beach) */
  private syncK = 0;

  constructor(private e: Engine, private enabled: boolean) {
    for (const g of Object.keys(AMB_DB)) this.beds.set(g, { group: g, h: null, cur: 0, target: 0, idle: 0 });
    for (let i = 0; i < 2; i++) this.surf.push({ group: "amb/surf-near", pos: [0, 0, 0], h: null, cur: 0, target: 0, ref: 14, max: 140, db: AMB_DB["amb/surf-near"], occ: 0 });
    // the same two shore emitters as a breaker-free WASH — where the surf sync voices every breaker on the
    // water's own phase (surf.ts), the recorded surf bed (with its own random crashes) crossfades to it
    for (let i = 0; i < 2; i++) this.surf.push({ group: "amb/surf-wash", pos: [0, 0, 0], h: null, cur: 0, target: 0, ref: 14, max: 140, db: AMB_DB["amb/surf-wash"], occ: 0 });
    const falls = POIS.find((p) => p.id === "mist-falls")!, lab = POIS.find((p) => p.id === "cnvs-lab")!;
    this.points.push({ group: "amb/waterfall", pos: [falls.x, 0, falls.z], h: null, cur: 0, target: 0, ref: 18, max: 260, db: AMB_DB["amb/waterfall"], occ: 0 });
    this.points.push({ group: "amb/river", pos: [falls.x + 40, 0, falls.z + 60], h: null, cur: 0, target: 0, ref: 8, max: 90, db: AMB_DB["amb/river"], occ: 0 });
    this.points.push({ group: "amb/lab", pos: [lab.x, 0, lab.z], h: null, cur: 0, target: 0, ref: 10, max: 80, db: AMB_DB["amb/lab"], occ: 0 });
    // the server hall's rack rows (shared/pois/cnvs-lab.ts module A: u 6..28, v -7..7 from CX / CZ, floor F0 34.24): fans,
    // transformer hum, relay ticks — loudest in the hall, through the walls ≥ 10 dB down outside
    this.points.push({ group: "amb/lab", pos: [150.5 + 17, 34.24 + 1.6, -479.5], h: null, cur: 0, target: 0, ref: 7, max: 45, db: AMB_DB["amb/lab"] + 5, occ: 0, interior: true });
    // porch wind chimes in the stilt village and at Coconut Cove; Mango Market's hang over the plaza
    for (const id of ["stilt-town", "coconut-cove"] as PoiId[]) {
      const q = POIS.find((p) => p.id === id);
      if (q) this.points.push({ group: "amb/chimes", pos: [q.x + 6, 0, q.z - 4], h: null, cur: 0, target: 0, ref: 5, max: 55, db: AMB_DB["amb/chimes"], occ: 0 });
    }
    // the market plaza (shared/pois/mango-market.ts FX/FZ): the fountain, the chimes on a stall, a stall radio; the
    // Coconut Cove tiki bar's radio (shared/pois/coconut-cove.ts TIKI)
    this.points.push({ group: "amb/fountain", pos: [455, 0, -55], h: null, cur: 0, target: 0, ref: 6, max: 75, db: AMB_DB["amb/fountain"], occ: 0 });
    this.points.push({ group: "amb/chimes", pos: [446, 0, -66], h: null, cur: 0, target: 0, ref: 5, max: 55, db: AMB_DB["amb/chimes"], occ: 0 });
    this.points.push({ group: "amb/radio", pos: [468, 0, -45], h: null, cur: 0, target: 0, ref: 4, max: 60, db: AMB_DB["amb/radio"], occ: 0 });
    this.points.push({ group: "amb/radio", pos: [66.7, 0, 441.4], h: null, cur: 0, target: 0, ref: 4, max: 60, db: AMB_DB["amb/radio"], occ: 0 });
    // the wrecked galleon — hull groans, the flooded hold, rigging — a place you hear from the beach and all
    // round you on board (full level within 16 m of midship)
    this.points.push({ group: "amb/galleon", pos: [SHIP[0], SHIP[1], SHIP[2]], h: null, cur: 0, target: 0, ref: 16, max: 150, db: AMB_DB["amb/galleon"], occ: 0 });
    const S = (group: string, every: [number, number], weight: Sprinkle["weight"], db: number, place: Sprinkle["place"]): Sprinkle => ({ group, every, weight, db, place, next: every[0] * this.e.ambRnd() });
    this.sprinkles = [
      S("amb1/parrot", [4, 11], (w) => Math.max(w.jungle, w.canopy * 0.9), -7, "canopy"),
      S("amb1/piha", [9, 22], (w) => w.jungle, -8, "canopy"),
      S("amb1/monkey", [14, 32], (w) => w.jungle, -9, "canopy"),
      S("amb1/flutter", [10, 25], (w) => Math.max(w.jungle, w.meadow) * 0.8, -12, "canopy"),
      S("amb1/gull", [5, 12], (w) => Math.max(w.harbor, w.surf * 0.85), -4, "shore"),
      S("amb1/creak", [7, 16], (w) => w.harbor, -10, "ground"),
      S("amb1/buoy", [18, 40], (w) => w.harbor * 0.9, -14, "water"),
      S("amb1/frog", [2.5, 7], (w) => w.lagoon, -8, "ground"),
      S("amb1/lava", [3, 8], (w) => w.volcanic, -3, "field"),
      S("amb1/toad", [3, 9], (w) => w.lagoon, -10, "ground"),
      // the working port: a ship's horn across the bay, crane chains, a forklift reversing in the yard
      S("amb1/horn", [35, 80], (w) => w.harbor, 14, "far"), // a ship horn is LOUD: +14 before ~-28 dB of distance
      S("amb1/chain", [9, 24], (w) => w.harbor, -12, "ground"),
      S("amb1/beeper", [30, 70], (w) => w.harbor * 0.8, -18, "ground"),
      S("storm/thunder", [7, 18], (w) => w.storm, -2, "air"),
      // every place has its own discrete life
      // the town: sparrows in the eaves, doves on the roofs, awnings snapping, a shop sign swinging, market work, a bike bell
      S("amb1/sparrow", [3, 8], (w) => w.town, -7, "roof"),
      S("amb1/dove", [6, 14], (w) => w.town, -6, "roof"),
      S("amb1/awning", [5, 12], (w) => w.town, -8, "near"),
      S("amb1/sign", [9, 20], (w) => w.town, -10, "near"),
      S("amb1/clatter", [7, 16], (w) => w.town, -9, "ground"),
      S("amb1/bell", [20, 45], (w) => w.town, -12, "ground"),
      // the open fields / plantation: finches in the hedges, doves in the fruit trees
      S("amb1/sparrow", [5, 12], (w) => w.meadow * 0.75, -3, "near"),
      S("amb1/dove", [8, 18], (w) => w.meadow * 0.6, -4, "near"),
      // the coast: a big wave breaking on the nearest shore, gusts on high / open ground
      S("amb1/wave", [4, 9], (w) => w.surf, 12, "surfline"),
      S("amb1/gust", [6, 14], (w) => Math.max(w.wind, w.surf * 0.6, w.volcanic * 0.8), 4, "near"),
      // the lookout's cliff lip: gulls hanging in the updraft beside you, the tower's flag snapping in the gusts
      S("amb1/gull", [3, 7], (w) => w.cliff, 0, "near"),
      S("amb1/awning", [4, 9], (w) => w.cliff, -2, "near"),
      // the volcano: steam vents, stones skittering down the scree
      S("amb1/fumarole", [4, 10], (w) => w.volcanic, 6, "ground"),
      S("amb1/rockfall", [4, 10], (w) => Math.max(w.volcanic, w.wind * 0.6), 2, "near"),
      // SHARP near life for the open places: small waves
      // slapping the waterline within ~40 m, gusts running through the crop rows beside you, insects bursting into song,
      // a hawk wheeling over the open country
      S("amb1/slap", [2.5, 6], (w) => w.surf, 14, "slap"),
      S("amb1/rustle", [4, 9], (w) => Math.max(w.meadow, w.cliff * 0.6), 2, "field"),
      S("amb1/insect", [5, 12], (w) => Math.max(w.meadow, w.jungle * 0.4), -1, "field"),
      S("amb1/raptor", [20, 50], (w) => Math.max(w.meadow, w.cliff, w.surf * 0.5), 4, "sky"),
      // the lab: relays, console chirps, an arc now and then
      S("amb1/relay", [3, 7], (w) => w.lab, 6, "near"),
      S("amb1/console", [4, 9], (w) => w.lab, 3, "near"),
      S("amb1/zap", [6, 14], (w) => w.lab, -4, "near"),
      // WRECK BAY: the hull groans and shifts, rigging creaks, a torn sail cracks, water sloshes in the hold, gulls
      S("amb1/hull", [5, 12], (w) => w.wreck, -5, "ship"),
      S("amb1/rigging", [3, 8], (w) => w.wreck, -2, "ship"),
      S("amb1/sail", [7, 16], (w) => w.wreck, -3, "shipHigh"),
      S("amb1/bilge", [6, 13], (w) => w.wreck, -8, "ship"),
      S("amb1/gull", [4, 10], (w) => w.wreck * 0.9, -2, "shore"),
      // THE MURK: mosquitoes whining past your ear, mud bubbles, moss drips, a bullfrog's 'jug-o-rum', the frogs
      S("amb1/mosquito", [4, 10], (w) => w.swamp, -4, "ear"),
      S("amb1/bubble", [3, 8], (w) => w.swamp, 0, "ground"),
      S("amb1/drip", [3, 7], (w) => w.swamp, -2, "near"),
      S("amb1/bullfrog", [5, 12], (w) => w.swamp, 2, "ground"),
      S("amb1/frog", [3, 8], (w) => w.swamp * 0.8, -6, "ground"),
      // COCO CAVES: drips ringing in the hall, the sea booming into the west arch, bats overhead
      S("amb1/cavedrip", [1.5, 4.5], (w) => w.cave, -4, "cave"),
      S("amb1/surge", [6, 14], (w) => w.cave, 6, "arch"),
      S("amb1/bat", [8, 18], (w) => w.cave, -6, "cave"),
      // CANOPY LINE: rope bridges / nets creaking near you, gusts surging through the crowns (more the higher you are)
      S("amb1/plank", [2, 5], (w) => w.canopy, 4, "near"),
      S("amb1/knock", [4, 9], (w) => w.canopy * (1 - 0.5 * w.canopyUp), 0, "canopy"),
      S("amb1/flutter", [5, 12], (w) => w.canopy, -4, "near"),
      S("amb1/rigging", [4, 9], (w) => w.canopy * 0.9, -2, "near"),
      S("amb1/leafgust", [5, 11], (w) => w.canopyUp, 0, "near"),
    ];
  }

  get weights() { return this.w; }
  get lastProbe() { return this.probe; }

  /** the match is over: every bed / surf / point source stops and the next update() probes the world afresh */
  stopAll() {
    for (const b of this.beds.values()) { b.h?.stop(); b.h = null; b.cur = b.target = 0; b.idle = 0; }
    for (const em of [...this.surf, ...this.points]) { em.h?.stop(); em.h = null; em.cur = em.target = 0; }
    this.probe = null; this.probeT = 0;
  }

  /** per frame, cheap: the beds' and emitters' gains follow their targets. The probe, bed / emitter starts and the
   * spatial sprinkles run in slow() — from the engine's idle-time slice (live) or right after this (offline) */
  update(dt: number, env: { biome: number; indoors: boolean; inStorm: boolean; altitude: number }) {
    if (!this.enabled || this.e.lib.loaded < 1) return;
    this.clock += dt;
    this.probeT -= dt;
    this.env = env;
    for (const s of this.sprinkles) s.next -= dt;
    const k = 1 - Math.exp(-dt / 1.4);
    const now = this.e.ctx.currentTime;
    // (how much of the shore bed is the synced wash — 1.5 s crossfade as a beach comes into / out of the sync)
    this.syncK += ((this.e.surf.pts.some((p) => p.kind === "crash") ? 1 : 0) - this.syncK) * (1 - Math.exp(-dt / 1.5));
    for (const b of this.beds.values()) {
      b.cur += (b.target - b.cur) * k;
      if (b.h) {
        setT(b.h.gain.gain, b.cur * dbg(AMB_DB[b.group] ?? -6), now, 0.1, 0.005);
        // the canopy bed is the crowns — from the forest floor you hear them 20-30 m up through the leaves (a dark
        // roar), up on the decks they are all round you (the full 1-8 kHz rush)
        if (b.group === "amb/canopy") setT(b.h.lp.frequency, 2200 + 17800 * Math.min(1, (this.w.canopyUp ?? 0) / Math.max(0.05, this.w.canopy ?? 1)), now, 0.3, 0.02);
        b.idle = b.cur < 0.01 ? b.idle + dt : 0;
        // (in the air — the plane, the drop — the ground beds let go at once: their PCM is freed while you fly)
        if (b.idle > ((this.w.alt ?? 0) > 0.8 ? 1 : 4)) { b.h.stop(); b.h = null; b.idle = 0; }
      }
    }
    for (const em of this.surf) this.drive(em, dt, k, now);
    for (const em of this.points) this.drive(em, dt, k, now);
  }

  private env: { biome: number; indoors: boolean; inStorm: boolean; altitude: number } = { biome: 0, indoors: false, inStorm: false, altitude: 0 };

  /** the slow part (idle time): probe the surroundings every 0.3 s, start the beds / emitters that became audible (at
   * most two voices per call), place the due sprinkles. Every step is tens of microseconds */
  slow(canStart = true) {
    if (!this.enabled || this.e.lib.loaded < 1) return;
    const L = this.e.listener.pos, env = this.env;
    const P = this.e.prof, t0 = P ? performance.now() : 0;
    const lap = (k: string) => { if (P) P[k] = Math.max(P[k] ?? 0, performance.now() - t0); };
    if (this.probeT <= 0 || !this.probe) {
      const first = !this.probe;
      this.probeT = 0.3;
      this.probe = this.e.world.probe(L);
      this.targets(this.probe, env);
      // spawning into the world: start at the right mix instead of fading everything up from silence
      // (point sources only when you are in their range)
      if (first) { for (const b of this.beds.values()) b.cur = b.target; for (const s of this.surf) s.cur = s.target * (s.group === "amb/surf-wash" ? this.syncK : 1 - this.syncK); for (const p of this.points) p.cur = Math.hypot(p.pos[0] - L[0], p.pos[2] - L[2]) < p.max ? 1 : 0; }
      // point-source occlusion: one source per probe (spread the cost; they change slowly)
      const t = this.e.world.terrain;
      if (this.points.length) {
        const p = this.points[this.pointI++ % this.points.length];
        if (t && p.pos[1] === 0) p.pos[1] = Math.max(0, t.height(p.pos[0], p.pos[2])) + (p.group === "amb/waterfall" ? 12 : p.group === "amb/fountain" ? 1.2 : 2);
        // (inside a source's own reference radius — on / in the galleon — it is all around you: never occluded)
        const dp = Math.hypot(p.pos[0] - L[0], p.pos[2] - L[2]);
        p.occ = dp < p.ref ? 0 : dp < p.max ? this.e.world.occlusion(L, p.pos) : 1;
      }
      lap("a.probe");
      return; // (the probe is this call's work)
    }
    // (one voice start per slice, and only when the slice has the budget for it — a bed start builds ~8 nodes)
    let starts = canStart ? 0 : 1;
    for (const b of this.beds.values()) {
      // a bed below ~-30 dB of its weight is not worth decoding / playing (beds decode on demand)
      if (b.cur > 0.03 && !b.h && starts < 1) { b.h = this.e.bed(b.group, "amb"); if (b.h) starts++; }
    }
    for (let i = 0; i < this.surf.length + this.points.length && starts < 1; i++) {
      const em = i < this.surf.length ? this.surf[i] : this.points[i - this.surf.length];
      if (em.cur > 0.01 && !em.h) { em.h = this.e.bed(em.group, em.interior ? "world" : "amb", em.pos); if (em.h) starts++; }
    }
    lap("a.starts");
    // sprinkles
    for (const s of this.sprinkles) {
      if (s.next > 0) continue;
      const w = s.weight(this.w);
      s.next = s.every[0] + this.e.ambRnd() * (s.every[1] - s.every[0]);
      if (w < 0.15 || this.e.ambRnd() > w) continue;
      // where the surf sync has a beach, the breakers / laps are ITS (on the water's own phase), not random ones
      if ((s.place === "surfline" || s.place === "slap") && this.e.surf.pts.length) continue;
      const pos = this.place(s.place);
      if (pos) this.e.sprinkle(s.group, pos, s.db + 20 * Math.log10(w) - (env.indoors ? 8 : 0), s.group === "storm/thunder" ? "world" : "amb");
    }
    lap("a.sprinkles");
  }

  private drive(em: Emitter, dt: number, k: number, now: number) {
    const L = this.e.listener.pos;
    const d = Math.hypot(em.pos[0] - L[0], em.pos[1] - L[1], em.pos[2] - L[2]);
    let target = em.target;
    const surfBed = em.group === "amb/surf-near" || em.group === "amb/surf-wash";
    if (!surfBed) target = d < em.max ? 1 : 0;
    else target *= em.group === "amb/surf-wash" ? this.syncK : 1 - this.syncK;
    em.cur += (target - em.cur) * k;
    if (!em.h) return; // (started from slow())
    const g = (em.ref / (em.ref + Math.max(0, d - em.ref))) * (1 - smooth(em.max * 0.75, em.max, d));
    // (the galleon is the one "indoors" that IS its own sound: below its decks you are inside the hull it describes)
    const ind = (em.group === "amb/galleon" && d < em.ref) || em.interior ? 0 : this.e.indoor;
    const lvl = em.cur * g * dbg(em.db - em.occ * 9) * (1 - 0.7 * ind) * (this.w.ground ?? 1);
    setT(em.h.gain.gain, lvl, now, 0.12, 0.005);
    setT(em.h.lp.frequency, Math.min(20000 * Math.exp(-d / 220), 20000 * Math.pow(1000 / 20000, Math.max(em.occ, ind * 0.8))), now, 0.2, 0.01);
    const p = em.h.panner;
    if (p?.positionX) { setT(p.positionX, em.pos[0], now, 0.4, 0.05, true); setT(p.positionY, em.pos[1], now, 0.4, 0.05, true); setT(p.positionZ, em.pos[2], now, 0.4, 0.05, true); }
    if (em.cur < 0.004 && d > em.max) { em.h.stop(); em.h = null; }
  }

  private targets(p: Probe, env: { indoors: boolean; inStorm: boolean }) {
    const L = this.e.listener.pos;
    const alt = smooth(18, 110, p.height);
    const ground = 1 - alt;
    const poi = (ids: PoiId[], inner = 0.5, outer = 1.25) => Math.max(0, ...ids.map((id) => {
      const q = POIS.find((x) => x.id === id)!;
      return 1 - smooth(q.r * inner, q.r * outer, Math.hypot(L[0] - q.x, L[2] - q.z));
    }));
    const seaD = p.sea.length ? Math.min(...p.sea.map((s) => s.dist)) : 1e9;
    const harbor = poi(HARBOR, 0.45, 1.2);
    // THE MURK = a swamp (its own bed); the lagoon bed stays Stilt Town's
    const swamp = poi(["the-murk"], 0.45, 1.15);
    const lagoon = Math.max(p.lagoonNear * (1 - swamp), 0);
    // WRECK BAY: the galleon (a point source) and a sheltered cove — the surf there only laps
    const wreck = poi(["wreck-bay"], 0.4, 1.1);
    // COCO CAVES: inside the sea-cave hall (under its roof) — no sky, no birds, no surf on the beach, just the cave
    const cave = (1 - smooth(CAVE.r - 6, CAVE.r + 8, Math.hypot(L[0] - CAVE.x, L[2] - CAVE.z))) * (1 - smooth(CAVE.roof - 4, CAVE.roof, L[1]));
    // CANOPY LINE: the treetop network. On the forest floor the crowns still hiss overhead; up on the decks (≥ 6 m over the
    // ground, full at 15 m) the wind in the leaves and the creaking nets ARE the place and the jungle sinks below you
    const canopyP = poi(["canopy-line"], 0.5, 1.2);
    const canopyUp = canopyP * smooth(5, 15, p.height);
    const volcanic = Math.max(Math.min(1, p.cinder * 1.8), poi(["ripe-peak"], 0.3, 1.1) * 0.8);
    const highWind = Math.max(smooth(28, 90, p.ground) * 0.9, p.rock * 0.8, poi(WINDY, 0.3, 1.1) * 0.7);
    const jungleP = poi(JUNGLE, 0.5, 1.3);
    const town = poi(TOWN, 0.45, 1.1);
    const w: Weights = {
      ground, alt,
      jungle: Math.max(Math.min(1, p.jungle * 1.25), jungleP * 0.95) * ground * (1 - harbor * 0.6) * (1 - cave) * (1 - 0.55 * canopyP - 0.35 * canopyUp) * (1 - 0.7 * swamp) * (1 - 0.6 * wreck) * (1 - 0.45 * poi(["cnvs-lab"], 0.35, 1.0)),
      swamp: swamp * ground * (1 - cave), cave: cave * ground, wreck: wreck * ground * (1 - cave),
      canopy: canopyP * ground * (1 - cave), canopyUp: canopyUp * ground,
      meadow: Math.min(1, p.open * 1.3) * ground * (1 - harbor * 0.8) * (1 - jungleP * 0.7) * (1 - town * 0.85) * (1 - cave) * (1 - 0.8 * swamp) * (1 - 0.8 * wreck) * (1 - 0.6 * canopyP),
      town: town * ground,
      lab: poi(["cnvs-lab"], 0.35, 1.0) * ground,
      cliff: poi(["lookout-point"], 0.35, 1.0) * ground,
      surf: (1 - smooth(25, 320, seaD)) * ground * (1 - 0.75 * wreck) * (1 - 0.85 * cave) * (1 - 0.6 * canopyUp),
      harbor: harbor * ground,
      lagoon: lagoon * ground,
      volcanic: volcanic * ground,
      // (up in the canopy the wind is the place: the crowns sway, the high wind bed rises with you)
      wind: Math.max(highWind * ground * (1 - cave), alt * 0.25, canopyUp * 0.8),
      storm: env.inStorm ? 1 : 0,
    };
    // never a dead spot: paved towns / roads with no biome around them get the open-air bed (birds, grass, breeze)
    const sum = w.jungle + w.meadow + w.harbor + w.lagoon + w.volcanic + w.wind + w.town + w.swamp + w.cave + w.wreck + w.canopy;
    if (sum < 0.6) w.meadow += (0.6 - sum) * ground;
    this.w = w;
    const set = (g: string, v: number) => { const b = this.beds.get(g); if (b) b.target = Math.max(0, Math.min(1, v)); };
    const outdoor = env.inStorm ? 0.45 : 1;
    set("amb/jungle", w.jungle * outdoor);
    set("amb/insects", (w.jungle * 0.8 + w.meadow * 0.45) * outdoor * (1 - w.volcanic) * (1 - cave) * (1 - 0.6 * canopyP));
    set("amb/meadow", w.meadow * outdoor);
    set("amb/town", w.town * outdoor);
    set("amb/surf-far", Math.max(w.surf * 0.9, alt * 0.35 * (seaD < 1e8 ? 1 : 0.5)) * outdoor);
    set("amb/harbor", w.harbor * outdoor);
    set("amb/lagoon", w.lagoon * outdoor);
    set("amb/swamp", w.swamp * outdoor);
    set("amb/cave", w.cave);
    // (the crowns: a little from the forest floor, all of it up on the decks)
    set("amb/canopy", Math.min(1, 0.6 * w.canopy + w.canopyUp) * outdoor);
    set("amb/volcanic", w.volcanic * outdoor);
    set("amb/wind-high", w.wind * outdoor);
    set("amb/altitude", alt);
    set("amb/room", env.indoors ? 1 : 0);
    set("storm/inside", w.storm);
    // surf emitters: the two nearest shore directions at least ~70° apart
    const sea = [...p.sea].sort((a, b) => a.dist - b.dist);
    const picks: typeof sea = [];
    for (const s of sea) {
      if (picks.length >= 2) break;
      if (picks.every((q) => angDiff(q.ang, s.ang) > 1.2)) picks.push(s);
    }
    this.surf.forEach((em, j) => {
      const i = j % 2, s = picks[i];
      if (s && s.dist < em.max) {
        em.pos = [s.x, 0.6, s.z];
        em.target = (i === 0 ? 1 : 0.7) * outdoor * (1 - 0.7 * wreck) * (1 - 0.85 * cave);
      } else em.target = 0;
    });
  }

  private place(kind: Sprinkle["place"]): V3 | null {
    const L = this.e.listener.pos, t = this.e.world.terrain;
    const a = this.e.ambRnd() * Math.PI * 2;
    if (kind === "shore" || kind === "water") {
      const s = this.probe?.sea.length ? this.probe.sea[Math.floor(this.e.ambRnd() * this.probe.sea.length)] : null;
      if (!s) return null;
      return [s.x + (this.e.ambRnd() - 0.5) * 30, kind === "shore" ? 8 + this.e.ambRnd() * 20 : 0.5, s.z + (this.e.ambRnd() - 0.5) * 30];
    }
    if (kind === "surfline") {
      // a wave breaking on the nearest stretch of shore (the probe's sea points are the waterline around you)
      const sea = this.probe?.sea.length ? [...this.probe.sea].sort((a, b) => a.dist - b.dist) : null;
      if (!sea || sea[0].dist > 160) return null;
      const s = sea[Math.floor(this.e.ambRnd() * Math.min(3, sea.length))];
      return [s.x + (this.e.ambRnd() - 0.5) * 24, 0.6, s.z + (this.e.ambRnd() - 0.5) * 24];
    }
    if (kind === "slap") {
      // a small wave slapping the waterline NEAR you (≤ ~45 m of shore), not the breaking surf out there
      const sea = this.probe?.sea.length ? [...this.probe.sea].sort((a, b) => a.dist - b.dist) : null;
      if (!sea || sea[0].dist > 65) return null;
      const s = sea[Math.floor(this.e.ambRnd() * Math.min(2, sea.length))];
      if (s.dist > 70) return null;
      return [s.x + (this.e.ambRnd() - 0.5) * 12, 0.4, s.z + (this.e.ambRnd() - 0.5) * 12];
    }
    if (kind === "far") {
      // across the water: 250-450 m out towards the nearest open sea
      const s = this.probe?.sea.length ? this.probe.sea[Math.floor(this.e.ambRnd() * this.probe.sea.length)] : null;
      const ang = s ? s.ang : a, rr = 250 + this.e.ambRnd() * 200;
      return [L[0] + Math.cos(ang) * rr, 12, L[2] + Math.sin(ang) * rr];
    }
    if (kind === "ship" || kind === "shipHigh") {
      // somewhere on the galleon's hull / rigging (within ~14 m of midship along the keel)
      const u = (this.e.ambRnd() - 0.5) * 28, v = (this.e.ambRnd() - 0.5) * 8;
      return [SHIP[0] - u * 0.98 + v * 0.2, kind === "shipHigh" ? 14 + this.e.ambRnd() * 14 : 1 + this.e.ambRnd() * 9, SHIP[2] + u * 0.2 + v * 0.98];
    }
    if (kind === "ear") {
      // right by your head (a mosquito): 0.6-1.6 m, around ear height
      const rr = 0.6 + this.e.ambRnd();
      return [L[0] + Math.cos(a) * rr, L[1] + (this.e.ambRnd() - 0.4) * 0.6, L[2] + Math.sin(a) * rr];
    }
    if (kind === "cave") {
      // under the hall's roof: 6-26 m around you, 5-14 m up (drips from the ceiling, bats in the dark)
      const rr = 6 + this.e.ambRnd() * 20, g = t ? Math.max(0, t.height(L[0], L[2])) : L[1];
      return [L[0] + Math.cos(a) * rr, Math.min(CAVE.roof - 2, g + 5 + this.e.ambRnd() * 9), L[2] + Math.sin(a) * rr];
    }
    if (kind === "arch") return [CAVE.arch[0] + (this.e.ambRnd() - 0.5) * 8, CAVE.arch[1], CAVE.arch[2] + (this.e.ambRnd() - 0.5) * 8];
    const r = kind === "air" ? 300 + this.e.ambRnd() * 500 : kind === "near" ? 7 + this.e.ambRnd() * 18 : kind === "field" ? 6 + this.e.ambRnd() * 16 : kind === "sky" ? 50 + this.e.ambRnd() * 100 : kind === "roof" ? 10 + this.e.ambRnd() * 25 : 14 + this.e.ambRnd() * (kind === "canopy" ? 55 : 35);
    const x = L[0] + Math.cos(a) * r, z = L[2] + Math.sin(a) * r;
    const g = t ? Math.max(0, t.height(x, z)) : 0;
    const y = kind === "canopy" ? g + 6 + this.e.ambRnd() * 12 : kind === "air" ? g + 250 : kind === "sky" ? g + 40 + this.e.ambRnd() * 50 : kind === "roof" ? g + 5 + this.e.ambRnd() * 5 : kind === "near" ? g + 1.5 + this.e.ambRnd() * 3 : kind === "field" ? g + 0.8 + this.e.ambRnd() * 0.8 : g + 0.5;
    return [x, y, z];
  }
}

function angDiff(a: number, b: number) {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
