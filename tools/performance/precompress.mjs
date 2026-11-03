// Build-time compression, bounded concurrency; no request-time compression in the 60 Hz match process.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
const br=promisify(zlib.brotliCompress),gzip=promisify(zlib.gzip),dir=path.resolve(process.argv[2]||'dist');
const types=new Set(['.html','.js','.mjs','.css','.json','.svg','.gltf','.wasm','.bin','.glb']);
const files=[];async function walk(d){for(const e of await fs.readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())await walk(p);else if(types.has(path.extname(p)))files.push(p);}}await walk(dir);
let count=0,original=0,packed=0;
await Promise.all(Array.from({length:2},async()=>{for(;;){const f=files.pop();if(!f)return;const s=await fs.stat(f);if(s.size<1024||s.size>64*1024*1024)continue;const data=await fs.readFile(f);const b=await br(data,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:9}}),g=await gzip(data,{level:9});if(b.length<data.length)await fs.writeFile(f+'.br',b);if(g.length<data.length)await fs.writeFile(f+'.gz',g);count++;original+=data.length;packed+=Math.min(b.length,data.length);}}));
console.log(`Precompressed ${count} assets: ${(original/1e6).toFixed(1)} MB → ${(packed/1e6).toFixed(1)} MB Brotli. No compression runs in the match loop.`);
