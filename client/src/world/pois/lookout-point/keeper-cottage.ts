import * as L from '../../../../../shared/pois/lookout-point';
import type {WorldCtx} from '../../../engine/engine';
import {buildInteriors} from '../_kit/interior';
import {Batch,M,box,cyl} from '../_kit/coast-kit';
import {plate} from '../peel-strip/coast-dress';
/** An authored keeper's home using the common furniture meshes with bespoke placement and finish. */
export async function buildKeeperHome(ctx:WorldCtx,maxDist:number){
 return buildInteriors(ctx,L.COT_INTERIOR.map(l=>l.room),{name:'lookout-point:keeper-home',layouts:L.COT_INTERIOR,maxDist});
}
/** Small grounded story details: duty/tide board, clock, chart ruler. No floor clutter in routes. */
export function keeperDetails(b:Batch,n:Batch){
 const f=L.COT.frame;for(const q of [b,n])q.setFrame(f.x,f.y,f.z,f.yaw);
 plate(n,'KEEPER ON WATCH',1.15,.19,M(-2.85,2.7,3.78,0,Math.PI,0),'#e7dfcb','#365f57');
 // Duty board above the pantry: inset papers read as a maintained home instead of a laboratory monitor.
 n.add(box(1.0,.7,.04),'wood',{m:M(-1.9,2.28,-3.75),color:0x75523b});
 for(let i=0;i<3;i++)n.add(box(.23,.4,.012),'fabric',{m:M(-2.22+i*.31,2.28,-3.719),color:i===2?0xc7d7ca:0xe8ddbe});
 n.add(cyl(.25,.25,.04,24).rotateX(Math.PI/2),'plain',{m:M(-.45,3.35,-3.74),color:0xe6ddc7});
 n.add(box(.02,.17,.02),'steel',{m:M(-.45,3.4,-3.709),color:0x3d4e49});
 n.add(box(.16,.02,.02),'steel',{m:M(-.38,3.35,-3.707),color:0x3d4e49});
 // Chart tools lie entirely on the shared map table, beyond the circulation lanes.
 n.add(box(.65,.018,.035),'wood',{m:M(3.55,1.195,1.8,0,.3,0),color:0xb69a68});
 plate(n,'TIDES  /  WATCH LOG',.84,.14,M(3.1,2.5,-.365),'#e8ddbd','#31594f');
 plate(n,'KEEPER’S COTTAGE',1.85,.25,M(-1.7,3.42,4.035),'#ebe3d0','#345d55');
 for(const q of [b,n])q.setFrame(0,0,0,0);
}
