// poi-town texture worker: runs one procedural generator from TOWN_TEX_SETS and posts the images back (transferred).
import { TOWN_TEX_SETS, type GenOut } from "./town-tex";

self.onmessage = (e: MessageEvent<{ name: string }>) => {
  const name = e.data.name;
  let g: GenOut | null = null;
  try { g = TOWN_TEX_SETS[name]?.() ?? null; } catch (err) { console.warn("town-tex worker:", name, err); }
  const bufs = g ? [g.albedo.data.buffer, g.normal.data.buffer, g.orm.data.buffer] as ArrayBuffer[] : [];
  (self as unknown as Worker).postMessage({ name, g }, bufs);
};
