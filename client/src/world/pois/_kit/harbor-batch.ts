// poi-harbor kit — PropBatcher: every repeated prop (forklifts, tractors, chassis, pallets, barriers…) is built ONCE as
// a prototype at the origin, in two detail levels, and drawn instanced:
//   • HI  — full detail, one InstancedMesh per (prototype, material): the painted palette + textured yellow paint / wood
//           / plywood / printed boxes; only the instances within `near` metres of the camera are written (casts shadows)
//   • LO  — a light stand-in (the HI silhouette in a few hundred tris: guard, mast, counterweight, 8-sided wheels) that
//           keeps the SAME textured materials (so LO props never read as untextured cubes), holding the instances between
//           `near` and `far`; no shadows
// Instances are re-bucketed when the camera moves > 2 m; empty meshes are hidden; bounds are recomputed from the
// written instances so frustum culling works. (BatchedMesh was tried: ANGLE/Metal emulates multi-draw with a draw per
// instance — 1 ms for 600 props. Instancing was ~25–40 draws.)
// Perf: the LO level is ONE merged static mesh per material for ALL prototypes (every LO instance pre-transformed,
// tagged with its instance id); a 1-byte-per-instance mask texture says which ones are drawn — the vertex shader
// collapses the rest (HI or out of range). LO = ≤ 4 draws whatever the prototype count (was one per prototype ×
// material: 35–60 draw calls at kong eye — the harbor's biggest cost on ANGLE/Metal).
//   const pb = new PropBatcher();
//   pb.proto("forklift", (b, detail) => forkliftInto(b, mats, [0,0,0], 0, detail));
//   pb.add("forklift", matrix);
//   group.add(pb.build({ name, near: 50, far: 260 })); ctx.onUpdate(() => pb.update(localCameraPosition));
import * as THREE from "three";
import { Builder, casterOnlyMaterial, mergeGen, paletteMaterial } from "./harbor-geo";
import { SEED_GLSL } from "../../../engine/dither";
import { INST_FADE, INST_FADE_S, instFadeAttr, instFadeMaterial } from "./inst-fade";

const _mm = new THREE.Matrix4();

type ProtoFn = (b: Builder, detail: boolean) => void;
interface Inst { key: string; m: Float32Array; p: THREE.Vector3; level: 0 | 1 | 2; id: number; cell: string; from: number; t0: number; t: number }
/** LO meshes are merged per material PER CELL — each cell's mesh has tight bounds (the main frustum culls it) and is
 *  hidden while none of its instances is at the LO level */
const LO_CELL = 128;

/** the LO mask: instance id → drawn (255) / collapsed (0), in a W-wide R8 texture */
const MASK_W = 256;
// the LO stand-ins DISSOLVE out over the last 15 % of `far` (by each vertex's camera distance, the
// screen-door noise moving with the TAA jitter — engine/dither.ts) instead of every prop vanishing / appearing in one frame
// at `far` (the fly-in toward the port: ~600 props popping in at 260 m). The CPU cut at `far` then removes what is gone.
function maskedClone(src: THREE.Material, mask: THREE.DataTexture, fade: { value: THREE.Vector2 }): THREE.Material {
  const m = src.clone();
  m.name = `${src.name || "mat"}-lo`;
  const prev = src.onBeforeCompile, prevKey = src.customProgramCacheKey.bind(src);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uLoMask = { value: mask };
    sh.uniforms.uLoFade = fade;
    sh.vertexShader = "attribute float loId;\nuniform highp sampler2D uLoMask;\nuniform vec2 uLoFade;\nvarying float vLoFade;\nvarying float vLoMk;\n" + sh.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
  {
    int lid = int( loId + 0.5 );
    float loMk = texelFetch( uLoMask, ivec2( lid % ${MASK_W}, lid / ${MASK_W} ), 0 ).r * 255.0;
    if ( loMk < 0.5 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
    vLoMk = loMk;
    vLoFade = 1.0 - smoothstep( uLoFade.x, uLoFade.y, distance( ( modelMatrix * vec4( transformed, 1.0 ) ).xyz, cameraPosition ) );
  }`);
    sh.fragmentShader = "varying float vLoFade;\nvarying float vLoMk;\n" + sh.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  if ( vLoFade < 0.999 || vLoMk < 254.5 ) {
    float loN = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) )${SEED_GLSL} );
    if ( loN >= vLoFade ) discard;
    // (HI <-> LO crossfade: 1..127 = the LO arriving, drawn where n < v / 127; 128..254 = leaving, drawn where
    // n >= (v - 128) / 126 — the complement of the HI instance's own dissolve)
    if ( vLoMk < 254.5 && ( vLoMk < 127.5 ? loN >= vLoMk * ( 1.0 / 127.0 ) : loN < ( vLoMk - 128.0 ) * ( 1.0 / 126.0 ) ) ) discard;
  }`);
  };
  m.customProgramCacheKey = () => `${prevKey()}|lo-mask-fade2`;
  return m;
}
interface Level { meshes: THREE.InstancedMesh[] }

/** materials that keep their texture in the HI meshes (everything else merges into the vertex-coloured palette) */
const TEXTURED = /^(wood|plywood|banana-box|yellowPaint|chassis-grey|hatch-green|concrete|wallWhite|cage-mesh)$/;
/** the LO stand-ins keep only the materials that carry the read at 30–260 m (the yellow paint's wear, wood grain,
 *  printed boxes); everything else merges into the palette — 1–2 draws per prototype */
const TEXTURED_LO = /^(wood|yellowPaint|banana-box|hatch-green)$/;

export class PropBatcher {
  private protos = new Map<string, ProtoFn>();
  private insts: Inst[] = [];
  private byKey = new Map<string, Inst[]>();
  private hi = new Map<string, Level>();
  private loMask: THREE.DataTexture | null = null;
  /** the LO dissolve band (camera distance, m) */
  private loFade = { value: new THREE.Vector2(1e6, 1e6 + 1) };
  private loMeshes: THREE.Mesh[] = [];
  /** LO meshes per cell (shown while ≥ 1 of the cell's instances is LO) */
  private loCells = new Map<string, THREE.Mesh[]>();
  private last = new THREE.Vector3(1e9, 0, 0);
  private frames = 0;
  near = 50; far = 260;
  proto(key: string, fn: ProtoFn) { if (!this.protos.has(key)) this.protos.set(key, fn); return this; }
  add(key: string, m: THREE.Matrix4) {
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const i: Inst = { key, m: new Float32Array(m.elements), p, level: 2, id: this.insts.length, cell: `${Math.floor(p.x / LO_CELL)}:${Math.floor(p.z / LO_CELL)}`, from: -1, t0: 0, t: 1 };
    this.insts.push(i);
    (this.byKey.get(key) ?? this.byKey.set(key, []).get(key)!).push(i);
  }
  get count() { return this.insts.length; }

  build(o: { name: string; near?: number; far?: number; shadows?: boolean }): THREE.Group {
    const it = this.steps(o);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }
  /** the same build in slices (`yieldFn` = the module's ctx.yield between prototypes and merges) */
  async buildAsync(o: { name: string; near?: number; far?: number; shadows?: boolean }, yieldFn: () => Promise<void>): Promise<THREE.Group> {
    const it = this.steps(o);
    let r = it.next();
    while (!r.done) { await yieldFn(); r = it.next(); }
    return r.value;
  }
  private *steps(o: { name: string; near?: number; far?: number; shadows?: boolean }): Generator<void, THREE.Group, void> {
    this.near = o.near ?? this.near; this.far = o.far ?? this.far;
    this.loFade.value.set(this.far * 0.85, this.far * 0.98);
    const group = new THREE.Group(); group.name = o.name;
    const loParts = new Map<string, { mat: THREE.Material; cell: string; geos: THREE.BufferGeometry[] }>();
    for (const [key, list] of this.byKey) {
      const fn = this.protos.get(key)!, n = list.length;
      // HI
      // (deferred builders — the per-piece work runs in slices between the generator's yields)
      const bh = new Builder(true); fn(bh, true);
      while (!bh.flush(10)) yield;
      const gh = bh.build(`${o.name}-${key}`, { palette: (m) => !TEXTURED.test(m.name) });
      const hiL: Level = { meshes: [] };
      gh.traverse((x) => {
        const src = x as THREE.Mesh; if (!src.isMesh) return;
        const im = new THREE.InstancedMesh(src.geometry, instFadeMaterial(src.material as THREE.Material), n);
        if (INST_FADE) instFadeAttr(src.geometry, n);
        im.name = `${o.name}-${key}-hi-${(src.material as THREE.Material).name}`; im.count = 0; im.visible = false;
        im.castShadow = o.shadows ?? true; im.receiveShadow = true; im.userData.castShadow = im.castShadow; im.userData.farShadow = false;
        // HI instances live within `near` (≤ the c0 split): they cast into cascade 0 only (perf: half the shadow draws)
        im.userData.c1Shadow = false;
        hiL.meshes.push(im); group.add(im);
      });
      this.hi.set(key, hiL);
      // LO: every instance of this prototype pre-transformed into the per-material merge lists, tagged with its id
      const bl = new Builder(true); fn(bl, false);
      while (!bl.flush(10)) yield;
      const gl = bl.build(`${o.name}-${key}-lo`, { palette: (m) => !TEXTURED_LO.test(m.name) });
      const loSrc: THREE.Mesh[] = [];
      gl.traverse((x) => { if ((x as THREE.Mesh).isMesh) loSrc.push(x as THREE.Mesh); });
      for (const src of loSrc) {
        const mat = (src.material as THREE.Material) ?? paletteMaterial();
        const base = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry;
        const vc = base.attributes.position.count;
        for (const [ii, inst] of list.entries()) {
          const k = `${mat.uuid}|${inst.cell}`;
          const out = loParts.get(k) ?? loParts.set(k, { mat, cell: inst.cell, geos: [] }).get(k)!;
          const g = base.clone().applyMatrix4(_mm.fromArray(inst.m));
          // LO copies (drawn from ~50 m) of props placed touching / stacked on each other shared faces exactly:
          // each instance a few mm off its neighbours (≤ 2 cm, invisible at that range) so they stop fighting
          g.translate(((inst.id % 3) - 1) * 0.004, (inst.id % 5) * 0.005, ((inst.id % 7) - 3) * 0.002);
          g.setAttribute("loId", new THREE.BufferAttribute(new Float32Array(vc).fill(inst.id), 1));
          out.geos.push(g);
          if ((ii & 63) === 63) yield;
        }
      }
      yield;
    }
    // the mask + one merged mesh per LO material
    const rows = Math.max(1, Math.ceil(this.insts.length / MASK_W));
    this.loMask = new THREE.DataTexture(new Uint8Array(MASK_W * rows), MASK_W, rows, THREE.RedFormat, THREE.UnsignedByteType);
    this.loMask.minFilter = this.loMask.magFilter = THREE.NearestFilter; this.loMask.generateMipmaps = false; this.loMask.needsUpdate = true;
    // every prop's silhouette baked into the static FAR shadow map (atmos force-shows it for the one-off bake; it is never
    // drawn otherwise): props beyond the c0 split keep a soft grounded shadow at zero runtime cost
    const farParts: THREE.BufferGeometry[] = [];
    for (const { geos } of loParts.values()) for (const g of geos) { const q = new THREE.BufferGeometry(); q.setAttribute("position", g.attributes.position); farParts.push(q); }
    yield;
    const farGeo = farParts.length ? yield* mergeGen(farParts) : null;
    yield;
    if (farGeo) {
      farGeo.computeBoundingSphere();
      const fm = new THREE.Mesh(farGeo, casterOnlyMaterial());
      fm.name = `${o.name}-farshadow`; fm.visible = false; fm.castShadow = true; fm.receiveShadow = false;
      fm.userData.castShadow = true; fm.userData.farShadow = "force";
      group.add(fm);
    }
    const loMats = new Map<THREE.Material, THREE.Material>();
    for (const { mat, cell, geos } of loParts.values()) {
      const merged = yield* mergeGen(geos);
      if (!merged) { console.warn(`[harbor-batch] LO merge failed (${mat.name})`); continue; }
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      // (one masked clone per material, shared by its cells: same program + uniforms)
      const lm = loMats.get(mat) ?? loMats.set(mat, maskedClone(mat, this.loMask, this.loFade)).get(mat)!;
      const mesh = new THREE.Mesh(merged, lm);
      mesh.name = `${o.name}-lo-${mat.name || "mat"}-${cell}`; mesh.visible = false;
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.castShadow = false; mesh.userData.farShadow = false;
      this.loMeshes.push(mesh); group.add(mesh);
      (this.loCells.get(cell) ?? this.loCells.set(cell, []).get(cell)!).push(mesh);
      yield;
    }
    return group;
  }

  /** prototypes with HI <-> LO crossfades running (rewritten every frame until they end) */
  private fadeKeys = new Set<string>();
  /** re-bucket instances by distance to `cam` (group-local) and rewrite the changed prototypes. Cheap; call per frame. */
  update(cam: THREE.Vector3, force = false) {
    const now = performance.now();
    const moved = force || ++this.frames >= 30 || cam.distanceToSquared(this.last) >= 4;
    if (!moved && !this.fadeKeys.size) return;
    if (moved) { this.frames = 0; this.last.copy(cam); }
    const n2 = this.near * this.near, f2 = this.far * this.far;
    let anyChange = force;
    for (const [key, list] of this.byKey) {
      let changed = force || this.fadeKeys.has(key);
      if (moved) for (const i of list) {
        const d2 = i.p.distanceToSquared(cam), lv: 0 | 1 | 2 = d2 < n2 ? 0 : d2 < f2 ? 1 : 2;
        if (lv !== i.level) {
          // HI <-> LO crossfades over INST_FADE_S (complementary dissolves, inst-fade.ts); LO <-> nothing is
          // the LO shader's distance dissolve; anything else (a camera cut) switches at once
          if (INST_FADE && i.level + lv === 1) { i.from = i.level; i.t0 = now; i.t = 0; this.fadeKeys.add(key); } else i.from = -1;
          i.level = lv; changed = true;
        }
      }
      if (!changed) continue;
      anyChange = true;
      let fading = false;
      for (const i of list) if (i.from >= 0) { i.t = (now - i.t0) / (INST_FADE_S * 1000); if (i.t >= 1) { i.from = -1; i.t = 1; } else fading = true; }
      if (!fading) this.fadeKeys.delete(key);
      for (const im of this.hi.get(key)!.meshes) {
        const arr = im.instanceMatrix.array as Float32Array, kda = im.geometry.getAttribute("aKrDis") as THREE.InstancedBufferAttribute | undefined, kd = kda?.array as Float32Array | undefined;
        let c = 0;
        for (const i of list) {
          if (i.level !== 0 && i.from !== 0) continue;
          if (kd) kd[c] = i.from < 0 ? 0 : i.level === 0 ? i.t - 1 : Math.max(0.011, i.t);
          arr.set(i.m, 16 * c++);
        }
        im.count = c; im.visible = c > 0;
        im.instanceMatrix.needsUpdate = true;
        if (kda) kda.needsUpdate = true;
        im.boundingSphere = null; if (c) im.computeBoundingSphere();
      }
    }
    if (anyChange && this.loMask) {
      const d = this.loMask.image.data as Uint8Array;
      const live = new Set<string>();
      for (const i of this.insts) {
        let v = 0;
        if (i.level === 1) v = i.from === 0 ? Math.max(1, Math.min(127, Math.round(i.t * 127))) : 255;
        else if (i.level === 0 && i.from === 1) v = 128 + Math.min(126, Math.round(i.t * 126));
        d[i.id] = v; if (v) live.add(i.cell);
      }
      this.loMask.needsUpdate = true;
      for (const [cell, meshes] of this.loCells) { const on = live.has(cell); for (const m of meshes) m.visible = on; }
    }
  }
}
