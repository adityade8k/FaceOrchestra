export async function validate(app, {id='kuch-to-hua-hai', full=false, recording=true}={}) {
  const r=app.runtime,t=r.tutorial,checks=[];
  const check=(value,message)=>{if(!value)throw new Error(`${id}: ${message}`);checks.push(message);};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  await t.enterPlay(); const before=r.sceneSerializer.serialize();
  await t.selectComposition(id,'tutorials');
  const d=t.dataTutorial;
  check(d?.ensemble.prepared,'Tutorial prepares');
  const e=d.ensemble,metro=e.metro;
  const fixed=()=>JSON.stringify((e.loopers||[]).map(h=>[h.timeline.toJSON(),h.tracks.map(t=>t.connectedHonkId),
    r.metronomeConnectionManager.getConnectionForTarget('looper',h.id)?.portId]));
  let initial; const count=r.instrumentRegistry.size, preparedLoopers=e.loopers?.length??0;
  const originalPosition=e.layoutFrame.root.position.clone();
  e.layoutFrame.apply(originalPosition.clone().add({x:.1,y:0,z:0}),1.1);
  check(e.layoutFrame.scale>1,'Melody frame moves and scales');
  e.layoutFrame.reset();
  check(e.layoutFrame.root.position.distanceTo(originalPosition)<1e-6,'Melody frame resets');
  await t.action('tempo-down'); const chosen=metro.bpm;
  await t.action('step-practice');
  initial=fixed();
  check(d.phase==='practice'&&metro.bpm===chosen,'Practice retains chosen tempo');
  await wait(200);await t.action('rishte-stop');
  check(!d.phase&&fixed()===initial,'Stop preserves fixed takes and connections');
  check((e.loopers||[]).every(h=>!h.looperData.pendingLaunch&&!h.looperData.queued),'Stop cancels queued transport');
  metro.setBpm(d.definition.bpm);d.tempoSelected=true;
  const attacks=[],backingAttacks=[];
  const percussion=r.playStickPercussion.bind(r);
  r.playStickPercussion=(sound,options={})=>{backingAttacks.push({sound,time:options.scheduledTime});return percussion(sound,options);};
  const melodyRoles=new Set(d.definition.score.events.map(n=>n.role));
  const starts=[];
  for(const {role} of d.definition.arrangement.recipes.filter(r=>r.kind==='honk')){const h=t.adapter.get(role),original=h.startAudioVoice.bind(h);
    h.startAudioVoice=(voice,options={})=>{if(melodyRoles.has(role))attacks.push({role,at:performance.now()});else backingAttacks.push({role,time:options.scheduledTime});return original(voice,options);};starts.push([h,original]);}
  await t.action(full?'rishte-preview':'step-demo');
  initial=fixed();
  check(d.phase==='demo','Demonstration starts');
  const anchor=e.anchor,audioAnchor=e.audioAnchor&&{...e.audioAnchor};
  const deadline=performance.now()+((full?d.definition.score.durationBeats:d.step.endBeat-d.step.startBeat)+8)*60000/metro.bpm+15000;
  let frames=0;
  while(d.phase&&performance.now()<deadline){
    if(fixed()!==initial)throw new Error('A backing take or route mutated during the performance');
    frames++;await wait(50);
  }
  check(!d.phase&&/complete/.test(d.feedback),'Demonstration completes');
  check(!Object.keys(d.outcomes).length,'Demonstration earns no learner credit');
  const expected=(full?d.definition.score.events:d.definition.score.events.filter(n=>d.step.eventIds.includes(n.id))).map(n=>n.role);
  check(JSON.stringify(attacks.map(n=>n.role))===JSON.stringify(expected),'Authored melody attack order and count');
  starts.forEach(([h,start])=>h.startAudioVoice=start);r.playStickPercussion=percussion;
  if(d.definition.arrangement.backing.length){
    const start=full?0:d.step.startBeat,end=full?d.definition.score.durationBeats:d.step.endBeat;
    const source=d.definition.arrangement.backing.filter(n=>n.beat<end&&n.beat+n.beats>start);
    check(backingAttacks.length===source.length,`Backing attack count: ${backingAttacks.length}/${source.length}`);
    const zero=audioAnchor.audioSeconds+(anchor-audioAnchor.wallMs)/1000;
    for(const role of new Set(source.map(n=>n.role))){
      const wanted=source.filter(n=>n.role===role).sort((a,b)=>a.beat-b.beat);
      const heard=backingAttacks.filter(n=>n.role===role||n.sound&&n.sound===wanted[0].sound).sort((a,b)=>a.time-b.time);
      if(heard.length!==wanted.length||heard.some((n,i)=>Math.abs(n.time-zero-(Math.max(wanted[i].beat,start)-start)*60/metro.bpm)>.002))
        throw new Error(`${id}: backing pitch/strike or scheduled onset mismatch: ${role}`);
    }
    checks.push('All backing pitches/strikes and scheduled onsets match');
  }
  check(fixed()===initial,'Fixed recordings and connections survive the run');
  await t.action('exit');check(JSON.stringify(r.sceneSerializer.serialize())===JSON.stringify(before),'Tutorial restores free play');
  let saved;
  if(recording){
    await t.selectComposition(id,'record-songs');const mode=t.jogRecording;
    mode.trackingReady=()=>true;
    const start=r.capture.startReady.bind(r.capture);
    r.capture.startReady=options=>start({...options,synthetic:true});
    try {
      await r.capture.pair('123456');await mode.action('prepare');
      check(mode.phase==='ready','Guided recording prepares');
      await mode.action('start');check(mode.phase==='count-in',mode.phase==='count-in'?'Guided recording counts in':'Guided recording failed: '+mode.feedback+' '+JSON.stringify(r.capture.saved?.gaps));
      await wait(4*60000/(mode.composition.recording.bpm??mode.composition.bpm)+500);
      check(mode.phase==='performing','Guided recording starts');
      check(mode.guidance()?.step.events.length===mode.composition.score.events.length,'Recording shares canonical guidance');
      await mode.action('stop');saved=r.capture.saved;
      check(saved?.complete&&saved.performance.compositionId===id,'Guided take saves with stable composition identity');
      await mode.action('exit');
      check(JSON.stringify(r.sceneSerializer.serialize())===JSON.stringify(before),'Recording restores free play');
    } finally { r.capture.startReady=start; }
  }
  return {id,title:d.definition.title,instruments:count,loopers:preparedLoopers,frames,checks,take:saved?.id};
}
