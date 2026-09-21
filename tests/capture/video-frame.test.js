import test from 'node:test';
import assert from 'node:assert/strict';
import { readVideoFrame } from '../../src/capture/videoFrame.js';

class Video extends EventTarget {
  readyState=2;seeking=false;videoWidth=480;videoHeight=864;time=0;callbacks=new Map();next=0;
  get currentTime(){return this.time;}
  set currentTime(time){this.time=time;this.seeking=true;this.readyState=1;}
  requestVideoFrameCallback(fn){this.callbacks.set(++this.next,fn);return this.next;}
  cancelVideoFrameCallback(id){this.callbacks.delete(id);}
  present(time){for(const [id,fn] of this.callbacks){this.callbacks.delete(id);fn(0,{mediaTime:time});}}
  event(name){this.dispatchEvent(new Event(name));}
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
function paints(t){globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;t.after(()=>{delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;});}

test('early presentation callback cannot export until seeked and decoded pixels are ready',async t=>{
  paints(t);const video=new Video();let captured=0,done=false;
  const reading=readVideoFrame(video,37.066,{capture:()=>++captured}).then(result=>{done=true;return result;});
  video.present(37.066);await tick();assert.equal(done,false);
  video.seeking=false;video.event('seeked');await tick();assert.equal(done,false);assert.equal(captured,0);
  video.readyState=2;video.event('loadeddata');const result=await reading;
  assert.equal(result.source,1);assert.equal(result.presentedPTS,37.066);assert.equal(video.callbacks.size,0);
});
test('same decoded source frame and endpoint seeks settle without a new presentation callback',async t=>{
  paints(t);const video=new Video();let captures=0;
  const first=await readVideoFrame(video,0,{capture:()=>++captures});assert.equal(first.source,1);
  const reading=readVideoFrame(video,.01,{presentedTime:0,capture:()=>++captures});
  video.seeking=false;video.readyState=2;video.event('seeked');
  const result=await reading;assert.equal(result.videoTime,.01);assert.equal(result.presentedPTS,0);assert.equal(captures,2);assert.equal(video.callbacks.size,0);
});
test('failed decode times out without capturing a placeholder and removes pending callbacks',async t=>{
  paints(t);const video=new Video();let captures=0;
  const reading=readVideoFrame(video,12,{timeoutMs:20,capture:()=>++captures});
  video.present(12);video.seeking=false;video.event('seeked');
  await assert.rejects(reading,/not ready at 12.000/);assert.equal(captures,0);assert.equal(video.callbacks.size,0);
});
test('a decoder error rejects without drawing or leaving a presentation callback',async t=>{
  paints(t);const video=new Video();const reading=readVideoFrame(video,2);video.event('error');
  await assert.rejects(reading,/could not decode at 2.000/);assert.equal(video.callbacks.size,0);
});
