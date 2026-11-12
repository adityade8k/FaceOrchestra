import { runtimeOwners } from "../helpers/runtimeOwners.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FaceOrchestraApp } from "../../src/app/FaceOrchestraApp.js";
import { PresentationCapture } from "../../src/capture/PresentationCapture.js";
import { CaptureRecorder } from "../../src/capture/CaptureRecorder.js";

test("capture runs once after runtime updates on normal and spawn-preview early exits", () => {
  for (const preview of [false, true]) {
    const order = [],
      frame = { xr: true };
    let callback;
    const runtime = new Proxy(
      {
        tutorial: null,
        pendingSpawnPlacement: preview,
        interactionCoordinator: { flushInputs() {} },
        honkContactSystem: { update() {} },
        stickCollisionSystem: { update() {} },
        getUserCamera: () => ({ getWorldPosition() {} }),
        capture: {
          sample(now, xr) {
            order.push("capture");
            assert.equal(now, 123);
            assert.equal(xr, frame);
          },
        },
        updateLooperPlaybackDuringPendingSpawn() {
          order.push("preview-playback");
        },
        updateHorn() {
          order.push("honk");
        },
      },
      { get: (object, key) => (key in object ? object[key] : () => {}) },
    );
    runtime.spawn = {
      pendingSpawnPlacement: preview,
      updateRadialMenus() {},
      updatePendingSpawnPreview() {},
      updateLooperPlaybackDuringPendingSpawn() {
        order.push("preview-playback");
      },
    };
    runtime.looperConnections = new Proxy({}, { get: () => () => {} });
    runtime.metronomeConnections = new Proxy({}, { get: () => () => {} });
    runtime.presentation = new Proxy({}, { get: () => () => {} });
    const sceneRuntime = {
      start() {},
      renderer: {
        setAnimationLoop(fn) {
          callback = fn;
        },
      },
      render() {
        order.push("render");
      },
    };
    const app = new FaceOrchestraApp({ runtime, sceneRuntime });
    app.start();
    callback(123, frame);
    assert.deepEqual(
      order,
      preview ? ["preview-playback", "capture", "render"] : ["honk", "capture", "render"],
    );
  }
});
test("presentation cache captures world roots, local child animation, morphs and equipped parent transforms", () => {
  const scene = new THREE.Scene(),
    controller = new THREE.Group();
  controller.position.set(2, 1, 0);
  scene.add(controller);
  const root = new THREE.Group(),
    child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  controller.add(root);
  root.position.set(0.1, 0.2, 0);
  root.scale.setScalar(1.2);
  child.position.y = 0.3;
  child.morphTargetInfluences = [0.7];
  root.add(child);
  const entity = { id: "stick", kind: "stick", root, equipped: true },
    registry = new Map([["stick", entity]]),
    events = [];
  const capture = new PresentationCapture(
    { scene, instrumentRegistry: registry, controllers: [] },
    (kind, data, t) => events.push({ kind, data, t }),
  );
  const first = capture.sample(0),
    floats = new Float32Array(first.buffer),
    rootNode = first.nodes[0],
    childNode = first.nodes[1];
  assert.ok(Math.abs(floats[rootNode.offset] - 2.1) < 1e-6);
  assert.ok(Math.abs(floats[childNode.offset + 1] - 0.3) < 1e-6);
  assert.ok(Math.abs(floats[childNode.offset + 11] - 0.7) < 1e-6);
  capture.recycle(first.buffer);
  const second = capture.sample(0.1);
  assert.equal(second.buffer, first.buffer);
  assert.equal(events.filter((e) => e.kind === "node").length, 2);
  controller.visible = false;
  const lost = capture.sample(0.15);
  assert.equal(new Float32Array(lost.buffer)[lost.nodes[0].offset + 10], 0);
  controller.visible = true;
  root.remove(child);
  capture.sample(0.2);
  assert.equal(capture.bindings.length, 1);
  registry.clear();
  capture.sample(0.3);
  assert.equal(capture.bindings.length, 0);
  assert.equal(events.at(-1).kind, "delete");
});
test("native XR recording distinguishes grip/ray, actual handedness and loss; reset terminates the segment", () => {
  const oldDocument = globalThis.document;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  try {
    const scene = new THREE.Scene(),
      reference = new EventTarget(),
      source = {
        handedness: "right",
        profiles: ["actual-profile"],
        gripSpace: { name: "grip" },
        targetRaySpace: { name: "ray" },
        gamepad: { buttons: [{ value: 0.5, pressed: false, touched: true }], axes: [0.2, -0.3] },
      };
    const runtime = runtimeOwners({
      scene,
      instrumentRegistry: new Map(),
      controllers: [],
      audioSystem: {},
      renderer: { xr: { getReferenceSpace: () => reference } },
    });
    const recorder = new CaptureRecorder(runtime),
      messages = [];
    recorder.worker = { postMessage: (m) => messages.push(m) };
    recorder.active = true;
    recorder.state = "recording";
    recorder.origin = 100;
    recorder.last = -Infinity;
    recorder.gaps = [];
    recorder.metrics = { frames: 0, totalMs: 0, maxMs: 0 };
    recorder.presentation = new PresentationCapture(runtime, () => {});
    const pose = (x) => ({
      transform: { position: { x, y: 1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    const frame = {
      session: { inputSources: [source] },
      getViewerPose: () => pose(0),
      getPose: (space) => (space.name === "grip" ? pose(1) : pose(4)),
    };
    recorder.sample(200, frame);
    recorder.sample(200, frame);
    assert.equal(messages.length, 1);
    const c = messages[0].xr.controllers[0];
    assert.equal(c.handedness, "right");
    assert.equal(c.grip.p[0], 1);
    assert.equal(c.ray.p[0], 4);
    frame.getPose = () => null;
    recorder.sample(220, frame);
    assert.equal(messages[1].xr.controllers[0].grip, null);
    let reason;
    recorder.stop = (value) => {
      reason = value;
      recorder.active = false;
    };
    recorder.onSession(new EventTarget());
    reference.dispatchEvent(new Event("reset"));
    assert.equal(reason, "reference-space-reset");
  } finally {
    globalThis.document = oldDocument;
  }
});
test("prepared scenes batch small resources and drain without dropping detail", async () => {
  const scene = new THREE.Scene(),
    root = new THREE.Group();
  scene.add(root);
  for (let i = 0; i < 3; i++)
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1 + i), new THREE.MeshBasicMaterial()));
  const capture = new PresentationCapture(
    {
      scene,
      instrumentRegistry: new Map([["scene", { id: "scene", kind: "honk", root }]]),
      controllers: [],
    },
    () => {},
  );
  const sample = capture.sample(0);
  capture.recycle(sample.buffer);
  const total = capture.pending.length,
    emitted = [],
    barriers = [];
  capture.emit = (kind, data) => {
    if (kind === "resource") emitted.push(data);
  };
  const recorder = Object.create(CaptureRecorder.prototype);
  recorder.presentation = capture;
  recorder.notify = () => {};
  recorder.worker = {
    postMessage(message) {
      assert.equal(message.type, "barrier");
      barriers.push(recorder.drainReady);
    },
  };
  const ready = recorder.prepareResources();
  assert.ok(emitted.length > 1, "Small resources share a receiver round trip");
  while (emitted.length < total) {
    const before = emitted.length;
    barriers.shift()();
    await Promise.resolve();
    assert.ok(emitted.length > before);
  }
  barriers.shift()();
  await ready;
  assert.equal(new Set(emitted.map((e) => e.id)).size, total);
  assert.equal(capture.pending.length, 0);
  root.traverse((node) => {
    node.geometry?.dispose();
    node.material?.dispose();
  });
});
test("interrupted preparation does not enqueue another resource", async () => {
  const recorder = Object.create(CaptureRecorder.prototype),
    sent = [];
  recorder.presentation = {
    pending: [1, 2],
    flushResources() {
      sent.push(this.pending.shift());
    },
  };
  recorder.worker = { postMessage() {} };
  recorder.notify = () => {};
  const ready = recorder.prepareResources();
  recorder.startCancelled = "interrupted";
  recorder.drainReady();
  await assert.rejects(ready, /interrupted/);
  assert.deepEqual(sent, [1]);
});

test("bounded resource batches isolate large payloads and resume without encoding twice", () => {
  const emitted = [],
    encoded = [];
  const p = Object.create(PresentationCapture.prototype);
  p.pending = [
    { id: "a", text: "a".repeat(16) },
    { id: "b", text: "b".repeat(200) },
    { id: "c", text: "c".repeat(16) },
  ];
  p.encodeResource = (item) => {
    encoded.push(item.id);
    return { id: item.id, data: item.text };
  };
  p.emit = (_kind, data) => emitted.push(data.id);
  p.flushResources(0, { maxBytes: 128 });
  assert.deepEqual(emitted, ["a"]);
  p.flushResources(0, { maxBytes: 128 });
  assert.deepEqual(emitted, ["a", "b"]);
  p.flushResources(0, { maxBytes: 128 });
  assert.deepEqual(emitted, ["a", "b", "c"]);
  assert.deepEqual(encoded, ["a", "b", "c"]);
});

test("short sample-worker stalls retain every frame, recycle memory, and stay bounded", () => {
  const oldDocument = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try {
    const recorder = new CaptureRecorder({
      audioSystem: {},
      renderer: { xr: { getReferenceSpace: () => null } },
    });
    const sent = [];
    recorder.active = recorder.synthetic = true;
    recorder.resourceFlush = true;
    recorder.origin = 1;
    recorder.last = -Infinity;
    recorder.gaps = [];
    recorder.metrics = { frames: 0, totalMs: 0, maxMs: 0 };
    recorder.presentation = {
      sample: () => ({ buffer: new ArrayBuffer(1024), nodes: [], semantic: [] }),
      recycle() {},
    };
    recorder.worker = { postMessage: (m) => sent.push(m) };
    recorder.stop = () => {
      recorder.active = false;
    };
    for (let i = 1; i <= 12; i++) recorder.sample(i * 8);
    assert.equal(recorder.active, true);
    assert.equal(sent.length, 12);
    assert.equal(recorder.gaps.length, 0);
    assert.equal(recorder.inflightBytes, 12 * 1024);
    for (const m of sent) recorder.onWorker({ type: "recycle", buffer: m.buffer });
    assert.equal(recorder.inflight, 0);
    assert.equal(recorder.inflightBytes, 0);
    for (let i = 13; i <= 45; i++) recorder.sample(i * 8);
    assert.equal(sent.length, 44);
    assert.equal(recorder.active, false);
    assert.equal(recorder.gaps[0].reason, "sample-worker-backpressure");
    recorder.active = true;
    recorder.inflight = 0;
    recorder.inflightBytes = 8 * 1024 * 1024;
    recorder.sample(500);
    assert.equal(recorder.active, false);
    assert.equal(sent.length, 44);
    assert.equal(recorder.gaps.at(-1).reason, "sample-memory-limit");
  } finally {
    globalThis.document = oldDocument;
  }
});
