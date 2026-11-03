// THE MURK geometry helpers: tapered organic tubes (roots, limbs, logs), weathered log posts with a wet band at the
// swamp's water line, rope rails, soft tints for the photo-textured sets.
import * as THREE from "three";
import { M, col, cylGeo, catenary, noise3, tubeGeo, chamferBoxGeo, type ColorFn } from "../_kit/town-geo";
import type { TownBins } from "../_kit/town-materials";
import { addLashing } from "../_kit/town-lagoon";
import { WATER_Y } from "../../../../../shared/pois/the-murk";

export const ROPE = "#b89f6c";
/** a tint that keeps the photo texture's own colour: white → c by k */
export const soft = (c: string, k = 0.45, bright = 1.0) => new THREE.Color(1, 1, 1).lerp(new THREE.Color(c), k).multiplyScalar(bright);

const WET = new THREE.Color("#3a3024"), ALGAE = new THREE.Color("#4a5a2a"), MOSS = new THREE.Color("#5f7f2e");
/** wet / algae band at the swamp water line + moss flecks higher up (world y) */
export const swampFn = (seed = 0, mossAmt = 0.5): ColorFn => (x, y, z, b, o) => {
  const n = noise3(x * 2.1 + seed, y * 1.3, z * 2.1);
  if (y < WATER_Y + 0.02) o.lerp(y < WATER_Y - 0.3 ? WET : ALGAE, 0.75);
  else if (y < WATER_Y + 0.45) o.lerp(WET, 0.55 * (1 - (y - WATER_Y) / 0.45) + 0.1);
  if (y > WATER_Y + 0.5 && n > 0.62) o.lerp(MOSS, Math.min(1, (n - 0.62) * 4) * mossAmt);
};

/** a rough log post (bark set, pale debarked tint), from yBot to yTop, optional lashing near the top */
export function addPost(bins: TownBins, x: number, z: number, yTop: number, yBot: number, r: number, rng: () => number, lash = true, tint = "#c8b69a") {
  const h = yTop - yBot;
  if (h <= 0.05) return;
  const seed = rng() * 40;
  bins.thatch.add(cylGeo(r * 0.92, r, h, 9), M(x, yBot + h / 2, z, rng() * 6.3, (rng() - 0.5) * 0.03, (rng() - 0.5) * 0.03), soft(tint, 0.6, 0.95 + rng() * 0.12), swampFn(seed));
  bins.wood.add(cylGeo(r * 0.8, r * 0.92, 0.04, 9), M(x, yTop + 0.01, z), col("#8a7556"));
  if (lash) addLashing(bins, x, yTop - 0.36, z, r * 0.95, col(ROPE, 0.9 + rng() * 0.15));
}

/** rope rail: posts every ~2.2 m (1.1 m tall), two sagging ropes */
export function addRail(bins: TownBins, a: THREE.Vector3, b: THREE.Vector3, rng: () => number, post = true) {
  const len = a.distanceTo(b), n = Math.max(1, Math.round(len / 2.2));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const p = new THREE.Vector3().lerpVectors(a, b, i / n); pts.push(p);
    if (post) addPost(bins, p.x, p.z, p.y + 1.12, p.y - 0.25, 0.075, rng, true);
  }
  for (let i = 0; i < n; i++) {
    for (const [dy, sag, r] of [[1.0, 0.16, 0.03], [0.55, 0.12, 0.024]] as Array<[number, number, number]>) {
      bins.rope.add(tubeGeo(catenary(pts[i].clone().setY(pts[i].y + dy), pts[i + 1].clone().setY(pts[i + 1].y + dy), sag, 6), r, 4, false, 7), null, col(ROPE, 0.9 + rng() * 0.12));
    }
  }
}

/** tapered tube through points (Catmull-Rom), radius r0 → r1, bark UVs in metres (u around, v along), per-vertex
 *  lumps; `fn` colours per vertex (world coords) */
export function taperTube(pts: THREE.Vector3[], r0: number, r1: number, radial: number, perM = 2.2, lump = 0.12, seed = 0, caps = 0): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
  const L = curve.getLength(), segs = Math.max(3, Math.ceil(L * perM));
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const circ = Math.PI * (r0 + r1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    // flare at the start (roots leave the trunk wide), a gentle taper after
    const r = (r0 + (r1 - r0) * Math.pow(t, 0.8)) * (1 + 0.35 * Math.max(0, 1 - t * 6));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const N = frames.normals[i], B = frames.binormals[i];
      n.set(0, 0, 0).addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a));
      const k = 1 + lump * (noise3(p.x * 0.9 + seed + Math.cos(a) * 0.8, p.y * 0.9 + Math.sin(a) * 0.8, p.z * 0.9) - 0.5) * 2;
      pos.push(p.x + n.x * r * k, p.y + n.y * r * k, p.z + n.z * r * k);
      nor.push(n.x, n.y, n.z);
      uv.push((j / radial) * Math.max(1, Math.round(circ)), t * L);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    // (wound OUTWARD — wound inward against their outward normals, the front-side bark would show
    // every root's far inner wall (dark, "pinched" tips) and the parity tool's raycasts would hit the far side)
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // end caps (caps: 1 start, 2 end, 3 both): a slightly domed saw-cut / broken face closing the tube (a fallen
  // log's open end would show its hollow inside)
  for (const end of [0, 1]) {
    if (!(caps & (end ? 2 : 1))) continue;
    const i = end ? segs : 0, T = frames.tangents[i].clone().multiplyScalar(end ? 1 : -1), ring = i * (radial + 1);
    const cx = new THREE.Vector3(), c0 = pos.length / 3;
    for (let j = 0; j < radial; j++) cx.add(new THREE.Vector3(pos[(ring + j) * 3], pos[(ring + j) * 3 + 1], pos[(ring + j) * 3 + 2]));
    cx.multiplyScalar(1 / radial);
    const rr = end ? r1 : r0 * 1.35;
    pos.push(cx.x + T.x * rr * 0.12, cx.y + T.y * rr * 0.12, cx.z + T.z * rr * 0.12); nor.push(T.x, T.y, T.z); uv.push(0.5, 0.5);
    for (let j = 0; j <= radial; j++) {
      const k = ring + j;
      pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); nor.push(T.x, T.y, T.z);
      const a = (j / radial) * Math.PI * 2; uv.push(0.5 + Math.cos(a) * rr, 0.5 + Math.sin(a) * rr);
    }
    // wound to face along T (outward from the tube's end)
    for (let j = 0; j < radial; j++) { if (end) idx.push(c0, c0 + 1 + j, c0 + 2 + j); else idx.push(c0, c0 + 2 + j, c0 + 1 + j); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** a flat triangle / polygon prism in a frame: pts in (u, y) of the plane z = 0, thickness t (centred) */
export function prismXY(pts: Array<[number, number]>, t: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  // metre UVs on the big faces (ExtrudeGeometry's default UVs are already in shape units = metres)
  return g;
}

/** a storm lantern that GLOWS: iron base + cap + wire guards around a warm emissive chimney glass (the kit's
 *  lantern glass reflects the dark and reads as a flat blue pane in the hollow) — `at` = the base centre */
export function murkLantern(bins: TownBins, at: THREE.Matrix4) {
  const iron = col("#2a2622");
  bins.metal.add(cylGeo(0.1, 0.12, 0.05, 10), at.clone().multiply(M(0, 0.025, 0)), iron);
  const glass = new THREE.SphereGeometry(0.085, 12, 8); glass.scale(1, 1.45, 1);
  bins.bulb.add(glass, at.clone().multiply(M(0, 0.17, 0)), col("#ffd08a"));
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; bins.metal.add(cylGeo(0.008, 0.008, 0.26, 3), at.clone().multiply(M(Math.cos(a) * 0.1, 0.17, Math.sin(a) * 0.1)), iron); }
  bins.metal.add(cylGeo(0.05, 0.1, 0.06, 10), at.clone().multiply(M(0, 0.32, 0)), iron);
  const ring = new THREE.TorusGeometry(0.05, 0.009, 4, 12);
  bins.metal.add(ring, at.clone().multiply(M(0, 0.4, 0)), iron);
}

/** a closed, hand-built shipping crate (the kit's open slat crate reads as a brick block in stacks and lets rays
 *  through): a dark core, 3–4 bevelled boards per face each with its own grain offset + tint, bevelled corner battens and
 *  rim battens, a diagonal brace on the long faces, lid boards, nail heads, a stencil band; wear lightens the edges */
export function murkCrate(nb: TownBins, at: THREE.Matrix4, w: number, h: number, d: number, color: string, rng: () => number) {
  const T = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) => at.clone().multiply(M(x, y, z, yaw, pitch, roll));
  const base = col(color), dark = col(color, 0.55);
  // the core (shadowed gaps between the boards)
  nb.wood.box(w - 0.05, h - 0.05, d - 0.05, T(0, h / 2, 0), col("#3a2c1e"));
  // (one tone per crate, ±4 % per board — per-board colour jumps on 4 rows read as BRICK)
  const bt = 0.022, nb4 = h > 0.55 ? 3 : 2, gap = 0.016, bh = (h - 0.1 - gap * (nb4 - 1)) / nb4;
  const crateTone = base.clone().multiplyScalar(0.9 + rng() * 0.2).lerp(col("#9a8a70"), rng() * 0.15);
  const tint = () => crateTone.clone().multiplyScalar(0.96 + rng() * 0.08);
  // long faces (±z) and short faces (±x): horizontal boards between the rim battens
  for (const s of [-1, 1]) for (let i = 0; i < nb4; i++) {
    const y = 0.05 + bh / 2 + i * (bh + gap);
    nb.clapboard.add(chamferBoxGeo(w - 0.1, bh, bt, 0.008, [rng() * 3, rng() * 3], 3), T(0, y, s * (d / 2 - bt / 2)), tint());
    nb.clapboard.add(chamferBoxGeo(bt, bh, d - 0.1, 0.008, [rng() * 3, rng() * 3], 3), T(s * (w / 2 - bt / 2), y, 0), tint());
  }
  // lid: boards across the short span
  const nl = Math.max(3, Math.round(w / 0.2)), lw = (w - 0.02 - gap * (nl - 1)) / nl;
  for (let i = 0; i < nl; i++) nb.clapboard.add(chamferBoxGeo(lw, bt, d - 0.02, 0.008, [rng() * 3, rng() * 3], 3), T(-w / 2 + 0.01 + lw / 2 + i * (lw + gap), h - bt / 2, 0), tint());
  // corner battens (vertical) + rim battens (top + bottom, all four faces): proud of the boards, bevelled, darker
  const bb = 0.055, bd = 0.03;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) nb.wood.add(chamferBoxGeo(bb, h - 0.004, bb, 0.012, [rng(), rng()]), T(sx * (w / 2 - bb / 2 + 0.008), h / 2, sz * (d / 2 - bb / 2 + 0.008)), dark.clone().multiplyScalar(1.2 + rng() * 0.25));
  for (const y of [0.03 + 0.005, h - 0.035]) for (const s of [-1, 1]) {
    nb.wood.add(chamferBoxGeo(w - 2 * bb + 0.01, bb, bd, 0.01, [rng(), rng()]), T(0, y, s * (d / 2 + bd / 2 - 0.004)), dark.clone().multiplyScalar(1.25 + rng() * 0.2));
    nb.wood.add(chamferBoxGeo(bd, bb, d - 2 * bb + 0.01, 0.01, [rng(), rng()]), T(s * (w / 2 + bd / 2 - 0.004), y, 0), dark.clone().multiplyScalar(1.25 + rng() * 0.2));
  }
  // a diagonal brace on each long face
  const L = Math.hypot(w - 2 * bb, h - 0.12), ang = Math.atan2(h - 0.12, w - 2 * bb) * (rng() < 0.5 ? 1 : -1);
  for (const s of [-1, 1]) nb.wood.add(chamferBoxGeo(L - 0.04, bb * 0.9, bd * 0.8, 0.01, [rng(), rng()]), T(0, h / 2, s * (d / 2 + bd / 2 - 0.006), 0, 0, ang), dark.clone().multiplyScalar(1.3));
  // nail heads at the battens + a faded stencil band on one long face
  const nail = new THREE.SphereGeometry(0.009, 5, 3);
  for (const sx of [-1, 1]) for (const y of [0.035, h - 0.035]) nb.metal.add(nail.clone(), T(sx * (w / 2 - bb - 0.03), y, d / 2 + bd), col("#4a4038"));
  nail.dispose();
  if (rng() < 0.6) nb.plastic.box(w * 0.42, h * 0.16, 0.003, T((rng() - 0.5) * w * 0.2, h * 0.55, -(d / 2 + 0.001 - 0.0)), col(rng() < 0.5 ? "#7a2e22" : "#2e3e52", 0.75));
}
