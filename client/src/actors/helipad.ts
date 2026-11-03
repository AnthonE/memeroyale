// THE HELIPAD — where a KONG AIR helicopter waits (shared/sim/heli-spots.ts): a round of dark tarmac hugging the ground,
// a banana-yellow ring, a big H and KONG AIR round the top. Paint only: it has no collider (the sim's pad is the level
// ground itself) and it is drawn once per world.
import * as THREE from "three";
import { patch } from "../world/pois/_kit/coast-kit";
import type { Terrain } from "../../../shared/world/terrain";
import { HELI } from "../../../shared/sim/heli";

let tex: THREE.CanvasTexture | null = null, material: THREE.MeshStandardMaterial | null = null;
function padMaterial(): THREE.MeshStandardMaterial {
  if (!tex) {
    const S = 512, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d")!, cx = S / 2, cy = S / 2;
    g.clearRect(0, 0, S, S);
    g.fillStyle = "#2b2a2e"; g.beginPath(); g.arc(cx, cy, S * 0.49, 0, Math.PI * 2); g.fill();
    // a worn, mottled surface
    for (let i = 0; i < 900; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * S * 0.48; g.fillStyle = `rgba(${60 + Math.random() * 30 | 0},${58 + Math.random() * 30 | 0},${62 + Math.random() * 30 | 0},${0.25 + Math.random() * 0.3})`; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + Math.random() * 4, 2 + Math.random() * 4); }
    g.lineWidth = S * 0.04; g.strokeStyle = "#ffd400"; g.beginPath(); g.arc(cx, cy, S * 0.42, 0, Math.PI * 2); g.stroke();
    g.lineWidth = S * 0.012; g.strokeStyle = "#e2553d"; g.beginPath(); g.arc(cx, cy, S * 0.36, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#ffd400"; g.font = `900 ${S * 0.42}px 'Barlow Condensed', 'Arial Narrow', Impact, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("H", cx, cy + S * 0.02);
    g.font = `800 ${S * 0.085}px 'Barlow Condensed', 'Arial Narrow', Impact, sans-serif`; g.fillStyle = "#fff0d2";
    const word = "KONG AIR", r = S * 0.455;
    for (let i = 0; i < word.length; i++) { const a = -Math.PI / 2 + (i - (word.length - 1) / 2) * 0.16; g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.fillText(word[i], 0, 0); g.restore(); }
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  }
  return (material ??= Object.assign(new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, depthWrite: false }), { name: "helipad" }));
}
/** the pad at (x, z), yaw = the helicopter's nose (the lettering sits over its tail) */
export function createHelipad(terrain: Terrain, x: number, z: number, yaw: number): THREE.Mesh {
  const R = HELI.ROTOR_R + 0.9;
  const g = patch(terrain, x, z, R, R, { lift: 0.06, seg: 40, rings: 6, wobble: 0, yaw: 0 });
  // the patch's uvs are world metres: remap them onto the texture round the centre, turned with the pad
  const pos = g.attributes.position, uv = g.attributes.uv as THREE.BufferAttribute, c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i < pos.count; i++) { const dx = pos.getX(i) - x, dz = pos.getZ(i) - z; const lx = dx * c - dz * s, lz = dx * s + dz * c; uv.setXY(i, 0.5 + lx / (2 * R), 0.5 + lz / (2 * R)); }
  uv.needsUpdate = true;
  g.deleteAttribute("color");
  const m = new THREE.Mesh(g, padMaterial()); m.name = "helipad"; m.castShadow = false; m.receiveShadow = true; m.renderOrder = 1; m.userData.farShadow = false;
  return m;
}
