import test from 'node:test';
import assert from 'node:assert/strict';
import {TutorialSession} from '../../src/tutorial/TutorialSession.js';
import {LESSON_STEPS} from '../../src/tutorial/lessonSteps.js';
import {COMPOSITION as C} from '../../src/tutorial/composition.js';
import {scoreAttempt,PRACTICE_TOLERANCES as P} from '../../src/tutorial/scoring.js';
import {timingCueState} from '../../src/tutorial/timingCueState.js';
import {resolveTutorialRoutes,connectTutorialClock,connectTutorialHonk,recordingFitsRoutes} from '../../src/tutorial/TutorialRoutes.js';
import {validateSetup} from '../../src/tutorial/validation.js';
const step={id:'hold',type:'note',role:'melody-C4',midis:[60],minimumMs:450};
const note=(options={})=>({id:'real-note',kind:'note',origin:'learner',role:'melody-C4',midis:[60],voiced:true,articulated:true,released:true,allReleased:true,startMs:100,endMs:800,maxAbsBend:0,...options});

test('practice results persist; Retry and Next explicitly start a new lifecycle',()=>{
  const s=new TutorialSession({steps:[step,{...step,id:'second'}]});
  assert.equal(s.phase,'ready');assert.equal(s.accept(note()),false);
  s.demonstrated.add(step.id);s.startAttempt(0);s.accept(note());s.update({},1000);
  assert.equal(s.phase,'results');assert.equal(s.result.score,100);assert.equal(s.index,0);
  const result=s.result;s.update({},999999);assert.equal(s.result,result);
  s.startAttempt(1100);assert.equal(s.phase,'practicing');assert.equal(s.result,null);assert.equal(s.evidence.length,0);
  assert.equal(s.accept(note()),false);s.navigate(1,1200);assert.equal(s.phase,'ready');assert.equal(s.index,1);
  s.navigate(0,1300);assert.ok(s.demonstrated.has(step.id));assert.equal(s.outcomes.get(step.id).status,'passed');
});
test('every catalog step supports Next, Previous and a bounded terminal attempt',()=>{
  for(const [index,step] of LESSON_STEPS.entries()){
    const s=new TutorialSession({steps:LESSON_STEPS});s.index=index;s.startAttempt(0);
    s.finishAttempt({},1000);assert.equal(s.phase,'results',step.id);
    s.navigate(index+1,2000);assert.equal(s.complete,index===LESSON_STEPS.length-1);
    s.navigate(index,3000);assert.equal(s.step.id,step.id);assert.equal(s.phase,'ready');
    s.startAttempt(4000);if(step.timed)s.startCountIn(5000);
    s.update({},999999);assert.equal(s.phase,'results',`automatic recovery: ${step.id}`);
  }
});
test('skipped and assisted steps cannot appear as learner passes',()=>{
  const s=new TutorialSession({steps:[step,{...step,id:'assist'}]});s.navigate(1,10);
  assert.equal(s.outcomes.get(step.id).status,'skipped');assert.equal(s.checkpoints.size,0);
  s.startAttempt(20,{assisted:true});s.accept(note({startMs:30,endMs:700}));s.update({},800);
  assert.equal(s.outcomes.get('assist').status,'assisted');assert.equal(s.checkpoints.size,0);
});
test('demonstration and stale releases cannot affect a current learner attempt',()=>{
  const s=new TutorialSession({steps:[step]});s.startAttempt(1000);
  for(const origin of ['demonstration','assistance','simulation','playback'])assert.equal(s.accept(note({origin,startMs:1001})),false);
  assert.equal(s.accept(note({startMs:999,endMs:1500})),false);
  s.accept(note({startMs:1100,endMs:1800}));s.update({},1900);assert.equal(s.result.score,100);
});
test('a final release inside grace is received before grading; an endless hold times out',()=>{
  const timed={id:'timed',type:'chords',timed:true,beats:16};
  const session=()=>{const s=new TutorialSession({steps:[timed]});s.startAttempt(0);s.startCountIn(1000);return s;};
  const s=session();
  for(const [i,g] of C.backing.entries())if(i<3)s.accept(note({id:g.role,role:g.role,midis:g.midis,startMs:1000+g.beat*750,endMs:1000+(g.beat+g.beats)*750}));
  s.update({liveGestures:1},13000);assert.equal(s.phase,'practicing');
  const g=C.backing[3];s.accept(note({id:g.role,role:g.role,midis:g.midis,startMs:1000+g.beat*750,endMs:13100}));
  s.update({liveGestures:0},13101);assert.equal(s.phase,'results');assert.equal(s.result.details.at(-1).heard,g.role);
  const stalled=session();stalled.update({liveGestures:1},1000+(16+P.releaseGraceBeats)*750+1);
  assert.equal(stalled.phase,'results');assert.equal(stalled.result.ok,false);assert.match(stalled.result.message,/Release/);
});
test('missing and extra targets, bad onset timing and short holds lower honest component scores',()=>{
  const good=scoreAttempt(step,[note()]);assert.equal(good.score,100);
  const wrong=scoreAttempt(step,[note({role:'melody-E4',midis:[64]})]);assert.equal(wrong.ok,false);assert.ok(wrong.score<good.score);assert.equal(wrong.extra,1);
  const extra=scoreAttempt(step,[note(),note({id:'extra'})]);assert.equal(extra.ok,false);assert.equal(extra.components.targets,50);
  const short=scoreAttempt(step,[note({endMs:150})]);assert.ok(short.components.holdRelease<70);assert.equal(short.ok,false);
  assert.equal(scoreAttempt(step,[note(),{kind:'strike',role:'percussion'}]).extra,1);
  const timed={...step,type:'chords',timed:true,beats:16};
  const events=C.backing.map(g=>note({role:g.role,midis:g.midis,beat:g.beat+1,durationBeats:g.beats}));
  assert.equal(scoreAttempt(timed,events).components.timing,0);
});
test('rings shrink in preparation, signal the exact onset, hold and visibly release',()=>{
  const event={beat:4,beats:3};
  assert.ok(timingCueState(3.9,event).green<timingCueState(3.2,event).green);
  assert.equal(timingCueState(4-1e-6,event).phase,'prepare');
  assert.equal(timingCueState(4,event).phase,'hold');assert.ok(timingCueState(4,event).yellow>=1.2);
  assert.equal(timingCueState(6.99,event).phase,'hold');
  assert.ok(timingCueState(7.2,event).yellow<timingCueState(7,event).yellow);
  assert.equal(timingCueState(4.11,event,{percussion:true}).phase,'withdraw');
  assert.equal(timingCueState(8,event),null);
});
function routing(){
  const tracks=()=>Array.from({length:8},(_,index)=>({index,trackId:`track-${index}`,connectedHonkId:null}));
  const objects={metronome:{id:'m',connectionPorts:new Map(['a','b','c','d'].map(id=>[id,{}]))},chordLooper:{id:'chords',tracks:tracks()},percussionLooper:{id:'drums',tracks:tracks()}};
  const connections=new Map();const manager={getConnectionForTarget:(_,id)=>connections.get(id),getConnectionsForMetronome:()=>[...connections.values()],connect(c){connections.set(c.targetId,c);return c;}};
  const ids=Object.fromEntries([...C.backing.map(g=>[g.role,[`${g.role}-a`,`${g.role}-b`,`${g.role}-c`]]),['percussion',['hihat']]]);
  const adapter={get:role=>objects[role],ids:role=>ids[role]||[],r:{metronomeConnectionManager:manager,connectLooperTrackToHonk(l,index,id){l.tracks[index].connectedHonkId=id;}}};
  return {objects,connections,adapter};
}
test('any compatible ports and any chord member resolve the same logical roles',()=>{
  const {objects,connections,adapter}=routing();
  connections.set('chords',{metronomeId:'m',portId:'d',targetPortId:'track-6'});
  connections.set('drums',{metronomeId:'m',portId:'b',targetPortId:'track-3'});
  C.backing.forEach((g,i)=>objects.chordLooper.tracks[[7,1,5,2][i]].connectedHonkId=`${g.role}-b`);
  objects.percussionLooper.tracks[6].connectedHonkId='hihat';
  const routes=resolveTutorialRoutes(adapter);
  assert.ok(Object.values(routes.wires).every(Boolean));assert.equal(routes.chords['group-1'].trackId,'track-7');
  assert.equal(routes.percussion.metronome.trackId,'track-3');assert.equal(routes.clocks.chordLooper.portId,'d');
  assert.equal(connectTutorialHonk(adapter,'group-1').trackId,'track-7');assert.equal(connectTutorialClock(adapter,'chordLooper').portId,'d');
  assert.ok(validateSetup({type:'wire',role:'group-1'},{wires:routes.wires}).ok);
});
test('automatic connections reuse valid routes and keep percussion lanes distinct',()=>{
  const {objects,adapter,connections}=routing();connectTutorialClock(adapter,'chordLooper');connectTutorialClock(adapter,'percussionLooper');
  connectTutorialHonk(adapter,'percussion');const before=JSON.stringify([...connections]);
  connectTutorialClock(adapter,'percussionLooper');connectTutorialHonk(adapter,'percussion');assert.equal(JSON.stringify([...connections]),before);
  const routes=resolveTutorialRoutes(adapter);assert.notEqual(routes.percussion.percussion.trackId,routes.percussion.metronome.trackId);
  assert.equal(objects.percussionLooper.tracks.filter(t=>t.connectedHonkId).length,1);
});
test('route snapshots remain valid while prerequisite instruments are absent or deleted',()=>{
  const {adapter,objects}=routing();
  delete objects.metronome;delete objects.chordLooper;delete objects.percussionLooper;
  assert.deepEqual(resolveTutorialRoutes(adapter).clocks,{});
  assert.equal(Object.values(resolveTutorialRoutes(adapter).wires).some(Boolean),false);
});
test('practice playback requires observed audio and an uninterrupted hands-off cycle',()=>{
  const s=new TutorialSession({steps:[{id:'listen',type:'playback',looperRole:'chordLooper'}]});s.startAttempt(0);
  const snapshot={audioRunning:true,liveGestures:0,anyStickContact:false,loopers:{chordLooper:{playing:true,playArmed:false,clockWired:true,playbackObserved:false},percussionLooper:{playing:false}}};
  s.update(snapshot,1000);assert.equal(s.playbackSince,null);
  snapshot.loopers.chordLooper.playbackObserved=true;s.update(snapshot,1100);
  s.update({...snapshot,liveGestures:1},5000);assert.equal(s.playbackSince,null);
  s.update(snapshot,5100);s.update(snapshot,17200);assert.equal(s.phase,'results');assert.equal(s.result.ok,true);
});
test('repair reconnects a recorded chord to its actual captured track; changed layouts request a real take',()=>{
  const {adapter,objects}=routing();
  C.backing.forEach((group,i)=>objects.chordLooper.tracks[i+2].connectedHonkId=adapter.ids(group.role)[1]);
  adapter.takeRoutes={chordLooper:resolveTutorialRoutes(adapter)};
  adapter.takeEvidence={chordLooper:[{kind:'note',origin:'learner'}]};objects.chordLooper.timeline={hasRecording:()=>true};
  assert.equal(recordingFitsRoutes(adapter,'chordLooper'),true);
  objects.chordLooper.tracks[2].connectedHonkId=null;assert.equal(connectTutorialHonk(adapter,'group-1').trackId,'track-2');
  objects.chordLooper.tracks[2].connectedHonkId=null;objects.chordLooper.tracks[7].connectedHonkId=adapter.ids('group-1')[2];
  assert.equal(resolveTutorialRoutes(adapter).wires['group-1'],true);assert.equal(recordingFitsRoutes(adapter,'chordLooper'),false);
});
