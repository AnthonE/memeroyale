import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StaticCache } from '../../client/src/engine/static-cache';
import { stats } from './common.mts';
function build(){const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);for(let g=0;g<40;g++){const parent=new THREE.Group();parent.position.set(g,0,0);root.add(parent);for(let i=0;i<100;i++){const o=new THREE.Object3D();o.position.set(i,1,i*.1);if(i===4)o.userData.krDynamic=true;if(i===7){o.updateMatrix();o.matrixAutoUpdate=false;}parent.add(o);}}return{scene,root};}
const a=build(),b=build(),cache=new StaticCache();cache.register(b.root);cache.skipHiddenRoots(b.scene);
let comparisons=0;const before:number[]=[],after:number[]=[];
for(let frame=0;frame<120;frame++){
  for(const {scene,root} of [a,b]){
    const p=root.children[frame%40];p.children[frame%100].position.y=frame*.12;
    p.children[4].rotation.y=frame*.02;
    if(frame===30)scene.position.x=12;
    if(frame===60){const x=p.children[7];x.matrixAutoUpdate=false;x.matrix.makeTranslation(20,30,40);x.matrixWorldNeedsUpdate=true;}
    if(frame===70){const x=new THREE.Object3D();x.position.set(1,2,3);p.add(x);}
  }
  cache.update();
  for(let pass=0;pass<4;pass++){
    // Explicit matrix writes after the cache update, between the main / shadow / reflection passes.
    if(pass===2)for(const {root}of[a,b]){const o=root.children[frame%40].children[7];o.matrix.makeTranslation(frame,pass,frame*.5);o.matrixWorldNeedsUpdate=true;}
    let t=performance.now();a.scene.updateMatrixWorld();before.push(performance.now()-t);t=performance.now();b.scene.updateMatrixWorld();after.push(performance.now()-t);
    const aa:THREE.Object3D[]=[],bb:THREE.Object3D[]=[];a.scene.traverse(o=>aa.push(o));b.scene.traverse(o=>bb.push(o));assert.equal(aa.length,bb.length);
    for(let i=0;i<aa.length;i++){assert.deepEqual(bb[i].matrixWorld.elements,aa[i].matrixWorld.elements,`frame ${frame} pass ${pass} object ${i}`);comparisons++;}
  }
}
// Hidden roots must wake immediately; releasing and re-enabling the cache restores property ownership.
for(const {root}of[a,b])root.visible=false;
cache.update();a.scene.updateMatrixWorld();b.scene.updateMatrixWorld();
for(const {root}of[a,b]){root.children[0].position.z=80;root.visible=true;}
cache.update();a.scene.updateMatrixWorld();b.scene.updateMatrixWorld();
assert.deepEqual(b.root.children[0].matrixWorld.elements,a.root.children[0].matrixWorld.elements);
cache.setActive(false);assert.equal(Object.getOwnPropertyDescriptor(b.root.children[0],'matrixWorldNeedsUpdate')?.writable,true);
cache.setActive(true);cache.update();a.scene.updateMatrixWorld();b.scene.updateMatrixWorld();
assert.deepEqual(b.root.children[0].matrixWorld.elements,a.root.children[0].matrixWorld.elements);
console.log(JSON.stringify({comparisons,exact:true,vanillaMs:stats(before.slice(40)),cachedMs:stats(after.slice(40))},null,2));
