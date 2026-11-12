import test from "node:test";
import assert from "node:assert/strict";

import { runtimeOwners } from "../helpers/runtimeOwners.js";

test("spawn-preview safe mode advances clocks, linked Loopers, voices, and wires in order", () => {
  const calls = [];
  const runtime = runtimeOwners({});
  for (const [owner, method] of [
    [runtime.metronomeConnections, "validateMetronomeConnections"],
    [runtime, "clearLiveHornInteractionState"],
    [runtime.presentation, "updateMetronomes"],
    [runtime, "updateClockedLooperTransports"],
    [runtime, "updateLooperRecordings"],
    [runtime, "updateLooperPlayback"],
    [runtime.metronomeConnections, "updateMetronomeConnections"],
    [runtime, "applyResolvedHonkPerformanceStates"],
    [runtime, "updateLooperPlaybackAudio"],
    [runtime, "updateLooperMorphAnimations"],
    [runtime.looperConnections, "updateLooperWires"],
    [runtime.metronomeConnections, "updateMetronomeConnectionWires"],
  ]) {
    owner[method] = (now) => calls.push([method, now]);
  }

  runtime.spawn.updateLooperPlaybackDuringPendingSpawn(4242);
  assert.deepEqual(
    calls.map(([method]) => method),
    [
      "validateMetronomeConnections",
      "clearLiveHornInteractionState",
      "updateMetronomes",
      "updateClockedLooperTransports",
      "updateLooperRecordings",
      "updateLooperPlayback",
      "updateMetronomeConnections",
      "applyResolvedHonkPerformanceStates",
      "updateLooperPlaybackAudio",
      "updateLooperMorphAnimations",
      "updateLooperWires",
      "updateMetronomeConnectionWires",
    ],
  );
  assert.equal(calls[2][1], 4242);
  assert.equal(calls[3][1], 4242);
  assert.equal(calls[6][1], 4242);
});
