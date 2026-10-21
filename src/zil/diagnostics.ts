import type { Span } from './ast.ts';
export class ZilError extends Error {
  readonly code:string;
  readonly span:Span;
  constructor(code:string,message:string,span:Span) { super(message); this.name='ZilError'; this.code=code; this.span=span; }
}
export function formatDiagnostic(error:ZilError,source?:string):string {
  const {file,start}=error.span;
  let result=`${file}:${start.line}:${start.column}: ${error.code}: ${error.message}`;
  const line=source?.split(/\r\n|\r|\n/)[start.line-1];
  if (line !== undefined) {
    const before=line.slice(0,start.column-1), expanded=before.replaceAll('\t','    ');
    result+=`\n${line.replaceAll('\t','    ')}\n${' '.repeat(expanded.length)}^`;
  }
  return result;
}
