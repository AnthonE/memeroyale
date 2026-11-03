// The controller, read once per frame: whichever connected pad did something last is "the" pad. Buttons get press /
// release edges for this frame, the triggers become buttons past the player's trigger threshold (with hysteresis),
// the sticks come out deadzoned (radial or axial) and rescaled so the outer threshold is full deflection. It also
// decides the active device (settings/device.ts): a button / stick / trigger → controller; a trusted key, click,
// wheel or a real mouse sweep → keyboard & mouse. Rumble (dual-rumble, plus trigger-rumble where the browser and
// pad support it) goes through here, scaled by the player's vibration setting and only while they hold the pad.
import { device } from "../settings/device";
import { preferences } from "../settings/preferences";
import { PAD_BUTTON_COUNT, PB, type PadFamily } from "../settings/pad";

/** the controller family from the browser's id string (vendor ids: 054c Sony, 045e Microsoft, 057e Nintendo) */
export function familyOf(id: string): PadFamily {
  const s = id.toLowerCase();
  if (/054c|playstation|dualsense|dualshock|ps[345]|sony/.test(s)) return "playstation";
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return "nintendo";
  return "xbox";
}
/** "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)" → "Xbox Wireless Controller" */
export function padName(id: string) {
  const n = id.replace(/\s*\((STANDARD GAMEPAD|Vendor:)[^)]*\)\s*/gi, "").replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, "").trim();
  if (/^wireless controller$/i.test(n) && familyOf(id) === "playstation") return "PlayStation Wireless Controller";
  return n || "Controller";
}

type Actuator = { playEffect?: (type: string, params: Record<string, number>) => Promise<string>; reset?: () => Promise<string>; effects?: string[]; type?: string };

export class Gamepads {
  /** navigator.getGamepads() index of the pad in use, -1 = none */
  index = -1;
  readonly down = new Array<boolean>(PAD_BUTTON_COUNT).fill(false);
  /** this frame's edges */
  readonly pressed = new Array<boolean>(PAD_BUTTON_COUNT).fill(false);
  readonly released = new Array<boolean>(PAD_BUTTON_COUNT).fill(false);
  /** raw sticks (standard mapping: +x right, +y down) and the deadzoned / rescaled ones, triggers 0..1 */
  readonly raw = { lx: 0, ly: 0, rx: 0, ry: 0 };
  readonly left = { x: 0, y: 0 }; readonly right = { x: 0, y: 0 };
  lt = 0; rt = 0;
  /** the pad's mapping is not "standard" (the button positions may not match the glyphs) */
  nonStandard = false;
  onConnect: (name: string, family: PadFamily) => void = () => {};
  onDisconnect: (name: string, wasActive: boolean) => void = () => {};
  private rumbleUntil = 0; private rumbleMag = 0;
  private mouseSweep = 0; private mouseSweepAt = 0;

  constructor() {
    if (typeof window === "undefined") return;   // (node: tools / tests import the maths)
    addEventListener("gamepadconnected", (e) => {
      const g = (e as GamepadEvent).gamepad;
      if (this.index < 0) this.adopt(g);
      this.onConnect(padName(g.id), familyOf(g.id));
    });
    addEventListener("gamepaddisconnected", (e) => {
      const g = (e as GamepadEvent).gamepad, was = g.index === this.index;
      if (was) {
        this.index = -1; this.down.fill(false);
        const next = this.pads()[0];
        if (next) this.adopt(next); else device.set({ connected: false, name: "", kind: "kbm" });
      }
      this.onDisconnect(padName(g.id), was);
    });
    // keyboard & mouse take the device back on a TRUSTED key / click / wheel or a real sweep of the mouse (> 40 px in
    // a quarter second) — a nudged desk or a synthetic Escape from the menu navigation never does
    addEventListener("keydown", (e) => { if (e.isTrusted && !e.repeat) this.toKbm(); }, true);
    addEventListener("mousedown", (e) => { if (e.isTrusted) this.toKbm(); }, true);
    addEventListener("wheel", (e) => { if (e.isTrusted) this.toKbm(); }, { capture: true, passive: true });
    addEventListener("mousemove", (e) => {
      if (!e.isTrusted || !device.pad) return;
      const now = performance.now();
      if (now - this.mouseSweepAt > 250) this.mouseSweep = 0;
      this.mouseSweepAt = now; this.mouseSweep += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (this.mouseSweep > 40) this.toKbm();
    }, true);
  }
  private toKbm() { if (device.pad) device.set({ kind: "kbm" }); }
  private pads(): Gamepad[] {
    let list: (Gamepad | null)[] = [];
    try { list = navigator.getGamepads?.() ? [...navigator.getGamepads()] : []; } catch { /* insecure context / policy */ }
    return list.filter((g): g is Gamepad => !!g && g.connected);
  }
  private adopt(g: Gamepad) {
    this.index = g.index; this.nonStandard = g.mapping !== "standard";
    this.down.fill(false);
    device.set({ connected: true, name: padName(g.id), family: familyOf(g.id) });
  }
  get connected() { return this.index >= 0; }
  /** the Gamepad object in use (fresh each frame in Chrome) */
  get current(): Gamepad | null { return this.pads().find((g) => g.index === this.index) ?? null; }

  /** once per frame: pick the pad, read buttons / sticks / triggers, make the edges, switch the device on real input */
  poll() {
    const pads = this.pads();
    this.pressed.fill(false); this.released.fill(false);
    if (!pads.length) { if (this.index >= 0) { this.index = -1; this.down.fill(false); device.set({ connected: false, kind: "kbm" }); } return; }
    // another pad pressed something: it becomes the pad in use
    for (const g of pads) if (g.index !== this.index && g.buttons.some((b) => b.pressed)) { this.adopt(g); break; }
    let g = pads.find((p) => p.index === this.index);
    if (!g) { this.adopt(pads[0]); g = pads[0]; }
    const pad = preferences.value.pad, thr = pad.trigger;
    const val = (i: number) => g!.buttons[i]?.value ?? 0;
    this.lt = val(PB.LT); this.rt = val(PB.RT);
    let active = false;
    for (let i = 0; i < PAD_BUTTON_COUNT; i++) {
      const b = g.buttons[i];
      let on = !!b?.pressed;
      // triggers: the player's activation point, released a little below it (no chatter on a resting finger)
      if (i === PB.LT || i === PB.RT) { const v = i === PB.LT ? this.lt : this.rt; on = this.down[i] ? v > thr * 0.7 : v > thr; }
      if (on && !this.down[i]) { this.pressed[i] = true; active = true; }
      if (!on && this.down[i]) this.released[i] = true;
      this.down[i] = on;
    }
    const ax = g.axes;
    this.raw.lx = ax[0] ?? 0; this.raw.ly = ax[1] ?? 0; this.raw.rx = ax[2] ?? 0; this.raw.ry = ax[3] ?? 0;
    deadzone(this.raw.lx, this.raw.ly, pad.deadL, pad.outer, pad.axial, this.left);
    deadzone(this.raw.rx, this.raw.ry, pad.deadR, pad.outer, pad.axial, this.right);
    // a deliberate push (well past any worn stick's drift) or a trigger squeeze also counts as picking the pad up
    if (Math.hypot(this.raw.lx, this.raw.ly) > 0.5 || Math.hypot(this.raw.rx, this.raw.ry) > 0.5 || this.lt > 0.3 || this.rt > 0.3) active = true;
    if (active && !device.pad) device.set({ kind: "pad" });
  }
  /** any face / shoulder / d-pad button pressed this frame (the "press any button" prompts) */
  anyPressed() { return this.pressed.some((p, i) => p && i !== PB.HOME); }

  /** rumble: strong = low-frequency motor, weak = high-frequency motor (0..1), `ms` long. A weaker effect never cuts a
   *  stronger one that is still playing. `trigger` (0..1) adds impulse-trigger rumble on the right / left trigger. */
  rumble(strong: number, weak: number, ms: number, trigger?: { left?: number; right?: number }) {
    const pad = preferences.value.pad;
    if (!pad.vibration || !device.pad || pad.vibrationStrength <= 0) return;
    const g = this.current, act = (g as unknown as { vibrationActuator?: Actuator } | null)?.vibrationActuator;
    if (!act?.playEffect) return;
    const now = performance.now(), k = pad.vibrationStrength, mag = Math.max(strong, weak) * k;
    if (now < this.rumbleUntil && mag < this.rumbleMag * 0.8) return;
    this.rumbleUntil = now + ms; this.rumbleMag = mag;
    const params: Record<string, number> = { startDelay: 0, duration: Math.round(ms), strongMagnitude: Math.min(1, strong * k), weakMagnitude: Math.min(1, weak * k) };
    const triggers = pad.triggerRumble && trigger && (act.effects ?? []).includes("trigger-rumble");
    if (triggers) { params.leftTrigger = Math.min(1, (trigger!.left ?? 0) * k); params.rightTrigger = Math.min(1, (trigger!.right ?? 0) * k); }
    act.playEffect(triggers ? "trigger-rumble" : "dual-rumble", params).catch(() => {});
  }
  /** the connected pad can rumble at all / supports impulse triggers (the settings tab greys those rows out) */
  get canRumble() { const a = (this.current as unknown as { vibrationActuator?: Actuator } | null)?.vibrationActuator; return !!a?.playEffect; }
  get canTriggerRumble() { const a = (this.current as unknown as { vibrationActuator?: Actuator } | null)?.vibrationActuator; return !!a?.effects?.includes("trigger-rumble"); }
}

/** radial: the stick's distance past `dead`, rescaled so `outer` is full deflection, direction kept. axial: per axis. */
export function deadzone(x: number, y: number, dead: number, outer: number, axial: boolean, out: { x: number; y: number }) {
  const span = Math.max(0.05, outer - dead);
  if (axial) {
    const a = (v: number) => Math.sign(v) * Math.min(1, Math.max(0, (Math.abs(v) - dead) / span));
    out.x = a(x); out.y = a(y);
    const m = Math.hypot(out.x, out.y); if (m > 1) { out.x /= m; out.y /= m; }
    return out;
  }
  const m = Math.hypot(x, y);
  if (m <= dead) { out.x = 0; out.y = 0; return out; }
  const k = Math.min(1, (m - dead) / span) / m;
  out.x = x * k; out.y = y * k;
  return out;
}

export const gamepads = new Gamepads();
