import * as THREE from 'three';
import { TutorialAdapter } from './TutorialAdapter.js';
import { TutorialSession } from './TutorialSession.js';
import { TutorialPanel } from './TutorialPanel.js';
import { CompositionConductor } from './CompositionConductor.js';
import { COMPOSITION as C, describeNote, TUTORIAL_LOOPERS } from './composition.js';
import { scoreForStep } from './scoring.js';
import { TutorialLessonFlow } from './TutorialLessonFlow.js';
import { TutorialTimingCues } from './TutorialTimingCues.js';

export class TutorialRuntime {
  constructor(runtime) {
    this.r=runtime;this.adapter=new TutorialAdapter(runtime,e=>this.accept(e));
    this.cues=new TutorialTimingCues(this.adapter);this.flow=new TutorialLessonFlow(this);
    this.adapter.placementShift=preview=>this.flow.preparation.findFreePlacement(preview);
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
  onPlaced(instruments,preview) {
    if(!this.session)return;
    const tutorialSpawn=preview?.tutorialSpawn;
    this.adapter.placed(instruments,preview);
    if(tutorialSpawn)this.uiFeedback='Placed. Grab to move it, or continue with Practice.';
  }
  onSpawnCancelled(preview) {
    if(!this.session||!preview?.tutorialSpawn)return;
    this.adapter.snapshotAt=-Infinity;
    this.uiFeedback='Placement cancelled. Choose Spawn to try again.';this.lastDraw=-Infinity;
  }
  async action(id, controller=null) {
    if(this.busy||this.disposed)return;
    // Reserve manual Spawn before the audio await so concurrent clicks cannot
    // replace a preview, and navigation can invalidate an unfinished request.
    if(id==='spawn-step'){
      try{await this.flow.action(id,controller);}catch(error){this.flow.fail(error.message);}
      this.render(performance.now());return;
    }
    // Called directly by an actual browser click or XR trigger: respect autoplay.
    try { await this.r.audioSystem.ensureAudio(); }
    catch {this.uiFeedback='Audio could not start. Enable audio for this site, then click this action again.';this.render(performance.now());return;}
    const now=performance.now();
    if(['previous-step','next-step','step-demo','step-practice','practice-again','stop-demo','prepare-step','cancel-preparation','record-backing','record-percussion','spawn-step','finish-attempt'].includes(id)) {
      try{await this.flow.action(id,controller);}catch(error){this.flow.fail(error.message);}this.render(performance.now());return;
    }
    if(id==='tutorial'){this.screen='tutorial';this.render(now);return;}
    if(id==='back'){this.screen='launch';this.render(now);return;}
    if(['play','exit','return-play'].includes(id) && (id!=='play'||!this.session)) {await this.enterPlay();return;}
    if(id==='practice'||id==='simulate'||id==='restart'||id==='retry-composition') {
      await this.enter(id==='simulate'||(['restart','retry-composition'].includes(id)&&this.session?.mode==='simulation')?'simulation':'practice');return;
    }
    if(id==='recenter'){this.panel.recenter(this.r.getUserCamera(),Boolean(this.session));return;}
    if(id==='pause'){this.conductor?.pause();return;}
    if(id==='resume'){this.conductor?.resume(now);return;}
    if(id==='stop'){this.conductor?.stop();this.stopDemo();this.adapter.releaseAll();this.adapter.stopSound();await this.enterPlay();this.screen='tutorial';this.render(now);return;}
    if(id==='demo'){this.demonstrate(now);return;}
    if(id==='swap'){this.adapter.stickHand=1-this.adapter.stickHand;this.uiFeedback=`Use your ${this.adapter.stickHand?'right':'left'} hand for the stick, the other hand for chords.`;this.render(now);return;}
    if(id==='retry'){this.retry(now);return;}
    if(!this.session) {
      if(id==='free-honk')this.r.beginPendingSpawnPlacement(this.r.getRightController(),'honk');
      if(id==='place')this.adapter.place();
      return;
    }
    const step=this.session.step;
    if(id==='select') {this.adapter.select(step,controller||this.r.getRightController(),'learner');}
    else if(id==='place')this.adapter.place();
    else if(id==='cancel')this.r.deletePendingSpawnPlacement();
    else if(id==='count-in') {
      if(step.type==='record'&&!this.adapter.get(step.looperRole)?.transport.recordArmed){this.uiFeedback='Press Record first to arm the take.';return;}
      const phrase=['phrase','performance'].includes(step.type);
      if(phrase && !this.adapter.snapshot(now).aligned) {this.uiFeedback='Use Start All to align both recorded parts, then Count in.';return;}
      const accompany=step.type==='record' && step.looperRole==='percussionLooper' && this.adapter.get('chordLooper')?.transport.playing;
      const anchor=this.adapter.nextBoundary(now,phrase || accompany?16:1,4);
      if(anchor!==null)this.session.startCountIn(anchor,this.adapter.get('metronome').getBeatTiming(now).beatIntervalMs);else this.uiFeedback='Start the Metronome before counting in.';
    } else this.adapter.command(id,now,'learner');
    this.lastDraw=-Infinity;
  }
  async enter(mode) {
    this.flow.cancelOutgoing();this.flow.pending=null;
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
    this.flow.cancelOutgoing();this.flow.pending=null;
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
        else if(now-ds.enteredAt>limit)this.flow.stopDemo(false,`${ds.step.title} could not complete. Choose Prepare, then Demonstrate again.`);
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
    this.cues.update(this.demo?.session||this.session,now,{active:!this.flow.preparing&&!this.conductor?.paused&&this.session?.phase!=='results'});
    this.panel.animate?.(now);
    if(now-this.lastDraw>=100&&(this.session||this.lastPendingPreview!==this.r.pendingSpawnPlacement)){
      this.render(now);this.lastDraw=now;this.lastPendingPreview=this.r.pendingSpawnPlacement;
    }
    if(this.panel.xr) {
      const hit=this.r.controllers.filter(c=>!c.userData.virtualTutorial).map(c=>this.panelHit(c)).find(hit=>hit?.object.userData.action);
      this.panel.hover(hit?.object);
    }
  }
  blocksController(controller) {return Boolean(this.busy || ((this.session?.mode==='simulation'||this.demo||this.flow.preparing)&&!controller.userData.virtualTutorial));}
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
    const b=(id,label,disabled=false)=>({id,label,disabled});
    let model;
    if(this.screen==='launch') model={title:'Honk Orchestra',instruction:'Play freely, or learn to build and perform an original composition with guided practice.',actions:[b('play','Play'),b('tutorial','Tutorial')]};
    else if(this.screen==='tutorial') model={title:C.title,instruction:'An original Jog-inspired study. Build a 16-beat accompaniment, then learn the melody and descending glides. Simulation uses visible virtual hands and the same instruments.',feedback:'Enable sound with the button below. Simulation records two separate takes and performs the whole piece; allow several minutes. Practice includes individual drills.',actions:[b('practice','Start Practice'),b('simulate','Simulate Composition'),b('back','Back')]};
    else if(this.screen==='play') model={title:'Free play',instruction:'In XR: hold A to choose an instrument; roll and pull to choose an item. Release A to preview; Trigger places. Aim at the yellow sphere and squeeze. Grip in empty space equips a stick.',actions:[b('tutorial','Tutorial'),b('free-honk','Spawn Honk'),...(this.r.pendingSpawnPlacement?[b('place','Place')]:[])]};
    else if(this.session?.complete) model={title:'Study complete',instruction:'VIRAG 2 · A, B, A, C, B, D.',feedback:this.report?.durationSeconds?`Simulation: ${this.report.durationSeconds.toFixed(1)} seconds.`:`${[...this.session.outcomes.values()].filter(o=>o.status==='passed').length} passed · ${[...this.session.outcomes.values()].filter(o=>o.status==='assisted').length} assisted · ${[...this.session.outcomes.values()].filter(o=>o.status==='skipped').length} skipped.`,navigation:this.session.mode==='practice'?[b('previous-step','Previous Step'),b('next-step','Next Step',true),b('step-demo','Demonstrate',true),b('step-practice','Practice',true)]:undefined,actions:[b('retry-composition','Restart Lesson'),b('return-play','Return to Play')]};
    else if(this.session) {
      const s=this.session,shown=this.demo?.session||s,step=shown.step;let target='';
      if(step.timed&&shown.anchorMs!==null&&s.phase!=='results') {
        const beat=(now-shown.anchorMs)/shown.beatMs;
        if(beat<0)target=`Count in: ${Math.ceil(-beat)} · start at the clock boundary`;
        else {
          const phraseIndex=Math.min(5,Math.floor(beat/16));
          target=`Beat ${Math.min(step.beats,Math.floor(beat)+1)} / ${step.beats}${step.type==='performance'?` · Phrase ${C.order[phraseIndex]} (${phraseIndex+1}/6)`:''}`;
          const next=scoreForStep(step).find(e=>e.beat+(e.beats??.4)>beat);
          if(next?.pitch)target+=`\n${describeNote(next)}`;
          else if(next?.role)target+=`\n${next.label||({percussion:'Honk · boink',metronome:'Metronome · wood',percussionLooper:'Looper · hihat'}[next.role])||next.role}${next.notes?`: ${next.notes}`:''}`;
        }
      } else if(step.midis)target=step.role+(step.bend?' · Eb4 → C4':'');
      this.panel.setTransport(target);
      const simulation=s.mode==='simulation';
      let actions=[];
      if(simulation) actions=[b(this.conductor?.paused?'resume':'pause',this.conductor?.paused?'Resume':'Pause'),...(s.failed?[b('retry','Retry take / phrase')]:[]),b('restart','Restart'),b('stop','Stop')];
      else {
        if(this.demo)actions.push(b('stop-demo','Stop Demonstration'));
        else if(this.flow.preparing)actions.push(b('cancel-preparation','Cancel Preparation'));
        else {
          if(s.step.type==='spawn'){
            const reason=this.flow.spawnUnavailable();actions.push({...b('spawn-step','Spawn',Boolean(reason)),reason});
          }
          if(s.step.action&&!['record','ack'].includes(s.step.type))actions.push(b(s.step.action,s.step.actionLabel||s.step.action));
          const missing=this.flow.pending?.missing||[];
          if(missing.includes('chordLooper')||s.step.looperRole==='chordLooper'&&s.step.type==='record')actions.push(b('record-backing','Record Backing'));
          if(missing.includes('percussionLooper')||s.step.looperRole==='percussionLooper'&&s.step.type==='record')actions.push(b('record-percussion','Record Percussion'));
          if(s.phase==='practicing')actions.push(b('finish-attempt','Finish Attempt'));
          actions.push(b('prepare-step','Prepare'));
          if(s.step.id!=='start-all'&&TUTORIAL_LOOPERS.every(l=>this.adapter.get(l.role)?.timeline.hasRecording()))actions.push(b('start-all','Start All'));
        }
      }
      actions.push(b('recenter','Recenter'),b('exit','Exit'));
      const navigation=simulation?undefined:[
        {...b('previous-step','Previous Step',s.index===0),reason:s.index===0?'This is the first step.':''},
        {...b('next-step','Next Step',this.flow.preparing),primary:s.phase==='results',reason:this.flow.preparing?'Preparation is running. Cancel it or wait.':''},
        {...b('step-demo','Demonstrate',Boolean(this.demo)||this.flow.preparing),primary:s.phase==='ready'&&!s.demonstrated.has(s.step.id),reason:this.demo?'Stop the current demonstration first.':''},
        {...b('step-practice',s.phase==='results'?'Practice Again':'Practice',Boolean(this.demo)||this.flow.preparing),primary:s.phase==='ready'&&s.demonstrated.has(s.step.id),reason:this.demo?'Practice becomes available after the demonstration.':''},
      ];
      let feedback=this.uiFeedback||s.feedback||(simulation?'':'Demonstrate, then Practice. Next prepares any missing prerequisites.');
      if(s.result){
        const names={targets:'Targets',timing:'Onsets',holdRelease:'Hold/release',bend:'Bend'};
        const scores=s.result.components?Object.entries(s.result.components).map(([key,value])=>`${names[key]} ${value}`).join(' · '):'';
        feedback=`${s.result.score===undefined?s.result.assisted?'Setup ready · assisted':s.result.ok?'Completed':'Try again':`${s.result.score}/100${s.result.ok?' · Well played':''}`}\n${scores}${scores?'\n':''}${s.result.message}`;
        const mismatch=s.result.details?.find(d=>d.heard==='missing'||d.extra||d.correct===false);
        const name=role=>C.backing.find(g=>g.role===role)?.label||role?.replace('melody-','')||'rest';
        if(mismatch)feedback+=`\nExpected ${name(mismatch.expected)}; heard ${name(mismatch.heard)}.`;
        else {
          const timing=s.result.details?.find(d=>d.onsetErrorBeats>.12||d.holdErrorBeats>.175);
          if(timing)feedback+=step.timed?`\n${name(timing.expected)}: expected beat ${(timing.beat+1).toFixed(1)}, heard ${(timing.heardBeat+1).toFixed(1)}${Number.isFinite(timing.expectedHold)?`; hold ${timing.expectedHold} beats, heard ${timing.heardHold.toFixed(1)}`:''}.`:`\nExpected a ${Math.round(timing.expectedHold)} ms hold; heard ${Math.round(timing.heardHold)} ms.`;
        }
      }
      if(TUTORIAL_LOOPERS.every(l=>this.adapter.get(l.role)?.looperData.playArmed))feedback='Starting both on the next beat';
      model={title:step.title,instruction:step.instruction,navigation,actions,feedback,result:s.phase==='results'?(s.result?.ok?'passed':'retry'):null,
        progress:`${simulation?'Simulation':this.demo?'Demonstration':'Lesson'} · ${s.index+1}/${s.steps.length}${s.phase==='practicing'?` · Attempt ${s.attempt}`:s.phase==='results'?' · Results':''}`};
    }
    if(model) {
      if(!this.session?.step)this.panel.setTransport('');
      if(this.uiFeedback && !this.session) model.feedback=this.uiFeedback;
      this.panel.render({visible:true,...model});
    }
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;this.conductor?.stop();this.stopDemo();
    this.flow.cancelOutgoing();document.removeEventListener('visibilitychange',this.onVisibility);this.cues.dispose();this.adapter.dispose();this.panel?.dispose();
  }
}
