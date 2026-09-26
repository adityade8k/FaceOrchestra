import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TakeStore } from "../../scripts/capture/storage.mjs";

test("20 finalized attempts close all writers, browsing opens none, and duplicate finalization is safe", async () => {
  const root = await mkdtemp(join(tmpdir(), "honk-lifetime-"));
  const store = new TakeStore(root);
  try {
    for (let i = 0; i < 20; i++) {
      const id = `take-${i}`;
      await store.create({
        id,
        version: 1,
        audio: { sampleRate: 48000, channels: 2 },
      });
      const packet = {
        stream: "samples",
        seq: 0,
        t: 0,
        data: { full: true, nodes: {} },
      };
      await Promise.all([store.append(id, packet), store.append(id, packet)]);
      const options = {
        expected: { samples: 0, events: -1, audio: -1 },
        reason: "stop",
      };
      const [a, b] = await Promise.all([
        store.finalize(id, options),
        store.finalize(id, options),
      ]);
      assert.equal(a.complete, true);
      assert.deepEqual(a, b);
      assert.equal(store.takes.size, 0);
      await store.read(id);
      assert.equal(store.takes.size, 0);
    }
    assert.equal((await store.list()).length, 20);
    await Promise.all([store.close(), store.close()]);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
