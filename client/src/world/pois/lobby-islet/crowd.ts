// The lobby crowd for the lobby screenshot (stage "lobby-crowd"): ~20 kongs at the bar, in the deck chair, on the
// trampoline, at the punching bag, test-firing at the dummies, around the net, on the dock and jogging to the plane.
// Placement only — the kong look + animation belong to client/src/actors/kong*.ts (contract api.ts + kong-dev-views).
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { createKong } from "../../../actors/kong";
import { pose, hold } from "../../../actors/kong-dev-views";
import type { KongPose } from "../../../actors/api";
import { LOBBY, DIM, type LobbyItem, toWorld, toFrame, worldYaw, itemLocal, groundY, colliders } from "../../../../../shared/pois/lobby-islet";
import type { ShowPose } from "../../../actors/kong-rig";

const item = (id: string) => LOBBY.find((i) => i.id === id)!;
/** world yaw that faces from frame point a toward frame point b (kong yaw 0 = facing -Z) */
function face(a: [number, number], b: [number, number]): number {
  const [ax, az] = toWorld(a[0], a[1]), [bx, bz] = toWorld(b[0], b[1]);
  return Math.atan2(-(bx - ax), -(bz - az));
}
/** world velocity along a facing yaw */
const vel = (yaw: number, speed: number) => ({ vx: -Math.sin(yaw) * speed, vz: -Math.cos(yaw) * speed });

type Spot = { at: [number, number]; y?: number; yaw: number; extra: Partial<KongPose>; t: number; emote?: 0 | 1 | 2; show?: ShowPose };

/** push a ground-standing kong (frame point) out of every collider box that rises above the sand (dummies, posts,
 *  crates, barrels, the tramp, the bag…) — keeps a 0.45 m body radius clear */
function unclip(at: [number, number], y: number): [number, number] {
  let [x, z] = toWorld(at[0], at[1]);
  for (let it = 0; it < 4; it++) {
    let moved = false;
    for (const b of colliders) {
      if (b.c[1] + b.h[1] < y + 0.25 || b.c[1] - b.h[1] > y + 1.9) continue;
      const cy = Math.cos(b.yaw ?? 0), sy = Math.sin(b.yaw ?? 0), dx = x - b.c[0], dz = z - b.c[2];
      const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy, ex = b.h[0] + 0.45, ez = b.h[2] + 0.45;
      if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
      let nx = lx, nz = lz;
      if (ex - Math.abs(lx) < ez - Math.abs(lz)) nx = Math.sign(lx || 1) * ex; else nz = Math.sign(lz || 1) * ez;
      x = b.c[0] + nx * cy + nz * sy; z = b.c[2] - nx * sy + nz * cy; moved = true;
    }
    if (!moved) break;
  }
  return toFrame(x, z);
}

export async function stageCrowd(ctx: WorldCtx) {
  const ground = (lx: number, d: number) => { const [x, z] = toWorld(lx, d); return ctx.terrain.height(x, z); };
  const tiki = item("tiki"), plat = item("platform"), bag = item("bag"), tramp = item("tramp"), chair = item("chair"), plane = item("plane");
  const deckY = groundY(tiki) + DIM.tiki.floor, dockY = plat.top ?? 1.25;
  const onTiki = (x: number, z: number) => itemLocal(tiki, x, z);
  const onPlat = (x: number, z: number) => itemLocal(plat, x, z);
  const tikiFront = worldYaw(tiki.a) + Math.PI;                 // facing out of the bar (item +Z)
  const bagP = itemLocal(bag, DIM.gallows.beam, 0);
  const dA = item("dummy-a"), dB = item("dummy-b"), dC = item("dummy-c");
  const P = (it: LobbyItem): [number, number] => [it.lx, it.d];
  const cam: [number, number] = [0, 0];
  const spots: Spot[] = [
    // ---- foreground: wading hero (gun out to the right), big shooter on the sand at left
    { at: [0.9, 6.2], yaw: face([0.9, 6.2], [7, 3.5]), extra: { weapon: "pistol", pitch: 0.12 }, t: 0.8 },
    { at: [-5.0, 8.4], yaw: face([-5.0, 8.4], P(dA)), extra: { weapon: "smg", pitch: 0.02 }, t: 0.5 },
    // ---- tiki bar: bartender + two at the counter + one wandering off with a drink hand
    { at: onTiki(0.9, (tiki.l ?? 5.6) / 2 - 1.35), y: deckY, yaw: tikiFront, extra: { weapon: null }, t: 1.1 },
    { at: onTiki(3.2, (tiki.l ?? 5.6) / 2 + 1.0), y: deckY, yaw: tikiFront + 0.4, extra: { state: "emote", weapon: null }, t: 1.7, emote: 1 },
    // ---- deck chair: lounging (flat on the back, lying in the sling)
    { at: itemLocal(chair, 0, 0.15), y: groundY(chair) - 0.02, yaw: worldYaw(chair.a) + Math.PI, extra: { weapon: null }, t: 2.5, show: "lounge" },
    // ---- trampoline jumper, bag puncher
    { at: P(tramp), y: groundY(tramp) + DIM.tramp.top + 0.55, yaw: face(P(tramp), [4, 10]), extra: { state: "jump", vy: 2.2, weapon: "pistol", pitch: 0.2 }, t: 0.3 },
    { at: [bagP[0] - 0.95, bagP[1] - 0.35], yaw: face([bagP[0] - 0.95, bagP[1] - 0.35], bagP), extra: { state: "emote", weapon: null }, t: 1.3, emote: 2 },
    // ---- test-firing at the dummies
    { at: [2.4, 10.4], yaw: face([2.4, 10.4], P(dA)), extra: { weapon: "smg", pitch: 0.04, fired: true }, t: 0.6 },
    { at: [7.4, 12.2], yaw: face([7.4, 12.2], P(dA)), extra: { weapon: "pistol", pitch: 0.06 }, t: 0.9 },
    { at: [10.9, 14.0], yaw: face([10.9, 14.0], P(dC)), extra: { weapon: "ar", pitch: 0.03 }, t: 1.4 },
    { at: [0.9, 16.6], yaw: face([0.9, 16.6], P(dB)), extra: { weapon: "shotgun", pitch: 0.02 }, t: 0.7 },
    // ---- volleyball
    { at: [12.4, 16.9], yaw: face([12.4, 16.9], [14.2, 19.5]), extra: { state: "emote", weapon: null }, t: 1.0, emote: 1 },
    { at: [15.9, 21.3], y: ground(15.9, 21.3) + 0.55, yaw: face([15.9, 21.3], cam), extra: { state: "jump", vy: 3.2, weapon: null }, t: 0.25 },
    // ---- dock: hero firing to the right, one aiming back at the dummies, one idling at the crates
    { at: onPlat(-1.7, -1.0), y: dockY, yaw: face(onPlat(-1.7, -1.0), onPlat(8, -0.2)), extra: { weapon: "pistol", pitch: 0.06, fired: true }, t: 0.9 },
    { at: onPlat(2.6, -2.2), y: dockY, yaw: face(onPlat(2.6, -2.2), P(dC)), extra: { weapon: "smg", pitch: 0.05 }, t: 0.5 },
    { at: onPlat(-4.9, 1.9), y: dockY, yaw: face(onPlat(-4.9, 1.9), cam) + 0.6, extra: { state: "emote", weapon: null }, t: 2.2, emote: 0 },
    // ---- jogging / walking across to the plane, one at the ramp
    { at: [0.6, 26.5], yaw: face([0.6, 26.5], [10, 36]), extra: { state: "move", weapon: "pistol", ...{} }, t: 0.55 },
    { at: [11.2, 27.8], yaw: face([11.2, 27.8], [2, 24]), extra: { state: "move", weapon: null }, t: 0.8 },
    { at: [-3.2, 33.0], yaw: face([-3.2, 33.0], [-14, 30]), extra: { state: "move", weapon: "smg" }, t: 0.4 },
    { at: [-11.5, 36.5], yaw: face([-11.5, 36.5], cam), extra: { weapon: "pistol", pitch: 0.4 }, t: 1.2 },
    { at: itemLocal(plane, 17.5, 0.2), yaw: worldYaw(plane.a) + Math.PI / 2, extra: { state: "move", weapon: null }, t: 0.6 },
    { at: [20.5, 31.5], yaw: face([20.5, 31.5], cam), extra: { state: "emote", weapon: null }, t: 0.9, emote: 0 },
    // extra life: a kong dancing by the trampoline, one jogging up the beach, two near the plane's nose
    { at: [-6.2, 12.4], yaw: face([-6.2, 12.4], cam), extra: { state: "emote", weapon: null }, t: 1.6, emote: 0 },
    { at: [-1.8, 19.8], yaw: face([-1.8, 19.8], [6, 26]), extra: { state: "move", weapon: "pistol" }, t: 0.45 },
    { at: [-6.5, 30.0], yaw: face([-6.5, 30.0], [4, 36]), extra: { weapon: "ar", pitch: 0.1 }, t: 0.8 },
    { at: [5.0, 31.0], yaw: face([5.0, 31.0], cam), extra: { state: "emote", weapon: null }, t: 1.1, emote: 1 },
    // ---- seated at the bar: kongs on two of the stools, one leaning on the counter
    // (the bartender, ONE on a stool turned to the camera, one leaning — not a row of identical kongs)
    ...[0].map((i): Spot => { const st = item(`stool-${i}`); return { at: [st.lx, st.d], y: groundY(st) + 0.74 - 0.42, yaw: tikiFront - 0.5, extra: { weapon: null }, t: 0.6 + i * 0.3, show: "sit" }; }),
    { at: onTiki(1.6, (tiki.l ?? 5.6) / 2 + 0.72), y: deckY, yaw: tikiFront + Math.PI, extra: { weapon: null }, t: 0.9, show: "bar" },
    // ---- the crowd packed toward the camera (kongs everywhere in the foreground)
    { at: [-3.6, 3.9], yaw: face([-3.6, 3.9], P(dA)) - 0.2, extra: { weapon: "pistol", pitch: 0.08 }, t: 0.7 },     // wading, test-firing
    { at: [-1.2, 4.6], yaw: face([-1.2, 4.6], [2, 12]), extra: { weapon: "ar", pitch: 0.05 }, t: 0.4 },
    { at: [-7.8, 6.2], yaw: face([-7.8, 6.2], P(dA)), extra: { weapon: "smg", pitch: 0.04, fired: true }, t: 1.9 },
    { at: [-9.6, 8.8], yaw: face([-9.6, 8.8], [-2, 14]), extra: { weapon: "shotgun", pitch: 0.1 }, t: 0.6 },
    { at: [-5.2, 11.2], yaw: face([-5.2, 11.2], [6, 9]), extra: { state: "move", weapon: "smg" }, t: 0.5 },
    { at: [-2.6, 7.6], yaw: face([-2.6, 7.6], P(dA)), extra: { weapon: "pistol", pitch: 0.08, fired: true }, t: 0.8 },
    { at: [-12.6, 14.8], yaw: face([-12.6, 14.8], P(dA)), extra: { weapon: "pistol", pitch: 0.05 }, t: 0.8 },
    { at: [-8.4, 17.6], yaw: face([-8.4, 17.6], P(dB)), extra: { weapon: "ar", pitch: 0.03 }, t: 1.4 },
    { at: [2.8, 21.8], yaw: face([2.8, 21.8], cam), extra: { weapon: "sniper", pitch: 0.3 }, t: 1.0 },
    { at: [8.6, 21.0], y: ground(8.6, 21.0) + 0.45, yaw: face([8.6, 21.0], cam), extra: { state: "jump", vy: 2.8, weapon: null }, t: 0.25 },
    { at: [-4.6, 24.2], yaw: face([-4.6, 24.2], [6, 30]), extra: { state: "move", weapon: null, sprint: true }, t: 0.35 },
    { at: [13.8, 26.4], yaw: face([13.8, 26.4], [4, 22]), extra: { state: "move", weapon: "pistol" }, t: 0.65 },
    // ---- dock: one sitting on the edge with his legs over the water, two chatting at the crates
    { at: onPlat(-0.6, -(7.4 / 2) + 0.28), y: dockY - 0.44, yaw: worldYaw(plat.a) + Math.PI, extra: { weapon: null }, t: 1.2, show: "sit" },
    { at: onPlat(3.9, 0.6), y: dockY, yaw: face(onPlat(3.9, 0.6), cam) + 0.3, extra: { state: "emote", weapon: null }, t: 0.5, emote: 1 },
    { at: onPlat(5.1, 1.5), y: dockY, yaw: face(onPlat(5.1, 1.5), onPlat(3.9, 0.6)), extra: { weapon: "ar", pitch: -0.1 }, t: 1.3 },
  ];
  // Standing kongs that face away turn toward the camera (2 of 3; they test-fire past the camera, cheer at it), and
  // ground kongs keep ≥ 1.2 m between centres
  const toCam = (at: [number, number]) => face(at, [0, -2]);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  spots.forEach((s, i) => {
    if (s.show || s.y !== undefined) return;
    const tc = toCam(s.at), off = wrap(s.yaw - tc);
    if (Math.abs(off) > 1.4 && i % 3 !== 0) s.yaw = tc + Math.sign(off || 1) * (0.35 + (i % 4) * 0.15);
  });
  for (let it = 0; it < 6; it++) for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) {
    const A = spots[a], B = spots[b];
    if (A.y !== undefined || B.y !== undefined) continue;
    const dx = B.at[0] - A.at[0], dz = B.at[1] - A.at[1], d = Math.hypot(dx, dz);
    if (d >= 1.2 || d < 1e-4) continue;
    const push = (1.2 - d) / 2 + 0.01, ux = dx / d, uz = dz / d;
    A.at = [A.at[0] - ux * push, A.at[1] - uz * push]; B.at = [B.at[0] + ux * push, B.at[1] + uz * push];
  }
  let variant = 3;
  for (const [i, s] of spots.entries()) {
    const k = await createKong(ctx, { variant: variant++ });
    ctx.scene.add(k.object);
    // ground kongs walk up the beach until they stand on dry sand; every standing kong (dock too) is pushed clear of
    // the colliders
    if (s.y === undefined) { for (let n = 0; n < 40 && ground(s.at[0], s.at[1]) < 0.55; n++) s.at = [s.at[0], s.at[1] + 0.35]; }
    if (!s.show) s.at = unclip(s.at, s.y ?? ground(s.at[0], s.at[1]));
    const [x, z] = toWorld(s.at[0], s.at[1]);
    const y = s.y ?? ctx.terrain.height(x, z);
    if (s.show) k.animator.showPose = s.show;
    const speed = s.extra.state === "move" ? (i % 2 ? 1.7 : 4.8) : 0;
    // team 0: the lobby is a warm-up, no friend/foe rims
    const p = pose(x, y, z, s.yaw, { team: 0, friendly: true, ...vel(s.yaw, speed), ...s.extra });
    // emote index: the animator cycles cheer → flex → dance on each entry into "emote"
    if (s.emote !== undefined) {
      const entries = (((s.emote - 1) % 3) + 3) % 3;
      for (let e = 0; e < entries; e++) { k.apply({ ...p, state: "emote" }, 1 / 60); k.apply({ ...p, state: "idle" }, 1 / 60); }
    }
    const fired = p.fired;
    if (fired) {
      // settle the pose, then fire on the last frame so the recoil is visible in the still
      hold(ctx, k, { ...p, fired: false }, s.t);
      k.apply(p, 1 / 60);
      for (let f = 0; f < 4; f++) k.apply({ ...p, fired: false }, 1 / 60);
    } else hold(ctx, k, p, s.t);
  }
  void THREE;
}
