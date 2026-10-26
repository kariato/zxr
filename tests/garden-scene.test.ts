import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {mountGardenScene,addGardenTargets,gardenSceneOffset} from '../src/prototype/garden-scene.ts';

it('keeps the embedded skybox unlit and unfogged and releases shared GLB resources once',()=>{
  const scene=new THREE.Group(),parent=new THREE.Group(),map=new THREE.Texture();
  const material=new THREE.MeshBasicMaterial({map}),geometry=new THREE.SphereGeometry(10,8,4);
  const sky=new THREE.Mesh(geometry,material);sky.userData.role='skybox';scene.add(sky,new THREE.Mesh(geometry,material));
  const spies=[map,material,geometry].map(value=>vi.spyOn(value,'dispose'));
  const status=vi.fn(),mounted=mountGardenScene(parent,'garden.glb',status,(_url,ready)=>ready({scene} as unknown as GLTF));
  expect(status.mock.calls.map(c=>c[0])).toEqual(['loading','ready']);
  expect(sky.renderOrder).toBe(-100);expect(material.fog).toBe(false);expect(material.depthWrite).toBe(false);
  mounted.dispose();mounted.dispose();expect(parent.children).toHaveLength(0);
  for(const spy of spies)expect(spy).toHaveBeenCalledOnce();
});

it('discards late garden loads after leaving or entering source darkness',()=>{
  const scene=new THREE.Group(),parent=new THREE.Group(),map=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map});
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
  const spy=vi.spyOn(map,'dispose'),status=vi.fn();let ready!:(gltf:GLTF)=>void;
  const mounted=mountGardenScene(parent,'garden.glb',status,(_url,loaded)=>{ready=loaded;});
  mounted.dispose();ready({scene} as unknown as GLTF);
  expect(parent.children).toHaveLength(0);expect(spy).toHaveBeenCalledOnce();expect(status).not.toHaveBeenCalledWith('ready');
});

it('reports a missing GLB without retaining a partial garden',()=>{
  const parent=new THREE.Group(),status=vi.fn();
  const mounted=mountGardenScene(parent,'missing.glb',status,(_url,_ready,failed)=>failed());
  expect(status).toHaveBeenLastCalledWith('failed');expect(parent.children[0]!.children).toHaveLength(0);mounted.dispose();
});

it('creates garden interactions only for source-observed objects in the current room',()=>{
  const parent=new THREE.Group();
  expect(addGardenTargets(parent,'GARDEN-NORTH',new Set(['GAZEBO','MOSS','UNICORN']),[]).map(t=>t.userData.object)).toEqual(['MOSS','GAZEBO']);
  expect(addGardenTargets(parent,'GAZEBO-ROOM',new Set(['GAZEBO-TABLE']),[]).map(t=>t.userData.object)).toEqual(['GAZEBO-TABLE']);
  expect(addGardenTargets(parent,'TOPIARY-ROOM',new Set(['MOSS']),[]).map(t=>t.userData.object)).toEqual(['MOSS']);
  expect(gardenSceneOffset(null)).toBeUndefined();expect(gardenSceneOffset('DARK-TUNNEL')).toBeUndefined();
});
