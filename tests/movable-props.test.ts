import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { movablePropFiles,movablePropDefinitions } from '../src/prototype/movable-props.generated.ts';
import { mountPropModel,posePropModel,releasePropModels } from '../src/prototype/prop-model.ts';

it('ships a matching current export for every registry entry with intact embedded geometry',()=>{
  const manifest=JSON.parse(readFileSync('src/prototype/assets/movable-props.json','utf8'));
  const catalog=JSON.parse(readFileSync('games/zork2/assets/catalog.json','utf8'));
  expect(manifest.assets).toHaveLength(39);
  expect(new Set(manifest.assets.map((a:any)=>a.id)).size).toBe(39);
  expect(movablePropDefinitions).toHaveLength(46);
  expect(Object.keys(movablePropFiles).sort()).toEqual(manifest.assets.map((a:any)=>a.id).sort());
  for(const asset of manifest.assets){
    const object=catalog.objects.find((o:any)=>o.sourceIdentity===asset.id);
    expect(object.flags).toContain('TAKEBIT');expect(object.kind).toBe('prop');
    expect(asset.sourceHash).toBe(object.sourceHash);expect(asset.briefHash).toBe(object.briefHash);
    expect(movablePropFiles[asset.id as keyof typeof movablePropFiles]).toBe(asset.file);
    const binary=readFileSync('src/prototype/assets/'+asset.file);
    expect(createHash('sha256').update(binary).digest('hex')).toBe(asset.sha256);
    expect(binary.toString('ascii',0,4)).toBe('glTF');expect(binary.readUInt32LE(4)).toBe(2);expect(binary.readUInt32LE(8)).toBe(binary.length);
    const json=JSON.parse(binary.toString('utf8',20,20+binary.readUInt32LE(12)));
    expect(json.meshes.length).toBeGreaterThan(0);
    expect(json.buffers.every((b:any)=>!b.uri)).toBe(true);
    expect((json.images??[]).every((i:any)=>!i.uri)).toBe(true);
    expect(asset.source).not.toMatch(/raw|rejected/);
  }
  expect(manifest.assets.find((a:any)=>a.id==='CHEST').source).toMatch(/animated.glb$/);
});

it('clones one prop asset across room placements without changing cached pose or allowing a stale load to reappear',async()=>{
  const scene=new THREE.Group(),hinge=new THREE.Group();hinge.name='chest_lid_hinge';scene.add(hinge);
  const gltf={scene} as unknown as GLTF,load=async()=>gltf;
  const first=new THREE.Group(),second=new THREE.Group(),a=new THREE.Group(),b=new THREE.Group();first.add(a);second.add(b);
  mountPropModel(a,'chest',m=>posePropModel('CHEST',m,{open:false}),load);
  mountPropModel(b,'chest',m=>posePropModel('CHEST',m,{open:true}),load);
  await Promise.resolve();
  expect(a.visible).toBe(false);expect(b.visible).toBe(false);
  expect(first.children[1]!.getObjectByName(hinge.name)!.rotation.x).toBe(0);
  expect(second.children[1]!.getObjectByName(hinge.name)!.rotation.x).toBe(-1.9);
  expect(hinge.rotation.x).toBe(0);
  let complete!:(value:GLTF)=>void;const parent=new THREE.Group(),body=new THREE.Group();parent.add(body);
  const mount=mountPropModel(body,'late',()=>{},()=>new Promise(resolve=>{complete=resolve;}));
  mount.dispose();complete(gltf);await Promise.resolve();expect(parent.children).toEqual([body]);expect(body.visible).toBe(true);
  releasePropModels();
});

it('fits oversized flat tabletop models uniformly without changing geometry or texture coordinates',()=>{
  for(const id of ['PLACE-MAT','NEWSPAPER','LETTER-OPENER']){
    const geometry=new THREE.BoxGeometry(7,.25,5),model=new THREE.Group();model.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()));
    const positions=Array.from(geometry.attributes.position!.array),uv=Array.from(geometry.attributes.uv!.array);
    posePropModel(id,model,{open:false});posePropModel(id,model,{open:false});
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(.3);expect(size.z/size.x).toBeCloseTo(5/7);expect(size.y/size.x).toBeCloseTo(.25/7);
    expect(Array.from(geometry.attributes.position!.array)).toEqual(positions);expect(Array.from(geometry.attributes.uv!.array)).toEqual(uv);
  }
});
