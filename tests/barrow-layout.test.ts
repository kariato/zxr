import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {barrowStep} from '../src/prototype/barrow-layout.ts';

it('allows walking through the opening, while walls and the passage end stop local movement',()=>{
  expect(barrowStep(0,2.65,0,.2).z).toBeCloseTo(2.85);
  expect(barrowStep(1.5,2.65,0,.2).z).toBe(2.65);
  expect(barrowStep(.55,4,.2,0).x).toBe(.55);
  expect(barrowStep(0,6.65,0,.2).z).toBe(6.65);
  expect(barrowStep(2.65,0,.2,0).x).toBe(2.65);
  expect(barrowStep(0,-2.65,0,-.2).z).toBe(-2.65);
});

it('ships a compact compressed environment without baked movable props',()=>{
  const bytes=readFileSync('src/prototype/assets/barrow-modular-v1.glb');
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  expect(bytes.length).toBeLessThan(2_000_000);
  expect(json.extensionsRequired).toEqual(expect.arrayContaining(['KHR_texture_basisu','EXT_meshopt_compression']));
  expect(json.nodes.some((n:{name?:string;extras?:{engineIdentity?:string}})=>n.name?.startsWith('prop-')||n.extras?.engineIdentity)).toBe(false);
  expect(json.images).toHaveLength(8);
});
