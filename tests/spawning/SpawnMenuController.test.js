import assert from "node:assert/strict";
import test from "node:test";

import { RADIAL_MENU_SETTINGS } from "../../src/config/spawning.js";
import { SpawnCatalog } from "../../src/spawning/SpawnCatalog.js";
import { SpawnMenuController } from "../../src/spawning/SpawnMenuController.js";
import { RadialMenuPhase } from "../../src/spawning/radialMenuNavigation.js";

test("entering layer 2 latches the selected parent and starts its child selection at zero", () => {
  const { changes, menu, state, view } = createHarness(RADIAL_MENU_SETTINGS.childEntryThresholdM + 0.01);
  view.parentSelection = 2;
  menu.update({}, state);
  assert.equal(state.radialMenuPhase, RadialMenuPhase.child);
  assert.equal(state.radialMenuLatchedParentIndex, 2);
  assert.equal(state.radialMenuChildSelectedIndex, 0);
  assert.deepEqual(changes, [
    { type: "selection", layer: "parent", selectedIndex: 2 },
    { type: "layer", phase: "child" },
  ]);
});

test("A release in layer 1 returns no selection and closes without a preview command", () => {
  const { changes, menu, state, view } = createHarness(RADIAL_MENU_SETTINGS.childEntryThresholdM - 0.01);
  view.parentSelection = 3;
  assert.equal(menu.confirm({}, state), null);
  assert.equal(state.radialMenuOpen, false);
  assert.equal(view.closed, true);
  assert.deepEqual(changes, [
    { type: "selection", layer: "parent", selectedIndex: 3 },
    { type: "dismiss", selectedId: null },
  ]);
});

test("A release in layer 2 returns only the highlighted leaf from the latched category", () => {
  const { changes, menu, state, view } = createHarness(0.08);
  state.radialMenuPhase = RadialMenuPhase.child;
  state.radialMenuLatchedParentIndex = 2;
  state.radialMenuChildSelectedIndex = 1;
  view.childSelection = 1;
  const selected = menu.confirm({}, state);
  assert.equal(selected.id, "chord-emajor");
  assert.equal(selected.action, "formation");
  assert.equal(state.radialMenuOpen, false);
  assert.deepEqual(changes, [{ type: "confirm", selectedId: "chord-emajor" }]);
});

test("pushing below the exit threshold returns to layer 1 without confirming a category", () => {
  const { changes, menu, state, view } = createHarness(RADIAL_MENU_SETTINGS.childExitThresholdM - 0.001);
  state.radialMenuPhase = RadialMenuPhase.child;
  state.radialMenuLatchedParentIndex = 1;
  state.radialMenuChildSelectedIndex = 2;
  menu.update({}, state);
  assert.equal(state.radialMenuPhase, RadialMenuPhase.parent);
  assert.equal(state.radialMenuLatchedParentIndex, null);
  assert.equal(view.returnedParentIndex, 1);
  assert.deepEqual(changes, [{ type: "layer", phase: "parent" }]);
});

test("child selection changes emit one state-change event and unchanged selections stay silent", () => {
  const { changes, menu, state, view } = createHarness(0.08);
  state.radialMenuPhase = RadialMenuPhase.child;
  state.radialMenuLatchedParentIndex = 3;
  view.childSelection = 4;
  menu.update({}, state);
  menu.update({}, state);
  assert.deepEqual(changes, [{ type: "selection", layer: "child", selectedIndex: 4 }]);
});

test("open, cancel, and programmatic close each emit their actual state change", () => {
  const opened = createHarness(0);
  opened.state.radialMenuOpen = false;
  opened.menu.open({}, opened.state);
  assert.deepEqual(opened.changes, [{ type: "open" }]);

  const cancelled = createHarness(0);
  cancelled.menu.cancel({}, cancelled.state);
  assert.deepEqual(cancelled.changes, [{ type: "cancel" }]);

  const closed = createHarness(0);
  closed.menu.close({}, closed.state);
  closed.menu.close({}, closed.state);
  assert.deepEqual(closed.changes, [{ type: "close" }]);
});

function createHarness(pullDistance) {
  const catalog = new SpawnCatalog();
  const changes = [];
  const view = {
    pullDistance,
    parentSelection: 0,
    childSelection: 0,
    closed: false,
    create: () => ({}),
    open(_controller, state) { state.radialMenuOpen = true; },
    cancel(_controller, state) { this.close(_controller, state); },
    close(_controller, state) { state.radialMenuOpen = false; this.closed = true; },
    updatePullDistance: () => view.pullDistance,
    updateParentSelection(_controller, state) { state.radialMenuParentSelectedIndex = this.parentSelection; },
    beginChildLayer(_controller, state) {
      state.radialMenuLatchedParentIndex = state.radialMenuParentSelectedIndex;
      state.radialMenuChildSelectedIndex = 0;
    },
    updateChildSelection(_controller, state) { state.radialMenuChildSelectedIndex = this.childSelection; },
    returnToParentLayer(_controller, state) {
      this.returnedParentIndex = state.radialMenuLatchedParentIndex;
      state.radialMenuParentSelectedIndex = state.radialMenuLatchedParentIndex;
      state.radialMenuLatchedParentIndex = null;
    },
    updateVisuals: () => {},
  };
  const menu = new SpawnMenuController({
    view,
    catalog,
    onStateChange: (_controller, change) => changes.push(change),
  });
  const state = {
    radialMenuOpen: true,
    radialMenuCancelled: false,
    radialMenuPhase: RadialMenuPhase.parent,
    radialMenuParentSelectedIndex: 0,
    radialMenuChildSelectedIndex: 0,
    radialMenuLatchedParentIndex: null,
  };
  return { catalog, changes, menu, state, view };
}
