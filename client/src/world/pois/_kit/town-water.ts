// poi-town still water (pool, fountain basin): turquoise, glossy, two scrolling ripple normal layers. The lagoon/sea
// itself belongs to the water area; this is only for enclosed basins the towns own.
import * as THREE from "three";
import { rippleTexture } from "./town-tex";

let ripples: THREE.DataTexture | null = null;
export function poolWaterMaterial(color = "#2fc4cf", opacity = 0.78): THREE.MeshStandardMaterial {
  ripples ??= rippleTexture();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0.0, transparent: true, opacity, normalMap: ripples, envMapIntensity: 1.4, depthWrite: false, name: "town:water" });
  m.normalScale.set(0.35, 0.35);
  return m;
}
/** call from ctx.onUpdate to animate every pool material */
export function animateWater(mats: THREE.MeshStandardMaterial[], t: number) {
  for (const m of mats) { if (m.normalMap) { m.normalMap.offset.set(t * 0.02, t * 0.013); } }
}
