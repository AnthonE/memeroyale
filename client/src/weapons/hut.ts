// The stilt-hut interior set for loot-05-ground-loot (the loot-05 view only — never in gameplay; stilt-town proper is
// poi-town's). Built from the hut kit (hut-geo.ts boards / logs / bamboo / lashings, hut-tex.ts painted PBR textures)
// and merged into ONE mesh per material (~12 draws for the whole set; ~150 separate meshes cost +1.5 ms).
// Target art: a warm plank floor lit in stripes by sun through the slatted walls, visible sun shafts in the air, log posts
// + rafters under a thatch roof, a wide doorway onto the turquoise lagoon with stilt houses across the water, crates
// with bananas + a banded barrel + a woven basket on the left, big monstera leaves + a crate + a rope coil on the right.
import * as THREE from "three";
import type { WorldCtx } from "../engine/engine";
import { Bin, board, logGeo, bambooGeo, lashing, ropeTube, tf, uvPlanarY } from "./hut-geo";
import { floorTex, grainTex, endGrainTex, bambooTex, thatchTex, wovenTex, tinTex, blobTex } from "./hut-tex";
import { PartBuilder } from "./lib/builder";
import { C, rng, bananaPath } from "./lib/mats";
import { bananaGeometry, bananaEnd, filletCyl, alignY } from "./lib/geo";

type V3 = [number, number, number];
const pbr = (t: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0, vertexColors: true, ...o });

/** a monstera leaf: lobed outline with holes, midrib crease, drooping (leaf texture on a curved extrusion-less sheet) */
function monsteraGeo(size: number, seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const s = new THREE.Shape();
  const N = 11;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = Math.PI * (0.05 + 0.9 * t);
    const rr = 0.5 * (0.85 + 0.15 * Math.sin(t * Math.PI));
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 1.15 + 0.1;
    pts.push(new THREE.Vector2(x, y));
    if (i < N) { // a split between lobes: cut in toward the midrib
      const a2 = Math.PI * (0.05 + 0.9 * (t + 0.5 / N)), cut = 0.22 + r() * 0.12;
      pts.push(new THREE.Vector2(Math.cos(a2) * cut, Math.sin(a2) * cut * 1.15 + 0.1));
    }
  }
  s.moveTo(0, -0.02); for (const p of pts) s.lineTo(p.x, p.y); s.lineTo(0, -0.02);
  // fenestrations: two rows of oval holes either side of the midrib
  for (let i = 1; i < N - 1; i++) {
    if (i === Math.floor(N / 2)) continue;
    const t = i / N, a = Math.PI * (0.05 + 0.9 * t);
    for (const rr of [0.19, 0.31]) {
      if (rr > 0.3 && (i % 2)) continue;
      const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr * 1.15 + 0.1, hw = 0.028 + r() * 0.012, hh = 0.012 + r() * 0.006;
      const h = new THREE.Path();
      for (let k = 0; k <= 12; k++) { const b = (k / 12) * Math.PI * 2; const px = cx + (Math.cos(b) * hw * Math.cos(a) - Math.sin(b) * hh * Math.sin(a)), py = cy + (Math.cos(b) * hw * Math.sin(a) + Math.sin(b) * hh * Math.cos(a)); k ? h.lineTo(px, py) : h.moveTo(px, py); }
      s.holes.push(h);
    }
  }
  const g = new THREE.ShapeGeometry(s, 3);
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    uv.setXY(i, x + 0.5, y);
    // droop toward the tip + fold along the midrib
    p.setXYZ(i, x * size, y * size, (-0.18 * y * y - 0.08 * Math.abs(x)) * size);
  }
  g.computeVertexNormals();
  return g;
}
let leafTexCache: THREE.CanvasTexture | null = null;
function monsteraTex(): THREE.CanvasTexture {
  if (leafTexCache) return leafTexCache;
  const S = 512, c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(S / 2, S * 0.1, 10, S / 2, S * 0.4, S * 0.7); g.addColorStop(0, "#5bb040"); g.addColorStop(1, "#2f7a24");
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.strokeStyle = "rgba(200,235,140,.8)"; x.lineWidth = 7; x.beginPath(); x.moveTo(S / 2, S); x.lineTo(S / 2, 0); x.stroke();
  x.strokeStyle = "rgba(170,220,120,.45)"; x.lineWidth = 3;
  for (let i = 0; i < 12; i++) { const a = Math.PI * (0.08 + 0.84 * (i / 11)); x.beginPath(); x.moveTo(S / 2, S * (1 - (0.12 + 0.05 * Math.abs(i - 5.5)))); x.lineTo(S / 2 + Math.cos(a) * S * 0.5, S * (1 - Math.sin(a) * 0.55 - 0.1)); x.stroke(); }
  leafTexCache = new THREE.CanvasTexture(c); leafTexCache.colorSpace = THREE.SRGBColorSpace; leafTexCache.anisotropy = 8;
  return leafTexCache;
}

export function buildHut(ctx: WorldCtx): { root: THREE.Group; floorY: number } {
  const root = new THREE.Group(); root.name = "weapons-hut";
  const floorY = 0;
  const W = 6.4, D = 7.2, H = 2.9;          // interior: x ±W/2, z from +D/2 (behind the camera) to −D/2 (the doorway wall)
  const x0 = -W / 2, x1 = W / 2, zB = -D / 2, zF = D / 2;
  const r = rng(77);
  // ---- materials (one Bin each)
  const floorM = pbr(floorTex(), { roughness: 1 }); floorM.name = "hut-floor";
  const woodM = pbr(grainTex()); woodM.name = "hut-wood";
  const logM = pbr(grainTex()); logM.name = "hut-log";
  const capM = new THREE.MeshStandardMaterial({ map: endGrainTex(), roughness: 0.9, vertexColors: true }); capM.name = "hut-endgrain";
  const bamM = pbr(bambooTex()); bamM.name = "hut-bamboo";
  const thatchM = pbr(thatchTex(), { side: THREE.DoubleSide }); thatchM.name = "hut-thatch";
  const wovenM = pbr(wovenTex()); wovenM.name = "hut-woven";
  const tinM = pbr(tinTex(), { metalness: 0.3 }); tinM.name = "hut-tin";
  const ropeM = new THREE.MeshStandardMaterial({ color: "#c9a36b", roughness: 0.9, vertexColors: true }); ropeM.name = "hut-rope";
  const leafM = new THREE.MeshStandardMaterial({ map: monsteraTex(), roughness: 0.55, side: THREE.DoubleSide, vertexColors: true }); leafM.name = "hut-leaf";
  const floor = new Bin(floorM, "hut-floor"), wood = new Bin(woodM, "hut-wood"), logs = new Bin(logM, "hut-logs"), caps = new Bin(capM, "hut-caps"),
    bam = new Bin(bamM, "hut-bamboo"), thatch = new Bin(thatchM, "hut-thatch"), woven = new Bin(wovenM, "hut-woven"), tin = new Bin(tinM, "hut-tin"),
    rope = new Bin(ropeM, "hut-rope"), leaves = new Bin(leafM, "hut-leaves");
  const log = (a: V3, b: V3, rad: number, tint = "#c89468", seed = 1) => { const g = logGeo(a, b, rad, { seed }); logs.add(g.side, undefined, tint); if (g.caps) caps.add(g.caps, undefined, "#e0b890"); };
  // ---- floor: one big deck (the texture carries planks + joints), a darker apron board all round
  const fg = uvPlanarY(new THREE.BoxGeometry(W + 0.6, 0.1, D + 0.6).translate(0, -0.05, 0), 1 / 2.4);
  floor.add(fg, undefined, "#ffffff");
  // ---- posts (logs) at the corners, along the side walls and framing the doorway
  const postsX: Array<[number, number]> = [[x0 + 0.12, zB + 0.12], [x1 - 0.12, zB + 0.12], [x0 + 0.12, zF - 0.12], [x1 - 0.12, zF - 0.12], [x0 + 0.12, -0.6], [x1 - 0.12, -0.6], [x0 + 0.12, 1.8], [x1 - 0.12, 1.8], [-0.95, zB + 0.12], [1.85, zB + 0.12]];
  postsX.forEach(([x, z], i) => log([x, floorY - 0.1, z], [x, floorY + H + 0.15, z], 0.11, "#c08a5c", 10 + i));
  // top beams + rafters
  log([x0, H, zB + 0.12], [x1, H, zB + 0.12], 0.1, "#b88052", 30); log([x0, H, zF - 0.12], [x1, H, zF - 0.12], 0.1, "#b88052", 31);
  log([x0 + 0.12, H, zB], [x0 + 0.12, H, zF], 0.1, "#b88052", 32); log([x1 - 0.12, H, zB], [x1 - 0.12, H, zF], 0.1, "#b88052", 33);
  for (let i = 0; i < 6; i++) { const z = zB + 0.6 + i * 1.25; log([x0 - 0.2, H + 0.35, z], [x1 + 0.2, H + 0.35, z], 0.08, "#a87248", 40 + i); }
  log([0.3, H + 0.95, zB - 0.2], [0.3, H + 0.95, zF + 0.2], 0.1, "#a87248", 50);
  // thatch: two roof slopes above the rafters (underside visible)
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(W * 0.62, D + 1.2, 1, 1);
    const pg = g.attributes.position as THREE.BufferAttribute, uv = new Float32Array(pg.count * 2);
    for (let i = 0; i < pg.count; i++) { uv[i * 2] = pg.getX(i) * 0.8; uv[i * 2 + 1] = pg.getY(i) * 0.8; }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    thatch.add(g, tf([s * W * 0.27 + 0.3, H + 0.68, 0], [-Math.PI / 2, s * -0.36, Math.PI / 2]), "#ffffff");
  }
  // ---- slatted walls: horizontal boards with sun gaps (left + right), the back wall slatted left of the doorway
  const slats = (xa: number, za: number, xb: number, zb: number, y0 = 0.02, y1 = H - 0.05, h = 0.13, gap = 0.055, seed = 1, win?: [number, number]) => {
    const len = Math.hypot(xb - xa, zb - za), ang = Math.atan2(xb - xa, zb - za);
    let k = 0;
    for (let y = y0; y + h <= y1; y += h + gap * (y > 0.5 ? 1 : 0.15)) {
      if (win && y > win[0] && y + h < win[1]) {
        // a window opening in the middle third of this wall: two short slat pieces either side
        for (const [a, b] of [[0, 0.3], [0.72, 1]] as Array<[number, number]>) {
          const l2 = len * (b - a) - 0.04, t = (a + b) / 2;
          const g = board(0.035, h, l2, 0.01, seed * 31 + k);
          wood.add(g, tf([xa + (xb - xa) * t, floorY + y + h / 2, za + (zb - za) * t], [0, ang, (r() - 0.5) * 0.01]), k % 3 === 0 ? "#c79a6a" : "#d8ab78");
        }
        k++;
        continue;
      }
      const g = board(0.035, h, len - 0.04, 0.01, seed * 31 + k);
      wood.add(g, tf([(xa + xb) / 2, floorY + y + h / 2, (za + zb) / 2], [0, ang, (r() - 0.5) * 0.01]), k % 3 === 0 ? "#c79a6a" : "#d8ab78");
      k++;
    }
  };
  slats(x0 + 0.05, zB, x0 + 0.05, zF, 0.02, H - 0.05, 0.13, 0.06, 1, [0.85, 2.3]);
  // window sill + lintel on the left wall
  log([x0 + 0.05, 0.85, zB + D * 0.3], [x0 + 0.05, 0.85, zB + D * 0.72], 0.06, "#b07a4c", 80); log([x0 + 0.05, 2.32, zB + D * 0.3], [x0 + 0.05, 2.32, zB + D * 0.72], 0.06, "#b07a4c", 81);
  slats(x1 - 0.05, zB, x1 - 0.05, zF, 0.02, H - 0.05, 0.13, 0.06, 2);
  slats(x0 + 0.1, zB + 0.05, -1.05, zB + 0.05, 0.02, H - 0.05, 0.14, 0.05, 3);
  slats(1.95, zB + 0.05, x1 - 0.1, zB + 0.05, 0.02, H - 0.05, 0.14, 0.05, 4);
  // doorway: a sill board + a lintel log; bamboo lashing at the post tops
  wood.add(board(2.8, 0.08, 0.2, 0.01, 9), tf([0.45, floorY + 0.02, zB + 0.1]), "#b8875a");
  log([-1.0, H - 0.25, zB + 0.12], [1.9, H - 0.25, zB + 0.12], 0.09, "#b07a4c", 60);
  for (const [x, z] of postsX) rope.add(lashing([x, H - 0.1, z], [0, 1, 0], 0.115, 4, 0.016), undefined, "#ffffff");
  // ---- left dressing: crate stack with bananas, banded barrel, woven basket, bamboo pole
  const crate = (x: number, y: number, z: number, s: number, ry: number, seed: number) => {
    const m = tf([x, floorY + y, z], [0, ry, 0]);
    for (let i = 0; i < 3; i++) for (const sz of [1, -1]) wood.add(board(s, s * 0.3, 0.03, 0.008, seed + i), new THREE.Matrix4().multiplyMatrices(m, tf([0, s * (0.17 + i * 0.32), sz * s * 0.5])), i === 1 ? "#d6a672" : "#c69262");
    for (let i = 0; i < 3; i++) for (const sx of [1, -1]) wood.add(board(0.03, s * 0.3, s, 0.008, seed + 7 + i), new THREE.Matrix4().multiplyMatrices(m, tf([sx * s * 0.5, s * (0.17 + i * 0.32), 0])), "#c89464");
    wood.add(board(s, 0.03, s, 0.008, seed + 20), new THREE.Matrix4().multiplyMatrices(m, tf([0, s * 0.98, 0])), "#d4a26e");
    // corner battens
    for (const sx of [1, -1]) for (const sz of [1, -1]) wood.add(board(0.06, s, 0.06, 0.01, seed + 30), new THREE.Matrix4().multiplyMatrices(m, tf([sx * s * 0.5, s * 0.5, sz * s * 0.5])), "#9a6a42");
  };
  crate(-2.55, 0, -1.3, 0.85, 0.12, 100);
  crate(-2.5, 0.85, -1.35, 0.7, -0.15, 200);
  crate(2.55, 0, 0.1, 0.8, -0.3, 300);
  // barrel: vertical staves (logs of tiny radius would be heavy — a lathe of boards) + tin hoops
  {
    const prof: Array<[number, number]> = [[0.3, 0], [0.34, 0.2], [0.36, 0.45], [0.34, 0.7], [0.3, 0.9]];
    const lg = new THREE.LatheGeometry(prof.map(([rr, y]) => new THREE.Vector2(rr, y)), 24);
    const uv = lg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.9, uv.getX(i) * 3.2);
    wood.add(lg, tf([-1.65, floorY, -2.6]), "#b98050");
    wood.add(new THREE.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2), tf([-1.65, floorY + 0.9, -2.6]), "#9a6840");
    for (const y of [0.12, 0.45, 0.78]) tin.add(new THREE.TorusGeometry(y === 0.45 ? 0.365 : 0.335, 0.018, 6, 36), tf([-1.65, floorY + y, -2.6], [Math.PI / 2, 0, 0]), "#3a86a0");
  }
  // woven basket
  {
    const prof: Array<[number, number]> = [[0.18, 0], [0.25, 0.1], [0.27, 0.3], [0.25, 0.42]];
    const lg = new THREE.LatheGeometry(prof.map(([rr, y]) => new THREE.Vector2(rr, y)), 24);
    const uv = lg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 1.5);
    woven.add(lg, tf([-1.0, floorY, -2.8]), "#ffffff");
    woven.add(new THREE.TorusGeometry(0.25, 0.025, 6, 28), tf([-1.0, floorY + 0.42, -2.8], [Math.PI / 2, 0, 0]), "#d0b080");
  }
  bam.add(bambooGeo([-2.9, floorY + 0.05, 2.6], [-1.4, floorY + 1.6, 3.2], 0.045, 0.42, 12, 5), undefined, "#ffffff");
  // rope coil on the right floor
  for (let k = 0; k < 4; k++) { const pts: THREE.Vector3[] = []; for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2; pts.push(new THREE.Vector3(2.3 + Math.cos(a) * (0.2 - k * 0.035), floorY + 0.022 + k * 0.03, 1.6 + Math.sin(a) * (0.2 - k * 0.035))); } rope.add(ropeTube(pts, 0.022, true), undefined, "#ffffff"); }
  // ---- bananas: bunches on the crates (left) and on the right crate
  const pb = new PartBuilder();
  const bunch = (c: THREE.Vector3, n: number, ry: number) => {
    for (let i = 0; i < n; i++) {
      const fan = (i - (n - 1) / 2) * 0.22 + ry, len = 0.26, rad = 0.038;
      const g = bananaGeometry({ length: len, radius: rad, bend: 0.9, facets: 5, round: 0.45, along: 24, radial: 24 });
      const dir = new THREE.Vector3(Math.cos(fan), 0.15, Math.sin(fan)).normalize(), up = new THREE.Vector3(0, 1, 0).projectOnPlane(dir).normalize();
      const m = new THREE.Matrix4().makeBasis(dir, up, new THREE.Vector3().crossVectors(dir, up)).setPosition(c.clone().add(new THREE.Vector3(0, (i % 2) * 0.03, 0)));
      pb.addGradient(g, C.bananaDeep, C.banana, "y", "gloss", m);
      const t = bananaEnd({ length: len, radius: rad, bend: 0.9 }, true);
      pb.add(new THREE.SphereGeometry(rad * 0.25, 8, 6), "#3a2414", "matte", new THREE.Matrix4().makeTranslation(t.center.clone().applyMatrix4(m)));
    }
    pb.add(filletCyl(0.035, 0.07, 0.01, 10, 0.028, 0.04), C.brownDark, "matte", alignY(c.clone().add(new THREE.Vector3(-0.03, 0.02, 0)), new THREE.Vector3(-Math.cos(ry), 0.3, -Math.sin(ry))));
  };
  bunch(new THREE.Vector3(-2.6, floorY + 1.6, -1.45), 5, 0.3);
  bunch(new THREE.Vector3(-2.35, floorY + 1.6, -1.1), 4, 1.2);
  bunch(new THREE.Vector3(2.45, floorY + 0.84, 0.05), 5, 2.6);
  bunch(new THREE.Vector3(-1.0, floorY + 0.44, -2.8), 3, 0.4);
  // ---- monstera: big leaves on stems, right foreground + one behind the barrel
  for (const [x, z, n, s, a0] of [[2.6, 1.1, 6, 0.85, 2.4], [2.75, -1.6, 4, 0.6, 2.0], [-2.75, 0.4, 3, 0.55, -0.6], [-4.2, -1.2, 7, 1.3, 0.2], [-4.4, 0.6, 6, 1.2, -0.3]] as Array<[number, number, number, number, number]>) {
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - n / 2) * 0.5, tilt = 0.5 + r() * 0.5, hgt = 0.45 + r() * 0.5;
      const base = new THREE.Vector3(x, floorY, z), top = base.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, hgt, Math.sin(a) * 0.3));
      bam.add(new THREE.CylinderGeometry(0.012, 0.018, base.distanceTo(top), 6).translate(0, base.distanceTo(top) / 2, 0), new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(base).normalize()), new THREE.Vector3(1, 1, 1)), "#4a8a2a");
      const lg = monsteraGeo(s * (0.8 + r() * 0.4), 70 + i);
      leaves.add(lg, new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, -a + Math.PI / 2, 0, "YXZ")), new THREE.Vector3(1, 1, 1)), "#ffffff");
    }
  }
  // ---- across the water: three stilt houses (framed by the doorway), deck + stilts + board walls + tin/thatch roof
  const house = (cx: number, cz: number, s: number, seed: number) => {
    const y0 = -2.4, deck = 1.6;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) log([cx + dx * 2.2 * s, y0 - 0.5, cz + dz * 1.8 * s], [cx + dx * 2.2 * s, y0 + deck + 0.1, cz + dz * 1.8 * s], 0.12 * s, "#8a6040", seed + dx * 3 + dz);
    wood.add(board(5 * s, 0.15, 4 * s, 0.02, seed), tf([cx, y0 + deck, cz]), "#b8875a");
    for (const [dx, dz, w, d] of [[0, -1, 4.2, 0.1], [0, 1, 4.2, 0.1], [-1, 0, 0.1, 3.4], [1, 0, 0.1, 3.4]] as Array<[number, number, number, number]>) wood.add(board(w * s, 2.2 * s, d * s + 0.02, 0.02, seed + dx), tf([cx + dx * 2.1 * s, y0 + deck + 1.1 * s, cz + dz * 1.7 * s]), dx === 0 && dz === 1 ? "#c9955f" : "#b88452");
    const roof = new THREE.ConeGeometry(3.6 * s, 1.9 * s, 4, 1, true); roof.rotateY(Math.PI / 4);
    const uv = roof.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2);
    (seed % 2 ? tin : thatch).add(roof, tf([cx, y0 + deck + 2.2 * s + 0.95 * s, cz]), "#ffffff");
  };
  house(-9, -34, 1.1, 501); house(7, -42, 1.3, 502); house(-24, -48, 1.0, 503);
  // boardwalk from the doorway out over the water
  for (let i = 0; i < 9; i++) wood.add(board(1.8, 0.07, 0.24, 0.01, 600 + i), tf([0.4, floorY - 0.04, zB - 0.4 - i * 0.27], [0, (r() - 0.5) * 0.03, 0]), i % 2 ? "#b8875a" : "#c89464");
  for (const i of [1, 5, 8]) for (const sx of [-1, 1]) log([0.4 + sx * 0.8, -2.8, zB - 0.4 - i * 0.27], [0.4 + sx * 0.8, floorY - 0.05, zB - 0.4 - i * 0.27], 0.07, "#8a6040", 700 + i + sx);
  // ---- build the bins
  for (const bin of [floor, wood, logs, caps, bam, thatch, woven, tin, rope, leaves]) { const m = bin.build(); if (m) root.add(m); }
  const pbuilt = pb.build({ name: "hut-bananas" }); root.add(pbuilt.root);
  // ---- sun shafts: soft additive quads along the real sun direction, starting at the wall gaps (dust in the air)
  const sunDir = ((ctx.shared.get("sunDir") as THREE.Vector3 | undefined) ?? new THREE.Vector3(-0.4, 0.67, -0.63)).clone().normalize();
  const shaftTex = (() => { const cv = document.createElement("canvas"); cv.width = 64; cv.height = 256; const x = cv.getContext("2d")!; const g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 256); x.globalCompositeOperation = "destination-in"; const v = x.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.2, "rgba(0,0,0,1)"); v.addColorStop(0.8, "rgba(0,0,0,.7)"); v.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = v; x.fillRect(0, 0, 64, 256); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const shaftM = new THREE.MeshBasicMaterial({ map: shaftTex, color: new THREE.Color(1.0, 0.8, 0.45).multiplyScalar(0.11), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  shaftM.name = "hut-shafts";
  const shafts = new Bin(shaftM, "hut-shafts", { cast: false, receive: false });
  const L = 3.2;
  const down = sunDir.clone().negate();
  const side = new THREE.Vector3().crossVectors(down, new THREE.Vector3(0, 1, 0)).normalize();
  for (let i = 0; i < 14; i++) {
    // entry points: gaps in the left wall + the top of the doorway
    const entry = i < 9 ? new THREE.Vector3(x0 + 0.1, floorY + 1.0 + (i % 3) * 0.19 + 0.6, -2.6 + i * 0.55) : new THREE.Vector3(-0.8 + (i - 9) * 0.6, floorY + H - 0.3, zB + 0.2);
    const g = new THREE.PlaneGeometry(0.28 + r() * 0.3, L);
    g.translate(0, -L / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);
    const m = new THREE.Matrix4().compose(entry, q, new THREE.Vector3(1, 1, 1));
    // face the quad roughly toward the camera side (+Z): rotate about the shaft axis
    m.multiply(new THREE.Matrix4().makeRotationY(Math.atan2(side.x, side.z) * 0 + 0.3));
    shafts.add(g, m, "#ffffff");
  }
  const sm = shafts.build(); if (sm) { sm.renderOrder = 3; root.add(sm); }
  // ---- sun-slat light stripes on the floor: the sun coming through the
  // slatted left wall paints warm diagonal stripes across the planks — a projected light cookie (additive, warm, soft
  // edged bars of varying width with a little breakup), lying just above the deck
  {
    const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 1024;
    const x = cv.getContext("2d")!;
    x.fillStyle = "#000"; x.fillRect(0, 0, 1024, 1024);
    x.save(); x.translate(512, 512); x.rotate(-0.62);
    let yy = -900;
    const rr = rng(91);
    while (yy < 900) {
      const w = 34 + rr() * 60, gap = 40 + rr() * 70;
      const g = x.createLinearGradient(0, yy, 0, yy + w);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.18, "rgba(255,255,255,1)"); g.addColorStop(0.82, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.fillRect(-1400, yy, 2800, w);
      yy += w + gap;
    }
    x.restore();
    // breakup: the light falls off toward the back + the right, dappled a little
    const fall = x.createLinearGradient(0, 0, 1024, 0); fall.addColorStop(0, "rgba(0,0,0,0)"); fall.addColorStop(0.75, "rgba(0,0,0,.25)"); fall.addColorStop(1, "rgba(0,0,0,.85)");
    x.fillStyle = fall; x.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(0,0,0,${0.08 + rr() * 0.15})`; x.beginPath(); x.ellipse(rr() * 1024, rr() * 1024, 20 + rr() * 60, 8 + rr() * 20, rr() * 3, 0, Math.PI * 2); x.fill(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const cookieM = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.0, 0.72, 0.36).multiplyScalar(0.62), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true, polygonOffset: true, polygonOffsetFactor: -2 });
    cookieM.name = "hut-sun-slats";
    const cookie = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, D - 1.0).rotateX(-Math.PI / 2), cookieM);
    cookie.position.set(0, floorY + 0.004, -0.2); cookie.name = "hut-sun-slats"; cookie.renderOrder = 2; cookie.userData.castShadow = false;
    root.add(cookie);
  }
  // ---- soft contact shadows under props (blob decals)
  const blobM = new THREE.MeshBasicMaterial({ map: blobTex(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
  blobM.name = "hut-blob";
  const blobs = new Bin(blobM, "hut-blobs", { cast: false, receive: false });
  for (const [x, z, s] of [[-2.55, -1.3, 1.3], [-1.65, -2.6, 0.9], [-1.0, -2.8, 0.7], [2.55, 0.1, 1.2], [2.3, 1.6, 0.6]] as Array<[number, number, number]>) blobs.add(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), tf([x, floorY + 0.006, z]), "#ffffff");
  const bm = blobs.build(); if (bm) root.add(bm);
  // ---- warm bounce: the target art's interior glows with sunlight bouncing off the floor + the lagoon (this set only)
  // a low bounce (the target art's interior is dark with hard warm sun slats, not evenly sky-lit) so the
  // shade stays dark and the sun stripes carry the light
  const hemi = new THREE.HemisphereLight("#ffe2b8", "#8a5430", 0.32); hemi.name = "hut-bounce"; root.add(hemi);
  const door = new THREE.PointLight("#ffd9a0", 2.6, 8, 1.6); door.position.set(0.4, floorY + 1.6, zB + 0.8); door.name = "hut-door-light"; root.add(door);
  void bananaPath; void side;
  return { root, floorY };
}
