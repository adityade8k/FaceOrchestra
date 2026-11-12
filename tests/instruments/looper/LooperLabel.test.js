import test from "node:test";
import assert from "node:assert/strict";
import { createHarness, setHonk } from "../../helpers/looperCaptureHarness.js";
import { getLooperLabelText } from "../../../src/instruments/looper/looperLabel.js";

test("looper labels show selected beat limits, with gap on its own line", () => {
  const h = createHarness({ connected: true, trackCount: 1 });
  assert.equal(getLooperLabelText(h.looper, 0), "0 gap\n16 beats");
  for (const [value, beats] of [
    [-0.5, 2],
    [0, 4],
    [0.5, 8],
    [1, 16],
  ]) {
    h.controller.setControlValue(h.looper, "recordLength", value);
    assert.equal(getLooperLabelText(h.looper, 0), `0 gap\n${beats} beats`);
  }
});

test("open recording counts real beats and preserves the saved duration through gap changes and reload", () => {
  const h = createHarness({ connected: true, trackCount: 1 });
  h.looper.looperController = h.controller;
  h.controller.setControlValue(h.looper, "recordLength", -1);
  assert.equal(getLooperLabelText(h.looper, 0), "0 gap\n0 beats");
  h.controller.recording.startRecording(h.looper, 0);
  assert.equal(
    getLooperLabelText(h.looper, 2000),
    "0 gap\n0 beats",
    "Arming does not count silence",
  );
  setHonk(h, 0, 2250, 1);
  assert.equal(getLooperLabelText(h.looper, 2250), "0 gap\n0 beats");
  assert.equal(getLooperLabelText(h.looper, 2500), "0 gap\n1 beat");
  setHonk(h, 0, 2750, 0);
  assert.equal(getLooperLabelText(h.looper, 3000), "0 gap\n2 beats");
  h.controller.recording.stopRecording(h.looper, 3750);
  assert.equal(getLooperLabelText(h.looper, 4000), "0 gap\n3.5 beats");
  h.controller.setControlValue(h.looper, "gap", -0.5);
  assert.ok(h.looper.looperData.gapBeats > 0);
  const savedText = getLooperLabelText(h.looper, 5000);
  assert.equal(
    savedText,
    `${h.looper.looperData.gapBeats} gap\n3.5 beats`,
    "Gap is excluded from phrase beats",
  );
  const saved = h.controller.stateCodec.serializeState(h.looper);
  h.controller.stateCodec.restoreState(h.looper, saved, { preserveConnections: true });
  assert.equal(getLooperLabelText(h.looper, 6000), savedText);
  h.controller.recording.startRecording(h.looper, 6500);
  assert.equal(
    getLooperLabelText(h.looper, 7000),
    `${h.looper.looperData.gapBeats} gap\n0 beats`,
    "A new armed take resets the count rather than showing the last recording length",
  );
});
