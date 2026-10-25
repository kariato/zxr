import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const surface=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true});
function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number){const part=new THREE.Mesh(geometry,material);part.position.set(x,y,z);parent.add(part);return part;}
function limb(parent:THREE.Group,material:THREE.Material,a:number[],b:number[],radius:number){
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
  const part=mesh(parent,new THREE.CylinderGeometry(radius,radius,delta.length(),7),material,...from.clone().add(to).multiplyScalar(.5).toArray());
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
}
/** Initial source-described seated pose, rendered only for a visible PRINCESS. */
export function addPrincess(parent:THREE.Group){
  const gown=surface(0x9a938b),hem=surface(0x5a5148),hair=surface(0x44352c),hairLight=surface(0x685043),rock=surface(0x625b53);
  const skin=new THREE.MeshStandardMaterial({color:0xd9af98,roughness:.85});
  const rose=new THREE.MeshStandardMaterial({color:0xaa7167,roughness:.95});
  const ivory=new THREE.MeshStandardMaterial({color:0xd5d0ba,roughness:.75});
  const iris=new THREE.MeshStandardMaterial({color:0x667b68,roughness:.6});
  const dark=surface(0x292522);
  const sphere=(mat:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
    const part=mesh(parent,new THREE.SphereGeometry(1,20,14),mat,x,y,z);part.scale.set(sx,sy,sz);return part;
  };
  const curve=(mat:THREE.Material,points:number[][],radius:number)=>{
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    return mesh(parent,new THREE.TubeGeometry(path,12,radius,5,false),mat,0,0,0);
  };
  mesh(parent,new THREE.DodecahedronGeometry(1,0),rock,0,.35,.12).scale.set(.7,.6,.62);
  mesh(parent,new THREE.ConeGeometry(.49,.92,16),gown,0,.61,-.23).rotation.x=-.12;
  mesh(parent,new THREE.ConeGeometry(.5,.16,16),hem,0,.2,-.29);
  mesh(parent,new THREE.CylinderGeometry(.2,.26,.52,12),gown,0,1.12,.02).rotation.x=-.12;
  for(const side of [-1,1]){
    sphere(gown,side*.21,1.28,0,.12,.12,.13);
    limb(parent,skin,[side*.22,1.3,0],[side*.32,.98,-.2],.07);
    limb(parent,skin,[side*.32,.98,-.2],[side*.12,.88,-.35],.06);
    sphere(skin,side*.11,.88,-.37,.075,.035,.065);
    curve(hem,[[side*.08,.98,-.22],[side*.2,.6,-.52],[side*.34,.22,-.6]],.008);
  }
  // A smooth oval face, with actual depth for VR and close inspection.
  sphere(skin,0,1.43,0,.075,.11,.075);
  sphere(skin,0,1.66,-.035,.185,.245,.18);
  for(const side of [-1,1]){
    sphere(skin,side*.176,1.64,-.005,.035,.065,.035);
    const x=side*.075;
    sphere(ivory,x,1.69,-.203,.037,.019,.014);
    sphere(iris,x,1.688,-.216,.014,.015,.005);
    sphere(dark,x,1.688,-.221,.006,.009,.003);
    sphere(ivory,x-.005,1.694,-.224,.003,.003,.002);
    curve(hair,[[x-.038,1.692,-.205],[x,1.711,-.217],[x+.038,1.692,-.205]],.004);
    curve(skin,[[x-.037,1.688,-.204],[x,1.671,-.21],[x+.037,1.688,-.204]],.004);
    curve(hair,[[x-.037,1.742,-.194],[x,1.754,-.205],[x+.035,1.747,-.192]],.007);
  }
  sphere(skin,0,1.647,-.201,.017,.039,.017);
  sphere(skin,0,1.616,-.224,.022,.016,.021);
  for(const side of [-1,1])sphere(rose,side*.014,1.605,-.235,.005,.003,.003);
  curve(rose,[[-.037,1.553,-.188],[-.014,1.559,-.201],[0,1.555,-.205],[.014,1.559,-.201],[.037,1.553,-.188]],.004);
  curve(rose,[[-.035,1.55,-.188],[0,1.545,-.202],[.035,1.55,-.188]],.005);
  curve(dark,[[-.03,1.551,-.194],[0,1.552,-.207],[.03,1.551,-.194]],.0015);
  // The hairline stays above the eyes; loose tresses replace the solid helmet.
  mesh(parent,new THREE.SphereGeometry(.228,24,14,0,Math.PI*2,0,1.35),hair,0,1.67,0).scale.set(.95,1.1,1);
  mesh(parent,new THREE.SphereGeometry(.229,24,16,0,Math.PI),hair,0,1.65,.018).scale.set(.95,1.1,1);
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const x=side*(.145+i*.016),z=.015+i*.045;
    curve(i%2?hairLight:hair,[[side*.08,1.865,z],[x,1.76,z-.06],[x+side*.035,1.55,z-.035],[x+side*.015,1.32-i*.035,z+.02]],.024-i*.002);
  }
  curve(hairLight,[[-.03,1.91,-.025],[-.14,1.85,-.13],[-.18,1.74,-.13]],.012);
  curve(hair,[[.02,1.91,-.03],[.11,1.84,-.15],[.17,1.73,-.14]],.018);
  // Bake the static parts by material to keep the richer model to a few draws.
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  for(const child of [...parent.children])if(child instanceof THREE.Mesh){
    child.updateMatrix();const material=child.material as THREE.Material;
    const geometries=batches.get(material)??[];geometries.push(child.geometry.clone().applyMatrix4(child.matrix));batches.set(material,geometries);
    child.geometry.dispose();parent.remove(child);
  }
  for(const [material,geometries] of batches){
    const geometry=mergeGeometries(geometries);for(const part of geometries)part.dispose();
    if(geometry)parent.add(new THREE.Mesh(geometry,material));
  }
  parent.rotation.y=-.2;
}
export function addLairChest(parent:THREE.Group,open:boolean){
  const timber=surface(0x544034),bands=surface(0x332e29);
  mesh(parent,new THREE.BoxGeometry(.95,.08,.62),timber,0,.05,0);
  for(const x of [-.44,.44])mesh(parent,new THREE.BoxGeometry(.07,.45,.62),timber,x,.29,0);
  for(const z of [-.28,.28])mesh(parent,new THREE.BoxGeometry(.95,.45,.07),timber,0,.29,z);
  for(const side of [-1,1])mesh(parent,new THREE.BoxGeometry(.065,.5,.64),bands,side*.32,.27,0);
  const hinge=new THREE.Group();hinge.position.set(0,.5,.31);parent.add(hinge);hinge.rotation.x=open?1.9:0;
  mesh(hinge,new THREE.BoxGeometry(1,.13,.66),timber,0,.055,-.31);
  for(const side of [-1,1])mesh(hinge,new THREE.BoxGeometry(.07,.14,.68),bands,side*.32,.055,-.31);
  mesh(parent,new THREE.BoxGeometry(.11,.14,.04),bands,0,.46,-.33);
}
/** Source-described blackened south doorway, without a destination-room reveal. */
export function addLairDoorway(parent:THREE.Group,south:number){
  const group=new THREE.Group();group.position.z=south;group.userData.direction='SOUTH';parent.add(group);
  const stone=surface(0x332d29),dark=new THREE.MeshBasicMaterial({color:0x070706,side:THREE.DoubleSide});
  for(const x of [-1.1,1.1])mesh(group,new THREE.BoxGeometry(.45,2.7,.6),stone,x,1.3,0);
  mesh(group,new THREE.BoxGeometry(2.65,.5,.65),stone,0,2.65,0);
  const opening=mesh(group,new THREE.PlaneGeometry(1.75,2.4),dark,0,1.2,.25);
  const targets:THREE.Mesh[]=[];group.traverse(n=>{if(n instanceof THREE.Mesh)targets.push(n);});return {opening,targets};
}
