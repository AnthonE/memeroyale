// actors — animation acceptance test (no browser): drives the real KongAnimator (client/src/actors/kong-rig.ts) and
// measures the three checks below.
//   node --import tsx tools/actors/anim-test.mts [--json out.json]
// 1. FOOT SLIDING: the kong root moves at a constant velocity for 6 s (60 / 144 / 30 Hz); for each ankle JOINT, frames
//    within 3 cm of its lowest height are "planted"; the metric is median(planted ankle world speed) / root speed.
//    Pass = ≤ 0.10 for every gait; the lowest ankle stays within 2 cm of the rest ankle height (no sinking).
// 2. 3P RELOAD SYNC: 200 reloads of all 6 weapons at 240 Hz and 30 Hz with weapon swaps, reload-cancel-reload and
//    shotgun shell chains, the sim's reload flag driven exactly like shared/sim/player.ts (reloadS per weapon / shell).
//    The animation must start on the flag's rising edge (≤ 1 frame) and end within 50 ms of its falling edge.
// 3. HANDS ON WEAPONS: fist-to-grip / fist-to-foregrip distance in idle / walk / crouch / slide / reload (socket
//    = right fist, so the metric is the LEFT fist vs the foregrip point and the right fist vs the rear grip).
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { KongAnimator, ANKLE_H, reloadSeconds } from "../../client/src/actors/kong-rig";
import type { KongPose } from "../../client/src/actors/api";
import type { WeaponId } from "../../shared/world/map";

const pose = (o: Partial<KongPose> = {}): KongPose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, state: "idle", crouch: false, sprint: false, weapon: "ar", team: 0, friendly: true, ...o });
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * q)] : NaN; };

// ---------------------------------------------------------------------------------------------- 1. feet
const gaits: Array<{ name: string; fwd: number; side: number; crouch?: boolean; sprint?: boolean; weapon?: WeaponId | null }> = [
  { name: "walk", fwd: 1.6, side: 0 }, { name: "run", fwd: 4, side: 0 }, { name: "sprint", fwd: 5.5, side: 0, sprint: true, weapon: null },
  { name: "sprint-7", fwd: 7, side: 0, sprint: true, weapon: null }, { name: "crouch-walk", fwd: 1.3, side: 0, crouch: true },
  { name: "strafe", fwd: 0, side: 2.5 }, { name: "strafe-diag", fwd: 2.2, side: -2.2 }, { name: "backpedal", fwd: -1.6, side: 0 },
  { name: "backpedal-run", fwd: -3.5, side: 0 },
];
const feet: Array<Record<string, number | string>> = [];
let feetPass = true;
for (const hz of [60, 144, 30]) for (const g of gaits) {
  const a = new KongAnimator(7), dt = 1 / hz, yaw = 0.7;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const vx = fx * g.fwd + rx * g.side, vz = fz * g.fwd + rz * g.side, sp = Math.hypot(vx, vz);
  const p = pose({ yaw, vx, vz, state: "move", crouch: !!g.crouch, sprint: !!g.sprint, weapon: g.weapon === undefined ? "ar" : g.weapon });
  const N = Math.round(6 * hz), warm = Math.round(1 * hz);
  const tracks: Array<Array<[number, number, number]>> = [[], []];
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    p.x += vx * dt; p.z += vz * dt;
    a.update(p, dt);
    for (let k = 0; k < 2; k++) { v.setFromMatrixPosition(a.bone(k ? "ankleL" : "ankleR")); tracks[k].push([v.x, v.y, v.z]); }
  }
  const ratios: number[] = []; let minY = Infinity;
  for (const tr of tracks) {
    const lo = Math.min(...tr.slice(warm).map((q) => q[1])); minY = Math.min(minY, lo);
    for (let i = warm + 1; i < tr.length; i++) if (tr[i][1] <= lo + 0.03 && tr[i - 1][1] <= lo + 0.03) ratios.push(Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][2] - tr[i - 1][2]) / dt / sp);
  }
  const m = med(ratios), sink = ANKLE_H - minY;
  const ok = m <= 0.10 && sink <= 0.02;
  if (!ok) feetPass = false;
  feet.push({ hz, gait: g.name, speed: +sp.toFixed(2), contactFrames: ratios.length, medianPlantedFootSpeedOverRoot: +m.toFixed(3), p90: +pct(ratios, 0.9).toFixed(3), minAnkleY: +minY.toFixed(3), restAnkleY: +ANKLE_H.toFixed(3), pass: ok ? "PASS" : "FAIL" });
}

// ---------------------------------------------------------------------------------------------- 2. reload sync
const W: WeaponId[] = ["pistol", "smg", "ar", "shotgun", "sniper", "rocket"];
let rnd = 12345; const R = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const reloadRows: Array<Record<string, number | string>> = [];
let synced = 0, total = 0;
for (const hz of [240, 30]) {
  const a = new KongAnimator(3), dt = 1 / hz, p = pose({ state: "idle" });
  let t = 0;
  const step = () => { a.update(p, dt); t += dt; };
  const active = () => a.reloadOn || a.reloadW > 0.5;
  for (let n = 0; n < 100; n++) {
    const w = W[n % W.length]; p.weapon = w; p.reloading = false;
    for (let i = 0; i < Math.round(0.3 * hz); i++) step();
    const kind = n % 4 === 1 ? "swap" : n % 4 === 2 ? "cancel-reload" : w === "shotgun" ? "shells" : "full";
    const shells = kind === "shells" ? 1 + Math.floor(R() * 4) : 1;
    const full = reloadSeconds(w) * shells;
    const cut = kind === "swap" || kind === "cancel-reload" ? full * (0.2 + 0.6 * R()) : full;
    // sim: the flag is up for `cut` seconds (whole ticks), then drops (reload done, or swapped away)
    p.reloading = true; let startF = -1, i = 0; const t0 = t;
    while (t - t0 < cut - 1e-9) { step(); if (startF < 0 && active()) startF = i; i++; }
    const simEnd = t;
    p.reloading = false;
    if (kind === "swap") p.weapon = W[(n + 1) % W.length];
    let endT = -1;
    for (let k = 0; k < Math.round(0.6 * hz); k++) { if (endT < 0 && !active()) endT = t; step(); }
    if (endT < 0) endT = t;
    const lateEnd = endT - simEnd;
    const ok = startF === 0 && lateEnd <= 0.05 + 1e-6;
    total++; if (ok) synced++;
    reloadRows.push({ hz, n, weapon: w, kind, shells, simS: +cut.toFixed(3), startFrame: startF, endLateMs: +(lateEnd * 1000).toFixed(1), ok: ok ? 1 : 0 });
    // reload-cancel-reload: a second reload right away must restart the animation from its start
    if (kind === "cancel-reload") {
      p.reloading = true; step(); const restarted = a.reloadOn && a.reloadU() < 2 / hz / reloadSeconds(w) + 1e-6;
      const d0 = reloadSeconds(w), t1 = t - dt; while (t - t1 < d0 + 1.5 * dt) step();
      const endOK = !a.reloadOn || w === "shotgun"; p.reloading = false; step(); step();
      total++; if (restarted && endOK) synced++;
      reloadRows.push({ hz, n, weapon: w, kind: "re-reload", restarted: restarted ? 1 : 0, ok: restarted && endOK ? 1 : 0 });
    }
  }
}
const reloadPct = (100 * synced) / total;

// ---------------------------------------------------------------------------------------------- 3. hands on weapons
// right fist centre = the socket origin = the gun's rear grip; left fist vs foregrip (socket frame, as kong.ts builds it)
const FIST = new THREE.Vector3(0.0, -0.125, -0.02);
const GRIPS: Partial<Record<WeaponId, THREE.Vector3>> = { ar: new THREE.Vector3(0, 0.02, -0.72), smg: new THREE.Vector3(0, 0.0, -0.66), shotgun: new THREE.Vector3(0, 0.0, -0.44), sniper: new THREE.Vector3(0, 0, -0.45), rocket: new THREE.Vector3(0, 0.03, -0.31) };
const hands: Array<Record<string, number | string>> = [];
for (const [name, o] of [["idle", {}], ["walk", { state: "move", vz: -1.6 }], ["crouch", { crouch: true }], ["crouch-walk", { crouch: true, state: "move", vz: -1.3 }], ["slide", { crouch: true, sprint: true, state: "slide", vz: -7 }], ["aim-up", { pitch: 0.5 }], ["aim-down", { pitch: -0.5 }]] as Array<[string, Partial<KongPose>]>) {
  for (const w of ["ar", "smg", "shotgun", "sniper", "pistol"] as WeaponId[]) {
    const a = new KongAnimator(1); a.foreGrip = GRIPS[w] ?? null;
    const p = pose({ ...o, weapon: w });
    for (let i = 0; i < 60; i++) { p.x += (p.vx ?? 0) / 60; p.z += (p.vz ?? 0) / 60; a.update(p, 1 / 60); }
    const fistL = FIST.clone().setX(-FIST.x).applyMatrix4(a.bone("wristL"));
    const fistR = FIST.clone().applyMatrix4(a.bone("wristR"));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(a.gunPitch + a.aimPitchOff - a.reloadDip * 0.5, p.yaw + a.aimYawOff + (a.twoHanded ? 0 : 0.04), 0, "YXZ"));
    const fore = a.foreGrip ? a.foreGrip.clone().applyQuaternion(q).add(fistR) : null;
    // the off hand may sit anywhere on the handguard: from 35 % of the grip → foregrip line to the foregrip
    let onGun: number | string = "one-handed";
    if (fore) { const s0 = fistR.clone().lerp(fore, 0.35), seg = new THREE.Line3(s0, fore), c = new THREE.Vector3(); seg.closestPointToPoint(fistL, true, c); onGun = +(fistL.distanceTo(c) * 100).toFixed(1); }
    hands.push({ state: name, weapon: w, leftFistToHandguardCm: onGun, leftFistToForegripCm: fore ? +(fistL.distanceTo(fore) * 100).toFixed(1) : "-", fistGapCm: +(fistL.distanceTo(fistR) * 100).toFixed(1) });
  }
}

const out = { feet, feetPass, reload: { total, synced, pct: +reloadPct.toFixed(1), fails: reloadRows.filter((r) => !r.ok).slice(0, 12) }, hands };
console.log("FEET (median planted-ankle speed / root speed; pass ≤ 0.10, sink ≤ 2 cm)");
for (const f of feet) console.log(`  ${String(f.hz).padStart(3)} Hz ${String(f.gait).padEnd(14)} v=${f.speed}  median ${f.medianPlantedFootSpeedOverRoot}  p90 ${f.p90}  minAnkleY ${f.minAnkleY} (rest ${f.restAnkleY})  n=${f.contactFrames}  ${f.pass}`);
console.log(`RELOAD sync: ${synced}/${total} = ${reloadPct.toFixed(1)} %`);
for (const r of out.reload.fails) console.log("  fail", JSON.stringify(r));
console.log("HANDS (left fist centre ↔ the gun's handguard line / foregrip point, cm)");
for (const h of hands) console.log(`  ${String(h.state).padEnd(12)} ${String(h.weapon).padEnd(8)} handguard ${h.leftFistToHandguardCm}  foregrip ${h.leftFistToForegripCm}  (fists ${h.fistGapCm} cm apart)`);
const ji = process.argv.indexOf("--json"); if (ji > 0) writeFileSync(process.argv[ji + 1], JSON.stringify(out, null, 1));
