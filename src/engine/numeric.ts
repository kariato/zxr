export function word(value:number):number {if(!Number.isSafeInteger(value))throw new Error('Expected an integer word');return value&65535;}
export function assertWord(value:number):number {if(!Number.isInteger(value)||value<0||value>65535)throw new Error('Expected an unsigned 16-bit word');return value;}
export function signed(value:number):number {assertWord(value);return value>=32768?value-65536:value;}
/** Arithmetic only. Short-circuit forms and variable mutation belong to the continuation interpreter. */
export function numeric(operator:string,args:readonly number[]):number {
  for(const n of args)assertWord(n);
  const arity=(min:number,max=min)=>{if(args.length<min||args.length>max)throw new Error('Invalid '+operator+' arity');};
  if(operator==='+'||operator==='*')arity(2,65535);else if(operator==='-')arity(1,2);else if(operator==='EQUAL?')arity(2,4);else arity(['0?','ZERO?','1?','NOT'].includes(operator)?1:2);
  const a=args[0]!,b=args[1]!;
  switch(operator){
    case '+':return args.reduce((a,b)=>word(a+b));case '*':return args.reduce((a,b)=>word(a*b));case '-':return word(args.length===1?-signed(a):signed(a)-signed(b));
    case '/':if(!b)throw new Error('Division by zero');return word(Math.trunc(signed(a)/signed(b)));
    case 'MOD':if(!b)throw new Error('Division by zero');return word(signed(a)%signed(b));
    case 'BAND':return a&b;case 'BOR':return a|b;case 'BTST':return (a&b)===b?1:0;
    case 'EQUAL?':return args.slice(1).includes(a)?1:0;case '==?':return a===b?1:0;case 'N==?':return a!==b?1:0;
    case 'L?':return signed(a)<signed(b)?1:0;case 'G?':return signed(a)>signed(b)?1:0;
    case '0?':case 'ZERO?':case 'NOT':return a===0?1:0;case '1?':return a===1?1:0;
    default:throw new Error('Unknown numeric operator '+operator);
  }
}
export function updateCompare(operator:'IGRTR?'|'DLESS?',current:number,bound:number):{value:number;result:number} {
  if(operator!=='IGRTR?'&&operator!=='DLESS?')throw new Error('Unknown update operator');
  assertWord(current);assertWord(bound);const value=word(current+(operator==='IGRTR?'?1:-1));return {value,result:numeric(operator==='IGRTR?'?'G?':'L?',[value,bound])};
}
