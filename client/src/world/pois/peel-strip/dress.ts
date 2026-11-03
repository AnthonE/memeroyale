// PEEL STRIP — the terminal, the airfield cover props, the hangar workshop cover and the new rails: every
// piece drawn at EXACTLY its shared collider (shared/pois/peel-strip.ts TERM_LOCAL, COVER + COVER_KIT, HGR_COVER).
import * as THREE from "three";
import * as S from "../../../../../shared/pois/peel-strip";
import { F, sub, toWorld } from "../../../../../shared/pois/coast-kit";
import { Batch, M, box, rbox, cyl, sph, addPieces, dressOpenings, blobShadow } from "../_kit/coast-kit";
import { wheel } from "../_kit/coast-vehicles";
import { textDecal } from "../_kit/coast-sign";
import { containerGeometry } from "../_kit/containers-geo";
import { crateBlock, drawRails, h01, openStair, plate, rail, shelfUnit, stairTreads } from "./coast-dress";
import { rng } from "../../../../../shared/pois/coast-kit";
import { boxVan, palletRack, radialEngine, rockBlock, rollCabinet } from "./hero-props";
import * as P from "../_kit/coast-props";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
const YEL = 0xfbe24a, DARK = 0x3a332d;

// ------------------------------------------------------------------------------------------------ terminal
export function buildTerminal(b: Batch, bMid: Batch, bNear: Batch, glows: THREE.Vector3[]) {
  const T = S.TERM, f = T.frame, { hx, hz, t, f0, f1 } = T, rt = T.roof;
  for (const q of [b, bMid, bNear]) q.setFrame(f.x, f.y, f.z, f.yaw);
  addPieces(b, S.TERM_LOCAL, {
    "tm:slab": { mat: "gConcrete", color: 0xb9b4aa, tile: 5 },
    "tm:wall": { mat: "gConcrete", color: new THREE.Color(0.93, 0.98, 1.06), tile: 4.2, ao: true },
    "tm:floor1": { mat: "concrete", color: 0xc9c3b8, tile: 3 },
    "tm:roofslab": { mat: "gConcrete", color: 0xb0aba2, tile: 5 },
    "tm:step": { mat: "plaster", color: 0xe4ddcf, tile: 1.4 },
    "tm:parapet": { mat: "plaster", color: 0xf6f0e2, tile: 2.5 },
    "tm:canopy": { mat: "plaster", color: YEL, tile: 2, round: 0.04 },
    "tm:post": { mat: "pmetal", skip: true }, "tm:ac": { mat: "pmetal", skip: true }, "tm:tank": { mat: "pmetal", skip: true },
    "tm:fstep": { mat: "pmetal", skip: true }, "tm:fland": { mat: "pmetal", color: 0x5b6570, tile: 1.2, round: 0.02 }, "tm:sign": { mat: "pmetal", skip: true },
    rail: { mat: "pmetal", skip: true },
  }, 0);
  // openings: dark frames + clear glass + sills, open door leaves (same wall lines + lists as the colliders)
  const O = S.TERM_OPEN, o = (a: ReadonlyArray<{ u: number; w: number; y0: number; h: number }>, dy = 0) => a.map((q) => ({ ...q, y0: q.y0 + dy }));
  const dress = (y0: number, fr: typeof O.front0, bk: typeof O.back0, rg: typeof O.right0, lf: typeof O.left0, dy: number) => {
    const od = { frame: 0x2f3438, frameKey: "pmetal" as const, frameW: 0.09, glass: "glass" as const, mullions: false, sill: 0xd8d2c4, leaf: 0x3e6f8a, swing: S.TERM_SWING, leafKey: "gloss" as const };
    dressOpenings(b, -hx, hz - t / 2, hx, hz - t / 2, y0, o(fr, dy), t, od);
    dressOpenings(b, hx, -hz + t / 2, -hx, -hz + t / 2, y0, o(bk, dy), t, od);
    dressOpenings(b, hx - t / 2, hz - t, hx - t / 2, -hz + t, y0, o(rg, dy), t, od);
    dressOpenings(b, -hx + t / 2, -hz + t, -hx + t / 2, hz - t, y0, o(lf, dy), t, od);
  };
  dress(f0, O.front0, O.back0, O.right0, O.left0, 0);
  dress(f1 - 0.3, O.front1, O.back1, O.right1, O.left1, 0.3);
  // yellow base band + first-floor slab band + corner pilasters (proud ≤ 4 cm: inside the collider tolerance)
  const band = (y: number, h: number, c: number) => {
    for (const s of [-1, 1]) {
      b.add(box(2 * hx + 0.08, h, 0.04), "plaster", { m: M(0, y + h / 2, s * (hz + 0.02)), tile: 2, color: c });
      b.add(box(0.04, h, 2 * hz + 0.08), "plaster", { m: M(s * (hx + 0.02), y + h / 2, 0), tile: 2, color: c });
    }
  };
  // (the base band stops under the window sills / at the door jambs: drawn as a low kick only)
  band(f0 - 0.05, 0.42, YEL); band(f1 - 0.34, 0.36, YEL); band(rt - 0.3, 0.3, 0xe6dfcf);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(rbox(0.3, rt + 0.02, 0.3, 0.04), "plaster", { m: M(sx * (hx - 0.13), rt / 2, sz * (hz - 0.13)), tile: 2, color: 0xe9e2d2 });
  // parapet coping (yellow) + the PEEL STRIP letters on the front parapet + TERMINAL over the door
  for (const s of [-1, 1]) {
    b.add(rbox(2 * hx + 0.1, 0.08, 0.38, 0.02), "plaster", { m: M(0, rt + T.parapet + 0.04, s * (hz - 0.15)), color: YEL });
    b.add(rbox(0.38, 0.08, 2 * hz - 0.5, 0.02), "plaster", { m: M(s * (hx - 0.15), rt + T.parapet + 0.04, 0), color: YEL });
  }
  // the rooftop sign board (a steel frame on the front parapet, both faces lettered) + its back braces
  {
    const SG = S.TERM_SIGN, zc = hz - 0.22, w = SG.x1 - SG.x0, h = SG.y1 - SG.y0, yc = rt + (SG.y0 + SG.y1) / 2;
    b.add(rbox(w, h, SG.t, 0.03), "gloss", { m: M(0, yc, zc), color: 0xf6d23a });
    b.add(rbox(w + 0.12, 0.12, SG.t + 0.04, 0.02), "gloss", { m: M(0, rt + SG.y1 - 0.02, zc), color: YEL });
    b.add(rbox(w + 0.12, 0.1, SG.t + 0.04, 0.02), "gloss", { m: M(0, rt + SG.y0 + 0.03, zc), color: YEL });
    textDecal(b, "PEEL STRIP", (w - 0.6) * 0.62, h * 0.66, M(0, yc + 0.12, zc + SG.t / 2 + 0.006), { fg: "#1f5f8c", bg: null, font: 900, outline: "#fdf6e3" });
    textDecal(b, "AIR TERMINAL · EST. 1962", w * 0.5, h * 0.16, M(0, rt + SG.y0 + 0.26, zc + SG.t / 2 + 0.006), { fg: "#1d1a14", bg: null, font: 800 });
    textDecal(b, "BANANA CO. AIRWAYS", w - 1.2, h * 0.5, M(0, yc, zc - SG.t / 2 - 0.006, 0, Math.PI, 0), { fg: "#fdf6e3", bg: null, font: 900 });
    for (const x of [-4.6, -1.5, 1.5, 4.6]) bNear.add(box(0.06, 1.6, 0.06), "pmetal", { m: M(x, rt + 0.95, zc - 0.85, 0.55, 0, 0), color: DARK });
    // floodlights on the sign top, aimed at its face
    for (const x of [-3.6, 0, 3.6]) { bNear.add(rbox(0.3, 0.18, 0.22, 0.03), "pmetal", { m: M(x, rt + SG.y1 + 0.12, zc + 0.3, -0.5, 0, 0), color: 0x333333 }); bNear.add(box(0.24, 0.12, 0.02), "lamp", { m: M(x, rt + SG.y1 + 0.08, zc + 0.42, -0.5, 0, 0) }); }
  }
  // deep cornice at the roof line + a dark drip band (the parapet reads as a real roofline from the ground)
  for (const s of [-1, 1]) {
    b.add(rbox(2 * hx + 0.5, 0.22, 0.22, 0.04), "plaster", { m: M(0, rt - 0.12, s * (hz + 0.08)), color: 0xe9e2d2 });
    b.add(rbox(0.22, 0.22, 2 * hz + 0.5, 0.04), "plaster", { m: M(s * (hx + 0.08), rt - 0.12, 0), color: 0xe9e2d2 });
  }
  // the deep canopy: fascia band, soffit lamps, four posts, the ARRIVALS sign hung at its front edge
  const CN = S.TERM_CANOPY;
  b.add(rbox(CN.x1 - CN.x0 + 0.1, 0.4, 0.12, 0.03), "plaster", { m: M(0, CN.y0 + 0.1, CN.z1 + 0.02), color: YEL });
  for (const x of CN.posts) b.add(cyl(0.11, 0.12, CN.y0, 12), "pmetal", { m: M(x, CN.y0 / 2, CN.z1 - 0.32), uv: "local", color: DARK });
  plate(b, "TERMINAL · ARRIVALS", 3.4, 0.42, M(0, 2.55, CN.z1 + 0.1), "#fdf6e3", "#2a6f9a");
  for (const x of [-3, -1, 1, 3]) for (const z of [hz + 1.2, hz + 2.9]) { b.add(cyl(0.16, 0.16, 0.05, 14), "lamp", { m: M(x, CN.y0 - 0.03, z) }); if (z < hz + 2) glows.push(new THREE.Vector3(x, CN.y0 - 0.1, z).applyMatrix4(b.frame)); }
  // a pendant lamp hung from the roof slab over the middle of the stair-1 well:
  // a warm light you see from the front door up through the well, ~2 m over the first floor (over the hole: nobody walks
  // under it), with its glow; the office's dado round the well is pale (shared peel-strip.ts INTERIOR_ROOMS)
  { const W1 = T.well, cx = (W1.x0 + W1.x1) / 2, cz = (W1.z0 + W1.z1) / 2, y = rt - 1.45, top = rt - 0.3;
    b.add(cyl(0.012, 0.012, top - y, 4), "steel", { m: M(cx, (y + top) / 2, cz), color: 0x333333 });
    b.add(cyl(0.15, 0.3, 0.22, 16), "pmetal", { m: M(cx, y + 0.13, cz), color: 0x2f5a3a });
    b.add(sph(0.12, 10, 8), "lamp", { m: M(cx, y, cz) });
    glows.push(new THREE.Vector3(cx, y - 0.06, cz).applyMatrix4(b.frame)); }
  // grime: rain streaks under the sills, a dark splash band at the base, moss at the corners
  { const rr = rng(8817);
    for (const s of [-1, 1]) for (let k = 0; k < 14; k++) {
      const x = -hx + 0.6 + rr() * (2 * hx - 1.2), y0 = 0.4 + rr() * 5.5, L = 0.6 + rr() * 1.6;
      bNear.add(box(0.06 + rr() * 0.1, L, 0.008), "paint", { m: M(x, y0 + L / 2, s * (hz + 0.006)), color: 0x5a5448, shadow: false });
    }
    for (const s of [-1, 1]) { b.add(box(2 * hx + 0.02, 0.35, 0.008), "paint", { m: M(0, 0.48, s * (hz + 0.007)), color: 0x4a4436, shadow: false }); b.add(box(0.008, 0.35, 2 * hz), "paint", { m: M(s * (hx + 0.007), 0.48, 0), color: 0x4a4436, shadow: false }); }
  }
  // the back fire stair: open steel treads, stringers, a mid-height post every 4 m, outer rail drawn by drawRails
  openStair(b, S.TERM_LOCAL, "tm:fstep", { mat: "pmetal", color: 0x6b7580, stringer: 0x3a4046, thick: 0.06 });
  { const B = S.TERM_BACKSTAIR, zc = -hz - 0.1 - B.w / 2; for (let x = B.x0 + 3; x < B.x0 + B.run * B.n; x += 4) { const y = (x - B.x0) / B.run * (rt / B.n); for (const dz of [-B.w / 2 + 0.05, B.w / 2 - 0.05]) b.add(box(0.1, y - 0.1, 0.1), "pmetal", { m: M(x, (y - 0.1) / 2, zc + dz), color: 0x3a4046 }); } }
  // rooftop: AC units (fan grilles), water tank on a stand, vent stacks, a whip antenna, the stair hatch hood
  for (const [x0, z0, x1, z1, h, k, y0] of S.TERM_FURN) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    if (k === "tm:ac") {
      bMid.add(rbox(w, h, d, 0.05), "pmetal", { m: M(cx, y0 + h / 2, cz), tile: 1, color: 0xc9ccc9 });
      for (const s of [-1, 1]) {
        bMid.add(cyl(0.34, 0.34, 0.04, 20), "steel", { m: M(cx + s * w * 0.22, y0 + h + 0.01, cz), uv: "local", color: 0x404448 });
        bNear.add(box(0.7, 0.02, 0.03), "steel", { m: M(cx + s * w * 0.22, y0 + h + 0.04, cz, 0, 0.6, 0), color: 0x2a2c2e });
      }
      bMid.add(box(w * 0.9, h * 0.5, 0.02), "steel", { m: M(cx, y0 + h * 0.45, cz + d / 2 + 0.005), color: 0x8a8e90 });
    } else if (k === "tm:tank") {
      bMid.add(rbox(w, 0.3, d, 0.03), "pmetal", { m: M(cx, y0 + 0.15, cz), color: 0x5a5a58 });
      bMid.add(cyl(Math.min(w, d) / 2 - 0.02, Math.min(w, d) / 2 - 0.02, h - 0.3, 20), "gloss", { m: M(cx, y0 + 0.3 + (h - 0.3) / 2, cz), uv: "local", color: 0x3f7fb0 });
      // (the collider is the box: a boxy frame around the round tank keeps the silhouette inside the tolerance)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bMid.add(box(0.08, h, 0.08), "pmetal", { m: M(cx + sx * (w / 2 - 0.04), y0 + h / 2, cz + sz * (d / 2 - 0.04)), color: 0x5a5a58 });
    }
  }
  b.add(cyl(0.035, 0.05, 6, 6), "pmetal", { m: M(hx - 1.2, rt + 3, -hz + 1.2), uv: "local", color: 0x9a9a9a });
  bNear.add(sph(0.08, 8, 6), "lampRed", { m: M(hx - 1.2, rt + 6.05, -hz + 1.2) });
  for (const x of [-1.5, 4.2]) b.add(cyl(0.16, 0.16, 0.9, 10), "pmetal", { m: M(x, rt + 0.45, 3.9), uv: "local", color: 0x8c8f90 });
  drawRails(b, S.TERM_LOCAL, { color: DARK });
  stairTreads(bNear, S.TERM_LOCAL, "tm:step", { mat: "concrete", color: 0x9a948a });
  for (const q of [b, bMid, bNear]) q.setFrame(0, 0, 0, 0);
}

// ------------------------------------------------------------------------------------------------ airfield cover
/** one cover prop in its kind-local frame (base at y 0) drawn at exactly COVER_KIT[kind] */
function coverProp(b: Batch, n: Batch, k: S.CoverKind, m: THREE.Matrix4, seed: number) {
  const r = (i: number) => h01(seed, i);
  switch (k) {
    case "sandbags": {
      // a U-shaped revetment of stacked sandbags (4 courses, staggered), a hidden core keeps the bullet face solid
      const bag = new THREE.SphereGeometry(0.3, 8, 6), p = bag.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setXYZ(i, p.getX(i) * 1.05, y * (y < 0 ? 0.42 : 0.56), p.getZ(i) * 0.62); }
      bag.computeVertexNormals();
      const course = (x0: number, x1: number, z: number, yaw: number, dx: number) => {
        for (let j = 0; j < 4; j++) {
          const off = j % 2 ? 0.31 : 0, y = 0.13 + j * 0.3;
          for (let x = x0 + 0.31 + off; x <= x1 - 0.28; x += 0.62) {
            const s = seed + j * 13 + Math.round(x * 10), c = new THREE.Color(0xc9b58a).multiplyScalar(0.86 + r(s) * 0.22);
            b.add(bag, "fabric", { m: mul(m, M(yaw ? dx : x, y, yaw ? x : z, (r(s + 1) - 0.5) * 0.12, yaw + (r(s + 2) - 0.5) * 0.18, 0)), uv: "local", tile: 0.8, color: c, lod: 1 });
          }
        }
      };
      course(-1.5, 1.5, 0, 0, 0);
      for (const s of [-1, 1]) course(0.3, 1.2, 0, Math.PI / 2, s * 1.5);
      b.add(box(2.9, 1.1, 0.4), "fabric", { m: mul(m, M(0, 0.58, 0)), tile: 1, color: 0x9d8a66, lod: 1, shadow: false });
      break;
    }
    case "barrier": {
      // two precast jersey barriers (near-vertical faces so the drawn wall = the collider), red/white hazard paint
      const shp = new THREE.Shape([new THREE.Vector2(-0.32, 0), new THREE.Vector2(0.32, 0), new THREE.Vector2(0.3, 0.3), new THREE.Vector2(0.24, 1.1), new THREE.Vector2(-0.24, 1.1), new THREE.Vector2(-0.3, 0.3)]);
      const g = new THREE.ExtrudeGeometry(shp, { depth: 2.96, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
      g.translate(0, 0, -1.48); g.rotateY(Math.PI / 2);
      for (const [x, z] of [[-1.55, 0], [1.55, 0.12]]) {
        b.add(g, "gConcrete", { m: mul(m, M(x, 0, z)), tile: 1.6, color: 0xd6d2c8, lod: 1 });
        for (let i = 0; i < 3; i++) b.add(box(0.5, 0.18, 0.02), "plaster", { m: mul(m, M(x - 1 + i, 0.8, z + 0.265, 0, 0, 0.45)), color: i % 2 ? 0xf2f0ea : 0xc8342a, lod: 2, shadow: false });
      }
      break;
    }
    case "crates":
      crateBlock(b, -1.3, 0, -0.85, 1.3, 1.7, 0.85, seed, { m });
      break;
    case "cart": {
      // baggage cart: steel bed on 4 wheels, skirt, corner posts + a luggage load, tow bar
      b.add(rbox(2.9, 0.12, 1.44, 0.02), "pmetal", { m: mul(m, M(0, 0.5, 0)), color: 0x6c7a80, lod: 1 });
      for (const s of [-1, 1]) b.add(box(2.9, 0.34, 0.03), "pmetal", { m: mul(m, M(0, 0.3, s * 0.71)), color: 0x55626a, lod: 1 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        wheel(b, mul(m, M(sx * 1.0, 0.2, sz * 0.62)), 0.2, 0.12, { rim: 0x9a9a9a, lugs: 0, hub: false });
        b.add(box(0.05, 0.9, 0.05), "pmetal", { m: mul(m, M(sx * 1.42, 0.95, sz * 0.69)), color: YEL, lod: 1 });
      }
      for (const s of [-1, 1]) b.add(box(2.86, 0.05, 0.05), "pmetal", { m: mul(m, M(0, 1.38, s * 0.69)), color: YEL, lod: 1 });
      const cols = [0x2f5f86, 0xa33b2f, 0x3d6b3a, 0x7a5a3a, 0x2b2b2b, 0xc98f2a];
      let x = -1.35;
      for (let i = 0; x < 1.2 && i < 6; i++) {
        const w = 0.42 + r(i) * 0.3, h = 0.45 + r(i + 9) * 0.35, d = 0.95 + r(i + 5) * 0.35;
        b.add(rbox(w, h, d, 0.05), "fabric", { m: mul(m, M(x + w / 2, 0.56 + h / 2, (r(i + 3) - 0.5) * 0.3, 0, (r(i + 7) - 0.5) * 0.15, 0)), tile: 1, color: cols[i % cols.length], lod: 1 });
        if (r(i + 11) < 0.6) b.add(rbox(w * 0.9, 0.3, d * 0.8, 0.05), "fabric", { m: mul(m, M(x + w / 2, 0.56 + h + 0.15, 0, 0, 0.3, 0)), tile: 1, color: cols[(i + 3) % cols.length], lod: 1 });
        x += w + 0.04;
      }
      b.add(box(0.9, 0.05, 0.05), "pmetal", { m: mul(m, M(1.9, 0.4, 0, 0, 0, 0.2)), color: 0x2f2b27, lod: 1 });
      break;
    }
    case "drums": {
      // nine 200 l drums on a pallet (red / blue / green), one dented, one knocked on its side on top
      b.add(box(1.9, 0.12, 1.9), "deck", { m: mul(m, M(0, 0.06, 0)), tile: 1.2, color: 0xb89a70, lod: 1 });
      const cols = [0xc0392b, 0x2f6fa6, 0x3d7a3a, 0xc0392b, 0xd9a62a];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const x = -0.63 + i * 0.63, z = -0.63 + j * 0.63, c = cols[(i * 3 + j + seed) % cols.length], hgt = 0.95;
        b.add(cyl(0.3, 0.3, hgt, 14), "pmetal", { m: mul(m, M(x, 0.12 + hgt / 2, z)), uv: "local", tile: 1.8, color: c, lod: 1 });
        for (const y of [0.34, 0.66]) b.add(cyl(0.308, 0.308, 0.035, 14, true), "pmetal", { m: mul(m, M(x, 0.12 + y, z)), uv: "local", color: new THREE.Color(c).multiplyScalar(0.8), lod: 2 });
        b.add(cyl(0.28, 0.28, 0.02, 14), "steel", { m: mul(m, M(x, 0.12 + hgt + 0.005, z)), uv: "local", color: 0x77797a, lod: 2 });
      }
      break;
    }
    case "bowser": {
      // fuel bowser: cab forward (+x), rounded tank on the chassis, hose reel, hazard plates, 6 wheels
      b.add(rbox(4.9, 0.36, 2.0, 0.03), "pmetal", { m: mul(m, M(-1.05, 0.38, 0)), color: 0x2b2b2b, lod: 1 });
      b.add(rbox(4.9, 2.1, 2.3, 0.45), "gloss", { m: mul(m, M(-1.05, 0.3 + 1.05, 0)), tile: 2, color: 0xf2efe6, lod: 1 });
      for (const x of [-3.0, -1.05, 0.9]) b.add(box(0.12, 2.14, 2.34), "gloss", { m: mul(m, M(x, 1.35, 0)), color: 0xd6b21e, lod: 1 });
      textDecal(b, "AVGAS 100LL", 2.6, 0.5, mul(m, M(-1.9, 1.5, 1.155)), { fg: "#c0392b", bg: null, font: 900 });
      textDecal(b, "AVGAS 100LL", 2.6, 0.5, mul(m, M(-1.9, 1.5, -1.155, 0, Math.PI, 0)), { fg: "#c0392b", bg: null, font: 900 });
      b.add(rbox(1.9, 2.4, 2.4, 0.14), "gloss", { m: mul(m, M(2.35, 1.3, 0)), color: YEL, lod: 1 });
      b.add(box(0.05, 0.9, 2.0), "darkGlass", { m: mul(m, M(3.31, 1.9, 0)), lod: 1 });
      for (const s of [-1, 1]) b.add(box(1.1, 0.8, 0.04), "darkGlass", { m: mul(m, M(2.5, 1.9, s * 1.21)), lod: 1 });
      b.add(box(0.1, 0.3, 2.2), "chrome", { m: mul(m, M(3.32, 0.6, 0)), color: 0xbfc2c6, lod: 2 });
      for (const x of [2.5, -1.8, -3.0]) for (const s of [-1, 1]) wheel(b, mul(m, M(x, 0.45, s * 1.0)), 0.45, 0.32, { rim: 0x8a8a8a });
      // cab detail: rear window, grille + headlamps, mirrors, amber beacon, exhaust stack, cab steps, hazard band
      b.add(box(0.04, 0.7, 1.7), "darkGlass", { m: mul(m, M(1.39, 1.95, 0)), lod: 1 });
      b.add(rbox(0.06, 0.6, 1.6, 0.02), "pmetal", { m: mul(m, M(3.32, 1.1, 0)), color: 0x2a2a2a, lod: 1 });
      for (const s of [-1, 1]) {
        b.add(rbox(0.08, 0.22, 0.34, 0.03), "lamp", { m: mul(m, M(3.33, 0.95, s * 0.8)), lod: 2 });
        b.add(rbox(0.06, 0.4, 0.2, 0.02), "chrome", { m: mul(m, M(3.1, 2.1, s * 1.36)), color: 0xbfc2c6, lod: 2 });
        b.add(rbox(0.5, 0.06, 0.34, 0.02), "pmetal", { m: mul(m, M(2.6, 0.45, s * 1.25)), color: 0x3a3a3a, lod: 2 });
      }
      b.add(cyl(0.12, 0.14, 0.18, 12), "lamp", { m: mul(m, M(2.35, 2.6, 0)), color: 0xffa21e, lod: 2 });
      b.add(cyl(0.07, 0.07, 1.4, 8), "chrome", { m: mul(m, M(1.5, 2.3, 1.05)), uv: "local", color: 0x9a9a9a, lod: 2 });
      for (let i = 0; i < 10; i++) b.add(box(0.3, 0.14, 0.02), "plaster", { m: mul(m, M(-3.3 + i * 0.5, 0.45, 1.16, 0, 0, 0.5)), color: i % 2 ? 0x1d1d1d : YEL, lod: 2, shadow: false });
      b.add(cyl(0.35, 0.35, 0.3, 16).rotateX(Math.PI / 2), "pmetal", { m: mul(m, M(-3.3, 1.0, 1.2)), uv: "local", color: 0xc0392b, lod: 2 });
      break;
    }
    case "tug": {
      // aircraft tug: low armoured body, enclosed cab with glass, tow hitch, yellow with a black/yellow bumper
      b.add(rbox(3.2, 0.95, 1.9, 0.12), "gloss", { m: mul(m, M(0, 0.55, 0)), color: YEL, lod: 1 });
      b.add(rbox(1.3, 0.62, 1.7, 0.08), "gloss", { m: mul(m, M(-0.7, 1.19, 0)), color: YEL, lod: 1 });
      for (const s of [-1, 1]) b.add(box(1.0, 0.4, 0.03), "darkGlass", { m: mul(m, M(-0.7, 1.22, s * 0.86)), lod: 1 });
      b.add(box(0.03, 0.4, 1.4), "darkGlass", { m: mul(m, M(-0.04, 1.22, 0)), lod: 1 });
      b.add(rbox(0.9, 0.5, 1.8, 0.05), "pmetal", { m: mul(m, M(1.1, 1.25, 0)), color: 0x4a4e52, lod: 1 });
      for (let i = 0; i < 6; i++) b.add(box(0.05, 0.3, 0.3), "plaster", { m: mul(m, M(1.62, 0.45, -0.75 + i * 0.3, 0.6, 0, 0)), color: i % 2 ? 0x1d1d1d : YEL, lod: 2 });
      for (const x of [-1.0, 1.0]) for (const s of [-1, 1]) wheel(b, mul(m, M(x, 0.36, s * 0.9)), 0.36, 0.3, { rim: 0x2b2b2b });
      // lamps, amber beacon, grab rails, the tow pintle, a TUG number plate
      for (const s of [-1, 1]) { b.add(rbox(0.06, 0.16, 0.26, 0.03), "lamp", { m: mul(m, M(1.61, 0.85, s * 0.6)), lod: 2 }); b.add(cyl(0.025, 0.025, 0.6, 6), "chrome", { m: mul(m, M(-0.1, 1.2, s * 0.97, 0, 0, Math.PI / 2)), color: 0xbfc2c6, lod: 2 }); }
      b.add(cyl(0.1, 0.12, 0.16, 12), "lamp", { m: mul(m, M(-0.7, 1.58, 0)), color: 0xffa21e, lod: 2 });
      b.add(rbox(0.3, 0.2, 0.3, 0.04), "steel", { m: mul(m, M(-1.7, 0.5, 0)), color: 0x333333, lod: 2 });
      textDecal(b, "TUG 03", 0.9, 0.26, mul(m, M(0.2, 0.75, 0.955)), { fg: "#1d1a14", bg: null, font: 900 });
      break;
    }
    case "container": {
      b.add(containerGeometry(20), "gCorrPaint", { m, uv: "keep", tile: 2, color: [0x2f6fa6, 0xb8452e, 0x3d7a3a][seed % 3], lod: 1 });
      textDecal(b, "BANANA CO.", 3.2, 0.62, mul(m, M(0, 1.6, 1.23)), { fg: "#f7e7b0", bg: null, font: 900 });
      break;
    }
    case "wreck": {
      // a small crashed trainer: faded fuselage on its belly, snapped wing, bent prop, tail off
      b.add(rbox(5.8, 1.7, 1.5, 0.4), "pmetal", { m: mul(m, M(0, 0.9, 0, 0, 0, 0.04)), tile: 2, color: 0xd8cfae, lod: 1 });
      b.add(rbox(1.2, 0.5, 1.1, 0.25), "darkGlass", { m: mul(m, M(0.9, 1.75, 0)), lod: 1 });
      b.add(rbox(1.6, 0.7, 4.5 * 2 * 0.93, 0.08), "pmetal", { m: mul(m, M(0.7, 0.35, 0, 0.03, 0, 0)), tile: 2, color: 0x8f9a5a, lod: 1 });
      for (let i = 0; i < 3; i++) b.add(rbox(0.12, 0.9, 0.22, 0.04), "pmetal", { m: mul(m, M(2.95, 0.95, 0, (i / 3) * Math.PI * 2 + 0.4, 0, 0.3)), color: 0x3a3a3a, lod: 2 });
      b.add(cyl(0.3, 0.42, 0.3, 14).rotateZ(Math.PI / 2), "pmetal", { m: mul(m, M(2.82, 0.95, 0)), uv: "local", color: 0x5d5f63, lod: 1 });
      break;
    }
    case "van": boxVan(b, n, m, seed); break;
    case "boulders":
      // three faceted boulders, one stacked on the big one (exactly the COVER_KIT boxes)
      for (const [cx, cy, cz, hx, hy, hz] of S.COVER_KIT.boulders) rockBlock(b, mul(m, M(cx, cy - hy, cz, 0, 0, 0)), 2 * hx, 2 * hy, 2 * hz, seed * 7 + Math.round(cx * 10), { lod: 1 });
      break;
    case "tanks": {
      // fuel storage tank on skids (rounded box = the collider), ladder + walkway, hazard stencil
      b.add(rbox(5.2, 1.85, 2.2, 0.55), "gloss", { m: mul(m, M(0, 0.2 + 0.93, 0)), tile: 2, color: 0xe9e4d6, lod: 1 });
      for (const x of [-1.8, 0, 1.8]) b.add(box(0.2, 0.22, 2.2), "pmetal", { m: mul(m, M(x, 0.11, 0)), color: 0x3a3a3a, lod: 1 });
      b.add(box(5.24, 0.3, 2.24), "gloss", { m: mul(m, M(0, 1.2, 0)), color: 0xc0392b, lod: 1 });
      textDecal(b, "JET A-1 · NO SMOKING", 3.4, 0.36, mul(m, M(0, 1.62, 1.105)), { fg: "#1d1a14", bg: null, font: 900 });
      for (let k = 0; k < 7; k++) b.add(box(0.4, 0.03, 0.03), "steel", { m: mul(m, M(-2.62, 0.3 + k * 0.28, 0.6)), color: 0x77797a, lod: 2 });
      break;
    }
  }
  void n;
}

export function buildCover(b: Batch, n: Batch, terrain: { height(x: number, z: number): number }) {
  S.COVER.forEach(([k, x, z, yaw], i) => {
    const f = sub(S.STRIP, F(x, 0, z, yaw));
    b.setFrame(0, 0, 0, 0);
    coverProp(b, n, k, M(f.x, f.y, f.z, 0, f.yaw, 0), i * 7 + 3);
    // contact shadow under each prop
    const ext = S.COVER_KIT[k].reduce((a, c) => [Math.max(a[0], Math.abs(c[0]) + c[3]), Math.max(a[1], Math.abs(c[2]) + c[5])], [0, 0]);
    blobShadow(b, terrain as never, f.x, f.z, ext[0] * 2 + 0.6, ext[1] * 2 + 0.6, f.yaw, S.PAD.y + 0.03, 0.8);
  });
}

// ------------------------------------------------------------------------------------------------ hangar workshop
export function buildHangarCover(b: Batch, n: Batch) {
  const f = S.HGR.frame, fl = S.HGR.floor;
  b.setFrame(f.x, f.y, f.z, f.yaw); n.setFrame(f.x, f.y, f.z, f.yaw);
  S.HGR_COVER.forEach(([x0, z0, x1, z1, h, k, y0 = fl], i) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    if (k === "hg:crate") crateBlock(b, x0, y0, z0, x1, y0 + h, z1, 40 + i, { lod: 1 });
    else if (k === "hg:shelf") shelfUnit(b, x0, y0, z0, x1, y0 + h, z1, 50 + i, { color: 0x4f6a7c });
    else if (k === "hg:bench") {
      // workbench: drawer cabinets under a thick maple top, a vise, a pegboard is on the wall behind
      b.add(rbox(w, 0.08, d, 0.02), "wood", { m: M(cx, y0 + h - 0.04, cz), color: 0xb08050, lod: 1 });
      b.add(rbox(w - 0.06, h - 0.08, d - 0.08, 0.03), "pmetal", { m: M(cx, y0 + (h - 0.08) / 2, cz), color: 0x3f6e8a, lod: 1 });
      for (let q = 0; q < 3; q++) for (const s of [-1, 1]) n.add(box(w * 0.4, 0.02, 0.02), "chrome", { m: M(cx + s * w * 0.24, y0 + 0.25 + q * 0.25, cz - d / 2 + 0.03), color: 0xbfc2c6 });
      n.add(rbox(0.3, 0.2, 0.18, 0.03), "pmetal", { m: M(cx - w * 0.3, y0 + h + 0.1, cz), color: 0x2f5f86 });
      n.add(rbox(0.5, 0.06, 0.3, 0.02), "pmetal", { m: M(cx + w * 0.2, y0 + h + 0.03, cz, 0, 0.3, 0), color: 0xc0392b });
    } else if (k === "hg:chest") {
      b.add(rbox(w, h, d, 0.04), "gloss", { m: M(cx, y0 + h / 2, cz), color: 0xc0392b, lod: 1 });
      for (let q = 0; q < 5; q++) n.add(box(w * 0.8, 0.025, 0.02), "chrome", { m: M(cx, y0 + 0.15 + q * 0.18, cz - d / 2 - 0.005), color: 0xbfc2c6 });
    } else if (k === "hg:engine") radialEngine(n, n, M(cx, y0, cz), w, d, h);   // modelled engine on its stand
    else if (k === "hg:rack") palletRack(n, n, M(cx, y0, cz), w, d, h, 60 + i);
    else if (k === "hg:cab") rollCabinet(n, n, M(cx, y0, cz), w, d, h, 70 + i);
    else if (k === "hg:pallet") {
      P.pallet(n, M(cx, y0, cz, 0, 0, 0, w / 1.2, 1, d / 1.0));
      for (let q = 0; q < 3; q++) P.sack(n, M(cx - 0.35 + q * 0.35, y0 + 0.16, cz + (q % 2 ? 0.15 : -0.12), 0, q, 0), 0xcfbf98);
    }
  });
  // mezzanine: a pallet + sacks corner, the loot corner lamp
  b.setFrame(0, 0, 0, 0); n.setFrame(0, 0, 0, 0);
}

// ------------------------------------------------------------------------------------------------ rails
/** rails of the new stairs / holes (tower roof stair, the airstair) — terminal rails are drawn in buildTerminal */
export function buildNewRails(b: Batch) {
  const tf = S.TWR.frame, hf = S.HGR.frame;
  b.setFrame(tf.x, tf.y, tf.z, tf.yaw); drawRails(b, S.TWR_LOCAL, { color: 0x2f2b27 });
  b.setFrame(hf.x, hf.y, hf.z, hf.yaw); drawRails(b, S.HGR_LOCAL, { color: 0x2f2b27 });
  b.setFrame(0, 0, 0, 0);
}
void rail; void toWorld;
