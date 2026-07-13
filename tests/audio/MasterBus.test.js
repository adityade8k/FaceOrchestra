import test from "node:test";
import assert from "node:assert/strict";

import { MasterBus } from "../../src/audio/MasterBus.js";
import { AUDIO_MASTER_BUS_SETTINGS } from "../../src/config/audio.js";

class FakeAudioParam {
  constructor() {
    this.value = 0;
  }
}

class FakeAudioNode {
  constructor(type) {
    this.type = type;
    this.connections = [];
    this.disconnectCount = 0;
  }

  connect(target) {
    this.connections.push(target);
    return target;
  }

  disconnect() {
    this.connections.length = 0;
    this.disconnectCount += 1;
  }
}

class FakeGainNode extends FakeAudioNode {
  constructor() {
    super("gain");
    this.gain = new FakeAudioParam();
  }
}

class FakeBiquadFilterNode extends FakeAudioNode {
  constructor() {
    super("biquad");
    this.Q = new FakeAudioParam();
    this.frequency = new FakeAudioParam();
  }
}

class FakeDynamicsCompressorNode extends FakeAudioNode {
  constructor() {
    super("compressor");
    this.threshold = new FakeAudioParam();
    this.knee = new FakeAudioParam();
    this.ratio = new FakeAudioParam();
    this.attack = new FakeAudioParam();
    this.release = new FakeAudioParam();
  }
}

class FakeAudioContext {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.destination = new FakeAudioNode("destination");
    this.created = [];
  }

  createGain() {
    const node = new FakeGainNode();
    this.created.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new FakeBiquadFilterNode();
    this.created.push(node);
    return node;
  }

  createDynamicsCompressor() {
    const node = new FakeDynamicsCompressorNode();
    this.created.push(node);
    return node;
  }
}

test("MasterBus builds a filtered, compressed, and peak-limited signal chain", () => {
  const context = new FakeAudioContext();
  const bus = new MasterBus();

  assert.strictEqual(bus.initialize(context), bus.input);
  assert.deepEqual(bus.input.connections, [bus.lowpass]);
  assert.deepEqual(bus.lowpass.connections, [bus.compressor]);
  assert.deepEqual(bus.compressor.connections, [bus.makeup]);
  assert.deepEqual(bus.makeup.connections, [bus.limiter]);
  assert.deepEqual(bus.limiter.connections, [bus.output]);
  assert.deepEqual(bus.output.connections, [context.destination]);

  assert.equal(bus.input.gain.value, AUDIO_MASTER_BUS_SETTINGS.inputGain);
  assert.equal(bus.lowpass.type, "lowpass");
  assert.equal(bus.lowpass.frequency.value, AUDIO_MASTER_BUS_SETTINGS.lowpass.frequency);
  assert.equal(bus.lowpass.Q.value, AUDIO_MASTER_BUS_SETTINGS.lowpass.q);
  assert.equal(bus.makeup.gain.value, AUDIO_MASTER_BUS_SETTINGS.makeupGain);
  assert.equal(bus.output.gain.value, AUDIO_MASTER_BUS_SETTINGS.outputGain);
  assert.equal(bus.output.gain.value <= 1, true);
});

test("MasterBus applies compressor and limiter dynamics settings", () => {
  const bus = new MasterBus();
  bus.initialize(new FakeAudioContext());

  for (const [parameter, expected] of Object.entries(AUDIO_MASTER_BUS_SETTINGS.compressor)) {
    assert.equal(bus.compressor[parameter].value, expected);
  }
  for (const [parameter, expected] of Object.entries(AUDIO_MASTER_BUS_SETTINGS.limiter)) {
    assert.equal(bus.limiter[parameter].value, expected);
  }
});

test("MasterBus initialization is null-safe and idempotent for one context", () => {
  const context = new FakeAudioContext();
  const bus = new MasterBus();

  assert.equal(bus.initialize(null), null);
  const firstInput = bus.initialize(context);
  const createdCount = context.created.length;

  assert.strictEqual(bus.initialize(context), firstInput);
  assert.equal(context.created.length, createdCount);
  assert.equal(firstInput.disconnectCount, 0);
});

test("MasterBus disconnects the old graph when the audio context changes", () => {
  const firstContext = new FakeAudioContext();
  const secondContext = new FakeAudioContext();
  const bus = new MasterBus();
  bus.initialize(firstContext);
  const oldNodes = [
    bus.input,
    bus.lowpass,
    bus.compressor,
    bus.makeup,
    bus.limiter,
    bus.output,
  ];

  const secondInput = bus.initialize(secondContext);

  assert.notStrictEqual(secondInput, oldNodes[0]);
  assert.strictEqual(bus.context, secondContext);
  assert.deepEqual(bus.output.connections, [secondContext.destination]);
  for (const node of oldNodes) {
    assert.equal(node.disconnectCount, 1);
    assert.deepEqual(node.connections, []);
  }
});

test("MasterBus can reconnect after an explicit disconnect", () => {
  const context = new FakeAudioContext();
  const bus = new MasterBus();
  const firstInput = bus.initialize(context);

  bus.disconnect();

  assert.equal(bus.context, null);
  assert.equal(bus.input, null);
  assert.equal(firstInput.disconnectCount, 1);
  assert.notStrictEqual(bus.initialize(context), firstInput);
});

test("MasterBus keeps its low-pass cutoff below Nyquist on low-rate contexts", () => {
  const context = new FakeAudioContext(22050);
  const bus = new MasterBus();
  bus.initialize(context);

  assert.equal(bus.lowpass.frequency.value, context.sampleRate * 0.45);
});
