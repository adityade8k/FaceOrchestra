import test from "node:test";
import assert from "node:assert/strict";
import source from "../fixtures/alfaaz-rendition-4.json" with { type: "json" };
import {
  definition as d,
  AlfaazEnsemble,
  selectArrangement,
} from "../../src/compositions/songs/alfaaz/index.js";
import { compositionRegistry } from "../../src/compositions/CompositionRegistry.js";
import { validateAlfaaz } from "../../src/compositions/songs/alfaaz/score.js";
import { backingFixture } from "../helpers/backingFixture.js";
import { cueCanvas } from "../helpers/cueCanvas.js";

const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} vs ${b}`);
test("Alfaaz retains the rendered melody, lower bends, ending bends and soft native percussion", async () => {
  const loaded = await compositionRegistry.load("alfaaz");
  assert.equal(loaded.definition, d);
  assert.equal(d.title, "Alfaaz");
  assert.equal(d.score.events.length, 59);
  assert.equal(d.score.events.flatMap((e) => e.sourceNoteIds).length, 150);
  assert.equal(d.arrangement.backing.length, 225);
  for (const e of d.score.events) {
    if (e.id === "h045") continue; // Approved connected phrase is checked separately below.
    const original = source.events.find((event) => event.id === e.id);
    assert.equal(e.id, original.id);
    assert.equal(e.midi, original.midi);
    assert.deepEqual(e.sourceNoteIds, original.sourceNotes);
    near((e.beat * 60) / d.bpm, original.start);
    near(((e.beat + e.beats) * 60) / d.bpm, original.end);
    const bend = original.bend.some((p) => p.semitones) ? original.bend : [];
    assert.equal(e.bend?.length ?? 0, bend.length);
    for (const [j, p] of (e.bend || []).entries()) {
      near((p.fraction * e.beats * 60) / d.bpm, bend[j].seconds, 0.00011);
      assert.equal(p.semitones, bend[j].semitones);
    }
  }
  const lower = d.score.events.filter(
    (e) => e.beat >= (29.211 * d.bpm) / 60 - 1e-9 && e.beat < (41.204 * d.bpm) / 60 - 1e-9,
  );
  assert.deepEqual(
    lower.map((e) => e.id),
    ["h027", "h028", "h035"],
  );
  for (const [i, e] of d.arrangement.backing.entries()) {
    near((e.beat * 60) / d.bpm, source.hits[i].seconds);
    assert.equal(e.sound, source.hits[i].sound);
    near(e.gain * 0.515, source.hits[i].volume);
  }
  const first = await selectArrangement(),
    second = await selectArrangement();
  assert.notEqual(first, second);
  assert.equal(first.definition, second.definition);
  assert.notEqual(
    first.createEnsemble(backingFixture(d)),
    second.createEnsemble(backingFixture(d)),
  );
});

test("Alfaaz absorbs the 70 ms low note into one playable bend at 47 seconds", () => {
  const hold = d.score.events.find((e) => e.id === "h045");
  assert.deepEqual(hold.sourceIds, ["h045", "h046", "h047"]);
  assert.deepEqual(hold.sourceNoteIds, ["n097", "n098", "n099"]);
  assert.equal(hold.midi, 62);
  assert.equal(hold.articulation, "continuous-bend");
  near((hold.beat * 60) / d.bpm, 46.713);
  near(((hold.beat + hold.beats) * 60) / d.bpm, 47.938);
  assert.ok(!d.score.events.some((e) => ["h046", "h047"].includes(e.id)));
  for (const seconds of [46.9, 46.968, 47.05, 47.8]) {
    const beat = (seconds * d.bpm) / 60;
    const sounding = d.score.events.filter((e) => e.beat <= beat && beat < e.beat + e.beats);
    assert.deepEqual(
      sounding.map((e) => e.id),
      ["h045"],
      "No retrigger through the dip or return",
    );
  }
  const expected = [
    [46.713, 0],
    [46.863, 0],
    [46.968, -3],
    [47.083, 0],
  ];
  const following = source.events.find((e) => e.id === "h047");
  for (const point of following.bend.slice(1))
    expected.push([following.start + point.seconds, point.semitones]);
  assert.equal(hold.bend.length, expected.length);
  for (const [i, point] of hold.bend.entries()) {
    near(((hold.beat + point.fraction * hold.beats) * 60) / d.bpm, expected[i][0], 0.00011);
    assert.equal(point.semitones, expected[i][1]);
    assert.ok(Math.abs(point.semitones) <= d.pitchBendRange);
  }
  assert.equal(d.arrangement.version, 2);
});

test("Alfaaz rejects invalid percussion and a lesson that cuts the connected low hold", () => {
  for (const mutate of [
    (x) => (x.arrangement.backing[0].gain = NaN),
    (x) => (x.arrangement.backing[0].gain = 1.1),
    (x) => (x.arrangement.backing[0].role = "lead-61"),
    (x) => (x.arrangement.backing[0].sound = "sample"),
    (x) => (x.lessons[2].endBeat = (35 * d.bpm) / 60),
  ]) {
    const copy = structuredClone(d);
    mutate(copy);
    assert.throws(() => validateAlfaaz(copy));
  }
});

for (const origin of ["demonstration", "performance"])
  test(`Alfaaz ${origin}: every phrase and the full song play exact Looper strokes and dynamics`, () => {
    const old = globalThis.document;
    globalThis.document = { createElement: cueCanvas };
    const f = backingFixture(d),
      e = new AlfaazEnsemble(f, d),
      beatMs = 60000 / d.bpm;
    const snapshot = () =>
      JSON.stringify(e.loopers.map((h) => [h.timeline.toJSON(), e.identity(h)]));
    const stopped = () =>
      e.loopers.every(
        (h) => !h.transport.playing && !h.looperData.pendingLaunch && !h.looperData.queued,
      );
    try {
      e.prepare();
      assert.equal(e.loopers.length, 12);
      assert.equal(new Set([...f.wires.values()].map((w) => w.portId)).size, 2);
      for (const lesson of d.lessons) {
        e.prepareAttempt(lesson);
        const before = snapshot();
        f.audioCalls.length = 0;
        e.schedule({
          countAt: 0,
          beatZero: 4 * beatMs,
          wallNow: 0,
          audioNow: 0,
          bpm: d.bpm,
          ...lesson,
          origin,
        });
        for (let i = 0; i <= Math.ceil((lesson.endBeat - lesson.startBeat + 4) * 40); i++) {
          const now = (i / 40) * beatMs;
          for (const h of e.loopers) {
            const c = h.looperController;
            c.updateClockedTransports([h], now);
            c.audioScheduler.schedulePlaybackAudioForLooper(h, now);
            c.updatePlaybackForLooper(h, now);
          }
          e.update(now);
        }
        const expected = source.hits.filter(
          (h) =>
            (h.seconds * d.bpm) / 60 >= lesson.startBeat &&
            (h.seconds * d.bpm) / 60 < lesson.endBeat,
        );
        const actual = f.audioCalls
          .filter((c) => c.kind === "drum" && Number.isFinite(c.scheduledTime))
          .sort((a, b) => a.scheduledTime - b.scheduledTime);
        assert.equal(actual.length, expected.length, `${lesson.id}: all strokes exactly once`);
        assert.equal(
          f.audioCalls.filter((c) => c.kind === "start").length,
          0,
          "Backing never plays automatic melody voices",
        );
        for (const [i, hit] of actual.entries()) {
          assert.equal(hit.sound, expected[i].sound);
          near(hit.scheduledTime - ((4 - lesson.startBeat) * 60) / d.bpm, expected[i].seconds);
          near(hit.volume, expected[i].volume);
        }
        assert.equal(snapshot(), before, "Takes and routes preserved");
        assert.ok(stopped());
        assert.equal(e.anchor, null);
      }
      e.prepareAttempt();
      e.schedule({ countAt: 0, beatZero: 4 * beatMs, wallNow: 0, audioNow: 0, origin });
      e.update(10 * beatMs);
      e.cancel();
      assert.ok(stopped());
      e.schedule({ countAt: 0, beatZero: 4 * beatMs, wallNow: 0, audioNow: 0, origin });
      const changed = e.loopers[0];
      changed.looperController.setControlValue(changed, "volume", 0.2);
      const changedTake = JSON.stringify(changed.timeline.toJSON());
      assert.throws(() => e.update(4 * beatMs), /preserved/);
      assert.equal(JSON.stringify(changed.timeline.toJSON()), changedTake);
      assert.ok(stopped());
    } finally {
      e.dispose();
      globalThis.document = old;
    }
  });

test("Alfaaz defaults to a closer, larger melody palette without changing the arrangement", () => {
  const melody = d.arrangement.recipes.filter((r) => r.part === "melody");
  assert.equal(melody.length, 11);
  assert.equal(d.contentVersion, 3);
  assert.ok(melody.every((r) => r.scale === 1.05 && r.position[2] === 0.4));
  const xs = melody.map((r) => r.position[0]),
    ys = melody.map((r) => r.position[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 0.95);
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 0.3);
});
