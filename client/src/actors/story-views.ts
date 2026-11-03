// Target-art views built from the real systems:
//   char-01-squad        4-kong outfit line-up on the lobby islet's west beach at golden hour (outfits.ts)
//   char-04-victory      the victory emote on a basalt summit rock on Ripe Peak's rim at sunset: golden banana + confetti
//   drop-03-mass-jump    the jump plane (plane.ts, ramp open) with 20 freefalling kongs over the island
//   drop-04-skydive-pov  first-person skydive: both fur arms + peel wraps + fists in frame, divers ahead, island below
//   drop-06-landing      a glider flare onto a thatched roof with dual pistols (glider.ts, tp-hamlet-kit thatch)
// Every kong is a real createKong() actor (GPU-skinned, the gameplay LODs) posed by the gameplay animator states
// (freefall / glide / emote / move) + staging overlays / IK; the plane and gliders are the gameplay builds.
// Lab: every stage reads its numbers from `P` (published as ctx.shared "story": { P, restage(stage) }) and builds into a
// Bag it can tear down, so a dev tool can iterate cameras / poses in one page load.
import * as THREE from "three";
import type { WorldCtx } from "../engine/engine";
import type { CamSpec } from "../engine/views";
import { createKong, type KongActorEx } from "./kong";
import type { KongPose } from "./api";
import { pose, hold } from "./kong-dev-views";
import { createPlane, type PlaneProps } from "./plane";
import { createGlider, fitGliderToKong, applyHangPose } from "./glider";
import { dress, goldenBanana, confetti, basaltRock, sunBurst, FIT } from "./outfits";
import { gableThatch, Bin, type HBins } from "./tp-hamlet-kit";
import { materials as hamletMaterials } from "./tp-hamlet";
import { hamletAnchor } from "./tp-set";
import { PRESETS } from "../world/atmos/state";
import type { AtmosApi } from "../world/atmos/index";
import type { VegApi, PlantKind } from "../world/veg/api";

const V3 = THREE.Vector3;
type Vec = THREE.Vector3;
type Overlay = KongActorEx["animator"]["overlay"];
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);
/** camera basis from a position + target: at(right, up, forward) */
function basis(pos: Vec, tgt: Vec) {
  const f = tgt.clone().sub(pos).normalize(), r = new V3().crossVectors(f, new V3(0, 1, 0)).normalize(), u = new V3().crossVectors(r, f);
  return { f, r, u, at: (x: number, y: number, z: number) => pos.clone().addScaledVector(r, x).addScaledVector(u, y).addScaledVector(f, z) };
}
function aim(ctx: WorldCtx, pos: Vec, tgt: Vec, fov?: number) {
  const c = ctx.camera; c.position.copy(pos); c.lookAt(tgt); if (fov) { c.fov = fov; c.updateProjectionMatrix(); } c.updateMatrixWorld(true);
}
/** golden-hour lighting (the midday cloud field, a low warm sun at azimuth `az`) — char-01 / char-04 */
function golden(ctx: WorldCtx, az: number, elev = 9) {
  const api = ctx.shared.get("atmos") as AtmosApi | undefined;
  if (!api) return;
  api.state.apply({
    ...PRESETS.midday, sunElev: elev, sunAz: az, sunColor: "#ffbd72", sunIntensity: 3.8,
    sky: [[0, "#ffd78e"], [3, "#ffc57a"], [7, "#f6b47c"], [12, "#e3a98a"], [18, "#b0a6bc"], [26, "#6f95cc"], [42, "#3a74c6"], [90, "#2d62b4"]],
    glowColor: "#ffc766", glow: 1.2, glowSize: 0.2, discDeg: 1.2, rays: 0.45, glare: 0.35,
    sunHorizon: "#ffd28a", sunHorizonAmt: 0.8,
    envZenith: "#a9b6d2", envHorizon: "#f6cfa2", groundHorizon: "#c49d70", groundNadir: "#8a6a48", envIntensity: 0.8,
    cloudLit: "#ffc58a", cloudSun: 2.2, cloudShade: "#a8909f", cloudTop: "#ffdcb0", cloudBase: "#907c96", cloudRim: 0.9, cloudKeyToCam: 0.3,
    hazeColor: "#f4c79c", hazeDensity: 1 / 3200,
    exposure: 1.0, saturation: 1.2, warmth: 0.1, rimLight: 0.5,
  });
}
/** everything a stage created, so the lab can rebuild it */
class Bag {
  kongs: KongActorEx[] = []; objs: THREE.Object3D[] = []; ups: Array<(dt: number, t: number) => void> = [];
  constructor(readonly ctx: WorldCtx) {}
  add<T extends THREE.Object3D>(o: T): T { this.ctx.scene.add(o); this.objs.push(o); return o; }
  async kong(variant: number, o: { bias?: number; fill?: string; rim?: string; rimK?: number; fur?: number } = {}) {
    const k = await createKong(this.ctx, { variant });
    this.ctx.scene.add(k.object); this.kongs.push(k);
    if (o.bias) k.setLodBias(o.bias);
    k.setLook({ fill: o.fill, rim: o.rim, rimStrength: o.rimK, fur: o.fur });
    return k;
  }
  clear() { for (const k of this.kongs) k.dispose(); for (const o of this.objs) o.removeFromParent(); this.kongs = []; this.objs = []; this.ups = []; }
}
function plantVeg(ctx: WorldCtx, kind: PlantKind, items: Array<[number, number, number, number]>) {
  const veg = ctx.shared.get("veg") as VegApi | undefined;
  if (!veg) return;
  veg.plant(kind, items.map(([x, z, s, yaw]) => new THREE.Matrix4().compose(new V3(x, ctx.terrain.height(x, z) - 0.1, z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yaw), new V3(s, s, s))));
}
/** freefall variety: arm / leg offsets + a body roll on top of the animator's freefall spread */
function ffOverlay(r: () => number, extra?: Overlay): Overlay {
  const a = [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5];
  return (add, t) => {
    add.R("shoulderR", a[0] * 0.6, 0, a[1] * 0.5); add.R("shoulderL", a[1] * 0.6, 0, a[0] * 0.5);
    add.R("hipR", a[2] * 0.5, 0, a[3] * 0.3); add.R("hipL", -a[2] * 0.4, 0, a[4] * 0.3);
    add.R("kneeR", -Math.abs(a[4]) * 0.8); add.R("kneeL", -Math.abs(a[5]) * 0.8);
    add.ROOT(a[5] * 0.25, a[3] * 0.35);
    extra?.(add, t);
  };
}

// ============================================================================================ parameters (lab-tunable)
export const P = {
  // (tighter lens at chest height so the four kongs fill the frame like the target art; warm front fill so the faces
  // read against the backlit sunset; heads UP — +x pitch tips the head down)
  squad: { x: -84, z: 1004, dir: [0.15, 1] as [number, number], camBack: 4.1, camUp: 1.05, camSide: -0.1, tgtUp: 1.05, fov: 50, sunDx: 4, sunElev: 12,
    fill: "#d8b48a", spacing: 1.32, head: 0.06 },
  // (az +0.6 = the clean rim — sea horizon + sunset behind, no terrain rock
  // overhangs; the camera a little under the chest, close, so the kong fills the frame like the target art)
  victory: { az: Math.PI / 4 + 0.6, rockUp: 3.2, camBack: 3.0, camUp: 0.95, camSide: 0.25, tgtUp: 1.2, fov: 52, sunDx: 0, sunElev: 13, bananaUp: 2.32, head: 0.32 },
  jump: { cam: [900, 300, 800] as [number, number, number], look: [520, 0, 360] as [number, number, number], fov: 72, plane: [-9, 5.2, 25] as [number, number, number], planeYaw: 1.25, hero: [-0.9, -1.1, 5.4] as [number, number, number],
    /** stream spread (m at the far / near end) + big foreground divers (camera frame: right, up, forward) */
    spread: [6, 28] as [number, number], near: [[2.8, -1.7, 4.8], [-3.6, -2.2, 5.8], [4.6, 0.9, 8.2]] as Array<[number, number, number]>,
    /** (target art, re-read: the divers fall AWAY from the camera, face-down — BANANA CO. packs + sneaker soles toward the
     *  camera — and turn their heads back over a shoulder to grin at it) tilt = extra arch (rad), faceJit = heading jitter */
    tilt: 0.1, faceJit: 0.7 },
  pov: { cam: [820, 470, 700] as [number, number, number], look: [540, 0, 330] as [number, number, number], fov: 100, fist: [0.46, -0.1, 0.8] as [number, number, number], back: 0.3, down: 0.12 },
  landing: { hutF: 30, hutR: -6, ridgeTurn: 0.5, q: 1.3, x: 0.3, cam: [-2.3, 1.75, 4.4] as [number, number, number], tgt: [0.7, 1.25] as [number, number], fov: 56, turn: 0.15, glider2: [5.2, -1.2, 17] as [number, number, number] },
};

const SQ = P.squad;
export const views: Record<string, CamSpec> = {
  "char-01-squad": { pos: [SQ.x, 3.3, SQ.z - 6.2], target: [SQ.x, 3.0, SQ.z + 4], fov: 52, stage: "squad", note: "4-kong outfit line-up, golden hour (actors/story-views.ts)" },
  "char-04-victory": { pos: [-334, 251, -386], target: [-332, 251, -384], fov: 62, stage: "victory", note: "victory emote on a summit rock of Ripe Peak's rim at sunset" },
  "drop-03-mass-jump": { pos: P.jump.cam, target: P.jump.look, fov: 70, stage: "mass-jump", note: "jump plane ramp + 20 freefalling kongs" },
  "drop-04-skydive-pov": { pos: P.pov.cam, target: P.pov.look, fov: 100, stage: "skydive-pov", note: "first-person skydive, arms in frame" },
  "drop-06-landing": { pos: [60, 5, 1050], target: [70, 5, 1040], fov: 60, stage: "landing", note: "glider flare onto a thatched roof, dual pistols" },
};

// ============================================================================================ stages
const STAGES: Record<string, (ctx: WorldCtx, b: Bag, first: boolean) => Promise<void>> = { squad, victory, "mass-jump": massJump, "skydive-pov": skydivePov, landing };
const bags = new Map<string, Bag>();
export async function stage(ctx: WorldCtx, id: string): Promise<void> {
  if (!STAGES[id] || bags.has(id)) return;
  const b = new Bag(ctx); bags.set(id, b);
  ctx.shared.set("story", { P, FIT, restage: async (s: string) => { const bb = bags.get(s); if (!bb) return; bb.clear(); await STAGES[s](ctx, bb, false); } });
  ctx.onUpdate((dt, t) => { for (const f of b.ups) f(dt, t); });
  await STAGES[id](ctx, b, true);
}

// ---------------------------------------------------------------------------------------------- char-01
async function squad(ctx: WorldCtx, b: Bag, first: boolean) {
  const S = P.squad, g = (x: number, z: number) => Math.max(0, ctx.terrain.height(x, z));
  const fwd = new V3(S.dir[0], 0, S.dir[1]).normalize(), right = new V3(-fwd.z, 0, fwd.x);
  const cam = new V3(S.x, 0, S.z).addScaledVector(fwd, -S.camBack).addScaledVector(right, S.camSide);
  cam.y = g(cam.x, cam.z) + S.camUp;
  const tgt = new V3(S.x, g(S.x, S.z) + S.tgtUp, S.z).addScaledVector(fwd, 2);
  aim(ctx, cam, tgt, S.fov);
  // the sun low over the sea behind the squad, a little right of the frame centre (back light + a strong warm fill)
  golden(ctx, Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI + S.sunDx, S.sunElev);
  const kongYaw = Math.atan2(fwd.x, fwd.z);     // facing the camera
  const line: Array<{ dx: number; dz: number; w: KongPose["weapon"]; hat?: "straw" | "hardhat" | "tricorn"; top?: "hawaiian" | "vest" | "coat"; shorts?: string; turn: number; aim: [number, number]; carry?: boolean }> = [
    { dx: -1.5, dz: 0.45, w: "shotgun", turn: 0.4, aim: [0.55, -0.12] },
    { dx: -0.5, dz: -0.3, w: "rocket", hat: "straw", top: "hawaiian", shorts: "#1c9c9a", turn: 0.12, aim: [0.15, 1.95], carry: true },
    { dx: 0.55, dz: 0.1, w: "smg", hat: "hardhat", top: "vest", shorts: "#e3b21c", turn: -0.12, aim: [-0.5, -0.1] },
    { dx: 1.55, dz: 0.5, w: "ar", hat: "tricorn", top: "coat", shorts: "#3d4a2a", turn: -0.4, aim: [-0.1, 1.95], carry: true },
  ];
  for (const [i, m] of line.entries()) {
    const x = S.x + right.x * m.dx * S.spacing + fwd.x * m.dz, z = S.z + right.z * m.dx * S.spacing + fwd.z * m.dz;
    const k = await b.kong(40 + i, { bias: 3, fill: S.fill, rim: "#ffcf8a", rimK: 0.4, fur: 1.1 });
    for (const o of await dress(k, { hat: m.hat, top: m.top, shorts: m.shorts })) b.add(o);
    k.setAimOffset(m.aim[0], m.aim[1]);
    // four DIFFERENT faces: open grins, a soft smile, a cocky smirk
    k.animator.expression = (["victory", "idle", "aim", "victory"] as const)[i];
    // hero stance: feet apart, chest out, head up with a grin to the camera
    k.animator.overlay = (add) => { add.R("hipR", 0.05, 0, -0.2); add.R("hipL", -0.05, 0, 0.2); add.R("kneeR", -0.2); add.R("kneeL", -0.2); add.R("chest", -0.12); add.R("head", S.head, -m.turn * 0.7); };
    if (m.carry) {
      // the gun resting on the right shoulder, barrel up and back (target art): the fist just in front of the shoulder
      const ik = { target: new V3(), pole: new V3() }, ikL = { target: new V3(), pole: new V3() };
      k.animator.ik = (an) => {
        const Sh = new V3().setFromMatrixPosition(an.bone("shoulderR")), q = new THREE.Quaternion().setFromRotationMatrix(an.root);
        // the free LEFT fist on the hip (the carried gun's up-aim otherwise lifted it to a foregrip in front of the face)
        const ShL = new V3().setFromMatrixPosition(an.bone("shoulderL"));
        ikL.target.copy(ShL).add(new V3(-0.14, -0.58, -0.1).applyQuaternion(q)); ikL.pole.set(-1, -0.2, 0.6).applyQuaternion(q);
        // raised fists hid the faces behind the hat brims, so the fist rests low in front of the
        // shoulder at chest height, the gun laid back over the shoulder (target art), the face clear
        ik.target.copy(Sh).add(new V3(0.0, -0.2, -0.3).applyQuaternion(q)); ik.pole.set(1, -0.8, 0.2).applyQuaternion(q);
        return { R: ik, L: ikL };
      };
    }
    hold(ctx, k, pose(x, g(x, z), z, kongYaw + m.turn, { weapon: m.w, pitch: 0.0 }), 0.8);
    await k.weaponReady();
  }
  if (!first) return;
  const at = (r: number, f: number) => new V3(S.x, 0, S.z).addScaledVector(right, r).addScaledVector(fwd, f);
  const L = at(-6.5, 1.5), R = at(6.8, 2.5), R2 = at(8.5, -1);
  plantVeg(ctx, "palm-leaning", [[L.x, L.z, 1.05, 0.4], [R.x, R.z, 1.0, 2.8]]);
  plantVeg(ctx, "banana-plant", [[R2.x, R2.z, 1.2, 1.1]]);
  const f1 = at(-3.6, -3.9), f2 = at(3.8, -4.0);
  plantVeg(ctx, "monstera", [[f1.x, f1.z, 1.0, 0.5], [f2.x, f2.z, 1.1, 2.2]]);
}

// ---------------------------------------------------------------------------------------------- char-04
async function victory(ctx: WorldCtx, b: Bag) {
  const S = P.victory, T = ctx.terrain;
  // the crater rim toward the island centre: the crest, a basalt summit rock standing on it (its top rockUp above)
  const C0 = new V3(-380, 0, -430), out = new V3(Math.cos(S.az), 0, Math.sin(S.az)), lat = new V3(-out.z, 0, out.x);
  let rc = 40, hc = -1;
  for (let r = 40; r < 110; r += 0.5) { const h = T.height(C0.x + out.x * r, C0.z + out.z * r); if (h > hc) { hc = h; rc = r; } }
  const rockC = C0.clone().addScaledVector(out, rc + 0.5); rockC.y = hc;
  const top = hc + S.rockUp;
  const rock = b.add(basaltRock(4.2, S.rockUp + 3.5, 3.6, 17));
  rock.position.set(rockC.x, top, rockC.z); rock.rotation.y = Math.atan2(out.x, out.z);
  const kp = rockC.clone().addScaledVector(out, 0.9); kp.y = top;
  const cam = kp.clone().addScaledVector(out, -S.camBack).addScaledVector(lat, S.camSide); cam.y = top + S.camUp;
  const tgt = kp.clone(); tgt.y = top + S.tgtUp;
  aim(ctx, cam, tgt, S.fov);
  golden(ctx, Math.atan2(out.x, -out.z) * 180 / Math.PI + S.sunDx, S.sunElev);
  const yaw = yawOf(-out.x, -out.z);                                 // facing the camera
  const k = await b.kong(1, { bias: 3, fill: "#a58462", rim: "#ffc070", rimK: 0.6, fur: 1.12 });
  // the golden banana high overhead in both fists (IK), wide power stance, chest out, grin up at the camera
  const ban = b.add(goldenBanana());
  const bc = kp.clone(); bc.y = top + S.bananaUp;
  ban.position.copy(bc); ban.rotation.set(0, yaw, 0);
  const burst = b.add(sunBurst(3.4)); burst.position.copy(bc).addScaledVector(out, 0.6).add(new V3(0, 0.1, 0));
  const rVec = new V3(Math.cos(yaw), 0, -Math.sin(yaw));
  const ikR = { target: bc.clone().addScaledVector(rVec, 0.3).add(new V3(0, -0.03, 0)), pole: rVec.clone().add(new V3(0, -0.5, 0.0)) };
  const ikL = { target: bc.clone().addScaledVector(rVec, -0.3).add(new V3(0, -0.03, 0)), pole: rVec.clone().negate().add(new V3(0, -0.5, 0)) };
  k.animator.ik = () => ({ R: ikR, L: ikL });
  k.animator.expression = "victory";      // the big open grin + happy eyes (the target art), not the idle smile
  k.animator.overlay = (add) => {
    add.R("hipR", 0.06, 0, -0.34); add.R("hipL", 0.06, 0, 0.34); add.R("kneeR", -0.32); add.R("kneeL", -0.32); add.R("ankleR", 0.18); add.R("ankleL", 0.18);
    add.H(0, -0.07, 0); add.R("spine", -0.06); add.R("chest", -0.12); add.R("head", S.head);
  };
  hold(ctx, k, pose(kp.x, top, kp.z, yaw, { weapon: null }), 0.4);
  // (the confetti box sits BEHIND the kong — pieces between the camera and the face clipped through the grin)
  b.add(confetti(kp.clone().setY(top + 2.3).addScaledVector(out, 2.1), new V3(8, 5, 3.6), 520));
}

// ---------------------------------------------------------------------------------------------- drop-03
async function massJump(ctx: WorldCtx, b: Bag) {
  const S = P.jump, cam = new V3(...S.cam), look = new V3(...S.look), B = basis(cam, look);
  aim(ctx, cam, look, S.fov);
  const heading = Math.atan2(-B.f.x, -B.f.z);
  // the plane: ahead, up and left of the camera, flying away (its open ramp toward the camera)
  const plane: PlaneProps = await createPlane(ctx, { crew: false });
  const pp = B.at(...S.plane);         // camera frame: right, up, forward
  plane.object.position.copy(pp); plane.object.rotation.set(0.05, heading + S.planeYaw, 0.08, "YXZ");
  plane.setGear(0); plane.setRamp(1); plane.setEngines(true);
  b.add(plane.object);
  plane.update(0, 12);
  b.ups.push((dt, t) => plane.update(dt, t));
  plane.object.updateMatrixWorld(true);
  const r = rng(303);
  // kongs on the ramp and in the doorway (about to jump, arms up)
  for (const [i, [x, y, z]] of ([[0.6, 1.82, 3.4], [-0.7, 1.82, 3.9], [0.1, 1.82, 2.2], [-0.4, 1.82, 1.2]] as Array<[number, number, number]>).entries()) {
    const w = new V3(x, y, z).applyMatrix4(plane.object.matrixWorld);
    const k = await b.kong(60 + i, { bias: 1.5 });
    hold(ctx, k, pose(w.x, w.y, w.z, heading + S.planeYaw + Math.PI + (r() - 0.5) * 0.6, { state: "jump", vy: 2, weapon: null }), 0.3);
  }
  // freefallers: a stream from the ramp toward the camera, spreading out (plane-relative → camera-relative)
  const exit = plane.rampExit.clone().applyMatrix4(plane.object.matrixWorld);
  const hero = B.at(...S.hero);
  const N = 20;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N, spread = S.spread[0] + (S.spread[1] - S.spread[0]) * t;
    const p = exit.clone().lerp(hero, t * 0.92).add(new V3((r() - 0.5) * spread, (r() - 0.5) * spread * 0.6, (r() - 0.5) * spread));
    if (p.distanceTo(hero) < 2.5 || p.distanceTo(cam) < 4) continue;
    const k = await b.kong(70 + i);
    const look = (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.4);
    k.animator.overlay = ffOverlay(r, (add) => { add.ROOT(-S.tilt); add.R("head", -0.45, look); add.R("chest", 0, look * 0.25); });
    hold(ctx, k, pose(p.x, p.y, p.z, heading + (r() - 0.5) * S.faceJit, { state: "freefall", weapon: null }), 0.8 + r());
  }
  // big foreground divers (target art: three huge kongs in the corners, packs + soles + grins)
  for (const [i, n] of S.near.entries()) {
    const p = B.at(...n);
    const k = await b.kong(95 + i, { bias: 3, fill: "#6a5a42" });
    const look = n[0] > 0 ? 0.95 : -0.95;   // turn toward the frame centre
    k.animator.overlay = ffOverlay(r, (add) => { add.ROOT(-S.tilt); add.R("head", -0.5, look); add.R("chest", 0, look * 0.3); });
    hold(ctx, k, pose(p.x, p.y, p.z, heading + (r() - 0.5) * 0.5, { state: "freefall", weapon: null }), 1.1 + r());
  }
  // the hero: just below-ahead of the camera, turning his head back up at it with a grin
  const k = await b.kong(3, { bias: 3, fill: "#6a5a42" });
  k.animator.overlay = (add) => { add.R("head", -0.55, 0.9); add.R("chest", -0.1, 0.35); };
  hold(ctx, k, pose(hero.x, hero.y, hero.z, heading + 0.25, { state: "freefall", weapon: null }), 1.4);
}

// ---------------------------------------------------------------------------------------------- drop-04
async function skydivePov(ctx: WorldCtx, b: Bag) {
  const S = P.pov, cam = new V3(...S.cam), look = new V3(...S.look), B = basis(cam, look);
  aim(ctx, cam, look, S.fov);
  ctx.camera.near = 0.05; ctx.camera.updateProjectionMatrix();
  const heading = Math.atan2(-B.f.x, -B.f.z);
  // "my" kong: freefall, its head just behind the camera; fists IK'd forward-out, peel wraps + furry forearms in frame
  const me = await b.kong(3, { bias: 4, fill: "#6e5c46" });
  const p = pose(0, 0, 0, heading, { state: "freefall", weapon: null });
  for (let i = 0; i < 60; i++) me.apply(p, 1 / 60);
  const head = new V3().setFromMatrixPosition(me.bone("head")).add(new V3(0, 0.2, 0));
  const want = cam.clone().addScaledVector(B.f, -S.back).addScaledVector(B.u, -S.down);
  p.x = want.x - head.x; p.y = want.y - head.y; p.z = want.z - head.z;
  const [fx, fy, fz] = S.fist;
  const ikR = { target: B.at(fx, fy, fz), pole: B.r.clone().add(B.u.clone().multiplyScalar(-0.6)), twist: 0.5 };
  const ikL = { target: B.at(-fx, fy, fz), pole: B.r.clone().negate().add(B.u.clone().multiplyScalar(-0.6)), twist: -0.5 };
  me.animator.ik = () => ({ R: ikR, L: ikL });
  hold(ctx, me, p, 0.5);
  // other divers ahead and below, arms spread (face-down, seen from above-behind: packs + soles)
  const r = rng(404);
  const spots: Array<[number, number, number]> = [[-8.5, 3.8, 13], [9, 4.2, 15], [-4, 7, 34], [4.5, 8, 41], [15, 5, 36], [-15, 6, 42]];
  for (const [i, [x, y, z]] of spots.entries()) {
    const w = B.at(x, y, z);
    const k = await b.kong(90 + i);
    k.animator.overlay = ffOverlay(r);
    hold(ctx, k, pose(w.x, w.y, w.z, heading + (r() - 0.5) * 0.8, { state: "freefall", weapon: null }), 0.9 + r());
  }
}

// ---------------------------------------------------------------------------------------------- drop-06
async function landing(ctx: WorldCtx, b: Bag, first: boolean) {
  const S = P.landing, T = ctx.terrain;
  const A = hamletAnchor(ctx);
  // the hut stands short of the hamlet (seen from the char-05 view), its ridge (+x) turned toward the shore / hamlet
  const hf = new V3(A.x - A.cam[0], 0, A.z - A.cam[2]).normalize(), hr = new V3(-hf.z, 0, hf.x);
  const hutC = new V3(A.cam[0], 0, A.cam[2]).addScaledVector(hf, S.hutF).addScaledVector(hr, S.hutR);
  const gy = Math.max(0.3, T.height(hutC.x, hutC.z));
  const ax = hf.clone().applyAxisAngle(new V3(0, 1, 0), S.ridgeTurn);
  const hutYaw = Math.atan2(-ax.z, ax.x);
  const m = hamletMaterials(ctx);
  const Bn: HBins = {
    timber: new Bin("land:timber", m.timber), paint: new Bin("land:paint", m.paint), thatch: new Bin("land:thatch", m.thatch), rope: new Bin("land:rope", m.rope, false),
    rock: new Bin("land:rock", m.rock, false, false), fruit: new Bin("land:fruit", m.fruit), cloth: new Bin("land:cloth", m.cloth), decal: new Bin("land:decal", m.decal, false),
  };
  const M = new THREE.Matrix4().compose(new V3(hutC.x, gy + 2.6, hutC.z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), hutYaw), new V3(1, 1, 1));
  const L = (x: number, y: number, z: number) => new V3(x, y, z).applyMatrix4(M);
  const roof = gableThatch(Bn, M, { len: 6.2, span: 4.6, rise: 2.3, eave: 0.8, gable: 0.55, tiers: 5, T: 0.26, seed: 8 });
  const post = new THREE.CylinderGeometry(0.11, 0.13, 2.7, 10);
  for (const [x, z] of [[-3.0, -2.2], [3.0, -2.2], [-3.0, 2.2], [3.0, 2.2], [0, 2.2], [0, -2.2]]) Bn.timber.add(post, new THREE.Matrix4().makeTranslation(x, -1.35, z).premultiply(M), "#8a6a48");
  Bn.paint.add(new THREE.BoxGeometry(6.0, 2.6, 4.4), new THREE.Matrix4().makeTranslation(0, -1.3, 0).premultiply(M), "#c9a36a");
  // bamboo pole along the near eave (target art: the bamboo edge under his feet)
  const pole = new THREE.CylinderGeometry(0.09, 0.09, 7.6, 12); pole.rotateZ(Math.PI / 2);
  Bn.timber.add(pole, new THREE.Matrix4().compose(roof.surf(1, roof.Q - 0.25, 0, 0.3), new THREE.Quaternion(), new V3(1, 1, 1)).premultiply(M), "#c8a45c");
  const grp = new THREE.Group(); grp.name = "landing-hut";
  for (const bin of Object.values(Bn)) { const me = bin.build(); if (me) grp.add(me); }
  b.add(grp);
  // the kong on the near (+z) slope; the camera off the gable end, low, looking along the slope toward the shore
  const foot = roof.surf(1, S.q, S.x, 0.2).applyMatrix4(M);
  const cam = L(...S.cam), tgt = foot.clone().add(new V3(0, S.tgt[1], 0)).addScaledVector(ax, S.tgt[0]);
  aim(ctx, cam, tgt, S.fov);
  const toCam = cam.clone().sub(foot).setY(0).normalize();
  const kyaw = Math.atan2(-toCam.x, -toCam.z) + S.turn;
  const k = await b.kong(5, { bias: 3, fill: "#7a6448", rim: "#fff0c8", rimK: 0.2 });
  k.animator.overlay = (add) => {
    add.clear("hipR"); add.clear("hipL"); add.clear("kneeR"); add.clear("kneeL"); add.clear("ankleR"); add.clear("ankleL");
    add.R("hipR", 0.6, 0, -0.3); add.R("kneeR", -1.0); add.R("ankleR", 0.4);
    add.R("hipL", -0.3, 0, 0.4); add.R("kneeL", -0.5); add.R("ankleL", 0.15);
    add.H(0, -0.2, 0); add.ROOT(0.12, 0.08); add.R("head", 0.05, 0.3); add.R("chest", -0.08);
  };
  k.setAimOffset(0.35, 0.05);
  await k.setOffhand("pistol", -0.75, 0.05);
  const ikR = { target: new V3(), pole: new V3() }, ikL = { target: new V3(), pole: new V3() };
  k.animator.ik = (an) => {
    const q = new THREE.Quaternion().setFromRotationMatrix(an.root), SR = new V3().setFromMatrixPosition(an.bone("shoulderR")), SL = new V3().setFromMatrixPosition(an.bone("shoulderL"));
    ikR.target.copy(SR).add(new V3(0.32, -0.2, -0.5).applyQuaternion(q)); ikR.pole.set(1, -0.8, 0.3).applyQuaternion(q);
    ikL.target.copy(SL).add(new V3(-0.62, -0.12, -0.25).applyQuaternion(q)); ikL.pole.set(-1, -0.8, 0.3).applyQuaternion(q);
    return { R: ikR, L: ikL };
  };
  hold(ctx, k, pose(foot.x, foot.y, foot.z, kyaw, { weapon: "pistol" }), 0.6);
  await k.weaponReady();
  // his glider: the peel canopy flaring up behind him (just let go), tilted back
  const gl = await createGlider(ctx);
  gl.object.position.copy(foot).add(new V3(0, 3.1, 0)).addScaledVector(toCam, -1.6);
  gl.object.rotation.set(-0.35, kyaw + 0.3, -0.2, "YXZ");
  b.add(gl.object);
  gl.update(0, 12);
  // another kong gliding in to land on the beach beyond
  const k2 = await b.kong(12);
  const g2p = basis(cam, tgt).at(...S.glider2); g2p.y = Math.max(g2p.y, Math.max(0.3, T.height(g2p.x, g2p.z)) + 1.2);
  const p2 = pose(g2p.x, g2p.y, g2p.z, kyaw + 0.2, { state: "glide", weapon: null });
  for (let i = 0; i < 60; i++) k2.apply(p2, 1 / 60);
  applyHangPose(k2);
  const g2 = await createGlider(ctx, { lo: true });
  b.add(g2.object);
  fitGliderToKong(g2, k2);
  g2.update(0, 12);
  if (!first) return;
  // (the leaning palm's crown sat 10 m off the camera and filled the frame with a frond; moved back so it
  // frames the right edge like the target art)
  const pr = L(15, 0, 12), r1 = L(4, 0, 6.8);
  plantVeg(ctx, "palm-leaning", [[pr.x, pr.z, 1.0, 1.9]]);
  plantVeg(ctx, "monstera", [[r1.x, r1.z, 1.5, 2.4]]);
}
