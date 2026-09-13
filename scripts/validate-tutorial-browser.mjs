// Run in a dedicated browser profile. Exercises the application's only runtime.
// No mocked assets, synthetic timeline events, collision overrides or validator overrides.
export async function validate(app, { timeoutMs = 480000, onProgress = () => {} } = {}) {
  const r=app.runtime,t=r.tutorial;
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const wait=async(predicate,message,timeout=timeoutMs)=>{
    const end=performance.now()+timeout;
    while(!predicate()) {
      if(performance.now()>end)throw new Error(`Timed out: ${message}; ${t.session?.step?.id}: ${t.session?.feedback}`);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  };
  const click=async(id)=>{
    await wait(()=>Boolean(t.panel.dom.querySelector(`button[data-action="${id}"]`)),`button ${id}`,10000);
    t.panel.dom.querySelector(`button[data-action="${id}"]`).click();
    await new Promise(resolve=>setTimeout(resolve,150));
  };
  const initialStorage=r.persistenceStore.storage?.getItem(r.persistenceStore.key);
  let unsubscribe=null;
  try {
    await wait(()=>app.initialized,'assets ready');
    await click('play');check(r.sessionMode==='play','Launch Play opens free play');
    r.createSpawnedComponent('honk',{tuning:{semitonesFromF:2,octaveOffset:-1}});
    const seed=r.activeInstrumentState;seed.root.position.set(-0.7,1.1,0.3);seed.setVowel('E');
    r.savePersistedSceneOnXRExit();
    const saved=r.persistenceStore.storage.getItem(r.persistenceStore.key);
    const freeScene=JSON.stringify(r.sceneSerializer.serialize().instruments);
    const recordedStrikes=[];
    unsubscribe=r.stickCollisionSystem.subscribe((event,{target})=>{
      const looper=t.adapter.get('percussionLooper');
      if(looper?.transport.recording)recordedStrikes.push({kind:target.kind,timeMs:event.timestamp,type:event.percussionType});
    });
    await click('tutorial');await click('simulate');
    const started=performance.now();let last='';
    await wait(()=>{
      const s=t.session;
      if(s?.step?.id!==last){last=s?.step?.id;onProgress({step:last,seconds:Math.round((performance.now()-started)/1000)});}
      if(s?.failed)throw new Error(`Simulation rejected: ${s.step.id}: ${s.feedback}`);
      if(t.conductor?.paused)throw new Error(`Simulation paused: ${s?.feedback}`);
      return s?.complete;
    },'complete simulation');
    check(t.report.takes.chordLooper.durationMs===12000,'Chord backing is 12 seconds');
    check(t.report.takes.percussionLooper.durationMs===12000,'Percussion backing is 12 seconds');
    check(t.report.takes.chordLooper.tracks.every(track=>track.events.every(e=>e.type!=='drumHit')),'Chord take has no percussion');
    check(t.report.takes.percussionLooper.tracks.every(track=>track.events.every(e=>!['squeezeStart','squeezeEnd'].includes(e.type))),'Percussion take has no pitched gates');
    check(r.instrumentRegistry.getByKind('metronome').length===1,'Only one active metronome');
    check(t.report.startAll.ok && t.report.launches.chordLooper.some(l=>l.beat===t.report.startAll.targetBeat) && t.report.launches.percussionLooper.some(l=>l.beat===t.report.startAll.targetBeat),'Start All launches the same beat');
    check(t.report.alignment.phaseDifference<1e-7,'Both takes have matching musical phase');
    check(t.report.takes.chordLooper.gapBeats===0,'Recorded backing has zero added gap');
    const counts={honk:0,looper:0,metronome:0};for(const hit of recordedStrikes)counts[hit.kind]++;
    check(Object.values(counts).every(count=>count===4),`Expected four strikes of each kind: ${JSON.stringify(counts)}`);
    check(t.report.liveTakes.percussionLooper.filter(e=>e.kind==='strike'&&e.recordedCount===1).length===12,'All 12 collisions traversed normal recording routes');
    check(t.report.liveTakes.chordLooper.filter(e=>e.kind==='note'&&e.voiced&&e.midis.length===3).length===4,'All four live chords sounded through contact membership');
    check(t.report.phrasesPassed.join(',')==='A,B,A,C,B,D','All continuous phrases passed');
    check(t.practiceProgress===null,'Simulation did not grant practice credit');
    check(r.audioSystem.honkVoices.voices.size===0,'Completion releases Honk voices');
    check(!t.adapter.get('metronome').playing&&!t.adapter.get('percussionLooper').transport.playing && !t.adapter.get('chordLooper').transport.playing,'Final rest stops the clock and backing');
    const realTake=structuredClone(t.report.takes.chordLooper);
    const takes=Object.fromEntries(Object.entries(t.report.takes).map(([role,take])=>[role,{
      durationMs:take.durationMs,gapBeats:take.gapBeats,timingMode:take.timingMode,
      sourceBeatIntervalMs:take.sourceBeatIntervalMs,
      pitchedOnsets:take.tracks.flatMap(track=>track.events).filter(e=>e.type==='squeezeStart').length,
      percussionHits:take.tracks.flatMap(track=>track.events).filter(e=>e.type==='drumHit').length,
    }]));
    const simulationReport={...t.report,liveTakes:undefined,takes,counts};
    onProgress({step:'recording demonstrations',seconds:Math.round((performance.now()-started)/1000)});
    const recordingDemonstrations=await validateRecordingDemonstrations(app);
    onProgress({step:'clock, audio and grip checks',seconds:Math.round((performance.now()-started)/1000)});
    const clockAndShake=await validateClockAndShake(app);
    await click('return-play');
    check(r.persistenceStore.storage.getItem(r.persistenceStore.key)===saved,'Lesson never overwrote saved free play');
    check(JSON.stringify(r.sceneSerializer.serialize().instruments)===freeScene,'Returning to Play restored the exact free-play instruments');
    check(r.instrumentRegistry.size===1,'Lesson objects removed');
    check(!t.adapter.virtuals.some(c=>r.controllerStates.get(c).trigger||r.isControllerStickActive(c)),'No held virtual input');
    await click('tutorial');await click('practice');await click('begin');
    await wait(()=>t.session.step.id==='metronome','first practice action');
    const index=t.session.index;
    // A real unrelated Honk and a real held gesture must not place a Metronome.
    r.createSpawnedComponent('honk');const unrelated=r.activeInstrumentState;
    unrelated.root.position.set(0,1.1,0.4);const controller=r.controllers[0];controller.matrixAutoUpdate=true;
    controller.position.copy(unrelated.getSqueezeColliderSphere().center);controller.position.z+=0.4;controller.quaternion.identity();controller.updateMatrixWorld(true);
    t.adapter.input(controller,'trigger',true);await new Promise(resolve=>setTimeout(resolve,600));t.adapter.input(controller,'trigger',false);
    await click('demo');await new Promise(resolve=>setTimeout(resolve,700));
    check(t.session.index===index,'Wrong action and demonstration did not advance practice');
    r.deleteInstrument(unrelated);
    // Perform setup through the same panel commands and preview placement lifecycle.
    const placementController=r.getRightController();placementController.matrixAutoUpdate=true;
    while(t.session.step.id!=='audition-E') {
      const step=t.session.step, oldIndex=t.session.index;
      if(step.type==='spawn') {
        placementController.position.copy(t.adapter.positionFor(step.role));placementController.position.z+=1.5;
        placementController.quaternion.identity();placementController.updateMatrixWorld(true);
        await click('select');await click('place');
      } else await click(step.action);
      await wait(()=>t.session.index!==oldIndex,`practice setup ${step.id}`,10000);
    }
    const auditionIndex=t.session.index;
    const looper=t.adapter.get('chordLooper');
    // Restore ONLY the actual recorded take via the app's normal persistence API.
    // No insertion, quantization, editing or fabrication of any timeline event.
    looper.restoreTimeline({timeline:realTake,controls:{gap:-1,volume:-0.55}}, {preserveConnections:true});
    looper.play(performance.now());
    await wait(()=>looper.transport.playing,'actual recorded backing playback',3000);
    await new Promise(resolve=>setTimeout(resolve,2000));
    check(t.session.index===auditionIndex&&t.session.evidence.every(e=>e.kind!=='note'),'Real Looper playback earns no live-note credit');
    await click('demo');await wait(()=>!t.demo,'note demonstration',5000);
    check(t.session.index===auditionIndex,'Real demonstrated squeeze earns no learner credit');
    // Wrong and correct targets use real sphere rays and semantic Trigger transitions.
    const squeeze=async(role)=>{
      const h=t.adapter.get(role);controller.position.copy(h.getSqueezeColliderSphere().center);controller.position.z+=0.38;
      controller.quaternion.identity();controller.updateMatrixWorld(true);
      check(r.getCurrentHit(controller)?.object===h.squeezeCollider,`Real sphere selection: ${role}`);
      t.adapter.input(controller,'trigger',true);await new Promise(resolve=>setTimeout(resolve,650));t.adapter.input(controller,'trigger',false);
      await new Promise(resolve=>setTimeout(resolve,150));
    };
    await squeeze('group-2');check(t.session.index===auditionIndex,'Wrong chord does not advance note practice');
    await squeeze('group-1');check(t.session.index===auditionIndex+1,'Correct live chord hold and release advances once');
    // Real Three.js panel planes capture Trigger through release, including crossing to a Honk.
    const THREE=await import('three');
    t.panel.setXR(true,r.camera);t.panel.recenter(r.camera,true);
    const button=t.panel.buttons.find(b=>b.userData.action==='recenter');
    const target=button.getWorldPosition(new THREE.Vector3());
    const viewer=r.camera.getWorldPosition(new THREE.Vector3());
    controller.position.copy(target).addScaledVector(viewer.sub(target).normalize(),0.5);
    controller.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(controller.position,target,new THREE.Vector3(0,1,0)));
    controller.updateMatrixWorld(true);
    check(t.panelHit(controller)?.object===button,'Actual XR plane button is ray-selectable');
    t.adapter.input(controller,'trigger',true);
    check(r.controllerStates.get(controller).tutorialPanelCapture,'Panel captures the physical Trigger');
    const h=t.adapter.get('group-1');controller.position.copy(h.getSqueezeColliderSphere().center);controller.position.z+=0.38;
    controller.quaternion.identity();controller.updateMatrixWorld(true);
    await new Promise(resolve=>setTimeout(resolve,250));
    check(!r.controllerStates.get(controller).raySqueezeInstrumentState&&h.hornHolders.size===0,'Crossing from UI to instrument cannot squeeze behind the panel');
    t.adapter.input(controller,'trigger',false);check(!r.controllerStates.get(controller).tutorialPanelCapture,'Panel capture clears on release');
    t.panel.setXR(false);

    await click('exit');
    check(r.persistenceStore.storage.getItem(r.persistenceStore.key)===saved,'Practice did not change saved free play');
    check(JSON.stringify(r.sceneSerializer.serialize().instruments)===freeScene,'Practice cleanup restored the scene');
    // Repeated mode transitions exercise listener/resource ownership and idempotent cleanup.
    const listenerCount=r.instrumentRegistry.listeners.size;
    for(let i=0;i<2;i++) {await t.enter('practice');await t.enter('simulation');await t.enterPlay();}
    check(r.instrumentRegistry.listeners.size===listenerCount,'Mode transitions did not leak registry listeners');
    check(r.instrumentRegistry.size===1,'Repeated transitions leave only free-play objects');
    const allChordMembersRelease=await validateChordRelease(app);
    return {simulation:simulationReport,recordingDemonstrations,clockAndShake,allChordMembersRelease,launchChoices:true,wrongActionRejected:true,evidenceOriginsIsolated:true,
      persistenceUnchanged:true,repeatedCleanup:true,xrPlaneCapture:true,sound:'Web Audio state verified; sound not monitored',headset:'unverified'};
  } finally {
    unsubscribe?.();
    if(t.session)await t.enterPlay();
    // Test owns this dedicated browser profile's saved fixture.
    if(initialStorage===null)r.persistenceStore.storage?.removeItem(r.persistenceStore.key);
    else if(initialStorage!==undefined)r.persistenceStore.storage?.setItem(r.persistenceStore.key,initialStorage);
  }
}

// An isolated practice step exercises Demonstrate against the genuine simulation
// takes. No checkpoint or learner success is supplied by this fixture.
async function validateRecordingDemonstrations(app) {
  const r=app.runtime,t=r.tutorial,a=t.adapter;
  const {TutorialSession}=await import('../src/tutorial/TutorialSession.js');
  const {LESSON_STEPS}=await import('../src/tutorial/lessonSteps.js');
  const originalSession=t.session,originalConductor=t.conductor;
  const roles=['chordLooper','percussionLooper'];
  const before=roles.map(role=>JSON.stringify(a.get(role).timeline.toJSON()));
  const results={};
  try {
    t.conductor=null;a.get('metronome').play(performance.now());
    for(const role of roles) {
      t.session=new TutorialSession({mode:'practice',now:performance.now(),
        steps:LESSON_STEPS.filter(step=>step.looperRole===role&&['record','finalize','playback'].includes(step.type))});
      t.render(performance.now());
      t.panel.dom.querySelector('button[data-action="demo"]').click();
      await new Promise(resolve=>setTimeout(resolve,150));
      const demo=t.demo;
      if(!demo)throw new Error(`Recording demonstration did not start for ${role}`);
      const end=performance.now()+60000;
      while(t.demo&&performance.now()<end)await new Promise(resolve=>setTimeout(resolve,100));
      if(t.demo||!demo.session.complete)throw new Error(`Recording demonstration failed for ${role}: ${demo.session.feedback}`);
      if(t.session.index!==0||t.session.checkpoints.size||t.session.evidence.length)
        throw new Error('Recording demonstration granted learner credit');
      if(!roles.every((key,i)=>JSON.stringify(a.get(key).timeline.toJSON())===before[i]))
        throw new Error('Recording demonstration changed an existing learner take');
      results[role]={complete:true,learnerCredit:false,takesRestored:true,
        realEvents:demo.session.takeEvidence[role].filter(e=>e.kind==='note'||e.kind==='strike').length};
    }
    return results;
  } finally {
    t.stopDemo();a.stopSound();t.session=originalSession;t.conductor=originalConductor;
    a.setVirtualsActive(originalSession?.mode==='simulation',originalSession?.origin);
  }
}

// Additional real-controller regression: a second hand can still own a chord
// after the first releases. Only the final release is eligible for credit.
export async function validateChordRelease(app) {
  const r=app.runtime,t=r.tutorial;
  await t.enter('practice');await r.audioSystem.ensureAudio();
  try {
    const members=[];
    for(let i=0;i<3;i++) {
      r.createSpawnedComponent('honk');const h=r.activeInstrumentState;
      h.root.position.set(i*h.getSqueezeColliderSphere().radius*1.4,1.1,0.4);members.push(h);
    }
    await new Promise(resolve=>setTimeout(resolve,150));
    const controllers=r.controllers.filter(c=>!c.userData.virtualTutorial).slice(0,2);
    for(const c of controllers) {
      c.matrixAutoUpdate=true;c.position.copy(members[0].getSqueezeColliderSphere().center);c.position.z+=0.4;
      c.quaternion.identity();c.updateMatrixWorld(true);t.adapter.input(c,'trigger',true);
    }
    await new Promise(resolve=>setTimeout(resolve,600));
    t.adapter.input(controllers[0],'trigger',false);await new Promise(resolve=>setTimeout(resolve,100));
    if(t.session.evidence.filter(e=>e.kind==='note').at(-1)?.allReleased!==false)
      throw new Error('The other hand still owns the chord; it is not fully released.');
    t.adapter.input(controllers[1],'trigger',false);await new Promise(resolve=>setTimeout(resolve,100));
    if(t.session.evidence.filter(e=>e.kind==='note').at(-1)?.allReleased!==true)
      throw new Error('Both hands released must release every chord member.');
    return true;
  } finally { await t.enterPlay(); }
}

// Reuses only the real takes just produced by the conductor. Grip rays, motion,
// singleton rejection and Web Audio all run in the normal application runtime.
async function validateClockAndShake(app) {
  const r=app.runtime,t=r.tutorial,a=t.adapter;
  const check=(v,m)=>{if(!v)throw new Error(m);};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const chords=a.get('chordLooper'),percussion=a.get('percussionLooper'),metro=a.get('metronome');
  const takes=[chords,percussion].map(l=>JSON.stringify(l.timeline.toJSON()));
  const size=r.instrumentRegistry.size,children=r.scene.children.length;
  check(r.createSpawnedComponent('metronome')===null,'Runtime second clock rejected');
  check(r.instrumentFactory.create({kind:'metronome'})===null,'Factory second clock rejected before allocation');
  r.beginPendingSpawnPlacement(a.virtuals[0],'metronome');
  check(!r.pendingSpawnPlacement&&r.instrumentRegistry.size===size&&r.scene.children.length===children,'Rejected preview leaves no geometry or registry entry');

  const context=r.audioSystem.audioContextService.context,analyser=context.createAnalyser();
  analyser.fftSize=1024;r.audioSystem.masterBus.output.connect(analyser);
  const values=new Float32Array(analyser.fftSize);
  const rms=async(ms)=>{let peak=0;const end=performance.now()+ms;while(performance.now()<end){analyser.getFloatTimeDomainData(values);peak=Math.max(peak,Math.sqrt(values.reduce((n,v)=>n+v*v,0)/values.length));await wait(16);}return peak;};
  try {
    metro.setVolume(0);metro.play(performance.now());await wait(500);
    const silentPeak=await rms(1600);check(silentPeak<1e-6,`Volume-zero click produced signal: ${silentPeak}`);
    const before=metro.getBeatTiming(performance.now()).beatPosition;
    a.command('start-all',performance.now(),'simulation');await wait(900);
    const after=metro.getBeatTiming(performance.now()).beatPosition;
    check(after>before&&a.snapshot(performance.now()).aligned,'Muted clock keeps both loops synchronized');
    const loopPeak=await rms(1800);check(loopPeak>0.0001,'Real recorded backing produces signal with automatic clicks muted');
    const last=[chords,percussion].map(l=>l.looperData.launchHistory.at(-1));
    check(Math.abs(last[0].audioOriginTime-last[1].audioOriginTime)<1e-8,'Start All shares exact Web Audio origin');
    for(const bpm of [110,80]){
      const now=performance.now(),phase=chords.looperController.getAbsoluteSourcePosition(chords,now);
      metro.setBpm(bpm);await wait(80);
      check(a.snapshot(performance.now()).aligned,'BPM change preserves synchronization');
      check(chords.looperController.getAbsoluteSourcePosition(chords,performance.now())>=phase,'BPM change never restarts the phrase');
    }
    chords.stop();percussion.stop();a.command('play-percussionLooper',performance.now(),'simulation');
    const percussionPeak=await rms(3000);check(percussionPeak>0.0001,'Recorded percussion remains audible in the Web Audio signal with muted clicks');
    percussion.stop();

    const controller=a.virtuals[0];controller.matrixAutoUpdate=true;
    const grip=role=>{
      a.releaseVirtuals();const h=a.get(role),point=a.cacheStrikeTarget(role);
      controller.position.copy(point);controller.position.z+=0.4;controller.quaternion.identity();controller.updateMatrixWorld(true);
      check(r.instrumentRegistry.getFromObject3D(r.getGripHit(controller)?.object)?.id===h.id,`Real body ray can grab ${role}`);
      a.input(controller,'grip',true);
      check(r.controllerStates.get(controller).gripSourceInstrumentState===h,`Grip resolves actual ${role} source`);
      return controller.position.clone();
    };
    const move=async(base,ms,shake=true)=>{
      const start=performance.now();while(performance.now()-start<ms){
        const elapsed=performance.now()-start;controller.position.copy(base);controller.position.x+=shake?0.11*Math.sin(elapsed/1000*Math.PI*10):elapsed/1000*0.15;
        controller.updateMatrixWorld(true);await new Promise(requestAnimationFrame);
      }
      controller.position.copy(base);controller.updateMatrixWorld(true);await wait(40);
    };
    let notices=0;const originalFeedback=r.showRuntimeFeedback;
    r.showRuntimeFeedback=function(message){if(message.startsWith('Clock disconnected')||message.startsWith('Honk disconnected'))notices++;return originalFeedback.call(this,message);};
    try {
      let base=grip('percussionLooper');await move(base,450,false);
      check(r.metronomeConnectionManager.getConnectionForTarget('looper',percussion.id),'Ordinary relocation keeps clock connected');
      // Arm a real pending restart before shaking; the disconnect must cancel it.
      percussion.play(performance.now());await move(base,650);
      check(!r.metronomeConnectionManager.getConnectionForTarget('looper',percussion.id),'Shaking Looper removes its own incoming clock');
      check(r.metronomeConnectionManager.getConnectionForTarget('looper',chords.id),'Other clock cable survives');
      check(percussion.tracks[4].connectedHonkId===a.get('percussion').id,'Looper shake retains its Honk assignment');
      check(!percussion.transport.playing&&!percussion.looperData.armed&&percussion.looperData.audioScheduling.timer===null,'Disconnect cancels transport and scheduler');
      check(percussion.looperController.getTimingForLooper(percussion,performance.now()).bpm===70,'Disconnected looper uses 70 BPM');
      check(notices===1,'One feedback indication for Looper disconnect');
      a.command('clock-percussionLooper',performance.now(),'simulation');
      // A fresh gesture immediately after the successful shake remains in cooldown.
      await move(base,160);check(notices===1,'Cooldown prevents repeated disconnect feedback');
      a.input(controller,'grip',false);await wait(750);
      const group=r.honkLockService.lockFormation(a.get('group-1').id);check(group,'Real chord formation can be frozen');
      base=grip('group-1');check(r.controllerStates.get(controller).gripInstrumentState!==a.get('group-1'),'Formation moves through its transform wrapper');
      await move(base,650);a.input(controller,'grip',false);
      check(chords.tracks[0].connectedHonkId===null&&chords.tracks[1].connectedHonkId===a.get('group-2').id,'Formation shake disconnects only grabbed source assignment');
      check(r.metronomeConnectionManager.connectionsByPort.size===2,'Honk shake preserves both metronome cables');
      check(notices===2,'One feedback indication per successful gesture');
      a.command('wire-group-1',performance.now(),'simulation');
      base=grip('metronome');await move(base,650);a.input(controller,'grip',false);
      check(notices===2&&r.metronomeConnectionManager.connectionsByPort.size===2,'Metronome shake invokes neither disconnect rule');
    } finally {r.showRuntimeFeedback=originalFeedback;a.releaseVirtuals();}
    check([chords,percussion].every((l,i)=>JSON.stringify(l.timeline.toJSON())===takes[i]),'Both actual recordings survive shake and reconnect byte-for-byte');
    return {singleton:true,selectiveRealGripShake:true,formationSource:true,cooldown:true,recordingsRetained:true,
      silentClickPeak:silentPeak,mutedClockLoopPeak:loopPeak,mutedClockPercussionPeak:percussionPeak,sharedAudioOrigin:true};
  } finally {r.audioSystem.masterBus.output.disconnect(analyser);analyser.disconnect();a.stopSound();metro.setVolume(1);}
}
