// TERRAIN OCCLUSION CULL for whole POIs.
// At eye level most of the island is behind a hill: an offline pass over the 41 tour spots found
// 57 % of the far-POI views (POI > 250 m + its radius away) completely hidden by the terrain — yet every one of them
// still costs its full CPU draw list (the lab's 39 draws, the falls' 26 … seen "through" the volcano). Per registered
// POI (its module's scene roots + world bounds) the engine runs the conservative sight-line test of occlusion-test.ts
// against the terrain heightfield whenever the camera has moved ≥ 1.5 m (or teleported), and hides the POI's roots
// through a visibility GATE (scene-hooks: the module's own `visible` / LOD logic keeps working underneath) while every
// sight line to its bounding cylinder passes ≥ 2 m + 1 % of the distance below the terrain (the rendered terrain LOD
// may sit a little lower than the full-resolution heightfield far away). It becomes visible the moment any sight line
// clears — i.e. before any part of it can show over the ridge, so there is no pop.
// Never applied: within 350 m of the POI's rim (the sun cascades draw casters near the camera — an occluded POI's
// shadow could still fall into view), on the frame the atmos far-shadow bake runs, in ?shot captures. ?noocc = off.
import * as THREE from "three";
import type { Terrain } from "../../../shared/world/terrain";
import { gate, ungate, type Gate } from "./scene-hooks";
import { poiOccluded, type OccluderBox } from "./occlusion-test";

interface Entry { id: string; roots: THREE.Object3D[]; box: OccluderBox; g: Gate; tested: boolean }

const MIN_RIM = 350;

export class PoiOcclusion {
  enabled: boolean;
  private list: Entry[] = [];
  private last = new THREE.Vector3(1e9, 0, 0);
  private bakeHook: THREE.Object3D | null | undefined;
  /** POIs hidden right now (diagnostics) */
  hidden: string[] = [];
  constructor(enabled: boolean, private scene: THREE.Scene, private terrain: () => Terrain | undefined) { this.enabled = enabled; }

  /** a POI's module roots (idempotent per id: later calls add roots) */
  register(id: string, roots: THREE.Object3D[]) {
    if (!this.enabled || !roots.length) return;
    const b = new THREE.Box3(), tmp = new THREE.Box3();
    const use = roots.filter((r) => r.userData.farShadow !== "force" && !r.userData.noOcclusion);
    for (const r of use) { r.updateMatrixWorld(true); tmp.setFromObject(r); if (!tmp.isEmpty()) b.union(tmp); }
    if (b.isEmpty() || !use.length) return;
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    // a POI is one cylinder: its horizontal half-diagonal, its full height range
    const box: OccluderBox = { x: c.x, z: c.z, r: Math.hypot(s.x, s.z) * 0.5, bottom: b.min.y, top: b.max.y + 2 };
    let e = this.list.find((x) => x.id === id);
    if (!e) { e = { id, roots: [], box, g: { active: false }, tested: false }; this.list.push(e); }
    else e.box = box;
    for (const r of use) if (!e.roots.includes(r)) { e.roots.push(r); gate(r, e.g); }
    this.last.set(1e9, 0, 0); // re-test on the next frame
  }

  /** per frame, before the render */
  update(cam: THREE.Camera) {
    if (!this.enabled || !this.list.length) return;
    const t = this.terrain(); if (!t) return;
    // the atmos far-shadow bake renders the whole island from the sun inside this frame's scene render: no gates
    if (this.bakeHook === undefined) this.bakeHook = this.scene.getObjectByName("atmos-shadow-bake") ?? undefined;
    if (this.bakeHook && this.bakeHook.visible) { this.release(); this.last.set(1e9, 0, 0); return; }
    const p = cam.position;
    if (p.distanceToSquared(this.last) < 1.5 * 1.5) return;
    this.last.copy(p);
    const h = (x: number, z: number) => t.height(x, z);
    this.hidden.length = 0;
    for (const e of this.list) {
      const rim = Math.hypot(e.box.x - p.x, e.box.z - p.z) - e.box.r;
      const occ = rim > MIN_RIM && poiOccluded(h, p.x, p.y, p.z, e.box);
      if (occ !== e.g.active) e.g.active = occ;
      if (occ) this.hidden.push(e.id);
    }
  }

  /** every POI visible (A/B, bake frames) */
  release() { for (const e of this.list) e.g.active = false; this.hidden.length = 0; }

  setEnabled(on: boolean) { if (!on) this.release(); this.enabled = on; this.last.set(1e9, 0, 0); }

  /** stop gating a POI for good */
  unregister(id: string) {
    const i = this.list.findIndex((x) => x.id === id); if (i < 0) return;
    const e = this.list[i]; e.g.active = false; for (const r of e.roots) ungate(r, e.g); this.list.splice(i, 1);
  }

  info() { return { pois: this.list.length, hidden: this.hidden.slice(), boxes: this.list.map((e) => ({ id: e.id, r: Math.round(e.box.r), top: Math.round(e.box.top) })) }; }
}
