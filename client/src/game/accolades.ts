// WHAT A KILL OF
// MINE EARNS — decided on the client from what it already has, no wire change: the kill event's cause (a gun, KILL_TUK,
// KILL_HELI, KILL_GUN, KILL_BOMB), my own seat / vehicle / its speed when it arrives, the lethal hit just before it (its
// zone, where it landed → how far), the last kong that knocked me out, my kill streak. The medals: ui/medals.ts.
//
//   ROADKILL     run over by the tuk-tuk I drive (KILL_TUK at its bars)
//   DRIVE-BY     a gun kill from a tuk-tuk's bench while it moves (≥ 3 m/s) · FLY-BY: from a helicopter's passenger seat
//   CHOPPED      KILL_HELI while I fly it (its rotor — or its body — got them)
//   TOP BANANA   the door minigun (KILL_GUN)
//   WRECKED      a tuk-tuk / helicopter I destroyed took them with it (KILL_TUK / KILL_HELI, not at its controls)
//   BANANA SPLIT my banana bomb (KILL_BOMB)
//   HEADSHOT     the lethal hit was to the head · LONG SHOT: a gun kill from 90 m+
//   PAYBACK      the last kong that knocked me out
//   DOUBLE / TRIPLE / QUAD KILL, RAMPAGE   kills within 6 s of the one before
import { PS } from "../../../shared/sim/player";
import { VF, VKind } from "../../../shared/sim/vehicle";
import { KILL_BOMB, KILL_GUN, KILL_HELI, KILL_TUK } from "../../../shared/net/proto";
import type { AccoladeId } from "../ui/api";
import type { ClientMatch } from "./client";

const LONG_SHOT_M = 90, CHAIN_MS = 6000, DRIVE_BY_V = 3;
/** the kill event follows its lethal hit in the same tick's events: a hit this old (ms) is not it */
const LETHAL_MS = 1500;
/** the big medal sound: vehicle medals and multi-kills */
export const BIG: ReadonlySet<AccoladeId> = new Set<AccoladeId>(["roadkill", "chopped", "topbanana", "wrecked", "driveby", "flyby", "double", "triple", "quad", "rampage"]);

export class AccoladeTracker {
  /** my lethal hits waiting for their kill: victim, when, zone (1 = head), how far (m) */
  private readonly lethal: Array<{ victim: number; at: number; zone: number; dist: number }> = [];
  private chain = 0; private chainAt = -1e9; private chainT0 = 0;
  private nemesis = -1;
  reset() { this.lethal.length = 0; this.chain = 0; this.chainAt = -1e9; this.nemesis = -1; }
  /** my hit that took `victim` down: zone, the hit point, my eye */
  hit(victim: number, zone: number, x: number, y: number, z: number, ex: number, ey: number, ez: number, now: number) {
    if (this.lethal.length >= 8) this.lethal.shift();
    this.lethal.push({ victim, at: now, zone, dist: Math.hypot(x - ex, y - ey, z - ez) });
  }
  /** a kong knocked ME out: getting them back is PAYBACK */
  died(killer: number) { this.nemesis = killer; }
  /** my kill of `victim` by `cause` (a gun 0-5 — a mythic decoded to its gun — or a KILL_* code) → its medals, the vehicle
   *  / weapon ones first, then head / range / payback, the streak last */
  kill(cm: ClientMatch, victim: number, cause: number, now: number, victimName: string, out: Array<{ id: AccoladeId; sub: string }>) {
    out.length = 0;
    const p = cm.pred, v = p.st === PS.Ride ? cm.myVehicle() : null, gun = cause < 6;
    let L: { zone: number; dist: number } | null = null;
    for (let i = this.lethal.length - 1; i >= 0; i--) { const q = this.lethal[i]; if (q.victim === victim && now - q.at < LETHAL_MS) { L = q; this.lethal.splice(i, 1); break; } }
    if (cause === KILL_TUK && v && v.kind === VKind.Tuk && p.seat === 0) out.push({ id: "roadkill", sub: `RAN OVER ${victimName}` });
    else if (cause === KILL_HELI && v && v.kind === VKind.Heli && p.seat === 0) out.push({ id: "chopped", sub: "CUT DOWN BY YOUR ROTOR" });
    else if (cause === KILL_TUK || cause === KILL_HELI) out.push({ id: "wrecked", sub: "BLEW UP THEIR RIDE" });
    else if (cause === KILL_GUN) out.push({ id: "topbanana", sub: "DOOR-GUN KILL" });
    else if (cause === KILL_BOMB) out.push({ id: "bananasplit", sub: "BANANA BOMB KILL" });
    else if (gun && v && p.seat !== 0) {
      if (v.kind === VKind.Tuk && Math.abs(v.vf) >= DRIVE_BY_V) out.push({ id: "driveby", sub: "FROM A MOVING TUK-TUK" });
      else if (v.kind === VKind.Heli && ((v.flags & VF.AIR) !== 0 || Math.abs(v.vf) >= DRIVE_BY_V)) out.push({ id: "flyby", sub: "FROM KONG AIR" });
    }
    if (gun && L && L.zone === 1) out.push({ id: "headshot", sub: "RIGHT BETWEEN THE EARS" });
    if (gun && L && L.dist >= LONG_SHOT_M) out.push({ id: "longshot", sub: `${Math.round(L.dist)} M` });
    if (victim === this.nemesis) { this.nemesis = -1; out.push({ id: "payback", sub: "GOT YOUR KILLER" }); }
    if (now - this.chainAt <= CHAIN_MS) this.chain++; else { this.chain = 1; this.chainT0 = now; }
    this.chainAt = now;
    const secs = Math.max(1, Math.round((now - this.chainT0) / 1000));
    if (this.chain === 2) out.push({ id: "double", sub: `2 KILLS IN ${secs} S` });
    else if (this.chain === 3) out.push({ id: "triple", sub: `3 KILLS IN ${secs} S` });
    else if (this.chain === 4) out.push({ id: "quad", sub: `4 KILLS IN ${secs} S` });
    else if (this.chain >= 5) out.push({ id: "rampage", sub: `${this.chain} STRAIGHT` });
    return out;
  }
}
