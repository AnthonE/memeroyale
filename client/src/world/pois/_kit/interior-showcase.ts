// interiors — showcase module: one furnished room per style, built only when an int-* view is requested
// (?view=int-house …). The rooms stand on a little pier platform off the east coast at sea level, so the windows look
// out onto real sky and sea. Eye-level cameras (floor + 1.8 m). Shells are plain plaster boxes with real openings.
import * as THREE from "three";
import type { WorldModule } from "../../module";
import type { WorldCtx } from "../../../engine/engine";
import type { CamSpec } from "../../../engine/views";
import type { InteriorRoom, RoomOpening } from "../../../../../shared/pois/interior-kit";
import { buildInteriors } from "./interior";
import { plasterTex, floorTex } from "./interior-tex";

const BASE = new THREE.Vector3(1330, 3, -300);
interface Show { room: Omit<InteriorRoom, "x" | "y" | "z" | "yaw">; cam: [number, number, number, number, number, number]; fov?: number }
const win = (side: 0 | 1 | 2 | 3, at: number, w = 1.3): RoomOpening => ({ side, at, w, kind: "window" });
const door = (side: 0 | 1 | 2 | 3, at: number, w = 1.2): RoomOpening => ({ side, at, w, kind: "door" });

// cam = [x, y, z, tx, ty, tz] room-local (y above the floor)
const SHOWS: Record<string, Show> = {
  "int-house": { room: { w: 7, d: 5.6, h: 3, style: "house", role: "living", seed: 3, openings: [door(0, -2.2), win(2, -1.5), win(1, 0.3, 1.5), win(3, 0.6)] }, cam: [2.9, 1.8, 2.3, -2.2, 0.95, -1.0] },
  "int-kitchen": { room: { w: 6, d: 5, h: 3, style: "house", role: "kitchen", seed: 11, openings: [door(0, 1.8), win(2, 0.8), win(3, -0.4, 1.2), win(1, 0.8)] }, cam: [2.2, 1.8, 2.0, -1.4, 0.9, -1.4] },
  "int-bedroom": { room: { w: 5.4, d: 4.6, h: 2.9, style: "house", role: "bedroom", seed: 5, openings: [door(0, -1.8, 1.1), win(2, 0.9, 1.4), win(1, -0.2, 1.2)] }, cam: [2.0, 1.8, -1.8, -0.6, 0.7, 1.4] },
  "int-shop": { room: { w: 8, d: 6, h: 3.4, style: "shop", role: "grocer", seed: 7, openings: [door(0, 0, 1.6), win(0, -2.6, 1.8), win(0, 2.6, 1.8), win(3, 0.5)] }, cam: [-3.2, 1.8, 2.5, 1.8, 1.0, -2.0] },
  "int-warehouse": { room: { w: 14, d: 10, h: 6, style: "warehouse", role: "storage", seed: 9, openings: [door(0, -4.5, 3.2), door(0, 3, 1.2), { side: 2, at: -3, w: 2, kind: "window", y0: 3.4, h: 1.4 }, { side: 2, at: 3, w: 2, kind: "window", y0: 3.4, h: 1.4 }, { side: 1, at: 0, w: 2, kind: "window", y0: 3.4, h: 1.4 }] }, cam: [-5.8, 1.8, 2.6, 3.5, 1.3, -3.0], fov: 62 },
  "int-lab": { room: { w: 9, d: 6.5, h: 3.2, style: "lab", role: "server", seed: 4, openings: [door(0, -3.2, 1.3), win(2, 0, 2.2), win(3, 0.8, 1.5)] }, cam: [-3.6, 1.8, 1.6, 2.5, 1.0, -1.8] },
  "int-hut": { room: { w: 5.2, d: 4.4, h: 2.8, style: "hut", role: "fisher", seed: 2, openings: [door(0, 1.4, 1.1), win(2, -0.8, 1.1), win(3, 0, 1.0)] }, cam: [2.0, 1.8, -0.2, -1.8, 0.9, 0.6] },
  "int-cabin": { room: { w: 6, d: 4.6, h: 2.6, style: "cabin", role: "captain", seed: 8, openings: [door(0, -2.0, 1.1), win(2, -1.2, 0.9), win(2, 1.2, 0.9), win(1, 0, 0.9)] }, cam: [0.6, 1.7, 2.05, -0.6, 0.85, -1.8], fov: 72 },
  "int-dock": { room: { w: 6.4, d: 4.6, h: 2.9, style: "lab", role: "dock", seed: 21, openings: [door(0, 2.0, 1.2), win(2, -0.6, 1.8), win(3, 0.2, 1.3)], finish: { wall: "#e4e6df" } }, cam: [-2.5, 1.8, 1.6, 2.4, 1.0, -0.7] },
  "int-hall": { room: { w: 7.2, d: 26, h: 6, style: "temple", role: "shrine", seed: 6, openings: [door(0, 0, 2.6), { side: 1, at: -6, w: 1.4, kind: "window", y0: 3.2, h: 1.8 }, { side: 3, at: -6, w: 1.4, kind: "window", y0: 3.2, h: 1.8 }, { side: 1, at: 4, w: 1.4, kind: "window", y0: 3.2, h: 1.8 }, { side: 3, at: 4, w: 1.4, kind: "window", y0: 3.2, h: 1.8 }], finish: { ceiling: "none" } }, cam: [-0.4, 1.8, 11.8, 0.3, 1.6, -10], fov: 62 },
  "int-temple": { room: { w: 10, d: 9, h: 6, style: "temple", role: "shrine", seed: 6, openings: [door(0, 0, 2.6), { side: 1, at: 0, w: 1.4, kind: "window", y0: 2.8, h: 1.8 }, { side: 3, at: 0, w: 1.4, kind: "window", y0: 2.8, h: 1.8 }], finish: { ceiling: "none" } }, cam: [-1.2, 1.8, 3.9, 0.6, 1.5, -3.6], fov: 62 },
};
const ids = Object.keys(SHOWS);
const slot = (id: string) => BASE.clone().add(new THREE.Vector3(0, 0, ids.indexOf(id) * 40));

const views: Record<string, CamSpec> = {};
for (const id of ids) {
  const o = slot(id), c = SHOWS[id].cam;
  views[id] = { pos: [o.x + c[0], o.y + c[1], o.z + c[2]], target: [o.x + c[3], o.y + c[4], o.z + c[5]], fov: SHOWS[id].fov ?? 60, stage: id, note: "interiors kit showcase (eye level)" };
}

/** a plain shell: floor slab on a pier, walls with the room's openings, ceiling + roof (visual only) */
function shell(room: InteriorRoom, style: string): THREE.Group {
  const g = new THREE.Group();
  const t = room.wallT ?? 0.25, W = room.w, D = room.d, H = room.h;
  const wallMat = new THREE.MeshStandardMaterial({ map: plasterTex(), color: style === "temple" ? "#b8a88a" : style === "cabin" ? "#7a4a2a" : style === "warehouse" ? "#9aa7ad" : "#e8d8b8", roughness: 0.9 });
  wallMat.map = wallMat.map!.clone(); wallMat.map.repeat.set(1 / 3, 1 / 3); wallMat.map.needsUpdate = true;
  const slabMat = new THREE.MeshStandardMaterial({ map: floorTex("concrete"), color: "#b8b0a0", roughness: 0.9 });
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; g.add(me); };
  add(W + 2 * t + 6, 0.4, D + 2 * t + 6, 0, -0.2, 0, slabMat);
  for (let i = 0; i < 6; i++) add(0.5, 6, 0.5, (i % 3 - 1) * (W / 2 + 2), -3.2, (i < 3 ? -1 : 1) * (D / 2 + 2), slabMat);
  if (!room.openTop) add(W + 2 * t, 0.3, D + 2 * t, 0, H + 0.15, 0, wallMat);
  for (const s of [0, 1, 2, 3] as const) {
    const L = s % 2 === 0 ? W + 2 * t : D;
    const ops = room.openings.filter((o) => o.side === s);
    // wall-local u along the wall in "along" coords; build pieces around the openings
    const cuts = ops.map((o) => ({ a0: o.at - o.w / 2, a1: o.at + o.w / 2, y0: o.y0 ?? (o.kind === "window" ? 1.0 : 0), y1: (o.y0 ?? (o.kind === "window" ? 1.0 : 0)) + (o.h ?? (o.kind === "window" ? 1.3 : 2.3)) }));
    const xs = [-L / 2, L / 2, ...cuts.flatMap((c) => [c.a0, c.a1])].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const a0 = xs[i], a1 = xs[i + 1]; if (a1 - a0 < 0.005) continue;
      const mid = (a0 + a1) / 2;
      const hit = cuts.filter((c) => mid > c.a0 && mid < c.a1);
      const ys = [0, H, ...hit.flatMap((c) => [c.y0, c.y1])].sort((a, b) => a - b);
      for (let k = 0; k < ys.length - 1; k++) {
        const y0 = ys[k], y1 = ys[k + 1]; if (y1 - y0 < 0.005) continue;
        const ym = (y0 + y1) / 2;
        if (hit.some((c) => ym > c.y0 && ym < c.y1)) continue;
        const w = a1 - a0;
        if (s === 0) add(w, y1 - y0, t, mid, (y0 + y1) / 2, D / 2 + t / 2, wallMat);
        else if (s === 2) add(w, y1 - y0, t, mid, (y0 + y1) / 2, -D / 2 - t / 2, wallMat);
        else if (s === 1) add(t, y1 - y0, w, W / 2 + t / 2, (y0 + y1) / 2, mid, wallMat);
        else add(t, y1 - y0, w, -W / 2 - t / 2, (y0 + y1) / 2, mid, wallMat);
      }
    }
  }
  return g;
}

const built = new Set<string>();
const mod: WorldModule = {
  id: "interiors",
  build() {},
  views,
  async stage(ctx: WorldCtx, stage: string) {
    if (!SHOWS[stage] || built.has(stage)) return;
    built.add(stage);
    const o = slot(stage);
    const room: InteriorRoom = { ...SHOWS[stage].room, x: o.x, y: o.y, z: o.z, yaw: 0 };
    const sh = shell(room, room.style);
    sh.position.copy(o);
    ctx.scene.add(sh);
    // the showcase shells are not in the shared collider set (atmos' interior volume cannot see them): bake the rooms'
    // sky visibility into the kit's vertices instead, as the volume does for real POI rooms
    const r = await buildInteriors(ctx, [room], { name: stage, bakeSky: "force" });
    (window as unknown as { __krInterior?: Record<string, unknown> }).__krInterior = { stage, tris: r.tris, draws: r.draws, items: r.layouts[0].items.length, colliders: r.layouts[0].colliders.length, loot: r.layouts[0].loot };
  },
};
export default mod;
export { SHOWS };
