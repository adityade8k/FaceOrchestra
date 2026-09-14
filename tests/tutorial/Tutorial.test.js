import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSITION as C, PITCHES, TOLERANCES as T, DESCENDING_BEND, performanceEvents, tuningForMidi } from '../../src/tutorial/composition.js';
import { LESSON_STEPS } from '../../src/tutorial/lessonSteps.js';
import { TutorialSession } from '../../src/tutorial/TutorialSession.js';
import { validateBend, validateSequence, validateTake } from '../../src/tutorial/validation.js';
import { CompositionConductor } from '../../src/tutorial/CompositionConductor.js';
import { canPersistMode, savePersistedSceneForRuntime, restorePersistedSceneForRuntime } from '../../src/app/runtime/RuntimePersistencePolicy.js';
import { frequencyFromControls, createHonkTuning } from '../../src/instruments/honk/HonkTuning.js';
const note=(extra={})=>({id:'n1',kind:'note',origin:'learner',role:'melody-C4',midis:[60],startMs:10,endMs:610,articulated:true,released:true,voiced:true,maxAbsBend:0,durationBeats:0.8,...extra});
const step={id:'learn',type:'note',role:'melody-C4',midis:[60],minimumMs:450};
const bendSamples=[{offsetMs:0,semitones:0},{offsetMs:200,semitones:0},{offsetMs:700,semitones:-1.4},{offsetMs:1450,semitones:-2.98},{offsetMs:1650,semitones:-3}];

test('score has four 16-beat phrases and the specified 96-beat order',()=>{
  assert.deepEqual(C.order,['A','B','A','C','B','D']);
  for(const events of Object.values(C.phrases)) assert.equal(events.reduce((n,e)=>n+e.beats,0),16);
  assert.equal(performanceEvents().reduce((n,e)=>n+e.beats,0),96);
  assert.equal(96*C.beatMs,72000);assert.equal(C.gapBeats,0);
  assert.equal(performanceEvents().filter(e=>e.bend).length,6);
  assert.ok(performanceEvents().every(e=>!e.pitch||!['D','A','B'].includes(e.pitch.replace(/[0-9]/g,''))));
  assert.deepEqual(Object.keys(PITCHES),['C4','Eb4','E4','F4','G4','Bb4','C5']);
});
test('presets map every requested MIDI pitch through the existing pitch controls',()=>{
  for(const midi of [...C.backing.flatMap(g=>g.midis),...Object.values(PITCHES).map(p=>p.midi)]) {
    const tuning=createHonkTuning(tuningForMidi(midi));
    const actual=69+12*Math.log2(frequencyFromControls(tuning)/440);
    assert.ok(Math.abs(actual-midi)<0.01,`${midi} -> ${actual}`);
  }
});
test('every step specifies entry, permitted origins, retry and cleanup',()=>{
  for(const s of LESSON_STEPS)for(const key of ['entry','evidenceSources','retry','cleanup'])assert.ok(s[key],`${s.id}.${key}`);
});
test('instructions and elapsed time never complete a musical step',()=>{
  const s=new TutorialSession({steps:[step]});s.update({},999999);assert.equal(s.index,0);
});
test('wrong targets, short holds, unvoiced notes and missing release do not advance',()=>{
  for(const invalid of [{role:'melody-E4'},{endMs:100},{voiced:false},{released:false},{allReleased:false},{articulated:false},{midis:[60,64]},{maxAbsBend:1}]) {
    const s=new TutorialSession({steps:[step]});s.startAttempt(0);s.accept(note(invalid));s.update({},1000);assert.equal(s.index,0,JSON.stringify(invalid));assert.equal(s.result.ok,false);
  }
});
test('one held gesture cannot complete a later practice attempt after navigation',()=>{
  const s=new TutorialSession({steps:[step,{...step,id:'again'}]});s.startAttempt(0);
  assert.equal(s.accept(note()),true);s.update({},700);assert.equal(s.index,0);assert.equal(s.result.ok,true);
  s.navigate(1,710);s.startAttempt(710);
  assert.equal(s.accept(note()),false);s.update({},1000);assert.equal(s.phase,'practicing');
  assert.equal(s.accept(note({id:'n2',startMs:720,endMs:1320})),true);s.update({},1400);
  assert.equal(s.result.ok,true);assert.equal(s.complete,false);s.navigate(2,1500);assert.equal(s.complete,true);
});
test('learner, simulation, demonstration, playback and metronome evidence stay isolated',()=>{
  for(const origin of ['simulation','demonstration','playback','metronome']) {
    const s=new TutorialSession({steps:[step]});s.startAttempt(0);assert.equal(s.accept(note({origin})),false);s.update({},1000);assert.equal(s.index,0);
  }
  const s=new TutorialSession({mode:'simulation',steps:[step]});assert.equal(s.accept(note()),false);
  assert.equal(s.accept(note({origin:'simulation'})),true);s.update({},1000);assert.equal(s.complete,true);
});
test('events beginning before step entry cannot receive credit after release',()=>{
  const s=new TutorialSession({now:500,steps:[step]});assert.equal(s.accept(note()),false);
});
test('changed setup never sends practice backward or erases earlier completion',()=>{
  const spawn={id:'spawn',type:'spawn',role:'melody-C4',kind:'honk'};
  const s=new TutorialSession({steps:[spawn,step]});s.startAttempt(0);
  s.update({roles:{'melody-C4':{kind:'honk',ready:true,placed:true,correctPitch:true,contactExact:true,stableMs:500}}},10);
  assert.equal(s.result.ok,true);s.navigate(1,20);
  s.update({roles:{'melody-C4':{ready:false}}},30);
  assert.equal(s.index,1);assert.ok(s.checkpoints.has('spawn'));assert.equal(s.phase,'ready');
});
test('bend validates a sustained downward glide and settled processed endpoint',()=>{
  const b=note({midis:[63],role:'melody-Eb4',endMs:1810,bendSamples});
  assert.equal(validateBend(b).ok,true);
  assert.equal(validateBend({...b,released:false}).ok,false);
  assert.equal(validateBend({...b,bendSamples:bendSamples.map(s=>({...s,semitones:-s.semitones}))}).ok,false);
  assert.equal(validateBend({...b,bendSamples:[...bendSamples.slice(0,3),{offsetMs:1750,semitones:-3}]}).ok,false);
  assert.equal(validateBend({...b,bendSamples:bendSamples.map(s=>({...s,semitones:s.semitones<-2?-2.4:s.semitones}))}).ok,false);
});
const lanes={percussion:'track-7',metronome:'track-2',percussionLooper:'looper-self-percussion'};
const drumScore=C.percussion.map(p=>({...p,lane:lanes[p.role]}));
test('percussion matching rejects missing, extra, mistimed and wrong-route hits one-to-one',()=>{
  const actual=drumScore.map((p,i)=>({id:`d${i}`,kind:'strike',...p,percussionType:p.type,withdrawn:true}));
  assert.equal(validateSequence(drumScore,actual,{kind:'strike'}).ok,true);
  for(const wrong of [actual.slice(1),[...actual,actual[0]],actual.map((e,i)=>i?e:{...e,beat:0.6}),actual.map((e,i)=>i?e:{...e,lane:'track-0'}),actual.map((e,i)=>i?e:{...e,role:'looper'}),actual.map((e,i)=>i?e:{...e,withdrawn:false})])
    assert.equal(validateSequence(drumScore,wrong,{kind:'strike'}).ok,false);
});
function takeFixture(role) {
  const routes={chords:Object.fromEntries(C.backing.map((g,i)=>[g.role,{trackId:`track-${[6,3,7,2][i]}`}])) ,percussion:Object.fromEntries(Object.entries(lanes).map(([role,trackId])=>[role,{trackId}]))};
  const chords=role==='chordLooper';
  const evidence=chords?C.backing.map((g,i)=>note({id:`c${i}`,role:g.role,midis:g.midis,lane:routes.chords[g.role].trackId,beat:g.beat,startMs:g.beat*750,endMs:(g.beat+g.beats)*750,durationBeats:g.beats})):
    drumScore.map((p,i)=>({id:`d${i}`,kind:'strike',...p,percussionType:p.type,withdrawn:true,recordedCount:1}));
  const tracks=chords?C.backing.map(g=>({trackId:routes.chords[g.role].trackId,events:[{type:'squeezeStart',timeMs:g.beat*750},{type:'squeezeEnd',timeMs:(g.beat+g.beats)*750}]})):
    Object.entries(lanes).map(([role,trackId])=>({trackId,events:drumScore.filter(p=>p.role===role).map(p=>({type:'drumHit',timeMs:p.beat*750,value:p.type}))}));
  return {routes,evidence,timeline:{timingMode:'metronome',durationMs:12000,beatIntervalMs:750,gapBeats:0,tracks}};
}
test('independent take validation rejects wrong ownership and incomplete real evidence',()=>{
  for(const role of ['chordLooper','percussionLooper']) {
    const {timeline,evidence,routes}=takeFixture(role);
    assert.equal(validateTake(timeline,evidence,role,routes).ok,true);
    assert.equal(validateTake({...timeline,durationMs:11775},evidence,role,routes).ok,true);
    assert.equal(validateTake({...timeline,gapBeats:1},evidence,role,routes).ok,false);
    assert.equal(validateTake(timeline,evidence.slice(1),role,routes).ok,false);
    const extra=role==='chordLooper'?{type:'drumHit',timeMs:0,value:'hihat'}:{type:'squeezeStart',timeMs:0,value:1};
    timeline.tracks[0].events.push(extra);
    assert.equal(validateTake(timeline,evidence,role,routes).ok,false);
  }
});
test('failed percussion retries only percussion while preserving chord evidence',()=>{
  const steps=[{id:'record-chords',type:'record',looperRole:'chordLooper'},
    {id:'record-percussion',type:'record',looperRole:'percussionLooper'},
    {id:'final',type:'finalize',looperRole:'percussionLooper'}];
  const s=new TutorialSession({mode:'simulation',origin:'learner',steps});s.index=2;s.takeEvidence.chordLooper=[note()];
  s.validatedTakes.chordLooper='retained';
  s.update({loopers:{percussionLooper:{timeline:{},recording:false}}},10);
  assert.equal(s.failed,true);s.retry(20);assert.equal(s.step.id,'record-percussion');
  assert.equal(s.takeEvidence.chordLooper.length,1);assert.equal(s.validatedTakes.chordLooper,'retained');
});
test('mode policy blocks restore/save for practice, simulation and transitions',async()=>{
  for(const sessionMode of ['practice','simulation','transition']) {
    let writes=0;const runtime={sessionMode,scenePersistence:{save(){writes++;},restore(){writes++;}}};
    assert.equal(canPersistMode(sessionMode),false);assert.equal(savePersistedSceneForRuntime(runtime),false);
    await restorePersistedSceneForRuntime(runtime);assert.equal(writes,0);
  }
  assert.equal(canPersistMode('play'),true);assert.equal(canPersistMode('launch'),true);
});
function conductorFixture(type='phrase') {
  let released=0,cleared=0,stopped=0;
  const session=new TutorialSession({mode:'simulation',steps:[{id:'record',type:'record',timed:true},{id:'phrase',type,phrase:'A',timed:true}]});session.index=1;
  const looper={transport:{recording:type==='record'},clearRecording(){cleared++;},stop(){stopped++;}};
  const adapter={releaseVirtuals(){released++;},get(){return looper;},command(){stopped++;looper.transport.recording=false;}};
  const conductor=new CompositionConductor(adapter,session);
  return {conductor,session,stats:()=>({released,cleared,stopped})};
}
test('pause is idempotent, finalizes interrupted takes and resumes from a fresh attempt',()=>{
  const {conductor,session,stats}=conductorFixture('record');conductor.pause();conductor.pause();
  assert.deepEqual(stats(),{released:1,cleared:0,stopped:1});conductor.resume(100);assert.equal(session.step.id,'record');assert.equal(session.anchorMs,null);
  conductor.stop();conductor.stop();assert.equal(stats().released,2);
});
test('tab delays pause instead of dispatching overdue musical gestures',()=>{
  const {conductor,stats}=conductorFixture();conductor.lastNow=0;conductor.update(T.maxFrameGapMs+1);
  assert.equal(conductor.paused,true);assert.equal(stats().released,1);
});

test('simulation route uses shared predicates without awarding omitted beginner drills',async()=>{
  const {SIMULATION_STEPS}=await import('../../src/tutorial/lessonSteps.js');
  const sim=new TutorialSession({mode:'simulation'}),practice=new TutorialSession();
  assert.equal(sim.steps,SIMULATION_STEPS);assert.equal(practice.steps,LESSON_STEPS);
  assert.ok(sim.steps.some(s=>s.id==='record-chords'));assert.ok(sim.steps.some(s=>s.id==='performance'));
  assert.ok(!sim.steps.some(s=>s.id==='learn-C4'));assert.ok(practice.steps.some(s=>s.id==='learn-C4'));
  for(const s of sim.steps)assert.equal(s.type,LESSON_STEPS.find(p=>p.id===s.id).type);
  assert.equal(practice.checkpoints.size,0);
});
test('continuous performance identifies a failed phrase without changing any clock',()=>{
  const s=new TutorialSession({mode:'simulation',steps:[{id:'performance',type:'performance',timed:true,beats:96}]});
  s.startCountIn(0);s.update({liveGestures:0},16*C.beatMs);
  assert.equal(s.failed,true);assert.match(s.feedback,/Phrase A.*Missing/);assert.equal(s.index,0);
});

test('timed evidence follows the actual clock interval inside the BPM tolerance',()=>{
  const s=new TutorialSession({steps:[{id:'phrase',type:'chords',timed:true,beats:16}]});
  s.startAttempt(0);const interval=60000/79;s.startCountIn(1000,interval);
  s.accept(note({startMs:1000+4*interval,endMs:1000+7.7*interval,role:'group-2',midis:[48,53,55]}));
  assert.ok(Math.abs(s.evidence[0].beat-4)<1e-9);
  assert.ok(Math.abs(s.evidence[0].durationBeats-3.7)<1e-9);
});

test('XR entry and late initialization cannot spawn free-play defaults in Tutorial',async()=>{
  const {SessionRuntimeMethods}=await import('../../src/app/runtime/SessionRuntime.js');
  let spawned=0,placedPanel=0;
  const runtime={sessionMode:'launch',xrSessionActive:false,instructionPanelClosed:true,
    tutorial:{onXRStart(){placedPanel++;}},spawnDefaultInstrumentPreview(){spawned++;}};
  SessionRuntimeMethods.onXRSessionStart.call(runtime);
  SessionRuntimeMethods.onRuntimeInitialized.call(runtime);
  assert.equal(placedPanel,1);assert.equal(spawned,0);
  runtime.sessionMode='practice';SessionRuntimeMethods.onRuntimeInitialized.call(runtime);assert.equal(spawned,0);
});

test('repairing one clock cable retains unrelated checkpoints and returns to the interrupted lesson',()=>{
  const clockA={id:'clock-a',type:'clock-wire',looperRole:'chordLooper'},clockB={id:'clock-b',type:'clock-wire',looperRole:'percussionLooper'};
  const s=new TutorialSession({mode:'simulation',steps:[clockA,clockB,step]});
  const snapshot={loopers:{chordLooper:{clockWired:true},percussionLooper:{clockWired:true}}};
  s.update(snapshot,10);s.update(snapshot,20);s.validatedTakes.chordLooper='original chord';s.takeEvidence.chordLooper=[note()];
  snapshot.loopers.percussionLooper.clockWired=false;s.update(snapshot,30);
  assert.equal(s.index,1);assert.ok(s.checkpoints.has('clock-a'));assert.equal(s.checkpoints.has('clock-b'),false);
  snapshot.loopers.percussionLooper.clockWired=true;s.update(snapshot,40);
  assert.equal(s.index,2);assert.equal(s.validatedTakes.chordLooper,'original chord');assert.equal(s.takeEvidence.chordLooper.length,1);
});
test('Start All teaching requires shared phase and launch, not merely two playing transports',()=>{
  const s=new TutorialSession({mode:'simulation',origin:'learner',steps:[{id:'start-all',type:'start-all',action:'start-all'}]});
  s.accept({id:'command',kind:'command',origin:'learner',action:'start-all',startMs:1});
  const snapshot={liveGestures:0,anyStickContact:false,audioRunning:true,startAllRequest:{ok:true,targetBeat:10},aligned:false,
    loopers:{chordLooper:{playing:true,playbackObserved:true,startBeat:10},percussionLooper:{playing:true,playbackObserved:true,startBeat:11}}};
  s.update(snapshot,100);s.update(snapshot,20000);assert.equal(s.complete,false);
  snapshot.aligned=true;snapshot.loopers.percussionLooper.startBeat=10;s.update(snapshot,21000);s.update(snapshot,34000);assert.equal(s.complete,true);
});
