// CNVS LAB — the far proxy (HLOD) for the plane / map distance (beyond FAR_M = 420 m): one merged, vertex-coloured
// mesh. Built from the SAME resolved layout boxes the near shell draws (walls, slabs, roofs,
// parapets, decks, stairs, stilts, glass) in the near palette — white walls with the yellow wainscot on the "band" pods,
// the graphite plinth / roof cornice, teal window glass, yellow railings (one thin bar per rail run), steel stilts — so
// nothing changes colour or shape at the switch. The landmark keeps its read: a concave dish bowl (lathe, white face,
// light-grey back, yellow rim, graphite feed quad-pod + horn), the yellow turntable + white yoke, and the mast as four
// tapered galvanised legs with ring + diagonal bracing (a lattice silhouette, not a block). The rocks are not in here:
// rocks.ts's coarse copy draws them beyond ROCK_NEAR with the real stone material.
import * as THREE from "three";
import { MODULES, HELI, DISH, MAST, CONTAINERS, G, labLayout, type Part } from "../../../../../shared/pois/cnvs-lab";

export function buildFarProxy(): THREE.Mesh {
  const P: number[] = [], C: number[] = [], c = new THREE.Color();
  const push = (g: THREE.BufferGeometry, hex: number, m?: THREE.Matrix4) => {
    const n = g.index ? g.toNonIndexed() : g; if (m) n.applyMatrix4(m);
    const p = n.attributes.position as THREE.BufferAttribute; c.setHex(hex);
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); C.push(c.r, c.g, c.b); }
  };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, yaw = 0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2) => {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || z1 - z0 < 0.01) return;
    push(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), hex, new THREE.Matrix4().makeRotationY(yaw).setPosition(cx, (y0 + y1) / 2, cz));
  };
  const part = (p: Part, hex: number, y0 = p.c[1] - p.h[1], y1 = p.c[1] + p.h[1]) => box(-p.h[0], y0, -p.h[2], p.h[0], y1, p.h[2], hex, -(p.yaw ?? 0), p.c[0], p.c[2]);
  const WHITE = 0xf1efe8, GRAPH = 0x2d3136, YEL = 0xffcf2e, STEEL = 0x4a5057, GRATE = 0x6d747b, CONC = 0xcfc9bd, GLASS = 0x58d6ca;
  const L = labLayout();
  const modOf = (p: Part) => MODULES.find((m) => m.id === p.mod);
  for (const p of L.parts) {
    const k = p.kind;
    if (k === "prop" || k === "fence" || k === "post") continue;
    if (Math.max(p.h[0], p.h[1], p.h[2]) < 0.25) continue;            // trims / small bits: sub-pixel at 170 m
    if (k === "wall" || k === "partition") {
      if (k === "partition") continue;
      const m = modOf(p), y0 = p.c[1] - p.h[1], y1 = p.c[1] + p.h[1];
      if (m?.scheme === "band") { const yb = Math.min(y1, m.floor + 1.05); part(p, YEL, y0, yb); part(p, WHITE, yb, y1); }
      else if (m?.scheme === "yellow") part(p, YEL);
      else { const yb = Math.min(y1, (m?.floor ?? y0) + 0.4); part(p, GRAPH, y0, yb); part(p, WHITE, yb, y1); }
      continue;
    }
    if (k === "glass") { part(p, GLASS); continue; }
    if (k === "slab") { part(p, GRAPH); continue; }
    if (k === "roof") {
      // the near roof: a light membrane inside the graphite cornice (0.14 m proud, 0.62 m deep)
      const x0 = p.c[0] - p.h[0], x1 = p.c[0] + p.h[0], z0 = p.c[2] - p.h[2], z1 = p.c[2] + p.h[2], y1 = p.c[1] + p.h[1], e = 0.14;
      part(p, 0xdcd8cf);
      box(x0 - e, y1 - 0.44, z0 - e, x1 + e, y1 + 0.02, z0 + 0.1, GRAPH); box(x0 - e, y1 - 0.44, z1 - 0.1, x1 + e, y1 + 0.02, z1 + e, GRAPH);
      box(x0 - e, y1 - 0.44, z0, x0 + 0.1, y1 + 0.02, z1, GRAPH); box(x1 - 0.1, y1 - 0.44, z0, x1 + e, y1 + 0.02, z1, GRAPH);
      continue;
    }
    if (k === "parapet") { const y1 = p.c[1] + p.h[1]; part(p, GRAPH, p.c[1] - p.h[1], Math.min(y1, p.c[1] - p.h[1] + 0.3)); part(p, YEL, y1 - 0.09, y1); continue; }
    if (k === "stilt") { part(p, STEEL); continue; }
    if (k === "deck" || k === "landing" || k === "step") { part(p, p.mat === "concrete" ? CONC : GRATE); continue; }
    if (k === "stoop") { part(p, CONC); continue; }
    if (k === "heli" || k === "dish") continue;
    part(p, p.mat === "yellow" ? YEL : p.mat === "concrete" ? CONC : p.mat === "skin" ? WHITE : GRATE);
  }
  // railings: a yellow top bar per run (the near draws tubes + posts)
  for (const r of L.rails) {
    const du = r.b[0] - r.a[0], dv = r.b[1] - r.a[1], len = Math.hypot(du, dv);
    if (len < 0.3) continue;
    box(-len / 2, r.y + 0.95, -0.05, len / 2, r.y + 1.05, 0.05, YEL, -Math.atan2(dv, du), (r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2);
  }
  // helipad: the octagon deck + its white ring
  { const R = HELI.a / Math.cos(Math.PI / 8);
    push(new THREE.CylinderGeometry(R, R, HELI.top - G, 8), 0x8e9398, new THREE.Matrix4().makeRotationY(Math.PI / 8).setPosition(HELI.u, (HELI.top + G) / 2, HELI.v));
    // the painted top as the near LOD paints it: dark deck, white ring + yellow ring, the white H in a box, hazard rim
    const top = HELI.top + 0.03, ring = (r0: number, r1: number, hex: number, dy: number, seg = 32) => { const g = new THREE.RingGeometry(r0, r1, seg); g.rotateX(-Math.PI / 2); push(g, hex, new THREE.Matrix4().makeTranslation(HELI.u, top + dy, HELI.v)); };
    { const g = new THREE.CircleGeometry(R, 8); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 8); push(g, 0x7d8287, new THREE.Matrix4().makeTranslation(HELI.u, top - 0.01, HELI.v)); }
    ring(HELI.a * 0.66, HELI.a * 0.78, 0xf4efe2, 0); ring(HELI.a * 0.6, HELI.a * 0.64, 0xf2b630, 0.005); ring(HELI.a * 0.92, R * 1.0, 0xf2b630, 0.004, 8);
    const hb = (u0: number, v0: number, u1: number, v1: number) => box(HELI.u + u0, top, HELI.v + v0, HELI.u + u1, top + 0.02, HELI.v + v1, 0xf4efe2);
    const a = HELI.a * 0.3; hb(-a, -a * 0.75, -a + 0.4, a * 0.75); hb(a - 0.4, -a * 0.75, a, a * 0.75); hb(-a, -0.2, a, 0.2); }
  // the dish: turntable, yoke, concave bowl (white face / grey back), yellow rim, graphite quad-pod + horn
  { const D = DISH, ca = Math.cos(D.az), sa = Math.sin(D.az), ce = Math.cos(D.elev), se = Math.sin(D.elev);
    box(D.u - D.turnR * 0.92, 38.5, D.v - D.turnR * 0.92, D.u + D.turnR * 0.92, D.turnTop, D.v + D.turnR * 0.92, YEL);
    const perp: [number, number] = [-sa, ca];
    for (const s of [-1, 1]) { const pu = D.u + perp[0] * 1.6 * s, pv = D.v + perp[1] * 1.6 * s; box(pu - 0.32, D.turnTop, pv - 0.32, pu + 0.32, D.pivotY + 0.4, pv + 0.32, WHITE); }
    const R = D.R, f = 0.6 * R, axis = new THREE.Vector3(ce * ca, se, ce * sa).normalize();
    const vertex = new THREE.Vector3(D.u, D.pivotY, D.v).addScaledVector(axis, 0.8), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const place = new THREE.Matrix4().compose(vertex, q, new THREE.Vector3(1, 1, 1));
    const prof: THREE.Vector2[] = []; for (let i = 0; i <= 6; i++) { const r = Math.max(0.01, R * (i / 6) ** 0.85); prof.push(new THREE.Vector2(r, r * r / (4 * f))); }
    push(new THREE.LatheGeometry([...prof].reverse(), 20), 0xf4f2ea, place);                                   // concave face
    push(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x, p.y - 0.3 - 0.25 * p.x / R)), 20), 0xc9c6bd, place);   // back skin
    const rim = new THREE.TorusGeometry(R + 0.1, 0.46, 4, 24); rim.rotateX(Math.PI / 2); rim.translate(0, R * R / (4 * f) - 0.25, 0); push(rim, YEL, place);
    const focus = vertex.clone().addScaledVector(axis, f);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, p = new THREE.Vector3(Math.cos(a) * R * 0.92, R * R / (4 * f) * 0.85, Math.sin(a) * R * 0.92).applyMatrix4(place);
      const d = focus.clone().sub(p), len = d.length(), g = new THREE.CylinderGeometry(0.2, 0.2, len, 4);
      push(g, GRAPH, new THREE.Matrix4().compose(p.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
    }
    const horn = new THREE.CylinderGeometry(0.5, 0.95, 2.2, 8); horn.translate(0, f - 0.6, 0); push(horn, WHITE, place);
    const hub = new THREE.CylinderGeometry(1.35, 1.6, 1.5, 8); hub.translate(0, -0.9, 0); push(hub, GRAPH, place);
    box(-0.6, D.pivotY - 0.7, -2.1, 0.6, D.pivotY + 0.7, 2.1, YEL, -D.az, D.u, D.v); }
  // the mast: four tapered galvanised legs + rings + X bracing (a lattice silhouette at 170 m+)
  { const { u, v, half, h } = MAST, top = G + h, GALV = 0x8b9198;
    const leg = (k: number, y: number) => { const t = (y - G) / h, s = half * (1 - 0.66 * t); return new THREE.Vector3(u + (k & 1 ? s : -s), y, v + (k & 2 ? s : -s)); };
    const bar = (a: THREE.Vector3, b: THREE.Vector3, r: number) => { const d = b.clone().sub(a), len = d.length(); push(new THREE.CylinderGeometry(r, r, len, 4), GALV, new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1))); };
    for (let k = 0; k < 4; k++) bar(leg(k, G), leg(k, top), 0.16);
    const o = [0, 1, 3, 2, 0];
    for (let y = G + 3; y < top - 1; y += 3.5) for (let i = 0; i < 4; i++) { bar(leg(o[i], y), leg(o[i + 1], y), 0.08); bar(leg(o[i], y), leg(o[i + 1], Math.min(top, y + 3.5)), 0.06); }
    bar(new THREE.Vector3(u, top, v), new THREE.Vector3(u, top + 4, v), 0.1); }
  // the yard aprons (props.ts buildYard)
  for (const [u0, u1, v0, v1, hex] of [[3, 30.5, -9.5, 10, 0xd9d6ce], [30.5, 53, -11.5, 10, 0xd9d6ce], [5, 27, -29, -9.5, 0xd9d6ce], [36, 53, -33, -18, 0xd9d6ce], [-28, -8.5, -17, -0.5, 0xcfcac0], [-32.5, -22.5, 24, 32.5, 0xcfcac0], [17.5, 34, 10, 23, 0xdcd9d2], [2, 17.5, 10, 11.5, 0xdcd9d2]] as Array<[number, number, number, number, number]>)
    box(u0, G - 0.02, v0, u1, G + 0.07, v1, hex);
  for (const k of CONTAINERS) { const along = Math.abs(Math.cos(k.yaw)) > 0.5; box(k.u - (along ? 3.03 : 1.22), G, k.v - (along ? 1.22 : 3.03), k.u + (along ? 3.03 : 1.22), G + 2.59, k.v + (along ? 1.22 : 3.03), k.color === "yellow" ? 0xffd430 : k.color === "teal" ? 0x2f8f8a : 0xe9e7e0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: "lab:proxy", vertexColors: true, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide }));
  mesh.name = "lab:proxy"; mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  return mesh;
}
