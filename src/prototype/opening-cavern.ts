import * as THREE from 'three';
import fordReference from '../../games/zork2/assets/rooms/shallow-ford/reference-v1.png?url';
import tunnelReference from '../../games/zork2/assets/rooms/dark-tunnel/reference-v1.png?url';

/** Authoring coordinates in the original tunnel/bridge environment, in metres. */
export const openingCavernOrigins:Record<string,readonly [number,number,number]>={
  'NARROW-TUNNEL':[0,0,0], 'FOOT-BRIDGE':[0,.69,6.9],
  'GREAT-CAVERN':[0,1,12], 'SHALLOW-FORD':[-12,1,20], 'DARK-TUNNEL':[-12,1,29],
};

type Materials={stone:THREE.MeshStandardMaterial;ground:THREE.MeshStandardMaterial;dust:THREE.MeshStandardMaterial};
const point=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);

/** Open-ended, inward-visible rock passage, with real depth rather than a picture plane. */
function passage(parent:THREE.Group,points:THREE.Vector3[],width:number,height:number,material:THREE.Material,floorMaterial:THREE.Material){
  const curve=new THREE.CatmullRomCurve3(points),vertices:number[]=[],uv:number[]=[],indices:number[]=[];
  const steps=24,sides=16;
  for(let row=0;row<=steps;row++){
    const t=row/steps,centre=curve.getPoint(t),tangent=curve.getTangent(t),side=point(tangent.z,0,-tangent.x).normalize();
    for(let col=0;col<=sides;col++){
      const angle=col/sides*Math.PI,wave=1+.045*Math.sin(row*2.7+col*1.3);
      const p=centre.clone().addScaledVector(side,Math.cos(angle)*width/2*wave);p.y+=Math.sin(angle)*height*wave;
      vertices.push(p.x,p.y,p.z);uv.push(col/sides,row/steps);
      if(row<steps&&col<sides){const i=row*(sides+1)+col;indices.push(i,i+sides+1,i+1,i+1,i+sides+1,i+sides+2);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.name='open-rock-passage';parent.add(mesh);
  const floorVertices:number[]=[],floorUv:number[]=[],floorIndices:number[]=[];
  for(let row=0;row<=steps;row++){
    const centre=curve.getPoint(row/steps),tangent=curve.getTangent(row/steps),side=point(tangent.z,0,-tangent.x).normalize();
    for(const sign of [-1,1]){const p=centre.clone().addScaledVector(side,sign*width/2);floorVertices.push(p.x,p.y,p.z);floorUv.push((sign+1)/2,row/steps);}
    if(row<steps){const i=row*2;floorIndices.push(i,i+1,i+2,i+1,i+3,i+2);}
  }
  const ground=new THREE.BufferGeometry();ground.setAttribute('position',new THREE.Float32BufferAttribute(floorVertices,3));ground.setAttribute('uv',new THREE.Float32BufferAttribute(floorUv,2));ground.setIndex(floorIndices);ground.computeVertexNormals();parent.add(new THREE.Mesh(ground,floorMaterial));
}
function slab(parent:THREE.Group,w:number,d:number,x:number,z:number,material:THREE.Material,y=-.12){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,.24,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}

/** Rock mass around each mouth keeps the junction enclosed and hides distant rooms. */
function portalWall(parent:THREE.Group,z:number,width:number,height:number,openings:readonly (readonly [number,number,number])[],material:THREE.Material){
  const shape=new THREE.Shape();shape.moveTo(-width/2,-.4);shape.lineTo(width/2,-.4);shape.lineTo(width/2,height);shape.lineTo(-width/2,height);shape.closePath();
  for(const [x,w,h] of openings){
    const hole=new THREE.Path();hole.moveTo(x-w/2,-.08);
    for(let i=0;i<=24;i++){const angle=Math.PI-i/24*Math.PI;hole.lineTo(x+Math.cos(angle)*w/2,Math.sin(angle)*h);}
    hole.lineTo(x+w/2,-.08);hole.closePath();shape.holes.push(hole);
  }
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:1.1,bevelEnabled:true,bevelThickness:.12,bevelSize:.08,bevelSegments:2,curveSegments:16});
  const positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,(positions.getX(i)+width/2)/width,(positions.getY(i)+.4)/(height+.4));
  const wall=new THREE.Mesh(geometry,material);wall.name='rock-wall-with-open-portals';wall.position.z=z;parent.add(wall);
}

/** Static extensions share the bridge model's world frame and lifetime. */
export function buildOpeningCavern(parent:THREE.Group,materials:Materials){
  const root=new THREE.Group();root.name='opening-cavern-extensions';parent.add(root);
  const ford=new THREE.Group();ford.name='shallow-ford';ford.position.set(...openingCavernOrigins['SHALLOW-FORD']!);root.add(ford);
  slab(ford,11,10,0,0,materials.ground);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(10,2.8,24,8),new THREE.MeshStandardMaterial({color:0x527b78,roughness:.24,metalness:.18,transparent:true,opacity:.61,side:THREE.DoubleSide}));
  water.name='shallow-ford-water';water.rotation.x=-Math.PI/2;water.position.set(0,.035,.7);ford.add(water);
  const pebbleGeometry=new THREE.IcosahedronGeometry(1,1),pebbles=new THREE.InstancedMesh(pebbleGeometry,materials.stone,96),pose=new THREE.Object3D();
  for(let i=0;i<96;i++){
    const x=Math.sin(i*23.17)*4.7,z=Math.sin(i*7.93)*4.5;
    pose.position.set(x,Math.abs(z-.7)<1.4?-.04:.035,z);pose.rotation.set(i*.31,i*.73,i*.13);
    const size=.08+(Math.sin(i*4.1)+1)*.12;pose.scale.set(size*1.5,size*.5,size);pose.updateMatrix();pebbles.setMatrixAt(i,pose.matrix);
  }
  pebbles.name='ford-pebbles';pebbles.computeBoundingSphere();ford.add(pebbles);
  // Smoothed southern mouth, linked to the northeast return at the junction.
  passage(ford,[point(0,0,2.6),point(0,0,4.7),point(0,0,7)],3.3,3.1,materials.stone,materials.ground);
  portalWall(ford,2.6,12,7,[[0,3.4,3.2]],materials.stone);
  for(const side of [-1,1]){
    const rim=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),materials.stone);rim.position.set(side*2.8,1.4,2.6);rim.scale.set(.95,1.9,1.2);ford.add(rim);
  }
  for(const side of [-1,1])for(let i=0;i<7;i++){
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),materials.stone);
    rock.position.set(side*(4.8+.35*Math.sin(i)),1.1,-4.6+i*1.4);rock.scale.set(1.2,1.9,1.1);rock.rotation.y=i*.71;ford.add(rock);
    if(i<4){const formation=new THREE.Mesh(new THREE.ConeGeometry(.45,2.4+i*.2,7),materials.stone);formation.position.set(side*(2.7+i*.4),1.2+i*.1,-3.5+i*.5);ford.add(formation);}
  }
  // The southwest path from Great Cavern turns into the northern ford approach.
  const path=new THREE.Group();root.add(path);
  slab(path,9,2,-7.5,13.5,materials.ground,.88);
  slab(path,3,5,-12,14.5,materials.ground,.88);
  const tunnel=new THREE.Group();tunnel.name='dark-tunnel';tunnel.position.set(...openingCavernOrigins['DARK-TUNNEL']!);root.add(tunnel);
  slab(tunnel,8,9,0,0,materials.dust);
  passage(tunnel,[point(0,0,-7),point(0,0,-4),point(0,0,-2)],3.3,3.1,materials.stone,materials.dust);
  passage(tunnel,[point(-1.7,0,1),point(-3,0,3.3),point(-4.5,0,7)],3.6,3.1,materials.stone,materials.dust);
  passage(tunnel,[point(1.7,0,1),point(2.8,0,3.3),point(4,0,7)],2.2,2.8,materials.stone,materials.dust);
  portalWall(tunnel,2.3,11,5,[[-2.6,3.8,3.3],[2.4,2.5,3]],materials.stone);
  // Outer walls join the ceiling; a northern return opening remains in the rear wall.
  portalWall(tunnel,-4.1,11,5,[[0,3.4,3.2]],materials.stone);
  for(const side of [-1,1]){
    const wall=new THREE.Mesh(new THREE.BoxGeometry(1,5,7),materials.stone);wall.position.set(side*4.7,2.1,-.3);tunnel.add(wall);
  }
  // Ceiling spans the junction; the three passage mouths remain uncapped.
  const roof=new THREE.Mesh(new THREE.SphereGeometry(5,20,10,0,Math.PI*2,0,Math.PI/2),materials.stone);roof.position.y=2.8;roof.scale.y=.3;tunnel.add(roof);
  for(const side of [-1,1]){
    const pillar=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),materials.stone);pillar.position.set(side*3.6,1.25,-.6);pillar.scale.set(.8,1.7,1.2);tunnel.add(pillar);
  }
  const leafMaterial=new THREE.MeshStandardMaterial({color:0x765337,roughness:1,side:THREE.DoubleSide});
  const leaves=new THREE.InstancedMesh(new THREE.CircleGeometry(.09,5),leafMaterial,180);
  for(let i=0;i<180;i++){
    pose.position.set(Math.sin(i*8.71)*3.5,.022,-1.6+(Math.sin(i*3.17)+1)*2.6);pose.rotation.set(-Math.PI/2,0,i*.79);pose.scale.set(1,.5+(i%3)*.25,1);pose.updateMatrix();leaves.setMatrixAt(i,pose.matrix);
  }
  leaves.name='decorative-leaf-litter';leaves.computeBoundingSphere();tunnel.add(leaves);
  const twigMaterial=new THREE.MeshStandardMaterial({color:0x65513c,roughness:1});
  const twigs=new THREE.InstancedMesh(new THREE.CylinderGeometry(.018,.025,.7,5),twigMaterial,24);
  for(let i=0;i<24;i++){pose.position.set(Math.sin(i*7.3)*3,.045,Math.cos(i*4.13)*3);pose.rotation.set(Math.PI/2,i*.7,.5);pose.scale.set(1,1,1);pose.updateMatrix();twigs.setMatrixAt(i,pose.matrix);}
  twigs.name='decorative-twigs';twigs.computeBoundingSphere();tunnel.add(twigs);
  return root;
}

/** Small UV patches sample rock and floor from the proposed room images. */
export function mountOpeningCavern(parent:THREE.Group){
  let disposed=false;
  const textures:THREE.Texture[]=[];
  const material=(url:string,patch:readonly [number,number,number,number])=>{
    const surface=new THREE.MeshStandardMaterial({color:0xc6c7bd,roughness:1,side:THREE.DoubleSide});
    const map=new THREE.TextureLoader().load(url,texture=>{
      if(disposed)return;
      // Extract an atlas patch at runtime so repeating stone never repeats the
      // picture's tunnel openings or stalagmite silhouettes across a wall.
      const image=texture.image,canvas=document.createElement('canvas');canvas.width=canvas.height=512;
      const ctx=canvas.getContext('2d')!;
      ctx.drawImage(image,patch[0]*image.width,(1-patch[1]-patch[3])*image.height,patch[2]*image.width,patch[3]*image.height,0,0,512,512);
      const atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace;atlas.wrapS=atlas.wrapT=THREE.RepeatWrapping;atlas.repeat.set(6,6);
      textures.push(atlas);surface.map=atlas;surface.needsUpdate=true;
      textures.splice(textures.indexOf(texture),1);texture.dispose();
    },undefined,()=>{if(!disposed){surface.map=null;surface.needsUpdate=true;}});
    textures.push(map);
    return surface;
  };
  const root=buildOpeningCavern(parent,{
    stone:material(fordReference,[.57,.52,.12,.13]),
    ground:material(fordReference,[.35,.1,.17,.13]),
    dust:material(tunnelReference,[.42,.04,.18,.16]),
  });
  return {dispose(){
    if(disposed)return;disposed=true;
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    root.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);if(node instanceof THREE.InstancedMesh)node.dispose();for(const mat of Array.isArray(node.material)?node.material:[node.material])materials.add(mat);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();
  }};
}
