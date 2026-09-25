import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { startServer } from './server.mjs';
import { launchChrome } from './chrome.mjs';

const dataRoot=await mkdtemp(join(tmpdir(),'honk-jog-browser-'));
const output=resolve('test-results/jog');await mkdir(output,{recursive:true});
const service=await startServer({host:'127.0.0.1',port:0,plain:true,pairCode:'123456',dataRoot});
let chrome;
try {
  chrome=await launchChrome();await chrome.navigate(`http://127.0.0.1:${service.port}/`);
  await chrome.evaluate(`(async()=>{window.r=(await import('/src/main.js')).app.runtime;while(!r.tutorial.ready)await new Promise(resolve=>setTimeout(resolve,100));})()`);
  assert.equal(await chrome.evaluate(`document.querySelector('[data-action="record-jog"]').textContent`),'Record Raag Jog in mixed reality');
  await chrome.evaluate(`r.createSpawnedComponent('honk',{name:'Pre-mode free play'});r.activeInstrumentState.root.position.set(.25,1.2,-1);window.originalScene=r.sceneSerializer.serialize();document.querySelector('[data-action="record-jog"]').click()`);
  await chrome.evaluate(`new Promise(resolve=>setTimeout(resolve,50))`);
  assert.equal(await chrome.evaluate(`r.tutorial.jogRecording.phase`),'unprepared');
  // Explicit synthetic fixture: real app, instruments, Web Audio, recorder,
  // worker and receiver; no claim of XR hardware/controller verification.
  await chrome.evaluate(`(async()=>{
    window.mode=r.tutorial.jogRecording;mode.trackingReady=()=>true;
    // SwiftShader renders the full ensemble on CPU; lower raster resolution
    // while retaining every production instrument, scheduler and capture path.
    r.renderer.setPixelRatio(.3);
    const start=r.capture.startReady.bind(r.capture);r.capture.startReady=options=>start({...options,synthetic:true});
    await r.capture.pair('123456');await mode.action('prepare');
  })()`);
  let state=await chrome.evaluate(`({phase:mode.phase,feedback:mode.feedback,count:r.instrumentRegistry.size})`);console.log('Prepared',state);assert.equal(state.phase,'ready');
  const panelReach=await chrome.evaluate(`(async()=>{const THREE=await import('three'),host=r.tutorial,panel=host.panel;panel.setXR(true,r.camera);host.placeRecordingPanel();host.render(performance.now());const origin=r.camera.getWorldPosition(new THREE.Vector3());const actions=panel.buttons.filter(b=>b.visible).map(b=>{const position=b.getWorldPosition(new THREE.Vector3()),delta=position.clone().sub(origin),ray=new THREE.Raycaster(origin,delta.clone().normalize(),0,2.5);return {action:b.userData.action,distance:delta.length(),hit:panel.hit(ray)?.object.userData.action};});panel.setXR(false);return actions;})()`);
  assert.ok(panelReach.every(b=>b.action===b.hit&&b.distance<2.5));
  const prepared=await chrome.evaluate(`(()=>{const a=r.tutorial.adapter;return {valid:mode.ensemble.validate(),roles:[...a.roles],loopers:['chordLooper','percussionLooper','alternativeLooper'].map(role=>({role,timeline:a.get(role).timeline.toJSON(),playing:a.get(role).transport.playing})),virtuals:a.virtuals.some(v=>v.visible)};})()`);
  assert.equal(prepared.virtuals,false);assert.ok(prepared.loopers.every(l=>!l.playing&&l.timeline.durationMs===12000));
  await chrome.evaluate(`r.tutorial.adapter.get('melody-C4').root.position.x+=.12;window.layoutBefore=r.sceneSerializer.serialize().instruments.map(i=>i.transform);mode.action('start')`);
  state=await chrome.evaluate(`({phase:mode.phase,feedback:mode.feedback})`);console.log('Started',state);assert.equal(state.phase,'count-in');
  await chrome.evaluate(`Promise.all([mode.action('restart'),mode.action('restart'),mode.action('start')])`);
  const second=await chrome.evaluate(`({id:r.capture.metadata.id,phase:mode.phase,attempt:mode.attempt,feedback:mode.feedback})`);console.log('Restarted',second);assert.equal(second.attempt,2);assert.equal(second.phase,'count-in');
  await chrome.evaluate(`new Promise((resolve,reject)=>{const start=performance.now(),timer=setInterval(()=>{if(mode.phase==='performing'){clearInterval(timer);resolve();}else if(performance.now()-start>12000){clearInterval(timer);reject(new Error(mode.phase+': '+mode.feedback));}},50);})`);
  const music=await chrome.evaluate(`['chordLooper','percussionLooper','alternativeLooper'].map(role=>{const h=r.tutorial.adapter.get(role);return {role,playing:h.transport.playing,beat:h.looperData.clockPlaybackStartBeatPosition,launch:h.looperData.launchHistory.at(-1)};})`);
  assert.deepEqual(music.map(m=>m.playing),[true,true,false]);assert.ok(Math.abs(music[0].launch.audioOriginTime-music[1].launch.audioOriginTime)<1e-9);
  const guidance=await chrome.evaluate(`(()=>{const now=performance.now(),guide=mode.guidance(now),rings=r.tutorial.cues.pool.flatMap(p=>Object.values(p));return {anchor:guide?.anchorMs,beatZero:mode.anchor.beatZero,beat:guide?.beatAt(now),model:mode.model(now),visibleRings:rings.filter(n=>n.visible).length,capturedRings:rings.filter(n=>r.capture.presentation.ids.has(n)).length,lesson:r.tutorial.session,virtuals:r.tutorial.adapter.virtuals.some(v=>v.visible),layout:r.tutorial.panel.layout};})()`);
  assert.equal(guidance.anchor,guidance.beatZero);assert.ok(guidance.visibleRings>0);assert.equal(guidance.capturedRings,0);
  assert.equal(guidance.lesson,null);assert.equal(guidance.virtuals,false);assert.match(guidance.model.instruction,/squeeze Trigger/);assert.match(guidance.model.feedback,/Next:/);
  assert.ok(guidance.layout.every(region=>region.bottom<=region.limit));
  const screenshot=await chrome.send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'performing.png'),Buffer.from(screenshot.data,'base64'));
  await chrome.evaluate(`r.pressLooperButton(r.tutorial.adapter.get('alternativeLooper'),'play',null,performance.now(),'learner')`);
  assert.equal(await chrome.evaluate(`r.tutorial.adapter.get('alternativeLooper').looperData.queued`),true);
  await chrome.evaluate(`mode.action('restart')`);
  assert.equal(await chrome.evaluate(`mode.attempt`),3);
  const layoutChanges=await chrome.evaluate(`r.sceneSerializer.serialize().instruments.flatMap((item,i)=>Object.entries(item.transform).flatMap(([key,values])=>values.some((v,j)=>Math.abs(v-layoutBefore[i][key][j])>1e-6)?[{id:item.id,key,before:layoutBefore[i][key],after:values}]:[]))`);assert.deepEqual(layoutChanges,[]);
  assert.equal(await chrome.evaluate(`['chordLooper','percussionLooper','alternativeLooper'].some(role=>r.tutorial.adapter.get(role).looperData.queued)`),false);
  await chrome.evaluate(`mode.action('stop')`);assert.equal(await chrome.evaluate(`mode.phase`),'ready');
  assert.equal(await chrome.evaluate(`r.tutorial.cues.pool.some(p=>Object.values(p).some(n=>n.visible))`),false);
  const takes=await service.store.list();assert.equal(takes.length,3);assert.equal(new Set(takes.map(t=>t.id)).size,3);
  assert.deepEqual(takes.map(t=>t.performance.completionAction),['stopped','restarted','restarted']);
  assert.ok(takes.every(t=>t.complete),JSON.stringify(takes.map(t=>({label:t.performance.label,reason:t.reason,gaps:t.gaps}))));
  for(const take of takes) {
    const events=await chrome.evaluate(`fetch('/api/takes/${take.id}/events.ndjson').then(r=>r.text())`);
    // Server exposes stream files through the ordinary take route.
    const syncs=events.split('\n').filter(line=>line&&JSON.parse(line).data.kind==='sync');assert.equal(syncs.length,1);
    assert.ok(!events.includes('Tutorial timing ring'),'Guidance rings must be absent from stored composite data');
  }
  const performed=takes.find(t=>t.performance.performanceStart!=null);const pcm=await readFile(join(dataRoot,performed.id,'audio.pcm'));
  const peakAt=(start,length)=>{let peak=0;for(let i=Math.max(0,Math.floor(start*performed.audio.sampleRate))*4;i<Math.min(pcm.length,(start+length)*performed.audio.sampleRate*4);i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i)));return peak;};
  assert.ok(peakAt(performed.performance.sync.sceneTime,.32)>100);
  for(let beat=0;beat<4;beat++)assert.ok(peakAt(performed.performance.performanceStart-3+beat*.75,.15)>100,'Captured count-in '+beat);
  assert.ok(peakAt(performed.performance.performanceStart,.3)>100,'Captured backing onset');
  await chrome.evaluate(`mode.action('exit')`);assert.equal(await chrome.evaluate(`r.sessionMode`),'play');
  assert.equal(await chrome.evaluate(`JSON.stringify(r.sceneSerializer.serialize().instruments)===JSON.stringify(originalScene.instruments)`),true);
  await chrome.navigate(`http://127.0.0.1:${service.port}/capture/`);
  await chrome.evaluate(`new Promise(resolve=>{const timer=setInterval(()=>{if(window.captureEditor){clearInterval(timer);resolve();}},50);})`);
  await chrome.evaluate(`new Promise((resolve,reject)=>{const start=performance.now(),timer=setInterval(()=>{if(document.querySelector('#takes').options.length===4){clearInterval(timer);resolve();}else if(performance.now()-start>10000){clearInterval(timer);reject(new Error('Take list did not load'));}},50);})`);
  const labels=await chrome.evaluate(`Array.from(document.querySelector('#takes').options).map(o=>o.textContent)`);assert.ok(labels.some(s=>s.includes('Raag Jog — Take 01')&&s.includes('restarted')));
  for(const take of takes)await chrome.evaluate(`(async()=>{await captureEditor.loadTake('${take.id}');await captureEditor.seek(${take.performance.sync.sceneTime});if(!captureEditor.replay.nodes.size)throw new Error('Empty replay');})()`);
  await chrome.evaluate(`captureEditor.loadTake('${second.id}')`);
  const archive=await chrome.evaluate(`(async()=>{const blob=await fetch('/api/takes/${second.id}/archive').then(r=>r.blob());return fetch('/api/import',{method:'POST',body:blob}).then(r=>r.json());})()`);
  const imported=(await service.store.load(archive.id)).metadata;assert.equal(imported.performance.label,'Raag Jog — Take 02');assert.equal(imported.complete,true);
  assert.deepEqual(chrome.errors,[]);
  await writeFile(join(output,'report.json'),JSON.stringify({synthetic:true,panelReach,prepared,music,guidance,takes,labels,archive},null,2));
  console.log(`Passed: ${output}/report.json`);
}catch(error){console.error('Take diagnostics',JSON.stringify((await service.store.list()).map(t=>({id:t.id,performance:t.performance,reason:t.reason,gaps:t.gaps,metrics:t.metrics}))));throw error;}finally{await chrome?.close();await service.close();await rm(dataRoot,{recursive:true,force:true});}
