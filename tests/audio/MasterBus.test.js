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
  constructor() {
    this.destination = new FakeAudioNode("destination");
    this.created = [];
  }

  createGain() {
    const node = new FakeGainNode();
    this.created.push(node);
    return node;
  }

  createDynamicsCompressor() {
    const node = new FakeDynamicsCompressorNode();
    this.created.push(node);
    return node;
  }
}

test("master settings exactly match the Ver-5 gain staging and compressor", () => {
  assert.deepEqual(AUDIO_MASTER_BUS_SETTINGS, {
    inputGain: 0.9,
    outputGain: 0.82,
    compressor: {
      threshold: -18,
      knee: 18,
      ratio: 8,
      attack: 0.004,
      release: 0.18,
    },
  });
});

test("MasterBus builds exactly the Ver-5 input, compressor, and output chain", () => {
  const context = new FakeAudioContext();
  const bus = new MasterBus();

  assert.strictEqual(bus.initialize(context), bus.input);
  assert.deepEqual(bus.input.connections, [bus.compressor]);
  assert.deepEqual(bus.compressor.connections, [bus.output]);
  assert.deepEqual(bus.output.connections, [context.destination]);
  assert.deepEqual(context.created.map((node) => node.type), [
    "gain",
    "compressor",
    "gain",
  ]);

  assert.equal(bus.input.gain.value, AUDIO_MASTER_BUS_SETTINGS.inputGain);
  assert.equal(bus.input.gain.value, 0.9);
  assert.equal(bus.output.gain.value, 0.82);
  assert.equal("lowpass" in bus, false);
  assert.equal("makeup" in bus, false);
  assert.equal("limiter" in bus, false);
  assert.equal("lowpass" in AUDIO_MASTER_BUS_SETTINGS, false);
  assert.equal("makeupGain" in AUDIO_MASTER_BUS_SETTINGS, false);
  assert.equal("limiter" in AUDIO_MASTER_BUS_SETTINGS, false);
});

test("MasterBus applies the Ver-5 compressor dynamics settings", () => {
  const bus = new MasterBus();
  bus.initialize(new FakeAudioContext());

  for (const [parameter, expected] of Object.entries(AUDIO_MASTER_BUS_SETTINGS.compressor)) {
    assert.equal(bus.compressor[parameter].value, expected);
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
  const oldNodes = [bus.input, bus.compressor, bus.output];

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
