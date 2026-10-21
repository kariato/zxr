import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { ReferenceRandom } from './random.ts';
import { loadSymbols, sha256, STORY, STORY_SHA256 } from './symbols.ts';

const require = createRequire(import.meta.url);
// ifvms is deliberately confined to development tooling. Its internals are pinned.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Vm = any;
const { ZVM } = require('ifvms');
const { MemoryView } = require('ifvms/src/common/utils.js');
if (require('ifvms/package.json').version !== '1.1.6') throw new Error('The reference adapter requires ifvms 1.1.6');

export interface RandomDraw { input: number; pc: number; routine: string; stack: string[]; category: 'parser' | 'game'; range: number; result: number; reseed?: number }
export interface Summary { room: string; winner: string; score: number; moves: number; won: boolean; deaths: number }
export interface Checkpoint {
  input: number; kind: 'parser-return' | 'action-complete' | 'read' | 'end'; routine: string; pc: number;
  randomPosition: number; stateHash: string; summary: Summary; patches: [number, string][];
  stack: string[]; locals: number[];
  parser?: { direct: number[]; indirect: number[]; syntax: number; globals: Record<string, number> };
}
export interface ReferenceRun {
  format: 'zxr-reference-v1'; interpreter: { package: string; version: string; adapter: number; rng: string; seed: number; storySha256: string; settings: Record<string,string|number|boolean> };
  commands: string[]; transcript: string[]; random: RandomDraw[]; initialMemory: string;
  checkpoints: Checkpoint[]; routineCoverage: string[]; final: Summary;
  host: { input: number; operation: 'save' | 'restore'; success: boolean }[];
  deaths: { input: number; pc: number; routine: string }[];
}
interface ReadRequest { text: number; parse: number }

/** Executes the actual V3 binary. No game routines or rule state are replaced. */
export function runReference(commands: string[], seed = 2, options: { capture?: boolean; maxInstructions?: number } = {}): ReferenceRun {
  const symbols = loadSymbols();
  const parserRoutines = new Set(symbols.routines.filter(r => r.file.endsWith('gparser.zap')).map(r => r.name));
  const story = readFileSync(STORY);
  if (sha256(story) !== STORY_SHA256) throw new Error('Reference story hash mismatch');
  const vm: Vm = new ZVM();
  const random = new ReferenceRandom(seed);
  const draws: RandomDraw[] = [], checkpoints: Checkpoint[] = [], transcript: string[] = [''];
  const coverage = new Set<string>(), calls: string[] = ['GO'];
  const host: ReferenceRun['host'] = [];
  const deaths: ReferenceRun['deaths'] = [];
  let input = -1, request: ReadRequest | undefined, instructions = 0, lastPc = 0;
  let previous = new Uint8Array(story.subarray(0, story.readUInt16BE(14)));
  let initialMemory = '';
  const capture = options.capture !== false;
  const maxInstructions = options.maxInstructions ?? 5_000_000;
  const current = () => calls.at(-1) ?? 'GO';
  const global = (name: string): number => {
    const index = symbols.globals.indexOf(name);
    if (index < 0) throw new Error(`Unknown reference global ${name}`);
    return vm.m.getUint16(vm.globals + 2 * index);
  };
  const summary = (): Summary => ({
    room: symbols.objects[global('HERE')] ?? 'NOTHING', winner: symbols.objects[global('WINNER')] ?? 'NOTHING',
    score: global('SCORE'), moves: global('MOVES'), won: Boolean(global('WON-FLAG')), deaths: global('DEATHS'),
  });
  const checkpoint = (kind: Checkpoint['kind'], routine = current()) => {
    if (!capture) return;
    const memory = new Uint8Array(vm.ram.getUint8Array(0, vm.staticmem));
    const patches: [number, string][] = [];
    for (let i = 0; i < memory.length;) {
      if (memory[i] === previous[i]) { i++; continue; }
      const start = i++;
      while (i < memory.length && memory[i] !== previous[i]) i++;
      patches.push([start, Buffer.from(memory.subarray(start, i)).toString('hex')]);
    }
    previous = memory;
    const entry: Checkpoint = { input, kind, routine, pc: vm.pc, randomPosition: draws.length,
      stateHash: sha256(memory), summary: summary(), patches, stack: [...calls], locals: Array.from(vm.l as Uint16Array) };
    if (kind === 'parser-return') {
      const matches = (name: string) => {
        const address = global(name), count = vm.m.getUint16(address);
        if (count > 49) throw new Error(`Invalid ${name} match count ${count}`);
        return Array.from({ length: count }, (_, i) => vm.m.getUint16(address + 2 + i * 2));
      };
      entry.parser = { direct: matches('P-PRSO'), indirect: matches('P-PRSI'), syntax: global('P-SYNTAX'),
        globals: Object.fromEntries(['PRSA', 'PRSO', 'PRSI', 'WINNER', 'HERE', 'LIT', 'P-CONT', 'QUOTE-FLAG', 'P-WALK-DIR', 'P-WON'].map(name => [name, global(name)])) };
    }
    checkpoints.push(entry);
  };

  vm.prepare(story, { Glk: { glk_exit() { /* quit is captured below */ } }, stack_len: 100_000, undo_len: 1_000_000 });
  // The constructor created the JIT cache; drive execution without a Glk event loop.
  vm.m = MemoryView(story);
  vm.staticmem = vm.m.getUint16(14);
  vm.ram = MemoryView(vm.m, 0, vm.staticmem);
  vm.origram = vm.m.getUint8Array(0, vm.staticmem);
  vm.init_io = () => { vm.io = { streams: [0, 1, {}, [], {}] }; };
  vm.update_header = () => { vm.ram.setUint8(1, (vm.ram.getUint8(1) & 0x8f) | 0x50); };
  vm.v3_status = () => {};
  vm.split_window = () => {};
  vm.set_window = () => {};
  vm.set_style = () => {};
  vm.output_stream = () => { throw new Error('Reference output_stream is not supported by this host'); };
  vm.input_stream = () => { throw new Error('Reference input_stream is not supported by this host'); };
  vm._print = (text: string) => { transcript[input + 1] = (transcript[input + 1] ?? '') + text.replaceAll('\r', '\n'); };
  vm.read = (_storer: number, text: number, parse: number) => {
    request = { text, parse }; vm.stop = 1; checkpoint('read');
    if (calls.includes('FINISH')) checkpoint('end');
  };
  vm.random = (range: number) => {
    const result = range > 0 ? random.draw(range) : 0;
    if (range <= 0) random.seed(range < 0 ? -range : seed);
    draws.push({ input, pc: lastPc, routine: current(), stack: [...calls], category: calls.some(name => parserRoutines.has(name)) ? 'parser' : 'game',
      range, result, ...(range <= 0 ? { reseed: range < 0 ? -range : seed } : {}) });
    return result;
  };
  const call = vm.call.bind(vm), ret = vm.ret.bind(vm);
  vm.call = (address: number, storer: number, next: number, args: number[]) => {
    if (symbols.byAddress.get(address * 2)?.name === 'JIGS-UP') deaths.push({ input, pc: lastPc, routine: current() });
    call(address, storer, next, args);
    if (address) {
      const routine = symbols.byAddress.get(address * 2)?.name;
      if (!routine) throw new Error(`Unmapped routine ${address * 2}`);
      calls.push(routine); coverage.add(routine);
    }
  };
  vm.ret = (result: number) => {
    const routine = current();
    ret(result); calls.pop();
    if (routine === 'PARSER') checkpoint('parser-return', routine);
    if (routine === 'MAIN-LOOP-1') checkpoint('action-complete', routine);
  };
  const originalRestart = vm.restart.bind(vm);
  vm.restart = () => {
    originalRestart(); random.seed(seed); calls.splice(0, calls.length, 'GO'); coverage.add('GO');
    // One instruction per JIT unit gives precise PC/checkpoint instrumentation.
    // Opcode semantics remain upstream ifvms code.
    for (const code of Object.keys(vm.opcodes)) vm.opcodes[code] = vm.opcodes[code].subClass({ stopper: 1 });
  };
  vm.compile = () => {
    const start = vm.pc, context = vm.disassemble(), next = vm.pc;
    vm.jit[start] = new Function('e', `e.pc=${next};${String(context)}`);
  };
  vm.run = () => {
    vm.stop = 0;
    while (!vm.stop) {
      if (++instructions > maxInstructions) throw new Error(`Reference instruction budget exceeded at ${vm.pc}`);
      const pc = lastPc = vm.pc;
      if (!vm.jit[pc]) vm.compile();
      if (typeof vm.jit[pc] !== 'function') throw new Error(`PC points into string data: ${pc}`);
      const result = vm.jit[pc](vm);
      if (!isNaN(result)) vm.ret(result);
    }
  };
  // File operations preserve the upstream Quetzal format and branch semantics.
  const saves = new Map<string, { data: Uint8Array; calls: string[]; random: ReturnType<ReferenceRandom['snapshot']> }>();
  vm.save = (pc: number) => {
    vm.pc = pc; saves.set('default', { data: new Uint8Array(vm.save_file(pc)), calls: [...calls], random: random.snapshot() });
    host.push({ input, operation: 'save', success: true }); finishFile(1); vm.stop = 0;
  };
  vm.restore = (pc: number) => {
    vm.pc = pc;
    const saved = saves.get('default'), data = saved?.data;
    const result = data ? vm.restore_file(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) : 0;
    if (result) {
      calls.splice(0, calls.length, ...saved!.calls); random.restore(saved!.random);
    }
    host.push({ input, operation: 'restore', success: Boolean(result) }); finishFile(result); vm.stop = 0;
  };
  function finishFile(result: number) {
    const byte = vm.m.getUint8(vm.pc++), sense = Boolean(byte & 0x80);
    let offset = byte & 0x3f;
    if (!(byte & 0x40)) { offset = (offset << 8) | vm.m.getUint8(vm.pc++); if (offset & 0x2000) offset -= 0x4000; }
    if (Boolean(result) === sense) { if (offset === 0 || offset === 1) vm.ret(offset); else vm.pc += offset - 2; }
  }
  vm.restart();
  previous = new Uint8Array(vm.ram.getUint8Array(0, vm.staticmem));
  initialMemory = Buffer.from(previous).toString('base64');
  vm.run();
  for (input = 0; input < commands.length; input++) {
    if (!request || vm.quit) throw new Error(`Command ${input + 1} supplied after the story stopped: ${commands[input]}`);
    const command = commands[input]!;
    if (!/^[\x20-\x7e]*$/.test(command)) throw new Error(`Non-ASCII command ${input + 1}`);
    const encoded = vm.text_to_zscii(command.toLowerCase());
    // V3 capacity includes the terminating zero (as in ifvms's own READ host).
    if (encoded.length >= vm.m.getUint8(request.text)) throw new Error(`Command ${input + 1} exceeds the story input capacity`);
    vm.ram.setUint8Array(request.text + 1, [...encoded, 0]);
    vm.tokenise(request.text, request.parse);
    request = undefined;
    transcript[input + 1] = '';
    vm.run();
  }
  if (vm.quit || summary().won) checkpoint('end');
  return { format: 'zxr-reference-v1', interpreter: { package: 'ifvms', version: '1.1.6', adapter: 1, rng: 'MT19937/CPython-integer-seed/randbelow-v1', seed, storySha256: STORY_SHA256,
      settings: { instructionLimit:maxInstructions, memoryCheckpoints:capture, stackBytes:100_000, undoBytes:1_000_000,
        statusLine:false, lineWrapping:false, inputEncoding:'printable ASCII', newline:'LF', saveSlots:1,
        randomZero:'configured seed', randomRestart:'configured seed', randomStateInSaves:true, streamSelection:'unsupported' } },
    commands, transcript, random: draws, initialMemory, checkpoints, routineCoverage: [...coverage].sort(), final: summary(), host, deaths };
}
