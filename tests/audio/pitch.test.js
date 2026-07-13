import assert from "node:assert/strict";
import test from "node:test";

import {
  F4_FREQUENCY,
  getHonkFrequency,
  getOctave,
  getPitchSemitones,
  snapToPitchSteps,
} from "../../src/audio/honk/pitch.js";

test("pitch controls preserve the original F4-centered mapping", () => {
  assert.equal(getPitchSemitones(-1), -5);
  assert.equal(getPitchSemitones(0), 0);
  assert.equal(getPitchSemitones(1), 7);
  assert.equal(getOctave(-1), 2);
  assert.equal(getOctave(0), 4);
  assert.equal(getOctave(1), 6);
  assert.equal(getHonkFrequency({ leftEar: 0, rightEar: 0 }), F4_FREQUENCY);
});

test("pitch snapping keeps the original nearest-step and tie behavior", () => {
  const steps = [-5, -3, -1, 0, 2, 4, 6, 7];
  assert.equal(snapToPitchSteps(1, steps), 0);
  assert.equal(snapToPitchSteps(1.1, steps), 2);
  assert.equal(getPitchSemitones(1 / 7, "cMajor"), 0);
});

test("pitch frequency applies semitone and octave controls multiplicatively", () => {
  const actual = getHonkFrequency({ leftEar: 1, rightEar: 1 });
  const expected = F4_FREQUENCY * 2 ** (7 / 12) * 2 ** 2;
  assert.equal(actual, expected);
});
