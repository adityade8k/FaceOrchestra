import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MenuController } from "../../src/navigation/MenuController.js";
import { bindCaptureStatusVisibility } from "../../src/capture/CaptureControls.js";

test("menu immediately gates every badge state; refresh, radial menus and virtual hands cannot override it", () => {
  const events = [],
    menu = new MenuController({
      panel: { setVisible() {} },
      onEvent: (e) => events.push(e),
    });
  const virtual = new THREE.Group(),
    physical = new THREE.Group(),
    other = new THREE.Group();
  virtual.userData = { virtualTutorial: true, gamepad: {} };
  physical.userData.gamepad = {};
  other.userData.gamepad = {};
  const xr = new THREE.EventDispatcher(),
    runtime = {
      xrSessionActive: true,
      renderer: { xr },
      controllers: [virtual, physical, other],
    };
  const mesh = new THREE.Object3D(),
    recorder = {
      paired: true,
      audio: "running",
      takeId: "fixed",
      transport: "recording",
    };
  const original = structuredClone(recorder);
  let refreshes = 0;
  let applicable = true;
  const badge = bindCaptureStatusVisibility({
    runtime,
    menu,
    mesh,
    onRefresh: () => refreshes++,
    isApplicable: () => applicable,
  });
  assert.equal(mesh.parent, physical);
  assert.ok(mesh.visible);
  applicable = false;
  badge.refresh();
  assert.equal(
    mesh.visible,
    false,
    "shown menu preserves status applicability",
  );
  applicable = true;
  for (const state of [
    "idle",
    "preparing",
    "recording",
    "stopping",
    "complete",
    "incomplete",
    "error",
  ]) {
    recorder.state = state;
    menu.setVisible(false);
    assert.equal(
      mesh.visible,
      false,
      "no timer or recorder change is required to hide",
    );
    physical.userData.radialMenu = { visible: true };
    badge.refresh();
    badge.refresh();
    assert.equal(mesh.visible, false);
    menu.setVisible(true);
    assert.ok(mesh.visible);
    assert.equal(recorder.state, state);
  }
  delete recorder.state;
  assert.deepEqual(recorder, original);
  assert.equal(
    events.filter((e) => e === "menu.hide").length,
    7,
    "Basics still receives events",
  );
  assert.equal(refreshes, 14);
  menu.setVisible(false);
  physical.dispatchEvent({ type: "disconnected" });
  assert.equal(mesh.parent, other);
  assert.equal(mesh.visible, false);
  other.dispatchEvent({ type: "disconnected" });
  assert.equal(mesh.parent, null);
  menu.setVisible(true);
  assert.equal(mesh.visible, false);
  physical.dispatchEvent({ type: "connected" });
  assert.equal(mesh.parent, physical);
  assert.ok(mesh.visible);
  xr.dispatchEvent({ type: "sessionend" });
  assert.equal(mesh.parent, null);
  assert.equal(mesh.visible, false);
  badge.refresh();
  assert.equal(mesh.visible, false);
  xr.dispatchEvent({ type: "sessionstart" });
  assert.equal(mesh.parent, physical);
  assert.ok(mesh.visible);
  badge.dispose();
  assert.equal(menu.visibilityListeners.size, 0);
  assert.equal(mesh.parent, null);
  const count = refreshes;
  menu.toggle();
  physical.dispatchEvent({ type: "connected" });
  xr.dispatchEvent({ type: "sessionstart" });
  assert.equal(refreshes, count);
  assert.equal(mesh.visible, false);
});
