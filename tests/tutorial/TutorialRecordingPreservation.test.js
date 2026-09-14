import test from 'node:test';
import assert from 'node:assert/strict';
import {TutorialLessonFlow} from '../../src/tutorial/TutorialLessonFlow.js';
import {TutorialSession} from '../../src/tutorial/TutorialSession.js';
import {COMPOSITION as C} from '../../src/tutorial/composition.js';
import {LESSON_STEPS} from '../../src/tutorial/lessonSteps.js';
import {validateTake} from '../../src/tutorial/validation.js';
import {createHarness,setHonk} from '../helpers/looperCaptureHarness.js';

function fixture(){
  const captures=Object.fromEntries(['chordLooper','percussionLooper'].map(role=>{
    const h=createHarness({connected:true,trackCount:1}),l=h.looper;
    l.id=role;l.looperController=h.controller;l.transport=l.looperData.transport;
    Object.defineProperty(l,'timeline',{get:()=>l.looperData.timeline});
    l.stop=()=>h.controller.stopPlayback(l);return [role,h];
  }));
  const ready=Object.fromEntries(C.backing.map(g=>[g.role,{ready:true,placed:true,correctPitch:true,contactExact:true}]));
  const s=new TutorialSession({steps:LESSON_STEPS.filter(step=>['record-chords','stop-chords','play-chords'].includes(step.id))});
  const a={takeRoutes:{},takeEvidence:{},snapshotAt:0,
    get:role=>captures[role]?.looper,
    snapshot:()=>({roles:ready,bpm:80,clockPlaying:true,wires:Object.fromEntries(C.backing.map(g=>[g.role,true])),
      loopers:Object.fromEntries(Object.entries(captures).map(([role,h])=>[role,{id:role,clockWired:true,gapBeats:0,recordBeats:16,
        recording:h.looper.transport.recording,recordArmed:h.looper.transport.recordArmed,timeline:h.timeline.hasRecording()?h.timeline.toJSON():null}]))}),
    command(action,now){
      const role=action.endsWith('chordLooper')?'chordLooper':'percussionLooper',h=captures[role];
      if(action.startsWith('stop-record')){if(h.looper.transport.recording||h.looper.transport.recordArmed){h.controller.stopRecording(h.looper,now);h.looper.stop();}}
      else if(action.startsWith('record-'))h.controller.startRecording(h.looper,now);
      t.flow.rememberDemoCommand(role);
    },
    releaseAll(){},releaseVirtuals(){},setVirtualsActive(){},nextBoundary:()=>0,startAvailableBacking:()=>[]};
  const t={session:s,adapter:a,cues:{reset(){}},panel:{completeEffect(){}},render(){},
    r:{audioSystem:{ensureAudio:async()=>{},audioContextService:{context:{currentTime:10}}},deletePendingSpawnPlacement(){},instrumentRegistry:{getByKind:()=>[],get:()=>null}}};
  t.flow=new TutorialLessonFlow(t);
  // Avoid clock construction in this isolated ownership fixture.
  a.get=role=>role==='metronome'?{getBeatTiming:()=>({beatIntervalMs:750})}:captures[role]?.looper;
  return {t,s,a,captures,flow:t.flow};
}
function perform(h,at=100,duration=280){
  setHonk(h,0,at,1);h.inputs[0].bend=.65;setHonk(h,0,at+duration-1,1);setHonk(h,0,at+duration,0);
}
function prior(h){h.controller.startRecording(h.looper,0);perform(h,1,77);h.controller.stopRecording(h.looper,90);}

for(const withPrior of [false,true])test(`real imperfect Practice take survives results and Next (${withPrior?'prior take':'empty looper'})`,async()=>{
  const {s,a,captures,flow}=fixture(),h=captures.chordLooper,other=captures.percussionLooper;
  if(withPrior)prior(h);prior(other);const otherBefore=other.timeline.toJSON();
  await flow.practice();assert.equal(h.looper.transport.recordArmed,true);
  const start=performance.now()+100;perform(h,start);
  // Deliberately incomplete and mistimed: actual capture contains one bent note.
  s.finishAttempt(a.snapshot(),start+400);
  assert.equal(s.phase,'practicing');assert.ok(s.pendingAssessment,'assessment waits for ordinary Stop');
  const snap=flow.finalizeCapture(s,start+400);s.finishAttempt(snap,start+400);flow.finishPractice();
  assert.equal(s.result.ok,false);assert.equal(h.looper.transport.recording,false);
  assert.equal(h.timeline.durationMs,280);const take=h.timeline.toJSON();
  flow.navigate(1);assert.deepEqual(h.timeline.toJSON(),take);assert.deepEqual(other.timeline.toJSON(),otherBefore);
  // The retained real timeline reaches the normal audio scheduler after Play.
  h.calls.length=0;assert.equal(h.controller.startPlayback(h.looper,start+500),true);
  h.controller.scheduleSourceRange(h.looper,0,279,{includeStart:true,sourceNow:0,rate:1,audioNow:10});
  assert.equal(h.calls.filter(e=>e.kind==='start').length,1);
  assert.ok(h.calls.some(e=>e.kind==='expression'&&e.snapshot.bend===.65));h.looper.stop();
});

test('Practice cancellation finalizes a partial take; armed cancellation retains prior content',async()=>{
  const {flow,captures}=fixture(),h=captures.chordLooper;prior(h);const old=h.timeline.toJSON();
  await flow.practice();flow.cancelPractice();assert.deepEqual(h.timeline.toJSON(),old);
  await flow.practice();perform(h,performance.now()-400);flow.cancelPractice();
  assert.equal(h.looper.transport.recording,false);assert.equal(h.timeline.durationMs,280);
});

test('manual recording outside Practice survives navigation and result cleanup',()=>{
  const {flow,captures,s}=fixture(),h=captures.chordLooper;prior(h);const take=h.timeline.toJSON();
  flow.navigate(1);flow.navigate(-1);flow.cancelOutgoing();assert.deepEqual(h.timeline.toJSON(),take);
  s.finishResult({ok:false,message:'No Practice take'},100);flow.finishPractice();assert.deepEqual(h.timeline.toJSON(),take);
});
test('outgoing navigation stops a manually held capture before releasing its input',()=>{
  const {flow,captures,t}=fixture(),h=captures.chordLooper;
  t.r.instrumentRegistry.getByKind=kind=>kind==='looper'?[h.looper]:[];
  const order=[];t.r.pressLooperButton=(looper,action,_morph,now)=>{
    assert.equal(action,'stop');order.push('stop');h.controller.stopRecording(looper,now);looper.stop();
  };
  t.adapter.releaseAll=()=>{order.push('release');h.inputs[0].squeeze=0;};
  h.controller.startRecording(h.looper,0);setHonk(h,0,performance.now()-40,1);h.inputs[0].bend=.75;
  flow.navigate(1);
  assert.equal(order[0],'stop');assert.equal(h.looper.transport.recording,false);
  assert.ok(h.timeline.durationMs>=40);assert.equal(h.timeline.getTrack('track-0').sampleNumericField('bend',h.timeline.durationMs),.75);
});

test('demo restores its temporary take but never restores over newer manual activity',()=>{
  for(const learnerChanged of [false,true]){
    const {flow,captures,s,t}=fixture(),h=captures.chordLooper;prior(h);prior(captures.percussionLooper);
    const savedTakes=flow.snapshots(),before=h.timeline.toJSON();
    const demo=t.demo={ownerSession:s,expectedTakes:{},savedTakes,savedHonks:[],checkpoint:{phase:'ready'},conductor:{stop(){}}};
    for(const role of Object.keys(savedTakes))flow.rememberDemoCommand(role);
    h.controller.startRecording(h.looper,100);perform(h,200,500);h.controller.stopRecording(h.looper,800);flow.rememberDemoCommand('chordLooper');
    if(learnerChanged){h.controller.startRecording(h.looper,1000);perform(h,1100,130);h.controller.stopRecording(h.looper,1300);}
    const latest=h.timeline.toJSON();flow.stopDemo();
    assert.deepEqual(h.timeline.toJSON(),learnerChanged?latest:before);
    assert.equal(t.demo,null);assert.equal(flow.demoOwnsTake(demo,'chordLooper'),false);
  }
});

test('normalization preserves first-note timing errors while the score window permits trimmed chord duration',()=>{
  const routes={chords:Object.fromEntries(C.backing.map((g,i)=>[g.role,{trackId:`track-${i}`}]))};
  const evidence=offset=>C.backing.map(g=>({kind:'note',role:g.role,midis:g.midis,beat:g.beat+offset,durationBeats:g.beats,
    startMs:(g.beat+offset)*750,endMs:(g.beat+offset+g.beats)*750,voiced:true,articulated:true,released:true,maxAbsBend:0}));
  const timeline={schemaVersion:7,timingMode:'metronome',beatIntervalMs:750,gapBeats:0,durationMs:15.7*750,
    tracks:C.backing.map((g,i)=>({trackId:`track-${i}`,events:[{type:'squeezeStart',timeMs:g.beat*750},{type:'squeezeEnd',timeMs:(g.beat+g.beats)*750}]}))};
  assert.equal(validateTake(timeline,evidence(.08),'chordLooper',routes).ok,true);
  for(const offset of [-1,1])assert.equal(validateTake(timeline,evidence(offset),'chordLooper',routes).ok,false);
});
test('audio readiness from a cancelled demo cannot create or restore a stale operation',async()=>{
  const {t,flow,captures}=fixture();prior(captures.chordLooper);
  let ready;t.r.audioSystem.ensureAudio=()=>new Promise(resolve=>{ready=resolve;});
  const pending=flow.demonstrate();flow.navigate(1);prior(captures.chordLooper);
  const take=captures.chordLooper.timeline.toJSON();ready();await pending;
  assert.equal(t.demo,undefined);assert.deepEqual(captures.chordLooper.timeline.toJSON(),take);
});
