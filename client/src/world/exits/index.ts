// CLIFF EXITS (so no low ground is unescapable): timber cliff stairs out of the beaches under the sea cliffs,
// the gorges and the hollows an escape audit flagged.
// The layout AND the colliders come from shared/world/exits.ts (the server adds the same boxes to its static world), so
// every tread drawn here is a tread the kong stands on. Same timber / rope look as the Mist Falls walkway + landings
// (the jungle wood kit: planks PBR, hewn logs, rope): plank treads on two stringers, timber landings on log posts, rope
// rails on posts both sides, log struts down to the rock and knee braces into the face.
import * as THREE from "three";
import type { WorldModule } from "../module";
import type { CamSpec } from "../../engine/views";
import { exitLayouts, type ExitFlight, type ExitLanding, type ExitLayout } from "../../../../shared/world/exits";
import { newBuckets, timber, log, woodMaterials, woodMeshes, type WoodBuckets } from "../pois/_kit/jungle-wood";
import { rope, lashing } from "../pois/_kit/jungle-geo";
import { pbr, mulberry } from "../pois/_kit/jungle-mat";

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** three.js yaw whose local +X points along (dx, dz) (rotation.y: +X → (cos, 0, −sin)) */
const yaw3 = (dx: number, dz: number) => Math.atan2(-dz, dx);
const SHOW_D = 520;   // drawn within this distance (m) of the camera (the stairs read from the beach / the plateau)
const DETAIL_D = 170; // ropes + lashings (thin, most of the triangles) only this close

type Ground = (x: number, z: number) => number;

/** a rail run along a sloped or flat line: posts every ~1.7 m, a top rope + a mid rope */
function railRun(a: THREE.Vector3, b: THREE.Vector3, out: WoodBuckets, ground: Ground | null) {
  const len = a.distanceTo(b); if (len < 0.25) return;
  const n = Math.max(1, Math.round(len / 2.2));
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    const foot = ground ? Math.min(p.y - 0.3, ground(p.x, p.z) - 0.2) : p.y - 0.3;
    out.log.push(log(V3(p.x, Math.max(foot, p.y - 0.45), p.z), V3(p.x, p.y + 1.08, p.z), 0.055, "#d0b089", 6));
  }
  const segs = Math.max(4, Math.round(len * 1.4));
  out.rope.push(rope(a.clone().add(V3(0, 1.0, 0)), b.clone().add(V3(0, 1.0, 0)), Math.min(0.12, len * 0.03), 0.035, segs));
  out.rope.push(rope(a.clone().add(V3(0, 0.55, 0)), b.clone().add(V3(0, 0.55, 0)), Math.min(0.1, len * 0.025), 0.028, segs));
}

/** support under a deck point: a log post down to the ground when it is close below, otherwise a raking knee brace back
 *  into the face (the ground inland along (inX, inZ)) — the stair reads as bolted to the cliff, not standing on stilts */
function post(x: number, yTop: number, z: number, ground: Ground, out: WoodBuckets, inX: number, inZ: number) {
  const g = ground(x, z);
  if (yTop - g < 0.15) return;
  if (yTop - g <= 3.2) {
    out.log.push(log(V3(x, g - 0.35, z), V3(x, yTop, z), 0.12, "#c9a780", 7));
    out.rope.push(lashing(x, yTop - 0.32, z, 0.12, 2));
    return;
  }
  for (let d = 0.4; d < 9; d += 0.3) {
    const gx = x + inX * d, gz = z + inZ * d, gy = ground(gx, gz);
    if (gy > yTop - 2.6 - d * 0.6) { out.log.push(log(V3(gx - inX * 0.25, gy - 0.35, gz - inZ * 0.25), V3(x, yTop, z), 0.1, "#c9a780", 7)); out.rope.push(lashing(x, yTop - 0.3, z, 0.1, 2)); return; }
  }
}

function flightGeo(f: ExitFlight, out: WoodBuckets, ground: Ground, rnd: () => number) {
  const hw = f.w / 2, L = f.steps * f.run, H = f.steps * f.rise;
  const yu = yaw3(f.ux, f.uz), yn = yaw3(f.nx, f.nz);
  const at = (s: number, w: number, y: number) => V3(f.x + f.ux * s + f.nx * w, y, f.z + f.uz * s + f.nz * w);
  // treads: thick planks across the flight, a hair proud of the collider top (y − 0.035 centre, 0.07 thick)
  for (let i = 0; i < f.steps; i++) {
    const top = f.y + f.rise * (i + 1), s = f.run * (i + 0.5);
    out.wood.push(timber(f.w - 0.04, 0.075, f.run - 0.035, at(s, 0, top - 0.04), yn + (rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.015, rnd() < 0.3 ? "#d2ae84" : "#ffffff"));
  }
  // two stringers under the tread ends, along the slope
  const pitch = Math.atan2(H, L), slen = Math.hypot(L, H) + 0.35;
  for (const sd of [-1, 1]) out.wood.push(timber(slen, 0.34, 0.14, at(L / 2, sd * (hw - 0.07), f.y + H / 2 - 0.13), yu, pitch, 0, "#b89068"));
  // posts under the outer stringer (into the beach / the rock below), struts from the inner stringer into the face
  const np = Math.max(1, Math.round(L / 1.8));
  for (let i = 0; i <= np; i++) {
    const s = Math.min(L - 0.1, Math.max(0.1, (i / np) * L)), y = f.y + (s / L) * H - 0.3;
    const p = at(s, hw - 0.06, y); post(p.x, y, p.z, ground, out, -f.nx, -f.nz);
    const q = at(s, -hw + 0.06, y), gq = ground(q.x, q.z);
    post(q.x, y, q.z, ground, out, -f.nx, -f.nz);
  }
  // rope rails both sides (posts on every other tread)
  for (const sd of [-1, 1]) railRun(at(f.run + 0.05, sd * (hw - 0.05), f.y + 2 * f.rise), at(L - 0.1, sd * (hw - 0.05), f.y + H), out, null);
}

function landingGeo(l: ExitLanding, out: WoodBuckets, ground: Ground, rnd: () => number) {
  const at = (s: number, w: number, y: number) => V3(l.x + l.ux * s + l.nx * w, y, l.z + l.uz * s + l.nz * w);
  const yu = yaw3(l.ux, l.uz), yn = yaw3(l.nx, l.nz);
  // planks across the walking direction (along n), two bearers under them
  const n = Math.max(2, Math.round((2 * l.hu) / 0.3));
  for (let i = 0; i < n; i++) {
    const s = -l.hu + (i + 0.5) * (2 * l.hu) / n;
    out.wood.push(timber(2 * l.hn - 0.02, 0.075, (2 * l.hu) / n - 0.025, at(s, 0, l.y - 0.04), yn + (rnd() - 0.5) * 0.015, 0, 0, rnd() < 0.3 ? "#d2ae84" : "#ffffff"));
  }
  for (const sd of [-1, 1]) out.wood.push(timber(2 * l.hu + 0.2, 0.26, 0.12, at(0, sd * (l.hn - 0.1), l.y - 0.2), yu, 0, 0, "#b89068"));
  // posts at the corners (the outer ones down to the ground, the inner ones short into the rock)
  for (const su of [-1, 1]) for (const sw of [-1, 1]) {
    const p = at(su * (l.hu - 0.1), sw * (l.hn - 0.1), l.y - 0.3);
    post(p.x, p.y, p.z, ground, out, -l.nx, -l.nz);
  }
  for (const r of l.rails) {
    let a: THREE.Vector3, b: THREE.Vector3;
    if (r.edge <= 1) { const su = (r.edge === 0 ? -1 : 1) * (l.hu - 0.05); a = at(su, r.a, l.y); b = at(su, r.b, l.y); }
    else { const sw = (r.edge === 2 ? -1 : 1) * (l.hn - 0.05); a = at(r.a, sw, l.y); b = at(r.b, sw, l.y); }
    railRun(a, b, out, null);
  }
  if (l.top) {
    // the top: a carved post either side of the way off the deck onto the rim (a little landmark from the plateau)
    for (const sd of [-1, 1]) { const p = at(sd * (l.hu - 0.1), -l.hn + 0.12, l.y); out.log.push(log(V3(p.x, p.y - 0.4, p.z), V3(p.x, p.y + 1.6, p.z), 0.11, "#d6b48a", 8)); out.rope.push(lashing(p.x, p.y + 1.25, p.z, 0.11, 3)); }
  }
}

export function exitGeo(L: ExitLayout, ground: Ground): WoodBuckets {
  const out = newBuckets(), rnd = mulberry(Math.round(L.foot[0] * 7 + L.foot[2] * 13));
  for (const f of L.flights) flightGeo(f, out, ground, rnd);
  for (const l of L.landings) landingGeo(l, out, ground, rnd);
  return out;
}

const mod: WorldModule = {
  id: "exits",
  views: {
    // dev views (one per exit)
    "exit-lookout-west": { pos: [-736.7, 16, 567.5], target: [-677.8, 21.6, 607.5], fov: 55, note: "dev: the cliff stair up from the beach under Lookout Point's west cliffs" },
    "exit-n-coast": { pos: [-270.7, 16.5, -899.5], target: [-302.2, 20.1, -837.9], fov: 55, note: "dev: the north-coast beach stair below Ripe Peak" },
    "exit-coco-beach": { pos: [-927.1, 9.2, -187.2], target: [-892.4, 5.4, -202.7], fov: 55, note: "dev: the west-coast beach stair below Coco Caves" },
  } as Record<string, CamSpec>,
  async build(ctx) {
    const layouts = exitLayouts(ctx.terrain).filter((l) => l.ok);
    if (!layouts.length) return;
    const mats = woodMaterials(pbr(ctx, "planks"));
    const root = new THREE.Group(); root.name = "exits"; ctx.scene.add(root);
    const ground: Ground = (x, z) => ctx.terrain.height(x, z);
    const groups: Array<{ g: THREE.Group; detail: THREE.Object3D[]; c: THREE.Vector3; r: number }> = [];
    for (const L of layouts) {
      const g = new THREE.Group(); g.name = `exit-${L.id}`;
      const detail: THREE.Object3D[] = [];
      for (const m of woodMeshes(exitGeo(L, ground), mats, `exit-${L.id}`)) { g.add(m); if (m.name.endsWith("-rope")) detail.push(m); }
      root.add(g);
      const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3());
      groups.push({ g, detail, c, r: box.getSize(new THREE.Vector3()).length() / 2 });
      await ctx.yield();
    }
    if (!ctx.shotMode) ctx.onUpdate(() => {
      const p = ctx.camera.position;
      for (const q of groups) { const d = q.c.distanceTo(p) - q.r; q.g.visible = d < SHOW_D; for (const m of q.detail) m.visible = d < DETAIL_D; }
    });
  },
};
export default mod;
