import assert from 'node:assert/strict';
import * as THREE from 'three';
import { exactIndex } from '../../client/src/engine/exact-index';
const source = new THREE.SphereGeometry(12, 64, 32).toNonIndexed();
const n=source.attributes.position.count,color=new Float32Array(n*3);
for(let i=0;i<n;i++){color[i*3]=.376;color[i*3+1]=.5;color[i*3+2]=.75;}
// Identical positions with different colours/UVs must stay separate; signed zero is deliberately preserved.
color[0]=-.0;color[3]=+.0;color[37]=.37600003;source.setAttribute('color',new THREE.BufferAttribute(color,3));
const before=source.clone(),bytes=(g:THREE.BufferGeometry)=>Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength??0);
const t=performance.now();for(const _ of exactIndex(source))void _;const ms=performance.now()-t;
assert.ok(source.index);assert.equal(source.index.count,n);
for(const [name,a]of Object.entries(before.attributes)){
  const b=source.attributes[name],aw=new Uint32Array(a.array.buffer),bw=new Uint32Array(b.array.buffer);
  for(let i=0;i<n;i++)for(let k=0;k<a.itemSize;k++)assert.equal(bw[source.index.getX(i)*a.itemSize+k],aw[i*a.itemSize+k],`${name} vertex ${i} component ${k}`);
}
console.log(JSON.stringify({bitExact:true,triangleCorners:n,bytesBefore:bytes(before),bytesAfter:bytes(source),ms}));
