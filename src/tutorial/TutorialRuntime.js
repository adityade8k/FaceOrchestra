import * as THREE from 'three';
import { TutorialAdapter } from './TutorialAdapter.js';
import { TutorialSession } from './TutorialSession.js';
import { TutorialPanel } from './TutorialPanel.js';
import { CompositionConductor } from './CompositionConductor.js';
import { COMPOSITION as C, describeNote, TUTORIAL_LOOPERS } from './composition.js';
import { scoreForStep } from './scoring.js';
import { TutorialLessonFlow } from './TutorialLessonFlow.js';
import { TutorialTimingCues } from './TutorialTimingCues.js';
import { LESSON_CONTROL_IDS, setupStatus } from './TutorialLessonPolicy.js';

export class TutorialRuntime {
  constructor(runtime) {
    this.r=runtime;this.adapter=new TutorialAdapter(runtime,e=>this.accept(e));
    this.cues=new TutorialTimingCues(this.adapter);this.flow=new TutorialLessonFlow(this);
    this.session=null;this.conductor=null;this.demo=null;this.freePlayScene=null;this.busy=false;
    this.screen='launch';this.ready=false;this.disposed=false;this.lastDraw=-Infinity;this.diagnostics=[];
    this.ray=new THREE.Raycaster();this.ray.far=2.5;this.position=new THREE.Vector3();this.quaternion=new THREE.Quaternion();this.rayDirection=new THREE.Vector3();
    this.report=null;this.practiceProgress=null;this.simulationProgress=null;this.uiFeedback='';
    this.pendingXRPlacementFrames=0;
    this.onVisibility=()=>{if(document.hidden){
      this.conductor?.pause('Tab hidden. Resume restarts the current action.');
      if(this.session?.mode==='practice')this.flow.cancelOutgoing({keepResult:this.session.phase==='results'});
      this.uiFeedback='Tab hidden. Choose Practice or Demonstrate again.';this.adapter.releaseAll();this.cues.reset();
    }};
  }
  initialize() {
    if(this.ready)return;
    this.ready=true;this.adapter.initialize();this.r.hideInstructionPanel();this.r.instructionPanelClosed=true;
    this.panel=new TutorialPanel({scene:this.r.scene,camera:this.r.camera,renderer:this.r.renderer,onAction:(id)=>this.action(id)});
    if(this.r.xrSessionActive)this.onXRStart();
    document.addEventListener('visibilitychange',this.onVisibility);this.render(performance.now());
  }
  accept(event) {
    this.session?.accept(event);this.demo?.session.accept(event);
    if(this.session && ['note','strike'].includes(event.kind)) {
      this.diagnostics.push({id:event.id,kind:event.kind,role:event.role,origin:event.origin,
        beat:this.session.anchorMs===null?null:(event.startMs-this.session.anchorMs)/this.session.beatMs,
        durationBeats:event.durationBeats,midis:event.midis,lane:event.lane,recordedCount:event.recordedCount,
        voiced:event.voiced,invalidMembers:event.invalidMembers,maxAbsBend:event.maxAbsBend});
      if(this.diagnostics.length>256)this.diagnostics.shift();
    }
  }
  observeStrike(event,context,recordedCount) {if(this.session)this.adapter.observeStrike(event,context,recordedCount);}
  onPreview(preview,entry,controller) {if(this.session)this.adapter.bindPreview(preview,entry,controller);}
  onPlaced(instruments,preview) {if(this.session)this.adapter.placed(instruments,preview);}
  onSpawnCancelled() {this.adapter.snapshotAt=-Infinity;this.lastDraw=-Infinity;}
  async action(id,controller=null) {
    if(this.busy||this.disposed)return;
    if(this.session){
      // No hidden Spawn, Prepare, connection or backing-generation routes.
      if(!LESSON_CONTROL_IDS.includes(id))return;
      if(id==='exit'){await this.enterPlay();return;}
      if(id==='recenter'){this.panel.recenter(this.r.getUserCamera(),true);return;}
      try{
        if(this.session.mode==='simulation'){
          if(id==='step-demo'&&!this.session.complete){
            if(this.conductor?.paused)this.conductor.resume(performance.now());else this.conductor?.pause();
          }
        }else await this.flow.action(id);
      }catch(error){this.flow.fail(error.message);}
      this.render(performance.now());return;
    }
    if(id==='tutorial'){this.screen='tutorial';this.render(performance.now());return;}
    if(id==='back'){this.screen='launch';this.render(performance.now());return;}
    if(id==='play'){await this.enterPlay();return;}
    if(id==='practice'||id==='simulate'){
      try{await this.r.audioSystem.ensureAudio();await this.enter(id==='simulate'?'simulation':'practice');}
      catch(error){this.uiFeedback=error.message;this.render(performance.now());}
    }
  }
  async enter(mode) {
    this.flow.cancelOutgoing();
    this.busy=true;this.r.sessionMode='transition';
    try {
      if(!this.freePlayScene)this.freePlayScene=this.r.sceneSerializer.serialize();
      if(this.session?.mode==='practice')this.practiceProgress=this.session.exportProgress();
      if(this.session?.mode==='simulation')this.simulationProgress=this.session.exportProgress();
      this.conductor?.stop();this.stopDemo();this.adapter.clear();
      this.session=new TutorialSession({mode,now:performance.now()});this.r.sessionMode=mode;
      this.screen='lesson';this.uiFeedback='';this.diagnostics=[];this.report=null;
      this.r.hideInstructionPanel();this.r.instructionPanelClosed=true;this.adapter.begin(this.session.origin);
      this.conductor=mode==='simulation'?new CompositionConductor(this.adapter,this.session):null;
      this.panel.recenter(this.r.getUserCamera(),true);
      this.render(performance.now());
    } finally {this.busy=false;}
  }
  async enterPlay() {
    this.flow.cancelOutgoing();
    const firstPlay=!this.freePlayScene&&!this.session;
    this.busy=true;this.r.sessionMode='transition';
    try {
      this.conductor?.stop();this.conductor=null;this.stopDemo();
      if(this.session?.mode==='practice')this.practiceProgress=this.session.exportProgress();
      if(this.session?.mode==='simulation')this.simulationProgress=this.session.exportProgress();
      this.session=null;
      if(this.freePlayScene) {
        this.adapter.clear();
        const restored=await this.r.sceneRestorer.restore(this.freePlayScene);
        if(restored.skipped.length) {
          this.recoveryScene=structuredClone(this.freePlayScene);
          this.r.scenePersistence.restoreReport=restored;
          this.r.showRuntimeFeedback(`Scene recovery: ${restored.skipped.length} skipped objects, ${restored.skippedConnections?.length || 0} affected clock connections. Original preserved.`);
        }
        this.freePlayScene=null;
      }
      if(firstPlay&&this.r.xrSessionActive)this.r.spawnDefaultInstrumentPreview();
      this.r.sessionMode='play';this.screen='play';this.r.instructionPanelClosed=true;this.r.hideInstructionPanel();
      this.panel.recenter(this.r.getUserCamera());this.render(performance.now());
    } catch(error) {this.uiFeedback=error.message;this.render(performance.now());throw error;}
    finally {this.busy=false;}
  }
  retry(now) {
    if(this.session?.mode==='practice'){this.flow.practice();return;}
    this.stopDemo();this.adapter.releaseAll();
    const step=this.session?.step;
    if(!step)return;
    const recording=['record','finalize'].includes(step.type);
    if(recording)this.adapter.get(step.looperRole)?.clearRecording();
    this.session.retry(now,{recording});
    if(['performance','phrase'].includes(step.type) && !this.adapter.get('metronome')?.playing) this.adapter.command('tempo',now,this.session.origin);
    if(this.conductor){this.conductor.stepId=null;this.conductor.lastNow=now;this.conductor.paused=false;}
    this.uiFeedback='';this.adapter.snapshotAt=-Infinity;
  }
  demonstrate(now) {
    return this.flow.demonstrate();
  }
  stopDemo() {
    this.flow.stopDemo(false);
  }
  beforeFrame(now) {
    if(!this.ready||this.busy||this.disposed)return;
    if(this.pendingXRPlacementFrames>0) {this.panel.recenter(this.r.getUserCamera(),Boolean(this.session));this.pendingXRPlacementFrames--;}
    try {this.conductor?.update(now);this.demo?.conductor.update(now);}
    catch(error){this.flow.fail(error.message);if(this.session?.mode==='simulation'){this.session.reject(error.message);this.conductor?.pause(error.message);}this.adapter.releaseVirtuals();console.error('Tutorial conductor:',error);}
    // The score's final rest stops backing; the attempt retains release grace.
    if(this.session?.step?.type==='performance'&&this.session.anchorMs!==null && now>=this.session.anchorMs+95*this.session.beatMs && !this.session.failed&&!this.session.finalRestApplied&&(this.session.mode!=='practice'||this.session.phase==='practicing')) {
      this.adapter.stopSound();this.session.finalRestApplied=true;
    }
  }
  afterFrame(now) {
    if(!this.ready||this.busy||this.disposed)return;
    if(this.session) {
      this.adapter.observe(now);this.adapter.finishCapture(this.demo?.session||this.session,now);const snapshot=this.adapter.snapshot(now);
      if(this.session.mode==='simulation')Object.assign(this.adapter.takeEvidence,this.session.takeEvidence);
      if(snapshot.aligned) this.alignmentEvidence={atMs:now,loopers:snapshot.loopers.chordLooper.startBeat,phaseDifference:Math.abs(snapshot.loopers.chordLooper.phase-snapshot.loopers.percussionLooper.phase)};
      if(this.demo) {
        this.demo.session.update(snapshot,now);
        const ds=this.demo.session,limit=ds.step?.timed?(ds.step.beats+24)*ds.beatMs+5000:['playback','start-all'].includes(ds.step?.type)?30000:10000;
        if(ds.complete||ds.failed||this.demo.conductor.paused)this.flow.stopDemo(ds.complete,ds.failed||this.demo.conductor.paused?ds.feedback:'');
        else if(now-ds.enteredAt>limit)this.flow.stopDemo(false,`${ds.step.title} could not complete. Check the instruments, then press Demonstrate again.`);
      } else if(!this.conductor?.paused) {
        const previous=this.session.step?.id;
        const previousPhase=this.session.phase;
        this.session.update(snapshot,now);
        if(previousPhase!=='results'&&this.session.phase==='results')this.flow.finishPractice();
        if(this.session.step?.id!==previous) {
          this.uiFeedback='';this.lastDraw=-Infinity;
          if(this.session.feedback.startsWith('Repair:')) {this.adapter.releaseAll();this.conductor?.pause(this.session.feedback);}
        }
        if(this.session.complete&&!this.report) {
          this.conductor?.stop();this.adapter.releaseAll();this.adapter.stopSound();
          this.report={...this.session.exportProgress(),durationSeconds:this.conductor?this.conductor.elapsedMs/1000:null,
            takes:this.adapter.takes,liveTakes:this.session.takeEvidence,
            launches:Object.fromEntries(TUTORIAL_LOOPERS.map(l=>[l.role,[...(this.adapter.get(l.role)?.looperData.launchHistory || [])]])),
            startAll:this.adapter.startAllRequest,alignment:this.alignmentEvidence,audioState:this.r.audioSystem.audioContextService.context?.state};
          if(this.session.mode==='practice')this.practiceProgress=this.session.exportProgress();else this.simulationProgress=this.session.exportProgress();
        }
      }
    }
    this.adapter.focusRing.visible=false;
    this.cues.update(this.demo?.session||this.session,now,{active:!this.conductor?.paused&&(Boolean(this.demo)||this.session?.phase!=='results')});
    this.panel.animate?.(now);
    if(now-this.lastDraw>=100&&(this.session||this.lastPendingPreview!==this.r.pendingSpawnPlacement)){
      this.render(now);this.lastDraw=now;this.lastPendingPreview=this.r.pendingSpawnPlacement;
    }
    if(this.panel.xr) {
      const hit=this.r.controllers.filter(c=>!c.userData.virtualTutorial).map(c=>this.panelHit(c)).find(hit=>hit?.object.userData.action);
      this.panel.hover(hit?.object);
    }
  }
  blocksController(controller) {return Boolean(this.busy || ((this.session?.mode==='simulation'||this.demo)&&!controller.userData.virtualTutorial));}
  panelHit(controller) {
    if(!this.panel?.group.visible)return null;
    controller.getWorldPosition(this.position);controller.getWorldQuaternion(this.quaternion);
    this.ray.set(this.position,this.rayDirection.set(0,0,-1).applyQuaternion(this.quaternion));return this.panel.hit(this.ray);
  }
  nearestPanelHit(controller,instrumentHit) {
    const hit=this.panelHit(controller);
    return hit && (!instrumentHit||hit.distance<=instrumentHit.distance) ? hit : null;
  }
  capturePanelTrigger(controller) {
    const hit=this.nearestPanelHit(controller,this.r.raycastSystem.getCurrentHit(controller));
    if(!hit)return false;
    const state=this.r.controllerStates.get(controller);this.r.clearControllerTriggerInteraction(state);
    state.tutorialPanelCapture=true;state.suppressTriggerUntilRelease=true;
    if(hit.object.userData.action&&!hit.object.userData.disabled)this.action(hit.object.userData.action,controller);
    return true;
  }
  releasePanelTrigger(controller) {
    const state=this.r.controllerStates.get(controller);
    if(!state?.tutorialPanelCapture)return false;
    state.tutorialPanelCapture=false;state.suppressTriggerUntilRelease=false;this.r.releaseRaySqueeze(state);return true;
  }
  onXRStart() {this.pendingXRPlacementFrames=4;if(this.r.sessionMode==='play')this.r.spawnDefaultInstrumentPreview();this.r.hideInstructionPanel();this.r.instructionPanelClosed=true;this.panel?.setXR(true,this.r.getUserCamera());this.panel?.recenter(this.r.getUserCamera(),Boolean(this.session));}
  onXREnd() {this.pendingXRPlacementFrames=0;this.conductor?.stop();this.flow.cancelOutgoing();this.adapter.releaseAll();this.panel?.setXR(false);if(this.session)this.enterPlay().catch(error=>console.error(error));}
  render(now) {
    if(!this.panel)return;
    const button=(id,label,disabled=false,extra={})=>({id,label,disabled,...extra});
    let model;
    if(!this.session){
      if(this.screen==='launch')model={title:'Honk Orchestra',instruction:'Play freely, or build and perform the Jog Study.',actions:[button('play','Play'),button('tutorial','Tutorial')]};
      else if(this.screen==='tutorial')model={title:C.title,instruction:'Build the ensemble with the radial menu. Musical exercises can be skipped. Demonstrate and Practice use your existing instruments.',feedback:'Full simulation builds and performs the composition automatically; allow several minutes.',actions:[button('practice','Start Lesson'),button('simulate','Full Simulation'),button('back','Back')]};
      else model={title:'Free play',instruction:'Hold right A or left Y, roll to choose a category, then pull and roll to choose an item. Release to preview; Trigger places. Grip in empty space equips a stick.',actions:[button('tutorial','Tutorial')]};
      if(this.uiFeedback)model.feedback=this.uiFeedback;
      this.panel.setTransport('');
    }else{
      const s=this.session,simulation=s.mode==='simulation',step=s.step,shown=this.demo?.session||s;
      const activeDemo=Boolean(this.demo),activePractice=s.phase==='practicing';
      const snapshot=this.adapter.snapshot(now),setup=step&&setupStatus(step,snapshot);
      const reason=s.complete?'The study is complete.':simulation?'':this.flow.unavailable();
      const nextDisabled=simulation||s.complete||Boolean(setup&&!setup.ok);
      const navigation=[
        button('previous-step','Previous Step',simulation||s.index===0),
        button('next-step','Next Step',nextDisabled,{primary:!nextDisabled&&s.phase==='results',reason:setup&&!setup.ok?setup.message:''}),
        button('step-demo','Demonstrate',s.complete||(!simulation&&!activeDemo&&(activePractice||Boolean(reason))),{active:simulation?!this.conductor?.paused:activeDemo,primary:!reason&&s.phase==='ready'&&!s.demonstrated.has(step?.id),reason:activePractice?'Press Practice to stop the attempt.':reason}),
        button('step-practice','Practice',simulation||s.complete||(!activePractice&&(activeDemo||Boolean(reason))),{active:activePractice,primary:!reason&&!activeDemo&&(s.phase==='results'||s.demonstrated.has(step?.id)),reason:activeDemo?'Press Demonstrate to stop the example.':reason}),
      ];
      let target='';
      if(shown.step?.timed&&shown.anchorMs!==null&&(activeDemo||s.phase!=='results')){
        const beat=(now-shown.anchorMs)/shown.beatMs;
        if(beat<0)target='Count in: '+Math.ceil(-beat);
        else{
          target='Beat '+Math.min(shown.step.beats,Math.floor(beat)+1)+' / '+shown.step.beats;
          const note=scoreForStep(shown.step).find(e=>e.beat+(e.beats??.4)>beat);
          if(note?.pitch)target+='\n'+describeNote(note);
          else if(note?.role)target+='\n'+(C.backing.find(g=>g.role===note.role)?.label||({percussion:'Honk · boink',metronome:'Metronome · wood',percussionLooper:'Looper · hihat'}[note.role])||note.role);
        }
      }
      this.panel.setTransport(target);
      let feedback=simulation?(this.conductor?.paused?'Simulation paused. Press Demonstrate to resume.':'Full simulation running. Press Demonstrate to pause.'):
        setup?.message||this.uiFeedback||s.feedback||reason||'Demonstrate or Practice. Next Step skips this exercise.';
      if(!simulation&&!activeDemo&&!activePractice&&reason&&!setup)feedback=reason;
      if(s.result&&!activeDemo&&!setup&&reason!=='No recording yet; you can skip this step'){
        const result=s.result,names={targets:'Targets',timing:'Onsets',holdRelease:'Hold/release',bend:'Bend'};
        feedback=(result.score===undefined?(result.ok?'Completed':'Try again'):result.score+'/100'+(result.ok?' · Well played':''))+'\n';
        if(result.components)feedback+=Object.entries(result.components).map(([key,value])=>names[key]+' '+value).join(' · ')+'\n';
        feedback+=result.message;
        const mismatch=result.details?.find(d=>d.heard==='missing'||d.extra||d.correct===false);
        const name=role=>C.backing.find(g=>g.role===role)?.label||role?.replace('melody-','')||'rest';
        if(mismatch)feedback+='\nExpected '+name(mismatch.expected)+'; heard '+name(mismatch.heard)+'.';
        else{
          const timing=result.details?.find(d=>d.onsetErrorBeats>.12||d.holdErrorBeats>.175);
          if(timing)feedback+=step.timed?'\n'+name(timing.expected)+': expected beat '+(timing.beat+1).toFixed(1)+', heard '+(timing.heardBeat+1).toFixed(1)+'.':'\nExpected a '+Math.round(timing.expectedHold)+' ms hold; heard '+Math.round(timing.heardHold)+' ms.';
        }
        feedback+='\nPractice retries; Next Step continues.';
      }
      if(s.complete)feedback=simulation?'Simulation complete in '+(this.report?.durationSeconds||0).toFixed(1)+' seconds.':
        [...s.outcomes.values()].filter(o=>o.status==='passed').length+' completed · '+[...s.outcomes.values()].filter(o=>o.status==='skipped').length+' skipped.';
      model={title:s.complete?'Study complete':step.title,instruction:s.complete?'VIRAG 2 · A, B, A, C, B, D.':step.instruction,
        navigation,actions:[button('recenter','Recenter'),button('exit','Exit')],feedback,
        result:!activeDemo&&s.phase==='results'?(s.result?.ok?'passed':'retry'):null,
        progress:(simulation?'Simulation':activeDemo?'Demonstration':'Lesson')+' · '+Math.min(s.index+1,s.steps.length)+'/'+s.steps.length+(activePractice?' · Practice':s.phase==='results'?' · Results':'')};
    }
    this.panel.render({visible:true,...model});
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;this.conductor?.stop();this.stopDemo();
    this.flow.cancelOutgoing();document.removeEventListener('visibilitychange',this.onVisibility);this.cues.dispose();this.adapter.dispose();this.panel?.dispose();
  }
}
