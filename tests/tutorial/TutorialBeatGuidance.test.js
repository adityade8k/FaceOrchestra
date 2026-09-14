import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingGuidance } from '../../src/tutorial/recordingGuidance.js';
import { bendCueState, bendCueDisplacement } from '../../src/tutorial/bendCueState.js';
import { DESCENDING_BEND, bendAt } from '../../src/tutorial/composition.js';
import { LESSON_STEPS } from '../../src/tutorial/lessonSteps.js';
import { TutorialSession } from '../../src/tutorial/TutorialSession.js';
import { setupStatus, LESSON_CONTROL_IDS } from '../../src/tutorial/TutorialLessonPolicy.js';
import { createHarness, setHonk } from '../helpers/looperCaptureHarness.js';
import { readFileSync } from 'node:fs';

for(const role of ['chordLooper','percussionLooper'])test(`${role} setup checks actual 16-beat selector with the same six controls`,()=>{
  const step=LESSON_STEPS.find(s=>s.type==='record-length'&&s.looperRole===role);
  assert.ok(step);assert.equal(setupStatus(step,{loopers:{[role]:{recordBeats:16}}}).ok,true);
  for(const beats of [2,4,8,undefined])assert.equal(setupStatus(step,{loopers:{[role]:{recordBeats:beats}}}).ok,false);
  assert.equal(LESSON_CONTROL_IDS.length,6);assert.equal(LESSON_STEPS[LESSON_STEPS.indexOf(step)+1].type,'record');
});

test('tutorial displays recorder beats, remaining time and fixed versus shortened completion',()=>{
  const h=createHarness({connected:true,trackCount:1});h.controller.startRecording(h.looper,0);
  const text=now=>recordingGuidance(h.controller.getRecordingProgress(h.looper,now),(now-1000)/500);
  assert.match(text(0),/Ready — begin on the cue/);assert.match(text(10000),/cue has passed/);
  setHonk(h,0,1125,1);assert.match(text(1125),/Beat 1\/16/);
  setHonk(h,0,1400,0);
  for(let i=0;i<16;i++)assert.match(text(1000+i*500+250),new RegExp(`Beat ${i+1}/16`));
  assert.match(text(8500),/Ending soon/);h.controller.updateRecordings([h.looper],9000);assert.equal(text(9000),'Recording complete — 16 beats');
  h.controller.startRecording(h.looper,10000);setHonk(h,0,10125,1);setHonk(h,0,10500,0);h.controller.stopRecording(h.looper,11000);
  assert.match(text(11000),/stopped early — 0.75 beats saved/);
});

test('assessment waits for real capture and never shifts its intended cue to the actual onset',()=>{
  const step=LESSON_STEPS.find(s=>s.id==='record-chords'),s=new TutorialSession({steps:[step]});s.startAttempt(0);s.startCountIn(1000,750);
  const snapshot={loopers:{chordLooper:{recordArmed:true}},liveGestures:0};
  s.update(snapshot,14000);assert.equal(s.phase,'practicing');assert.ok(s.pendingAssessment);assert.equal(s.anchorMs,1000);
  snapshot.loopers.chordLooper={recording:true};s.update(snapshot,20000);assert.equal(s.phase,'practicing');assert.equal(s.anchorMs,1000);
  snapshot.loopers.chordLooper={recording:false,recordArmed:false};s.finishAttempt(snapshot,21000);assert.equal(s.phase,'results');assert.equal(s.result.ok,false);
});

test('timed guide follows musical clock phase while assessment timestamps retain count-in coordinates',()=>{
  const s=new TutorialSession({steps:[LESSON_STEPS.find(s=>s.id==='phrase-A')]});let interval=750,origin=0;
  s.musicalClock=now=>({beatPosition:(now-origin)/interval});s.startAttempt(0);s.startCountIn(3000,750);
  assert.equal(s.beatAt(4500),2);interval=500;origin=1500;assert.equal(s.beatAt(4500),2);assert.equal(s.beatAt(5000),3);
  s.accept({id:'early',origin:'learner',kind:'note',startMs:2250,endMs:3000});assert.equal(s.evidence[0].beat,-1);
});

for(const hand of ['left','right'])test(`${hand} bend guide preserves score hold, curve, three-semitone settle and view-dependent roll direction`,()=>{
  assert.equal(bendCueState(DESCENDING_BEND,-.1),null);assert.equal(bendCueState(DESCENDING_BEND,1.01),null);
  for(const t of [0,.1,.2])assert.equal(bendCueState(DESCENDING_BEND,t).semitones,0);
  for(const t of [.25,.4,.55,.7,.8,1]){
    const cue=bendCueState(DESCENDING_BEND,t);assert.equal(cue.semitones,bendAt(DESCENDING_BEND,t));
    assert.equal(cue.rollRadians*2.5*4,cue.semitones);
    assert.ok(bendCueDisplacement(cue.rollRadians,1,0)>0);assert.ok(bendCueDisplacement(cue.rollRadians,-1,0)<0);
    assert.ok(Math.abs(bendCueDisplacement(cue.rollRadians,1,0))<=.55);
  }
  const end=bendCueState(DESCENDING_BEND,.85);assert.equal(end.semitones,-3);assert.equal(end.phase,'settle');
  assert.equal(bendCueDisplacement(0,1,0),0);
});

test('tutorial capture ownership has no score timer stop or retry deletion, and visual guide has no pitch writes',()=>{
  const runtime=readFileSync(new URL('../../src/tutorial/TutorialRuntime.js',import.meta.url),'utf8');
  const adapter=readFileSync(new URL('../../src/tutorial/TutorialAdapter.js',import.meta.url),'utf8');
  const cues=readFileSync(new URL('../../src/tutorial/TutorialTimingCues.js',import.meta.url),'utf8');
  assert.doesNotMatch(runtime,/clearRecording\(|finishCapture\(/);assert.doesNotMatch(adapter,/step\.beats\s*-\s*\.25|finishCapture\(/);
  assert.doesNotMatch(cues,/setLivePerformance|setBend|\.squeeze\(|\.setMorph|setTimeout|setInterval/);
});
