import type { LoadedGame } from './bundle-loader.ts';
import type { WorldState } from './world-state.ts';
import { assertWord } from './numeric.ts';
import { encodeZText } from '../zil/encoding.ts';

export interface ReadToken {text:string;address:number;length:number;offset:number}
export interface ReadEncoding {text:string;tokens:ReadToken[]}
/** V3 SIBREAKS tokenization; dictionary lookup uses the four encoded bytes, including truncation. */
export function encodeReadText(game:LoadedGame,input:string):ReadEncoding {
  if(typeof input!=='string'||!/^[\x20-\x7e]*$/.test(input)||input.length>254)throw new Error('READ requires bounded printable ASCII text');
  const text=input.toLowerCase(),tokens:ReadToken[]=[],dictionary=new Map<string,number>(),memory=game.bundle.payload.memory;
  for(const word of memory.words){const key=memory.bytes.slice(word.address,word.address+4).join(',');if(dictionary.has(key))throw new Error('Ambiguous encoded dictionary entry');dictionary.set(key,word.address);}
  let i=0;
  while(i<text.length){
    if(text[i]===' '){i++;continue;}
    const start=i;if('.,"'.includes(text[i]!))i++;
    else while(i<text.length&&text[i]!==' '&&!'.,"'.includes(text[i]!))i++;
    const word=text.slice(start,i),address=dictionary.get(encodeZText(word,true).join(',')) ?? 0;
    tokens.push({text:word,address,length:word.length,offset:start+1});
  }
  return {text,tokens};
}
/** Return a new world so capacity/protection errors cannot partially alter the supplied state. */
export function writeReadText(game:LoadedGame,world:WorldState,textBuffer:number,parseBuffer:number,input:string):WorldState {
  if(world.buildHash!==game.buildHash)throw new Error('READ world belongs to another build');
  assertWord(textBuffer);assertWord(parseBuffer);
  const encoding=encodeReadText(game,input),textCapacity=world.getByte(textBuffer),parseCapacity=world.getByte(parseBuffer);
  if(encoding.text.length>=textCapacity||encoding.tokens.length>parseCapacity)throw new Error('READ buffer capacity exceeded');
  world.getByte(textBuffer,textCapacity);world.getByte(parseBuffer,1+4*parseCapacity);
  const textEnd=textBuffer+textCapacity+1,parseEnd=parseBuffer+2+4*parseCapacity;
  if(textBuffer<parseEnd&&parseBuffer<textEnd)throw new Error('READ buffers overlap');
  const next=world.fork();
  for(let i=0;i<encoding.text.length;i++)next.putByte(textBuffer,1+i,encoding.text.charCodeAt(i));
  next.putByte(textBuffer,1+encoding.text.length,0);next.putByte(parseBuffer,1,encoding.tokens.length);
  for(const [i,token] of encoding.tokens.entries()){
    next.putWord(parseBuffer,1+2*i,token.address);next.putByte(parseBuffer,4+4*i,token.length);next.putByte(parseBuffer,5+4*i,token.offset);
  }
  return next;
}
/** Decision API accepts a single canonical word; general command encoding is separate. */
export function writeReadWord(game:LoadedGame,world:WorldState,textBuffer:number,parseBuffer:number,word:string):WorldState {
  if(typeof word!=='string'||!/^[A-Z]+$/.test(word))throw new Error('READ requires one canonical ASCII word');
  return writeReadText(game,world,textBuffer,parseBuffer,word);
}
