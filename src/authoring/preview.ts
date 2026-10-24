import { selectSceneAppearance } from '../presentation/scene-visibility.ts';
import type { SceneVisibility } from '../presentation/scene-visibility.ts';
import type { AppearanceObservation } from '../engine/appearance.ts';
/** Diagram renderer for authoring acceptance, not a GLB or playable 3D view. */
export function drawPlanPreview(target:HTMLElement,plan:Record<string,any>,scene:SceneVisibility,current:AppearanceObservation){
  target.replaceChildren();
  if(!current.perception.lit||current.perception.room?.id!==scene.room){target.textContent='Darkness — no room geometry disclosed.';return;}
  const shown=selectSceneAppearance(scene,current,[]),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 600 320');svg.setAttribute('role','img');svg.setAttribute('aria-label',scene.room+' observed layout');
  const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('x','10');rect.setAttribute('y','10');rect.setAttribute('width','580');rect.setAttribute('height','300');rect.setAttribute('fill','#2c3d43');svg.append(rect);
  for(const [index,object] of plan.objects.filter((o:any)=>shown.objects.includes(o.object)).entries()){
    const anchor=plan.anchors.find((a:any)=>a.node===object.anchor),[x,,z]=anchor.pose.position;
    const group=document.createElementNS(svg.namespaceURI,'g');group.setAttribute('data-observed-object',object.object);
    const circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('cx',String(300+x/plan.sizeMetres[0]*500));circle.setAttribute('cy',String(160+z/plan.sizeMetres[2]*260));circle.setAttribute('r','7');circle.setAttribute('fill','#dfbe77');
    const label=document.createElementNS(svg.namespaceURI,'text');label.setAttribute('x',circle.getAttribute('cx')!);label.setAttribute('y',String(Number(circle.getAttribute('cy'))-12-(index%3)*18));label.setAttribute('fill','#f3eee1');label.setAttribute('text-anchor','middle');label.textContent=object.object;
    group.append(circle,label);svg.append(group);
  }target.append(svg);
}
