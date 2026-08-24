import assert from "node:assert/strict";
import test from "node:test";

import { RADIAL_MENU_SETTINGS } from "../../src/config/spawning.js";
import {
  choosePullAxisTowardViewer,
  getRadialLayerPresentation,
  lockPositionToOpeningPlane,
  projectControllerRelativePullDistance,
  projectPullDistance,
  RadialMenuPhase,
  relativeZRoll,
  resolvePullPhase,
} from "../../src/spawning/radialMenuNavigation.js";

test("opening-frame local Z is signed toward the viewer and toward motion crosses entry", () => {
  const frame = choosePullAxisTowardViewer([0, 0, 0], [0, 0, 0, 1], [0, 0, -1]);
  assert.deepEqual(frame.axis, [0, 0, -1]);
  assert.equal(frame.localZSign, -1);
  const pull = projectPullDistance([0, 0, 0], [0, 0, -0.11], frame.axis);
  assert.ok(Math.abs(pull - 0.11) < 1e-12);
  assert.equal(resolvePullPhase(RadialMenuPhase.parent, pull, RADIAL_MENU_SETTINGS), RadialMenuPhase.child);
});

test("pull direction follows the opening controller orientation instead of global Z", () => {
  const y90 = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];
  const frame = choosePullAxisTowardViewer([2, 0, 3], y90, [1, 0, 3]);
  assert.ok(Math.abs(frame.axis[0] + 1) < 1e-12);
  assert.ok(Math.abs(frame.axis[2]) < 1e-12);
  assert.ok(projectPullDistance([2, 0, 3], [1.89, 0, 3], frame.axis) > 0.10);
});

test("sideways and away motion do not open the child layer", () => {
  const axis = [0, 0, 1];
  const sideways = projectPullDistance([0, 0, 0], [0.3, 0, 0], axis);
  const away = projectPullDistance([0, 0, 0], [0, 0, -0.2], axis);
  assert.equal(sideways, 0);
  assert.ok(away < 0);
  assert.equal(resolvePullPhase(RadialMenuPhase.parent, sideways, RADIAL_MENU_SETTINGS), RadialMenuPhase.parent);
  assert.equal(resolvePullPhase(RadialMenuPhase.parent, away, RADIAL_MENU_SETTINGS), RadialMenuPhase.parent);
});

test("shared headset and controller translation does not count as a controller pull", () => {
  const pull = projectControllerRelativePullDistance({
    openingControllerPosition: [0, 0, -0.5],
    currentControllerPosition: [0, 0, -0.35],
    openingViewerPosition: [0, 0, 0],
    currentViewerPosition: [0, 0, 0.15],
    pullAxis: [0, 0, 1],
  });
  assert.ok(Math.abs(pull) < 1e-12);
  assert.equal(resolvePullPhase(RadialMenuPhase.parent, pull, RADIAL_MENU_SETTINGS), RadialMenuPhase.parent);
});

test("controller movement toward the headset still opens after headset translation is removed", () => {
  const pull = projectControllerRelativePullDistance({
    openingControllerPosition: [0, 0, -0.5],
    currentControllerPosition: [0, 0, -0.23],
    openingViewerPosition: [0, 0, 0],
    currentViewerPosition: [0, 0, 0.15],
    pullAxis: [0, 0, 1],
  });
  assert.ok(Math.abs(pull - 0.12) < 1e-12);
  assert.equal(resolvePullPhase(RadialMenuPhase.parent, pull, RADIAL_MENU_SETTINGS), RadialMenuPhase.child);
});

test("menu position stays on its opening Z plane while preserving X and Y motion", () => {
  assert.deepEqual(
    lockPositionToOpeningPlane([0, 0, -0.7], [0.24, -0.16, -0.48], [0, 0, 1]),
    [0.24, -0.16, -0.7],
  );
});

test("menu depth lock follows the controller opening normal rather than global Z", () => {
  const locked = lockPositionToOpeningPlane([1, 2, 3], [1.3, 2.2, 3.4], [1, 0, 0]);
  assert.ok(Math.abs(locked[0] - 1) < 1e-12);
  assert.ok(Math.abs(locked[1] - 2.2) < 1e-12);
  assert.ok(Math.abs(locked[2] - 3.4) < 1e-12);
});

test("configured entry and exit hysteresis prevents phase flicker", () => {
  const { childEntryThresholdM: entry, childExitThresholdM: exit } = RADIAL_MENU_SETTINGS;
  const epsilon = 0.001;
  assert.ok(exit < entry);
  assert.equal(resolvePullPhase(RadialMenuPhase.parent, entry - epsilon, RADIAL_MENU_SETTINGS), RadialMenuPhase.parent);
  assert.equal(resolvePullPhase(RadialMenuPhase.parent, entry, RADIAL_MENU_SETTINGS), RadialMenuPhase.child);
  assert.equal(resolvePullPhase(RadialMenuPhase.child, entry - epsilon, RADIAL_MENU_SETTINGS), RadialMenuPhase.child);
  assert.equal(resolvePullPhase(RadialMenuPhase.child, exit + epsilon, RADIAL_MENU_SETTINGS), RadialMenuPhase.child);
  assert.equal(resolvePullPhase(RadialMenuPhase.child, exit, RADIAL_MENU_SETTINGS), RadialMenuPhase.parent);
});

test("parent and child quaternion baselines produce independent roll deltas", () => {
  const atOpen = zRollQuaternion(0);
  const atChildEntry = zRollQuaternion(Math.PI / 6);
  const afterChildRoll = zRollQuaternion(Math.PI / 4);
  assert.ok(Math.abs(relativeZRoll(atOpen, atChildEntry) - Math.PI / 6) < 1e-12);
  assert.ok(Math.abs(relativeZRoll(atChildEntry, atChildEntry)) < 1e-12);
  assert.ok(Math.abs(relativeZRoll(atChildEntry, afterChildRoll) - Math.PI / 12) < 1e-12);
});

test("rebasing a returned parent preserves its angular presentation without a jump", () => {
  const before = getRadialLayerPresentation({
    controllerRoll: 0.31,
    optionCount: 4,
    settings: RADIAL_MENU_SETTINGS,
  });
  const after = getRadialLayerPresentation({
    controllerRoll: 0,
    optionCount: 4,
    dialBaseRotation: before.dialRotation,
    ringBaseRotation: before.ringRotation,
    settings: RADIAL_MENU_SETTINGS,
  });
  assert.equal(after.dialRotation, before.dialRotation);
  assert.equal(after.ringRotation, before.ringRotation);
  assert.equal(after.selectedIndex, before.selectedIndex);
});

function zRollQuaternion(angle) {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}
