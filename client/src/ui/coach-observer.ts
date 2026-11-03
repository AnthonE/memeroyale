import type { CoachObservation } from "./onboarding";
export interface CoachFrame {
  session: unknown; reliable: boolean; active: boolean; dt: number; correction: number;
  x:number; z:number; ground:boolean; sliding:boolean; mantling:boolean;
  movementIntent:boolean; interactIntent:boolean; fireIntent:boolean; aimIntent:boolean;
  slots: ReadonlyArray<{kind:number;id:number;rarity:number;count:number;mag:number}>; slot:number;
  hp:number;shield:number;reload:number;use:number;shot:number;mapPinned:boolean;inventoryOpened:boolean;
}
/** Production observation logic, shared by game integration and regression tests. */
export function createCoachObserver() {
  let last: CoachFrame | null = null, seen: CoachObservation = {active:false}, interactWindow=0;
  const identity=(f:CoachFrame)=>{const s=f.slots[f.slot];return `${f.slot}:${s.kind}:${s.id}:${s.rarity}`;};
  const weapons=(f:CoachFrame)=>{const counts=new Map<string,number>();for(const s of f.slots)if(s.kind===1){const k=`${s.id}:${s.rarity}`;counts.set(k,(counts.get(k)||0)+1);}return counts;};
  return {
    reset(){last=null;seen={active:false};interactWindow=0;},
    observe(f:CoachFrame): CoachObservation & { reset:boolean } {
      const reset=!last || last.session!==f.session || !f.reliable || !last.reliable;
      if(reset){seen={active:false};interactWindow=0;}
      if(!reset && last && f.reliable) {
        const stable=f.correction===last.correction;
        interactWindow=f.interactIntent?1:Math.max(0,interactWindow-f.dt);
        if(stable) {
          const distance=Math.hypot(f.x-last.x,f.z-last.z);
          if(f.movementIntent&&f.ground&&distance>.02&&distance<Math.max(.5,f.dt*20))seen.moved=true;
          if(f.movementIntent&&f.sliding&&!last.sliding)seen.slid=true;
          if(f.movementIntent&&f.mantling&&!last.mantling)seen.mantled=true;
          if(interactWindow>0){const before=weapons(last);for(const [key,n] of weapons(f))if(n>(before.get(key)||0))seen.weaponTaken=true;}
          if(identity(f)===identity(last)) {
            const s=f.slots[f.slot], old=last.slots[last.slot];
            if(s.kind===1&&last.reload>0&&f.reload===0&&s.mag>old.mag)seen.reloaded=true;

            if(f.shot>last.shot&&f.fireIntent&&f.aimIntent)seen.aimedAndFired=true;
          }
          const item=f.slots[f.slot], previousItem=last.slots[last.slot];
          if(f.slot===last.slot && previousItem.kind===2 && (item.kind===2 || item.kind===0) && item.id===previousItem.id && item.rarity===previousItem.rarity && last.use>0 && f.use===0 && item.count<previousItem.count && (f.hp>last.hp || f.shield>last.shield))seen.healed=true;
        }
        if(f.mapPinned&&!last.mapPinned)seen.mapPinned=true;
        if(f.inventoryOpened&&!last.inventoryOpened)seen.inventoryOpened=true;
      }
      last={...f,slots:f.slots.map(s=>({...s}))};
      seen.active=f.active&&f.reliable;
      return {...seen,reset};
    },
  };
}
