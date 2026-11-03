// Supply drop (target art loot-04-supply-drop): a BANANA CO. crate hanging under a big banana-leaf-print parachute
// — a scalloped 14-gore canopy with a yellow hem + vent, 14 rope lines gathered at a brass ring above the crate, four
// slings to the crate corners — descending with a gentle pendulum sway and a breathing canopy, a column of yellow
// marker smoke rising from the landing point (the kit FX smoke family), and on touchdown the canopy collapses and
// drifts down beside the crate. createSupplyDrop(ctx, fx) → { object, update(dt), land, landed }.
import * as THREE from "three";
import type { WorldCtx } from "../engine/engine";
import { createChestView } from "./chest";
import type { FxEx } from "./index";

const GORES = 14;
const RC = 3.4;      // canopy radius at the hem (m)
const HC = 2.3;      // canopy height (m)
const LINE_L = 5.2;  // hem → gather ring (m)
const CRATE_K = 1.45;

function canvas(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

let canopyTex: THREE.CanvasTexture | null = null;
/** banana-leaf print on green canvas: u = around (one gore = 1/GORES), v = hem (0) → vent (1) */
function leafPrint(): THREE.CanvasTexture {
  if (canopyTex) return canopyTex;
  const W = 2048, H = 1024, c = canvas(W, H), g = c.getContext("2d")!, r = rng(21);
  g.fillStyle = "#3f8a2a"; g.fillRect(0, 0, W, H);
  const leaf = (x: number, y: number, len: number, wid: number, rot: number, fill: string, rib: string) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = fill; g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.25, -wid, len * 0.75, -wid, len, 0); g.bezierCurveTo(len * 0.75, wid, len * 0.25, wid, 0, 0); g.fill();
    g.strokeStyle = rib; g.lineWidth = Math.max(2, wid * 0.12); g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
    g.lineWidth = Math.max(1, wid * 0.05);
    for (let k = 1; k < 9; k++) { const px = (k / 9) * len; g.beginPath(); g.moveTo(px, 0); g.lineTo(px + len * 0.07, -wid * 0.85); g.moveTo(px, 0); g.lineTo(px + len * 0.07, wid * 0.85); g.stroke(); }
    g.restore();
  };
  // three layers of leaves: dark big ones, mid, light small ones on top (wrap-safe in u)
  const layers: Array<[number, string, string, number]> = [[70, "#2d6b1c", "#245816", 1.25], [90, "#5da83a", "#3f8a2a", 1], [70, "#9fd05a", "#6fae3c", 0.75]];
  for (const [n, fill, rib, k] of layers) for (let i = 0; i < n; i++) {
    const x = r() * W, y = 60 + r() * (H - 180), len = (150 + r() * 160) * k, wid = len * (0.2 + r() * 0.08), rot = (r() - 0.5) * 2.4 - Math.PI / 2 * (r() < 0.5 ? 0.3 : -0.3);
    for (const ox of [0, -W, W]) leaf(x + ox, y, len, wid, rot, fill, rib);
  }
  // gore seams (a darker stitched line down every gore edge)
  g.strokeStyle = "rgba(20,50,10,0.75)"; g.lineWidth = 5;
  for (let i = 0; i <= GORES; i++) { const x = (i / GORES) * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  g.strokeStyle = "rgba(230,240,190,0.35)"; g.lineWidth = 1.5; g.setLineDash([10, 8]);
  for (let i = 0; i <= GORES; i++) { const x = (i / GORES) * W + 7; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  g.setLineDash([]);
  // yellow hem band (bottom) with a darker scalloped edge + a yellow vent rim (top)
  const hem = H * 0.1;
  g.fillStyle = "#f4c21b"; g.fillRect(0, H - hem, W, hem);
  g.fillStyle = "#d59a0c"; g.fillRect(0, H - hem, W, 10);
  g.fillStyle = "#fff3a8"; g.fillRect(0, H - hem + 16, W, 5);
  g.fillStyle = "#f4c21b"; g.fillRect(0, 0, W, H * 0.05);
  g.fillStyle = "#d59a0c"; g.fillRect(0, H * 0.05, W, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  canopyTex = t;
  return t;
}

/** the canopy: a dome of GORES bulging panels (each gore billows between its two lines), scalloped hem, open vent */
function canopyGeometry(): THREE.BufferGeometry {
  const AROUND = GORES * 12, UP = 26;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= UP; j++) {
    const v = j / UP;                           // 0 hem → 1 vent
    const phi = 0.12 + v * (Math.PI / 2 - 0.2); // polar angle from the hem
    for (let i = 0; i <= AROUND; i++) {
      const u = i / AROUND, th = u * Math.PI * 2;
      const g = Math.abs(Math.sin(th * GORES / 2));             // 0 at a line, 1 mid-gore
      const billow = 1 + 0.07 * Math.pow(g, 0.7) * (0.4 + 0.6 * Math.sin(v * Math.PI));
      const hemScallop = j === 0 ? -0.18 * (1 - Math.pow(g, 0.6)) : 0; // the hem rises at the lines
      const rr = RC * Math.cos(phi) * billow;
      pos.push(Math.cos(th) * rr, HC * Math.sin(phi) / Math.sin(Math.PI / 2 - 0.08) + hemScallop, Math.sin(th) * rr);
      uv.push(u * 1, 1 - v);
    }
  }
  const row = AROUND + 1;
  for (let j = 0; j < UP; j++) for (let i = 0; i < AROUND; i++) { const a = j * row + i, b = a + row; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface SupplyDrop {
  object: THREE.Group;
  /** metres per second the drop falls (default 3.2) */
  speed: number;
  readonly landed: boolean;
  update(dt: number): void;
  /** put it at `pos` (the crate's bottom), `groundY` = where it will land (the smoke column rises from there) */
  place(pos: THREE.Vector3, groundY: number): void;
}

export function createSupplyDrop(ctx: WorldCtx, fx: FxEx | null): SupplyDrop {
  const object = new THREE.Group(); object.name = "supply-drop";
  // ---- crate (the classic BANANA CO. crate, legendary bands, scaled up)
  const crate = createChestView(ctx, "legendary", { aura: false, style: "classic" });
  crate.object.scale.setScalar(CRATE_K);
  object.add(crate.object);
  const crateTop = 0.98 * CRATE_K, crateHalf = 0.51 * CRATE_K;
  // ---- rig: gather ring above the crate, slings to the corners, lines up to the canopy hem
  const rig = new THREE.Group(); rig.name = "supply-rig"; object.add(rig);
  const ringY = crateTop + 1.1;
  const ropeMat = new THREE.MeshStandardMaterial({ color: "#c9a56a", roughness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: "#c79a3a", roughness: 0.3, metalness: 1 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 10, 24), brass); ring.position.y = ringY; ring.rotation.x = Math.PI / 2; rig.add(ring);
  const lineGeos: THREE.BufferGeometry[] = [];
  const addLine = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const d = b.clone().sub(a), L = d.length();
    const g = new THREE.CylinderGeometry(r, r, L, 6, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    lineGeos.push(g);
  };
  const gather = new THREE.Vector3(0, ringY, 0);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) addLine(gather, new THREE.Vector3(sx * crateHalf * 0.92, crateTop - 0.04, sz * crateHalf * 0.92), 0.022);
  // ---- canopy
  const canopy = new THREE.Group(); canopy.name = "supply-canopy";
  const hemY = ringY + LINE_L * 0.93;
  canopy.position.y = hemY;
  // sunlight glows THROUGH the canopy cloth: the print as a faint emissive (translucency) so its underside is never a dark lid
  const cMat = new THREE.MeshStandardMaterial({ map: leafPrint(), roughness: 0.78, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6, emissiveMap: leafPrint(), emissive: new THREE.Color(0.32, 0.32, 0.26) });
  const dome = new THREE.Mesh(canopyGeometry(), cMat); dome.castShadow = true; dome.receiveShadow = true;
  canopy.add(dome);
  object.add(canopy);
  for (let i = 0; i < GORES; i++) {
    const th = (i / GORES) * Math.PI * 2;
    addLine(gather, new THREE.Vector3(Math.cos(th) * RC * Math.cos(0.12) * 0.99, hemY + HC * Math.sin(0.12) / Math.sin(Math.PI / 2 - 0.08) - 0.18, Math.sin(th) * RC * Math.cos(0.12) * 0.99), 0.011);
  }
  const merged = mergeLines(lineGeos);
  const lines = new THREE.Mesh(merged, ropeMat); lines.castShadow = true; rig.add(lines);
  object.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m !== dome) { m.castShadow = true; m.receiveShadow = true; } });

  let t = 0, landed = false, collapseT = -1, groundY = 0, smokeAcc = 0;
  const smokeAt = new THREE.Vector3();
  const drop: SupplyDrop = {
    object, speed: 3.2,
    get landed() { return landed; },
    place(pos, gy) { object.position.copy(pos); groundY = gy; landed = pos.y <= gy + 0.01; },
    update(dt) {
      t += dt;
      if (!landed) {
        object.position.y -= drop.speed * dt;
        if (object.position.y <= groundY) { object.position.y = groundY; landed = true; collapseT = 0; }
        // pendulum sway about the canopy + breathing canopy
        object.rotation.z = Math.sin(t * 0.9) * 0.045; object.rotation.x = Math.sin(t * 0.7 + 1) * 0.035;
        const br = 1 + Math.sin(t * 2.2) * 0.025;
        canopy.scale.set(br, 1 / br, br);
      } else if (collapseT >= 0 && collapseT < 1) {
        collapseT = Math.min(1, collapseT + dt / 1.8);
        const k = collapseT * collapseT * (3 - 2 * collapseT);
        object.rotation.set(0, object.rotation.y, 0);
        canopy.scale.set(1 + 0.25 * k, Math.max(0.12, 1 - 0.88 * k), 1 + 0.25 * k);
        canopy.position.set(k * 2.8, hemY - k * (hemY - 0.3), k * 1.2);
        canopy.rotation.z = -k * 0.9;
        lines.visible = k < 0.6;
      }
      // yellow marker smoke rising from the landing point (thicker once it has landed)
      if (fx?.markerSmoke) {
        smokeAt.set(object.position.x + 0.6, groundY + 0.2, object.position.z + 0.4);
        if (object.parent) { object.parent.updateWorldMatrix(true, false); smokeAt.applyMatrix4(object.parent.matrixWorld); }
        smokeAcc += dt * (landed ? 14 : 9);
        while (smokeAcc >= 1) { smokeAcc -= 1; fx.markerSmoke(smokeAt, landed ? 1.2 : 1); }
      }
    },
  };
  return drop;
}

function mergeLines(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0; for (const g of gs) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos: number[] = [], nor: number[] = [];
  for (const g of gs) {
    const x = g.index ? g.toNonIndexed() : g;
    pos.push(...(x.attributes.position.array as Float32Array)); nor.push(...(x.attributes.normal.array as Float32Array));
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  void n;
  return m;
}
