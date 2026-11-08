// actors — the bullet hitbox fit (no browser): poses the player model with the real KongAnimator (client/src/actors/kong-rig.ts),
// skins its hi mesh exactly like kong.ts's shader (M_b · (v − rest_b), four weights), fits shared/sim/const.ts HITBOX's
// shape to it (a head sphere + vertical elliptic cylinders + the crouch remap), and scores any HITBOX with the real hit
// test (shared/sim/hitscan.hot.ts rayCapsule): rays from 8 azimuths through a 2 cm grid over the drawn silhouette.
//   node --import tsx tools/actors/hitbox-fit.mts [--json out.json]
// Prints the fitted HITBOX to paste into const.ts, and the score of the current one and the fitted one:
//   inside = share of the drawn silhouette a ray hits (aim ≥ 95 %);  outside = share of hits more than 0.15 m from the
//   drawn body (lower is better; swinging limbs keep any fixed shape above zero): a shot that visibly misses but still counts; headIn = share of the drawn head a ray scores
//   as a head hit; headOff = share of head hits more than 0.05 m from the drawn head (a body shot paid as a headshot).
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { KongAnimator, BONES, BONE_LIST } from "../../client/src/actors/kong-rig";
import type { KongPose } from "../../client/src/actors/api";
import { HITBOX, PLAYER_H, CROUCH_H } from "../../shared/sim/const";
import { lastZone, rayCapsule } from "../../shared/sim/hitscan.hot";

// ---------------------------------------------------------------------------------------------- the mesh
const glb = readFileSync(new URL("../../public/assets/actors/tt/kong.glb", import.meta.url));
const jsonLen = glb.readUInt32LE(12);
const gl = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
const bin = glb.subarray(20 + jsonLen + 8);
const attr = (prim: { attributes: Record<string, number> }, name: string, n: number) => {
  const a = gl.accessors[prim.attributes[name]], v = gl.bufferViews[a.bufferView];
  const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * 4));
};
const prim = gl.meshes.find((m: { name: string }) => m.name === "hi_kong").primitives[0];
const POS = attr(prim, "POSITION", 3), BI01 = attr(prim, "_BI01", 2), BI23 = attr(prim, "_BI23", 2), BW01 = attr(prim, "_BW01", 2), BW23 = attr(prim, "_BW23", 2);
const NV = POS.length / 3;
const HEAD = BONE_LIST.indexOf("head");
const REST = BONE_LIST.map(function at(b): THREE.Vector3 { const d = BONES[b]; const o = new THREE.Vector3(...d.offset); return d.parent ? o.add(at(d.parent)) : o; } as never) as THREE.Vector3[];
/** a vertex is the head's when the head bone carries most of its weight */
const isHead = new Uint8Array(NV);
for (let i = 0; i < NV; i++) {
  const b = [BI01[i * 2], BI01[i * 2 + 1], BI23[i * 2], BI23[i * 2 + 1]], w = [BW01[i * 2], BW01[i * 2 + 1], BW23[i * 2], BW23[i * 2 + 1]];
  let hw = 0; for (let k = 0; k < 4; k++) if (Math.round(b[k]) === HEAD) hw += w[k];
  isHead[i] = hw > 0.5 ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------- the poses
const pose = (o: Partial<KongPose>): KongPose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, state: "idle", crouch: false, sprint: false, weapon: "ar", team: 0, friendly: true, ...o });
interface Frame { pts: Float32Array; head: Uint8Array; crouch: boolean; name: string }
const frames: Frame[] = [];
const GAITS: Array<{ name: string; fwd: number; side: number; crouch?: boolean; sprint?: boolean; weapon?: KongPose["weapon"] }> = [
  { name: "idle", fwd: 0, side: 0 }, { name: "idle-pistol", fwd: 0, side: 0, weapon: "pistol" }, { name: "idle-sniper", fwd: 0, side: 0, weapon: "sniper" },
  { name: "walk", fwd: 1.6, side: 0 }, { name: "run", fwd: 4, side: 0 }, { name: "sprint", fwd: 7, side: 0, sprint: true, weapon: null },
  { name: "strafe", fwd: 0, side: 2.5 }, { name: "strafe-diag", fwd: 2.2, side: -2.2 }, { name: "backpedal", fwd: -3.5, side: 0 },
  { name: "crouch", fwd: 0, side: 0, crouch: true }, { name: "crouch-walk", fwd: 1.3, side: 0, crouch: true }, { name: "crouch-strafe", fwd: 0, side: 1.3, crouch: true },
];
const M = new THREE.Matrix4(), v = new THREE.Vector3(), acc = new THREE.Vector3();
for (const g of GAITS) for (const pitch of [-0.5, 0, 0.5]) {
  const a = new KongAnimator(5), hz = 60, dt = 1 / hz;
  const p = pose({ vx: g.side, vz: -g.fwd, state: g.fwd || g.side ? "move" : "idle", crouch: !!g.crouch, sprint: !!g.sprint, weapon: g.weapon === undefined ? "ar" : g.weapon, pitch });
  for (let i = 0; i < Math.round(2.6 * hz); i++) {
    p.x += p.vx * dt; p.z += p.vz * dt;
    a.update(p, dt);
    if (i < hz || i % 6) continue;   // 1 s to settle, then every 0.1 s
    const pts = new Float32Array(NV * 3);
    for (let j = 0; j < NV; j++) {
      acc.set(0, 0, 0);
      const b = [BI01[j * 2], BI01[j * 2 + 1], BI23[j * 2], BI23[j * 2 + 1]], w = [BW01[j * 2], BW01[j * 2 + 1], BW23[j * 2], BW23[j * 2 + 1]];
      for (let k = 0; k < 4; k++) {
        if (w[k] <= 0) continue;
        const bi = Math.round(b[k]);
        v.set(POS[j * 3], POS[j * 3 + 1], POS[j * 3 + 2]).sub(REST[bi]).applyMatrix4(M.copy(a.world[bi]));
        acc.addScaledVector(v, w[k]);
      }
      // into the target's frame: feet at the origin, facing −z (yaw 0)
      pts[j * 3] = acc.x - p.x; pts[j * 3 + 1] = acc.y - p.y; pts[j * 3 + 2] = acc.z - p.z;
    }
    frames.push({ pts, head: isHead, crouch: !!g.crouch, name: `${g.name}@${pitch}` });
  }
}

// ---------------------------------------------------------------------------------------------- scoring
type Box = { head: { y: number; z: number; r: number }; parts: number[][]; crouch: number[]; headBias: number };
const CELL = 0.02, FAR = 0.15;
function score(B: Box, fs: Frame[], azimuths = 8, cell = CELL) {
  const save = { head: HITBOX.head, parts: HITBOX.parts, crouch: HITBOX.crouch, headBias: HITBOX.headBias };
  Object.assign(HITBOX, B);
  let inMesh = 0, meshN = 0, hitN = 0, farN = 0, headN = 0, headIn = 0, headHits = 0, headOff = 0;
  for (const f of fs) {
    const h = f.crouch ? CROUCH_H : PLAYER_H;
    for (let k = 0; k < azimuths; k++) {
      const th = (k / azimuths) * Math.PI * 2, dx = Math.sin(th), dz = Math.cos(th), ux = dz, uz = -dx;   // ray dir, lateral axis
      const U0 = -1.2, Y0 = -0.1, NU = Math.round(2.4 / cell), NY = Math.round(2.2 / cell);
      const mesh = new Uint8Array(NU * NY), hd = new Uint8Array(NU * NY);
      for (let j = 0; j < NV; j++) {
        const x = f.pts[j * 3], y = f.pts[j * 3 + 1], z = f.pts[j * 3 + 2];
        const iu = Math.floor((x * ux + z * uz - U0) / cell), iy = Math.floor((y - Y0) / cell);
        // one cell of dilation: the hi mesh's vertices are ~1.5 cm apart, so this closes the gaps between them
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const U = iu + a, Y = iy + b; if (U >= 0 && U < NU && Y >= 0 && Y < NY) { mesh[Y * NU + U] = 1; if (f.head[j]) hd[Y * NU + U] = 1; } }
      }
      const D = chamfer(mesh, NU, NY);
      const HD = chamfer(hd, NU, NY);
      for (let y = 0; y < NY; y++) for (let u = 0; u < NU; u++) {
        const lu = U0 + (u + 0.5) * cell, ly = Y0 + (y + 0.5) * cell;
        const t = rayCapsule(lu * ux - dx * 5, ly, lu * uz - dz * 5, dx, 0, dz, 0, 0, 0, h, 10, 0);
        const i = y * NU + u, hit = t >= 0;
        if (mesh[i]) { meshN++; if (hit) inMesh++; }
        if (hit) { hitN++; if (D[i] * cell > FAR) farN++; }
        const isH = hit && lastZone() === 1;
        if (hd[i]) { headN++; if (isH) headIn++; }
        if (isH) { headHits++; if (HD[i] * cell > 0.05) headOff++; }
      }
    }
  }
  Object.assign(HITBOX, save);
  return { inside: inMesh / meshN, outside: hitN ? farN / hitN : 0, headIn: headN ? headIn / headN : 0, headOff: headHits ? headOff / headHits : 0 };
}

/** distance (cells) from the set cells of `m`, two-pass chamfer */
function chamfer(m: Uint8Array, NU: number, NY: number) {
  const D = new Float32Array(NU * NY);
  for (let i = 0; i < D.length; i++) D[i] = m[i] ? 0 : 1e9;
  for (let y = 0; y < NY; y++) for (let u = 0; u < NU; u++) { const i = y * NU + u; if (u) D[i] = Math.min(D[i], D[i - 1] + 1); if (y) D[i] = Math.min(D[i], D[i - NU] + 1); if (u && y) D[i] = Math.min(D[i], D[i - NU - 1] + 1.414); if (u < NU - 1 && y) D[i] = Math.min(D[i], D[i - NU + 1] + 1.414); }
  for (let y = NY - 1; y >= 0; y--) for (let u = NU - 1; u >= 0; u--) { const i = y * NU + u; if (u < NU - 1) D[i] = Math.min(D[i], D[i + 1] + 1); if (y < NY - 1) D[i] = Math.min(D[i], D[i + NU] + 1); if (u < NU - 1 && y < NY - 1) D[i] = Math.min(D[i], D[i + NU + 1] + 1.414); if (u && y < NY - 1) D[i] = Math.min(D[i], D[i + NU - 1] + 1.414); }
  return D;
}

// ---------------------------------------------------------------------------------------------- the fit
const stand = frames.filter((f) => !f.crouch), crouch = frames.filter((f) => f.crouch);
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const r3 = (x: number) => Math.round(x * 100) / 100;
// head: the sphere over the head's vertices in every standing frame, centred on the median of their centres
const hc: number[][] = [], hy: number[] = [], hz: number[] = [];
for (const f of stand) {
  let sy = 0, sz = 0, n = 0;
  for (let j = 0; j < NV; j++) if (f.head[j]) { sy += f.pts[j * 3 + 1]; sz += f.pts[j * 3 + 2]; n++; }
  hy.push(sy / n); hz.push(sz / n); hc.push([sy / n, sz / n]);
}
// (the start; the descent below moves it — the head's weighted vertices include the neck, so the centre starts low)
const head = { y: r3(Math.max(1.45, pct(hy, 0.5))), z: r3(pct(hz, 0.5)), r: 0.25 };
// body: overlapping height bands, each an ellipse over the band's non-head vertices (centre and axes from the 2 / 98 %
// spread, then grown until 97 % of the band's vertices are inside)
let top = 0; for (const f of stand) for (let j = 0; j < NV; j++) if (!f.head[j]) top = Math.max(top, f.pts[j * 3 + 1]);
const BANDS = [[-0.03, 0.5], [0.45, 0.92], [0.88, 1.28], [1.24, r3(Math.min(top, head.y))]];
const parts: number[][] = [];
for (const [y0, y1] of BANDS) {
  const xs: number[] = [], zs: number[] = [];
  for (const f of stand) for (let j = 0; j < NV; j++) { const y = f.pts[j * 3 + 1]; if (!f.head[j] && y >= y0 && y <= y1) { xs.push(f.pts[j * 3]); zs.push(f.pts[j * 3 + 2]); } }
  const cx = 0, cz = (pct(zs, 0.02) + pct(zs, 0.98)) / 2;   // symmetric across x: a hitbox that leans left would be a balance call
  let a = Math.max(Math.abs(pct(xs, 0.02)), Math.abs(pct(xs, 0.98))), b = (pct(zs, 0.98) - pct(zs, 0.02)) / 2;
  const e = xs.map((x, i) => ((x - cx) / a) ** 2 + ((zs[i] - cz) / b) ** 2), s = Math.sqrt(pct(e, 0.97));
  a *= s; b *= s;
  parts.push([y0, y1, cx, r3(cz), r3(a), r3(b)]);
}
// the heuristic above is only the start: coordinate descent on the real score (a subsample: every 3rd frame, 4 azimuths,
// 4 cm cells), minimising hits far from the drawn body while keeping at least 96 % of the silhouette hittable
const fitted: Box = { head, parts, crouch: HITBOX.crouch, headBias: HITBOX.headBias };
// (a headshot pays more: the head must be the head — most of it scoring as head, few head hits off it)
const cost = (B: Box, fs: Frame[]) => { const s = score(B, fs, 4, 0.04); return s.outside + 4 * Math.max(0, 0.96 - s.inside) + s.headOff + 2 * Math.max(0, 0.85 - s.headIn); };
type Knob = { get: () => number; set: (x: number) => void; min: number; max: number };
const knob = (o: number[] | Record<string, number>, k: number | string, min: number, max: number): Knob =>
  ({ get: () => (o as never)[k], set: (x) => { (o as Record<string | number, number>)[k] = x; }, min, max });
function descend(knobs: Knob[], fs: Frame[], label: string) {
  let c = cost(fitted, fs);
  for (const step of [0.08, 0.04, 0.02, 0.01]) {
    for (let round = 0, moved = true; moved && round < 6; round++) {
      moved = false;
      for (const k of knobs) for (const dir of [1, -1]) {
        const was = k.get(), x = Math.min(k.max, Math.max(k.min, r3(was + dir * step)));
        if (x === was) continue;
        k.set(x); const n = cost(fitted, fs);
        if (n < c - 1e-4) { c = n; moved = true; } else k.set(was);
      }
    }
    console.log(`${label}: step ${step} m, cost ${c.toFixed(4)}`);
  }
}
const standSub = stand.filter((_, i) => i % 3 === 0), crouchSub = crouch.filter((_, i) => i % 2 === 0);
descend([
  knob(head, "y", 1.35, 1.8), knob(head, "z", -0.4, 0.2), knob(head, "r", 0.12, 0.32),
  ...parts.flatMap((P) => [knob(P, 3, -0.5, 0.3), knob(P, 4, 0.08, 0.8), knob(P, 5, 0.08, 0.8)]),
  ...parts.slice(1).map((P) => knob(P, 0, 0.3, 1.6)), ...parts.slice(0, -1).map((P) => knob(P, 1, 0.3, 1.6)),
], standSub, "standing");
// crouch remap (heights above crouch[0] drop by crouch[1], below it scale by crouch[2]), on the crouched frames alone
fitted.crouch = [...HITBOX.crouch];
descend([knob(fitted.crouch, 0, 0.2, 1.2), knob(fitted.crouch, 1, 0, 0.8), knob(fitted.crouch, 2, 0.3, 1)], crouchSub, "crouched");

// ---------------------------------------------------------------------------------------------- report
const cur: Box = { head: HITBOX.head, parts: HITBOX.parts, crouch: HITBOX.crouch, headBias: HITBOX.headBias };
const rows = [["current", cur], ["fitted", fitted]] as const;
const out: Record<string, unknown> = { frames: { stand: stand.length, crouch: crouch.length }, fitted };
for (const [name, B] of rows) {
  const s = score(B, stand), c = score(B, crouch);
  out[name] = { stand: s, crouch: c };
  const f = (x: typeof s) => `inside ${(x.inside * 100).toFixed(1)} %, outside ${(x.outside * 100).toFixed(1)} %, head in ${(x.headIn * 100).toFixed(1)} %, head off ${(x.headOff * 100).toFixed(1)} %`;
  console.log(`${name.padEnd(8)} standing: ${f(s)}\n         crouched: ${f(c)}`);
}
console.log("\nfitted HITBOX (shared/sim/const.ts):");
console.log(`  head: { y: ${head.y}, z: ${head.z}, r: ${head.r} },`);
console.log(`  parts: [\n${parts.map((p) => `    [${p.join(", ")}],`).join("\n")}\n  ],`);
console.log(`  crouch: [${fitted.crouch.join(", ")}],`);
const j = process.argv.indexOf("--json");
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 2));
