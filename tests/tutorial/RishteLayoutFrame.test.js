import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MelodyLayoutFrame } from "../../src/tutorial/MelodyLayoutFrame.js";
import { MelodyHands } from "../../src/tutorial/MelodyHands.js";
import { definition as nazariya } from "../../src/compositions/nazariya-honk-bends.js";
import { cueCanvas } from "../helpers/cueCanvas.js";

function fixture(definition) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const canvas = new EventTarget(); canvas.hasPointerCapture = () => false;
  const instruments = new Map();
  const roles = definition?.arrangement.recipes.filter(p => p.kind === "honk").map(p => p.role) || ["lead-R", "lead-L", "backing"];
  for (const [i, role] of roles.entries()) {
    const root = new THREE.Group(); root.position.set(i * .3, 1, -1); root.scale.setScalar(.85); scene.add(root);
    instruments.set(role, { id: role, root, baseScale: .85,
      getSqueezeColliderSphere: () => ({ center: root.getWorldPosition(new THREE.Vector3()), radius: .1 }) });
  }
  const r = { scene, controllerStates: new Map(), renderer: { domElement: canvas, xr: {} }, getUserCamera: () => camera,
    getTransformProfile: () => ({ minScale: .5, maxScale: 8 }),
    setInstrumentBaseScale(h, value) { h.baseScale = value; h.root.scale.setScalar(value); },
    clearControllerTriggerInteraction() {}, handleGripEndIntent() {}, closeRadialMenu() {},
    raycastSystem: { getCurrentHit: () => null } };
  const a = { roles: new Map(), get: role => instruments.get(role), layoutRotation: new THREE.Quaternion(),
    virtuals: [new THREE.Group(), new THREE.Group()], input() {}, park() {},
    labelPresentation: { styleNote(h) { h.noteStyled = true; }, instrumentBounds: h => new THREE.Box3().setFromCenterAndSize(h.root.position, new THREE.Vector3(.1, .2, .1)) } };
  const host = { panelHit: () => null, panel: {} };
  const ensemble = { a, r, host, definition: definition || { score: { events: [{ role: "lead-R" }, { role: "lead-L" }] }, arrangement: { recipes: [
    { role: "lead-R", kind: "honk", midi: 60 }, { role: "lead-L", kind: "honk", hand: "L", midi: 64 }, { role: "backing", kind: "honk" },
  ] } }, hands: { update() {} } };
  const frame = new MelodyLayoutFrame(ensemble, { createCanvas: cueCanvas, controls: false });
  return { frame, instruments, r, ensemble };
}

test("all ten Nazariya Honks follow the frame and have indicators, including the two bend-only pitches", () => {
  const { frame, instruments, ensemble } = fixture(nazariya);
  ensemble.layoutFrame = frame;
  const hands = ensemble.hands = new MelodyHands(ensemble);
  const used = new Set(nazariya.score.events.map(e => e.role));
  const unused = [...instruments.keys()].filter(role => !used.has(role));
  try {
    assert.deepEqual(unused, ["lead-62", "lead-71"]);
    assert.equal(frame.members.length, 10);
    assert.deepEqual([...hands.labels.keys()], [...instruments.keys()]);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.2, .4, -.1));
    frame.apply(frame.home.clone().add(new THREE.Vector3(.3, -.1, -.2)), 1.3, rotation);
    for (const pose of frame.poses) {
      const square = hands.labels.get(pose.recipe.role);
      assert.ok(pose.h.root.position.distanceTo(pose.offset.clone().applyMatrix4(frame.root.matrixWorld)) < 1e-9);
      assert.equal(pose.h.baseScale, .85 * 1.3);
      assert.equal(square.visible, true);
      assert.ok(Math.abs(square.scale.x - .055 * .8 * 1.3) < 1e-9);
      const expected = pose.h.root.position.clone().add(new THREE.Vector3(.07, .07, 0).multiplyScalar(1.3).applyQuaternion(rotation));
      assert.ok(square.position.distanceTo(expected) < 1e-9, "Indicator follows its Honk through the frame transform");
    }
    const event = nazariya.score.events[0];
    hands.update(nazariya.score.events, event.beat + event.beats / 2);
    assert.equal(hands.labels.get(event.role).material.opacity, 1);
    for (const role of unused) {
      const square = hands.labels.get(role);
      assert.equal(square.userData.activeNote, false, "A bend target never asks for a new press");
      assert.equal(square.children[0].visible, true);
      assert.equal(square.children[0].material.color.getHex(), 0xffffff);
      assert.equal(square.children[0].material.opacity, .25);
    }
    frame.reset();
    assert.equal(frame.members.length, 10);
    for (const pose of frame.poses) assert.ok(pose.h.root.position.distanceTo(pose.home.offset.clone().applyMatrix4(frame.root.matrixWorld)) < 1e-9);
  } finally { hands.dispose(); frame.dispose(); }
});

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
    assert.equal(left.root.visible, true, "Reset restores the complete visible layout");
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


test("individual Honk position, rotation and size edits survive later frame transforms and resizing", () => {
  const { frame, instruments, r } = fixture();
  try {
    const h = instruments.get("lead-R"), backing = instruments.get("backing");
    const backingMatrix = backing.root.matrix.clone();
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.25, .6, -.2));
    frame.apply(frame.home.clone().add(new THREE.Vector3(.1, .2, .3)), 1.2, rotation);
    h.root.position.add(new THREE.Vector3(.17, -.08, .21));
    h.root.rotateX(.45); r.setInstrumentBaseScale(h, 1.15);
    const local = frame.root.worldToLocal(h.root.position.clone());
    const orientation = frame.root.quaternion.clone().invert().multiply(h.root.quaternion);
    const size = h.baseScale / frame.scale;
    for (const scale of [1.4, .9, 1.2]) {
      rotation.setFromEuler(new THREE.Euler(-.4, .2 * scale, .35));
      frame.apply(frame.root.position.clone().add(new THREE.Vector3(.1, -.05, -.1)), scale, rotation);
      assert.ok(frame.root.worldToLocal(h.root.position.clone()).distanceTo(local) < 1e-9);
      assert.ok(frame.root.quaternion.clone().invert().multiply(h.root.quaternion).angleTo(orientation) < 1e-7);
      assert.ok(Math.abs(h.baseScale - size * scale) < 1e-9);
      assert.ok(backing.root.matrix.equals(backingMatrix));
    }
  } finally { frame.dispose(); }
});

test("XR grab rotates the entire frame around the controller and regrabs without snapping", () => {
  const { frame, r } = fixture(), controller = new THREE.Group(); r.scene.add(controller);
  const state = { grip: true }; r.controllerStates.set(controller, state);
  try {
    for (const angle of [Math.PI / 2, -.4]) {
      frame.root.updateMatrixWorld(true);
      controller.quaternion.copy(frame.root.quaternion);
      controller.position.copy(frame.moveHandle.getWorldPosition(new THREE.Vector3()))
        .add(new THREE.Vector3(0, 0, .7).applyQuaternion(controller.quaternion));
      state.grip = true;
      assert.equal(frame.captureIntent({ type: "interaction.grip.begin", controller }, state), true);
      const start = frame.root.position.clone(), pivot = controller.position.clone(), rotation = frame.root.quaternion.clone();
      const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      frame.update(); assert.ok(frame.root.position.distanceTo(start) < 1e-9, "Grab has no jump");
      controller.quaternion.premultiply(turn); frame.update();
      assert.ok(frame.root.position.distanceTo(start.sub(pivot).applyQuaternion(turn).add(pivot)) < 1e-9);
      assert.ok(frame.root.quaternion.angleTo(rotation.premultiply(turn)) < 1e-7);
      for (const pose of frame.poses) assert.ok(pose.h.root.quaternion.angleTo(frame.root.quaternion) < 1e-7);
      frame.captureIntent({ type: "instrument.scale.horizontal.step", direction: 1, controller }, state);
      const size = frame.scale; frame.update(); assert.equal(frame.scale, size);
      state.grip = false; frame.captureIntent({ type: "interaction.grip.end", controller }, state);
    }
  } finally { frame.dispose(); }
});

test("Reset recreates deleted Honks, restores original poses and bindings, and does not duplicate survivors", () => {
  const { frame, instruments, r } = fixture();
  let created = 0;
  r.createSpawnedComponent = (kind, options) => {
    const root = new THREE.Group(); r.scene.add(root);
    const h = { id: 'recovered-' + ++created, kind, root, baseScale: options.baseScale, tuning: options.tuning };
    instruments.set(options.name, h); r.activeInstrumentState = h; return root;
  };
  try {
    const removed = instruments.get("lead-L"), survivor = instruments.get("lead-R");
    frame.apply(new THREE.Vector3(1, 2, -3), 1.4, new THREE.Quaternion().setFromEuler(new THREE.Euler(.4, .8, .2)));
    removed.disposed = true; removed.root.removeFromParent(); instruments.delete("lead-L");
    frame.apply(new THREE.Vector3(2, 1, -2), 1.1); assert.equal(created, 0, "Movement alone does not undo a deletion");
    assert.equal(frame.reset(), true);
    const restored = instruments.get("lead-L");
    assert.equal(created, 1); assert.notEqual(restored.id, removed.id);
    assert.equal(instruments.get("lead-R"), survivor);
    assert.deepEqual(frame.a.roles.get("lead-L"), [restored.id]);
    assert.deepEqual(restored.tuning, { semitonesFromF: -1, octaveOffset: 0 }); assert.equal(restored.noteStyled, true);
    assert.ok(frame.root.quaternion.angleTo(frame.homeRotation) < 1e-7);
    for (const pose of frame.poses) {
      assert.ok(pose.h.root.position.distanceTo(pose.home.offset.clone().applyMatrix4(frame.root.matrixWorld)) < 1e-9);
      assert.equal(pose.h.baseScale, pose.home.scale); assert.equal(pose.h.root.visible, true);
    }
    frame.reset(); assert.equal(created, 1);
    frame.apply(frame.home.clone().add(new THREE.Vector3(.3, 0, 0)), 1);
    assert.ok(restored.root.position.distanceTo(new THREE.Vector3(.6, 1, -1)) < 1e-9, "Recovered Honk follows the frame");
  } finally { frame.dispose(); }
});
