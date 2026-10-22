/** Canonical JSON for build/checkpoint identity: sorted keys, ordered arrays, safe integers only. */
export function canonicalJson(value:unknown):string {
  const active=new Set<object>();
  const encode=(v:unknown):string=>{
    if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
    if(typeof v==='number'){if(!Number.isSafeInteger(v))throw new Error('Canonical JSON requires safe integers');return String(v===0?0:v);}
    if(typeof v!=='object'||!v)throw new Error('Canonical JSON rejects undefined and non-JSON values');
    if(active.has(v))throw new Error('Canonical JSON rejects cycles');active.add(v);let text:string;
    if(Array.isArray(v)){if(Object.keys(v).length!==v.length)throw new Error('Canonical JSON rejects sparse/custom arrays');text='['+Array.from(v,encode).join(',')+']';}
    else {const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==null)throw new Error('Canonical JSON requires plain objects');text='{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+encode((v as Record<string,unknown>)[k])).join(',')+'}';}
    active.delete(v);return text;
  };return encode(value);
}
export function utf8Encode(text:string):Uint8Array {
  const bytes=new Uint8Array(text.length*3);let i=0;for(const c of text){let n=c.codePointAt(0)!;if(n>=0xd800&&n<=0xdfff)n=0xfffd;
    if(n<128)bytes[i++]=n;
    else if(n<2048){bytes[i++]=192|(n>>>6);bytes[i++]=128|(n&63);}
    else if(n<65536){bytes[i++]=224|(n>>>12);bytes[i++]=128|((n>>>6)&63);bytes[i++]=128|(n&63);}
    else {bytes[i++]=240|(n>>>18);bytes[i++]=128|((n>>>12)&63);bytes[i++]=128|((n>>>6)&63);bytes[i++]=128|(n&63);}
  }return bytes.slice(0,i);
}
export function utf8Decode(bytes:Uint8Array):string {
  const chars:string[]=[],chunk:number[]=[];const emit=(n:number)=>{chunk.push(n);if(chunk.length===8192){chars.push(String.fromCodePoint(...chunk));chunk.length=0;}};for(let i=0;i<bytes.length;){const a=bytes[i++]!;if(a<128){emit(a);continue;}
    const count=a>=194&&a<=223?1:a>=224&&a<=239?2:a>=240&&a<=244?3:-1;if(count<0||i+count>bytes.length)throw new Error('Invalid UTF-8');
    let n=a&((1<<(6-count))-1);for(let j=0;j<count;j++){const b=bytes[i++]!;if((b&192)!==128)throw new Error('Invalid UTF-8');n=(n<<6)|(b&63);}
    if(n<(count===1?128:count===2?2048:65536)||n>0x10ffff||n>=0xd800&&n<=0xdfff)throw new Error('Invalid UTF-8');emit(n);
  }if(chunk.length)chars.push(String.fromCodePoint(...chunk));return chars.join('');
}
const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
/** Synchronous SHA-256, kept independent of host cryptography and I/O. */
export function sha256Bytes(input:Uint8Array):string {
  const data=new Uint8Array(Math.ceil((input.length+9)/64)*64);data.set(input);data[input.length]=128;
  const bits=input.length*8;for(let i=0;i<8;i++)data[data.length-1-i]=Math.floor(bits/2**(8*i))&255;
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64),ror=(x:number,n:number)=>(x>>>n)|(x<<(32-n));
  for(let base=0;base<data.length;base+=64){for(let i=0;i<16;i++){const p=base+4*i;w[i]=(data[p]!<<24)|(data[p+1]!<<16)|(data[p+2]!<<8)|data[p+3]!;}
    for(let i=16;i<64;i++){const x=w[i-15]!,y=w[i-2]!,s0=ror(x,7)^ror(x,18)^(x>>>3),s1=ror(y,17)^ror(y,19)^(y>>>10);w[i]=(w[i-16]!+s0+w[i-7]!+s1)>>>0;}
    let [a,b,c,d,e,f,g,z]=h as [number,number,number,number,number,number,number,number];
    for(let i=0;i<64;i++){const t1=(z+(ror(e,6)^ror(e,11)^ror(e,25))+((e&f)^(~e&g))+K[i]!+w[i]!)>>>0,t2=((ror(a,2)^ror(a,13)^ror(a,22))+((a&b)^(a&c)^(b&c)))>>>0;z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    for(const [i,v] of [a,b,c,d,e,f,g,z].entries())h[i]=(h[i]!+v)>>>0;
  }return h.map(v=>v.toString(16).padStart(8,'0')).join('');
}
export const hashJson=(value:unknown)=>sha256Bytes(utf8Encode(canonicalJson(value)));
