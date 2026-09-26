import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleIndex } from "../../scripts/capture/sampleIndex.mjs";
import { ChunkedTimeline } from "../../src/capture/ChunkedTimeline.js";
import { Timeline } from "../../src/capture/Timeline.js";

test("30-minute indexed fixture matches whole-take random/sequential seeks with bounded cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "honk-index-"));
  try {
    const packets = Array.from({ length: 18000 }, (_, i) => ({
      stream: "samples",
      seq: i,
      t: i / 10,
      data: {
        full: i % 10 === 0,
        segment: i < 9000 ? 0 : 1,
        nodes: { a: { x: [i, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], morphs: 0 } },
        xr: { viewer: null, controllers: [] },
      },
    }));
    const file = join(root, "samples.ndjson");
    await writeFile(
      file,
      packets.map((p) => JSON.stringify(p)).join("\n") + '\n{"partial":',
    );
    const index = await sampleIndex(file),
      bytes = await readFile(file),
      full = new Timeline(packets);
    assert.equal(index.frames, 18000);
    assert.equal(index.chunks.length, 1800);
    const bounded = new ChunkedTimeline(index, [], [], async (start, end) =>
      bytes
        .subarray(start, end + 1)
        .toString()
        .trim()
        .split("\n")
        .map(JSON.parse),
    );
    for (const t of [
      0,
      0.95,
      5.12,
      1300.15,
      899.95,
      1799.9,
      7,
      ...Array.from({ length: 200 }, (_, i) => i * 0.13),
    ]) {
      await bounded.ensure(t);
      assert.deepEqual(bounded.seek(t), full.seek(t), `time ${t}`);
      assert.ok(bounded.cache.size <= 3);
    }
    bounded.dispose();
    assert.equal(bounded.cache.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rapid scrubbing bounds in-flight ranges as well as cached chunks", async () => {
  let active = 0,
    peak = 0;
  const index = {
    duration: 19,
    chunks: Array.from({ length: 20 }, (_, i) => ({
      t: i,
      offset: i,
      end: i,
      segment: 0,
    })),
  };
  const timeline = new ChunkedTimeline(index, [], [], async (start) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return [
      {
        t: start,
        data: { full: true, segment: 0, nodes: {}, xr: { controllers: [] } },
      },
    ];
  });
  await Promise.all(Array.from({ length: 20 }, (_, i) => timeline.ensure(i)));
  assert.equal(peak, 2);
  assert.equal(timeline.pending.size, 0);
  assert.equal(timeline.cache.size, 3);
  timeline.dispose();
});
