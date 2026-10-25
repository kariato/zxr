import { describe,it,expect,vi } from 'vitest';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mountPrincessActor } from '../src/prototype/princess-actor.ts';

function asset(){
  const scene=new THREE.Group(),joint=new THREE.Bone();joint.name='Joint';joint.position.y=1;scene.add(joint);
  const geometry=new THREE.BoxGeometry(),texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture});scene.add(new THREE.Mesh(geometry,material));
  const clip=(name:string,height:number)=>new THREE.AnimationClip(name,2,[new THREE.VectorKeyframeTrack('Joint.position',[0,1,2],[0,1,0,0,height,0,0,1,0])]);
  const gltf={scene,animations:[clip('Idle',1.1),clip('Talk',1.5)]} as unknown as GLTF;
  return {gltf,scene,joint,geometry,material,texture};
}
describe('princess actor lifecycle',()=>{
  it('runs idle, plays a body gesture once, then returns to idle',()=>{
    const a=asset(),parent=new THREE.Group(),status=vi.fn();
    const actor=mountPrincessActor(parent,'local.glb',status,(_url,ready)=>ready(a.gltf));
    expect(status.mock.calls.map(c=>c[0])).toEqual(['loading','ready']);
    actor.update(.5);expect(a.joint.position.y).toBeCloseTo(1.05);
    actor.gesture();actor.update(.5);expect(a.joint.position.y).toBeCloseTo(1.25);
    for(let i=0;i<25;i++)actor.update(.1);
    expect(a.joint.position.y).toBeCloseTo(1.1);
    actor.dispose();
  });
  it('releases a late load after leaving the room without attaching or announcing it',()=>{
    const a=asset(),parent=new THREE.Group(),status=vi.fn();let finish!:(gltf:GLTF)=>void;
    const dispose=vi.spyOn(a.texture,'dispose');
    const actor=mountPrincessActor(parent,'local.glb',status,(_url,ready)=>{finish=ready;});
    actor.dispose();finish(a.gltf);
    expect(parent.children).toHaveLength(0);expect(status).toHaveBeenCalledTimes(1);expect(dispose).toHaveBeenCalledOnce();
  });
  it('releases loaded GPU resources once and retains the fallback after a failed load',()=>{
    const a=asset(),parent=new THREE.Group();
    const texture=vi.spyOn(a.texture,'dispose'),geometry=vi.spyOn(a.geometry,'dispose'),material=vi.spyOn(a.material,'dispose');
    const actor=mountPrincessActor(parent,'local.glb',()=>{},(_url,ready)=>ready(a.gltf));
    actor.dispose();actor.dispose();expect(texture).toHaveBeenCalledOnce();expect(geometry).toHaveBeenCalledOnce();expect(material).toHaveBeenCalledOnce();
    const status=vi.fn();const failed=mountPrincessActor(parent,'missing.glb',status,(_url,_ready,fail)=>fail());
    expect(status).toHaveBeenLastCalledWith('failed');expect(parent.children).toHaveLength(1);failed.dispose();
  });
});
