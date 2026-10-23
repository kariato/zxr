import { capabilityManifest } from '../engine/capabilities.ts';
/** Read-only implementation information. No session/debug-reveal handle needed. */
export function mountCapabilities(container:HTMLElement,buildHash:string){
  const manifest=capabilityManifest(),panel=document.createElement('details');panel.dataset.capabilities='';
  const summary=document.createElement('summary');summary.textContent='Debug: capabilities';panel.append(summary);
  const target=document.createElement('p');target.textContent=manifest.target;panel.append(target);
  const build=document.createElement('p');build.textContent='Build: '+buildHash;panel.append(build);
  const list=document.createElement('dl');
  for(const entry of manifest.entries){
    const name=document.createElement('dt');name.textContent=entry.name+' — '+entry.status;
    const detail=document.createElement('dd');detail.textContent=entry.detail+' Evidence: '+entry.evidence;
    list.append(name,detail);
  }
  panel.append(list);container.append(panel);return panel;
}
