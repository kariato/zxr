import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import type { GameSession } from '../engine/index.ts';
import type { BrowserPlayer } from '../player/browser.ts';
import type { PlayerView } from '../player/controller.ts';
import type { ObjectAction } from '../player/object-actions.ts';
import {mountGardenScene,gardenSceneOffset,addGardenTargets,addGazeboTable,type GardenStatus} from './garden-scene.ts';
import { mountOpeningCavern } from './opening-cavern.ts';
import { prototypeModel } from './model.ts';
import { mountCavernBackdrop } from './cavern-backdrop.ts';
import { addPrincess,addLairChest,addLairDoorway } from './lair.ts';
import { addBarrowTunnel } from './barrow-tunnel.ts';
import { ObjectHold,objectIntent } from './object-gesture.ts';
import { addCavernRocks,addBarrowGuardrails,addGreatCavern } from './cavern-rocks.ts';
import { mountPrincessActor,type PrincessStatus } from './princess-actor.ts';
import { mountBarrowDressing } from './barrow-dressing.ts';
import { mountCavernScene,addCavernTargets,cavernSceneOffset,type CavernStatus } from './cavern-scene.ts';
import { mountPropModel,posePropModel,releasePropModels } from './prop-model.ts';
import { movablePropDefinitions } from './movable-props.generated.ts';

/** Disposable spatial presenter over the existing shared browser controller. */
export function mountPrototype(host:HTMLElement,session:GameSession,player:BrowserPlayer,options:{gardenModelUrl?:string;onGardenStatus?:(status:GardenStatus)=>void;princessModelUrl?:string;onPrincessStatus?:(status:PrincessStatus)=>void;barrowDressingUrl?:string;onBarrowStatus?:(status:'loading'|'ready'|'failed')=>void;cavernModelUrl?:string;onCavernStatus?:(status:CavernStatus)=>void;propModelUrls?:Partial<Record<string,string>>}={}){
  const root=document.createElement('section');root.className='prototype';root.setAttribute('aria-label','3D prototype');host.prepend(root);
  const heading=document.createElement('h2');heading.textContent='Zork II in 3D';root.append(heading);
  const info=document.createElement('p');info.className='prototype-info';root.append(info);
  const viewport=document.createElement('div');viewport.className='prototype-viewport';root.append(viewport);
  const instructions=document.createElement('p');instructions.textContent='Drag to look · WASD / arrows to walk · Left-click an object for its actions. Touch: tap to act, hold for actions. XR: left trigger for actions, right trigger to act.';root.append(instructions);
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
  const backdrop=mountCavernBackdrop(scene);scene.backgroundIntensity=.85;
  const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(65,1,.05,60);camera.position.y=1.6;rig.add(camera);scene.add(rig);
  const roomGroup=new THREE.Group(),hand=new THREE.Group();scene.add(roomGroup);camera.add(hand);
  const targets:THREE.Object3D[]=[];let width=2,depth=2,room:string|null=null,identity='',busy=true,disposed=false,gardenOverview=false,yaw=Math.PI,pitch=-.1;
  const actors:ReturnType<typeof mountPrincessActor>[]=[];
  const dressings:ReturnType<typeof mountBarrowDressing>[]=[];
  // GLB-backed actors and dressing outlive per-turn rebuilds. The five cavern
  // rooms also retain one model while changing their origin within that scene.
  const propMounts:{dispose():void}[]=[];
  const persistent=new THREE.Group();scene.add(persistent);let persistentKey='',dressingState:'loading'|'ready'|'failed'='loading',baseFloor:THREE.Mesh|undefined,cavernFallback:THREE.Group|undefined;
  const clearActors=()=>{actors.forEach(actor=>actor.dispose());actors.length=0;dressings.forEach(d=>d.dispose());dressings.length=0;persistent.clear();persistentKey='';dressingState='loading';delete viewport.dataset.cavernScene;delete viewport.dataset.cavernRoom;delete viewport.dataset.gardenScene;delete viewport.dataset.gardenRoom;};
  let view:PlayerView=player.player.view(),menuPage=0,textPage=0,lastText='',hasLayout=false,nearby=false;
  let objectActions:ObjectAction[]=[];
  const material=(colour:number)=>new THREE.MeshStandardMaterial({color:colour,roughness:.95,flatShading:true});
  const stone=material(0x55594e),floor=material(0x666457),wood=material(0x65503b),brass=material(0xa68b48),steel=material(0xb0b6b4);
  const propSizes=new Map<string,readonly number[]>(movablePropDefinitions.map(p=>[p.id,p.sizeMetres]));
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
    group.traverse(node=>{if(node.userData.shared)return;if(node instanceof THREE.Mesh){if(node instanceof THREE.InstancedMesh)node.dispose();node.geometry.dispose();for(const mat of Array.isArray(node.material)?node.material:[node.material])if(![stone,floor,wood,brass,steel].includes(mat as THREE.MeshStandardMaterial))mat.dispose();}if(node instanceof THREE.Sprite){node.material.map?.dispose();node.material.dispose();}});group.clear();
  };
  const aim=()=>{camera.rotation.set(pitch,yaw,0,'YXZ');};
  const recenter=()=>{
    gardenOverview=false;rig.position.set(0,0,0);rig.rotation.set(0,0,0);
    camera.position.set(0,1.6,room==='NARROW-TUNNEL'?1.1:-Math.max(0,depth/2-1.4));
    if(room==='GREAT-CAVERN')camera.position.z=1.2;
    const garden=!!gardenSceneOffset(room);
    if(garden){
      camera.position.z=room==='GAZEBO-ROOM'?-.8:.6;
      if(!renderer.xr.isPresenting)camera.position.y=room==='GAZEBO-ROOM'?2.2:5.2;
      scene.fog=new THREE.Fog(0x263329,30,120);
    }
    yaw=(garden&&room!=='GAZEBO-ROOM')||room==='GREAT-CAVERN'?0:Math.PI;
    pitch=garden&&!renderer.xr.isPresenting?-.45:-.1;aim();
  };
  const build=()=>{
    const observation=session.observeAppearance(),model=prototypeModel(observation),changed=room!==model.room;room=model.room;
    backdrop.update(observation.perception);
    const princess=!!options.princessModelUrl&&model.props.some(p=>p.id==='PRINCESS'&&!p.held);
    const cavernOffset=cavernSceneOffset(model.room),generatedCavern=!!cavernOffset&&!!options.cavernModelUrl;
    const gardenOffset=gardenSceneOffset(room),generatedGarden=!!gardenOffset&&!!options.gardenModelUrl;
    const nextKey=generatedGarden?'shared-garden:'+options.gardenModelUrl:generatedCavern?'shared-cavern:'+options.cavernModelUrl:model.room&&(model.layout||princess)?model.room+(princess?':princess':''):'';
    if(nextKey!==persistentKey)clearActors();persistentKey=nextKey;baseFloor=undefined;cavernFallback=undefined;
    persistent.position.set(...(generatedGarden?gardenOffset!:generatedCavern?cavernOffset!:[0,0,0] as const));
    propMounts.forEach(m=>m.dispose());propMounts.length=0;clear(roomGroup);clear(hand);targets.length=0;
    const layout=model.layout;hasLayout=!!layout;width=layout?.width??8;depth=layout?.depth??8;
    if(changed){recenter();menuPage=textPage=0;}
    if(!layout&&!model.props.length)return;
    const lair=room==='DRAGON-LAIR',barrow=room==='INSIDE-BARROW',cavern=!!cavernSceneOffset(room),garden=!!gardenOffset;
    camera.far=garden?1000:60;camera.updateProjectionMatrix();
    scene.fog=garden?(gardenOverview?null:new THREE.Fog(0x263329,30,120)):new THREE.Fog(cavern?0x172126:0x070c10,cavern?12:(barrow||lair)?15:6,cavern?48:(barrow||lair)?45:22);
    scene.add(roomGroup);
    roomGroup.add(new THREE.HemisphereLight(garden?0xcce3ce:room==='DARK-TUNNEL'?0x8d8570:cavern?0x91abb5:0xc5d4c1,garden?0x485041:cavern?0x38434b:0x303025,garden?3:room==='DARK-TUNNEL'?1.5:2));
    const light=new THREE.PointLight(garden?0xbee5c4:room==='DARK-TUNNEL'?0xd8b687:cavern?0xb0c8b5:0xf6cb83,garden?8:room==='DARK-TUNNEL'?25:cavern?12:(barrow||lair)?4:18,cavern?20:14,2);light.position.set(.7,cavern?4:(barrow||lair)?3.2:2,-1);roomGroup.add(light);
    const environment=new THREE.Group();roomGroup.add(environment);
    if(generatedCavern){
      cavernFallback=environment;
      if(!dressings.length){dressings.push(mountOpeningCavern(persistent));dressings.push(mountCavernScene(persistent,options.cavernModelUrl!,state=>{
        dressingState=state;if(cavernFallback)cavernFallback.visible=state!=='ready';viewport.dataset.cavernScene=state;options.onCavernStatus?.(state);
      }));}
      environment.visible=dressingState!=='ready';
      viewport.dataset.cavernScene=dressingState;viewport.dataset.cavernRoom=room!;
      const sourceTargets=new THREE.Group();sourceTargets.position.copy(persistent.position);roomGroup.add(sourceTargets);
      targets.push(...addCavernTargets(sourceTargets,new Set(observation.perception.objects.filter(o=>o.visible).map(o=>o.id)),objectActions));
    }
    if(generatedGarden){
      cavernFallback=environment;
      if(!dressings.length)dressings.push(mountGardenScene(persistent,options.gardenModelUrl!,state=>{
        dressingState=state;if(cavernFallback)cavernFallback.visible=state!=='ready';viewport.dataset.gardenScene=state;options.onGardenStatus?.(state);
      }));
      environment.visible=dressingState!=='ready';viewport.dataset.gardenScene=dressingState;viewport.dataset.gardenRoom=room!;
    }
    if(garden){
      targets.push(...addGardenTargets(roomGroup,room!,new Set(observation.perception.objects.filter(o=>o.visible).map(o=>o.id)),objectActions));
      if(room==='GAZEBO-ROOM'&&observation.perception.objects.some(o=>o.visible&&o.id==='GAZEBO-TABLE'))addGazeboTable(roomGroup);
    }
    if(cavern)addCavernRocks(environment);
    if(!layout){
      // Object-only staging for rooms awaiting environment geometry. Do not
      // invent walls, doors, routes or traversable floor from the object art.
    }else if(garden){
      box(environment,[width,.12,depth],[0,-.09,0],floor);
    }else if(room==='SHALLOW-FORD'||room==='DARK-TUNNEL'){
      if(!generatedCavern)box(environment,[width,.25,depth],[0,-.15,0],floor);
    }else if(room==='GREAT-CAVERN'){
      addGreatCavern(roomGroup);
    }else if(room==='FOOT-BRIDGE'){
      const bridge=new THREE.Group();environment.add(bridge);
      for(let z=-depth/2+.15;z<depth/2;z+=.3)box(bridge,[2.2,.12,.27],[0,-.08,z],wood);
      for(const x of [-1.05,1.05]){
        box(bridge,[.08,.08,depth],[x,1,0],wood);
        for(const z of [-depth/2+.2,0,depth/2-.2])box(bridge,[.12,1.1,.12],[x,.5,z],wood);
      }
      if(!generatedCavern&&observation.perception.objects.some(o=>o.id==='BRIDGE'&&o.visible)){
        bridge.userData.object='BRIDGE';bridge.userData.action=objectActions.find(a=>a.object==='BRIDGE');
        if(bridge.userData.action){const label=textureLabel((bridge.userData.action as ObjectAction).label);label.position.set(.65,1.25,-.4);label.scale.set(.65,.122,1);bridge.add(label);targets.push(label);}
        bridge.traverse(node=>{if(node instanceof THREE.Mesh)targets.push(node);});
      }
    }else if(lair){
      box(roomGroup,[width+2,.25,depth+2],[0,-.15,0],floor);
      addBarrowGuardrails(roomGroup,width,depth);
      targets.push(...addLairDoorway(roomGroup,depth/2).targets);
    }else if(barrow){
      const ground=box(roomGroup,[width+2,.25,depth+2],[0,-.15,0],floor);baseFloor=ground;
      if(options.barrowDressingUrl){
        if(!dressings.length)dressings.push(mountBarrowDressing(persistent,options.barrowDressingUrl,width,depth,state=>{
          dressingState=state;if(baseFloor)baseFloor.visible=state!=='ready';options.onBarrowStatus?.(state);
        }));
        ground.visible=dressingState!=='ready';
        const passage=box(roomGroup,[1.8,2.35,.25],[0,1.17,depth/2-.2],new THREE.MeshBasicMaterial({visible:false}));
        passage.userData.direction='SOUTH';targets.push(passage);
      }else{
        addBarrowGuardrails(roomGroup,width,depth);
        targets.push(...addBarrowTunnel(roomGroup,depth/2));
      }
    }else{
      box(environment,[width,.25,depth],[0,-.15,0],floor);
      const shellEnd=cavern ? .6 : depth/2,ceilingDepth=cavern?depth/2+.6:depth+.4;
      box(environment,[width+.4,.4,ceilingDepth],[0,layout.height+.2,cavern?(shellEnd-depth/2)/2:0],stone);
      for(const side of [-1,1])for(let z=-depth/2;z<shellEnd;z+=.75){
        const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.9,0),stone);
        rock.position.set(side*(width/2+.35),1.35,z);rock.scale.set(.75,1.8,1);environment.add(rock);
      }
      for(const z of [-depth/2,depth/2])for(let x=-width/2;x<=width/2;x+=.65){
        if(cavern&&z>0)continue; // The source tunnel opens south into the cavern.
        const opening=layout.routes.some(r=>Math.sign(r.z)===Math.sign(z))&&Math.abs(x)<.85;
        if(!opening){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.8,0),stone);rock.position.set(x,1.3,z+.15*Math.sign(z));rock.scale.y=1.9;environment.add(rock);}
      }
    }
    for(const route of layout?.routes??[]){
      const label=textureLabel('Go '+route.direction.toLowerCase());label.position.set(route.x,1.45,route.z);label.userData.direction=route.direction;roomGroup.add(label);targets.push(label);
      if(garden)label.scale.set(.6,.1126,1);
      if(room==='GARDEN-NORTH'&&route.direction==='NORTH')label.position.x=-.7;
      if(room==='NARROW-TUNNEL'&&route.direction==='SOUTH'){label.position.set(.65,1.05,route.z);label.scale.set(.45,.0845,1);}
    }
    let roomSlot=0,heldSlot=0,tableSlot=0;
    for(const prop of model.props){
      const group=new THREE.Group();group.userData.object=prop.id;
      const size=propSizes.get(prop.id)??[.25,.25,.25],span=Math.max(...size);
      if(prop.held){
        hand.add(group);
        if(prop.id==='LAMP'||prop.id==='SWORD')group.position.set(prop.id==='LAMP'?-.35:.35,-.4,-.65);
        else{const slot=heldSlot++;group.position.set((slot%4-1.5)*.26,-.65-Math.floor(slot/4)*.2,-1.1);}
        group.scale.setScalar(prop.id==='LAMP'||prop.id==='SWORD'?.6:Math.min(.6,.2/span));
      }else{
        roomGroup.add(group);
        if(['PRINCESS','CHEST','STATUETTE','SWORD','LAMP'].includes(prop.id))group.position.set(prop.id==='PRINCESS'?-2:(prop.id==='CHEST'||prop.id==='STATUETTE')?2:prop.id==='SWORD'?-.9:1,prop.id==='STATUETTE'?.1:.03,prop.id==='PRINCESS'||prop.id==='CHEST'||prop.id==='STATUETTE'?1.3:room==='INSIDE-BARROW'?.6:0);
        else{const slot=roomSlot++;group.position.set((slot%5-2)*(cavern?.4:1.15),.03,cavern?-1.8+Math.floor(slot/5)*.45:Math.floor(slot/5)*1.2);}
        if(room==='GAZEBO-ROOM'&&!['PRINCESS','CHEST','STATUETTE'].includes(prop.id)){
          const slot=tableSlot++;group.position.set((slot%3-1)*.38,.81,.7+Math.floor(slot/3)*.28);
        }
        if(room==='FOOT-BRIDGE')group.position.x=THREE.MathUtils.clamp(group.position.x,-.75,.75);
      }
      if(prop.id==='PRINCESS'){
        if(options.princessModelUrl){
          if(!actors.length){
            const actorRoot=new THREE.Group();actorRoot.position.copy(group.position);persistent.add(actorRoot);
            actors.push(mountPrincessActor(actorRoot,options.princessModelUrl,options.onPrincessStatus));
          }
          const faceLight=new THREE.PointLight(0xffe0bc,3,5,2);faceLight.position.set(0,2,-1);group.add(faceLight);
        }else addPrincess(group);
      }
      // Procedural shapes form the body that a generated model replaces once loaded.
      const body=new THREE.Group();group.add(body);
      if(prop.id==='CHEST'){addLairChest(body,prop.open);}
      else if(prop.id==='STATUETTE'){const gold=material(0xc3973f);box(body,[.15,.3,.12],[0,.15,0],gold);}
      else if(prop.id==='SWORD'){
        box(body,[.75,.04,.1],[0,.025,0],steel);box(body,[.06,.06,.3],[-.4,.04,0],brass);box(body,[.22,.065,.065],[-.54,.04,0],wood);
        if(prop.held){
          // The export rests flat with its blade along -X. Raise that axis
          // toward +Y and turn its broad face toward the camera when carried.
          group.rotation.set(Math.PI/2,0,-Math.PI/2,'ZXY');group.position.set(.35,-.05,-.75);
        }else group.rotation.y=1.1;
      }else if(prop.id==='LAMP'){
        box(body,[.2,.08,.2],[0,.04,0],brass);box(body,[.14,.24,.14],[0,.19,0],brass);
        const glass=new THREE.MeshBasicMaterial({color:prop.on?0xffdb8a:0x59605a});box(body,[.15,.1,.15],[0,.2,0],glass);
        box(body,[.22,.05,.22],[0,.34,0],brass);
        if(prop.on){const lamp=new THREE.PointLight(0xffc87b,.5,8,2);lamp.position.set(0,1.05,-.2);group.add(lamp);}
      }else if(prop.id!=='PRINCESS')box(body,[...size],[0,size[1]!/2,0],wood);
      const modelUrl=prop.id==='PRINCESS'?undefined:options.propModelUrls?.[prop.id];
      if(modelUrl)propMounts.push(mountPropModel(body,modelUrl,model=>posePropModel(prop.id,model,prop)));
      const action=objectActions.find(a=>a.object===prop.id);
      const label=textureLabel(action?.label??prop.name);label.position.set(0,prop.held ? .25 : prop.id==='PRINCESS'?2.05:.8,0);if(prop.held)label.scale.set(.38,.071,1);group.add(label);
      label.userData.action=action;label.userData.object=prop.id;
      if(room==='GAZEBO-ROOM'&&!prop.held)label.visible=false;else targets.push(label);
      const hit=box(group,room==='GAZEBO-ROOM'&&!prop.held?[.32,.3,.32]:prop.held?[.3,.45,.3]:prop.id==='PRINCESS'?[1,1.85,.9]:[1.2,.8,.6],[0,prop.id==='PRINCESS'?.92:.3,0],new THREE.MeshBasicMaterial({visible:false}));hit.userData.action=action;hit.userData.object=prop.id;targets.push(hit);
    }
  };
  const recenterButton=addButton('Recenter view',()=>{recenter();drawMenu();});
  const gardenOverviewButton=addButton('Garden overview',()=>{
    const offset=gardenSceneOffset(room);if(!offset||renderer.xr.isPresenting)return;
    gardenOverview=true;scene.fog=null;camera.position.set(offset[0],46+offset[1],62+offset[2]);yaw=0;pitch=-Math.atan2(40,62);aim();
  });gardenOverviewButton.hidden=true;
  const inspectButton=addButton('Princess close-up',()=>{
    if(renderer.xr.isPresenting||!prototypeModel(session.observeAppearance()).props.some(p=>p.id==='PRINCESS'))return;
    camera.position.set(-2,options.princessModelUrl?1.48:1.6,.05);yaw=Math.PI;pitch=0;aim();
  });inspectButton.hidden=true;
  const gestureButton=options.princessModelUrl?addButton('Preview princess gesture',()=>actors.forEach(actor=>actor.gesture())):null;
  const idleButton=options.princessModelUrl?addButton('Princess idle',()=>actors.forEach(actor=>actor.idle())):null;
  const visibleButton=addButton('Hide 3D',()=>{viewport.hidden=!viewport.hidden;visibleButton.textContent=viewport.hidden?'Show 3D':'Hide 3D';if(viewport.hidden)keys.clear();else resize();});
  const moves=document.createElement('nav');moves.setAttribute('aria-label','Movement attempts');root.append(moves);
  const objectControls=document.createElement('section');objectControls.className='prototype-objects';objectControls.setAttribute('aria-label','Object actions');root.append(objectControls);
  const feedback=document.createElement('p');feedback.className='prototype-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-label','Action result');root.insertBefore(feedback,instructions);
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
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.45,1.45),menuMaterial);panel.renderOrder=10;panel.position.set(-1.25,1.35,-1.7);panel.rotation.y=.35;panel.visible=false;rig.add(panel);
  let menuHits:{y:number;height:number;action:()=>void}[]=[];
  function drawMenu(){
    ctx.fillStyle='#10201f';ctx.fillRect(0,0,1024,1024);ctx.fillStyle='#f2d7a1';ctx.font='bold 34px system-ui';
    ctx.fillText(info.textContent??'ZXR',35,48,950);ctx.fillStyle='#e2ece5';ctx.font='25px system-ui';
    const lines:string[]=[];for(const paragraph of lastText.split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(ctx.measureText(line+' '+word).width>950){lines.push(line);line=word;}else line+=(line?' ':'')+word;}lines.push(line);}
    const textPages=Math.max(1,Math.ceil(lines.length/7));textPage=Math.min(textPage,textPages-1);
    lines.slice(textPage*7,textPage*7+7).forEach((line,i)=>ctx.fillText(line,35,90+i*29));menuHits=[];
    const row=(y:number,label:string,action:()=>void,enabled=true)=>{ctx.fillStyle=enabled?'#2b4741':'#233330';ctx.fillRect(25,y,974,51);ctx.fillStyle=enabled?'#f1eee2':'#80918a';ctx.font='25px system-ui';ctx.fillText(label,40,y+35,945);if(enabled)menuHits.push({y,height:51,action});};
    row(302,`Read text ${textPage+1}/${textPages} · next`,()=>{textPage=(textPage+1)%textPages;drawMenu();});
    ctx.fillStyle='#f2d7a1';ctx.font='bold 28px system-ui';ctx.fillText(nearby?'Nearby object actions':view.title,35,394,950);
    const choices=nearby?[
      {label:'Back to action menu',action:()=>{nearby=false;menuPage=0;drawMenu();}},
      ...objectActions.flatMap(a=>[
        {label:a.label,action:()=>{nearby=false;void player.activateObject(a);}},
        {label:'Other actions: '+a.name,action:()=>{nearby=false;void player.openObject(a.object);}},
      ]),
    ]:[
      ...(view.state==='input'?[{label:'Nearby object actions ('+objectActions.length+')',action:()=>{nearby=true;menuPage=0;drawMenu();}}]:[]),
      ...view.choices.map(c=>({label:c.label,action:()=>void player.choose(c.key)})),
    ];
    const pages=Math.max(1,Math.ceil(choices.length/7));menuPage=Math.min(menuPage,pages-1);
    choices.slice(menuPage*7,menuPage*7+7).forEach((choice,i)=>row(412+i*58,choice.label,choice.action,!busy));
    row(824,`Choices ${menuPage+1}/${pages} · next`,()=>{menuPage=(menuPage+1)%pages;drawMenu();});
    row(885,'Finish sentence',()=>void player.finish(),!busy&&view.canFinish);
    row(947,'Cancel sentence',()=>void player.cancel(),!busy&&view.canCancel);
    if(view.words){ctx.fillStyle='#f2d7a1';ctx.font='22px system-ui';ctx.fillText('Word picker: use the desktop panel for this prototype.',35,812,950);}
    menuTexture.needsUpdate=true;
  }
  const unsubscribe=player.subscribe((next,isBusy)=>{
    const changed=view.title!==next.title;view=next;busy=isBusy;if(changed)menuPage=0;if(view.state!=='input')nearby=false;
    objectActions=player.player.objectActions();
    const observation=session.observe(),key=observation.epoch+':'+observation.revision;
    if(key!==identity){identity=key;build();}
    info.textContent=(observation.perception.room?.name??'Darkness')+' · '+observation.moves+' moves'+(room&&!prototypeModel(session.observeAppearance()).layout?' · Room environment artwork to follow':'');
    lastText=player.player.transcript.map(t=>t.text).filter(Boolean).at(-1)??'';
    feedback.textContent=lastText;
    objectControls.replaceChildren();
    if(objectActions.length){const title=document.createElement('h3');title.textContent='Object actions';objectControls.append(title);}
    for(const action of objectActions){
      const row=document.createElement('nav');row.setAttribute('aria-label',action.name);objectControls.append(row);
      const primary=addButton(action.label,()=>void player.activateObject(action),row);primary.disabled=busy;
      const more=addButton('Other actions: '+action.name,()=>void player.openObject(action.object),row);more.disabled=busy;
    }
    moves.replaceChildren();const menu=observation.state==='input'?session.menu('PLAYER').exits:null;
    for(const c of menu?[...menu.primary,...menu.more]:[]){const b=addButton(c.label,()=>void player.walk(c.draft.family.slice(5)),moves);b.disabled=busy;}
    inspectButton.hidden=!prototypeModel(session.observeAppearance()).props.some(p=>p.id==='PRINCESS');inspectButton.disabled=busy||renderer.xr.isPresenting;
    for(const button of [gestureButton,idleButton])if(button){button.hidden=inspectButton.hidden;button.disabled=busy;}
    gardenOverviewButton.hidden=!gardenSceneOffset(room);gardenOverviewButton.disabled=busy||renderer.xr.isPresenting;
    recenterButton.disabled=busy;drawMenu();
  });
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const selectTarget=(hit:THREE.Intersection,intent:'menu'|'default'='default')=>{
    if(busy)return;let node:THREE.Object3D|null=hit.object;
    while(node){if(node.userData.action){nearby=false;const binding=node.userData.action as ObjectAction;if(intent==='menu')void player.openObject(binding.object,binding.draft.expected);else void player.activateObject(binding);return;}if(node.userData.object){void player.openObject(node.userData.object as string);return;}if(node.userData.direction){void player.walk(node.userData.direction as string);return;}node=node.parent;}
  };
  const controllers=[renderer.xr.getController(0),renderer.xr.getController(1)];
  for(const controller of controllers){
    controller.addEventListener('connected',event=>{controller.userData.handedness=event.data.handedness;});
    controller.addEventListener('disconnected',()=>{delete controller.userData.handedness;});
    rig.add(controller);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-6)]),new THREE.LineBasicMaterial({color:0xf2d7a1}));controller.add(line);
    controller.addEventListener('select',()=>{
      scene.updateMatrixWorld(true);const origin=new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld),direction=new THREE.Vector3(0,0,-1).transformDirection(controller.matrixWorld);ray.set(origin,direction);ray.camera=camera; // Sprite labels need a camera to raycast.
      const target=ray.intersectObjects(targets,false)[0],hit=ray.intersectObject(panel)[0];
      if(hit?.uv&&(!target||hit.distance<target.distance)){const y=(1-hit.uv.y)*1024;menuHits.find(r=>y>=r.y&&y<=r.y+r.height)?.action();return;}
      if(target)selectTarget(target,objectIntent('',controller.userData.handedness??'none'));
    });
  }
  let dragging:{id:number;x:number;y:number;distance:number}|null=null,multiplePointers=false;
  const pointers=new Set<number>(),hold=new ObjectHold();
  const pointerHit=(x:number,y:number)=>{
    const rect=canvas.getBoundingClientRect();pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    scene.updateMatrixWorld(true);ray.setFromCamera(pointer,camera);return ray.intersectObjects(targets,false)[0];
  };
  const down=(e:PointerEvent)=>{
    if(e.button!==0)return;pointers.add(e.pointerId);hold.cancel();
    if(pointers.size>1){multiplePointers=true;dragging=null;return;}
    canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);dragging={id:e.pointerId,x:e.clientX,y:e.clientY,distance:0};
    if(e.pointerType==='touch'){
      const hit=pointerHit(e.clientX,e.clientY);let node:THREE.Object3D|null=hit?.object??null;
      while(node&&!node.userData.object)node=node.parent;
      if(node){const id=node.userData.object as string,expected=session.observe();hold.start(()=>{if(!busy&&!disposed){nearby=false;void player.openObject(id,expected);}});}
    }
  };
  const move=(e:PointerEvent)=>{
    if(!dragging||dragging.id!==e.pointerId||renderer.xr.isPresenting)return;
    const x=e.clientX-dragging.x,y=e.clientY-dragging.y;dragging.distance+=Math.abs(x)+Math.abs(y);
    if(dragging.distance>=8)hold.cancel();
    yaw-=x*.005;pitch=THREE.MathUtils.clamp(pitch-y*.005,-1.25,1.25);dragging.x=e.clientX;dragging.y=e.clientY;aim();
  };
  const up=(e:PointerEvent)=>{
    if(e.button!==0)return;pointers.delete(e.pointerId);
    const consumed=hold.release(),clicked=dragging?.id===e.pointerId&&dragging.distance<8&&!multiplePointers&&!consumed;
    dragging=null;if(!pointers.size)multiplePointers=false;if(!clicked)return;
    const hit=pointerHit(e.clientX,e.clientY);if(hit)selectTarget(hit,objectIntent(e.pointerType));
  };
  const cancel=()=>{hold.cancel();dragging=null;multiplePointers=false;pointers.clear();keys.clear();};
  const keydown=(e:KeyboardEvent)=>{const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();keys.add(key);}};
  const keyup=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
  canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',e=>{if(dragging?.id===e.pointerId)cancel();});canvas.addEventListener('keydown',keydown);canvas.addEventListener('keyup',keyup);canvas.addEventListener('blur',cancel);window.addEventListener('blur',cancel);
  const resize=()=>{const w=viewport.clientWidth;if(!w)return;const h=Math.max(300,Math.min(600,w*.63));renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(viewport);resize();
  const xrChange=()=>{cancel();gardenOverviewButton.disabled=busy||renderer.xr.isPresenting;inspectButton.disabled=busy||renderer.xr.isPresenting;panel.visible=renderer.xr.isPresenting;drawMenu();};renderer.xr.addEventListener('sessionstart',xrChange);renderer.xr.addEventListener('sessionend',()=>{xrChange();recenter();});
  let previous=0;
  renderer.setAnimationLoop(time=>{
    if(disposed)return;const dt=Math.min((time-previous)/1000,.05);previous=time;
    if(!renderer.xr.isPresenting&&!viewport.hidden&&(document.activeElement===canvas||keys.size)){
      if(hasLayout){
        if(gardenSceneOffset(room)&&camera.position.y>10&&keys.size)recenter();
        const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
        const sideways=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
        const length=Math.hypot(forward,sideways)||1;
        camera.position.x=THREE.MathUtils.clamp(camera.position.x+(sideways*Math.cos(yaw)-forward*Math.sin(yaw))/length*dt*1.6,-width/2+.35,width/2-.35);
        camera.position.z=THREE.MathUtils.clamp(camera.position.z+(-forward*Math.cos(yaw)-sideways*Math.sin(yaw))/length*dt*1.6,-depth/2+.35,depth/2-.35);
      }
    }
    if(!viewport.hidden||renderer.xr.isPresenting){actors.forEach(actor=>actor.update(dt));renderer.render(scene,camera);}
  });
  return {destroy(){disposed=true;cancel();unsubscribe();observer.disconnect();window.removeEventListener('blur',cancel);renderer.setAnimationLoop(null);void renderer.xr.getSession()?.end();backdrop.dispose();clearActors();propMounts.forEach(m=>m.dispose());releasePropModels();clear(roomGroup);clear(hand);panel.geometry.dispose();menuTexture.dispose();menuMaterial.dispose();controllers.forEach(c=>c.traverse(n=>{if(n instanceof THREE.Line){n.geometry.dispose();(n.material as THREE.Material).dispose();}}));[stone,floor,wood,brass,steel].forEach(m=>m.dispose());renderer.dispose();root.remove();}};
}
