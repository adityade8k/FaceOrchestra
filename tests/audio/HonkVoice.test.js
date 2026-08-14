import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { HonkVoice } from "../../src/audio/honk/HonkVoice.js";
import {
  CONTROLLER_HONK_RELEASE_SETTINGS,
  HONK_RELEASE_ORIGINS,
} from "../../src/audio/honk/HonkReleaseProfile.js";
import {
  getHonkNoteGainFromNose,
  HONK_NOTE_GAIN_SETTINGS,
  HONK_RELEASE_SETTINGS,
  VOICE_GAIN_SETTINGS,
} from "../../src/config/audio.js";

test("nose uses a legacy-safe note-gain mapping without changing the filter graph", () => {
  assert.equal(getHonkNoteGainFromNose(0), 1);
  assert.equal(getHonkNoteGainFromNose(1), HONK_NOTE_GAIN_SETTINGS.minimumAtMaxNose);
  assert.equal(getHonkNoteGainFromNose(-5), 1);
  assert.equal(getHonkNoteGainFromNose(5), HONK_NOTE_GAIN_SETTINGS.minimumAtMaxNose);

  const context = createAudioContext({ currentTime: 3 });
  const voice = new HonkVoice({ context });
  voice.update({
    hornAmount: 1,
    masterGain: 0.5,
    noteGain: 0.25,
    activeVoiceCount: 4,
    nose: 1,
  });

  const gainEvent = lastEventOfType(voice.master.gain, "setTargetAtTime");
  assert.ok(Math.abs(
    gainEvent.value - VOICE_GAIN_SETTINGS.baseGain * 0.5 * 0.25 * 0.5,
  ) < 1e-12);
  assert.equal(gainEvent.timeConstant, HONK_NOTE_GAIN_SETTINGS.smoothingSeconds);
  assert.equal(context.filters.length, 4);
});

test("createNodes and held updates retain the Ver-8 oscillator and gain behavior", () => {
  const context = createAudioContext({ currentTime: 1.5 });
  const voice = new HonkVoice({ context });

  assert.equal(voice.source.type, "sawtooth");
  assert.equal(voice.vibrato.type, "sine");
  assert.equal(voice.toneFilter.type, "lowpass");
  assert.equal(voice.toneFilter.frequency.value, VOICE_GAIN_SETTINGS.toneLowpassFrequency);
  assert.equal(voice.toneFilter.Q.value, VOICE_GAIN_SETTINGS.toneLowpassQ);
  assert.deepEqual(lastEventOfType(voice.master.gain, "setValueAtTime"), {
    type: "setValueAtTime",
    value: 0.0001,
    time: 1.5,
  });
  assert.deepEqual(lastEventOfType(voice.output.gain, "setValueAtTime"), {
    type: "setValueAtTime",
    value: VOICE_GAIN_SETTINGS.outputGain,
    time: 1.5,
  });

  voice.update({
    hornAmount: 0.8,
    masterGain: 0.75,
    noteGain: 0.5,
    activeVoiceCount: 4,
    pitchBendSemitones: 0.25,
  });

  assert.deepEqual(lastEventOfType(voice.source.detune, "setTargetAtTime"), {
    type: "setTargetAtTime",
    value: 25,
    time: 1.5,
    timeConstant: 0.045,
  });
  assert.deepEqual(lastEventOfType(voice.master.gain, "setTargetAtTime"), {
    type: "setTargetAtTime",
    value: 0.8 * VOICE_GAIN_SETTINGS.baseGain * 0.75 * 0.5 * 0.5,
    time: 1.5,
    timeConstant: HONK_NOTE_GAIN_SETTINGS.smoothingSeconds,
  });
});

test("controller release within one XR frame uses the legacy target tail while attack settles", () => {
  const context = createAudioContext({ currentTime: 0 });
  const voice = new HonkVoice({ context });
  voice.start();
  voice.update({ hornAmount: 1, masterGain: 1, noteGain: 1 });
  context.currentTime = 0.011;

  const releaseState = voice.release(
    HONK_RELEASE_SETTINGS.liveFadeSeconds,
    undefined,
    { origin: HONK_RELEASE_ORIGINS.controller },
  );
  const releaseEvents = voice.master.gain.events.slice(-2);
  const outputHold = voice.output.gain.events.at(-2);
  const outputRamp = voice.output.gain.events.at(-1);

  assert.deepEqual(releaseEvents, [
    { type: "cancelScheduledValues", time: 0.011 },
    {
      type: "setTargetAtTime",
      value: CONTROLLER_HONK_RELEASE_SETTINGS.silentFloor,
      time: 0.011,
      timeConstant: CONTROLLER_HONK_RELEASE_SETTINGS.targetTimeConstantSeconds,
    },
  ]);
  assert.equal(eventCount(voice.master.gain, "cancelAndHoldAtTime"), 0);
  assert.equal(eventCount(voice.master.gain, "linearRampToValueAtTime"), 0);
  assert.deepEqual(outputHold, {
    type: "setValueAtTime",
    value: VOICE_GAIN_SETTINGS.outputGain,
    time: releaseState.silentAt - CONTROLLER_HONK_RELEASE_SETTINGS.finalZeroRampSeconds,
  });
  assert.deepEqual(outputRamp, {
    type: "linearRampToValueAtTime",
    value: 0,
    time: releaseState.silentAt,
  });
  assert.equal(outputHold.time > releaseState.releaseStart, true);
  assert.equal(outputRamp.time < releaseState.stopAt, true);
  assert.equal(voice.source.stopCalls[0], releaseState.stopAt);
  assert.equal(voice.disconnected, false);

  voice.source.onended();
  assert.equal(voice.disconnected, true);
});

test("duplicate controller release remains idempotent", () => {
  const context = createAudioContext({ currentTime: 0.005 });
  const voice = new HonkVoice({ context });
  const options = { origin: HONK_RELEASE_ORIGINS.controller };

  const first = voice.release(HONK_RELEASE_SETTINGS.liveFadeSeconds, undefined, options);
  const second = voice.release(HONK_RELEASE_SETTINGS.liveFadeSeconds, undefined, options);

  assert.equal(second, first);
  assert.equal(eventCount(voice.master.gain, "setTargetAtTime"), 1);
  assert.equal(eventCount(voice.output.gain, "linearRampToValueAtTime"), 1);
  assert.equal(voice.source.stopCalls.length, 1);
  assert.equal(voice.vibrato.stopCalls.length, 1);
});

test("release ramps the held master gain to exact zero before stopping oscillators", () => {
  const context = createAudioContext({ currentTime: 4 });
  const voice = new HonkVoice({ context });
  let completionCount = 0;
  voice.master.gain.value = 0.37;

  const releaseState = voice.release(0.04, () => {
    completionCount += 1;
  });
  const hold = lastEventOfType(voice.master.gain, "cancelAndHoldAtTime");
  const ramp = lastEventOfType(voice.master.gain, "linearRampToValueAtTime");

  assert.deepEqual(hold, { type: "cancelAndHoldAtTime", time: 4 });
  assert.deepEqual(ramp, {
    type: "linearRampToValueAtTime",
    value: 0,
    time: releaseState.silentAt,
  });
  assert.equal(releaseState.silentAt, 4.04);
  assert.equal(
    releaseState.stopAt,
    releaseState.silentAt + HONK_RELEASE_SETTINGS.stopPaddingSeconds,
  );
  assert.deepEqual(voice.source.stopCalls, [releaseState.stopAt]);
  assert.deepEqual(voice.vibrato.stopCalls, [releaseState.stopAt]);
  assert.equal(voice.source.stopCalls[0] > ramp.time, true);
  assert.equal(voice.disconnected, false);
  assert.equal(completionCount, 0);

  voice.source.onended();

  assert.equal(voice.disconnected, true);
  assert.equal(voice.source.disconnectCount, 1);
  assert.equal(completionCount, 1);
});

test("release fallback cancels automation and anchors the current gain before ramping", () => {
  const context = createAudioContext({
    currentTime: 2,
    supportsCancelAndHold: false,
  });
  const voice = new HonkVoice({ context });
  voice.master.gain.value = 0.23;

  voice.release(0.03);

  assert.deepEqual(voice.master.gain.events.slice(-3), [
    { type: "cancelScheduledValues", time: 2 },
    { type: "setValueAtTime", value: 0.23, time: 2 },
    { type: "linearRampToValueAtTime", value: 0, time: 2.03 },
  ]);
});

test("release is idempotent and completes cleanup only once", () => {
  const context = createAudioContext();
  const voice = new HonkVoice({ context });
  let firstCompletionCount = 0;
  let secondCompletionCount = 0;

  const firstState = voice.release(0.03, () => {
    firstCompletionCount += 1;
  });
  const secondState = voice.release(0.08, () => {
    secondCompletionCount += 1;
  });

  assert.equal(secondState, firstState);
  assert.equal(eventCount(voice.master.gain, "linearRampToValueAtTime"), 1);
  assert.equal(voice.source.stopCalls.length, 1);
  assert.equal(voice.vibrato.stopCalls.length, 1);

  voice.source.onended();
  voice.source.onended();

  assert.equal(voice.source.disconnectCount, 1);
  assert.equal(firstCompletionCount, 1);
  assert.equal(secondCompletionCount, 0);
});

test("a source-stop error waits through the silent point before fallback cleanup", async () => {
  const context = createAudioContext({ sourceStopThrows: true });
  const voice = new HonkVoice({ context });
  let completionCount = 0;

  const releaseState = voice.release(0, () => {
    completionCount += 1;
  });

  assert.equal(
    releaseState.silentAt,
    HONK_RELEASE_SETTINGS.minimumFadeSeconds,
  );
  assert.equal(voice.disconnected, false);
  assert.equal(completionCount, 0);

  await delay(Math.ceil(releaseState.stopAt * 1000) + 15);

  assert.equal(voice.disconnected, true);
  assert.equal(completionCount, 1);

  voice.source.onended();
  assert.equal(completionCount, 1);
});

function createAudioContext({
  currentTime = 0,
  supportsCancelAndHold = true,
  sourceStopThrows = false,
} = {}) {
  const oscillators = [];
  const filters = [];
  const context = {
    currentTime,
    filters,
    destination: createAudioNode({ supportsCancelAndHold }),
    createOscillator() {
      const oscillatorIndex = oscillators.length;
      const node = createAudioNode({ supportsCancelAndHold });
      node.startCalls = [];
      node.stopCalls = [];
      node.start = (time) => {
        node.startCalls.push(time);
      };
      node.stop = (time) => {
        node.stopCalls.push(time);
        if (sourceStopThrows && oscillatorIndex === 0) {
          throw new Error("source stop failed");
        }
      };
      oscillators.push(node);
      return node;
    },
    createBiquadFilter() {
      const filter = createAudioNode({ supportsCancelAndHold });
      filters.push(filter);
      return filter;
    },
    createGain() {
      return createAudioNode({ supportsCancelAndHold });
    },
  };
  return context;
}

function createAudioNode({ supportsCancelAndHold = true } = {}) {
  return {
    connect() {},
    disconnectCount: 0,
    disconnect() {
      this.disconnectCount += 1;
    },
    gain: createAudioParam({ supportsCancelAndHold }),
    frequency: createAudioParam({ supportsCancelAndHold }),
    detune: createAudioParam({ supportsCancelAndHold }),
    Q: createAudioParam({ supportsCancelAndHold }),
  };
}

function createAudioParam({ supportsCancelAndHold = true } = {}) {
  const param = {
    value: 0,
    events: [],
    setValueAtTime(value, time) {
      this.value = value;
      this.events.push({ type: "setValueAtTime", value, time });
    },
    setTargetAtTime(value, time, timeConstant) {
      this.events.push({ type: "setTargetAtTime", value, time, timeConstant });
    },
    exponentialRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push({ type: "exponentialRampToValueAtTime", value, time });
    },
    linearRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push({ type: "linearRampToValueAtTime", value, time });
    },
    cancelScheduledValues(time) {
      this.events.push({ type: "cancelScheduledValues", time });
    },
  };
  if (supportsCancelAndHold) {
    param.cancelAndHoldAtTime = function cancelAndHoldAtTime(time) {
      this.events.push({ type: "cancelAndHoldAtTime", time });
    };
  }
  return param;
}

function lastEventOfType(param, type) {
  return param.events.findLast((event) => event.type === type);
}

function eventCount(param, type) {
  return param.events.filter((event) => event.type === type).length;
}
