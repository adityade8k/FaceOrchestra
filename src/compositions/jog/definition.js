// Original arrangement; Jog's note treatment is discussed in docs/compositions.md.
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
    catalogId: `jog-group-${i + 1}`, beat: i * 4, beats: 3.7 }));
const percussion = [0,4,8,12].flatMap(beat => [
  { beat, role: 'percussion', type: 'boink' },
  { beat: beat + 2, role: 'metronome', type: 'metronomeWood' },
  { beat: beat + 3, role: 'percussionLooper', type: 'hihat', lane: 'looper-self-percussion' },
]);
export const COMPOSITION = Object.freeze({
  id: 'virag-2-jog-study', version: 3, title: 'VIRAG 2 — JOG STUDY', bpm: 80,
  beatMs: 750, loopBeats: 16, gapBeats: 0, phrases, backing: Object.freeze(backing),
  alternateBacking: Object.freeze([0,4,8,12].map(beat => ({...backing[0], beat, beats:1.7}))),
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

export const TUTORIAL_LOOPERS = Object.freeze([
  {role:'chordLooper', label:'Chord Looper', catalogId:'jog-chord-looper'},
  {role:'percussionLooper', label:'Percussion Looper', catalogId:'jog-percussion-looper'},
  {role:'alternativeLooper', label:'Alternative Looper', catalogId:'jog-alternative-looper'},
]);

const C = COMPOSITION;
const steps = [];
function add(id, type, title, instruction, options = {}) {
  steps.push(Object.freeze({ id, type, title, instruction, prerequisites: steps.length ? [steps.at(-1).id] : [],
    entry: 'Setup is checked automatically. Demonstrate or Practice music, or choose Next to skip it. Only fresh learner evidence earns practice credit.',
    evidenceSources: ['learner', 'simulation'], retry: 'Release gestures, discard this attempt, retain valid setup.',
    cleanup: 'Release owned gestures and temporary targets on retry or exit.', ...options }));
}
add('intro','ack','An original Jog-inspired study',
  'Sa = C. G = E, g = Eb, n = Bb. Practice the 16-beat backing score, then play the melody and descending g → S glides.', { action: 'begin', actionLabel: 'Begin' });
add('metronome','spawn','Place a Metronome','One shared clock anchors the 16-beat exercise. Keep it within reach of your stick hand.', { role:'metronome', kind:'metronome', catalogId:'metronome' });
for (const [index,l] of TUTORIAL_LOOPERS.entries()) add(l.role,'spawn',`Place ${l.label}`,`Radial menu → Instruments → Looper. The ${['first','second','third'][index]} placed Looper becomes ${l.label}. Each Looper stores one recording; recording again replaces it. Separate loopers hold separate patterns. Leave room for cables and buttons.`, {role:l.role,kind:'looper',catalogId:'looper'});
for (const l of TUTORIAL_LOOPERS) add(`clock-${l.role}`,'clock-wire',`Connect ${l.label}`,l.role==='alternativeLooper'?'Connect Alternative Looper to the SAME Metronome output as Chord Looper. Both cables stay connected; only one alternative plays at a time.':l.role==='percussionLooper'?'Connect Percussion Looper to a DIFFERENT Metronome output from Chord Looper so they can play simultaneously.':'Connect one Metronome output to a compatible Chord Looper socket.',{looperRole:l.role,action:`clock-${l.role}`,actionLabel:`Connect ${l.label}`});
add('tempo','tempo','Set 80 BPM and start','Set the Metronome to 80 BPM and press Play. Set all Looper Gap controls to zero. Keep the click audible for this lesson.',{action:'tempo',actionLabel:'80 BPM · Start · All Gap 0'});
for (const group of C.backing) {
  add(`spawn-${group.role}`,'spawn',`Place ${group.label}`,`Radial menu → Chords → ${group.label}: ${group.notes}. Place apart from other groups. The three voices lock together; grab any member to move the chord.`, { role:group.role, kind:'honk', catalogId:group.catalogId });
  add(`wire-${group.role}`,'wire',`Wire ${group.label}`,`Connect any member of ${group.label} to a free Chord Looper socket. Its touching partners join the chord. Use one route for this group.`, { role:group.role, action:`wire-${group.role}`, actionLabel:`Connect ${group.label}` });
}
for (const vowel of ['E','O']) add(`audition-${vowel}`,'note',`Audition the ${vowel} vowel`,
  `Group 1 · ${C.backing[0].notes}. Hold the ${vowel} vowel for half a second, then release. Listen to its colour; keep the pitch steady.`,
  { role:'group-1', midis:C.backing[0].midis, vowel, action:`vowel-${vowel}`,actionLabel:`Choose ${vowel} vowel`, minimumMs:450 });
add('timbre','timbre','Balance the accompaniment','Soften the backing with O and lowered noses. Keep its volume beneath the melody and its pitch steady.',{action:'timbre',actionLabel:'O vowel · Soft backing'});
add('chord','note','Squeeze and release a whole chord','Group 1 · C3, G3, C4. Hold all three voices for half a second, then let them breathe together.',{role:'group-1',midis:C.backing[0].midis,minimumMs:450});
add('chords-rehearse','chords','Rehearse the four groups','Groups 1, 2, 3, 4 enter on beats 1, 5, 9, 13. Hold each for 3.7 beats, then leave a short breath. Practice starts the count-in.',{timed:true,beats:16});
add('length-chords','record-length','Prepare Chord Looper','Set the right handle to 16 beats. Recording ends automatically after 16 beats; the count-in happens before capture.',{looperRole:'chordLooper',action:'record-length-chordLooper'});
add('record-chords','record','Record chords alone','Practice arms the chord take and counts you in. Groups 1–4 enter on 1, 5, 9, 13; hold 3.7 beats each. Fit the full pattern into 16 beats. Recording stops automatically. Silent waiting uses no recording beats.',{looperRole:'chordLooper',timed:true,beats:16,action:'record-chordLooper',actionLabel:'Record Chords'});
add('finalize-chords','finalize','Inspect the chord take','Listen for four steady chords across 16 beats. Practice checks the completed take and its releases.',{looperRole:'chordLooper',action:'stop-record-chordLooper',actionLabel:'Finish chord take'});
add('playback-chords','playback','Listen to Chord Looper','Play selects this recording on its output and starts on the next beat. An intentional first-note offset remains. Other outputs keep their own playback. Release both hands and listen for a complete cycle.',{looperRole:'chordLooper',action:'play-chordLooper',actionLabel:'Play Chords'});
add('wire-alternative','wire','Wire the alternative pattern','Connect Group 1 to a free Alternative Looper socket. Its three chord voices form tracks in one recording, not separate saved loops.',{role:'group-1',wireKey:'alternative-group-1',looperRole:'alternativeLooper',action:'wire-alternative-group-1',actionLabel:'Connect alternative'});
add('length-alternative','record-length','Prepare Alternative Looper','Set the right handle to 16 beats and Gap to zero. Re-recording replaces only this Looper’s recording.',{looperRole:'alternativeLooper',action:'record-length-alternativeLooper'});
add('record-alternative','record','Record a different pattern','Record Group 1 on beats 1, 5, 9 and 13, holding each for 1.7 beats. Leave the remaining beats silent. This separate Looper keeps the alternative pattern.',{looperRole:'alternativeLooper',timed:true,beats:16,action:'record-alternativeLooper',actionLabel:'Record Alternative'});
add('finalize-alternative','finalize','Inspect the alternative','Four short Group 1 chords and rests make one complete 16-beat recording. The original Chord Looper still keeps its four-group pattern.',{looperRole:'alternativeLooper',action:'stop-record-alternativeLooper'});
add('switch-patterns','switch','Queue a pattern, then switch back','Practice starts Chord Looper. Mid-cycle, press Play Alternative: its amber QUEUED indicator stays silent while the first cycle finishes. At the boundary Alternative starts. Mid-cycle press Play Chords to switch back. Both recordings remain available. Use the buttons below or the Looper Play controls.',{looperRole:'alternativeLooper',action:'switch-start'});
add('percussion','spawn','Place a percussion Honk','Radial menu → Instruments → Honk. Any pitch works for a stick tap. Place it near your stick hand, away from chord groups and melody notes.', { role:'percussion',kind:'honk',catalogId:'honk' });
add('percussion-wire','wire','Wire the percussion Honk','Connect the percussion Honk to a free Percussion Looper socket, separate from its clock socket.',{role:'percussion',looperRole:'percussionLooper',action:'wire-percussion',actionLabel:'Connect percussion'});
add('stick','stick','Equip your stick hand','Ready the stick for three colours: Honk boink, Metronome wood, and Looper hihat.');
for (const [role,label] of [['percussion','percussion Honk'],['metronome','Metronome'],['percussionLooper','Percussion Looper']]) add(`tap-${role}`,'strike',`Tap the ${label}`,
  `Tap the ${label} once, then withdraw completely. Leave room for the sound to finish.`,{role});
add('drums-rehearse','drums','Rehearse the stick pattern','Repeat four times: Honk on 1, wood on 3, hihat on 4. Twelve clean strikes across 16 beats. Practice counts you in.',{timed:true,beats:16});
add('length-percussion','record-length','Prepare Percussion Looper','Set the right handle to 16 beats. Recording ends automatically after 16 beats; the count-in happens before capture.',{looperRole:'percussionLooper',action:'record-length-percussionLooper'});
add('record-percussion','record','Record percussion alone','Practice arms Percussion Looper and counts you in. Repeat Honk / rest / wood / hihat four times. Withdraw after every strike. Fit the full pattern into 16 beats. Recording stops automatically.',{looperRole:'percussionLooper',timed:true,beats:16,action:'record-percussionLooper',actionLabel:'Record Percussion'});
add('finalize-percussion','finalize','Inspect the percussion take','Twelve clear taps across the 16-beat score. The loop keeps its final rest through beat 16. Practice checks the completed percussion take.',{looperRole:'percussionLooper',action:'stop-record-percussionLooper',actionLabel:'Finish percussion take'});
add('playback-percussion','playback','Listen to the linked percussion','Play Percussion selects this recording on its own output. Chords on a different output can continue simultaneously. Listen for a full cycle of all three percussion sounds.',{looperRole:'percussionLooper',action:'play-percussionLooper',actionLabel:'Play Percussion'});
add('start-all','start-all','Start both parts together','Practice selects Chords, then uses Start All to start one recording per output on a shared beat. Active selections keep running. Alternatives share an output; percussion uses a different output. If a take is missing, choose Next Step.',{action:'start-all',actionLabel:'Start All'});
add('unequip','unequip','Put away the stick','Release Grip to unequip the stick before melody practice. Both hands can now squeeze again.');
add('melody','spawn','Place the seven melody Honks','Radial menu → Scales → Jog Study. Keep C4, Eb4, E4, F4, G4, Bb4, C5 separate from each other and the backing. Point and press right B to lock or unlock any Honk during Practice.',{role:'melody',kind:'honk',catalogId:'jog-melody'});
for (const [pitch,p] of Object.entries(PITCHES)) add(`learn-${pitch}`,'note',`${p.syllable} — ${pitch} · ${p.name}`,
  `Play ${pitch} by aiming at its squeeze target and holding Trigger. Sustain until the yellow circle reaches the white edge, then release Trigger. Take your time.`,{role:`melody-${pitch}`,midis:[p.midi],minimumMs:450});
add('learn-bend','note','One voice: g → S','Preview Eb4 → C4 on the radial gauge. Aim and hold Trigger to play, then follow the wrist-roll target down toward C. Settle, then release Trigger. Keep one continuously held voice. Take about 2¼ seconds.',{role:'melody-Eb4',midis:[63],minimumMs:1500,bend:DESCENDING_BEND});
for (const phrase of Object.keys(C.phrases)) add(`phrase-${phrase}`,'phrase',`Practice phrase ${phrase}`,
  `Follow the next note and rings. Practice counts in with your available backing, or the Metronome alone. ${phrase==='D'?'Let the final C linger.':'Keep each descending Eb → C glide in one voice.'}`,
  {phrase,timed:true,beats:16});
add('performance','performance','Perform the whole study','A, B, A, C, B, D · six connected phrases. Practice counts in with available backing, or the Metronome alone. Leave the last beat silent.',{timed:true,beats:96});
export const LESSON_STEPS = Object.freeze(steps);

// Simulation presents a complete performance, while Practice includes untimed
// note learning and separate rehearsals. Both routes use the exact same steps,
// predicates and score; no omitted drill receives a checkpoint or learner credit.
const simulationRoute = steps.filter(step =>
  !['chords-rehearse', 'drums-rehearse'].includes(step.id) &&
  !step.id.startsWith('learn-') && !step.id.startsWith('phrase-'));
export const SIMULATION_STEPS = Object.freeze(simulationRoute.map((step,index) =>
  Object.freeze({...step, ...(step.type==='spawn'?{catalogId:TUTORIAL_LOOPERS.find(l=>l.role===step.role)?.catalogId||(step.role==='percussion'?'jog-percussion':step.catalogId)}:{}), prerequisites:index ? [simulationRoute[index-1].id] : []})));

export const definition = {
  compatibility: { recordingHashes: ["df393f2c499650931de5d4afaf5c25c5bf013a2f9eed63d9a21cbf117e77f61e"], progressVersion: 3 },
  compatibility: { recordingHashes: ["df393f2c499650931de5d4afaf5c25c5bf013a2f9eed63d9a21cbf117e77f61e"], progressVersion: 3 },
  schemaVersion: 1,
  id: COMPOSITION.id,
  title: "Raag Jog",
  contentVersion: COMPOSITION.version,
  bpm: COMPOSITION.bpm,
  source: { kind: "original-study", reference: "Original authored VIRAG 2 Jog treatment" },
  practiceBpm: COMPOSITION.bpm,
  maxBpm: 240,
  liveRole: "melody",
  score: structuredClone(COMPOSITION),
  arrangement: {
    recipes: structuredClone(TUTORIAL_PRESETS),
    liveEvents: performanceEvents(),
    provenance: "Existing authored VIRAG 2 Jog treatment, unchanged",
  },
  lessons: LESSON_STEPS.map((s) => ({
    ...s,
    id: s.id,
    goal: s.instruction,
    practice: true,
    demonstration: true,
    assessment: { ...TOLERANCES },
    skip: true,
    completePerformance: s.type === "performance",
    sourceStep: s.id,
  })),
  recording: {
    countIn: 4,
    tailMs: 500,
    end: "manual",
    synchronization: "captured-noise-once",
  },
};
