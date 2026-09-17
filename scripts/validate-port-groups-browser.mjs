// Full Jog run followed by a learner switch exercise through the real panel
// actions. Uses normal wall time, recorded gestures and Web Audio scheduling.
export async function validate(app,{onProgress=()=>{}}={}) {
  const r=app.runtime,t=r.tutorial;
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(fn,timeout=330000)=>{const start=performance.now();while(!fn()){check(performance.now()-start<timeout,`Timed out: ${t.session?.step?.id}: ${t.session?.feedback}`);await wait(50);}};
  await until(()=>app.initialized,30000);
  await r.audioSystem.ensureAudio();await t.enter('simulation');
  let last=null,queuedSeen=false;const switches=new Map();
  await until(()=>{
    const s=t.session;
    if(s?.step?.id!==last){last=s?.step?.id;onProgress(last);}
    check(!s?.failed,`Simulation failed: ${s?.step?.id}: ${s?.feedback}`);
    check(!t.conductor?.paused,`Simulation paused: ${s?.feedback}`);
    for(const role of ['chordLooper','alternativeLooper']) {
      const data=t.adapter.get(role)?.looperData;if(!data)continue;
      queuedSeen ||= data.queued;
      for(const e of data.switchHistory)switches.set(e.id,e);
    }
    return s?.complete;
  });
  check(queuedSeen&&switches.size===2,'Simulation must observe queued states and actual switches in both directions');
  check(t.report.checkpoints.includes('switch-patterns'),'Simulation switch predicate did not complete');
  check(t.practiceProgress===null,'Simulation must not award learner credit');
  const a=t.adapter.get('chordLooper'),b=t.adapter.get('alternativeLooper'),drums=t.adapter.get('percussionLooper'),metro=t.adapter.get('metronome');
  check(a.timeline.hasRecording()&&b.timeline.hasRecording()&&drums.timeline.hasRecording(),'All three loopers retain their one recording');
  const links=r.metronomeConnectionManager.getConnectionsForMetronome(metro.id);
  check(links.length===3&&r.metronomeConnectionWires.size===3,'Each connection has its own visible cable');
  const link=h=>links.find(c=>c.targetId===h.id);
  check(link(a).portId===link(b).portId&&link(drums).portId!==link(a).portId,'Alternatives share one output; drums use a different output');
  const scene=r.sceneSerializer.serialize();
  check(scene.relationships.metronomeConnections.length===3,'Session serializes every fan-out connection');
  const snapshots=[a,b,drums].map(h=>JSON.stringify(h.timeline.toJSON()));
  // Reuse the actual completed recordings for practice. No generated takes or
  // artificial handoff events: every selection goes through normal Play.
  const {TutorialSession}=await import('../src/tutorial/TutorialSession.js');
  const {LESSON_STEPS}=await import('../src/tutorial/lessonSteps.js');
  const step=LESSON_STEPS.find(s=>s.type==='switch');
  t.conductor.stop();t.conductor=null;t.report=null;
  t.session=new TutorialSession({steps:[step],now:performance.now()});
  metro.play();await t.flow.demonstrate();onProgress('switch demonstration');
  await until(()=>!t.demo,45000);
  check(t.session.demonstrated.has(step.id)&&t.session.checkpoints.size===0,'Demonstrate completes without learner credit');
  check([a,b,drums].every((h,i)=>JSON.stringify(h.timeline.toJSON())===snapshots[i]),'Demonstrate preserves each recording');
  await t.flow.practice();onProgress('learner switch');
  let forward=false,back=false;
  await until(()=>{
    const phase=h=>h.looperController.getAbsoluteSourcePosition(h,performance.now())%h.timeline.durationMs/h.timeline.durationMs;
    if(!forward&&a.transport.playing&&phase(a)>.25){t.action('play-alternativeLooper');forward=true;}
    if(!back&&b.transport.playing&&phase(b)>.25){t.action('play-chordLooper');back=true;}
    return t.session.phase==='results';
  },45000);
  check(t.session.result.ok&&t.session.checkpoints.has(step.id),'Learner credit requires both real completed handoffs');
  check([a,b,drums].every((h,i)=>JSON.stringify(h.timeline.toJSON())===snapshots[i]),'Switching preserves all recordings');
  const learner=t.session.exportProgress();
  t.adapter.clear();
  const restored=await r.sceneRestorer.restore(scene);
  check(!restored.skipped.length&&!restored.skippedConnections.length,'All scene endpoints and relationships restore');
  check(r.metronomeConnectionManager.getConnections().length===3&&r.metronomeConnectionWires.size===3,'Save/load restores all fan-out cables');
  check(r.instrumentRegistry.getByKind('looper').every(h=>!h.looperData.playing&&!h.looperData.queued&&!h.looperData.pendingLaunch),'Restore never starts stale playback');
  r.metronomeConnectionManager.disconnectTarget('looper',b.id);
  check(r.metronomeConnectionWires.size===2&&r.metronomeConnectionManager.getConnectionsForPort(metro.id,link(a).portId).length===1,'Removing one cable keeps the other group member');
  await t.enterPlay();
  return {simulationSwitches:[...switches.values()],queuedSeen,cables:links.length,demonstrationCredit:false,learner,saveLoad:true,individualRemoval:true,restored:true};
}
