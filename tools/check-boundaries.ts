import { parse } from '@babel/parser';
import type { Node } from '@babel/types';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const forbidden = new Set([
  'window', 'document', 'navigator', 'localStorage', 'indexedDB', 'fetch', 'XMLHttpRequest',
  'WebSocket', 'Date', 'performance', 'setTimeout', 'setInterval', 'requestAnimationFrame',
  'globalThis', 'process', 'require', 'eval', 'Function', 'crypto',
]);

export function checkSource(path: string, text: string, root: string): string[] {
  const file = parse(text, { sourceType: 'module', plugins: ['typescript'] });
  const sourcePath=relative(root,path).replaceAll('\\','/');
  const headless=['src/engine/','src/zil/'].some(prefix=>sourcePath.startsWith(prefix));
  const issues: string[] = [];
  const report = (node: Node, message: string) => {
    issues.push(`${relative(root, path)}:${node.loc?.start.line ?? 1}: ${message}`);
  };
  const checkImport = (node: Node, specifier: string) => {
    const target = resolve(dirname(path), specifier);
    const targetPath=relative(root,target).replaceAll('\\','/').replace(/\.(?:ts|js)$/,'');
    if(sourcePath.startsWith('src/')&&targetPath==='src/engine/testing')report(node,'Production source cannot import or re-export the test-only debug API');
    if(sourcePath.startsWith('src/')&&targetPath==='src/engine/diagnostics'&&
      !['interpreter','turn-loop','session','testing'].some(name=>sourcePath===`src/engine/${name}.ts`))report(node,'Diagnostic capabilities are internal to the engine and its test entry point');
    if(!headless)return;
    if (!specifier.startsWith('.') ||
        !['src/engine/', 'src/zil/'].some(prefix => relative(root, target).replaceAll('\\', '/').startsWith(prefix))) {
      report(node, `Headless code cannot import ${JSON.stringify(specifier)}`);
    }
    if (['.css', '.glb', '.json'].includes(extname(specifier))) report(node, 'Headless code cannot import assets');
  };
  const visit = (node: Node, parent?: Node) => {
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
      checkImport(node, node.source.value);
    }
    if (headless&&node.type === 'TSImportEqualsDeclaration') report(node, 'Import assignments are not allowed in headless code');
    if (node.type === 'TSImportType' && node.argument.type === 'StringLiteral') checkImport(node, node.argument.value);
    if (node.type === 'ImportExpression' || (node.type === 'CallExpression' && node.callee.type === 'Import')) {
      if(headless)report(node, 'Dynamic imports are not allowed in headless code');
      const argument=node.type==='ImportExpression'?node.source:node.arguments[0];
      if(argument?.type==='StringLiteral')checkImport(node,argument.value);
    }
    if (headless&&node.type === 'Identifier' && forbidden.has(node.name) &&
        !(parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) &&
        !(parent?.type === 'ObjectProperty' && parent.key === node && !parent.computed)) report(node, `Headless code cannot use ${node.name}`);
    if (headless&&node.type === 'MemberExpression' && node.object.type === 'Identifier' && node.object.name === 'Math' &&
        ((node.property.type === 'Identifier' && node.property.name === 'random') ||
         (node.property.type === 'StringLiteral' && node.property.value === 'random'))) {
      report(node, 'Headless code must use the owned seeded RNG, not Math.random');
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'comments', 'tokens'].includes(key)) continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === 'object' && 'type' in child) visit(child as Node, node);
      } else if (value && typeof value === 'object' && 'type' in value) visit(value as Node, node);
    }
  };
  visit(file);
  return issues;
}

async function scan(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? scan(resolve(directory, entry.name))
    : Promise.resolve(entry.name.endsWith('.ts') ? [resolve(directory, entry.name)] : [])));
  return nested.flat();
}

export async function checkBoundaries(root = process.cwd()): Promise<string[]> {
  const files = await scan(resolve(root,'src'));
  return (await Promise.all(files.map(async p => checkSource(p, await readFile(p, 'utf8'), root)))).flat();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const issues = await checkBoundaries();
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('Headless boundaries: passed');
}
