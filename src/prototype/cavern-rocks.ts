import * as THREE from 'three';

/** Low-cost foreground depth over the painted cavern; no exits or props. */
export function addCavernRocks(parent:THREE.Group){
  const stone=new THREE.MeshStandardMaterial({color:0x738187,roughness:1,flatShading:true});
  const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),stone,20),pose=new THREE.Object3D();
  let index=0;
  for(const side of [-1,1])for(let i=0;i<10;i++){
    const wave=Math.sin(i*2.17+side);
    pose.position.set(side*(6.8+wave*.8),-3.5+wave*.5,-12+i*3.2);
    pose.rotation.set(wave*.08,i*.63,side*.11);
    pose.scale.set(2.1+wave*.3,5.5+Math.cos(i)*.8,2.6);pose.updateMatrix();
    rocks.setMatrixAt(index,pose.matrix);rocks.setColorAt(index,new THREE.Color(0xe2ecf2).multiplyScalar(.85+(wave+1)*.12));index++;
  }
  rocks.instanceMatrix.needsUpdate=true;rocks.computeBoundingSphere();parent.add(rocks);
}

/** Eight low boundary stones frame the barrow floor; the south route stays open. */
export function addBarrowGuardrails(parent:THREE.Group,width:number,depth:number){
  const stone=new THREE.MeshStandardMaterial({color:0x756c58,roughness:1,flatShading:true});
  const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),stone,8),pose=new THREE.Object3D();
  const positions=[...[-1,1].flatMap(side=>[-depth*.32,0,depth*.32].map(z=>[side*(width/2+.25),z])),[-width*.3,depth/2+.2],[width*.3,depth/2+.2]];
  positions.forEach(([x,z],i)=>{
    pose.position.set(x!,.25,z!);pose.rotation.set(.08*Math.sin(i),i*.73,.05*Math.cos(i));
    pose.scale.set(.7,.55,.85);pose.updateMatrix();rocks.setMatrixAt(i,pose.matrix);
  });
  rocks.instanceMatrix.needsUpdate=true;rocks.computeBoundingSphere();parent.add(rocks);
}

/** Limestone extensions on the far bank; all gameplay stays in the source engine. */
export function addGreatCavern(parent:THREE.Group){
  const stone=new THREE.MeshStandardMaterial({color:0x78817b,roughness:1,flatShading:true});
  const moss=new THREE.MeshStandardMaterial({color:0x688a75,emissive:0x3e8060,emissiveIntensity:.65,roughness:1});
  const shelf=new THREE.Mesh(new THREE.BoxGeometry(11,.45,4.6),stone);
  shelf.name='great-cavern-limestone-shelf';shelf.position.set(0,-.23,.8);parent.add(shelf);
  // A worn southwest path between the formations, away from the bridge approach.
  const path=new THREE.Mesh(new THREE.BoxGeometry(4,.025,1.1),new THREE.MeshStandardMaterial({color:0x99998a,roughness:1}));
  path.position.set(-2.8,.012,1.5);path.rotation.y=.22;parent.add(path);
  const formation=(radius:number,height:number)=>new THREE.LatheGeometry([
    new THREE.Vector2(radius,0),new THREE.Vector2(radius*.84,height*.1),
    new THREE.Vector2(radius*.67,height*.2),new THREE.Vector2(radius*.61,height*.35),
    new THREE.Vector2(radius*.4,height*.5),new THREE.Vector2(radius*.33,height*.65),
    new THREE.Vector2(radius*.15,height*.84),new THREE.Vector2(.015,height),
  ],9);
  for(const side of [-1,1])for(let i=0;i<6;i++){
    const x=side*(1.8+(i%3)*1.25),z=-.8+Math.floor(i/3)*2.8;
    const height=.8+(Math.sin(i*3.7+side)+1)*1.05;
    const base=new THREE.Mesh(formation(.38+height*.1,height),stone);
    base.name='stalagmite';base.position.set(x,0,z);base.rotation.y=i*.73;parent.add(base);
    const tip=new THREE.Mesh(formation(.32,height*.85),stone);
    tip.name='stalactite';tip.position.set(x+.3,5.1,z+.25);tip.rotation.z=Math.PI;parent.add(tip);
    const patch=new THREE.Mesh(new THREE.SphereGeometry(.5,7,4),moss);
    patch.position.set(x,.12,z+.25);patch.scale.set(1,.18,.7);parent.add(patch);
  }
  const glow=new THREE.PointLight(0x75c49a,14,13,2);glow.position.set(-2,3,0);parent.add(glow);
}
