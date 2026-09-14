import { TutorialSession } from './TutorialSession.js';
import { CompositionConductor } from './CompositionConductor.js';
import { LESSON_STEPS } from './lessonSteps.js';
import { TutorialPreparation, requiredRecordings, isSetupStep } from './TutorialPreparation.js';
import { TUTORIAL_LOOPERS } from './composition.js';
import { recordingFitsRoutes } from './TutorialRoutes.js';

// Asynchronous scene preparation is separate from pure attempts and frame cues.
export class TutorialLessonFlow {
  constructor(t){this.t=t;this.a=t.adapter;this.preparation=new TutorialPreparation(t);this.generation=0;this.preparing=false;this.pending=null;this.practiceBackup=null;}
  snapshots(){return Object.fromEntries(TUTORIAL_LOOPERS.flatMap(({role})=>{const h=this.a.get(role);return h?[[role,{state:h.looperController.serializeState(h),routes:this.a.takeRoutes[role],evidence:this.a.takeEvidence[role]}]]:[];}));}
  restore(saved,except=null){
    for(const [role,value] of Object.entries(saved||{}))if(role!==except){const h=this.a.get(role);if(h){h.stop();h.looperController.restoreState(h,value.state,{preserveConnections:true});this.a.takeRoutes[role]=value.routes;this.a.takeEvidence[role]=value.evidence;}}
    this.a.snapshotAt=-Infinity;
  }
  cancelOutgoing({keepResult=false}={}) {
    this.generation++;this.preparing=false;
    this.stopDemo(false);this.restore(this.practiceBackup);this.practiceBackup=null;
    this.a.releaseAll();this.t.r.deletePendingSpawnPlacement();this.t.cues.reset();
    for(const {role} of TUTORIAL_LOOPERS)this.a.get(role)?.stop();
    if(!keepResult&&this.t.session?.mode==='practice'){this.t.session.discardAttempt(performance.now());this.t.session.phase='ready';this.t.session.result=null;}
  }
  async prepare(step,{includeCurrent=false,recordings=true,resume=null}={}) {
    const generation=++this.generation;this.preparing=true;this.t.uiFeedback='Preparing this step…';this.t.render(performance.now());
    const check=()=>{if(generation!==this.generation||!this.t.session)throw new Error('Preparation cancelled.');};
    try {
      const changes=await this.preparation.prepare(step,{includeCurrent,check});check();
      const missing=recordings?requiredRecordings(step).filter(role=>!recordingFitsRoutes(this.a,role)):[];
      if(missing.length){this.pending={...resume,step,missing};this.t.uiFeedback=`This step needs ${missing.map(role=>role==='chordLooper'?'the chord backing':'percussion').join(' and ')} recorded for the current setup. Choose the recording action below.`;return false;}
      this.pending=null;this.t.uiFeedback=changes.length?`Prepared: ${changes.slice(-3).join('; ')}.`:'Setup ready.';return true;
    } catch(error) {
      if(generation===this.generation){this.t.uiFeedback=error.message;this.t.r.deletePendingSpawnPlacement();this.a.releaseVirtuals();this.t.cues.reset();}
      return false;
    } finally {if(generation===this.generation){this.preparing=false;this.t.render(performance.now());}}
  }
  async navigate(direction) {
    const s=this.t.session;if(!s||s.mode!=='practice')return;
    const index=Math.max(0,Math.min(s.index+direction,s.steps.length)),step=s.steps[index];
    this.cancelOutgoing();
    if(direction>0&&step&&!await this.prepare(step,{resume:{kind:'navigate',index}}))return;
    s.navigate(index,performance.now());this.pending=null;this.t.uiFeedback='';this.t.cues.reset();this.t.render(performance.now());
  }
  async practice() {
    const s=this.t.session;if(!s||s.complete)return;
    this.cancelOutgoing();
    if(!await this.prepare(s.step,{resume:{kind:'practice'}}))return;
    const step=s.step,now=performance.now();
    this.practiceBackup=step.type==='record'?this.snapshots():null;
    s.startAttempt(now,{assisted:isSetupStep(step)&&s.assisted.has(step.id)});
    try {
      if(['note','playback','start-all','finalize'].includes(step.type)&&step.action)this.a.command(step.action,now,step.type==='note'?'assistance':'learner');
      if(step.type==='record')this.a.command(step.action,now,'learner');
      if(step.timed){
        const phrase=['phrase','performance'].includes(step.type);
        if(phrase){
          this.a.command('start-all',now,'assistance');
          const generation=this.generation,end=now+2500;
          while(!this.a.snapshot(performance.now()).aligned&&performance.now()<end){await this.preparation.frame();if(generation!==this.generation)return;}
          if(!this.a.snapshot(performance.now()).aligned)throw new Error('Both backing parts must be connected and playing. Choose Prepare, then Practice.');
        }
        const accompany=step.looperRole==='percussionLooper'&&this.a.get('chordLooper')?.transport.playing;
        const anchor=this.a.nextBoundary(performance.now(),phrase||accompany?16:1,4);
        if(anchor===null)throw new Error('Start the 80 BPM Metronome, then Practice again.');
        s.startCountIn(anchor,this.a.get('metronome').getBeatTiming(performance.now()).beatIntervalMs);
      }
      this.t.uiFeedback='Your turn.';
    }catch(error){s.finishResult({ok:false,message:error.message},performance.now());this.finishPractice();}
    this.t.render(performance.now());
  }
  finishPractice() {
    const s=this.t.session;if(s?.mode!=='practice'||s.phase!=='results')return;
    if(s.step.type==='record') {
      this.a.get(s.step.looperRole)?.stop();
      if(s.result?.ok){this.a.takeEvidence[s.step.looperRole]=s.takeEvidence[s.step.looperRole];this.practiceBackup=null;}else this.restore(this.practiceBackup);
    }
    this.practiceBackup=null;this.a.releaseAll();this.t.cues.reset();
    for(const {role} of TUTORIAL_LOOPERS)this.a.get(role)?.stop();
    this.t.uiFeedback='';this.t.panel.completeEffect(performance.now(),s.result?.ok);this.t.render(performance.now());
  }
  async demonstrate({recordRole=null}={}) {
    const s=this.t.session;if(!s||s.complete||s.mode!=='practice')return;
    const pending=this.pending;this.cancelOutgoing();
    const step=recordRole?LESSON_STEPS.find(step=>step.type==='record'&&step.looperRole===recordRole):s.step;
    if(!await this.prepare(step,{includeCurrent:step.type==='spawn'&&this.a.members(step.role).length>0,recordings:!recordRole,resume:{kind:'demo'}}))return;
    const recordDemo=step.type==='record';
    const steps=recordDemo?LESSON_STEPS.filter(candidate=>candidate.looperRole===step.looperRole&&['record','finalize','playback'].includes(candidate.type)):[step];
    const now=performance.now(),session=new TutorialSession({mode:'demonstration',origin:recordRole?'assistance':'demonstration',now,steps});
    session.takeEvidence={...this.a.takeEvidence};
    this.t.demo={session,stepId:s.step.id,recordRole,savedTakes:recordDemo?this.snapshots():null,resume:recordRole?pending:null,
      conductor:new CompositionConductor(this.a,session,{origin:session.origin,demonstration:true})};
    s.phase='demonstrating';s.result=null;this.a.setVirtualsActive(true,session.origin);
    this.t.uiFeedback=recordRole?'Recording a real take. Stop Demonstration cancels safely.':'Watch, then choose Practice.';this.t.render(now);
  }
  stopDemo(completed=false,message='') {
    const demo=this.t.demo;if(!demo)return;
    demo.conductor.stop();this.a.releaseVirtuals();
    for(const {role} of TUTORIAL_LOOPERS)this.a.get(role)?.stop();
    this.restore(demo.savedTakes,completed?demo.recordRole:null);this.t.demo=null;this.t.cues.reset();
    if(completed&&demo.recordRole)this.a.takeEvidence[demo.recordRole]=demo.session.takeEvidence[demo.recordRole];
    if(!completed&&demo.recordRole&&demo.resume)this.pending=demo.resume;
    this.a.setVirtualsActive(this.t.session?.mode==='simulation',this.t.session?.origin);
    const s=this.t.session;
    if(s?.mode==='practice'){
      s.discardAttempt(performance.now());s.phase='ready';
      if(completed){s.demonstrated.add(demo.stepId);if(demo.recordRole||isSetupStep(s.step))s.assisted.add(demo.stepId);}
      this.t.uiFeedback=message||(completed?demo.recordRole?'Recording ready.':'Demonstration complete. Choose Practice.':'Demonstration stopped. Practice or try it again.');
      this.t.render(performance.now());
      if(completed&&demo.recordRole&&demo.resume){this.pending=demo.resume;queueMicrotask(()=>this.resumePending());}
    }
  }
  async resumePending(){
    const pending=this.pending;if(!pending||!this.t.session)return;
    if(pending.kind==='navigate'){
      if(await this.prepare(pending.step,{resume:pending}))this.t.session.navigate(pending.index,performance.now());
    }else if(pending.kind==='practice')await this.practice();
    else if(pending.kind==='demo')await this.demonstrate();
    this.t.render(performance.now());
  }
  fail(message){
    if(this.t.demo)this.stopDemo(false,message);
    else if(this.t.session?.mode==='practice'&&this.t.session.phase==='practicing'){
      this.t.session.finishResult({ok:false,message},performance.now());this.finishPractice();
    }else this.t.uiFeedback=message;
  }
  async action(id){
    if(id==='previous-step')return this.navigate(-1);
    if(id==='next-step')return this.navigate(1);
    if(id==='step-practice'||id==='practice-again')return this.practice();
    if(id==='step-demo')return this.demonstrate();
    if(id==='stop-demo'){this.stopDemo(false);return;}
    if(id==='cancel-preparation'){this.cancelOutgoing();this.t.uiFeedback='Preparation cancelled. Choose Prepare to continue.';return;}
    if(id==='prepare-step')return this.prepare(this.pending?.step||this.t.session.step,{includeCurrent:true,resume:this.pending});
    if(id==='record-backing')return this.demonstrate({recordRole:'chordLooper'});
    if(id==='record-percussion')return this.demonstrate({recordRole:'percussionLooper'});
    if(id==='spawn-step'){
      this.cancelOutgoing();if(await this.prepare(this.t.session.step,{recordings:false})){
        try{await this.preparation.ensureRole(this.t.session.step);this.t.session.assisted.add(this.t.session.step.id);this.t.uiFeedback='Instrument ready.';}catch(error){this.t.uiFeedback=error.message;}
      }
      this.t.render(performance.now());return;
    }
    if(id==='finish-attempt'){this.t.session.finishAttempt(this.a.snapshot(performance.now()),performance.now());this.finishPractice();}
  }
}
