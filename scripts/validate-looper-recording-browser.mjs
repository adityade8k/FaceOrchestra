// Real learner controller rays, physical Looper buttons and Web Audio signal.
// No expected score events or timelines are injected into either recorder.
export async function validateRecordingPreservation(app,controller){
  const THREE=await import('three');
  const {LESSON_STEPS}=await import('../src/tutorial/lessonSteps.js');
  const r=app.runtime,t=r.tutorial,a=t.adapter,chords=a.get('chordLooper'),other=a.get('percussionLooper'),metro=a.get('metronome');
  const checks=[],report={checks,takes:[],audio:[],headsetTested:false,acousticListeningTested:false};
  const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(predicate,message,timeout=25000)=>{const end=performance.now()+timeout;while(!predicate()){if(performance.now()>end)throw new Error(message+': '+t.uiFeedback+' / '+t.session.feedback);await delay(15);}};
  const send=(button,pressed)=>r.interactionCoordinator.receiveInput({type:'button.transition',controller,button,pressed,timestamp:performance.now()});
  const away=()=>{controller.position.set(5,3,3);controller.quaternion.identity();controller.updateMatrixWorld(true);};
  const click=async id=>{t.render(performance.now());const b=t.panel.buttonNodes.get(id);check(b&&!b.disabled,id+' available');b.click();await delay(100);};
  const go=async id=>{
    const target=LESSON_STEPS.findIndex(step=>step.id===id);
    while(t.session.index!==target){
      const before=t.session.index;
      if(before<target&&['stick','unequip'].includes(t.session.step.type)){
        const stickHand=r.controllers.find(c=>!c.userData.virtualTutorial&&c!==controller);
        stickHand.position.set(6,3,3);stickHand.quaternion.identity();stickHand.updateMatrixWorld(true);
        r.interactionCoordinator.receiveInput({type:'button.transition',controller:stickHand,button:'grip',pressed:t.session.step.type==='stick',timestamp:performance.now()});
        await wait(()=>t.session.phase==='results'&&t.session.result.ok,'stick setup');
      }
      await click(before>target?'previous-step':'next-step');check(t.session.index!==before,'Navigation progresses');
    }
  };
  const point=target=>{
    const center=target.getWorldPosition(new THREE.Vector3());
    for(const offset of [[0,0,.3],[0,.15,.3],[.15,0,.3],[-.15,0,.3],[0,-.15,.3]]){
      controller.position.copy(center).add(new THREE.Vector3(...offset));
      controller.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(controller.position,center,new THREE.Vector3(0,1,0)));
      controller.updateMatrixWorld(true);if(r.getCurrentHit(controller)?.object===target)return;
    }
    throw new Error('Physical ray cannot reach '+target.name);
  };
  const button=async(looper,action)=>{point(looper.hitTargets[`HIT_looper_${action}`]);send('trigger',true);send('trigger',false);away();await delay(60);};
  const perform=async(role,ms=620)=>{
    const h=a.get(role);point(h.squeezeCollider);send('trigger',true);
    await delay(180);
    const start=performance.now();
    while(performance.now()-start<ms-180){controller.rotation.z=.55*(performance.now()-start)/(ms-180);controller.updateMatrixWorld(true);await delay(16);}
    send('trigger',false);away();await delay(70);
  };
  const json=looper=>JSON.stringify(looper.timeline.toJSON());
  const context=r.audioSystem.audioContextService.context,analyser=context.createAnalyser();analyser.fftSize=2048;
  r.audioSystem.masterBus.output.connect(analyser);const samples=new Float32Array(analyser.fftSize);
  const scheduled=[],finalizations=[];
  const lc=chords.looperController,originalStart=lc.adapter.startActionVoice,originalStop=lc.stopRecording;
  lc.adapter.startActionVoice=(voice,honk,options)=>{scheduled.push({voice,honk,time:options?.scheduledTime});return originalStart(voice,honk,options);};
  lc.stopRecording=function(h,now){const active=h.transport.recording;const result=originalStop.call(this,h,now);if(active)finalizations.push({id:h.id,now});return result;};
  const play=async label=>{
    await delay(400);scheduled.length=0;await button(chords,'play');
    await wait(()=>chords.transport.playing,'physical Play launches');
    let peak=0;const end=performance.now()+1800;
    while(performance.now()<end){analyser.getFloatTimeDomainData(samples);peak=Math.max(peak,Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length));await delay(16);}
    check(scheduled.length>=3,label+': retained chord schedules actual voices');
    check(peak>1e-5,label+': physical Play produces Web Audio signal with clock muted');
    report.audio.push({label,peakRms:peak,scheduled:[...scheduled]});await button(chords,'stop');
  };
  try{
    a.releaseAll();chords.stop();other.stop();metro.setBpm(80);metro.play();metro.setVolume(0);
    await go('record-chords');
    // Give the other instrument a real manual take to protect throughout.
    await button(other,'record');await perform('percussion',400);await button(other,'stop');
    check(other.timeline.hasRecording(),'Other Looper contains a real manually recorded take');
    const otherBefore=json(other);
    await button(chords,'stop');check(!chords.timeline.hasRecording(),'Empty initial learner Looper');
    for(const prior of [false,true]){
      globalThis.tutorialTestProgress?.(JSON.stringify({step:prior?"imperfect prior take":"imperfect empty take",seconds:Math.round(performance.now()/1000)}));
      await go('record-chords');const before=finalizations.length;
      await click('step-practice');check(chords.transport.recordArmed,'Practice arms the actual intended Looper');
      await wait(()=>performance.now()>=t.session.anchorMs+180,'count-in');await perform('group-1');
      await wait(()=>t.session.phase==='results','low-score result');
      check(!t.session.result.ok&&t.session.result.score<70,'Incomplete real performance receives a low score');
      check(chords.timeline.hasRecording()&&!chords.transport.recording,'Low score leaves a finalized real recording');
      check(finalizations.length===before+1,'Capture finalized once before results');
      const saved=json(chords);
      check(JSON.stringify(a.snapshot(performance.now()).loopers.chordLooper.timeline)===saved,'Cached tutorial take reflects the finalized physical take');
      const track=chords.timeline.getActiveTracks()[0],end=track.gateEvents.at(-1).timeMs;
      check(chords.timeline.lengthMode==='fixed-window'&&chords.timeline.fixedWindowBeats===16&&chords.timeline.durationMs===16*chords.timeline.sourceBeatIntervalMs,'Automatic take retains the complete 16-beat window');
      check(end<1500,'Incomplete learner hold remains short inside the full window');
      report.takes.push({prior,score:t.session.result.score,timeline:chords.timeline.toJSON()});
      await play(prior?'prior take replaced':'initial empty take');
      await click('next-step');check(json(chords)===saved,'Next preserves the low-scoring take');
      check(json(other)===otherBefore,'Other Looper remains byte-for-byte unchanged');
    }
    await go('record-chords');let saved=json(chords);
    await click('step-practice');await click('step-practice');
    check(json(chords)===saved,'Cancelling armed Practice before sound retains prior take');
    await click('step-practice');await perform('group-1',430);await click('step-practice');
    check(chords.timeline.hasRecording()&&!chords.transport.recording&&json(chords)!==saved,'Cancelling a partial Practice finalizes its new take');
    saved=json(chords);await click('next-step');check(json(chords)===saved,'Partial take survives Next');
    await go('learn-C4');
    for(const waitAfter of [0,2000,10000]){
      globalThis.tutorialTestProgress?.(JSON.stringify({step:"manual delayed Stop "+waitAfter,seconds:Math.round(performance.now()/1000)}));
      await button(chords,'record');await perform('group-1');
      const start=chords.timeline.startedAtMs;
      const firstOnset=chords.timeline.getMusicalOnsetTimes()[0];
      const beforeStop=chords.timeline.getActiveTracks()[0].events.filter(e=>e.type==='squeezeEnd').at(-1)?.timeMs;
      await delay(waitAfter);await button(chords,'stop');
      check(Math.abs(chords.timeline.durationMs-(beforeStop-firstOnset))<1,'Manual delayed Stop keeps the actual release endpoint ('+waitAfter+' ms)');
      check(chords.timeline.getMusicalOnsetTimes()[0]===0,'Manual take begins on its actual onset');
      report.takes.push({manual:true,waitAfter,start,timeline:chords.timeline.toJSON()});
    }
    saved=json(chords);await click('next-step');await click('previous-step');
    check(json(chords)===saved,'Manual recording without Practice survives tutorial navigation');await play('manual without Practice');
    await go('record-chords');saved=json(chords);await click('step-demo');
    await wait(()=>chords.transport.recording,'demo capture');await click('step-demo');
    check(json(chords)===saved,'Demonstrate restores its own temporary recording');
    await click('step-demo');await wait(()=>chords.transport.recording,'second demo capture');
    // A real physical Record supersedes the demo operation before its cleanup.
    await button(chords,'record');await wait(()=>!t.demo,'demo ownership invalidation');
    check(chords.transport.recordArmed,'Demo cleanup retains newer learner Record request');
    await perform('group-1',430);await button(chords,'stop');saved=json(chords);
    await delay(700);check(json(chords)===saved,'Late demo cleanup never replaces newer learner capture');
    check(json(other)===otherBefore,'All Practice/demo/manual transitions preserve the other take');
    await play('manual after interrupted demonstration');
    return report;
  }finally{
    lc.adapter.startActionVoice=originalStart;lc.stopRecording=originalStop;
    r.audioSystem.masterBus.output.disconnect(analyser);analyser.disconnect();a.releaseAll();chords.stop();other.stop();
  }
}

export async function validateStandalone(app){
  const setup=await (await import('./validate-tutorial-radial-browser.mjs')).validateLearnerFlow(app);
  try{
    const recordings=await validateRecordingPreservation(app,setup.controller);
    const beatFeatures=await (await import('./validate-beat-window-browser.mjs')).validateBeatFeatures(app,setup.controller);
    const freePlayTransition=await validateFreePlayRecording(app);
    return {radial:setup.checks,recordings,beatFeatures,freePlayTransition};
  }
  finally{setup.restoreControllers();await app.runtime.tutorial.enterPlay();}
}

export async function validateFreePlayRecording(app){
  const THREE=await import('three'),r=app.runtime,t=r.tutorial;
  await t.enterPlay();await r.audioSystem.ensureAudio();
  const c=r.controllers.find(c=>!c.userData.virtualTutorial),saved={auto:c.matrixAutoUpdate,position:c.position.clone(),quaternion:c.quaternion.clone()};
  c.matrixAutoUpdate=true;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const send=pressed=>r.interactionCoordinator.receiveInput({type:'button.transition',controller:c,button:'trigger',pressed,timestamp:performance.now()});
  const point=target=>{const center=target.getWorldPosition(new THREE.Vector3());c.position.copy(center).add(new THREE.Vector3(0,0,.35));c.quaternion.identity();c.updateMatrixWorld(true);if(r.getCurrentHit(c)?.object!==target)throw new Error('Free-play physical target blocked: '+target.name);};
  const press=target=>{point(target);send(true);send(false);c.position.set(5,3,3);c.updateMatrixWorld(true);};
  let honkId,looperId;
  try{
    r.createSpawnedComponent('honk');const honk=r.activeInstrumentState;honkId=honk.id;honk.root.position.set(-.6,1.2,-.8);
    r.createSpawnedComponent('looper');const looper=r.activeInstrumentState;looperId=looper.id;looper.root.position.set(.6,1.2,-.8);
    r.connectLooperTrackToHonk(looper,0,honk.id);await delay(150);
    press(looper.hitTargets.HIT_looper_record);point(honk.squeezeCollider);send(true);await delay(600);
    const origin=looper.timeline.startedAtMs;
    // Entering the tutorial while held must finalize before the free-play
    // snapshot is taken and before controller cleanup resets the bend.
    await t.enter('practice');send(false);
    const serialized=t.freePlayScene.instruments.find(h=>h.id===looperId);
    const data=JSON.stringify(serialized);
    if(!data.includes('squeezeEnd'))throw new Error('Transition did not capture the held note release');
    await t.enterPlay();
    const restored=r.instrumentRegistry.get(looperId),timeline=restored.timeline;
    if(!timeline.hasRecording()||timeline.durationMs<500)throw new Error('Free-play take lost across tutorial mode transition');
    const before=JSON.stringify(timeline.toJSON());
    const events=[];const adapter=restored.looperController.adapter,original=adapter.startActionVoice;
    adapter.startActionVoice=(voice,honk,options)=>{events.push({voice,scheduledTime:options.scheduledTime});return original(voice,honk,options);};
    try{press(restored.hitTargets.HIT_looper_play);await delay(1800);press(restored.hitTargets.HIT_looper_stop);}finally{adapter.startActionVoice=original;}
    if(!events.length||JSON.stringify(timeline.toJSON())!==before)throw new Error('Restored free-play take cannot play unchanged');
    return {heldCaptureFinalized:true,origin,durationMs:timeline.durationMs,sourceBeatIntervalMs:timeline.sourceBeatIntervalMs,restored:true,physicalPlayEvents:events};
  }finally{
    send(false);for(const id of [honkId,looperId]){const h=r.instrumentRegistry.get(id);if(h)r.deleteInstrument(h);}
    c.matrixAutoUpdate=saved.auto;c.position.copy(saved.position);c.quaternion.copy(saved.quaternion);c.updateMatrixWorld(true);
  }
}
