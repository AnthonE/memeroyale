// Veg studio (dev only, built when ?view=veg-*): a flat grass platform out at sea (x = 1500, z = 1500) with every
// species lined up, a jungle patch and a palm grove — stable view cameras that do not depend on the terrain area's
// island. Views: veg-studio (front-lit line-up), veg-studio-back (back-lit), veg-palm, veg-tree,
// veg-under (understory close-up), veg-grove (palm grove + jungle patch from the side).
import * as THREE from "three";
import type { CamSpec } from "../../engine/views";
import type { VegKind } from "../../../../shared/world/veg-scatter";
import { VARIANTS } from "../../../../shared/world/veg-scatter";
import type { Species } from "./species/types";
import { mulberry32 } from "../../../../shared/world/noise";

export const STUDIO = { x: 1500, z: 1500, y: 1.5, r: 90 };
const S = STUDIO;

export const STUDIO_VIEWS: Record<string, CamSpec> = {
  "veg-studio": { pos: [S.x - 4, S.y + 3.2, S.z - 40], target: [S.x - 4, S.y + 5, S.z], fov: 60, note: "every species, sun behind the camera" },
  "veg-studio-back": { pos: [S.x - 4, S.y + 2.5, S.z + 40], target: [S.x - 4, S.y + 6, S.z], fov: 60, note: "line-up, back-lit" },
  "veg-palm": { pos: [S.x - 30, S.y + 4.5, S.z - 14], target: [S.x - 30, S.y + 8, S.z], fov: 55, note: "hero palm close-up" },
  // the five jungle-tree silhouettes + 2 bushes + a mangrove in a row south of the line-up (z = S.z − 55)
  "veg-trees": { pos: [S.x + 40, S.y + 2.2, S.z - 95], target: [S.x + 40, S.y + 8, S.z - 55], fov: 62, note: "tree row, eye level, 40 m" },
  "veg-trees-close": { pos: [S.x + 18, S.y + 1.8, S.z - 70], target: [S.x + 20, S.y + 9, S.z - 55], fov: 70, note: "one tree, eye level, 15 m" },
  "veg-trees-top": { pos: [S.x + 40, S.y + 45, S.z - 85], target: [S.x + 40, S.y, S.z - 55], fov: 55, note: "tree row from above" },
  "veg-trees-side": { pos: [S.x - 20, S.y + 6, S.z - 55], target: [S.x + 40, S.y + 7, S.z - 55], fov: 55, note: "tree row end-on (90° azimuth)" },
  "veg-trees-far": { pos: [S.x + 40, S.y + 3, S.z - 170], target: [S.x + 40, S.y + 8, S.z - 55], fov: 40, note: "tree row at 115 m (impostors)" },
  "veg-tree": { pos: [S.x + 22, S.y + 2, S.z - 26], target: [S.x + 24, S.y + 9, S.z + 22], fov: 60, note: "jungle tree from below-side" },
  "veg-under": { pos: [S.x + 4, S.y + 1.6, S.z - 8], target: [S.x + 6, S.y + 1.0, S.z], fov: 55, note: "understory close-up" },
  "veg-grove": { pos: [S.x - 70, S.y + 12, S.z - 70], target: [S.x + 10, S.y + 4, S.z + 30], fov: 50, note: "grove + jungle patch, high-ish" },
};

export function buildStudio(scene: THREE.Scene, getSpecies: (k: VegKind, v: number) => Species, add: (k: VegKind, v: number, x: number, y: number, z: number, yaw: number, s: number) => void) {
  const g = new THREE.CylinderGeometry(S.r, S.r + 4, S.y + 6, 64, 1);
  g.translate(S.x, S.y - (S.y + 6) / 2, S.z);
  const m = new THREE.MeshStandardMaterial({ color: 0x5f8f3a, roughness: 0.95 });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = "veg-studio-ground"; mesh.receiveShadow = true;
  scene.add(mesh);
  const Y = S.y;
  // line-up along x at z = S.z (every kind, every variant)
  const kinds: VegKind[] = ["palm", "palm-leaning", "jungle-tree", "bush", "banana-plant", "monstera", "bamboo", "mangrove", "log", "fern", "flowers", "groundcover", "grass"];
  let x = S.x - 80;
  for (const k of kinds) for (let v = 0; v < VARIANTS[k]; v++) {
    const sp = getSpecies(k, v);
    const w = Math.max(1.2, Math.min(sp.radius, 9));
    x += w + 0.8;
    add(k, v, x, Y, S.z, k === "palm-leaning" ? -Math.PI / 2 : 0.3 * v, 1);
    x += w + 0.8;
  }
  // tree row (veg-trees*): 5 jungle-tree silhouettes 20 m apart, then bushes + a mangrove
  for (let v = 0; v < 5; v++) add("jungle-tree", v, S.x + v * 20, Y, S.z - 55, 0.7 * v, 1);
  add("bush", 0, S.x + 96, Y, S.z - 58, 0, 1); add("bush", 1, S.x + 100, Y, S.z - 52, 1, 1); add("bush", 2, S.x + 104, Y, S.z - 58, 2, 1);
  add("mangrove", 0, S.x + 114, Y, S.z - 55, 0, 1);
  // palm grove (west) and jungle patch (east, behind the line-up)
  const r = mulberry32(77);
  for (let i = 0; i < 16; i++) add("palm", i % 3, S.x - 60 + r() * 40, Y, S.z + 12 + r() * 30, r() * 6.28, 0.9 + r() * 0.3);
  for (let i = 0; i < 14; i++) add("jungle-tree", i % 3, S.x + 10 + r() * 60, Y, S.z + 16 + r() * 45, r() * 6.28, 0.9 + r() * 0.25);
  for (let i = 0; i < 40; i++) add(["bush", "banana-plant", "monstera", "fern"][i % 4] as VegKind, i % 2, S.x + 5 + r() * 70, Y, S.z + 8 + r() * 50, r() * 6.28, 0.9 + r() * 0.3);
  // understory close-up patch in front of the line-up (veg-under)
  for (let i = 0; i < 60; i++) add(["groundcover", "fern", "flowers", "grass"][i % 4] as VegKind, i % 2, S.x + r() * 14, Y, S.z - 6 + r() * 5, r() * 6.28, 0.8 + r() * 0.4);
  add("banana-plant", 0, S.x + 9, Y, S.z - 2, 1.2, 1.1);
  add("monstera", 0, S.x + 3, Y, S.z - 3, 0.4, 1.1);
  add("log", 0, S.x + 6, Y, S.z - 4.5, 0.2, 1);
}
