import assert from "node:assert/strict";
import test from "node:test";
import { CompositionPlayer } from "../../src/composition/CompositionPlayer.js";
import { kuchToHuaHaiScore as score, COMPOSITION_PITCHES } from "../../src/composition/kuchToHuaHaiScore.js";
import { HonkInstrument } from "../../src/instruments/honk/HonkInstrument.js";

function fixture(ensureContext) {
  const context = { currentTime: 12 };
  const scheduled = [];
  const cancelled = [];
  const honks = new Map(COMPOSITION_PITCHES.map(pitch => [pitch, new HonkInstrument({
    root: { userData: {} }, warnMissingExpectedMorphs: false,
    morphController: { applyPerformanceState() {} },
  })]));
  const audioSystem = {
    ensureContext: ensureContext || (async () => context),
    scheduleHonkNote: (id, performance, tuning, options) => scheduled.push({ id, performance, tuning, ...options }),
    cancelScheduledHonk: id => cancelled.push(id),
  };
  return { player: new CompositionPlayer({ audioSystem, honks, score }), context, scheduled, cancelled, honks };
}

test("click schedules the entire song against the audio clock without frame updates", async () => {
  const { player, scheduled } = fixture();
  assert.equal(await player.play(), true);
  assert.equal(scheduled.length, score.events.length);
  scheduled.forEach((note, index) => {
    assert.equal(note.startTime, 12.35 + score.events[index].startBeat * 60 / score.tempoBpm);
    assert.equal(note.duration, score.events[index].durationBeats * 60 / score.tempoBpm);
  });
  await player.play();
  assert.equal(scheduled.length, score.events.length);
  assert.equal(new Set(scheduled.map(e => e.id)).size, scheduled.length);
});

test("Stop cancels all future and sounding notes, clears only composition animation", async () => {
  const { player, cancelled, honks, scheduled } = fixture();
  await player.play();
  honks.get("D4").performance.beginSqueeze("manual", .7);
  player.updatePresentation(player.startTime + .12);
  assert.ok(honks.get("G3").getResolvedPerformanceState().squeeze > .9);
  player.stop();
  assert.equal(cancelled.length, score.events.length);
  assert.equal(honks.get("G3").getResolvedPerformanceState().squeeze, 0);
  assert.equal(honks.get("D4").getResolvedPerformanceState().squeeze, .7);
  scheduled.forEach(e => e.onEnded());
  assert.equal(player.state, "stopped");
});

test("Restart begins from the first pitch; stale ended callbacks cannot finish the new run", async () => {
  const { player, scheduled, cancelled, context } = fixture();
  await player.play();
  const previous = [...scheduled];
  context.currentTime = 30;
  await player.restart();
  assert.equal(cancelled.length, score.events.length);
  assert.equal(scheduled[previous.length].startTime, 30.35);
  assert.notEqual(scheduled[0].id, scheduled[previous.length].id);
  previous.forEach(e => e.onEnded());
  assert.equal(player.state, "playing");
  assert.equal(player.voiceIds.size, score.events.length);
});

test("Stop during audio unlock prevents all later scheduling", async () => {
  let resolve;
  const { player, scheduled } = fixture(() => new Promise(r => { resolve = r; }));
  const starting = player.play();
  assert.equal(player.state, "starting");
  await player.play();
  player.stop();
  resolve({ currentTime: 42 });
  await starting;
  assert.equal(scheduled.length, 0);
  assert.equal(player.state, "stopped");
});

test("Restart while unlock is pending invalidates the old async play", async () => {
  const pending = [];
  const { player, scheduled } = fixture(() => new Promise(r => pending.push(r)));
  const original = player.play();
  const replacement = player.restart();
  pending[1]({ currentTime: 10 });
  await replacement;
  pending[0]({ currentTime: 15 });
  await original;
  assert.equal(scheduled.length, score.events.length);
  assert.equal(player.startTime, 10.35);
});

test("animation tracks absolute attack and release times; final tail finishes once", async () => {
  const { player, scheduled, honks } = fixture();
  await player.play();
  player.updatePresentation(player.startTime - .01);
  assert.equal(player.activePitches.size, 0);
  const end = player.startTime + score.events[0].durationBeats * 60 / score.tempoBpm;
  player.updatePresentation(end + .06);
  assert.ok(Math.abs(honks.get("G3").getResolvedPerformanceState().squeeze - .5) < .001);
  player.updatePresentation(end + .121);
  assert.equal(honks.get("G3").getResolvedPerformanceState().squeeze, 0);
  scheduled.slice(0, -1).forEach(e => e.onEnded());
  assert.equal(player.state, "playing");
  scheduled.at(-1).onEnded();
  assert.equal(player.state, "finished");
  assert.equal(player.voiceIds.size, 0);
  player.updatePresentation(9999);
  assert.equal(scheduled.length, score.events.length);
  assert.equal(player.activePitches.size, 0);
});

test("failed scheduling cancels the partial performance and can be retried", async () => {
  const { player, cancelled } = fixture();
  player.audioSystem.scheduleHonkNote = () => { throw new Error("No audio"); };
  await assert.rejects(player.play(), /No audio/);
  assert.equal(player.state, "error");
  assert.equal(cancelled.length, 1);
  assert.equal(player.voiceIds.size, 0);
});
