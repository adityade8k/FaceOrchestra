import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RishteLayoutFrame } from "../../src/tutorial/rishte/RishteLayoutFrame.js";
import { cueCanvas } from "../helpers/cueCanvas.js";

function fixture() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const canvas = new EventTarget(); canvas.hasPointerCapture = () => false;
  const instruments = new Map();
  for (const [i, role] of ["lead-R", "lead-L", "backing"].entries()) {
    const root = new THREE.Group(); root.position.set(i * .3, 1, -1); root.scale.setScalar(.85); scene.add(root);
    instruments.set(role, { id: role, root, baseScale: .85 });
  }
  const r = { scene, controllerStates: new Map(), renderer: { domElement: canvas, xr: {} }, getUserCamera: () => camera,
    getTransformProfile: () => ({ minScale: .5, maxScale: 8 }),
    setInstrumentBaseScale(h, value) { h.baseScale = value; h.root.scale.setScalar(value); },
    clearControllerTriggerInteraction() {}, handleGripEndIntent() {}, closeRadialMenu() {},
    raycastSystem: { getCurrentHit: () => null } };
  const a = { get: role => instruments.get(role), layoutRotation: new THREE.Quaternion(),
    labelPresentation: { instrumentBounds: h => new THREE.Box3().setFromCenterAndSize(h.root.position, new THREE.Vector3(.1, .2, .1)) } };
  const host = { panelHit: () => null, panel: {} };
  const ensemble = { a, r, host, definition: { arrangement: { recipes: [
    { role: "lead-R", hand: "R" }, { role: "lead-L", hand: "L" }, { role: "backing" },
  ] } }, hands: { update() {} } };
  const frame = new RishteLayoutFrame(ensemble, { createCanvas: cueCanvas, controls: false });
  return { frame, instruments, r };
}

test("melody frame moves hidden and visible targets together, scales spacing and sizes, and leaves backing alone", () => {
  const { frame, instruments } = fixture();
  try {
    const right = instruments.get("lead-R"), left = instruments.get("lead-L"), backing = instruments.get("backing");
    left.root.visible = false;
    const savedBacking = backing.root.position.clone(), start = right.root.position.clone();
    const delta = new THREE.Vector3(.2, .1, -.3);
    frame.apply(frame.home.clone().add(delta), 1);
    assert.ok(right.root.position.distanceTo(start.add(delta)) < 1e-9);
    frame.apply(frame.root.position, 1.5);
    assert.ok(Math.abs(left.root.position.distanceTo(right.root.position) - .45) < 1e-9);
    assert.equal(right.baseScale, .85 * 1.5); assert.equal(left.baseScale, .85 * 1.5);
    assert.deepEqual(backing.root.position.toArray(), savedBacking.toArray()); assert.equal(backing.baseScale, .85);
    assert.equal(frame.visualScaleFor("lead-R"), 1.5); assert.equal(frame.visualScaleFor("backing"), 1);
    frame.reset(); assert.equal(frame.scale, 1); assert.deepEqual(frame.root.position.toArray(), frame.home.toArray());
    assert.equal(left.root.visible, false, "Placement must not change phrase visibility");
  } finally { frame.dispose(); }
});

test("frame resize obeys instrument limits and playback freezes placement until stopped", () => {
  const { frame } = fixture();
  try {
    frame.apply(frame.home, .01); assert.equal(frame.scale, .6);
    frame.apply(frame.home, 50); assert.equal(frame.scale, 2);
    const pose = frame.root.position.clone();
    frame.setEnabled(false);
    assert.equal(frame.root.visible, false);
    assert.equal(frame.apply(new THREE.Vector3(4, 5, 6), 1), false);
    assert.deepEqual(frame.root.position.toArray(), pose.toArray()); assert.equal(frame.scale, 2);
    frame.setEnabled(true); assert.equal(frame.root.visible, true); assert.equal(frame.scale, 2);
  } finally { frame.dispose(); }
});

test("real XR intent capture owns a frame drag and scale steps until buttons are released", () => {
  const { frame, r } = fixture();
  const controller = new THREE.Group(); r.scene.add(controller);
  controller.position.copy(frame.moveHandle.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0, .7));
  const state = { grip: true, trigger: false, primary: false, secondary: false };
  r.controllerStates.set(controller, state);
  const intent = type => ({ type, controller, direction: 1 });
  try {
    assert.equal(frame.captureIntent(intent("interaction.grip.begin"), state), true);
    assert.equal(frame.drag.controller, controller); assert.equal(frame.blocked.has(controller), true);
    const start = frame.root.position.clone(); controller.position.x += .25; frame.update();
    assert.ok(Math.abs(frame.root.position.x - start.x - .25) < 1e-9);
    frame.captureIntent(intent("instrument.scale.horizontal.step"), state); assert.equal(frame.scale, 1.1);
    state.trigger = true; state.grip = false;
    frame.captureIntent(intent("interaction.grip.end"), state);
    assert.equal(frame.drag, null); assert.equal(frame.blocked.has(controller), true);
    state.trigger = false; frame.captureIntent(intent("interaction.trigger.end"), state);
    assert.equal(frame.blocked.has(controller), false);
    assert.equal(frame.scale, 1.1, "Releasing places the chosen layout");
  } finally { frame.dispose(); }
});

test("thumbstick resizing during a corner drag persists on the next frame and releases cleanly", () => {
  const { frame, r } = fixture();
  const controller = new THREE.Group(); r.scene.add(controller);
  const corner = frame.targets.find(h => h.userData.layoutHandle === "scale" && h.position.x > 0 && h.position.y > 0 && h.position.z > 0);
  controller.position.copy(corner.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0, .7));
  const state = { trigger: true };
  r.controllerStates.set(controller, state);
  try {
    assert.equal(frame.captureIntent({ type: "interaction.trigger.begin", controller }, state), true);
    assert.equal(frame.drag.kind, "scale");
    frame.captureIntent({ type: "instrument.scale.horizontal.step", controller, direction: 1 }, state);
    frame.update(); assert.equal(frame.scale, 1.1);
    controller.position.x += .1; frame.update(); assert.ok(frame.scale > 1.1);
    frame.setEnabled(false); assert.equal(frame.drag, null); assert.equal(frame.root.visible, false);
    state.trigger = false;
    frame.captureIntent({ type: "interaction.trigger.end", controller }, state);
    assert.equal(frame.blocked.size, 0);
  } finally { frame.dispose(); }
});
