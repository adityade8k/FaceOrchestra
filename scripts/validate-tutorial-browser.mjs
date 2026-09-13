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
      const looper=t.adapter.get('looper');
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
    check(t.report.take.durationMs===12000,'Recorded backing is 12 seconds');
    check(t.report.take.gapBeats===0,'Recorded backing has zero added gap');
    const counts={honk:0,looper:0,metronome:0};for(const hit of recordedStrikes)counts[hit.kind]++;
    check(Object.values(counts).every(count=>count===4),`Expected four strikes of each kind: ${JSON.stringify(counts)}`);
    check(t.report.liveTake.filter(e=>e.kind==='strike'&&e.recordedCount===1).length===12,'All 12 collisions traversed normal recording routes');
    check(t.report.liveTake.filter(e=>e.kind==='note'&&e.voiced&&e.midis.length===3).length===4,'All four live chords sounded through contact membership');
    check(t.report.phrasesPassed.join(',')==='A,B,A,C,B,D','All continuous phrases passed');
    check(t.practiceProgress===null,'Simulation did not grant practice credit');
    check(r.audioSystem.honkVoices.voices.size===0,'Completion releases Honk voices');
    check(!t.adapter.get('metronome').playing&&!t.adapter.get('looper').transport.playing,'Final rest stops the clock and backing');
    const realTake=structuredClone(t.report.take);
    const simulationReport={...t.report,liveTake:undefined,take:undefined,counts};
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
    const looper=t.adapter.get('looper');
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
    return {simulation:simulationReport,allChordMembersRelease,launchChoices:true,wrongActionRejected:true,evidenceOriginsIsolated:true,
      persistenceUnchanged:true,repeatedCleanup:true,xrPlaneCapture:true,sound:'Web Audio state verified; sound not monitored',headset:'unverified'};
  } finally {
    unsubscribe?.();
    if(t.session)await t.enterPlay();
    // Test owns this dedicated browser profile's saved fixture.
    if(initialStorage===null)r.persistenceStore.storage?.removeItem(r.persistenceStore.key);
    else if(initialStorage!==undefined)r.persistenceStore.storage?.setItem(r.persistenceStore.key,initialStorage);
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
