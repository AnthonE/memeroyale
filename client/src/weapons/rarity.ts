// Rarity accents: every gun carries a small "accent" pivot (gem / stripe, authored white + emissive by the guns piece);
// the kit tints it per rarity with one shared glowing material per rarity (no per-gun materials).
import * as THREE from "three";
import type { Rarity } from "../../../shared/world/map";

export const RARITY_ACCENT: Record<Rarity, string> = { common: "#c9ced4", uncommon: "#63d63a", rare: "#3d9bff", epic: "#b565ff", legendary: "#ffc21a", mythic: "#ff3a6a" };
const mats = new Map<Rarity, THREE.MeshStandardMaterial>();
export function accentMaterial(r: Rarity): THREE.MeshStandardMaterial {
  let m = mats.get(r);
  if (!m) {
    const c = new THREE.Color(RARITY_ACCENT[r]);
    m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: r === "common" ? 0.25 : 1.6, roughness: 0.25, metalness: 0.1 });
    m.name = `wpn-accent-${r}`;
    mats.set(r, m);
  }
  return m;
}
export function tintAccent(meshes: THREE.Mesh[], r: Rarity) { for (const m of meshes) m.material = accentMaterial(r); }

// a MYTHIC gun's signature finish: every part of the gun pulled toward the mythic's own colour
// (one cloned material per base material × colour, cached — a handful in a match), with a faint glow of it; the accent
// keeps the mythic tier's hot accent. `color` null restores the stock finish (the meshes remember their own material).
const skins = new Map<string, THREE.Material>();
// (perf) the stock material lives in a WeakMap, NOT in userData: the viewmodel hangs under the camera, and
// any Object3D.copy / clone JSON-serialises userData — a Material there was toJSON'd with every texture as a PNG data URL
// (the Plantation's camera clone did that every few metres: 1.5–5 ms a frame)
const baseMats = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
export function mythicSkin(meshes: THREE.Mesh[], color: string | null) {
  for (const m of meshes) {
    let base = baseMats.get(m); if (!base) baseMats.set(m, base = m.material);
    if (!color || Array.isArray(base)) { m.material = base; continue; }
    const key = base.uuid + color;
    let s = skins.get(key);
    if (!s) {
      const c = new THREE.Color(color), n = base.clone() as THREE.MeshStandardMaterial;
      if (n.color) n.color.lerp(c, 0.58);
      if (n.emissive) { n.emissive.copy(c).multiplyScalar(0.07); n.emissiveIntensity = 1; }
      if (typeof n.metalness === "number") n.metalness = Math.min(1, n.metalness + 0.25);
      if (typeof n.roughness === "number") n.roughness = Math.max(0.18, n.roughness * 0.7);
      n.name = `${base.name}:mythic`;
      skins.set(key, s = n);
    }
    m.material = s;
  }
}
