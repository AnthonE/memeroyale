// Night (sky-02-night): the lighthouse's sweeping light beams — two soft additive cones of lit night air from
// the lookout-point lantern room (shared/pois/lookout-point.ts LH), rotating slowly. HDR (they bloom), never written to
// depth, faded along their length and toward their silhouettes (a volume, not a solid cone). Only while a preset asks
// for them (night).
import * as THREE from "three";

const LEN = 150;
const VERT = /* glsl */ `
varying vec3 vN, vV;
varying float vAlong;
void main() {
  vAlong = position.x / ${LEN.toFixed(1)};
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uI;
varying vec3 vN, vV;
varying float vAlong;
void main() {
  float face = abs(dot(normalize(vN), normalize(vV)));
  float a = pow(face, 1.6) * pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.8) * smoothstep(0.0, 0.02, vAlong);
  gl_FragColor = vec4(uColor * a * uI, 1.0);
}`;

export class NightBeam {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  on = false;
  /** the beams' yaw at t = 0 and their rate (rad / s): at the shot clock (t = 12) one beam points NNE, across the
   *  sky-02-night frame toward the camera's right */
  private yaw0 = -2.99;
  private rate = 0.35;

  constructor() {
    // top (+y, → +x after the rotation) = the wide far end; the narrow end sits in the lantern
    const g = new THREE.CylinderGeometry(9, 0.6, LEN, 32, 1, true);
    g.translate(0, LEN / 2, 0);
    g.rotateZ(-Math.PI / 2); // axis along +X, narrow end at the lamp
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.88, 0.62) }, uI: { value: 0.14 } },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    for (const k of [0, 1]) {
      const m = new THREE.Mesh(g, this.mat);
      m.rotation.y = k * Math.PI;
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.group.add(m);
    }
    // the lantern's position comes from the POI's shared layout, loaded LAZILY: a broken / in-progress POI file elsewhere
    // must never take the atmos module (the sky) down with it — no layout, no beam
    this.group.userData.krNoLayout = true;
    import("../../../../shared/pois/lookout-point").then(({ LH }) => {
      this.group.position.set(LH.x, LH.top + LH.roomWall + LH.glassH * 0.5, LH.z);
      delete this.group.userData.krNoLayout;
    }).catch((e) => console.warn("[atmos] night beam: no lighthouse layout", e));
    this.group.name = "atmos-nightbeam";
    this.group.visible = false;
    this.group.userData.castShadow = false; this.group.userData.farShadow = false;
    this.group.traverse((o) => { o.userData.castShadow = false; o.userData.farShadow = false; });
  }

  update(t: number) {
    this.group.visible = this.on && !this.group.userData.krNoLayout;
    if (!this.on) return;
    this.group.rotation.y = this.yaw0 + t * this.rate;
    this.group.updateMatrixWorld(true);
  }
}
