// Loose props: BANANA CO. crates (stencilled slat box + edge battens + X brace), barrels (bulged staves, iron hoops,
// stencil), open banana barrels heaped with hands, pallets, the blue-striped deck chair, the runway windsock.
import * as THREE from "three";
import { DIM, type LobbyItem } from "../../../../../shared/pois/lobby-islet";
import { M, cbox, cyl, lathe, tube, grid } from "./kit";
import { type LK, itemM, groundAt, WOOD, TINT, bananaHand, ropeWrap } from "./lk";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** item base matrix, sunk slightly so props never float on the sloping sand */
function seat(k: LK, it: LobbyItem, halfFoot: number, sink = 0.03): THREE.Matrix4 {
  const m = itemM(it);
  const g0 = m.elements[13];
  if (it.gy !== undefined) return m;                                  // explicit (deck) height
  let lo = Infinity;
  for (const [x, z] of [[0, 0], [halfFoot, halfFoot], [-halfFoot, halfFoot], [halfFoot, -halfFoot], [-halfFoot, -halfFoot]]) lo = Math.min(lo, groundAt(k, it, x, z));
  m.elements[13] = Math.min(g0, lo) - sink;
  return m;
}

// ------------------------------------------------------------------------------------------------ crate
export function buildCrate(k: LK, it: LobbyItem) {
  const s = it.s ?? 0.8;
  const base = mul(seat(k, it, s / 2, 0.02), M(0, 0, 0, 0, 0, 0, s));   // build a 1 m crate, scaled
  const at = (m: THREE.Matrix4) => mul(base, m);
  const crate = k.at.A.uv("crate"), gd = k.at.A.uv("grainDark"), eg = k.at.A.uv("endgrain"), steel = k.at.A.uv("metal");
  const tone = ["#e0b890", "#d2a67c", "#e8c49a", "#c99a70"][Math.floor(k.r() * 4)];
  // core box (slats + stencil on the 4 sides, slats on top)
  k.b.add("A", cbox(0.94, 0.94, 0.94, 0.02, { grain: 0, rect: crate, end: crate, endAxes: [2, 1], readable: true, skip: (1 << 2) | (1 << 3) }), at(M(0, 0.5, 0)), tone);
  for (let i = 0; i < 4; i++) k.b.add("A", cbox(0.9, 0.03, 0.215, 0.008, { grain: 0, rect: k.at.A.uv(`plank${Math.floor(k.r() * 8)}`), end: eg, off: [k.r() * 3, 0] }), at(M(0, 0.955, -0.34 + i * 0.227)), tone);
  // edge battens on all 12 edges
  const bt = 0.085, h = 0.5;
  for (const x of [-h + bt / 2, h - bt / 2]) for (const z of [-h + bt / 2, h - bt / 2]) k.b.add("A", cbox(bt, 1, bt, 0.012, { grain: 1, rect: gd, end: eg, off: [k.r(), k.r() * 0.4] }), at(M(x, 0.5, z)), WOOD.dark);
  for (const y of [bt / 2, 1 - bt / 2]) for (const z of [-h + bt / 2, h - bt / 2]) k.b.add("A", cbox(1 - bt * 2, bt, bt, 0.012, { grain: 0, rect: gd, end: eg, off: [k.r(), k.r() * 0.4] }), at(M(0, y, z)), WOOD.dark);
  for (const y of [bt / 2, 1 - bt / 2]) for (const x of [-h + bt / 2, h - bt / 2]) k.b.add("A", cbox(bt, bt, 1 - bt * 2, 0.012, { grain: 2, rect: gd, end: eg, off: [k.r(), k.r() * 0.4] }), at(M(x, y, 0)), WOOD.dark);
  // diagonal X brace on the two side faces (the front/back keep the stencil readable)
  const dl = Math.SQRT2 * (1 - bt * 2) * 0.98;
  for (const sx of [-1, 1]) k.b.add("A", cbox(0.03, 0.08, dl, 0.01, { grain: 2, rect: gd, end: eg, off: [k.r(), 0] }), at(M(sx * (h + 0.012), 0.5, 0, sx * Math.PI / 4, 0, 0)), WOOD.deep);
  // corner nails / iron corner caps
  for (const x of [-h, h]) for (const z of [-h, h]) k.b.add("A", cbox(0.1, 0.02, 0.1, 0.005, { grain: 0, rect: steel }), at(M(x * 0.93, 1.005, z * 0.93)), TINT.iron);
}

// ------------------------------------------------------------------------------------------------ barrel
export function barrelGeo(k: LK, r = 0.3, h = 0.94) {
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([r * (0.88 + 0.12 * Math.sin(Math.PI * t)), t * h]); }
  return lathe(prof, 22, { rect: k.at.A.uv("barrel"), u: "around", off: [k.r() * 0.9, 0], cap: k.at.A.uv("endgrain") }, 0.6);
}
export function buildBarrel(k: LK, it: LobbyItem, open = false) {
  const base = mul(seat(k, it, 0.28, 0.03), M(0, 0, 0, 0, k.r() * 6, 0));
  const at = (m: THREE.Matrix4) => mul(base, m);
  const r = 0.31, h = 0.94, steel = k.at.A.uv("metal");
  const tints = ["#e8c29a", "#d6ab82", "#c99870", "#e0b68c"];
  const g = barrelGeo(k, r, h);
  k.b.add("A", g, at(new THREE.Matrix4()), tints[(it.v ?? 0) % 4]);
  // hoops (dark iron, slight rust)
  for (const t of [0.07, 0.3, 0.7, 0.93]) {
    const rr = r * (0.88 + 0.12 * Math.sin(Math.PI * t)) + 0.006;
    k.b.add("A", lathe([[rr, -0.03], [rr + 0.008, -0.022], [rr + 0.008, 0.022], [rr, 0.03]], 22, { rect: steel }, 0.5), at(M(0, t * h, 0)), "#4d4744");
  }
  if (open) {
    // a heap of banana hands on top, bulging over the rim
    const top = mul(base, M(0, h - 0.06, 0));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + k.r() * 0.4, rr = i === 0 ? 0 : 0.14 + k.r() * 0.06;
      bananaHand(k, mul(top, M(Math.cos(a) * rr, 0.04 + (i === 0 ? 0.1 : 0.02 + k.r() * 0.05), Math.sin(a) * rr, 0, -a + Math.PI / 2, 0.35 + k.r() * 0.2)), 5, 0.2);
    }
  } else {
    // lid ring + bung
    k.b.add("A", cyl(0.03, 0.03, 0.012, 8, 0.004, { rect: k.at.A.uv("endgrain"), cap: k.at.A.uv("endgrain") }), at(M(r * 0.4, h, 0.05)), "#6a4a30");
  }
}

// ------------------------------------------------------------------------------------------------ pallet
export function buildPallet(k: LK, it: LobbyItem) {
  const base = seat(k, it, 1.0, 0.02);
  const at = (m: THREE.Matrix4) => mul(base, m);
  const gw = k.at.A.uv("grainWarm"), eg = k.at.A.uv("endgrain");
  for (let i = 0; i < 7; i++) k.b.add("A", cbox(2.3, 0.025, 0.14, 0.006, { grain: 0, rect: k.at.A.uv(`plank${Math.floor(k.r() * 8)}`), end: eg, off: [k.r() * 1.5, 0] }), at(M(0, 0.13, -0.52 + i * 0.173)), "#d9b48c");
  for (const z of [-0.5, 0, 0.5]) k.b.add("A", cbox(2.3, 0.1, 0.1, 0.01, { grain: 0, rect: gw, end: eg, off: [k.r(), k.r() * 0.3] }), at(M(0, 0.065, z)), "#b48a60");
  for (const z of [-0.52, 0.52]) k.b.add("A", cbox(2.3, 0.02, 0.12, 0.005, { grain: 0, rect: gw, end: eg, off: [k.r(), 0] }), at(M(0, 0.01, z)), "#a67c54");
}

// ------------------------------------------------------------------------------------------------ deck chair
/** classic folding deck chair: hardwood frame, blue-striped canvas sling, reclined toward item -Z (back), feet toward +Z */
export function buildChair(k: LK, it: LobbyItem) {
  const base = seat(k, it, 0.45, 0.04);
  const at = (m: THREE.Matrix4) => mul(base, m);
  const gw = k.at.A.uv("grainWarm"), eg = k.at.A.uv("endgrain");
  const W = DIM.chair.w, rail = (a: THREE.Vector3, b: THREE.Vector3, t = 0.045, w = 0.028) => {
    const d = b.clone().sub(a), len = d.length();
    const m = new THREE.Matrix4().lookAt(a, b, V(0, 1, 0)); m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    k.b.add("A", cbox(w, t, len, 0.008, { grain: 2, rect: gw, end: eg, off: [k.r(), k.r() * 0.3] }), at(m), "#c89a66");
  };
  // side view (+z = front / feet): backrest rails lean BACK from the seat to the headrest bar, seat rails run from
  // the front feet up under the backrest, a rear prop leg holds the backrest, arm rests on top
  for (const sx of [-1, 1]) {
    const x = sx * W / 2;
    rail(V(x, 0.02, -0.12), V(x, 1.0, -0.66));                          // backrest rail (leans back)
    rail(V(x + sx * 0.035, 0.02, 0.6), V(x + sx * 0.035, 0.5, -0.2));   // seat rail
    rail(V(x - sx * 0.035, 0.02, -0.82), V(x - sx * 0.035, 0.56, -0.4)); // rear prop leg
    rail(V(x + sx * 0.07, 0.56, 0.32), V(x + sx * 0.07, 0.6, -0.3), 0.03, 0.075); // arm rest
  }
  // cross bars (headrest, seat front, lower brace, rear foot)
  const TOP = V(0, 0.98, -0.65), FRONT = V(0, 0.46, 0.46);
  for (const [y, z] of [[TOP.y, TOP.z], [FRONT.y, FRONT.z], [0.14, 0.52], [0.06, -0.8]] as Array<[number, number]>) {
    k.b.add("A", cyl(0.022, 0.022, W + 0.1, 8, 0.004, { rect: gw, u: "along" }), at(M(-(W + 0.1) / 2, y, z, 0, 0, -Math.PI / 2)), "#b8895a");
  }
  // canvas sling from the front bar to the headrest bar, sagging down/back under the sitter
  const len = TOP.distanceTo(FRONT) + 0.12;
  const cv = k.at.B.uv("canvas");
  const sagDir = V(0, -0.9, -0.44).normalize();
  const g = grid(W - 0.02, len, 4, 12, cv, (x, y, o) => {
    const t = Math.min(1, y / (len - 0.12)), p = FRONT.clone().lerp(TOP, t);
    const sag = Math.sin(Math.PI * t) * 0.2 * (1 - 0.25 * Math.pow(Math.abs(x / ((W - 0.02) / 2) - 1), 2));
    o.set(x - (W - 0.02) / 2, p.y, p.z).addScaledVector(sagDir, sag);
  }, [0, 0], "u");
  k.b.add("Bcut", g, at(new THREE.Matrix4()), "#ffffff");
  // a towel draped over the top bar + a drink in the sand next to it
  const towel = grid(0.42, 0.75, 3, 6, k.at.B.uv("fabric"), (x, y, o) => { const t = y / 0.75; o.set(x - 0.21, 1.01 - Math.max(0, t - 0.3) * 1.15, -0.62 + Math.min(t, 0.3) * 0.25 - Math.max(0, t - 0.3) * 0.12); }, [0, 0], "both");
  k.b.add("Bcut", towel, at(M(0.1, 0, 0)), "#ff8a5a");
}

// ------------------------------------------------------------------------------------------------ windsock
export function buildWindsock(k: LK, it: LobbyItem) {
  const base = seat(k, it, 0.3, 0.1);
  const at = (m: THREE.Matrix4) => mul(base, m);
  const pm = k.at.A.uv("paintMetal"), steel = k.at.A.uv("metal");
  const H = 5.2;
  k.b.add("A", cyl(0.35, 0.3, 0.3, 12, 0.03, { rect: k.at.A.uv("paintMetal"), cap: pm }), at(M(0, 0, 0)), "#b8b2a6");   // concrete-ish plinth
  // pole in alternating orange / white bands
  const bands = 6;
  for (let i = 0; i < bands; i++) k.b.add("A", cyl(0.055, 0.05, H / bands, 10, i === 0 ? 0.008 : 0, { rect: pm, u: "along" }), at(M(0, 0.25 + (i * H) / bands, 0)), i % 2 ? "#f4efe6" : "#ff6a1c");
  // swivel ring + frame hoop
  const sy = H + 0.2, dirYaw = 1.1;                                   // wind from the sea: sock streams inland
  k.b.add("A", cyl(0.07, 0.07, 0.12, 10, 0.01, { rect: steel, cap: steel }), at(M(0, sy - 0.1, 0)), TINT.steel);
  const sock = mul(at(M(0, sy, 0, 0, dirYaw, 0)), M(0, 0, 0, 0, 0, 0));
  k.b.add("A", lathe([[0.34, -0.012], [0.35, 0], [0.34, 0.012]], 16, { rect: steel }, 1), mul(sock, M(0.1, 0, 0, 0, 0, Math.PI / 2)), TINT.steel);
  k.b.add("A", cyl(0.012, 0.012, 0.12, 5, 0, { rect: steel }), mul(sock, M(0, 0, 0, 0, 0, Math.PI / 2)), TINT.steel);
  // the sock: a tapering fabric tube drooping toward its tail
  const curve = new THREE.CatmullRomCurve3([V(0.1, 0, 0), V(0.8, -0.08, 0.02), V(1.5, -0.28, 0.05), V(2.1, -0.55, 0.1)]);
  k.b.add("B", tube(curve, 18, (t) => 0.34 * (1 - t * 0.55) * (1 - 0.06 * Math.sin(t * 20)), 12, { rect: k.at.B.uv("sock"), aroundM: 1, alongScale: 0.45 }), sock, "#ffffff");
  ropeWrap(k, at(M(0, 0, 0)), 0.056, 1.4, 1.2, 0.018);
}
