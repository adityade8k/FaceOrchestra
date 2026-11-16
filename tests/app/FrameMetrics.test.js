import test from "node:test";
import assert from "node:assert/strict";
import { FrameMetrics } from "../../src/app/FrameMetrics.js";
test("profiling is bounded, chronological, and returns detached reports", () => {
  const metrics = new FrameMetrics(2);
  const runtime = {
    instrumentRegistry: { size: 3 },
    audioSystem: {
      honkVoices: {
        voices: new Map([[1, {}]]),
        releasingVoices: new Map([[2, new Set([{}, {}])]]),
      },
    },
    capture: { inflight: 2, inflightBytes: 42 },
  };
  const renderer = {
    info: { render: { calls: 9, triangles: 120 }, memory: { geometries: 2, textures: 1 } },
  };
  for (let now = 0; now < 3; now++) {
    metrics.record("RENDER", now);
    metrics.finish(now, runtime, renderer);
  }
  const report = metrics.snapshot();
  assert.deepEqual(
    report.samples.map((s) => s.now),
    [1, 2],
  );
  assert.equal(report.samples[1].releasingVoices, 2);
  assert.equal(report.samples[1].captureInflightBytes, 42);
  report.samples[1].phases.RENDER = 100;
  assert.equal(metrics.snapshot().samples[1].phases.RENDER, 2);
});
