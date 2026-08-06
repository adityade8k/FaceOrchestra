import test from "node:test";
import assert from "node:assert/strict";

import { MasterBus } from "../../src/audio/MasterBus.js";
import { HonkVoice } from "../../src/audio/honk/HonkVoice.js";
import { HonkPerformanceState } from "../../src/instruments/honk/HonkPerformanceState.js";

const OfflineContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;

test("offline six-Honk/two-looper mix stays finite and click-safe", {
  skip: !OfflineContext && "OfflineAudioContext is not provided by this Node runtime",
}, async () => {
  const sampleRate = 48000;
  const context = new OfflineContext(2, sampleRate * 2, sampleRate);
  const bus = new MasterBus();
  bus.initialize(context);
  const voices = Array.from({ length: 6 }, (_, index) => new HonkVoice({
    context,
    destination: bus.getInput("honk"),
    vowel: index % 2 ? "E" : "A",
  }));
  const performanceStates = voices.map(() => new HonkPerformanceState({ squeeze: 0.75 }));
  for (const voice of voices) {
    voice.start();
    voice.update(performance(0.75));
  }

  const atQuarter = context.suspend(0.25).then(() => {
    // Two logical loopers overlap through the same physical renderers; the
    // capped gate is represented by one update per Honk.
    for (let index = 0; index < voices.length; index += 1) {
      const state = performanceStates[index];
      state.setLiveGateAndBend(0, 0);
      state.setAutomationLayer("looper-a", { squeeze: 1 }, 0.6);
      state.setAutomationLayer("looper-b", { squeeze: 0.9 }, 0.55);
      voices[index].update(performance(state.resolveAudioMix().gate));
    }
    voices[0].setVowel("O");
    context.resume();
  });
  const atHalf = context.suspend(0.5).then(() => {
    // Metronome pulse plus a rapid zero-gap note-off/on retrigger.
    performanceStates[0].setAutomationLayer("metronome", { squeeze: 1 }, 0.8);
    voices[0].update({
      ...performance(performanceStates[0].resolveAudioMix().gate),
      retriggerToken: 1,
    });
    voices[1].update(performance(1));
    context.resume();
  });
  const atThreeQuarters = context.suspend(0.75).then(() => {
    for (let index = 0; index < voices.length; index += 1) {
      performanceStates[index].clearAutomationLayers();
      voices[index].update(performance(performanceStates[index].resolveAudioMix().gate));
    }
    context.resume();
  });
  const rendered = context.startRendering();
  await Promise.all([atQuarter, atHalf, atThreeQuarters]);
  const buffer = await rendered;

  let peak = 0;
  let maxDerivative = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    let previous = samples[0] || 0;
    for (const sample of samples) {
      assert.equal(Number.isFinite(sample), true);
      peak = Math.max(peak, Math.abs(sample));
      maxDerivative = Math.max(maxDerivative, Math.abs(sample - previous));
      previous = sample;
    }
  }
  assert.equal(peak <= 0.98, true);
  // A >0.35 single-sample step is far above the measured sawtooth/formant
  // derivative here and is a useful regression signal for a gate pop.
  assert.equal(maxDerivative < 0.35, true);
});

function performance(hornAmount) {
  return {
    hornAmount,
    masterGain: 0.62,
    leftEar: 0,
    rightEar: 0,
    noteGain: 1,
    pitchBendSemitones: 0,
  };
}
