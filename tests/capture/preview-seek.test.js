import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewSeekQueue } from '../../src/capture/PreviewSeekQueue.js';

test('rapid scrubbing decodes one frame at a time and keeps only the newest pending target',async()=>{
  const calls=[],releases=[];let active=0,maxActive=0,idle=0;
  const queue=new PreviewSeekQueue(async time=>{
    calls.push(time);maxActive=Math.max(maxActive,++active);
    await new Promise(resolve=>releases.push(resolve));active--;
  },()=>idle++);
  const first=queue.request(1);await Promise.resolve();
  queue.request(3);queue.request(2);const last=queue.request(0);
  assert.equal(first,last);assert.equal(queue.target,0);assert.deepEqual(calls,[1]);
  releases.shift()();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[1,0]);assert.equal(queue.target,0);
  releases.shift()();await last;
  assert.equal(maxActive,1);assert.equal(idle,1);assert.equal(queue.target,null);await queue.idle();
});

test('duplicate release events do not requeue a scrub and new drags work after settling',async()=>{
  const calls=[];let release;
  const queue=new PreviewSeekQueue(time=>{calls.push(time);return new Promise(resolve=>{release=resolve;});});
  const first=queue.request(.5);await Promise.resolve();
  assert.equal(queue.request(.5),first);release();await first;assert.deepEqual(calls,[.5]);
  const second=queue.request(.75);await Promise.resolve();release();await second;
  assert.deepEqual(calls,[.5,.75]);assert.equal(queue.running,null);
});

test('a failed preview seek clears the queue so the user can scrub again',async()=>{
  const calls=[];
  const queue=new PreviewSeekQueue(async time=>{calls.push(time);if(time===1)throw new Error('Decoder failed');});
  await assert.rejects(queue.request(NaN),/finite/);
  await assert.rejects(queue.request(1),/Decoder failed/);
  assert.equal(queue.running,null);assert.equal(queue.target,null);
  await queue.request(2);assert.deepEqual(calls,[1,2]);
});
