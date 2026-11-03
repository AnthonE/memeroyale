/** Candidate bounds must cover every ray in a tile, including opposite corners. */
export function tileRayBounds(rays: number[], indices: number[], margin = 2): [number,number,number,number] {
 if(!indices.length) throw new Error('empty mesh tile');
 const xs=indices.map(i=>rays[i*3]),zs=indices.map(i=>rays[i*3+2]);
 return [Math.min(...xs)-margin,Math.min(...zs)-margin,Math.max(...xs)+margin,Math.max(...zs)+margin];
}
