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
