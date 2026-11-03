// Per-frame instanced batches for many identical props (closed chests per rarity + LOD, loot beams / glows / far items).
// The owner walks its members once per frame (drawn? distance band? in view?) and push()es the world matrix of each
// one that should draw → one InstancedMesh draw call per batch, zero per-member draws. Culling is per instance on the
// CPU (the InstancedMesh itself is never frustum-culled). No allocation per frame.
import * as THREE from "three";

export interface BatchOpts { name: string; cap: number; castShadow?: boolean; receiveShadow?: boolean; renderOrder?: number }

const _m = new THREE.Matrix4();

export class InstanceBatch {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private was = 0;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, o: BatchOpts) {
    this.mesh = new THREE.InstancedMesh(geo, mat, o.cap);
    this.mesh.name = o.name;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = o.castShadow ?? true; this.mesh.receiveShadow = o.receiveShadow ?? true;
    this.mesh.userData.castShadow = this.mesh.castShadow;
    this.mesh.userData.noOutline = true;
    this.mesh.renderOrder = o.renderOrder ?? 0;
    this.mesh.visible = false;
  }
  begin() { this.n = 0; }
  push(world: THREE.Matrix4, local?: THREE.Matrix4 | null) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    if (local) { _m.multiplyMatrices(world, local); _m.toArray(arr, this.n * 16); } else world.toArray(arr, this.n * 16);
    this.n++;
  }
  end() {
    const n = this.n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0 || this.was > 0) { this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, Math.max(n, 1) * 16); this.mesh.instanceMatrix.needsUpdate = true; }
    this.was = n;
  }
  get count() { return this.n; }
}

/** true when obj is under `root` and every node on the way up is visible */
export function drawn(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  // a member whose layers were cleared (perf ablation tools, cut-scenes) is not drawn either
  if (obj.layers.mask === 0) return false;
  let o: THREE.Object3D | null = obj;
  while (o) { if (!o.visible) return false; if (o === root) return true; o = o.parent; }
  return false;
}

/** camera frustum + position (refreshed once per frame by the owner) */
export class ViewCull {
  readonly frustum = new THREE.Frustum();
  readonly pos = new THREE.Vector3();
  private pm = new THREE.Matrix4();
  private s = new THREE.Sphere();
  refresh(cam: THREE.Camera) {
    cam.updateMatrixWorld();
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    cam.getWorldPosition(this.pos);
  }
  sees(p: THREE.Vector3, r: number): boolean { this.s.center.copy(p); this.s.radius = r; return this.frustum.intersectsSphere(this.s); }
}
