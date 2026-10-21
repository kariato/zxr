/** Reviewed definitions are deliberately independent of the generated operation inventory. */
export const primitiveGroups = [
  {operations:['+','-','*','/','MOD'],contract:'Signed 16-bit arithmetic; wrap results; / truncates toward zero; MOD has dividend sign. Zero divisor errors. Unary - negates.'},
  {operations:['BAND','BOR'],contract:'Bitwise AND/OR on 16-bit patterns; return the resulting word.'},
  {operations:['BTST'],contract:'Return 1 iff every bit of the second operand occurs in the first; otherwise 0.'},
  {operations:['EQUAL?','==?','N==?','L?','G?','0?','ZERO?','1?','NOT'],contract:'Predicates return 0/1. Equality compares patterns (EQUAL? supports alternative operands); N==? negates equality; ordering is signed. NOT/0?/ZERO? test zero; 1? tests one.'},
  {operations:['IGRTR?','DLESS?'],contract:'First operand designates a variable, not its value. Increment/decrement with wrap, store, then compare signed against the evaluated bound; return 0/1.'},
  {operations:['SET','SETG','VALUE'],contract:'SET writes a named local; SETG a named global. Both return the assigned word. VALUE reads the variable whose numeric variable number is supplied (global slots start at 16). Invalid references error.'},
  {operations:['COND','AND','OR'],contract:'Left-to-right short-circuit control flow. COND returns its selected last expression, or test value for an empty body, or 0 if none. AND returns 0 on failure, otherwise last value; OR returns first nonzero, otherwise 0.'},
  {operations:['PROG','REPEAT','RETURN','AGAIN'],contract:'Block bindings are lexical and initialized in order. PROG runs once; REPEAT repeats. RETURN exits the nearest enclosing PROG/REPEAT, or routine if none, with value (default 1); AGAIN restarts that activation. Routine fallthrough returns the final expression. Empty statement block returns 1.'},
  {operations:['RTRUE','RFALSE','PUSH','RSTACK'],contract:'RTRUE/RFALSE return from the routine with 1/0 across all nested blocks. PUSH adds a word to this frame operand stack; RSTACK pops and returns from the routine. Underflow errors. RFATAL expands to PUSH 2/RSTACK.'},
  {operations:['APPLY'],contract:'Evaluate routine word and arguments once in order; call that routine; zero routine returns zero. Ordinary named routine calls use the same frame/default/return rules.'},
  {operations:['LOC','FIRST?','NEXT?','IN?','MOVE','REMOVE'],contract:'Read parent/first child/next sibling or test immediate parent. MOVE detaches then inserts first under destination; REMOVE detaches. Mutators are statement operations with value 1 in value position; invalid objects and tree cycles error.'},
  {operations:['FSET','FCLEAR','FSET?'],contract:'Set/clear/test reference-numbered attribute, 0..31. Test returns 0/1; mutation returns 1 in value position.'},
  {operations:['GETP','PUTP','GETPT','PTSIZE','NEXTP'],contract:'Reference-numbered properties in descending order. Missing GETP uses defaults; GETPT missing returns 0; PTSIZE 0 returns 0. GETP reads byte or first word; PUTP requires an existing 1/2-byte property and returns 1. NEXTP obj 0 returns first property; otherwise next, or 0 at end.'},
  {operations:['GET','PUT','GETB','PUTB','REST','BACK'],contract:'GET/PUT use byte address + 2*index, GETB/PUTB address + index. Words big-endian, byte writes use low 8 bits; writes return 1. REST/BACK add/subtract byte count; address overflow or access outside a declared segment errors. Interior pointers retain identity.'},
  {operations:['PRINT','PRINTI','PRINTB','PRINTC','PRINTD','PRINTN','CRLF'],contract:'Print string reference/inline literal/dictionary word/ZSCII character/object short name/signed number/newline. Each yields 1 when a value is required. Physical source newlines fold to spaces, except a formatting newline immediately after | is suppressed; | emits a newline. Preserve other spacing. PRINTD reads mutable encoded short-name bytes.'},
  {operations:['RANDOM'],contract:'Positive signed bound draws 1..n; negative reseeds with -n and returns 0; zero deterministically reseeds per compatibility policy and returns 0. Replay validates every range and draw position.'},
  {operations:['READ','SAVE','RESTORE','RESTART','QUIT'],contract:'Suspend in an explicit serializable continuation. READ fills V3 buffers then resumes. SAVE captures its success continuation; RESTORE success replaces the current continuation with the saved one. Failures resume false. Restart invokes fresh GO; quit is terminal.'},
  {operations:['VERIFY'],contract:'Return true only for a validated complete semantic bundle. This replaces the original story checksum check; never pretend an invalid bundle verified.'},
  {operations:['DIRIN','DIROUT'],contract:'Compiled debug stream verbs only; not exposed as options. Reaching either fails explicitly as unsupported host stream selection; no silent no-op.'},
] as const;

/** Excluded from ordinary world comparison only, never from saves/rollback/replay. */
export const scratchGroups = [
  {names:['P-LEN','P-DIR','P-NCN','P-ACT','P-DIRECTION','P-ADJN','P-AND','P-XNAM','P-XADJ','P-XADJN','P-ACLAUSE','P-ANAM','P-AADJ'],reason:'Typed noun/clause scanning and ambiguity scratch; option identity supplies explicit operands. Helper preconditions and parser-return assertions test any retained use.'},
  {names:['P-OFLAG','P-MERGED','P-END-ON-PREP','RESERVE-PTR','AGAIN-DIR'],reason:'Orphan merging, reserve input and AGAIN are replaced; adapter initializes unsupported modes to zero, except directional AGAIN-DIR which is checked in parser fixtures.'},
  {names:['P-TABLE','P-GWIMBIT','P-SLOCBITS'],reason:'Scratch of retained LIT?/DO-SL/search helpers. Check helper effects independently; do not call these helpers from pure queries.'},
] as const;

export const parserBufferGlobals=['P-LEXV','P-INBUF','AGAIN-LEXV','RESERVE-LEXV','OOPS-INBUF','OOPS-TABLE','P-CCTBL','P-ITBL','P-OTBL','P-VTBL','P-OVTBL','P-PRSO','P-PRSI','P-BUTS','P-MERGE','P-OCLAUSE'] as const;
export const protocolGlobals=['P-CONT','QUOTE-FLAG','P-SYNTAX'] as const;

export function verifyPrimitiveInventory(operations:readonly string[]):void {
  const supported=new Set(primitiveGroups.flatMap(g=>[...g.operations]));
  const unknown=operations.filter(op=>!supported.has(op as never));
  const unused=[...supported].filter(op=>!operations.includes(op));
  if(unknown.length || unused.length)throw new Error(`Primitive contract mismatch: unknown [${unknown}], unused [${unused}]`);
}
