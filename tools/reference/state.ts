import { readFileSync } from 'node:fs';
import { loadSymbols, sha256, STORY } from './symbols.ts';
import type { ReferenceRun } from './runner.ts';

/** Reconstruct and verify every RAM snapshot, including bytes not yet understood by ZXR. */
export function* memories(run: ReferenceRun): Generator<Buffer> {
  const memory = Buffer.from(run.initialMemory, 'base64');
  for (const checkpoint of run.checkpoints) {
    for (const [offset, hex] of checkpoint.patches) {
      const bytes = Buffer.from(hex, 'hex');
      if (offset < 0 || offset + bytes.length > memory.length || bytes.length * 2 !== hex.length) throw new Error('Invalid memory patch');
      bytes.copy(memory, offset);
    }
    if (sha256(memory) !== checkpoint.stateHash) throw new Error(`Snapshot checksum failed at input ${checkpoint.input}`);
    yield Buffer.from(memory);
  }
}

/** V3 object tree, attributes, property bytes, globals and ordered interrupt slots. */
export function decodeState(ram: Buffer) {
  const symbols = loadSymbols(), story = readFileSync(STORY);
  const memory = Buffer.concat([ram, story.subarray(ram.length)]);
  const globalBase = memory.readUInt16BE(12), objectBase = memory.readUInt16BE(10) + 62;
  const globals = Object.fromEntries(symbols.globals.map((name, index) => [name, memory.readUInt16BE(globalBase + index * 2)]));
  const objects = symbols.objects.slice(1).map((name, index) => {
    const address = objectBase + index * 9, table = memory.readUInt16BE(address + 7);
    let cursor = table + 1 + memory[table]! * 2;
    const properties: { id: number; address: number; bytes: string }[] = [];
    while (memory[cursor]) {
      const header = memory[cursor++]!, size = (header >>> 5) + 1;
      properties.push({ id: header & 31, address: cursor, bytes: memory.subarray(cursor, cursor + size).toString('hex') });
      cursor += size;
    }
    return { id: index + 1, name, attributes: memory.subarray(address, address + 4).toString('hex'),
      parent: memory[address + 4]!, sibling: memory[address + 5]!, child: memory[address + 6]!, properties };
  });
  const clock = globals['C-TABLE']!, interrupts = [];
  for (let offset = globals['C-INTS']!; offset < 180; offset += 6) {
    const address = clock + offset, packed = memory.readUInt16BE(address + 4);
    interrupts.push({ offset, enabled: memory.readUInt16BE(address), ticks: memory.readInt16BE(address + 2),
      routine: symbols.byAddress.get(packed * 2)?.name ?? packed });
  }
  return { globals, objects, interrupts };
}
