import test from "node:test";
import assert from "node:assert/strict";

import { LooperGestureApplier } from "../../../src/instruments/looper/LooperGestureApplier.js";
import { LooperTrack } from "../../../src/instruments/looper/LooperTrack.js";
import {
  LooperTransport,
  LooperTransportState,
} from "../../../src/instruments/looper/LooperTransport.js";
import { HONK_RELEASE_SETTINGS } from "../../../src/config/audio.js";

test("LooperTransport records and finishes in a stopped state", () => {
  const transport = new LooperTransport();

  assert.equal(transport.state, LooperTransportState.STOPPED);
  assert.equal(transport.record().accepted, true);
  assert.equal(transport.recording, true);
  assert.equal(transport.finishRecording().accepted, true);
  assert.equal(transport.state, LooperTransportState.STOPPED);
});

test("LooperTransport rejects playback while recording", () => {
  const transport = new LooperTransport();
  transport.record();

  const result = transport.play();

  assert.equal(result.accepted, false);
  assert.equal(transport.state, LooperTransportState.RECORDING);
});

test("LooperTransport pauses and resumes without marking a restart", () => {
  const transport = new LooperTransport();
  transport.play();
  transport.pause();

  const result = transport.play();

  assert.equal(result.accepted, true);
  assert.equal(result.resumed, true);
  assert.equal(result.restarted, false);
  assert.equal(transport.state, LooperTransportState.PLAYING);
});

test("LooperTransport requires an explicit restart while already playing", () => {
  const transport = new LooperTransport();
  transport.play();

  assert.equal(transport.play().accepted, false);
  const restart = transport.play({ restart: true });
  assert.equal(restart.accepted, true);
  assert.equal(restart.restarted, true);
});

test("LooperTransport safely handles invalid pause and reset", () => {
  const transport = new LooperTransport();

  assert.equal(transport.pause().accepted, false);
  transport.record();
  const reset = transport.reset();

  assert.equal(reset.reset, true);
  assert.equal(transport.stopped, true);
});

test("stopping transport clears applied Honk automation", () => {
  const cleared = [];
  const applier = new LooperGestureApplier({
    isPlayableHonkId: (honkId) => honkId === "honk-a",
    setAutomationLayerByHonkId() {},
    clearAutomationLayerByHonkId: (honkId, layerId) => cleared.push({ honkId, layerId }),
  });
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-a" });
  const looper = { id: "looper-a", looperData: { tracks: [track] } };
  const transport = new LooperTransport();

  transport.play();
  applier.applyTrackSnapshot(looper, track, { squeeze: 0.75, bend: 0.1 });
  assert.equal(applier.appliedTracks.size, 1);

  transport.stop();
  applier.clearLooper(looper);

  assert.equal(transport.state, LooperTransportState.STOPPED);
  assert.equal(applier.appliedTracks.size, 0);
  assert.deepEqual(cleared, [{
    honkId: "honk-a",
    layerId: "looper-looper-a:track-0",
  }]);
});

test("Looper note-off updates only its named performance layer", () => {
  const layerUpdates = [];
  const applier = new LooperGestureApplier({
    isPlayableHonkId: (honkId) => honkId === "honk-a",
    setAutomationLayerByHonkId: (honkId, layerId, snapshot) => {
      layerUpdates.push({ honkId, layerId, squeeze: snapshot.squeeze });
    },
  });
  const track = new LooperTrack({ index: 0, connectedHonkId: "honk-a" });
  const looper = { id: "looper-a", looperData: { tracks: [track] } };

  applier.applyTrackSnapshot(looper, track, { squeeze: 0.75 });
  applier.applyTrackSnapshot(looper, track, { squeeze: 0 });

  assert.deepEqual(layerUpdates, [
    { honkId: "honk-a", layerId: "looper-looper-a:track-0", squeeze: 0.75 },
    { honkId: "honk-a", layerId: "looper-looper-a:track-0", squeeze: 0 },
  ]);
});
