// actors — face acceptance test, no browser: drives the real KongAnimator
// face state (kong-rig.ts stepFace → the 8 floats kong.ts uploads: blink, gaze x/y, squint, brow up, brow angry, jaw,
// smile) and checks what a player sees.
//   node --import tsx tools/actors/face-test.mts
// 1. idle blinks: 60 s at 60 Hz → 12–40 blinks/min, every blink fully closed (≥ 0.95) and back open in ≤ 0.25 s, 50
//    kongs never blink in sync (max share closed on one frame ≤ 20 %).
// 2. expressions reach their targets within 0.3 s: aim (brows furrowed, focused lids, flat mouth), hurt (wince, worried
//    brows, grimace = jaw open + frown, no happy squint),
//    victory emote (happy squint, brows up, open smile), freefall (wide eyes, jaw open), dead (eyes shut).
// 3. gaze: saccades stay within ±0.2, eye contact (gazeAt) is reached within 0.15 s.
import { KongAnimator } from "../../client/src/actors/kong-rig";
import type { KongPose } from "../../client/src/actors/api";

const pose = (o: Partial<KongPose> = {}): KongPose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, state: "idle", crouch: false, sprint: false, weapon: null, team: 0, friendly: true, ...o });
let ok = true;
const check = (name: string, pass: boolean, info: string) => { ok &&= pass; console.log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(34)} ${info}`); };
const dt = 1 / 60;

console.log("BLINKS (idle, 60 s)");
{
  const a = new KongAnimator(5); const p = pose();
  let blinks = 0, closed = false, closedAt = 0, worstOpen = 0, t = 0;
  for (let i = 0; i < 3600; i++) {
    a.update(p, dt); t += dt;
    const b = a.face[0];
    if (!closed && b >= 0.95) { closed = true; blinks++; closedAt = t; }
    if (closed && b < 0.05) { closed = false; worstOpen = Math.max(worstOpen, t - closedAt); }
  }
  check("blink rate", blinks >= 12 && blinks <= 40, `${blinks} / min`);
  check("blink reopens", worstOpen <= 0.25, `${(worstOpen * 1000).toFixed(0)} ms worst`);
  const ks = Array.from({ length: 50 }, (_, i) => new KongAnimator(i * 7 + 1));
  let worst = 0;
  for (let i = 0; i < 1200; i++) { let n = 0; for (const k of ks) { k.update(p, dt); if (k.face[0] > 0.5) n++; } worst = Math.max(worst, n / ks.length); }
  check("50 kongs out of sync", worst <= 0.2, `max ${(worst * 100).toFixed(0)} % closed on one frame`);
}

console.log("EXPRESSIONS (value after 0.3 s)");
const expr = (name: string, p: KongPose, want: Array<[number, "<" | ">", number]>, kick?: (a: KongAnimator, p: KongPose) => void) => {
  const a = new KongAnimator(11);
  for (let i = 0; i < 30; i++) a.update(pose(), dt);
  for (let i = 0; i < 18; i++) { if (kick) kick(a, p); a.update(p, dt); }
  const F = a.face; const lab = ["blink", "gx", "gy", "squint", "browUp", "browAngry", "jaw", "smile"];
  const pass = want.every(([i, op, v]) => (op === ">" ? F[i] > v : F[i] < v));
  check(name, pass, want.map(([i, op, v]) => `${lab[i]} ${F[i].toFixed(2)} ${op} ${v}`).join(", "));
};
expr("aim (armed, firing)", pose({ weapon: "ar", pitch: 0.1 }), [[5, ">", 0.4], [0, ">", 0.15], [7, "<", 0.1]], (_a, p) => { p.fired = true; });
expr("hurt", pose({ weapon: "ar" }), [[0, ">", 0.35], [5, "<", -0.5], [6, ">", 0.3], [7, "<", -0.5], [3, "<", 0.1]], (a, p) => { p.hurt = a.hurt.x < 0.25; });
expr("victory emote", pose({ state: "emote" }), [[3, ">", 0.4], [4, ">", 0.6], [6, ">", 0.3], [7, ">", 0.8]]);
expr("freefall (wow)", pose({ state: "freefall" }), [[3, "<", -0.2], [4, ">", 0.6], [6, ">", 0.3]]);
expr("dead", pose({ state: "dead" }), [[0, ">", 0.95]]);
expr("idle friendly smile", pose(), [[7, ">", 0.25], [5, "<", 0.05]]);

console.log("GAZE");
{
  const a = new KongAnimator(3); const p = pose();
  let mx = 0;
  for (let i = 0; i < 1800; i++) { a.update(p, dt); mx = Math.max(mx, Math.abs(a.face[1]), Math.abs(a.face[2])); }
  check("saccades within ±0.2", mx <= 0.2, `max ${mx.toFixed(3)}`);
  a.gazeAt = { x: 0.3, y: 0.1 };
  for (let i = 0; i < 9; i++) a.update(p, dt);
  check("eye contact in 0.15 s", Math.abs(a.face[1] - 0.3) < 0.06 && Math.abs(a.face[2] - 0.1) < 0.05, `gaze ${a.face[1].toFixed(2)}, ${a.face[2].toFixed(2)}`);
}
console.log(ok ? "FACE: ALL PASS" : "FACE: FAIL");
process.exit(ok ? 0 : 1);
