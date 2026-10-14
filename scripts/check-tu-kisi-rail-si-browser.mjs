import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./capture/server.mjs";
import { launchChrome } from "./capture/chrome.mjs";

const root = await mkdtemp(join(tmpdir(), "honk-tu-kisi-"));
const songId = "tu-kisi-rail-si";
const output = `test-results/${songId}`;
let service, browser;
try {
  await mkdir(output, { recursive: true });
  service = await startServer({ host: "127.0.0.1", port: 0, plain: true, pairCode: "123456", dataRoot: root });
  if (process.platform === "darwin") process.env.CAPTURE_SOFTWARE_GL ??= "0";
  browser = await launchChrome();
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const prepared = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    for(let i=0;i<300&&!app.runtime.tutorial.ready;i++)await new Promise(r=>setTimeout(r,100));
    const r=app.runtime,t=r.tutorial;
    await t.action('play');
    window.originalScene=r.sceneSerializer.serialize();
    await t.action('tutorials');await t.action('composition:${songId}');
    const d=t.dataTutorial;
    if(!d?.ensemble.prepared)throw new Error('Prepare failed: '+t.uiFeedback);
    window.song={r,t,d,calls:[],backingCalls:[],drums:[],wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),check:(v,m)=>{if(!v)throw new Error(m)}};
    const melodyRoles=new Set(d.definition.score.events.map(e=>e.role));
    const percussion=r.playStickPercussion.bind(r);
    r.playStickPercussion=(type,options)=>{window.song.drums.push(type);return percussion(type,options)};
    for(const recipe of d.definition.arrangement.recipes.filter(p=>p.kind==='honk')){
      const h=t.adapter.get(recipe.role),start=h.startAudioVoice.bind(h);
      h.startAudioVoice=(id,options={})=>{(melodyRoles.has(recipe.role)?window.song.calls:window.song.backingCalls).push({midi:recipe.midi,atMs:performance.now()});return start(id,options)};
    }
    return {title:d.definition.title,phrases:d.definition.lessons.length-1,instruments:r.instrumentRegistry.size,
      visibleHonks:[...melodyRoles].filter(role=>t.adapter.get(role).root.visible).length,
      distinctPitches:new Set(d.definition.score.events.map(e=>e.midi)).size,
      loopers:r.instrumentRegistry.getByKind('looper').length,model:d.model(performance.now())};
  })()`);
  assert.equal(prepared.loopers, 0);
  assert.equal(prepared.visibleHonks, 10);
  assert.equal(prepared.visibleHonks, prepared.distinctPitches);
  assert.equal(prepared.phrases, 15);
  assert.match(prepared.model.feedback, /no Looper or backing track/);
  console.log(JSON.stringify({ stage: "prepared", title: prepared.title, instruments: prepared.instruments, phrases: prepared.phrases, loopers: prepared.loopers }));
  const shot = await browser.send("Page.captureScreenshot", { format: "png" });
  await writeFile(`${output}/prepared.png`, Buffer.from(shot.data, "base64"));
  const demonstration = process.argv.includes("--skip-demo") ? { skipped: true } : await browser.evaluate(`(async()=>{
    const {r,t,d,wait,check,calls}=window.song;
    await wait(1000);
    await t.action('rishte-preview');
    const anchor=d.ensemble.anchor;
    let maxHands=0, highlightedFrames=0;
    const until=performance.now()+d.definition.score.durationBeats*60000/d.ensemble.metro.bpm+10000;
    while(d.phase&&performance.now()<until){
      maxHands=Math.max(maxHands,r.controllers.filter(c=>c.userData.virtualTutorial&&r.controllerStates.get(c)?.trigger).length);
      check(r.instrumentRegistry.getByKind('honk').every(h=>h.root.visible),'A Honk disappeared during the song');
      if([...d.ensemble.hands.labels.values()].some(s=>s.userData.activeNote)) highlightedFrames++;
      check(t.cues.pool.every(p=>!p.red.visible&&!p.green.visible), 'Legacy note marker is visible');
      check(t.cues.pool.filter(p=>p.reference.visible).every(p=>p.reference.material.color.getHex()===0x9c9c9c), 'Next circle is not gray');
      await wait(40);
    }
    check(highlightedFrames>0, 'No highlighted note squares');
    check(!d.phase&&d.feedback.startsWith('Full preview complete'),'Demo failed: '+d.feedback);
    check(JSON.stringify(calls.map(e=>e.midi))===JSON.stringify(d.definition.score.events.map(e=>e.midi)),'Demo pitch/order/count mismatch: '+calls.length);
    const maxOnsetErrorMs=Math.max(...calls.map((e,i)=>Math.abs(e.atMs-anchor-d.definition.score.events[i].beat*60000/d.definition.bpm)));
    check(maxOnsetErrorMs<100,'Late demo onset '+maxOnsetErrorMs);
    check(maxHands===d.definition.requirements.maxLiveVoices,'Wrong simultaneous hand count');
    check(!Object.keys(d.outcomes).length,'Demonstration earned credit');
    await wait(300);
    check(r.instrumentRegistry.getByKind('honk').every(h=>!h.activeVoiceIds.size&&!h.hornHolders.size),'Demo left active notes');
    if(d.definition.arrangement.backing.length)check(window.song.backingCalls.length>0&&window.song.drums.length>0,'Backing was silent');
    return {backingAttacks:window.song.backingCalls.length,percussionHits:window.song.drums.length,allHonksVisible:true,attacks:calls.length,maxHands,maxOnsetErrorMs,highlightedFrames,demonstrationNoCredit:true,cleanEnding:true};
  })()`);
  console.log(JSON.stringify({ stage: "full-demo", ...demonstration }));
  const practice = await browser.evaluate(`(async()=>{
    const {r,t,d,wait,check,calls}=window.song;
    const a=t.adapter,metro=d.ensemble.metro,initial=metro.bpm;
    const click=async id=>{
      const button=t.panel.dom.querySelector('button[data-action="'+id+'"]');
      check(button&&!button.disabled,'Missing/enabled button '+id);
      button.click();await wait(80);
    };
    await wait(1000);
    await click('tempo-down');check(metro.bpm===initial-5,'DOM Tempo -5 failed');
    await click('step-practice');check(metro.bpm===initial-5,'Practice reset chosen BPM');
    const previousAnchor=d.anchor;
    await click('tempo-down');check(metro.bpm===initial-10,'Active Tempo -5 failed');
    check(d.anchor>previousAnchor,'Slower count-in did not extend');
    check(Math.abs(d.anchor-metro.beatOriginMs-4*60000/metro.bpm)<1,'Count-in and metronome disagree');
    a.setVirtualsActive(true,'learner');t.panel.setXR(true);
    const c=a.virtuals[0],button=t.panel.buttons.find(b=>b.visible&&b.userData.action==='tempo-up');
    check(button&&!button.userData.disabled,'XR Tempo +5 button missing');
    button.getWorldQuaternion(c.quaternion);button.getWorldPosition(c.position);
    c.translateZ(.35);c.updateMatrixWorld(true);
    a.input(c,'trigger',true);await wait(80);a.input(c,'trigger',false);a.park(c);
    check(metro.bpm===initial-5,'XR Tempo +5 failed');
    t.panel.setXR(false);
    await click('step-practice');check(metro.bpm===initial-5,'Retry reset chosen BPM');
    await click('next-step');await click('step-demo');
    check(metro.bpm===initial-5,'Phrase/demo reset chosen BPM');
    await click('rishte-stop');await click('previous-step');
    const {validate}=await import('/scripts/validate-note-practice-browser.mjs');
    const timing=await validate(t,{prepared:true});
    // A completely missed phrase must end on time and receive retry feedback.
    calls.length=0;
    const until=performance.now()+30000;
    while(d.phase&&performance.now()<until)await wait(40);
    check(d.outcomes[d.step.id]==='retry','Empty timed phrase did not fail on schedule: '+d.feedback);
    check(calls.length===0,'Practice played automatic melody');
    const feedback=d.feedback;
    await t.action('next-step');check(d.index===1,'Next failed');
    check(r.instrumentRegistry.getByKind('honk').every(h=>h.root.visible),'Navigation hid Honks');
    await t.action('previous-step');check(d.index===0,'Previous failed');
    await t.action('step-demo');await wait(150);d.ensemble.metro.pause();await wait(150);
    check(!d.phase,'Metronome pause did not stop demo');
    await t.action('exit');
    check(JSON.stringify(r.sceneSerializer.serialize())===JSON.stringify(window.originalScene),'Play workspace changed');
    return {feedback,...timing,domTempoButtons:true,xrTempoButton:true,chosenTempoPersists:true,
      countInFollowsTempo:true,emptyPracticeEndsOnTime:true,noAutomaticMelody:true,restoredPlay:true};
  })()`);
  console.log(JSON.stringify({ stage: "practice", ...practice }));
  const recording = await browser.evaluate(`(async()=>{
    const {r,t,wait,check}=window.song;
    await t.selectComposition('${songId}','record-songs');
    const mode=t.jogRecording;
    check(mode.composition.id==='${songId}','Wrong recording song');
    // Synthetic tracking fixture, using the real recorder, audio worker and receiver.
    mode.trackingReady=()=>true;
    const start=r.capture.startReady.bind(r.capture);
    r.capture.startReady=options=>start({...options,synthetic:true});
    await r.capture.pair('123456');await mode.action('prepare');
    check(mode.phase==='ready','Recording prepare failed: '+mode.feedback);
    const expectedBpm=${120};
    check(t.adapter.get('metronome').bpm===expectedBpm,'Prepared recording tempo is wrong');
    check(mode.model().progress.includes(expectedBpm+' BPM'),'Recording label has wrong tempo');
    check(r.instrumentRegistry.getByKind('looper').length===${0},'Recording has wrong Looper count');
    const melodyRoles=new Set(mode.composition.score.events.map(e=>e.role));
    const honks=[...melodyRoles].map(role=>t.adapter.get(role));
    check(honks.length===10&&new Set(honks.map(h=>t.adapter.midi(h))).size===10,'Recording duplicated pitch targets');
    check(!t.adapter.virtuals.some(v=>v.visible),'Recording enabled demonstration controllers');
    await mode.action('start');
    check(mode.phase==='count-in','Recording did not count in: '+mode.feedback);
    check(Math.abs(mode.anchor.beatZero-mode.anchor.countAt-4*60000/expectedBpm)<1e-6,'Count-in uses the wrong tempo');
    await wait(6500);
    check(mode.phase==='performing','Recording did not start: '+mode.feedback);
    const guide=mode.guidance(performance.now());
    check(t.adapter.get('metronome').bpm===expectedBpm&&Math.abs(guide.beatMs-60000/expectedBpm)<1e-6,'Recording clock and guide disagree');
    const now=performance.now();
    check(Math.abs(guide.beatAt(now)-(now-mode.anchor.beatZero)/(60000/expectedBpm))<1e-6,'Guide drifted from the recording count-in');
    check(guide?.step.events.length===mode.composition.score.events.length,'Recording missing guided notes');
    check(t.cues.pool.some(p=>p.reference.visible||p.hand.visible),'No recording cues');
    check(r.instrumentRegistry.getByKind('honk').every(h=>h.root.visible),'Recording hid Honks');
    check(honks.every(h=>!h.activeVoiceIds.size&&!h.hornHolders.size),'Recording automated melody');
    await mode.action('stop');
    const saved=r.capture.saved;
    check(saved?.complete,'Take failed to save: '+mode.feedback);
    const performanceData=saved.performance;
    check(performanceData.compositionId==='${songId}','Saved wrong identity');
    check(performanceData.bpm===expectedBpm,'Saved tempo is wrong');
    check(performanceData.completionAction==='stopped','Wrong completion');
    const stream=await fetch('/api/takes/'+saved.id+'/events.ndjson').then(r=>r.text());
    const syncs=stream.split('\\n').filter(s=>s&&JSON.parse(s).data.kind==='sync');
    check(syncs.length===1,'Expected one captured sync cue');
    await mode.action('exit');
    check(JSON.stringify(r.sceneSerializer.serialize())===JSON.stringify(window.originalScene),'Recording did not restore Play');
    return {saved:true,compositionId:performanceData.compositionId,compositionHash:performanceData.compositionHash,
      bpm:performanceData.bpm,countIn:4,loopers:${0},notes:mode.composition.score.events.length,syncCues:syncs.length,syntheticTracking:true};
  })()`);
  console.log(JSON.stringify({ stage: "recording", ...recording }));
  assert.deepEqual(browser.errors, []);
  await writeFile(`${output}/browser.json`, JSON.stringify({ prepared, demonstration, practice, recording, errors: browser.errors }, null, 2) + "\n");
} finally {
  if (browser?.errors.length) console.error(JSON.stringify(browser.errors));
  await browser?.close(); await service?.close(); await rm(root, { recursive: true, force: true });
}
