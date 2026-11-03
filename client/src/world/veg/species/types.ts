// A species = one plant variant: LOD0 / LOD1 geometry per material part + metadata for scatter, LOD, impostors.
import type * as THREE from "three";
import type { FoliageMaterials } from "../foliage-material";
import type { VegKind } from "../../../../../shared/world/veg-scatter";

export interface SpeciesPart {
  name: string;
  mats: FoliageMaterials;
  lod0: THREE.BufferGeometry;
  lod1: THREE.BufferGeometry;
  /** false = this part never casts (e.g. lianas, small fruit) even when the species does */
  shadow?: boolean;
  /** geometry baked into the impostor atlas instead of lod0 (palms bake their filled far fronds: modelled leaflets
   * minify to wisps at aerial distances — the palm stars must read solid) */
  bake?: THREE.BufferGeometry;
}

export interface Species {
  id: string;
  kind: VegKind;
  variant: number;
  parts: SpeciesPart[];
  /** natural height (m) and horizontal radius of the whole plant, for culling / impostor framing */
  height: number;
  radius: number;
  /** centre of the impostor bounding sphere (object space) and its radius */
  center: THREE.Vector3;
  boundR: number;
  /** LOD switch distances (m): full mesh < lod0, simplified < lod1, impostor beyond (if `impostor`) else culled */
  lod0: number;
  lod1: number;
  impostor: boolean;
  /** LOD0 casts shadows (trees, palms, banana, bamboo, mangroves, logs); LOD1 / impostors / detail never do */
  shadow?: boolean;
}
