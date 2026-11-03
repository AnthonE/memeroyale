// The limestone outcrop behind the tiki bar: a few boxy superellipsoid masses (karst blocks with vertical faces,
// soft rounded edges, horizontal strata ledges, big lumps) + tumbled boulders at the foot. Triplanar rock material
// with moss on up-facing surfaces (lk.ts rockMaterial); vertex colour carries baked AO (dark foot, lit crown).
// Returns the crown points so the POI can plant jungle on top.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { DIM, inTpClearing, type LobbyItem } from "../../../../../shared/pois/lobby-islet";
import { fbm } from "./paint";
import { type LK, itemM } from "./lk";

interface Mass { x: number; z: number; w: number; h: number; d: number; e: number; seed: number; lean?: number }

export function buildRock(k: LK, it: LobbyItem): THREE.Vector3[] {
  const s = it.s ?? 1, R = DIM.rock;
  const base = itemM(it);
  const masses: Mass[] = [
    // (lower, broader, leaning masses of varied height — a tall main block reads as a stacked cylinder)
    { x: 0, z: 0, w: R.w * 0.56, h: R.h * 0.72, d: R.d * 0.7, e: 0.3, seed: 1, lean: 0.1 },
    { x: -R.w * 0.28, z: R.d * 0.12, w: R.w * 0.42, h: R.h * 0.7, d: R.d * 0.6, e: 0.36, seed: 2, lean: 0.08 },
    { x: R.w * 0.27, z: -R.d * 0.06, w: R.w * 0.34, h: R.h * 0.82, d: R.d * 0.58, e: 0.34, seed: 3, lean: -0.07 },
    { x: R.w * 0.12, z: -R.d * 0.3, w: R.w * 0.36, h: R.h * 0.94, d: R.d * 0.4, e: 0.42, seed: 4, lean: -0.12 },
    { x: -R.w * 0.46, z: R.d * 0.3, w: R.w * 0.26, h: R.h * 0.36, d: R.d * 0.4, e: 0.4, seed: 5 },
    { x: R.w * 0.46, z: R.d * 0.2, w: R.w * 0.22, h: R.h * 0.3, d: R.d * 0.36, e: 0.42, seed: 6 },
  ];
  const crowns: THREE.Vector3[] = [];
  // the char-05 view set stands at the outcrop's east foot: masses / boulders reaching into its clearings (camera
  // corridor, kong footprint) are left out — one read as a mottled spike in the grass
  const clear = (x: number, z: number, hw: number, hd: number) => {
    for (const [u, v] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      const p = new THREE.Vector3(x + u * hw, 0, z + v * hd).applyMatrix4(base);
      if (inTpClearing(p.x, p.z)) return true;
    }
    return false;
  };
  for (const m of masses) {
    if (clear(m.x * s, m.z * s, m.w * s * 0.5, m.d * s * 0.5)) { for (let i = 0; i < 8; i++) k.r(); continue; }
    const g = massGeo(m.w * s, m.h * s, m.d * s, m.e, m.seed, m.lean ?? 0);
    const mm = new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(m.x * s, -1.2, m.z * s));
    k.b.add("rock", g, mm, "#ffffff");
    for (let i = 0; i < 4; i++) crowns.push(new THREE.Vector3((m.x + (k.r() - 0.5) * m.w * 0.5) * s, m.h * s * 0.93 - 1.2, (m.z + (k.r() - 0.5) * m.d * 0.4) * s).applyMatrix4(base));
  }
  // boulders tumbled at the foot (front side)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI - Math.PI / 2 + (k.r() - 0.5) * 0.3;
    const rr = 0.5 + k.r() * 0.15;
    const bx = Math.sin(a) * R.w * 0.55 * rr * 1.4, bz = Math.cos(a) * R.d * 0.55 * rr * 1.2 + R.d * 0.18;
    const sz = 1.2 + k.r() * 2.6;
    const g = massGeo(sz * (1 + k.r() * 0.5), sz * (0.7 + k.r() * 0.4), sz, 0.45, 10 + i, 0, 3);
    const p = new THREE.Vector3(bx * s, 0, bz * s).applyMatrix4(base);
    const ry = k.r() * 6, rz = (k.r() - 0.5) * 0.3;     // (drawn before the clearing test: the random stream stays put)
    if (clear(bx * s, bz * s, sz * 0.8, sz * 0.8)) continue;
    const gy = k.ground(p.x, p.z);
    k.b.add("rock", g, new THREE.Matrix4().compose(new THREE.Vector3(p.x, gy - sz * 0.25, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(1, 1, 1)), "#ffffff");
  }
  return crowns;
}

/** a boxy superellipsoid block, bottom at y = 0, with strata ledges, lumps and a soft AO ramp in the vertex colour */
function massGeo(w: number, h: number, d: number, e: number, seed: number, lean: number, detail = 5): THREE.BufferGeometry {
  // welded icosphere (smooth normals); uv is unused by the triplanar rock material but kept for merging
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute("uv"); ico.deleteAttribute("normal");
  const g = mergeVertices(ico, 1e-5);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const se = (t: number) => Math.sign(t) * Math.pow(Math.abs(t), e);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // superellipsoid: push the sphere toward a rounded box
    let x = se(v.x), y = se(v.y), z = se(v.z);
    const top = (y + 1) / 2;                                          // 0 bottom .. 1 top
    // taper toward the crown, lean, big lumps
    const taper = 1 - 0.22 * Math.pow(top, 1.6);
    const n1 = fbm(v.x * 1.7 + seed * 3.1, v.z * 1.7 + v.y * 1.3 + seed, 4) - 0.5;
    const n2 = fbm(v.x * 5.1 + seed, v.y * 5.1 - seed * 2, 3) - 0.5;
    // vertical fluting / cracks (karst limestone): radial ridges that run down the faces
    const ang = Math.atan2(v.z, v.x);
    const flute = fbm(ang * 2.2 + seed * 5, v.y * 0.9 + seed, 3) - 0.5;
    const crack = Math.pow(Math.abs(Math.sin(ang * 7 + n1 * 5 + seed)), 12);
    const lump = 1 + n1 * 0.36 + n2 * 0.08 + flute * 0.16 - crack * 0.05;
    x *= taper * lump; z *= taper * lump;
    // strata: horizontal ledges (sawtooth in y shrinks the radius just under each ledge)
    const sy = top * (h / 2.6) + n1 * 0.6;
    const f = sy - Math.floor(sy);
    const ledge = f < 0.2 ? (f / 0.2) * 0.04 : 0.04 - ((f - 0.2) / 0.8) * 0.04;
    x *= 1 - ledge * (0.5 + top); z *= 1 - ledge * (0.5 + top);
    // crown: domed top with bumps
    if (y > 0) y *= 1 + n1 * 0.12;
    let px = (x * w) / 2, py = ((y + 1) / 2) * h, pz = (z * d) / 2;
    px += lean * py;
    if (py < 0.1) py = 0.1 * (py / 0.1);                                  // flat-ish buried foot
    pos.setXYZ(i, px, py, pz);
    // baked AO + value variation: dark at the foot, warm light on the crown, darker in the ledge undercuts
    const ao = 0.55 + 0.45 * Math.min(1, top * 1.6) - (f > 0.8 ? 0.1 : 0) + n2 * 0.25;
    col[i * 3] = ao; col[i * 3 + 1] = ao * 0.98; col[i * 3 + 2] = ao * 0.94;
  }
  g.computeVertexNormals();
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
