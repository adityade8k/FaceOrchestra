import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Quaternion} from 'three';
import {compositionRegistry} from '../../src/compositions/CompositionRegistry.js';
import {BendSnapping,bendSnapSequence} from '../../src/tutorial/BendSnapping.js';
import {TutorialRuntime} from '../../src/tutorial/TutorialRuntime.js';
for(const entry of compositionRegistry.list())test(`${entry.id}: every authored bend reaches its ordered targets in practice and recording`,async()=>{
 const {definition:d}=await compositionRegistry.load(entry.id);
 const notes=d.score.events??d.arrangement.liveEvents;
 for(const event of notes.filter(e=>e.bend?.length))for(const mode of ['practice','recording']){
  const c=new Group(),range=event.pitchBendRange??4,target={id:event.role,root:{visible:true},pitchBendRange:range};
  const a={ids:role=>role===event.role?[target.id]:[],r:{controllerStates:new Map([[c,{trigger:true}]])}};
  const snap=new BendSnapping(a),guide={mode:'practice',anchorMs:0,step:{timed:true,events:[event]},beatAt:()=>1e5};
  const host=Object.assign(Object.create(TutorialRuntime.prototype),{ready:true,bendSnapping:snap});
  if(mode==='practice')host.dataTutorial={phase:'practice',guide};else host.jogRecording={guidance:()=>guide};
  const interaction={instrumentState:target,bendStartInverseQuaternion:new Quaternion(),activeVoiceIds:new Set(['voice'])};
  const sequence=bendSnapSequence(event);let actual=0;
  host.snapBend(c,interaction,0,1000);
  for(const destination of sequence.slice(sequence[0]===0?1:0)){
   const direction=Math.sign(destination-actual),from=actual;
   for(let i=1;i<=200;i++)host.snapBend(c,interaction,(from+(destination-from)*i/200)/range,1000+i);
   actual=host.snapBend(c,interaction,destination/range,1300)*range;
   assert.equal(actual,destination,`${mode} ${event.id}: ${sequence}`);
  }
 }
});
