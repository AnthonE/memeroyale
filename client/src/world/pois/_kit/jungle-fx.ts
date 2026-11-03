// poi-jungle kit — small fire / cloth FX: an animated flame card (two crossed additive quads, procedural teardrop flame
// with turbulent tongues, white-yellow core → orange → red edge), a fire bowl (carved stone bowl with a glowing ember
// rim), and a folded cloth banner (vertical folds, painted emblem, zig-zag fringe, a gold rod).
import * as THREE from "three";
import { waterTime } from "./jungle-water";
import { canvasTex, mulberry } from "./jungle-mat";

const FLAME_FRAG = /* glsl */ `
uniform float uTime, uSeed, uGain; varying vec2 vUv;
float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float t = uTime * 2.4 + uSeed * 17.0, x = (vUv.x - 0.5) * 2.0, y = vUv.y;
  float turb = (fn(vec2(x * 2.6 + uSeed, y * 3.5 - t * 1.6)) - 0.5) * 0.75 * y + (fn(vec2(x * 6.5, y * 8.0 - t * 3.1)) - 0.5) * 0.3 * y;
  float w = (1.0 - y) * 0.8 * (0.55 + 0.45 * sqrt(max(0.0, 1.0 - y)));
  float d = abs(x + turb) / max(w, 0.02);
  float body = (1.0 - smoothstep(0.45, 1.0, d)) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.62, 0.98, y + turb * 0.35));
  float core = (1.0 - smoothstep(0.0, 0.5, d + y * 0.9)) * smoothstep(0.0, 0.12, y);
  vec3 col = mix(vec3(1.0, 0.16, 0.01), vec3(1.0, 0.5, 0.06), smoothstep(0.1, 0.8, body)) + vec3(1.0, 0.72, 0.2) * core * 0.9;
  gl_FragColor = vec4(col * body * uGain, 1.0);
}`;
/** an animated flame (two crossed quads), base at `pos`, `w` × `h` metres */
export function flameCard(pos: THREE.Vector3, w: number, h: number, seed = 1, gain = 2.2): THREE.Group {
  const g = new THREE.Group(); g.name = "jungle-flame";
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: waterTime, uSeed: { value: seed }, uGain: { value: gain } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: FLAME_FRAG });
  for (const a of [0, Math.PI / 2, Math.PI / 4]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), mat); m.rotation.y = a + seed; m.renderOrder = 7; m.userData.castShadow = false; g.add(m); }
  g.position.copy(pos);
  return g;
}

/** a carved fire bowl (lathe) + a glowing ember bed inside it; returns [bowl geometry (stone), ember mesh] */
export function fireBowl(pos: THREE.Vector3, r: number): { bowl: THREE.BufferGeometry; embers: THREE.Mesh } {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * Math.PI * 0.5; prof.push(new THREE.Vector2(r * (0.35 + 0.65 * Math.sin(a)), -r * 0.55 * Math.cos(a))); }
  prof.push(new THREE.Vector2(r * 1.08, 0.02), new THREE.Vector2(r * 1.05, 0.08), new THREE.Vector2(r * 0.92, 0.06), new THREE.Vector2(r * 0.9, -0.05));
  const bowl = new THREE.LatheGeometry(prof, 20).translate(pos.x, pos.y, pos.z);
  const em = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 20).rotateX(-Math.PI / 2).translate(pos.x, pos.y - 0.02, pos.z), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.75, 0.12), toneMapped: false }));
  em.name = "jungle-embers"; em.userData.castShadow = false;
  return { bowl, embers: em };
}

let _ban: THREE.CanvasTexture | null = null;
/** a red temple banner: deep red cloth with darker border bands, a gold gorilla-head medallion + banana motif, a zig-zag
 *  fringe cut into the alpha at the bottom */
export function bannerTex(): THREE.CanvasTexture {
  if (_ban) return _ban;
  _ban = canvasTex(256, 640, (g, w, h) => {
    const rnd = mulberry(8080); g.clearRect(0, 0, w, h);
    const body = h - 70;
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#7e1512"); gr.addColorStop(0.5, "#b3221c"); gr.addColorStop(1, "#7e1512");
    g.fillStyle = gr; g.fillRect(0, 0, w, body);
    g.fillStyle = "rgba(255,255,255,0.05)"; for (let x = 0; x < w; x += 5) g.fillRect(x, 0, 1, body);                        // weave
    g.fillStyle = "#d8a53a"; g.fillRect(14, 0, 8, body); g.fillRect(w - 22, 0, 8, body); g.fillRect(14, 40, w - 28, 8); g.fillRect(14, body - 30, w - 28, 8);
    // medallion: gold ring + a stylised gorilla face
    const cx = w / 2, cy = 190; g.fillStyle = "#e0b44a"; g.beginPath(); g.arc(cx, cy, 70, 0, 7); g.fill(); g.fillStyle = "#8f1a15"; g.beginPath(); g.arc(cx, cy, 58, 0, 7); g.fill();
    g.fillStyle = "#e0b44a"; g.beginPath(); g.ellipse(cx, cy + 6, 38, 42, 0, 0, 7); g.fill(); g.fillStyle = "#8f1a15"; g.beginPath(); g.ellipse(cx - 14, cy - 6, 7, 5, 0, 0, 7); g.ellipse(cx + 14, cy - 6, 7, 5, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx, cy + 16, 16, 10, 0, 0, 7); g.fill(); g.fillStyle = "#e0b44a"; g.fillRect(cx - 34, cy - 18, 68, 6);
    // banana motif below
    g.strokeStyle = "#e0b44a"; g.lineWidth = 14; g.lineCap = "round"; g.beginPath(); g.arc(cx, 330, 50, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
    for (let i = 0; i < 3; i++) { g.fillStyle = "#e0b44a"; g.beginPath(); g.moveTo(cx - 40 + i * 40, 420); g.lineTo(cx - 20 + i * 40, 450); g.lineTo(cx - 60 + i * 40, 450); g.fill(); }
    // wear: darker stains
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,5,5,${0.05 + rnd() * 0.08})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * body, 5 + rnd() * 20, 5 + rnd() * 30, 0, 0, 7); g.fill(); }
    // fringe: zig-zag tassels (alpha cut)
    g.fillStyle = "#d8a53a"; for (let x = 18; x < w - 14; x += 14) { g.beginPath(); g.moveTo(x, body - 2); g.lineTo(x + 7, h - 4 - rnd() * 10); g.lineTo(x + 12, body - 2); g.fill(); }
  }, { repeat: false });
  return _ban;
}
/** a folded cloth banner hanging from a gold rod: vertical folds, bottom sway; returns [cloth geometry, rod geometry] */
export function bannerGeo(w: number, h: number): { cloth: THREE.BufferGeometry; rod: THREE.BufferGeometry } {
  const cloth = new THREE.PlaneGeometry(w, h, 14, 12); cloth.translate(0, -h / 2, 0);
  const p = cloth.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = -p.getY(i) / h; p.setZ(i, 0.07 * Math.sin(x / w * Math.PI * 5.0) * (0.5 + y * 0.8) + 0.06 * y * y); }
  cloth.computeVertexNormals();
  const rod = new THREE.CylinderGeometry(0.035, 0.035, w + 0.3, 8).rotateZ(Math.PI / 2);
  return { cloth, rod };
}
