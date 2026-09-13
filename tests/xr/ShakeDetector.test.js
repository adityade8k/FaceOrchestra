import test from 'node:test';
import assert from 'node:assert/strict';
import {ShakeDetector} from '../../src/xr/ShakeDetector.js';
import {LOOPER_SHAKE_DISCONNECT_SETTINGS as settings} from '../../src/config/looper.js';
import {resolveShakeTarget} from '../../src/xr/shakeDisconnect.js';
import {setControllerGripTarget,clearControllerGripTarget} from '../../src/xr/controllerGripState.js';
const shake=t=>({x:0.11*Math.sin(t/1000*Math.PI*10),y:0,z:0});
for(const fps of [60,72,90,120])test(`deliberate shake is recognized at ${fps} FPS with a bounded window`,()=>{
  const detector=new ShakeDetector(settings);let first=null;
  for(let time=0;time<2000;time+=1000/fps)if(detector.sample(shake(time),time))first??=time;
  assert.ok(first>=360&&first<550,`${first}`);assert.ok(detector.samples.length<=Math.ceil(settings.durationMs*fps/1000)+2);
});
test('irregular intervals recognize shaking but hiccups, teleports, noise and relocation do not',()=>{
  const d=new ShakeDetector(settings);let time=0,recognized=false;
  for(let i=0;i<100;i++){time+=[8,17,11,24,9][i%5];recognized ||= d.sample(shake(time),time);}
  assert.equal(recognized,true);
  for(const motion of [t=>({x:t/1000*2,y:0,z:0}),t=>({x:0.004*Math.sin(t),y:0,z:0}),t=>({x:t<200?0:3,y:0,z:0})]) {
    d.reset();for(let t=0;t<1000;t+=16)assert.equal(d.sample(motion(t),t),false);
  }
  d.reset();for(let t=0;t<320;t+=16)d.sample(shake(t),t);
  assert.equal(d.sample(shake(700),700),false);assert.equal(d.samples.length,1);
});
test('actual source Honk survives a formation wrapper; unheld, preview and metronome motion is excluded',()=>{
  const source={kind:'honk',root:{visible:true}},wrapper={kind:'formation',source,root:{visible:true}},state={shakeDetector:new ShakeDetector(settings)};
  setControllerGripTarget(state,wrapper,source);assert.equal(resolveShakeTarget(state),source);
  state.shakeDetector.sample(shake(0),0);clearControllerGripTarget(state);
  assert.equal(state.shakeDetector.samples.length,0);assert.equal(resolveShakeTarget(state),null);
  for(const target of [{kind:'metronome',root:{visible:true}},{...source,pendingPlacement:true},{...source,disposed:true}]) {
    setControllerGripTarget(state,target);assert.equal(resolveShakeTarget(state),null);
  }
});
