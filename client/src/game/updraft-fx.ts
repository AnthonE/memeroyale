// THE VOLCANO UPDRAFT, drawn and heard (the sim is shared/sim/updraft.ts). A column of hot air standing out
// of Ripe Peak's summit crater up to redeploy height: rising heat streaks (a shimmering, slowly twisting sleeve, warm at
// the vent, pale ash-grey up high), glowing embers + ash flakes spiralling up the core, and a roar at the vent that grows
// as you get close (a rush of wind while it carries you). Three draw calls, all motion in the vertex / fragment shaders
// (one uniform per frame), visible from across the island so players learn where it is.
import * as THREE from "three";
import type { Sfx } from "../audio/api";
import { UPDRAFT, updraftLift, updraftR } from "../../../shared/sim/updraft";

type PlayFn = (s: Sfx, o: { pos?: [number, number, number]; loopId?: string; volume?: number; rate?: number }) => void;

const U = UPDRAFT, H = U.top - U.floor;

const SLEEVE_VS = /* glsl */ `
  varying vec2 vUv; varying float vY; varying vec3 vN; varying vec3 vW;
  void main() {
    vUv = uv; vY = position.y;
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const SLEEVE_FS = /* glsl */ `
  uniform float uT; uniform float uH; uniform float uA; uniform float uHot;
  varying vec2 vUv; varying float vY; varying vec3 vN; varying vec3 vW;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    float h = vY / uH + 0.5;                                  // 0 at the vent .. 1 at the top
    // wind lines spiralling up (thin, fast) over a slow billowing haze of hot air and ash
    float u = vUv.x * 22.0 + h * 9.0;
    float lines = smoothstep(0.62, 0.92, noise(vec2(u * 1.7, h * 5.0 - uT * 1.6))) * smoothstep(0.3, 0.7, noise(vec2(u * 0.5 + 3.0, h * 2.0 - uT * 0.5)));
    float haze = noise(vec2(vUv.x * 9.0 + h * 3.0, h * 6.0 - uT * 0.45)) * 0.6 + noise(vec2(vUv.x * 21.0, h * 13.0 - uT * 0.9)) * 0.4;
    // seen through like a volume: densest across the middle of the column, soft at its silhouette
    vec3 V = normalize(cameraPosition - vW);
    float ndv = abs(dot(normalize(vN), V));
    float body = pow(ndv, 1.4);
    float vert = smoothstep(0.0, 0.025, h) * (1.0 - smoothstep(0.62, 1.0, h));
    float far = 1.0 - smoothstep(900.0, 1800.0, length(cameraPosition - vW));
    float hot = 1.0 - smoothstep(0.0, 0.18, h);
    vec3 col = mix(vec3(0.93, 0.89, 0.84), vec3(1.0, 0.62, 0.32), hot * uHot);
    float a = (0.16 * haze + 0.5 * lines) * body * vert * far * uA;
    gl_FragColor = vec4(col * (1.0 + hot * uHot * 1.5), a);
  }`;
const MOTE_VS = /* glsl */ `
  attribute vec4 aS;                                           // seed: height phase, angle, radius share, speed
  uniform float uT; uniform float uH; uniform float uR0; uniform float uR1; uniform float uSize; uniform float uSpd;
  varying float vH; varying float vF;
  void main() {
    float h = fract(aS.x + uT * uSpd * (0.6 + 0.8 * aS.w) / uH);  // rises, wraps at the top
    float r = mix(uR0, uR1, smoothstep(0.0, 0.25, h)) * sqrt(aS.z);
    float ang = aS.y + uT * (0.35 + 0.5 * aS.w) + h * 3.0;       // a slow spiral, tighter up high
    vec3 p = vec3(cos(ang) * r, h * uH, sin(ang) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vH = h; vF = 1.0 - smoothstep(600.0, 1400.0, -mv.z);
    gl_PointSize = clamp(uSize * (0.6 + 0.8 * aS.w) * 520.0 / max(1.0, -mv.z), 1.5, 9.0);
    gl_Position = projectionMatrix * mv;
  }`;
const EMBER_FS = /* glsl */ `
  varying float vH; varying float vF;
  void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
    float k = (1.0 - d * 4.0) * (1.0 - smoothstep(0.15, 0.6, vH)) * vF;
    gl_FragColor = vec4(vec3(1.0, 0.5, 0.15) * k * 2.2, k); }`;
const ASH_FS = /* glsl */ `
  varying float vH; varying float vF;
  void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
    float k = (1.0 - d * 4.0) * smoothstep(0.02, 0.12, vH) * (1.0 - smoothstep(0.75, 1.0, vH)) * vF * 0.7;
    gl_FragColor = vec4(vec3(0.24, 0.22, 0.21), k); }`;

function motes(n: number, seed: number) {
  const g = new THREE.BufferGeometry(), a = new Float32Array(n * 4);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) { a[i * 4] = rnd(); a[i * 4 + 1] = rnd() * Math.PI * 2; a[i * 4 + 2] = rnd(); a[i * 4 + 3] = rnd(); }
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("aS", new THREE.BufferAttribute(a, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H / 2, 0), H / 2 + U.rAbove);
  return g;
}

export class UpdraftFx {
  readonly group = new THREE.Group();
  private readonly t = { value: 0 };
  private readonly uA = { value: 1 };
  private roarOn = false; private rushOn = false; private sndT = 0;
  private readonly pos: [number, number, number] = [0, 0, 0];

  constructor(scene: THREE.Scene) {
    const g = this.group; g.name = "volcano-updraft"; g.position.set(U.x, U.floor, U.z);
    // the sleeve: an open cone from the vent to the top (two of them, slightly different radii, read as depth)
    for (const k of [0, 1]) {
      const geo = new THREE.CylinderGeometry(U.rAbove + 1.5 - k * 3, U.rFloor + 0.6 + k * 0.8, H, 48, 1, true);
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { uT: this.t, uH: { value: H }, uA: k ? { value: 0.8 } : this.uA, uHot: { value: k ? 1 : 0.4 } },
        vertexShader: SLEEVE_VS, fragmentShader: SLEEVE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }));
      m.position.y = H / 2; m.rotation.y = k * 1.3; m.renderOrder = 4; m.name = "updraft-sleeve-" + k; m.castShadow = false; m.receiveShadow = false;
      g.add(m);
    }
    const common = { uT: this.t, uH: { value: H }, uR0: { value: U.rFloor * 0.8 }, uR1: { value: U.rAbove * 0.85 } };
    const embers = new THREE.Points(motes(260, 7), new THREE.ShaderMaterial({ uniforms: { ...common, uSize: { value: 0.09 }, uSpd: { value: 34 } }, vertexShader: MOTE_VS, fragmentShader: EMBER_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const ash = new THREE.Points(motes(420, 11), new THREE.ShaderMaterial({ uniforms: { ...common, uSize: { value: 0.16 }, uSpd: { value: 26 } }, vertexShader: MOTE_VS, fragmentShader: ASH_FS, transparent: true, depthWrite: false, fog: false }));
    embers.name = "updraft-embers"; ash.name = "updraft-ash"; embers.renderOrder = 5; ash.renderOrder = 4;
    g.add(embers, ash);
    scene.add(g);
  }

  /** per frame: the shader clock, the vent's roar (emitter on the column's axis at the listener's height) and the rush
   *  of wind while it lifts you */
  update(dt: number, cam: THREE.Vector3, me: { x: number; y: number; z: number } | null, play: PlayFn, stop: (id: string) => void) {
    this.t.value += dt;
    this.sndT -= dt;
    if (this.sndT > 0) return;
    this.sndT = 0.1;
    const dx = cam.x - U.x, dz = cam.z - U.z, d = Math.hypot(dx, dz);
    const y = Math.max(U.floor + 2, Math.min(U.top - 20, cam.y));
    // the emitter sits on the column's wall nearest you (inside it: on you)
    const r = Math.min(d, updraftR(y)), k = d > 1e-3 ? r / d : 0;
    this.pos[0] = U.x + dx * k; this.pos[1] = y; this.pos[2] = U.z + dz * k;
    const near = d < 320 && Math.abs(cam.y - y) < 260;
    if (near) { play("updraft:roar", { pos: this.pos, loopId: "updraft-roar", volume: 1 }); this.roarOn = true; }
    else if (this.roarOn) { stop("updraft-roar"); this.roarOn = false; }
    const lift = me ? updraftLift(me.x, me.y, me.z) : 0;
    if (lift > 0.02) { play("updraft:rush", { loopId: "updraft-rush", volume: Math.min(1, 0.25 + lift), rate: 0.9 + 0.25 * lift }); this.rushOn = true; }
    else if (this.rushOn) { stop("updraft-rush"); this.rushOn = false; }
  }
  dispose(stop: (id: string) => void) {
    if (this.roarOn) stop("updraft-roar"); if (this.rushOn) stop("updraft-rush");
    this.group.removeFromParent();
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); if (m.material) (m.material as THREE.Material).dispose(); });
  }
}
