// Breakable glass — headless checks on the real static world:
//  1. the pane table: how many panes per POI
//  2. every breaker on the authoritative Match: a shot, a punch (E), a sprint into a window, a rocket blast
//  3. the window VAULT on every pane that has a floor under its sill on one side: jump at it from that side and see
//     the kong come out on the other (smashing the pane on the way) — success rate by POI
//  4. the wire: the breaks go out as EV.Glass and "match".glass lists them for a late joiner
//  usage: npx tsx tools/glass/test.mts [--n 400]
import fs from "node:fs";
import { Terrain } from "../../shared/world/terrain";
import { decodeTerrainFile, generateTerrain } from "../../shared/world/terrain-gen";
import { buildStaticWorld } from "../../shared/sim/static-world";
import { Match } from "../../shared/sim/match";
import { B, PS, makeInput, makePlayer, stepPlayer } from "../../shared/sim/player";
import { GlassState, PG, glassPunch, glassShot, glassBlast } from "../../shared/sim/glass";
import { EV, EV_BYTES, Reader } from "../../shared/net/proto";
import { matchInfo } from "../../shared/net/host";
import { DT } from "../../shared/sim/const";
import { makeHit } from "../../shared/sim/world";
import { POIS } from "../../shared/world/map";

const N = Number(process.argv[process.argv.indexOf("--n") + 1]) || 400;
const td = (() => { try { const b = fs.readFileSync(new URL("../../public/assets/terrain/island.bin", import.meta.url)); return decodeTerrainFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); } catch { return generateTerrain(); } })();
const terrain = new Terrain(td.heights, td.biome);
const { world } = await buildStaticWorld(terrain, td);
const m = new Match({ seed: 7, mode: "solo", world, humans: [{ id: 0, name: "T", team: 0 }] });
const gs = m.glass, P = gs.panes, G = P.geo;
const poiOf = (x: number, z: number) => { let best = "", bd = 1e9; for (const p of POIS) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p.id; } } return best; };
const byPoi = new Map<string, number>();
for (let k = 0; k < P.n; k++) { const id = poiOf(G[k * PG], G[k * PG + 2]); byPoi.set(id, (byPoi.get(id) ?? 0) + 1); }
console.log(`panes: ${P.n}`, Object.fromEntries([...byPoi].sort((a, b) => b[1] - a[1])));
let fails = 0;
const ok = (c: boolean, what: string) => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) fails++; };

// ---- 2. breakers
const H = makeHit();
const pick = (want: (k: number) => boolean) => { for (let k = 0; k < P.n; k++) if (!gs.broken[k] && want(k)) return k; return -1; };
const big = (k: number) => G[k * PG + 7] >= 0.5 && G[k * PG + 8] >= 0.6;
{
  const k = pick(big), o = k * PG;
  const ox = G[o] + G[o + 3] * 6, oz = G[o + 2] + G[o + 4] * 6, oy = G[o + 1];
  const n = glassShot(gs, ox, oy, oz, -G[o + 3], 0, -G[o + 4], 20);
  ok(n >= 1 && gs.isBroken(k), `shot breaks pane ${k} (${poiOf(G[o], G[o + 2])}) and carries on (${n} broken)`);
  world.raycast(ox, oy, oz, -G[o + 3], 0, -G[o + 4], 6, H, true);
  ok(!H.hit || H.t > 5.9, "bullets pass a pane (noShoot)");
}
{
  const k = pick(big), o = k * PG;
  const n = glassPunch(gs, G[o] + G[o + 3] * 1.2, G[o + 1], G[o + 2] + G[o + 4] * 1.2, -G[o + 3], 0, -G[o + 4]);
  ok(n === 1 && gs.isBroken(k), `punch at 1.2 m breaks pane ${k}`);
  const k2 = pick(big), o2 = k2 * PG;
  ok(glassPunch(gs, G[o2] + G[o2 + 3] * 2.6, G[o2 + 1], G[o2 + 2] + G[o2 + 4] * 2.6, -G[o2 + 3], 0, -G[o2 + 4]) === 0, "punch at 2.6 m is out of reach");
}
{
  const k = pick(big), o = k * PG;
  const n = glassBlast(gs, G[o] + G[o + 3] * 2, G[o + 1], G[o + 2] + G[o + 4] * 2, 3);
  ok(n >= 1 && gs.isBroken(k), `a blast 2 m away breaks ${n} pane(s)`);
}
// the events + the late-joiner list
{
  const before = gs.count;
  (m as unknown as { flushGlass(): void }).flushGlass();
  const u8 = m.ev.finish(1), r = new Reader(u8); r.o = 1; const n = r.u8(); r.u32();
  let glassEv = 0; for (let i = 0; i < n; i++) { const kind = r.u8(); if (kind === EV.Glass) { glassEv++; r.o += 4; } else r.o += EV_BYTES[kind]; }
  ok(glassEv === before, `EV.Glass events: ${glassEv} for ${before} breaks`);
  m.ev.reset();
  const info = matchInfo(m, 7, { 0: 0 }) as { glass: number[] };
  ok(Array.isArray(info.glass) && info.glass.length === before, `"match".glass lists ${info.glass.length} broken panes for a late joiner`);
  const mirror = new GlassState(world); for (const id of info.glass) mirror.breakPane(id, 0);
  ok(mirror.count === before && info.glass.every((id) => mirror.isBroken(id)), "a client mirror rebuilt from it matches");
  gs.bind();
}

// ---- 3. vault + body: for each pane, find a side with a floor 0.3-1.75 m under the sill; stand there 0.9 m out, jump in
const p = makePlayer(0, 0, "v", false), inp = makeInput();
const res = new Map<string, [number, number]>();
let tried = 0, bodyOk = 0, bodyTried = 0;
const order = Array.from({ length: P.n }, (_, i) => i).sort((a, b) => ((a * 2654435761) >>> 0) - ((b * 2654435761) >>> 0));
for (const k of order) {
  if (tried >= N) break;
  const o = k * PG, hw = G[o + 7], hh = G[o + 8];
  if (hw < 0.43 || hh * 2 < 1.2) continue;
  const sill = G[o + 1] - hh;
  for (const sd of [1, -1]) {
    const sx = G[o] + G[o + 3] * sd * 0.95, sz = G[o + 2] + G[o + 4] * sd * 0.95;
    world.raycast(sx, sill - 0.25, sz, 0, -1, 0, 2, H, false);
    if (!H.hit || sill - H.y < 0.3 || sill - H.y > 1.6) continue;
    // standing room there?
    world.resolveCapsule(sx, H.y + 0.01, sz, 0.42, 1.9, false);
    if (Math.abs(world.P[0] - sx) + Math.abs(world.P[2] - sz) > 0.05) continue;
    gs.reset(); gs.bind();
    Object.assign(p, { x: sx, y: H.y, z: sz, vx: 0, vy: 0, vz: 0, st: PS.Ground, grounded: true, crouch: false, mvT: 0, mvY: 0, airT: 0, coyote: 0, jumpBuf: 0, fallV: 0, prevButtons: 0, swim: false, slope: false });
    const yaw = Math.atan2(G[o + 3] * sd, G[o + 4] * sd);   // forward (-sin yaw, -cos yaw) = -n·sd
    inp.yaw = yaw; inp.pitch = 0; inp.mx = 0; inp.mz = 1; inp.slot = 0;
    let vaulted = false;
    for (let t = 0; t < 90; t++) {
      inp.buttons = t === 2 ? B.JUMP : 0;
      stepPlayer(p, inp, world, DT);
      if (p.st === PS.Mantle && p.crouch) vaulted = true;
    }
    const s1 = (p.x - G[o]) * G[o + 3] + (p.z - G[o + 2]) * G[o + 4];
    const through = vaulted && s1 * sd < -0.3 && gs.isBroken(k);
    const id = poiOf(G[o], G[o + 2]) + (sd > 0 ? "" : "");
    const r = res.get(id) ?? [0, 0]; r[0]++; if (through) r[1]++; res.set(id, r);
    tried++;
    // body: sprint at it from 4 m (a ground-floor window from the street: the pane overlaps the body)
    if (sill - H.y < 1.2) {
      gs.reset(); gs.bind(); bodyTried++;
      Object.assign(p, { x: G[o] + G[o + 3] * sd * 3.5, y: H.y, z: G[o + 2] + G[o + 4] * sd * 3.5, vx: 0, vy: 0, vz: 0, st: PS.Ground, grounded: true, crouch: false, mvT: 0, airT: 0 });
      world.raycast(p.x, H.y + 1, p.z, 0, -1, 0, 3, H, false); if (H.hit) p.y = H.y;
      for (let t = 0; t < 60 && !gs.isBroken(k); t++) { inp.buttons = B.SPRINT; stepPlayer(p, inp, world, DT); }
      if (gs.isBroken(k)) bodyOk++;
    }
    break;
  }
}
for (const [id, [n, okN]] of [...res].sort()) console.log(`  vault ${id.padEnd(16)} ${okN}/${n}`);
const tot = [...res.values()].reduce((a, r) => [a[0] + r[0], a[1] + r[1]], [0, 0]);
ok(tot[0] > 0 && tot[1] / tot[0] >= 0.75, `window vault: ${tot[1]}/${tot[0]} panes (${Math.round(100 * tot[1] / Math.max(1, tot[0]))} %) jumped through`);
console.log(`  sprint-into-window breaks: ${bodyOk}/${bodyTried}`);
gs.reset();
process.exit(fails ? 1 : 0);
