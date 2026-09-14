import { COMPOSITION as C, PITCHES, DESCENDING_BEND, TUTORIAL_LOOPERS } from './composition.js';
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
for (const [index,l] of TUTORIAL_LOOPERS.entries()) add(l.role,'spawn',`Place ${l.label}`,`Radial menu → Instruments → Looper. The ${index?'second':'first'} placed Looper becomes ${l.label}. Leave room for its cables and buttons.`, {role:l.role,kind:'looper',catalogId:'looper'});
for (const l of TUTORIAL_LOOPERS) add(`clock-${l.role}`,'clock-wire',`Connect ${l.label}`,`Give ${l.label} the shared pulse. Use any free Metronome output and compatible Looper socket; each Looper needs its own output.`,{looperRole:l.role,action:`clock-${l.role}`,actionLabel:`Connect ${l.label}`});
add('tempo','tempo','Set 80 BPM and start','Set the Metronome to 80 BPM and press Play. Set both Looper Gap controls to zero. Keep the click audible for this lesson.',{action:'tempo',actionLabel:'80 BPM · Start · Both Gap 0'});
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
add('record-chords','record','Record chords alone','Practice arms the chord take and counts you in. Groups 1–4 enter on 1, 5, 9, 13; hold 3.7 beats each. Keep the short breaths clear.',{looperRole:'chordLooper',timed:true,beats:16,action:'record-chordLooper',actionLabel:'Record Chords'});
add('finalize-chords','finalize','Inspect the chord take','Listen for four steady chords across 16 beats. Practice checks the completed take and its releases.',{looperRole:'chordLooper',action:'stop-record-chordLooper',actionLabel:'Finish chord take'});
add('playback-chords','playback','Listen to Chord Looper alone','Play restarts the recording origin on the next beat. An intentional first-note offset remains. Release both hands and listen for a complete cycle.',{looperRole:'chordLooper',action:'play-chordLooper',actionLabel:'Play Chords'});
add('percussion','spawn','Place a percussion Honk','Radial menu → Instruments → Honk. Any pitch works for a stick tap. Place it near your stick hand, away from chord groups and melody notes.', { role:'percussion',kind:'honk',catalogId:'honk' });
add('percussion-wire','wire','Wire the percussion Honk','Connect the percussion Honk to a free Percussion Looper socket, separate from its clock socket.',{role:'percussion',looperRole:'percussionLooper',action:'wire-percussion',actionLabel:'Connect percussion'});
add('stick','stick','Equip your stick hand','Ready the stick for three colours: Honk boink, Metronome wood, and Looper hihat.');
for (const [role,label] of [['percussion','percussion Honk'],['metronome','Metronome'],['percussionLooper','Percussion Looper']]) add(`tap-${role}`,'strike',`Tap the ${label}`,
  `Tap the ${label} once, then withdraw completely. Leave room for the sound to finish.`,{role});
add('drums-rehearse','drums','Rehearse the stick pattern','Repeat four times: Honk on 1, wood on 3, hihat on 4. Twelve clean strikes across 16 beats. Practice counts you in.',{timed:true,beats:16});
add('record-percussion','record','Record percussion alone','Practice arms Percussion Looper and counts you in. Repeat Honk / rest / wood / hihat four times. Withdraw after every strike.',{looperRole:'percussionLooper',timed:true,beats:16,action:'record-percussionLooper',actionLabel:'Record Percussion'});
add('finalize-percussion','finalize','Inspect the percussion take','Twelve clear taps across the 16-beat score. The loop ends with the final sound. Practice checks the completed percussion take.',{looperRole:'percussionLooper',action:'stop-record-percussionLooper',actionLabel:'Finish percussion take'});
add('playback-percussion','playback','Listen to Percussion Looper alone','Play Percussion stops the chord playback for this check. Listen for one full cycle of all three percussion sounds.',{looperRole:'percussionLooper',action:'play-percussionLooper',actionLabel:'Play Percussion'});
add('start-all','start-all','Start both parts together','Practice restarts both recorded parts on one shared next beat. Separate Play presses can start different points in the phrase. If either take is missing, choose Next Step.',{action:'start-all',actionLabel:'Start All'});
add('unequip','unequip','Put away the stick','Release Grip to unequip the stick before melody practice. Both hands can now squeeze again.');
add('melody','spawn','Place the seven melody Honks','Radial menu → Scales → Jog Study. Keep C4, Eb4, E4, F4, G4, Bb4, C5 separate from each other and the backing. Point and press right B to lock or unlock any Honk during Practice.',{role:'melody',kind:'honk',catalogId:'jog-melody'});
for (const [pitch,p] of Object.entries(PITCHES)) add(`learn-${pitch}`,'note',`${p.syllable} — ${pitch} · ${p.name}`,
  `Play ${pitch} at the yellow ring. Hold at least half a second, then release. Take your time.`,{role:`melody-${pitch}`,midis:[p.midi],minimumMs:450});
add('learn-bend','note','One voice: g → S','Squeeze Eb4. Hold level briefly, roll your wrist downward to lower the pitch three semitones, and settle on C before release. Keep one continuously held voice. Take about 2¼ seconds.',{role:'melody-Eb4',midis:[63],minimumMs:1500,bend:DESCENDING_BEND});
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
