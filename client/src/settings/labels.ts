// The current binding of an action as players read it ("E / F", "Left Shift" — or "X" / "□" on a controller): HUD
// prompts, hints, slot numbers and the controls guide all show what the buttons really are after a rebind, on the
// device the player is holding right now.
import { preferences } from "./preferences";
import { bindLabel, type BindAction } from "./bindings";
import { device } from "./device";
import { glyph, stickGlyph, type PadAction, type PadFamily } from "./pad";

/** the glyph set prompts use: the player's choice, else the connected controller's family */
export function glyphFamily(): PadFamily { const g = preferences.value.pad.glyphs; return g === "auto" ? device.value.family : g; }
/** a keyboard action → the controller action that does the same thing (null: no controller button — slots, move) */
const PAD_FOR: Partial<Record<BindAction, PadAction>> = { jump: "jump", crouch: "crouch", sprint: "sprint", use: "interact", reload: "reload", fire: "fire", aim: "aim", nextSlot: "nextSlot", prevSlot: "prevSlot", lastSlot: "lastSlot", map: "map", inventory: "inventory", glider: "glider", ping: "ping", throw: "throw", radio: "radio", rideView: "rideView" };
/** every button of a controller action ("RB / D-PAD →"), or its `index`-th one; "" when unbound */
export function padText(action: PadAction, index?: number) {
  const list = preferences.value.pad.binds[action], f = glyphFamily();
  return index === undefined ? list.map((b) => glyph(b, f)).join(" / ") : list.length ? glyph(list[index] ?? list[0], f) : "";
}

/** every key of `action` ("E / F"), or just its `index`-th one (falling back to the primary) — controller glyphs while
 *  the player is on a controller */
export function bindingText(action: BindAction, index?: number) {
  if (device.pad) {
    if (action === "fwd" || action === "back" || action === "left" || action === "right") return stickGlyph(preferences.value.pad.swapSticks ? "right" : "left", glyphFamily());
    if (action === "slots" || action === "seats") return "";   // (a controller cycles seats with crouch)
    // reload without its own button: the interact button reloads when there is nothing to take
    const pa = action === "reload" && !preferences.value.pad.binds.reload.length ? "interact" : PAD_FOR[action];
    if (pa) return padText(pa, index) || "—";
  }
  const codes = preferences.value.binds[action];
  if (!codes.length) return "—";
  return index === undefined ? codes.map(bindLabel).join(" / ") : bindLabel(codes[index] ?? codes[0]);
}
/** what the player looks / steers with: "MOUSE" or the look stick */
export function lookText() { return device.pad ? stickGlyph(preferences.value.pad.swapSticks ? "left" : "right", glyphFamily()) : "MOUSE"; }
/** a helicopter's collective as labelled on this device: up (jump / the right trigger) and down (sprint / the left trigger) */
export function climbText() { return device.pad ? padText("fire", 0) || "RT" : bindingText("jump", 0); }
export function descendText() { return device.pad ? padText("aim", 0) || "LT" : bindingText("sprint", 0); }
/** the pause button as labelled on this device */
export function pauseText() { return device.pad ? glyph(9, glyphFamily()) : "ESC"; }
/** the back / close button as labelled on this device */
export function backText() { return device.pad ? glyph(1, glyphFamily()) : "ESC"; }

/** run `fn` now and whenever a label could have changed: a rebind, a glyph choice, or the player picking up the other device */
export function onLabelsChange(fn: () => void) {
  const sig = () => `${device.value.kind}:${glyphFamily()}`;
  let last = sig();
  const a = preferences.subscribe(() => { last = sig(); fn(); });
  const b = device.subscribe(() => { if (sig() !== last) { last = sig(); fn(); } });
  return () => { a(); b(); };
}
