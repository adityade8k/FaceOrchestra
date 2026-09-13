import { COMPOSITION as C, PITCHES, DESCENDING_BEND, describeNote, TUTORIAL_LOOPERS } from './composition.js';
const steps = [];
function add(id, type, title, instruction, options = {}) {
  steps.push(Object.freeze({ id, type, title, instruction, prerequisites: steps.length ? [steps.at(-1).id] : [],
    entry: 'Previous checkpoint validated; fresh evidence after entry.',
    evidenceSources: ['learner', 'simulation'], retry: 'Release gestures, discard this attempt, retain valid setup.',
    cleanup: 'Release owned gestures and temporary targets on retry or exit.', ...options }));
}
add('intro','ack','An original Jog-inspired study',
  'Sa = C. Both Ga variants: G = E, g = Eb. We use komal Ni = Bb. Learn a supporting loop, then a melody with descending g → S glides. This is an original study. Choose Begin.', { action: 'begin', actionLabel: 'Begin' });
add('metronome','spawn','Place a Metronome','Select Metronome below (or A → Instruments). Aim the preview outside the melody row; Trigger places, Grip cancels. The clock will anchor our 16 beats.', { role:'metronome', kind:'metronome', catalogId:'metronome' });
for (const l of TUTORIAL_LOOPERS) add(l.role,'spawn',`Place ${l.label}`,`Select ${l.label}. Place it beside the other instruments with room for its cables and buttons.`, {role:l.role,kind:'looper',catalogId:l.catalogId});
for (const l of TUTORIAL_LOOPERS) add(`clock-${l.role}`,'clock-wire',`Connect ${l.label}`,`Connect Metronome ${l.portId === 'port-0' ? 'output 1' : 'output 2'} to ${l.label} node 6. Use a separate output for each looper.`,{looperRole:l.role,action:`clock-${l.role}`,actionLabel:`Connect ${l.label}`});
add('tempo','tempo','Set 80 BPM and start','Set the Metronome to 80 BPM and press Play. Set both Looper Gap controls to zero. Keep the click audible for this lesson.',{action:'tempo',actionLabel:'80 BPM · Start · Both Gap 0'});
for (const group of C.backing) {
  add(`spawn-${group.role}`,'spawn',`Place ${group.label}`,`Select the preset ${group.notes}. Place this touching three-Honk group apart from the other groups. Trigger places; Grip cancels.`, { role:group.role, kind:'honk', catalogId:group.catalogId });
  add(`wire-${group.role}`,'wire',`Wire ${group.label}`,`Hold Trigger on Chord Looper node ${group.trackIndex + 1}, aim at the connector of the first Honk in ${group.label}, release. Only that representative is wired; the touching partners join naturally.`, { role:group.role, trackIndex:group.trackIndex, action:`wire-${group.role}`, actionLabel:`Connect ${group.label} → node ${group.trackIndex + 1}` });
}
for (const vowel of ['E','O']) add(`audition-${vowel}`,'note',`Audition the ${vowel} vowel`,
  `Choose ${vowel} below (or tap each mouth to cycle vowels). Squeeze Group 1 for at least half a second, then release. Listen for a steady low reed-like sound. Keep your wrist level.`,
  { role:'group-1', midis:C.backing[0].midis, vowel, action:`vowel-${vowel}`,actionLabel:`Choose ${vowel} vowel`, minimumMs:450 });
add('timbre','timbre','Balance the accompaniment','Use O on the backing Honks. Push each nose down for a softer voice, and lower Looper volume. Keep backing bend at zero. The balance button applies those existing controls.',{action:'timbre',actionLabel:'O vowel · Soft backing'});
add('chord','note','Squeeze and release a whole chord','Aim at Group 1’s yellow squeeze sphere. Hold Trigger for half a second, with a level wrist. All three voices must sound, then release together.',{role:'group-1',midis:C.backing[0].midis,minimumMs:450});
add('chords-rehearse','chords','Rehearse the four groups','Count in, then squeeze Groups 1, 2, 3, 4 on beats 1, 5, 9, 13. Hold each about 3.7 beats, then leave a short breath.',{timed:true,beats:16});
add('record-chords','record','Record chords alone','Arm Chord Looper, then Count in. Squeeze the four groups on beats 1, 5, 9, 13. Release each after about 3.7 beats. No stick taps during this take.',{looperRole:'chordLooper',timed:true,beats:16,action:'record-chordLooper',actionLabel:'Record Chords'});
add('finalize-chords','finalize','Inspect the chord take','Press Chord Looper Stop after the final release. We check four real chord gates, no percussion, 16 beats and Gap 0.',{looperRole:'chordLooper',action:'stop-record-chordLooper',actionLabel:'Stop chord recording'});
add('playback-chords','playback','Listen to Chord Looper alone','Play restarts the recording origin on the next beat. An intentional first-note offset remains. Release both hands and listen for a complete cycle.',{looperRole:'chordLooper',action:'play-chordLooper',actionLabel:'Play Chords'});
add('percussion','spawn','Place a percussion Honk','Place this separate C3 target near your stick hand, away from all chord groups.', { role:'percussion',kind:'honk',catalogId:'jog-percussion' });
add('percussion-wire','wire','Wire the percussion Honk','Connect the percussion Honk to Percussion Looper node 5. Only a directly wired Honk strike records on that track.',{role:'percussion',looperRole:'percussionLooper',trackIndex:4,action:'wire-percussion',actionLabel:'Connect percussion → node 5'});
add('stick','stick','Equip your stick hand','Point into empty space and hold Grip to equip a stick. Keep Grip held through each strike; release Grip to put it away.');
for (const [role,label] of [['percussion','percussion Honk'],['metronome','Metronome'],['percussionLooper','Percussion Looper']]) add(`tap-${role}`,'strike',`Tap the ${label}`,
  'Move the stick into the visible body once, then withdraw completely. Honk = boink, Metronome = wood, Percussion Looper = hihat. Automatic clock clicks do not count.',{role});
add('drums-rehearse','drums','Rehearse the stick pattern','Count in. Repeat: Honk on 1, Metronome on 3, Percussion Looper on 4; then 5/7/8, 9/11/12, 13/15/16. Twelve separate strikes and withdrawals.',{timed:true,beats:16});
add('record-percussion','record','Record percussion alone','Arm only Percussion Looper. Count in aligns to the playing chord phrase. Tap Honk on 1/5/9/13, Metronome on 3/7/11/15, this looper on 4/8/12/16. The chord take stays intact.',{looperRole:'percussionLooper',timed:true,beats:16,action:'record-percussionLooper',actionLabel:'Record Percussion'});
add('finalize-percussion','finalize','Inspect the percussion take','Press Percussion Looper Stop after withdrawing the last strike. We check twelve recorded collisions, no chord gates, 16 beats and the unchanged chord take. Retry replaces only percussion.',{looperRole:'percussionLooper',action:'stop-record-percussionLooper',actionLabel:'Stop percussion recording'});
add('playback-percussion','playback','Listen to Percussion Looper alone','Play Percussion stops the chord playback for this check. Listen for one full cycle of all three percussion sounds.',{looperRole:'percussionLooper',action:'play-percussionLooper',actionLabel:'Play Percussion'});
add('start-all','start-all','Start both parts together','Separate Play presses share tempo but can start different points in the phrase. Start All restarts both recording origins on one shared next beat. Existing playback continues until that beat.',{action:'start-all',actionLabel:'Start All'});
add('unequip','unequip','Put away the stick','Release Grip to unequip the stick before melody practice. Both hands can now squeeze again.');
add('melody','spawn','Place the seven melody Honks','Select the melody row and place it apart from the backing. Each Honk must be independent: C4, Eb4, E4, F4, G4, Bb4, C5. These include both Ga variants and upper Sa.',{role:'melody',kind:'honk',catalogId:'jog-melody'});
for (const [pitch,p] of Object.entries(PITCHES)) add(`learn-${pitch}`,'note',`${p.syllable} — ${pitch} · ${p.name}`,
  `Aim at the labelled ${pitch} squeeze sphere, hold Trigger at least half a second, then release. Take your time; there is no beat deadline.`,{role:`melody-${pitch}`,midis:[p.midi],minimumMs:450});
add('learn-bend','note','One voice: g → S','Squeeze Eb4. Hold level briefly, roll your wrist downward to lower the pitch three semitones, and settle on C before release. Keep one continuously held voice. Take about 2¼ seconds.',{role:'melody-Eb4',midis:[63],minimumMs:1500,bend:DESCENDING_BEND});
for (const phrase of Object.keys(C.phrases)) add(`phrase-${phrase}`,'phrase',`Practice phrase ${phrase}`,
  `Choose Count in to start on a backing boundary. ${C.phrases[phrase].map(describeNote).join(' · ')}`,
  {phrase,timed:true,beats:16});
add('performance','performance','Perform the whole study','Choose Count in. Play A, B, A, C, B, D without stopping. An error keeps the clock running; Retry starts at a backing boundary. The last beat is silence.',{timed:true,beats:96});
export const LESSON_STEPS = Object.freeze(steps);

// Simulation presents a complete performance, while Practice includes untimed
// note learning and separate rehearsals. Both routes use the exact same steps,
// predicates and score; no omitted drill receives a checkpoint or learner credit.
const simulationRoute = steps.filter(step =>
  !['chords-rehearse', 'drums-rehearse'].includes(step.id) &&
  !step.id.startsWith('learn-') && !step.id.startsWith('phrase-'));
export const SIMULATION_STEPS = Object.freeze(simulationRoute.map((step,index) =>
  Object.freeze({...step, prerequisites:index ? [simulationRoute[index-1].id] : []})));
