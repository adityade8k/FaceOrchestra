import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../../src/compositions/rishte-naate/", import.meta.url);
const original = JSON.parse(await readFile(new URL("composition.json", root)));
const source = JSON.parse(await readFile(new URL(original.normalizedSource.file, root)));
const notes = source.sequences[0].notes;
const byId = new Map(notes.map(n => [Number(n.id.slice(4)), n]));
const oldRoles = new Map(original.score.events.map(n => [n.id, n.part]));
const id = n => `t0-e${n}`;

// Reviewed musical reduction, not alternate-note deletion or a register split.
// Each row follows a bass/harmony change. Melody cells are:
// [source attack, authored beat, hold, repeated attacks absorbed into that hold].
// Recurring B-C#-D# / A#-B-C# figures recur with the same simplified rhythm;
// high descending runs, chord-tone arpeggios and quick neighbours stay in backing.
const plan = [
  [5, 8, "Opening rise and return", [[6,0,.7],[11,1,.65],[14,2,1.2,[16]],[19,3.5,.6],[22,4.5,1.1],[25,6,.65],[27,7,.65]]],
  [29,8,"Answer and anticipatory E", [[32,0,.7],[40,1,.65],[44,2,1.2,[47]],[51,4,2.2],[53,7,.65]]],
  [54,8,"Repeated E and descending answer", [[64,1,1.2,[68]],[71,3,1.2,[73]],[75,5,.65],[79,6,.65],[81,7,.65]]],
  [83,8,"Cadence with piano run", [[83,0,.7],[89,1,1.1],[95,2.5,.65],[96,3.5,.65],[99,4.5,.65]]],
  [115,8,"Opening figure returns", [[115,0,.7],[123,1,.65],[126,2,1.2,[131]],[132,3.5,.6],[135,4.5,1.1],[137,6,.65],[139,7,.65]]],
  [141,8,"Answer returns", [[142,0,.7],[152,1,.65],[156,2,1.2,[159]],[163,4,2.2],[165,7,.65]]],
  [166,8,"Repeated E returns", [[176,1,1.2,[180]],[183,3,1.2,[185]],[187,5,.65],[191,6,.65],[193,7,.65]]],
  [195,8,"Cadence and connecting figure", [[196,0,.7],[206,1,1.1],[211,2.5,.65],[212,3.5,.65],[214,4.5,.65]]],
  [227,8,"Repeated B, then C#", [[227,0,1.2,[235]],[237,2,1.2,[241]],[243,4,1.2,[245]],[247,6,.65],[249,7,.65]]],
  [251,8,"A# answer", [[252,0,1.2,[262]],[267,2.5,.9],[271,4,2.2],[273,7,.65]]],
  [277,8,"Rising G#-C-D#-G#", [[278,0,1],[286,2,1.2,[288]],[291,4,1.2,[294]],[299,6,1.2,[305]]]],
  [311,8,"E and F# response", [[312,0,2.2,[322,327]],[329,3,.65],[333,4,2.2],[335,7,.65]]],
  [341,8,"C# phrase with upper arrival", [[342,0,1.2,[350]],[354,2,.65],[357,3,.65],[361,4,1.2,[363]],[365,6,.65],[367,7,.65]]],
  [371,8,"F# turn and descent", [[372,0,1.2,[379]],[385,2.5,.9,[389]],[391,4,1.2],[395,6,.65],[397,7,.65]]],
  [403,4,"D# repeated figure", [[404,0,1.2,[411]],[417,2,.65],[421,3,.65]]],
  [427,4,"C# to D# and E", [[427,0,1.4,[436]],[443,2,.65],[445,3,.65]]],
  [449,8,"Long D# and B landing", [[449,0,2.2],[463,3,.65],[467,4,1.4],[469,7,.65]]],
  [475,4,"D# and E answer", [[476,0,1.2,[484]],[489,2,.65],[495,3,.65]]],
  [501,4,"C# return", [[502,0,1.4,[510]],[517,2.5,.5],[519,3.25,.5]]],
  [523,8,"B landing and piano fill", [[524,0,1.5],[547,7,.65]]],
  [553,4,"Repeated D# returns", [[554,0,1.2,[562]],[567,2,.65],[571,3,.65]]],
  [577,4,"C# response returns", [[578,0,1.4,[586]],[593,2,.65],[595,3,.65]]],
  [599,8,"Long D# and B return", [[601,0,2.2],[613,3,.65],[617,4,1.4],[619,7,.65]]],
  [625,4,"D# and E return", [[627,0,1.2,[634]],[639,2,.65],[644,3,.65]]],
  [651,4,"Final C# response", [[653,0,1.4,[660]],[665,2.5,.5],[669,3.25,.5]]],
  [675,8,"B ending with piano arpeggio", [[676,0,2]]],
];
const consumed = new Map(), events = [], blocks = [];
let cursor = 0;
for (const [i, [sourceStart, beats, title, melody]] of plan.entries()) {
  const startSeconds = byId.get(sourceStart).startSeconds;
  const endSeconds = i + 1 < plan.length ? byId.get(plan[i+1][0]).startSeconds : source.sequences[0].durationSeconds;
  const block = { id: `block-${i+1}`, title, beat: cursor, beats, sourceStartSeconds: startSeconds, sourceEndSeconds: endSeconds, patterns: [] };
  for (const [sourceId, beat, hold, combined = []] of melody) {
    const n = byId.get(sourceId);
    const event = { id: `live-${sourceId}`, role: `lead-${n.midi}`, midi: n.midi, beat: cursor + beat, beats: hold,
      sourceIds: [sourceId, ...combined].map(id), decision: combined.length ? "combine repeated attacks into a singable hold" : "retain melodic anchor" };
    events.push(event);
    for (const value of [sourceId,...combined]) {
      if (consumed.has(id(value))) throw new Error(`Repeated melody assignment ${value}`);
      consumed.set(id(value), { disposition: value===sourceId ? "retained" : "combined", target: event.id, reason: event.decision });
    }
  }
  blocks.push(block);
  cursor += beats;
}

for (const block of blocks) {
  const relevant = notes.filter(n => n.startSeconds >= block.sourceStartSeconds && n.startSeconds < block.sourceEndSeconds && !consumed.has(n.id));
  for (const lane of ["foundation", "figures"]) {
    const selected = relevant.filter(n => (oldRoles.get(n.id) === "melody" ? "figures" : "foundation") === lane);
    const pattern = { lane, beats: block.beats, events: selected.map(n=>{
      const scale = block.beats / (block.sourceEndSeconds - block.sourceStartSeconds);
      const beat = Math.min(block.beats-.25, Math.max(0, Math.round((n.startSeconds-block.sourceStartSeconds)*scale*4)/4));
      const duration = Math.min(2.2, Math.max(.15, (n.releaseSeconds-n.startSeconds)*scale), block.beats-beat-.1);
      return { id: `backing-${n.id}`, sourceIds: [n.id], role: `backing-${n.midi}`, midi: n.midi, beat, beats: duration };
    }) };
    // Simultaneous equal-pitch attacks share a trigger; overlaps close before
    // the next attack. No pedal data is translated into an artificial hold.
    for (let i=0;i<pattern.events.length;i++) {
      const e=pattern.events[i];
      const next=pattern.events.slice(i+1).find(n=>n.midi===e.midi);
      if(next && next.beat===e.beat) {
        next.sourceIds.unshift(...e.sourceIds); e.merged=true;
      } else if(next) e.beats=Math.min(e.beats, next.beat-e.beat-.05);
    }
    pattern.events=pattern.events.filter(e=>!e.merged);
    if(new Set(pattern.events.map(e=>e.role)).size>7) throw new Error(`${block.id}/${lane} exceeds seven Honk sockets`);
    for(const e of pattern.events) for(const sourceId of e.sourceIds) consumed.set(sourceId, {
      disposition: "transferred", target: `${block.id}/${lane}/${e.id}`,
      reason: lane==="foundation" ? "bass or inner chord/arpeggio voice" : "piano run, neighbour, connecting figure or closing arpeggio; not a required sung attack",
    });
    block.patterns.push(pattern);
  }
  // Keep both transport lanes populated without inventing a sound: when there
  // is no piano fill, the upper-support Looper takes the last inner-voice note.
  // This permits the existing two port groups to hand off on every boundary.
  if (!block.patterns[1].events.length) {
    const event = block.patterns[0].events.pop();
    block.patterns[1].events.push(event);
    for (const sourceId of event.sourceIds) consumed.get(sourceId).target = `${block.id}/figures/${event.id}`;
  }
}
if(consumed.size!==notes.length) throw new Error(`Unassigned source notes: ${notes.filter(n=>!consumed.has(n.id)).map(n=>n.id)}`);
const pitches=[...new Set(events.map(e=>e.midi))].sort((a,b)=>a-b);
const recipes=pitches.map((midi,i)=>{
  const angle=(i-(pitches.length-1)/2)*.16;
  return { kind:"honk", role:`lead-${midi}`, midi, position:[.72*Math.sin(angle), .45+.025*Math.cos(angle), .12-.72*(1-Math.cos(angle))], scale:1 };
});
const backingPitches=[...new Set(blocks.flatMap(b=>b.patterns.flatMap(p=>p.events.map(e=>e.midi))))].sort((a,b)=>a-b);
backingPitches.forEach((midi,i)=>recipes.push({kind:"honk",role:`backing-${midi}`,midi,
  position:[((i%11)-5)*.15,-.15-Math.floor(i/11)*.27,-.65],scale:.85}));
for(const [i,lane] of ["foundation","figures"].entries()) for(let bank=0;bank<2;bank++)
  recipes.push({kind:"looper",role:`${lane}-${bank}`,position:[-.65+i*.85+bank*.3,-.72,.15],scale:.55});
recipes.push({kind:"metronome",role:"metronome",position:[-1.05,-.35,.05],scale:.65});
const lessons=Array.from({length:cursor/8},(_,i)=>({
  id:`phrase-${i+1}`,title:`Phrase ${i+1}`,goal:"Play the melody arc. Green prepares the next target; yellow shows the hold. Release before moving.",
  practice:true,demonstration:true,skip:true,completePerformance:false,startBeat:i*8,endBeat:(i+1)*8,
  eventIds:events.filter(e=>e.beat>=i*8&&e.beat<(i+1)*8).map(e=>e.id),
  assessment:{pitchCents:25,onsetBeats:.22,durationBeats:.28},
}));
lessons.push({...lessons[0],id:"performance",title:"Complete melody",startBeat:0,endBeat:cursor,eventIds:events.map(e=>e.id),completePerformance:true});
const definition={schemaVersion:1,id:"rishte-naate",title:"rishte naate.mid",contentVersion:2,bpm:75,liveRole:"melody",
  playback:"honk-looper-human-v1",source:source.source,normalizedSource:original.normalizedSource,
  score:{events,durationBeats:cursor,sourceTempo:source.sequences[0].tempo,sourceMeter:source.sequences[0].meter},
  arrangement:{id:"human-melody",title:"Human melody with Looper accompaniment",version:2,recipes,blocks,
    provenance:`${source.source.sha256}; authored interpretation of the sung line within the mixed piano track; no lyrics supplied`,
    decisions:[
      "Recurring contour and cadential arrivals determine the learner part. Upper piano runs, short neighbours, arpeggios and inner voices are accompaniment.",
      "An authored 4/4 teaching grid follows harmonic changes: two-bar patterns, with one-bar changes paired into two-bar lessons. This deliberately regularizes the performed timing; the MIDI header alone does not label these phrases.",
      "Repeated vocal anchors are combined deliberately; short passing figures stay in the Loopers. Every source note has a disposition and source IDs.",
      "No octave transposition. All Honks retain their spawned sound and controls; no automatic vowels, nose levels, MIDI gain envelopes or pedal-length gates.",
      "Backing uses ordinary trigger gates from physical key holds, bounded by pattern ends. MIDI velocity remains provenance rather than overriding normal trigger strength.",
      "75 BPM initial tempo; the minimum .75-beat live attack interval is 600 ms. Above 90 BPM those optional advanced-tempo transitions become shorter than 500 ms.",
    ],sourceDecisions:notes.map(n=>({sourceId:n.id,...consumed.get(n.id)}))},lessons,
  recording:{countIn:4,tailMs:500,end:"manual",synchronization:"captured-noise-once"},
  requirements:{maxHonks:pitches.length+backingPitches.length,maxLoopers:4,maxLiveVoices:1},
};
definition.contentHash=createHash("sha256").update(JSON.stringify(definition)).digest("hex");
await writeFile(new URL("human-composition.json",root),JSON.stringify(definition,null,2)+"\n");
const positions=new Map(recipes.map(r=>[r.role,r.position]));
const old=original.score.events.filter(e=>e.part==="melody");
const oldPositions=new Map(original.arrangement.recipes.map(r=>[r.role,r.position]));
const oldMoves=old.slice(1).map((e,i)=>({from:old[i].id,to:e.id,milliseconds:(e.startSeconds-old[i].startSeconds)*1000,
  meters:Math.hypot(...oldPositions.get(e.role).map((v,j)=>v-oldPositions.get(old[i].role)[j]))}));
const transitions=events.slice(1).map((e,i)=>({gap:e.beat-events[i].beat,releaseGap:e.beat-events[i].beat-events[i].beats,
  distance:Math.hypot(...positions.get(e.role).map((v,j)=>v-positions.get(events[i].role)[j]))}));
const metrics={baseline:{commit:"fee629663085e8f9c4b245c35963c0e73c4070af",liveNotes:old.length,
  attacksBelow300ms:old.slice(1).filter((e,i)=>e.startSeconds-old[i].startSeconds<.3).length,
  overlappingHolds:old.slice(1).filter((e,i)=>e.startSeconds<old[i].releaseSeconds).length,
  targets:new Set(old.map(e=>e.role)).size,
  widthMeters:Math.max(...old.map(e=>oldPositions.get(e.role)[0]))-Math.min(...old.map(e=>oldPositions.get(e.role)[0])),
  fastestTransition:oldMoves.reduce((a,b)=>a.milliseconds<b.milliseconds?a:b),maximumTravelMeters:Math.max(...oldMoves.map(e=>e.meters)),
  firstPhraseNotes:original.lessons[0].eventIds.length,firstPhraseSeconds:original.lessons[0].endSeconds},
  revised:{liveNotes:events.length,targets:pitches.length,widthMeters:Math.max(...recipes.slice(0,pitches.length).map(r=>r.position[0]))-Math.min(...recipes.slice(0,pitches.length).map(r=>r.position[0])),
    minimumAttackMsAt75:Math.min(...transitions.map(t=>t.gap))*800,minimumReleaseGapMsAt75:Math.min(...transitions.map(t=>t.releaseGap))*800,
    overlappingHolds:transitions.filter(t=>t.releaseGap<0).length,maximumTravelMeters:Math.max(...transitions.map(t=>t.distance)),
    firstPhraseNotes:lessons[0].eventIds.length,phraseSecondsAt75:6.4,phraseCount:lessons.length-1,
    maximumPhraseNotes:Math.max(...lessons.slice(0,-1).map(l=>l.eventIds.length)),maximumPhraseTargets:Math.max(...lessons.slice(0,-1).map(l=>new Set(events.filter(e=>l.eventIds.includes(e.id)).map(e=>e.midi)).size)),
    durationBeats:cursor,durationSecondsAt75:cursor*.8,
    sourceDispositions:Object.fromEntries(["retained","combined","transferred"].map(k=>[k,[...consumed.values()].filter(d=>d.disposition===k).length]))}};
await writeFile(new URL("human-metrics.json",root),JSON.stringify(metrics,null,2)+"\n");
console.log(JSON.stringify(metrics,null,2));
