import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const STORY = 'reference/zork2/COMPILED/zork2.z3';
export const STORY_SHA256 = '3ae7d5558943e9721f3e4b273c8a7faec1a03a604e1ae4ee1cde472c21cb24ac';
export const ASSEMBLY_FILES = ['gmacros', '2dungeon', 'gglobals', 'gclock', 'gmain', 'gparser', 'gverbs', '2actions'];
export const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

export interface Routine { name: string; address: number; packed: number; locals: string[]; file: string; line: number; instructions: { pc: number; mnemonic: string }[] }
export interface Symbols {
  routines: Routine[];
  byAddress: Map<number, Routine>;
  objects: string[];
  globals: string[];
  constants: Record<string, number>;
}

export function loadSymbols(): Symbols {
  const assembly: { name: string; locals: string[]; file: string; line: number }[] = [];
  for (const name of ASSEMBLY_FILES) {
    const file = `reference/zork2/${name}.zap`;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\.FUNCT\s+([^\r\n]+)/g)) {
      const [routine, ...locals] = match[1]!.trim().split(',');
      assembly.push({ name: routine!, locals, file, line: text.slice(0, match.index).split('\n').length });
    }
  }
  const disassembly = readFileSync('reference/disassembly/zork2.txd.txt', 'utf8');
  const binary = [...disassembly.matchAll(/(?:Main r|R)outine ([0-9a-f]+), (\d+) local[^\n]*\n([\s\S]*?)(?=\n(?:Main r|R)outine |\n\[End of code)/g)];
  if (binary.length !== assembly.length || binary.length !== 439) throw new Error('Reference routine manifest does not match assembly');
  const routines = assembly.map((routine, i) => {
    const entry = binary[i]!;
    const address = Number.parseInt(entry[1]!, 16);
    if (Number(entry[2]) !== routine.locals.length) throw new Error(`Local-count mismatch: ${routine.name}`);
    return { ...routine, address, packed: address / 2,
      instructions: [...entry[3]!.matchAll(/^\s*([0-9a-f]+):\s+([a-z_0-9]+)/gm)].map(m => ({ pc: Number.parseInt(m[1]!, 16), mnemonic: m[2]! })),
    };
  });
  const data = readFileSync('reference/zork2/zork2dat.zap', 'utf8');
  const constants: Record<string, number> = {};
  for (const match of data.matchAll(/^\s*([^\s=]+)=(-?\d+)\s*$/gm)) constants[match[1]!] = Number(match[2]);
  return {
    routines, byAddress: new Map(routines.map(r => [r.address, r])), constants,
    objects: ['NOTHING', ...[...data.matchAll(/\.OBJECT\s+([^,\s]+)/g)].map(m => m[1]!)],
    globals: [...data.matchAll(/\.GVAR\s+([^=\s]+)=/g)].map(m => m[1]!),
  };
}
