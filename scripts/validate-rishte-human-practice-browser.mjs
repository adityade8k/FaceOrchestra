// Browser-only learner simulation through the ordinary two controller rays.
export async function validate() {
 const {r,t,d,check,wait}=window.__rishte,a=t.adapter,metro=a.get('metronome');
 d.index=2;d.cancel();metro.setBpm(75);
 const update=d.update.bind(d);let changed=false,drift=0;const interruptions=[];
 d.update=now=>{
  if(d.phase==='practice'){
   if(now-d.last>250||r.audioSystem.audioContextService.context?.state!=='running')interruptions.push({gap:now-d.last,state:r.audioSystem.audioContextService.context?.state,beat:d.ensemble.beatAt(now)});
   const beat=d.ensemble.beatAt(now);
   if(!changed&&beat>d.step.startBeat+.6){metro.setBpm(40);changed=true;}
   d.ensemble.hands.play(d.guide.step.events,beat,now,{swapHands:true});
   if(changed&&beat>d.step.startBeat+1)for(const h of d.ensemble.loopers.filter(h=>h.transport.playing)){
    const bank=Number(a.roleForId(h.id).slice(-1)),index=d.ensemble.bankAssignments.get(bank)?.index;
    if(index!==undefined)drift=Math.max(drift,Math.abs(h.looperController.getAbsoluteSourcePosition(h,now)/(60000/d.definition.bpm)-(beat-d.ensemble.blocks[index].beat)));
   }
  }
  update(now);
 };
 await t.action('step-practice');check(metro.bpm===50,'Hard phrase should initially slow to 50 BPM');a.setVirtualsActive(true,'learner');
 const deadline=performance.now()+22000;while(d.phase&&performance.now()<deadline)await wait(40);
 d.update=update;check(!d.phase&&d.outcomes[d.step.id]==='passed','Two-hand assessment failed: '+d.feedback+' '+JSON.stringify(interruptions));
 check(changed&&drift<.01,'Clock drift after tempo change '+drift);
 const practice={feedback:d.feedback,observations:d.heard.length,swappedHandsAccepted:true,backingDriftBeats:drift,tempoHistory:d.ensemble.history};
 d.index=0;d.cancel();metro.setBpm(75);await t.action('step-practice');check(d.heard.length===0,'Retry reused observations');
 const retryDeadline=performance.now()+14000;while(d.phase&&performance.now()<retryDeadline)await wait(40);
 check(!d.phase&&d.outcomes[d.step.id]==='retry','Empty practice passed');
 const h=a.get('foundation-0'),c=h.looperController;
 const takeRole=a.roleForId(h.tracks.find(tr=>tr.connectedHonkId!=null).connectedHonkId);
 metro.beatOriginMs=null;metro.play(performance.now());c.startRecording(h,performance.now());
 a.setVirtualsActive(true,'learner');a.squeeze(takeRole,true);await wait(550);a.squeeze(null,false);await wait(150);c.stopRecording(h,performance.now());a.setVirtualsActive(false);metro.pause();
 check(h.timeline.hasRecording(),'Real recorded take missing');const take=JSON.stringify(c.serializeState(h));
 await t.action('rishte-preview');await wait(400);await t.action('rishte-stop');check(JSON.stringify(c.serializeState(h))===take,'Preview lost take');
 await t.action('next-step');await t.action('previous-step');check(JSON.stringify(c.serializeState(h))===take,'Navigation lost take');
 await t.action('rishte-preview');await wait(200);c.startRecording(h,performance.now());await wait(150);
 check(!d.phase&&JSON.stringify(c.serializeState(h))===take,'Cancelled record arm replaced take');
 await t.action('rishte-preview');await wait(200);c.clearRecording(h);await wait(150);check(!d.phase&&!h.timeline.hasRecording(),'New take overwritten');
 await t.action('rishte-preview');await wait(200);metro.pause();await wait(150);check(!d.phase,'Metronome stop left playback');
 d.index=8;d.cancel();metro.setBpm(75);await t.action('step-practice');check(metro.bpm===40,'Fast phrase should initially slow to 40 BPM');await t.action('rishte-stop');
 d.index=d.definition.lessons.length-1;d.cancel();check(d.step.completePerformance,'Complete melody lesson missing');
 await t.action('step-practice');await wait(200);await t.action('exit');check(!t.dataTutorial&&r.instrumentRegistry.size===0,'Exit did not restore Play');
 r.createSpawnedComponent('honk',{name:'Saved learner Honk'});const savedHonk=r.activeInstrumentState;
 r.createSpawnedComponent('looper',{name:'Saved learner take'});const savedLooper=r.activeInstrumentState;r.connectLooperTrackToHonk(savedLooper,1,savedHonk.id);
 const {compilePattern}=await import('../src/compositions/CompositionCompiler.js');
 const seed=compilePattern({events:[{role:'seed',beat:0,beats:.75}],beats:2,beatMs:700,routes:{seed:{trackId:savedLooper.tracks[1].trackId,trackIndex:1}}});
 savedLooper.looperController.restoreState(savedLooper,{timeline:seed.toJSON(),controls:{recordBeats:2,gap:-1,volume:-.2}},{preserveConnections:true});
 const saved=r.sceneSerializer.serialize();await t.action('tutorials');await t.action('composition:rishte-naate');await t.action('rishte-preview');await wait(200);await t.action('exit');
 check(JSON.stringify(r.sceneSerializer.serialize())===JSON.stringify(saved),'Play workspace changed');
 await t.action('record-songs');await t.action('composition:rishte-naate');check(t.jogRecording?.composition.contentVersion===3,'Record Songs stale version');await t.enterPlay();
 return {practice,emptyRetryRejected:true,learnerTakePreserved:true,cancelledRecordArmPreserved:true,newTakePreserved:true,slowerPhraseTempos:[50,40],metronomeStop:true,cleanExit:true,playWorkspaceRestored:true,recordSongsVersion:3};
}
