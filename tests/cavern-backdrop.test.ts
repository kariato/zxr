import { expect,it,vi } from 'vitest';
import * as THREE from 'three';
import { mountCavernBackdrop } from '../src/prototype/cavern-backdrop.ts';

const view=(id:string,lit=true)=>({lit,room:{id}});
function fixture(){
  const scene=new THREE.Scene();let ready!:(texture:THREE.Texture)=>void,failed!:()=>void;
  const load=vi.fn((r:typeof ready,f:typeof failed)=>{ready=r;failed=f;});
  const backdrop=mountCavernBackdrop(scene,load);
  return {scene,load,backdrop,ready:(t:THREE.Texture)=>ready(t),failed:()=>failed()};
}
it('loads lazily, reuses one texture across caverns and clears it outside the visible slice',()=>{
  const f=fixture();f.backdrop.update(view('CRYPT-ROOM'));f.backdrop.update(view('NARROW-TUNNEL',false));expect(f.load).not.toHaveBeenCalled();
  f.backdrop.update(view('NARROW-TUNNEL'));expect(f.load).toHaveBeenCalledTimes(1);const texture=new THREE.Texture();f.ready(texture);
  expect(f.scene.background).toBe(texture);expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping);expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
  f.backdrop.update(view('FOOT-BRIDGE'));expect(f.scene.background).toBe(texture);expect(f.load).toHaveBeenCalledTimes(1);
  for(const v of [view('FOOT-BRIDGE',false),{lit:false,room:null},view('CRYPT-ROOM'),view('CRYPT-ROOM')]){f.backdrop.update(v);expect(f.scene.background).toBeNull();}
  f.backdrop.dispose();
});
it('late image loads cannot reveal a dark room or replace another room background',()=>{
  for(const replacement of [view('NARROW-TUNNEL',false),view('CRYPT-ROOM'),view('CRYPT-ROOM')]){
    const f=fixture();f.backdrop.update(view('NARROW-TUNNEL'));f.backdrop.update(replacement);
    const texture=new THREE.Texture();f.ready(texture);expect(f.scene.background).toBeNull();
    f.backdrop.update(view('FOOT-BRIDGE'));expect(f.scene.background).toBe(texture);expect(f.load).toHaveBeenCalledTimes(1);f.backdrop.dispose();
  }
});
it('load failure leaves a usable empty background and retries only on a new visit',()=>{
  const f=fixture();f.backdrop.update(view('NARROW-TUNNEL'));f.failed();expect(f.scene.background).toBeNull();
  f.backdrop.update(view('NARROW-TUNNEL'));expect(f.load).toHaveBeenCalledTimes(1);
  f.backdrop.update(view('CRYPT-ROOM'));f.backdrop.update(view('NARROW-TUNNEL'));expect(f.load).toHaveBeenCalledTimes(2);
  const texture=new THREE.Texture();f.ready(texture);expect(f.scene.background).toBe(texture);f.backdrop.dispose();
});
it('disposes a texture exactly once, including when its load finishes after teardown',()=>{
  for(const late of [false,true]){
    const f=fixture();f.backdrop.update(view('NARROW-TUNNEL'));const texture=new THREE.Texture(),dispose=vi.spyOn(texture,'dispose');
    if(!late)f.ready(texture);f.backdrop.dispose();if(late)f.ready(texture);f.backdrop.dispose();
    f.backdrop.update(view('FOOT-BRIDGE'));expect(f.scene.background).toBeNull();expect(dispose).toHaveBeenCalledTimes(1);expect(f.load).toHaveBeenCalledTimes(1);
  }
});

it('caches distinct barrow and cavern images and applies only the current room, even with reversed load completion',()=>{
  const scene=new THREE.Scene(),callbacks=new Map<string,(t:THREE.Texture)=>void>(),load=vi.fn((ready:(t:THREE.Texture)=>void,_failed:()=>void,key:string)=>callbacks.set(key,ready));
  const backdrop=mountCavernBackdrop(scene,load),barrow=new THREE.Texture(),cavern=new THREE.Texture();
  backdrop.update(view('INSIDE-BARROW'));backdrop.update(view('NARROW-TUNNEL'));callbacks.get('cavern')!(cavern);expect(scene.background).toBe(cavern);
  callbacks.get('barrow')!(barrow);expect(scene.background).toBe(cavern);backdrop.update(view('INSIDE-BARROW'));expect(scene.background).toBe(barrow);
  backdrop.update(view('INSIDE-BARROW',false));expect(scene.background).toBeNull();backdrop.update(view('FOOT-BRIDGE'));expect(scene.background).toBe(cavern);expect(load).toHaveBeenCalledTimes(2);
  const a=vi.spyOn(barrow,'dispose'),b=vi.spyOn(cavern,'dispose');backdrop.dispose();expect(a).toHaveBeenCalledTimes(1);expect(b).toHaveBeenCalledTimes(1);
});
it('loads the distinct lair panorama only for a lit observed lair and reuses it after darkness',()=>{
  const f=fixture();f.backdrop.update(view('DRAGON-LAIR',false));expect(f.load).not.toHaveBeenCalled();
  f.backdrop.update(view('DRAGON-LAIR'));expect(f.load).toHaveBeenCalledWith(expect.any(Function),expect.any(Function),'lair');
  const texture=new THREE.Texture();f.ready(texture);expect(f.scene.background).toBe(texture);
  f.backdrop.update(view('DRAGON-LAIR',false));expect(f.scene.background).toBeNull();f.backdrop.update(view('DRAGON-LAIR'));expect(f.scene.background).toBe(texture);expect(f.load).toHaveBeenCalledTimes(1);f.backdrop.dispose();
});
