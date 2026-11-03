// PEEL HARBOR parts registry. Each part file exports `build(p: PartCtx)`; index.ts builds them in order into one
// group. Dev: `?harborOnly=crane,ship` builds only those parts (plus the apron) for fast isolated captures.
import type * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import type { HarborMats } from "../_kit/harbor-materials";
import type { ContainerKit } from "../_kit/containers";
import type { HarborLod } from "./lod";

export interface PartCtx {
  ctx: WorldCtx;
  /** shared painted materials (tile in metres — build geometry with uvMetres()) */
  mats: HarborMats;
  /** the harbor's container kit — add placements here (ship deck, crane spreader); index.ts builds it after all parts */
  kit: ContainerKit;
  /** add your meshes here (HARBOR-LOCAL coordinates — the group carries the frame transform) */
  group: THREE.Group;
  /** ground height under the apron = APRON_Y everywhere on the slab; elsewhere use groundAt(lx, lz) */
  apronY: number;
  /** distance LOD: register detail groups (show/shadow distances) and far proxies */
  lod: HarborLod;
  /** perf: coarse stand-ins (the HLOD proxies) whose silhouettes cast into shadow CASCADE 1 for their detail groups —
   *  index.ts merges them into ONE C1-layer caster; the detail groups' own casters go into cascade 0 only
   *  (`mergeCasters(g, { c1: false })`) and the proxies themselves get `userData.c1Shadow = false` */
  c1: THREE.Object3D[];
}

export interface Part { id: string; build(p: PartCtx): void | Promise<void> }

export async function loadParts(): Promise<Part[]> {
  const mods = await Promise.all([
    import("./apron"), import("./crane"), import("./ship"), import("./access"), import("./warehouse"), import("./tanks"), import("./props"), import("./yard"), import("./pier"),
  ]);
  return mods.map((m) => m.part);
}

// ---- frame helpers (harbor-local ↔ world) for parts that touch world services
import { toWorld } from "../../../../../shared/pois/peel-harbor";
import type { WaterApi } from "../../water/api";
/** terrain height under a harbor-local point */
export function groundAt(ctx: WorldCtx, lx: number, lz: number): number {
  const [x, z] = toWorld(lx, lz);
  return ctx.terrain.height(x, z);
}
/** water foam in harbor-local coordinates (no-ops if the water module is absent) */
export function foam(ctx: WorldCtx) {
  const w = ctx.shared.get("water") as WaterApi | undefined;
  return {
    circle(lx: number, lz: number, r: number, s = 0.8) { const [x, z] = toWorld(lx, lz); w?.registerFoamCircle?.(x, z, r, s); },
    capsule(ax: number, az: number, bx: number, bz: number, r: number, s = 0.6) { const [x1, z1] = toWorld(ax, az), [x2, z2] = toWorld(bx, bz); w?.registerFoamCapsule?.(x1, z1, x2, z2, r, s); },
    /** axis-aligned local rect ring (hx along local x) */
    rect(lx: number, lz: number, hx: number, hz: number, ring = 1.5, s = 0.6) { const [x, z] = toWorld(lx, lz); w?.registerFoamRect?.(x, z, hz, hx, 0, ring, s); },
  };
}
