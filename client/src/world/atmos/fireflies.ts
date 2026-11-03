// Night (sky-02-night): fireflies — a few hundred warm yellow-green glow points drifting 0.4–3 m above the ground
// round the camera (a 90 m box that re-seeds when the camera leaves it). Additive, HDR (they bloom), soft round sprites,
// never written to depth. Only while a preset asks for them (night).
import * as THREE from "three";
import type { Terrain } from "../../../../shared/world/terrain";

const N = 700;
const BOX = 90;

const VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime, uPx;
varying float vA;
void main() {
  vec3 p = position;
  float s = aSeed * 6.2831853;
  p += vec3(sin(uTime * 0.7 + s) * 0.6, sin(uTime * 1.3 + s * 1.7) * 0.25, cos(uTime * 0.6 + s * 2.3) * 0.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // blink: long glows with dark gaps
  vA = smoothstep(0.35, 0.9, sin(uTime * (0.9 + aSeed) + s * 3.0) * 0.5 + 0.5);
  // ~6 cm glow, never under 2.5 px
  gl_PointSize = max(3.0, 0.2 * uPx / -mv.z) * (0.7 + 0.6 * fract(aSeed * 13.7));
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  float g = (exp(-r * 5.0) + 0.35 * exp(-r * 1.2)) * (1.0 - smoothstep(0.7, 1.0, r)); // round: no square sprite edge
  if (g * vA < 0.01) discard;
  gl_FragColor = vec4(uColor * g * vA, 1.0);
}`;

export class Fireflies {
  readonly points: THREE.Points;
  private center = new THREE.Vector3(1e9, 0, 0);
  private mat: THREE.ShaderMaterial;
  on = false;
  /** the effects level (display settings) can switch them off */
  enabled = true;

  constructor(private terrain: Terrain) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) seed[i] = Math.random();
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1400 }, uColor: { value: new THREE.Color(4.5, 5.2, 1.3) } },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: true, fog: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.name = "atmos-fireflies";
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.points.visible = false;
    this.points.userData.castShadow = false; this.points.userData.farShadow = false;
  }

  private seed(c: THREE.Vector3) {
    const pos = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    let a = 1234567;
    const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    for (let i = 0; i < N; i++) {
      const x = c.x + (rnd() - 0.5) * BOX, z = c.z + (rnd() - 0.5) * BOX;
      const h = this.terrain.height(x, z);
      // over the sea: fewer (only the shoreline)
      const y = h < 0.2 ? -100 : h + 0.4 + rnd() * rnd() * 2.8;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    this.center.copy(c);
  }

  update(cam: THREE.PerspectiveCamera, t: number, viewH: number) {
    this.points.visible = this.on && this.enabled;
    if (!this.points.visible) return;
    if (Math.abs(cam.position.x - this.center.x) > BOX * 0.3 || Math.abs(cam.position.z - this.center.z) > BOX * 0.3) this.seed(cam.position);
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uPx.value = viewH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)));
  }
}
