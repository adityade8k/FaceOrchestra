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

test('volume zero skips automatic click synthesis while recorded wood taps use their independent sound path', async () => {
  const audio=new AudioSystem();let contexts=0,taps=0;
  audio.ensureContext=async()=>{contexts++;throw new Error('A silent click must not allocate audio nodes');};
  audio.percussionVoices={trigger(type,{volume}){assert.equal(type,'metronomeWood');assert.equal(volume,1);taps++;}};
  await audio.triggerMetronomeClick({volume:0});
  audio.triggerStickPercussion('metronomeWood',{volume:1});
  assert.equal(contexts,0);assert.equal(taps,1);
});
