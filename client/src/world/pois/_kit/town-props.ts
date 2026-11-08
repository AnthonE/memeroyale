// poi-town props: everything that dresses the three towns. All pieces go into the shared GeoBins (merged per
// material) so a whole POI stays at ~20 draw calls. Coordinates are WORLD unless the helper takes a matrix `at`.
import * as THREE from "three";
import { fruitSink, fruitMound } from "./town-fruit";
import { M, boxGeo, cylGeo, latheGeo, quadGeo, tubeGeo, catenary, col, type ColorFn } from "./town-geo";
import type { TownBins } from "./town-materials";
import { leafGeo, stripeQuad, stripeValance } from "./town-building";
import { type Deck, deckSides, deckPiles, railRuns, sidePoint } from "../../../../../shared/pois/town-kit";
import { addPile, addRock, addNet, addFishRack, addLashing } from "./town-lagoon";
export { addPile, addRock, addNet, addFishRack };

const DARK = "#5b3c1e", WOOD = "#a9773f", ROPE = "#c7b58a";

// ---------- crates & fruit
export function addCrate(bins: TownBins, at: THREE.Matrix4, color: string, w = 0.6, h = 0.34, d = 0.42, plastic = false) {
  if (plastic) {
    bins.plastic.box(w, h, d, at.clone().multiply(M(0, h / 2, 0)), col(color));
    bins.plastic.box(w * 0.86, h * 0.1, d * 0.86, at.clone().multiply(M(0, h - 0.02, 0)), col(color, 0.8));
    return;
  }
  const c = col(color);
  // slats: 3 per long side, 2 per short, corner posts, bottom
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) bins.wood.box(w, h / 3 * 0.8, 0.02, at.clone().multiply(M(0, h / 6 + i * h / 3, s * (d / 2 - 0.01))), c, [i * 0.7, 0]);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) bins.wood.box(0.02, h / 3 * 0.8, d, at.clone().multiply(M(s * (w / 2 - 0.01), h / 6 + i * h / 3, 0)), c, [i * 0.4, 0.5]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bins.woodDark.box(0.04, h, 0.04, at.clone().multiply(M(sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02))), col(color, 0.7));
  bins.wood.box(w - 0.02, 0.02, d - 0.02, at.clone().multiply(M(0, 0.02, 0)), col(color, 0.85));
}

export function addMangoes(bins: TownBins, at: THREE.Matrix4, w: number, d: number, n: number, rng: () => number, top = 0.1) {
  // (without a fruit sink the painted heap mound carries the pile)
  fruitMound(bins, at.clone().multiply(M(0, top, 0)), w / 2 - 0.06, 0.08, d / 2 - 0.06, "mango", rng());
  const fx = fruitSink();
  if (fx) for (let i = 0; i < n; i++) { const x = (rng() - 0.5) * (w - 0.16), z = (rng() - 0.5) * (d - 0.16), layer = i < n * 0.6 ? 0 : 1; fx.mango(at.clone().multiply(M(x, top + 0.05 + layer * 0.07, z, rng() * 6.28, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4, 0.13)), rng(), 0.92 + rng() * 0.16); }
}
export function addBananas(bins: TownBins, at: THREE.Matrix4, w: number, d: number, n: number, rng: () => number, top = 0.1) {
  fruitMound(bins, at.clone().multiply(M(0, top, 0)), w / 2 - 0.06, 0.06, d / 2 - 0.06, "banana", rng());
  const fx = fruitSink();
  if (fx) for (let i = 0; i < n; i++) { const x = (rng() - 0.5) * (w - 0.3), z = (rng() - 0.5) * (d - 0.2); fx.hand(at.clone().multiply(M(x - 0.08, top + 0.03 + (i % 2) * 0.04, z, rng() * 6.28, 0, (rng() - 0.5) * 0.3)), 5 + Math.floor(rng() * 3), rng() * 0.3); }
}
/** crate full of fruit */
export function addFruitCrate(bins: TownBins, at: THREE.Matrix4, color: string, fruit: "mango" | "banana", rng: () => number) {
  addCrate(bins, at, color, 0.62, 0.3, 0.44);
  if (fruit === "mango") addMangoes(bins, at, 0.62, 0.44, 14, rng, 0.18);
  else addBananas(bins, at, 0.62, 0.44, 6, rng, 0.2);
}

// ---------- market stall
export function addStall(bins: TownBins, at: THREE.Matrix4, row: number, rng: () => number, fruit: "mango" | "banana" | "mixed" = "mixed") {
  const w = 2.6, d = 1.1, th = 0.86;
  bins.wood.box(w, 0.06, d, at.clone().multiply(M(0, th, 0)), col(WOOD), [rng() * 3, 0]);
  bins.woodDark.box(w, 0.1, 0.06, at.clone().multiply(M(0, th - 0.08, d / 2)), col(DARK));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bins.woodDark.box(0.07, th, 0.07, at.clone().multiply(M(sx * (w / 2 - 0.1), th / 2, sz * (d / 2 - 0.1))), col(DARK));
  // canopy poles + striped roof
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bins.woodDark.box(0.06, 2.4, 0.06, at.clone().multiply(M(sx * (w / 2 + 0.05), 1.2, sz * (d / 2 + 0.05))), col(DARK));
  const drop = 0.3, dep = d + 0.5, sl = Math.hypot(dep, drop), ang = Math.atan2(drop, dep);
  bins.stripes.add(stripeQuad(w + 0.3, sl, row), at.clone().multiply(M(0, 2.4 - drop / 2, 0.1, 0, ang)), 0xffffff);
  bins.stripes.add(stripeValance(w + 0.3, 0.26, row), at.clone().multiply(M(0, 2.4 - drop - 0.13, dep / 2 + 0.1)), 0xffffff);
  bins.stripes.add(stripeValance(w + 0.3, 0.22, row), at.clone().multiply(M(0, 2.4 - 0.11, -dep / 2 + 0.1, Math.PI)), 0xffffff);
  // produce on the table: 3 crates, tilted display, + under the table
  const cols = ["#2f8f86", "#3a6fb0", "#c85a3a", "#b98b58"];
  for (let i = 0; i < 3; i++) {
    const f = fruit === "mixed" ? (i === 1 ? "banana" : "mango") : fruit;
    addFruitCrate(bins, at.clone().multiply(M(-0.9 + i * 0.9, th + 0.03, 0.05, (rng() - 0.5) * 0.3, -0.25)), cols[Math.floor(rng() * cols.length)], f, rng);
  }
  for (let i = 0; i < 2; i++) addFruitCrate(bins, at.clone().multiply(M(-0.6 + i * 1.2, 0, -0.1, (rng() - 0.5) * 0.4)), cols[Math.floor(rng() * cols.length)], rng() < 0.5 ? "mango" : "banana", rng);
  // hanging banana bunches from the front bar
  for (let i = 0; i < 3; i++) {
    const x = -0.8 + i * 0.8 + (rng() - 0.5) * 0.3;
    bins.rope.add(cylGeo(0.008, 0.008, 0.35, 4), at.clone().multiply(M(x, 2.4 - drop - 0.35, dep / 2 + 0.05)), col(ROPE));
    fruitSink()?.hand(at.clone().multiply(M(x, 2.4 - drop - 0.4, dep / 2 + 0.05, rng() * 6, 0, -Math.PI / 2)), 6, rng() * 0.3);
  }
}

// ---------- string lights + bunting
const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
export function addStringLights(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, sag = 0.6) {
  const pts = catenary(a, b, sag, 16);
  bins.metal.add(tubeGeo(pts, 0.012, 4, false, 24), null, col("#1d2b2a"));
  const len = a.distanceTo(b), n = Math.max(3, Math.floor(len / 1.4));
  const curve = new THREE.CatmullRomCurve3(pts);
  for (let i = 1; i < n; i++) {
    const p = curve.getPoint(i / n);
    bins.metal.add(cylGeo(0.02, 0.025, 0.07, 6), M(p.x, p.y - 0.05, p.z), col("#222"));
    bins.bulb.add(bulbGeo, M(p.x, p.y - 0.13, p.z), col("#fff2c0"));
  }
}
const flagGeo = (() => { const s = new THREE.Shape([new THREE.Vector2(-0.14, 0), new THREE.Vector2(0.14, 0), new THREE.Vector2(0, -0.26)]); const g = new THREE.ShapeGeometry(s); return g; })();
export function addBunting(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: () => number, palette = ["#f1c232", "#e8722a", "#2fb3a8", "#d9483b", "#f4efe1", "#3a86c8"]) {
  const pts = catenary(a, b, sag, 16);
  bins.rope.add(tubeGeo(pts, 0.01, 4, false, 24), null, col("#e8e0cc"));
  const curve = new THREE.CatmullRomCurve3(pts), len = a.distanceTo(b), n = Math.floor(len / 0.36);
  const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize(), yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  for (let i = 1; i < n; i++) {
    const p = curve.getPoint(i / n);
    bins.fabric.add(flagGeo, M(p.x, p.y, p.z, yaw, 0, (rng() - 0.5) * 0.15), col(palette[i % palette.length]));
  }
}

// ---------- scooter (retro, chunky)
export function addScooter(bins: TownBins, at: THREE.Matrix4, color: string) {
  const c = col(color), chrome = col("#d8dde2"), black = col("#1e2124");
  const body = at.clone();
  // wheels
  for (const x of [-0.62, 0.62]) {
    bins.metal.add(new THREE.TorusGeometry(0.2, 0.07, 8, 16), body.clone().multiply(M(x, 0.27, 0, Math.PI / 2)), black);
    bins.metal.add(cylGeo(0.14, 0.14, 0.08, 12), body.clone().multiply(M(x, 0.27, 0, 0, 0, Math.PI / 2)), chrome);
  }
  // rear body (rounded lump) + seat
  bins.plastic.add(latheGeo([[0, 0], [0.28, 0], [0.34, 0.14], [0.3, 0.3], [0.18, 0.36], [0, 0.36]], 16), body.clone().multiply(M(-0.42, 0.42, 0, 0, 0, 0)), c);
  bins.plastic.box(0.7, 0.16, 0.36, body.clone().multiply(M(-0.3, 0.62, 0)), c);
  bins.fabric.box(0.62, 0.1, 0.3, body.clone().multiply(M(-0.25, 0.75, 0)), col("#3a2a1e"));
  // floorboard + leg shield
  bins.plastic.box(0.55, 0.06, 0.34, body.clone().multiply(M(0.05, 0.2, 0)), c);
  bins.plastic.box(0.08, 0.7, 0.44, body.clone().multiply(M(0.38, 0.55, 0, 0, 0, -0.25)), c);
  bins.plastic.add(cylGeo(0.06, 0.06, 0.55, 8), body.clone().multiply(M(0.5, 0.65, 0, 0, 0, -0.35)), c);
  // handlebar, headlamp, mirror
  bins.metal.add(cylGeo(0.02, 0.02, 0.5, 8), body.clone().multiply(M(0.46, 0.98, 0, 0, Math.PI / 2)), chrome);
  bins.metal.add(cylGeo(0.09, 0.09, 0.06, 12), body.clone().multiply(M(0.52, 0.9, 0, 0, 0, Math.PI / 2)), chrome);
  bins.bulb.add(cylGeo(0.07, 0.07, 0.02, 12), body.clone().multiply(M(0.56, 0.9, 0, 0, 0, Math.PI / 2)), col("#fff6d0"));
  bins.metal.add(cylGeo(0.01, 0.01, 0.25, 5), body.clone().multiply(M(0.42, 1.1, 0.22)), chrome);
  bins.metal.add(cylGeo(0.05, 0.05, 0.015, 10), body.clone().multiply(M(0.42, 1.24, 0.22, 0, Math.PI / 2)), chrome);
  // kickstand
  bins.metal.add(cylGeo(0.015, 0.015, 0.3, 5), body.clone().multiply(M(-0.2, 0.15, 0.15, 0, 0.5)), black);
}

// ---------- fountain (basin + pedestal; water added by the POI as its own mesh)
export function addFountain(bins: TownBins, at: THREE.Matrix4, R = 5.2) {
  const stone = col("#cfc4ad"), moss = col("#7d8c55"), dark = col("#a99f8b");
  // outer step ring
  bins.stone.add(latheGeo([[R + 0.9, 0], [R + 0.9, 0.18], [R + 0.5, 0.18], [R + 0.5, 0.0]], 48), at, stone);
  // basin wall with coping
  bins.stone.add(latheGeo([[R - 0.45, 0.05], [R - 0.45, 0.62], [R - 0.55, 0.72], [R + 0.05, 0.72], [R + 0.15, 0.62], [R + 0.15, 0.0]], 48), at, stone, (x, y, z, b, o) => { if (y < at.elements[13] + 0.3) o.lerp(moss, 0.55); });
  // basin floor
  bins.stone.add(latheGeo([[0, 0.06], [R - 0.4, 0.06], [R - 0.4, 0.0], [0, 0]], 40), at, dark);
  // pedestal: 3 stepped blocks + a chamfered cap
  bins.stone.box(2.6, 0.5, 2.6, at.clone().multiply(M(0, 0.3, 0)), stone.clone().lerp(moss, 0.3));
  bins.stone.box(2.0, 1.1, 2.0, at.clone().multiply(M(0, 1.1, 0)), stone);
  bins.stone.box(2.3, 0.22, 2.3, at.clone().multiply(M(0, 1.76, 0)), stone.clone().multiplyScalar(0.95));
  bins.stone.box(1.7, 1.0, 1.7, at.clone().multiply(M(0, 2.35, 0)), stone);
  bins.stone.box(2.1, 0.25, 2.1, at.clone().multiply(M(0, 2.95, 0)), stone);
  // spouts around the pedestal (small stone lions → simple blocks with pipes)
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    bins.metal.add(cylGeo(0.04, 0.04, 0.5, 8), at.clone().multiply(M(Math.cos(a) * 1.35, 1.35, Math.sin(a) * 1.35, -a, Math.PI / 2 - 0.3)), col("#6e7b7a"));
  }
}

export function addBench(bins: TownBins, at: THREE.Matrix4) {
  bins.stone.box(1.8, 0.12, 0.5, at.clone().multiply(M(0, 0.44, 0)), col("#cfc4ad"));
  for (const x of [-0.7, 0.7]) bins.stone.box(0.16, 0.38, 0.44, at.clone().multiply(M(x, 0.19, 0)), col("#bfb49c"));
}
export function addLampPost(bins: TownBins, at: THREE.Matrix4, h = 3.4) {
  const iron = col("#2b2f33");
  bins.metal.add(latheGeo([[0, 0], [0.22, 0], [0.22, 0.08], [0.12, 0.18], [0.07, 0.4], [0.05, h - 0.5], [0.05, h - 0.4], [0.08, h - 0.38], [0.06, h - 0.1], [0, h - 0.1]], 12), at, iron);
  bins.metal.box(0.32, 0.03, 0.32, at.clone().multiply(M(0, h - 0.12, 0)), iron);
  bins.bulb.box(0.24, 0.38, 0.24, at.clone().multiply(M(0, h + 0.1, 0)), col("#ffe9b8"));
  bins.metal.add(latheGeo([[0, 0], [0.2, 0], [0.04, 0.18], [0, 0.22]], 8), at.clone().multiply(M(0, h + 0.3, 0)), iron);
  for (let i = 0; i < 4; i++) bins.metal.box(0.02, 0.4, 0.02, at.clone().multiply(M(0, h + 0.1, 0, i * Math.PI / 2)).multiply(M(0.13, 0, 0.13)), iron);
}

// ---------- umbrella, lounger, bar stool
export function stripeCone(r: number, h: number, row: number, seg = 16): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, 1, true);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2);
    uv.setXY(i, (a + 0.5) * seg / 2 * 0.25, (row + 0.15 + 0.7 * uv.getY(i)) / 6);
  }
  // slight scallop droop at the rim
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -h / 2 + 0.01) pos.setY(i, pos.getY(i) - 0.04);
  g.computeVertexNormals();
  return g;
}
export function addUmbrella(bins: TownBins, at: THREE.Matrix4, row: number, tilt = 0, r = 1.4, h = 2.4) {
  bins.woodDark.add(cylGeo(0.035, 0.045, h, 8), at.clone().multiply(M(0, h / 2, 0)), col(DARK));
  const top = at.clone().multiply(M(0, h, 0, 0, tilt));
  bins.stripes.add(stripeCone(r, 0.55, row, 16), top.clone().multiply(M(0, -0.27, 0)), 0xffffff);
  bins.metal.add(cylGeo(0.02, 0.03, 0.16, 6), top.clone().multiply(M(0, 0.06, 0)), col("#c9a24a"));
  bins.stone.add(latheGeo([[0, 0], [0.32, 0], [0.34, 0.06], [0.22, 0.12], [0.1, 0.16], [0, 0.16]], 12), at, col("#c8bda4"));
}
export function addLounger(bins: TownBins, at: THREE.Matrix4, cushion = "#f2e8d3") {
  const w = 0.7;
  bins.wood.box(w, 0.06, 1.9, at.clone().multiply(M(0, 0.32, 0)), col(WOOD), [0.4, 0.3]);
  bins.wood.box(w, 0.06, 0.7, at.clone().multiply(M(0, 0.55, -0.85, 0, -0.9)), col(WOOD));
  for (const x of [-0.3, 0.3]) for (const z of [-0.8, 0.8]) bins.woodDark.box(0.05, 0.3, 0.05, at.clone().multiply(M(x, 0.15, z)), col(DARK));
  bins.fabric.box(w - 0.06, 0.07, 1.7, at.clone().multiply(M(0, 0.38, 0.1)), col(cushion));
  bins.fabric.box(w - 0.06, 0.07, 0.6, at.clone().multiply(M(0, 0.6, -0.86, 0, -0.9)), col(cushion));
}
export function addStool(bins: TownBins, at: THREE.Matrix4) {
  bins.wood.add(cylGeo(0.17, 0.15, 0.05, 10), at.clone().multiply(M(0, 0.72, 0)), col(WOOD));
  for (let i = 0; i < 3; i++) bins.woodDark.add(cylGeo(0.02, 0.025, 0.7, 5), at.clone().multiply(M(0, 0.35, 0, i * 2.09)).multiply(M(0.11, 0, 0, 0, 0, 0.08)), col(DARK));
}

// ---------- barrels, life rings, tyres, floats, lanterns, nets, fish
export function addBarrel(bins: TownBins, at: THREE.Matrix4, color: string, metal = true) {
  const prof: Array<[number, number]> = metal
    ? [[0, 0], [0.28, 0], [0.29, 0.02], [0.29, 0.26], [0.31, 0.29], [0.29, 0.32], [0.29, 0.56], [0.31, 0.59], [0.29, 0.62], [0.29, 0.86], [0.27, 0.88], [0, 0.88]]
    : [[0, 0], [0.26, 0], [0.3, 0.2], [0.32, 0.44], [0.3, 0.68], [0.26, 0.88], [0, 0.88]];
  (metal ? bins.metal : bins.wood).add(latheGeo(prof, 16), at, col(color), (x, y, z, b, o) => { if (!metal) { const k = Math.abs(Math.sin((y - at.elements[13]) * 14)); if (k > 0.85) o.multiplyScalar(0.45); } });
}
export function addLifeRing(bins: TownBins, at: THREE.Matrix4) {
  const c = at.elements, cx = c[12], cz = c[14];
  const fn: ColorFn = (x, y, z, b, o) => { const a = Math.atan2(z - cz, x - cx); const q = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4 + 0.25) % 2; if (q) o.set("#f4efe1"); };
  bins.plastic.add(new THREE.TorusGeometry(0.32, 0.1, 8, 20), at, col("#d9483b"), fn);
}
export function addTyre(bins: TownBins, at: THREE.Matrix4) { bins.fabric.add(new THREE.TorusGeometry(0.3, 0.11, 8, 18), at, col("#1c1e20")); }
export function addFloat(bins: TownBins, at: THREE.Matrix4, color = "#2fb3a8") {
  bins.glass.add(new THREE.SphereGeometry(0.16, 12, 10), at, col(color));
  bins.net.add(new THREE.SphereGeometry(0.175, 10, 8), at, 0xffffff);
}
export function addLantern(bins: TownBins, at: THREE.Matrix4) {
  bins.metal.box(0.22, 0.04, 0.22, at.clone().multiply(M(0, 0.0, 0)), col("#2b2f33"));
  bins.glass.box(0.18, 0.28, 0.18, at.clone().multiply(M(0, 0.16, 0)), col("#ffe6a8"));
  bins.bulb.add(new THREE.SphereGeometry(0.05, 6, 5), at.clone().multiply(M(0, 0.16, 0)), col("#fff2c0"));
  bins.metal.box(0.24, 0.04, 0.24, at.clone().multiply(M(0, 0.32, 0)), col("#2b2f33"));
  bins.metal.add(cylGeo(0.01, 0.01, 0.2, 4), at.clone().multiply(M(0, 0.44, 0)), col("#2b2f33"));
}
// ---------- piles, decks, rope rails
export function addRope(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, sag = 0.12, r = 0.022) {
  // 3-sided smooth tube, 6 segments (a 3 cm rope; 4 × 8 would put ~60 k tris of rail rope into Stilt Town)
  bins.rope.add(tubeGeo(catenary(a, b, sag, 6), r, 3, false, 6), null, col(ROPE));
}
/** rope railing along a segment (world points at deck height) */
export function addRopeRail(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, rng: () => number) {
  const len = a.distanceTo(b), n = Math.max(1, Math.round(len / 2.2));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const p = new THREE.Vector3().lerpVectors(a, b, i / n); pts.push(p);
    // chunky rail posts (the piles carry on up through the deck as round posts) with a rope lashing
    bins.wood.add(cylGeo(0.1, 0.12, 1.15, 9), M(p.x, p.y + 0.55, p.z, 0, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05), col("#8e7760", 0.9 + rng() * 0.2), (x, y, z, b2, o) => { if (y > p.y + 0.6) o.lerp(new THREE.Color("#b8ab98"), 0.3); });
    bins.wood.add(latheGeo([[0, 0.05], [0.07, 0.045], [0.1, 0]], 9), M(p.x, p.y + 1.12, p.z), col("#7a5a3a"));
    addLashing(bins, p.x, p.y + 0.82, p.z, 0.1, col(ROPE, 0.95));
  }
  for (let i = 0; i < n; i++) {
    addRope(bins, pts[i].clone().add(new THREE.Vector3(0, 0.95, 0)), pts[i + 1].clone().add(new THREE.Vector3(0, 0.95, 0)), 0.14, 0.032);
    addRope(bins, pts[i].clone().add(new THREE.Vector3(0, 0.5, 0)), pts[i + 1].clone().add(new THREE.Vector3(0, 0.5, 0)), 0.1, 0.026);
  }
}
/** plank deck on piles with joists + X braces. bottom = seabed y at each pile (fn) */
export function addDeck(bins: TownBins, k: Deck, bottomAt: (x: number, z: number) => number, rng: () => number, o: { piles?: boolean; planksAlongX?: boolean; brace?: boolean } = {}) {
  const base = new THREE.Matrix4().makeRotationY(k.yaw).setPosition(k.x, 0, k.z);
  const L = (lx: number, ly: number, lz: number, yaw = 0, pitch = 0, roll = 0) => base.clone().multiply(M(lx, ly, lz, yaw, pitch, roll));
  const alongX = o.planksAlongX ?? (k.w >= k.d);
  // (the planks fill the deck edge to edge, matching the collider)
  const gap = 0.015, span = alongX ? k.d : k.w;
  const n = Math.max(1, Math.round(span / 0.235)), pw = span / n - gap;
  const start = -span / 2 + (pw + gap) / 2;
  for (let i = 0; i < n; i++) {
    const c = start + i * (pw + gap), tone = 0.86 + rng() * 0.28;
    const pc = new THREE.Color("#a67c4e").multiplyScalar(tone);
    if (alongX) bins.woodDark.box(k.w, 0.05, pw, L(0, k.y - 0.025, c), pc, [rng() * 4, 0]);
    // (no extra quarter turn — it would lay every plank of a deeper-than-wide deck along x on one strip, leaving
    //  bare joists over the water)
    else bins.woodDark.box(pw, 0.05, k.d, L(c, k.y - 0.025, 0), pc, [rng() * 4, 0]);
  }
  // joists (perpendicular to planks) + bearers
  const jn = Math.max(2, Math.round((alongX ? k.w : k.d) / 1.2));
  for (let i = 0; i <= jn; i++) {
    const c = -(alongX ? k.w : k.d) / 2 + 0.1 + ((alongX ? k.w : k.d) - 0.2) * i / jn;
    if (alongX) bins.woodDark.box(0.12, 0.2, k.d, L(c, k.y - 0.15, 0), col("#6e4f30"));
    else bins.woodDark.box(k.w, 0.2, 0.12, L(0, k.y - 0.15, c), col("#6e4f30"));
  }
  for (const s of [-1, 1]) { if (alongX) bins.woodDark.box(k.w + 0.1, 0.18, 0.14, L(0, k.y - 0.34, s * (k.d / 2 - 0.2)), col("#6e4f30")); else bins.woodDark.box(0.14, 0.18, k.d + 0.1, L(s * (k.w / 2 - 0.2), k.y - 0.34, 0), col("#6e4f30")); }
  if (o.piles !== false) {
    // fewer, chunkier piles (a grid every 2.4 m reads as a black comb): perimeter every ~3.2 m, the interior on a
    // checkerboard, each a little out of line
    // (the grid comes from shared town-kit deckPiles — the same piles collide)
    const nx = Math.max(2, Math.round(k.w / 3.2)), nz = Math.max(2, Math.round(k.d / 3.2));
    const pts: Array<[number, number]> = [];
    for (const q of deckPiles(k)) {
      const lx = q.lx + (rng() - 0.5) * 0.12, lz = q.lz + (rng() - 0.5) * 0.12;
      const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(base);
      pts.push([p.x, p.z]);
      if (q.skip) continue;
      const bottom = bottomAt(p.x, p.z) - 0.6;
      addPile(bins, p.x, p.z, k.y - 0.25 + (rng() - 0.5) * 0.06, bottom, 0.17 + rng() * 0.04, rng);
    }
    // X braces between neighbouring piles along the long edges (only where the drop is big enough)
    if (o.brace !== false && k.y - Math.max(bottomAt(k.x, k.z), 0) > 1.6) {
      const edge = (i: number, j: number) => pts[i * (nz + 1) + j];
      // braces on alternate bays only (every bay X-braced read as scaffolding)
      for (let i = 0; i < nx; i++) for (const j of [0, nz]) {
        if ((i + (j ? 1 : 0)) % 2) continue;
        const a = edge(i, j), b = edge(i + 1, j);
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
        const yb = Math.max(0.2, bottomAt(mx, mz) + 0.8), yt = k.y - 0.5, l = Math.hypot(len, yt - yb), ang = Math.atan2(yt - yb, len);
        bins.woodDark.box(l, 0.09, 0.09, M(mx, (yb + yt) / 2, mz, yaw, 0, ang), col("#7d5c3a"));
        bins.woodDark.box(l, 0.09, 0.09, M(mx, (yb + yt) / 2, mz, yaw, 0, -ang), col("#7d5c3a"));
      }
    }
  }
  // rails from the shared rail runs (gaps where plank links / stairs meet the deck — the same runs the colliders use)
  for (const s of deckSides(k)) for (const [u0, u1] of railRuns(k, s)) {
    const A = sidePoint(k, s, u0 + 0.03, 0.06), B = sidePoint(k, s, u1 - 0.03, 0.06);
    const a = new THREE.Vector3(A[0], k.y, A[1]).applyMatrix4(base), b = new THREE.Vector3(B[0], k.y, B[1]).applyMatrix4(base);
    addRopeRail(bins, a, b, rng);
  }
}


// ---------- tiki bar, rocks
export function addTikiBar(bins: TownBins, at: THREE.Matrix4, R = 3.2, rng: () => number = Math.random) {
  const posts = 6, ph = 2.6;
  for (let i = 0; i < posts; i++) {
    const a = i * Math.PI * 2 / posts;
    bins.woodDark.add(cylGeo(0.1, 0.12, ph, 8), at.clone().multiply(M(Math.cos(a) * (R - 0.5), ph / 2, Math.sin(a) * (R - 0.5))), col(DARK));
  }
  // thatch roof: layered cone (lathe) with ragged rings
  const prof: Array<[number, number]> = [[0.35, ph + 1.9], [0.7, ph + 1.75]];
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const t0 = i / layers, t1 = (i + 1) / layers;
    const r0 = 0.7 + (R + 0.5 - 0.7) * t0, r1 = 0.7 + (R + 0.5 - 0.7) * t1, y0 = ph + 1.75 - 1.75 * t0, y1 = ph + 1.75 - 1.75 * t1;
    prof.push([r0 + 0.05, y0 - 0.02], [r1 + 0.12, y1 - 0.1], [r1 + 0.02, y1 - 0.16]);
  }
  prof.push([R + 0.45, ph - 0.1], [R + 0.2, ph - 0.05], [0.7, ph + 1.5], [0.35, ph + 1.7]);
  bins.thatch.add(latheGeo(prof, 36), at, col("#d9b56a"), (x, y, z, b, o) => { const k = 0.85 + 0.15 * Math.sin(x * 3.1 + z * 2.7); o.multiplyScalar(k); if (y < at.elements[13] + ph + 0.3) o.multiplyScalar(0.8); });
  bins.woodDark.add(cylGeo(0.12, 0.12, 0.6, 8), at.clone().multiply(M(0, ph + 1.9, 0)), col(DARK));
  bins.metal.add(cylGeo(0.18, 0.16, 0.35, 10), at.clone().multiply(M(0, ph + 2.3, 0)), col("#3e6b45"));
  // counter ring (green panels) with a cream top
  bins.clapboard.add(latheGeo([[R - 1.3, 0], [R - 1.3, 1.05], [R - 1.0, 1.05], [R - 1.0, 0]], 32), at, col("#4c8a5a"));
  bins.stone.add(latheGeo([[R - 1.45, 1.05], [R - 1.45, 1.12], [R - 0.85, 1.12], [R - 0.85, 1.05]], 32), at, col("#e9dcc1"));
  // inside: back shelf with bottles, blender box
  bins.woodDark.box(1.6, 0.05, 0.3, at.clone().multiply(M(0, 1.5, -R + 1.9)), col(DARK));
  for (let i = 0; i < 6; i++) bins.glass.add(cylGeo(0.04, 0.05, 0.28, 8), at.clone().multiply(M(-0.65 + i * 0.26, 1.66, -R + 1.9)), col(["#3fb37a", "#d9903a", "#c94b3f", "#59a6d1"][i % 4]));
  // stools around the counter
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 9 + 0.2;
    addStool(bins, at.clone().multiply(M(Math.cos(a) * (R - 0.35), 0, Math.sin(a) * (R - 0.35))));
  }
  // lanterns under the eave
  for (let i = 0; i < 3; i++) { const a = i * 2.1; addLantern(bins, at.clone().multiply(M(Math.cos(a) * (R - 0.6), ph - 0.6, Math.sin(a) * (R - 0.6)))); }
  // sign board "THE FEED" hung from the eave is added by the POI (needs the sign material)
  void rng;
}
export { leafGeo, quadGeo, boxGeo };

/** asset lab (see town-lab.ts): the generic prop set */
export function lab(env: import("./town-lab").LabEnv) {
  const { bins, at, rng } = env;
  addStall(bins, at(-6, 0, 0), 1, rng);
  addScooter(bins, at(-2, 0, 3, 0.4), "#f2c132");
  addFruitCrate(bins, at(0, 0, 0), "#2f8f86", "mango", rng);
  addFruitCrate(bins, at(0.8, 0, 0.2), "#c85a3a", "banana", rng);
  addBarrel(bins, at(2, 0, 0), "#2fb3a8", true);
  addLampPost(bins, at(4, 0, -2));
  addBench(bins, at(3, 0, 3));
  addUmbrella(bins, at(-4, 0, -5), 4, 0, 1.45, 2.5);
  addLounger(bins, at(-2, 0, -5));
  labBevelTest(env);
}
export function labBevelTest(env: import("./town-lab").LabEnv) {
  env.bins.wood.bbox(1, 1, 1, env.at(6, 0.5, 4), col("#b98b58"), 0.08);
  env.bins.plaster.bbox(2, 0.5, 0.6, env.at(8, 0.25, 4, 0.5), col("#f2c132"), 0.05);
}
