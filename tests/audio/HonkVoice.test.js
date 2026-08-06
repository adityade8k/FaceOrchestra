import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { HonkVoice } from "../../src/audio/honk/HonkVoice.js";
import { HONK_RELEASE_SETTINGS } from "../../src/config/audio.js";

test("release uses the Ver-5 target curve and stops oscillators after 0.12 seconds", () => {
  const context = createAudioContext({ currentTime: 4 });
  const voice = new HonkVoice({ context });
  let completionCount = 0;
  voice.master.gain.value = 0.37;

  const releaseState = voice.release(undefined, () => {
    completionCount += 1;
  });
  const cancel = lastEventOfType(voice.master.gain, "cancelScheduledValues");
  const target = lastEventOfType(voice.master.gain, "setTargetAtTime");

  assert.deepEqual(cancel, { type: "cancelScheduledValues", time: 4 });
  assert.deepEqual(target, {
    type: "setTargetAtTime",
    value: 0.0001,
    time: 4,
    timeConstant: 0.04,
  });
  assert.equal(eventCount(voice.master.gain, "cancelAndHoldAtTime"), 0);
  assert.equal(releaseState.stopAt, 4.12);
  assert.deepEqual(voice.source.stopCalls, [releaseState.stopAt]);
  assert.deepEqual(voice.vibrato.stopCalls, [releaseState.stopAt]);
  assert.equal(voice.disconnected, false);
  assert.equal(completionCount, 0);

  voice.source.onended();

  assert.equal(voice.disconnected, true);
  assert.equal(voice.source.disconnectCount, 1);
  assert.equal(completionCount, 1);
});

test("release cancels scheduled automation before applying the target curve", () => {
  const context = createAudioContext({
    currentTime: 2,
    supportsCancelAndHold: false,
  });
  const voice = new HonkVoice({ context });
  voice.master.gain.value = 0.23;

  voice.release(0.03);

  assert.deepEqual(voice.master.gain.events.slice(-2), [
    { type: "cancelScheduledValues", time: 2 },
    { type: "setTargetAtTime", value: 0.0001, time: 2, timeConstant: 0.04 },
  ]);
  assert.deepEqual(voice.source.stopCalls, [2.03]);
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
  assert.equal(eventCount(voice.master.gain, "setTargetAtTime"), 1);
  assert.equal(voice.source.stopCalls.length, 1);
  assert.equal(voice.vibrato.stopCalls.length, 1);

  voice.source.onended();
  voice.source.onended();

  assert.equal(voice.source.disconnectCount, 1);
  assert.equal(firstCompletionCount, 1);
  assert.equal(secondCompletionCount, 0);
});

test("a source-stop error waits until the scheduled stop before fallback cleanup", async () => {
  const context = createAudioContext({ sourceStopThrows: true });
  const voice = new HonkVoice({ context });
  let completionCount = 0;

  const releaseState = voice.release(0, () => {
    completionCount += 1;
  });

  assert.equal(
    releaseState.stopAt,
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
  const context = {
    currentTime,
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
      return createAudioNode({ supportsCancelAndHold });
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
