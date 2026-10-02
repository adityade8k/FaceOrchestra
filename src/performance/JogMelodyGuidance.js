import { COMPOSITION as C, describeNote, performanceEvents } from '../tutorial/composition.js';
import { bendCueState } from '../tutorial/bendCueState.js';

const EVENTS=performanceEvents();
const STEP=Object.freeze({type:'performance',timed:true,beats:C.order.length*C.loopBeats});
export const MELODY_HELP='Green shrinks: prepare. When yellow opens, squeeze Trigger on the highlighted Honk. Hold while yellow stays open; release as it shrinks. Orange guides your wrist roll.';

// A read-only score view for the tutorial's existing rings, without a lesson,
// assessment or conductor. Its only clock is the take's scheduled beat zero.
export class JogMelodyGuidance {
  constructor(anchorMs) {this.anchorMs=anchorMs;this.beatMs=C.beatMs;this.step=STEP;}
  beatAt(now) {return (now-this.anchorMs)/this.beatMs;}
  complete(now) {return this.beatAt(now)>=STEP.beats;}
  model(now) {
    const beat=this.beatAt(now);
    if(this.complete(now))return {instruction:MELODY_HELP,transport:'Recording · Melody complete',
      feedback:'Written melody complete. Continue playing freely, or press Stop Recording to save this take.'};
    if(beat<0)return {instruction:MELODY_HELP,transport:`${Math.ceil(-beat)} · Prepare\nFirst: ${describeNote(EVENTS[0])}`,
      feedback:'Wait for Play. Prepare the first highlighted Honk; squeeze Trigger when its yellow ring opens.'};
    const index=EVENTS.findIndex(event=>beat<event.beat+event.beats),event=EVENTS[index],next=EVENTS[index+1];
    const bend=bendCueState(event.bend,(beat-event.beat)/event.beats,event);
    const action=!event.pitch?'Release Trigger · rest.':bend
      ?`Keep Trigger held · ${bend.instruction}.`
      :'Hold Trigger while yellow stays open; release as it shrinks.';
    return {instruction:MELODY_HELP,
      transport:`Play · ${event.phrase} (${event.phraseIndex+1}/${C.order.length}) · Beat ${Math.floor(beat%C.loopBeats)+1}/${C.loopBeats}\n${describeNote(event)}`,
      feedback:`${action}\n${next?`Next: ${describeNote(next)}`:'Then continue freely, or Stop Recording.'}`};
  }
}
