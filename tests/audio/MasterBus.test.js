import test from "node:test";
import assert from "node:assert/strict";

import { AudioSystem } from "../../src/audio/AudioSystem.js";
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

  createWaveShaper() {
    const node = new FakeAudioNode("waveshaper");
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
  assert.deepEqual(bus.limiter.connections, [bus.peakGuard]);
  assert.deepEqual(bus.peakGuard.connections, [bus.output]);
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
    bus.peakGuard,
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

test("live percussion avoids Honk makeup while sharing the final protected recording output", () => {
  const context = new FakeAudioContext(),
    bus = new MasterBus();
  bus.initialize(context);
  const audio = new AudioSystem({ masterBus: bus });
  assert.equal(audio.honkVoices.getDestination(context), bus.input, "Melody routing is unchanged");
  assert.equal(audio.percussionVoices.getDestination(context), bus.percussion.input);
  const nodes = [
    bus.percussion.input,
    bus.percussion.highpass,
    bus.percussion.lowpass,
    bus.percussion.compressor,
    bus.percussion.saturator,
    bus.limiter,
    bus.peakGuard,
    bus.output,
    context.destination,
  ];
  for (let i = 0; i < nodes.length - 1; i++) assert.deepEqual(nodes[i].connections, [nodes[i + 1]]);
  assert.ok(!nodes.includes(bus.makeup), "Percussion cannot enter the melody's 6.56x boost");
  assert.ok(bus.percussion.compressor.ratio.value < bus.compressor.ratio.value);
});

test("changing contexts releases every percussion processor and routes the next strikes to the new graph", () => {
  const bus = new MasterBus();
  bus.initialize(new FakeAudioContext());
  const previous = [
    bus.percussion.input,
    bus.percussion.highpass,
    bus.percussion.lowpass,
    bus.percussion.compressor,
    bus.percussion.saturator,
  ];
  bus.initialize(new FakeAudioContext(44100));
  assert.notEqual(bus.getInput("percussion"), previous[0]);
  for (const node of previous) {
    assert.equal(node.disconnectCount, 1);
    assert.deepEqual(node.connections, []);
  }
  bus.disconnect();
  assert.equal(bus.percussion.input, null);
});
