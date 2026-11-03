// GPU warmer: everything the driver would otherwise do the first time a match draws something, done while the player
// sits on the title / lobby screen instead (otherwise PRACTICE freezes for 1.2-1.9 s).
//   • program FIRST USE: three asks the driver for a program's uniform / attribute tables the first time it draws with it
//     — a synchronous GPU-process round trip that waits for the (parallel) compile. Programs created after the boot
//     prewarm (atmos re-patches, late LOD variants) are first-used here, only once their compile is complete
//     (non-blocking KHR_parallel_shader_compile query), so the title never stalls either.
//   • texture UPLOAD: textures bound through shader uniforms (including the ones other modules inject in onBeforeCompile,
//     reachable through the renderer's material properties) are uploaded one per frame — a 2048² ImageBitmap cost
//     ~0.3 s on the first match frame.
import type * as THREE from "three";

interface ProgLike { isReady?: () => boolean; getUniforms?: () => unknown; getAttributes?: () => unknown }

export interface GpuWarmer {
  /** per frame while NOT in a match (cheap: a few programs, at most one texture upload) */
  tick(): void;
  /** everything now, synchronously (end of the boot prewarm, behind the loading screen) */
  flush(): void;
}

export function createGpuWarmer(renderer: THREE.WebGLRenderer, scene: THREE.Scene): GpuWarmer {
  const donePrograms = new WeakSet<object>();
  const doneTextures = new WeakSet<THREE.Texture>();
  const queue: THREE.Texture[] = [];
  let frame = 0;
  const props = renderer.properties as unknown as { get(o: object): Record<string, unknown> };
  const uploaded = (t: THREE.Texture) => !!props.get(t).__webglTexture;

  function firstUse(all: boolean) {
    const progs = (renderer.info.programs ?? []) as unknown as ProgLike[];
    let n = 0;
    for (const q of progs) {
      if (donePrograms.has(q)) continue;
      // never block on a program that is still compiling (the query below would wait for it)
      if (!all && q.isReady && !q.isReady()) continue;
      try { q.getUniforms?.(); q.getAttributes?.(); } catch { /* a failed program reports itself */ }
      donePrograms.add(q);
      if (!all && ++n >= 6) break;
    }
  }

  function collectTextures() {
    const add = (v: unknown) => {
      const t = v as THREE.Texture;
      if (t && t.isTexture && !doneTextures.has(t) && !(t as unknown as { isRenderTargetTexture?: boolean }).isRenderTargetTexture) {
        doneTextures.add(t);
        if (!uploaded(t) && t.image) queue.push(t);
      }
    };
    const seenM = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mm = (o as THREE.Mesh).material; if (!mm) return;
      for (const m of Array.isArray(mm) ? mm : [mm]) {
        if (seenM.has(m)) continue; seenM.add(m);
        for (const v of Object.values(m as unknown as Record<string, unknown>)) add(v);
        const u = (m as THREE.ShaderMaterial).uniforms; if (u) for (const k in u) add(u[k]?.value);
        // uniforms injected by onBeforeCompile live in the compiled material's properties
        const pu = props.get(m).uniforms as Record<string, { value: unknown }> | undefined;
        if (pu) for (const k in pu) { const v = pu[k]?.value; if (Array.isArray(v)) v.forEach(add); else add(v); }
      }
    });
  }

  function uploadOne(): boolean {
    while (queue.length) {
      const t = queue.shift()!;
      if (uploaded(t)) continue;
      try { renderer.initTexture(t); } catch { /* skip */ }
      return true;
    }
    return false;
  }

  (globalThis as { __warm?: unknown }).__warm = {
    pending: () => ((renderer.info.programs ?? []) as unknown as Array<ProgLike & { name: string; cacheKey: string }>).filter((q) => !donePrograms.has(q)).map((q) => `${q.name} ready=${q.isReady?.()} ${q.cacheKey.slice(-50)}`),
    queue: () => queue.length,
  };
  return {
    tick() {
      frame++;
      firstUse(false);
      if (frame % 45 === 1) collectTextures();
      uploadOne();
    },
    flush() {
      collectTextures();
      while (uploadOne()) { /* all of them */ }
      firstUse(true);
    },
  };
}
