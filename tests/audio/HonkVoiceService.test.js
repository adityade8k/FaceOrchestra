import assert from "node:assert/strict";
import test from "node:test";

import { HonkVoiceService } from "../../src/audio/honk/HonkVoiceService.js";

test("release cancels a voice whose audio context is still starting", async () => {
  let finishAudioStart;
  const service = new HonkVoiceService({
    ensureAudio: () => new Promise((resolve) => { finishAudioStart = resolve; }),
    getDestination: () => null,
  });

  const starting = service.startVoice("pending-voice");
  assert.equal(service.startingVoices.has("pending-voice"), true);

  service.releaseVoice("pending-voice");
  finishAudioStart({});
  await starting;

  assert.equal(service.startingVoices.has("pending-voice"), false);
  assert.equal(service.voices.has("pending-voice"), false);
});
