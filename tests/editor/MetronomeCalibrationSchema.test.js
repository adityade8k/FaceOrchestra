import test from "node:test";
import assert from "node:assert/strict";

import { SCENE_STORAGE_KEY } from "../../src/persistence/schema.js";
import { METRONOME_BODY_COLLIDER } from "../../src/config/metronome.js";
import {
  cloneMetronomeCalibration,
  colorNumberToJson,
  colorToNumber,
  createRepositoryMetronomeCalibration,
  generateMetronomeConfigJavaScript,
  METRONOME_EDITOR_AUTOSAVE_KEY,
  parseMetronomeCalibration,
  serializeMetronomeCalibration,
  validateMetronomeCalibration,
} from "../../src/editor/calibration/metronomeCalibrationSchema.js";

test("repository calibration exports deterministically regardless of input property insertion order", () => {
  const calibration = createRepositoryMetronomeCalibration();
  const baseline = serializeMetronomeCalibration(calibration);
  const port = calibration.metronome.connectionPorts[0];
  calibration.metronome.connectionPorts[0] = {
    socketDirection: port.socketDirection,
    colliderColor: port.colliderColor,
    colliderScale: port.colliderScale,
    position: port.position,
    name: port.name,
    portId: port.portId,
  };
  calibration.metronome.settings = Object.fromEntries(Object.entries(calibration.metronome.settings).reverse());
  assert.equal(serializeMetronomeCalibration(calibration), baseline);
});

test("JSON export and import round-trip without value drift", () => {
  const calibration = createRepositoryMetronomeCalibration();
  calibration.metronome.connectionPorts[0].position.x = -0.62000000001;
  const first = serializeMetronomeCalibration(calibration);
  const imported = parseMetronomeCalibration(first);
  const second = serializeMetronomeCalibration(imported);
  assert.equal(second, first);
  assert.equal(imported.metronome.connectionPorts[0].colliderColor, 0x8b5cf6);
});

test("legacy Metronome handle calibration gains a zero center without positional drift", () => {
  const calibration = createRepositoryMetronomeCalibration();
  for (const handle of calibration.metronome.handleControls) delete handle.center;
  const imported = parseMetronomeCalibration(JSON.stringify(calibration));
  for (const handle of imported.metronome.handleControls) {
    assert.deepEqual(handle.center, { x: 0, y: 0, z: 0 });
  }
});

test("invalid schemas are rejected", () => {
  const calibration = createRepositoryMetronomeCalibration();
  calibration.schemaVersion = 99;
  assert.throws(() => validateMetronomeCalibration(calibration), /schemaVersion must be 1/);
  assert.throws(() => parseMetronomeCalibration("not JSON"), /Invalid JSON/);
});

test("missing required and duplicate port IDs are rejected", () => {
  const missing = createRepositoryMetronomeCalibration();
  missing.metronome.connectionPorts.pop();
  assert.throws(() => validateMetronomeCalibration(missing), /Missing required port IDs: port-3/);

  const duplicate = createRepositoryMetronomeCalibration();
  duplicate.metronome.connectionPorts[3].portId = "port-2";
  assert.throws(() => validateMetronomeCalibration(duplicate), /Duplicate port IDs: port-2/);
});

test("zero-length socket directions are rejected", () => {
  const calibration = createRepositoryMetronomeCalibration();
  calibration.metronome.connectionPorts[0].socketDirection = { x: 0, y: 0, z: 0 };
  assert.throws(() => serializeMetronomeCalibration(calibration), /socketDirection cannot be zero-length/);
});

test("JSON colors and paste-ready JavaScript colors convert consistently", async () => {
  assert.equal(colorNumberToJson(0x8b5cf6), "#8b5cf6");
  assert.equal(colorToNumber("#8b5cf6"), 0x8b5cf6);
  assert.equal(colorToNumber("0x8b5cf6"), 0x8b5cf6);
  assert.throws(() => colorToNumber("purple"), /Invalid color/);

  const calibration = createRepositoryMetronomeCalibration();
  const json = serializeMetronomeCalibration(calibration);
  assert.match(json, /"colliderColor": "#8b5cf6"/);
  const source = generateMetronomeConfigJavaScript(calibration);
  assert.match(source, /colliderColor: 0x8b5cf6/);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const generated = await import(moduleUrl);
  assert.equal(generated.METRONOME_CONNECTION_PORTS[0].colliderColor, 0x8b5cf6);
});

test("custom models export without claiming a repository asset path", () => {
  const calibration = createRepositoryMetronomeCalibration();
  calibration.modelPath = null;
  calibration.modelFileName = "corrected-metronome.glb";
  const parsed = JSON.parse(serializeMetronomeCalibration(calibration));
  assert.equal(parsed.modelPath, null);
  assert.equal(parsed.modelFileName, "corrected-metronome.glb");
});

test("editor autosave storage is isolated from production scene persistence", () => {
  assert.equal(METRONOME_EDITOR_AUTOSAVE_KEY, "face-orchestra-metronome-editor-v1");
  assert.notEqual(METRONOME_EDITOR_AUTOSAVE_KEY, SCENE_STORAGE_KEY);
});

test("repository state clones are mutable without mutating imported frozen config", () => {
  const first = createRepositoryMetronomeCalibration();
  const second = cloneMetronomeCalibration(first);
  second.metronome.connectionPorts[0].position.x = 123;
  assert.notEqual(second.metronome.connectionPorts[0].position.x, first.metronome.connectionPorts[0].position.x);
});

test("legacy metronome body-box calibration remains import-compatible", () => {
  assert.deepEqual(METRONOME_BODY_COLLIDER, {
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 0.7, y: 0.8, z: 0.8 },
  });
});
