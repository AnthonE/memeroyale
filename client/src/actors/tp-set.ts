// char-05-third-person set (the target art): over-the-shoulder gameplay camera behind-left of a
// kong crouch-walking through tall grass on the grassy slope above a beach, banana gun raised toward a thatched stilt
// hamlet on the shore (tp-hamlet.ts); open sea + sea stacks on the left, palm trunk + banana leaves framing the
// top-left, monstera / banana leaves on the right edge, dense hero grass (real 3D blades) filling the bottom half.
// Location: the east end of the LOBBY ISLET (our own POI: terrain flat at padY 2.5 within 60 m of (0, 1020) by
// contract; the lobby's own dressing sits on the north beach, behind this camera). Camera ≈ (40, 1045) looking E by N:
// open sea on the left with the main island on the far-left horizon, the hamlet on the islet's east shore ahead-right. Everything is built in the SHOT FRAME: `at(fwd, right)` = metres along / across the camera heading.
import * as THREE from "three";
import type { WorldCtx } from "../engine/engine";
import type { CamSpec } from "../engine/views";
import type { VegApi, PlantKind } from "../world/veg/api";
import { createKong } from "./kong";
import { pose, hold } from "./kong-dev-views";
import { buildHamlet } from "./tp-hamlet";
import { TP_SET } from "../../../shared/pois/lobby-islet";
import { FOL, foliageTexture, leafGeo } from "./firefight-set";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** kong feet (world xz), camera heading (radians in the xz plane: fwd = (cos, sin)), shot layout */
export const TP = {
  kong: TP_SET.kong,                   // shared/pois/lobby-islet.ts (the veg clearings around the set use the same anchor)
  heading: TP_SET.heading,             // looking E by N from the islet's east end: open sea + far main island on the left
  // camera this far behind the kong (along the heading) — the kong spans y ≈ 35–92 % (target art)
  camBack: 2.7,
  camSide: 1.4,                        // … and this far to the kong's right (kong spans x ≈ 8–45 %)
  camUp: 1.32,                         // camera height above the kong's feet (target art: ~shoulder height)
  pitchDeg: -8,                         // slight look-down (target-art horizon sits ~44 % from the top)
  fov: 55,
  kongTurn: 1.2,                       // kong faces this much right of the camera heading (turned ~70° toward profile —
                                       // head profile, ear + hoop, the grin and the gun arm read from behind-left)
  aimLeft: -0.2,                       // gun this far left of the body facing (target art: arm out front, toward the village)
  village: { dist: 52, bearingDeg: 16 },
};


export function tpFrame() {
  const h = TP.heading, f = [Math.cos(h), Math.sin(h)], r = [-Math.sin(h), Math.cos(h)];
  const [kx, kz] = TP.kong;
  const cx = kx - f[0] * TP.camBack + r[0] * TP.camSide, cz = kz - f[1] * TP.camBack + r[1] * TP.camSide;
  /** world xz of a point `fwd` metres ahead of the camera and `right` metres to its right */
  const at = (fwd: number, right: number): [number, number] => [cx + f[0] * fwd + r[0] * right, cz + f[1] * fwd + r[1] * right];
  const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);   // three.js yaw that faces (dx, dz)
  return { f, r, cam: [cx, cz] as [number, number], at, yawOf };
}

/** staged lunge (kong-rig conventions: hip +X swing forward, −Z abduct on the right / +Z on the left; knee −X bends;
 *  ankle −X lifts the heel): [hip swing, hip abduct, knee, ankle] */
// the back foot is planted flatter (no pale sole showing), its outer side + star to the camera
// (taller crouch-walk — the target art's kong stands knee-deep in the grass with the shorts + both high-tops showing)
const TP_LUNGE = { front: [0.75, 0.08, -0.7, 0.3], back: [-0.35, -0.12, -0.55, -0.1], drop: 0.15, lean: 0.14 };   // drop: +6.7 cm for the longer front leg
/** staged one-handed blaster hold (right fist along the aim, off arm trailing), head / chest overlay (live-tunable) */
// head LEVEL and turned to
// the camera (profile, hoop + grin), both fists on the gun by the rig's default hold IK (right fist on the grip, left
// fist on the fore-end) — no staging IK
const TP_HOLD = { weapon: "smg" as const, reach: 0.62, right: -0.08, down: -0.3, aimUp: 0.0, gunPitch: 0.02, head: [0.12, 0.42], chest: [-0.06, 0], armL: [0.15, -0.18, 0.7] };

/** approximate view camera (rel heights); stage() re-aims it exactly from the terrain */
export function tpView(): CamSpec {
  const F = tpFrame();
  const [tx, tz] = F.at(60, 0);
  return { pos: [+F.cam[0].toFixed(2), 1.9, +F.cam[1].toFixed(2)], target: [+tx.toFixed(2), 0.5, +tz.toFixed(2)], fov: TP.fov, rel: true, stage: "third-person", note: "third-person over-the-shoulder (actors/tp-set.ts)" };
}

export const views: Record<string, CamSpec> = {
  "char-05-third-person": tpView(),
  // dev: wide look at the set from above-behind (placement check)
  "wip-tp-over": (() => { const F = tpFrame(); const [px, pz] = F.at(-18, -6), [tx, tz] = F.at(30, 6); return { pos: [px, 30, pz], target: [tx, 0, tz], fov: 55, rel: true, stage: "tp-dev" } as CamSpec; })(),
};

// ------------------------------------------------------------------------------------------------ hero grass
// Tiers (flat shard blades over a dark carpet read as agave, at 148k tris in 5.5k instances):
//   near (0.2–6 m): instanced TUFTS — each one geometry of 10 long, narrow, ARCHED blades (tapered strap with a centre
//     crease: the lit side of the fold carries a highlight line), lime tips → emerald roots, bending over in all
//     directions like the target art's lush tall grass;
//   mid (6–26 m): 5-blade tufts, 3 segments, wider blades (no sub-pixel slivers at distance);
//   under: a brighter painted carpet (only shows between the mid tufts). Opaque geometry, no alpha test / discard (the
//   Apple GPU's hidden-surface removal keeps overdraw free), no shadow casting.
interface BladeOpts { len: number; w0: number; bend: number; lean: number; az: number; twist: number; segs: number; crease: boolean; tone: number; x: number; z: number }
// (target-art crop: long WIDE glossy mid-green blades, lime only at the lit tips — ours read as pale yellow-lime spikes)
const G_BASE = new THREE.Color("#0d2c07"), G_MID = new THREE.Color("#276f14"), G_TIP = new THREE.Color("#62a326"), G_RIB = new THREE.Color("#a3cf5c");
/** append one arched blade to the arrays (tuft-local: root at (x, 0, z), grows +Y, leans + bends toward azimuth az) */
function blade(o: BladeOpts, pos: number[], nor: number[], col: number[], idx: number[]) {
  const dirH = new THREE.Vector3(Math.sin(o.az), 0, Math.cos(o.az)), side = new THREE.Vector3(Math.cos(o.az), 0, -Math.sin(o.az));
  const base = pos.length / 3, across = o.crease ? 3 : 2;
  const p = new THREE.Vector3(o.x, 0, o.z), t0 = new THREE.Vector3(), n = new THREE.Vector3(), sd = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i <= o.segs; i++) {
    const t = i / o.segs, th = o.lean + o.bend * Math.pow(t, 1.35);        // angle from vertical toward dirH
    if (i > 0) { const tm = (i - 0.5) / o.segs, thm = o.lean + o.bend * Math.pow(tm, 1.35); p.addScaledVector(t0.set(0, Math.cos(thm), 0).addScaledVector(dirH, Math.sin(thm)), o.len / o.segs); }
    const tan = t0.set(0, Math.cos(th), 0).addScaledVector(dirH, Math.sin(th)).normalize();
    sd.copy(side).applyAxisAngle(tan, o.twist * t);
    n.crossVectors(sd, tan).normalize(); if (n.y < 0) n.negate();
    const w = o.w0 * Math.pow(Math.max(0, 1 - Math.pow(t, 1.7)), 0.75) * (0.75 + 0.25 * Math.min(1, t * 5));
    if (t < 0.45) c.copy(G_BASE).lerp(G_MID, t / 0.45); else c.copy(G_MID).lerp(G_TIP, Math.pow((t - 0.45) / 0.55, 0.9));
    c.multiplyScalar(o.tone);
    const fold = o.crease ? 0.3 * w : 0;
    for (let k = 0; k < across; k++) {
      const u = across === 3 ? k - 1 : k * 2 - 1;                             // −1, (0), +1
      const lift = o.crease && u === 0 ? fold : 0;
      pos.push(p.x + sd.x * u * w + n.x * lift, p.y + sd.y * u * w + n.y * lift, p.z + sd.z * u * w + n.z * lift);
      // normals: the two halves of the fold face slightly apart (a crisp lit / shaded split along the midrib)
      const nn = n.clone().addScaledVector(sd, -u * 0.45).normalize();
      nor.push(nn.x, nn.y * 0.8 + 0.2, nn.z);
      const rib = o.crease && u === 0 ? 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.2)) : 0;
      const cc = c.clone().lerp(G_RIB, rib).multiplyScalar(u === 0 ? 1.06 : 1);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < o.segs; i++) {
    const a = base + i * across, b = a + across;
    if (across === 3) idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    else idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
}
/** a tuft: `n` blades from a small root disc, fanned around, lengths/bends varied; seeded */
function tuftGeo(seed: number, n: number, segs: number, crease: boolean, len: [number, number], w0: [number, number]): THREE.BufferGeometry {
  let sd = seed * 7919 + 17; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  for (let b = 0; b < n; b++) {
    const az = (b / n) * Math.PI * 2 + (rnd() - 0.5) * 1.1, rr = 0.03 + rnd() * 0.07;
    blade({
      len: len[0] + rnd() * (len[1] - len[0]), w0: w0[0] + rnd() * (w0[1] - w0[0]), lean: 0.05 + rnd() * 0.3, bend: 0.3 + rnd() * rnd() * 1.6,
      az, twist: (rnd() - 0.5) * 1.2, segs, crease, tone: 0.82 + rnd() * 0.3, x: Math.sin(az) * rr, z: Math.cos(az) * rr,
    }, pos, nor, col, idx);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function grassMaterial(): THREE.MeshLambertMaterial {
  // Lambert (cheap: grass covers half the frame in layers) — matte blades with lit tips; back faces keep the authored
  // (up-tilted) normals so thin blades never go black; a little translucency so sunlit blades read lime like the target art
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace("normal *= faceDirection;", "")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vec3(0.03, 0.04, 0.025);");
  };
  m.customProgramCacheKey = () => "kr-hero-grass-tuft";
  return m;
}

/** where the hero grass grows (shot frame): the whole near foreground, then the slope / jungle edge on the right,
 *  leaving a sandy path that opens toward the hamlet (target art: sand path from mid-frame to the village) */
function grassy(fwd: number, right: number, gy: number) {
  if (fwd < 7) return true;
  if (gy > 0.55) return true;
  return right > fwd * 0.42 + 1.5 || right < -fwd * 0.62;
}

/** tiling painted texture of short grass blades (emerald roots, lime tips) for the carpet between the mid tufts */
function carpetTexture(): THREE.CanvasTexture {
  const N = 1024, cv = document.createElement("canvas"); cv.width = cv.height = N;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#2f6a16"; g.fillRect(0, 0, N, N);
  let sd = 77; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const greens = ["#2a5e12", "#33751a", "#3f8a1e", "#4f9d24", "#63b02c", "#7cc234", "#98d23f"];
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * N, y = rnd() * N, len = 14 + rnd() * 34, ang = -Math.PI / 2 + (rnd() - 0.5) * 1.5, w = 2 + rnd() * 3.5;
    const c = greens[Math.min(greens.length - 1, Math.floor(rnd() * greens.length))];
    for (const dx of [0, -N, N]) for (const dy of [0, -N, N]) {
      g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(x + dx + Math.cos(ang) * len * 0.5 + (rnd() - 0.5) * 8, y + dy + Math.sin(ang) * len * 0.5, x + dx + Math.cos(ang) * len, y + dy + Math.sin(ang) * len); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** green ground carpet under the hero grass so sand never shows between tufts */
function grassCarpet(ctx: WorldCtx, F: ReturnType<typeof tpFrame>): THREE.Mesh {
  const NX = 64, NZ = 48, maxF = 26;
  const tanH = Math.tan(THREE.MathUtils.degToRad(TP.fov / 2)) * (16 / 9);
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  // (the flat carpet shows between tufts — darker: it reads as the shaded depth between blades)
  const c0 = new THREE.Color("#3f6a2a"), c1 = new THREE.Color("#5e8a3e");
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const fwd = -1 + (j / NZ) * (maxF + 1), half = Math.max(0, fwd) * tanH + 2.5, right = (i / NX * 2 - 1) * half;
    const [x, z] = F.at(fwd, right);
    const gy = Math.max(ctx.terrain.height(x, z), -0.2);
    pos.push(x, gy + 0.06, z); uv.push(x / 1.2, z / 1.2);
    const g = grassy(fwd, right, gy) ? 1 : 0;
    const n = 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9) * Math.cos(z * 1.3 - x * 0.4);
    const c = c0.clone().lerp(c1, n);
    col.push(c.r, c.g, c.b, g);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + NX + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);      // CCW seen from above (i = right, j = forward)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ map: carpetTexture(), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  // soften the alpha edge (vertex alpha 0/1 → smooth ramp) so the carpet feathers into the sand
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.a = smoothstep(0.15, 0.85, diffuseColor.a);"); };
  m.customProgramCacheKey = () => "kr-tp-carpet";
  const mesh = new THREE.Mesh(g, m);
  mesh.name = "tp-grass-carpet"; mesh.receiveShadow = true; mesh.renderOrder = -1; mesh.userData.castShadow = false;
  return mesh;
}

/** dense clumped grass: near 10-blade creased tufts, mid 5-blade tufts (see the tier notes above) */
function heroGrass(ctx: WorldCtx, F: ReturnType<typeof tpFrame>, kongAt: [number, number]): THREE.Group {
  const grp = new THREE.Group(); grp.name = "tp-hero-grass";
  const mat = grassMaterial();
  const NEAR_V = [0, 1, 2, 3, 4, 5].map((k) => tuftGeo(100 + k, 10, 4, true, [0.55, 1.05], [0.034, 0.052]));
  const MID_V = [0, 1, 2, 3].map((k) => tuftGeo(200 + k, 5, 3, false, [0.5, 0.85], [0.05, 0.075]));
  // perf (the set cost +0.7–1.05 ms without it): a FAR ring of 3-blade 2-segment tufts (12 tris) past 13 m
  const FAR_V = [0, 1, 2].map((k) => tuftGeo(300 + k, 3, 2, false, [0.55, 0.85], [0.07, 0.1]));
  let seed = 1234;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tanH = Math.tan(THREE.MathUtils.degToRad(TP.fov / 2)) * (16 / 9);
  const NEAR = 6, FAR = 26;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const hue = new THREE.Color();
  const kf = TP.camBack, kr = -TP.camSide;
  let tris = 0;
  const place = (variants: THREE.BufferGeometry[], name: string, fwd0: number, fwd1: number, cell: number, hMul: (fwd: number, right: number, dk: number) => number) => {
    // stratified jitter on a (fwd, right) grid: even coverage, no clumps / holes
    const buckets: Array<Array<[number, THREE.Matrix4, THREE.Color]>> = variants.map(() => []);
    for (let fwd = fwd0; fwd < fwd1; fwd += cell * (0.8 + fwd * 0.02)) {
      const half = fwd * tanH + 1.2;
      for (let right = -half; right < half; right += cell * (0.8 + fwd * 0.02)) {
        const f = fwd + (rnd() - 0.5) * cell, r = right + (rnd() - 0.5) * cell;
        const [x, z] = F.at(f, r);
        const gy = ctx.terrain.height(x, z);
        if (!grassy(f, r, gy)) continue;
        const dk = Math.hypot(x - kongAt[0], z - kongAt[1]);
        const hk = hMul(f, r, dk);
        if (hk <= 0.05) continue;
        const v = Math.floor(rnd() * variants.length);
        m.compose(p.set(x, gy - 0.04, z), q.setFromAxisAngle(Y, rnd() * Math.PI * 2), s.set(1, hk * (0.8 + rnd() * 0.4), 1).multiplyScalar(0.9 + rnd() * 0.25));
        const tone = rnd();
        hue.setHSL(0.27 + (tone - 0.5) * 0.05, 0.7 + rnd() * 0.2, 0.5);
        // value variety: a third of the tufts sit darker (depth between clumps, like the target art)
        const val = rnd() < 0.33 ? 0.62 + rnd() * 0.14 : 0.86 + rnd() * 0.2;
        buckets[v].push([Math.hypot(f, r), m.clone(), new THREE.Color(1, 1, 1).lerp(hue.clone().multiplyScalar(2.0), 0.18).multiplyScalar(val)]);
      }
    }
    variants.forEach((g, i) => {
      buckets[i].sort((a, b) => a[0] - b[0]);       // near → far (early-z where the GPU has it)
      if (!buckets[i].length) return;
      const im = new THREE.InstancedMesh(g, mat, buckets[i].length);
      buckets[i].forEach(([, mm, cc], k) => { im.setMatrixAt(k, mm); im.setColorAt(k, cc); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = true; im.name = `${name}-${i}`;
      im.userData.castShadow = false; im.userData.farShadow = false;
      im.computeBoundingSphere();
      tris += buckets[i].length * (g.index!.count / 3);
      grp.add(im);
    });
  };
  // near: the kong's feet + the camera → feet corridor stay low (target art: both high-tops read over the grass)
  place(NEAR_V, "tp-grass-near", 0.8, NEAR, 0.33, (fwd, right, dk) => {
    const tcor = Math.max(0, Math.min(1, fwd / kf));
    const corr = Math.abs(right - kr * tcor) < 0.35 + 0.45 * tcor && fwd < kf + 0.4 ? 1 : 0;
    // short tufts right up to (and under) the kong: no bare carpet round the feet, the high-tops stay clear
    const feet = dk < 0.12 ? 0 : dk < 2.2 ? 0.3 + 0.47 * ((dk - 0.12) / 2.08) : 0.8;
    const lens = Math.min(1, 0.45 + 0.55 * (fwd - 0.8) / 1.6);   // blades right at the camera stay short (no giant shards)
    return feet * lens * (1 - corr * 0.45);
  });
  place(MID_V, "tp-grass-mid", NEAR - 0.3, 13, 0.52, () => 1.05);
  place(FAR_V, "tp-grass-far", 12.6, FAR, 0.66, () => 0.9);
  grp.userData.tris = tris;
  console.info("[tp-set] hero grass", { tris, instances: grp.children.reduce((a, c) => a + (c as THREE.InstancedMesh).count, 0) });
  return grp;
}

// ------------------------------------------------------------------------------------------------ framing leaves
/** the target art's lens framing: big banana leaves hanging into the top-left, monstera + broad leaves up the right edge,
 *  a fern at the bottom. Own mesh (not the shared veg pools) so it casts NO shadow onto the kong (the sun comes from
 *  the left here: any plant left of the kong shades him). Shot frame: (fwd, right, height above the ground). */
function framingLeaves(ctx: WorldCtx, F: ReturnType<typeof tpFrame>): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  const toLocal = (fwd: number, right: number) => new THREE.Vector3(right, 0, -fwd);
  const g0 = ctx.terrain.height(F.cam[0], F.cam[1]);
  const leaf = (fwd: number, right: number, h: number, yaw: number, up: number, len: number, wid: number, rect: typeof FOL.banana, o: Parameters<typeof leafGeo>[3] = {}, roll = 0) => {
    const [x, z] = F.at(fwd, right);
    const base = toLocal(fwd, right); base.y = Math.max(0, ctx.terrain.height(x, z)) - g0 + h;
    const g = leafGeo(len, wid, rect, o);
    const m = new THREE.Matrix4().makeRotationY(-yaw).multiply(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 - up))).multiply(new THREE.Matrix4().makeRotationY(roll));
    m.setPosition(base);
    geos.push(g.applyMatrix4(m));
  };
  // top-left: banana leaves hanging from above-left into the corner
  // (hung high and far left so no blade crosses the hero's head)
  leaf(1.9, -3.1, 3.2, 1.05, -0.35, 2.0, 0.62, FOL.banana, { droop: 0.35, cup: 0.14, twist: 0.35 }, 0.4);
  leaf(2.3, -3.5, 3.4, 0.55, -0.15, 1.8, 0.58, FOL.banana, { droop: 0.45, cup: 0.12, twist: -0.25 }, -0.3);
  leaf(1.5, -2.9, 3.0, 1.6, -0.55, 1.5, 0.52, FOL.banana, { droop: 0.3, cup: 0.12, twist: 0.2 }, 0.9);
  // (the right edge + the bottom fern are the veg area's own textured monstera / banana plant / fern — see stage();
  // card leaves there read as flat paddles, a brown spike and a green stripe across the sky)
  const mat = new THREE.MeshStandardMaterial({ map: foliageTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 });
  const mesh = new THREE.Mesh(mergeGeometries(geos)!, mat);
  mesh.position.set(F.cam[0], g0, F.cam[1]);
  mesh.rotation.y = F.yawOf(F.f[0], F.f[1]);
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = "tp-framing"; mesh.userData.castShadow = false; mesh.userData.farShadow = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------------ sea stacks
/** a karst sea pillar (target art: tall sheer limestone columns with a jungle cap, sea notch at the waterline): an
 *  irregular fluted prism, strata steps, an undercut notch at the waterline, a rounded crown + a lumpy green cap.
 *  One merged vertex-coloured geometry (~400 tris), origin at sea level. */
function karstGeo(seed: number, R: number, H: number): THREE.BufferGeometry {
  let sd = seed * 9301 + 49297; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const NA = 14, NY = 12, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const flute = Array.from({ length: NA }, () => 0.84 + rnd() * 0.3);
  const lean = [(rnd() - 0.5) * 0.12 * R, (rnd() - 0.5) * 0.12 * R];
  const step = Array.from({ length: NY + 1 }, () => (rnd() - 0.5) * 0.1);
  const stone = new THREE.Color("#c9bea7"), dark = new THREE.Color("#8f8574"), moss = new THREE.Color("#5f8a34"), c = new THREE.Color();
  const Y0 = -4;
  for (let j = 0; j <= NY; j++) {
    const t = j / NY, y = Y0 + (H - Y0) * t;
    // profile: waterline notch, straight sheer body, slight shoulder, rounded crown
    const notch = 1 - 0.18 * Math.exp(-Math.pow((y - 1.5) / 3, 2));
    const crown = t > 0.86 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.86) / 0.14, 2))) * 0.35 + 0.65 * (1 - (t - 0.86) / 0.14 * 0.4) : 1;
    const rad = R * notch * crown * (1 + step[j]) * (1 - 0.1 * t);
    for (let i = 0; i <= NA; i++) {
      const a = (i / NA) * Math.PI * 2, k = flute[i % NA];
      pos.push(Math.cos(a) * rad * k + lean[0] * t * t, y, Math.sin(a) * rad * k + lean[1] * t * t);
      const streak = (flute[i % NA] - 0.84) / 0.3;
      c.copy(stone).lerp(dark, 0.55 * (1 - streak) + 0.25 * (Math.sin(y * 0.9 + i) * 0.5 + 0.5) * 0.4);
      if (t > 0.8) c.lerp(moss, Math.min(1, (t - 0.8) / 0.12) * (0.55 + 0.45 * streak));
      if (y < 1.2) c.lerp(dark, 0.5);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  // jungle cap: a lumpy dome of foliage over the crown
  const base = pos.length / 3, CA = 12, CR = 4, top = H;
  for (let j = 0; j <= CR; j++) {
    const t = j / CR, ph = t * Math.PI / 2;
    for (let i = 0; i <= CA; i++) {
      const a = (i / CA) * Math.PI * 2, lump = 1 + 0.18 * Math.sin(a * 3 + seed) * Math.cos(t * 3 + seed);
      const rr = R * 0.72 * Math.cos(ph) * lump;
      pos.push(Math.cos(a) * rr + lean[0], top - 0.06 * H + Math.sin(ph) * R * 0.34 * lump, Math.sin(a) * rr + lean[1]);
      c.copy(moss).multiplyScalar(0.75 + 0.35 * t + 0.1 * Math.sin(a * 5 + seed)); col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < CR; j++) for (let i = 0; i < CA; i++) { const a = base + j * (CA + 1) + i, b = a + CA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
async function seaStacks(ctx: WorldCtx, F: ReturnType<typeof tpFrame>): Promise<THREE.Group> {
  const grp = new THREE.Group(); grp.name = "tp-sea-stacks";
  // distant karst sea stacks on the left horizon (target art: x 7–22 %, tall narrow columns, tallest reaching y ≈ 33 %)
  // [dist, bearingDeg (− = left), radius, height, seed]
  const list: Array<[number, number, number, number, number]> = [
    [620, -35, 9, 64, 11], [660, -31, 6, 40, 12], [900, -26, 13, 74, 13], [960, -21, 7, 38, 14], [520, -38, 4.5, 24, 15], [1100, -30, 10, 52, 16], [420, -33, 3.5, 12, 17],
    // screen off the harbour cranes on the far-left horizon (bearing ≈ −36°): big stacks, first one on open water wins
    [300, -37, 11, 48, 21], [360, -35.5, 10, 42, 22], [240, -38, 8, 30, 23], [340, -29, 9, 38, 24], [420, -26, 7, 30, 25],
  ];
  const [cx, cz] = F.cam;
  const parts: THREE.BufferGeometry[] = [];
  for (const [d, bd, rr, hh, sd] of list) {
    const b = THREE.MathUtils.degToRad(bd);
    const x = cx + d * (F.f[0] * Math.cos(b) + F.r[0] * Math.sin(b)), z = cz + d * (F.f[1] * Math.cos(b) + F.r[1] * Math.sin(b));
    if (ctx.terrain.height(x, z) > -2) continue;
    const g = karstGeo(sd, rr, hh);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sd * 1.7), new THREE.Vector3(1, 1, 1)));
    parts.push(g);
  }
  if (parts.length) {
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
    // far away: no shadow casting (they would only land on the sea)
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = "tp-stack"; mesh.userData.castShadow = false;
    grp.add(mesh);
  }
  return grp;
}

// ------------------------------------------------------------------------------------------------ sightline
// The kong footprint, the camera → kong corridor, the sightline to the hamlet and the sun side are kept free of the
// island's scatter plants by CLEARINGS registered with the lobby islet POI (shared/pois/lobby-islet.ts TP_SET +
// clearings; the lobby's own dressing honours them too via inTpClearing).

// ------------------------------------------------------------------------------------------------ stage
/** the view camera, exactly (the rel view is only an approximation on this slope) */
export function tpCamera(ctx: WorldCtx) {
  const F = tpFrame();
  const [kx, kz] = TP.kong, cy = Math.max(0, ctx.terrain.height(kx, kz)) + TP.camUp;
  const [tx, tz] = F.at(60, 0);
  return { pos: new THREE.Vector3(F.cam[0], cy, F.cam[1]), target: new THREE.Vector3(tx, cy + 60 * Math.tan(THREE.MathUtils.degToRad(TP.pitchDeg)), tz) };
}

/** the thatched hamlet's world anchor (the char-05 set builds it; drop-05's glider shot re-uses the same village) */
export function hamletAnchor(ctx: WorldCtx) {
  const F = tpFrame(), cy = tpCamera(ctx).pos.y;
  const vb = THREE.MathUtils.degToRad(TP.village.bearingDeg), vd = TP.village.dist;
  const [vx, vz] = F.at(vd * Math.cos(vb), vd * Math.sin(vb));
  return { x: vx, z: vz, yaw: F.yawOf(vx - F.cam[0], vz - F.cam[1]), cam: [F.cam[0], cy, F.cam[1]] as [number, number, number] };
}

let staged = false;
/** stages: "third-person" = build the set + aim the view camera; "tp-dev" = build the set only (dev views) */
export async function stage(ctx: WorldCtx, s: string) {
  if (s !== "third-person" && s !== "tp-dev") return;
  const cam = tpCamera(ctx);
  if (s === "third-person") {
    ctx.camera.position.copy(cam.pos); ctx.camera.lookAt(cam.target);
    ctx.camera.fov = TP.fov; ctx.camera.updateProjectionMatrix(); ctx.camera.updateMatrixWorld(true);
  }
  if (staged) return;
  staged = true;
  const F = tpFrame();
  const ground = (x: number, z: number) => Math.max(0, ctx.terrain.height(x, z));
  const [kx, kz] = TP.kong, ky = ground(kx, kz);

  // the kong: crouch-walking, facing right of the camera heading, gun raised toward the hamlet
  const k = await createKong(ctx, { variant: 3 });
  ctx.scene.add(k.object);
  // target art: the fur reads mid-brown with a warm rim from the key light (a gameplay kong keeps the team rim)
  // (without it he reads as a #2b0c04 maroon blob — the sun is ahead of him here, the camera sees his shaded back: a strong warm fill)
  k.setLook({ rim: "#ffd9a0", rimStrength: 0.3, fur: 1.18, fill: "#86755a" });
  k.setLodBias(2);
  const speed = 1.3;
  // the target art's prowl: a WIDE lunge — left leg planted forward, right leg stretched back with the heel up (its sole and
  // star toward the camera), hips low, torso leaning into the move (the gait's own phase never holds this still)
  const L = TP_LUNGE, H = TP_HOLD;
  k.animator.overlay = (add) => {
    for (const b of ["hipR", "kneeR", "ankleR", "hipL", "kneeL", "ankleL"] as const) add.clear(b);
    add.R("hipL", L.front[0], 0, L.front[1]); add.R("kneeL", L.front[2]); add.R("ankleL", L.front[3]);
    add.R("hipR", L.back[0], 0, L.back[1]); add.R("kneeR", L.back[2]); add.R("ankleR", L.back[3]);
    add.H(0, L.drop, 0); add.R("spine", L.lean); add.R("chest", H.chest[0], H.chest[1]);
    // head level, turned toward the camera (profile, hoop and grin read)
    add.R("head", H.head[0], H.head[1]);
  };
  k.animator.ik = null;   // the default two-handed hold IK (kong-rig solveHold)
  const restage = () => {
    const F2 = tpFrame(), cam2 = tpCamera(ctx);
    ctx.camera.position.copy(cam2.pos); ctx.camera.lookAt(cam2.target); ctx.camera.updateMatrixWorld(true);
    const kh = TP.heading + TP.kongTurn, kd = [Math.cos(kh), Math.sin(kh)];
    k.setAimOffset(TP.aimLeft, H.gunPitch);
    hold(ctx, k, pose(kx, ky, kz, F2.yawOf(kd[0], kd[1]), { crouch: true, vx: kd[0] * speed, vz: kd[1] * speed, weapon: H.weapon, pitch: 0.06, state: "move" }), 1.35);
  };
  restage();
  // live tuning: mutate ctx.shared "tp:stage" and call its restage()
  ctx.shared.set("tp:stage", { TP, L: TP_LUNGE, H: TP_HOLD, restage });

  // the hamlet on the shore ahead-right
  const hamlet = await buildHamlet(ctx, hamletAnchor(ctx));
  ctx.scene.add(hamlet);

  ctx.scene.add(grassCarpet(ctx, F));
  ctx.scene.add(heroGrass(ctx, F, TP.kong));
  ctx.scene.add(framingLeaves(ctx, F));
  ctx.scene.add(await seaStacks(ctx, F));

  // NOTE: the target art's "storm on the horizon" is dark storm CLOUDS + lightning in the sky (atmos). The gameplay storm
  // wall (game/storm) was tried here and reads as a purple curtain — not used.

  // framing plants from the island's own species (VegApi): [kind, fwd, right, yaw, scale]
  const veg = ctx.shared.get("veg") as VegApi | undefined;
  if (veg) {
    const items: Array<[PlantKind, number, number, number, number]> = [
      ["palm", 1.4, -3.0, 0.4, 1.0],              // trunk up the left edge (its crown shadow falls right, past the kong)
      ["palm", 12, 9, 1.3, 1.1], ["palm", 17, 12, 2.9, 1.2], ["palm-leaning", 9, -6.5, 0.5, 1.0],
      // right edge (target art: a big glossy monstera / banana clump from x 85 % down to the grass) + the bottom fern
      // (the near monstera read neon in the sun — it sits back in the banana plant's shade, the edge is broad dark leaves)
      ["banana-plant", 3.4, 3.9, 2.2, 1.05], ["monstera", 5.6, 5.2, 0.6, 1.1], ["banana-plant", 7.0, 6.2, 1.1, 0.9],
      ["fern", 1.5, 0.95, 0.9, 0.75], ["fern", 2.5, 2.1, 2.6, 0.8],
    ];
    const byKind = new Map<PlantKind, THREE.Matrix4[]>();
    for (const [kind, fw, rt, yaw, sc] of items) {
      const [x, z] = F.at(fw, rt);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, ground(x, z) - 0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sc, sc, sc));
      (byKind.get(kind) ?? byKind.set(kind, []).get(kind)!).push(m);
    }
    for (const [kind, ms] of byKind) veg.plant(kind, ms);
  }
}
