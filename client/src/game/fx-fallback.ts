// Minimal gameplay-side FX used ONLY while the weapons FX module (client/src/weapons/fx.ts) is missing, so
// tracers, impacts and explosions are never invisible. Two instanced draws, GPU-animated from spawn records (a
// ring buffer; spawning writes a few floats, update() only advances a time uniform). Swapped out automatically as
// soon as the real kit FX loads (see index.ts).
import * as THREE from "three";
import type { Fx } from "../weapons/api";
import type { WeaponId } from "../../../shared/world/map";
import type { Surface } from "../../../shared/world/colliders";

const TR_N = 48, IM_N = 96;

export function createFallbackFx(scene: THREE.Scene): Fx & { object: THREE.Object3D } {
  const uTime = { value: 0 };
  const root = new THREE.Group(); root.name = "fx-fallback";
  // ---- tracers: a camera-facing streak that travels from A to B at bullet speed (head bright, tail fading)
  const trGeo = new THREE.InstancedBufferGeometry();
  trGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3));
  trGeo.setIndex([0, 1, 2, 1, 3, 2]);
  const trA = new THREE.InstancedBufferAttribute(new Float32Array(TR_N * 4), 4);   // a.xyz, t0
  const trB = new THREE.InstancedBufferAttribute(new Float32Array(TR_N * 4), 4);   // b.xyz, speed
  trA.setUsage(THREE.DynamicDrawUsage); trB.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < TR_N; i++) trA.array[i * 4 + 3] = -99;
  trGeo.setAttribute("aA", trA); trGeo.setAttribute("aB", trB); trGeo.instanceCount = TR_N;
  const trMat = new THREE.ShaderMaterial({
    uniforms: { uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; uniform float uTime; varying float vA; varying float vU;
      void main() {
        vec3 a = aA.xyz, b = aB.xyz; float len = max(length(b - a), 0.01); vec3 d = (b - a) / len;
        float age = uTime - aA.w, head = age * aB.w;                      // metres travelled
        float s0 = clamp(head - min(len * 0.35 + 6.0, 22.0), 0.0, len), s1 = clamp(head, 0.0, len);
        float live = step(0.0, age) * step(s0, len - 0.01) * (1.0 - smoothstep(0.0, 0.06, age - len / aB.w));
        vec3 p = a + d * mix(s0, s1, position.x);
        vec3 view = normalize(cameraPosition - p);
        vec3 side = normalize(cross(d, view) + 1e-5);
        float w = 0.035 + 0.02 * position.x;
        p += side * position.y * w * (1.0 + 0.004 * length(cameraPosition - p));
        vA = live; vU = position.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `varying float vA; varying float vU;
      void main() { float k = vA * vU * vU; gl_FragColor = vec4(vec3(1.0, 0.86, 0.45) * k * 2.2, k); }`,
  });
  const tracers = new THREE.Mesh(trGeo, trMat); tracers.frustumCulled = false; tracers.renderOrder = 6; root.add(tracers);

  // ---- impacts / explosions: expanding billboard flash + a darker puff (kind picks colours and size)
  const imGeo = new THREE.InstancedBufferGeometry();
  imGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
  imGeo.setIndex([0, 1, 2, 1, 3, 2]);
  const imP = new THREE.InstancedBufferAttribute(new Float32Array(IM_N * 4), 4);   // pos, t0
  const imK = new THREE.InstancedBufferAttribute(new Float32Array(IM_N * 4), 4);   // size, life, r, g (b packed via kind)
  imP.setUsage(THREE.DynamicDrawUsage); imK.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < IM_N; i++) imP.array[i * 4 + 3] = -99;
  imGeo.setAttribute("aP", imP); imGeo.setAttribute("aK", imK); imGeo.instanceCount = IM_N;
  const imMat = new THREE.ShaderMaterial({
    uniforms: { uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `
      attribute vec4 aP; attribute vec4 aK; uniform float uTime; varying vec2 vUv; varying float vT; varying vec2 vC;
      void main() {
        float t = (uTime - aP.w) / aK.y; vT = t; vC = aK.zw; vUv = position.xy;
        float s = aK.x * (0.35 + 0.9 * sqrt(clamp(t, 0.0, 1.0))) * step(0.0, t) * step(t, 1.0);
        vec4 mv = viewMatrix * vec4(aP.xyz, 1.0); mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; varying float vT; varying vec2 vC;
      void main() { float r = length(vUv); float core = exp(-r * r * 6.0) * (1.0 - vT); float ring = exp(-pow((r - 0.7 * sqrt(vT)) * 7.0, 2.0)) * (1.0 - vT) * 0.6;
        vec3 col = mix(vec3(1.0, 0.95, 0.8), vec3(vC, 0.25), clamp(r * 1.4, 0.0, 1.0));
        float a = (core + ring); if (a < 0.003) discard; gl_FragColor = vec4(col * a * 1.6, a); }`,
  });
  const impacts = new THREE.Mesh(imGeo, imMat); impacts.frustumCulled = false; impacts.renderOrder = 6; root.add(impacts);
  scene.add(root);

  let ti = 0, ii = 0, trLo = TR_N, trHi = -1, imLo = IM_N, imHi = -1;
  const spawnImpact = (x: number, y: number, z: number, size: number, life: number, r: number, g: number) => {
    const i = ii; ii = (ii + 1) % IM_N; const o = i * 4;
    imP.array[o] = x; imP.array[o + 1] = y; imP.array[o + 2] = z; imP.array[o + 3] = uTime.value;
    imK.array[o] = size; imK.array[o + 1] = life; imK.array[o + 2] = r; imK.array[o + 3] = g;
    imLo = Math.min(imLo, i); imHi = Math.max(imHi, i);
  };
  return {
    object: root,
    tracer(from: THREE.Vector3, to: THREE.Vector3, weapon: WeaponId) {
      const i = ti; ti = (ti + 1) % TR_N; const o = i * 4;
      trA.array[o] = from.x; trA.array[o + 1] = from.y; trA.array[o + 2] = from.z; trA.array[o + 3] = uTime.value;
      trB.array[o] = to.x; trB.array[o + 1] = to.y; trB.array[o + 2] = to.z; trB.array[o + 3] = weapon === "sniper" ? 900 : weapon === "shotgun" ? 380 : 480;
      trLo = Math.min(trLo, i); trHi = Math.max(trHi, i);
    },
    impact(pos: THREE.Vector3, normal: THREE.Vector3, surface: Surface | "flesh") {
      const flesh = surface === "flesh", water = surface === "water";
      spawnImpact(pos.x + normal.x * 0.05, pos.y + normal.y * 0.05, pos.z + normal.z * 0.05, flesh ? 0.32 : 0.22, flesh ? 0.16 : 0.2, flesh ? 1.0 : water ? 0.6 : 0.95, flesh ? 0.35 : water ? 0.85 : 0.7);
    },
    explosion(pos: THREE.Vector3, radius: number) {
      spawnImpact(pos.x, pos.y + 0.5, pos.z, radius * 1.4, 0.45, 1.0, 0.55);
      spawnImpact(pos.x, pos.y + 1.2, pos.z, radius * 0.9, 0.7, 0.9, 0.35);
    },
    puff(pos: THREE.Vector3, kind: "dust" | "sand" | "splash") {
      spawnImpact(pos.x, pos.y + 0.2, pos.z, 0.9, 0.5, kind === "splash" ? 0.5 : 0.6, kind === "splash" ? 0.75 : 0.5);
    },
    update(dt: number) {
      uTime.value += dt;
      if (trHi >= trLo) { trA.clearUpdateRanges(); trB.clearUpdateRanges(); trA.addUpdateRange(trLo * 4, (trHi - trLo + 1) * 4); trB.addUpdateRange(trLo * 4, (trHi - trLo + 1) * 4); trA.needsUpdate = true; trB.needsUpdate = true; trLo = TR_N; trHi = -1; }
      if (imHi >= imLo) { imP.clearUpdateRanges(); imK.clearUpdateRanges(); imP.addUpdateRange(imLo * 4, (imHi - imLo + 1) * 4); imK.addUpdateRange(imLo * 4, (imHi - imLo + 1) * 4); imP.needsUpdate = true; imK.needsUpdate = true; imLo = IM_N; imHi = -1; }
    },
  };
}
