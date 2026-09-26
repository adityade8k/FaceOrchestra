import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeMidi } from "midi-file";

test("CLI rejection preserves current files and a versioned re-import retains original provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "honk-midi-cli-"));
  const output = join(root, "imported"),
    input = join(root, "source.mid"),
    options = join(root, "options.json");
  const command = () =>
    promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("../../scripts/midi/import.mjs", import.meta.url)),
      input,
      output,
      options,
    ]);
  const midi = (pitch) =>
    Buffer.from(
      writeMidi({
        header: { format: 0, ticksPerBeat: 480 },
        tracks: [
          [
            {
              deltaTime: 0,
              type: "noteOn",
              channel: 0,
              noteNumber: pitch,
              velocity: 80,
            },
            {
              deltaTime: 480,
              type: "noteOff",
              channel: 0,
              noteNumber: pitch,
              velocity: 32,
            },
            { deltaTime: 0, meta: true, type: "endOfTrack" },
          ],
        ],
      }),
    );
  const config = {
    id: "cli-fixture",
    title: "CLI fixture",
    version: 1,
    live: { track: 0, channel: 0, port: 0 },
  };
  try {
    const original = midi(60);
    await writeFile(input, original);
    await writeFile(options, JSON.stringify(config));
    await command();
    const before = new Map(
      await Promise.all(
        (await readdir(output)).map(async (name) => [
          name,
          await readFile(join(output, name)),
        ]),
      ),
    );
    const previous = JSON.parse(before.get("composition.json"));
    await writeFile(input, midi(64));
    await assert.rejects(
      command(),
      /Changed source needs a new content version/,
    );
    assert.deepEqual((await readdir(output)).sort(), [...before.keys()].sort());
    for (const [name, content] of before)
      assert.deepEqual(await readFile(join(output, name)), content);
    await writeFile(options, JSON.stringify({ ...config, version: 2 }));
    await command();
    const current = JSON.parse(
      await readFile(join(output, "composition.json"), "utf8"),
    );
    assert.equal(current.contentVersion, 2);
    assert.notEqual(current.contentHash, previous.contentHash);
    assert.deepEqual(
      await readFile(join(output, `${previous.source.sha256}.mid`)),
      original,
    );
    assert.deepEqual(
      await readFile(join(output, previous.normalizedSource.file)),
      before.get(previous.normalizedSource.file),
    );
    const [version] = await readdir(join(output, "versions"));
    const archived = join(output, "versions", version);
    assert.deepEqual(
      JSON.parse(await readFile(join(archived, "composition.json"), "utf8")),
      previous,
    );
    assert.deepEqual(
      await readFile(join(archived, previous.normalizedSource.file)),
      before.get(previous.normalizedSource.file),
    );
    assert.deepEqual(
      await readFile(join(archived, `${previous.source.sha256}.mid`)),
      original,
    );
    const stable = await readFile(join(output, "composition.json"));
    await command();
    assert.deepEqual(await readFile(join(output, "composition.json")), stable);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
