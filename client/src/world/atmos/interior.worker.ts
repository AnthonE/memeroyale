// atmos interior volume worker (so interiors are not flat-lit): rasterises the POIs' static collision
// boxes (shared/pois — walls with their real window / door openings, floors, roofs; glass and foliage skipped) into a
// camera-centred occupancy grid. Each voxel stores its COVERAGE (2x2x2 supersamples → 0..255), so a 30 cm wall in a
// 50 cm voxel is a soft partial blocker and the GPU's trilinear filter keeps openings open. The AO pass ray-marches it
// for the interior sky visibility (post.ts interiorVis). Off the main thread: a rebuild costs 5–40 ms of JS.
import { allColliders } from "../../../../shared/pois/index";

interface Req { id: number; ox: number; oy: number; oz: number; nx: number; ny: number; nz: number; vs: number }

// per box: centre (3), half extents (3), yaw cos / sin, pitch cos / sin, world AABB min (3) / max (3)
const S = 16;
let B: Float32Array | null = null;
let N = 0;
function init() {
  const boxes = allColliders().filter((b) => b.surf !== "glass" && !b.noShoot && Math.min(b.h[0], b.h[1], b.h[2]) < 40);
  N = boxes.length;
  B = new Float32Array(N * S);
  for (let i = 0; i < N; i++) {
    const b = boxes[i], o = i * S;
    const yaw = b.yaw ?? 0, pitch = b.pitch ?? 0;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    B[o] = b.c[0]; B[o + 1] = b.c[1]; B[o + 2] = b.c[2];
    B[o + 3] = b.h[0]; B[o + 4] = b.h[1]; B[o + 5] = b.h[2];
    B[o + 6] = cy; B[o + 7] = sy; B[o + 8] = cp; B[o + 9] = sp;
    // conservative AABB: the yawed footprint, the pitched height
    const hzp = Math.abs(cp) * b.h[2] + Math.abs(sp) * b.h[1];
    const ex = Math.abs(cy) * b.h[0] + Math.abs(sy) * hzp, ez = Math.abs(sy) * b.h[0] + Math.abs(cy) * hzp;
    const ey = Math.abs(cp) * b.h[1] + Math.abs(sp) * b.h[2];
    B[o + 10] = b.c[0] - ex; B[o + 11] = b.c[1] - ey; B[o + 12] = b.c[2] - ez;
    B[o + 13] = b.c[0] + ex; B[o + 14] = b.c[1] + ey; B[o + 15] = b.c[2] + ez;
  }
}

function build(r: Req): Uint8Array {
  const { ox, oy, oz, nx, ny, nz, vs } = r;
  const acc = new Uint8Array(nx * ny * nz);
  const X1 = ox + nx * vs, Y1 = oy + ny * vs, Z1 = oz + nz * vs;
  const b = B!;
  const q = vs * 0.25;
  for (let i = 0; i < N; i++) {
    const o = i * S;
    if (b[o + 13] < ox || b[o + 10] > X1 || b[o + 14] < oy || b[o + 11] > Y1 || b[o + 15] < oz || b[o + 12] > Z1) continue;
    const i0 = Math.max(0, Math.floor((b[o + 10] - ox) / vs)), i1 = Math.min(nx - 1, Math.floor((b[o + 13] - ox) / vs));
    const j0 = Math.max(0, Math.floor((b[o + 11] - oy) / vs)), j1 = Math.min(ny - 1, Math.floor((b[o + 14] - oy) / vs));
    const k0 = Math.max(0, Math.floor((b[o + 12] - oz) / vs)), k1 = Math.min(nz - 1, Math.floor((b[o + 15] - oz) / vs));
    const cx = b[o], cyy = b[o + 1], cz = b[o + 2], hx = b[o + 3], hy = b[o + 4], hz = b[o + 5];
    const c = b[o + 6], s = b[o + 7], cp = b[o + 8], sp = b[o + 9];
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const vx = ox + (ii + 0.5) * vs, vy = oy + (j + 0.5) * vs, vz = oz + (k + 0.5) * vs;
      let n = 0;
      for (let sz = -1; sz <= 1; sz += 2) for (let sy2 = -1; sy2 <= 1; sy2 += 2) for (let sx = -1; sx <= 1; sx += 2) {
        const dx = vx + sx * q - cx, dy = vy + sy2 * q - cyy, dz = vz + sz * q - cz;
        const lx = dx * c + dz * s, lz0 = -dx * s + dz * c;
        // pitch about the box's local X axis
        const ly = dy * cp - lz0 * sp, lz = dy * sp + lz0 * cp;
        if (Math.abs(lx) <= hx && Math.abs(ly) <= hy && Math.abs(lz) <= hz) n++;
      }
      if (n) { const idx = ii + nx * (j + ny * k); acc[idx] = Math.min(8, acc[idx] + n); }
    }
  }
  for (let i = 0; i < acc.length; i++) acc[i] = Math.min(255, acc[i] * 32);
  return acc;
}

self.onmessage = (ev: MessageEvent<Req>) => {
  const t0 = performance.now();
  if (!B) init();
  const data = build(ev.data);
  (self as unknown as Worker).postMessage({ id: ev.data.id, data, ms: performance.now() - t0, boxes: N }, [data.buffer]);
};
