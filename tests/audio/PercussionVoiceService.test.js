import assert from "node:assert/strict";
import test from "node:test";

import { PercussionVoiceService } from "../../src/audio/percussion/PercussionVoiceService.js";

test("the metronome percussion type dispatches to the wooden voice", async () => {
  const context = {};
  const service = new PercussionVoiceService({
    ensureAudio: async () => context,
    getDestination: () => null,
  });
  const calls = [];
  service.triggerBoink = () => calls.push("boink");
  service.triggerHihat = () => calls.push("hihat");
  service.triggerMetronomeWood = (receivedContext, volume) => {
    calls.push([receivedContext, volume]);
  };

  await service.trigger("metronomeWood", { volume: 0.75 });

  assert.deepEqual(calls, [[context, 0.75]]);
});

test('owner cancellation invalidates audio readiness and silences only that looper output at its boundary',async()=>{
  let ready;const context={currentTime:10};
  const service=new PercussionVoiceService({ensureAudio:()=>new Promise(r=>ready=r),getDestination:()=>null});
  let strikes=0;service.triggerMetronomeWood=()=>strikes++;
  const pending=service.trigger('metronomeWood',{ownerId:'a',scheduledTime:11});
  service.cancelOwner('a');ready(context);await pending;assert.equal(strikes,0);
  const calls=[];const output=id=>({gain:{cancelScheduledValues:t=>calls.push([id,'cancel',t]),setValueAtTime:(v,t)=>calls.push([id,v,t])},disconnect(){}});
  const a=output('a'),b=output('b');service.ownOutput('a',a,context);service.ownOutput('b',b,context);
  service.cancelOwner('a',{scheduledTime:11});assert.deepEqual(calls,[['a','cancel',11],['a',0,11]]);
  a.disconnect();assert.equal(service.ownedOutputs.has('a'),false);assert.equal(service.ownedOutputs.has('b'),true);
});
