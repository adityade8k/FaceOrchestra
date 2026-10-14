import test from "node:test";
import assert from "node:assert/strict";
import { BendSnapping, bendSnapSequence } from "../../src/tutorial/BendSnapping.js";
import { TutorialRuntime } from "../../src/tutorial/TutorialRuntime.js";
import kuch from "../../src/compositions/kuch-honk-orchestra/composition.json" with { type: "json" };

const curve = values => values.map((semitones, i) => ({ semitones, fraction: i / (values.length - 1) }));
function fixture(range = 4) {
  const controller = { userData: {} }, target = { id: "lead", root: { visible: true }, pitchBendRange: range };
  const input = { trigger: true };
  const adapter = { ids: role => role === "lead" || role === "basic" ? ["lead"] : [],
    r: { controllerStates: new Map([[controller, input]]) } };
  const snap = new BendSnapping(adapter);
  const event = { type: "note", role: "lead", beat: 0, beats: 4, bend: curve([0, 0, 3, 3, -2, -2]) };
  const guide = { mode: "practice", step: event };
  const interaction = { instrumentState: target, activeVoiceIds: new Set(["voice"]), bendStartInverseQuaternion: {} };
  return { controller, target, input, adapter, snap, event, guide, interaction,
    bend(value, now = 0, session = guide) { return snap.resolve(session, controller, interaction, value / range, now) * range; },
    reattack() { interaction.bendStartInverseQuaternion = {}; } };
}

test("snap sequence preserves repeated pitches and authored notes, excluding glide samples", () => {
  assert.deepEqual(bendSnapSequence({ bend: curve([0, .2, .8, 1.5, 1.5, .6, -.5, 0]) }), [0, 1.5, -.5, 0]);
  assert.deepEqual(bendSnapSequence({ midi: 60, bend: curve([0, 2, 4]),
    pitchTargets: [{ midi: 60 }, { midi: 62 }, { midi: 64 }, { midi: 62 }, { midi: 60 }] }), [0, 2, 4, 2, 0]);
});

for (const range of [4, 5]) test(`range ${range}: strong capture follows note order and blocks overshooting turns`, () => {
  const f = fixture(range);
  assert.equal(f.bend(-1.5), -1.5, "Cannot snap to the later -2 before reaching +3");
  assert.equal(f.bend(.2), .2, "The starting note does not trap a departing wrist");
  assert.equal(f.bend(2), 2);
  assert.equal(f.bend(2.1), 3, "Capture 0.9 semitones before the next note");
  for (const value of [2.2, 3.1, 3.9]) assert.equal(f.bend(value), 3);
  assert.equal(f.bend(range), 3, "An upward turn is a hard ceiling beyond the magnetic zone");
  assert.equal(f.bend(-1.1), -2);
  assert.equal(f.bend(-3.1), -2);
  assert.equal(f.bend(-range), -2, "A downward endpoint is a hard floor");
  assert.equal(f.bend(-.7), -.7, "Rolling back away from the floor still releases the snap");
  assert.equal(f.bend(-2.8), -2);
});

test("3 → 7 → 3 caps the peak and return even when a frame jumps past either target", () => {
  const f = fixture(5);
  f.event.midi = 63;
  f.event.pitchTargets = [{ midi: 63 }, { midi: 67 }, { midi: 63 }];
  assert.equal(f.bend(5), 4, "A fast clockwise roll lands at 7, never 8");
  for (const value of [5, 4.8, 4.5]) assert.equal(f.bend(value), 4);
  assert.equal(f.bend(2), 2, "Rolling back can leave the upper stop");
  assert.equal(f.bend(-2), 0, "A fast return lands at 3, never below it");
  for (const value of [-2, -4, -5]) assert.equal(f.bend(value), 0);
  assert.equal(f.snap.isSnapped(f.controller), true, "Zero-valued floors retain fast audio settling");
});

for (const direction of [-1, 1]) test(`direction ${direction}: a continuing phrase can pass an intermediate note`, () => {
  const f = fixture();
  f.event.bend = curve([0, direction * 2, direction * 2, direction * 3]);
  assert.equal(f.bend(direction * 1.2), direction * 2);
  assert.equal(f.bend(direction * 2.2), direction * 3, "The intermediate note does not impose a permanent limit");
  assert.equal(f.bend(direction * 4), direction * 3, "The final note still stops overshoot");
});

test("successive turns replace the previous limit and do not skip targets", () => {
  const f = fixture(); f.event.bend = curve([0, 2, -2, 3, 0]);
  for (const [wrist, expected] of [[4, 2], [4, 2], [-4, -2], [-4, -2], [4, 3], [-4, 0]])
    assert.equal(f.bend(wrist), expected);
  assert.equal(f.bend(4, 0, null), 4, "Leaving guidance removes the hard stops too");
});

for (const direction of [-1, 1]) test(`direction ${direction}: an over-rotated wrist can turn toward a close return note`, () => {
  const f = fixture();
  f.event.bend = curve([0, direction * 3, direction * 2.5]);
  assert.equal(f.bend(direction * 2.1), direction * 3);
  assert.equal(f.bend(direction * 4), direction * 3);
  assert.equal(f.bend(direction * 3.9), direction * 3, "A little jitter cannot advance the sequence");
  assert.equal(f.bend(direction * 3.2), direction * 2.5,
    "Returning does not require passing the original early-capture angle");
});

test("close targets and turnarounds require new movement, never advancing from a stationary wrist", () => {
  const f = fixture(); f.event.bend = curve([0, 1, 1, 1.5, 1.5, 1, 1, 0]);
  assert.equal(f.bend(.2), 1);
  for (let i = 0; i < 100; i++) assert.equal(f.bend(.2, i * 1000), 1);
  assert.equal(f.bend(.7), 1.5);
  for (const value of [.7, .69, .72]) assert.equal(f.bend(value), 1.5);
  assert.equal(f.bend(.5), 1);
  assert.equal(f.bend(.3), 0);
});

test("a new squeeze restarts an unfinished bend, and disabling guidance clears capture", () => {
  const f = fixture(); f.bend(2.5);
  f.reattack(); assert.equal(f.bend(-1.5), -1.5);
  f.bend(2.5); assert.equal(f.bend(3.9), 3);
  assert.equal(f.bend(3.9, 0, null), 3.9);
  assert.equal(f.snap.isSnapped(f.controller), false);
  f.bend(2.5); f.target.id = "unrelated";
  assert.equal(f.bend(3.9), 3.9);
});

test("92 BPM: a lagging player follows every bend in order after the display has moved ahead", () => {
  const f = fixture(), beatMs = 60000 / 92;
  const event = { ...kuch.score.events.find(e => e.bend?.length), role: "lead" };
  const guide = { mode: "practice", anchorMs: 1000, startBeat: event.beat,
    step: { timed: true, events: [event] }, beatAt: now => event.beat + (now - 1000) / beatMs,
    complete: now => now > 1000 + event.beats * beatMs };
  assert.deepEqual(bendSnapSequence(event), [0, -2, 0, 2]);
  assert.equal(f.bend(-1.2, 999, guide), -1.2, "Count-in still waits for play");
  assert.equal(f.bend(-1.2, 1500, guide), -2, "Late onset starts with the first bend");
  assert.equal(f.bend(-1.2, 5000, guide), -2, "Clock completion never advances a held snap");
  assert.equal(f.bend(-.8, 5011, guide), 0);
  assert.equal(f.bend(-.8, 6000, guide), 0);
  assert.equal(f.bend(1.2, 6011, guide), 2);
});

test("late successive squeezes follow the written events, including intervening unbent notes", () => {
  const f = fixture(), plain = { role: "lead", beat: 0, beats: 1, midi: 60,
    pitchTargets: [{ midi: 60 }] };
  const first = { ...f.event, beat: 1, beats: 1, bend: curve([0, 2]) };
  const next = { ...f.event, beat: 2, beats: 1, bend: curve([0, -1]) };
  const guide = { step: { timed: true, events: [plain, first, next] },
    anchorMs: 0, beatAt: now => now / (60000 / 92) };
  assert.equal(f.bend(.8, 5000, guide), .8, "First ordinary note does not borrow a future bend");
  f.reattack(); assert.equal(f.bend(1.2, 5100, guide), 2);
  f.reattack(); assert.equal(f.bend(-.3, 5200, guide), -1);
  f.reattack(); assert.equal(f.bend(-.3, 5300, guide), -.3);
  guide.anchorMs = 5400;
  assert.equal(f.bend(.8, 5500, guide), .8, "A restarted attempt resets the event cursor");
  f.reattack(); assert.equal(f.bend(1.2, 5600, guide), 2);
});

test("learner-paced practice uses the same sequence and resets when its target changes", () => {
  const f = fixture(); f.guide.practiceGate = { anchorMs: 100, current: f.event };
  assert.equal(f.bend(2.2, 99), 2.2);
  assert.equal(f.bend(2.2, 100000), 3);
  assert.equal(f.bend(-1.2, 100010), -2);
  f.guide.practiceGate.current = { ...f.event, bend: curve([0, -1]) };
  assert.equal(f.bend(-.3, 100020), -1);
});

test("each hand progresses independently", () => {
  const f = fixture(), other = { userData: {} };
  f.adapter.r.controllerStates.set(other, { trigger: true });
  assert.equal(f.bend(2.2), 3);
  assert.equal(f.bend(-1.2), -2);
  assert.equal(f.snap.resolve(f.guide, other, f.interaction, -.3, 0), -.3);
  assert.equal(f.snap.resolve(f.guide, other, f.interaction, .55, 0), .75);
});

for (const excluded of ["demonstration", "simulation", "virtual", "released", "stick", "disconnected", "complete"])
  test(`${excluded} input does not snap`, () => {
    const f = fixture();
    if (["demonstration", "simulation"].includes(excluded)) f.guide.mode = excluded;
    if (excluded === "virtual") f.controller.userData.virtualTutorial = true;
    if (excluded === "released") f.input.trigger = false;
    if (excluded === "stick") f.input.stickActive = true;
    if (excluded === "disconnected") f.controller.userData.inputConnected = false;
    if (excluded === "complete") f.guide.complete = true;
    assert.equal(f.bend(2.2), 2.2);
  });

test("runtime routes tutorials, guided recordings and basics; pauses and free play disable assistance", () => {
  const f = fixture(), host = Object.assign(Object.create(TutorialRuntime.prototype), { ready: true, bendSnapping: f.snap });
  const bend = value => host.snapBend(f.controller, f.interaction, value / 4, 0) * 4;
  assert.equal(bend(2.2), 2.2);
  host.session = { ...f.guide, phase: "practicing" }; assert.equal(bend(2.2), 3);
  host.conductor = { paused: true }; assert.equal(bend(2.2), 2.2);
  host.conductor.paused = false; host.session.phase = "results"; assert.equal(bend(2.2), 2.2);
  host.dataTutorial = { phase: "practice", guide: f.guide }; assert.equal(bend(2.2), 3);
  host.dataTutorial.phase = "demo"; assert.equal(bend(2.2), 2.2);
  delete host.dataTutorial;
  host.jogRecording = { guidance: () => f.guide }; assert.equal(bend(2.2), 3);
  host.guidedPlayOffset = { milliseconds: 1000 }; assert.equal(bend(2.2), 3);
  host.jogRecording.guidance = () => null; assert.equal(bend(2.2), 2.2);
  host.basics = { practicing: true, step: { id: "bend" } }; assert.equal(bend(.3), 1);
  host.basics.step.id = "pitch"; assert.equal(bend(-.3), -1);
  host.basics.step.id = "squeeze"; assert.equal(bend(.3), .3);
});
