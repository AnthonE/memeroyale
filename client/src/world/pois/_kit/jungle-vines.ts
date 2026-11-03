// poi-jungle kit — hanging creepers / vine curtains over rock ledges and temple walls. A canvas-painted creeper sheet
// (strands of heart-shaped ivy leaves hanging from the top edge, tapering, ragged ends) on bent vertical cards that
// drape from a ledge outward and down. Alpha-tested, shadow-casting, one instanced draw per call site.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { canvasTex, mulberry } from "./jungle-mat";

let _tex: THREE.CanvasTexture | null = null;
/** creeper texture: 512×1024. 3–5 CLUMPS of tapering strands hanging from leafy knots near the top; strand lengths vary
 *  15–95 %, leaves shrink down each strand; three greens; wide transparent margins (never a rectangle) */
export function creeperTex(): THREE.CanvasTexture {
  if (_tex) return _tex;
  _tex = canvasTex(512, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const rnd = mulberry(1717);
    const greens = [[96, 58, 30], [104, 52, 38], [86, 46, 26]];   // hue, sat, light
    const leaf = (x: number, y: number, r: number, a: number, gi: number, dl: number) => {
      const [hue, sat, L0] = greens[gi], L = L0 + dl;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = `hsl(${hue + (rnd() - 0.5) * 10} ${sat}% ${L}%)`;
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-r, r * 0.3, -r * 0.9, r * 1.15, 0, r * 1.2); g.bezierCurveTo(r * 0.9, r * 1.15, r, r * 0.3, 0, 0); g.fill();
      g.fillStyle = `hsl(${hue} ${sat}% ${Math.min(80, L + 13)}%)`;
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-r * 0.7, r * 0.2, -r * 0.6, r * 0.6, 0, r * 0.62); g.bezierCurveTo(r * 0.3, r * 0.5, r * 0.4, r * 0.2, 0, 0); g.fill();
      g.strokeStyle = `hsl(${hue} ${sat}% ${L * 0.6}%)`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, r * 1.05); g.stroke();
      g.restore();
    };
    const clumps = [[110, 0.55], [250, 0.8], [395, 0.6], [185, 0.35], [330, 0.4]];
    for (const [cx0, weight] of clumps) {
      const gi = Math.floor(rnd() * 3), nS = 3 + Math.floor(rnd() * 5 * weight + 1), spread = 28 + rnd() * 34, top = 6 + rnd() * 30;
      for (let s2 = 0; s2 < nS; s2++) {
        const x0 = cx0 + (rnd() - 0.5) * spread, len = h * (0.15 + rnd() * rnd() * 0.85) * (0.5 + weight * 0.6), sway = (rnd() - 0.5) * 36;
        g.strokeStyle = "#46652a"; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x0, top); g.bezierCurveTo(x0 + sway, top + len * 0.3, x0 - sway, top + len * 0.7, x0 + sway * 0.5, top + len); g.stroke();
        const n = Math.round(len / 15);
        for (let i = 0; i < n; i++) {
          const t = i / n, y = top + t * len, x = x0 + sway * (3 * t * (1 - t) * (1 - 2 * t)) * 1.2 + sway * 0.5 * t * t;
          leaf(x + (rnd() - 0.5) * 9, y, (13 + rnd() * 12) * (1 - t * 0.55), (rnd() - 0.5) * 1.6 + (rnd() < 0.5 ? -0.5 : 0.5), rnd() < 0.8 ? gi : (gi + 1) % 3, (rnd() - 0.5) * 14);
        }
      }
      // the leafy knot at the ledge the clump hangs from
      for (let i = 0; i < 22; i++) leaf(cx0 + (rnd() - 0.5) * spread * 1.4, top + rnd() * 34, 12 + rnd() * 11, (rnd() - 0.5) * 3, gi, (rnd() - 0.5) * 16);
    }
  }, { repeat: false });
  _tex.wrapS = THREE.ClampToEdgeWrapping;
  return _tex;
}

export interface VineSpot { x: number; y: number; z: number; w: number; len: number; ry: number }
/** drape bent creeper cards from ledge points (clumped, random widths/lengths, 3 greens per instance, card edges eroded by
 *  noise); `density` 0..1 keeps a fraction of the spots */
export function buildHangingVines(ctx: WorldCtx, root: THREE.Object3D, spots: VineSpot[], density = 1, o: { color?: string; out?: number; /** never flip a card to the back side (walls: the back is solid) */ oneSided?: boolean; push?: number } = {}) {
  const rnd = mulberry(spots.length * 13 + 7);
  const segs = 5, geo = new THREE.PlaneGeometry(1, 1, 2, segs);
  geo.translate(0, -0.5, 0); // top edge at y = 0
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const v = -pos.getY(i); pos.setZ(i, (o.out ?? 0.35) * Math.sin(v * Math.PI * 0.9) + 0.12 * Math.sin(pos.getX(i) * 3.1)); }
  geo.computeVertexNormals();
  const mats: THREE.Matrix4[] = [], cols: THREE.Color[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const greens = [new THREE.Color("#dcf2b4"), new THREE.Color("#c4e29a"), new THREE.Color("#b2d488")];
  for (const s of spots) {
    if (rnd() > density) continue;
    const n = Math.max(1, Math.round(s.w / 2.2));
    for (let k = 0; k < n; k++) {
      if (n > 1 && rnd() < 0.3) continue;                                   // gaps → clumps, never a continuous curtain
      const a = s.ry + (o.oneSided || rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * (o.oneSided ? 0.12 : 0.4);
      const along = (k + 0.5 + (rnd() - 0.5) * 0.6) / n - 0.5, px = s.x + Math.cos(s.ry) * along * s.w, pz = s.z - Math.sin(s.ry) * along * s.w;
      const fx = Math.sin(a), fz = Math.cos(a), off = o.push ?? s.w * 0.28;
      e.set(0, a, 0); q.setFromEuler(e);
      const w = 1.4 + rnd() * 2.6, L = s.len * (0.35 + rnd() * 0.9);
      m.compose(new THREE.Vector3(px + fx * off, s.y + 0.15, pz + fz * off), q, new THREE.Vector3(w, L, 1.2 + rnd() * 0.8));
      mats.push(m.clone()); cols.push(greens[Math.floor(rnd() * 3)].clone().multiplyScalar(0.88 + rnd() * 0.24));
    }
  }
  if (!mats.length) return;
  const tex = creeperTex();
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color: o.color ?? "#ffffff" });
  erodeEdges(mat);
  sharpenAlpha(mat);
  const inst = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mm, i) => { inst.setMatrixAt(i, mm); inst.setColorAt(i, cols[i]); });
  inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true; inst.computeBoundingSphere();
  inst.castShadow = true; inst.receiveShadow = true; inst.name = "jungle-vines";
  inst.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.45 });
  root.add(inst);
  void ctx;
}

/** noise-eroded card edges: the alpha fades out toward the card's sides and bottom through a per-instance noise, so no
 *  straight edge ever survives (instanced cards: the instance translation seeds the noise) */
export function erodeEdges(m: THREE.Material) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vErUv; varying float vErSeed;").replace("#include <uv_vertex>", `#include <uv_vertex>
      vErUv = uv;
      #ifdef USE_INSTANCING
        vErSeed = fract(dot(instanceMatrix[3].xyz, vec3(0.137, 0.311, 0.173)));
      #else
        vErSeed = 0.0;
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec2 vErUv; varying float vErSeed;
      float erN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5), b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5), c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5), d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5); return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }`)
      .replace("#include <alphatest_fragment>", `{ float sx = min(vErUv.x, 1.0 - vErUv.x), yb = vErUv.y;
          float n1 = erN(vec2(vErUv.y * 7.0 + vErSeed * 40.0, vErSeed * 13.0)), n2 = erN(vec2(vErUv.x * 6.0 + vErSeed * 23.0, 3.0));
          diffuseColor.a *= smoothstep(0.02, 0.1 + 0.22 * n1, sx) * smoothstep(0.0, 0.12 + 0.35 * n2, yb); }
        #include <alphatest_fragment>`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : "") + "|erode";
}

/** alpha-test that stays crisp under minification: re-sharpen the (mip-blurred) alpha by its screen derivative, so far
 *  creeper cards keep their holes instead of turning into solid green rectangles */
export function sharpenAlpha(m: THREE.Material, cut = 0.45) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace("#include <alphatest_fragment>", `diffuseColor.a = (diffuseColor.a - ${cut.toFixed(3)}) / max(fwidth(diffuseColor.a), 0.0001) + 0.5;\n#include <alphatest_fragment>`);
  };
  m.alphaTest = 0.5;
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : "") + "|sharpA";
}
