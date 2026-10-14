import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./capture/server.mjs";
import { launchChrome } from "./capture/chrome.mjs";

const root=await mkdtemp(join(tmpdir(),"honk-nazariya-"));
const output="test-results/nazariya-honk-bends";
let service,browser;
try {
  await mkdir(output,{recursive:true});
  service=await startServer({host:"127.0.0.1",port:0,plain:true,pairCode:"123456",dataRoot:root});
  if(process.platform==="darwin")process.env.CAPTURE_SOFTWARE_GL??="0";
  browser=await launchChrome();
  await browser.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const prepared=await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    for(let i=0;i<300&&!app.runtime.tutorial.ready;i++)await new Promise(r=>setTimeout(r,100));
    const r=app.runtime,t=r.tutorial;
    r.renderer.setPixelRatio(.5);
    await t.action('play');const original=r.sceneSerializer.serialize();
    await t.action('tutorials');await t.action('composition:nazariya-honk-bends');
    const d=t.dataTutorial;
    if(!d?.ensemble.prepared)throw Error('Prepare failed: '+t.uiFeedback);
    window.song={r,t,d,original,calls:[],gauges:[],wait:ms=>new Promise(r=>setTimeout(r,ms)),check:(v,m)=>{if(!v)throw Error(m)}};
    for(const recipe of d.definition.arrangement.recipes.filter(p=>p.kind==='honk')){
      const h=t.adapter.get(recipe.role),start=h.startAudioVoice.bind(h);
      h.startAudioVoice=(...args)=>{song.calls.push({midi:recipe.midi,at:performance.now()});return start(...args)};
    }
    return {title:d.definition.title,phrases:d.definition.lessons.length-1,honks:r.instrumentRegistry.getByKind('honk').length,bpm:d.ensemble.metro.bpm};
  })()`);
  assert.equal(prepared.phrases,7);assert.equal(prepared.honks,10);assert.equal(prepared.bpm,70);
  console.log(JSON.stringify({stage:"prepared",...prepared}));
  const takeShot=async name=>{
    const shot=await browser.send("Page.captureScreenshot",{format:"png"});
    await writeFile(`${output}/${name}.png`,Buffer.from(shot.data,"base64"));
  };
  await takeShot("prepared");
  await browser.evaluate(`(async()=>{
    const {t,d,wait}=song;await wait(500);await t.action('rishte-preview');
    song.demoAnchor=d.ensemble.anchor;
    song.poll=setInterval(()=>{
      const g=t.cues.gauge;
      if(g.root.visible)song.gauges.push({at:performance.now(),target:g.state.required,actual:g.state.actual,direction:g.state.direction,destination:g.state.destinationSemitones,demonstration:g.state.demonstration});
    },20);
    await wait(10000);
  })()`);
  await takeShot("tutorial-bend");
  const demo=await browser.evaluate(`(async()=>{
    const {r,t,d,wait,check}=song;const deadline=performance.now()+d.definition.score.durationSeconds*1000+10000;
    while(d.phase&&performance.now()<deadline)await wait(60);
    clearInterval(song.poll);
    check(!d.phase&&d.feedback.startsWith('Full preview complete'),'Demo failed: '+d.feedback);
    check(JSON.stringify(song.calls.map(c=>c.midi))===JSON.stringify(d.definition.score.events.map(e=>e.midi)),'Demo attacks changed: '+song.calls.length);
    check(song.gauges.some(g=>g.actual>1)&&song.gauges.some(g=>g.actual < -1),'Real controller bends were not audible');
    check(song.gauges.some(g=>g.direction==='up')&&song.gauges.some(g=>g.direction==='down'),'Indicators failed to reverse');
    check(song.gauges.some(g=>g.demonstration),'Gauge did not label demonstration');
    check(!Object.keys(d.outcomes).length,'Demo earned practice credit');await wait(250);
    check(r.instrumentRegistry.getByKind('honk').every(h=>!h.activeVoiceIds.size&&!h.hornHolders.size),'Demo left sound active');
    return {attacks:song.calls.length,bendFrames:song.gauges.length,minActual:Math.min(...song.gauges.map(g=>g.actual??0)),maxActual:Math.max(...song.gauges.map(g=>g.actual??0)),cleanEnd:true};
  })()`);
  console.log(JSON.stringify({stage:"full-demonstration",...demo}));
  const practice=await browser.evaluate(`(async()=>{
    const {r,t,d,wait,check}=song;song.calls.length=0;
    await t.action('step-practice');check(d.ensemble.metro.bpm===70,'Practice changed approved BPM');
    let saw=false;const deadline=performance.now()+(d.step.endBeat-d.step.startBeat+4)*60000/d.ensemble.metro.bpm+2000;
    while(d.phase&&performance.now()<deadline){if(t.cues.gauge.root.visible)saw=true;await wait(30)}
    check(saw,'Practice had no bend indicators');
    check(d.outcomes[d.step.id]==='retry','Silent practice did not fail on schedule');
    check(song.calls.length===0,'Practice automated the melody');
    await t.action('tempo-down');await t.action('step-demo');check(d.ensemble.metro.bpm===65,'Slower tempo did not persist');
    await t.action('rishte-stop');await t.action('next-step');await t.action('step-practice');
    check(d.ensemble.metro.bpm===65,'Phrase change reset tempo');await t.action('rishte-stop');await t.action('exit');
    check(JSON.stringify(r.sceneSerializer.serialize())===JSON.stringify(song.original),'Tutorial changed Play scene');
    return {bendIndicators:true,noAutomaticMelody:true,slowerPractice:true,restoresPlay:true};
  })()`);
  console.log(JSON.stringify({stage:"practice",...practice}));
  await browser.evaluate(`(async()=>{
    const {r,t,wait,check}=song;
    await t.action('record-songs');await t.action('composition:nazariya-honk-bends');
    const mode=t.jogRecording;song.mode=mode;
    check(mode?.composition.id==='nazariya-honk-bends','Wrong guided song');
    mode.trackingReady=()=>true;
    const start=r.capture.startReady.bind(r.capture);r.capture.startReady=options=>start({...options,synthetic:true});
    await r.capture.pair('123456');await mode.action('prepare');
    check(mode.phase==='ready','Recording prepare failed: '+mode.feedback);
    await mode.action('start');check(mode.phase==='count-in','No count-in: '+mode.feedback);
    song.recordGauges=[];
    song.poll=setInterval(()=>{const g=t.cues.gauge;if(g.root.visible)song.recordGauges.push({target:g.state.required,actual:g.state.actual,demonstration:g.state.demonstration});},20);
    await wait(10000);
  })()`);
  await takeShot("guided-play-bend");
  const recording=await browser.evaluate(`(async()=>{
    const {r,t,mode,wait,check}=song;await wait(1000);clearInterval(song.poll);
    check(mode.phase==='performing','Guided play did not start: '+mode.feedback);
    check(mode.guidance(performance.now()).step.events.filter(e=>e.bend).length===26,'Guided play lost continuous bend holds');
    check(song.recordGauges.length>0&&song.recordGauges.some(g=>Math.abs(g.target)>1),'Guided play has no moving bend target');
    check(song.recordGauges.every(g=>g.actual===null&&!g.demonstration),'Guided play faked learner bends');
    check(r.instrumentRegistry.getByKind('honk').every(h=>!h.activeVoiceIds.size&&!h.hornHolders.size),'Guided play automated melody');
    await mode.action('stop');const saved=r.capture.saved;
    check(saved?.complete,'Capture failed: '+mode.feedback);
    check(saved.performance.compositionId==='nazariya-honk-bends'&&saved.performance.bpm===70,'Wrong capture identity or BPM');
    await mode.action('exit');
    check(JSON.stringify(r.sceneSerializer.serialize())===JSON.stringify(song.original),'Guided play changed Play scene');
    return {saved:true,bpm:saved.performance.bpm,bendFrames:song.recordGauges.length,sourceHash:saved.performance.compositionHash,syntheticTracking:true};
  })()`);
  console.log(JSON.stringify({stage:"guided-play",...recording}));
  assert.deepEqual(browser.errors,[]);
  await writeFile(`${output}/browser.json`,JSON.stringify({prepared,demo,practice,recording,errors:browser.errors},null,2)+"\n");
} finally {
  if(browser?.errors.length)console.error(JSON.stringify(browser.errors));
  await browser?.close();await service?.close();await rm(root,{recursive:true,force:true});
}
