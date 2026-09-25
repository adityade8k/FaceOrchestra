import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureRecorder } from '../../src/capture/CaptureRecorder.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture() {
  const originals={document:globalThis.document,Worker:globalThis.Worker,location:globalThis.location};
  globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
  globalThis.location={protocol:'http:',host:'localhost'};
  const workers=[];
  globalThis.Worker=class {constructor(){this.messages=[];this.terminated=false;workers.push(this);}postMessage(m){this.messages.push(m);}terminate(){this.terminated=true;}emit(data){this.onmessage({data});}};
  const recorder=new CaptureRecorder({audioSystem:{},renderer:{xr:{getSession:()=>null}},sceneSerializer:{serialize:()=>({instruments:[]})}});
  const audio=deferred();recorder.audio={context:{state:'running',sampleRate:48000},prepare:async()=>({sampleRate:48000,channels:2}),start(){this.ready=audio.promise;},stop:async()=>{recorder.lastAudioEnd=recorder.elapsed+1;}};
  recorder.readiness=async()=>({paired:true});
  return {recorder,workers,audio,restore(){Object.assign(globalThis,originals);}};
}

test('startReady requires receiver acknowledgment and actual PCM readiness; finalization gates replacement',async()=>{
  const f=fixture();try {
    const started=f.recorder.startReady({synthetic:true});await tick();
    const first=f.workers[0];assert.equal(f.recorder.state,'preparing');
    first.emit({type:'ready'});await tick();assert.equal(f.recorder.state,'preparing');
    f.audio.resolve();await started;assert.equal(f.recorder.state,'recording');
    const stopping=f.recorder.stopAndFinalize({tailMs:0});await tick();
    assert.equal(f.recorder.state,'stopping');assert.equal(first.terminated,false);
    assert.equal(first.messages.at(-1).type,'finish');await f.recorder.start({synthetic:true});assert.equal(f.workers.length,1);
    first.emit({type:'finalized',metadata:{complete:true,id:f.recorder.metadata.id}});await stopping;
    assert.equal(f.recorder.state,'complete');const next=f.recorder.startReady({synthetic:true});await tick();
    assert.equal(first.terminated,true);f.workers[1].emit({type:'ready'});await next;first.emit({type:'finalized',metadata:{complete:true}});assert.equal(f.recorder.state,'recording');assert.notEqual(f.workers[1].messages[0].metadata.id,first.messages[0].metadata.id);
    await f.recorder.stop('stop',{tailMs:0});f.workers[1].emit({type:'finalized',metadata:{complete:true}});
  }finally{f.restore();}
});

test('finalization timeout keeps worker/spool and old identity recoverable',async()=>{
  const f=fixture();try {
    const started=f.recorder.startReady({synthetic:true});await tick();f.workers[0].emit({type:'ready'});f.audio.resolve();await started;
    await assert.rejects(f.recorder.stopAndFinalize({tailMs:0,timeoutMs:5}),/pending/);
    assert.equal(f.workers[0].terminated,false);assert.equal(f.recorder.pendingFinalization,true);assert.equal(f.recorder.state,'stopping');
    f.workers[0].emit({type:'finalized',metadata:{complete:true}});assert.equal((await f.recorder.waitForFinalization()).complete,true);
  }finally{f.restore();}
});

test('cancellation while receiver is preparing cannot destroy its worker or report recording',async()=>{
  const f=fixture();try {
    const starting=f.recorder.startReady({synthetic:true});await tick();f.recorder.stop('session-end',{tailMs:0});
    f.workers[0].emit({type:'ready'});await assert.rejects(starting);
    assert.equal(f.recorder.state,'stopping');assert.equal(f.workers[0].terminated,false);
    assert.equal(f.workers[0].messages.at(-1).type,'finish');
    f.workers[0].emit({type:'finalized',metadata:{complete:false}});
  }finally{f.restore();}
});

test('session loss expedites an existing release tail and sends one finalization request',async()=>{
  const f=fixture();try {
    const started=f.recorder.startReady({synthetic:true});await tick();f.workers[0].emit({type:'ready'});f.audio.resolve();await started;
    const stopping=f.recorder.stop('stop',{tailMs:10000});f.recorder.stop('session-end',{tailMs:0});await stopping;
    const finishes=f.workers[0].messages.filter(m=>m.type==='finish');assert.equal(finishes.length,1);assert.equal(finishes[0].reason,'session-end');
    f.workers[0].emit({type:'finalized',metadata:{complete:false}});
  }finally{f.restore();}
});
