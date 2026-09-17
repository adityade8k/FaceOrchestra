import assert from "node:assert/strict";
import test from "node:test";
import { kuchToHuaHaiScore as score, COMPOSITION_PITCHES, tuningForCompositionPitch } from "../../src/composition/kuchToHuaHaiScore.js";
import { createHonkTuning, frequencyFromControls } from "../../src/instruments/honk/HonkTuning.js";

// Independently transcribed from the request, including each different ending.
const supplied = [
  "g D C D E | g D D DED C",
  "FE D C a# FED | D DG D DE EDCag",
  "g D CD D E | g D D DED C",
  "g D C D E | g g F E DED C",
  "D E E D D E...F | F E D Ca D",
  "D E E GD E..F | F E DCa D",
  "FF EDCa# F ED | D D GD E EDCag",
  "g gD CD E | g D DED C",
  "g D C D E | F F F E DED C",
  "E E E G E G A | A ABA G F# G",
  "E E G EG GA | A A BA G F# G",
  "F E D Ca# FED | D D G D E E EDCag",
  "g D C D E | g D D ED C",
  "g D C D E DEF | F F FG F ED C",
];
const parse = (notation) => notation.match(/[A-Gag]#?/g).map((note) =>
  ({ g: "G3", a: "A3", "a#": "Bb3" }[note] || `${note}4`));

test("all fourteen phrases match every supplied attack and lyrical boundary in order", () => {
  assert.equal(score.phrases.length, 14);
  score.phrases.forEach((phrase, index) => {
    assert.equal(phrase.id, index + 1);
    assert.deepEqual(phrase.events.map(({ pitch }) => pitch), parse(supplied[index]));
    const [first, second] = supplied[index].split("|").map(parse);
    assert.deepEqual(phrase.events.filter((event) => event.startBeat < phrase.subphraseStartBeats[1]).map(e => e.pitch), first);
    assert.deepEqual(phrase.events.filter((event) => event.startBeat >= phrase.subphraseStartBeats[1]).map(e => e.pitch), second);
  });
  assert.deepEqual(score.events, score.phrases.flatMap(p => p.events));
});

test("explicit timing includes runs, separate repeated attacks, holds and phrase rests", () => {
  for (const [index, event] of score.events.entries()) {
    assert.ok(COMPOSITION_PITCHES.includes(event.pitch));
    assert.ok(event.durationBeats > 0);
    const next = score.events[index + 1];
    if (next) assert.ok(event.startBeat + event.durationBeats < next.startBeat);
  }
  assert.ok(new Set(score.events.map(e => e.durationBeats)).size > 5);
  for (const phrase of score.phrases) {
    const last = phrase.events.at(-1);
    assert.ok(last.startBeat + last.durationBeats < phrase.startBeat + phrase.durationBeats);
  }
  assert.equal(score.phrases[4].events[5].pitch, "E4");
  assert.ok(score.phrases[4].events[5].durationBeats > 1.5);
  assert.ok(score.phrases[5].events[5].durationBeats > 1.4);
});

test("all eleven Honk tunings produce the intended chromatic pitch and octave", () => {
  const midi = [55, 57, 58, 60, 62, 64, 65, 66, 67, 69, 71];
  COMPOSITION_PITCHES.forEach((pitch, index) => {
    const hz = frequencyFromControls(createHonkTuning(tuningForCompositionPitch(pitch)));
    const expected = 440 * 2 ** ((midi[index] - 69) / 12);
    assert.ok(Math.abs(hz - expected) < .01, `${pitch}: ${hz} vs ${expected}`);
  });
  assert.deepEqual([...new Set(score.events.map(e => e.pitch))].sort(), [...COMPOSITION_PITCHES].sort());
});
