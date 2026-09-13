// Original arrangement; Jog's note treatment is discussed in docs/tutorial.md.
// All timings, instructions, demonstrations and assessments consume this score.
export const TOLERANCES = Object.freeze({
  bpm: 1, setupStableMs: 500, contactStableMs: 350, pitchCents: 35,
  onsetBeats: 0.25, durationBeats: 0.35, minimumNoteMs: 450,
  bendEndpointCents: 50, bendSettleMs: 150, maxFrameGapMs: 250,
});
export const PITCHES = Object.freeze({
  C4: { midi: 60, syllable: 'S', name: 'Sa' },
  Eb4: { midi: 63, syllable: 'g', name: 'komal Ga' },
  E4: { midi: 64, syllable: 'G', name: 'shuddha Ga' },
  F4: { midi: 65, syllable: 'M', name: 'shuddha Ma' },
  G4: { midi: 67, syllable: 'P', name: 'Pa' },
  Bb4: { midi: 70, syllable: 'n', name: 'komal Ni' },
  C5: { midi: 72, syllable: "S'", name: 'upper Sa' },
});
export function tuningForMidi(midi) {
  const octaveOffset = Math.floor((midi - 60) / 12);
  return { semitonesFromF: midi - 65 - octaveOffset * 12, octaveOffset };
}
export const DESCENDING_BEND = Object.freeze([
  { fraction: 0, semitones: 0 }, { fraction: 0.2, semitones: 0 },
  { fraction: 0.7, semitones: -3 }, { fraction: 1, semitones: -3 },
]);
export function bendAt(curve, fraction) {
  if (!curve) return 0;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1], b = curve[i];
    if (fraction <= b.fraction) {
      const t = Math.max(0, Math.min(1, (fraction - a.fraction) / (b.fraction - a.fraction)));
      return a.semitones + (b.semitones - a.semitones) * (t * t * (3 - 2 * t));
    }
  }
  return curve.at(-1).semitones;
}
function phrase(items) {
  let beat = 0;
  return Object.freeze(items.map(([pitch, beats, bend = false], i) => {
    const event = Object.freeze({ id: `note-${i}`, pitch, midi: PITCHES[pitch]?.midi ?? null,
      role: pitch ? `melody-${pitch}` : null, beat, beats, bend: bend ? DESCENDING_BEND : null });
    beat += beats;
    return event;
  }));
}
const phrases = Object.freeze({
  A: phrase([['C4',2],['E4',1],['F4',1],['G4',2],['Bb4',1],['G4',1],['F4',1],['E4',1],['F4',1],['Eb4',3,true],['C4',1],[null,1]]),
  B: phrase([['C4',1],['E4',1],['F4',1],['G4',1],['Bb4',2],['C5',2],['Bb4',1],['G4',1],['F4',1],['E4',1],['F4',1],['Eb4',2,true],[null,1]]),
  C: phrase([['G4',2],['Bb4',1],['C5',1],['Bb4',2],['G4',2],['F4',1],['E4',1],['F4',1],['Eb4',3,true],['C4',1],[null,1]]),
  D: phrase([['C4',1],['E4',1],['F4',1],['G4',1],['F4',1],['E4',1],['F4',1],['Eb4',3,true],['C4',5],[null,1]]),
});
const backing = [[48,55,60],[48,53,55],[46,48,55],[43,48,60]].map((midis, i) =>
  Object.freeze({ role: `group-${i + 1}`, label: `Group ${i + 1}`, midis: Object.freeze(midis),
    notes: ['C3 · G3 · C4','C3 · F3 · G3','Bb2 · C3 · G3','G2 · C3 · C4'][i],
    catalogId: `jog-group-${i + 1}`, trackIndex: i, beat: i * 4, beats: 3.7 }));
const percussion = [0,4,8,12].flatMap(beat => [
  { beat, role: 'percussion', type: 'boink', lane: 'track-4' },
  { beat: beat + 2, role: 'metronome', type: 'metronomeWood', lane: 'track-5' },
  { beat: beat + 3, role: 'looper', type: 'hihat', lane: 'looper-self-percussion' },
]);
export const COMPOSITION = Object.freeze({
  id: 'virag-2-jog-study', version: 1, title: 'VIRAG 2 — JOG STUDY', bpm: 80,
  beatMs: 750, loopBeats: 16, gapBeats: 0, phrases, backing: Object.freeze(backing),
  percussion: Object.freeze(percussion), pitches: PITCHES,
  order: Object.freeze(['A','B','A','C','B','D']), backingVowel: 'O', backingNose: 0.35,
});
export function performanceEvents(order = COMPOSITION.order) {
  return order.flatMap((name, index) => phrases[name].map(event =>
    ({ ...event, id: `${index}-${name}-${event.id}`, phrase: name, phraseIndex: index, beat: index * 16 + event.beat })));
}
export function describeNote(event) {
  if (!event.pitch) return `Rest (${event.beats} beat)`;
  const p = PITCHES[event.pitch];
  return `${p.syllable} = ${event.pitch}${event.bend ? ' → C4, held glide' : ''} (${event.beats} beat${event.beats === 1 ? '' : 's'})`;
}
export const TUTORIAL_PRESETS = Object.freeze([
  ...backing.map(group => ({ id: group.catalogId, label: `${group.label}: ${group.notes}`,
    role: group.role, midis: group.midis, spacing: 0.14 })),
  { id: 'jog-percussion', label: 'Percussion Honk C3', role: 'percussion', midis: [48], spacing: 0 },
  { id: 'jog-melody', label: 'Jog melody row — both Ga variants', role: 'melody',
    midis: Object.values(PITCHES).map(p => p.midi), spacing: 0.32 },
]);
