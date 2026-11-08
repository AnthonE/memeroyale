// The six guns are oneshot's models (public/assets/weapons/<id>.glb, from tools/models/import_oneshot.py), fitted with
// oneshot's own numbers (its crates/client/src/look/guns.rs `GUNS` rows): the anchors are known before any model loads
// (gunFit), the meshes arrive once (loadGunModels) and become the same GunSpec the procedural guns used to build.
//
// oneshot's model frame: barrel along +Y, top toward +Z, stock at y = 0, held on the axis x = z = 0 at `grip` of the
// way up. Gun space here: −Z forward, +Y up, +X right, origin where the trigger hand sits (guns/common.ts). The turn
// between them is −90° about X: oneshot (x, y, z) → (x, z, −y).
import * as THREE from "three";
import type { WeaponId } from "../../../../shared/world/map";
import type { GunSpec } from "./types";

/** oneshot's fit row: model length stock→muzzle, grip as a share of it, the muzzle's rise over the axis, the other
 *  hand's share of the barrel past the grip and its depth under the axis, the model's scale; and its file here */
interface Fit { file: string; height: number; grip: number; rise: number; fore: number; under: number; scale: number; long: boolean }
export const FITS: Record<WeaponId, Fit> = {
  pistol: { file: "pistol", height: 0.305, grip: 0.1705, rise: 0.0404, fore: 0.6, under: -0.0044, scale: 1.0, long: false },
  smg: { file: "smg", height: 0.55, grip: 0.4182, rise: 0.0471, fore: 0.6, under: 0.0128, scale: 1.0, long: true },
  ar: { file: "ar", height: 0.78, grip: 0.4487, rise: 0.0397, fore: 0.3721, under: 0.0516, scale: 1.0, long: true },
  shotgun: { file: "shotgun", height: 0.95, grip: 0.2947, rise: 0.0643, fore: 0.6, under: 0.0109, scale: 0.96, long: true },
  sniper: { file: "sniper", height: 1.25, grip: 0.24, rise: 0.0446, fore: 0.6, under: 0.0127, scale: 0.72, long: true },
  rocket: { file: "rocket", height: 1.054, grip: 0.4317, rise: 0.104, fore: 0.4541, under: 0.03, scale: 0.96, long: true },
};
/** how far up the barrel the other hand goes at most, m (oneshot's BODY_FORE_MAX_M: past it the arm is straight) */
const FORE_MAX_M = 0.3;
const DIR = "assets/weapons/";

/** a gun's anchors in gun space, with no model loaded */
export function gunFit(id: WeaponId) {
  const f = FITS[id], s = f.scale;
  const along = Math.min(f.height * (1 - f.grip) * s * f.fore, FORE_MAX_M);
  return {
    length: f.height * s,
    gripAnchor: new THREE.Vector3(0, 0, 0),
    muzzle: new THREE.Vector3(0, f.rise * s, -f.height * (1 - f.grip) * s),
    foreAnchor: f.long ? new THREE.Vector3(0, -f.under * s, -along) : null,
  };
}

/** paint each vertex the base colour under its UV (the held guns and the far loot are one vertex-coloured mesh each:
 *  weapons/held.ts bake, loot.ts) — the first person keeps the textured material, which ignores these */
function bakeVertexColours(g: THREE.BufferGeometry, map: THREE.Texture | null) {
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined, n = g.attributes.position.count;
  const col = new Float32Array(n * 3).fill(0.6);
  const img = map?.image as CanvasImageSource & { width: number; height: number } | undefined;
  if (uv && img && typeof document !== "undefined") {
    const W = 256, c = document.createElement("canvas"); c.width = c.height = W;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, W, W);
    const px = x.getImageData(0, 0, W, W).data, tmp = new THREE.Color();
    const flipY = map!.flipY;
    for (let i = 0; i < n; i++) {
      const u = uv.getX(i) - Math.floor(uv.getX(i)), v = uv.getY(i) - Math.floor(uv.getY(i));
      const k = (Math.min(W - 1, Math.floor((flipY ? 1 - v : v) * W)) * W + Math.min(W - 1, Math.floor(u * W))) * 4;
      tmp.setRGB(px[k] / 255, px[k + 1] / 255, px[k + 2] / 255, THREE.SRGBColorSpace);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

/** the rarity gem: a small glowing stone on the right side of the receiver, its own pivot (loot.ts / held.ts tint it) */
function accent(at: THREE.Vector3): THREE.Group {
  const g = new THREE.Group(); g.name = "accent";
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.6, roughness: 0.25 }));
  gem.scale.set(1, 0.6, 1.3); gem.position.copy(at);
  g.add(gem);
  return g;
}

/** a model posed into gun space: grip at the origin, −Z forward */
function pose(scene: THREE.Object3D, f: Fit): THREE.Group {
  const turn = new THREE.Group(); turn.rotation.x = -Math.PI / 2;
  const scaler = new THREE.Group(); scaler.scale.setScalar(f.scale); turn.add(scaler);
  const model = scene.clone(true); model.position.y = -f.height * f.grip; scaler.add(model);
  const root = new THREE.Group(); root.add(turn);
  return root;
}

/** the gun from its loaded model */
function specOf(id: WeaponId, gltf: { scene: THREE.Object3D }, round: { scene: THREE.Object3D } | null): GunSpec {
  const f = FITS[id], fit = gunFit(id);
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!m.geometry.attributes.color) bakeVertexColours(m.geometry, mat.map ?? null);
    m.castShadow = true; m.receiveShadow = true;
  });
  const root = pose(gltf.scene, f);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  // the gem on the receiver's right flank, a little ahead of the grip
  root.add(accent(new THREE.Vector3(box.max.x * 0.85, fit.muzzle.y * 0.6, -0.04)));
  const pivots: Record<string, THREE.Group> = { accent: root.children[1] as THREE.Group };
  // the rocket: its round sits in the front of the tube (the reload's warhead, and the in-flight rocket: fx.ts)
  if (id === "rocket" && round) {
    const w = new THREE.Group(); w.name = "rocket";
    const r = pose(round.scene, { ...f, height: 0.6, grip: 0.5, scale: 0.55 });
    w.add(r); w.position.copy(fit.muzzle).add(new THREE.Vector3(0, -0.01, 0.12));
    root.add(w); pivots.rocket = w;
  }
  const meshes: THREE.Mesh[] = []; let tris = 0;
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes.push(m); tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
  return {
    id, root, meshes, tris, pivots, ...fit,
    sightY: box.max.y, fwd: new THREE.Vector3(0, 0, -1),
  };
}

type ModelLoader = (path: string) => Promise<{ scene: THREE.Object3D }>;
let loading: Promise<Map<WeaponId, GunSpec>> | null = null;
/** every gun's model, loaded once (the weapons kit awaits this before it builds anything with a gun in it) */
export function loadGunModels(load: ModelLoader): Promise<Map<WeaponId, GunSpec>> {
  return (loading ??= (async () => {
    const ids = Object.keys(FITS) as WeaponId[];
    const [models, round] = await Promise.all([Promise.all(ids.map((id) => load(DIR + FITS[id].file + ".glb"))), load(DIR + "rocket-round.glb")]);
    const out = new Map<WeaponId, GunSpec>();
    ids.forEach((id, i) => out.set(id, specOf(id, models[i], round)));
    return out;
  })());
}
