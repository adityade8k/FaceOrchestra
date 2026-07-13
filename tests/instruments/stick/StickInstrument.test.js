import assert from "node:assert/strict";
import test from "node:test";

import { INSTRUMENT_KINDS } from "../../../src/instruments/core/capabilities.js";
import { StickCollisionSystem } from "../../../src/instruments/stick/StickCollisionSystem.js";
import { StickInstrument } from "../../../src/instruments/stick/StickInstrument.js";

test("stick emits one semantic strike per contact and can retrigger after separation", () => {
  const stick = createStick();
  const target = { id: "honk-1", kind: INSTRUMENT_KINDS.honk };
  stick.equip("right");
  const first = stick.beginContact(target, { velocity: 2.5, timestamp: 10 });
  assert.deepEqual(
    pick(first, ["type", "stickId", "controllerId", "targetId", "percussionType", "velocity", "timestamp"]),
    {
      type: "stick.strike",
      stickId: "stick-1",
      controllerId: "right",
      targetId: "honk-1",
      percussionType: "boink",
      velocity: 2.5,
      timestamp: 10,
    },
  );
  assert.equal(stick.beginContact(target, { timestamp: 11 }), null);
  stick.endContact(target, 12);
  assert.ok(stick.beginContact(target, { timestamp: 13 }));
});

test("collision system emits boink/hihat strikes without mutating a looper timeline", () => {
  const stick = createStick();
  stick.equip("left");
  const honk = { id: "honk-1", kind: INSTRUMENT_KINDS.honk, visible: true, disposed: false };
  const looper = { id: "looper-1", kind: INSTRUMENT_KINDS.looper, visible: true, disposed: false };
  const touching = new Set([honk.id, looper.id]);
  const strikes = [];
  const collisions = new StickCollisionSystem({
    getSticks: () => [stick],
    getTargets: () => [honk, looper],
    collisionTester: ({ target }) => touching.has(target.id),
    positionReader: () => [0, 0, 0],
  });
  collisions.subscribe((event) => strikes.push(event));
  collisions.update(100);
  collisions.update(101);
  assert.deepEqual(strikes.map((event) => event.percussionType).sort(), ["boink", "hihat"]);

  touching.clear();
  collisions.update(102);
  touching.add(honk.id);
  collisions.update(103);
  assert.equal(strikes.length, 3);
});

test("unequipping clears contacts and deactivates the strike collider", () => {
  const stick = createStick();
  stick.equip("right");
  stick.beginContact({ id: "honk", kind: INSTRUMENT_KINDS.honk });
  stick.unequip();
  assert.equal(stick.equipped, false);
  assert.equal(stick.colliderActive, false);
  assert.equal(stick.contactTargetIds.size, 0);
  assert.equal(stick.visible, false);
});

function createStick() {
  const collider = { visible: false, userData: {}, geometry: {}, material: null };
  const stick = new StickInstrument({ id: "stick-1", root: object3D(), collider });
  assert.deepEqual(collider.userData.stick, {
    ownerId: "stick-1",
    role: "stick.strike-volume",
  });
  return stick;
}

function object3D() {
  return {
    userData: {},
    visible: true,
    parent: null,
    position: tuple3(0, 0, 0),
    quaternion: tuple4(0, 0, 0, 1),
    rotation: tuple3(0, 0, 0),
    scale: tuple3(1, 1, 1),
    removeFromParent() { this.parent = null; },
  };
}

function tuple3(x, y, z) {
  return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; }, setScalar(v) { this.set(v, v, v); } };
}

function tuple4(x, y, z, w) {
  return { x, y, z, w, set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; } };
}

function pick(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}
