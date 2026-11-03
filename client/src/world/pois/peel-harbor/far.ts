// PEEL HARBOR — HLOD: the far stand-ins drawn instead of the detailed parts when the camera is far from them (the
// detail alone: from the beach 200–400 m away the harbor issued ~70 draws of fenders, ladders, lamps, sheds…).
// Vertex-coloured merged stand-ins (1 draw each): warehouse shells (8-segment arch roof in its roof colour, white walls,
// the coloured gable), fuel tanks (16-sided white cylinders + cones), lamp posts + light towers (thin boxes + heads).
// ONE proxy per detail group (a shed cluster, the tank farm, the lamps), registered with `lod.pair(detail, proxy,
// FAR_SWITCH)`: both sides measure the camera distance to the DETAIL group's bounding box, so exactly one of the two is
// drawn at every camera position (a single proxy for everything measured to its own apron-wide box left a hole — at the glider
// approach the sheds were beyond 180 m AND the proxy within 180 m: both hidden, black shadow footprints).
import * as THREE from "three";
import { APRON_Y, DOORS, PROPS, TANKS, archY, doorCentres, whToWorld, type WarehouseSpec } from "../../../../../shared/pois/peel-harbor";

/** metres from the camera to a detail group's bounding box beyond which the HLOD takes over */
export const FAR_SWITCH = 180;

/** o.sheds: the warehouses to include (default none), o.tanks / o.lamps: include the tank farm / the lamp masts */
export function harborFarProxy(o: { sheds?: readonly WarehouseSpec[]; tanks?: boolean; lamps?: boolean; name?: string } = {}): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  const tri = (a: number[], b: number[], d: number[], hex: string, k = 1) => { c.set(hex).multiplyScalar(k); pos.push(...a, ...b, ...d); for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b); };
  const quad = (a: number[], b: number[], d: number[], e: number[], hex: string, k = 1) => { tri(a, b, d, hex, k); tri(a, d, e, hex, k); };
  // warehouses: 4 walls, arched roof (8 segments), gable ends in the end colour
  for (const w of o.sheds ?? []) {
    const hl = w.length / 2, hw = w.width / 2, y0 = APRON_Y, roof = w.roof === "yellow" ? "#d6a126" : "#8e969c";
    const P = (lx: number, lz: number, y: number) => { const [x, z] = whToWorld(w, lx, lz); return [x, y, z]; };
    for (const s of [1, -1]) {
      quad(P(-hl * s, s * hw, y0), P(hl * s, s * hw, y0), P(hl * s, s * hw, y0 + w.wallH), P(-hl * s, s * hw, y0 + w.wallH), "#cfcbc2", 0.9);
      // the dark door openings with their blue frames + the blue base band
      for (const dc of doorCentres(w)) {
        const a = dc - DOORS.hw * s, b = dc + DOORS.hw * s, o = s * (hw + 0.06);
        quad(P(a - 0.25 * s, o, y0), P(b + 0.25 * s, o, y0), P(b + 0.25 * s, o, y0 + DOORS.h + 0.25), P(a - 0.25 * s, o, y0 + DOORS.h + 0.25), "#2f67b5", 0.9);
        quad(P(a, o + s * 0.02, y0), P(b, o + s * 0.02, y0), P(b, o + s * 0.02, y0 + DOORS.h), P(a, o + s * 0.02, y0 + DOORS.h), "#26221e", 1);
      }
      quad(P(-hl * s, s * (hw + 0.04), y0), P(hl * s, s * (hw + 0.04), y0), P(hl * s, s * (hw + 0.04), y0 + 0.5), P(-hl * s, s * (hw + 0.04), y0 + 0.5), "#2f67b5", 0.85);
    }
    // (12 segments, crown-to-eave shading, the two skylight bands dark — from the plane plainer proxies read as flat
    // grey boxes)
    const n = 12, zs = [...Array(n + 1)].map((_, i) => -hw + (2 * hw * i) / n);
    for (let i = 0; i < n; i++) {
      const za = zs[i], zb = zs[i + 1], ya = y0 + archY(w, za), yb = y0 + archY(w, zb), zm = Math.abs((za + zb) / 2) / hw;
      const sky = Math.abs(zm - 0.42) < 0.07, k = sky ? 0.42 : 0.6 + 0.45 * Math.cos(zm * 1.35);
      quad(P(-hl - 0.3, za, ya), P(-hl - 0.3, zb, yb), P(hl + 0.3, zb, yb), P(hl + 0.3, za, ya), sky ? "#3b4750" : roof, k);
      for (const e of [1, -1]) {
        const x = e * hl;
        tri(P(x, za, y0), P(x, zb, y0), P(x, zb, yb), w.end, 0.95);
        tri(P(x, za, y0), P(x, zb, yb), P(x, za, ya), w.end, 0.95);
      }
    }
  }
  // tanks: 16-sided white cylinders + low cones
  for (const t of o.tanks ? TANKS : []) {
    const n = 16, y0 = APRON_Y, y1 = APRON_Y + t.h;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, k = 0.8 + 0.2 * Math.cos(a0 - 0.8);
      const p = (a: number, y: number, r = t.r) => [t.x + Math.cos(a) * r, y, t.z + Math.sin(a) * r];
      quad(p(a0, y0), p(a0, y1), p(a1, y1), p(a1, y0), "#f1efe8", k);
      tri(p(a0, y1), [t.x, y1 + 1.3, t.z], p(a1, y1), "#f4f2ec", 1);
    }
  }
  // lamps + light towers: a thin 4-sided pole + a head block
  for (const p of o.lamps ? PROPS : []) {
    if (p.kind !== "lamp" && p.kind !== "light-tower") continue;
    const H = p.kind === "lamp" ? 10.5 : 23.5, r = p.kind === "lamp" ? 0.14 : 0.3, hw = p.kind === "lamp" ? 1.4 : 1.3, y0 = APRON_Y;
    const box = (x0: number, x1: number, ya: number, yb: number, z0: number, z1: number, hex: string) => {
      quad([x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1], hex, 0.9); quad([x1, ya, z0], [x0, ya, z0], [x0, yb, z0], [x1, yb, z0], hex, 0.8);
      quad([x1, ya, z1], [x1, ya, z0], [x1, yb, z0], [x1, yb, z1], hex, 0.85); quad([x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0], hex, 0.85);
      quad([x0, yb, z1], [x1, yb, z1], [x1, yb, z0], [x0, yb, z0], hex, 1);
    };
    box(p.x - r, p.x + r, y0, y0 + H, p.z - r, p.z + r, "#a9aeb1");
    box(p.x - hw, p.x + hw, y0 + H - 0.2, y0 + H + 0.4, p.z - (p.kind === "lamp" ? 0.25 : hw), p.z + (p.kind === "lamp" ? 0.25 : hw), "#3a3e42");
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide, name: "harbor-far-proxy" }));
  // it is also the static far shadow map's caster for the sheds / tanks / masts (the bake force-shows it), so the far
  // map has them whatever the camera distance at load (the detail groups may be LOD-hidden then)
  m.name = o.name ?? "harbor-far"; m.castShadow = true; m.receiveShadow = true; m.userData.castShadow = true; m.userData.farShadow = "force";
  return m;
}
