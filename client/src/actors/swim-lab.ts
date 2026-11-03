// SWIM LAB: every swim state side by side in open deep water off the south coast, for
// captures and live tuning (SWIM_TUNE is on window.__swimTune). Surface row: treading, treading with
// the gun up, breaststroke, crawl. Under-water row (4.5 m down): hovering, breaststroke, diving down, coming up.
import * as THREE from "three";
import type { WorldCtx } from "../engine/engine";
import type { CamSpec } from "../engine/views";
import type { KongPose } from "./api";
import { createKong } from "./kong";
import { hold, pose } from "./kong-dev-views";
import { SWIM_TUNE } from "./kong-rig";

const V = (pos: CamSpec["pos"], target: CamSpec["target"], o: Partial<CamSpec> = {}): CamSpec => ({ pos, target, fov: 50, ...o });
/** the row's centre: open water ≥ 14 m deep for 30 m around (tools/swim/simtest.mts) */
const CX = -68.6, CZ = 696.6, FLOAT = -1.15, UNDER = -4.6;
const SX = (i: number) => CX - 9 + i * 4.2;           // surface row x
const UX = (i: number) => CX - 7 + i * 4.6;           // under-water row x
const UZ = CZ - 7;
/** the dry copy: its own centre + a virtual waterline DW (high over the dunes south of the turntable) */
const DX = 330, DZ = -232, DW = 8;

export const views: Record<string, CamSpec> = {
  // tuning (stage "swim-dry"): the same rows staged dry over the dunes by the kong turntable, the waterline a see-through
  // sheet + grid — the whole body reads (surface row in front, divers 7 m behind and 3.45 m lower)
  "wip-swim-xray": V([DX - 1.5, DW + 0.35, DZ + 11.5], [DX - 1.5, DW - 1.7, DZ - 3], { fov: 58, stage: "swim-dry", t: 12 }),
  "wip-swim-xray-near": V([DX - 9 + 1.5 * 4.2, DW + 0.25, DZ + 6.5], [DX - 9 + 1.5 * 4.2, DW - 0.45, DZ], { fov: 52, stage: "swim-dry", t: 12 }),
  "wip-swim-xray-breast": V([DX - 9 + 2 * 4.2 + 0.3, DW + 0.2, DZ + 4.6], [DX - 9 + 2 * 4.2, DW - 0.35, DZ], { fov: 48, stage: "swim-dry", t: 12 }),
  "wip-swim-xray-crawl": V([DX - 9 + 3 * 4.2 + 0.3, DW + 0.2, DZ + 4.6], [DX - 9 + 3 * 4.2, DW - 0.35, DZ], { fov: 48, stage: "swim-dry", t: 12 }),
  "wip-swim-xray-tread": V([DX - 9 + 0.3, DW + 0.1, DZ + 4.2], [DX - 9, DW - 0.4, DZ], { fov: 48, stage: "swim-dry", t: 12 }),
  "wip-swim-xray-under": V([DX + 1, DW - 4.0, DZ - 7 + 7.5], [DX + 1, DW - 4.3, DZ - 7], { fov: 56, stage: "swim-dry", t: 12 }),
  // the surface row from the side at the waterline (profiles: the stroke, how much of the kong is out of the water)
  "wip-swim-profile": V([CX - 2.7, 0.75, CZ + 10.5], [CX - 2.7, -0.2, CZ], { fov: 50, stage: "swim-lab", t: 12 }),
  // 3/4 from a little above (what a player on a dock sees)
  "wip-swim-3q": V([CX - 12, 3.2, CZ + 8.5], [CX - 2.7, -0.3, CZ], { fov: 46, stage: "swim-lab", t: 12 }),
  // close: the breaststroke kong and the crawl kong
  "wip-swim-breast": V([SX(2) + 1.5, 0.5, CZ + 4.2], [SX(2), -0.1, CZ], { fov: 42, stage: "swim-lab", t: 12 }),
  "wip-swim-crawl": V([SX(3) + 1.5, 0.6, CZ + 4.2], [SX(3), -0.1, CZ], { fov: 42, stage: "swim-lab", t: 12 }),
  "wip-swim-tread": V([SX(0) + 0.6, 0.45, CZ + 3.6], [SX(0), 0.0, CZ], { fov: 42, stage: "swim-lab", t: 12 }),
  // under water: the diving row from the side, and the breaststroke kong close
  "wip-swim-under": V([CX, UNDER + 0.6, UZ + 11], [CX, UNDER + 0.2, UZ], { fov: 55, stage: "swim-lab", t: 12 }),
  "wip-swim-under-close": V([UX(1) + 1.2, UNDER + 0.8, UZ + 4.2], [UX(1), UNDER + 0.3, UZ], { fov: 45, stage: "swim-lab", t: 12 }),
};

const staged = new Set<string>();
export async function stage(ctx: WorldCtx, s: string) {
  if ((s !== "swim-lab" && s !== "swim-dry") || staged.has(s)) return; staged.add(s);
  const dry = s === "swim-dry", ox = dry ? DX - CX : 0, oy = dry ? DW : 0, oz = dry ? DZ - CZ : 0;
  if (dry) {
    const g = new THREE.Group(); g.name = "swim-waterline";
    const m = new THREE.Mesh(new THREE.PlaneGeometry(44, 26), new THREE.MeshBasicMaterial({ color: "#2f9bff", transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; g.add(m);
    const grid = new THREE.GridHelper(44, 88, "#ffffff", "#bfe4ff"); const gm = grid.material as THREE.Material; gm.transparent = true; gm.opacity = 0.3; g.add(grid);
    g.position.set(DX, DW, DZ - 4); ctx.scene.add(g);
  }
  try { (globalThis as unknown as { __swimTune?: typeof SWIM_TUNE }).__swimTune = SWIM_TUNE; } catch { /* */ }
  const yaw = Math.PI / 2;   // facing −X: profiles to a camera on the +Z side; swimming toward −X
  const fwd = (v: number): Partial<KongPose> => ({ vx: -v, vz: 0 });
  const rows: Array<[number, number, Partial<KongPose>]> = [
    [SX(0), FLOAT, { state: "swim", weapon: null }],
    [SX(1), FLOAT, { state: "swim", weapon: "ar", pitch: 0.05 }],
    [SX(2), FLOAT, { state: "swim", weapon: null, ...fwd(4.8) }],
    [SX(3), FLOAT, { state: "swim", weapon: null, sprint: true, ...fwd(6.0) }],
    [UX(0), UNDER, { state: "dive", weapon: null }],
    [UX(1), UNDER, { state: "dive", weapon: null, ...fwd(4.2) }],
    [UX(2), UNDER, { state: "dive", weapon: null, vx: -3.0, vy: -2.6 }],
    [UX(3), UNDER, { state: "dive", weapon: null, vx: -2.6, vy: 3.0 }],
  ];
  const list: KongPose[] = [];
  ctx.shared.set(dry ? "swim:dry" : "swim:lab", list);
  for (let i = 0; i < rows.length; i++) {
    const [x, y, extra] = rows[i];
    const z = y === UNDER ? UZ : CZ;
    const k = await createKong(ctx, { variant: 60 + i });
    ctx.scene.add(k.object);
    const p = pose(x + ox, y + oy, z + oz, yaw, { weapon: null, team: 0, ...extra });
    list.push(p);
    hold(ctx, k, p, 1.3 + i * 0.37);
  }
}
