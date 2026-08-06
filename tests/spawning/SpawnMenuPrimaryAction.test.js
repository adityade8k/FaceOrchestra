import test from "node:test";
import assert from "node:assert/strict";

import { TransformTargetResolver } from "../../src/instruments/core/TransformTargetResolver.js";
import {
  SpawnMenuPrimaryAction,
  resolveSpawnMenuPrimaryAction,
} from "../../src/spawning/spawnMenuPrimaryAction.js";

function createInstrument(kind = "honk", id = `${kind}-1`) {
  return {
    id,
    kind,
    root: { visible: true },
    disposed: false,
    pendingPlacement: false,
    getScale: () => 1,
    setScale: () => {},
  };
}

function createProfileWrapper(source) {
  const resolver = new TransformTargetResolver({
    instrumentRegistry: {
      get: (id) => (id === source.id ? source : null),
    },
    profileResolver: () => ({ minScale: 0.5, maxScale: 8, scaleStep: 0.25 }),
  });
  return resolver.resolve(source);
}

test("Grip+A duplicates the canonical Honk, Looper, or Metronome behind a transform wrapper", () => {
  for (const kind of ["honk", "looper", "metronome"]) {
    const source = createInstrument(kind);
    const wrapper = createProfileWrapper(source);
    assert.notStrictEqual(wrapper, source);
    assert.strictEqual(wrapper.source, source);

    const action = resolveSpawnMenuPrimaryAction({
      gripPressed: true,
      controllerState: {
        grip: true,
        gripHeld: true,
        gripInstrumentState: wrapper,
        gripSourceInstrumentState: source,
      },
    });

    assert.equal(action.type, SpawnMenuPrimaryAction.duplicate);
    assert.strictEqual(action.source, source);
  }
});

test("an active Grip always suppresses the radial menu without a valid duplicate source", () => {
  const hidden = createInstrument();
  hidden.root.visible = false;
  const disposed = createInstrument("looper");
  disposed.disposed = true;
  const pending = createInstrument("honk", "pending-honk");
  pending.pendingPlacement = true;

  const states = [
    { grip: true, gripHeld: false },
    { grip: true, gripHeld: true, gripSourceInstrumentState: hidden },
    { grip: true, gripHeld: true, gripSourceInstrumentState: disposed },
    { grip: true, gripHeld: true, gripSourceInstrumentState: pending },
  ];

  for (const controllerState of states) {
    assert.deepEqual(
      resolveSpawnMenuPrimaryAction({ controllerState }),
      { type: SpawnMenuPrimaryAction.suppress, source: null },
    );
  }
});

test("gripping a locked formation does not duplicate only one member", () => {
  const source = createInstrument("honk", "member-honk");
  const groupTarget = {
    id: "lock-group",
    kind: "honk-lock-group",
    root: source.root,
    source: { id: "lock-group", kind: "honk-lock-group", root: source.root },
  };

  const action = resolveSpawnMenuPrimaryAction({
    controllerState: {
      grip: true,
      gripHeld: true,
      gripInstrumentState: groupTarget,
      gripSourceInstrumentState: source,
    },
  });

  assert.equal(action.type, SpawnMenuPrimaryAction.suppress);
  assert.equal(action.source, null);
});

test("the current Grip transition suppresses a menu even before semantic grip state catches up", () => {
  assert.deepEqual(
    resolveSpawnMenuPrimaryAction({ gripPressed: true, controllerState: {} }),
    { type: SpawnMenuPrimaryAction.suppress, source: null },
  );
});

test("A without Grip opens the radial menu", () => {
  assert.deepEqual(
    resolveSpawnMenuPrimaryAction({ controllerState: { grip: false, gripHeld: false } }),
    { type: SpawnMenuPrimaryAction.open, source: null },
  );
});
