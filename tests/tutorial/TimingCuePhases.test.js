import test from "node:test";
import assert from "node:assert/strict";
import { timingCueState } from "../../src/tutorial/timingCueState.js";
import { bendGaugeState } from "../../src/tutorial/bendGaugeState.js";
import { ARRANGEMENTS } from "../../src/tutorial/kuch/arrangements.js";
import { PRACTICE_TEMPOS } from "../../src/tutorial/kuch/timing.js";

for (const bpm of PRACTICE_TEMPOS) {
  test(`${bpm} BPM green counts down alone, yellow grows from zero to the white boundary at release`, () => {
    const options = { beatMs: 60000 / bpm };
    for (const beats of [0.12, 1, 4]) {
      const event = { beat: 4, beats };
      let previous = Infinity;
      for (const lead of [1, 0.75, 0.5, 0.25, 0.000001]) {
        const state = timingCueState(4 - lead, event, options);
        assert.equal(state.phase, "prepare");
        assert.equal(state.yellow, 0);
        assert.ok(state.green > 0 && state.green < previous);
        previous = state.green;
      }
      const attack = timingCueState(4, event, options);
      assert.equal(attack.green, 0);
      assert.equal(attack.yellow, 0);
      let previousYellow = 0;
      for (const fraction of [0.001, 0.1, 0.25, 0.5, 0.75, 0.9999]) {
        const yellow = timingCueState(
          4 + fraction * beats,
          event,
          options,
        ).yellow;
        assert.ok(yellow > previousYellow && yellow < 1);
        assert.ok(Math.abs(yellow - fraction) < 1e-10);
        previousYellow = yellow;
      }
      const half = timingCueState(4 + beats / 2, event, options);
      const almostOff = timingCueState(4 + beats * 0.9999, event, options);
      assert.ok(Math.abs(half.yellow - 0.5) < 1e-10);
      assert.ok(almostOff.yellow > 0.999);
      assert.equal(timingCueState(4 + beats, event, options), null);
      assert.equal(timingCueState(4 + beats + 0.1, event, options), null);
    }
  });
}

test("every authored bend previews its start and destination without borrowing live input or rotating early", () => {
  for (const event of ARRANGEMENTS["easier-bends"].events.filter(
    (e) => e.bend,
  )) {
    for (const fraction of [-1 / event.beats, -0.01, -0.000001]) {
      const state = bendGaugeState(event, fraction, {
        semitones: 2,
        origin: "demonstration",
      });
      assert.equal(state.preview, true);
      assert.equal(state.required, event.bend[0].semitones);
      assert.equal(state.destinationSemitones, event.bend.at(-1).semitones);
      assert.equal(state.actual, null);
      assert.equal(state.onTarget, false);
      assert.match(state.status, /Prepare/);
    }
    for (const bpm of PRACTICE_TEMPOS) {
      const formationFraction = 120 / ((event.beats * 60000) / bpm);
      assert.equal(
        bendGaugeState(event, formationFraction).required,
        0,
        "The initial hold gives yellow time to grow before the authored roll starts",
      );
    }
    const middle = (event.bend[1].fraction + event.bend[2].fraction) / 2;
    assert.notEqual(bendGaugeState(event, middle).required, 0);
    assert.equal(
      bendGaugeState(event, 1).required,
      event.bend.at(-1).semitones,
    );
  }
});

test("percussion yellow also grows to the white boundary and leaves no withdrawal tail", () => {
  const options = { percussion: true };
  assert.equal(timingCueState(0, { beat: 0 }, options).yellow, 0);
  assert.equal(timingCueState(0.05, { beat: 0 }, options).yellow, 0.5);
  assert.ok(timingCueState(0.09999, { beat: 0 }, options).yellow < 1);
  assert.equal(timingCueState(0.1, { beat: 0 }, options), null);
});
