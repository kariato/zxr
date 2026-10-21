import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ASSEMBLY_FILES, loadSymbols, sha256, STORY, STORY_SHA256 } from './symbols.ts';

const mnemonics: Record<string, string> = {
  'ZERO?':'jz', RANDOM:'random', 'GRTR?':'jg', RFALSE:'rfalse', GET:'loadw', RSTACK:'ret_popped',
  DEC:'dec', ADD:'add', MUL:'mul', SUB:'sub', PUT:'storew', INC:'inc', 'EQUAL?':'je', SET:'store', RETURN:'ret',
  PUTB:'storeb', CALL:'call', PUTP:'put_prop', 'FSET?':'test_attr', CRLF:'new_line', MOVE:'insert_obj', JUMP:'jump',
  PRINTR:'print_ret', RTRUE:'rtrue', 'FIRST?':'get_child', PRINTI:'print', PRINTD:'print_obj', PRINTB:'print_addr',
  MOD:'mod', PUSH:'push', 'IGRTR?':'inc_chk', GETB:'loadb', BAND:'and', LOC:'get_parent', 'IN?':'jin', GETP:'get_prop',
  READ:'read', 'DLESS?':'dec_chk', 'LESS?':'jl', BTST:'test', PRINTC:'print_char', PRINTN:'print_num', FCLEAR:'clear_attr',
  FSET:'set_attr', GETPT:'get_prop_addr', PTSIZE:'get_prop_len', DIV:'div', 'NEXT?':'get_sibling', RESTART:'restart',
  RESTORE:'restore', QUIT:'quit', SAVE:'save', BOR:'or', VERIFY:'verify', DIRIN:'input_stream', DIROUT:'output_stream',
  REMOVE:'remove_obj', PRINT:'print_paddr', VALUE:'load', POP:'pull', NEXTP:'get_next_prop',
};
// V3 opcode numbers, independent of the symbolic names in txd's output.
const opcodeNames: Record<number,string> = Object.fromEntries([
  [1,'je'],[2,'jl'],[3,'jg'],[4,'dec_chk'],[5,'inc_chk'],[6,'jin'],[7,'test'],[8,'or'],[9,'and'],
  [10,'test_attr'],[11,'set_attr'],[12,'clear_attr'],[13,'store'],[14,'insert_obj'],[15,'loadw'],[16,'loadb'],
  [17,'get_prop'],[18,'get_prop_addr'],[19,'get_next_prop'],[20,'add'],[21,'sub'],[22,'mul'],[23,'div'],[24,'mod'],
  [128,'jz'],[129,'get_sibling'],[130,'get_child'],[131,'get_parent'],[132,'get_prop_len'],[133,'inc'],[134,'dec'],
  [135,'print_addr'],[137,'remove_obj'],[138,'print_obj'],[139,'ret'],[140,'jump'],[141,'print_paddr'],[142,'load'],
  [176,'rtrue'],[177,'rfalse'],[178,'print'],[179,'print_ret'],[181,'save'],[182,'restore'],[183,'restart'],
  [184,'ret_popped'],[186,'quit'],[187,'new_line'],[189,'verify'],[224,'call'],[225,'storew'],[226,'storeb'],
  [227,'put_prop'],[228,'read'],[229,'print_char'],[230,'print_num'],[231,'random'],[232,'push'],[233,'pull'],
  [243,'output_stream'],[244,'input_stream'],
]);

export function auditReference() {
  const symbols = loadSymbols(), story = readFileSync(STORY);
  const require = createRequire(import.meta.url), { ZVM } = require('ifvms'), { MemoryView } = require('ifvms/src/common/utils.js');
  const vm = new ZVM();
  vm.prepare(story, { Glk: {} }); vm.m = MemoryView(story); vm.staticmem = story.readUInt16BE(14);
  vm.ram = MemoryView(vm.m, 0, vm.staticmem); vm.origram = vm.m.getUint8Array(0, vm.staticmem);
  vm.init_io = () => {}; vm.update_header = () => {}; vm.restart();
  for (const code of Object.keys(vm.opcodes)) vm.opcodes[code] = vm.opcodes[code].subClass({ stopper: 1 });
  const assert = (ok: boolean, message: string) => { if (!ok) throw new Error(`Reference audit: ${message}`); };
  assert(sha256(story) === STORY_SHA256, 'story hash');
  assert(story.equals(readFileSync('reference/zork2/zork2.zip')), 'ZIP differs from story');
  assert(story.length === 92524 && story[0] === 3 && story.readUInt16BE(2) === 63, 'release/size/version');
  assert(story.subarray(18,24).toString('ascii') === '860811', 'serial');
  let checksum = 0;
  for (let i = 64; i < story.length; i++) checksum = (checksum + story[i]!) & 65535;
  assert(checksum === story.readUInt16BE(28), 'story checksum');
  assert(/8\/11\s+63\s+92524\s+19820\s+251\s+168\s+689\s*$/.test(readFileSync('reference/zork2/zork2.chart','utf8')), 'chart last row');
  const deathSites: {routine:string;pc:number;file:string;line:number}[] = [];
  const routines = symbols.routines.map(r => {
    const lines = readFileSync(r.file,'utf8').split('\n').slice(r.line);
    const end = lines.findIndex(line => line.includes('.FUNCT'));
    const section = lines.slice(0, end < 0 ? undefined : end).join('\n');
    const ops = [...section.matchAll(/^(?:[^\s\"]+:)?\t([A-Z][A-Z0-9?]*)(?:[ \t]+([^\n]*)|$)/gm)].filter(m => m[1] !== 'ENDI');
    assert(ops.length === r.instructions.length, `${r.name}: instruction count`);
    assert(story[r.address] === r.locals.length, `${r.name}: local count`);
    for (let i=0;i<ops.length;i++) {
      const instruction = r.instructions[i]!;
      if (ops[i]![1] === 'CALL' && /^JIGS-UP(?:,|\s|$)/.test(ops[i]![2]!)) {
        deathSites.push({routine:r.name,pc:instruction.pc,file:r.file,line:r.line+1+section.slice(0,ops[i]!.index).split('\n').length-1});
      }
      assert(mnemonics[ops[i]![1]!] === instruction.mnemonic, `${r.name}:${i}: assembly opcode differs`);
      vm.pc = instruction.pc;
      const decoded = vm.disassemble().ops[0];
      assert(opcodeNames[decoded.code] === instruction.mnemonic, `${r.name}:${i}: binary opcode differs`);
      const next = r.instructions[i+1]?.pc;
      if (next) assert(vm.pc === next, `${r.name}:${i}: binary instruction length differs`);
    }
    return { name:r.name, address:r.address, locals:r.locals.length, instructions:ops.length };
  });
  const hashes = Object.fromEntries(readdirSync('reference/zork2').filter(f => /\.(zil|zap)$/.test(f)).sort().map(f => [f,sha256(readFileSync(`reference/zork2/${f}`))]));
  const spotChecks = JSON.parse(readFileSync('reference/spot-checks.json','utf8')) as {routine:string;file:string;zil:string[];zap:string[];review:string}[];
  assert(spotChecks.length === 20 && new Set(spotChecks.map(s=>s.routine)).size === 20, 'twenty distinct source spot checks');
  for (const check of spotChecks) {
    for (const extension of ['zil','zap'] as const) {
      const text = readFileSync(`reference/zork2/${check.file}.${extension}`,'utf8');
      const escaped = check.routine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const start = text.search(new RegExp(extension === 'zil' ? `<ROUTINE\\s+${escaped}(?=[\\s(])` : `\\.FUNCT\\s+${escaped}(?=[,\\s])`));
      assert(start >= 0, `${check.routine}: ${extension} declaration`);
      const remainder = text.slice(start+1), next = remainder.search(extension === 'zil' ? /^<ROUTINE\s/gm : /\.FUNCT\s/g);
      const body = text.slice(start, next < 0 ? undefined : start+1+next);
      for (const token of check[extension]) assert(body.includes(token), `${check.routine}: ${extension} spot check ${token}`);
    }
  }
  assert(readFileSync('reference/zork2/gmain.zap','utf8').includes('EQUAL?\tPRSI,IT /?CND16'), 'PREDGEN PERFORM guard');
  return { format:'zxr-audit-v1', story:{sha256:STORY_SHA256,version:3,release:63,serial:'860811',bytes:92524,checksum},
    zipIdentical:true, chartMatches:true, hashes,
    disassembly:{file:'reference/disassembly/zork2.txd.txt',sha256:sha256(readFileSync('reference/disassembly/zork2.txd.txt')),
      tool:'ecliptik/ztools txd',commit:'73eb4bdc8d711f92728bfd4aa295fd76774cadc0',arguments:['-a','-n','-w','200'],
      comparison:'439 routine headers and complete opcode sequences; binary instruction offsets independently decoded with ifvms. Operands are spot-checked, not exhaustively compared.'},
    assemblyFiles:ASSEMBLY_FILES, objects:symbols.objects.length-1, globals:symbols.globals.length,
    interrupts:symbols.routines.filter(r=>r.name.startsWith('I-')).map(r=>r.name), routines,
    deathSites, spotChecks, branches:{'ZORK-NUMBER':2,PREDGEN:'PERFORM uses the PREDGEN variant, including its PRSI=IT guard. The source ID 0 directive and binary release 63 remain a build-metadata discrepancy; the original build driver is unavailable.'} };
}
