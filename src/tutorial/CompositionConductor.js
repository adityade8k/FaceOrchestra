import { COMPOSITION as C, bendAt, TOLERANCES as T } from './composition.js';
import { expectedForStep } from './validation.js';

// Driven by the app's INPUT phase; never owns a timer or a render loop.
export class CompositionConductor {
  constructor(adapter, session, {origin='simulation', demonstration=false} = {}) {
    this.adapter=adapter;this.session=session;this.origin=origin;this.demonstration=demonstration;
    this.running=true;this.paused=false;this.lastNow=null;this.stepId=null;this.stepAt=0;
    this.actions=new Set();this.noteId=null;this.finished=false;this.elapsedMs=0;this.startedAt=null;
  }
  once(key, fn) { if(this.actions.has(key))return;fn();this.actions.add(key); }
  update(now) {
    if(!this.running || this.paused) return;
    if((this.session.step?.timed || ['note','strike'].includes(this.session.step?.type)) && this.lastNow!==null && now-this.lastNow>T.maxFrameGapMs) {this.pause('Frame delayed; resume with a fresh count-in.');return;}
    this.lastNow=now;this.startedAt??=now;this.elapsedMs=now-this.startedAt;
    if(this.session.complete) {this.stop();this.finished=true;return;}
    if(this.session.failed) {this.adapter.releaseVirtuals();return;}
    const step=this.session.step;
    if(this.stepId!==`${step.id}:${this.session.attempt}`) {
      this.adapter.squeeze(null,false,0,now);
      this.stepId=`${step.id}:${this.session.attempt}`;this.stepAt=now;this.actions.clear();this.noteId=null;
    }
    const elapsed=now-this.stepAt;
    if(step.type==='spawn') {
      if(elapsed>=150) this.once('select',()=>this.adapter.select(step,this.adapter.virtuals[0],this.origin));
      if(elapsed>=900) this.once('place',()=>this.adapter.place());
    } else if(['ack','clock-wire','wire','tempo','timbre','finalize','playback'].includes(step.type)) {
      if(elapsed>=(step.type==='finalize'?0:300)) this.once('action',()=>this.adapter.command(step.action,now,this.origin));
      if(step.type==='playback') this.adapter.releaseVirtuals();
    } else if(step.type==='note') {
      if(step.action) this.once('action',()=>this.adapter.command(step.action,now,this.origin));
      const duration=step.bend ? 2250 : Math.max(step.minimumMs+100,600);
      if(elapsed>=250 && elapsed<250+duration) this.adapter.squeeze(step.role,true,bendAt(step.bend,(elapsed-250)/duration),now);
      else if(elapsed>=250+duration) this.adapter.squeeze(null,false,0,now);
    } else if(step.type==='stick') {
      if(elapsed>=250) this.once('equip',()=>this.adapter.equip(true,this.origin));
    } else if(step.type==='unequip') {
      if(elapsed>=200) this.once('unequip',()=>this.adapter.equip(false,this.origin));
    } else if(step.type==='strike') {
      this.once('equip',()=>this.adapter.equip(true,this.origin));
      this.strike([{role:step.role,beat:1}],elapsed/C.beatMs);
    } else if(step.timed) {
      if(step.type==='record' && elapsed>=100) this.once('arm',()=>this.adapter.command('record',now,this.origin));
      if(this.session.anchorMs===null && elapsed>=300) {
        const phrase=step.type==='phrase' || step.type==='performance';
        const looper=this.adapter.get('looper');
        if(phrase && !looper?.transport.playing) {
          this.once('backing',()=>this.adapter.command('play',now,this.origin));return;
        }
        const anchor=this.adapter.nextBoundary(now,phrase ? 16 : 1,4);
        if(anchor!==null) this.session.startCountIn(anchor,this.adapter.get('metronome').getBeatTiming(now).beatIntervalMs);
      }
      if(this.session.anchorMs===null) return;
      const beat=(now-this.session.anchorMs)/this.session.beatMs;
      const needsStick=step.type==='record' || step.type==='drums';
      if(needsStick) this.once('equip',()=>this.adapter.equip(true,this.origin));
      const events=expectedForStep(step);
      const note=events.find(e=>beat>=e.beat && beat<e.beat+e.beats-0.07);
      const nextNoteId=note ? (note.id || note.role) : null;
      if(nextNoteId !== this.noteId) {
        this.adapter.squeeze(null,false,0,now);
        this.noteId=note ? (note.id || note.role) : null;
      }
      if(note) this.adapter.squeeze(note.role,true,bendAt(note.bend,(beat-note.beat)/note.beats),now);
      else this.adapter.squeeze(null,false,0,now);
      if(needsStick) this.strike(C.percussion,beat);
      if(step.type==='performance' && beat>=95) this.once('final-rest',()=>{this.adapter.releaseVirtuals();this.adapter.stopSound();});
    }
  }
  strike(pattern,beat) {
    const hit=pattern.find(e=>beat>=e.beat-0.3 && beat<e.beat+0.32);
    if(!hit) {this.adapter.park(this.adapter.virtuals[1]);return;}
    const phase=beat-hit.beat;
    const approach=phase<0 ? 0.82*(phase+0.3)/0.3 : phase<=0.08 ? 0.82+0.18*phase/0.08 : Math.max(0,1-(phase-0.08)/0.24);
    this.adapter.moveStick(hit.role,approach);
  }
  pause(message='Paused. Resume restarts this action with a count-in.') {
    if(this.paused || !this.running)return;
    this.paused=true;this.adapter.releaseVirtuals();
    const looper=this.adapter.get('looper');this.recordInterrupted=Boolean(looper?.transport.recording||looper?.transport.recordArmed||this.session.step?.type==='finalize');
    if(this.recordInterrupted) looper.clearRecording();else looper?.stop();
    this.session.feedback=message;
  }
  resume(now) {
    if(!this.paused)return;
    this.session.retry(now,{recording:this.recordInterrupted});
    this.paused=false;this.lastNow=now;this.stepId=null;
  }
  stop() {if(!this.running)return;this.running=false;this.adapter.releaseVirtuals();}
}
