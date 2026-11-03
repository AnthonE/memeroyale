import * as THREE from 'three';
import { KEEPER_ROOF_CLAY } from '../../../../../shared/pois/lookout-keeper-cottage';
import { rng } from '../../../../../shared/pois/coast-kit';
import type { Piece } from '../../../../../shared/pois/coast-kit';

export const KEEPER_TILE_PITCH = KEEPER_ROOF_CLAY.pitch;
export const KEEPER_TILE_COURSE = KEEPER_ROOF_CLAY.course;
export const KEEPER_TILE_RELIEF = KEEPER_ROOF_CLAY.relief;
export const KEEPER_TILE_LIP = KEEPER_ROOF_CLAY.lap;
/** A rounded pan, measured from its valley: 36 mm total relief. */
export function keeperTileWave(x: number) {
  return KEEPER_TILE_RELIEF * (1 - Math.cos(x / KEEPER_TILE_PITCH * Math.PI * 2));
}
/** Pantile relief on authoritative clipped dormer timber sheets. Sampling and
 * relief use cottage coordinates: adjacent sheets cannot restart a tile course.
 * The timber retains the solid underside; only the outward face carries clay. */
export function keeperRoofTiles(p: Piece, ridgeX = 1.2) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...p.c),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch ?? 0, p.yaw ?? 0, 0, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  // Dormer-local X is cottage -Z. Anchor longitudinal samples globally so
  // differently clipped valley strips interpolate the same corrugation profile.
  const xs = [-p.h[0]];
  const step = .075;
  for (let z = Math.ceil((p.c[2] - p.h[0]) / step) * step; z < p.c[2] + p.h[0] - 1e-6; z += step) {
    const x = p.c[2] - z;
    if (x > -p.h[0] + 1e-6 && x < p.h[0] - 1e-6) xs.push(x);
  }
  xs.push(p.h[0]);
  xs.sort((a, b) => a - b);
  const nx = xs.length - 1, nz = Math.max(4, Math.ceil(p.h[2] * 2 / .09));
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let j = 0; j <= nz; j++) for (const x of xs) {
    const z = -p.h[2] + 2 * p.h[2] * j / nz;
    const world = new THREE.Vector3(x, 0, z).applyMatrix4(matrix);
    const wave = keeperTileWave(world.z);
    const course = (Math.abs(world.x - ridgeX) / Math.cos(p.pitch ?? 0) / KEEPER_TILE_COURSE) % 1;
    positions.push(x, p.h[1] + KEEPER_ROOF_CLAY.baseGap + wave + KEEPER_TILE_LIP * course, z);
    const tint = .95 + .025 * wave / (2 * KEEPER_TILE_RELIEF);
    colors.push(tint, tint, tint);
    // Eight pans and six courses in the authored map, same metres on both roofs.
    uvs.push(world.z / (8 * KEEPER_TILE_PITCH), -Math.abs(world.x - ridgeX) / Math.cos(p.pitch ?? 0) / (6 * KEEPER_TILE_COURSE));
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + nx + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** a clay pantile roof slope: wavy courses (the tile rows) stepping down the slope, in slope-local space (X along
 *  the eave, Z down the slope from the ridge (0) to the eave (len)), + the tile texture for colour variation */
export function tileSlope(width: number, len: number, seed: number, phaseX = 0, phaseZ = 0) {
  const amp = KEEPER_TILE_RELIEF, course = KEEPER_TILE_COURSE, nC = Math.ceil((len + phaseZ) / course), xs = [-width / 2];
  for (let x = Math.ceil((phaseX-width/2)/.1)*.1; x < phaseX+width/2-1e-6; x += .1) if(x-phaseX > -width/2+1e-6) xs.push(x-phaseX);
  xs.push(width/2);
  const nX = xs.length-1;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  let v = 0;
  for (let c = Math.floor(phaseZ / course); c < nC; c++) {
    const start = c * course - phaseZ, end = start + course + 0.04;
    const z0 = Math.max(0, start), z1 = Math.min(len, end);
    if (z1 <= z0) continue;
    const tint = 0.96 + rng(seed * 1009 + c * 917)() * 0.06;
    for (let i = 0; i <= nX; i++) {
      const xx = xs[i], wave = keeperTileWave(xx + phaseX);
      const jit = 0; // Shared phase must produce the same height at every patch boundary.
      // each course: top edge tucked under the previous course, lower edge lifted (the overlap step)
      pos.push(xx, wave + jit + KEEPER_ROOF_CLAY.baseGap + KEEPER_TILE_LIP * (z0-start)/(end-start), z0,
        xx, wave + jit + KEEPER_ROOF_CLAY.baseGap + KEEPER_TILE_LIP * (z1-start)/(end-start), z1,
        xx, wave + jit + KEEPER_ROOF_CLAY.baseGap, z1);
      const k = tint * (.97 + .03 * wave / (2 * amp));
      col.push(k, k, k, k, k, k, k*.97,k*.97,k*.97);
      uv.push((xx+phaseX)/2.4, -(z0+phaseZ)/2.16, (xx+phaseX)/2.4, -(z1+phaseZ)/2.16, (xx+phaseX)/2.4, -(z1+phaseZ)/2.16);
    }
    // Close the course lip down to the following row. Open single-face cards
    // exposed timber gaps when a player looked up from the cottage yard.
    for (let i = 0; i < nX; i++) {
      const a = v + i * 3, b = a + 1, bottom = a + 2, cc = a + 3, d = a + 4;
      idx.push(a,b,cc,cc,b,d,b,bottom,d,d,bottom,a+5);
    }
    v += (nX + 1) * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the tiles face up
  if (g.attributes.normal.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}


/** Actual main-clay renderer transform, shared with the fitted flashing support. */
export function keeperMainClay(p: Piece) {
  const s = Math.sign(p.pitch ?? 0), cp = Math.cos(p.pitch ?? 0);
  const geometry = tileSlope(p.h[0] * 2, p.h[2] * 2, 40 + s,
    s < 0 ? -p.c[0] : p.c[0], s * p.c[2] / cp - p.h[2]);
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...p.c),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch ?? 0, 0, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  matrix.multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, p.h[1], s < 0 ? p.h[2] : -p.h[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s < 0 ? Math.PI : 0, 0)), new THREE.Vector3(1, 1, 1)));
  return { geometry, matrix };
}

/** Profile-cut roof closure beneath the existing metal apron. Its bottom is the
 * upper emitted clay envelope, not an analytic crest. The globally phased clay
 * triangles are separable planes: partition at every emitted X/Z break, select
 * the upper plane per cell, and retain only exposed perimeter/step walls. Empty
 * roof-opening cells stay empty. Render as dark closure material, not thick steel. */
export function keeperFlashingSupport(p: Piece, roofs: Piece[]) {
  const frame = new THREE.Matrix4().compose(new THREE.Vector3(...p.c),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch ?? 0, 0, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const inverse = frame.clone().invert(), triangles: THREE.Triangle[] = [];
  const band = .018; // Narrow profiled perimeter gasket; apron interior stays hollow.
  const xs = [-p.h[0], -p.h[0] + band, p.h[0] - band, p.h[0]],
    zs = [-p.h[2], -p.h[2] + band, p.h[2] - band, p.h[2]];
  for (const roof of roofs.filter(q => Math.sign(q.pitch ?? 0) === Math.sign(p.pitch ?? 0))) {
    const clay = keeperMainClay(roof), matrix = inverse.clone().multiply(clay.matrix);
    const a = clay.geometry.getAttribute('position'), ix = clay.geometry.index!;
    for (let i = 0; i < ix.count; i += 3) {
      const vs = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(a, ix.getX(i + k)).applyMatrix4(matrix));
      const triangle = new THREE.Triangle(vs[0], vs[1], vs[2]);
      if (triangle.getNormal(new THREE.Vector3()).y < .5) continue;
      if (Math.max(...vs.map(v => v.x)) < -p.h[0] || Math.min(...vs.map(v => v.x)) > p.h[0] ||
          Math.max(...vs.map(v => v.z)) < -p.h[2] || Math.min(...vs.map(v => v.z)) > p.h[2]) continue;
      triangles.push(triangle);
      for (const v of vs) { if (v.x > -p.h[0] && v.x < p.h[0]) xs.push(v.x); if (v.z > -p.h[2] && v.z < p.h[2]) zs.push(v.z); }
    }
    clay.geometry.dispose();
  }
  const unique = (a: number[]) => a.sort((x, y) => x - y).filter((x, i, all) => !i || x - all[i - 1] > 2e-6);
  const xx = unique(xs), zz = unique(zs), positions: number[] = [];
  type Edge = { a: THREE.Vector3; b: THREE.Vector3 };
  const edges = new Map<string, Edge[]>(), upper = -p.h[1];
  const emit = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  const top = (v: THREE.Vector3) => new THREE.Vector3(v.x, upper, v.z);
  const key = (v: THREE.Vector3) => `${v.x.toFixed(6)},${v.z.toFixed(6)}`;
  let cells = 0, maxDepth = 0;
  for (let i = 0; i + 1 < xx.length; i++) for (let j = 0; j + 1 < zz.length; j++) {
    const x = (xx[i] + xx[i + 1]) / 2, z = (zz[j] + zz[j + 1]) / 2;
    if (Math.abs(x) < p.h[0] - band && Math.abs(z) < p.h[2] - band) continue;
    const ray = new THREE.Ray(new THREE.Vector3(x, upper, z), new THREE.Vector3(0, -1, 0));
    let plane: THREE.Plane | undefined, highest = -Infinity;
    for (const t of triangles) {
      const hit = ray.intersectTriangle(t.a, t.b, t.c, false, new THREE.Vector3());
      if (hit && hit.y > highest) { highest = hit.y; plane = t.getPlane(new THREE.Plane()); }
    }
    if (!plane) continue;
    const y = (x: number, z: number) => -(plane!.normal.x * x + plane!.normal.z * z + plane!.constant) / plane!.normal.y;
    const corners = [[xx[i], zz[j]], [xx[i + 1], zz[j]], [xx[i + 1], zz[j + 1]], [xx[i], zz[j + 1]]]
      .map(([x, z]) => new THREE.Vector3(x, y(x, z), z));
    cells++;
    for (const v of corners) maxDepth = Math.max(maxDepth, upper - v.y);
    // Bottom faces point down; the original solid metal box closes the top.
    emit(corners[0], corners[1], corners[2]); emit(corners[0], corners[2], corners[3]);
    for (let k = 0; k < 4; k++) {
      const a = corners[k], b = corners[(k + 1) % 4], ka = key(a), kb = key(b);
      const edgeKey = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const list = edges.get(edgeKey) ?? []; list.push({ a, b }); edges.set(edgeKey, list);
    }
  }
  for (const list of edges.values()) {
    const e = list[0];
    if (list.length === 1) { emit(e.a, top(e.a), e.b); emit(e.b, top(e.a), top(e.b)); }
    else {
      const other = list[1], oa = other.b, ob = other.a;
      if (Math.max(Math.abs(e.a.y - oa.y), Math.abs(e.b.y - ob.y)) < 2e-6) continue;
      // A clay course step exposes only the difference between its two bottoms.
      if (e.a.y + e.b.y < oa.y + ob.y) { emit(e.a, oa, e.b); emit(e.b, oa, ob); }
      else { emit(oa, e.a, ob); emit(ob, e.a, e.b); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.userData = { cells, maxDepth, band, emittedClayTriangles: triangles.length };
  return geometry;
}
