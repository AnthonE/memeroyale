import assert from 'node:assert/strict';
import { makePlayer, PS } from '../../shared/sim/player';
import { makeVehicle } from '../../shared/sim/vehicle';
import { SnapshotBatch, writeSnapshotFor } from '../../shared/net/host';
import { Writer } from '../../shared/net/proto';
import type { Match } from '../../shared/sim/match';
import { stats } from './common.mts';
// Same state through uncached and batched writers: squad/health variants, spectators, all movement states, far cadence,
// falling corpses, occupied helicopters, parked/awake vehicles and mutations within the same simulation tick.
const players=Array.from({length:50},(_,i)=>makePlayer(i,Math.floor(i/3),'P'+i,false));
const vehicles=Array.from({length:32},(_,i)=>makeVehicle(i));
const m={players,vehs:{list:vehicles},tick:0,time:10,phaseT:10,phase:0,range:false,aliveCount:()=>players.filter(p=>p.st!==PS.Dead).length,squadsLeft:()=>new Set(players.filter(p=>p.st!==PS.Dead).map(p=>p.team)).size,headerFlags:()=>7} as unknown as Match;
const a=new Writer(),b=new Writer(),batch=new SnapshotBatch();let checked=0;
for(let t=0;t<200;t++){
  m.tick=(t%60)*2;m.phase=t%4;m.time=m.phaseT=t/10;m.range=t%7===0;
  for(const p of players){p.x=Math.sin(t+p.id)*700;p.z=Math.cos(t-p.id)*700;p.y=(p.id%4)*80;p.st=(p.id+t)%10;p.spectate=p.st===PS.Dead?(p.id+3)%50:-1;p.deadAt=m.time-(p.id%15);p.grounded=p.id%2===0;p.hp=(t*13+p.id*5)%100+.001;p.shield=(t*17+p.id*3)%100+.0001;p.slots[0].kind=1;p.slots[0].id=p.id%4;p.slots[0].rarity=p.id%6;p.veh=p.id%32;p.seat=p.id%3;}
  for(const v of vehicles){v.live=(v.id+t)%5!==0;v.x=v.id*31;v.z=t*5;v.flags=v.id%2;v.touch=t-v.id;v.kind=v.id%2;}
  batch.begin(m);
  for(let pid=0;pid<50;pid++){writeSnapshotFor(a,m,pid);writeSnapshotFor(b,m,pid,batch);assert.deepEqual(b.view(),a.view(),`tick ${t} peer ${pid}`);checked++;}
}
const legacy:number[]=[],cached:number[]=[];
for(let i=0;i<500;i++){let t=performance.now();for(let pid=0;pid<50;pid++)writeSnapshotFor(a,m,pid);legacy.push(performance.now()-t);t=performance.now();batch.begin(m);for(let pid=0;pid<50;pid++)writeSnapshotFor(b,m,pid,batch);cached.push(performance.now()-t);}
console.log(JSON.stringify({checked,identical:true,fanout50Ms:{legacy:stats(legacy.slice(50)),cached:stats(cached.slice(50))}},null,2));
