import test from "node:test";
import assert from "node:assert/strict";
import {
  METRONOME_BUTTON_ACTIONS,
  METRONOME_EYE_CONTROLS,
} from "../../../src/config/metronome.js";
import { MetronomeButtonRig } from "../../../src/instruments/metronome/MetronomeButtonRig.js";

test("left Play eye latches inward and returns exactly to its configured rest position", () => {
  const { root, left } = metronomeRoot();
  const rig = new MetronomeButtonRig({ root });
  const config = METRONOME_EYE_CONTROLS.find(
    ({ action }) => action === METRONOME_BUTTON_ACTIONS.play,
  );
  const rest = readPosition(left);

  rig.press(METRONOME_BUTTON_ACTIONS.play, 1000);
  assert.equal(rig.isPressed(METRONOME_BUTTON_ACTIONS.play), true);
  assert.deepEqual(readPosition(left), {
    x: rest.x + config.pressedOffset.x,
    y: rest.y + config.pressedOffset.y,
    z: rest.z + config.pressedOffset.z,
  });

  rig.update(100000);
  assert.equal(rig.isPressed(METRONOME_BUTTON_ACTIONS.play), true);

  rig.setPressed(METRONOME_BUTTON_ACTIONS.play, false);
  assert.deepEqual(readPosition(left), rest);
});

test("right Pause eye always returns after its configured momentary delay", () => {
  const { root, right } = metronomeRoot();
  const rig = new MetronomeButtonRig({ root });
  const config = METRONOME_EYE_CONTROLS.find(
    ({ action }) => action === METRONOME_BUTTON_ACTIONS.pause,
  );
  const rest = readPosition(right);

  rig.press(METRONOME_BUTTON_ACTIONS.pause, 2000);
  assert.equal(rig.isPressed(METRONOME_BUTTON_ACTIONS.pause), true);
  assert.equal(right.position.z, rest.z + config.pressedOffset.z);

  rig.update(2000 + config.releaseDelayMs - 1);
  assert.equal(rig.isPressed(METRONOME_BUTTON_ACTIONS.pause), true);
  rig.update(2000 + config.releaseDelayMs);
  assert.equal(rig.isPressed(METRONOME_BUTTON_ACTIONS.pause), false);
  assert.deepEqual(readPosition(right), rest);
});

test("button presses are rest-relative and never accumulate travel", () => {
  const { root, right } = metronomeRoot();
  const rig = new MetronomeButtonRig({ root });
  const rest = readPosition(right);

  rig.press(METRONOME_BUTTON_ACTIONS.pause, 1000);
  const firstPress = readPosition(right);
  rig.press(METRONOME_BUTTON_ACTIONS.pause, 1050);
  assert.deepEqual(readPosition(right), firstPress);

  rig.reset();
  assert.deepEqual(readPosition(right), rest);
});

test("missing eye nodes disable only those configured controls", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const rig = new MetronomeButtonRig({
      root: { getObjectByName: () => null },
    });
    assert.equal(rig.buttons.size, 0);
    assert.equal(warnings.length, METRONOME_EYE_CONTROLS.length);
    assert.match(warnings[0], /eye node/);
  } finally {
    console.warn = originalWarn;
  }
});

function metronomeRoot() {
  const left = node(-0.067, 0.074, 0.121);
  const right = node(0.067, 0.075, 0.121);
  const nodes = new Map([
    ["L_button_geo", left],
    ["R_button_geo", right],
  ]);
  return {
    root: { getObjectByName: (name) => nodes.get(name) || null },
    left,
    right,
  };
}

function node(x, y, z) {
  return {
    position: {
      x,
      y,
      z,
      set(nextX, nextY, nextZ) {
        this.x = nextX;
        this.y = nextY;
        this.z = nextZ;
      },
    },
    updateMatrixWorld() {},
  };
}

function readPosition(nodeValue) {
  return {
    x: nodeValue.position.x,
    y: nodeValue.position.y,
    z: nodeValue.position.z,
  };
}
