import { readFileSync } from 'node:fs';
import { runReference } from '../reference/runner.ts';
import { memories } from '../reference/state.ts';
import { loadSymbols, STORY } from '../reference/symbols.ts';
import { commandFile } from '../reference/fixtures.ts';

/** Compact evidence from the actual binary; no parser/game implementation is substituted. */
export function semanticsProbes() {
  const symbols=loadSymbols(),story=readFileSync(STORY),data=readFileSync('reference/zork2/zork2dat.zap','utf8');
  const dictionary=story.readUInt16BE(8),entry=dictionary+1+story[dictionary]!;
  const width=story[entry]!,count=story.readUInt16BE(entry+1),start=entry+3;
  const labels=[...data.matchAll(/^W\?([^:]+)::/gm)].map(m=>m[1]!);
  if(labels.length!==count)throw new Error('Dictionary labels do not match the binary');
  const word=(address:number)=>address===0?null:labels[(address-start)/width] ?? `@${address}`;
  const walkthrough=commandFile('reference/scripts/walkthrough.txt');
  const cases=[
    {id:'ordinary-and-all',prefix:0,commands:['take lamp','take all','south']},
    {id:'speech-one',prefix:21,commands:['answer "well"']},
    {id:'speech-two',prefix:21,commands:['answer "a well"']},
    {id:'speech-unquoted',prefix:21,commands:['answer well']},
    {id:'speech-say',prefix:0,commands:['say "hello"']},
    {id:'actor',prefix:40,commands:['robot, go east','look']},
    {id:'actor-quoted',prefix:40,commands:['tell robot "go east"','look']},
    {id:'wand',prefix:walkthrough.indexOf('say "float"'),commands:['say "float"']},
    {id:'implicit-take',prefix:29,commands:['eat green cake']},
    {id:'pseudo',prefix:6,commands:['examine stalagmite']},
    {id:'decision',prefix:0,commands:['quit','no','restart','no']},
    {id:'header',prefix:0,commands:['version','script','unscript']},
  ];
  return {format:'zxr-semantics-probes-v1',seed:2,dictionary:{entries:count,width},cases:cases.map(c=>{
    const run=runReference([...walkthrough.slice(0,c.prefix),...c.commands]),ram=[...memories(run)];
    const selected=run.checkpoints.flatMap((cp,i)=>{
      if(cp.input<c.prefix || !['parser-return','action-complete','read'].includes(cp.kind))return [];
      const m=Buffer.concat([ram[i]!,story.subarray(ram[i]!.length)]),base=m.readUInt16BE(12);
      const g=(name:string)=>{const n=symbols.globals.indexOf(name);if(n<0)throw new Error('Unknown global '+name);return m.readUInt16BE(base+2*n);};
      const lex=g('P-LEXV'),input=g('P-INBUF'),itbl=g('P-ITBL'),vtbl=g('P-VTBL');
      const words=Array.from({length:Math.min(10,m[lex]!)},(_,j)=>{
        const address=lex+2+4*j,dict=m.readUInt16BE(address),length=m[address+2]!,offset=m[address+3]!;
        return {index:1+2*j,word:word(dict),dictionary:dict,length,offset,text:m.subarray(input+offset,input+offset+length).toString('ascii')};
      });
      return [{input:cp.input-c.prefix,kind:cp.kind,routine:cp.routine,summary:cp.summary,
        globals:Object.fromEntries(['PRSA','PRSO','PRSI','WINNER','HERE','LIT','P-CONT','QUOTE-FLAG','P-WALK-DIR','AGAIN-DIR','P-WON','P-NCN','P-GETFLAGS','P-OFLAG','P-MERGED','P-ADVERB','P-END-ON-PREP','P-NUMBER','P-LEN','P-DIR','P-ACT','P-NAM','P-ADJ','P-GWIMBIT','P-SLOCBITS'].map(name=>[name,g(name)])),
        matchTables:Object.fromEntries(['P-PRSO','P-PRSI','P-BUTS'].map(name=>[name,Array.from({length:m.readUInt16BE(g(name))},(_,j)=>m.readUInt16BE(g(name)+2+2*j))])),
        inputBuffer:{capacity:m[input],text:m.subarray(input+1,m.indexOf(0,input+1)).toString('ascii')},
        lex:{address:lex,capacity:m[lex],count:m[lex+1],words},
        itbl:Array.from({length:10},(_,j)=>m.readUInt16BE(itbl+2*j)),
        vtbl:{word:word(m.readUInt16BE(vtbl)),length:m[vtbl+2],offset:m[vtbl+3]},
        syntax:g('P-SYNTAX')?m.subarray(g('P-SYNTAX'),g('P-SYNTAX')+8).toString('hex'):null,
        header:{release:m.readUInt16BE(2),serial:m.subarray(18,24).toString('ascii'),flags2:m.readUInt16BE(16)}}];
    });
    return {...c,transcript:run.transcript.slice(c.prefix+1),checkpoints:selected};
  })};
}
