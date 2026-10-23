import { buildWordCatalog } from '../../src/engine/word-picker.ts';
import type { Vocabulary } from '../../src/zil/vocabulary.ts';
import { mountWordPicker } from '../../src/presentation/word-picker.ts';
const vocabulary=await (await fetch(new URL('../../games/zork2/vocabulary.zxr.json',import.meta.url))).json() as Vocabulary;
const output=document.querySelector('output')!;
mountWordPicker(document.querySelector<HTMLElement>('#picker')!,buildWordCatalog(vocabulary),word=>{
  output.textContent=word.label;output.dataset.dictionaryIndex=String(word.dictionaryIndex);output.dataset.word=word.word;
});
