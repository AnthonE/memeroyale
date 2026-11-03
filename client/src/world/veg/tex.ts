// Vegetation texture library: the painted leaf / bark sources packed into
// public/assets/veg/*.webp. Textures are returned synchronously (materials are built up-front) and filled when the
// image arrives; `vegTexturesReady()` resolves when every requested image is on the GPU side (impostor bakes wait for
// it) and each load holds the engine's ready flag so view-camera screenshots never capture half-loaded foliage.
import * as THREE from "three";
import { assetUrl } from "../../engine/assets";

const cache = new Map<string, THREE.Texture>();
const pending: Promise<void>[] = [];
let holdFn: ((label: string) => () => void) | null = null;
let maxAniso = 8;

export function initVegTextures(hold: (label: string) => () => void, renderer: THREE.WebGLRenderer) {
  holdFn = hold;
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
}

/** a veg texture by id (file public/assets/veg/<id>.webp). `data` = linear (normal maps). */
export function vegTex(id: string, o: { data?: boolean; repeat?: boolean | "mirror" } = {}): THREE.Texture {
  const key = `${id}:${!!o.data}:${o.repeat ?? false}`;
  let t = cache.get(key);
  if (t) return t;
  t = new THREE.Texture();
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (o.repeat) t.wrapS = t.wrapT = o.repeat === "mirror" ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const tex = t;
  const release = holdFn?.(`veg-tex:${id}`);
  pending.push(new Promise<void>((res) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { tex.image = img; tex.needsUpdate = true; release?.(); res(); };
    img.onerror = () => { console.error(`veg: texture ${id} failed to load`); release?.(); res(); };
    img.src = assetUrl(`assets/veg/${id}.webp`);
  }));
  cache.set(key, t);
  return t;
}

/** resolves when every texture requested so far has loaded */
export function vegTexturesReady(): Promise<void> {
  return Promise.all(pending).then(() => undefined);
}
