// Steam vents over the lava field (biome-04: white steam rolling off the hot crust beside the lava rivers). One
// InstancedMesh of camera-facing soft puffs (procedural, no texture): each vent is a plume of puffs that rise, swell,
// drift down-wind and thin out on a loop; vents sit beside the traced lava channels in the badlands, never within a few
// metres of a rock. ~1 draw, alpha-blended, no shadows.
// So steam quads never clip the ground with hard straight edges, every fragment fades by its height above
// the GROUND under it (a 2 m half-float height texture of the lava field), so a puff never shows a straight edge where
// its quad cuts the terrain; puffs are noise-eroded billows (3 octaves, per-puff seed) instead of round cotton balls.
import * as THREE from "three";
import type { LavaLine, RockInstance } from "../../../../shared/world/terrain-gen";
import { terrainNoiseTexture } from "./material";
import { mulberry32 } from "../../../../shared/world/noise";

const PUFFS = 6;   // (6: a continuous plume, not separate cotton balls)
const MAX_VENTS = 10;
/** ground-height texture footprint (m): centred on the lava field, 2 m texels */
const HT = { x: -620, z: -560, size: 512, res: 256 };

export function buildSteam(lines: LavaLine[], height: (x: number, z: number) => number, onBadlands: (x: number, z: number) => boolean,
  extra: Array<[number, number, number]> = [], rocks: RockInstance[] = []): { mesh: THREE.InstancedMesh; update(t: number): void } | null {
  const rnd = mulberry32(7711);
  const nearRock = (x: number, z: number) => rocks.some((r) => Math.max(r.sx, r.sy, r.sz) > 1.2 && Math.hypot(r.x - x, r.z - z) < Math.max(r.sx, r.sz) * 0.5 + 7);
  const vents: Array<[number, number, number, number]> = [];
  for (const [x, z, s] of extra) if (!nearRock(x, z)) vents.push([x, height(x, z), z, s]);
  for (const L of lines) {
    for (let i = 40; i < L.pts.length && vents.length < MAX_VENTS; i += 110 + ((rnd() * 70) | 0)) {
      const [x, z] = L.pts[i], a = rnd() * 6.283, off = L.hw[i] + 2.5 + rnd() * 5;
      const vx = x + Math.cos(a) * off, vz = z + Math.sin(a) * off;
      if (!onBadlands(vx, vz) || nearRock(vx, vz)) continue;
      vents.push([vx, height(vx, vz), vz, 0.7 + rnd() * 0.7]);
    }
  }
  if (!vents.length) return null;
  // ground heights under the plumes (half-float, linear filtered)
  const hd = new Uint16Array(HT.res * HT.res), step = HT.size / HT.res;
  for (let i = 0; i < HT.res; i++) for (let j = 0; j < HT.res; j++) {
    hd[i * HT.res + j] = THREE.DataUtils.toHalfFloat(height(HT.x - HT.size / 2 + (j + 0.5) * step, HT.z - HT.size / 2 + (i + 0.5) * step));
  }
  const hTex = new THREE.DataTexture(hd, HT.res, HT.res, THREE.RedFormat, THREE.HalfFloatType);
  hTex.minFilter = hTex.magFilter = THREE.LinearFilter; hTex.wrapS = hTex.wrapT = THREE.ClampToEdgeWrapping; hTex.needsUpdate = true;

  const n = vents.length * PUFFS;
  const g = new THREE.PlaneGeometry(1, 1);
  const seed = new Float32Array(n * 4);
  vents.forEach(([x, y, z, s], v) => { for (let p = 0; p < PUFFS; p++) { const k = (v * PUFFS + p) * 4; seed[k] = x; seed[k + 1] = y; seed[k + 2] = z; seed[k + 3] = Math.round(s * 100) + p / PUFFS; } });
  g.setAttribute("aVent", new THREE.InstancedBufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Color(1.0, 0.96, 0.9) }, tH: { value: hTex }, uHT: { value: new THREE.Vector4(HT.x - HT.size / 2, HT.z - HT.size / 2, HT.size, 0) }, tNoise: { value: terrainNoiseTexture() } },
    vertexShader: /* glsl */`
      attribute vec4 aVent; uniform float uTime; varying vec2 vUv; varying float vA; varying float vHot; varying vec3 vW; varying float vSeed; varying float vBase; varying float vSize;
      void main() {
        float scale = floor(aVent.w) / 100.0, ph = fract(aVent.w);
        float life = fract(uTime * 0.06 * (0.85 + 0.3 * scale) + ph);            // 0 → 1 as the puff rises
        vec3 base = aVent.xyz;
        float drift = life * life;
        // rise + swell + drift down-wind (the plume leans and spreads like the target art's steam)
        vec3 c = base + vec3(sin(ph * 40.0 + uTime * 0.25) * 1.2 + drift * 11.0, 1.0 + life * 22.0 * scale, cos(ph * 23.0) * 1.2 + drift * 5.0);
        // bigger, overlapping billows that swell as they rise (the target art's white plume, not grey dots)
        float size = (3.0 + life * 13.0) * scale;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        // a slow spin per puff so the noise billows never repeat side by side
        float a = ph * 6.283 + life * 0.8, ca = cos(a), sa = sin(a);
        vec2 q = vec2(position.x * ca - position.y * sa, position.x * sa + position.y * ca);
        vec3 wp = c + (right * q.x + up * q.y) * size;
        vUv = uv; vW = wp; vSeed = ph * 17.0 + scale * 3.1; vBase = base.y; vSize = size;
        vA = smoothstep(0.0, 0.14, life) * (1.0 - smoothstep(0.35, 1.0, life)); vHot = 1.0 - smoothstep(0.0, 0.3, life);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        if (distance(cameraPosition, base) > 650.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);   // far vents: nothing
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform sampler2D tH; uniform vec4 uHT; uniform sampler2D tNoise;
      varying vec2 vUv; varying float vA; varying float vHot; varying vec3 vW; varying float vSeed; varying float vBase; varying float vSize;
      void main() {
        vec2 q = vUv - 0.5; float r = length(q) * 2.0;
        if (r > 1.0 || vA < 0.01) discard;   // (perf: the quad corners never pay for the noise)
        // one fetch of the shared 3-octave noise instead of 12 hash evaluations; a radial falloff that reaches zero
        // BEFORE the quad's edge (eroded billows that kept ~0.6 alpha at r = 1 gave hard disc edges)
        float n = texture2D(tNoise, vUv * 0.4 + vSeed * 0.137).a * 1.6 - 0.1;
        float a = (1.0 - smoothstep(0.1, 0.95, r + (n - 0.5) * 0.8)) * (1.0 - smoothstep(0.6, 1.0, r)) * vA * 0.34;
        // soft ground contact: fade by the height above the terrain right under this fragment (no straight clip edge)
        vec2 huv = (vW.xz - uHT.xy) / uHT.z;
        float gy = (huv.x > 0.0 && huv.y > 0.0 && huv.x < 1.0 && huv.y < 1.0) ? texture2D(tH, huv).r : vBase;
        a *= smoothstep(0.0, 1.2 + vSize * 0.28, vW.y - gy);
        if (a < 0.004) discard;
        // lit billows: brighter toward the top, a little warm glow from the lava at the plume's root
        vec3 col = mix(vec3(0.86, 0.87, 0.9), uSun, 0.6) * (0.88 + 0.25 * n + 0.14 * q.y) + vec3(0.55, 0.2, 0.05) * vHot * 0.35;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(g, mat, n);
  mesh.name = "terrain-steam"; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.userData.castShadow = false; mesh.userData.farShadow = false; mesh.userData.receiveShadow = false;
  mesh.renderOrder = 5;
  return { mesh, update: (t: number) => { mat.uniforms.uTime.value = t; } };
}
