import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { LIMITS, STREAMS } from "../../src/capture/format.js";
import { PresentationCapture } from "../../src/capture/PresentationCapture.js";
import { ReplayScene } from "../../src/capture/ReplayScene.js";
import { Timeline } from "../../src/capture/Timeline.js";
import { updateWireMeshGeometry } from "../../src/instruments/looper/view/wireUtils.js";
const source = (
  await readFile(new URL("../../src/capture/stream-worker.js", import.meta.url), "utf8")
).replace(/^import[^\n]+\n/, "");
async function harness(limits = LIMITS) {
  const sockets = [],
    outputs = [],
    timeouts = [];
  class Socket {
    constructor() {
      this.readyState = 1;
      this.bufferedAmount = 0;
      this.sent = [];
      sockets.push(this);
    }
    send(text) {
      this.sent.push(JSON.parse(text));
    }
    close() {
      this.onclose?.();
    }
  }
  const self = { postMessage: (value) => outputs.push(value), close() {} };
  vm.runInNewContext(source, {
    LIMITS: limits,
    STREAMS,
    self,
    WebSocket: Socket,
    setInterval() {},
    setTimeout: (fn) => timeouts.push(fn),
    clearTimeout() {},
    btoa: (text) => Buffer.from(text, "binary").toString("base64"),
    Float32Array,
    Uint8Array,
    DataView,
    console,
  });
  const send = (data) => self.onmessage({ data });
  await send({ type: "start", metadata: { id: "worker-test" }, url: "ws://local" });
  const ready = (socket, last = { samples: -1, events: -1, audio: -1 }) => {
    socket.onopen();
    socket.onmessage({ data: JSON.stringify({ type: "ready", last }) });
  };
  ready(sockets[0]);
  return { send, sockets, outputs, timeouts, ready };
}
const sample = (t) => ({
  type: "sample",
  t,
  sourceTime: 1000 + t * 1000,
  segment: 0,
  buffer: new Float32Array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]).buffer,
  nodes: [{ id: "honk/n1", offset: 0, length: 11, morphs: 0, materials: [], geometry: null }],
  semantic: [],
  xr: { viewer: null, controllers: [] },
});
test("worker delta compression, periodic full samples, independent sequences and PCM conversion", async () => {
  const h = await harness();
  await h.send(sample(0));
  await h.send(sample(0.1));
  await h.send(sample(1.1));
  await h.send({
    type: "audio",
    sceneTime: 0.2,
    frames: 1,
    sampleIndex: 0,
    contextFrame: 48000,
    buffer: new Float32Array([0.5, -0.5]).buffer,
  });
  const packets = h.sockets[0].sent.filter((m) => m.type === "packet").map((m) => m.packet),
    samples = packets.filter((p) => p.stream === "samples");
  assert.deepEqual(
    samples.map((p) => p.seq),
    [0, 1, 2],
  );
  assert.equal(samples[0].data.full, true);
  assert.deepEqual(Object.keys(samples[1].data.nodes), []);
  assert.equal(samples[2].data.full, true);
  const audio = packets.find((p) => p.stream === "audio");
  assert.equal(audio.seq, 0);
  const pcm = Buffer.from(audio.data.pcm, "base64");
  assert.equal(pcm.readInt16LE(0), 16384);
  assert.equal(pcm.readInt16LE(2), -16384);
});
test("reused wire geometry records moving paths and radius changes through delta compression and reverse replay", async () => {
  const h = await harness(),
    scene = new THREE.Scene(),
    wire = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()),
    events = [];
  wire.name = "LOOPER_wire_fixture";
  scene.add(wire);
  const capture = new PresentationCapture(
    { scene, instrumentRegistry: new Map(), controllers: [] },
    (kind, data, t) => events.push({ type: "event", kind, data, t }),
  );
  const start = new THREE.Vector3(0, 1, 0),
    end = new THREE.Vector3(1, 1, 0),
    settings = { minTubularSegments: 24, maxTubularSegments: 24, radius: 0.008 },
    expected = [];
  let geometry;
  for (let i = 0; i < 4; i++) {
    if (i === 1) end.set(1.2, 1.5, 0.3);
    if (i === 2) settings.radius = 0.014;
    updateWireMeshGeometry(wire, start, end, { settings });
    geometry ||= wire.geometry;
    assert.equal(wire.geometry, geometry);
    expected.push(wire.geometry.attributes.position.array.slice());
    const state = capture.sample(i / 10);
    assert.equal(
      state.nodes[0].geometry,
      null,
      "procedural wires bypass cached geometry resources",
    );
    capture.flushResources(i / 10);
    for (const event of events.splice(0)) await h.send(event);
    await h.send({ ...sample(i / 10), ...state });
    capture.recycle(state.buffer);
  }
  const packets = h.sockets[0].sent.filter((m) => m.type === "packet").map((m) => m.packet),
    samples = packets.filter((p) => p.stream === "samples"),
    recordedEvents = packets.filter((p) => p.stream === "events");
  assert.deepEqual(
    samples.map((p) => Object.keys(p.data.nodes).length),
    [1, 1, 1, 0],
  );
  const timeline = new Timeline(samples, recordedEvents),
    replay = new ReplayScene({});
  try {
    await replay.load(recordedEvents);
    for (const index of [0, 1, 2, 3, 1, 0]) {
      replay.apply(timeline.seek(index / 10));
      const node = [...replay.nodes.values()][0];
      assert.equal(node.visible, true);
      assert.deepEqual(node.geometry.attributes.position.array, expected[index]);
    }
  } finally {
    replay.dispose();
    wire.geometry.dispose();
    wire.material.dispose();
  }
});
test("worker resumes only unacknowledged packets and retries finalization when its reply is lost", async () => {
  const h = await harness();
  await h.send(sample(0));
  await h.send(sample(0.1));
  h.sockets[0].onclose();
  h.timeouts.pop()();
  h.ready(h.sockets[1], { samples: 0, events: 0, audio: -1 });
  const pending = h.sockets[1].sent.filter((m) => m.type === "packet");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].packet.seq, 1);
  h.sockets[1].onmessage({ data: JSON.stringify({ type: "ack", stream: "samples", seq: 1 }) });
  await h.send({ type: "finish", reason: "stop", duration: 0.2 });
  assert.equal(h.sockets[1].sent.at(-1).type, "finish");
  h.sockets[1].onclose();
  h.timeouts.pop()();
  h.ready(h.sockets[2], { samples: 1, events: 0, audio: -1 });
  assert.equal(h.sockets[2].sent.at(-1).type, "finish");
});
test("bounded queue overflow reports its exact interval and cannot finalize complete", async () => {
  const h = await harness({ ...LIMITS, queue: 2000 });
  await h.send({ type: "event", kind: "too-large", t: 2, data: { text: "x".repeat(2000) } });
  assert.equal(h.outputs.find((m) => m.type === "overflow").gap.start, 2);
  await h.send({ type: "finish", reason: "capture-error", duration: 2.5 });
  const finish = h.sockets[0].sent.at(-1);
  assert.equal(finish.type, "finish");
  assert.equal(finish.gaps[0].end, 2.5);
  assert.equal(finish.expected.events, -1);
});

test("performance resource barrier waits for receiver acknowledgments before audio starts", async () => {
  const h = await harness();
  await h.send({
    type: "event",
    kind: "resource",
    t: 0,
    data: { id: "r1", kind: "geometry", data: "prepared" },
  });
  await h.send({ type: "barrier" });
  assert.ok(!h.outputs.some((m) => m.type === "drained"));
  const socket = h.sockets[0];
  socket.onmessage({ data: JSON.stringify({ type: "ack", stream: "events", seq: 0 }) });
  assert.equal(h.outputs.filter((m) => m.type === "drained").length, 1);
});

test("finalized notification follows local spool cleanup and never causes a reconnect", async () => {
  const h = await harness();
  await h.send({ type: "finish", reason: "stop", duration: 1 });
  h.sockets[0].onmessage({
    data: JSON.stringify({ type: "finalized", metadata: { complete: true, id: "worker-test" } }),
  });
  assert.equal(h.outputs.filter((m) => m.type === "finalized").length, 0);
  await Promise.resolve();
  assert.equal(h.outputs.filter((m) => m.type === "finalized").length, 1);
  assert.equal(h.timeouts.length, 0);
});
