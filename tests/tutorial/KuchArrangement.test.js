import test from "node:test";
import assert from "node:assert/strict";
import {
  MELODY,
  BEAT_MS,
  MELODY_PARTS,
  assess,
} from "../../src/tutorial/kuch/score.js";
import {
  ARRANGEMENTS,
  BEND_PAIRS,
} from "../../src/tutorial/kuch/arrangements.js";
import { bendAt, DESCENDING_BEND } from "../../src/tutorial/composition.js";
import { bendCueState } from "../../src/tutorial/bendCueState.js";
import { resolvePresentationValue } from "../../src/app/runtime/HonkPerformanceSampling.js";
import { BEND_SMOOTHING } from "../../src/config/honk.js";
import { selectArrangement } from "../../src/compositions/kuch.js";

function observation(
  event,
  { hz = 90, target = (t) => bendAt(event.bend, t), origin = "learner" } = {},
) {
  const duration = event.beats * BEAT_MS,
    dt = 1000 / hz,
    bendSamples = [];
  let processed = 0,
    last = -Infinity;
  for (let ms = 0; ms < duration; ms += dt) {
    processed = resolvePresentationValue(
      processed,
      target(ms / duration) / 4,
      BEND_SMOOTHING,
      dt,
      false,
    );
    if (ms - last >= 30) {
      bendSamples.push({ offsetMs: ms, semitones: processed * 4 });
      last = ms;
    }
  }
  return {
    id: "observed",
    kind: "note",
    origin,
    role: event.role,
    midis: [event.midi],
    startMs: event.beat * BEAT_MS,
    endMs: (event.beat + event.beats) * BEAT_MS,
    released: true,
    allReleased: true,
    voiced: true,
    articulated: true,
    bendSamples,
    maxAbsBend: Math.max(...bendSamples.map((s) => Math.abs(s.semitones))),
  };
}
test("derived arrangement preserves 185 source landmarks and only the approved 18 pairs", () => {
  const before = JSON.stringify(MELODY),
    original = ARRANGEMENTS.original,
    easier = ARRANGEMENTS["easier-bends"];
  assert.equal(original.events.length, 185);
  assert.equal(easier.events.length, 167);
  assert.deepEqual(
    easier.events.flatMap((e) => e.sourceEventIds),
    MELODY.map((e) => e.id),
  );
  assert.deepEqual(
    easier.events.filter((e) => e.bend).map((e) => e.sourceEventIds),
    BEND_PAIRS.map(([a, b]) => [`lead-${a}`, `lead-${b}`]),
  );
  for (const a of Object.values(ARRANGEMENTS)) {
    assert.equal(a.beats, 136);
    assert.equal(a.parts.length, 4);
    for (const [i, part] of a.parts.entries()) {
      assert.equal(part.sourceStart, MELODY_PARTS[i].sourceStart);
      assert.equal(part.beats, MELODY_PARTS[i].beats);
      assert.deepEqual(part.backingChanges, MELODY_PARTS[i].backingChanges);
      for (const e of part.events) {
        const full = a.events.find((n) => n.id === e.id);
        assert.ok(Math.abs(e.beat + part.sourceStart - full.beat) < 1e-9);
        assert.ok(Math.abs(e.endBeat + part.sourceStart - full.endBeat) < 1e-9);
        assert.deepEqual(e.bend, full.bend);
        assert.deepEqual(e.landmarks, full.landmarks);
        assert.ok(e.endBeat <= part.beats);
      }
    }
  }
  for (const e of easier.events.filter((e) => e.bend)) {
    const source = e.sourceEventIds.map((id) =>
      MELODY.find((n) => n.id === id),
    );
    assert.equal(e.endBeat, source.at(-1).beat + source.at(-1).beats);
    assert.ok(
      Math.abs(e.beats - source.reduce((s, n) => s + n.beats, 0) - 1 / 480) <
        1e-9,
    );
    assert.ok(Math.abs(e.transition.semitones) <= 4);
    assert.ok(e.transition.startOffsetBeats * BEAT_MS >= 190);
    assert.ok(e.beats - e.transition.endOffsetBeats > 0.45);
  }
  assert.equal(easier.steps[4].id, "bend-intro");
  assert.equal(JSON.stringify(MELODY), before);
  assert.deepEqual(
    original.events.map(({ midi, beat, beats }) => ({ midi, beat, beats })),
    MELODY.map(({ midi, beat, beats }) => ({ midi, beat, beats })),
  );
});

for (const hz of [72, 90, 120])
  test(`all candidate bends pass using the real processed-bend smoothing at ${hz} Hz`, () => {
    for (const e of ARRANGEMENTS["easier-bends"].events.filter((e) => e.bend)) {
      const result = assess([e], [observation(e, { hz })], 0);
      assert.equal(
        result.ok,
        true,
        `${e.id}: ${JSON.stringify(result.failures)}`,
      );
      assert.equal(result.landmarks, 2);
    }
  });
test("assessment rejects wrong direction, constant wrong pitch, lost hold, early release, and extra attacks", () => {
  const e = ARRANGEMENTS["easier-bends"].events.find((e) => e.bend),
    good = observation(e);
  const bads = [
    observation(e, { target: (t) => -bendAt(e.bend, t) }),
    observation(e, { target: () => 2 }),
    observation(e, { target: () => 4 }),
    observation(e, { target: () => 0 }),
    observation(e, { target: (t) => (t > 0.95 ? 2 : 0) }),
    {
      ...good,
      bendSamples: good.bendSamples.map((s) => ({
        ...s,
        semitones:
          s.offsetMs > e.transition.landmarkOffsetBeats * BEAT_MS ? 2 : 0,
      })),
    },
    { ...good, endMs: good.endMs - 200 },
    { ...good, voiceInterrupted: true },
    { ...good, midis: [e.midi, e.midi + 7] },
    { ...good, invalidMembers: true },
    { ...good, allReleased: false },
    { ...good, articulated: false },
    {
      ...good,
      bendSamples: [
        [0, 0],
        [80, 0],
        [160, 0],
        [205, 0.6],
        [235, 1.4],
        [265, 0.3],
        [300, 1.4],
        [340, 1.9],
        [380, 2],
        [420, 2],
        [460, 2],
        [500, 2],
        [540, 2],
        [580, 2],
        [620, 2],
      ].map(([offsetMs, semitones]) => ({ offsetMs, semitones })),
    },
  ];
  for (const bad of bads) assert.equal(assess([e], [bad], 0).ok, false);
  assert.equal(
    assess([e], [good, { ...good, id: "extra", role: "unrelated" }], 0).ok,
    false,
  );
  assert.equal(
    assess([e], [{ ...good, origin: "demonstration" }], 0).correct,
    0,
  );
  assert.equal(
    assess([e, { ...e, id: "unrelated-expected" }], [good], 0).correct,
    1,
  );
  const plain = ARRANGEMENTS.original.events[0];
  assert.equal(
    assess([plain], [observation(plain, { target: () => 4 })], 0).score,
    0,
  );
  assert.equal(assess([plain], [observation(plain)], 0).score, 100);
  const detuned = observation(plain, { target: () => 0.3 });
  detuned.midis = [plain.midi + 0.19];
  assert.equal(
    assess([plain], [detuned], 0).score,
    0,
    "ordinary sounded pitch combines base tuning and processed bend",
  );
});
test("composition selection fixes arrangement identity, hashes, recording guidance and progress versions independently", async () => {
  const easier = await selectArrangement(),
    original = await selectArrangement("original");
  assert.notEqual(
    easier.definition.contentHash,
    original.definition.contentHash,
  );
  assert.equal(easier.definition.contentVersion, 2);
  assert.equal(easier.definition.arrangement.id, "easier-bends");
  const guide = easier.createGuidance(1000);
  assert.equal(guide.step.events, ARRANGEMENTS["easier-bends"].events);
  assert.equal(
    original.createGuidance(1000).step.events,
    ARRANGEMENTS.original.events,
  );
  assert.equal(guide.anchorMs, 1000);
  assert.equal(guide.beatMs, BEAT_MS);
  assert.equal(guide.step.events.length, 167);
  assert.equal(easier.createEnsemble({}).arrangement.id, "easier-bends");
});
test("bend wording derives both directions and endpoints, preserving Jog and wrist projection", () => {
  for (const event of ARRANGEMENTS["easier-bends"].events.filter(
    (e) => e.bend,
  )) {
    const cue = bendCueState(
      event.bend,
      (event.bend[1].fraction + event.bend[2].fraction) / 2,
      event,
    );
    assert.equal(cue.direction, event.transition.semitones > 0 ? "up" : "down");
    assert.equal(cue.amount, Math.abs(event.transition.semitones));
    assert.ok(cue.instruction.includes("Trigger held"));
    assert.equal(cue.rollRadians * 10, cue.semitones);
  }
  assert.match(
    bendCueState(DESCENDING_BEND, 0.9, { midi: 63 }).instruction,
    /C4/,
  );
});
