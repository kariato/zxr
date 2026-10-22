/** V3 standard alphabet, no abbreviation references. Dictionary keys use six zcharacters. */
export function encodeZText(text:string,dictionary=false):number[] {
  const chars:number[]=[],a2='\n0123456789.,!?_#\'"/\\-:()';
  for(const c of text){const code=c.codePointAt(0)!;
    if(c===' ')chars.push(0);
    else if(c>='a'&&c<='z')chars.push(code-97+6);
    else if(c>='A'&&c<='Z')chars.push(4,code-65+6);
    else if(a2.includes(c))chars.push(5,a2.indexOf(c)+7);
    else {if(code>127)throw new Error('Unsupported V3 text character '+c);chars.push(5,6,code>>>5,code&31);}
  }
  if(dictionary){chars.splice(6);while(chars.length<6)chars.push(5);}
  else {if(!chars.length)return [];while(chars.length%3)chars.push(5);}
  const bytes:number[]=[];for(let i=0;i<chars.length;i+=3){const w=(chars[i]!<<10)|(chars[i+1]!<<5)|chars[i+2]!|(i+3===chars.length?32768:0);bytes.push(w>>>8,w&255);}return bytes;
}
