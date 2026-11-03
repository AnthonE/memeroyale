// poi-jungle kit — hero meshes (processed GLBs in public/assets/pois/jungle/hero/). Each GLB is
// centred on XZ, base at y=0, unit height. `hero()` places a shared-geometry instance at a world transform with an
// optional material override (our stone material with moss/wetness) or the GLB's baked PBR (kept when it reads well).
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";

const DIR = "assets/pois/jungle/hero/";
export type HeroId = "gorilla-head" | "gorilla-head-lod" | "totem" | "totem-lod" | "guardian";

interface Baked { parts: Array<{ geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }> }
const cache = new Map<string, Promise<Baked>>();

function load(ctx: WorldCtx, id: HeroId): Promise<Baked> {
  let p = cache.get(id);
  if (!p) {
    p = ctx.assets.model(`${DIR}${id}.glb`).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: Baked["parts"] = [];
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        geo.computeBoundingBox(); geo.computeBoundingSphere();
        parts.push({ geo, mat: mesh.material as THREE.MeshStandardMaterial });
      });
      return { parts };
    });
    cache.set(id, p);
  }
  return p;
}

export interface HeroOpts {
  height: number;
  /** yaw radians; the processed meshes face -Z (three.js forward) when `yaw` = 0 */
  yaw?: number;
  material?: THREE.Material | ((baked: THREE.MeshStandardMaterial) => THREE.Material);
  name?: string;
  /** adjust the GLB's baked material (roughness etc.) — used when no override is given */
  tune?: (m: THREE.MeshStandardMaterial) => void;
  /** fake bounce: the albedo map re-used as emissive at this strength (shaded stone stays readable) */
  lift?: number;
  /** material cache key suffix (different tunes of the same mesh) */
  variant?: string;
}

export async function hero(ctx: WorldCtx, id: HeroId, x: number, y: number, z: number, o: HeroOpts): Promise<THREE.Group> {
  const baked = await load(ctx, id);
  const root = new THREE.Group();
  root.name = o.name ?? `hero:${id}`;
  for (const part of baked.parts) {
    let mat: THREE.Material;
    if (typeof o.material === "function") mat = o.material(part.mat);
    else if (o.material) mat = o.material;
    else {
      const key = `__tuned_${id}_${o.variant ?? ""}`;
      const ud = part.mat.userData as Record<string, THREE.MeshStandardMaterial>;
      if (!ud[key]) {
        const bm = part.mat.clone(); bm.roughness = Math.max(bm.roughness, 0.85); bm.metalness = 0; bm.envMapIntensity = 0.5; o.tune?.(bm);
        if (o.lift && bm.map) { bm.emissiveMap = bm.map; bm.emissive = bm.color.clone().multiplyScalar(o.lift); }
        ud[key] = bm;
      }
      mat = ud[key];
    }
    const m = new THREE.Mesh(part.geo, mat);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  root.position.set(x, y, z);
  root.rotation.y = o.yaw ?? 0;
  root.scale.setScalar(o.height);
  root.updateMatrixWorld(true);
  return root;
}

/** a hero with a distance LOD (`<id>-lod` GLB beyond `lodDist` metres); same options as hero() */
export async function heroLOD(ctx: WorldCtx, id: "totem" | "gorilla-head", x: number, y: number, z: number, o: HeroOpts & { lodDist: number }): Promise<THREE.Object3D> {
  const [hi, lo] = await Promise.all([hero(ctx, id, 0, 0, 0, { ...o, yaw: 0 }), hero(ctx, `${id}-lod` as HeroId, 0, 0, 0, { ...o, yaw: 0 })]);
  const lod = new THREE.LOD(); lod.name = o.name ?? `hero-lod:${id}`;
  lod.addLevel(hi, 0); lod.addLevel(lo, o.lodDist);
  lod.position.set(x, y, z); lod.rotation.y = o.yaw ?? 0; lod.updateMatrixWorld(true);
  return lod;
}
