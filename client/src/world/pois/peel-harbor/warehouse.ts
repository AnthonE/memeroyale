// PEEL HARBOR — arched (barrel-vault) corrugated warehouses (sun-bleached yellow or light silver-grey corrugated
// arch roofs on white panel walls with blue trim + blue door frames, big dark door openings, a painted gable end —
// red / blue / white — with a big roller-door opening), enterable: concrete floor with stains, two rows of pallet
// racking loaded with crates + banana pallets, pendant lamps with warm light pools, dusty light shafts through the
// doors, a parked forklift. The interior uses "indoor" copies of the materials whose sky light (IBL) is scaled down,
// so the inside reads dim and warm instead of sky-blue. Layout (+ colliders) from WAREHOUSES / DOORS / RACK / END_DOOR.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { APRON_Y, DOORS, END_DOOR, RACK, WAREHOUSES, WH, archY, doorCentres, hallColumns, hallProps, warehouseLocalPieces, type WarehouseSpec } from "../../../../../shared/pois/peel-harbor";
import { slabXYZ } from "../../../../../shared/pois/harbor-kit";
import { drawPieces, roomMats } from "../_kit/harbor-rooms";
import { Builder, hash, trs, type V3, mergeCasters } from "../_kit/harbor-geo";
import { harborTex, paint, tileMetres, weather, type HarborMats } from "../_kit/harbor-materials";
import { canvas, edgeShade, rng, tex } from "../_kit/harbor-paint";
import { palletInto, propInto } from "./props";
import { stainAtlas } from "./apron";
import type { Part } from "./parts";
import { harborFarProxy } from "./far";

// ------------------------------------------------------------------------------------------------ materials
/** corrugated roof sheet: 25 cm ribs over the arch, sheet laps every 1.2 m, weathering; 4 × 4 m tile */
function roofMaterial(kind: "yellow" | "grey"): THREE.MeshStandardMaterial {
  // (painted in the harbor texture worker — harbor-materials roofTile)
  const g = kind === "yellow" ? "roofY" : "roofG";
  const map = harborTex(`${g}.color`, { aniso: 8 }), normalMap = harborTex(`${g}.normal`, { srgb: false });
  // roof grime: world-space dirt runs down the arch + a grime gradient from the eaves
  const m = weather(new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: kind === "yellow" ? 0.55 : 0.42, metalness: kind === "yellow" ? 0.1 : 0.3, name: `roof-${kind}` }), { vary: 0.16, grime: 0.35, grimeY: APRON_Y + 5.2, grimeH: 2.2, grimeColor: "#7a6a52", streak: 0.3, streakColor: "#6a5238" });
  tileMetres(m, 4);
  // the roof is a single-sided shell: three's default shadow side (the BACK faces) left the sun-facing half of the arch
  // out of the shadow map and the sun poured onto the floor inside — cast from both sides
  m.shadowSide = THREE.DoubleSide;
  return m;
}
const roofCache = new Map<string, THREE.MeshStandardMaterial>();
const roofMat = (k: "yellow" | "grey") => roofCache.get(k) ?? roofCache.set(k, roofMaterial(k)).get(k)!;

/** an "indoor" twin of a material: same maps, sky light (IBL) scaled by `ibl`, optional warm tint */
const indoorCache = new Map<THREE.Material, THREE.Material>();
function indoor(m: THREE.Material, ibl = 0.17, tint = "#fff0dc"): THREE.Material {
  const hit = indoorCache.get(m);
  if (hit) return hit;
  const src = m as THREE.MeshStandardMaterial;
  if (!src.isMeshStandardMaterial) { indoorCache.set(m, m); return m; }
  const c = src.clone();
  c.name = `${src.name}-indoor`;
  c.color = src.color.clone().multiply(new THREE.Color(tint));
  if (src.emissive && src.emissiveIntensity > 0.01) { indoorCache.set(m, src); return src; }
  const prev = src.onBeforeCompile;
  c.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>
      iblIrradiance *= ${ibl.toFixed(3)}; radiance *= ${(ibl * 0.8).toFixed(3)};`);
  };
  const key = src.customProgramCacheKey.bind(src);
  c.customProgramCacheKey = () => key() + `|indoor${ibl}`;
  indoorCache.set(m, c);
  return c;
}

/** warm light pool / light shaft texture (radial + linear gradients, additive) */
let glowCache: THREE.Texture | null = null;
function glowTex(): THREE.Texture {
  if (glowCache) return glowCache;
  const [el, c] = canvas(256, 128);
  const g = c.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, "rgba(255,210,150,0.9)"); g.addColorStop(0.45, "rgba(255,190,120,0.35)"); g.addColorStop(1, "rgba(255,180,110,0)");
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  const s = c.createLinearGradient(0, 0, 0, 128);
  s.addColorStop(0, "rgba(255,240,210,0.5)"); s.addColorStop(1, "rgba(255,240,210,0)");
  c.fillStyle = s; c.fillRect(140, 0, 104, 128);
  const e = c.createLinearGradient(140, 0, 244, 0);
  e.addColorStop(0, "rgba(0,0,0,1)"); e.addColorStop(0.2, "rgba(0,0,0,0)"); e.addColorStop(0.8, "rgba(0,0,0,0)"); e.addColorStop(1, "rgba(0,0,0,1)");
  c.globalCompositeOperation = "destination-out"; c.fillStyle = e; c.fillRect(140, 0, 104, 128);
  glowCache = tex(el, { repeat: false });
  return glowCache;
}

// ------------------------------------------------------------------------------------------------ geometry
/** arched roof surface: outer (outward winding + normals) and inner (inward), UV u = x (m), v = arc length (m) */
function archRoof(w: WarehouseSpec, over: number, eave: number): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry; edge: Array<[number, number]> } {
  const hw = w.width / 2 + eave, hl = w.length / 2 + over;
  const R = ((w.width / 2) ** 2 + w.rise ** 2) / (2 * w.rise), cy = w.wallH + w.rise - R;
  const a0 = Math.asin(Math.min(1, hw / R));
  const n = 28, pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) { const a = -a0 + (2 * a0 * i) / n; pts.push([R * Math.sin(a), cy + R * Math.cos(a)]); }
  const arc: number[] = [0];
  for (let i = 1; i <= n; i++) arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const mk = (off: number, outward: boolean) => {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    const sgn = outward ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
      const n0 = [z0 / R, (y0 - cy) / R], n1 = [z1 / R, (y1 - cy) / R];
      const P = (x: number, z: number, y: number, nn: number[]) => [x, y + nn[1] * off, z + nn[0] * off];
      const A = P(-hl, z0, y0, n0), B = P(hl, z0, y0, n0), C = P(hl, z1, y1, n1), D = P(-hl, z1, y1, n1);
      // (B−A)×(C−A) points INTO the arch for increasing z → the outward face uses the reversed order
      const vs = outward ? [A, C, B, A, D, C] : [A, B, C, A, C, D];
      const ns = outward ? [n0, n1, n0, n0, n1, n1] : [n0, n0, n1, n0, n1, n1];
      const us = outward ? [[-hl, arc[i]], [hl, arc[i + 1]], [hl, arc[i]], [-hl, arc[i]], [-hl, arc[i + 1]], [hl, arc[i + 1]]] : [[-hl, arc[i]], [hl, arc[i]], [hl, arc[i + 1]], [-hl, arc[i]], [hl, arc[i + 1]], [-hl, arc[i + 1]]];
      for (let k = 0; k < 6; k++) { pos.push(...vs[k]); nor.push(0, ns[k][1] * sgn, ns[k][0] * sgn); uv.push(us[k][0], us[k][1]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };
  return { outer: mk(0, true), inner: mk(-0.12, false), edge: pts };
}

/** gable wall above the springing line (local z, y) as a Shape */
function gableShape(w: WarehouseSpec, from: number): THREE.Shape {
  const hw = w.width / 2, n = 24;
  const s = new THREE.Shape();
  s.moveTo(-hw, from); s.lineTo(hw, from);
  // (the arch's end points would dip 2 cm BELOW the base line → a self-touching outline whose triangulation left
  // a hairline gap — the 1-px red line through the white liner in every hall; the ends are skipped and the arch clamped)
  for (let i = 1; i < n; i++) { const z = hw - (2 * hw * i) / n; s.lineTo(z, Math.max(from + 0.01, archY(w, z) - 0.02)); }
  s.closePath();
  return s;
}

async function buildWarehouse(b: Builder, inn: Builder, fx: Builder, m: HarborMats, w: WarehouseSpec, y: () => Promise<void>) {
  const base = trs([w.x, APRON_Y, w.z], w.yaw);
  b.base = base; inn.base = base; fx.base = base;
  const hl = w.length / 2, hw = w.width / 2, t = 0.35;
  const endMat = paint(w.end, { rough: 0.6, name: `wh-end-${w.id}` });
  const trim = m.bluePaint;
  const I = (mm: THREE.Material) => indoor(mm);
  // ---------------- long walls with door openings (exterior) + an interior liner (indoor material)
  const dc = doorCentres(w);
  for (const side of [1, -1]) {
    const lz = side * (hw - t / 2);
    const edges = [-hl, ...dc.flatMap((c) => [c - DOORS.hw, c + DOORS.hw]), hl];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], c = edges[i + 1];
      if (c - a < 0.05) continue;
      b.box(m.wallWhite, [(a + c) / 2, w.wallH / 2, lz + side * 0.02], [c - a, w.wallH, t - 0.04]);
      inn.box(I(m.wallWhite), [(a + c) / 2, w.wallH / 2, lz - side * (t / 2 - 0.01)], [c - a, w.wallH, 0.02]);
      if (c - a > 4) {
        b.box(m.windowDark, [(a + c) / 2, 3.4, lz + side * (t / 2 + 0.01)], [c - a - 2.4, 1.0, 0.04]);
        b.box(m.wallWhite, [(a + c) / 2, 3.95, lz + side * (t / 2 + 0.06)], [c - a - 2.2, 0.1, 0.12]);
        b.box(trim, [(a + c) / 2, 2.85, lz + side * (t / 2 + 0.04)], [c - a - 2.2, 0.1, 0.1]);
        for (let x = a + 1.2; x <= c - 1.1; x += (c - a - 2.4) / Math.max(1, Math.round((c - a - 2.4) / 1.3))) b.box(trim, [x, 3.4, lz + side * (t / 2 + 0.03)], [0.07, 1.05, 0.06]);
      }
    }
    for (const c of dc) {
      b.box(m.wallWhite, [c, (DOORS.h + w.wallH) / 2, lz], [2 * DOORS.hw, w.wallH - DOORS.h, t]);
      for (const e of [-1, 1]) b.box(trim, [c + e * (DOORS.hw + 0.12), DOORS.h / 2, lz + side * (t / 2 + 0.05)], [0.26, DOORS.h, 0.16]);
      b.box(trim, [c, DOORS.h + 0.13, lz + side * (t / 2 + 0.05)], [2 * DOORS.hw + 0.5, 0.26, 0.16]);
      inn.box(I(m.darkPaint), [c, DOORS.h - 0.25, lz - side * 0.35], [2 * DOORS.hw, 0.5, 0.5], { bevel: 0.06 });
      for (const e of [-1, 1]) b.box(m.rubber, [c + e * (DOORS.hw + 0.5), 0.55, lz + side * (t / 2 + 0.15)], [0.35, 0.5, 0.3], { bevel: 0.05 });
      b.box(m.concrete, [c, 0.05, lz + side * 1.0], [2 * DOORS.hw + 0.8, 0.1, 1.6], { bevel: 0.04 });
      // dusty light shaft falling in through the door (additive, faint)
      fx.add(shaftMat(), shaftGeo(2 * DOORS.hw - 0.4, DOORS.h - 0.4, 5.5), trs([c, 0.2, lz - side * 0.2], side > 0 ? Math.PI : 0), false);
    }
    // (the base trim stops at the door openings, not across them as a 0.6 m strip with no collider)
    for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > 0.05) b.box(trim, [(edges[i] + edges[i + 1]) / 2, 0.3, lz + side * (t / 2 + 0.02)], [edges[i + 1] - edges[i], 0.6, 0.06]);
    for (const e of [-1, 1]) b.box(trim, [e * (hl - 0.15), w.wallH / 2, lz + side * 0.05], [0.4, w.wallH, t + 0.14]);
    b.box(m.galv, [0, w.wallH + 0.05, side * (hw + 0.28)], [2 * hl + 1.2, 0.22, 0.26]);
    for (const e of [-1, 1]) b.cyl(m.galv, [e * (hl - 0.6), w.wallH, side * (hw + 0.3)], [e * (hl - 0.6), 0.1, side * (hw + 0.3)], 0.08, 8);
    for (const c of dc) {
      b.box(m.darkPaint, [c, w.wallH - 0.15, lz + side * 0.35], [0.5, 0.3, 0.3]);
      b.box(m.lampLens, [c, w.wallH - 0.31, lz + side * 0.38], [0.4, 0.03, 0.24]);
    }
  }
  await y();
  // ---------------- gable ends: painted arch + white lower wall with a big roller-door opening
  for (const e of [1, -1]) {
    const lx = e * (hl - t / 2);
    const place = new THREE.Matrix4().makeTranslation(lx - t / 2, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    b.add(endMat, new THREE.ExtrudeGeometry(gableShape(w, w.wallH), { depth: t, bevelEnabled: false, curveSegments: 1 }), place);
    inn.add(I(m.wallWhite), new THREE.ExtrudeGeometry(gableShape(w, w.wallH), { depth: 0.02, bevelEnabled: false, curveSegments: 1 }), new THREE.Matrix4().makeTranslation(lx - e * (t / 2 + 0.01) - 0.01, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
    const segs: Array<[number, number, number, number]> = [[-hw, -END_DOOR.hw, 0, w.wallH], [END_DOOR.hw, hw, 0, w.wallH], [-END_DOOR.hw, END_DOOR.hw, END_DOOR.h, w.wallH]];
    for (const [z0, z1, y0, y1] of segs) b.box(m.wallWhite, [lx, (y0 + y1) / 2, (z0 + z1) / 2], [t, y1 - y0, z1 - z0]);
    b.box(trim, [lx + e * (t / 2 + 0.03), w.wallH, 0], [0.08, 0.22, 2 * hw]);
    b.box(trim, [lx + e * (t / 2 + 0.03), 0.3, 0], [0.06, 0.6, 2 * hw]);
    for (const s of [-1, 1]) b.box(trim, [lx + e * (t / 2 + 0.05), END_DOOR.h / 2, s * (END_DOOR.hw + 0.12)], [0.14, END_DOOR.h, 0.24]);
    b.box(trim, [lx + e * (t / 2 + 0.05), END_DOOR.h + 0.12, 0], [0.14, 0.24, 2 * END_DOOR.hw + 0.5]);
    // rolled-up shutter drum over the opening + guide rails
    b.box(m.darkPaint, [lx - e * 0.3, END_DOOR.h - 0.3, 0], [0.55, 0.55, 2 * END_DOOR.hw], { bevel: 0.05 });
    for (const s of [-1, 1]) {
      b.box(m.windowDark, [lx + e * (t / 2 + 0.02), 2.6, s * (hw * 0.62)], [0.04, 1.3, 2.4]);
      b.box(m.wallWhite, [lx + e * (t / 2 + 0.05), 1.9, s * (hw * 0.62)], [0.1, 0.1, 2.6]);
      b.box(trim, [lx + e * (t / 2 + 0.03), 2.6, s * (hw * 0.62)], [0.05, 1.4, 0.08]);
    }
    b.box(m.darkPaint, [lx + e * (t / 2 + 0.02), w.wallH + w.rise * 0.5, 0], [0.05, 1.6, 3.0]);
    for (let k = 0; k < 6; k++) b.box(m.galv, [lx + e * (t / 2 + 0.06), w.wallH + w.rise * 0.5 - 0.65 + k * 0.26, 0], [0.06, 0.06, 2.9]);
    b.box(m.darkPaint, [lx + e * 0.4, END_DOOR.h + 0.7, 2.2], [0.3, 0.25, 0.45]);
  }
  await y();
  // ---------------- roof
  const over = 0.7, eave = 0.45;
  const roof = archRoof(w, over, eave);
  b.add(roofMat(w.roof), roof.outer, undefined, false);
  inn.add(I(roofMat("grey")), roof.inner, undefined, false);
  for (const e of [-1, 1]) b.tube(m.wallWhite, roof.edge.map(([z, y]) => [e * (hl + over), y + 0.05, z] as V3), 0.1, 6, { samples: 40 });
  b.box(m.galv, [0, w.wallH + w.rise + 0.2, 0], [2 * hl - 4, 0.36, 0.8], { bevel: 0.08 });
  for (let x = -hl + 5; x < hl - 4; x += 7) for (const s of [-1, 1]) {
    const z = s * hw * 0.42, y = archY(w, z) + 0.07, slope = Math.atan2(archY(w, z - 0.1) - archY(w, z + 0.1), 0.2);
    // (perf: opaque skylight panels — a blended glass quad per panel broke the tile GPU's hidden-surface removal and
    // cost a sorted transparent draw per shed cluster; from the yard the panels read as dark glazing anyway)
    b.box(m.windowDark, [x, y, z], [3.2, 0.05, 1.6], { rotX: slope });
  }
  // roof ridge lights (little lamps along the ridge)
  for (let x = -hl + 4; x < hl - 2; x += 8) { b.box(m.darkPaint, [x, w.wallH + w.rise + 0.5, 0], [0.3, 0.25, 0.3]); b.box(m.lampLens, [x, w.wallH + w.rise + 0.38, 0], [0.26, 0.03, 0.26]); }
  await y();
  // ---------------- interior (indoor materials): floor, racking, stock, lamps, forklift
  // a painted green-grey epoxy floor with walkway lines, hazard strips along the rack faces and
  // at the rack ends, hatched keep-clear zones inside every door, a dashed forklift lane; steel portal columns under the
  // roof arches; LED strip fixtures over the racks (otherwise the hall reads as 85 % bare concrete)
  const epoxy = I(paint("#86a092", { rough: 0.42, grime: 0.45, name: "hall-epoxy" }));
  inn.box(epoxy, [0, 0.02, 0], [2 * hl - 0.7, 0.04, 2 * hw - 0.7]);
  const ly = 0.043, Yp = I(m.yellowPaint), Hz = I(m.hazard), Wp = I(m.whitePaint);
  const rd = RACK.depth / 2;
  for (const rz of RACK.rowsZ) {
    const face = rz - Math.sign(rz) * (rd + 0.18);
    inn.box(Hz, [0, ly, face], [RACK.length + 0.4, 0.006, 0.26]);
    inn.box(Yp, [0, ly, rz + Math.sign(rz) * (rd + 0.25)], [RACK.length, 0.006, 0.09]);
    for (const e of [-1, 1]) inn.box(Hz, [e * (RACK.length / 2 + 0.6), ly, rz], [0.5, 0.006, RACK.depth + 0.6]);
  }
  for (const z of [-5.6, 5.6]) inn.box(Yp, [0, ly, z], [2 * hl - 9, 0.006, 0.1]);
  for (let x = -hl + 6; x < hl - 6; x += 3) inn.box(Wp, [x, ly, 0], [1.5, 0.006, 0.1]);
  for (const side of [1, -1]) for (const c of doorCentres(w)) {
    inn.box(Yp, [c, ly, side * (hw - 1.2)], [2 * DOORS.hw - 0.2, 0.006, 1.4]);
    for (let k = 0; k < 7; k++) inn.box(I(m.darkPaint), [c - DOORS.hw + 0.7 + k * ((2 * DOORS.hw - 1.2) / 6), ly + 0.002, side * (hw - 1.2)], [0.12, 0.006, 1.5], { rotY: 0.6 });
  }
  // portal columns (I-sections) under the arches, between the doors, clear of the office / bays at the ends
  for (const cx of hallColumns(w)) for (const sz of [-1, 1]) {
    const cz = sz * (hw - 0.35 - 0.13), D = I(m.darkPaint);
    inn.box(D, [cx, w.wallH / 2, cz + sz * 0.11], [0.32, w.wallH, 0.03]);
    inn.box(D, [cx, w.wallH / 2, cz - sz * 0.11], [0.32, w.wallH, 0.03]);
    inn.box(D, [cx, w.wallH / 2, cz], [0.03, w.wallH, 0.22]);
    inn.box(Yp, [cx, 0.6, cz - sz * 0.13], [0.34, 1.2, 0.02]);
    for (let k = 0; k < 4; k++) inn.box(I(m.darkPaint), [cx, 0.2 + k * 0.3, cz - sz * 0.141], [0.34, 0.12, 0.004], { rotZ: 0.6 });
    inn.box(D, [cx, 0.05, cz], [0.5, 0.1, 0.45]);
  }
  // LED strip fixtures over both rack rows
  for (const rz of RACK.rowsZ) for (let x = -RACK.length / 2 + 3; x < RACK.length / 2; x += 6.5) {
    const fy = archY(w, Math.abs(rz)) - 0.9;
    inn.cyl(I(m.cable), [x - 0.9, fy + 0.05, rz], [x - 0.9, archY(w, Math.abs(rz)) - 0.1, rz], 0.012, 4, { caps: false });
    inn.cyl(I(m.cable), [x + 0.9, fy + 0.05, rz], [x + 0.9, archY(w, Math.abs(rz)) - 0.1, rz], 0.012, 4, { caps: false });
    inn.box(I(m.darkPaint), [x, fy, rz], [2.3, 0.09, 0.32], { bevel: 0.02 });
    inn.box(lampHot(), [x, fy - 0.05, rz], [2.1, 0.012, 0.22]);
  }
  const up = I(paint("#2c5aa0", { rough: 0.5, name: "rack-upright" })), beam = I(paint("#e8741c", { rough: 0.5, name: "rack-beam" }));
  const bi = new IndoorBuilder(inn);
  for (const rz of RACK.rowsZ) {
    await y();
    const x0 = -RACK.length / 2, n = Math.round(RACK.length / 2.7);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (RACK.length * i) / n;
      for (const dz of [-RACK.depth / 2, RACK.depth / 2]) inn.box(up, [x, RACK.height / 2, rz + dz], [0.1, RACK.height, 0.1]);
      for (let y = 0.8; y < RACK.height; y += 1.2) inn.beam(up, [x, y, rz - RACK.depth / 2], [x, y + 0.9, rz + RACK.depth / 2], 0.05, 0.04);
    }
    for (let s = 0; s < RACK.shelves; s++) {
      // (parity: the first beam level at 1.2 m — a kong-eye ray never slips between the floor stock and the beam)
      const y = 1.2 + s * 1.6;
      for (const dz of [-RACK.depth / 2, RACK.depth / 2]) inn.box(beam, [0, y, rz + dz], [RACK.length, 0.14, 0.08]);
      // (the rack top is a walkable catwalk at RACK.height — the top shelf stays empty so no stock pokes through)
      if (y + 1.4 > RACK.height) continue;
      for (let i = 0; i < n; i++) {
        const cx = x0 + (RACK.length * (i + 0.5)) / n, hh = hash(w.x, rz, s, i);
        // (every bay is stocked — the rack's collider is a solid block, the stock is what you see stop you)
        for (const dx of [-0.64, 0.64]) palletInto(bi as unknown as Builder, m, [cx + dx, y + 0.08, rz], 0, hash(hh, dx) < 0.55 ? "bananas" : "crates", hash(dx, hh, s));
      }
    }
    // a galvanised anti-collapse mesh down the middle of the row (the solid core you see behind the stock)
    inn.box(I(m.galv), [0, RACK.height / 2, rz], [RACK.length, RACK.height - 0.1, 0.06]);
    for (let i = 0; i < n; i++) for (const dx of [-0.64, 0.64]) { const hh = hash(w.z, rz, i, dx); palletInto(bi as unknown as Builder, m, [x0 + (RACK.length * (i + 0.5)) / n + dx, 0.04, rz], 0, hh < 0.3 ? "bananas" : "crates", hh * 0.6); }
    // galvanised end panels + yellow end-of-aisle protectors at both ends of the row (the collider is a solid block:
    // its end faces are drawn, not an open frame you look into)
    for (const e of [-1, 1]) {
      inn.box(I(m.galv), [e * (RACK.length / 2 + 0.03), RACK.height / 2, rz], [0.03, RACK.height - 0.1, RACK.depth + 0.02]);
      inn.box(I(m.yellowPaint), [e * (RACK.length / 2 + 0.16), 0.45, rz], [0.2, 0.9, RACK.depth + 0.3], { bevel: 0.03 });
      for (const k of [0.2, 0.55]) inn.box(I(m.darkPaint), [e * (RACK.length / 2 + 0.265), k, rz], [0.01, 0.12, RACK.depth + 0.25]);
    }
  }
  await y();
  // the hall's mid-floor cover (shared hallProps = the colliders), drawn with the indoor materials
  for (const hp of hallProps(w)) { propInto(bi as unknown as Builder, m, hp, base); await y(); }
  await y();
  // pendant lamps + warm light pools on the floor + a soft glow cone
  for (let x = -hl + 5; x < hl - 3; x += 8) for (const z of [-4, 4]) {
    const y = archY(w, z) - 1.8;
    inn.cyl(I(m.cable), [x, y + 0.4, z], [x, archY(w, z) - 0.1, z], 0.02, 4, { caps: false });
    inn.lathe(I(m.darkPaint), [[0.05, 0.4], [0.2, 0.3], [0.45, 0], [0.46, -0.05]], 12, new THREE.Matrix4().makeTranslation(x, y, z));
    inn.box(lampHot(), [x, y - 0.06, z], [0.6, 0.02, 0.6]);
    fx.add(poolMat(), new THREE.PlaneGeometry(6.5, 6.5).rotateX(-Math.PI / 2), trs([x, 0.06, z]), false);
  }
  // floor stains + dirt drifts along the walls (decals from the apron stain atlas)
  const r = rng(Math.round(w.x * 7 + w.z));
  for (let k = 0; k < 16; k++) {
    const x = (r() - 0.5) * (2 * hl - 4), z = (r() - 0.5) * (2 * hw - 4), s = 1.5 + r() * 3.5, cell = [0, 1, 3, 5, 6][Math.floor(r() * 5)];
    fx.add(stainMat(), stainQuad(s, cell), trs([x, 0.045, z], r() * 6.28), false);
  }
  await y();
  // the site office + mezzanine + rack-top bridge / catwalk + the fire escape — the SAME pieces the colliders use
  // (shared warehouseLocalPieces); inside pieces in the indoor paint set, the fire escape (outside the +z wall) outdoors
  {
    const pcs = warehouseLocalPieces(w), out = pcs.filter((p) => p.c[2] - p.h[2] > hw - 0.01), inside = pcs.filter((p) => !(p.c[2] - p.h[2] > hw - 0.01));
    drawPieces(inn, inside, roomMats(m, { indoor: true, ibl: 0.22 }), fx);
    drawPieces(b, out, roomMats(m));
    // rack tops are walkable catwalks: grating decks with toe boards over both rows
    const rm = roomMats(m, { indoor: true, ibl: 0.22 });
    for (const rz of RACK.rowsZ) drawPieces(inn, [slabXYZ(-RACK.length / 2, RACK.length / 2, RACK.height - 0.1, RACK.height, rz - RACK.depth / 2, rz + RACK.depth / 2, "grate", { kind: "landing" })], rm);
    // office ceiling light + a wall AC unit + a notice board on the office front
    const X0 = -hl + 0.35;
    drawPieces(inn, [slabXYZ(X0 + 1.6, X0 + 2.8, 0, WH.deckY - 0.3, -7.3, -6.7, "wallIn", { solid: false, kind: "lamp" })], rm, fx);
    inn.box(I(m.galv), [X0 + WH.officeD + 0.05, 3.9, -8.9], [0.3, 0.6, 0.9], { bevel: 0.03 });
    inn.box(I(m.darkPaint), [X0 + 1.6, 3.3, -3.35], [1.4, 0.9, 0.04]);
  }
  await y();
  // roof purlins inside (steel arches every 6 m)
  for (let x = -hl + 3; x < hl; x += 6) {
    const pts: V3[] = [];
    for (let i = 0; i <= 16; i++) { const z = -hw + (2 * hw * i) / 16; pts.push([x, archY(w, z) - 0.3, z * 0.985]); }
    inn.rail(I(m.darkPaint), pts, 0.12, 6);
  }
  b.base = null; inn.base = null; fx.base = null;
}

/** forwards Builder calls with every material swapped for its indoor twin (for the shared prop helpers) */
class IndoorBuilder {
  constructor(private b: Builder) {}
  get base() { return this.b.base; }
  set base(v) { this.b.base = v; }
  add(mat: THREE.Material, g: THREE.BufferGeometry, m?: THREE.Matrix4, uv = true, s = 1) { this.b.add(indoor(mat), g, m, uv, s); return this; }
  addRaw(mat: THREE.Material, g: THREE.BufferGeometry, m?: THREE.Matrix4) { this.b.addRaw(indoor(mat), g, m); return this; }
  box(mat: THREE.Material, p: V3, s: V3, o?: Parameters<Builder["box"]>[3]) { this.b.box(indoor(mat), p, s, o); return this; }
  beam(mat: THREE.Material, a: V3, c: V3, w: number, d: number, o?: Parameters<Builder["beam"]>[5]) { this.b.beam(indoor(mat), a, c, w, d, o); return this; }
  cyl(mat: THREE.Material, a: V3, c: V3, r: number, seg?: number, o?: Parameters<Builder["cyl"]>[5]) { this.b.cyl(indoor(mat), a, c, r, seg, o); return this; }
  tube(mat: THREE.Material, pts: V3[], r: number, seg?: number, o?: Parameters<Builder["tube"]>[4]) { this.b.tube(indoor(mat), pts, r, seg, o); return this; }
  rail(mat: THREE.Material, pts: V3[], r: number, seg?: number) { this.b.rail(indoor(mat), pts, r, seg); return this; }
  lathe(mat: THREE.Material, p: Array<[number, number]>, seg: number, m: THREE.Matrix4, a?: number, l?: number) { this.b.lathe(indoor(mat), p, seg, m, a, l); return this; }
  extrude(mat: THREE.Material, s: THREE.Shape, d: number, m: THREE.Matrix4, bv?: number) { this.b.extrude(indoor(mat), s, d, m, bv); return this; }
}

let hot: THREE.MeshStandardMaterial | null = null;
const lampHot = () => (hot ??= new THREE.MeshStandardMaterial({ color: "#fff3dc", emissive: new THREE.Color("#ffd9a0"), emissiveIntensity: 2.2, roughness: 0.3, name: "wh-lamp-hot" }));
let pool: THREE.MeshBasicMaterial | null = null;
function poolMat() {
  if (pool) return pool;
  const t = glowTex().clone(); t.repeat.set(0.5, 1); t.offset.set(0, 0); t.needsUpdate = true;
  pool = new THREE.MeshBasicMaterial({ map: t, color: "#ffcf96", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, name: "wh-light-pool" });
  return pool;
}
let shaft: THREE.MeshBasicMaterial | null = null;
function shaftMat() {
  if (shaft) return shaft;
  const t = glowTex().clone(); t.repeat.set(104 / 256, 1); t.offset.set(140 / 256, 0); t.needsUpdate = true;
  shaft = new THREE.MeshBasicMaterial({ map: t, color: "#fff0cc", transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, name: "wh-light-shaft" });
  return shaft;
}
/** a slanted sheet from the door head sloping down into the building (u across the door, v from the head down) */
function shaftGeo(w: number, h: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = [-w / 2, h, 0, w / 2, h, 0, w / 2, 0, depth, -w / 2, h, 0, w / 2, 0, depth, -w / 2, 0, depth];
  const uv = [0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0];
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
let stain: THREE.MeshStandardMaterial | null = null;
const stainMat = () => (stain ??= new THREE.MeshStandardMaterial({ color: "#2d2720", map: stainAtlas(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: "wh-floor-stains" }));
function stainQuad(s: number, cell: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute, u0 = (cell % 4) / 4, v0 = 1 - (Math.floor(cell / 4) + 1) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.25, v0 + uv.getY(i) * 0.5);
  return g;
}

// ------------------------------------------------------------------------------------------------ door cards
/** what you see through a door from the yard (beyond the interiors' 25 m draw distance): a dim painted interior —
 *  racking with stock, crate stacks, a warm lamp pool on the floor — on one quad a metre inside every opening
 *  (one draw per shed cluster) */
let doorTex: THREE.Texture | null = null;
function doorCardTex(): THREE.Texture {
  if (doorTex) return doorTex;
  const W = 512, H = 512, [el, c] = canvas(W, H);
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#15120e"); g.addColorStop(0.62, "#231d16"); g.addColorStop(1, "#3a3025");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // back wall + floor line in perspective, lamp pools
  c.fillStyle = "#2b251e"; c.fillRect(0, H * 0.18, W, H * 0.5);
  const pool = (x: number, y: number, r: number) => { const q = c.createRadialGradient(x, y, 4, x, y, r); q.addColorStop(0, "rgba(255,196,120,0.55)"); q.addColorStop(1, "rgba(255,180,100,0)"); c.fillStyle = q; c.beginPath(); c.ellipse(x, y, r * 1.6, r * 0.45, 0, 0, Math.PI * 2); c.fill(); };
  pool(W * 0.3, H * 0.86, 120); pool(W * 0.75, H * 0.8, 90);
  // pallet racking at the back: blue uprights, orange beams, boxes + banana crates on the shelves
  const R = rng(9191);
  for (let x = 20; x < W; x += 118) { c.fillStyle = "#2a4f86"; c.fillRect(x, H * 0.2, 9, H * 0.48); }
  for (const y of [0.34, 0.5, 0.66]) {
    c.fillStyle = "#b85a18"; c.fillRect(0, H * y, W, 7);
    for (let x = 30; x < W - 40; x += 58) { if (R() < 0.2) continue; const w = 40 + R() * 12, h = 30 + R() * 22; c.fillStyle = R() < 0.4 ? "#8a6a3a" : R() < 0.7 ? "#a88a4a" : "#c9a12a"; c.fillRect(x, H * y - h, w, h); c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(x, H * y - h, w, 3); }
  }
  // two crate stacks in front (lit edges), a pallet jack
  const crate = (x: number, y: number, w: number, h: number) => { c.fillStyle = "#6a4a2a"; c.fillRect(x, y - h, w, h); c.strokeStyle = "rgba(255,200,140,0.5)"; c.lineWidth = 3; c.strokeRect(x + 2, y - h + 2, w - 4, h - 4); c.beginPath(); c.moveTo(x + 4, y - 4); c.lineTo(x + w - 4, y - h + 4); c.stroke(); };
  crate(40, H - 30, 96, 88); crate(52, H - 118, 80, 76); crate(330, H - 40, 110, 96); crate(450, H - 36, 70, 70);
  c.fillStyle = "#c9a12a"; c.fillRect(220, H - 60, 70, 12); c.fillStyle = "#222"; c.fillRect(225, H - 48, 60, 10);
  // dust in the light from the door
  const sh = c.createLinearGradient(0, H, 0, H * 0.4); sh.addColorStop(0, "rgba(255,236,200,0.14)"); sh.addColorStop(1, "rgba(255,236,200,0)");
  c.fillStyle = sh; c.fillRect(0, H * 0.4, W, H * 0.6);
  doorTex = tex(el, { repeat: false, aniso: 4 });
  return doorTex;
}
let doorMat: THREE.MeshBasicMaterial | null = null;
const doorCardMat = () => (doorMat ??= new THREE.MeshBasicMaterial({ map: doorCardTex(), name: "wh-door-card" }));
function doorCards(specs: WarehouseSpec[]): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  for (const w of specs) {
    const base = trs([w.x, APRON_Y, w.z], w.yaw), hw = w.width / 2, hl = w.length / 2, t = 0.35;
    for (const side of [1, -1]) for (const dc of doorCentres(w)) {
      const g = new THREE.PlaneGeometry(2 * DOORS.hw + 0.2, DOORS.h + 0.1).translate(0, (DOORS.h + 0.1) / 2, 0);
      if (side < 0) g.rotateY(Math.PI);
      g.translate(dc, 0, side * (hw - t - 1.2)); g.applyMatrix4(base); geos.push(g);
    }
    for (const e of [1, -1]) {
      const g = new THREE.PlaneGeometry(2 * END_DOOR.hw + 0.2, END_DOOR.h + 0.1).translate(0, (END_DOOR.h + 0.1) / 2, 0);
      g.rotateY(e > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(e * (hl - t - 1.2), 0, 0); g.applyMatrix4(base); geos.push(g);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), doorCardMat());
  mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.castShadow = false; mesh.userData.farShadow = false;
  return mesh;
}

/** shed clusters: each is ONE merged shell group (shared materials → ~14 draws) paired with its own HLOD proxy, so a
 *  cluster switches on its own distance (the near sheds by the pier vs the west sheds 250 m inland) */
const CLUSTERS: string[][] = [["wy", "wr", "wg"], ["wc", "wb", "wd"]];

export const part: Part = {
  id: "warehouse",
  async build({ ctx, mats, group, lod, c1 }) {
    for (const [ci, ids] of CLUSTERS.entries()) {
      const specs = WAREHOUSES.filter((w) => ids.includes(w.id));
      if (!specs.length) continue;
      const shells = new Builder(true);
      for (const w of specs) {
        const inn = new Builder(true), fx = new Builder(true);
        await buildWarehouse(shells, inn, fx, mats, w, () => ctx.yield());
        await ctx.yield();
        const interior = await inn.buildAsync(`warehouse-${w.id}-interior`, { cast: false }, () => ctx.yield());
        const glow = await fx.buildAsync(`warehouse-${w.id}-fx`, { cast: false, receive: false }, () => ctx.yield());
        glow.children.forEach((c) => { c.renderOrder = 2; });
        group.add(interior, glow);
        // (45 m: at 25 m the racks, crates and lights grew in through the 5 m doors as you walked up to a shed;
        // at 45 m the card ↔ hall switch is half the size on screen)
        lod.add(interior, { show: 45 });
        lod.add(glow, { show: 45 });
        // door cards: the painted interior seen through the doors beyond the interior's 45 m (same metric: its box)
        const cards = doorCards([w]); cards.name = `warehouse-${w.id}-doorcards`;
        group.add(cards);
        // (no far edge — with one, the cards faded in at 230 m on every fly-in (140 px at
        // 247 m), as the shells they sit in are resident; one mesh per shed, the engine's screen-size cull takes
        // them when they are a few px)
        lod.add(cards, { hideWithin: 45, ref: interior });
        await ctx.yield();
      }
      // (perf: the painted end walls + window strips merge into the weathered palette too — 10 → 6 draws a cluster)
      const sh = await shells.buildAsync(`warehouses-${ci}`, { palette: (m) => /^(darkPaint|steel|galv|rubber|cable|lampLens|bluePaint|windowDark|concrete|wh-end-.*)$/.test(m.name) }, () => ctx.yield());
      sh.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && (me.material as THREE.Material).transparent) { me.castShadow = false; me.userData.castShadow = false; } });
      group.add(sh);
      const far = harborFarProxy({ sheds: specs, name: `warehouses-${ci}-far` });
      group.add(far);
      // perf: detailed shell casters → cascade 0 only; the proxy's silhouette casts into cascade 1 (harbor-c1)
      far.userData.c1Shadow = false; c1.push(far);
      mergeCasters(sh, { farShadow: false, c1: false });
      // (no 230 m cut to the proxy — roof-yellow + its caster cut in at 376 m on the fly-in. The
      // shell cluster is RESIDENT; the proxy stays the cascade-1 / far-map caster only)
      lod.pair(sh, far, 230);
      await ctx.yield();
    }
    void edgeShade;
  },
};
