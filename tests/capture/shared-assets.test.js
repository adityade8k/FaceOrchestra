import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SharedAssetStore } from "../../scripts/capture/assets.mjs";
test("takes retain portable files backed by one immutable hash object", async () => {
  const root = await mkdtemp(join(tmpdir(), "honk-assets-"));
  try {
    const source = join(root, "source.glb");
    await writeFile(source, "fixture-model-bytes");
    const assets = new SharedAssetStore(join(root, ".assets"));
    const a = join(root, "a", "model.glb"),
      b = join(root, "b", "model.glb");
    const hash = await assets.snapshot(source, a);
    await assets.snapshot(source, b, hash);
    assert.equal((await stat(a)).ino, (await stat(b)).ino);
    assert.equal(await readFile(a, "utf8"), "fixture-model-bytes");
    await writeFile(source, "new-model");
    await assert.rejects(
      assets.snapshot(source, join(root, "c.glb"), hash),
      /changed/,
    );
    assert.equal(await readFile(a, "utf8"), "fixture-model-bytes");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
