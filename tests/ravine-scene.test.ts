import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ravineSceneOffset,ravinePreviewPose,mountRavineScene,addRavineTargets} from '../src/prototype/ravine-scene.ts';

it('excludes deferred rooms and uses the retained artwork projection for every preview',()=>{
  for(const room of ['STREAM-PATH','MARBLE-HALL','DEEP-FORD','RAVINE-LEDGE','LEDGE-TUNNEL']){
    expect(ravineSceneOffset(room)).toHaveLength(3);
    const pose=ravinePreviewPose(room);expect(pose.pitch).toBeCloseTo(-35*Math.PI/180);
    expect(Math.atan2(pose.position[1],pose.position[2])).toBeCloseTo(-pose.pitch);
  }
  for(const room of [null,'TINY-ROOM','DREARY-ROOM','FORMAL-GARDEN'])expect(ravineSceneOffset(room)).toBeUndefined();
});
it('cancels late model loading on darkness or family exit and releases embedded textures',()=>{
  const parent=new THREE.Group(),scene=new THREE.Group(),map=new THREE.Texture();
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({map});scene.add(new THREE.Mesh(geometry,material));
  const spies=[map,geometry,material].map(x=>vi.spyOn(x,'dispose'));let ready!:(gltf:GLTF)=>void;
  const status=vi.fn(),mounted=mountRavineScene(parent,'ravine.glb',status,(_url,loaded)=>{ready=loaded;});
  mounted.dispose();mounted.dispose();ready({scene} as unknown as GLTF);
  expect(parent.children).toHaveLength(0);expect(status).not.toHaveBeenCalledWith('ready');for(const spy of spies)expect(spy).toHaveBeenCalledOnce();
});
it('reports missing models and only exposes observed source identities as hit targets',()=>{
  const parent=new THREE.Group(),status=vi.fn();
  const mounted=mountRavineScene(parent,'missing.glb',status,(_url,_ready,failed)=>failed());expect(status).toHaveBeenLastCalledWith('failed');mounted.dispose();
  expect(addRavineTargets(parent,'DEEP-FORD',new Set(['GLOBAL-WATER']),[]).map(x=>x.userData.object)).toEqual(['GLOBAL-WATER']);
  expect(addRavineTargets(parent,'STREAM-PATH',new Set(['PDOOR','PWINDOW']),[])).toEqual([]);
});
