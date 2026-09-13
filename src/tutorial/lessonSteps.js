import { COMPOSITION as C, PITCHES, DESCENDING_BEND, describeNote } from './composition.js';
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
add('looper','spawn','Place a Looper','Select Looper. Aim and Trigger to place it beside the Metronome, with room to reach its nodes and buttons.', { role:'looper', kind:'looper', catalogId:'looper' });
add('clock-wire','clock-wire','Connect the clock','Hold Trigger on a Metronome output, aim at Looper node 6, then release. This node also records Metronome stick taps. The Connect button performs the same connection.', { action:'clock-wire', actionLabel:'Connect clock → node 6' });
add('tempo','tempo','Set 80 BPM and start','Drag the Metronome BPM handle to 80, then press its Play button. Keep the clock steady. Set Looper Gap to zero.', { action:'tempo', actionLabel:'80 BPM · Start clock · Gap 0' });
for (const group of C.backing) {
  add(`spawn-${group.role}`,'spawn',`Place ${group.label}`,`Select the preset ${group.notes}. Place this touching three-Honk group apart from the other groups. Trigger places; Grip cancels.`, { role:group.role, kind:'honk', catalogId:group.catalogId });
  add(`wire-${group.role}`,'wire',`Wire ${group.label}`,`Hold Trigger on Looper node ${group.trackIndex + 1}, aim at the connector of the first Honk in ${group.label}, release. Only that representative is wired; the touching partners join naturally.`, { role:group.role, trackIndex:group.trackIndex, action:`wire-${group.role}`, actionLabel:`Connect ${group.label} → node ${group.trackIndex + 1}` });
}
add('percussion','spawn','Place a percussion Honk','Place this separate C3 target near your stick hand, away from all chord groups.', { role:'percussion',kind:'honk',catalogId:'jog-percussion' });
add('percussion-wire','wire','Wire the percussion Honk','Connect the percussion Honk to spare Looper node 5. Only a directly wired Honk strike records on that track.',{role:'percussion',trackIndex:4,action:'wire-percussion',actionLabel:'Connect percussion → node 5'});
for (const vowel of ['E','O']) add(`audition-${vowel}`,'note',`Audition the ${vowel} vowel`,
  `Choose ${vowel} below (or tap each mouth to cycle vowels). Squeeze Group 1 for at least half a second, then release. Listen for a steady low reed-like sound. Keep your wrist level.`,
  { role:'group-1', midis:C.backing[0].midis, vowel, action:`vowel-${vowel}`,actionLabel:`Choose ${vowel} vowel`, minimumMs:450 });
add('timbre','timbre','Balance the accompaniment','Use O on the backing Honks. Push each nose down for a softer voice, and lower Looper volume. Keep backing bend at zero. The balance button applies those existing controls.',{action:'timbre',actionLabel:'O vowel · Soft backing'});
add('chord','note','Squeeze and release a whole chord','Aim at Group 1’s yellow squeeze sphere. Hold Trigger for half a second, with a level wrist. All three voices must sound, then release together.',{role:'group-1',midis:C.backing[0].midis,minimumMs:450});
add('stick','stick','Equip your other hand','Point your percussion hand into empty space and hold Grip to equip a stick. That hand cannot squeeze while the stick is active. Keep Grip held; release Grip to unequip. Swap hands below if preferred.');
for (const role of ['percussion','metronome','looper']) add(`tap-${role}`,'strike',`Tap the ${role === 'percussion' ? 'percussion Honk' : role}`,
  'Move the stick into the visible body once, then withdraw completely. Honk = boink, Metronome = wood, Looper = hihat. Clock ticks do not count.',{role});
add('chords-rehearse','chords','Rehearse the four groups','Choose Count in, then squeeze Groups 1, 2, 3, 4 on beats 1, 5, 9, 13. Hold each about 3.7 beats, then leave a short breath. No recording yet.',{timed:true,beats:16});
add('drums-rehearse','drums','Rehearse the stick pattern','Choose Count in. Repeat: Honk on 1, Metronome on 3, Looper on 4; then 5/7/8, 9/11/12, 13/15/16. Twelve separate entries and withdrawals.',{timed:true,beats:16});
add('combined','ack','Prepare both hands','One hand squeezes each four-beat chord; the other holds Grip for the stick pattern. Keep the chord wrist level. Next: press Record to arm, choose Count in, then perform one 16-beat take.',{action:'ready',actionLabel:'Ready for the take'});
add('record','record','Record the backing together','Press the Looper Record button to arm. Choose Count in. Perform all four chord holds and twelve taps. After the final chord, release Trigger and withdraw the stick. After the final release, press Stop before the next downbeat.',{timed:true,beats:16,action:'record',actionLabel:'Arm Record'});
add('finalize','finalize','Stop and inspect the take','Press Looper Stop in the short breath after the final chord, before the next downbeat. We check the captured chord gates, voices, actual percussion lanes, and the 16-beat length. A failed take needs a fresh recording.',{action:'stop-record',actionLabel:'Stop recording'});
add('playback','playback','Hear your real loop repeat','Press Looper Play. Release both hands and listen for one whole 16-beat cycle. The recording supplies all sound and motion; Gap stays zero.',{action:'play',actionLabel:'Play recording'});
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
