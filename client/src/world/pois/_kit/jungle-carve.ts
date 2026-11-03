// poi-jungle kit — draw a carved grid (shared/pois/jungle-layout.ts `carve`): the EXPOSED faces of the solid cells, greedy
// merged into big quads per plane. The server colliders are the greedy-merged boxes of the very same cells, so every drawn
// wall / floor / ceiling is exactly where the collider is. Faces are split into exterior (towards open air) and interior
// (towards a carved room) so the caller can tint / light them differently.
import * as THREE from "three";
import type { Carved } from "../../../../../shared/pois/jungle-layout";
import { boxUVs, tint } from "./jungle-geo";

export interface CarveFaces { exterior: THREE.BufferGeometry | null; interior: THREE.BufferGeometry | null }
/** `skip` = solid indices whose faces are not drawn (a mass drawn by its own mesh, e.g. the arched portal) */
export function carveFaces(c: Carved, o: { skip?: number[]; uvScale?: number; tintExt?: THREE.ColorRepresentation; tintInt?: THREE.ColorRepresentation } = {}): CarveFaces {
  const { xs, ys, zs, cell, src } = c, nx = xs.length - 1, ny = ys.length - 1, nz = zs.length - 1;
  const skip = new Set(o.skip ?? []);
  const at = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? 0 : cell[i + nx * (j + ny * k)]);
  const drawn = (i: number, j: number, k: number) => at(i, j, k) === 1 && !skip.has(src[i + nx * (j + ny * k)]);
  const P: number[][] = [[], []];   // positions per kind (0 exterior, 1 interior)
  const G = [xs, ys, zs], N = [nx, ny, nz];
  // axis d, sign s: faces whose outward normal is s·e_d
  for (let d = 0; d < 3; d++) for (const s of [-1, 1]) {
    const u = (d + 1) % 3, v = (d + 2) % 3, nu = N[u], nv = N[v];
    const mask = new Int8Array(nu * nv);
    for (let l = 0; l < N[d]; l++) {
      mask.fill(-1);
      for (let b = 0; b < nv; b++) for (let a = 0; a < nu; a++) {
        const p = [0, 0, 0]; p[d] = l; p[u] = a; p[v] = b;
        if (!drawn(p[0], p[1], p[2])) continue;
        const q = p.slice(); q[d] += s;
        const nb = at(q[0], q[1], q[2]);
        if (nb === 1) continue;
        mask[a + nu * b] = nb === 2 ? 1 : 0;
      }
      // greedy rectangles per kind
      for (let b = 0; b < nv; b++) for (let a = 0; a < nu; a++) {
        const kind = mask[a + nu * b]; if (kind < 0) continue;
        let a1 = a; while (a1 + 1 < nu && mask[a1 + 1 + nu * b] === kind) a1++;
        let b1 = b; grow: while (b1 + 1 < nv) { for (let t = a; t <= a1; t++) if (mask[t + nu * (b1 + 1)] !== kind) break grow; b1++; }
        for (let t = b; t <= b1; t++) for (let r = a; r <= a1; r++) mask[r + nu * t] = -1;
        const plane = s > 0 ? G[d][l + 1] : G[d][l], u0 = G[u][a], u1 = G[u][a1 + 1], v0 = G[v][b], v1 = G[v][b1 + 1];
        const corner = (cu: number, cv: number) => { const p = [0, 0, 0]; p[d] = plane; p[u] = cu; p[v] = cv; return p; };
        const c00 = corner(u0, v0), c10 = corner(u1, v0), c11 = corner(u1, v1), c01 = corner(u0, v1);
        // (u, v, d) is a right-handed cycle: u × v = +d → CCW seen from +d when s > 0
        const quad = s > 0 ? [c00, c10, c11, c00, c11, c01] : [c00, c11, c10, c00, c01, c11];
        for (const pt of quad) P[kind].push(pt[0], pt[1], pt[2]);
      }
    }
  }
  const mk = (arr: number[], col: THREE.ColorRepresentation | undefined) => {
    if (!arr.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
    boxUVs(g, o.uvScale ?? 4.2); tint(g, col ?? "#ffffff", 0); return g;
  };
  return { exterior: mk(P[0], o.tintExt), interior: mk(P[1], o.tintInt) };
}
