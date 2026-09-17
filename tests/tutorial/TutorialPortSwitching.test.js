import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSON_STEPS,SIMULATION_STEPS} from '../../src/tutorial/lessonSteps.js';
import {COMPOSITION as C,TUTORIAL_LOOPERS} from '../../src/tutorial/composition.js';
import {STEPS as KUCH_STEPS} from '../../src/tutorial/kuch/score.js';
import {TutorialSession} from '../../src/tutorial/TutorialSession.js';
import {validateSetup,validateSwitchExercise,validateTake} from '../../src/tutorial/validation.js';
import {connectTutorialClock} from '../../src/tutorial/TutorialRoutes.js';
import {MetronomeConnectionManager} from '../../src/instruments/metronome/MetronomeConnectionManager.js';
import {createHarness,setHonk} from '../helpers/looperCaptureHarness.js';
const switchStep=LESSON_STEPS.find(s=>s.type==='switch');

test('all tutorial routes teach separate recordings, shared alternatives, independent accompaniment, and switching back',()=>{
  for(const steps of [LESSON_STEPS,SIMULATION_STEPS]){
    assert.ok(steps.some(s=>s.type==='switch'));
    assert.ok(steps.some(s=>s.type==='record'&&s.looperRole==='alternativeLooper'));
    assert.ok(steps.some(s=>s.type==='clock-wire'&&s.looperRole==='alternativeLooper'));
    assert.ok(steps.some(s=>s.type==='record'&&s.looperRole==='percussionLooper'));
  }
  assert.ok(KUCH_STEPS.some(s=>s.kind==='switch'));
  assert.equal(TUTORIAL_LOOPERS.length,3);
  assert.notDeepEqual(C.alternateBacking,C.backing);
});
test('tutorial wiring shares the alternative port and gives percussion a different port, without duplicate cables',()=>{
  const metro={id:'m',kind:'metronome',hasConnectionPort:()=>true,connectionPorts:new Map(['port-0','port-1','port-2'].map(id=>[id,{}]))};
  const byRole=new Map([['metronome',metro],...TUTORIAL_LOOPERS.map(({role})=>[role,{id:role,kind:'looper',tracks:[{trackId:'track-0',nodeTarget:{}}]}])]);
  const registry={get:id=>[...byRole.values()].find(h=>h.id===id)};
  const manager=new MetronomeConnectionManager({registry}),adapter={get:role=>byRole.get(role),r:{metronomeConnectionManager:manager}};
  for(const {role} of TUTORIAL_LOOPERS)connectTutorialClock(adapter,role);
  const a=manager.getConnectionForTarget('looper','chordLooper'),b=manager.getConnectionForTarget('looper','alternativeLooper'),c=manager.getConnectionForTarget('looper','percussionLooper');
  assert.equal(a.portId,b.portId);assert.notEqual(a.portId,c.portId);
  assert.strictEqual(connectTutorialClock(adapter,'alternativeLooper'),b);assert.equal(manager.serialize().length,3);
  assert.equal(validateSetup({type:'clock-wire',looperRole:'percussionLooper'},{loopers:{chordLooper:{clockWired:true,portId:'port-0',metronomeId:'m'},percussionLooper:{clockWired:true,portId:'port-0',metronomeId:'m'}}}).ok,false);
});
function snapshot(origin='learner'){
  const request={id:1,fromId:'a',toId:'b',fromRevision:2,toRevision:3,origin,requestedAtMs:100,requestedPhase:.4,beat:16,completedAtMs:8000};
  const a={id:'a',takeRevision:2,hasRecording:true,clockWired:true,portId:'port-0',metronomeId:'m',playing:true,switchHistory:[]};
  const b={...a,id:'b',takeRevision:3,playing:false,switchHistory:[],queuedRequest:request};
  return {audioRunning:true,loopers:{chordLooper:a,alternativeLooper:b},request};
}
test('practice requires observed queue and completed switches in both directions; demonstrations earn no learner evidence',()=>{
  for(const origin of ['learner','simulation','demonstration']){
    const s=new TutorialSession({steps:[switchStep]});s.startAttempt(0);const state=snapshot(origin);
    s.update(state,200);assert.equal(s.phase,'practicing');
    const a=state.loopers.chordLooper,b=state.loopers.alternativeLooper;
    b.switchHistory.push(state.request);b.queuedRequest=null;b.playing=true;a.playing=false;
    s.update(state,8100);assert.equal(s.phase,'practicing');
    const back={...state.request,id:2,fromId:'b',toId:'a',fromRevision:3,toRevision:2,requestedAtMs:10000,beat:32,completedAtMs:16000};
    a.queuedRequest=back;s.update(state,10100);a.switchHistory.push(back);a.queuedRequest=null;a.playing=true;b.playing=false;
    s.update(state,16100);
    assert.equal(s.checkpoints.has(switchStep.id),origin==='learner');
    if(origin==='learner'){s.startAttempt(17000);s.update(state,17100);assert.equal(s.phase,'practicing');}
  }
});
test('unobserved queues, stale take revisions, and early selections cannot satisfy a switch exercise',()=>{
  const s={origin:'learner',enteredAt:0,switchQueued:new Set()},state=snapshot();
  const a=state.loopers.chordLooper,b=state.loopers.alternativeLooper;
  b.queuedRequest=null;b.switchHistory=[state.request];
  a.switchHistory=[{...state.request,id:2,fromId:'b',toId:'a',fromRevision:3,toRevision:2,requestedAtMs:10000}];
  assert.equal(validateSwitchExercise(state,s).ok,false);
  s.switchQueued=new Set([1,2]);assert.equal(validateSwitchExercise(state,s).ok,true);
  a.takeRevision++;assert.equal(validateSwitchExercise(state,s).ok,false);
  a.takeRevision--;state.request.requestedPhase=0;assert.equal(validateSwitchExercise(state,s).ok,false);
});
test('re-recording replaces one timeline and retains simultaneous instrument tracks within the new recording',()=>{
  const h=createHarness({connected:true,trackCount:2});h.controller.setControlValue(h.looper,'recordLength',-1);
  h.controller.startRecording(h.looper,0);setHonk(h,0,0,1);setHonk(h,0,200,0);h.controller.updateRecordings([h.looper],1000);
  const previous=h.timeline;assert.ok(previous.hasRecording());
  h.controller.startRecording(h.looper,1100);setHonk(h,0,1500,1);setHonk(h,1,1500,1);setHonk(h,0,1800,0);setHonk(h,1,1800,0);h.controller.updateRecordings([h.looper],2500);
  assert.notStrictEqual(h.timeline,previous);assert.equal(h.timeline.getActiveTracks().length,2);
  const saved=h.controller.serializeState(h.looper);assert.ok(saved.timeline);assert.equal(saved.timelines,undefined);assert.equal(saved.clips,undefined);
  assert.equal(saved.timeline.tracks.length,2);
});
