/** ZIL source newlines fold; | supplies an explicit output newline. Reader escapes are already decoded. */
export function decodeZilText(value:string):string {
  return value.replace(/\r\n|\r/g,'\n').replace(/\|\n/g,'|').replaceAll('\n',' ').replaceAll('|','\n');
}
