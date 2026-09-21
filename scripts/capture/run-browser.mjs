import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile,stat } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startServer } from './server.mjs';
import { launchChrome } from './chrome.mjs';
import { generateDemo } from './demo.mjs';
import { checkAlignment } from './check-alignment.mjs';
import { checkScrubbing } from './check-scrubbing.mjs';
import { checkFrameMatching } from './check-frame-matching.mjs';
import { checkRayStyle, checkRayExportParity } from './check-ray-style.mjs';
const output=resolve('test-results/capture');await mkdir(output,{recursive:true});
const service=await startServer({host:'127.0.0.1',port:0,plain:true,pairCode:'123456'}),chrome=await launchChrome();
const base=`http://127.0.0.1:${service.port}`;
try {
  let interrupted=false;
  const disconnectTimer=setInterval(()=>{for(const [id,take] of service.store.takes)if(!interrupted&&take.last.samples>=35&&take.metadata.status==='recording'){service.disconnectTake(id);interrupted=true;clearInterval(disconnectTimer);console.log('Forced one capture connection interruption; verifying automatic resume.');}},100);
  disconnectTimer.unref();
  const demo=await generateDemo({service,chrome,output});
  clearInterval(disconnectTimer);assert.equal(interrupted,true);
  await chrome.navigate(`${base}/capture/`);
  await chrome.evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.captureEditor){clearInterval(timer);resolve();}else if(++n>200){clearInterval(timer);reject(new Error('Editor did not load'));}},50);})`);
  assert.equal(await chrome.evaluate(`document.getElementById('preview-guides').checked&&document.getElementById('preview-rays').checked`),true,'Controller spheres and rays default on');
  await chrome.evaluate(`captureEditor.loadTake(${JSON.stringify(demo.id)})`);
  const document=await chrome.send('DOM.getDocument');const input=await chrome.send('DOM.querySelector',{nodeId:document.root.nodeId,selector:'#video-file'});
  await chrome.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[join(output,'phone.webm')]});
  await chrome.evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{const v=document.getElementById('video');if(v.readyState>=2&&Number.isFinite(v.duration)){clearInterval(timer);resolve();}else if(++n>200){clearInterval(timer);reject(new Error(document.getElementById('notice').textContent));}},50);})`);
  await chrome.evaluate(`captureEditor.setProject(${JSON.stringify(demo.project)})`);
  const report=await chrome.evaluate(`(async()=>{
    const ed=captureEditor, {fitCamera}=await import('/src/capture/calibration.js');
    const fit=fitCamera(ed.project.observations);if(!fit.valid||fit.heldOutRms>.01)throw new Error('Synthetic camera calibration failed');ed.setProject({camera:fit.camera,calibration:fit});
    await ed.seek(.7);const first=JSON.stringify(ed.timeline.seek(.7));await ed.seek(1.4);await ed.seek(.7);if(first!==JSON.stringify(ed.timeline.seek(.7)))throw new Error('Nondeterministic seek');
    const count=ed.replay.nodes.size,drawCalls=ed.replay.renderer?.info?.render?.calls;
    return {fit,deterministic:true,nodeCount:count,drawCalls,frames:ed.timeline.frames.length,duration:ed.timeline.duration};
  })()`);
  assert.ok(report.nodeCount>20);assert.ok(report.frames>=100);
  report.presentationRoundTrip=await chrome.evaluate(`(async()=>{
    const ed=captureEditor,snapshots=${JSON.stringify(demo.sampleSnapshots)};
    const root=[...ed.replay.nodes].find(([,node])=>node.name==='Synthetic bent Honk'&&!node.userData.capture.parent);
    const child=[...ed.replay.nodes].find(([,node])=>node.name==='HonkPresentation'&&node.userData.capture.parent===root[0]);
    for(const sample of snapshots){const frame=ed.timeline.seek(sample.t);for(let i=0;i<3;i++){if(Math.abs(frame.nodes[root[0]].x[7+i]-sample.honkScale[i])>1e-5)throw new Error('Root scale roundtrip');if(Math.abs(frame.nodes[child[0]].x[7+i]-sample.childScale[i])>1e-5)throw new Error('Child animation roundtrip');if(Math.abs(frame.xr.controllers[0].grip.p[i]-sample.left[i])>1e-5)throw new Error('Grip roundtrip');}}
    const events=ed.timeline.events;if(!events.some(e=>e.data.kind==='state'&&e.data.entities.some(entity=>entity.transport?.playing)))throw new Error('Already-playing Looper state missing');
    if(!events.some(e=>e.data.kind==='state'&&e.data.entities.some(entity=>entity.locked)))throw new Error('Locked state missing');
    if(!events.some(e=>e.data.kind==='delete'))throw new Error('Deletion missing');
    if(!ed.timeline.frames.some(frame=>Object.values(frame.nodes).some(node=>node.wire?.plan.segments.length)))throw new Error('Procedural wire missing');
    return {snapshots:snapshots.length,rootScale:true,childAnimation:true,grip:true,playingLooper:true,locked:true,spawnDelete:true,wires:true};
  })()`);
  report.reconnectRecovered=interrupted;
  console.log('Checking continuous forward/backward timeline scrubbing…');
  report.scrubbing=await checkScrubbing(chrome);
  console.log('Checking camera handles, orbit isolation, undo, saved frames and project download…');
  report.alignment=await checkAlignment({chrome,output});
  console.log('Matching controllers in decoded video frames and refining the fixed camera…');
  report.frameMatching=await checkFrameMatching(chrome);
  console.log('Checking live ray color, opacity and length controls…');
  report.rayStyle=await checkRayStyle(chrome);
  const savedProject=await chrome.evaluate('captureEditor.project');await writeFile(join(output,'reopen.json'),JSON.stringify(savedProject));
  await chrome.navigate(`${base}/capture/`);
  await chrome.evaluate(`new Promise(resolve=>{const timer=setInterval(()=>{if(window.captureEditor){clearInterval(timer);resolve();}},50);})`);
  const reopenedDocument=await chrome.send('DOM.getDocument');
  const projectInput=await chrome.send('DOM.querySelector',{nodeId:reopenedDocument.root.nodeId,selector:'#load-project'});
  await chrome.send('DOM.setFileInputFiles',{nodeId:projectInput.nodeId,files:[join(output,'reopen.json')]});
  await chrome.evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(captureEditor.project.video?.name){clearInterval(timer);resolve();}else if(++n>300){clearInterval(timer);reject(new Error(document.getElementById('notice').textContent));}},50);})`);
  const reopenedVideo=await chrome.send('DOM.querySelector',{nodeId:reopenedDocument.root.nodeId,selector:'#video-file'});
  await chrome.send('DOM.setFileInputFiles',{nodeId:reopenedVideo.nodeId,files:[join(output,'phone.webm')]});
  await chrome.evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.getElementById('video').readyState>=2){clearInterval(timer);resolve();}else if(++n>200){clearInterval(timer);reject(new Error(document.getElementById('notice').textContent));}},50);})`);
  const restored=await chrome.evaluate('({trim:captureEditor.project.trim,camera:captureEditor.project.camera,mapping:captureEditor.project.mapping,bookmarks:captureEditor.project.bookmarks,frameMatches:captureEditor.project.frameMatches,layers:captureEditor.project.layers,rayStyle:captureEditor.project.rayStyle})');
  assert.deepEqual(restored,{trim:savedProject.trim,camera:savedProject.camera,mapping:savedProject.mapping,bookmarks:savedProject.bookmarks,frameMatches:savedProject.frameMatches,layers:savedProject.layers,rayStyle:savedProject.rayStyle});report.projectReopen=true;
  assert.deepEqual(await chrome.evaluate(`['ray-left-color','ray-right-color','ray-opacity','ray-length'].map(id=>document.getElementById(id).value)`),['#ff00ff','#00ffff','0.42','2.1']);
  const legacyProject={...savedProject};delete legacyProject.bookmarks;delete legacyProject.frameMatches;delete legacyProject.frameFit;delete legacyProject.rayStyle;
  await writeFile(join(output,'legacy-project.json'),JSON.stringify(legacyProject));
  await chrome.send('DOM.setFileInputFiles',{nodeId:projectInput.nodeId,files:[join(output,'legacy-project.json')]});
  await chrome.evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(captureEditor.project.bookmarks.length===0){clearInterval(timer);resolve();}else if(++n>100){clearInterval(timer);reject(new Error('Legacy project not restored'));}},50);})`);
  assert.deepEqual(await chrome.evaluate('captureEditor.project.camera'),savedProject.camera);report.alignment.legacyProject=true;
  assert.deepEqual(await chrome.evaluate('captureEditor.project.rayStyle'),report.rayStyle.defaults);report.rayStyle.legacyDefaults=true;
  await chrome.send('DOM.setFileInputFiles',{nodeId:projectInput.nodeId,files:[join(output,'reopen.json')]});
  await chrome.evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(captureEditor.project.bookmarks.length===${savedProject.bookmarks.length}){clearInterval(timer);resolve();}else if(++n>100){clearInterval(timer);reject(new Error('Saved frames not restored'));}},50);})`);
  await chrome.evaluate('captureEditor.seek(.7)');
  const image=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,'editor.png'),Buffer.from(image.data,'base64'));
  // Model a decoder delivering its presentation notification before its public
  // readyState becomes drawable. Every exported frame must wait through this.
  await chrome.evaluate(`(()=>{
    const video=document.getElementById('video'),request=video.requestVideoFrameCallback.bind(video);
    const ready=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'readyState').get;
    window.decodeCheck={delays:0,blocked:false};
    Object.defineProperty(video,'readyState',{configurable:true,get(){return decodeCheck.blocked?1:ready.call(video);}});
    video.requestVideoFrameCallback=fn=>request((now,meta)=>{
      if(!decodeCheck.blocked){decodeCheck.blocked=true;decodeCheck.delays++;requestAnimationFrame(()=>requestAnimationFrame(()=>{decodeCheck.blocked=false;video.dispatchEvent(new Event('loadeddata'));}));}
      fn(now,meta);
    });
    window.restoreVideoReadiness=()=>{delete video.readyState;delete video.requestVideoFrameCallback;};
  })()`);
  console.log(`Replay loaded ${report.nodeCount} presentation nodes. Exporting deterministic frames…`);
  const exported=await chrome.evaluate('captureEditor.exportProject()');assert.equal(exported.frames,60);assert.equal(exported.timestamps.length,60);
  report.decodeReadiness=await chrome.evaluate('({delays:decodeCheck.delays})');assert.ok(report.decodeReadiness.delays>0);await chrome.evaluate('restoreVideoReadiness()');
  report.rayStyle.exportParity=await checkRayExportParity(chrome,exported);
  if(exported.ffmpeg)report.decodeReadiness.phoneBackgroundFrames=await chrome.evaluate(`(async()=>{
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');let checked=0;
    for(let i=0;i<${exported.frames};i++){
      const image=new Image();image.src='/api/exports/${exported.id}/frame-'+String(i).padStart(6,'0')+'.png';await image.decode();canvas.width=image.width;canvas.height=image.height;ctx.drawImage(image,0,0);
      const pixel=ctx.getImageData(3,Math.floor(image.height*.2),1,1).data;
      if(![207,203,189].every((value,j)=>Math.abs(pixel[j]-value)<10))throw new Error('Phone background missing in exported frame '+i+': '+[...pixel]);checked++;
    }return checked;
  })()`);
  const exportDir=resolve('captures/exports',exported.id);
  const wav=await readFile(join(exportDir,'audio.wav'));let peak=0;for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));assert.ok(peak>100);report.cleanAudioPeak=peak;
  if(exported.ffmpeg){const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',join(exportDir,'composite.mp4')],{encoding:'utf8'}));const video=info.streams.find(s=>s.codec_type==='video'),audio=info.streams.find(s=>s.codec_type==='audio');assert.equal(video.width,270);assert.equal(video.height,480);assert.equal(Number(video.nb_frames),60);assert.equal(audio.codec_name,'aac');report.ffprobe=info;}
  await chrome.evaluate('captureEditor.setProject({output:{width:1080,height:1920,fps:60},trim:{start:.3,end:.4}})');
  const fullResolution=await chrome.evaluate('captureEditor.exportProject()');assert.equal(fullResolution.frames,6);
  const fullInfo=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',resolve('captures/exports',fullResolution.id,'composite.mp4')],{encoding:'utf8'}));
  const fullVideo=fullInfo.streams.find(s=>s.codec_type==='video');assert.equal(fullVideo.width,1080);assert.equal(fullVideo.height,1920);assert.equal(fullVideo.r_frame_rate,'60/1');assert.equal(Number(fullVideo.nb_frames),6);report.fullResolution={...fullResolution,probe:fullVideo};
  // Exercise real portable export + import, not just metadata serialization.
  const archive=await chrome.evaluate(`(async()=>{const blob=await fetch('/api/takes/${demo.id}/archive').then(r=>r.blob());const result=await fetch('/api/import',{method:'POST',body:blob}).then(r=>r.json());if(!result.id)throw new Error(JSON.stringify(result));await captureEditor.loadTake(result.id);return {id:result.id,bytes:blob.size,nodes:captureEditor.replay.nodes.size};})()`);
  assert.equal(archive.nodes,report.nodeCount);
  assert.deepEqual(await chrome.evaluate('captureEditor.project.bookmarks'),[]);report.alignment.differentTakeClearsBookmarks=true;
  await chrome.evaluate(`(async()=>{
    await captureEditor.seek(.7);await document.getElementById('save-frame').onclick();document.getElementById('cancel-match').click();
    const input=document.getElementById('video-file'),transfer=new DataTransfer();
    transfer.items.add(new File([input.files[0]],'different-phone.webm',{type:input.files[0].type}));input.files=transfer.files;await input.onchange({target:input});
  })()`);
  assert.deepEqual(await chrome.evaluate('captureEditor.project.bookmarks'),[]);report.alignment.differentVideoClearsBookmarks=true;
  const previousFFmpeg=process.env.FFMPEG;process.env.FFMPEG='/nonexistent-honk-encoder';
  await chrome.evaluate(`captureEditor.setProject({...${JSON.stringify(demo.project)},takeId:${JSON.stringify(archive.id)},trim:{start:.3,end:.4},layers:{...${JSON.stringify(demo.project.layers)},controllers:true,controllerRays:true,headset:true}});document.getElementById('rotate-camera').click()`);
  const fallback=await chrome.evaluate('captureEditor.exportProject()');assert.equal(fallback.ffmpeg,false);assert.equal(fallback.frames,3);
  report.rayStyle.transparentExportParity=await checkRayExportParity(chrome,fallback);
  const transparency=await chrome.evaluate(`(async()=>{const image=new Image();image.src='/api/exports/${fallback.id}/frame-000000.png';await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let visible=0,transparent=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i])visible++;else transparent++;}return {visible,transparent};})()`);
  assert.ok(transparency.visible>0);assert.ok(transparency.transparent>transparency.visible);report.fallback={...fallback,transparency};
  // Actual exported PNGs must be identical with every calibration helper on/off.
  await chrome.evaluate(`captureEditor.setProject({layers:{...captureEditor.project.layers,controllers:false,headset:false}});captureEditor.inspector.helpers.visible=false;document.getElementById('inspect-scene').click()`);
  const withoutGuides=await chrome.evaluate('captureEditor.exportProject()');
  for(let i=0;i<3;i++){
    const name=`frame-${String(i).padStart(6,'0')}.png`;
    assert.deepEqual(await readFile(resolve('captures/exports',fallback.id,name)),await readFile(resolve('captures/exports',withoutGuides.id,name)),`Helpers must not change exported ${name}`);
  }
  report.alignment.exportHelperPixelEquality=true;
  // Controller rays are an explicit output layer; hiding them must change real
  // exported frames, independently of the preview-only sphere/headset helpers.
  await chrome.evaluate(`captureEditor.setProject({layers:{...captureEditor.project.layers,controllerRays:false}})`);
  const withoutRays=await chrome.evaluate('captureEditor.exportProject()');
  for(let i=0;i<3;i++){
    const name=`frame-${String(i).padStart(6,'0')}.png`;
    assert.notDeepEqual(await readFile(resolve('captures/exports',fallback.id,name)),await readFile(resolve('captures/exports',withoutRays.id,name)),`Controller rays must appear in exported ${name}`);
  }
  report.alignment.controllerRaysExport=true;
  const tarBase64=await chrome.evaluate(`(async()=>{const blob=await fetch('/api/exports/${fallback.id}/archive.tar').then(r=>r.blob());return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});})()`);
  await writeFile(join(output,'fallback-frames.tar'),Buffer.from(tarBase64,'base64'));
  const entries=execFileSync('tar',['-tf',join(output,'fallback-frames.tar')],{encoding:'utf8'}).trim().split('\n');assert.equal(entries.filter(n=>n.endsWith('.png')).length,3);assert.ok(entries.includes('audio.wav'));report.fallback.archiveEntries=entries;
  if(previousFFmpeg===undefined)delete process.env.FFMPEG;else process.env.FFMPEG=previousFFmpeg;
  const external=chrome.network.filter(url=>/^https?:/.test(url)&&!url.startsWith(base));assert.deepEqual(external,[]);
  assert.deepEqual(chrome.errors,[]);
  report.export=exported;report.archive=archive;report.captureMetrics=demo.metrics;report.heapBefore=demo.heapBefore;report.heapBytes=demo.heapBytes;report.externalRequests=external;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(`Passed: ${output}/report.json\nScreenshot: ${output}/editor.png`);
}finally{await chrome.close();await service.close();}
