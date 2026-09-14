import { COMPOSITION as C, TOLERANCES as T } from './composition.js';
import { expectedForStep, pitchesMatch, validateBend } from './validation.js';

export const PRACTICE_TOLERANCES=Object.freeze({onsetBeats:0.35,holdBeats:0.5,releaseGraceBeats:0.9,untimedTimeoutMs:20000,passScore:70});
export function scoreForStep(step) {
  if(step.type==='drums'||(step.type==='record'&&step.looperRole==='percussionLooper'))return C.percussion;
  if(step.type==='strike')return [{role:step.role,type:C.percussion.find(e=>e.role===step.role)?.type}];
  if(step.type==='note')return [step];
  return expectedForStep(step);
}
const percent=(n,d)=>d?Math.round(100*n/d):100;
const accuracy=(error,tolerance)=>Math.max(0,1-Math.max(0,error-tolerance*.35)/(tolerance*1.65));
export function scoreAttempt(step,events,{timed=Boolean(step.timed),reason=''}={}) {
  const expected=scoreForStep(step),kind=['drums','strike'].includes(step.type)||(step.type==='record'&&step.looperRole==='percussionLooper')?'strike':'note';
  const actual=events.filter(e=>e.kind==='note'||e.kind==='strike'),used=new Set(),details=[];
  let correct=0,onsets=0,holds=0,bends=0,bendCount=0;
  for(const target of expected) {
    const candidates=actual.map((event,index)=>({event,index})).filter(({event,index})=>!used.has(index)&&event.kind===kind&&event.role===target.role);
    candidates.sort((a,b)=>Math.abs((a.event.beat||0)-(target.beat||0))-Math.abs((b.event.beat||0)-(target.beat||0)));
    const chosen=candidates[0];
    if(target.bend)bendCount++;
    if(!chosen){details.push({expected:target.role,beat:target.beat,heard:'missing'});continue;}
    const e=chosen.event;used.add(chosen.index);
    const voiced=kind==='strike'?e.withdrawn&&(!target.type||e.percussionType===target.type):
      e.voiced&&e.articulated&&e.released&&e.allReleased!==false&&!e.invalidMembers&&pitchesMatch(e.midis,target.midis||[target.midi])&&(!target.vowel||target.vowel===e.vowel)&&(target.bend||!(e.maxAbsBend>.5));
    correct+=voiced?1:0;
    const onsetError=timed?Math.abs((e.beat??Infinity)-target.beat):0;
    onsets+=accuracy(onsetError,PRACTICE_TOLERANCES.onsetBeats);
    const heldMs=(e.endMs||0)-e.startMs;
    const holdError=kind==='strike'?e.withdrawn?0:Infinity:timed?Math.abs((e.durationBeats??0)-target.beats):Math.max(0,(target.minimumMs||T.minimumNoteMs)-heldMs)/C.beatMs;
    holds+=accuracy(holdError,PRACTICE_TOLERANCES.holdBeats);
    if(target.bend)bends+=validateBend(e,target.bend).ok?1:0;
    details.push({expected:target.role,beat:target.beat,heard:e.role,correct:Boolean(voiced),heardBeat:e.beat,
      expectedHold:timed?target.beats:target.minimumMs,heardHold:timed?e.durationBeats:heldMs,
      onsetErrorBeats:timed?Number(onsetError.toFixed(3)):null,holdErrorBeats:Number(holdError.toFixed(3))});
  }
  const extra=actual.length-used.size,denominator=Math.max(expected.length,1)+extra;
  actual.forEach((event,index)=>{if(!used.has(index))details.push({expected:'rest',heard:event.role,beat:event.beat,extra:true});});
  const components={targets:percent(correct,denominator)};
  if(timed)components.timing=percent(onsets,denominator);
  if(kind==='note')components.holdRelease=percent(holds,denominator);
  if(bendCount)components.bend=percent(bends,bendCount+extra);
  const weights={targets:0.45,timing:0.25,holdRelease:0.2,bend:0.1};
  const weight=Object.keys(components).reduce((n,key)=>n+weights[key],0);
  const score=Math.round(Object.entries(components).reduce((n,[key,value])=>n+value*weights[key],0)/weight);
  const suggestions=[];
  if(correct<expected.length||extra)suggestions.push(`${correct}/${expected.length} correct targets${extra?`, ${extra} extra`:''}. Follow the highlighted target and leave rests clear.`);
  if(timed&&components.timing<85)suggestions.push('Prepare while green shrinks; start when yellow opens.');
  if(kind==='note'&&components.holdRelease<85)suggestions.push('Hold through the expanded yellow ring; let go as it shrinks.');
  if(bendCount&&components.bend<85)suggestions.push('Begin on Eb, glide down smoothly, and settle on C before release.');
  if(reason)suggestions.unshift(reason);
  return {ok:!reason&&score>=PRACTICE_TOLERANCES.passScore&&correct===expected.length&&extra===0&&
    (components.holdRelease===undefined||components.holdRelease>=70)&&(components.timing===undefined||components.timing>=60)&&(components.bend===undefined||components.bend>=70),score,components,details,extra,
    message:suggestions.slice(0,2).join(' ')||'Well played. The notes, timing and releases fit the phrase.'};
}
