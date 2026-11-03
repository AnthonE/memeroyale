// WORKER POOL: run heavy deterministic generation (pixel painting, noise fields, scatter, mesh
// generation into typed arrays) on other cores while the main thread keeps building — a module build that spends
// 1-3 s in a per-pixel painter spends ~0 ms of main thread with it. The boot uses one core.
//
// Usage (in YOUR module's files — Vite bundles the worker only when `new Worker(new URL(...), …)` is written literally
// in the file that owns it):
//
//   // my-paint.worker.ts
//   import { servePool } from "../../engine/worker-pool";
//   import { paintYard } from "./yard-paint";                     // pure: (w, h, seed) => Uint8ClampedArray (RGBA)
//   servePool({ paintYard: (a: { w: number; h: number; seed: number }) => { const px = paintYard(a.w, a.h, a.seed); return { result: px, transfer: [px.buffer] }; } });
//
//   // index.ts (module build)
//   import { workerPool } from "../../engine/worker-pool";
//   const pool = workerPool(() => new Worker(new URL("./my-paint.worker.ts", import.meta.url), { type: "module" }), 4);
//   const [a, b] = await Promise.all([pool.run<Uint8ClampedArray>("paintYard", { w: 1024, h: 1024, seed: 1 }), pool.run("paintYard", { w: 512, h: 512, seed: 2 })]);
//   const tex = new THREE.DataTexture(a, 1024, 1024); tex.needsUpdate = true;   // or createImageBitmap(new ImageData(a, 1024))
//   pool.close();                                                                  // when the module no longer needs it
//
// Start the jobs EARLY in build() and await them late: the main thread builds geometry while the workers paint.
// Transfer typed arrays (zero copy). Workers cannot touch the DOM, three.js scene or WebGL; OffscreenCanvas 2D works.

type Job = { id: number; fn: string; args: unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void; transfer?: Transferable[] };

export interface WorkerPool {
  /** run `fn` (a name the worker registered with servePool) with `args` (structured clone; `transfer` moved, not copied) */
  run<T = unknown>(fn: string, args?: unknown, transfer?: Transferable[]): Promise<T>;
  /** terminate the workers (pending jobs reject) */
  close(): void;
  readonly size: number;
}

/** a pool of up to `size` workers made by `factory` (default: half the cores, 2-6), created lazily per job */
export function workerPool(factory: () => Worker, size = Math.max(2, Math.min(6, Math.floor((navigator.hardwareConcurrency || 4) / 2)))): WorkerPool {
  const workers: Array<{ w: Worker; busy: Job | null }> = [];
  const queue: Job[] = [];
  let seq = 0, closed = false;
  const pump = () => {
    while (queue.length) {
      let slot = workers.find((x) => !x.busy);
      if (!slot && workers.length < size) {
        const w = factory();
        const s: { w: Worker; busy: Job | null } = { w, busy: null };
        w.onmessage = (e: MessageEvent) => {
          const j = s.busy; s.busy = null;
          if (j) { const d = e.data as { ok: boolean; result?: unknown; error?: string }; if (d.ok) j.resolve(d.result); else j.reject(new Error(d.error)); }
          pump();
        };
        w.onerror = (e) => { const j = s.busy; s.busy = null; j?.reject(new Error(e.message || "worker error")); pump(); };
        workers.push(s); slot = s;
      }
      if (!slot) return;
      const j = queue.shift()!;
      slot.busy = j;
      slot.w.postMessage({ id: j.id, fn: j.fn, args: j.args }, j.transfer ?? []);
    }
  };
  return {
    size,
    run<T>(fn: string, args?: unknown, transfer?: Transferable[]) {
      if (closed) return Promise.reject(new Error("worker pool closed"));
      return new Promise<T>((resolve, reject) => { queue.push({ id: ++seq, fn, args, resolve: resolve as (v: unknown) => void, reject, transfer }); pump(); });
    },
    close() {
      closed = true;
      for (const s of workers) { s.busy?.reject(new Error("worker pool closed")); s.w.terminate(); }
      for (const j of queue.splice(0)) j.reject(new Error("worker pool closed"));
      workers.length = 0;
    },
  };
}

/** inside a worker file: register the functions a pool may run. Each returns its result, or { result, transfer }. */
export function servePool(fns: Record<string, (args: never) => unknown | Promise<unknown>>) {
  const g = globalThis as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown, t?: Transferable[]): void };
  g.onmessage = async (e: MessageEvent) => {
    const { fn, args } = e.data as { fn: string; args: never };
    try {
      const f = fns[fn];
      if (!f) throw new Error(`worker-pool: no function "${fn}"`);
      const r = await f(args);
      const packed = r && typeof r === "object" && "transfer" in (r as object) && "result" in (r as object) ? (r as { result: unknown; transfer: Transferable[] }) : { result: r, transfer: [] };
      g.postMessage({ ok: true, result: packed.result }, packed.transfer);
    } catch (err) {
      g.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
}
