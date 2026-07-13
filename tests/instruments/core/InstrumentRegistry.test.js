import assert from "node:assert/strict";
import test from "node:test";

import { INSTRUMENT_KINDS } from "../../../src/instruments/core/capabilities.js";
import { InstrumentEntity } from "../../../src/instruments/core/InstrumentEntity.js";
import { InstrumentRegistry } from "../../../src/instruments/core/InstrumentRegistry.js";
import { InteractionTargetRegistry } from "../../../src/instruments/core/InteractionTargetRegistry.js";

test("registry is the source of truth for ID, kind, capability, and Object3D lookup", () => {
  const registry = new InstrumentRegistry();
  const root = object3D();
  const honk = new InstrumentEntity({ id: "honk-stable", kind: INSTRUMENT_KINDS.honk, root });
  registry.add(honk);
  const child = object3D(root);

  assert.equal(registry.get("honk-stable"), honk);
  assert.deepEqual(registry.getByKind(INSTRUMENT_KINDS.honk), [honk]);
  assert.equal(registry.getFromObject3D(child), honk);
  assert.equal(registry.getPlaceableInstruments()[0], honk);
});

test("registry rejects duplicate stable IDs and disposes exactly once on removal", () => {
  const registry = new InstrumentRegistry();
  const first = new InstrumentEntity({ id: "same-id", kind: INSTRUMENT_KINDS.honk, root: object3D() });
  const duplicate = new InstrumentEntity({ id: "same-id", kind: INSTRUMENT_KINDS.honk, root: object3D() });
  let disposalCount = 0;
  first.addDisposeHandler(() => { disposalCount += 1; });
  registry.add(first);
  assert.throws(() => registry.add(duplicate), /already registered/);
  registry.remove(first.id);
  registry.remove(first.id);
  assert.equal(disposalCount, 1);
});

test("interaction targets store a small descriptor on meshes and resolve handlers through the registry", () => {
  const targets = new InteractionTargetRegistry({ idFactory: () => "target-1" });
  const mesh = object3D();
  let invoked = false;
  targets.register({
    ownerId: "honk-1",
    role: "honk.mouth",
    object3D: mesh,
    handlers: { trigger: () => { invoked = true; } },
  });
  assert.deepEqual(mesh.userData.interactionTarget, {
    targetId: "target-1",
    ownerId: "honk-1",
    role: "honk.mouth",
  });
  assert.equal("instrumentState" in mesh.userData, false);
  targets.dispatch(mesh, "trigger");
  assert.equal(invoked, true);
  targets.unregisterOwner("honk-1");
  assert.equal(mesh.userData.interactionTarget, undefined);
});

function object3D(parent = null) {
  return {
    parent,
    userData: {},
    visible: true,
    position: tuple(0, 0, 0),
    quaternion: tuple(0, 0, 0, 1),
    rotation: tuple(0, 0, 0),
    scale: tuple(1, 1, 1),
    removeFromParent() { this.parent = null; },
  };
}

function tuple(...values) {
  const keys = values.length === 4 ? ["x", "y", "z", "w"] : ["x", "y", "z"];
  const result = {};
  keys.forEach((key, index) => { result[key] = values[index]; });
  result.set = (...next) => keys.forEach((key, index) => { result[key] = next[index]; });
  result.setScalar = (next) => keys.slice(0, 3).forEach((key) => { result[key] = next; });
  return result;
}
