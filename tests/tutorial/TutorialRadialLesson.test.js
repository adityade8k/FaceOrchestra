import test from 'node:test';
import assert from 'node:assert/strict';
import { committedRoleBindings } from '../../src/tutorial/TutorialRoleBindings.js';
import { isSetupStep, musicUnavailable, setupStatus } from '../../src/tutorial/TutorialLessonPolicy.js';
import { TutorialSession } from '../../src/tutorial/TutorialSession.js';
import { LESSON_STEPS, SIMULATION_STEPS } from '../../src/tutorial/lessonSteps.js';
import { COMPOSITION as C, PITCHES } from '../../src/tutorial/composition.js';
import { SpawnCatalog } from '../../src/spawning/SpawnCatalog.js';
import { TutorialLessonFlow } from '../../src/tutorial/TutorialLessonFlow.js';

function bindings(){
  const objects=new Map(),roles=new Map();
  const commit=(entry,members,step)=>{
    members.forEach(h=>objects.set(h.id,h));
    const result=committedRoleBindings(entry,members,{get:id=>objects.get(id),ids:role=>roles.get(role),step});
    result.forEach(({role,ids})=>roles.set(role,ids));return result;
  };
  return {objects,roles,commit};
}
test('cancelled previews consume no Looper role; replacement preserves the surviving role',()=>{
  const {commit,roles,objects}=bindings();
  assert.deepEqual(commit('looper',[{id:'cancelled',pendingPlacement:true}]),[]);
  commit('looper',[{id:'first'}]);commit('looper',[{id:'second'}]);
  assert.deepEqual([...roles],[['chordLooper',['first']],['percussionLooper',['second']]]);
  objects.delete('first');commit('looper',[{id:'replacement'}]);
  assert.deepEqual([...roles],[['chordLooper',['replacement']],['percussionLooper',['second']]]);
  assert.deepEqual(commit('looper',[{id:'extra'}]),[]);
});
test('recipe identity determines roles regardless of current step; ordinary percussion accepts any pitch',()=>{
  const {commit,roles}=bindings();
  const expectedStep=LESSON_STEPS.find(s=>s.role==='group-1');
  assert.deepEqual(commit('honk-cmajor',[{id:'wrong'}],expectedStep),[]);
  commit('jog-group-3',[0,1,2].map(i=>({id:'group3-'+i})),expectedStep);
  assert.equal(roles.has('group-1'),false);assert.equal(roles.get('group-3').length,3);
  commit('jog-melody',Object.keys(PITCHES).map(id=>({id})),expectedStep);
  assert.deepEqual(roles.get('melody-Eb4'),['Eb4']);assert.deepEqual(roles.get('melody-E4'),['E4']);
  assert.deepEqual(commit('honk',[{id:'early'}],expectedStep),[]);
  commit('honk',[{id:'ordinary',midi:91}],{role:'percussion'});
  assert.deepEqual(roles.get('percussion'),['ordinary']);
});
test('setup observes committed physical state without Practice and revokes invalidated completion',()=>{
  const step=LESSON_STEPS.find(s=>s.id==='chordLooper'),s=new TutorialSession({steps:[step]});
  s.update({},100);assert.equal(s.phase,'ready');assert.match(s.feedback,/Place Chord Looper/);
  const role={ready:true,placed:false,kind:'looper',correctPitch:true,contactExact:true,stableMs:1000};
  const state={roles:{chordLooper:role}};s.update(state,200);assert.equal(s.phase,'ready');
  role.placed=true;s.update(state,300);assert.equal(s.phase,'results');assert.equal(s.index,0);
  assert.equal(s.outcomes.get(step.id).status,'passed');
  const result=s.result;s.update(state,400);assert.equal(s.result,result);
  role.ready=false;s.update(state,500);assert.equal(s.phase,'ready');assert.equal(s.checkpoints.size,0);
});
test('musical exercises and both missing recordings can be skipped honestly',()=>{
  const music=LESSON_STEPS.filter(s=>!isSetupStep(s)),s=new TutorialSession({steps:music});
  for(let index=0;index<music.length;index++)s.navigate(index+1,index*100);
  assert.ok(s.complete);assert.equal(s.checkpoints.size,0);
  assert.ok([...s.outcomes.values()].every(o=>o.status==='skipped'));
  for(const step of music.filter(s=>s.type==='playback'))assert.equal(musicUnavailable(step,{}),'No recording yet; you can skip this step');
});
test('melody needs its own physical targets and clock, but zero or one backing take is sufficient',()=>{
  const roles=Object.fromEntries(Object.keys(PITCHES).map(p=>['melody-'+p,{ready:true,placed:true,correctPitch:true,contactExact:true}]));
  const state={roles,bpm:80,clockPlaying:true,loopers:{}};
  for(const step of LESSON_STEPS.filter(s=>['phrase','performance'].includes(s.type))){
    assert.equal(musicUnavailable(step,state),'');
    state.loopers.chordLooper={hasRecording:true,clockWired:true};assert.equal(musicUnavailable(step,state),'');
  }
  delete roles['melody-Eb4'];assert.match(musicUnavailable(LESSON_STEPS.find(s=>s.type==='phrase'),state),/Place Eb4/);
});
test('learner spawn instructions use visible recipes; legacy simulation aliases remain internal',()=>{
  const catalog=new SpawnCatalog(),visible=new Set(catalog.getRadialEntries().map(e=>e.id));
  for(const step of LESSON_STEPS.filter(s=>s.type==='spawn'))assert.ok(visible.has(step.catalogId),step.id);
  for(const role of ['chordLooper','percussionLooper']){
    const step=SIMULATION_STEPS.find(s=>s.type==='spawn'&&s.role===role);
    assert.ok(catalog.get(step.catalogId));assert.ok(!visible.has(step.catalogId));
  }
  for(const legacy of ['chord-cmajor','honk-fminor','preset-bass','jog-percussion']){
    assert.ok(catalog.get(legacy));assert.ok(!visible.has(legacy));
  }
  for(const step of LESSON_STEPS.filter(isSetupStep))assert.ok(musicUnavailable(step,{}));
  for(const group of C.backing)assert.equal(catalog.get(group.catalogId).recipeId,group.catalogId);
  assert.equal(setupStatus({type:'wire',role:'group-2'},{wires:{'group-2':true}}).ok,true);
});

test('navigation cancels musical actions waiting for audio without building or starting anything',async()=>{
  for(const action of ['practice','demonstrate']){
    let ready;const audio=new Promise(resolve=>ready=resolve),calls=[];
    const steps=[{id:'one',type:'note',role:'melody-C4',midis:[60]},{id:'two',type:'note',role:'melody-C4',midis:[60]}];
    const t={session:new TutorialSession({steps}),cues:{reset(){}},render(){},
      adapter:{snapshot:()=>({roles:{'melody-C4':{ready:true,placed:true,correctPitch:true,contactExact:true}}}),releaseAll:()=>calls.push('release')},
      r:{audioSystem:{ensureAudio:()=>audio},deletePendingSpawnPlacement:()=>calls.push('cancel-preview')}};
    const flow=new TutorialLessonFlow(t),pending=flow[action]();
    flow.navigate(1);ready();await pending;
    assert.equal(t.session.index,1);assert.equal(t.session.phase,'ready');assert.equal(t.demo,undefined);
    assert.deepEqual(calls,['release','cancel-preview']);assert.equal(t.session.outcomes.get('one').status,'skipped');
  }
});
