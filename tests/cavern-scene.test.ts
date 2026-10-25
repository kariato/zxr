import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {addCavernTargets,mountCavernScene,cavernSceneOffset} from '../src/prototype/cavern-scene.ts';

function asset(){
  const scene=new THREE.Group(),geometry=new THREE.BoxGeometry(),texture=new THREE.Texture();
  const material=new THREE.MeshStandardMaterial({map:texture});scene.add(new THREE.Mesh(geometry,material));
  return {scene,geometry,texture,material,gltf:{scene} as unknown as GLTF};
}
describe('shared cavern lifecycle',()=>{
  it('discards and releases a late response after leaving the room',()=>{
    const model=asset(),parent=new THREE.Group(),status=vi.fn();let ready!:(gltf:GLTF)=>void;
    const texture=vi.spyOn(model.texture,'dispose');
    const mounted=mountCavernScene(parent,'tunnel.glb',status,(_url,done)=>{ready=done;});
    mounted.dispose();ready(model.gltf);
    expect(parent.children).toHaveLength(0);expect(texture).toHaveBeenCalledOnce();
    expect(status.mock.calls.map(call=>call[0])).toEqual(['loading']);
  });
  it('attaches once, reports readiness and releases shared resources once',()=>{
    const model=asset(),parent=new THREE.Group(),status=vi.fn();
    model.scene.add(new THREE.Mesh(model.geometry,model.material));
    const spies=[model.geometry,model.material,model.texture].map(resource=>vi.spyOn(resource,'dispose'));
    const mounted=mountCavernScene(parent,'tunnel.glb',status,(_url,ready)=>ready(model.gltf));
    expect(model.scene.parent?.parent).toBe(parent);
    expect(status.mock.calls.map(call=>call[0])).toEqual(['loading','ready']);
    mounted.dispose();mounted.dispose();expect(parent.children).toHaveLength(0);
    for(const spy of spies)expect(spy).toHaveBeenCalledOnce();
  });
  it('reports failure without adding a partial room model',()=>{
    const parent=new THREE.Group(),status=vi.fn();
    const mounted=mountCavernScene(parent,'missing.glb',status,(_url,_ready,failed)=>failed());
    expect(status).toHaveBeenLastCalledWith('failed');expect(parent.children[0]?.children).toHaveLength(0);
    mounted.dispose();expect(parent.children).toHaveLength(0);
  });
  it('creates hit targets only for currently observed environmental objects',()=>{
    const parent=new THREE.Group();
    const targets=addCavernTargets(parent,new Set(['BRIDGE','STREAM','DRAGON']),[]);
    expect(targets.map(target=>target.userData.object)).toEqual(['BRIDGE','STREAM']);
    expect(targets.every(target=>(target.material as THREE.Material).visible===false)).toBe(true);
  });
  it('keeps the bridge target on the deck when the shared model moves to the Foot Bridge origin',()=>{
    const parent=new THREE.Group();parent.position.set(...cavernSceneOffset('FOOT-BRIDGE')!);
    const targets=addCavernTargets(parent,new Set(['BRIDGE','CHASM']),[]);parent.updateMatrixWorld(true);
    expect(targets.map(target=>target.userData.object)).toEqual(['BRIDGE','CHASM']);
    const ray=new THREE.Raycaster(new THREE.Vector3(0,1.6,0),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(targets)[0];
    expect(hit?.object.userData.object).toBe('BRIDGE');expect(hit?.point.y).toBeCloseTo(.21);
    expect(cavernSceneOffset('SHALLOW-FORD')).toBeUndefined();
  });
});

it('keeps only the observed moss target when viewing the shared model from Great Cavern',()=>{
  const parent=new THREE.Group();parent.position.set(...cavernSceneOffset('GREAT-CAVERN')!);
  const targets=addCavernTargets(parent,new Set(['MOSS']),[]);parent.updateMatrixWorld(true);
  expect(targets.map(target=>target.userData.object)).toEqual(['MOSS']);
  expect(targets[0]!.getWorldPosition(new THREE.Vector3()).z).toBe(0);
});
