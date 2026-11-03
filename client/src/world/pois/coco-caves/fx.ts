// COCO CAVES fx: the glowing yellow crystal clusters (faceted hex prisms, emissive + soft halos), the lava fall on the
// lava tube's east wall (jungle kit melt shader) with its pool and glow, the skylight's god rays + drifting dust motes,
// hanging creepers round the skylight and over the mouths.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry, softSpriteTex } from "../_kit/jungle-mat";
import { lavaMeltMaterial } from "../_kit/jungle-lava";
import { godRay, puffCloud } from "../_kit/jungle-water";
import { buildHangingVines, type VineSpot } from "../_kit/jungle-vines";
import { CRYSTALS, crystalPrisms, LAVA, SKY, SUN_DIR, TUNNELS, HALL, HALL_C, OPEN, LAMPS, POOL, WATER_Y, ROCKS, groundAt, floorAt, insidePoly, hallDist, type Crystal } from "../../../../../shared/pois/coco-caves";
import { cavePatch } from "./light";
type V2 = [number, number];

function prism(r: number, rt: number, len: number): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(rt, r, len * 0.74, 6, 1);
  body.translate(0, len * 0.37, 0);
  const tip = new THREE.ConeGeometry(r * 0.8, len * 0.3, 6, 1);
  tip.translate(0, len * 0.74 + len * 0.15 - 0.001, 0);
  const g = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()])!;
  g.deleteAttribute("uv"); g.computeVertexNormals();
  return g;
}
/** a cluster = the shared layout's prisms (crystalPrisms — the colliders box exactly these) */
function cluster(k: Crystal): THREE.BufferGeometry {
  const rnd = mulberry(k.seed ^ 0x5bd1), parts: THREE.BufferGeometry[] = [], up = new THREE.Vector3(0, 1, 0);
  for (const p of crystalPrisms(k)) {
    const g = prism(p.r, p.rt, p.len);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(...p.d)));
    g.translate(p.x, p.y, p.z);
    // vertex colour carries data for the gem shader: r = per-prism tone, g = height along the prism (0 root → 1 tip),
    // b = per-facet random (non-indexed: every triangle its own value → faceted sparkle)
    const pos = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3), tone = 0.8 + rnd() * 0.4, L = p.len * 1.04;
    for (let v = 0; v < pos.count; v++) {
      const t = Math.min(1, Math.max(0, ((pos.getX(v) - p.x) * p.d[0] + (pos.getY(v) - p.y) * p.d[1] + (pos.getZ(v) - p.z) * p.d[2]) / L));
      col[v * 3] = tone; col[v * 3 + 1] = t;
      if (v % 3 === 0) { const f = rnd(); col[v * 3 + 2] = f; col[v * 3 + 5] = f; col[v * 3 + 8] = f; }
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

export function buildFx(ctx: WorldCtx, group: THREE.Group) {
  // ---- crystals
  // the gem: amber roots → lemon tips, every facet its own brightness, a bright rim at grazing angles and a glossy
  // clear-coat sparkle; lit from inside (emissive) so it reads in the dark and never goes flat in the sun
  const cm = new THREE.MeshPhysicalMaterial({ name: "caves:crystal", vertexColors: true, color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1, roughness: 0.42, metalness: 0.0, clearcoat: 0.0, specularIntensity: 0.25, flatShading: true, envMapIntensity: 0.08 });
  cm.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 gemA = vec3(1.0, 0.3, 0.0), gemB = vec3(1.0, 0.62, 0.0), gemC = vec3(1.0, 0.86, 0.3);
        float gT = vColor.g, gF = vColor.b, gTone = vColor.r;
        vec3 gem = mix(gemA, gemB, smoothstep(0.0, 0.55, gT)); gem = mix(gem, gemC, smoothstep(0.7, 1.0, gT) * 0.7);
        diffuseColor.rgb = gem * 0.32 * (0.6 + 0.4 * gF);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        { vec3 nV = normalize(normal), vV = normalize(vViewPosition); float fac = abs(dot(nV, vV));
          float rim = pow(1.0 - fac, 3.0);
          // two-tone facets (never small, pale, flat-shaded gems) — dark facets a deep
          //  amber, lit facets saturated gold, a few lemon "hot" facets; the light comes from inside (brightest facing the
          //  eye) and the edges burn orange. Blue stays ~0 and the peak ~1.7: bright enough to bloom, never cream.
          float lit = smoothstep(0.18, 0.85, gF);
          vec3 face = mix(vec3(0.75, 0.2, 0.0), vec3(1.25, 0.68, 0.02), lit);
          face = mix(face, vec3(1.45, 1.05, 0.22), smoothstep(0.82, 0.97, gF) * 0.8);
          float inner = (0.55 + 0.45 * fac) * mix(1.15, 0.9, gT) * (0.85 + 0.3 * smoothstep(0.6, 1.0, gT));
          totalEmissiveRadiance = face * inner * gTone + vec3(1.0, 0.42, 0.0) * rim * 0.9; }`);
  };
  // (little specular — whole flat facets mirror the skylight sun white: the hall's hero cluster reads cream)
  cavePatch(cm, { lamp: 0, spec: 0.2 });
  const cg = mergeGeometries(CRYSTALS.map(cluster))!;
  const crystals = new THREE.Mesh(cg, cm); crystals.name = "caves-crystals"; crystals.castShadow = false; crystals.receiveShadow = false; crystals.matrixAutoUpdate = false; crystals.updateMatrix();
  group.add(crystals);
  // soft halos (additive sprites) on the clusters — the bloom does the rest
  // soft halos: ONE points draw (not a sprite per cluster)
  { const pos: number[] = [], sz: number[] = [];
    for (const k of CRYSTALS) { pos.push(k.x + k.tilt[0] * k.s * 0.5, k.y + k.s * 0.8, k.z + k.tilt[1] * k.s * 0.5); sz.push(k.s * (k.hero ? 5.2 : 4.0)); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("size", new THREE.Float32BufferAttribute(sz, 1));
    const pm = new THREE.PointsMaterial({ map: softSpriteTex(0.0, 2.2), color: "#ffb000", transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, size: 1 });
    pm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace("uniform float size;", "uniform float size; attribute float size2;").replace("gl_PointSize = size;", "gl_PointSize = size * size2;"); };
    g.setAttribute("size2", g.getAttribute("size")); g.deleteAttribute("size");
    const halos = new THREE.Points(g, pm); halos.name = "caves-halos"; halos.renderOrder = 5; group.add(halos); }

  // ---- lava fall down the north wall behind the tower: a sheet from the crack down the face, fanning out at the foot
  // into a pool held by a rock lip
  const lm = lavaMeltMaterial({ crust: 0.6, vertical: true });
  lm.side = THREE.DoubleSide;
  {
    const tx = -LAVA.nz, tz = LAVA.nx;                 // along the wall
    const g0 = groundAt(LAVA.x + LAVA.nx * 0.8, LAVA.z + LAVA.nz * 0.8), H = LAVA.yTop - g0;
    const cols = 10, rows = 30, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const v = r / rows, u = c / cols, y = LAVA.yTop - H * v + 0.05;
      // a braided stream from the crack (narrow, wandering), fanning into a pool only over the last metres
      const w = LAVA.w * (0.5 + 0.09 * Math.sin(v * 17 + 1.3) + 0.06 * Math.sin(v * 41) + 0.5 * Math.max(0, v - 0.78) / 0.22), along = (u - 0.5) * w + Math.sin(v * 5.5) * 0.45 + Math.sin(v * 13 + 2) * 0.12;
      // (the plate's face stands 0.06 m proud of the wall line with ±0.12 m rock noise: keep the sheet 0.3 m clear)
      const out = 0.32 + 0.1 * Math.sin(v * 13 + u * 2) * 0.5 + 0.6 * Math.max(0, v - 0.82) / 0.18;
      pos.push(LAVA.x + tx * along + LAVA.nx * out, y, LAVA.z + tz * along + LAVA.nz * out);
      uv.push(u, (1 - v) * H);
      if (r < rows && c < cols) { const a = r * (cols + 1) + c, b = a + cols + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const sheet = new THREE.Mesh(g, lm); sheet.name = "caves-lava-fall"; sheet.castShadow = false; group.add(sheet);
    // a layered cascade — a hot narrow CORE sliding over the crusted
    // sheet (its own low-crust melt, 6 cm proud), the splash pool behind the lip, a glow on the pool + rising embers
    { const core = g.clone(), cp = core.attributes.position as THREE.BufferAttribute;
      for (let r = 0; r <= rows; r++) for (let c2 = 0; c2 <= cols; c2++) { const i = r * (cols + 1) + c2, v = r / rows, u = c2 / cols, k = 0.42 + 0.12 * Math.sin(v * 23 + 0.7);
        const cx = (cp.getX(r * (cols + 1)) + cp.getX(r * (cols + 1) + cols)) / 2, cz = (cp.getZ(r * (cols + 1)) + cp.getZ(r * (cols + 1) + cols)) / 2;
        cp.setXYZ(i, cx + (cp.getX(i) - cx) * k + LAVA.nx * 0.06, cp.getY(i), cz + (cp.getZ(i) - cz) * k + LAVA.nz * 0.06); void u; }
      core.computeVertexNormals();
      const lc = lavaMeltMaterial({ crust: 0.12, vertical: true }); lc.side = THREE.DoubleSide;
      const cm2 = new THREE.Mesh(core, lc); cm2.name = "caves-lava-core"; cm2.castShadow = false; cm2.renderOrder = 1; group.add(cm2); }
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(LAVA.w + 0.6, 0.85, 8, 2).rotateX(-Math.PI / 2), lm);
    pool.position.set(LAVA.x + LAVA.nx * 0.62, groundAt(LAVA.x + LAVA.nx * 0.62, LAVA.z + LAVA.nz * 0.62) + 0.3, LAVA.z + LAVA.nz * 0.62);
    pool.rotation.y = Math.atan2(tx, tz) - Math.PI / 2; pool.name = "caves-lava-pool"; group.add(pool);
    { const gm = new THREE.SpriteMaterial({ map: softSpriteTex(0.0, 2.0), color: "#ff6a1a", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
      for (const [h, sc] of [[0.6, 5.5], [2.6, 4.2], [5.5, 3.2]] as V2[]) { const sp = new THREE.Sprite(gm); sp.position.set(LAVA.x + LAVA.nx * 1.0, pool.position.y + h, LAVA.z + LAVA.nz * 1.0); sp.scale.set(sc * 1.4, sc, 1); sp.name = "caves-lava-glow"; sp.renderOrder = 5; group.add(sp); }
      const embers = puffCloud(new THREE.Vector3(LAVA.x + LAVA.nx * 0.9, pool.position.y + 2.2, LAVA.z + LAVA.nz * 0.9), { count: 46, size: [0.03, 0.06], opacity: 0.9, additive: true, spread: [LAVA.w * 0.45, 2.6, 0.6], drift: 0.35, rise: 0.55, life: 4.5, color: "#ffb04a" });
      embers.name = "caves-lava-embers"; group.add(embers); }
  }

  // ---- skylight: god-ray cards along the sun through the hole + dust motes in the shaft
  const sd = new THREE.Vector3(-SUN_DIR[0], -SUN_DIR[1], -SUN_DIR[2]);
  const rnd = mulberry(99);
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2, rr = SKY.r * 0.55 * Math.sqrt(rnd());
    const top = new THREE.Vector3(SKY.x + Math.cos(a) * rr, SKY.y1 + 1.5, SKY.z + Math.sin(a) * rr);
    const ray = godRay(top, sd, 26 + rnd() * 6, 2.2 + rnd() * 3.2, "#fff0c8", 0.05 + rnd() * 0.035);
    ray.name = "caves-godray"; group.add(ray);
  }
  // (no additive glow column + disc over the skylight — they faded in and out with the camera's
  //  height, i.e. visibly changed during the fly-in, and from the air read as a glass bubble over the hole; the crystal
  //  crown and the god rays mark the skylight)
  const motes = puffCloud(new THREE.Vector3(SKY.x - SUN_DIR[0] * -9, (SKY.y0 + 44) / 2, SKY.z - SUN_DIR[2] * -9), { count: 90, size: [0.04, 0.09], opacity: 0.55, additive: true, spread: [7, 9, 7], drift: 0.15, rise: 0.05, life: 14, color: "#fff2c8" });
  motes.name = "caves-motes"; group.add(motes);

  // ---- hanging creepers: the skylight rim (inward), the mouths, the high walls
  const spots: VineSpot[] = [];
  for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2 + 0.2; spots.push({ x: SKY.x + Math.cos(a) * (SKY.r + 0.3), y: SKY.y1 - 0.2 - (k % 2) * 1.2, z: SKY.z + Math.sin(a) * (SKY.r + 0.3), w: 2.6, len: 6 + (k % 4) * 3.5, ry: Math.atan2(Math.cos(a), -Math.sin(a)) + Math.PI / 2 }); }
  // curtains down the high walls of the hall (the walls drip with creepers)
  for (let i = 0; i < HALL.length; i++) { const a = HALL[i], b = HALL[(i + 1) % HALL.length]; if (i === OPEN.north || i === OPEN.southeast || i === OPEN.west) continue; for (const t of [0.3, 0.7]) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, dx = b[0] - a[0], dz = b[1] - a[1]; spots.push({ x: x + (HALL_C[0] - x) * 0.04, y: groundAt(x, z) + 11, z: z + (HALL_C[1] - z) * 0.04, w: 3.5, len: 5 + (i % 3) * 2, ry: Math.atan2(-dz, dx) }); } }
  for (const t of TUNNELS) { const dx = t.b[0] - t.a[0], dz = t.b[1] - t.a[1], L = Math.hypot(dx, dz); const ry = Math.atan2(-dz / L, dx / L) + Math.PI / 2; const y = groundAt(t.b[0], t.b[1]) + t.height; spots.push({ x: t.b[0], y, z: t.b[1], w: t.width, len: 4, ry }); spots.push({ x: t.a[0], y: groundAt(t.a[0], t.a[1]) + t.height, z: t.a[1], w: t.width, len: 3.5, ry: ry + Math.PI }); }
  const before = group.children.length;
  buildHangingVines(ctx, group, spots, 1, { out: 0.5 });
  for (const o of group.children.slice(before)) { const mesh = o as THREE.Mesh; if (mesh.material) cavePatch(mesh.material as THREE.MeshStandardMaterial, { lamp: 0.8 }); }
  buildOuterVines(ctx, group);
  buildGlints(ctx, group);
  return { crystals };
}

/** creepers spill down the massif's OUTER faces
 *  from every exterior tier top and the plateau rim — clumped, 3–9 m long, each ending ≥ 2.4 m over the next standable
 *  level below it (the next tier top or the ground) so no kong walks into a curtain. Soft foliage: the mesh is named "~…"
 *  (the parity check lets soft meshes be walked through). */
function buildOuterVines(ctx: WorldCtx, group: THREE.Group) {
  const spots: VineSpot[] = [], rnd = mulberry(4242);
  const below = (x: number, z: number, y: number) => { let m = groundAt(x, z); for (const r of ROCKS) { if (r.ghost) continue; const t = r.c[1] + r.h[1]; if (t > y - 0.3 || t < m) continue; const c = Math.cos(r.yaw), s = Math.sin(r.yaw), dx = x - r.c[0], dz = z - r.c[2]; if (Math.abs(dx * c - dz * s) < r.h[0] + 0.6 && Math.abs(dx * s + dz * c) < r.h[2] + 0.6) m = t; } return m; };
  for (const r of ROCKS) {
    if (r.tag !== "wall" && r.tag !== "buttress" && r.tag !== "roof" && r.tag !== "tunnel") continue;
    if (hallDist(r.c[0], r.c[2]) > -2) continue;
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw), top = r.c[1] + r.h[1];
    // the outer long face: the one farther from the hall
    for (const sd of [-1, 1]) {
      const fx = r.c[0] + sd * r.h[2] * s, fz = r.c[2] + sd * r.h[2] * c;
      if (hallDist(fx, fz) > hallDist(r.c[0], r.c[2]) - 0.5) continue;
      const nx = sd * s, nz = sd * c, n = Math.max(1, Math.round(r.h[0] / 2.2));
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.35) continue;
        const along = ((i + 0.5) / n - 0.5) * 2 * r.h[0] * 0.85, x = fx + along * c, z = fz - along * s;
        const room = top - below(x + nx * 1.2, z + nz * 1.2, top) - 2.4; if (room < 1.5) continue;
        spots.push({ x, y: top - 0.15, z, w: 2.4 + rnd() * 1.6, len: Math.min(room, 3 + rnd() * 6), ry: Math.atan2(nx, nz) });
      }
    }
  }
  const before = group.children.length;
  buildHangingVines(ctx, group, spots, 1, { out: 0.45, oneSided: true, push: 0.35 });
  for (const o of group.children.slice(before)) { o.name = "~caves-vines-out"; const mesh = o as THREE.Mesh; if (mesh.material) cavePatch(mesh.material as THREE.MeshStandardMaterial, { lamp: 0.4 }); }
}

/** each warm light over the lagoon draws its reflection —
 *  a soft streak on the water where the line from the eye to the light's mirror image meets the surface, stretched toward
 *  the viewer and broken up by the ripples (one instanced draw, positions updated per frame) */
function buildGlints(ctx: WorldCtx, group: THREE.Group) {
  const src = LAMPS.filter((l) => (l.kind === "lantern" || l.kind === "crystal" || l.kind === "lava") && l.y > WATER_Y + 0.4 && l.y < WATER_Y + 9 && insidePoly(POOL, l.x, l.z) || (l.kind !== "bounce" && l.kind !== "fill" && l.y < WATER_Y + 6 && POOL.some((p) => Math.hypot(p[0] - l.x, p[1] - l.z) < 6)));
  if (!src.length) return;
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; varying vec3 vC; varying vec3 vW;
      void main() { vUv = uv; vC = instanceColor; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vC; varying vec3 vW;
      void main() { vec2 q = vUv * 2.0 - 1.0; float across = exp(-q.x * q.x * 5.0), along = exp(-q.y * q.y * 1.6);
        float rip = 0.5 + 0.5 * sin(q.y * 6.0 - uTime * 1.3 + vW.x * 2.0) * sin(vW.x * 3.1 + vW.z * 2.3 + uTime * 0.9);
        gl_FragColor = vec4(vC * across * along * smoothstep(0.25, 0.85, rip) * 0.32, 1.0); }`,
  });
  const inst = new THREE.InstancedMesh(g, m, src.length); inst.name = "caves-glints"; inst.frustumCulled = false; inst.renderOrder = 4;
  const col = new THREE.Color();
  // (warm, dashed and dim — the pale lantern colour + bloom draws white "poles" on the water)
  src.forEach((l, i) => { col.set(l.color).multiply(new THREE.Color(1.0, 0.72, 0.38)).multiplyScalar(l.kind === "crystal" ? 0.6 : l.kind === "lava" ? 0.9 : 0.75); inst.setColorAt(i, col); });
  group.add(inst);
  const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  ctx.onUpdate((dt) => {
    const C = ctx.camera.position; if (C.y < WATER_Y + 0.2 || !inst.visible) return;
    m.uniforms.uTime.value += dt;
    src.forEach((l, i) => {
      const my = 2 * WATER_Y - l.y, t = (C.y - WATER_Y) / (C.y - my), x = C.x + (l.x - C.x) * t, z = C.z + (l.z - C.z) * t;
      const ok = insidePoly(POOL, x, z) && floorAt(x, z) < WATER_Y - 0.15;
      const dist = Math.hypot(x - C.x, z - C.z), len = Math.min(3.5, 0.6 + dist * 0.06 * (l.y - WATER_Y)), w = 0.45 + 0.1 * (l.kind === "crystal" ? 3 : 1) + dist * 0.008;
      q.setFromAxisAngle(up, Math.atan2(x - C.x, z - C.z));
      M4.compose(P.set(x, WATER_Y + 0.02, z), q, S.set(ok ? w : 0, 1, ok ? len : 0)); inst.setMatrixAt(i, M4);
    });
    inst.instanceMatrix.needsUpdate = true;
  });
}
