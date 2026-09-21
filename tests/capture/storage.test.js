import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TakeStore } from '../../scripts/capture/storage.mjs';
import { renderAudio } from '../../scripts/capture/export.mjs';
import { validateEnvelope } from '../../src/capture/format.js';
const metadata={id:'test-take',version:1,audio:{sampleRate:48000,channels:2}};
test('resource fragments cannot request an unbounded reassembly array',()=>{
  assert.throws(()=>validateEnvelope({stream:'events',seq:0,t:0,data:{kind:'resource-part',parts:1e9,part:0,id:'asset',text:'x'}}),/bounded resource/);
});
test('durable independent streams deduplicate, reject gaps and resume after restart',async()=>{
  const root=await mkdtemp(join(tmpdir(),'honk-store-'));let store=new TakeStore(root);
  try {
    await store.create(metadata);const packet={stream:'samples',seq:0,t:0,data:{full:true,nodes:{}}};await store.append(metadata.id,packet);await store.append(metadata.id,packet);
    await assert.rejects(()=>store.append(metadata.id,{...packet,seq:2}),/Sequence gap/);
    await store.append(metadata.id,{stream:'events',seq:0,t:.1,data:{kind:'sync'}});
    await store.close();await appendFile(join(root,metadata.id,'samples.ndjson'),'{"partial":');
    store=new TakeStore(root);const take=await store.load(metadata.id);assert.equal(take.last.samples,0);assert.equal(take.last.events,0);
    await store.append(metadata.id,{...packet,seq:1,t:.2});
    const complete=await store.finalize(metadata.id,{expected:{samples:1,events:0,audio:-1},reason:'stop'});assert.equal(complete.complete,true);
    const lines=(await readFile(join(root,metadata.id,'samples.ndjson'),'utf8')).trim().split('\n');assert.equal(lines.length,2);
  } finally{await store.close();await rm(root,{recursive:true,force:true});}
});
test('PCM gaps retain silence and final audio uses offset/drift without compressing time',async()=>{
  const root=await mkdtemp(join(tmpdir(),'honk-audio-')),store=new TakeStore(root);
  try {
    const take=await store.create(metadata),pcm=Buffer.alloc(400);for(let i=0;i<200;i++)pcm.writeInt16LE(12000,i*2);
    await store.append(metadata.id,{stream:'audio',seq:0,t:.5,data:{pcm:pcm.toString('base64'),sampleIndex:0,contextFrame:48000,frames:100,sceneTime:.5}});
    const result=await store.finalize(metadata.id,{expected:{samples:0,events:0,audio:0},reason:'stop'});assert.equal(result.complete,false);assert.deepEqual(result.missingStreams,['samples','events']);
    const wav=await readFile(join(take.dir,'audio.wav'));assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readInt16LE(44+48000*4*.25),0);assert.equal(wav.readInt16LE(44+48000*4*.5),12000);
    const job={dir:root,frames:30,project:{output:{fps:30},trim:{start:0},mapping:{a:1,b:.5}}};await renderAudio(take,job);const aligned=await readFile(join(root,'audio.wav'));assert.equal(aligned.readInt16LE(44),12000);assert.equal(aligned.length,44+48000*4);
  }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
