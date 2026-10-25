import {expect,it} from 'vitest';
import * as THREE from 'three';
import {buildOpeningCavern,openingCavernOrigins} from '../src/prototype/opening-cavern.ts';
import {addCavernTargets,cavernSceneOffset} from '../src/prototype/cavern-scene.ts';

it('provides a level bed beneath the shallow water and an open head-height crossing',()=>{
  const parent=new THREE.Group(),stone=new THREE.MeshStandardMaterial({side:THREE.DoubleSide});
  const root=buildOpeningCavern(parent,{stone,ground:stone,dust:stone});parent.updateMatrixWorld(true);
  const origin=new THREE.Vector3(...openingCavernOrigins['SHALLOW-FORD']!);
  const water=root.getObjectByName('shallow-ford-water')!;
  expect(water.getWorldPosition(new THREE.Vector3()).y-origin.y).toBeCloseTo(.035);
  const down=new THREE.Raycaster(origin.clone().add(new THREE.Vector3(0,1.6,-2)),new THREE.Vector3(0,-1,0));
  const hits=down.intersectObject(root,true);
  expect(hits.some(hit=>Math.abs(hit.point.y-origin.y)<.001)).toBe(true);
  expect(hits[0]!.point.y-origin.y).toBeLessThan(.25);
  const forward=new THREE.Raycaster(origin.clone().add(new THREE.Vector3(0,1.6,-3)),new THREE.Vector3(0,0,1),0,9);
  expect(forward.intersectObject(root,true)).toHaveLength(0);
});

it('uses the ford water alias without exposing the bridge, stream or chasm as objects',()=>{
  const parent=new THREE.Group();parent.position.set(...cavernSceneOffset('SHALLOW-FORD')!);
  const targets=addCavernTargets(parent,new Set(['GLOBAL-WATER']),[]);parent.updateMatrixWorld(true);
  expect(targets.map(t=>t.userData.object)).toEqual(['GLOBAL-WATER']);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,1.6,.7),new THREE.Vector3(0,-1,0));
  expect(ray.intersectObjects(targets)[0]?.object.userData.object).toBe('GLOBAL-WATER');
});

it('keeps the lit tunnel return passage open toward the same ford mouth',()=>{
  const parent=new THREE.Group(),stone=new THREE.MeshStandardMaterial({side:THREE.DoubleSide});
  const root=buildOpeningCavern(parent,{stone,ground:stone,dust:stone});parent.updateMatrixWorld(true);
  const origin=new THREE.Vector3(...openingCavernOrigins['DARK-TUNNEL']!);
  const ray=new THREE.Raycaster(origin.clone().add(new THREE.Vector3(0,1.6,0)),new THREE.Vector3(0,0,-1),0,10);
  expect(ray.intersectObject(root,true)).toHaveLength(0);
  expect(root.getObjectByName('decorative-leaf-litter')).toBeDefined();
});
