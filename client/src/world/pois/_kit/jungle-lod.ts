// poi-jungle kit — distance switching + shadow proxies.
//  • distanceSwitch(): per-object visibility by camera distance (to the object's world bounding-sphere centre): detail
//    groups vanish beyond `far`, hi/lo variants swap at `near`. Evaluated every 6th frame (and whenever the camera jumps
//    > 20 m), cost ≈ a few µs. Objects keep their shadows only while visible (three skips invisible casters).
//  • shadowProxy(): an invisible-in-colour mesh (colorWrite/depthWrite off, cheap basic material) made of boxes that
//    CASTS for a detailed structure whose own meshes don't — hundreds of chamfered blocks replaced by a few hundred
//    triangles in both cascades and the static far map.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import type { Box } from "../../../../../shared/world/colliders";

export interface LodItem { o: THREE.Object3D; far?: number; near?: number; center?: THREE.Vector3; /** custom test (wins over far/near) */ test?: (cam: THREE.Vector3, d: number) => boolean }
export function distanceSwitch(ctx: WorldCtx, items: LodItem[]) {
  const cs = items.map((it) => {
    if (it.center) return it.center.clone();
    const b = new THREE.Box3(); it.o.updateMatrixWorld(true);
    const im = it.o as THREE.InstancedMesh;
    if (im.isInstancedMesh) { if (!im.boundingBox) im.computeBoundingBox(); b.copy(im.boundingBox!).applyMatrix4(im.matrixWorld); }  // instance bounds, not the prototype's
    else b.setFromObject(it.o, true);
    return b.isEmpty() ? it.o.getWorldPosition(new THREE.Vector3()) : b.getCenter(new THREE.Vector3());
  });
  let frame = 0; const last = new THREE.Vector3(1e9, 0, 0), cam = new THREE.Vector3();
  const apply = () => {
    cam.copy(ctx.camera.position); last.copy(cam);
    items.forEach((it, i) => { const d = cam.distanceTo(cs[i]); it.o.visible = it.test ? it.test(cam, d) : d < (it.far ?? Infinity) && d >= (it.near ?? 0); });
  };
  apply();
  ctx.onUpdate(() => { if (++frame % 6 === 0 || ctx.camera.position.distanceToSquared(last) > 400) apply(); });
}

/** one merged box mesh from collider boxes (sim yaw → three yaw) + extra boxes; casts only */
export function shadowProxy(boxes: Box[], name: string): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2); g.deleteAttribute("uv"); g.deleteAttribute("normal");
    e.set(0, -(b.yaw ?? 0), b.pitch ?? 0, "YZX"); q.setFromEuler(e); m.compose(new THREE.Vector3(...b.c), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m); geos.push(g.index ? g.toNonIndexed() : g);
  }
  const n = geos.reduce((s, g) => s + g.attributes.position.count, 0), pos = new Float32Array(n * 3);
  let o = 0; for (const g of geos) { pos.set(g.attributes.position.array as Float32Array, o); o += g.attributes.position.count * 3; g.dispose(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = false;
  mesh.userData.castShadow = true; mesh.userData.farShadow = true; mesh.userData.receiveShadow = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = -10;
  return mesh;
}
/** stop every mesh under `root` from casting (except names matching `keep`) — the proxy casts for them */
export function noCast(root: THREE.Object3D, keep?: RegExp) {
  root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; if (keep && keep.test(m.name) ) return; let p: THREE.Object3D | null = m; while (p) { if (keep && keep.test(p.name)) return; p = p.parent; } m.castShadow = false; m.userData.castShadow = false; m.userData.farShadow = false; });
}
