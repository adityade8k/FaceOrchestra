import test from "node:test";
import assert from "node:assert/strict";
import { FaceOrchestraApp } from "../../src/app/FaceOrchestraApp.js";

test("the frame captures looper input after current Honk intent is resolved", () => {
  const phases = new Map(),
    calls = [];
  let input = "previous frame",
    recorded;
  const runtime = {
    updateMetronomeConnections(now) {
      calls.push(["connections", now]);
    },
    updateHorn(now) {
      calls.push(["honk", now]);
      input = "current frame";
    },
    updateLooperRecordings(now) {
      calls.push(["record", now]);
      recorded = input;
    },
  };
  FaceOrchestraApp.prototype.configureFramePhases.call({
    runtime,
    frameScheduler: {
      add(phase, callback) {
        phases.set(phase, callback);
      },
    },
  });
  phases.get("PERFORMANCE")({ now: 123 });
  assert.equal(recorded, "current frame");
  assert.deepEqual(calls, [
    ["connections", 123],
    ["honk", 123],
    ["record", 123],
  ]);
});
