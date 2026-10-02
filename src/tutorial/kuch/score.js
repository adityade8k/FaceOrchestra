import { MIDI_REFERENCE as source } from './midiReference.js';

export { BPM, BEAT_MS } from './timing.js';
export const LOOP_BEATS = 16;
export const PERFORMANCE_BEATS = 136;
export const VOICINGS = { D: [50,57,62,66], C: [48,52,55,60,64] };
export const noteName = midi => ['C','C♯','D','E♭','E','F','F♯','G','G♯','A','B♭','B'][midi%12]+(Math.floor(midi/12)-1);
// Shorten the two instrumental interludes from sixteen beats to eight.
export const shortenBeat = beat => beat - (beat >= 80 ? 8 : 0) - (beat >= 136 ? 8 : 0);
const notes = name => source.tracks.find(t=>t.name===name).notes.map(([tick,duration,midi,velocity])=>({beat:tick/source.ppq,beats:duration/source.ppq,midi,velocity}));
export const MELODY = notes('Guitar').map((n,i)=>({...n,id:`lead-${i}`,sourceBeat:n.beat,beat:shortenBeat(n.beat)-24,role:`lead-${n.midi}`}));
export const PITCHES = [...new Set(MELODY.map(n=>n.midi))].sort((a,b)=>a-b);
function chordPhrase(start) {
  const groups=new Map();
  for(const n of notes('Classical Guitar').filter(n=>n.beat>=start&&n.beat<start+16)) {
    if(!groups.has(n.beat))groups.set(n.beat,{beat:n.beat-start,beats:n.beats,velocity:n.velocity,midis:[]});
    groups.get(n.beat).midis.push(n.midi);
  }
  return [...groups.values()].map((n,i)=>({...n,id:`chord-${start}-${i}`,role:n.midis.includes(50)?'D':'C'}));
}
export const CHORDS = { D:chordPhrase(24), change:chordPhrase(40) };
export const DRUMS = notes('Drumset').filter(n=>n.beat>=24&&n.beat<40).map((n,i)=>({
  id:`drum-${i}`,beat:n.beat-24,beats:.2,velocity:n.velocity,sourceDrum:n.midi,
  role:n.midi===36?'percussion':'percussionLooper',sound:n.midi===36?'boink':'hihat',
}));
export const PATTERN_CHANGES = [[0,'D'],[16,'change'],[32,'D'],[64,'change'],[80,'D'],[112,'change'],[128,'D']];
// Phrase boundaries and rests are source data; the extra training bridge is not MIDI.
export const SECTION_VERSION = 2;
export const INTERLUDES = Object.freeze([[40,48],[88,96]].map(Object.freeze));
export const PRACTICE_BREAKS = Object.freeze([
  { after: "melody-1", beats: 8, kind: "practice-only", next: "Part 2" },
  { after: "melody-2", beats: 8, kind: "source", next: "Part 3" },
  { after: "melody-3", beats: 8, kind: "source", next: "Part 4" },
].map(Object.freeze));
export const MELODY_PARTS = [[0,16],[16,40],[48,88],[96,136]].map(([start,end],i)=>({
  id:`melody-${i+1}`,title:`${i+5} · Melody, part ${i+1}`,kind:'melody',sectionVersion:SECTION_VERSION,sourceStart:start,beats:end-start,
  events:MELODY.filter(n=>n.beat>=start&&n.beat<end).map(n=>({...n,beat:n.beat-start})),
  backingChanges:[[0,PATTERN_CHANGES.filter(([beat])=>beat<=start).at(-1)[1]],
    ...PATTERN_CHANGES.filter(([beat])=>beat>start&&beat<end).map(([beat,pattern])=>[beat-start,pattern])],
  instruction:`Learn part ${i+1} of four. Follow the highlighted pitch, squeeze the bottom sphere, hold, then release. Keep your wrist neutral. Demonstrate plays this part; Practice lets you try it with your recorded backing.`,
}));
export const STEPS = [
  {id:'D',title:'1 · D major accompaniment',beats:16,kind:'chords',pattern:'D',events:CHORDS.D,
    instruction:'Squeeze the D cluster together. Each bar attacks on 1, the last sixteenth before 2, and the last sixteenth before 4. Release between attacks. Practice records four bars into D Pattern Looper. Each Looper stores one recording; recording again replaces it.'},
  {id:'change',title:'2 · C major → D major',beats:16,kind:'chords',pattern:'change',events:CHORDS.change,
    instruction:'Follow the C cluster, then return to D in the second bar. This is the alternate four-bar accompaniment. Practice records this in the separate Change Pattern Looper. Both pattern loopers connect to the SAME Metronome output, so only one plays at a time.'},
  {id:'drums',title:'3 · Stick groove',beats:16,kind:'drums',events:DRUMS,
    instruction:'Grip in empty space to equip a stick. Strike the percussion Honk for boink and the percussion looper body for hihat. Pull the stick clear after every hit. Practice records four bars into Percussion Looper on a DIFFERENT Metronome output so it can play alongside either chord pattern.'},
  {id:'switch-patterns',title:'4 · Switch patterns at the boundary',kind:'switch',beats:36,events:[],instruction:'Practice starts D Pattern Looper. Mid-cycle press Play Change and watch QUEUED: it starts when D finishes all 16 beats. Mid-cycle press Play D to switch back. Both recordings remain available. Use these buttons or the Looper Play controls.'},
  ...MELODY_PARTS,
  {id:'performance',title:'9 · All together — Kuch To Hua Hai',kind:'performance',beats:PERFORMANCE_BEATS,events:MELODY,
    instruction:'Play all four melody parts with the backing. Parts 1 and 2 join directly. Rest for eight beats between Parts 2–3 and Parts 3–4. Follow each attack, hold and release. The backing stops after the final phrase.'},
];

// Arrangement-aware assessment remains available through the original score API.
export { assess } from './assessment.js';
