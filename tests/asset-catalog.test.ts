import { describe,it,expect } from 'vitest';
import { assetWork,currentAssetPlans } from '../tools/assets/catalog.ts';
import type { PlanRecord } from '../tools/planning/client.ts';
describe('asset production classification',()=>{
  const doc={description:'Source-backed object.',kind:'prop'};
  it('never creates independent geometry for parser or global identity proxies',()=>{
    expect(assetWork('GLOBAL-PRINCESS',{...doc,description:'Interaction/identity proxy: no independent physical body'}).route).toBe('no-geometry');
    expect(assetWork('SAILOR',doc).route).toBe('no-geometry');
  });
  it('separates state variants, effects, surfaces and creature rigging',()=>{
    expect(assetWork('DEAD-DRAGON',doc)).toEqual({kind:'variant',route:'derived-mesh',base:'DRAGON'});
    expect(assetWork('GLOBAL-WATER',doc).route).toBe('authored-surface');
    expect(assetWork('CURTAIN',doc).route).toBe('authored-effect');
    expect(assetWork('DRAGON',{...doc,kind:'character'}).route).toBe('image-mesh-creature-rig');
    expect(assetWork('WIZARD',{...doc,kind:'character'}).route).toBe('image-mesh-humanoid-rig');
  });
  it('preserves the draft status when a revision supersedes an approved brief',()=>{
    const record=(status:string):PlanRecord=>({format:'zxr-plan-record-v1',task:{kind:'asset-brief',subject:'SWORD'},provider:'assistant',requestedModel:null,model:null,promptVersion:'test',inputHash:'input',requestHash:null,attempts:0,outputHash:'output',document:{review:{status}}});
    const selected=currentAssetPlans([record('approved')],[record('draft')]);
    expect(selected.get('asset-brief:SWORD')!.document.review.status).toBe('draft');
  });
});
