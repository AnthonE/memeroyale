// BANANA TEMPLE — the plaza: 2K stylized flagstone paving (bevelled flags, moss + grass in the joints), a FLUSH medallion
// of concentric carved slabs, kerb ring, planter walls, carved pedestals, crates of bananas, a banded barrel, a rope-wrapped
// post with a rope coil, the boulder, ruined perimeter walls, scattered stones (all with colliders: shared TEMPLE +
// templeScatter). Plants come from the veg area (index.ts) — no flat fern cards.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { TEMPLE, mulberry, templeScatter, templeRuinSegs } from "../../../../../shared/pois/jungle-layout";
import { block, merge, staticMesh, rock, rope, lashing, crateMesh, place, boxUVs, tint, drum, type Geo } from "../_kit/jungle-geo";
import { stoneMaterial, pbr, canvasTex, mulberry as mulb } from "../_kit/jungle-mat";
import { bananaHand, bananaMaterial } from "../_kit/jungle-gold";
import type { TempleMats } from "./temple";

export function buildPlaza(ctx: WorldCtx, mats: TempleMats, root: THREE.Group) {
  const T = TEMPLE, rnd = mulberry(1212), stone: Geo[] = [], paving: Geo[] = [], med: Geo[] = [], woodG: Geo[] = [], ropes: Geo[] = [], bananas: Geo[] = [], rocks: Geo[] = [];
  const moss = pbr(ctx, "moss");
  // irregular Voronoi grey-beige flagstones (2K PBR), moss + grass in the joints, 8 m tile
  const flag = stoneMaterial(pbr(ctx, "flagstone"), { scale: 8, moss: 0.3, mossCover: 0.3, mossColor: "#7fc23a", vertexColors: true, variation: 0.3, normalScale: 1.1, color: "#ffffff", lift: 0.14, liftTop: "#aebfd8", liftBottom: "#a7b08e", roughness: 0.95, detail: 0.7 }, moss);
  const boulderMat = stoneMaterial(pbr(ctx, "boulder"), { scale: 2.6, triplanar: true, moss: 0.7, mossColor: "#79b83a", vertexColors: true, variation: 0.3 }, moss);

  // paving disc (flags run in rows across the plaza, parallel to the façade)
  const disc = new THREE.CircleGeometry(T.plazaR, 96); disc.rotateX(-Math.PI / 2); place(disc, 0, 0.12, 0); boxUVs(disc, 1); tint(disc, "#ffffff"); paving.push(disc);
  // medallion: FLUSH concentric rings of carved curved slabs (only 1–3 cm proud), a darker grout ring between rings
  const M = T.medallion;
  for (let i = 0; i < 5; i++) {
    const r0 = M.r * (1 - i * 0.19), r1 = r0 - M.r * 0.15, n = Math.max(6, Math.round((r0 + r1) * Math.PI / 1.1));
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + 0.012, a1 = ((k + 1) / n) * Math.PI * 2 - 0.012;
      const sh = new THREE.Shape(); sh.absarc(0, 0, r0, a0, a1, false); sh.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1); sh.absarc(0, 0, r1, a1, a0, true); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1, curveSegments: 2 });
      g.rotateX(-Math.PI / 2); g.translate(M.x, 0.13, M.z); boxUVs(g, 1); tint(g, i % 2 ? "#d9cfb9" : "#ece3cf", 0.06); med.push(g);
    }
  }
  { const hub = new THREE.CylinderGeometry(M.r * 0.12, M.r * 0.12, 0.08, 24); hub.translate(M.x, 0.16, M.z); boxUVs(hub, 1.4); tint(hub, "#e2d8c2"); med.push(hub); }
  // kerb ring
  { const n = Math.round(T.plazaR * 4); for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; if (rnd() < 0.06) continue; stone.push(block(T.plazaR * 6.28 / n * 0.9, 0.36, 0.8, Math.cos(a) * (T.plazaR + 0.4), 0.18, Math.sin(a) * (T.plazaR + 0.4), -a - Math.PI / 2, { bevel: 0.05, uvScale: 4.2, tint: "#ddd5c0", var: 0.06 })); } }

  // planters: chunky bevelled blocks (2 courses, staggered), dark soil inside, a mossy boulder in the left one
  for (const p of T.planters) {
    const segs: Array<[number, number, number, number]> = [[p.x0, p.z0, p.x1, p.z0], [p.x1, p.z0, p.x1, p.z1], [p.x1, p.z1, p.x0, p.z1], [p.x0, p.z1, p.x0, p.z0]];
    // walls INSIDE the collider footprint (outer face = the box face, parity), corners overlap; soil flush with the box top
    const cxp = (p.x0 + p.x1) / 2, czp = (p.z0 + p.z1) / 2, inset = (x: number, z: number): [number, number] => [x + Math.sign(cxp - x) * 0.47 * (Math.abs(x - p.x0) < 0.01 || Math.abs(x - p.x1) < 0.01 ? 1 : 0), z + Math.sign(czp - z) * 0.47 * (Math.abs(z - p.z0) < 0.01 || Math.abs(z - p.z1) < 0.01 ? 1 : 0)];
    for (const [ax0, az0, ax1, az1] of segs) {
      const [x0, z0] = inset(ax0, az0), [x1, z1] = inset(ax1, az1);
      const len = Math.hypot(x1 - x0, z1 - z0) + 0.94, n = Math.max(2, Math.round(len / 1.6)), yaw = Math.atan2(-(z1 - z0), x1 - x0), ux = (x1 - x0) / (len - 0.94), uz = (z1 - z0) / (len - 0.94);
      for (let c = 0; c < 2; c++) { const m = n + c; for (let i = 0; i < m; i++) { const t = (i + 0.5) / m; const u = -0.47 + t * len; stone.push(block(len / m * 0.97, 0.58, 0.94, x0 + ux * u, 0.29 + c * 0.6, z0 + uz * u, yaw + (rnd() - 0.5) * 0.02, { bevel: 0.1, uvScale: 4.2, tint: rnd() < 0.5 ? "#e6dfd0" : "#d5cdb8", var: 0.06 })); } }
    }
    const soil = place(new THREE.PlaneGeometry(p.x1 - p.x0 - 1.6, p.z1 - p.z0 - 1.6, 8, 6), (p.x0 + p.x1) / 2, p.h - 0.05, (p.z0 + p.z1) / 2, 0, 1, -Math.PI / 2);
    { const sp = soil.attributes.position as THREE.BufferAttribute; for (let i = 0; i < sp.count; i++) sp.setY(i, sp.getY(i) + Math.sin(sp.getX(i) * 2.1) * Math.cos(sp.getZ(i) * 1.7) * 0.03); }
    boxUVs(soil, 2); tint(soil, "#3a2a18"); rocks.push(soil);
  }
  rocks.push(rock(1.7, 1.2, 1.4, { seed: 4, tint: "#9a948a" }).applyMatrix4(new THREE.Matrix4().makeTranslation(T.boulder[0], T.boulder[1], T.boulder[2])));

  // pedestals: base + carved shaft (glyph panel) + cap
  const frz: Geo[] = [];
  for (const [x, z] of T.pedestals) {
    stone.push(block(1.6, 0.3, 1.6, x, 0.27, z, 0, { bevel: 0.05, uvScale: 4.2, tint: "#d5cdb8" }), block(1.25, 1.05, 1.25, x, 0.95, z, 0, { bevel: 0.08, uvScale: 4.2, tint: "#e2dccc" }), block(1.6, 0.3, 1.6, x, 1.62, z, 0, { bevel: 0.06, uvScale: 4.2, tint: "#d5cdb8" }));
    const g = block(0.9, 0.7, 0.06, x, 0.98, z + 0.64, 0, { bevel: 0.02, uvScale: 1 }); boxUVs(g, 1.2); frz.push(g);
  }
  // ruined perimeter walls: straight segments of different heights (shared templeRuinSegs = the colliders), staggered
  // courses filling each segment exactly (a short first block on odd courses, never a gap), a dark rubble core
  for (const [x, z, len, h, yaw] of templeRuinSegs()) {
    const courses = Math.round(h / 0.62), ch = h / courses, ux = Math.cos(yaw), uz = -Math.sin(yaw);
    stone.push(block(len - 0.1, h - 0.04, 0.9, x, (h - 0.04) / 2, z, yaw, { bevel: 0.02, uvScale: 4.2, tint: "#8f877a", var: 0.05 }));
    for (let c = 0; c < courses; c++) {
      let u = -len / 2; const first = c % 2 ? 0.4 + rnd() * 0.35 : 0;
      while (u < len / 2 - 0.05) {
        const bl = Math.min(len / 2 - u, first && u === -len / 2 ? first : 1.0 + rnd() * 0.5), top = c === courses - 1, bh = ch - (top ? rnd() * 0.08 : 0), mid = u + bl / 2;
        stone.push(block(bl - 0.025, bh - 0.012, 1.2 - (rnd() < 0.25 ? 0.06 : 0), x + ux * mid, c * ch + bh / 2, z + uz * mid, yaw + (rnd() - 0.5) * 0.02, { bevel: 0.07, uvScale: 4.2, tint: rnd() < 0.5 ? "#dcd4c0" : "#c9c2ae", var: 0.08 }));
        u += bl;
      }
    }
  }
  // scattered stones + tumbled blocks between the plaza and the jungle edge (collide: templeScatter)
  for (const s of templeScatter()) {
    if (s.kind === "rock") rocks.push(rock(s.w, s.h, s.d, { seed: s.seed, tint: "#a29c90" }).applyMatrix4(new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.x, s.y, s.z)));
    else stone.push(block(s.w, s.h, s.d, s.x, s.y + Math.abs(s.tilt) * s.w * 0.25, s.z, s.yaw, { bevel: s.seed ? 0.12 : 0.07, uvScale: 4.2, tint: s.seed ? (rnd() < 0.5 ? "#c4bca8" : "#d2cab5") : "#cfc8b4", rz: s.tilt }));
  }

  // the plaza altar (carved block + cap + a stone offering bowl with a glyph panel), tumbled blocks, rain puddles
  { const [ax, az, ay] = T.altarStone, c = Math.cos(ay), sn = Math.sin(ay);
    stone.push(block(1.5, 0.22, 1.1, ax, 0.23, az, ay, { bevel: 0.05, uvScale: 4.2, tint: "#d5cdb8" }), block(1.2, 0.8, 0.85, ax, 0.74, az, ay, { bevel: 0.07, uvScale: 4.2, tint: "#e2dccc" }), block(1.5, 0.2, 1.1, ax, 1.24, az, ay, { bevel: 0.05, uvScale: 4.2, tint: "#d5cdb8" }));
    const bowl = new THREE.LatheGeometry([new THREE.Vector2(0.05, 0), new THREE.Vector2(0.32, 0.02), new THREE.Vector2(0.4, 0.16), new THREE.Vector2(0.36, 0.18), new THREE.Vector2(0.28, 0.08)], 16); bowl.translate(ax, 1.34, az); boxUVs(bowl, 1); tint(bowl, "#cfc7b2"); stone.push(bowl);
    const g = block(0.9, 0.5, 0.06, ax + sn * 0.44, 0.75, az + c * 0.44, ay, { bevel: 0.02, uvScale: 1 }); boxUVs(g, 1.2); frz.push(g); }
  // the portal apron's low carved planters (cover either side of the long lane): blocks + glyph face + soil
  for (const [x, z, w, d, yaw] of T.apron) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    stone.push(block(w, 1.2, d, x, 0.6, z, yaw, { bevel: 0.1, uvScale: 4.2, tint: "#ddd4bf", var: 0.06 }), block(w + 0.14, 0.16, d + 0.14, x, 1.12, z, yaw, { bevel: 0.05, uvScale: 4.2, tint: "#e8dfcb" }));
    for (const f of [1, -1]) { const g = block(w * 0.8, 0.6, 0.05, x + sn * f * (d / 2 + 0.02), 0.58, z + c * f * (d / 2 + 0.02), yaw, { bevel: 0.015, uvScale: 1 }); boxUVs(g, 1.2); frz.push(g); }
    const soil = place(new THREE.PlaneGeometry(w - 0.3, d - 0.3), x, 1.17, z, yaw, 1, -Math.PI / 2); boxUVs(soil, 2); tint(soil, "#3a2a18"); rocks.push(soil);
  }
  for (const [x, z, w, h, d, yaw, roll] of T.fallen) stone.push(block(w, h, d, x, h / 2 + Math.abs(roll) * w * 0.25, z, yaw, { bevel: 0.1, uvScale: 4.2, tint: rnd() < 0.5 ? "#d8d1c0" : "#c9c2ae", rz: roll, var: 0.06 }));
  { const pud: Geo[] = [];
    for (const [x, z, r] of T.puddles) { const pg = new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), pp = pg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) { const px = pp.getX(i), pz = pp.getZ(i), a = Math.atan2(pz, px), k = 1 + 0.22 * Math.sin(a * 3 + x) + 0.12 * Math.sin(a * 7 + z); pp.setXYZ(i, x + px * k, 0.135, z + pz * k * 0.8); }
      boxUVs(pg, 1); tint(pg, "#ffffff"); pud.push(pg); }
    const pm = new THREE.MeshStandardMaterial({ color: "#3d4a52", roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.62, envMapIntensity: 1.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false });
    const pmesh = staticMesh(merge(pud), pm, "plaza-puddles", false)!; pmesh.renderOrder = 1; root.add(pmesh); }
  // dressing (right foreground): crates of bananas, a banded barrel, a rope-wrapped post + a rope coil at its foot
  const crateMat = new THREE.MeshStandardMaterial({ map: plazaCrateTex(), roughness: 0.85 });
  for (const [x, y, z, r] of T.crates) {
    root.add(crateMesh(1.0, crateMat, x, y, z, r));
    // a heap of big bananas (hands of 3–4) on the open crate top
    for (let hnd = 0; hnd < 2; hnd++) { const hx = x + (rnd() - 0.5) * 0.35, hz = z + (rnd() - 0.5) * 0.35, ha = rnd() * 6.28; bananas.push(bananaHand(4 + (hnd % 2), 0.42, hx - Math.cos(ha) * 0.14, y + 0.83 + hnd * 0.08, hz + Math.sin(ha) * 0.14, ha, 0.12 + rnd() * 0.15, Math.round(x * 10 + z * 3) + hnd)); }
  }
  { // banded barrel: 16 bulging staves (alternating tone) + 3 dark iron hoops + a lid
    const [bx, by, bz] = T.barrel, R0 = 0.44, Hh = 1.05, n = 26;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2;
      const g = new THREE.BoxGeometry(2 * Math.PI * R0 / n * 1.04, Hh, 0.06, 2, 8, 1), p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const t = p.getY(i) / Hh, bul = R0 * (1 + 0.1 * (1 - 4 * t * t)), a = p.getX(i) / R0; p.setX(i, Math.sin(a) * (bul + p.getZ(i))); p.setZ(i, Math.cos(a) * (bul + p.getZ(i))); }
      g.computeVertexNormals(); g.rotateY(-a + Math.PI / 2); g.translate(bx, by + Hh / 2, bz); boxUVs(g, 0.8); tint(g, k % 2 ? "#b88252" : "#a06a3e", 0.05); woodG.push(g); }
    for (const t of [0.1, 0.5, 0.9]) { const hp = new THREE.TorusGeometry(R0 * (1 + 0.1 * (1 - 4 * (t - 0.5) ** 2)) + 0.035, 0.024, 6, 40); hp.rotateX(Math.PI / 2); hp.translate(bx, by + Hh * t, bz); tint(hp, "#3a332d"); stone.push(hp); }
    const lid = new THREE.CylinderGeometry(R0 * 0.93, R0 * 0.93, 0.04, 32); lid.translate(bx, by + Hh - 0.03, bz); boxUVs(lid, 0.8); tint(lid, "#8a5a32"); woodG.push(lid); }
  { const [px, py, pz] = T.post; const post = place(new THREE.CylinderGeometry(0.24, 0.28, 2.3, 12), px, py + 1.15, pz); boxUVs(post, 1.2); tint(post, "#9a6a3c"); woodG.push(post);
    woodG.push(drum(0.3, 0.06, px, py + 2.3, pz, 12, { tint: "#7a5230" }));
    ropes.push(lashing(px, py + 1.55, pz, 0.26, 4), lashing(px, py + 0.55, pz, 0.28, 3));
    for (let k = 0; k < 4; k++) ropes.push(place(new THREE.TorusGeometry(0.34 - k * 0.03, 0.05, 6, 18), px + 0.55, py + 0.06 + k * 0.09, pz + 0.25, 0, 1, Math.PI / 2));
    ropes.push(rope(new THREE.Vector3(px, py + 1.9, pz), new THREE.Vector3(T.planters[1].x1 - 0.8, 1.25, T.planters[1].z1 - 0.3), 0.6, 0.06)); }

  // the medallion: grey carved stone with moss only in the grooves (never a green disc)
  const medMat = stoneMaterial(pbr(ctx, "temple-blocks"), { scale: 0.8, moss: 0.35, mossCover: 0.22, mossColor: "#7cbd3c", vertexColors: true, variation: 0.3, lift: 0.22, liftTop: "#aebfd8", liftBottom: "#9fb08c", detail: 0.7 }, moss);
  medMat.color.setRGB(1.04, 1.12, 1.2);
  root.add(staticMesh(merge(paving), flag, "plaza-paving", false)!, staticMesh(merge(med), medMat, "plaza-medallion", false)!, staticMesh(merge(stone), mats.stone, "plaza-stone")!,
    staticMesh(merge(frz), mats.frieze, "plaza-glyphs")!, staticMesh(merge(rocks), boulderMat, "plaza-rocks")!,
    staticMesh(merge(woodG), mats.wood, "plaza-wood")!, staticMesh(merge(ropes), mats.rope, "plaza-ropes", false)!, staticMesh(merge(bananas), bananaMaterial(), "plaza-bananas")!);
}

/** the plaza crates' stencil: "THE FEED" sized to sit INSIDE the front board with a margin (never clipped by the crate's
 *  edge battens), worn paint, plank grain, corner nails */
function plazaCrateTex(): THREE.CanvasTexture {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#b8823f"; g.fillRect(0, 0, w, h);
    const rnd = mulb(5);
    for (let i = 0; i < 5; i++) { const y = (i * h) / 5; g.fillStyle = `hsl(31 52% ${40 + rnd() * 10}%)`; g.fillRect(0, y + 3, w, h / 5 - 6);
      g.strokeStyle = "rgba(60,30,10,0.35)"; g.lineWidth = 2; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, y + 10 + rnd() * (h / 5 - 20)); g.bezierCurveTo(w * 0.3, y + rnd() * (h / 5), w * 0.6, y + rnd() * (h / 5), w, y + rnd() * (h / 5)); g.stroke(); } }
    g.fillStyle = "#7a4a1e"; g.fillRect(0, 0, 30, h); g.fillRect(w - 30, 0, 30, h); g.fillRect(0, 0, w, 30); g.fillRect(0, h - 30, w, 30);
    g.save(); g.globalAlpha = 0.82; g.fillStyle = "#3c1e0a"; g.font = "bold 50px Helvetica, Arial"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("THE FEED", w / 2, h / 2 + 3); g.strokeStyle = "#3c1e0a"; g.lineWidth = 5; g.strokeRect(w * 0.2, h * 0.37, w * 0.6, h * 0.26); g.restore();
    // worn stencil: scratches through the paint
    g.globalCompositeOperation = "destination-out"; for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.4})`; g.fillRect(w * 0.18 + rnd() * w * 0.64, h * 0.35 + rnd() * h * 0.3, 2 + rnd() * 9, 1 + rnd() * 2); }
    g.globalCompositeOperation = "destination-over"; g.fillStyle = "#b8823f"; g.fillRect(0, 0, w, h); g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 8; i++) { g.fillStyle = "#4b3a2a"; g.beginPath(); g.arc(15 + (i % 2) * (w - 30), 44 + (i >> 1) * 140, 5, 0, 7); g.fill(); }
  });
}
