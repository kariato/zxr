/** Local movement stays inside the authored room/passages; exits remain engine actions. */
export function barrowStep(x:number,z:number,dx:number,dz:number){
  const safe=(px:number,pz:number)=>
    (Math.abs(px)<=2.7&&pz>=-2.7&&pz<=2.7)||
    (Math.abs(px)<=.58&&pz>=2.6&&pz<=6.7);
  if(safe(x+dx,z))x+=dx;
  if(safe(x,z+dz))z+=dz;
  return {x,y:.02,z};
}

// Matches the separately authored display props, without embedding them in the room GLB.
export const barrowPropPoses={
  SWORD:{position:[.55,.02,0],rotation:[0,-.124674775,0,.992197752]},
  LAMP:{position:[-.8,.117198691,-.25],rotation:[-.088158354,.088158332,-.701589584,.701589882]},
} as const;
