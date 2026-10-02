import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MenuController } from "../../src/navigation/MenuController.js";
import {
  PracticeTempoControls,
  tempoFromSliderX,
} from "../../src/tutorial/PracticeTempoControls.js";

test("slider ray maps through a translated, rotated and scaled panel and clamps off-panel drags", () => {
  const slider = Object.create(PracticeTempoControls.prototype);
  Object.assign(slider, {
    group: new THREE.Group(),
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    plane: new THREE.Plane(),
    ray: new THREE.Ray(),
    scaleX: 1.05 / 1152,
    draw() {},
  });
  slider.group.position.set(1, 2, -3);
  slider.group.rotation.set(0.1, 0.5, 0.2);
  slider.group.scale.setScalar(1.4);
  slider.group.updateMatrixWorld(true);
  const controller = new THREE.Group(),
    q = slider.group.getWorldQuaternion(new THREE.Quaternion());
  for (const [fraction, expected] of [
    [-0.5, 40],
    [0, 40],
    [10 / 52, 50],
    [20 / 52, 60],
    [30 / 52, 70],
    [40 / 52, 80],
    [1, 92],
    [2, 92],
  ]) {
    const target = slider.group.localToWorld(
      new THREE.Vector3((80 + fraction * 912 - 536) * slider.scaleX, 0, 0),
    );
    controller.position
      .copy(target)
      .add(new THREE.Vector3(0, 0, 1).applyQuaternion(q));
    controller.quaternion.copy(q);
    controller.updateMatrixWorld(true);
    slider.update(controller);
    assert.equal(slider.preview, expected);
    assert.equal(tempoFromSliderX(fraction), expected);
  }
});

test("XR slider owns input until release, commits once, and cancels on hide, tracking reset or disconnect", () => {
  const controller = new THREE.Group();
  controller.userData.gamepad = {};
  const state = { trigger: true },
    calls = [];
  const panel = {
    group: new THREE.Group(),
    setVisible() {},
    recenter() {},
    activate() {
      calls.push("button");
    },
    tempoControls: {
      begin() {
        calls.push("begin");
        return true;
      },
      update() {
        calls.push("update");
      },
      commit() {
        calls.push("commit");
      },
      cancel() {
        calls.push("cancel");
      },
    },
  };
  const menu = new MenuController({
    panel,
    states: new Map([[controller, state]]),
    hit: () => ({
      object: { userData: { practiceSlider: true, action: "bad" } },
      point: new THREE.Vector3(),
    }),
    quiesce: () => calls.push("quiesce"),
  });
  const input = (type) => menu.capture({ controller, type }, state);
  assert.equal(input("interaction.trigger.begin"), true);
  menu.update();
  assert.equal(menu.sliderDrag, controller);
  assert.equal(input("interaction.grip.begin"), true);
  assert.equal(menu.drag, undefined);
  assert.ok(!calls.includes("button"));
  state.trigger = false;
  input("interaction.trigger.end");
  input("interaction.trigger.end");
  assert.equal(calls.filter((c) => c === "commit").length, 1);
  for (const cancel of [
    () => menu.setVisible(false),
    () => menu.disconnect(controller),
    () => menu.referenceChanged(new THREE.Camera()),
  ]) {
    menu.setVisible(true);
    state.trigger = false;
    input("interaction.trigger.end");
    state.trigger = true;
    input("interaction.trigger.begin");
    cancel();
    assert.equal(menu.sliderDrag, null);
    state.trigger = false;
    input("interaction.trigger.end");
  }
  assert.equal(calls.filter((c) => c === "commit").length, 1);
});
