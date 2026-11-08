// Third-person held weapons for up to 50 kongs: each gun collapsed into ONE vertex-coloured mesh (one draw call) with
// a THREE.LOD chain (full → clustered ~35% → clustered ~10%) so a 50-kong fight costs ≤ 50 small draws.
// Geometry is built once per weapon id and shared by every kong; only the rarity accent differs (a tiny second mesh).
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { Rarity, WeaponId } from "../../../shared/world/map";
import { gunFit, gunSpec } from "./guns/index";
import { accentMaterial } from "./rarity";
import { camoMaterial, MYTHIC_TINT } from "./camo";

const isAccent = (o: THREE.Object3D) => o.name === "accent" || o.name.endsWith("/accent");
interface HeldGeo { lods: Array<{ geo: THREE.BufferGeometry; dist: number }>; accent: THREE.BufferGeometry | null; grip: THREE.Vector3 }
const cache = new Map<WeaponId, HeldGeo>();
let heldMat: THREE.MeshStandardMaterial | null = null;
function material() {
  // vertex colours carry the palette; one glossy-ish toy material for everything (fine at third-person distances)
  heldMat ??= Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 }), { name: "wpn-held" });
  return heldMat;
}
/** the held guns' camo twin (the generic mythic tint: the wire carries the tier only) */
const camoHeld = () => camoMaterial(material(), MYTHIC_TINT)!;
/** swap a held gun (createHeld's LOD) between its stock material and the mythic camo */
export function setHeldCamo(o: THREE.Object3D, on: boolean) {
  const lod = o as THREE.LOD; if (!lod.isLOD) return;
  const m = on ? camoHeld() : material();
  for (const l of lod.levels) { const mesh = l.object as THREE.Mesh; if (mesh.isMesh && mesh.material !== m) mesh.material = m; }
}

/** bake every mesh under root (except the accent pivot) into one non-indexed-safe geometry with position/normal/color */
export function bake(root: THREE.Object3D, keep: (inAccent: boolean) => boolean): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const list: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.outline || !m.visible || (m as unknown as THREE.Sprite).isSprite) return;
    let acc = false;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (isAccent(p)) acc = true;
    if (!keep(acc)) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    let g = m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const n = g.attributes.position.count;
    if (!g.attributes.color || m.userData.lodColor) {
      const c = m.userData.lodColor ? new THREE.Color(m.userData.lodColor as string) : (mat.color ?? new THREE.Color(1, 1, 1)).clone();
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    } else if (mat.color && (mat.color.r !== 1 || mat.color.g !== 1 || mat.color.b !== 1)) {
      const col = g.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) col.setXYZ(i, col.getX(i) * mat.color.r, col.getY(i) * mat.color.g, col.getZ(i) * mat.color.b);
    }
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.index) g = g.toNonIndexed();
    list.push(g);
  });
  if (!list.length) return null;
  return mergeGeometries(list, false);
}

/** vertex-clustering decimation: snap to a grid of `cell` metres, merge, drop degenerate triangles */
export function cluster(src: THREE.BufferGeometry, cell: number): THREE.BufferGeometry {
  const pos = src.attributes.position as THREE.BufferAttribute, col = src.attributes.color as THREE.BufferAttribute;
  // numeric cell keys (a string map made the boot-time LOD bakes several seconds slower)
  const key = new Map<number, number>();
  const sumP: number[] = [], sumC: number[] = [], cnt: number[] = [];
  const remap = new Int32Array(pos.count);
  const G = 4096, H = 2048;
  for (let i = 0; i < pos.count; i++) {
    const kx = Math.round(pos.getX(i) / cell) + H, ky = Math.round(pos.getY(i) / cell) + H, kz = Math.round(pos.getZ(i) / cell) + H;
    const k = (kx * G + ky) * G + kz;
    let id = key.get(k);
    if (id === undefined) { id = cnt.length; key.set(k, id); sumP.push(0, 0, 0); sumC.push(0, 0, 0); cnt.push(0); }
    sumP[id * 3] += pos.getX(i); sumP[id * 3 + 1] += pos.getY(i); sumP[id * 3 + 2] += pos.getZ(i);
    sumC[id * 3] += col.getX(i); sumC[id * 3 + 1] += col.getY(i); sumC[id * 3 + 2] += col.getZ(i);
    cnt[id]++; remap[i] = id;
  }
  const tris: number[] = [];
  const seen = new Set<number>();
  const N = cnt.length;
  for (let t = 0; t < pos.count; t += 3) {
    let a = remap[t], b = remap[t + 1], c = remap[t + 2];
    if (a === b || b === c || a === c) continue;
    let x: number;
    if (a > b) { x = a; a = b; b = x; } if (b > c) { x = b; b = c; c = x; } if (a > b) { x = a; a = b; b = x; }
    const s = (a * N + b) * N + c;
    if (seen.has(s)) continue; seen.add(s);
    tris.push(remap[t], remap[t + 1], remap[t + 2]);
  }
  // un-index so each triangle gets flat-ish normals from its own facets (clusters are coarse; smooth by merged normals)
  const P = new Float32Array(tris.length * 3), Cc = new Float32Array(tris.length * 3);
  tris.forEach((id, i) => {
    const n = cnt[id];
    P[i * 3] = sumP[id * 3] / n; P[i * 3 + 1] = sumP[id * 3 + 1] / n; P[i * 3 + 2] = sumP[id * 3 + 2] / n;
    Cc[i * 3] = sumC[id * 3] / n; Cc[i * 3 + 1] = sumC[id * 3 + 1] / n; Cc[i * 3 + 2] = sumC[id * 3 + 2] / n;
  });
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(P, 3));
  g.setAttribute("color", new THREE.BufferAttribute(Cc, 3));
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return g;
}

function heldGeo(id: WeaponId): HeldGeo {
  let h = cache.get(id);
  if (h) return h;
  const spec = gunSpec(id);
  const full = bake(spec.root, (a) => !a) ?? new THREE.BoxGeometry(0.1, 0.1, 0.4);
  const acc = bake(spec.root, (a) => a);
  const fullIdx = mergeVertices(full, 1e-5);
  const mid = cluster(full, 0.012), far = cluster(full, 0.035);
  h = { lods: [{ geo: fullIdx, dist: 0 }, { geo: mid, dist: 14 }, { geo: far, dist: 45 }], accent: acc ?? null, grip: spec.gripAnchor.clone() };
  for (const l of h.lods) l.geo.computeBoundingSphere();
  cache.set(id, h);
  return h;
}

/** third-person scale: oneshot's guns are life size, and so is Triple T's hand (the kong's huge fist needed 1.4) */
export const HELD_SCALE = 1.0;
/** muzzle point of a held weapon in its own (socket) space, incl. HELD_SCALE — for kong muzzle flashes / tracers */
export function heldMuzzle(id: WeaponId, out = new THREE.Vector3()): THREE.Vector3 {
  const s = gunFit(id);
  return out.copy(s.muzzle).sub(s.gripAnchor).multiplyScalar(HELD_SCALE);
}

/** a held weapon for a kong's hand socket: origin at the trigger-hand palm (GunSpec.gripAnchor), −Z = muzzle */
export function createHeld(id: WeaponId, rarity: Rarity): THREE.Object3D {
  const h = heldGeo(id);
  const lod = new THREE.LOD(); lod.name = `held:${id}`;
  lod.scale.setScalar(HELD_SCALE);
  for (const l of h.lods) {
    const m = new THREE.Mesh(l.geo, rarity === "mythic" ? camoHeld() : material());
    m.position.copy(h.grip).negate();
    m.castShadow = true; m.receiveShadow = true;
    lod.addLevel(m, l.dist);
  }
  if (h.accent) {
    const a = new THREE.Mesh(h.accent, accentMaterial(rarity));
    a.name = "held-accent";
    (lod.levels[0].object as THREE.Mesh).add(a);
  }
  return lod;
}
