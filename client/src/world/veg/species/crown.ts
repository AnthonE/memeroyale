// Volumetric 3D crowns: a crown is a set of leaf CLUMPS; each clump is
//   • a lumpy closed HULL (displaced icosphere, flattened underside) textured with the dense leaf half of the atlas
//     (per-face planar UVs inside its fully opaque square — reads as deep leaves through the gaps, never sky), and
//   • a shell of fixed-orientation leaf-SPRAY cards on the hull: ~55 % lie on the surface (V-folded along the twig),
//     the rest stick out RADIALLY (twig base on the hull, leaves reaching out) — they build a ragged 3D silhouette that
//     parallaxes from every azimuth and from above (no card faces the camera: nothing turns with the view).
// Every vertex of a clump (hull + cards) carries the clump's SPHERICAL normal blended with the whole crown's ellipsoid
// normal (the "bent normals" of shipped stylised trees): the clump shades as one volume — lime sun side, deep
// blue-green shade side and underside — and the material keeps that normal on both faces (foliage-material noFlip).
// Wind: hull vertices move with their clump centre (aCard.xyz), cards with their own centre + flutter.
import * as THREE from "three";
import { mulberry32 } from "../../../../../shared/world/noise";

export interface Clump { p: THREE.Vector3; r: number; /** hull subdivision override (small satellites: 0) */ hull?: number }

export interface CrownOpts {
  seed: number;
  /** crown ellipsoid (centre, horizontal / vertical radius) for the global normal blend and the AO ramp */
  c: THREE.Vector3; rx: number; ry: number;
  /** leaf cards per m² of clump surface */
  density: number;
  /** leaf card size range (m) */
  size: [number, number];
  /** fraction of cards sticking out radially (silhouette fringe) */
  radial?: number;
  /** icosphere subdivision of the hull (0 = 20 faces, 1 = 80, 2 = 320); -1 = no hull */
  hull?: number;
  /** hull radius as a fraction of the clump radius */
  hullK?: number;
  /** vertical squash of the clumps */
  squash?: number;
  /** darkest AO (underside / inner) */
  aoMin?: number;
  /** 0..1: clump sphere normal (1) vs crown ellipsoid normal (0) */
  lobeNormal?: number;
  /** V-fold of surface cards (radians) */
  fold?: number;
  /** atlas halves: cards / hull (0 = left, 1 = right) */
  cardAtlas?: number; hullAtlas?: number;
  /** the hull's opaque texture square in card-local uv (centre u, v, half size) */
  hullUV?: [number, number, number];
  /** flutter weight of the cards */
  bend?: number;
  /** skip cards whose direction points into the crown core below this dot (hidden anyway) */
  hide?: number;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

class Buf {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; bend: number[] = []; phase: number[] = []; card: number[] = []; atlas: number[] = [];
  idx: number[] = [];
  get n() { return this.pos.length / 3; }
  v(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: [number, number, number], bend: number, phase: number, cc: THREE.Vector3, cs: number, at: number) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v); this.col.push(c[0], c[1], c[2]);
    this.bend.push(bend); this.phase.push(phase); this.card.push(cc.x, cc.y, cc.z, cs); this.atlas.push(at);
    return this.n - 1;
  }
  geo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aBend", new THREE.Float32BufferAttribute(this.bend, 1));
    g.setAttribute("aPhase", new THREE.Float32BufferAttribute(this.phase, 1));
    g.setAttribute("aCard", new THREE.Float32BufferAttribute(this.card, 4));
    g.setAttribute("aAtlas", new THREE.Float32BufferAttribute(this.atlas, 1));
    g.setIndex(this.idx);
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

/** lumpy displacement of a unit direction (deterministic → shared icosphere vertices stay welded) */
function lump(d: THREE.Vector3, s: number): number {
  return 1 + 0.13 * Math.sin(d.x * 4.1 + s) * Math.sin(d.y * 3.3 + s * 1.7) * Math.sin(d.z * 4.7 + s * 0.6) + 0.07 * Math.sin(d.x * 9.3 + d.z * 7.1 + s * 2.3);
}

/** points on the unit sphere (Fibonacci), jittered */
function fib(n: number, rnd: () => number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(1 - y * y), th = i * 2.39996323 + rnd() * 0.6;
    out.push(new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr).add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.25)).normalize());
  }
  return out;
}

/**
 * Build one crown geometry from its clumps. Hull triangles come first in the index buffer (they fill depth before the
 * cards behind them are shaded), then the cards bottom-up.
 */
export function crownGeometry(clumps: Clump[], o: CrownOpts): THREE.BufferGeometry {
  const B = new Buf();
  const rnd = mulberry32(o.seed);
  const squash = o.squash ?? 0.82, aoMin = o.aoMin ?? 0.42, ln = o.lobeNormal ?? 0.7, hullK = o.hullK ?? 0.78;
  const [hu, hv, hs] = o.hullUV ?? [0.5, 0.45, 0.22];
  const cardAt = o.cardAtlas ?? 0, hullAt = o.hullAtlas ?? 1;
  const bendW = o.bend ?? 0.6;
  const C = o.c;
  /** blended lighting normal at a point on clump k (direction d from its centre) */
  const lightN = (cl: Clump, d: THREE.Vector3, out: THREE.Vector3) => {
    const e = new THREE.Vector3((cl.p.x + d.x * cl.r - C.x) / o.rx, (cl.p.y + d.y * cl.r - C.y) / o.ry + 0.2, (cl.p.z + d.z * cl.r - C.z) / o.rx).normalize();
    return out.copy(d).multiplyScalar(ln).addScaledVector(e, 1 - ln).normalize();
  };
  // (not noisy flat-valued topiary balls): the value is a SMOOTH big
  // shape — lit crown top ~1.0 down to ~0.45 under the crown, led by the height in the crown and the clump's own
  // up-facing side — and darkens into the creases where clumps meet (the dark gaps that separate 1–2 m clumps)
  const contact = (p: THREE.Vector3, self: Clump | null) => {
    let m = 1;
    for (const q of clumps) { if (q === self) continue; const g = (p.distanceTo(q.p) - q.r * hullK) / Math.max(0.3, q.r * 0.6); if (g < m) m = g; }
    return smooth(-0.2, 1, m);                         // 0 inside a neighbour's reach … 1 clear of it
  };
  const aoAt = (p: THREE.Vector3, n: THREE.Vector3, outer: number, k = 1, self: Clump | null = null): [number, number, number] => {
    const h = (p.y - C.y) / o.ry;
    const big = smooth(-0.85, 0.95, h * 0.6 + n.y * 0.42 + outer * 0.12);
    // (deep creases between the clumps —
    // the dark gaps that make 1–2 m clumps read — and a wider top-lit / underside value split)
    const a = (aoMin + (1 - aoMin) * big * big) * k * (0.48 + 0.52 * contact(p, self));
    return [a, a, a];
  };
  const tmpN = new THREE.Vector3();

  // ---- hulls
  if ((o.hull ?? 1) >= 0) {
    const icos = [0, 1, 2].map((dd) => new THREE.IcosahedronGeometry(1, dd));   // non-indexed: 3 verts per face
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fN = new THREE.Vector3(), t = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Vector3(), d = new THREE.Vector3();
    clumps.forEach((cl, ci) => {
      const P = icos[Math.min(o.hull ?? 1, cl.hull ?? 2)].attributes.position as THREE.BufferAttribute;
      const seed = ci * 1.37 + o.seed * 0.01, ph = rnd();
      const place = (v: THREE.Vector3, out: THREE.Vector3) => {
        d.copy(v).normalize();
        const k = lump(d, seed) * hullK * cl.r;
        out.set(d.x * k, d.y * k * squash, d.z * k);
        // flattened, slightly tucked underside (clumps sit on their branches, not on a ball's pole)
        const fl = -0.42 * cl.r;
        if (out.y < fl) out.y = fl + (out.y - fl) * 0.35;
        return out.add(cl.p);
      };
      for (let f = 0; f < P.count; f += 3) {
        a.fromBufferAttribute(P, f); b.fromBufferAttribute(P, f + 1); c.fromBufferAttribute(P, f + 2);
        const pa = place(a, new THREE.Vector3()), pb = place(b, new THREE.Vector3()), pc = place(c, new THREE.Vector3());
        // per-face planar uv inside the atlas' opaque square, random roll per face
        fN.copy(pb).sub(pa).cross(q.copy(pc).sub(pa)).normalize();
        t.set(0, 1, 0); if (Math.abs(fN.y) > 0.9) t.set(1, 0, 0);
        s.crossVectors(t, fN).normalize(); t.crossVectors(fN, s);
        const mid = pa.clone().add(pb).add(pc).multiplyScalar(1 / 3);
        const R = Math.max(pa.distanceTo(mid), pb.distanceTo(mid), pc.distanceTo(mid), 1e-3);
        // (a face maps ~55 % of the leaf-mass square — bigger, calmer leaves on the hull, less high-freq noise)
        const rot = rnd() * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot), sc = (hs / R) * 0.55;
        const ids: number[] = [];
        for (const [pv, dv] of [[pa, a], [pb, b], [pc, c]] as const) {
          q.copy(pv).sub(mid);
          const x = q.dot(s), y = q.dot(t);
          const u = hu + (x * cr - y * sr) * sc, v = hv + (x * sr + y * cr) * sc;
          d.copy(dv).normalize();
          const n = lightN(cl, d, tmpN);
          // the hull is the clump's inside: darker than the cards around it
          ids.push(B.v(pv, n, u, v, aoAt(pv, n, 0.2, 0.8, cl), 0.12, ph, cl.p, cl.r, hullAt));
        }
        B.idx.push(ids[0], ids[1], ids[2]);
      }
    });
    for (const g of icos) g.dispose();
  }

  // ---- leaf cards
  interface CardQ { y: number; ids: number[] }
  const cards: CardQ[] = [];
  const r = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), cc = new THREE.Vector3(), q = new THREE.Vector3();
  clumps.forEach((cl) => {
    const area = 4 * Math.PI * cl.r * cl.r * (0.5 + 0.5 * squash);
    const n = Math.max(6, Math.round(area * o.density));
    for (const d of fib(n, rnd)) {
      d.y *= squash; d.normalize();
      // hidden: facing into the crown core (the neighbouring clumps cover it)
      const toOut = new THREE.Vector3(cl.p.x - C.x, (cl.p.y - C.y) * 0.6 + o.ry * 0.25, cl.p.z - C.z);
      const outer = toOut.lengthSq() > 1e-4 ? d.dot(toOut.normalize()) : 1;
      if (outer < (o.hide ?? -0.55) && d.y < 0.5) continue;
      // underside: fewer cards (the hull carries it, and it is in shade)
      if (d.y < -0.5 && rnd() < 0.45) continue;
      const size = o.size[0] + rnd() * (o.size[1] - o.size[0]);
      const radial = rnd() < (o.radial ?? 0.45);
      const hk = lump(d, cl.r) * hullK * cl.r;
      const base = cl.p.clone().add(new THREE.Vector3(d.x * hk, d.y * hk * squash, d.z * hk));
      const ph = rnd();
      const nL = lightN(cl, d, new THREE.Vector3());
      const col = aoAt(base, nL, outer, 1, cl);
      // (small per-card tint jitter — ±8 % per card reads as noise; the value lives in the big gradient)
      const tint = 0.96 + rnd() * 0.08, tb = 0.95 + rnd() * 0.09;
      const colT: [number, number, number] = [col[0] * tint, col[1], col[2] * tb];
      const ids: number[] = [];
      if (radial) {
        // twig sticks out: card plane contains the (tilted) outward direction; stem at the hull surface
        w.copy(d).add(new THREE.Vector3(rnd() - 0.5, rnd() * 0.5, rnd() - 0.5).multiplyScalar(0.7)).normalize();   // card "up" (base → tip)
        r.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(w).normalize();                                    // card "right"
        if (r.lengthSq() < 0.5) r.set(1, 0, 0).cross(w).normalize();
        cc.copy(base).addScaledVector(d, -0.2 * size).addScaledVector(w, size * 0.38);
        const corners: Array<[number, number]> = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
        for (const [x, y] of corners) {
          q.copy(cc).addScaledVector(r, x * size).addScaledVector(w, y * size);
          // tips a little lighter / more exposed than the base
          const k = 0.9 + 0.2 * (y + 0.5);
          ids.push(B.v(q, nL, x + 0.5, y + 0.5, [colT[0] * k, colT[1] * k, colT[2] * k], bendW * (0.35 + 0.65 * (y + 0.5)), ph, cc, size, cardAt));
        }
        B.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
      } else {
        // surface card, V-folded along its twig (the fold ridge points out of the clump)
        const nn = d.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.8)).normalize();
        const roll = rnd() * Math.PI * 2;
        r.set(0, 1, 0); if (Math.abs(nn.y) > 0.95) r.set(1, 0, 0);
        r.cross(nn).normalize(); u.crossVectors(nn, r).normalize();
        const rr = r.clone().multiplyScalar(Math.cos(roll)).addScaledVector(u, Math.sin(roll));
        const uu = u.clone().multiplyScalar(Math.cos(roll)).addScaledVector(r, -Math.sin(roll));
        cc.copy(base).addScaledVector(d, size * 0.08);
        const fold = (o.fold ?? 0.45) * (0.6 + 0.8 * rnd());
        // 6 verts: left edge, ridge, right edge × bottom / top; the edges fall back behind the ridge by sin(fold)
        const back = Math.sin(fold) * size * 0.5, half = Math.cos(fold) * size * 0.5;
        const row = (y: number) => [-1, 0, 1].map((x) => {
          q.copy(cc).addScaledVector(rr, x * half).addScaledVector(uu, y * size).addScaledVector(nn, -Math.abs(x) * back);
          const k = 0.94 + 0.12 * (y + 0.5) + (x === 0 ? 0.04 : 0);
          return B.v(q, nL, x * 0.5 + 0.5, y + 0.5, [colT[0] * k, colT[1] * k, colT[2] * k], bendW * (0.25 + 0.5 * (y + 0.5) + 0.25 * Math.abs(x)), ph, cc, size, cardAt);
        });
        const b0 = row(-0.5), t0 = row(0.5);
        ids.push(...b0, ...t0);
        B.idx.push(b0[0], b0[1], t0[1], b0[0], t0[1], t0[0], b0[1], b0[2], t0[2], b0[1], t0[2], t0[1]);
      }
      cards.push({ y: base.y, ids });
    }
  });
  // cards bottom-up (players look at crowns from below / the side: the lower cards' depth rejects the hidden ones)
  // — the index buffer is rebuilt: hull first, then cards sorted by height
  const hullIdx = B.idx.slice(0, B.idx.length - cards.reduce((a, c) => a + (c.ids.length === 4 ? 6 : 12), 0));
  const order = cards.map((c, i) => [c.y, i] as const).sort((a, b) => a[0] - b[0]);
  const cardIdx: number[] = [];
  for (const [, i] of order) {
    const ids = cards[i].ids;
    if (ids.length === 4) cardIdx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    else { const [b0, b1, b2, t0, t1, t2] = ids; cardIdx.push(b0, b1, t1, b0, t1, t0, b1, b2, t2, b1, t2, t1); }
  }
  B.idx = hullIdx.concat(cardIdx);
  return B.geo();
}
