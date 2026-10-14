import { finalizeDefinition } from './definition-identity.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { splitPatterns } from '../../src/compositions/BackingPatterns.js';
const SONG_BPM=115,PLAYBACK_BPM=100,PRACTICE_BPM=75;
const root=new URL('../../src/compositions/rishte-naate/',import.meta.url);
const read=async file=>JSON.parse(await readFile(new URL(file,root)));
const original=await read('provenance/imported-arrangement.json'),source=await read('normalized.json'),sequence=source.sequences[0];
const match=await read('screenshot-match.json'),selected=new Set(match.matches.map(m=>m.sourceId));
const notes=sequence.notes, byId=new Map(notes.map(n=>[n.id,n]));
const raw=notes.filter(n=>selected.has(n.id)).map(n=>({id:n.id,sourceIds:[n.id],midi:n.midi,
  startTick:n.startTick,releaseTick:n.releaseTick,velocity:n.velocity,beat:n.startTick/960,beats:(n.releaseTick-n.startTick)/960}));
if(selected.size!==175||raw.length!==175)throw new Error('Screenshot assignments changed');
const pitches=[...new Set(raw.map(n=>n.midi))].sort((a,b)=>raw.filter(n=>n.midi===b).length-raw.filter(n=>n.midi===a).length||a-b);
const slots=[[.08,.43],[.24,.43],[.08,.19],[.24,.19],[.4,.43],[.4,.19],[.08,-.05],[.24,-.05],[.4,-.05],[.56,.43],[.56,.19],[.56,-.05],[.24,.67]];
const slotMaps={R:new Map(pitches.map((p,i)=>[p,i])),L:new Map(pitches.map((p,i)=>[p,i]))};
const position=(hand,midi)=>{const [x,y]=slots[slotMaps[hand].get(midi)];return [hand==='R'?x:-x,y,.2];};
const distance=(hand,a,b)=>Math.hypot(...position(hand,a).map((v,j)=>v-position(hand,b)[j]));
// Dynamic programming over the last note played by each hand. Occupied hands
// cannot be reused. Costs include attack/release time and actual target travel;
// a small left-hand cost retains right-hand preference when either is easy.
function assignHands(){
let states=new Map([['-1,-1',{last:{R:-1,L:-1},cost:0,hands:[]}]]);
for(const [i,n] of raw.entries()){
 const next=new Map();
 for(const state of states.values())for(const hand of ['R','L']){
  const previous=raw[state.last[hand]];
  if(previous&&previous.releaseTick>n.startTick)continue;
  let cost=hand==='L'?.24:0;
  if(previous){
   const attack=(n.beat-previous.beat)*.8,gap=(n.beat-previous.beat-previous.beats)*.8,travel=distance(hand,previous.midi,n.midi);
   cost+=Math.max(0,.5-attack)**2*100+Math.max(0,.08+travel*.4-gap)**2*30+travel*travel/Math.max(attack,.1);
  }
  const last={...state.last,[hand]:i},key=`${last.R},${last.L}`,value={last,cost:state.cost+cost,hands:[...state.hands,hand]};
  if(!next.has(key)||value.cost<next.get(key).cost)next.set(key,value);
 }
 if(!next.size)throw new Error(`More than two simultaneous learner holds at ${n.id}`);
 states=next;
}
return [...states.values()].sort((a,b)=>a.cost-b.cost)[0];
}
let assignment=assignHands();
for(let iteration=0;iteration<4;iteration++){
 for(const hand of ['R','L']){
  const es=raw.filter((e,i)=>assignment.hands[i]===hand);
  const cost=()=>es.reduce((sum,e,i)=>{
    const pos=position(hand,e.midi);sum+=Math.abs(pos[0])*.025;
    if(!i)return sum;
    const prev=es[i-1],gap=(e.beat-prev.beat-prev.beats)*.8;
    return sum+distance(hand,prev.midi,e.midi)**2/Math.max(.02,gap);
  },0);
  for(let sweep=0;sweep<40;sweep++){
   let best=cost(),pair=null;
   for(let i=0;i<pitches.length;i++)for(let j=i+1;j<pitches.length;j++){
    const a=pitches[i],b=pitches[j],sa=slotMaps[hand].get(a),sb=slotMaps[hand].get(b);
    slotMaps[hand].set(a,sb);slotMaps[hand].set(b,sa);const value=cost();
    slotMaps[hand].set(a,sa);slotMaps[hand].set(b,sb);
    if(value<best-1e-8){best=value;pair=[a,b,sa,sb];}
   }
   if(!pair)break;
   const [a,b,sa,sb]=pair;slotMaps[hand].set(a,sb);slotMaps[hand].set(b,sa);
  }
 }
 assignment=assignHands();
}
const events=raw.map((n,i)=>({...n,hand:assignment.hands[i],role:`lead-${assignment.hands[i]}-${n.midi}`}));
const backing=notes.filter(n=>!selected.has(n.id)).map(n=>({id:n.id,sourceIds:[n.id],role:`backing-${n.midi}`,midi:n.midi,
 startTick:n.startTick,releaseTick:n.releaseTick,velocity:n.velocity,beat:n.startTick/960,beats:(n.releaseTick-n.startTick)/960}));
const durationBeats=Math.max(...sequence.events.map(e=>e.tick))/960;
const blocks=splitPatterns(backing,0,durationBeats);
const recipes=[...new Set(events.map(e=>e.role))].map(role=>{const e=events.find(e=>e.role===role);return {kind:'honk',role,midi:e.midi,hand:e.hand,position:position(e.hand,e.midi),scale:.85};});
const backingPitches=[...new Set(backing.map(n=>n.midi))].sort((a,b)=>a-b);
backingPitches.forEach((midi,i)=>recipes.push({kind:'honk',role:`backing-${midi}`,midi,position:[((i%10)-4.5)*.16,-.52-Math.floor(i/10)*.24,-.7],scale:.8}));
recipes.push({kind:'metronome',role:'metronome',position:[-.85,-.6,.05],scale:.65});
// Short excerpts end between held-key clusters, never inside a learner hold.
const lessons=[];let start=0;
while(start<events.length){
 let maximumEnd=events[start].beat+events[start].beats,candidates=[];
 for(let i=start+1;i<events.length;i++){
  if(events[i].beat>=maximumEnd-1e-9&&events[i].beat-events[start].beat>=5.5)candidates.push(i);
  if(events[i].beat-events[start].beat>11&&candidates.length)break;
  maximumEnd=Math.max(maximumEnd,events[i].beat+events[i].beats);
 }
 const next=candidates.length?candidates.sort((a,b)=>Math.abs(events[a].beat-events[start].beat-8)-Math.abs(events[b].beat-events[start].beat-8))[0]:events.length;
 const phrase=events.slice(start,next),startBeat=events[start].beat;
 const endBeat=next<events.length?events[next].beat:Math.min(durationBeats,Math.max(...phrase.map(e=>e.beat+e.beats))+.5);
 const moves=['R','L'].flatMap(hand=>{const es=phrase.filter(e=>e.hand===hand);return es.slice(1).map((e,i)=>({hand,from:es[i].id,to:e.id,attackBeats:e.beat-es[i].beat,
  releaseBeats:e.beat-es[i].beat-es[i].beats,meters:distance(hand,es[i].midi,e.midi)}));});
 const minAttack=Math.min(...moves.map(m=>m.attackBeats));
 const recommendedBpm=Math.max(30,Math.min(PRACTICE_BPM,Math.floor(minAttack*120/5)*5));
 lessons.push({id:`phrase-${lessons.length+1}`,title:`Phrase ${lessons.length+1}`,goal:'Use both hands. R is the main melody hand; L assists. Either hand is accepted.',
  practice:true,demonstration:true,skip:true,completePerformance:false,startBeat,endBeat,eventIds:phrase.map(e=>e.id),recommendedBpm,
  assessment:{pitchCents:25,onsetBeats:.13,durationBeats:.2},moves});
 start=next;
}
lessons.push({...lessons[0],id:'performance',title:'Complete melody',startBeat:0,endBeat:durationBeats,eventIds:events.map(e=>e.id),completePerformance:true,moves:[]});
const definition={schemaVersion:1,id:'rishte-naate',title:'rishte naate.mid',contentVersion:3,bpm:PLAYBACK_BPM,sourceBpm:SONG_BPM,practiceBpm:PRACTICE_BPM,liveRole:'melody',playback:'honk-looper-two-hand-v1',
 source:source.source,maxBpm:115,normalizedSource:{...original.normalizedSource,file:'normalized.json'},score:{events,durationBeats,sourceTempo:sequence.tempo,sourceMeter:sequence.meter},
 arrangement:{id:'screenshot-two-hand',title:'Screenshot melody with two-hand guidance',version:3,recipes:recipes.filter(r=>r.kind!=='looper'),blocks,backing,fixedBacking:{terminalGapBeats:1,outputGroups:['foundation','figures'],volume:-.35,placement:[-1.6,.55,-1.7]},
  provenance:`${source.source.sha256}; 175 explicit screenshot-matched learner notes; every other source note is backing`,
  screenshot:{file:'melody-reference.png',sha256:createHash('sha256').update(await readFile(new URL('melody-reference.png',root))).digest('hex'),matchesFile:'screenshot-match.json',
    displayOctaveOffset:-1,firstVisibleSourceSeconds:byId.get(match.matches[0].sourceId).startSeconds,maxHorizontalErrorPixels:Math.max(...match.matches.map(m=>Math.abs(m.xResidual))),
    uncertainties:['No ambiguous visible note matches. The cropped opening does not identify a learner part before 2.509 seconds; all unshown notes are backing. Short drawn rectangles have minimum display width; all durations come from MIDI key releases.']},
  decisions:['No melody deletion, merging, quantization or transposition. All 296 original key attacks and releases remain on their MIDI beat grid.',
   'Physical key duration controls normal Honk articulation; pedal extensions and MIDI velocities remain source provenance, not custom sound overrides.',
   'Hand suggestions optimize occupancy, attack spacing and target travel with right-hand preference. Assessment accepts either hand and either same-pitch copy.',
   'Backing windows end only where no backing key is held. Independent Metronome ports permit silent lanes without invented notes. Practice excerpts may begin with an already-held backing note and cut backing at the excerpt boundary.'],
  sourceDecisions:notes.map(n=>({sourceId:n.id,part:selected.has(n.id)?'learner':'backing',target:selected.has(n.id)?events.find(e=>e.id===n.id).role:`backing-${n.midi}`,
    reason:selected.has(n.id)?'Explicit screenshot rectangle matched by pitch and global time position':'Not present among the screenshot-selected notes'}))},lessons,
 recording:{countIn:4,tailMs:500,end:'manual',synchronization:'captured-noise-once'},requirements:{maxHonks:recipes.filter(r=>r.kind==='honk').length,maxLoopers:22,maxLiveVoices:2}};
await finalizeDefinition(definition, root);
const metrics={learnerNotes:events.length,backingNotes:backing.length,sourceNotes:notes.length,durationBeats,songBpm:SONG_BPM,playbackBpm:PLAYBACK_BPM,practiceBpm:PRACTICE_BPM,durationSecondsAtPlaybackTempo:durationBeats*60/PLAYBACK_BPM,durationSecondsAt115:durationBeats*60/SONG_BPM,durationSecondsAt75:durationBeats*.8,
 phraseCount:lessons.length-1,blocks:blocks.map(b=>({beat:b.beat,beats:b.beats,notes:b.patterns.map(p=>p.events.length)})),hands:{},duplicatePitches:pitches.filter(p=>events.some(e=>e.midi===p&&e.hand==='R')&&events.some(e=>e.midi===p&&e.hand==='L'))};
for(const hand of ['R','L']){
 const es=events.filter(e=>e.hand===hand),moves=es.slice(1).map((e,i)=>({from:es[i].id,to:e.id,attackMsAt75:(e.beat-es[i].beat)*800,
 releaseMsAt75:(e.beat-es[i].beat-es[i].beats)*800,meters:distance(hand,es[i].midi,e.midi)}));
 metrics.hands[hand]={notes:es.length,targets:new Set(es.map(e=>e.role)).size,minimumAttackMsAt75:Math.min(...moves.map(m=>m.attackMsAt75)),minimumReleaseMsAt75:Math.min(...moves.map(m=>m.releaseMsAt75)),maximumTravelMeters:Math.max(...moves.map(m=>m.meters)),
 difficultTransitions:moves.filter(m=>m.attackMsAt75<500||m.releaseMsAt75<80+m.meters*400)};
}
metrics.phrases=lessons.slice(0,-1).map(l=>({id:l.id,notes:l.eventIds.length,beats:l.endBeat-l.startBeat,recommendedBpm:l.recommendedBpm}));
for(const [file,data]of [['composition.json',definition]])await writeFile(new URL(file,root),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify(metrics,null,2));
