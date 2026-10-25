import { movablePropFiles } from './movable-props.generated.ts';

// URL imports emit hashed, base-path-aware assets. Only visible props load GLBs.
const files=import.meta.glob<string>('./assets/**/*.glb',{eager:true,query:'?url',import:'default'});
export const movablePropUrls:Partial<Record<string,string>>=Object.fromEntries(
  Object.entries(movablePropFiles).map(([id,file])=>{
    const url=files['./assets/'+file];if(!url)throw new Error('Missing movable model '+id);
    return [id,url];
  }),
);
