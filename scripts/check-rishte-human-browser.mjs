import { startServer } from "./capture/server.mjs";
import { launchChrome } from "./capture/chrome.mjs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "honk-rishte-human-"));
let service, browser;
try {
  await mkdir("test-results/rishte-human", { recursive: true });
  service = await startServer({ host: "127.0.0.1", port: 0, plain: true, dataRoot: root });
  if (process.platform === "darwin") process.env.CAPTURE_SOFTWARE_GL ??= "0";
  browser = await launchChrome();
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await browser.send("Page.bringToFront");
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const prepared = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    for(let i=0;i<300&&!app.runtime.tutorial.ready;i++)await new Promise(r=>setTimeout(r,100));
    const r=app.runtime,t=r.tutorial;
    // Keep native WebGL/Web Audio, but avoid GPU stalls from the headless
    // desktop renderer. This is a test setting, not an app quality change.
    r.renderer.setPixelRatio(.5);
    await t.action('play');await t.action('tutorials');await t.action('composition:rishte-naate');
    if(!t.dataTutorial?.ensemble.prepared)throw new Error('Prepare failed: '+t.uiFeedback);
    t.render(performance.now());await new Promise(r=>setTimeout(r,700));
    const d=t.dataTutorial,interruptions=[],longTasks=[];
    new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});
    const update=d.update.bind(d);d.update=now=>{
      if(d.phase&&(now-d.last>250||r.audioSystem.audioContextService.context?.state!=='running'))interruptions.push({gap:now-d.last,state:r.audioSystem.audioContextService.context?.state,beat:d.ensemble.beatAt(now),longTasks:longTasks.slice(-5)});
      update(now);
    };
    window.__rishte={r,t,d,interruptions,check:(v,m)=>{if(!v)throw new Error(m+' ' +JSON.stringify(interruptions))},wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))};
    return {title:d.definition.title,controls:t.panel.model, userAgent:navigator.userAgent,renderPixelRatio:r.renderer.getPixelRatio(),
      instruments:r.instrumentRegistry.size,loopers:d.ensemble.loopers.length,
      contacts:d.definition.arrangement.recipes.filter(p=>p.kind==='honk').map(p=>({role:p.role, chain:r.getTouchingInstrumentChain(t.adapter.get(p.role)).map(h=>h.id)}))};
  })()`);
  console.log(JSON.stringify({ stage: "prepared", ...prepared }));
  const shot = await browser.send("Page.captureScreenshot", { format: "png" });
  await writeFile("test-results/rishte-human/prepared.png", Buffer.from(shot.data, "base64"));
  if (process.argv.includes("--sound-only")) {
    const sound = await browser.evaluate(`(async()=>{
      const {r,t,d,wait}=window.__rishte,a=t.adapter;await r.audioSystem.ensureAudio();
      const ctx=r.audioSystem.audioContextService.context,analyser=ctx.createAnalyser();analyser.fftSize=2048;
      r.audioSystem.masterBus.output.connect(analyser);const samples=new Float32Array(analyser.fftSize);
      const measure=async ms=>{let peak=0;const end=performance.now()+ms;while(performance.now()<end){analyser.getFloatTimeDomainData(samples);for(const value of samples)peak=Math.max(peak,Math.abs(value));await wait(16)}return peak;};
      d.ensemble.showMelody();a.setVirtualsActive(true,'demonstration');const pitches=[];
      for(const recipe of d.definition.arrangement.recipes.filter(p=>p.role.startsWith('lead-'))){
        d.ensemble.hands.trigger(recipe.hand,recipe.role,true,performance.now());const peak=await measure(1000);d.ensemble.hands.release();const tail=await measure(500);pitches.push({midi:recipe.midi,peak:Math.max(peak,tail)});
      }
      a.setVirtualsActive(false);const metro=a.get('metronome');metro.play(performance.now());const metronomePeak=await measure(2500);metro.pause();
      r.audioSystem.masterBus.output.disconnect(analyser);analyser.disconnect();return {normalHonks:pitches,metronomePeak};
    })()`);
    await writeFile("test-results/rishte-human/sound.json", JSON.stringify(sound, null, 2) + "\n");
    console.log(JSON.stringify({stage:"isolated-sound",...sound}));
  } else if (process.argv.includes("--practice-only")) {
    const practice = await browser.evaluate(`(async()=> (await import('/scripts/validate-rishte-human-practice-browser.mjs')).validate())()`);
    if (browser.errors.length) throw new Error(browser.errors.join("\n"));
    await writeFile("test-results/rishte-human/practice.json", JSON.stringify({ practice, errors: browser.errors }, null, 2) + "\n");
    console.log(JSON.stringify({ stage: "practice", ...practice }));
  } else {
  const smoke = await browser.evaluate(`(async()=>{
    const {r,t,d,check,wait}=window.__rishte;
    const controls=t.panel.model.navigation.concat(t.panel.model.actions).map(b=>b.id);
    check(t.adapter.get('metronome').bpm===d.definition.bpm,'Song must open at its configured playback tempo');
    for(const id of ['rishte-preview','step-practice','previous-step','next-step','tempo-down','tempo-up','rishte-stop','exit'])check(controls.includes(id),'Missing '+id);
    const before=d.ensemble.loopers.map(h=>h.looperController.serializeState(h));
    await t.action('rishte-preview');await wait(5200);
    check(d.phase==='demo','Preview stopped: '+d.feedback);
    const active=d.ensemble.loopers.filter(h=>h.transport.playing).length;
    check(active===2,'Expected two actual Loopers playing: '+active);
    check(d.ensemble.nextBlock===2,'Next backing window not prepared');
    await t.action('tempo-down');check(t.adapter.get('metronome').bpm===d.definition.bpm-5,'Tempo change failed');
    await wait(6000);check(d.phase==='demo','Preview after handoff: '+d.feedback);
    const handoffs=d.ensemble.handoffs;
    await t.action('rishte-stop');
    check(!d.phase,'Stop failed');
    check(JSON.stringify(before)===JSON.stringify(d.ensemble.loopers.map(h=>h.looperController.serializeState(h))),'Preview changed saved takes');
    check(d.ensemble.loopers.every(h=>!h.transport.playing&&!h.looperData.pendingLaunch&&!h.looperData.queued),'Stop left backing active');
    check(Object.keys(d.outcomes).length===0,'Preview earned credit');
    await t.action('next-step');check(d.index===1,'Next failed');await t.action('previous-step');check(d.index===0,'Previous failed');
    await t.action('step-practice');await wait(4500);check(d.phase==='practice','Practice failed: '+d.feedback);
    check(!r.controllers.some(c=>c.userData.virtualTutorial),'Practice has virtual melody');
    await t.action('step-practice');check(d.ensemble.beatAt(performance.now())<d.step.startBeat,'Retry lost count-in');
    await t.action('rishte-stop');await wait(800);
    check(r.instrumentRegistry.getByKind('honk').every(h=>h.activeVoiceIds.size===0&&!h.hornHolders.size),'Stop leaked voices');
    return {controls,actualLoopers:active,handoffs,takesRestored:true,previewNoCredit:true,practiceBackingOnly:true,retry:true};
  })()`);
  console.log(JSON.stringify({ stage: "smoke", ...smoke }));
  const parity = await browser.evaluate(`(async()=>{
    const {r,t,d,check,wait}=window.__rishte,a=t.adapter;
    const {compilePattern}=await import('/src/compositions/CompositionCompiler.js');
    window.__rishte.calls=[];window.__rishte.updates=[];window.__rishte.releases=[];
    for(const recipe of d.definition.arrangement.recipes.filter(p=>p.kind==='honk')){
      const h=a.get(recipe.role),start=h.startAudioVoice.bind(h),update=h.updateAudioVoice.bind(h),release=h.releaseAudioVoice.bind(h);
      h.startAudioVoice=(voiceId,options={})=>{window.__rishte.calls.push({role:recipe.role,midi:recipe.midi,voiceId,atMs:performance.now(),scheduledTime:options.scheduledTime});return start(voiceId,options)};
      h.updateAudioVoice=(voiceId,values,options={})=>{
        if(values.squeeze>.99)window.__rishte.updates.push({role:recipe.role,voiceId,values:{...values},options:{...options}});
        return update(voiceId,values,options);
      };
      h.releaseAudioVoice=(voiceId,options={})=>{window.__rishte.releases.push({role:recipe.role,voiceId,options:{...options}});return release(voiceId,options)};
    }
    a.setVirtualsActive(true,'demonstration');d.ensemble.showMelody();d.ensemble.hands.trigger('R','lead-R-71',true,performance.now());await wait(650);d.ensemble.hands.release();await wait(500);a.setVirtualsActive(false);
    const manual=window.__rishte.updates.find(e=>e.role==='lead-R-71');check(manual,'Normal trigger reference was silent');
    const h=a.get('foundation-0'),c=h.looperController,prior=c.serializeState(h),track=h.tracks[1];
    for(const tr of h.tracks)if(tr.connectedHonkId!=null)c.connections.disconnect(h,tr.index);
    r.connectLooperTrackToHonk(h,track.index,a.get('backing-71').id);
    const pattern=compilePattern({events:[{role:'normal',beat:0,beats:1}],beats:2,beatMs:800,routes:{normal:{trackId:track.trackId,trackIndex:track.index}}});
    c.restoreState(h,{timeline:pattern.toJSON(),controls:{recordBeats:2,gap:-1,volume:-.35}},{preserveConnections:true});
    const metro=a.get('metronome');metro.setBpm(75);metro.beatOriginMs=null;metro.play(performance.now());c.startPlayback(h,performance.now(),{origin:'demonstration'});
    await wait(1700);c.stopPlayback(h);metro.pause();c.restoreState(h,prior,{restoreConnections:true});await wait(500);
    const normalLooper=window.__rishte.updates.find(e=>e.role==='backing-71');check(normalLooper,'Ordinary Looper reference was silent');
    for(const field of ['bend','earLeft','earRight','nose','vowel'])check(manual.values[field]===normalLooper.values[field],'Normal Looper timbre differs: '+field);
    const volume=h.looperData.volume;check(Math.abs(normalLooper.options.gain/manual.options.gain-volume)<1e-9,'Normal Looper gain mapping differs');
    window.__rishte.reference={manual,normalLooper};window.__rishte.calls=[];window.__rishte.updates=[];window.__rishte.releases=[];
    return {normalTrigger:manual,ordinaryLooper:normalLooper,defaultLooperVolume:volume};
  })()`);
  console.log(JSON.stringify({ stage: "sound-reference", ...parity }));
  const full = await browser.evaluate(`(async()=>{
    const {r,t,d,check,wait}=window.__rishte;
    t.adapter.get('metronome').setBpm(d.definition.bpm);
    const beatMs=60000/d.definition.bpm;
    const saved=d.ensemble.loopers.map(h=>h.looperController.serializeState(h));
    await t.action('rishte-preview');
    const anchor=d.ensemble.anchor,audioAnchor={...d.ensemble.audioAnchor};
    const ctx=r.audioSystem.audioContextService.context,analyser=ctx.createAnalyser();analyser.fftSize=2048;
    r.audioSystem.masterBus.output.connect(analyser);const samples=new Float32Array(analyser.fftSize);
    let peak=0,rms=0,maxActive=0,maxDriftBeats=0,maxMelodyHands=0;const blocks=new Set();
    const deadline=performance.now()+155000;
    while(d.phase&&performance.now()<deadline){
      const beat=d.ensemble.beatAt(performance.now());
      maxMelodyHands=Math.max(maxMelodyHands,r.controllers.filter(c=>c.userData.virtualTutorial&&r.controllerStates.get(c)?.trigger).length);
      // The scheduler can launch the next bank before the render frame clears
      // the old transport flag. Its audio is already bounded at the window end.
      const active=d.ensemble.loopers.filter(h=>{
        const bank=Number(t.adapter.roleForId(h.id).slice(-1)),assignment=d.ensemble.bankAssignments.get(bank);
        const window=assignment&&d.ensemble.blocks[assignment.index];
        return h.transport.playing&&window&&beat>=window.beat&&beat<assignment.endBeat;
      });maxActive=Math.max(maxActive,active.length);
      check(active.length<=2,'Duplicate backing banks');
      const block=d.ensemble.blocks.findLast(b=>beat>=b.beat);
      if(block)blocks.add(block.id);
      if(block&&active.length===2&&beat-block.beat>.1){
        blocks.add(block.id);
        for(const h of active)maxDriftBeats=Math.max(maxDriftBeats,Math.abs(h.looperData.clockPlaybackStartBeatPosition-(block.beat+4)));
      }
      analyser.getFloatTimeDomainData(samples);let sum=0;
      for(const value of samples){peak=Math.max(peak,Math.abs(value));sum+=value*value;}rms=Math.max(rms,Math.sqrt(sum/samples.length));
      await wait(40);
    }
    r.audioSystem.masterBus.output.disconnect(analyser);analyser.disconnect();
    check(!d.phase&&d.feedback.startsWith('Full preview complete'),'Ending failed: '+d.feedback);
    await wait(900);
    const calls=window.__rishte.calls,melody=calls.filter(c=>c.role.startsWith('lead-')),backing=calls.filter(c=>c.role.startsWith('backing-'));
    check(melody.length===175,'Wrong melody attack count '+melody.length);
    check(maxMelodyHands===2,'Preview did not show overlapping two-hand holds');
    check(JSON.stringify(melody.map(n=>n.midi))===JSON.stringify(d.definition.score.events.map(n=>n.midi)),'Melody pitches/order differ from screenshot '+JSON.stringify(melody.map((n,i)=>({index:i,actual:n.midi,expected:d.definition.score.events[i]?.midi,role:n.role})).filter(n=>n.actual!==n.expected)));
    const expected=d.definition.arrangement.blocks.flatMap(b=>b.patterns.flatMap(p=>p.events));
    check(backing.length===expected.length,'Wrong backing attack count '+backing.length+' vs '+expected.length);
    let backingOnsetErrorMs=0,melodyOnsetErrorMs=0;
    const audioZero=audioAnchor.audioSeconds+(anchor-audioAnchor.wallMs)/1000;
    for(const role of new Set(d.definition.arrangement.backing.map(n=>n.role))){
      const source=d.definition.arrangement.backing.filter(n=>n.role===role).sort((a,b)=>a.beat-b.beat);
      const actual=backing.filter(n=>n.role===role).sort((a,b)=>a.scheduledTime-b.scheduledTime);
      check(source.length===actual.length,'Backing voice count differs: '+role);
      for(let i=0;i<source.length;i++)backingOnsetErrorMs=Math.max(backingOnsetErrorMs,Math.abs(actual[i].scheduledTime-audioZero-source[i].beat*beatMs/1000)*1000);
    }
    for(let i=0;i<melody.length;i++)melodyOnsetErrorMs=Math.max(melodyOnsetErrorMs,Math.abs(melody[i].atMs-anchor-d.definition.score.events[i].beat*beatMs));
    check(backingOnsetErrorMs<2,'Backing onset mismatch '+backingOnsetErrorMs);
    check(melodyOnsetErrorMs<100,'Preview frame delay '+melodyOnsetErrorMs);
    check(blocks.size===d.ensemble.blocks.length,'Missing harmonic blocks '+blocks.size);check(maxDriftBeats<1e-7,'Clock drift '+maxDriftBeats);
    check(Number.isFinite(peak)&&peak<1&&rms>.001,'Audio silent or excessive output: '+JSON.stringify({peak,rms}));
    const updates=window.__rishte.updates,ref=window.__rishte.reference;
    const preview=updates.find(e=>e.role==='lead-R-71'),left=updates.find(e=>e.role==='lead-L-71'),looper=updates.find(e=>e.role==='backing-71');
    for(const [actual,normal] of [[preview,ref.manual],[left,ref.manual],[looper,ref.normalLooper]]){
      check(actual,'Missing parity sample');
      for(const field of ['bend','earLeft','earRight','nose','vowel'])check(actual.values[field]===normal.values[field],'Sound mismatch '+field);
      check(actual.options.gain===normal.options.gain,'Gain override');
    }
    check(window.__rishte.releases.filter(e=>e.role.startsWith('backing-')&&e.options.scheduledTime).every(e=>e.options.origin==='controller'),'Backing release profile');
    check(r.instrumentRegistry.getByKind('honk').every(h=>!h.activeVoiceIds.size&&!h.hornHolders.size),'Ending left voices');
    check(JSON.stringify(saved)===JSON.stringify(d.ensemble.loopers.map(h=>h.looperController.serializeState(h))),'Ending changed takes');
    check(Object.keys(d.outcomes).length===0,'Preview changed learner progress');
    return {bpm:d.definition.bpm,melodyNotes:melody.length,backingNotes:backing.length,maxMelodyHands,handLabels:d.ensemble.hands.labels.size,harmonicBlocks:blocks.size,maximumConcurrentLoopers:maxActive,
      maximumClockDriftBeats:maxDriftBeats,backingOnsetErrorMs,melodyOnsetErrorMs,peakAmplitude:peak,maximumRms:rms,durationBeats:d.definition.score.durationBeats,
      soundParity:true,normalRelease:true,takesRestored:true,noPreviewCredit:true,cleanEnding:true,handoffs:d.ensemble.handoffs};
  })()`);
  console.log(JSON.stringify({ stage: "full-preview", ...full }));
  if (browser.errors.length) throw new Error(browser.errors.join("\n"));
  await writeFile("test-results/rishte-human/browser.json", JSON.stringify({ prepared, smoke, parity, full, errors: browser.errors }, null, 2) + "\n");
  }
} finally {
  if (browser) {
    try {
      const trace = await browser.evaluate(`window.__rishte ? {calls:window.__rishte.calls,releases:window.__rishte.releases,history:window.__rishte.d.ensemble.history,audioAnchor:window.__rishte.d.ensemble.audioAnchor,interruptions:window.__rishte.interruptions} : null`);
      await writeFile("test-results/rishte-human/voice-trace.json", JSON.stringify(trace, null, 2) + "\n");
    } catch { /* Preserve the original error if Chrome itself has closed. */ }
  }
  if (browser?.errors.length) console.error(JSON.stringify(browser.errors));
  await browser?.close(); await service?.close(); await rm(root, { recursive: true, force: true });
}
