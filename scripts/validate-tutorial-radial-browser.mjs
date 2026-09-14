// Real radial roll/pull/release, controller previews, committed roles and input.
// Run with TUTORIAL_TEST=radial npm run test:tutorial:browser.
export async function validateLearnerFlow(app) {
  const THREE=await import('three');
  const {COMPOSITION:C}=await import('../src/tutorial/composition.js');
  const {LESSON_STEPS}=await import('../src/tutorial/lessonSteps.js');
  const {LESSON_CONTROL_IDS,isSetupStep}=await import('../src/tutorial/TutorialLessonPolicy.js');
  const r=app.runtime,t=r.tutorial,a=t.adapter,checks=[];
  const report={checks,hands:['left','right'],headsetTested:false,acousticListeningTested:false};
  const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(predicate,message,timeout=12000)=>{
    const end=performance.now()+timeout;
    while(!predicate()){if(performance.now()>end)throw new Error(message+': '+t.session?.step?.id+' / '+t.uiFeedback+' / '+t.session?.feedback);await delay(20);}
  };
  await wait(()=>app.initialized&&t.ready,'assets');
  await t.enter('practice');t.panel.setXR(false);
  const controllers=r.controllers.filter(c=>!c.userData.virtualTutorial).slice(0,2),controller=controllers[0];
  const saved=controllers.map(c=>({hand:c.userData.handedness,auto:c.matrixAutoUpdate,position:c.position.clone(),quaternion:c.quaternion.clone()}));
  const send=(c,button,pressed)=>r.interactionCoordinator.receiveInput({type:'button.transition',controller:c,handedness:c.userData.handedness,button,pressed,timestamp:performance.now()});
  const away=(c,x=4)=>{r.camera.getWorldPosition(c.position);c.position.x+=x;c.quaternion.identity();c.updateMatrixWorld(true);};
  controllers.forEach((c,i)=>{c.matrixAutoUpdate=true;c.userData.handedness=report.hands[i];away(c,4+i);});
  const click=async id=>{
    t.render(performance.now());const button=t.panel.buttonNodes.get(id);
    check(button&&!button.disabled,id+' available: '+(button?.title||''));button.click();await delay(120);
  };
  const layout=()=>[...t.panel.dom.querySelectorAll('button')].map(n=>({id:n.dataset.action,label:n.textContent,x:n.offsetLeft,y:n.offsetTop}));
  const fixed=layout();
  const six=()=>{
    const current=layout();check(JSON.stringify(current)===JSON.stringify(fixed),'Six fixed labels and positions at '+(t.session.step?.id||'completion'));
    check(t.panel.layout.every(region=>region.bottom<=region.limit+.01&&region.font>=30),'Canvas text fits its region at '+(t.session.step?.id||'completion'));
  };
  check(fixed.map(b=>b.id).join(',')===LESSON_CONTROL_IDS.join(','),'Exactly six lesson controls');
  const next=async()=>{const index=t.session.index;await click('next-step');check(t.session.index===index+1,'Next advances once');six();};
  const go=async id=>{
    const target=LESSON_STEPS.findIndex(step=>step.id===id);
    while(t.session.index>target)await click('previous-step');
    while(t.session.index<target){
      if(t.session.step.type==='stick'){away(controllers[1]);send(controllers[1],'grip',true);await setupReady();}
      if(t.session.step.type==='unequip'){send(controllers[1],'grip',false);await setupReady();}
      await next();
    }
    check(t.session.step.id===id,'Navigation reaches '+id);
  };
  const menuPreview=async(id,c,{held=false}={})=>{
    const menuButton=c.userData.handedness==='left'?'secondary':'primary';
    away(c);send(c,menuButton,true);
    const state=r.controllerStates.get(c),menu=r.spawnMenuController,categories=r.spawnCatalog.getRadialCategories();
    check(state.radialMenuOpen,c.userData.handedness+' opens radial menu');
    const categoryIndex=categories.findIndex(category=>category.entries.some(entry=>entry.id===id));
    check(categoryIndex>=0,id+' is visible in the radial catalog');
    const rollTo=predicate=>{
      const start=c.rotation.z;
      for(let i=0;i<720;i++){c.rotation.z=start+i*.015;c.updateMatrixWorld(true);menu.update(c,state);if(predicate())return;}
      throw new Error('Could not roll to '+id);
    };
    rollTo(()=>state.radialMenuParentSelectedIndex===categoryIndex);
    c.position.addScaledVector(state.radialMenuPullAxis,.08);c.updateMatrixWorld(true);menu.update(c,state);
    check(state.radialMenuLatchedParentIndex===categoryIndex,'Controller pull enters category');
    rollTo(()=>categories[categoryIndex].entries[state.radialMenuChildSelectedIndex]?.id===id);
    if(held)send(c,'trigger',true);
    send(c,menuButton,false);await wait(()=>r.pendingSpawnPlacement,'radial preview');
    const preview=r.pendingSpawnPlacement;
    check(preview.controller===c&&preview.group.parent===c,'Preview belongs to selecting '+c.userData.handedness+' controller');
    check(preview.instruments.every(h=>h.pendingPlacement),'Menu release leaves an uncommitted preview');
    return preview;
  };
  const cancel=async(c,preview)=>{
    const ids=preview.instruments.map(h=>h.id);send(c,'grip',true);send(c,'grip',false);send(c,'trigger',false);await delay(100);
    check(!r.pendingSpawnPlacement&&ids.every(id=>!r.instrumentRegistry.get(id)),'Grip cancels preview and deletes all members');
  };
  const place=async(c,preview,role)=>{
    const target=a.positionFor(role);
    c.position.copy(target);c.position.z+=preview.distance;c.quaternion.identity();c.updateMatrixWorld(true);
    send(c,'trigger',false);send(c,'trigger',true);send(c,'trigger',false);away(c);
    check(!r.pendingSpawnPlacement&&preview.instruments.every(h=>!h.pendingPlacement),'Fresh Trigger commits placement');
    await delay(500);return preview.instruments;
  };
  const spawn=async(id,role,c=controller)=>place(c,await menuPreview(id,c),role);
  const point=(c,position)=>{c.position.copy(position).add(new THREE.Vector3(0,0,.38));c.quaternion.identity();c.updateMatrixWorld(true);};
  const pose=(role,c=controller)=>{const h=a.get(role);point(c,h.getSqueezeColliderSphere().center);check(r.getCurrentHit(c)?.object===h.squeezeCollider,'Real squeeze ray: '+role);};
  const hold=async(role,ms=600)=>{pose(role);send(controller,'trigger',true);await delay(ms);send(controller,'trigger',false);away(controller);await delay(80);};
  const result=()=>wait(()=>t.session.phase==='results','practice result',35000);
  const setupReady=async()=>{
    await wait(()=>t.session.phase==='results'&&t.session.result.ok&&!t.panel.buttonNodes.get('next-step').disabled,'automatic setup');
    check(!t.panel.buttonNodes.get('next-step').disabled,'Correct setup enables Next without Practice');
    check(t.panel.buttonNodes.get('step-demo').disabled&&t.panel.buttonNodes.get('step-practice').disabled,'Setup disables Demonstrate and Practice');
    const result=t.session.result;await delay(160);check(t.session.result===result,'Setup feedback remains until Next');six();
  };
  const snapshots=()=>JSON.stringify(Object.fromEntries(['chordLooper','percussionLooper'].map(role=>[role,a.get(role).looperController.serializeState(a.get(role))])));
  const noVoices=()=>r.audioSystem.honkVoices.voices.size===0&&!a.virtuals.some(c=>r.controllerStates.get(c).trigger||r.isControllerStickActive(c));
  try {
    await setupReady();await next();
    const before=r.instrumentRegistry.size;
    for(const id of ['spawn-step','prepare-step','select','place','record-backing','record-percussion','connect','start-all','count-in','finish-attempt'])await t.action(id,controller);
    check(r.instrumentRegistry.size===before&&!r.pendingSpawnPlacement,'Removed hidden lesson actions cannot spawn or prepare');
    const metroPreview=await menuPreview('metronome',controller,{held:true});
    check(!a.get('metronome'),'Uncommitted Metronome has no role');
    r.placePendingSpawnPlacement(controller);
    check(r.pendingSpawnPlacement===metroPreview&&metroPreview.waitForTriggerRelease,'Held selection Trigger cannot commit');
    await cancel(controller,metroPreview);
    await spawn('metronome','metronome',controllers[1]);await setupReady();await next();
    const cancelled=await menuPreview('looper',controllers[1]);await cancel(controllers[1],cancelled);
    check(!a.get('chordLooper')&&!a.get('percussionLooper'),'Cancelled Looper consumes neither role');
    await spawn('looper','chordLooper');await setupReady();await next();
    await spawn('looper','percussionLooper',controllers[1]);await setupReady();
    const survivor=a.get('percussionLooper').id,deleted=a.get('chordLooper');r.deleteInstrument(deleted);
    await spawn('looper','chordLooper',controllers[1]);
    check(a.get('percussionLooper').id===survivor&&a.get('chordLooper').id!==deleted.id,'Replacement fills missing first role without renaming survivor');
    check(a.labels.has('chordLooper')&&a.labels.has('percussionLooper'),'Both standard Loopers receive role billboards');
    await next();
    const metro=a.get('metronome'),chords=a.get('chordLooper'),drums=a.get('percussionLooper'),ports=[...metro.connectionPorts.keys()];
    for(const [role,port,index] of [['chordLooper',ports[2],5],['percussionLooper',ports[3],3]]){
      const h=a.get(role);r.metronomeConnectionManager.connect({metronomeId:metro.id,portId:port,targetKind:'looper',targetId:h.id,targetPortId:h.tracks[index].trackId});
      await setupReady();await next();
    }
    metro.setBpm(80,performance.now());metro.setVolume(1);metro.pressButton('play',performance.now());r.updateMetronomeLabel(metro);
    for(const h of [chords,drums])r.setLooperControlValue(h,'gap',-1);
    await setupReady();await next();
    for(const [i,g] of C.backing.entries()){
      const c=controllers[i%2],members=await spawn(g.catalogId,g.role,c);
      check(members.every(h=>h.locked&&h.lockedTextureApplied),'All '+g.role+' members use existing locked appearance');
      const group=r.honkLockService.getGroupForMember(members[1].id);
      check(group&&members.every(h=>r.honkLockService.getGroupForMember(h.id)===group),'Existing lock group owns all three voices');
      check(members.every((h,index)=>Math.abs(a.midi(h)-g.midis[index])<.01),'Chord tuning matches canonical recipe');
      await setupReady();await next();
      r.connectLooperTrackToHonk(chords,[6,2,7,4][i],members[1].id);
      await setupReady();await next();
    }
    report.routes=structuredClone(a.snapshot(performance.now()).routes);
    // Grab a non-anchor member's visible body, outside the squeeze target.
    for(const [i,c] of controllers.entries()){
      const members=a.members('group-'+(i+1)),member=members[1];
      const box=member.withInteractionPose(()=>new THREE.Box3().setFromObject(member.honkVisualRoot));let hit=false;
      for(let x=0;x<16&&!hit;x++)for(let y=0;y<16&&!hit;y++){
        point(c,new THREE.Vector3(THREE.MathUtils.lerp(box.min.x,box.max.x,(x+.5)/16),THREE.MathUtils.lerp(box.min.y,box.max.y,(y+.5)/16),box.max.z));
        hit=r.instrumentRegistry.getFromObject3D(r.getGripHit(c)?.object)===member&&r.getCurrentHit(c)?.object!==member.squeezeCollider&&r.getLockedInstrumentStateFromRay(c)===member;
      }
      check(hit,'Non-anchor body grab ray for '+c.userData.handedness);
      send(c,'grip',true);send(c,'trigger',true);await delay(80);
      check(!r.controllerStates.get(c).raySqueezeTarget&&noVoices(),'Locked body grab remains silent');
      send(c,'trigger',false);r.updateLockedHonkGroupTransforms();
      const positions=members.map(h=>h.root.getWorldPosition(new THREE.Vector3()));
      c.position.x+=.08;c.updateMatrixWorld(true);r.updateGripTransform();r.updateLockedHonkGroupTransforms();
      check(members.every((h,index)=>h.root.getWorldPosition(new THREE.Vector3()).distanceTo(positions[index].clone().add(new THREE.Vector3(.08,0,0)))<1e-6),'Grab moves entire chord with unchanged offsets');
      send(c,'grip',false);away(c);
      pose('group-'+(i+1),c);send(c,'trigger',true);await delay(100);
      check(r.audioSystem.honkVoices.voices.size===3,'Normal squeeze sounds exactly three locked voices');
      send(c,'trigger',false);away(c);await wait(noVoices,'release');
    }
    pose('group-1',controllers[1]);send(controllers[1],'secondary',true);send(controllers[1],'secondary',false);away(controllers[1]);await delay(250);
    check(a.members('group-1').every(h=>!h.locked),'Intentional unlock persists through tutorial updates');
    pose('group-1',controllers[1]);send(controllers[1],'secondary',true);send(controllers[1],'secondary',false);away(controllers[1]);await delay(200);
    check(a.members('group-1').every(h=>h.locked&&h.lockedTextureApplied),'Right B relocks the whole tutorial chord');
    const checkpoint={index:t.session.index,phase:t.session.phase,result:t.session.result,checkpoints:t.session.checkpoints.size};
    const settings=JSON.stringify(a.members('group-1').map(h=>h.serialize().performanceDefaults));
    await click('step-demo');const demo=t.demo;check(Boolean(demo),'Current musical demonstration starts');
    await wait(()=>!t.demo,'note demo completes');
    check(demo.session.complete&&t.session.index===checkpoint.index&&t.session.phase===checkpoint.phase&&t.session.checkpoints.size===checkpoint.checkpoints,'Demonstration restores checkpoint without credit');
    check(settings===JSON.stringify(a.members('group-1').map(h=>h.serialize().performanceDefaults))&&noVoices(),'Note demonstration restores settings and releases voices');
    await next();await next();
    for(const group of C.backing)for(const h of a.members(group.role)){h.setVowel('O');h.setNose(.35);}
    r.setLooperControlValue(chords,'volume',-.55);await setupReady();await next();
    await click('step-practice');await hold('group-1');await result();
    check(t.session.result.ok&&t.session.result.score===100,'Practice works without a demonstration and retains honest scoring');
    await next();await next();
    check(t.session.step.id==='record-chords','First recording reached');
    await next();await next();
    check(t.panel.model.feedback==='No recording yet; you can skip this step','Empty chord playback explains skip');
    await next();
    const percussion=await spawn('honk','percussion',controllers[1]);
    check(percussion[0]===a.get('percussion')&&a.midi(percussion[0])!==48,'Ordinary Honk at another pitch is accepted for percussion');
    for(const locked of [true,false]){
      pose('percussion',controllers[1]);send(controllers[1],'secondary',true);send(controllers[1],'secondary',false);away(controllers[1]);await delay(100);
      check(percussion[0].locked===locked&&percussion[0].lockedTextureApplied===locked,'Right B toggles the separate percussion Honk');
    }
    await setupReady();await next();r.connectLooperTrackToHonk(drums,6,percussion[0].id);
    await setupReady();await next();
    away(controllers[1]);send(controllers[1],'grip',true);await setupReady();await next();
    check(r.isControllerStickActive(controllers[1]),'Navigation preserves the held physical stick');
    await click('step-practice');check(r.isControllerStickActive(controllers[1]),'Starting percussion Practice preserves the held stick');
    await click('step-practice');
    while(t.session.step.id!=='unequip'){
      if(t.session.step.type==='playback')check(t.panel.model.feedback==='No recording yet; you can skip this step','Empty percussion playback explains skip');
      await next();
    }
    send(controllers[1],'grip',false);await setupReady();await next();
    await spawn('jog-melody','melody',controllers[1]);await setupReady();await next();
    check(a.members('melody').length===7&&a.members('melody').every(h=>!h.locked),'Jog Study has seven separate unlocked melody notes');
    check(['record-chords','record-percussion'].every(id=>t.session.outcomes.get(id).status==='skipped'),'Both skipped recordings are honestly marked skipped');
    check(!chords.timeline.hasRecording()&&!drums.timeline.hasRecording(),'Navigation generated no backing recordings');
    const melody=a.get('melody-C4'),melodyNotes=a.members('melody').map(h=>h.noteLabelTextValue);
    await click('step-practice');
    for(const locked of [true,false,true]){
      pose('melody-C4',controllers[1]);send(controllers[1],'secondary',true);send(controllers[1],'secondary',false);away(controllers[1]);await delay(100);
      check(t.session.phase==='practicing'&&melody.locked===locked&&melody.lockedTextureApplied===locked,'Right B toggles an individual melody Honk during active Practice');
      check(a.members('melody').filter(h=>h!==melody).every(h=>!h.locked),'Locking one melody Honk leaves its neighbours independent');
      check(JSON.stringify(a.members('melody').map(h=>h.noteLabelTextValue))===JSON.stringify(melodyNotes)&&melody.noteLabelGroup.visible,'Lock toggles preserve visible pitch text');
    }
    await hold('melody-C4');await result();
    check(t.session.result.ok,'Melody note practice succeeds without backing');
    check(melody.locked,'Practice results retain the learner lock');
    await click('step-practice');check(melody.locked,'Practice retry retains the learner lock');
    pose('melody-C4',controllers[1]);send(controllers[1],'secondary',true);send(controllers[1],'secondary',false);away(controllers[1]);
    await click('step-practice');await delay(150);
    check(!melody.locked&&!melody.lockedTextureApplied,'Practice cancellation retains the learner unlock');
    await go('phrase-A');await click('step-practice');
    check(t.session.anchorMs>performance.now()&&t.session.anchorMs-performance.now()<4500,'No-backing phrase gets a finite Metronome count-in');
    await wait(()=>performance.now()>t.session.anchorMs+100,'no-backing phrase starts');
    check(t.session.phase==='practicing'&&!chords.transport.playing&&!drums.transport.playing,'Phrase begins against Metronome alone');
    await click('step-practice');check(t.session.phase==='ready'&&noVoices(),'Practice button safely cancels its own attempt');
    // Create one intentional learner recording through Practice and real rays.
    await go('record-chords');await click('step-practice');
    for(const g of C.backing){
      await wait(()=>performance.now()>=t.session.anchorMs+g.beat*750,'chord onset');
      pose(g.role);send(controller,'trigger',true);
      await wait(()=>performance.now()>=t.session.anchorMs+(g.beat+g.beats)*750,'chord release');
      send(controller,'trigger',false);away(controller);
    }
    await result();check(t.session.result.ok,'Real four-chord learner recording passes: '+t.session.result.message);
    check(chords.timeline.hasRecording()&&!drums.timeline.hasRecording(),'Successful intentional recording remains as the only backing');
    report.recording={score:t.session.result.score,timeline:chords.timeline.toJSON()};
    const savedTakes=snapshots();
    await go('phrase-A');check(snapshots()===savedTakes,'Navigation preserves recorded content and settings');
    await click('step-practice');check(t.session.anchorMs!==null&&t.session.anchorMs-performance.now()<17000,'One-backing phrase receives a finite boundary');
    await wait(()=>performance.now()>t.session.anchorMs+100,'one-backing phrase starts',18000);
    check(t.session.phase==='practicing'&&chords.transport.playing&&!drums.transport.playing,'Phrase uses the one existing backing without waiting for two-loop alignment');
    await click('step-practice');check(snapshots()===savedTakes,'Cancelling phrase preserves the learner take');
    await go('record-chords');await click('step-demo');
    await wait(()=>chords.transport.recording,'temporary demo recording starts',16000);
    await click('step-demo');check(snapshots()===savedTakes&&noVoices(),'Cancelling recording demo restores both takes and releases voices');
    await click('step-demo');await delay(250);await click('next-step');
    check(!t.demo&&snapshots()===savedTakes&&noVoices(),'Navigation cancels pending demonstration and preserves takes');
    await go('audition-E');
    r.pressLooperButton(chords,'play',null,performance.now());await wait(()=>chords.transport.playing,'existing playback');
    const source=chords.looperController.getAbsoluteSourcePosition(chords,performance.now());
    await click('step-demo');await delay(200);await click('step-demo');
    check(chords.looperData.playArmed||chords.transport.playing,'Demo restores an existing playing transport');
    await wait(()=>chords.transport.playing&&!chords.looperData.playArmed,'restored playback');
    const resumed=chords.looperController.getAbsoluteSourcePosition(chords,performance.now());
    check(Math.abs(resumed-source)<1100&&snapshots()===savedTakes,'Playback resumes near saved source without changing recording');
    chords.pause();await wait(()=>chords.transport.paused,'clock-quantized pause');const paused=chords.looperData.playbackEngine.elapsedMs;
    await click('step-demo');await delay(150);await click('step-demo');
    check(chords.transport.paused&&Math.abs(chords.looperData.playbackEngine.elapsedMs-paused)<1,'Paused transport checkpoint is restored');
    chords.stop();await wait(noVoices,'final voice cleanup');
    // Exercise creation before font readiness through the normal catalog path.
    const font=r.noteFont;
    try{
      r.noteFont=null;const preview=await menuPreview('honk',controllers[1]);
      check(!preview.instruments[0].noteLabelGroup,'A preview can precede native font readiness');
      const extra=(await place(controllers[1],preview,'percussion'))[0];
      await r.loadNoteFont();
      check(extra.noteLabelGroup?.visible&&extra.noteLabelMesh&&extra.noteLabelGroup.scale.x===.4,'Font arrival creates visible text at the shared tutorial size');
      r.applyScalePresetNote(extra,{label:'C',semitonesFromF:-5,octaveOffset:0});
      check(extra.noteLabelTextValue==='C4'&&extra.noteLabelGroup.scale.x===.4,'Retuning updates native pitch text without resizing it');
      r.deleteInstrument(extra);
    }finally{r.noteFont=font;}
    const honks=r.instrumentRegistry.getByKind('honk');
    check(honks.every(h=>h.noteLabelGroup?.visible&&h.noteLabelMesh?.visible&&h.noteLabelMesh.geometry.attributes.position.count),'Native notes remain visible on all tutorial Honks');
    check(honks.every(h=>Math.abs(h.noteLabelGroup.scale.x-.4)<1e-8),'One consistent base note-text scale across chords, melody and percussion');
    for(const h of honks){for(let i=0;i<4;i++)a.labelPresentation.styleNote(h);r.updateNoteLabel(h);}
    check(honks.every(h=>Math.abs(h.noteLabelGroup.scale.x-.4)<1e-8),'Repeated note refresh is idempotent');
    check(a.labels.size===7&&C.backing.every(g=>a.labels.has(g.role)),'Exactly one billboard per chord group, clock and Looper');
    // Independent geometry bounds, evaluated once for validation, never per frame.
    const visualBounds=role=>{
      const box=new THREE.Box3(),vertex=new THREE.Vector3();
      for(const h of a.members(role))h.root.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
        for(let node=mesh;node;node=node.parent)if(!node.visible||node.userData.tutorialBillboard||node.userData.isMetronomeDebug||node.name.startsWith('DEBUG_')||node.userData.isHitTarget&&!node.userData.usesVisibleMeshForGrip)return;
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        if(materials.every(m=>!m||m.visible===false||m.opacity===0||m.wireframe))return;
        mesh.updateWorldMatrix(true,false);
        for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,vertex);box.expandByPoint(vertex.applyMatrix4(mesh.matrixWorld));}
      });
      for(const h of a.members(role)){
        const text=h.metronomeLabelMesh||h.tempoLabel?.sprite;
        if(text?.isSprite&&text.visible){const position=text.getWorldPosition(new THREE.Vector3()),scale=text.getWorldScale(new THREE.Vector3());box.union(new THREE.Box3().setFromCenterAndSize(position,new THREE.Vector3(Math.abs(scale.x),Math.abs(scale.y),.001)));}
      }
      return box;
    };
    const labels=()=>{a.labelPresentation.update();return [...a.labels].map(([role,label])=>{
      const body=visualBounds(role),position=label.getWorldPosition(new THREE.Vector3()),scale=label.getWorldScale(new THREE.Vector3());
      const clearance=position.y-Math.abs(scale.y)/2-body.max.y;
      check(clearance>=.0349,role+' billboard clears complete visual bounds');
      check(new THREE.Raycaster(position.clone().add(new THREE.Vector3(0,0,1)),new THREE.Vector3(0,0,-1)).intersectObject(label).length===0,'Billboard cannot intercept rays');
      return {role,clearance,position:position.toArray()};
    });};
    report.labels=labels();
    const original={position:chords.root.position.clone(),rotation:chords.root.quaternion.clone(),scale:chords.root.scale.clone()};
    chords.root.rotation.x+=.5;chords.root.scale.multiplyScalar(1.25);chords.root.position.y+=.12;chords.root.updateMatrixWorld(true);
    labels();chords.root.position.copy(original.position);chords.root.quaternion.copy(original.rotation);chords.root.scale.copy(original.scale);chords.root.updateMatrixWorld(true);
    const cached=a.labelPresentation.collections;
    for(let i=0;i<120;i++)a.labelPresentation.update();
    check(a.labelPresentation.collections===cached,'Repeated label updates reuse cached mesh collections');
    const times=[];for(let i=0;i<200;i++){const start=performance.now();a.labelPresentation.update();times.push(performance.now()-start);}
    times.sort((x,y)=>x-y);report.labelCpuMs={median:times[100],p95:times[190],collections:cached};
    let mutations=0;const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(t.panel.dom,{subtree:true,childList:true,attributes:true,characterData:true});
    await delay(1100);observer.disconnect();check(mutations===0,'Idle panel incurs no DOM mutations');
    await go('learn-C4');six();
    report.noteTexts=honks.map(h=>({text:h.noteLabelTextValue,scale:h.noteLabelGroup.scale.x}));
    globalThis.tutorialTestProgress?.(JSON.stringify({step:'tutorial-radial',seconds:0}));
    await delay(1200);
    return {controller,checks:report,restoreControllers:()=>controllers.forEach((c,i)=>{c.userData.handedness=saved[i].hand;c.matrixAutoUpdate=saved[i].auto;c.position.copy(saved[i].position);c.quaternion.copy(saved[i].quaternion);c.updateMatrixWorld(true);})};
  } catch(error){error.message+=' [step '+t.session?.step?.id+']';throw error;}
}

export async function validateStandalone(app){
  const result=await validateLearnerFlow(app),r=app.runtime,t=r.tutorial;
  try {
    await t.enterPlay();
    const controller=result.controller,THREE=await import('three');
    // Free-play placement of the same radial recipe retains normal defaults.
    const categories=r.spawnCatalog.getRadialCategories(),state=r.controllerStates.get(controller),menu=r.spawnMenuController;
    const send=(button,pressed)=>r.interactionCoordinator.receiveInput({type:'button.transition',controller,handedness:controller.userData.handedness,button,pressed,timestamp:performance.now()});
    const menuButton=controller.userData.handedness==='left'?'secondary':'primary';
    controller.position.set(5,2,2);controller.quaternion.identity();controller.updateMatrixWorld(true);send(menuButton,true);
    const index=categories.findIndex(category=>category.entries.some(entry=>entry.id==='jog-group-1'));
    const rollTo=predicate=>{for(let i=0;i<720;i++){controller.rotation.z+=.015;controller.updateMatrixWorld(true);menu.update(controller,state);if(predicate())return;}throw new Error('Free-play radial selection failed');};
    rollTo(()=>state.radialMenuParentSelectedIndex===index);
    controller.position.addScaledVector(state.radialMenuPullAxis,.08);controller.updateMatrixWorld(true);menu.update(controller,state);
    rollTo(()=>categories[index].entries[state.radialMenuChildSelectedIndex]?.id==='jog-group-1');send(menuButton,false);
    const preview=r.pendingSpawnPlacement;send('trigger',true);send('trigger',false);
    if(!preview||r.pendingSpawnPlacement||preview.instruments.some(h=>h.locked||h.noteLabelGroup.scale.x!==1))throw new Error('Free-play radial defaults changed');
    result.checks.checks.push('Free-play composition chord remains unlocked with normal native text');
    preview.instruments.forEach(h=>r.deleteInstrument(h));
    return result.checks;
  } finally {result.restoreControllers();await t.enterPlay();}
}
