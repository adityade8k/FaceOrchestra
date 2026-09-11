import test from 'node:test';
import assert from 'node:assert/strict';
import { LooperController } from '../../../src/instruments/looper/LooperController.js';
import { HonkContactGraph } from '../../../src/instruments/formations/HonkContactGraph.js';
import { LooperTrackTimeline } from '../../../src/instruments/looper/timeline/LooperTrackTimeline.js';
import { createPlaybackFixture } from '../../../scripts/looper-playback-fixture.mjs';

const fixture = (options) => createPlaybackFixture(LooperController, HonkContactGraph, options);

test('eight-track group join batches reconstruction and never replays queued self percussion', () => {
  const h = fixture({ seconds: 1, snapshotMs: 10, noteEndMs: 500, percussion: true, trace: true });
  h.start();
  h.setTime(100);
  h.controller.schedulePlaybackAudioForLooper(h.looper, 100);
  assert.equal(h.looper.looperData.audioScheduling.scheduledThroughSourceMs, 220);
  assert.equal(h.counts.drum, 1);
  h.resetCounts();
  h.join();
  h.setTime(110);
  h.controller.updatePlaybackForLooper(h.looper, 110);
  assert.equal(h.counts.ranges, 8);
  assert.equal(h.counts.entries, 96); // one current phase + eleven queued snapshots per track
  assert.equal(h.counts.start, 64);
  assert.equal(h.counts.drum, 0);
  assert.equal(h.looper.looperData.audioScheduling.scheduledThroughSourceMs, 220);
  assert.equal(new Set(h.calls.filter(([kind]) => kind === 'start').map(([, voice]) => voice)).size, 64);
  h.setTime(400);
  h.controller.schedulePlaybackAudioForLooper(h.looper, 400);
  const ends = h.calls.filter(([kind, , id]) => kind === 'release' && id.startsWith('joined'));
  assert.equal(ends.length, 64);
  assert.ok(ends.every(([, , , options]) => options.scheduledTime === 10.5));
  h.controller.stopPlayback(h.looper);
  assert.equal(h.controller.applier.generationsByLayer.size, 0);
  assert.equal(h.controller.applier.generationsByNote.size, 0);
});

test('a separate contact component receives no reconstruction and stable topology needs no graph queries', () => {
  const h = fixture({ tracks: 2, seconds: 1, separateSources: true, trace: true });
  h.start();
  h.resetCounts();
  for (let time = 1; time < 100; time += 1) {
    h.setTime(time);
    h.controller.updatePlaybackForLooper(h.looper, time);
  }
  assert.equal(h.counts.graph, 0);
  h.join(2, 0);
  h.setTime(100);
  h.controller.updatePlaybackForLooper(h.looper, 100);
  assert.equal(h.counts.ranges, 1);
  const starts = h.calls.filter(([kind]) => kind === 'start');
  assert.equal(starts.length, 2);
  assert.ok(starts.every(([, voice]) => voice.includes('track-0:')));
  h.controller.stopPlayback(h.looper);
});

test('same-time end/start/gesture ownership is indexed across mutation, normalization, restore and wrap', () => {
  let t = new LooperTrackTimeline({ trackId: 't' });
  const start = t.addEvent('squeezeStart', 0, { gateOnly: true });
  const end = t.addEvent('squeezeEnd', 100, { gateOnly: true });
  const next = t.addEvent('squeezeStart', 100, { gateOnly: true });
  const gesture = t.addEvent('gestureSnapshot', 100, { values: { squeeze: 1 } });
  assert.equal(t.getOwningNote(end).event, start);
  assert.equal(t.getOwningNote(gesture).event, next);
  assert.equal(t.getActiveNote(100, 200).event, next);
  assert.equal(t.getActiveNote(-1, 200).cycleOffset, -1);
  t.addDrumHit(150, 'hihat');
  assert.equal(t.getDrumHitEventsBetween(100, 200).length, 1);
  t.normalize(50);
  assert.equal(t.getDrumHitEventsAt(100).length, 1);
  t.discardEventsBefore(50);
  assert.equal(t.getOwningNote(start), null);
  t = LooperTrackTimeline.fromJSON(t.toJSON());
  assert.equal(t.getActiveNote(50, 200).event.type, 'squeezeStart');
  assert.equal(t.getDrumHitEventsAt(100).length, 1);
  assert.equal('eventOwners' in t.toJSON(), false);
  // Dense arrays must not be consulted once derived indexes exist.
  t.events.indexOf = () => { throw Error('linear ownership lookup'); };
  t.events.filter = () => { throw Error('full recording drum scan'); };
  assert.equal(t.getOwningNote(t.performanceEvents.at(-1)).event.type, 'squeezeStart');
  assert.equal(t.getDrumHitEventsBetween(0, 200).length, 1);
});

test('playability changes invalidate desired ownership without a topology revision', () => {
  const h = fixture({ tracks: 1, seconds: 1 });
  h.join(1);
  h.start();
  const playable = new Set(['source-0']);
  h.controller.adapter.isPlayableHonkId = (id) => playable.has(id);
  h.resetCounts();
  h.setTime(20);
  h.controller.updatePlaybackForLooper(h.looper, 20);
  assert.equal(h.counts.cancel, 1);
  playable.add('joined-0');
  h.setTime(30);
  h.controller.updatePlaybackForLooper(h.looper, 30);
  assert.equal(h.counts.start, 1);
  h.controller.stopPlayback(h.looper);
  assert.equal(h.controller.applier.generationsByTarget.size, 0);
});
