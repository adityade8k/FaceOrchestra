import test from "node:test";
import assert from "node:assert/strict";
import { writeMidi } from "midi-file";
import { normalizeMidi, preflight } from "../../scripts/midi/normalize.mjs";
import { arrangeMidi } from "../../scripts/midi/arrange.mjs";
import {
  CompositionRegistry,
  libraryPage,
} from "../../src/compositions/CompositionRegistry.js";
import { dataComposition } from "../../src/compositions/DataComposition.js";
import { assessDataLesson } from "../../src/tutorial/GenericTutorial.js";
const end = { deltaTime: 0, meta: true, type: "endOfTrack" };
const on = (deltaTime, noteNumber = 60, channel = 0) => ({
  deltaTime,
  type: "noteOn",
  noteNumber,
  channel,
  velocity: 80,
});
const off = (deltaTime, noteNumber = 60, channel = 0) => ({
  deltaTime,
  type: "noteOff",
  noteNumber,
  channel,
  velocity: 32,
});
const cc = (deltaTime, controllerType, value) => ({
  deltaTime,
  type: "controller",
  controllerType,
  value,
  channel: 0,
});
const tempo = (deltaTime, microsecondsPerBeat) => ({
  deltaTime,
  meta: true,
  type: "setTempo",
  microsecondsPerBeat,
});
const bytes = (tracks, format = 1, timing = { ticksPerBeat: 480 }) =>
  Buffer.from(
    writeMidi({
      header: { format, ...timing },
      tracks: tracks.map((t) => [...t, end]),
    }),
  );
const normalize = (...args) => normalizeMidi(bytes(...args));

test("tempo integration crosses changes: tick 960=1.5s and note 240..720=.75s", () => {
  const n = normalize([
    [tempo(0, 500000), tempo(480, 1000000)],
    [on(240), off(480), on(240, 64), off(0, 64)],
  ]);
  assert.equal(n.sequences[0].notes[0].durationSeconds, 0.75);
  assert.equal(n.sequences[0].notes[1].startSeconds, 1.5);
});
test("format 0 keeps channel/port identities and velocity-zero note-off; format 2 stays independent", () => {
  const n = normalize(
    [
      [
        on(0, 60, 0),
        on(0, 67, 1),
        { ...on(240, 60, 0), velocity: 0 },
        off(0, 67, 1),
      ],
    ],
    0,
  );
  assert.equal(n.sequences[0].notes.length, 2);
  assert.deepEqual(n.inventory[0].tracks[0].channels, [0, 1]);
  const independent = normalize(
    [
      [on(0), off(480)],
      [on(0, 67), off(960, 67)],
    ],
    2,
  );
  assert.equal(independent.sequences.length, 2);
  assert.equal(independent.sequences[1].notes[0].startSeconds, 0);
});
test("equal pitches pair FIFO; sustain retains sounding ends and pedal rearticulation", () => {
  const seq = normalize(
    [[cc(0, 64, 127), on(0), on(120), off(120), off(120), cc(120, 64, 0)]],
    0,
  ).sequences[0];
  assert.deepEqual(
    seq.notes.map((n) => n.releaseTick),
    [240, 360],
  );
  assert.deepEqual(
    seq.notes.map((n) => n.soundingEndTick),
    [480, 480],
  );
  assert.deepEqual(
    seq.notes.map((n) => n.releaseVelocity),
    [32, 32],
  );
});
test("14-bit bend and declared sensitivity survive notes, with expression and source ordering", () => {
  const n = normalize(
    [
      [
        cc(0, 101, 0),
        cc(0, 100, 0),
        cc(0, 6, 12),
        { deltaTime: 0, type: "pitchBend", channel: 0, value: 4096 },
        on(0),
        cc(120, 6, 4),
        {
          deltaTime: 0,
          type: "noteAftertouch",
          channel: 0,
          noteNumber: 60,
          amount: 50,
        },
        off(120),
      ],
    ],
    0,
  );
  const note = n.sequences[0].notes[0];
  assert.equal(note.bend[0].semitones, 6);
  assert.equal(note.bend[0].assumedRange, false);
  assert.equal(note.bend[1].semitones, 2);
  assert.equal(note.expression[0].value, 50);
});
test("6/8, meter changes, pickups, swing and tuplets retain ticks without quantization", () => {
  const n = normalize(
    [
      [
        {
          deltaTime: 0,
          meta: true,
          type: "timeSignature",
          numerator: 6,
          denominator: 8,
          metronome: 36,
          thirtyseconds: 8,
        },
        on(80),
        off(160),
        on(80),
        off(160),
        {
          deltaTime: 0,
          meta: true,
          type: "timeSignature",
          numerator: 3,
          denominator: 4,
          metronome: 24,
          thirtyseconds: 8,
        },
      ],
    ],
    0,
  );
  assert.equal(n.sequences[0].meter[0].quarterBeatsPerBar, 3);
  assert.equal(n.sequences[0].notes[0].beat, 1 / 6);
  assert.equal(n.sequences[0].notes[0].beats, 1 / 3);
});
test("SMPTE uses frames, percussion keeps source pitch, malformed/count-limited input rejects", () => {
  const b = bytes([[on(0, 36, 9), off(250, 36, 9)]], 0, {
    framesPerSecond: 25,
    ticksPerFrame: 10,
  });
  const n = normalizeMidi(b);
  assert.equal(n.source.division.kind, "smpte");
  assert.equal(n.sequences[0].notes[0].durationSeconds, 1);
  assert.equal(n.sequences[0].notes[0].midi, 36);
  assert.equal(n.inventory[0].tracks[0].likelyRole, "percussion");
  assert.throws(() => normalizeMidi(b.subarray(0, b.length - 2)), /Truncated/);
  assert.throws(() => preflight(b, { maxEvents: 1 }), /event count/);
});
test("third fixture composition integrates by data registration, with guided assessment and both libraries", async () => {
  const source = normalize(
    [[tempo(0, 500000), on(0), off(480), on(480, 64), off(480, 64)]],
    0,
  );
  const options = {
    id: "fixture-only",
    title: "Synthetic fixture",
    live: { track: 0, channel: 0 },
  };
  const d = arrangeMidi(source, options),
    registry = new CompositionRegistry();
  registry.register({
    id: d.id,
    title: d.title,
    version: d.contentVersion,
    load: async () => dataComposition(d),
  });
  const module = await registry.load(d.id);
  assert.equal(typeof module.enterTutorial, "function");
  assert.equal(typeof module.createEnsemble, "function");
  assert.equal(libraryPage(registry, "tutorials").rows[0].id, "basics");
  assert.equal(libraryPage(registry, "record-songs").rows[0].id, d.id);
  assert.deepEqual(arrangeMidi(source, options), d);
  assert.deepEqual(arrangeMidi(source, options, d), d, "Re-import is stable");
  assert.throws(
    () => arrangeMidi(source, { ...options, transpose: 12 }, d),
    /new content version/,
  );
  assert.equal(
    arrangeMidi(source, { ...options, transpose: 12, version: 2 }, d)
      .contentVersion,
    2,
  );
  const invalid = structuredClone(d);
  invalid.arrangement.recipes[0].position = [0, 0];
  assert.throws(() => dataComposition(invalid), /layout/);
  const missing = structuredClone(d);
  missing.lessons[0].eventIds.push("missing-event");
  assert.throws(() => dataComposition(missing), /event reference/);
  const lesson = d.lessons.at(-1),
    heard = d.score.events.map((e) => ({
      origin: "learner",
      kind: "note",
      startMs: e.startSeconds * 1000,
      endMs: (e.startSeconds + e.durationSeconds) * 1000,
      midis: [e.midi],
      voiced: true,
      released: true,
    }));
  assert.equal(assessDataLesson(d, lesson, heard, 0).ok, true);
  assert.equal(
    assessDataLesson(
      d,
      lesson,
      [...heard, { origin: "learner", kind: "strike", startMs: 50 }],
      0,
    ).ok,
    false,
    "Unrelated learner percussion is an extra event",
  );
  assert.equal(
    assessDataLesson(
      d,
      lesson,
      heard.map((e) => ({ ...e, origin: "demonstration" })),
      0,
    ).ok,
    false,
  );
});
