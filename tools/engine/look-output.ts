import { runReference } from '../reference/runner.ts';
import { STORY_SHA256 } from '../reference/symbols.ts';
/** Real typed commands reach each room; output is observed inside original V-LOOK and its callees. */
export function recordLookOutput(){
  const rooms:[string,string[]][]=[['INSIDE-BARROW',[]],['NARROW-TUNNEL',['south']],['FOOT-BRIDGE',['south','south']],['GREAT-CAVERN',['south','south','south']],['SHALLOW-FORD',['south','south','south','sw']]];
  const cases=rooms.map(([room,route])=>{
    const commands=[...route,'look'],text:string[]=[];
    const run=runReference(commands,2,{onOutput:e=>{if(e.input===commands.length-1&&e.stack.includes('V-LOOK'))text.push(e.text);}});
    if(run.final.room!==room||!text.length)throw new Error('LOOK reference did not reach '+room);
    return {room,commands,text:text.join('')};
  });
  return {format:'zxr-look-output-v1',storySha256:STORY_SHA256,seed:2,capture:'Only output while V-LOOK is on the original interpreter call stack; parser prompts and CLOCKER output excluded.',cases};
}
