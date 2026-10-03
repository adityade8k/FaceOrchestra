import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compilePattern } from "../../src/compositions/CompositionCompiler.js";
import { compositionRegistry } from "../../src/compositions/CompositionRegistry.js";
import { validateRishte, assessMelody, beatAtTime } from "../../src/tutorial/rishte/score.js";
import d from "../../src/compositions/rishte-naate/human-composition.json" with { type: "json" };
const source = JSON.parse(readFileSync(new URL(`../../src/compositions/rishte-naate/${d.normalizedSource.file}`, import.meta.url)));

test("human reduction accounts for all 296 source notes without inventing pitches", () => {
  validateRishte(d);
  const notes = new Map(source.sequences[0].notes.map(n => [n.id, n]));
  const authored = [...d.score.events, ...d.arrangement.blocks.flatMap(b => b.patterns.flatMap(p => p.events))];
  const ids = authored.flatMap(e => e.sourceIds);
  assert.equal(new Set(ids).size, 296); assert.equal(ids.length, 296);
  for (const e of authored) for (const id of e.sourceIds) assert.equal(e.midi, notes.get(id).midi);
  assert.equal(d.arrangement.sourceDecisions.length, 296);
  assert.equal(d.score.events.length, 107);
  assert.ok(d.arrangement.blocks.flatMap(b => b.patterns[1].events).some(e => e.midi > 80), "high piano runs belong in backing");
});

test("human attacks and stable target arc leave time for release and travel", () => {
  const positions = new Map(d.arrangement.recipes.map(r => [r.role, r.position]));
  for (const [i, e] of d.score.events.entries()) if (i) {
    const previous = d.score.events[i - 1];
    assert.ok((e.beat - previous.beat) * 800 >= 600 - 1e-8);
    assert.ok((e.beat - previous.beat - previous.beats) * 800 >= 200 - 1e-8);
    assert.ok(Math.hypot(...positions.get(e.role).map((p, j) => p - positions.get(previous.role)[j])) < .35);
  }
  for (const l of d.lessons.filter(l => !l.completePerformance)) {
    assert.equal(l.endBeat - l.startBeat, 8);
    assert.ok(l.eventIds.length <= 7);
    assert.ok(new Set(d.score.events.filter(e => l.eventIds.includes(e.id)).map(e => e.role)).size <= 4);
  }
});

test("all harmonic blocks compile into ordinary fixed-window Looper takes", () => {
  for (const block of d.arrangement.blocks) for (const pattern of block.patterns) {
    const roles = [...new Set(pattern.events.map(e => e.role))];
    assert.ok(roles.length <= 7);
    const routes = Object.fromEntries(roles.map((role, i) => [role, { trackId: `track-${i + 1}`, trackIndex: i + 1 }]));
    const timeline = compilePattern({ ...pattern, routes, beatMs: 800 });
    assert.equal(timeline.durationMs, block.beats * 800);
    assert.ok(timeline.hasRecording());
    const gates = timeline.getGateEventsBetween(0, timeline.durationMs, { includeStart: true });
    assert.equal(gates.filter(g => g.event.type === "squeezeStart").length, pattern.events.length);
    for (const t of timeline.tracks.values()) for (const e of t.events) {
      if (e.type === "gestureSnapshot") assert.deepEqual(e.values, { squeeze: 1, bend: 0 });
      if (e.type === "squeezeEnd") assert.equal(e.releaseOrigin, "controller");
    }
  }
});

test("tempo history grades only learner melody, including a tempo change inside a hold", () => {
  const lesson = d.lessons[0];
  const history = [{ atMs: 1000, beat: 0, bpm: 75 }, { atMs: 3000, beat: 2.5, bpm: 60 }];
  const time = beat => beat <= 2.5 ? 1000 + beat * 800 : 3000 + (beat - 2.5) * 1000;
  const heard = d.score.events.filter(e => lesson.eventIds.includes(e.id)).map(e => ({ kind: "note", origin: "learner",
    released: true, voiced: true, midis: [e.midi], startMs: time(e.beat), endMs: time(e.beat + e.beats) }));
  assert.equal(assessMelody(d, lesson, heard, t => beatAtTime(history, t)).ok, true);
  assert.equal(assessMelody(d, lesson, heard.map(e => ({ ...e, origin: "demonstration" })), t => beatAtTime(history, t)).correct, 0);
  assert.equal(assessMelody(d, lesson, [...heard, { ...heard[0], midis: [40] }], t => beatAtTime(history, t)).extra, 1);
});

test("catalog loads the revised Honk/Looper tutorial and rejects invalid gates", async () => {
  const module = await compositionRegistry.load("rishte-naate");
  assert.equal(module.definition.contentVersion, 2);
  assert.equal(module.definition.playback, "honk-looper-human-v1");
  for (const change of [d => d.score.events[1].beat = 0, d => d.arrangement.recipes[0].vowel = "O",
    d => d.arrangement.blocks[0].patterns[0].events[0].beats = 20]) {
    const invalid = structuredClone(d); change(invalid); assert.throws(() => validateRishte(invalid));
  }
});
