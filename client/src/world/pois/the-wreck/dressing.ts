// THE WRECK — dressing: algae-covered reef rocks, banana piles pouring out of every open container (big stylized
// fruit, heaped 0.5–1 m on a painted mound), loose hands on the sand, creepers hanging off the hulls, ferns / bushes
// rooted on the decks (VegApi), palms leaning in from the beach + a monstera / fern / banana-plant foreground, a rocky
// bluff behind the bow half, and gulls circling the masts.
import * as THREE from "three";
import { walkPieces, WALK, BLUFF, ROCK_BAKE, ROCK_SIG, rockSets, BOW, BREAK_DEBRIS, CONTAINERS, LOOKOUT, ROCKS, SECTIONS, STERN, colliders, debrisFrame, deckY, fromCam, halfBreadth, lookoutAt, sectionToWorld, type HullSection } from "../../../../../shared/pois/the-wreck";
import { rockInstances, rockProtos } from "../_kit/jungle-rocks";
import { pbr, stoneMaterial } from "../_kit/jungle-mat";
import { CONTAINER_DIMS, boxGrid, capsuleClear } from "../../../../../shared/pois/harbor-kit";
import type { PlantKind, VegApi } from "../../veg/api";
import { Builder, hash, mergeCasters, mergeInstanced, shadowOnly } from "../_kit/harbor-geo";
import { BananaKit, moundGeo } from "../_kit/harbor-bananas";
import { placementMatrix } from "../_kit/containers";
import { canvas, paintNoise, scratches, tex } from "../_kit/harbor-paint";
import { wreckMats } from "./wreck-mats";
import type { WreckCtx } from "./freighter";

// ------------------------------------------------------------------------------------------------ vines
/** a hanging creeper sheet: top anchored at `a` (world), hangs `len` m, width w, facing yaw (world) */
function vine(pos: number[], uv: number[], a: [number, number, number], len: number, w: number, yaw: number, sway: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw), segs = 5;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const off0 = Math.sin(t0 * Math.PI) * sway, off1 = Math.sin(t1 * Math.PI) * sway;
    const y0 = a[1] - len * t0, y1 = a[1] - len * t1;
    const P = (dx: number, y: number, o: number): number[] => [a[0] + c * dx - s * o, y, a[2] - s * dx - c * o];
    const A = P(-w / 2, y0, off0), B = P(w / 2, y0, off0), C = P(w / 2, y1, off1), D = P(-w / 2, y1, off1);
    for (const [p, q] of [[A, [0, 1 - t0]], [B, [1, 1 - t0]], [C, [1, 1 - t1]], [A, [0, 1 - t0]], [C, [1, 1 - t1]], [D, [0, 1 - t1]]] as Array<[number[], number[]]>) { pos.push(...p); uv.push(...q); }
  }
}

// ------------------------------------------------------------------------------------------------ bamboo
let bambooCache: THREE.MeshStandardMaterial | null = null;
/** yellow-green bamboo with node rings + fibre streaks (u around, v along the pole, metre UVs) */
function bambooMat(): THREE.MeshStandardMaterial {
  if (bambooCache) return bambooCache;
  const [el, c] = canvas(128, 512);
  const g = c.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, "#8a7433"); g.addColorStop(0.4, "#b99e55"); g.addColorStop(0.7, "#a58c47"); g.addColorStop(1, "#7a6630");
  c.fillStyle = g; c.fillRect(0, 0, 128, 512);
  for (let y = 0; y < 512; y += 128) { c.fillStyle = "rgba(90,70,20,0.8)"; c.fillRect(0, y, 128, 6); c.fillStyle = "rgba(255,240,180,0.5)"; c.fillRect(0, y + 6, 128, 3); }
  paintNoise(c, 0, 0, 128, 512, { seed: 5201, scale: 200, alpha: 0.25, blend: "overlay" });
  const t = tex(el); t.repeat.set(1, 1);
  scratches(c, 0, 0, 128, 512, { n: 60, color: "rgba(60,45,20,1)", alpha: 0.35, seed: 5202, lenMin: 20, lenMax: 120, width: 1.2 });
  bambooCache = new THREE.MeshStandardMaterial({ map: t, roughness: 0.62, metalness: 0, name: "bamboo" });
  return bambooCache;
}

// ------------------------------------------------------------------------------------------------ sand berms
let bermCache: THREE.MeshStandardMaterial | null = null;
/** beach sand (the terrain's warm cream + pebble specks + wind ripples), fading out at the berm's rim (vertex alpha) */
function bermMat(): THREE.MeshStandardMaterial {
  if (bermCache) return bermCache;
  const S = 512, [el, c] = canvas(S, S);
  c.fillStyle = "#e2bf8a"; c.fillRect(0, 0, S, S);
  paintNoise(c, 0, 0, S, S, { seed: 5301, scale: 300, alpha: 0.25, blend: "overlay" });
  for (let y = 0; y < S; y += 9) { c.fillStyle = "rgba(170,140,100,0.12)"; c.fillRect(0, y + Math.sin(y) * 3, S, 2); }
  const r = rngLocal(5302);
  for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.7 ? "rgba(120,100,80,0.5)" : "rgba(255,248,230,0.6)"; c.beginPath(); c.arc(r() * S, r() * S, 0.8 + r() * 1.8, 0, 6.283); c.fill(); }
  bermCache = new THREE.MeshStandardMaterial({ map: tex(el, { aniso: 8 }), vertexColors: true, transparent: true, depthWrite: false, roughness: 0.95, metalness: 0, name: "wreck-berm", polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  return bermCache;
}
function rngLocal(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------------------------------------ gulls
function gullGeo(): THREE.BufferGeometry {
  // body + two cranked wings (a stylized seabird silhouette, ~1.1 m span)
  const pos = [
    0, 0, -0.28, 0.07, 0.02, 0.2, -0.07, 0.02, 0.2,            // body
    0, 0.02, -0.05, 0.25, 0.06, 0.02, 0.05, 0.02, 0.12,          // right inner
    0.25, 0.06, 0.02, 0.56, -0.02, 0.1, 0.18, 0.04, 0.12,        // right outer
    0, 0.02, -0.05, -0.05, 0.02, 0.12, -0.25, 0.06, 0.02,        // left inner
    -0.25, 0.06, 0.02, -0.18, 0.04, 0.12, -0.56, -0.02, 0.1,     // left outer
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export async function dressWreck(w: WreckCtx) {
  const Y = () => w.ctx.yield();
  const { ctx, mats, group } = w;
  const M = wreckMats();
  const T = ctx.terrain;
  const ground = (x: number, z: number) => T.height(x, z);

  // ---- reef + beach rocks: sculpted boulders (poi-jungle kit), algae-green on top, dark + glossy at the waterline,
  // foam rings where they break the surface
  const stone = stoneMaterial(pbr(ctx, "boulder"), { triplanar: true, scale: 2.4, moss: 0.7, mossColor: "#5f9a2e", wetY: -0.25, wetFade: 0.5, variation: 0.4, lift: 0.25, color: "#cfc6b8" }, pbr(ctx, "moss"));
  const water = ctx.shared.get("water") as { registerFoamCircle?: (x: number, z: number, r: number, s?: number) => void } | undefined;
  // (one placement list for the drawn rocks AND their colliders — shared rockSets)
  for (const k of ROCKS) { const gy = k.y ?? ground(k.x, k.z); if (gy < 0.3 && gy + k.r * 0.9 > -0.3) water?.registerFoamCircle?.(k.x, k.z, k.r * 1.25, 0.8); }
  const RS = ROCK_BAKE?.sig === ROCK_SIG ? ROCK_BAKE.sets : rockSets();
  const big = RS.big.pl, small = RS.small.pl;
  // static: baked into one mesh per material (perf: 7 prototypes × 2–3 passes = 14 draws → 3)
  // (perf: ONE cell for the whole reef — 3 + 4 cell
  // meshes + 6 shadow draws became 1 casting + 1 non-casting mesh)
  const rocks = mergeInstanced(rockInstances(rockProtos(RS.big.fam, RS.big.n, RS.big.res), big, stone, "wreck-rocks"), "wreck-rocks", 2000);
  const pebbles = mergeInstanced(rockInstances(rockProtos(RS.small.fam, RS.small.n, RS.small.res), small, stone, "wreck-rocks-small"), "wreck-rocks-small", 2000);
  pebbles.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.userData.castShadow = false; } });
  rocks.add(...pebbles.children);
  group.add(rocks);
  w.lod?.add(rocks, { show: 450 });

  await Y();
  // ---- foam where the spilled boxes break the surface (white wash around every half-sunk container)
  {
    const mm = new THREE.Matrix4(), v = new THREE.Vector3();
    for (const p of CONTAINERS) {
      const d = CONTAINER_DIMS[p.size ?? 40];
      placementMatrix(p, mm);
      for (const fx of [-0.4, 0, 0.4]) {
        v.set(fx * d.L, d.H * 0.5, 0).applyMatrix4(mm);
        if (v.y > -1.3 && v.y < 1.6 && ground(v.x, v.z) < 0.1) water?.registerFoamCircle?.(v.x, v.z, 2.0, 0.7);
      }
    }
  }

  await Y();
  // ---- bananas: every open door above the water pours a HEAP of hands (tumbling out of the box onto the sand, a
  // tongue of fruit fanning out further), the box behind packed with hands; loose hands + fruit across the beach
  const bk = new BananaKit();
  const m = new THREE.Matrix4(), door = new THREE.Vector3(), dir = new THREE.Vector3();
  const gnd = (x: number, z: number) => Math.max(ground(x, z), -0.45);
  CONTAINERS.forEach((p, i) => {
    if (!p.open) return;
    const d = CONTAINER_DIMS[p.size ?? 40];
    placementMatrix(p, m);
    door.set(d.L / 2 + 0.1, 0.25, 0).applyMatrix4(m);
    dir.set(1, 0, 0).transformDirection(m); dir.y = 0; dir.normalize();
    if (door.y < -1.2) return;
    const yawD = Math.atan2(-dir.z, dir.x);
    // hands still packed inside the doors (two layers on the box floor, rising toward the doors)
    // the load still inside: a skinned heap on the box floor rising to the sill + two hero hands in the doorway
    // (only in boxes lying near level — an upright dome would poke through a rolled box's wall)
    if (Math.abs(p.roll ?? 0) < 0.3 && Math.abs(p.pitch ?? 0) < 0.35) { const q = new THREE.Vector3(d.L / 2 - 1.6, 0.25, 0).applyMatrix4(m); if (q.y > -0.6) bk.heap(q.x, q.y, q.z, 1.6, 0.85, 0.7, 700 + i, undefined, yawD, 1.6); }
    for (let k = 0; k < 2; k++) {
      const q = new THREE.Vector3(d.L / 2 - 0.4 - k * 0.5, 0.55, (hash(i, k) - 0.5) * 1.2).applyMatrix4(m);
      if (q.y > -0.6) bk.hand(q.x, q.y, q.z, yawD + hash(i, k, 2) * 6.28, 6, 1.4, 900 + i * 13 + k);
    }
    // the heap: a DOMED 0.6–1 m mound pouring out of the doors, a lower lobe beyond it, fruit strewn further
    const r0 = 1.2 + hash(i, 1) * 0.5, h0 = Math.max(0.65, Math.min(1.1, door.y - gnd(door.x, door.z) + 0.6));
    const hx = door.x + dir.x * (r0 * 0.6), hz = door.z + dir.z * (r0 * 0.6);
    // (a heap in the shallows sits ON the water — bananas float — instead of rising
    // from the seabed, so no fruit-skinned skirt shows through the water under a hard foam line)
    // (+6 cm — the whole skirt clears the water surface, so the shoreline foam band passes UNDER the heap instead of
    // slicing through it)
    // (above the WATER'S OWN surface there — the swash film runs ~0.16 m up the beach + the swell: at +6 cm over
    // the still level the shore foam band still cuts the heap)
    const surf = (ctx.shared.get("water") as { surfaceAt?: (x: number, z: number, t: number) => number } | undefined)?.surfaceAt;
    const gw = (x: number, z: number) => Math.max(gnd(x, z), (surf ? surf(x, z, 0) : 0.1) + 0.22);
    // (a heap whose footprint straddles the swash line (dry sand ↔ the wet film the shore foam runs along) slides
    // back toward the doors until it is clear of it; a lobe still straddling it is left out — else the foam band draws across
    // the fruit wherever a heap lies over the line)
    const straddles = (x: number, z: number, r: number) => { let lo = Infinity, hi = -Infinity; for (let a = 0; a < 8; a++) { const g = gnd(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r); lo = Math.min(lo, g); hi = Math.max(hi, g); } const gc = gnd(x, z); lo = Math.min(lo, gc); hi = Math.max(hi, gc); return lo < 0.45 && hi > -0.35; };
    let mx = hx, mz = hz;
    for (let k = 0; k < 3 && straddles(mx, mz, r0 * 1.1); k++) { mx -= dir.x * 0.5; mz -= dir.z * 0.5; }
    // (still over the line: its skirt rides 0.45 m over the swash film instead — the fruit heaped on the wet sand)
    const gwh = straddles(mx, mz, r0 * 1.1) ? (x: number, z: number) => Math.max(gnd(x, z), (surf ? surf(x, z, 0) : 0.1) + 0.45) : gw;
    bk.heap(mx, gwh(mx, mz), mz, r0 * 1.1, r0 * 0.9, h0, 200 + i, gwh, yawD, 2.1);
    const tx = mx + dir.x * (r0 * 1.3) + dir.z * 0.4, tz = mz + dir.z * (r0 * 1.3) - dir.x * 0.4;
    if (!straddles(tx, tz, r0 * 0.75)) bk.heap(tx, gw(tx, tz), tz, r0 * 0.75, r0 * 0.6, h0 * 0.62, 300 + i, gw, yawD + 0.4, 2.0);
    bk.spill(door.x + dir.x * r0 * 2.6, door.y, door.z + dir.z * r0 * 2.6, dir.x, dir.z, 48, 3.5 + hash(i, 3) * 3, 100 + i, gnd, 3.2);
  });
  for (let i = 0; i < 40; i++) {
    const [x, z] = fromCam(8 + hash(i, 7) * 90, -45 + hash(i, 8) * 90), y = ground(x, z);
    if (y < -0.4) continue;
    if (hash(i, 10) < 0.5) bk.hand(x, y, z, hash(i, 9) * 6.28, 6, 1.05, 300 + i);
    else bk.fruit(x, y + 0.005, z, hash(i, 9) * 6.28, 0, (hash(i, 11) - 0.5) * 0.8, 1.05);
  }
  // the skinned heaps carry the spill from 250 m (one draw); the hero fruit on them: per-INSTANCE LOD — full model
  // within 18 m of the camera, the 3-segment one to 90 m, nothing beyond (all at full detail: 0.33 M tris of fruit)
  const fruit = bk.buildLod({ name: "wreck-bananas", near: 18, far: 90 });
  const skins = fruit.children.find((c) => c.name.endsWith("-skins"));
  if (skins) { fruit.remove(skins); skins.name = "wreck-banana-skins"; group.add(skins); w.lod?.add(skins, { show: 250 }); }
  group.add(fruit);
  ctx.onUpdate(() => fruit.update(ctx.camera.position));

  await Y();
  // ---- sand berms: every box lying on the beach has sand banked against its long sides + its landward end (a soft
  // lumpy ridge whose rim fades into the terrain), so it reads washed up and settled — not dropped on the sand
  {
    const pos: number[] = [], col: number[] = [], uvs: number[] = [];
    const mm = new THREE.Matrix4(), c0 = new THREE.Vector3();
    CONTAINERS.forEach((p, i) => {
      const d = CONTAINER_DIMS[p.size ?? 40];
      placementMatrix(p, mm);
      c0.set(0, 0, 0).applyMatrix4(mm);
      const gy = ground(c0.x, c0.z);
      if (gy < -0.35 || c0.y > gy + 0.9) return;
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      // drifts are SEVERAL rounded lumps banked against the sides
      // (not one 12 m ridge), low and wide, fading into the beach over their whole outer half
      const ridges: Array<[number, number, number, number, number]> = [];
      const nL = (p.size ?? 40) === 40 ? 3 : 2;
      for (const sd of [1, -1]) for (let q = 0; q < nL; q++) {
        if (hash(i, q, sd) < 0.2) continue;
        const u = (q - (nL - 1) / 2) * (d.L / nL) + (hash(i, q, sd, 2) - 0.5) * 1.2;
        ridges.push([u, sd * (d.W / 2 + 0.35), 1.5 + hash(i, q, sd, 3) * 1.2, 1.1 + hash(i, q, sd, 4) * 0.5, 0.3 + hash(i, q, sd, 5) * 0.2]);
      }
      ridges.push([-(d.L / 2 + 0.3), 0, 1.1, d.W * 0.65, 0.34]);
      ridges.forEach(([u, v, rx, rz, h], k) => {
        const x = c0.x + u * cy + v * sy, z = c0.z - u * sy + v * cy, y = ground(x, z) - 0.08;
        const g = moundGeo(1, h, i * 7 + k, false, true).toNonIndexed();
        // (a bell profile: a dome's steep 0.4 m rim reads as the edge of a plank)
        const pb = g.attributes.position as THREE.BufferAttribute;
        for (let q2 = 0; q2 < pb.count; q2++) { const rr = Math.min(1, Math.hypot(pb.getX(q2), pb.getZ(q2))); pb.setY(q2, h * Math.exp(-3.2 * rr * rr) - 0.02); }
        g.computeVertexNormals();
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, 0)), new THREE.Vector3(rx, 1, rz)));
        const pa = g.attributes.position.array as Float32Array;
        for (let q = 0; q < pa.length; q += 3) {
          pos.push(pa[q], pa[q + 1], pa[q + 2]); uvs.push(pa[q] / 3, pa[q + 2] / 3);
          const t = Math.min(1, Math.max(0, (pa[q + 1] - y) / (h * 0.6)));
          col.push(1, 1, 1, t * t * (3 - 2 * t));
        }
      });
    });
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      const berms = new THREE.Mesh(g, bermMat());
      berms.name = "wreck-sand-berms"; berms.receiveShadow = true; berms.castShadow = false; berms.userData.castShadow = false; berms.renderOrder = 1;
      group.add(berms);
      w.lod?.add(berms, { show: 260 });
    }
  }

  await Y();
  // ---- hanging creepers off the hulls (deck edges on the beach side, superstructure edges, the mast)
  const vp: number[] = [], vu: number[] = [];
  const hangFrom = (s: HullSection, x: number, y: number, z: number, len: number, wd: number) => {
    const a = sectionToWorld(s, x, y, z);
    const out = sectionToWorld(s, x, y, z * 1.2);
    const yaw = Math.atan2(-(out[2] - a[2]), out[0] - a[0]) + Math.PI / 2;
    vine(vp, vu, [a[0], a[1] + 0.2, a[2]], len, wd, yaw, 0.4);
  };
  for (const s of SECTIONS) {
    // CLUSTERS (not strips at even intervals, like ornaments) — a big tangle near the break,
    // one or two small clumps elsewhere, bare plating between them; strips inside a clump touch and vary in length
    const clumps: Array<[number, number, number]> = s === STERN
      ? [[s.length - 11, 7, 9], [s.length * 0.42, 3, 4.5], [5.5, 3, 5]]
      : [[s.length - 12, 6, 8], [15, 4, 5], [s.length * 0.62, 2, 1.8]];
    clumps.forEach(([cx, n, lenMax], ci) => {
      for (const side of ci === 0 ? [s.beachSide, -s.beachSide] : [s.beachSide]) for (let k = 0; k < n; k++) {
        const x = cx + (k - (n - 1) / 2) * (0.55 + hash(ci, k, 1) * 0.35) + (hash(ci, k, 2) - 0.5) * 0.3;
        const y = deckY(s, x), z = side * (halfBreadth(s, x, y) + 0.05);
        // over the painted BANANA CO. only short creepers (they stop above the letters)
        const overLetters = s === BOW && side === s.beachSide && x > 23 && x < 50;
        const prof = Math.sin(Math.PI * (k + 0.5) / n) ** 0.6;
        hangFrom(s, x, y, z, overLetters ? 1.2 + hash(ci, k, 3) * 1.4 : 1.5 + lenMax * prof * (0.55 + 0.45 * hash(ci, k, 4)), 0.8 + hash(ci, k, 5) * 0.7);
      }
    });
    const H = s.house, top = deckY(s, (H.x0 + H.x1) / 2) + H.levels * 3.1;
    for (let k = 0; k < 9; k++) {
      const x = H.x0 + hash(k, 12, s.x) * (H.x1 - H.x0), side = hash(k, 13) < 0.6 ? s.beachSide : -s.beachSide;
      hangFrom(s, x, top - (k % 3) * 3.1, side * (H.halfW + 0.05), 2 + hash(k, 14) * 4.5, 0.7 + hash(k, 15) * 0.7);
    }
    // down the mast
    const mx = H.mastX, mb = top;
    hangFrom(s, mx, mb + 8, 0.3, 6, 0.6);
  }
  // big creeper CURTAINS (sheets of vines pouring over the deck edges, the break and the houses): 5–9 strips side
  // by side along an edge, lengths following a smooth profile, anchored just over the bulwark
  const curtain = (s: HullSection, x0: number, x1: number, side: number, lenMax: number, onHouse = false, seed = 1) => {
    const n = Math.max(4, Math.round((x1 - x0) / 0.75));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t, prof = Math.sin(Math.PI * t) ** 0.7 * (0.65 + 0.35 * hash(seed, k));
      const H = s.house, top = deckY(s, (H.x0 + H.x1) / 2) + H.levels * 3.1;
      const y = onHouse ? top : deckY(s, x), z = side * ((onHouse ? H.halfW : halfBreadth(s, x, y)) + 0.06);
      hangFrom(s, x, y, z, 1.5 + lenMax * prof, 0.9 + hash(seed, k, 2) * 0.5);
    }
  };
  // bow: over the break (both sides), by the buried stem, down the house front; stern: the torn end, the transom
  // corner, the house side facing the sea
  curtain(BOW, BOW.length - 9, BOW.length - 2.5, BOW.beachSide, 9, false, 11);
  curtain(BOW, BOW.length - 8, BOW.length - 1.5, -BOW.beachSide, 11, false, 12);
  curtain(BOW, 8, 14, BOW.beachSide, 7, false, 13);
  curtain(BOW, BOW.house.x0 + 1, BOW.house.x0 + 6, -BOW.beachSide, 6, true, 14);
  curtain(STERN, STERN.length - 8, STERN.length - 2, STERN.beachSide, 12, false, 15);
  curtain(STERN, STERN.length - 7, STERN.length - 1.5, -STERN.beachSide, 10, false, 18);
  curtain(STERN, STERN.house.x1 - 6, STERN.house.x1 - 0.5, STERN.beachSide, 8, true, 19);
  curtain(STERN, 2, 8, -STERN.beachSide, 8, false, 16);
  curtain(STERN, STERN.house.x0 + 2, STERN.house.x0 + 8, STERN.beachSide, 7, true, 17);
  const vg = new THREE.BufferGeometry();
  vg.setAttribute("position", new THREE.Float32BufferAttribute(vp, 3));
  vg.setAttribute("uv", new THREE.Float32BufferAttribute(vu, 2));
  vg.computeVertexNormals();
  const vines = new THREE.Mesh(vg, M.vine);
  vines.name = "wreck-vines"; vines.castShadow = false; vines.userData.castShadow = false; vines.receiveShadow = true;
  group.add(vines);
  w.lod?.add(vines, { show: 380 });

  await Y();
  // ---- plants: on the decks + house roofs, the beach foreground, palms leaning in from both edges
  const veg = ctx.shared.get("veg") as VegApi | undefined;
  if (veg) {
    const lists = new Map<PlantKind, THREE.Matrix4[]>();
    // (no plant grows out of a container, a wall or a rail — ≥ 0.55 m clear of anything taller than a step)
    const nearBox = boxGrid(colliders);
    const put = (kind: PlantKind, x: number, y: number, z: number, s: number, yaw: number, tilt = 0) => {
      if (!capsuleClear(nearBox(x, z), x, y, z, 0.55, 0.45)) return;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -tilt, "YXZ"));
      (lists.get(kind) ?? lists.set(kind, []).get(kind)!).push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)));
    };
    // no deck gardens, roof growth, break clumps
    // or debris plants on the hulls; the beach / cliff planting below stays
    const SHIP_GROWTH = false;
    if (SHIP_GROWTH) for (const s of SECTIONS) {
      // deck gardens: ferns + bushes along the bulwarks and around the hatches, a few banana plants in the cracks
      for (let k = 0; k < 90; k++) {
        const x = 4 + hash(k, 1, s.x) * (s.length - 8), side = hash(k, 2) < 0.5 ? 1 : -1;
        const edge = hash(k, 3) < 0.65;
        const z = edge ? side * (halfBreadth(s, x, deckY(s, x)) - 0.8 - hash(k, 4) * 1.2) : (hash(k, 5) - 0.5) * 10;
        if (x > s.house.x0 - 1 && x < s.house.x1 + 1 && Math.abs(z) < s.house.halfW + 0.5) continue;
        const p = sectionToWorld(s, x, deckY(s, x) - 0.08, z);
        const r = hash(k, 6);
        // (no palms / banana plants on the decks — low bushes, ferns and creepers only)
        // varied low growth (no broccoli pom-poms) — ferns, grass tufts, flowers, a few monstera, rare small bushes
        const kind: PlantKind = r < 0.42 ? "fern" : r < 0.66 ? "grass" : r < 0.76 ? "flowers" : r < 0.93 ? "monstera" : "bush";
        put(kind, p[0], p[1], p[2], kind === "bush" ? 0.45 + hash(k, 7) * 0.25 : 0.6 + hash(k, 7) * 0.6, hash(k, 8) * 6.28);
      }
      const H = s.house, top = deckY(s, (H.x0 + H.x1) / 2) + H.levels * 3.1;
      for (let k = 0; k < 18; k++) {
        const p = sectionToWorld(s, H.x0 + 1.5 + hash(k, 21, s.x) * (H.x1 - H.x0 - 3), top + 0.2, (hash(k, 22) - 0.5) * (2 * H.halfW - 2));
        const rr = hash(k, 23);
        put(rr < 0.5 ? "fern" : rr < 0.78 ? "grass" : rr < 0.9 ? "flowers" : "monstera", p[0], p[1], p[2], 0.55 + hash(k, 24) * 0.45, hash(k, 25) * 6.28);
      }
      // (no plants inside the gutted rooms — they are furnished rooms)
      // a bush clump sprouting from the torn deck at the break
      const pp = sectionToWorld(s, s.length - 6, s.depth - 0.1, s.beachSide * 3);
      put("monstera", pp[0], pp[1], pp[2], 1.0, hash(s.x, 5) * 6.28, 0.15);
      const pq = sectionToWorld(s, s.length - 8, s.depth - 0.1, -s.beachSide * 2.5);
      put("fern", pq[0], pq[1], pq[2], 1.2, hash(s.x, 6) * 6.28, 0.1);
    }
    // plants rooted in the debris cascades (ferns + bushes sprouting from every ledge of the collapse)
    if (SHIP_GROWTH) BREAK_DEBRIS.forEach((d, di) => {
      const s = d.s === "bow" ? BOW : STERN, f = debrisFrame(d), [U, V, Wv] = f.A;
      for (let k = 0; k < 3; k++) {
        const a = (hash(di, k, 81) - 0.5) * d.len * 0.7, c = (hash(di, k, 82) - 0.5) * d.w * 0.7;
        const lp: [number, number, number] = [f.c[0] + U[0] * a + Wv[0] * c + V[0] * d.t * 0.5, f.c[1] + U[1] * a + Wv[1] * c + V[1] * d.t * 0.5, f.c[2] + U[2] * a + Wv[2] * c + V[2] * d.t * 0.5];
        const p = sectionToWorld(s, lp[0], lp[1], lp[2]);
        if (p[1] < 0.6) continue;
        const r = hash(di, k, 83);
        put(r < 0.45 ? "fern" : r < 0.7 ? "monstera" : r < 0.85 ? "grass" : "bush", p[0], p[1] - 0.05, p[2], r > 0.85 ? 0.5 : 0.7 + hash(di, k, 84) * 0.5, hash(di, k, 85) * 6.28, 0.15);
      }
    });
    // the view camera's foreground corners (ferns + bamboo bottom-left, monstera + palm bottom-right),
    // palms leaning in from both frame edges, big-leaf clumps along the back of the beach
    // low foreground clumps hugging the bottom corners (never in the middle of the frame, never taller than eye level)
    // low clumps hugging the bottom corners: ferns + monstera close (≤ eye level), a few banana plants further out at the
    // frame edges so their big leaves overlap the corners (never the middle of the frame)
    for (let k = 0; k < 34; k++) {
      const left = k < 17, d = 3.0 + hash(k, 36) * 6, deg = (left ? -1 : 1) * (36 + hash(k, 37) * 16);
      const [x, z] = fromCam(d, deg), y = ground(x, z);
      if (y < 0.5) continue;
      const r = hash(k, 38);
      const kind: PlantKind = left ? (r < 0.75 ? "fern" : "grass") : (r < 0.4 ? "monstera" : r < 0.9 ? "fern" : "grass");
      put(kind, x, y - 0.1, z, (kind === "monstera" ? 0.9 : 1.25) + hash(k, 39) * 0.35, hash(k, 40) * 6.28);
    }
    // the jungle edge the lookout stands in: a carpet of ferns + low bushes over the sand in front-left (the bottom-left
    // is all fronds), thinning toward the beach
    for (let k = 0; k < 150; k++) {
      const d = 4 + hash(k, 141) ** 1.3 * 20, deg = -52 + hash(k, 142) * 36 + d * 0.4;
      const [x, z] = fromCam(d, deg), y = ground(x, z);
      if (y < 0.35 || hash(k, 143) < (d - 8) / 24) continue;
      const r = hash(k, 144);
      put(r < 0.62 ? "fern" : r < 0.82 ? "bush" : r < 0.93 ? "monstera" : "banana-plant", x, y - 0.08, z, r < 0.62 ? 1.4 + hash(k, 145) * 0.6 : r < 0.93 ? 1.0 + hash(k, 145) * 0.4 : 0.8, hash(k, 146) * 6.28);
    }
    for (const [d, deg, sc] of [[6.5, -52, 1.15], [9, -44, 0.95], [5.5, 47, 1.2], [8, 40, 1.05], [11, 52, 1.1], [14, -50, 0.9]] as Array<[number, number, number]>) {
      const [x, z] = fromCam(d, deg), y = ground(x, z);
      if (y > 0.6) put("banana-plant", x, y - 0.1, z, sc, hash(d, deg) * 6.28);
    }
    // (palms placed by bearing alone can land 7–18 m offshore — no
    // ground check.) Every palm walks back along its bearing toward the camera until it stands on dry sand (≥ 0.7 m
    // above the sea), keeps its lean into the frame, and is dropped if that lands it within 4 m of another palm.
    const palms: Array<[number, number]> = [];
    for (const [d0, deg, lean] of [[11, -62, 0.25], [17, -58, 0.3], [12, 60, 0.28], [19, 56, 0.2], [30, 56, 0.2], [34, -54, 0.15], [24, 64, 0.22]] as Array<[number, number, number]>) {
      let d = d0, [x, z] = fromCam(d, deg), y = ground(x, z);
      while (y < 0.7 && d > 4) { d -= 0.5; [x, z] = fromCam(d, deg); y = ground(x, z); }
      if (y < 0.7 || palms.some(([px, pz]) => Math.hypot(px - x, pz - z) < 4)) continue;
      palms.push([x, z]);
      // lean toward the frame centre (model +X): yaw so +X points at the look direction
      const [tx, tz] = fromCam(d + 30, 0), yaw = Math.atan2(-(tz - z), tx - x);
      put("palm-leaning", x, y - 0.05, z, 1.05, yaw, lean * 0.3);
    }
    for (let k = 0; k < 90; k++) {
      const x = -818 + hash(k, 31) * 24, z = 20 + hash(k, 32) * 170, y = ground(x, z);
      if (y < 2.2) continue;
      const r = hash(k, 33);
      put(r < 0.3 ? "monstera" : r < 0.55 ? "fern" : r < 0.72 ? "banana-plant" : r < 0.86 ? "bush" : "grass", x, y - 0.05, z, 0.8 + hash(k, 34) * 0.6, hash(k, 35) * 6.28);
    }
    for (const [kind, list] of lists) veg.plant(kind, list);
  }

  await Y();
  // ---- the rocky headland left of the bow (a jungle-topped cliff with creepers) — sculpted cliff blocks
  // (poi-jungle's chiselled-rock kit + its triplanar stone) filling the BLUFF blocks the colliders use
  // (8 m texture scale + strong macro variation: at 3.2 m the pattern read as fish scales at eye level)
  const cliffStone = stoneMaterial(pbr(ctx, "boulder"), { triplanar: true, scale: 8, moss: 0.6, mossColor: "#6aa832", wetY: 0.5, wetFade: 1.2, variation: 0.7, lift: 0.28, color: "#d9cfc0" }, pbr(ctx, "moss"));
  const cliffP = RS.cliff.pl;
  const bl = mergeInstanced(rockInstances(rockProtos("cliff", 5, 22), cliffP, cliffStone, "wreck-bluff", undefined, { cast: false }), "wreck-bluff", 2000);
  // perf (the full bluff casts 62 k tris into both cascades): a COARSE copy
  // of the same blocks (res 9, ≈ 1/6 the triangles) is the far LOD beyond 150 m AND the headland's only shadow caster
  const blc = mergeInstanced(rockInstances(rockProtos("cliff", 5, 9), cliffP, cliffStone, "wreck-bluff-far"), "wreck-bluff-far", 2000);
  bl.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.userData.castShadow = false; } });
  const blCast = new THREE.Group(); blCast.name = "wreck-bluff-caster";
  blc.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    m.castShadow = false; m.userData.castShadow = false;
    const c = shadowOnly(new THREE.Mesh(m.geometry.clone(), m.material));
    c.name = `${m.name}-caster`; c.castShadow = true; c.receiveShadow = false; c.userData.castShadow = true; blCast.add(c);
  });
  group.add(bl, blc, blCast);
  w.lod?.pair(bl, blc, 150);
  if (veg) {
    const tops: THREE.Matrix4[] = [], bushes: THREE.Matrix4[] = [], ferns: THREE.Matrix4[] = [], trees: THREE.Matrix4[] = [];
    BLUFF.forEach((bb, i) => {
      const top = bb.y0 + bb.h, n = Math.round((bb.w * bb.d) / 30);
      for (let k = 0; k < n; k++) {
        const ox = (hash(i, k, 51) - 0.5) * bb.w * 0.7, oz = (hash(i, k, 52) - 0.5) * bb.d * 0.7, c = Math.cos(bb.ry), sn = Math.sin(bb.ry);
        const mm = new THREE.Matrix4().compose(new THREE.Vector3(bb.x + ox * c + oz * sn, top - 0.4, bb.z - ox * sn + oz * c), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hash(i, k, 53) * 6.28, 0)), new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + hash(i, k, 54) * 0.5));
        const r = hash(i, k, 55);
        (r < 0.18 ? tops : r < 0.3 ? trees : r < 0.65 ? bushes : ferns).push(mm);
      }
    });
    veg.plant("palm", tops); veg.plant("jungle-tree", trees); veg.plant("bush", bushes); veg.plant("fern", ferns);
  }
  // (no creepers down the headland's seaward faces — anchored to the collider blocks'
  //  tops at a fixed offset, not to the sculpted rock, they drape in mid-air from the cove, one ending 10 m above
  //  the water)

  await Y();
  // ---- foreground props: a lashed bamboo scaffold, pebbles, driftwood, coconuts
  {
    const fb = new Builder();
    const bamboo = bambooMat();
    // the bamboo lookout the view camera stands on (LOOKOUT in the shared layout — same numbers as its colliders):
    // posts into the sand, cross-braced legs, a slatted deck, lashed rails (front-left + both sides), a ladder at the back
    const L = LOOKOUT, P = (u: number, v: number, y: number): [number, number, number] => { const [x, z] = lookoutAt(u, v); return [x, y, z]; };
    const gy = (u: number, v: number) => { const [x, z] = lookoutAt(u, v); return ground(x, z); };
    const hs = L.hs, dy = L.deckY;
    const posts: Array<[number, number]> = [[hs, -hs], [hs, hs], [-hs, -hs], [-hs, hs], [hs, L.railV], [hs, 1.2], [-hs, 0], [0, -hs], [0, hs]];
    for (const [u, v] of posts) fb.cyl(bamboo, P(u, v, gy(u, v) - 0.4), P(u, v, dy + ((u > 0 && v < L.railV + 0.1) || (v < -hs + 0.1 && u > -hs + 1) ? 1.25 : 0.05)), 0.12, 9, { r1: 0.1 });
    // leg bracing (X per side) + deck bearers
    for (const [a, b] of [[[hs, -hs], [hs, hs]], [[-hs, -hs], [-hs, hs]], [[-hs, -hs], [hs, -hs]], [[-hs, hs], [hs, hs]]] as Array<[[number, number], [number, number]]>) {
      const ya = gy(a[0], a[1]) + 0.6, yb = gy(b[0], b[1]) + 0.6;
      fb.cyl(bamboo, P(a[0], a[1], ya), P(b[0], b[1], dy - 0.5), 0.07, 8); fb.cyl(bamboo, P(b[0], b[1], yb), P(a[0], a[1], dy - 0.5), 0.07, 8);
      fb.cyl(bamboo, P(a[0], a[1], dy - 0.22), P(b[0], b[1], dy - 0.22), 0.09, 8);
    }
    // deck slats (poles across the facing direction)
    for (let u = -hs + 0.08; u <= hs; u += 0.17) fb.cyl(bamboo, P(u, -hs - 0.1, dy - 0.07), P(u, hs + 0.1, dy - 0.07), 0.075, 7);
    // rails: front (left part only — the lookout's open front faces the wreck) + both sides; top + mid bars, lashings
    const rail = (a: [number, number], b: [number, number]) => {
      for (const h of [1.0, 0.55]) fb.cyl(bamboo, P(a[0], a[1], dy + h), P(b[0], b[1], dy + h + 0.03), h > 0.9 ? 0.07 : 0.055, 8);
      // lashing: three tight turns of rope around the post just under each rail
      for (const q of [a, b]) for (const h of [1.0, 0.55]) for (let t = 0; t < 3; t++) fb.add(mats.rope, new THREE.TorusGeometry(0.128, 0.018, 4, 12).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(...P(q[0], q[1], dy + h - 0.1 - t * 0.035)));
    };
    rail([hs, -hs], [hs, L.railV]);
    rail([-hs + 1.2, -hs], [hs, -hs]);
    // ladder at the back-left (the same treads the colliders step up)
    const rise = dy - L.ground, run = rise * 0.75;
    for (const v of [-hs + 0.05, -hs + 1.05]) fb.cyl(bamboo, P(-hs - 0.2 - run, v, L.ground - 0.2), P(-hs - 0.1, v, dy + 1.0), 0.08, 8);
    for (let k = 1; k <= Math.ceil(rise / 0.4); k++) { const t = k / Math.ceil(rise / 0.4); fb.cyl(bamboo, P(-hs - 0.2 - (1 - t) * run, -hs - 0.1, L.ground + rise * t - 0.06), P(-hs - 0.2 - (1 - t) * run, -hs + 1.2, L.ground + rise * t - 0.06), 0.05, 7); }
    // pebbles + driftwood + coconuts across the foreground sand
    for (let k = 0; k < 40; k++) {
      const [x, z] = fromCam(3 + hash(k, 71) * 24, -40 + hash(k, 72) * 80), y = ground(x, z);
      if (y < 0.05) continue;
      const r = 0.12 + hash(k, 73) ** 2 * 0.45;
      fb.add(mats.rock, new THREE.IcosahedronGeometry(1, 1), new THREE.Matrix4().compose(new THREE.Vector3(x, y + r * 0.25, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(hash(k, 74), hash(k, 75) * 6, 0)), new THREE.Vector3(r, r * 0.6, r * 0.9)), true, 2);
    }
    for (let k = 0; k < 5; k++) {
      const [x, z] = fromCam(7 + hash(k, 81) * 14, -20 + hash(k, 82) * 50), y = ground(x, z), len = 1.4 + hash(k, 83) * 1.8, a = hash(k, 84) * 6.28;
      fb.cyl(mats.wood, [x - Math.cos(a) * len / 2, y + 0.08, z + Math.sin(a) * len / 2], [x + Math.cos(a) * len / 2, y + 0.12, z - Math.sin(a) * len / 2], 0.09, 7);
    }
    const coco = new THREE.MeshStandardMaterial({ color: "#6b4a26", roughness: 0.85, name: "coconut" });
    for (let k = 0; k < 6; k++) { const [x, z] = fromCam(4 + hash(k, 91) * 8, -30 + hash(k, 92) * 60), y = ground(x, z); fb.add(coco, new THREE.SphereGeometry(0.17, 10, 8), new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.13, z), new THREE.Quaternion(), new THREE.Vector3(1, 0.9, 0.95))); }
    const fg = fb.build("wreck-foreground", { palette: (m) => /^(rope|rock|wood|coconut)$/.test(m.name) });
    mergeCasters(fg);
    group.add(fg);
    w.lod?.add(fg, { show: 120 });
  }

  await Y();
  // ---- the salvage boardwalk (shared walkPieces = its colliders): lashed bamboo slat deck on bamboo posts
  // driven into the seabed, wider landings at the turns with a BANANA CO. crate, plank steps down into the water.
  // Always drawn (no LOD band: nothing on it may pop in) — ~1 draw per material.
  {
    const wb = new Builder(), bamboo = bambooMat(), Yd = WALK.y;
    const crateMat = new THREE.MeshStandardMaterial({ color: "#b7864a", roughness: 0.8, name: "walk-crate" });
    const bandMat = new THREE.MeshStandardMaterial({ color: "#5d3f22", roughness: 0.85, name: "walk-crate-band" });
    const pieces = walkPieces(), lands = pieces.filter((q) => q.kind === "landing");
    // (a deck's slats stop at the landings: the landing draws its own — two slat layers crossing read as wicker)
    const inLanding = (x: number, z: number) => lands.some((q) => { const dx = x - q.c[0], dz = z - q.c[2], c = Math.cos(q.yaw), sn = Math.sin(q.yaw); return Math.abs(dx * c + dz * sn) < q.h[0] - 0.02 && Math.abs(-dx * sn + dz * c) < q.h[2] - 0.02; });
    for (const p of pieces) {
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      const L = (lx: number, y: number, lz: number): [number, number, number] => [p.c[0] + lx * c - lz * sn, y, p.c[2] + lx * sn + lz * c];
      const [hx, , hz] = p.h;
      if (p.kind === "deck" || p.kind === "landing") {
        // slats across the lane, two edge stringers + a centre bearer under them, posts every ~2.4 m at both edges
        for (let u = -hx + 0.085; u <= hx - 0.05; u += 0.17) { if (p.kind === "deck" && inLanding(...(L(u, 0, 0).filter((_, i) => i !== 1) as [number, number]))) continue; wb.cyl(bamboo, L(u, Yd - 0.075, -hz - 0.08), L(u, Yd - 0.075, hz + 0.08), 0.075, 7); }
        for (const v of [-hz + 0.12, 0, hz - 0.12]) wb.cyl(bamboo, L(-hx, Yd - 0.24, v), L(hx, Yd - 0.24, v), 0.09, 8);
        const n = Math.max(1, Math.round((2 * hx) / 2.4));
        for (let k = 0; k <= n; k++) { const u = -hx + 0.15 + (k / n) * (2 * hx - 0.3);
          for (const v of [-hz + 0.1, hz - 0.1]) { const q = L(u, 0, v); wb.cyl(bamboo, [q[0], ground(q[0], q[2]) - 0.4, q[2]], [q[0], Yd - 0.12, q[2]], 0.1, 9, { r1: 0.085 }); }
          // a cross bearer under the slats at every post pair
          wb.cyl(bamboo, L(u, Yd - 0.3, -hz - 0.05), L(u, Yd - 0.3, hz + 0.05), 0.08, 8);
        }
      } else if (p.kind === "step") {
        const top = p.c[1] + p.h[1];
        wb.box(mats.wood, L(0, top - 0.06, 0), [2 * hx, 0.12, 2 * hz], { rotY: -p.yaw });
        for (const u of [-hx + 0.08, hx - 0.08]) { const q = L(u, 0, 0); wb.cyl(bamboo, [q[0], Math.max(ground(q[0], q[2]) - 0.3, top - 2.6), q[2]], [q[0], top - 0.1, q[2]], 0.07, 8); }
      } else {
        // the crate: planked box + dark corner battens and a lid band
        const [x, y, z] = p.c;
        wb.box(crateMat, [x, y, z], [2 * hx - 0.06, 2 * p.h[1] - 0.06, 2 * hz - 0.06], { rotY: -p.yaw, bevel: 0.03 });
        for (const a of [-1, 1]) for (const b of [-1, 1]) wb.box(bandMat, L(a * (hx - 0.05), y, b * (hz - 0.05)), [0.1, 2 * p.h[1], 0.1], { rotY: -p.yaw });
        for (const yy of [y - p.h[1] + 0.06, y + p.h[1] - 0.06]) for (const b of [-1, 1]) { wb.box(bandMat, L(0, yy, b * (hz - 0.03)), [2 * hx, 0.1, 0.06], { rotY: -p.yaw }); wb.box(bandMat, L(b * (hx - 0.03), yy, 0), [0.06, 0.1, 2 * hz], { rotY: -p.yaw }); }
      }
    }
    const walk = wb.build("wreck-boardwalk", { palette: (m) => /^(wood|walk-crate|walk-crate-band)$/.test(m.name) });
    mergeCasters(walk);
    group.add(walk);
  }

  await Y();
  // ---- gulls circling the masts (animated; frozen poses in shot mode)
  const gull = new THREE.InstancedMesh(gullGeo(), new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.7, side: THREE.DoubleSide, name: "gull" }), 9);
  gull.castShadow = false;
  gull.name = "wreck-gulls"; gull.frustumCulled = false; gull.userData.castShadow = false;
  // two flocks circling the masts + a few birds wheeling closer over the lagoon
  const near = fromCam(48, 4);
  const centres = [sectionToWorld(BOW, BOW.house.mastX, 36, 0), sectionToWorld(STERN, STERN.house.mastX, 32, 0), [near[0], 20, near[1]] as [number, number, number]];
  const gm = new THREE.Matrix4(), gq = new THREE.Quaternion(), gp = new THREE.Vector3(), gs = new THREE.Vector3(3.2, 3.2, 3.2), ge = new THREE.Euler();
  const pose = (t: number) => {
    for (let i = 0; i < 9; i++) {
      const c = centres[i % 3], R = (i % 3 === 2 ? 10 : 9) + (i % 3) * 5, a = t * (0.25 + (i % 4) * 0.04) * (i % 2 ? 1 : -1) + i * 1.9;
      gp.set(c[0] + Math.cos(a) * R, c[1] + 4 + (i % 3) * 5 + Math.sin(t * 0.7 + i) * 1.5, c[2] + Math.sin(a) * R);
      ge.set(Math.sin(t * 6 + i) * 0.15, -a + (i % 2 ? Math.PI : 0), (i % 2 ? -1 : 1) * 0.35, "YXZ");
      gq.setFromEuler(ge);
      gm.compose(gp, gq, gs);
      gull.setMatrixAt(i, gm);
    }
    gull.instanceMatrix.needsUpdate = true;
  };
  pose(12);
  ctx.onUpdate((_dt, t) => pose(t));
  group.add(gull);
  void STERN;
}
