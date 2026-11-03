// CANOPY LINE — geometry helpers (no materials: importable by node tools / benches).
import * as THREE from "three";
import { M, col } from "../_kit/town-geo";
import type { Bins } from "./kit";

const _v = new THREE.Vector3();
/** a round log between two points (bark or plank-textured), metre UVs; radius r0 → r1 */
export function logGeo(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 8, open = false): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);   // (open = no end caps where nothing sees them)
  const uv = g.attributes.uv as THREE.BufferAttribute, circ = Math.PI * (r0 + r1);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / 1.6, uv.getY(i) * len / 1.6);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v.copy(b).sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
/** box between two points (a beam): width w (horizontal side), height h */
export function beamM(a: THREE.Vector3, b: THREE.Vector3): { m: THREE.Matrix4; len: number } {
  const d = _v.copy(b).sub(a), len = d.length();
  const yaw = Math.atan2(-d.z, d.x), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, yaw, pitch, "YZX")).setPosition(a.clone().add(b).multiplyScalar(0.5));
  return { m, len };
}
/** smooth tube through points (ropes, cables): n sides */
export function ropeGeo(pts: THREE.Vector3[], r: number, sides = 4, segsPer = 1): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.3);
  const g = new THREE.TubeGeometry(curve, Math.max(2, Math.round((pts.length - 1) * segsPer)), r, sides, false);
  return g;
}
/** parabola points (a → b, `sag` dip at mid-span) */
export function sagPts(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0))); }
  return out;
}
/** hanging-rope lashing ring (3 turns) around a post */
export function lashing(bins: Bins, x: number, y: number, z: number, r: number) {
  // one fat wrap (reads as 3 turns at gameplay distance; 3 separate tori were the POI's heaviest rope cost)
  bins.rope.add(new THREE.TorusGeometry(r + 0.02, 0.035, 3, 6), M(x, y + 0.04, z, 0, Math.PI / 2, 0), col("#c9a86a", 0.95));
}
/** plain indexed BufferGeometry from arrays (position, normal, uv) */
export function geoFrom(pos: number[], nor: number[], uv: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
