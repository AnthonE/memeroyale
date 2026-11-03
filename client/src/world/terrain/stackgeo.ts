// Sea stacks as UNIQUE sculpted meshes (no rectangular columns with square turf lids, no tiger-stripe
// tongues from a carved-normal field): each stack mass is built on the CPU as a closed surface — a tapering rounded
// section carved into COURSES of JOINTED BLOCKS (every block its own inset, rounded edges, a slightly tilted face),
// ~9–12 m eroded bulges, a wave-cut notch at the waterline and a rounded, gently domed top — then shaded with the real
// mesh normals (no finite-difference normal field → no hard N·L tongues). ~20 stacks on the island: unique geometry is
// cheap (≤ 40 k tris each near, ~2 k far).
//
// Contract with the colliders (shared/world/terrain-gen.ts terrainRockColliders, kind "stack"): the uncarved envelope is
// the instance box's rounded-rect section (corner STACK_CORNER × min(sx, sz)) inset by STACK_TAPER per metre of height;
// every carve term is an INSET of that envelope, the mean inset ≈ carveMean("stack") and the top stays within the box.
import * as THREE from "three";
import { mulberry32, Simplex2 } from "../../../../shared/world/noise";
import { ROCK_CARVE, STACK_CORNER, STACK_TAPER, type RockInstance } from "../../../../shared/world/terrain-gen";

/** perimeter of a rounded rectangle (half extents a, b, corner radius rc) sampled by arc length: point + outward normal */
function roundedRectAt(a: number, b: number, rc: number, s: number, out: { x: number; z: number; nx: number; nz: number }) {
  const la = 2 * (a - rc), lb = 2 * (b - rc), q = (Math.PI / 2) * rc;
  const segs = [lb, q, la, q, lb, q, la, q];
  // start at (+a, −(b − rc)) going along +z on the +x side, counter-clockwise seen from above (x right, z down)
  const L = segs.reduce((p, v) => p + v, 0);
  s = ((s % L) + L) % L;
  let k = 0; while (k < 7 && s > segs[k]) { s -= segs[k]; k++; }
  const t = segs[k] > 0 ? s / segs[k] : 0;
  const cx = a - rc, cz = b - rc;
  switch (k) {
    case 0: out.x = a; out.z = -cz + lb * t; out.nx = 1; out.nz = 0; break;
    case 1: { const an = t * Math.PI / 2; out.nx = Math.cos(an); out.nz = Math.sin(an); out.x = cx + rc * out.nx; out.z = cz + rc * out.nz; break; }
    case 2: out.x = cx - la * t; out.z = b; out.nx = 0; out.nz = 1; break;
    case 3: { const an = Math.PI / 2 + t * Math.PI / 2; out.nx = Math.cos(an); out.nz = Math.sin(an); out.x = -cx + rc * out.nx; out.z = cz + rc * out.nz; break; }
    case 4: out.x = -a; out.z = cz - lb * t; out.nx = -1; out.nz = 0; break;
    case 5: { const an = Math.PI + t * Math.PI / 2; out.nx = Math.cos(an); out.nz = Math.sin(an); out.x = -cx + rc * out.nx; out.z = -cz + rc * out.nz; break; }
    case 6: out.x = -cx + la * t; out.z = -b; out.nx = 0; out.nz = -1; break;
    default: { const an = 1.5 * Math.PI + t * Math.PI / 2; out.nx = Math.cos(an); out.nz = Math.sin(an); out.x = cx + rc * out.nx; out.z = -cz + rc * out.nz; }
  }
  return L;
}

/** smooth inset of a rounded block edge: 0 away from the edge, `r` at the edge (quarter-circle profile) */
const bevel = (d: number, r: number) => (d >= r ? 0 : r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))));
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

interface Course { y0: number; y1: number; joints: number[]; inset: number[]; tiltS: number[]; tiltY: number[]; tint: number[] }

/** sculpt one stack mass. lod 0 = near (≈ 0.3 m grid), 1 = far (≈ 1.2 m). Returns geometry in the instance's UNIT box
 * (−0.5..0.5 on every axis, like every other rock geometry) with normals, aCurv (convexity) and aTint (per-block tone). */
export function sculptStack(r: RockInstance, lod: 0 | 1 | 2, basalt = false): THREE.BufferGeometry {
  const seed = (Math.round(r.x * 13.1) * 73856093) ^ (Math.round(r.z * 7.7) * 19349663) ^ (Math.round(r.sy * 10) * 83492791);
  const rnd = mulberry32(seed >>> 0), nz = new Simplex2((seed >>> 0) % 100000);
  const C = ROCK_CARVE.stack;
  const a0 = r.sx / 2, b0 = r.sz / 2, rc0 = STACK_CORNER * Math.min(r.sx, r.sz), H = r.sy;
  const yBase = r.y - H / 2;                           // world y of the mass's foot
  const Rs = Math.min(1.7, 0.2 * Math.min(r.sx, r.sz));   // rounded shoulder radius at the top edge
  // lod 0 = HI (0.3 m grid, rounded block edges), 1 = far (1.2 m), 2 = MID (0.6 m, rounded edges)
  const ds = lod === 0 ? 0.3 : lod === 2 ? 0.6 : 1.2, dy = ds;
  const tmp = { x: 0, z: 0, nx: 0, nz: 0 };
  const L = roundedRectAt(a0, b0, rc0, 0, tmp);
  const nCol = Math.max(24, Math.round(L / ds));
  // ---- courses (bedding) + blocks (joints) — the carving pattern
  const courses: Course[] = [];
  {
    let y = 0;
    while (y < H) {
      const th = basalt ? 3.5 + 3 * rnd() : C.band * (0.65 + 0.75 * rnd());
      const c: Course = { y0: y, y1: Math.min(H, y + th), joints: [], inset: [], tiltS: [], tiltY: [], tint: [] };
      const s00 = rnd() * 4;
      let s = s00;
      while (s < s00 + L - 1.5) {
        c.joints.push(s);
        // most blocks stand proud, a few are deeply recessed (the target art's chunky, irregular block faces)
        c.inset.push(basalt ? 0.55 * rnd() : 1.05 * Math.pow(rnd(), 1.35));
        c.tiltS.push((rnd() - 0.5) * (basalt ? 0.1 : 0.35)); c.tiltY.push((rnd() - 0.5) * (basalt ? 0.1 : 0.3));
        c.tint.push(0.86 + 0.28 * rnd());
        s += basalt ? 1.1 + 0.9 * rnd() : C.jointSpacing * (0.55 + 0.9 * rnd());
      }
      courses.push(c); y = c.y1;
    }
  }
  const courseAt = (h: number) => { let k = 0; while (k < courses.length - 1 && h >= courses[k].y1) k++; return k; };
  /** block index + position inside it along the perimeter (wrapping) */
  const blockAt = (c: Course, s: number) => {
    const J = c.joints, n = J.length;
    s = ((s - J[0]) % L + L) % L + J[0];
    let b = n - 1; for (let k = 0; k < n - 1; k++) if (s < J[k + 1]) { b = k; break; }
    const s0 = J[b], s1 = b + 1 < n ? J[b + 1] : J[0] + L;
    return { b, s0, s1, s };
  };
  const bev = lod === 1 ? 0.0 : lod === 2 ? 0.45 : 0.32, blend = lod === 0 ? 0.28 : 0.6;
  /** perpendicular inset (m, ≥ 0) of the carved surface at arc length s, height h above the foot; `info` = [tint, groove] */
  const carve = (s: number, h: number, info: number[]) => {
    const k = courseAt(h), c = courses[k];
    const dyE0 = h - c.y0, dyE1 = c.y1 - h;
    const B = blockAt(c, s), n = c.joints.length;
    const dsE0 = B.s - B.s0, dsE1 = B.s1 - B.s, len = Math.max(0.5, B.s1 - B.s0);
    const blockI = (cc: Course, bi: number, sLocal: number, hLocal: number) =>
      cc.inset[bi] + cc.tiltS[bi] * (sLocal - 0.5) + cc.tiltY[bi] * (hLocal - 0.5) + Math.abs(cc.tiltS[bi]) * 0.5 + Math.abs(cc.tiltY[bi]) * 0.5;
    const hLoc = (h - c.y0) / Math.max(0.3, c.y1 - c.y0), sLoc = (B.s - B.s0) / len;
    let I = blockI(c, B.b, sLoc, hLoc);
    // soften the step to the neighbouring block / course (a narrow ramp instead of a one-cell cliff)
    if (dsE1 < blend) I = I + (blockI(c, (B.b + 1) % n, 0, hLoc) - I) * 0.5 * sstep(blend, 0, dsE1);
    if (dsE0 < blend) I = I + (blockI(c, (B.b - 1 + n) % n, 1, hLoc) - I) * 0.5 * sstep(blend, 0, dsE0);
    if (dyE1 < blend && k + 1 < courses.length) { const c2 = courses[k + 1], B2 = blockAt(c2, s); I = I + (blockI(c2, B2.b, (B2.s - B2.s0) / Math.max(0.5, B2.s1 - B2.s0), 0) - I) * 0.5 * sstep(blend, 0, dyE1); }
    if (dyE0 < blend && k > 0) { const c2 = courses[k - 1], B2 = blockAt(c2, s); I = I + (blockI(c2, B2.b, (B2.s - B2.s0) / Math.max(0.5, B2.s1 - B2.s0), 1) - I) * 0.5 * sstep(blend, 0, dyE0); }
    // rounded block edges → a groove along every joint and bedding plane
    const g = bev > 0 ? Math.max(bevel(Math.max(0, dsE0), bev), bevel(Math.max(0, dsE1), bev), bevel(Math.max(0, dyE0), bev * 0.9), bevel(Math.max(0, dyE1), bev * 1.1)) : 0;
    // eroded bulges (~9–12 m), always inward
    const e = 0.55 * sstep(0.25, 0.85, 0.5 + 0.5 * nz.noise(s / 9.5 + 11.3, h / 12.5));
    // wave-cut notch at the waterline
    const wy = yBase + h, notch = 0.55 * sstep(2.6, 0.6, wy) * sstep(-1.5, 0.2, wy);
    info[0] = c.tint[B.b] * (0.97 + 0.06 * Math.sin(k * 2.3 + seed));
    info[1] = g / Math.max(0.01, bev || 1);
    return I + g + e + notch;
  };

  // ---- side rings (foot → the start of the shoulder), then the shoulder quarter-circle, then the flat top rings
  const hTopSide = H - Rs;
  const nSide = Math.max(2, Math.round(hTopSide / dy));
  const pos: number[] = [], tint: number[] = [], groove: number[] = [];
  const info = [1, 0];
  const topOutline: Array<[number, number]> = [];
  for (let i = 0; i <= nSide; i++) {
    const h = hTopSide * i / nSide;
    // the tapered ENVELOPE: the rounded rect shrinks by the taper on every side (corner radius with it); the carving is
    // then a RADIAL inset toward the section centre (never folds over itself at the corners; ≥ the perpendicular inset's
    // outward bound, so the colliders — inset by the full mean — stay inside)
    const t = STACK_TAPER * h, a = a0 - t, b = b0 - t, rc = Math.max(0.6, rc0 - t);
    const Lh = roundedRectAt(a, b, rc, 0, tmp);
    for (let j = 0; j < nCol; j++) {
      const u = j / nCol;
      roundedRectAt(a, b, rc, u * Lh, tmp);
      const c = carve(u * L, h, info), rr = Math.hypot(tmp.x, tmp.z) || 1, k = Math.max(0.12, 1 - c / rr);
      const x = tmp.x * k, z = tmp.z * k;
      pos.push(x, h - H / 2, z); tint.push(info[0]); groove.push(info[1]);
      if (i === nSide) topOutline.push([x, z]);
    }
  }
  // shoulder: every top-outline point moves toward the section centre by Rs(1 − cos φ) and up by Rs sin φ
  const nSh = lod === 1 ? 2 : lod === 2 ? 3 : 5;
  const ringAt = (f: (j: number) => [number, number, number]) => { for (let j = 0; j < nCol; j++) { const [x, y, z] = f(j); pos.push(x, y, z); tint.push(1.0); groove.push(0); } };
  for (let q = 1; q <= nSh; q++) {
    const ph = (Math.PI / 2) * q / nSh;
    ringAt((j) => {
      const [x, z] = topOutline[j], rr = Math.hypot(x, z) || 1, k = Math.max(0.05, 1 - Rs * (1 - Math.cos(ph)) / rr);
      return [x * k, hTopSide + Rs * Math.sin(ph) - H / 2, z * k];
    });
  }
  // flat, gently undulating top (never above the instance box; ≤ 0.4 m dips so the collider's top slice stays inside)
  const nTop = lod === 1 ? 2 : lod === 2 ? 4 : 6;
  for (let q = 1; q <= nTop; q++) {
    const f = 1 - q / (nTop + 1);
    ringAt((j) => {
      const [x, z] = topOutline[j], rr = Math.hypot(x, z) || 1, k = Math.max(0.02, (1 - Rs / rr)) * f;
      const u = 0.2 + 0.2 * nz.noise(x * k / 3.1 + 5, z * k / 3.1);
      return [x * k, H / 2 - u * (1 - f * 0.2), z * k];
    });
  }
  const topC = pos.length / 3; pos.push(0, H / 2 - 0.25, 0); tint.push(1); groove.push(0);
  const botC = pos.length / 3; pos.push(0, -H / 2, 0); tint.push(1); groove.push(0);
  const nRings = nSide + 1 + nSh + nTop;
  const idx: number[] = [];
  for (let i = 0; i + 1 < nRings; i++) for (let j = 0; j < nCol; j++) {
    const a = i * nCol + j, b = i * nCol + (j + 1) % nCol, c = a + nCol, d = b + nCol;
    idx.push(a, c, b, b, c, d);
  }
  const last = (nRings - 1) * nCol;
  for (let j = 0; j < nCol; j++) { idx.push(last + j, topC, last + (j + 1) % nCol); idx.push(j, (j + 1) % nCol, botC); }
  // winding check (outward): the first side quad's normal must point away from the axis
  {
    const P = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    const p0 = P(idx[0]), p1 = P(idx[1]), p2 = P(idx[2]);
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
    if (n.x * p0.x + n.z * p0.z < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // convexity from the umbrella Laplacian (block edges +, joints / bedding grooves −) — the rock material's wear term
  {
    const p = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute, n = p.count;
    const acc = new Float32Array(n * 3), cnt = new Float32Array(n);
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
      const i0 = idx[t + e], i1 = idx[t + (e + 1) % 3];
      acc[i0 * 3] += p.getX(i1); acc[i0 * 3 + 1] += p.getY(i1); acc[i0 * 3 + 2] += p.getZ(i1); cnt[i0]++;
      acc[i1 * 3] += p.getX(i0); acc[i1 * 3 + 1] += p.getY(i0); acc[i1 * 3 + 2] += p.getZ(i0); cnt[i1]++;
    }
    const curv = new Float32Array(n), el = ds;
    for (let i = 0; i < n; i++) {
      if (!cnt[i]) continue;
      const dx = p.getX(i) - acc[i * 3] / cnt[i], dy2 = p.getY(i) - acc[i * 3 + 1] / cnt[i], dz = p.getZ(i) - acc[i * 3 + 2] / cnt[i];
      curv[i] = Math.max(-1, Math.min(1, (dx * nrm.getX(i) + dy2 * nrm.getY(i) + dz * nrm.getZ(i)) / el * 5 - 0.6 * groove[i]));
    }
    g.setAttribute("aCurv", new THREE.BufferAttribute(curv, 1));
  }
  g.setAttribute("aTint", new THREE.Float32BufferAttribute(tint, 1));
  // metres below the mass's top (the rock material's turf / moss-drape / lip terms)
  { const p = g.attributes.position as THREE.BufferAttribute, dep = new Float32Array(p.count); for (let i = 0; i < p.count; i++) dep[i] = Math.max(0, H / 2 - p.getY(i)); g.setAttribute("aDepth", new THREE.BufferAttribute(dep, 1)); }
  // metres → the instance's unit box (normals transform with the inverse transpose: × size, renormalised)
  {
    const p = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) / r.sx, p.getY(i) / r.sy, p.getZ(i) / r.sz);
      const nx = nrm.getX(i) * r.sx, ny = nrm.getY(i) * r.sy, nzz = nrm.getZ(i) * r.sz, l = Math.hypot(nx, ny, nzz) || 1;
      nrm.setXYZ(i, nx / l, ny / l, nzz / l);
    }
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
