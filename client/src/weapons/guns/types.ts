import type * as THREE from "three";
import type { Built } from "../lib/builder";
import type { WeaponId } from "../../../../shared/world/map";

export interface GunSpec extends Built {
  id: WeaponId;
  /** muzzle point in gun space */
  muzzle: THREE.Vector3;
  /** overall length (m), for staging */
  length: number;
  /** where the trigger hand's palm sits */
  gripAnchor: THREE.Vector3;
  /** where the support hand holds (null = one-handed) */
  foreAnchor: THREE.Vector3 | null;
  /** sight line height (for scope raise) */
  sightY: number;
  fwd: THREE.Vector3;
  /** iron-sight line (gun space): the front aperture centre and the point just above the rear sight the eye looks over
   *  — ADS aligns this line with the view axis */
  sightLine?: { front: THREE.Vector3; rear: THREE.Vector3 };
}
