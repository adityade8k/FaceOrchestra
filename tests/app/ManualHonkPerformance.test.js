import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, flushAudio } from '../support/manualHonkFixture.mjs';

for (const locked of [false, true]) test(`one versus three ${locked ? 'locked' : 'unlocked'} honks: aligned real voice onsets, one processing pass, bounded starts`, async () => {
  const solo = fixture({ locked }); const chord = fixture({ count: 3, locked });
  assert.equal(chord.contact.graph.hasContact('h0', 'h2'), false, 'C is reachable only through B');
  solo.press(); chord.press();
  for (let frame = 0; frame < 90; frame++) {
    solo.frame(); chord.frame(); await flushAudio();
    for (const h of chord.honks) assert.equal(h.processedLivePerformance.squeeze, solo.honks[0].processedLivePerformance.squeeze);
  }
  assert.equal(solo.counters.starts, 1); assert.equal(chord.counters.starts, 3);
  assert.equal(chord.audio.voices.size, 3);
  const oscillators = chord.context.nodes.filter(n => n.kind === 'oscillator');
  assert.equal(oscillators.length, 6, 'two actual HonkVoice oscillators per honk');
  assert.equal(new Set(oscillators.flatMap(n => n.starts)).size, 1);
  assert.equal(oscillators[0].starts[0], 1 / 90);
  assert.equal(chord.counters.queries, 91, 'one trigger-begin selection plus one per held frame');
  assert.equal(chord.counters.locked, 1, 'held squeezes never query locked bodies');
  const revision = chord.contact.graph.revision; chord.frame(); assert.equal(chord.contact.graph.revision, revision);
  solo.release(); chord.release();
  assert.equal(new Set([...chord.audio.releasingVoices.values()].flatMap(vs => [...vs].map(v => v.releaseState.releaseStart))).size, 1);
});

test('entry/exit hysteresis, transitive split and quick rejoin affect only departing owners', async () => {
  const f = fixture({ count: 3 });
  f.press(); f.frame(); await flushAudio();
  const a = f.audio.voices.get('left:h0'); const b = f.audio.voices.get('left:h1');
  const c = f.audio.voices.get('left:h2');
  await f.honks[2].startAudioVoice('looper:independent');
  await f.honks[2].startAudioVoice('metronome:independent');
  f.press(f.honks[2].squeezeCollider, f.controllers[1]); f.frame(); await flushAudio();
  f.honks[2].x += 5;
  f.frame(); f.frame(); assert.equal(f.audio.voices.get('left:h2'), c);
  f.frame(); await flushAudio();
  assert.equal(f.audio.voices.has('left:h2'), false);
  assert.equal(f.audio.voices.get('left:h0'), a); assert.equal(f.audio.voices.get('left:h1'), b);
  for (const id of ['right:h2', 'looper:independent', 'metronome:independent']) assert.ok(f.audio.hasVoice(id));
  assert.equal(f.audio.voices.has('right:h0'), false); assert.equal(f.audio.voices.has('right:h1'), false);
  f.honks[2].x -= 5;
  f.frame(); await flushAudio(); assert.equal(f.audio.voices.has('left:h2'), false);
  f.frame(); await flushAudio();
  assert.ok(f.audio.voices.has('left:h2')); assert.notEqual(f.audio.voices.get('left:h2'), c);
  assert.ok(f.audio.releasingVoices.get('left:h2').has(c));
  assert.equal(f.honks[2].getLivePerformanceState().squeeze, 1);
  f.release(); f.release(f.controllers[1]);
  assert.deepEqual([...f.audio.voices.keys()], ['looper:independent', 'metronome:independent']);
});

test('pending chord starts are not retried per frame, and release before readiness cancels all of them', async () => {
  const f = fixture({ count: 3 }); let ready;
  const promise = new Promise(resolve => { ready = resolve; });
  f.audio.ensureAudio = () => promise;
  f.press(); for (let i = 0; i < 20; i++) f.frame();
  assert.equal(f.counters.starts, 3); assert.equal(f.audio.startingVoices.size, 3);
  f.release(); ready(f.context); await flushAudio();
  assert.equal(f.context.nodes.length, 0); assert.equal(f.audio.hasVoice('left:h0'), false);
  f.press(f.honks[0].getTarget('honk.body')); f.frame(); await flushAudio();
  assert.equal(f.context.nodes.length, 0);
});

test('failed startup retries from service truth, while cancelled older promises cannot remove new generations', async () => {
  const f = fixture({ count: 3 });
  f.audio.ensureAudio = () => Promise.reject(new Error('resume failed'));
  f.press(); f.frame(); await flushAudio();
  assert.equal(f.counters.starts, 3); assert.equal(f.audio.startingVoices.size, 0);
  assert.ok(f.honks.every(h => h.activeVoiceIds.size === 1), 'stale membership is intentionally insufficient');
  f.audio.ensureAudio = async () => f.context;
  f.frame(); await flushAudio(); assert.equal(f.counters.starts, 6); assert.equal(f.audio.voices.size, 3);
  // A service-side loss must recover even with unchanged controller membership.
  f.audio.cancelVoice('left:h1'); f.frame(); await flushAudio();
  assert.equal(f.counters.starts, 7); assert.equal(f.audio.voices.size, 3);
  f.release();
  let finishOld; const oldReadiness = new Promise(resolve => { finishOld = resolve; });
  f.audio.ensureAudio = () => oldReadiness;
  f.press(); f.frame(); f.release();
  f.audio.ensureAudio = async () => f.context;
  f.press(); f.frame(); await flushAudio();
  const current = f.audio.voices.get('left:h2');
  finishOld(f.context); await flushAudio();
  assert.equal(f.audio.voices.get('left:h2'), current); f.release();
});

test('rapid squeeze generations preserve independent release tails without per-frame restarts', async () => {
  const f = fixture({ count: 3 });
  for (let i = 0; i < 6; i++) {
    f.press(); f.frame(); await flushAudio(); f.frame(4); f.release(); f.frame(4);
  }
  assert.equal(f.counters.starts, 18); assert.equal(f.audio.voices.size, 0);
  assert.equal(f.context.nodes.filter(n => n.kind === 'oscillator').length, 36);
  assert.ok([...f.audio.releasingVoices.values()].every(voices => voices.size === 6));
});

test('actual Trigger activation and voice startup recover together after AudioContext resume rejects', async () => {
  const f = fixture({ count: 3, ensureContext: async () => { throw new Error('resume rejected'); } });
  f.press(); f.frame(); await flushAudio();
  assert.equal(f.audio.voices.size, 0); assert.equal(f.audio.startTokens.size, 0);
  f.host.audioSystem.audioContextService.ensureContext = async () => f.context;
  f.frame(); await flushAudio();
  assert.equal(f.audio.voices.size, 3); assert.equal(f.counters.starts, 6);
  f.release();
});
