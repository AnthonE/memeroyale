// PEEL STRIP airfield surfaces + yard (strip frame from shared/pois/peel-strip.ts): cracked asphalt runway with worn
// white centre dashes / edge lines, yellow threshold bar + far-end yellow dashes, crumbling sandy shoulders,
// yellow-black edge-light bollards, taxiway, concrete apron at the threshold, beige paver walkway with a yellow line,
// the crashed transport + boulders + debris at the far end, windsock lattice mast.
import * as THREE from "three";
import type { Terrain } from "../../../../../shared/world/terrain";
import * as S from "../../../../../shared/pois/peel-strip";
import { rng } from "../../../../../shared/pois/coast-kit";
import { Batch, M, rbox, cyl, sph, patch, ribbon } from "../_kit/coast-kit";
import * as P from "../_kit/coast-props";

const Y = 0.07; // runway surface lift over the pad

/** flat quad in the XZ plane (frame space) with optional per-corner alpha (vertex colour .a) for feathered edges */
function quad(x0: number, x1: number, z0: number, z1: number, y: number, a: [number, number, number, number] = [1, 1, 1, 1], segX = 1) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, segX, 1);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) - x0) / (x1 - x0), v = (p.getZ(i) - z0) / (z1 - z0);
    const al = (a[0] * (1 - u) + a[1] * u) * (1 - v) + (a[3] * (1 - u) + a[2] * u) * v;
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1; col[i * 4 + 3] = al;
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  return g;
}

/** the runway's long sinuous crack lines + short cross cracks (strip-local polylines) — drawn as dark crack strips
 *  here and followed by the weed tufts (peel-strip/index.ts), so the weeds grow IN the cracks */
export function crackLines(): Array<Array<[number, number]>> {
  const r = rng(9191), L = S.RWY.len, out: Array<Array<[number, number]>> = [];
  for (let c = 0; c < 7; c++) {
    const z0 = -S.RWY.half + 1.5 + c * (2 * S.RWY.half - 3) / 6, ph = r() * 6, amp = 0.8 + r() * 1.6, x0 = 4 + r() * 30;
    const line: Array<[number, number]> = [];
    for (let x = x0; x < L - 1; x += 1.2) line.push([x, z0 + Math.sin(x * 0.07 + ph) * amp + Math.sin(x * 0.23 + ph * 2) * 0.4 + (r() - 0.5) * 0.25]);
    out.push(line);
  }
  for (let k = 0; k < 30; k++) {
    const x = 8 + r() * (L - 12), z0 = (r() - 0.5) * 2 * S.RWY.half * 0.9, line: Array<[number, number]> = [];
    for (let j = 0; j < 5; j++) line.push([x + (r() - 0.5) * 0.9, z0 + j * 0.75]);
    out.push(line);
  }
  return out;
}
/** a chunky broken asphalt slab: jagged 7–9-gon extruded 7 cm with a bevel (not paper-thin black cut-outs) */
function slabGeo(seed: number, w: number, d: number, t = 0.07) {
  const r = rng(seed), n = 7 + Math.floor(r() * 3), sh = new THREE.Shape();
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + (r() - 0.5) * 0.5, k2 = 0.62 + r() * 0.45; const x = Math.cos(a) * w * 0.5 * k2, z = Math.sin(a) * d * 0.5 * k2; if (k) sh.lineTo(x, z); else sh.moveTo(x, z); }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 });
  g.rotateX(Math.PI / 2); g.translate(0, t, 0);
  return g;
}

export function buildField(b: Batch, bMid: Batch, terrain: Terrain, glows: THREE.Vector3[]) {
  const R = S.RWY, st = S.STRIP;
  b.setFrame(st.x, st.y, st.z, st.yaw);
  const r = rng(77);
  // ---- runway asphalt, shoulders (feathered sandy verge), threshold apron
  b.add(quad(-1, R.len + 1, -R.half, R.half, Y, undefined, 40), "gAsphalt", { tile: 13, color: 0xd8d6d2 });
  for (const s of [-1, 1]) {
    const z0 = s * R.half, z1 = s * (R.half + R.shoulder);
    b.add(quad(-2, R.len + 2, Math.min(z0, z1), Math.max(z0, z1), Y - 0.02, s < 0 ? [0, 0, 1, 1] : [1, 1, 0, 0], 40), "sandy", { tile: 6, color: 0xd6cdb0 });
    // crumbling asphalt lip: chunky broken slabs (7 cm, bevelled, light grey with dark cracked joints) lying just off
    // the edge, a few tilted, with loose grit between them and the verge
    for (let x = 2; x < R.len; x += 3.2 + r() * 3.4) {
      const w = 0.55 + r() * 0.9, zz = s * (R.half + 0.25 + r() * 0.55);
      b.add(slabGeo(700 + Math.round(x * 3), w, 0.35 + r() * 0.4), "gAsphalt", { m: M(x, Y - 0.03, zz, (r() - 0.5) * 0.12, r() * 3, (r() - 0.5) * 0.1), tile: 13, color: 0xf4f2ee, shadow: false, lod: 2 });
      if (r() < 0.6) b.add(P.boulderGeo(900 + Math.round(x * 5), 0.07 + r() * 0.06, 0.04, 0.06, 8), "gBoulder", { m: M(x + (r() - 0.5), Y - 0.02, zz + s * (0.3 + r() * 0.3), 0, r() * 6, 0), tile: 1, color: 0x9a948a, shadow: false, lod: 2 });
    }
  }
  // repair patches (darker, square-ish) + dark crack strips the weeds grow in (they read at 60–100 m)
  for (let k = 0; k < 14; k++) {
    const x = 20 + r() * (R.len - 30), z = (r() - 0.5) * (2 * R.half - 3), w = 1.2 + r() * 2.2, d = 1 + r() * 1.8;
    b.add(quad(x - w / 2, x + w / 2, z - d / 2, z + d / 2, Y + 0.006), "gAsphalt", { tile: 7, color: 0x9a9894, shadow: false });
  }
  for (const line of crackLines()) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1], len = Math.hypot(bx - ax, bz - az), wdt = line.length > 6 ? 0.07 + r() * 0.06 : 0.05;
      const g = new THREE.PlaneGeometry(len + 0.04, wdt); g.rotateX(-Math.PI / 2);
      b.add(g, "paint", { m: M((ax + bx) / 2, Y + 0.009, (az + bz) / 2, 0, Math.atan2(-(bz - az), bx - ax), 0), uv: "keep", color: 0x151412, shadow: false });
    }
  }
  // (no far-end band of loose black asphalt slabs — on the dirt they read as floating stepping stones)
  for (let k = 0; k < 40; k++) {
    const x = R.len + 1 + r() * 5, z = (r() - 0.5) * 2 * R.half * 1.05;
    b.add(P.boulderGeo(1100 + k, 0.08 + r() * 0.1, 0.05, 0.07, 8), "gBoulder", { m: M(x, Y - 0.02, z, 0, r() * 6, 0), tile: 1, color: 0x9a948a, shadow: false, lod: 2 });
  }
  // far-end dirt overrun toward the crash

  // concrete apron at the threshold: 0.6 m mossy pavers (not huge plain slabs) on a kerbed slab
  const A = S.APRON;
  b.add(quad(A.x0, A.x1, A.z0, A.z1, Y - 0.005, undefined, 4), "pavers", { tile: 2.4, color: 0xe6e0d4, shadow: false });
  for (const [x0, x1, z0, z1] of [[A.x0, A.x1, A.z0 - 0.25, A.z0], [A.x0, A.x1, A.z1, A.z1 + 0.25], [A.x0 - 0.25, A.x0, A.z0 - 0.25, A.z1 + 0.25]] as Array<[number, number, number, number]>) {
    b.add(rbox(x1 - x0, 0.14, z1 - z0, 0.03), "concrete", { m: M((x0 + x1) / 2, Y + 0.0, (z0 + z1) / 2), tile: 1.5, color: 0xb9b3a6, shadow: false });
  }
  // ---- markings (worn paint decals)
  const paint = (x0: number, x1: number, z0: number, z1: number, color: number) => b.add(quad(x0, x1, z0, z1, Y + 0.012), "paint", { tile: 3, color, shadow: false });
  for (let x = 16; x < R.len - 12; x += 11) paint(x, x + 5, -0.28, 0.28, x > R.len - 60 ? 0xf0c030 : 0xf4f1ea);          // centre dashes
  for (const s of [-1, 1]) for (let x = 0; x < R.len; x += 24) paint(x + 0.5, Math.min(R.len - 0.5, x + 23.5), s * (R.half - 0.75) - 0.18, s * (R.half - 0.75) + 0.18, 0xf2efe8); // edge lines
  // every marking is broken up — the bar and the piano keys are laid as
  // worn fragments with gaps, chipped ends, faded tints and missing chunks; rubber skid marks over the touchdown zone
  const worn = (x0: number, x1: number, z0: number, z1: number, color: number, seed: number) => {
    const rr = rng(seed);
    for (let x = x0; x < x1;) {
      const len = 0.5 + rr() * 1.9, gap = 0.08 + rr() * 0.45, xe = Math.min(x1, x + len);
      if (rr() > 0.12) {
        const c = new THREE.Color(color).multiplyScalar(0.72 + rr() * 0.3), dz0 = rr() * 0.12, dz1 = rr() * 0.12;
        b.add(quad(x, xe, z0 + dz0, z1 - dz1, Y + 0.012), "paint", { tile: 3, color: c, shadow: false });
      }
      x = xe + gap;
    }
  };
  worn(0.4, 1.4, -R.half + 0.3, R.half - 0.3, 0xf0b92a, 501);                   // yellow threshold bar
  for (let z = -R.half + 1.2, k = 0; z < R.half - 1; z += 2.1, k++) worn(3.0, 10.0, z, z + 1.0, 0xf2efe8, 510 + k); // piano keys
  for (let k = 0; k < 6; k++) {
    const x = 12 + r() * 40, z = (r() - 0.5) * 7, L = 4 + r() * 8;
    b.add(quad(x, x + L, z - 0.09, z + 0.09, Y + 0.011, [0.2, 0.2, 0.2, 0.2]), "paint", { tile: 3, color: 0x55504a, shadow: false });
    b.add(quad(x + 0.4, x + L * 0.8, z + 0.7, z + 0.86, Y + 0.011, [0.2, 0.2, 0.2, 0.2]), "paint", { tile: 3, color: 0x5a554e, shadow: false });
  }
  paint(A.x0 + 0.5, 0, A.z0 + 0.4, A.z0 + 0.9, 0xf0b92a);                        // apron edge line
  // ---- edge light bollards every 15 m: 0.35 m yellow/black striped posts, glass cap (readable from the deck)
  const mm = (a: THREE.Matrix4, c: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, c);
  bMid.setFrame(st.x, st.y, st.z, st.yaw);
  for (const x of S.BOLLARD_X) for (const s of [-1, 1]) {
    const bm = M(x, 0, s * (R.half + 0.9)), q = bMid;
    q.add(cyl(0.3, 0.32, 0.08, 14), "concrete", { m: mm(bm, M(0, 0.04, 0)), color: 0x9a968e, shadow: false });
    q.add(cyl(0.16, 0.18, 0.62, 14), "gloss", { m: mm(bm, M(0, 0.39, 0)), uv: "local", color: 0xf1c01c });
    for (const y of [0.26, 0.52]) q.add(cyl(0.175, 0.175, 0.1, 14), "gloss", { m: mm(bm, M(0, y, 0)), color: 0x1d1d1d });
    q.add(cyl(0.12, 0.14, 0.16, 12), "glass", { m: mm(bm, M(0, 0.78, 0)), shadow: false });
    q.add(sph(0.08, 10, 6), x > R.len - 40 ? "lampRed" : "lamp", { m: mm(bm, M(0, 0.78, 0)), shadow: false });
    q.add(cyl(0.14, 0.12, 0.04, 12), "pmetal", { m: mm(bm, M(0, 0.88, 0)), color: 0x1d1d1d, shadow: false });
  }
  bMid.setFrame(0, 0, 0, 0);
  // ---- paver walkway (beige slabs, yellow edge line) from the tower to the shed
  // (+ the terminal walk — the runway shoulder straight to the terminal canopy, so the terminal doesn't stand in a lawn)
  // (the terminal walk follows the ground: the forecourt rises a few cm into the pad blend — slabs at pad height sank)
  const gy = (x: number, z: number, follow: boolean) => { if (!follow) return 0; const w = S.sw(x, z); return Math.max(0, terrain.height(w[0], w[2]) - S.PAD.y); };
  for (const [W, follow] of [[S.WALKWAY, false], [[[88, -12.8], [88, -28.2]], true]] as Array<[Array<[number, number]>, boolean]>) for (let i = 0; i + 1 < W.length; i++) {
    const [ax, az] = W[i], [bx, bz] = W[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 1.25);
    const yaw = Math.atan2(-(bz - az), bx - ax), tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
    for (let k = 0; k < n; k++) for (const o of [-0.63, 0.63]) {
      const t = (k + 0.5) / n, px = ax + (bx - ax) * t + nx * o, pz = az + (bz - az) * t + nz * o;
      b.add(rbox(1.18, 0.14, 1.18, 0.03), "concrete", { m: M(px, gy(px, pz, follow), pz, 0, yaw + (r() - 0.5) * 0.04, 0), tile: 1.2, color: new THREE.Color(0xd9ccb0).multiplyScalar(0.9 + r() * 0.15), shadow: false, lod: 1 });
    }
    if (follow) for (let k = 0; k < n; k++) { // the edge line in short dashes that follow the ground too
      const t = (k + 0.5) / n, px = ax + (bx - ax) * t + nx * 1.18, pz = az + (bz - az) * t + nz * 1.18;
      const g = new THREE.PlaneGeometry(L / n, 0.16); g.rotateX(-Math.PI / 2);
      b.add(g, "paint", { m: M(px, gy(px, pz, true) + 0.08, pz, 0, yaw, 0), tile: 3, color: 0xf0b92a, shadow: false });
    }
    if (follow) continue;
    const g = new THREE.PlaneGeometry(L, 0.16); g.rotateX(-Math.PI / 2);
    b.add(g, "paint", { m: M((ax + bx) / 2 + nx * 1.18, 0.08, (az + bz) / 2 + nz * 1.18, 0, yaw, 0), tile: 3, color: 0xf0b92a, shadow: false });
  }
  // lawn dressing between the tower, the hangar and the runway: mossy boulders,
  // a drum pair + spare tyres by the walkway, a stack of crates, a wheel-less old cart
  b.setFrame(0, 0, 0, 0);
  for (const [x, z, rad, seed] of [[-4, -30, 1.1, 31], [14, -30, 0.8, 32], [22, -12.5, 0.7, 33], [48, -14, 1.3, 34], [-16, -22, 0.9, 35], [60, 14, 1.2, 36], [96, 15, 0.9, 37], [30, 15.5, 0.7, 38]] as Array<[number, number, number, number]>) {
    const p = S.sw(x, z); P.boulder(b, terrain, p[0], p[2], rad, seed, { flat: 0.62, sink: 0.25, key: "gBoulder" });
  }
  // worn dirt where the crews walk + drive — sandy patches by the
  // tower, the drum pile and the hangar corner, and twin tyre tracks from the apron across the lawn to the hangar
  for (const [x, z, rx, rz, yaw, seed] of [[-6, -24, 4.5, 2.6, 0.3, 61], [14, -20, 3.2, 2.2, -0.4, 62], [30, -22, 5.5, 2.4, 0.1, 63], [46, -30, 3.0, 2.0, 0.8, 64], [-14, -32, 3.6, 2.4, -0.2, 65], [62, -12, 4.0, 2.2, 0.5, 66], [20, 16.5, 4.5, 1.8, 0.05, 67], [84, 15.5, 3.5, 1.6, -0.1, 68]] as Array<[number, number, number, number, number, number]>) {
    const p = S.sw(x, z);
    b.add(patch(terrain, p[0], p[2], rx, rz, { yaw: st.yaw + yaw, tile: 6, lift: 0.04, seed, wobble: 0.3 }), "sandy", { uv: "keep", color: 0xcbbf9c, shadow: false });
  }
  for (const off of [-0.85, 0.85]) {
    const pts: Array<[number, number]> = [[-6, -14 + off], [10, -17 + off], [24, -19.5 + off], [34, -22 + off]].map(([x, z]) => { const p = S.sw(x, z); return [p[0], p[2]] as [number, number]; });
    b.add(ribbon(terrain, pts, 0.55, { lift: 0.05, step: 1.5, tile: 5 }), "sandy", { uv: "keep", color: 0xbcae88, shadow: false });
  }
  bMid.setFrame(st.x, st.y, st.z, st.yaw);
  for (const [x, z, c] of [[12.5, -16.2, 0xb3302a], [13.2, -15.6, 0x3d7a3c], [12.7, -15.0, 0xb3302a]] as Array<[number, number, number]>) P.drum(bMid, M(x, 0, z, 0, x, 0), c);
  P.drum(bMid, M(13.9, 0.3, -16.4, 0, 0.4, 0), 0x3d7a3c, true);
  for (let k = 0; k < 3; k++) bMid.add(new THREE.TorusGeometry(0.36, 0.14, 8, 18).rotateX(Math.PI / 2), "rubber", { m: M(15.2, 0.14 + k * 0.27, -15.2), uv: "local", color: 0x2a2826 });
  P.crate(bMid, M(-2.5, 0, -18.5, 0, 0.3, 0), { lid: true, seed: 41 });
  P.crate(bMid, M(-2.4, 0.82, -18.4, 0, 0.1, 0), { full: true, seed: 42 });
  P.pallet(bMid, M(-4.2, 0, -19.2, 0, 1.2, 0));
  bMid.setFrame(0, 0, 0, 0);
  b.setFrame(st.x, st.y, st.z, st.yaw);
  // taxiway apron (hangar frame: door → runway) with a dashed white centre line + yellow edges
  const Tx = S.TAXI, hf = S.HGR.frame;
  b.setFrame(hf.x, hf.y, hf.z, hf.yaw);
  b.add(quad(Tx.x0, Tx.x1, Tx.z0, Tx.z1, Y - 0.01, undefined, 4), "gAsphalt", { tile: 13, color: 0xcfccc6 });
  for (let x = Tx.x0 + 1; x < Tx.x1 - 1; x += 3.2) paint(x, x + 1.6, -0.16, 0.16, 0xf2efe8);
  for (const z of [Tx.z0 + 0.5, Tx.z1 - 0.5]) paint(Tx.x0, Tx.x1, z - 0.12, z + 0.12, 0xf0b92a);
  b.setFrame(0, 0, 0, 0);
  // far-end dirt overrun toward the crash (terrain-hugging, feathered)
  { const p = S.sw(R.len + 18, -2); b.add(patch(terrain, p[0], p[2], 30, 20, { yaw: st.yaw, tile: 7, lift: 0.04, seed: 9, wobble: 0.2 }), "sandy", { uv: "keep", color: 0xd8ceb0 }); }
  // ---- crash site (world space): the transport, debris, scorched grass blob, boulders
  const [cx, cz, cyaw] = S.CRASH;
  // (the transport itself is drawn by crash.ts buildCrash — every part at its shared collider box)
  void cx; void cz; void cyaw;
  for (const [x, z, rad, seed] of S.BOULDERS) { const p = S.sw(x, z); P.boulder(b, terrain, p[0], p[2], rad, seed, { flat: 0.72, sink: 0.25, tint: 0xffffff, key: "gBoulder" }); }
  // windsock on a lattice mast behind the hangar (sock points downwind, roughly toward the runway)
  { const p = S.sw(S.WINDSOCK[0], S.WINDSOCK[1]); P.windsock(bMid, M(p[0], terrain.height(p[0], p[2]), p[2], 0, S.STRIP.yaw - 1.2, 0), 10.5, true); b.add(rbox(1.2, 0.3, 1.2, 0.04), "concrete", { m: M(p[0], terrain.height(p[0], p[2]) + 0.1, p[2]), color: 0xa8a49a }); }
  void glows;
}
