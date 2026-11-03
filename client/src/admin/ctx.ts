// What console parts share: sending an admin action (with its pending state until the server's ack) and toasts.
import type { AdminAct } from "../../../shared/net/event";

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** an AdminAct without the envelope (`t`, `id`) */
export type ActBody = DistOmit<AdminAct, "t" | "id">;
export interface Ack { ok: boolean; msg: string; code?: string }

export interface Ctx {
  /** send an action; `key` names the control that waits for it (it shows pending until the ack) */
  act(key: string, body: ActBody): Promise<Ack>;
  /** is an action for this control key waiting for its ack? */
  busy(key: string): boolean;
  toast(msg: string, tone?: "ok" | "err"): void;
}
