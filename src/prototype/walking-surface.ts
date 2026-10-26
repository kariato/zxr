import * as THREE from 'three';
import {walkingSurfaces} from './walking-surfaces.generated.ts';
export {walkingSurfaces};

/** Barycentric support on separately authored, non-rendering floor triangles. */
export function walkingHeight(room:string|null,x:number,z:number):number|undefined{
  const surface=room?walkingSurfaces[room]:undefined;if(!surface)return;
  for(const triangle of surface.triangles){
    const a=surface.vertices[triangle[0]]!,b=surface.vertices[triangle[1]]!,c=surface.vertices[triangle[2]]!;
    const denominator=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
    if(Math.abs(denominator)<1e-8)continue;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/denominator;
    const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/denominator;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)return u*a[1]+v*b[1]+(1-u-v)*c[1];
  }
}
/** Capsule footprint stops at support edges and steps; axis sliding stays local. */
export function walkingStep(room:string,x:number,y:number,z:number,dx:number,dz:number){
  const supported=(px:number,pz:number)=>{
    const h=walkingHeight(room,px,pz);if(h===undefined||Math.abs(h-y)>.24)return;
    for(const [sx,sz] of [[.1,0],[-.1,0],[0,.1],[0,-.1]])if(walkingHeight(room,px+sx!,pz+sz!)===undefined)return;
    return h;
  };
  const hx=supported(x+dx,z);if(hx!==undefined){x+=dx;y=hx;}
  const hz=supported(x,z+dz);if(hz!==undefined){z+=dz;y=hz;}
  return {x,y,z};
}
/** This mesh is never drawn and has no texture, source object or action binding. */
export function mountWalkingSurface(parent:THREE.Group,room:string){
  const surface=walkingSurfaces[room];if(!surface)return;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(surface.vertices.flat(),3));geometry.setIndex(surface.triangles.flat());geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({visible:false}));mesh.name='hidden-walking-surface-'+room;mesh.userData.role='walking_surface';parent.add(mesh);return mesh;
}
