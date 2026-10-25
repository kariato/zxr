import * as THREE from 'three';

/** The already-described south passage; no destination room or puzzle props. */
export function addBarrowTunnel(parent:THREE.Group,south:number){
  const tunnel=new THREE.Group();tunnel.position.z=south-.2;tunnel.userData.direction='SOUTH';parent.add(tunnel);
  const stone=new THREE.MeshStandardMaterial({color:0x746653,roughness:1,flatShading:true,side:THREE.DoubleSide});
  const frame=new THREE.Shape();frame.moveTo(-1.65,-.15);frame.lineTo(1.65,-.15);frame.lineTo(1.6,1.8);frame.lineTo(1.2,2.7);frame.lineTo(.25,3);frame.lineTo(-.9,2.85);frame.lineTo(-1.65,2);frame.closePath();
  const opening=new THREE.Path();opening.moveTo(-.95,0);opening.lineTo(-.95,1.45);opening.absarc(0,1.45,.95,Math.PI,0,true);opening.lineTo(.95,0);opening.closePath();frame.holes.push(opening);
  const arch=new THREE.Mesh(new THREE.ExtrudeGeometry(frame,{depth:.55,bevelEnabled:true,bevelSize:.08,bevelThickness:.08,bevelSegments:1,curveSegments:8}),stone);tunnel.add(arch);
  // A small real corridor occludes the painted wall and retains stereo depth.
  const section=[[-.95,0],[-.95,1.45],...Array.from({length:9},(_,i)=>{const a=Math.PI-i*Math.PI/8;return [Math.cos(a)*.95,1.45+Math.sin(a)*.95];}),[.95,0]];
  const vertices:number[]=[];
  for(let i=0;i<section.length;i++){
    const a=section[i]!,b=section[(i+1)%section.length]!;
    vertices.push(a[0]!,a[1]!,0,b[0]!,b[1]!,0,b[0]!*.7,b[1]!*.85,5.5,a[0]!,a[1]!,0,b[0]!*.7,b[1]!*.85,5.5,a[0]!*.7,a[1]!*.85,5.5);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  const walls=new THREE.Mesh(geometry,stone);tunnel.add(walls);
  const endShape=new THREE.Shape();section.forEach(([x,y],i)=>{if(i===0)endShape.moveTo(x!*.7,y!*.85);else endShape.lineTo(x!*.7,y!*.85);});endShape.closePath();
  const end=new THREE.Mesh(new THREE.ShapeGeometry(endShape),new THREE.MeshBasicMaterial({color:0x080e0d,side:THREE.DoubleSide}));end.position.z=5.51;tunnel.add(end);
  passageGlow(tunnel);
  return [arch,walls,end];
}

/** Reuse the established faint tunnel glow with the local generated-rock experiment. */
export function addBarrowTunnelGlow(parent:THREE.Group,south:number){
  const group=new THREE.Group();group.position.z=south-.2;parent.add(group);passageGlow(group);
}
function passageGlow(tunnel:THREE.Group){
  const surface=document.createElement('canvas');surface.width=surface.height=128;const ctx=surface.getContext('2d')!;
  const gradient=ctx.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,'rgba(164,203,180,.45)');gradient.addColorStop(.4,'rgba(103,151,127,.18)');gradient.addColorStop(1,'rgba(70,112,95,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(surface);texture.colorSpace=THREE.SRGBColorSpace;
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false}));glow.position.set(0,1.05,5.45);glow.scale.set(1.25,1.6,1);tunnel.add(glow);
  const light=new THREE.PointLight(0x9ac5b0,.8,5,2);light.position.set(0,1.1,4.4);tunnel.add(light);
}
