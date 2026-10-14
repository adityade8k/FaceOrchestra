import test from "node:test";
import assert from "node:assert/strict";
import { fixture, flushAudio } from "../support/manualHonkFixture.mjs";
import { TutorialAdapter } from "../../src/tutorial/TutorialAdapter.js";
import { NotePracticeGate, NotePracticeGuidance } from "../../src/tutorial/NotePracticeGate.js";

function setup(options = {}) {
  const f = fixture(options);
  const a = Object.assign(Object.create(TutorialAdapter.prototype), {
    r: f.host, roles: new Map(f.honks.map(h => [h.id, [h.id]])),
    gestures: new Map(), pendingStrikes: [], sequence: 0,
    labelPresentation: { update() {} }, bindOrdinaryPercussion() {},
  });
  const gate = new NotePracticeGate([
    { id: "first", role: "h0", midis: f.honks.map(h => a.midi(h)), beats: 1 },
    { id: "repeat", role: "h0", midi: a.midi(f.honks[0]), beats: 1 },
  ], { beatMs: 500 });
  const guide = new NotePracticeGuidance(gate), releases = [];
  a.emit = event => { releases.push(event); gate.accept(event); };
  const observe = now => { a.observe(now); a.updateSustainTimings(guide, now); };
  return { ...f, a, gate, guide, releases, observe };
}

for (const locked of [false, true])
  test(`full sustain is advisory and the player controls release (locked=${locked})`, async () => {
    const f = setup({ locked }), c = f.controllers[0], h = f.honks[0];
    f.press(); f.frame(); await flushAudio(); f.observe(100);
    const voice = f.audio.voices.get('left:h0');
    assert.ok(voice);
    for (const now of [350, 599, 600, 1000, 2500]) {
      f.frame(); f.observe(now);
      assert.equal(f.audio.voices.get('left:h0'), voice, 'A full circle never cuts or retriggers the voice');
      assert.equal(f.releases.length, 0);
      assert.equal(f.gate.index, 0, 'Untimed technique assessment waits for the actual release');
    }
    assert.equal(f.gate.fraction, 1);
    assert.equal(h.hornHolders.size, 1);
    f.frame(100);
    c.roll = .5; c.hit = null; f.frame();
    c.roll = 0; c.hit = h.squeezeCollider; f.frame();
    assert.equal(f.audio.voices.get('left:h0'), voice, 'Bending off target and returning remains playable');
    f.release(); f.frame(); f.observe(2600);
    assert.equal(f.audio.voices.size, 0);
    assert.equal(f.gate.index, 1);
    assert.equal(f.releases[0].endMs, 2600);
    f.press(); f.frame(); await flushAudio(); f.observe(2700);
    assert.ok(f.audio.voices.has('left:h0'), 'The same Honk can be played again immediately');
    assert.equal(f.gate.fraction, 0);
    f.frame(); f.observe(3200);
    assert.equal(f.audio.voices.size, 1);
    f.release(); f.frame(); f.observe(3300);
    assert.equal(f.gate.complete, true);
  });

test("each player retains control of their touching chord voices after the sustain fills", async () => {
  const f = setup({ count: 2 });
  for (const c of f.controllers) f.press(f.honks[0].squeezeCollider, c);
  f.frame(); await flushAudio(); f.observe(0);
  f.frame(); f.observe(1500);
  assert.equal(f.audio.voices.size, 4);
  assert.equal(f.releases.length, 0);
  f.release(f.controllers[0]); f.frame(); f.observe(1600);
  assert.equal(f.audio.voices.size, 2, 'One release does not stop the other controller');
  assert.equal(f.gate.index, 0, 'A chord still held by another owner is not fully released');
  f.release(f.controllers[1]); f.frame(); f.observe(1700);
  assert.equal(f.audio.voices.size, 0);
  assert.equal(f.gate.index, 1);
});

test("long continuous bends retain their early samples at slow practice tempos", async () => {
  const f = setup(), c = f.controllers[0];
  f.press(); f.frame(); await flushAudio();
  // Nazariya's longest joined hold lasts 13.3 seconds at 30 BPM.
  for (let now = 0; now <= 13500; now += 30) f.a.observe(now);
  const samples = f.a.gestures.get(c).bendSamples;
  assert.equal(samples.length, 451);
  assert.equal(samples[1].offsetMs, 30, 'Early bend evidence must survive the full hold');
  assert.equal(samples.at(-1).offsetMs, 13500);
  f.release(); f.frame(); f.a.observe(13530);
  assert.equal(f.releases.length, 1, 'A sustained bend is assessed as one released note');
});

test("technique assessment validates short holds and missing bends only after the player releases", async () => {
  const f = setup();
  f.press(); f.frame(); await flushAudio(); f.observe(0);
  f.release(); f.frame(); f.observe(100);
  assert.equal(f.gate.index, 0); assert.equal(f.gate.retries, 1);
  f.gate.current.bend = [{ fraction: 0, semitones: 0 }, { fraction: 1, semitones: -3 }];
  f.press(); f.frame(); await flushAudio(); f.observe(200);
  f.frame(); f.observe(700);
  assert.equal(f.audio.voices.size, 1); assert.equal(f.gate.retries, 1);
  f.release(); f.frame(); f.observe(800);
  assert.equal(f.audio.voices.size, 0); assert.equal(f.gate.index, 0);
  assert.equal(f.gate.retries, 2);
});

test("timed guidance preserves the indicator duration through tempo changes without stopping a late hold", async () => {
  const f = setup(), c = f.controllers[0];
  const guide = { anchorMs: 0, beatMs: 500, step: { timed: true, events: [
    { role: "h0", beat: 0, beats: 1, durationSeconds: .75 },
  ] }, beatAt: now => now / 500 };
  f.press(); f.frame(); await flushAudio(); f.a.observe(200);
  f.a.updateSustainTimings(guide, 200);
  const gesture = f.a.gestures.get(c);
  assert.equal(f.a.sustainTimings.get(gesture).durationMs, 500);
  guide.beatMs = 250;
  for (const now of [699, 700, 1000]) {
    f.frame(); f.a.observe(now); f.a.updateSustainTimings(guide, now);
    assert.equal(f.audio.voices.size, 1);
    assert.equal(f.releases.length, 0);
    assert.equal(f.a.sustainTimings.get(gesture).durationMs, 500);
  }
  assert.equal(guide.beatAt(1000), 2, 'Song time continues past the held note');
  f.release(); f.frame(); f.a.observe(1100);
  assert.equal(f.audio.voices.size, 0);
  assert.equal(f.releases[0].endMs, 1100);
});

test("a latched hold releases before the next Honk and reports the actual note end", async () => {
  const f = setup({ count: 2 }), c = f.controllers[0];
  f.honks[1].x = 5;
  for (let i = 0; i < 4; i++) f.frame();
  f.gate.events[0].midis = [f.a.midi(f.honks[0])];
  f.gate.events[1].role = 'h1';
  f.press(); f.frame(); await flushAudio(); f.observe(100);
  f.frame(500); f.observe(600);
  assert.equal(f.gate.fraction, 1);
  c.hit = f.honks[1].squeezeCollider;
  f.frame(0); await flushAudio();
  assert.equal(f.a.gestures.get(c).targetId, 'h0', 'The matured hold stays on its original Honk');
  f.release(); f.frame(0); f.observe(700);
  f.press(f.honks[1].squeezeCollider); f.frame(0); await flushAudio(); f.observe(700);
  assert.equal(f.gate.index, 1);
  assert.equal(f.a.gestures.get(c).targetId, 'h1');
  assert.equal(f.a.gestures.get(c).articulated, true);
  assert.equal(f.gate.fraction, 0);
  f.frame(); f.observe(1300);
  assert.equal(f.audio.voices.size, 1);
  assert.equal(f.host.controllerStates.get(c).trigger, true);
  f.release(); f.frame(); f.observe(1400);
  assert.equal(f.gate.complete, true);
  assert.deepEqual(f.releases.map(e => [e.targetId, e.startMs, e.endMs]), [['h0', 100, 700], ['h1', 700, 1400]]);
});
