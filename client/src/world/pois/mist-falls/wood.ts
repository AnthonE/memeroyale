// MIST FALLS — timber + rope: the gorge bridge, the high bridge to the hoist pillar, the river bridge (X-braced), the
// thatched lookout with its flag, the north-bluff walkway, the hoist crane + hanging crate, crates, the dugout canoe.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { FALLS, LOOKOUT_STEP, type FallsResolved } from "../../../../../shared/pois/jungle-falls";
import { newBuckets, ropeBridge, lookout, walkway, hoist, canoe, woodMaterials, woodMeshes, timber, log } from "../_kit/jungle-wood";
import { pbr, crateTex } from "../_kit/jungle-mat";
import { bevelBox, merge, staticMesh } from "../_kit/jungle-geo";
import { bananaHand, bananaMaterial } from "../_kit/jungle-gold";

export function buildWood(ctx: WorldCtx, root: THREE.Group, R: FallsResolved) {
  const h = (x: number, z: number) => ctx.terrain.height(x, z);
  const B = newBuckets();
  const V = (p: [number, number, number]) => new THREE.Vector3(p[0], p[1], p[2]);
  for (const b of R.bridges) ropeBridge(V(b.a), V(b.b), { sag: b.sag, width: b.width, xBrace: true /* rope verticals ~1.9 m apart + X-braces on every bridge (never a picket fence) */, seed: b.id.length * 7, anchors: b.anchors, missing: b.id === "high" ? 0.06 : 0.015, frames: b.id === "river", railH: b.id === "river" ? 1.2 : undefined }, B);
  const lo = FALLS.lookout;
  lookout(new THREE.Vector3(lo.x, lo.deckY, lo.z), h, lo.w, lo.d, lo.yaw, lo.roofH, B, { openSide: 1, openBack: true });
  // the open back end: plank treads on two log stringers down to the shelf (shared: FallsResolved.lookoutSteps)
  { const steps = R.lookoutSteps ?? [], fx = Math.cos(lo.yaw), fz = -Math.sin(lo.yaw), sx = -fz, sz = fx, S = LOOKOUT_STEP;
    for (const [x, z, y] of steps) B.wood.push(timber(S.tread + 0.04, 0.09, S.width, new THREE.Vector3(x, y - 0.045, z), lo.yaw));
    if (steps.length) { const [lx, lz, ly] = steps[steps.length - 1], e0 = new THREE.Vector3(lo.x - fx * lo.w / 2, lo.deckY - 0.1, lo.z - fz * lo.w / 2), e1 = new THREE.Vector3(lx - fx * S.tread, ly - S.rise - 0.1, lz - fz * S.tread);
      for (const sd of [-1, 1]) { const o = sd * (S.width / 2 - 0.06); B.log.push(log(e0.clone().add(new THREE.Vector3(sx * o, 0, sz * o)), e1.clone().add(new THREE.Vector3(sx * o, 0, sz * o)), 0.07, "#cfb38e", 7)); } } }
  const W = FALLS.walkway.map(([x, z, y]) => new THREE.Vector3(x, y, z));
  for (let i = 0; i + 1 < W.length; i++) walkway(W[i], W[i + 1], 1.6, B);
  const ho = FALLS.hoist;
  const crateAt = hoist(new THREE.Vector3(ho.x, FALLS.pillar.top, ho.z), ho.yaw, ho.jib, ho.drop, B);
  const c = FALLS.canoe, cy = R.canoeY;
  // bedded INTO the sand (keel ~0.2 m deep, a hand-dug trough look), never perched on its ends
  canoe(new THREE.Vector3(c.x, cy + c.len * 0.085 * 0.55, c.z), c.yaw, c.len, B, 0.05, (R.canoePitch ?? 0) * 0.6);
  const mats = woodMaterials(pbr(ctx, "planks"));
  for (const m of woodMeshes(B, mats, "falls")) root.add(m);
  // crates: hanging from the hoist, two on the lookout deck, one at the river bridge head (painted BANANA CO. sides)
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex(), roughness: 0.82, color: "#fff2e0" });
  const crates: Array<[THREE.Matrix4, number]> = [[crateAt, 1.2]];
  const fx = Math.cos(lo.yaw), fz = -Math.sin(lo.yaw);
  crates.push([new THREE.Matrix4().compose(new THREE.Vector3(lo.x - fx * 2.2 + fz * 1.4, lo.deckY + 0.45, lo.z - fz * 2.2 - fx * 1.4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lo.yaw + 0.2), new THREE.Vector3(1, 1, 1)), 1.0]);
  crates.push([new THREE.Matrix4().compose(new THREE.Vector3(lo.x - fx * 2.9 + fz * 0.3, lo.deckY + 0.35, lo.z - fz * 2.9 - fx * 0.3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lo.yaw - 0.3), new THREE.Vector3(0.8, 0.8, 0.8)), 0.8]);
  const rb = R.bridges.find((b) => b.id === "river")!;
  crates.push([new THREE.Matrix4().compose(new THREE.Vector3(rb.b[0] + 2.2, h(rb.b[0] + 2.2, rb.b[2] - 1.5) + 0.45, rb.b[2] - 1.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), new THREE.Vector3(1, 1, 1)), 1.0]);
  const bn: THREE.BufferGeometry[] = [];
  for (const [m, s] of crates) {
    const g = bevelBox(s * 1.1, s * 0.9, s * 1.1, 0.04); g.applyMatrix4(m);
    const mesh = new THREE.Mesh(g, crateMat); mesh.castShadow = mesh.receiveShadow = true; mesh.name = "falls-crate"; root.add(mesh);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    bn.push(bananaHand(4, 0.3 * s, p.x - 0.12 * s, p.y + s * 0.47, p.z, 0.6 + p.x, 0.2, Math.round(p.x)));
  }
  const bm = staticMesh(merge(bn), bananaMaterial(), "falls-bananas");
  if (bm) root.add(bm);
}
