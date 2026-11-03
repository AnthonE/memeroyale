import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { serveStatic } from '../../server/static';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kr-static-test-'));
const bytes=Buffer.from('const unchanged = "same asset bytes";\n'.repeat(2000));
await fs.writeFile(path.join(dir,'asset.js'),bytes);await fs.writeFile(path.join(dir,'index.html'),'<h1>game</h1>');
await fs.writeFile(path.join(dir,'asset.js.br'),zlib.brotliCompressSync(bytes));await fs.writeFile(path.join(dir,'asset.js.gz'),zlib.gzipSync(bytes));
const server=http.createServer((req,res)=>void serveStatic(req,res,req.url!,dir).catch(()=>res.writeHead(500).end()));
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as import('node:net').AddressInfo).port;
const get=(url:string,headers:Record<string,string>={},method='GET')=>new Promise<{code:number,headers:http.IncomingHttpHeaders,body:Buffer}>((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:url,headers,method},res=>{const parts:Buffer[]=[];res.on('data',b=>parts.push(b));res.on('end',()=>resolve({code:res.statusCode!,headers:res.headers,body:Buffer.concat(parts)}));});req.on('error',reject);req.end();});
try{
  const plain=await get('/asset.js'),br=await get('/asset.js',{'accept-encoding':'br, gzip'}),gz=await get('/asset.js',{'accept-encoding':'br;q=0, gzip;q=0.8'});
  assert.deepEqual(plain.body,bytes);assert.equal(br.headers['content-encoding'],'br');assert.deepEqual(zlib.brotliDecompressSync(br.body),bytes);assert.equal(gz.headers['content-encoding'],'gzip');assert.deepEqual(zlib.gunzipSync(gz.body),bytes);assert.notEqual(br.headers.etag,plain.headers.etag);
  assert.equal((await get('/asset.js',{'accept-encoding':'br','if-none-match':String(br.headers.etag)})).code,304);
  assert.equal((await get('/asset.js',{'accept-encoding':'br'},'HEAD')).body.length,0);
  assert.equal((await get('/%2e%2e/outside')).code,403);assert.equal((await get('/%XX')).code,400);
  // A stale sidecar must never replace an updated asset.
  const old=new Date(Date.now()-60000);await fs.utimes(path.join(dir,'asset.js.br'),old,old);
  assert.deepEqual((await get('/asset.js',{'accept-encoding':'br'})).body,bytes);
  console.log('PASS: identity/Brotli/gzip bytes, q=0 negotiation, per-encoding ETags, HEAD, traversal, malformed URL, stale sidecars.');
}finally{await new Promise<void>(r=>server.close(()=>r()));await fs.rm(dir,{recursive:true,force:true});}
