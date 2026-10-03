import { startServer } from "./capture/server.mjs";
import { launchChrome } from "./capture/chrome.mjs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "honk-rishte-"));
let service, browser;
try {
  await mkdir("test-results/rishte-naate", { recursive: true });
  service = await startServer({ host: "127.0.0.1", port: 0, plain: true, dataRoot: root });
  // This 30-Honk scene needs the native backend on macOS. SwiftShader can
  // stall for >250 ms and correctly trigger the runtime interruption guard.
  if (process.platform === "darwin") process.env.CAPTURE_SOFTWARE_GL ??= "0";
  browser = await launchChrome();
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await browser.send("Page.bringToFront");
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const prepared = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    for(let i=0;i<300&&!app.runtime.tutorial.ready;i++)await new Promise(r=>setTimeout(r,100));
    const r=app.runtime,t=r.tutorial;
    if(!t.ready)throw new Error('App failed to initialize');
    await t.action('play');
    await t.action('tutorials');
    await t.action('library-next');
    if(!t.catalog.list().some(e=>e.id==='rishte-naate'))throw new Error('Missing catalog entry');
    await t.action('composition:rishte-naate');
    if(!t.dataTutorial)throw new Error('Composition failed: '+t.uiFeedback);
    t.render(performance.now());
    await new Promise(r=>setTimeout(r,1500));
    return {title:t.dataTutorial.definition.title, honks:r.instrumentRegistry.getByKind('honk').length,
      instruments:r.instrumentRegistry.size, controls:t.panel.model, userAgent:navigator.userAgent};
  })()`);
  console.log(JSON.stringify({ stage: "prepared", title: prepared.title, instruments: prepared.instruments }));
  const shot = await browser.send("Page.captureScreenshot", { format: "png" });
  await writeFile("test-results/rishte-naate/prepared.png", Buffer.from(shot.data, "base64"));
  const result = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    const r=app.runtime,t=r.tutorial,d=t.dataTutorial;
    const check=(v,m)=>{if(!v)throw new Error(m);},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const controls=t.panel.model.navigation.concat(t.panel.model.actions).map(b=>b.id);
    for(const id of ['previous-step','next-step','step-demo','step-practice','midi-pause','midi-stop','recenter','exit'])check(controls.includes(id),'Missing '+id);
    await t.action('step-demo');await wait(2600);
    check(d.phase==='demo','Demo stopped unexpectedly: '+d.feedback);
    check(d.ensemble.player.index>0,'Playback did not advance: '+JSON.stringify({last:d.last,now:performance.now(),busy:t.busy,running:app.running,suspended:app.computeSuspended,frame:app.lastFrameMs,errors:window.__errors}));
    await t.action('midi-pause');check(d.phase==='paused'&&d.ensemble.player.voices.size===0,'Pause leaked voices');
    const pausedAt=d.pausedSeconds;await wait(200);
    await t.action('midi-pause');check(d.phase==='demo','Resume failed');await wait(350);
    check((performance.now()-d.origin)/1000>pausedAt,'Resume did not advance');
    await t.action('midi-stop');check(!d.phase&&d.ensemble.player.voices.size===0,'Stop failed');
    await t.action('next-step');check(d.index===1&&!d.phase,'Next failed');
    await t.action('previous-step');check(d.index===0,'Previous failed');
    await t.action('step-practice');check(d.phase==='practice','Practice failed');
    check(d.ensemble.player.events.every(e=>e.part!=='melody'),'Backing duplicated live melody');
    await t.action('midi-stop');
    for(let i=0;i<d.definition.lessons.length-1;i++)await t.action('next-step');
    check(d.step.completePerformance,'Final performance unreachable');
    await t.action('step-demo');
    const player=d.ensemble.player, calls=[],make=player.createVoice;
    player.createVoice=options=>{
      const voice=make(options),row={vowel:options.vowel};calls.push(row);
      const start=voice.start.bind(voice),update=voice.update.bind(voice),release=voice.release.bind(voice);
      voice.start=at=>{row.start=at;row.lead=at-player.context.currentTime;return start(at);};
      voice.update=(values,options)=>{row.values=values;return update(values,options);};
      voice.release=(fade,ended,options)=>{row.end=options.scheduledTime;return release(fade,ended,options);};
      return voice;
    };
    const analyser=r.audioSystem.audioContextService.context.createAnalyser();analyser.fftSize=2048;
    r.audioSystem.masterBus.output.connect(analyser);
    const samples=new Float32Array(analyser.fftSize);
    let peakVoices=0,peakAmplitude=0,maxRms=0,frames=0;
    const deadline=performance.now()+82000;
    while(d.phase&&performance.now()<deadline){
      peakVoices=Math.max(peakVoices,player.voices.size);
      analyser.getFloatTimeDomainData(samples);let sum=0;
      for(const v of samples){peakAmplitude=Math.max(peakAmplitude,Math.abs(v));sum+=v*v;}
      maxRms=Math.max(maxRms,Math.sqrt(sum/samples.length));frames++;await wait(40);
    }
    r.audioSystem.masterBus.output.disconnect(analyser);analyser.disconnect();
    check(!d.phase&&d.feedback.startsWith('Performance complete'),'Ending failed: '+d.feedback);
    check(calls.length===296,'Missing audible notes: '+calls.length);
    check(peakVoices>=30,'Polyphony reduced: '+peakVoices);
    check(player.voices.size===0,'Final sustain leaked voices');
    check(maxRms>.001,'Silent playback');
    check(peakAmplitude<1,'Clipped audio');
    const {getHonkFrequency}=await import('/src/audio/honk/pitch.js');
    let maximumTimingError=0;
    calls.forEach((c,i)=>{const e=d.definition.score.events[i];
      maximumTimingError=Math.max(maximumTimingError,Math.abs(c.start-player.audioOrigin-e.startSeconds),Math.abs(c.end-player.audioOrigin-e.endSeconds));
      check(c.values.hornAmount===e.velocity/127,'Velocity changed');
      const hz=getHonkFrequency({leftEar:c.values.leftEar,rightEar:c.values.rightEar,pitchSnap:c.values.pitchSnap});
      check(Math.abs(69+12*Math.log2(hz/440)-e.midi)<.001,'Wrong pitch');
    });
    check(maximumTimingError<1e-9,'Timing changed');
    check(Math.min(...calls.map(c=>c.lead))>=0,'Missed audio scheduling deadline');
    const endFeedback=d.feedback;
    await t.action('exit');check(r.instrumentRegistry.size===0,'Play workspace not restored');
    await t.action('record-songs');await t.action('composition:rishte-naate');
    check(t.jogRecording?.composition.id==='rishte-naate','Record Songs integration failed');
    await t.enterPlay();
    return {notes:calls.length,peakVoices,peakAmplitude,maxRms,maximumTimingError,
      minimumScheduleLead:Math.min(...calls.map(c=>c.lead)),durationSeconds:d.definition.score.durationSeconds,
      controls,pausedAt,sectionTransitions:true,practiceMelodyExcluded:true,recordSongsRegistered:true,
      endFeedback,voicesAtEnd:player.voices.size,workspaceRestored:r.instrumentRegistry.size===0,frames};
  })()`);
  if (browser.errors.length) throw new Error(browser.errors.join("\n"));
  const report = { ...prepared, ...result, errors: browser.errors };
  await writeFile("test-results/rishte-naate/browser.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  if (browser?.errors.length) console.error(JSON.stringify(browser.errors));
  await browser?.close();
  await service?.close();
  await rm(root, { recursive: true, force: true });
}
