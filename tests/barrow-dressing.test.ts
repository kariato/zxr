import { afterEach,describe,expect,it,vi } from 'vitest';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mountBarrowDressing } from '../src/prototype/barrow-dressing.ts';

function canvas(){
  vi.stubGlobal('document',{createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})});
}
function asset(){
  const scene=new THREE.Group(),geometry=new THREE.BoxGeometry(),texture=new THREE.Texture();
  const material=new THREE.MeshStandardMaterial({map:texture});scene.add(new THREE.Mesh(geometry,material));
  return {scene,geometry,texture,material,gltf:{scene} as unknown as GLTF};
}
afterEach(()=>vi.unstubAllGlobals());
describe('optional barrow dressing lifecycle',()=>{
  it('disposes late loads after leaving the room without attaching them',()=>{
    canvas();const a=asset(),parent=new THREE.Group(),status=vi.fn();let ready!:(g:GLTF)=>void;
    const texture=vi.spyOn(a.texture,'dispose');
    const actor=mountBarrowDressing(parent,'local.glb',8,7,status,(_url,done)=>{ready=done;});
    actor.dispose();ready(a.gltf);
    expect(parent.children).toHaveLength(0);expect(texture).toHaveBeenCalledOnce();
    expect(status.mock.calls.map(c=>c[0])).toEqual(['loading']);
  });
  it('replaces fallback and releases loaded resources once',()=>{
    canvas();const a=asset(),parent=new THREE.Group(),status=vi.fn();
    const texture=vi.spyOn(a.texture,'dispose'),geometry=vi.spyOn(a.geometry,'dispose'),material=vi.spyOn(a.material,'dispose');
    const actor=mountBarrowDressing(parent,'local.glb',8,7,status,(_url,ready)=>ready(a.gltf));
    expect(a.scene.parent?.children[0]).toBe(a.scene);
    expect(status.mock.calls.map(c=>c[0])).toEqual(['loading','ready']);
    actor.dispose();actor.dispose();expect(parent.children).toHaveLength(0);
    for(const spy of [texture,geometry,material])expect(spy).toHaveBeenCalledOnce();
  });
  it('retains original scene geometry after load failure',()=>{
    canvas();const parent=new THREE.Group(),status=vi.fn();
    const actor=mountBarrowDressing(parent,'missing.glb',8,7,status,(_url,_ready,fail)=>fail());
    expect(status).toHaveBeenLastCalledWith('failed');expect(parent.children[0]?.children[0]?.children.length).toBeGreaterThan(0);
    actor.dispose();expect(parent.children).toHaveLength(0);
  });
});
