import assert from 'node:assert/strict';
import * as THREE from 'three';

// Import the real selection and render callbacks without starting a browser or baking species.
Object.defineProperty(globalThis, 'location', { value: new URL('http://localhost/'), configurable: true });
const { SplatSet } = await import('../../client/src/world/veg/splat');

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(72, 16 / 9, .1, 9000);
camera.updateMatrixWorld();
const set = new SplatSet(scene);
// A small synthetic forest feeds the real spatial index, selector, buffers and material bands.
const state = set as any;
state.makeMeshes();
const grid = Math.round(Math.sqrt(state.cellS.length - 1)), cell = 64, half = grid * cell / 2;
const trees = [40, 150, 800, 1500].map(d => ({
  x: 0, y: 0, z: -d, radius: 6.5,
  cell: Math.floor((half - d) / cell) * grid + Math.floor(half / cell),
})).sort((a, b) => a.cell - b.cell);
set.group.n = trees.length;
set.group.F = new Float32Array(trees.length * 2); // fully transitioned to splats
state.rec = new Float32Array(trees.length * 16);
state.ctr = new Float32Array(trees.length * 4);
for (const [i, t] of trees.entries()) {
  state.rec.set([t.x, t.y, t.z, 0, 1, 0, i], i * 16);
  state.ctr.set([t.x, t.y, t.z, t.radius], i * 4);
  state.cellS[t.cell + 1]++;
  state.cellY0[t.cell] = -20; state.cellY1[t.cell] = 20;
}
for (let i = 1; i < state.cellS.length; i++) state.cellS[i] += state.cellS[i - 1];
set.built = true;
let now = 1000;
const smooth = (a: number, b: number, p: number) => { const k = Math.max(0, Math.min(1, (p - a) / (b - a))); return k * k * (3 - 2 * k); };
function coverage(height: number) {
  const focal = camera.projectionMatrix.elements[5] * height / 2;
  return trees.map((t, i) => {
    const p = t.radius * focal / Math.hypot(t.x, t.y, t.z);
    return state.levels.reduce((sum: number, l: any) => {
      let selected = false;
      for (let j = 0; j < l.n; j++) if (l.list[j * 16 + 6] === i) selected = true;
      const b = l.mat.uniforms.uSplBand.value;
      const weight = (b.w ? smooth(b.z, b.w, p) : 1) - (b.y ? smooth(b.x, b.y, p) : 0);
      return sum + (selected ? Math.max(0, weight) : 0);
    }, 0);
  });
}
const lists = () => state.levels.map((l: any) => Array.from(l.list.slice(0, l.n * 16)));
const draw = (height: number) => {
  const fakeRenderer = { getCurrentViewport: (v: THREE.Vector4) => v.set(0, 0, height, height) };
  for (const l of state.levels) l.pts.onBeforeRender(fakeRenderer, scene, camera, l.pts.geometry, l.mat, null);
};

// Fixture sensitivity: the diagnosed 4096-for-1080 input actually loses distant crowns.
set.update(camera, now++, 4096, true);
assert.ok(coverage(1080).some(x => x < .001), 'fixture must reproduce missing shader coverage with the wrong selection size');

let cases = 0;
for (const height of [1080, 540, 810, 2160, 720, 1080]) {
  set.update(camera, now++, height);
  assert.ok(coverage(height).every(x => x > .999), 'main-view selection must fully cover every synthetic crown');
  const expected = lists();
  for (const auxiliaryHeight of [64, 180, 4096]) {
    for (let pass = 0; pass < 4; pass++) draw(auxiliaryHeight);
    assert.equal(set.vpH, height, 'auxiliary callbacks must not change the main-view selection height');
    assert.equal(state.uniforms.uSplVp.value.y, auxiliaryHeight, 'shader viewport must still follow each draw');
    set.update(camera, now++, height);
    draw(height);
    assert.deepEqual(lists(), expected, 'offscreen passes must not perturb selected records or draw order');
    assert.ok(coverage(height).every(x => x > .999), 'no crown may lose shader coverage after an auxiliary pass');
    cases++;
  }
}
console.log(JSON.stringify({ pass: true, offscreenSequences: cases, resolutions: 6, coverage: 'all synthetic crowns fully covered' }));
