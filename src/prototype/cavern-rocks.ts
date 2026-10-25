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
