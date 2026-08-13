import assert from "node:assert/strict";
import test from "node:test";

import { AudioSystem } from "../../src/audio/AudioSystem.js";
import { HONK_RELEASE_ORIGINS } from "../../src/audio/honk/HonkReleaseProfile.js";

test("AudioSystem preserves explicit release options", () => {
  const audio = new AudioSystem();
  const calls = [];
  audio.honkVoices = {
    setVoicePitchBend: (voiceId, bend) => calls.push(["bend", voiceId, bend]),
    releaseVoice: (voiceId, options) => calls.push(["release", voiceId, options]),
  };
  const options = { origin: HONK_RELEASE_ORIGINS.controller };

  audio.releaseVoice("controller-voice", options);

  assert.deepEqual(calls, [
    ["bend", "controller-voice", 0],
    ["release", "controller-voice", options],
  ]);
});
