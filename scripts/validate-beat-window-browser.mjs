// Exercises the shipped model, controller inputs, transport and Web Audio.
export async function validateBeatFeatures(app, controller) {
  const THREE=await import('three');
  const {LESSON_STEPS}=await import('../src/tutorial/lessonSteps.js');
  const {getLooperControlColliderPosition}=await import('../src/instruments/looper/view/looperControlPresentation.js');
  const {bendAt,DESCENDING_BEND}=await import('../src/tutorial/composition.js');
  const {BEND_SENSITIVITY,MAX_PITCH_BEND_SEMITONES}=await import('../src/config/honk.js');
  const r=app.runtime,t=r.tutorial,a=t.adapter,chords=a.get('chordLooper'),drums=a.get('percussionLooper'),metro=a.get('metronome');
  const report={checks:[],handles:[],takes:[],bends:[],headsetTested:false};
  const check=(ok,message)=>{if(!ok)throw new Error(message);report.checks.push(message);};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(fn,message,timeout=18000)=>{const end=performance.now()+timeout;while(!fn()){if(performance.now()>end)throw new Error(message);await delay(12);}};
  const away=()=>{controller.position.set(6,3,3);controller.quaternion.identity();controller.updateMatrixWorld(true);};
  const input=pressed=>r.interactionCoordinator.receiveInput({type:'button.transition',controller,button:'trigger',pressed,timestamp:performance.now()});
  const point=target=>{
    const p=target.getWorldPosition(new THREE.Vector3());
    for(const offset of [[0,0,.4],[.2,0,.4],[-.2,0,.4],[0,.2,.4],[0,-.2,.4]]){
      controller.position.copy(p).add(new THREE.Vector3(...offset));
      controller.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(controller.position,p,new THREE.Vector3(0,1,0)));controller.updateMatrixWorld(true);
      if(r.getCurrentHit(controller)?.object===target)return;
    }throw new Error('Cannot point at '+target.name);
  };
  const press=async(h,action)=>{point(h.hitTargets['HIT_looper_'+action]);input(true);input(false);away();await delay(30);};
  const capture=h=>h.timeline.toJSON();
  t.flow.cancelOutgoing();t.session.navigate(LESSON_STEPS.findIndex(s=>s.id==='learn-bend'),performance.now());
  await r.audioSystem.ensureAudio();metro.setBpm(80);metro.play();metro.setVolume(0);
  t.session.navigate(LESSON_STEPS.findIndex(s=>s.id==='record-chords'),performance.now());
  const demoBefore=JSON.stringify([chords,drums].map(l=>l.looperController.serializeState(l)));
  const originalAuto=chords.looperController.adapter.onAutomaticRecordingStop;let demoAuto=false;
  chords.looperController.adapter.onAutomaticRecordingStop=(looper,now)=>{demoAuto=true;return originalAuto(looper,now);};
  try{
    await t.flow.demonstrate();check(Boolean(t.demo),'Full recording Demonstrate starts');
    await wait(()=>!t.demo,'Full automatic recording demonstration finishes',25000);
    check(demoAuto,'Demonstrate uses real 16-beat automatic stop');
    check(JSON.stringify([chords,drums].map(l=>l.looperController.serializeState(l)))===demoBefore,'Completed demonstration restores learner takes and selectors');
  }finally{chords.looperController.adapter.onAutomaticRecordingStop=originalAuto;}
  t.session.navigate(LESSON_STEPS.findIndex(s=>s.id==='learn-bend'),performance.now());metro.setBpm(200);
  const h=chords,mesh=h.morphController.meshes?.[0];
  for(const [i,beats] of [2,4,8,16].entries()){
    const target=h.hitTargets.HIT_looper_recordLength;
    point(target);input(true);
    const interaction=r.controllerStates.get(controller).activeTriggerInteraction;
    check(interaction?.type==='looperControlDrag','Physical right-handle drag starts');
    const value=i*2/3-1,local=getLooperControlColliderPosition(target.userData,value);
    const destination=interaction.dragStartControllerPosition.clone().add(new THREE.Vector3(local.x,local.y,local.z)).sub(interaction.dragStartColliderPosition);
    controller.position.copy(h.root.localToWorld(destination));controller.updateMatrixWorld(true);r.updateLooperControlDrag(controller,interaction);input(false);away();
    check(h.looperData.recordBeats===beats,'Physical detent selects '+beats+' beats');
    check(target.position.distanceTo(new THREE.Vector3(local.x,local.y,local.z))<1e-6,'Collider snaps to '+beats+' detent');
    const names=target.userData.looperMorphTargets;
    check(Math.abs(h.getMorphValue(names.up)-Math.max(value,0))<1e-6&&Math.abs(h.getMorphValue(names.down)-Math.max(-value,0))<1e-6,'Visible morph snaps to '+beats+' detent');
    report.handles.push({beats,value,position:target.position.toArray(),morphTargets:names});
  }
  check(h.hitTargets.HIT_looper_gap.userData.looperMorphTargets.up==='bottom_handle_up','Gap uses the actual bottom asset morph');
  r.updateLooperTempoLabel(h);check(h.tempoLabel.text.includes('Record: 16 beats'),'Compact record-length label rendered');
  // Four real automatic captures. Hold through the endpoint to test live ownership.
  for(const beats of [2,4,8,16]){
    r.setLooperControlValue(h,'recordLength',({2:-1,4:-1/3,8:1/3,16:1})[beats]);
    await press(h,'record');await delay(370);check(h.transport.recordArmed,'Silence remains armed for '+beats+' beats');
    point(a.get('group-1').squeezeCollider);input(true);await wait(()=>h.transport.recording,'capture onset');
    const gesture=r.controllerStates.get(controller).raySqueezeStartInverseQuaternion.clone().invert();
    controller.quaternion.copy(gesture).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-.3));controller.updateMatrixWorld(true);
    await wait(()=>!h.transport.recording,'automatic '+beats+' endpoint');
    check(r.controllerStates.get(controller).trigger&&a.get('group-1').getLivePerformanceState().squeeze>0,'Live hold continues after '+beats+' capture');
    check(h.timeline.fixedWindowBeats===beats&&Math.abs(h.timeline.durationMs-beats*300)<1e-6,'Exact real '+beats+' beat window');
    check(h.looperData.buttonMorphReleaseTimes.has('stop'),'Automatic Stop animates physical button');
    report.takes.push(capture(h));input(false);away();await delay(50);
  }
  // Record a shorter second take, then press ONE physical Play for the group.
  r.setLooperControlValue(drums,'recordLength',-1);await press(drums,'record');point(a.get('percussion').squeezeCollider);input(true);
  await wait(()=>drums.transport.recording,'second onset');await wait(()=>!drums.transport.recording,'second auto stop');input(false);away();await delay(50);
  const launches=[h,drums].map(l=>l.looperData.launchHistory.length);
  await press(h,'play');const targetBeat=h.looperData.pendingLaunch?.targetBeat;await press(drums,'play');
  await wait(()=>h.transport.playing&&drums.transport.playing&&!h.looperData.playArmed&&!drums.looperData.playArmed,'linked launch');
  check(h.looperData.clockPlaybackStartBeatPosition===drums.looperData.clockPlaybackStartBeatPosition,'One physical Play shares a beat across mixed-length takes');
  const first=h.looperData.launchHistory.at(-1),second=drums.looperData.launchHistory.at(-1);
  check(Math.abs(first.audioOriginTime-second.audioOriginTime)<1e-6,'Linked audio scheduling uses one anchor');
  report.launch={targetBeat,first,second};
  await delay(5100);check(h.looperData.launchHistory.length===launches[0]+1&&drums.looperData.launchHistory.length===launches[1]+1,'Repeated presses and short wraps do not relaunch long take');
  h.stop();drums.stop();metro.setBpm(80);
  // Both physical hand labels and reversed view are exercised with real quaternions.
  const savedHand=controller.userData.handedness,camera=r.getUserCamera(),savedQ=camera.quaternion.clone();
  const step=LESSON_STEPS.find(s=>s.id==='learn-bend');t.session.navigate(LESSON_STEPS.indexOf(step),performance.now());t.session.startAttempt(performance.now());
  t.cues.update(t.session,performance.now());check(!t.cues.bendInstruction,'Untimed bend waits for actual learner onset');
  for(const hand of ['left','right']){
    t.session.startAttempt(performance.now());
    controller.userData.handedness=hand;point(a.get(step.role).squeezeCollider);input(true);await wait(()=>a.gestures.has(controller),'bend onset');
    const g=a.gestures.get(controller),before=a.get(step.role).getLivePerformanceState().bend;
    for(const fraction of [0,.1,.4,.7,.9]){
      const at=g.startMs+fraction*2250;t.cues.update(t.session,at);
      const pair=t.cues.pool[0],p=pair.bend.position.clone().sub(pair.reference.position),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
      const cue=t.cues.bendInstruction;check(pair.reference.visible&&pair.bend.visible,'Reference and bend rings render for '+hand+' '+fraction);
      check(fraction<=.2?p.length()<1e-6:p.dot(right)>0,'Downward pitch uses verified wrist-roll direction for '+hand+' '+fraction);
      check(a.get(step.role).getLivePerformanceState().bend===before,'Guidance leaves '+hand+' learner pitch unchanged');
      check(new THREE.Raycaster(pair.bend.position.clone().add(new THREE.Vector3(0,0,1)),new THREE.Vector3(0,0,-1)).intersectObject(pair.bend).length===0,'Bend marker never intercepts input');
      report.bends.push({hand,fraction,semitones:bendAt(DESCENDING_BEND,fraction),displacement:p.toArray(),cue});
      if(fraction===.7){
        // Also verify production input mapping for this captured controller orientation.
        const state=r.controllerStates.get(controller),base=state.raySqueezeStartInverseQuaternion.clone().invert();
        controller.quaternion.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-3/MAX_PITCH_BEND_SEMITONES/BEND_SENSITIVITY));controller.updateMatrixWorld(true);
        check(Math.abs(r.getControllerRollBend(controller,{bendStartInverseQuaternion:state.raySqueezeStartInverseQuaternion})*MAX_PITCH_BEND_SEMITONES+3)<1e-6,'Actual '+hand+' roll maps to minus three semitones');
        controller.quaternion.copy(base);controller.updateMatrixWorld(true);
      }
    }
    camera.quaternion.copy(savedQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
    t.cues.update(t.session,g.startMs+1800);const pair=t.cues.pool[0],right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
    check(pair.bend.position.clone().sub(pair.reference.position).dot(right)<0,'Reversed view flips screen direction for '+hand);
    camera.quaternion.copy(savedQ);input(false);away();await delay(35);check(!t.cues.pool[0].bend.visible,'Release clears '+hand+' bend marker');
  }
  controller.userData.handedness=savedHand;camera.quaternion.copy(savedQ);t.cues.reset();t.flow.cancelOutgoing();
  // Render export views without altering the learner take: geometry only.
  report.assetPaths=Object.fromEntries(['volume','gap','recordLength'].map(key=>[key,h.hitTargets['HIT_looper_'+key].userData.looperControlPath]));
  r.setLooperControlValue(h,'recordLength',1);r.updateLooperTempoLabel(h);
  report.renders=await renderFeatureViews(app);
  return report;
}

export async function renderFeatureViews(app) {
  const THREE=await import('three');
  const {TutorialTimingCues}=await import('../src/tutorial/TutorialTimingCues.js');
  const {TutorialSession}=await import('../src/tutorial/TutorialSession.js');
  const {LESSON_STEPS}=await import('../src/tutorial/lessonSteps.js');
  const r=app.runtime,a=r.tutorial.adapter,h=a.get('chordLooper'),honk=a.get('melody-Eb4');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1600,900);renderer.setPixelRatio(1);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#102d2b');
  scene.add(new THREE.HemisphereLight(0xfff5d8,0x47695d,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,4,6);scene.add(light);
  const camera=new THREE.OrthographicCamera(-3.6,3.6,2.025,-2.025,.1,30);camera.position.set(0,0,8);
  const labels=[];
  const label=(text,x,y,size=.2,color='#fff4dd')=>{
    const canvas=document.createElement('canvas');canvas.width=2300;canvas.height=100;const ctx=canvas.getContext('2d');ctx.font='500 52px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,1150,50);
    const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(size*23,size,1);sprite.position.set(x,y,1);scene.add(sprite);labels.push(sprite);return sprite;
  };
  const clones=[];
  label('RECORD THE NEXT TAKE',0,1.6,.3);label('Left: Volume    ·    Bottom: Gap    ·    Right: Record length',0,1.2,.23,'#bed9ce');
  for(const [i,beats] of [2,4,8,16].entries()){
    const clone=h.root.clone(true);clone.position.set((i-1.5)*1.7,-.7,0);clone.quaternion.identity();clone.scale.setScalar(2.7);scene.add(clone);clones.push(clone);
    clone.traverse(o=>{if(o.userData.isHitTarget&&!o.userData.usesVisibleMeshForGrip||o.userData.isNoteLabel||o.name.startsWith('DEBUG_'))o.visible=false;
      if(o.morphTargetDictionary){const value=i*2/3-1;for(const [name,weight] of [['right_handle_up',Math.max(value,0)],['Right_handle_down',Math.max(-value,0)]])o.morphTargetInfluences[o.morphTargetDictionary[name]]=weight;}});
    label(`${beats} beats${beats===16?' · DEFAULT':''}`,(i-1.5)*1.7,-1.05,.21,beats===16?'#ffd15a':'#fff4dd');
  }
  label('The handle and its collider snap to the same four positions.',0,-1.6,.22,'#bed9ce');
  renderer.render(scene,camera);const handles=renderer.domElement.toDataURL('image/png');
  for(const o of [...clones,...labels])scene.remove(o);clones.length=0;
  label('HOLD · ROLL DOWN TOWARD C · SETTLE · RELEASE',0,1.6,.28);
  label('Amber marker = wrist roll. The white squeeze reference stays fixed.',0,1.2,.23,'#bed9ce');
  const pool=[];
  for(const [i,fraction] of [0,.45,.85].entries()){
    const clone=honk.root.clone(true);clone.position.set((i-1)*2.25,-.5,0);clone.quaternion.identity();clone.scale.setScalar(7.5);scene.add(clone);clones.push(clone);
    clone.traverse(o=>{if(o.userData.isHitTarget&&!o.userData.usesVisibleMeshForGrip||o.userData.isNoteLabel||o.name.startsWith('DEBUG_'))o.visible=false;});
    const sphere=honk.getSqueezeColliderSphere(),local=honk.root.worldToLocal(sphere.center.clone());clone.updateMatrixWorld(true);
    const center=clone.localToWorld(local);center.z+=.02;
    const step=LESSON_STEPS.find(s=>s.id==='learn-bend'),controller=new THREE.Group(),session=new TutorialSession({steps:[step]});session.startAttempt(0);
    const adapter={r:{scene,getUserCamera:()=>camera,controllers:[controller],controllerStates:new Map([[controller,{raySqueezeStartInverseQuaternion:new THREE.Quaternion()}]])},
      gestures:new Map([[controller,{role:step.role,startMs:0}]]),virtuals:[],get:()=>({root:clone,getSqueezeColliderSphere:()=>({center,radius:sphere.radius*7.5/honk.root.scale.x})}),lastStrikes:new Map()};
    const cues=new TutorialTimingCues(adapter);cues.update(session,fraction*2250);pool.push(cues);
    label(['Level hold · Eb','Gradual roll · descending','Settle · C (−3 semitones)'][i],(i-1)*2.25,-1.05,.21,'#ffd15a');
  }
  label('The guide changes no learner pitch, collider or raycast target.',0,-1.6,.22,'#bed9ce');
  renderer.render(scene,camera);const bends=renderer.domElement.toDataURL('image/png');
  for(const cues of pool)cues.dispose();for(const sprite of labels){sprite.material.map.dispose();sprite.material.dispose();}
  renderer.dispose();renderer.forceContextLoss();return {handles,bends};
}
