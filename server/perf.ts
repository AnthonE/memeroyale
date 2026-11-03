import { createHistogram, monitorEventLoopDelay, type Histogram } from 'node:perf_hooks';
/** Explicit benchmark/operations opt-in; ordinary matches pay no histogram or clock-read cost. */
export function performanceMetrics() {
  if (process.env.KR_PERF_METRICS !== '1') return null;
  const tick = createHistogram(), delay = monitorEventLoopDelay({ resolution: 10 }); delay.enable();
  const start = performance.now(), cpu = process.cpuUsage();
  return {
    record(ms: number) { tick.record(Math.max(1, Math.round(ms * 1e6))); },
    read() {
      const usage = process.cpuUsage(cpu), summary = (h: Histogram) => ({ n: h.count, mean: h.count ? h.mean / 1e6 : 0, p50: h.percentile(50) / 1e6, p95: h.percentile(95) / 1e6, p99: h.percentile(99) / 1e6, max: h.max / 1e6 });
      return { platform: process.platform, arch: process.arch, node: process.version, uptimeMs: performance.now() - start, cpuMs: (usage.user + usage.system) / 1000, memory: process.memoryUsage(), tickMs: summary(tick), eventLoopDelayMs: summary(delay) };
    },
  };
}
