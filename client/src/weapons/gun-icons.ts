// Each gun's icon, drawn from its own model (as oneshot does, its look/icons.rs): once the models are in, every gun is
// stood side-on (muzzle to the right) in a small scene of its own, lit, and drawn by an orthographic camera into an
// offscreen target, read back into a PNG. The HUD, inventory, shop, kill feed and caster all take the URL from
// ui/icons.ts itemIconUrl, which serves these once they exist. No files: a new model is a new icon.
import * as THREE from "three";
import type { WeaponId } from "../../../shared/world/map";
import { gunInstance, GUN_ORDER } from "./guns/index";
import { resources } from "../engine/res/scope";
import { setItemIcon } from "../ui/icons";

/** an icon's size, px (the old painted icons' size: every consumer already lays them out at it), and the share of it
 *  the gun's length fills */
const SIZE = 320, FILL = 0.92;

function shot(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, id: WeaponId): Promise<string | null> {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#5a6470", 2.2));
  const key = new THREE.DirectionalLight("#ffffff", 2.4); key.position.set(3, 4, 2); scene.add(key);
  const inst = gunInstance(id);
  if (inst.pivots.accent) inst.pivots.accent.visible = false;
  scene.add(inst.root);
  inst.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inst.root), c = box.getCenter(new THREE.Vector3());
  const len = box.max.z - box.min.z, half = len / FILL / 2;
  // from +X looking back at the gun: screen right is −Z, the muzzle
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 10);
  cam.position.set(c.x + 3, c.y, c.z); cam.lookAt(c);
  const was = { target: renderer.getRenderTarget(), tm: renderer.toneMapping, clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  renderer.setRenderTarget(target); renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(was.target); renderer.toneMapping = was.tm; renderer.setClearColor(was.clear, was.alpha);
  // the target's rows run bottom-up: flip them into the canvas
  const cv = document.createElement("canvas"); cv.width = cv.height = SIZE;
  const g = cv.getContext("2d")!, img = g.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
  g.putImageData(img, 0, 0);
  return new Promise((done) => cv.toBlob((b) => done(b ? URL.createObjectURL(b) : null), "image/png"));
}

/** draw every gun's icon (once; the models must be loaded) */
export async function drawGunIcons(renderer: THREE.WebGLRenderer): Promise<void> {
  const scope = resources.root.child("gun-icons");
  // (also listed on window.__kr.gunIcons, for tools that look at them)
  const urls: Record<string, string> = {};
  const kr = (globalThis as { __kr?: Record<string, unknown> }).__kr; if (kr) kr.gunIcons = urls;
  try {
    const target = scope.target(new THREE.WebGLRenderTarget(SIZE, SIZE));
    target.texture.colorSpace = THREE.SRGBColorSpace;
    for (const id of GUN_ORDER) {
      const url = await shot(renderer, target, id);
      if (url) { setItemIcon(id, url); urls[id] = url; }
    }
  } finally { scope.dispose(); }
}
