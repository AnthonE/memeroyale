// poi-jungle: the longest MAIN-THREAD slice of a jungle module's build. A PerformanceObserver
// ("longtask", > 50 ms) runs while the module builds; window.__kr.jungleSlices[id] = { longTasks, maxMs, wallMs } — read it
// with the perf tools. (No long task at all = every slice between ctx.yield()s < 50 ms.)
export function sliceMeter(id: string): () => void {
  const t0 = performance.now(), tasks: number[] = [];
  let obs: PerformanceObserver | null = null;
  try { obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) tasks.push(Math.round(e.duration)); }); obs.observe({ type: "longtask", buffered: false }); } catch { obs = null; }
  return () => {
    const done = () => { try { obs?.disconnect(); } catch { /* */ }
      const kr = (window as unknown as { __kr?: Record<string, unknown> }).__kr; if (!kr) return;
      const all = (kr.jungleSlices ??= {}) as Record<string, unknown>;
      all[id] = { longTasks: tasks.length, maxMs: tasks.length ? Math.max(...tasks) : 0, tasks: tasks.slice(0, 12), wallMs: Math.round(performance.now() - t0), observer: !!obs }; };
    // long-task entries arrive asynchronously: settle one macrotask later
    setTimeout(done, 0);
  };
}
