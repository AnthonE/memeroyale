import assert from "node:assert/strict";
import { StaticWorld } from "../../shared/sim/world";
import type { Terrain } from "../../shared/world/terrain";
import { makeFineGraph } from "./walkgraph.mts";

const terrain = { half: 30, height: () => 0, normal: (_x: number, _z: number, out: number[]) => { out[0] = 0; out[1] = 1; out[2] = 0; return out; } } as unknown as Terrain;
const glass = new StaticWorld(terrain, [{ c: [0, 1.5, 0], h: [0.04, 1.5, 4], surf: "glass", noShoot: true }]);
// A window passes bullet LOS but must separate walking components.
assert.equal(glass.clear(-1, 1, 0, 1, 1, 0), true);
const graph = makeFineGraph(glass, -2, -0.8, 2, 0.8, 1, -0.5);
const left = graph.nearest(-1.5, 0, 0), right = graph.nearest(1.5, 0, 0);
assert.ok(left >= 0 && right >= 0);
assert.equal(graph.bfs(left)[right], -2, "player-solid glass must block walk links");

const stairs = new StaticWorld(terrain, [0, 1, 2, 3].map((i) => ({ c: [(i + 0.5) * 0.28, (i + 1) * 0.1, 0] as [number, number, number], h: [0.145, (i + 1) * 0.1, 0.7] as [number, number, number], surf: "wood" as const })));
const flight = makeFineGraph(stairs, -0.8, -0.6, 2, 0.6, 2, -0.5);
let treadNodes = 0;
for (let i = 0; i < flight.n; i++) {
  if (flight.X[i] < 0 || flight.X[i] > 1.12 || flight.Y[i] < 0.1) continue;
  stairs.velY = 0; stairs.headBump = false;
  stairs.resolveCapsule(flight.X[i], flight.Y[i] + 0.02, flight.Z[i], 0.42, 1.9, true);
  assert.ok(Math.abs(stairs.P[1] - flight.Y[i] - 0.02) < 0.03, "graph height must be the resolved standing height");
  treadNodes++;
}
assert.ok(treadNodes > 0);
console.log(`walkgraph regression passed: glass separates components; ${treadNodes} tread nodes use resolved capsule heights`);
const { tileRayBounds } = await import('./mesh-coverage.mts');
const bounds=tileRayBounds([.01,0,.01,29.99,0,29.99],[0,1]);
assert.ok(bounds[0]<.01&&bounds[1]<.01&&bounds[2]>29.99&&bounds[3]>29.99,'opposite corners of a 30 m tile must retain their local geometry');
const lower=flight.nearest(-.6,0,0),upper=flight.nearest(1,.8,0);
assert.ok(lower>=0&&upper>=0);
assert.notEqual(flight.bfs(lower,.5)[upper],-2,'the physical staircase remains connected without a target height bound');
assert.equal(flight.bfs(lower,.5,.4)[upper],-2,'a floor-target route must not climb onto higher stair/guard surfaces');
