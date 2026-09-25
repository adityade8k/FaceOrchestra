import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { AudioCapture } from '../../src/capture/AudioCapture.js';

test('PCM worklet emits continuous sample-index timestamps with bounded pooling and flagged exhaustion',async()=>{
  const messages=[];let Constructor;
  const sandbox={Float32Array,currentFrame:1024,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)};}},registerProcessor:(_name,C)=>{Constructor=C;}};
  vm.runInNewContext(await readFile(new URL('../../src/capture/pcm-worklet.js',import.meta.url),'utf8'),sandbox);
  const worklet=new Constructor(),input=[[new Float32Array(128).fill(.5),new Float32Array(128).fill(-.25)]];
  for(let i=0;i<16*10;i++){worklet.process(input);sandbox.currentFrame+=128;}
  assert.equal(messages[0].sampleIndex,0);assert.equal(messages[0].contextFrame,1024);assert.equal(messages[1].sampleIndex,2048);assert.equal(new Float32Array(messages[0].buffer)[1],-.25);
  assert.equal(messages.filter(m=>m.buffer).length,8);assert.equal(messages.filter(m=>m.gap).length,2);
  worklet.port.onmessage({data:{recycle:messages[0].buffer}});worklet.port.onmessage({data:{stop:true}});assert.equal(messages.at(-1).stopped,true);
});
test('audio tap adds a separate silent branch and disconnects only itself',async()=>{
  const old=globalThis.AudioWorkletNode,connections=[],disconnections=[],destination={speaker:true};
  const context={state:'running',sampleRate:48000,currentTime:1,destination,audioWorklet:{addModule:async()=>{}},addEventListener(){},removeEventListener(){},getOutputTimestamp:()=>({contextTime:.98,performanceTime:performance.now()-20})};
  globalThis.AudioWorkletNode=class{constructor(){this.port={postMessage:m=>{if(m.stop)this.port.onmessage({data:{stopped:true}});}};}connect(target){connections.push(target);}disconnect(){disconnections.push(this);}};
  const output={connect:target=>connections.push(target),disconnect:target=>disconnections.push(target)},system={ensureContext:async()=>context,masterBus:{output}},events=[];
  try{const capture=new AudioCapture(system,(kind,data)=>events.push({kind,data}));await capture.prepare();capture.start(performance.now());const node=capture.node;assert.deepEqual(connections,[node,destination]);assert.equal(events[0].kind,'anchor');await capture.stop();assert.deepEqual(disconnections,[node,node]);assert.ok(!disconnections.includes(destination));}
  finally{globalThis.AudioWorkletNode=old;}
});

test('prepared-performance PCM reserve remains bounded and survives a one-second transfer stall',async()=>{
  const messages=[];let Constructor;
  const sandbox={Float32Array,currentFrame:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)};}},registerProcessor:(_name,C)=>{Constructor=C;}};
  vm.runInNewContext(await readFile(new URL('../../src/capture/pcm-worklet.js',import.meta.url),'utf8'),sandbox);
  const worklet=new Constructor({processorOptions:{poolBlocks:1e9}}),input=[[new Float32Array(128).fill(.25)]];
  for(let i=0;i<375;i++){worklet.process(input);sandbox.currentFrame+=128;}
  assert.ok(messages.length>=23);assert.ok(messages.every(m=>m.buffer));
  for(let i=0;i<16*65;i++){worklet.process(input);sandbox.currentFrame+=128;}
  assert.equal(messages.filter(m=>m.buffer).length,64);assert.ok(messages.some(m=>m.gap));
});
