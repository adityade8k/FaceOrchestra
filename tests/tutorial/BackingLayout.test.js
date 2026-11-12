import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BackingLayout } from "../../src/tutorial/BackingLayout.js";
import { cueCanvas } from "../helpers/cueCanvas.js";

function fixture() {
  const scene = new THREE.Scene(),
    objects = new Map(),
    roles = new Map();
  const add = (role, kind, x, size = 0.8) => {
    const root = new THREE.Group();
    root.position.set(x, 1, -1);
    root.scale.setScalar(size);
    scene.add(root);
    const h = {
      id: role,
      kind,
      root,
      baseScale: size,
      timeline: { events: [1, 2, 3] },
      tracks: [{ connectedHonkId: "chord" }],
    };
    objects.set(role, h);
    roles.set(role, [role]);
    return h;
  };
  const melody = add("melody-C4", "honk", 2);
  const chord = add("chord", "honk", 0);
  roles.set("group-1", [chord.id]);
  const looper = add("chordLooper", "looper", -0.5, 0.45);
  add("metronome", "metronome", 0.5);
  const canvas = new EventTarget();
  canvas.hasPointerCapture = () => false;
  const synced = [],
    lockGroup = {
      captures: 0,
      captureRelativeTransforms() {
        this.captures++;
      },
    };
  const r = {
    scene,
    renderer: { domElement: canvas, xr: {} },
    controllerStates: new Map(),
    instrumentRegistry: { get: (id) => objects.get(id) },
    getTransformProfile: () => ({ minScale: 0.5, maxScale: 8 }),
    setInstrumentBaseScale(h, scale) {
      h.baseScale = scale;
      h.root.scale.setScalar(scale);
    },
    spawn: {
      syncLooperTransformReference(h) {
        synced.push(h.id);
      },
    },
    honkLockService: { getGroupForMember: (id) => (id === chord.id ? lockGroup : null) },
  };
  const host = {
    r,
    session: { phase: "ready", mode: "practice" },
    recording: { session: null },
    navigation: { screen: null },
    panel: {},
    adapter: {
      roles,
      layoutRotation: new THREE.Quaternion(),
      labelPresentation: {
        instrumentBounds: (h) =>
          new THREE.Box3().setFromCenterAndSize(h.root.position, new THREE.Vector3(0.2, 0.3, 0.2)),
      },
    },
  };
  const layout = new BackingLayout(host, { controls: false, createCanvas: cueCanvas });
  layout.update();
  return { layout, host, objects, add, melody, chord, looper, synced, lockGroup };
}

test("backing frame moves and rotates the complete assembly without moving melody or changing takes and routes", () => {
  const f = fixture(),
    frame = f.layout.frame;
  try {
    assert.equal(frame.members.length, 3);
    const melody = f.melody.root.position.clone();
    const timeline = f.looper.timeline,
      tracks = f.looper.tracks;
    const positions = frame.members.map((h) => h.root.position.clone());
    const delta = new THREE.Vector3(0.3, 0.2, -0.1);
    frame.apply(frame.root.position.clone().add(delta), 1);
    frame.members.forEach((h, i) =>
      assert.ok(h.root.position.distanceTo(positions[i].add(delta)) < 1e-8),
    );
    assert.equal(
      f.looper.baseScale,
      0.45,
      "A move preserves authored sizes below manual resize limits",
    );
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.5, 0.2));
    frame.apply(frame.root.position, 1.2, rotation);
    for (const pose of frame.poses)
      assert.ok(
        pose.h.root.position.distanceTo(pose.offset.clone().applyMatrix4(frame.root.matrixWorld)) <
          1e-8,
      );
    assert.deepEqual(f.melody.root.position.toArray(), melody.toArray());
    assert.equal(f.looper.timeline, timeline);
    assert.equal(f.looper.tracks, tracks);
    assert.ok(f.synced.includes(f.looper.id));
    assert.ok(f.lockGroup.captures > 0);
  } finally {
    f.layout.dispose();
  }
});

test("new pattern Loopers inherit the placed frame and removed members are not recreated by Reset", () => {
  const f = fixture(),
    frame = f.layout.frame;
  try {
    const delta = new THREE.Vector3(0.3, 0.1, -0.2);
    frame.apply(frame.root.position.clone().add(delta), 1);
    const added = f.add("alternativeLooper", "looper", -0.8);
    const original = added.root.position.clone();
    frame.placeCreated(added);
    f.layout.update();
    assert.equal(f.layout.frame, frame);
    assert.ok(added.root.position.distanceTo(original.clone().add(delta)) < 1e-8);
    assert.ok(frame.members.includes(added));
    f.objects.delete(f.looper.id);
    f.looper.disposed = true;
    f.layout.update();
    frame.reset();
    assert.ok(added.root.position.distanceTo(original) < 1e-8);
    assert.equal(f.objects.has(f.looper.id), false);
    assert.equal(frame.members.length, 3);
  } finally {
    f.layout.dispose();
  }
});

test("backing placement hides and cancels drags during playback and is disposed on mode exit", () => {
  const f = fixture(),
    frame = f.layout.frame;
  frame.drag = { pointerId: 7 };
  f.host.session.phase = "practicing";
  f.layout.update();
  assert.equal(frame.drag, null);
  assert.equal(frame.root.visible, false);
  f.host.session.phase = "ready";
  f.layout.update();
  assert.equal(frame.root.visible, true);
  f.host.session = null;
  f.layout.update();
  assert.equal(f.layout.frame, null);
  assert.equal(frame.root.parent, null);
});
