// KONGBOT capture: what a bug report needs from BEFORE the player typed /kongbot. Imported first by main.ts so it sees
// the whole boot. Everything is bounded (ring buffers) and cheap on the hot path:
//   console   log / info / warn / error / debug, args flattened at log time (never JSON.stringify a THREE object — its
//             toJSON serialises whole geometries), consecutive repeats folded into one entry with a count
//   errors    window error + unhandledrejection (with stacks) and failed resource loads (img / script / audio / link)
//   frames    every rAF delta for the last ~10 s (hitch evidence: p50 / p99 / max around the moment of the report)

export interface LogEntry { t: number; level: string; text: string; n: number }

const MAX_LOGS = 800, MAX_TEXT = 2000;
const logs: LogEntry[] = [];
const t0 = performance.now();
const now = () => Math.round(performance.now() - t0);

function flat(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return String(v);
  const t = typeof v;
  if (t === "string") return (v as string).length > 600 ? (v as string).slice(0, 600) + "…" : (v as string);
  if (t === "number" || t === "boolean" || t === "bigint") return String(v);
  if (t === "function") return `[fn ${(v as { name?: string }).name || "anonymous"}]`;
  if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
  const o = v as Record<string, unknown>;
  // three.js objects: a label, not their contents
  if (o.isObject3D || o.isMaterial || o.isTexture || o.isBufferGeometry || o.isWebGLRenderTarget) return `[${String(o.type ?? o.constructor?.name ?? "three")} "${String(o.name ?? "")}"]`;
  if (typeof Element !== "undefined" && v instanceof Element) return `<${v.tagName.toLowerCase()}${v.id ? "#" + v.id : ""}${v.className && typeof v.className === "string" ? "." + v.className.split(" ").join(".") : ""}>`;
  if (depth >= 2) return Array.isArray(v) ? `[Array(${v.length})]` : "{…}";
  if (Array.isArray(v) || ArrayBuffer.isView(v)) {
    const a = Array.from(v as ArrayLike<unknown>).slice(0, 16).map((x) => flat(x, depth + 1));
    return `[${a.join(", ")}${(v as ArrayLike<unknown>).length > 16 ? `, …${(v as ArrayLike<unknown>).length}` : ""}]`;
  }
  const keys = Object.keys(o).slice(0, 24);
  return `{${keys.map((k) => `${k}: ${flat(o[k], depth + 1)}`).join(", ")}${Object.keys(o).length > 24 ? ", …" : ""}}`;
}

export function push(level: string, text: string) {
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + "…";
  const last = logs[logs.length - 1];
  if (last && last.level === level && last.text === text) { last.n++; last.t = now(); return; }
  logs.push({ t: now(), level, text, n: 1 });
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
}

const LEVELS = ["log", "info", "warn", "error", "debug"] as const;
const c = console as unknown as Record<string, (...a: unknown[]) => void>;
for (const level of LEVELS) {
  const orig = c[level].bind(console);
  c[level] = (...args: unknown[]) => {
    try {
      // %c styling args are CSS, not content
      const parts: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (i === 0 && typeof a === "string" && a.includes("%c")) { parts.push(a.replace(/%c/g, "")); i += (a.match(/%c/g) || []).length; continue; }
        parts.push(flat(a));
      }
      push(level, parts.join(" "));
    } catch { /* capture must never break logging */ }
    orig(...args);
  };
}

addEventListener("error", (e) => {
  const el = e.target as (HTMLElement & { src?: string; href?: string }) | null;
  if (el && el !== (window as unknown) && (el.src || el.href)) { push("error", `[resource] failed to load <${el.tagName?.toLowerCase()}> ${el.src || el.href}`); return; }
  const err = (e as ErrorEvent).error;
  push("error", `[uncaught] ${err instanceof Error ? err.stack || err.message : (e as ErrorEvent).message} @ ${(e as ErrorEvent).filename ?? ""}:${(e as ErrorEvent).lineno ?? ""}`);
}, true);
addEventListener("unhandledrejection", (e) => { push("error", `[unhandled rejection] ${flat(e.reason)}`); });

// ---- frame times: rAF deltas, time-bounded (≤ 10 s at any refresh rate)
const FR = 2400;
const frameDt = new Float32Array(FR), frameAt = new Float64Array(FR);
let frameN = 0, lastRaf = 0;
function raf(ts: number) {
  if (lastRaf) { const i = frameN % FR; frameDt[i] = ts - lastRaf; frameAt[i] = ts; frameN++; }
  lastRaf = ts;
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

export function logSnapshot(): LogEntry[] { return logs.map((l) => ({ ...l })); }

/** frame-time stats over the last `sec` seconds (ms) + the raw deltas of the last 2 s */
export function frameStats(sec = 10) {
  const end = performance.now(), from = end - sec * 1000;
  const d: number[] = [], recent: number[] = [];
  for (let k = 0; k < Math.min(frameN, FR); k++) {
    const i = (frameN - 1 - k) % FR;
    if (frameAt[i] < from) break;
    d.push(frameDt[i]);
    if (frameAt[i] >= end - 2000) recent.push(+frameDt[i].toFixed(1));
  }
  if (!d.length) return null;
  const s = [...d].sort((a, b) => a - b), q = (p: number) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
  const sum = d.reduce((a, b) => a + b, 0);
  return { seconds: sec, frames: d.length, fps: +((d.length * 1000) / sum).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), over50ms: d.filter((x) => x > 50).length, over100ms: d.filter((x) => x > 100).length, last2s: recent.reverse() };
}
