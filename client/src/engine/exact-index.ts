import * as THREE from 'three';

/** Lossless indexing for immutable, non-indexed static triangle streams. Unlike tolerance-based welding, every bit
 * of every attribute must match. UV seams, hard normals, colour differences, signed zero, winding and triangle order
 * survive. Only call for materials that do not derive appearance from gl_VertexID. No position quantization. */
export function* exactIndex(g: THREE.BufferGeometry, sliceMs = 8): Generator<void, THREE.BufferGeometry, void> {
  if (g.index || Object.keys(g.morphAttributes).length) return g;
  const attrs = Object.entries(g.attributes) as Array<[string, THREE.BufferAttribute]>;
  const count = g.attributes.position?.count ?? 0;
  if (count < 512 || !attrs.length || attrs.some(([, a]) => !(a.array instanceof Float32Array) || (a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || a.count !== count || a.usage !== THREE.StaticDrawUsage)) return g;
  const words = attrs.map(([, a]) => new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length));
  const sizes = attrs.map(([, a]) => a.itemSize);
  let size = 1024; while (size < count * 1.5) size *= 2;
  const table = new Uint32Array(size), remap = new Uint32Array(count), unique = new Uint32Array(count);
  const mask = size - 1; let n = 0, time = performance.now();
  for (let i = 0; i < count; i++) {
    let h = 2166136261;
    for (let a = 0; a < words.length; a++) { const w = words[a], s = sizes[a], o = i * s; for (let k = 0; k < s; k++) h = Math.imul(h ^ w[o + k], 16777619); }
    let bucket = (h >>> 0) & mask;
    for (;;) {
      const entry = table[bucket];
      if (!entry) { unique[n] = i; remap[i] = n; table[bucket] = ++n; break; }
      const old = unique[entry - 1]; let equal = true;
      for (let a = 0; a < words.length && equal; a++) { const w = words[a], s = sizes[a]; for (let k = 0; k < s; k++) if (w[i * s + k] !== w[old * s + k]) { equal = false; break; } }
      if (equal) { remap[i] = entry - 1; break; }
      bucket = (bucket + 1) & mask;
    }
    if ((i & 4095) === 4095 && performance.now() - time > sliceMs) { yield; time = performance.now(); }
  }
  const stride = sizes.reduce((a, b) => a + b, 0) * 4, indexBytes = count * (n <= 65535 ? 2 : 4);
  if (n * stride + indexBytes >= count * stride * 0.92) return g;
  for (let a = 0; a < attrs.length; a++) {
    const [name, src] = attrs[a], s = sizes[a], data = new Float32Array(n * s), bits = new Uint32Array(data.buffer), w = words[a];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < s; k++) bits[i * s + k] = w[unique[i] * s + k];
      if ((i & 16383) === 16383 && performance.now() - time > sliceMs) { yield; time = performance.now(); }
    }
    const attr = new THREE.BufferAttribute(data, s, src.normalized); attr.name = src.name; attr.gpuType = src.gpuType;
    g.setAttribute(name, attr);
  }
  g.setIndex(new THREE.BufferAttribute(n <= 65535 ? Uint16Array.from(remap) : remap, 1));
  return g;
}
