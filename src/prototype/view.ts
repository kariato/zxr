import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import type { GameSession } from '../engine/index.ts';
import type { BrowserPlayer } from '../player/browser.ts';
import type { PlayerView } from '../player/controller.ts';
import { prototypeModel } from './model.ts';

/** Disposable spatial presenter over the existing shared browser controller. */
export function mountPrototype(host:HTMLElement,session:GameSession,player:BrowserPlayer){
  const root=document.createElement('section');root.className='prototype';root.setAttribute('aria-label','3D prototype');host.prepend(root);
  const heading=document.createElement('h2');heading.textContent='Zork II in 3D';root.append(heading);
  const info=document.createElement('p');info.className='prototype-info';root.append(info);
  const viewport=document.createElement('div');viewport.className='prototype-viewport';root.append(viewport);
  const instructions=document.createElement('p');instructions.textContent='Drag to look · WASD / arrow keys to walk locally · Click a prop to choose its action · Exit buttons attempt a game move. VR: point a controller and press its trigger.';root.append(instructions);
  const controls=document.createElement('nav');controls.className='prototype-controls';controls.setAttribute('aria-label','3D controls');root.append(controls);
  const addButton=(label:string,action:()=>void,parent=controls)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);parent.append(b);return b;};
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{
    info.textContent='3D is unavailable in this browser. You can play using the commands below.';return {destroy(){root.remove();}};
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x070c10);
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','3D room. Drag to look and use WASD to walk.');viewport.append(canvas);
  const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x070c10,6,22);
  const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(65,1,.05,60);camera.position.y=1.6;rig.add(camera);scene.add(rig);
  const roomGroup=new THREE.Group(),hand=new THREE.Group();scene.add(roomGroup);camera.add(hand);
  const targets:THREE.Object3D[]=[];let width=2,depth=2,room:string|null=null,identity='',busy=true,disposed=false,yaw=Math.PI,pitch=-.1;
  let view:PlayerView=player.player.view(),menuPage=0,textPage=0,lastText='',hasLayout=false;
  const material=(colour:number)=>new THREE.MeshStandardMaterial({color:colour,roughness:.95,flatShading:true});
  const stone=material(0x55594e),floor=material(0x666457),wood=material(0x65503b),brass=material(0xa68b48),steel=material(0xb0b6b4);
  const box=(parent:THREE.Object3D,size:number[],position:number[],mat:THREE.Material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),mat);mesh.position.set(position[0]!,position[1]!,position[2]!);parent.add(mesh);return mesh;
  };
  const textureLabel=(text:string)=>{
    const surface=document.createElement('canvas');surface.width=512;surface.height=96;const ctx=surface.getContext('2d')!;
    ctx.fillStyle='#102a27ee';ctx.fillRect(0,0,512,96);ctx.fillStyle='#f2d7a1';ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText(text,256,58,490);
    const texture=new THREE.CanvasTexture(surface);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(1.3,.244,1);return sprite;
  };
  const clear=(group:THREE.Group)=>{
    group.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();for(const mat of Array.isArray(node.material)?node.material:[node.material])if(![stone,floor,wood,brass,steel].includes(mat as THREE.MeshStandardMaterial))mat.dispose();}if(node instanceof THREE.Sprite){node.material.map?.dispose();node.material.dispose();}});group.clear();
  };
  const aim=()=>{camera.rotation.set(pitch,yaw,0,'YXZ');};
  const recenter=()=>{rig.position.set(0,0,0);rig.rotation.set(0,0,0);camera.position.set(0,1.6,-Math.max(0,depth/2-1.4));yaw=Math.PI;pitch=-.1;aim();};
  const build=()=>{
    const model=prototypeModel(session.observeAppearance()),changed=room!==model.room;room=model.room;
    clear(roomGroup);clear(hand);targets.length=0;
    const layout=model.layout;hasLayout=!!layout;width=layout?.width??2;depth=layout?.depth??2;
    if(changed){recenter();menuPage=textPage=0;}
    if(!layout)return;
    scene.add(roomGroup);
    roomGroup.add(new THREE.HemisphereLight(0xc5d4c1,0x303025,2));
    const light=new THREE.PointLight(0xf6cb83,18,14,2);light.position.set(.7,2,-1);roomGroup.add(light);
    if(room==='FOOT-BRIDGE'){
      for(let z=-2.85;z<3;z+=.3)box(roomGroup,[2.2,.12,.27],[0,-.08,z],wood);
      for(const x of [-1.05,1.05]){
        box(roomGroup,[.08,.08,6],[x,1,0],wood);
        for(const z of [-2.8,0,2.8])box(roomGroup,[.12,1.1,.12],[x,.5,z],wood);
      }
      // Ravine walls leave the void open below the deck.
      box(roomGroup,[2,12,14],[-6,-2,0],stone);box(roomGroup,[2,12,14],[6,-2,0],stone);
    }else{
      box(roomGroup,[width,.25,depth],[0,-.15,0],floor);
      box(roomGroup,[width+.4,.4,depth+.4],[0,layout.height+.2,0],stone);
      for(const side of [-1,1])for(let z=-depth/2;z<depth/2;z+=.75){
        const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.9,0),stone);
        rock.position.set(side*(width/2+.35),1.35,z);rock.scale.set(.75,1.8,1);roomGroup.add(rock);
      }
      for(const z of [-depth/2,depth/2])for(let x=-width/2;x<=width/2;x+=.65){
        const opening=layout.routes.some(r=>Math.sign(r.z)===Math.sign(z))&&Math.abs(x)<.85;
        if(!opening){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.8,0),stone);rock.position.set(x,1.3,z+.15*Math.sign(z));rock.scale.y=1.9;roomGroup.add(rock);}
      }
    }
    for(const route of layout.routes){
      const label=textureLabel('Go '+route.direction.toLowerCase());label.position.set(route.x,1.45,route.z);label.userData.direction=route.direction;roomGroup.add(label);targets.push(label);
    }
    for(const prop of model.props){
      const group=new THREE.Group();group.userData.object=prop.id;
      if(prop.held){hand.add(group);group.position.set(prop.id==='LAMP'?-.35:.35,-.4,-.65);group.scale.setScalar(.6);}
      else{roomGroup.add(group);group.position.set(prop.id==='SWORD'?-.9:1,.03,room==='INSIDE-BARROW'?.6:0);}
      if(prop.id==='SWORD'){
        box(group,[.75,.04,.1],[0,.025,0],steel);box(group,[.06,.06,.3],[-.4,.04,0],brass);box(group,[.22,.065,.065],[-.54,.04,0],wood);
        group.rotation.y=1.1;
      }else{
        box(group,[.2,.08,.2],[0,.04,0],brass);box(group,[.14,.24,.14],[0,.19,0],brass);
        const glass=new THREE.MeshBasicMaterial({color:prop.on?0xffdb8a:0x59605a});box(group,[.15,.1,.15],[0,.2,0],glass);
        box(group,[.22,.05,.22],[0,.34,0],brass);
        if(prop.on){const lamp=new THREE.PointLight(0xffc87b,8,8,2);lamp.position.y=.35;group.add(lamp);}
      }
      if(!prop.held){const label=textureLabel(prop.name);label.position.set(0,.6,0);group.add(label);}
      const hit=box(group,[1.2,.8,.6],[0,.3,0],new THREE.MeshBasicMaterial({visible:false}));hit.userData.object=prop.id;targets.push(hit);
    }
  };
  const recenterButton=addButton('Recenter view',()=>{recenter();drawMenu();});
  const visibleButton=addButton('Hide 3D',()=>{viewport.hidden=!viewport.hidden;visibleButton.textContent=viewport.hidden?'Show 3D':'Hide 3D';if(viewport.hidden)keys.clear();else resize();});
  const moves=document.createElement('nav');moves.setAttribute('aria-label','Movement attempts');root.append(moves);
  const vr=VRButton.createButton(renderer);vr.removeAttribute('style');vr.className='prototype-vr';controls.append(vr);
  const pad=document.createElement('nav');pad.className='prototype-pad';pad.setAttribute('aria-label','Walk within room');viewport.append(pad);
  const keys=new Set<string>();
  for(const [label,key] of [['◀','a'],['▲','w'],['▼','s'],['▶','d']] as const){
    const b=addButton(label,()=>{},pad);b.setAttribute('aria-label','Walk '+({a:'left',w:'forward',s:'backward',d:'right'}[key]));
    b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);keys.add(key);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(key));
  }
  // VR panel mirrors the shared menu and source transcript; trigger selection
  // uses the very same asynchronous commit/save/host-operation pipeline.
  const surface=document.createElement('canvas');surface.width=1024;surface.height=1024;const ctx=surface.getContext('2d')!;
  const menuTexture=new THREE.CanvasTexture(surface);menuTexture.colorSpace=THREE.SRGBColorSpace;
  const menuMaterial=new THREE.MeshBasicMaterial({map:menuTexture,side:THREE.DoubleSide,depthTest:false});
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.45,1.45),menuMaterial);panel.renderOrder=10;panel.position.set(0,0,-1.65);panel.visible=false;camera.add(panel);
  let menuHits:{y:number;height:number;action:()=>void}[]=[];
  function drawMenu(){
    ctx.fillStyle='#10201f';ctx.fillRect(0,0,1024,1024);ctx.fillStyle='#f2d7a1';ctx.font='bold 34px system-ui';
    ctx.fillText(info.textContent??'ZXR',35,48,950);ctx.fillStyle='#e2ece5';ctx.font='25px system-ui';
    const lines:string[]=[];for(const paragraph of lastText.split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(ctx.measureText(line+' '+word).width>950){lines.push(line);line=word;}else line+=(line?' ':'')+word;}lines.push(line);}
    const textPages=Math.max(1,Math.ceil(lines.length/7));textPage=Math.min(textPage,textPages-1);
    lines.slice(textPage*7,textPage*7+7).forEach((line,i)=>ctx.fillText(line,35,90+i*29));menuHits=[];
    const row=(y:number,label:string,action:()=>void,enabled=true)=>{ctx.fillStyle=enabled?'#2b4741':'#233330';ctx.fillRect(25,y,974,51);ctx.fillStyle=enabled?'#f1eee2':'#80918a';ctx.font='25px system-ui';ctx.fillText(label,40,y+35,945);if(enabled)menuHits.push({y,height:51,action});};
    row(302,`Read text ${textPage+1}/${textPages} · next`,()=>{textPage=(textPage+1)%textPages;drawMenu();});
    ctx.fillStyle='#f2d7a1';ctx.font='bold 28px system-ui';ctx.fillText(view.title,35,394,950);
    const pages=Math.max(1,Math.ceil(view.choices.length/7));menuPage=Math.min(menuPage,pages-1);
    view.choices.slice(menuPage*7,menuPage*7+7).forEach((choice,i)=>row(412+i*58,choice.label,()=>void player.choose(choice.key),!busy));
    row(824,`Choices ${menuPage+1}/${pages} · next`,()=>{menuPage=(menuPage+1)%pages;drawMenu();});
    row(885,'Finish sentence',()=>void player.finish(),!busy&&view.canFinish);
    row(947,'Cancel sentence',()=>void player.cancel(),!busy&&view.canCancel);
    if(view.words){ctx.fillStyle='#f2d7a1';ctx.font='22px system-ui';ctx.fillText('Word picker: use the desktop panel for this prototype.',35,812,950);}
    menuTexture.needsUpdate=true;
  }
  const unsubscribe=player.subscribe((next,isBusy)=>{
    const changed=view.title!==next.title;view=next;busy=isBusy;if(changed)menuPage=0;
    const observation=session.observe(),key=observation.epoch+':'+observation.revision;
    if(key!==identity){identity=key;build();}
    info.textContent=(observation.perception.room?.name??'Darkness')+' · '+observation.moves+' moves'+(room&&!prototypeModel(session.observeAppearance()).layout?' · Text view — room artwork to follow':'');
    lastText=player.player.transcript.map(t=>t.text).filter(Boolean).at(-1)??'';
    moves.replaceChildren();const menu=observation.state==='input'?session.menu('PLAYER').exits:null;
    for(const c of menu?[...menu.primary,...menu.more]:[]){const b=addButton(c.label,()=>void player.walk(c.draft.family.slice(5)),moves);b.disabled=busy;}
    recenterButton.disabled=busy;drawMenu();
  });
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const selectTarget=(hit:THREE.Intersection)=>{
    if(busy)return;let node:THREE.Object3D|null=hit.object;
    while(node){if(node.userData.object){void player.openObject(node.userData.object as string);return;}if(node.userData.direction){void player.walk(node.userData.direction as string);return;}node=node.parent;}
  };
  const controllers=[renderer.xr.getController(0),renderer.xr.getController(1)];
  for(const controller of controllers){
    rig.add(controller);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-6)]),new THREE.LineBasicMaterial({color:0xf2d7a1}));controller.add(line);
    controller.addEventListener('select',()=>{
      scene.updateMatrixWorld(true);const origin=new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld),direction=new THREE.Vector3(0,0,-1).transformDirection(controller.matrixWorld);ray.set(origin,direction);
      const hit=ray.intersectObject(panel)[0];if(hit?.uv){const y=(1-hit.uv.y)*1024;menuHits.find(r=>y>=r.y&&y<=r.y+r.height)?.action();return;}
      const target=ray.intersectObjects(targets,false)[0];if(target)selectTarget(target);
    });
  }
  let dragging:{id:number;x:number;y:number;distance:number}|null=null;
  const down=(e:PointerEvent)=>{canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);dragging={id:e.pointerId,x:e.clientX,y:e.clientY,distance:0};};
  const move=(e:PointerEvent)=>{if(!dragging||dragging.id!==e.pointerId||renderer.xr.isPresenting)return;const x=e.clientX-dragging.x,y=e.clientY-dragging.y;dragging.distance+=Math.abs(x)+Math.abs(y);yaw-=x*.005;pitch=THREE.MathUtils.clamp(pitch-y*.005,-1.25,1.25);dragging.x=e.clientX;dragging.y=e.clientY;aim();};
  const up=(e:PointerEvent)=>{if(!dragging||dragging.id!==e.pointerId)return;const clicked=dragging.distance<8;dragging=null;if(!clicked)return;const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);scene.updateMatrixWorld(true);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(targets,false)[0];if(hit)selectTarget(hit);};
  const cancel=()=>{dragging=null;keys.clear();};
  const keydown=(e:KeyboardEvent)=>{const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();keys.add(key);}};
  const keyup=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('keydown',keydown);canvas.addEventListener('keyup',keyup);canvas.addEventListener('blur',cancel);window.addEventListener('blur',cancel);
  const resize=()=>{const w=viewport.clientWidth;if(!w)return;const h=Math.max(300,Math.min(600,w*.63));renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(viewport);resize();
  const xrChange=()=>{keys.clear();panel.visible=renderer.xr.isPresenting;drawMenu();};renderer.xr.addEventListener('sessionstart',xrChange);renderer.xr.addEventListener('sessionend',()=>{xrChange();recenter();});
  let previous=0;
  renderer.setAnimationLoop(time=>{
    if(disposed)return;const dt=Math.min((time-previous)/1000,.05);previous=time;
    if(!renderer.xr.isPresenting&&!viewport.hidden&&(document.activeElement===canvas||keys.size)){
      if(hasLayout){
        const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
        const sideways=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
        const length=Math.hypot(forward,sideways)||1;
        camera.position.x=THREE.MathUtils.clamp(camera.position.x+(sideways*Math.cos(yaw)-forward*Math.sin(yaw))/length*dt*1.6,-width/2+.35,width/2-.35);
        camera.position.z=THREE.MathUtils.clamp(camera.position.z+(-forward*Math.cos(yaw)-sideways*Math.sin(yaw))/length*dt*1.6,-depth/2+.35,depth/2-.35);
      }
    }
    if(!viewport.hidden||renderer.xr.isPresenting)renderer.render(scene,camera);
  });
  return {destroy(){disposed=true;unsubscribe();observer.disconnect();window.removeEventListener('blur',cancel);renderer.setAnimationLoop(null);void renderer.xr.getSession()?.end();clear(roomGroup);clear(hand);panel.geometry.dispose();menuTexture.dispose();menuMaterial.dispose();controllers.forEach(c=>c.traverse(n=>{if(n instanceof THREE.Line){n.geometry.dispose();(n.material as THREE.Material).dispose();}}));[stone,floor,wood,brass,steel].forEach(m=>m.dispose());renderer.dispose();root.remove();}};
}
