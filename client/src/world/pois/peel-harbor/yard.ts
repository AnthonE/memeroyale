// PEEL HARBOR — yard structures that make the terminal a place, not a grid: steel access-stair towers at the low ends
// of the tall blocks (switchback flights onto the tier-2/3 roofs — the same treads the colliders use), the reefer
// rack (a two-deck steel gantry along the white reefer row, plug sockets + drooping power cables, stairs at the south
// end), chain-link fences with barbed tops along the land edges and the lay-down yard, and the jungle taking back the
// slab's corners (cracked soil patches + planted trees / bushes / ferns / grass via VegApi, weeds along the kerbs).
// Layout + colliders: shared/pois/peel-harbor.ts (STAIR_TOWERS / towerStair, REEFER_RACK / reeferRackStairs, FENCES,
// JUNGLE_PATCHES / JUNGLE_TREES).
import * as THREE from "three";
import { APRON, APRON_Y, BLOCKS, CONTAINERS, FENCES, JUNGLE_PATCHES, JUNGLE_TREES, TRUNK_R, REEFER_RACK, ROW, STAIR_TOWERS, WAREHOUSES, WATER_EDGES, blockRect, onApron, reeferRackStairs, toWorld, towerStair } from "../../../../../shared/pois/peel-harbor";
import { Builder, hash, mergeCasters } from "../_kit/harbor-geo";
import { paint } from "../_kit/harbor-materials";
import { canvas, paintNoise, rng, splotches, tex } from "../_kit/harbor-paint";
import type { PlantKind, VegApi } from "../../veg/api";
import { groundAt, type Part } from "./parts";

// ------------------------------------------------------------------------------------------------ materials
let fenceMat: THREE.MeshStandardMaterial | null = null;
/** chain-link mesh (alpha-tested diamond wire), tile = 1 m */
function chainLink(): THREE.MeshStandardMaterial {
  if (fenceMat) return fenceMat;
  const S = 128, [el, c] = canvas(S, S);
  c.clearRect(0, 0, S, S);
  c.strokeStyle = "#c9cdd0"; c.lineWidth = 3.2;
  for (let k = -2; k < 4; k++) {
    c.beginPath(); c.moveTo(k * S / 2, 0); c.lineTo(k * S / 2 + S, S); c.stroke();
    c.beginPath(); c.moveTo(k * S / 2 + S, 0); c.lineTo(k * S / 2, S); c.stroke();
  }
  const t = tex(el, { aniso: 8 }); t.repeat.set(1, 1);
  fenceMat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6, name: "fence-mesh" });
  return fenceMat;
}
let soilMat: THREE.MeshStandardMaterial | null = null;
/** cracked slab reclaimed by the jungle: dark soil, leaf litter, moss, shards of broken concrete — tile 6 m */
function soil(): THREE.MeshStandardMaterial {
  if (soilMat) return soilMat;
  const S = 512, [el, c] = canvas(S, S);
  c.fillStyle = "#5b4a33"; c.fillRect(0, 0, S, S);
  paintNoise(c, 0, 0, S, S, { seed: 811, scale: 380, alpha: 0.5, blend: "overlay" });
  splotches(c, 0, 0, S, S, { n: 60, rMin: 20, rMax: 90, color: "rgba(78,110,40,1)", alpha: 0.55, seed: 812 });
  splotches(c, 0, 0, S, S, { n: 40, rMin: 10, rMax: 40, color: "rgba(120,96,60,1)", alpha: 0.4, seed: 813 });
  const r = rng(814);
  // broken concrete shards + leaf litter
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S, w = 18 + r() * 50, h = 12 + r() * 36;
    c.save(); c.translate(x, y); c.rotate(r() * 3);
    c.fillStyle = `rgba(${150 + r() * 30},${146 + r() * 26},${136 + r() * 20},0.85)`;
    c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, -h * 0.3); c.lineTo(w * 0.4, h / 2); c.lineTo(-w * 0.45, h * 0.4); c.closePath(); c.fill();
    c.restore();
  }
  for (let i = 0; i < 500; i++) { c.fillStyle = r() < 0.6 ? "rgba(96,70,30,0.7)" : "rgba(60,90,30,0.7)"; c.beginPath(); c.ellipse(r() * S, r() * S, 3 + r() * 5, 1.5 + r() * 2, r() * 3, 0, Math.PI * 2); c.fill(); }
  const t = tex(el, { aniso: 8 });
  soilMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, metalness: 0, name: "jungle-soil", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return soilMat;
}

let skirtMat: THREE.MeshStandardMaterial | null = null;
/** grass over soil for the land-edge berm (greener than the slab-crack soil, matches the jungle floor) */
function skirtSoil(): THREE.MeshStandardMaterial {
  if (skirtMat) return skirtMat;
  const S = 512, [el, c] = canvas(S, S);
  c.fillStyle = "#4f6a2a"; c.fillRect(0, 0, S, S);
  paintNoise(c, 0, 0, S, S, { seed: 821, scale: 400, alpha: 0.5, blend: "overlay" });
  splotches(c, 0, 0, S, S, { n: 50, rMin: 20, rMax: 80, color: "rgba(92,72,44,1)", alpha: 0.45, seed: 822 });
  splotches(c, 0, 0, S, S, { n: 40, rMin: 10, rMax: 50, color: "rgba(110,150,50,1)", alpha: 0.45, seed: 823 });
  const r = rng(824);
  for (let i = 0; i < 1400; i++) { c.strokeStyle = r() < 0.7 ? "rgba(120,160,60,0.7)" : "rgba(70,90,35,0.7)"; c.lineWidth = 1.5; const x = r() * S, y = r() * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 6, y - 6 - r() * 8); c.stroke(); }
  skirtMat = new THREE.MeshStandardMaterial({ map: tex(el, { aniso: 8 }), roughness: 0.95, metalness: 0, name: "land-skirt" });
  return skirtMat;
}

// ------------------------------------------------------------------------------------------------ stair towers
function towers(b: Builder, safety: THREE.Material, galv: THREE.Material, grate: THREE.Material) {
  for (const t of STAIR_TOWERS) {
    const st = towerStair(t);
    const P = (a: number, c: number, y: number): [number, number, number] => { const [x, z] = st.toLocal(a, c); return [x, y, z]; };
    const rotY = t.axis === "z" ? 0 : Math.PI / 2;
    // four corner posts + bracing (the tower frame)
    const aF = st.landings.reduce((m, l) => Math.min(m, l.a0), 0), aN = -0.3;
    for (const a of [aF + 0.1, aN]) for (const c of [-1.35, 1.35]) b.cyl(safety, P(a, c, APRON_Y), P(a, c, t.top + 1.1), 0.07, 8);
    for (let y = APRON_Y + 2.2; y < t.top; y += 2.2) for (const c of [-1.35, 1.35]) b.cyl(safety, P(aF + 0.1, c, y - 2.1), P(aN, c, y), 0.035, 5);
    st.flights.forEach((f, fi) => {
      // stringers + grating treads + a handrail on the outside
      const n = Math.ceil((f.y1 - f.y0) / 0.28), c0 = f.c - st.w / 2, c1 = f.c + st.w / 2;
      for (const c of [c0, c1]) b.beam(safety, P(f.a0, c, f.y0 - 0.12), P(f.a1, c, f.y1 - 0.12), 0.05, 0.22);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n, a = f.a0 + (f.a1 - f.a0) * u, y = f.y0 + (f.y1 - f.y0) * ((k + 1) / n), da = Math.abs(f.a1 - f.a0) / n;
        const [x, , z] = P(a, f.c, y);
        b.box(grate, [x, y - 0.03, z], [t.axis === "z" ? st.w : da + 0.04, 0.05, t.axis === "z" ? da + 0.04 : st.w], { rotY: 0 });
        // the first flight is a closed steel stair block (its collider is solid down to the slab)
        if (fi === 0) b.box(safety, [x, (APRON_Y + y - 0.06) / 2, z], [t.axis === "z" ? st.w - 0.02 : da + 0.03, y - 0.06 - APRON_Y, t.axis === "z" ? da + 0.03 : st.w - 0.02]);
      }
      const co = f.c + Math.sign(f.c) * (st.w / 2 + 0.02);
      b.cyl(galv, P(f.a0, co, f.y0 + 1.0), P(f.a1, co, f.y1 + 1.0), 0.025, 6);
      for (const u of [0.02, 0.5, 0.98]) { const a = f.a0 + (f.a1 - f.a0) * u, y = f.y0 + (f.y1 - f.y0) * u; b.cyl(galv, P(a, co, y), P(a, co, y + 1.0), 0.02, 5); }
    });
    for (const l of st.landings) {
      const [x, , z] = P((l.a0 + l.a1) / 2, (l.c0 + l.c1) / 2, l.y);
      const la = Math.abs(l.a1 - l.a0), lc = Math.abs(l.c1 - l.c0);
      b.box(grate, [x, l.y - 0.04, z], [t.axis === "z" ? lc : la, 0.07, t.axis === "z" ? la : lc], { rotY: 0 });
      b.box(safety, [x, l.y - 0.14, z], [t.axis === "z" ? lc + 0.08 : la + 0.08, 0.12, t.axis === "z" ? la + 0.08 : lc + 0.08]);
      if (l.y - APRON_Y < 2.4) b.box(safety, [x, (APRON_Y + l.y - 0.2) / 2, z], [t.axis === "z" ? lc - 0.02 : la - 0.02, l.y - 0.2 - APRON_Y, t.axis === "z" ? la - 0.02 : lc - 0.02]);
      // guard rails along both long sides (open toward the flights)
      for (const c of [l.c0, l.c1]) b.cyl(galv, P(l.a0, c, l.y + 1.05), P(Math.min(l.a1, 0), c, l.y + 1.05), 0.025, 6);
    }
    void rotY;
  }
}

// ------------------------------------------------------------------------------------------------ reefer rack
function reeferRack(b: Builder, m: ReturnType<typeof paint>, galv: THREE.Material, grate: THREE.Material, dark: THREE.Material, warn: THREE.Material) {
  const R = REEFER_RACK, x = R.x;
  // columns at every bay boundary (both sides), cross beams under both decks, diagonal bracing
  for (let z = R.z0; z <= R.z1 + 0.1; z += 12.72) {
    for (const dx of [-R.w / 2, R.w / 2]) b.box(m, [x + dx, (APRON_Y + R.y2 + 1.1) / 2, z], [0.2, R.y2 + 1.1 - APRON_Y, 0.2], { bevel: 0.02 });
    for (const y of [R.y1, R.y2]) b.box(m, [x, y - 0.22, z], [R.w + 0.2, 0.18, 0.16]);
    if (z + 12.72 <= R.z1 + 0.1) b.beam(m, [x - R.w / 2 - 0.12, APRON_Y + 0.4, z + 0.3], [x - R.w / 2 - 0.12, R.y1 - 0.3, z + 6], 0.08, 0.08);
  }
  // decks: grating, edge channels, toe boards, handrail on the land side (the reefer side stays open → step across)
  const decks: Array<[number, number, number]> = [[R.y1, R.z0, R.z1], [R.y2, R.z0 + 7.6, R.z1]];
  for (const [y, z0, z1] of decks) {
    b.box(grate, [x, y - 0.04, (z0 + z1) / 2], [R.w, 0.07, z1 - z0]);
    for (const dx of [-R.w / 2, R.w / 2]) b.box(m, [x + dx, y - 0.1, (z0 + z1) / 2], [0.08, 0.2, z1 - z0]);
    b.box(m, [x - R.w / 2 - 0.02, y + 0.08, (z0 + z1) / 2], [0.03, 0.16, z1 - z0]);
    for (const hy of [0.55, 1.1]) b.box(galv, [x - R.w / 2 - 0.05, y + hy, (z0 + z1) / 2], [0.05, 0.05, z1 - z0]);
    for (let z = z0; z <= z1 + 0.1; z += 2.12) b.box(galv, [x - R.w / 2 - 0.05, y + 0.55, z], [0.05, 1.1, 0.05]);
  }
  // stairs (the same treads the colliders use)
  for (const st of reeferRackStairs()) {
    const n = Math.ceil((st.y1 - st.y0) / 0.28);
    for (const dx of [-R.w / 2, R.w / 2]) b.beam(m, [x + dx, st.y0 - 0.1, st.z0], [x + dx, st.y1 - 0.1, st.z1], 0.06, 0.24);
    for (let k = 0; k < n; k++) { const u = (k + 0.5) / n, z = st.z0 + (st.z1 - st.z0) * u, y = st.y0 + (st.y1 - st.y0) * ((k + 1) / n); b.box(grate, [x, y - 0.03, z], [R.w, 0.05, (st.z1 - st.z0) / n + 0.03]); }
    b.cyl(galv, [x - R.w / 2 - 0.04, st.y0 + 1.0, st.z0], [x - R.w / 2 - 0.04, st.y1 + 1.0, st.z1], 0.025, 6);
  }
  // plug sockets on the rack + a drooping power cable to every reefer's machinery end (tier 1 + 2)
  for (const p of CONTAINERS) {
    if (p.color !== "white" || Math.abs(p.x - (BLOCKS.find((b) => b.id === "E1")!.x0)) > ROW * 2.5 || p.z < R.z0 || p.z > R.z1) continue;
    const deck = p.y > APRON_Y + 1 ? R.y2 : R.y1, sz = p.z + 4.8;
    b.box(dark, [x + R.w / 2 - 0.05, deck + 0.35, sz], [0.12, 0.3, 0.22], { bevel: 0.02 });
    b.box(hash(p.z, p.y) < 0.3 ? warn : m, [x + R.w / 2, deck + 0.4, sz + 0.07], [0.02, 0.05, 0.05]);
    const end = [p.x - 1.25, p.y + 1.9, sz] as [number, number, number];
    b.tube(dark, [[x + R.w / 2, deck + 0.3, sz], [(x + R.w / 2 + end[0]) / 2, Math.min(deck, end[1]) - 0.5, sz + 0.2], end], 0.03, 5, { samples: 10 });
  }
}

// ------------------------------------------------------------------------------------------------ fences
function fences(b: Builder, galv: THREE.Material) {
  const mesh: number[] = [], uv: number[] = [];
  for (const f of FENCES) {
    let acc = 0;
    for (let i = 0; i < f.pts.length - 1; i++) {
      const [ax, az] = f.pts[i], [bx, bz] = f.pts[i + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      let segs: Array<[number, number]> = [[0, L]];
      for (const [g0, g1] of f.gaps ?? []) { const s0 = g0 - acc, s1 = g1 - acc; segs = segs.flatMap(([a, c]) => (s1 <= a || s0 >= c ? [[a, c]] : [[a, Math.max(a, s0)], [Math.min(c, s1), c]]).filter(([p, q]) => q - p > 0.2) as Array<[number, number]>); }
      for (const [a, c] of segs) {
        const n = Math.max(1, Math.round((c - a) / 3));
        for (let k = 0; k <= n; k++) {
          const t = a + ((c - a) * k) / n, x = ax + dx * t, z = az + dz * t;
          b.cyl(galv, [x, APRON_Y, z], [x, APRON_Y + 2.45, z], 0.04, 6);
          // barbed-wire arm leaning out
          b.cyl(galv, [x, APRON_Y + 2.4, z], [x - dz * 0.35, APRON_Y + 2.75, z + dx * 0.35], 0.02, 4);
        }
        const x0 = ax + dx * a, z0 = az + dz * a, x1 = ax + dx * c, z1 = az + dz * c;
        b.cyl(galv, [x0, APRON_Y + 2.38, z0], [x1, APRON_Y + 2.38, z1], 0.03, 5);
        for (const [o, h] of [[0.12, 2.52], [0.24, 2.63], [0.35, 2.74]] as Array<[number, number]>) b.cyl(galv, [x0 - dz * o, APRON_Y + h, z0 + dx * o], [x1 - dz * o, APRON_Y + h, z1 + dx * o], 0.008, 3);
        // the mesh panel (a slight sag between posts is invisible at 2.4 m — keep it flat)
        const q = [[x0, APRON_Y + 0.05, z0, acc + a, 0], [x1, APRON_Y + 0.05, z1, acc + c, 0], [x1, APRON_Y + 2.38, z1, acc + c, 2.33], [x0, APRON_Y + 2.38, z0, acc + a, 2.33]];
        for (const k of [0, 1, 2, 0, 2, 3]) { mesh.push(q[k][0], q[k][1], q[k][2]); uv.push(q[k][3] / 1.0, q[k][4] / 1.0); }
      }
      acc += L;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(mesh, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------ jungle patches
function patchGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  JUNGLE_PATCHES.forEach((p, pi) => {
    const n = 40, c = Math.cos(p.rot), s = Math.sin(p.rot), pts: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, k = 0.82 + 0.18 * Math.sin(a * 3 + pi) * Math.cos(a * 5 - pi * 2) + 0.08 * Math.sin(a * 11 + pi);
      const u = Math.cos(a) * p.rx * k, v = Math.sin(a) * p.rz * k;
      let x = p.x + u * c - v * s, z = p.z + u * s + v * c;
      // clamp inside the slab (the patch never overhangs the quay wall)
      for (let t = 0; t < 8 && !onApron(x, z, 0.5); t++) { x = p.x + (x - p.x) * 0.85; z = p.z + (z - p.z) * 0.85; }
      pts.push([x, z]);
    }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      for (const q of [[p.x, p.z], b, a] as Array<[number, number]>) { pos.push(q[0], APRON_Y + 0.015, q[1]); uv.push(q[0] / 6, q[1] / 6); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  return g;
}

function plantJungle(veg: VegApi, groupMatrix: THREE.Matrix4) {
  const lists = new Map<PlantKind, THREE.Matrix4[]>();
  // (no plant inside a shed — the slab's jungle patches reach under some of their walls)
  const inShed = (x: number, z: number) => WAREHOUSES.some((w) => { const alongX = Math.abs(Math.cos(w.yaw)) > 0.5, hx = (alongX ? w.length : w.width) / 2 + 1.2, hz = (alongX ? w.width : w.length) / 2 + 1.2; return Math.abs(x - w.x) < hx && Math.abs(z - w.z) < hz; });
  const put = (kind: PlantKind, lx: number, lz: number, s: number, yaw: number) => {
    if (inShed(lx, lz)) return;
    const v = new THREE.Vector3(lx, APRON_Y - 0.05, lz).applyMatrix4(groupMatrix);
    (lists.get(kind) ?? lists.set(kind, []).get(kind)!).push(new THREE.Matrix4().compose(v, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s)));
  };
  for (const t of JUNGLE_TREES) put(t.kind, t.x, t.z, t.s, t.yaw);
  const r = rng(9119);
  const occupied = (x: number, z: number) => CONTAINERS.some((p) => Math.abs(p.x - x) < 7 && Math.abs(p.z - z) < 7 && Math.hypot(p.x - x, p.z - z) < 6.5);
  JUNGLE_PATCHES.forEach((p) => {
    const area = Math.PI * p.rx * p.rz, c = Math.cos(p.rot), s = Math.sin(p.rot);
    // (the slab's undergrowth thinned with its trees — a plant per 12 m², not 5)
    const n = Math.round(area / 12);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.95, u = Math.cos(a) * d * p.rx, v = Math.sin(a) * d * p.rz;
      const x = p.x + u * c - v * s, z = p.z + u * s + v * c;
      if (!onApron(x, z, 1) || occupied(x, z)) continue;
      const k = r(), edge = d > 0.7;
      // (no "groundcover": its flat pale card read as a green paint splat on the concrete)
      const kind: PlantKind = edge ? (k < 0.6 ? "grass" : k < 0.9 ? "fern" : "flowers") : (k < 0.3 ? "bush" : k < 0.5 ? "fern" : k < 0.64 ? "banana-plant" : k < 0.74 ? "monstera" : "grass");
      put(kind, x, z, kind === "bush" ? 0.8 + r() * 0.6 : 0.8 + r() * 0.5, r() * 6.28);
    }
  });
  // weeds along the land kerbs + in slab cracks near the edges (breaks the hard straight line where slab meets grass)
  for (let i = 0; i < APRON.length; i++) {
    if (WATER_EDGES.includes(i)) continue;
    const [ax, az] = APRON[i], [bx, bz] = APRON[(i + 1) % APRON.length], len = Math.hypot(bx - ax, bz - az), nx = (bz - az) / len, nz = -(bx - ax) / len;
    for (let t = 1; t < len - 1; t += 1.6 + r() * 1.8) {
      const f = t / len, x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      const inward = onApron(x + nx * 3, z + nz * 3) ? 1 : -1, off = (r() < 0.7 ? -1 : 1) * (0.3 + r() * 1.4) * inward;
      const k = r();
      put(k < 0.65 ? "grass" : k < 0.9 ? "fern" : "bush", x + nx * off, z + nz * off, 0.7 + r() * 0.6, r() * 6.28);
    }
  }
  // cracks + weeds at the feet of old stacks in the depot and lay-down
  for (const bl of BLOCKS) {
    if (bl.kind !== "empties") continue;
    const [x0, x1, z0, z1] = blockRect(bl);
    for (let k = 0; k < 18; k++) {
      const side = k % 4, t = r();
      const x = side < 2 ? x0 + (x1 - x0) * t : side === 2 ? x0 - 0.6 : x1 + 0.6, z = side === 0 ? z0 - 0.6 : side === 1 ? z1 + 0.6 : z0 + (z1 - z0) * t;
      if (onApron(x, z, 1)) put("grass", x, z, 0.6 + r() * 0.4, r() * 6.28);
    }
  }
  for (const [kind, list] of lists) veg.plant(kind, list);
}

// ------------------------------------------------------------------------------------------------ land-edge skirt
/**
 * Along every LAND edge of the slab a soil berm runs from under the kerb
 * down to the natural ground 5 m out (grass + weeds + the odd bush planted on it), so the slab is BURIED into the
 * jungle instead of standing on it. Where the ground out there is as high as the slab, the berm stays flat.
 */
/** max height of a land-skirt vertex above the terrain (m) — see row() */
const SKIRT_FLOAT = 0.5;
function skirtGeometry(ground: (x: number, z: number) => number): { geo: THREE.BufferGeometry; plants: Array<[number, number, number]> } {
  const pos: number[] = [], uv: number[] = [], plants: Array<[number, number, number]> = [];
  for (let i = 0; i < APRON.length; i++) {
    if (WATER_EDGES.includes(i)) continue;
    const [ax, az] = APRON[i], [bx, bz] = APRON[(i + 1) % APRON.length], len = Math.hypot(bx - ax, bz - az);
    let nx = (bz - az) / len, nz = -(bx - ax) / len;
    if (onApron((ax + bx) / 2 + nx * 2, (az + bz) / 2 + nz * 2)) { nx = -nx; nz = -nz; }
    const n = Math.max(2, Math.ceil(len / 2.5));
    const row = (t: number) => {
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const out = (d: number) => [x + nx * d, z + nz * d] as [number, number];
      const [x1, z1] = out(0.45), [x2, z2] = out(2.4), [x3, z3] = out(5.5);
      const g3 = ground(x3, z3), y3 = Math.min(APRON_Y + 0.1, g3 - 0.15), y2 = Math.max(y3, APRON_Y - 0.35 - (APRON_Y - y3) * 0.35);
      // the berm has no collider: where the
      // natural ground falls away right outside the slab (the inlet corner of edge 6, the pier corner of edge 13) it
      // would float 1.5-6 m over a trench, and a kong walking / landing on it would drop through the grass into the hollow under
      // the yard. No berm vertex stands more than SKIRT_FLOAT above the ground the sim stands on (elsewhere ≤ 0.46 m:
      // unchanged); the slab's land wall reaches down to meet it (apron.ts rimGeometry).
      const fit = (px: number, py: number, pz: number): [number, number, number] => [px, Math.min(py, ground(px, pz) + SKIRT_FLOAT), pz];
      return [fit(x1, APRON_Y + 0.06, z1), fit(x2, y2, z2), fit(x3, y3, z3)];
    };
    let prev = row(0);
    for (let k = 1; k <= n; k++) {
      const t = k / n, cur = row(t);
      for (let j = 0; j < 2; j++) {
        const a = prev[j], b = prev[j + 1], c = cur[j + 1], d = cur[j];
        for (const q of [a, b, c, a, c, d]) { pos.push(q[0], q[1], q[2]); uv.push(q[0] / 4, q[2] / 4); }
      }
      if (k % 2 === 0) plants.push([cur[1][0], cur[1][1], cur[1][2]]);
      prev = cur;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  // orient every triangle up (the edge winding differs per edge): swap v1/v2 where the face normal points down
  const p = geo.attributes.position as THREE.BufferAttribute, q = geo.attributes.uv as THREE.BufferAttribute;
  for (let t = 0; t < p.count; t += 3) {
    const e1x = p.getX(t + 1) - p.getX(t), e1z = p.getZ(t + 1) - p.getZ(t), e2x = p.getX(t + 2) - p.getX(t), e2z = p.getZ(t + 2) - p.getZ(t);
    if (e1z * e2x - e1x * e2z >= 0) continue;
    const tx = p.getX(t + 1), ty = p.getY(t + 1), tz = p.getZ(t + 1), tu = q.getX(t + 1), tv = q.getY(t + 1);
    p.setXYZ(t + 1, p.getX(t + 2), p.getY(t + 2), p.getZ(t + 2)); q.setXY(t + 1, q.getX(t + 2), q.getY(t + 2));
    p.setXYZ(t + 2, tx, ty, tz); q.setXY(t + 2, tu, tv);
  }
  geo.computeVertexNormals();
  return { geo, plants };
}

// ------------------------------------------------------------------------------------------------ part
export const part: Part = {
  id: "yard",
  async build({ ctx, mats, group, lod }) {
    const safety = paint("#e8b21c", { rough: 0.5, grime: 0.4, name: "stair-yellow" });
    const grate = paint("#7c8084", { rough: 0.55, metal: 0.4, grime: 0.3, name: "grating" });
    const rackBlue = paint("#2d6a8f", { rough: 0.5, grime: 0.35, name: "rack-blue" });
    const b = new Builder(true);
    towers(b, safety, mats.galv, grate); await ctx.yield();
    reeferRack(b, rackBlue, mats.galv, grate, mats.darkPaint, mats.warnLight); await ctx.yield();
    const g = await b.buildAsync("yard-structures", { palette: (m) => /^(galv|darkPaint|warnLight|rack-blue|stair-yellow)$/.test(m.name) }, () => ctx.yield());
    group.add(g);
    // (perf: stair towers / rack gantry cast into cascade 0 only — thin steel; the far map carries them beyond ~45 m)
    mergeCasters(g, { c1: false });
    // (pop-proof: 240 m — at 180 m the stair towers + rack gantry faded in where they still read)
    lod.add(g, { show: 240, shadow: 120 });

    const fb = new Builder(true);
    const fenceMesh = new THREE.Mesh(fences(fb, mats.galv), chainLink());
    fenceMesh.name = "yard-fence-mesh"; fenceMesh.castShadow = false; fenceMesh.userData.castShadow = false; fenceMesh.receiveShadow = true;
    const posts = await fb.buildAsync("yard-fence-posts", { cast: false, palette: () => true }, () => ctx.yield());
    const fence = new THREE.Group(); fence.name = "yard-fences"; fence.add(fenceMesh, posts);
    group.add(fence);
    // (pop-proof: 220 m — at 160 m the fences grew in on every approach)
    lod.add(fence, { show: 220 });

    const patch = new THREE.Mesh(patchGeometry(), soil());
    patch.name = "yard-jungle-soil"; patch.receiveShadow = true; patch.castShadow = false; patch.userData.castShadow = false; patch.renderOrder = 1;
    group.add(patch);
    lod.add(patch, { show: 1200 });

    // the soil berm burying the land edges + grass / ferns / bushes on it
    const sk = skirtGeometry((x, z) => groundAt(ctx, x, z));
    const skirtMesh = new THREE.Mesh(sk.geo, skirtSoil());
    skirtMesh.name = "yard-land-skirt"; skirtMesh.receiveShadow = true; skirtMesh.castShadow = false; skirtMesh.userData.castShadow = false;
    group.add(skirtMesh);
    lod.add(skirtMesh, { show: 900 });

    const veg = ctx.shared.get("veg") as VegApi | undefined;
    if (veg) {
      group.updateMatrixWorld(true); plantJungle(veg, group.matrixWorld);
      const r = rng(9331), lists = new Map<PlantKind, THREE.Matrix4[]>();
      for (const [x, y, z] of sk.plants) for (let k = 0; k < 3; k++) {
        const kind: PlantKind = k === 0 ? (r() < 0.25 ? "bush" : r() < 0.55 ? "fern" : "grass") : "grass";
        const v = new THREE.Vector3(x + (r() - 0.5) * 2.2, y - 0.05, z + (r() - 0.5) * 2.2).applyMatrix4(group.matrixWorld), s = 0.7 + r() * 0.6;
        (lists.get(kind) ?? lists.set(kind, []).get(kind)!).push(new THREE.Matrix4().compose(v, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6.28, 0)), new THREE.Vector3(s, s, s)));
      }
      for (const [kind, list] of lists) veg.plant(kind, list);
    } else {
      // a page without the veg module (?modules=… dev / tool pages, e.g. the parity check) still draws the
      // slab trees' trunks, so what is drawn matches the trunk colliders the server keeps (shared JUNGLE_TREES)
      // (8 sides turned 22.5°: the octagon of the trunk colliders; the circumradius = the trunk radius)
      const trunk = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false).rotateY(Math.PI / 8).translate(0, 0.5, 0);
      const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: "#7a6246", roughness: 0.9, name: "trunk-standin" }), JUNGLE_TREES.length);
      JUNGLE_TREES.forEach((t, i) => { const r = t.kind === "palm" ? TRUNK_R.palm : TRUNK_R.tree; tm.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, APRON_Y - 0.05, t.z), new THREE.Quaternion(), new THREE.Vector3(r, 8.1, r))); });
      tm.name = "jungle-trunks-standin"; group.add(tm);
    }
    void toWorld;
  },
};
