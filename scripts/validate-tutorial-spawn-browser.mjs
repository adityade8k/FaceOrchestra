// TUTORIAL_TEST=spawn npm run test:tutorial:browser
// Uses the real XR panel ray, physical-controller input coordinator, preview,
// registry, lock service, grip transforms, squeeze targets and Web Audio.
export async function validateStandalone(app) {
  const THREE=await import('three');
  const {LESSON_STEPS}=await import('../src/tutorial/lessonSteps.js');
  const {COMPOSITION:C}=await import('../src/tutorial/composition.js');
  const r=app.runtime,t=r.tutorial,a=t.adapter;
  const checks=[],report={checks,chords:[],hands:['left','right'],headsetTested:false,acousticListeningTested:false};
  const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(predicate,message)=>{const end=performance.now()+10000;while(!predicate()){if(performance.now()>end)throw new Error(`${message}: ${t.uiFeedback} / ${t.session?.feedback}`);await delay(25);}};
  await wait(()=>app.initialized&&t.ready,'assets');
  const controllers=r.controllers.filter(c=>!c.userData.virtualTutorial).slice(0,2);
  check(controllers.length===2,'Two application controllers available');
  const saved=controllers.map(c=>({hand:c.userData.handedness,auto:c.matrixAutoUpdate,position:c.position.clone(),quaternion:c.quaternion.clone()}));
  const send=(controller,button,pressed)=>r.interactionCoordinator.receiveInput({type:'button.transition',controller,handedness:controller.userData.handedness,button,pressed,timestamp:performance.now()});
  const axis=(controller,axis,direction)=>r.interactionCoordinator.receiveInput({type:'axis.step',controller,axis,direction,timestamp:performance.now()});
  const away=(controller,x=0)=>{r.getUserCamera().getWorldPosition(controller.position);controller.position.add(new THREE.Vector3(x,-.3,-.1));controller.quaternion.identity();controller.updateMatrixWorld(true);};
  const fixture=async(stepId)=>{
    await t.enter('practice');t.panel.setXR(true,r.camera);t.panel.recenter(r.camera,true);
    t.session.navigate(LESSON_STEPS.findIndex(s=>s.id===stepId),performance.now());
    // Isolate the current placement attempt without creating earlier roles.
    t.session.startAttempt(performance.now());t.render(performance.now());
    controllers.forEach((c,i)=>{c.matrixAutoUpdate=true;c.userData.handedness=report.hands[i];away(c,4+i);});
  };
  const pointButton=(controller,id)=>{
    t.render(performance.now());const button=t.panel.buttons.find(b=>b.visible&&b.userData.action===id);
    check(button&&!button.userData.disabled,`${id} is available`);
    button.getWorldPosition(controller.position);t.panel.group.getWorldQuaternion(controller.quaternion);
    controller.position.add(new THREE.Vector3(0,0,.4).applyQuaternion(controller.quaternion));controller.updateMatrixWorld(true);
    check(t.nearestPanelHit(controller,r.raycastSystem.getCurrentHit(controller))?.object===button,`${controller.userData.handedness} ray hits ${id}`);
  };
  const start=async(controller)=>{
    pointButton(controller,'spawn-step');send(controller,'trigger',true);await wait(()=>r.pendingSpawnPlacement,'Spawn preview');
    const preview=r.pendingSpawnPlacement;
    check(preview.controller===controller&&preview.group.parent===controller,`${controller.userData.handedness} owns the preview`);
    check(preview.instruments.every(h=>h.pendingPlacement)&&t.session.phase==='practicing','Preview earns no completed step');
    check(!t.panel.buttonNodes.has('select')&&!t.panel.buttonNodes.has('place'),'No Select or Place Preview menu action');
    check(t.panel.buttonNodes.get('spawn-step').disabled,'Spawn disabled during preview');
    return preview;
  };
  const releaseAndPlace=async(controller,preview)=>{
    away(controller);send(controller,'trigger',false);
    check(!preview.waitForTriggerRelease,'Initiating trigger release arms placement');
    send(controller,'trigger',true);
    check(!r.pendingSpawnPlacement&&preview.instruments.every(h=>!h.pendingPlacement),'Fresh press commits normal placement');
    send(controller,'trigger',false);
    await wait(()=>t.session.phase==='results','Placement result');
    check(t.session.result.ok&&!t.session.result.assisted&&t.session.outcomes.get(t.session.step.id)?.status==='passed','Manual placement earns a learner pass');
  };
  const point=(controller,position)=>{controller.position.copy(position).add(new THREE.Vector3(0,0,.5));controller.quaternion.identity();controller.updateMatrixWorld(true);};
  const exerciseChord=async(controller,members,expected)=>{
    const group=r.honkLockService.getGroupForMember(members[0].id);
    check(group&&members.every(h=>h.locked&&h.lockedTextureApplied&&r.honkLockService.getGroupForMember(h.id)===group),'Every chord member uses the normal locked group and appearance');
    const midis=members.map(h=>a.midi(h));
    check(midis.every((m,i)=>Math.abs(m-expected.midis[i])<.01),'Preset pitches preserved');
    check(members.every(h=>h.noteLabelGroup?.visible&&h.noteLabelMesh?.visible&&h.noteLabelMesh.geometry.attributes.position.count>0),'Native note text is visible with populated geometry');
    const spacing=members[0].root.position.distanceTo(members[1].root.position);
    check(members.every(h=>{
      const bounds=h.noteLabelMesh.geometry.boundingBox;
      return (bounds.max.x-bounds.min.x)*h.root.scale.x*h.noteLabelGroup.scale.x<spacing;
    }),'Native chord notes fit without overlapping neighboring labels');
    check(members.every(h=>!a.labels.has(h.id)),'No floating tutorial Honk labels added');
    // Find a real visible-body ray for a non-anchor member that misses squeeze.
    const member=members[1],box=member.withInteractionPose(()=>new THREE.Box3().setFromObject(member.honkVisualRoot));
    let bodyHit=false;
    for(let x=0;x<12&&!bodyHit;x++)for(let y=0;y<12&&!bodyHit;y++){
      point(controller,new THREE.Vector3(THREE.MathUtils.lerp(box.min.x,box.max.x,(x+.5)/12),THREE.MathUtils.lerp(box.min.y,box.max.y,(y+.5)/12),box.max.z));
      const hit=r.getGripHit(controller),triggerHit=r.getCurrentHit(controller);
      bodyHit=r.instrumentRegistry.getFromObject3D(hit?.object)===member&&triggerHit?.object!==member.squeezeCollider&&r.getLockedInstrumentStateFromRay(controller)===member;
    }
    check(bodyHit,'Non-anchor member has a real body grab ray outside the squeeze target');
    send(controller,'grip',true);check(r.controllerStates.get(controller).gripHeld,'Normal Grip begins group movement');
    send(controller,'trigger',true);await delay(100);
    check(!r.controllerStates.get(controller).raySqueezeTarget&&r.audioSystem.honkVoices.voices.size===0,'Grabbing and triggering locked body stays silent');
    send(controller,'trigger',false);
    r.updateLockedHonkGroupTransforms();const before=members.map(h=>h.root.getWorldPosition(new THREE.Vector3()));
    controller.position.x+=.18;controller.updateMatrixWorld(true);r.updateGripTransform();r.updateLockedHonkGroupTransforms();
    check(members.every((h,i)=>h.root.getWorldPosition(new THREE.Vector3()).distanceTo(before[i].clone().add(new THREE.Vector3(.18,0,0)))<1e-6),'Grabbing a member moves the whole chord with unchanged offsets');
    send(controller,'grip',false);
    for(const h of members){
      point(controller,h.getSqueezeColliderSphere().center);
      check(r.getCurrentHit(controller)?.object===h.squeezeCollider,'Normal squeeze ray remains reachable');
      send(controller,'trigger',true);await wait(()=>r.audioSystem.honkVoices.voices.size===3,'three sounding voices');
      send(controller,'trigger',false);await wait(()=>r.audioSystem.honkVoices.voices.size===0,'voice release');
    }
    report.chords.push({hand:controller.userData.handedness,role:expected.role,midis,noteText:members.map(h=>h.noteLabelTextValue),noteScale:members.map(h=>h.noteLabelGroup.scale.x)});
    // Invoke the existing user unlock gesture, then allow frames and re-rendering.
    const unlocker=controllers[1];point(unlocker,member.getSqueezeColliderSphere().center);send(unlocker,'secondary',true);send(unlocker,'secondary',false);await delay(150);t.render(performance.now());
    check(members.every(h=>!h.locked&&!r.honkLockService.getGroupForMember(h.id)),'User unlock persists after tutorial updates');
  };
  try {
    for(const [index,controller] of controllers.entries()){
      await fixture(`spawn-group-${index+1}`);
      const preview=await start(controller),ids=preview.instruments.map(h=>h.id);
      const offsets=preview.instruments.map(h=>h.root.position.clone());
      await Promise.all([t.action('spawn-step',controller),t.action('spawn-step',controllers[1-index])]);
      check(r.pendingSpawnPlacement===preview&&r.instrumentRegistry.getByKind('honk').length===3,'Duplicate requests keep exactly one preview');
      away(controller);send(controller,'trigger',true);r.placePendingSpawnPlacement(controller);
      check(r.pendingSpawnPlacement===preview&&preview.waitForTriggerRelease,'Spawn press and repeated held trigger cannot commit');
      away(controllers[1-index],3);send(controllers[1-index],'trigger',false);send(controllers[1-index],'trigger',true);
      check(r.pendingSpawnPlacement===preview&&preview.waitForTriggerRelease,'Other hand cannot release or place the initiating preview');send(controllers[1-index],'trigger',false);
      const distance=preview.distance,scales=preview.instruments.map(h=>h.baseScale);
      axis(controllers[1-index],'thumbstickY',1);axis(controllers[1-index],'thumbstickX',1);
      check(preview.distance===distance&&preview.instruments.every((h,i)=>h.baseScale===scales[i]),'Other hand cannot adjust the preview');
      axis(controller,'thumbstickY',1);axis(controller,'thumbstickX',1);
      check(preview.distance!==distance&&preview.instruments.every((h,i)=>h.baseScale>scales[i]),`${controller.userData.handedness} thumbstick adjusts normal distance and scale`);
      controller.position.x+=.2;controller.rotation.y=.2;controller.updateMatrixWorld(true);
      check(preview.instruments.every((h,i)=>h.root.position.distanceTo(offsets[i])<1e-9&&!h.locked),'Moving the preview preserves preset arrangement without premature locking');
      send(controller,'grip',true);send(controller,'grip',false);send(controller,'trigger',false);await delay(150);
      check(!r.pendingSpawnPlacement&&ids.every(id=>!r.instrumentRegistry.get(id))&&r.honkLockService.groups.size===0,'Cancellation removes preview members without leaving a lock');
      check(!t.panel.buttonNodes.get('spawn-step').disabled&&t.session.phase==='practicing','Cancel keeps Spawn and the current attempt available');
      const retry=await start(controller);await releaseAndPlace(controller,retry);
      if(index===0){globalThis.tutorialTestProgress?.(JSON.stringify({step:'tutorial-spawn',seconds:0}));await delay(1000);}
      await exerciseChord(controller,retry.instruments,C.backing[index]);
    }
    for(const group of C.backing.slice(2)){
      await fixture(`spawn-${group.role}`);const controller=controllers[0],preview=await start(controller);await releaseAndPlace(controller,preview);
      check(preview.instruments.every(h=>h.locked&&h.noteLabelGroup.visible),`${group.role} also defaults to a locked chord with notes`);
    }
    for(const stepId of ['metronome','chordLooper','percussionLooper','melody','percussion']){
      await fixture(stepId);const controller=controllers[1],preview=await start(controller);
      if(stepId==='metronome'){
        send(controller,'grip',true);send(controller,'grip',false);send(controller,'trigger',false);
        check(r.instrumentRegistry.getByKind('metronome').length===0,'Metronome cancellation releases the singleton slot');
        await start(controller);
      }
      const current=r.pendingSpawnPlacement;await releaseAndPlace(controller,current);
      check(current.instruments.every(h=>!h.locked)&&r.honkLockService.groups.size===0,`${stepId} does not acquire a chord lock`);
    }
    // A released click during audio startup still requires a fresh press, but
    // never an extra release after the preview arrives.
    await fixture('metronome');const controller=controllers[0],ensureAudio=r.audioSystem.ensureAudio;
    let resume;try{
      r.audioSystem.ensureAudio=()=>new Promise(resolve=>{resume=resolve;});
      pointButton(controller,'spawn-step');send(controller,'trigger',true);
      const request=t.flow.spawnRequest;await t.action('spawn-step',controllers[1]);
      check(request===t.flow.spawnRequest&&!r.pendingSpawnPlacement,'Concurrent audio startup admits one Spawn request');
      send(controller,'trigger',false);resume();await wait(()=>r.pendingSpawnPlacement,'audio-delayed preview');
      check(!r.pendingSpawnPlacement.waitForTriggerRelease,'Release during audio startup is remembered');
    }finally{r.audioSystem.ensureAudio=ensureAudio;}
    await releaseAndPlace(controller,r.pendingSpawnPlacement);
    await fixture('metronome');
    try{
      r.audioSystem.ensureAudio=()=>new Promise(resolve=>{resume=resolve;});
      pointButton(controller,'spawn-step');send(controller,'trigger',true);t.flow.cancelOutgoing();resume();await delay(100);
      check(!r.pendingSpawnPlacement&&r.instrumentRegistry.getByKind('metronome').length===0,'Navigation invalidates Spawn waiting for audio');
    }finally{r.audioSystem.ensureAudio=ensureAudio;send(controller,'trigger',false);}
    await fixture('metronome');await t.action('spawn-step');
    check(!r.pendingSpawnPlacement,'No virtual or default right-hand substitution without an initiating controller');
    await t.flow.preparation.ensureRole(t.session.step);
    check(a.get('metronome')&&!a.get('metronome').pendingPlacement,'Explicit prerequisite assistance still places automatically');
    // Exercise radial menu confirmation, including a chord while in the lesson.
    for(const inLesson of [true,false]){
      if(!inLesson)await t.enterPlay();
      const hand=controllers[1],state=r.controllerStates.get(hand),menu=r.spawnMenuController;
      away(hand,1);send(hand,'primary',true);check(state.radialMenuOpen,'Right primary opens the normal radial menu');
      const categories=r.spawnCatalog.getRadialCategories(),categoryIndex=categories.findIndex(c=>c.entries.some(e=>e.id==='chord-cmajor'));
      const rollTo=predicate=>{
        const startRoll=hand.rotation.z;
        for(let i=0;i<720;i++){
          hand.rotation.z=startRoll+i*.015;hand.updateMatrixWorld(true);menu.update(hand,state);
          if(predicate())return;
        }
        throw new Error('Could not select radial item with controller roll');
      };
      rollTo(()=>state.radialMenuParentSelectedIndex===categoryIndex);
      hand.position.addScaledVector(state.radialMenuPullAxis,.08);hand.updateMatrixWorld(true);menu.update(hand,state);
      check(state.radialMenuLatchedParentIndex===categoryIndex,'Normal controller pull opens the chord category');
      rollTo(()=>categories[categoryIndex].entries[state.radialMenuChildSelectedIndex]?.id==='chord-cmajor');
      send(hand,'primary',false);const preview=r.pendingSpawnPlacement;
      check(preview&&!preview.tutorialSpawn&&!preview.waitForTriggerRelease,'Radial confirmation has ordinary preview defaults');
      send(hand,'trigger',true);send(hand,'trigger',false);
      check(!r.pendingSpawnPlacement&&preview.instruments.every(h=>!h.locked&&!r.honkLockService.getGroupForMember(h.id)),`Radial chord stays unlocked ${inLesson?'in tutorial':'in free play'}`);
      check(preview.instruments.every(h=>h.noteLabelGroup.visible&&h.noteLabelGroup.scale.x===1),'Radial chord retains its native note labels and scale');
      preview.instruments.forEach(h=>r.deleteInstrument(h));
    }
    return report;
  } finally {
    await t.enterPlay();t.panel.setXR(false);
    controllers.forEach((c,i)=>{c.userData.handedness=saved[i].hand;c.matrixAutoUpdate=saved[i].auto;c.position.copy(saved[i].position);c.quaternion.copy(saved[i].quaternion);c.updateMatrixWorld(true);});
  }
}
