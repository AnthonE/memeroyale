// Firefight set (char-03-firefight): two kongs in a firefight among spilled BANANA CO. containers on a beach —
// the hero knee-sliding past the open doors of a yellow container, the foe planted wide 10 m away firing back — plus
// wooden crates, a stilt watchtower with a container stack, palms (VegApi), big-leaf clumps in the bottom corners,
// coconuts (whole, split, tumbling), pebbles, sand scuffs + contact shadows, a distant storm dome, and the combat FX
// (layered muzzle flash + light, spinning banana rounds with streaks + halo, chunky sand spray, dust puffs, coconut
// chips). Owned by the actors area. Kongs: createKong() + pose()/hold() in stage() below; the
// frozen frame's flashes and rounds come from their real muzzles (kong.muzzle()).
//
// Containers come from the poi-harbor kit (client/src/world/pois/_kit/containers.ts). Everything else is procedural:
// geometry + canvas-painted colour / normal maps (text only "BANANA CO.").
//
// Layout frame ("shot frame"): origin = the shot camera's ground point, yaw = the shot heading (0 = looking north /
// −Z, like KongPose.yaw). a = metres to the camera's right, d = metres forward. The group sits at the origin rotated by
// yaw, so children use local (x = a, z = −d); y is world height (terrain-grounded at build time).
//
// Location: the wide dry beach between Coconut Cove and Peel Harbor, origin (240, 544), looking SE (az 130) along the
// shore. Chosen by replaying the veg scatter (shared/world/veg-scatter.ts) against the baked terrain
// (island.bin) + the harbor apron polygon + every POI radius: dry sand (≥ 0.9 m, so no dark wet-sand band) with
// ZERO scattered plants in the shot corridor — the other beaches put palms / banana plants in front of the camera or sit
// on POI geometry. Sea on the right, sand rising inland on the left, the midday sun (az −34°, elev 58°) behind the
// camera: camera-facing sides sunlit. The beach falls ~0.07 m/m toward the sea (the foe stands ~0.6 m lower than the
// hero). A terrain re-bake can move the coast: re-run the scan and update SHOT/AIM_TH.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { WorldCtx } from "../engine/engine";
import type { CamSpec } from "../engine/views";
import type { KongPose } from "./api";
import type { VegApi, PlantKind } from "../world/veg/api";
import { createKong, type KongActorEx } from "./kong";
import { pose, hold } from "./kong-dev-views";
import { ContainerKit, placementMatrix, type ContainerPlacement } from "../world/pois/_kit/containers";
import { decalGeometry } from "../world/pois/_kit/containers-geo";
import { canvas as cnv, paintNoise, splotches, streaks, scratches, stencilText, drawBanana, bananaPath, wearOut, normalFromHeight, rng } from "../world/pois/_kit/harbor-paint";

/** a gun the set can fire from (live autoplay): real muzzle + barrel direction, and a hook to trigger the recoil */
export interface Shooter { muzzle(out: THREE.Vector3): THREE.Vector3; dir(out: THREE.Vector3): THREE.Vector3; kick(): void }

export interface FirefightSet {
  object: THREE.Group;
  update(dt: number, t: number): void;
  /** world-space anchors the kongs stand at (feet on the sand) + their staged poses */
  heroPos: THREE.Vector3; heroYaw: number;
  foePos: THREE.Vector3; foeYaw: number;
  heroPose: KongPose; foePose: KongPose;
  /** spawn a one-shot yellow muzzle flash + banana projectile from a world point along a direction */
  fire(from: THREE.Vector3, dir: THREE.Vector3): void;
  /** sand spray burst at a world point */
  sandBurst(p: THREE.Vector3): void;
  /** re-stage the frozen shot moment (flashes lit, bananas mid-air, spray up) from the kongs' real muzzles (world)
   *  and barrel directions; omitted values fall back to guesses from the anchors. */
  freezeShot(heroMuzzle?: THREE.Vector3, foeMuzzle?: THREE.Vector3, heroDir?: THREE.Vector3, foeDir?: THREE.Vector3, heroMuzzle2?: THREE.Vector3, foeMuzzle2?: THREE.Vector3): void;
  /** live mode: keep firing on a loop (off by default; stage() turns it on outside shot mode) */
  autoplay: boolean;
  /** live autoplay fires from these (the kongs' guns) when bound, else from the anchors */
  bindShooters(hero: Shooter, foe: Shooter): void;
  /** layout frame helpers (world x/z of shot-frame a/d) */
  toWorld(a: number, d: number, h?: number): THREE.Vector3;
  /** world direction of a shot-frame bearing (radians right of the shot heading) */
  dirW(th: number, y?: number): THREE.Vector3;
}

// ============================================================================================ frame + views
/** shot frame for the char-03-firefight view (see header).
 *  The header's original site (240, 544) sat on a
 *  narrow beach under a 35 m cliff plateau that filled the whole upper-left. Moved to the LOBBY ISLET's west
 *  beach (our own POI — its clearings keep the scatter out of the corridor): looking due south along the shore, the flat
 *  islet pad on the left (sky above the tower + palms), the sea + surf on the right, open horizon ahead. */
export const SHOT = { x: -75, z: 995, yaw: Math.PI };
/** eye height (m above the sand under the camera). 0.95 m ≈ the sliding hero's muzzle height (his sand is 0.1 m lower),
 *  so every round flies along the horizon line on screen, and it puts the hero's head at ~37 % / feet at ~88 % of the
 *  frame and the foe's feet at ~63 % like the target art (a 1.5 m eye puts the sliding hero's head below the horizon). */
const CAM_H = 1.3;   // target-art fit: the camera sits ~1.3 m over the hero's sand, the foe's feet at 66 %

interface Frame { o: { x: number; z: number; yaw: number }; f: [number, number]; r: [number, number]; x(a: number, d: number): number; z(a: number, d: number): number }
function frameOf(o: { x: number; z: number; yaw: number }): Frame {
  const f: [number, number] = [-Math.sin(o.yaw), -Math.cos(o.yaw)], r: [number, number] = [Math.cos(o.yaw), -Math.sin(o.yaw)];
  return { o, f, r, x: (a, d) => o.x + a * r[0] + d * f[0], z: (a, d) => o.z + a * r[1] + d * f[1] };
}
const SF = frameOf(SHOT);
/** a view in shot-frame coordinates (heights relative to the terrain) */
function sv(a: number, d: number, h: number, ta: number, td: number, th: number, fov: number, stage: string, note?: string): CamSpec {
  return { pos: [+SF.x(a, d).toFixed(2), h, +SF.z(a, d).toFixed(2)], target: [+SF.x(ta, td).toFixed(2), th, +SF.z(ta, td).toFixed(2)], fov, rel: true, stage, note };
}

// Target heights are rel to the sand under the target: camera ground 1.5 m, ground at (3.6, 25) ≈ 2.0 m (baked terrain).
// Eye 2.8 m − 25·tan(1°) = 2.36 m → rel 0.36 → pitch −1°, horizon ≈ 48 % down.
const AIM_TH = 0.36;
/** camera aim, metres right of the shot heading at 25 m (turns the camera so the cluster sits centre-right, target art) */
const CAM_TA = 3.6;
export const views: Record<string, CamSpec> = {
  // the view: low (muzzle-height) wide action shot, hero sliding ~2.5 m out left of centre, foe ~10 m right of centre
  "char-03-firefight": sv(0, 0, CAM_H, CAM_TA, 25, AIM_TH, 58, "firefight", "firefight set + kongs (actors/firefight-set.ts)"),
  // dev views (same stage)
  "wip-firefight": sv(0, 0, CAM_H, 0, 25, AIM_TH, 58, "firefight"),
  "wip-firefight-hero": sv(1.1, 0.3, 1.05, -1.3, 2.9, 0.75, 38, "firefight", "hero slide pose, flash, spray"),
  "wip-firefight-hero-cam": sv(0, 0, CAM_H, -0.4, 2.95, 0.55, 30, "firefight", "the view camera zoomed on the hero"),
  "wip-firefight-hero-top": sv(-0.55, 2.95, 4.5, -0.54, 2.96, 0, 40, "firefight", "hero from above"),
  "wip-firefight-foe": sv(3.2, 6.2, 1.3, 4.6, 9.8, 1.0, 30, "firefight", "foe stance, flash, dust"),
  "wip-firefight-yellow": sv(2.2, 0.8, 1.4, -1.5, 5.8, 1.4, 48, "firefight", "hero container door end + decals"),
  "wip-firefight-cluster": sv(1.5, 4.5, 1.6, 5, 16, 2.0, 44, "firefight", "red/green/blue cluster"),
  "wip-firefight-fx": sv(1.2, 3.2, 1.2, 2.2, 6.5, 1.0, 40, "firefight", "rounds in flight"),
  "wip-firefight-back": sv(-2, 3, 2.2, -6, 26, 5, 50, "firefight", "watchtower + palms behind"),
  "wip-firefight-top": sv(2, -6, 26, 2, 14, 0, 60, "firefight", "layout overview from above"),
  "wip-firefight-side": sv(-14, 9, 3, 2, 9, 1.2, 55, "firefight", "layout from the land side"),
};

// ============================================================================================ small utils
const TAU = Math.PI * 2;
type Rect = { x: number; y: number; w: number; h: number }; // canvas px, top-left origin
/** canvas rect (atlas px) + local 0..1 (v up) → texture uv (flipY canvas textures) */
const ruv = (r: Rect, S: number, H: number, u: number, v: number): [number, number] => {
  u = Math.min(0.995, Math.max(0.005, u)); v = Math.min(0.995, Math.max(0.005, v));
  return [(r.x + u * r.w) / S, 1 - (r.y + (1 - v) * r.h) / H];
};
function ctex(el: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** geometry accumulator: add three geometries under a matrix, remapping their uv through a function */
class MB {
  parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, uv?: (u: number, v: number, p: THREE.Vector3, n: THREE.Vector3) => [number, number]) {
    let q = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(q.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") q.deleteAttribute(k);
    if (!q.getAttribute("normal")) q.computeVertexNormals();
    if (!q.getAttribute("uv")) q.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(q.getAttribute("position").count * 2), 2));
    if (m) q.applyMatrix4(m);
    if (uv) {
      const pos = q.getAttribute("position"), nor = q.getAttribute("normal"), t = q.getAttribute("uv") as THREE.BufferAttribute;
      const P = new THREE.Vector3(), N = new THREE.Vector3();
      for (let i = 0; i < t.count; i++) {
        P.fromBufferAttribute(pos, i); N.fromBufferAttribute(nor, i);
        const [u, v] = uv(t.getX(i), t.getY(i), P, N);
        t.setXY(i, u, v);
      }
    }
    this.parts.push(q);
    if (q !== g) void 0;
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    if (!g) throw new Error("firefight: merge failed");
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
/** matrix for a box between two points (length along the segment), `up` keeps it level */
function beamMatrix(p0: THREE.Vector3, p1: THREE.Vector3, roll = 0): THREE.Matrix4 {
  const x = new THREE.Vector3().subVectors(p1, p0).normalize();
  const ref = Math.abs(x.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const z = new THREE.Vector3().crossVectors(x, ref).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  if (roll) m.multiply(new THREE.Matrix4().makeRotationX(roll));
  m.setPosition(new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5));
  return m;
}
const TRS = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1) => {
  const sc = typeof s === "number" ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), sc);
};

// ============================================================================================ textures
// ---- wood atlas (1024²): crates (plain, stencilled, red), battens, weathered tower wood, dark
const WOOD_S = 1024;
const WOOD = {
  plank: { x: 0, y: 0, w: 512, h: 512 }, stencil: { x: 512, y: 0, w: 512, h: 512 },
  batten: { x: 0, y: 512, w: 512, h: 256 }, tower: { x: 0, y: 768, w: 512, h: 256 },
  red: { x: 512, y: 512, w: 512, h: 256 }, dark: { x: 512, y: 768, w: 512, h: 256 },
};
function paintPlanks(c: CanvasRenderingContext2D, h: CanvasRenderingContext2D, r: Rect, n: number, cols: string[], seed: number, o: { nails?: boolean; paint?: string; grain?: number } = {}) {
  const R = rng(seed);
  const ph = r.h / n;
  for (let i = 0; i < n; i++) {
    const y = r.y + i * ph;
    const base = cols[Math.floor(R() * cols.length)];
    c.fillStyle = base; c.fillRect(r.x, y, r.w, ph);
    h.fillStyle = `rgb(${150 + Math.floor(R() * 30)},0,0)`; h.fillRect(r.x, y, r.w, ph);
    // grain: long wavy lines
    const gN = Math.round((o.grain ?? 1) * 26);
    for (let k = 0; k < gN; k++) {
      const gy = y + R() * ph, amp = 1 + R() * 3, fr = 0.004 + R() * 0.01, ph0 = R() * TAU;
      c.strokeStyle = R() < 0.6 ? "rgba(70,40,15,0.22)" : "rgba(255,235,190,0.16)";
      c.lineWidth = 0.6 + R() * 1.6;
      c.beginPath();
      for (let x = 0; x <= r.w; x += 8) { const yy = gy + Math.sin(x * fr + ph0) * amp; if (x === 0) c.moveTo(r.x + x, yy); else c.lineTo(r.x + x, yy); }
      c.stroke();
      h.strokeStyle = "rgba(90,0,0,0.25)"; h.lineWidth = 1; h.beginPath(); h.moveTo(r.x, gy); h.lineTo(r.x + r.w, gy + amp); h.stroke();
    }
    // knots
    for (let k = 0; k < (R() < 0.6 ? 1 : 0) + (R() < 0.2 ? 1 : 0); k++) {
      const kx = r.x + 30 + R() * (r.w - 60), ky = y + ph * (0.3 + R() * 0.4), kr = 4 + R() * 7;
      for (let q = 3; q >= 0; q--) { c.fillStyle = `rgba(${60 + q * 18},${35 + q * 10},${14 + q * 5},${0.5 - q * 0.08})`; c.beginPath(); c.ellipse(kx, ky, kr * (1 + q * 0.7) * 1.8, kr * (1 + q * 0.5), 0, 0, TAU); c.fill(); }
    }
    if (o.paint) { // worn paint: solid coat eaten at the edges
      c.save(); c.globalAlpha = 0.88; c.fillStyle = o.paint; c.fillRect(r.x, y + 3, r.w, ph - 6); c.restore();
      c.save(); c.globalCompositeOperation = "source-over";
      for (let k = 0; k < 40; k++) { c.fillStyle = cols[0]; c.globalAlpha = 0.6 + R() * 0.4; const wx = r.x + R() * r.w, wy = y + (R() < 0.5 ? 2 + R() * 6 : ph - 8 + R() * 6); c.beginPath(); c.ellipse(wx, wy, 3 + R() * 14, 1.5 + R() * 3, 0, 0, TAU); c.fill(); }
      c.restore();
    }
    // plank edges: dark gap + top highlight
    c.fillStyle = "rgba(25,14,6,0.95)"; c.fillRect(r.x, y, r.w, 2.5);
    c.fillStyle = "rgba(255,240,205,0.28)"; c.fillRect(r.x, y + 2.5, r.w, 1.5);
    c.fillStyle = "rgba(40,22,8,0.35)"; c.fillRect(r.x, y + ph - 3, r.w, 3);
    h.fillStyle = "rgb(30,0,0)"; h.fillRect(r.x, y, r.w, 3);
    if (o.nails ?? true) for (const nx of [r.x + 14, r.x + r.w - 14]) for (const ny of [y + ph * 0.3, y + ph * 0.7]) {
      c.fillStyle = "rgba(110,55,20,0.35)"; c.beginPath(); c.arc(nx, ny + 3, 6, 0, TAU); c.fill();
      c.fillStyle = "#2c2a28"; c.beginPath(); c.arc(nx, ny, 2.6, 0, TAU); c.fill();
      c.fillStyle = "rgba(255,255,255,0.35)"; c.beginPath(); c.arc(nx - 0.8, ny - 0.8, 1, 0, TAU); c.fill();
      h.fillStyle = "rgb(230,0,0)"; h.beginPath(); h.arc(nx, ny, 2.6, 0, TAU); h.fill();
    }
  }
  paintNoise(c, r.x, r.y, r.w, r.h, { seed: seed + 1, scale: 260, alpha: 0.28, blend: "overlay" });
  splotches(c, r.x, r.y + r.h * 0.55, r.w, r.h * 0.45, { n: 10, rMin: 20, rMax: 80, color: "rgba(60,45,25,1)", alpha: 0.22, seed: seed + 2, blend: "multiply" });
  scratches(c, r.x, r.y, r.w, r.h, { n: 30, color: "rgba(255,240,210,1)", alpha: 0.3, seed: seed + 3, lenMin: 4, lenMax: 26 });
}
let woodCache: { map: THREE.Texture; normal: THREE.Texture } | null = null;
function woodTextures() {
  if (woodCache) return woodCache;
  const [el, c] = cnv(WOOD_S, WOOD_S);
  const [hel, h] = cnv(WOOD_S, WOOD_S);
  const crate = ["#c79a5c", "#bf8f52", "#cfa56a", "#b98a4e"];
  paintPlanks(c, h, WOOD.plank, 5, crate, 11);
  paintPlanks(c, h, WOOD.stencil, 5, crate, 12);
  // stencil: "BANANA CO." + banana, dark brown, worn
  const s = WOOD.stencil;
  stencilText(c, "BANANA", s.x + s.w / 2, s.y + s.h * 0.47, { size: 92, color: "rgba(58,36,18,0.86)", align: "center", wear: 0.45, seed: 5, letterSpacing: 4 });
  stencilText(c, "CO.", s.x + s.w / 2, s.y + s.h * 0.72, { size: 92, color: "rgba(58,36,18,0.86)", align: "center", wear: 0.45, seed: 6, letterSpacing: 6 });
  drawBanana(c, s.x + s.w / 2, s.y + s.h * 0.2, 150, -0.25, { color: "rgba(58,36,18,0.82)", wear: 0.35, seed: 7 });
  // battens: one board, lengthwise grain
  paintPlanks(c, h, WOOD.batten, 2, ["#b0824c", "#a97a44"], 13, { nails: false, grain: 1.4 });
  // tower: weathered grey-blue boards with blue paint remnants
  paintPlanks(c, h, WOOD.tower, 4, ["#8f9aa0", "#86929a", "#9ba5a9", "#7e8a90"], 14, { grain: 1.3 });
  splotches(c, WOOD.tower.x, WOOD.tower.y, WOOD.tower.w, WOOD.tower.h, { n: 18, rMin: 10, rMax: 50, color: "rgba(60,110,170,1)", alpha: 0.4, seed: 15 });
  // red painted planks (worn to wood)
  paintPlanks(c, h, WOOD.red, 4, crate, 16, { paint: "#b8462f" });
  // dark: end grain / gaps / interiors
  c.fillStyle = "#3d2c1c"; c.fillRect(WOOD.dark.x, WOOD.dark.y, WOOD.dark.w, WOOD.dark.h);
  paintNoise(c, WOOD.dark.x, WOOD.dark.y, WOOD.dark.w, WOOD.dark.h, { seed: 17, scale: 120, alpha: 0.4, blend: "overlay" });
  h.fillStyle = "rgb(128,0,0)"; h.fillRect(WOOD.dark.x, WOOD.dark.y, WOOD.dark.w, WOOD.dark.h);
  // height: red channel → grey
  const hd = h.getImageData(0, 0, WOOD_S, WOOD_S);
  for (let i = 0; i < hd.data.length; i += 4) { const v = hd.data[i]; hd.data[i + 1] = v; hd.data[i + 2] = v; hd.data[i + 3] = 255; }
  h.putImageData(hd, 0, 0);
  woodCache = { map: ctex(el), normal: ctex(normalFromHeight(hel, 2.2, false), false) };
  return woodCache;
}

// ---- foliage atlas (2048² RGBA): monstera, broad leaf, fern, banana leaf, sprout, stem
export const FOL_S = 2048;
export const FOL = {
  monstera: { x: 0, y: 0, w: 1024, h: 1024 }, broad: { x: 1024, y: 0, w: 512, h: 1024 }, fern: { x: 1536, y: 0, w: 512, h: 1024 },
  banana: { x: 0, y: 1024, w: 512, h: 1024 }, sprout: { x: 512, y: 1024, w: 512, h: 512 }, stem: { x: 512, y: 1536, w: 128, h: 512 },
};
function leafGradient(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, dark: string, mid: string, light: string) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, dark); g.addColorStop(0.45, mid); g.addColorStop(1, light);
  return g;
}
function paintMonstera(c: CanvasRenderingContext2D, r: Rect) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = r.w * 0.47;
  const P = (x: number, y: number): [number, number] => [cx + x * s, cy - y * s]; // unit coords, y up
  c.save();
  c.beginPath();
  c.moveTo(...P(0, 1));
  c.bezierCurveTo(...P(0.55, 1.0), ...P(0.99, 0.62), ...P(0.97, 0.12));
  c.bezierCurveTo(...P(0.96, -0.38), ...P(0.8, -0.96), ...P(0.42, -0.97));
  c.bezierCurveTo(...P(0.18, -0.97), ...P(0.05, -0.76), ...P(0, -0.58));
  c.bezierCurveTo(...P(-0.05, -0.76), ...P(-0.18, -0.97), ...P(-0.42, -0.97));
  c.bezierCurveTo(...P(-0.8, -0.96), ...P(-0.96, -0.38), ...P(-0.97, 0.12));
  c.bezierCurveTo(...P(-0.99, 0.62), ...P(-0.55, 1.0), ...P(0, 1));
  c.closePath();
  const rg = c.createRadialGradient(cx, cy + s * 0.2, s * 0.1, cx, cy, s * 1.05);
  rg.addColorStop(0, "#3f9a38"); rg.addColorStop(0.55, "#2f7e2c"); rg.addColorStop(1, "#1d5a20");
  c.fillStyle = rg; c.fill();
  c.clip();
  // glossy sheen band + veins
  const sh = c.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
  sh.addColorStop(0.2, "rgba(255,255,230,0)"); sh.addColorStop(0.42, "rgba(255,255,230,0.14)"); sh.addColorStop(0.6, "rgba(255,255,230,0)");
  c.fillStyle = sh; c.fillRect(r.x, r.y, r.w, r.h);
  const R = rng(31);
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const t = -0.45 + i * 0.16, [bx, by] = P(0, t);
    const [ex, ey] = P(side * 1.0, t + 0.28 + i * 0.02);
    c.strokeStyle = "rgba(170,215,110,0.45)"; c.lineWidth = 5 - i * 0.25;
    c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(cx + side * s * 0.4, by - s * 0.14, ex, ey); c.stroke();
  }
  // fenestration: slits from the edge toward the midrib + oval holes
  c.globalCompositeOperation = "destination-out";
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const t = -0.36 + i * 0.17;
    const [ix, iy] = P(side * (0.36 + R() * 0.08), t + 0.1);
    const [ox, oy] = P(side * 1.1, t + 0.33 + i * 0.02);
    const w0 = 2 + R() * 2, w1 = 13 + R() * 8;
    const ang = Math.atan2(oy - iy, ox - ix), nx = -Math.sin(ang), ny = Math.cos(ang);
    c.beginPath(); c.moveTo(ix + nx * w0, iy + ny * w0); c.lineTo(ox + nx * w1, oy + ny * w1); c.lineTo(ox - nx * w1, oy - ny * w1); c.lineTo(ix - nx * w0, iy - ny * w0); c.closePath(); c.fill();
    if (i > 0 && i < 6 && R() < 0.8) { const [hx, hy] = P(side * (0.2 + R() * 0.06), t + 0.02); c.beginPath(); c.ellipse(hx, hy, 9 + R() * 8, 20 + R() * 12, ang, 0, TAU); c.fill(); }
  }
  c.globalCompositeOperation = "source-over";
  // midrib
  c.strokeStyle = "#a6cf62"; c.lineWidth = 10; c.beginPath(); c.moveTo(...P(0, -0.58)); c.quadraticCurveTo(...P(0.02, 0.2), ...P(0, 0.97)); c.stroke();
  c.strokeStyle = "rgba(40,80,20,0.5)"; c.lineWidth = 2; c.stroke();
  c.restore();
}
function paintLong(c: CanvasRenderingContext2D, r: Rect, o: { widthF: number; tip: number; veins: number; torn?: number; dark: string; mid: string; light: string; rib: string; seed: number }) {
  const cx = r.x + r.w / 2, top = r.y + r.h * 0.03, bot = r.y + r.h * 0.97, L = bot - top, hw = r.w * 0.47 * o.widthF;
  const R = rng(o.seed);
  const halfW = (t: number) => hw * Math.pow(Math.sin(Math.PI * Math.min(1, t * (1 + o.tip * 0.2))), 0.65) * (t < 0.1 ? 0.4 + t * 6 : 1);
  c.save();
  c.beginPath();
  const N = 40;
  for (let i = 0; i <= N; i++) { const t = i / N, y = bot - t * L; if (i === 0) c.moveTo(cx, y); else c.lineTo(cx + halfW(t), y); }
  for (let i = N; i >= 0; i--) { const t = i / N, y = bot - t * L; c.lineTo(cx - halfW(t), y); }
  c.closePath();
  c.fillStyle = leafGradient(c, cx - hw, 0, cx + hw, 0, o.dark, o.mid, o.light); c.fill();
  c.clip();
  const sh = c.createLinearGradient(cx - hw, top, cx + hw, bot);
  sh.addColorStop(0.3, "rgba(255,255,230,0)"); sh.addColorStop(0.5, "rgba(255,255,230,0.12)"); sh.addColorStop(0.7, "rgba(255,255,230,0)");
  c.fillStyle = sh; c.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 1; i < o.veins; i++) {
    const t = i / o.veins, y = bot - t * L;
    for (const side of [-1, 1]) { c.strokeStyle = "rgba(190,230,130,0.35)"; c.lineWidth = 2.2; c.beginPath(); c.moveTo(cx, y); c.quadraticCurveTo(cx + side * hw * 0.5, y - L * 0.02, cx + side * hw * 1.05, y - L * 0.06); c.stroke(); }
  }
  if (o.torn) {
    c.globalCompositeOperation = "destination-out";
    for (let i = 0; i < o.torn; i++) {
      const t = 0.15 + R() * 0.8, y = bot - t * L, side = R() < 0.5 ? -1 : 1, depth = hw * (0.35 + R() * 0.6);
      c.beginPath(); c.moveTo(cx + side * (hw * 1.1), y - 3); c.lineTo(cx + side * (hw * 1.1 - depth), y - L * 0.012); c.lineTo(cx + side * (hw * 1.1), y + 3 + R() * 4); c.closePath(); c.fill();
    }
    c.globalCompositeOperation = "source-over";
  }
  c.strokeStyle = o.rib; c.lineWidth = Math.max(4, r.w * 0.018); c.beginPath(); c.moveTo(cx, bot); c.lineTo(cx, top + L * 0.02); c.stroke();
  c.restore();
}
function paintFern(c: CanvasRenderingContext2D, r: Rect) {
  const cx = r.x + r.w / 2, top = r.y + 12, bot = r.y + r.h - 8, L = bot - top;
  c.strokeStyle = "#5c8f2c"; c.lineWidth = 6; c.beginPath(); c.moveTo(cx, bot); c.lineTo(cx, top); c.stroke();
  for (let i = 0; i < 26; i++) {
    const t = 0.06 + i * 0.036, y = bot - t * L, len = r.w * 0.46 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.8, wd = 9 + 7 * (1 - t);
    for (const side of [-1, 1]) {
      const ex = cx + side * len, ey = y - len * 0.45;
      const g = c.createLinearGradient(cx, y, ex, ey); g.addColorStop(0, "#2f7424"); g.addColorStop(0.7, "#4c9a32"); g.addColorStop(1, "#8cc04a");
      c.fillStyle = g; c.beginPath(); c.moveTo(cx, y - wd * 0.3);
      c.quadraticCurveTo(cx + side * len * 0.5, y - len * 0.2 - wd, ex, ey); c.quadraticCurveTo(cx + side * len * 0.5, y - len * 0.2 + wd, cx, y + wd * 0.5); c.closePath(); c.fill();
      c.strokeStyle = "rgba(170,210,110,0.5)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx, y); c.quadraticCurveTo(cx + side * len * 0.5, y - len * 0.2, ex, ey); c.stroke();
    }
  }
}
function paintSprout(c: CanvasRenderingContext2D, r: Rect) {
  const cx = r.x + r.w / 2, cy = r.y + r.h * 0.85;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.5, len = r.h * (0.42 + (i === 2 ? 0.2 : 0)), ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
    const g = c.createLinearGradient(cx, cy, ex, ey); g.addColorStop(0, "#3c8a2a"); g.addColorStop(1, "#9ccc4c");
    c.fillStyle = g; c.beginPath(); c.moveTo(cx, cy);
    const nx = -Math.sin(a) * len * 0.22, ny = Math.cos(a) * len * 0.22;
    c.quadraticCurveTo((cx + ex) / 2 + nx, (cy + ey) / 2 + ny, ex, ey); c.quadraticCurveTo((cx + ex) / 2 - nx, (cy + ey) / 2 - ny, cx, cy); c.fill();
    c.strokeStyle = "rgba(200,235,140,0.55)"; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
  }
}
let folCache: THREE.Texture | null = null;
export function foliageTexture() {
  if (folCache) return folCache;
  const [el, c] = cnv(FOL_S, FOL_S);
  paintMonstera(c, FOL.monstera);
  paintLong(c, FOL.broad, { widthF: 0.95, tip: 0.2, veins: 16, dark: "#1f5a22", mid: "#2f7d2d", light: "#4e9c3a", rib: "#9fcb5e", seed: 41 });
  paintFern(c, FOL.fern);
  paintLong(c, FOL.banana, { widthF: 0.9, tip: 0.05, veins: 30, torn: 9, dark: "#2a6a26", mid: "#3f8f33", light: "#6fb448", rib: "#b8d676", seed: 42 });
  paintSprout(c, FOL.sprout);
  const st = FOL.stem; const g = c.createLinearGradient(st.x, 0, st.x + st.w, 0);
  g.addColorStop(0, "#2d6a24"); g.addColorStop(0.5, "#6aa83e"); g.addColorStop(1, "#2d6a24"); c.fillStyle = g; c.fillRect(st.x, st.y, st.w, st.h);
  folCache = ctex(el);
  return folCache;
}

// ---- coconut atlas (512²)
const COCO_S = 512;
const COCO = { green: { x: 0, y: 0, w: 256, h: 256 }, dry: { x: 256, y: 0, w: 256, h: 256 }, flesh: { x: 0, y: 256, w: 256, h: 256 }, shell: { x: 256, y: 256, w: 256, h: 256 } };
let cocoCache: THREE.Texture | null = null;
function cocoTexture() {
  if (cocoCache) return cocoCache;
  const [el, c] = cnv(COCO_S, COCO_S);
  const fill = (r: Rect, base: string) => { c.fillStyle = base; c.fillRect(r.x, r.y, r.w, r.h); };
  fill(COCO.green, "#7aa02e");
  paintNoise(c, COCO.green.x, COCO.green.y, 256, 256, { seed: 51, scale: 140, alpha: 0.5, blend: "overlay" });
  splotches(c, COCO.green.x, COCO.green.y, 256, 256, { n: 14, rMin: 8, rMax: 40, color: "rgba(190,200,70,1)", alpha: 0.55, seed: 52 });
  splotches(c, COCO.green.x, COCO.green.y, 256, 256, { n: 12, rMin: 4, rMax: 22, color: "rgba(110,70,30,1)", alpha: 0.75, seed: 53 });
  // stem end (top rows) brown, fibre streaks
  const gs = c.createLinearGradient(0, 0, 0, 60); gs.addColorStop(0, "rgba(90,60,25,0.95)"); gs.addColorStop(1, "rgba(90,60,25,0)"); c.fillStyle = gs; c.fillRect(0, 0, 256, 60);
  fill(COCO.dry, "#8a5d32");
  streaks(c, COCO.dry.x, COCO.dry.y, 256, 256, { n: 90, color: "rgba(60,35,15,1)", alpha: 0.6, lenMin: 40, lenMax: 250, width: 3, seed: 54 });
  paintNoise(c, COCO.dry.x, COCO.dry.y, 256, 256, { seed: 55, scale: 90, alpha: 0.4, blend: "overlay" });
  fill(COCO.flesh, "#f4f0e6");
  paintNoise(c, COCO.flesh.x, COCO.flesh.y, 256, 256, { seed: 56, scale: 60, alpha: 0.12, blend: "overlay" });
  const gf = c.createLinearGradient(0, 256, 0, 290); gf.addColorStop(0, "#e6dcc4"); gf.addColorStop(1, "rgba(244,240,230,0)"); c.fillStyle = gf; c.fillRect(0, 256, 256, 34);
  fill(COCO.shell, "#5b3a1f");
  streaks(c, COCO.shell.x, COCO.shell.y, 256, 256, { n: 70, color: "rgba(35,20,8,1)", alpha: 0.6, lenMin: 60, lenMax: 250, width: 2, seed: 57 });
  cocoCache = ctex(el);
  return cocoCache;
}

// ---- banana skin (256×64): u = stem → tip
let banCache: THREE.Texture | null = null;
function bananaTexture() {
  if (banCache) return banCache;
  const [el, c] = cnv(256, 64);
  const g = c.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, "#5a4a22"); g.addColorStop(0.06, "#7c8a2c"); g.addColorStop(0.16, "#d8c532"); g.addColorStop(0.3, "#f6cf2c");
  g.addColorStop(0.85, "#f4c322"); g.addColorStop(0.94, "#b8862a"); g.addColorStop(1, "#3a2812");
  c.fillStyle = g; c.fillRect(0, 0, 256, 64);
  // ridge shading around (v) + speckles
  for (let i = 0; i < 5; i++) { const y = (i / 5) * 64; const gg = c.createLinearGradient(0, y, 0, y + 12.8); gg.addColorStop(0, "rgba(255,245,190,0.22)"); gg.addColorStop(0.5, "rgba(0,0,0,0)"); gg.addColorStop(1, "rgba(120,80,10,0.18)"); c.fillStyle = gg; c.fillRect(0, y, 256, 12.8); }
  const R = rng(61);
  for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(90,55,20,${0.3 + R() * 0.5})`; c.beginPath(); c.ellipse(40 + R() * 190, R() * 64, 0.8 + R() * 2.2, 0.8 + R() * 1.4, 0, 0, TAU); c.fill(); }
  banCache = ctex(el, true, false);
  return banCache;
}

// ---- container decal atlas (1024²): the yellow box's brown "BANANA CO." + banana-bunch stencil, the blue box's text
const DEC_S = 1024;
const DEC = { yellow: { x: 0, y: 0, w: 1024, h: 512 }, blue: { x: 0, y: 512, w: 1024, h: 300 } };
let decCache: THREE.Texture | null = null;
function decalAtlas() {
  if (decCache) return decCache;
  const [el, c] = cnv(DEC_S, DEC_S);
  const brown = "rgba(74,42,16,0.94)";
  // yellow: text along the bottom, a 3-finger bunch above-right (target art: stencilled, weathered)
  const Y = DEC.yellow;
  stencilText(c, "BANANA CO.", Y.x + 36, Y.y + Y.h * 0.86, { size: 150, color: brown, wear: 0.28, seed: 21, letterSpacing: 4, font: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif", weight: 400 });
  {
    // stencilled bunch: 3 crescent fingers fanned from one crown, a stencil gap between them, worn like the text
    const [bel, bc] = cnv(420, 420);
    const cx = 210, cy = 205, L = 250;
    const fingers: Array<[number, number, number]> = [[-44, 18, -2.0], [0, 0, -1.62], [46, 10, -1.25]];
    for (const [dx, dy, rot] of fingers) {
      bc.save(); bc.globalCompositeOperation = "destination-out"; bananaPath(bc, cx + dx, cy + dy, L, rot); bc.lineWidth = 16; bc.stroke(); bc.restore();
      bc.fillStyle = brown; bananaPath(bc, cx + dx, cy + dy, L, rot); bc.fill();
    }
    bc.fillStyle = brown; bc.beginPath(); bc.ellipse(cx + 8, cy - 118, 30, 22, 0.2, 0, TAU); bc.fill();          // crown
    bc.fillRect(cx - 4, cy - 150, 22, 40);                                                                     // stalk
    wearOut(bc, 0, 0, 420, 420, 0.3, 23, 0.5);
    c.drawImage(bel, Y.x + Y.w * 0.62, Y.y + 6, 380, 380);
  }
  // blue: yellow text, centred
  const B = DEC.blue;
  stencilText(c, "BANANA CO.", B.x + B.w / 2, B.y + B.h * 0.74, { size: 170, color: "rgba(244,206,40,0.95)", align: "center", wear: 0.22, seed: 22, letterSpacing: 6, font: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif", weight: 400 });
  decCache = ctex(el);
  return decCache;
}

// ---- sand decal atlas (512²): slide trail, footprint, soft contact shadow
const SAND_S = 512;
const SAND = { trail: { x: 0, y: 0, w: 512, h: 256 }, foot: { x: 0, y: 256, w: 256, h: 256 }, shadow: { x: 256, y: 256, w: 256, h: 256 } };
let sandCache: { trail: THREE.Texture; shadow: THREE.Texture } | null = null;
function sandTextures() {
  if (sandCache) return sandCache;
  const [el, c] = cnv(SAND_S, SAND_S);
  // trail: churned darker sand with ridge crests, alpha fades at the edges
  const t = SAND.trail;
  const R = rng(71);
  for (let i = 0; i < 1400; i++) {
    const u = R(), v = R(), edge = Math.sin(Math.PI * v) * Math.min(1, u * 5) * Math.min(1, (1 - u) * 2.2);
    if (R() > edge) continue;
    const x = t.x + u * t.w, y = t.y + v * t.h, rr = 2 + R() * 7;
    c.fillStyle = R() < 0.55 ? `rgba(150,112,70,${0.25 + R() * 0.35})` : `rgba(245,222,178,${0.2 + R() * 0.35})`;
    c.beginPath(); c.ellipse(x, y, rr * 1.8, rr, (R() - 0.5) * 0.6, 0, TAU); c.fill();
  }
  for (let k = 0; k < 9; k++) { // ridges along the slide
    const v = 0.2 + k * 0.075;
    c.strokeStyle = k % 2 ? "rgba(140,100,60,0.35)" : "rgba(255,236,196,0.4)"; c.lineWidth = 3 + R() * 3;
    c.beginPath(); c.moveTo(t.x + 20, t.y + v * t.h); for (let x = 20; x < t.w - 10; x += 24) c.lineTo(t.x + x, t.y + v * t.h + Math.sin(x * 0.05 + k) * 4); c.stroke();
  }
  // footprint (kong: wide oval + 4 toe dents)
  const f = SAND.foot, fx = f.x + f.w / 2, fy = f.y + f.h / 2;
  c.fillStyle = "rgba(140,104,64,0.55)"; c.beginPath(); c.ellipse(fx, fy + 20, 46, 78, 0, 0, TAU); c.fill();
  c.fillStyle = "rgba(250,230,190,0.5)"; c.lineWidth = 6; c.strokeStyle = "rgba(250,230,190,0.5)"; c.beginPath(); c.ellipse(fx, fy + 20, 50, 82, 0, 0, TAU); c.stroke();
  for (let i = 0; i < 4; i++) { c.fillStyle = "rgba(130,95,58,0.6)"; c.beginPath(); c.ellipse(fx - 36 + i * 24, fy - 72 + Math.abs(i - 1.5) * 8, 11, 15, 0, 0, TAU); c.fill(); }
  // shadow blob: soft rounded rect
  const s = SAND.shadow, g = c.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, 10, s.x + s.w / 2, s.y + s.h / 2, s.w * 0.5);
  g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.55, "rgba(0,0,0,0.8)"); g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g; c.fillRect(s.x, s.y, s.w, s.h);
  const tex = ctex(el);
  sandCache = { trail: tex, shadow: tex };
  return sandCache;
}

// ---- FX sprites (all additive except puff): soft glow, spiked star burst, hot core, flame petal, streak, dust puff
interface FxTex { glow: THREE.Texture; star: THREE.Texture; core: THREE.Texture; petal: THREE.Texture; streak: THREE.Texture; puff: THREE.Texture; flash: THREE.Texture }
let fxCache: FxTex | null = null;
function fxTextures(): FxTex {
  if (fxCache) return fxCache;
  const R = rng(81);
  // glow: wide warm halo (the "light in the air" around a flash)
  const [gel, g] = cnv(256, 256);
  let rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, "rgba(255,244,210,1)"); rg.addColorStop(0.12, "rgba(255,214,120,0.8)"); rg.addColorStop(0.35, "rgba(255,164,52,0.32)");
  rg.addColorStop(0.65, "rgba(255,122,30,0.08)"); rg.addColorStop(1, "rgba(255,100,20,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  // star: 4 long + 4 short tapered spikes + fine hair spikes, white → yellow → orange
  const [sel, s] = cnv(512, 512);
  const c = 256;
  s.globalCompositeOperation = "lighter";
  const spike = (a: number, len: number, w: number, hot: number) => {
    const ex = c + Math.cos(a) * len, ey = c + Math.sin(a) * len, px = -Math.sin(a), py = Math.cos(a);
    const gg = s.createLinearGradient(c, c, ex, ey);
    gg.addColorStop(0, `rgba(255,255,240,${hot})`); gg.addColorStop(0.3, `rgba(255,232,140,${hot * 0.85})`); gg.addColorStop(0.7, `rgba(255,170,50,${hot * 0.35})`); gg.addColorStop(1, "rgba(255,130,30,0)");
    s.fillStyle = gg;
    s.beginPath();
    s.moveTo(c + px * w - Math.cos(a) * w, c + py * w - Math.sin(a) * w);
    s.quadraticCurveTo(c + px * w * 0.45 + Math.cos(a) * len * 0.4, c + py * w * 0.45 + Math.sin(a) * len * 0.4, ex, ey);
    s.quadraticCurveTo(c - px * w * 0.45 + Math.cos(a) * len * 0.4, c - py * w * 0.45 + Math.sin(a) * len * 0.4, c - px * w - Math.cos(a) * w, c - py * w - Math.sin(a) * w);
    s.closePath(); s.fill();
  };
  const a0 = 0.35;
  [0.98, 0.78, 0.9, 0.7].forEach((l, i) => spike(a0 + i * Math.PI / 2 + (R() - 0.5) * 0.12, l * 250, 20, 1));
  [0.5, 0.42, 0.55, 0.38].forEach((l, i) => spike(a0 + Math.PI / 4 + i * Math.PI / 2 + (R() - 0.5) * 0.2, l * 250, 12, 0.85));
  for (let i = 0; i < 10; i++) spike(R() * TAU, (0.25 + R() * 0.4) * 250, 3 + R() * 3, 0.6);
  rg = s.createRadialGradient(c, c, 0, c, c, 90);
  rg.addColorStop(0, "rgba(255,255,245,1)"); rg.addColorStop(0.35, "rgba(255,236,160,0.7)"); rg.addColorStop(1, "rgba(255,170,50,0)");
  s.fillStyle = rg; s.fillRect(0, 0, 512, 512);
  // core: small white-hot disc
  const [cel, cc] = cnv(128, 128);
  rg = cc.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.32, "rgba(255,252,232,0.95)"); rg.addColorStop(0.6, "rgba(255,226,150,0.35)"); rg.addColorStop(1, "rgba(255,200,100,0)");
  cc.fillStyle = rg; cc.fillRect(0, 0, 128, 128);
  // petal: flame tongue, base at the bottom (v=0) → tip at the top; outer orange, inner white-yellow tongue
  const [pel2, pf] = cnv(128, 256);
  const tongue = (w: number, top: number, cols: [string, string, string]) => {
    const gg = pf.createLinearGradient(0, 256, 0, top);
    gg.addColorStop(0, cols[0]); gg.addColorStop(0.45, cols[1]); gg.addColorStop(1, cols[2]);
    pf.fillStyle = gg; pf.beginPath(); pf.moveTo(64, 250);
    pf.bezierCurveTo(64 + w, 215, 64 + w * 0.8, top + 60, 64, top); pf.bezierCurveTo(64 - w * 0.8, top + 60, 64 - w, 215, 64, 250); pf.fill();
  };
  pf.filter = "blur(3px)";
  tongue(58, 8, ["rgba(255,210,110,0.9)", "rgba(255,160,40,0.55)", "rgba(255,110,20,0)"]);
  pf.filter = "blur(2px)";
  tongue(34, 50, ["rgba(255,255,235,1)", "rgba(255,236,150,0.85)", "rgba(255,190,70,0)"]);
  tongue(14, 110, ["rgba(255,255,255,1)", "rgba(255,255,230,0.9)", "rgba(255,240,180,0)"]);
  pf.filter = "none";
  // streak: tail (u=0) transparent → head (u=1) bright, gaussian across
  const [tel, t] = cnv(256, 32);
  let lg = t.createLinearGradient(0, 0, 256, 0);
  lg.addColorStop(0, "rgba(255,150,40,0)"); lg.addColorStop(0.55, "rgba(255,196,80,0.3)"); lg.addColorStop(0.9, "rgba(255,238,160,0.85)"); lg.addColorStop(1, "rgba(255,250,220,0.9)");
  t.fillStyle = lg; t.fillRect(0, 0, 256, 32);
  lg = t.createLinearGradient(0, 0, 0, 32); lg.addColorStop(0, "rgba(0,0,0,1)"); lg.addColorStop(0.5, "rgba(0,0,0,0)"); lg.addColorStop(1, "rgba(0,0,0,1)");
  t.globalCompositeOperation = "destination-out"; t.fillStyle = lg; t.fillRect(0, 0, 256, 32);
  // puff: lumpy soft blob (alpha), brightness in red channel (top lit)
  const [pel, p] = cnv(128, 128);
  for (let i = 0; i < 16; i++) {
    const a = R() * TAU, rr = R() * 28, x = 64 + Math.cos(a) * rr, y = 64 + Math.sin(a) * rr, rad = 16 + R() * 22;
    const lit = Math.round(150 + 100 * Math.min(1, Math.max(0, 1 - (y - 30) / 70)));
    const pg = p.createRadialGradient(x, y, 0, x, y, rad); pg.addColorStop(0, `rgba(${lit},${lit},${lit},0.6)`); pg.addColorStop(1, `rgba(${lit},${lit},${lit},0)`);
    p.fillStyle = pg; p.beginPath(); p.arc(x, y, rad, 0, TAU); p.fill();
  }
  const mk = (el: HTMLCanvasElement) => { const tx = ctex(el); tx.anisotropy = 4; return tx; };
  // one additive atlas for every flash part (a flash = 2 draws: camera-facing glow/star/core + barrel petals/sparks)
  const [ael, ac] = cnv(FLASH_ATLAS.w, FLASH_ATLAS.h);
  ac.drawImage(sel, FA.star.x, FA.star.y); ac.drawImage(gel, FA.glow.x, FA.glow.y); ac.drawImage(cel, FA.core.x, FA.core.y);
  ac.drawImage(pel2, FA.petal.x, FA.petal.y); ac.drawImage(tel, FA.streak.x, FA.streak.y);
  fxCache = { glow: mk(gel), star: mk(sel), core: mk(cel), petal: mk(pel2), streak: mk(tel), puff: mk(pel), flash: mk(ael) };
  return fxCache;
}
/** flash atlas layout (px) */
const FLASH_ATLAS = { w: 1024, h: 512 };
const FA = { star: { x: 0, y: 0, w: 512, h: 512 }, glow: { x: 512, y: 0, w: 256, h: 256 }, core: { x: 768, y: 0, w: 128, h: 128 }, petal: { x: 896, y: 0, w: 128, h: 256 }, streak: { x: 512, y: 256, w: 256, h: 32 } };
/** remap a geometry's 0..1 uvs into an atlas rect + give it a constant (HDR) vertex colour */
function toAtlas(g: THREE.BufferGeometry, r: Rect, col: THREE.Color): THREE.BufferGeometry {
  const q = g.index ? g.toNonIndexed() : g.clone();
  const uv = q.getAttribute("uv") as THREE.BufferAttribute, n = uv.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const [u, v] = ruv(r, FLASH_ATLAS.w, FLASH_ATLAS.h, uv.getX(i), uv.getY(i)); uv.setXY(i, u, v); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  q.setAttribute("color", new THREE.BufferAttribute(c, 3));
  if (q.getAttribute("normal")) q.deleteAttribute("normal");
  return q;
}

// ============================================================================================ geometry builders
/** wooden crate (bottom centred at origin), plank panels inset, battens on every edge, diagonal braces */
function addCrate(mb: MB, m: THREE.Matrix4, sx: number, sy: number, sz: number, face: Rect) {
  const U = (r: Rect) => (u: number, v: number): [number, number] => ruv(r, WOOD_S, WOOD_S, u, v);
  const t = 0.075, ins = 0.028;
  mb.add(new THREE.BoxGeometry(sx - 2 * ins, sy - 2 * ins, sz - 2 * ins), m.clone().multiply(TRS(0, sy / 2, 0)), U(face));
  const bat = (w: number, h: number, d: number, x: number, y: number, z: number) => mb.add(new THREE.BoxGeometry(w, h, d), m.clone().multiply(TRS(x, y, z)), U(WOOD.batten));
  for (const ex of [-1, 1]) for (const ez of [-1, 1]) bat(t, sy, t, ex * (sx / 2 - t / 2), sy / 2, ez * (sz / 2 - t / 2));
  for (const ey of [t / 2, sy - t / 2]) {
    for (const ez of [-1, 1]) bat(sx - 2 * t, t, t, 0, ey, ez * (sz / 2 - t / 2));
    for (const ex of [-1, 1]) bat(t, t, sz - 2 * t, ex * (sx / 2 - t / 2), ey, 0);
  }
  // diagonal braces on the four vertical faces
  const br = (w: number, h: number, pos: THREE.Vector3, axis: "x" | "z", sign: number) => {
    const len = Math.hypot(w, h), ang = Math.atan2(h, w) * sign;
    const mm = axis === "z" ? TRS(pos.x, pos.y, pos.z, 0, 0, ang) : TRS(pos.x, pos.y, pos.z, 0, Math.PI / 2, 0).multiply(TRS(0, 0, 0, 0, 0, ang));
    mb.add(new THREE.BoxGeometry(len - 0.05, 0.075, 0.022), m.clone().multiply(mm), U(WOOD.batten));
  };
  br(sx - 2 * t, sy - 2 * t, new THREE.Vector3(0, sy / 2, sz / 2 - 0.01), "z", 1);
  br(sx - 2 * t, sy - 2 * t, new THREE.Vector3(0, sy / 2, -sz / 2 + 0.01), "z", -1);
  br(sz - 2 * t, sy - 2 * t, new THREE.Vector3(sx / 2 - 0.01, sy / 2, 0), "x", 1);
  br(sz - 2 * t, sy - 2 * t, new THREE.Vector3(-sx / 2 + 0.01, sy / 2, 0), "x", -1);
}

/** watchtower: splayed legs, X-braces, mid landing, deck + half-walled cabin, hip roof, ladder. `legH` = deck height:
 *  7.1 = a stilt tower; ~1.3 = the target art's lookout cabin sitting on a container stack (short posts, no landing) */
function addTower(mb: MB, m: THREE.Matrix4, legH = 7.1) {
  const U = (r: Rect) => (u: number, v: number): [number, number] => ruv(r, WOOD_S, WOOD_S, u, v);
  const T = U(WOOD.tower), P = U(WOOD.plank), D = U(WOOD.dark);
  const beam = (a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, uv = T) => mb.add(new THREE.BoxGeometry(a.distanceTo(b), h, w), m.clone().multiply(beamMatrix(a, b)), uv);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const DY = legH, CY = legH + 2.6, short = legH < 3, B = short ? 1.8 : 2.15, Tt = 1.75;
  const leg = (sx: number, sz: number, y: number) => { const k = y / DY; const s = B + (Tt - B) * Math.min(1, k); return v(sx * s, y, sz * s); };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    beam(leg(sx, sz, -0.3), leg(sx, sz, DY), 0.26, 0.26);
    beam(v(sx * Tt, DY, sz * Tt), v(sx * Tt, CY, sz * Tt), 0.18, 0.18);
  }
  for (const y of short ? [DY - 0.1] : [0.5, 3.7, DY - 0.1]) {
    for (const s of [-1, 1]) {
      beam(leg(-1, s, y), leg(1, s, y), 0.1, 0.2);
      beam(leg(s, -1, y), leg(s, 1, y), 0.1, 0.2);
    }
  }
  for (const [y0, y1] of short ? [] : [[0.5, 3.7], [3.7, DY - 0.1]]) for (const s of [-1, 1]) {
    beam(leg(-1, s, y0), leg(1, s, y1), 0.06, 0.16); beam(leg(1, s, y0), leg(-1, s, y1), 0.06, 0.16);
    beam(leg(s, -1, y0), leg(s, 1, y1), 0.06, 0.16); beam(leg(s, 1, y0), leg(s, -1, y1), 0.06, 0.16);
  }
  // mid landing (ladder side) + deck
  if (!short) mb.add(new THREE.BoxGeometry(1.6, 0.12, 1.3), m.clone().multiply(TRS(0.9, 3.8, 1.2)), P);
  mb.add(new THREE.BoxGeometry(2 * Tt + 0.9, 0.16, 2 * Tt + 0.9), m.clone().multiply(TRS(0, DY + 0.08, 0)), P);
  for (const s of [-1, 1]) mb.add(new THREE.BoxGeometry(2 * Tt + 0.9, 0.22, 0.16), m.clone().multiply(TRS(0, DY - 0.12, s * (Tt + 0.3))), T);
  // cabin half walls (3 sides) + rail on the front
  const hwY = DY + 0.16, wallH = 1.05, e = Tt + 0.4;
  mb.add(new THREE.BoxGeometry(2 * e, wallH, 0.07), m.clone().multiply(TRS(0, hwY + wallH / 2, -e)), T);
  mb.add(new THREE.BoxGeometry(0.07, wallH, 2 * e), m.clone().multiply(TRS(-e, hwY + wallH / 2, 0)), T);
  mb.add(new THREE.BoxGeometry(0.07, wallH, 2 * e), m.clone().multiply(TRS(e, hwY + wallH / 2, 0)), T);
  for (const x of [-e, -e / 2, 0, e / 2, e]) beam(v(x, hwY, e), v(x, hwY + wallH, e), 0.08, 0.08);
  beam(v(-e, hwY + wallH, e), v(e, hwY + wallH, e), 0.1, 0.1); beam(v(-e, hwY + wallH * 0.5, e), v(e, hwY + wallH * 0.5, e), 0.06, 0.08);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(v(sx * e, hwY, sz * e), v(sx * e, CY, sz * e), 0.14, 0.14);
  // roof: hip pyramid + fascia
  const roof = new THREE.ConeGeometry(e * 1.62, 1.35, 4, 1, false);
  mb.add(roof, m.clone().multiply(TRS(0, CY + 0.72, 0, 0, Math.PI / 4, 0)), T);
  for (const s of [-1, 1]) {
    beam(v(-e - 0.35, CY + 0.02, s * (e + 0.35)), v(e + 0.35, CY + 0.02, s * (e + 0.35)), 0.06, 0.2);
    beam(v(s * (e + 0.35), CY + 0.02, -e - 0.35), v(s * (e + 0.35), CY + 0.02, e + 0.35), 0.06, 0.2);
  }
  mb.add(new THREE.BoxGeometry(2 * e, 0.08, 2 * e), m.clone().multiply(TRS(0, CY - 0.02, 0)), D);
  // ladder on the +Z side
  const lz0 = B + 0.35, lz1 = Tt + 0.45;
  if (!short) {
    for (const lx of [0.35, 1.0]) beam(v(lx, -0.2, lz0), v(lx, DY + 0.1, lz1), 0.07, 0.07);
    for (let y = 0.3; y < DY; y += 0.34) { const z = lz0 + (lz1 - lz0) * (y / DY); beam(v(0.35, y, z), v(1.0, y, z), 0.05, 0.05); }
  }
}

/** leaf blade: grid along +Y (length) with +Z face, droop (tip bends to −Z), cup (edges up), twist; uv into rect */
export function leafGeo(len: number, wid: number, rect: Rect, o: { droop?: number; cup?: number; twist?: number; segL?: number; segW?: number } = {}) {
  const segL = o.segL ?? 8, segW = o.segW ?? 4;
  const g = new THREE.PlaneGeometry(1, 1, segW, segL);
  const pos = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const s = pos.getX(i) + 0.5, t = pos.getY(i) + 0.5;
    const x0 = (s - 0.5) * wid, y0 = t * len;
    const cup = (o.cup ?? 0.12) * wid * Math.pow(Math.abs(s - 0.5) * 2, 1.6);
    const droop = -(o.droop ?? 0.3) * len * t * t;
    const tw = (o.twist ?? 0) * t;
    const x = x0 * Math.cos(tw) - cup * Math.sin(tw), z = x0 * Math.sin(tw) + cup * Math.cos(tw) + droop;
    const y = y0 * Math.cos((o.droop ?? 0.3) * t * 0.6);
    pos.setXYZ(i, x, y, z);
    const [u, v] = ruv(rect, FOL_S, FOL_S, s, t);
    uv.setXY(i, u, v);
  }
  g.computeVertexNormals();
  return g;
}

/** a real 3D fern frond (not a flat decal) — a drooping rachis carrying pairs of tapered
 *  leaflets (the atlas's broad leaf), each swept toward the tip and lifted out of the frond plane in a V, so the frond
 *  has depth + self-shading from every angle. Same frame as leafGeo (length along +Y, face +Z). */
export function fernFrondGeo(len: number, wid: number, o: { droop?: number; twist?: number; pairs?: number } = {}) {
  const droop = o.droop ?? 0.3, N = o.pairs ?? 18, parts: THREE.BufferGeometry[] = [];
  const at = (t: number) => new THREE.Vector3(0, t * len * Math.cos(droop * t * 0.6), -droop * len * t * t);
  // rachis: a thin tapered strip (two crossed ribbons)
  for (const rot of [0, Math.PI / 2]) {
    const r = leafGeo(len, 0.012, FOL.stem, { droop, cup: 0, twist: 0, segL: 8, segW: 1 });
    r.rotateY(rot); parts.push(r);
  }
  for (let i = 0; i < N; i++) {
    const t = 0.06 + 0.9 * (i / (N - 1));
    const p = at(t), tan = at(Math.min(1, t + 0.02)).sub(at(Math.max(0, t - 0.02))).normalize();
    const tw = (o.twist ?? 0) * t;
    const nrm = new THREE.Vector3(Math.sin(tw), 0, Math.cos(tw));
    nrm.addScaledVector(tan, -nrm.dot(tan)).normalize();
    const side = new THREE.Vector3().crossVectors(tan, nrm).normalize();
    // fern taper: widest a third of the way out, tiny at the tip
    const pl = wid * 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 0.8) * (1 - 0.55 * t);
    if (pl < 0.02) continue;
    for (const sg of [1, -1]) {
      const g = leafGeo(pl, pl * 0.3, FOL.broad, { droop: 0.18, cup: 0.35, twist: 0, segL: 3, segW: 2 });
      // leaflet axis: out to the side, swept 0.55 rad toward the tip, lifted 0.4 rad out of the frond plane
      const ax = side.clone().multiplyScalar(sg * Math.cos(0.55)).addScaledVector(tan, Math.sin(0.55)).addScaledVector(nrm, 0.42).normalize();
      const zn = nrm.clone().addScaledVector(ax, -nrm.dot(ax)).normalize();
      const xn = new THREE.Vector3().crossVectors(ax, zn).normalize();
      g.applyMatrix4(new THREE.Matrix4().makeBasis(xn, ax, zn).setPosition(p));
      parts.push(g);
    }
  }
  for (const g of parts) { for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k); }
  const out = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  out.computeVertexNormals();
  return out;
}

/** coconut (husk) — slightly elongated, 3 soft ridges, stem end at +Y */
function coconutGeo(r: number, rect: Rect) {
  const g = new THREE.SphereGeometry(r, 36, 22);   // (18 × 12 showed a polygonal silhouette at 4K)
  const pos = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x), k = 1 + 0.05 * Math.cos(3 * a) * (1 - Math.abs(y / r));
    pos.setXYZ(i, x * k, y * 1.12 + (y > 0 ? 0.08 * r * (y / r) ** 4 : 0), z * k);
    const [u, v] = ruv(rect, COCO_S, COCO_S, uv.getX(i), uv.getY(i)); uv.setXY(i, u, v);
  }
  g.computeVertexNormals();
  return g;
}
/** half coconut (cut plane at y=0, cavity up): outer husk, flesh rim, flesh cavity */
function halfCocoGeo(r: number, husk: Rect = COCO.green) {
  const prof: THREE.Vector2[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) { const a = (i / N) * (Math.PI / 2); prof.push(new THREE.Vector2(Math.max(0.001, Math.sin(a) * r), -Math.cos(a) * r * 1.1)); }
  prof.push(new THREE.Vector2(r * 0.8, 0.005));
  for (let i = 0; i <= 5; i++) { const a = (1 - i / 5) * (Math.PI / 2); prof.push(new THREE.Vector2(Math.max(0.001, Math.sin(a) * r * 0.78), -Math.cos(a) * r * 0.72 + 0.004)); }
  const g = new THREE.LatheGeometry(prof, 36);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const nP = prof.length;
  for (let i = 0; i < uv.count; i++) {
    const j = i % nP; // lathe: rows per segment
    const outer = j <= N;
    const [u, v] = ruv(outer ? husk : COCO.flesh, COCO_S, COCO_S, uv.getX(i), outer ? 1 - j / N : (j - N) / (nP - N));
    uv.setXY(i, u, v);
  }
  g.computeVertexNormals();
  return g;
}
/** banana: pentagonal curved tube, stem at u=0, tip at u=1; length ≈ len, bends toward +Y */
function bananaGeo(len = 0.24, rad = 0.02) {
  const segL = 12, segR = 10, Rc = len * 1.25, span = len / Rc;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segL; i++) {
    const t = i / segL, a = -span / 2 + t * span;
    const cx = Math.sin(a) * Rc, cy = (1 - Math.cos(a)) * Rc - Rc * (1 - Math.cos(span / 2));
    const tx = Math.cos(a), ty = Math.sin(a); // tangent
    const rr = (t < 0.08 ? 0.35 + t * 6 : Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.02) / 0.98)), 0.55)) * rad * (t > 0.92 ? 0.7 : 1);
    for (let j = 0; j <= segR; j++) {
      const b = (j / segR) * TAU, ridge = 1 - 0.09 * Math.abs(Math.cos(2.5 * b));
      const nx = -ty * Math.cos(b), ny = tx * Math.cos(b), nz = Math.sin(b);
      pos.push(cx + nx * rr * ridge, cy + ny * rr * ridge, nz * rr * ridge);
      uv.push(t, j / segR);
    }
  }
  for (let i = 0; i < segL; i++) for (let j = 0; j < segR; j++) { const a = i * (segR + 1) + j, b = a + segR + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** jittered pebble */
function pebbleGeo(seed: number) {
  // a merged (indexed) detail-3 sphere: smooth normals, rounded silhouette
  const g0 = new THREE.IcosahedronGeometry(1, 3); g0.deleteAttribute("uv"); g0.deleteAttribute("normal");
  const g = mergeVertices(g0); g0.dispose();
  const R = rng(seed), pos = g.getAttribute("position") as THREE.BufferAttribute;
  const cache = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let s = cache.get(k); if (s === undefined) { s = 0.88 + 0.12 * Math.sin(x * 3.1 + seed) * Math.sin(z * 2.7 + y * 1.3) + R() * 0.04; cache.set(k, s); }
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.62, pos.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}
/** coconut shell chip (curved triangle fan) */
function chipGeo() {
  const g = new THREE.CircleGeometry(1, 5);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, -0.35 * (x * x + y * y)); }
  g.computeVertexNormals();
  return g;
}

// ============================================================================================ FX system
// Muzzle flash = billboard stack (wide glow, spiked star with a random roll, white-hot core) + crossed flame petals and
// side jets along the barrel + spark needles + a warm point light. Rounds = spinning banana (instanced, emissive) with a
// tapered camera-facing streak and a glow halo. Sand = instanced camera-facing particles: grains (lit discs), chunky
// clumps (lumpy lit silhouettes) and soft dust puffs; coconut chips are tiny instanced shells.
/** NO point lights: a zero-intensity PointLight still costs every lit pixel of the frame, and toggling one recompiles
 *  every program. The flash's glow billboards + the shooter kong's fill pulse carry the light. */
interface Flash { root: THREE.Group; bill: THREE.Mesh; barrel: THREE.Mesh; age: number; life: number; on: boolean; size: number }
interface Shot { pos: THREE.Vector3; vel: THREE.Vector3; spin: number; age: number; life: number; on: boolean }
interface Particle { p: THREE.Vector3; v: THREE.Vector3; size: number; grow: number; alpha: number; kind: number; rot: number; spin: number; age: number; life: number; drag: number; grav: number }
interface Frag { p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; w: THREE.Vector3; s: number; age: number; life: number; flesh: boolean }
export interface BurstOpts { n?: number; dir?: THREE.Vector3; spread?: number; speed?: number; seed?: number; advance?: number; puffs?: number; clumps?: number; scale?: number; puffSpeed?: number }

const MAX_SHOTS = 16, MAX_PART = 2400, MAX_FRAG = 48, FLASH_LIFE = 0.06, ROUND_SPEED = 34;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** crossed flame petals (3 around the barrel) + 4 short side jets, base at the origin, pointing +X */
function petalGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) { const g = new THREE.PlaneGeometry(0.3, 0.66); g.translate(0, 0.33, 0); g.rotateZ(-Math.PI / 2); g.rotateX((k * Math.PI) / 3); parts.push(g); }
  for (let k = 0; k < 4; k++) {
    const g = new THREE.PlaneGeometry(0.15, 0.3); g.translate(0, 0.15, 0); g.rotateZ(-Math.PI / 2 + (k % 2 ? 1 : -1) * 1.1); g.rotateX(k < 2 ? 0 : Math.PI / 2); g.translate(0.04, 0, 0); parts.push(g);
  }
  return mergeGeometries(parts)!;
}
/** spark needles in a 35° cone around +X (crossed thin quads, uv u = along) */
function sparkGeometry(seed: number): THREE.BufferGeometry {
  const R = rng(seed), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const len = 0.18 + R() * 0.34, r0 = 0.08 + R() * 0.06;
    for (const rx of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(len, 0.016); g.translate(r0 + len / 2, 0, 0); g.rotateX(rx);
      g.rotateZ((R() - 0.5) * 1.2); g.rotateY((R() - 0.5) * 1.2); parts.push(g);
    }
  }
  return mergeGeometries(parts)!;
}

class FX {
  group = new THREE.Group();
  flashes: Flash[] = [];
  shots: Shot[] = [];
  bananas: THREE.InstancedMesh;
  streakGeo: THREE.BufferGeometry;
  haloGeo: THREE.BufferGeometry;
  parts: Particle[] = [];
  partGeo: THREE.InstancedBufferGeometry;
  partMesh: THREE.Mesh;
  frags: Frag[] = [];
  fragMesh: THREE.InstancedMesh;
  private tmpM = new THREE.Matrix4(); private tmpQ = new THREE.Quaternion(); private tmpS = new THREE.Vector3();
  constructor(private ctx: WorldCtx, private ground: (x: number, z: number) => number, bananaGeometry: THREE.BufferGeometry, bananaMat: THREE.Material) {
    const tx = fxTextures();
    this.group.name = "firefight-fx";
    const add = (map: THREE.Texture, color: THREE.Color) => new THREE.MeshBasicMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
    const quad = new THREE.PlaneGeometry(1, 1);
    // flash: ONE atlas material (vertex colours carry each part's HDR tint), 2 meshes per flash
    const flashMat = new THREE.MeshBasicMaterial({ map: tx.flash, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
    const billGeo = mergeGeometries([
      toAtlas(quad.clone().scale(0.95, 0.95, 1), FA.glow, new THREE.Color(1.1, 0.7, 0.3)),
      toAtlas(quad.clone().scale(0.78, 0.78, 1), FA.star, new THREE.Color(2.6, 2.1, 1.3)),
      toAtlas(quad.clone().scale(0.24, 0.24, 1), FA.core, new THREE.Color(5, 4.4, 3.4)),
    ])!;
    const petalGeo = toAtlas(petalGeometry(), FA.petal, new THREE.Color(2.4, 1.8, 1.0));
    for (let i = 0; i < 3; i++) {
      const root = new THREE.Group();
      const bill = new THREE.Mesh(billGeo, flashMat);
      const barrel = new THREE.Mesh(mergeGeometries([petalGeo, toAtlas(sparkGeometry(90 + i), FA.streak, new THREE.Color(3, 2.4, 1.4))])!, flashMat);
      root.add(bill, barrel); root.visible = false;
      for (const m of [bill, barrel]) { m.renderOrder = 10; m.frustumCulled = false; }
      this.group.add(root);
      this.flashes.push({ root, bill, barrel, age: 0, life: FLASH_LIFE, on: false, size: 1 });
    }
    this.bananas = new THREE.InstancedMesh(bananaGeometry, bananaMat, MAX_SHOTS);
    this.bananas.count = 0; this.bananas.castShadow = false; this.bananas.userData.castShadow = false; this.bananas.frustumCulled = false;
    this.group.add(this.bananas);
    for (let i = 0; i < MAX_SHOTS; i++) this.shots.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0, age: 0, life: 0, on: false });
    // streak ribbons + halo quads: 4 dynamic verts per shot each
    const ribbon = (uvs: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_SHOTS * 12), 3).setUsage(THREE.DynamicDrawUsage));
      const uv: number[] = [], idx: number[] = [];
      for (let i = 0; i < MAX_SHOTS; i++) { uv.push(...uvs); const b = i * 4; idx.push(b, b + 2, b + 1, b, b + 3, b + 2); }
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      return g;
    };
    this.streakGeo = ribbon([0, 0, 0, 1, 1, 1, 1, 0]);
    this.haloGeo = ribbon([0, 0, 0, 1, 1, 1, 1, 0]);
    const streak = new THREE.Mesh(this.streakGeo, add(tx.streak, new THREE.Color(1.6, 1.25, 0.7)));
    const halo = new THREE.Mesh(this.haloGeo, add(tx.glow, new THREE.Color(0.75, 0.55, 0.22)));
    for (const m of [streak, halo]) { m.frustumCulled = false; m.renderOrder = 9; this.group.add(m); }
    // sand particles: instanced camera-facing quads
    this.partGeo = new THREE.InstancedBufferGeometry();
    this.partGeo.index = quad.index; this.partGeo.setAttribute("position", quad.getAttribute("position")); this.partGeo.setAttribute("uv", quad.getAttribute("uv"));
    this.partGeo.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(MAX_PART * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.partGeo.setAttribute("iData", new THREE.InstancedBufferAttribute(new Float32Array(MAX_PART * 4), 4).setUsage(THREE.DynamicDrawUsage));
    this.partGeo.setAttribute("iVel", new THREE.InstancedBufferAttribute(new Float32Array(MAX_PART * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.partGeo.instanceCount = 0;
    const sun = (ctx.shared.get("sunDir") as THREE.Vector3 | undefined) ?? new THREE.Vector3(-0.47, 0.85, -0.29);
    const pmat = new THREE.ShaderMaterial({
      uniforms: { uPuff: { value: tx.puff }, uLit: { value: new THREE.Color("#efd19a") }, uShade: { value: new THREE.Color("#94703f") }, uSun: { value: sun } },
      vertexShader: /* glsl */`
        attribute vec3 iPos; attribute vec4 iData; attribute vec3 iVel; varying vec2 vUv; varying float vA; varying float vK; varying vec2 vSun; varying float vAsp;
        uniform vec3 uSun;
        void main(){
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float ang = iData.w, along = iData.x, across = iData.x;
          vAsp = 1.0;
          if (iData.z < 0.5) {
            // grain: a motion-blurred STREAK along its screen-space velocity (a 1/30 s shutter), never a bead
            vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
            float sp = length(vv.xy);
            if (sp > 1e-3) ang = atan(vv.y, vv.x);
            along = iData.x * (1.0 + min(2.2, sp * 0.8));
            vAsp = along / iData.x;
          }
          float c = cos(ang), s = sin(ang);
          vec2 q = mat2(c, s, -s, c) * (position.xy * vec2(along, across));
          mv.xy += q;
          gl_Position = projectionMatrix * mv;
          vUv = uv; vK = iData.z;
          // dust never fogs the camera: fade puffs within ~2 m of the camera
          vA = iData.y * (iData.z > 0.5 && iData.z < 1.5 ? smoothstep(0.9, 2.2, -mv.z) : 1.0);
          vec3 sv = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
          vSun = mat2(c, -s, s, c) * sv.xy; // sun direction in the rotated quad's frame
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uPuff; uniform vec3 uLit; uniform vec3 uShade;
        varying vec2 vUv; varying float vA; varying float vK; varying vec2 vSun; varying float vAsp;
        void main(){
          vec2 p = vUv - 0.5;
          vec4 outc;
          if (vK < 0.5) {                       // grain streak: lit capsule, bright head, fading tail
            vec2 q = vec2(p.x * vAsp, p.y);
            float hl = 0.5 * (vAsp - 1.0), dx = max(abs(q.x) - hl, 0.0);
            float d = length(vec2(dx, q.y)) * 2.0; if (d > 1.0) discard;
            vec3 n = vec3(sign(q.x) * dx * 2.0, q.y * 2.0, sqrt(max(0.0, 1.0 - d * d)));
            float l = clamp(0.35 + 0.8 * dot(n, normalize(vec3(vSun, 0.55))), 0.0, 1.15);
            float tail = vAsp > 1.05 ? smoothstep(-hl - 0.5, hl * 0.4, q.x) : 1.0;
            outc = vec4(mix(uShade, uLit * 1.08, l), smoothstep(1.0, 0.6, d) * vA * 0.85 * (0.2 + 0.8 * tail));
          } else if (vK < 1.5) {                // puff: soft dust
            vec4 t = texture2D(uPuff, vUv);
            float a = t.a * vA; if (a < 0.004) discard;
            float l = clamp(t.r * 0.9 + 0.25 * dot(normalize(p + 1e-4), normalize(vSun + 1e-4)), 0.0, 1.1);
            outc = vec4(mix(uShade, uLit, l), a);
          } else {                              // clump: lumpy chunk with a lit side and a dark rim
            vec4 t = texture2D(uPuff, vUv);
            float m = smoothstep(0.2, 0.26, t.a); if (m * vA < 0.05) discard;
            float rim = smoothstep(0.2, 0.4, t.a);
            float l = clamp(0.3 + 0.75 * dot(normalize(p + 1e-4), normalize(vSun + 1e-4)) * (1.0 - rim * 0.6) + 0.35 * t.r, 0.0, 1.1);
            outc = vec4(mix(uShade * 0.7, uLit, l), m * vA);
          }
          gl_FragColor = outc;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.partMesh = new THREE.Mesh(this.partGeo, pmat);
    this.partMesh.frustumCulled = false; this.partMesh.renderOrder = 8;
    this.group.add(this.partMesh);
    // coconut fragments
    const fragMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7, side: THREE.DoubleSide });
    this.fragMesh = new THREE.InstancedMesh(chipGeo(), fragMat, MAX_FRAG);
    this.fragMesh.count = 0; this.fragMesh.castShadow = false; this.fragMesh.userData.castShadow = false; this.fragMesh.frustumCulled = false;
    this.fragMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FRAG * 3), 3);
    this.group.add(this.fragMesh);
  }

  /** muzzle flash only (oriented along the barrel) */
  flash(from: THREE.Vector3, dir: THREE.Vector3, size = 1, seed = Math.random() * 1e9) {
    const R = rng(Math.floor(seed));
    const f = this.flashes.find((q) => !q.on) ?? this.flashes[0];
    f.on = true; f.age = 0; f.life = FLASH_LIFE; f.size = size;
    f.root.position.copy(from); f.root.visible = true;
    f.root.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
    f.root.scale.setScalar(size);
    f.bill.userData.roll = R() * TAU;
    f.barrel.rotation.x = R() * TAU; f.barrel.scale.set(0.9 + R() * 0.35, 1, 1);
    this.onFlash?.(from);
  }
  /** hook: a flash went off at this world point (the set warms the nearest kong's fill for a frame) */
  onFlash: ((at: THREE.Vector3) => void) | null = null;
  /** a round leaving `from` along `dir` (+ its flash unless flash=false); advance = seconds already flown */
  fire(from: THREE.Vector3, dir: THREE.Vector3, advance = 0, flash = true, flashDir?: THREE.Vector3) {
    const d = dir.clone().normalize();
    if (flash) this.flash(from, flashDir ?? d);
    const s = this.shots.find((q) => !q.on) ?? this.shots[0];
    s.on = true; s.age = 0; s.life = 2.2; s.spin = Math.random() * TAU;
    s.pos.copy(from).addScaledVector(d, 0.12); s.vel.copy(d).multiplyScalar(ROUND_SPEED);
    if (advance > 0) this.stepShot(s, advance);
  }
  /** a static banana flying at a point (debris / frozen shots) */
  placeShot(p: THREE.Vector3, vel: THREE.Vector3, spin: number) {
    const s = this.shots.find((q) => !q.on) ?? this.shots[0];
    s.on = true; s.age = 0.2; s.life = 3; s.spin = spin; s.pos.copy(p); s.vel.copy(vel);
  }
  sandBurst(p: THREE.Vector3, o: BurstOpts = {}) {
    const R = rng(o.seed ?? Math.floor(Math.random() * 1e9));
    const n = o.n ?? 60, dir = (o.dir ?? new THREE.Vector3(0, 1, 0)).clone().normalize(), spread = o.spread ?? 0.75, speed = o.speed ?? 4.5, sc = o.scale ?? 1;
    const born: Particle[] = [];
    const tan = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const bit = new THREE.Vector3().crossVectors(dir, tan);
    const nPuff = Math.round(o.puffs ?? n * 0.2), nClump = Math.round(o.clumps ?? n * 0.14);
    for (let i = 0; i < n; i++) {
      const kind = i < nPuff ? 1 : i < nPuff + nClump ? 2 : 0;
      const a = R() * TAU, sp = spread * Math.sqrt(R());
      const vMul = kind === 1 ? (o.puffSpeed ?? 0.35) + R() * 0.4 : kind === 2 ? 0.45 + R() * 0.6 : 0.5 + R() * 0.9;
      const v = dir.clone().addScaledVector(tan, Math.cos(a) * sp).addScaledVector(bit, Math.sin(a) * sp).normalize().multiplyScalar(speed * vMul);
      const size = kind === 1 ? 0.3 + R() * 0.45 : kind === 2 ? 0.03 + R() * 0.05 : 0.006 + R() * 0.012 + (R() < 0.08 ? 0.01 : 0);
      born.push({
        p: p.clone().add(new THREE.Vector3((R() - 0.5) * 0.25, R() * 0.08, (R() - 0.5) * 0.25).multiplyScalar(sc)), v,
        size: size * sc, grow: kind === 1 ? 0.9 + R() * 0.9 : 0, alpha: kind === 1 ? 0.55 + R() * 0.3 : 1,
        kind, rot: R() * TAU, spin: (R() - 0.5) * (kind === 2 ? 6 : 2), age: 0, life: kind === 1 ? 1.0 + R() * 0.8 : 0.8 + R() * 0.8,
        drag: kind === 1 ? 2.4 : kind === 2 ? 0.15 : 0.3, grav: kind === 1 ? 0.5 : 9.8,
      });
    }
    for (const q of born) { if (this.parts.length >= MAX_PART) this.parts.shift(); this.parts.push(q); }
    if (o.advance) for (const q of born) for (let t = 0; t < o.advance - 1e-6; t += 1 / 60) this.stepPart(q, Math.min(1 / 60, o.advance - t));
  }
  coconutHit(p: THREE.Vector3, o: { n?: number; seed?: number; advance?: number; up?: THREE.Vector3 } = {}) {
    const R = rng(o.seed ?? 5), n = o.n ?? 12, up = o.up ?? new THREE.Vector3(0, 1, 0);
    const born: Frag[] = [];
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(R() - 0.5, 0, R() - 0.5).normalize().multiplyScalar(1 + R() * 2.2).addScaledVector(up, 2.2 + R() * 2.5);
      born.push({ p: p.clone(), v, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)), w: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(18), s: 0.018 + R() * 0.026, age: 0, life: 1.6, flesh: R() < 0.45 });
    }
    for (const f of born) { if (this.frags.length >= MAX_FRAG) this.frags.shift(); this.frags.push(f); }
    if (o.advance) for (const f of born) for (let t = 0; t < o.advance - 1e-6; t += 1 / 60) this.stepFrag(f, Math.min(1 / 60, o.advance - t));
  }
  clear() { for (const f of this.flashes) { f.on = false; f.root.visible = false; } for (const s of this.shots) s.on = false; this.parts.length = 0; this.frags.length = 0; }

  private stepShot(s: Shot, dt: number) {
    for (let t = 0; t < dt - 1e-6 && s.on; t += 1 / 60) {
      const h = Math.min(1 / 60, dt - t);
      s.vel.y -= 1.5 * h; s.pos.addScaledVector(s.vel, h); s.age += h; s.spin += h * 26;
      if (s.age > s.life) s.on = false;
      else if (s.pos.y < this.ground(s.pos.x, s.pos.z) + 0.05 && s.age > 0.05) { s.on = false; this.sandBurst(s.pos, { n: 40, speed: 3.5 }); }
    }
  }
  private stepPart(q: Particle, dt: number) {
    q.age += dt;
    q.v.y -= q.grav * dt; q.v.multiplyScalar(Math.exp(-q.drag * dt));
    q.p.addScaledVector(q.v, dt);
    q.rot += q.spin * dt;
    const g = this.ground(q.p.x, q.p.z) + q.size * 0.3;
    if (q.p.y < g) { q.p.y = g; q.v.set(0, 0, 0); if (q.kind !== 1) q.life = Math.min(q.life, q.age + 0.15); }
  }
  private stepFrag(f: Frag, dt: number) {
    f.age += dt; f.v.y -= 9.8 * dt; f.p.addScaledVector(f.v, dt);
    const g = this.ground(f.p.x, f.p.z) + 0.01;
    if (f.p.y < g) { f.p.y = g; f.v.multiplyScalar(0.3); f.v.y = Math.abs(f.v.y) * 0.2; f.w.multiplyScalar(0.5); }
    const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(f.w.x * dt, f.w.y * dt, f.w.z * dt)); f.q.multiply(dq);
  }

  update(dt: number, frozen: boolean) {
    const cam = this.ctx.camera;
    if (!frozen) {
      for (const f of this.flashes) if (f.on) {
        f.age += dt;
        if (f.age > f.life) { f.on = false; f.root.visible = false; }
        else { const k = 1 - f.age / f.life; f.root.scale.setScalar(f.size * (0.7 + 0.3 * k)); }
      }
      for (const s of this.shots) if (s.on) this.stepShot(s, dt);
      for (const q of this.parts) this.stepPart(q, dt);
      this.parts = this.parts.filter((q) => q.age < q.life);
      for (const f of this.frags) this.stepFrag(f, dt);
      this.frags = this.frags.filter((f) => f.age < f.life);
    }
    // flash billboards face the camera (bill is a child of the barrel-oriented root)
    for (const f of this.flashes) if (f.on) f.bill.quaternion.copy(f.root.quaternion).invert().multiply(cam.quaternion).multiply(this.tmpQ.setFromAxisAngle(Z_AXIS, f.bill.userData.roll ?? 0));
    // bananas + streaks + halos
    let n = 0;
    const sp = this.streakGeo.getAttribute("position") as THREE.BufferAttribute, hp = this.haloGeo.getAttribute("position") as THREE.BufferAttribute;
    const side = new THREE.Vector3(), toCam = new THREE.Vector3(), d = new THREE.Vector3(), tail = new THREE.Vector3(), up = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
    const camR = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), camU = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    for (const s of this.shots) {
      if (!s.on) continue;
      d.copy(s.vel).normalize();
      this.tmpQ.setFromUnitVectors(X, d).multiply(new THREE.Quaternion().setFromAxisAngle(X, s.spin));
      this.tmpM.compose(s.pos, this.tmpQ, this.tmpS.set(1.3, 1.3, 1.3));
      this.bananas.setMatrixAt(n, this.tmpM);
      const speed = s.vel.length();
      const len = speed > 3 ? Math.min(1.15, 0.12 + s.age * speed * 0.9) : 0;
      tail.copy(s.pos).addScaledVector(d, -len - 0.1);
      const head = this.tmpS.copy(s.pos).addScaledVector(d, -0.08);
      toCam.subVectors(cam.position, s.pos).normalize();
      side.crossVectors(d, toCam).normalize();
      const w0 = 0.006, w1 = 0.05, b = n * 4;
      sp.setXYZ(b, tail.x - side.x * w0, tail.y - side.y * w0, tail.z - side.z * w0);
      sp.setXYZ(b + 1, tail.x + side.x * w0, tail.y + side.y * w0, tail.z + side.z * w0);
      sp.setXYZ(b + 2, head.x + side.x * w1, head.y + side.y * w1, head.z + side.z * w1);
      sp.setXYZ(b + 3, head.x - side.x * w1, head.y - side.y * w1, head.z - side.z * w1);
      const hs = 0.24;
      for (let k = 0; k < 4; k++) {
        const sx = k === 0 || k === 1 ? -1 : 1, sy = k === 0 || k === 3 ? -1 : 1;
        up.copy(s.pos).addScaledVector(camR, sx * hs).addScaledVector(camU, sy * hs);
        hp.setXYZ(b + k, up.x, up.y, up.z);
      }
      n++;
    }
    this.bananas.count = n; this.bananas.instanceMatrix.needsUpdate = true;
    sp.needsUpdate = true; hp.needsUpdate = true; this.streakGeo.setDrawRange(0, n * 6); this.haloGeo.setDrawRange(0, n * 6);
    // particles
    const ip = this.partGeo.getAttribute("iPos") as THREE.InstancedBufferAttribute, id = this.partGeo.getAttribute("iData") as THREE.InstancedBufferAttribute, iv = this.partGeo.getAttribute("iVel") as THREE.InstancedBufferAttribute;
    let k = 0;
    for (const q of this.parts) {
      const life = q.age / q.life, fade = q.kind === 1 ? Math.min(1, q.age * 12) * (1 - life) ** 1.4 : 1 - Math.max(0, (life - 0.8) / 0.2);
      ip.setXYZ(k, q.p.x, q.p.y, q.p.z); iv.setXYZ(k, q.v.x, q.v.y, q.v.z);
      id.setXYZW(k, q.size * (1 + q.grow * q.age), q.alpha * fade, q.kind, q.rot);
      k++;
    }
    for (const a of [ip, id, iv]) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, k * a.itemSize); }
    this.partGeo.instanceCount = k;
    // fragments
    let j = 0;
    const white = new THREE.Color("#f3eee2"), husk = new THREE.Color("#6d9a2c");
    for (const f of this.frags) {
      this.tmpM.compose(f.p, f.q, this.tmpS.setScalar(f.s));
      this.fragMesh.setMatrixAt(j, this.tmpM); this.fragMesh.setColorAt(j, f.flesh ? white : husk); j++;
    }
    this.fragMesh.count = j; this.fragMesh.instanceMatrix.needsUpdate = true; if (this.fragMesh.instanceColor) this.fragMesh.instanceColor.needsUpdate = true;
  }
}

// ============================================================================================ storm band (shot dressing)
/** the storm wall seen from a few km away (target art: a thin bright cyan rim arcing over the right horizon with a faint hex
 *  lattice just inside it). Built directly in VIEW directions: a thin conical strip of the far dome's silhouette (angular
 *  radius rho around `cdir` seen from `eye`), `w` rad wide, only the part above the horizon. ~800 tris, one draw, and it
 *  covers < 10 % of the sky (the full 16k-tri dome covered a third of the frame). */
function stormBand(eye: THREE.Vector3, cdir: THREE.Vector3, rho: number, w: number, dist: number, visible: (d: THREE.Vector3) => boolean) {
  const u = new THREE.Vector3().crossVectors(cdir, Math.abs(cdir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const v = new THREE.Vector3().crossVectors(cdir, u).normalize();
  const dirAt = (phi: number, th: number, out = new THREE.Vector3()) => out.copy(cdir).multiplyScalar(Math.cos(th)).addScaledVector(u, Math.sin(th) * Math.cos(phi)).addScaledVector(v, Math.sin(th) * Math.sin(phi));
  // the visible arc: the longest run of silhouette azimuths that pass `visible`
  const N = 720, ok: boolean[] = [];
  const d = new THREE.Vector3();
  for (let i = 0; i < N; i++) ok.push(visible(dirAt((i / N) * TAU, rho, d)));
  let best = [0, 0], cur = -1;
  for (let i = 0; i < 2 * N; i++) { if (ok[i % N]) { if (cur < 0) cur = i; if (i - cur > best[1] - best[0]) best = [cur, i]; } else cur = -1; }
  const phi0 = (best[0] / N) * TAU, phi1 = (best[1] / N) * TAU;
  const SEG = 96, ROWS = 5, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= SEG; i++) {
    const t = j / ROWS, phi = phi0 + (phi1 - phi0) * (i / SEG), th = rho - w * Math.pow(1 - t, 1.6);
    dirAt(phi, th, d);
    pos.push(eye.x + d.x * dist, eye.y + d.y * dist, eye.z + d.z * dist);
    uv.push(((phi - phi0) * Math.sin(rho)) / w, t);
  }
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < SEG; i++) { const a = j * (SEG + 1) + i, b = a + SEG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vY;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vUv = uv; vY = normalize(w.xyz - cameraPosition).y; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying float vY;
      float hexEdge(vec2 p){
        const vec2 s = vec2(1.0, 1.7320508);
        vec2 a = mod(p, s) - s * 0.5, b = mod(p - s * 0.5, s) - s * 0.5;
        vec2 g = dot(a, a) < dot(b, b) ? a : b; g = abs(g);
        return 0.5 - max(dot(g, s * 0.5), g.x);
      }
      void main(){
        float t = vUv.y;                                            // 0 = inner edge (toward the horizon), 1 = the rim
        // the storm is a translucent electric-cyan WALL (not a faint pale net arc) — a bright rim band
        // arcing to the top-right with a glowing square grid over the whole face down to the horizon, tinting the sea +
        // headland behind it cyan
        vec2 gc = vec2(vUv.x * 46.0, t * 34.0 + uTime * 0.02);
        vec2 gf = abs(fract(gc) - 0.5);
        float line = 1.0 - smoothstep(0.018, 0.06, min(0.5 - gf.x, 0.5 - gf.y));
        float rim = smoothstep(0.9, 0.972, t);
        float edge = smoothstep(0.972, 0.99, t) * (1.0 - smoothstep(0.996, 1.0, t) * 0.4);
        float foot = smoothstep(0.1, 0.0, vY);                      // brighter where it meets the sea
        float face = smoothstep(0.0, 0.12, t);                      // fades in off the inner end
        vec3 col = vec3(0.06, 0.5, 1.0) * 1.1 + vec3(0.25, 0.85, 1.0) * line * 1.1 * face + vec3(0.1, 0.65, 1.0) * rim * 2.6 + vec3(0.65, 0.98, 1.0) * edge * 3.2 + vec3(0.3, 0.9, 1.0) * foot * 0.6;
        float a = clamp(face * (0.26 + 0.26 * line + 0.14 * foot) + 0.7 * rim + 0.95 * edge, 0.0, 0.97);
        if (vY < -0.004) discard;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const m = new THREE.Mesh(g, mat);
  // drawn after the atmos cloud impostors (target art: the wall glows IN FRONT of the cumulus)
  m.renderOrder = 60; m.name = "storm-band"; m.frustumCulled = false; m.userData.castShadow = false;
  return m;
}

// ============================================================================================ the set
const deg = THREE.MathUtils.degToRad;
/** frame-corner plants (veg species) in the shot frame: [a, d, yaw, scale] */
// (the veg area's small monstera / fern lie flat like decals at a 0.95 m eye — the frame corners get upright
// hand-placed leaf clusters instead, see cornerLeaves())
const FOLIAGE: Partial<Record<PlantKind, Array<[number, number, number, number?]>>> = {};
/** frame-corner leaves (shot frame): [a, d, yaw (+ = toward +a), up (rad above horizontal), length, width, leaf, droop, twist] */
const CORNER: Array<[number, number, number, number, number, number, keyof typeof FOL, number, number]> = [
  // bottom-left: two big monstera leaves rising into the corner
  [-1.45, 1.3, 0.55, 0.62, 0.78, 0.66, "monstera", 0.28, 0.25], [-1.2, 1.65, -0.15, 0.95, 0.62, 0.52, "monstera", 0.3, -0.2], [-1.7, 1.9, 0.9, 1.1, 0.7, 0.5, "monstera", 0.25, 0.1],
  // bottom-centre: fern fronds fanning up + one monstera (the plain "broad" ovals read as green paddles)
  [0.55, 1.35, -0.45, 0.62, 0.95, 0.36, "fern", 0.35, 0.3], [0.85, 1.5, 0.35, 0.85, 0.85, 0.34, "fern", 0.3, -0.25], [0.3, 1.55, 0.1, 1.05, 0.8, 0.32, "fern", 0.25, 0.1],
  [0.7, 1.7, -0.1, 0.7, 0.7, 0.6, "monstera", 0.3, 0.15], [1.0, 1.45, 0.7, 0.55, 0.9, 0.34, "fern", 0.35, -0.3],
  // bottom-right: banana leaf + fern fronds + a monstera
  [1.75, 1.55, -0.75, 0.72, 1.05, 0.4, "banana", 0.3, 0.3], [1.4, 1.35, -0.25, 0.55, 0.85, 0.34, "fern", 0.35, 0.15], [1.55, 1.3, -0.55, 0.75, 0.8, 0.32, "fern", 0.3, -0.2], [1.25, 1.45, 0.1, 0.9, 0.7, 0.3, "fern", 0.3, 0.2],
  [2.05, 2.1, -1.05, 0.85, 0.8, 0.66, "monstera", 0.3, 0.2],
];
/** the yellow box's stencil: x range along its side (m from the centre, + = toward the doors) + height range. Only the
 *  box's right ~4 m is in frame (the rest is left of the camera): the target art reads "BANANA CO." left of the hero's head
 *  with the bunch behind it */
// (the bunch sat right behind the hero's head and read as antlers — the stencil moved 1.3 m left, a touch smaller)
const DECAL_X = [1.5, 3.7], DECAL_Y = [1.25, 2.3];
/** storm band rim: two points on it [degrees right of the camera aim, elevation], dome angular radius, band width (deg) */
const STORM = { p1: [19, 14.5], p2: [47, 21], rho: 58, width: 42, from: 13 };
/** layout (shot frame a, d — see header). Tuned against the target art at the char-03 view. */
const LAYOUT = {
  // face / slide = headings right of forward. The slide pose twists the chest ~23° to the kong's left (away from the
  // camera here), so the root faces 128° to put his chest 3/4 toward camera-right and the gun arm pointing right.
  // fitted to the target art's frame (foe 2 m tall at x 73 % / feet 66 % → ~12 m out; red box top at 20 %; yellow
  // box top at ~30 % → its side ~7 m out; the cluster big + central behind the foe)
  hero: { a: -1.02, d: 2.8, face: deg(120), slide: deg(120), speed: 6.2 },
  foe: { a: 5.2, d: 8.8 },                                                     // 2 m tall ≈ 18 % of the frame at x ≈ 72 % (target art)
  yellow: { doorA: -0.2, doorD: 7.4, h: deg(8) },                             // door-end centre + heading of its +X
  green: { a: 2.8, d: 14.6, h: deg(12) },
  blue: { a: 1.3, d: 12.0, h: deg(8) },
  red: { highA: 0.6, highD: 14.4, toward: deg(30) },                          // raised end on the green roof, falls away right
  farGreen: { a: 14.2, d: 25.5, h: deg(-58) },
  // target art: a wooden lookout cabin on a stack of blue containers, upper-left above the yellow box (a stilt
  // tower read as a grey box on the sandstone cliff behind). The cabin sits on the bottom 40 ft, the 20 ft beside it.
  tower: { along: -2.9, rot: 0.1, legH: 3.6, scale: 1.0 },
  stack: { a: -3.6, d: 33, h: deg(12) },                                     // further back — the lookout tops out at ~12 % (target art)
};

export async function createFirefightSet(ctx: WorldCtx, origin: { x: number; z: number; yaw: number }): Promise<FirefightSet> {
  const F = frameOf(origin);
  const g0 = (x: number, z: number) => Math.max(-0.2, ctx.terrain.height(x, z));
  const G = (a: number, d: number) => g0(F.x(a, d), F.z(a, d));
  const L = (a: number, d: number, h = 0) => new THREE.Vector3(a, G(a, d) + h, -d);          // group-local
  const W = (a: number, d: number, h = 0) => new THREE.Vector3(F.x(a, d), G(a, d) + h, F.z(a, d)); // world
  /** world direction of a heading θ (radians right of the shot's forward) */
  const dirW = (th: number, y = 0) => new THREE.Vector3(F.f[0] * Math.cos(th) + F.r[0] * Math.sin(th), y, F.f[1] * Math.cos(th) + F.r[1] * Math.sin(th));
  const object = new THREE.Group();
  object.name = "firefight-set";
  object.position.set(origin.x, 0, origin.z);
  object.rotation.y = origin.yaw;
  object.updateMatrixWorld(true);

  // ---------------------------------------------------------------- containers (poi-harbor kit)
  // heading h: angle of the container's +X (door end) in the (a, d) plane, from +a toward +d. Side A (+Z) faces −d.
  const kit = new ContainerKit();
  const cont = (a: number, d: number, h: number, o: Partial<ContainerPlacement> & { color: ContainerPlacement["color"]; sink?: number; lift?: number; fit?: boolean }) => {
    const size = o.size ?? 40, len = size === 40 ? 12.192 : 6.058, wid = 2.438;
    const ca = Math.cos(h), sa = Math.sin(h);
    // terrain fit: sample under the four bottom corners
    const cor = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => { const ax = a + ca * sx * len / 2 + sa * sz * wid / 2, dx = d + sa * sx * len / 2 - ca * sz * wid / 2; return G(ax, dx); });
    const front = (cor[0] + cor[1]) / 2, back = (cor[2] + cor[3]) / 2, left = (cor[0] + cor[2]) / 2, right = (cor[1] + cor[3]) / 2;
    const fit = o.fit ?? true;
    const y = (fit ? Math.min(...cor) * 0.5 + (cor[0] + cor[1] + cor[2] + cor[3]) / 8 : G(a, d)) - (o.sink ?? 0.06) + (o.lift ?? 0);
    const pitch = (o.pitch ?? 0) + (fit ? Math.atan2(front - back, len) : 0);
    const roll = (o.roll ?? 0) + (fit ? Math.atan2(right - left, wid) : 0); // +roll lowers side A (+Z)
    const p: ContainerPlacement = { ...o, size, x: a, y, z: -d, yaw: h, pitch, roll };
    delete (p as { sink?: number }).sink; delete (p as { lift?: number }).lift; delete (p as { fit?: boolean }).fit;
    kit.add(p);
    return p;
  };
  const Y = LAYOUT.yellow, yH = Y.h;
  // hero cover: yellow 40 ft, doors flung open at the right end just behind the hero's gun arm; own decals (below)
  const yellow = cont(Y.doorA - Math.cos(yH) * 6.1, Y.doorD - Math.sin(yH) * 6.1, yH, { color: "yellow", tint: 1.06, decal: "none" });
  // mid cluster: green 40 ft behind the foe, blue 20 ft in front of it, red 40 ft tumbled onto the green's roof
  const green = cont(LAYOUT.green.a, LAYOUT.green.d, LAYOUT.green.h, { color: "green", tint: 1.0 });
  const blue = cont(LAYOUT.blue.a, LAYOUT.blue.d, LAYOUT.blue.h, { color: "blue", size: 20, sink: 0.2, roll: -0.02, tint: 1.04, decal: "none" });
  {
    // red: raised −X end resting on the green's roof, +X (door) end dug into the sand behind-right
    const R0 = LAYOUT.red, len = 12.192;
    const hiY = green.y + 2.59 - 0.02;
    let pitch = 0, lowA = 0, lowD = 0;
    for (let i = 0; i < 3; i++) { // solve: the low end's bottom edge sits 0.3 m into the sand
      const horiz = len * Math.cos(pitch);
      lowA = R0.highA + Math.cos(R0.toward) * horiz; lowD = R0.highD + Math.sin(R0.toward) * horiz;
      pitch = -Math.asin(Math.min(0.9, (hiY - (G(lowA, lowD) - 0.3)) / len));
    }
    const cA = (R0.highA + lowA) / 2, cD = (R0.highD + lowD) / 2;
    kit.add({ x: cA, y: hiY + Math.sin(pitch) * len / 2, z: -cD, yaw: R0.toward, pitch, roll: deg(-6), color: "red", size: 40, tint: 1.0 });
  }
  cont(LAYOUT.farGreen.a, LAYOUT.farGreen.d, LAYOUT.farGreen.h, { color: "green", tint: 1.06, sink: 0.12 });
  // background stack beside the watchtower: blue 40 + blue 20 on top (+ a big crate, below)
  const S = LAYOUT.stack;
  const stackBase = cont(S.a, S.d, S.h, { color: "blue", tint: 0.95, decal: "text", fit: false });
  // second level: a 40 ft (slightly slewed) the cabin stands on, a 20 ft on top of its right end
  cont(S.a + 0.3, S.d - 0.15, S.h + deg(4), { color: "blue", tint: 1.02, decal: "none", lift: 2.59, fit: false });
  cont(S.a + Math.cos(S.h) * 3.1, S.d + Math.sin(S.h) * 3.1, S.h - deg(3), { color: "green", size: 20, lift: 5.18, fit: false, tint: 1.0 });
  cont(S.a - 9, S.d + 8, deg(-25), { color: "yellow", tint: 0.92 });
  // one cell: 2 instanced draws (40 ft / 20 ft) + 2 box casters for the whole set
  const containerGroup = kit.build({ name: "firefight-containers", cell: 4096 });
  object.add(containerGroup);

  // custom decals: "BANANA CO." + banana at the yellow's LEFT end of side A (the target art reads it left of the hero, the
  // kit puts it by the doors), "BANANA CO." on the blue 20 ft (the kit decals 40 ft only)
  {
    // ONE decal mesh (own atlas): the yellow box's brown stencil at its left end (target art), the blue box's yellow text
    const parts: THREE.BufferGeometry[] = [];
    const put = (p: ContainerPlacement, geo: THREE.BufferGeometry, r: Rect) => {
      const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) { const [u, v] = ruv(r, DEC_S, DEC_S, uv.getX(i), uv.getY(i)); uv.setXY(i, u, v); }
      parts.push(geo.applyMatrix4(placementMatrix(p)));
    };
    put(yellow, decalGeometry(40, DECAL_X[0], DECAL_X[1], DECAL_Y[0], DECAL_Y[1]), DEC.yellow);
    put(blue, decalGeometry(20, -2.45, 2.45, 0.95, 2.4), DEC.blue);
    const m = new THREE.Mesh(mergeGeometries(parts.map((g) => { for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; }))!, new THREE.MeshStandardMaterial({ map: decalAtlas(), alphaTest: 0.4, roughness: 0.78, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.receiveShadow = true; m.castShadow = false; m.userData.castShadow = false; m.name = "firefight-decal"; object.add(m);
  }

  // ---------------------------------------------------------------- wood: crates + watchtower (one mesh)
  const wood = woodTextures();
  const woodMB = new MB();
  const crates: Array<[number, number, number]> = []; // a, d, footprint (contact shadows)
  const crate = (a: number, d: number, s: [number, number, number], rot: number, face: Rect = WOOD.plank, lift = 0, tilt = 0) => {
    const p = L(a, d, lift - 0.03);
    addCrate(woodMB, TRS(p.x, p.y, p.z, tilt, rot, 0), s[0], s[1], s[2], face);
    if (!lift) crates.push([a, d, Math.max(s[0], s[2]) * 1.45]);
  };
  // beside the yellow's door end: two stacked + one leaning
  crate(0.9, 8.8, [1.15, 1.1, 1.1], 0.3, WOOD.stencil);
  crate(0.85, 8.85, [1.0, 0.95, 1.0], 0.42, WOOD.plank, 1.1);
  crate(2.1, 9.5, [1.1, 1.05, 1.05], -0.2, WOOD.plank, 0, 0.12);
  // by the blue / near the foe
  crate(-0.4, 11.4, [1.0, 0.95, 1.0], 0.15, WOOD.red);
  crate(7.9, 11.6, [0.95, 0.9, 0.95], -0.25, WOOD.plank);
  // far right on the beach
  crate(11.2, 23.2, [1.2, 1.0, 1.0], 0.1, WOOD.stencil);
  crate(16.2, 27.2, [1.1, 1.0, 1.0], -0.3);
  crate(17.4, 27.6, [1.1, 1.05, 1.0], -0.2, WOOD.plank);
  // big wooden crate on the background stack
  crate(S.a + Math.cos(S.h) * 3.1, S.d + Math.sin(S.h) * 3.1 - 0.1, [1.4, 1.1, 1.2], S.h + 0.3, WOOD.stencil, 2.59 * 3 + 0.02 - (G(S.a + Math.cos(S.h) * 3.1, S.d + Math.sin(S.h) * 3.1) - stackBase.y));
  crate(S.a + 4.4, S.d - 1.6, [1.2, 1.1, 1.1], 0.4, WOOD.stencil);
  crate(S.a + 5.6, S.d - 1.2, [1.0, 0.95, 1.0], -0.3, WOOD.red);
  // lookout cabin on top of the bottom 40 ft (short posts, deck, half walls, hip roof)
  {
    const T0 = LAYOUT.tower, ta = S.a + Math.cos(S.h) * T0.along, td = S.d + Math.sin(S.h) * T0.along;
    const p = new THREE.Vector3(ta, stackBase.y + 2.59 * 2, -td);
    addTower(woodMB, TRS(p.x, p.y, p.z, 0, S.h + T0.rot, 0).multiply(new THREE.Matrix4().makeScale(T0.scale, T0.scale, T0.scale)), T0.legH);
  }
  const woodMesh = new THREE.Mesh(woodMB.build(), new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.82, metalness: 0 }));
  woodMesh.name = "firefight-wood"; woodMesh.castShadow = true; woodMesh.receiveShadow = true;
  object.add(woodMesh);

  // ---------------------------------------------------------------- kongs: anchors + staged poses
  const H = LAYOUT.hero, E = LAYOUT.foe;
  const heroPos = W(H.a, H.d), foePos = W(E.a, E.d);
  const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
  const heroYaw = origin.yaw - H.face;        // KongPose yaw: facing heading θ right of forward = shot yaw − θ
  // a standing kong's pistol barrel points ~18° left of his facing (rig hold pose): turn 19° right to aim at the hero
  // (aimed straight down the camera line at the hero beside the camera, his face hides under his own flash.
  // He leads the sliding hero instead: aims ~2.4 m to the hero's left, so both guns + flashes point screen-left of
  // his body and the face stays clear, target art)
  const foeAimPt = heroPos.clone().addScaledVector(dirW(-Math.PI / 2), 2.4);
  const foeYaw = yawTo(foePos, foeAimPt);
  const slideV = dirW(H.slide).multiplyScalar(H.speed);
  const heroPose = pose(heroPos.x, heroPos.y, heroPos.z, heroYaw, { state: "move", crouch: true, sprint: true, vx: slideV.x, vz: slideV.z, weapon: "pistol", pitch: 0.05, team: 0, friendly: true });
  const foePose = pose(foePos.x, foePos.y, foePos.z, foeYaw, { state: "idle", weapon: "pistol", pitch: 0.06, team: 0, friendly: false });
  const slideBack = dirW(H.slide + Math.PI), slideFwd = dirW(H.slide);

  // ---------------------------------------------------------------- coconuts (static: on the sand, cracked halves)
  const cocoTex = cocoTexture();
  const cocoMat = new THREE.MeshStandardMaterial({ map: cocoTex, roughness: 0.62, metalness: 0 });
  const cocoMB = new MB();
  const nutG = coconutGeo(0.19, COCO.green), dryG = coconutGeo(0.18, COCO.dry), halfG = halfCocoGeo(0.19), halfDry = halfCocoGeo(0.17, COCO.dry);
  const nut = (a: number, d: number, geo: THREE.BufferGeometry, rx: number, ry: number, rz: number, lift = 0.12) => { const p = L(a, d, lift); cocoMB.add(geo, TRS(p.x, p.y, p.z, rx, ry, rz)); };
  nut(0.3, 3.45, nutG, 0.4, 1.2, 1.3, 0.16);          // whole nut in the slide's path (a split one flies above it)
  // foreground broken shell (target art: brown fibrous husk, a sliver of white flesh) — tipped on its side toward the camera
  // (flesh-up it read as a white plate)
  nut(-0.35, 1.8, halfDry, -1.75, 2.6, 0.35, 0.13);
  nut(0.95, 5.2, dryG, 1.2, 0.4, 0.3, 0.12);
  nut(2.4, 6.4, halfG, 0.5, 0.3, -0.35, 0.08);
  nut(6.6, 11.5, nutG, 0.2, 2, 1.4, 0.13);
  nut(8.8, 15, dryG, 0.5, 1, 0.2, 0.12);
  nut(-2.8, 7.6, dryG, 1.3, 0.2, 0.8, 0.12);
  nut(3.1, 8.6, halfG, 2.6, 0.8, 0.1, 0.1);
  const cocoMesh = new THREE.Mesh(cocoMB.build(), cocoMat);
  cocoMesh.castShadow = false; cocoMesh.userData.castShadow = false; cocoMesh.receiveShadow = true; cocoMesh.name = "firefight-coconuts";
  object.add(cocoMesh);
  // two tumbling coconuts (dynamic in live mode; frozen mid-air in shot mode): a split one kicked up behind the
  // hero (left frame edge) and a whole one bouncing in front of his lead foot
  const splitG = (() => { const mb = new MB(); mb.add(halfG, TRS(0.05, 0, 0, 0.3, 0, 2.6)); mb.add(halfG, TRS(-0.12, 0.08, 0.04, -0.5, 0.4, -0.4, 0.92)); return mb.build(); })();
  const mkTumbler = (split: boolean) => {
    const t = new THREE.Mesh(split ? splitG : nutG, cocoMat);   // one draw, no shadow (small, airborne)
    t.name = "firefight-tumbler"; t.castShadow = false; t.userData.castShadow = false;
    object.add(t);
    return t;
  };
  const tumblers = [
    { obj: mkTumbler(true), home: W(-2.3, 2.45, 0.62), pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, rot: 0.7, live: false },
    // (kept clear of the lead high-top — the target art shows the sneaker + star)
    { obj: mkTumbler(true), home: W(1.0, 4.3, 0.42), pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0.8, rot: 2.1, live: false },
  ];
  const setTumbler = (tb: (typeof tumblers)[number], p: THREE.Vector3, rot: number) => {
    const lp = object.worldToLocal(p.clone());
    tb.obj.position.copy(lp); tb.obj.rotation.set(rot * 1.3, rot, rot * 0.7);
  };

  // ---------------------------------------------------------------- bananas (a few spilled at the open doors + scattered)
  const banG = bananaGeo(0.24, 0.022);
  const banMat = new THREE.MeshStandardMaterial({ map: bananaTexture(), roughness: 0.42, metalness: 0 });
  const spill: THREE.Matrix4[] = [];
  {
    const R = rng(91);
    const da = Y.doorA + 0.4, dd = Y.doorD + 0.2;
    for (let i = 0; i < 22; i++) {
      const r = Math.sqrt(R()) * 1.3, ang = yH + (R() - 0.5) * 2.0, a = da + Math.cos(ang) * r, d = dd + Math.sin(ang) * r;
      const pile = Math.max(0, 0.35 - r * 0.25);
      const p = L(a, d, 0.03 + R() * pile);
      spill.push(TRS(p.x, p.y, p.z, (R() - 0.5) * 1.2, R() * TAU, (R() - 0.5) * 0.8, 1.15));
    }
    for (let i = 0; i < 12; i++) { const a = 1 + R() * 9, d = 5 + R() * 10; const p = L(a, d, 0.03); spill.push(TRS(p.x, p.y, p.z, (R() - 0.5) * 0.4, R() * TAU, 1.57 * (R() < 0.5 ? 1 : 0) + (R() - 0.5) * 0.3, 1.15)); }
  }
  const spillMesh = new THREE.InstancedMesh(banG, banMat, spill.length);
  spill.forEach((m, i) => spillMesh.setMatrixAt(i, m));
  spillMesh.castShadow = false; spillMesh.userData.castShadow = false; spillMesh.receiveShadow = true; spillMesh.name = "firefight-bananas";
  object.add(spillMesh);

  // ---------------------------------------------------------------- pebbles + shells
  {
    const R = rng(101);
    const pg = pebbleGeo(7);
    const N = 190;
    const peb = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 }), N);
    const cols = ["#8d8a84", "#a39a8c", "#6f6a64", "#c9c0ae", "#e9e2d2", "#7b6a58"];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const d = 1.2 + Math.pow(R(), 1.4) * 26, a = (R() - 0.45) * (4 + d * 1.1);
      const s = (0.018 + Math.pow(R(), 3) * 0.08) * (0.8 + d * 0.02);
      const p = L(a, d, s * 0.2);
      peb.setMatrixAt(i, TRS(p.x, p.y, p.z, 0, R() * TAU, 0, [s * (0.8 + R() * 0.5), s, s * (0.8 + R() * 0.5)]));
      peb.setColorAt(i, c.set(cols[Math.floor(R() * cols.length)]));
    }
    peb.receiveShadow = true; peb.castShadow = false; peb.name = "firefight-pebbles";
    object.add(peb);
  }

  // ---------------------------------------------------------------- sand decals: slide trail, footprints, contact shadows
  {
    const tx = sandTextures();
    const grid = (a0: number, d0: number, ang: number, w: number, l: number, rect: Rect, nx = 8, nz = 8, lift = 0.025) => {
      const geo = new THREE.PlaneGeometry(1, 1, nx, nz);
      const pos = geo.getAttribute("position") as THREE.BufferAttribute, uv = geo.getAttribute("uv") as THREE.BufferAttribute;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let i = 0; i < pos.count; i++) {
        const s = pos.getX(i), t = pos.getY(i);
        const la = s * l, lw = t * w; // along (u) / across (v)
        const a = a0 + ca * la - sa * lw, d = d0 + sa * la + ca * lw;
        pos.setXYZ(i, a, G(a, d) + lift, -d);
        const [u, v] = ruv(rect, SAND_S, SAND_S, s + 0.5, t + 0.5); uv.setXY(i, u, v);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const lit: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
    // slide trail: from behind the hero back along his path (heading of the slide in the (a,d) plane = 90° − slide)
    const trailAng = Math.PI / 2 - H.slide + Math.PI, tl = 4.2;
    lit.push(grid(H.a + Math.cos(trailAng) * (tl / 2 - 0.3), H.d + Math.sin(trailAng) * (tl / 2 - 0.3), trailAng + Math.PI, 1.1, tl, SAND.trail, 12, 4));
    for (const [a, d, ang] of [[E.a - 0.5, E.d + 0.9, 0.3], [E.a + 0.6, E.d + 1.6, 0.1], [E.a - 1.2, E.d + 2.1, 0.2], [E.a + 1.4, E.d + 3.0, 0.45]] as const) lit.push(grid(a, d, ang, 0.34, 0.5, SAND.foot, 2, 2));
    // contact shadows (soft AO under props)
    const cs = (p: ContainerPlacement, len: number) => dark.push(grid(p.x, -p.z, p.yaw, 3.4, len + 1.2, SAND.shadow, 12, 3, 0.03));
    cs(yellow, 12.2); cs(green, 12.2); cs(blue, 6.1);
    for (const [a, d, s] of crates) dark.push(grid(a, d, 0, s, s, SAND.shadow, 2, 2, 0.028));
    const litMesh = new THREE.Mesh(mergeGeometries(lit)!, new THREE.MeshStandardMaterial({ map: tx.trail, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const darkMesh = new THREE.Mesh(mergeGeometries(dark)!, new THREE.MeshBasicMaterial({ map: tx.shadow, color: "#000000", transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    litMesh.receiveShadow = true; litMesh.name = "firefight-sand-decals"; darkMesh.name = "firefight-contact-shadows";
    litMesh.renderOrder = darkMesh.renderOrder = 1;
    object.add(litMesh, darkMesh);
  }

  // ---------------------------------------------------------------- frame-corner foliage: the veg area's own textured
  // monstera / fern / banana plants (target art: glossy monstera + fern fronds in both bottom corners), see FOLIAGE
  // ---------------------------------------------------------------- palms + plants via the veg system (behind the action)
  const veg = ctx.shared.get("veg") as VegApi | undefined;
  if (veg) {
    const plant = (kind: PlantKind, list: Array<[number, number, number, number?]>) => {
      veg.plant(kind, list.map(([a, d, yaw, s]) => { const p = W(a, d, -0.05); return new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + origin.yaw), new THREE.Vector3().setScalar(s ?? 1)); }));
    };
    // yaw here is about +Y in the shot frame; a leaning palm leans along its +X: 0 = toward +a (right), + = away
    // (the upper left would read as a sandstone cliff — a big leaning coconut palm crowns the top-left corner and
    // palms stand in front of the cliff face, the lookout tower rises on its stack against them)
    plant("palm-leaning", [[-7.4, 7.6, -0.25, 1.05], [12.5, 30, 0.3, 1.0], [-12.5, 11.5, -0.1, 1.3], [-17, 16, 0.2, 1.2]]);
    // (none directly behind the lookout stack at a ≈ −4, d 24: it must read against the sky, target art)
    plant("palm", [[-11, 19, 0], [-14, 18, 2.1], [2.8, 31, 0.7, 1.15], [7.5, 27, 2.9, 0.95], [-18, 30, 4], [-9, 35, 1.6, 1.2], [15.5, 33, 0.3], [-1.5, 33, 1.1, 1.3], [-6.5, 38, 2.4, 1.35], [0.8, 38, 0.2, 1.25], [-13, 40, 3.3, 1.3]]);
    plant("banana-plant", [[-11.5, 13, 0.4], [-13, 22, 2.2], [-6.5, 30, 1.1]]);
    plant("monstera", [[-9.8, 10.5, 0.3], [-4.8, 25, 1.4]]);
    for (const [kind, list] of Object.entries(FOLIAGE) as Array<[PlantKind, Array<[number, number, number, number?]>]>) plant(kind, list);
  }

  // ---------------------------------------------------------------- frame-corner leaves (upright, own atlas, no shadow)
  {
    const geos: THREE.BufferGeometry[] = [];
    for (const [a, d, yaw, up, len, wid, kind, droop, twist] of CORNER) {
      const g = kind === "fern" ? fernFrondGeo(len, wid, { droop, twist }) : leafGeo(len, wid, FOL[kind], { droop, cup: 0.14, twist, segL: 8, segW: 4 });
      const p = L(a, d, -0.02);
      const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationY(-yaw)).multiply(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 - up)));
      geos.push((g.index ? g.toNonIndexed() : g).applyMatrix4(m));
    }
    // (not flat neon decals: a deeper glossy green, and the camera-near leaves sit in their own shade)
    const leaves = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshStandardMaterial({ map: foliageTexture(), color: "#b9cc9c", alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.42, metalness: 0 }));
    leaves.name = "firefight-corner-leaves"; leaves.castShadow = false; leaves.userData.castShadow = false; leaves.receiveShadow = true;
    object.add(leaves);
  }

  // ---------------------------------------------------------------- storm band (distant shot dressing, far right)
  // the far storm dome's silhouette rim rises from right of centre toward the top-right corner (target art), the dome body
  // below-right of it: solve the dome whose outline passes through those two view rays, then draw only a thin band
  {
    const rho = deg(STORM.rho);
    const eye = W(0, 0, CAM_H);
    const ray = (bearing: number, elev: number) => { const h = dirW(deg(bearing)); return h.multiplyScalar(Math.cos(deg(elev))).setY(Math.sin(deg(elev))).normalize(); };
    const aimB = THREE.MathUtils.radToDeg(Math.atan2(CAM_TA, 25));
    const P1 = ray(aimB + STORM.p1[0], STORM.p1[1]), P2 = ray(aimB + STORM.p2[0], STORM.p2[1]);
    const m = P1.clone().add(P2).normalize(), w = P1.clone().cross(P2).normalize();
    const ct = Math.min(1, Math.cos(rho) / m.dot(P1)), t = Math.acos(ct);
    const c1 = m.clone().multiplyScalar(ct).addScaledVector(w, Math.sin(t)), c2 = m.clone().multiplyScalar(ct).addScaledVector(w, -Math.sin(t));
    const cdir = c1.y < c2.y ? c1 : c2;
    const fwd = dirW(deg(aimB));
    // 1400 m: inside the camera far plane (at 2600 m the band sat on the far plane and was half clipped)
    // the arc starts just right of the frame centre (target art: it rises from behind the red container to the top-right)
    const rgt = dirW(deg(aimB + 90));
    const band = stormBand(eye, cdir, rho, deg(STORM.width), 1400, (d) => { const b = THREE.MathUtils.radToDeg(Math.atan2(d.dot(rgt), d.dot(fwd))); return d.y > -0.02 && b > STORM.from && b < 62; });
    band.position.sub(object.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -origin.yaw);
    band.rotation.y = -origin.yaw;
    object.add(band);
    ctx.onUpdate((_dt, t) => { (band.material as THREE.ShaderMaterial).uniforms.uTime.value = t; });
  }

  // ---------------------------------------------------------------- FX (world space: counter-transformed under the set)
  const fx = new FX(ctx, g0, banG, new THREE.MeshStandardMaterial({ map: bananaTexture(), roughness: 0.3, emissive: new THREE.Color("#ffc21a"), emissiveIntensity: 0.55 }));
  const fxRoot = new THREE.Group(); fxRoot.name = "firefight-fx-root"; fxRoot.add(fx.group);
  object.add(fxRoot);
  fxRoot.matrixAutoUpdate = false;
  fxRoot.matrix.copy(object.matrixWorld).invert();
  fxRoot.updateMatrixWorld(true);

  const up = new THREE.Vector3(0, 1, 0);
  const heroChest = () => heroPos.clone().add(new THREE.Vector3(0, 0.95, 0));
  const foeChest = () => foePos.clone().add(new THREE.Vector3(0, 1.2, 0));
  /** sand the sliding hero throws (target art): a rooster-tail FAN of grain streaks thrown up and back off the folded trailing
   *  leg (behind him, away from the camera), a low plough wave peeling sideways off the lead heel, a little dust far behind.
   *  Nothing is thrown toward the camera, so the legs and the lead high-top stay clear (no bead-sphere dust ball). */
  const slideSpray = (seed: number, advance: number, k0 = 1) => {
    const k = k0;
    const side = new THREE.Vector3(-slideFwd.z, 0, slideFwd.x);                 // horizontal, left of the slide direction
    const trail = heroPos.clone().addScaledVector(slideBack, 0.42).add(new THREE.Vector3(0, 0.06, 0));
    const heel = heroPos.clone().addScaledVector(slideFwd, 0.62).add(new THREE.Vector3(0, 0.03, 0));
    fx.sandBurst(trail, { n: Math.round(260 * k), dir: slideBack.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(side, 0.25), spread: 0.42, speed: 5.2, seed, advance, puffs: 4 * k, clumps: 26 * k, scale: 1.0 });
    fx.sandBurst(trail.clone().addScaledVector(slideBack, 0.2), { n: Math.round(90 * k), dir: slideBack.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 1, 0)), spread: 0.35, speed: 3.8, seed: seed + 1, advance: advance * 1.25, puffs: 0, clumps: 12 * k });
    for (const sgn of [1, -1]) fx.sandBurst(heel.clone().addScaledVector(side, sgn * 0.14), { n: Math.round(45 * k), dir: side.clone().multiplyScalar(sgn).add(new THREE.Vector3(0, 0.75, 0)).addScaledVector(slideBack, 0.35), spread: 0.35, speed: 2.8, seed: seed + 2 + sgn, advance: advance * 0.8, puffs: 0, clumps: 6 * k, scale: 0.9 });
    fx.sandBurst(heroPos.clone().addScaledVector(slideBack, 1.25).add(new THREE.Vector3(0, 0.05, 0)), { n: Math.round(10 * k), dir: slideBack.clone().add(new THREE.Vector3(0, 0.6, 0)), spread: 0.8, speed: 1.1, seed: seed + 5, advance: advance * 1.5, puffs: 10 * k, clumps: 0, puffSpeed: 0.7, scale: 0.8 });
  };
  const foeDust = (seed: number, advance: number) => {
    // behind the feet (away from the camera) and low: the sneakers stay readable
    fx.sandBurst(foePos.clone().addScaledVector(dirW(0), 0.45).add(new THREE.Vector3(0, 0.03, 0)), { n: 30, dir: new THREE.Vector3(0, 0.25, 0).add(dirW(0.3)), spread: 1.2, speed: 1.3, seed, advance, puffs: 9, clumps: 4, puffSpeed: 0.5, scale: 0.7 });
  };

  const freezeShot = (heroMuzzle?: THREE.Vector3, foeMuzzle?: THREE.Vector3, heroDir?: THREE.Vector3, foeDir?: THREE.Vector3, heroMuzzle2?: THREE.Vector3, foeMuzzle2?: THREE.Vector3) => {
    fx.clear();
    const hm = heroMuzzle?.clone() ?? heroPos.clone().add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(dirW(H.face), 0.95);
    const fm = foeMuzzle?.clone() ?? foePos.clone().add(new THREE.Vector3(0, 1.22, 0)).addScaledVector(new THREE.Vector3().subVectors(heroPos, foePos).setY(0).normalize(), 0.75);
    const toFoe = new THREE.Vector3().subVectors(foeChest(), hm).normalize();
    const toHero = new THREE.Vector3().subVectors(heroChest(), fm).normalize();
    const dHF = hm.distanceTo(foeChest());
    // flashes on the real barrels, rounds toward the other kong (at muzzle height both read along the horizon line)
    fx.fire(hm, toFoe, 0.35 / ROUND_SPEED, true, heroDir ?? dirW(H.face));
    fx.fire(heroMuzzle2 ?? hm.clone().addScaledVector(up, 0.02), toFoe, (dHF * 0.42) / ROUND_SPEED, false);
    // (the foe's flash covered his face from the camera — drawn 0.35 m out along his aim)
    fx.fire(fm.clone().addScaledVector(foeDir ?? toHero, 0.35), toHero, 0.3 / ROUND_SPEED, true, foeDir ?? toHero);
    fx.fire(foeMuzzle2 ?? fm.clone().addScaledVector(up, -0.25), toHero.clone().add(new THREE.Vector3(0, 0.02, 0)).normalize(), (dHF * 0.3) / ROUND_SPEED, false);
    // stray bananas high over the cluster (target art: small tumbling bananas in the sky)
    fx.placeShot(W(5, 20, 8.5), dirW(0.3, 0.3).multiplyScalar(8), 1.1);
    fx.placeShot(W(9, 24, 6.4), dirW(-0.8, 0.5).multiplyScalar(6), 2.3);
    fx.placeShot(W(12, 30, 10.5), dirW(1.2, -0.2).multiplyScalar(7), 0.4);
    // sand: the slide spray, a round's impact kicking the whole coconut, dust at the foe's feet
    slideSpray(3, 0.2);
    const hit = W(0.9, 4.4, 0.05);
    // (10 clustered puffs + clumps read as a ball, so: a fan of streaking grains thrown up + away from the camera, a
    // couple of thin puffs, a few chips)
    fx.sandBurst(hit, { n: 110, dir: new THREE.Vector3(0, 1, 0).addScaledVector(dirW(0.2), 0.55), spread: 0.5, speed: 5.0, seed: 6, advance: 0.13, puffs: 2, clumps: 5, puffSpeed: 0.8, scale: 0.75 });
    fx.coconutHit(tumblers[0].home.clone().add(new THREE.Vector3(0, 0.05, 0)), { n: 10, seed: 7, advance: 0.09 });
    fx.coconutHit(hit.clone().add(new THREE.Vector3(0, 0.15, 0)), { n: 8, seed: 8, advance: 0.14 });
    foeDust(9, 0.3);
    for (const tb of tumblers) setTumbler(tb, tb.home, tb.rot);
    fx.update(0, true);
  };

  let fireClock = 0, burstClock = 0, dustClock = 0, side = 0;
  let shooters: { hero: Shooter; foe: Shooter } | null = null;
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const set: FirefightSet = {
    object, heroPos, heroYaw, foePos, foeYaw, heroPose, foePose, autoplay: false,
    toWorld: (a, d, h = 0) => W(a, d, h),
    dirW: (th, y = 0) => dirW(th, y),
    fire: (from, dir) => fx.fire(from, dir),
    sandBurst: (p) => fx.sandBurst(p, { seed: Math.floor(Math.random() * 1e9) }),
    freezeShot,
    bindShooters(hero, foe) { shooters = { hero, foe }; },
    update(dt: number) {
      const frozen = ctx.shotMode;
      heroPose.fired = false; foePose.fired = false;
      if (!frozen && set.autoplay) {
        fireClock -= dt; burstClock -= dt; dustClock -= dt;
        if (fireClock <= 0) {
          fireClock = 0.28 + Math.random() * 0.22; side ^= 1;
          const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.06);
          if (side) {
            const from = shooters ? shooters.hero.muzzle(tmpA) : heroPos.clone().add(new THREE.Vector3(0, 1.05, 0));
            fx.fire(from, tmpB.subVectors(foeChest(), from).normalize().add(jitter), 0, true, shooters?.hero.dir(new THREE.Vector3()));
            shooters?.hero.kick();
          } else {
            const from = shooters ? shooters.foe.muzzle(tmpA) : foePos.clone().add(new THREE.Vector3(0, 1.22, 0));
            fx.fire(from, tmpB.subVectors(heroChest(), from).normalize().add(jitter), 0, true, shooters?.foe.dir(new THREE.Vector3()));
            shooters?.foe.kick();
          }
        }
        if (burstClock <= 0) { burstClock = 0.35 + Math.random() * 0.3; slideSpray(Math.floor(Math.random() * 1e9), 0, 0.35); }
        if (dustClock <= 0) { dustClock = 1.2 + Math.random(); foeDust(Math.floor(Math.random() * 1e9), 0); }
        for (const tb of tumblers) {
          tb.t += dt;
          if (tb.t > 1.7 || !tb.live) { tb.t = 0; tb.live = true; tb.pos.copy(tb.home).addScaledVector(up, -0.45); tb.vel.copy(slideBack).multiplyScalar(0.8 + Math.random()).add(new THREE.Vector3(0, 3.6, 0)); }
          tb.vel.y -= 9.8 * dt; tb.pos.addScaledVector(tb.vel, dt);
          const gy = g0(tb.pos.x, tb.pos.z) + 0.18; if (tb.pos.y < gy) { tb.pos.y = gy; tb.vel.multiplyScalar(0.4); tb.vel.y = Math.abs(tb.vel.y) * 0.3; }
          setTumbler(tb, tb.pos, tb.t * 7 + tb.rot);
        }
      }
      fx.update(dt, frozen);
    },
  };
  for (const tb of tumblers) setTumbler(tb, tb.home, tb.rot);
  return set;
}

// ============================================================================================ staging
let built: Promise<FirefightSet> | null = null;
/** build (once) and publish on ctx.shared "firefight" */
export function getFirefightSet(ctx: WorldCtx): Promise<FirefightSet> {
  if (!built) {
    built = createFirefightSet(ctx, SHOT).then((set) => {
      ctx.scene.add(set.object);
      ctx.onUpdate((dt, t) => set.update(dt, t));
      ctx.shared.set("firefight", set);
      return set;
    });
  }
  return built;
}

/** barrel direction of a kong's held gun (wrist → muzzle), world */
function gunDir(k: KongActorEx, out: THREE.Vector3): THREE.Vector3 {
  const m = k.muzzle(new THREE.Vector3());
  return out.setFromMatrixPosition(k.bone("wristR")).negate().add(m).normalize();
}

/** the frozen hero moment (target art): a KNEE SLIDE on the sand past the yellow box — the LEFT leg leads toward the camera
 *  (big yellow high-top + sole low in the frame), the right leg folded under, torso upright and 3/4 to camera-right,
 *  head level, both pistols up at chest height on the foe (left arm extended, right arm across the chest). Arms by IK
 *  (kong-rig solveArm); legs by an overlay that mirrors the rig's right-lead slide. Bearings: degrees right of the shot
 *  heading; twists: radians, + = the kong's left. */
const HERO_STAGE = {
  // hips turned 120° (screen-right, toward the foe), chest + head turned back
  // toward the camera; left leg leads to screen-right with the high-top's side + star to the camera, right leg folded under
  // (knee on the sand); right fist + pistol across the left chest, left arm extended at the foe
  face: 120, drop: -0.05,
  aim: 78, aimPitch: 0.03,
  twistSpine: -0.1, twistChest: -0.2, headYaw: -0.6, headPitch: 0.06,
  // mirrored slide legs (rig conventions: +X swing forward, −Z abduct on the R side / +Z on the L side)
  // toes pointed (else the sole faces the camera and the shoe reads twisted flat)
  leadHip: [1.4, 0, 0.35] as number[], leadKnee: -0.8, leadAnkle: 0.65,
  trailHip: [-0.1, 0, -0.3] as number[], trailKnee: -2.3, trailAnkle: 0.5,
  // fists (relative to the chest centre): right across the chest toward the foe, left extended at the foe
  fistR: { aim: 0.1, fwd: 0.3, up: -0.22 }, fistL: { aim: 0.98, fwd: 0.08, up: -0.17 },   // left pistol down to chest height
};
/** the foe: dual pistols, planted WIDE (target art: legs apart, knees bent, both guns forward) */
const FOE_STAGE = { hipAbduct: 0.34, hip: 0.5, knee: -0.95, ankle: 0.38, drop: -0.16, spine: 0.08, offYaw: -0.09 };

let staged = false;
export async function stage(ctx: WorldCtx, id: string): Promise<void> {
  if (id !== "firefight" || staged) return;
  staged = true;
  const set = await getFirefightSet(ctx);
  const [hero, foe] = await Promise.all([createKong(ctx, { variant: 1 }), createKong(ctx, { variant: 4 })]);
  // battle faces (the target art: a fierce grin) instead of the neutral aim line
  hero.animator.expression = "fierce"; foe.animator.expression = "fierce";
  ctx.scene.add(hero.object, foe.object);
  hero.setLodBias(2); foe.setLodBias(1.5);
  hero.setLook({ rim: "#ffd29a", rimStrength: 0.16, fur: 1.08 });
  foe.setLook({ rim: "#ffcf9a", rimStrength: 0.12 });
  const HS = HERO_STAGE;
  // everything derived from HERO_STAGE is recomputed per apply (it can be mutated live, see restage())
  const heroFrame = () => {
    const face = deg(HS.face), chestB = face - (HS.twistSpine + HS.twistChest - 0.32);
    const A = set.dirW(deg(HS.aim)), chestFwd = set.dirW(chestB), kLeft = set.dirW(chestB - Math.PI / 2);
    return { face, aimYaw: face - deg(HS.aim), A, chestFwd, kLeft, kRight: kLeft.clone().negate() };
  };
  const legs = ["hipR", "kneeR", "ankleR", "hipL", "kneeL", "ankleL"] as const;
  hero.animator.overlay = (add) => {
    // mirror the rig's right-lead slide: the left leg leads, the right one folds under
    for (const b of legs) add.clear(b);
    add.R("hipL", HS.leadHip[0], HS.leadHip[1], HS.leadHip[2]); add.R("kneeL", HS.leadKnee); add.R("ankleL", HS.leadAnkle);
    add.R("hipR", HS.trailHip[0], HS.trailHip[1], HS.trailHip[2]); add.R("kneeR", HS.trailKnee); add.R("ankleR", HS.trailAnkle);
    // the slide's torso twist mirrored too (+ our 3/4 turn toward the camera / foe), head toward the camera
    add.R("spine", -0.02, -0.4 + HS.twistSpine); add.R("chest", 0.0, -0.24 + HS.twistChest);
    add.R("head", HS.headPitch, 0.5 + HS.headYaw);
    add.H(0, HS.drop, 0);
  };
  const C = new THREE.Vector3(), tR = new THREE.Vector3(), tL = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  hero.animator.ik = (an) => {
    const f = heroFrame();
    C.setFromMatrixPosition(an.bone("chest")).add(new THREE.Vector3(0, 0.12, 0));
    tR.copy(C).addScaledVector(f.A, HS.fistR.aim).addScaledVector(f.chestFwd, HS.fistR.fwd).add(new THREE.Vector3(0, HS.fistR.up, 0));
    tL.copy(C).addScaledVector(f.A, HS.fistL.aim).addScaledVector(f.chestFwd, HS.fistL.fwd).add(new THREE.Vector3(0, HS.fistL.up, 0));
    return { R: { target: tR, pole: f.kRight.clone().add(down) }, L: { target: tL, pole: f.kLeft.clone().add(down).add(f.chestFwd.clone().multiplyScalar(-0.5)) } };
  };
  const heroYawOf = () => SHOT.yaw - deg(HS.face);
  set.heroPose.yaw = heroYawOf();
  const f0 = heroFrame();
  hero.setAimOffset(f0.aimYaw, HS.aimPitch);
  await hero.setOffhand("pistol", f0.aimYaw, HS.aimPitch);
  // the foe: dual pistols, wide planted crouch
  const FS = FOE_STAGE;
  foe.animator.overlay = (add) => {
    for (const b of legs) add.clear(b);
    add.R("hipR", FS.hip, 0, -FS.hipAbduct); add.R("hipL", FS.hip, 0, FS.hipAbduct);
    add.R("kneeR", FS.knee); add.R("kneeL", FS.knee); add.R("ankleR", FS.ankle); add.R("ankleL", FS.ankle);
    add.H(0, FS.drop, 0); add.R("spine", FS.spine);
  };
  const fC = new THREE.Vector3(), fR = new THREE.Vector3(), fL = new THREE.Vector3();
  const toHero = new THREE.Vector3().subVectors(set.heroPos.clone().addScaledVector(set.dirW(-Math.PI / 2), 2.4), set.foePos).setY(0).normalize();
  const foeSide = new THREE.Vector3(-toHero.z, 0, toHero.x);   // the foe's left (facing the hero)
  foe.animator.ik = (an) => {
    fC.setFromMatrixPosition(an.bone("chest")).add(new THREE.Vector3(0, 0.05, 0));
    fR.copy(fC).addScaledVector(toHero, 0.62).addScaledVector(foeSide, -0.2).add(new THREE.Vector3(0, -0.1, 0));
    fL.copy(fC).addScaledVector(toHero, 0.55).addScaledVector(foeSide, 0.26).add(new THREE.Vector3(0, -0.16, 0));
    return { R: { target: fR, pole: foeSide.clone().negate().add(down) }, L: { target: fL, pole: foeSide.clone().add(down) } };
  };
  await foe.setOffhand("pistol", FS.offYaw, 0.02);
  hero.apply(set.heroPose, 1 / 60); foe.apply(set.foePose, 1 / 60);
  await Promise.all([hero.weaponReady(), foe.weaponReady()]);
  hold(ctx, hero, set.heroPose, 0.8);
  const offDir = (k: KongActorEx, o: THREE.Vector3) => { const m = k.offMuzzle(new THREE.Vector3()); return o.setFromMatrixPosition(k.bone("wristL")).negate().add(m).normalize(); };
  // dev: a pose tool can mutate HERO_STAGE / FOE_STAGE and call restage() to re-pose the frozen frame
  const restage = async () => {
    set.heroPose.yaw = heroYawOf();
    const f = heroFrame(); hero.setAimOffset(f.aimYaw, HS.aimPitch); await hero.setOffhand("pistol", f.aimYaw, HS.aimPitch);
    for (let i = 0; i < 3; i++) { hero.apply(set.heroPose, 1 / 60); foe.apply(set.foePose, 1 / 60); }
    hero.apply({ ...set.heroPose, fired: true }, 1 / 60); hero.apply(set.heroPose, 1 / 60);
    foe.apply({ ...set.foePose, fired: true }, 1 / 60); foe.apply(set.foePose, 1 / 60);
    const v = new THREE.Vector3();
    set.freezeShot(hero.offMuzzle(new THREE.Vector3()), foe.muzzle(new THREE.Vector3()), offDir(hero, v.clone()), gunDir(foe, v.clone()), hero.muzzle(new THREE.Vector3()), foe.offMuzzle(new THREE.Vector3()));
  };
  ctx.shared.set("firefight:stage", { hero, foe, HS: HERO_STAGE, FS: FOE_STAGE, set, restage });
  if (ctx.shotMode) {
    hold(ctx, foe, set.foePose, 0.8);
    // the frozen frame: both just fired (recoil spring kicked) — flashes + rounds from the real muzzles
    hero.apply({ ...set.heroPose, fired: true }, 1 / 60); hero.apply(set.heroPose, 1 / 60);
    foe.apply({ ...set.foePose, fired: true }, 1 / 60); foe.apply(set.foePose, 1 / 60);
    const v = new THREE.Vector3();
    set.freezeShot(hero.offMuzzle(new THREE.Vector3()), foe.muzzle(new THREE.Vector3()), offDir(hero, v.clone()), gunDir(foe, v.clone()), hero.muzzle(new THREE.Vector3()), foe.offMuzzle(new THREE.Vector3()));
  } else {
    hold(ctx, foe, set.foePose, 0.8);
    const shooter = (k: KongActorEx, p: KongPose, off = false): Shooter => ({ muzzle: (o) => (off ? k.offMuzzle(o) : k.muzzle(o)), dir: (o) => (off ? offDir(k, o) : gunDir(k, o)), kick: () => { p.fired = true; } });
    set.bindShooters(shooter(hero, set.heroPose, true), shooter(foe, set.foePose));
    set.autoplay = true;
  }
}
