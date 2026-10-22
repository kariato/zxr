import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildVocabulary, auditVocabulary } from './vocabulary.ts';
try {
  const mode=process.argv[2];if(!['check','record'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/vocabulary-cli.ts record|check');
  const vocabulary=buildVocabulary(),audit=auditVocabulary(vocabulary);
  const artifacts=[['games/zork2/vocabulary.zxr.json',vocabulary],['reference/vocabulary-audit.json',audit]] as const;
  if(mode==='record')mkdirSync('games/zork2',{recursive:true});
  for(const [path,data] of artifacts){const text=JSON.stringify(data,null,2)+'\n';if(mode==='record')writeFileSync(path,text);else if(readFileSync(path,'utf8')!==text)throw new Error(`${path} differs; review the source and vocabulary audit before running vocabulary:record.`);}
  console.log(`Vocabulary: ${vocabulary.counts.syntax} syntax rows in exact order across ${vocabulary.counts.verbs} lexical tables; ${vocabulary.counts.words} dictionary entries, ${vocabulary.counts.actions} action/preaction pairs and ${vocabulary.counts.prepositions} prepositions match assembly/binary. ${vocabulary.counts.synonyms} synonym declarations, ${vocabulary.counts.buzz} buzz words and ${vocabulary.counts.directions} directions checked.`);
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
