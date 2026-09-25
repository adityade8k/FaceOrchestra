import test from 'node:test';
import assert from 'node:assert/strict';
import { JogRecordingSession } from '../../src/performance/JogRecordingSession.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture() {
  const log=[],saved=[];let time=1000,paired=true,tracking=true,readyGate=null,saveGate=null;
  const recorder=new EventTarget();
  Object.assign(recorder,{state:'idle',connected:true,active:false,pendingFinalization:false,
    audio:{context:{currentTime:1,state:'running'},mapping:{sceneTime:0,contextTime:1},countIn(){log.push('count-in');},cancelCues(){log.push('cancel-cues');}},
    claim(owner){this.owner=owner;},release(){this.owner=null;},
    async readiness(){log.push('receiver-check');return {paired};},
    async startReady(options){log.push('capture-start');this.state='preparing';this.pendingFinalization=true;this.metadata={id:`take-${options.performance.attempt}`,performance:structuredClone(options.performance)};if(readyGate)await readyGate.promise;this.active=true;this.state='recording';log.push('audio-ready');return this.metadata;},
    markSync(owner){assert.equal(owner,this.owner);log.push('sync');return {contextTime:1.03,endContextTime:1.33,sceneTime:.03};},
    updatePerformance(patch,kind){Object.assign(this.metadata?.performance||{},patch);log.push('event:'+kind);},
    async stop(){this.state='stopping';},
    async stopAndFinalize(options){log.push('stop');this.state='stopping';this.active=false;Object.assign(this.metadata.performance,{completionAction:options.completionAction});await this.waitForFinalization();},
    async waitForFinalization(){if(saveGate)await saveGate.promise;saved.push(structuredClone(this.metadata));this.pendingFinalization=false;this.state='complete';this.saved={...this.metadata,complete:true};log.push('finalized');},
  });
  const ensemble={prepared:false,prepare(){this.prepared=true;log.push('prepared');},validate(){assert.ok(this.prepared);},cancel(){log.push('cancel-music');},schedule(anchor){log.push('backing-armed');this.anchor=anchor;},play(){log.push('play');},update(){}};
  const mode=new JogRecordingSession({recorder,ensemble,ensureAudio:async()=>log.push('ensure-audio'),trackingReady:()=>tracking,onExit:async()=>log.push('restore-scene'),now:()=>time,uuid:()=> 'session-1'});
  return {mode,recorder,ensemble,log,saved,setTime:t=>{time=t;},setPaired:v=>{paired=v;},setTracking:v=>{tracking=v;},blockReady:()=>readyGate=deferred(),blockSave:()=>saveGate=deferred()};
}

test('Start waits for capture/audio readiness, then emits exactly one sync and shared count-in anchor',async()=>{
  const f=fixture();await f.mode.action('prepare');const ready=f.blockReady();
  const starting=f.mode.action('start');await tick();await tick();
  assert.equal(f.mode.phase,'starting');assert.ok(!f.log.includes('sync'));assert.ok(!f.log.includes('backing-armed'));
  assert.equal(f.mode.guidance(),null);
  ready.resolve();await starting;
  assert.equal(f.mode.phase,'count-in');
  assert.deepEqual(f.log.filter(s=>['capture-start','audio-ready','sync','count-in','backing-armed'].includes(s)),['capture-start','audio-ready','sync','count-in','backing-armed']);
  assert.equal(f.ensemble.anchor.beatZero-f.ensemble.anchor.countAt,3000);
  assert.equal(f.recorder.metadata.performance.groupId,'session-1');
  // Advancing frames beyond the written melody must not stop recording.
  for(let now=1100;now<80000;now+=100){f.setTime(now);f.mode.update(now);}
  assert.equal(f.mode.phase,'performing');assert.ok(f.recorder.active);
  assert.match(f.mode.model().transport,/Recording · Melody complete/);
});

test('missing pairing, tracking and failed capture readiness never start music',async()=>{
  for(const failure of ['pair','tracking','audio']) {
    const f=fixture();await f.mode.action('prepare');
    if(failure==='pair')f.setPaired(false);
    if(failure==='tracking')f.setTracking(false);
    if(failure==='audio')f.recorder.startReady=async()=>{throw new Error('PCM failed');};
    await f.mode.action('start');assert.equal(f.mode.phase,'ready');assert.ok(!f.log.includes('sync'));assert.ok(!f.log.includes('backing-armed'));assert.ok(!f.recorder.active);
  }
});

for(const during of ['count-in','performing'])test(`restart during ${during} preserves old take and waits for finalization before creating the next`,async()=>{
  const f=fixture();await f.mode.action('prepare');await f.mode.action('start');
  if(during==='performing')for(let now=1100;now<4700;now+=100){f.setTime(now);f.mode.update(now);}
  assert.equal(f.mode.phase,during);const gate=f.blockSave();
  const firstId=f.recorder.metadata.id;
  const firstGuide=f.mode.guidance(f.mode.anchor.beatZero);
  assert.equal(firstGuide.anchorMs,f.ensemble.anchor.beatZero);
  const restart=f.mode.action('restart');await tick();
  const duplicate=f.mode.action('restart');f.mode.action('start');
  assert.equal(f.mode.phase,'saving');assert.equal(f.recorder.metadata.id,firstId);assert.equal(f.mode.attempt,1);
  assert.equal(f.mode.guidance(firstGuide.anchorMs),null);
  f.setTime(10000);
  gate.resolve();await Promise.all([restart,duplicate]);
  assert.equal(f.saved.length,1);assert.equal(f.saved[0].id,firstId);assert.equal(f.saved[0].performance.completionAction,'restarted');
  assert.equal(f.mode.attempt,2);assert.notEqual(f.recorder.metadata.id,firstId);
  assert.equal(f.log.filter(s=>s==='sync').length,2);
  assert.ok(f.log.lastIndexOf('capture-start')>f.log.indexOf('finalized'));
  const nextGuide=f.mode.guidance(f.mode.anchor.beatZero);
  assert.notEqual(nextGuide,firstGuide);assert.ok(nextGuide.anchorMs>firstGuide.anchorMs);
  assert.equal(nextGuide.beatAt(f.mode.anchor.beatZero),0);
  assert.match(f.mode.model(f.mode.anchor.beatZero).transport,/S = C4/);
});

test('Stop and Exit cancel pending cues and await saving before restoring the scene',async()=>{
  const f=fixture();await f.mode.action('prepare');await f.mode.action('start');const gate=f.blockSave();
  const exit=f.mode.action('exit');await tick();assert.equal(f.mode.phase,'saving');assert.ok(!f.log.includes('restore-scene'));
  assert.equal(f.mode.guidance(f.mode.anchor?.beatZero),null);
  gate.resolve();await exit;assert.equal(f.saved.length,1);assert.equal(f.saved[0].performance.completionAction,'stopped');assert.ok(f.log.indexOf('restore-scene')>f.log.indexOf('finalized'));assert.equal(f.recorder.owner,null);
  const ready=fixture();await ready.mode.action('prepare');await ready.mode.action('exit');assert.equal(ready.saved.length,0);assert.ok(!ready.log.includes('capture-start'));
});

test('melody cues wait through sync and invalidated anchors cannot guide a stopped or interrupted take',async()=>{
  const f=fixture();await f.mode.action('prepare');await f.mode.action('start');
  const {countAt,beatZero}=f.mode.anchor;
  assert.equal(f.mode.guidance(countAt-1),null);
  assert.equal(f.mode.guidance(countAt).anchorMs,beatZero);
  assert.match(f.mode.model(countAt).transport,/4 · Prepare/);
  const stopping=f.mode.action('stop');await tick();
  assert.equal(f.mode.guidance(beatZero),null);await stopping;
  await f.mode.action('start');
  const interrupted=f.mode.interrupt('tracking-lost');
  assert.equal(f.mode.guidance(f.mode.anchor?.beatZero),null);await interrupted;
});

test('origin reset during readiness invalidates stale async completion and never resumes a count-in',async()=>{
  const f=fixture();await f.mode.action('prepare');const gate=f.blockReady();
  const start=f.mode.action('start');await tick();f.mode.interrupt('reference-space-reset');gate.resolve();await start;
  assert.ok(!f.log.includes('sync'));assert.ok(!f.log.includes('backing-armed'));assert.equal(f.saved.length,1);assert.equal(f.saved[0].performance.completionAction,'interrupted');assert.equal(f.mode.phase,'ready');
});

test('connection loss cancels music; failed finalization keeps ownership and recovery never auto-restarts',async()=>{
  const f=fixture();await f.mode.action('prepare');await f.mode.action('start');const gate=f.blockSave();
  f.recorder.connected=false;f.recorder.dispatchEvent(new Event('change'));await tick();
  gate.reject(new Error('Receiver offline; saving pending'));await f.mode.transition;
  assert.equal(f.mode.phase,'save-pending');assert.equal(f.mode.attempt,1);assert.equal(f.recorder.owner,f.mode);assert.equal(f.recorder.pendingFinalization,true);
  await f.mode.action('start');assert.equal(f.mode.attempt,1);
  f.recorder.pendingFinalization=false;f.recorder.saved={complete:false};f.recorder.dispatchEvent(new Event('change'));
  assert.equal(f.mode.phase,'ready');assert.equal(f.mode.attempt,1);assert.match(f.mode.feedback,/interruptions/);
});

test('desktop/radial controls use the owner and cannot duplicate sync',async()=>{
  const f=fixture();await f.mode.action('prepare');await f.mode.captureCommand('capture-toggle');
  await f.mode.captureCommand('capture-sync');assert.equal(f.log.filter(s=>s==='sync').length,1);
  await f.mode.captureCommand('capture-toggle');assert.equal(f.saved.length,1);assert.equal(f.mode.phase,'ready');
});

test('reference reset while a retry is saving prevents automatic continuation into a new origin',async()=>{
  const f=fixture();await f.mode.action('prepare');await f.mode.action('start');const gate=f.blockSave();
  const restart=f.mode.action('restart');await tick();f.mode.interrupt('reference-space-reset');gate.resolve();await restart;
  assert.equal(f.mode.phase,'ready');assert.equal(f.mode.attempt,1);assert.equal(f.saved.length,1);assert.equal(f.log.filter(s=>s==='sync').length,1);
});
