// The caster camera rig: one engine camera, six ways to point it.
//   FOLLOW  — over the shoulder of one kong, chasing where it looks (drag to orbit, wheel to zoom; C re-chases)
//   POV     — through the kong's own eyes (its kong hidden, its look direction as the server has it)
//   DRONE   — frames a group (a fight: every participant of every squad in it) from a raised side angle, perpendicular
//             to the line between the squads, so both sides share the screen; glides as the fight moves
//   ORBIT   — a slow cinematic circle round one kong
//   OVERHEAD— straight down from high above the target / group (the tactical view)
//   FREE    — fly anywhere: WASD / QE, Shift fast, right-drag to look (or drag with the left button)
// Cuts are instant by default (broadcast style); a GLIDE carries the old pose into the new one over `glideS`.
// The rig never moves the camera itself mid-frame: GameRender calls apply() through its caster hook after every other
// system, so the frame draws exactly the pose computed here.
import * as THREE from "three";
import type { Engine } from "../engine/engine";
import type { StaticWorld } from "../../../shared/sim/world";
import { PS } from "../../../shared/sim/player";
import { SEAT_EYE } from "../../../shared/sim/vehicle";
import { camCast } from "../game/camcollide";
import type { CasterState, CPlayer } from "./state";

export type CamMode = "follow" | "pov" | "drone" | "orbit" | "overhead" | "free";
export const CAM_MODES: CamMode[] = ["follow", "pov", "drone", "orbit", "overhead", "free"];
export const CAM_LABEL: Record<CamMode, string> = { follow: "FOLLOW", pov: "POV", drone: "DRONE", orbit: "ORBIT", overhead: "OVERHEAD", free: "FREE CAM" };

/** what a seat shares with the other seats (castcam) and what the director asks for */
export interface CamShot { mode: CamMode; target: number; group: number[]; fight: number }

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, "YXZ");
const UP = new THREE.Vector3(0, 1, 0);
/** follow-cam whiskers: [yaw offset, pitch offset] tried when the camera arm is blocked (rad; pitch < 0 = higher) */
const WHISKERS: Array<[number, number]> = [[0.52, 0], [-0.52, 0], [1.05, 0], [-1.05, 0], [0, -0.55], [0.52, -0.45], [-0.52, -0.45], [1.65, 0], [-1.65, 0]];
/** DRONE: kongs farther than this from the group's median point are outliers (the shot frames the core) */
const CORE_R = 85;
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class CasterRig {
  mode: CamMode = "follow";
  /** the kong FOLLOW / POV / ORBIT watch (−1 = none) */
  target = -1;
  /** the group DRONE / OVERHEAD frame (player ids); empty = the target alone */
  group: number[] = [];
  /** the fight the group came from (−1 = hand-picked) */
  fight = -1;
  fov = 70;
  /** FOLLOW: orbit offset the user dragged in (rad), zoom (m); chase = the camera swings back behind the kong */
  private fYaw = 0; private fPitch = -0.28; private fDist = 5.2; chase = true;
  private dAz = 0; private dAzSet = false; private dElev = 0.62; private dZoom = 1;
  /** the user dragged the drone round: its angle + height stay theirs until the next shot */
  private userAz = false;
  private oT = 0; private oYaw0 = 0;
  /** KILL-CAM: when the watched kong is eliminated, a beat over its body looking at whoever did it (narrow lens for a
   *  far shot), then whatever was asked for meanwhile (the director's next cut, held as `pending`) — or, with nobody
   *  asking, a follow on the killer. Any hand on the controls cancels it (the app calls cancelKillCam). */
  killCamOn = true; killCamS = 2.6;
  killCam: { killer: number; victim: number; t: number; x: number; y: number; z: number } | null = null;
  private pending: { shot: Partial<CamShot>; glide: boolean } | null = null;
  private readonly kcLook = new THREE.Vector3();
  /** tools: what the last DRONE / OVERHEAD frame framed */
  lastFrame: { ids: number[]; all: number; cx: number; cz: number; r: number; dist: number } | null = null;
  /** free cam: the smoothed fly velocity */
  private readonly freeV = new THREE.Vector3();
  // smoothed state
  private readonly pos = new THREE.Vector3(); private readonly look = new THREE.Vector3(); private valid = false;
  private povYaw = 0; private povPitch = 0; private specFree = 1;
  // glide (a transition)
  glideS = 0.7; private glideT = 1; private readonly gP = new THREE.Vector3(); private readonly gQ = new THREE.Quaternion();
  // free cam
  private readonly keys = new Set<string>(); private freeYaw = 0; private freePitch = -0.3; private dragging = 0; freeSpeed = 40;
  /** last time the user touched the camera (s): the director gives a seat that is driving its own camera room */
  touchedAt = -1e9;
  private readonly offs: Array<() => void> = [];

  constructor(readonly engine: Engine, private readonly world: StaticWorld, private readonly state: CasterState, readonly canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, k: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => { t.addEventListener(k, f as EventListener, o); this.offs.push(() => t.removeEventListener(k, f as EventListener)); };
    on(window, "keydown", (e) => { if (!isTyping(e)) this.keys.add(e.code); });
    on(window, "keyup", (e) => this.keys.delete(e.code));
    on(window, "blur", () => this.keys.clear());
    on(canvas, "mousedown", (e) => { this.dragging = e.button === 2 ? 2 : 1; });
    on(window, "mouseup", () => { this.dragging = 0; });
    on(canvas, "contextmenu", (e) => e.preventDefault());
    on(window, "mousemove", (e) => {
      if (!this.dragging) return;
      const dx = e.movementX * 0.005, dy = e.movementY * 0.005;
      this.touchedAt = performance.now() / 1000;
      if (this.mode === "free") { this.freeYaw -= dx; this.freePitch = Math.max(-1.5, Math.min(1.5, this.freePitch - dy)); }
      else if (this.mode === "follow" || this.mode === "orbit") { this.chase = false; this.fYaw -= dx; this.fPitch = Math.max(-1.25, Math.min(0.75, this.fPitch - dy)); }
      else if (this.mode === "drone") { this.dAz -= dx; this.dAzSet = true; this.userAz = true; this.dElev = Math.max(0.2, Math.min(1.45, this.dElev + dy)); }
    });
    // the watched kong is eliminated by someone: the kill-cam beat
    state.listeners.push({ kill: (killer, victim, _w, final) => {
      if (!this.killCamOn || victim !== this.target || killer < 0 || killer === victim) return;
      if (this.mode !== "follow" && this.mode !== "pov" && this.mode !== "orbit") return;
      const k = this.state.players[killer], v = this.state.players[victim];
      if (!k || !k.live || !v) return;
      this.killCam = { killer, victim, t: 0, x: v.x, y: v.y, z: v.z }; this.valid = false; this.glideT = 1;
      void final;
    } });
    on(canvas, "wheel", (e) => {
      e.preventDefault(); this.touchedAt = performance.now() / 1000;
      const k = Math.exp(e.deltaY * 0.0012);
      if (this.mode === "follow" || this.mode === "orbit") this.fDist = Math.max(1.8, Math.min(40, this.fDist * k));
      else if (this.mode === "drone" || this.mode === "overhead") this.dZoom = Math.max(0.35, Math.min(4, this.dZoom * k));
      else if (this.mode === "pov") this.fov = Math.max(20, Math.min(100, this.fov * k));
      else if (this.mode === "free") this.freeSpeed = Math.max(5, Math.min(600, this.freeSpeed / k));
    }, { passive: false });
  }
  dispose() { for (const f of this.offs) f(); this.offs.length = 0; }

  /** cut (or glide) to a shot (during a kill-cam the shot waits for its end) */
  set(shot: Partial<CamShot>, glide = false) {
    if (this.killCam) { this.pending = { shot: { ...shot, group: shot.group?.slice() }, glide }; return; }
    const cam = this.engine.camera;
    const changed = (shot.mode !== undefined && shot.mode !== this.mode) || (shot.target !== undefined && shot.target !== this.target) || (shot.fight !== undefined && shot.fight !== this.fight);
    if (!changed && !shot.group) return;
    if (glide && this.valid) { this.gP.copy(cam.position); this.gQ.copy(cam.quaternion); this.glideT = 0; } else this.glideT = 1;
    if (shot.mode === "free" && this.mode !== "free") { E.setFromQuaternion(cam.quaternion, "YXZ"); this.freeYaw = E.y; this.freePitch = E.x; }
    if (shot.target !== undefined && shot.target !== this.target) { this.chase = true; this.fYaw = 0; this.dodgeY = this.dodgeP = 0; this.valid = glide && this.valid; }
    if (shot.mode !== undefined && shot.mode !== this.mode) { this.valid = glide && this.valid; if (shot.mode === "drone") { this.dAzSet = false; this.userAz = false; } }
    if (shot.fight !== undefined && shot.fight !== this.fight) { this.dAzSet = false; this.userAz = false; }
    if (shot.mode !== undefined) this.mode = shot.mode;
    if (shot.target !== undefined) this.target = shot.target;
    if (shot.group !== undefined) this.group = shot.group.slice();
    if (shot.fight !== undefined) this.fight = shot.fight;
    if (this.mode !== "pov") this.fov = 70;
  }
  shot(): CamShot { return { mode: this.mode, target: this.target, group: this.group.slice(), fight: this.fight }; }
  /** a hand on the controls: the kill-cam ends now (a pending director shot is dropped: the user decides) */
  cancelKillCam() { if (this.killCam) { this.killCam = null; this.pending = null; this.valid = false; this.fov = 70; } }
  /** re-chase: the follow camera swings back behind the kong */
  rechase() { this.chase = true; this.fYaw = 0; this.fPitch = -0.28; }
  /** (seats.ts) the free camera's pose for the other seats / PROGRAM: [x, y, z, yaw, pitch] */
  freePose(): number[] { const c = this.engine.camera.position; return [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2), +this.freeYaw.toFixed(4), +this.freePitch.toFixed(4)]; }
  /** (seats.ts) mirror another seat's free camera: ease toward its pose (call every frame while mirroring) */
  mirrorFree(p: number[], dt: number) {
    const c = this.engine.camera.position, k = 1 - Math.exp(-dt * 6);
    if (c.distanceToSquared(V.set(p[0], p[1], p[2])) > 200 * 200) c.copy(V); else c.lerp(V, k);
    let dy = p[3] - this.freeYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.freeYaw += dy * k; this.freePitch += (p[4] - this.freePitch) * k;
  }

  private tp(): CPlayer | null { const p = this.state.players[this.target]; return p && p.live ? p : null; }

  /** place engine.camera (called from GameRender's caster hook, after everything else moved this frame) */
  apply(dt: number) {
    const cam = this.engine.camera;
    if (this.killCam && this.killCamApply(dt, cam)) { cam.updateMatrixWorld(); return; }
    switch (this.mode) {
      case "follow": this.follow(dt, cam, false); break;
      case "orbit": this.follow(dt, cam, true); break;
      case "pov": this.pov(dt, cam); break;
      case "drone": this.drone(dt, cam, false); break;
      case "overhead": this.drone(dt, cam, true); break;
      case "free": this.free(dt, cam); break;
    }
    if (this.glideT < 1) {
      this.glideT = Math.min(1, this.glideT + dt / this.glideS);
      const e = 1 - (1 - this.glideT) ** 3;
      cam.position.lerpVectors(this.gP, cam.position, e); cam.quaternion.copy(Q.copy(this.gQ).slerp(cam.quaternion, e));
    }
    cam.updateMatrixWorld();
  }

  private follow(dt: number, cam: THREE.PerspectiveCamera, orbit: boolean) {
    const p = this.tp(); if (!p) { this.hold(cam); return; }
    if (orbit) { if (!this.valid) { this.oT = 0; this.oYaw0 = p.yaw + 0.5; } this.oT += dt; this.fYaw = this.oT * 0.2; }
    // behind the kong = the side it looks away from: (sin yaw, cos yaw) is "back" in the game's convention
    const air = p.st === PS.Freefall || p.st === PS.Glide, ride = p.st === PS.Ride;
    // (ORBIT circles in WORLD space from where it started: the kong turning never jerks the slow circle)
    const want = orbit ? this.oYaw0 + this.fYaw : this.chase ? p.yaw : p.yaw + this.fYaw;
    if (!this.valid) this.povYaw = want;
    this.povYaw += wrap(want - this.povYaw) * (orbit ? 1 : damp(this.chase ? 3.2 : 30, dt));
    const yaw = (this.chase && !orbit ? this.povYaw : want) + this.dodgeY;
    if (!this.chase && !orbit) this.povYaw = want;
    const pitch = Math.max(-1.3, (orbit ? -0.26 - 0.08 * Math.sin(this.oT * 0.37) : air ? Math.min(this.fPitch, -0.45) : this.fPitch) + this.dodgeP);
    const dist = (orbit ? Math.max(this.fDist, 8) : this.fDist) * (air ? 1.8 : ride ? 1.6 : 1);
    const cy = Math.cos(pitch), headY = p.y + (p.st === PS.Ground && p.vx * p.vx + p.vz * p.vz < 0.01 ? 1.5 : 1.45);
    const sh = orbit || air ? 0 : 0.55;                                       // over the right shoulder
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    V.set(p.x + Math.sin(yaw) * cy * dist + rx * sh, headY - Math.sin(pitch) * dist + 0.25, p.z + Math.cos(yaw) * cy * dist + rz * sh);
    const g = this.engine.terrain.height(V.x, V.z) + 0.5; if (V.y < g) V.y = g;
    // never behind a wall: cast from the head, pull in at once, ease back out
    const want3 = Math.hypot(V.x - p.x, V.y - headY, V.z - p.z);
    const free = camCast(this.world, p.x, headY, p.z, V.x, V.y, V.z, 0.3), u = want3 > 1e-3 ? Math.min(1, Math.max(0.12, free / want3)) : 1;
    // backed against a wall, the plain pull-in parks the camera inside the kong (a dithered body
    // filling the frame). Whiskers: when less than half the arm is free, try the arm swung round (±30°/60°/95°) and
    // raised over the head; ease toward the freest one, and back to centre once the wall is gone.
    let wantY = 0, wantP = 0;
    if (u < 0.5 && !orbit) {
      let best = u + 0.12;
      for (const [oy, op] of WHISKERS) {
        const y2 = yaw - this.dodgeY + oy, p2 = Math.max(-1.3, pitch - this.dodgeP + op), c2 = Math.cos(p2);
        const tx = p.x + Math.sin(y2) * c2 * dist, ty = headY - Math.sin(p2) * dist + 0.25, tz = p.z + Math.cos(y2) * c2 * dist;
        const L = Math.hypot(tx - p.x, ty - headY, tz - p.z), f2 = L > 1e-3 ? camCast(this.world, p.x, headY, p.z, tx, ty, tz, 0.3) / L : 1;
        if (f2 > best) { best = f2; wantY = oy; wantP = op; }
      }
    }
    this.dodgeY += (wantY - this.dodgeY) * damp(u < 0.5 ? 5 : 1.5, dt); this.dodgeP += (wantP - this.dodgeP) * damp(u < 0.5 ? 5 : 1.5, dt);
    this.specFree = u < this.specFree ? u : this.specFree + (u - this.specFree) * damp(4, dt);
    V.set(p.x + (V.x - p.x) * this.specFree, headY + (V.y - headY) * this.specFree, p.z + (V.z - p.z) * this.specFree);
    V2.set(p.x + rx * sh * 0.6, headY, p.z + rz * sh * 0.6);
    if (!this.valid) { this.pos.copy(V); this.look.copy(V2); this.valid = true; }
    else { this.pos.lerp(V, this.specFree < 0.999 ? 1 : damp(14, dt)); this.look.lerp(V2, damp(20, dt)); }
    cam.position.copy(this.pos); cam.lookAt(this.look);
  }

  /** follow-cam wall dodge (whiskers): the yaw / pitch offsets eased in while the arm is blocked */
  private dodgeY = 0; private dodgeP = 0;

  private pov(dt: number, cam: THREE.PerspectiveCamera) {
    const p = this.tp(); if (!p) { this.hold(cam); return; }
    const eye = p.st === PS.Ride ? SEAT_EYE : p.crouch && (p.st === PS.Ground || p.st === PS.Mantle) ? 1.05 : p.st === PS.Freefall || p.st === PS.Glide ? 1.4 : 1.65;
    if (!this.valid) { this.povYaw = p.yaw; this.povPitch = p.pitch; this.valid = true; }
    // remote look arrives at 20 Hz, quantised: a short smoothing keeps flicks crisp but hides the steps
    this.povYaw += wrap(p.yaw - this.povYaw) * damp(28, dt); this.povPitch += (p.pitch - this.povPitch) * damp(28, dt);
    cam.position.set(p.x, p.y + eye, p.z);
    E.set(this.povPitch, this.povYaw, 0, "YXZ"); cam.quaternion.setFromEuler(E);
  }

  /** the players a DRONE / OVERHEAD shot frames */
  private framed(): CPlayer[] {
    const ps = this.state.players, out: CPlayer[] = [];
    const f = this.fight >= 0 ? this.state.fight(this.fight) : null;
    const ids = f ? f.players : this.group.length ? this.group : this.target >= 0 ? [this.target] : [];
    for (const id of ids) { const p = ps[id]; if (p && p.live && (p.alive || ids.length <= 2)) out.push(p); }
    if (!out.length && this.target >= 0 && ps[this.target]?.live) out.push(ps[this.target]);
    return out;
  }

  /** DRONE / OVERHEAD: frame the CORE of the group — kongs within CORE_R of its median point (a sniper 200 m back or a
   *  straggler would otherwise pull the camera up to a satellite view); every squad in the fight keeps at least its
   *  member nearest the action in shot. Side angle: perpendicular to the line between the two biggest squads (both sides
   *  share the screen), on the side nearer the current camera (never a flip), drifting slowly; it re-aims when the fight
   *  turns. Tight fights are framed lower and closer, wide ones higher. A jump of the action (> 140 m) is a cut. */
  private drone(dt: number, cam: THREE.PerspectiveCamera, overhead: boolean) {
    const all = this.framed();
    if (!all.length) { this.hold(cam); return; }
    const xs = all.map((p) => p.x).sort((a, b) => a - b), zs = all.map((p) => p.z).sort((a, b) => a - b);
    const mx = xs[xs.length >> 1], mz = zs[zs.length >> 1];
    const dm = (p: CPlayer) => Math.hypot(p.x - mx, p.z - mz);
    let ps = all.filter((p) => dm(p) < CORE_R);
    if (ps.length < Math.min(2, all.length)) ps = [...all].sort((a, b) => dm(a) - dm(b)).slice(0, 2);
    for (const t of new Set(all.map((p) => p.team))) {
      if (ps.some((p) => p.team === t)) continue;
      const near = all.filter((p) => p.team === t).sort((a, b) => dm(a) - dm(b))[0];
      if (near && dm(near) < CORE_R * 2) ps.push(near);
    }
    let cx = 0, cy = 0, cz = 0;
    for (const p of ps) { cx += p.x; cy += p.y; cz += p.z; }
    cx /= ps.length; cy /= ps.length; cz /= ps.length;
    let r = 0; for (const p of ps) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz, (p.y - cy) * 0.5));
    r = Math.min(Math.max(r, 6), 85) + 5;
    // broadcast side angle
    const byTeam = new Map<number, { x: number; z: number; n: number }>();
    for (const p of ps) { const t = byTeam.get(p.team) ?? { x: 0, z: 0, n: 0 }; t.x += p.x; t.z += p.z; t.n++; byTeam.set(p.team, t); }
    const ts = [...byTeam.values()].sort((a, b) => b.n - a.n);
    let want = this.dAz;
    if (ts.length >= 2) {
      const a = ts[0], b = ts[1], lx = b.x / b.n - a.x / a.n, lz = b.z / b.n - a.z / a.n;
      const side = Math.atan2(lx, lz) + Math.PI / 2;
      // of the two perpendiculars, the one nearer where the camera is now
      want = Math.abs(wrap(side - this.dAz)) <= Math.PI / 2 ? side : side + Math.PI;
    } else if (ps.length === 1 && !this.dAzSet) want = ps[0].yaw + 0.6;
    if (!this.dAzSet) { this.dAz = want; this.dAzSet = true; }
    else if (!this.userAz) { const d = wrap(want - this.dAz); if (Math.abs(d) > 0.45) this.dAz += d * damp(0.35, dt); }
    this.dAz += dt * 0.025;                                                       // a slow drift: the shot breathes
    // fit inside the part of the frame the desk leaves clear (its columns cover ~20 % each side, the card the bottom):
    // ~60 % of the width, ~78 % of the height
    const aspect = cam.aspect || 16 / 9, vf = THREE.MathUtils.degToRad(this.fov) / 2, hf = Math.atan(Math.tan(vf) * aspect);
    const fit = (r / Math.tan(Math.min(Math.atan(Math.tan(vf) * 0.78), Math.atan(Math.tan(hf) * 0.6)))) * 1.04 * this.dZoom;
    const tight = THREE.MathUtils.smoothstep(r, 12, 55);
    const elev = overhead ? 1.5 : this.userAz ? this.dElev : 0.42 + 0.3 * tight;
    const dist = overhead ? Math.min(Math.max(fit, 60), 420) : Math.min(Math.max(fit, 13), 200);
    V.set(cx + Math.sin(this.dAz) * Math.cos(elev) * dist, cy + 1 + Math.sin(elev) * dist, cz + Math.cos(this.dAz) * Math.cos(elev) * dist);
    const g = Math.max(this.engine.terrain.height(V.x, V.z), 0) + 6; if (V.y < g) V.y = g;
    // aim a little below the group: it sits just above the frame's centre, clear of the bottom card
    V2.set(cx, cy + 1 - (overhead ? 0 : r * 0.12), cz);
    this.lastFrame = { ids: ps.map((p) => p.id), all: all.length, cx, cz, r, dist };
    if (!this.valid || this.look.distanceTo(V2) > 140) { this.pos.copy(V); this.look.copy(V2); this.valid = true; }
    else { this.pos.lerp(V, damp(2.6, dt)); this.look.lerp(V2, damp(4, dt)); }
    cam.position.copy(this.pos);
    if (overhead) { cam.up.set(0, 0, -1); cam.lookAt(this.look); cam.up.copy(UP); } else cam.lookAt(this.look);
  }

  /** FREE: fly with eased starts / stops (WASD, Q / E down / up; Shift ×4, Ctrl ×¼; wheel = speed) */
  private free(dt: number, cam: THREE.PerspectiveCamera) {
    const k = this.keys, mul = k.has("ShiftLeft") || k.has("ShiftRight") ? 4 : k.has("ControlLeft") || k.has("ControlRight") ? 0.25 : 1;
    E.set(this.freePitch, this.freeYaw, 0, "YXZ"); cam.quaternion.setFromEuler(E);
    V.set((k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0), (k.has("KeyE") ? 1 : 0) - (k.has("KeyQ") ? 1 : 0), (k.has("KeyS") ? 1 : 0) - (k.has("KeyW") ? 1 : 0));
    if (V.lengthSq()) { this.touchedAt = performance.now() / 1000; V.normalize().multiplyScalar(this.freeSpeed * mul).applyQuaternion(cam.quaternion); }
    this.freeV.lerp(V, damp(V.lengthSq() ? 6 : 9, dt));
    cam.position.addScaledVector(this.freeV, dt);
    const g = this.engine.terrain.height(cam.position.x, cam.position.z) + 0.5; if (cam.position.y < g) cam.position.y = g;
    this.pos.copy(cam.position); this.valid = true;
  }

  /** the kill-cam beat: over the fallen kong's body, looking at its killer (lens narrowed by the distance, a slow push
   *  in). Returns false once it is over (the waiting shot / a follow on the killer takes the frame). */
  private killCamApply(dt: number, cam: THREE.PerspectiveCamera): boolean {
    const kc = this.killCam!, k = this.state.players[kc.killer];
    kc.t += dt;
    if (kc.t > this.killCamS || !k || !k.live) {
      this.killCam = null; this.fov = 70; this.valid = false;
      const next = this.pending; this.pending = null;
      if (next) this.set(next.shot, next.glide);
      else if (k && k.live && k.alive) this.set({ mode: this.mode === "pov" ? "pov" : "follow", target: kc.killer, fight: -1, group: [] });
      return false;
    }
    const hx = kc.x, hy = kc.y + 1.2, hz = kc.z;
    if (kc.t <= dt * 1.5) this.kcLook.set(k.x, k.y + 1.45, k.z); else this.kcLook.lerp(V2.set(k.x, k.y + 1.45, k.z), damp(6, dt));
    const dx = this.kcLook.x - hx, dz = this.kcLook.z - hz, d = Math.max(1, Math.hypot(dx, dz)), ux = dx / d, uz = dz / d;
    // behind the body (away from the killer) and up, a little to the side
    V.set(hx - ux * 3.2 + uz * 1.1, hy + 1.6, hz - uz * 3.2 - ux * 1.1);
    const gr = this.engine.terrain.height(V.x, V.z) + 0.6; if (V.y < gr) V.y = gr;
    const free = camCast(this.world, hx, hy + 0.3, hz, V.x, V.y, V.z, 0.3), want = Math.hypot(V.x - hx, V.y - hy - 0.3, V.z - hz);
    if (want > 1e-3 && free < want) { const u = Math.max(0.2, free / want); V.set(hx + (V.x - hx) * u, hy + 0.3 + (V.y - hy - 0.3) * u, hz + (V.z - hz) * u); }
    cam.position.copy(V); cam.lookAt(this.kcLook);
    // a far killer gets a long lens (it fills a few % of the frame height at least), then a slow push in
    const lens = THREE.MathUtils.radToDeg(2 * Math.atan(5 / Math.max(5, d)));
    this.fov = Math.max(14, Math.min(62, lens)) * (1 - 0.12 * Math.min(1, kc.t / this.killCamS));
    return true;
  }

  /** nothing to look at: keep the last pose */
  private hold(cam: THREE.PerspectiveCamera) { if (this.valid) cam.position.copy(this.pos); }
}

function isTyping(e: KeyboardEvent) { const t = e.target as HTMLElement | null; return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
