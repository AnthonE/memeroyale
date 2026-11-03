// The input device the player is using right now: the last one that did something (a key / click / real mouse
// movement → keyboard & mouse; a button / stick / trigger → controller). Prompts, glyphs, the cursor and aim assist
// follow it live. game/gamepad.ts writes it; everything else subscribes.
import type { PadFamily } from "./pad";

export interface DeviceState {
  kind: "kbm" | "pad";
  /** the connected controller's family (detected from its id; generic pads read as Xbox) and its display name */
  family: PadFamily; name: string;
  /** a controller is connected (and the browser has exposed it — that takes one button press on the page) */
  connected: boolean;
}
const listeners = new Set<(d: DeviceState) => void>();
let state: DeviceState = { kind: "kbm", family: "xbox", name: "", connected: false };
export const device = {
  get value() { return state; },
  get pad() { return state.kind === "pad"; },
  set(patch: Partial<DeviceState>) {
    const next = { ...state, ...patch };
    if (next.kind === state.kind && next.family === state.family && next.name === state.name && next.connected === state.connected) return;
    state = next;
    if (typeof document !== "undefined") document.documentElement.classList.toggle("kr-pad", state.kind === "pad");
    for (const fn of listeners) fn(state);
  },
  /** called now and on every change; returns the unsubscribe */
  subscribe(fn: (d: DeviceState) => void) { listeners.add(fn); fn(state); return () => { listeners.delete(fn); }; },
};
