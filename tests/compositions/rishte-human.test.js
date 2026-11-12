import { runtimeOwners } from "../helpers/runtimeOwners.js";
import test from "node:test";
import assert from "node:assert/strict";

import { compilePattern } from "../../src/compositions/CompositionCompiler.js";
import { compositionRegistry } from "../../src/compositions/CompositionRegistry.js";
import { validateRishte, assessMelody, beatAtTime } from "../../src/compositions/MelodyScore.js";
import { splitPatterns } from "../../src/compositions/BackingPatterns.js";
import { MelodyHands } from "../../src/tutorial/MelodyHands.js";
import d from "../../src/compositions/songs/rishte-naate/definition.json" with { type: "json" };

test("Rishte keeps 175 live notes and 121 backing notes without duplicate assignments", () => {
  validateRishte(d);
  assert.equal(d.bpm, 100);
  assert.equal(d.sourceBpm, 115);
  assert.equal(d.practiceBpm, 75);
  assert.equal(d.score.events.length, 175);
  assert.equal(d.arrangement.backing.length, 121);
  const all = [...d.score.events, ...d.arrangement.backing];
  assert.equal(new Set(all.map((e) => e.id)).size, 296);
  assert.ok(d.arrangement.backing.some((e) => e.id === "t0-e101" && e.midi === 83));
  assert.ok(d.score.events.some((e) => e.id === "t0-e693" && e.midi === 83));
  assert.ok(d.score.events.some((e) => e.id === "t0-e124"));
});

test("two hands keep exact overlapping holds; fast phrases slow down without deleting notes", () => {
  const pos = new Map(d.arrangement.recipes.map((r) => [r.role, r]));
  assert.equal(d.score.events.filter((e) => e.hand === "R").length, 115);
  for (const hand of ["R", "L"]) {
    const es = d.score.events.filter((e) => e.hand === hand);
    for (const [i, e] of es.entries()) {
      assert.equal(pos.get(e.role).hand, hand);
      assert.ok(hand === "R" ? pos.get(e.role).position[0] > 0 : pos.get(e.role).position[0] < 0);
      if (i) assert.ok(e.beat >= es[i - 1].beat + es[i - 1].beats - 1e-9);
    }
  }
  for (const l of d.lessons.filter((l) => !l.completePerformance)) {
    assert.ok(l.endBeat - l.startBeat <= 12);
    for (const hand of ["R", "L"]) {
      const events = d.score.events.filter((e) => e.hand === hand && l.eventIds.includes(e.id));
      assert.ok(
        events
          .slice(1)
          .every((e, i) => ((e.beat - events[i].beat) * 60000) / l.recommendedBpm >= 500 - 1e-7),
      );
    }
  }
  assert.equal(d.lessons[2].recommendedBpm, 50);
  assert.equal(d.lessons[8].recommendedBpm, 40);
  assert.ok(
    d.score.events.some((e, i, all) =>
      all.some(
        (other) => other.id !== e.id && other.beat <= e.beat && other.beat + other.beats > e.beat,
      ),
    ),
  );
});

test("backing uses exact supported Looper windows including genuine silent windows", () => {
  const ids = [];
  for (const b of splitPatterns(d.arrangement.backing, 0, d.score.durationBeats))
    for (const p of b.patterns) {
      const roles = [...new Set(p.events.map((e) => e.role))];
      assert.ok(roles.length <= 7);
      const routes = Object.fromEntries(
        roles.map((role, i) => [role, { trackId: `track-${i + 1}`, trackIndex: i + 1 }]),
      );
      const timeline = compilePattern({ ...p, routes, beatMs: 60000 / d.bpm });
      if (p.events.length) assert.equal(timeline.durationMs, (b.beats * 60000) / d.bpm);
      else assert.equal(timeline.hasRecording(), false);
      for (const e of p.events) {
        const n = d.arrangement.backing.find((n) => n.id === e.id);
        ids.push(e.id);
        assert.ok(Math.abs(b.beat + e.beat - n.beat) < 1e-9);
        assert.ok(Math.abs(e.beats - n.beats) < 1e-9);
      }
      for (const track of timeline.tracks.values())
        for (const e of track.events) {
          if (e.type === "gestureSnapshot") assert.deepEqual(e.values, { squeeze: 1, bend: 0 });
          if (e.type === "squeezeEnd") assert.equal(e.releaseOrigin, "controller");
        }
    }
  assert.equal(ids.length, 121);
  assert.equal(new Set(ids).size, 121);
  for (const l of d.lessons) {
    const blocks = splitPatterns(d.arrangement.backing, l.startBeat, l.endBeat);
    assert.ok(blocks.length);
    for (const b of blocks)
      for (const p of b.patterns)
        for (const e of p.events) {
          assert.ok(e.beat >= -1e-9 && e.beat + e.beats <= b.beats + 1e-9);
          assert.ok(!d.score.events.some((m) => m.id === e.id));
        }
  }
});

test("assessment accepts either hand, ignores preview and follows tempo through an overlap", () => {
  const lesson = d.lessons[2],
    start = lesson.startBeat;
  const history = [
    { atMs: 1000, beat: start, bpm: 75 },
    { atMs: 3000, beat: start + 2.5, bpm: 50 },
  ];
  const time = (beat) =>
    beat <= start + 2.5 ? 1000 + (beat - start) * 800 : 3000 + (beat - start - 2.5) * 1200;
  const heard = d.score.events
    .filter((e) => lesson.eventIds.includes(e.id))
    .map((e) => ({
      kind: "note",
      origin: "learner",
      released: true,
      voiced: true,
      midis: [e.midi],
      hand: e.hand === "R" ? "L" : "R",
      role: "another-same-pitch-honk",
      startMs: time(e.beat),
      endMs: time(e.beat + e.beats),
    }));
  assert.equal(assessMelody(d, lesson, heard, (t) => beatAtTime(history, t)).ok, true);
  assert.equal(
    assessMelody(
      d,
      lesson,
      heard.map((e) => ({ ...e, origin: "demonstration" })),
      (t) => beatAtTime(history, t),
    ).correct,
    0,
  );
});

test("preview starts a left-first pair in score order even within one render frame", () => {
  const down = {},
    sounding = {},
    attacks = [];
  const updateHorn = () => {
    for (const hand of ["R", "L"]) {
      if (down[hand] && !sounding[hand]) attacks.push(down[hand]);
      sounding[hand] = down[hand];
    }
  };
  const hands = {
    notes: {},
    a: { observe() {} },
    r: runtimeOwners({ updateHorn }),
    trigger(hand, role, active) {
      down[hand] = active ? role : null;
    },
  };
  const pair = [
    { id: "first", hand: "L", role: "left-note", beat: 0, beats: 0.5 },
    { id: "second", hand: "R", role: "right-note", beat: 0.01, beats: 0.5 },
  ];
  MelodyHands.prototype.play.call(hands, pair, 0.02, 100);
  updateHorn();
  assert.deepEqual(attacks, ["left-note", "right-note"]);
  MelodyHands.prototype.play.call(hands, pair, 0.2, 200);
  updateHorn();
  assert.equal(attacks.length, 2, "held notes must not be retriggered");
  MelodyHands.prototype.play.call(hands, pair, 0.6, 600);
  updateHorn();
  assert.ok(!sounding.R && !sounding.L);
});

test("catalog loads content version 3 and rejects impossible same-hand overlaps or sound overrides", async () => {
  const module = await compositionRegistry.load("rishte-naate");
  assert.equal(module.definition.contentVersion, 3);
  for (const mutate of [
    (x) => {
      x.score.events[1].beat = x.score.events[0].beat;
      x.score.events[1].hand = x.score.events[0].hand;
    },
    (x) => (x.arrangement.recipes[0].vowel = "O"),
    (x) => (x.arrangement.backing[0].midi = 999),
  ]) {
    const value = structuredClone(d);
    mutate(value);
    assert.throws(() => validateRishte(value));
  }
});
