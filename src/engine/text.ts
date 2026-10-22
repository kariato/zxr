/** The compiler emits standard V3 text without abbreviation tables. Length is an explicit word bound. */
export function decodeZText(readByte:(address:number)=>number,address:number,words:number):string {
  if(!Number.isInteger(address)||address<0||address>65535||!Number.isInteger(words)||words<0||words>255||address+words*2>65536)throw new Error('Invalid encoded-text bounds');
  const chars:number[]=[];for(let i=0;i<words;i++){
    const high=readByte(address+2*i),low=readByte(address+2*i+1);if(!Number.isInteger(high)||high<0||high>255||!Number.isInteger(low)||low<0||low>255)throw new Error('Invalid encoded-text bytes');
    const w=high*256+low;chars.push((w>>>10)&31,(w>>>5)&31,w&31);if(w&32768)break;
  }
  let alphabet=0,text='';const a2='\n0123456789.,!?_#\'"/\\-:()';
  for(let i=0;i<chars.length;i++){
    const c=chars[i]!;
    if(c===0){text+=' ';alphabet=0;continue;}
    if(c>=1&&c<=3)throw new Error('Abbreviations are unavailable in ZXR data images');
    if(c===4||c===5){alphabet=c-3;continue;}
    if(alphabet===2&&c===6){if(i+2>=chars.length)throw new Error('Truncated ZSCII escape');const code=(chars[++i]!<<5)|chars[++i]!;
      if(code===13)text+='\n';else if(code===9)text+='\t';else if(code>=32&&code<=126)text+=String.fromCharCode(code);else if(code!==0)throw new Error('Unsupported ZSCII text character '+code);
    }else text+=alphabet===2?a2[c-7]!:String.fromCharCode((alphabet===1?65:97)+c-6);
    alphabet=0;
  }return text;
}
