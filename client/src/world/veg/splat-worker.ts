// Gaussian-splat bake worker: clusters one captured species into splat levels (splat-build.ts) off the main thread.
import { buildSplats, type SplatBuildInput } from "./splat-build";

self.onmessage = (e: MessageEvent<SplatBuildInput>) => {
  try {
    const out = buildSplats(e.data);
    (self as unknown as Worker).postMessage({ ok: true, out }, [out.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, id: e.data?.id, error: String(err) });
  }
};
