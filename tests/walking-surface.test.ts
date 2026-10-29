import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import * as THREE from 'three';
import {walkingSurfaces,walkingHeight,walkingStep,mountWalkingSurface} from '../src/prototype/walking-surface.ts';

it('supports every room origin and keeps the floors separate, invisible and free of source actions',()=>{
  for(const [room,surface] of Object.entries(walkingSurfaces)){
    expect(walkingHeight(room,0,0)).toBeCloseTo(0,1);
    expect(surface.triangles.length).toBeGreaterThan(10);
    const parent=new THREE.Group(),floor=mountWalkingSurface(parent,room)!;
    expect(floor.userData.role).toBe('walking_surface');expect(floor.material.visible).toBe(false);expect(floor.userData.object).toBeUndefined();expect(floor.userData.action).toBeUndefined();
  }
  expect(walkingHeight('TINY-ROOM',0,0)).toBeUndefined();expect(walkingHeight(null,0,0)).toBeUndefined();
});
it('allows local walking, follows sampled height and stops at missing support without teleporting',()=>{
  let x=0,y=walkingHeight('GARDEN-NORTH',0,0)!,z=0;
  for(let i=0;i<150;i++)({x,y,z}=walkingStep('GARDEN-NORTH',x,y,z,.02,0));
  expect(x).toBeGreaterThan(.1);expect(x).toBeLessThan(1.6);expect(y).toBeCloseTo(walkingHeight('GARDEN-NORTH',x,z)!,5);
  const before={x,y,z};expect(walkingStep('GARDEN-NORTH',x,y,z,100,100)).toEqual(before);
});
it('uses path-level garden spawns and retains the corrected ravine origins',()=>{
  expect(walkingSurfaces['FORMAL-GARDEN']!.origin[1]).toBeGreaterThan(1);
  expect(walkingSurfaces['FORMAL-GARDEN']!.origin[1]).toBeLessThan(2);
  expect(walkingSurfaces['LEDGE-TUNNEL']!.origin[1]).toBeLessThan(7);
  expect(walkingSurfaces['LEDGE-TUNNEL']!.origin[2]).toBeGreaterThan(-18);
});

it('matches the recorded runtime assets and authored walking floor data',()=>{
  const record=JSON.parse(readFileSync('games/zork2/planning/walking-surfaces/verification.json','utf8'));
  for(const source of record.inputs)expect(createHash('sha256').update(readFileSync(source.asset)).digest('hex')).toBe(source.sha256);
  expect(JSON.parse(readFileSync('games/zork2/planning/walking-surfaces/surfaces.json','utf8'))).toEqual(walkingSurfaces);
});

it('keeps the rebuilt garden paths aligned across rooms and excludes the planted statue beds',async()=>{
  const {gardenLayout}=await import('../src/prototype/garden-layout.generated.ts');
  const rooms=['GARDEN-NORTH','FORMAL-GARDEN','TOPIARY-ROOM'];
  for(const room of rooms){
    const surface=walkingSurfaces[room]!;
    for(const hedge of gardenLayout.topiary){
      expect(walkingHeight(room,hedge.center[0]-surface.origin[0],hedge.center[2]-surface.origin[2])).toBeUndefined();
    }
    // Every room shares the same gravel network in absolute scene space.
    const north=walkingSurfaces['GARDEN-NORTH']!.origin;
    expect(walkingHeight(room,north[0]-surface.origin[0],north[2]-surface.origin[2])).toBeCloseTo(0,5);
  }
  const gazebo=walkingSurfaces['GAZEBO-ROOM']!;
  expect(gazebo.origin[1]).toBeGreaterThan(walkingSurfaces['GARDEN-NORTH']!.origin[1]);
  expect(walkingHeight('GAZEBO-ROOM',0,0)).toBeCloseTo(0,5);
  expect(walkingHeight('GAZEBO-ROOM',3,0)).toBeUndefined();
});
