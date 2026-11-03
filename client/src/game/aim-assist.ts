// Controller aim assist (never for the mouse): the two halves every console shooter uses, scaled by the player's
// strength setting and faded out toward the edge of a target's "bubble" and with distance.
//   slowdown  — the look stick turns slower while the crosshair is over / near an enemy (more so aiming down sights)
//   tracking  — while the player is actively aiming, moving or firing, the view follows a share of the target's
//               angular motion (the enemy strafing, or the player strafing around them) — never a snap, never through
//               a wall (line of sight to the chest), never at a squadmate or a downed / dead player (their hitbox is 0)
// It reads the same interpolated hitboxes the shots are traced against (ClientMatch.viewTargets).
import { TARGET_STRIDE } from "../../../shared/sim/hitscan";
import { PS, SK } from "../../../shared/sim/player";
import { preferences } from "../settings/preferences";
import { WEAPONS } from "../../../shared/world/map";
import type { ClientMatch } from "./client";
import type { AimAssistFn, AssistResult } from "./input";

const DEG = Math.PI / 180;
const MAX_RANGE = 140;            // m: no assist on specks
const FULL_RANGE = 55;            // m: full strength inside, fading to 35 % at MAX_RANGE
const BUBBLE_HIP = 1.1, BUBBLE_ADS = 1.6;   // m around the chest
const BUBBLE_MIN = 1.4 * DEG, BUBBLE_MAX = 8 * DEG;
const SLOW_HIP = 0.35, SLOW_ADS = 0.5;      // look-speed reduction at the bubble's centre (× strength)
const TRACK_HIP = 0.35, TRACK_ADS = 0.6;    // share of the target's angular motion followed (× strength)

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const NONE: AssistResult = { slow: 1, dyaw: 0, dpitch: 0 };

export function createAimAssist(session: () => ClientMatch | null): AimAssistFn {
  let lockId = -1, lastYaw = 0, lastPitch = 0;
  const pose = { x: 0, y: 0, z: 0 };
  const out: AssistResult = { slow: 1, dyaw: 0, dpitch: 0 };
  return (yaw, pitch, _dt, look, move, firing, ads) => {
    const cm = session(), p = cm?.pred;
    if (!cm || !p || p.hp <= 0 || (p.st !== PS.Ground && p.st !== PS.Mantle) || p.slots[p.active]?.kind !== SK.Weapon) { lockId = -1; return NONE; }
    // no aim assist of any kind with the sniper — every shot is the player's own
    if (WEAPONS[p.slots[p.active].id] === "sniper") { lockId = -1; return NONE; }
    const strength = preferences.value.pad.aimAssistStrength;
    cm.localPose(pose);
    const ex = pose.x, ey = pose.y + (p.crouch ? 1.05 : 1.65), ez = pose.z;
    const T = cm.viewTargets, n = cm.remotes.length;
    // the best two candidates by how deep inside their bubble the crosshair is; the nearer-to-centre one with line of sight wins
    let b1 = -1, r1 = 1, b2 = -1, r2 = 1;
    for (let i = 0; i < n; i++) {
      const o = i * TARGET_STRIDE, h = T[o + 3];
      if (h <= 0 || i === cm.me) continue;
      const dx = T[o] - ex, dy = T[o + 1] + h * 0.6 - ey, dz = T[o + 2] - ez, flat = Math.hypot(dx, dz), d = Math.hypot(flat, dy);
      if (d < 1.2 || d > MAX_RANGE) continue;
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, flat);
      const sep = Math.hypot(wrap(ty - yaw) * Math.cos(tp), tp - pitch);
      const bubble = Math.min(BUBBLE_MAX, Math.max(BUBBLE_MIN, Math.atan2(ads ? BUBBLE_ADS : BUBBLE_HIP, d)));
      const r = sep / bubble;
      if (r < r1) { b2 = b1; r2 = r1; b1 = i; r1 = r; } else if (r < r2) { b2 = i; r2 = r; }
    }
    let best = -1, ratio = 1;
    for (const [i, r] of [[b1, r1], [b2, r2]] as const) {
      if (i < 0) continue;
      const o = i * TARGET_STRIDE;
      if (cm.world.clear(ex, ey, ez, T[o], T[o + 1] + T[o + 3] * 0.6, T[o + 2])) { best = i; ratio = r; break; }
    }
    if (best < 0) { lockId = -1; return NONE; }
    const o = best * TARGET_STRIDE;
    const dx = T[o] - ex, dy = T[o + 1] + T[o + 3] * 0.6 - ey, dz = T[o + 2] - ez, flat = Math.hypot(dx, dz), d = Math.hypot(flat, dy);
    const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, flat);
    const edge = 1 - ratio, f = edge * edge * (3 - 2 * edge);                 // smoothstep toward the centre
    const range = d <= FULL_RANGE ? 1 : Math.max(0.35, 1 - (d - FULL_RANGE) / (MAX_RANGE - FULL_RANGE));
    const k = strength * f * range;
    out.slow = 1 - (ads ? SLOW_ADS : SLOW_HIP) * k;
    out.dyaw = 0; out.dpitch = 0;
    if (best === lockId && (look > 0.05 || move > 0.1 || firing)) {
      const dty = wrap(ty - lastYaw), dtp = tp - lastPitch;
      // a teleport / respawn / interpolation jump is not motion to follow
      if (Math.abs(dty) < 0.12 && Math.abs(dtp) < 0.12) { const t = (ads ? TRACK_ADS : TRACK_HIP) * k; out.dyaw = dty * t; out.dpitch = dtp * t; }
    }
    lockId = best; lastYaw = ty; lastPitch = tp;
    return out;
  };
}
