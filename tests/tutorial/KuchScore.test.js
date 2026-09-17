import test from 'node:test';
import assert from 'node:assert/strict';
import { MIDI_REFERENCE } from '../../src/tutorial/kuch/midiReference.js';
import { BPM, BEAT_MS, MELODY, MELODY_PARTS, CHORDS, DRUMS, VOICINGS, PATTERN_CHANGES, PERFORMANCE_BEATS, STEPS, shortenBeat, assess } from '../../src/tutorial/kuch/score.js';

test('Kuch lead retains every MIDI pitch, duration and dynamic while halving only the two interludes',()=>{
  const original=MIDI_REFERENCE.tracks.find(t=>t.name==='Guitar').notes;
  assert.equal(MELODY.length,185);assert.equal(BPM,92);
  original.forEach(([tick,duration,midi,velocity],i)=>{
    assert.equal(MELODY[i].midi,midi);assert.equal(MELODY[i].beats,duration/480);
    assert.equal(MELODY[i].velocity,velocity);assert.equal(MELODY[i].beat,shortenBeat(tick/480)-24);
  });
  assert.equal(shortenBeat(80)-shortenBeat(64),8);
  assert.equal(shortenBeat(136)-shortenBeat(120),8);
  assert.ok(MELODY.every(n=>n.beat>=0&&n.beat+n.beats<=PERFORMANCE_BEATS));
  assert.deepEqual(STEPS.filter(s=>s.kind==='melody').flatMap(s=>s.events).map(n=>n.id),MELODY.map(n=>n.id));
});
test('four melody drills cover every note without splitting holds and keep their song harmony',()=>{
  assert.equal(STEPS.length,9);assert.equal(MELODY_PARTS.length,4);
  assert.deepEqual(STEPS.slice(4,8),MELODY_PARTS);
  assert.equal(STEPS.at(-1).kind,'performance');assert.equal(STEPS.at(-1).events,MELODY);
  assert.deepEqual(MELODY_PARTS.flatMap(p=>p.events).map(n=>n.id),MELODY.map(n=>n.id));
  for(const part of MELODY_PARTS){
    assert.equal(part.sourceStart%16,0,'begin on a backing loop boundary');
    for(const n of part.events){
      assert.ok(n.beat>=0&&n.beat+n.beats<=part.beats,'a drill must contain the whole note');
      assert.equal(n.beat+part.sourceStart,MELODY.find(source=>source.id===n.id).beat);
      const expected=PATTERN_CHANGES.filter(([beat])=>beat<=n.beat+part.sourceStart).at(-1)[1];
      assert.equal(part.backingChanges.filter(([beat])=>beat<=n.beat).at(-1)[1],expected);
    }
  }
  assert.deepEqual(MELODY_PARTS[2].backingChanges,[[0,'change'],[16,'D']]);
});
test('four-bar guitar patterns use original simultaneous voicings; drum identifiers map only to stick targets',()=>{
  assert.equal(CHORDS.D.length,12);assert.equal(CHORDS.change.length,10);
  for(const bank of Object.values(CHORDS))for(const n of bank){
    assert.deepEqual(n.midis.sort((a,b)=>a-b),VOICINGS[n.role]);assert.ok(n.beat+n.beats<=16);
  }
  assert.equal(DRUMS.length,20);assert.equal(DRUMS.filter(n=>n.sound==='boink').length,12);
  assert.ok(DRUMS.every(n=>n.midi===undefined&&['percussion','percussionLooper'].includes(n.role)));
  assert.ok(PATTERN_CHANGES.every(([beat,bank])=>beat%16===0&&CHORDS[bank]));
});
test('practice scores actual learner pitches, onsets, holds and withdrawals without crediting teacher notes',()=>{
  const expected=[{beat:1,beats:.75,midi:69,role:'lead-69'}];
  const heard={kind:'note',origin:'learner',role:'lead-69',midis:[69],startMs:BEAT_MS,endMs:1.75*BEAT_MS,released:true,voiced:true};
  assert.equal(assess(expected,[heard],0).score,100);
  for(const change of [{origin:'demonstration'},{midis:[68]},{released:false},{voiced:false},{endMs:BEAT_MS},{startMs:3*BEAT_MS}])assert.equal(assess(expected,[{...heard,...change}],0).score,0);
  assert.equal(assess(expected,[heard,heard],0).score,50);
  const drum=[{role:'percussion',beat:0}];
  assert.equal(assess(drum,[{kind:'strike',role:'percussion',origin:'learner',startMs:0,withdrawn:false}],0).score,0);
});
