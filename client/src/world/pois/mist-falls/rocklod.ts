// poi-jungle — the LOD decision for a rockLOD3 field, by the camera's distance to each cell's BOUNDS (not to the
// centre of a 144 m far cell: with that, a kong standing against a gorge wall still saw the coarse mid prototypes — the
// drawn rock then was not its collider — parity). Rules (no holes, no doubles):
//   hi  : own cell < s1
//   mid : own cell ≥ s1 AND its far cell (the union of its members) < s2
//   far : far cell ≥ s2 (every member ≥ s2) and < authored/support horizon
import * as THREE from "three";
import type { LodItem } from "../_kit/jungle-lod";

export function boundsLods(groups: THREE.Group[], s1: number, s2: number, farCell: number, farMax = Infinity): LodItem[] {
  const [hi, mid, far] = groups, bb = (o: THREE.Object3D) => { const im = o as THREE.InstancedMesh; o.updateMatrixWorld(true); if (!im.boundingBox) im.computeBoundingBox(); return im.boundingBox!.clone().applyMatrix4(o.matrixWorld); };
  const cellOf = (b: THREE.Box3) => { const c = b.getCenter(new THREE.Vector3()); return `${Math.floor(c.x / farCell)},${Math.floor(c.z / farCell)}`; };
  const fars = new Map<string, THREE.Box3>(), own = new Map<string, THREE.Box3>();
  const keyOf = (o: THREE.Object3D) => o.name.split("|")[1] ?? o.name;
  const limit = Math.max(farMax, far.userData.rockSupportMax ?? 0);
  // a merged cell mesh (rockmerge.ts) carries the world boxes of the instanced sets it replaced: the
  // own / far cell bounds — and so every switch — are exactly the instanced sets' (all its boxes share one far cell)
  const boxes = (o: THREE.Object3D): THREE.Box3[] => (o.userData.lodBoxes as THREE.Box3[] | undefined) ?? [bb(o)];
  for (const g of [hi, mid, far]) for (const o of g.children) for (const b of boxes(o)) { const k = cellOf(b); (fars.get(k) ?? fars.set(k, new THREE.Box3()).get(k)!).union(b); if (g !== far) (own.get(keyOf(o)) ?? own.set(keyOf(o), new THREE.Box3()).get(keyOf(o))!).union(b); }
  const items: LodItem[] = [];
  for (const o of hi.children) { const b = own.get(keyOf(o))!; items.push({ o, test: (c) => b.distanceToPoint(c) < s1 }); }
  for (const o of mid.children) { const b = own.get(keyOf(o))!, f = fars.get(cellOf(boxes(o)[0]))!; items.push({ o, test: (c) => b.distanceToPoint(c) >= s1 && f.distanceToPoint(c) < s2 }); }
  for (const o of far.children) { const f = fars.get(cellOf(bb(o)))!; items.push({ o, test: (c) => { const d = f.distanceToPoint(c); return d >= s2 && d < limit; } }); }
  return items;
}
