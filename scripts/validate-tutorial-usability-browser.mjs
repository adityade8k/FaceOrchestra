// Real panel clicks and physical-controller transitions. No fabricated evidence.
export async function validateLearnerFlow(app,{click,wait,check,onProgress,realTake}) {
  const r=app.runtime,t=r.tutorial,a=t.adapter;
  const {COMPOSITION:C,bendAt}=await import('../src/tutorial/composition.js');
  const {MAX_PITCH_BEND_SEMITONES,BEND_SENSITIVITY}=await import('../src/config/honk.js');
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const next=async()=>{const index=t.session.index;await click('next-step');await wait(()=>t.session.index!==index||t.flow.pending||Boolean(t.uiFeedback&&!t.flow.preparing),`Next from ${t.session.step?.id}`,10000);};
  const demo=async()=>{await click('step-demo');await wait(()=>t.demo||!t.flow.preparing,'demo start',10000);const running=t.demo;check(running,`Demo started: ${t.session.step.id}: ${t.uiFeedback}`);await wait(()=>!t.demo,'demo completion',65000);check(running.session.complete,`Demo completed: ${running.session.feedback} / ${t.uiFeedback}`);};
  const result=async()=>wait(()=>t.session.phase==='results',`result ${t.session.step.id}`,35000);
  const controller=r.controllers.find(c=>!c.userData.virtualTutorial);controller.matrixAutoUpdate=true;
  const pose=role=>{const h=a.get(role);controller.position.copy(h.getSqueezeColliderSphere().center);controller.position.z+=.38;controller.quaternion.identity();controller.updateMatrixWorld(true);check(r.getCurrentHit(controller)?.object===h.squeezeCollider,`Real target ray ${role}`);};
  const squeeze=async(role,ms=650)=>{pose(role);a.input(controller,'trigger',true);await delay(ms);a.input(controller,'trigger',false);await delay(100);};
  const layout=()=>[...t.panel.dom.querySelectorAll('.tutorial-navigation button')].map(n=>({id:n.dataset.action,x:n.offsetLeft,y:n.offsetTop}));
  const counts=()=>r.instrumentRegistry.getByKind('metronome').length;
  await click('tutorial');await click('practice');
  const fixed=layout();check(fixed.map(b=>b.id).join(',')==='previous-step,next-step,step-demo,step-practice','Four stable step controls');
  await demo();check(t.panel.buttonNodes.get('step-practice').dataset.primary==='true','Practice becomes primary after demonstration');
  await click('step-practice');await result();check(t.session.index===0,'Current-step Practice does not restart or auto advance');
  await delay(350);check(t.session.phase==='results','Result remains visible');await next();
  // Cancel a real spawn preview, then complete the same spawn demonstration.
  await click('step-demo');await wait(()=>r.pendingSpawnPlacement,'demonstration preview',5000);await click('previous-step');
  check(!r.pendingSpawnPlacement&&!t.demo&&counts()===0,'Navigation cancels pending placement and demonstration');
  await next();await demo();check(counts()===1,'One demonstrated Metronome');
  await click('step-practice');await result();check(t.session.outcomes.get('metronome').status==='assisted','Assisted setup is distinct from a learner pass');
  const firstMetro=a.get('metronome').id;await click('spawn-step');check(counts()===1&&a.get('metronome').id===firstMetro,'Spawn is idempotent');await next();
  const demonstratedTypes=new Set(['spawn']);
  while(t.session.step.id!=='audition-E') {
    const step=t.session.step,index=t.session.index;
    if(!demonstratedTypes.has(step.type)){await demo();demonstratedTypes.add(step.type);}
    await next();check(t.session.index===index+1,`Setup Next ${step.id}: ${t.uiFeedback}`);
    check(counts()===1,'Skipping setup never creates a duplicate clock');
  }
  check(JSON.stringify(layout())===JSON.stringify(fixed),'Navigation controls retain their positions across steps');
  check([...a.labels.keys()].every(id=>r.instrumentRegistry.get(id).kind!=='honk'),'No floating Honk sprites');
  // Rewire actual instruments to different tracks/clock ports and chord members.
  const chords=a.get('chordLooper'),percussion=a.get('percussionLooper'),metro=a.get('metronome');
  for(const g of C.backing)for(const id of a.ids(g.role))chords.disconnectHonk(id);
  for(const [i,g] of C.backing.entries())r.connectLooperTrackToHonk(chords,[6,2,7,4][i],a.ids(g.role)[1]);
  const ports=[...metro.connectionPorts.keys()];
  r.metronomeConnectionManager.connect({metronomeId:metro.id,portId:ports[2],targetKind:'looper',targetId:chords.id,targetPortId:chords.tracks[5].trackId});
  r.metronomeConnectionManager.connect({metronomeId:metro.id,portId:ports[3],targetKind:'looper',targetId:percussion.id,targetPortId:percussion.tracks[3].trackId});
  a.snapshotAt=-Infinity;const wiring=JSON.stringify(a.snapshot(performance.now()).routes);
  await click('prepare-step');await wait(()=>!t.flow.preparing,'arbitrary routes preparation',10000);
  check(JSON.stringify(a.snapshot(performance.now()).routes)===wiring,'Preparation preserves valid arbitrary routes and representative members');
  const auditionIndex=t.session.index;
  // Reuse only the genuine earlier take to verify playback never becomes input.
  if(realTake){chords.restoreTimeline({timeline:realTake,controls:{gap:-1,volume:-.55}},{preserveConnections:true});chords.play(performance.now());
    await delay(1500);check(t.session.evidence.length===0,'Playback earns no learner evidence');chords.stop();}
  await demo();check(t.session.evidence.length===0&&!t.session.checkpoints.has('audition-E'),'Demonstrated notes earn no learner credit');
  await click('step-practice');await squeeze('group-2');await result();check(!t.session.result.ok,'Wrong real target receives feedback');
  const failed=t.session.result;await delay(300);check(t.session.result===failed,'Failure result persists');
  await click('step-practice');await squeeze('group-1');await result();check(t.session.result.ok&&t.session.result.score===100,'Correct real chord receives 100 and waits');
  globalThis.tutorialResultPanelPng=t.panel.canvas.toDataURL('image/png');
  check(t.session.index===auditionIndex,'Passing does not auto advance');
  await next();await demo();await click('step-practice');await squeeze('group-1');await result();check(t.session.result.ok,'O vowel practice');await next();
  r.setLooperControlValue(chords,'volume',1);await demo();
  check(a.snapshot(performance.now()).timbreReady,'Settings demonstration keeps its valid backing balance');
  await click('step-practice');await result();await next();
  // A held physical gesture is cancelled by navigation and cannot complete reentry.
  await click('step-practice');pose('group-1');a.input(controller,'trigger',true);await delay(200);await click('previous-step');await delay(120);
  check(r.audioSystem.honkVoices.voices.size===0&&a.gestures.size===0,'Navigation releases every held voice');await next();
  r.interactionCoordinator.receiveInput({type:'button.transition',controller,button:'trigger',pressed:false,timestamp:performance.now()});
  check(t.session.evidence.length===0&&t.session.phase==='ready','Reentry discards old gesture evidence');await next();
  onProgress({step:'learner chord timing and release grace',seconds:0});
  await click('step-practice');const oldAnchor=t.session.anchorMs;await click('previous-step');await next();
  check(t.session.anchorMs===null,'Navigation cancels the outgoing count-in');
  await click('step-practice');check(t.session.anchorMs>=oldAnchor&&t.session.evidence.length===0,'Retry owns a fresh attempt on a valid clock boundary');
  const session=t.session;let held=null;
  // Last release is intentionally a little past the nominal endpoint.
  while(session.phase==='practicing'){
    await new Promise(requestAnimationFrame);const now=performance.now(),beat=(now-session.anchorMs)/session.beatMs;
    const target=C.backing.find((g,i)=>beat>=g.beat&&beat<(i===3?16.08:g.beat+g.beats));
    if(target?.role!==held){if(held)a.input(controller,'trigger',false);held=target?.role||null;if(held){pose(held);a.input(controller,'trigger',true);}}
  }
  check(session.result.details.at(-1).heard==='group-4','Late final release was heard before scoring');
  check(session.result.ok,'Forgiving rehearsal accepts a final release within tolerance');
  await next();check(t.session.step.id==='record-chords','Rehearsal exits to recording');
  // Missing recordings are explicit conductor actions, with a resumable Next.
  chords.clearRecording();delete a.takeEvidence.chordLooper;a.snapshotAt=-Infinity;
  await next();check(t.session.step.id==='record-chords'&&t.flow.pending?.missing.includes('chordLooper'),'Next offers real missing backing preparation');
  await click('record-backing');await wait(()=>t.demo,'Record Backing begins',10000);await wait(()=>!t.demo&&!t.flow.preparing&&t.session.step.id==='finalize-chords',`record backing: ${t.uiFeedback}`,65000);
  check(chords.timeline.durationMs===12000&&a.takeEvidence.chordLooper.filter(e=>e.kind==='note').length===4,'Assistance captured four real chords through arbitrary tracks');
  check(!t.session.checkpoints.has('record-chords'),'Assisted recording gives no learner recording credit');
  await click('step-practice');await result();check(t.session.result.ok,'Finalization checks captured evidence without a stall');
  const savedChords=JSON.stringify(chords.timeline.toJSON());await next();
  await click('step-practice');await result();check(t.session.result.ok,'Learner hears a real complete solo chord cycle');await next();
  // Place and wire percussion through Next; test actual stick demonstration.
  while(t.session.step.id!=='tap-percussion')await next();
  await demo();check(t.session.evidence.length===0,'Real percussion demonstration earns no learner evidence');
  while(t.session.step.id!=='record-percussion')await next();
  await next();check(t.flow.pending?.missing.includes('percussionLooper'),'Missing percussion has an explicit action');
  await click('record-percussion');await wait(()=>t.demo,'Record Percussion begins',10000);
  // Delayed-frame recovery restores both completed takes before retrying.
  t.demo.conductor.lastNow=performance.now()-1000;await wait(()=>!t.demo,'delayed-frame demo recovery',5000);
  check(JSON.stringify(chords.timeline.toJSON())===savedChords,'Interrupted percussion preserves backing');
  await click('record-percussion');await wait(()=>t.demo,'Record Percussion retry',10000);
  await wait(()=>!t.demo&&!t.flow.preparing&&t.session.step.id==='finalize-percussion',`percussion recording: ${t.uiFeedback}`,65000);
  check(a.takeEvidence.percussionLooper.filter(e=>e.kind==='strike'&&e.recordedCount===1).length===12,'Twelve real recorded collisions');
  check(JSON.stringify(chords.timeline.toJSON())===savedChords,'Percussion assistance preserves the chord take');
  await click('step-practice');await result();check(t.session.result.ok,'Percussion finalization is recoverable');
  const savedDrums=JSON.stringify(percussion.timeline.toJSON());
  await next();await click('step-practice');await result();check(t.session.result.ok,'Learner hears a real complete solo percussion cycle');
  await next();await demo();await click('step-practice');await result();check(t.session.result.ok,'Learner Start All verifies both observed, aligned parts');
  while(t.session.step.id!=='learn-bend')await next();
  await demo();await click('step-practice');pose('melody-Eb4');a.input(controller,'trigger',true);
  const start=performance.now();while(performance.now()-start<2250){await new Promise(requestAnimationFrame);controller.rotation.z=bendAt(C.phrases.A.find(e=>e.bend).bend,(performance.now()-start)/2250)/MAX_PITCH_BEND_SEMITONES/BEND_SENSITIVITY;controller.updateMatrixWorld(true);}
  a.input(controller,'trigger',false);await result();check(t.session.result.components.bend===100,'Real continuous learner bend is scored');
  await next();await demo();check(!t.session.checkpoints.has('phrase-A'),'Phrase demonstration has no learner credit');
  while(t.session.step.id!=='performance')await next();
  check(JSON.stringify(chords.timeline.toJSON())===savedChords&&JSON.stringify(percussion.timeline.toJSON())===savedDrums,'Navigation preserves both completed takes');
  check(counts()===1&&r.audioSystem.honkVoices.voices.size===0,'No duplicate clock or stuck voice after all navigation');
  check(JSON.stringify(layout())===JSON.stringify(fixed),'Stable controls through the entire lesson');
  const THREE=await import('three'),h=a.get('percussion'),original=a.cacheStrikeTarget('percussion').clone(),misses=a.bodyTargets.misses;
  h.root.position.x+=.08;h.root.rotation.y+=.25;h.root.scale.multiplyScalar(1.04);h.setVowel('O');h.setNose(.6);await delay(200);
  const moved=a.cacheStrikeTarget('percussion').clone();check(moved.distanceTo(original)>.02&&a.bodyTargets.misses===misses,'Moved, rotated and deformed target reuses its current real triangle');
  const entry=a.bodyTargets.entries.get('percussion'),mesh=entry.mesh,v=[0,1,2].map(()=>new THREE.Vector3());
  for(const [i,key] of ['a','b','c'].entries())mesh.getVertexPosition(entry.face[key],v[i]);
  const bary=entry.barycentric,expected=v[0].multiplyScalar(bary.x).addScaledVector(v[1],bary.y).addScaledVector(v[2],bary.z).applyMatrix4(mesh.matrixWorld);
  check(expected.distanceTo(moved)<1e-8,'Cached point follows actual morphed vertices');
  const geometry=mesh.geometry;mesh.geometry=geometry.clone();a.cacheStrikeTarget('percussion');check(a.bodyTargets.misses===misses+1,'Geometry replacement invalidates target cache');mesh.geometry.dispose();mesh.geometry=geometry;
  r.deleteInstrument(h);check(a.cacheStrikeTarget('percussion')===null&&!a.bodyTargets.entries.has('percussion'),'Deleted target clears cache');
  return {controller,checks:{allStepNavigation:true,demonstratePracticeResults:true,explicitRecordingPreparation:true,arbitraryRealTracks:true,lateRelease:true,bend:true,recordingPreservation:true}};
}

export async function validateStandalone(app){
  const t=app.runtime.tutorial;
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=async(predicate,message,timeout=30000)=>{const end=performance.now()+timeout;while(!predicate()){if(performance.now()>end)throw new Error(`${message}: ${t.session?.step?.id} / ${t.uiFeedback} / ${t.session?.feedback}`);await new Promise(r=>setTimeout(r,50));}};
  const click=async id=>{await wait(()=>t.panel.buttonNodes.has(id),`button ${id}`,10000);const node=t.panel.buttonNodes.get(id);check(!node.disabled,`Action ${id} is available: ${node.title}`);node.click();await new Promise(r=>setTimeout(r,150));};
  await wait(()=>app.initialized,'assets');await t.enterPlay();
  try{return (await validateLearnerFlow(app,{click,wait,check,onProgress:p=>globalThis.tutorialTestProgress?.(JSON.stringify(p))})).checks;}
  finally{await t.enterPlay();}
}
