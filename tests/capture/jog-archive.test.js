import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough,Readable } from 'node:stream';
import { TakeStore } from '../../scripts/capture/storage.mjs';
import { exportTake,importTake } from '../../scripts/capture/archive.mjs';

test('restarted performance metadata and genuine integrity survive receiver reopen and portable archive round-trip',async()=>{
  const root=await mkdtemp(join(tmpdir(),'jog-archive-'));let store=new TakeStore(root);
  try {
    for(const [i,gaps] of [[],[{stream:'audio',start:.4,end:.5,reason:'worklet-pool-exhausted'}]].entries()) {
      const metadata={id:`take-${i}`,version:1,created:'2026-09-24T12:00:00Z',audio:{sampleRate:48000,channels:2},performance:{mode:'raag-jog-mixed-reality',compositionId:'virag-2-jog-study',compositionVersion:3,groupId:'group-1',attempt:i+1,label:`Raag Jog — Take 0${i+1}`}};
      await store.create(metadata);
      const performance={...metadata.performance,completionAction:'restarted',sync:{sceneTime:.1},performanceStart:3.52};
      await store.append(metadata.id,{stream:'events',seq:0,t:.1,data:{kind:'performance-metadata',performance}});
      await store.close();store=new TakeStore(root);
      // Metadata from events must survive a crash/reopen before finalization.
      const complete=await store.finalize(metadata.id,{expected:{samples:-1,events:0,audio:-1},reason:'stop',gaps});
      assert.equal(complete.complete,i===0);assert.equal(complete.performance.completionAction,'restarted');
      const output=new PassThrough(),chunks=[];output.on('data',c=>chunks.push(c));await exportTake(join(root,metadata.id),output);
      const id=await importTake(root,Readable.from(Buffer.concat(chunks)));const imported=JSON.parse(await readFile(join(root,id,'take.json')));
      assert.notEqual(id,metadata.id);assert.equal(imported.originalId,metadata.id);assert.deepEqual(imported.performance,performance);assert.equal(imported.complete,i===0);assert.deepEqual(imported.gaps,gaps);
    }
    await store.close();store=new TakeStore(root);assert.equal((await store.list()).length,4);
  }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
