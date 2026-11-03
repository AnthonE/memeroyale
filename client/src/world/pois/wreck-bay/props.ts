// WRECK BAY props: hand-built pirate cargo — plank crates with chamfered frames, iron corner brackets, rope
// handles, a painted mark and sun / salt wear; coopered casks (bulging staves, iron hoops, a lid of boards, a bung);
// a log-cabin bonfire with charred logs and a stone ring. Every piece is chamfered (bbox) so edges catch the light.
import * as THREE from "three";
import { M, latheGeo, tubeGeo, noise3, type ColorFn } from "../_kit/town-geo";
import type { TownBins } from "../_kit/town-materials";

const IRON = "#3b3430", RUST = new THREE.Color("#7a4426"), DIRT = new THREE.Color("#4a3a28"), SALT = new THREE.Color("#d8d2c4");
/** sun-bleached / salt-crusted / dirty wood: lighter on the up faces, dirt at the foot, a wet tide line */
const wear = (y0: number, k = 1): ColorFn => (x, y, z, _b, o) => {
  const n = noise3(x * 2.1, y * 2.1, z * 2.1);
  o.multiplyScalar(0.86 + 0.26 * n);
  if (y < y0 + 0.18) o.lerp(DIRT, 0.35 * k * (1 - (y - y0) / 0.18));
  if (n > 0.72) o.lerp(SALT, 0.25 * k);
};
const rust: ColorFn = (x, y, z, _b, o) => { const n = noise3(x * 6, y * 6, z * 6); if (n > 0.55) o.lerp(RUST, (n - 0.55) * 1.6); };

export const CRATE_TONES = ["#b08a5a", "#9c7448", "#c4a476", "#8a6a4a"] as const;
/** a plank crate standing on `at` (its base centre): w × h × d */
export function pirateCrate(B: TownBins, at: THREE.Matrix4, w: number, h: number, d: number, rng: () => number, tone: string = CRATE_TONES[0], mark = true) {
  const y0 = at.elements[13], f = wear(y0);
  const c = new THREE.Color(tone), dark = c.clone().multiplyScalar(0.55);
  const P = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) => at.clone().multiply(M(x, y, z, yaw, pitch, roll));
  // the dark core (seen in the gaps between the boards)
  B.woodDark.box(w - 0.07, h - 0.05, d - 0.07, P(0, h / 2, 0), dark);
  // boards: horizontal on the 4 sides, across on the lid; each its own tint + a hair of jitter
  const nb = Math.max(2, Math.round((h - 0.12) / 0.19)), bh = (h - 0.12) / nb;
  for (const [sx, sz, len, yaw] of [[0, 1, w, 0], [0, -1, w, 0], [1, 0, d, Math.PI / 2], [-1, 0, d, Math.PI / 2]] as Array<[number, number, number, number]>) {
    const off = (sx ? w : d) / 2 - 0.03;
    for (let i = 0; i < nb; i++) {
      const t = c.clone().multiplyScalar(0.84 + rng() * 0.3);
      B.wood.bbox(len - 0.14, bh - 0.025, 0.035, P(sx * off, 0.06 + bh * (i + 0.5), sz * off, yaw, 0, (rng() - 0.5) * 0.015), t, 0.008, f, [rng() * 2, rng() * 2]);
    }
  }
  const nl = Math.max(2, Math.round((w - 0.1) / 0.17)), lw = (w - 0.1) / nl;
  for (let i = 0; i < nl; i++) B.wood.bbox(lw - 0.022, 0.035, d - 0.1, P(-w / 2 + 0.05 + lw * (i + 0.5), h - 0.02, 0), c.clone().multiplyScalar(0.92 + rng() * 0.25), 0.008, f, [rng() * 2, 0]);
  // the frame: corner posts + top / bottom rails, proud of the boards
  const fc = c.clone().multiplyScalar(0.72);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.wood.bbox(0.085, h, 0.085, P(sx * (w / 2 - 0.04), h / 2, sz * (d / 2 - 0.04)), fc, 0.012, f);
  for (const yy of [0.045, h - 0.06]) {
    for (const sz of [-1, 1]) B.wood.bbox(w - 0.06, 0.08, 0.05, P(0, yy, sz * (d / 2 - 0.005)), fc, 0.01, f);
    for (const sx of [-1, 1]) B.wood.bbox(0.05, 0.08, d - 0.06, P(sx * (w / 2 - 0.005), yy, 0), fc, 0.01, f);
  }
  // a diagonal brace on the long faces
  const dl = Math.hypot(w - 0.16, h - 0.16), da = Math.atan2(h - 0.16, w - 0.16);
  for (const sz of [-1, 1]) B.wood.bbox(dl, 0.075, 0.04, P(0, h / 2, sz * (d / 2 + 0.005), 0, 0, sz * da * (rng() < 0.5 ? 1 : -1)), fc, 0.01, f);
  // iron corner brackets (an L of two plates on every vertical edge, top and bottom) + their rivets
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const yy of [0.1, h - 0.1]) {
    B.metal.box(0.16, 0.13, 0.012, P(sx * (w / 2 - 0.07), yy, sz * (d / 2 + 0.03)), IRON, [0, 0], rust);
    B.metal.box(0.012, 0.13, 0.16, P(sx * (w / 2 + 0.03), yy, sz * (d / 2 - 0.07)), IRON, [0, 0], rust);
  }
  // rope handles on the short faces
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 + 0.04), y = h * 0.62;
    const pts = [new THREE.Vector3(x, y, -0.13), new THREE.Vector3(x + sx * 0.05, y - 0.09, -0.07), new THREE.Vector3(x + sx * 0.05, y - 0.11, 0.07), new THREE.Vector3(x, y, 0.13)].map((p) => p.applyMatrix4(at));
    B.rope.add(tubeGeo(pts, 0.018, 5, false, 8), null, "#b89f6c");
  }
  // a painted cargo mark on one face: a red cross-bones X or a banana-yellow band
  if (mark) {
    const red = rng() < 0.5, mc = red ? "#8e2a1c" : "#e2b23a";
    if (red) for (const s of [-1, 1]) B.plastic.box(Math.min(w, h) * 0.55, 0.05, 0.004, P(w * 0.08, h * 0.5, d / 2 + 0.032, 0, 0, s * 0.8), mc);
    else B.plastic.box(w * 0.6, 0.09, 0.004, P(0, h * 0.55, -d / 2 - 0.032), mc);
  }
}

/** a coopered cask standing on `at`: radius r (belly), height h; `side` lays it on its side (rolled cargo) */
export function cask(B: TownBins, at: THREE.Matrix4, r: number, h: number, rng: () => number, tone = "#8a5a32") {
  const m = at;
  const prof: Array<[number, number]> = [[0, 0.02], [r * 0.8, 0.02], [r * 0.82, 0], [r * 0.93, h * 0.2], [r, h * 0.5], [r * 0.93, h * 0.8], [r * 0.82, h], [r * 0.8, h - 0.02], [0, h - 0.02]];
  const g = latheGeo(prof, 20);
  const cx = m.elements[12], cz = m.elements[14], y0 = m.elements[13], seed = rng() * 10;
  // staves: alternate shades + a dark joint between them, dirt at the chime
  const staves: ColorFn = (x, y, z, _b, o) => {
    const a = Math.atan2(z - cz, x - cx), s = ((a + Math.PI) / (Math.PI * 2)) * 18 + seed, fr = s - Math.floor(s);
    o.multiplyScalar(fr < 0.06 || fr > 0.94 ? 0.5 : 0.82 + 0.3 * noise3(Math.floor(s) * 3.1, y * 0.5, 1.7));
    if (y < y0 + 0.12) o.lerp(DIRT, 0.4);
  };
  B.wood.add(g, m, tone, staves);
  // the head: boards (two tones) under the chime
  for (let i = -2; i <= 2; i++) B.woodDark.box(r * 0.3, 0.02, Math.sqrt(Math.max(0.01, (r * 0.8) ** 2 - (i * r * 0.3) ** 2)) * 2, m.clone().multiply(M(i * r * 0.31, h - 0.035, 0)), new THREE.Color(tone).multiplyScalar(0.7 + 0.15 * (i & 1)));
  // iron hoops (a torus each, rust-spotted)
  for (const t of [0.08, 0.27, 0.73, 0.92]) {
    const rr = t < 0.5 ? r * (0.84 + (t - 0.08) / 0.42 * 0.16) : r * (0.84 + (0.92 - t) / 0.42 * 0.16);
    B.metal.add(new THREE.TorusGeometry(rr + 0.006, 0.013, 4, 22), m.clone().multiply(M(0, h * t, 0, 0, Math.PI / 2)), IRON, rust);
  }
  // the bung on the belly
  B.woodDark.add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), m.clone().multiply(M(r, h * 0.5, 0, 0, 0, Math.PI / 2)), "#3a2a1a");
}

/** a bonfire on `at` (ground centre): a stone ring, charred log cabin + leaning logs, ash and embers */
export function bonfire(B: TownBins, at: THREE.Matrix4, r: number, rng: () => number) {
  const P = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) => at.clone().multiply(M(x, y, z, yaw, pitch, roll));
  // ring stones: 13 chunky river stones, two courses (r ≤ 0.7: the caller draws its own ring)
  const n = r > 0.7 ? 13 : 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.2, s = 0.17 + rng() * 0.08;
    B.rock.bbox(s * 1.6, s * 1.1, s * 1.3, P(Math.cos(a) * r, s * 0.45, Math.sin(a) * r, -a + (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3), new THREE.Color("#8d8478").multiplyScalar(0.8 + rng() * 0.35), 0.05);
    if (i % 2) B.rock.bbox(s * 1.2, s * 0.8, s, P(Math.cos(a + 0.2) * (r - 0.05), s * 1.0 + 0.08, Math.sin(a + 0.2) * (r - 0.05), -a, 0.2, 0.1), new THREE.Color("#9a9184").multiplyScalar(0.85 + rng() * 0.3), 0.04);
  }
  // ash bed
  B.woodDark.add(new THREE.CylinderGeometry(Math.max(r, 0.9) * 0.8, Math.max(r, 0.9) * 0.85, 0.06, 16), P(0, 0.02, 0), "#2e2824");
  // log cabin (charred at the core) + leaning teepee logs
  const char: ColorFn = (x, y, z, _b, o) => { const d = Math.hypot(x - at.elements[12], z - at.elements[14]); o.lerp(new THREE.Color("#1c1612"), Math.max(0, 0.85 - d * 1.2)); };
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
    const yaw = k % 2 ? Math.PI / 2 : 0, o = 0.32 - k * 0.04;
    B.wood.add(new THREE.CylinderGeometry(0.07, 0.08, 0.95 - k * 0.12, 7), P(k % 2 ? 0 : s * o, 0.08 + k * 0.13, k % 2 ? s * o : 0, yaw, 0, Math.PI / 2), "#6a4a30", char);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng() * 0.3, L = 1.0 + rng() * 0.25;
    const base = new THREE.Vector3(Math.cos(a) * 0.55, 0.04, Math.sin(a) * 0.55).applyMatrix4(at), top = new THREE.Vector3(Math.cos(a + 0.4) * 0.06, L * 0.82, Math.sin(a + 0.4) * 0.06).applyMatrix4(at);
    B.wood.add(tubeGeo([base, top], 0.05 + rng() * 0.02, 6, false, 2), null, "#7a5636", char);
  }
}
