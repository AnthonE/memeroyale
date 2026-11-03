// COCO CAVES rock: the massif surface baked offline (surface nets over the displaced SDF of the
// collider boxes — the SAME boxes the server collides with). Chunked hi mesh (0.5 m voxels) near, a 1.6 m far mesh
// beyond LOD_FAR; one triplanar slate material (jungle kit stone shader: moss on tops, wet at the waterline) + the cave
// light patch (baked AO, sky / sun visibility, lamps; cool dark slate inside, warm sunlit rock outside).
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { pbr, stoneMaterial, bindJungleCtx } from "../_kit/jungle-mat";
import { WATER_Y } from "../../../../../shared/pois/coco-caves";
import { cavePatch, loadBin, caveRock2 } from "./light";
import { shadowOnlyMaterial } from "../_kit/town-materials";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const LOD_FAR = 200;   // (200 m — the plane / aerial views take the 1.6 m mesh)

export function rockMaterial(ctx: WorldCtx): THREE.MeshStandardMaterial {
  bindJungleCtx(ctx);
  // the island's own blocky cliff stone (grey plates, mossy joints): cool slate inside, warm sunlit outside (the tint
  // blend on the baked sky visibility lives in light.ts rockTone)
  const T = "assets/pois/caves/tex/cliff-rock";
  const set = Promise.all([ctx.assets.texture(`${T}.jpg`), ctx.assets.texture(`${T}_n.jpg`, { srgb: false }), ctx.assets.texture(`${T}_r.jpg`, { srgb: false })])
    .then(([map, normalMap, roughnessMap]) => ({ map, normalMap, roughnessMap }));
  const m = stoneMaterial(set, {
    triplanar: true, scale: 6.0, moss: 0.9, mossCover: 0.74, mossColor: "#6aa832", wetY: WATER_Y + 0.35, wetFade: 1.1, wetDark: 0.6,
    variation: 0.4, color: "#ffffff", normalScale: 1.25, roughness: 0.95, detail: 0.7, detailScale: 0.7,
  }, pbr(ctx, "moss"));
  m.name = "caves:rock";
  // two-sided — a creased plate can fold a sliver of the surface-nets / QEF mesh back-facing; culled, the sky showed
  // through it as bright blue triangles in the vault. The folds are rare and
  // hidden behind front faces everywhere else, so the cost is the back-face raster only.
  m.side = THREE.DoubleSide;
  caveRock2.value = null;
  return cavePatch(m, { ao: true, rockTone: true });
}

export interface RockMeshes { hi: THREE.Mesh[]; lo: THREE.Mesh[]; tris: number; hash: number; shadow?: THREE.Mesh }
/** load rock.bin and add its chunks to `group` (async; holds readiness until added) */
export function loadRock(ctx: WorldCtx, group: THREE.Group, mat: THREE.Material, onDone: (r: RockMeshes) => void) {
  const release = ctx.hold("coco-caves:rock");
  loadBin("assets/pois/caves/rock.bin").then(({ header, buf }) => {
    const B = header.bounds as { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
    const W = B.x1 - B.x0, H = B.y1 - B.y0, D = B.z1 - B.z0;
    const chunks = header.chunks as Array<{ lod: "hi" | "lo"; n: number; ni: number; i32: boolean; bbox: number[] }>;
    const out: RockMeshes = { hi: [], lo: [], tris: 0, hash: header.hash as number };
    chunks.forEach((c, ci) => {
      const [p, n, a, ix] = header.blobs.slice(ci * 4, ci * 4 + 4);
      const q = new Uint16Array(buf, p[0], c.n * 3), pos = new Float32Array(c.n * 3);
      for (let i = 0; i < c.n; i++) { pos[i * 3] = B.x0 + q[i * 3] / 65535 * W; pos[i * 3 + 1] = B.y0 + q[i * 3 + 1] / 65535 * H; pos[i * 3 + 2] = B.z0 + q[i * 3 + 2] / 65535 * D; }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Int8Array(buf, n[0], c.n * 3), 3, true));
      g.setAttribute("caveAO", new THREE.BufferAttribute(new Uint8Array(buf, a[0], c.n), 1, true));
      g.setIndex(new THREE.BufferAttribute(c.i32 ? new Uint32Array(buf, ix[0], c.ni) : new Uint16Array(buf, ix[0], c.ni), 1));
      const bb = c.bbox; g.boundingBox = new THREE.Box3(new THREE.Vector3(bb[0], bb[1], bb[2]), new THREE.Vector3(bb[3], bb[4], bb[5]));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = `caves-rock-${c.lod}${ci}`; mesh.matrixAutoUpdate = false; mesh.receiveShadow = true;
      // shadows: the hi mesh (~300 k tris) never casts — a shadow-only twin of the 1.6 m mesh casts for it at every
      // distance (the cave's own sun is the baked sun visibility; this only shades the outside cliffs + the jungle)
      mesh.castShadow = false;
      mesh.visible = c.lod === "hi";
      group.add(mesh);
      (c.lod === "hi" ? out.hi : out.lo).push(mesh);
      if (c.lod === "hi") out.tris += c.ni / 3;
    });
    // shadows: ONE shadow-only mesh of the whole 1.6 m surface (one per lo chunk, never culled, costs ~25 draws
    // in every cascade); index.ts switches it off while the camera is inside the hall (nothing outside is in view there)
    { const parts = out.lo.map((m) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", m.geometry.getAttribute("position")); g.setIndex(m.geometry.getIndex()); return g; });
      const sg = parts.length ? mergeGeometries(parts) : null;
      if (sg) { const sh = new THREE.Mesh(sg, shadowOnlyMaterial()); sh.name = "caves-rock-shadow"; sh.castShadow = true; sh.receiveShadow = false; sh.matrixAutoUpdate = false; sh.frustumCulled = false; group.add(sh); out.shadow = sh; } }
    onDone(out);
  }).catch((e) => console.warn("[coco-caves] rock.bin failed to load", e)).finally(release);
}
