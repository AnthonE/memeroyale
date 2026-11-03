// LOOKOUT POINT (poi-coast) — striped red/white lighthouse on the lip of the W sea cliff, keeper's cottage, radio
// masts, fenced yard, and the switchback stair down the columnar cliff face to the beach.
// Layout + colliders: shared/pois/lookout-point.ts (← lookout-baked.json; visuals derive from the same data).
// Distance classes (CoastLod): structure until 300 m then the far proxy; yard props ≤ 160 m; interiors + clutter ≤ 75 m;
// the cliff face is landscape (≤ 1.4 km, in the static far shadow map).
import { buildKeeperHome, keeperDetails } from "./keeper-cottage";
import { keeperRoofVerge, KEEPER_ROOF_VERGE } from "../../../../../shared/pois/lookout-keeper-cottage";
import { keeperMainClay, keeperFlashingSupport, keeperRoofTiles } from "./keeper-roof-tiles";
import * as THREE from "three";
import type { WorldModule } from "../../module";
import type { WorldCtx } from "../../../engine/engine";
import type { VegApi, PlantKind } from "../../veg/api";
import * as L from "../../../../../shared/pois/lookout-point";
import { inFrameRect, rng, toWorld } from "../../../../../shared/pois/coast-kit";
import {
  Batch, M, box, rbox, cyl, sph, lathe, addPieces, frameGeo, archShape, rectShape, shapeGeo, gableGeo, blobShadow,
  glowPoints, loadCoastTextures, CoastLod, NOCULL, buildLayered,
} from "../_kit/coast-kit";
import * as P from "../_kit/coast-props";
import * as TX from "../_kit/coast-tex";
import { lighthouseInterior } from "./lh-interior";
import { pickup } from "../_kit/coast-vehicles";
import { buildCliff, buildStair, cladTerrainRocks, cliffMaterials, groundAt, lipDrape } from "./cliff";
import { stageGolden } from "./golden";
import { buildAttic, buildHut, buildPlateauCover } from "./dress";
import { plantFlora, SOLID_KINDS } from "../peel-strip/coast-dress";
import { buildInteriors } from "../_kit/interior";

const RED = 0xc5352b, WHITE = 0xfbf9f4, CREAM = 0xf0e4cb, TIMBER = 0x4a3222, FRAME = 0x3a2a1e, DKRED = 0x7a2a22;
const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
type Glow = { p: THREE.Vector3; size: number; color?: number };

/** local lighthouse frame helper: point at angle a (XZ), radius r, height h above the base */
const lhAt = (a: number, r: number, h: number, extraYaw = 0) => M(L.LH.x + Math.cos(a) * r, L.LH.y + h, L.LH.z + Math.sin(a) * r, 0, Math.PI / 2 - a + extraYaw, 0);

// the lamp: an amber HDR core (bloom picks it up) inside a faceted fresnel lens of warm glass
let lampCore: THREE.MeshStandardMaterial, lens: THREE.MeshPhysicalMaterial, lightPool: THREE.MeshBasicMaterial;
function lampMaterials() {
  // amber core (≈ #ffc24a on screen) — at 14× the core clips to a pale white tube
  // a big glowing AMBER globe — a lower HDR level keeps the hue (7.5 clips to pale cream)
  lampCore = new THREE.MeshStandardMaterial({ color: 0x2a1504, emissive: 0xff9416, emissiveIntensity: 3.6, roughness: 0.35 });
  lampCore.name = "coast:lampCore";
  lens = new THREE.MeshPhysicalMaterial({ color: 0xffb040, emissive: 0xff8a10, emissiveIntensity: 1.4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
  lens.name = "coast:lens";
  // warm interior light pool (floor + wall wash): additive radial gradient, no real light (no recompiles, no cost)
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,190,110,0.55)"); gr.addColorStop(0.45, "rgba(255,160,80,0.22)"); gr.addColorStop(1, "rgba(255,140,60,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  lightPool = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  lightPool.name = "coast:lightPool";
}

// ------------------------------------------------------------------------------------------------ lighthouse
function lighthouse(b: Batch, bNear: Batch, glows: Glow[], bIn?: Batch) {
  const { x, y, z } = L.LH;
  const T = L.LH.top - y; // body height
  const at = (px = 0, py = 0, pz = 0) => M(x + px, y + py, z + pz);
  const dg = L.LH.doorW / 2 / L.LH.plinthR + 0.035;
  const a0 = L.LH.doorA + dg, a1 = L.LH.doorA + Math.PI * 2 - dg;
  // foundation skirt (the tower stands on the cliff caps — reach below any ground dip)
  b.add(cyl(5.35, 5.45, 1.6, 48, true), "stone", { m: at(0, -0.8, 0), tile: 1.6, color: 0xb7afa2 });
  // plinth: skirt + cornice, door gap
  const plinth: Array<[number, number]> = [[5.3, 0], [5.3, 0.28], [5.05, 0.36], [5.0, 0.5], [5.0, 2.08], [5.16, 2.16], [5.18, 2.34], [4.62, 2.42]];
  b.add(lathe(plinth, { a0, a1, segs: 60, tile: 2.5 }), "plaster", { m: at(), uv: "keep", color: WHITE, aoY: y, aoRange: 1.4, aoMin: 0.62 });
  // body bands (4 red + 3 white), door gap in the lowest 0.7 m of band 0
  const bands = 7, y0 = L.LH.plinthH, bh = (T - y0) / bands;
  const rAt = (h: number) => L.lhRadius(y + h);
  for (let i = 0; i < bands; i++) {
    const h0 = y0 + i * bh, h1 = h0 + bh, col = i % 2 === 0 ? RED : WHITE;
    const prof = (p: number, q: number): Array<[number, number]> => [[rAt(p), p], [rAt((p + q) / 2), (p + q) / 2], [rAt(q), q]];
    if (i === 0) {
      const cut = L.LH.doorH + 0.25;
      const g = L.LH.doorW / 2 / rAt(h0) + 0.03;
      b.add(lathe(prof(h0, cut), { a0: L.LH.doorA + g, a1: L.LH.doorA + Math.PI * 2 - g, segs: 60, tile: 2.5 }), "plaster", { m: at(), uv: "keep", color: col });
      b.add(lathe(prof(cut, h1), { segs: 64, tile: 2.5 }), "plaster", { m: at(), uv: "keep", color: col });
    } else b.add(lathe(prof(h0, h1), { segs: 64, tile: 2.5 }), "plaster", { m: at(), uv: "keep", color: col });
    if (i > 0) { const t = new THREE.TorusGeometry(rAt(h0) + 0.005, 0.03, 4, 64); t.rotateX(Math.PI / 2); b.add(t, "plaster", { m: at(0, h0, 0), uv: "local", color: col === RED ? WHITE : RED }); }
  }
  // interior wall face + floor + newel + treads (dressed stone, not cobble)
  const inner: Array<[number, number]> = [];
  for (let k = 0; k <= 6; k++) { const h = (k / 6) * T; inner.push([rAt(h) - L.LH.wall, h]); }
  const ig = L.LH.doorW / 2 / (rAt(0) - L.LH.wall) + 0.03;
  b.add(lathe(inner.slice(0, 2).map(([r, h], k) => [r, k === 0 ? 0 : L.LH.doorH + 0.25] as [number, number]), { a0: L.LH.doorA + ig, a1: L.LH.doorA + Math.PI * 2 - ig, segs: 40, inner: true, tile: 2.5 }), "plaster", { m: at(), uv: "keep", color: 0xe9e2d4, aoY: y, aoRange: 2, aoMin: 0.5 });
  b.add(lathe(inner.map(([r, h]) => [r, Math.max(h, L.LH.doorH + 0.25)] as [number, number]).filter((p, k, arr) => k === 0 || p[1] > arr[k - 1][1]), { segs: 40, inner: true, tile: 2.5 }), "plaster", { m: at(), uv: "keep", color: 0xe9e2d4 });
  b.add(cyl(rAt(0) - L.LH.wall, rAt(0) - L.LH.wall, 0.12, 32), "pavers", { m: at(0, 0.06, 0), tile: 1.6, color: 0xc9b9a0 });
  // (no newel — lh-interior.ts draws the iron column, the floors, the balustrade, the rooms)
  addPieces(b, L.PIECES.filter((p) => p.k === "tread:stone"), { tread: { mat: "plaster", color: 0xd9d1c3, tile: 1.4, round: 0.04 } }); // smooth dressed stone (not pitted cork)
  // helical handrail on the wall side
  const hp: THREE.Vector3[] = [];
  for (let i = 0; i <= L.LH.steps; i += 2) { const a = L.LH.stairA0 + L.LH.stepDa * i, r = L.treadR1(Math.min(i, L.LH.steps - 1)) - 0.12; hp.push(new THREE.Vector3(Math.cos(a) * r, L.LH_RISE * i + 1.0, Math.sin(a) * r)); }
  bNear.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), hp.length * 3, 0.035, 5), "wood", { m: at(), uv: "keep", color: 0x7a5236 });
  // door: jambs through the wall, portal (pilasters + entablature + pediment), red panelled leaves swung open, plaque
  const da = L.LH.doorA, rIn = rAt(0) - L.LH.wall, rOut = L.LH.plinthR;
  const depth = rOut - rIn + 0.2, rm = (rIn + rOut) / 2;
  for (const s of [-1, 1]) {
    const lat = s * (L.LH.doorW / 2 + 0.12);
    b.add(box(0.24, L.LH.doorH, depth), "plaster", { m: mul(lhAt(da, rm, L.LH.doorH / 2), M(lat, 0, 0)), color: 0xe8e2d6 });
    b.add(rbox(0.42, 3.2, 0.34, 0.04), "plaster", { m: mul(lhAt(da, rOut + 0.1, 1.6), M(s * (L.LH.doorW / 2 + 0.3), 0, 0)), color: WHITE, aoY: y, aoRange: 1.2, aoMin: 0.7 });
    // open door leaf (red, panelled) swung outward against the portal
    const leaf = mul(lhAt(da, rOut + 0.22, 0), M(s * (L.LH.doorW / 2), 0, 0, 0, s * 1.9, 0));
    b.add(rbox(0.95, 2.72, 0.08, 0.02), "gloss", { m: mul(leaf, M(-s * 0.475, 1.38, 0)), color: 0xa8231c });
    for (const py of [0.75, 1.95]) b.add(rbox(0.66, 0.9, 0.05, 0.02), "gloss", { m: mul(leaf, M(-s * 0.475, py, 0.05)), color: 0x951d17 });
    b.add(sph(0.045, 8, 6), "chrome", { m: mul(leaf, M(-s * 0.85, 1.25, 0.08)), color: 0xd8b25a });
  }
  b.add(box(L.LH.doorW + 0.5, 0.3, depth), "plaster", { m: mul(lhAt(da, rm, L.LH.doorH + 0.15), M()), color: 0xe8e2d6 });
  b.add(rbox(L.LH.doorW + 1.2, 0.34, 0.5, 0.05), "plaster", { m: lhAt(da, rOut + 0.12, 3.25), color: WHITE });
  b.add(gableGeo(L.LH.doorW + 1.3, 0.85, 0.42), "plaster", { m: lhAt(da, rOut + 0.1, 3.42), uv: "local", tile: 2, color: WHITE });
  b.add(rbox(0.5, 0.34, 0.04, 0.02), "pmetal", { m: mul(lhAt(da, rOut + 0.02, 1.9), M(L.LH.doorW / 2 + 0.9, 0, 0)), color: 0x3a3a3a });
  addPieces(b, L.PIECES.filter((p) => p.k === "step:stone"), { step: { mat: "stone", color: 0xbdb6aa, tile: 1.5, round: 0.05 } });
  // body windows (arched, dark frame, warm glass, white sill)
  for (const w of L.LH_WINDOWS) {
    const r = L.lhRadius(w.y) + 0.02, h = w.y - y;
    b.add(frameGeo(0.82, 1.45, 0.13, 0.22, true), "wood", { m: lhAt(w.a, r, h), uv: "local", tile: 1, color: FRAME });
    b.add(shapeGeo(archShape(0.82, 1.45)), "lit", { m: lhAt(w.a, r - 0.04, h), uv: "keep" });
    b.add(box(0.05, 1.3, 0.04), "wood", { m: lhAt(w.a, r + 0.01, h + 0.72), color: FRAME });
    b.add(rbox(1.2, 0.12, 0.3, 0.03), "plaster", { m: lhAt(w.a, r + 0.06, h - 0.2), color: WHITE });
    glows.push({ p: new THREE.Vector3(x + Math.cos(w.a) * (r + 0.25), w.y + 0.7, z + Math.sin(w.a) * (r + 0.25)), size: 1.4 });
  }
  // corbels under the gallery: chunky cream scroll brackets, with a red cap block
  const cs = new THREE.Shape();
  cs.moveTo(0, 0); cs.lineTo(1.3, 0); cs.lineTo(1.3, -0.26);
  cs.bezierCurveTo(1.0, -0.3, 0.8, -0.42, 0.72, -0.62); cs.bezierCurveTo(0.62, -0.9, 0.88, -1.05, 0.62, -1.2);
  cs.bezierCurveTo(0.38, -1.34, 0.18, -1.2, 0.2, -1.42); cs.lineTo(0, -1.5); cs.lineTo(0, 0);
  const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.44, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 });
  cg.translate(0, 0, -0.22); cg.rotateY(-Math.PI / 2);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + 0.1;
    b.add(cg, "plaster", { m: lhAt(a, rAt(T) - 0.12, T - L.LH.deckT - 0.02), uv: "local", tile: 1, color: CREAM });
  }
  // gallery deck (rounded lip) + top surface + red band under the lip
  const deck: Array<[number, number]> = [[rAt(T) - 0.05, -L.LH.deckT - 0.02], [L.LH.deckR - 0.1, -L.LH.deckT], [L.LH.deckR, -L.LH.deckT + 0.08], [L.LH.deckR, -0.08], [L.LH.deckR - 0.1, 0], [L.LH.roomR - 0.2, 0]];
  b.add(lathe(deck, { segs: 64, tile: 2.5 }), "plaster", { m: at(0, T, 0), uv: "keep", color: 0xefece6 });
  addPieces(b, L.PIECES.filter((p) => p.k === "lh:floor"), { lh: { mat: "plaster", color: 0xcfc8ba, tile: 3 } });
  // railing: posts + 3 rings
  const rr = L.LH.deckR - 0.14, np = 36;
  for (let k = 0; k < np; k++) { const a = (k / np) * Math.PI * 2; b.add(rbox(0.08, 1.15, 0.08, 0.02), "gloss", { m: lhAt(a, rr, T + 0.575), color: RED }); }
  for (const [hh, t] of [[1.15, 0.06], [0.62, 0.035], [0.14, 0.035]] as Array<[number, number]>) { const tg = new THREE.TorusGeometry(rr, t, 6, 96); tg.rotateX(Math.PI / 2); b.add(tg, "gloss", { m: at(0, T + hh, 0), uv: "local", color: RED }); }
  // lantern room: low wall with door gap, glazing, mullions, rails, top ring, door frame
  const R = L.LH.roomR, gd = 1.0 / R + 0.05, ga = L.LH.galleryDoorA;
  const low: Array<[number, number]> = [[R, 0], [R, L.LH.roomWall - 0.08], [R + 0.08, L.LH.roomWall]];
  b.add(lathe(low, { a0: ga + gd, a1: ga + Math.PI * 2 - gd, segs: 48, tile: 2 }), "gloss", { m: at(0, T, 0), uv: "keep", color: RED });
  b.add(lathe([[R - 0.28, 0], [R - 0.28, L.LH.roomWall]], { a0: ga + gd, a1: ga + Math.PI * 2 - gd, segs: 48, tile: 2, inner: true }), "plaster", { m: at(0, T, 0), uv: "keep", color: 0xe9e2d4 });
  const gy = T + L.LH.roomWall;
  b.add(lathe([[R - 0.06, 0], [R - 0.06, L.LH.glassH]], { a0: ga + gd, a1: ga + Math.PI * 2 - gd, segs: 48, tile: 4 }), "glass", { m: at(0, gy, 0), uv: "keep" });
  const nm = 12;
  for (let k = 0; k < nm; k++) { const a = ga + gd + (k / nm) * (Math.PI * 2 - 2 * gd); b.add(rbox(0.1, L.LH.glassH, 0.13, 0.02), "gloss", { m: lhAt(a, R - 0.02, gy + L.LH.glassH / 2), color: DKRED }); }
  for (const s of [-1, 1]) b.add(rbox(0.14, L.LH.glassH + L.LH.roomWall, 0.16, 0.03), "gloss", { m: lhAt(ga + s * gd, R - 0.02, T + (L.LH.glassH + L.LH.roomWall) / 2), color: DKRED });
  for (const hh of [0, L.LH.glassH * 0.52, L.LH.glassH]) { const tg = new THREE.TorusGeometry(R - 0.02, 0.05, 5, 72, Math.PI * 2 - 2 * gd); tg.rotateX(Math.PI / 2); b.add(tg, "gloss", { m: M(x, y + gy + hh, z, 0, -(ga + gd), 0), uv: "local", color: DKRED }); }
  b.add(box(2.1, 0.18, 0.2), "gloss", { m: lhAt(ga, R, T + 2.6), color: DKRED });
  const ring: Array<[number, number]> = [[R - 0.05, 0], [R + 0.25, 0.05], [R + 0.3, 0.2], [R + 0.25, L.LH.ringH], [R - 0.05, L.LH.ringH]];
  b.add(lathe(ring, { segs: 64, tile: 2 }), "gloss", { m: at(0, gy + L.LH.glassH, 0), uv: "keep", color: RED });
  b.add(cyl(R - 0.05, R - 0.05, 0.06, 32), "pmetal", { m: at(0, gy + L.LH.glassH + 0.02, 0), color: 0x3a2b24 });
  // dome + thick ribs + vent ball + finial
  const dy = gy + L.LH.glassH + L.LH.ringH;
  const dome: Array<[number, number]> = [[R + 0.28, 0], [R + 0.28, 0.1], [R + 0.05, 0.22], [2.85, 0.65], [2.45, 1.25], [1.8, 1.85], [1.05, 2.3], [0.45, 2.55], [0.22, L.LH.domeH]];
  b.add(lathe(dome, { segs: 64, tile: 2 }), "gloss", { m: at(0, dy, 0), uv: "keep", color: RED });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, pts = dome.slice(1).map(([r, h]) => new THREE.Vector3(Math.cos(a) * (r + 0.05), h + 0.05, Math.sin(a) * (r + 0.05)));
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.085, 6), "gloss", { m: at(0, dy, 0), uv: "keep", color: 0xb02e25 });
  }
  // ventilator: a red drum cap with a little conical hood, a brass ball and a slim pointed finial
  const vy = dy + L.LH.domeH;
  b.add(cyl(0.36, 0.42, 0.42, 20), "gloss", { m: at(0, vy + 0.1, 0), color: RED });
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.add(box(0.05, 0.26, 0.2), "pmetal", { m: mul(at(0, vy + 0.12, 0), M(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 0, -a, 0)), color: 0x5a1a14 }); }
  b.add(lathe([[0.55, 0], [0.5, 0.06], [0.08, 0.42], [0.05, 0.48]], { segs: 20, tile: 1 }), "gloss", { m: at(0, vy + 0.31, 0), uv: "keep", color: RED });
  b.add(sph(0.26, 18, 12), "chrome", { m: at(0, vy + 0.98, 0), color: 0xd9b25c });
  b.add(lathe([[0.09, 0], [0.07, 0.3], [0.035, 0.9], [0.005, 1.35]], { segs: 10, tile: 1 }), "chrome", { m: at(0, vy + 1.2, 0), uv: "keep", color: 0xd9b25c });
  b.add(new THREE.TorusGeometry(0.1, 0.03, 6, 12).rotateX(Math.PI / 2), "chrome", { m: at(0, vy + 1.26, 0), uv: "local", color: 0xc9a656 });
  // the lamp: brass pedestal + a big AMBER bulb (not a white-hot tube) inside a barrel-shaped fresnel lens
  // of warm glass with brass prism rings, four bull's-eye rings facing out, brass top + bottom frames
  b.add(cyl(0.34, 0.5, 2.0, 16), "pmetal", { m: at(0, T + 1.0, 0), uv: "local", color: 0x4a3524 });
  const ly = T + 2.75;
  b.add(sph(0.66, 24, 16), lampCore, { m: at(0, ly, 0), shadow: false });
  glows.push({ p: new THREE.Vector3(x, y + ly, z), size: 7, color: 0xffb040 }); // the lamp's warm halo through the glazing
  b.add(cyl(0.16, 0.22, 0.5, 12), "pmetal", { m: at(0, ly - 0.85, 0), color: 0x3a2a1a });
  const lensProf: Array<[number, number]> = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12 - 0.5; lensProf.push([1.12 * Math.cos(t * 1.55), t * 2.2]); }
  b.add(lathe(lensProf, { segs: 24, tile: 1 }), lens, { m: at(0, ly, 0), uv: "keep", shadow: false });
  for (let k = -5; k <= 5; k++) { if (k === 0) continue; const tt = k / 12, rr = 1.14 * Math.cos(tt * 1.55); const tg = new THREE.TorusGeometry(rr, 0.022, 4, 40); tg.rotateX(Math.PI / 2); b.add(tg, "chrome", { m: at(0, ly + tt * 2.2, 0), uv: "local", color: 0xe0b860 }); }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.add(box(0.045, 2.2, 0.045), "chrome", { m: at(Math.cos(a) * 1.13, ly, Math.sin(a) * 1.13), color: 0xb8964c }); }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; for (const rr of [0.18, 0.34]) { const tg = new THREE.TorusGeometry(rr, 0.025, 4, 20); b.add(tg, "chrome", { m: mul(at(Math.cos(a) * 1.16, ly, Math.sin(a) * 1.16), M(0, 0, 0, 0, Math.PI / 2 - a, 0)), uv: "local", color: 0xe8c878 }); } }
  b.add(cyl(1.18, 1.18, 0.12, 32), "chrome", { m: at(0, ly - 1.12, 0), color: 0xb8964c });
  b.add(cyl(1.0, 1.18, 0.12, 32), "chrome", { m: at(0, ly + 1.12, 0), color: 0xb8964c });
  b.add(sph(0.12, 10, 8), "chrome", { m: at(0, ly + 1.25, 0), color: 0xd9b25c });
  // gallery deck: radial steel-plate treads with gaps over the painted slab (plank detail)
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2, rm = (L.LH.roomR + 0.15 + L.LH.deckR - 0.25) / 2, len = L.LH.deckR - 0.25 - L.LH.roomR - 0.15;
    b.add(box(len, 0.035, 2 * Math.PI * rm / 48 - 0.06), "pmetal", { m: mul(at(Math.cos(a) * rm, T + 0.02, Math.sin(a) * rm), M(0, 0, 0, 0, -a, 0)), color: k % 2 ? 0x8a8a86 : 0x7c7c78, shadow: false, lod: 2 });
  }
  // the rooms (floors, props, balustrade, lamps)
  lighthouseInterior(bIn ?? b, bIn ?? bNear, glows);
  const base = L.LH.doorA;
  // wall lamps up the stairwell (every ~6 m, on the wall side under the spiral), each with a warm wash on the wall
  for (const [k, h] of [[0, 6.5], [1, 12.5], [2, 18]] as Array<[number, number]>) {
    const a = base + 2.2 + k * 2.1, rw = rAt(h) - L.LH.wall - 0.02;
    const lm = M(x + Math.cos(a) * rw, y + h, z + Math.sin(a) * rw, 0, -Math.PI / 2 - a, 0);
    const lp = P.wallLamp(bNear, lm);
    const wash = new THREE.CircleGeometry(1.5, 20);
    bNear.add(wash, lightPool, { m: mul(lm, M(0, 0.1, 0.03)), uv: "keep", shadow: false });
    glows.push({ p: lp, size: 1.1 });
  }
  return y + ly;
}

// ------------------------------------------------------------------------------------------------ cottage

function cottage(b: Batch, bNear: Batch, glows: Glow[]) {
  const f = L.COT.frame;
  b.setFrame(f.x, f.y, f.z, f.yaw); bNear.setFrame(f.x, f.y, f.z, f.yaw);
  const { L: CL, D, t } = L.COT, hl = CL / 2, hd = D / 2, fl = L.COT.floor, eave = L.COT_EAVE, rise = L.COT_RISE;
  const W = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyMatrix4(M(f.x, f.y, f.z, 0, f.yaw, 0));
  addPieces(b, L.COT_LOCAL, {
    "cot:bay-step": { mat: "wood", color: 0x8a6444, tile: 1.2 },
    "cot:flash": { mat: "steel", color: 0x7b807b, tile: 1 },
    "cot:dormer-header": { mat: "wood", color: 0x6b4a32, tile: 2 },
    "cot:dormer-roof": { mat: "wood", color: 0x6b4a32, tile: 2 },
    "cot:dormer-shell": { mat: "plaster", skip: true },
    "cot:dormer-glass": { mat: "glass", skip: true },
    "cot:partition": { mat: "plaster", color: 0xe1dacb, tile: 2.5, ao: true },
    "cot:bench": { mat: "wood", color: 0x7a5236, tile: 1.2 },
    "cot:porch-post": { mat: "wood", skip: true },
    "cot:awning": { mat: "corr", skip: true },
    "cot:wall": { mat: "plaster", color: CREAM, tile: 2.5, ao: true },
    "cot:floor": { mat: "stone", color: 0xa9a197, tile: 2 },
    "cot:roof": { mat: "wood", color: 0x6b4a32, skip: true },
    "cot:chimney": { mat: "brick", tile: 1.4, color: 0xffffff, skip: true },
    "porch:deck": { mat: "deck", color: 0xcfb28a, tile: 1.8 },
    "porch:rail": { mat: "wood", skip: true },
    step: { mat: "deck", color: 0xbfa27a, tile: 1.5, round: 0.02 },
    "cot:attic": { mat: "deck", color: 0xb08a60, tile: 1.8 }, "cot:knee": { mat: "deck", color: 0xa88258, tile: 1.6 },
    "cot:seat": { mat: "wood", color: 0x8a6444, tile: 1.2, round: 0.03 }, "cot:step": { mat: "plaster", color: CREAM, tile: 1.2 },
  }, 0);
  // Profile-cut closure supports the metal on the actual clay, including laps.
  // Keep the shared dormer opening empty and preserve the solid apron above.
  for (const p of L.COT_LOCAL.filter(p => p.k === "cot:flash")) {
    b.add(keeperFlashingSupport(p, L.COT_LOCAL.filter(q => q.k === "cot:roof")), "plain", {
      m: M(...p.c, p.pitch ?? 0, 0, 0), color: 0x292b28, uv: "box", tile: 1,
    });
  }
  // The same solid dormer sheets have timber undersides and pantiles only on top.
  // An all-face tile material made the valley's exposed underside a red floating sliver.
  for (const p of L.COT_LOCAL.filter(p => p.k === "cot:dormer-roof")) {
    const pm = M(...p.c, p.pitch ?? 0, p.yaw ?? 0, 0);
    b.add(keeperRoofTiles(p, L.COT_DORMER.x), "gTiles", {
      m: pm,
      uv: "keep", color: 0xffffff,
    });
  }
  b.add(box(CL - 2 * t, 0.04, D - 2 * t), "deck", { m: M(0, fl + 0.02, 0), tile: 2, color: 0xc49a6a });
  // stone plinth band + quoins
  b.add(rbox(CL + 0.16, 0.95, D + 0.16, 0.04), "stone", { m: M(0, -0.12, 0), tile: 1.6, color: 0xb2aa9c });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const yy = fl + 0.25 + k * 0.42, long = k % 2 === 0;
      b.add(rbox(long ? 0.62 : 0.36, 0.36, 0.12, 0.03), "stone", { m: M(sx * (hl - (long ? 0.31 : 0.18) + 0.06), yy, sz * (hd + 0.04)), tile: 1, color: 0xc2bab0 });
      b.add(rbox(0.12, 0.36, long ? 0.36 : 0.62, 0.03), "stone", { m: M(sx * (hl + 0.04), yy, sz * (hd - (long ? 0.18 : 0.31) + 0.06)), tile: 1, color: 0xc2bab0 });
    }
  }
  for (const sz of [-1, 1]) b.add(rbox(CL + 0.1, 0.22, 0.12, 0.03), "wood", { m: M(0, eave - 0.11, sz * (hd + 0.02)), tile: 2, color: TIMBER });
  // gables: plaster triangles + half-timber frame + attic windows
  for (const sx of [-1, 1]) {
    const gm = M(sx * (hl - t / 2), eave, 0, 0, sx * Math.PI / 2, 0);
    b.add(gableGeo(D, rise, t), "plaster", { m: gm, uv: "local", tile: 2.5, color: CREAM });
    b.add(rbox(D + 0.1, 0.2, 0.1, 0.02), "wood", { m: mul(gm, M(0, 0.05, t / 2 + 0.04)), color: TIMBER });
    b.add(rbox(0.18, rise - 0.3, 0.1, 0.02), "wood", { m: mul(gm, M(0, (rise - 0.3) / 2, t / 2 + 0.04)), color: TIMBER });
    // diagonal braces from the wall plate to the king post, kept inside the gable triangle
    for (const s of [-1, 1]) {
      const ax = s * (D / 2 - 0.9), ay = 0.2, bx2 = s * 0.14, by = rise * 0.58, len = Math.hypot(bx2 - ax, by - ay), ang = Math.atan2(by - ay, bx2 - ax);
      b.add(rbox(len, 0.16, 0.1, 0.02), "wood", { m: mul(gm, M((ax + bx2) / 2, (ay + by) / 2, t / 2 + 0.04, 0, 0, ang)), color: TIMBER });
    }
    b.add(frameGeo(0.7, 0.9, 0.1, 0.16, false), "wood", { m: mul(gm, M(sx * 1.4, 1.0, t / 2)), uv: "local", tile: 1, color: FRAME });
    b.add(shapeGeo(rectShape(0.7, 0.9)), "lit", { m: mul(gm, M(sx * 1.4, 1.0, t / 2 - 0.02)), uv: "keep" });
  }
  // roof: rafters + pantile courses (0.6 m eave overhang), 0.25 m bargeboards, a rounded ridge cap of half-round tiles
  const over = 0.6, run = hd + over, len = run / Math.cos(L.COT.pitch) + 0.3;
  const cy = eave + (hd - run / 2) * Math.tan(L.COT.pitch);
  for (const s of [-1, 1]) {
    const rm = M(0, cy, s * run / 2, s * L.COT.pitch, 0, 0);
    // Both wood and tile sheets use the same shared roof patches; nothing spans the dormer opening.
    for (const p of L.COT_LOCAL.filter(p => p.k === "cot:roof" && Math.sign(p.pitch ?? 0) === s)) {
      const pm = M(...p.c, p.pitch ?? 0, 0, 0);
      b.add(box(p.h[0]*2, p.h[1]*2, p.h[2]*2), "wood", { m: pm, uv: "local", tile: 2, color: 0x6b4a32 });
      const clay = keeperMainClay(p);
      b.add(clay.geometry, "gTiles", { m: clay.matrix, uv: "keep", color: 0xffffff });
    }
    // eave: rafter tails under the overhang + the tile ends' dark shadow line
    for (let xx = -hl; xx <= hl + 0.01; xx += 0.8) b.add(box(0.1, 0.16, 0.55), "wood", { m: mul(rm, M(xx, -0.05, s * (len / 2 - 0.35))), color: 0x5a3a26 });
    // bargeboards (0.25 m) at both gables
    for (const sx of [-1, 1]) b.add(rbox(KEEPER_ROOF_VERGE.boardWidth, 0.25, len + 0.2, 0.015), "wood", { m: mul(rm, M(sx * keeperRoofVerge(hl).boardCenter, 0.12, 0)), tile: 2, color: 0x5a2a20 });
  }
  for (let k = 0; k < Math.ceil((CL + 1.2) / 0.42); k++) {
    const rc = new THREE.CylinderGeometry(0.2, 0.22, 0.46, 10, 1, true, 0, Math.PI); rc.rotateZ(Math.PI / 2); rc.rotateX(-Math.PI / 2);
    b.add(rc, "gTiles", { m: M(-hl - 0.6 + 0.21 + k * 0.42, eave + rise + 0.34, 0), uv: "local", tile: 1, color: 0xc2705a });
  }
  // chimneys: brick stack + stone cap + pots
  for (const [cx, cz] of L.COT_CHIMNEYS) {
    const top = eave + rise + 2.2;
    const base = eave; // the attic is a room — the stack stands on the attic floor (= its collider)
    b.add(box(0.7, top - base, 0.7, 3), "brick", { m: M(cx, (top + base) / 2, cz), tile: 1.4, color: 0xc8b29e });
    b.add(rbox(1.0, 0.2, 1.0, 0.04), "stone", { m: M(cx, top + 0.1, cz), tile: 1, color: 0xb0a89c });
    for (const px of [0]) { b.add(cyl(0.14, 0.17, 0.5, 12), "plain", { m: M(cx + px, top + 0.45, cz), color: 0xa4553a }); b.add(cyl(0.17, 0.17, 0.06, 12), "plain", { m: M(cx + px, top + 0.72, cz), color: 0x8a4430 }); }
  }
  // dormer on the front slope
  {
    const dx = L.COT_DORMER.x, dw = L.COT_DORMER.w, zf = hd - 1.0, yb = eave + (hd - zf) * Math.tan(L.COT.pitch) - 0.2, dh = 2.1;
    const back = 1.9;
    // a hollow dormer (cheeks + ceiling + a front wall round the window) — a solid block would fill the attic
    for (const s of [-1, 1]) b.add(box(0.12, dh, back), "plaster", { m: M(dx + s * (dw / 2 - 0.06), yb + dh / 2, zf - back / 2), tile: 2, color: CREAM });
    b.add(box(dw, 0.12, back), "plaster", { m: M(dx, yb + dh - 0.06, zf - back / 2), tile: 2, color: CREAM });
    b.add(box(dw, 0.45, 0.12), "plaster", { m: M(dx, yb + 0.225, zf - 0.06), tile: 2, color: CREAM });
    b.add(box(dw, dh - 1.55, 0.12), "plaster", { m: M(dx, yb + 1.55 + (dh - 1.55) / 2, zf - 0.06), tile: 2, color: CREAM });
    for (const s of [-1, 1]) b.add(box((dw - 1.0) / 2, 1.1, 0.12), "plaster", { m: M(dx + s * (0.5 + (dw - 1.0) / 4), yb + 1.0, zf - 0.06), tile: 2, color: CREAM });
    // The shared thin slope sheets form the rear cap (no triangular prism).
    b.add(gableGeo(dw, 1.05, 0.1), "plaster", { m: M(dx, yb + dh, zf + 0.02), uv: "local", tile: 2, color: CREAM });
    const da2 = Math.atan2(1.05, (dw + 0.3) / 2), sl = Math.hypot(1.05, (dw + 0.3) / 2) + 0.1;
    for (const s of [-1, 1]) b.add(rbox(sl, 0.22, 0.1, 0.02), "wood", { m: M(dx + s * (dw + 0.3) / 4, yb + dh + 0.5, zf + 0.36, 0, 0, -s * da2), color: 0x5a2a20 });
    b.add(frameGeo(1.0, 1.1, 0.12, 0.18, false), "wood", { m: M(dx, yb + 0.45, zf + 0.04), uv: "local", tile: 1, color: FRAME });
    b.add(shapeGeo(rectShape(1.0, 1.1)), "glass", { m: M(dx, yb + 0.45, zf + 0.01), uv: "keep", shadow: false });
    b.add(box(0.05, 1.1, 0.05), "wood", { m: M(dx, yb + 1.0, zf + 0.06), color: FRAME });
    glows.push({ p: W(dx, yb + 1.0, zf + 0.4), size: 1.3 });
  }
  // windows + doors from the openings table
  const walls: Array<[keyof typeof L.COT_OPEN, (u: number) => THREE.Matrix4]> = [
    ["front", (u) => M(-hl + u, fl, hd)],
    ["back", (u) => M(-hl + u, fl, -hd, 0, Math.PI, 0)],
    ["far", (u) => M(hl, fl, -hd + u, 0, Math.PI / 2, 0)],
    ["near", (u) => M(-hl, fl, -hd + u, 0, -Math.PI / 2, 0)],
  ];
  for (const [wk, base] of walls) for (const op of L.COT_OPEN[wk]) {
    const m0 = mul(base(op.u), M(0, op.y0, 0));
    if (op.kind === "window") {
      b.add(frameGeo(op.w, op.h, 0.14, 0.3, false), "wood", { m: m0, uv: "local", tile: 1, color: FRAME });
      // clear — the kit furnishes the room
      b.add(shapeGeo(rectShape(op.w, op.h)), "glass", { m: mul(m0, M(0, 0, -0.06)), uv: "keep", shadow: false });
      b.add(box(0.06, op.h, 0.06), "wood", { m: mul(m0, M(0, op.h / 2, -0.02)), color: FRAME });
      b.add(box(op.w, 0.06, 0.06), "wood", { m: mul(m0, M(0, op.h * 0.55, -0.02)), color: FRAME });
      b.add(rbox(op.w + 0.4, 0.12, 0.32, 0.03), "stone", { m: mul(m0, M(0, -0.08, 0.1)), color: 0xc9c1b4 });
      if (wk === "front") { b.add(rbox(op.w, 0.25, 0.3, 0.03), "wood", { m: mul(m0, M(0, -0.3, 0.3)), color: 0x6a4028 }); for (let k = 0; k < 5; k++) b.add(sph(0.13, 8, 6), "plain", { m: mul(m0, M(-op.w / 2 + 0.15 + k * (op.w - 0.3) / 4, -0.1, 0.3)), color: k % 2 ? 0xe04a6a : 0x5c9a3a }); }
      glows.push({ p: new THREE.Vector3(0, op.h / 2, 0.4).applyMatrix4(mul(M(f.x, f.y, f.z, 0, f.yaw, 0), m0)), size: 1.2 });
    } else {
      b.add(frameGeo(op.w, op.h, 0.16, 0.36, false), "wood", { m: m0, uv: "local", tile: 1, color: FRAME });
      const leaf = mul(m0, M(-op.w / 2, 0, -0.1, 0, wk === "front" ? 1.7 : -1.7, 0));
      b.add(rbox(op.w - 0.05, op.h - 0.05, 0.07, 0.02), "wood", { m: mul(leaf, M(op.w / 2, op.h / 2, 0)), color: 0x6e3b24 });
      for (const py of [0.7, 1.9]) b.add(rbox(op.w * 0.6, 0.8, 0.04, 0.02), "wood", { m: mul(leaf, M(op.w / 2, py, 0.05)), color: 0x5c3120 });
    }
  }
  // porch: posts, blue-grey corrugated awning, balustrade, lamp, bench
  const Pz = hd + L.PORCH.depth;
  for (const px of [L.PORCH.x0 + 0.15, -2.0, L.PORCH.x1 - 0.15]) b.add(rbox(0.16, 2.75, 0.16, 0.03), "wood", { m: M(px, L.PORCH.y + 1.375, Pz - 0.12), tile: 1, color: 0x7a5236 });
  const aw = Math.atan2(0.55, L.PORCH.depth + 0.3);
  b.add(box(L.PORCH.x1 - L.PORCH.x0 + 0.5, 0.06, L.PORCH.depth + 0.6), "corr", { m: M((L.PORCH.x0 + L.PORCH.x1) / 2, L.PORCH.y + 3.1, hd + L.PORCH.depth / 2 + 0.1, aw, 0, 0), uv: "local", tile: 1.5, color: 0x7b8ea4 });
  b.add(rbox(L.PORCH.x1 - L.PORCH.x0 + 0.5, 0.14, 0.1, 0.02), "wood", { m: M((L.PORCH.x0 + L.PORCH.x1) / 2, L.PORCH.y + 2.78, Pz - 0.12), color: 0x7a5236 });
  P.railing(b, L.PORCH.x0 + 0.15, Pz - 0.12, L.PORCH.x1 - 1.6, Pz - 0.12, L.PORCH.y, { h: 1.0, mat: "wood", color: 0x8a6444, thick: 0.07, balusters: true, spacing: 1.6 });
  P.railing(b, L.PORCH.x0 + 0.15, hd + 0.1, L.PORCH.x0 + 0.15, Pz - 0.12, L.PORCH.y, { h: 1.0, mat: "wood", color: 0x8a6444, thick: 0.07, balusters: true, spacing: 1.6 });
  glows.push({ p: P.wallLamp(b, M(5.3, fl + 2.4, hd, 0, 0, 0)).applyMatrix4(M(f.x, f.y, f.z, 0, f.yaw, 0)), size: 1.3 });
  keeperDetails(b, bNear);
  // (the ground floor is furnished by the shared interiors kit — L.INTERIOR_ROOMS, built in build())
  b.setFrame(0, 0, 0, 0); bNear.setFrame(0, 0, 0, 0);
}

// ------------------------------------------------------------------------------------------------ yard + masts
function masts(b: Batch, ctx: WorldCtx, glows: Glow[]) {
  for (const [i, [x, y, z, h]] of L.MASTS.entries()) {
    b.add(rbox(1.6, 0.8, 1.6, 0.05), "concrete", { m: M(x, y + 0.05, z), tile: 2, color: 0xcfc8ba });
    P.latticeMast(b, M(x, y + 0.45, z, 0, i * 0.7, 0), h, 1.0);
    P.dish(b, M(x + 0.2, y + h * 0.62, z, 0, -2.4 + i * 1.3, 0), 0.8);
    if (i === 0) P.dish(b, M(x - 0.2, y + h * 0.45, z, 0.1, 0.9, 0), 0.6);
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; b.add(rbox(0.28, 1.1, 0.12, 0.03), "pmetal", { m: M(x + Math.cos(a) * 0.35, y + h * 0.85, z + Math.sin(a) * 0.35, 0, -a, 0), color: 0xe6e2da }); }
    b.add(cyl(0.03, 0.03, 2.2, 6), "steel", { m: M(x, y + h + 1.5, z), color: 0x777777 });
    b.add(sph(0.14, 8, 6), "lampRed", { m: M(x, y + h + 2.65, z) });
    b.add(rbox(1.0, 1.4, 0.7, 0.04), "pmetal", { m: M(x + 1.3, y + 0.7, z + 0.4, 0, 0.3, 0), color: 0xb9b8b0 });
    blobShadow(b, ctx.terrain, x, z, 3, 3, 0, y);
    glows.push({ p: new THREE.Vector3(x, y + h + 2.65, z), size: 1.2, color: 0xff4030 });
  }
}

function yard(b: Batch, bMid: Batch, bNear: Batch, ctx: WorldCtx, glows: Glow[]) {
  const G = (x: number, z: number) => groundAt(ctx, x, z);
  // worn compacted-earth yard: one bespoke painted decal (tracks, pebbles, crisp broken edge) draped on the ground
  {
    const f = L.COT.frame, Wd = 34, Dd = 17, nx = 48, nz = 24;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const lx = -Wd / 2 - 7 + (Wd * i) / nx, lz = 1.5 + (Dd * j) / nz - 3.5;
      const p = toWorld(f, lx, 0, lz);
      pos.push(p[0], G(p[0], p[2]) + 0.09, p[2]); uv.push(i / nx, 1 - j / nz);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b2 = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b2, b2, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const ym = new THREE.MeshStandardMaterial({ map: TX.lookoutYard().map, normalMap: TX.lookoutYard().normalMap, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    ym.name = "coast:yard";
    b.add(g, ym, { uv: "keep", shadow: false });
  }
  // flagstone path: tower door → stair head, and door → porch (stones seated ABOVE the yard decal)
  const door = new THREE.Vector3(L.LH.x + Math.cos(L.LH.doorA) * 7.2, 0, L.LH.z + Math.sin(L.LH.doorA) * 7.2);
  const head = new THREE.Vector3(L.STAIR_HEAD[0], 0, L.STAIR_HEAD[2]);
  const porch = toWorld(L.COT.frame, L.PORCH.x1 - 0.8, 0, L.COT.D / 2 + L.PORCH.depth + 1.4);
  const r = rng(12);
  // irregular flush flagstones (6–8-sided slabs, bevelled, 7 cm proud) in pale granite — no grid texture
  const flag = (x: number, z: number, s: number, seed: number) => {
    const rr = rng(seed), n = 6 + Math.floor(rr() * 3), sh = new THREE.Shape();
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rr() * 0.4, d = s * (0.75 + rr() * 0.3); const px = Math.cos(a) * d, pz = Math.sin(a) * d * 0.85; if (k) sh.lineTo(px, pz); else sh.moveTo(px, pz); }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.035, bevelSegments: 1 });
    g.rotateX(Math.PI / 2); g.translate(0, 0.07, 0);
    bMid.add(g, "gBoulder", { m: M(x, G(x, z) + 0.035, z, 0, rr() * 6, 0), uv: "box", tile: 1.6, color: new THREE.Color(0.98, 0.95, 0.9).multiplyScalar(0.86 + rr() * 0.16), shadow: false });
  };
  const path = (a: THREE.Vector3, c: THREE.Vector3, seed: number) => {
    const len = a.distanceTo(c), n = Math.ceil(len / 0.85);
    for (let k = 0; k <= n; k++) {
      const t = k / n, side = (k % 2 ? 1 : -1) * 0.28, dx = (c.z - a.z) / len, dz = -(c.x - a.x) / len;
      const x = a.x + (c.x - a.x) * t + dx * side + (r() - 0.5) * 0.15, z = a.z + (c.z - a.z) * t + dz * side + (r() - 0.5) * 0.15;
      flag(x, z, 0.36 + r() * 0.14, seed + k);
    }
  };
  path(door, head, 500);
  path(door, new THREE.Vector3(porch[0], 0, porch[2]), 540);
  // white rail fence along the lip
  const gTer = { height: (x: number, z: number) => G(x, z) } as unknown as import("../../../../../shared/world/terrain").Terrain;
  // (runs split where the lip drops > 1.2 m between two posts — the shared collider skips those spans too)
  for (const line of L.FENCE) {
    let run: Array<[number, number]> = [];
    const flush = () => { if (run.length > 1) P.railFence(bMid, run, { terrain: gTer, color: 0xf4f1ea, mat: "pmetal", spacing: 2.0 }); run = []; };
    for (let i = 0; i < line.length; i++) { if (i && Math.abs(line[i][2] - line[i - 1][2]) > 1.2) flush(); run.push([line[i][0], line[i][1]]); }
    flush();
  }
  // truck, picnic tables, crates, barrels, logs, windsock, lamp posts
  const [tx, ty, tz, tyaw] = L.TRUCK;
  pickup(bMid, M(tx, ty, tz, 0, tyaw, 0));
  blobShadow(bMid, null, tx, tz, 5.6, 2.8, tyaw, ty, 1);
  for (const [px, py, pz, yaw] of L.PICNIC) { P.picnicTable(bMid, M(px, py, pz, 0, yaw, 0)); blobShadow(bMid, null, px, pz, 2.6, 2.2, yaw, py); }
  for (const [px, py, pz, yaw, n] of L.CRATES) {
    for (let k = 0; k < n; k++) P.crate(bMid, M(px, py + k * 0.8, pz, 0, yaw + k * 0.15, 0), { full: k === n - 1 && n === 1, seed: k + Math.round(px), lid: k < n - 1 || n > 1 });
    blobShadow(bMid, null, px, pz, 1.9, 1.5, yaw, py);
  }
  const fw = (lx: number, lz: number) => toWorld(L.COT.frame, lx, 0, lz);
  for (const [lx, lz, kind] of [[-7.6, 3.2, "barrel"], [-7.0, 4.2, "barrel"], [-8.3, 4.3, "drum"], [9.4, 4.2, "logs"], [6.8, -6.2, "drum"], [7.6, -6.0, "drum"], [-8.8, 7.0, "crate"], [-9.6, 6.3, "barrel"], [8.2, -5.4, "barrel"], [-10.2, 7.4, "drum"]] as Array<[number, number, string]>) {
    const p = fw(lx, lz), gy = G(p[0], p[2]);
    if (kind === "barrel") P.barrel(bMid, M(p[0], gy, p[2], 0, lx, 0));
    else if (kind === "drum") P.drum(bMid, M(p[0], gy, p[2], 0, lz, 0), 0x3f6e46);
    else if (kind === "crate") P.crate(bMid, M(p[0], gy, p[2], 0, lx * 0.3, 0), { lid: true, seed: Math.round(lx * 10) });
    else P.logPile(bMid, M(p[0], gy, p[2], 0, L.COT.frame.yaw, 0), 6);
    blobShadow(bMid, null, p[0], p[2], 1.3, 1.3, 0, gy);
  }
  {
    const [wx, wy, wz] = L.WINDSOCK;
    P.windsock(bMid, M(wx, wy, wz, 0, 2.4, 0), 6.5);
    const lp = P.lampPost(bMid, M(door.x + 1.8, G(door.x + 1.8, door.z - 2.2), door.z - 2.2));
    glows.push({ p: lp, size: 1.3 });
    const lp2 = P.lampPost(bMid, M(head.x + 1.5, G(head.x + 1.5, head.z + 1.2), head.z + 1.2), 3.0);
    glows.push({ p: lp2, size: 1.3 });
  }
  void bNear;
}

// ------------------------------------------------------------------------------------------------ vegetation
/** the terrain's footpath onto the headland (shared/world/terrain-gen.ts "plantation-lookout") + our lane to the yard */
const PATH: Array<[number, number]> = [[-460, 395], [-510, 420], [-560, 450], [-590, 470], [-622, 468], [-646, 462]];
const distPath = (x: number, z: number) => {
  let best = Infinity;
  for (let i = 0; i + 1 < PATH.length; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1], dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
  }
  return best;
};
function dressVeg(ctx: WorldCtx, cl: { ledges: Array<[number, number, number]>; rimPts: Array<[number, number, number]>; hangPts: Array<[number, number, number, number]> }, stairPlants: Array<[number, number, number]>) {
  const veg = ctx.shared.get("veg") as VegApi | undefined;
  if (!veg) return;
  const r = rng(77);
  const at = (x: number, y: number, z: number, s: number, yaw: number, tilt = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, "YXZ")), new THREE.Vector3(s, s, s));
  const onGround = (x: number, z: number, s: number, yaw: number) => at(x, groundAt(ctx, x, z), z, s, yaw);
  const fw = (lx: number, lz: number) => toWorld(L.COT.frame, lx, 0, lz);
  const lists: Partial<Record<PlantKind, THREE.Matrix4[]>> = {};
  // collidable kinds only via the shared FLORA (their trunks collide; a client-only palm was walk-through)
  const blocked = (x: number, z: number) => inFrameRect(L.HUT.frame, x, z, -L.HUT.hx, L.HUT.hx + 1.4, -L.HUT.hz, L.HUT.hz, 0.7)
    || inFrameRect(L.COT.frame, x, z, -L.COT.L / 2, L.COT.L / 2, -L.COT.D / 2, L.COT.D / 2 + L.PORCH.depth, 0.5)
    || L.LK_WALLS.some(([wx, wz, yaw, len]) => { const dx = x - wx, dz = z - wz, u = dx * Math.cos(yaw) - dz * Math.sin(yaw), v = dx * Math.sin(yaw) + dz * Math.cos(yaw); return Math.abs(u) < len / 2 + 0.4 && Math.abs(v) < 0.8; })
    || L.LK_BOULDERS.some(([bx2, , bz, sz]) => Math.hypot(x - bx2, z - bz) < sz * 0.8);
  const add = (k: PlantKind, m: THREE.Matrix4) => { if (!SOLID_KINDS.has(k) && !blocked(m.elements[12], m.elements[14])) (lists[k] ??= []).push(m); };
  // the view camera's sight lines. FOREGROUND = between the camera and the tower / cottage (nothing tall may
  // stand there: two palms would hide the cottage); BACKDROP = behind the tower + cottage as seen from the camera
  // (low planting only, so the lighthouse reads against the open headland and the island beyond, not a palm wall)
  const [cx0, , cz0] = VIEW.pos, bearing = (x: number, z: number) => Math.atan2(x - cx0, z - cz0);
  const tgt = [[L.LH.x, L.LH.z], ...[[-6.5, -4.5], [6.5, -4.5], [-6.5, 7], [6.5, 7]].map(([lx, lz]) => { const p = fw(lx, lz); return [p[0], p[2]]; })];
  const tb = tgt.map(([x, z]) => bearing(x, z)), tc = tb[0];
  const rel = (a: number) => { let d = a - tc; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const span = [Math.min(...tb.map(rel)) - 0.07, Math.max(...tb.map(rel)) + 0.07];
  const dT = Math.hypot(L.LH.x - cx0, L.LH.z - cz0);
  const sight = (x: number, z: number) => {
    const d = rel(bearing(x, z)), dist = Math.hypot(x - cx0, z - cz0);
    // tall plants in front lean and spread 5–7 m: a wider guard band in front than behind
    if (dist < dT - 6) return d > span[0] - 0.14 && d < span[1] + 0.1 ? "front" : "clear";
    if (d < span[0] || d > span[1]) return "clear";
    return dist > dT - 2 ? "behind" : "clear";
  };
  // palms: behind the cottage (inland) + at the yard ends — never between the tower door and the porch, never in the
  // camera's sight lines
  for (const [lx, lz, s] of [[9.8, -4.5, 1.05], [12.5, 1.0, 0.95], [2.5, -10.5, 1.12], [-3.5, -9.0, 0.95], [16.0, 7.5, 1.0], [-27.0, -7.0, 0.95], [14.5, 11.5, 1.1], [-29.5, 3.5, 1.0]] as Array<[number, number, number]>) {
    const p = fw(lx, lz);
    if (sight(p[0], p[2]) !== "clear") continue;
    add("palm", onGround(p[0], p[2], s, lx));
  }
  // monstera / fern / banana clumps at the cottage base, the tower plinth and along the fence (no broccoli balls)
  for (const [lx, lz] of [[-5.8, 4.7], [6.4, 4.6], [6.5, -4.6], [-2.5, -10.0], [5.2, 5.4], [-8.2, -2.0], [-16.5, -1.5], [-7.4, -3.2], [7.2, 1.5], [-20, 12.5], [4, 13.8], [11.5, 13]]) {
    const p = fw(lx, lz), k = r(), open = sight(p[0], p[2]) === "clear";
    add(k < 0.4 || (!open && k >= 0.75) ? "fern" : k < 0.75 ? "monstera" : "banana-plant", onGround(p[0], p[2], 0.85 + r() * 0.3, lx));
  }
  // the headland top: an open grassy headland with CLUMPS of palms + bushes + ferns (palms only where a slow blob
  // field allows, sparse), a meadow of grass + flowers everywhere else; a dense jungle grove
  // makes the plateau read "tower in the jungle" and hides the tower + cottage from the view camera
  const c = Math.cos(L.COT.frame.yaw), sn = Math.sin(L.COT.frame.yaw);
  const local = (x: number, z: number) => { const dx = x - L.COT.frame.x, dz = z - L.COT.frame.z; return [dx * c - dz * sn, dx * sn + dz * c]; };
  const clump = (x: number, z: number) => Math.sin(x * 0.043 + 1.3) * Math.sin(z * 0.051 + 0.7) + 0.35 * Math.sin((x + z) * 0.11);
  for (let i = 0; i < 2600; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 96, x = L.PAD.x + Math.cos(a) * d, z = L.PAD.z + Math.sin(a) * d;
    const [lx, lz] = local(x, z);
    const inYard = lx > -31 && lx < 17 && lz > -13 && lz < 18;
    if (inYard) continue;
    const g = groundAt(ctx, x, z);
    if (g < L.TOP - 6) continue;                                       // off the plateau (the slopes keep the island's veg)
    const pd = distPath(x, z), yardD = Math.max(0, Math.max(-31 - lx, lx - 17, -13 - lz, lz - 18));
    if (pd < 2.2) continue;
    const s = 0.85 + r() * 0.35, k = r(), sl = sight(x, z), cl = clump(x, z);
    const tallOK = sl === "clear" && cl > 0.35, midOK = sl !== "front";
    if (pd < 4.5 || yardD < 5) { add(k < 0.6 ? "grass" : k < 0.8 ? "flowers" : "fern", onGround(x, z, 0.8 + r() * 0.4, r() * 6)); continue; }
    if (yardD < 11 && k < 0.5) { add(k < 0.3 ? "grass" : "flowers", onGround(x, z, 0.9, r() * 6)); continue; }
    if (tallOK && k < 0.12) add(k < 0.1 ? "palm" : "palm-leaning", onGround(x, z, s * 1.05, r() * 6));
    else if (tallOK && k < 0.13) add("jungle-tree", onGround(x, z, s * 0.85, r() * 6));
    else if (cl > 0.1 && k < 0.3) add(midOK ? "bush" : "fern", onGround(x, z, s, r() * 6));
    else if (cl > 0.1 && k < 0.36) add(midOK ? "banana-plant" : "fern", onGround(x, z, s, r() * 6));
    else if (k < 0.5) add("fern", onGround(x, z, s, r() * 6));
    else if (cl > 0 && k < 0.54) add("monstera", onGround(x, z, s, r() * 6));
    else if (k < 0.545) add("log", onGround(x, z, s, r() * 6));
    else add(k < 0.8 ? "grass" : "flowers", onGround(x, z, s, r() * 6));
  }
  // rim: ferns, bushes and grass on the caps just inside the lip (they spill over the rounded turf edge); a few palms
  // leaning out over the drop; monstera + palms on the lower ledges; ferns on the stair landings
  for (const [i, [x, y, z]] of cl.rimPts.entries()) {
    const k = i % 5;
    add(k === 0 || k === 3 ? "fern" : k === 1 ? "bush" : k === 2 ? "grass" : "flowers", at(x, y, z, 0.8 + r() * 0.45, r() * 6));
    if (i % 11 === 5 && sight(x, z) === "clear") { const out = Math.atan2(x - L.PAD.x, z - L.PAD.z); add("palm-leaning", at(x, y, z, 0.95, out + Math.PI / 2)); }
  }
  // leafy lip: ferns + monstera tipped out over the drop (foliage spilling over the cliff edge)
  for (const [i, [x, y, z, yaw]] of cl.hangPts.entries()) {
    const k = i % 4;
    add(k === 3 ? "monstera" : k === 1 ? "bush" : "fern", at(x, y - 0.15, z, k === 1 ? 0.7 : 0.9 + r() * 0.4, yaw + (r() - 0.5) * 0.5, k === 1 ? 0.5 : 0.95 + r() * 0.4));
  }
  // feature clumps on the open lawn right of the cottage (palm + bushes + ferns + flowers), cottage-local positions
  for (const [lx, lz, palms] of [[8, -14, 1], [14, -25, 2], [3, -31, 1], [19, -7, 1], [-6, -24, 0], [22, 5, 1], [28, -16, 1]] as Array<[number, number, number]>) {
    const p = fw(lx, lz), open = sight(p[0], p[2]) === "clear";
    for (let q = 0; q < palms && open; q++) { const pp = fw(lx + (r() - 0.5) * 3, lz + (r() - 0.5) * 3); add(q ? "palm-leaning" : "palm", onGround(pp[0], pp[2], 0.95 + r() * 0.2, r() * 6)); }
    for (let q = 0; q < 9; q++) {
      const a = r() * 6.28, d = 1.5 + r() * 4.5, pp = fw(lx + Math.cos(a) * d, lz + Math.sin(a) * d), k = r();
      add(k < 0.35 ? "bush" : k < 0.65 ? "fern" : k < 0.8 ? "monstera" : k < 0.9 && open ? "banana-plant" : "flowers", onGround(pp[0], pp[2], 0.8 + r() * 0.4, r() * 6));
    }
  }
  for (const [i, [x, y, z]] of cl.ledges.entries()) {
    add(i % 2 ? "monstera" : "fern", at(x, y, z, 1.0, i));
    if (i % 3 === 1 && (sight(x, z) === "clear" || y < L.TOP - 14)) add(i % 2 ? "palm-leaning" : "palm", at(x + 1, y, z, 0.85, i));
  }
  for (const [i, [x, y, z]] of stairPlants.entries()) add(i % 3 === 0 ? "grass" : "fern", at(x, y, z, 0.7 + r() * 0.3, r() * 6));
  for (const [k, ms] of Object.entries(lists)) veg.plant(k as PlantKind, ms!);
}

// ------------------------------------------------------------------------------------------------ far proxy
/** ≤ 2k tris, one vertex-coloured draw: banded tower + lantern + dome, cottage block + roof, masts */
function farProxy() {
  const b = new Batch();
  const { x, y, z } = L.LH, T = L.LH.top - y;
  b.add(cyl(5.2, 5.3, 2.4, 16), "plain", { m: M(x, y + 1.2, z), color: WHITE });
  const bh = (T - 2.4) / 7;
  for (let i = 0; i < 7; i++) b.add(cyl(L.lhRadius(y + 2.4 + (i + 1) * bh), L.lhRadius(y + 2.4 + i * bh), bh, 16, true), "plain", { m: M(x, y + 2.4 + (i + 0.5) * bh, z), color: i % 2 ? WHITE : RED });
  b.add(cyl(L.LH.deckR, L.LH.deckR, 0.5, 16), "plain", { m: M(x, L.LH.top - 0.25, z), color: 0xefece6 });
  b.add(cyl(L.LH.roomR, L.LH.roomR, L.LH.glassH + 1.3, 12), "plain", { m: M(x, L.LH.top + (L.LH.glassH + 1.3) / 2, z), color: 0xffcf7a });
  b.add(sph(L.LH.roomR + 0.2, 12, 6), "plain", { m: M(x, L.LH.top + L.LH.glassH + 1.3, z, 0, 0, 0, 1, 0.9, 1), color: RED });
  const f = L.COT.frame;
  b.setFrame(f.x, f.y, f.z, f.yaw);
  b.add(box(L.COT.L, L.COT_EAVE + 0.6, L.COT.D), "plain", { m: M(0, (L.COT_EAVE - 0.6) / 2, 0), color: CREAM });
  const rg = gableGeo(L.COT.D + 1.3, L.COT_RISE + 0.5, L.COT.L + 1.2); rg.rotateY(Math.PI / 2);
  b.add(rg, "plain", { m: M(0, L.COT_EAVE - 0.3, 0), uv: "local", color: 0xb0483a });
  b.setFrame(0, 0, 0, 0);
  for (const [mx, my, mz, h] of L.MASTS) b.add(cyl(0.2, 0.4, h, 4), "plain", { m: M(mx, my + h / 2, mz), color: 0xd8392b });
  const g = b.build("lookout-point:proxy", { farShadow: true });
  g.traverse((o) => { o.userData.farShadow = "force"; o.userData.castShadow = true; });
  return g;
}

/**
 * The poi-11 view camera (tower big on the right third, the cliff + stair lower left,
 * the coast receding left, the volcano out of the centre). The target framing has the camera ~55–60 m from the tower, ~12 m
 * above the plateau, pitched ~7° down (horizon 38 % from the top, finial at 4 %, tower base at
 * 60 %). Ours: out over the NW bay SW of the tower (bearing VIEW_BEARING from the tower, +X east / +Z south), which puts
 * the bay, the beach and the W coast on the left, the volcano in the upper-left quarter, the keeper's cottage right of
 * the tower and the switchback stair on the face below-left of it. Derived from the baked tower anchor so a re-bake
 * that nudges the tower keeps the framing.
 */
export const VIEW_BEARING = 133.5, VIEW_DIST = 57.5, VIEW_H = 13.2;
function lookoutView(): { pos: [number, number, number]; target: [number, number, number]; fov: number } {
  const fov = 52, asp = 16 / 9, vt = Math.tan((fov / 2) * Math.PI / 180), ht = vt * asp;
  const br = (VIEW_BEARING * Math.PI) / 180;
  const P: [number, number, number] = [L.LH.x + Math.cos(br) * VIEW_DIST, L.TOP + VIEW_H, L.LH.z + Math.sin(br) * VIEW_DIST];
  // tower at 63 % of the width, horizon 38 % from the top
  const bT = Math.atan2(L.LH.x - P[0], -(L.LH.z - P[2])), bc = bT - Math.atan((0.63 - 0.5) * 2 * ht), pitch = -Math.atan((0.5 - 0.38) * 2 * vt);
  const fw = [Math.sin(bc) * Math.cos(pitch), Math.sin(pitch), -Math.cos(bc) * Math.cos(pitch)];
  return { pos: P, target: [P[0] + fw[0] * 100, P[1] + fw[1] * 100, P[2] + fw[2] * 100], fov };
}
/** the view camera (also shapes the plateau dressing: nothing tall between it and the tower + cottage, and the
 *  backdrop behind the tower stays low so the lighthouse reads against the open headland, not a wall of palms) */
export const VIEW = lookoutView();

const mod: WorldModule = {
  id: "poi:lookout-point",
  views: {
    // out over the bay W of the headland at ~2/3 of the tower's height, looking E with the low sun to the right: the
    // lighthouse + cottage on the lip in the right third, the columnar face with the switchback stair winding down
    // below them, the bay + beach lower left, the palm-grove headland receding left. NB the stair is re-derived from the
    // terrain by the lookout bake — re-check this framing after a re-bake moves it
    "poi-11-lookout-point": { ...VIEW, stage: "golden" },
  },
  // the view is late golden hour: atmos has no "golden" preset yet, so the view stages one through atmos's
  // published state api (./golden.ts — derived from the live midday preset)
  stage(ctx, stage) {
    if (stage === "golden") stageGolden(ctx);
  },
  async build(ctx) {
    await Promise.all([loadCoastTextures(ctx, ["cliff-slab", "roof-tiles", "boulder"]), cliffMaterials(ctx)]);
    lampMaterials();
    const glows: Glow[] = [];
    const b = new Batch({ cell: 1000 }), bMid = new Batch({ lod: 1, cell: 1000 }), bNear = new Batch({ lod: 2, cell: 1000 }), bRock = new Batch({ cell: 1000 });
    // (GPU share) the lighthouse rooms are their own group, drawn only near the tower (inside / at the door)
    const bLh = new Batch({ cell: 1000 });
    const lampY = lighthouse(b, bNear, glows, bLh);
    await ctx.yield();
    cottage(b, bNear, glows);
    masts(bMid, ctx, glows);
    yard(b, bMid, bNear, ctx, glows);
    await ctx.yield();
    const cl = buildCliff(bRock, bNear, ctx);
    await ctx.yield();
    const tierCaps = cladTerrainRocks(bRock, ctx);
    await ctx.yield();
    lipDrape(bRock, ctx, (x, z) => distPath(x, z) < 2.4);
    const stairPlants = buildStair(b, bMid, glows);
    await ctx.yield();
    buildHut(b, bMid, bNear, glows);
    buildPlateauCover(bMid, bNear, (x, z) => groundAt(ctx, x, z));
    buildAttic(b, bNear);
    await ctx.yield();
    const proxy = farProxy();
    const groups = [buildLayered("lookout-point", [b, bMid, bNear], { farShadow: false })];
    const rock = bRock.build("lookout-point:cliff", { farShadow: true });
    const gp = glowPoints(glows, { opacity: 0.22 });
    ctx.scene.add(...groups, rock, gp, proxy);
    const lod = new CoastLod({ center: [L.LH.x, L.TOP, L.LH.z + 6], radius: 40, proxy });
    for (const g of groups) lod.add(g);
    lod.add(rock, 3).add(gp, 1).attach(ctx);
    { const lhIn = bLh.build("lookout-point:lh-interior", { farShadow: false });
      lhIn.traverse((o) => { o.castShadow = false; o.userData.castShadow = false; });
      ctx.scene.add(lhIn);
      const cp = new THREE.Vector3();
      const vis = () => { ctx.camera.getWorldPosition(cp); lhIn.visible = NOCULL || (Math.hypot(cp.x - L.LH.x, cp.z - L.LH.z) < 14 && cp.y > L.LH.y - 3 && cp.y < L.LH.top + 6); };
      vis(); ctx.onUpdate(vis); }
    // lamp shimmer (slow breathing) — frozen in shot mode
    ctx.onUpdate((_dt, t) => { lampCore.emissiveIntensity = 3.6 + 0.25 * Math.sin(t * 1.7); });
    void lampY;
    plantFlora(ctx.shared.get("veg") as VegApi | undefined, L.FLORA, ctx.scene);
    dressVeg(ctx, cl, [...stairPlants, ...tierCaps]);
    await ctx.yield();
    // the keeper's cottage ground floor + the signal hut (shared interiors kit)
    await buildKeeperHome(ctx, NOCULL ? 1e6 : 42);
    await buildInteriors(ctx, L.INTERIOR_ROOMS.filter(r => !r.id?.startsWith("keeper-cottage")), { name: "lookout-point:interiors", maxDist: NOCULL ? 1e6 : 42 }); // (GPU share) rooms beyond 42 m are not drawn
  },
};
export default mod;
