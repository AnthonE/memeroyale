// Training toys on the upper beach: trampoline (blue pad ring, black mat, springs, W-legs on the slope), punching bag
// on a timber gallows (chain, swivel ring, red/black leather bag, round base), target dummies (log-barrel body with a
// painted spiral face, iron hoops, splayed legs, stubby arms), beach volleyball net (poles, cutout mesh, guy ropes).
// Every piece is grounded on the LIVE terrain (the beach slopes ~6° here).
import * as THREE from "three";
import { DIM, type LobbyItem } from "../../../../../shared/pois/lobby-islet";
import { M, cbox, cyl, lathe, tube, grid, remapUV } from "./kit";
import { type LK, itemM, groundAt, WOOD, TINT, ropeWrap, ropeAlong, ropeSpan } from "./lk";

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------------ trampoline
export function buildTramp(k: LK, it: LobbyItem) {
  const R = it.s ?? 1.75, top = DIM.tramp.top;
  const base = itemM(it);
  const g0 = base.elements[13];
  const at = (m: THREE.Matrix4) => mul(base, m);
  const steel = k.at.A.uv("metal"), pm = k.at.A.uv("paintMetal");
  const fy = top - 0.07;                                              // frame tube height
  // frame ring (galvanised tube)
  const ring = new THREE.EllipseCurve(0, 0, R, R, 0, Math.PI * 2, false, 0);
  const pts = ring.getPoints(72).map((p) => V(p.x, fy, p.y));
  ropeLess(k, new THREE.CatmullRomCurve3(pts, true), 0.03, at(new THREE.Matrix4()), steel, "#b9bec4", 8);
  // springs: small helices from the frame to the mat edge (visible under the pad)
  const mR = R * 0.8, nS = 44;
  for (let i = 0; i < nS; i++) {
    const t = (i / nS) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const a = V(c * (R - 0.03), fy + 0.005, s * (R - 0.03)), b = V(c * (mR + 0.02), fy - 0.03, s * (mR + 0.02));
    const hp: THREE.Vector3[] = [];
    const dir = b.clone().sub(a), len = dir.length(); dir.normalize();
    const side = V(-s, 0, c), up = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let j = 0; j <= 40; j++) { const u = j / 40, ang = u * Math.PI * 2 * 9; hp.push(a.clone().addScaledVector(dir, u * len).addScaledVector(side, Math.cos(ang) * 0.016).addScaledVector(up, Math.sin(ang) * 0.016)); }
    k.b.add("A", tube(new THREE.CatmullRomCurve3(hp), 60, 0.0035, 4, { rect: steel }), at(new THREE.Matrix4()), "#9aa0a6");
  }
  // mat: black woven disc with a slight sag + stitched ring (atlas "mat" is a 3.4 m square)
  {
    // profile runs rim → centre so the lathe normals face up; the mat sags 7 cm toward the middle
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i++) { const u = i / 10; prof.push([Math.max(0.001, mR * (1 - u)), fy - 0.04 - 0.07 * Math.sin((Math.PI / 2) * u)]); }
    const g = lathe(prof, 48, { rect: k.at.B.uv("mat"), u: "around", fit: "both" }, 1.2);
    // planar uv (top view) so the woven pattern + stitched ring (painted at 1.56 of 1.7 m) sit 12 cm inside the rim
    planarUV(g, k.at.B.uv("mat"), (mR - 0.12) / 0.918);
    k.b.add("B", g, at(new THREE.Matrix4()), "#ffffff");
  }
  // blue safety pad: a fat rounded ring covering frame + springs, with a skirt that drops over the frame
  {
    const i0 = mR - 0.04, o0 = R + 0.07, th = 0.075, drop = 0.14;
    const prof: Array<[number, number]> = [
      [i0, fy + 0.005], [i0 + 0.03, fy + th * 0.8], [i0 + 0.09, fy + th], [o0 - 0.08, fy + th], [o0 - 0.02, fy + th * 0.7],
      [o0, fy + th * 0.2], [o0 + 0.005, fy - drop], [o0 - 0.03, fy - drop - 0.02],
    ];
    // 12 arc panels (each ~1 m of circumference = the atlas pad region; a full turn would squeeze 11 m into it)
    prof.reverse();                                                   // outer skirt → inner edge (normals out/up)
    const arc = (Math.PI * 2) / 12;
    for (let i = 0; i < 12; i++) k.b.add("B", lathe(prof, 6, { rect: k.at.B.uv("pad"), u: "around", arc, phase: i * arc, off: [k.r() * 0.05, 0] }, 0.7), at(new THREE.Matrix4()), i % 2 ? "#ffffff" : "#f2f4ff");
  }
  // W-legs: 6 legs, each two angled tubes from the frame down to a foot bar resting on the (sloping) sand
  const nL = 6;
  for (let i = 0; i < nL; i++) {
    const t = (i / nL) * Math.PI * 2 + 0.26;
    for (const sgn of [-1, 1]) {
      const tt = t + sgn * 0.11;
      const topP = V(Math.cos(tt) * R, fy - 0.02, Math.sin(tt) * R);
      const footP = V(Math.cos(t + sgn * 0.2) * (R + 0.06), 0, Math.sin(t + sgn * 0.2) * (R + 0.06));
      footP.y = groundAt(k, it, footP.x, footP.z) - g0 - 0.03;          // item-local ground under the foot
      ropeLess(k, new THREE.LineCurve3(topP, footP), 0.022, at(new THREE.Matrix4()), pm, "#8d949b", 8);
    }
    // foot bar
    const fa = V(Math.cos(t - 0.2) * (R + 0.06), 0, Math.sin(t - 0.2) * (R + 0.06)), fb = V(Math.cos(t + 0.2) * (R + 0.06), 0, Math.sin(t + 0.2) * (R + 0.06));
    fa.y = groundAt(k, it, fa.x, fa.z) - g0 + 0.01; fb.y = groundAt(k, it, fb.x, fb.z) - g0 + 0.01;
    ropeLess(k, new THREE.LineCurve3(fa, fb), 0.024, at(new THREE.Matrix4()), pm, "#7d848b", 8);
  }
}

/** straight/curved steel tube (reuses the tube builder with a metal rect) */
function ropeLess(k: LK, c: THREE.Curve<THREE.Vector3>, r: number, m: THREE.Matrix4, rect: ReturnType<LK["at"]["A"]["uv"]>, tint: string, radial = 8) {
  const len = c.getLength();
  k.b.add("A", tube(c, Math.max(2, Math.ceil(len / 0.25)), r, radial, { rect, aroundM: Math.min(rect.mv, Math.PI * 2 * r) }), m, tint);
}

/** top-view planar uv (centred) into a rect: `half` metres from the centre map to the rect's half-size */
function planarUV(g: THREE.BufferGeometry, rect: ReturnType<LK["at"]["B"]["uv"]>, half: number) {
  const p = g.attributes.position.array as Float32Array, uv = g.attributes.uv.array as Float32Array;
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
    const u = 0.5 + p[i] / (2 * half), v = 0.5 - p[i + 2] / (2 * half);
    uv[j] = rect.u0 + u * (rect.u1 - rect.u0); uv[j + 1] = rect.v0 + v * (rect.v1 - rect.v0);
  }
}

// ------------------------------------------------------------------------------------------------ gallows + bag
export function buildGallows(k: LK, it: LobbyItem) {
  const G = DIM.gallows;
  const base = itemM(it);
  const g0 = base.elements[13];
  const at = (m: THREE.Matrix4) => mul(base, m);
  const gd = k.at.A.uv("grainDark"), gw = k.at.A.uv("grainWarm"), eg = k.at.A.uv("endgrain"), steel = k.at.A.uv("metal");
  const postGy = groundAt(k, it, 0, 0) - g0;
  // heavy timber post, sunk 0.5 m into the sand
  const PH = G.postH - postGy + 0.5;
  k.b.add("A", cbox(0.3, PH, 0.3, 0.035, { grain: 1, rect: gd, end: eg, off: [k.r(), k.r() * 0.4] }), at(M(0, postGy - 0.5 + PH / 2, 0, 0, 0.04, 0)), "#9a6e4a");
  // arm (+x) with an end cap overhang behind the post
  const armY = G.postH - 0.16;
  k.b.add("A", cbox(G.beam + 0.62, 0.26, 0.24, 0.03, { grain: 0, rect: gd, end: eg, off: [k.r(), k.r() * 0.4] }), at(M(G.beam / 2 + 0.12, armY, 0)), "#8e6442");
  // knee brace
  const bl = 0.95;
  k.b.add("A", cbox(bl, 0.14, 0.12, 0.018, { grain: 0, rect: gd, end: eg, off: [k.r(), 0] }), at(M(0.33, armY - 0.36, 0, 0, 0, Math.PI / 4)), "#7a5438");
  // iron straps + bolts at the joint
  for (const [x, y] of [[0, armY], [0.62, armY - 0.02]] as Array<[number, number]>) {
    k.b.add("A", cbox(0.05, 0.3, 0.26, 0.008, { grain: 1, rect: steel }), at(M(x + 0.16, y, 0)), TINT.iron);
    for (const z of [-0.13, 0.13]) k.b.add("A", cyl(0.018, 0.018, 0.02, 6, 0.004, { rect: steel, cap: steel }), at(M(x + 0.16, y + 0.08, z + Math.sign(z) * 0.005, Math.sign(z) * Math.PI / 2, 0, 0)), "#3a3633");
  }
  // rope lashing round the post foot + a sand mound collar
  ropeWrap(k, at(M(0, 0, 0, 0, 0, 0, [1.18, 1, 1.18])), 0.15, postGy + 0.05, 1.6, 0.024);
  // eye bolt + chain from the arm end down to a swivel ring
  const bx = G.beam, chainTop = armY - 0.13, ringY = G.bagY + G.bagH + 0.42;
  k.b.add("A", link(k, 0.035, 0.009), at(M(bx, chainTop - 0.02, 0, 0, 0, 0)), "#5a5652");
  chain(k, at(new THREE.Matrix4()), V(bx, chainTop - 0.06, 0), V(bx, ringY + 0.05, 0), 0.028);
  k.b.add("A", remapUV(new THREE.TorusGeometry(0.06, 0.011, 6, 14), steel, 0.2, 0.05), at(M(bx, ringY, 0, 0, 0, 0)), "#9aa0a6");
  // four short chains fanning to the bag's D-rings
  const bagTop = G.bagY + G.bagH;
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p = V(bx + Math.cos(t) * (G.bagR - 0.05), bagTop + 0.04, Math.sin(t) * (G.bagR - 0.05));
    chain(k, at(new THREE.Matrix4()), V(bx, ringY - 0.05, 0), p, 0.02);
    k.b.add("A", remapUV(new THREE.TorusGeometry(0.025, 0.006, 5, 10), steel, 0.1, 0.05), at(M(p.x, p.y, p.z, 0, -t, 0)), "#b0b4b8");
  }
  // the bag: rounded leather cylinder (leather atlas paints the red/black bands in metres from the bottom)
  {
    const r = G.bagR, h = G.bagH, prof: Array<[number, number]> = [];
    prof.push([0.001, 0], [r * 0.55, 0.004], [r * 0.86, 0.03], [r * 0.98, 0.08], [r, 0.14]);
    for (let i = 1; i <= 6; i++) prof.push([r * (1 + 0.012 * Math.sin((i / 6) * Math.PI)), 0.14 + (i / 6) * (h - 0.28)]);
    prof.push([r * 0.98, h - 0.08], [r * 0.86, h - 0.03], [r * 0.55, h - 0.004], [0.001, h]);
    const g = lathe(prof, 24, { rect: k.at.B.uv("leather"), u: "around" }, 0.9);
    k.b.add("B", g, at(M(bx, G.bagY, 0, 0, 0.3, 0)), "#ffffff");
    // steel top ring (a shiny collar)
    k.b.add("A", lathe([[r * 0.62, 0], [r * 0.7, 0.005], [r * 0.7, 0.03], [r * 0.6, 0.035]], 20, { rect: steel }, 0.5), at(M(bx, bagTop - 0.012, 0)), "#c9ccd0");
  }
  // round base plate under the bag: black rubber disc with a wooden rim
  {
    const bg = groundAt(k, it, bx, 0) - g0;
    k.b.add("A", cyl(0.62, 0.6, 0.09, 36, 0.02, { rect: gw, u: "around", cap: gd, capMetres: true, off: [k.r(), 0] }), at(M(bx, bg - 0.04, 0)), "#6b4a32");
    k.b.add("B", cyl(0.54, 0.52, 0.1, 36, 0.02, { rect: k.at.B.uv("mat"), cap: k.at.B.uv("mat"), capMetres: true }), at(M(bx, bg - 0.035, 0)), "#3a3a3e");
  }
}

function link(k: LK, r: number, tr: number) {
  const g = new THREE.TorusGeometry(r, tr, 5, 10);
  g.scale(1, 1.55, 1);
  return remapUV(g, k.at.A.uv("metal"), 0.12, 0.04);
}
/** chain of alternating links between two points (link length ~ 2.6 × r) */
function chain(k: LK, m: THREE.Matrix4, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const dir = b.clone().sub(a), len = dir.length(); dir.normalize();
  const n = Math.max(2, Math.round(len / (r * 2.3)));
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
  for (let i = 0; i < n; i++) {
    const p = a.clone().addScaledVector(dir, (i + 0.5) * (len / n));
    const qi = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), (i % 2) * Math.PI / 2));
    k.b.add("A", link(k, r * 0.62, r * 0.2), mul(m, new THREE.Matrix4().compose(p, qi, V(1, 1, 1))), i % 3 ? "#6e6a66" : "#827e79");
  }
}

// ------------------------------------------------------------------------------------------------ target dummy
export function buildDummy(k: LK, it: LobbyItem) {
  const D = DIM.dummy;
  const base = itemM(it);
  const g0 = base.elements[13];
  const at = (m: THREE.Matrix4) => mul(base, m);
  const gd = k.at.A.uv("grainDark"), gw = k.at.A.uv("grainWarm"), eg = k.at.A.uv("endgrain"), steel = k.at.A.uv("metal");
  const cy = D.cy + 0.12;
  // body: a stout log-barrel lying with its axis toward the camera (item +Z), bulged staves
  {
    const r = D.r, L = D.len, prof: Array<[number, number]> = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([r * (0.93 + 0.07 * Math.sin(Math.PI * t)), -L / 2 + t * L]); }
    const g = lathe(prof, 20, { rect: k.at.A.uv("barrel"), u: "around", off: [k.r() * 1.2, 0.2] }, 0.8);
    k.b.add("A", g, at(M(0, cy, 0, Math.PI / 2, 0, 0)), "#c79a70");
    // painted spiral face (front, +Z) and end-grain back
    const face = lathe([[r * 0.93, -0.012], [r * 0.93, 0], [0.001, 0]], 28, { rect: k.at.A.uv("target"), fit: "both" }, 2);
    planarXY(face, k.at.A.uv("target"), r * 0.93);
    k.b.add("A", face, at(M(0, cy, L / 2 + 0.006, Math.PI / 2, 0, 0)), "#ffffff");
    const back = lathe([[r * 0.93, -0.012], [r * 0.93, 0], [0.001, 0]], 20, { rect: eg, fit: "both" }, 2);
    k.b.add("A", back, at(M(0, cy, -L / 2 - 0.006, -Math.PI / 2, 0, 0)), "#b08a64");
    // iron hoops
    for (const z of [-L * 0.33, L * 0.33]) k.b.add("A", lathe([[r * 1.0, -0.025], [r * 1.02, -0.02], [r * 1.02, 0.02], [r * 1.0, 0.025]], 22, { rect: steel }, 0.5), at(M(0, cy, z, Math.PI / 2, 0, 0)), "#4a4642");
  }
  // splayed sawhorse legs (sideways) + a centre post, each grounded on the live sand
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = V(sx * 0.16, cy - D.r * 0.7, sz * 0.2);
    const foot = V(sx * 0.46, 0, sz * 0.3);
    foot.y = groundAt(k, it, foot.x, foot.z) - g0 - 0.06;
    const dir = foot.clone().sub(top), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir.clone().normalize());
    k.b.add("A", cbox(0.075, len, 0.075, 0.012, { grain: 1, rect: gd, end: eg, off: [k.r(), k.r() * 0.3] }), at(new THREE.Matrix4().compose(top.clone().add(foot).multiplyScalar(0.5), q, V(1, 1, 1))), "#8a6242");
  }
  for (const sz of [-1, 1]) k.b.add("A", cbox(0.66, 0.06, 0.05, 0.01, { grain: 0, rect: gd, end: eg, off: [k.r(), 0] }), at(M(0, cy * 0.42, sz * 0.25)), "#7a5438");
  // stubby arms with wooden "fists"
  for (const sx of [-1, 1]) {
    k.b.add("A", cyl(0.035, 0.03, 0.34, 8, 0.008, { rect: gw, u: "along", off: [k.r(), 0] }), at(M(sx * (D.r - 0.02), cy + 0.05, 0.05, 0, 0, -sx * (Math.PI / 2 - 0.35))), "#a57a52");
    const ball = remapUV(new THREE.SphereGeometry(0.1, 12, 9), gw, 0.6, 0.3);
    k.b.add("A", ball, at(M(sx * (D.r + 0.3), cy + 0.17, 0.05)), "#8e6442");
  }
  // a few splinters / bullet holes: small dark discs on the face
  for (let i = 0; i < 5; i++) {
    const a = k.r() * Math.PI * 2, rr = k.r() * D.r * 0.8;
    k.b.add("A", cyl(0.014, 0.014, 0.004, 6, 0, { rect: eg, cap: eg }), at(M(Math.cos(a) * rr, cy + Math.sin(a) * rr, D.len / 2 + 0.008, Math.PI / 2, 0, 0)), "#2a1a10");
  }
}
/** planar uv in the XZ plane of a flat lathe disc (before rotation): the rim radius maps to the painted target edge */
function planarXY(g: THREE.BufferGeometry, rect: ReturnType<LK["at"]["A"]["uv"]>, rim: number) {
  const p = g.attributes.position.array as Float32Array, uv = g.attributes.uv.array as Float32Array;
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
    const u = 0.5 + (p[i] / rim) * 0.47, v = 0.5 - (p[i + 2] / rim) * 0.47;
    uv[j] = rect.u0 + u * (rect.u1 - rect.u0); uv[j + 1] = rect.v0 + v * (rect.v1 - rect.v0);
  }
}

// ------------------------------------------------------------------------------------------------ volleyball net
export function buildNet(k: LK, it: LobbyItem) {
  const N = DIM.net, L = it.l ?? 7.6;
  const base = itemM(it);
  const g0 = base.elements[13];
  const at = (m: THREE.Matrix4) => mul(base, m);
  const gw = k.at.A.uv("grainWarm"), eg = k.at.A.uv("endgrain");
  const postTop: number[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * L / 2, gy = groundAt(k, it, x, 0) - g0;
    const h = N.postH - gy + 0.6;
    k.b.add("A", cyl(0.1, 0.085, h, 12, 0.02, { rect: gw, u: "along", cap: eg, off: [k.r(), k.r() * 0.3] }), at(M(x, gy - 0.6, 0, 0, k.r() * 6, 0)), "#b98a5e");
    postTop.push(N.postH);
    ropeWrap(k, at(M(x, 0, 0)), 0.09, gy + 0.05, 2.2, 0.022);
    ropeWrap(k, at(M(x, 0, 0)), 0.088, N.top - 0.12, 1.2, 0.02);
    // guy rope to a stake outside the court
    const stake = V(x + sx * 1.3, 0, 0.35 * sx);
    stake.y = groundAt(k, it, stake.x, stake.z) - g0;
    k.b.add("A", cbox(0.05, 0.4, 0.05, 0.01, { grain: 1, rect: k.at.A.uv("grainDark"), end: eg }), at(M(stake.x, stake.y + 0.1, stake.z, 0, 0, sx * 0.3)), WOOD.dark);
    const wa = V(x, N.postH - 0.1, 0), wb = V(stake.x - sx * 0.05, stake.y + 0.26, stake.z);
    const wm = new THREE.Vector3(); wa.applyMatrix4(base); wb.applyMatrix4(base); void wm;
    ropeSpan(k, wa, wb, 0.05, 0.012);
  }
  // net mesh in ≤1.9 m panels (atlas "net" region is 2 m wide; never stretch it), top band sags slightly
  const H = N.band, y0 = N.top - H, panels = Math.ceil((L - 0.2) / 1.9), pw = (L - 0.2) / panels;
  for (let p = 0; p < panels; p++) {
    const x0 = -L / 2 + 0.1 + p * pw;
    const g = grid(pw, H, 6, 3, k.at.B.uv("net"), (x, y, o) => {
      const gx = x0 + x, t = (gx + L / 2) / L, sag = 0.06 * Math.sin(Math.PI * t);
      o.set(gx, y0 + y - sag * (0.4 + 0.6 * (y / H)), Math.sin(gx * 3.1) * 0.012);
    }, [0, 0], "v");
    k.b.add("Bcut", g, at(new THREE.Matrix4()), "#ffffff");
  }
  // top cable + bottom cord (rope), tied to the poles
  const top: THREE.Vector3[] = [], bot: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, gx = -L / 2 + t * L, sag = 0.06 * Math.sin(Math.PI * t); top.push(V(gx, N.top + 0.01 - sag, 0).applyMatrix4(base)); bot.push(V(gx, y0 + 0.02 - sag * 0.4, 0).applyMatrix4(base)); }
  ropeAlong(k, new THREE.CatmullRomCurve3(top), 0.014);
  ropeAlong(k, new THREE.CatmullRomCurve3(bot), 0.01);
  // ball resting in the sand near a post
  const ballP = V(L / 2 - 0.9, 0, 0.8);
  ballP.y = groundAt(k, it, ballP.x, ballP.z) - g0 + 0.1;
  const ball = remapUV(new THREE.SphereGeometry(0.105, 16, 12), k.at.B.uv("fabric"), 0.3, 0.3);
  k.b.add("B", ball, at(M(ballP.x, ballP.y, ballP.z, 0.4, 0.7, 0)), "#f4e7c4");
}
