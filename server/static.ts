// Asset delivery must never compress on the simulation thread. `npm run build` emits sidecars; serve them as streams.
// Plain Vite builds still work (uncompressed). No in-memory copy of every compressed asset is retained by the match server.
import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';
const MIME: Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.ktx2':'image/ktx2','.bin':'application/octet-stream','.svg':'image/svg+xml','.wasm':'application/wasm','.hdr':'application/octet-stream','.exr':'application/octet-stream'};
const HASHED=/[-.][A-Za-z0-9_-]{8,}\.(js|mjs|css)$/;
const stat=async(f:string)=>{try{return await fs.promises.stat(f);}catch{return null;}};
function encodings(header:string){
  const values=new Map<string,number>();
  for(const part of header.split(',')){const [name,...params]=part.trim().toLowerCase().split(';');const q=params.find(p=>p.trim().startsWith('q='));const weight=q?Number(q.trim().slice(2)):1;values.set(name,Number.isFinite(weight)?Math.max(0,Math.min(1,weight)):0);}
  return ['br','gzip'].map(name=>({name,q:values.get(name)??values.get('*')??0})).filter(e=>e.q>0).sort((a,b)=>b.q-a.q);
}
export async function serveStatic(req:http.IncomingMessage,res:http.ServerResponse,url:string,dist:string){
  let rel:string;try{rel=decodeURIComponent(url);}catch{res.writeHead(400).end();return;}
  let file=path.join(dist,rel==='/'?'index.html':rel);
  if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
  let info=await stat(file);
  if(!info||info.isDirectory()){file=path.join(dist,'index.html');info=await stat(file);if(!info){res.writeHead(503).end('client not built — run `npm run build`');return;}}
  const ext=path.extname(file).toLowerCase(),original=info;
  let encoding:string|null=null;
  for(const e of encodings(String(req.headers['accept-encoding']||''))){
    const sidecar=file+(e.name==='br'?'.br':'.gz'),s=await stat(sidecar);
    if(s&&s.isFile()&&s.mtimeMs>=original.mtimeMs&&s.size<original.size){file=sidecar;info=s;encoding=e.name;break;}
  }
  const etag=`"${original.size.toString(36)}-${Math.floor(original.mtimeMs).toString(36)}-${encoding||'identity'}"`;
  const headers:http.OutgoingHttpHeaders={'content-type':MIME[ext]||'application/octet-stream',etag,'x-content-type-options':'nosniff',vary:'Accept-Encoding','cache-control':ext==='.html'?'no-cache':HASHED.test(file.replace(/\.(br|gz)$/,''))?'public, max-age=31536000, immutable':'public, max-age=3600, must-revalidate'};
  if(encoding)headers['content-encoding']=encoding;
  if(req.headers['if-none-match']===etag){res.writeHead(304,headers).end();return;}
  headers['content-length']=info.size;res.writeHead(200,headers);
  if(req.method==='HEAD'){res.end();return;}
  const stream=fs.createReadStream(file);res.once('close',()=>stream.destroy());stream.on('error',()=>res.destroy()).pipe(res);
}
