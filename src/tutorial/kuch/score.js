import { MIDI_REFERENCE as source } from './midiReference.js';

export const BPM = 92;
export const BEAT_MS = 60000 / BPM;
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
export const BANK_CHANGES = [[0,'D'],[16,'change'],[32,'D'],[64,'change'],[80,'D'],[112,'change'],[128,'D']];
export const STEPS = [
  {id:'D',title:'1 · D major accompaniment',beats:16,kind:'chords',bank:'D',events:CHORDS.D,
    instruction:'Squeeze the D cluster together. Each bar attacks on 1, the last sixteenth before 2, and the last sixteenth before 4. Release between attacks. Practice records four bars into the chord looper.'},
  {id:'change',title:'2 · C major → D major',beats:16,kind:'chords',bank:'change',events:CHORDS.change,
    instruction:'Follow the C cluster, then return to D in the second bar. This is the alternate four-bar accompaniment. Practice keeps this take separately and reuses the same chord looper.'},
  {id:'drums',title:'3 · Stick groove',beats:16,kind:'drums',events:DRUMS,
    instruction:'Grip in empty space to equip a stick. Strike the percussion Honk for boink and the percussion looper body for hihat. Pull the stick clear after every hit. Practice records four bars into the second looper.'},
  ...[0,48,96].map((start,i)=>({id:`verse-${i}`,title:`${i+4} · Melody, verse ${i+1}`,kind:'melody',beats:40,
    events:MELODY.filter(n=>n.beat>=start&&n.beat<start+40).map(n=>({...n,beat:n.beat-start})),
    instruction:'Follow the highlighted pitch. Squeeze the bottom sphere, hold for the shown duration, then release. Keep your wrist neutral. The melody stays live; your recorded backing joins when both loops are ready.'})),
  {id:'performance',title:'7 · Perform Kuch To Hua Hai',kind:'performance',beats:PERFORMANCE_BEATS,events:MELODY,
    instruction:'Play all three verses over your two recorded loopers. The two interludes are eight beats each. The chord take changes on the shared beat grid, and both loops stop together after the final phrase.'},
];

// Only observed learner gestures count. Demonstrations never award practice credit.
export function assess(events, heard, anchorMs) {
  const remaining=heard.filter(e=>e.origin==='learner'&&(e.kind==='note'||e.kind==='strike'));
  let correct=0;
  for(const expected of events) {
    const i=remaining.findIndex(e=>e.role===expected.role && Math.abs((e.startMs-anchorMs)/BEAT_MS-expected.beat)<.4 &&
      (e.kind==='strike'?e.withdrawn:e.released&&e.voiced&&!e.invalidMembers&&
        Math.abs((e.endMs-e.startMs)/BEAT_MS-expected.beats)<.45&&
        (expected.midi===undefined||e.midis?.length===1&&Math.abs(e.midis[0]-expected.midi)<.2)&&
        (!expected.midis||expected.midis.length===e.midis?.length&&expected.midis.every(m=>e.midis.some(p=>Math.abs(p-m)<.2)))));
    if(i>=0){correct++;remaining.splice(i,1);}
  }
  return {correct,total:events.length,extra:remaining.length,score:Math.round(100*correct/Math.max(events.length+remaining.length,1))};
}
