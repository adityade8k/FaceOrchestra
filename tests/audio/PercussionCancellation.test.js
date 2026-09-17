import test from 'node:test';
import assert from 'node:assert/strict';
import {PercussionVoiceService} from '../../src/audio/percussion/PercussionVoiceService.js';

test('boundary trimming cancels deferred future percussion without dropping an earlier outgoing hit',async()=>{
  let ready;const calls=[],service=new PercussionVoiceService({ensureAudio:()=>new Promise(resolve=>ready=resolve)});
  // Use one shared readiness promise, as the application AudioContext service does.
  const promise=new Promise(resolve=>ready=resolve);service.ensureAudio=()=>promise;
  service.triggerBoink=(_context,_volume,at,owner)=>calls.push({at,owner});
  const before=service.trigger('boink',{ownerId:'a',scheduledTime:11.9});
  const after=service.trigger('boink',{ownerId:'a',scheduledTime:12});
  const independent=service.trigger('boink',{ownerId:'b',scheduledTime:12});
  service.cancelOwner('a',{afterTime:12});ready({currentTime:11.8});await Promise.all([before,after,independent]);
  assert.deepEqual(calls,[{at:11.9,owner:'a'},{at:12,owner:'b'}]);assert.equal(service.pendingTriggers.size,0);
});
test('boundary trimming mutes only outputs beginning at or after the boundary; full Stop mutes all',()=>{
  const calls=[],service=new PercussionVoiceService({}),context={currentTime:11.8};
  const output=id=>({gain:{cancelScheduledValues:at=>calls.push([id,'cancel',at]),setValueAtTime:(value,at)=>calls.push([id,value,at])},disconnect(){}});
  service.ownOutput('a',output('sustain'),context,11.5);service.ownOutput('a',output('repeat'),context,12);
  service.cancelOwner('a',{afterTime:12});assert.deepEqual(calls.map(c=>c[0]),['repeat','repeat']);
  calls.length=0;service.cancelOwner('a');assert.deepEqual(calls.map(c=>c[0]),['sustain','sustain','repeat','repeat']);
});
