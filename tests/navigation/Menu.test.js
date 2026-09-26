import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MenuController } from "../../src/navigation/MenuController.js";
import { XRInputSourceManager } from "../../src/xr/XRInputSourceManager.js";
import { XRIntentMapper } from "../../src/xr/XRIntentMapper.js";
import {
  CompositionRegistry,
  compositionRegistry,
  libraryPage,
  validateComposition,
} from "../../src/compositions/CompositionRegistry.js";
import { ApplicationModeRouter } from "../../src/navigation/ApplicationModeRouter.js";
import { TutorialRuntime } from "../../src/tutorial/TutorialRuntime.js";
import { SessionRuntimeMethods } from "../../src/app/runtime/SessionRuntime.js";

test("a held thumbstick across reconnect must be released before it can toggle again", () => {
  const controllers = [new THREE.Group(), new THREE.Group()],
    intents = [],
    mapper = new XRIntentMapper();
  const manager = new XRInputSourceManager({
    scene: new THREE.Scene(),
    renderer: {
      xr: {
        getController: (i) => controllers[i],
        getControllerGrip: () => new THREE.Group(),
        getSession: () => null,
      },
    },
    onInput: (e) => intents.push(...mapper.map(e)),
  });
  manager.setup();
  assert.notEqual(
    SessionRuntimeMethods.getControllerVoiceId(controllers[0]),
    SessionRuntimeMethods.getControllerVoiceId(controllers[1]),
    "Unassigned handedness must not merge audio owners",
  );
  const c = controllers[0],
    gamepad = {
      mapping: "xr-standard",
      buttons: Array.from({ length: 6 }, () => ({ pressed: false })),
      axes: [0, 0, 0, 0],
    };
  gamepad.buttons[3].pressed = true;
  const connect = () =>
    c.dispatchEvent({
      type: "connected",
      data: { handedness: "left", gamepad, profiles: [] },
    });
  connect();
  manager.poll();
  assert.equal(intents.filter((i) => i.type === "menu.toggle").length, 0);
  gamepad.buttons[3].pressed = false;
  manager.poll();
  gamepad.buttons[3].pressed = true;
  manager.poll();
  c.dispatchEvent({ type: "disconnected" });
  connect();
  manager.poll();
  assert.equal(intents.filter((i) => i.type === "menu.toggle").length, 1);
  gamepad.buttons[3].pressed = false;
  manager.poll();
  gamepad.buttons[3].pressed = true;
  manager.poll();
  assert.equal(intents.filter((i) => i.type === "menu.toggle").length, 2);
});

test("left thumbstick maps a press edge; hold, axes, right hand and missing thumbstick do not toggle", () => {
  const mapper = new XRIntentMapper(),
    inputs = [],
    manager = new XRInputSourceManager({
      onInput: (e) => inputs.push(...mapper.map(e)),
    });
  const c = new THREE.Group();
  c.userData = {
    handedness: "left",
    gamepad: {
      mapping: "xr-standard",
      buttons: Array.from({ length: 6 }, () => ({ pressed: false })),
      axes: [0, 0, 0, 0],
    },
  };
  manager.controllers = [c];
  manager.hardwareStates.set(c, {
    buttons: {
      thumbstick: false,
      trigger: false,
      grip: false,
      primary: false,
      secondary: false,
    },
    thumbstickDirections: { thumbstickX: 0, thumbstickY: 0 },
  });
  const button = c.userData.gamepad.buttons[3];
  button.pressed = true;
  manager.poll();
  manager.poll();
  assert.equal(inputs.filter((e) => e.type === "menu.toggle").length, 1);
  button.pressed = false;
  manager.poll();
  c.userData.gamepad.axes[2] = 1;
  manager.poll();
  button.pressed = true;
  manager.poll();
  assert.equal(inputs.filter((e) => e.type === "menu.toggle").length, 2);
  button.pressed = false;
  manager.poll();
  c.userData.handedness = "right";
  button.pressed = true;
  manager.poll();
  assert.equal(inputs.filter((e) => e.type === "menu.toggle").length, 2);
  c.userData.handedness = "left";
  c.userData.gamepad.buttons = [];
  manager.poll();
  assert.equal(inputs.filter((e) => e.type === "menu.toggle").length, 2);
});

test("disposing navigation while a loader is pending cannot mutate or restore a torn-down scene", async () => {
  let resolve,
    mutations = 0;
  const router = new ApplicationModeRouter({
    checkpoint: async () => mutations++,
    quiesce: async () => mutations++,
    rollback: async () => mutations++,
  });
  const entered = router.enter(
    "slow",
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    async () => mutations++,
  );
  await Promise.resolve();
  await Promise.resolve();
  router.dispose();
  resolve({});
  await assert.rejects(entered, { name: "AbortError" });
  assert.equal(mutations, 0);
});
test("drag retains controller offset, captures both bindings, and hide requires release before interaction", () => {
  const c = new THREE.Group(),
    panel = {
      group: new THREE.Group(),
      setVisible(v) {
        this.group.visible = v;
      },
      activate() {
        throw new Error("drag must not activate");
      },
    };
  c.userData.gamepad = {};
  panel.group.position.set(1, 2, -1);
  const state = { grip: true, trigger: false },
    states = new Map([[c, state]]);
  const menu = new MenuController({
    panel,
    states,
    hit: () =>
      panel.group.visible
        ? { object: { userData: { menuHandle: true } } }
        : null,
  });
  assert.equal(
    menu.capture({ type: "interaction.grip.begin", controller: c }, state),
    true,
  );
  c.position.x = 2;
  menu.update();
  assert.deepEqual(panel.group.position.toArray(), [3, 2, -1]);
  assert.equal(
    menu.capture({ type: "instrument.delete", controller: c }, state),
    true,
  );
  menu.toggle();
  state.trigger = true;
  assert.equal(
    menu.capture({ type: "interaction.trigger.begin", controller: c }, state),
    true,
  );
  assert.equal(
    TutorialRuntime.prototype.blocksController.call({ menu }, c),
    true,
    "Continuous squeeze remains blocked after hiding",
  );
  state.grip = state.trigger = false;
  menu.capture({ type: "interaction.grip.end", controller: c }, state);
  assert.equal(
    menu.capture({ type: "interaction.trigger.begin", controller: c }, state),
    false,
  );
  assert.equal(
    TutorialRuntime.prototype.blocksController.call({ menu }, c),
    false,
    "Release restores musical input",
  );
  menu.toggle();
  assert.deepEqual(panel.group.position.toArray(), [3, 2, -1]);
});
test("both libraries share all metadata, paginate 50 entries, and incomplete lessons fail before mutation", async () => {
  for (const entry of compositionRegistry.list()) {
    const { definition } = await compositionRegistry.load(entry.id);
    assert.equal(definition.title, entry.title);
    assert.throws(
      () => validateComposition({ ...definition, lessons: [] }),
      /guided/,
    );
  }
  const registry = new CompositionRegistry(
    Array.from({ length: 50 }, (_, i) => ({
      id: `c${i}`,
      title: `${i}`,
      version: 1,
      load: async () => {
        throw new Error("must stay lazy");
      },
    })),
  );
  const ids = [];
  for (let page = 0; page < 26; page++)
    ids.push(...libraryPage(registry, "tutorials", page).rows.map((r) => r.id));
  assert.equal(ids[0], "basics");
  assert.equal(new Set(ids).size, 51);
});
test("mode preparation is serialized and failed commit rolls back to the outgoing mode", async () => {
  const calls = [];
  const router = new ApplicationModeRouter({
    checkpoint: async () => calls.push("save"),
    quiesce: async () => calls.push("stop"),
    rollback: async (id) => calls.push(`restore:${id}`),
  });
  await Promise.all([
    router.enter(
      "basics",
      async () => calls.push("load"),
      async () => calls.push("enter"),
    ),
    router.enter(
      "song",
      async () => {},
      async () => calls.push("song"),
    ),
  ]);
  assert.deepEqual(calls, ["load", "save", "stop", "enter", "stop", "song"]);
  await assert.rejects(
    router.enter(
      "broken",
      async () => {},
      async () => {
        throw new Error("failure");
      },
    ),
  );
  assert.equal(calls.at(-1), "restore:song");
  assert.equal(router.identity, "song");
});
