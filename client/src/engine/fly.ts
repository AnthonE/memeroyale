// Free-fly camera for exploration (?fly). WASD/QE move, Shift = fast, drag/pointer-lock to look.
import * as THREE from "three";

export function enableFly(cam: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, onUpdate: (fn: (dt: number) => void) => void) {
  const keys = new Set<string>();
  const e = new THREE.Euler().setFromQuaternion(cam.quaternion, "YXZ");
  let yaw = e.y, pitch = e.x, dragging = false;
  addEventListener("keydown", (ev) => keys.add(ev.code));
  addEventListener("keyup", (ev) => keys.delete(ev.code));
  canvas.addEventListener("mousedown", () => { dragging = true; canvas.requestPointerLock?.()?.catch?.(() => {}); });
  addEventListener("mouseup", () => { dragging = false; });
  addEventListener("mousemove", (ev) => {
    if (!dragging && document.pointerLockElement !== canvas) return;
    yaw -= ev.movementX * 0.0022; pitch = Math.max(-1.55, Math.min(1.55, pitch - ev.movementY * 0.0022));
  });
  const v = new THREE.Vector3();
  onUpdate((dt) => {
    cam.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
    const sp = (keys.has("ShiftLeft") ? 220 : 40) * dt;
    v.set((keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0), (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0), (keys.has("KeyS") ? 1 : 0) - (keys.has("KeyW") ? 1 : 0));
    if (v.lengthSq()) cam.position.add(v.normalize().multiplyScalar(sp).applyQuaternion(cam.quaternion));
  });
}
