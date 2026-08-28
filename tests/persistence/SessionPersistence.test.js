import test from "node:test";
import assert from "node:assert/strict";

import {
  restorePersistedSceneForRuntime,
  savePersistedSceneForRuntime,
} from "../../src/app/runtime/RuntimePersistencePolicy.js";
import { SessionRuntimeMethods } from "../../src/app/runtime/SessionRuntime.js";
import { PersistenceStore } from "../../src/persistence/PersistenceStore.js";
import { ScenePersistence } from "../../src/persistence/ScenePersistence.js";
import { LEGACY_SCENE_STORAGE_KEYS, SCENE_STORAGE_KEY } from "../../src/persistence/schema.js";

test("XR start always asks the default spawner to ensure a metronome exists", () => {
  let defaultSpawnRequests = 0;
  const runtime = {
    xrSessionActive: false,
    hideInstructionPanel() {},
    spawnDefaultInstrumentPreview() { defaultSpawnRequests += 1; },
  };

  SessionRuntimeMethods.onXRSessionStart.call(runtime);

  assert.equal(runtime.xrSessionActive, true);
  assert.equal(defaultSpawnRequests, 1);
});

test("runtime initialization retries the default metronome spawn for an active XR session", () => {
  let defaultSpawnRequests = 0;
  const runtime = {
    xrSessionActive: true,
    instructionPanelClosed: true,
    spawnDefaultInstrumentPreview() { defaultSpawnRequests += 1; },
  };

  SessionRuntimeMethods.onRuntimeInitialized.call(runtime);

  assert.equal(defaultSpawnRequests, 1);
});

test("runtime initialization does not spawn before XR starts or while instructions remain open", () => {
  let defaultSpawnRequests = 0;
  const runtime = {
    spawnDefaultInstrumentPreview() { defaultSpawnRequests += 1; },
  };

  SessionRuntimeMethods.onRuntimeInitialized.call({
    ...runtime,
    xrSessionActive: false,
    instructionPanelClosed: true,
  });
  SessionRuntimeMethods.onRuntimeInitialized.call({
    ...runtime,
    xrSessionActive: true,
    instructionPanelClosed: false,
  });

  assert.equal(defaultSpawnRequests, 0);
});

test("XR exit finalizes recordings and performs exactly one save before reset", () => {
  const events = [];
  const recordingLooper = {
    transport: { recording: true },
    finishRecording(now) {
      events.push(`finish:${now}`);
      this.transport.recording = false;
    },
    stop() { events.push("stop:recording-looper"); },
  };
  const pausedLooper = {
    transport: { recording: false, paused: true },
    finishRecording() { throw new Error("paused Looper must not be finalized as a recording"); },
    stop() { events.push("stop:paused-looper"); },
  };
  const runtime = {
    debugMode: false,
    xrSessionActive: true,
    pendingPanelPlacementFrames: 3,
    hideInstructionPanel() { events.push("hide-panel"); },
    deletePendingSpawnPlacement() { events.push("delete-preview"); },
    instrumentRegistry: {
      getByKind: (kind) => kind === "looper" ? [recordingLooper, pausedLooper] : [],
    },
    savePersistedSceneOnXRExit() { events.push("save"); return true; },
    resetSubsystemsAfterSession() { events.push("reset"); },
    audioSystem: { suspend() { events.push("suspend-audio"); return Promise.resolve(); } },
  };

  const didSave = SessionRuntimeMethods.onXRSessionEnd.call(runtime, 1234);

  assert.equal(didSave, true);
  assert.equal(runtime.pendingPanelPlacementFrames, 0);
  assert.deepEqual(events, [
    "hide-panel",
    "delete-preview",
    "finish:1234",
    "stop:recording-looper",
    "stop:paused-looper",
    "save",
    "reset",
    "suspend-audio",
  ]);

  assert.equal(SessionRuntimeMethods.onXRSessionEnd.call(runtime, 1300), false);
  assert.equal(events.filter((event) => event === "save").length, 1);
});

test("debug XR exit resets the session without invoking persistence saving", () => {
  const events = [];
  const runtime = {
    debugMode: true,
    xrSessionActive: true,
    hideInstructionPanel() { events.push("hide-panel"); },
    deletePendingSpawnPlacement() { events.push("delete-preview"); },
    instrumentRegistry: { getByKind: () => [] },
    savePersistedSceneOnXRExit() { events.push("save"); return true; },
    resetSubsystemsAfterSession() { events.push("reset"); },
    audioSystem: { suspend: () => Promise.resolve() },
  };

  assert.equal(SessionRuntimeMethods.onXRSessionEnd.call(runtime, 1234), false);
  assert.deepEqual(events, ["hide-panel", "delete-preview", "reset"]);
});

test("debug startup skips restoration and creates exactly one default metronome", async () => {
  const instruments = [];
  let persistedRestoreCalls = 0;
  let spawnRequests = 0;
  const runtime = {
    debugMode: true,
    xrSessionActive: false,
    instructionPanelClosed: false,
    setupControllers() {},
    createInstructionPanel() {},
    async loadInstrument() {},
    async loadStick() {},
    async loadNoteFont() {},
    scenePersistence: {
      async restore() {
        persistedRestoreCalls += 1;
        instruments.push({ kind: "honk" }, { kind: "looper" }, { kind: "metronome" });
      },
    },
    hideInstructionPanel() {},
    spawnDefaultInstrumentPreview() {
      spawnRequests += 1;
      if (!instruments.some(({ kind }) => kind === "metronome")) {
        instruments.push({ kind: "metronome" });
      }
    },
  };

  await restorePersistedSceneForRuntime(runtime);
  SessionRuntimeMethods.onXRSessionStart.call(runtime);
  SessionRuntimeMethods.onRuntimeInitialized.call(runtime);

  assert.equal(persistedRestoreCalls, 0);
  assert.equal(spawnRequests, 2, "both timing paths may request the guarded default flow");
  assert.deepEqual(instruments.map(({ kind }) => kind), ["metronome"]);
});

test("RuntimeHost persistence policy preserves production storage during debug sessions", async () => {
  const savedProductionScene = JSON.stringify({
    schemaVersion: 3,
    instruments: [{ id: "honk-saved", kind: "honk" }],
  });
  let storedValue = savedProductionScene;
  let reads = 0;
  let writes = 0;
  const storage = {
    getItem(key) {
      assert.equal(key, SCENE_STORAGE_KEY);
      reads += 1;
      return storedValue;
    },
    setItem(key, value) {
      assert.equal(key, SCENE_STORAGE_KEY);
      writes += 1;
      storedValue = value;
    },
    removeItem() {
      throw new Error("debug persistence policy must not remove saved data");
    },
  };
  const store = new PersistenceStore({ storage, legacyKeys: [] });
  const restoredIds = [];
  const scenePersistence = new ScenePersistence({
    store,
    serializer: {
      serialize: () => ({ schemaVersion: 3, instruments: [{ id: "debug-only", kind: "metronome" }] }),
    },
    restorer: {
      restore: async (scene) => {
        restoredIds.push(...scene.instruments.map(({ id }) => id));
        return { instruments: scene.instruments, skipped: [] };
      },
    },
  });
  const debugRuntime = { debugMode: true, scenePersistence };

  assert.deepEqual(
    await restorePersistedSceneForRuntime(debugRuntime),
    { instruments: [], skipped: [] },
  );
  assert.equal(savePersistedSceneForRuntime(debugRuntime), false);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  assert.equal(storedValue, savedProductionScene);

  const productionRuntime = { debugMode: false, scenePersistence };
  await restorePersistedSceneForRuntime(productionRuntime);
  assert.deepEqual(restoredIds, ["honk-saved"]);
  assert.equal(savePersistedSceneForRuntime(productionRuntime), true);
  assert.equal(reads, 1);
  assert.equal(writes, 1);
});

test("XR teardown still resets subsystems when persistence throws", () => {
  const events = [];
  const runtime = {
    xrSessionActive: true,
    pendingPanelPlacementFrames: 0,
    hideInstructionPanel() {},
    deletePendingSpawnPlacement() {},
    instrumentRegistry: { getByKind: () => [] },
    savePersistedSceneOnXRExit() { throw new Error("storage unavailable"); },
    resetSubsystemsAfterSession() { events.push("reset"); },
    audioSystem: { suspend() { events.push("suspend-audio"); return Promise.resolve(); } },
  };

  assert.throws(
    () => SessionRuntimeMethods.onXRSessionEnd.call(runtime, 1234),
    /storage unavailable/,
  );
  assert.deepEqual(events, ["reset", "suspend-audio"]);
  assert.equal(runtime.xrSessionActive, false);
});

test("ScenePersistence writes only when its explicit exit save is invoked", async () => {
  const writes = [];
  const persistence = new ScenePersistence({
    store: {
      load: () => ({ schemaVersion: 3, instruments: [] }),
      save: (scene) => { writes.push(scene); return true; },
    },
    serializer: { serialize: () => ({ schemaVersion: 3, instruments: [{ id: "honk-1" }] }) },
    restorer: { restore: async () => ({ instruments: [], skipped: [] }) },
  });

  await persistence.restore();
  assert.equal(writes.length, 0);
  assert.equal(persistence.save(), true);
  assert.equal(writes.length, 1);
});

test("loading a legacy scene migrates in memory without an eager storage write", () => {
  const writes = [];
  const values = new Map([[
    LEGACY_SCENE_STORAGE_KEYS[0],
    JSON.stringify({
      version: 1,
      instruments: [{
        componentId: "honk",
        position: [1, 2, 3],
        quaternion: [0, 0, 0, 1],
        baseScale: 1.5,
      }],
    }),
  ]]);
  const store = new PersistenceStore({
    storage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => writes.push({ key, value }),
      removeItem: (key) => values.delete(key),
    },
  });

  const migrated = store.load();

  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.instruments.length, 1);
  assert.equal(values.has(SCENE_STORAGE_KEY), false);
  assert.deepEqual(writes, []);
});

test("PersistenceStore reports a rejected browser write without breaking teardown", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const store = new PersistenceStore({
      storage: {
        setItem() { throw new Error("quota exceeded"); },
        getItem() { return null; },
        removeItem() {},
      },
    });

    assert.equal(store.save({ schemaVersion: 3 }), false);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});
