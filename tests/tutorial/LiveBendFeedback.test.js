import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,PerspectiveCamera,Quaternion} from 'three';
import {LiveBendFeedback} from '../../src/tutorial/LiveBendFeedback.js';
import {cueCanvas} from '../helpers/cueCanvas.js';
for(const range of [4,5])test(`normal play range ${range}: feedback reads processed pitch, coalesces crossings and resets independently`,()=>{
 const scene=new Scene(),camera=new PerspectiveCamera(),pulses=[],controllers=[new Group(),new Group()],states=new Map(),targets=[];
 const r={scene,controllers,controllerStates:states,getUserCamera:()=>camera,getControllerVoiceId:c=>c.uuid,
 getInstrumentVoiceId:(v,h)=>v+':'+h.id,getControllerGamepad:c=>c,
 hapticsService:{pulse(c,options){pulses.push({c,...options});return Promise.resolve();}}};
 for(const [i,c]of controllers.entries()){
  const h={id:String(i),kind:'honk',root:new Group(),pitchBendRange:range,value:0,hornHolders:new Set([c]),hasAudioVoice:()=>true,
   getProcessedLivePerformanceState(){return {bend:this.value/range};},
   getLivePerformanceState(){throw new Error('Normal feedback must read the processed sound value');},
   getSqueezeColliderSphere(){return {center:this.root.position,radius:.1};}};
  targets.push(h);states.set(c,{trigger:true,raySqueezeInstrumentState:h,raySqueezeStartInverseQuaternion:new Quaternion()});
 }
 const feedback=new LiveBendFeedback(r,{createCanvas:cueCanvas});
 try{
  feedback.update(0,true);targets[0].value=range;feedback.update(100,true);
  assert.equal(pulses.length,1,'Fast crossings produce one pulse');
  const gauge=feedback.gauges.get(controllers[0]);
  assert.equal(gauge.state.actual,range);assert.equal(gauge.range,range);
  assert.equal(gauge.expected.visible,false);assert.equal(gauge.destination.visible,false);
  assert.equal(gauge.ticks.filter(t=>t.visible).length,range*2+1);
  assert.doesNotMatch(gauge.text,/Target|On target|Overshoot|Follow/);
  assert.equal(targets[0].value,range,'Feedback does not write pitch');
  for(const v of [range-.01,range,range-.02,range]){targets[0].value=v;feedback.update(200,true);}
  assert.equal(pulses.length,1,'Jitter does not repeat a pulse');
  targets[1].value=-2;feedback.update(300,true);assert.equal(pulses.length,2);
  targets[0].value=-range;feedback.update(400,true);assert.equal(pulses.length,3);
  states.get(controllers[0]).trigger=false;feedback.update(500,true);
  assert.equal(gauge.root.visible,false);assert.equal(feedback.haptics.holds.has(controllers[0]),false);
  controllers[1].userData.inputConnected=false;feedback.update(600,true);
  assert.equal(feedback.haptics.holds.size,0);assert.ok([...feedback.gauges.values()].every(g=>!g.root.visible));
  controllers[1].userData.inputConnected=true;targets[1].disposed=true;feedback.update(700,true);
  assert.equal(feedback.haptics.holds.size,0);
  targets[1].disposed=false;feedback.update(800,true);feedback.update(900,false);
  assert.equal(feedback.haptics.holds.size,0);assert.ok([...feedback.gauges.values()].every(g=>!g.root.visible));
 }finally{feedback.dispose();}
 assert.equal(scene.children.length,0);
});
test('normal Play cannot use an old tutorial guide to enable snapping',async()=>{
 const {TutorialRuntime}=await import('../../src/tutorial/TutorialRuntime.js');
 const r={sessionMode:'play'},seen=[];
 const t=Object.assign(Object.create(TutorialRuntime.prototype),{r,ready:true,
   dataTutorial:{phase:'practice',guide:{step:{bend:true}}},
   bendSnapping:{resolve(guide,_controller,_interaction,value){seen.push(guide);return value;}}});
 assert.equal(t.snapBend({}, {}, .373, 100),.373);assert.deepEqual(seen,[null]);
});
test('normal dials are excluded from clean capture and included only with guidance enabled',async()=>{
 const {PresentationCapture}=await import('../../src/capture/PresentationCapture.js');
 const scene=new Scene(),dial=new Group();dial.name='Normal bend dial';scene.add(dial);
 const r={scene,instrumentRegistry:new Map(),controllers:[],tutorial:{liveBendFeedback:{captureRoots:()=>[dial]}}};
 for(const includeUI of [false,true]){
  const capture=new PresentationCapture(r,()=>{},{includeUI});capture.sample(0);
  assert.equal(capture.ids.has(dial),includeUI);
 }
});
