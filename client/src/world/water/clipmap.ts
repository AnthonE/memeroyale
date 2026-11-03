// Ocean surface mesh: concentric geometry-clipmap rings (cell size doubles per level) merged into ONE draw call, plus
// a flat horizon skirt out to `horizon` metres. Every level's outer edge is STITCHED (uses only even vertices), which
// makes it identical to the next level's inner edge, so no cracks and no shader morphing. The whole thing follows the
// camera in world-snapped steps (see index.ts); waves are evaluated in world space, so tessellation motion is invisible.
import * as THREE from "three";

export interface ClipmapOpts { cells: number; baseCell: number; levels: number; horizon: number }

export function buildClipmap(o: ClipmapOpts): THREE.BufferGeometry {
  const N = o.cells;
  if (N % 8 !== 0) throw new Error("clipmap cells must be divisible by 8");
  const pos: number[] = [];
  const lvl: number[] = [];          // the level of every vertex (the near levels shade their water column per vertex)
  const idx: number[] = [];
  let lastEdge: number[] = []; // vertex ids of the outermost level's stitched boundary (for the skirt), in ring order
  let lastHalf = 0;

  const levelStart: number[] = [];   // index offset where each level's triangles begin (draw ranges by distance)
  for (let L = 0; L < o.levels; L++) {
    levelStart.push(idx.length);
    const cell = o.baseCell * 2 ** L, half = (N * cell) / 2;
    const hole = L > 0;
    const inHole = (i: number, j: number) => hole && i > N / 4 && i < (3 * N) / 4 && j > N / 4 && j < (3 * N) / 4;
    const blockInHole = (bi: number, bj: number) => hole && 2 * bi >= N / 4 && 2 * bi + 2 <= (3 * N) / 4 && 2 * bj >= N / 4 && 2 * bj + 2 <= (3 * N) / 4;
    // vertices
    const id = new Int32Array((N + 1) * (N + 1)).fill(-1);
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      if (inHole(i, j)) continue;
      // outermost boundary: odd vertices are dropped (stitched edge)
      const onEdge = i === 0 || i === N || j === 0 || j === N;
      if (onEdge && ((i === 0 || i === N) ? j % 2 === 1 : i % 2 === 1)) continue;
      id[i * (N + 1) + j] = pos.length / 3;
      pos.push((j - N / 2) * cell, 0, (i - N / 2) * cell);
      lvl.push(L);
    }
    const V = (i: number, j: number) => id[i * (N + 1) + j];
    // 2x2-cell blocks, fan-triangulated around the block centre (skips dropped boundary vertices)
    const ring: Array<[number, number]> = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]];
    for (let bi = 0; bi < N / 2; bi++) for (let bj = 0; bj < N / 2; bj++) {
      if (blockInHole(bi, bj)) continue;
      const r0 = bi * 2, c0 = bj * 2;
      const centre = V(r0 + 1, c0 + 1);
      const verts = ring.map(([r, c]) => V(r0 + r, c0 + c)).filter((v) => v >= 0);
      for (let k = 0; k < verts.length; k++) {
        const a = verts[k], b = verts[(k + 1) % verts.length];
        idx.push(centre, b, a);
      }
    }
    if (L === o.levels - 1) {
      // boundary in ring order: top row (left→right), right column (top→bottom), bottom row (right→left), left column (bottom→top)
      lastEdge = [];
      for (let j = 0; j <= N; j += 2) lastEdge.push(V(0, j));
      for (let i = 2; i <= N; i += 2) lastEdge.push(V(i, N));
      for (let j = N - 2; j >= 0; j -= 2) lastEdge.push(V(N, j));
      for (let i = N - 2; i >= 2; i -= 2) lastEdge.push(V(i, 0));
      lastHalf = half;
    }
  }
  // horizon skirt: scale the outer boundary out to `horizon` and bridge with quads
  const k = o.horizon / lastHalf, outer: number[] = [];
  for (const v of lastEdge) { outer.push(pos.length / 3); pos.push(pos[v * 3] * k, 0, pos[v * 3 + 2] * k); lvl.push(o.levels); }
  for (let e = 0; e < lastEdge.length; e++) {
    const a = lastEdge[e], b = lastEdge[(e + 1) % lastEdge.length], c = outer[(e + 1) % outer.length], d = outer[e];
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("wlevel", new THREE.Float32BufferAttribute(lvl, 1));
  g.setIndex(idx);
  // make sure faces point up (+Y)
  const p = g.attributes.position as THREE.BufferAttribute;
  const A = new THREE.Vector3().fromBufferAttribute(p, idx[0]), B = new THREE.Vector3().fromBufferAttribute(p, idx[1]), C = new THREE.Vector3().fromBufferAttribute(p, idx[2]);
  const n = B.sub(A).cross(C.sub(A));
  if (n.y < 0) { const ix = g.index!.array as Uint32Array | Uint16Array; for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; } }
  const nrm = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) nrm[i * 3 + 1] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.userData.levelStart = levelStart;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), o.horizon * 1.5);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-o.horizon, -10, -o.horizon), new THREE.Vector3(o.horizon, 10, o.horizon));
  return g;
}
