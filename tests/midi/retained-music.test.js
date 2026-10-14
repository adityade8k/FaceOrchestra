import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import expected from '../fixtures/retained-music.json' with {type:'json'};
import {compositionRegistry,libraryPage} from '../../src/compositions/CompositionRegistry.js';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
for(const entry of compositionRegistry.list())test(`${entry.id}: migration preserves exact musical source and saved progress identity`,async()=>{
 const {definition:d}=await compositionRegistry.load(entry.id),before=expected[entry.id];
 assert.equal(d.contentVersion,before.contentVersion);
 assert.equal(hash(d.score),before.score,'Pitches, attacks, rests, durations, curves and ordered targets');
 assert.equal(hash(d.arrangement.backing??[]),before.backing,'Accompaniment pitches, attacks, rests and expression');
 assert.equal(hash(d.arrangement.liveEvents??[]),before.liveEvents);
 assert.equal(hash(d.arrangement.recipes.filter(r=>r.kind==='honk')),before.honks,'Honk pitches, ranges and placement');
 assert.ok(d.compatibility.recordingHashes.includes(before.contentHash));
});
test('all supported selection pages exclude Easy and show the renamed Nazariya title',async()=>{
 for(const mode of ['tutorials','record-songs']) {
  const rows=Array.from({length:libraryPage(compositionRegistry,mode).pages},(_,i)=>libraryPage(compositionRegistry,mode,i).rows).flat();
  assert.ok(!rows.some(r=>r.id==='tu-kisi-rail-si-easy'));
  assert.equal(rows.find(r=>r.id==='nazariya-honk-bends').title,'Nazariya Ki Maari');
 }
 await assert.rejects(compositionRegistry.load('tu-kisi-rail-si-easy'),/Unknown/);
});
test('historical Nazariya hashes and normalized filenames resolve without duplicate JSON copies',async()=>{
 const fs=await import('node:fs/promises'),root=new URL('../../src/compositions/nazariya-honk-bends/',import.meta.url);
 const refs=JSON.parse(await fs.readFile(new URL('provenance/references.json',root)));
 const {definition:d}=await compositionRegistry.load('nazariya-honk-bends');
 let key=d.authoredSource.sourceCompositionHash,count=0;
 while(key){
  const historical=JSON.parse(await fs.readFile(new URL(refs[key],root)));
  const {contentHash,...content}=historical;assert.equal(hash(content),key);assert.equal(contentHash,key);
  const normalized=JSON.parse(await fs.readFile(new URL(refs[historical.normalizedSource.file]??historical.normalizedSource.file,root)));
  assert.equal(hash(normalized),historical.normalizedSource.sha256);
  if(historical.authoredSource)assert.ok(await fs.stat(new URL(historical.authoredSource.file,root)));
  key=historical.authoredSource?.sourceCompositionHash;count++;
 }
 assert.equal(count,3);
});
