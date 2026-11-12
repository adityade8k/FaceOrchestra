import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import expected from "../fixtures/retained-music.json" with { type: "json" };
import { compositionRegistry, libraryPage } from "../../src/compositions/CompositionRegistry.js";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
for (const entry of compositionRegistry
  .list()
  .filter((entry) => Object.hasOwn(expected, entry.id))) {
  test(`${entry.id}: current music, layouts and lesson behavior remain exact`, async () => {
    const { definition: d } = await compositionRegistry.load(entry.id);
    const musical = {
      bpm: d.bpm,
      sourceBpm: d.sourceBpm,
      practiceBpm: d.practiceBpm,
      maxBpm: d.maxBpm,
      pitchBendRange: d.pitchBendRange,
      score: d.score,
      backing: d.arrangement.backing ?? [],
      liveEvents: d.arrangement.liveEvents ?? [],
      recipes: d.arrangement.recipes,
      lessons: d.lessons.map(({ moves, ...lesson }) => lesson),
      recording: d.recording,
      requirements: d.requirements,
    };
    for (const [key, value] of Object.entries(musical))
      assert.equal(value === undefined ? null : hash(value), expected[d.id][key], key);
  });
}

test("both libraries expose all six songs", () => {
  const ids = [
    "virag-2-jog-study",
    "kuch-to-hua-hai",
    "rishte-naate",
    "tu-kisi-rail-si",
    "nazariya-honk-bends",
    "alfaaz",
  ];
  for (const mode of ["tutorials", "record-songs"]) {
    const rows = Array.from(
      { length: libraryPage(compositionRegistry, mode).pages },
      (_, page) => libraryPage(compositionRegistry, mode, page).rows,
    )
      .flat()
      .filter((row) => row.id !== "basics");
    assert.deepEqual(
      rows.map((row) => row.id),
      ids,
    );
    assert.equal(rows.at(-1).title, "Alfaaz");
  }
});
