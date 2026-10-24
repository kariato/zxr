import type { AppearanceObservation } from '../engine/appearance.ts';

/** Hand-built presentation slice. No gameplay rules or inferred exit success. */
export const sliceRooms:Record<string,{width:number;depth:number;height:number;routes:{direction:string;x:number;z:number}[]}>= {
  'INSIDE-BARROW':{width:6,depth:7,height:3,routes:[{direction:'SOUTH',x:0,z:3.25}]},
  'NARROW-TUNNEL':{width:4,depth:10,height:4,routes:[{direction:'NORTH',x:0,z:-4.7},{direction:'SOUTH',x:0,z:4.7}]},
  'FOOT-BRIDGE':{width:2.2,depth:6,height:4,routes:[{direction:'NORTH',x:0,z:-2.8},{direction:'SOUTH',x:0,z:2.8}]},
};
// Scene dressing is deliberately limited to the three-room slice. All other
// source identities retain their menu and transcript representation.
const props=new Set(['LAMP','SWORD']);
export function prototypeModel(observation:AppearanceObservation){
  const {perception}=observation,room=perception.lit?perception.room?.id:undefined;
  const layout=room?sliceRooms[room]:undefined;
  return {room:room??null,layout:layout??null,
    props:layout?perception.objects.filter(o=>o.visible&&props.has(o.id)&&(!o.carried||o.held)).map(o=>({
      id:o.id,name:o.name,held:o.held,on:observation.appearance.find(a=>a.id===o.id)?.on===true,
    })):[],
  };
}
