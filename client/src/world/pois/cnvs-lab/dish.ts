// CNVS LAB — the hero landmark: a 13 m satellite dish on its turntable + yoke atop the dish tower (P), and the 31 m
// lattice antenna mast with its small uplink dish, panel antennas and red aviation beacon. The dish's turntable drum and
// yoke arms are colliders (shared/pois/cnvs-lab.ts dishParts); the bowl itself floats ≥ 43 m (above every head on the
// tower roof and the platform), the mast's legs collide up to 6 m and carry no bracing below 6 m (nothing to walk into).
import * as THREE from "three";
import { DISH, MAST, G, L2 } from "../../../../../shared/pois/cnvs-lab";
import { Bins, type V3 } from "./geo";
import type { LabMats } from "./mats";

export function buildDish(M: LabMats, shell: Bins, near: Bins) {
  const D = DISH, ca = Math.cos(D.az), sa = Math.sin(D.az), ce = Math.cos(D.elev), se = Math.sin(D.elev);
  // turntable drum (octagonal), bearing ring, cable wrap
  // (parity: the drum is the collider's square footprint — a chunky bevelled yellow block, round bearing on top)
  const hr = D.turnR * 0.92;
  shell.box(M.yellow, D.u - hr, L2, D.v - hr, D.u + hr, D.turnTop - 0.005, D.v + hr, { bevel: 0.14 });
  shell.box(M.graphite, D.u - hr - 0.02, L2, D.v - hr - 0.02, D.u + hr + 0.02, L2 + 0.25, D.v + hr + 0.02, { bevel: 0.04 });
  // bearing flange: flush with the drum top (the collider top) — parity: never proud of it
  shell.add(M.graphite, new THREE.CylinderGeometry(D.turnR * 0.8, D.turnR * 0.8, 0.22, 24), new THREE.Matrix4().makeTranslation(D.u, D.turnTop - 0.105, D.v));
  // yoke arms (the colliders) + the elevation axle
  const perp: [number, number] = [-sa, ca];
  const armTop = D.pivotY + 0.4;
  for (const sgn of [-1, 1]) {
    const pu = D.u + perp[0] * 1.6 * sgn, pv = D.v + perp[1] * 1.6 * sgn;
    // (1 cm proud of the arm collider, from the drum top: its corners are drawn where a grazing ray clips them)
    // (yellow yoke arms — they read against the white bowl and over the tower railing)
    shell.box(M.yellow, pu - 0.315, D.turnTop - 0.01, pv - 0.315, pu + 0.315, armTop, pv + 0.315, { bevel: 0.03 });
    shell.cyl(M.graphite, [pu - perp[0] * 0.35 * sgn, D.pivotY, pv - perp[1] * 0.35 * sgn], [pu + perp[0] * 0.3 * sgn, D.pivotY, pv + perp[1] * 0.3 * sgn], 0.62, 20);
  }
  // the bowl: axis a = (ce·ca, se, ce·sa) in (u, y, v); vertex 0.8 m in front of the pivot
  const R = D.R, f = 0.6 * R, depth = R * R / (4 * f);
  const axis = new THREE.Vector3(ce * ca, se, ce * sa).normalize();
  const vertex = new THREE.Vector3(D.u, D.pivotY, D.v).addScaledVector(axis, 0.8);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const place = (off = 0) => new THREE.Matrix4().compose(vertex.clone().addScaledVector(axis, off), q, new THREE.Vector3(1, 1, 1));
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 14; i++) { const r = R * (i / 14) ** 0.85; prof.push([Math.max(0.001, r), r * r / (4 * f)]); }
  // (LatheGeometry faces AWAY from its axis = the convex side): the reflector (concave, facing the sky) is the
  // REVERSED profile, the painted back skin the plain one 0.14 m behind
  shell.lathe(M.dish, [...prof].reverse(), 48, place(), 0xffffff, true);
  // bowl AO + rim shading: a darker band just inside the rim (the lip's shadow) and round the hub,
  // 3 cm above the reflector so they never z-fight; an inner graphite lip ring under the yellow rim
  const band = (r0: number, r1: number, tint: number, off: number) => {
    const pr: Array<[number, number]> = []; for (let i = 0; i <= 4; i++) { const r = r0 + (r1 - r0) * i / 4; pr.push([r, r * r / (4 * f) + off]); }
    shell.lathe(M.dish, pr.reverse(), 48, place(), tint, true);
  };
  band(R * 0.8, R * 0.9, 0xd9d4c6, 0.03); band(R * 0.9, R * 0.995, 0xbfb9aa, 0.035); band(R * 0.08, R * 0.2, 0xd2cdc0, 0.03);
  { const lip = new THREE.TorusGeometry(R - 0.32, 0.12, 6, 72); lip.rotateX(Math.PI / 2); lip.translate(0, (R - 0.32) * (R - 0.32) / (4 * f) + 0.04, 0); shell.add(M.graphite, lip, place(), 0xffffff, true); }
  // a THICK shell (toy-like): the back skin 0.3 m behind at the hub growing to 0.55 m at the rim
  const back = prof.map(([r, y]) => [r, y - 0.3 - 0.25 * (r / R)] as [number, number]);
  shell.lathe(M.white, back, 48, place(), 0xe8e6de);
  // rim ring (yellow) + radial ribs on the back + hub
  const rim = new THREE.TorusGeometry(R + 0.1, 0.46, 12, 72); rim.rotateX(Math.PI / 2); rim.translate(0, depth - 0.25, 0);
  shell.add(M.yellow, rim, place(), 0xffffff, true);
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6, dx = Math.cos(a), dz = Math.sin(a);
    const pts: V3[] = [];
    for (const t of [0.12, 0.5, 0.95]) { const r = R * t; const p = new THREE.Vector3(dx * r, r * r / (4 * f) - 0.62 - 0.2 * t, dz * r).applyMatrix4(place()); pts.push([p.x, p.y, p.z]); }
    shell.poly(M.graphite, pts, 0.13, 6);
  }
  const hub = new THREE.CylinderGeometry(1.35, 1.6, 1.5, 20); hub.translate(0, -0.9, 0);
  shell.add(M.graphite, hub, place(), 0xffffff, true);
  // feed: four struts from the rim to the focus + the feed horn + a yellow sub-reflector
  const focus = vertex.clone().addScaledVector(axis, f);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const p = new THREE.Vector3(Math.cos(a) * R * 0.92, depth * 0.85, Math.sin(a) * R * 0.92).applyMatrix4(place());
    shell.cyl(M.graphite, [p.x, p.y, p.z], [focus.x, focus.y, focus.z], 0.22, 10);
    // strut feet: bolted yellow brackets on the rim
    shell.add(M.yellow, new THREE.SphereGeometry(0.34, 10, 8), new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
  }
  const horn = new THREE.CylinderGeometry(0.42, 0.85, 2.1, 20); horn.translate(0, f - 0.7, 0);
  const hornBox = new THREE.CylinderGeometry(0.95, 0.95, 0.5, 20); hornBox.translate(0, f + 0.2, 0);
  shell.add(M.graphite, hornBox, place(), 0xffffff, true);
  shell.add(M.graphite, horn, place(), 0xffffff, true);
  const hornRing = new THREE.CylinderGeometry(0.9, 0.9, 0.18, 20); hornRing.translate(0, f - 1.6, 0);
  shell.add(M.yellow, hornRing, place(), 0xffffff, true);
  const sub = new THREE.CylinderGeometry(1.15, 0.35, 0.45, 24); sub.translate(0, f + 0.7, 0);
  shell.add(M.yellow, sub, place(), 0xffffff, true);
  near.add(M.red, new THREE.SphereGeometry(0.12, 10, 8), new THREE.Matrix4().makeTranslation(focus.x + axis.x * 0.7, focus.y + axis.y * 0.7, focus.z + axis.z * 0.7));
  // counterweight behind the hub
  const cw = vertex.clone().addScaledVector(axis, -1.9);
  shell.obox(M.graphite, [cw.x, cw.y, cw.z], [3.0, 1.7, 1.6], { yaw: -D.az + Math.PI / 2, bevel: 0.14 });
  // elevation housing over the axle (chunky yellow gearbox, above every head)
  shell.obox(M.yellow, [D.u, D.pivotY, D.v], [1.2, 1.4, 4.2], { yaw: -D.az, bevel: 0.2 });

  // ---- the antenna mast (square lattice, tapering)
  const { u, v, half, h } = MAST, top = G + h;
  const legAt = (k: number, y: number): V3 => { const t = (y - G) / h, s = half * (1 - 0.66 * t); return [u + (k & 1 ? s : -s), y, v + (k & 2 ? s : -s)]; };
  for (let k = 0; k < 4; k++) shell.cyl(M.galv, legAt(k, G - 0.2), legAt(k, top), 0.11, 8, { r1: 0.07 });
  const ring = (y: number, r = 0.045) => { const o = [0, 1, 3, 2, 0]; for (let i = 0; i < 4; i++) shell.cyl(M.galv, legAt(o[i], y), legAt(o[i + 1], y), r, 6); };
  const step = 2.5;
  for (let y = G + 6; y < top - 0.5; y += step) {
    ring(y);
    const o = [0, 1, 3, 2, 0];
    for (let i = 0; i < 4; i++) { shell.cyl(M.galv, legAt(o[i], y), legAt(o[i + 1], y + step), 0.035, 5); shell.cyl(M.galv, legAt(o[i + 1], y), legAt(o[i], y + step), 0.035, 5); }
  }
  // (the base section carries only a head-high ring: nothing to walk into between the legs)
  ring(G + 5.8, 0.06);
  for (let k = 0; k < 4; k++) { const p = legAt(k, G); shell.box(M.concrete, p[0] - 0.45, G - 0.2, p[2] - 0.45, p[0] + 0.45, G + 0.2, p[2] + 0.45, { bevel: 0.05, tint: 0xcfc8ba }); }
  // platforms (visual, unreachable), uplink dish, panel antennas, beacon
  for (const py of [G + 13, G + 23]) {
    const s = half * (1 - 0.66 * (py - G) / h) + 0.5;
    shell.box(M.grate, u - s, py - 0.06, v - s, u + s, py, v + s);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) near.cyl(M.yellow, [u + a * s, py, v + b * s], [u + a * s, py + 1, v + b * s], 0.03, 6);
    near.poly(M.yellow, [[u - s, py + 1, v - s], [u + s, py + 1, v - s], [u + s, py + 1, v + s], [u - s, py + 1, v + s], [u - s, py + 1, v - s]], 0.03, 6);
  }
  {
    const dy = G + 15.2, dq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.7, 0.3, 0.64).normalize());
    const dp = new THREE.Vector3(u - 1.9, dy, v + 1.6), dm = new THREE.Matrix4().compose(dp, dq, new THREE.Vector3(1, 1, 1));
    const pr: Array<[number, number]> = []; for (let i = 0; i <= 8; i++) { const r = 1.5 * i / 8; pr.push([Math.max(0.001, r), r * r / 3]); }
    shell.lathe(M.dish, [...pr].reverse(), 32, dm, 0xffffff, true);
    shell.lathe(M.white, pr.map(([r, y]) => [r, y - 0.06] as [number, number]), 32, dm, 0xe0ded6);
    shell.cyl(M.galv, [dp.x, dp.y, dp.z], [u - 0.6, dy, v + 0.5], 0.08, 8);
    const fz = new THREE.Vector3(0, 1.1, 0).applyMatrix4(dm);
    shell.cyl(M.white, [dp.x, dp.y, dp.z], [fz.x, fz.y, fz.z], 0.04, 6);
  }
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094 + 0.4, s = half * 0.42 + 0.35;
    shell.obox(M.white, [u + Math.cos(a) * s, G + 26, v + Math.sin(a) * s], [0.45, 2.2, 0.16], { yaw: -a + Math.PI / 2, bevel: 0.04 });
  }
  shell.cyl(M.galv, [u, top, v], [u, top + 4.5, v], 0.06, 6, { r1: 0.025 });
  near.add(M.red, new THREE.SphereGeometry(0.22, 12, 10), new THREE.Matrix4().makeTranslation(u, top + 0.3, v));
  near.add(M.red, new THREE.SphereGeometry(0.14, 10, 8), new THREE.Matrix4().makeTranslation(u, top + 4.6, v));
  near.add(M.red, new THREE.SphereGeometry(0.14, 10, 8), new THREE.Matrix4().makeTranslation(u, G + 16, v));
  return { axis, vertex };
}
