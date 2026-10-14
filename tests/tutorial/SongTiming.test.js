import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SongTutorial } from "../../src/tutorial/SongTutorial.js";
import { MelodyGuidance } from "../../src/compositions/MelodyScore.js";
import { LiveMelodyEnsemble } from "../../src/tutorial/live-melody/LiveMelodyEnsemble.js";
import { MetronomeInstrument } from "../../src/instruments/metronome/MetronomeInstrument.js";
import { Group } from "three";

function fixture(definition) {
  const metro = new MetronomeInstrument({ id: "metro", root: new Group(), bpm: definition.bpm });
  const honks = new Map(definition.arrangement.recipes.filter(r => r.kind === "honk")
    .map(r => [r.role, { root: { visible: true } }]));
  const adapter = { get: role => role === "metronome" ? metro : honks.get(role),
    gestures: new Map(), setVirtualsActive() {}, focus() {}, releaseAll() {}, observe() {} };
  const host = { adapter, learningProgress: { load: () => null }, cues: { reset() {} },
    panel: { setTransport() {} }, r: { updateMetronomeLabel() {},
      audioSystem: { ensureAudio: async () => {}, audioContextService: { context: { state: "running", currentTime: 0 } } } } };
  class Ensemble extends LiveMelodyEnsemble {
    constructor(host, definition) {
      super(host, definition);
      this.prepared = true; this.schedules = 0; this.metro = metro;
      this.originalSetBpm = metro.setBpm;
      this.hands = { release() {}, update() {}, play() {} };
    }
    validate() { return true; }
    schedule(options) { this.schedules++; super.schedule(options); }
  }
  return { host, metro, honks, tutorial: new SongTutorial(host, definition, { Ensemble }) };
}

const files = ["tu-kisi-rail-si/composition.json", "rishte-naate/composition.json"];
for (const file of files) test(`${file}: Practice follows song time through silence, short notes and held notes`, async () => {
  const documentBefore = globalThis.document;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  const definition = JSON.parse(readFileSync(new URL(`../../src/compositions/${file}`, import.meta.url)));
  const { tutorial: d, metro, honks, host } = fixture(definition);
  try {
    await d.action("step-practice");
    assert.ok(d.guide instanceof MelodyGuidance);
    assert.equal(d.practiceGate, undefined);
    assert.equal(d.ensemble.schedules, 1, "Backing and melody cues start together");
    const first = d.guide.step.events[0], second = d.guide.step.events[1];
    const beatMs = 60000 / metro.bpm;
    const at = beat => d.anchor + (beat - d.step.startBeat) * beatMs;
    const update = now => { d.last = now - 16; d.update(now); };
    update(at(first.beat + .01));
    assert.equal(d.phase, "practice");
    assert.ok(Math.abs(d.guide.beatAt(at(second.beat)) - second.beat) < 1e-8, "Silence cannot delay the next note");
    d.accept({ id: "short", kind: "note", origin: "learner", voiced: true, released: true,
      midis: [first.midi], startMs: at(first.beat), endMs: at(first.beat) + 1 });
    host.adapter.gestures.set("held", { role: first.role, voiced: true, startMs: at(first.beat) });
    update(at(second.beat + .01));
    assert.ok(d.guide.beatAt(at(second.beat + .01)) > second.beat, "Holding the first note cannot freeze the score");
    update(at(d.step.endBeat + .01));
    assert.equal(d.phase, null); assert.equal(d.outcomes[d.step.id], "retry", "Missed notes must not pass");
    assert.equal(metro.playing, false);
    assert.ok([...honks.values()].every(h => h.root.visible));
    await d.action("step-practice");
    assert.ok(d.guide.beatAt(performance.now()) < d.step.startBeat, "Retry starts a new count-in");
    const toMs = beat => d.anchor + (beat - d.step.startBeat) * 60000 / metro.bpm;
    for (const e of d.guide.step.events) d.accept({ id: e.id, kind: "note", origin: "learner", voiced: true,
      released: true, midis: [e.midi], startMs: toMs(e.beat), endMs: toMs(e.beat + e.beats) });
    update(toMs(d.step.endBeat + .01));
    assert.equal(d.outcomes[d.step.id], "passed", "On-time pitches and releases still pass");
    await d.action("step-demo");
    assert.ok(d.guide instanceof MelodyGuidance);
    assert.equal(d.ensemble.schedules, 3);
  } finally { d.cancel(); globalThis.document = documentBefore; }
});

for (const file of files)
  test(`${file}: Tempo buttons keep the chosen BPM across Practice, Retry, Demonstrate and phrase navigation`, async () => {
    const documentBefore = globalThis.document;
    globalThis.document = { addEventListener() {}, removeEventListener() {} };
    const definition = JSON.parse(readFileSync(new URL(`../../src/compositions/${file}`, import.meta.url)));
    const { tutorial: d, metro } = fixture(definition);
    try {
      const initial = metro.bpm;
      await d.action("tempo-down");
      assert.equal(metro.bpm, initial - 5);
      await d.action("step-practice");
      assert.equal(metro.bpm, initial - 5, "Practice must not override the selected BPM with its recommendation");
      await d.action("tempo-up");
      assert.equal(metro.bpm, initial);
      assert.equal(d.guide.beatMs, 60000 / initial);
      await d.action("step-practice");
      assert.equal(metro.bpm, initial, "Retry must keep the selected BPM");
      await d.action("next-step");
      await d.action("step-demo");
      assert.equal(metro.bpm, initial, "Demonstrate and phrase navigation must keep the selected BPM");
      await d.action("tempo-down");
      await d.action("step-practice");
      assert.equal(metro.bpm, initial - 5);
    } finally { d.cancel(); globalThis.document = documentBefore; }
  });

test("Tempo buttons preserve count-in beats and the running score phase", async () => {
  const documentBefore = globalThis.document, originalNow = performance.now;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  let now = 1000;
  performance.now = () => now;
  const definition = JSON.parse(readFileSync(new URL("../../src/compositions/tu-kisi-rail-si/composition.json", import.meta.url)));
  const { tutorial: d, metro } = fixture(definition);
  try {
    await d.action("step-practice");
    assert.equal(metro.bpm, 60, "Unselected practice still starts at its recommended speed");
    assert.equal(d.anchor, 5000);
    now = 2000;
    await d.action("tempo-up");
    assert.equal(metro.bpm, 65);
    assert.ok(Math.abs(d.anchor - (now + 3 * 60000 / 65)) < 1e-6);
    assert.equal(d.ensemble.anchor, d.anchor);
    assert.ok(Math.abs(d.guide.beatAt(d.anchor)) < 1e-8);
    now += 60000 / 65;
    await d.action("tempo-down");
    assert.equal(metro.bpm, 60);
    assert.ok(Math.abs(d.anchor - (now + 2 * 1000)) < 1e-6, "Two count-in beats remain after slowing down");
    now = d.anchor + 3010;
    const beat = d.guide.beatAt(now);
    await d.action("tempo-up");
    assert.ok(Math.abs(d.guide.beatAt(now) - beat) < 1e-8, "Tempo change preserves the current song position");
    now += 60000 / 65;
    assert.ok(Math.abs(d.guide.beatAt(now) - beat - 1) < 1e-8, "Next beat uses the new BPM");
  } finally {
    d.cancel(); performance.now = originalNow; globalThis.document = documentBefore;
  }
});
