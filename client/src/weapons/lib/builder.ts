// PartBuilder: collects coloured geometry parts per material kind and merges them into as few meshes as possible
// (one draw call per material kind). Sub-builders become named pivot groups (slide, magazine, lid …).
import * as THREE from "three";
import { merge } from "./geo";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { mats, type Kind } from "./mats";

export interface Built { root: THREE.Group; meshes: THREE.Mesh[]; tris: number; pivots: Record<string, THREE.Group> }

interface Part { g: THREE.BufferGeometry; kind: Kind }

export class PartBuilder {
  private parts: Part[] = [];
  private subs: Array<{ name: string; pivot: THREE.Vector3; b: PartBuilder }> = [];
  private extras: THREE.Object3D[] = [];
  private color = new THREE.Color();

  /** every part becomes an indexed geometry with position/normal/uv only, so merges never fail */
  private prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
    let geo = g.clone();
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.index) geo = mergeVertices(geo, 1e-6);
    if (geo.groups.length) geo.clearGroups();
    return geo;
  }

  /** add geometry with a flat colour (sRGB hex), material kind, and optional transform */
  add(g: THREE.BufferGeometry, color: string | number, kind: Kind = "gloss", m?: THREE.Matrix4): this {
    const geo = this.prep(g);
    if (m) geo.applyMatrix4(m);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    this.color.set(color as THREE.ColorRepresentation);
    for (let i = 0; i < n; i++) { col[i * 3] = this.color.r; col[i * 3 + 1] = this.color.g; col[i * 3 + 2] = this.color.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    // strip attributes merge would choke on
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    this.parts.push({ g: geo, kind });
    return this;
  }

  /** add a colour gradient along an axis (for banana skins: deeper yellow near the stem, lighter at the belly) */
  addGradient(g: THREE.BufferGeometry, from: string, to: string, axis: "x" | "y" | "z", kind: Kind = "gloss", m?: THREE.Matrix4): this {
    const geo = this.prep(g);
    if (m) geo.applyMatrix4(m);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const p = geo.attributes.position as THREE.BufferAttribute, n = p.count;
    const col = new Float32Array(n * 3);
    const a = new THREE.Color(from), b = new THREE.Color(to), c = new THREE.Color();
    const lo = bb.min[axis], hi = bb.max[axis], span = Math.max(1e-6, hi - lo);
    for (let i = 0; i < n; i++) {
      const v = (p[axis === "x" ? "getX" : axis === "y" ? "getY" : "getZ"](i) - lo) / span;
      c.copy(a).lerp(b, v);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) geo.deleteAttribute(k);
    this.parts.push({ g: geo, kind });
    return this;
  }

  /** add geometry with PER-VERTEX colours: paint(x, y, z) → sRGB colour, evaluated after the transform */
  addPainted(g: THREE.BufferGeometry, paint: (p: THREE.Vector3, i: number) => THREE.Color, kind: Kind = "gloss", m?: THREE.Matrix4): this {
    const geo = this.prep(g);
    if (m) geo.applyMatrix4(m);
    const p = geo.attributes.position as THREE.BufferAttribute, n = p.count, col = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { const c = paint(v.fromBufferAttribute(p, i), i); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) geo.deleteAttribute(k);
    this.parts.push({ g: geo, kind });
    return this;
  }

  /** add an already vertex-coloured geometry (another PartBuilder's merged mesh) keeping its colours — e.g. a built item
   *  merged into a bigger prop, so it costs no draw call of its own (the Banana Stand's display) */
  addColored(g: THREE.BufferGeometry, kind: Kind = "gloss", m?: THREE.Matrix4): this {
    const col = g.attributes.color as THREE.BufferAttribute | undefined;
    if (!col) return this.add(g, "#ffffff", kind, m);
    const c = new THREE.Color();
    // (an index keeps prep() from welding vertices: the colours are read back by vertex index)
    const src = g.index ? g : (() => { const h = g.clone(); h.setIndex([...Array(h.attributes.position.count).keys()]); return h; })();
    return this.addPainted(src, (_p, i) => c.setRGB(col.getX(i), col.getY(i), col.getZ(i), THREE.LinearSRGBColorSpace), kind, m);
  }

  /** a ready-made object (decal plane, textured mesh, light) kept as-is under the root */
  object(o: THREE.Object3D): this { this.extras.push(o); return this; }

  /** a child builder whose parts become a Group pivoting at `pivot` (author its geometry in the PARENT frame) */
  sub(name: string, pivot: [number, number, number] = [0, 0, 0]): PartBuilder {
    const b = new PartBuilder();
    this.subs.push({ name, pivot: new THREE.Vector3(...pivot), b });
    return b;
  }

  build(opts: { shadows?: boolean; name?: string } = {}): Built {
    const { shadows = true, name = "part" } = opts;
    const M = mats();
    const root = new THREE.Group(); root.name = name;
    const meshes: THREE.Mesh[] = [];
    const pivots: Record<string, THREE.Group> = {};
    let tris = 0;
    const byKind = new Map<Kind, THREE.BufferGeometry[]>();
    for (const p of this.parts) { if (!byKind.has(p.kind)) byKind.set(p.kind, []); byKind.get(p.kind)!.push(p.g); }
    for (const [kind, list] of byKind) {
      const g = merge(list);
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M.byKind(kind));
      mesh.name = `${name}:${kind}`;
      mesh.castShadow = shadows && kind !== "emissive" && kind !== "glass";
      mesh.receiveShadow = shadows;
      root.add(mesh); meshes.push(mesh);
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
    for (const o of this.extras) root.add(o);
    for (const s of this.subs) {
      const built = s.b.build({ shadows, name: `${name}/${s.name}` });
      const grp = built.root;
      grp.position.copy(s.pivot);
      // child geometry was authored in the parent frame: pull it back by the pivot
      for (const m of built.meshes) m.geometry.translate(-s.pivot.x, -s.pivot.y, -s.pivot.z);
      for (const o of grp.children) if (!(o as THREE.Mesh).isMesh) o.position.sub(s.pivot);
      root.add(grp); meshes.push(...built.meshes); tris += built.tris;
      pivots[s.name] = grp;
      Object.assign(pivots, built.pivots);
    }
    return { root, meshes, tris, pivots };
  }
}
