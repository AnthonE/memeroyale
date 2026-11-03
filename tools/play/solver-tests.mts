// Capsule solver acceptance tests: the REAL shared/sim/player.ts stepPlayer at 60 Hz against
// shared/sim/world.ts — on flat test terrain (probes with pass thresholds) and on the real island
// (stuck spots found in live matches). Every test also runs with the legacy solver
// (world.legacySolver) so the report shows before → after on identical inputs.
//   npx tsx tools/play/solver-tests.mts            → prints PASS / FAIL per test (--json <file> writes the report)
// Exit code 2 when any test fails.
import fs from "node:fs";
import path from "node:path";
import { StaticWorld } from "../../shared/sim/world";
import { B, PS, makeInput, makePlayer, stepPlayer, type Player } from "../../shared/sim/player";
import { DT, PLAYER_H, PLAYER_R } from "../../shared/sim/const";
import type { Box } from "../../shared/world/colliders";
import { ROOT, loadWorld, makeMover, place, setInput, step, Mode, BoxIndex } from "./world.mts";

const flat = { half: 1000, height: () => 0, normal: (_x: number, _z: number, o: number[]) => { o[0] = 0; o[1] = 1; o[2] = 0; return o; } } as unknown as ConstructorParameters<typeof StaticWorld>[0];
const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw = 0): Box => ({ c: [cx, cy, cz], h: [hx, hy, hz], yaw } as Box);
/** yaw whose forward (−sin yaw, −cos yaw) points along (dx, dz) */
const toward = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const mkWorld = (boxes: Box[], legacy: boolean) => { const w = new StaticWorld(flat, boxes); w.legacySolver = legacy; return w; };
const mkPlayer = (x: number, y: number, z: number) => { const p = makePlayer(0, 0, "t", false); p.st = PS.Ground; p.x = x; p.y = y; p.z = z; p.grounded = true; return p; };
/** max horizontal penetration of the capsule into any of the boxes (vertical overlap required) */
function embed(boxes: Box[], p: Player) {
  let worst = 0;
  for (const b of boxes) {
    const yaw = b.yaw ?? 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const dx = p.x - b.c[0], dz = p.z - b.c[2]; const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    if (p.y >= b.c[1] + b.h[1] - 1e-3 || p.y + PLAYER_H <= b.c[1] - b.h[1] + 1e-3) continue;
    const qx = Math.max(-b.h[0], Math.min(b.h[0], lx)), qz = Math.max(-b.h[2], Math.min(b.h[2], lz));
    worst = Math.max(worst, PLAYER_R - Math.hypot(lx - qx, lz - qz));
  }
  return worst;
}
function drive(w: StaticWorld, p: Player, yaw: number, ticks: number, buttons = B.SPRINT, each?: (p: Player, t: number) => void) {
  const inp = makeInput(); inp.yaw = yaw; inp.mz = 1; inp.buttons = buttons;
  for (let t = 0; t < ticks; t++) { inp.seq++; stepPlayer(p, inp, w, DT); each?.(p, t); }
}

type Res = Record<string, number | string | boolean | number[]>;
interface Test { id: string; what: string; run: (legacy: boolean) => Res; pass: (r: Res) => boolean; gate: string }
const tests: Test[] = [];

// 1. seam snag: sprint at 20° along a wall made of two boxes, the second face `proud` m further out
for (const [id, proud, yawDeg] of [["seam.coplanar", 0, 0], ["seam.proud3cm", 0.03, 0], ["seam.proud5cm", 0.05, 0], ["seam.proud10cm", 0.10, 0], ["seam.yaw2deg", 0, 2]] as Array<[string, number, number]>) {
  tests.push({ id, what: `sprint at 20° along a wall with a ${proud * 100} cm proud / ${yawDeg}° yawed seam`, gate: "speed loss at the seam ≤ 3 %",
    run: (legacy) => {
      const bx = [box(-3, 1.5, 0, 3, 1.5, 0.5), box(3, 1.5, proud, 3, 1.5, 0.5, yawDeg * Math.PI / 180)];
      const ref = [box(0, 1.5, 0, 6, 1.5, 0.5)];
      const speed = (boxes: Box[]) => { let v = 99; const p = mkPlayer(-4, 0, 1.2); drive(mkWorld(boxes, legacy), p, toward(Math.cos(0.349), -Math.sin(0.349)), 120, B.SPRINT, (q) => { if (q.x > -1 && q.x < 1.5) v = Math.min(v, Math.hypot(q.vx, q.vz)); }); return v; };
      const v0 = speed(ref), v1 = speed(bx);
      return { minSpeed: +v1.toFixed(2), singleWall: +v0.toFixed(2), lossPct: +(100 * (1 - v1 / v0)).toFixed(1) };
    }, pass: (r) => (r.lossPct as number) <= 3 });
}
// 2. spawned inside a box (1.5 m cube, start at local (0.3, 0.2)): no pop > 0.15 m per tick, out within 0.25 s
tests.push({ id: "depen.inside-box", what: "capsule starts inside a 3 m cube 0.3 / 0.2 m off centre, sprinting +X", gate: "max move per tick ≤ 0.15 m, free (embed ≤ 0.02) within 0.25 s",
  run: (legacy) => {
    const bx = [box(0, 1.5, 0, 1.5, 1.5, 1.5)]; const p = mkPlayer(0.3, 0, 0.2); let pop = 0, px = p.x, pz = p.z, freeAt = -1;
    drive(mkWorld(bx, legacy), p, toward(1, 0), 60, B.SPRINT, (q, t) => { pop = Math.max(pop, Math.hypot(q.x - px, q.z - pz)); px = q.x; pz = q.z; if (freeAt < 0 && embed(bx, q) <= 0.02) freeAt = t + 1; });
    return { maxPopPerTick: +pop.toFixed(3), freeAfterS: +(freeAt * DT).toFixed(3) };
  }, pass: (r) => (r.maxPopPerTick as number) <= 0.15 && (r.freeAfterS as number) >= 0 && (r.freeAfterS as number) <= 0.25 });
// 3. three-box pinch: a slot 0.70 m wide (narrower than the 0.84 m capsule) closed at one end, start inside it
tests.push({ id: "pinch.3-boxes", what: "start inside a 0.70 m slot closed at the far end, sprint into it for 1 s", gate: "embed ≤ 0.02 m after 1 s, max move per tick ≤ 0.15 m",
  run: (legacy) => {
    const bx = [box(-0.75, 1.5, 0, 0.4, 1.5, 2), box(0.75, 1.5, 0, 0.4, 1.5, 2), box(0, 1.5, -0.6, 2, 1.5, 0.2)];
    const p = mkPlayer(0, 0, 0.5); let pop = 0, px = p.x, pz = p.z;
    drive(mkWorld(bx, legacy), p, toward(0, -1), 60, B.SPRINT, (q) => { pop = Math.max(pop, Math.hypot(q.x - px, q.z - pz)); px = q.x; pz = q.z; });
    return { embed: +embed(bx, p).toFixed(3), maxPopPerTick: +pop.toFixed(3), end: [+p.x.toFixed(2), +p.z.toFixed(2)] };
  }, pass: (r) => (r.embed as number) <= 0.02 && (r.maxPopPerTick as number) <= 0.15 });
// 4. slot 0.80 m (4 cm narrower than the capsule): still passable, barely touching
tests.push({ id: "slot.0.80", what: "walk along a 0.80 m slot between two walls", gate: "walks through (≥ 5 m), embed during ≤ 0.03 m",
  run: (legacy) => {
    const bx = [box(-1.4, 1.5, 0, 1, 1.5, 5), box(1.4, 1.5, 0, 1, 1.5, 5)]; const p = mkPlayer(0, 0, 0); let e = 0;
    drive(mkWorld(bx, legacy), p, toward(0, -1), 180, B.SPRINT, (q) => { e = Math.max(e, embed(bx, q)); });
    return { travelled: +Math.abs(p.z).toFixed(2), maxEmbed: +e.toFixed(3) };
  }, pass: (r) => (r.travelled as number) >= 5 && (r.maxEmbed as number) <= 0.03 });
// 5. a slot 0.70 m wide entered from outside: acts as a wall (no wedge, no embed)
tests.push({ id: "slot.0.70.entry", what: "sprint straight into the mouth of a 0.70 m slot for 1.5 s", gate: "embed ≤ 0.02 m (the narrow gap acts as a wall)",
  run: (legacy) => {
    const bx = [box(-1.35, 1.5, -5, 1, 1.5, 4), box(1.35, 1.5, -5, 1, 1.5, 4)]; const p = mkPlayer(0.05, 0, 1); let e = 0;
    drive(mkWorld(bx, legacy), p, toward(0, -1), 90, B.SPRINT, (q) => { e = Math.max(e, embed(bx, q)); });
    return { maxEmbed: +e.toFixed(3), endZ: +p.z.toFixed(2) };
  }, pass: (r) => (r.maxEmbed as number) <= 0.02 });
// 6. step under a slab (stair tread 0.5 m under a slab with 1.3 m headroom): no embed, can back out
tests.push({ id: "step-under-slab", what: "sprint onto a 0.5 m step under a slab 1.8 m up (1.3 m headroom), then back out", gate: "embed ≤ 0.02 m, backs out",
  run: (legacy) => {
    const bx = [box(0, 0.25, 0, 1, 0.25, 1), box(0.8, 2.3, 0, 1, 0.5, 2)]; const p = mkPlayer(-2, 0, 0); let e = 0; const w = mkWorld(bx, legacy);
    drive(w, p, toward(1, 0), 120, B.SPRINT, (q) => { e = Math.max(e, embed(bx, q)); });
    const x0 = p.x; drive(w, p, toward(-1, 0), 120, B.SPRINT);
    return { maxEmbed: +e.toFixed(3), backedOut: +(x0 - p.x).toFixed(2) };
  }, pass: (r) => (r.maxEmbed as number) <= 0.02 && (r.backedOut as number) > 3 });
// 7. step-up heights
for (const hgt of [0.3, 0.55, 0.6]) tests.push({ id: `step.${hgt}`, what: `walk into a ${hgt} m step`, gate: hgt <= 0.55 ? "climbs" : "blocked (> STEP_H)",
  run: (legacy) => { const p = mkPlayer(0, 0, 0); let dy = 0, py = 0; drive(mkWorld([box(7, hgt / 2, 0, 5, hgt / 2, 2)], legacy), p, toward(1, 0), 72, 0, (q) => { dy = Math.max(dy, q.y - py); py = q.y; }); return { onTop: p.y > hgt - 0.01, stepDy: +dy.toFixed(2) }; },
  pass: (r) => r.onTop === (hgt <= 0.55) });
// 7b. the step lift is exposed per player for render smoothing (world.stepLift(p)), and only on the lift tick
tests.push({ id: "step.lift-exposed", what: "walk into a 0.5 m step: world.stepLift(p) after every tick", gate: "one tick reports 0.50 m, all others 0",
  run: (legacy) => { const w = mkWorld([box(7, 0.25, 0, 5, 0.25, 2)], legacy); const p = mkPlayer(0, 0, 0); const lifts: number[] = []; drive(w, p, toward(1, 0), 72, 0, (q) => { const l = w.stepLift(q); if (l > 0.01) lifts.push(+l.toFixed(3)); }); return { lifts }; },
  pass: (r) => (r.lifts as number[]).length === 1 && Math.abs((r.lifts as number[])[0] - 0.5) < 0.02 });
// 8. stairs 0.2 × 0.3 m: climbs without going airborne
tests.push({ id: "stairs.0.2x0.3", what: "walk up 10 steps of 0.2 m risers / 0.3 m treads", gate: "reaches the top (2 m), 0 airborne ticks",
  run: (legacy) => { const bx: Box[] = []; for (let i = 0; i < 10; i++) bx.push(box(1 + i * 0.3 + 0.15, (i + 1) * 0.1, 0, 0.15, (i + 1) * 0.1, 1)); bx.push(box(7, 1, 0, 3, 1, 1));
    const p = mkPlayer(0, 0, 0); let air = 0; drive(mkWorld(bx, legacy), p, toward(1, 0), 72, 0, (q) => { if (!q.grounded) air++; }); return { y: +p.y.toFixed(2), airborneTicks: air }; },
  pass: (r) => (r.y as number) >= 1.99 && r.airborneTicks === 0 });
// 9. V corner 60°: run into the apex, no embed, can leave in 5 of 8 directions
tests.push({ id: "v-corner-60", what: "run into the apex of two walls meeting at 60°, then try 8 directions", gate: "embed ≤ 0.02 m, escapes ≥ 5/8",
  run: (legacy) => {
    const a = 30 * Math.PI / 180; const bx = [box(-Math.sin(a) * 3 - 0.3, 1.5, -Math.cos(a) * 3, 0.3, 1.5, 3, a), box(Math.sin(a) * 3 + 0.3, 1.5, -Math.cos(a) * 3, 0.3, 1.5, 3, -a)];
    const w = mkWorld(bx, legacy); const p = mkPlayer(0, 0, -1); drive(w, p, toward(0, -1), 90);
    let esc = 0; for (let k = 0; k < 8; k++) { const q = mkPlayer(p.x, p.y, p.z); const w2 = mkWorld(bx, legacy); drive(w2, q, k / 8 * Math.PI * 2, 180); if (Math.hypot(q.x - p.x, q.z - p.z) > 1.5) esc++; }
    return { embed: +embed(bx, p).toFixed(3), escapes: esc };
  }, pass: (r) => (r.embed as number) <= 0.02 && (r.escapes as number) >= 5 });
// 10. sealed 1.6 m pit with 3 m walls (a geometry bug): never permanently stuck — the unstick glides out, no pop
tests.push({ id: "unstick.sealed-pit", what: "closed 1.6 × 1.6 m pit with 3 m high, 3 m thick walls: push a wall for 3 s", gate: "gets out (≥ 1.5 m), max move per tick ≤ 0.15 m",
  run: (legacy) => {
    const bx = [box(0, 1.5, -2.3, 2.3, 1.5, 1.5), box(0, 1.5, 2.3, 2.3, 1.5, 1.5), box(-2.3, 1.5, 0, 1.5, 1.5, 0.8), box(2.3, 1.5, 0, 1.5, 1.5, 0.8)];
    const p = mkPlayer(0, 0, 0); let pop = 0, px = 0, pz = 0;
    drive(mkWorld(bx, legacy), p, toward(1, 0), 180, B.SPRINT, (q) => { pop = Math.max(pop, Math.hypot(q.x - px, q.z - pz)); px = q.x; pz = q.z; });
    return { moved: +Math.hypot(p.x, p.z).toFixed(2), maxPopPerTick: +pop.toFixed(3) };
  }, pass: (r) => (r.moved as number) >= 1.5 && (r.maxPopPerTick as number) <= 0.151 });
// 10b. no wall-clip exploit: pushing into the walls of a small room that HAS a door (1.0 m), or a corridor's side wall,
//      for 3 s never glides through (the flood finds the way out, so the player is not stuck)
for (const DW of [1.0, 0.9]) tests.push({ id: `unstick.no-wall-clip.door${DW}`, what: `3 × 3 m roofed room with a ${DW} m door + a 1.2 m corridor: sprint into every wall / corner for 3 s`, gate: "0 unstick glides, stays inside",
  run: (legacy) => {
    const t = 0.3, room = [box(0, 1.5, -1.5 - t / 2, 1.5 + t, 1.5, t / 2), box(-1.5 - t / 2, 1.5, 0, t / 2, 1.5, 1.5), box(1.5 + t / 2, 1.5, 0, t / 2, 1.5, 1.5),
      box(-(1.8 + DW / 2) / 2, 1.5, 1.5 + t / 2, (1.8 - DW / 2) / 2, 1.5, t / 2), box((1.8 + DW / 2) / 2, 1.5, 1.5 + t / 2, (1.8 - DW / 2) / 2, 1.5, t / 2),   // door x ∈ ±DW/2
      box(0, 3.15, 0, 1.5 + t, 0.15, 1.5 + t)];                           // roof: no sky, door 1.0 m wide at +z
    const corr = [box(20, 1.5, -0.6 - t / 2, 10, 1.5, t / 2), box(20, 1.5, 0.6 + t / 2, 10, 1.5, t / 2)];
    const all = [...room, ...corr], w = mkWorld(all, legacy); let glides = 0, clip = 0; const where: string[] = [];
    for (let k = 0; k < 8; k++) for (const [sx, name] of [[0, "room"], [20, "corridor"]] as Array<[number, string]>) {
      const p = mkPlayer(sx, 0, 0); let g = 0, c = 0;
      drive(w, p, k / 8 * Math.PI * 2 + 0.3, 180, B.SPRINT, (q) => { if (w.unsticking(q)) g++; if (embed(all, q) > 0.05) c++; });
      glides += g; clip += c; if (g || c) where.push(`${name}@${k}`);
    }
    return { glideTicks: glides, clipTicks: clip, where: where.join(" ") };
  }, pass: (r) => r.glideTicks === 0 && r.clipTicks === 0 });
// 10c. a walled 6 × 6 m pen (2.6 m walls — a trap, larger than a pocket): pushing a wall for 3 s gets you out (±5 m pass)
tests.push({ id: "unstick.pen-6m", what: "6 × 6 m pen with 2.6 m walls (0.4 m thick): sprint into a wall for 3 s", gate: "gets out of the pen, max move per tick ≤ 0.15 m",
  run: (legacy) => {
    const S = 3, T = 0.4, H = 1.3, bx = [box(0, H, -S - T / 2, S + T, H, T / 2), box(0, H, S + T / 2, S + T, H, T / 2), box(-S - T / 2, H, 0, T / 2, H, S), box(S + T / 2, H, 0, T / 2, H, S)];
    const p = mkPlayer(1, 0, 0.5); let pop = 0, px = p.x, pz = p.z;
    drive(mkWorld(bx, legacy), p, toward(1, 0), 240, B.SPRINT, (q) => { pop = Math.max(pop, Math.hypot(q.x - px, q.z - pz)); px = q.x; pz = q.z; });
    return { end: [+p.x.toFixed(2), +p.z.toFixed(2)], outside: Math.abs(p.x) > S + T || Math.abs(p.z) > S + T, maxPopPerTick: +pop.toFixed(3) };
  }, pass: (r) => r.outside === true && (r.maxPopPerTick as number) <= 0.151 });
// 10d. an 8 × 8 m roofed room with a 1.0 m door: pushing every wall / corner never glides (the wide windows see the door)
tests.push({ id: "unstick.no-wall-clip.room8", what: "8 × 8 m roofed room, 1.0 m door: sprint into every wall / corner for 3 s from 4 spots", gate: "0 unstick glides, no wall clip",
  run: (legacy) => {
    const S = 4, t = 0.3, bx = [box(0, 1.5, -S - t / 2, S + t, 1.5, t / 2), box(-S - t / 2, 1.5, 0, t / 2, 1.5, S), box(S + t / 2, 1.5, 0, t / 2, 1.5, S),
      box(-(S + t + 0.5) / 2, 1.5, S + t / 2, (S + t - 0.5) / 2, 1.5, t / 2), box((S + t + 0.5) / 2, 1.5, S + t / 2, (S + t - 0.5) / 2, 1.5, t / 2), box(0, 3.15, 0, S + t, 0.15, S + t)];   // door x ∈ ±0.5
    const w = mkWorld(bx, legacy); let glides = 0, clip = 0;
    for (const [sx, sz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 1.5]]) for (let k = 0; k < 8; k++) {
      const p = mkPlayer(sx, 0, sz); drive(w, p, k / 8 * Math.PI * 2 + 0.3, 180, B.SPRINT, (q) => { if (w.unsticking(q)) glides++; if (embed(bx, q) > 0.05) clip++; });
    }
    return { glideTicks: glides, clipTicks: clip };
  }, pass: (r) => r.glideTicks === 0 && r.clipTicks === 0 });
// 11. pocket with an exit over a 1 m wall section 1.2 m away (the case unstick exists for): push the back wall
tests.push({ id: "unstick.pocket", what: "pocket closed by 2.5 m walls except a 1.0 m block 1.2 m away; push into the back wall for 3 s", gate: "unstick gets out (≥ 1.5 m), max move per tick ≤ 0.15 m",
  run: (legacy) => {
    const bx = [box(0, 1.25, -1.1, 1.5, 1.25, 0.3), box(-1.1, 1.25, 0, 0.3, 1.25, 1.5), box(1.1, 1.25, 0, 0.3, 1.25, 1.5), box(0, 0.5, 1.1, 1.5, 0.5, 0.3)];
    const p = mkPlayer(0, 0, 0); let pop = 0, px = 0, pz = 0;
    drive(mkWorld(bx, legacy), p, toward(0, -1), 180, B.SPRINT, (q) => { pop = Math.max(pop, Math.hypot(q.x - px, q.z - pz)); px = q.x; pz = q.z; });
    return { moved: +Math.hypot(p.x, p.z).toFixed(2), y: +p.y.toFixed(2), maxPopPerTick: +pop.toFixed(3) };
  }, pass: (r) => (r.moved as number) >= 1.5 && (r.maxPopPerTick as number) <= 0.151 });
// 12. determinism: two independent worlds + players, same inputs → bit-identical trajectories (server = client prediction)
tests.push({ id: "determinism", what: "same inputs through two independent StaticWorlds (server + client prediction) in the unstick pocket", gate: "bit-identical positions every tick",
  run: (legacy) => {
    const bx = [box(0, 1.25, -1.1, 1.5, 1.25, 0.3), box(-1.1, 1.25, 0, 0.3, 1.25, 1.5), box(1.1, 1.25, 0, 0.3, 1.25, 1.5), box(0, 0.5, 1.1, 1.5, 0.5, 0.3)];
    const a = mkPlayer(0, 0, 0), b = mkPlayer(0, 0, 0), wa = mkWorld(bx, legacy), wb = mkWorld(bx, legacy); let diff = 0;
    const inp = makeInput(); for (let t = 0; t < 240; t++) { inp.seq++; inp.yaw = toward(0, -1) + (t > 150 ? 1 : 0); inp.mz = 1; inp.buttons = B.SPRINT | (t % 50 === 0 ? B.JUMP : 0); stepPlayer(a, inp, wa, DT); stepPlayer(b, inp, wb, DT); diff = Math.max(diff, Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)); }
    return { maxDiff: diff };
  }, pass: (r) => r.maxDiff === 0 });

// ---- island: stuck spots found in live matches (+ the ripe-peak false-positive spot)
const L = await loadWorld(); const W = L.world; const bi = new BoxIndex(W);
const SPOTS: Array<[string, number, number, number]> = [["stuck-mango-market-7", 361.68, 9.05, -40.79], ["stuck-mango-market-8", 349.92, 9.0, -24.94], ["stuck-peel-harbor-1", 738.42, 1.38, 466], ["stuck-ripe-peak-5", -451.07, 239.08, -400.85]];
for (const [id, x, y, z] of SPOTS) tests.push({ id: `island.${id}`, what: `(${x}, ${y}, ${z}): 16 headings × sprint and sprint+jump, 3 s each`, gate: "not stuck: 16/16 get ≥ 1.5 m away — or, where other areas have since rebuilt the spot, the capsule there can walk 1.5 m away (world.mobile) and ≥ 8/16 headings escape (the rest face a wall)",
  run: (legacy) => {
    W.legacySolver = legacy; const m = makeMover(); let esc = 0, glide = 0; const d: number[] = [];
    for (const mode of [Mode.Sprint, Mode.JumpFwd]) for (let k = 0; k < 8; k++) {
      place(m, x, y, z, false, W);
      for (let t = 0; t < 180; t++) { setInput(m, mode, k / 8 * Math.PI * 2 + 0.2, t); step(m, W); if (W.unsticking(m.p)) glide++; }
      const dd = Math.hypot(m.p.x - x, m.p.z - z); d.push(+dd.toFixed(1)); if (dd >= 1.5) esc++;
    }
    place(m, x, y, z, false, W); m.inp.mx = 0; m.inp.mz = 0; m.inp.buttons = 0; for (let t = 0; t < 10; t++) step(m, W);
    const mobile = W.mobile(m.p.x, m.p.y, m.p.z, PLAYER_R, PLAYER_H);
    W.legacySolver = false;
    return { escapes: `${esc}/16`, esc, glideTicks: glide, mobileNow: mobile, dist: d };
  }, pass: (r) => r.esc === 16 || (r.mobileNow === true && (r.esc as number) >= 8) });

// no-input drift: standing still must never carry the player anywhere. (a) flat ground
// buried inside a 60 × 50 × 20 m box (a POI collider swallowing the ground, no free spot in reach); (b) the ripe-peak
// cone spots where the solver's best-effort push carried an idle player 0.5 m / tick uphill (11–45 m)
tests.push({ id: "drift.buried-no-input", what: "stand still for 3 s inside a 60 × 50 × 20 m box (no free spot within 5 m)", gate: "net drift ≤ 0.05 m, no tick > 0.15 m",
  run: (legacy) => {
    const bx = [box(0, 5, 0, 30, 25, 10)]; const p = mkPlayer(2, 0, 1); let pop = 0, px = p.x, pz = p.z;
    const w = mkWorld(bx, legacy), inp = makeInput();
    for (let t = 0; t < 180; t++) { inp.seq++; stepPlayer(p, inp, w, DT); pop = Math.max(pop, Math.hypot(p.x - px, p.z - pz)); px = p.x; pz = p.z; }
    return { net: +Math.hypot(p.x - 2, p.z - 1).toFixed(3), maxPopPerTick: +pop.toFixed(3) };
  }, pass: (r) => (r.net as number) <= 0.05 && (r.maxPopPerTick as number) <= 0.151 });
for (const [x, z] of [[-396.2, -384.4], [-337.5, -412.8], [-359.3, -389.8], [-335.8, -447.5], [-331.4, -434.8]] as Array<[number, number]>)
  tests.push({ id: `drift.island(${x},${z})`, what: `stand still for 3 s on the ripe-peak cone at (${x}, ${z})`, gate: "never uphill (gain ≤ 0.05 m), no tick > 0.15 m",
    run: (legacy) => {
      W.legacySolver = legacy; const m = makeMover(); place(m, x, L.terrain.height(x, z) + 0.02, z, false, W);
      m.inp.mx = 0; m.inp.mz = 0; m.inp.buttons = 0; const y0 = m.p.y; let up = 0, pop = 0, px = m.p.x, pz = m.p.z;
      for (let t = 0; t < 180; t++) { m.inp.seq++; stepPlayer(m.p, m.inp, W, DT); up = Math.max(up, m.p.y - y0); pop = Math.max(pop, Math.hypot(m.p.x - px, m.p.z - pz)); px = m.p.x; pz = m.p.z; }
      W.legacySolver = false;
      return { gain: +up.toFixed(2), maxPopPerTick: +pop.toFixed(3) };
    }, pass: (r) => (r.gain as number) <= 0.05 && (r.maxPopPerTick as number) <= 0.151 });

// ---- run
const out: Record<string, unknown> = {}; let fails = 0;
for (const t of tests) {
  const after = t.run(false), before = t.run(true), ok = t.pass(after);
  if (!ok) fails++;
  out[t.id] = { what: t.what, gate: t.gate, pass: ok, after, before_legacy: before, legacy_would_pass: t.pass(before) };
  console.log(`${ok ? "PASS" : "FAIL"}  ${t.id.padEnd(30)} ${JSON.stringify(after)}   (legacy: ${JSON.stringify(before)})`);
}
void bi;
// the JSON goes to --json <file>, or to reports/solver-tests.json when that folder exists
const ji = process.argv.indexOf("--json"), jsonOut = ji > 0 ? process.argv[ji + 1] : fs.existsSync(path.join(ROOT, "reports")) ? path.join(ROOT, "reports/solver-tests.json") : null;
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ generated: new Date().toISOString(), tool: "tools/play/solver-tests.mts", world_hash: L.hash, passed: tests.length - fails, total: tests.length, tests: out }, null, 1));
console.log(`${tests.length - fails}/${tests.length} PASS${jsonOut ? ` → ${path.relative(ROOT, jsonOut)}` : ""}`);
if (fails) process.exitCode = 2;
