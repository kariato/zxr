import type { AppearanceObservation } from '../engine/appearance.ts';
import { movablePropDefinitions } from './movable-props.generated.ts';

/** Hand-built presentation slice. No gameplay rules or inferred exit success. */
export const sliceRooms:Record<string,{width:number;depth:number;height:number;routes:{direction:string;x:number;z:number}[]}>= {
  'DRAGON-LAIR':{width:8,depth:9,height:4,routes:[{direction:'SOUTH',x:0,z:4.25}]},
  'INSIDE-BARROW':{width:6,depth:7,height:3,routes:[{direction:'SOUTH',x:0,z:3.25}]},
  'NARROW-TUNNEL':{width:2.4,depth:5,height:4,routes:[{direction:'NORTH',x:0,z:-2.2},{direction:'SOUTH',x:0,z:2.2}]},
  'FOOT-BRIDGE':{width:2.2,depth:6,height:4,routes:[{direction:'NORTH',x:0,z:-2.8},{direction:'SOUTH',x:0,z:2.8}]},
};
// Environments remain limited to the slice. Movable objects follow observed
// source identity in every lit room, independent of environment completion.
const props=new Set<string>(movablePropDefinitions.map(p=>p.id));
props.add('PRINCESS');
export function prototypeModel(observation:AppearanceObservation){
  const {perception}=observation,room=perception.lit?perception.room?.id:undefined;
  const layout=room?sliceRooms[room]:undefined;
  return {room:room??null,layout:layout??null,
    props:room?perception.objects.filter(o=>o.visible&&props.has(o.id)&&(!o.carried||o.held)).map(o=>({
      id:o.id,name:o.name,held:o.held,open:observation.appearance.find(a=>a.id===o.id)?.open===true,on:observation.appearance.find(a=>a.id===o.id)?.on===true,
    })):[],
  };
}
