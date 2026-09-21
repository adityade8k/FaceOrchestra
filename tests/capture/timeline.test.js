import test from 'node:test';
import assert from 'node:assert/strict';
import { Timeline } from '../../src/capture/Timeline.js';
const pose=(x,q=[0,0,0,1])=>({p:[x,1,0],q});
const node=(x,v=1)=>({x:[x,1,0,0,0,0,1,1,1,1,v,x/10],morphs:1,materials:['locked'],geometry:'g'});
const frame=(t,nodes,full=false,extra={})=>({t,data:{full,nodes,removed:[],segment:0,xr:{viewer:pose(t),controllers:[{handedness:'left',profiles:['test'],grip:pose(t),ray:pose(t+3)}]},...extra}});
test('full snapshots plus deltas give deterministic forward/backward seeking with morphs',()=>{
  const timeline=new Timeline([frame(0,{honk:node(0)},true),frame(.1,{honk:node(1),stick:node(4)}),frame(.2,{honk:node(2)},false,{removed:['stick']}),frame(1,{honk:node(8)},true)]);
  const first=timeline.seek(.05);assert.equal(first.nodes.honk.x[0],.5);assert.equal(first.nodes.honk.x[11],.05);
  assert.equal(first.xr.controllers[0].ray.p[0]-first.xr.controllers[0].grip.p[0],3);
  timeline.seek(1);assert.deepEqual(timeline.seek(.05),first);assert.ok(timeline.seek(.15).nodes.stick);assert.equal(timeline.seek(.2).nodes.stick,undefined);
});
test('visibility, tracking loss, deletion, gaps and reference reset never blend across discontinuities',()=>{
  const lost=frame(.1,{honk:node(1,0)},false,{segment:1,xr:{viewer:null,controllers:[{handedness:'left',profiles:['test'],grip:null,ray:null}]}});
  const timeline=new Timeline([frame(0,{honk:node(0)},true),lost]);assert.equal(timeline.seek(.05).nodes.honk.x[0],0);assert.equal(timeline.seek(.1).xr.controllers[0].grip,null);
  const gap=new Timeline([frame(0,{honk:node(0)},true),frame(.1,{honk:node(2)})],[],[{stream:'samples',start:.02,end:.09}]);assert.equal(gap.seek(.05).nodes.honk.x[0],0);
});
