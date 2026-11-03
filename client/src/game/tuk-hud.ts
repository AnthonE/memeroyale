// The tuk-tuk panel's controls: the key chips over the panel and the
// keys beside the seats / the radio — as the player's device and bindings label them. Rebuilt only when the seat, the
// device or the mode changes (or every 2 s for a rebind), so the per-frame HUD fill allocates nothing.
import { bindingText, climbText, descendText, glyphFamily, lookText } from "../settings/labels";
import { stickGlyph } from "../settings/pad";
import { device } from "../settings/device";
import type { BindAction } from "../settings/bindings";
import { preferences } from "../settings/preferences";
import { bindLabel } from "../settings/bindings";

/** a binding as a short key chip: LMB / RMB / SHIFT rather than "Left mouse" */
const short = (s: string) => s.toUpperCase().replace("LEFT MOUSE", "LMB").replace("RIGHT MOUSE", "RMB").replace("MIDDLE MOUSE", "MMB")
  .replace("LEFT SHIFT", "SHIFT").replace("RIGHT SHIFT", "R-SHIFT").replace("ARROW ", "");
export const keyOf = (a: BindAction) => short(bindingText(a, 0));

/** a chip's flags (the third element): KEEP = it stays up once the others have faded (a helicopter in the air: UP, DOWN,
 * BAIL OUT), HOT = it pulses (DOWN on the first flights), FILL = it fills while held
 * (the bail-out hold), WARN = a warning (TOO STEEP TO LAND, ROTOR SPOOLING UP) */
export const CHIP = { KEEP: 1, HOT: 2, FILL: 4, WARN: 8 } as const;
export type Chip = [string, string, number?];
interface Controls { hints: Chip[]; keys: { seat: [string, string, string]; swap: string; radio: string } }
const C: Controls = { hints: [], keys: { seat: ["", "", ""], swap: "", radio: "" } };
let sig = -1, at = -1e9;

/** every chip follows the player's bindings (SETTINGS → KEYBOARD & MOUSE / CONTROLLER → TUK-TUK) and the device in hand.
 * `heli`: a helicopter's seats instead (pilot / door gunner / passenger — shared/sim/heli.ts), the same panel; `air`: it
 * is off its skids (the pilot's chips that stay, HOLD to bail out); `hotDown`: DOWN pulses; `warn`: a warning chip first */
export function tukControls(seat: number, trios: boolean, now: number, benchHoldExit = false, heli = false, air = false, hotDown = false, warn = 0): Controls {
  const pad = device.pad, s = seat * 512 + warn * 64 + (hotDown ? 32 : 0) + (air ? 16 : 0) + (heli ? 8 : 0) + (pad ? 4 : 0) + (trios ? 2 : 0) + (benchHoldExit ? 1 : 0);
  if (s === sig && now - at < 2000) return C;
  sig = s; at = now;
  const h: Chip[] = [];
  const view = keyOf("rideView");
  if (heli && seat === 0) {
    if (warn) h.push(["!", WARNINGS[warn] ?? "", CHIP.WARN | CHIP.KEEP]);
    // the collective on jump / sprint (a controller: the triggers), the heading where you look, the stick tilts it
    h.push([short(climbText()), "UP", air ? CHIP.KEEP : 0]);
    h.push([short(descendText()), "DOWN", (air ? CHIP.KEEP : 0) | (hotDown ? CHIP.HOT : 0)]);
    h.push([lookText(), "TURN"]);
    h.push([pad ? stickGlyph(preferences.value.pad.swapSticks ? "right" : "left", glyphFamily()) : "WASD", "TILT"]);
    if (view && view !== "—") h.push([view, "VIEW"]);
  } else if (heli && seat === 1) {
    h.push([keyOf("fire"), "FIRE · SPIN UP"]);
    h.push([keyOf("aim"), "AIM"]);
  } else if (seat === 0) {
    h.push([keyOf("jump"), "HANDBRAKE"]);
    h.push([keyOf("sprint"), "HOP"]);   // (the sprint key / button: shared/sim/player.ts stepRide)
    h.push([keyOf("fire"), trios ? "HORN · CALL SQUAD" : "HORN"]);
    if (view && view !== "—") h.push([view, "VIEW"]);
  } else {
    h.push([keyOf("fire"), "SHOOT"]);
    h.push([keyOf("aim"), "AIM"]);
  }
  // (a controller passenger without a reload button — or any helicopter passenger: interact tapped reloads, held gets
  // out — game/input.ts; the pilot of a helicopter in the air holds it to bail out)
  if (heli && seat === 0 && air) h.push([`HOLD ${keyOf("use")}`, "BAIL OUT", CHIP.KEEP | CHIP.FILL]);
  else h.push([benchHoldExit ? `HOLD ${keyOf("use")}` : keyOf("use"), "EXIT"]);
  C.hints = h;
  const b = preferences.value.binds, k = (c: string | undefined) => c ? short(bindLabel(c)) : "";
  // the seat keys: none on a controller (crouch cycles); at the bars the slot keys, on the bench the seat keys
  const sk: [string, string, string] = pad ? ["", "", ""] : seat === 0 ? [k(b.slots[0]), k(b.slots[1]), k(b.slots[2])] : [k(b.seats[0]), k(b.seats[1]), k(b.seats[2])];
  const radio = keyOf("radio");
  C.keys = { seat: sk, swap: keyOf("crouch"), radio: heli ? "" : pad ? (radio === "—" ? "" : radio) : seat === 0 ? keyOf("reload") : radio === "—" ? "" : radio };
  return C;
}
/** the pilot's warning chip (tukControls `warn`): 1 the ground under it is too steep to land on, 2 the stick was taken
 * mid-fall and the rotor is still spooling back up to lift (shared/sim/heli.ts hopT = NO_PILOT_S) */
const WARNINGS = ["", "TOO STEEP TO LAND", "ROTOR SPOOLING UP — NO LIFT YET"];
