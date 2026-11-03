// Several commentators on one match. Every seat streams its camera (castcam: the shot — mode, kong, fight, group — plus
// the free camera's pose) to the others, so each seat sees what the rest are watching and can MIRROR one.
//   PRODUCER — the lobby's owner seat (★). TAKE puts a seat's camera ON AIR (server "castprog"): every PROGRAM window
//              (?cast=CODE&program — the clean OBS output) then mirrors that seat live, and every seat sees the tally.
//              Nothing taken yet = the producer's own camera is on air.
//   PING     — any seat offers its current shot to the others ("look at this!"): a card on their desks, GO cuts there.
// A PROGRAM window whose on-air seat goes quiet (no castcam for 5 s: it left, it crashed) falls back to its own autopilot
// until the seat speaks again — the output never freezes on a dead camera.
import type { Link } from "../game/net";
import type { CasterRig, CamShot } from "./rig";
import { CAM_LABEL } from "./rig";
import type { CasterState } from "./state";
import type { CasterDesk, SeatInfo } from "./desk";

export interface SeatCam extends CamShot { auto?: boolean; /** FREE: [x, y, z, yaw, pitch] */ pose?: number[] }
export interface LobbyCaster { id: number; name: string; seat: number; host: boolean; program?: boolean }
export interface SeatsHost {
  link(): Link | null; rig(): CasterRig | null; state(): CasterState | null; desk(): CasterDesk | null;
  mySeat(): number; casters(): LobbyCaster[]; myUid(): number;
  setAuto(on: boolean): void; autoOn(): boolean;
}

const STALE_MS = 5000;

export class Seats {
  readonly cams = new Map<number, { name: string; cam: SeatCam; at: number }>();
  /** the seat this one mirrors by choice (−1 = its own camera) */
  follow = -1;
  /** the seat on air (the server's word; −1 = the producer's) */
  onAir = -1;
  private lastSent = ""; private lastAt = 0;
  private fallback = false;
  /** the last ping offered to this seat */
  private ping: { seat: number; name: string; cam: SeatCam; note: string; at: number } | null = null;

  constructor(private readonly h: SeatsHost, readonly program: boolean) {}

  /** the producer seat (the lobby's owner, never a PROGRAM window) */
  producerSeat(): number { return this.h.casters().find((c) => c.host && !c.program)?.seat ?? -1; }
  isProducer(): boolean { const me = this.h.casters().find((c) => c.seat === this.h.mySeat()); return !!me && me.host && !me.program; }
  /** the seat whose camera is on air right now */
  airSeat(): number { return this.onAir >= 0 ? this.onAir : this.producerSeat(); }
  /** the seat whose camera THIS window shows (−1 = its own) */
  mirroring(): number { return this.program ? this.airSeat() : this.follow; }

  onLobby(l: { onAir?: number }) { this.onAir = typeof l.onAir === "number" ? l.onAir : -1; }
  onCastcam(m: Record<string, unknown>) {
    const seat = m.seat as number, cam = m.cam as SeatCam;
    if (!cam || typeof cam.mode !== "string") return;
    this.cams.set(seat, { name: String(m.name ?? ""), cam, at: performance.now() });
    if (seat === this.mirroring()) this.apply(cam);
  }
  onProg(m: Record<string, unknown>) {
    this.onAir = m.seat as number;
    const me = this.h.mySeat(), d = this.h.desk();
    if (this.program) { const c = this.cams.get(this.onAir); if (c) this.apply(c.cam, true); return; }
    d?.toast(this.onAir === me ? "YOU ARE ON AIR" : `SEAT ${this.onAir + 1} IS ON AIR`);
  }
  onPing(m: Record<string, unknown>) {
    if (this.program) return;
    const cam = m.cam as SeatCam; if (!cam || typeof cam.mode !== "string") return;
    this.ping = { seat: m.seat as number, name: String(m.name ?? ""), cam, note: String(m.note ?? ""), at: performance.now() };
    this.h.desk()?.showPing(`SEAT ${this.ping.seat + 1} · ${this.ping.name}`, this.describe(cam), () => this.accept());
  }

  /** PRODUCER: put `seat` on air */
  take(seat: number) {
    if (!this.isProducer()) { this.h.desk()?.toast("ONLY THE PRODUCER (★) CAN TAKE A CAMERA"); return; }
    this.h.link()?.sendJSON({ t: "castprog", seat });
  }
  /** offer my shot to the other seats */
  sendPing(note = "") {
    const rig = this.h.rig(); if (!rig) return;
    this.h.link()?.sendJSON({ t: "castping", cam: this.myCam(), note });
    this.h.desk()?.toast("PINGED THE OTHER SEATS");
  }
  /** cut to the last ping */
  accept() {
    const p = this.ping; if (!p) return;
    this.follow = -1; this.h.setAuto(false); this.apply(p.cam, true);
    this.ping = null; this.h.desk()?.hidePing();
  }
  /** mirror another seat (again = back to my own camera) */
  toggleFollow(seat: number) {
    if (seat === this.h.mySeat()) return;
    this.follow = this.follow === seat ? -1 : seat;
    const d = this.h.desk();
    if (this.follow >= 0) { this.h.setAuto(false); const sc = this.cams.get(seat); if (sc) this.apply(sc.cam, true); d?.toast(`MIRRORING SEAT ${seat + 1}`); }
    else d?.toast("YOUR OWN CAMERA");
  }

  private myCam(): SeatCam {
    const r = this.h.rig()!, s = r.shot();
    const cam: SeatCam = { mode: s.mode, target: s.target, fight: s.fight, group: s.group.slice(0, 12), auto: this.h.autoOn() };
    if (s.mode === "free") cam.pose = r.freePose();
    return cam;
  }
  private apply(cam: SeatCam, glide = false) {
    const r = this.h.rig(); if (!r) return;
    r.set({ mode: cam.mode, target: cam.target | 0, fight: cam.fight | 0, group: Array.isArray(cam.group) ? cam.group.slice(0, 50) : [] }, glide);
  }

  /** every frame: stream my camera, keep a mirror's free camera gliding, PROGRAM's fallback autopilot */
  update(dt: number) {
    const link = this.h.link(), rig = this.h.rig();
    if (!rig) return;
    const src = this.mirroring();
    if (src >= 0) {
      const c = this.cams.get(src);
      const stale = !c || performance.now() - c.at > STALE_MS;
      if (this.program) {
        // a quiet on-air seat: the PROGRAM keeps itself alive on its own autopilot until the seat speaks again
        if (stale && !this.fallback) { this.fallback = true; this.h.setAuto(true); }
        else if (!stale && this.fallback) { this.fallback = false; this.h.setAuto(false); this.apply(c!.cam, true); }
      }
      if (!stale && c!.cam.mode === "free" && c!.cam.pose && rig.mode === "free") rig.mirrorFree(c!.cam.pose, dt);
    } else if (this.program && !this.fallback) { this.fallback = true; this.h.setAuto(true); }
    if (this.ping && performance.now() - this.ping.at > 12000) { this.ping = null; this.h.desk()?.hidePing(); }
    // stream mine (not from a PROGRAM window: it only watches)
    if (this.program || !link || link.offline || this.h.mySeat() < 0) return;
    const cam = this.myCam(), j = JSON.stringify(cam), now = performance.now();
    const moving = cam.mode === "free";
    if (j === this.lastSent && now - this.lastAt < 2000) return;
    if (now - this.lastAt < (moving ? 110 : 120)) return;
    this.lastSent = j; this.lastAt = now; link.sendJSON({ t: "castcam", cam });
  }

  /** the desk's seat strip */
  infos(): SeatInfo[] {
    const me = this.h.mySeat(), air = this.airSeat(), rig = this.h.rig();
    return this.h.casters().map((c) => {
      const mine = c.seat === me, cam = mine ? (rig ? rig.shot() : undefined) : this.cams.get(c.seat)?.cam;
      return { seat: c.seat, name: c.name, me: mine, following: this.follow === c.seat, watching: cam ? this.describe(cam) : "", onAir: !c.program && c.seat === air, program: !!c.program, producer: c.host && !c.program, auto: mine ? this.h.autoOn() : !!(cam as SeatCam | undefined)?.auto };
    }).sort((a, b) => a.seat - b.seat);
  }
  describe(s: CamShot): string {
    const st = this.h.state(); if (!st) return CAM_LABEL[s.mode];
    const f = s.fight >= 0 ? st.fight(s.fight) : null;
    if (f) return `${CAM_LABEL[s.mode]} · FIGHT AT ${f.where}`;
    const p = s.target >= 0 ? st.players[s.target] : null;
    return `${CAM_LABEL[s.mode]}${p ? ` · ${p.name}` : ""}`;
  }
}
