import { TutorialSession } from './TutorialSession.js';
import { CompositionConductor } from './CompositionConductor.js';
import { LESSON_STEPS } from './lessonSteps.js';
import { TUTORIAL_LOOPERS } from './composition.js';
import { isSetupStep, musicUnavailable, setupStatus } from './TutorialLessonPolicy.js';

// The learner flow observes setup. Automatic construction belongs to the
// separately invoked full-composition conductor.
export class TutorialLessonFlow {
  constructor(t){this.t=t;this.a=t.adapter;this.generation=0;this.practiceBackup=null;this.ownedPlayback=new Set();}
  snapshots(){
    const now=performance.now();
    return Object.fromEntries(TUTORIAL_LOOPERS.flatMap(({role})=>{
      const h=this.a.get(role);if(!h)return [];
      return [[role,{id:h.id,state:h.looperController.serializeState(h),routes:this.a.takeRoutes[role],evidence:this.a.takeEvidence[role],
        transport:h.transport.state,source:h.transport.playing?h.looperController.getAbsoluteSourcePosition(h,now):h.looperData.playbackEngine.elapsedMs,
        pendingSource:h.looperData.pendingLaunch?.resumeSourceMs}]];
    }));
  }
  restore(saved,{transports=false}={}){
    const now=performance.now(),audioAnchor={wallMs:now,audioSeconds:this.t.r.audioSystem.audioContextService.context?.currentTime};
    for(const [role,value] of Object.entries(saved||{})){
      const h=this.a.get(role);if(!h||h.id!==value.id)continue;
      h.stop();h.looperController.restoreState(h,value.state,{preserveConnections:true});
      this.a.takeRoutes[role]=value.routes;this.a.takeEvidence[role]=value.evidence;
      if(transports&&['playing','paused','armed-playback'].includes(value.transport)){
        // Resume from the saved source point through the existing scheduler.
        // One request time/audio anchor preserves alignment between both parts.
        h.transport.play();h.transport.pause();h.looperData.playbackEngine.elapsedMs=value.pendingSource??value.source??0;
        if(value.transport!=='paused')h.looperController.armPlayback(h,now,h.looperController.getTimingForLooper(h,now),{resume:true,audioAnchor});
      }
    }
    this.a.snapshotAt=-Infinity;
  }
  cancelPractice({keepResult=false,preserveSticks=false}={}){
    const s=this.t.session;
    if(s?.phase!=='practicing'&&!this.practiceBackup&&!this.ownedPlayback.size)return;
    if(s?.step?.type==='record')this.a.get(s.step.looperRole)?.stop();
    for(const role of this.ownedPlayback)this.a.get(role)?.stop();
    this.ownedPlayback.clear();this.restore(this.practiceBackup);this.practiceBackup=null;
    this.a.releaseAll({preserveSticks});this.t.cues.reset();
    if(s&&!keepResult){s.discardAttempt(performance.now());s.phase='ready';s.result=null;}
  }
  cancelOutgoing({keepResult=false,preserveSticks=false}={}){
    this.generation++;this.stopDemo(false);this.cancelPractice({keepResult,preserveSticks});
    this.a.releaseAll({preserveSticks});this.t.r.deletePendingSpawnPlacement();this.t.cues.reset();
  }
  unavailable(){return musicUnavailable(this.t.session?.step,this.a.snapshot(performance.now()));}
  navigate(direction){
    const s=this.t.session;if(!s||s.mode!=='practice')return;
    if(direction>0&&isSetupStep(s.step)){
      const status=setupStatus(s.step,this.a.snapshot(performance.now()));
      if(!status.ok){this.t.uiFeedback=status.message;return;}
    }
    this.cancelOutgoing({keepResult:true,preserveSticks:true});
    s.navigate(s.index+direction,performance.now());this.t.uiFeedback='';this.t.render(performance.now());
  }
  async practice(){
    const s=this.t.session;if(!s||s.complete||isSetupStep(s.step))return;
    if(s.phase==='practicing'){this.cancelPractice({preserveSticks:true});this.t.uiFeedback='Practice stopped. Press Practice to try again.';return;}
    if(this.t.demo){this.t.uiFeedback='Press Demonstrate to stop the example first.';return;}
    const reason=this.unavailable();if(reason){this.t.uiFeedback=reason;return;}
    const generation=++this.generation;
    await this.t.r.audioSystem.ensureAudio();if(generation!==this.generation||this.t.session!==s)return;
    this.a.releaseAll({preserveSticks:true});const step=s.step,now=performance.now();
    this.practiceBackup=step.type==='record'?this.snapshots():null;
    s.startAttempt(now);
    try{
      if(['playback','start-all','finalize','record'].includes(step.type)&&step.action){
        this.a.command(step.action,now,'learner');
        for(const {role} of TUTORIAL_LOOPERS)if(this.a.get(role)?.transport.playing||this.a.get(role)?.looperData.playArmed)this.ownedPlayback.add(role);
      }
      if(step.timed){
        const phrase=['phrase','performance'].includes(step.type);
        const backing=(phrase||step.type==='record'&&step.looperRole==='percussionLooper')?this.a.startAvailableBacking(now,{excludeRole:step.looperRole}):[];
        for(const role of backing)this.ownedPlayback.add(role);
        const anchor=this.a.nextBoundary(now,backing.length?16:1,4,backing[0]);
        if(anchor===null)throw new Error('Start the 80 BPM Metronome, then press Practice.');
        s.startCountIn(anchor,this.a.get('metronome').getBeatTiming(now).beatIntervalMs);
      }
      this.t.uiFeedback='Your turn. Press Practice again to stop.';
    }catch(error){s.finishResult({ok:false,message:error.message},performance.now());this.finishPractice();}
  }
  finishPractice(){
    const s=this.t.session;if(s?.mode!=='practice'||s.phase!=='results')return;
    if(!isSetupStep(s.step)){
      if(s.step.type==='record'){
        this.a.get(s.step.looperRole)?.stop();
        if(s.result?.ok){this.a.takeEvidence[s.step.looperRole]=s.takeEvidence[s.step.looperRole];this.practiceBackup=null;}
        else this.restore(this.practiceBackup);
      }
      this.practiceBackup=null;for(const role of this.ownedPlayback)this.a.get(role)?.stop();this.ownedPlayback.clear();
      this.a.releaseAll({preserveSticks:true});this.t.cues.reset();
    }
    this.t.uiFeedback='';this.t.panel.completeEffect(performance.now(),s.result?.ok);
  }
  async demonstrate(){
    const s=this.t.session;if(!s||s.complete||s.mode!=='practice'||isSetupStep(s.step))return;
    if(this.t.demo){this.stopDemo(false);return;}
    if(s.phase==='practicing'){this.t.uiFeedback='Press Practice to stop your attempt first.';return;}
    const reason=this.unavailable();if(reason){this.t.uiFeedback=reason;return;}
    const generation=++this.generation;
    await this.t.r.audioSystem.ensureAudio();if(generation!==this.generation||this.t.session!==s)return;
    this.a.releaseAll();const step=s.step,now=performance.now();
    const savedTakes=this.snapshots(),metro=this.a.get('metronome');
    const savedHonks=new Map(this.t.r.instrumentRegistry.getByKind('honk').map(h=>[h.id,{...h.serialize().performanceDefaults}]));
    const steps=step.type==='record'?[step,LESSON_STEPS.find(candidate=>candidate.type==='finalize'&&candidate.looperRole===step.looperRole)]:[step];
    const session=new TutorialSession({mode:'demonstration',origin:'demonstration',now,steps});session.takeEvidence={...this.a.takeEvidence};
    this.t.demo={session,stepId:step.id,savedTakes,savedHonks,checkpoint:{phase:s.phase,result:s.result,feedback:s.feedback},
      savedMetro:metro?{id:metro.id,bpm:metro.bpm,volume:metro.volume,playing:metro.playing}:null,
      conductor:new CompositionConductor(this.a,session,{origin:'demonstration',demonstration:true})};
    for(const {role} of TUTORIAL_LOOPERS)this.a.get(role)?.stop();
    s.phase='demonstrating';this.a.setVirtualsActive(true,'demonstration');
    this.t.uiFeedback='Watch the example. Press Demonstrate again to stop.';
  }
  stopDemo(completed=false,message=''){
    const demo=this.t.demo;if(!demo)return;
    demo.conductor.stop();this.a.releaseVirtuals();this.t.demo=null;this.t.cues.reset();
    for(const [id,defaults] of demo.savedHonks){const h=this.t.r.instrumentRegistry.get(id);if(h){h.setLivePerformance(defaults);h.setVowel(defaults.vowel);}}
    const saved=demo.savedMetro,metro=this.a.get('metronome'),now=performance.now();
    if(saved&&metro?.id===saved.id){if(metro.bpm!==saved.bpm)metro.setBpm(saved.bpm,now);metro.setVolume(saved.volume);if(saved.playing&&!metro.playing)metro.play(now);if(!saved.playing&&metro.playing)metro.pause(now);}
    this.restore(demo.savedTakes,{transports:true});this.a.setVirtualsActive(false);
    const s=this.t.session;if(s?.mode==='practice'){
      Object.assign(s,demo.checkpoint);if(completed)s.demonstrated.add(demo.stepId);
      this.t.uiFeedback=message||(completed?'Example complete. Your checkpoint and recordings are restored.':'Example stopped. Your checkpoint and recordings are restored.');
    }
  }
  fail(message){
    if(this.t.demo)this.stopDemo(false,message);
    else if(this.t.session?.phase==='practicing'){this.t.session.finishResult({ok:false,message},performance.now());this.finishPractice();}
    else this.t.uiFeedback=message;
  }
  action(id){
    if(id==='previous-step')return this.navigate(-1);
    if(id==='next-step')return this.navigate(1);
    if(id==='step-practice')return this.practice();
    if(id==='step-demo')return this.demonstrate();
  }
}
