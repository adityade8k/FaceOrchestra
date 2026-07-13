import test from "node:test";
import assert from "node:assert/strict";

import {
  clearControllerGripTarget,
  setControllerGripTarget,
} from "../../src/xr/controllerGripState.js";
import {
  SpawnMenuPrimaryAction,
  resolveSpawnMenuPrimaryAction,
} from "../../src/spawning/spawnMenuPrimaryAction.js";

function instrument(id, kind = "honk") {
  return {
    id,
    kind,
    root: { visible: true },
    disposed: false,
    pendingPlacement: false,
  };
}

test("retargeting Grip replaces both the transform wrapper and canonical source", () => {
  const original = instrument("original");
  const duplicate = instrument("duplicate");
  const originalTarget = { id: original.id, root: original.root, source: original };
  const duplicateTarget = { id: duplicate.id, root: duplicate.root, source: duplicate };
  const state = {};
  setControllerGripTarget(state, originalTarget, original);

  assert.strictEqual(setControllerGripTarget(state, duplicateTarget, duplicate), duplicateTarget);
  assert.equal(state.gripHeld, true);
  assert.strictEqual(state.gripInstrumentState, duplicateTarget);
  assert.strictEqual(state.gripSourceInstrumentState, duplicate);

  const nextPrimaryAction = resolveSpawnMenuPrimaryAction({ controllerState: state });
  assert.equal(nextPrimaryAction.type, SpawnMenuPrimaryAction.duplicate);
  assert.strictEqual(nextPrimaryAction.source, duplicate);
});

test("clearing Grip removes both references", () => {
  const source = instrument("source", "looper");
  const target = { id: source.id, root: source.root, source };
  const state = {};
  setControllerGripTarget(state, target, source);

  assert.strictEqual(clearControllerGripTarget(state), target);
  assert.equal(state.gripHeld, false);
  assert.equal(state.gripInstrumentState, null);
  assert.equal(state.gripSourceInstrumentState, null);
});
