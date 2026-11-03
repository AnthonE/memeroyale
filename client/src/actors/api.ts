// CHARACTER CONTRACT between the actors area (look + animation) and the gameplay area (what the kong is doing).
// The gameplay area only ever talks to kongs through this file. The actors area replaces the placeholder
// implementation in ./kong.ts keeping these signatures.
import type * as THREE from "three";
import type { WeaponId } from "../../../shared/world/map";

export type KongState = "idle" | "move" | "jump" | "fall" | "freefall" | "glide" | "land" | "dead" | "emote" | "plane"
  /** zipline ride (PS.Zip), ledge pull-up (PS.Mantle, progress = time in state), crouch knee-slide */
  | "zip" | "mantle" | "slide"
  /** on a ladder / tree trunk (PS.Climb): hand over hand, the feet on the rungs; vy = climb speed */
  | "climb"
  /** tuk-tuk (PS.Ride): "drive" = in the saddle, fists on the bars (KongPose.grips); "ride" = on the bench, gun up */
  | "drive" | "ride"
  /** swimming: "swim" = on the surface (treading when still, the stroke when moving, treading
   *  upright with the gun when `weapon` is set), "dive" = under water (a breaststroke along vx / vy / vz) */
  | "swim" | "dive";

export interface KongPose {
  x: number; y: number; z: number;     // feet position, metres
  yaw: number;                          // radians, 0 = facing -Z (north)
  pitch: number;                        // aim pitch, radians (+ = up)
  vx: number; vz: number;               // ground velocity m/s (drives locomotion blend + direction)
  vy: number;
  state: KongState;
  crouch: boolean;
  sprint: boolean;
  weapon: WeaponId | null;
  /** edge-triggered this frame */
  fired?: boolean;
  reloading?: boolean;
  hurt?: boolean;
  /** "drive" / "ride": the seat's own tilt — the tuk-tuk's pitch (+ = nose up) and roll (+ = left side down) turned
   *  into THIS kong's yaw frame — and, driving, the world position of the two grips [right, left] its fists hold */
  seatPitch?: number; seatRoll?: number;
  grips?: readonly [THREE.Vector3, THREE.Vector3] | null;
  /** 0 = no team colour; else a squad slot for friend/foe outline tint */
  team: number;
  friendly: boolean;
}

/** kong-variety: one match's look — hat / top index (−1 = none; actors/outfits.ts HAT_IDS / TOP_IDS) and
 *  the shorts colour (null = the brand brick red). actors/outfit-pick.ts outfitFor() derives it from player id + seed. */
export interface KongOutfit { hat: number; top: number; shorts: string | null }

export interface KongActor {
  object: THREE.Object3D;
  apply(p: KongPose, dt: number): void;
  /** world-space muzzle position of the held weapon (for 3P tracers) */
  muzzle(out: THREE.Vector3): THREE.Vector3;
  setVisible(v: boolean): void;
  dispose(): void;
  /** FIRST-PERSON BODY of the local player (optional): apply `p` seen from the kong's own eyes at `camera`
   *  — the head is collapsed and never near-faded; freefall: the body sits with its head just behind the camera and the
   *  fists reach into the lower corners of the frame (as in drop-04); glide: the true glide pose under the glider (fists on
   *  the bar, legs + sneakers dangling below). A plain apply() afterwards returns to the normal third-person look. */
  pov?(camera: THREE.Camera, p: KongPose, dt: number): void;
  /** kong-variety (optional): wear this match's outfit; null = the default look */
  setOutfit?(o: KongOutfit | null): void;
  /** swimming (optional): the animator's stroke counter (steps on each stroke's power moment) and its kind — 0 surface
   *  breaststroke, 1 crawl pull, 2 treading kick, 3 under water. render.ts plays the stroke sound + splash on a step. */
  swimEvt?(): number;
  swimEvtKind?(): number;
}
