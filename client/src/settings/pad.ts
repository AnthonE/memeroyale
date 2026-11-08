// Controller definitions: the W3C "standard" gamepad button indices, the actions a controller can bind, the layout
// presets, the per-family glyphs (Xbox / PlayStation / Nintendo) and the tuning defaults. Data only — the live device
// is game/gamepad.ts, the preferences record is settings/preferences.ts, the tab is settings/controller-panel.ts.

/** standard-mapping button indices (https://w3c.github.io/gamepad/#remapping); 17 = the PlayStation touchpad click */
export const PB = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16, TOUCH: 17 } as const;
export const PAD_BUTTON_COUNT = 18;
/** never bindable: MENU always pauses (and cancels a rebind), HOME belongs to the OS */
export const RESERVED_BUTTONS: readonly number[] = [PB.MENU, PB.HOME];

export type PadFamily = "xbox" | "playstation" | "nintendo";
export type GlyphChoice = "auto" | PadFamily;

const GLYPHS: Record<PadFamily, string[]> = {
  xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "VIEW", "MENU", "LS", "RS", "D-PAD ↑", "D-PAD ↓", "D-PAD ←", "D-PAD →", "XBOX", "SHARE"],
  playstation: ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "CREATE", "OPTIONS", "L3", "R3", "D-PAD ↑", "D-PAD ↓", "D-PAD ←", "D-PAD →", "PS", "TOUCHPAD"],
  // Nintendo's face letters sit mirrored (east = A); the standard mapping keeps positions, so the label follows the position
  nintendo: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "L-STICK", "R-STICK", "D-PAD ↑", "D-PAD ↓", "D-PAD ←", "D-PAD →", "HOME", "CAPTURE"],
};
/** the face buttons' brand colours (glyph chips) */
export const FACE_COLORS: Record<PadFamily, Partial<Record<number, string>>> = {
  xbox: { 0: "#5cc94a", 1: "#e8483b", 2: "#3f8de0", 3: "#f2c230" },
  playstation: { 0: "#7fa6ff", 1: "#ff6b74", 2: "#e98ad8", 3: "#3fd0b4" },
  nintendo: {},
};
export const glyph = (button: number, family: PadFamily) => GLYPHS[family][button] ?? `BUTTON ${button + 1}`;
export const stickGlyph = (side: "left" | "right", family: PadFamily) => family === "playstation" ? (side === "left" ? "L-STICK" : "R-STICK") : side === "left" ? "LS" : "RS";

export type PadAction = "jump" | "crouch" | "sprint" | "interact" | "reload" | "fire" | "aim" | "nextSlot" | "prevSlot" | "lastSlot" | "map" | "inventory" | "glider" | "ping" | "throw" | "radio" | "rideView";
export type PadBinds = Record<PadAction, number[]>;
/** actions added after the first saved controller bindings: an older record gets their layout defaults */
const NEW_PAD_ACTIONS: readonly PadAction[] = ["ping", "throw", "radio", "rideView"];
export const PAD_ACTIONS: PadAction[] = ["fire", "aim", "jump", "crouch", "sprint", "interact", "reload", "nextSlot", "prevSlot", "lastSlot", "map", "inventory", "glider", "ping", "throw", "radio", "rideView"];
/** tuk-tuk actions (live only in a seat) and the on-foot actions each may share a button with: ones that do nothing in
 *  the seats it serves (the glider never opens in a seat; the driver holds no gun, so the slot keys are dead at the
 *  bars). In a seat the shared button is the tuk-tuk action's alone (game/input.ts). */
export const RIDE_SHARE: Partial<Record<PadAction, readonly PadAction[]>> = {
  radio: ["glider"],
  rideView: ["glider", "lastSlot", "nextSlot", "prevSlot"],
};
/** two actions may sit on the same button (a tuk-tuk action and a foot action that is dead in its seats) */
export const mayShare = (a: PadAction, b: PadAction) => a !== b && (!!RIDE_SHARE[a]?.includes(b) || !!RIDE_SHARE[b]?.includes(a));
export const PAD_LABELS: Record<PadAction, string> = {
  fire: "Fire / use item", aim: "Aim down sights", jump: "Jump / exit plane / glider", crouch: "Crouch / slide", sprint: "Sprint / dive / hold breath",
  interact: "Interact · reload when nothing to take", reload: "Reload", nextSlot: "Next slot", prevSlot: "Previous slot", lastSlot: "Swap to last slot",
  map: "Map", inventory: "Inventory", glider: "Deploy glider", ping: "Ping / mark the spot you look at", throw: "Throw ratio bomb (hold to cook)",
  radio: "Tuk-tuk radio · next station", rideView: "Tuk-tuk driver view",
};

export type PadLayout = "standard" | "tactical" | "bumper";
export const PAD_LAYOUTS: Record<PadLayout, PadBinds> = {
  // the common shooter default: X interacts (or reloads when there is nothing to take), Y swaps to the last slot
  standard: { fire: [PB.RT], aim: [PB.LT], jump: [PB.A], crouch: [PB.B], sprint: [PB.LS], interact: [PB.X], reload: [], nextSlot: [PB.RB], prevSlot: [PB.LB], lastSlot: [PB.Y], map: [PB.VIEW, PB.TOUCH], inventory: [PB.UP], glider: [PB.DOWN], ping: [PB.RIGHT], throw: [PB.LEFT], radio: [PB.DOWN], rideView: [PB.Y] },
  // crouch / slide on the right stick click (aim never leaves the stick), B becomes a dedicated reload
  tactical: { fire: [PB.RT], aim: [PB.LT], jump: [PB.A], crouch: [PB.RS], sprint: [PB.LS], interact: [PB.X], reload: [PB.B], nextSlot: [PB.RB], prevSlot: [PB.LB], lastSlot: [PB.Y], map: [PB.VIEW, PB.TOUCH], inventory: [PB.UP], glider: [PB.DOWN], ping: [PB.RIGHT], throw: [PB.LEFT], radio: [PB.DOWN], rideView: [PB.Y] },
  // jump on the left bumper (aim and jump together), the previous slot moves to the d-pad. Ping stays on the d-pad's
  // right as in every layout; the banana bomb takes the free right-stick click (it shared the glider's d-pad ↓ before:
  // a duplicate the settings could not save — any rebind fell back to STANDARD)
  bumper: { fire: [PB.RT], aim: [PB.LT], jump: [PB.LB, PB.A], crouch: [PB.B], sprint: [PB.LS], interact: [PB.X], reload: [], nextSlot: [PB.RB], prevSlot: [PB.LEFT], lastSlot: [PB.Y], map: [PB.VIEW, PB.TOUCH], inventory: [PB.UP], glider: [PB.DOWN], ping: [PB.RIGHT], throw: [PB.RS], radio: [PB.DOWN], rideView: [PB.Y] },
};
export const LAYOUT_NAMES: Record<PadLayout | "custom", string> = { standard: "STANDARD", tactical: "TACTICAL", bumper: "BUMPER JUMPER", custom: "CUSTOM" };

export type LookCurve = "standard" | "linear" | "dynamic";
/** stick magnitude (0..1, past the deadzone) → share of the full turn rate */
export function applyCurve(curve: LookCurve, x: number) {
  if (curve === "linear") return x;
  if (curve === "dynamic") return 0.3 * x + 0.7 * x * x * x;   // precise centre, fast edge
  return x * x;                                                // standard: quadratic
}

export interface PadPrefs {
  layout: PadLayout | "custom"; binds: PadBinds; glyphs: GlyphChoice;
  /** full-deflection turn speed multipliers (1 = 190°/s yaw, 125°/s pitch) */
  lookH: number; lookV: number;
  /** multipliers on top of the zoom's own scaling while aiming down sights / through the sniper scope */
  adsMul: number; scopeMul: number;
  curve: LookCurve;
  /** extra yaw at full deflection after the ramp (0..1 → +0..160°/s) and the ramp time (s) */
  boost: number; boostRamp: number;
  deadL: number; deadR: number; outer: number; trigger: number; axial: boolean;
  invertY: boolean; swapSticks: boolean;
  aimToggle: boolean; crouchToggle: boolean; sprintMode: "hold" | "toggle" | "auto";
  aimAssist: boolean; aimAssistStrength: number;
  vibration: boolean; vibrationStrength: number; triggerRumble: boolean;
}
export function padDefaults(): PadPrefs {
  return {
    layout: "standard", binds: structuredClone(PAD_LAYOUTS.standard), glyphs: "auto",
    lookH: 1, lookV: 1, adsMul: 1, scopeMul: 1, curve: "standard", boost: 0.5, boostRamp: 0.3,
    deadL: 0.1, deadR: 0.08, outer: 0.95, trigger: 0.12, axial: false,
    invertY: false, swapSticks: false,
    aimToggle: false, crouchToggle: true, sprintMode: "toggle",
    aimAssist: true, aimAssistStrength: 0.65,
    vibration: true, vibrationStrength: 0.8, triggerRumble: true,
  };
}
export const PAD_RANGES = {
  lookH: [0.2, 3], lookV: [0.2, 3], adsMul: [0.2, 2], scopeMul: [0.2, 2], boost: [0, 1], boostRamp: [0, 1],
  deadL: [0, 0.35], deadR: [0, 0.35], outer: [0.6, 1], trigger: [0.02, 0.8], aimAssistStrength: [0, 1], vibrationStrength: [0, 1],
} as const;
const PAD_FLAGS = ["axial", "invertY", "swapSticks", "aimToggle", "crouchToggle", "aimAssist", "vibration", "triggerRumble"] as const;

const validButton = (b: unknown): b is number => typeof b === "number" && Number.isInteger(b) && b >= 0 && b < PAD_BUTTON_COUNT && !RESERVED_BUTTONS.includes(b);
/** malformed storage falls back to the defaults field by field; a binding table with a duplicate falls back whole */
export function normalizePad(raw: unknown): PadPrefs {
  const p = padDefaults(); if (!raw || typeof raw !== "object") return p;
  const r = raw as Record<string, unknown>;
  for (const [k, [lo, hi]] of Object.entries(PAD_RANGES)) { const v = r[k]; if (typeof v === "number" && Number.isFinite(v)) (p as unknown as Record<string, number>)[k] = Math.max(lo, Math.min(hi, v)); }
  for (const k of PAD_FLAGS) if (typeof r[k] === "boolean") p[k] = r[k];
  if (r.curve === "standard" || r.curve === "linear" || r.curve === "dynamic") p.curve = r.curve;
  if (r.glyphs === "auto" || r.glyphs === "xbox" || r.glyphs === "playstation" || r.glyphs === "nintendo") p.glyphs = r.glyphs;
  if (r.sprintMode === "hold" || r.sprintMode === "toggle" || r.sprintMode === "auto") p.sprintMode = r.sprintMode;
  if (r.layout === "standard" || r.layout === "tactical" || r.layout === "bumper" || r.layout === "custom") p.layout = r.layout;
  const b = r.binds as Record<string, unknown> | undefined;
  let bindsOk = false;
  if (b && typeof b === "object") {
    const proposed = structuredClone(PAD_LAYOUTS.standard), used = new Map<number, PadAction[]>(); let valid = true;
    // a button may carry two actions only when they can never both be live (mayShare: a tuk-tuk action + a dead foot one)
    const taken = (x: number, k: PadAction, others: Iterable<PadAction>) => { for (const o of others) if (o !== k && !mayShare(o, k)) return true; return false; };
    for (const k of PAD_ACTIONS) {
      let list = b[k];
      // an action this record predates (ping / throw / the tuk-tuk's): the layout's default for it, minus a button taken
      if (list === undefined && NEW_PAD_ACTIONS.includes(k)) list = PAD_LAYOUTS[p.layout === "custom" ? "standard" : p.layout][k].filter((x) => !taken(x, k, used.get(x) ?? []) && !taken(x, k, PAD_ACTIONS.filter((o) => Array.isArray(b[o]) && (b[o] as number[]).includes(x))));
      if (!Array.isArray(list) || list.length > 2) { valid = false; break; }
      for (const x of list) if (!validButton(x) || taken(x, k, used.get(x) ?? [])) valid = false; else used.set(x, [...(used.get(x) ?? []), k]);
      proposed[k] = list as number[];
    }
    if (valid) { p.binds = proposed; bindsOk = true; }
  }
  if (!bindsOk && p.layout === "custom") p.layout = "standard";
  if (p.layout !== "custom") p.binds = structuredClone(PAD_LAYOUTS[p.layout]);
  return p;
}
/** the layout preset these binds equal, or "custom" */
export function layoutOf(binds: PadBinds): PadLayout | "custom" {
  for (const name of Object.keys(PAD_LAYOUTS) as PadLayout[]) if (PAD_ACTIONS.every((a) => PAD_LAYOUTS[name][a].join() === binds[a].join())) return name;
  return "custom";
}
export const isBindableButton = validButton;
