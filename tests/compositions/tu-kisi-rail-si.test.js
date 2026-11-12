import { runtimeOwners } from "../helpers/runtimeOwners.js";
import test from "node:test";
import { Group } from "three";
import assert from "node:assert/strict";

import { definition } from "../../src/compositions/songs/tu-kisi-rail-si/index.js";
import { compositionRegistry, libraryPage } from "../../src/compositions/CompositionRegistry.js";
import { validateLiveMelody } from "../../src/tutorial/live-melody/score.js";
import { assessMelody, MelodyGuidance } from "../../src/compositions/MelodyScore.js";
import { LiveMelodyEnsemble } from "../../src/tutorial/live-melody/LiveMelodyEnsemble.js";
import { MetronomeInstrument } from "../../src/instruments/metronome/MetronomeInstrument.js";
test("Tu Kisi Rail Si keeps all 159 notes and its opening rest", () => {
  assert.equal(definition.score.events.length, 159);
  assert.equal(definition.bpm, 120);
  assert.equal(definition.score.events[0].beat, 1346 / 480);
});

test("each distinct pitch has one shared Honk for every repeated note and either hand", () => {
  const honks = definition.arrangement.recipes.filter((r) => r.kind === "honk");
  const pitches = new Set(definition.score.events.map((e) => e.midi));
  assert.equal(honks.length, 10);
  assert.equal(honks.length, pitches.size);
  assert.equal(definition.requirements.maxHonks, honks.length);
  assert.deepEqual(new Set(honks.map((r) => r.midi)), pitches);
  for (const recipe of honks) {
    const repeated = definition.score.events.filter((e) => e.midi === recipe.midi);
    assert.ok(repeated.every((e) => e.role === recipe.role));
    assert.equal(recipe.hand, undefined, "A shared target must not be assigned to just one hand");
  }
  assert.ok(
    honks.some(
      (r) =>
        new Set(definition.score.events.filter((e) => e.role === r.role).map((e) => e.hand))
          .size === 2,
    ),
    "Both demonstration hands reuse shared targets",
  );
});

test("two-hand holds and 15 phrases cover the whole song without cutting or excluding notes", () => {
  const events = definition.score.events,
    ends = { L: 0, R: 0 };
  let overlaps = 0;
  for (const e of events) {
    assert.ok(e.beat >= ends[e.hand] - 1e-9);
    if (e.beat < ends[e.hand === "R" ? "L" : "R"]) overlaps++;
    ends[e.hand] = e.beat + e.beats;
  }
  assert.ok(overlaps > 0);
  const phrases = definition.lessons.filter((l) => !l.completePerformance);
  assert.equal(phrases.length, 15);
  assert.deepEqual(
    phrases.flatMap((l) => l.eventIds),
    events.map((e) => e.id),
  );
  assert.deepEqual(
    definition.lessons.at(-1).eventIds,
    events.map((e) => e.id),
  );
  assert.equal(validateLiveMelody(definition), definition);
  for (const mutate of [
    (d) =>
      d.arrangement.recipes.push({ kind: "looper", role: "loop", position: [0, 0, 0], scale: 1 }),
    (d) => {
      d.score.events[1].beat = d.score.events[0].beat;
      d.score.events[1].hand = d.score.events[0].hand;
    },
    (d) => (d.lessons[0].endBeat = d.score.events[0].beat + 0.1),
    (d) => d.lessons.at(-1).eventIds.pop(),
  ]) {
    const invalid = structuredClone(definition);
    mutate(invalid);
    assert.throws(() => validateLiveMelody(invalid), /Invalid live melody/);
  }
});

test("both libraries load a live-only arrangement with no Looper recipes or backing", async () => {
  const module = await compositionRegistry.load("tu-kisi-rail-si");
  for (const library of ["tutorials", "record-songs"]) {
    const entries = [];
    for (let i = 0; i < libraryPage(compositionRegistry, library).pages; i++)
      entries.push(...libraryPage(compositionRegistry, library, i).rows);
    assert.ok(entries.some((e) => e.id === definition.id && e.title === "Tu Kisi Rail Si"));
  }
  assert.equal(module.definition, definition);
  assert.equal(typeof module.enterTutorial, "function");
  assert.equal(definition.requirements.maxLoopers, 0);
  assert.ok(definition.arrangement.recipes.every((r) => r.kind !== "looper"));
  assert.deepEqual(definition.arrangement.backing, []);
});

test("practice assesses all live notes, accepts either hand and never credits a demonstration", () => {
  const lesson = definition.lessons.at(-1);
  const heard = definition.score.events.map((e) => ({
    origin: "learner",
    kind: "note",
    released: true,
    voiced: true,
    midis: [e.midi],
    startMs: e.beat * 500,
    endMs: (e.beat + e.beats) * 500,
    hand: e.hand === "R" ? "L" : "R",
  }));
  assert.equal(assessMelody(definition, lesson, heard, (t) => t / 500).ok, true);
  assert.equal(assessMelody(definition, lesson, [], (t) => t / 500).ok, false);
  assert.equal(
    assessMelody(
      definition,
      lesson,
      heard.map((e) => ({ ...e, origin: "demonstration" })),
      (t) => t / 500,
    ).correct,
    0,
  );
});

test("live-only scheduling shares the count-in clock, starts no melody and stops cleanly at the score end", () => {
  const metro = new MetronomeInstrument({ bpm: 120, root: new Group() });
  let releases = 0,
    updates = 0;
  const host = runtimeOwners({
    r: {
      updateMetronomeLabel() {},
      audioSystem: { audioContextService: { context: { state: "running" } } },
    },
    adapter: {
      get: () => metro,
      releaseAll() {
        releases++;
      },
      focus() {},
    },
  });
  const ensemble = new LiveMelodyEnsemble(host, definition);
  ensemble.metro = metro;
  ensemble.originalSetBpm = metro.setBpm;
  ensemble.validate = () => true;
  ensemble.showMelody = () => {};
  ensemble.hands = {
    release() {},
    update() {
      updates++;
    },
    play() {
      assert.fail("A learner note was automated");
    },
  };
  ensemble.schedule({ countAt: 1000, beatZero: 3000 });
  const guide = new MelodyGuidance(ensemble, definition);
  assert.equal(guide.beatAt(1000), -4);
  assert.equal(guide.beatAt(3000), 0);
  ensemble.update(4000);
  assert.equal(guide.beatAt(4000), 2);
  assert.equal(ensemble.beatAtWall(4000), 2);
  ensemble.update(3000 + definition.score.durationBeats * 500);
  assert.ok(guide.complete(3000 + definition.score.durationBeats * 500));
  assert.equal(metro.playing, false);
  assert.ok(releases >= 2 && updates > 0);
});
