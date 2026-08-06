import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { HonkVoice } from "../../src/audio/honk/HonkVoice.js";
import {
  getHonkNoteGainFromNose,
  HONK_AUTOMATION_SETTINGS,
  HONK_NOTE_GAIN_SETTINGS,
  VOICE_GAIN_SETTINGS,
} from "../../src/config/audio.js";

test("nose controls note volume without changing the formant graph", () => {
  assert.equal(getHonkNoteGainFromNose(0), 1);
  assert.equal(getHonkNoteGainFromNose(1), HONK_NOTE_GAIN_SETTINGS.minimumAtMaxNose);
  const context = createAudioContext({ currentTime: 3 });
  const voice = new HonkVoice({ context });
  const filterCount = context.filters.length;
  voice.update({ hornAmount: 1, masterGain: 0.5, noteGain: 0.25 });
  const gainRamp = lastEventOfType(voice.master.gain, "linearRampToValueAtTime");
  assert.ok(Math.abs(gainRamp.value - VOICE_GAIN_SETTINGS.baseGain * 0.5 * 0.25) < 1e-12);
  assert.equal(gainRamp.time, 3 + HONK_AUTOMATION_SETTINGS.gateAttackSeconds);
  assert.equal(context.filters.length, filterCount);
});

test("rapid note-off and retrigger reuse one graph with click-safe automation", () => {
  const context = createAudioContext({ currentTime: 4 });
  const voice = new HonkVoice({ context });
  voice.start();
  voice.update({ hornAmount: 1, masterGain: 1, noteGain: 1 });
  voice.update({ hornAmount: 0, masterGain: 1, noteGain: 1 });
  voice.update({ hornAmount: 1, masterGain: 1, noteGain: 1 });
  const eventCount = voice.master.gain.events.length;
  voice.update({ hornAmount: 1, masterGain: 1, noteGain: 1 });

  assert.equal(voice.source.startCalls.length, 1);
  assert.equal(voice.source.stopCalls.length, 0);
  assert.equal(voice.vibrato.stopCalls.length, 0);
  assert.equal(voice.master.gain.events.length, eventCount);
  assert.equal(eventCountOfType(voice.master.gain, "cancelAndHoldAtTime"), 3);
  assert.equal(lastEventOfType(voice.master.gain, "linearRampToValueAtTime").value > 0, true);
});

test("zero-gap retrigger tokens schedule one short dezipper without rebuilding", () => {
  const context = createAudioContext({ currentTime: 5 });
  const voice = new HonkVoice({ context });
  voice.start();
  voice.update({ hornAmount: 1, masterGain: 1, noteGain: 1, retriggerToken: 0 });
  const beforeRetrigger = voice.master.gain.events.length;
  voice.update({ hornAmount: 1, masterGain: 1, noteGain: 1, retriggerToken: 1 });
  const retriggerEvents = voice.master.gain.events.slice(beforeRetrigger);
  assert.deepEqual(retriggerEvents, [
    { type: "cancelAndHoldAtTime", time: 5 },
    {
      type: "linearRampToValueAtTime",
      value: 0.0001,
      time: 5 + HONK_AUTOMATION_SETTINGS.retriggerDipSeconds,
    },
    {
      type: "linearRampToValueAtTime",
      value: VOICE_GAIN_SETTINGS.baseGain,
      time: 5 + HONK_AUTOMATION_SETTINGS.retriggerDipSeconds +
        HONK_AUTOMATION_SETTINGS.gateAttackSeconds,
    },
  ]);
  const afterRetrigger = voice.master.gain.events.length;
  voice.update({ hornAmount: 1, masterGain: 1, noteGain: 1, retriggerToken: 1 });
  assert.equal(voice.master.gain.events.length, afterRetrigger);
  assert.equal(voice.source.startCalls.length, 1);
  assert.equal(voice.source.stopCalls.length, 0);
});

test("automation fallback anchors the current gain before a release ramp", () => {
  const context = createAudioContext({ currentTime: 2, supportsCancelAndHold: false });
  const voice = new HonkVoice({ context });
  voice.update({ hornAmount: 1, masterGain: 1, noteGain: 1 });
  voice.master.gain.value = 0.23;
  voice.update({ hornAmount: 0, masterGain: 1, noteGain: 1 });
  assert.deepEqual(voice.master.gain.events.slice(-3), [
    { type: "cancelScheduledValues", time: 2 },
    { type: "setValueAtTime", value: 0.23, time: 2 },
    { type: "linearRampToValueAtTime", value: 0, time: 2.01 },
  ]);
});

test("vowel changes crossfade formant banks and retire old nodes", async () => {
  const context = createAudioContext();
  const voice = new HonkVoice({ context, vowel: "A" });
  const oldBank = voice.currentBank;
  voice.setVowel("E");
  assert.notStrictEqual(voice.currentBank, oldBank);
  assert.equal(voice.retiringBanks.has(oldBank), true);
  assert.equal(lastEventOfType(oldBank.output.gain, "linearRampToValueAtTime").value, 0);
  assert.equal(lastEventOfType(voice.currentBank.output.gain, "linearRampToValueAtTime").value, 1);
  await delay(25);
  assert.equal(voice.retiringBanks.size, 0);
  assert.equal(oldBank.output.disconnectCount, 1);
});

test("ordinary release keeps the graph alive; disposal is the only stop path", () => {
  const context = createAudioContext();
  const voice = new HonkVoice({ context });
  voice.start();
  voice.update({ hornAmount: 1, masterGain: 1, noteGain: 1 });
  const result = voice.release(0.01);
  assert.equal(result.persistent, true);
  assert.equal(voice.source.stopCalls.length, 0);
  voice.dispose();
  assert.equal(voice.source.stopCalls.length, 1);
  assert.equal(voice.vibrato.stopCalls.length, 1);
});

function createAudioContext({ currentTime = 0, supportsCancelAndHold = true } = {}) {
  const oscillators = [];
  const filters = [];
  return {
    currentTime,
    filters,
    destination: createAudioNode({ supportsCancelAndHold }),
    createOscillator() {
      const node = createAudioNode({ supportsCancelAndHold });
      node.startCalls = [];
      node.stopCalls = [];
      node.start = (time) => node.startCalls.push(time);
      node.stop = (time) => node.stopCalls.push(time);
      oscillators.push(node);
      return node;
    },
    createBiquadFilter() {
      const filter = createAudioNode({ supportsCancelAndHold });
      filters.push(filter);
      return filter;
    },
    createGain() { return createAudioNode({ supportsCancelAndHold }); },
  };
}

function createAudioNode({ supportsCancelAndHold = true } = {}) {
  return {
    connect() {},
    disconnectCount: 0,
    disconnect() { this.disconnectCount += 1; },
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
    setValueAtTime(value, time) { this.value = value; this.events.push({ type: "setValueAtTime", value, time }); },
    linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ type: "linearRampToValueAtTime", value, time }); },
    cancelScheduledValues(time) { this.events.push({ type: "cancelScheduledValues", time }); },
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

function eventCountOfType(param, type) {
  return param.events.filter((event) => event.type === type).length;
}
