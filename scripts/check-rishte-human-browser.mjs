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
    await t.action('play');await t.action('tutorials');await t.action('composition:rishte-naate');
    if(!t.dataTutorial?.ensemble.prepared)throw new Error('Prepare failed: '+t.uiFeedback);
    t.render(performance.now());await new Promise(r=>setTimeout(r,700));
    const d=t.dataTutorial;
    window.__rishte={r,t,d,check:(v,m)=>{if(!v)throw new Error(m)},wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))};
    return {title:d.definition.title,controls:t.panel.model, userAgent:navigator.userAgent,
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
        a.squeeze(recipe.role,true);const peak=await measure(1000);a.squeeze(null,false);const tail=await measure(500);pitches.push({midi:recipe.midi,peak:Math.max(peak,tail)});
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
    for(const id of ['rishte-preview','step-practice','previous-step','next-step','tempo-down','tempo-up','rishte-stop','exit'])check(controls.includes(id),'Missing '+id);
    const before=d.ensemble.loopers.map(h=>h.looperController.serializeState(h));
    await t.action('rishte-preview');await wait(5200);
    check(d.phase==='demo','Preview stopped: '+d.feedback);
    const active=d.ensemble.loopers.filter(h=>h.transport.playing).length;
    check(active===2,'Expected two actual Loopers playing: '+active);
    check(d.ensemble.queuedIndex===1,'Handoff not queued');
    await t.action('tempo-down');check(t.adapter.get('metronome').bpm===70,'Tempo change failed');
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
    await t.action('step-practice');check(d.ensemble.beatAt(performance.now())<0,'Retry lost count-in');
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
    a.setVirtualsActive(true,'demonstration');a.squeeze('lead-71',true);await wait(650);a.squeeze(null,false);await wait(500);a.setVirtualsActive(false);
    const manual=window.__rishte.updates.find(e=>e.role==='lead-71');check(manual,'Normal trigger reference was silent');
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
    t.adapter.get('metronome').setBpm(75);
    const saved=d.ensemble.loopers.map(h=>h.looperController.serializeState(h));
    await t.action('rishte-preview');
    const ctx=r.audioSystem.audioContextService.context,analyser=ctx.createAnalyser();analyser.fftSize=2048;
    r.audioSystem.masterBus.output.connect(analyser);const samples=new Float32Array(analyser.fftSize);
    let peak=0,rms=0,maxActive=0,maxDriftBeats=0;const blocks=new Set();
    const deadline=performance.now()+155000;
    while(d.phase&&performance.now()<deadline){
      const beat=d.ensemble.beatAt(performance.now());
      const active=d.ensemble.loopers.filter(h=>h.transport.playing);maxActive=Math.max(maxActive,active.length);
      check(active.length<=2,'Duplicate backing banks');
      const block=d.ensemble.blocks.findLast(b=>beat>=b.beat);
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
    check(melody.length===107,'Wrong melody attack count '+melody.length);
    const expected=d.definition.arrangement.blocks.flatMap(b=>b.patterns.flatMap(p=>p.events));
    check(backing.length===expected.length,'Wrong backing attack count '+backing.length+' vs '+expected.length);
    check(blocks.size===26,'Missing harmonic blocks '+blocks.size);check(maxDriftBeats<1e-7,'Clock drift '+maxDriftBeats);
    check(peak<1&&rms>.001,'Audio silent or clipped: '+JSON.stringify({peak,rms}));
    const updates=window.__rishte.updates,ref=window.__rishte.reference;
    const preview=updates.find(e=>e.role==='lead-71'),looper=updates.find(e=>e.role==='backing-71');
    for(const [actual,normal] of [[preview,ref.manual],[looper,ref.normalLooper]]){
      check(actual,'Missing parity sample');
      for(const field of ['bend','earLeft','earRight','nose','vowel'])check(actual.values[field]===normal.values[field],'Sound mismatch '+field);
      check(actual.options.gain===normal.options.gain,'Gain override');
    }
    check(window.__rishte.releases.filter(e=>e.role.startsWith('backing-')&&e.options.scheduledTime).every(e=>e.options.origin==='controller'),'Backing release profile');
    check(r.instrumentRegistry.getByKind('honk').every(h=>!h.activeVoiceIds.size&&!h.hornHolders.size),'Ending left voices');
    check(JSON.stringify(saved)===JSON.stringify(d.ensemble.loopers.map(h=>h.looperController.serializeState(h))),'Ending changed takes');
    check(Object.keys(d.outcomes).length===0,'Preview changed learner progress');
    return {melodyNotes:melody.length,backingNotes:backing.length,harmonicBlocks:blocks.size,maximumConcurrentLoopers:maxActive,
      maximumClockDriftBeats:maxDriftBeats,peakAmplitude:peak,maximumRms:rms,durationBeats:d.definition.score.durationBeats,
      soundParity:true,normalRelease:true,takesRestored:true,noPreviewCredit:true,cleanEnding:true,handoffs:d.ensemble.handoffs};
  })()`);
  console.log(JSON.stringify({ stage: "full-preview", ...full }));
  if (browser.errors.length) throw new Error(browser.errors.join("\n"));
  await writeFile("test-results/rishte-human/browser.json", JSON.stringify({ prepared, smoke, parity, full, errors: browser.errors }, null, 2) + "\n");
  }
} finally {
  if (browser?.errors.length) console.error(JSON.stringify(browser.errors));
  await browser?.close(); await service?.close(); await rm(root, { recursive: true, force: true });
}
