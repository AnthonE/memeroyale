import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
export function stats(values: number[]) {
  const a = [...values].sort((a,b)=>a-b), n = a.length;
  const at = (p: number) => n ? a[Math.min(n-1, Math.ceil(p*n)-1)] : 0;
  return { n, mean: n ? a.reduce((s,v)=>s+v,0)/n : 0, p50:at(.5), p95:at(.95), p99:at(.99), max:n?a[n-1]:0 };
}
export const env = () => ({ at:new Date().toISOString(), platform:process.platform, arch:process.arch, node:process.version, cpu:os.cpus()[0]?.model, cpus:os.cpus().length });
export function save(file: string, data: unknown) { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n'); }
export const arg = (name: string, fallback: string) => { const i=process.argv.indexOf(name); return i<0?fallback:process.argv[i+1]; };
