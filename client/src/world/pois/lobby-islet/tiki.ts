// Tiki bar: plank floor, heavy square posts + beams, a big hip roof of LAYERED thatch strips (shingled rows,
// shaggy double fringe, bound ridge/hip rolls, bamboo rafters under an opaque underlayer), a board-clad counter with
// bamboo trim, back shelving with bottles, drinks + bananas on the counter, a string of warm bulbs and coloured paper
// lanterns (emissive), hanging banana bunches, a BANANA CO. sign. Stools are separate layout items.
import * as THREE from "three";
import type { LobbyItem } from "../../../../../shared/pois/lobby-islet";
import { DIM } from "../../../../../shared/pois/lobby-islet";
import { M, cbox, cyl, lathe, tube, grid } from "./kit";
import type { UVRect } from "./paint";
import { type LK, itemM, groundAt, WOOD, ropeWrap, ropeAlong, bananaBunch, bananaPile, lanternGeo, bulbGeo, TINT } from "./lk";

export const sub = (r: UVRect, i: number, n: number): UVRect => {
  const w = (r.u1 - r.u0) / n;
  return { u0: r.u0 + w * i + w * 0.08, u1: r.u0 + w * (i + 1) - w * 0.08, v0: r.v0, v1: r.v1, mu: (r.mu / n) * 0.84, mv: r.mv };
};

export function buildTiki(k: LK, it: LobbyItem) {
  const W = it.w ?? 9.6, D = it.l ?? 5.6, T = DIM.tiki;
  const base = itemM(it);
  const at = (m: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(base, m);
  const add = (key: string, g: THREE.BufferGeometry, m: THREE.Matrix4, tint: string, boost = 1) => k.b.add(key, g, at(m), tint, boost);
  const gw = k.at.A.uv("grainWarm"), gd = k.at.A.uv("grainDark"), eg = k.at.A.uv("endgrain"), bam = k.at.A.uv("bamboo");
  const r = k.r;

  // ---------------------------------------------------------------- floor deck (raised over the sloping sand)
  // The deck base (item origin) sits at the highest sand under the footprint; the deck runs from the back wall to a
  // porch in front of the counter (stools stand on it). Skirt boards + piles drop to the live sand, steps at the front.
  const FW = W + 0.6, FD = D + 0.6, ft = T.floor, PZ = T.porch;
  const zBack = -FD / 2, zFront = FD / 2 + PZ, DL = zFront - zBack;
  const g0 = base.elements[13];
  const sandY = (x: number, z: number) => groundAt(k, it, x, z) - g0;      // item-local sand height (≤ 0)
  const rows = Math.floor(DL / 0.26);
  for (let i = 0; i < rows; i++) {
    const z = zBack + 0.13 + i * (DL / rows);
    const cuts = [-FW / 2, -FW / 2 + 3.2 + r() * 0.6, FW / 2 - 3.0 - r() * 0.6, FW / 2];
    for (let c = 0; c < 3; c++) {
      const x0 = cuts[c] + 0.004, x1 = cuts[c + 1] - 0.004;
      add("A", cbox(x1 - x0, 0.06, 0.235, 0.012, { grain: 0, rect: k.at.A.uv(`plank${Math.floor(r() * 8)}`), end: eg, off: [r() * Math.max(0, 3.9 - (x1 - x0)), 0] }), M((x0 + x1) / 2, ft - 0.03, z, 0, (r() - 0.5) * 0.008, 0), ["#8a5e40", "#7a5238", "#946848", "#6e4a34"][Math.floor(r() * 4)]);
    }
  }
  // skirt: vertical boards all round, each reaching down into the sand under it
  const skirt = (x: number, z: number, alongX: boolean) => {
    const sy = sandY(x, z) - 0.12, h = ft - 0.02 - sy;
    if (h < 0.05) return;
    add("A", cbox(alongX ? 0.2 : 0.045, h, alongX ? 0.045 : 0.2, 0.008, { grain: 1, rect: k.at.A.uv(`plank${Math.floor(r() * 8)}`), end: eg, off: [r() * 3, 0] }), M(x, sy + h / 2, z, 0, (r() - 0.5) * 0.02, 0), ["#6e4a34", "#5e3e2a", "#7a5238"][Math.floor(r() * 3)]);
  };
  for (let x = -FW / 2 + 0.1; x <= FW / 2 - 0.05; x += 0.205) { skirt(x, zFront + 0.03, true); skirt(x, zBack - 0.03, true); }
  for (let z = zBack + 0.1; z <= zFront - 0.05; z += 0.205) { skirt(-FW / 2 - 0.03, z, false); skirt(FW / 2 + 0.03, z, false); }
  // rim beams (fascia) + corner piles
  for (const zz of [zBack - 0.07, zFront + 0.07]) add("A", cbox(FW + 0.2, 0.16, 0.07, 0.012, { grain: 0, rect: gd, end: eg, off: [r(), r() * 0.5] }), M(0, ft - 0.1, zz), WOOD.deep);
  for (const s of [-1, 1]) add("A", cbox(0.07, 0.16, DL + 0.2, 0.012, { grain: 2, rect: gd, end: eg, off: [r(), r() * 0.5] }), M(s * (FW / 2 + 0.07), ft - 0.1, (zBack + zFront) / 2), WOOD.deep);
  for (const sx of [-1, 1]) for (const zz of [zBack, zFront]) {
    const x = sx * (FW / 2 + 0.02), sy = sandY(x, zz) - 0.3;
    add("A", cyl(0.11, 0.12, ft - sy, 10, 0.02, { rect: gd, u: "along", cap: eg, off: [r(), r() * 0.3] }), M(x, sy, zz), "#6e4a30");
  }
  // steps up to the porch at the front (right half, where the kongs walk in from the plaza)
  {
    const stepX = W / 2 - 1.6, rise = ft - sandY(stepX, zFront + 0.4);
    const n = Math.max(0, Math.round(rise / 0.2));
    for (let i = 0; i < n; i++) {
      const y = ft - (i + 1) * (rise / (n + 0)), zz = zFront + 0.2 + i * 0.3;
      const sy = sandY(stepX, zz + 0.15) - 0.1;
      add("A", cbox(2.2, 0.06, 0.3, 0.012, { grain: 0, rect: k.at.A.uv(`plank${Math.floor(r() * 8)}`), end: eg, off: [r() * 1.5, 0] }), M(stepX, y + 0.03 + (rise / n) * 0.0, zz + 0.12), "#8a5e40");
      for (const s of [-1, 1]) add("A", cbox(0.06, Math.max(0.05, y - sy), 0.3, 0.008, { grain: 1, rect: gd, end: eg }), M(stepX + s * 1.07, (y + sy) / 2, zz + 0.12), WOOD.deep);
    }
  }

  // ---------------------------------------------------------------- posts + beams
  const PH = T.postH, px = [-W / 2 + 0.15, -W / 6, W / 6, W / 2 - 0.15], pz = [D / 2 - 0.15, -D / 2 + 0.15];
  for (const z of pz) for (const x of px) {
    add("A", cbox(0.26, PH, 0.26, 0.03, { grain: 1, rect: gd, end: eg, off: [r() * 0.8, r() * 0.7] }), M(x, PH / 2, z, 0, (r() - 0.5) * 0.03, 0), "#8a5e3e");
    if (z > 0) ropeWrap(k, at(M(x, 0, z, 0, 0, 0, [1.35, 1, 1.35])), 0.14, PH - 0.62, 3, 0.022, 0.05);
  }
  const by = PH - 0.11;
  for (const z of pz) add("A", cbox(W + 0.7, 0.24, 0.26, 0.03, { grain: 0, rect: gd, end: eg, off: [r(), r() * 0.5] }), M(0, by, z), "#7a5236");
  for (const x of [px[0], px[3]]) add("A", cbox(0.24, 0.22, D + 0.5, 0.03, { grain: 2, rect: gd, end: eg, off: [r(), r() * 0.5] }), M(x, by + 0.02, 0), "#7a5236");
  // knee braces at the front posts
  for (const x of px) {
    for (const sx of x < -W / 2 + 0.5 ? [1] : x > W / 2 - 0.5 ? [-1] : [-1, 1]) {
      add("A", cbox(0.1, 0.8, 0.12, 0.012, { grain: 1, rect: gd, end: eg, off: [r(), r() * 0.5] }), M(x + sx * 0.33, by - 0.42, pz[0], 0, 0, sx * 0.72), "#6e4a30");
    }
  }

  // ---------------------------------------------------------------- roof (hip) — layered thatch
  const ov = 1.05, ye = 2.62, yr = ye + 2.35;
  const RW = W + 2 * ov, RD = D + 2 * ov, hr = (RW - RD) / 2;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  type Face = { e0: THREE.Vector3; e1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3 };
  const faces: Face[] = [
    { e0: V(-RW / 2, ye, RD / 2), e1: V(RW / 2, ye, RD / 2), t0: V(-hr, yr, 0), t1: V(hr, yr, 0) },     // front
    { e0: V(RW / 2, ye, -RD / 2), e1: V(-RW / 2, ye, -RD / 2), t0: V(hr, yr, 0), t1: V(-hr, yr, 0) },   // back
    { e0: V(RW / 2, ye, RD / 2), e1: V(RW / 2, ye, -RD / 2), t0: V(hr, yr, 0), t1: V(hr, yr, 0) },      // right (hip)
    { e0: V(-RW / 2, ye, -RD / 2), e1: V(-RW / 2, ye, RD / 2), t0: V(-hr, yr, 0), t1: V(-hr, yr, 0) },  // left (hip)
  ];
  const th = k.at.B.uv("thatch");
  const tmp = new THREE.Vector3();
  for (const f of faces) {
    const P = (s: number, x: number, out: THREE.Vector3) => out.copy(f.e0).lerp(f.e1, x).lerp(tmp.copy(f.t0).lerp(f.t1, x), s);
    const n = new THREE.Vector3().subVectors(f.e1, f.e0).cross(new THREE.Vector3().subVectors(f.t0, f.e0)).normalize();
    if (n.y < 0) n.negate();
    const out = new THREE.Vector3(n.x, 0, n.z).normalize();
    const slant = f.e0.distanceTo(tmp.copy(f.t0).lerp(f.t1, 0.5).lerp(f.e0.clone().lerp(f.e1, 0.5), 0) );
    const S = new THREE.Vector3().addVectors(f.e0, f.e1).multiplyScalar(0.5).distanceTo(new THREE.Vector3().addVectors(f.t0, f.t1).multiplyScalar(0.5));
    void slant;
    // underlayer (faces down, visible from inside the bar) + bamboo rafters
    {
      const g = new THREE.BufferGeometry();
      const q = [P(0, 0, new THREE.Vector3()), P(0, 1, new THREE.Vector3()), P(1, 1, new THREE.Vector3()), P(1, 0, new THREE.Vector3())].map((v) => v.addScaledVector(n, -0.02));
      g.setAttribute("position", new THREE.Float32BufferAttribute(q.flatMap((v) => [v.x, v.y, v.z]), 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(q.flatMap(() => [-n.x, -n.y, -n.z]), 3));
      const u0 = th.u0, u1 = th.u1, v0 = th.v0 + (th.v1 - th.v0) * 0.5, v1 = th.v1;
      g.setAttribute("uv", new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
      g.setIndex([0, 2, 1, 0, 3, 2]);
      add("B", g, new THREE.Matrix4(), "#9a7a4e");
      const nr = f.t0.distanceTo(f.t1) > 0.1 ? 5 : 2;
      for (let i = 0; i <= nr; i++) {
        const x = i / nr;
        const a = P(0.02, x, new THREE.Vector3()).addScaledVector(n, -0.08), b = P(0.98, x, new THREE.Vector3()).addScaledVector(n, -0.08);
        const len = a.distanceTo(b);
        const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0)).setPosition(a);
        add("A", cyl(0.05, 0.045, len, 8, 0.01, { rect: bam, u: "along", off: [r(), r() * 0.1] }), new THREE.Matrix4().multiplyMatrices(m, M(0, 0, 0, -Math.PI / 2, 0, 0)), "#e6c88a");
      }
    }
    // shingled rows of thatch strips, eave → ridge
    const ROWS = 11;
    for (let i = 0; i < ROWS; i++) {
      const sb = (i / ROWS) * 0.97, st = Math.min(1.0, sb + 0.2);
      const widthB = P(sb, 0, new THREE.Vector3()).distanceTo(P(sb, 1, new THREE.Vector3()));
      const pieces = Math.max(1, Math.ceil(widthB / 3.4));
      for (let pc = 0; pc < pieces; pc++) {
        const xa = pc / pieces - (pc === 0 ? 0.03 : 0.01), xb = (pc + 1) / pieces + (pc === pieces - 1 ? 0.03 : 0.01);
        const stripLen = (st - sb) * S;
        const wmid = widthB * (xb - xa);
        const nx = Math.max(4, Math.ceil(wmid / 0.35)), ny = 3;
        const seed = r() * 100;
        const g = grid(wmid, stripLen, nx, ny, th, (x, y, o) => {
          const xf = xa + (x / wmid) * (xb - xa), t = y / stripLen;
          P(sb + (st - sb) * t, xf, o);
          const bump = 0.05 + i * 0.006 + (1 - t) * 0.075 + Math.sin(xf * 23 + seed) * 0.012 + Math.sin(xf * 57 + seed * 2) * 0.008;
          o.addScaledVector(n, bump);
        }, [r() * 0.5, 0]);
        add("Bcut", g, new THREE.Matrix4(), ["#f2dcae", "#ead3a2", "#f6e2b8"][i % 3]);
      }
    }
    // shaggy double fringe hanging below the eave
    for (let layer = 0; layer < 2; layer++) {
      const widthB = P(0, 0, new THREE.Vector3()).distanceTo(P(0, 1, new THREE.Vector3()));
      const pieces = Math.max(1, Math.ceil(widthB / 3.4));
      for (let pc = 0; pc < pieces; pc++) {
        const xa = pc / pieces - (pc === 0 ? 0.035 : 0.01), xb = (pc + 1) / pieces + (pc === pieces - 1 ? 0.035 : 0.01);
        const wmid = widthB * (xb - xa), L = 0.85, drop = 0.36 + layer * 0.08, seed = r() * 50;
        const g = grid(wmid, L, Math.max(4, Math.ceil(wmid / 0.3)), 4, th, (x, y, o) => {
          const xf = xa + (x / wmid) * (xb - xa), t = y / L;
          if (t >= 0.45) P(((t - 0.45) / 0.55) * 0.12, xf, o).addScaledVector(n, 0.07 + layer * 0.03);
          else {
            const hang = (0.45 - t) / 0.45;
            P(0, xf, o).addScaledVector(n, 0.07 + layer * 0.03).addScaledVector(out, hang * (0.12 + layer * 0.05)).add(tmp.set(0, -hang * drop - Math.sin(xf * 31 + seed) * 0.03 * hang, 0));
          }
        }, [r() * 0.5, 0]);
        add("Bcut", g, new THREE.Matrix4(), layer ? "#e8cf9c" : "#f4e0b4");
      }
    }
  }
  // ridge + hip rolls with rope bindings
  const roll = (a: THREE.Vector3, b: THREE.Vector3, rad: number) => {
    const len = a.distanceTo(b), pieces = Math.max(1, Math.ceil(len / 3.4));
    for (let p = 0; p < pieces; p++) {
      const pa = a.clone().lerp(b, p / pieces), pb = a.clone().lerp(b, (p + 1) / pieces);
      const c = new THREE.LineCurve3(pa, pb);
      add("B", tube(c, 6, rad, 10, { rect: th, aroundM: 0.5, off: [r() * 0.5, 0.48], caps: true }, new THREE.Vector3(0, 1, 0)), new THREE.Matrix4(), "#d8bc86");
    }
    const bands = Math.floor(len / 0.75);
    for (let i = 1; i < bands; i++) {
      const c = a.clone().lerp(b, i / bands), dir = b.clone().sub(a).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 20; j++) { const an = (j / 20) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(an) * (rad + 0.012), 0, Math.sin(an) * (rad + 0.012)).applyQuaternion(q).add(c)); }
      ropeAlong(k, new THREE.CatmullRomCurve3(pts, true), 0.016, at(new THREE.Matrix4()), TINT.rope, 5);
    }
  };
  const lift = 0.2;
  roll(V(-hr - 0.05, yr + lift * 0.6, 0), V(hr + 0.05, yr + lift * 0.6, 0), 0.2);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = V(sx * (RW / 2 + 0.04), ye + 0.12, sz * (RD / 2 + 0.04)), b = V(sx * hr, yr + 0.12, 0);
    roll(a, b, 0.15);
  }
  // finial on the ridge ends: carved post knobs
  for (const sx of [-1, 1]) add("A", lathe([[0.001, 0], [0.09, 0.02], [0.1, 0.22], [0.14, 0.3], [0.08, 0.42], [0.001, 0.46]], 10, { rect: gd, u: "along", fit: "v" }, 0.9), M(sx * (hr + 0.12), yr + 0.18, 0), "#6e4a30");

  // ---------------------------------------------------------------- counter
  const cz = D / 2 - 0.55, cx0 = -W / 2 + 0.35, cx1 = W / 2 - 1.25, CH = T.counterH, CD = T.counterD;
  const cw = cx1 - cx0, ccx = (cx0 + cx1) / 2;
  // vertical boards on the front face
  const nb = Math.round(cw / 0.17);
  for (let i = 0; i < nb; i++) {
    const x = cx0 + (i + 0.5) * (cw / nb);
    add("A", cbox(cw / nb - 0.012, CH - 0.2, 0.04, 0.008, { grain: 1, rect: k.at.A.uv(`plank${Math.floor(r() * 8)}`), end: eg, off: [r() * 3, 0] }), M(x, 0.12 + (CH - 0.2) / 2 + 0.02, cz + CD / 2 - 0.02 + (r() - 0.5) * 0.01, 0, (r() - 0.5) * 0.02, 0), ["#8a5a3a", "#7c5034", "#94603e"][i % 3]);
  }
  // body, side panels, kick plinth, bamboo rails
  add("A", cbox(cw, CH - 0.2, CD - 0.1, 0.01, { grain: 0, rect: gd, end: eg }), M(ccx, 0.12 + (CH - 0.2) / 2, cz - 0.03), "#4a3020");
  for (const x of [cx0, cx1]) add("A", cbox(0.06, CH - 0.1, CD, 0.012, { grain: 1, rect: gd, end: eg, off: [r(), 0] }), M(x, 0.12 + (CH - 0.1) / 2, cz), "#6e4a30");
  add("A", cbox(cw + 0.1, 0.12, 0.08, 0.012, { grain: 0, rect: gd, end: eg }), M(ccx, 0.18, cz + CD / 2 + 0.01), "#4a3020");
  for (const y of [0.34, CH - 0.2]) add("A", cyl(0.035, 0.035, cw + 0.05, 8, 0.008, { rect: bam, u: "along", off: [r(), 0] }), M(cx0 - 0.02, 0.12 + y, cz + CD / 2 + 0.02, 0, 0, -Math.PI / 2), "#f0d494");
  // thick varnished top slab in 3 pieces
  const tx = [cx0 - 0.08, cx0 + cw * 0.36, cx0 + cw * 0.7, cx1 + 0.08];
  for (let i = 0; i < 3; i++) add("A", cbox(tx[i + 1] - tx[i] - 0.006, 0.08, CD + 0.14, 0.02, { grain: 0, rect: gw, end: eg, off: [r() * 0.5, r() * 0.2] }), M((tx[i] + tx[i + 1]) / 2, 0.12 + CH - 0.04 - 0.1 + 0.1, cz + 0.02), "#a86a40");
  const topY = 0.12 + CH;

  // ---------------------------------------------------------------- back bar: shelves, back boards, bottles
  const bz = -D / 2 + 0.38;
  for (let i = 0; i < Math.round((W - 1) / 0.2); i++) {
    const x = -W / 2 + 0.5 + (i + 0.5) * 0.2;
    add("A", cbox(0.19, 2.25, 0.035, 0.006, { grain: 1, rect: k.at.A.uv(`plank${Math.floor(r() * 8)}`), end: eg, off: [r() * 3, 0] }), M(x, 0.12 + 1.15, bz - 0.2), ["#c89468", "#b8845a", "#d09c70"][i % 3], 1.5);
  }
  const shelfY = [0.95, 1.42, 1.9];
  for (const y of shelfY) {
    for (const [x0, x1] of [[-W / 2 + 0.55, -0.05], [0.05, W / 2 - 0.55]]) {
      add("A", cbox(x1 - x0, 0.045, 0.32, 0.01, { grain: 0, rect: gw, end: eg, off: [r(), r() * 0.5] }), M((x0 + x1) / 2, 0.12 + y, bz), "#e0a878", 1.5);
    }
  }
  for (const x of [-W / 2 + 0.52, 0, W / 2 - 0.52]) add("A", cbox(0.06, 1.2, 0.32, 0.01, { grain: 1, rect: gd, end: eg, off: [r(), 0] }), M(x, 0.12 + 1.42, bz), "#5e3e2a");
  const bottleProf = (h: number, w: number): Array<[number, number]> => [[0.001, 0], [w, 0.004], [w, h * 0.58], [w * 0.8, h * 0.68], [w * 0.36, h * 0.78], [w * 0.32, h * 0.95], [w * 0.38, h * 0.97], [w * 0.36, h], [0.001, h]];
  const bot = k.at.B.uv("bottle");
  const bottle = (m: THREE.Matrix4, kind: number, h = 0.28 + r() * 0.08, w = 0.036 + r() * 0.01) => add("B", lathe(bottleProf(h, w), 10, { rect: sub(bot, kind, 4), fit: "both" }, 0.5), m, "#ffffff");
  for (const y of shelfY) {
    let x = -W / 2 + 0.7;
    while (x < W / 2 - 0.7) {
      if (Math.abs(x) > 0.12 && r() < 0.8) bottle(M(x, 0.12 + y + 0.022, bz + (r() - 0.5) * 0.12), Math.floor(r() * 4));
      x += 0.1 + r() * 0.12;
    }
  }
  // counter-top goods: bottles, coconut cups with straws + umbrellas, a banana bunch, a tip jar
  for (let i = 0; i < 5; i++) bottle(M(cx0 + 0.6 + i * 1.5 + r() * 0.5, topY, cz - 0.1 + (r() - 0.5) * 0.2), Math.floor(r() * 4));
  const cup = (x: number, z: number) => {
    const m = M(x, topY, z, 0, r() * 6, 0);
    add("B", lathe([[0.001, 0], [0.05, 0.005], [0.075, 0.04], [0.082, 0.08], [0.078, 0.09], [0.001, 0.09]], 12, { rect: k.at.B.uv("trunk"), fit: "both" }, 0.5), m, "#8a6040");
    add("B", lathe([[0.001, 0.084], [0.072, 0.084], [0.001, 0.086]], 12, { rect: sub(bot, 1, 4), fit: "both" }, 2), m, "#ffd9a0");
    add("A", cyl(0.005, 0.005, 0.2, 5, 0, { rect: k.at.A.uv("paintMetal") }), new THREE.Matrix4().multiplyMatrices(m, M(0.03, 0.05, 0, 0, 0, -0.35)), "#ff6f9a");
    add("B", lathe([[0.001, 0], [0.09, -0.03], [0.001, -0.031]], 7, { rect: k.at.B.uv("fabric"), fit: "both" }, 2), new THREE.Matrix4().multiplyMatrices(m, M(-0.03, 0.26, 0.01, 0.2, 0, 0.3)), ["#ff5a7a", "#3ad0c0", "#ffcf3a"][Math.floor(r() * 3)]);
  };
  cup(cx0 + 1.3, cz + 0.05); cup(cx0 + 3.7, cz); cup(cx0 + 5.4, cz + 0.08); cup(cx0 + 7.0, cz - 0.02);
  bananaPile(k, at(M(cx0 + 2.3, topY, cz - 0.05, 0, 0.4, 0)), 3, 0.15);
  // BANANA CO. sign board on the front beam
  add("B", cbox(2.0, 0.5, 0.06, 0.02, { grain: 0, rect: k.at.B.uv("sign") }), M(0, by - 0.12, D / 2 + 0.02 - 0.15 + 0.16), "#ffffff");
  for (const sx of [-0.85, 0.85]) add("A", cyl(0.012, 0.012, 0.18, 6, 0, { rect: k.at.A.uv("metal") }), M(sx, by + 0.02, D / 2 + 0.03), TINT.iron);

  // ---------------------------------------------------------------- lights: bulbs + paper lanterns on a sagging wire
  const wireY = by - 0.16, fz = D / 2 - 0.15 + 0.17;
  const cols = ["#ff4a2a", "#46d66a", "#2ad0d8", "#ffd23a", "#ff8a2a", "#ff4a8a"];
  const spans: Array<[number, number, number]> = [[-W / 2 - 0.2, -W / 6, 0.26], [-W / 6, W / 6, 0.22], [W / 6, W / 2 + 0.2, 0.26]];
  let li = 0;
  for (const [x0, x1, sag] of spans) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, wireY - sag * 4 * t * (1 - t), fz)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    add("A", tube(curve, 24, 0.007, 4, { rect: k.at.A.uv("paintMetal") }), new THREE.Matrix4(), "#202022");
    const n = Math.round((x1 - x0) / 0.42);
    for (let i = 1; i < n; i++) {
      const t = i / n, p = curve.getPointAt(t);
      if (li % 3 === 1) {
        const c = cols[(li >> 1) % cols.length];
        add("A", cyl(0.004, 0.004, 0.12, 4, 0, { rect: k.at.A.uv("paintMetal") }), M(p.x, p.y - 0.12, p.z), "#202022");
        add("glow", lanternGeo(k, 0.3, 0.12), M(p.x, p.y - 0.42, p.z, 0, r() * 6, 0), c, 1.9);
        add("A", cyl(0.05, 0.04, 0.025, 8, 0.004, { rect: k.at.A.uv("paintMetal") }), M(p.x, p.y - 0.13, p.z), "#2a2522");
      } else {
        add("A", cyl(0.014, 0.014, 0.05, 6, 0.003, { rect: k.at.A.uv("paintMetal") }), M(p.x, p.y - 0.05, p.z), "#2a2522");
        add("glow", bulbGeo(k, 0.048), M(p.x, p.y - 0.05, p.z), "#ffcf7a", 3.2);
      }
      li++;
    }
  }
  // hanging banana bunches from the front beam
  bananaBunch(k, at(M(-W / 2 + 1.5, by - 0.1, fz + 0.05, 0, 0.5, 0)), 6, 1.7);
  bananaBunch(k, at(M(W / 6 + 1.1, by - 0.1, fz + 0.05, 0, 2.1, 0)), 5, 1.5);
  for (const x of [-W / 2 + 1.5, W / 6 + 1.1]) ropeAlong(k, new THREE.LineCurve3(new THREE.Vector3(x, by - 0.1, fz + 0.05), new THREE.Vector3(x, by + 0.12, fz)), 0.012, at(new THREE.Matrix4()));
}

export function buildStool(k: LK, it: LobbyItem) {
  const base = itemM(it, undefined, (it.v ?? 0) * 0.9);
  const at = (m: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(base, m);
  const gw = k.at.A.uv("grainWarm"), gd = k.at.A.uv("grainDark");
  const H = 0.74;
  k.b.add("A", cyl(0.21, 0.2, 0.065, 16, 0.02, { rect: gw, cap: gw, capMetres: true, off: [k.r() * 2, k.r() * 0.5] }), at(M(0, H - 0.065, 0)), "#b07a50");
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4, lean = 0.1;
    const leg = cyl(0.028, 0.026, H - 0.04, 8, 0.006, { rect: gd, u: "along", off: [k.r(), 0] });
    k.b.add("A", leg, at(M(Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19, Math.sin(a) * lean, 0, -Math.cos(a) * lean)), "#8a5e3e");
  }
  // rungs
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2 + 0.4, a1 = ((i + 1) / 4) * Math.PI * 2 + 0.4, R = 0.205;
    const p0 = new THREE.Vector3(Math.cos(a0) * R, 0.26, Math.sin(a0) * R), p1 = new THREE.Vector3(Math.cos(a1) * R, 0.26, Math.sin(a1) * R);
    const m = new THREE.Matrix4().lookAt(p0, p1, new THREE.Vector3(0, 1, 0)).setPosition(p0);
    k.b.add("A", cyl(0.016, 0.016, p0.distanceTo(p1), 6, 0.004, { rect: gd, u: "along" }), at(new THREE.Matrix4().multiplyMatrices(m, M(0, 0, 0, -Math.PI / 2))), "#7a5236");
  }
}
