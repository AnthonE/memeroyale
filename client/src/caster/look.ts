// What the caster seat lays over the world so a viewer always knows who is who:
//   OUTLINES — every kong outlined in its squad's colour (actors/kong.ts kongOutlines: an inverted-hull pass on the
//              instanced kongs, a constant pixel width, nothing for the player game), on by default
//   X-RAY (X)— the same kongs as translucent team-coloured silhouettes wherever a wall / tree / hill hides them
//   PLATES (N)— a name + team chip + health / shield over each kong near the camera (or in the watched fight); in DRONE /
//              OVERHEAD shots every kong in view gets a team chevron instead, and a team ring on the ground
//   POV HANDS— in POV the watched kong's own gun in view (the game's first-person viewmodel, driven by its held byte,
//              its shots and its reload bit)
//   DAMAGE   — floating numbers over whoever the watched kong hits
// Drawn after GameRender.update (the camera is final): DOM plates are placed with the frame's own projection.
import * as THREE from "three";
import type { Engine } from "../engine/engine";
import type { Kits } from "../game/render";
import type { ClientMatch, Remote } from "../game/client";
import type { KongActor } from "../actors/api";
import { kongOutlines, type KongActorEx, type KongOutlines } from "../actors/kong";
import type { ViewModelMotion } from "../weapons/api";
import { PS, SK, consumableId, weaponId, rarityOf } from "../../../shared/sim/player";
import { mythicOf } from "../../../shared/sim/mythic";
import { WEAPON_DEFS } from "../../../shared/sim/const";
import { WEAPONS } from "../../../shared/world/map";
import { UI } from "../ui/styles";
import type { CasterRig } from "./rig";
import type { CasterState, CPlayer } from "./state";
import { teamLook } from "./teams";

const vh = (px: number) => `${(px / 10.8).toFixed(3)}vh`;
const CSS = `
.kc-plates { position: fixed; inset: 0; pointer-events: none; z-index: 11; overflow: hidden; font-family: ${UI.cond}; }
.kc-plate { position: absolute; left: 0; top: 0; transform-origin: 50% 100%; display: flex; flex-direction: column; align-items: center; gap: ${vh(2)}; will-change: transform, opacity; white-space: nowrap; }
.kc-plate .nm { font-size: ${vh(17)}; font-weight: 800; letter-spacing: .03em; color: #fff; text-shadow: 0 1px 2px #000, 0 0 ${vh(6)} rgba(0,0,0,.7); display: flex; align-items: center; gap: ${vh(4)}; }
.kc-plate .nm i { display: inline-block; width: ${vh(9)}; height: ${vh(9)}; border-radius: ${vh(2)}; background: var(--tc); box-shadow: 0 0 0 1px rgba(0,0,0,.7); }
.kc-plate .bars { width: ${vh(74)}; display: flex; flex-direction: column; gap: 1px; padding: 1px; background: rgba(0,0,0,.55); border-radius: ${vh(2)}; }
.kc-plate .bars b { display: block; height: ${vh(4)}; border-radius: 1px; }
.kc-plate .bars .h { background: ${UI.hp}; } .kc-plate .bars .s { background: ${UI.shield}; }
.kc-plate.hurt .bars .h { background: #ff4b4b; }
.kc-plate.tgt .nm { color: ${UI.yellow}; }
.kc-plate.killer .nm { color: #ff6a4a; font-size: ${vh(22)}; }
.kc-plate.killer .nm em { font-style: normal; color: #fff; font-size: ${vh(14)}; letter-spacing: .12em; margin-left: ${vh(4)}; }
.kc-plate .chev { width: 0; height: 0; border-left: ${vh(8)} solid transparent; border-right: ${vh(8)} solid transparent; border-top: ${vh(11)} solid var(--tc); filter: drop-shadow(0 1px 1px #000); }
.kc-plate.mark .bars { display: none; } .kc-plate.mark .nm { font-size: ${vh(13)}; } .kc-plate.mark .nm i { display: none; }
.kc-plate.mark.quiet .nm { display: none; }
.kc-plate:not(.mark) .chev { display: none; }
.kc-dmg { position: absolute; left: 0; top: 0; font-family: ${UI.cond}; font-weight: 800; font-size: ${vh(30)}; color: ${UI.yellow}; text-shadow: 0 2px 3px #000, 0 0 ${vh(8)} rgba(0,0,0,.6); will-change: transform, opacity; }
.kc-dmg.head { color: #ff5a3c; font-size: ${vh(36)}; } .kc-dmg.kill { color: #fff; }
`;
let cssOn = false;

const V = new THREE.Vector3(), M4 = new THREE.Matrix4(), C = new THREE.Color();
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const MAX_PLATES = 18, PLATE_FAR = 110, FIGHT_FAR = 260;

interface Plate { el: HTMLElement; nm: HTMLElement; h: HTMLElement; s: HTMLElement; key: string; on: boolean }
interface Dmg { el: HTMLElement; x: number; y: number; z: number; t: number; on: boolean }

export class CasterLook {
  outlines: KongOutlines | null = null;
  /** X-RAY: "auto" = on in the wide shots (DRONE / OVERHEAD / FREE — kongs under roofs and trees stay visible), off over
   *  the shoulder and in POV; "on" = always; "off" = never. X cycles AUTO → ON → OFF. */
  xrayMode: "auto" | "on" | "off" = "auto"; xray = false; plates = true; teamRings = true;
  private readonly layer: HTMLElement;
  private readonly pool: Plate[] = [];
  private readonly dmgs: Dmg[] = [];
  private readonly outlineKey = new WeakMap<object, string>();
  private readonly rings: THREE.InstancedMesh;
  // POV hands
  private vmKey = ""; private lastShot = -1; private wasReload = false; private vmTarget = -1; private lastYaw = 0; private lastPitch = 0;
  private handsOn = false; private readonly motion: ViewModelMotion = { speed: 0, grounded: true, sprint: false, crouch: false, lookDX: 0, lookDY: 0 };

  constructor(private readonly engine: Engine, private readonly kits: Kits, private readonly cm: ClientMatch, private readonly state: CasterState, private readonly rig: CasterRig, parent: HTMLElement) {
    if (!cssOn) { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); cssOn = true; }
    this.layer = document.createElement("div"); this.layer.className = "kc-plates"; parent.appendChild(this.layer);
    void kongOutlines(engine).then((o) => { this.outlines = o; o.set({ outline: true, xray: this.xray }); });
    this.xrayFor();
    // team rings on the ground (drone / overhead): one instanced draw, always on top, sized to stay readable from high up
    const g = new THREE.RingGeometry(0.78, 1, 40); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
    this.rings = new THREE.InstancedMesh(g, m, 50); this.rings.count = 0; this.rings.frustumCulled = false; this.rings.renderOrder = 70; this.rings.name = "caster-team-rings";
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(50 * 3), 3);
    engine.scene.add(this.rings);
    state.listeners.push({ hit: (shooter, victim, dmg, kill, head) => this.onHit(shooter, victim, dmg, kill, head) });
  }
  dispose() {
    this.layer.remove(); this.rings.removeFromParent(); this.rings.geometry.dispose(); (this.rings.material as THREE.Material).dispose();
    // (pooled kongs keep their outline colour into the next match: the passes go dark until a seat turns them on again)
    this.outlines?.set({ outline: false, xray: false });
    this.kits.viewModel.object.visible = false;
  }
  setXray(on: boolean) { this.xrayMode = on ? "on" : "off"; this.xrayFor(); }
  /** X: AUTO → ON → OFF → AUTO; returns the toast */
  cycleXray(): string {
    this.xrayMode = this.xrayMode === "auto" ? "on" : this.xrayMode === "on" ? "off" : "auto"; this.xrayFor();
    return this.xrayMode === "auto" ? "X-RAY AUTO — through walls in the wide shots" : this.xrayMode === "on" ? "X-RAY ON — every kong through walls" : "X-RAY OFF";
  }
  /** the x-ray pass follows the mode (and, in AUTO, the camera) */
  private xrayFor() {
    const m = this.rig.mode, on = this.xrayMode === "on" || (this.xrayMode === "auto" && (m === "drone" || m === "overhead" || m === "free"));
    if (on !== this.xray || !this.outlines) { this.xray = on; this.outlines?.set({ xray: on }); }
  }
  setPlates(on: boolean) { this.plates = on; if (!on) for (const p of this.pool) this.hide(p); }

  /** GameRender's per-kong hook: team outline (dead bodies get none), a faint team rim, the POV kong hidden */
  actor(r: Remote, actor: KongActor) {
    const look = teamLook(r.team), dead = r.st === PS.Dead || r.st === PS.Spectate;
    const key = dead ? "dead" : look.color;
    if (this.outlineKey.get(actor) !== key) {
      this.outlineKey.set(actor, key);
      const a = actor as KongActorEx;
      a.setOutline?.(dead ? null : C.set(look.color).multiplyScalar(1.15));
      a.setLook?.({ rim: look.color, rimStrength: dead ? 0 : 0.16 });
    }
    if (this.rig.mode === "pov" && r.id === this.rig.target) actor.setVisible(false);
  }

  /** GameRender's viewmodel hook: the motion to animate the POV hands with, or null (hands hidden) */
  hands(): ViewModelMotion | null { return this.handsOn ? this.motion : null; }

  // ---------------------------------------------------------------- per frame (after GameRender.update)
  update(dt: number) {
    this.xrayFor();
    this.povHands(dt);
    this.drawPlates();
    this.drawRings();
    this.drawDamage(dt);
  }

  private povHands(dt: number) {
    const vm = this.kits.viewModel, rig = this.rig;
    const r = rig.mode === "pov" && rig.target >= 0 ? this.cm.remotes[rig.target] : null;
    const p = r ? this.state.players[r.id] : null;
    const on = !!r && !!p && p.live && p.alive && r.st !== PS.Ride && r.st !== PS.Plane && r.held !== 0xff;
    if (!on) { if (this.handsOn) { this.handsOn = false; vm.cancelReload?.(); } this.vmTarget = -1; return; }
    const first = this.vmTarget !== r!.id;
    if (first) { this.vmTarget = r!.id; this.lastShot = p!.lastShotAt; this.wasReload = false; this.vmKey = ""; this.lastYaw = r!.yaw; this.lastPitch = r!.pitch; }
    // the gun: the held byte (+ the exact rarity / mythic from CastStats when it agrees)
    const held = r!.held, sl = p!.stat ? p!.stat.slots[p!.stat.active] : null;
    let key = String(held);
    if (held < 0x80) {
      const id = held & 7, tier = (held >> 3) & 7, rar = sl && sl.kind === SK.Weapon && sl.id === id ? sl.rarity : tier;
      key = `w${id}:${rar}`;
      if (key !== this.vmKey) vm.equip(weaponId(id), rarityOf(Math.min(5, rar)), mythicOf(rar)?.color ?? null);
    } else { key = `c${held & 0x7f}`; if (key !== this.vmKey) vm.equip(consumableId(held & 0x7f)); }
    if (key !== this.vmKey) { this.vmKey = key; this.lastShot = p!.lastShotAt; this.wasReload = false; }
    // its shots (a shotgun's pellets arrive together: one kick per frame) and its reload
    if (p!.lastShotAt > this.lastShot) { this.lastShot = p!.lastShotAt; if (!first) vm.fire(); }
    const reloading = (r!.anim & 1) !== 0;
    if (reloading && !this.wasReload && held < 0x80) { const w = WEAPONS[held & 7]; vm.reload(w ? WEAPON_DEFS[w].reloadS : 2); }
    else if (!reloading && this.wasReload) vm.cancelReload?.();
    this.wasReload = reloading;
    // motion: its speed, ground, stance, and how fast its look turns (the sway)
    let dy = r!.yaw - this.lastYaw; if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
    const m = this.motion; m.speed = Math.hypot(r!.vx, r!.vz); m.grounded = r!.grounded || r!.st === PS.Ground && Math.abs(r!.vy) < 0.5; m.sprint = r!.sprint; m.crouch = r!.crouch;
    m.lookDX = -dy * 180; m.lookDY = -(r!.pitch - this.lastPitch) * 180;
    this.lastYaw = r!.yaw; this.lastPitch = r!.pitch;
    this.handsOn = true;
    void dt;
  }

  private plate(i: number): Plate {
    let p = this.pool[i];
    if (!p) {
      const el = document.createElement("div"); el.className = "kc-plate";
      el.innerHTML = `<div class="nm"><i></i><span></span></div><div class="bars"><b class="h"></b><b class="s"></b></div><div class="chev"></div>`;
      p = { el, nm: el.querySelector(".nm span")!, h: el.querySelector(".bars .h")!, s: el.querySelector(".bars .s")!, key: "", on: false };
      el.style.display = "none"; this.layer.appendChild(el); this.pool[i] = p;
    }
    return p;
  }
  private hide(p: Plate) { if (p.on) { p.on = false; p.el.style.display = "none"; } }

  private drawPlates() {
    const cam = this.engine.camera, s = this.state, rig = this.rig;
    let used = 0;
    if (this.plates) {
      cam.updateMatrixWorld(); M4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      const W = innerWidth, H = innerHeight, wide = rig.mode === "drone" || rig.mode === "overhead";
      const f = rig.fight >= 0 ? s.fight(rig.fight) : null;
      const now = performance.now() / 1000;
      // candidates: alive kongs in front of the camera, nearest first; the watched fight's kongs reach further
      const cands: Array<[CPlayer, number, number, number]> = [];
      for (const p of s.players) {
        if (!p.live || !p.alive || p.inPlane || p.st === PS.Plane) continue;
        if (rig.mode === "pov" && p.id === rig.target) continue;
        const d = Math.hypot(p.x - cam.position.x, p.y - cam.position.y, p.z - cam.position.z);
        const inFight = !!f && f.players.includes(p.id);
        if (!wide && d > (inFight || p.id === rig.target || rig.killCam?.killer === p.id ? (rig.killCam?.killer === p.id ? 600 : FIGHT_FAR) : PLATE_FAR)) continue;
        V.set(p.x, p.y + (p.crouch ? 1.75 : 2.3), p.z).applyMatrix4(M4);
        if (V.z > 1 || V.z < -1 || Math.abs(V.x) > 1.1 || Math.abs(V.y) > 1.1) continue;
        cands.push([p, d, (V.x * 0.5 + 0.5) * W, (-V.y * 0.5 + 0.5) * H]);
      }
      const kk = rig.killCam?.killer ?? -1;
      cands.sort((a, b) => (b[0].id === kk ? 1 : 0) - (a[0].id === kk ? 1 : 0) || a[1] - b[1]);
      const cap = wide ? 50 : MAX_PLATES;
      for (const [p, d, x, y] of cands) {
        if (used >= cap) break;
        const pl = this.plate(used++);
        const look = teamLook(p.team), inFight = !!f && f.players.includes(p.id);
        // the kill-cam's killer: a full plate, flagged with whom it just eliminated
        const kc = rig.killCam, killer = !!kc && kc.killer === p.id;
        // far / wide: a chevron (the fight's kongs and the watched one keep their names)
        const mark = !killer && (wide || d > 70);
        // (a wide shot names only who it frames: the fight's kongs / the hand-picked group / the watched one)
        const framed = inFight || p.id === rig.target || (!f && rig.group.includes(p.id));
        const quiet = mark && !framed;
        const key = `${p.name}|${look.color}|${mark ? 1 : 0}|${quiet ? 1 : 0}|${p.id === rig.target ? 1 : 0}|${killer ? kc!.victim : -1}`;
        if (key !== pl.key) {
          pl.key = key; pl.el.style.setProperty("--tc", look.color);
          if (killer) pl.nm.innerHTML = `${esc(p.name)}<em>✕ ${esc(s.players[kc!.victim]?.name ?? "")}</em>`; else pl.nm.textContent = p.name;
          pl.el.classList.toggle("mark", mark); pl.el.classList.toggle("quiet", quiet); pl.el.classList.toggle("tgt", p.id === rig.target); pl.el.classList.toggle("killer", killer);
        }
        if (!mark) { pl.h.style.width = `${Math.max(0, Math.min(100, p.hp))}%`; pl.s.style.width = `${Math.max(0, Math.min(100, p.shield))}%`; pl.s.style.display = p.shield > 0.5 ? "" : "none"; pl.el.classList.toggle("hurt", now - p.lastHurtAt < 0.6); }
        const k = mark ? 1 : Math.max(0.62, Math.min(1.05, 1.15 - d / 120));
        const a = mark ? 1 : Math.max(0.35, Math.min(1, 1.4 - d / PLATE_FAR));
        pl.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(3)})`;
        pl.el.style.opacity = a.toFixed(2);
        if (!pl.on) { pl.on = true; pl.el.style.display = ""; }
      }
    }
    for (let i = used; i < this.pool.length; i++) this.hide(this.pool[i]);
  }

  private drawRings() {
    const rig = this.rig, cam = this.engine.camera;
    const on = this.teamRings && (rig.mode === "drone" || rig.mode === "overhead" || rig.mode === "free");
    if (!on) { this.rings.count = 0; this.rings.visible = false; return; }
    let n = 0;
    for (const p of this.state.players) {
      if (n >= 50 || !p.live || !p.alive || p.inPlane || p.st === PS.Plane || p.st === PS.Freefall || p.st === PS.Glide) continue;
      const d = Math.hypot(p.x - cam.position.x, p.y - cam.position.y, p.z - cam.position.z);
      if (d < 18) continue;
      const r = Math.max(1.1, d * 0.014);
      M4.makeScale(r, 1, r).setPosition(p.x, p.y + 0.08, p.z);
      this.rings.setMatrixAt(n, M4); this.rings.setColorAt(n, C.set(teamLook(p.team).color));
      n++;
    }
    this.rings.count = n; this.rings.visible = n > 0;
    this.rings.instanceMatrix.needsUpdate = true; if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- damage numbers (the watched kong's hits)
  private onHit(shooter: number, victim: number, dmg: number, kill: boolean, head: boolean) {
    const rig = this.rig;
    if (shooter !== rig.target || shooter === victim || dmg <= 0) return;
    if (rig.mode !== "follow" && rig.mode !== "pov" && rig.mode !== "orbit") return;
    const v = this.state.players[victim]; if (!v) return;
    let d = this.dmgs.find((x) => !x.on);
    if (!d) { if (this.dmgs.length >= 16) return; const el = document.createElement("div"); el.className = "kc-dmg"; this.layer.appendChild(el); d = { el, x: 0, y: 0, z: 0, t: 0, on: false }; this.dmgs.push(d); }
    d.on = true; d.t = 0; d.x = v.x + (Math.random() - 0.5) * 0.6; d.y = v.y + 1.9 + Math.random() * 0.3; d.z = v.z + (Math.random() - 0.5) * 0.6;
    d.el.textContent = kill ? `✕ ${Math.round(dmg)}` : String(Math.round(dmg));
    d.el.className = `kc-dmg${head ? " head" : ""}${kill ? " kill" : ""}`; d.el.style.display = "";
  }
  private drawDamage(dt: number) {
    if (!this.dmgs.some((d) => d.on)) return;
    const cam = this.engine.camera; M4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    for (const d of this.dmgs) {
      if (!d.on) continue;
      d.t += dt; if (d.t > 0.95) { d.on = false; d.el.style.display = "none"; continue; }
      V.set(d.x, d.y + d.t * 0.9, d.z).applyMatrix4(M4);
      if (V.z > 1) { d.el.style.display = "none"; continue; }
      const x = (V.x * 0.5 + 0.5) * innerWidth, y = (-V.y * 0.5 + 0.5) * innerHeight, k = d.t < 0.12 ? 0.7 + d.t * 4 : 1.18 - d.t * 0.3;
      d.el.style.display = ""; d.el.style.opacity = String(Math.min(1, (0.95 - d.t) * 3));
      d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${k.toFixed(3)})`;
    }
  }
}
