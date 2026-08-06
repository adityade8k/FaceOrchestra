import test from "node:test";
import assert from "node:assert/strict";

import { PendingSpawnSafeRuntimeMethods } from "../../src/app/runtime/PendingSpawnSafeRuntime.js";

test("spawn-preview safe mode advances clocks, linked Loopers, voices, and wires in order", () => {
  const calls = [];
  const runtime = Object.assign({}, PendingSpawnSafeRuntimeMethods);
  for (const method of [
    "validateMetronomeConnections",
    "clearLiveHornInteractionState",
    "updateMetronomes",
    "updateClockedLooperTransports",
    "updateLooperRecordings",
    "updateLooperPlayback",
    "updateMetronomeConnections",
    "applyResolvedHonkPerformanceStates",
    "updateLooperMorphAnimations",
    "updateLooperWires",
    "updateMetronomeConnectionWires",
  ]) {
    runtime[method] = (now) => calls.push([method, now]);
  }

  runtime.updateLooperPlaybackDuringPendingSpawn(4242);
  assert.deepEqual(calls.map(([method]) => method), [
    "validateMetronomeConnections",
    "clearLiveHornInteractionState",
    "updateMetronomes",
    "updateClockedLooperTransports",
    "updateLooperRecordings",
    "updateLooperPlayback",
    "updateMetronomeConnections",
    "applyResolvedHonkPerformanceStates",
    "updateLooperMorphAnimations",
    "updateLooperWires",
    "updateMetronomeConnectionWires",
  ]);
  assert.equal(calls[2][1], 4242);
  assert.equal(calls[3][1], 4242);
  assert.equal(calls[6][1], 4242);
});
